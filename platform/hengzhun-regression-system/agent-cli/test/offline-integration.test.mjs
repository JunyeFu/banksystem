import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { EncryptedSessionStore } from '../../controller/src/session-store.mjs'
import { EncryptedOperationStore } from '../../controller/src/operation-store.mjs'
import { createHarnessAttachmentImporter, createLazyEnvironmentService, createLocalCaptureLauncher, createProductionService } from '../src/production-service.mjs'

const RELEASE = '7'.repeat(64)
const SESSION = `session-${'8'.repeat(32)}`
const OPERATION = `operation-${'6'.repeat(32)}`
const JOURNEY = 'journey-offline-integration'
const CREDENTIAL_SESSION = 'credsession_12345678-1234-1234-1234-123456789abc'
const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function textResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }] } }

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-tp08-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = await new EncryptedSessionStore({ root, sessionIdFactory: () => SESSION }).initialize()
  const operationRoot = path.join(root, 'operations')
  const operationStore = await new EncryptedOperationStore({ root: operationRoot, operationIdFactory: () => OPERATION }).initialize()
  return { root, operationRoot, store, operationStore }
}

function runtimeOptions(store, state, { gate = async () => undefined, mutations = [], bootstrap = false, modelPlan, sessionIdFactory, operationStore, captureLauncher, now } = {}) {
  return {
    sessionStore: store,
    releaseIdentityHash: RELEASE,
    modelConfig: { apiKey: 'offline-test-key', baseURL: 'http://model.invalid/v1', model: 'offline-model' },
    modelFactory: () => ({ withConfig: () => ({ async invoke() { return { content: JSON.stringify(modelPlan || {
      type: 'PROPOSE', summary: 'Submit bounded input.', toolName: 'journey_input_submit',
      arguments: {
            journeyId: JOURNEY, expectedVersion: state.version, inputKind: 'INITIAL_CASE_INPUT',
        normalizedInput: { note: 'sensitive-offline-input' }, submissionRef: 'submission-offline', sessionRef: 'session-offline',
      },
    }) } } }) }),
    mcpClient: { async callTool(request) {
      if (request.name === 'journey_prepare') {
        mutations.push(structuredClone(request))
        state.journeyId = JOURNEY
        state.version = 1
        state.status = 'AWAITING_INPUT'
        return textResult({ journeyId: JOURNEY, version: 1, status: state.status })
      }
      if (request.name === 'journey_get') return textResult(structuredClone(state))
      if (request.name === 'journey_input_submit') {
        mutations.push(structuredClone(request))
        state.version = 5
        state.status = 'INPUT_ACCEPTED'
        return textResult({ version: 5, status: state.status })
      }
      if (request.name === 'credential_session_create') {
        mutations.push(structuredClone(request))
        return textResult({
          sessionId: CREDENTIAL_SESSION, version: 1, status: 'AWAITING_INPUT',
          expiresAt: '2026-08-26T21:15:00.000Z',
          captureUrl: `http://127.0.0.1:18788/v1/i10/credentials/${CREDENTIAL_SESSION}/form#token=${'t'.repeat(43)}`,
        })
      }
      throw new Error('unexpected tool')
    } },
    namespace: 'offline-tenant',
    ...(bootstrap ? {} : { journeyResolver: async () => JOURNEY }),
    writeGate: gate,
    threadIdFactory: () => 'thread-offline-integration',
    ...(sessionIdFactory ? { sessionIdFactory } : {}),
    ...(operationStore ? { operationStore } : {}),
    ...(captureLauncher ? { captureLauncher } : {}),
    ...(now ? { now } : {}),
  }
}

test('real CurrentUser DPAPI restores an exact pending approval into one offline mutation', async (t) => {
  const { root, store } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }
  const mutations = []
  const first = createProductionService(runtimeOptions(store, state, { mutations }))
  const pending = await first.start({ input: 'perform the bounded write', attachmentRefs: [], noSession: false })
  assert.equal(pending.status, 'AWAITING_USER')
  assert.equal(mutations.length, 0)

  const envelopeText = await readFile(path.join(root, `${SESSION}.hzs`), 'utf8')
  for (const secret of ['perform the bounded write', 'sensitive-offline-input', 'offline-tenant']) assert.equal(envelopeText.includes(secret), false)
  assert.equal(JSON.parse(envelopeText).cipher, 'WINDOWS_DPAPI_CURRENT_USER')

  const restoredStore = await new EncryptedSessionStore({ root }).initialize()
  const restarted = createProductionService(runtimeOptions(restoredStore, state, { mutations }))
  const completed = await restarted.resume({ sessionId: SESSION, proposalId: pending.approval.proposalId, approved: true })
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].name, 'journey_input_submit')
  await assert.rejects(
    restarted.resume({ sessionId: SESSION, proposalId: pending.approval.proposalId, approved: true }),
    (error) => error.code === 'APPROVAL_ALREADY_RESOLVED',
  )
  assert.equal(mutations.length, 1)
})

test('unexpected Flowise blocks before any local session or mutation is created', async (t) => {
  const { store } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }
  const service = createProductionService(runtimeOptions(store, state, { gate: async () => {
    throw Object.assign(new Error('blocked'), { code: 'UNEXPECTED_FLOWISE_BLOCKS_WRITES' })
  } }))
  await assert.rejects(service.start({ input: 'must not persist', attachmentRefs: [] }), (error) => error.code === 'UNEXPECTED_FLOWISE_BLOCKS_WRITES')
  assert.equal((await store.list()).length, 0)
})

test('rejection is persisted without invoking the mutation tool', async (t) => {
  const { store } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }
  const mutations = []
  const service = createProductionService(runtimeOptions(store, state, { mutations }))
  const pending = await service.start({ input: 'prepare only', attachmentRefs: [] })
  const rejected = await service.resume({ sessionId: SESSION, proposalId: pending.approval.proposalId, approved: false })
  assert.equal(rejected.status, 'REJECTED')
  assert.equal(mutations.length, 0)
  const payload = await store.load(SESSION, { expectedReleaseIdentityHash: RELEASE })
  assert.equal(payload.events.at(-1).type, 'APPROVAL_REJECTED')
  assert.deepEqual(payload.proposalArguments, {})
})

test('durability opt-out and unbound credential command fail closed', async (t) => {
  const { store } = await fixture(t)
  const service = createProductionService(runtimeOptions(store, { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }))
  await assert.rejects(service.start({ input: 'x', noSession: true }), (error) => error.code === 'DURABLE_SESSION_REQUIRED')
  await assert.rejects(service.credentialEnroll({}), (error) => error.code === 'CREDENTIAL_ENROLLMENT_NOT_BOUND')
})

test('credential enrollment restores one HIGH exact approval and launches no persisted capture URL', async (t) => {
  const { operationRoot, store, operationStore } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }
  const mutations = []
  const launched = []
  const initial = createProductionService(runtimeOptions(store, state, {
    operationStore, mutations, captureLauncher: async (url) => launched.push(url),
  }))
  const pending = await initial.credentialEnroll({})
  assert.equal(pending.status, 'AWAITING_USER')
  assert.equal(pending.sessionId, OPERATION)
  assert.equal(pending.approval.risk, 'HIGH')
  assert.equal(mutations.length, 0)
  const before = `${await readFile(path.join(operationRoot, `${OPERATION}.hzo`), 'utf8')}\n${await readFile(path.join(operationRoot, 'index-v1.json'), 'utf8')}`
  for (const forbidden of ['Hengzhun CLI credential', '#token=', '127.0.0.1:18788']) assert.equal(before.includes(forbidden), false)

  const restored = await new EncryptedOperationStore({ root: operationRoot }).initialize()
  const resumed = createProductionService(runtimeOptions(store, state, {
    operationStore: restored, mutations, captureLauncher: async (url) => launched.push(url),
  }))
  const completed = await resumed.resume({
    sessionId: OPERATION, proposalId: pending.approval.proposalId, approved: true,
  })
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.operationKind, 'CREDENTIAL_ENROLLMENT')
  assert.equal(JSON.stringify(completed).includes('captureUrl'), false)
  assert.equal(JSON.stringify(completed).includes('#token='), false)
  assert.equal(mutations.filter((call) => call.name === 'credential_session_create').length, 1)
  assert.equal(launched.length, 1)
  assert.match(launched[0], /^http:\/\/127\.0\.0\.1:18788\/v1\/i10\/credentials\/credsession_/)
  const after = await readFile(path.join(operationRoot, `${OPERATION}.hzo`), 'utf8')
  assert.equal(after.includes('#token='), false)
  await assert.rejects(
    resumed.resume({ sessionId: OPERATION, proposalId: pending.approval.proposalId, approved: true }),
    (error) => error.code === 'APPROVAL_ALREADY_RESOLVED',
  )
  assert.equal(mutations.filter((call) => call.name === 'credential_session_create').length, 1)
})

test('credential enrollment rejection completes locally with zero MCP mutation', async (t) => {
  const { store, operationStore } = await fixture(t)
  const mutations = []
  const service = createProductionService(runtimeOptions(store, { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }, {
    operationStore, mutations, captureLauncher: async () => assert.fail('launcher must not run'),
  }))
  const pending = await service.credentialEnroll({})
  const rejected = await service.resume({ sessionId: OPERATION, proposalId: pending.approval.proposalId, approved: false })
  assert.equal(rejected.status, 'REJECTED')
  assert.equal(mutations.length, 0)
  assert.equal((await operationStore.load(OPERATION, { expectedReleaseIdentityHash: RELEASE })).status, 'COMPLETED')
})

test('credential capture launcher permits only the exact loopback form and never shells a remote URL', async () => {
  const calls = []
  const launcher = createLocalCaptureLauncher({ spawnFactory(executable, args, options) {
    calls.push({ executable, args, options })
    const child = new EventEmitter()
    child.unref = () => undefined
    queueMicrotask(() => child.emit('spawn'))
    return child
  } })
  const valid = `http://127.0.0.1:18788/v1/i10/credentials/${CREDENTIAL_SESSION}/form#token=${'a'.repeat(43)}`
  await launcher(valid)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, 'rundll32.exe')
  assert.deepEqual(calls[0].args, ['url.dll,FileProtocolHandler', valid])
  for (const invalid of [
    valid.replace('127.0.0.1', 'remote.invalid'), valid.replace('#token=', '?x=1#token='), valid.replace(/#token=.*/, ''),
  ]) await assert.rejects(launcher(invalid), (error) => error.code === 'CREDENTIAL_CAPTURE_URL_FORBIDDEN')
  assert.equal(calls.length, 1)
})

test('launcher failure is terminal for the approved operation and cannot repeat the MCP mutation', async (t) => {
  const { store, operationStore } = await fixture(t)
  const mutations = []
  const service = createProductionService(runtimeOptions(store, { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }, {
    operationStore, mutations, captureLauncher: async () => { throw Object.assign(new Error('failed'), { code: 'CREDENTIAL_CAPTURE_LAUNCH_FAILED' }) },
  }))
  const pending = await service.credentialEnroll({})
  await assert.rejects(
    service.resume({ sessionId: OPERATION, proposalId: pending.approval.proposalId, approved: true }),
    (error) => error.code === 'CREDENTIAL_CAPTURE_LAUNCH_FAILED',
  )
  assert.equal(mutations.filter((call) => call.name === 'credential_session_create').length, 1)
  await assert.rejects(
    service.resume({ sessionId: OPERATION, proposalId: pending.approval.proposalId, approved: true }),
    (error) => error.code === 'APPROVAL_ALREADY_RESOLVED',
  )
  assert.equal(mutations.filter((call) => call.name === 'credential_session_create').length, 1)
})

test('credential enrollment rejects frozen-argument drift and expiry before MCP mutation', async (t) => {
  const driftFixture = await fixture(t)
  const driftMutations = []
  const driftService = createProductionService(runtimeOptions(driftFixture.store, { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }, {
    operationStore: driftFixture.operationStore, mutations: driftMutations, captureLauncher: async () => undefined,
  }))
  const driftPending = await driftService.credentialEnroll({})
  await driftFixture.operationStore.putProposalArguments(OPERATION, RELEASE, driftPending.approval.proposalId, {
    label: 'tampered label', sessionRef: OPERATION,
  })
  await assert.rejects(
    driftService.resume({ sessionId: OPERATION, proposalId: driftPending.approval.proposalId, approved: true }),
    (error) => error.code === 'CREDENTIAL_ENROLLMENT_ARGUMENTS_UNAVAILABLE',
  )
  assert.equal(driftMutations.length, 0)

  const expiryFixture = await fixture(t)
  const expiryMutations = []
  const startTime = Date.parse('2026-08-26T20:00:00.000Z')
  const initial = createProductionService(runtimeOptions(expiryFixture.store, { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }, {
    operationStore: expiryFixture.operationStore, mutations: expiryMutations,
    captureLauncher: async () => undefined, now: () => startTime,
  }))
  const expiryPending = await initial.credentialEnroll({})
  const expired = createProductionService(runtimeOptions(expiryFixture.store, { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }, {
    operationStore: expiryFixture.operationStore, mutations: expiryMutations,
    captureLauncher: async () => undefined, now: () => startTime + 300_001,
  }))
  await assert.rejects(
    expired.resume({ sessionId: OPERATION, proposalId: expiryPending.approval.proposalId, approved: true }),
    (error) => error.code === 'AGENT_CONTROLLER_APPROVAL_EXPIRED',
  )
  assert.equal(expiryMutations.length, 0)
})

test('a fresh natural-language run bootstraps one authoritative Journey before Controller hydration', async (t) => {
  const { store } = await fixture(t)
  const state = { journeyId: null, version: 0, status: 'NOT_CREATED' }
  const mutations = []
  const service = createProductionService(runtimeOptions(store, state, { mutations, bootstrap: true }))
  const bootstrap = await service.start({ input: 'create a new bounded case', attachmentRefs: [] })
  assert.equal(bootstrap.status, 'AWAITING_USER')
  assert.match(bootstrap.journeyId, /^journey-bootstrap-/)
  assert.equal(mutations.length, 0)

  const next = await service.resume({ sessionId: SESSION, proposalId: bootstrap.approval.proposalId, approved: true })
  assert.equal(next.status, 'AWAITING_USER')
  assert.equal(next.journeyId, JOURNEY)
  assert.deepEqual(mutations.map((call) => call.name), ['journey_prepare'])
  const rebound = await store.load(SESSION, { expectedReleaseIdentityHash: RELEASE, expectedJourneyId: JOURNEY })
  assert.equal(rebound.events.some((event) => event.type === 'JOURNEY_BOOTSTRAP_RESOLVED'), true)

  const completed = await service.resume({ sessionId: SESSION, proposalId: next.approval.proposalId, approved: true })
  assert.equal(completed.status, 'COMPLETED')
  assert.deepEqual(mutations.map((call) => call.name), ['journey_prepare', 'journey_input_submit'])
})

test('public version readback binds configured model identity without opening MCP or session state', async () => {
  const env = { HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1' }
  const service = createLazyEnvironmentService({ env, productRoot })
  const value = await service.version()
  assert.equal(value.runtime, 'CONTROLLER_V2_BOUND')
  assert.match(value.releaseIdentityHash, /^[a-f0-9]{64}$/)
})

test('attachment importer streams bytes only to loopback Harness and returns a safe receipt', async (t) => {
  const originalFetch = globalThis.fetch
  let observed
  globalThis.fetch = async (url, options) => {
    observed = { url: String(url), options }
    return { ok: true, async json() { return { schemaVersion: 'AttachmentReceiptV1', attachmentRef: 'att_12345678', sha256: 'a'.repeat(64), size: 3 } } }
  }
  t.after(() => { globalThis.fetch = originalFetch })
  const importer = createHarnessAttachmentImporter({ harnessUrl: 'http://127.0.0.1:18788', serviceToken: 's'.repeat(32) })
  const result = await importer({ bytes: Buffer.from([1, 2, 3]), nameBase64Url: 'Y2FzZS5wbmc', sha256: 'a'.repeat(64) })
  assert.deepEqual(result, { attachmentRef: 'att_12345678', sha256: 'a'.repeat(64), size: 3 })
  assert.equal(observed.url, 'http://127.0.0.1:18788/v1/i10/attachments:import')
  assert.equal(observed.options.headers.authorization, `Bearer ${'s'.repeat(32)}`)
  assert.equal(observed.options.body.equals(Buffer.from([1, 2, 3])), true)
  assert.throws(() => createHarnessAttachmentImporter({ harnessUrl: 'https://remote.invalid', serviceToken: 's'.repeat(32) }),
    (error) => error.code === 'AGENT_HARNESS_NOT_LOOPBACK')
})

test('TUI follow-up forks an encrypted session on the same Journey and rejects attachment carryover', async (t) => {
  const { store } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }
  await store.create({ namespace: 'offline-tenant', threadId: 'thread-source', journeyId: JOURNEY, releaseIdentityHash: RELEASE, events: [{ type: 'TURN_FINISHED', status: 'AWAITING_USER' }] })
  const continuedId = `session-${'9'.repeat(32)}`
  const service = createProductionService(runtimeOptions(store, state, {
    modelPlan: { type: 'ANSWER', answer: 'follow-up complete' }, sessionIdFactory: () => continuedId,
  }))
  await assert.rejects(service.continueSession({ sessionId: SESSION, input: 'with attachment', attachmentRefs: ['att_12345678'] }),
    (error) => error.code === 'ATTACHMENT_REQUIRES_NEW_SESSION')
  const result = await service.continueSession({ sessionId: SESSION, input: 'continue safely', attachmentRefs: [] })
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.sessionId, continuedId)
  assert.equal(result.journeyId, JOURNEY)
  const payload = await store.load(continuedId, { expectedReleaseIdentityHash: RELEASE, expectedJourneyId: JOURNEY })
  assert.equal(payload.threadId, 'thread-offline-integration')
  assert.equal(payload.events.some((event) => event.type === 'RUN_CONTINUED' && event.sourceSessionId === SESSION), true)
})

test('TUI follow-up refuses to bypass an unresolved exact approval', async (t) => {
  const { store } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 4, status: 'AWAITING_INPUT' }
  const service = createProductionService(runtimeOptions(store, state))
  const pending = await service.start({ input: 'prepare one exact write', attachmentRefs: [] })
  assert.equal(pending.status, 'AWAITING_USER')
  await assert.rejects(
    service.continueSession({ sessionId: SESSION, input: 'ignore that and continue', attachmentRefs: [] }),
    (error) => error.code === 'APPROVAL_DECISION_REQUIRED' && error.exitCode === 20,
  )
  assert.equal((await store.list()).length, 1)
})

test('evidence command is a pure Journey read with bounded authority and no download URL', async (t) => {
  const { store } = await fixture(t)
  const state = { journeyId: JOURNEY, version: 9, status: 'COMPLETED', terminal: true, references: {
    caseId: 'case_12345678', preparationId: 'preparation_12345678', candidateId: 'candidate_12345678',
    certificateId: 'certificate_12345678', scriptId: 'script_12345678', scriptHash: 'b'.repeat(64),
    planId: 'plan_12345678', confirmedDecisionEventId: 'decision_12345678', taskId: 'task_12345678',
    runId: 'run_12345678', inboxId: 'inbox_12345678', resultArtifactId: 'art_12345678',
    credentialRef: 'credential_must_not_project', captureUrl: 'http://must-not-project.invalid/#token=secret',
  }, artifactCards: [{
    artifactId: 'art_12345678', displayName: 'result.json', mediaType: 'application/json', sha256: 'a'.repeat(64),
    size: 321, downloadGrantRequired: true, href: 'http://must-not-project.invalid/secret',
  }] }
  const service = createProductionService(runtimeOptions(store, state))
  const result = await service.evidence({ journeyId: JOURNEY })
  assert.equal(result.schemaVersion, 'hengzhun-cli-evidence-view/v1')
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.terminal, true)
  assert.equal(result.references.certificateId, 'certificate_12345678')
  assert.equal(result.references.resultArtifactId, 'art_12345678')
  assert.equal(result.references.credentialRef, undefined)
  assert.equal(result.artifactCards[0].artifactId, 'art_12345678')
  assert.equal(result.artifactCards[0].downloadGrantRequired, true)
  assert.doesNotMatch(JSON.stringify(result), /href|captureUrl|credential_must_not_project|token=secret/)
})
