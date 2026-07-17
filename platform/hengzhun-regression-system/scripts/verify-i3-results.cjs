#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const resultRoot = path.join(root, 'tests', 'conformance', 'results');
const expected = new Map([
  ['PLAT-V004', 'RUNTIME_VERIFIED'],
  ['PLAT-V011', 'RUNTIME_VERIFIED'],
  ['PLAT-V012', 'RUNTIME_VERIFIED']
]);
const failures = [];

for (const [id, conclusion] of expected) {
  const file = path.join(resultRoot, `${id}.json`);
  try {
    const source = fs.readFileSync(file, 'utf8');
    const result = JSON.parse(source);
    if (result.schemaVersion !== 1 || result.id !== id) failures.push(`${id}: invalid identity`);
    if (result.platform?.name !== 'Coze Studio' || result.platform?.version !== '0.5.1') failures.push(`${id}: platform baseline mismatch`);
    if (result.conclusion !== conclusion) failures.push(`${id}: conclusion mismatch`);
    if (!Array.isArray(result.evidenceSha256) || result.evidenceSha256.length === 0 || result.evidenceSha256.some(hash => !/^[a-f0-9]{64}$/.test(hash))) {
      failures.push(`${id}: invalid evidence hashes`);
    }
    if (/([a-z]:\\|\.env|cookie|bearer\s+[a-z0-9]|password\s*[:=]|space[_-]?id|workflow[_-]?id|bot[_-]?id)/i.test(source)) {
      failures.push(`${id}: forbidden sensitive or platform-internal material`);
    }
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
  }
}

if (failures.length) {
  console.error('HENGZHUN_I3_RESULTS_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I3_HISTORICAL_RESULTS_VERIFIED',
    historicalGatesClosedAtEvidenceTime: ['PLAT-V004', 'PLAT-V011', 'PLAT-V012'],
    currentPlatformConfigurationAssertedByHistoricalResult: false,
    currentPlatformEvidenceAuthority: 'docs/evidence/platform/hengzhun-i5-import-repair-2026-07-17.md'
  }, null, 2));
}
