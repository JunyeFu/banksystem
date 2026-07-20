#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const productRoot = path.resolve(__dirname, '..');
const requiredDirectories = [
  'coze', 'flowise', 'mcp', 'harness', 'worker', 'model-gateway', 'runtime', 'contracts', 'tests',
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
  'harness/migrations/002_i3_execution.sql',
  'contracts/openapi/hengzhun-worker-internal-v1.yaml',
  'worker/src/index.cjs', 'worker/src/login-profile.cjs',
  'model-gateway/src/server.cjs', 'model-gateway/Dockerfile',
  'scripts/prepare-i3.ps1', 'scripts/start-i3.ps1', 'scripts/stop-i3.ps1',
  'scripts/verify-i3.ps1', 'scripts/verify-i3-openapi.cjs', 'scripts/verify-i3-results.cjs',
  'tests/i3/vertical-closure.test.cjs', 'tests/i3/model-gateway.test.cjs',
  'coze/agents/hengzhun-i3-regression-agent.md',
  'coze/knowledge/i3-login-profile-runtime-rules.md',
  'coze/workflows/i3-first-vertical.yaml',
  'harness/migrations/003_i4_midscene_authoring.sql',
  'harness/migrations/004_i4_capability_failures.sql',
  'harness/migrations/005_i4_action_target_refs.sql',
  'worker/src/account-ownership.cjs', 'worker/src/auth-rejection-recovery.cjs',
  'runtime/midscene-authoring-worker.cjs', 'runtime/midscene-plat-v014.cjs',
  'scripts/prepare-i4.ps1', 'scripts/start-i4.ps1', 'scripts/stop-i4.ps1',
  'scripts/stop-authoring-worker.ps1', 'scripts/verify-i4.ps1',
  'scripts/verify-i4-live.ps1', 'scripts/verify-i4-authoring-live.ps1',
  'scripts/verify-i4-midscene.ps1', 'scripts/verify-i4-results.cjs',
  'tests/i4/authoring-window.test.cjs',
  'harness/src/context-envelope.ts',
  'harness/migrations/009_i8_context_budget.sql',
  'tests/i8/context-envelope.test.cjs',
  'harness/migrations/010_i8_agentflow_handoff.sql',
  'harness/src/i8/stage2-schemas.ts',
  'mcp/src/server.cjs',
  'contracts/mcp/hengzhun-i8.json',
  'flowise/i8/agentflow-v2.json',
  'flowise/i8/deployment-manifest.json',
  'flowise/i8/hiagent-capability-map.yaml',
  'flowise/i8/knowledge/portal-login-consistency.md',
  'tests/i8/stage2-agentflow-mcp.test.cjs',
  'scripts/verify-i8-stage2.ps1',
  'harness/migrations/011_i8_deterministic_builder.sql',
  'harness/src/i8/stage3-schemas.ts',
  'harness/src/i8/script-package-builder.ts',
  'worker/src/i8-candidate-runner.cjs',
  'tests/i8/stage3-deterministic-builder.test.cjs',
  'scripts/verify-i8-stage3.ps1',
  'harness/migrations/012_i8_stability_certificate.sql',
  'harness/src/i8/stage4-schemas.ts',
  'worker/src/i8-stability-runner.cjs',
  'tests/i8/stage4-stability-certificate.test.cjs',
  'scripts/verify-i8-stage4.ps1',
  'scripts/verify-i8-stage4-live.ps1', 'scripts/verify-i8-stage4-live.cjs',
  'coze/agents/hengzhun-i4-regression-agent.md',
  'coze/knowledge/i4-three-case-authoring-runtime-rules.md',
  'coze/workflows/i4-three-cases-authoring.yaml',
  'harness/migrations/006_i5_repair_loop.sql', 'harness/migrations/007_i5_decision_immutability.sql',
  'scripts/start-i5.ps1', 'scripts/stop-i5.ps1', 'scripts/verify-i5.ps1', 'scripts/verify-i5-live.ps1',
  'tests/i5/i5-repair-loop.test.cjs',
  'coze/agents/hengzhun-i5-regression-agent.md',
  'coze/knowledge/i5-import-failure-repair-runtime-rules.md',
  'coze/workflows/i5-import-failure-repair.yaml',
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
  'tests/conformance/results/PLAT-V008.json',
  'tests/conformance/results/PLAT-V011.json',
  'tests/conformance/results/PLAT-V012.json',
  'tests/conformance/results/PLAT-V014.json'
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
  if (!packageJson.scripts?.['verify:i8:stage1']) failures.push('I8 stage1 verification command is missing');
  if (!packageJson.scripts?.['verify:i8:stage2']) failures.push('I8 stage2 verification command is missing');
  if (!packageJson.scripts?.['verify:i8:stage3']) failures.push('I8 stage3 verification command is missing');
  if (!packageJson.scripts?.['verify:i8:stage4']) failures.push('I8 stage4 verification command is missing');
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
    currentKnowledgeAuthority: 'Flowise platform knowledge artifact; live import must be verified separately',
    implementationOrderAuthority: 'agent/plans/active/v54-implementation-batches.md'
  }, null, 2));
}
