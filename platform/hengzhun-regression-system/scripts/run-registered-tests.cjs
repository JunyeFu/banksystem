#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const productRoot = path.resolve(__dirname, '..')
const manifestPath = path.join(__dirname, 'verification', 'test-manifest.json')
const testNamePattern = /(?:\.test|\.selftest)\.cjs$/
// The serial Journey fixture file exceeds 180s on the measured Windows CI runner.
const REGISTERED_TEST_TIMEOUT_MS = 300_000

function posix(value) {
  return String(value).replaceAll(path.sep, '/')
}

function fail(code, details = []) {
  const suffix = details.length ? `\n${details.map(item => `  - ${item}`).join('\n')}` : ''
  throw Object.assign(new Error(`${code}${suffix}`), { code, details })
}

function walk(directory, result = []) {
  if (!fs.existsSync(directory)) return result
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(absolute, result)
    else if (entry.isFile() && testNamePattern.test(entry.name)) result.push(posix(path.relative(productRoot, absolute)))
  }
  return result
}

function discoverTests() {
  return [...walk(path.join(productRoot, 'scripts')), ...walk(path.join(productRoot, 'tests'))].sort()
}

function loadManifest() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.schemaVersion !== 'hengzhun-test-manifest-v1' || !Array.isArray(manifest.tests)) {
    fail('TEST_MANIFEST_SCHEMA_INVALID')
  }
  return manifest
}

function assertUniqueSorted(items, label) {
  const duplicates = items.filter((item, index) => items.indexOf(item) !== index)
  if (duplicates.length) fail(`${label}_DUPLICATE`, [...new Set(duplicates)])
  const sorted = [...items].sort()
  if (JSON.stringify(sorted) !== JSON.stringify(items)) fail(`${label}_NOT_SORTED`)
}

function validateManifest(manifest, discovered = discoverTests()) {
  assertUniqueSorted(manifest.tests, 'TEST_MANIFEST')
  if (!Array.isArray(manifest.historicalTests)) fail('TEST_MANIFEST_HISTORY_INVALID')
  const historicalPaths = manifest.historicalTests.map(entry => entry?.path)
  assertUniqueSorted(historicalPaths, 'TEST_MANIFEST_HISTORY')
  for (const entry of manifest.historicalTests) {
    if (typeof entry?.path !== 'string' || typeof entry?.reason !== 'string' || entry.reason.trim().length < 20 || manifest.tests.includes(entry.path)) {
      fail('TEST_MANIFEST_HISTORY_INVALID', [JSON.stringify(entry)])
    }
  }
  const registered = new Set([...manifest.tests, ...historicalPaths])
  const actual = new Set(discovered)
  const unregistered = discovered.filter(file => !registered.has(file))
  const missing = [...registered].filter(file => !actual.has(file))
  if (unregistered.length || missing.length) {
    fail('TEST_MANIFEST_DISCOVERY_MISMATCH', [
      ...unregistered.map(file => `unregistered:${file}`),
      ...missing.map(file => `missing:${file}`)
    ])
  }

  const exclusions = Array.isArray(manifest.ciExcluded) ? manifest.ciExcluded : []
  const exclusionPaths = exclusions.map(item => item?.path)
  assertUniqueSorted(exclusionPaths, 'TEST_MANIFEST_CI_EXCLUSIONS')
  for (const entry of exclusions) {
    if (!manifest.tests.includes(entry?.path) || typeof entry?.reason !== 'string' || entry.reason.trim().length < 20) {
      fail('TEST_MANIFEST_CI_EXCLUSION_INVALID', [JSON.stringify(entry)])
    }
  }

  const coverageTests = manifest.coverage?.tests
  const thresholds = manifest.coverage?.thresholds
  if (!Array.isArray(coverageTests) || !thresholds) fail('TEST_MANIFEST_COVERAGE_INVALID')
  assertUniqueSorted(coverageTests, 'TEST_MANIFEST_COVERAGE_TESTS')
  for (const file of coverageTests) {
    if (!manifest.tests.includes(file) || exclusionPaths.includes(file)) fail('TEST_MANIFEST_COVERAGE_TEST_INVALID', [file])
  }
  for (const name of ['lines', 'branches', 'functions']) {
    if (!Number.isFinite(thresholds[name]) || thresholds[name] < 50 || thresholds[name] > 100) {
      fail('TEST_MANIFEST_COVERAGE_THRESHOLD_INVALID', [`${name}:${thresholds[name]}`])
    }
  }
  return manifest
}

function validatePackageTestScripts() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'))
  const forbidden = /(?:build-i10-agentflow|npm\s+run\s+(?:build|generate:)|\b(?:publish|prepare|package):|--record\b)/i
  const violations = Object.entries(packageJson.scripts || {})
    .filter(([name, command]) => name.startsWith('test:') && forbidden.test(String(command)))
    .map(([name, command]) => `${name}:${command}`)
  if (violations.length) fail('TEST_SCRIPT_MUTATOR_FORBIDDEN', violations)
  const unmanagedNode = /(^|(?:&&|\|\|)\s+)node(?=\s)/i
  const unmanaged = Object.entries(packageJson.scripts || {})
    .filter(([, command]) => unmanagedNode.test(String(command)))
    .map(([name, command]) => `${name}:${command}`)
  if (unmanaged.length) fail('PACKAGE_SCRIPT_UNMANAGED_NODE_FORBIDDEN', unmanaged)
}

function releaseStateFiles() {
  const directory = path.join(productRoot, 'flowise', 'i10')
  const names = fs.readdirSync(directory)
    .filter(name => /^agentflow-v\d+(?:-layout)?\.json$/.test(name) || name === 'publication-manifest-v1.json')
    .sort()
  return names.map(name => path.join(directory, name))
}

function releaseStateSnapshot() {
  return Object.fromEntries(releaseStateFiles().map(file => [
    posix(path.relative(productRoot, file)),
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  ]))
}

function assertReleaseStateUnchanged(before, after) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const changed = paths.filter(file => before[file] !== after[file])
  if (changed.length) fail('TEST_MUTATED_RELEASE_STATE', changed.map(file => `${file}:${before[file] || 'MISSING'}->${after[file] || 'MISSING'}`))
}

function parseCoverage(output) {
  const line = String(output).split(/\r?\n/).find(item => /(?:^|\s)all files\s*\|/i.test(item))
  if (!line) fail('TEST_COVERAGE_SUMMARY_MISSING')
  const values = line.slice(line.search(/all files\s*\|/i)).split('|').slice(1, 4).map(value => Number(value.trim()))
  if (values.length !== 3 || values.some(value => !Number.isFinite(value))) fail('TEST_COVERAGE_SUMMARY_INVALID', [line])
  return { lines: values[0], branches: values[1], functions: values[2] }
}

function assertCoverage(summary, thresholds) {
  const failures = Object.entries(thresholds)
    .filter(([name, threshold]) => summary[name] < threshold)
    .map(([name, threshold]) => `${name}:${summary[name]}<${threshold}`)
  if (failures.length) fail('TEST_COVERAGE_THRESHOLD_NOT_MET', failures)
}

function assertTapSuccess(output) {
  const totals = Object.fromEntries([...String(output).matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)]
    .map(([, name, value]) => [name, Number(value)]))
  if (!(totals.tests > 0) || totals.pass !== totals.tests ||
      ['fail', 'cancelled', 'skipped', 'todo'].some(name => totals[name] !== 0)) {
    fail('NESTED_TEST_SUMMARY_NOT_PASSED')
  }
  return totals
}

function run(mode, manifest) {
  const excluded = new Set(manifest.ciExcluded.map(item => item.path))
  let files
  if (mode === 'coverage') files = manifest.coverage.tests
  else if (mode === 'runtime') files = manifest.tests.filter(file => excluded.has(file))
  else files = manifest.tests.filter(file => !excluded.has(file))

  if (mode !== 'runtime' && excluded.size) {
    for (const entry of manifest.ciExcluded) process.stdout.write(`CI prerequisite exclusion: ${entry.path} — ${entry.reason}\n`)
  }
  const args = [
    ...(mode === 'coverage' ? ['--experimental-test-coverage'] : []),
    '--test',
    '--test-concurrency=1',
    `--test-timeout=${REGISTERED_TEST_TIMEOUT_MS}`,
    ...files
  ]
  const before = releaseStateSnapshot()
  const result = spawnSync(process.execPath, args, {
    cwd: productRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: mode === 'coverage' ? 'utf8' : undefined,
    stdio: mode === 'coverage' ? 'pipe' : 'inherit',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  })
  if (mode === 'coverage') {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
  }
  const after = releaseStateSnapshot()
  assertReleaseStateUnchanged(before, after)
  if (result.error) throw result.error
  if (result.status !== 0) fail('REGISTERED_TESTS_FAILED', [`exit:${result.status}`])
  if (mode === 'coverage') {
    const summary = parseCoverage(`${result.stdout || ''}\n${result.stderr || ''}`)
    assertCoverage(summary, manifest.coverage.thresholds)
    process.stdout.write(`Coverage gate passed: ${JSON.stringify(summary)}\n`)
  }
  process.stdout.write(`Release state unchanged: ${JSON.stringify(after)}\n`)
}

function main() {
  const mode = process.argv[2] || 'run'
  if (!['check', 'run', 'coverage', 'runtime'].includes(mode)) fail('TEST_RUNNER_MODE_INVALID', [mode])
  const manifest = validateManifest(loadManifest())
  validatePackageTestScripts()
  if (mode === 'check') {
    process.stdout.write(`Test manifest complete: ${manifest.tests.length + manifest.historicalTests.length} registered, ${manifest.tests.length - manifest.ciExcluded.length} CI-runnable, ${manifest.ciExcluded.length} governed-runtime, ${manifest.historicalTests.length} historical-only.\n`)
    return
  }
  run(mode, manifest)
}

if (require.main === module) {
  try { main() }
  catch (error) {
    process.stderr.write(`${error?.stack || error}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  REGISTERED_TEST_TIMEOUT_MS,
  assertCoverage,
  assertTapSuccess,
  assertReleaseStateUnchanged,
  discoverTests,
  parseCoverage,
  releaseStateSnapshot,
  validateManifest,
  validatePackageTestScripts
}
