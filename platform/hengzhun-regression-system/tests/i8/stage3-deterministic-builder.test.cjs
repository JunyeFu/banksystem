'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')
const {
  I8_CONTROLLED_CATALOG,
  buildCandidatePackage,
  compileExecutableActionPlan
} = require('../../dist/harness/src/i8/script-package-builder.js')
const { dslStepSchema, executableActionPlanSchema } = require('../../dist/harness/src/i8/stage3-schemas.js')
const { executeCandidatePackage, verifyCandidatePackage } = require('../../worker/src/i8-candidate-runner.cjs')

const repositoryProductRoot = path.resolve(__dirname, '../..')
const serviceToken = 'synthetic-i8-stage3-service-token-000001'
const workerToken = 'synthetic-i8-stage3-worker-token-0000002'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage3-'))
  const running = await startHarness({
    productRoot: root,
    databasePath: path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(repositoryProductRoot, 'harness', 'migrations'),
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
  return { ...running, root, baseUrl }
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
  const knowledgeHash = sha256(fs.readFileSync(path.join(repositoryProductRoot, 'flowise', 'i8', 'knowledge', 'portal-login-consistency.md')))
  const draft = {
    schemaVersion: 'i8-regression-case-draft-v1',
    title: '门户登录资料一致性',
    objective: '验证客户登录后的姓名和头像来自当前账户。',
    summary: '登录后核对页眉身份与个人资料。',
    riskLevel: 'LOW',
    route: '/portal/login',
    preconditions: ['使用受控合成客户身份'],
    steps: [
      { action: '在门户输入账号密码并登录', expected: '进入受保护的门户页面' },
      { action: '打开个人资料', expected: '显示当前客户资料' }
    ],
    assertions: ['页眉姓名与个人资料姓名相等', '页眉头像与个人资料头像相等'],
    knowledgeSnapshot: {
      knowledgeSnapshotId: 'flowise-portal-login-v1', sourceVersion: '1.0.0', contentHash: knowledgeHash,
      citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency']
    }
  }
  return {
    draft,
    acceptanceSummary: {
      schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective,
      stepCount: 2, assertionCount: 2, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: []
    }
  }
}

function recordsFor(plan, verifiedAt = '2026-07-20T12:00:00.000Z') {
  return plan.actions.map(action => ({
    schemaVersion: 'i8-verified-action-record-v1',
    executablePlanId: plan.executablePlanId,
    actionId: action.actionId,
    ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED',
    ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}),
    pageSignatureHash: sha256(stableJson(action.pageSignature)),
    factsHash: sha256(stableJson({ actionId: action.actionId, outcome: 'VERIFIED_PASSED' })),
    verification: { dom: true, url: true, request: true, business: true },
    verifiedAt
  }))
}

async function seedStage2(baseUrl) {
  const { draft, acceptanceSummary } = stage2Objects()
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', {
    namespace: 'i8-stage3', idempotencyKey: 'stage3-prepare-0001', actorRef: 'flowise-controller',
    caseDescription: '客户登录后核对页眉与个人资料中的姓名和头像', draft, acceptanceSummary
  })
  assert.equal(prepared.response.status, 200)
  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login',
    steps: [
      { intentStepId: 'intent-login', action: '登录门户', expected: '进入受保护页面', riskLevel: 'LOW' },
      { intentStepId: 'intent-profile', action: '核对身份', expected: '姓名和头像一致', riskLevel: 'LOW' }
    ],
    assertions: draft.assertions
  }
  const submitted = await post(baseUrl, '/v1/i8/authoring:submit', {
    namespace: 'i8-stage3', idempotencyKey: 'stage3-submit-0001', preparationId: prepared.body.preparationId,
    expectedVersion: 1, confirmation: { choice: 'APPROVE', confirmationRef: 'stage3-confirm-0001', reason: '用户批准' }, intentPlan
  })
  assert.equal(submitted.response.status, 202)
  return { prepared: prepared.body, submitted: submitted.body, intentPlan }
}

test('migration 011 creates immutable stage3 authority tables', async t => {
  const { application } = await fixture(t)
  const migration = application.database.connection.prepare('SELECT name FROM schema_migrations WHERE version = 11').get()
  assert.equal(migration.name, '011_i8_deterministic_builder.sql')
  for (const table of ['i8_executable_plans', 'i8_candidate_build_jobs', 'i8_verified_action_records', 'i8_script_candidates']) {
    assert.equal(application.database.connection.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1)
  }
})

test('finite DSL and deterministic builder reject ungoverned operations and locators', () => {
  assert.throws(() => dslStepSchema.parse({ operation: 'evaluate', stepId: 'dsl_01', sourceActionId: 'act_01' }))
  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_deterministic', caseVersion: 1, route: '/portal/login',
    steps: [{ intentStepId: 'intent-login', action: '登录并核对身份', expected: '资料一致', riskLevel: 'LOW' }], assertions: ['资料一致']
  }
  const intentHash = sha256(stableJson(intentPlan))
  const plan = compileExecutableActionPlan(intentPlan, intentHash)
  assert.equal(executableActionPlanSchema.parse(plan).actions.length, 14)
  const records = recordsFor(plan)
  const first = buildCandidatePackage(plan, records, '2026-07-20T12:00:00.000Z')
  const second = buildCandidatePackage(plan, records, '2026-07-20T12:01:00.000Z')
  assert.equal(first.scriptSource, second.scriptSource)
  assert.equal(first.scriptHash, second.scriptHash)
  assert.equal(first.dslHash, second.dslHash)
  assert.equal(/\beval\s*\(|\brequire\s*\(|\bimport\s*\(|\.\.\//.test(first.scriptSource), false)
  const changed = structuredClone(records)
  const targetIndex = plan.actions.findIndex(action => action.semanticTargetRef)
  changed[targetIndex].locator = { kind: 'TEST_ID', value: 'unapproved-target' }
  assert.throws(() => buildCandidatePackage(plan, changed, '2026-07-20T12:00:00.000Z'), /I8_VERIFIED_LOCATOR_NOT_ALLOWLISTED/)
})

test('Harness compiles the plan, persists verified facts and writes a governed candidate package', async t => {
  const { application, root, baseUrl } = await fixture(t)
  const { prepared } = await seedStage2(baseUrl)
  const compiled = await post(baseUrl, '/v1/i8/candidates:compile', {
    namespace: 'i8-stage3', idempotencyKey: 'stage3-compile-0001', preparationId: prepared.preparationId, expectedPreparationVersion: 2
  })
  assert.equal(compiled.response.status, 202)
  assert.equal(compiled.body.status, 'EXECUTABLE_PLAN_READY')
  const claim = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: 'stage3-worker-01' }, workerToken)
  assert.equal(claim.response.status, 200)
  assert.equal(claim.body.status, 'CLAIMED')
  const completed = await post(baseUrl, `/internal/worker/i8/candidates/${encodeURIComponent(claim.body.jobId)}:complete`, {
    workerId: 'stage3-worker-01', planHash: claim.body.planHash, outcome: 'VERIFIED_PASSED',
    verifiedActionRecords: recordsFor(claim.body.plan)
  }, workerToken)
  assert.equal(completed.response.status, 200)
  assert.equal(completed.body.status, 'CANDIDATE_GENERATED')
  assert.equal(completed.body.nextAction, 'I8_STAGE4_STABILITY_REQUIRED')
  const status = await post(baseUrl, '/v1/i8/candidates:get', { namespace: 'i8-stage3', preparationId: prepared.preparationId })
  assert.equal(status.response.status, 200)
  assert.equal(status.body.candidate.scriptHash, completed.body.scriptHash)
  assert.equal(status.body.candidate.status, 'GENERATED')
  const row = application.database.connection.prepare('SELECT * FROM i8_script_candidates WHERE candidate_id = ?').get(completed.body.candidateId)
  const descriptor = {
    productRoot: root, relativeDirectory: row.relative_directory, candidateId: row.candidate_id,
    scriptHash: row.script_sha256, manifestHash: row.manifest_sha256
  }
  const verified = verifyCandidatePackage(descriptor)
  assert.equal(verified.manifest.sourceChainHash, row.source_chain_hash)
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) AS count FROM i8_verified_action_records WHERE executable_plan_id = ?').get(claim.body.executablePlanId).count, claim.body.plan.actions.length)
  assert.throws(() => application.database.connection.prepare('DELETE FROM i8_script_candidates WHERE candidate_id = ?').run(row.candidate_id), /I8_SCRIPT_CANDIDATE_IMMUTABLE/)
})

test('worker candidate runner executes only a hash-verified package and rejects tampering', async t => {
  const { application, root, baseUrl } = await fixture(t)
  const { prepared } = await seedStage2(baseUrl)
  const compiled = await post(baseUrl, '/v1/i8/candidates:compile', {
    namespace: 'i8-stage3', idempotencyKey: 'stage3-compile-runner-0001', preparationId: prepared.preparationId, expectedPreparationVersion: 2
  })
  const claim = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: 'stage3-worker-runner' }, workerToken)
  const completed = await post(baseUrl, `/internal/worker/i8/candidates/${encodeURIComponent(claim.body.jobId)}:complete`, {
    workerId: 'stage3-worker-runner', planHash: claim.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(claim.body.plan)
  }, workerToken)
  const row = application.database.connection.prepare('SELECT * FROM i8_script_candidates WHERE candidate_id = ?').get(completed.body.candidateId)
  const descriptor = { productRoot: root, relativeDirectory: row.relative_directory, candidateId: row.candidate_id, scriptHash: row.script_sha256, manifestHash: row.manifest_sha256 }
  const values = new Map([
    ['customer-profile-name', '张三'], ['customer-profile-avatar', '张'], ['profile-display-name', '张三'], ['profile-avatar', '张']
  ])
  const locator = value => ({
    async fill() {}, async click() {}, async selectOption() {}, async isVisible() { return true }, async innerText() { return values.get(value) || '' }
  })
  let waitForUrlCall = 0
  const page = {
    async goto() {}, async waitForURL(predicate) {
      waitForUrlCall += 1
      const route = waitForUrlCall === 1 ? '/portal/dashboard' : '/portal/profile'
      assert.equal(predicate(new URL(`http://127.0.0.1:18082${route}`)), true)
    },
    async waitForResponse() {}, getByTestId(value) { return locator(value) }, getByLabel(value) { return locator(value) },
    getByRole(_role, options) { return locator(options.name) }
  }
  let captures = 0
  const result = await executeCandidatePackage(descriptor, {
    baseUrl: 'http://127.0.0.1:18082/', page,
    fixtures: { 'LOGIN_PROFILE.USERNAME': 'synthetic-user', 'LOGIN_PROFILE.PASSWORD': 'synthetic-password' },
    capture: async () => { captures += 1 }
  })
  assert.equal(result.outcome, 'PASSED')
  assert.equal(captures, 1)
  const scriptPath = path.join(root, ...row.relative_directory.split('/'), 'script.cjs')
  fs.appendFileSync(scriptPath, '\n// tampered')
  assert.throws(() => verifyCandidatePackage(descriptor), /候选脚本 Hash 不匹配/)
})
