import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = 'http://127.0.0.1:15173/portal';
const OPS = 'http://127.0.0.1:15174/ops';
const transferId = 'TRF-20260715-000042';

type Status = 'CREATED' | 'VALIDATING' | 'RISK_REVIEW' | 'PENDING_APPROVAL' | 'PENDING_CORE_POSTING' | 'PENDING_CLEARING' | 'SETTLED' | 'FAILED' | 'TIMED_OUT' | 'RETURNED' | 'REVERSAL_PENDING' | 'REVERSED';

const transfer = (status: Status = 'SETTLED') => ({
  transferId,
  sourceAccountId: '100001',
  destinationAccountId: '200001',
  maskedDestinationAccount: '**** 6688',
  beneficiaryName: '广东华兴供应链有限公司',
  amount: '8800.00',
  currency: 'CNY',
  status,
  reference: '经营往来',
  coreReference: status === 'SETTLED' ? 'CORE-20260715-8842' : undefined,
  correlationId: 'CORR-20260715-0042',
  createdAt: '2026-07-15T02:20:00Z',
  updatedAt: '2026-07-15T02:23:00Z',
  receiptAvailable: status === 'SETTLED',
  failureCode: status === 'FAILED' ? 'CORE_TRANSFER_REJECTED' : undefined,
  failureDetail: status === 'FAILED' ? '核心记账服务拒绝了本次交易，请核对收款信息。' : undefined,
});

const pageOf = (status: Status = 'SETTLED', empty = false) => ({
  items: empty ? [] : [transfer(status), { ...transfer('PENDING_CLEARING'), transferId: 'TRF-20260715-000041', amount: '12500.00', beneficiaryName: '粤盛实业有限公司' }],
  page: 0,
  size: 20,
  totalItems: empty ? 0 : 2,
  totalPages: empty ? 0 : 1,
});
const operationsPage = (status: Status = 'SETTLED', empty = false) => ({
  ...pageOf(status, empty),
  summary: { total: empty ? 0 : 2, settled: status === 'SETTLED' && !empty ? 1 : 0, processing: status === 'PENDING_CLEARING' && !empty ? 2 : 1, riskReview: status === 'RISK_REVIEW' && !empty ? 1 : 0, failed: status === 'FAILED' && !empty ? 1 : 0 },
});

const detail = (status: Status = 'SETTLED', eventFailed = false) => ({
  ...transfer(status),
  auditCount: 8,
  stateHistory: [
    { historyId: 'H-1', fromStatus: null, toStatus: 'CREATED', actorType: 'CUSTOMER', actorId: 'customer-demo', createdAt: '2026-07-15T02:20:00Z' },
    { historyId: 'H-2', fromStatus: 'CREATED', toStatus: status, actorType: 'SYSTEM', actorId: 'channel-service', reasonCode: eventFailed ? 'EVENT_DELIVERY_FAILED' : undefined, createdAt: '2026-07-15T02:23:00Z' },
  ],
  outboxEvents: [{ eventId: 'EVT-20260715-0042', eventType: 'TransferStateChanged', status: eventFailed ? 'FAILED' : 'PUBLISHED', attemptCount: eventFailed ? 3 : 1, createdAt: '2026-07-15T02:20:01Z', publishedAt: eventFailed ? undefined : '2026-07-15T02:20:02Z' }],
});

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function freeze(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixed = new Date('2026-07-15T02:30:00Z').valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args: ConstructorParameters<typeof Date>) { super(args.length ? args[0] : fixed); }
      static now(): number { return fixed; }
    }
    Object.defineProperty(window, 'Date', { value: FixedDate });
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => '11111111-2222-4333-8444-555555555555' });
  });
}

async function customerCommon(page: Page, singleCandidate = true): Promise<void> {
  await freeze(page);
  const accounts = [{ accountId: '100001', maskedAccountNumber: '**** 8888', accountType: '人民币活期账户', balance: '128000.00', currency: 'CNY' }, { accountId: '100002', maskedAccountNumber: '**** 8899', accountType: '人民币结算账户', balance: '56000.00', currency: 'CNY' }];
  const beneficiaries = [{ beneficiaryId: '9681d8fe-16b6-4cf3-8a6c-4b9845557f31', displayName: '广东华兴供应链有限公司', maskedAccountNumber: '**** 6688' }, { beneficiaryId: '39396a13-3bd0-4803-a43a-24fe878697d5', displayName: '粤盛实业有限公司', maskedAccountNumber: '**** 8890' }];
  await page.route('**/api/customer/v1/accounts', (route) => json(route, { items: singleCandidate ? accounts.slice(0, 1) : accounts }));
  await page.route('**/api/customer/v1/beneficiaries', (route) => json(route, { items: singleCandidate ? beneficiaries.slice(0, 1) : beneficiaries }));
}

async function screenshot(page: Page, pv: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(`${pv}.png`, { fullPage: false });
}

const listCases: Array<[string, 'loading' | 'normal' | 'empty' | Status | 'filter']> = [
  ['PV-0021', 'loading'], ['PV-0022', 'normal'], ['PV-0023', 'empty'], ['PV-0024', 'SETTLED'], ['PV-0025', 'FAILED'], ['PV-0026', 'RISK_REVIEW'], ['PV-0027', 'filter'],
];
for (const [pv, state] of listCases) test(`${pv} customer transfer list ${state}`, async ({ page }) => {
  await freeze(page);
  await page.route('**/api/customer/v1/transfers**', async (route) => {
    if (state === 'loading') return new Promise(() => undefined);
    const fixtureStatus: Status = state === 'SETTLED' || state === 'FAILED' || state === 'RISK_REVIEW' ? state : 'SETTLED';
    await json(route, state === 'empty' ? pageOf('SETTLED', true) : pageOf(fixtureStatus));
  });
  await page.goto(`${CUSTOMER}/transfers`);
  if (state !== 'loading') await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'empty' ? 'EMPTY' : 'NORMAL');
  if (state === 'SETTLED' || state === 'FAILED' || state === 'RISK_REVIEW') {
    const label = state === 'SETTLED' ? '已结算' : state === 'FAILED' ? '失败' : '风险复核';
    await page.getByTestId('transfer-status-filter').click();
    await page.getByText(label, { exact: true }).last().click();
  }
  if (state === 'filter') await page.getByTestId('transfer-status-filter').click();
  await screenshot(page, pv);
});

const createCases: Array<[string, 'default' | 'validation' | 'submitting' | 'error' | 'account-menu' | 'beneficiary-menu' | 'prefilled']> = [
  ['PV-0028', 'default'], ['PV-0029', 'validation'], ['PV-0030', 'submitting'], ['PV-0031', 'error'], ['PV-0032', 'account-menu'], ['PV-0033', 'beneficiary-menu'], ['PV-0034', 'prefilled'],
];
for (const [pv, state] of createCases) test(`${pv} customer transfer create ${state}`, async ({ page }) => {
  await customerCommon(page, state === 'prefilled' || state === 'submitting' || state === 'error');
  await page.route('**/api/customer/v1/transfers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (state === 'submitting') return new Promise(() => undefined);
    if (state === 'error') return json(route, { type: 'about:blank', title: '转账校验失败', status: 422, code: 'TRANSFER_INVALID', detail: '可用余额不足，无法完成本次转账。' }, 422);
    return json(route, { transferId, status: 'CREATED', createdAt: '2026-07-15T02:20:00Z' }, 202);
  });
  await page.goto(`${CUSTOMER}/transfers/new`);
  await expect(page.getByTestId('transfer-form')).toBeVisible();
  if (state === 'validation') await page.getByTestId('transfer-submit').click();
  if (state === 'account-menu') await page.getByTestId('transfer-source-account').click();
  if (state === 'beneficiary-menu') await page.getByTestId('transfer-beneficiary').click();
  if (state === 'submitting' || state === 'error') {
    await page.getByTestId('transfer-amount').fill('8800');
    await page.getByTestId('transfer-submit').click();
    if (state === 'error') await expect(page.getByTestId('transfer-error')).toBeVisible();
    else await expect(page.locator('[data-view-state="SUBMITTING"]')).toBeVisible();
  }
  if (state === 'prefilled') await expect(page.getByText('广东华兴供应链有限公司').first()).toBeVisible();
  await screenshot(page, pv);
});

const resultCases: Array<[string, Status | 'missing']> = [['PV-0035', 'SETTLED'], ['PV-0036', 'FAILED'], ['PV-0037', 'PENDING_APPROVAL'], ['PV-0038', 'missing']];
for (const [pv, state] of resultCases) test(`${pv} customer transfer result ${state}`, async ({ page }) => {
  await freeze(page);
  await page.route(`**/api/customer/v1/transfers/${transferId}`, (route) => state === 'missing' ? json(route, { title: 'Not Found', status: 404, code: 'TRANSFER_NOT_FOUND' }, 404) : json(route, transfer(state)));
  await page.goto(`${CUSTOMER}/transfers/${transferId}`);
  if (state === 'missing') await expect(page.getByText('未找到转账数据')).toBeVisible();
  else await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state);
  await screenshot(page, pv);
});

test('customer create to operations observation to customer settlement and receipt', async ({ page }) => {
  await customerCommon(page);
  let currentStatus: Status = 'CREATED';
  await page.route('**/api/customer/v1/transfers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const request = route.request();
    expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.postDataJSON()).toMatchObject({ sourceAccountId: '100001', beneficiaryId: '9681d8fe-16b6-4cf3-8a6c-4b9845557f31', amount: '8800.00', currency: 'CNY' });
    await json(route, { transferId, status: 'CREATED', amount: '8800.00', currency: 'CNY', correlationId: 'CORR-20260715-0042' }, 202);
  });
  await page.route(`**/api/customer/v1/transfers/${transferId}`, (route) => json(route, transfer(currentStatus)));
  await page.route(`**/api/customer/v1/transfers/${transferId}/receipt?format=pdf`, (route) => route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': `attachment; filename="receipt-${transferId}.pdf"` }, body: '%PDF-1.4 synthetic receipt' }));
  await page.goto(`${CUSTOMER}/transfers/new`);
  await page.getByTestId('transfer-amount').fill('8800');
  await page.getByTestId('transfer-submit').click();
  await expect(page).toHaveURL(`${CUSTOMER}/transfers/${transferId}`);
  await expect(page.getByText('转账处理中')).toBeVisible();

  currentStatus = 'SETTLED';
  await expect(page.getByText('转账已成功')).toBeVisible({ timeout: 5_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('transfer-receipt-download').click();
  expect((await downloadPromise).suggestedFilename()).toContain(transferId);

  await page.route('**/api/operations/v1/transfers**', (route) => json(route, operationsPage('SETTLED')));
  await page.goto(`${OPS}/payments`);
  await expect(page.getByText(transferId)).toBeVisible();
  await expect(page.getByText('已结算').first()).toBeVisible();
});

test('customer receipt failure is rendered without a false download success', async ({ page }) => {
  await freeze(page);
  await page.route(`**/api/customer/v1/transfers/${transferId}`, (route) => json(route, transfer('SETTLED')));
  await page.route(`**/api/customer/v1/transfers/${transferId}/receipt?format=pdf`, (route) => json(route, { type: 'about:blank', title: 'Receipt unavailable', status: 503, code: 'RECEIPT_UNAVAILABLE' }, 503));
  await page.goto(`${CUSTOMER}/transfers/${transferId}`);
  await page.getByTestId('transfer-receipt-download').click();
  await expect(page.getByText('电子回单下载失败')).toBeVisible();
});

const monitorCases: Array<[string, 'loading' | 'normal' | 'empty' | 'risk' | 'failed' | 'filter', boolean]> = [
  ['PV-0072','loading',false], ['PV-0073','normal',false], ['PV-0074','empty',false], ['PV-0075','risk',false], ['PV-0076','failed',false], ['PV-0077','filter',false],
  ['PV-0078','loading',true], ['PV-0079','normal',true], ['PV-0080','empty',true], ['PV-0081','risk',true], ['PV-0082','failed',true], ['PV-0083','filter',true],
];
for (const [pv, state, collapsed] of monitorCases) test(`${pv} operations monitoring ${state} ${collapsed ? 'collapsed' : 'expanded'}`, async ({ page }) => {
  await freeze(page);
  await page.route('**/api/operations/v1/transfers**', async (route) => {
    if (state === 'loading') return new Promise(() => undefined);
    const status: Status = state === 'risk' ? 'RISK_REVIEW' : state === 'failed' ? 'FAILED' : 'SETTLED';
    await json(route, operationsPage(status, state === 'empty'));
  });
  await page.goto(`${OPS}/payments`);
  if (collapsed) await page.locator('.ops-collapse').click();
  if (state !== 'loading') await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'empty' ? 'EMPTY' : 'NORMAL');
  if (state === 'filter') await page.getByTestId('payment-status-filter').click();
  await screenshot(page, pv);
});

test('operations filters, aggregate summary, row navigation and CSV export are executable', async ({ page }) => {
  await freeze(page);
  const observed: string[] = [];
  await page.route('**/api/operations/v1/transfers**', async (route) => { observed.push(route.request().url()); await json(route, operationsPage('SETTLED')); });
  await page.route('**/api/operations/v1/transfers/export**', (route) => route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'Content-Disposition': 'attachment; filename="transfer-monitoring.csv"' }, body: 'transferId,status\r\nTRF-20260715-000042,SETTLED\r\n' }));
  await page.goto(`${OPS}/payments`);
  await expect(page.getByText('2').first()).toBeVisible();
  await page.getByTestId('payment-currency-filter').click();
  await page.getByText('CNY', { exact: true }).last().click();
  await page.getByTestId('payment-status-filter').click();
  await page.getByText('已结算', { exact: true }).last().click();
  await page.getByTestId('payment-search').fill('CORR-20260715-0042');
  await page.getByTestId('payment-query').click();
  await expect.poll(() => observed.some((url) => url.includes('status=SETTLED') && url.includes('currency=CNY') && url.includes('query=CORR-20260715-0042'))).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('payment-export').click();
  expect((await downloadPromise).suggestedFilename()).toContain('transfer-monitoring');
  await page.getByText(transferId).click();
  await expect(page).toHaveURL(`${OPS}/payments/${transferId}`);
});

test('operations export failure is shown as an actionable page error', async ({ page }) => {
  await freeze(page);
  await page.route('**/api/operations/v1/transfers**', (route) => json(route, operationsPage('SETTLED')));
  await page.route('**/api/operations/v1/transfers/export**', (route) => json(route, { type: 'about:blank', title: 'Export unavailable', status: 503, code: 'EXPORT_UNAVAILABLE' }, 503));
  await page.goto(`${OPS}/payments`);
  await page.getByTestId('payment-export').click();
  await expect(page.getByText('导出失败', { exact: true })).toBeVisible();
});

const detailCases: Array<[string, 'normal' | 'event-failed' | 'missing', boolean]> = [
  ['PV-0084','normal',false], ['PV-0085','event-failed',false], ['PV-0086','missing',false], ['PV-0087','normal',true], ['PV-0088','event-failed',true], ['PV-0089','missing',true],
];
for (const [pv, state, collapsed] of detailCases) test(`${pv} operations detail ${state} ${collapsed ? 'collapsed' : 'expanded'}`, async ({ page }) => {
  await freeze(page);
  await page.route(`**/api/operations/v1/transfers/${transferId}`, (route) => state === 'missing' ? json(route, { title: 'Not Found', status: 404, code: 'TRANSFER_NOT_FOUND' }, 404) : json(route, detail('SETTLED', state === 'event-failed')));
  await page.goto(`${OPS}/payments/${transferId}`);
  if (collapsed) await page.locator('.ops-collapse').click();
  if (state === 'missing') await expect(page.getByText('支付详情不存在或无权访问')).toBeVisible();
  else await expect(page.getByTestId('payment-detail-outbox-table').getByText(state === 'event-failed' ? 'FAILED' : 'PUBLISHED')).toBeVisible();
  await screenshot(page, pv);
});
