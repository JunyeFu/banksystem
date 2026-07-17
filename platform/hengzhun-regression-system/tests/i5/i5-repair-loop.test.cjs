'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { startHarness } = require('../../dist/harness/src/server.js');

const productRoot = path.resolve(__dirname, '../..');
const serviceToken = 'synthetic-i5-service-token-000000000001';
const workerToken = 'synthetic-i5-worker-token-000000000002';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i5-'));
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

function evidence(type, content = '{}') {
  const types = {
    REPORT: ['application/json', 'json'],
    SCREENSHOT: ['image/png', 'png'],
    LOG: ['text/plain', 'log'],
    DIAGNOSTIC: ['application/json', 'json']
  };
  return {
    artifactType: type,
    mediaType: types[type][0],
    redactionStatus: 'REDACTED',
    extension: types[type][1],
    base64Content: Buffer.from(content).toString('base64'),
    metadata: { containsCredentials: false }
  };
}

test('I5 imports structured cases and activates an isolated locator repair only after user decision', async t => {
  const { application, baseUrl } = await fixture(t);
  const namespace = 'i5-repair-loop';
  const imported = await call(baseUrl, '/v1/plugin/cases:import', {
    namespace,
    idempotencyKey: 'i5-import-batch-0001',
    actorRef: 'coze-agent',
    sourceFormat: 'HENGZHUN_JSON_V1',
    sourceRef: 'external-suite:portal-smoke:v1',
    cases: [{
      externalCaseRef: 'PORTAL-LOGIN-001',
      title: '门户登录资料一致性',
      objective: '验证登录后的用户资料一致。',
      summary: '结构化导入的登录案例。',
      riskLevel: 'LOW',
      route: '/portal/login -> /portal/profile',
      executionProfile: 'LOGIN_PROFILE',
      steps: [{ action: '登录门户', expected: '显示当前用户资料' }],
      assertions: ['页眉姓名与个人资料姓名一致']
    }]
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.body.itemCount, 1);
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) AS count FROM case_import_batches').get().count, 1);

  const caseId = imported.body.imported[0].caseId;
  const compiled = await call(baseUrl, '/v1/plugin/plans:compile', {
    namespace, idempotencyKey: 'i5-plan-compile-0001', caseId,
    expectedCaseVersion: 1, executionRoute: 'PLAYWRIGHT'
  });
  const run = await call(baseUrl, '/v1/plugin/runs:submit', {
    namespace, idempotencyKey: 'i5-run-submit-0001', caseId,
    expectedCaseVersion: 1, planId: compiled.body.planId,
    environment: 'local', credentialAlias: 'customer-synthetic-01'
  });
  const claimed = await call(baseUrl, '/internal/worker/tasks:claim', { workerId: 'worker-i5' }, true);
  assert.equal(claimed.body.status, 'CLAIMED');
  const failed = await call(baseUrl, `/internal/worker/tasks/${run.body.taskId}:complete`, {
    workerId: 'worker-i5', outcome: 'FAILED', summary: '用户名输入框定位器失效。',
    errorCode: 'LOGIN_USERNAME_LOCATOR_NOT_FOUND', errorCategory: 'TEST_FAILURE',
    retryable: false, userActionRequired: true,
    evidence: [evidence('DIAGNOSTIC')]
  }, true);
  assert.equal(failed.body.status, 'FAILED');
  assert.ok(failed.body.incidentId);
  const quarantinedRun = await call(baseUrl, '/v1/plugin/runs:submit', {
    namespace, idempotencyKey: 'i5-run-quarantined-0001', caseId,
    expectedCaseVersion: 1, planId: compiled.body.planId,
    environment: 'local', credentialAlias: 'customer-synthetic-01'
  });
  assert.equal(quarantinedRun.response.status, 409);
  assert.equal(quarantinedRun.body.errorCode, 'SCRIPT_NOT_VALIDATED');

  const incident = await call(baseUrl, '/v1/plugin/failures:get', { namespace, incidentId: failed.body.incidentId });
  assert.equal(incident.body.classification, 'LOCATOR');
  assert.equal(incident.body.diagnosticStatus, 'CLASSIFIED');

  const candidate = await call(baseUrl, '/v1/plugin/repairs:create-candidate', {
    namespace, idempotencyKey: 'i5-repair-create-0001', incidentId: failed.body.incidentId,
    credentialAlias: 'customer-synthetic-01'
  });
  assert.equal(candidate.body.status, 'VALIDATION_QUEUED');
  const scriptBefore = application.database.connection.prepare('SELECT current_version FROM scripts WHERE script_id = ?')
    .get(compiled.body.scriptId).current_version;
  assert.equal(scriptBefore, 1, 'candidate creation must not activate a script');

  const repairJob = await call(baseUrl, '/internal/worker/repairs:claim', { workerId: 'worker-i5' }, true);
  assert.equal(repairJob.body.status, 'CLAIMED');
  assert.equal(repairJob.body.execution.isolationMode, 'FRESH_BROWSER_CONTEXT_NO_COMMIT');
  assert.equal(repairJob.body.execution.selectorOverrides.LOGIN_USERNAME, '[data-testid="login-username"]');
  const validated = await call(baseUrl, `/internal/worker/repairs/${repairJob.body.jobId}:complete`, {
    workerId: 'worker-i5', outcome: 'PASSED', summary: '隔离 Playwright 验证通过。',
    evidence: [evidence('REPORT'), evidence('SCREENSHOT', 'synthetic-png'), evidence('LOG', 'PASS')]
  }, true);
  assert.equal(validated.body.status, 'WAITING_USER');
  assert.equal(application.database.connection.prepare('SELECT current_version FROM scripts WHERE script_id = ?')
    .get(compiled.body.scriptId).current_version, 1, 'validation must not auto-activate a script');

  const ready = await call(baseUrl, '/v1/plugin/repairs:get-candidate', {
    namespace, candidateId: candidate.body.candidateId
  });
  assert.equal(ready.body.activationRequired, true);
  assert.equal(ready.body.status, 'WAITING_USER');
  const decision = await call(baseUrl, '/v1/plugin/decisions:submit', {
    namespace, idempotencyKey: 'i5-repair-decision-0001',
    targetType: 'REPAIR_CANDIDATE_ACTIVATION', targetId: candidate.body.candidateId,
    expectedVersion: ready.body.version, choice: 'APPROVE',
    reason: '用户在 Coze 中核对差异、验证证据和风险后确认。',
    confirmationRef: 'coze-conversation:i5-demo:turn-42'
  });
  assert.equal(decision.body.effect, 'REPAIR_CANDIDATE_ACTIVATED');
  const active = application.database.connection.prepare(`
    SELECT s.current_version, sv.configuration_json, sv.validation_status
    FROM scripts s JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
    WHERE s.script_id = ?
  `).get(compiled.body.scriptId);
  assert.equal(active.current_version, 2);
  assert.equal(active.validation_status, 'PASSED');
  assert.equal(JSON.parse(active.configuration_json).LOGIN_USERNAME, '[data-testid="login-username"]');
  const recompiled = await call(baseUrl, '/v1/plugin/plans:compile', {
    namespace, idempotencyKey: 'i5-plan-compile-after-repair-0001', caseId,
    expectedCaseVersion: 1, executionRoute: 'PLAYWRIGHT'
  });
  assert.equal(recompiled.response.status, 200);
  assert.notEqual(recompiled.body.planId, compiled.body.planId);
  assert.equal(recompiled.body.scriptId, compiled.body.scriptId);
  assert.equal(recompiled.body.planVersion, 2);
  assert.deepEqual(
    application.database.connection.prepare(`
      SELECT version FROM plans WHERE namespace = ? AND case_id = ? AND case_version = 1 ORDER BY version
    `).all(namespace, caseId).map(row => row.version),
    [1, 2]
  );
  assert.equal(application.database.connection.prepare('SELECT diagnostic_status FROM failure_incidents WHERE incident_id = ?')
    .get(failed.body.incidentId).diagnostic_status, 'RESOLVED');
  assert.throws(() => application.database.connection.prepare('DELETE FROM repair_activation_decisions WHERE decision_id = ?')
    .run(decision.body.decisionId), /REPAIR_DECISION_IMMUTABLE/);
});

test('I5 rejects duplicate external references before writing an import batch', async t => {
  const { application, baseUrl } = await fixture(t);
  const template = {
    title: '重复案例', objective: '验证契约。', summary: '重复引用。', riskLevel: 'LOW', route: '/portal/login',
    executionProfile: 'LOGIN_PROFILE', steps: [{ action: '打开', expected: '成功' }], assertions: ['成功']
  };
  const result = await call(baseUrl, '/v1/plugin/cases:import', {
    namespace: 'i5-import-validation', idempotencyKey: 'i5-import-invalid-0001',
    sourceFormat: 'HENGZHUN_JSON_V1', sourceRef: 'duplicate-suite',
    cases: [{ externalCaseRef: 'DUP-1', ...template }, { externalCaseRef: 'DUP-1', ...template }]
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.errorCode, 'SCHEMA_VALIDATION_FAILED');
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) AS count FROM case_import_batches').get().count, 0);
});
