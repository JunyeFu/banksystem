const os = require('node:os');
const path = require('node:path');
const { executeLoginProfile } = require('./login-profile.cjs');
const { executeAccountOwnership } = require('./account-ownership.cjs');
const { executeAuthRejectionRecovery } = require('./auth-rejection-recovery.cjs');
const { executeStabilityBatch } = require('./i8-stability-runner.cjs');
const { executeI8FormalRun } = require('./i8-formal-runner.cjs');

const executors = new Map([
  ['worker/src/login-profile.cjs', executeLoginProfile],
  ['worker/src/account-ownership.cjs', executeAccountOwnership],
  ['worker/src/auth-rejection-recovery.cjs', executeAuthRejectionRecovery]
]);

const harnessUrl = (process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '');
const workerToken = process.env.HENGZHUN_WORKER_TOKEN;
const workerId = process.env.HENGZHUN_WORKER_ID || `worker-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

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
  do {
    const worked = await runI8RepairStabilityOnce() || await runRepairOnce() || await runI8StabilityOnce() || await runOnce();
    if (once) return;
    await new Promise(resolve => setTimeout(resolve, worked ? 250 : 1500));
  } while (true);
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'worker_failed', errorCode: 'WORKER_LOOP_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
});
