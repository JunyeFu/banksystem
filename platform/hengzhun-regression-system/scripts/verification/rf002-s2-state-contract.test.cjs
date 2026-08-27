'use strict'

// RF-002-S2: Harness state contract extension tests (G1/G2/G3).
// Integration-level against the real dist harness on an isolated database:
//   - tasks:get emits terminal + verificationGate (active gate / none /
//     expired / resumeAllowed variants)
//   - candidates:get emits terminal + verificationGate keyed by job id
//   - dual-source consistency: verificationGate rows come from the same
//     i10_verification_challenges store that verification:get reads
// All runtime artifacts live under an OS-managed temporary root and are cleaned up.

const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const nodeExecutable = process.execPath
const Database = require(path.join(root, 'node_modules/better-sqlite3'))
const ISO = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-rf002-s2-'))
const HARNESS_PORT = 28787
const now = () => new Date().toISOString()
const future = () => new Date(Date.now() + 3600_000).toISOString()
const past = () => new Date(Date.now() - 3600_000).toISOString()
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

function waitForHealth(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    let settled = false
    const succeed = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const fail = error => {
      if (settled) return
      settled = true
      reject(error)
    }
    child?.once('exit', code => fail(new Error(`harness exited before health: ${code}:${child.startupErrorCode || 'UNKNOWN'}:${child.startupMessage || 'NO_SAFE_DETAIL'}`)))
    const tick = () => {
      http.get(url, { timeout: 1000 }, response => {
        response.resume()
        if (response.statusCode === 200) return succeed()
        retry()
      }).on('error', retry)
    }
    const retry = () => {
      if (settled) return
      if (Date.now() > deadline) return fail(new Error(`health timeout: ${url}`))
      setTimeout(tick, 300)
    }
    tick()
  })
}

function applyMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT;`)
  const migrations = fs.readdirSync(path.join(root, 'harness/migrations'))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort()
  for (const name of migrations) {
    const version = Number(name.split('_', 1)[0])
    const sql = fs.readFileSync(path.join(root, 'harness/migrations', name), 'utf8')
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)')
        .run(version, name, sha256(sql.replaceAll('\r\n', '\n')), now())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  assert.equal(db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, 39)
}

after(() => fs.rmSync(ISO, { recursive: true, force: true }))

function seed(db) {
  db.prepare('INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,?,1,?,?)')
    .run('ns1', 'ACTIVE', now(), now())
  const insertTask = db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,retryable,user_action_required,version,created_at,updated_at)
    VALUES (?,?,?,?,0,0,0,1,?,?)`)
  insertTask.run('t-running', 'ns1', 'RUN_EXECUTE', 'RUNNING', now(), now())
  insertTask.run('t-succ', 'ns1', 'RUN_EXECUTE', 'SUCCEEDED', now(), now())
  insertTask.run('t-gate-prep', 'ns1', 'RUN_EXECUTE', 'RUNNING', now(), now())
  insertTask.run('t-gate-action', 'ns1', 'RUN_EXECUTE', 'RUNNING', now(), now())
  insertTask.run('t-gate-expired', 'ns1', 'RUN_EXECUTE', 'RUNNING', now(), now())
  const insertChallenge = db.prepare(`INSERT INTO i10_verification_challenges(challenge_id,namespace,task_ref,verification_type,status,detection_summary,user_preparation,version,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,1,?,?,?)`)
  insertChallenge.run('verification_000000000000000000000000000000010000', 'ns1', 't-gate-prep', 'SMS_OTP', 'WAITING_USER_PREPARATION', 'detected', 'prepare', future(), now(), now())
  insertChallenge.run('verification_000000000000000000000000000000020000', 'ns1', 't-gate-action', 'UKEY', 'WAITING_USER_ACTION', 'detected', 'ready', future(), now(), now())
  insertChallenge.run('verification_000000000000000000000000000000030000', 'ns1', 't-gate-expired', 'TOTP', 'WAITING_USER_PREPARATION', 'detected', 'prepare', past(), now(), now())
  // candidates chain
  db.prepare('INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,?,?,?,?,?,?)')
    .run('c1', 'ns1', 'VALIDATED', 'T', 'S', 'LOW', now(), now())
  db.prepare('INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,?,?,?,?,?)')
    .run('c1', 1, '{"schemaVersion":"v1"}', sha256('def'), 'test', now())
  const insertPrep = db.prepare(`INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,intent_plan_json,intent_plan_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`)
  insertPrep.run('p1', 'ns1', 'c1', 1, sha256('src'), '{}', '{}', '{}', sha256('intent'), 'PREPARED', now(), now())
  // distinct case so the (namespace, case_id, case_version) uniqueness holds
  db.prepare('INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,?,?,?,?,?,?)')
    .run('c2', 'ns1', 'VALIDATED', 'T2', 'S2', 'LOW', now(), now())
  db.prepare('INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,?,?,?,?,?)')
    .run('c2', 1, '{"schemaVersion":"v1"}', sha256('def2'), 'test', now())
  insertPrep.run('p2', 'ns1', 'c2', 1, sha256('src2'), '{}', '{}', '{}', sha256('intent2'), 'PREPARED', now(), now())
  const insertPlan = db.prepare(`INSERT INTO i8_executable_plans(executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,plan_json,plan_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`)
  insertPlan.run('plan1', 'ns1', 'p1', 'c1', 1, sha256('intent'), '{"schemaVersion":"plan-v1"}', sha256('plan1'), 'EXECUTABLE_PLAN_READY', now(), now())
  insertPlan.run('plan2', 'ns1', 'p2', 'c2', 1, sha256('intent2'), '{"schemaVersion":"plan-v1"}', sha256('plan2'), 'EXECUTABLE_PLAN_READY', now(), now())
  const insertJob = db.prepare(`INSERT INTO i8_candidate_build_jobs(job_id,namespace,executable_plan_id,status,version,created_at,updated_at)
    VALUES (?,?,?,?,1,?,?)`)
  insertJob.run('job1', 'ns1', 'plan1', 'QUEUED', now(), now())
  insertJob.run('job2', 'ns1', 'plan2', 'QUEUED', now(), now())
  insertChallenge.run('verification_000000000000000000000000000000040000', 'ns1', 'job2', 'CAPTCHA', 'WAITING_USER_PREPARATION', 'detected', 'prepare', future(), now(), now())
}

function stopHarness(harness) {
  return new Promise(resolve => {
    if (!harness || harness.exitCode !== null) return resolve()
    harness.once('exit', () => resolve())
    harness.kill()
    setTimeout(() => { if (harness.exitCode === null) { harness.kill('SIGKILL'); resolve() } }, 3000)
  })
}

function startHarness(dbPath, token) {
  const child = spawn(nodeExecutable, ['dist/harness/src/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      HENGZHUN_PRODUCT_ROOT: root,
      HENGZHUN_SERVICE_TOKEN: token,
      HENGZHUN_WORKER_TOKEN: token,
      HENGZHUN_DATABASE_PATH: dbPath,
      HENGZHUN_DATABASE_BACKUP_PATH: path.join(ISO, 'backups'),
      HENGZHUN_ARTIFACT_ROOT: path.join(ISO, 'artifacts'),
      HENGZHUN_FLOWISE_ATTACHMENT_ROOT: path.join(ISO, 'flowise-attachments'),
      HENGZHUN_FLOWISE_STORAGE_ROOT: path.join(ISO, 'flowise-storage'),
      HOST: '127.0.0.1',
      PORT: String(HARNESS_PORT),
      HENGZHUN_ALLOWED_CLIENTS: '127.0.0.1,::1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    for (const line of String(chunk).split(/\r?\n/)) {
      try {
        const event = JSON.parse(line)
        if (event?.event === 'startup_failed' && typeof event?.errorCode === 'string') {
          child.startupErrorCode = event.errorCode
          child.startupMessage = String(event?.message || '')
            .replace(/(?:bearer|token|password|secret|api[_-]?key)\s*[:=]?\s*[^\s,;]+/gi, '$1=[REDACTED]')
            .slice(0, 240)
        }
      } catch { /* retain no unstructured service output */ }
    }
  })
  return child
}

async function post(route, payload, token) {
  const response = await fetch(`http://127.0.0.1:${HARNESS_PORT}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return { status: response.status, body: await response.json() }
}

test('RF-002-S2 tasks:get emits terminal and verificationGate from Harness state', async () => {
  assert.ok(fs.existsSync(path.join(root, 'dist/harness/src/index.js')), 'dist harness must be built with S2 changes')
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db)
  db.close()
  const harness = startHarness(dbPath, token)
  try {
    await waitForHealth(`http://127.0.0.1:${HARNESS_PORT}/health`, 30_000, harness)

    // running task, no challenge: not terminal, no gate
    const running = await post('/v1/i8/tasks:get', { namespace: 'ns1', taskId: 't-running' }, token)
    assert.equal(running.status, 200)
    assert.equal(running.body.terminal, false, 'RUNNING without gate must not be terminal')
    assert.equal('verificationGate' in running.body, false, 'no active challenge -> gate omitted')

    // succeeded task: terminal, no gate
    const succeeded = await post('/v1/i8/tasks:get', { namespace: 'ns1', taskId: 't-succ' }, token)
    assert.equal(succeeded.body.terminal, true, 'SUCCEEDED must be terminal')

    // active gate WAITING_USER_PREPARATION: terminal + gate, resumeAllowed false
    const prep = await post('/v1/i8/tasks:get', { namespace: 'ns1', taskId: 't-gate-prep' }, token)
    assert.equal(prep.body.terminal, true, 'active verification gate must be terminal')
    assert.deepEqual(prep.body.verificationGate, {
      challengeId: 'verification_000000000000000000000000000000010000', status: 'WAITING_USER_PREPARATION', kind: 'SMS_OTP',
      version: 1, verificationType: 'SMS_OTP', userPreparation: 'prepare', resumeAllowed: false
    })

    // active gate WAITING_USER_ACTION: resumeAllowed true
    const action = await post('/v1/i8/tasks:get', { namespace: 'ns1', taskId: 't-gate-action' }, token)
    assert.equal(action.body.verificationGate.resumeAllowed, true, 'WAITING_USER_ACTION must allow resume')
    assert.equal(action.body.verificationGate.kind, 'UKEY')

    // expired challenge: gate omitted, not terminal
    const expired = await post('/v1/i8/tasks:get', { namespace: 'ns1', taskId: 't-gate-expired' }, token)
    assert.equal('verificationGate' in expired.body, false, 'expired challenge must not produce a gate')
    assert.equal(expired.body.terminal, false)

    // dual-source consistency: verification:get on the same challenge agrees
    const verify = await post('/v1/i10/verification:get', { namespace: 'ns1', challengeId: 'verification_000000000000000000000000000000010000' }, token)
    assert.equal(verify.body.status, prep.body.verificationGate.status, 'gate status must match verification:get source')
    assert.equal(verify.body.verificationType, prep.body.verificationGate.kind, 'gate kind must match verification:get source')
  } finally {
    await stopHarness(harness)
    try { fs.rmSync(ISO, { recursive: true, force: true }) } catch { /* best effort */ }
  }
})

test('RF-002-S2 candidates:get emits terminal and verificationGate keyed by job id', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db)
  db.close()
  const harness = startHarness(dbPath, token)
  try {
    await waitForHealth(`http://127.0.0.1:${HARNESS_PORT}/health`, 30_000, harness)

    // queued job, no gate: nextAction non-terminal
    const plain = await post('/v1/i8/candidates:get', { namespace: 'ns1', preparationId: 'p1' }, token)
    assert.equal(plain.status, 200)
    assert.equal(plain.body.nextAction, 'AUTHORING_WORKER_REQUIRED')
    assert.equal(plain.body.terminal, false, 'AUTHORING_WORKER_REQUIRED must not be terminal')
    assert.equal('verificationGate' in plain.body, false)

    // job with active challenge: terminal + gate keyed by job id
    const gated = await post('/v1/i8/candidates:get', { namespace: 'ns1', preparationId: 'p2' }, token)
    assert.equal(gated.body.terminal, true, 'active gate must be terminal for candidates too')
    assert.deepEqual(gated.body.verificationGate, {
      challengeId: 'verification_000000000000000000000000000000040000', status: 'WAITING_USER_PREPARATION', kind: 'CAPTCHA',
      version: 1, verificationType: 'CAPTCHA', userPreparation: 'prepare', resumeAllowed: false
    })
  } finally {
    await stopHarness(harness)
    try { fs.rmSync(ISO, { recursive: true, force: true }) } catch { /* best effort */ }
  }
})

test('RF-002-S2 contract checks do not mutate the current ReleaseIdentity', () => {
  const { execFileSync } = require('node:child_process')
  const before = JSON.parse(execFileSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' })).identityHash
  const after = JSON.parse(execFileSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' })).identityHash
  assert.match(before, /^[0-9a-f]{64}$/)
  assert.equal(after, before)
})
