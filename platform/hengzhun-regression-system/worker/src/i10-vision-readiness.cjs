'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const runtimeRequire = createRequire(path.join(root, 'runtime/package.json'));

function configureVisionModel(environment = process.env) {
  const model = environment.VISION_MODEL_NAME || environment.MIDSCENE_MODEL_NAME;
  const baseUrl = environment.VISION_BASE_URL || environment.MIDSCENE_MODEL_BASE_URL;
  const apiKey = environment.VISION_API_KEY || environment.MIDSCENE_MODEL_API_KEY;
  const family = environment.VISION_MODEL_FAMILY || environment.MIDSCENE_MODEL_FAMILY;
  if (!model || !baseUrl || !apiKey || !family) throw Object.assign(new Error('I10_VISION_CONFIGURATION_MISSING'), { code: 'I10_VISION_CONFIGURATION_MISSING' });
  if (/mimo/i.test(model) && family !== 'xiaomi-mimo') throw Object.assign(new Error('I10_VISION_MODEL_FAMILY_MISMATCH'), { code: 'I10_VISION_MODEL_FAMILY_MISMATCH' });
  // The Worker and the readiness subprocess use the same SDK configuration.
  Object.assign(process.env, { MIDSCENE_MODEL_NAME: model, MIDSCENE_MODEL_BASE_URL: baseUrl,
    MIDSCENE_MODEL_API_KEY: apiKey, MIDSCENE_MODEL_FAMILY: family,
    OPENAI_BASE_URL: baseUrl, OPENAI_API_KEY: apiKey, MIDSCENE_MODEL_TIMEOUT: '90000', MIDSCENE_MODEL_RETRY_COUNT: '0' });
  return { model, family };
}

async function probeVisionReadiness() {
  configureVisionModel();
  const { chromium } = runtimeRequire('playwright');
  const freeze = require('../../config/demo-runtime-freeze.json');
  const { observeTargetWithMidscene, mapModelCenterToViewport } = require('./i10-midscene-candidate-authoring.cjs');
  const browser = await chromium.launch({ executablePath: path.join(root, 'runtime', freeze.chromium.executable), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    await page.setContent('<body style="margin:0;background:white"><button id="vision-probe" style="position:absolute;left:80px;top:60px;width:160px;height:120px;background:red;border:0;color:white">READY</button></body>');
    const observation = await observeTargetWithMidscene(page, 'Locate the center of the large red READY button in this screenshot.', { generateReport: false, autoPrintReportMsg: false });
    const center = mapModelCenterToViewport(observation.location, 2);
    const matches = center && await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id === 'vision-probe', center);
    if (!matches) throw Object.assign(new Error('I10_VISION_PROBE_LOCATION_INVALID'), { code: 'I10_VISION_PROBE_LOCATION_INVALID' });
    return { status: 'READY', code: 'I10_VISION_READY' };
  } finally { await browser.close(); }
}

module.exports = { configureVisionModel, probeVisionReadiness };
if (require.main === module) probeVisionReadiness().then(value => console.log(JSON.stringify(value))).catch(error => {
  const { classifyMidsceneError } = require('./i10-midscene-candidate-authoring.cjs');
  const code = /^I10_VISION_[A-Z0-9_]+$/.test(error.code || '') ? error.code : classifyMidsceneError(error).errorCode;
  console.log(JSON.stringify({ status: 'NOT_READY', code })); process.exitCode = 3;
});
