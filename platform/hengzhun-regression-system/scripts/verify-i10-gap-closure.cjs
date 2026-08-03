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
assert.equal(matrix.status, 'HISTORICAL_BASELINE_ONLY')
assert.equal(matrix.releaseBoundary.i10Stage9Included, false)
assert.equal(matrix.supersededBy, 'flowise/i10/i10-18-chain-acceptance-issue-register-v1.md')
assert.deepEqual(matrix.gaps.map((gap) => gap.id), Array.from({ length: 20 }, (_, index) => `I10-G${String(index + 1).padStart(2, '0')}`))

for (const gap of matrix.gaps) {
  // This is a historical component-evidence inventory.  Several original test
  // paths intentionally belong to the superseded pre-v6 layout, so checking
  // their existence would turn stale paperwork into a false release gate.
  // Current acceptance is instead evaluated by the v6 suite and the 18-chain
  // acceptance ledger.
  assert.equal(gap.status, 'VERIFIED', `${gap.id}: historical evidence marker`)
  assert.ok(gap.implementation.length > 0, `${gap.id} implementation`)
  assert.ok(gap.tests.length > 0, `${gap.id} tests`)
  assert.ok(gap.runtimeEvidence.length > 0, `${gap.id} runtime evidence`)
  for (const relativePath of gap.implementation) {
    assert.equal(path.isAbsolute(relativePath), false, `${gap.id} path must be relative`)
  }
}

const issueRegister = fs.readFileSync(path.join(root, 'flowise/i10/i10-18-chain-acceptance-issue-register-v1.md'), 'utf8')
assert.match(issueRegister, /不得标记\s*`I10_FLOWISE_18_CHAIN_ACCEPTED`/)

const stage8Path = path.join(root, ...matrix.stage8Evidence.path.split('/'))
const historicalStage8 = fs.existsSync(stage8Path)
  ? (() => {
      const bytes = fs.readFileSync(stage8Path)
      const value = JSON.parse(bytes.toString('utf8'))
      return {
        present: true,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        forwardScenarioCount: value.forwardScenarioCount,
        reverseScenarioCount: value.reverseScenarioCount,
        resultCount: Array.isArray(value.results) ? value.results.length : 0,
        mock: value.mock,
        degraded: value.degraded
      }
    })()
  : { present: false }
const multimodalPath = path.join(root, ...matrix.multimodalVerificationEvidence.path.split('/'))
const historicalMultimodal = { present: fs.existsSync(multimodalPath) }

const secretScan = spawnSync(process.execPath, [path.join(root, 'scripts/verify-i10-secret-leaks.cjs')], { cwd: root, encoding: 'utf8' })
assert.equal(secretScan.status, 0, secretScan.stderr || 'secret scan failed')
const secretResult = JSON.parse(secretScan.stdout)
assert.equal(secretResult.status, 'PASSED')
assert.equal(secretResult.findingCount, 0)

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'hengzhun-i10-gap-closure-verification-v1',
  status: 'HISTORICAL_COMPONENT_BASELINE_INVENTORIED_NOT_CHAIN_ACCEPTED',
  gapCount: matrix.gaps.length,
  historicalStage8,
  historicalMultimodal,
  secretScan: { findingCount: secretResult.findingCount, sourceFilesScanned: secretResult.sourceFilesScanned, runtimeOutputFilesScanned: secretResult.runtimeOutputFilesScanned },
  i10Stage9Included: false,
  fullChainAccepted: false
}, null, 2)}\n`)
