import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { visibleWidth } from '@earendil-works/pi-tui'

import { TuiController, createTuiState, interpretInput, reduceTuiEvent } from '../tui/model.mjs'
import { createTerminalUi } from '../tui/terminal-app.mjs'
import { runTerminalSession } from '../tui/runtime-bridge.mjs'
import { renderTui } from '../tui/view.mjs'

const SESSION = `session-${'a'.repeat(32)}`
const OPERATION = `operation-${'e'.repeat(32)}`
const JOURNEY = `journey-${'b'.repeat(32)}`
const PROPOSAL = `proposal-${'c'.repeat(32)}`
const HASH = 'd'.repeat(64)

function event(sequence, type, fields = {}) {
  return { schemaVersion: 'hengzhun-cli-event/v1', sequence, type, ...fields }
}

function approval(risk = 'HIGH') {
  return event(2, 'APPROVAL_REQUIRED', { sessionId: SESSION, journeyId: JOURNEY, proposal: {
    proposalId: PROPOSAL, contentHash: HASH, risk, expiresAt: '2026-08-26T10:00:00.000Z', summary: 'Submit one frozen mutation.',
  } })
}

test('TUI consumes the same event sequence without inventing business state', () => {
  const events = [
    event(1, 'STARTED', { command: 'run' }), approval(),
    event(3, 'RESPONSE', { status: 'COMPLETED', sessionId: SESSION, journeyId: JOURNEY, text: 'Completed safely.' }),
  ]
  const state = events.reduce(reduceTuiEvent, createTuiState())
  assert.equal(state.eventCount, events.length)
  assert.equal(state.stage, 'COMPLETED')
  assert.equal(state.sessionId, SESSION)
  assert.equal(state.journeyId, JOURNEY)
  assert.equal(state.modal, null)
  assert.equal(state.transcript.at(-1).text, 'Completed safely.')
})

test('40/80/120 column multilingual snapshots are width and height exact', () => {
  let state = createTuiState()
  state = reduceTuiEvent(state, event(1, 'CLARIFICATION_REQUIRED', {
    status: 'NEEDS_INPUT', sessionId: SESSION, journeyId: JOURNEY, text: '请确认账户名称 🧭 — do not guess.',
  }))
  for (const [width, height] of [[40, 12], [80, 24], [120, 40]]) {
    const lines = renderTui(state, width, height)
    assert.equal(lines.length, height)
    assert.equal(lines.every((line) => visibleWidth(line) === width), true)
    assert.match(lines.join('\n'), /请确认账户名称/)
  }
})

test('resize is deterministic and preserves semantic transcript', () => {
  const state = reduceTuiEvent(createTuiState(), event(1, 'RESPONSE', { status: 'COMPLETED', text: 'Stable transcript content.' }))
  const narrowA = renderTui(state, 40, 12)
  renderTui(state, 120, 40)
  const narrowB = renderTui(state, 40, 12)
  assert.deepEqual(narrowA, narrowB)
  assert.match(narrowA.join('\n'), /Stable transcript/)
})

test('HIGH approval requires the exact current proposal suffix', () => {
  const state = reduceTuiEvent(createTuiState(), approval('HIGH'))
  assert.equal(interpretInput(state, '/approve').error, 'HIGH_APPROVAL_SUFFIX_MISMATCH')
  assert.equal(interpretInput(state, '/approve deadbeef').error, 'HIGH_APPROVAL_SUFFIX_MISMATCH')
  const accepted = interpretInput(state, `/approve ${PROPOSAL.slice(-8)}`)
  assert.deepEqual(accepted.intent, { type: 'APPROVAL_DECISION', approved: true, proposalId: PROPOSAL, contentHash: HASH })
})

test('approval modal cannot redirect to a supplied proposal and reject stays exact', () => {
  const state = reduceTuiEvent(createTuiState(), approval('MEDIUM'))
  assert.equal(interpretInput(state, '/approve forged-id').error, 'APPROVAL_SUFFIX_MISMATCH')
  assert.equal(interpretInput(state, '/reject anything').error, 'SLASH_ARGUMENT_FORBIDDEN')
  assert.deepEqual(interpretInput(state, '/reject').intent, {
    type: 'APPROVAL_DECISION', approved: false, proposalId: PROPOSAL, contentHash: HASH,
  })
})

test('all slash commands map to bounded application intents or local actions', () => {
  let state = { ...createTuiState(), sessionId: SESSION, journeyId: JOURNEY, transcript: Object.freeze(Array.from({ length: 30 }, (_, i) => ({ role: 'system', text: `row ${i}` }))) }
  const cases = [
    ['/new', 'NEW_SESSION'], [`/resume ${SESSION}`, 'RESUME_SESSION'], ['/fork', 'FORK_SESSION'],
    ['C:\\private\\case.png', 'ATTACH_FILE'], ['/journey', 'SHOW_JOURNEY'], ['/evidence', 'SHOW_EVIDENCE'],
    ['/credential', 'CREDENTIAL_ENROLL'], ['/doctor', 'DOCTOR'], ['/exit', 'EXIT'],
  ]
  for (const [input, kind] of cases) {
    const command = kind === 'ATTACH_FILE' ? `/attach ${input}` : input
    assert.equal(interpretInput(state, command).intent.type, kind)
  }
  const compacted = interpretInput(state, '/compact').state
  assert.equal(compacted.transcript.length, 21)
  assert.equal(compacted.transcript[0].text, 'Earlier transcript compacted.')
})

test('attachment host path is transient intent data and never enters state or render', () => {
  const state = createTuiState()
  const result = interpretInput(state, '/attach C:\\private\\secret.png')
  assert.equal(result.intent.localPath, 'C:\\private\\secret.png')
  assert.equal(JSON.stringify(state).includes('C:\\private'), false)
  assert.equal(renderTui(state, 80, 24).join('\n').includes('C:\\private'), false)
})

test('submitted editor text is not copied into reducer transcript', () => {
  const intents = []
  const controller = new TuiController({ onIntent: (intent) => intents.push(intent) })
  controller.submit('raw transient business input')
  assert.equal(intents[0].type, 'SUBMIT_TEXT')
  assert.equal(controller.state.transcript.length, 0)
  assert.equal(JSON.stringify(controller.state).includes('raw transient'), false)
})

test('Ctrl-C emits cancellation exit 130 and leaves lifecycle shutdown to the runtime bridge', () => {
  const intents = []
  const fakeTui = {
    addChild(value) { this.child = value }, setFocus() {}, requestRender() {}, start() {}, stop() { this.stopped = true },
    showOverlay() { return { hide() {} } },
  }
  const app = createTerminalUi({ onIntent: (intent) => intents.push(intent), terminal: {}, tuiFactory: () => fakeTui })
  app.receive(approval())
  app.component.handleInput('\x03')
  assert.equal(intents.at(-1).type, 'CANCEL_AND_EXIT')
  assert.equal(intents.at(-1).exitCode, 130)
  assert.equal(fakeTui.stopped, undefined)
  app.stop()
  assert.equal(fakeTui.stopped, true)
})

test('fake terminal lifecycle and approval overlay restore cleanly', () => {
  const calls = []
  const handle = { hide() { calls.push('overlay-hide') } }
  const fakeTui = {
    addChild() { calls.push('child') }, setFocus() { calls.push('focus') }, requestRender() { calls.push('render') },
    start() { calls.push('start') }, stop() { calls.push('stop') },
    showOverlay() { calls.push('overlay-show'); return handle },
  }
  const app = createTerminalUi({ terminal: {}, tuiFactory: () => fakeTui })
  app.start()
  app.receive(approval())
  app.receive(event(3, 'RESPONSE', { status: 'COMPLETED', text: 'done' }))
  app.stop()
  assert.deepEqual(calls.filter((value) => !['render'].includes(value)), ['child', 'focus', 'start', 'overlay-show', 'overlay-hide', 'stop'])
})

test('pi-tui dependency and Node engine are exact and audited surface stays minimal', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.equal(manifest.dependencies['@earendil-works/pi-tui'], '0.84.3')
  assert.equal(manifest.engines.node, '24.19.0')
  assert.equal(lock.packages['node_modules/@earendil-works/pi-tui'].version, '0.84.3')
  assert.deepEqual(Object.keys(manifest.dependencies), ['@earendil-works/pi-tui'])
})

test('production TUI bridge runs text and exact approval through the shared service', async () => {
  const received = []
  const calls = []
  const exitCode = await runTerminalSession({
    command: { kind: 'interactive', noSession: false },
    service: {
      async start(value) { calls.push(['start', value.input]); return { status: 'AWAITING_USER', sessionId: SESSION, journeyId: JOURNEY, approval: {
        proposalId: PROPOSAL, contentHash: HASH, risk: 'LOW', expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Submit frozen input.',
      } } },
      async resume(value) { calls.push(['resume', value.sessionId, value.proposalId, value.approved]); return { status: 'COMPLETED', sessionId: SESSION, journeyId: JOURNEY, answer: 'done' } },
    },
    uiFactory: ({ onIntent }) => ({
      receive(event) { received.push(event) },
      start() {
        onIntent({ type: 'SUBMIT_TEXT', text: 'prepare case' })
        onIntent({ type: 'APPROVAL_DECISION', approved: true, proposalId: PROPOSAL, contentHash: HASH })
        onIntent({ type: 'EXIT', exitCode: 0 })
      },
      stop() {},
    }),
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(calls, [['start', 'prepare case'], ['resume', SESSION, PROPOSAL, true]])
  assert.deepEqual(received.map((item) => item.type), ['STARTED', 'APPROVAL_REQUIRED', 'STARTED', 'RESPONSE'])
})

test('production TUI credential flow uses exact approval then clears the operation binding', async () => {
  const calls = []
  const received = []
  const exitCode = await runTerminalSession({
    command: { kind: 'interactive', noSession: false },
    service: {
      async credentialEnroll() {
        calls.push(['credential'])
        return { status: 'AWAITING_USER', sessionId: OPERATION, operationKind: 'CREDENTIAL_ENROLLMENT', approval: {
          proposalId: PROPOSAL, contentHash: HASH, risk: 'HIGH', expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Open local form.',
        } }
      },
      async resume(value) {
        calls.push(['resume', value.sessionId, value.proposalId, value.approved])
        return { status: 'COMPLETED', sessionId: OPERATION, operationKind: 'CREDENTIAL_ENROLLMENT', answer: 'form opened' }
      },
      async start(value) {
        calls.push(['start', value.input])
        return { status: 'COMPLETED', sessionId: SESSION, journeyId: JOURNEY, answer: 'new conversation' }
      },
    },
    uiFactory: ({ onIntent }) => ({
      receive(event) { received.push(event) },
      start() {
        onIntent({ type: 'CREDENTIAL_ENROLL' })
        onIntent({ type: 'APPROVAL_DECISION', approved: true, proposalId: PROPOSAL, contentHash: HASH })
        onIntent({ type: 'SUBMIT_TEXT', text: 'start after credential' })
        onIntent({ type: 'EXIT', exitCode: 0 })
      },
      stop() {},
    }),
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(calls, [
    ['credential'], ['resume', OPERATION, PROPOSAL, true], ['start', 'start after credential'],
  ])
  assert.deepEqual(received.map((event) => event.type), [
    'STARTED', 'APPROVAL_REQUIRED', 'STARTED', 'RESPONSE', 'STARTED', 'RESPONSE',
  ])
})

test('--continue binds the newest active encrypted session before accepting input', async () => {
  const received = []
  const newer = { sessionId: `session-${'f'.repeat(32)}`, status: 'ACTIVE', updatedAt: '2026-08-26T12:00:00.000Z' }
  const exitCode = await runTerminalSession({
    command: { kind: 'interactive-continue' },
    service: { async sessionList() { return { sessions: [
      { sessionId: SESSION, status: 'ACTIVE', updatedAt: '2026-08-26T11:00:00.000Z' }, newer,
    ] } } },
    uiFactory: ({ onIntent }) => ({
      receive(event) { received.push(event) },
      start() { setTimeout(() => onIntent({ type: 'EXIT', exitCode: 0 }), 0) },
      stop() {},
    }),
  })
  assert.equal(exitCode, 0)
  assert.equal(received[0].type, 'COMMAND_RESULT')
  assert.equal(received[0].result.sessionId, newer.sessionId)
})
