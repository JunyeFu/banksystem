'use strict'

// RF-004-S3: Harness credential endpoint resolution (DP-S4-2=A).
// Isolated runtime against the real dist harness:
//   - run_submit without alias: succeeds when the case carries the
//     authoritative credentialRef (runs.credential_alias NULL), fails closed
//     I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED otherwise
//   - run_submit with alias (legacy injection): original path
//   - schedule_create without alias: credentialRef case -> traceable
//     credref:<hash12> placeholder; no credentialRef -> fail closed

const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const nodeExecutable = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
const Database = require(path.join(root, 'node_modules/better-sqlite3'))
const ISO = path.join(root, '.data', 'tests', 'rf004-s3')
const HARNESS_PORT = 28817
const now = () => new Date().toISOString()
const future = () => new Date(Date.now() + 3600_000).toISOString()
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const CRED = 'credential_12345678-1234-1234-1234-123456789abc'

function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(url, { timeout: 1000 }, response => {
        response.resume()
        if (response.statusCode === 200) return resolve()
        retry()
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`health timeout: ${url}`))
      setTimeout(tick, 300)
    }
    tick()
  })
}

function applyMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;')
  for (const name of fs.readdirSync(path.join(root, 'harness/migrations')).filter(n => /^\d+_.+\.sql$/.test(n)).sort()) {
    const version = Number(name.split('_', 1)[0])
    const sql = fs.readFileSync(path.join(root, 'harness/migrations', name), 'utf8')
    db.exec('BEGIN')
    try { db.exec(sql); db.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)').run(version, name, sha256(sql), now()); db.exec('COMMIT') }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
}

function seed(db, withCredentialRef) {
  db.prepare('INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,?,1,?,?)').run('ns1', 'ACTIVE', now(), now())
  const definition = withCredentialRef
    ? JSON.stringify({ schemaVersion: 'hengzhun-i10-case-draft-v1', credentialRef: CRED, entryUrl: 'https://bank.example.com/portal/login' })
    : JSON.stringify({ schemaVersion: 'hengzhun-i10-case-draft-v1', entryUrl: 'https://bank.example.com/portal/login' })
  db.prepare('INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,?,?,?,?,?,?)')
    .run('c1', 'ns1', 'VALIDATED', 'T', 'S', 'LOW', now(), now())
  db.prepare('INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,?,?,?,?,?)')
    .run('c1', 1, definition, sha256('def'), 'test', now())
  db.prepare('INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,intent_plan_json,intent_plan_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)')
    .run('prep1', 'ns1', 'c1', 1, sha256('src'), '{}', '{}', '{}', sha256('i'), 'PREPARED', now(), now())
  db.prepare('INSERT INTO i8_executable_plans(executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,plan_json,plan_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)')
    .run('ep1', 'ns1', 'prep1', 'c1', 1, sha256('i'), '{"schemaVersion":"plan-v1"}', sha256('ep'), 'EXECUTABLE_PLAN_READY', now(), now())
  db.prepare('INSERT INTO scripts(script_id,namespace,case_id,current_version,status,created_at,updated_at) VALUES (?,?,?,1,?,?,?)')
    .run('s1', 'ns1', 'c1', 'SCRIPT_VALIDATED', now(), now())
  db.prepare('INSERT INTO script_versions(script_id,version,relative_path,sha256,validation_status,created_at) VALUES (?,?,?,?,?,?)')
    .run('s1', 1, 'cases/c1.spec.cjs', sha256('script'), 'PASSED', now())
  db.prepare('INSERT INTO plans(plan_id,namespace,case_id,case_version,version,status,summary_json,content_hash,script_id,created_at) VALUES (?,?,?,?,1,?,?,?,?,?)')
    .run('plan1', 'ns1', 'c1', 1, 'READY', '{}', sha256('plan'), 's1', now())
  db.prepare(`INSERT INTO i8_script_candidates(candidate_id,namespace,executable_plan_id,script_id,script_version,dsl_version,dsl_json,dsl_hash,generator_version,relative_directory,script_sha256,manifest_json,manifest_sha256,source_chain_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
    .run('cand1', 'ns1', 'ep1', 's1', 1, 'HENGZHUN_DSL_V1', '{}', sha256('dsl'), 'v1', 'cand1', sha256('script'), '{}', sha256('manifest'), sha256('chain'), 'SCRIPT_VALIDATED', now(), now())
  db.prepare(`INSERT INTO i8_stability_batches(batch_id,namespace,candidate_id,status,version,created_at,updated_at)
    VALUES (?,?,?,?,1,?,?)`)
    .run('batch1', 'ns1', 'cand1', 'PASSED', now(), now())
  db.prepare(`INSERT INTO i8_stability_certificates(certificate_id,namespace,candidate_id,batch_id,script_sha256,case_version,executable_plan_version,runtime_fingerprint,viewport_set_json,validation_run_ids_json,assertion_set_hash,evidence_set_hash,status,issued_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('cert1', 'ns1', 'cand1', 'batch1', sha256('script'), 1, 1, sha256('fp'), '[]', '[]', sha256('a'), sha256('e'), 'PASSED', now())
  db.prepare(`INSERT INTO i8_script_delivery_decisions(decision_id,namespace,candidate_id,certificate_id,expected_candidate_version,choice,reason,confirmation_ref,effect,case_version,executable_plan_id,executable_plan_version,activated_plan_id,script_id,script_version,script_sha256,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('d1', 'ns1', 'cand1', 'cert1', 1, 'ACTIVATE', 'r', 'conf', 'SCRIPT_VERSION_ACTIVATED', 1, 'ep1', 1, 'plan1', 's1', 1, sha256('script'), now())
}

function startHarness(dbPath, token) {
  return spawn(nodeExecutable, ['dist/harness/src/index.js'], { cwd: root, env: { ...process.env, HENGZHUN_PRODUCT_ROOT: root, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_WORKER_TOKEN: token, HENGZHUN_DATABASE_PATH: dbPath, HOST: '127.0.0.1', PORT: String(HARNESS_PORT), HENGZHUN_ALLOWED_CLIENTS: '127.0.0.1,::1' }, stdio: ['ignore', 'pipe', 'pipe'] })
}

function stop(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    child.kill()
    setTimeout(() => { if (child.exitCode === null) { child.kill('SIGKILL'); resolve() } }, 3000)
  })
}

afterEach(async () => {
  // Windows may hold the sqlite handle briefly after the harness exits;
  // retry cleanup so a failing test cannot poison the next one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { fs.rmSync(ISO, { recursive: true, force: true }); return } catch { await new Promise(resolve => setTimeout(resolve, 400)) }
  }
})

async function post(route, payload, token) {
  const r = await fetch(`http://127.0.0.1:${HARNESS_PORT}${route}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  return { status: r.status, body: await r.json() }
}

async function withHarness(dbPath, token, fn) {
  const harness = startHarness(dbPath, token)
  try {
    await waitForHealth(`http://127.0.0.1:${HARNESS_PORT}/health`, 30_000)
    return await fn()
  } finally {
    await stop(harness)
  }
}

test('RF-004-S3 run_submit resolves the authoritative binding from the case', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db, true)
  db.close()
  await withHarness(dbPath, token, async () => {
    // no alias, case has credentialRef -> accepted, alias column stays NULL
    const ok = await post('/v1/i8/runs:submit', { namespace: 'ns1', idempotencyKey: 'key-run-ok', preparationId: 'prep1' }, token)
    if (ok.status !== 202) console.log('DEBUG run_submit 409 body:', JSON.stringify(ok.body).slice(0, 300))
    assert.equal(ok.status, 202, 'run without alias + case credentialRef must be accepted')
    assert.ok(ok.body.runId, 'runId must be returned')
  })
  const check = new Database(dbPath)
  const row = check.prepare('SELECT credential_alias FROM runs WHERE namespace = ?').get('ns1')
  assert.equal(row.credential_alias, null, 'runs.credential_alias must stay NULL without injection')
  check.close()
})

test('RF-004-S3 run_submit fails closed without any binding (DP-S4-2=A)', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db, false)
  db.close()
  await withHarness(dbPath, token, async () => {
    const rejected = await post('/v1/i8/runs:submit', { namespace: 'ns1', idempotencyKey: 'key-run-no-cred', preparationId: 'prep1' }, token)
    assert.equal(rejected.status, 409)
    assert.equal(rejected.body.errorCode, 'I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED')
  })
})

test('RF-004-S3 run_submit with legacy alias injection keeps the original path', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db, false)
  db.close()
  await withHarness(dbPath, token, async () => {
    const ok = await post('/v1/i8/runs:submit', { namespace: 'ns1', idempotencyKey: 'key-run-legacy', preparationId: 'prep1', credentialAlias: 'i3-customer' }, token)
    assert.equal(ok.status, 202, 'legacy injected alias must keep the original path')
  })
  const check = new Database(dbPath)
  const row = check.prepare('SELECT credential_alias FROM runs WHERE namespace = ?').get('ns1')
  assert.equal(row.credential_alias, 'i3-customer')
  check.close()
})

test('RF-004-S3 schedule_create stores a traceable placeholder for credentialRef cases', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db, true)
  db.close()
  await withHarness(dbPath, token, async () => {
    const ok = await post('/v1/i8/schedules:create', {
      namespace: 'ns1', idempotencyKey: 'key-sched-ok', preparationId: 'prep1',
      scheduleType: 'ONE_TIME', runAt: future(), timezone: 'Asia/Shanghai',
      misfirePolicy: 'SKIP', misfireGraceSeconds: 300, maxRetries: 1, confirmationRef: 'conf-1'
    }, token)
    assert.equal(ok.status, 201, 'schedule without alias + case credentialRef must be accepted')
    assert.ok(ok.body.scheduleId)
  })
  const check = new Database(dbPath)
  const row = check.prepare('SELECT credential_alias FROM schedules WHERE namespace = ?').get('ns1')
  assert.match(row.credential_alias, /^credref:[0-9a-f]{12}$/, 'schedules column must hold the traceable hash placeholder')
  assert.ok(!row.credential_alias.includes(CRED), 'the credential itself must never be stored')
  check.close()
})

test('RF-004-S3 schedule_create fails closed without any binding', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db, false)
  db.close()
  await withHarness(dbPath, token, async () => {
    const rejected = await post('/v1/i8/schedules:create', {
      namespace: 'ns1', idempotencyKey: 'key-sched-no-cred', preparationId: 'prep1',
      scheduleType: 'ONE_TIME', runAt: future(), timezone: 'Asia/Shanghai',
      misfirePolicy: 'SKIP', misfireGraceSeconds: 300, maxRetries: 1, confirmationRef: 'conf-2'
    }, token)
    assert.equal(rejected.status, 409)
    assert.equal(rejected.body.errorCode, 'I10_EXECUTION_CREDENTIAL_BINDING_REQUIRED')
  })
})
