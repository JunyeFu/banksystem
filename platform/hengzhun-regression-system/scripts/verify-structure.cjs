#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const productRoot = path.resolve(__dirname, '..');
const requiredDirectories = [
  'coze', 'harness', 'worker', 'runtime', 'contracts', 'tests',
  'scripts', 'docs', 'config', '.data'
];
const requiredFiles = [
  'README.md', '.gitignore', 'package.json', 'compose.yaml', 'verify.cmd',
  'config/demo-runtime-freeze.json', 'runtime/verify-runtime.cmd',
  'harness/conformance/server.cjs', 'harness/conformance/Dockerfile',
  'contracts/openapi/i1-conformance.yaml',
  'coze/public-ui-configuration.yaml',
  'coze/studio/docker-compose.hengzhun.yml',
  'scripts/prepare-i1.ps1', 'scripts/start-i1.ps1', 'scripts/verify-i1.ps1',
  'scripts/verify-i1-results.cjs',
  'harness/Dockerfile', 'harness/migrations/001_i2_core.sql',
  'harness/src/index.ts', 'harness/src/server.ts', 'harness/src/service.ts',
  'contracts/openapi/hengzhun-harness-v1.yaml',
  'scripts/prepare-i2.ps1', 'scripts/start-i2.ps1', 'scripts/stop-i2.ps1',
  'scripts/verify-i2.ps1', 'scripts/verify-i2-openapi.cjs',
  'scripts/verify-i2-results.cjs',
  'tests/i2/database.test.cjs', 'tests/i2/output-budget.test.cjs',
  'tests/i2/harness-api.test.cjs',
  'tests/conformance/results/PLAT-V001.json',
  'tests/conformance/results/PLAT-V002.json',
  'tests/conformance/results/PLAT-V003.json',
  'tests/conformance/results/PLAT-V006.json',
  'tests/conformance/results/PLAT-V009.json',
  'tests/conformance/results/PLAT-V013.json',
  'tests/conformance/results/PLAT-V004.json',
  'tests/conformance/results/PLAT-V005.json',
  'tests/conformance/results/PLAT-V008.json'
];
const failures = [];

for (const relative of requiredDirectories) {
  const absolute = path.join(productRoot, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    failures.push(`missing directory: ${relative}`);
  }
}

for (const relative of requiredFiles) {
  const absolute = path.join(productRoot, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    failures.push(`missing file: ${relative}`);
  }
}

try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== 'hengzhun-regression-system') failures.push('unexpected package name');
  if (packageJson.private !== true) failures.push('package must remain private');
  if (packageJson.engines?.node !== '20.20.2') failures.push('Node engine must be frozen at 20.20.2');
} catch (error) {
  failures.push(`package.json: ${error.message}`);
}

if (failures.length > 0) {
  console.error('HENGZHUN_I1_SKELETON_INVALID');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I1_SKELETON_READY',
    productRoot,
    requiredDirectories,
    runtimeDataRoot: '.data',
    runtimeKnowledgeAuthority: 'Coze Knowledge Base',
    implementationOrderAuthority: 'agent/plans/active/v54-implementation-batches.md'
  }, null, 2));
}
