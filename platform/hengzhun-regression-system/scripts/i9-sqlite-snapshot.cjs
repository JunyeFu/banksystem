#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.resolve(__dirname, '..')
const requestedDataRoot = process.env.NODE_ENV === 'test' && process.env.HENGZHUN_I9_TEST_DATA_ROOT
  ? path.resolve(process.env.HENGZHUN_I9_TEST_DATA_ROOT)
  : null
const allowedTestRoot = path.join(root, '.data', 'tests')
if (requestedDataRoot) {
  assert.ok(
    requestedDataRoot === allowedTestRoot || requestedDataRoot.startsWith(`${allowedTestRoot}${path.sep}`),
    'I9_TEST_DATA_ROOT_OUTSIDE_PRODUCT_DATA'
  )
}
const dataRoot = requestedDataRoot || path.join(root, '.data')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i9.runtime.example.json'), 'utf8'))
const statePath = path.join(root, '.data', 'runtime', 'i9-processes.json')
const databases = {
  flowise: {
    source: requestedDataRoot
      ? path.join(requestedDataRoot, 'flowise', 'database.sqlite')
      : path.join(root, config.paths.flowiseData, 'database.sqlite'),
    backupName: 'flowise-platform.sqlite',
    role: 'platform-configuration-knowledge-metadata'
  },
  harness: {
    source: requestedDataRoot
      ? path.join(requestedDataRoot, 'sqlite', 'regression_platform.sqlite')
      : path.join(root, config.paths.harnessDatabase),
    backupName: 'harness-regression-platform.sqlite',
    role: 'structured-regression-facts-and-knowledge-snapshot-ref-only'
  }
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

function assertServicesStopped() {
  if (!fs.existsSync(statePath)) return
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const running = Object.values(state.services || {}).filter((item) => Number.isInteger(item.pid) && pidAlive(item.pid))
  assert.equal(running.length, 0, 'I9_SQLITE_SNAPSHOT_REQUIRES_STOPPED_SERVICES')
}

function inspectDatabase(file) {
  const database = new Database(file, { readonly: true, fileMustExist: true })
  try {
    assert.equal(database.pragma('quick_check', { simple: true }), 'ok', `SQLITE_QUICK_CHECK_FAILED:${path.basename(file)}`)
    return new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name))
  } finally { database.close() }
}

function assertAuthorityBoundary(flowiseFile, harnessFile) {
  const flowiseTables = inspectDatabase(flowiseFile)
  const harnessTables = inspectDatabase(harnessFile)
  for (const required of ['chat_flow', 'document_store', 'document_store_file_chunk', 'variable']) {
    assert.ok(flowiseTables.has(required), `I9_FLOWISE_TABLE_MISSING:${required}`)
  }
  for (const forbidden of ['cases', 'plans', 'runs', 'i9_knowledge_snapshot_refs']) {
    assert.ok(!flowiseTables.has(forbidden), `I9_FLOWISE_CONTAINS_HARNESS_TABLE:${forbidden}`)
  }
  for (const required of ['namespaces', 'cases', 'plans', 'runs', 'i9_knowledge_snapshot_refs']) {
    assert.ok(harnessTables.has(required), `I9_HARNESS_TABLE_MISSING:${required}`)
  }
  for (const forbidden of ['chat_flow', 'document_store', 'document_store_file_chunk', 'variable']) {
    assert.ok(!harnessTables.has(forbidden), `I9_HARNESS_CONTAINS_FLOWISE_TABLE:${forbidden}`)
  }
  const harness = new Database(harnessFile, { readonly: true, fileMustExist: true })
  try {
    const columns = harness.prepare('PRAGMA table_info(i9_knowledge_snapshot_refs)').all().map((row) => row.name)
    for (const forbidden of ['page_content', 'body', 'content', 'knowledge_text']) {
      assert.ok(!columns.includes(forbidden), `I9_HARNESS_KNOWLEDGE_BODY_COLUMN_FORBIDDEN:${forbidden}`)
    }
  } finally { harness.close() }
}

async function sqliteBackup(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const database = new Database(source, { readonly: true, fileMustExist: true })
  try { await database.backup(destination) } finally { database.close() }
  inspectDatabase(destination)
}

function removeStoppedDatabaseSidecars(databasePath) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${databasePath}${suffix}`
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar)
  }
}

function withinDataRoot(candidate) {
  const absolute = path.resolve(candidate)
  return absolute === dataRoot || absolute.startsWith(`${dataRoot}${path.sep}`)
}

async function backup() {
  assertServicesStopped()
  assertAuthorityBoundary(databases.flowise.source, databases.harness.source)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = path.join(dataRoot, 'backups', 'i9-p3', timestamp)
  fs.mkdirSync(output, { recursive: true })
  const entries = {}
  for (const [name, definition] of Object.entries(databases)) {
    const destination = path.join(output, definition.backupName)
    await sqliteBackup(definition.source, destination)
    entries[name] = {
      file: definition.backupName,
      sha256: hashFile(destination),
      byteLength: fs.statSync(destination).size,
      role: definition.role
    }
  }
  const manifest = {
    schemaVersion: 'hengzhun-i9-dual-sqlite-backup-v1',
    createdAt: new Date().toISOString(),
    databases: entries
  }
  const manifestPath = path.join(output, 'manifest.json')
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(`${JSON.stringify({ status: 'BACKUP_CREATED', manifestPath, databases: Object.keys(entries) }, null, 2)}\n`)
}

async function restore(manifestArgument) {
  assertServicesStopped()
  assert.ok(manifestArgument, 'I9_RESTORE_MANIFEST_REQUIRED')
  const manifestPath = path.resolve(manifestArgument)
  assert.ok(withinDataRoot(manifestPath), 'I9_RESTORE_MANIFEST_OUTSIDE_DATA_ROOT')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 'hengzhun-i9-dual-sqlite-backup-v1', 'I9_RESTORE_MANIFEST_SCHEMA_INVALID')
  const backupRoot = path.dirname(manifestPath)
  const sources = {}
  for (const [name, definition] of Object.entries(databases)) {
    const entry = manifest.databases?.[name]
    assert.ok(entry && entry.role === definition.role, `I9_RESTORE_ROLE_MISMATCH:${name}`)
    const source = path.resolve(backupRoot, entry.file)
    assert.ok(source.startsWith(`${backupRoot}${path.sep}`), `I9_RESTORE_FILE_OUTSIDE_BACKUP:${name}`)
    assert.equal(hashFile(source), entry.sha256, `I9_RESTORE_HASH_MISMATCH:${name}`)
    inspectDatabase(source)
    sources[name] = source
  }
  assertAuthorityBoundary(sources.flowise, sources.harness)

  const safetyRoot = path.join(dataRoot, 'backups', 'pre-restore', new Date().toISOString().replace(/[:.]/g, '-'))
  for (const [name, definition] of Object.entries(databases)) {
    if (fs.existsSync(definition.source)) await sqliteBackup(definition.source, path.join(safetyRoot, definition.backupName))
  }
  for (const [name, definition] of Object.entries(databases)) {
    const temporary = `${definition.source}.restore-${process.pid}.tmp`
    await sqliteBackup(sources[name], temporary)
    removeStoppedDatabaseSidecars(definition.source)
    if (fs.existsSync(definition.source)) fs.unlinkSync(definition.source)
    fs.renameSync(temporary, definition.source)
  }
  assertAuthorityBoundary(databases.flowise.source, databases.harness.source)
  process.stdout.write(`${JSON.stringify({ status: 'RESTORED', manifestPath, databases: Object.keys(databases) }, null, 2)}\n`)
}

const [command, argument] = process.argv.slice(2)
Promise.resolve(command === 'backup' ? backup() : command === 'restore' ? restore(argument) : Promise.reject(new Error('USAGE: i9-sqlite-snapshot.cjs backup|restore <manifest>')))
  .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 2 })
