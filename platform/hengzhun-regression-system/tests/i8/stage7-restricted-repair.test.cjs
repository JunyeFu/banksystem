'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I8_CONTROLLED_CATALOG } = require('../../dist/harness/src/i8/script-package-builder.js')
const { classifyI8Failure, scriptPatchProposalSchema } = require('../../dist/harness/src/i8/stage7-schemas.js')
const { executeStabilityBatch } = require('../../worker/src/i8-stability-runner.cjs')

const productRoot = path.resolve(__dirname, '../..')
const serviceToken = 'synthetic-i8-stage7-service-token-000001'
const workerToken = 'synthetic-i8-stage7-worker-token-000002'
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 })
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stableJson = value => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}` : JSON.stringify(value)

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage7-'))
  const running = await startHarness({ productRoot: root, databasePath: path.join(root, '.data/sqlite/platform.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, '.data/backups'), artifactRoot: path.join(root, '.data/artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] }, workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 28787 })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { ...running, root, baseUrl }
}

async function post(baseUrl, route, body, token = serviceToken) {
  const payload = Buffer.from(JSON.stringify(body))
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const request = http.request(new URL(route, baseUrl), { method: 'POST', agent: httpAgent, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': payload.byteLength } }, response => {
          const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ response: { status: response.statusCode }, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
        })
        request.on('error', reject); request.end(payload)
      })
    } catch (error) {
      if (error.code !== 'ENOBUFS' || attempt === 19) throw error
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
    }
  }
}

function recordsFor(plan) {
  return plan.actions.map(action => ({ schemaVersion: 'i8-verified-action-record-v1', executablePlanId: plan.executablePlanId, actionId: action.actionId, ordinal: action.ordinal, outcome: 'VERIFIED_PASSED', ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}), pageSignatureHash: sha256(stableJson(action.pageSignature)), factsHash: sha256(stableJson({ actionId: action.actionId })), verification: { dom: true, url: true, request: true, business: true }, verifiedAt: '2026-07-20T14:00:00.000Z' }))
}

function stabilityCompletion(root, claim, workerId) {
  const assertionSetHash = sha256('stage7-assertions'), evidenceSetHash = sha256('stage7-evidence-shape')
  return { workerId, candidateId: claim.candidateId, scriptHash: claim.scriptHash, runtimeFingerprint: sha256('stage7-runtime'), runs: claim.runs.map(run => {
    const directory = path.join(root, '.data/stability', claim.namespace, claim.candidateId, run.validationRunId); fs.mkdirSync(directory, { recursive: true })
    const evidence = [['REPORT', 'application/json', 'report.json'], ['SCREENSHOT', 'image/png', 'screenshot.png'], ['LOG', 'text/plain; charset=utf-8', 'steps.log']].map(([artifactType, mediaType, name]) => { const target = path.join(directory, name); fs.writeFileSync(target, `${run.validationRunId}:${artifactType}`); const bytes = fs.readFileSync(target); return { artifactType, mediaType, redactionStatus: 'REDACTED', relativePath: path.relative(root, target).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.byteLength } })
    return { ...run, outcome: 'PASSED', durationMs: 1, assertionSetHash, evidenceSetHash, evidence }
  }) }
}

async function seedActivated(baseUrl, root, namespace) {
  const knowledgeHash = sha256(fs.readFileSync(path.join(productRoot, 'flowise/i8/knowledge/portal-login-consistency.md')))
  const draft = { schemaVersion: 'i8-regression-case-draft-v1', title: '阶段7登录资料一致性', objective: '验证客户身份一致。', summary: '登录后核对资料。', riskLevel: 'LOW', route: '/portal/login', preconditions: ['受控客户'], steps: [{ action: '登录', expected: '成功' }, { action: '核对', expected: '一致' }], assertions: ['姓名相等', '头像相等'], knowledgeSnapshot: { knowledgeSnapshotId: 'flowise-portal-login-v1', sourceVersion: '1.0.0', contentHash: knowledgeHash, citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency'] } }
  const acceptanceSummary = { schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective, stepCount: 2, assertionCount: 2, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: [] }
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', { namespace, idempotencyKey: 's7-prepare', actorRef: 'flowise-controller', caseDescription: '登录后核对资料', draft, acceptanceSummary })
  const intentPlan = { schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login', steps: [{ intentStepId: 'login', action: '登录', expected: '成功', riskLevel: 'LOW' }, { intentStepId: 'verify', action: '核对', expected: '一致', riskLevel: 'LOW' }], assertions: draft.assertions }
  await post(baseUrl, '/v1/i8/authoring:submit', { namespace, idempotencyKey: 's7-author', preparationId: prepared.body.preparationId, expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: 's7-author-confirm', reason: '批准' }, intentPlan })
  await post(baseUrl, '/v1/i8/candidates:compile', { namespace, idempotencyKey: 's7-compile', preparationId: prepared.body.preparationId, expectedPreparationVersion: 2 })
  const build = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: 's7-builder' }, workerToken)
  await post(baseUrl, `/internal/worker/i8/candidates/${build.body.jobId}:complete`, { workerId: 's7-builder', planHash: build.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(build.body.plan) }, workerToken)
  const stability = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 's7-certifier' }, workerToken)
  await post(baseUrl, `/internal/worker/i8/stability/${stability.body.batchId}:complete`, stabilityCompletion(root, stability.body, 's7-certifier'), workerToken)
  const current = await post(baseUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.body.preparationId })
  const activated = await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's7-activate', candidateId: current.body.candidate.candidateId, expectedCandidateVersion: current.body.candidate.version, choice: 'ACTIVATE', confirmationRef: 's7-activate-confirm', reason: '激活' })
  return { prepared: prepared.body, candidate: current.body.candidate, activated: activated.body }
}

async function startPortal(t) {
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', 'text/html; charset=utf-8')
    if (route === '/portal/login') return response.end('<label>用户名 / 手机号<input id="username"></label><input data-testid="login-password" type="password"><button data-testid="login-submit">登录</button><script>document.querySelector("button").onclick=()=>{if(document.querySelector("#username").value==="synthetic-user"&&document.querySelector("[data-testid=login-password]").value==="synthetic-password"){location.href="/portal/dashboard"}}</script>')
    if (route === '/portal/dashboard') return response.end('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><a href="/portal/profile">个人资料</a>')
    if (route === '/portal/profile') return response.end('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><span data-testid="profile-display-name">张三</span><span data-testid="profile-avatar">张</span><span data-testid="profile-customer-id">id</span><span data-testid="profile-email">x@example.invalid</span><span data-testid="profile-phone">0</span>')
    response.statusCode = 404; response.end('not found')
  })
  await new Promise(resolve => server.listen(28882, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return 'http://127.0.0.1:28882'
}

test('migration 015 and deterministic classifier freeze all eleven incident classes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage7-db-'))
  const database = await HarnessDatabase.open({ databasePath: path.join(root, 'platform.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, 'backups') })
  t.after(async () => { await database.close(); fs.rmSync(root, { recursive: true, force: true }) })
  assert.equal(database.connection.prepare('SELECT name FROM schema_migrations WHERE version=15').get().name, '015_i8_restricted_repair.sql')
  for (const table of ['i8_failure_incidents', 'i8_step_failure_envelopes', 'i8_script_patch_proposals', 'i8_repair_stability_certificates', 'i8_repair_decisions']) assert.equal(database.connection.prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1)
  const samples = { ENVIRONMENT: ['ENVIRONMENT', 'PORT_UNAVAILABLE'], AUTHENTICATION: ['TEST_FAILURE', 'AUTH_FAILED'], CONTRACT: ['TEST_FAILURE', 'SCHEMA_MISMATCH'], LOCATOR: ['TEST_FAILURE', 'LOCATOR_NOT_FOUND'], ASSERTION: ['TEST_FAILURE', 'ASSERTION_MISMATCH'], MODEL: ['TEST_FAILURE', 'MIDSCENE_TIMEOUT'], TOOL: ['EVIDENCE', 'TOOL_UNAVAILABLE'], FIXTURE_DATA: ['TEST_FAILURE', 'FIXTURE_MISSING'], PRODUCT_DEFECT: ['TEST_FAILURE', 'PRODUCT_DEFECT_BALANCE'], FLAKY_TIMING: ['TEST_FAILURE', 'FLAKY_TIMING'], SCRIPT_LOGIC: ['TEST_FAILURE', 'SCRIPT_LOGIC_INVALID'] }
  for (const [expected, args] of Object.entries(samples)) assert.equal(classifyI8Failure(...args), expected)
})

test('restricted patch schema rejects source code and unknown capabilities', () => {
  assert.throws(() => scriptPatchProposalSchema.parse({ schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'SOURCE_CODE', source: 'require("fs")' }], rationale: 'unsafe' }))
  assert.throws(() => scriptPatchProposalSchema.parse({ schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: { kind: 'TEST_ID', value: 'login-username' }, shell: 'whoami' }], rationale: 'unsafe' }))
})

test('formal failure creates CTX-L1 envelope; repair requires a new six-run certificate and explicit activation', async t => {
  const { application, root, baseUrl } = await fixture(t); const namespace = 'i8-stage7-loop'
  const liveBrowser = process.env.HENGZHUN_I8_STAGE7_LIVE === '1'
  const portalBaseUrl = liveBrowser ? await startPortal(t) : null
  const seeded = await seedActivated(baseUrl, root, namespace)
  const submitted = await post(baseUrl, '/v1/i8/runs:submit', { namespace, idempotencyKey: 's7-run-submit', preparationId: seeded.prepared.preparationId, credentialAlias: 'i3-customer' })
  assert.equal(submitted.response.status, 202, JSON.stringify(submitted.body))
  const task = await post(baseUrl, '/internal/worker/tasks:claim', { workerId: 's7-formal-worker' }, workerToken)
  assert.equal(task.body.status, 'CLAIMED', JSON.stringify(task.body))
  const failureEvidence = { artifactType: 'DIAGNOSTIC', mediaType: 'application/json', redactionStatus: 'REDACTED', extension: 'json', base64Content: Buffer.from('{"code":"LOCATOR_NOT_FOUND"}').toString('base64'), metadata: { containsCredentials: false } }
  const failed = await post(baseUrl, `/internal/worker/tasks/${task.body.taskId}:complete`, { workerId: 's7-formal-worker', outcome: 'FAILED', summary: '受控定位器失效', errorCode: 'LOGIN_USERNAME_LOCATOR_NOT_FOUND', errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: true, evidence: [failureEvidence] }, workerToken)
  assert.equal(failed.response.status, 200, JSON.stringify(failed.body)); assert.equal(failed.body.incidentId.length > 10, true); assert.equal(submitted.body.taskId, task.body.taskId)
  const incident = await post(baseUrl, '/v1/i8/failures:get', { namespace, incidentId: failed.body.incidentId })
  assert.equal(incident.body.classification, 'LOCATOR'); assert.equal(incident.body.failureEnvelope.contextLevel, 'CTX-L1'); assert.equal(incident.body.failureEnvelope.attemptCount, 0)
  assert.equal(JSON.stringify(incident.body).includes(root), false)
  const unsafe = await post(baseUrl, '/v1/i8/repairs:propose', { namespace, idempotencyKey: 's7-unsafe-proposal', incidentId: failed.body.incidentId, expectedEnvelopeHash: incident.body.failureEnvelope.envelopeHash, patch: { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: { kind: 'TEST_ID', value: 'arbitrary-selector' } }], rationale: '任意定位器' } })
  assert.equal(unsafe.response.status, 409)
  const proposed = await post(baseUrl, '/v1/i8/repairs:propose', { namespace, idempotencyKey: 's7-safe-proposal', incidentId: failed.body.incidentId, expectedEnvelopeHash: incident.body.failureEnvelope.envelopeHash, patch: { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: I8_CONTROLLED_CATALOG.repairTargets.LOGIN_USERNAME[1] }], rationale: '切换到审查过的标签定位映射' } })
  assert.equal(proposed.response.status, 202, JSON.stringify(proposed.body)); assert.notEqual(proposed.body.repairCandidateId, seeded.candidate.candidateId)
  const earlyDecision = await post(baseUrl, '/v1/i8/repairs:decide', { namespace, idempotencyKey: 's7-early', proposalId: proposed.body.proposalId, expectedProposalVersion: 1, choice: 'ACTIVATE', reason: '提前激活', confirmationRef: 's7-early-confirm' })
  assert.equal(earlyDecision.response.status, 409)
  const failedClaim = await post(baseUrl, '/internal/worker/i8/repairs/stability:claim', { workerId: 's7-repair-certifier-failed' }, workerToken)
  assert.equal(failedClaim.body.runs.length, 6)
  const failedCompletion = stabilityCompletion(root, failedClaim.body, 's7-repair-certifier-failed')
  failedCompletion.runs[0].outcome = 'FAILED'
  failedCompletion.runs[0].errorCode = 'LOCATOR_STILL_UNRESOLVED'
  const failedBatch = await post(baseUrl, `/internal/worker/i8/repairs/stability/${failedClaim.body.batchId}:complete`, failedCompletion, workerToken)
  assert.equal(failedBatch.body.status, 'FAILED')
  assert.equal(failedBatch.body.contextLevel, 'CTX-L2')
  const escalated = await post(baseUrl, '/v1/i8/failures:get', { namespace, incidentId: failed.body.incidentId })
  assert.equal(escalated.body.failureEnvelope.contextLevel, 'CTX-L2')
  assert.equal(escalated.body.failureEnvelope.attemptCount, 1)
  assert.equal(escalated.body.failureEnvelope.payload.adjacentFailureSummary.failedRunCount, 1)
  assert.equal(JSON.stringify(escalated.body).includes(root), false)

  const proposedSecond = await post(baseUrl, '/v1/i8/repairs:propose', { namespace, idempotencyKey: 's7-safe-proposal-second', incidentId: failed.body.incidentId, expectedEnvelopeHash: escalated.body.failureEnvelope.envelopeHash, patch: { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: I8_CONTROLLED_CATALOG.repairTargets.LOGIN_USERNAME[1] }], rationale: '根据最小相邻失败摘要重新生成受控候选' } })
  assert.equal(proposedSecond.response.status, 202, JSON.stringify(proposedSecond.body))
  assert.equal(proposedSecond.body.attemptNo, 2)
  const failedClaimSecond = await post(baseUrl, '/internal/worker/i8/repairs/stability:claim', { workerId: 's7-repair-certifier-failed-second' }, workerToken)
  const failedCompletionSecond = stabilityCompletion(root, failedClaimSecond.body, 's7-repair-certifier-failed-second')
  failedCompletionSecond.runs[1].outcome = 'FAILED'
  failedCompletionSecond.runs[1].errorCode = 'ASSERTION_CONTEXT_REQUIRED'
  const failedBatchSecond = await post(baseUrl, `/internal/worker/i8/repairs/stability/${failedClaimSecond.body.batchId}:complete`, failedCompletionSecond, workerToken)
  assert.equal(failedBatchSecond.body.contextLevel, 'CTX-L3')
  const fullyEscalated = await post(baseUrl, '/v1/i8/failures:get', { namespace, incidentId: failed.body.incidentId })
  assert.equal(fullyEscalated.body.failureEnvelope.contextLevel, 'CTX-L3')
  assert.equal(fullyEscalated.body.failureEnvelope.attemptCount, 2)
  const proposedThird = await post(baseUrl, '/v1/i8/repairs:propose', { namespace, idempotencyKey: 's7-safe-proposal-third', incidentId: failed.body.incidentId, expectedEnvelopeHash: fullyEscalated.body.failureEnvelope.envelopeHash, patch: { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: I8_CONTROLLED_CATALOG.repairTargets.LOGIN_USERNAME[1] }], rationale: '在三层最小上下文内生成最后一个受控候选' } })
  assert.equal(proposedThird.response.status, 202, JSON.stringify(proposedThird.body))
  assert.equal(proposedThird.body.attemptNo, 3)
  const exhausted = await post(baseUrl, '/v1/i8/repairs:propose', { namespace, idempotencyKey: 's7-exhausted-proposal', incidentId: failed.body.incidentId, expectedEnvelopeHash: fullyEscalated.body.failureEnvelope.envelopeHash, patch: { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: I8_CONTROLLED_CATALOG.repairTargets.LOGIN_USERNAME[1] }], rationale: '禁止第四次候选' } })
  assert.equal(exhausted.response.status, 409)
  assert.equal(exhausted.body.errorCode, 'I8_REPAIR_ATTEMPT_LIMIT_EXHAUSTED')
  assert.equal(application.database.connection.prepare('SELECT status FROM i8_failure_incidents WHERE incident_id=?').get(failed.body.incidentId).status, 'UNRESOLVED')
  const claim = await post(baseUrl, '/internal/worker/i8/repairs/stability:claim', { workerId: 's7-repair-certifier' }, workerToken)
  assert.equal(claim.body.runs.length, 6)
  const completion = liveBrowser
    ? await executeStabilityBatch(claim.body, { productRoot: root, runtimeProductRoot: productRoot, workerId: 's7-repair-certifier', baseUrl: portalBaseUrl, allowedOrigins: [portalBaseUrl], environment: { HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME: 'synthetic-user', HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD: 'synthetic-password' } })
    : stabilityCompletion(root, claim.body, 's7-repair-certifier')
  assert.equal(completion.runs.every(run => run.outcome === 'PASSED'), true, JSON.stringify(completion.runs.map(run => ({ id: run.validationRunId, outcome: run.outcome, errorCode: run.errorCode }))))
  const completed = await post(baseUrl, `/internal/worker/i8/repairs/stability/${claim.body.batchId}:complete`, completion, workerToken)
  assert.equal(completed.body.status, 'PASSED'); assert.equal(completed.body.passedRuns, 6)
  const waiting = await post(baseUrl, '/v1/i8/failures:get', { namespace, incidentId: failed.body.incidentId })
  const decided = await post(baseUrl, '/v1/i8/repairs:decide', { namespace, idempotencyKey: 's7-decision', proposalId: proposedThird.body.proposalId, expectedProposalVersion: waiting.body.proposal.version, choice: 'ACTIVATE', reason: '用户确认激活已验证修复', confirmationRef: 's7-decision-confirm' })
  assert.equal(decided.response.status, 200, JSON.stringify(decided.body)); assert.equal(decided.body.status, 'RECORDED'); assert.equal(decided.body.rerunRequired, true); assert.equal(decided.body.scheduleMigrationRequired, false)
  assert.equal(application.database.connection.prepare('SELECT current_version FROM scripts WHERE script_id=?').get(seeded.candidate.scriptId).current_version, 4)
  assert.equal(application.database.connection.prepare('SELECT count(*) count FROM i8_repair_stability_certificates').get().count, 1)
  const rerun = await post(baseUrl, '/v1/i8/runs:submit', { namespace, idempotencyKey: 's7-repaired-rerun', preparationId: seeded.prepared.preparationId, credentialAlias: 'i3-customer' })
  assert.equal(rerun.response.status, 202, JSON.stringify(rerun.body))
  assert.equal(rerun.body.scriptVersion, 4)
  assert.equal(rerun.body.candidateId, proposedThird.body.repairCandidateId)
  const schedule = await post(baseUrl, '/v1/i8/schedules:create', { namespace, idempotencyKey: 's7-repaired-schedule', preparationId: seeded.prepared.preparationId, scheduleType: 'ONE_TIME', runAt: '2030-01-01T09:00:00+08:00', timezone: 'Asia/Shanghai', misfirePolicy: 'SKIP', misfireGraceSeconds: 0, maxRetries: 0, confirmationRef: 's7-repaired-schedule-confirm', credentialAlias: 'i3-customer' })
  assert.equal(schedule.response.status, 201, JSON.stringify(schedule.body))
  assert.equal(application.database.connection.prepare('SELECT script_version FROM schedules WHERE schedule_id=?').get(schedule.body.scheduleId).script_version, 4)
})
