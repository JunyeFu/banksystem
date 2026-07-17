'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { startHarness } = require('../../dist/harness/src/server.js');

const productRoot = path.resolve(__dirname, '../..');
const token = 'local-i2-acceptance-token-not-a-secret-0001';
const retiredToken = 'local-i2-retired-token-not-a-secret-0000';

async function startTemporaryHarness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i2-api-'));
  const running = await startHarness({
    productRoot,
    databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'),
    security: { serviceToken: token, allowedClients: ['127.0.0.1', '::1'] },
    host: '127.0.0.1',
    port: 0
  });
  const address = running.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolve => running.server.close(resolve));
    await running.application.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { ...running, root, baseUrl };
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return { response, text, body: text ? JSON.parse(text) : undefined };
}

test('PLAT-V005 rejects missing, wrong and rotated tokens without leaking credentials', async t => {
  const { application, baseUrl } = await startTemporaryHarness(t);
  const health = await fetch(baseUrl + '/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).database.engine, 'sqlite');

  for (const authorization of [undefined, 'Bearer wrong-token', `Bearer ${retiredToken}`]) {
    const response = await fetch(baseUrl + '/v1/tasks/task-any?namespace=demo-local', {
      headers: authorization ? { authorization } : {}
    });
    assert.equal(response.status, 401);
    const text = await response.text();
    assert.equal(text.includes(token), false);
    assert.equal(text.includes(retiredToken), false);
    assert.equal(JSON.parse(text).errorCode, 'INVALID_SERVICE_TOKEN');
  }
  const events = application.database.connection.prepare('SELECT outcome, reason_code, credential_fingerprint FROM security_events ORDER BY sequence').all();
  assert.equal(events.filter(event => event.outcome === 'REJECTED').length, 3);
  assert.ok(events.every(event => !JSON.stringify(event).includes(token) && !JSON.stringify(event).includes(retiredToken)));
});

test('seven-tool contract persists authoritative state and enforces idempotency/namespace isolation', async t => {
  const { application, baseUrl, root } = await startTemporaryHarness(t);
  const namespace = 'demo-local';
  const caseInput = {
    namespace,
    idempotencyKey: 'case-create-0001',
    actorRef: 'coze-agent',
    title: '门户登录资料一致性',
    objective: '验证账号密码登录后姓名和头像来自当前账户。',
    summary: '登录并校验右上角资料。',
    riskLevel: 'LOW',
    route: '/portal/login',
    steps: [{ action: '输入凭据别名并登录', expected: '进入门户仪表盘' }],
    assertions: ['右上角姓名与个人资料姓名一致'],
    credentialAlias: 'customer-demo-01'
  };
  const created = await request(baseUrl, '/v1/cases/drafts', { method: 'POST', body: JSON.stringify(caseInput) });
  assert.equal(created.response.status, 200);
  assert.equal(created.response.headers.get('x-hengzhun-output-level'), 'L1');
  assert.equal(created.body.replayed, false);
  const caseId = created.body.caseId;

  const replay = await request(baseUrl, '/v1/cases/drafts', { method: 'POST', body: JSON.stringify(caseInput) });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.caseId, caseId);
  assert.equal(replay.body.replayed, true);
  const conflict = await request(baseUrl, '/v1/cases/drafts', {
    method: 'POST', body: JSON.stringify({ ...caseInput, title: '不同请求' })
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.errorCode, 'IDEMPOTENCY_CONFLICT');

  const detail = await request(baseUrl, `/v1/cases/${caseId}?namespace=${namespace}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.response.headers.get('x-hengzhun-output-level'), 'L2');
  assert.equal(detail.body.definition.credentialAlias, 'customer-demo-01');
  const isolated = await request(baseUrl, `/v1/cases/${caseId}?namespace=other-space`);
  assert.equal(isolated.response.status, 404);

  const compiled = await request(baseUrl, `/v1/cases/${caseId}/plans:compile`, {
    method: 'POST',
    body: JSON.stringify({ namespace, idempotencyKey: 'plan-compile-0001', expectedCaseVersion: 1, executionRoute: 'PLAYWRIGHT' })
  });
  assert.equal(compiled.response.status, 200);
  assert.equal(compiled.body.status, 'SUCCEEDED');
  const planTask = await request(baseUrl, `/v1/tasks/${compiled.body.taskId}?namespace=${namespace}`);
  assert.equal(planTask.response.status, 200);
  assert.equal(planTask.response.headers.get('x-hengzhun-output-level'), 'L0');
  assert.equal(planTask.body.status, 'SUCCEEDED');

  const run = await request(baseUrl, '/v1/runs', {
    method: 'POST',
    body: JSON.stringify({
      namespace, idempotencyKey: 'run-submit-0001', caseId, expectedCaseVersion: 1,
      planId: compiled.body.planId, environment: 'local', credentialAlias: 'customer-demo-01'
    })
  });
  assert.equal(run.response.status, 200);
  assert.equal(run.body.status, 'QUEUED');
  const runTask = await request(baseUrl, `/v1/tasks/${run.body.taskId}?namespace=${namespace}`);
  assert.equal(runTask.body.runId, run.body.runId);

  const artifact = await application.service.artifacts.create({
    namespace,
    runId: run.body.runId,
    taskId: run.body.taskId,
    artifactType: 'REPORT',
    mediaType: 'application/json',
    redactionStatus: 'REDACTED',
    extension: 'json',
    content: JSON.stringify({ status: 'synthetic', account: '[REDACTED]' }),
    metadata: { purpose: 'I2 contract validation' }
  });
  const metadata = await request(baseUrl, `/v1/artifacts/${artifact.artifactId}/metadata?namespace=${namespace}`);
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.response.headers.get('x-hengzhun-output-level'), 'L3');
  assert.equal(metadata.body.sha256, artifact.sha256);
  assert.equal(JSON.stringify(metadata.body).includes(root), false);
  assert.equal('relativePath' in metadata.body, false);

  const decision = await request(baseUrl, '/v1/decisions', {
    method: 'POST',
    body: JSON.stringify({
      namespace, idempotencyKey: 'decision-0001', targetType: 'RUN_RECOVERY', targetId: run.body.runId,
      expectedVersion: 1, choice: 'CANCEL', reason: 'I2 协议验收，不执行 Worker。', confirmationRef: 'conversation-confirmation-1'
    })
  });
  assert.equal(decision.response.status, 200);
  assert.equal(decision.body.status, 'RECORDED');
  assert.equal(decision.body.effect, 'DEFERRED_TO_FUTURE_BATCH');

  const counts = Object.fromEntries(
    ['cases', 'plans', 'tasks', 'runs', 'decisions', 'artifacts', 'audit_events', 'idempotency_keys']
      .map(table => [table, application.database.connection.prepare(`SELECT count(*) AS count FROM ${table}`).get().count])
  );
  assert.deepEqual(counts, { cases: 1, plans: 1, tasks: 2, runs: 1, decisions: 1, artifacts: 1, audit_events: 4, idempotency_keys: 4 });
  assert.deepEqual(application.database.integrityCheck(), ['ok']);
});

test('request schemas fail closed and responses stay inside assigned budgets', async t => {
  const { baseUrl } = await startTemporaryHarness(t);
  const invalid = await request(baseUrl, '/v1/cases/drafts', {
    method: 'POST',
    body: JSON.stringify({ namespace: 'INVALID SPACE', idempotencyKey: 'short' })
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.errorCode, 'SCHEMA_VALIDATION_FAILED');
  assert.ok(Number(invalid.response.headers.get('x-hengzhun-output-bytes')) <= 8192);
  assert.equal(invalid.text.includes('authorization'), false);
});
