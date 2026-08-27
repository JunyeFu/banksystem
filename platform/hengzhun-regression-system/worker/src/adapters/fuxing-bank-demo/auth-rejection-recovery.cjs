const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../../../runtime/node_modules/playwright');
const { artifact, quarantinedScreenshotArtifact, sha256 } = require('./login-profile.cjs');
const { throwIfLeaseAborted, bindLeaseAbortToBrowser, resolveExecutionCredential } = require('../../i10-worker-utils.cjs');

async function login(page, username, password) {
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

async function executeAuthRejectionRecovery(task, environment = process.env, options = {}) {
  const credential = resolveExecutionCredential(task, environment, options);
  const productRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const executablePath = environment.HENGZHUN_CHROMIUM_EXECUTABLE
    || path.join(productRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  if (!fs.existsSync(executablePath)) throw Object.assign(new Error('固定 Chromium 不可用。'), { code: 'CHROMIUM_UNAVAILABLE', category: 'ENVIRONMENT' });
  const portalBaseUrl = (environment.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '');
  const browser = await chromium.launch({ executablePath, headless: true });
  const detachLeaseAbort = bindLeaseAbortToBrowser(options.signal, browser);
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const authStatuses = [];
  page.on('response', response => {
    try { if (new URL(response.url()).pathname.endsWith('/protocol/openid-connect/token')) authStatuses.push(response.status()); } catch { }
  });
  try {
    throwIfLeaseAborted(options.signal);
    await page.goto(`${portalBaseUrl}/portal/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const impossiblePassword = `invalid-${task.execution?.fixtureNamespace || 'fixture'}-not-a-secret`;
    await login(page, credential.username, impossiblePassword);
    await page.getByTestId('login-error').waitFor({ state: 'visible', timeout: 30000 });
    const wrongCredentialRejected = new URL(page.url()).pathname === '/portal/login' && await page.getByTestId('login-error').isVisible();
    await login(page, credential.username, credential.password);
    await page.getByTestId('customer-profile-name').waitFor({ state: 'visible', timeout: 30000 });
    const recoveredAfterRejection = new URL(page.url()).pathname.startsWith('/portal/');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-title').waitFor({ state: 'visible', timeout: 30000 });
    const expiredSessionRejected = new URL(page.url()).pathname === '/portal/login';
    await login(page, credential.username, credential.password);
    await page.getByTestId('customer-profile-name').waitFor({ state: 'visible', timeout: 30000 });
    const recoveredAfterExpiry = new URL(page.url()).pathname.startsWith('/portal/');
    const assertions = {
      wrongCredentialRejected,
      noAuthenticatedViewAfterWrongCredential: wrongCredentialRejected,
      recoveredAfterRejection,
      expiredSessionRejected,
      recoveredAfterExpiry,
      observedRejectedAndSuccessfulTokenRequests: authStatuses.some(status => status >= 400) && authStatuses.filter(status => status === 200).length >= 2
    };
    const screenshot = await page.screenshot({ fullPage: true, mask: [page.getByTestId('customer-profile-menu')], maskColor: '#202020' });
    const passed = Object.values(assertions).every(Boolean);
    const report = {
      schemaVersion: 'i4-evidence-v1', caseType: 'AUTH_REJECTION_RECOVERY', caseId: task.caseId,
      runId: task.runId, taskId: task.taskId, fixtureNamespace: task.execution?.fixtureNamespace,
      scriptSha256: sha256(fs.readFileSync(__filename)), tokenRequestStatusClasses: authStatuses.map(status => Math.floor(status / 100) + 'xx'), assertions, passed
    };
    const log = Object.entries(assertions).map(([name, value]) => `${value ? 'PASS' : 'FAIL'} ${name}`).join('\n') + '\n';
    const evidence = [
      artifact('REPORT', 'application/json', 'REDACTED', 'json', JSON.stringify(report, null, 2), { schemaVersion: report.schemaVersion, passed }),
      quarantinedScreenshotArtifact(screenshot, { pageId: 'customer.dashboard', maskedFields: ['profileMenu'] }),
      artifact('LOG', 'text/plain; charset=utf-8', 'REDACTED', 'log', log, { containsCredentials: false })
    ];
    return passed
      ? { outcome: 'PASSED', summary: '错误凭据与失效会话均被安全拒绝，重新登录恢复成功。', evidence }
      : { outcome: 'FAILED', summary: '身份拒绝或恢复断言失败。', errorCode: 'AUTH_RECOVERY_ASSERTION_FAILED', errorCategory: 'TEST_FAILURE', evidence };
  } catch (error) {
    throwIfLeaseAborted(options.signal);
    if (!error.category) {
      error.category = error.name === 'TimeoutError' ? 'ENVIRONMENT' : 'TEST_FAILURE';
      error.code = error.name === 'TimeoutError' ? 'PORTAL_TIMEOUT' : 'AUTH_RECOVERY_EXECUTION_FAILED';
    }
    throwIfLeaseAborted(options.signal);
    throw error;
  } finally {
    detachLeaseAbort();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { executeAuthRejectionRecovery };
