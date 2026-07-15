import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = 'http://127.0.0.1:15175/portal';
const accounts = [
  { accountId: '100001', maskedAccountNumber: '****5302', accountType: '活期账户', balance: '128560.34', currency: 'CNY', status: 'ACTIVE', openedOn: '2025-01-15' },
  { accountId: '100002', maskedAccountNumber: '****7721', accountType: '储蓄账户', balance: '88200.00', currency: 'CNY', status: 'ACTIVE', openedOn: '2025-03-20' },
  { accountId: '100003', maskedAccountNumber: '****9910', accountType: '定期存款', balance: '70450.00', currency: 'CNY', status: 'ACTIVE', openedOn: '2025-06-01' },
];
const transactions = [
  { transactionId: 'TX-1', transactionDate: '2026-07-14T01:03:21Z', transactionType: 'DEBIT', description: '转账', counterparty: '张敏　****8301', amount: '8800.00', currency: 'CNY', runningBalance: '128560.34' },
  { transactionId: 'TX-2', transactionDate: '2026-07-14T00:21:11Z', transactionType: 'CREDIT', description: '工资入账', counterparty: '工资入账', amount: '12000.00', currency: 'CNY', runningBalance: '137360.34' },
  { transactionId: 'TX-3', transactionDate: '2026-07-13T10:45:02Z', transactionType: 'DEBIT', description: '转账', counterparty: '李四　****1223', amount: '1200.00', currency: 'CNY', runningBalance: '125360.34' },
  { transactionId: 'TX-4', transactionDate: '2026-07-12T08:20:33Z', transactionType: 'CREDIT', description: '利息', counterparty: '利息', amount: '60.34', currency: 'CNY', runningBalance: '126560.34' },
];

async function json(route: Route, body: unknown, status = 200): Promise<void> { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function freeze(page: Page): Promise<void> { await page.addInitScript(() => { const fixed = new Date('2026-07-15T02:30:00Z').valueOf(); const NativeDate = Date; class FixedDate extends NativeDate { constructor(...args: ConstructorParameters<typeof Date>) { super(args.length ? args[0] : fixed); } static now(): number { return fixed; } } Object.defineProperty(window, 'Date', { value: FixedDate }); }); }
async function screenshot(page: Page, pv: string): Promise<void> { await page.evaluate(() => window.scrollTo(0, 0)); await expect(page).toHaveScreenshot(`${pv}.png`, { fullPage: false }); }
async function common(page: Page): Promise<void> { await freeze(page); await page.route('**/api/customer/v1/customers/me', (route) => json(route, { customerId: 'customer-demo', displayName: '张三' })); }

test('PV-0001 login shell reference', async ({ page }) => { await freeze(page); await page.goto(`${CUSTOMER}/login`); await expect(page.locator('.login-main')).toHaveScreenshot('PV-0001.png'); });
test('PV-0002 customer portal shell reference', async ({ page }) => { await common(page); await page.route('**/api/customer/v1/accounts', () => new Promise(() => undefined)); await page.goto(`${CUSTOMER}/dashboard`); await expect(page.locator('.customer-header')).toHaveScreenshot('PV-0002.png'); });

test('PV-0006 customer login default', async ({ page }) => { await freeze(page); await page.goto(`${CUSTOMER}/login`); await screenshot(page, 'PV-0006'); });
test('PV-0007 customer login submitting', async ({ page }) => { await freeze(page); await page.addInitScript(() => { sessionStorage.setItem('oidc_state', 'visual-state'); sessionStorage.setItem('pkce_verifier', 'visual-verifier'); }); await page.route('**/protocol/openid-connect/token', () => new Promise(() => undefined)); await page.goto(`${CUSTOMER}/login/callback?code=visual-code&state=visual-state`); await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', 'SUBMITTING'); await screenshot(page, 'PV-0007'); });
test('PV-0008 customer login failure', async ({ page }) => { await freeze(page); await page.addInitScript(() => { sessionStorage.setItem('oidc_state', 'visual-state'); sessionStorage.setItem('pkce_verifier', 'visual-verifier'); }); await page.route('**/protocol/openid-connect/token', (route) => json(route, { error: 'invalid_grant' }, 401)); await page.goto(`${CUSTOMER}/login/callback?code=visual-code&state=visual-state`); await expect(page.getByTestId('login-error')).toBeVisible(); await screenshot(page, 'PV-0008'); });

for (const [pv, state] of [['PV-0009', 'loading'], ['PV-0010', 'normal'], ['PV-0011', 'empty'], ['PV-0012', 'error']] as const) test(`${pv} dashboard ${state}`, async ({ page }) => {
  await common(page); await page.route('**/api/customer/v1/accounts', (route) => state === 'loading' ? new Promise(() => undefined) : state === 'error' ? json(route, { title: 'Unavailable' }, 503) : json(route, { items: state === 'empty' ? [] : accounts }));
  await page.goto(`${CUSTOMER}/dashboard`); if (state !== 'loading') await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'normal' ? 'NORMAL' : state === 'empty' ? 'EMPTY' : 'ERROR'); await screenshot(page, pv);
});

for (const [pv, state] of [['PV-0013', 'loading'], ['PV-0014', 'normal'], ['PV-0015', 'empty'], ['PV-0016', 'error']] as const) test(`${pv} account list ${state}`, async ({ page }) => {
  await common(page); await page.route('**/api/customer/v1/accounts', (route) => state === 'loading' ? new Promise(() => undefined) : state === 'error' ? json(route, { title: 'Unavailable' }, 503) : json(route, { items: state === 'empty' ? [] : accounts }));
  await page.goto(`${CUSTOMER}/accounts`); if (state !== 'loading') await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'normal' ? 'NORMAL' : state === 'empty' ? 'EMPTY' : 'ERROR'); await screenshot(page, pv);
});

for (const [pv, state] of [['PV-0017', 'loading'], ['PV-0018', 'normal'], ['PV-0019', 'empty'], ['PV-0020', 'error']] as const) test(`${pv} account detail ${state}`, async ({ page }) => {
  await common(page); await page.route('**/api/customer/v1/accounts/100001', (route) => state === 'loading' ? new Promise(() => undefined) : state === 'error' ? json(route, { title: 'Unavailable' }, 503) : json(route, { ...accounts[0], transactions: state === 'empty' ? [] : transactions }));
  await page.goto(`${CUSTOMER}/accounts/100001`); if (state === 'normal' || state === 'empty') await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'normal' ? 'NORMAL' : 'EMPTY'); else if (state === 'error') await expect(page.getByText('账户详情加载失败')).toBeVisible(); await screenshot(page, pv);
});

test('account row navigation and statement export are executable', async ({ page }) => {
  await common(page); await page.route('**/api/customer/v1/accounts', (route) => json(route, { items: accounts })); await page.route('**/api/customer/v1/accounts/100001', (route) => json(route, { ...accounts[0], transactions })); await page.route('**/api/customer/v1/statements**', (route) => route.fulfill({ status: 200, contentType: 'text/csv', body: 'date,amount\r\n2026-07-15,10.00\r\n' }));
  await page.goto(`${CUSTOMER}/accounts`); await page.getByText('****5302').click(); await expect(page).toHaveURL(/accounts\/100001$/); const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出交易' }).click(); await download;
  await page.getByRole('tab', { name: '账户信息' }).click(); await expect(page.getByText('100001', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '账户文件' }).click(); await expect(page.getByRole('button', { name: '前往文档中心' })).toBeVisible();
});
