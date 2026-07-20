'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')
const { I8_CONTROLLED_CATALOG } = require('../../dist/harness/src/i8/script-package-builder.js')
const { executeI8FormalRun } = require('../../worker/src/i8-formal-runner.cjs')

const productRoot = path.resolve(__dirname, '../..')
const serviceToken = 'synthetic-i8-stage6-service-token-000001'
const workerToken = 'synthetic-i8-stage6-worker-token-000002'
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stableJson = value => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object'
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}` : JSON.stringify(value)

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage6-'))
  const running = await startHarness({
    productRoot: root, databasePath: path.join(root, '.data', 'sqlite', 'platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'), backupDirectory: path.join(root, '.data', 'backups'),
    artifactRoot: path.join(root, '.data', 'artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0
  })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { ...running, root, baseUrl }
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { response, body: await response.json() }
}

function evidence(type, content = '{}') {
  const map = { REPORT: ['application/json', 'json'], SCREENSHOT: ['image/png', 'png'], LOG: ['text/plain', 'log'] }
  return { artifactType: type, mediaType: map[type][0], redactionStatus: 'REDACTED', extension: map[type][1], base64Content: Buffer.from(content).toString('base64'), metadata: { synthetic: true } }
}

async function startPortal(t) {
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname; response.setHeader('content-type', 'text/html; charset=utf-8')
    if (route === '/portal/login') return response.end('<input data-testid="login-username"><input data-testid="login-password" type="password"><button data-testid="login-submit">登录</button><script>document.querySelector("button").onclick=()=>{if(document.querySelector("[data-testid=login-username]").value==="synthetic-user"&&document.querySelector("[data-testid=login-password]").value==="synthetic-password"){sessionStorage.auth="1";location.href="/portal/dashboard"}}</script>')
    if (route === '/portal/dashboard') return response.end('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><a href="/portal/profile">个人资料</a>')
    if (route === '/portal/profile') return response.end('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><span data-testid="profile-display-name">张三</span><span data-testid="profile-avatar">张</span><span data-testid="profile-customer-id">id</span><span data-testid="profile-email">x@example.invalid</span><span data-testid="profile-phone">0</span>')
    response.statusCode = 404; response.end('not found')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

function domainObjects() {
  const knowledgeHash = sha256(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'knowledge', 'portal-login-consistency.md')))
  const draft = {
    schemaVersion: 'i8-regression-case-draft-v1', title: '阶段6门户登录资料一致性', objective: '验证当前客户身份。', summary: '登录后核对页眉与个人资料。',
    riskLevel: 'LOW', route: '/portal/login', preconditions: ['使用受控合成客户身份'],
    steps: [{ action: '登录门户', expected: '进入门户' }, { action: '打开个人资料', expected: '资料一致' }],
    assertions: ['页眉姓名与个人资料姓名相等', '页眉头像与个人资料头像相等'],
    knowledgeSnapshot: { knowledgeSnapshotId: 'flowise-portal-login-v1', sourceVersion: '1.0.0', contentHash: knowledgeHash, citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency'] }
  }
  return { draft, acceptanceSummary: { schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective, stepCount: 2, assertionCount: 2, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: [] } }
}

function recordsFor(plan) {
  return plan.actions.map(action => ({
    schemaVersion: 'i8-verified-action-record-v1', executablePlanId: plan.executablePlanId, actionId: action.actionId, ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED', ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}),
    pageSignatureHash: sha256(stableJson(action.pageSignature)), factsHash: sha256(stableJson({ actionId: action.actionId, outcome: 'VERIFIED_PASSED' })),
    verification: { dom: true, url: true, request: true, business: true }, verifiedAt: '2026-07-20T13:00:00.000Z'
  }))
}

function syntheticCertificate(root, claim, workerId) {
  const assertionSetHash = sha256('same-assertions'); const evidenceSetHash = sha256('same-evidence-shape')
  return { workerId, candidateId: claim.candidateId, scriptHash: claim.scriptHash, runtimeFingerprint: sha256('stage6-runtime'), runs: claim.runs.map(run => {
    const directory = path.join(root, '.data', 'stability', claim.namespace, claim.candidateId, run.validationRunId); fs.mkdirSync(directory, { recursive: true })
    const evidenceItems = [['REPORT', 'application/json', 'report.json'], ['SCREENSHOT', 'image/png', 'screenshot.png'], ['LOG', 'text/plain; charset=utf-8', 'steps.log']].map(([artifactType, mediaType, name]) => {
      const target = path.join(directory, name); fs.writeFileSync(target, `${run.validationRunId}:${artifactType}`); const bytes = fs.readFileSync(target)
      return { artifactType, mediaType, redactionStatus: 'REDACTED', relativePath: path.relative(root, target).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.byteLength }
    })
    return { ...run, outcome: 'PASSED', durationMs: 1, assertionSetHash, evidenceSetHash, evidence: evidenceItems }
  }) }
}

async function activatedCandidate(baseUrl, root, namespace) {
  const { draft, acceptanceSummary } = domainObjects()
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', { namespace, idempotencyKey: 's6-prepare', actorRef: 'flowise-controller', caseDescription: '登录后核对姓名头像', draft, acceptanceSummary })
  const intentPlan = { schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login', steps: [{ intentStepId: 'intent-login', action: '登录门户', expected: '进入受保护页面', riskLevel: 'LOW' }, { intentStepId: 'intent-profile', action: '核对身份', expected: '姓名头像一致', riskLevel: 'LOW' }], assertions: draft.assertions }
  assert.equal((await post(baseUrl, '/v1/i8/authoring:submit', { namespace, idempotencyKey: 's6-author', preparationId: prepared.body.preparationId, expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: 's6-author-confirm', reason: '用户批准' }, intentPlan })).response.status, 202)
  assert.equal((await post(baseUrl, '/v1/i8/candidates:compile', { namespace, idempotencyKey: 's6-compile', preparationId: prepared.body.preparationId, expectedPreparationVersion: 2 })).response.status, 202)
  const build = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: 's6-builder' }, workerToken)
  await post(baseUrl, `/internal/worker/i8/candidates/${encodeURIComponent(build.body.jobId)}:complete`, { workerId: 's6-builder', planHash: build.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(build.body.plan) }, workerToken)
  const stability = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 's6-stability' }, workerToken)
  const certified = await post(baseUrl, `/internal/worker/i8/stability/${encodeURIComponent(stability.body.batchId)}:complete`, syntheticCertificate(root, stability.body, 's6-stability'), workerToken)
  assert.equal(certified.response.status, 200, JSON.stringify(certified.body))
  const current = await post(baseUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.body.preparationId })
  const activated = await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's6-activate', candidateId: current.body.candidate.candidateId, expectedCandidateVersion: current.body.candidate.version, choice: 'ACTIVATE', confirmationRef: 's6-activate-confirm', reason: '激活阶段6脚本' })
  assert.equal(activated.body.status, 'SCRIPT_VALIDATED', JSON.stringify(activated.body))
  return { prepared: prepared.body, activated: activated.body }
}

test('migration 014 adds frozen schedule identity and immutable inbox authority', async t => {
  const { application } = await fixture(t)
  assert.equal(application.database.connection.prepare('SELECT name FROM schema_migrations WHERE version=14').get().name, '014_i8_scheduling_inbox.sql')
  assert.equal(application.database.connection.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='result_inbox_items'").get().count, 1)
  const columns = application.database.connection.prepare('PRAGMA table_info(schedules)').all().map(row => row.name)
  for (const name of ['schedule_type', 'run_at', 'script_id', 'script_version', 'script_sha256', 'one_time_state', 'completed_at', 'confirmation_ref']) assert.ok(columns.includes(name))
})

test('ONE_TIME binds exact script version, survives current-version drift and delivers one inbox item', async t => {
  const { application, root, baseUrl } = await fixture(t); const namespace = 'i8-stage6-one-time'
  const portalBaseUrl = await startPortal(t)
  const seeded = await activatedCandidate(baseUrl, root, namespace)
  const future = new Date(Date.now() + 3_600_000).toISOString()
  const created = await post(baseUrl, '/v1/i8/schedules:create', {
    namespace, idempotencyKey: 's6-one-time-create', preparationId: seeded.prepared.preparationId,
    scheduleType: 'ONE_TIME', runAt: future, timezone: 'Asia/Shanghai', misfirePolicy: 'RUN_ONCE',
    misfireGraceSeconds: 300, maxRetries: 1, confirmationRef: 's6-schedule-confirm', credentialAlias: 'i3-customer'
  })
  assert.equal(created.response.status, 201); assert.equal(created.body.scheduleType, 'ONE_TIME')
  const duplicateConfirmation = await post(baseUrl, '/v1/i8/schedules:create', {
    namespace, idempotencyKey: 's6-one-time-duplicate', preparationId: seeded.prepared.preparationId,
    scheduleType: 'ONE_TIME', runAt: new Date(Date.now() + 7_200_000).toISOString(), timezone: 'Asia/Shanghai',
    misfirePolicy: 'RUN_ONCE', misfireGraceSeconds: 300, maxRetries: 1,
    confirmationRef: 's6-schedule-confirm', credentialAlias: 'i3-customer'
  })
  assert.equal(duplicateConfirmation.response.status, 409); assert.equal(duplicateConfirmation.body.errorCode, 'I8_SCHEDULE_CONFIRMATION_ALREADY_USED')
  const frozen = application.database.connection.prepare('SELECT * FROM schedules WHERE schedule_id=?').get(created.body.scheduleId)
  const oldVersion = frozen.script_version; const oldHash = frozen.script_sha256
  const scriptRow = application.database.connection.prepare('SELECT * FROM script_versions WHERE script_id=? AND version=?').get(frozen.script_id, oldVersion)
  application.database.connection.prepare(`INSERT INTO script_versions(script_id,version,relative_path,sha256,validation_status,created_at,configuration_json,source_sha256)
    VALUES(?,?,?,?,'PASSED',?,?,?)`).run(frozen.script_id, oldVersion + 1, scriptRow.relative_path, sha256('new-script-version'), new Date().toISOString(), scriptRow.configuration_json, sha256('new-script-version'))
  application.database.connection.prepare('UPDATE scripts SET current_version=? WHERE script_id=?').run(oldVersion + 1, frozen.script_id)
  const due = new Date(Date.now() + 1_000); application.database.connection.prepare('UPDATE schedules SET next_fire_at=? WHERE schedule_id=?').run(due.toISOString(), created.body.scheduleId)
  const tick = await application.service.tickSchedules(new Date(due.getTime() + 1_000)); assert.equal(tick.queued, 1)
  await application.service.tickSchedules(new Date(due.getTime() + 2_000))
  const claim = await post(baseUrl, '/internal/worker/tasks:claim', { workerId: 's6-runner' }, workerToken)
  assert.equal(claim.body.execution.scriptVersion, oldVersion); assert.equal(claim.body.execution.scriptHash, oldHash)
  const runResult = await executeI8FormalRun(claim.body, {
    HENGZHUN_PORTAL_BASE_URL: portalBaseUrl,
    HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME: 'synthetic-user',
    HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD: 'synthetic-password'
  }, { productRoot: root, runtimeProductRoot: productRoot })
  assert.equal(runResult.outcome, 'PASSED'); assert.equal(runResult.evidence.length, 3)
  const completed = await post(baseUrl, `/internal/worker/tasks/${encodeURIComponent(claim.body.taskId)}:complete`, {
    workerId: 's6-runner', ...runResult
  }, workerToken)
  assert.equal(completed.body.status, 'SUCCEEDED')
  const schedule = await post(baseUrl, '/v1/i8/schedules:get', { namespace, scheduleId: created.body.scheduleId })
  assert.equal(schedule.body.status, 'DISABLED'); assert.equal(schedule.body.oneTimeState, 'SUCCEEDED'); assert.equal(schedule.body.scriptVersion, oldVersion)
  const inbox = await post(baseUrl, '/v1/i8/results:inbox-list', { namespace, limit: 20, unreadOnly: true, acknowledgeInboxIds: [] })
  assert.equal(inbox.body.items.length, 1); assert.equal(inbox.body.unreadCount, 1); assert.equal(inbox.body.items[0].scriptVersion, oldVersion)
  assert.doesNotMatch(JSON.stringify(inbox.body), /(?:relativePath|[A-Za-z]:\\|synthetic-password)/i)
  const acknowledged = await post(baseUrl, '/v1/i8/results:inbox-list', { namespace, limit: 20, unreadOnly: false, acknowledgeInboxIds: [inbox.body.items[0].inboxId] })
  assert.equal(acknowledged.body.items[0].status, 'READ'); assert.equal(acknowledged.body.unreadCount, 0)
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) count FROM result_inbox_items').get().count, 1)
  assert.throws(() => application.database.connection.prepare('DELETE FROM result_inbox_items').run(), /RESULT_INBOX_IMMUTABLE/)
})

test('RECURRING validates five-field Cron while ONE_TIME enforces future timezone-aware runAt', async t => {
  const { root, baseUrl } = await fixture(t); const namespace = 'i8-stage6-contract'; const seeded = await activatedCandidate(baseUrl, root, namespace)
  const recurring = await post(baseUrl, '/v1/i8/schedules:create', { namespace, idempotencyKey: 's6-recurring', preparationId: seeded.prepared.preparationId, scheduleType: 'RECURRING', cronExpression: '0 9 * * 1-5', timezone: 'Asia/Shanghai', misfirePolicy: 'RUN_ONCE', misfireGraceSeconds: 300, maxRetries: 1, confirmationRef: 's6-recurring-confirm', credentialAlias: 'i3-customer' })
  assert.equal(recurring.response.status, 201); assert.equal(recurring.body.cronExpression, '0 9 * * 1-5')
  const invalid = await post(baseUrl, '/v1/i8/schedules:create', { namespace, idempotencyKey: 's6-invalid', preparationId: seeded.prepared.preparationId, scheduleType: 'ONE_TIME', runAt: '2020-01-01T00:00:00+08:00', timezone: 'Asia/Shanghai', misfirePolicy: 'SKIP', misfireGraceSeconds: 0, maxRetries: 0, confirmationRef: 's6-invalid-confirm', credentialAlias: 'i3-customer' })
  assert.equal(invalid.response.status, 409); assert.equal(invalid.body.errorCode, 'ONE_TIME_RUN_AT_NOT_FUTURE')
})

test('stage6 MCP and Flowise artifacts expose eleven governed tools without forbidden execution nodes', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(productRoot, 'contracts', 'mcp', 'hengzhun-i8.json')))
  const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'deployment-manifest.json')))
  const flow = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', manifest.stage6ContinuationArtifact)))
  assert.equal(contract.activeStage, 6); assert.equal(contract.tools.filter(tool => tool.status === 'ACTIVE').length, 11)
  assert.deepEqual(manifest.activeMcpTools, contract.tools.filter(tool => tool.status === 'ACTIVE').map(tool => tool.name))
  assert.equal(flow.entryContract.cronInputFromUserForbidden, true)
  assert.deepEqual([...new Set(flow.nodes.filter(node => node.semantic === 'mcp_tool').map(node => node.tool))], ['run_submit', 'schedule_create', 'schedule_get', 'result_inbox_list'])
  assert.equal(flow.nodes.find(node => node.id === 'scheduleCreateRecurring').arguments.runAt, undefined)
  assert.equal(flow.nodes.find(node => node.id === 'scheduleCreateOneTime').arguments.cronExpression, undefined)
  assert.equal(flow.nodes.some(node => flow.forbiddenSemantics.includes(node.semantic)), false)
  assert.match(fs.readFileSync(path.join(productRoot, 'mcp', 'src', 'server.cjs'), 'utf8'), /version: '6\.0\.0'/)
})
