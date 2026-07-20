'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
const {
  actionContextEnvelopeSchema,
  assertContextBudget,
  buildMidscenePrompt,
  estimateImageTokens,
  MODEL_CONTEXT_POLICIES
} = require('../../dist/harness/src/context-envelope.js');
const { startHarness } = require('../../dist/harness/src/server.js');
const {
  acceptanceSummarySchema,
  executableActionPlanSchema,
  intentPlanSchema,
  knowledgeSnapshotRefSchema,
  regressionCaseDraftSchema
} = require('../../dist/harness/src/schemas.js');

const productRoot = path.resolve(__dirname, '../..');
const serviceToken = 'synthetic-i8-service-token-000000000001';
const workerToken = 'synthetic-i8-worker-token-000000000002';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-context-'));
  const running = await startHarness({
    productRoot,
    databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken,
    host: '127.0.0.1', port: 0
  });
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => running.server.close(resolve));
    await running.application.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { ...running, baseUrl };
}

async function call(baseUrl, pathname, body, worker = false) {
  const response = await fetch(baseUrl + pathname, {
    method: 'POST',
    headers: { authorization: `Bearer ${worker ? workerToken : serviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return { response, text, body: JSON.parse(text) };
}

async function createAuthoringPlan(baseUrl, suffix = '001') {
  const namespace = `i8-context-${suffix}`;
  const created = await call(baseUrl, '/v1/plugin/cases:create-draft', {
    namespace,
    idempotencyKey: `i8-case-create-${suffix}`,
    actorRef: 'flowise-agent',
    title: '上下文升级案例',
    objective: '验证受控视觉上下文升级。',
    summary: '不包含凭据的合成案例。',
    riskLevel: 'LOW',
    route: 'customer.login',
    executionProfile: 'AUTH_REJECTION_RECOVERY',
    steps: [{ action: '定位登录输入框', expected: '元素唯一' }],
    assertions: ['只允许操作登录用户名输入框'],
    credentialAlias: 'synthetic-alias',
    authoringActions: [
      { actionType: 'LOCATE', prompt: '定位用户名输入框', targetRef: 'LOGIN_USERNAME', riskLevel: 'LOW' },
      { actionType: 'TAP', prompt: '点击统一身份认证标签', targetRef: 'LOGIN_SSO_TAB', riskLevel: 'LOW' }
    ]
  });
  assert.equal(created.response.status, 200);
  const compiled = await call(baseUrl, '/v1/plugin/plans:compile', {
    namespace,
    idempotencyKey: `i8-plan-compile-${suffix}`,
    caseId: created.body.caseId,
    expectedCaseVersion: 1,
    executionRoute: 'AUTHORING_REQUIRED'
  });
  return { namespace, created, compiled };
}

async function recordLocateCapability(baseUrl) {
  const response = await call(baseUrl, '/internal/worker/midscene-capabilities:record', {
    actionType: 'LOCATE', viewportCount: 5, attemptCount: 15, failureCount: 0, falseSuccessCount: 0,
    verificationRef: 'PLAT-V014:LOCATE:sha256:i8-context'
  }, true);
  assert.equal(response.body.status, 'VERIFIED');
}

function completionFor(claim, outcome = 'AMBIGUOUS', modelUsage = { status: 'NOT_EXPOSED' }) {
  return {
    workerId: 'worker-i8',
    slotId: claim.slotId,
    outcome,
    summary: outcome === 'VERIFIED_PASSED' ? 'Playwright 验证通过。' : '视觉候选存在歧义。',
    contextAuditId: claim.contextAuditId,
    contextEnvelopeHash: claim.contextEnvelopeHash,
    modelUsage,
    pageState: { route: '/portal/login', redacted: true },
    verification: { dom: outcome === 'VERIFIED_PASSED', url: true, request: true, business: outcome === 'VERIFIED_PASSED' }
  };
}

test('migration 009 remains applied and creates immutable context-budget audit state', async t => {
  const { application } = await fixture(t);
  const migrations = application.database.connection.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
  assert.ok(migrations.some((migration) => migration.version === 9 && migration.name === '009_i8_context_budget.sql'));
  const table = application.database.connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='context_budget_audits'").get();
  assert.equal(table.name, 'context_budget_audits');
});

test('I8 core domain objects are strict versioned schemas', () => {
  const knowledgeSnapshot = {
    knowledgeSnapshotId: 'knowledge_0001', sourceVersion: 'v1', contentHash: 'a'.repeat(64), citationIds: ['citation_0001']
  };
  assert.equal(knowledgeSnapshotRefSchema.safeParse(knowledgeSnapshot).success, true);
  assert.equal(regressionCaseDraftSchema.safeParse({
    schemaVersion: 'i8-regression-case-draft-v1', title: '登录一致性', objective: '验证姓名头像资料一致。',
    summary: '合成案例', riskLevel: 'LOW', route: '/portal/login', preconditions: [],
    steps: [{ action: '登录', expected: '进入门户' }], assertions: ['资料一致'], knowledgeSnapshot
  }).success, true);
  assert.equal(acceptanceSummarySchema.safeParse({
    schemaVersion: 'i8-acceptance-summary-v1', caseTitle: '登录一致性', objective: '验证资料一致',
    stepCount: 1, assertionCount: 1, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: []
  }).success, true);
  assert.equal(intentPlanSchema.safeParse({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_00000001', caseVersion: 1, route: '/portal/login',
    steps: [{ intentStepId: 'intent_000001', action: '定位用户名', expected: '唯一', riskLevel: 'LOW' }], assertions: ['资料一致']
  }).success, true);
  const executable = {
    schemaVersion: 'i8-executable-action-plan-v1', planId: 'plan_00000001', caseId: 'case_00000001', caseVersion: 1,
    actions: [{
      actionId: 'action_000001', ordinal: 1, actionType: 'LOCATE', prompt: '定位用户名', targetRef: 'LOGIN_USERNAME',
      riskLevel: 'LOW', preconditions: [], invariants: ['不读取凭据'], postconditions: ['目标唯一'], sourceIntentStepId: 'intent_000001'
    }]
  };
  assert.equal(executableActionPlanSchema.safeParse(executable).success, true);
  assert.equal(executableActionPlanSchema.safeParse({ ...executable, unexpected: true }).success, false);
});

test('Harness emits strict CTX-L1 and deterministic ambiguity upgrades L2 then L3', async t => {
  const { application, baseUrl } = await fixture(t);
  await recordLocateCapability(baseUrl);
  const { compiled } = await createAuthoringPlan(baseUrl);

  for (const expectedLevel of ['CTX-L1', 'CTX-L2', 'CTX-L3']) {
    const claimed = await call(baseUrl, '/internal/worker/authoring:claim', {
      workerId: 'worker-i8',
      visualContext: { viewportWidth: 1024, viewportHeight: 520, tokenizerId: 'mimo-v2.5-conservative-v1' }
    }, true);
    assert.equal(claimed.response.status, 200);
    assert.equal(claimed.body.status, 'CLAIMED');
    assert.equal(claimed.body.contextEnvelope.contextLevel, expectedLevel);
    assert.equal(claimed.body.contextEnvelope.consumerType, 'VISION_LLM');
    assert.equal(claimed.body.contextEnvelope.modelContextLimitTokens, 16000);
    assert.equal(claimed.body.contextEnvelope.inputBudgetTokens, 12000);
    assert.equal(claimed.body.contextEnvelope.reservedOutputTokens, 4000);
    assert.equal(claimed.body.contextEnvelope.imageTokenEstimate, estimateImageTokens(1024, 520));
    assert.equal(claimed.body.contextEnvelope.budgetDecision, 'ALLOW');
    assert.equal(claimed.text.includes('credentialAlias'), false);
    assert.equal(claimed.text.includes('full_action_plan'), false);
    assert.deepEqual(actionContextEnvelopeSchema.parse(claimed.body.contextEnvelope), claimed.body.contextEnvelope);

    const prompt = buildMidscenePrompt(claimed.body.contextEnvelope);
    assert.match(prompt, /currentAction/);
    assert.match(prompt, /allowedTargets/);
    if (expectedLevel === 'CTX-L1') {
      assert.equal(claimed.body.contextEnvelope.previousActionSummary, null);
      assert.equal(claimed.body.contextEnvelope.nextActionPreview, null);
    } else {
      assert.equal(claimed.body.contextEnvelope.nextActionPreview.actionType, 'TAP');
    }
    if (expectedLevel === 'CTX-L3') assert.equal(claimed.body.contextEnvelope.minimalDependencyCone.caseVersion, 1);

    const completed = await call(
      baseUrl,
      `/internal/worker/authoring/${compiled.body.taskId}/actions:complete`,
      completionFor(claimed.body),
      true
    );
    if (expectedLevel === 'CTX-L3') {
      assert.equal(completed.body.status, 'WAITING_USER');
      assert.equal(completed.body.cursorAdvanced, false);
    } else {
      assert.equal(completed.body.status, 'QUEUED');
      assert.equal(completed.body.contextUpgraded, true);
    }
  }

  const audits = application.database.connection.prepare(`
    SELECT context_level, usage_status, actual_total_tokens, completed_at
    FROM context_budget_audits ORDER BY created_at
  `).all();
  assert.deepEqual(audits.map(row => row.context_level), ['CTX-L1', 'CTX-L2', 'CTX-L3']);
  assert.ok(audits.every(row => row.usage_status === 'NOT_EXPOSED' && row.actual_total_tokens === null && row.completed_at));
  assert.throws(
    () => application.database.connection.prepare("UPDATE context_budget_audits SET usage_status='NOT_INVOKED' WHERE context_level='CTX-L1'").run(),
    /CONTEXT_BUDGET_AUDIT_IMMUTABLE/
  );
});

test('visual and controller token budgets fail closed with deterministic error codes', () => {
  assert.equal(MODEL_CONTEXT_POLICIES.VISION_LLM.inputBudgetTokens, 12000);
  assert.equal(MODEL_CONTEXT_POLICIES.CONTROLLER_LLM.inputBudgetTokens, 967232);
  assert.doesNotThrow(() => assertContextBudget('VISION_LLM', 12000));
  assert.throws(
    () => assertContextBudget('VISION_LLM', 12001),
    error => error.errorCode === 'VISION_CONTEXT_BUDGET_EXCEEDED'
  );
  assert.doesNotThrow(() => assertContextBudget('CONTROLLER_LLM', 967232));
  assert.throws(
    () => assertContextBudget('CONTROLLER_LLM', 967233),
    error => error.errorCode === 'CONTROLLER_CONTEXT_BUDGET_EXCEEDED'
  );
});

test('provider-reported visual input above 12K fails the action and is audited', async t => {
  const { application, baseUrl } = await fixture(t);
  await recordLocateCapability(baseUrl);
  const { namespace, compiled } = await createAuthoringPlan(baseUrl, 'overbudget');
  const claimed = await call(baseUrl, '/internal/worker/authoring:claim', {
    workerId: 'worker-i8',
    visualContext: { viewportWidth: 1024, viewportHeight: 520, tokenizerId: 'mimo-v2.5-conservative-v1' }
  }, true);
  const completed = await call(
    baseUrl,
    `/internal/worker/authoring/${compiled.body.taskId}/actions:complete`,
    completionFor(claimed.body, 'VERIFIED_PASSED', {
      status: 'PROVIDER_REPORTED', provider: 'mimo', model: 'mimo-v2.5',
      inputTokens: 12001, outputTokens: 1, totalTokens: 12002
    }),
    true
  );
  assert.equal(completed.body.status, 'WAITING_USER');
  const task = await call(baseUrl, '/v1/plugin/tasks:get', { namespace, taskId: compiled.body.taskId });
  assert.equal(task.body.errorCode, 'VISION_CONTEXT_BUDGET_EXCEEDED');
  const audit = application.database.connection.prepare(`
    SELECT usage_status, actual_input_tokens, actual_total_tokens, completed_at
    FROM context_budget_audits WHERE audit_id = ?
  `).get(claimed.body.contextAuditId);
  assert.equal(audit.usage_status, 'PROVIDER_REPORTED');
  assert.equal(audit.actual_input_tokens, 12001);
  assert.equal(audit.actual_total_tokens, 12002);
  assert.ok(audit.completed_at);
});

test('worker OpenAPI freezes the authoring envelope and completion usage contract', () => {
  const contract = YAML.parse(fs.readFileSync(path.join(productRoot, 'contracts', 'openapi', 'hengzhun-worker-internal-v1.yaml'), 'utf8'));
  const claimSchema = contract.paths['/internal/worker/authoring:claim'].post.responses['200'].content['application/json'].schema;
  assert.ok(Array.isArray(claimSchema.oneOf));
  assert.equal(contract.components.schemas.ActionContextEnvelope.additionalProperties, false);
  assert.equal(contract.components.schemas.AuthoringClaimResponse.additionalProperties, false);
  assert.equal(contract.components.schemas.AuthoringActionCompletionRequest.additionalProperties, false);
  assert.ok(contract.components.schemas.AuthoringActionCompletionRequest.required.includes('modelUsage'));
});
