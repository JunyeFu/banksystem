import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import test from 'node:test'

import { assertEvent, CliError, EXIT, parseCommand } from '../src/contracts.mjs'
import { runCli } from '../src/headless-app.mjs'
import { probeProductReadiness } from '../src/product-doctor.mjs'

const SESSION = `session-${'a'.repeat(32)}`
const OPERATION = `operation-${'e'.repeat(32)}`
const JOURNEY = `journey-${'b'.repeat(32)}`
const PROPOSAL = `proposal-${'c'.repeat(32)}`
const JOURNEY_PROPOSAL = `proposal_${'c'.repeat(32)}`
const HASH = 'd'.repeat(64)
const PRODUCT_ROOT = path.resolve(import.meta.dirname, '..', '..')

function capture() {
  let value = ''
  return {
    stream: new Writable({ write(chunk, _encoding, callback) { value += chunk.toString(); callback() } }),
    text: () => value,
  }
}

async function invoke(args, service = {}, { stdin = Readable.from([]), signal, stdout: suppliedStdout } = {}) {
  const stdout = suppliedStdout ? { stream: suppliedStdout, text: () => '' } : capture()
  const stderr = capture()
  const exitCode = await runCli(args, { service, stdin, stdout: stdout.stream, stderr: stderr.stream, signal })
  const lines = stdout.text().trim() ? stdout.text().trim().split(/\r?\n/).map(JSON.parse) : []
  return { exitCode, stdout: stdout.text(), stderr: stderr.text(), lines }
}

test('baseline command grammar is complete and immutable', () => {
  const cases = [
    [[], 'interactive'], [['--continue'], 'interactive-continue'], [['--resume', SESSION], 'interactive-resume'],
    [['--no-session'], 'interactive'], [['run', '--input-file', '-', '--jsonl'], 'run'],
    [['resume', SESSION, '--approve', '--proposal', PROPOSAL], 'resume'],
    [['resume', SESSION, '--reject', '--proposal', PROPOSAL], 'resume'],
    [['session', 'start'], 'session-start'], [['session', 'resume', SESSION], 'session-resume'],
    [['session', 'status', SESSION], 'session-status'],
    [['journey', 'author', SESSION, '--input-file', '-', '--entry-url', 'http://127.0.0.1:18081', '--target-system', 'bank', '--credential-ref', 'credential_12345678-1234-1234-1234-123456789abc', '--adapter', 'fuxing-bank-demo', '--jsonl'], 'journey-author'],
    [['journey', 'validate', JOURNEY], 'journey-validate'], [['journey', 'show', JOURNEY], 'journey-show'], [['evidence', JOURNEY], 'evidence'],
    [['evidence', 'verify', JOURNEY, '--jsonl'], 'evidence-verify'],
    [['journey', 'approve', JOURNEY, '--session', SESSION, '--revision', '1', '--proposal', JOURNEY_PROPOSAL, '--content-hash', HASH, '--jsonl'], 'journey-approve'],
    [['journey', 'reject', JOURNEY, '--session', SESSION, '--revision', '1', '--proposal', JOURNEY_PROPOSAL, '--content-hash', HASH, '--jsonl'], 'journey-reject'],
    [['journey', 'execute', JOURNEY, '--session', SESSION, '--jsonl'], 'journey-execute'],
    [['credential', 'enroll'], 'credential-enroll'], [['doctor'], 'doctor'], [['service', 'status'], 'service-status'], [['version'], 'version'],
    [['schedule','create',JOURNEY,'--session',SESSION,'--cron','0 9 * * 1-5','--timezone','Asia/Shanghai','--jsonl'],'schedule-create'],
    [['schedule','create',JOURNEY,'--session',SESSION,'--at','2099-01-01T00:00:00Z','--timezone','Asia/Shanghai','--jsonl'],'schedule-create'],
    [['schedule','status','schedule_test123'],'schedule-status'],
    [['schedule','disable','schedule_test123','--session',SESSION,'--reason','停止本轮测试','--jsonl'],'schedule-disable'],
    [['failure','show','incident_test123'],'failure-show'],
  ]
  for (const [args, kind] of cases) assert.equal(parseCommand(args).kind, kind, args.join(' '))
})

test('schedule commands require one explicit time, timezone, and a reason for stopping',()=>{
  const base=['schedule','create',JOURNEY,'--session',SESSION,'--jsonl'];
  for(const options of [[],['--cron','* * * * *'],['--at','2099-01-01T00:00:00Z','--cron','* * * * *','--timezone','Asia/Shanghai'],
    ['--cron','* *','--timezone','Asia/Shanghai'],['--cron','* * * * *','--timezone','invalid'],['--at','2020-01-01T00:00:00Z','--timezone','Asia/Shanghai']])
    assert.throws(()=>parseCommand([...base,...options]),CliError);
  assert.throws(()=>parseCommand(['schedule','disable','schedule_test123','--session',SESSION,'--jsonl']),CliError);
});

test('public verification commands forward the original challenge and explicit revision',async()=>{
  const result=await invoke(['verification','ready','challenge_test123','--session',SESSION,'--revision','1','--jsonl'],{
    async verificationDecide(value){assert.equal(value.challengeId,'challenge_test123');assert.equal(value.revision,1);
      assert.equal(value.decision,'USER_READY');assert.equal(value.sessionId,SESSION);return {status:'WAITING_USER_ACTION',version:2};}
  });
  assert.equal(result.exitCode,0);assert.equal(result.lines.at(-1).result.version,2);
  const status=await invoke(['verification','status','challenge_test123'],{
    async verificationStatus(value){assert.equal(value.challengeId,'challenge_test123');return {status:'WAITING_USER_PREPARATION',version:1};}
  });
  assert.equal(status.exitCode,0);
});

test('public feedback commands parse local correction without emitting its file or contents',async()=>{
  const correction={type:'TARGET_MAPPING',targetRef:'DOCUMENT.STATUS',locator:{kind:'TEST_ID',value:'document-status'}};
  const result=await invoke(['feedback','record','incident_test123','--session',SESSION,'--input-file','-','--jsonl'],{
    async feedbackRecord(value){assert.deepEqual(value.correction,correction);assert.equal(value.incidentId,'incident_test123');return {feedbackId:'feedback_test123',status:'PENDING_VERIFICATION'};}
  },{stdin:Readable.from([JSON.stringify(correction)])});
  assert.equal(result.exitCode,0);assert.equal(result.lines.at(-1).result.status,'PENDING_VERIFICATION');
  const verified=await invoke(['feedback','verify','feedback_test123','--session',SESSION,'--journey',JOURNEY,'--jsonl'],{
    async feedbackVerify(value){assert.equal(value.verificationJourneyId,JOURNEY);return {feedbackId:'feedback_test123',status:'VERIFIED'};}
  });assert.equal(verified.exitCode,0);
});
test('public schedule and failure commands pass their exact fields and emit only projected safe results',async()=>{
  const seen=[];
  const result=await invoke(['schedule','create',JOURNEY,'--session',SESSION,'--cron','0 9 * * 1-5','--timezone','Asia/Shanghai','--jsonl'],{
    async scheduleCreate(value){seen.push(value);return {scheduleId:'schedule_test123',status:'ACTIVE',maxRetries:0,scriptHash:HASH};}
  });
  assert.equal(result.exitCode,0);assert.equal(seen[0].journeyId,JOURNEY);assert.equal(seen[0].cronExpression,'0 9 * * 1-5');
  assert.equal(seen[0].sessionId,SESSION);assert.equal(result.lines.at(-1).result.maxRetries,0);
  const failure=await invoke(['failure','show','incident_test123'],{async failureShow(value){assert.equal(value.incidentId,'incident_test123');return {reasonCode:'ASSERTION_FAILED',humanInterventionRequired:true,artifactRefs:['artifact_test123']};}});
  assert.equal(failure.exitCode,0);assert.equal(failure.lines.at(-1).result.humanInterventionRequired,true);
});

test('unknown, duplicate, mixed-decision and auto-approval options fail closed', () => {
  for (const args of [
    ['run', '--input-file', '-', '--jsonl', '--unknown'],
    ['run', '--input-file', '-', '--jsonl', '--jsonl'],
    ['run', '--input-file', '-', '--jsonl', '--yes'],
    ['resume', SESSION, '--approve', '--reject', '--proposal', PROPOSAL],
    ['resume', SESSION, '--approve'],
    ['session', 'list'], ['session', 'show', SESSION], ['session', 'fork', SESSION], ['session', 'archive', SESSION],
  ]) assert.throws(() => parseCommand(args), CliError)
  assert.throws(() => parseCommand([
    'journey', 'author', SESSION, '--input-file', '-', '--entry-url', 'http://127.0.0.1:18081',
    '--target-system', 'bank', '--credential-ref', 'credential_12345678-1234-1234-1234-123456789abc',
    '--adapter', 'unregistered-adapter', '--jsonl',
  ]), (error) => error instanceof CliError && error.code === 'TARGET_ADAPTER_INVALID')
})

test('stdin run emits the exact golden success stream and keeps diagnostics empty', async () => {
  const seen = []
  const result = await invoke(['run', '--input-file', '-', '--jsonl'], {
    async start(input) { seen.push(input); return { status: 'COMPLETED', sessionId: SESSION, journeyId: JOURNEY, answer: 'done' } },
  }, { stdin: Readable.from(['你好，执行只读检查']) })
  assert.equal(result.exitCode, EXIT.SUCCESS)
  assert.equal(result.stderr, '')
  assert.deepEqual(result.lines, [
    { schemaVersion: 'hengzhun-cli-event/v1', sequence: 1, type: 'STARTED', command: 'run' },
    { schemaVersion: 'hengzhun-cli-event/v1', sequence: 2, type: 'RESPONSE', status: 'COMPLETED', sessionId: SESSION, journeyId: JOURNEY, text: 'done' },
  ])
  assert.equal(seen[0].input, '你好，执行只读检查')
})

test('file and attachment preflight pass bytes and refs without emitting host paths', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-tp05-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const inputPath = path.join(root, 'private-input.txt')
  const attachmentPath = path.join(root, 'secret-attachment.png')
  await writeFile(inputPath, 'analyze the supplied attachment', 'utf8')
  await writeFile(attachmentPath, Buffer.from([1, 2, 3, 4]))
  let imported
  let started
  const result = await invoke(['run', '--input-file', inputPath, '--attach', attachmentPath, '--jsonl'], {
    async importAttachment(value) { imported = value; return { attachmentRef: `attachment-${'e'.repeat(32)}` } },
    async start(value) { started = value; return { status: 'NEEDS_INPUT', sessionId: SESSION, journeyId: JOURNEY, question: 'Which account?' } },
  })
  assert.equal(result.exitCode, EXIT.SUCCESS)
  assert.equal(imported.bytes.equals(Buffer.from([1, 2, 3, 4])), true)
  assert.equal(Object.hasOwn(imported, 'path'), false)
  assert.deepEqual(started.attachmentRefs, [`attachment-${'e'.repeat(32)}`])
  assert.equal(result.stdout.includes(root), false)
  assert.equal(result.stdout.includes('secret-attachment.png'), false)
  assert.equal(result.lines[1].type, 'ATTACHMENT_IMPORTED')
  assert.equal(result.lines[2].type, 'CLARIFICATION_REQUIRED')
})

test('pending proposal emits only safe frozen identity and exits 20 without mutation', async () => {
  let resumes = 0
  const result = await invoke(['run', '--input-file', '-', '--jsonl'], {
    async start() { return { status: 'AWAITING_USER', sessionId: SESSION, journeyId: JOURNEY, approval: {
      proposalId: PROPOSAL, contentHash: HASH, risk: 'HIGH', expiresAt: '2026-08-26T09:00:00.000Z', summary: 'Submit the frozen journey input.',
    } } },
    async resume() { resumes += 1 },
  }, { stdin: Readable.from(['prepare a write']) })
  assert.equal(result.exitCode, EXIT.APPROVAL_REQUIRED)
  assert.equal(resumes, 0)
  assert.equal(result.lines.at(-1).type, 'APPROVAL_REQUIRED')
  assert.deepEqual(result.lines.at(-1).proposal, {
    proposalId: PROPOSAL, contentHash: HASH, risk: 'HIGH', expiresAt: '2026-08-26T09:00:00.000Z', summary: 'Submit the frozen journey input.',
  })
})

test('journey author carries one explicit registered adapter and emits a bounded candidate summary with exit 20', async () => {
  const calls = []
  const args = ['journey', 'author', SESSION, '--input-file', '-', '--entry-url', 'http://127.0.0.1:18081/login', '--target-system', 'bank', '--credential-ref', 'credential_12345678-1234-1234-1234-123456789abc', '--adapter', 'fuxing-bank-demo', '--jsonl']
  const result = await invoke(args, { async journeyAuthor(value) {
    calls.push(value)
    return { status: 'AWAITING_USER', sessionId: SESSION, journeyId: JOURNEY, revision: 2, stage: 'READY_FOR_CASE_APPROVAL', proposalId: PROPOSAL, contentHash: HASH, stepCount: 3, assertionCount: 2 }
  } }, { stdin: Readable.from(['verify transfer']) })
  assert.equal(result.exitCode, EXIT.APPROVAL_REQUIRED)
  assert.equal(result.lines.at(-1).type, 'COMMAND_RESULT')
  assert.equal(result.lines.at(-1).result.stepCount, 3)
  assert.equal(calls[0].goal, 'verify transfer')
  assert.equal(calls[0].adapterSelection, 'fuxing-bank-demo')
  assert.equal(result.stdout.includes('credential_'), false)
})

test('public author accepts the explicit operations adapter without inferring it from the target name',async()=>{
  let input;
  const args=['journey','author',SESSION,'--input-file','-','--entry-url','http://127.0.0.1:18083/ops/login','--target-system','运营控制台',
    '--credential-ref','credential_12345678-1234-1234-1234-123456789abc','--adapter','fuxing-bank-operations','--jsonl'];
  const result=await invoke(args,{async journeyAuthor(value){input=value;return {status:'AWAITING_USER',sessionId:SESSION,journeyId:JOURNEY,revision:1};}},
    {stdin:Readable.from(['只读检查文档草稿状态'])});
  assert.equal(result.exitCode,EXIT.APPROVAL_REQUIRED);assert.equal(input.adapterSelection,'fuxing-bank-operations');
  assert.equal(input.entryUrl,'http://127.0.0.1:18083/ops/login');
});

test('journey author reads a local financial pool separately from the model goal and never emits it',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'hz-pool-cli-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const poolFile=path.join(root,'pool.json'),pool={schemaVersion:'test-only-transport',authoring:{credentialRef:'credential_local_sample'}}
  await writeFile(poolFile,JSON.stringify(pool));let captured
  const args=['journey','author',SESSION,'--input-file','-','--entry-url','http://127.0.0.1:18082/portal/login',
    '--target-system','bank','--credential-ref','credential_12345678-1234-1234-1234-123456789abc','--bank-validation-fixtures',poolFile,'--jsonl']
  const result=await invoke(args,{async journeyAuthor(value){captured=value;return {status:'AWAITING_USER',sessionId:SESSION,journeyId:JOURNEY,revision:2}}},
    {stdin:Readable.from(['explicit financial goal'])})
  assert.equal(result.exitCode,EXIT.APPROVAL_REQUIRED)
  assert.deepEqual(captured.bankValidationFixtures,pool);assert.equal(captured.goal,'explicit financial goal')
  assert.equal(result.stdout.includes('credential_local_sample'),false)
  assert.throws(()=>parseCommand(args.map(arg=>arg===poolFile?'-':arg)),error=>error.code==='BANK_VALIDATION_FILE_REQUIRED')
  await writeFile(poolFile,'{invalid-json')
  let invoked=false
  const invalid=await invoke(args,{async journeyAuthor(){invoked=true}}, {stdin:Readable.from(['explicit financial goal'])})
  assert.equal(invalid.exitCode,EXIT.INPUT_INVALID);assert.equal(invoked,false)
  assert.equal(invalid.lines.at(-1).messageCode,'BANK_VALIDATION_JSON_INVALID')
  await writeFile(poolFile,JSON.stringify(pool))
  const runArgs=['run','--input-file','-','--bank-validation-fixtures',poolFile,'--jsonl']
  const run=await invoke(runArgs,{async start(value){captured=value;return {status:'COMPLETED',sessionId:SESSION,journeyId:JOURNEY,answer:'completed'}}},
    {stdin:Readable.from(['explicit financial goal'])})
  assert.equal(run.exitCode,EXIT.SUCCESS);assert.deepEqual(captured.bankValidationFixtures,pool)
  assert.equal(captured.input,'explicit financial goal');assert.equal(run.stdout.includes('credential_local_sample'),false)
  assert.throws(()=>parseCommand(runArgs.map(arg=>arg===poolFile?'-':arg)),error=>error.code==='BANK_VALIDATION_FILE_REQUIRED')
  await writeFile(poolFile,'{invalid-json');invoked=false
  const invalidRun=await invoke(runArgs,{async start(){invoked=true}},{stdin:Readable.from(['goal'])})
  assert.equal(invalidRun.exitCode,EXIT.INPUT_INVALID);assert.equal(invoked,false)
})

test('approve and reject resume carry one exact proposal decision', async () => {
  const calls = []
  const service = { async resume(value) { calls.push(value); return value.approved
    ? { status: 'COMPLETED', sessionId: SESSION, journeyId: JOURNEY, answer: 'approved' }
    : { status: 'REJECTED', sessionId: SESSION, journeyId: JOURNEY } } }
  const approved = await invoke(['resume', SESSION, '--approve', '--proposal', PROPOSAL], service)
  const rejected = await invoke(['resume', SESSION, '--reject', '--proposal', PROPOSAL], service)
  assert.equal(approved.exitCode, EXIT.SUCCESS)
  assert.equal(rejected.exitCode, EXIT.REJECTED)
  assert.deepEqual(calls.map(({ signal: _signal, ...call }) => call), [
    { sessionId: SESSION, proposalId: PROPOSAL, approved: true },
    { sessionId: SESSION, proposalId: PROPOSAL, approved: false },
  ])
})

test('journey approve and reject pass one exact frozen tuple to the dedicated service method', async () => {
  const calls = []
  const service = { async journeyDecision(value) {
    calls.push(value)
    return { sessionId: SESSION, journeyId: JOURNEY, revision: 2, stage: value.approved ? 'PROCESSING_AUTHORING' : 'NEEDS_INPUT', status: value.approved ? 'PROCESSING' : 'NEEDS_INPUT', decision: value.approved ? 'APPROVED' : 'REJECTED' }
  } }
  const common = [JOURNEY, '--session', SESSION, '--revision', '1', '--proposal', JOURNEY_PROPOSAL, '--content-hash', HASH, '--jsonl']
  const approved = await invoke(['journey', 'approve', ...common], service)
  const rejected = await invoke(['journey', 'reject', ...common], service)
  assert.equal(approved.exitCode, 0)
  assert.equal(rejected.exitCode, 0)
  assert.deepEqual(calls.map(({ signal: _signal, ...value }) => value), [
    { sessionId: SESSION, journeyId: JOURNEY, revision: 1, proposalId: JOURNEY_PROPOSAL, contentHash: HASH, approved: true },
    { sessionId: SESSION, journeyId: JOURNEY, revision: 1, proposalId: JOURNEY_PROPOSAL, contentHash: HASH, approved: false },
  ])
})

test('journey execute passes only the bound session and Journey to the execution service', async () => {
  const calls = []
  const result = await invoke(['journey', 'execute', JOURNEY, '--session', SESSION, '--jsonl'], {
    async journeyExecute(value) {
      calls.push(value)
      return { status: 'RUNNING', sessionId: SESSION, journeyId: JOURNEY, runId: `run-${'e'.repeat(32)}`, taskId: `task-${'f'.repeat(32)}` }
    },
  })
  assert.equal(result.exitCode, EXIT.SUCCESS)
  assert.equal(result.lines.at(-1).result.status, 'RUNNING')
  assert.deepEqual(calls.map(({ signal: _signal, ...value }) => value), [{ sessionId: SESSION, journeyId: JOURNEY }])
})

test('journey execute repeat explicitly requests a new frozen-script execution',async()=>{
  const calls=[];
  const result=await invoke(['journey','execute',JOURNEY,'--session',SESSION,'--repeat','--jsonl'],{
    async journeyExecute(value){calls.push(value);return {status:'PASSED',sessionId:SESSION,journeyId:JOURNEY};},
  });
  assert.equal(result.exitCode,EXIT.SUCCESS);
  assert.deepEqual(calls.map(({signal:_signal,...value})=>value),[{sessionId:SESSION,journeyId:JOURNEY,repeat:true}]);
});

test('all non-conversational commands produce schema-valid JSONL only', async () => {
  const service = new Proxy({}, { get: (_target, key) => async () => key === 'doctor'
    ? { status: 'READY' }
    : key === 'serviceStatus' ? { status: 'HEALTHY' }
      : key === 'evidenceVerify' ? { verdict: 'VERIFIED', journeyId: JOURNEY, requiredKinds: ['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER'], artifacts: [] }
        : { safe: true } })
  for (const args of [
    ['session', 'start'], ['session', 'resume', SESSION], ['session', 'status', SESSION],
    ['journey', 'validate', JOURNEY], ['journey', 'show', JOURNEY], ['journey', 'execute', JOURNEY, '--session', SESSION, '--jsonl'],
    ['evidence', JOURNEY], ['evidence', 'verify', JOURNEY, '--jsonl'], ['doctor'], ['service', 'status'], ['version'],
  ]) {
    const result = await invoke(args, service)
    assert.equal(result.exitCode, 0, args.join(' '))
    assert.equal(result.stderr, '')
    for (const event of result.lines) assert.doesNotThrow(() => assertEvent(event))
  }
})

test('credential enroll emits one HIGH exact proposal and exits approval-required', async () => {
  const calls = []
  const result = await invoke(['credential', 'enroll'], { async credentialEnroll(value) {
    calls.push(value)
    return { status: 'AWAITING_USER', sessionId: OPERATION, operationKind: 'CREDENTIAL_ENROLLMENT', approval: {
      proposalId: PROPOSAL, contentHash: HASH, risk: 'HIGH',
      expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Open one local capture session.',
    } }
  } })
  assert.equal(result.exitCode, EXIT.APPROVAL_REQUIRED)
  assert.equal(result.stderr, '')
  assert.deepEqual(result.lines.map((event) => event.type), ['STARTED', 'APPROVAL_REQUIRED'])
  assert.equal(result.lines[1].sessionId, OPERATION)
  assert.equal(result.lines[1].proposal.risk, 'HIGH')
  assert.equal(JSON.stringify(result.lines).includes('operationKind'), false)
  assert.equal(calls.length, 1)
})

test('invalid UTF-8 and secret-bearing option values never reach stderr or JSONL', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-tp05-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const invalid = path.join(root, 'credential-secret.bin')
  await writeFile(invalid, Buffer.from([0xc3, 0x28]))
  const result = await invoke(['run', '--input-file', invalid, '--jsonl'], {})
  assert.equal(result.exitCode, EXIT.INPUT_INVALID)
  assert.match(result.stderr, /INPUT_UTF8_INVALID/)
  assert.equal(result.stderr.includes(invalid), false)
  assert.equal(result.stdout.includes(invalid), false)
})

test('command result projection rejects secrets and absolute host paths', async () => {
  for (const unsafe of [{ secret: 'value' }, { artifactPath: 'C:\\private\\artifact.json' }, { nested: { arguments: { value: 1 } } }]) {
    const result = await invoke(['session', 'status', SESSION], { async sessionStatus() { return unsafe } })
    assert.equal(result.exitCode, EXIT.FAILURE)
    assert.equal(result.lines.at(-1).messageCode, 'COMMAND_RESULT_UNSAFE')
    assert.equal(result.stdout.includes('C:\\private'), false)
    assert.equal(result.stdout.includes('value'), false)
  }
})

test('pre-cancelled execution emits CANCELLED and returns 130', async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await invoke(['doctor'], {}, { signal: controller.signal })
  assert.equal(result.exitCode, EXIT.CANCELLED)
  assert.equal(result.lines.length, 1)
  assert.equal(result.lines[0].type, 'CANCELLED')
})

test('doctor and service status return dependency exit 3 when not ready', async () => {
  const doctor = await invoke(['doctor'], { async doctor() { return { status: 'NOT_READY', code: 'MODEL_PROBE_FAILED' } } })
  const service = await invoke(['service', 'status'], { async serviceStatus() { return { status: 'NOT_RUNNING' } } })
  assert.equal(doctor.exitCode, 3)
  assert.equal(service.exitCode, 3)
})

test('product doctor probes the exact six prerequisites in order', async () => {
  const calls = []
  const replies = [
    { choices: [{ message: { content: 'READY' } }] },
    { database: { quickCheck: ['ok'] }, runtime: { migrationsReady: true }, worker: { codeSetReady: true } },
    { version: 'test-contract' },
    { status: 'ok' },
  ]
  const result = await probeProductReadiness({
    root: PRODUCT_ROOT,
    environment: {
      HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.example/v1', HENGZHUN_MODEL_API_KEY: 'private-key',
      HENGZHUN_HARNESS_URL: 'http://127.0.0.1:18788', HENGZHUN_MCP_URL: 'http://127.0.0.1:18789/mcp', HENGZHUN_BANK_BASE_URL: 'http://127.0.0.1:18443',
    },
    exists: () => true, visionProbe: async () => ({ status: 'READY' }),
    fetchFn: async (url, options = {}) => { calls.push({ url: String(url), method: options.method || 'GET' }); return { ok: true, async json() { return replies.shift() } } },
  })
  assert.equal(result.status, 'READY')
  assert.deepEqual(result.checks.map(({ name }) => name), ['model', 'vision', 'harness', 'mcp', 'worker', 'browser', 'bank'])
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://model.example/v1/chat/completions', 'http://127.0.0.1:18788/health', 'http://127.0.0.1:18789/health', 'http://127.0.0.1:18443/health',
  ])
})

test('product doctor stops at the first deterministic failure', async () => {
  let calls = 0
  const result = await probeProductReadiness({
    root: PRODUCT_ROOT,
    environment: { HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.example/v1', HENGZHUN_MODEL_API_KEY: 'private-key' },
    exists: () => true,
    fetchFn: async () => { calls += 1; return { ok: false, async json() { return {} } } },
  })
  assert.equal(result.status, 'NOT_READY')
  assert.equal(result.failedCheck, 'model')
  assert.equal(calls, 1)
  assert.deepEqual(result.checks.map(({ name }) => name), ['model'])
})

test('closed stdout pipe is handled without diagnostic contamination', async () => {
  const broken = new Writable({ write(_chunk, _encoding, callback) { const error = Object.assign(new Error('closed'), { code: 'EPIPE' }); callback(error) } })
  broken.on('error', () => {})
  const result = await invoke(['version'], { async version() { return { version: 'test' } } }, { stdout: broken })
  assert.equal(result.exitCode, EXIT.SUCCESS)
  assert.equal(result.stderr, '')
})

test('interactive commands delegate to the terminal runtime instead of returning TUI_NOT_INSTALLED', async () => {
  const seen = []
  const stdout = capture()
  const stderr = capture()
  const exitCode = await runCli(['--resume', SESSION], {
    service: {}, stdout: stdout.stream, stderr: stderr.stream,
    interactiveRunner: async (value) => { seen.push(value.command); return EXIT.SUCCESS },
  })
  assert.equal(exitCode, EXIT.SUCCESS)
  assert.equal(stdout.text(), '')
  assert.equal(stderr.text(), '')
  assert.equal(seen[0].kind, 'interactive-resume')
})
