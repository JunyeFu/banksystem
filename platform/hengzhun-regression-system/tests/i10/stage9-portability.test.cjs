'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { forbiddenCoreFindings, preflight } = require('../../scripts/i10-stage9-portable.cjs')

const root = path.resolve(__dirname, '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('S9 policy defines a platform contract without machine-specific acceptance', () => {
  const policy = JSON.parse(read('flowise/i10/s9-portability-policy-v1.json'))
  assert.equal(policy.machineSpecificAcceptanceRequired, false)
  assert.equal(policy.portabilityContract, 'PATH_INDEPENDENT_MODEL_CONNECTION_SECRET_FREE_SELF_CONTAINED')
  assert.deepEqual(policy.requiredPathScenarios, ['ascii-path', 'path-with-spaces', 'path-with-chinese-characters'])
  assert.ok(policy.forbiddenGlobalDependencies.includes('wsl'))
  assert.ok(policy.forbiddenGlobalDependencies.includes('docker'))
  assert.ok(!policy.trackedFiles.some(value => /machine-acceptance/i.test(value)))
  assert.ok(!policy.emptyRuntimeDirectories.some(value => /machine-record/i.test(value)))
})

test('S9 packager is frozen-source bound and emits folder, ZIP, checksum, SBOM and license inventory', () => {
  const source = read('scripts/i10-stage9-portable.cjs')
  assert.match(source, /I10_S9_SOURCE_NOT_FROZEN/)
  assert.match(source, /--untracked-files=all/)
  assert.match(source, /cyclonedx-sbom\.json/)
  assert.match(source, /licenses\.json/)
  assert.match(source, /THIRD-PARTY-NOTICES\.md/)
  assert.match(source, /tar\.exe/)
  assert.match(source, /archiveSha256/)
  assert.match(source, /I10_PORTABLE_RELEASE_VERIFIED/)
  assert.doesNotMatch(source, /second-computer|machine-record|machine-acceptance/i)
  assert.doesNotMatch(source, /npm\s+(?:install|ci)/i)
})

test('generated lifecycle wrappers are relative and use I10 entrypoints', () => {
  const source = read('scripts/i10-stage9-portable.cjs')
  for (const entrypoint of ['prepare-i10.ps1', 'start-i10.ps1', 'status-i10.ps1', 'stop-i10.ps1']) assert.match(source, new RegExp(entrypoint.replace('.', '\\.')))
  assert.match(source, /%~dp0runtime/)
  assert.match(source, /%~dp0scripts/)
  assert.doesNotMatch(source, /D:\\\\Agent\\\\banksystem/)
})

test('S9 scanner fails closed on secrets, source-machine paths, runtime files and forbidden development paths', () => {
  const fixture = path.join(root, '.data', 'tests', `i10-s9-scan-${process.pid}`)
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.mkdirSync(path.join(fixture, 'config'), { recursive: true })
  fs.mkdirSync(path.join(fixture, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'config', 'secret.json'), JSON.stringify({ token: `sk-${'1234567890abcdefghijkl'}` }), 'utf8')
  fs.writeFileSync(path.join(fixture, 'config', 'path.md'), 'C:\\Users\\example\\private', 'utf8')
  fs.writeFileSync(path.join(fixture, 'config', 'state.sqlite'), 'not-a-database', 'utf8')
  fs.writeFileSync(path.join(fixture, 'tests', 'development.txt'), 'development-only', 'utf8')
  try {
    const findings = forbiddenCoreFindings(fixture)
    assert.ok(findings.some(item => item.startsWith('SECRET_CONTENT:')))
    assert.ok(findings.some(item => item.startsWith('ABSOLUTE_PATH:')))
    assert.ok(findings.some(item => item.startsWith('FORBIDDEN_FILE:')))
    assert.ok(findings.some(item => item.startsWith('FORBIDDEN_TOP_LEVEL:')))
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test('S9 scanner permits pinned runtime dependency source names but still rejects product storage state', () => {
  const fixture = path.join(root, '.data', 'tests', `i10-s9-runtime-name-${process.pid}`)
  fs.rmSync(fixture, { recursive: true, force: true })
  const runtimeFile = path.join(fixture, 'flowise', 'app', 'node_modules', 'package', 'useLocalStorageState.js')
  const productState = path.join(fixture, 'config', 'browser-storage-state.json')
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true })
  fs.mkdirSync(path.dirname(productState), { recursive: true })
  fs.writeFileSync(runtimeFile, 'module.exports = {}\n', 'utf8')
  fs.writeFileSync(productState, '{}\n', 'utf8')
  try {
    const findings = forbiddenCoreFindings(fixture)
    assert.ok(!findings.some(item => item.includes('useLocalStorageState.js')))
    assert.ok(findings.includes('FORBIDDEN_FILE:config/browser-storage-state.json'))
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test('S9 preflight is read-only and truthfully reports source freeze readiness', () => {
  const releaseFolder = path.join(root, '.release', 'hengzhun-regression-system-windows-x64-i10')
  const archive = path.join(root, '.release', 'hengzhun-regression-system-windows-x64-i10.zip')
  const before = [fs.existsSync(releaseFolder), fs.existsSync(archive)]
  const result = preflight()
  assert.ok(['I10_S9_PREFLIGHT_READY', 'I10_S9_PREFLIGHT_BLOCKED_SOURCE_NOT_FROZEN'].includes(result.status))
  assert.equal(result.machineSpecificAcceptanceRequired, false)
  assert.equal(result.exportCreated, false)
  assert.equal(result.archiveCreated, false)
  assert.deepEqual(result.missingHostTools, [])
  assert.deepEqual([fs.existsSync(releaseFolder), fs.existsSync(archive)], before)
})

test('S9 scanner and hashing are path-safe in a directory containing spaces and Chinese characters', () => {
  const fixture = path.join(root, '.data', 'tests', `衡准 便携路径 ${process.pid}`)
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.mkdirSync(path.join(fixture, 'config'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'config', 'portable.json'), JSON.stringify({ status: 'ok' }), 'utf8')
  try {
    assert.deepEqual(forbiddenCoreFindings(fixture), [])
    const { hashTree } = require('../../scripts/i10-stage9-portable.cjs')
    const first = hashTree(fixture)
    const second = hashTree(fixture)
    assert.equal(first.sha256, second.sha256)
    assert.equal(first.fileCount, 1)
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
