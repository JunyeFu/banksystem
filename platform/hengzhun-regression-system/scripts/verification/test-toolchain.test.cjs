'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  REGISTERED_TEST_TIMEOUT_MS,
  assertCoverage,
  assertTapSuccess,
  assertReleaseStateUnchanged,
  parseCoverage,
  validateManifest,
  validatePackageTestScripts
} = require('../run-registered-tests.cjs')

test('registered files have one measured timeout budget without retries or parallelism', () => {
  assert.equal(REGISTERED_TEST_TIMEOUT_MS, 300_000)
})

test('nested summaries allow additional passing tests but reject skipped failed cancelled or incomplete suites', () => {
  const report = (tests, pass, changes = {}) => Object.entries({ tests, pass, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...changes })
    .map(([key, value]) => `# ${key} ${value}`).join('\n')
  for (const size of [1, 16, 20, 42]) assert.equal(assertTapSuccess(report(size, size)).pass, size)
  for (const output of [report(0, 0), report(3, 0, { skipped: 3 }), report(3, 2, { fail: 1 }),
    report(3, 2, { cancelled: 1 }), report(3, 3, { todo: 1 }), '# pass 20\n# fail 0']) {
    assert.throws(() => assertTapSuccess(output), error => error.code === 'NESTED_TEST_SUMMARY_NOT_PASSED')
  }
})

function manifest(tests) {
  return {
    schemaVersion: 'hengzhun-test-manifest-v1',
    tests,
    historicalTests: [],
    ciExcluded: [],
    coverage: {
      tests: [...tests],
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

test('historical platform acceptance remains registered but cannot enter current coverage or overlap current tests', () => {
  const current = manifest(['scripts/a.test.cjs'])
  current.historicalTests = [{ path: 'scripts/history.test.cjs', reason: 'Archived platform acceptance, not current product execution.' }]
  assert.doesNotThrow(() => validateManifest(current, ['scripts/a.test.cjs', 'scripts/history.test.cjs']))
  assert.throws(() => validateManifest(current, ['scripts/a.test.cjs']), error => error.code === 'TEST_MANIFEST_DISCOVERY_MISMATCH')
  current.coverage.tests.push('scripts/history.test.cjs')
  assert.throws(() => validateManifest(current, ['scripts/a.test.cjs', 'scripts/history.test.cjs']), error => error.code === 'TEST_MANIFEST_COVERAGE_TEST_INVALID')
  current.coverage.tests.pop()
  current.historicalTests[0].path = 'scripts/a.test.cjs'
  assert.throws(() => validateManifest(current, ['scripts/a.test.cjs']), error => error.code === 'TEST_MANIFEST_HISTORY_INVALID')
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
