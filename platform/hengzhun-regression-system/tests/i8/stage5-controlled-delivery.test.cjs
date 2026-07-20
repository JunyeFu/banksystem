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
const serviceToken = ['synthetic-i8-stage5', 'service-token-000001'].join('-')
const workerToken = ['synthetic-i8-stage5', 'worker-token-0000002'].join('-')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

async function fixture(t, namespace) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage5-'))
  const running = await startHarness({
    productRoot: root, databasePath: path.join(root, '.data', 'sqlite', 'platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'), backupDirectory: path.join(root, '.data', 'backups'),
    artifactRoot: path.join(root, '.data', 'artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0
  })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { ...running, namespace, root, baseUrl }
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { response, body: await response.json() }
}

function domainObjects() {
  const knowledgeHash = sha256(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'knowledge', 'portal-login-consistency.md')))
  const draft = {
    schemaVersion: 'i8-regression-case-draft-v1', title: '门户登录资料一致性', objective: '验证当前客户身份。', summary: '登录后核对页眉与个人资料。',
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
  const assertionSetHash = sha256('same-assertions')
  const evidenceSetHash = sha256('same-evidence-shape')
  return {
    workerId, candidateId: claim.candidateId, scriptHash: claim.scriptHash, runtimeFingerprint: sha256('synthetic-runtime'),
    runs: claim.runs.map(run => {
      const directory = path.join(root, '.data', 'stability', claim.namespace, claim.candidateId, run.validationRunId)
      fs.mkdirSync(directory, { recursive: true })
      const evidence = [['REPORT', 'application/json', 'report.json'], ['SCREENSHOT', 'image/png', 'screenshot.png'], ['LOG', 'text/plain; charset=utf-8', 'steps.log']].map(([artifactType, mediaType, name]) => {
        const target = path.join(directory, name); fs.writeFileSync(target, `${run.validationRunId}:${artifactType}`); const bytes = fs.readFileSync(target)
        return { artifactType, mediaType, redactionStatus: 'REDACTED', relativePath: path.relative(root, target).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.byteLength }
      })
      return { ...run, outcome: 'PASSED', durationMs: 1, assertionSetHash, evidenceSetHash, evidence }
    })
  }
}

async function seedCertified(baseUrl, root, namespace, suffix, certify = true) {
  const { draft, acceptanceSummary } = domainObjects()
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', { namespace, idempotencyKey: `s5-prepare-${suffix}`, actorRef: 'flowise-controller', caseDescription: '客户登录后核对姓名和头像', draft, acceptanceSummary })
  const intentPlan = { schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login', steps: [{ intentStepId: 'intent-login', action: '登录门户', expected: '进入受保护页面', riskLevel: 'LOW' }, { intentStepId: 'intent-profile', action: '核对身份', expected: '姓名和头像一致', riskLevel: 'LOW' }], assertions: draft.assertions }
  assert.equal((await post(baseUrl, '/v1/i8/authoring:submit', { namespace, idempotencyKey: `s5-submit-${suffix}`, preparationId: prepared.body.preparationId, expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: `s5-author-${suffix}`, reason: '用户批准' }, intentPlan })).response.status, 202)
  assert.equal((await post(baseUrl, '/v1/i8/candidates:compile', { namespace, idempotencyKey: `s5-compile-${suffix}`, preparationId: prepared.body.preparationId, expectedPreparationVersion: 2 })).response.status, 202)
  const build = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: `builder-${suffix}` }, workerToken)
  await post(baseUrl, `/internal/worker/i8/candidates/${encodeURIComponent(build.body.jobId)}:complete`, { workerId: `builder-${suffix}`, planHash: build.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(build.body.plan) }, workerToken)
  if (!certify) {
    const current = await post(baseUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.body.preparationId })
    return { prepared: prepared.body, current: current.body }
  }
  const stability = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: `stability-${suffix}` }, workerToken)
  await post(baseUrl, `/internal/worker/i8/stability/${encodeURIComponent(stability.body.batchId)}:complete`, syntheticCertificate(root, stability.body, `stability-${suffix}`), workerToken)
  const current = await post(baseUrl, '/v1/i8/candidates:get', { namespace, preparationId: prepared.body.preparationId })
  return { prepared: prepared.body, current: current.body }
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

test('migration 013 creates immutable delivery and one-time download authorities', async t => {
  const { application } = await fixture(t, 'i8-stage5-db')
  assert.equal(application.database.connection.prepare('SELECT name FROM schema_migrations WHERE version=13').get().name, '013_i8_controlled_delivery.sql')
  for (const table of ['i8_script_delivery_decisions', 'i8_script_download_grants']) assert.equal(application.database.connection.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1)
})

test('preview fails closed before a stability certificate exists', async t => {
  const { root, baseUrl, namespace } = await fixture(t, 'i8-stage5-uncertified')
  const seeded = await seedCertified(baseUrl, root, namespace, 'uncertified', false)
  const preview = await post(baseUrl, '/v1/i8/candidates:preview', { namespace, candidateId: seeded.current.candidate.candidateId, limit: 5, includeDownload: false })
  assert.equal(preview.response.status, 409)
  assert.equal(preview.body.errorCode, 'I8_STABILITY_CERTIFICATE_REQUIRED')
})

test('preview requires certificate, paginates by complete lines and download is one-time', async t => {
  const { application, root, baseUrl, namespace } = await fixture(t, 'i8-stage5-preview')
  const seeded = await seedCertified(baseUrl, root, namespace, 'preview')
  const preview = await post(baseUrl, '/v1/i8/candidates:preview', { namespace, candidateId: seeded.current.candidate.candidateId, cursor: 'line:0', limit: 5, includeDownload: true })
  assert.equal(preview.response.status, 200); assert.equal(preview.body.lines.length, 5); assert.match(preview.body.nextCursor, /^line:\d+$/)
  assert.doesNotMatch(JSON.stringify(preview.body), /(?:synthetic-user|synthetic-password|storageState|[A-Za-z]:\\)/i)
  const first = await fetch(baseUrl + preview.body.download.href); const bytes = Buffer.from(await first.arrayBuffer())
  assert.equal(first.status, 200); assert.equal(sha256(bytes), preview.body.scriptHash)
  assert.equal((await fetch(baseUrl + preview.body.download.href)).status, 404)
  assert.equal(application.database.connection.prepare("SELECT status FROM i8_script_download_grants").get().status, 'USED')
})

test('SAVE_ONLY, exact-version ACTIVATE and REJECT are explicit terminal decisions', async t => {
  const { application, root, baseUrl, namespace } = await fixture(t, 'i8-stage5-decisions')
  const saved = await seedCertified(baseUrl, root, namespace, 'save')
  const save = await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's5-save-key', candidateId: saved.current.candidate.candidateId, expectedCandidateVersion: saved.current.candidate.version, choice: 'SAVE_ONLY', confirmationRef: 's5-save-confirm', reason: '保存但暂不激活' })
  assert.equal(save.body.status, 'SAVED'); assert.equal(application.database.connection.prepare('SELECT COUNT(*) count FROM runs').get().count, 0)
  const activate = await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's5-activate-key', candidateId: saved.current.candidate.candidateId, expectedCandidateVersion: save.body.candidateVersion, choice: 'ACTIVATE', confirmationRef: 's5-activate-confirm', reason: '激活精确持证版本' })
  assert.equal(activate.body.status, 'SCRIPT_VALIDATED'); assert.ok(activate.body.planId)
  const stale = await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's5-stale-key', candidateId: saved.current.candidate.candidateId, expectedCandidateVersion: save.body.candidateVersion, choice: 'ACTIVATE', confirmationRef: 's5-stale-confirm', reason: '并发旧版本' })
  assert.equal(stale.response.status, 409); assert.equal(application.database.connection.prepare('SELECT COUNT(*) count FROM runs').get().count, 0)
  assert.throws(() => application.database.connection.prepare('DELETE FROM i8_script_delivery_decisions').run(), /I8_DELIVERY_DECISION_IMMUTABLE/)
  const rejected = await seedCertified(baseUrl, root, namespace, 'reject')
  const reject = await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's5-reject-key', candidateId: rejected.current.candidate.candidateId, expectedCandidateVersion: rejected.current.candidate.version, choice: 'REJECT', confirmationRef: 's5-reject-confirm', reason: '用户拒绝' })
  assert.equal(reject.body.status, 'REJECTED')
})

test('activated candidate executes once through pure Playwright and task result is queryable', { timeout: 120000 }, async t => {
  const { root, baseUrl, namespace } = await fixture(t, 'i8-stage5-run')
  const portalBaseUrl = await startPortal(t)
  const seeded = await seedCertified(baseUrl, root, namespace, 'run')
  await post(baseUrl, '/v1/i8/candidates:decide', { namespace, idempotencyKey: 's5-run-activate-key', candidateId: seeded.current.candidate.candidateId, expectedCandidateVersion: seeded.current.candidate.version, choice: 'ACTIVATE', confirmationRef: 's5-run-confirm', reason: '激活后按需运行' })
  const submitted = await post(baseUrl, '/v1/i8/runs:submit', { namespace, idempotencyKey: 's5-run-submit-key', preparationId: seeded.prepared.preparationId, credentialAlias: 'i3-customer' })
  assert.equal(submitted.response.status, 202)
  const claim = await post(baseUrl, '/internal/worker/tasks:claim', { workerId: 'stage5-run-worker' }, workerToken)
  assert.equal(claim.body.execution.candidate.candidateId, seeded.current.candidate.candidateId)
  const result = await executeI8FormalRun(claim.body, { HENGZHUN_PORTAL_BASE_URL: portalBaseUrl, HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME: 'synthetic-user', HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD: 'synthetic-password' }, { productRoot: root, runtimeProductRoot: productRoot })
  assert.equal(result.outcome, 'PASSED'); assert.equal(result.evidence.length, 3)
  await post(baseUrl, `/internal/worker/tasks/${encodeURIComponent(claim.body.taskId)}:complete`, { workerId: 'stage5-run-worker', ...result }, workerToken)
  const task = await post(baseUrl, '/v1/i8/tasks:get', { namespace, taskId: submitted.body.taskId })
  assert.equal(task.body.status, 'SUCCEEDED'); assert.equal(task.body.outcome, 'PASSED')
})

test('stage5 MCP and Flowise manifests activate only eight governed tools', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(productRoot, 'contracts', 'mcp', 'hengzhun-i8.json'), 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'deployment-manifest.json'), 'utf8'))
  const continuation = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', manifest.stage5ContinuationArtifact), 'utf8'))
  assert.equal(contract.activeStage, 5); assert.equal(contract.tools.filter(tool => tool.status === 'ACTIVE').length, 8); assert.equal(contract.tools.filter(tool => tool.status === 'DEFERRED_FAIL_CLOSED').length, 6)
  assert.deepEqual(manifest.activeMcpTools, contract.tools.filter(tool => tool.status === 'ACTIVE').map(tool => tool.name))
  assert.equal(continuation.entryContract.userTechnicalInputRequired, false)
  assert.deepEqual(continuation.nodes.filter(node => node.semantic === 'mcp_tool').map(node => node.tool), ['candidate_get', 'candidate_preview', 'candidate_decide', 'run_submit', 'task_get'])
  assert.equal(continuation.nodes.some(node => continuation.forbiddenSemantics.includes(node.semantic)), false)
  const worker = fs.readFileSync(path.join(productRoot, 'worker', 'src', 'index.cjs'), 'utf8')
  assert.match(worker, /task\.execution\?\.candidate \? executeI8FormalRun/)
})
