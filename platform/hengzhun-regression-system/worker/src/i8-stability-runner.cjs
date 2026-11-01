'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertTargetUrlResolution, chromiumHostResolverRules, targetRuntimeAllowedOrigins } = require('./i10-worker-utils.cjs');
const { executeCandidatePackage } = require('./i8-candidate-runner.cjs');
const { resolveCredential, bankValidationFixtureValues, assertBankValidationLease } = require('./i10-worker-utils.cjs');
const { policyForAction } = require('./i10-verification-policy.cjs');
const { runVerificationPolicy, verificationModes } = require('./i10-verification-execution.cjs');

function stabilityAllowedOrigins(targetProfile, baseUrl) {
  return [...targetRuntimeAllowedOrigins(targetProfile, baseUrl)];
}

const VIEWPORTS = Object.freeze([
  Object.freeze({ viewportId: 'DESKTOP_1440X900', width: 1440, height: 900, suffix: 'desktop' }),
  Object.freeze({ viewportId: 'NARROW_390X844', width: 390, height: 844, suffix: 'narrow' })
]);
const SCREENSHOT_UNAVAILABLE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function loadChromium() {
  return require('../../runtime/node_modules/playwright').chromium;
}

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
  if(claim.bankValidationFixtures) {
    const {bankValidationFixturesSchema}=require('../../dist/harness/src/i10/schemas.js');
    const parsed=bankValidationFixturesSchema.safeParse(claim.bankValidationFixtures);
    if(!parsed.success||claim.stabilityPolicyVersion!=='I10_2X2_V1')fail('I10_BANK_VALIDATION_BINDING_INVALID','资金稳定性样本池不完整或不独立。','CONTRACT');
    for(const run of claim.runs) {
      const fixture=parsed.data.stability.find(item=>item.viewportId===run.viewportId&&item.sequenceNo===run.sequenceNo)?.fixture;
      if(!fixture||run.fixtureRef!==fixture.fixtureId||run.credentialRef!==fixture.credentialRef||!run.validationFixture||
        Object.keys(fixture).some(key=>run.validationFixture[key]!==fixture[key]))
        fail('I10_BANK_VALIDATION_BINDING_INVALID','资金稳定性Claim与冻结样本不符。','CONTRACT');
    }
  } else if(claim.runs.some(run=>run.validationFixture))fail('I10_BANK_VALIDATION_BINDING_REQUIRED','资金样本不能降级为共用登录的历史验证。','CONTRACT');
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
    redactionStatus: artifactType === 'SCREENSHOT' ? 'QUARANTINED' : 'REDACTED',
    relativePath: path.relative(productRoot, target).split(path.sep).join('/'),
    sha256: sha256(bytes),
    byteLength: bytes.byteLength
  };
}

async function executeRun(browser, claim, run, options, credential, fingerprint) {
  if(claim.bankValidationFixtures)assertBankValidationLease(claim);
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
  let bankLeaseRejected=false;
  await context.route('**/*', async route => {
    if(run.validationFixture && !(Date.parse(claim.leaseExpiresAt)>Date.now()) && !['GET','HEAD'].includes(route.request().method())) {
      bankLeaseRejected=true;
      return route.abort('blockedbyclient');
    }
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
        ...(run.validationFixture ? bankValidationFixtureValues(run.validationFixture):{}),
        'LOGIN_PROFILE.USERNAME': credential.username,
        'LOGIN_PROFILE.PASSWORD': credential.password,
        'CREDENTIAL.USERNAME': credential.username,
        'CREDENTIAL.PASSWORD': credential.password
      },
      capture: async (_name, currentPage) => {
        screenshot = await currentPage.screenshot({
          fullPage: true,
          mask: [
            ...(run.validationFixture ? [currentPage.locator('input[type="password"], input[name="username"]')]:[]),
            ...(options.genericTarget ? [
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
          ])
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
    if(bankLeaseRejected) {outcome='FAILED';errorCode='I10_BANK_VALIDATION_LEASE_EXPIRED';}
    if (outcome !== 'PASSED' && !bankLeaseRejected) errorCode = 'STABILITY_CANDIDATE_FAILED';
    if (options.forceFailureValidationRunId === run.validationRunId) {
      outcome = 'FAILED';
      errorCode = 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED';
    }
  } catch (error) {
    errorCode = error.code || (error.name === 'TimeoutError' ? 'STABILITY_BROWSER_TIMEOUT' : 'STABILITY_EXECUTION_FAILED');
    screenshot = await page.screenshot({
      fullPage: true,
      mask: [
        ...(run.validationFixture?[page.locator('input[type="password"], input[name="username"]')]:[]),
        page.getByTestId('login-username'), page.getByTestId('login-password'),
        page.getByTestId('customer-profile-name'), page.getByTestId('customer-profile-avatar'),
        page.getByTestId('profile-display-name'), page.getByTestId('profile-avatar')
      ],
      maskColor: '#202020'
    }).catch(() => {
      if(run.validationFixture)fail('I10_BANK_VALIDATION_SCREENSHOT_UNAVAILABLE','资金失败现场截图不可用，不能用占位图替代。','EVIDENCE');
      return SCREENSHOT_UNAVAILABLE_PNG;
    });
  } finally {
    await context.close();
  }
  const assertionSet = facts.map(item => ({ stepId: item.stepId, operation: item.operation, passed: item.passed }));
  const assertionSetHash = sha256(stableJson(assertionSet));
  const evidenceShape = [
    { artifactType: 'REPORT', mediaType: 'application/json', redactionStatus: 'REDACTED' },
    { artifactType: 'SCREENSHOT', mediaType: 'image/png', redactionStatus: 'QUARANTINED' },
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
  if(run.validationFixture&&!screenshot)fail('I10_BANK_VALIDATION_SCREENSHOT_UNAVAILABLE','资金验证没有真实现场截图。','EVIDENCE');
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

async function resolveStabilityExecution(claim,run,options) {
  if(!claim.bankValidationFixtures)return {credential:options.credential||resolveCredential(claim.credentialAlias,options.environment||process.env)};
  assertBankValidationLease(claim);
  const expected=claim.bankValidationFixtures.stability.find(item=>item.fixture.fixtureId===run.fixtureRef)?.fixture;
  if(!expected || !run.validationFixture || run.credentialRef!==expected.credentialRef ||
    Object.keys(expected).some(key=>run.validationFixture[key]!==expected[key]))
    fail('I10_BANK_VALIDATION_BINDING_INVALID','稳定性样本与冻结银行绑定不符。','CONTRACT');
  if(typeof options.resolveCredential!=='function')fail('I10_BANK_VALIDATION_CREDENTIAL_RESOLVER_REQUIRED','资金样本必须逐个解析其已登记凭据。','SECURITY');
  const credential=await options.resolveCredential(run.credentialRef);
  if(!credential?.username||!credential?.password)fail('STABILITY_CREDENTIAL_UNAVAILABLE','资金样本凭据不可用。','SECURITY');
  return {credential,fixtureValues:bankValidationFixtureValues(run.validationFixture)};
}

function bankStabilityFailureReceipt(claim,error,runs=[],fingerprint,workerId=claim.leaseOwner) {
  if(!claim.bankValidationFixtures || !claim.runs?.[runs.length])throw error;
  const errorCode=/^[A-Z][A-Z0-9_]{0,159}$/.test(error?.code||'')?error.code:'I10_BANK_STABILITY_EXECUTION_FAILED';
  return {workerId,candidateId:claim.candidateId,scriptHash:claim.scriptHash,
    ...(fingerprint?{runtimeFingerprint:fingerprint}:{}),runs,stoppedAfterFailure:true,
    executionFailure:{validationRunId:claim.runs[runs.length].validationRunId,errorCode}};
}

async function executeStabilityBatch(claim, options = {}) {
  try {return await executeStabilityBatchInternal(claim,options);}
  catch(error) {return bankStabilityFailureReceipt(claim,error,[],undefined,options.workerId||claim.leaseOwner);}
}

async function executeStabilityBatchInternal(claim, options) {
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
  if (genericTarget) {
    for (const origin of stabilityAllowedOrigins(targetProfile, baseUrl)) {
      await assertTargetUrlResolution(origin, targetProfile);
    }
  }
  const credential = claim.bankValidationFixtures ? undefined : options.credential || resolveCredential(claim.credentialAlias, options.environment || process.env);
  if (!claim.bankValidationFixtures&&(!credential?.username || !credential?.password)) fail('STABILITY_CREDENTIAL_UNAVAILABLE', '稳定性运行凭据不可用。', 'SECURITY');
  const fingerprint = runtimeFingerprint(runtimeProductRoot, executablePath);
  const browser = await loadChromium().launch({
    executablePath,
    headless: options.headless !== false,
    ...(genericTarget ? { args: [chromiumHostResolverRules(targetProfile)] } : {})
  });
  const results = [];
  if (options.forceFailureValidationRunId &&
      !claim.runs.some(run => run.validationRunId === options.forceFailureValidationRunId)) {
    fail('I10_ACCEPTANCE_STABILITY_INJECTION_TARGET_INVALID', '受控稳定性失败样本不属于当前批次。', 'CONTRACT');
  }
  try {
    for (const run of claim.runs) {
      try {
      const execution=claim.bankValidationFixtures ? await resolveStabilityExecution(claim,run,options):{credential};
      results.push(await executeRun(browser, claim, run, {
        ...options,
        productRoot,
        executablePath,
        baseUrl,
        genericTarget,
        allowedOrigins: genericTarget ? stabilityAllowedOrigins(targetProfile, baseUrl) : options.allowedOrigins,
        ignoreHTTPSErrors: targetProfile?.tlsPolicy === 'ALLOW_SELF_SIGNED',
        candidateManifest
      }, execution.credential, fingerprint));
      if(claim.bankValidationFixtures&&results.at(-1).outcome==='FAILED')break;
      } catch(error) {
        return bankStabilityFailureReceipt(claim,error,results,fingerprint,options.workerId||claim.leaseOwner);
      }
    }
  } finally {
    await browser.close();
  }
  return {
    workerId: options.workerId || claim.leaseOwner,
    candidateId: claim.candidateId,
    scriptHash: claim.scriptHash,
    runtimeFingerprint: fingerprint,
    runs: results,
    ...(claim.bankValidationFixtures&&results.at(-1)?.outcome==='FAILED'?{stoppedAfterFailure:true}:{})
  };
}

module.exports = { VIEWPORTS, assertClaim, evidenceDescriptor, executeStabilityBatch, bankStabilityFailureReceipt, resolveStabilityExecution, ordinalForStep, runtimeFingerprint, safeEvidenceDirectory, stabilityAllowedOrigins };
