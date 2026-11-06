import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runAcceptanceCli, verifiedArtifactJson, assertAccountGoal, assertNoReplay, acceptanceFailure } from './rf068-workbench-assertions.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const event = (type, fields = {}) => ({ schemaVersion: 'hengzhun-cli-event/v1', sequence: 1, type, ...fields });
const command = (line, exitCode = 0) => ['-e', `process.stdout.write(${JSON.stringify(line)});process.exitCode=${exitCode}`];

test('LIVE failure diagnostics preserve timeout and network categories without raw message or cause',()=>{
  for(const [error,code] of [[{name:'TimeoutError',message:'private-secret',code:23},'RF068_HTTP_TIMEOUT'],
    [{name:'TypeError',message:'private-secret',cause:{code:'ECONNRESET',message:'private-secret'}},'RF068_HTTP_TRANSPORT_FAILED']]) {
    const summary=acceptanceFailure(error);assert.equal(summary.code,code);assert.equal(JSON.stringify(summary).includes('private-secret'),false);
  }
});

test('real child exit 0/4/5 preserves terminal result or safe verifier failure', async () => {
  const invoke = args => runAcceptanceCli({ file: process.execPath, args, stage: 'EVIDENCE', timeoutMs: 10000 });
  assert.deepEqual(await invoke(command(JSON.stringify(event('COMMAND_RESULT', { result: { verdict: 'VERIFIED' } })))), { verdict: 'VERIFIED' });
  for (const code of [4, 5]) await assert.rejects(invoke(command(JSON.stringify(event('ERROR', { messageCode: 'I10_EVIDENCE_HASH_MISMATCH' })), code)), error => error.code === 'I10_EVIDENCE_HASH_MISMATCH' && error.exitCode === code && error.stage === 'EVIDENCE');
  await assert.rejects(invoke(command('not-json')), /RF068_CLI_OUTPUT_INVALID/);
  await assert.rejects(invoke(command('')), /RF068_CLI_TERMINAL_MISSING/);
  await assert.rejects(invoke(command(JSON.stringify(event('STARTED')))), /RF068_CLI_TERMINAL_MISSING/);
  await assert.rejects(invoke(command(JSON.stringify(event('ERROR', { messageCode: 'TEST_FAILED' })))), /RF068_CLI_TERMINAL_INVALID/);
});

function accountFixture(change = {}) {
  const account = { accountId: 'synthetic-account', maskedAccountNumber: '****1234', accountType: '储蓄账户', currency: 'CNY', status: 'ACTIVE', balance: '100.00' };
  const dom = { schemaVersion: 'hengzhun-dom-evidence/v1', path: '/portal/accounts', nodes: [
    { visible: true, tag: 'h1', textHash: sha('账户列表') }, { visible: true, tag: 'tr', textHash: sha('****1234储蓄账户CNY100.00 CNY正常查看') },
  ] };
  const network = { schemaVersion: 'hengzhun-network-evidence/v1', events: [
    { phase: 'request', method: 'POST', url: 'http://127.0.0.1:18080/realms/bank/protocol/openid-connect/token' },
    { phase: 'response', method: 'GET', url: 'http://127.0.0.1:18443/api/customer/v1/accounts', status: 200 },
  ] };
  change.dom?.(dom); change.network?.(network);
  const artifacts = new Map(), proof = { journeyId: 'journey_original', runId: 'run_original', taskId: 'task_original', artifacts: [] };
  for (const [kind, value] of [['DOM', dom], ['NETWORK', network]]) {
    const bytes = Buffer.from(JSON.stringify(value)), artifact = { evidenceKind: kind, artifactId: kind, size: bytes.length, sha256: sha(bytes) };
    proof.artifacts.push(artifact); artifacts.set(kind, bytes);
  }
  const ledger = { schemaVersion: 'hengzhun-execution-evidence-ledger/v1', runId: proof.runId, taskId: proof.taskId,
    entries: proof.artifacts.map(a => ({ evidenceKind: a.evidenceKind, sha256: a.sha256, byteSize: a.size })) };
  change.ledger?.(ledger);
  const bytes = Buffer.from(JSON.stringify(ledger)); proof.artifacts.push({ evidenceKind: 'LEDGER', artifactId: 'LEDGER', size: bytes.length, sha256: sha(bytes) }); artifacts.set('LEDGER', bytes);
  return { proof, artifacts, accounts: [{ ...account, ...change.account }] };
}
test('account goal consumes hash-verified Worker facts bound to the complete visible account row', () => {
  assert.equal(assertAccountGoal(accountFixture()).accountPageReady, true);
  const coreStatus=accountFixture({account:{status:'Active'},dom:dom=>{dom.nodes[1].textHash=sha('****1234储蓄账户CNY100.00 CNYActive查看')}});
  assert.equal(assertAccountGoal(coreStatus).accountPageReady,true);
  for (const change of [
    { dom: dom => { dom.path = '/portal/login'; } },
    { dom: dom => { dom.nodes.pop(); } },
    { dom: dom => { dom.nodes[1].visible = false; } },
    { account: { balance: '' } }, { account: { balance: '99.00' } },
    { account: { maskedAccountNumber: '****9999' } }, { account: { currency: 'USD' } }, { account: { status: undefined } },
    { account: { status: 'INACTIVE' } }, { account: { status: 'Closed' } }, { account: { status: '' } },
    { account: { status: 'Active' } },
    { ledger: ledger => { ledger.runId = 'another_run'; } },
    { network: network => { network.events.pop(); } },
    { network: network => { network.events.push({ method: 'POST', url: 'http://127.0.0.1:18443/api/customer/v1/transfers' }); } },
  ]) assert.throws(() => assertAccountGoal(accountFixture(change)));
  const broken = accountFixture(); broken.artifacts.set('DOM', Buffer.from('{}'));
  assert.throws(() => assertAccountGoal(broken), /RF068_ARTIFACT_SIZE_MISMATCH/);
  const bytes = Buffer.from('{}'); assert.throws(() => verifiedArtifactJson({ size: bytes.length, sha256: '0'.repeat(64) }, bytes), /RF068_ARTIFACT_HASH_MISMATCH/);
});
test('exact Journey execution predicate detects added runs and repeat claims independent of any UI limit', () => {
  const proof = { journeyId: 'journey_original', runId: 'run_original', taskId: 'task_original' };
  const before = { journeyId: proof.journeyId, runs: [{ runId: proof.runId, taskId: proof.taskId, attemptCount: 1, claimCount: 1 }], turns: [{ turnId: 'turn_original', modelBinding: 'immutable' }] };
  assertNoReplay(before, structuredClone(before), proof);
  for (const change of [after => after.runs.push({ runId: 'run_202' }), after => after.runs[0].attemptCount++, after => after.runs[0].claimCount++, after => after.turns[0].modelBinding = 'changed']) {
    const after = structuredClone(before); change(after); assert.throws(() => assertNoReplay(before, after, proof), /RF068_REPLAY_DETECTED/);
  }
});
test('bootstrap and four refreshes cover the existing serial readiness budget without retries', async () => {
  const { acceptanceStageBudget } = await import('./rf068-workbench-assertions.mjs');
  assert.equal(acceptanceStageBudget('BROWSER_BOOTSTRAP'),240_000);
  assert.ok(acceptanceStageBudget('BROWSER_BOOTSTRAP') > 2 * 90_000 + 3 * 10_000);
  assert.equal(acceptanceStageBudget('REFRESH_AND_OWNED_WEB_RESTART'),4 * 240_000 + 90_000);
  assert.equal(acceptanceStageBudget('BYOK_READ_ONLY_EXECUTION'),900_000);
  assert.equal(acceptanceStageBudget('READ_ONLY_INVARIANT'),90_000);
});
