#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8'))
const matrix = readJson('flowise/i10/gap-closure-matrix-v1.json')

assert.equal(matrix.schemaVersion, 'hengzhun-i10-gap-closure-matrix-v1')
assert.equal(matrix.scope, 'I10-S0-S8-R0-R7')
assert.equal(matrix.status, 'VERIFIED')
assert.equal(matrix.releaseBoundary.i10Stage9Included, false)
assert.deepEqual(matrix.gaps.map((gap) => gap.id), Array.from({ length: 20 }, (_, index) => `I10-G${String(index + 1).padStart(2, '0')}`))

for (const gap of matrix.gaps) {
  assert.equal(gap.status, 'VERIFIED', gap.id)
  assert.ok(gap.implementation.length > 0, `${gap.id} implementation`)
  assert.ok(gap.tests.length > 0, `${gap.id} tests`)
  assert.ok(gap.runtimeEvidence.length > 0, `${gap.id} runtime evidence`)
  for (const relativePath of [...gap.implementation, ...gap.tests]) {
    assert.equal(path.isAbsolute(relativePath), false, `${gap.id} path must be relative`)
    assert.equal(fs.existsSync(path.join(root, ...relativePath.split('/'))), true, `${gap.id} missing ${relativePath}`)
  }
}

const stage8Path = path.join(root, ...matrix.stage8Evidence.path.split('/'))
const stage8Bytes = fs.readFileSync(stage8Path)
const stage8 = JSON.parse(stage8Bytes.toString('utf8'))
assert.equal(crypto.createHash('sha256').update(stage8Bytes).digest('hex'), matrix.stage8Evidence.sha256)
for (const key of ['mock', 'degraded', 'forwardScenarioCount', 'reverseScenarioCount']) assert.equal(stage8[key], matrix.stage8Evidence[key], key)
assert.equal(stage8.mock, false)
assert.equal(stage8.degraded, false)
assert.equal(stage8.forwardScenarioCount, 9)
assert.equal(stage8.reverseScenarioCount, 3)
assert.equal(stage8.results.length, 12)

const probes = readJson('.data/evidence/i10/model-probes/result.json')
assert.equal(probes.mock, false)
assert.equal(probes.degraded, false)
assert.equal(probes.controller.structuredOutput, true)
assert.equal(probes.vision.realScreenshot, true)
const publication = readJson('.data/evidence/i10/flowise/publication.json')
assert.equal(publication.mock, false)
assert.equal(publication.degraded, false)
assert.equal(publication.deployed, true)
assert.equal(publication.private, true)

const multimodalPath = path.join(root, ...matrix.multimodalVerificationEvidence.path.split('/'))
const multimodalBytes = fs.readFileSync(multimodalPath)
const multimodal = JSON.parse(multimodalBytes.toString('utf8'))
assert.equal(crypto.createHash('sha256').update(multimodalBytes).digest('hex'), matrix.multimodalVerificationEvidence.sha256)
for (const key of ['mock', 'degraded', 'imageCount', 'factCount']) assert.equal(multimodal[key], matrix.multimodalVerificationEvidence[key], `multimodal.${key}`)
assert.equal(multimodal.controller.invocation, matrix.multimodalVerificationEvidence.controllerInvocation)
assert.equal(multimodal.verification.stateMachineStatus, matrix.multimodalVerificationEvidence.verificationStatus)
assert.equal(multimodal.verification.hardwareOperationVerified, false)
assert.equal(multimodal.mock, false)
assert.equal(multimodal.degraded, false)
assert.ok(multimodal.factCount > 0)

const secretScan = spawnSync(process.execPath, [path.join(root, 'scripts/verify-i10-secret-leaks.cjs')], { cwd: root, encoding: 'utf8' })
assert.equal(secretScan.status, 0, secretScan.stderr || 'secret scan failed')
const secretResult = JSON.parse(secretScan.stdout)
assert.equal(secretResult.status, 'PASSED')
assert.equal(secretResult.findingCount, 0)

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'hengzhun-i10-gap-closure-verification-v1',
  status: 'VERIFIED_I10_G01_G20_S0_S8_R0_R7',
  gapCount: matrix.gaps.length,
  forwardScenarioCount: stage8.forwardScenarioCount,
  reverseScenarioCount: stage8.reverseScenarioCount,
  resultCount: stage8.results.length,
  stage8EvidenceSha256: matrix.stage8Evidence.sha256,
  modelProbes: { mock: probes.mock, degraded: probes.degraded },
  flowisePublication: { deployed: publication.deployed, private: publication.private },
  multimodalVerification: { imageCount: multimodal.imageCount, factCount: multimodal.factCount, controllerInvocation: multimodal.controller.invocation, stateMachineStatus: multimodal.verification.stateMachineStatus, hardwareOperationVerified: multimodal.verification.hardwareOperationVerified },
  secretScan: { findingCount: secretResult.findingCount, sourceFilesScanned: secretResult.sourceFilesScanned, runtimeOutputFilesScanned: secretResult.runtimeOutputFilesScanned },
  i10Stage9Included: false
}, null, 2)}\n`)
