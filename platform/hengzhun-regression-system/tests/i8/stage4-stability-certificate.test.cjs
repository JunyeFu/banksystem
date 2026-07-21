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
const { executeStabilityBatch } = require('../../worker/src/i8-stability-runner.cjs')

const productRoot = path.resolve(__dirname, '../..')
const serviceToken = ['synthetic-i8-stage4', 'service-token-000001'].join('-')
const workerToken = ['synthetic-i8-stage4', 'worker-token-0000002'].join('-')

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

async function fixture(t, namespace) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage4-'))
  const running = await startHarness({
    productRoot: root,
    databasePath: path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, '.data', 'sqlite', 'backups'),
    artifactRoot: path.join(root, '.data', 'artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken,
    schedulerIntervalMs: 0,
    host: '127.0.0.1',
    port: 0
  })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => {
    await new Promise(resolve => running.server.close(resolve))
    await running.application.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { ...running, namespace, root, baseUrl }
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { response, body: await response.json() }
}

function stage2Objects() {
  const knowledgeHash = sha256(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'knowledge', 'portal-login-consistency.md')))
  const draft = {
    schemaVersion: 'i8-regression-case-draft-v1', title: '门户登录资料一致性', objective: '验证当前客户身份。',
    summary: '登录后核对页眉与个人资料。', riskLevel: 'LOW', route: '/portal/login',
    preconditions: ['使用受控合成客户身份'],
    steps: [{ action: '登录门户', expected: '进入门户' }, { action: '打开个人资料', expected: '资料一致' }],
    assertions: ['页眉姓名与个人资料姓名相等', '页眉头像与个人资料头像相等'],
    knowledgeSnapshot: { knowledgeSnapshotId: 'flowise-portal-login-v1', sourceVersion: '1.0.0', contentHash: knowledgeHash, citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency'] }
  }
  return {
    draft,
    acceptanceSummary: { schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective, stepCount: 2, assertionCount: 2, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: [] }
  }
}

function recordsFor(plan) {
  return plan.actions.map(action => ({
    schemaVersion: 'i8-verified-action-record-v1', executablePlanId: plan.executablePlanId,
    actionId: action.actionId, ordinal: action.ordinal, outcome: 'VERIFIED_PASSED',
    ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}),
    pageSignatureHash: sha256(stableJson(action.pageSignature)), factsHash: sha256(stableJson({ actionId: action.actionId, outcome: 'VERIFIED_PASSED' })),
    verification: { dom: true, url: true, request: true, business: true }, verifiedAt: '2026-07-20T13:00:00.000Z'
  }))
}

async function seedCandidate(baseUrl, namespace, suffix) {
  const { draft, acceptanceSummary } = stage2Objects()
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', {
    namespace, idempotencyKey: `stage4-prepare-${suffix}`, actorRef: 'flowise-controller',
    caseDescription: '客户登录后核对页眉与个人资料中的姓名和头像', draft, acceptanceSummary
  })
  assert.equal(prepared.response.status, 200)
  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login',
    steps: [{ intentStepId: 'intent-login', action: '登录门户', expected: '进入受保护页面', riskLevel: 'LOW' }, { intentStepId: 'intent-profile', action: '核对身份', expected: '姓名和头像一致', riskLevel: 'LOW' }],
    assertions: draft.assertions
  }
  const submitted = await post(baseUrl, '/v1/i8/authoring:submit', {
    namespace, idempotencyKey: `stage4-submit-${suffix}`, preparationId: prepared.body.preparationId,
    expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: `stage4-confirm-${suffix}`, reason: '用户批准' }, intentPlan
  })
  assert.equal(submitted.response.status, 202)
  const compiled = await post(baseUrl, '/v1/i8/candidates:compile', {
    namespace, idempotencyKey: `stage4-compile-${suffix}`, preparationId: prepared.body.preparationId, expectedPreparationVersion: 2
  })
  assert.equal(compiled.response.status, 202)
  const buildClaim = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: `builder-${suffix}` }, workerToken)
  const completed = await post(baseUrl, `/internal/worker/i8/candidates/${encodeURIComponent(buildClaim.body.jobId)}:complete`, {
    workerId: `builder-${suffix}`, planHash: buildClaim.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(buildClaim.body.plan)
  }, workerToken)
  assert.equal(completed.body.status, 'CANDIDATE_GENERATED')
  return { prepared: prepared.body, candidate: completed.body }
}

async function startPortal(t) {
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', 'text/html; charset=utf-8')
    if (route === '/portal/login') return response.end(`<!doctype html><html><body><main><input data-testid="login-username"><input data-testid="login-password" type="password"><button data-testid="login-submit">账号密码登录</button></main><script>document.querySelector('[data-testid="login-submit"]').onclick=()=>{const u=document.querySelector('[data-testid="login-username"]').value;const p=document.querySelector('[data-testid="login-password"]').value;if(u==='synthetic-user'&&p==='synthetic-password'){sessionStorage.setItem('auth','1');location.href='/portal/dashboard'}}</script></body></html>`)
    if (route === '/portal/dashboard') return response.end(`<!doctype html><html><body><script>if(sessionStorage.getItem('auth')!=='1')location.replace('/portal/login')</script><header><span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span><a href="/portal/profile">个人资料</a></header></body></html>`)
    if (route === '/portal/profile') return response.end(`<!doctype html><html><body><script>if(sessionStorage.getItem('auth')!=='1')location.replace('/portal/login')</script><header><span data-testid="customer-profile-name">张三</span><span data-testid="customer-profile-avatar">张</span></header><main><span data-testid="profile-display-name">张三</span><span data-testid="profile-avatar">张</span><span data-testid="profile-customer-id">synthetic-id</span><span data-testid="profile-email">synthetic@example.invalid</span><span data-testid="profile-phone">00000000000</span></main></body></html>`)
    response.statusCode = 404
    response.end('not found')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

function syntheticCompletion(root, claim, workerId, failFirst) {
  const assertionSetHash = sha256('same-assertions')
  const evidenceSetHash = sha256('same-evidence-shape')
  const runs = claim.runs.map((run, index) => {
    const directory = path.join(root, '.data', 'stability', claim.namespace, claim.candidateId, run.validationRunId)
    fs.mkdirSync(directory, { recursive: true })
    const specs = [['REPORT', 'application/json', 'report.json'], ['SCREENSHOT', 'image/png', 'screenshot.png'], ['LOG', 'text/plain; charset=utf-8', 'steps.log']]
    const evidence = specs.map(([artifactType, mediaType, name]) => {
      const target = path.join(directory, name)
      fs.writeFileSync(target, Buffer.from(`${run.validationRunId}:${artifactType}`))
      const bytes = fs.readFileSync(target)
      return { artifactType, mediaType, redactionStatus: 'REDACTED', relativePath: path.relative(root, target).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.byteLength }
    })
    const failed = failFirst && index === 0
    return { ...run, outcome: failed ? 'FAILED' : 'PASSED', durationMs: 1, assertionSetHash, evidenceSetHash, evidence, ...(failed ? { errorCode: 'SYNTHETIC_ASSERTION_FAILED' } : {}) }
  })
  return { workerId, candidateId: claim.candidateId, scriptHash: claim.scriptHash, runtimeFingerprint: sha256('synthetic-runtime'), runs }
}

test('migration 012 creates immutable six-run stability authority', async t => {
  const { application } = await fixture(t, 'i8-stage4-db')
  assert.equal(application.database.connection.prepare('SELECT name FROM schema_migrations WHERE version = 12').get().name, '012_i8_stability_certificate.sql')
  for (const table of ['i8_stability_batches', 'i8_stability_validation_runs', 'i8_stability_certificates']) {
    assert.equal(application.database.connection.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1)
  }
})

test('real bundled Chromium passes two fixed viewports three times and issues one certificate', { timeout: 120000 }, async t => {
  const { application, root, baseUrl, namespace } = await fixture(t, 'i8-stage4-live')
  const portalBaseUrl = await startPortal(t)
  const { prepared } = await seedCandidate(baseUrl, namespace, 'pass')
  const claim = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'stability-worker-pass' }, workerToken)
  assert.equal(claim.body.runs.length, 6)
  assert.equal(new Set(claim.body.runs.map(run => run.fixtureRef)).size, 6)
  const completion = await executeStabilityBatch(claim.body, {
    productRoot: root, runtimeProductRoot: productRoot, baseUrl: portalBaseUrl,
    allowedOrigins: [portalBaseUrl], workerId: 'stability-worker-pass',
    environment: { HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME: 'synthetic-user', HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD: 'synthetic-password' }
  })
  const completed = await post(baseUrl, `/internal/worker/i8/stability/${encodeURIComponent(claim.body.batchId)}:complete`, completion, workerToken)
  assert.equal(completed.response.status, 200)
  assert.equal(completed.body.status, 'STABILITY_CERTIFIED')
  const candidate = await post(baseUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.preparationId })
  assert.equal(candidate.body.stability.status, 'PASSED')
  assert.equal(candidate.body.stability.passedRuns, 6)
  assert.equal(candidate.body.stability.certificate.validationRunIds.length, 6)
  assert.equal(candidate.body.nextAction, 'HUMAN_DELIVERY_DECISION_REQUIRED')
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) AS count FROM i8_stability_certificates').get().count, 1)
  assert.throws(() => application.database.connection.prepare('DELETE FROM i8_stability_certificates').run(), /I8_STABILITY_CERTIFICATE_IMMUTABLE/)
})

test('one failed sample rejects the whole batch without retry or certificate', async t => {
  const { application, root, baseUrl, namespace } = await fixture(t, 'i8-stage4-fail')
  const { prepared } = await seedCandidate(baseUrl, namespace, 'fail')
  const claim = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'stability-worker-fail' }, workerToken)
  const completed = await post(baseUrl, `/internal/worker/i8/stability/${encodeURIComponent(claim.body.batchId)}:complete`, syntheticCompletion(root, claim.body, 'stability-worker-fail', true), workerToken)
  assert.equal(completed.body.status, 'VALIDATION_FAILED')
  assert.equal(completed.body.failedRuns, 1)
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) AS count FROM i8_stability_certificates').get().count, 0)
  const candidate = await post(baseUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.preparationId })
  assert.equal(candidate.body.candidate.status, 'VALIDATION_FAILED')
  assert.equal(candidate.body.nextAction, 'CANDIDATE_REPAIR_REQUIRED')
  const replay = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'stability-worker-retry' }, workerToken)
  assert.equal(replay.body.status, 'EMPTY')
})

test('the persistent worker polls and completes stage4 stability batches', () => {
  const source = fs.readFileSync(path.join(productRoot, 'worker', 'src', 'index.cjs'), 'utf8')
  assert.match(source, /async function runI8StabilityOnce\(\)/)
  assert.match(source, /\/internal\/worker\/i8\/stability:claim/)
  assert.match(source, /executeStabilityBatch\(claim/)
  assert.match(source, /\/internal\/worker\/i8\/stability\/\$\{encodeURIComponent\(claim\.batchId\)\}:complete/)
  assert.match(source, /runI8RepairStabilityOnce\(\) \|\| await runRepairOnce\(\) \|\| await runI8CandidateBuildOnce\(\) \|\| await runI8StabilityOnce\(\) \|\| await runOnce\(\)/)
})
