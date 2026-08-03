import { expect, test, type Page, type Route } from '@playwright/test';
const OPS = 'http://127.0.0.1:15179/ops';
const clearingBase = { batchId: 'CLR-20260715-CNY', businessDate: '2026-07-15', status: 'COMPLETED', totalItems: 1286, settledItems: 1284, failedItems: 2, totalAmount: '26845019.32', currency: 'CNY', startedAt: '2026-07-15T01:05:00Z', completedAt: '2026-07-15T01:12:18Z' };
const reconciliationBase = { runId: '11111111-1111-4111-8111-111111111111', type: 'CHANNEL_TO_CORE', status: 'MATCHED', differenceCount: 0, details: '渠道流水与核心入账记录全部匹配。', createdAt: '2026-07-15T01:25:00Z' };
const eodBase = { runId: '22222222-2222-4222-8222-222222222222', businessDate: '2026-07-15', status: 'COMPLETED', reconciliationStatus: 'MATCHED', reason: null, stepsCompleted: ['渠道与核心对账完成', '清算批次状态核验完成', '业务日期结转完成'], startedAt: '2026-07-15T01:30:00Z', completedAt: '2026-07-15T01:34:20Z' };
async function freeze(page: Page): Promise<void> { await page.addInitScript(() => { const fixed=new Date('2026-07-15T02:30:00Z').valueOf(); const NativeDate=Date; class FixedDate extends NativeDate { constructor(...args: ConstructorParameters<typeof Date>){super(args.length?args[0]:fixed);} static now():number{return fixed;} } Object.defineProperty(window,'Date',{value:FixedDate}); Object.defineProperty(globalThis.crypto,'randomUUID',{value:()=> '99999999-9999-4999-8999-999999999999'}); }); }
async function json(route: Route, body: unknown, status=200): Promise<void> { await route.fulfill({ status, contentType: status >= 400 ? 'application/problem+json' : 'application/json', body: JSON.stringify(body) }); }
async function shot(page: Page,pv:string):Promise<void>{await expect(page).toHaveScreenshot(`${pv}.png`,{fullPage:false});}
async function open(page: Page, path: string, collapsed: boolean): Promise<void> { await page.goto(`${OPS}/${path}`); if (collapsed) await page.locator('.ops-collapse').click(); }

const clearingStates = ['EMPTY','PROCESSING','COMPLETED','FAILED'] as const;
for (const [index, state] of clearingStates.entries()) for (const collapsed of [false, true]) {
  const pv = `PV-${String(136 + index + (collapsed ? 4 : 0)).padStart(4, '0')}`;
  test(`${pv} clearing ${state}`, async ({ page }) => { await freeze(page); await page.route('**/api/operations/v1/clearing/batches', route => json(route, state === 'EMPTY' ? [] : [{ ...clearingBase, status: state, settledItems: state === 'PROCESSING' ? 724 : state === 'FAILED' ? 1279 : 1284, failedItems: state === 'FAILED' ? 7 : 2, completedAt: state === 'PROCESSING' ? null : clearingBase.completedAt }])); await open(page, 'clearing', collapsed); await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state); await shot(page, pv); });
}

const reconciliationStates = ['EMPTY','RUNNING','MATCHED','DIFFERENCE_FOUND','FAILED'] as const;
for (const [index, state] of reconciliationStates.entries()) for (const collapsed of [false, true]) {
  const pv = `PV-${String(144 + index + (collapsed ? 5 : 0)).padStart(4, '0')}`;
  test(`${pv} reconciliation ${state}`, async ({ page }) => { await freeze(page); await page.route('**/api/operations/v1/reconciliations', route => json(route, state === 'EMPTY' ? [] : [{ ...reconciliationBase, status: state, differenceCount: state === 'DIFFERENCE_FOUND' ? 3 : 0, details: state === 'DIFFERENCE_FOUND' ? '发现 3 笔渠道流水尚未匹配核心入账。' : state === 'FAILED' ? '核心账务服务暂不可用。' : reconciliationBase.details }])); await open(page, 'reconciliation', collapsed); await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state); await shot(page, pv); });
}

const eodStates = ['EMPTY','RUNNING','COMPLETED','FAILED','TRIGGER_CONFIRM_DIALOG'] as const;
for (const [index, state] of eodStates.entries()) for (const collapsed of [false, true]) {
  const pv = `PV-${String(154 + index + (collapsed ? 5 : 0)).padStart(4, '0')}`;
  test(`${pv} eod ${state}`, async ({ page }) => { await freeze(page); await page.route('**/api/operations/v1/eod/latest', route => json(route, state === 'EMPTY' ? { status: 'NOT_STARTED' } : { ...eodBase, status: state === 'TRIGGER_CONFIRM_DIALOG' ? 'COMPLETED' : state, reason: state === 'FAILED' ? '清算批次仍有未决交易。' : null, completedAt: state === 'RUNNING' ? null : eodBase.completedAt })); await page.route('**/api/operations/v1/eod/run', async route => { await new Promise<void>(resolve => setTimeout(resolve, 5000)); return json(route, eodBase); }); await open(page, 'eod', collapsed); if (state === 'TRIGGER_CONFIRM_DIALOG') await page.getByTestId('eod-open-confirm').click(); await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state); await shot(page, pv); });
}

test('EOD state read failure fails closed', async ({ page }) => {
  await freeze(page);
  await page.route('**/api/operations/v1/eod/latest', route => json(route, { title: '状态读取失败' }, 503));
  await open(page, 'eod', false);
  await expect(page.getByText('日终状态加载失败')).toBeVisible();
  await expect(page.getByText('未获得权威日终状态，已禁止启动处理。')).toBeVisible();
  await expect(page.getByTestId('eod-open-confirm')).toBeDisabled();
});
