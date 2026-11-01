import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { agentWorkbenchOpenApi, workbenchOperations } from '../src/workbench-contract.mjs'
import { createAgentWorkbenchHandler, WorkbenchError } from '../src/workbench-http.mjs'

const { parse } = createRequire(new URL('../../package.json', import.meta.url))('yaml')
const origin = 'http://127.0.0.1:18790'
const id = '12345678-1234-4234-8234-123456789abc'
const time = '2026-10-19T08:00:00.000Z'
const profile = { id, version: 1, displayName: '测试进程模型', model: 'contract-model', baseUrl: 'https://model.invalid/v1', keyConfigured: true, isDefault: true }
const conversation = { id, title: '客户查询', status: 'RUNNING', createdAt: time, updatedAt: time, lastTurnId: id }
const turn = {
  id, conversationId: id, version: 1, status: 'RUNNING', inputMessageId: id,
  modelBinding: { profileId: id, profileVersion: 1, model: 'contract-model', baseUrlHash: 'a'.repeat(64), releaseIdentityHash: 'b'.repeat(64) },
  createdAt: time, updatedAt: time, events: [{ sequence: 1, type: 'ACCEPTED', summary: '已登记测试目标。', createdAt: time }], hasMoreEvents: false, humanInterventionRequired: false,
  result: { kind: 'REPLY', verdict: 'NOT_RUN' },
}
const responses = {
  getAgentBootstrap: { status: 'NOT_READY', environment: 'LOCAL', releaseIdentityHash: null, blockingReasons: ['AGENT_MODEL_CONFIGURATION_REQUIRED'] },
  listAgentConversations: { conversations: [conversation], nextCursor: null },
  createAgentConversation: conversation,
  getAgentConversation: { conversation, messages: [{ id, role: 'user', text: '查询余额', createdAt: time, turnId: id }], turns: [turn], nextMessageCursor: null },
  submitAgentMessage: turn, getAgentTurn: turn,
  cancelAgentTurn: { ...turn, version: 2, status: 'STOP_REQUESTED', humanInterventionRequired: true, runId: 'run_existing' },
  listAgentModels: { models: [profile] }, createAgentModel: profile, updateAgentModel: { ...profile, version: 2 },
  checkAgentModel: { status: 'READY', code: 'AGENT_MODEL_READY' }, setDefaultAgentModel: profile,
  getAgentTurnEvidence: { schemaVersion: 'hengzhun-cli-evidence-view/v1', journeyId: 'journey_test', version: 1, status: 'COMPLETED', terminal: true, references: {}, artifactCards: [] },
}
const inputs = {
  createAgentConversation: { title: '客户查询' },
  submitAgentMessage: { submissionId: id, input: '查询余额', modelProfileId: id, modelProfileVersion: 1 },
  cancelAgentTurn: {}, createAgentModel: { displayName: profile.displayName, model: profile.model, baseUrl: profile.baseUrl, apiKey: 'only-in-test-process' },
  updateAgentModel: { displayName: profile.displayName, model: profile.model, baseUrl: profile.baseUrl, version: 1 },
  checkAgentModel: { model: profile.model, baseUrl: profile.baseUrl, profileId: id, profileVersion: 1 }, setDefaultAgentModel: { version: 1 },
}
function fixture(overrides = {}) {
  const calls = []
  const workbench = Object.fromEntries(Object.entries(responses).map(([name, value]) => [name, async (args) => {
    calls.push({ name, args }); return structuredClone(value)
  }]))
  const handle = createAgentWorkbenchHandler({ workbench: { ...workbench, ...overrides }, origin })
  function request(path, { method = 'GET', token, data, headers = {} } = {}) {
    return new Request(`${origin}/api/agent/v1${path}`, {
      method, headers: { host: '127.0.0.1:18790', ...(method !== 'GET' ? { origin, 'content-type': 'application/json', 'x-hengzhun-csrf': token ?? '' } : {}), ...headers },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })
  }
  return { calls, handle, request, async token() { return (await (await handle(request('/bootstrap'))).json()).csrfToken } }
}

test('dependency problem codes survive HTTP while unknown private-shaped families stay hidden', async () => {
  for (const [code, expected, status] of [['MODEL_HTTP_401', 'MODEL_HTTP_401', 503], ['I10_MIDSCENE_MODEL_UNSUPPORTED', 'I10_MIDSCENE_MODEL_UNSUPPORTED', 503], ['WORKER_HEARTBEAT_NOT_READY', 'WORKER_HEARTBEAT_NOT_READY', 503], ['PRIVATE_TOKEN_VALUE', 'AGENT_INTERNAL_ERROR', 500]]) {
    const f = fixture({ getAgentBootstrap: async () => { throw new WorkbenchError(code, 503) } })
    const response = await f.handle(f.request('/bootstrap'))
    assert.equal(response.status, status); assert.equal((await response.json()).code, expected)
  }
})

test('the frozen OpenAPI artifact is generated from the actual HTTP schemas', async () => {
  const artifact = parse(await readFile(new URL('../../../../contracts/openapi/agent-workbench-api.yaml', import.meta.url), 'utf8'))
  assert.deepEqual(artifact, agentWorkbenchOpenApi())
  assert.equal(artifact.info.license.identifier, 'MPL-2.0')
  assert.equal(new Set(workbenchOperations.map((route) => route.operationId)).size, workbenchOperations.length)
  const encoded = JSON.stringify(artifact.paths['/models'].post.requestBody)
  assert.match(encoded, /"writeOnly":true/)
  assert.equal(JSON.stringify(artifact.paths['/models'].get.responses['200']).includes('apiKey'), false)
  for (const route of workbenchOperations.filter((route) => route.method !== 'GET')) {
    assert.deepEqual(artifact.paths[route.path][route.method.toLowerCase()].security, [{ LocalCsrf: [] }])
  }
})

test('every operation delegates once with bounded DTOs and preserves its documented response', async () => {
  const f = fixture(), token = await f.token()
  for (const route of workbenchOperations.filter(route => !route.binaryInput && !route.binaryOutput)) {
    const path = route.path.replace(/\{\w+\}/g, id)
    const previous = f.calls.length
    const response = await f.handle(f.request(path, { method: route.method, token, data: inputs[route.operationId] }))
    assert.equal(response.status, route.status, route.operationId)
    const actual = await response.json()
    if (route.operationId === 'getAgentBootstrap') delete actual.csrfToken
    assert.deepEqual(actual, responses[route.operationId], route.operationId)
    assert.equal(f.calls.length, previous + 1)
    assert.equal(f.calls.at(-1).name, route.operationId)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  }
  assert.deepEqual(f.calls.find((call) => call.name === 'submitAgentMessage').args, { conversationId: id, ...inputs.submitAgentMessage, attachmentRefs: [] })
})

test('bootstrap is per-router, read-only, and cannot claim READY from missing dependencies', async () => {
  const f = fixture()
  const first = await f.token(), second = await f.token()
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, second)
  assert.notEqual(first, await fixture().token())
  assert.deepEqual(f.calls.map((call) => call.name), ['getAgentBootstrap', 'getAgentBootstrap'])
})

test('history and event cursors are explicit bounded reads, never an implicit resume', async () => {
  const f = fixture()
  await f.handle(f.request(`/conversations/${id}?before=${id}&limit=2`))
  assert.deepEqual(f.calls.at(-1), { name: 'getAgentConversation', args: { conversationId: id, before: id, limit: 2 } })
  await f.handle(f.request(`/turns/${id}?after=12&limit=10`))
  assert.deepEqual(f.calls.at(-1), { name: 'getAgentTurn', args: { turnId: id, after: 12, limit: 10 } })
  for (const path of [`/conversations/${id}?limit=31`, `/conversations/${id}?before=invalid`, `/turns/${id}?limit=101`]) {
    assert.equal((await f.handle(f.request(path))).status, 400)
  }
  assert.equal(f.calls.length, 2)
})

test('rejects external/rebound hosts, cross-site reads and non-loopback configuration', async () => {
  const f = fixture()
  for (const headers of [{ host: 'attacker.invalid' }, { host: 'localhost:18790' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await f.handle(f.request('/models', { headers }))).status, 403)
  }
  assert.equal(f.calls.length, 0)
  for (const address of ['http://0.0.0.0:18790', 'https://127.0.0.1:18790', `${origin}/path`, 'http://attacker.invalid:18790']) {
    assert.throws(() => createAgentWorkbenchHandler({ workbench: {}, origin: address }), (error) => error.code === 'AGENT_LOOPBACK_ORIGIN_REQUIRED')
  }
})

test('mutations require exact Origin and process-local CSRF, including non-ASCII tokens', async () => {
  const f = fixture(), token = await f.token()
  for (const headers of [
    { origin: 'https://attacker.invalid' }, { origin: 'null' }, { origin: '' },
    { 'x-hengzhun-csrf': '' }, { 'x-hengzhun-csrf': '0'.repeat(64) }, { 'x-hengzhun-csrf': 'é'.repeat(64) },
  ]) assert.equal((await f.handle(f.request('/conversations', { method: 'POST', token, data: inputs.createAgentConversation, headers }))).status, 403)
  assert.equal(f.calls.length, 1)
})

test('rejects unknown fields, invalid versions, duplicate query and oversized requests before delegation', async () => {
  const f = fixture(), token = await f.token()
  for (const [path, method, data, status] of [
    ['/conversations', 'POST', { title: 'test', serviceToken: 'must-not-pass' }, 400],
    [`/conversations/${id}/messages`, 'POST', { ...inputs.submitAgentMessage, modelProfileVersion: 0 }, 400],
    [`/conversations/${id}/messages`, 'POST', { ...inputs.submitAgentMessage, input: ' ' }, 400],
    ['/models', 'POST', { ...inputs.createAgentModel, baseUrl: 'https://user:secret@model.invalid/v1' }, 400],
    ['/conversations', 'POST', { title: 'x'.repeat(70000) }, 413],
  ]) assert.equal((await f.handle(f.request(path, { method, token, data }))).status, status)
  for (const path of ['/conversations?limit=101', '/conversations?q=a&q=b', '/models?serviceToken=x', '/turns/not-an-id', `/turns/${id}?after=-1`]) {
    assert.equal((await f.handle(f.request(path))).status, 400, path)
  }
  assert.equal(f.calls.length, 1)
})

test('invalid JSON and content types are explicit errors, not swallowed or replayed', async () => {
  const f = fixture(), token = await f.token()
  assert.equal((await f.handle(f.request('/conversations', { method: 'POST', token, data: {}, headers: { 'content-type': 'text/plain' } }))).status, 415)
  const invalid = new Request(`${origin}/api/agent/v1/conversations`, { method: 'POST', headers: { host: '127.0.0.1:18790', origin, 'content-type': 'application/json', 'x-hengzhun-csrf': token }, body: '{' })
  assert.equal((await f.handle(invalid)).status, 400)
  assert.equal(f.calls.length, 1)
})

test('rejects unsafe producer fields instead of leaking raw checkpoints, reasoning or keys', async () => {
  for (const key of ['apiKey', 'serviceToken', 'checkpoint', 'reasoning']) {
    const secret = 'sensitive-test-only-value'
    const f = fixture({ listAgentModels: async () => ({ models: [{ ...profile, [key]: secret }] }) })
    const response = await f.handle(f.request('/models'))
    assert.equal(response.status, 500)
    assert.equal((await response.text()).includes(secret), false)
  }
  const f = fixture({ listAgentModels: async () => { throw new Error('API key: never-echo-this') } })
  const response = await f.handle(f.request('/models'))
  assert.equal(response.status, 500)
  assert.equal((await response.text()).includes('never-echo-this'), false)
})

test('conflicts and stop requests remain explicit; cancellation cannot manufacture success', async () => {
  const f = fixture({ submitAgentMessage: async () => { throw new WorkbenchError('AGENT_SUBMISSION_CONFLICT', 409) } })
  const token = await f.token()
  assert.equal((await f.handle(f.request(`/conversations/${id}/messages`, { method: 'POST', token, data: inputs.submitAgentMessage }))).status, 409)
  const response = await f.handle(f.request(`/turns/${id}/cancel`, { method: 'POST', token, data: {} }))
  const result = await response.json()
  assert.equal(result.status, 'STOP_REQUESTED')
  assert.equal(result.runId, 'run_existing')
  assert.equal(result.humanInterventionRequired, true)
})

test('no checkpoint, Quality mutation, approval or unadvertised action is routed', async () => {
  const f = fixture(), token = await f.token()
  for (const path of ['/checkpoint', '/approve', '/models/delete', `/conversations/${id}/execute`]) {
    assert.equal((await f.handle(f.request(path, { method: 'POST', token, data: {} }))).status, 404)
  }
  const response = await f.handle(new Request(`${origin}/api/quality/v1/cases`, { method: 'POST', headers: { host: '127.0.0.1:18790', origin } }))
  assert.equal(response.status, 404)
  assert.equal(f.calls.length, 1)
})
