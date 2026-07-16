'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const runtimeRoot = __dirname;
const projectRoot = path.resolve(runtimeRoot, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'config', 'demo-runtime-freeze.json'), 'utf8')
);
const targetUrl = new URL(process.env.SMOKE_TARGET_URL || 'http://127.0.0.1:18082/portal/login');
if (!['127.0.0.1', 'localhost'].includes(targetUrl.hostname)) {
  throw new Error(`Only local smoke-test targets are allowed: ${targetUrl.hostname}`);
}

const runId = `runtime-midscene-mimo-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
const outputDir = path.join(projectRoot, '.data', 'playwright', runId);
fs.mkdirSync(outputDir, { recursive: true });
process.env.MIDSCENE_RUN_DIR ||= path.join(projectRoot, '.data', 'midscene-runs');

const summary = {
  runId,
  freezeId: manifest.freezeId,
  runtimeRoot,
  node: process.version,
  targetUrl: targetUrl.href,
  model: process.env.MIDSCENE_MODEL_NAME || '<unset>',
  modelFamily: process.env.MIDSCENE_MODEL_FAMILY || '<unset>',
  passed: false,
};

async function main() {
  const startedAt = Date.now();
  const browser = await chromium.launch({
    headless: true,
    executablePath: path.join(runtimeRoot, manifest.chromium.executable),
  });

  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    const playwrightStartedAt = Date.now();
    await page.goto(targetUrl.href, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.getByText('复兴银行门户', { exact: false }).first().waitFor({ state: 'visible' });
    const loginButton = page.getByTestId('login-submit');
    await loginButton.waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'portal-login.png'), fullPage: true });
    const playwrightBox = await loginButton.boundingBox();
    if (!playwrightBox) throw new Error('Playwright could not resolve the login button bounding box');
    summary.playwright = {
      title: await page.title(),
      url: page.url(),
      loginButtonBox: playwrightBox,
      elapsedMs: Date.now() - playwrightStartedAt,
    };

    const agent = new PlaywrightAgent(page);
    const queryStartedAt = Date.now();
    const pageUnderstanding = await agent.aiQuery(
      '{bankName: string, pageType: string, loginMethods: string[]}, 识别当前页面的银行名称、页面类型和可见登录方式'
    );
    summary.midscene = {
      query: { result: pageUnderstanding, elapsedMs: Date.now() - queryStartedAt },
    };

    const assertStartedAt = Date.now();
    await agent.aiAssert('这是复兴银行门户的登录页面，并且提供账号密码登录方式');
    summary.midscene.assert = { passed: true, elapsedMs: Date.now() - assertStartedAt };

    const locateStartedAt = Date.now();
    const visualLocation = await agent.aiLocate('红色的账号密码登录按钮');
    summary.midscene.locate = { result: visualLocation, elapsedMs: Date.now() - locateStartedAt };

    const visualRect = visualLocation?.rect;
    if (!visualRect) throw new Error('Midscene did not return a login-button rectangle');
    const intersectionWidth = Math.max(
      0,
      Math.min(playwrightBox.x + playwrightBox.width, visualRect.left + visualRect.width)
        - Math.max(playwrightBox.x, visualRect.left)
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(playwrightBox.y + playwrightBox.height, visualRect.top + visualRect.height)
        - Math.max(playwrightBox.y, visualRect.top)
    );
    const intersectionArea = intersectionWidth * intersectionHeight;
    const unionArea = playwrightBox.width * playwrightBox.height
      + visualRect.width * visualRect.height
      - intersectionArea;
    const intersectionOverUnion = unionArea > 0 ? intersectionArea / unionArea : 0;
    summary.midscene.locate.playwrightIntersectionOverUnion = intersectionOverUnion;
    if (intersectionOverUnion < 0.5) {
      throw new Error(`Midscene and Playwright login-button boxes diverged: IoU=${intersectionOverUnion}`);
    }

    summary.passed = true;
    summary.elapsedMs = Date.now() - startedAt;
  } catch (error) {
    summary.error = error instanceof Error ? { name: error.name, message: error.message } : String(error);
    summary.elapsedMs = Date.now() - startedAt;
    throw error;
  } finally {
    fs.writeFileSync(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await browser.close();
  }

  console.log(JSON.stringify({
    passed: summary.passed,
    runId,
    freezeId: summary.freezeId,
    node: summary.node,
    model: summary.model,
    modelFamily: summary.modelFamily,
    outputDir,
    elapsedMs: summary.elapsedMs,
    playwrightIntersectionOverUnion: summary.midscene.locate.playwrightIntersectionOverUnion,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
