#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const productRoot = path.resolve(__dirname, '..', '..')
const release = require('../i10-release-identity.cjs')
const lifecycle = require('../i9-lifecycle.cjs')
const stage9 = require('../i10-stage9-portable.cjs')

const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const posix = value => String(value).replaceAll('\\', '/')

test('release identity binds every governed execution and publication code set', () => {
  const codeSet = release.currentReleaseCodeSet()
  const requiredByGroup = {
    controller: [
      'controller/package.json',
      'controller/package-lock.json',
      'controller/controller-release-manifest-v1.json',
      'controller/prompt-v1.txt',
      'controller/tool-policy-v1.json',
      'controller/src/agent-controller.mjs',
      'controller/src/controller-port.cjs',
      'controller/src/state-security.mjs',
      'controller/src/tool-policy.cjs'
    ],
    harness: [
      'harness/src/artifact-store.ts',
      'harness/src/errors.ts',
      'harness/src/schemas.ts',
      'harness/src/server.ts',
      'harness/src/i10/service.ts',
      'harness/src/service.ts',
      'dist/harness/src/artifact-store.js',
      'dist/harness/src/errors.js',
      'dist/harness/src/schemas.js',
      'dist/harness/src/server.js',
      'dist/harness/src/i10/service.js',
      'dist/harness/src/service.js'
    ],
    mcp: ['mcp/src/server.cjs', 'mcp/src/rf001-contract-adapter.cjs'],
    flowise: [
      'config/i9.runtime.example.json',
      'flowise/i10/hengzhun-attachment-bridge-v1.js',
      'flowise/i10/node-runtime-manifest-v1.json',
      'flowise/i10/s9-portability-policy-v1.json',
      'flowise/stubs/extract-zip/index.js',
      'flowise/stubs/extract-zip/package.json',
      'flowise/stubs/xlsx/index.js',
      'flowise/stubs/xlsx/package.json',
      'scripts/apply-i9-flowise-overlays.cjs'
    ]
  }
  for (const [group, files] of Object.entries(requiredByGroup)) {
    for (const file of files) assert.ok(codeSet.groups[group].includes(file), `${group} misses ${file}`)
    assert.match(codeSet.groupHashes[group], /^[0-9a-f]{64}$/)
  }
  const allHarnessSource = []
  const collectHarness = (absoluteDirectory, relativeDirectory, extension) => {
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) collectHarness(path.join(absoluteDirectory, entry.name), relative, extension)
      else if (entry.isFile() && entry.name.endsWith(extension)) allHarnessSource.push(relative)
    }
  }
  collectHarness(path.join(productRoot, 'harness', 'src'), 'harness/src', '.ts')
  collectHarness(path.join(productRoot, 'dist', 'harness', 'src'), 'dist/harness/src', '.js')
  assert.deepEqual(codeSet.groups.harness, allHarnessSource.sort((left, right) => left.localeCompare(right, 'en')))

  const governedScripts = fs.readdirSync(path.join(productRoot, 'scripts'), { withFileTypes: true })
    .filter(entry => entry.isFile() && /^(?:build-i10.*|verify-i10.*|i10-.*acceptance.*)\.(?:cjs|ps1)$/i.test(entry.name))
    .map(entry => `scripts/${entry.name}`)
  for (const file of governedScripts) assert.ok(codeSet.groups.releaseTooling.includes(file), `release tooling misses ${file}`)
  for (const file of [
    'scripts/i10-agentflow-publish.cjs',
    'scripts/i10-acquire-flowise-runtime.ps1',
    'scripts/i10-flowise-advisory-disposition.cjs',
    'scripts/i10-flowise-runtime-probe.cjs',
    'scripts/i10-stage8-live.cjs',
    'scripts/i10-stage8-orchestrator.cjs',
    'scripts/i10-reference-contracts.cjs',
    'scripts/i10-release-identity.cjs',
    'scripts/i10-provision-node-runtimes.ps1',
    'scripts/i9-lifecycle.cjs',
    'scripts/prepare-i10.ps1'
  ]) assert.ok(codeSet.groups.releaseTooling.includes(file), `release tooling misses ${file}`)
  assert.ok(codeSet.groups.worker.includes('scripts/i10-worker-code-set-v1.json'))
  assert.match(codeSet.releaseCodeSetManifestHash, /^[0-9a-f]{64}$/)
  assert.match(codeSet.releaseCodeSetHash, /^[0-9a-f]{64}$/)

  const identity = release.currentReleaseIdentity({ requireDeployed: false })
  assert.equal(identity.harnessCodeHash, codeSet.groupHashes.harness)
  assert.equal(identity.mcpCodeHash, codeSet.groupHashes.mcp)
  assert.equal(identity.flowiseRuntimeCodeHash, codeSet.groupHashes.flowise)
  assert.equal(identity.releaseToolingCodeHash, codeSet.groupHashes.releaseTooling)
  assert.equal(identity.releaseCodeSetHash, codeSet.releaseCodeSetHash)
  assert.equal(identity.controller.controllerCodeSetHash, codeSet.groupHashes.controller)
  assert.equal(identity.controller.kind, 'langgraph-deepagents-v1')
})

test('content-set and migration identities reject same-length byte drift and select the highest migration', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i10-release-hash-'))
  try {
    fs.mkdirSync(path.join(temporaryRoot, 'harness', 'migrations'), { recursive: true })
    fs.writeFileSync(path.join(temporaryRoot, 'a.txt'), 'alpha')
    const before = release.aggregateContentSet(['a.txt'], { productRoot: temporaryRoot })
    fs.writeFileSync(path.join(temporaryRoot, 'a.txt'), 'omega')
    const after = release.aggregateContentSet(['a.txt'], { productRoot: temporaryRoot })
    assert.notEqual(after.hash, before.hash)

    const first = path.join(temporaryRoot, 'harness', 'migrations', '001_core.sql')
    const highest = path.join(temporaryRoot, 'harness', 'migrations', '012_latest.sql')
    fs.writeFileSync(first, 'select 1;')
    fs.writeFileSync(highest, 'select 2;')
    const migrationBefore = release.currentMigrationIdentity({ productRoot: temporaryRoot })
    fs.writeFileSync(highest, 'select 9;')
    const migrationAfter = release.currentMigrationIdentity({ productRoot: temporaryRoot })
    assert.equal(migrationBefore.migrationVersion, 12)
    assert.equal(migrationBefore.migrationFileCount, 2)
    assert.notEqual(migrationAfter.migrationContentHash, migrationBefore.migrationContentHash)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('lifecycle fingerprints are projections of the shared release code set', () => {
  const codeSet = release.currentReleaseCodeSet()
  assert.equal(lifecycle.serviceFingerprint('harness'), codeSet.groupHashes.harness)
  assert.equal(lifecycle.serviceFingerprint('mcp'), codeSet.groupHashes.mcp)
  assert.equal(lifecycle.serviceFingerprint('flowise'), codeSet.groupHashes.flowise)
  assert.equal(lifecycle.serviceFingerprint('worker'), codeSet.workerCodeSetHash)
})

test('PREPARE reports SHA-256 fingerprints for migrations and the authoritative v7-to-v6 input chain', () => {
  const output = childProcess.execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', path.join(productRoot, 'scripts', 'prepare-i10.ps1'),
    '-FingerprintOnly'
  ], { cwd: productRoot, encoding: 'utf8', windowsHide: true })
  const report = JSON.parse(output)
  const records = [...report.migrations, ...report.agentflowAuthority, ...report.runtimeAuthority]
  const byPath = new Map(records.map(record => [record.path, record]))
  const required = [
    'scripts/build-i10-agentflow-v7.cjs',
    'scripts/build-i10-agentflow-v6.cjs',
    'scripts/i10-case-draft-normalizer.cjs',
    'scripts/i10-reference-contracts.cjs',
    'contracts/i10/opaque-reference-v1.json',
    'flowise/i10/agentflow-v5.json',
    'config/i9.runtime.example.json',
    'flowise/i10/node-runtime-manifest-v1.json',
    'flowise/i10/s9-portability-policy-v1.json',
    'scripts/i10-provision-node-runtimes.ps1',
    'scripts/i9-lifecycle.cjs'
  ]
  if (fs.existsSync(path.join(productRoot, 'flowise', 'i10', 'agentflow-v5-layout.json'))) required.push('flowise/i10/agentflow-v5-layout.json')
  for (const relative of required) {
    assert.equal(byPath.get(relative)?.sha256, sha256File(path.join(productRoot, ...relative.split('/'))), `fingerprint mismatch: ${relative}`)
  }
  const migrations = fs.readdirSync(path.join(productRoot, 'harness', 'migrations')).filter(name => name.endsWith('.sql'))
  assert.equal(report.migrations.length, migrations.length)
  assert.equal(report.migrationVersion, Math.max(...migrations.map(name => Number(name.match(/^(\d+)_/)?.[1]))))
  assert.match(report.inputFingerprint, /^[0-9a-f]{64}$/)
  assert.doesNotMatch(JSON.stringify(report), /(?:file)?length/i)
})

test('Node runtime manifest pins official archives and Stage9 carries both service runtimes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i10', 'node-runtime-manifest-v1.json'), 'utf8'))
  const policy = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i10', 's9-portability-policy-v1.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 'hengzhun-i10-node-runtime-manifest-v1')
  assert.equal(manifest.runtimes.core.version, 'v20.20.2')
  assert.equal(manifest.runtimes.flowise.version, 'v24.19.0')
  for (const runtime of Object.values(manifest.runtimes)) {
    assert.match(runtime.url, /^https:\/\/nodejs\.org\/dist\//)
    assert.match(runtime.sha256, /^[0-9a-f]{64}$/)
    assert.ok(policy.runtimeTrees.includes(runtime.targetDirectory))
  }
})

test('Stage9 discovers an arbitrary repository root and includes non-ignored untracked governed files', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i10-stage9-repo-'))
  const repositoryRoot = path.join(temporaryRoot, 'repository')
  const nestedProduct = path.join(repositoryRoot, 'one', 'two', 'product')
  try {
    fs.mkdirSync(path.join(nestedProduct, 'harness', 'src'), { recursive: true })
    fs.mkdirSync(path.join(nestedProduct, 'docs'), { recursive: true })
    childProcess.execFileSync('git.exe', ['init', '--quiet', repositoryRoot], { windowsHide: true })
    fs.writeFileSync(path.join(repositoryRoot, '.gitignore'), 'one/two/product/harness/src/ignored.js\n')
    fs.writeFileSync(path.join(nestedProduct, 'harness', 'src', 'tracked.js'), 'tracked\n')
    fs.writeFileSync(path.join(nestedProduct, 'harness', 'src', 'untracked.js'), 'untracked\n')
    fs.writeFileSync(path.join(nestedProduct, 'harness', 'src', 'ignored.js'), 'ignored\n')
    fs.writeFileSync(path.join(nestedProduct, 'docs', 'untracked.md'), 'governed worktree documentation\n')
    childProcess.execFileSync('git.exe', ['-c', 'core.autocrlf=false', '-C', repositoryRoot, 'add', '.gitignore', 'one/two/product/harness/src/tracked.js'], { windowsHide: true })

    const context = stage9.discoverRepositoryContext(nestedProduct)
    assert.equal(context.repoRoot, fs.realpathSync.native(repositoryRoot))
    assert.equal(context.productRoot, fs.realpathSync.native(nestedProduct))
    assert.equal(context.productRepoPath, 'one/two/product')
    const outside = path.join(temporaryRoot, 'outside')
    fs.mkdirSync(outside)
    assert.throws(() => stage9.discoverRepositoryContext(outside, {
      run: () => ({ status: 0, stdout: repositoryRoot }),
    }), /I10_S9_PRODUCT_OUTSIDE_GIT_ROOT/)
    const files = stage9.worktreeFilesFor(['harness/src'], context)
      .map(file => posix(path.relative(context.repoRoot, path.join(context.repoRoot, ...file.split('/')))))
    assert.ok(files.includes('one/two/product/harness/src/tracked.js'))
    assert.ok(files.includes('one/two/product/harness/src/untracked.js'))
    assert.ok(!files.includes('one/two/product/harness/src/ignored.js'))
    const portableFiles = stage9.portableWorktreeFiles(context)
    assert.ok(portableFiles.includes('one/two/product/docs/untracked.md'))
    assert.ok(!portableFiles.includes('one/two/product/harness/src/ignored.js'))
    const snapshotBefore = stage9.worktreeContentSnapshot(context)
    const documentation = fs.readFileSync(path.join(nestedProduct, 'docs', 'untracked.md'))
    documentation[0] = documentation[0] === 0x67 ? 0x47 : 0x67
    fs.writeFileSync(path.join(nestedProduct, 'docs', 'untracked.md'), documentation)
    const snapshotAfter = stage9.worktreeContentSnapshot(context)
    assert.equal(snapshotAfter.fileCount, snapshotBefore.fileCount)
    assert.notEqual(snapshotAfter.sha256, snapshotBefore.sha256)

    const stagingRoot = stage9.createExternalStagingRoot(nestedProduct)
    assert.ok(path.relative(nestedProduct, stagingRoot).startsWith('..'))
    assert.ok(path.relative(path.join(nestedProduct, '.release'), stagingRoot).startsWith('..'))
    fs.rmSync(stagingRoot, { recursive: true, force: true })
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('Stage9 artifact promotion rolls back every target when an atomic rename fails', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i10-stage9-promote-'))
  const releaseRoot = path.join(temporaryRoot, '.release')
  const stagingRoot = path.join(temporaryRoot, '.stage')
  const names = ['candidate', 'release.zip', 'release.zip.sha256']
  try {
    fs.mkdirSync(releaseRoot, { recursive: true })
    fs.mkdirSync(stagingRoot, { recursive: true })
    for (const name of names) {
      fs.writeFileSync(path.join(releaseRoot, name), `old:${name}`)
      fs.writeFileSync(path.join(stagingRoot, name), `new:${name}`)
    }
    let injected = false
    assert.throws(() => stage9.promoteReleaseArtifacts({
      stagingRoot,
      releaseRoot,
      artifactNames: names,
      renameSync(source, target) {
        if (!injected && source === path.join(stagingRoot, names[1])) {
          injected = true
          throw new Error('INJECTED_RENAME_FAILURE')
        }
        fs.renameSync(source, target)
      }
    }), /INJECTED_RENAME_FAILURE/)
    for (const name of names) assert.equal(fs.readFileSync(path.join(releaseRoot, name), 'utf8'), `old:${name}`)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
