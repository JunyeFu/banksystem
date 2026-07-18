'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const productRoot = path.resolve(__dirname, '../..');
const node = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe');
const verifier = path.join(productRoot, 'scripts', 'verify-i7-delivery.cjs');

test('I7 delivery freeze proves the committed contract and writes only a redacted summary', t => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i7-delivery-'));
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }));
  const output = path.join(outputRoot, 'summary.json');
  const result = JSON.parse(childProcess.execFileSync(node, [verifier, '--record', '--output', output], { encoding: 'utf8' }));
  const persisted = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(result.status, 'HENGZHUN_I7_INTERNSHIP_DELIVERY_VERIFIED');
  assert.equal(result.databaseEngine, 'sqlite');
  assert.equal(result.checks.verifiedEvidenceCount, 5);
  assert.equal(result.checks.openapiOperationCount, 14);
  assert.equal(result.checks.publicPluginVersion, 'v0.0.10');
  assert.equal(result.checks.publicPlatformExitGate, 'CLOSED');
  assert.equal(result.checks.forbiddenTrackedPathCount, 0);
  assert.deepEqual(persisted, result);
  const serialized = JSON.stringify(persisted);
  assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}/i);
  assert.ok(result.deferredExternalClaims.includes('PLAT-V010_TARGET_HIAGENT_NETWORK'));
});
