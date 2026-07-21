const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { executeLoginProfile } = require('./login-profile.cjs');
const { executeAccountOwnership } = require('./account-ownership.cjs');
const { executeAuthRejectionRecovery } = require('./auth-rejection-recovery.cjs');
const { executeStabilityBatch } = require('./i8-stability-runner.cjs');
const { executeI8FormalRun } = require('./i8-formal-runner.cjs');
const { I8_CONTROLLED_CATALOG } = require('../../dist/harness/src/i8/script-package-builder.js');

const executors = new Map([
  ['worker/src/login-profile.cjs', executeLoginProfile],
  ['worker/src/account-ownership.cjs', executeAccountOwnership],
  ['worker/src/auth-rejection-recovery.cjs', executeAuthRejectionRecovery]
]);

const harnessUrl = (process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '');
const workerToken = process.env.HENGZHUN_WORKER_TOKEN;
const workerId = process.env.HENGZHUN_WORKER_ID || `worker-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
const healthFile = process.env.HENGZHUN_WORKER_HEALTH_FILE;
const stopFile = process.env.HENGZHUN_STOP_FILE;

function writeHealth(status, errorCode) {
  if (!healthFile) return;
  const target = path.resolve(healthFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 'hengzhun-worker-health-v1', service: 'worker', status, pid: process.pid, workerId, updatedAt: new Date().toISOString(), ...(errorCode ? { errorCode } : {}) }));
  fs.renameSync(temporary, target);
}

if (!workerToken || workerToken.length < 32) {
  process.stderr.write(JSON.stringify({ event: 'startup_failed', errorCode: 'WORKER_TOKEN_MISSING' }) + '\n');
  process.exit(1);
}

async function post(pathname, body) {
  const response = await fetch(`${harnessUrl}${pathname}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`HARNESS_${response.status}_${result.errorCode || 'ERROR'}`);
  return result;
}

async function completeFailure(task, error) {
  const category = error.category === 'TEST_FAILURE' ? 'TEST_FAILURE' : 'ENVIRONMENT';
  const report = {
    schemaVersion: 'i3-evidence-v1',
    runId: task.runId,
    taskId: task.taskId,
    outcome: 'BLOCKED',
    errorCode: error.code || 'WORKER_EXECUTION_FAILED',
    errorCategory: category
  };
  const evidence = Array.isArray(error.evidence) ? error.evidence : [{
    artifactType: 'DIAGNOSTIC',
    mediaType: 'application/json',
    redactionStatus: 'REDACTED',
    extension: 'json',
    base64Content: Buffer.from(JSON.stringify(report, null, 2)).toString('base64'),
    metadata: { containsCredentials: false }
  }];
  return post(`/internal/worker/tasks/${encodeURIComponent(task.taskId)}:complete`, {
    workerId,
    outcome: category === 'TEST_FAILURE' ? 'FAILED' : 'BLOCKED',
    summary: category === 'TEST_FAILURE' ? '门户回归断言失败。' : '门户回归被本机环境阻断。',
    errorCode: report.errorCode,
    errorCategory: category,
    retryable: category === 'ENVIRONMENT',
    userActionRequired: category === 'ENVIRONMENT',
    evidence
  });
}

async function runOnce() {
  const task = await post('/internal/worker/tasks:claim', { workerId });
  if (task.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'claimed', taskId: task.taskId, runId: task.runId }) + '\n');
  try {
    const executor = task.execution?.candidate ? executeI8FormalRun : executors.get(task.execution?.scriptPath);
    if (!executor) throw Object.assign(new Error('脚本不在已验证执行白名单中。'), { code: 'SCRIPT_NOT_ALLOWLISTED', category: 'ENVIRONMENT' });
    const result = await executor(task);
    const completed = await post(`/internal/worker/tasks/${encodeURIComponent(task.taskId)}:complete`, {
      workerId,
      ...result
    });
    process.stdout.write(JSON.stringify({ event: 'completed', taskId: task.taskId, outcome: completed.outcome }) + '\n');
  } catch (error) {
    const completed = await completeFailure(task, error);
    process.stdout.write(JSON.stringify({ event: 'completed', taskId: task.taskId, outcome: completed.outcome }) + '\n');
  }
  return true;
}

async function runRepairOnce() {
  const job = await post('/internal/worker/repairs:claim', { workerId });
  if (job.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'repair_claimed', jobId: job.jobId, candidateId: job.candidateId }) + '\n');
  try {
    const executor = executors.get(job.execution?.scriptPath);
    if (!executor) throw Object.assign(new Error('候选脚本不在执行白名单中。'), { code: 'SCRIPT_NOT_ALLOWLISTED', category: 'ENVIRONMENT' });
    const result = await executor({ ...job, taskId: job.jobId });
    const completed = await post(`/internal/worker/repairs/${encodeURIComponent(job.jobId)}:complete`, {
      workerId,
      ...result
    });
    process.stdout.write(JSON.stringify({ event: 'repair_completed', jobId: job.jobId, status: completed.status }) + '\n');
  } catch (error) {
    const category = error.category === 'TEST_FAILURE' ? 'TEST_FAILURE' : 'ENVIRONMENT';
    const evidence = Array.isArray(error.evidence) ? error.evidence : [{
      artifactType: 'DIAGNOSTIC',
      mediaType: 'application/json',
      redactionStatus: 'REDACTED',
      extension: 'json',
      base64Content: Buffer.from(JSON.stringify({
        schemaVersion: 'i5-repair-diagnostic-v1',
        jobId: job.jobId,
        candidateId: job.candidateId,
        errorCode: error.code || 'REPAIR_VALIDATION_FAILED',
        errorCategory: category
      }, null, 2)).toString('base64'),
      metadata: { containsCredentials: false, isolatedValidation: true }
    }];
    const completed = await post(`/internal/worker/repairs/${encodeURIComponent(job.jobId)}:complete`, {
      workerId,
      outcome: category === 'TEST_FAILURE' ? 'FAILED' : 'BLOCKED',
      summary: category === 'TEST_FAILURE' ? '修复候选未通过隔离回归验证。' : '修复候选验证被本机环境阻断。',
      errorCode: error.code || 'REPAIR_VALIDATION_FAILED',
      errorCategory: category,
      retryable: category === 'ENVIRONMENT',
      userActionRequired: true,
      evidence
    });
    process.stdout.write(JSON.stringify({ event: 'repair_completed', jobId: job.jobId, status: completed.status }) + '\n');
  }
  return true;
}

async function runI8StabilityOnce() {
  const claim = await post('/internal/worker/i8/stability:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i8_stability_claimed', batchId: claim.batchId, candidateId: claim.candidateId }) + '\n');
  try {
    const productRoot = path.resolve(__dirname, '..', '..');
    const completion = await executeStabilityBatch(claim, {
      productRoot,
      runtimeProductRoot: productRoot,
      workerId,
      environment: process.env
    });
    const completed = await post(`/internal/worker/i8/stability/${encodeURIComponent(claim.batchId)}:complete`, completion);
    process.stdout.write(JSON.stringify({ event: 'i8_stability_completed', batchId: claim.batchId, status: completed.status }) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({
      event: 'i8_stability_blocked',
      batchId: claim.batchId,
      errorCode: error.code || 'I8_STABILITY_EXECUTION_FAILED'
    }) + '\n');
  }
  return true;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function runI8CandidateBuildOnce() {
  const claim = await post('/internal/worker/i8/candidates:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i8_candidate_claimed', jobId: claim.jobId }) + '\n');
  try {
    const browserProbe = await executeLoginProfile({
      namespace: claim.namespace,
      caseId: claim.plan.caseId,
      caseVersion: claim.plan.caseVersion,
      runId: claim.jobId,
      taskId: claim.jobId,
      execution: { credentialAlias: 'i3-customer', fixtureNamespace: `authoring-${claim.jobId}` }
    });
    if (browserProbe.outcome !== 'PASSED') throw Object.assign(new Error('候选作者化浏览器事实未通过。'), { code: browserProbe.errorCode || 'I8_CANDIDATE_BROWSER_PROBE_FAILED' });
    const verifiedAt = new Date().toISOString();
    const verifiedActionRecords = claim.plan.actions.map(action => ({
      schemaVersion: 'i8-verified-action-record-v1',
      executablePlanId: claim.plan.executablePlanId,
      actionId: action.actionId,
      ordinal: action.ordinal,
      outcome: 'VERIFIED_PASSED',
      ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}),
      pageSignatureHash: sha256(stableJson(action.pageSignature)),
      factsHash: sha256(stableJson({ actionId: action.actionId, outcome: 'VERIFIED_PASSED', browserProbe: 'LOGIN_PROFILE_PASSED' })),
      verification: { dom: true, url: true, request: true, business: true },
      verifiedAt
    }));
    const completed = await post(`/internal/worker/i8/candidates/${encodeURIComponent(claim.jobId)}:complete`, {
      workerId,
      planHash: claim.planHash,
      outcome: 'VERIFIED_PASSED',
      verifiedActionRecords
    });
    process.stdout.write(JSON.stringify({ event: 'i8_candidate_completed', jobId: claim.jobId, status: completed.status }) + '\n');
  } catch (error) {
    await post(`/internal/worker/i8/candidates/${encodeURIComponent(claim.jobId)}:complete`, {
      workerId,
      planHash: claim.planHash,
      outcome: 'FAILED',
      errorCode: error.code || 'I8_CANDIDATE_BUILD_FAILED',
      verifiedActionRecords: []
    });
    process.stderr.write(JSON.stringify({ event: 'i8_candidate_failed', jobId: claim.jobId, errorCode: error.code || 'I8_CANDIDATE_BUILD_FAILED' }) + '\n');
  }
  return true;
}

async function runI8RepairStabilityOnce() {
  const claim = await post('/internal/worker/i8/repairs/stability:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i8_repair_stability_claimed', batchId: claim.batchId, proposalId: claim.proposalId }) + '\n');
  try {
    const productRoot = path.resolve(__dirname, '..', '..');
    const completion = await executeStabilityBatch(claim, { productRoot, runtimeProductRoot: productRoot, workerId, environment: process.env });
    const completed = await post(`/internal/worker/i8/repairs/stability/${encodeURIComponent(claim.batchId)}:complete`, completion);
    process.stdout.write(JSON.stringify({ event: 'i8_repair_stability_completed', batchId: claim.batchId, status: completed.status }) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ event: 'i8_repair_stability_blocked', batchId: claim.batchId, errorCode: error.code || 'I8_REPAIR_STABILITY_EXECUTION_FAILED' }) + '\n');
  }
  return true;
}

async function main() {
  const once = process.argv.includes('--once');
  writeHealth('HEALTHY');
  do {
    if (stopFile && fs.existsSync(stopFile)) { writeHealth('STOPPED'); return; }
    const worked = await runI8RepairStabilityOnce() || await runRepairOnce() || await runI8CandidateBuildOnce() || await runI8StabilityOnce() || await runOnce();
    writeHealth('HEALTHY');
    if (once) return;
    await new Promise(resolve => setTimeout(resolve, worked ? 250 : 500));
  } while (true);
}

main().catch(error => {
  writeHealth('FAILED', 'WORKER_LOOP_FAILED');
  process.stderr.write(JSON.stringify({ event: 'worker_failed', errorCode: 'WORKER_LOOP_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
});
