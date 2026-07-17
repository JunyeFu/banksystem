#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const resultPath = path.join(root, 'tests', 'conformance', 'results', 'PLAT-V014.json');
const statusPath = path.join(root, 'tests', 'conformance', 'status.yaml');
const failures = [];

try {
  const source = fs.readFileSync(resultPath, 'utf8');
  const result = JSON.parse(source);
  if (result.schemaVersion !== 1 || result.id !== 'PLAT-V014') failures.push('invalid result identity');
  if (result.conclusion !== 'PARTIALLY_VERIFIED') failures.push('conclusion must remain PARTIALLY_VERIFIED');
  if (!Array.isArray(result.evidenceSha256) || result.evidenceSha256.length === 0 || result.evidenceSha256.some(hash => !/^[a-f0-9]{64}$/.test(hash))) {
    failures.push('invalid evidence hashes');
  }

  for (const action of ['LOCATE', 'INPUT', 'TAP', 'SCROLL']) {
    const item = result.actionResults?.[action];
    if (!item) {
      failures.push(`${action}: missing result`);
      continue;
    }
    if (item.viewportCount < 5 || item.attemptCount < 10) failures.push(`${action}: insufficient repetitions`);
    const clean = item.passedCount === item.attemptCount && item.failureCount === 0 && item.falseSuccessCount === 0;
    if ((item.status === 'VERIFIED') !== clean) failures.push(`${action}: status does not match measured failures`);
    if (item.midsceneAdmission !== clean) failures.push(`${action}: admission does not match verified status`);
  }

  if (result.actionResults?.LOCATE?.status !== 'DEGRADED') failures.push('LOCATE must be DEGRADED');
  if (result.routing?.unsafeActionsAdmitted !== false) failures.push('unsafe action admission must be false');
  if (result.routing?.locateFallback !== 'PLAYWRIGHT_ONLY') failures.push('LOCATE fallback must be PLAYWRIGHT_ONLY');
  if (result.routing?.formalRegression !== 'SCRIPT_VALIDATED_PLAYWRIGHT_ONLY') failures.push('formal regression boundary mismatch');
  if (/([a-z]:\\|\.env|cookie|bearer\s+[a-z0-9]|password\s*[:=]|api[_-]?key\s*[:=])/i.test(source)) {
    failures.push('forbidden sensitive or host-specific material');
  }

  const status = YAML.parse(fs.readFileSync(statusPath, 'utf8'));
  const registered = status.items?.find(item => item.id === 'PLAT-V014');
  if (registered?.status !== result.conclusion) failures.push('status.yaml does not match PLAT-V014 conclusion');
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error('HENGZHUN_I4_RESULTS_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I4_RESULTS_VERIFIED',
    midsceneActionAdmission: 'PARTIALLY_VERIFIED',
    i4ExitGate: 'CLOSED_WITH_PLAYWRIGHT_FALLBACK',
    admittedMidsceneActions: ['INPUT', 'TAP', 'SCROLL'],
    degradedActions: ['LOCATE'],
    locateFallback: 'PLAYWRIGHT_ONLY'
  }, null, 2));
}
