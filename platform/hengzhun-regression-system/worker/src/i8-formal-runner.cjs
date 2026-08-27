'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { executeCandidatePackage } = require('./i8-candidate-runner.cjs');
const {
  artifact, throwIfLeaseAborted, bindLeaseAbortToBrowser,
  assertTargetUrlResolution, chromiumHostResolverRules, resolveCredential, sha256
} = require('./i10-worker-utils.cjs');
const { policyForAction } = require('./i10-verification-policy.cjs');
const { requiresVisibleVerification, runVerificationPolicy } = require('./i10-verification-execution.cjs');

const EMPTY_SCREENSHOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function loadChromium() {
  return require('../../runtime/node_modules/playwright').chromium;
}

function fail(code, message, category = 'ENVIRONMENT') {
  throw Object.assign(new Error(message), { code, category });
}

function formalBaseUrl(task, environment, options) {
  const targetProfile = task.execution?.targetProfile;
  if (targetProfile) {
    const parsed = new URL(targetProfile.launchUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || targetProfile.status !== 'ACTIVE') {
      fail('I10_TARGET_PROFILE_BINDING_INVALID', '目标站点档案无效或未激活。', 'AUTHORIZATION');
    }
    // Candidate packages resolve their frozen route references against a site
    // origin, not the launch page.  A TargetProfile may legitimately use a
    // page such as /portal/login as its launch URL, but passing that pathname
    // through makes the candidate runner reject the base URL before it can
    // execute its (possibly absolute) frozen routes.
    return new URL('/', parsed).href;
  }
  const i10EntryUrl = options.entryUrl || task.execution?.entryUrl;
  if (i10EntryUrl) {
    let parsed;
    try { parsed = new URL(i10EntryUrl); }
    catch { fail('I10_ENTRY_URL_INVALID', 'I10 正式执行入口不是有效 URL。', 'CONTRACT'); }
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'http:' || !loopback || parsed.username || parsed.password
      || parsed.pathname !== '/portal/login' || parsed.search || parsed.hash) {
      fail('I10_ENTRY_URL_NOT_ALLOWED', 'I10 正式执行入口不在受控本机门户白名单中。', 'AUTHORIZATION');
    }
    return new URL('/', parsed).href;
  }
  return (environment.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '') + '/';
}

function runtimeAllowedOrigins(task, baseUrl) {
  const targetProfile = task.execution?.targetProfile;
  const origins = new Set(targetProfile
    ? [
        ...(Array.isArray(targetProfile.allowedNavigationOrigins) ? targetProfile.allowedNavigationOrigins : []),
        ...(Array.isArray(targetProfile.allowedInteractionOrigins) ? targetProfile.allowedInteractionOrigins : []),
        ...(Array.isArray(targetProfile.credentialOrigins) ? targetProfile.credentialOrigins : [])
      ]
    : [new URL(baseUrl).origin, 'http://127.0.0.1:18443', 'http://127.0.0.1:19000']);
  const adapter = targetProfile?.adapterBinding;
  // A dependency origin is an adapter property, never a target-name or
  // launch-path inference. Generic targets may only use frozen origins.
  if (adapter?.adapterId === 'fuxing-bank-demo' && adapter?.adapterVersion === '1.0.0') {
    origins.add('http://127.0.0.1:19000');
  }
  return origins;
}

function safePageLocation(page) {
  try {
    const value = new URL(page.url());
    return `${value.origin}${value.pathname}`;
  } catch {
    return null;
  }
}

async function safePageFingerprint(page) {
  try {
    const snapshot = await page.evaluate(() => ({
      title: document.title || '',
      path: location.pathname || '',
      testIds: [...document.querySelectorAll('[data-testid]')]
        .map(node => node.getAttribute('data-testid') || '')
        .filter(Boolean)
        .sort()
        .slice(0, 128)
    }));
    return sha256(JSON.stringify(snapshot));
  } catch {
    return null;
  }
}

function ordinalForStep(step) {
  const match = String(step?.stepId || '').match(/^dsl_(\d{2,})$/);
  return match ? Number(match[1]) : 0;
}

function quarantinedScreenshotArtifact(content, metadata = {}) {
  return artifact('SCREENSHOT', 'image/png', 'QUARANTINED', 'png', content, {
    ...metadata,
    pixelRedactionVerified: false,
    quarantineReason: 'PIXEL_REDACTION_NOT_VERIFIED'
  });
}

async function executeI8FormalRun(task, environment = process.env, options = {}) {
  const descriptor = task.execution?.candidate;
  if (!descriptor?.candidateId || !descriptor.relativeDirectory || !descriptor.scriptHash || !descriptor.manifestHash) {
    fail('I8_CANDIDATE_DESCRIPTOR_INVALID', '正式执行缺少冻结候选身份。', 'CONTRACT');
  }
  const credential = options.credential || resolveCredential(task.execution?.credentialAlias, environment);
  if (!credential || typeof credential.username !== 'string' || typeof credential.password !== 'string'
    || !credential.username || !credential.password) {
    fail('I10_CREDENTIAL_RESOLUTION_INVALID', '正式执行未获得有效的进程内凭据。', 'AUTHORIZATION');
  }
  const productRoot = path.resolve(options.productRoot || path.resolve(__dirname, '..', '..'));
  const runtimeProductRoot = path.resolve(options.runtimeProductRoot || path.resolve(__dirname, '..', '..'));
  const executablePath = environment.HENGZHUN_CHROMIUM_EXECUTABLE
    || path.join(runtimeProductRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  if (!fs.existsSync(executablePath)) fail('CHROMIUM_UNAVAILABLE', '固定 Chromium 不可用。');
  const baseUrl = formalBaseUrl(task, environment, options);
  const targetProfile = task.execution?.targetProfile;
  const allowedOrigins = runtimeAllowedOrigins(task, baseUrl);
  if (targetProfile) {
    for (const origin of allowedOrigins) await assertTargetUrlResolution(origin, targetProfile);
  }
  const candidateManifestPath = path.resolve(productRoot, descriptor.relativeDirectory, 'manifest.json');
  let candidateManifest;
  try { candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8')); }
  catch { fail('I8_CANDIDATE_MANIFEST_UNREADABLE', '正式执行无法读取冻结候选清单。', 'CONTRACT'); }
  // A handoff can only work when the original browser context is visible from
  // the beginning.  Headless runs remain the default for ordinary policies.
  const visibleHandoff = requiresVisibleVerification(candidateManifest, typeof options.onVerificationChallenge === 'function');
  const browser = await loadChromium().launch({
    executablePath,
    headless: !visibleHandoff,
    ...(targetProfile ? { args: [chromiumHostResolverRules(targetProfile)] } : {})
  });
  const detachLeaseAbort = bindLeaseAbortToBrowser(options.signal, browser);
  const context = await browser.newContext({
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: targetProfile?.tlsPolicy === 'ALLOW_SELF_SIGNED'
  });
  const page = await context.newPage();
  let screenshot = EMPTY_SCREENSHOT;
  let currentStep = null;
  try {
    throwIfLeaseAborted(options.signal);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || allowedOrigins.has(url.origin)) return route.continue();
      return route.abort('blockedbyclient');
    });
    const result = await executeCandidatePackage({ productRoot, ...descriptor }, {
      baseUrl,
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
          mask: targetProfile ? [
            currentPage.locator('input[type="password"]'),
            currentPage.locator('input[autocomplete*="username"],input[autocomplete*="email"],input[autocomplete*="tel"]')
          ] : [
            currentPage.getByTestId('login-username'), currentPage.getByTestId('login-password'),
            currentPage.getByTestId('customer-profile-name'), currentPage.getByTestId('customer-profile-avatar'),
            currentPage.getByTestId('profile-display-name'), currentPage.getByTestId('profile-avatar'),
            currentPage.getByTestId('profile-customer-id'), currentPage.getByTestId('profile-email'), currentPage.getByTestId('profile-phone'),
            currentPage.getByTestId('transfer-recipient-name'), currentPage.getByTestId('transfer-recipient-account'),
            currentPage.getByTestId('transfer-amount'), currentPage.getByTestId('transfer-purpose')
          ],
          maskColor: '#202020'
        });
      },
      afterStep: async (step, currentPage, storedPolicy) => {
        const policy = storedPolicy || policyForAction(
          { semanticTargetRef: step.targetRef }, task.execution?.fixtureProfile, targetProfile?.adapterBinding
        );
        await runVerificationPolicy(currentPage, policy, {
          namespace: task.namespace,
          taskRef: task.taskId,
          actionOrdinal: ordinalForStep(step),
          onVerificationAttempt: options.onVerificationAttempt,
          allowExternalFallback: visibleHandoff,
          onExternalChallenge: options.onVerificationChallenge
            ? attempts => options.onVerificationChallenge({
              verificationType: 'USER_ASSISTED',
              userPreparation: '请在当前可见浏览器会话中完成页面验证后再点击 proceed。',
              namespace: task.namespace,
              taskRef: task.taskId,
              actionOrdinal: ordinalForStep(step),
              attempts
            })
            : undefined,
          assertSuccessEvidence: async targetRef => currentPage.getByTestId(targetRef === 'ORDER_NUMBER' ? 'transfer-order-number' : targetRef)
            .waitFor({ state: 'visible', timeout: 15_000 })
        });
      },
      onStep: async (step) => { currentStep = { ...step, pageUrl: safePageLocation(page) }; }
    });
    const facts = Array.isArray(result.facts) ? result.facts.map(item => ({ stepId: item.stepId, operation: item.operation, passed: item.passed })) : [];
    const passed = result.outcome === 'PASSED' && facts.length > 0 && facts.every(item => item.passed === true);
    const report = {
      schemaVersion: 'i8-formal-run-report-v1', runId: task.runId, taskId: task.taskId,
      caseId: task.caseId, caseVersion: task.caseVersion, candidateId: descriptor.candidateId,
      scriptHash: descriptor.scriptHash, manifestHash: descriptor.manifestHash,
      freshBrowserContext: true, deterministicPlaywrightOnly: true,
      assertionSetHash: sha256(JSON.stringify(facts)), assertions: facts, passed
    };
    const evidence = [
      artifact('REPORT', 'application/json', 'REDACTED', 'json', JSON.stringify(report, null, 2), { schemaVersion: report.schemaVersion, passed }),
      quarantinedScreenshotArtifact(screenshot),
      artifact('LOG', 'text/plain; charset=utf-8', 'REDACTED', 'log', `${facts.map(item => `${item.passed ? 'PASS' : 'FAIL'} ${item.stepId} ${item.operation}`).join('\n')}\n`, { containsCredentials: false })
    ];
    return passed
      ? { outcome: 'PASSED', summary: '已激活脚本通过纯 Playwright 正式回归。', evidence }
      : { outcome: 'FAILED', summary: '已激活脚本正式回归断言失败。', errorCode: 'I8_FORMAL_ASSERTION_FAILED', errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: false, evidence };
  } catch (error) {
    throwIfLeaseAborted(options.signal);
    if (!error.code && error.name === 'TimeoutError' && currentStep?.stepId) {
      // Do not infer a page control from arbitrary timeout text.  The frozen
      // step reference in the diagnostic is the factual boundary; a later
      // repair flow can choose a locator candidate from that evidence.
      error.code = 'I8_CANDIDATE_STEP_TIMEOUT';
      error.category = 'TEST_FAILURE';
    }
    const diagnostic = {
      schemaVersion: 'i8-formal-diagnostic-v2', taskId: task.taskId, runId: task.runId,
      candidateId: descriptor.candidateId, errorCode: error.code || 'I8_FORMAL_EXECUTION_FAILED',
      errorClass: String(error?.name || 'Error').slice(0, 80),
      failureStage: currentStep?.phase || 'BEFORE_FIRST_STEP',
      stepId: currentStep?.stepId || null,
      operation: currentStep?.operation || null,
      targetRef: currentStep?.targetRef || null,
      pageLocation: safePageLocation(page),
      pageFingerprint: await safePageFingerprint(page)
    };
    // This boundary is intentionally duplicated in the completion envelope:
    // the Harness needs the same structured fact to distinguish a frozen
    // locator failure from generic candidate-script logic.  No raw error text,
    // page content or credentials cross this boundary.
    error.failureDiagnostic = diagnostic;
    error.evidence = [
      artifact('DIAGNOSTIC', 'application/json', 'REDACTED', 'json', JSON.stringify(diagnostic, null, 2), { containsCredentials: false }),
      quarantinedScreenshotArtifact(await page.screenshot({
        fullPage: true,
        mask: [
          page.getByTestId('login-username'), page.getByTestId('login-password'),
          page.getByTestId('transfer-recipient-name'), page.getByTestId('transfer-recipient-account'),
          page.getByTestId('transfer-amount'), page.getByTestId('transfer-purpose')
        ],
        maskColor: '#202020'
      }).catch(() => EMPTY_SCREENSHOT), { captureContext: 'FAILURE' })
    ];
    if (!error.category) error.category = error.name === 'TimeoutError' ? 'ENVIRONMENT' : 'TEST_FAILURE';
    throwIfLeaseAborted(options.signal);
    throw error;
  } finally {
    detachLeaseAbort();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { executeI8FormalRun, formalBaseUrl, ordinalForStep, quarantinedScreenshotArtifact, runtimeAllowedOrigins };
