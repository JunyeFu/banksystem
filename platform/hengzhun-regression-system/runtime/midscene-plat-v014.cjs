'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const productRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'config', 'demo-runtime-freeze.json'), 'utf8'));
const portal = new URL(process.env.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082');
if (!['127.0.0.1', 'localhost'].includes(portal.hostname)) throw new Error('PLAT-V014 只允许本机被测地址。');
const repeatCount = Math.max(2, Number(process.env.HENGZHUN_PLAT_V014_REPEATS || 2));
const viewports = [
  { width: 1024, height: 520 }, { width: 1180, height: 560 }, { width: 1280, height: 600 },
  { width: 1366, height: 640 }, { width: 1440, height: 680 }
];
const actionTypes = ['LOCATE', 'INPUT', 'TAP', 'SCROLL'];
const runId = `plat-v014-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
const outputPath = path.join(productRoot, '.data', 'evidence', 'plat-v014-live.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
process.env.MIDSCENE_RUN_DIR ||= path.join(productRoot, '.data', 'midscene-runs');

function resultBucket() {
  return { viewportCount: viewports.length, attemptCount: 0, passedCount: 0, failureCount: 0, falseSuccessCount: 0, durationsMs: [] };
}

const report = {
  schemaVersion: 'plat-v014-v1', runId, gateId: 'PLAT-V014', runtimeFreezeId: manifest.freezeId,
  modelFamily: process.env.MIDSCENE_MODEL_FAMILY, modelNameSha256: require('node:crypto').createHash('sha256').update(process.env.MIDSCENE_MODEL_NAME || '').digest('hex'),
  repeatCount, viewports, actions: Object.fromEntries(actionTypes.map(action => [action, resultBucket()])), passed: false
};

function persistCheckpoint() {
  report.updatedAt = new Date().toISOString();
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
}

async function openPage(browser, viewport) {
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport });
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => {
    try { if (new URL(request.url()).pathname.includes('/protocol/openid-connect/token')) requests.push(request.method()); } catch { }
  });
  await page.goto(new URL('/portal/login', portal).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByTestId('login-title').waitFor({ state: 'visible', timeout: 30000 });
  return { context, page, requests };
}

async function runAction(browser, viewport, actionType, repetition) {
  const bucket = report.actions[actionType];
  bucket.attemptCount += 1;
  const started = Date.now();
  const { context, page, requests } = await openPage(browser, viewport);
  const agent = new PlaywrightAgent(page);
  let midsceneReturned = false;
  try {
    let verified = false;
    if (actionType === 'LOCATE') {
      const located = await agent.aiLocate('红色的账号密码登录按钮');
      midsceneReturned = true;
      const box = await page.getByTestId('login-submit').boundingBox();
      const center = located?.center;
      verified = Boolean(box && center && center[0] >= box.x && center[0] <= box.x + box.width && center[1] >= box.y && center[1] <= box.y + box.height);
    } else if (actionType === 'INPUT') {
      const marker = `platv014-${viewport.width}-${repetition}`;
      await agent.aiInput('用户名或手机号输入框', { value: marker, mode: 'replace' });
      midsceneReturned = true;
      verified = await page.getByTestId('login-username').inputValue() === marker
        && new URL(page.url()).pathname === '/portal/login' && requests.length === 0;
    } else if (actionType === 'TAP') {
      await agent.aiTap('登录卡片上方的统一身份认证登录标签页，不是下方登录按钮');
      midsceneReturned = true;
      verified = await page.getByTestId('login-title').innerText() === '统一身份认证登录'
        && new URL(page.url()).pathname === '/portal/login' && requests.length === 0;
    } else {
      const before = await page.evaluate(() => window.scrollY);
      await agent.aiScroll(undefined, { direction: 'down', scrollType: 'once', distance: 180 });
      midsceneReturned = true;
      const after = await page.evaluate(() => window.scrollY);
      verified = after > before && new URL(page.url()).pathname === '/portal/login' && requests.length === 0;
    }
    if (verified) bucket.passedCount += 1;
    else {
      bucket.failureCount += 1;
      if (midsceneReturned) bucket.falseSuccessCount += 1;
    }
  } catch (error) {
    bucket.failureCount += 1;
    bucket.lastFailureClass = error instanceof Error ? error.name : 'UnknownError';
  } finally {
    bucket.durationsMs.push(Date.now() - started);
    await agent.destroy().catch(() => undefined);
    await context.close();
    persistCheckpoint();
  }
}

async function publishCapability(actionType, bucket) {
  const harness = process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788';
  const token = process.env.HENGZHUN_WORKER_TOKEN;
  if (!token) return;
  const response = await fetch(`${harness}/internal/worker/midscene-capabilities:record`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      actionType, viewportCount: bucket.viewportCount, attemptCount: bucket.attemptCount,
      failureCount: bucket.failureCount, falseSuccessCount: bucket.falseSuccessCount,
      verificationRef: `${runId}:${actionType}`
    })
  });
  if (!response.ok) throw new Error(`Harness capability record failed: ${response.status}`);
  const result = await response.json();
  bucket.harnessStatus = result.status;
  bucket.admittedToLowMediumExecution = Boolean(result.admittedToLowMediumExecution);
}

async function main() {
  for (const required of ['MIDSCENE_MODEL_NAME', 'MIDSCENE_MODEL_BASE_URL', 'MIDSCENE_MODEL_API_KEY', 'MIDSCENE_MODEL_FAMILY']) {
    if (!process.env[required]) throw new Error(`${required} 未配置。`);
  }
  const browser = await chromium.launch({ headless: true, executablePath: path.join(__dirname, manifest.chromium.executable) });
  try {
    for (const viewport of viewports) {
      for (let repetition = 1; repetition <= repeatCount; repetition += 1) {
        for (const actionType of actionTypes) await runAction(browser, viewport, actionType, repetition);
      }
    }
    report.passed = actionTypes.every(action => {
      const bucket = report.actions[action];
      return bucket.attemptCount >= viewports.length * 2 && bucket.failureCount === 0 && bucket.falseSuccessCount === 0;
    });
    for (const actionType of actionTypes) await publishCapability(actionType, report.actions[actionType]);
    report.routingSafe = actionTypes.every(action => {
      const bucket = report.actions[action];
      const eligible = bucket.attemptCount >= viewports.length * 2 && bucket.failureCount === 0 && bucket.falseSuccessCount === 0;
      return bucket.harnessStatus === (eligible ? 'VERIFIED' : 'DEGRADED')
        && bucket.admittedToLowMediumExecution === eligible;
    });
  } finally {
    report.completedAt = new Date().toISOString();
    persistCheckpoint();
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ gateId: report.gateId, runId, passed: report.passed, routingSafe: report.routingSafe, actions: Object.fromEntries(actionTypes.map(action => [action, {
    attempts: report.actions[action].attemptCount, failures: report.actions[action].failureCount,
    falseSuccesses: report.actions[action].falseSuccessCount, harnessStatus: report.actions[action].harnessStatus
  }])) }) + '\n');
  if (!report.routingSafe) process.exitCode = 1;
}

main().catch(error => {
  report.fatalErrorClass = error instanceof Error ? error.name : 'UnknownError';
  report.completedAt = new Date().toISOString();
  persistCheckpoint();
  process.stderr.write(JSON.stringify({ gateId: report.gateId, passed: false, errorClass: report.fatalErrorClass }) + '\n');
  process.exitCode = 1;
});
