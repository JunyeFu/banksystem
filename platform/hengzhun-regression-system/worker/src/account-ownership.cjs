const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../runtime/node_modules/playwright');
const { artifact, resolveCredential, sha256 } = require('./login-profile.cjs');

async function executeAccountOwnership(task, environment = process.env) {
  const credential = resolveCredential(task.execution?.credentialAlias, environment);
  const productRoot = path.resolve(__dirname, '..', '..');
  const executablePath = environment.HENGZHUN_CHROMIUM_EXECUTABLE
    || path.join(productRoot, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');
  if (!fs.existsSync(executablePath)) {
    const error = new Error('固定 Chromium 不可用。');
    error.code = 'CHROMIUM_UNAVAILABLE';
    error.category = 'ENVIRONMENT';
    throw error;
  }
  const portalBaseUrl = (environment.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '');
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const network = [];
  const ownedAccountIds = new Set();
  page.on('response', async response => {
    try {
      const url = new URL(response.url());
      if (url.pathname === '/api/customer/v1/accounts' && response.ok()) {
        const body = await response.json();
        for (const item of Array.isArray(body?.items) ? body.items : []) {
          if (typeof item.accountId === 'string') ownedAccountIds.add(item.accountId);
        }
      }
      if (url.pathname.startsWith('/api/customer/v1/accounts')) {
        network.push({ method: response.request().method(), route: url.pathname === '/api/customer/v1/accounts' ? 'accounts.list' : 'accounts.detail', status: response.status() });
      }
    } catch { }
  });
  try {
    await page.goto(`${portalBaseUrl}/portal/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByTestId('login-username').fill(credential.username);
    await page.getByTestId('login-password').fill(credential.password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('customer-profile-name').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('link', { name: '账户', exact: true }).click();
    const table = page.locator('.customer-table-card table');
    await table.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.customer-table-card tbody tr').length > 0, undefined, { timeout: 30000 });
    if (ownedAccountIds.size === 0) throw Object.assign(new Error('账户列表没有返回可验证账户。'), { code: 'ACCOUNT_FIXTURE_EMPTY', category: 'TEST_FAILURE' });
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    await Promise.race([
      page.getByRole('tab', { name: '账户信息', exact: true }).waitFor({ state: 'visible', timeout: 30000 }),
      page.getByText('账户详情加载失败', { exact: true }).waitFor({ state: 'visible', timeout: 30000 }).then(() => {
        throw Object.assign(new Error(`本人账户详情加载失败（HTTP ${network.map(item => item.status).slice(-3).join('/')}）。`), {
          code: 'OWN_ACCOUNT_DETAIL_UNAVAILABLE', category: 'TEST_FAILURE'
        });
      })
    ]);
    await page.getByRole('tab', { name: '账户信息', exact: true }).click();
    await page.getByTestId('account-detail-id').waitFor({ state: 'visible', timeout: 30000 });
    const ownPathId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() || '');
    const displayedId = (await page.getByTestId('account-detail-id').innerText()).trim();
    const ownDetailAllowed = ownedAccountIds.has(ownPathId) && displayedId === ownPathId;

    const foreignId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await page.evaluate(id => {
      history.pushState({}, '', `/portal/accounts/${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, foreignId);
    await page.getByText('账户详情加载失败', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    const foreignDetailRejected = await page.getByText('账户详情加载失败', { exact: true }).isVisible();
    const assertions = {
      listContainsAccounts: ownedAccountIds.size > 0,
      ownDetailBelongsToList: ownDetailAllowed,
      foreignDetailRejected,
      independentFixtureNamespace: typeof task.execution?.fixtureNamespace === 'string' && task.execution.fixtureNamespace.startsWith('fx-')
    };
    await page.evaluate(() => {
      history.pushState({}, '', '/portal/accounts');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await table.waitFor({ state: 'visible', timeout: 30000 });
    const screenshot = await page.screenshot({ fullPage: true, mask: [page.locator('.customer-table-card')], maskColor: '#202020' });
    const passed = Object.values(assertions).every(Boolean);
    const report = {
      schemaVersion: 'i4-evidence-v1', caseType: 'ACCOUNT_OWNERSHIP', caseId: task.caseId,
      runId: task.runId, taskId: task.taskId, fixtureNamespace: task.execution?.fixtureNamespace,
      scriptSha256: sha256(fs.readFileSync(__filename)), accountCount: ownedAccountIds.size,
      ownAccountSetSha256: sha256([...ownedAccountIds].sort().join('|')), assertions,
      networkSummary: network.slice(-50), passed
    };
    const log = Object.entries(assertions).map(([name, value]) => `${value ? 'PASS' : 'FAIL'} ${name}`).join('\n') + '\n';
    const evidence = [
      artifact('REPORT', 'application/json', 'REDACTED', 'json', JSON.stringify(report, null, 2), { schemaVersion: report.schemaVersion, passed }),
      artifact('SCREENSHOT', 'image/png', 'REDACTED', 'png', screenshot, { pageId: 'customer.accounts', maskedFields: ['accountTable'] }),
      artifact('LOG', 'text/plain; charset=utf-8', 'REDACTED', 'log', log, { containsCredentials: false })
    ];
    return passed
      ? { outcome: 'PASSED', summary: '账户列表、本人账户详情和越权拒绝断言通过。', evidence }
      : { outcome: 'FAILED', summary: '账户归属或越权拒绝断言失败。', errorCode: 'ACCOUNT_OWNERSHIP_ASSERTION_FAILED', errorCategory: 'TEST_FAILURE', evidence };
  } catch (error) {
    if (!error.category) {
      error.category = error.name === 'TimeoutError' ? 'ENVIRONMENT' : 'TEST_FAILURE';
      error.code = error.name === 'TimeoutError' ? 'PORTAL_TIMEOUT' : 'ACCOUNT_OWNERSHIP_EXECUTION_FAILED';
    }
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { executeAccountOwnership };
