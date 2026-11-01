#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const defaultProductRoot = path.resolve(__dirname, '..')
const MANIFEST_RELATIVE_PATH = 'scripts/i10-worker-code-set-v1.json'
const MANIFEST_SCHEMA_VERSION = 'hengzhun-worker-code-set-manifest-v1'
const WORKER_CODE_SET_VERSION = 'WORKER_CODE_SET_V1'
const ALGORITHM = 'SHA256_SORTED_POSIX_PATH_NUL_RAW_BYTES_NUL'

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const posix = value => String(value).replaceAll('\\', '/')

function fail(code, details) {
  throw Object.assign(new Error(code), { code, ...(details ? { details } : {}) })
}

function loadWorkerCodeSetManifest(options = {}) {
  const productRoot = path.resolve(options.productRoot || defaultProductRoot)
  const manifestPath = path.resolve(productRoot, MANIFEST_RELATIVE_PATH)
  if (!fs.existsSync(manifestPath)) fail('I10_WORKER_CODE_SET_MANIFEST_MISSING')
  const bytes = fs.readFileSync(manifestPath)
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch { fail('I10_WORKER_CODE_SET_MANIFEST_INVALID_JSON') }
  if (value?.schemaVersion !== MANIFEST_SCHEMA_VERSION || value?.workerCodeSetVersion !== WORKER_CODE_SET_VERSION || value?.algorithm !== ALGORITHM || value?.entry !== 'worker/src/index.cjs' || !Array.isArray(value?.files)) {
    fail('I10_WORKER_CODE_SET_MANIFEST_INVALID')
  }
  const files = value.files.map(posix)
  const authenticationContracts = ['contracts/adapters/fuxing-bank-demo-auth-v2.json', 'contracts/adapters/fuxing-bank-operations-auth-v1.json', 'dist/contracts/adapters/fuxing-bank-demo-auth-v2.json', 'dist/contracts/adapters/fuxing-bank-operations-auth-v1.json'];
  if (files.length === 0 || new Set(files).size !== files.length || files.some(file => !/^(?:worker\/src|dist\/harness\/src)\/[A-Za-z0-9._/-]+$/.test(file) && !authenticationContracts.includes(file))) {
    fail('I10_WORKER_CODE_SET_MANIFEST_FILES_INVALID')
  }
  const sorted = [...files].sort()
  if (files.some((file, index) => file !== sorted[index])) fail('I10_WORKER_CODE_SET_MANIFEST_NOT_SORTED')
  return Object.freeze({ ...value, files: Object.freeze(files), manifestPath, workerCodeSetManifestHash: sha256(bytes) })
}

function assertExactMembership(expected, actual) {
  const left = [...expected].map(posix).sort()
  const right = [...actual].map(posix).sort()
  if (left.length !== right.length || left.some((file, index) => file !== right[index])) {
    fail('I10_WORKER_CODE_SET_GRAPH_DRIFT', {
      missing: left.filter(file => !right.includes(file)),
      extra: right.filter(file => !left.includes(file))
    })
  }
}

function currentWorkerCodeSet(options = {}) {
  const productRoot = path.resolve(options.productRoot || defaultProductRoot)
  const manifest = loadWorkerCodeSetManifest({ productRoot })
  const audit = require('./i10-worker-code-set-audit.cjs')
  const graph = audit.traceWorkerCodeSet({ productRoot, entry: manifest.entry })
  if (graph.unresolved.length) fail('I10_WORKER_CODE_SET_UNRESOLVED_IMPORT', { count: graph.unresolved.length })
  assertExactMembership(manifest.files, graph.governedFiles)
  const computed = audit.aggregateWorkerCodeSet(manifest.files, { productRoot })
  return Object.freeze({
    schemaVersion: 'hengzhun-worker-code-set-v1',
    workerCodeSetVersion: manifest.workerCodeSetVersion,
    workerCodeSetManifestHash: manifest.workerCodeSetManifestHash,
    workerCodeSetHash: computed.workerCodeSetHash,
    workerCodeSetFileCount: manifest.files.length,
    files: manifest.files
  })
}

function compareWorkerCodeSetHealth(expected, observed = {}) {
  const expectedVersion = String(expected?.workerCodeSetVersion || '')
  const expectedHash = String(expected?.workerCodeSetHash || '')
  const observedVersion = typeof observed?.workerCodeSetVersion === 'string' ? observed.workerCodeSetVersion : null
  const observedHash = typeof observed?.workerCodeSetHash === 'string'
    ? observed.workerCodeSetHash
    : (typeof observed?.workerCodeVersion === 'string' ? observed.workerCodeVersion : null)
  const versionMatch = observedVersion === expectedVersion
  const hashMatch = observedHash === expectedHash
  return Object.freeze({
    expectedWorkerCodeSetVersion: expectedVersion,
    observedWorkerCodeSetVersion: observedVersion,
    expectedWorkerCodeSetHash: expectedHash,
    observedWorkerCodeSetHash: observedHash,
    versionMatch,
    hashMatch,
    ready: versionMatch && hashMatch
  })
}

module.exports = {
  ALGORITHM,
  MANIFEST_RELATIVE_PATH,
  MANIFEST_SCHEMA_VERSION,
  WORKER_CODE_SET_VERSION,
  defaultProductRoot,
  loadWorkerCodeSetManifest,
  assertExactMembership,
  currentWorkerCodeSet,
  compareWorkerCodeSetHealth
}

if (require.main === module) process.stdout.write(`${JSON.stringify(currentWorkerCodeSet(), null, 2)}\n`)
