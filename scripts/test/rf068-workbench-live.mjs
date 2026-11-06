import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { workbenchOperations, workbenchPrefix } from '../../platform/hengzhun-regression-system/agent-cli/src/workbench-contract.mjs';
import { assertAgentEvidence } from './rf057/agent-assertions.mjs';
import { runAcceptanceCli, assertAccountGoal, assertNoReplay, acceptanceStageBudget, acceptanceFailure } from './rf068-workbench-assertions.mjs';

const root = path.resolve(import.meta.dirname, '../..'), product = path.join(root, 'platform/hengzhun-regression-system');
const require = createRequire(import.meta.url), execute = promisify(execFile);
const lifecycle = require(path.join(product, 'scripts/i10-agent-lifecycle.cjs'));
const release = require(path.join(product, 'scripts/i10-release-identity-v4.cjs'));
const environment = lifecycle.environmentWithRuntimeFile({ root: product });
const identity = () => release.currentReleaseIdentityV4({ productRoot: product, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) });
const origin = 'http://127.0.0.1:18790';
const output = path.join(root, 'agent/runs/rf068-s5', randomUUID());
fs.mkdirSync(output, { recursive: true });
const report = { schemaVersion: 'rf068-s5-browser-live/v1', status: 'RUNNING', evidenceClass: 'LIVE_E2E', startedAt: new Date().toISOString(),
  originalServicesTouched: false, screenshots: [], checks: [], bankWritesRequested: false, releaseIdentityHash: identity().identityHash };
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let browser, page, csrfToken, lastTurn, stage = 'AUTHORITY', terminalId;
let operation='AUTHORITY';
let stageStarted = Date.now(), stageDeadline = stageStarted + 90_000;
report.steps = [];
function beginStage(name) {
  report.steps.push({ stage, status: 'PASSED', durationMs: Date.now() - stageStarted });
  stage = name; operation=name; stageStarted = Date.now(); stageDeadline = stageStarted + acceptanceStageBudget(name); save();
}
const requestSignal = deadline => AbortSignal.timeout(Math.max(1, Math.min(10_000, (deadline || stageDeadline) - Date.now())));
const errors = [], warnings = [], submissions = [], events = new Map();
const fail = code => { throw Object.assign(new Error(code), { code }); };
const operationPath = (id, values = {}) => {
  const operation = workbenchOperations.find(item => item.operationId === id);
  assert.ok(operation, 'RF068_OPERATION_NOT_IN_CONTRACT');
  return { method: operation.method, route: workbenchPrefix + operation.path.replace(/\{([^}]+)\}/g, (_match, name) => encodeURIComponent(values[name])) };
};
async function api(id, values, body, query, deadline) {
  const operation = operationPath(id, values), target = new URL(operation.route, origin);
  for (const [key, value] of Object.entries(query ?? {})) target.searchParams.set(key, String(value));
  const response = await fetch(target, { method: operation.method, redirect: 'error', signal: requestSignal(deadline),
    headers: { Origin: origin, ...(body ? { 'content-type': 'application/json', 'x-hengzhun-csrf': csrfToken } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) fail(/^[A-Z][A-Z0-9_]{2,100}$/.test(value.code) ? value.code : 'RF068_HTTP_FAILED');
  return value;
}
async function harness(route, body) {
  const response = await fetch('http://127.0.0.1:18788' + route, { method: 'POST', redirect: 'error', signal: requestSignal(), headers: {
    authorization: `Bearer ${environment.HENGZHUN_SERVICE_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) fail(`RF068_HARNESS_HTTP_${response.status}`);
  return response.json();
}
async function screenshot(name) {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(path.relative(root, file)); save();
}
async function cli(args) {
  return runAcceptanceCli({ file: path.join(product, 'runtime/node-v24.19.0-win-x64/node.exe'),
    args: [path.join(product, 'agent-cli/bin/hz-agent.mjs'), ...args], cwd: product, env: environment, stage,
    timeoutMs: Math.max(1, stageDeadline - Date.now()) });
}
async function readTurn(id) {
  const deadline = Math.min(stageDeadline, Date.now() + 15 * 60 * 1000);
  let after = 0;
  while (Date.now() < deadline) {
    lastTurn = await api('getAgentTurn', { turnId: id }, undefined, { after, limit: 50 }, deadline);
    for (const event of lastTurn.events) { events.set(`${id}:${event.sequence}`, event); after = Math.max(after, event.sequence); }
    report.current = { turnId: id, status: lastTurn.status, journeyId: lastTurn.journeyId, runId: lastTurn.runId, taskId: lastTurn.taskId,
      failureCode: lastTurn.failureCode, modelBinding: lastTurn.modelBinding, eventsRead: events.size }; save();
    if (['FAILED', 'INTERRUPTED'].includes(lastTurn.status)) fail(lastTurn.failureCode || 'RF068_TURN_FAILED');
    if (lastTurn.hasMoreEvents) continue;
    if (!['RUNNING', 'STOP_REQUESTED'].includes(lastTurn.status)) return lastTurn;
    await new Promise(resolve => setTimeout(resolve, 1000)); // State observation only; never resubmits an execution.
  }
  fail('RF068_ACCEPTANCE_WAIT_EXPIRED');
}
async function submit(text) {
  const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/messages'));
  await page.getByLabel('测试目标', { exact: true }).fill(text);
  await page.getByRole('button', { name: '发送目标', exact: true }).click();
  const accepted = await response;
  if (accepted.status() !== 202) fail('RF068_SUBMISSION_REJECTED');
  const turn = await accepted.json(); terminalId = turn.id;
  await page.getByTestId(`turn-${turn.id}`).waitFor();
  return readTurn(turn.id);
}
async function openConversation(conversationId, reload = false) {
  const ready = page.waitForResponse(value => new URL(value.url()).pathname === operationPath('getAgentBootstrap').route,
    { timeout: Math.max(1, stageDeadline - Date.now()) }).catch(error => {
      if (error.name === 'TimeoutError') fail('RF068_BOOTSTRAP_RESPONSE_TIMEOUT');
      throw error;
    });
  if (reload) await page.reload();
  else await page.goto(`${origin}/agent/${conversationId ? `conversations/${conversationId}` : ''}`);
  const bootstrap = await (await ready).json();
  if (bootstrap.status !== 'READY') { report.blockingReasons = bootstrap.blockingReasons; fail('RF068_BOOTSTRAP_NOT_READY'); }
  assert.equal(bootstrap.releaseIdentityHash, report.releaseIdentityHash, 'RF068_BROWSER_IDENTITY_MISMATCH');
  csrfToken = bootstrap.csrfToken;
  await page.getByTestId('connection-status').filter({ hasText: '准备就绪' }).waitFor({ timeout: Math.max(1, stageDeadline - Date.now()) });
  await page.evaluate(() => document.fonts.ready);
}
try {
  lifecycle.authorizedIdentity({ root: product, environment });
  const managed = await lifecycle.managedStatus({ root: product, identity: identity() });
  if (!managed.healthy) fail('RF068_MANAGED_RUNTIME_NOT_READY');
  report.managed = managed;
  const web = await execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/demo/agent-workbench.ps1'), '-Command', 'status'], { windowsHide: true });
  if (!web.stdout.includes('AGENT_WEB=RUNNING')) fail('RF068_OWNED_WEB_NOT_RUNNING');
  const { chromium } = createRequire(path.join(product, 'runtime/package.json'))('playwright');
  const freeze = JSON.parse(fs.readFileSync(path.join(product, 'config/demo-runtime-freeze.json'), 'utf8'));
  browser = await chromium.launch({ executablePath: path.join(product, 'runtime', freeze.chromium.executable), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  context.setDefaultTimeout(90_000); context.setDefaultNavigationTimeout(30_000);
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('console', value => { if (value.type() === 'error') errors.push(value.text()); if (value.type() === 'warning') warnings.push(value.text()); });
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/messages')) submissions.push(request.postDataJSON().submissionId); });
  beginStage('BROWSER_BOOTSTRAP'); await openConversation();
  assert.equal(await page.title(), '衡准 Agent');
  assert.equal(await page.locator('vite-error-overlay').count(), 0); await screenshot('live-main');

  beginStage('READ_ONLY_BANK_BASELINE');
  // Existing synthetic demo identity only. Plaintext stays inside the enrollment/login boundary.
  const config = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter(line => /^DEMO_CUSTOMER_(USERNAME|PASSWORD)=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  if (!config.DEMO_CUSTOMER_USERNAME || !config.DEMO_CUSTOMER_PASSWORD) fail('RF068_DEMO_CUSTOMER_CONFIGURATION_REQUIRED');
  const bankContext = await browser.newContext(), bankPage = await bankContext.newPage();
  const tokenResponse = bankPage.waitForResponse(value => value.url().includes('/realms/bank-customer/protocol/openid-connect/token'));
  operation='BANK_PORTAL_NAVIGATE';await bankPage.goto('http://127.0.0.1:18082/portal/login'); await bankPage.getByTestId('login-sso-submit').click();
  operation='BANK_IDP_LOGIN';
  await bankPage.locator('#username').fill(config.DEMO_CUSTOMER_USERNAME); await bankPage.locator('#password').fill(config.DEMO_CUSTOMER_PASSWORD); await bankPage.locator('#kc-login').click();
  operation='BANK_TOKEN_RESPONSE';let bankToken = (await (await tokenResponse).json()).access_token;
  operation='BANK_DASHBOARD_READY';
  await bankPage.locator('[data-page-id="customer.dashboard"][data-page-state="READY"]').waitFor();
  async function bankSnapshot() {
    const get = async route => { const response = await fetch('http://127.0.0.1:18443' + route, { signal: requestSignal(), headers: { authorization: `Bearer ${bankToken}` } }); if (!response.ok) fail(`RF068_BANK_READ_HTTP_${response.status}`); return response.json(); };
    operation='BANK_ACCOUNT_LIST';const accounts = (await get('/api/customer/v1/accounts')).items;
    assert.ok(accounts.length > 0, 'RF068_BANK_ACCOUNTS_MISSING');
    const snapshot = [];
    for (const account of accounts) { operation='BANK_ACCOUNT_DETAIL';const detail = await get(`/api/customer/v1/accounts/${encodeURIComponent(account.accountId)}`); assert.equal(detail.balance, account.balance, 'RF068_BANK_BASELINE_BALANCE_MISMATCH'); snapshot.push({ ...account, transactions: detail.transactions }); }
    operation='BANK_ACCOUNTS_SORT';
    return snapshot.sort((a, b) => a.accountId.localeCompare(b.accountId));
  }
  const beforeBank = await bankSnapshot(); report.bankBefore = { accounts: beforeBank.length, sha256: hash(beforeBank) }; save();
  beginStage('CREDENTIAL_REFERENCE');
  const enrollment = await harness('/v1/i10/credentials:sessions-create', { namespace: environment.HENGZHUN_AGENT_NAMESPACE, idempotencyKey: `rf068-s5-${randomUUID()}`, label: 'RF068 S5 synthetic read-only demo customer' });
  const captureToken = new URLSearchParams(new URL(enrollment.captureUrl).hash.slice(1)).get('token');
  const credential = await harness(`/v1/i10/credentials/${enrollment.sessionId}:store`, { captureToken, username: config.DEMO_CUSTOMER_USERNAME, password: config.DEMO_CUSTOMER_PASSWORD });
  assert.match(credential.credentialRef, /^credential_[0-9a-f-]{36}$/);
  const models = await api('listAgentModels'); const selected = models.models.find(model => model.isDefault);
  assert.ok(selected?.keyConfigured, 'RF068_CONFIGURED_MODEL_REQUIRED');

  await page.getByRole('button', { name: '选择下一任务模型', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: selected.displayName }).click();
  beginStage('MISSING_INPUT'); const missing = await submit('请对演示银行的账户页面进行只读检查，不转账。');
  assert.equal(missing.status, 'NEEDS_INPUT'); assert.equal(missing.journeyId, undefined);
  assert.equal(missing.modelBinding.profileId, selected.id); assert.equal(missing.modelBinding.profileVersion, selected.version);
  await page.getByTestId(`outcome-${missing.id}`).filter({ hasText: '请补充原任务所需信息' }).waitFor(); await screenshot('live-needs-input');
  const conversationId = missing.conversationId; report.conversationId = conversationId;
  beginStage('BYOK_READ_ONLY_EXECUTION');
  const goal = `目标系统：复兴银行客户门户。访问 http://127.0.0.1:18082/portal/login，通过真实 Keycloak 统一身份认证登录，打开账户列表页面，确认账户、人民币余额和账户状态正常显示，完成后保持在账户列表。使用 ${credential.credentialRef} 安全凭据，明确选择适配器 fuxing-bank-demo。只读测试，不发起转账，不提交业务申请，不修改资料或日期，不访问历史受控门户。`;
  const completed = await submit(goal);
  assert.equal(completed.status, 'COMPLETED', 'RF068_READ_ONLY_GOAL_NOT_COMPLETED');
  assert.equal(completed.continuationOfTurnId, missing.id);
  assert.deepEqual(completed.modelBinding, missing.modelBinding);
  assert.equal(completed.result.verdict, 'PASSED');
  assert.ok([...events.values()].some(event => event.type === 'TOOL_FINISHED'), 'RF068_REAL_TOOL_EVENT_REQUIRED');
  await page.getByTestId(`outcome-${completed.id}`).filter({ hasText: '测试通过' }).waitFor(); await screenshot('live-completed');
  beginStage('EVIDENCE_VERIFICATION');
  const profile = await harness('/v1/i10/target-profiles:get', { namespace: environment.HENGZHUN_AGENT_NAMESPACE, launchUrl: 'http://127.0.0.1:18082/portal/login' });
  const proof = assertAgentEvidence(await cli(['evidence', 'verify', completed.journeyId, '--jsonl']), { identity: report.releaseIdentityHash, journeyId: completed.journeyId, targetProfile: profile, expectedOrigin: 'http://127.0.0.1:18082' });
  assert.equal(completed.runId, proof.runId); assert.equal(completed.taskId, proof.taskId);
  report.proof = proof; save();
  const verifiedBytes = new Map();
  for (const kind of ['DOM', 'NETWORK', 'LEDGER']) {
    const artifact = proof.artifacts.find(item => item.evidenceKind === kind);
    assert.ok(artifact, 'RF068_ACCOUNT_EVIDENCE_REQUIRED');
    const response = await fetch(origin + operationPath('downloadAgentArtifact', { turnId: completed.id, artifactId: artifact.artifactId }).route, { signal: requestSignal() });
    assert.equal(response.status, 200, 'RF068_ACCOUNT_EVIDENCE_DOWNLOAD_FAILED');
    verifiedBytes.set(artifact.artifactId, Buffer.from(await response.arrayBuffer()));
  }
  report.accountGoal = assertAccountGoal({ proof, artifacts: verifiedBytes, accounts: beforeBank }); save();
  const readQuality = async () => { const response = await fetch('http://127.0.0.1:18788/api/quality/v1/runs', { signal: requestSignal() }); if (!response.ok) fail('RF068_QUALITY_READ_FAILED'); return response.json(); };
  let projected = (await readQuality()).find(row => row.runId === proof.runId);
  assert.ok(projected); assert.equal(projected.journeyId, completed.journeyId); assert.equal(projected.releaseIdentity, report.releaseIdentityHash); assert.equal(projected.status, 'COMPLETED');
  await page.getByRole('button', { name: '查看报告与证据', exact: true }).last().click(); await page.locator('.hz-agent__evidence-card').first().waitFor(); await screenshot('live-evidence');
  const evidence = await api('getAgentTurnEvidence', { turnId: completed.id });
  const card = evidence.artifactCards.find(item => item.sha256 && item.size !== undefined);
  assert.ok(card, 'RF068_DOWNLOADABLE_EVIDENCE_REQUIRED');
  const file = await fetch(origin + operationPath('downloadAgentArtifact', { turnId: completed.id, artifactId: card.artifactId }).route, { signal: requestSignal() });
  assert.equal(file.status, 200); const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(bytes.length, card.size); assert.equal(createHash('sha256').update(bytes).digest('hex'), card.sha256);
  await page.keyboard.press('Escape'); await page.locator('.hz-agent-evidence .ant-drawer-title').waitFor({ state: 'hidden' });

  beginStage('REFRESH_AND_OWNED_WEB_RESTART');
  const inspect = async () => {
    const value = await execute(path.join(product, 'runtime/node-v20.20.2-win-x64/node.exe'), [path.join(root, 'scripts/demo/rf068-workbench-runtime.cjs'), 'inspect', completed.journeyId], { windowsHide: true, timeout: Math.max(1, stageDeadline - Date.now()) });
    return JSON.parse(value.stdout);
  };
  const detailBefore = await api('getAgentConversation', { conversationId }, undefined, { limit: 20 });
  const executionBefore = (await inspect()).execution, postCountBefore = submissions.length;
  let cursor, historical;
  do { const history = await api('listAgentConversations', undefined, undefined, { limit: 100, ...(cursor ? { cursor } : {}) }); historical = history.conversations.find(item => item.id !== conversationId && item.lastTurnId); cursor = history.nextCursor; } while (!historical && cursor);
  assert.ok(historical, 'RF068_HISTORY_SWITCH_TARGET_REQUIRED');
  await openConversation(historical.id); await screenshot('live-historical');
  await openConversation(conversationId); await page.getByTestId(`outcome-${completed.id}`).filter({ hasText: '测试通过' }).waitFor();
  await openConversation(conversationId, true); await page.getByTestId(`outcome-${completed.id}`).filter({ hasText: '测试通过' }).waitFor();
  const inspection = await inspect(); assert.ok(Object.values(inspection.activeCounts).every(value => value === 0), 'RF068_ACTIVE_TASKS_BLOCK_WEB_RESTART');
  const webScript = path.join(root, 'scripts/demo/agent-workbench.ps1');
  await execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', webScript, '-Command', 'stop'], { windowsHide: true, timeout: 30000 });
  const restarted = await execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', webScript, '-Command', 'start'], { windowsHide: true, timeout: 30000 });
  // Wait only for the new owned HTTP listener; a failed application response is not retried.
  const deadline = Date.now() + 30000;
  while (true) { try { const response = await fetch(origin + '/agent/', { signal: requestSignal(deadline) }); if (!response.ok) fail('RF068_WEB_RESTART_HTTP_FAILED'); break; } catch (error) { if (error.code === 'RF068_WEB_RESTART_HTTP_FAILED') throw error; if (Date.now() >= deadline) fail('RF068_WEB_RESTART_NOT_LISTENING'); await new Promise(resolve => setTimeout(resolve, 200)); } }
  await openConversation(conversationId); await page.getByTestId(`outcome-${completed.id}`).filter({ hasText: '测试通过' }).waitFor();
  const detailAfter = await api('getAgentConversation', { conversationId }, undefined, { limit: 20 });
  assert.deepEqual(detailAfter, detailBefore); assert.equal(submissions.length, postCountBefore);
  const executionAfter = (await inspect()).execution; assertNoReplay(executionBefore, executionAfter, proof);
  report.webRestart = { owned: true, noReplay: true, executionBeforeHash: hash(executionBefore), executionAfterHash: hash(executionAfter), receipt: restarted.stdout.trim() };
  beginStage('READ_ONLY_INVARIANT');
  const renewed = bankPage.waitForResponse(value => value.url().includes('/realms/bank-customer/protocol/openid-connect/token'));
  await bankPage.reload(); bankToken = (await (await renewed).json()).access_token;
  const afterBank = await bankSnapshot(); assert.deepEqual(afterBank, beforeBank, 'RF068_READ_ONLY_BANK_STATE_CHANGED');
  report.bankAfter = { accounts: afterBank.length, sha256: hash(afterBank) }; await bankContext.close();
  beginStage('MENU_CONFIG_NARROW');
  await page.getByRole('button', { name: '选择下一任务模型', exact: true }).click(); await page.getByRole('menu').waitFor();
  await page.waitForFunction(() => { const menu = document.querySelector('.hz-agent-model-menu'); return menu && !menu.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'); });
  await screenshot('live-menu'); await page.getByRole('menuitem', { name: '模型配置', exact: true }).click();
  await page.getByLabel('API Key', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), ''); await screenshot('live-model-config');
  await page.getByRole('button', { name: '检查连接', exact: true }).click();
  await page.getByText('连接检查通过 · AGENT_MODEL_READY', { exact: true }).waitFor({ timeout: 90000 });
  assert.deepEqual((await api('getAgentTurn', { turnId: completed.id })).modelBinding, missing.modelBinding);
  await page.getByRole('button', { name: '返回对话', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await page.getByRole('button', { name: '收起侧栏', exact: true }).waitFor(); await screenshot('live-narrow-history');
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await screenshot('live-narrow');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
  assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
  assert.equal(identity().identityHash, report.releaseIdentityHash, 'RF068_SOURCE_CHANGED_DURING_LIVE');
  report.steps.push({ stage, status: 'PASSED', durationMs: Date.now() - stageStarted });
  report.status = 'PASSED'; report.completedAt = new Date().toISOString(); report.checks = ['PAGE_IDENTITY','NONBLANK','NO_OVERLAY','CONSOLE','SCREENSHOTS','INTERACTION','ACCOUNT_GOAL','NO_REPLAY','READ_ONLY_BANK_STATE','IDENTITY'];
  report.afterIdentity = identity().identityHash; report.turnId = terminalId; report.submissionCount = submissions.length; save();
  console.log(JSON.stringify({ status: 'PASSED', evidenceClass: report.evidenceClass, releaseIdentityHash: report.releaseIdentityHash, journeyId: completed.journeyId, runId: proof.runId, taskId: proof.taskId, report: path.relative(root, output), bankWritesRequested: false }));
} catch (error) {
  report.status = 'FAILED'; report.stage = stage;
  report.failure=acceptanceFailure(error);report.failureOperation=operation;report.code=report.failure.code;
  report.steps.push({ stage, status: 'FAILED', code: report.code, durationMs: Date.now() - stageStarted });
  report.completedAt = new Date().toISOString(); if (Number.isInteger(error.exitCode)) report.exitCode = error.exitCode;
  report.console = { errors: errors.length, warnings: warnings.length };
  try { report.afterIdentity = identity().identityHash; } catch { report.afterIdentityUnavailable = true; }
  report.bankAfter ??= { status: 'NOT_RUN' };
  report.humanInterventionRequired = true; report.stoppedAfterFirstFailure = true;
  if (page) { try { await screenshot('live-first-failure'); } catch { /* Preserve the original failure when the browser is unavailable. */ } }
  save(); console.log(JSON.stringify({ status: report.status, stage, code: report.code, releaseIdentityHash: report.releaseIdentityHash, report: path.relative(root, output), subsequentAcceptance: 'STOPPED', services: 'PRESERVED' })); process.exitCode = 4;
} finally { await browser?.close(); }
