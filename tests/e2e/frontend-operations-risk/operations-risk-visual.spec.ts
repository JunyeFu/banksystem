import { expect, test, type Page, type Route } from '@playwright/test';
const OPS = 'http://127.0.0.1:15176/ops';
const alerts = [
  { alertId: '11111111-1111-4111-8111-111111111111', severity: 'CRITICAL', status: 'ACTIVE', ruleName: '大额交易硬限额', entityType: 'TRANSFER', entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', description: '交易金额超过单笔硬限额，系统已自动拦截。', score: 95, triggeredAt: '2026-07-15T01:42:00Z', acknowledgedBy: null, resolvedAt: null },
  { alertId: '22222222-2222-4222-8222-222222222222', severity: 'HIGH', status: 'ACTIVE', ruleName: '人工复核阈值', entityType: 'TRANSFER', entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', description: '交易金额达到人工复核阈值。', score: 72, triggeredAt: '2026-07-15T01:30:00Z', acknowledgedBy: null, resolvedAt: null },
  { alertId: '33333333-3333-4333-8333-333333333333', severity: 'LOW', status: 'RESOLVED', ruleName: '标准交易规则', entityType: 'TRANSFER', entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', description: '复核完成，交易风险已解除。', score: 20, triggeredAt: '2026-07-15T00:58:00Z', acknowledgedBy: 'risk-checker', resolvedAt: '2026-07-15T01:08:00Z' },
];
const cases = [
  { caseId: '11111111-1111-4111-8111-111111111111', transferId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', customerSubject: '企业客户-华兴供应链', decision: 'BLOCK', status: 'OPEN', score: 95, triggeredRules: ['大额交易硬限额'], maker: 'risk-engine', checker: null, version: 1, createdAt: '2026-07-15T01:42:00Z', reviewedAt: null },
  { caseId: '22222222-2222-4222-8222-222222222222', transferId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', customerSubject: '企业客户-粤盛实业', decision: 'REVIEW', status: 'UNDER_REVIEW', score: 72, triggeredRules: ['人工复核阈值'], maker: 'payment-operator', checker: null, version: 1, createdAt: '2026-07-15T01:30:00Z', reviewedAt: null },
  { caseId: '33333333-3333-4333-8333-333333333333', transferId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', customerSubject: '个人客户-演示账户', decision: 'ALLOW', status: 'APPROVED', score: 20, triggeredRules: ['标准交易规则'], maker: 'risk-engine', checker: 'risk-checker', version: 2, createdAt: '2026-07-15T00:58:00Z', reviewedAt: '2026-07-15T01:08:00Z' },
];
async function freeze(page: Page): Promise<void> { await page.addInitScript(() => { const fixed = new Date('2026-07-15T02:30:00Z').valueOf(); const NativeDate = Date; class FixedDate extends NativeDate { constructor(...args: ConstructorParameters<typeof Date>) { super(args.length ? args[0] : fixed); } static now(): number { return fixed; } } Object.defineProperty(window, 'Date', { value: FixedDate }); }); }
async function json(route: Route, body: unknown): Promise<void> { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
async function shot(page: Page, pv: string): Promise<void> { await expect(page).toHaveScreenshot(`${pv}.png`, { fullPage: false }); }

const alertCases = [
  ['PV-0090','loading',false],['PV-0091','normal',false],['PV-0092','empty',false],['PV-0093','ACTIVE',false],['PV-0094','RESOLVED',false],
  ['PV-0095','loading',true],['PV-0096','normal',true],['PV-0097','empty',true],['PV-0098','ACTIVE',true],['PV-0099','RESOLVED',true],
] as const;
for (const [pv,state,collapsed] of alertCases) test(`${pv} risk alerts ${state}`, async ({ page }) => {
  await freeze(page); await page.route('**/api/operations/v1/risk/alerts**', async (route) => {
    if (state === 'loading') return new Promise(() => undefined); if (state === 'empty') return json(route, []);
    const requested = new URL(route.request().url()).searchParams.get('status'); return json(route, requested ? alerts.filter((item) => item.status === requested) : alerts);
  });
  await page.goto(`${OPS}/risk/alerts`); if (collapsed) await page.locator('.ops-collapse').click();
  if (state === 'ACTIVE' || state === 'RESOLVED') { await page.getByTestId('risk-alert-status-filter').click(); await page.getByText(state === 'ACTIVE' ? '活跃' : '已解决', { exact: true }).last().click(); }
  await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'normal' ? 'NORMAL' : state === 'loading' ? 'LOADING' : state === 'empty' ? 'EMPTY' : state); await shot(page,pv);
});
const caseCases = [
  ['PV-0100','loading',false],['PV-0101','normal',false],['PV-0102','empty',false],['PV-0103','UNDER_REVIEW',false],
  ['PV-0104','loading',true],['PV-0105','normal',true],['PV-0106','empty',true],['PV-0107','UNDER_REVIEW',true],
] as const;
for (const [pv,state,collapsed] of caseCases) test(`${pv} risk cases ${state}`, async ({ page }) => {
  await freeze(page); await page.route('**/api/operations/v1/risk/cases**', async (route) => {
    if (state === 'loading') return new Promise(() => undefined); if (state === 'empty') return json(route, []);
    const requested = new URL(route.request().url()).searchParams.get('status'); return json(route, requested ? cases.filter((item) => item.status === requested) : cases);
  });
  await page.goto(`${OPS}/risk/cases`); if (collapsed) await page.locator('.ops-collapse').click();
  if (state === 'UNDER_REVIEW') { await page.getByTestId('risk-case-status-filter').click(); await page.getByText('复核中', { exact: true }).last().click(); }
  await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'normal' ? 'NORMAL' : state === 'loading' ? 'LOADING' : state === 'empty' ? 'EMPTY' : state); await shot(page,pv);
});
test('risk case detail opens without exposing a mutation action', async ({ page }) => { await freeze(page); await page.route('**/api/operations/v1/risk/cases**', route => json(route, cases)); await page.goto(`${OPS}/risk/cases`); await page.getByTestId(`risk-case-open-${cases[0].caseId}`).click(); await expect(page.getByTestId('risk-case-drawer')).toBeVisible(); await expect(page.getByText('当前页面仅提供审阅')).toBeVisible(); });
test('risk alert detail opens without exposing a mutation action', async ({ page }) => { await freeze(page); await page.route('**/api/operations/v1/risk/alerts**', route => json(route, alerts)); await page.goto(`${OPS}/risk/alerts`); await page.getByTestId(`risk-alert-open-${alerts[0].alertId}`).click(); await expect(page.getByTestId('risk-alert-drawer')).toBeVisible(); await expect(page.getByText('当前页面仅提供告警审阅')).toBeVisible(); });
test('risk alert severity filter narrows the visible list', async ({ page }) => { await freeze(page); await page.route('**/api/operations/v1/risk/alerts**', route => json(route, alerts)); await page.goto(`${OPS}/risk/alerts`); await page.getByTestId('risk-alert-severity-filter').click(); await page.getByText('严重', { exact: true }).last().click(); await expect(page.getByText('大额交易硬限额')).toBeVisible(); await expect(page.getByText('人工复核阈值')).toHaveCount(0); });
