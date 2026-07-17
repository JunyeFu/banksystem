const os = require('node:os');
const { executeLoginProfile } = require('./login-profile.cjs');

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
    const result = await executeLoginProfile(task);
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

async function main() {
  const once = process.argv.includes('--once');
  do {
    const worked = await runOnce();
    if (once) return;
    await new Promise(resolve => setTimeout(resolve, worked ? 250 : 1500));
  } while (true);
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'worker_failed', errorCode: 'WORKER_LOOP_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
});
