#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { currentWorkerCodeSet } = require('./i10-worker-code-set.cjs')

const root = path.resolve(__dirname, '..')
const CONTENT_SET_ALGORITHM = 'SHA256_SORTED_POSIX_PATH_NUL_RAW_BYTES_NUL'
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const posix = value => String(value).replaceAll('\\', '/')

function readJson(relative, productRoot = root) {
  return JSON.parse(fs.readFileSync(path.join(productRoot, ...posix(relative).split('/')), 'utf8'))
}

function fileHash(relative, productRoot = root) {
  return sha256(fs.readFileSync(path.join(productRoot, ...posix(relative).split('/'))))
}

function assertNoSecretKeys(value, label = 'controllerManifest') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecretKeys(item, `${label}[${index}]`))
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:password|passwd|secret|token|cookie|authorization|api.?key|credential(?!Ref)|endpoint|base.?url)/i.test(key)) {
      throw new Error(`I10_CONTROLLER_IDENTITY_SECRET_FIELD:${label}.${key}`)
    }
    assertNoSecretKeys(nested, `${label}.${key}`)
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
  return value
}

function canonicalHash(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'))
}

function aggregateContentSet(files, options = {}) {
  const productRoot = path.resolve(options.productRoot || root)
  const normalized = [...new Set(files.map(posix))].sort((left, right) => left.localeCompare(right, 'en'))
  const hash = crypto.createHash('sha256')
  for (const relative of normalized) {
    const absolute = path.resolve(productRoot, ...relative.split('/'))
    const boundary = path.relative(productRoot, absolute)
    if (!boundary || boundary.startsWith('..') || path.isAbsolute(boundary)) throw new Error(`I10_RELEASE_CODE_SET_PATH_INVALID:${relative}`)
    const bytes = typeof options.readFile === 'function' ? options.readFile(relative) : fs.readFileSync(absolute)
    hash.update(relative, 'utf8').update('\0').update(bytes).update('\0')
  }
  return Object.freeze({
    algorithm: CONTENT_SET_ALGORITHM,
    files: Object.freeze(normalized),
    fileCount: normalized.length,
    hash: hash.digest('hex')
  })
}

function releaseToolingFiles(productRoot) {
  const scriptsRoot = path.join(productRoot, 'scripts')
  return fs.readdirSync(scriptsRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && (entry.name === 'i9-lifecycle.cjs' || /^(?:i10-|(?:build|verify|refresh)-i10|(?:prepare|start|status|stop|import)-i10)[A-Za-z0-9._-]*\.(?:cjs|ps1|json)$/i.test(entry.name)))
    .map(entry => `scripts/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, 'en'))
}

function recursiveCodeFiles(productRoot, relativeRoot, extension) {
  const absoluteRoot = path.join(productRoot, ...relativeRoot.split('/'))
  const found = []
  const visit = (absoluteDirectory, relativeDirectory) => {
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) visit(path.join(absoluteDirectory, entry.name), relative)
      else if (entry.isFile() && entry.name.endsWith(extension)) found.push(relative)
    }
  }
  visit(absoluteRoot, relativeRoot)
  return found.sort((left, right) => left.localeCompare(right, 'en'))
}

function currentControllerIdentity(options = {}) {
  const productRoot = path.resolve(options.productRoot || root)
  const manifest = readJson('controller/controller-release-manifest-v1.json', productRoot)
  if (manifest.schemaVersion !== 'hengzhun-controller-release-manifest/v1') {
    throw new Error('I10_CONTROLLER_RELEASE_MANIFEST_VERSION_INVALID')
  }
  if (manifest.kind !== 'langgraph-deepagents-v1' || manifest.checkpointSchemaVersion !== '1') {
    throw new Error('I10_CONTROLLER_RELEASE_MANIFEST_INCOMPLETE')
  }
  assertNoSecretKeys(manifest)
  const files = [...new Set(manifest.releaseFiles || [])].sort((left, right) => left.localeCompare(right, 'en'))
  if (!files.length || files.some(relative => !relative.startsWith('controller/'))) {
    throw new Error('I10_CONTROLLER_RELEASE_FILE_SET_INVALID')
  }
  for (const required of [
    manifest.frameworkLockPath,
    manifest.graphSourcePath,
    manifest.toolPolicyPath,
    ...(manifest.promptPaths || []),
    'controller/controller-release-manifest-v1.json'
  ]) {
    if (!files.includes(required)) throw new Error(`I10_CONTROLLER_RELEASE_FILE_MISSING:${required}`)
  }
  const aggregate = aggregateContentSet(files, { productRoot, readFile: options.readFile })
  const promptAggregate = aggregateContentSet(manifest.promptPaths, { productRoot, readFile: options.readFile })
  const readBytes = relative => typeof options.readFile === 'function'
    ? options.readFile(relative)
    : fs.readFileSync(path.join(productRoot, ...posix(relative).split('/')))
  return Object.freeze({
    kind: manifest.kind,
    frameworkLockHash: sha256(readBytes(manifest.frameworkLockPath)),
    graphSourceHash: sha256(readBytes(manifest.graphSourcePath)),
    promptAndSkillsHash: promptAggregate.hash,
    toolPolicyHash: sha256(readBytes(manifest.toolPolicyPath)),
    modelConfigIdentity: Object.freeze(canonicalize(manifest.modelConfigIdentity)),
    checkpointSchemaVersion: manifest.checkpointSchemaVersion,
    controllerCodeSetAlgorithm: aggregate.algorithm,
    controllerCodeSetHash: aggregate.hash,
    controllerCodeSetFileCount: aggregate.fileCount,
    files: aggregate.files
  })
}

function currentReleaseCodeSet(options = {}) {
  const productRoot = path.resolve(options.productRoot || root)
  const workerCodeSet = currentWorkerCodeSet({ productRoot })
  const controllerIdentity = currentControllerIdentity({ productRoot })
  const groups = Object.freeze({
    controller: controllerIdentity.files,
    harness: Object.freeze([
      ...recursiveCodeFiles(productRoot, 'harness/src', '.ts'),
      ...recursiveCodeFiles(productRoot, 'dist/harness/src', '.js')
    ].sort((left, right) => left.localeCompare(right, 'en'))),
    mcp: Object.freeze(['contracts/mcp/hengzhun-i8.json', 'mcp/src/server.cjs', 'mcp/src/rf001-contract-adapter.cjs']),
    flowise: Object.freeze([
      'config/i9.runtime.example.json',
      'flowise/app/package.json',
      'flowise/app/package-lock.json',
      'flowise/i10/hengzhun-attachment-bridge-v1.js',
      'flowise/i10/flowise-runtime-fork-policy-v1.json',
      'flowise/i10/flowise-acquisition-policy-v1.json',
      'flowise/i10/node-runtime-manifest-v1.json',
      'flowise/i10/s9-portability-policy-v1.json',
      'flowise/stubs/extract-zip/index.js',
      'flowise/stubs/extract-zip/package.json',
      'flowise/stubs/xlsx/index.js',
      'flowise/stubs/xlsx/package.json',
      'scripts/apply-i9-flowise-overlays.cjs',
      'scripts/check-flowise-audit.cjs',
      'scripts/i10-acquire-flowise-runtime.ps1',
      'scripts/i10-flowise-advisory-disposition.cjs',
      'scripts/i10-flowise-runtime-policy.cjs',
      'scripts/i10-build-flowise-runtime-fork.cjs',
      'scripts/i10-flowise-runtime-probe.cjs'
    ]),
    releaseTooling: Object.freeze(releaseToolingFiles(productRoot)),
    worker: Object.freeze(['scripts/i10-worker-code-set-v1.json', ...workerCodeSet.files])
  })
  const groupHashes = Object.freeze({
    controller: controllerIdentity.controllerCodeSetHash,
    harness: aggregateContentSet(groups.harness, { productRoot }).hash,
    mcp: aggregateContentSet(groups.mcp, { productRoot }).hash,
    flowise: aggregateContentSet(groups.flowise, { productRoot }).hash,
    releaseTooling: aggregateContentSet(groups.releaseTooling, { productRoot }).hash,
    worker: workerCodeSet.workerCodeSetHash
  })
  const manifest = Object.freeze({
    schemaVersion: 'hengzhun-i10-release-code-set-manifest-v1',
    algorithm: CONTENT_SET_ALGORITHM,
    groups,
    workerCodeSetVersion: workerCodeSet.workerCodeSetVersion
  })
  const releaseCodeSetManifestHash = canonicalHash(manifest)
  const releaseCodeSetHash = canonicalHash({
    releaseCodeSetManifestHash,
    groupHashes,
    workerCodeSetManifestHash: workerCodeSet.workerCodeSetManifestHash,
    workerCodeSetHash: workerCodeSet.workerCodeSetHash
  })
  return Object.freeze({
    ...manifest,
    groupHashes,
    releaseCodeSetManifestHash,
    releaseCodeSetHash,
    releaseCodeSetFileCount: new Set(Object.values(groups).flat()).size,
    workerCodeSetVersion: workerCodeSet.workerCodeSetVersion,
    workerCodeSetManifestHash: workerCodeSet.workerCodeSetManifestHash,
    workerCodeSetHash: workerCodeSet.workerCodeSetHash,
    workerCodeSetFileCount: workerCodeSet.workerCodeSetFileCount
  })
}

function currentMigrationIdentity(options = {}) {
  const productRoot = path.resolve(options.productRoot || root)
  const migrationsRoot = path.join(productRoot, 'harness', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map(entry => {
      const match = entry.name.match(/^(\d+)_.+\.sql$/i)
      if (!match) throw new Error(`I10_MIGRATION_NAME_INVALID:${entry.name}`)
      return { relative: `harness/migrations/${entry.name}`, version: Number(match[1]) }
    })
    .sort((left, right) => left.relative.localeCompare(right.relative, 'en'))
  if (!migrationFiles.length) throw new Error('I10_MIGRATIONS_MISSING')
  const migrationVersion = Math.max(...migrationFiles.map(item => item.version))
  if (options.migrationVersion != null && Number(options.migrationVersion) !== migrationVersion) {
    throw new Error(`I10_MIGRATION_VERSION_OVERRIDE_DRIFT:${options.migrationVersion}:${migrationVersion}`)
  }
  const aggregate = aggregateContentSet(migrationFiles.map(item => item.relative), { productRoot })
  return Object.freeze({
    migrationVersion,
    migrationContentHash: aggregate.hash,
    migrationFileCount: aggregate.fileCount,
    migrationFiles: aggregate.files
  })
}

function currentReleaseIdentity(options = {}) {
  const productRoot = path.resolve(options.productRoot || root)
  const publication = readJson('flowise/i10/publication-manifest-v1.json', productRoot)
  const catalog = readJson('contracts/i10/case-catalog-v1.json', productRoot)
  const flowPath = String(publication.primaryFlowDataPath || '')
  if (!/^flowise\/i10\/agentflow-v\d+\.json$/.test(flowPath)) throw new Error('I10_RELEASE_FLOW_PATH_INVALID')
  const flow = readJson(flowPath, productRoot)
  const deployedHash = String(options.deployedHash || publication.deployedFlowDataSha256 || '')
  const sourceHash = fileHash(flowPath, productRoot)
  const codeSet = currentReleaseCodeSet({ productRoot })
  const controller = currentControllerIdentity({ productRoot })
  const migration = currentMigrationIdentity({ ...options, productRoot })
  const identity = {
    schemaVersion: 'hengzhun-i10-release-identity-v3',
    flowId: String(publication.flowId || ''),
    flowVersion: Number(publication.primaryFlowVersion),
    sourceFlowHash: sourceHash,
    deployedFlowHash: deployedHash,
    deploymentReady: Boolean(publication.deployed === true && /^[0-9a-f]{64}$/i.test(deployedHash)),
    normalizedFlowHash: canonicalHash(flow),
    controller,
    harnessCodeHash: codeSet.groupHashes.harness,
    mcpCodeHash: codeSet.groupHashes.mcp,
    flowiseRuntimeCodeHash: codeSet.groupHashes.flowise,
    releaseToolingCodeHash: codeSet.groupHashes.releaseTooling,
    releaseCodeSetManifestHash: codeSet.releaseCodeSetManifestHash,
    releaseCodeSetHash: codeSet.releaseCodeSetHash,
    releaseCodeSetFileCount: codeSet.releaseCodeSetFileCount,
    // Compatibility field retained for existing evidence readers. The governed
    // Worker identity below is authoritative for execution and readiness.
    workerCodeHash: fileHash('worker/src/i10-midscene-candidate-authoring.cjs', productRoot),
    workerCodeSetVersion: codeSet.workerCodeSetVersion,
    workerCodeSetManifestHash: codeSet.workerCodeSetManifestHash,
    workerCodeSetHash: codeSet.workerCodeSetHash,
    workerCodeSetFileCount: codeSet.workerCodeSetFileCount,
    migrationVersion: migration.migrationVersion,
    migrationContentHash: migration.migrationContentHash,
    migrationFileCount: migration.migrationFileCount,
    caseCatalogVersion: Number(catalog.catalogVersion),
    caseCatalogHash: canonicalHash(catalog)
  }
  identity.identityHash = canonicalHash(identity)
  if (!identity.flowId || !Number.isInteger(identity.flowVersion) || (options.requireDeployed !== false && !identity.deploymentReady)) throw new Error('I10_RELEASE_IDENTITY_INCOMPLETE')
  return identity
}

function sameReleaseIdentity(left, right) {
  const supported = new Set(['hengzhun-i10-release-identity-v1', 'hengzhun-i10-release-identity-v2', 'hengzhun-i10-release-identity-v3'])
  return Boolean(left && right && supported.has(left.schemaVersion) && left.schemaVersion === right.schemaVersion && left.identityHash === right.identityHash)
}

module.exports = {
  CONTENT_SET_ALGORITHM,
  root,
  aggregateContentSet,
  canonicalize,
  canonicalHash,
  currentControllerIdentity,
  currentMigrationIdentity,
  currentReleaseCodeSet,
  currentReleaseIdentity,
  sameReleaseIdentity
}

if (require.main === module) process.stdout.write(`${JSON.stringify(currentReleaseIdentity(), null, 2)}\n`)
