'use strict';
// Real browser smoke for the owned RF065 bank. No route mocks or auth bypass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
function parseEnvironment(contents) {
  return Object.fromEntries(contents.split(/\r?\n/).filter(Boolean).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}
function ownedSourcePath(value, platform = process.platform) {
  return platform === 'linux' && /^[A-Za-z]:[\\/]/.test(value)
    ? `/mnt/${value[0].toLowerCase()}${value.slice(2).replaceAll('\\', '/')}` : (platform === 'linux' ? path.posix : path).resolve(value);
}
module.exports = { parseEnvironment, ownedSourcePath };
if (require.main === module) {
const directory = path.resolve(process.argv[2]);
const source = path.resolve(process.argv[3]);
const ownership = JSON.parse(fs.readFileSync(path.join(directory, 'ownership.json'), 'utf8'));
assert.match(ownership.project, /^rf065ci[0-9a-f]{12}$/);
assert.equal(ownedSourcePath(ownership.source), source);
assert(directory.includes('banksystem-rf065') && source.endsWith('source-snapshot'));
const env = parseEnvironment(fs.readFileSync(path.join(directory, 'synthetic.env'), 'utf8'));
const product = path.join(source, 'platform/hengzhun-regression-system');
const { chromium } = require(path.join(product, 'runtime/node_modules/playwright'));
const freeze = JSON.parse(fs.readFileSync(path.join(product, 'config/demo-runtime-freeze.json'), 'utf8'));
const endpoint = name => `http://127.0.0.1:${ownership.ports[name][0]}`;
const gateway = endpoint('gateway');
const keycloak = endpoint('keycloak');
let stage = 'SETUP', browser, adminToken, testToken;
const users = [];
const problems = [];
async function json(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.status === 204 || response.headers.get('content-length') === '0' ? undefined : response.json();
}
const headers = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
async function user(realm, roles) {
  const identity = { realm, username: `ci-browser-${randomUUID()}`, password: `B1!${randomBytes(16).toString('hex')}` };
  const base = `${keycloak}/admin/realms/${realm}`;
  const response = await fetch(`${base}/users`, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ username: identity.username, enabled: true, emailVerified: true, email: `${identity.username}@example.test`, firstName: 'CI', lastName: 'Browser', requiredActions: [], credentials: [{ type: 'password', value: identity.password, temporary: false }] }) });
  assert.equal(response.status, 201);
  identity.id = response.headers.get('location').split('/').pop();
  users.push(identity);
  const available = await json(`${base}/roles`, { headers: headers(adminToken) });
  const selected = available.filter(role => roles.includes(role.name));
  assert.equal(selected.length, roles.length);
  await json(`${base}/users/${identity.id}/role-mappings/realm`, { method: 'POST', headers: headers(adminToken), body: JSON.stringify(selected) });
  return identity;
}
async function serviceToken(identity) {
  const base = `${keycloak}/admin/realms/${identity.realm}`;
  const clients = await json(`${base}/clients?clientId=bank-golden-path`, { headers: headers(adminToken) });
  assert.equal(clients.length, 1);
  const secret = await json(`${base}/clients/${clients[0].id}/client-secret`, { headers: headers(adminToken) });
  return (await json(`${keycloak}/realms/${identity.realm}/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ client_id: 'bank-golden-path', client_secret: secret.value, grant_type: 'password', username: identity.username, password: identity.password }) })).access_token;
}
async function login(page, base, button, identity) {
  await page.goto(`${base}/login`);
  assert((await page.title()).length > 0);
  await page.getByTestId(button).click();
  await page.waitForURL(url => url.origin === keycloak && url.pathname.includes('/protocol/openid-connect/auth'));
  await page.locator('#username').fill(identity.username);
  await page.locator('#password').fill(identity.password);
  await page.locator('#kc-login').click();
  await page.waitForURL(url => url.origin === new URL(base).origin && !url.pathname.includes('/login'));
  await page.locator('h1').first().waitFor();
  assert(!(await page.locator('vite-error-overlay').count()));
}
async function cents(accountId) {
  const basic = Buffer.from(`${env.FINERACT_USERNAME}:${env.FINERACT_PASSWORD}`).toString('base64');
  const account = await json(`${endpoint('fineract-server')}/fineract-provider/api/v1/savingsaccounts/${accountId}`, { headers: { Authorization: `Basic ${basic}`, 'fineract-platform-tenantid': env.FINERACT_TENANT } });
  const value = String(account.summary.accountBalance);
  assert.match(value, /^\d+(\.\d{1,2})?$/);
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
}
async function main() {
  adminToken = (await json(`${keycloak}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: env.KEYCLOAK_ADMIN_USERNAME, password: env.KEYCLOAK_ADMIN_PASSWORD }) })).access_token;
  const customer = await user('bank-customer', ['CUSTOMER']);
  const operator = await user('bank-internal', ['TEST_SUPPORT', 'PAYMENT_OPERATOR']);
  testToken = await serviceToken(operator);
  const support = (route, body) => json(`${gateway}/internal/test-support/v1/${route}`, { method: 'POST', headers: headers(testToken), body: JSON.stringify(body) });
  const fixtures = await support('fixtures:seed', {});
  assert.equal(fixtures.status, 'SEEDED');
  const linked = await support('identities:link', { subject: customer.id, logicalRef: 'customer.alice' });
  assert.equal(linked.status, 'LINKED');
  const scenario = await support('customer-scenario:seed', { subject: customer.id, logicalCustomerRef: 'customer.alice', destinationCustomerRef: 'customer.bob' });
  assert.equal(scenario.status, 'READY');
  const sourceId = String(fixtures['account.alice.primarySavings'].accountId);
  const targetId = String(fixtures['account.bob.primarySavings'].accountId);
  const before = [await cents(sourceId), await cents(targetId)];
  const executablePath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(product, 'runtime', freeze.chromium.executable);
  browser = await chromium.launch({ executablePath, headless: true });
  assert.equal(browser.version(), freeze.chromium.version);
  const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const page = await customerContext.newPage();
  const ops = await operatorContext.newPage();
  for (const current of [page, ops]) {
    current.on('pageerror', () => problems.push('PAGE_RUNTIME_ERROR'));
    current.on('console', message => { if (message.type() === 'error') problems.push('CONSOLE_ERROR'); });
    current.on('request', request => { if (new URL(request.url()).port === '19000') problems.push('ORIGINAL_KEYCLOAK_REQUEST'); });
  }
  stage = 'CUSTOMER_LOGIN';
  await login(page, `${endpoint('customer-portal')}/portal`, 'login-sso-submit', customer);
  stage = 'UI_TRANSFER';
  await page.goto(`${endpoint('customer-portal')}/portal/transfers/new`);
  await page.getByTestId('transfer-form').waitFor();
  await page.getByTestId('transfer-amount').fill('1.00');
  await page.getByTestId('transfer-description').fill('RF065 real browser smoke');
  await page.getByTestId('transfer-submit').click();
  await page.getByTestId('transfer-first-confirm').click();
  await page.getByTestId('ukey-verify-control').click();
  await page.getByTestId('transfer-result-status').waitFor();
  assert.equal(await page.getByTestId('transfer-result-status').getAttribute('data-status'), 'SETTLED');
  const transferId = await page.getByTestId('transfer-result-id').innerText();
  const correlationId = await page.getByTestId('transfer-correlation-id').innerText();
  const coreReference = await page.getByTestId('transfer-core-reference').innerText();
  assert(coreReference !== '处理中生成' && coreReference.trim().length > 0);
  await page.screenshot({ path: path.join(directory, 'customer-transfer.png'), fullPage: true });
  stage = 'OPERATIONS_LOGIN_AND_READBACK';
  await login(ops, `${endpoint('operations-console')}/ops`, 'ops-login-submit', operator);
  await ops.goto(`${endpoint('operations-console')}/ops/payments/${encodeURIComponent(transferId)}`);
  await ops.getByTestId('ops-transfer-id').waitFor();
  assert.equal(await ops.getByTestId('ops-transfer-id').innerText(), transferId);
  assert.equal(await ops.getByTestId('ops-correlation-id').innerText(), correlationId);
  assert.equal(await ops.getByTestId('ops-core-reference').innerText(), coreReference);
  assert.equal(await ops.getByTestId('ops-transfer-status').innerText(), await page.getByTestId('transfer-result-status').innerText());
  await ops.screenshot({ path: path.join(directory, 'operations-transfer.png'), fullPage: true });
  const after = [await cents(sourceId), await cents(targetId)];
  assert.equal(before[0] - after[0], 100n);
  assert.equal(after[1] - before[1], 100n);
  assert.equal(before[0] + before[1], after[0] + after[1]);
  const projection = await json(`${gateway}/internal/test-support/v1/assertions/accounting-projection/${encodeURIComponent(correlationId)}`, { headers: headers(testToken) });
  assert.equal(projection.projectionBalanced, true);
  assert.equal(projection.projectionEntryCount, 2);
  assert.deepEqual(problems, []);
  fs.writeFileSync(path.join(directory, 'browser-result.json'), JSON.stringify({ status: 'PASSED', project: ownership.project, transferId, correlationId, coreReference, amount: '1.00', balanceConserved: true, screenshots: ['customer-transfer.png', 'operations-transfer.png'], originalKeycloakRequests: 0, unexpectedBrowserErrors: 0 }));
  console.log('RF065_REAL_BROWSER=PASS');
}
main().catch(error => {
  const code = /^HTTP_\d+$/.test(error.message) ? error.message : error.name === 'TimeoutError' ? 'BROWSER_TIMEOUT' : 'ASSERTION_FAILED';
  fs.writeFileSync(path.join(directory, 'browser-failure.json'), JSON.stringify({ status: 'FAILED', stage, code, project: ownership.project }));
  console.error(`RF065_REAL_BROWSER=FAIL stage=${stage} code=${code}`);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  // Only identities created above, in the isolated realm; retain business/evidence records.
  for (const identity of users) {
    const response = await fetch(`${keycloak}/admin/realms/${identity.realm}/users/${identity.id}`, { method: 'DELETE', headers: headers(adminToken) });
    if (response.status !== 204) { console.error('RF065_BROWSER_IDENTITY_CLEANUP_FAILED'); process.exitCode = 1; }
  }
});
}
