'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyMidsceneError,
  I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR,
  locatorMatchesExpected,
  mapModelCenterToViewport,
  observeTargetWithMidscene,
  executePlaywrightClick,
  genericActionTerms,
  withMidsceneLocateTimeout,
  I10_MIDSCENE_LOCATE_TIMEOUT_MS,
  I10_BROWSER_CLOSE_TIMEOUT_MS,
  closeWithinTimeout
} = require('../../worker/src/i10-midscene-candidate-authoring.cjs');

test('MiMo authoring uses a valid bounded Midscene screenshot divisor', () => {
  assert.equal(I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR, 2);
  assert.ok(Number.isFinite(I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR));
  assert.ok(I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR >= 1);
});

test('Midscene model-image coordinates are compared in the browser viewport', () => {
  const browserBox = { x: 208, y: 370.5, width: 434, height: 32 };
  // This is a representative MiMo location from a 1440x900 login page sent
  // through Midscene with the configured 2x image divisor.
  assert.equal(locatorMatchesExpected({ center: [206, 184] }, browserBox, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR), true);
  assert.equal(locatorMatchesExpected({ center: [20, 20] }, browserBox, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR), false);
  assert.deepEqual(mapModelCenterToViewport({ center: [206, 184] }, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR), [412, 368]);
});

test('compact header avatar accepts only its bounded adjacent user-menu region', () => {
  const avatar = { x: 1312.4375, y: 20.5, width: 34, height: 34 };
  const visualPoint = { center: [687, 21] };
  assert.equal(locatorMatchesExpected(visualPoint, avatar, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR), false);
  assert.equal(locatorMatchesExpected(visualPoint, avatar, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR, 'HEADER_AVATAR'), true);
  assert.equal(locatorMatchesExpected({ center: [720, 21] }, avatar, I10_MIDSCENE_SCREENSHOT_SHRINK_FACTOR, 'HEADER_AVATAR'), false);
});

test('historical display-name prompts do not hardcode a fixture identity', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../../harness/src/context-envelope.ts'), 'utf8');
  assert.match(source, /normalizeMidscenePromptEnvelope/);
  assert.match(source, /当前已登录客户姓名文本/);
  assert.doesNotMatch(source, /姓名“张三”/);
});

test('authoring isolates every Midscene visual action instead of retaining screenshot history', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../../worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  assert.match(source, /const agent = createMidsceneAgent\(page\)/);
  assert.match(source, /await agent\.destroy\(\)\.catch/);
  assert.doesNotMatch(source, /agent \|\|= createMidsceneAgent/);
});

test('Midscene observation and Playwright click are separate exported operations', () => {
  assert.equal(typeof observeTargetWithMidscene, 'function');
  assert.equal(typeof executePlaywrightClick, 'function');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../../worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  const observeSource = source.slice(source.indexOf('async function observeTargetWithMidscene'), source.indexOf('async function observeUkeyVerificationControl'));
  assert.match(observeSource, /aiLocate/);
  assert.doesNotMatch(observeSource, /\.click\(/);
});

test('generic read-only list inspection anchors the visible business region rather than an invented list control', () => {
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '查看收款人列表'
  }), ['收款人']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '验证：收款人页面显示列表，姓名'
  }), ['收款人']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '验证账户掩码'
  }), ['账户']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '验证状态正确展示'
  }), ['状态']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '查询一份文档'
  }), ['文档']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '确认文档标题、日期和下载入口正确'
  }), ['文档']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '查看收款人列表'
  }), ['收款人列表']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '导航至个人资料页面'
  }), ['个人资料']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '进入账户详情页'
  }), ['账户详情']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '确认主页与个人资料页的姓名；确认头像一致'
  }), ['姓名']);
});

test('Midscene locator calls have a bounded worker-safe timeout', async () => {
  assert.equal(typeof withMidsceneLocateTimeout, 'function');
  assert.ok(I10_MIDSCENE_LOCATE_TIMEOUT_MS >= 5_000);
  assert.ok(I10_MIDSCENE_LOCATE_TIMEOUT_MS <= 90_000);
  assert.equal(await withMidsceneLocateTimeout(async () => 'located'), 'located');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../../worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  assert.match(source, /I10_MIDSCENE_MODEL_TIMEOUT/);
  assert.match(source, /withMidsceneLocateTimeout\(\(\) => agent\.aiLocate\(prompt\)\)/);
});

test('browser cleanup is bounded so a stuck Chromium close cannot retain a candidate lease', async () => {
  assert.equal(typeof closeWithinTimeout, 'function');
  assert.equal(I10_BROWSER_CLOSE_TIMEOUT_MS, 10_000);
  const startedAt = Date.now();
  await closeWithinTimeout(() => new Promise(() => {}), 20);
  assert.ok(Date.now() - startedAt >= 15);
  assert.ok(Date.now() - startedAt < 250);
});

test('portable visual configuration is mirrored to Midscene OpenAI transport keys', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../../worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  assert.match(source, /process\.env\.OPENAI_BASE_URL = visualBaseUrl/);
  assert.match(source, /process\.env\.OPENAI_API_KEY = visualApiKey/);
});

test('Midscene diagnostics classify parse errors without retaining raw content', () => {
  const error = Object.assign(new Error('failed to parse LLM response into JSON'), {
    name: 'AIResponseParseError',
    rawResponse: '{"secret":"must-not-be-retained"}'
  });
  const result = classifyMidsceneError(error);
  assert.equal(result.errorCode, 'I10_MIDSCENE_RESPONSE_SCHEMA_INVALID');
  assert.equal(result.stage, 'RESPONSE_PARSE');
  assert.equal(result.receivedModelContent, true);
  assert.equal(Object.hasOwn(result, 'rawResponse'), false);
  assert.equal(Object.hasOwn(result, 'message'), false);
});

test('Midscene diagnostics distinguish timeout, context and transport failures', () => {
  assert.equal(classifyMidsceneError(new Error('request timed out')).errorCode, 'I10_MIDSCENE_MODEL_TIMEOUT');
  assert.equal(classifyMidsceneError(Object.assign(new Error('request too long'), { status: 413 })).errorCode, 'I10_MIDSCENE_CONTEXT_LIMIT_EXCEEDED');
  assert.equal(classifyMidsceneError(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })).errorCode, 'I10_MIDSCENE_TRANSPORT_FAILED');
});
