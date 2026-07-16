#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const resultRoot = path.join(root, 'tests', 'conformance', 'results');
const expected = new Map([
  ['PLAT-V001', 'FAIL'],
  ['PLAT-V002', 'PARTIALLY_VERIFIED'],
  ['PLAT-V003', 'PARTIALLY_VERIFIED'],
  ['PLAT-V006', 'BLOCKED'],
  ['PLAT-V009', 'RUNTIME_VERIFIED'],
  ['PLAT-V013', 'PARTIALLY_VERIFIED']
]);
const failures = [];

for (const [id, conclusion] of expected) {
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
    if (result.conclusion !== conclusion) failures.push(`${id}: conclusion mismatch`);
    if (!Array.isArray(result.evidenceSha256) || result.evidenceSha256.length === 0) {
      failures.push(`${id}: evidenceSha256 is empty`);
    } else if (result.evidenceSha256.some(hash => !/^[a-f0-9]{64}$/.test(hash))) {
      failures.push(`${id}: invalid evidence hash`);
    }
    if (/([a-z]:\\|\.env|cookie|bearer\s|token\s*[:=]|password\s*[:=]|space[_-]?id|workflow[_-]?id|bot[_-]?id)/i.test(source)) {
      failures.push(`${id}: result contains forbidden sensitive or platform-internal material`);
    }
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
  }
}

if (failures.length) {
  console.error('HENGZHUN_I1_RESULTS_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I1_RESULTS_VERIFIED',
    resultCount: expected.size,
    gate: 'NOT_CLOSED',
    blockingResults: ['PLAT-V001', 'PLAT-V003', 'PLAT-V006']
  }, null, 2));
}
