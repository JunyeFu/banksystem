'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertCoverage,
  assertReleaseStateUnchanged,
  parseCoverage,
  validateManifest,
  validatePackageTestScripts
} = require('../run-registered-tests.cjs')

function manifest(tests) {
  return {
    schemaVersion: 'hengzhun-test-manifest-v1',
    tests,
    ciExcluded: [],
    coverage: {
      tests,
      thresholds: { lines: 50, branches: 50, functions: 50 }
    }
  }
}

test('registered test manifest rejects both orphaned and missing test files', () => {
  assert.throws(
    () => validateManifest(manifest(['scripts/a.test.cjs']), ['scripts/a.test.cjs', 'scripts/orphan.test.cjs']),
    error => error?.code === 'TEST_MANIFEST_DISCOVERY_MISMATCH' && error.details.includes('unregistered:scripts/orphan.test.cjs')
  )
  assert.throws(
    () => validateManifest(manifest(['scripts/missing.test.cjs']), []),
    error => error?.code === 'TEST_MANIFEST_DISCOVERY_MISMATCH' && error.details.includes('missing:scripts/missing.test.cjs')
  )
})

test('coverage parser enforces the configured line, branch and function floors', () => {
  const summary = parseCoverage('all files | 83.25 | 72.5 | 61.75 |')
  assert.deepEqual(summary, { lines: 83.25, branches: 72.5, functions: 61.75 })
  assert.doesNotThrow(() => assertCoverage(summary, { lines: 80, branches: 70, functions: 60 }))
  assert.throws(
    () => assertCoverage(summary, { lines: 90, branches: 70, functions: 60 }),
    error => error?.code === 'TEST_COVERAGE_THRESHOLD_NOT_MET'
  )
})

test('release-state proof rejects graph or publication hash drift', () => {
  const before = {
    'flowise/i10/agentflow-v7.json': 'a'.repeat(64),
    'flowise/i10/publication-manifest-v1.json': 'b'.repeat(64)
  }
  assert.doesNotThrow(() => assertReleaseStateUnchanged(before, { ...before }))
  assert.throws(
    () => assertReleaseStateUnchanged(before, { ...before, 'flowise/i10/agentflow-v7.json': 'c'.repeat(64) }),
    error => error?.code === 'TEST_MUTATED_RELEASE_STATE'
  )
})

test('all package test entrypoints satisfy the read-only static policy', () => {
  assert.doesNotThrow(() => validatePackageTestScripts())
})
