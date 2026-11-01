import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = path.join(root, 'platform/hengzhun-regression-system/runtime');
const require = createRequire(path.join(runtime, 'package.json'));
const { chromium } = require('playwright');
const freeze = JSON.parse(fs.readFileSync(path.join(root, 'platform/hengzhun-regression-system/config/demo-runtime-freeze.json'), 'utf8'));
const values = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
for (const key of ['DEMO_CUSTOMER_USERNAME', 'DEMO_CUSTOMER_PASSWORD', 'DEMO_OPERATOR_USERNAME', 'DEMO_OPERATOR_PASSWORD']) {
  if (!values[key]) throw new Error(`RF055_CONFIG_MISSING:${key}`);
}

async function assertBankToken(response, authorizedParty) {
  const body = await response.json();
  const claims = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url').toString('utf8'));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes('bank-channel-service') || claims.azp !== authorizedParty) {
    throw new Error(`RF056_TOKEN_CLAIMS_INVALID:${authorizedParty}`);
  }
}

const browser = await chromium.launch({ executablePath: path.join(runtime, freeze.chromium.executable), headless: true });
try {
  const customer = await browser.newContext();
  const customerPage = await customer.newPage();
  await customerPage.goto('http://127.0.0.1:18082/portal/login');
  await customerPage.getByTestId('login-sso-submit').click();
  await customerPage.locator('#username').fill(values.DEMO_CUSTOMER_USERNAME);
  await customerPage.locator('#password').fill(values.DEMO_CUSTOMER_PASSWORD);
  const customerToken = customerPage.waitForResponse((response) => response.url().includes('/realms/bank-customer/protocol/openid-connect/token'));
  await customerPage.locator('#kc-login').click();
  await assertBankToken(await customerToken, 'customer-portal');
  await customerPage.locator('[data-page-id="customer.dashboard"][data-page-state="READY"]').waitFor({ timeout: 20000 });
  await customerPage.getByTestId('dashboard-account-count').waitFor({ timeout: 20000 });
  const accountCount = Number(await customerPage.getByTestId('dashboard-account-count').innerText());
  if (accountCount < 1) throw new Error('RF055_CUSTOMER_ACCOUNT_MISSING');
  const restoredToken = customerPage.waitForResponse((response) => response.url().includes('/realms/bank-customer/protocol/openid-connect/token'));
  await customerPage.reload();
  await assertBankToken(await restoredToken, 'customer-portal');
  await customerPage.locator('[data-page-id="customer.dashboard"][data-page-state="READY"]').waitFor({ timeout: 20000 });
  await customer.close();

  const operator = await browser.newContext();
  const operatorPage = await operator.newPage();
  await operatorPage.goto('http://127.0.0.1:18083/ops/login');
  await operatorPage.getByTestId('ops-login-submit').click();
  await operatorPage.locator('#username').fill(values.DEMO_OPERATOR_USERNAME);
  await operatorPage.locator('#password').fill(values.DEMO_OPERATOR_PASSWORD);
  const operatorToken = operatorPage.waitForResponse((response) => response.url().includes('/realms/bank-internal/protocol/openid-connect/token'));
  await operatorPage.locator('#kc-login').click();
  await assertBankToken(await operatorToken, 'operations-console');
  await operatorPage.locator('[data-page-id="operations.dashboard"][data-view-state="READY"]').waitFor({ timeout: 20000 });
  const restoredOperatorToken = operatorPage.waitForResponse((response) => response.url().includes('/realms/bank-internal/protocol/openid-connect/token'));
  await operatorPage.reload();
  await assertBankToken(await restoredOperatorToken, 'operations-console');
  await operatorPage.locator('[data-page-id="operations.dashboard"][data-view-state="READY"]').waitFor({ timeout: 20000 });
  await operator.close();
  process.stdout.write(`RF056_FIXED_DEMO_IDENTITIES=PASS customerAccounts=${accountCount} customerReload=RESTORED operationsReload=RESTORED audience=BOUND\n`);
} finally {
  await browser.close();
}
