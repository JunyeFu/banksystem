'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn, fork } = require('node:child_process')
const test = require('node:test')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
const { productRoot, ns, token, store, application, listen, options } = require('./workbench-test-fixture.cjs')
const { workbenchOperations } = require('../../dist/harness/src/workbench-contract.js')

const environment = () => ({ NODE_ENV: 'test', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP })
const parse = result => JSON.parse(result.content.find(item => item.type === 'text').text)
const modelInput = () => ({ modelId: randomUUID(), expectedVersion: 0, displayName: '隔离MCP模型', model: 'test-process-model', baseUrl: 'https://model.invalid/v1', keyRef: `modelkey_${randomUUID()}` })
const submitInput = (conversationId, modelId, input = '只读查询账户。') => ({ conversationId, submissionId: randomUUID(), input, modelProfileId: modelId, modelProfileVersion: 1, releaseIdentityHash: 'a'.repeat(64) })

test('Journey error projection preserves typed cause and removes provider secrets', () => {
  const { projectJourneyEvidenceFields } = require('../../mcp/src/journey-evidence-projection.cjs');
  const value = projectJourneyEvidenceFields({ error: { category: 'AUTHORING', errorCode: 'I10_MIDSCENE_MODEL_UNSUPPORTED', recoverable: true, rawResponse: 'private-token' } });
  assert.deepEqual(value.error, { category: 'AUTHORING', errorCode: 'I10_MIDSCENE_MODEL_UNSUPPORTED', recoverable: true });
  assert.equal(JSON.stringify(value).includes('private-token'), false);
  assert.equal(projectJourneyEvidenceFields({ error: { errorCode: 'PRIVATE_TOKEN_VALUE' } }).error, undefined);
});

test('production MCP Journey read transports the safe failure cause from Harness', async () => {
  const backend = await listen((req, res) => { req.resume(); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({
    journeyId: 'journey_11111111-2222-4333-8444-555555555555', status: 'FAILED', stage: 'FAILED_ACTIONABLE', terminal: true,
    error: { category: 'AUTHORING', errorCode: 'I10_MIDSCENE_MODEL_UNSUPPORTED', recoverable: true, rawResponse: 'private-token' },
  })); });
  const reserved = await listen((_req, res) => res.end());
  const port = Number(new URL(reserved.url).port); await new Promise(resolve => reserved.server.close(resolve));
  const mcpToken = 'workbench-isolated-mcp-token-32-characters';
  const child = spawn(process.execPath, [path.join(productRoot, 'mcp/src/server.cjs')], { cwd: productRoot,
    env: { ...environment(), HENGZHUN_HARNESS_URL: backend.url, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: mcpToken, HENGZHUN_NAMESPACE: ns, HENGZHUN_MCP_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const client = new Client({ name: 'failure-projection-test', version: '1.0.0' });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ISOLATED_MCP_START_FAILED')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error) });
      child.stdout.on('data', bytes => { if (bytes.toString().includes('listening on')) { clearTimeout(timer); resolve() } });
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${reserved.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${mcpToken}` } } }));
    const value = parse(await client.callTool({ name: 'journey_get', arguments: { journeyId: 'journey_11111111-2222-4333-8444-555555555555' } }));
    assert.deepEqual(value.error, { category: 'AUTHORING', errorCode: 'I10_MIDSCENE_MODEL_UNSUPPORTED', recoverable: true });
    assert.equal(JSON.stringify(value).includes('private-token'), false);
  } finally { await client.close(); await stop(child); backend.server.closeAllConnections(); await new Promise(resolve => backend.server.close(resolve)); }
});

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise(resolve => { child.once('exit', resolve); child.kill() })
}
function sqliteProcess(configuration) {
  const child = fork(path.join(__dirname, 'workbench-process.cjs'), [], { execPath: process.execPath, execArgv: [], env: environment(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let readyResolve, readyReject, resultResolve, resultReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const result = new Promise((resolve, reject) => { resultResolve = resolve; resultReject = reject })
  const deadline = setTimeout(() => { readyReject(new Error('TEST_PROCESS_NOT_READY')); resultReject(new Error('TEST_PROCESS_NOT_COMPLETE')) }, 12000)
  result.catch(() => undefined)
  child.on('error', error => { clearTimeout(deadline); readyReject(error); resultReject(error) })
  child.on('message', message => {
    if (message.ready) readyResolve()
    else { clearTimeout(deadline); resultResolve(message) }
  })
  child.once('exit', code => { clearTimeout(deadline); if (code) { readyReject(new Error('TEST_PROCESS_FAILED')); resultReject(new Error('TEST_PROCESS_FAILED')) } })
  child.send(configuration)
  return { child, ready, result, go() { child.send({ run: true }) } }
}

test('two separate Node processes obtain only one claim, and a fresh process reads durable history without replay', async t => {
  const f = await store(t), conversationId = randomUUID(), model = modelInput()
  await f.repo.execute('workbench_conversation_create', ns, { conversationId, title: '跨进程对话' })
  await f.repo.execute('workbench_model_save', ns, model)
  const input = submitInput(conversationId, model.modelId)
  const config = { options: options(f.root), namespace: ns, operations: [{ name: 'workbench_turn_submit', input }] }
  const first = sqliteProcess(config), second = sqliteProcess(config)
  let turn
  try {
    await Promise.all([first.ready, second.ready])
    first.go(); second.go()
    const results = await Promise.all([first.result, second.result])
    assert.equal(results.every(result => result.ok), true)
    assert.equal(results.filter(result => result.values[0].created).length, 1)
    turn = results[0].values[0].turn
    assert.equal(turn.id, results[1].values[0].turn.id)
  } finally { await Promise.all([stop(first.child), stop(second.child)]) }
  await f.close()
  const reader = sqliteProcess({ options: options(f.root), namespace: ns, operations: [
    { name: 'workbench_conversation_get', input: { conversationId } }, { name: 'workbench_turn_get', input: { turnId: turn.id } }
  ] })
  try {
    await reader.ready; reader.go()
    const result = await reader.result
    assert.equal(result.ok, true)
    assert.equal(result.values[0].messages.length, 1)
    assert.equal(result.values[0].messages[0].text, input.input)
    assert.equal(result.values[1].id, turn.id)
    assert.equal(result.values[1].status, 'RUNNING')
    assert.deepEqual(result.values[1].modelBinding, turn.modelBinding)
    // Metadata reads do not silently claim, dispatch, or declare interrupted work successful.
    assert.deepEqual(result.values[1].events.map(event => event.type), ['ACCEPTED'])
  } finally { await stop(reader.child) }
})

test('real Harness HTTP boundaries require bearer, bound namespace and strict secret-safe inputs', async t => {
  const f = await application(t), route = workbenchOperations.workbench_conversation_create.route
  const invalidRoot = path.join(f.root, 'invalid-namespace-must-not-create')
  const { createHarnessApplication } = require('../../dist/harness/src/server.js')
  await assert.rejects(createHarnessApplication({ ...options(invalidRoot), productRoot, workbenchNamespace: 'INVALID NAMESPACE' }))
  assert.equal(fs.existsSync(invalidRoot), false)
  const body = { namespace: ns, conversationId: randomUUID(), title: '安全会话' }
  assert.equal((await f.post(route, body, '')).status, 401)
  assert.equal((await f.post(route, { ...body, namespace: 'foreign-tenant' })).status, 403)
  const unsafe = await f.post(route, { ...body, apiKey: 'synthetic-key-not-a-real-secret' })
  assert.equal(unsafe.status, 400)
  assert.equal(JSON.stringify(unsafe.body).includes('synthetic-key-not-a-real-secret'), false)
  assert.equal((await f.post(route, body)).status, 200)
  assert.equal((await f.post('/v1/workbench/unknown', { namespace: ns })).status, 404)
  assert.equal((await f.post('/api/quality/v1/cases', {})).status >= 400, true)
  assert.equal(f.app.database.read(db => db.prepare('SELECT count(*) n FROM workbench_conversations').get()).n, 1)
})

test('actual MCP process keeps 39 legacy tools separate from 11 metadata tools and transports large history safely', async t => {
  const f = await application(t)
  // Reserve an OS-assigned test port, then start the production MCP entry at that port; no existing listener is reused.
  const reserved = await listen((_request, response) => response.end())
  const port = Number(new URL(reserved.url).port)
  await new Promise(resolve => reserved.server.close(resolve))
  const mcpToken = 'workbench-isolated-mcp-token-32-characters'
  const child = spawn(process.execPath, [path.join(productRoot, 'mcp/src/server.cjs')], { cwd: productRoot,
    env: { ...environment(), HENGZHUN_HARNESS_URL: f.url, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: mcpToken, HENGZHUN_NAMESPACE: ns, HENGZHUN_MCP_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'] })
  const clients = []
  const connect = async suffix => {
    const client = new Client({ name: 'workbench-isolated-test', version: '1.0.0' })
    clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(`${reserved.url}${suffix}`), { requestInit: { headers: { authorization: `Bearer ${mcpToken}` } } }))
    return client
  }
  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('ISOLATED_MCP_START_FAILED')), 10000)
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      child.once('exit', () => { clearTimeout(deadline); reject(new Error('ISOLATED_MCP_EXITED')) })
      let output = ''
      child.stdout.on('data', bytes => { output += bytes.toString(); if (output.includes('listening on')) { clearTimeout(deadline); resolve() } })
    })
    const unauthorized = await fetch(`${reserved.url}/mcp/workbench`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(unauthorized.status, 401)
    const legacy = await connect('/mcp'), metadata = await connect('/mcp/workbench')
    assert.equal((await legacy.listTools()).tools.length, 39)
    assert.equal((await legacy.listTools()).tools.some(tool => tool.name.startsWith('workbench_')), false)
    assert.deepEqual((await metadata.listTools()).tools.map(tool => tool.name).sort(), Object.keys(workbenchOperations).sort())
    const invoke = (name, args) => metadata.callTool({ name: `workbench_${name}`, arguments: args })
    const conversationId = randomUUID(), model = modelInput()
    await invoke('conversation_create', { conversationId, title: 'MCP真实传输测试' })
    assert.equal(parse(await invoke('model_save', model)).keyConfigured, true)
    const input = submitInput(conversationId, model.modelId, '读'.repeat(15000))
    const submitted = parse(await invoke('turn_submit', input))
    assert.equal(submitted.created, true)
    assert.equal(parse(await invoke('turn_submit', input)).created, false)
    const historyResult = await invoke('conversation_get', { conversationId })
    assert.notEqual(historyResult.isError, true)
    assert.ok(Buffer.byteLength(historyResult.content[0].text) > 8 * 1024)
    assert.ok(Buffer.byteLength(historyResult.content[0].text) <= 128 * 1024)
    assert.equal(parse(historyResult).messages[0].text, input.input)
    const foreign = await invoke('conversation_list', { namespace: 'foreign-tenant' })
    assert.equal(foreign.isError, true)
    const unsafe = await invoke('turn_submit', { ...input, submissionId: randomUUID(), input: 'api_key=not-a-real-secret' })
    assert.equal(unsafe.isError, true)
    assert.equal(JSON.stringify(unsafe).includes('not-a-real-secret'), false)
    const changed = await invoke('turn_submit', { ...input, input: 'changed' })
    assert.equal(changed.isError, true)
    assert.match(JSON.stringify(changed), /AGENT_SUBMISSION_CONFLICT/)
    const before = f.app.database.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get()).n
    for (let i = 0; i < 3; i++) await invoke('turn_get', { turnId: submitted.turn.id })
    assert.equal(f.app.database.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get()).n, before)
    assert.equal(f.app.database.read(db => db.prepare('SELECT count(*) n FROM runs').get()).n, 0)
  } finally {
    await Promise.all(clients.map(client => client.close()))
    await stop(child)
  }
})
