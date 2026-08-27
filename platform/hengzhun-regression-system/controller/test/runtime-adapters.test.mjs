import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ControllerAdapterError,
  createMcpControllerAdapters,
  createOpenAIJsonInvoker,
  stableHash,
  validateMcpLoopbackUrl,
} from '../src/runtime-adapters.mjs'
import { createControllerRuntimeV2 } from '../src/controller-runtime.mjs'

function textResult(payload, isError = false) {
  return { isError, content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

function mutationCommand(overrides = {}) {
  const args = {
    journeyId: 'journey-adapter',
    expectedVersion: 4,
    inputKind: 'INITIAL_CASE_INPUT',
    normalizedInput: { title: 'bounded' },
    submissionRef: 'submission-adapter',
    sessionRef: 'session-adapter',
  }
  return {
    toolName: 'journey_input_submit',
    arguments: args,
    argumentsHash: stableHash(args),
    contentHash: 'c'.repeat(64),
    expectedVersion: 4,
    risk: 'MEDIUM',
    idempotencyKey: 'idem-adapter-001',
    ...overrides,
  }
}

test('MCP URL accepts only exact authenticated loopback shape', () => {
  assert.equal(validateMcpLoopbackUrl('http://127.0.0.1:18789/mcp').href, 'http://127.0.0.1:18789/mcp')
  for (const value of [
    'https://127.0.0.1:18789/mcp',
    'http://localhost:18789/mcp',
    'http://127.0.0.1:18789/other',
    'http://127.0.0.1:18789/mcp?token=x',
    'http://example.com:18789/mcp',
  ]) assert.throws(() => validateMcpLoopbackUrl(value), ControllerAdapterError)
})

test('OpenAI-compatible adapter fixes JSON mode, zero retries and no tools without making a real request', async () => {
  let observedConfig
  let observedBinding
  let observedMessages
  const invokeJson = createOpenAIJsonInvoker({
    apiKey: 'test-key-not-real',
    baseURL: 'http://model.invalid/v1',
    model: 'configured-model',
    modelFactory(config) {
      observedConfig = config
      return {
        withConfig(binding) {
          observedBinding = binding
          return {
            async invoke(messages) {
              observedMessages = messages
              return { content: '{"type":"ANSWER","answer":"ok"}' }
            },
          }
        },
      }
    },
  })
  assert.equal(await invokeJson({ systemPrompt: 'bounded', input: '{}' }), '{"type":"ANSWER","answer":"ok"}')
  assert.equal(observedConfig.maxRetries, 0)
  assert.equal(observedConfig.temperature, 0)
  assert.deepEqual(observedBinding.tools, [])
  assert.deepEqual(observedBinding.response_format, { type: 'json_object' })
  assert.equal(observedMessages.length, 2)
})

test('model timeout is canonical and never echoes configuration secrets', async () => {
  const invokeJson = createOpenAIJsonInvoker({
    apiKey: 'secret-test-key', baseURL: 'http://model.invalid/v1', model: 'm', timeoutMs: 50,
    modelFactory: () => ({ withConfig: () => ({ invoke: () => new Promise(() => {}) }) }),
  })
  await assert.rejects(
    invokeJson({ systemPrompt: 'bounded', input: '{}' }),
    (error) => error.code === 'AGENT_ADAPTER_MODEL_TIMEOUT' && !error.message.includes('secret-test-key'),
  )
})

test('external cancellation interrupts an uncooperative model operation deterministically', async () => {
  const invokeJson = createOpenAIJsonInvoker({
    apiKey: 'secret-test-key', baseURL: 'http://model.invalid/v1', model: 'm', timeoutMs: 1000,
    modelFactory: () => ({ withConfig: () => ({ invoke: () => new Promise(() => {}) }) }),
  })
  const controller = new AbortController()
  const pending = invokeJson({ systemPrompt: 'bounded', input: '{}', signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, (error) => error.code === 'AGENT_ADAPTER_CANCELLED')
})

test('readJourney and deterministic prefetch accept one canonical MCP text result each', async () => {
  const calls = []
  const client = {
    async callTool(request) {
      calls.push(structuredClone(request))
      return textResult({
        journeyId: 'journey-adapter', version: 4, status: 'AWAITING_INPUT',
        targetProfileRef: 'target-adapter', missingFields: ['entryUrl'],
      })
    },
  }
  const adapter = createMcpControllerAdapters({ client })
  assert.equal((await adapter.readJourney('journey-adapter')).version, 4)
  const prefetched = await adapter.prefetch({ namespace: 'tenant-a', journeyId: 'journey-adapter', expectedVersion: 4 })
  assert.equal(prefetched.journey.targetProfileRef, 'target-adapter')
  assert.deepEqual(calls.map((call) => call.name), ['journey_get', 'journey_get'])
  assert.ok(calls.every((call) => call.arguments.waitSeconds === 0))
})

test('mutation sends the exact frozen payload while controller-level idempotency fences duplicates', async () => {
  const calls = []
  const adapter = createMcpControllerAdapters({ client: {
    async callTool(request) {
      calls.push(structuredClone(request))
      return textResult({ version: 5, status: 'INPUT_ACCEPTED' })
    },
  } })
  const result = await adapter.invoke(mutationCommand())
  assert.equal(result.harnessVersion, 5)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].arguments.idempotencyKey, undefined)
  assert.deepEqual(calls[0].arguments, mutationCommand().arguments)
  assert.deepEqual(calls[0].arguments.normalizedInput, { title: 'bounded' })
})

test('argument hash, version and idempotency fencing fail before transport', async (t) => {
  for (const [name, command, code] of [
    ['hash', mutationCommand({ argumentsHash: '0'.repeat(64) }), 'AGENT_ADAPTER_ARGUMENT_HASH_MISMATCH'],
    ['version', (() => {
      const command = mutationCommand()
      command.arguments = { ...command.arguments, expectedVersion: 9 }
      command.argumentsHash = stableHash(command.arguments)
      return command
    })(), 'AGENT_ADAPTER_VERSION_FENCE_MISMATCH'],
    ['idempotency', (() => {
      const command = mutationCommand()
      command.arguments = { ...command.arguments, idempotencyKey: 'different-idem' }
      command.argumentsHash = stableHash(command.arguments)
      return command
    })(), 'AGENT_ADAPTER_IDEMPOTENCY_FENCE_MISMATCH'],
  ]) {
    await t.test(name, async () => {
      let calls = 0
      const adapter = createMcpControllerAdapters({ client: { async callTool() { calls += 1 } } })
      await assert.rejects(adapter.invoke(command), (error) => error.code === code)
      assert.equal(calls, 0)
    })
  }
})

test('duplicate mutation key fails closed and never makes a second call', async () => {
  let calls = 0
  const adapter = createMcpControllerAdapters({ client: {
    async callTool() { calls += 1; return textResult({ version: 5, status: 'INPUT_ACCEPTED' }) },
  } })
  const command = mutationCommand()
  await adapter.invoke(command)
  await assert.rejects(adapter.invoke(command), (error) => error.code === 'AGENT_ADAPTER_DUPLICATE_MUTATION')
  assert.equal(calls, 1)
})

test('business conflict, disconnect and timeout are canonical and mutation is never retried', async (t) => {
  for (const [name, implementation, code] of [
    ['conflict', async () => textResult({ errorCode: 'I10_JOURNEY_VERSION_CONFLICT' }, true), 'AGENT_ADAPTER_AUTHORITY_CONFLICT'],
    ['disconnect', async () => { throw new Error('socket with sensitive details') }, 'AGENT_ADAPTER_MCP_DISCONNECTED'],
    ['timeout', async () => new Promise(() => {}), 'AGENT_ADAPTER_MUTATION_TIMEOUT'],
  ]) {
    await t.test(name, async () => {
      let calls = 0
      const adapter = createMcpControllerAdapters({ timeoutMs: 50, client: {
        async callTool(request, options) { calls += 1; return implementation(request, options) },
      } })
      await assert.rejects(adapter.invoke(mutationCommand()), (error) => error.code === code)
      assert.equal(calls, 1)
    })
  }
})

test('stale prefetch and transport success with invalid business body both fail closed', async (t) => {
  await t.test('stale prefetch', async () => {
    const adapter = createMcpControllerAdapters({ client: {
      async callTool() { return textResult({ journeyId: 'journey-adapter', version: 5, status: 'OTHER' }) },
    } })
    await assert.rejects(
      adapter.prefetch({ namespace: 'n', journeyId: 'journey-adapter', expectedVersion: 4 }),
      (error) => error.code === 'AGENT_ADAPTER_AUTHORITY_CONFLICT',
    )
  })
  await t.test('invalid mutation body', async () => {
    const adapter = createMcpControllerAdapters({ client: {
      async callTool() { return textResult({ accepted: true }) },
    } })
    await assert.rejects(adapter.invoke(mutationCommand()), (error) => error.code === 'AGENT_ADAPTER_MUTATION_RESULT_INVALID')
  })
})

test('runtime composition connects tool-free planning to MCP reads, one mutation and readback', async () => {
  const state = { journeyId: 'journey-adapter', version: 4, status: 'AWAITING_INPUT' }
  const calls = []
  const mcpClient = {
    async callTool(request) {
      calls.push(structuredClone(request))
      if (request.name === 'journey_get') return textResult(structuredClone(state))
      if (request.name === 'journey_input_submit') {
        state.version += 1
        state.status = 'INPUT_ACCEPTED'
        return textResult({ version: state.version, status: state.status })
      }
      throw new Error('unexpected tool')
    },
  }
  const runtime = createControllerRuntimeV2({
    modelConfig: { apiKey: 'test-key-not-real', baseURL: 'http://model.invalid/v1', model: 'configured-model' },
    modelFactory: () => ({ withConfig: () => ({
      async invoke() {
        return { content: JSON.stringify({
          type: 'PROPOSE', summary: 'Submit bounded input.', toolName: 'journey_input_submit',
          arguments: {
            journeyId: 'journey-adapter', expectedVersion: 4,
            inputKind: 'INITIAL_CASE_INPUT', normalizedInput: { title: 'bounded' },
            submissionRef: 'submission-adapter', sessionRef: 'session-adapter',
          },
        }) }
      },
    }) }),
    mcpClient,
    releaseIdentityHash: 'd35cc71109b5e61dd95aa706540ad32e8f2914051a14a0d6f06f94b4980fc67a',
    threadIdFactory: () => 'thread-adapter',
  })
  const started = await runtime.start({
    requestId: 'request-start-adapter', namespace: 'tenant-a',
    journeyId: 'journey-adapter', userInput: 'continue',
  })
  assert.equal(started.status, 'AWAITING_USER')
  const completed = await runtime.resume({
    requestId: 'request-resume-adapter', namespace: 'tenant-a',
    threadId: started.threadId, journeyId: started.journeyId,
    decision: {
      approved: true, proposalId: started.approval.proposalId,
      contentHash: started.approval.contentHash,
      expectedVersion: started.approval.expectedVersion,
      idempotencyKey: 'idem-runtime-adapter-001',
    },
  })
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.harnessVersion, 5)
  assert.equal(calls.filter((call) => call.name === 'journey_input_submit').length, 1)
  assert.equal(calls.at(-1).name, 'journey_get')
})
