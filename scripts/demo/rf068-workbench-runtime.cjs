'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const product = path.resolve(__dirname, '../../platform/hengzhun-regression-system')
const lifecycle = require(path.join(product, 'scripts/i10-agent-lifecycle.cjs'))
const release = require(path.join(product, 'scripts/i10-release-identity-v4.cjs'))
const Database = createRequire(path.join(product, 'package.json'))('better-sqlite3')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => { throw Object.assign(new Error(code), { code }) }
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }

async function main(args = process.argv.slice(2), deps = {}) {
  const product = deps.product || path.resolve(__dirname, '../../platform/hengzhun-regression-system')
  const lifecycle = deps.lifecycle || require(path.join(product, 'scripts/i10-agent-lifecycle.cjs'))
  const release = deps.release || require(path.join(product, 'scripts/i10-release-identity-v4.cjs'))
  const [command, expected] = args
  if (!['inspect', 'start'].includes(command)) fail('RF068_RUNTIME_COMMAND_INVALID')
  const environment = lifecycle.environmentWithRuntimeFile({ root: product })
  const identity = release.currentReleaseIdentityV4({ productRoot: product, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) })
  if (command === 'start' && expected !== identity.identityHash) fail('RF068_FREEZE_SOURCE_MISMATCH')
  const runtime = await lifecycle.managedStatus({ root: product, identity })
  const state = lifecycle.readManagedState(product)
  // Never remove a receipt for a reused/live PID, even when its source is stale.
  if (command === 'start' && !runtime.healthy && state && state.services.some(record => (deps.alive || alive)(record.pid))) fail('RF068_LIVE_MANAGED_PROCESS_REQUIRES_REVIEW')
  const databasePath = path.join(product, '.data/sqlite/regression_platform.sqlite')
  let db, backup, execution
  const counts = {}, migrations = {}
  try {
    if (fs.existsSync(databasePath)) {
      db = new Database(databasePath, { readonly: true, fileMustExist: true })
      for (const table of ['tasks', 'runs', 'action_plans', 'i8_candidate_build_jobs', 'workbench_turns']) {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue
        counts[table] = db.prepare(`SELECT count(*) n FROM ${table} WHERE status IN ('QUEUED','RUNNING','STOP_REQUESTED')`).get().n
      }
      migrations.applied = db.prepare('SELECT max(version) version FROM schema_migrations').get().version
      migrations.expected = Math.max(...fs.readdirSync(path.join(product, 'harness/migrations')).filter(name => /^\d+_.*\.sql$/.test(name)).map(name => Number(name.split('_')[0])))
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schedules'").get()) counts.activeSchedules = db.prepare("SELECT count(*) n FROM schedules WHERE status='ACTIVE'").get().n
      if (command === 'inspect' && expected) {
        const { WorkbenchRepository } = require(path.join(product, 'dist/harness/src/workbench-repository.js'))
        execution = new WorkbenchRepository({ read: operation => operation(db) }).executionSnapshot(environment.HENGZHUN_AGENT_NAMESPACE, expected)
      }
      if (command === 'start' && Object.values(counts).some(value => value !== 0)) fail('RF068_ACTIVE_TASKS_BLOCK_START')
      if (command === 'start') {
        backup = path.join(product, '.data/sqlite/offline-backups', `rf068-s5-${randomUUID()}.sqlite`)
        fs.mkdirSync(path.dirname(backup), { recursive: true }); await db.backup(backup)
        const copy = new Database(backup, { readonly: true, fileMustExist: true })
        try { if (copy.pragma('integrity_check', { simple: true }) !== 'ok') fail('RF068_BACKUP_INTEGRITY_FAILED') } finally { copy.close() }
      }
    }
  } finally { db?.close() }
  if (command === 'inspect') {
    if (expected && !execution) fail('RF068_JOURNEY_LEDGER_UNAVAILABLE')
    return { status: 'INSPECTED', releaseIdentityHash: identity.identityHash, runtime, activeCounts: counts, migrations, ...(execution ? { execution } : {}), mutationPerformed: false }
  }
  const receiptRoot = path.join(product, '.data/rf068-s5', randomUUID())
  fs.mkdirSync(receiptRoot, { recursive: true })
  fs.writeFileSync(path.join(receiptRoot, 'identity.json'), JSON.stringify(identity, null, 2))
  const frozen = { schemaVersion: 'rf068-s5-freeze/v1', releaseIdentityHash: identity.identityHash, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(product, '../..'), encoding: 'utf8', windowsHide: true }).trim(),
    authorizedScope: 'RF068_S5_BYOK_BANK_READ_ONLY', frozenAt: new Date().toISOString(), activeCounts: counts, migrations,
    acceptanceSources: ['scripts/test/verify-agent-workbench.ps1', 'scripts/test/rf068-workbench-live.mjs', 'scripts/demo/rf068-workbench-runtime.cjs'].map(file => ({ file, sha256: sha256(fs.readFileSync(path.resolve(product, '../..', file))) })),
    backup: backup ? { path: path.relative(product, backup), sha256: sha256(fs.readFileSync(backup)) } : null }
  fs.writeFileSync(path.join(receiptRoot, 'freeze.json'), JSON.stringify(frozen, null, 2))
  if (!runtime.healthy && state) {
    fs.copyFileSync(lifecycle.statePaths(product).stateFile, path.join(receiptRoot, 'previous-process-receipt.json'))
    await lifecycle.stopManaged({ root: product, environment }) // All recorded PIDs were proved absent above.
  }
  // Human-authorized exact identity; preserve every other runtime setting byte-for-byte.
  const runtimeFile = path.join(product, '.data/runtime.env')
  const original = fs.readFileSync(runtimeFile, 'utf8')
  fs.copyFileSync(runtimeFile, path.join(receiptRoot, 'runtime.env.before'))
  const line = `HENGZHUN_AUTHORIZE_AGENT_LIVE=${identity.identityHash}`
  const updated = /^HENGZHUN_AUTHORIZE_AGENT_LIVE=.*$/m.test(original)
    ? original.replace(/^HENGZHUN_AUTHORIZE_AGENT_LIVE=[^\r\n]*/gm, line) : `${original}${original.endsWith('\n') ? '' : '\n'}${line}\n`
  fs.writeFileSync(runtimeFile, updated, 'utf8')
  environment.HENGZHUN_AUTHORIZE_AGENT_LIVE = identity.identityHash
  const started = await lifecycle.startManaged({ root: product, environment })
  fs.writeFileSync(path.join(receiptRoot, 'started.json'), JSON.stringify(started, null, 2))
  return { status: 'STARTED', releaseIdentityHash: identity.identityHash, receipt: path.relative(product, receiptRoot), backup: frozen.backup, services: started.services, bankServices: 'UNCHANGED' }
}
if (require.main === module) main().then(value => console.log(JSON.stringify(value))).catch(error => { console.log(JSON.stringify({ status: 'FAILED', code: /^[A-Z][A-Z0-9_]+$/.test(error.code || '') ? error.code : 'RF068_RUNTIME_FAILED', bankServices: 'UNCHANGED' })); process.exitCode = 3 })
module.exports = { main }
