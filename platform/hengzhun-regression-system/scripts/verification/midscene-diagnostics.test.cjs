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
  genericEvidenceMatchesTerms,
  genericLocateInstruction,
  identityEvidenceMatches,
  requiresInteractiveLocator,
  withMidsceneLocateTimeout,
  I10_MIDSCENE_LOCATE_TIMEOUT_MS,
  I10_BROWSER_CLOSE_TIMEOUT_MS,
  closeWithinTimeout
} = require('../../worker/src/i10-midscene-candidate-authoring.cjs');

test('browser input operations require the model-selected interactive ancestor', () => {
  for (const operation of ['click', 'fill', 'select', 'check', 'upload', 'download']) {
    assert.equal(requiresInteractiveLocator({ operation }), true, operation);
  }
  for (const operation of ['expectVisible', 'goto', 'waitForURL', 'screenshot']) {
    assert.equal(requiresInteractiveLocator({ operation }), false, operation);
  }
});

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
  assert.match(source, /const agent = createMidsceneAgent\(page, agentOptions\)/);
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
    instruction: '查看收款人列表并核对姓名、账户掩码和状态'
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
    instruction: '确认交易日期可读；确认交易金额可读；确认交易状态清晰可读'
  }), ['交易日期']);
  assert.deepEqual(genericActionTerms({
    operation: 'select',
    instruction: '按近期交易筛选'
  }), ['近期交易']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '查询一份文档'
  }), ['文档']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '确认文档标题、日期和下载入口正确'
  }), ['文档']);
  assert.equal(genericEvidenceMatchesTerms({
    operation: 'expectVisible', instruction: '查询一份文档'
  }, '七月电子对账单'), true);
  assert.equal(genericEvidenceMatchesTerms({
    operation: 'expectVisible', instruction: '查询账户对账单'
  }, '七月电子对账单'), true);
  assert.equal(genericEvidenceMatchesTerms({
    operation: 'expectVisible', instruction: '核对收款人姓名、账户掩码和状态展示正确'
  }, '张三 收款人姓名 账户掩码 收款人状态'), true);
  assert.equal(genericEvidenceMatchesTerms({
    operation: 'expectVisible', instruction: '查询一份文档'
  }, '收款人管理'), false);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '确认标题日期下载入口正确'
  }), ['标题']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '确认文档下载入口正确'
  }), ['下载']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '点击文档下载入口'
  }), ['点击文档下载入口']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '查看收款人列表'
  }), ['收款人列表']);
  assert.deepEqual(genericActionTerms({
    operation: 'download',
    instruction: '核对文档标题、日期和下载入口'
  }), ['下载']);
  assert.match(genericLocateInstruction({
    operation: 'download',
    instruction: '核对文档标题、日期和下载入口'
  }), /不要定位文档标题/);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '导航至个人资料页面'
  }), ['个人资料']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '进入账户详情页'
  }), ['账户']);
  assert.deepEqual(genericActionTerms({
    operation: 'click',
    instruction: '进入转账汇款'
  }), ['转账']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '确认主页与个人资料页的姓名；确认头像一致'
  }), ['姓名']);
  assert.match(genericLocateInstruction({
    operation: 'expectVisible',
    instruction: '核对主页与个人资料页的姓名和头像'
  }), /个人资料内容卡中心/);
  assert.match(genericLocateInstruction({
    operation: 'expectVisible',
    instruction: '核对主页与个人资料页的姓名和头像'
  }), /不要定位顶部导航栏/);
  assert.match(genericLocateInstruction({
    operation: 'expectVisible',
    instruction: '查看主页显示的姓名和头像'
  }), /主页身份区只读观察/);
  assert.match(genericLocateInstruction({
    operation: 'expectVisible',
    instruction: '查看主页显示的姓名和头像'
  }), /不要定位页面中央欢迎卡/);
  assert.equal(identityEvidenceMatches({
    operation: 'expectVisible', instruction: '核对主页与个人资料页的姓名和头像'
  }, { text: '客户姓名 张三', identityVisual: false }), true);
  assert.equal(identityEvidenceMatches({
    operation: 'expectVisible', instruction: '查看主页显示的姓名和头像'
  }, { text: '欢迎登录复兴银行门户', identityVisual: false }), false);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '核对主页与个人资料页的姓名和头像'
  }), ['姓名']);
  assert.deepEqual(genericActionTerms({
    operation: 'expectVisible',
    instruction: '验证：显示近期交易，日期；验证金额；验证状态可读'
  }), ['近期交易']);
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
  const timerHandle = Symbol('fake-timer');
  const scheduledDelays = [];
  const clearedHandles = [];
  const clock = {
    setTimeout(resolve, delay) {
      scheduledDelays.push(delay);
      queueMicrotask(resolve);
      return timerHandle;
    },
    clearTimeout(handle) {
      clearedHandles.push(handle);
    }
  };
  await closeWithinTimeout(() => new Promise(() => {}), 20, clock);
  assert.deepEqual(scheduledDelays, [20]);
  assert.deepEqual(clearedHandles, [timerHandle]);
});

test('portable visual configuration is mirrored to Midscene OpenAI transport keys', () => {
  const { configureVisionModel } = require('../../worker/src/i10-vision-readiness.cjs');
  const keys = ['MIDSCENE_MODEL_NAME','MIDSCENE_MODEL_BASE_URL','MIDSCENE_MODEL_API_KEY','MIDSCENE_MODEL_FAMILY','OPENAI_BASE_URL','OPENAI_API_KEY','MIDSCENE_MODEL_TIMEOUT','MIDSCENE_MODEL_RETRY_COUNT'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    configureVisionModel({ VISION_MODEL_NAME: 'mimo-v2.6-flash', VISION_BASE_URL: 'https://visual.invalid/v1', VISION_API_KEY: 'synthetic-secret', VISION_MODEL_FAMILY: 'xiaomi-mimo' });
    assert.equal(process.env.OPENAI_BASE_URL, 'https://visual.invalid/v1');
    assert.equal(process.env.OPENAI_API_KEY, 'synthetic-secret');
    assert.equal(process.env.MIDSCENE_MODEL_RETRY_COUNT, '0');
  } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
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

test('SDK-wrapped provider errors retain the model/HTTP cause and never leak the response', () => {
  for (const [message, code, status] of [
    ['failed to locate element: AI call error: Last error: 400 Unsupported model mimo-v2.5', 'I10_MIDSCENE_MODEL_UNSUPPORTED', 400],
    ['failed to locate element: AI call error: Last error: 401 Unauthorized private-token', 'I10_MIDSCENE_HTTP_401', 401],
    ['failed to locate element: AI call error: Last error: 503 Service unavailable', 'I10_MIDSCENE_HTTP_503', 503],
  ]) {
    const result = classifyMidsceneError(new Error(message));
    assert.equal(result.errorCode, code); assert.equal(result.httpStatus, status);
    assert.equal(result.stage, 'MODEL_TRANSPORT');
    assert.equal(JSON.stringify(result).includes('private-token'), false);
  }
  const nested = { message: 'failed to locate element', dump: { taskInfo: { formatResponse: { errors: ['Last error: 400 Unsupported model mimo-v2.5'] } } } };
  assert.equal(classifyMidsceneError(nested).errorCode, 'I10_MIDSCENE_MODEL_UNSUPPORTED');
  assert.equal(classifyMidsceneError(new Error('failed to locate element: no matching button')).errorCode, 'I10_MIDSCENE_TARGET_NOT_FOUND');
  assert.equal(classifyMidsceneError(new Error('failed to locate element: AI call error: request timed out')).errorCode, 'I10_MIDSCENE_MODEL_TIMEOUT');
  assert.equal(require('../../worker/src/i10-midscene-candidate-authoring.cjs').I10_MIDSCENE_MAX_LOCATE_ATTEMPTS, 1);
});

test('actual SDK readiness rejects an unsupported model after one HTTP call with a safe receipt', async () => {
  const http = require('node:http'), path = require('node:path'), { promisify } = require('node:util'), { execFile } = require('node:child_process');
  let calls = 0;
  const server = http.createServer((req, res) => { calls++; req.resume(); res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: '400', message: 'Unsupported model synthetic-missing' } })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const env = { ...process.env, VISION_MODEL_NAME: 'synthetic-missing', VISION_MODEL_FAMILY: 'xiaomi-mimo', VISION_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, VISION_API_KEY: 'synthetic-secret' };
    await assert.rejects(promisify(execFile)(process.execPath, [path.resolve(__dirname, '../../worker/src/i10-vision-readiness.cjs')], { env, timeout: 20000, windowsHide: true }), error => {
      assert.equal(error.code, 3);
      assert.deepEqual(JSON.parse(error.stdout), { status: 'NOT_READY', code: 'I10_MIDSCENE_MODEL_UNSUPPORTED' });
      assert.equal(error.stdout.includes('synthetic-secret'), false); return true;
    });
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
