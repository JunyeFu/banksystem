const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { executeLoginProfile } = require('./adapters/fuxing-bank-demo/login-profile.cjs');
const { executeAccountOwnership } = require('./adapters/fuxing-bank-demo/account-ownership.cjs');
const { executeAuthRejectionRecovery } = require('./adapters/fuxing-bank-demo/auth-rejection-recovery.cjs');
const { executeStabilityBatch } = require('./i8-stability-runner.cjs');
const { executeI8FormalRun } = require('./i8-formal-runner.cjs');
const { executeVideoIngest } = require('./i10-video-ingest-runner.cjs');
const { executeImageIngest } = require('./i10-image-ingest-runner.cjs');
const { executeI10MidsceneCandidate } = require('./i10-midscene-candidate-authoring.cjs');
const { I8_CONTROLLED_CATALOG } = require('../../dist/harness/src/i8/script-package-builder.js');

// New controlled tasks resolve to the explicit adapter. Historical paths remain
// aliases only so existing I9/I10 evidence can still replay.
const executors = new Map([
  ['adapters/fuxing-bank-demo/login-profile@1.0.0', executeLoginProfile],
  ['adapters/fuxing-bank-demo/account-ownership@1.0.0', executeAccountOwnership],
  ['adapters/fuxing-bank-demo/auth-rejection-recovery@1.0.0', executeAuthRejectionRecovery],
  ['worker/src/login-profile.cjs', executeLoginProfile],
  ['worker/src/account-ownership.cjs', executeAccountOwnership],
  ['worker/src/auth-rejection-recovery.cjs', executeAuthRejectionRecovery]
]);

const harnessUrl = (process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '');
const workerToken = process.env.HENGZHUN_WORKER_TOKEN;
const workerId = process.env.HENGZHUN_WORKER_ID || `worker-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
const healthFile = process.env.HENGZHUN_WORKER_HEALTH_FILE;
const stopFile = process.env.HENGZHUN_STOP_FILE;

function workerCodeVersion() {
  const hash = crypto.createHash('sha256');
  for (const relativePath of [
    'index.cjs',
    'i10-midscene-candidate-authoring.cjs',
    'i8-candidate-runner.cjs',
    'i8-formal-runner.cjs',
    'i10-verification-execution.cjs'
  ]) {
    const absolutePath = path.join(__dirname, relativePath);
    hash.update(`worker/src/${relativePath}`).update('\0');
    if (!fs.existsSync(absolutePath)) hash.update('MISSING\0');
    else hash.update(fs.readFileSync(absolutePath)).update('\0');
  }
  return hash.digest('hex');
}

const currentWorkerCodeVersion = workerCodeVersion();

function writeHealth(status, errorCode) {
  if (!healthFile) return;
  const target = path.resolve(healthFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 'hengzhun-worker-health-v1', service: 'worker', status, pid: process.pid, workerId, workerCodeVersion: currentWorkerCodeVersion, updatedAt: new Date().toISOString(), ...(errorCode ? { errorCode } : {}) }));
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
  if (!response.ok) {
    const errorCode = String(result?.errorCode || `HARNESS_${response.status}_ERROR`);
    throw Object.assign(new Error(`HARNESS_${response.status}_${errorCode}`), { code: errorCode });
  }
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
  const diagnostic = error.failureDiagnostic && typeof error.failureDiagnostic === 'object'
    ? {
        schemaVersion: 'i8-formal-diagnostic-v2',
        failureStage: String(error.failureDiagnostic.failureStage || 'BEFORE_FIRST_STEP').slice(0, 80),
        stepId: error.failureDiagnostic.stepId == null ? null : String(error.failureDiagnostic.stepId).slice(0, 160),
        operation: error.failureDiagnostic.operation == null ? null : String(error.failureDiagnostic.operation).slice(0, 80),
        targetRef: error.failureDiagnostic.targetRef == null ? null : String(error.failureDiagnostic.targetRef).slice(0, 160),
        pageLocation: error.failureDiagnostic.pageLocation == null ? null : String(error.failureDiagnostic.pageLocation).slice(0, 2048),
        pageFingerprint: error.failureDiagnostic.pageFingerprint == null ? null : String(error.failureDiagnostic.pageFingerprint).slice(0, 160)
      }
    : null;
  return post(`/internal/worker/tasks/${encodeURIComponent(task.taskId)}:complete`, {
    workerId,
    outcome: category === 'TEST_FAILURE' ? 'FAILED' : 'BLOCKED',
    summary: category === 'TEST_FAILURE' ? '门户回归断言失败。' : '门户回归被本机环境阻断。',
    errorCode: report.errorCode,
    errorCategory: category,
    retryable: category === 'ENVIRONMENT',
    userActionRequired: category === 'ENVIRONMENT',
    ...(diagnostic ? { failureDiagnostic: diagnostic } : {}),
    evidence
  });
}

const verificationTerminalStatuses = new Set([
  'CANCELLED',
  'EXPIRED',
  'DEVICE_UNAVAILABLE',
  'MIDDLEWARE_UNAVAILABLE',
  'PERMISSION_DENIED',
  'SESSION_LOST',
  'VERIFICATION_FAILED',
  'LOCKOUT_RISK'
]);

async function waitForVerificationConfirmation(challenge, namespace) {
  const reported = await post('/internal/worker/i10/verification:report', {
    ...challenge,
    workerId
  });
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const current = await post('/internal/worker/i10/verification:get', {
      namespace,
      challengeId: reported.challengeId
    });
    if (current.status === 'VERIFICATION_CONFIRMED') {
      await post('/internal/worker/i10/verification:resume', {
        namespace,
        challengeId: reported.challengeId,
        workerId
      });
      return {
        ...current,
        challengeId: reported.challengeId,
        status: 'VERIFICATION_CONFIRMED',
        persistedStatus: 'RESUMED'
      };
    }
    if (verificationTerminalStatuses.has(current.status)) return current;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { challengeId: reported.challengeId, status: 'EXPIRED' };
}

async function runOnce() {
  const task = await post('/internal/worker/tasks:claim', { workerId });
  if (task.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'claimed', taskId: task.taskId, runId: task.runId }) + '\n');
  let i10Credential;
  try {
    const executor = task.execution?.candidate ? executeI8FormalRun : executors.get(task.execution?.scriptPath);
    if (!executor) throw Object.assign(new Error('脚本不在已验证执行白名单中。'), { code: 'SCRIPT_NOT_ALLOWLISTED', category: 'ENVIRONMENT' });
    if (task.execution?.credentialRef) {
      i10Credential = await post('/internal/worker/i10/credentials:resolve', {
        namespace: task.namespace,
        credentialRef: task.execution.credentialRef
      });
    }
    const result = await executor(task, process.env, i10Credential ? {
      credential: i10Credential,
      entryUrl: task.execution.entryUrl,
      onVerificationChallenge: challenge => waitForVerificationConfirmation(challenge, task.namespace),
      onVerificationAttempt: attempt => post('/internal/worker/i10/verification:attempt', { ...attempt, workerId })
    } : {});
    const completed = await post(`/internal/worker/tasks/${encodeURIComponent(task.taskId)}:complete`, {
      workerId,
      ...result
    });
    process.stdout.write(JSON.stringify({ event: 'completed', taskId: task.taskId, outcome: completed.outcome }) + '\n');
  } catch (error) {
    const completed = await completeFailure(task, error);
    process.stdout.write(JSON.stringify({ event: 'completed', taskId: task.taskId, outcome: completed.outcome }) + '\n');
  } finally {
    if (i10Credential) {
      i10Credential.username = '';
      i10Credential.password = '';
      i10Credential = undefined;
    }
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

function consumeAcceptanceStabilityFailure(claim) {
  if (claim.stabilityPolicyVersion !== 'I10_2X2_V1') return null;
  const productRoot = path.resolve(__dirname, '..', '..');
  const injectionRoot = path.join(productRoot, '.data', 'tests', 'i10-acceptance-injections');
  const source = path.join(injectionRoot, 'stability-fail-next.json');
  if (!fs.existsSync(source)) return null;
  let injection;
  try { injection = JSON.parse(fs.readFileSync(source, 'utf8')); } catch {
    throw Object.assign(new Error('I10_ACCEPTANCE_STABILITY_INJECTION_INVALID'), { code: 'I10_ACCEPTANCE_STABILITY_INJECTION_INVALID' });
  }
  const createdAt = Date.parse(String(injection.createdAt || ''));
  const target = claim.runs.find(run =>
    run.viewportId === String(injection.viewportId || '') &&
    run.sequenceNo === Number(injection.sequenceNo));
  if (injection.schemaVersion !== 'hengzhun-i10-stability-failure-injection-v1' ||
      injection.failureCode !== 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED' ||
      !Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60_000 ||
      (injection.candidateId && injection.candidateId !== claim.candidateId) ||
      !target) {
    throw Object.assign(new Error('I10_ACCEPTANCE_STABILITY_INJECTION_INVALID'), { code: 'I10_ACCEPTANCE_STABILITY_INJECTION_INVALID' });
  }
  const consumed = path.join(injectionRoot, `stability-fail-consumed-${claim.batchId}.json`);
  fs.renameSync(source, consumed);
  return {
    validationRunId: target.validationRunId,
    evidencePath: path.relative(productRoot, consumed).replaceAll('\\', '/')
  };
}

async function runI8StabilityOnce() {
  const claim = await post('/internal/worker/i8/stability:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i8_stability_claimed', batchId: claim.batchId, candidateId: claim.candidateId }) + '\n');
  try {
    const productRoot = path.resolve(__dirname, '..', '..');
    const controlledFailure = consumeAcceptanceStabilityFailure(claim);
    if (controlledFailure) {
      process.stderr.write(JSON.stringify({
        event: 'i10_acceptance_stability_failure_injected',
        batchId: claim.batchId,
        candidateId: claim.candidateId,
        validationRunId: controlledFailure.validationRunId,
        evidencePath: controlledFailure.evidencePath
      }) + '\n');
    }
    const i10Credential = claim.stabilityPolicyVersion === 'I10_2X2_V1'
      ? await post('/internal/worker/i10/credentials:resolve', { namespace: claim.namespace, credentialRef: claim.credentialRef })
      : undefined;
    const completion = await executeStabilityBatch(claim, {
      productRoot,
      runtimeProductRoot: productRoot,
      workerId,
      environment: process.env,
      onVerificationAttempt: attempt => post('/internal/worker/i10/verification:attempt', { ...attempt, workerId }),
      ...(controlledFailure ? { forceFailureValidationRunId: controlledFailure.validationRunId } : {}),
      ...(i10Credential ? { credential: i10Credential, baseUrl: claim.entryUrl } : {})
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

function safeWorkerFailure(error, fallbackCode) {
  const rawMessage = typeof error?.message === 'string' ? error.message : '';
  const sanitizedMessage = rawMessage
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 320);
  return {
    errorCode: typeof error?.code === 'string' && error.code ? error.code : fallbackCode,
    errorName: typeof error?.name === 'string' && error.name ? error.name : 'Error',
    ...(sanitizedMessage ? { message: sanitizedMessage } : {})
  };
}

function consumeAcceptanceAuthoringFailure(claim) {
  const productRoot = path.resolve(__dirname, '..', '..');
  const injectionRoot = path.join(productRoot, '.data', 'tests', 'i10-acceptance-injections');
  const source = path.join(injectionRoot, 'authoring-fail-next.json');
  if (!fs.existsSync(source)) return null;
  let injection;
  try { injection = JSON.parse(fs.readFileSync(source, 'utf8')); } catch {
    throw Object.assign(new Error('I10_ACCEPTANCE_INJECTION_INVALID'), { code: 'I10_ACCEPTANCE_INJECTION_INVALID' });
  }
  const createdAt = Date.parse(String(injection.createdAt || ''));
  if (injection.schemaVersion !== 'hengzhun-i10-authoring-failure-injection-v1' ||
      injection.failureCode !== 'I10_MIDSCENE_MODEL_TIMEOUT' ||
      !Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60_000 ||
      (injection.preparationId && injection.preparationId !== claim.preparationId)) {
    throw Object.assign(new Error('I10_ACCEPTANCE_INJECTION_INVALID'), { code: 'I10_ACCEPTANCE_INJECTION_INVALID' });
  }
  const consumed = path.join(injectionRoot, `authoring-fail-consumed-${claim.jobId}.json`);
  fs.renameSync(source, consumed);
  return { failureCode: injection.failureCode, evidencePath: path.relative(productRoot, consumed).replaceAll('\\', '/') };
}

async function runI8CandidateBuildOnce() {
  const claim = await post('/internal/worker/i8/candidates:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i8_candidate_claimed', jobId: claim.jobId }) + '\n');
  try {
    if (claim.stabilityPolicyVersion === 'I10_2X2_V1') {
      const controlledFailure = consumeAcceptanceAuthoringFailure(claim);
      if (controlledFailure) {
        process.stderr.write(JSON.stringify({
          event: 'i10_acceptance_authoring_failure_injected',
          jobId: claim.jobId,
          preparationId: claim.preparationId,
          errorCode: controlledFailure.failureCode,
          evidencePath: controlledFailure.evidencePath
        }) + '\n');
        throw Object.assign(new Error(controlledFailure.failureCode), { code: controlledFailure.failureCode });
      }
      if (!claim.credentialRef) throw Object.assign(new Error('I10_CREDENTIAL_REF_REQUIRED'), { code: 'I10_CREDENTIAL_REF_REQUIRED' });
      const credential = await post('/internal/worker/i10/credentials:resolve', { namespace: claim.namespace, credentialRef: claim.credentialRef });
      const verifiedActionRecords = await executeI10MidsceneCandidate(claim, credential, {
        onVerificationChallenge: challenge => waitForVerificationConfirmation(challenge, claim.namespace),
        onVerificationAttempt: attempt => post('/internal/worker/i10/verification:attempt', { ...attempt, workerId })
      });
      const completed = await post(`/internal/worker/i8/candidates/${encodeURIComponent(claim.jobId)}:complete`, {
        workerId, planHash: claim.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords
      });
      process.stdout.write(JSON.stringify({ event: 'i10_candidate_completed', jobId: claim.jobId, status: completed.status }) + '\n');
      return true;
    }
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
    const failure = safeWorkerFailure(error, 'I8_CANDIDATE_BUILD_FAILED');
    const details = error?.details && typeof error.details === 'object' ? error.details : {};
    const safeErrorCode = String(failure.errorCode || 'I8_CANDIDATE_BUILD_FAILED').replace(/[^A-Z0-9_]/g, '_').slice(0, 160);
    await post(`/internal/worker/i8/candidates/${encodeURIComponent(claim.jobId)}:complete`, {
      workerId,
      planHash: claim.planHash,
      outcome: 'FAILED',
      errorCode: failure.errorCode,
      diagnostic: {
        stage: String(details.stage || (safeErrorCode.includes('MIDSCENE') ? 'MIDSCENE_LOCATE' : safeErrorCode.includes('VERIFICATION') ? 'VERIFICATION_WAIT' : 'CANDIDATE_EXECUTION')).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 160),
        ...(Number.isInteger(details.actionOrdinal) ? { actionOrdinal: details.actionOrdinal } : {}),
        ...(typeof details.targetRef === 'string' ? { semanticTargetRef: details.targetRef.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 160) } : {}),
        ...(typeof details.verificationPolicy === 'string' ? { verificationPolicy: details.verificationPolicy } : {}),
        safeErrorCode,
        modelStatus: safeErrorCode.includes('MIDSCENE') ? (safeErrorCode.includes('TIMEOUT') ? 'TIMEOUT' : 'FAILED') : 'NOT_CALLED'
      },
      verifiedActionRecords: []
    });
    process.stderr.write(JSON.stringify({ event: 'i8_candidate_failed', jobId: claim.jobId, ...failure }) + '\n');
  }
  return true;
}

async function runI8RepairStabilityOnce() {
  const claim = await post('/internal/worker/i8/repairs/stability:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i8_repair_stability_claimed', batchId: claim.batchId, proposalId: claim.proposalId }) + '\n');
  try {
    const productRoot = path.resolve(__dirname, '..', '..');
    const i10Credential = claim.stabilityPolicyVersion === 'I10_2X2_V1'
      ? await post('/internal/worker/i10/credentials:resolve', { namespace: claim.namespace, credentialRef: claim.credentialRef })
      : undefined;
    const completion = await executeStabilityBatch(claim, {
      productRoot,
      runtimeProductRoot: productRoot,
      workerId,
      environment: process.env,
      onVerificationAttempt: attempt => post('/internal/worker/i10/verification:attempt', { ...attempt, workerId }),
      ...(i10Credential ? { credential: i10Credential, baseUrl: claim.entryUrl } : {})
    });
    const completed = await post(`/internal/worker/i8/repairs/stability/${encodeURIComponent(claim.batchId)}:complete`, completion);
    process.stdout.write(JSON.stringify({ event: 'i8_repair_stability_completed', batchId: claim.batchId, status: completed.status }) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ event: 'i8_repair_stability_blocked', batchId: claim.batchId, errorCode: error.code || 'I8_REPAIR_STABILITY_EXECUTION_FAILED' }) + '\n');
  }
  return true;
}

async function runI10VideoIngestOnce() {
  const claim = await post('/internal/worker/i10/ingest:claim', { workerId });
  if (claim.status === 'EMPTY') return false;
  process.stdout.write(JSON.stringify({ event: 'i10_video_ingest_claimed', ingestJobId: claim.ingestJobId }) + '\n');
  try {
    const completion = await executeVideoIngest(claim);
    const result = await post('/internal/worker/i10/ingest:complete', completion);
    process.stdout.write(JSON.stringify({ event: 'i10_video_ingest_completed', ingestJobId: claim.ingestJobId, status: result.status }) + '\n');
  } catch (error) {
    await post('/internal/worker/i10/ingest:fail', {
      workerId, ingestJobId: claim.ingestJobId, sourceHash: claim.sourceHash,
      errorCode: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'I10_VIDEO_INGEST_FAILED',
      retryable: ['I10_MIMO_VISUAL_CALL_FAILED'].includes(error.code),
      evidenceSummary: `视频导入失败并关闭：${error.code || 'I10_VIDEO_INGEST_FAILED'}。`
    });
    process.stderr.write(JSON.stringify({ event: 'i10_video_ingest_failed', ingestJobId: claim.ingestJobId, errorCode: error.code || 'I10_VIDEO_INGEST_FAILED' }) + '\n');
  }
  return true;
}

async function runI10ImageIngestOnce(){
  const claim=await post('/internal/worker/i10/images:claim',{workerId});
  if(claim.status==='EMPTY')return false;
  if(claim.status==='SKIPPED_FAILED'){
    process.stderr.write(JSON.stringify({event:'i10_image_ingest_skipped_failed',imageIngestId:claim.imageIngestId,errorCode:claim.errorCode})+'\n');
    return true;
  }
  if(claim.status!=='CLAIMED')throw Object.assign(new Error('I10_IMAGE_INGEST_CLAIM_INVALID'),{code:'I10_IMAGE_INGEST_CLAIM_INVALID'});
  process.stdout.write(JSON.stringify({event:'i10_image_ingest_claimed',imageIngestId:claim.imageIngestId})+'\n');
  try{const completion=await executeImageIngest(claim);const result=await post('/internal/worker/i10/images:complete',completion);process.stdout.write(JSON.stringify({event:'i10_image_ingest_completed',imageIngestId:claim.imageIngestId,status:result.status})+'\n');}
  catch(error){const errorCode=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'I10_IMAGE_INGEST_FAILED';await post('/internal/worker/i10/images:fail',{workerId,imageIngestId:claim.imageIngestId,errorCode,retryable:['I10_CONTROL_IMAGE_FACT_CALL_FAILED','I10_VISION_IMAGE_OBSERVATION_FAILED'].includes(error.code)});process.stderr.write(JSON.stringify({event:'i10_image_ingest_failed',imageIngestId:claim.imageIngestId,errorCode,errorName:error?.name||'Error'})+'\n');}
  return true;
}

async function main() {
  const once = process.argv.includes('--once');
  writeHealth('HEALTHY');
  do {
    if (stopFile && fs.existsSync(stopFile)) { writeHealth('STOPPED'); return; }
    try {
      const worked = await runI10ImageIngestOnce() || await runI10VideoIngestOnce() || await runI8RepairStabilityOnce() || await runRepairOnce() || await runI8CandidateBuildOnce() || await runI8StabilityOnce() || await runOnce();
      writeHealth('HEALTHY');
      if (once) return;
      await new Promise(resolve => setTimeout(resolve, worked ? 250 : 500));
    } catch (error) {
      const failure = safeWorkerFailure(error, 'WORKER_ITERATION_FAILED');
      writeHealth('DEGRADED', failure.errorCode);
      process.stderr.write(JSON.stringify({ event: 'worker_iteration_failed', ...failure }) + '\n');
      if (once || /^HARNESS_401_/.test(error?.message || '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 1_000));
    }
  } while (true);
}

main().catch(error => {
  writeHealth('FAILED', 'WORKER_LOOP_FAILED');
  process.stderr.write(JSON.stringify({ event: 'worker_failed', errorCode: 'WORKER_LOOP_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
});
