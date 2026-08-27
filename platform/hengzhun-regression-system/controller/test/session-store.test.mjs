import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createPersistentControllerRuntimeV2 } from '../src/controller-runtime.mjs'
import {
  DEFAULT_RETENTION_MS,
  EncryptedSessionStore,
  SessionStoreError,
  atomicWriteFile,
} from '../src/session-store.mjs'

const RELEASE = '8'.repeat(64)
const SESSION_A = `session-${'a'.repeat(32)}`
const SESSION_B = `session-${'b'.repeat(32)}`

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-tp04-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new EncryptedSessionStore({
    root,
    sessionIdFactory: () => SESSION_A,
    ...options,
  })
  await store.initialize()
  return { root, store }
}

async function createBound(store, overrides = {}) {
  return store.create({
    namespace: 'tenant-sensitive-name',
    threadId: 'thread-sensitive-name',
    journeyId: 'journey-sensitive-name',
    releaseIdentityHash: RELEASE,
    events: [{ type: 'USER_INPUT', value: 'top-secret-input C:\\private\\case.png' }],
    ...overrides,
  })
}

test('CurrentUser DPAPI roundtrip persists sensitive payload only as ciphertext', async (t) => {
  const { root, store } = await fixture(t)
  await createBound(store)
  const payload = await store.load(SESSION_A, {
    expectedReleaseIdentityHash: RELEASE,
    expectedNamespace: 'tenant-sensitive-name',
    expectedThreadId: 'thread-sensitive-name',
    expectedJourneyId: 'journey-sensitive-name',
  })
  assert.equal(payload.events[0].value, 'top-secret-input C:\\private\\case.png')
  const envelopeText = await readFile(path.join(root, `${SESSION_A}.hzs`), 'utf8')
  const indexText = await readFile(path.join(root, 'index-v1.json'), 'utf8')
  for (const forbidden of ['top-secret-input', 'C:\\private', 'tenant-sensitive-name', 'thread-sensitive-name', 'journey-sensitive-name']) {
    assert.doesNotMatch(envelopeText, new RegExp(forbidden.replaceAll('\\', '\\\\')))
    assert.doesNotMatch(indexText, new RegExp(forbidden.replaceAll('\\', '\\\\')))
  }
  const envelope = JSON.parse(envelopeText)
  assert.equal(envelope.cipher, 'WINDOWS_DPAPI_CURRENT_USER')
  assert.equal(envelope.releaseIdentityHash, RELEASE)
})

test('release, namespace, thread and journey drift fail before state is returned', async (t) => {
  const { store } = await fixture(t)
  await createBound(store)
  for (const [options, code] of [
    [{ expectedReleaseIdentityHash: '9'.repeat(64) }, 'SESSION_RELEASE_IDENTITY_CONFLICT'],
    [{ expectedReleaseIdentityHash: RELEASE, expectedNamespace: 'other' }, 'SESSION_NAMESPACE_CONFLICT'],
    [{ expectedReleaseIdentityHash: RELEASE, expectedThreadId: 'other' }, 'SESSION_THREAD_CONFLICT'],
    [{ expectedReleaseIdentityHash: RELEASE, expectedJourneyId: 'other' }, 'SESSION_JOURNEY_CONFLICT'],
  ]) await assert.rejects(store.load(SESSION_A, options), (error) => error.code === code)
})

test('ciphertext tamper and simulated cross-user DPAPI failure never create replacement state', async (t) => {
  const { root, store } = await fixture(t)
  await createBound(store)
  const sessionPath = path.join(root, `${SESSION_A}.hzs`)
  const original = await readFile(sessionPath, 'utf8')
  const envelope = JSON.parse(original)
  envelope.ciphertextBase64 = `${envelope.ciphertextBase64[0] === 'A' ? 'B' : 'A'}${envelope.ciphertextBase64.slice(1)}`
  await writeFile(sessionPath, JSON.stringify(envelope), 'utf8')
  await assert.rejects(store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE }), (error) => error.code === 'SESSION_CIPHERTEXT_TAMPERED')

  await writeFile(sessionPath, original, 'utf8')
  const crossUserStore = new EncryptedSessionStore({
    root,
    dpapi: { protect() { throw new Error('not used') }, unprotect() { throw new Error('different user') } },
  })
  await assert.rejects(
    crossUserStore.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE }),
    (error) => error.code === 'SESSION_DPAPI_UNPROTECT_FAILED',
  )
  assert.equal(await readFile(sessionPath, 'utf8'), original)
})

test('schema drift fails closed without attempting a new session', async (t) => {
  const { root, store } = await fixture(t)
  await createBound(store)
  const sessionPath = path.join(root, `${SESSION_A}.hzs`)
  const envelope = JSON.parse(await readFile(sessionPath, 'utf8'))
  envelope.schemaVersion = 'hengzhun-session-envelope/v999'
  await writeFile(sessionPath, JSON.stringify(envelope), 'utf8')
  await assert.rejects(store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE }), (error) => error.code === 'SESSION_ENVELOPE_VERSION_INVALID')
  assert.equal((await store.list()).length, 1)
})

test('failed atomic replacement preserves the last decryptable envelope byte-for-byte', async (t) => {
  let failSessionWrite = false
  const writer = (target, bytes) => atomicWriteFile(target, bytes, {
    beforeRename: async () => {
      if (failSessionWrite && target.endsWith('.hzs')) throw new SessionStoreError('SIMULATED_POWER_LOSS')
    },
  })
  const { root, store } = await fixture(t, { atomicWriter: writer })
  await createBound(store)
  const sessionPath = path.join(root, `${SESSION_A}.hzs`)
  const before = await readFile(sessionPath)
  failSessionWrite = true
  await assert.rejects(
    store.appendEvent(SESSION_A, RELEASE, { type: 'SECOND', value: 'must-not-land' }),
    (error) => error.code === 'SIMULATED_POWER_LOSS',
  )
  assert.deepEqual(await readFile(sessionPath), before)
  assert.equal((await store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE })).events.length, 1)
})

test('expiry, archive, retention purge and safe index semantics are deterministic', async (t) => {
  let current = 1_800_000_000_000
  const { root, store } = await fixture(t, { now: () => current, retentionMs: 60_000 })
  await createBound(store)
  await store.archive(SESSION_A, RELEASE)
  assert.equal((await store.list())[0].status, 'ARCHIVED')
  const indexText = await readFile(path.join(root, 'index-v1.json'), 'utf8')
  assert.doesNotMatch(indexText, /events|checkpoint|proposal|ciphertext|top-secret/)
  current += 60_000
  await assert.rejects(store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE }), (error) => error.code === 'SESSION_EXPIRED')
  assert.equal(await store.purgeExpired(), 1)
  assert.equal((await store.list()).length, 0)
  await assert.rejects(store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE }), (error) => error.code === 'SESSION_NOT_FOUND')
})

test('default retention is exactly 30 days', () => {
  assert.equal(DEFAULT_RETENTION_MS, 30 * 24 * 60 * 60 * 1000)
})

test('expired sessions reject mutations and archived sessions reject runtime restoration', async (t) => {
  let current = 1_800_000_000_000
  const { store } = await fixture(t, { now: () => current, retentionMs: 60_000 })
  await createBound(store)
  current += 60_000
  await assert.rejects(
    store.appendEvent(SESSION_A, RELEASE, { type: 'MUST_NOT_LAND' }),
    (error) => error.code === 'SESSION_EXPIRED',
  )

  current -= 60_000
  await store.archive(SESSION_A, RELEASE)
  await assert.rejects(
    createPersistentControllerRuntimeV2({
      sessionStore: store,
      sessionId: SESSION_A,
      releaseIdentityHash: RELEASE,
      modelConfig: {},
      mcpClient: {},
    }),
    (error) => error.code === 'SESSION_NOT_ACTIVE',
  )
})

test('fork copies encrypted history but never checkpoint or pending approval', async (t) => {
  const { store } = await fixture(t)
  await createBound(store)
  await store.appendEvent(SESSION_A, RELEASE, { type: 'APPROVAL_PENDING', proposalId: 'proposal-secret' })
  await store.putProposalArguments(SESSION_A, RELEASE, 'proposal-secret', { input: 'approved-secret' })
  await store.setCheckpointSnapshot(SESSION_A, RELEASE, { schemaVersion: 'test', secret: 'checkpoint-secret' })
  const forked = await store.fork(SESSION_A, {
    releaseIdentityHash: RELEASE,
    threadId: 'thread-forked',
    sessionIdFactory: () => SESSION_B,
  })
  assert.equal(forked.sessionId, SESSION_B)
  const payload = await store.load(SESSION_B, { expectedReleaseIdentityHash: RELEASE })
  assert.equal(payload.threadId, 'thread-forked')
  assert.equal(payload.events.some((event) => event.type === 'APPROVAL_PENDING'), false)
  assert.deepEqual(payload.proposalArguments, {})
  assert.equal(payload.checkpointSnapshot, null)
})

test('bootstrap Journey binding can move exactly once before a checkpoint exists', async (t) => {
  const { store } = await fixture(t)
  await createBound(store, { journeyId: 'journey-bootstrap-temporary', events: [{ type: 'RUN_STARTED' }] })
  await store.rebindJourney(SESSION_A, RELEASE, {
    expectedJourneyId: 'journey-bootstrap-temporary', journeyId: 'journey-authoritative-final',
  })
  const payload = await store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE, expectedJourneyId: 'journey-authoritative-final' })
  assert.equal(payload.journeyId, 'journey-authoritative-final')
  await store.appendEvent(SESSION_A, RELEASE, { type: 'JOURNEY_BOOTSTRAP_RESOLVED' })
  await assert.rejects(store.rebindJourney(SESSION_A, RELEASE, {
    expectedJourneyId: 'journey-authoritative-final', journeyId: 'journey-other',
  }), (error) => error.code === 'SESSION_JOURNEY_REBIND_ALREADY_RESOLVED')
})

test('restart restores encrypted LangGraph checkpoint and proposal arguments for exact approval', async (t) => {
  const { root, store } = await fixture(t)
  await createBound(store, { events: [] })
  const state = { journeyId: 'journey-sensitive-name', version: 4, status: 'AWAITING_INPUT' }
  const calls = []
  const mcpClient = {
    async callTool(request) {
      calls.push(structuredClone(request))
      if (request.name === 'journey_get') return { content: [{ type: 'text', text: JSON.stringify(state) }] }
      if (request.name === 'journey_input_submit') {
        state.version = 5
        state.status = 'INPUT_ACCEPTED'
        return { content: [{ type: 'text', text: JSON.stringify({ version: 5, status: state.status }) }] }
      }
      throw new Error('unexpected tool')
    },
  }
  const modelFactory = () => ({ withConfig: () => ({
    async invoke() {
      return { content: JSON.stringify({
        type: 'PROPOSE', summary: 'Persist exact secret input.', toolName: 'journey_input_submit',
        arguments: {
          journeyId: state.journeyId,
          expectedVersion: 4,
          inputKind: 'INITIAL_CASE_INPUT',
          normalizedInput: { note: 'restart-secret-value' },
          submissionRef: 'submission-restart',
          sessionRef: 'session-restart',
        },
      }) }
    },
  }) })
  const common = {
    sessionStore: store,
    sessionId: SESSION_A,
    modelConfig: { apiKey: 'test-key-not-real', baseURL: 'http://model.invalid/v1', model: 'configured-model' },
    modelFactory,
    mcpClient,
    releaseIdentityHash: RELEASE,
  }
  const beforeRestart = await createPersistentControllerRuntimeV2(common)
  const started = await beforeRestart.start({
    requestId: 'request-start', namespace: 'tenant-sensitive-name',
    threadId: 'thread-sensitive-name', journeyId: state.journeyId, userInput: 'restart-secret-input',
  })
  assert.equal(started.status, 'AWAITING_USER')
  const persistedBytes = await readFile(path.join(root, `${SESSION_A}.hzs`), 'utf8')
  assert.doesNotMatch(persistedBytes, /restart-secret-input|restart-secret-value|normalizedInput/)

  const afterRestart = await createPersistentControllerRuntimeV2(common)
  const completed = await afterRestart.resume({
    requestId: 'request-resume', namespace: 'tenant-sensitive-name',
    threadId: started.threadId, journeyId: started.journeyId,
    decision: {
      approved: true,
      proposalId: started.approval.proposalId,
      contentHash: started.approval.contentHash,
      expectedVersion: started.approval.expectedVersion,
      idempotencyKey: 'idem-restart-001',
    },
  })
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.harnessVersion, 5)
  assert.equal(calls.filter((call) => call.name === 'journey_input_submit').length, 1)
  const payload = await store.load(SESSION_A, { expectedReleaseIdentityHash: RELEASE })
  assert.deepEqual(payload.proposalArguments, {})
})
