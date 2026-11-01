import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertEvent } from '../../platform/hengzhun-regression-system/agent-cli/src/contracts.mjs';
import { requireCliSuccess } from './rf057/agent-result.mjs';

const execute = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), { code, ...details }); };

export async function runAcceptanceCli({ file, args, cwd, env, stage, timeoutMs }) {
  let stdout, code = 0;
  try { ({ stdout } = await execute(file, args, { cwd, env, windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 })); }
  catch (error) {
    if (!Number.isInteger(error.code)) fail(error.killed ? 'RF068_CLI_TIMEOUT' : 'RF068_CLI_START_FAILED', { stage });
    code = error.code; stdout = error.stdout;
  }
  let events;
  try { events = String(stdout || '').split(/\r?\n/).filter(line => line.trim()).map(line => assertEvent(JSON.parse(line.replace(/^\uFEFF/, '')))); }
  catch { fail('RF068_CLI_OUTPUT_INVALID', { stage, exitCode: code }); }
  const terminal = events.at(-1);
  if (!terminal || !['COMMAND_RESULT', 'ERROR'].includes(terminal.type)) fail('RF068_CLI_TERMINAL_MISSING', { stage, exitCode: code });
  if (code === 0 && terminal.type !== 'COMMAND_RESULT') fail('RF068_CLI_TERMINAL_INVALID', { stage, exitCode: code });
  return requireCliSuccess({ code, terminal, events }, stage).result;
}

export function verifiedArtifactJson(artifact, bytes) {
  assert.equal(bytes.length, artifact.size, 'RF068_ARTIFACT_SIZE_MISMATCH');
  assert.equal(sha256(bytes), artifact.sha256, 'RF068_ARTIFACT_HASH_MISMATCH');
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('RF068_ARTIFACT_JSON_INVALID'); }
}

export function assertAccountGoal({ proof, artifacts, accounts }) {
  const byKind = kind => {
    const artifact = proof.artifacts.find(item => item.evidenceKind === kind);
    assert.ok(artifact && artifacts.has(artifact.artifactId), 'RF068_ACCOUNT_EVIDENCE_REQUIRED');
    return { artifact, value: verifiedArtifactJson(artifact, artifacts.get(artifact.artifactId)) };
  };
  const dom = byKind('DOM'), network = byKind('NETWORK'), ledger = byKind('LEDGER');
  assert.equal(ledger.value.schemaVersion, 'hengzhun-execution-evidence-ledger/v1');
  assert.equal(ledger.value.runId, proof.runId, 'RF068_ACCOUNT_RUN_MISMATCH');
  assert.equal(ledger.value.taskId, proof.taskId, 'RF068_ACCOUNT_TASK_MISMATCH');
  for (const item of [dom, network]) assert.ok(ledger.value.entries.some(entry => entry.evidenceKind === item.artifact.evidenceKind && entry.sha256 === item.artifact.sha256 && entry.byteSize === item.artifact.size), 'RF068_ACCOUNT_LEDGER_MISMATCH');
  assert.equal(dom.value.schemaVersion, 'hengzhun-dom-evidence/v1');
  assert.equal(dom.value.path, '/portal/accounts', 'RF068_ACCOUNT_PAGE_REQUIRED');
  const visible = dom.value.nodes.filter(node => node.visible);
  assert.ok(visible.some(node => node.textHash === sha256('账户列表')), 'RF068_ACCOUNT_HEADING_REQUIRED');
  assert.ok(accounts.length > 0, 'RF068_EXPECTED_ACCOUNTS_REQUIRED');
  for (const account of accounts) {
    assert.equal(account.currency, 'CNY', 'RF068_ACCOUNT_CURRENCY_REQUIRED');
    assert.equal(typeof account.status, 'string', 'RF068_ACCOUNT_STATUS_REQUIRED');
    assert.equal(account.status.toUpperCase(), 'ACTIVE', 'RF068_ACCOUNT_STATUS_REQUIRED');
    assert.ok(account.maskedAccountNumber && /^\d+(?:\.\d+)?$/.test(account.balance), 'RF068_ACCOUNT_FIELDS_REQUIRED');
    // Match one complete visible table row. Separate hashes could bind a balance to the wrong account.
    const balance = `${Number(account.balance).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CNY`;
    const displayedStatus = account.status === 'ACTIVE' ? '正常' : account.status;
    const text = `${account.maskedAccountNumber}${account.accountType ?? '银行账户'}CNY${balance}${displayedStatus}查看`.replace(/\s+/g, ' ').trim();
    assert.ok(visible.some(node => node.tag === 'tr' && node.textHash === sha256(text)), 'RF068_ACCOUNT_ROW_NOT_PROVEN');
  }
  assert.equal(network.value.schemaVersion, 'hengzhun-network-evidence/v1');
  assert.ok(network.value.events.length < 512, 'RF068_NETWORK_COVERAGE_TRUNCATED');
  assert.ok(network.value.events.some(event => event.phase === 'response' && event.method === 'GET' && event.status === 200 && new URL(event.url).pathname === '/api/customer/v1/accounts'), 'RF068_ACCOUNT_NETWORK_REQUIRED');
  assert.ok(network.value.events.every(event => !new URL(event.url).pathname.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(event.method)), 'RF068_BUSINESS_WRITE_OBSERVED');
  return { accountPageReady: true, accountCount: accounts.length, currency: 'CNY', accountStatus: 'ACTIVE', evidenceSource: 'VERIFIED_WORKER_DOM_NETWORK_LEDGER' };
}

export function assertNoReplay(before, after, proof) {
  assert.equal(before.journeyId, proof.journeyId, 'RF068_REPLAY_JOURNEY_MISMATCH');
  assert.equal(before.runs.length, 1, 'RF068_SINGLE_EXECUTION_REQUIRED');
  assert.equal(before.runs[0].runId, proof.runId); assert.equal(before.runs[0].taskId, proof.taskId);
  assert.equal(before.runs[0].attemptCount, 1, 'RF068_SINGLE_CLAIM_REQUIRED');
  assert.equal(before.runs[0].claimCount, 1, 'RF068_SINGLE_CLAIM_REQUIRED');
  assert.deepEqual(after, before, 'RF068_REPLAY_DETECTED');
}
// Doctor may spend 90s on the controller and 90s on vision, then perform
// three 10s local probes. The browser budget must cover that existing contract.
export function acceptanceStageBudget(name) {
  if (name === 'BYOK_READ_ONLY_EXECUTION') return 15 * 60_000;
  if (name === 'BROWSER_BOOTSTRAP') return 240_000;
  if (name === 'REFRESH_AND_OWNED_WEB_RESTART') return 4 * 240_000 + 90_000;
  return 90_000;
}
