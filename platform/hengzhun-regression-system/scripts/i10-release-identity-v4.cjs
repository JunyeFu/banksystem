#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const posix = (value) => String(value).replaceAll('\\', '/')
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value
const canonicalHash = (value) => sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'))
const REPOSITORY_FILE_PREFIX = 'repo:'
const EXCLUDED_REPOSITORY_DIRECTORIES = new Set(['.data', '.git', 'dist', 'node_modules', 'target'])

function repositoryRootFor(productRoot) {
  return path.resolve(productRoot, '..', '..')
}

function resolveIdentityFile(productRoot, relative) {
  const normalized = posix(relative)
  if (normalized.startsWith(REPOSITORY_FILE_PREFIX)) {
    const repositoryRelative = normalized.slice(REPOSITORY_FILE_PREFIX.length)
    if (!repositoryRelative || path.posix.isAbsolute(repositoryRelative) || repositoryRelative.split('/').includes('..')) {
      throw new Error(`I10_V4_REPOSITORY_PATH_INVALID:${normalized}`)
    }
    const repositoryRoot = repositoryRootFor(productRoot)
    const resolved = path.resolve(repositoryRoot, ...repositoryRelative.split('/'))
    if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`I10_V4_REPOSITORY_PATH_INVALID:${normalized}`)
    }
    return resolved
  }
  return path.resolve(productRoot, ...normalized.split('/'))
}

function repositoryFiles(productRoot, entries) {
  const repositoryRoot = repositoryRootFor(productRoot)
  const found = []
  function visit(absolute, repositoryRelative) {
    const stat = fs.statSync(absolute)
    if (stat.isFile()) {
      found.push(`${REPOSITORY_FILE_PREFIX}${posix(repositoryRelative)}`)
      return
    }
    if (!stat.isDirectory()) throw new Error(`I10_V4_REPOSITORY_ENTRY_INVALID:${repositoryRelative}`)
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      if (entry.isDirectory() && EXCLUDED_REPOSITORY_DIRECTORIES.has(entry.name)) continue
      const nextRelative = posix(path.posix.join(repositoryRelative, entry.name))
      if (/(?:^|\/)(?:\.env(?:\.|$)|.*credential-store.*|.*secret.*)(?:\/|$)/i.test(nextRelative)) {
        throw new Error(`I10_V4_FORBIDDEN_PATH:${nextRelative}`)
      }
      if (entry.isDirectory() || entry.isFile()) visit(path.join(absolute, entry.name), nextRelative)
    }
  }
  for (const entry of entries || []) {
    const repositoryRelative = posix(entry)
    if (!repositoryRelative || path.posix.isAbsolute(repositoryRelative) || repositoryRelative.split('/').includes('..')) {
      throw new Error(`I10_V4_REPOSITORY_PATH_INVALID:${repositoryRelative}`)
    }
    const absolute = path.resolve(repositoryRoot, ...repositoryRelative.split('/'))
    if (absolute !== repositoryRoot && !absolute.startsWith(`${repositoryRoot}${path.sep}`)) {
      throw new Error(`I10_V4_REPOSITORY_PATH_INVALID:${repositoryRelative}`)
    }
    visit(absolute, repositoryRelative)
  }
  return found
}

function recursiveFiles(productRoot, relativeRoot, extension) {
  const found = []
  function visit(absolute, relative) {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`
      if (entry.isDirectory()) visit(path.join(absolute, entry.name), next)
      else if (entry.isFile() && entry.name.endsWith(extension)) found.push(next)
    }
  }
  visit(path.join(productRoot, ...relativeRoot.split('/')), relativeRoot)
  return found
}

function aggregate(files, { productRoot, readFile } = {}) {
  const normalized = [...new Set(files.map(posix))].sort((a, b) => a.localeCompare(b, 'en'))
  const hash = crypto.createHash('sha256')
  for (const relative of normalized) {
    if (relative.includes('/.data/') || relative.startsWith('.data/') || /(?:secret|credential-store)/i.test(relative)) throw new Error(`I10_V4_FORBIDDEN_PATH:${relative}`)
    const absolute = resolveIdentityFile(productRoot, relative)
    const bytes = readFile ? readFile(relative, absolute) : fs.readFileSync(absolute)
    hash.update(relative).update('\0').update(bytes).update('\0')
  }
  return Object.freeze({ files: Object.freeze(normalized), fileCount: normalized.length, hash: hash.digest('hex') })
}

function assertNoSecretKeys(value, label = 'identity') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecretKeys(item, `${label}[${index}]`))
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:password|secret|token|cookie|authorization|api.?key|credential(?!Ref))/i.test(key)) throw new Error(`I10_V4_SECRET_FIELD:${label}.${key}`)
    assertNoSecretKeys(nested, `${label}.${key}`)
  }
}

function currentReleaseIdentityV4(options = {}) {
  const productRoot = path.resolve(options.productRoot || root)
  const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'agent-cli', 'release-identity-v4-manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 'hengzhun-i10-release-identity-v4-manifest/v1' || manifest.profile !== 'NORMAL_CLI') throw new Error('I10_V4_MANIFEST_INVALID')
  const groups = {
    ...manifest.groups,
    harness: [...recursiveFiles(productRoot, 'harness/src', '.ts'), ...recursiveFiles(productRoot, 'dist/harness/src', '.js')],
    worker: ['scripts/i10-worker-code-set-v1.json', ...recursiveFiles(productRoot, 'worker/src', '.cjs')],
    ...Object.fromEntries(Object.entries(manifest.repositoryGroups || {}).map(([name, entries]) => [name, repositoryFiles(productRoot, entries)])),
  }
  const aggregates = Object.fromEntries(Object.entries(groups).map(([name, files]) => [name, aggregate(files, { productRoot, readFile: options.readFile })]))
  const controllerManifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'controller', 'controller-release-manifest-v2.json'), 'utf8'))
  const runtimeManifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'agent-cli', 'node-runtime-manifest-v1.json'), 'utf8'))
  const modelConfigIdentity = Object.freeze(canonicalize(options.modelConfigIdentity || controllerManifest.modelConfigIdentity))
  assertNoSecretKeys(modelConfigIdentity, 'modelConfigIdentity')
  const identity = {
    schemaVersion: 'hengzhun-i10-release-identity-v4', profile: 'NORMAL_CLI',
    releaseStatus: modelConfigIdentity.bindingStatus === 'BOUND' ? 'FROZEN' : 'SOURCE_FROZEN_UNBOUND',
    modelConfigIdentity,
    nodeRuntimeIdentity: Object.freeze(canonicalize(runtimeManifest)),
    groupHashes: Object.freeze(Object.fromEntries(Object.entries(aggregates).map(([name, value]) => [name, value.hash]))),
    groupFileCounts: Object.freeze(Object.fromEntries(Object.entries(aggregates).map(([name, value]) => [name, value.fileCount]))),
    releaseCodeSetHash: canonicalHash(Object.fromEntries(Object.entries(aggregates).map(([name, value]) => [name, { hash: value.hash, files: value.files }]))),
    files: Object.freeze([...new Set(Object.values(aggregates).flatMap((value) => value.files))].sort((a, b) => a.localeCompare(b, 'en'))),
  }
  identity.identityHash = canonicalHash(identity)
  return Object.freeze(identity)
}

function sameReleaseIdentity(left, right) {
  return Boolean(left && right && left.schemaVersion === 'hengzhun-i10-release-identity-v4' && right.schemaVersion === left.schemaVersion && left.identityHash === right.identityHash)
}

module.exports = { aggregate, canonicalHash, currentReleaseIdentityV4, resolveIdentityFile, sameReleaseIdentity }
if (require.main === module) process.stdout.write(`${JSON.stringify(currentReleaseIdentityV4(), null, 2)}\n`)
