import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import test from 'node:test'

import { assertEvent, CliError, EXIT, parseCommand } from '../src/contracts.mjs'
import { runCli } from '../src/headless-app.mjs'

const SESSION = `session-${'a'.repeat(32)}`
const OPERATION = `operation-${'e'.repeat(32)}`
const JOURNEY = `journey-${'b'.repeat(32)}`
const PROPOSAL = `proposal-${'c'.repeat(32)}`
const HASH = 'd'.repeat(64)

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
    [['session', 'list'], 'session-list'], [['session', 'show', SESSION], 'session-show'],
    [['session', 'fork', SESSION], 'session-fork'], [['session', 'archive', SESSION], 'session-archive'],
    [['journey', 'show', JOURNEY], 'journey-show'], [['evidence', JOURNEY], 'evidence'],
    [['credential', 'enroll'], 'credential-enroll'], [['doctor'], 'doctor'], [['service'], 'service'], [['version'], 'version'],
  ]
  for (const [args, kind] of cases) assert.equal(parseCommand(args).kind, kind, args.join(' '))
})

test('unknown, duplicate, mixed-decision and auto-approval options fail closed', () => {
  for (const args of [
    ['run', '--input-file', '-', '--jsonl', '--unknown'],
    ['run', '--input-file', '-', '--jsonl', '--jsonl'],
    ['run', '--input-file', '-', '--jsonl', '--yes'],
    ['resume', SESSION, '--approve', '--reject', '--proposal', PROPOSAL],
    ['resume', SESSION, '--approve'],
  ]) assert.throws(() => parseCommand(args), CliError)
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

test('all non-conversational commands produce schema-valid JSONL only', async () => {
  const service = new Proxy({}, { get: () => async () => ({ safe: true }) })
  for (const args of [
    ['session', 'list'], ['session', 'show', SESSION], ['session', 'fork', SESSION], ['session', 'archive', SESSION],
    ['journey', 'show', JOURNEY], ['evidence', JOURNEY], ['doctor'], ['service'], ['version'],
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
    const result = await invoke(['session', 'list'], { async sessionList() { return unsafe } })
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
