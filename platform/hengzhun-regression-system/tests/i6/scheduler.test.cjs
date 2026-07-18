'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { startHarness } = require('../../dist/harness/src/server.js');
const { nextCronOccurrence, parseCron, validateTimeZone } = require('../../dist/harness/src/cron.js');

const productRoot = path.resolve(__dirname, '../..');
const serviceToken = 'synthetic-i6-service-token-000000000001';
const workerToken = 'synthetic-i6-worker-token-000000000002';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i6-'));
  const running = await startHarness({
    productRoot,
    databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0
  });
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => running.server.close(resolve));
    await running.application.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { ...running, baseUrl, root };
}

async function call(baseUrl, pathname, body, worker = false) {
  const response = await fetch(baseUrl + pathname, {
    method: 'POST',
    headers: { authorization: `Bearer ${worker ? workerToken : serviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return { response, body: JSON.parse(text) };
}

async function runnableCase(baseUrl, namespace, suffix = '1') {
  const created = await call(baseUrl, '/v1/plugin/cases:create-draft', {
    namespace, idempotencyKey: `i6-case-${suffix}-0001`, actorRef: 'coze-agent',
    title: `I6 调度案例 ${suffix}`, objective: '验证确定性调度执行。', summary: '合成调度案例。',
    riskLevel: 'LOW', route: '/portal/login -> /portal/profile', executionProfile: 'LOGIN_PROFILE',
    steps: [{ action: '登录门户', expected: '显示资料' }], assertions: ['姓名一致']
  });
  assert.equal(created.response.status, 200);
  const compiled = await call(baseUrl, '/v1/plugin/plans:compile', {
    namespace, idempotencyKey: `i6-plan-${suffix}-0001`, caseId: created.body.caseId,
    expectedCaseVersion: 1, executionRoute: 'PLAYWRIGHT'
  });
  assert.equal(compiled.response.status, 200);
  return { caseId: created.body.caseId, planId: compiled.body.planId };
}

async function createSchedule(baseUrl, namespace, refs, suffix, fixtureScope = 'portal-login') {
  const response = await call(baseUrl, '/v1/plugin/schedules:create', {
    namespace, idempotencyKey: `i6-schedule-${suffix}-0001`, ...refs, expectedCaseVersion: 1,
    credentialAlias: 'synthetic/customer', cronExpression: '* * * * *', timezone: 'Asia/Shanghai',
    environment: 'local', fixtureScope, misfirePolicy: 'RUN_ONCE', misfireGraceSeconds: 5, maxRetries: 1
  });
  assert.equal(response.response.status, 200);
  return response.body;
}

function evidence(type, content = '{}') {
  const mapping = { REPORT: ['application/json', 'json'], SCREENSHOT: ['image/png', 'png'], LOG: ['text/plain', 'log'] };
  return {
    artifactType: type, mediaType: mapping[type][0], redactionStatus: 'REDACTED', extension: mapping[type][1],
    base64Content: Buffer.from(content).toString('base64'), metadata: { synthetic: true }
  };
}

test('I6 cron uses five fields and explicit IANA timezone', () => {
  assert.doesNotThrow(() => parseCron('*/15 9-17 * * 1-5'));
  assert.throws(() => parseCron('* * * *'));
  assert.doesNotThrow(() => validateTimeZone('Asia/Shanghai'));
  assert.throws(() => validateTimeZone('Invalid/Zone'));
  const next = nextCronOccurrence('0 9 * * 1-5', 'Asia/Shanghai', new Date('2026-07-17T01:01:00.000Z'));
  assert.equal(next.toISOString(), '2026-07-20T01:00:00.000Z');
});

test('I6 queues validated Playwright only, coalesces misfires and enforces mutex', async t => {
  const { application, baseUrl } = await fixture(t);
  const namespace = 'i6-scheduler-core';
  const refs = await runnableCase(baseUrl, namespace);
  const first = await createSchedule(baseUrl, namespace, refs, 'core-a');
  const second = await createSchedule(baseUrl, namespace, refs, 'core-b');
  const due = new Date('2026-07-18T00:00:00.000Z');
  application.database.connection.prepare(`UPDATE schedules SET next_fire_at = '2026-07-17T23:55:00.000Z'`).run();
  const tick = await application.service.tickSchedules(due);
  assert.equal(tick.queued, 1);
  assert.equal(tick.skippedMutex, 1);
  assert.ok(tick.skippedMisfire >= 8);
  const task = application.database.connection.prepare(`SELECT payload_json FROM tasks WHERE task_type = 'RUN_EXECUTE'`).get();
  const payload = JSON.parse(task.payload_json);
  assert.equal(payload.executionEngine, 'PLAYWRIGHT');
  assert.equal(payload.formalRegression, true);
  assert.equal(payload.fixtureScope, 'portal-login');
  assert.equal(/llm|midscene|vision/i.test(task.payload_json), false);
  assert.equal(application.database.connection.prepare(`SELECT COUNT(*) count FROM schedule_executions WHERE status = 'QUEUED'`).get().count, 1);
  assert.equal(application.database.connection.prepare(`SELECT COUNT(*) count FROM schedule_executions WHERE status = 'SKIPPED_MUTEX'`).get().count, 1);
  assert.equal(application.database.connection.prepare(`SELECT COUNT(*) count FROM schedules WHERE schedule_id IN (?, ?)`).get(first.scheduleId, second.scheduleId).count, 2);
});

test('I6 retries transient infrastructure once, pauses on final failure and resumes only by confirmed decision', async t => {
  const { application, baseUrl } = await fixture(t);
  const namespace = 'i6-failure-recovery';
  const refs = await runnableCase(baseUrl, namespace, 'failure');
  const schedule = await createSchedule(baseUrl, namespace, refs, 'failure', 'portal-failure');
  application.database.connection.prepare(`UPDATE schedules SET next_fire_at = '2026-07-18T00:00:00.000Z' WHERE schedule_id = ?`).run(schedule.scheduleId);
  await application.service.tickSchedules(new Date('2026-07-18T00:00:01.000Z'));
  const claimed = await call(baseUrl, '/internal/worker/tasks:claim', { workerId: 'i6-worker' }, true);
  assert.equal(claimed.body.status, 'CLAIMED');
  const retry = await call(baseUrl, `/internal/worker/tasks/${claimed.body.taskId}:complete`, {
    workerId: 'i6-worker', outcome: 'BLOCKED', summary: '合成瞬态环境故障', errorCode: 'BROWSER_TEMPORARILY_UNAVAILABLE',
    errorCategory: 'ENVIRONMENT', retryable: true, userActionRequired: false, evidence: [evidence('LOG', 'synthetic')]
  }, true);
  assert.equal(retry.body.retryScheduled, true);
  const claimedAgain = await call(baseUrl, '/internal/worker/tasks:claim', { workerId: 'i6-worker' }, true);
  assert.equal(claimedAgain.body.taskId, claimed.body.taskId);
  const failed = await call(baseUrl, `/internal/worker/tasks/${claimed.body.taskId}:complete`, {
    workerId: 'i6-worker', outcome: 'FAILED', summary: '合成断言失败', errorCode: 'PROFILE_ASSERTION_MISMATCH',
    errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: true, evidence: [evidence('REPORT')]
  }, true);
  assert.equal(failed.body.status, 'FAILED');
  const paused = await call(baseUrl, '/v1/plugin/schedules:get', { namespace, scheduleId: schedule.scheduleId });
  assert.equal(paused.body.status, 'PAUSED_FAILURE');
  assert.ok(paused.body.pausedIncidentId);
  const wrong = await call(baseUrl, '/v1/plugin/decisions:submit', {
    namespace, idempotencyKey: 'i6-resume-wrong-0001', targetType: 'SCHEDULE_RECOVERY',
    targetId: schedule.scheduleId, expectedVersion: paused.body.version - 1, choice: 'APPROVE', reason: '错误版本', confirmationRef: 'user-confirmation-i6'
  });
  assert.equal(wrong.response.status, 409);
  const resumed = await call(baseUrl, '/v1/plugin/decisions:submit', {
    namespace, idempotencyKey: 'i6-resume-ok-000001', targetType: 'SCHEDULE_RECOVERY', targetId: schedule.scheduleId,
    expectedVersion: paused.body.version, choice: 'APPROVE', reason: '用户确认环境恢复', confirmationRef: 'user-confirmation-i6'
  });
  assert.equal(resumed.body.effect, 'SCHEDULE_RESUMED');
  const active = await call(baseUrl, '/v1/plugin/schedules:get', { namespace, scheduleId: schedule.scheduleId });
  assert.equal(active.body.status, 'ACTIVE');
  assert.equal(application.database.connection.prepare('SELECT COUNT(*) count FROM schedule_recovery_decisions').get().count, 1);
});

test('I6 recovers due work after restart without duplicate execution', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i6-restart-'));
  const options = {
    productRoot, databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'), backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0
  };
  let running = await startHarness(options);
  let baseUrl = `http://127.0.0.1:${running.server.address().port}`;
  const namespace = 'i6-restart';
  const refs = await runnableCase(baseUrl, namespace, 'restart');
  const schedule = await createSchedule(baseUrl, namespace, refs, 'restart', 'restart-scope');
  running.application.database.connection.prepare(`UPDATE schedules SET next_fire_at = '2026-07-18T00:00:00.000Z' WHERE schedule_id = ?`).run(schedule.scheduleId);
  await new Promise(resolve => running.server.close(resolve));
  await running.application.close();

  running = await startHarness(options);
  baseUrl = `http://127.0.0.1:${running.server.address().port}`;
  await running.application.service.tickSchedules(new Date('2026-07-18T00:00:01.000Z'));
  await running.application.service.tickSchedules(new Date('2026-07-18T00:00:01.000Z'));
  assert.equal(running.application.database.connection.prepare(`SELECT COUNT(*) count FROM schedule_executions WHERE status = 'QUEUED'`).get().count, 1);
  assert.equal(running.application.database.connection.prepare(`SELECT COUNT(*) count FROM tasks WHERE task_type = 'RUN_EXECUTE'`).get().count, 1);
  await new Promise(resolve => running.server.close(resolve));
  await running.application.close();
  fs.rmSync(root, { recursive: true, force: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
});
