'use strict'

// RF-002-S3: MCP state-inference convergence tests.
// Isolated runtime (counting proxy + Harness + MCP): task_get/candidate_get
// must (a) be driven by the Harness terminal flag, (b) never call
// verification:get cross-endpoint, (c) keep the v7-compatible display
// projection built from the Harness verificationGate fields.

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const nodeExecutable = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
const Database = require(path.join(root, 'node_modules/better-sqlite3'))
const ISO = path.join(root, '.data', 'tests', 'rf002-s3')
const HARNESS_PORT = 28797
const PROXY_PORT = 28798
const MCP_PORT = 28799
const now = () => new Date().toISOString()
const future = () => new Date(Date.now() + 3600_000).toISOString()
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

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
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (\n    version INTEGER PRIMARY KEY,\n    name TEXT NOT NULL UNIQUE,\n    checksum TEXT NOT NULL,\n    applied_at TEXT NOT NULL\n  ) STRICT;`)
  for (const name of fs.readdirSync(path.join(root, 'harness/migrations')).filter(n => /^\d+_.+\.sql$/.test(n)).sort()) {
    const version = Number(name.split('_', 1)[0])
    const sql = fs.readFileSync(path.join(root, 'harness/migrations', name), 'utf8')
    db.exec('BEGIN')
    try { db.exec(sql); db.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)').run(version, name, sha256(sql), now()); db.exec('COMMIT') }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
}

function seed(db) {
  db.prepare('INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,?,1,?,?)').run('ns1', 'ACTIVE', now(), now())
  const insertTask = db.prepare('INSERT INTO tasks(task_id,namespace,task_type,status,progress,retryable,user_action_required,version,created_at,updated_at) VALUES (?,?,?,?,0,0,0,1,?,?)')
  insertTask.run('t-gate', 'ns1', 'RUN_EXECUTE', 'RUNNING', now(), now())
  insertTask.run('t-plain', 'ns1', 'RUN_EXECUTE', 'RUNNING', now(), now())
  const insertChallenge = db.prepare('INSERT INTO i10_verification_challenges(challenge_id,namespace,task_ref,verification_type,status,detection_summary,user_preparation,version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)')
  insertChallenge.run('verification_000000000000000000000000000000010000', 'ns1', 't-gate', 'SMS_OTP', 'WAITING_USER_PREPARATION', 'd', 'prepare', future(), now(), now())
  // candidates chain
  db.prepare('INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,?,?,?,?,?,?)').run('c1', 'ns1', 'VALIDATED', 'T', 'S', 'LOW', now(), now())
  db.prepare('INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,?,?,?,?,?)').run('c1', 1, '{"schemaVersion":"v1"}', sha256('def'), 'test', now())
  const insertPrep = db.prepare('INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,intent_plan_json,intent_plan_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)')
  insertPrep.run('prep1', 'ns1', 'c1', 1, sha256('src'), '{}', '{}', '{}', sha256('i'), 'PREPARED', now(), now())
  db.prepare('INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,?,?,?,?,?,?)').run('c2', 'ns1', 'VALIDATED', 'T2', 'S2', 'LOW', now(), now())
  db.prepare('INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,?,?,?,?,?)').run('c2', 1, '{"schemaVersion":"v1"}', sha256('def2'), 'test', now())
  insertPrep.run('prep2', 'ns1', 'c2', 1, sha256('src2'), '{}', '{}', '{}', sha256('i2'), 'PREPARED', now(), now())
  const insertPlan = db.prepare('INSERT INTO i8_executable_plans(executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,plan_json,plan_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)')
  insertPlan.run('plan1', 'ns1', 'prep1', 'c1', 1, sha256('i'), '{"schemaVersion":"plan-v1"}', sha256('prep1'), 'EXECUTABLE_PLAN_READY', now(), now())
  insertPlan.run('plan2', 'ns1', 'prep2', 'c2', 1, sha256('i2'), '{"schemaVersion":"plan-v1"}', sha256('prep2'), 'EXECUTABLE_PLAN_READY', now(), now())
  const insertJob = db.prepare('INSERT INTO i8_candidate_build_jobs(job_id,namespace,executable_plan_id,status,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
  insertJob.run('job1', 'ns1', 'plan1', 'QUEUED', now(), now())
  insertJob.run('job2', 'ns1', 'plan2', 'QUEUED', now(), now())
  insertChallenge.run('verification_000000000000000000000000000000020000', 'ns1', 'job2', 'CAPTCHA', 'WAITING_USER_PREPARATION', 'd', 'prepare', future(), now(), now())
}

function stop(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    child.kill()
    setTimeout(() => { if (child.exitCode === null) { child.kill('SIGKILL'); resolve() } }, 3000)
  })
}

test('RF-002-S3 MCP convergence: terminal-driven polling, zero cross-endpoint verification calls, v7-compatible display', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const dbPath = path.join(ISO, 'state.sqlite')
  const token = crypto.randomBytes(32).toString('hex')
  const db = new Database(dbPath)
  applyMigrations(db)
  seed(db)
  db.close()

  const verificationCalls = []
  const proxy = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://x').pathname
    if (route.includes('verification:get')) verificationCalls.push(route)
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const up = http.request({ host: '127.0.0.1', port: HARNESS_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${HARNESS_PORT}` } }, ur => { res.writeHead(ur.statusCode || 502, ur.headers); ur.pipe(res) })
      up.on('error', () => { res.writeHead(502); res.end('{}') })
      up.end(Buffer.concat(chunks))
    })
  })
  proxy.listen(PROXY_PORT, '127.0.0.1')
  const harness = spawn(nodeExecutable, ['dist/harness/src/index.js'], { cwd: root, env: { ...process.env, HENGZHUN_PRODUCT_ROOT: root, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_WORKER_TOKEN: token, HENGZHUN_DATABASE_PATH: dbPath, HOST: '127.0.0.1', PORT: String(HARNESS_PORT), HENGZHUN_ALLOWED_CLIENTS: '127.0.0.1,::1' }, stdio: 'ignore' })
  const mcp = spawn(nodeExecutable, ['mcp/src/server.cjs'], { cwd: root, env: { ...process.env, HENGZHUN_MCP_PORT: String(MCP_PORT), HENGZHUN_HARNESS_URL: `http://127.0.0.1:${PROXY_PORT}`, FLOWISE_APP_PATH: path.join(root, 'flowise', 'app'), HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: token, HENGZHUN_NAMESPACE: 'ns1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await waitForHealth(`http://127.0.0.1:${HARNESS_PORT}/health`, 30_000)
    await waitForHealth(`http://127.0.0.1:${MCP_PORT}/health`, 30_000)

    async function mcpCall(name, args) {
      const r = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 's3', method: 'tools/call', params: { name, arguments: args } }) })
      const raw = await r.text()
      const dataLine = raw.split('\n').find(l => l.startsWith('data:'))
      const body = JSON.parse(dataLine.slice(5).trim())
      const text = body.result.content[0].text
      try { return JSON.parse(text) } catch { throw new Error('MCP_TOOL_RESPONSE_NOT_JSON: ' + text.slice(0, 300)) }
    }

    // task with active gate: v7-compatible display projection, no verification:get call
    const gatedTask = await mcpCall('task_get', { taskId: 't-gate', waitForTerminal: true, waitTimeoutSeconds: 2 })
    assert.equal(gatedTask.status, 'WAITING_USER', 'gate task must display WAITING_USER')
    assert.equal(gatedTask.nextAction, 'HUMAN_VERIFICATION_REQUIRED')
    assert.deepEqual(gatedTask.verification, {
      challengeId: 'verification_000000000000000000000000000000010000',
      status: 'WAITING_USER_PREPARATION', version: 1, verificationType: 'SMS_OTP', userPreparation: 'prepare'
    })

    // plain running task: async resume on timeout, no display overwrite
    const plainTask = await mcpCall('task_get', { taskId: 't-plain', waitForTerminal: true, waitTimeoutSeconds: 1 })
    assert.equal(plainTask.status, 'RUNNING', 'plain task keeps its Harness status on async resume')
    assert.equal(plainTask.nextAction, 'ASYNC_TASK_RESUME', 'plain task timeout must resume asynchronously')
    assert.equal('verification' in plainTask, false)

    // candidate with gate (waitForCertificate): display projection
    const gatedCandidate = await mcpCall('candidate_get', { preparationId: 'prep2', sessionRef: 'sess', waitForCertificate: true, waitTimeoutSeconds: 2 })
    assert.equal(gatedCandidate.status, 'WAITING_USER', 'gated candidate must display WAITING_USER')
    assert.equal(gatedCandidate.nextAction, 'HUMAN_VERIFICATION_REQUIRED')
    assert.deepEqual(gatedCandidate.verification, {
      challengeId: 'verification_000000000000000000000000000000020000',
      status: 'WAITING_USER_PREPARATION', version: 1, verificationType: 'CAPTCHA', userPreparation: 'prepare'
    })

    // plain candidate: non-terminal, timeout resumes asynchronously
    const plainCandidate = await mcpCall('candidate_get', { preparationId: 'prep1', sessionRef: 'sess', waitForCertificate: true, waitTimeoutSeconds: 1 })
    assert.equal(plainCandidate.nextAction, 'ASYNC_CANDIDATE_RESUME', 'plain candidate timeout must resume asynchronously')
    assert.equal(plainCandidate.errorCode, 'I8_CANDIDATE_WAIT_TIMEOUT')
    assert.equal('verification' in plainCandidate, false)

    // zero cross-endpoint verification:get calls across the whole matrix
    assert.deepEqual(verificationCalls, [], 'S3 must never call verification:get cross-endpoint')
  } finally {
    await stop(mcp)
    await stop(harness)
    proxy.close()
    setTimeout(() => { try { fs.rmSync(ISO, { recursive: true, force: true }) } catch { /* best effort */ } }, 1200)
  }
})
