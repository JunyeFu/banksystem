#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../runtime/node_modules/playwright');
const { ProgressReporter, enabledFromEnvironment } = require('./progress.cjs');

const root = path.resolve(__dirname, '..');
const reporter = new ProgressReporter('START', { enabled: enabledFromEnvironment() });
function endpoint(base) { const value = String(base).replace(/\/$/, ''); return value.endsWith('/chat/completions') ? value : `${value}/chat/completions`; }
function parseSuccessfulResponseBody(raw) {
  const value = JSON.parse(String(raw || ''));
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('MODEL_PROBE_RESPONSE_CONTENT_EMPTY');
    error.code = 'MODEL_PROBE_RESPONSE_CONTENT_EMPTY';
    throw error;
  }
  let parsedContent;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    const error = new Error('MODEL_PROBE_RESPONSE_CONTENT_JSON_INVALID');
    error.code = 'MODEL_PROBE_RESPONSE_CONTENT_JSON_INVALID';
    throw error;
  }
  if (!parsedContent || typeof parsedContent !== 'object' || Array.isArray(parsedContent)) {
    const error = new Error('MODEL_PROBE_RESPONSE_CONTENT_JSON_OBJECT_REQUIRED');
    error.code = 'MODEL_PROBE_RESPONSE_CONTENT_JSON_OBJECT_REQUIRED';
    throw error;
  }
  return { content, parsedContent, usage: value?.usage || null };
}
async function call(label, base, key, body, description) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    reporter.throwIfCancelled();
    reporter.activity(`${description}，第${attempt}/3次，本次最长90秒`);
    let response;
    try {
      response = await fetch(endpoint(base), { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
    } catch (error) {
      if (attempt === 3) {
        const failure = new Error(`MODEL_PROBE_${label}_NETWORK_FAILURE_AFTER_${attempt}_ATTEMPTS`);
        failure.code = `MODEL_PROBE_${label}_NETWORK_FAILURE`;
        throw failure;
      }
      reporter.activity(`${description}第${attempt}/3次网络失败，将进行下一次尝试`);
      await new Promise(resolve => setTimeout(resolve, attempt * 1_000));
      continue;
    }
    if (response.ok) {
      try {
        const parsed = parseSuccessfulResponseBody(await response.text());
        return { ...parsed, attempts: attempt };
      } catch {
        if (attempt === 3) {
          const failure = new Error(`MODEL_PROBE_${label}_INVALID_RESPONSE_AFTER_${attempt}_ATTEMPTS`);
          failure.code = `MODEL_PROBE_${label}_INVALID_RESPONSE`;
          throw failure;
        }
        reporter.activity(`${description}第${attempt}/3次响应不完整，将进行下一次尝试`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1_000));
        continue;
      }
    }
    if (attempt === 3 || (response.status !== 429 && response.status < 500)) {
      assert.fail(`MODEL_PROBE_${label}_HTTP_${response.status}_AFTER_${attempt}_ATTEMPTS`);
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 1_000));
  }
  assert.fail(`MODEL_PROBE_${label}_RETRY_STATE_INVALID`);
}
async function main() {
  reporter.installCancellation();
  for (const name of ['CONTROL_API_KEY','CONTROL_BASE_URL','CONTROL_MODEL_NAME','VISION_API_KEY','VISION_BASE_URL','VISION_MODEL_NAME']) assert.ok(process.env[name], `${name}_MISSING`);
  reporter.startStage(6, 8, '验证主控模型结构化输出与时间语义', { maxWaitHint: '两个请求；每个最多3次，每次90秒' });
  const controller = await call('CONTROL_STRUCTURE', process.env.CONTROL_BASE_URL, process.env.CONTROL_API_KEY, {
    model: process.env.CONTROL_MODEL_NAME, temperature: 0, max_tokens: 256, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: '仅输出JSON对象，字段probe必须为HENGZHUN_I10_CONTROL_OK，字段toolBoundary必须为MCP_ONLY。' }]
  }, '主控结构化输出');
  const controllerJson = controller.parsedContent;
  assert.equal(controllerJson.probe, 'HENGZHUN_I10_CONTROL_OK');
  assert.equal(controllerJson.toolBoundary, 'MCP_ONLY');
  const probeRunAt = new Date(Date.now() + 86_400_000).toISOString();
  const schedule = await call('CONTROL_SCHEDULE', process.env.CONTROL_BASE_URL, process.env.CONTROL_API_KEY, {
    model: process.env.CONTROL_MODEL_NAME, temperature: 0, max_tokens: 384, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '把用户已经确认的执行方式解析为JSON。若文本包含ISO 8601时间，runAt必须逐字符复制，尤其不得把Z改成+08:00或在不换算时钟值时改写偏移。只输出scheduleType、runAt、timezone。' },
      { role: 'user', content: `确认单次定时（ONE_TIME），执行时间${probeRunAt}，时区Asia/Shanghai。` }
    ]
  }, '主控时间语义保持');
  const scheduleJson = schedule.parsedContent;
  assert.equal(scheduleJson.scheduleType, 'ONE_TIME');
  assert.equal(scheduleJson.runAt, probeRunAt, 'CONTROL_SCHEDULE_ISO_INSTANT_NOT_PRESERVED');
  assert.equal(scheduleJson.timezone, 'Asia/Shanghai');

  reporter.activity('主控模型两个探针均已通过');
  reporter.startStage(7, 8, '验证视觉模型真实截图理解', { maxWaitHint: '最多3次，每次90秒' });
  const outputRoot = path.join(root, '.data', 'evidence', 'i10', 'model-probes');
  fs.mkdirSync(outputRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: path.join(root, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe') });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  await page.setContent('<main style="font:32px system-ui;padding:60px"><h1>衡准视觉探针</h1><button style="background:#c00;color:white;padding:18px">开始回归</button><p>页面编号：I10-VISION-01</p></main>');
  const screenshot = await page.screenshot({ type: 'png' });
  await browser.close();
  const vision = await call('VISION_SCREENSHOT', process.env.VISION_BASE_URL, process.env.VISION_API_KEY, {
    model: process.env.VISION_MODEL_NAME, temperature: 0, max_tokens: 512, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [
      { type: 'text', text: '观察截图并只输出JSON：title、buttonText、pageId。不得猜测不可见内容。' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot.toString('base64')}` } }
    ] }]
  }, '视觉截图理解');
  const visionJson = vision.parsedContent;
  assert.match(String(visionJson.title), /衡准/);
  assert.equal(String(visionJson.pageId), 'I10-VISION-01');
  const evidence = {
    schemaVersion: 'hengzhun-i10-model-probe-evidence-v1', mock: false, degraded: false,
    controller: { model: process.env.CONTROL_MODEL_NAME, structuredOutput: true, usageReported: Boolean(controller.usage), scheduleIsoInstantPreserved: true, structureProbeAttempts: controller.attempts, scheduleProbeAttempts: schedule.attempts },
    vision: { model: process.env.VISION_MODEL_NAME, realScreenshot: true, structuredOutput: true, usageReported: Boolean(vision.usage), screenshotProbeAttempts: vision.attempts },
    completedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outputRoot, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  reporter.activity('视觉模型真实截图理解通过');
  if (process.env.HENGZHUN_PROGRESS_SUBTASK !== '1') reporter.finish('模型探针完成');
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
if (require.main === module) {
  main().catch(error => {
    reporter.fail(error, '.data/evidence/i10/model-probes');
    const safeMessage = String(error.message || error)
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
      .slice(0, 320);
    process.stderr.write(`${safeMessage}\n`);
    process.exitCode = error.exitCode || 2;
  });
}

module.exports = { endpoint, parseSuccessfulResponseBody, call };
