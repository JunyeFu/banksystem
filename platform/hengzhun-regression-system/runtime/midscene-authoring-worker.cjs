'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const productRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'config', 'demo-runtime-freeze.json'), 'utf8'));
const harnessUrl = (process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '');
const portal = new URL(process.env.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082');
const workerToken = process.env.HENGZHUN_WORKER_TOKEN;
const workerId = process.env.HENGZHUN_AUTHORING_WORKER_ID || `authoring-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
const once = process.argv.includes('--once');
const sessions = new Map();

if (!['127.0.0.1', 'localhost'].includes(portal.hostname)) throw new Error('作者化 Worker 只允许本机被测地址。');
if (!workerToken || workerToken.length < 32) throw new Error('WORKER_TOKEN_MISSING');
process.env.MIDSCENE_RUN_DIR ||= path.join(productRoot, '.data', 'midscene-runs');

async function post(pathname, body) {
  const response = await fetch(`${harnessUrl}${pathname}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`HARNESS_${response.status}_${result.errorCode || 'ERROR'}`);
  return result;
}

function locatorFor(page, targetRef) {
  if (targetRef === 'LOGIN_USERNAME') return page.getByTestId('login-username');
  if (targetRef === 'LOGIN_SSO_TAB') return page.getByTestId('login-sso-tab');
  if (targetRef === 'LOGIN_SUBMIT') return page.getByTestId('login-submit');
  if (targetRef === 'PAGE') return page.locator('body');
  throw new Error('TARGET_REF_NOT_ALLOWLISTED');
}

async function sessionFor(browser, planId) {
  if (sessions.has(planId)) return sessions.get(planId);
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1024, height: 520 } });
  const page = await context.newPage();
  const tokenRequests = [];
  page.on('request', request => {
    try { if (new URL(request.url()).pathname.includes('/protocol/openid-connect/token')) tokenRequests.push(request.method()); } catch { }
  });
  await page.goto(new URL('/portal/login', portal).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByTestId('login-title').waitFor({ state: 'visible', timeout: 30000 });
  const session = { context, page, tokenRequests };
  sessions.set(planId, session);
  return session;
}

function centerInside(center, box) {
  return Boolean(center && box && center[0] >= box.x && center[0] <= box.x + box.width && center[1] >= box.y && center[1] <= box.y + box.height);
}

async function playwrightAction(page, action, marker) {
  const locator = locatorFor(page, action.targetRef);
  if (action.actionType === 'INPUT') await locator.fill(marker);
  else if (action.actionType === 'TAP') await locator.click();
  else if (action.actionType === 'SCROLL') await page.evaluate(() => window.scrollBy(0, 180));
}

async function executeClaim(browser, claim) {
  const { page, tokenRequests } = await sessionFor(browser, claim.planId);
  const action = claim.window.currentAction;
  const target = locatorFor(page, action.targetRef);
  const beforeScroll = await page.evaluate(() => window.scrollY);
  const marker = `i4-${claim.actionId.slice(-12)}`;
  let locatedCenter;
  let agent;
  try {
    if (action.riskLevel === 'HIGH') throw new Error('HIGH_RISK_REQUIRES_DEDICATED_FIXTURE');
    if (action.executionMode === 'MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY') {
      agent = new PlaywrightAgent(page);
      if (action.actionType === 'LOCATE') locatedCenter = (await agent.aiLocate(action.prompt)).center;
      else if (action.actionType === 'INPUT') await agent.aiInput(action.prompt, { value: marker, mode: 'replace' });
      else if (action.actionType === 'TAP') await agent.aiTap(action.prompt);
      else await agent.aiScroll(undefined, { direction: 'down', scrollType: 'once', distance: 180 });
    } else if (action.executionMode === 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE') {
      agent = new PlaywrightAgent(page);
      locatedCenter = (await agent.aiLocate(action.prompt)).center;
      const box = await target.boundingBox();
      if (!centerInside(locatedCenter, box)) throw new Error('MIDSCENE_LOCATE_AMBIGUOUS');
      await playwrightAction(page, action, marker);
    } else if (action.executionMode === 'PLAYWRIGHT_ONLY') {
      await playwrightAction(page, action, marker);
    } else {
      throw new Error('EXECUTION_MODE_NOT_ALLOWLISTED');
    }

    const box = await target.boundingBox();
    const currentUrl = new URL(page.url());
    const dom = await target.count() === 1 && Boolean(box)
      && (action.actionType !== 'LOCATE' || action.executionMode === 'PLAYWRIGHT_ONLY' || centerInside(locatedCenter, box));
    const url = currentUrl.origin === portal.origin && currentUrl.pathname.startsWith('/portal/');
    const request = tokenRequests.length === 0;
    let business = dom;
    if (action.actionType === 'INPUT') business = await target.inputValue() === marker;
    else if (action.actionType === 'TAP' && action.targetRef === 'LOGIN_SSO_TAB') {
      business = await page.getByTestId('login-title').innerText() === '统一身份认证登录';
    } else if (action.actionType === 'SCROLL') business = await page.evaluate(() => window.scrollY) > beforeScroll;
    const verification = { dom, url, request, business };
    const passed = Object.values(verification).every(Boolean);
    return post(`/internal/worker/authoring/${encodeURIComponent(claim.taskId)}/actions:complete`, {
      workerId, slotId: claim.slotId, outcome: passed ? 'VERIFIED_PASSED' : 'AMBIGUOUS',
      summary: passed ? 'Midscene 动作已由 Playwright 独立验证。' : 'Playwright 独立验证未形成唯一通过结论。',
      pageState: { route: currentUrl.pathname, targetRef: action.targetRef, redacted: true }, verification
    });
  } catch (error) {
    return post(`/internal/worker/authoring/${encodeURIComponent(claim.taskId)}/actions:complete`, {
      workerId, slotId: claim.slotId, outcome: 'FAILED',
      summary: `作者化动作失败：${error instanceof Error ? error.name : 'UnknownError'}。`,
      pageState: { route: new URL(page.url()).pathname, targetRef: action.targetRef, redacted: true },
      verification: { dom: false, url: true, request: tokenRequests.length === 0, business: false }
    });
  } finally {
    if (agent) await agent.destroy().catch(() => undefined);
  }
}

async function main() {
  for (const name of ['MIDSCENE_MODEL_NAME', 'MIDSCENE_MODEL_BASE_URL', 'MIDSCENE_MODEL_API_KEY', 'MIDSCENE_MODEL_FAMILY']) {
    if (!process.env[name]) throw new Error(`${name}_MISSING`);
  }
  const browser = await chromium.launch({ headless: true, executablePath: path.join(__dirname, manifest.chromium.executable) });
  try {
    do {
      const claim = await post('/internal/worker/authoring:claim', { workerId });
      if (claim.status === 'CLAIMED') {
        const result = await executeClaim(browser, claim);
        process.stdout.write(JSON.stringify({ event: 'authoring_action_completed', taskId: claim.taskId, status: result.status }) + '\n');
      }
      if (once) break;
      await new Promise(resolve => setTimeout(resolve, claim.status === 'CLAIMED' ? 250 : 1500));
    } while (true);
  } finally {
    for (const session of sessions.values()) await session.context.close().catch(() => undefined);
    await browser.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'authoring_worker_failed', errorClass: error instanceof Error ? error.name : 'UnknownError' }) + '\n');
  process.exitCode = 1;
});
