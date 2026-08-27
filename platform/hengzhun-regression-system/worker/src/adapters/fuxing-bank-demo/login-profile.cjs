const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../../../runtime/node_modules/playwright');
const {
  artifact, quarantinedScreenshotArtifact, throwIfLeaseAborted, bindLeaseAbortToBrowser,
  credentialEnvironmentName, resolveCredential, resolveExecutionCredential, sha256
} = require('../../i10-worker-utils.cjs');

async function executeLoginProfile(task, environment = process.env, options = {}) {
  // I10 tasks retain credentials only as a DPAPI-backed credentialRef.  The
  // Worker resolves that reference just-in-time and supplies it in memory.
  // Keep the alias fallback for replaying older I3/I8 tasks, but never require
  // a legacy environment secret when an injected credential is available.
  const credential = resolveExecutionCredential(task, environment, options);
  const productRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const executablePath = environment.HENGZHUN_CHROMIUM_EXECUTABLE
    || path.join(productRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  if (!fs.existsSync(executablePath)) {
    const error = new Error('固定 Chromium 不可用。');
    error.code = 'CHROMIUM_UNAVAILABLE';
    error.category = 'ENVIRONMENT';
    throw error;
  }

  const portalBaseUrl = (environment.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '');
  const network = [];
  const steps = [];
  const selectorOverrides = task.execution?.selectorOverrides || {};
  const locator = (targetRef, fallback) => selectorOverrides[targetRef]
    ? page.locator(selectorOverrides[targetRef])
    : fallback();
  const atTarget = async (targetRef, operation) => {
    try {
      return await operation();
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        error.code = `${targetRef}_LOCATOR_NOT_FOUND`;
        error.category = 'TEST_FAILURE';
      }
      throw error;
    }
  };
  const browser = await chromium.launch({ executablePath, headless: true });
  const detachLeaseAbort = bindLeaseAbortToBrowser(options.signal, browser);
  const context = await browser.newContext({
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: false
  });
  const page = await context.newPage();
  page.on('response', response => {
    try {
      const url = new URL(response.url());
      if (url.origin === new URL(portalBaseUrl).origin || url.port === '19000') {
        network.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      }
    } catch { }
  });

  try {
    throwIfLeaseAborted(options.signal);
    await page.goto(`${portalBaseUrl}/portal/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    steps.push({ step: 'portal-login-opened', passed: true });
    await atTarget('LOGIN_USERNAME', () => locator('LOGIN_USERNAME', () => page.getByTestId('login-username')).fill(credential.username));
    await atTarget('LOGIN_PASSWORD', () => locator('LOGIN_PASSWORD', () => page.getByTestId('login-password')).fill(credential.password));
    await atTarget('LOGIN_SUBMIT', () => locator('LOGIN_SUBMIT', () => page.getByTestId('login-submit')).click());
    await atTarget('PROFILE_NAME', () => locator('PROFILE_NAME', () => page.getByTestId('customer-profile-name')).waitFor({ state: 'visible', timeout: 30000 }));
    steps.push({ step: 'portal-password-login', passed: true });

    await atTarget('PROFILE_LINK', () => locator('PROFILE_LINK', () => page.getByRole('link', { name: '个人资料', exact: true })).click());
    await atTarget('PROFILE_DISPLAY_NAME', () => locator('PROFILE_DISPLAY_NAME', () => page.getByTestId('profile-display-name')).waitFor({ state: 'visible', timeout: 30000 }));
    await page.waitForFunction(() => {
      const header = document.querySelector('[data-testid="customer-profile-name"]')?.textContent?.trim();
      const profile = document.querySelector('[data-testid="profile-display-name"]')?.textContent?.trim();
      return Boolean(header && profile && header === profile);
    }, undefined, { timeout: 30000 });
    const headerName = (await page.getByTestId('customer-profile-name').innerText()).trim();
    const headerAvatar = (await page.getByTestId('customer-profile-avatar').innerText()).trim();
    const profileName = (await page.getByTestId('profile-display-name').innerText()).trim();
    const expectedAvatar = Array.from(headerName.replace(/\s+/g, ''))[0] || '';
    const assertions = {
      headerNamePresent: headerName.length > 0,
      profileNamePresent: profileName.length > 0,
      namesEqual: headerName === profileName,
      avatarMatchesName: headerAvatar === expectedAvatar
    };
    steps.push({ step: 'identity-consistency-asserted', passed: Object.values(assertions).every(Boolean) });

    const screenshot = await page.screenshot({
      fullPage: true,
      mask: [
        page.getByTestId('profile-customer-id'),
        page.getByTestId('profile-email'),
        page.getByTestId('profile-phone')
      ],
      maskColor: '#202020'
    });
    const passed = Object.values(assertions).every(Boolean);
    const contractPath = path.join(productRoot, 'contracts', 'openapi', 'hengzhun-harness-v1.yaml');
    const report = {
      schemaVersion: 'i3-evidence-v1',
      caseId: task.caseId,
      caseVersion: task.caseVersion,
      runId: task.runId,
      taskId: task.taskId,
      namespace: task.namespace,
      fixtureNamespace: task.execution?.fixtureNamespace,
      sourceCommit: environment.HENGZHUN_SOURCE_COMMIT || 'unknown',
      contractSha256: fs.existsSync(contractPath) ? sha256(fs.readFileSync(contractPath)) : null,
      scriptSha256: sha256(fs.readFileSync(__filename)),
      selectorConfigurationHash: sha256(JSON.stringify(selectorOverrides)),
      assertions,
      identityEvidence: {
        displayNameSha256: sha256(headerName),
        displayNameLength: Array.from(headerName).length,
        avatarSha256: sha256(headerAvatar)
      },
      networkSummary: network.slice(-50),
      passed
    };
    const log = steps.map(item => `${item.passed ? 'PASS' : 'FAIL'} ${item.step}`).join('\n') + '\n';
    const evidence = [
      artifact('REPORT', 'application/json', 'REDACTED', 'json', JSON.stringify(report, null, 2), {
        schemaVersion: report.schemaVersion,
        assertionCount: Object.keys(assertions).length,
        passed
      }),
      quarantinedScreenshotArtifact(screenshot, {
        pageId: 'customer.profile',
        maskedFields: ['customerId', 'email', 'phone']
      }),
      artifact('LOG', 'text/plain; charset=utf-8', 'REDACTED', 'log', log, {
        lineCount: steps.length,
        containsCredentials: false
      })
    ];
    return passed
      ? { outcome: 'PASSED', summary: '门户账号密码登录成功，右上角姓名、头像与个人资料一致。', evidence }
      : {
          outcome: 'FAILED',
          summary: '门户已登录，但姓名、头像或个人资料一致性断言失败。',
          errorCode: 'IDENTITY_ASSERTION_FAILED',
          errorCategory: 'TEST_FAILURE',
          retryable: false,
          userActionRequired: false,
          evidence
        };
  } catch (error) {
    throwIfLeaseAborted(options.signal);
    const loginError = await page.getByTestId('login-error').textContent().catch(() => null);
    if (!error.category) {
      error.category = loginError ? 'TEST_FAILURE' : (error.name === 'TimeoutError' ? 'ENVIRONMENT' : 'TEST_FAILURE');
      error.code = loginError ? 'PORTAL_LOGIN_REJECTED' : (error.name === 'TimeoutError' ? 'PORTAL_TIMEOUT' : 'LOGIN_PROFILE_EXECUTION_FAILED');
    }
    const diagnostic = {
      schemaVersion: 'i3-diagnostic-v1',
      runId: task.runId,
      taskId: task.taskId,
      errorCode: error.code,
      errorCategory: error.category,
      pagePath: (() => { try { return new URL(page.url()).pathname; } catch { return 'unknown'; } })(),
      loginError: loginError ? loginError.slice(0, 300) : null,
      networkSummary: network.slice(-50),
      completedSteps: steps
    };
    const failureEvidence = [artifact('DIAGNOSTIC', 'application/json', 'REDACTED', 'json', JSON.stringify(diagnostic, null, 2), { containsCredentials: false })];
    const failureScreenshot = await page.screenshot({
      fullPage: true,
      mask: [page.getByTestId('login-username'), page.getByTestId('login-password')],
      maskColor: '#202020'
    }).catch(() => null);
    if (failureScreenshot) {
      failureEvidence.push(quarantinedScreenshotArtifact(failureScreenshot, { maskedFields: ['username', 'password'], captureContext: 'FAILURE' }));
    }
    error.evidence = failureEvidence;
    throwIfLeaseAborted(options.signal);
    throw error;
  } finally {
    detachLeaseAbort();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { executeLoginProfile, resolveCredential, credentialEnvironmentName, artifact, quarantinedScreenshotArtifact, sha256 };
