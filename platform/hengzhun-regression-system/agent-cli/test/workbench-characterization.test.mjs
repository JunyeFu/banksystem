import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { TestSessionStore as EncryptedSessionStore } from '../../controller/test/session-fixture.mjs'
import { createProductionService } from '../src/production-service.mjs'

const release = 'b'.repeat(64)
const journey = 'journey-workbench-characterization'
const sourceId = `session-${'1'.repeat(32)}`
const forkId = `session-${'2'.repeat(32)}`
const input = '目标系统：复兴银行客户门户。访问 http://127.0.0.1:18082/portal/login，使用 credential_12345678-1234-4234-8234-123456789abc 安全凭据。登录并查询账户。'
const draft = { title: '查询账户', objective: '账户信息可见', summary: '只读查询', preconditions: [], steps: [{ action: '查询账户', expected: '账户可见' }], assertions: ['账户可见'], confidence: 1 }
const toolResult = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })

async function fixture(t, { onTool, modelOutput = draft, sessionId = sourceId } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hz-workbench-contract-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = await new EncryptedSessionStore({ root, sessionIdFactory: () => sessionId }).initialize()
  const calls = []
  const service = createProductionService({
    sessionStore: store, releaseIdentityHash: release, namespace: 'contract-only', directExecution: true,
    modelConfig: { apiKey: 'test-process-only', baseURL: 'http://model.invalid/v1', model: 'test-process-model' },
    modelFactory: () => ({ withConfig: () => ({ async invoke() { return { content: JSON.stringify(modelOutput) } } }) }),
    mcpClient: { async callTool(request, options) { calls.push(request); return onTool(request, options) } },
    writeGate: async () => undefined, threadIdFactory: () => 'thread-contract-only', sessionIdFactory: () => sessionId,
  })
  return { store, service, calls }
}

test('direct start with NEEDS_INPUT binds the Journey without approving or executing a bank action', async (t) => {
  const f = await fixture(t, { onTool: (request) => {
    assert.equal(request.name, 'journey_prepare')
    return toolResult({ journeyId: journey, version: 1, status: 'NEEDS_INPUT', stage: 'NEEDS_INPUT', missingFields: ['amount'], nextAction: { description: '请补充金额。' } })
  } })
  const result = await f.service.start({ input })
  assert.equal(result.status, 'NEEDS_INPUT')
  assert.equal(result.question, '请补充金额。')
  assert.deepEqual(result.missingFields, ['amount'])
  assert.deepEqual(f.calls.map((call) => call.name), ['journey_prepare'])
  const checkpoint = await f.store.load(result.sessionId, { expectedReleaseIdentityHash: release, expectedJourneyId: journey })
  assert.equal(checkpoint.events.at(-1).status, 'NEEDS_INPUT')
  // The public list remains metadata-only, not an invented transcript.
  const metadata = await f.service.sessionShow({ sessionId: result.sessionId })
  assert.equal('messages' in metadata, false)
  assert.equal('events' in metadata, false)
})

test('even direct-mode continuation forks the checkpoint on the SAME Journey, not a new task', async (t) => {
  const f = await fixture(t, {
    sessionId: forkId, modelOutput: { type: 'ANSWER', answer: '已读取现有状态。' },
    onTool: (request) => {
      assert.equal(request.name, 'journey_get')
      return toolResult({ journeyId: journey, version: 4, status: 'NEEDS_INPUT', nextAction: { type: 'INPUT_REQUIRED' } })
    },
  })
  await f.store.create({ sessionId: sourceId, namespace: 'contract-only', threadId: 'thread-source', journeyId: journey, releaseIdentityHash: release, events: [{ type: 'TURN_FINISHED', status: 'NEEDS_INPUT' }] })
  const result = await f.service.continueSession({ sessionId: sourceId, input: '读取状态，不提交业务。' })
  assert.equal(result.sessionId, forkId)
  assert.equal(result.journeyId, journey)
  const checkpoint = await f.store.load(forkId, { expectedReleaseIdentityHash: release, expectedJourneyId: journey })
  assert.equal(checkpoint.events.some((event) => event.type === 'RUN_CONTINUED' && event.sourceSessionId === sourceId), true)
  assert.equal(f.calls.every((call) => call.name === 'journey_get'), true)
  assert.equal((await f.store.list()).length, 2)
})

test('aborting a dispatched MCP request is NOT proof of Worker cancellation or funds rollback', async (t) => {
  const stop = new AbortController()
  let sentSignal
  const f = await fixture(t, { onTool: (_request, options) => {
    sentSignal = options.signal
    stop.abort()
    return new Promise((_resolve, reject) => {
      if (sentSignal.aborted) reject(new Error('test-only MCP interruption'))
      else sentSignal.addEventListener('abort', () => reject(new Error('test-only MCP interruption')), { once: true })
    })
  } })
  await assert.rejects(f.service.start({ input, signal: stop.signal }), (error) => error.code === 'AGENT_BOOTSTRAP_FAILED')
  assert.equal(sentSignal.aborted, true)
  assert.deepEqual(f.calls.map((call) => call.name), ['journey_prepare'])
  const checkpoint = await f.store.load(sourceId, { expectedReleaseIdentityHash: release })
  assert.equal(checkpoint.status, 'ACTIVE')
  assert.equal(checkpoint.events.some((event) => event.type === 'TURN_FINISHED'), false)
})
