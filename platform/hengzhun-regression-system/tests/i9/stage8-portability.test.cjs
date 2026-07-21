'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { forbiddenCoreFindings } = require('../../scripts/i9-stage8-portable.cjs')

const root = path.resolve(__dirname, '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('P8 policy packages only governed product/runtime surfaces and excludes development/runtime state', () => {
  const policy = JSON.parse(read('flowise/i9/p8-portability-policy-v1.json'))
  assert.equal(policy.sourceCommitRequired, true)
  for (const required of ['flowise/app', 'runtime/node-v20.20.2-win-x64', 'runtime/browsers', 'runtime/node_modules', 'node_modules', 'dist']) assert.ok(policy.runtimeTrees.includes(required))
  for (const forbidden of ['.git', '.env', 'probes', 'tests', 'coze', 'rag']) assert.ok(policy.forbiddenPathSegments.includes(forbidden))
  assert.ok(policy.emptyRuntimeDirectories.every(item => item.startsWith('.data/') || item === 'acceptance/machine-records'))
})

test('P8 packager is commit-bound, uses a whitelist and emits hashes plus CycloneDX', () => {
  const source = read('scripts/i9-stage8-portable.cjs')
  assert.match(source, /I9_P8_TRACKED_PRODUCT_TREE_NOT_CLEAN/)
  assert.match(source, /git\.exe/)
  assert.match(source, /cyclonedx-sbom\.json/)
  assert.match(source, /files\.sha256\.json/)
  assert.match(source, /robocopy\.exe/)
  assert.doesNotMatch(source, /npm\s+(?:install|ci)/i)
})

test('P8 machine acceptance uses bundled runtime, four loopback services, Playwright and dual SQLite restore', () => {
  const source = read('scripts/i9-stage8-machine-acceptance.cjs')
  assert.match(source, /runtime', 'node-v20\.20\.2-win-x64', 'node\.exe/)
  assert.match(source, /FOUR_SERVICE_LOOPBACK_HEALTH/)
  assert.match(source, /BUNDLED_PLAYWRIGHT_CHROMIUM_E2E/)
  assert.match(source, /DUAL_SQLITE_BACKUP_RESTORE/)
  assert.match(source, /externalModelCredentialUsed: false/)
  assert.match(source, /second-computer/)
})

test('P8 content scanner fails closed on secrets, absolute user paths and runtime databases', () => {
  const fixture = path.join(root, '.data', 'tests', `i9-p8-scan-${process.pid}`)
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.mkdirSync(path.join(fixture, 'config'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'config', 'secret.json'), JSON.stringify({ token: `sk-${'1234567890abcdefghijkl'}` }), 'utf8')
  fs.writeFileSync(path.join(fixture, 'config', 'path.md'), 'C:\\Users\\example\\private', 'utf8')
  fs.writeFileSync(path.join(fixture, 'config', 'state.sqlite'), 'not-a-database', 'utf8')
  try {
    const findings = forbiddenCoreFindings(fixture)
    assert.ok(findings.some(item => item.startsWith('SECRET_CONTENT:')))
    assert.ok(findings.some(item => item.startsWith('ABSOLUTE_PATH:')))
    assert.ok(findings.some(item => item.startsWith('RUNTIME_FILE:')))
  } finally { fs.rmSync(fixture, { recursive: true, force: true }) }
})
