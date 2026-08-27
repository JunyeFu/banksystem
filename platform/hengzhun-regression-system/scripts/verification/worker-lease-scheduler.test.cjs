'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { HarnessService } = require('../../dist/harness/src/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')
const { createHarnessApplication } = require('../../dist/harness/src/server.js')
const { startRunLeaseHeartbeat } = require('../../worker/src/run-lease.cjs')
const { bindLeaseAbortToBrowser, resolveExecutionCredential } = require('../../worker/src/i10-worker-utils.cjs')

const migrationsDirectory = path.resolve(__dirname, '../../harness/migrations')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-lease-scheduler-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root, 'data.sqlite'),
    migrationsDirectory,
    backupDirectory: path.join(root, 'backups')
  })
  const service = new HarnessService(database, path.join(root, 'artifacts'), root)
  const namespace = 'lease-scheduler-test'
  const now = new Date().toISOString()
  const caseId = 'case_lease_scheduler'
  const scriptId = 'script_lease_scheduler'
  const planId = 'plan_lease_scheduler'
  const db = database.connection
  db.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace, now, now)
  db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at)
    VALUES (?,?,1,'VALIDATED','lease fixture','lease fixture','LOW',?,?)`).run(caseId, namespace, now, now)
  db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at)
    VALUES (?,1,'{}',?,'TEST',?)`).run(caseId, '1'.repeat(64), now)
  db.prepare(`INSERT INTO scripts(script_id,namespace,case_id,current_version,status,created_at,updated_at)
    VALUES (?,?,?,1,'SCRIPT_VALIDATED',?,?)`).run(scriptId, namespace, caseId, now, now)
  db.prepare(`INSERT INTO script_versions(script_id,version,relative_path,sha256,validation_status,created_at)
    VALUES (?,1,'worker/src/login-profile.cjs',?,'PASSED',?)`).run(scriptId, '2'.repeat(64), now)
  db.prepare(`INSERT INTO plans(plan_id,namespace,case_id,case_version,version,status,summary_json,content_hash,created_at,script_id)
    VALUES (?,?,?,1,1,'READY','{}',?,?,?)`).run(planId, namespace, caseId, '3'.repeat(64), now, scriptId)
  return { root, database, service, namespace, caseId, scriptId, planId, now }
}

function insertQueuedRun(f, suffix, options = {}) {
  const taskId = `task_lease_${suffix}`
  const runId = `run_lease_${suffix}`
  const timestamp = options.timestamp ?? f.now
  f.database.connection.prepare(`INSERT INTO tasks(
      task_id,namespace,task_type,status,progress,case_id,run_id,payload_json,version,created_at,updated_at
    ) VALUES (?,?,'RUN_EXECUTE','QUEUED',0,?,?,'{"scriptVersion":1}',1,?,?)`)
    .run(taskId, f.namespace, f.caseId, runId, timestamp, timestamp)
  f.database.connection.prepare(`INSERT INTO runs(
      run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at,environment,fixture_scope,
      origin_schedule_id,schedule_execution_id
    ) VALUES (?,?,?,1,?,?,'QUEUED',1,?,'local',?,?,?)`)
    .run(runId, f.namespace, f.caseId, f.planId, taskId, timestamp,
      options.fixtureScope ?? `fixture-${suffix}`, options.scheduleId ?? null, options.executionId ?? null)
  return { taskId, runId }
}

function oneDiagnostic(errorCode = 'TEST_BLOCKED') {
  return {
    outcome: 'BLOCKED', summary: 'blocked by deterministic fixture', errorCode,
    errorCategory: 'EVIDENCE', retryable: false, userActionRequired: true,
    evidence: [{
      artifactType: 'DIAGNOSTIC', mediaType: 'application/json', redactionStatus: 'REDACTED', extension: 'json',
      base64Content: Buffer.from(JSON.stringify({ errorCode })).toString('base64'), metadata: { containsCredentials: false }
    }]
  }
}

function insertOneTimeSchedule(f, suffix, runAt, graceSeconds, options = {}) {
  const scheduleId = `schedule_grace_${suffix}`
  const deadlineAt = new Date(new Date(runAt).getTime() + graceSeconds * 1000).toISOString()
  f.database.connection.prepare(`INSERT INTO schedules(
      schedule_id,namespace,case_id,case_version,plan_id,credential_alias,cron_expression,timezone,
      environment,fixture_scope,misfire_policy,misfire_grace_seconds,max_retries,status,next_fire_at,
      version,created_at,updated_at,schedule_type,run_at,script_id,script_version,script_sha256,
      one_time_state,confirmation_ref,misfire_semantics,deadline_at
    ) VALUES (?,?,?,1,?,'fixture','0 0 1 1 *','UTC','local',?,'RUN_ONCE',?,1,'ACTIVE',?,1,?,?,'ONE_TIME',?,?,1,?,
      'PENDING',?,'RUN_ONCE_WITHIN_GRACE',?)`)
    .run(scheduleId, f.namespace, f.caseId, f.planId, options.fixtureScope ?? `scope-${suffix}`, graceSeconds,
      runAt, f.now, f.now, runAt, f.scriptId, '2'.repeat(64), `confirmation-${suffix}`, deadlineAt)
  return { scheduleId, deadlineAt }
}

test('expired and reclaimed RUN_EXECUTE lease cannot publish artifacts or mutate visible completion state', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const ids = insertQueuedRun(f, 'reclaim')
  f.database.connection.prepare(`UPDATE tasks SET created_at='2000-01-01T00:00:00.000Z',updated_at='2000-01-01T00:00:00.000Z' WHERE task_id=?`).run(ids.taskId)
  const oldClaim = await f.service.claimNextRun('worker-old', 300)
  assert.equal(oldClaim.status, 'CLAIMED')
  await assert.rejects(
    () => f.service.renewRunLease(ids.taskId, 'worker-other', oldClaim.leaseVersion),
    error => error.errorCode === 'WORKER_LEASE_CONFLICT'
  )
  const renewed = await f.service.renewRunLease(ids.taskId, 'worker-old', oldClaim.leaseVersion)
  assert.equal(renewed.status, 'RENEWED')
  assert.equal(renewed.leaseVersion, oldClaim.leaseVersion)
  f.database.connection.prepare(`UPDATE tasks SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE task_id=?`).run(ids.taskId)
  const future = new Date(Date.now() + 60_000).toISOString()
  f.database.connection.prepare(`INSERT INTO tasks(
      task_id,namespace,task_type,status,progress,case_id,run_id,payload_json,version,created_at,updated_at
    ) VALUES ('task_unrelated_queued',?,'RUN_EXECUTE','QUEUED',0,?,'run_unrelated_queued','{}',1,?,?)`)
    .run(f.namespace, f.caseId, future, future)
  f.database.connection.prepare(`INSERT INTO runs(
      run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at,environment,fixture_scope
    ) VALUES ('run_unrelated_queued',?,?,1,?,'task_unrelated_queued','RUNNING',1,?,'local','unrelated-scope')`)
    .run(f.namespace, f.caseId, f.planId, future)
  const newClaim = await f.service.claimNextRun('worker-new', 300)
  assert.equal(newClaim.status, 'CLAIMED')
  assert.ok(newClaim.leaseVersion > oldClaim.leaseVersion)

  await assert.rejects(
    () => f.service.completeRun(ids.taskId, { workerId: 'worker-old', leaseVersion: oldClaim.leaseVersion, ...oneDiagnostic() }),
    error => error.errorCode === 'WORKER_LEASE_CONFLICT'
  )
  const db = f.database.connection
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM artifacts WHERE task_id=?`).get(ids.taskId).count, 0)
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM result_inbox_items WHERE task_id=?`).get(ids.taskId).count, 0)
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM audit_events WHERE task_id=? AND action='run.complete'`).get(ids.taskId).count, 0)
  assert.deepEqual(db.prepare(`SELECT status,lease_owner,version FROM tasks WHERE task_id=?`).get(ids.taskId), {
    status: 'RUNNING', lease_owner: 'worker-new', version: newClaim.leaseVersion
  })
  assert.equal(db.prepare(`SELECT status FROM runs WHERE run_id=?`).get(ids.runId).status, 'RUNNING')
  assert.equal(db.prepare(`SELECT status FROM runs WHERE run_id='run_unrelated_queued'`).get().status, 'RUNNING')
  const artifactRoot = path.join(f.root, 'artifacts')
  const files = fs.existsSync(artifactRoot)
    ? fs.readdirSync(artifactRoot, { recursive: true }).filter(name => {
        const absolute = path.join(artifactRoot, String(name))
        return fs.statSync(absolute).isFile() && !String(name).endsWith('.pending')
      })
    : []
  assert.equal(files.length, 0)
})

test('lease loss after artifact staging rolls back database publication and deletes staged/final files', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const ids = insertQueuedRun(f, 'toctou')
  const claim = await f.service.claimNextRun('worker-old', 300)
  const originalStage = f.service.artifacts.stage.bind(f.service.artifacts)
  f.service.artifacts.stage = input => {
    const staged = originalStage(input)
    f.database.connection.prepare(`UPDATE tasks SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE task_id=?`).run(ids.taskId)
    return staged
  }
  await assert.rejects(
    () => f.service.completeRun(ids.taskId, { workerId: 'worker-old', leaseVersion: claim.leaseVersion, ...oneDiagnostic('TOCTOU_TEST') }),
    error => error.errorCode === 'WORKER_LEASE_CONFLICT'
  )
  assert.equal(f.database.connection.prepare(`SELECT COUNT(*) count FROM artifacts WHERE task_id=?`).get(ids.taskId).count, 0)
  const artifactRoot = path.join(f.root, 'artifacts')
  const files = fs.existsSync(artifactRoot) ? fs.readdirSync(artifactRoot, { recursive: true }).filter(name => fs.statSync(path.join(artifactRoot, name)).isFile()) : []
  assert.deepEqual(files, [])
})

test('a downstream completion failure rolls back artifact rows and final files after attempted publication', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const ids = insertQueuedRun(f, 'rollback')
  const claim = await f.service.claimNextRun('worker-rollback', 300)
  f.database.connection.exec(`CREATE TRIGGER test_fail_run_completion BEFORE UPDATE OF status ON runs
    WHEN NEW.status IN ('PASSED','FAILED','BLOCKED') BEGIN SELECT RAISE(ABORT,'TEST_DOWNSTREAM_FAILURE'); END;`)
  await assert.rejects(
    () => f.service.completeRun(ids.taskId, { workerId: 'worker-rollback', leaseVersion: claim.leaseVersion, ...oneDiagnostic('ROLLBACK_TEST') }),
    /TEST_DOWNSTREAM_FAILURE/
  )
  assert.equal(f.database.connection.prepare(`SELECT COUNT(*) count FROM artifacts WHERE task_id=?`).get(ids.taskId).count, 0)
  assert.equal(f.database.connection.prepare(`SELECT status FROM tasks WHERE task_id=?`).get(ids.taskId).status, 'RUNNING')
  const artifactRoot = path.join(f.root, 'artifacts')
  const files = fs.existsSync(artifactRoot) ? fs.readdirSync(artifactRoot, { recursive: true }).filter(name => fs.statSync(path.join(artifactRoot, name)).isFile()) : []
  assert.deepEqual(files, [])
})

test('valid lease completion publishes evidence and terminal state together', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const ids = insertQueuedRun(f, 'valid')
  const claim = await f.service.claimNextRun('worker-current', 300)
  const completed = await f.service.completeRun(ids.taskId, {
    workerId: 'worker-current', leaseVersion: claim.leaseVersion, ...oneDiagnostic('VALID_COMPLETION')
  })
  assert.equal(completed.status, 'FAILED')
  assert.equal(f.database.connection.prepare(`SELECT COUNT(*) count FROM artifacts WHERE task_id=?`).get(ids.taskId).count, 1)
  assert.equal(f.database.connection.prepare(`SELECT status FROM tasks WHERE task_id=?`).get(ids.taskId).status, 'FAILED')
  assert.equal(f.database.connection.prepare(`SELECT status FROM runs WHERE run_id=?`).get(ids.runId).status, 'BLOCKED')
})

test('ordinary ArtifactStore create remains readable after its successful commit', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const created = await f.service.artifacts.create({
    namespace: f.namespace, artifactType: 'TEXT', mediaType: 'text/plain', redactionStatus: 'NOT_REQUIRED',
    extension: 'txt', content: 'committed artifact', metadata: { containsCredentials: false }
  })
  const readback = f.service.artifacts.read(f.namespace, created.artifactId)
  assert.equal(readback.content.toString('utf8'), 'committed artifact')
})

test('ArtifactStore recovery removes old hidden staging but preserves unregistered final files', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const staging = path.join(f.root, 'artifacts', '.staging')
  const abandoned = path.join(staging, 'abandoned.pending')
  fs.writeFileSync(abandoned, 'not visible')
  fs.utimesSync(abandoned, new Date(0), new Date(0))
  const namespaceDirectory = path.join(f.root, 'artifacts', f.namespace)
  fs.mkdirSync(namespaceDirectory, { recursive: true })
  const orphan = path.join(namespaceDirectory, 'art_11111111-1111-4111-8111-111111111111.txt')
  fs.writeFileSync(orphan, 'unregistered')
  fs.utimesSync(orphan, new Date(0), new Date(0))
  new ArtifactStore(f.database, path.join(f.root, 'artifacts'))
  assert.equal(fs.existsSync(abandoned), false)
  assert.equal(fs.existsSync(orphan), true)
})

test('heartbeat sends immutable lease identity, suppresses overlap, and surfaces a lease conflict', async () => {
  let callback
  let clears = 0
  let calls = 0
  let release
  let expiryCallback
  const expiryDelays = []
  let now = 0
  const blocker = new Promise(resolve => { release = resolve })
  const conflict = Object.assign(new Error('lost'), { code: 'WORKER_LEASE_CONFLICT' })
  const heartbeat = startRunLeaseHeartbeat({ taskId: 'task lease/1', leaseVersion: 7, leaseExpiresAt: new Date(1000).toISOString() }, {
    workerId: 'worker-heartbeat', intervalMs: 5,
    nowFn: () => now,
    setIntervalFn(fn, delay) { callback = fn; assert.equal(delay, 5); return { unref() {} } },
    clearIntervalFn() { clears += 1 },
    setTimeoutFn(fn, delay) { expiryCallback = fn; expiryDelays.push(delay); return { unref() {} } },
    clearTimeoutFn() {},
    async post(pathname, body) {
      calls += 1
      assert.equal(pathname, '/internal/worker/tasks/task%20lease%2F1:renew')
      assert.deepEqual(body, { workerId: 'worker-heartbeat', leaseVersion: 7 })
      if (calls === 1) {
        await blocker
        return { taskId: 'task lease/1', workerId: 'worker-heartbeat', leaseVersion: 7, status: 'RENEWED', leaseExpiresAt: new Date(2000).toISOString() }
      }
      else throw conflict
    }
  })
  callback()
  callback()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 1)
  release()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(expiryDelays, [1000, 2000])
  callback()
  await new Promise(resolve => setImmediate(resolve))
  assert.throws(() => heartbeat.assertCurrent(), error => error === conflict)
  heartbeat.stop()
  assert.equal(clears, 1)
  assert.equal(typeof expiryCallback, 'function')
})

test('transport failures never extend a lease and local expiry aborts the active browser', async () => {
  let intervalCallback
  let expiryCallback
  let now = 0
  let browserCloseCalls = 0
  const heartbeat = startRunLeaseHeartbeat({
    taskId: 'task-expiring', leaseVersion: 3, leaseExpiresAt: new Date(1000).toISOString()
  }, {
    workerId: 'worker-expiring', intervalMs: 5, nowFn: () => now,
    setIntervalFn(fn) { intervalCallback = fn; return { unref() {} } },
    clearIntervalFn() {},
    setTimeoutFn(fn, delay) { expiryCallback = fn; assert.equal(delay, 1000); return { unref() {} } },
    clearTimeoutFn() {},
    async post() { throw Object.assign(new Error('offline'), { code: 'ECONNRESET' }) }
  })
  const detach = bindLeaseAbortToBrowser(heartbeat.signal, { async close() { browserCloseCalls += 1 } })
  intervalCallback()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(heartbeat.signal.aborted, false)
  now = 1000
  expiryCallback()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(heartbeat.signal.aborted, true)
  assert.equal(heartbeat.signal.reason.code, 'WORKER_LEASE_CONFLICT')
  assert.equal(browserCloseCalls, 1)
  assert.throws(() => heartbeat.assertCurrent(), error => error.code === 'WORKER_LEASE_CONFLICT')
  detach()
  heartbeat.stop()
})

test('RUN_EXECUTE passes the heartbeat abort signal into every selected executor path', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../worker/src/index.cjs'), 'utf8')
  assert.match(source, /credential:\s*i10Credential,[\s\S]*signal:\s*leaseHeartbeat\.signal/)
  assert.match(source, /:\s*\{\s*signal:\s*leaseHeartbeat\.signal\s*\}\);/)
})

test('all controlled adapters can consume the DPAPI-resolved in-memory credential without a legacy alias secret', () => {
  const credential = resolveExecutionCredential(
    { execution: { credentialAlias: 'missing-legacy-alias' } },
    {},
    { credential: { username: 'in-memory-user', password: 'in-memory-password' } }
  )
  assert.deepEqual(credential, { username: 'in-memory-user', password: 'in-memory-password' })
  for (const relative of [
    '../../worker/src/adapters/fuxing-bank-demo/login-profile.cjs',
    '../../worker/src/adapters/fuxing-bank-demo/account-ownership.cjs',
    '../../worker/src/adapters/fuxing-bank-demo/auth-rejection-recovery.cjs'
  ]) {
    assert.match(fs.readFileSync(path.resolve(__dirname, relative), 'utf8'), /resolveExecutionCredential\(task, environment, options\)/)
  }
})

test('ONE_TIME grace expiry records one terminal misfire and never queues a run', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const runAt = '2026-01-01T00:00:00.000Z'
  const { scheduleId } = insertOneTimeSchedule(f, 'expired', runAt, 60)
  const result = await f.service.tickSchedules(new Date('2026-01-01T00:01:01.000Z'))
  assert.deepEqual(result, { evaluated: 1, queued: 0, skippedMisfire: 1, skippedMutex: 0 })
  assert.deepEqual(f.database.connection.prepare(`SELECT status,one_time_state FROM schedules WHERE schedule_id=?`).get(scheduleId), {
    status: 'DISABLED', one_time_state: 'SKIPPED'
  })
  assert.deepEqual(f.database.connection.prepare(`SELECT status,reason_code FROM schedule_executions WHERE schedule_id=?`).get(scheduleId), {
    status: 'SKIPPED_MISFIRE', reason_code: 'MISFIRE_POLICY'
  })
  assert.equal(f.database.connection.prepare(`SELECT COUNT(*) count FROM runs WHERE origin_schedule_id=?`).get(scheduleId).count, 0)
})

test('ONE_TIME waits for mutex only inside grace, then skips exactly at deadline without an unbounded retry', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const runAt = '2026-01-01T00:00:00.000Z'
  const scope = 'shared-mutex-scope'
  const { scheduleId } = insertOneTimeSchedule(f, 'mutex', runAt, 60, { fixtureScope: scope })
  insertQueuedRun(f, 'mutex-lock', { fixtureScope: scope, timestamp: '2025-12-31T23:59:00.000Z' })
  const waiting = await f.service.tickSchedules(new Date('2026-01-01T00:00:30.000Z'))
  assert.deepEqual(waiting, { evaluated: 1, queued: 0, skippedMisfire: 0, skippedMutex: 1 })
  assert.deepEqual(f.database.connection.prepare(`SELECT status,one_time_state,deferred_state FROM schedules WHERE schedule_id=?`).get(scheduleId), {
    status: 'ACTIVE', one_time_state: 'PENDING', deferred_state: 'WAITING_MUTEX'
  })
  assert.equal(f.database.connection.prepare(`SELECT COUNT(*) count FROM schedule_executions WHERE schedule_id=?`).get(scheduleId).count, 0)

  const expired = await f.service.tickSchedules(new Date('2026-01-01T00:01:01.000Z'))
  assert.deepEqual(expired, { evaluated: 1, queued: 0, skippedMisfire: 1, skippedMutex: 0 })
  assert.deepEqual(f.database.connection.prepare(`SELECT status,one_time_state FROM schedules WHERE schedule_id=?`).get(scheduleId), {
    status: 'DISABLED', one_time_state: 'SKIPPED'
  })
  assert.equal(f.database.connection.prepare(`SELECT COUNT(*) count FROM schedule_executions WHERE schedule_id=? AND status='SKIPPED_MISFIRE'`).get(scheduleId).count, 1)
})

test('scheduler supervisor health degrades after independent operation failures and recovers after a full successful tick', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-scheduler-health-'))
  const application = await createHarnessApplication({
    productRoot: root,
    databasePath: path.join(root, 'data.sqlite'),
    migrationsDirectory,
    backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'),
    security: { serviceToken: 's'.repeat(32), allowedClients: ['127.0.0.1'] },
    workerToken: 'w'.repeat(32),
    schedulerIntervalMs: 10_000
  })
  t.after(async () => { await application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  assert.equal(application.schedulerHealth().ready, true)
  const originalTick = application.service.tickSchedules.bind(application.service)
  application.service.tickSchedules = async () => { throw Object.assign(new Error('failure'), { code: 'SCHEDULER_FIXTURE_FAILURE' }) }
  await application.runSchedulerTick()
  await application.runSchedulerTick()
  const degraded = application.schedulerHealth()
  assert.equal(degraded.ready, false)
  assert.equal(degraded.status, 'DEGRADED')
  assert.equal(degraded.consecutiveFailures, 2)
  assert.deepEqual(degraded.lastErrorCodes, ['SCHEDULER_FIXTURE_FAILURE'])
  application.service.tickSchedules = originalTick
  await application.runSchedulerTick()
  assert.equal(application.schedulerHealth().ready, true)
})
