import { expect, test, type Page, type Route } from '@playwright/test';

const OPS = 'http://127.0.0.1:15177/ops';
const dashboard = { generatedAt: '2026-07-15T02:30:00Z', pendingApprovals: 12, clearingStatus: 'NORMAL', reconciliationStatus: 'MATCHED', activePayments: 18, failedPayments: 3, systemHealth: 'HEALTHY', todayPaymentAmount: '2345678901.00', todayPaymentCount: 45678, successRate: 99.76, pendingAlerts: 12 };

async function freeze(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixed = new Date('2026-07-15T02:30:00Z').valueOf(); const NativeDate = Date;
    class FixedDate extends NativeDate { constructor(...args: ConstructorParameters<typeof Date>) { super(args.length ? args[0] : fixed); } static now(): number { return fixed; } }
    Object.defineProperty(window, 'Date', { value: FixedDate });
  });
}
async function json(route: Route, body: unknown, status = 200): Promise<void> { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function shot(page: Page, pv: string): Promise<void> { await expect(page).toHaveScreenshot(`${pv}.png`, { fullPage: false }); }
async function open(page: Page, state: 'loading' | 'normal' | 'error', collapsed: boolean): Promise<void> {
  await freeze(page);
  await page.route('**/api/operations/v1/dashboard', (route) => state === 'loading' ? new Promise(() => undefined) : state === 'error' ? json(route, { title: 'Service unavailable', status: 503 }, 503) : json(route, dashboard));
  await page.goto(`${OPS}/dashboard`);
  if (collapsed) await page.locator('.ops-collapse').click();
  await expect(page.locator('.ops-shell')).toHaveAttribute('data-sidebar-state', collapsed ? 'COLLAPSED' : 'EXPANDED');
  if (state !== 'loading') await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', state === 'error' ? 'ERROR' : 'READY');
}

test('PV-0003 operations shell expanded', async ({ page }) => { await open(page, 'loading', false); await shot(page, 'PV-0003'); });
test('PV-0004 operations shell collapsed', async ({ page }) => { await open(page, 'loading', true); await shot(page, 'PV-0004'); });
for (const [pv, state, collapsed] of [
  ['PV-0066', 'loading', false], ['PV-0067', 'normal', false], ['PV-0068', 'error', false],
  ['PV-0069', 'loading', true], ['PV-0070', 'normal', true], ['PV-0071', 'error', true],
] as const) test(`${pv} dashboard ${state} ${collapsed ? 'collapsed' : 'expanded'}`, async ({ page }) => { await open(page, state, collapsed); await shot(page, pv); });

test('dashboard retry restores the live snapshot', async ({ page }) => {
  let failed = true; await freeze(page);
  await page.route('**/api/operations/v1/dashboard', (route) => failed ? (failed = false, json(route, { title: 'Service unavailable', status: 503 }, 503)) : json(route, dashboard));
  await page.goto(`${OPS}/dashboard`); await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', 'ERROR');
  await page.getByRole('button', { name: /重试/ }).click(); await expect(page.locator('[data-view-state]')).toHaveAttribute('data-view-state', 'READY');
  await expect(page.getByText('¥ 2,345,678,901.00')).toBeVisible();
});

test('operations shell remains usable at narrow desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 800 }); await open(page, 'normal', true); await page.evaluate(() => window.scrollTo(0, 0)); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await expect(page).toHaveScreenshot('RESP-OPERATIONS-1180.png', { fullPage: false });
});
