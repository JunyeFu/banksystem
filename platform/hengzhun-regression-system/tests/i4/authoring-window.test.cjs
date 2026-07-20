'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { startHarness } = require('../../dist/harness/src/server.js');

const productRoot = path.resolve(__dirname, '../..');
const serviceToken = 'synthetic-i4-service-token-000000000001';
const workerToken = 'synthetic-i4-worker-token-000000000002';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i4-'));
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

test('I4 persists the full plan while I8 claims a governed single-action envelope and requires Playwright verification', async t => {
  const { application, baseUrl } = await fixture(t);
  for (const actionType of ['LOCATE', 'INPUT', 'TAP', 'SCROLL']) {
    const capability = await call(baseUrl, '/internal/worker/midscene-capabilities:record', {
      actionType, viewportCount: 5, attemptCount: 15, failureCount: 0, falseSuccessCount: 0,
      verificationRef: `PLAT-V014:${actionType}:sha256:synthetic`
    }, true);
    assert.equal(capability.body.status, 'VERIFIED');
  }
  const namespace = 'i4-authoring';
  const created = await call(baseUrl, '/v1/plugin/cases:create-draft', {
    namespace, idempotencyKey: 'i4-case-create-0001', actorRef: 'coze-agent',
    title: '账户列表作者化', objective: '验证本人账户列表与详情。', summary: 'I4 三动作窗口案例。',
    riskLevel: 'LOW', route: 'customer.accounts -> customer.account.detail', executionProfile: 'ACCOUNT_OWNERSHIP',
    steps: [{ action: '定位账户入口', expected: '入口唯一' }, { action: '打开账户入口', expected: '进入账户页' }, { action: '定位高风险提交', expected: '仅定位' }],
    assertions: ['本人账户详情属于账户列表'], credentialAlias: 'i4-customer',
    authoringActions: [
      { actionType: 'LOCATE', prompt: '定位用户名输入框', targetRef: 'LOGIN_USERNAME', riskLevel: 'LOW' },
      { actionType: 'TAP', prompt: '点击统一身份认证标签', targetRef: 'LOGIN_SSO_TAB', riskLevel: 'MEDIUM' },
      { actionType: 'TAP', prompt: '定位高风险提交按钮但不由模型点击', targetRef: 'LOGIN_SUBMIT', riskLevel: 'HIGH' }
    ]
  });
  assert.equal(created.response.status, 200);
  const compiled = await call(baseUrl, '/v1/plugin/plans:compile', {
    namespace, idempotencyKey: 'i4-plan-compile-0001', caseId: created.body.caseId,
    expectedCaseVersion: 1, executionRoute: 'AUTHORING_REQUIRED'
  });
  assert.equal(compiled.body.planStatus, 'AUTHORING_REQUIRED');
  assert.equal(compiled.body.status, 'QUEUED');
  const persisted = application.database.connection.prepare('SELECT full_action_plan_json FROM plans WHERE plan_id = ?').get(compiled.body.planId);
  assert.equal(JSON.parse(persisted.full_action_plan_json).actions.length, 3);

  for (const expectation of [
    ['MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY', false],
    ['MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY', false],
    ['MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE', true]
  ]) {
    const claimed = await call(baseUrl, '/internal/worker/authoring:claim', {
      workerId: 'worker-i4', visualContext: { viewportWidth: 1024, viewportHeight: 520, tokenizerId: 'mimo-v2.5-conservative-v1' }
    }, true);
    assert.equal(claimed.body.status, 'CLAIMED');
    assert.ok(Date.parse(claimed.body.contextEnvelope.lease.expiresAt) - Date.now() > 300_000,
      'authoring lease must outlive two bounded 120-second model attempts');
    assert.equal(claimed.body.contextEnvelope.currentAction.executionMode, expectation[0]);
    assert.equal(claimed.text.includes('full_action_plan'), false);
    assert.equal(claimed.text.includes('credentialAlias'), false);
    assert.equal(claimed.body.contextEnvelope.contextLevel, 'CTX-L1');
    assert.equal(claimed.body.contextEnvelope.previousActionSummary, null);
    assert.equal(claimed.body.contextEnvelope.nextActionPreview, null);
    const completed = await call(baseUrl, `/internal/worker/authoring/${compiled.body.taskId}/actions:complete`, {
      workerId: 'worker-i4', slotId: claimed.body.slotId, outcome: 'VERIFIED_PASSED',
      contextAuditId: claimed.body.contextAuditId, contextEnvelopeHash: claimed.body.contextEnvelopeHash,
      modelUsage: { status: expectation[0] === 'PLAYWRIGHT_ONLY' ? 'NOT_INVOKED' : 'NOT_EXPOSED' },
      summary: 'Playwright 独立验证通过。', pageState: { route: '/portal/accounts', redacted: true },
      verification: { dom: true, url: true, request: true, business: true }
    }, true);
    assert.equal(completed.body.cursorAdvanced, true);
  }
  const task = await call(baseUrl, '/v1/plugin/tasks:get', { namespace, taskId: compiled.body.taskId });
  assert.equal(task.body.status, 'WAITING_USER');
  assert.equal(task.body.userActionRequired, true);
  const decision = await call(baseUrl, '/v1/plugin/decisions:submit', {
    namespace, idempotencyKey: 'i4-script-activation-0001', targetType: 'SCRIPT_ACTIVATION',
    targetId: compiled.body.scriptId, expectedVersion: 1, choice: 'APPROVE',
    reason: '确认 Playwright 验证证据并激活候选脚本。', confirmationRef: 'coze-user-confirmed-i4'
  });
  assert.equal(decision.body.effect, 'SCRIPT_VALIDATED_AND_PLAN_READY');
  const script = application.database.connection.prepare('SELECT status FROM scripts WHERE script_id = ?').get(compiled.body.scriptId);
  assert.equal(script.status, 'SCRIPT_VALIDATED');
  const activeSlots = application.database.connection.prepare("SELECT COUNT(*) AS count FROM action_execution_slots WHERE status = 'ACTIVE'").get();
  assert.equal(activeSlots.count, 0);
});

test('I4 rejects a Midscene capability when any model call or verification fails', async t => {
  const { baseUrl } = await fixture(t);
  const capability = await call(baseUrl, '/internal/worker/midscene-capabilities:record', {
    actionType: 'TAP', viewportCount: 5, attemptCount: 10, failureCount: 1, falseSuccessCount: 0,
    verificationRef: 'PLAT-V014:TAP:failed-call'
  }, true);
  assert.equal(capability.body.status, 'DEGRADED');
  assert.equal(capability.body.admittedToLowMediumExecution, false);
});

test('I4 degrades unverified Midscene actions to Playwright-only and never advances on ambiguous verification', async t => {
  const { baseUrl } = await fixture(t);
  const namespace = 'i4-fail-closed';
  const created = await call(baseUrl, '/v1/plugin/cases:create-draft', {
    namespace, idempotencyKey: 'i4-case-create-0002', actorRef: 'coze-agent',
    title: '登录恢复作者化', objective: '验证登录恢复。', summary: '未验证能力必须降级。',
    riskLevel: 'LOW', route: 'customer.login -> session.recovery', executionProfile: 'AUTH_REJECTION_RECOVERY',
    steps: [{ action: '定位登录输入框', expected: '唯一元素' }], assertions: ['不会误报成功'],
    credentialAlias: 'i4-customer', authoringActions: [{ actionType: 'INPUT', prompt: '输入合成非敏感文本', targetRef: 'LOGIN_USERNAME', valueRef: 'SYNTHETIC_TEXT', riskLevel: 'LOW' }]
  });
  const compiled = await call(baseUrl, '/v1/plugin/plans:compile', {
    namespace, idempotencyKey: 'i4-plan-compile-0002', caseId: created.body.caseId,
    expectedCaseVersion: 1, executionRoute: 'AUTHORING_REQUIRED'
  });
  const claimed = await call(baseUrl, '/internal/worker/authoring:claim', {
    workerId: 'worker-i4', visualContext: { viewportWidth: 1024, viewportHeight: 520, tokenizerId: 'mimo-v2.5-conservative-v1' }
  }, true);
  assert.equal(claimed.body.contextEnvelope.currentAction.executionMode, 'PLAYWRIGHT_ONLY');
  const completed = await call(baseUrl, `/internal/worker/authoring/${compiled.body.taskId}/actions:complete`, {
    workerId: 'worker-i4', slotId: claimed.body.slotId, outcome: 'AMBIGUOUS', summary: '候选元素不唯一。',
    contextAuditId: claimed.body.contextAuditId, contextEnvelopeHash: claimed.body.contextEnvelopeHash,
    modelUsage: { status: 'NOT_INVOKED' },
    pageState: { redacted: true }, verification: { dom: false, url: true, request: true, business: true }
  }, true);
  assert.equal(completed.body.cursorAdvanced, false);
  assert.equal(completed.body.status, 'WAITING_USER');
});
