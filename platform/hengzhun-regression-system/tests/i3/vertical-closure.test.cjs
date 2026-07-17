'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { startHarness } = require('../../dist/harness/src/server.js');
const { resolveCredential } = require('../../worker/src/login-profile.cjs');

const productRoot = path.resolve(__dirname, '../..');
const serviceToken = 'synthetic-i3-service-token-000000000001';
const workerToken = 'synthetic-i3-worker-token-000000000002';

async function startTemporaryHarness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i3-'));
  const running = await startHarness({
    productRoot,
    databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken,
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

async function request(baseUrl, pathname, { worker = false, ...options } = {}) {
  const response = await fetch(baseUrl + pathname, {
    ...options,
    headers: {
      authorization: `Bearer ${worker ? workerToken : serviceToken}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return { response, text, body: text ? JSON.parse(text) : undefined };
}

async function createRunnableCase(baseUrl, namespace) {
  const created = await request(baseUrl, '/v1/cases/drafts', {
    method: 'POST',
    body: JSON.stringify({
      namespace,
      idempotencyKey: 'i3-case-create-0001',
      actorRef: 'coze-agent',
      title: '门户登录资料一致性',
      objective: '验证账号密码登录后的姓名与头像属于当前账户。',
      summary: '合成身份登录并核对个人资料。',
      riskLevel: 'LOW',
      route: '/portal/login',
      steps: [{ action: '使用凭据别名登录', expected: '进入门户首页' }],
      assertions: ['右上角姓名和头像与个人资料一致'],
      credentialAlias: 'customer-synthetic-01',
      knowledgeRetrieval: {
        sourceAuthority: 'COZE_KNOWLEDGE_BASE',
        query: '首条门户登录回归案例的断言是什么？',
        resultSummary: '使用凭据别名登录，并核对页眉身份与个人资料。',
        citationRefs: ['kb:i3-login-profile:v1#identity-consistency']
      }
    })
  });
  assert.equal(created.response.status, 200);
  const compiled = await request(baseUrl, `/v1/cases/${created.body.caseId}/plans:compile`, {
    method: 'POST',
    body: JSON.stringify({
      namespace,
      idempotencyKey: 'i3-plan-compile-0001',
      expectedCaseVersion: 1,
      executionRoute: 'PLAYWRIGHT'
    })
  });
  assert.equal(compiled.response.status, 200);
  const run = await request(baseUrl, '/v1/runs', {
    method: 'POST',
    body: JSON.stringify({
      namespace,
      idempotencyKey: 'i3-run-submit-0001',
      caseId: created.body.caseId,
      expectedCaseVersion: 1,
      planId: compiled.body.planId,
      environment: 'local',
      credentialAlias: 'customer-synthetic-01'
    })
  });
  assert.equal(run.response.status, 200);
  return { created, compiled, run };
}

test('I3 seven-tool state survives a new polling session and records Coze knowledge hashes', async t => {
  const { application, baseUrl, root } = await startTemporaryHarness(t);
  const namespace = 'i3-acceptance';
  const { created, compiled, run } = await createRunnableCase(baseUrl, namespace);

  const caseRead = await request(baseUrl, `/v1/cases/${created.body.caseId}?namespace=${namespace}`);
  assert.equal(caseRead.response.status, 200);
  assert.equal(caseRead.body.definition.credentialAlias, 'customer-synthetic-01');

  const claim = await request(baseUrl, '/internal/worker/tasks:claim', {
    worker: true,
    method: 'POST',
    body: JSON.stringify({ workerId: 'worker-i3-test' })
  });
  assert.equal(claim.response.status, 200);
  assert.equal(claim.body.status, 'CLAIMED');
  assert.equal(claim.body.execution.credentialAlias, 'customer-synthetic-01');
  assert.match(claim.body.execution.fixtureNamespace, /^fx-[a-f0-9]{20}$/);
  assert.equal(claim.text.includes('synthetic-user'), false);
  assert.equal(claim.text.includes('synthetic-password'), false);

  const report = Buffer.from(JSON.stringify({ schemaVersion: 'i3-evidence-v1', passed: true }));
  const screenshot = Buffer.from('synthetic-redacted-screenshot');
  const log = Buffer.from('PASS portal-login\nPASS identity-consistency\n');
  const complete = await request(baseUrl, `/internal/worker/tasks/${run.body.taskId}:complete`, {
    worker: true,
    method: 'POST',
    body: JSON.stringify({
      workerId: 'worker-i3-test',
      outcome: 'PASSED',
      summary: '门户登录与资料一致性断言通过。',
      evidence: [
        { artifactType: 'REPORT', mediaType: 'application/json', redactionStatus: 'REDACTED', extension: 'json', base64Content: report.toString('base64'), metadata: { containsCredentials: false } },
        { artifactType: 'SCREENSHOT', mediaType: 'image/png', redactionStatus: 'REDACTED', extension: 'png', base64Content: screenshot.toString('base64'), metadata: { masked: true } },
        { artifactType: 'LOG', mediaType: 'text/plain', redactionStatus: 'REDACTED', extension: 'log', base64Content: log.toString('base64'), metadata: { containsCredentials: false } }
      ]
    })
  });
  assert.equal(complete.response.status, 200);
  assert.equal(complete.body.outcome, 'PASSED');

  // A fresh stateless request represents recovery after the Coze conversation was interrupted.
  const recovered = await request(baseUrl, `/v1/tasks/${run.body.taskId}?namespace=${namespace}`);
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.status, 'SUCCEEDED');
  assert.equal(recovered.body.runVersion, 3);
  assert.equal(recovered.body.resultArtifactId, complete.body.resultArtifactId);

  const metadata = await request(baseUrl, `/v1/artifacts/${complete.body.resultArtifactId}/metadata?namespace=${namespace}`);
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.body.sha256, crypto.createHash('sha256').update(report).digest('hex'));
  assert.equal(metadata.text.includes(root), false);
  assert.equal(metadata.body.controlledAccess.downloadable, false);

  const decision = await request(baseUrl, '/v1/decisions', {
    method: 'POST',
    body: JSON.stringify({
      namespace,
      idempotencyKey: 'i3-decision-0001',
      targetType: 'RUN_RECOVERY',
      targetId: run.body.runId,
      expectedVersion: recovered.body.runVersion,
      choice: 'APPROVE',
      reason: '确认首个合成数据纵向闭环结果。',
      confirmationRef: 'coze-conversation-confirmation-i3'
    })
  });
  assert.equal(decision.response.status, 200);

  const retrieval = application.database.connection.prepare('SELECT * FROM knowledge_retrieval_events').get();
  assert.equal(retrieval.source_authority, 'COZE_KNOWLEDGE_BASE');
  assert.match(retrieval.query_hash, /^[a-f0-9]{64}$/);
  assert.match(retrieval.result_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(retrieval).includes('首条门户登录'), false);
  assert.deepEqual(JSON.parse(retrieval.citation_refs_json), ['kb:i3-login-profile:v1#identity-consistency']);

  const actions = application.database.connection.prepare('SELECT action FROM audit_events ORDER BY created_at').all().map(row => row.action);
  for (const expected of ['case_create_draft', 'plan_compile', 'run_submit', 'run.claim', 'run.complete', 'decision_submit']) {
    assert.ok(actions.includes(expected), `missing audit action ${expected}`);
  }
  assert.equal(compiled.body.status, 'SUCCEEDED');
});

test('I3 worker channel is separate and rejects incomplete passing evidence', async t => {
  const { baseUrl } = await startTemporaryHarness(t);
  const { run } = await createRunnableCase(baseUrl, 'i3-worker-auth');

  const publicTokenClaim = await request(baseUrl, '/internal/worker/tasks:claim', {
    method: 'POST', body: JSON.stringify({ workerId: 'worker-i3-test' })
  });
  assert.equal(publicTokenClaim.response.status, 403);
  assert.equal(publicTokenClaim.body.errorCode, 'WORKER_AUTH_REJECTED');

  const claim = await request(baseUrl, '/internal/worker/tasks:claim', {
    worker: true, method: 'POST', body: JSON.stringify({ workerId: 'worker-i3-test' })
  });
  assert.equal(claim.body.taskId, run.body.taskId);

  const incomplete = await request(baseUrl, `/internal/worker/tasks/${run.body.taskId}:complete`, {
    worker: true,
    method: 'POST',
    body: JSON.stringify({
      workerId: 'worker-i3-test',
      outcome: 'PASSED',
      summary: '证据不足的伪通过。',
      evidence: [{ artifactType: 'REPORT', mediaType: 'application/json', redactionStatus: 'REDACTED', extension: 'json', base64Content: Buffer.from('{}').toString('base64') }]
    })
  });
  assert.equal(incomplete.response.status, 400);
  assert.equal(incomplete.body.errorCode, 'EVIDENCE_INCOMPLETE');
});

test('I3 credential alias resolves only inside worker memory and fails closed', () => {
  const environment = {
    HENGZHUN_CREDENTIAL_CUSTOMER_SYNTHETIC_01_USERNAME: 'synthetic-user',
    HENGZHUN_CREDENTIAL_CUSTOMER_SYNTHETIC_01_PASSWORD: 'synthetic-password'
  };
  assert.deepEqual(resolveCredential('customer-synthetic-01', environment), {
    username: 'synthetic-user',
    password: 'synthetic-password'
  });
  assert.throws(() => resolveCredential('missing-alias', {}), error => {
    assert.equal(error.code, 'CREDENTIAL_ALIAS_UNAVAILABLE');
    assert.equal(error.category, 'ENVIRONMENT');
    assert.equal(String(error.message).includes('missing-alias'), false);
    return true;
  });
});
