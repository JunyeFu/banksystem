#!/usr/bin/env node
'use strict';

// Deliberately small, redacted runtime diagnostic for the real Midscene
// transport.  It never serialises runtime configuration or model responses.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.data', 'runtime.env'), 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}
process.env.MIDSCENE_MODEL_NAME = process.env.VISION_MODEL_NAME;
process.env.MIDSCENE_MODEL_BASE_URL = process.env.VISION_BASE_URL;
process.env.MIDSCENE_MODEL_API_KEY = process.env.VISION_API_KEY;
process.env.MIDSCENE_MODEL_FAMILY = process.env.VISION_MODEL_FAMILY;
process.env.OPENAI_BASE_URL = process.env.VISION_BASE_URL;
process.env.OPENAI_API_KEY = process.env.VISION_API_KEY;
process.env.MIDSCENE_MODEL_TIMEOUT = '90000';
process.env.MIDSCENE_MODEL_RETRY_COUNT = '0';

const runtimeRequire = createRequire(path.join(root, 'runtime', 'node_modules', '_hengzhun_loader.cjs'));
const { chromium } = runtimeRequire('playwright');
const { PlaywrightAgent } = runtimeRequire('@midscene/web/playwright');
const { buildMidscenePrompt, normalizeMidscenePromptEnvelope } = require(path.join(root, 'dist', 'harness', 'src', 'context-envelope.js'));
const fingerprint = text => crypto.createHash('sha256').update(String(text || '')).digest('hex');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: path.join(root, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe')
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const agent = new PlaywrightAgent(page, { screenshotShrinkFactor: 2 });
  try {
    const jobId = String(process.env.I10_DIAG_JOB_ID || '');
    const targetUrl = String(process.env.I10_DIAG_TARGET_URL || '');
    let prompt = '只定位文字为开始回归的按钮。';
    if (jobId) {
      const Database = require('better-sqlite3');
      const database = new Database(path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'), { readonly: true });
      const context = database.prepare('select envelope_json from i10_authoring_contexts where job_id = ? order by ordinal limit 1').get(jobId);
      database.close();
      if (!context) throw new Error('I10_DIAG_CONTEXT_NOT_FOUND');
      prompt = buildMidscenePrompt(normalizeMidscenePromptEnvelope(JSON.parse(context.envelope_json)));
    }
    if (targetUrl) await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    else await page.setContent('<main><button data-testid="probe-button">开始回归</button></main>');
    const startedAt = Date.now();
    const location = await agent.aiLocate(prompt);
    process.stdout.write(`${JSON.stringify({ status: 'OK', elapsedMs: Date.now() - startedAt, hasCenter: Array.isArray(location?.center), resultKeys: Object.keys(location || {}).sort(), promptLength: prompt.length })}\n`);
  } catch (error) {
    const message = String(error?.message || error || '').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]');
    process.stdout.write(`${JSON.stringify({ status: 'FAILED', elapsedMs: 0, name: String(error?.name || 'Error').slice(0, 80), code: String(error?.code || '').slice(0, 120) || null, statusCode: Number.isInteger(error?.status) ? error.status : null, messageFingerprint: fingerprint(message), message: message.slice(0, 240) })}\n`);
    process.exitCode = 2;
  } finally {
    await agent.destroy().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
})();
