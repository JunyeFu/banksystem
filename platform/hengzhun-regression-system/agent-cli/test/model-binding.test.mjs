import assert from 'node:assert/strict'
import test from 'node:test'

import { probeConfiguredModel, probeProductReadiness } from '../src/product-doctor.mjs'

const binding = Object.freeze({
  HENGZHUN_MODEL_NAME: 'configured-model',
  HENGZHUN_MODEL_BASE_URL: 'https://model.example/v1/',
  HENGZHUN_MODEL_API_KEY: 'private-key',
})

test('configured model probe sends one minimal request and returns only redacted binding identity', async () => {
  const calls = []
  const result = await probeConfiguredModel({
    environment: binding,
    fetchFn: async (url, options) => {
      calls.push({ url: String(url), options })
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'READY' } }] } } }
    },
  })

  assert.equal(result.status, 'READY')
  assert.equal(result.modelName, 'configured-model')
  assert.match(result.baseUrlHash, /^[a-f0-9]{64}$/)
  assert.equal(result.providerProtocol, 'OPENAI_COMPATIBLE')
  assert.equal(result.endpointKind, 'CHAT_COMPLETIONS')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://model.example/v1/chat/completions')
  assert.equal(calls[0].options.headers.authorization, 'Bearer private-key')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: 'configured-model', temperature: 0, max_tokens: 8, stream: false,
    messages: [{ role: 'user', content: 'Reply READY.' }],
  })
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('private-key'), false)
  assert.equal(serialized.includes('https://model.example'), false)
})

test('configured model probe requires exactly the complete three-variable binding', async () => {
  let calls = 0
  for (const missing of Object.keys(binding)) {
    const environment = { ...binding, [missing]: '' }
    const result = await probeConfiguredModel({ environment, fetchFn: async () => { calls += 1 } })
    assert.equal(result.status, 'NOT_READY')
    assert.equal(result.code, 'MODEL_CONFIGURATION_REQUIRED')
  }
  assert.equal(calls, 0)
})

test('configured model probe rejects an invalid API base before transport', async () => {
  let calls = 0
  const result = await probeConfiguredModel({
    environment: { ...binding, HENGZHUN_MODEL_BASE_URL: 'file:///private/model' },
    fetchFn: async () => { calls += 1 },
  })
  assert.equal(result.code, 'MODEL_BASE_URL_INVALID')
  assert.equal(calls, 0)
})

test('configured model probe reports transport HTTP JSON and response-shape failures explicitly', async (t) => {
  const cases = [
    ['transport', async () => { throw new Error('private transport detail') }, 'MODEL_TRANSPORT_FAILED'],
    ['http', async () => ({ ok: false, status: 401 }), 'MODEL_HTTP_401'],
    ['json', async () => ({ ok: true, status: 200, async json() { throw new Error('private response') } }), 'MODEL_RESPONSE_JSON_INVALID'],
    ['shape', async () => ({ ok: true, status: 200, async json() { return { choices: [] } } }), 'MODEL_RESPONSE_INVALID'],
  ]
  for (const [name, fetchFn, expected] of cases) await t.test(name, async () => {
    let calls = 0
    const result = await probeConfiguredModel({ environment: binding, fetchFn: async (...args) => { calls += 1; return fetchFn(...args) } })
    assert.equal(result.status, 'NOT_READY')
    assert.equal(result.code, expected)
    assert.equal(calls, 1)
    assert.equal(JSON.stringify(result).includes('private'), false)
  })
})

test('doctor reuses the configured model probe and stops before local services on model failure', async () => {
  let calls = 0
  const result = await probeProductReadiness({
    root: process.cwd(), environment: binding,
    fetchFn: async () => { calls += 1; return { ok: false, status: 429 } },
    exists: () => true,
  })
  assert.equal(result.status, 'NOT_READY')
  assert.equal(result.failedCheck, 'model')
  assert.equal(result.code, 'MODEL_HTTP_429')
  assert.equal(calls, 1)
})
