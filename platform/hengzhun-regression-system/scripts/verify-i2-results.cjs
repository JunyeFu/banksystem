#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const resultRoot = path.join(root, 'tests', 'conformance', 'results');
const expected = new Map([
  ['PLAT-V004', new Set(['PARTIALLY_VERIFIED', 'RUNTIME_VERIFIED'])],
  ['PLAT-V005', new Set(['HARNESS_VERIFIED'])],
  ['PLAT-V008', new Set(['HARNESS_VERIFIED'])]
]);
const failures = [];

for (const [id, conclusions] of expected) {
  const file = path.join(resultRoot, `${id}.json`);
  if (!fs.existsSync(file)) {
    failures.push(`missing result: ${id}`);
    continue;
  }
  try {
    const source = fs.readFileSync(file, 'utf8');
    const result = JSON.parse(source);
    if (result.schemaVersion !== 1) failures.push(`${id}: unexpected schemaVersion`);
    if (result.id !== id) failures.push(`${id}: id mismatch`);
    if (result.platform?.name !== 'Coze Studio' || result.platform?.version !== '0.5.1') {
      failures.push(`${id}: platform baseline mismatch`);
    }
    if (!conclusions.has(result.conclusion)) failures.push(`${id}: conclusion mismatch`);
    if (!Array.isArray(result.evidenceSha256) || result.evidenceSha256.length === 0) {
      failures.push(`${id}: evidenceSha256 is empty`);
    } else if (result.evidenceSha256.some(hash => !/^[a-f0-9]{64}$/.test(hash))) {
      failures.push(`${id}: invalid evidence hash`);
    }
    if (/([a-z]:\\|\.env|cookie|bearer\s+[a-z0-9]|token\s*[:=]|password\s*[:=]|space[_-]?id|workflow[_-]?id|bot[_-]?id)/i.test(source)) {
      failures.push(`${id}: result contains forbidden sensitive or platform-internal material`);
    }
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
  }
}

if (failures.length) {
  console.error('HENGZHUN_I2_RESULTS_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  const pluginResult = JSON.parse(fs.readFileSync(path.join(resultRoot, 'PLAT-V004.json'), 'utf8'));
  const pluginCallVerified = pluginResult.conclusion === 'RUNTIME_VERIFIED';
  console.log(JSON.stringify({
    status: 'HENGZHUN_I2_RESULTS_VERIFIED',
    resultCount: expected.size,
    i2HarnessGate: 'CLOSED',
    deferredToI3: pluginCallVerified ? [] : ['PLAT-V004_REAL_PUBLISH_AND_CALL']
  }, null, 2));
}
