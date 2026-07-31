'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../runtime/node_modules/playwright');
const { executeCandidatePackage } = require('./i8-candidate-runner.cjs');
const { resolveCredential } = require('./i10-worker-utils.cjs');
const { policyForAction } = require('./i10-verification-policy.cjs');
const { runVerificationPolicy, verificationModes } = require('./i10-verification-execution.cjs');

function stabilityAllowedOrigins(targetProfile, baseUrl) {
  const origins = new Set(targetProfile
    ? [
        ...(Array.isArray(targetProfile.allowedNavigationOrigins) ? targetProfile.allowedNavigationOrigins : []),
        ...(Array.isArray(targetProfile.allowedInteractionOrigins) ? targetProfile.allowedInteractionOrigins : []),
        ...(Array.isArray(targetProfile.credentialOrigins) ? targetProfile.credentialOrigins : [])
      ]
    : [new URL(baseUrl).origin, 'http://127.0.0.1:18443', 'http://127.0.0.1:19000']);
  const adapter = targetProfile?.adapterBinding;
  if (adapter?.adapterId === 'fuxing-bank-demo' && adapter?.adapterVersion === '1.0.0') {
    origins.add('http://127.0.0.1:19000');
  }
  return [...origins];
}

const VIEWPORTS = Object.freeze([
  Object.freeze({ viewportId: 'DESKTOP_1440X900', width: 1440, height: 900, suffix: 'desktop' }),
  Object.freeze({ viewportId: 'NARROW_390X844', width: 390, height: 844, suffix: 'narrow' })
]);
const SCREENSHOT_UNAVAILABLE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fail(code, message, category = 'ENVIRONMENT') {
  throw Object.assign(new Error(message), { code, category });
}

function ordinalForStep(step) {
  const match = String(step?.stepId || '').match(/^dsl_(\d{2,})$/);
  return match ? Number(match[1]) : 0;
}

function assertClaim(claim) {
  if (!claim || claim.status !== 'CLAIMED' || !/^candidate_[0-9a-f]{40}$/.test(claim.candidateId || '')) fail('STABILITY_CLAIM_INVALID', '稳定性Claim不完整。', 'CONTRACT');
  const policies = {
    I8_2X3_V1: Object.freeze({ requiredRuns: 6, sequencesPerViewport: 3 }),
    I10_2X2_V1: Object.freeze({ requiredRuns: 4, sequencesPerViewport: 2 })
  };
  const policy = policies[claim.stabilityPolicyVersion];
  if (!policy || claim.requiredRuns !== policy.requiredRuns) fail('STABILITY_POLICY_INVALID', '稳定性Claim策略版本或运行数无效。', 'CONTRACT');
  if (!Array.isArray(claim.runs) || claim.runs.length !== policy.requiredRuns) fail('STABILITY_RUN_SET_INCOMPLETE', '稳定性Claim样本数不符合冻结策略。', 'CONTRACT');
  const expected = new Set(VIEWPORTS.flatMap(viewport => Array.from({ length: policy.sequencesPerViewport }, (_unused, index) => `${viewport.viewportId}:${index + 1}`)));
  const fixtures = new Set();
  for (const run of claim.runs) {
    const key = `${run.viewportId}:${run.sequenceNo}`;
    const viewport = VIEWPORTS.find(item => item.viewportId === run.viewportId);
    if (!expected.delete(key) || !viewport || viewport.width !== run.viewportWidth || viewport.height !== run.viewportHeight) fail('STABILITY_RUN_SET_INVALID', '稳定性样本不符合冻结的视口和序号集合。', 'CONTRACT');
    if (fixtures.has(run.fixtureRef)) fail('STABILITY_FIXTURE_NOT_ISOLATED', '每次验证必须使用独立Fixture。', 'CONTRACT');
    fixtures.add(run.fixtureRef);
  }
  if (expected.size !== 0) fail('STABILITY_RUN_SET_INCOMPLETE', '稳定性样本集合不完整。', 'CONTRACT');
}

function runtimeFingerprint(productRoot, executablePath) {
  const freezePath = path.join(productRoot, 'config', 'demo-runtime-freeze.json');
  const packagePath = path.join(productRoot, 'runtime', 'node_modules', 'playwright', 'package.json');
  if (!fs.existsSync(freezePath) || !fs.existsSync(packagePath) || !fs.existsSync(executablePath)) fail('STABILITY_RUNTIME_INCOMPLETE', '固定运行时文件不完整。');
  return sha256(stableJson({
    freezeSha256: sha256(fs.readFileSync(freezePath)),
    playwrightSha256: sha256(fs.readFileSync(packagePath)),
    chromiumSha256: sha256(fs.readFileSync(executablePath)),
    node: process.version,
    platform: process.platform,
    arch: process.arch
  }));
}

function safeEvidenceDirectory(productRoot, namespace, candidateId, validationRunId) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(namespace)) fail('STABILITY_NAMESPACE_INVALID', '稳定性namespace不符合白名单。', 'CONTRACT');
  if (!/^candidate_[0-9a-f]{40}$/.test(candidateId) || !/^validation_[0-9a-f]{40}_(desktop|narrow)_[123]$/.test(validationRunId)) fail('STABILITY_EVIDENCE_ID_INVALID', '稳定性证据标识不符合白名单。', 'CONTRACT');
  const root = path.resolve(productRoot, '.data', 'stability');
  const directory = path.resolve(root, namespace, candidateId, validationRunId);
  if (!directory.startsWith(`${root}${path.sep}`)) fail('STABILITY_EVIDENCE_DIRECTORY_ESCAPE', '稳定性证据目录越界。');
  return directory;
}

function writeAtomic(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  fs.renameSync(temporary, target);
}

function evidenceDescriptor(productRoot, target, artifactType, mediaType) {
  const bytes = fs.readFileSync(target);
  return {
    artifactType,
    mediaType,
    redactionStatus: 'REDACTED',
    relativePath: path.relative(productRoot, target).split(path.sep).join('/'),
    sha256: sha256(bytes),
    byteLength: bytes.byteLength
  };
}

async function executeRun(browser, claim, run, options, credential, fingerprint) {
  const started = Date.now();
  const context = await browser.newContext({
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: run.viewportWidth, height: run.viewportHeight },
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: options.ignoreHTTPSErrors === true
  });
  const initialState = await context.storageState();
  if (initialState.cookies.length !== 0 || initialState.origins.length !== 0) {
    await context.close();
    fail('STABILITY_RESIDUAL_AUTH_STATE', '新BrowserContext包含残留认证状态.');
  }
  const base = new URL(options.baseUrl);
  const allowedOrigins = new Set(options.allowedOrigins || [base.origin, 'http://127.0.0.1:18443', 'http://127.0.0.1:19000']);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['data:', 'blob:'].includes(url.protocol) || allowedOrigins.has(url.origin)) return route.continue();
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  let screenshot;
  let facts = [];
  let outcome = 'FAILED';
  let errorCode;
  try {
    const result = await executeCandidatePackage({
      productRoot: options.productRoot,
      relativeDirectory: claim.relativeDirectory,
      candidateId: claim.candidateId,
      scriptHash: claim.scriptHash,
      manifestHash: claim.manifestHash
    }, {
      baseUrl: options.baseUrl,
      page,
      fixtures: {
        'LOGIN_PROFILE.USERNAME': credential.username,
        'LOGIN_PROFILE.PASSWORD': credential.password,
        'CREDENTIAL.USERNAME': credential.username,
        'CREDENTIAL.PASSWORD': credential.password
      },
      capture: async (_name, currentPage) => {
        screenshot = await currentPage.screenshot({
          fullPage: true,
          mask: options.genericTarget ? [
            currentPage.locator('input[type="password"]'),
            currentPage.locator('input[autocomplete*="username"],input[autocomplete*="email"],input[autocomplete*="tel"]')
          ] : [
            currentPage.getByTestId('customer-profile-name'),
            currentPage.getByTestId('customer-profile-avatar'),
            currentPage.getByTestId('profile-display-name'),
            currentPage.getByTestId('profile-avatar'),
            currentPage.getByTestId('profile-customer-id'),
            currentPage.getByTestId('profile-email'),
            currentPage.getByTestId('profile-phone')
          ],
          maskColor: '#202020'
        });
      },
      afterStep: async (step, currentPage, storedPolicy) => {
        const policy = storedPolicy || policyForAction(
          { semanticTargetRef: step.targetRef },
          claim.fixtureProfile,
          options.candidateManifest?.targetProfileSnapshot?.adapterBinding
        );
        await runVerificationPolicy(currentPage, policy, {
          namespace: claim.namespace,
          taskRef: claim.batchId,
          actionOrdinal: ordinalForStep(step),
          onVerificationAttempt: options.onVerificationAttempt,
          // Stability certification has no user-facing browser handoff.  A
          // challenge which cannot be completed automatically must invalidate
          // the sample rather than pretend that a later user click passed it.
          allowExternalFallback: false,
          assertSuccessEvidence: async targetRef => currentPage.getByTestId(targetRef === 'ORDER_NUMBER' ? 'transfer-order-number' : targetRef)
            .waitFor({ state: 'visible', timeout: 15_000 })
        });
      }
    });
    facts = result.facts;
    outcome = result.outcome === 'PASSED' ? 'PASSED' : 'FAILED';
    if (outcome !== 'PASSED') errorCode = 'STABILITY_CANDIDATE_FAILED';
    if (options.forceFailureValidationRunId === run.validationRunId) {
      outcome = 'FAILED';
      errorCode = 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED';
    }
  } catch (error) {
    errorCode = error.code || (error.name === 'TimeoutError' ? 'STABILITY_BROWSER_TIMEOUT' : 'STABILITY_EXECUTION_FAILED');
    screenshot = await page.screenshot({
      fullPage: true,
      mask: [
        page.getByTestId('login-username'), page.getByTestId('login-password'),
        page.getByTestId('customer-profile-name'), page.getByTestId('customer-profile-avatar'),
        page.getByTestId('profile-display-name'), page.getByTestId('profile-avatar')
      ],
      maskColor: '#202020'
    }).catch(() => SCREENSHOT_UNAVAILABLE_PNG);
  } finally {
    await context.close();
  }
  const assertionSet = facts.map(item => ({ stepId: item.stepId, operation: item.operation, passed: item.passed }));
  const assertionSetHash = sha256(stableJson(assertionSet));
  const evidenceShape = [
    { artifactType: 'REPORT', mediaType: 'application/json', redactionStatus: 'REDACTED' },
    { artifactType: 'SCREENSHOT', mediaType: 'image/png', redactionStatus: 'REDACTED', masked: true },
    { artifactType: 'LOG', mediaType: 'text/plain; charset=utf-8', redactionStatus: 'REDACTED' }
  ];
  const evidenceSetHash = sha256(stableJson(evidenceShape));
  const report = {
    schemaVersion: 'i8-stability-run-report-v1',
    validationRunId: run.validationRunId,
    candidateId: claim.candidateId,
    scriptHash: claim.scriptHash,
    runtimeFingerprint: fingerprint,
    viewportId: run.viewportId,
    viewport: { width: run.viewportWidth, height: run.viewportHeight },
    sequenceNo: run.sequenceNo,
    fixtureRef: run.fixtureRef,
    freshBrowserContext: true,
    emptyInitialStorageState: true,
    assertionSetHash,
    evidenceSetHash,
    outcome,
    verificationPolicyModes: verificationModes(options.candidateManifest),
    ...(errorCode ? { errorCode } : {})
  };
  const log = assertionSet.map(item => `${item.passed ? 'PASS' : 'FAIL'} ${item.stepId} ${item.operation}`).join('\n') + '\n';
  const directory = safeEvidenceDirectory(options.productRoot, claim.namespace, claim.candidateId, run.validationRunId);
  const reportPath = path.join(directory, 'report.json');
  const screenshotPath = path.join(directory, 'screenshot.png');
  const logPath = path.join(directory, 'steps.log');
  writeAtomic(reportPath, Buffer.from(JSON.stringify(report, null, 2), 'utf8'));
  writeAtomic(screenshotPath, screenshot || SCREENSHOT_UNAVAILABLE_PNG);
  writeAtomic(logPath, Buffer.from(log, 'utf8'));
  return {
    validationRunId: run.validationRunId,
    viewportId: run.viewportId,
    viewportWidth: run.viewportWidth,
    viewportHeight: run.viewportHeight,
    sequenceNo: run.sequenceNo,
    fixtureRef: run.fixtureRef,
    outcome,
    durationMs: Date.now() - started,
    assertionSetHash,
    evidenceSetHash,
    evidence: [
      evidenceDescriptor(options.productRoot, reportPath, 'REPORT', 'application/json'),
      evidenceDescriptor(options.productRoot, screenshotPath, 'SCREENSHOT', 'image/png'),
      evidenceDescriptor(options.productRoot, logPath, 'LOG', 'text/plain; charset=utf-8')
    ],
    ...(errorCode ? { errorCode } : {})
  };
}

async function executeStabilityBatch(claim, options = {}) {
  assertClaim(claim);
  const productRoot = path.resolve(options.productRoot || path.resolve(__dirname, '..', '..'));
  const runtimeProductRoot = path.resolve(options.runtimeProductRoot || path.resolve(__dirname, '..', '..'));
  const executablePath = options.executablePath || path.join(runtimeProductRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  const manifestPath = path.resolve(productRoot, claim.relativeDirectory, 'manifest.json');
  const candidateManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targetProfile = candidateManifest.targetProfileSnapshot;
  const genericTarget = Boolean(targetProfile);
  // The candidate executor requires an origin-root base URL.  The frozen
  // TargetProfile launch URL remains authoritative for navigation routes, but
  // must not be used verbatim when it contains a page pathname.
  const baseUrl = genericTarget
    ? new URL('/', String(targetProfile.launchUrl)).href
    : (options.baseUrl || claim.entryUrl || process.env.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/portal\/login(?:[?#].*)?$/, '').replace(/\/$/, '') + '/';
  const parsedBase = new URL(baseUrl);
  if ((!genericTarget && (parsedBase.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedBase.hostname)))
      || !['http:', 'https:'].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password) {
    fail('STABILITY_BASE_URL_NOT_ALLOWED', '稳定性运行只允许受控本机门户地址。', 'CONTRACT');
  }
  const credential = options.credential || resolveCredential(claim.credentialAlias, options.environment || process.env);
  if (!credential?.username || !credential?.password) fail('STABILITY_CREDENTIAL_UNAVAILABLE', '稳定性运行凭据不可用。', 'SECURITY');
  const fingerprint = runtimeFingerprint(runtimeProductRoot, executablePath);
  const browser = await chromium.launch({ executablePath, headless: options.headless !== false });
  const results = [];
  if (options.forceFailureValidationRunId &&
      !claim.runs.some(run => run.validationRunId === options.forceFailureValidationRunId)) {
    fail('I10_ACCEPTANCE_STABILITY_INJECTION_TARGET_INVALID', '受控稳定性失败样本不属于当前批次。', 'CONTRACT');
  }
  try {
    for (const run of claim.runs) {
      results.push(await executeRun(browser, claim, run, {
        ...options,
        productRoot,
        executablePath,
        baseUrl,
        genericTarget,
        allowedOrigins: genericTarget ? stabilityAllowedOrigins(targetProfile, baseUrl) : options.allowedOrigins,
        ignoreHTTPSErrors: targetProfile?.tlsPolicy === 'ALLOW_SELF_SIGNED',
        candidateManifest
      }, credential, fingerprint));
    }
  } finally {
    await browser.close();
  }
  return {
    workerId: options.workerId || claim.leaseOwner,
    candidateId: claim.candidateId,
    scriptHash: claim.scriptHash,
    runtimeFingerprint: fingerprint,
    runs: results
  };
}

module.exports = { VIEWPORTS, assertClaim, executeStabilityBatch, ordinalForStep, runtimeFingerprint, safeEvidenceDirectory, stabilityAllowedOrigins };
