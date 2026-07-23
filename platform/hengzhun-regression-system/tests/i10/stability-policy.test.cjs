'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')
const { buildMidscenePrompt } = require('../../dist/harness/src/context-envelope.js')
const { nextCronOccurrence } = require('../../dist/harness/src/cron.js')
const { I8_CONTROLLED_CATALOG } = require('../../dist/harness/src/i8/script-package-builder.js')
const { assertClaim, executeStabilityBatch } = require('../../worker/src/i8-stability-runner.cjs')
const Database = require('better-sqlite3')

const productRoot = path.resolve(__dirname, '../..')
const serviceToken = 'synthetic-i10-stability-service-00001'
const workerToken = 'synthetic-i10-stability-worker-000002'
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value) }

async function startAtRoot(root) {
  return startHarness({ productRoot: root, databasePath: path.join(root, '.data/sqlite/regression_platform.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, '.data/sqlite/backups'), artifactRoot: path.join(root, '.data/artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] }, workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0 })
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-stability-'))
  const running = await startAtRoot(root)
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, running, baseUrl }
}
async function post(baseUrl, route, body, token = serviceToken) { const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { response, body: await response.json() } }

async function startPortal(t) {
  const server = require('node:http').createServer((request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', 'text/html; charset=utf-8')
    if (route === '/portal/login') return response.end('<label>用户名 / 手机号<input id="username" data-testid="login-username"></label><input data-testid="login-password" type="password"><button data-testid="login-submit">登录</button><script>document.querySelector("button").onclick=()=>{if(document.querySelector("#username").value==="synthetic-user"&&document.querySelector("[data-testid=login-password]").value==="synthetic-password"){location.href="/portal/dashboard"}}</script>')
    if (route === '/portal/dashboard') return response.end('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><a href="/portal/profile">个人资料</a>')
    if (route === '/portal/profile') return response.end('<span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><span data-testid="profile-display-name">张三</span><span data-testid="profile-avatar">张</span><span data-testid="profile-customer-id">id</span><span data-testid="profile-email">x@example.invalid</span><span data-testid="profile-phone">0</span>')
    response.statusCode = 404; response.end('not found')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

function stabilityCompletion(root, claim, workerId, failedRunIndex = -1) {
  const assertionSetHash = sha256('i10-2x2-assertions')
  const evidenceSetHash = sha256('i10-2x2-evidence-shape')
  return {
    workerId,
    candidateId: claim.candidateId,
    scriptHash: claim.scriptHash,
    runtimeFingerprint: sha256('i10-2x2-runtime'),
    runs: claim.runs.map((run, index) => {
      const directory = path.join(root, '.data/stability', claim.namespace, claim.candidateId, run.validationRunId)
      fs.mkdirSync(directory, { recursive: true })
      const artifacts = [
        ['REPORT', 'application/json', 'report.json'],
        ['SCREENSHOT', 'image/png', 'screenshot.png'],
        ['LOG', 'text/plain; charset=utf-8', 'steps.log']
      ].map(([artifactType, mediaType, filename]) => {
        const target = path.join(directory, filename)
        fs.writeFileSync(target, `${run.validationRunId}:${artifactType}:${index === failedRunIndex ? 'FAILED' : 'PASSED'}`)
        const bytes = fs.readFileSync(target)
        return { artifactType, mediaType, redactionStatus: 'REDACTED', relativePath: path.relative(root, target).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.byteLength }
      })
      return {
        ...run,
        outcome: index === failedRunIndex ? 'FAILED' : 'PASSED',
        ...(index === failedRunIndex ? { errorCode: 'I10_CONTROLLED_SAMPLE_FAILURE' } : {}),
        durationMs: 1,
        assertionSetHash,
        evidenceSetHash,
        evidence: artifacts
      }
    })
  }
}

async function seed(baseUrl, namespace, policy, options = {}) {
  const knowledge = fs.readFileSync(path.join(productRoot, 'flowise/i8/knowledge/portal-login-consistency.md'))
  const draft = { schemaVersion: 'i8-regression-case-draft-v1', title: '门户登录资料一致性', objective: '验证当前身份', summary: '登录后核对资料', riskLevel: 'LOW', route: '/portal/login', preconditions: ['合成身份'], steps: [{ action: '登录门户', expected: '进入门户' }], assertions: ['姓名一致'], knowledgeSnapshot: { knowledgeSnapshotId: 'i10-test-knowledge', sourceVersion: '1', contentHash: sha256(knowledge), citationIds: ['i10-test-citation'] } }
  const acceptanceSummary = { schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective, stepCount: 1, assertionCount: 1, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: [] }
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', { namespace, idempotencyKey: `${policy}-prepare`, actorRef: 'test', caseDescription: draft.summary, draft, acceptanceSummary }); assert.equal(prepared.response.status, 200)
  const intentPlan = { schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login', steps: [{ intentStepId: 'login', action: '登录门户', expected: '进入门户', riskLevel: 'LOW' }], assertions: draft.assertions }
  const submitted = await post(baseUrl, '/v1/i8/authoring:submit', { namespace, idempotencyKey: `${policy}-submit`, preparationId: prepared.body.preparationId, expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: `${policy}-confirm`, reason: '批准' }, intentPlan }); assert.equal(submitted.response.status, 202)
  await post(baseUrl, '/v1/i8/candidates:compile', { namespace, idempotencyKey: `${policy}-compile`, preparationId: prepared.body.preparationId, expectedPreparationVersion: 2, stabilityPolicyVersion: policy })
  const claim = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: `${policy}-builder` }, workerToken)
  const contexts = new Map((claim.body.authoringContexts || []).map(item => [item.actionId, item]))
  const records = claim.body.plan.actions.map(action => {
    const context = contexts.get(action.actionId)
    return { schemaVersion: 'i8-verified-action-record-v1', executablePlanId: claim.body.plan.executablePlanId, actionId: action.actionId, ordinal: action.ordinal, outcome: 'VERIFIED_PASSED', ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}), pageSignatureHash: sha256(stable(action.pageSignature)), factsHash: sha256(stable({ actionId: action.actionId })), verification: { dom: true, url: true, request: true, business: true }, ...(context && !options.omitVisualEvidence ? { contextLevel: context.contextLevel, contextEnvelopeHash: context.envelopeHash, visualEvidence: { invocation: 'REAL', provider: 'MIDSCENE', model: 'mimo-v2.5-test', promptHash: options.tamperPromptHash ? 'f'.repeat(64) : sha256(buildMidscenePrompt(context.envelope)), locatorMatched: true } } : {}), verifiedAt: '2026-07-22T00:00:00.000Z' }
  })
  const completion = await post(baseUrl, `/internal/worker/i8/candidates/${encodeURIComponent(claim.body.jobId)}:complete`, { workerId: `${policy}-builder`, planHash: claim.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: records }, workerToken)
  if (!options.omitVisualEvidence && !options.tamperPromptHash) assert.equal(completion.response.status, 200, JSON.stringify(completion.body))
  return { prepared: prepared.body, claim: claim.body, completion }
}

test('I10 candidate completion rejects fabricated Playwright-only records without bound Midscene evidence', async t => {
  const { baseUrl, running } = await fixture(t)
  const seeded = await seed(baseUrl, 'i10-missing-visual', 'I10_2X2_V1', { omitVisualEvidence: true })
  assert.equal(seeded.completion.response.status, 409)
  assert.equal(seeded.completion.body.errorCode, 'I10_REAL_VISUAL_EVIDENCE_REQUIRED')
  assert.equal(running.application.database.connection.prepare(`SELECT COUNT(*) count FROM i10_action_traces WHERE namespace='i10-missing-visual'`).get().count, 0)
  assert.equal(running.application.database.connection.prepare(`SELECT COUNT(*) count FROM i8_script_candidates WHERE namespace='i10-missing-visual'`).get().count, 0)
})

test('I10 candidate completion rejects a Midscene prompt hash that is not derived from the issued context', async t => {
  const { baseUrl, running } = await fixture(t)
  const seeded = await seed(baseUrl, 'i10-tampered-prompt', 'I10_2X2_V1', { tamperPromptHash: true })
  assert.equal(seeded.completion.response.status, 409)
  assert.equal(seeded.completion.body.errorCode, 'I10_REAL_VISUAL_EVIDENCE_REQUIRED')
  assert.equal(running.application.database.connection.prepare(`SELECT COUNT(*) count FROM i10_action_traces WHERE namespace='i10-tampered-prompt'`).get().count, 0)
})

test('I10 contexts bind real Midscene evidence and require 2x2 while I9 history remains 2x3', async t => {
  const { baseUrl, running } = await fixture(t)
  const i10Seed = await seed(baseUrl, 'i10-policy', 'I10_2X2_V1')
  assert.equal(i10Seed.claim.authoringContexts.length > 0, true)
  assert.equal(i10Seed.claim.authoringContexts.every(item => item.contextLevel === 'CTX-L2' && item.envelope.modelContextLimitTokens === 16000 && item.envelope.inputBudgetTokens === 12000 && item.envelope.reservedOutputTokens === 4000), true)
  const trace = running.application.database.connection.prepare(`SELECT preparation_id,consumer_model,context_policy,trace_json,status FROM i10_action_traces WHERE namespace='i10-policy'`).get()
  assert.equal(trace.preparation_id, i10Seed.prepared.preparationId)
  assert.equal(trace.consumer_model, 'mimo-v2.5-test')
  assert.equal(trace.context_policy, 'CTX-L2')
  assert.equal(trace.status, 'PLAYWRIGHT_VERIFIED')
  assert.equal(JSON.parse(trace.trace_json).authoringContexts.length, i10Seed.claim.authoringContexts.length)
  const candidateStatus = await post(baseUrl, '/v1/i8/candidates:get', { namespace: 'i10-policy', preparationId: i10Seed.prepared.preparationId })
  assert.equal(candidateStatus.response.status, 200)
  assert.deepEqual(candidateStatus.body.authoringEvidence, {
    invocation: 'REAL',
    provider: 'MIDSCENE',
    model: 'mimo-v2.5-test',
    contextPolicy: 'CTX-L2',
    actionTraceHash: running.application.database.connection.prepare(`SELECT trace_hash FROM i10_action_traces WHERE namespace='i10-policy'`).get().trace_hash,
    playwrightFactHash: running.application.database.connection.prepare(`SELECT playwright_fact_hash FROM i10_action_traces WHERE namespace='i10-policy'`).get().playwright_fact_hash,
    status: 'PLAYWRIGHT_VERIFIED'
  })
  assert.equal(Object.hasOwn(candidateStatus.body.authoringEvidence, 'trace'), false)
  const i10 = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'i10-policy-worker' }, workerToken)
  assert.equal(i10.body.requiredRuns, 4)
  assert.equal(i10.body.stabilityPolicyVersion, 'I10_2X2_V1')
  assert.equal(i10.body.runs.length, 4)
  assert.deepEqual([...new Set(i10.body.runs.map(run => run.viewportId))].sort(), ['DESKTOP_1440X900', 'NARROW_390X844'])

  await seed(baseUrl, 'i9-history-policy', 'I8_2X3_V1')
  const legacy = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'i9-history-worker' }, workerToken)
  assert.equal(legacy.body.requiredRuns, 6)
  assert.equal(legacy.body.stabilityPolicyVersion, 'I8_2X3_V1')
  assert.equal(legacy.body.runs.length, 6)
})

test('I10 2x2 certificate delivers the exact executed source once and a failed sample blocks delivery', async t => {
  const { root, baseUrl, running } = await fixture(t)
  const successful = await seed(baseUrl, 'i10-delivery', 'I10_2X2_V1')
  const claim = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'i10-delivery-worker' }, workerToken)
  assert.equal(claim.body.requiredRuns, 4)
  assert.equal(claim.body.stabilityPolicyVersion, 'I10_2X2_V1')
  assert.equal(new Set(claim.body.runs.map(run => run.validationRunId)).size, 4)
  assert.deepEqual(claim.body.runs.map(run => `${run.viewportId}:${run.sequenceNo}`).sort(), [
    'DESKTOP_1440X900:1', 'DESKTOP_1440X900:2', 'NARROW_390X844:1', 'NARROW_390X844:2'
  ])
  assert.doesNotThrow(() => assertClaim(claim.body))
  assert.throws(() => assertClaim({ ...claim.body, requiredRuns: 6 }), error => error.code === 'STABILITY_POLICY_INVALID')
  const portalBaseUrl = await startPortal(t)
  const realPlaywrightCompletion = await executeStabilityBatch(claim.body, {
    productRoot: root,
    runtimeProductRoot: productRoot,
    workerId: 'i10-delivery-worker',
    baseUrl: portalBaseUrl,
    allowedOrigins: [portalBaseUrl],
    environment: {
      HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME: 'synthetic-user',
      HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD: 'synthetic-password'
    }
  })
  assert.equal(realPlaywrightCompletion.runs.length, 4)
  assert.equal(realPlaywrightCompletion.runs.every(run => run.outcome === 'PASSED'), true, JSON.stringify(realPlaywrightCompletion.runs.map(run => ({ id: run.validationRunId, outcome: run.outcome, errorCode: run.errorCode }))))
  const completed = await post(baseUrl, `/internal/worker/i8/stability/${claim.body.batchId}:complete`, realPlaywrightCompletion, workerToken)
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body))
  assert.equal(completed.body.status, 'STABILITY_CERTIFIED')
  assert.equal(completed.body.passedRuns, 4)
  assert.equal(completed.body.requiredRuns, 4)

  const preview = await post(baseUrl, '/v1/i8/candidates:preview', { namespace: 'i10-delivery', candidateId: successful.completion.body.candidateId, limit: 5, includeDownload: true })
  assert.equal(preview.response.status, 200, JSON.stringify(preview.body))
  assert.equal(preview.body.scriptHash, claim.body.scriptHash)
  assert.equal(preview.body.download.sha256, claim.body.scriptHash)
  const downloaded = await fetch(baseUrl + preview.body.download.href)
  const source = Buffer.from(await downloaded.arrayBuffer())
  assert.equal(downloaded.status, 200)
  assert.equal(downloaded.headers.get('x-content-sha256'), claim.body.scriptHash)
  assert.equal(sha256(source), claim.body.scriptHash)
  const replay = await fetch(baseUrl + preview.body.download.href)
  assert.equal(replay.status, 404)
  const certificate = running.application.database.connection.prepare(`
    SELECT c.script_sha256, p.policy_version, p.required_runs
    FROM i8_stability_certificates c
    JOIN i10_stability_policy_bindings p ON p.object_type='CANDIDATE_CERTIFICATE' AND p.object_id=c.certificate_id
    WHERE c.candidate_id=?
  `).get(successful.completion.body.candidateId)
  assert.deepEqual(certificate, { script_sha256: claim.body.scriptHash, policy_version: 'I10_2X2_V1', required_runs: 4 })

  const current = await post(baseUrl, '/v1/i8/candidates:get', { namespace: 'i10-delivery', preparationId: successful.prepared.preparationId })
  const activated = await post(baseUrl, '/v1/i8/candidates:decide', {
    namespace: 'i10-delivery', idempotencyKey: 'i10-delivery-activate', candidateId: successful.completion.body.candidateId,
    expectedCandidateVersion: current.body.candidate.version, choice: 'ACTIVATE', confirmationRef: 'i10-delivery-confirm', reason: '测试激活'
  })
  assert.equal(activated.response.status, 200, JSON.stringify(activated.body))
  const submitted = await post(baseUrl, '/v1/i8/runs:submit', { namespace: 'i10-delivery', idempotencyKey: 'i10-delivery-failing-run', preparationId: successful.prepared.preparationId, credentialAlias: 'i3-customer' })
  assert.equal(submitted.response.status, 202, JSON.stringify(submitted.body))
  const task = await post(baseUrl, '/internal/worker/tasks:claim', { workerId: 'i10-formal-worker' }, workerToken)
  const failureEvidence = { artifactType: 'DIAGNOSTIC', mediaType: 'application/json', redactionStatus: 'REDACTED', extension: 'json', base64Content: Buffer.from('{"code":"LOCATOR_NOT_FOUND"}').toString('base64'), metadata: { containsCredentials: false } }
  const failedRun = await post(baseUrl, `/internal/worker/tasks/${task.body.taskId}:complete`, { workerId: 'i10-formal-worker', outcome: 'FAILED', summary: '受控定位器失效', errorCode: 'LOGIN_USERNAME_LOCATOR_NOT_FOUND', errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: true, evidence: [failureEvidence] }, workerToken)
  assert.equal(failedRun.response.status, 200, JSON.stringify(failedRun.body))
  const incident = await post(baseUrl, '/v1/i8/failures:get', { namespace: 'i10-delivery', incidentId: failedRun.body.incidentId })
  const patch = { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: I8_CONTROLLED_CATALOG.repairTargets.LOGIN_USERNAME[1] }], rationale: '切换至受控备用定位器' }
  const proposal = await post(baseUrl, '/v1/i8/repairs:propose', { namespace: 'i10-delivery', idempotencyKey: 'i10-repair-one', incidentId: failedRun.body.incidentId, expectedEnvelopeHash: incident.body.failureEnvelope.envelopeHash, patch })
  assert.equal(proposal.response.status, 202, JSON.stringify(proposal.body))
  assert.equal(proposal.body.requiredStabilityRuns, 4)
  assert.equal(proposal.body.stabilityPolicyVersion, 'I10_2X2_V1')
  const repairClaim = await post(baseUrl, '/internal/worker/i8/repairs/stability:claim', { workerId: 'i10-repair-worker-one' }, workerToken)
  assert.equal(repairClaim.body.requiredRuns, 4)
  assert.equal(repairClaim.body.stabilityPolicyVersion, 'I10_2X2_V1')
  assert.equal(repairClaim.body.runs.length, 4)
  const invalidIdentity = stabilityCompletion(root, repairClaim.body, 'i10-repair-worker-one')
  invalidIdentity.runs[0].fixtureRef += '-tampered'
  const identityRejected = await post(baseUrl, `/internal/worker/i8/repairs/stability/${repairClaim.body.batchId}:complete`, invalidIdentity, workerToken)
  assert.equal(identityRejected.response.status, 409)
  assert.equal(identityRejected.body.errorCode, 'I8_REPAIR_STABILITY_RUN_IDENTITY_MISMATCH')
  const failedRepairCompletion = await post(baseUrl, `/internal/worker/i8/repairs/stability/${repairClaim.body.batchId}:complete`, stabilityCompletion(root, repairClaim.body, 'i10-repair-worker-one', 0), workerToken)
  assert.equal(failedRepairCompletion.body.status, 'FAILED')
  assert.equal(running.application.database.connection.prepare('SELECT COUNT(*) count FROM i8_repair_stability_certificates WHERE proposal_id=?').get(proposal.body.proposalId).count, 0)
  const earlyActivation = await post(baseUrl, '/v1/i8/repairs:decide', { namespace: 'i10-delivery', idempotencyKey: 'i10-repair-early', proposalId: proposal.body.proposalId, expectedProposalVersion: 3, choice: 'ACTIVATE', reason: '不得激活', confirmationRef: 'i10-repair-early-confirm' })
  assert.equal(earlyActivation.response.status, 409)

  const escalated = await post(baseUrl, '/v1/i8/failures:get', { namespace: 'i10-delivery', incidentId: failedRun.body.incidentId })
  const proposalTwo = await post(baseUrl, '/v1/i8/repairs:propose', { namespace: 'i10-delivery', idempotencyKey: 'i10-repair-two', incidentId: failedRun.body.incidentId, expectedEnvelopeHash: escalated.body.failureEnvelope.envelopeHash, patch })
  assert.equal(proposalTwo.response.status, 202, JSON.stringify(proposalTwo.body))
  const repairClaimTwo = await post(baseUrl, '/internal/worker/i8/repairs/stability:claim', { workerId: 'i10-repair-worker-two' }, workerToken)
  assert.equal(repairClaimTwo.body.requiredRuns, 4)
  assert.equal(repairClaimTwo.body.stabilityPolicyVersion, 'I10_2X2_V1')
  const repaired = await post(baseUrl, `/internal/worker/i8/repairs/stability/${repairClaimTwo.body.batchId}:complete`, stabilityCompletion(root, repairClaimTwo.body, 'i10-repair-worker-two'), workerToken)
  assert.equal(repaired.body.status, 'PASSED', JSON.stringify(repaired.body))
  assert.equal(repaired.body.passedRuns, 4)
  const waiting = await post(baseUrl, '/v1/i8/failures:get', { namespace: 'i10-delivery', incidentId: failedRun.body.incidentId })
  const repairDecision = await post(baseUrl, '/v1/i8/repairs:decide', { namespace: 'i10-delivery', idempotencyKey: 'i10-repair-activate', proposalId: proposalTwo.body.proposalId, expectedProposalVersion: waiting.body.proposal.version, choice: 'ACTIVATE', reason: '四次验证通过', confirmationRef: 'i10-repair-activate-confirm' })
  assert.equal(repairDecision.response.status, 200, JSON.stringify(repairDecision.body))
  const repairCertificate = running.application.database.connection.prepare(`
    SELECT p.policy_version, p.required_runs
    FROM i8_repair_stability_certificates c
    JOIN i10_stability_policy_bindings p ON p.object_type='REPAIR_CERTIFICATE' AND p.object_id=c.certificate_id
    WHERE c.proposal_id=?
  `).get(proposalTwo.body.proposalId)
  assert.deepEqual(repairCertificate, { policy_version: 'I10_2X2_V1', required_runs: 4 })

  const failed = await seed(baseUrl, 'i10-failed-delivery', 'I10_2X2_V1')
  const failedClaim = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'i10-failed-worker' }, workerToken)
  const failedCompletion = await post(baseUrl, `/internal/worker/i8/stability/${failedClaim.body.batchId}:complete`, stabilityCompletion(root, failedClaim.body, 'i10-failed-worker', 0), workerToken)
  assert.equal(failedCompletion.body.status, 'VALIDATION_FAILED')
  assert.equal(failedCompletion.body.failedRuns, 1)
  assert.equal(running.application.database.connection.prepare('SELECT COUNT(*) count FROM i8_stability_certificates WHERE candidate_id=?').get(failed.completion.body.candidateId).count, 0)
  const blockedPreview = await post(baseUrl, '/v1/i8/candidates:preview', { namespace: 'i10-failed-delivery', candidateId: failed.completion.body.candidateId, limit: 5, includeDownload: true })
  assert.equal(blockedPreview.response.status, 409)
  assert.equal(blockedPreview.body.errorCode, 'I8_STABILITY_CERTIFICATE_REQUIRED')
})

test('I10 schedules persist across restart, apply misfire policy, replay idempotently and can be disabled', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-schedule-restart-'))
  let running = await startAtRoot(root)
  let baseUrl = `http://127.0.0.1:${running.server.address().port}`
  const closeRunning = async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close() }
  t.after(async () => { if (running) await closeRunning().catch(() => undefined); fs.rmSync(root, { recursive: true, force: true }) })

  const seeded = await seed(baseUrl, 'i10-schedule', 'I10_2X2_V1')
  const claim = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'i10-schedule-certifier' }, workerToken)
  await post(baseUrl, `/internal/worker/i8/stability/${claim.body.batchId}:complete`, stabilityCompletion(root, claim.body, 'i10-schedule-certifier'), workerToken)
  const current = await post(baseUrl, '/v1/i8/candidates:get', { namespace: 'i10-schedule', preparationId: seeded.prepared.preparationId })
  const activated = await post(baseUrl, '/v1/i8/candidates:decide', { namespace: 'i10-schedule', idempotencyKey: 'i10-schedule-activate', candidateId: seeded.completion.body.candidateId, expectedCandidateVersion: current.body.candidate.version, choice: 'ACTIVATE', confirmationRef: 'i10-schedule-activate-confirm', reason: '激活调度测试脚本' })
  assert.equal(activated.response.status, 200, JSON.stringify(activated.body))
  const future = new Date(Date.now() + 3_600_000).toISOString()
  const scheduleBody = (key, confirmationRef, misfirePolicy) => ({ namespace: 'i10-schedule', idempotencyKey: key, preparationId: seeded.prepared.preparationId, scheduleType: 'ONE_TIME', runAt: future, timezone: 'Asia/Shanghai', misfirePolicy, misfireGraceSeconds: 0, maxRetries: 1, confirmationRef, credentialAlias: 'i3-customer' })
  const runOnce = await post(baseUrl, '/v1/i8/schedules:create', scheduleBody('i10-run-once', 'i10-run-once-confirm', 'RUN_ONCE'))
  const skip = await post(baseUrl, '/v1/i8/schedules:create', scheduleBody('i10-skip', 'i10-skip-confirm', 'SKIP'))
  assert.equal(runOnce.response.status, 201); assert.equal(skip.response.status, 201)
  const recurringBody = { namespace: 'i10-schedule', idempotencyKey: 'i10-recurring', preparationId: seeded.prepared.preparationId, scheduleType: 'RECURRING', cronExpression: '0 9 * * 1-5', timezone: 'Asia/Shanghai', misfirePolicy: 'RUN_ONCE', misfireGraceSeconds: 300, maxRetries: 1, confirmationRef: 'i10-recurring-confirm', credentialAlias: 'i3-customer' }
  const recurring = await post(baseUrl, '/v1/i8/schedules:create', recurringBody)
  const recurringReplay = await post(baseUrl, '/v1/i8/schedules:create', recurringBody)
  assert.equal(recurring.response.status, 201); assert.equal(recurringReplay.body.scheduleId, recurring.body.scheduleId)
  const recurringStatus = await post(baseUrl, '/v1/i8/schedules:get', { namespace: 'i10-schedule', scheduleId: recurring.body.scheduleId })
  const disabled = await post(baseUrl, '/v1/plugin/schedules:disable', { namespace: 'i10-schedule', idempotencyKey: 'i10-recurring-disable', scheduleId: recurring.body.scheduleId, expectedVersion: recurringStatus.body.version, reason: '用户明确停止周期回归' })
  assert.equal(disabled.response.status, 200); assert.equal(disabled.body.status, 'DISABLED')

  await closeRunning()
  running = null
  const sqlite = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'))
  const due = new Date(Date.now() - 600_000).toISOString()
  sqlite.prepare('UPDATE schedules SET next_fire_at=? WHERE schedule_id IN (?,?)').run(due, runOnce.body.scheduleId, skip.body.scheduleId)
  sqlite.close()
  running = await startAtRoot(root)
  baseUrl = `http://127.0.0.1:${running.server.address().port}`
  const runOnceAfterRestart = await post(baseUrl, '/v1/i8/schedules:get', { namespace: 'i10-schedule', scheduleId: runOnce.body.scheduleId })
  const skipAfterRestart = await post(baseUrl, '/v1/i8/schedules:get', { namespace: 'i10-schedule', scheduleId: skip.body.scheduleId })
  assert.equal(runOnceAfterRestart.body.oneTimeState, 'RUNNING')
  assert.equal(skipAfterRestart.body.status, 'DISABLED')
  assert.equal(skipAfterRestart.body.oneTimeState, 'SKIPPED')
  const task = await post(baseUrl, '/internal/worker/tasks:claim', { workerId: 'i10-restart-worker' }, workerToken)
  assert.equal(task.body.status, 'CLAIMED')
  assert.equal(task.body.execution.scriptHash, claim.body.scriptHash)
  const countsBefore = running.application.database.connection.prepare('SELECT COUNT(*) count FROM schedule_executions').get().count
  await running.application.service.tickSchedules(new Date())
  const countsAfter = running.application.database.connection.prepare('SELECT COUNT(*) count FROM schedule_executions').get().count
  assert.equal(countsAfter, countsBefore)
})

test('I10 recurring schedule has deterministic daylight-saving behavior', () => {
  const spring = nextCronOccurrence('30 2 * * *', 'America/New_York', new Date('2026-03-08T05:00:00.000Z'))
  assert.equal(spring.toISOString(), '2026-03-09T06:30:00.000Z')
  const firstFallOccurrence = nextCronOccurrence('30 1 * * *', 'America/New_York', new Date('2026-11-01T04:00:00.000Z'))
  assert.equal(firstFallOccurrence.toISOString(), '2026-11-01T05:30:00.000Z')
  const afterRepeatedMinute = nextCronOccurrence('30 1 * * *', 'America/New_York', firstFallOccurrence)
  assert.equal(afterRepeatedMinute.toISOString(), '2026-11-02T06:30:00.000Z')
})
