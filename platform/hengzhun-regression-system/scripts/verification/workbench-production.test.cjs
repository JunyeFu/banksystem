'use strict'
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const test = require('node:test')
const { store, application, listen, ns, token, productRoot } = require('./workbench-test-fixture.cjs')
const load = file => import(pathToFileURL(path.join(productRoot, file)).href)
const release = 'd'.repeat(64)
const credential = 'credential_12345678-1234-4234-8234-123456789abc'
const goal = `目标系统：复兴银行。访问 http://127.0.0.1:18082/portal/login，使用 ${credential}，登录后只读查询账户。`
const draft = { title: '查询账户', objective: '账户信息可见', summary: '只读查询', preconditions: [], steps: [{ action: '查询账户', expected: '账户可见' }], assertions: ['账户可见'], confidence: 1 }
const toolResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })
const proofFor = journeyId => ({ verdict: 'VERIFIED', journeyId, runId: 'run_original', taskId: 'task_original', releaseIdentityHash: release })

test('each MCP Controller and CLI entry resolves its declared locked SDK, including nested installs', () => {
  for (const entry of ['mcp', 'controller', 'agent-cli']) {
    const owner = entry === 'controller' ? path.join(productRoot, 'controller') : productRoot
    const declared = JSON.parse(fs.readFileSync(path.join(owner, 'package.json'))).dependencies['@modelcontextprotocol/sdk']
    const lock = JSON.parse(fs.readFileSync(path.join(owner, 'package-lock.json'))).packages['node_modules/@modelcontextprotocol/sdk']
    const resolved = createRequire(path.join(productRoot, entry, 'package.json')).resolve('@modelcontextprotocol/sdk/client/index.js')
    const installed = JSON.parse(fs.readFileSync(path.resolve(path.dirname(resolved), '../../../package.json'))).version
    assert.equal(installed, declared, entry); assert.equal(installed, lock.version, entry)
  }
})

async function fixture(t, overrides = {}) {
  const f = await store(t)
  const { ModelKeyStore } = await load('controller/src/model-key-store.mjs')
  const { createWorkbenchApplication } = await load('agent-cli/src/workbench-application.mjs')
  const keys = new ModelKeyStore({ root: path.join(f.root, 'keys') })
  const calls = [], config = []
  const metadata = { call: (name, input = {}) => f.repo.execute(`workbench_${name}`, ns, input) }
  const app = createWorkbenchApplication({ metadata, keyStore: keys, namespace: ns, identityFor: () => release,
    readiness: async () => ({ status: 'READY' }), probeModel: async () => ({ status: 'READY' }),
    serviceFor: async input => { config.push(input); calls.push('start-service'); return {
      start: async () => ({ status: 'NEEDS_INPUT', question: '请补充金额。' }),
      evidenceVerify: async ({ journeyId }) => proofFor(journeyId),
    } }, ...overrides })
  t.after(() => app.close())
  const model = await app.createAgentModel({ displayName: '隔离进程模型', model: 'test-process-model', baseUrl: 'https://model.invalid/v1', apiKey: 'synthetic-model-key-only' })
  await app.setDefaultAgentModel({ modelId: model.id, version: model.version })
  const conversation = await app.createAgentConversation({ title: '隔离会话' })
  const input = (text = goal) => ({ conversationId: conversation.id, submissionId: randomUUID(), input: text, modelProfileId: model.id, modelProfileVersion: model.version, attachmentRefs: [] })
  return { ...f, app, keys, metadata, model, conversation, calls, config, input }
}

test('S5 dependency failure code reaches the persisted turn without dispatch', async t => {
  for (const code of ['MODEL_HTTP_401', 'HARNESS_STATE_INVALID', 'WORKER_NOT_READY', 'I10_MIDSCENE_MODEL_UNSUPPORTED']) {
    const f = await fixture(t, { readiness: async () => ({ status: 'NOT_READY', code }) })
    const first = await f.app.submitAgentMessage(f.input()); await f.app.waitForIdle()
    const turn = await f.app.getAgentTurn({ turnId: first.id })
    assert.equal(turn.failureCode, code); assert.equal(turn.status, 'FAILED'); assert.equal(f.calls.length, 0)
  }
})

test('S5 stop aborts pending readiness and prevents all Controller dispatch', async t => {
  let entered, observed
  const started = new Promise(resolve => { entered = resolve })
  const f = await fixture(t, { readiness: async ({ signal }) => {
    observed = signal; entered()
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    return { status: 'READY' }
  } })
  const first = await f.app.submitAgentMessage(f.input()); await started
  await f.app.cancelAgentTurn({ turnId: first.id }); await f.app.waitForIdle()
  assert.equal(observed.aborted, true); assert.equal(f.calls.length, 0)
  const turn = await f.app.getAgentTurn({ turnId: first.id })
  assert.equal(turn.status, 'INTERRUPTED'); assert.equal(turn.failureCode, 'AGENT_STOP_OUTCOME_UNKNOWN')
})

test('S5 stop while the service is being constructed still prevents its start call', async t => {
  let entered, release, starts = 0
  const started = new Promise(resolve => { entered = resolve }), waiting = new Promise(resolve => { release = resolve })
  const f = await fixture(t, { serviceFor: async () => { entered(); await waiting; return { start: async () => { starts++ } } } })
  const first = await f.app.submitAgentMessage(f.input()); await started
  await f.app.cancelAgentTurn({ turnId: first.id }); release(); await f.app.waitForIdle()
  assert.equal(starts, 0); assert.equal((await f.app.getAgentTurn({ turnId: first.id })).status, 'INTERRUPTED')
})

test('CurrentUser DPAPI versions keys; namespace isolation and empty-key updates retain the old key', async t => {
  const f = await fixture(t), before = await f.metadata.call('model_get', { modelId: f.model.id })
  assert.equal(await f.keys.get(ns, before.keyRef), 'synthetic-model-key-only')
  assert.equal(fs.readFileSync(path.join(f.root, 'keys', `${before.keyRef}.hzk`)).includes(Buffer.from('synthetic-model-key-only')), false)
  await assert.rejects(f.keys.get('another-namespace', before.keyRef), /AGENT_MODEL_KEY_UNAVAILABLE/)
  const updated = await f.app.updateAgentModel({ modelId: f.model.id, version: 1, displayName: '新名称', model: 'next-model', baseUrl: f.model.baseUrl, apiKey: '' })
  assert.equal(updated.version, 2)
  assert.equal((await f.metadata.call('model_get', { modelId: f.model.id })).keyRef, before.keyRef)
  assert.equal((await f.metadata.call('model_get', { modelId: f.model.id, version: 1 })).model, 'test-process-model')
  await assert.rejects(f.app.updateAgentModel({ modelId: f.model.id, version: 1, displayName: '旧', model: 'old', baseUrl: f.model.baseUrl }), error => error.status === 409)
  const safe = JSON.stringify(await f.app.listAgentModels())
  assert.equal(/synthetic-model-key-only|keyRef|modelkey_/.test(safe), false)
})

test('model check probes exactly the selected endpoint and does not mutate saved/default state', async t => {
  const probes = [], f = await fixture(t, { probeModel: async config => { probes.push(config); return { status: 'NOT_READY', code: 'MODEL_HTTP_401' } } })
  const result = await f.app.checkAgentModel({ profileId: f.model.id, profileVersion: 1, model: 'selected-model', baseUrl: 'https://selected.invalid/v1' })
  assert.deepEqual(result, { status: 'FAILED', code: 'MODEL_HTTP_401' })
  assert.equal(probes.length, 1); assert.equal(probes[0].baseURL, 'https://selected.invalid/v1')
  assert.equal((await f.app.listAgentModels()).models[0].model, f.model.model)
  assert.equal((await f.app.listAgentModels()).models[0].isDefault, true)
})

test('missing launch fields ask for input, continuation preserves binding and never executes prematurely', async t => {
  const f = await fixture(t)
  const first = await f.app.submitAgentMessage(f.input('登录并查询余额。'))
  await f.app.waitForIdle()
  const waiting = await f.app.getAgentTurn({ turnId: first.id })
  assert.equal(waiting.status, 'NEEDS_INPUT'); assert.equal(waiting.result.verdict, 'NOT_RUN')
  assert.match(waiting.answer, /目标页面地址/); assert.equal(f.calls.length, 0)
  await f.app.updateAgentModel({ modelId: f.model.id, version: 1, displayName: '新默认', model: 'new', baseUrl: f.model.baseUrl })
  await f.app.setDefaultAgentModel({ modelId: f.model.id, version: 2 })
  await assert.rejects(f.app.submitAgentMessage({ ...f.input(goal), modelProfileVersion: 2 }), error => error.code === 'AGENT_CONTINUATION_BINDING_CONFLICT')
  const next = await f.app.submitAgentMessage(f.input(goal))
  await f.app.waitForIdle()
  assert.equal(next.continuationOfTurnId, first.id)
  assert.deepEqual(next.modelBinding, first.modelBinding)
  assert.equal(f.config[0].modelConfig.model, 'test-process-model')
})

test('two same submissions claim once; same ID changed payload conflicts even after model/source drift', async t => {
  let invoked = 0, current = release
  const f = await fixture(t, { identityFor: () => current, serviceFor: async () => ({ start: async () => { invoked++; return { status: 'NEEDS_INPUT', question: '请补充金额。' } } }) })
  const request = f.input()
  const results = await Promise.all([f.app.submitAgentMessage(request), f.app.submitAgentMessage(request)])
  await f.app.waitForIdle()
  assert.equal(results[0].id, results[1].id); assert.equal(invoked, 1)
  current = 'e'.repeat(64)
  await f.app.updateAgentModel({ modelId: f.model.id, version: 1, displayName: 'new', model: 'new', baseUrl: f.model.baseUrl })
  assert.equal((await f.app.submitAgentMessage(request)).id, results[0].id)
  await assert.rejects(f.app.submitAgentMessage({ ...request, input: 'changed' }), error => error.status === 409)
  assert.equal(invoked, 1)
})

test('terminal new goal creates a new task, running task rejects concurrency, cancel preserves unknown outcome', async t => {
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const f = await fixture(t, { serviceFor: async () => ({ start: async ({ signal }) => { entered(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('test interruption')), { once: true })) } }) })
  const first = await f.app.submitAgentMessage(f.input()); await started
  await assert.rejects(f.app.submitAgentMessage(f.input('另一个目标。')), error => (error.code ?? error.errorCode) === 'AGENT_CONVERSATION_BUSY')
  const stop = await f.app.cancelAgentTurn({ turnId: first.id })
  assert.equal(stop.status, 'STOP_REQUESTED')
  await f.app.waitForIdle()
  const interrupted = await f.app.getAgentTurn({ turnId: first.id })
  assert.equal(interrupted.status, 'INTERRUPTED'); assert.equal(interrupted.humanInterventionRequired, true)
  assert.notEqual(interrupted.result.verdict, 'PASSED')
  const next = await f.app.submitAgentMessage(f.input('新目标，尚无启动信息。')); await f.app.waitForIdle()
  assert.notEqual(next.id, first.id); assert.equal(next.continuationOfTurnId, undefined)
})

test('Controller COMPLETED is not PASS without verified evidence; verified proof binds original run/task', async t => {
  for (const verified of [false, true]) {
    const journeyId = `journey_${randomUUID()}`
    const f = await fixture(t, { serviceFor: async () => ({ start: async () => ({ status: 'COMPLETED', journeyId }),
      evidenceVerify: async () => { if (!verified) throw new Error('private provider error'); return proofFor(journeyId) } }) })
    const submitted = await f.app.submitAgentMessage(f.input()); await f.app.waitForIdle()
    const turn = await f.app.getAgentTurn({ turnId: submitted.id })
    assert.equal(turn.status, verified ? 'COMPLETED' : 'FAILED')
    assert.equal(turn.result.verdict, verified ? 'PASSED' : 'UNKNOWN')
    if (verified) { assert.equal(turn.runId, 'run_original'); assert.equal(turn.taskId, 'task_original') }
    assert.equal(JSON.stringify(turn).includes('private provider'), false)
  }
})

test('fresh process application reads an orphan as INTERRUPTED and never dispatches again', async t => {
  const f = await fixture(t)
  const submitted = await f.metadata.call('turn_submit', { ...f.input(), releaseIdentityHash: release })
  const result = await f.app.getAgentTurn({ turnId: submitted.turn.id })
  assert.equal(result.status, 'INTERRUPTED'); assert.equal(result.failureCode, 'AGENT_PROCESS_INTERRUPTED')
  assert.equal(f.calls.length, 0)
  const replay = await f.app.getAgentTurn({ turnId: result.id })
  assert.equal(replay.version, result.version)
})

test('review: wrong-identity proof cannot become PASS, and only original orphan evidence can close the turn', async t => {
  const journeyId = `journey_${randomUUID()}`
  let proof = { ...proofFor(journeyId), releaseIdentityHash: 'e'.repeat(64) }
  const f = await fixture(t, { serviceFor: async () => ({ evidenceVerify: async () => proof }) })
  const first = (await f.metadata.call('turn_submit', { ...f.input(), releaseIdentityHash: release })).turn
  await f.metadata.call('turn_update', { turnId: first.id, expectedVersion: 1, status: 'RUNNING', journeyId,
    event: { type: 'TOOL_FINISHED', toolName: 'journey_prepare', summary: 'Test-only actual reference' }, humanInterventionRequired: false })
  const unknown = await f.app.getAgentTurn({ turnId: first.id })
  assert.equal(unknown.status, 'INTERRUPTED'); assert.equal(unknown.result.verdict, 'UNKNOWN')
  proof = proofFor(journeyId)
  const second = (await f.metadata.call('turn_submit', { ...f.input(), releaseIdentityHash: release })).turn
  await f.metadata.call('turn_update', { turnId: second.id, expectedVersion: 1, status: 'RUNNING', journeyId,
    event: { type: 'TOOL_FINISHED', toolName: 'journey_prepare', summary: 'Test-only actual reference' }, humanInterventionRequired: false })
  const completed = await f.app.getAgentTurn({ turnId: second.id })
  assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.result.verdict, 'PASSED')
})

test('review: image metadata survives launch-information clarification without renaming or dropping the receipt', async t => {
  const starts = [], f = await fixture(t, { serviceFor: async () => ({ start: async args => { starts.push(args); return { status: 'NEEDS_INPUT', question: '请补充金额。' } } }) })
  const attachmentRef = `att_${randomUUID()}`, originalFilename = '实际补充.jpg'
  await assert.rejects(f.app.submitAgentMessage({ ...f.input(), attachmentRefs: [attachmentRef] }), error => error.code === 'AGENT_ATTACHMENT_METADATA_REQUIRED')
  const first = await f.app.submitAgentMessage({ ...f.input('只读登录。'), attachmentRefs: [attachmentRef], attachmentMetadata: [{ attachmentRef, originalFilename }] })
  await f.app.waitForIdle()
  const second = await f.app.submitAgentMessage(f.input(goal)); await f.app.waitForIdle()
  assert.equal(second.continuationOfTurnId, first.id)
  assert.deepEqual(starts[0].attachmentRefs, [attachmentRef])
  assert.deepEqual(starts[0].attachmentMetadata, [{ attachmentRef, originalFilename }])
})

test('review: in-flight model/key/version never switches when another default is saved', async t => {
  let releaseCall, entered, seen
  const atModel = new Promise(resolve => { entered = resolve })
  const f = await fixture(t, { serviceFor: async config => ({ start: async () => {
    seen = config; entered(); await new Promise(resolve => { releaseCall = resolve }); return { status: 'NEEDS_INPUT', question: '缺少金额。' }
  } }) })
  const first = await f.app.submitAgentMessage(f.input()); await atModel
  await f.app.updateAgentModel({ modelId: f.model.id, version: 1, displayName: '新模型', model: 'new-model', baseUrl: 'https://new.invalid/v1', apiKey: 'new-test-only-key' })
  await f.app.setDefaultAgentModel({ modelId: f.model.id, version: 2 })
  releaseCall(); await f.app.waitForIdle()
  const turn = await f.app.getAgentTurn({ turnId: first.id })
  assert.equal(seen.modelConfig.model, 'test-process-model'); assert.equal(seen.modelConfig.apiKey, 'synthetic-model-key-only')
  assert.equal(turn.modelBinding.profileVersion, 1); assert.equal(turn.modelBinding.releaseIdentityHash, release)
})

test('stale identity and actual doctor failure stop before any Controller dispatch', async t => {
  let dispatched = 0
  const f = await fixture(t, { readiness: async () => ({ status: 'NOT_READY', code: 'AGENT_LIVE_NOT_AUTHORIZED' }),
    serviceFor: async () => { dispatched++; throw new Error('must not dispatch') } })
  const bootstrap = await f.app.getAgentBootstrap()
  assert.equal(bootstrap.status, 'NOT_READY'); assert.deepEqual(bootstrap.blockingReasons, ['AGENT_LIVE_NOT_AUTHORIZED'])
  const submitted = await f.app.submitAgentMessage(f.input()); await f.app.waitForIdle()
  const turn = await f.app.getAgentTurn({ turnId: submitted.id })
  assert.equal(turn.failureCode, 'AGENT_LIVE_NOT_AUTHORIZED'); assert.equal(dispatched, 0)
})

test('review: transport ambiguity is INTERRUPTED; an explicit tool rejection is FAILED, never a fake finished event', async t => {
  for (const rejected of [false, true]) {
    const f = await fixture(t, { serviceFor: async config => ({ start: async () => {
      await config.observe({ phase: 'STARTED', name: 'run_submit' })
      if (rejected) await config.observe({ phase: 'REJECTED', name: 'run_submit' })
      throw Object.assign(new Error('test-only private detail'), { code: rejected ? 'JOURNEY_EXECUTION_FAILED' : 'AGENT_ADAPTER_MCP_TRANSPORT_FAILED' })
    } }) })
    const first = await f.app.submitAgentMessage(f.input()); await f.app.waitForIdle()
    const turn = await f.app.getAgentTurn({ turnId: first.id })
    assert.equal(turn.status, rejected ? 'FAILED' : 'INTERRUPTED')
    assert.equal(turn.events.some(event => event.type === 'TOOL_FINISHED'), false)
    assert.notEqual(turn.result.verdict, 'PASSED')
  }
})

test('actual production Controller continuation uses same checkpoint/Journey without fork or approval gate', async t => {
  const { EncryptedSessionStore } = await load('controller/src/session-store.mjs')
  const { createProductionService } = await load('agent-cli/src/production-service.mjs')
  const { observeMcpClient } = await load('agent-cli/src/workbench-production.mjs')
  const f = await store(t), sessions = await new EncryptedSessionStore({ root: path.join(f.root, 'sessions') }).initialize()
  const journeyId = `journey_${randomUUID()}`, events = [], calls = [], inputs = []
  const client = { async callTool(request) {
    calls.push(request)
    if (request.name === 'journey_prepare' || request.name === 'journey_get') return toolResult({ journeyId, version: 1, status: 'NEEDS_INPUT', stage: 'NEEDS_INPUT', missingFields: ['amount'], nextAction: { description: '请补充金额。', inputRequest: { inputKind: 'INITIAL_CASE_INPUT' } } })
    if (request.name === 'journey_input_submit') return toolResult({ journeyId, version: 2, status: 'NEEDS_INPUT' })
    throw new Error('unexpected execution')
  } }
  const service = createProductionService({ sessionStore: sessions, namespace: ns, releaseIdentityHash: release, directExecution: true,
    modelConfig: { apiKey: 'test-process-key', baseURL: 'https://model.invalid/v1', model: 'test-process' },
    modelFactory: () => ({ withConfig: () => ({ async invoke(messages) { inputs.push(messages[1].content); return { content: JSON.stringify(draft) } } }) }),
    writeGate: async () => undefined, mcpClient: observeMcpClient(client, event => { events.push(event) }) })
  const first = await service.start({ input: goal })
  const continued = await service.continueDirectJourney({ sessionId: first.sessionId, journeyId, input: `${goal}\n补充：金额 1.00 CNY。` })
  assert.equal(continued.sessionId, first.sessionId); assert.equal(continued.journeyId, journeyId)
  assert.equal((await sessions.list()).length, 1)
  assert.deepEqual(calls.map(request => request.name), ['journey_prepare', 'journey_get', 'journey_input_submit', 'journey_get'])
  assert.equal(calls[2].arguments.journeyId, journeyId)
  assert.equal(events.filter(event => event.phase === 'FINISHED').length, calls.length)
  assert.equal(inputs.some(input => input.includes(credential)), false)
})

test('binary proxy pins local origin, verifies bytes and rejects any artifact outside the turn evidence', async t => {
  const { createArtifactProxy } = await load('agent-cli/src/workbench-production.mjs')
  const bytes = Buffer.from('redacted evidence'), artifactId = `art_${randomUUID()}`, hash = createHash('sha256').update(bytes).digest('hex')
  const grant = { artifactId, displayName: '证据.json', href: `http://127.0.0.1:18788/v1/i10/artifacts/download_${randomUUID()}`, sha256: hash, byteSize: bytes.length }
  const requests = []
  const proxy = createArtifactProxy({ client: { callTool: async () => toolResult(grant) }, harnessUrl: 'http://127.0.0.1:23456',
    fetchFn: async (url, options) => { requests.push([String(url), options]); return new Response(bytes) } })
  assert.deepEqual((await proxy({ artifactId })).bytes, bytes)
  assert.match(requests[0][0], /^http:\/\/127.0.0.1:23456\//); assert.equal(requests[0][1].redirect, 'error')
  grant.href = 'https://attacker.invalid/evidence'
  await assert.rejects(proxy({ artifactId }), error => error.code === 'AGENT_ARTIFACT_GRANT_INVALID')
  assert.equal(requests.length, 1)
  let downloads = 0
  const f = await fixture(t, { serviceFor: async () => ({ evidence: async () => ({ artifactCards: [{ artifactId }] }) }), downloadArtifact: async () => { downloads++ } })
  const submitted = await f.metadata.call('turn_submit', { ...f.input(), releaseIdentityHash: release })
  await f.metadata.call('turn_update', { turnId: submitted.turn.id, expectedVersion: 1, journeyId: `journey_${randomUUID()}`, status: 'INTERRUPTED', failureCode: 'AGENT_PROCESS_INTERRUPTED', humanInterventionRequired: true, event: { type: 'INTERRUPTED', summary: 'isolated interruption' } })
  await assert.rejects(f.app.downloadAgentArtifact({ turnId: submitted.turn.id, artifactId: `art_${randomUUID()}` }), error => error.status === 404)
  assert.equal(downloads, 0)
})

test('real Harness + production MCP + production Controller persist an actual NEEDS_INPUT without running bank actions', async t => {
  const f = await application(t), reservation = await listen((_request, response) => response.end())
  const port = new URL(reservation.url).port
  await new Promise(resolve => reservation.server.close(resolve))
  const child = spawn(process.execPath, [path.join(productRoot, 'mcp/src/server.cjs')], { cwd: productRoot,
    env: { NODE_ENV: 'test', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      HENGZHUN_HARNESS_URL: f.url, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: 'isolated-mcp-token-at-least-32-characters', HENGZHUN_NAMESPACE: ns, HENGZHUN_MCP_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] })
  let metadata, client, app
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MCP_START_FAILED')), 15000)
      child.once('error', reject); child.once('exit', () => { clearTimeout(timer); reject(new Error('MCP_EXITED')) })
      child.stdout.on('data', bytes => { if (bytes.toString().includes('listening on')) { clearTimeout(timer); resolve() } })
    })
    const { connectWorkbenchMetadata } = await load('agent-cli/src/workbench-metadata.mjs')
    const { connectMcpRuntime } = await load('controller/src/runtime-adapters.mjs')
    const { createWorkbenchApplication } = await load('agent-cli/src/workbench-application.mjs')
    const { ModelKeyStore } = await load('controller/src/model-key-store.mjs')
    const { EncryptedSessionStore } = await load('controller/src/session-store.mjs')
    const { createProductionService } = await load('agent-cli/src/production-service.mjs')
    const { observeMcpClient } = await load('agent-cli/src/workbench-production.mjs')
    const options = { url: `${reservation.url}/mcp`, token: 'isolated-mcp-token-at-least-32-characters' }
    metadata = await connectWorkbenchMetadata(options); client = await connectMcpRuntime(options)
    // Exercise the actual environment factory: import one model, no external probe or original runtime file.
    const { createEnvironmentWorkbench, createArtifactProxy } = await load('agent-cli/src/workbench-production.mjs')
    const composed = await createEnvironmentWorkbench({ productRoot, env: {
      HENGZHUN_NAMESPACE: ns, HENGZHUN_AGENT_NAMESPACE: ns, HENGZHUN_AGENT_SESSION_ROOT: path.join(f.root, 'factory-sessions'),
      HENGZHUN_MCP_URL: options.url, HENGZHUN_MCP_TOKEN: options.token, HENGZHUN_HARNESS_URL: f.url, HENGZHUN_SERVICE_TOKEN: token,
      HENGZHUN_MODEL_NAME: 'factory-test-model', HENGZHUN_MODEL_BASE_URL: 'https://factory.invalid/v1', HENGZHUN_MODEL_API_KEY: 'factory-key-not-a-real-key', HENGZHUN_AUTHORIZE_AGENT_LIVE: '0'.repeat(64),
    } })
    try {
      const profiles = (await composed.listAgentModels()).models
      assert.equal(profiles.length, 1); assert.equal(profiles[0].isDefault, true)
      assert.equal(JSON.stringify(profiles).includes('factory-key-not-a-real-key'), false)
      const bootstrap = await composed.getAgentBootstrap()
      assert.equal(bootstrap.status, 'NOT_READY'); assert.deepEqual(bootstrap.blockingReasons, ['AGENT_LIVE_NOT_AUTHORIZED'])
      const artifact = await f.app.service.artifacts.create({ namespace: ns, artifactType: 'TEXT', mediaType: 'text/plain', redactionStatus: 'REDACTED', extension: 'txt', content: 'isolated real evidence', metadata: { displayName: '真实受控下载.txt' } })
      const download = await createArtifactProxy({ client, harnessUrl: f.url })({ artifactId: artifact.artifactId })
      assert.equal(download.bytes.toString(), 'isolated real evidence')
      const { createHarnessAttachmentImporter } = await load('agent-cli/src/production-service.mjs')
      const picture = Buffer.from('89504e470d0a1a0a', 'hex')
      const imported = await createHarnessAttachmentImporter({ harnessUrl: f.url, serviceToken: token })({ bytes: picture, nameBase64Url: Buffer.from('isolated.png').toString('base64url'), sha256: createHash('sha256').update(picture).digest('hex') })
      assert.match(imported.attachmentRef, /^att_/)
      assert.equal(fs.existsSync(path.join(f.root, 'attachments', imported.attachmentRef)), true)
    } finally { await composed.close() }
    const sessions = await new EncryptedSessionStore({ root: path.join(f.root, 'sessions') }).initialize()
    app = createWorkbenchApplication({ metadata, keyStore: new ModelKeyStore({ root: path.join(f.root, 'keys') }), namespace: ns, identityFor: () => release,
      downloadArtifact: createArtifactProxy({client,harnessUrl:f.url}),
      readiness: async () => ({ status: 'READY' }), serviceFor: async config => createProductionService({
        sessionStore: sessions, namespace: ns, releaseIdentityHash: release, modelConfig: config.modelConfig, directExecution: true,
        modelFactory: () => ({ withConfig: () => ({ async invoke() { return { content: JSON.stringify(draft) } } }) }),
        mcpClient: observeMcpClient(client, config.observe), onCheckpoint: config.onCheckpoint, writeGate: async () => undefined,
      }) })
    const model = await app.createAgentModel({ displayName: '隔离', model: 'test-process-only', baseUrl: 'https://model.invalid/v1', apiKey: 'not-a-real-model-key' })
    const conversation = await app.createAgentConversation({ title: '真实MCP接线' })
    const request = { conversationId: conversation.id, submissionId: randomUUID(), input: goal, modelProfileId: model.id, modelProfileVersion: 1, attachmentRefs: [] }
    const submitted = await app.submitAgentMessage(request); await app.waitForIdle()
    const result = await app.getAgentTurn({ turnId: submitted.id })
    assert.equal(result.status, 'NEEDS_INPUT', JSON.stringify(result))
    assert.match(result.journeyId, /^journey_/); assert.match(result.checkpointSessionId, /^session-/)
    const evidenceBytes=Buffer.from('{"diagnostic":"isolated evidence"}');
    const evidenceArtifact=await f.app.service.artifacts.create({namespace:ns,artifactType:'JSON',mediaType:'application/json',
      redactionStatus:'REDACTED',extension:'json',content:evidenceBytes,metadata:{displayName:'真实链路证据.json'}});
    await f.app.database.write(db=>db.prepare(`UPDATE i10_interaction_journeys
      SET references_json=json_set(references_json,'$.artifactIds',json(?)) WHERE namespace=? AND journey_id=?`)
      .run(JSON.stringify([evidenceArtifact.artifactId]),ns,result.journeyId));
    const evidenceView=await app.getAgentTurnEvidence({turnId:result.id});
    const evidenceCard=evidenceView.artifactCards.find(card=>card.artifactId===evidenceArtifact.artifactId);
    assert.equal(evidenceCard.size,evidenceBytes.length);
    assert.equal(evidenceCard.sha256,createHash('sha256').update(evidenceBytes).digest('hex'));
    const downloaded=await app.downloadAgentArtifact({turnId:result.id,artifactId:evidenceArtifact.artifactId});
    assert.deepEqual(downloaded.bytes,evidenceBytes);
    assert.equal(result.events.some(event => event.type === 'TOOL_FINISHED' && event.toolName === 'journey_prepare'), true)
    assert.equal((await app.submitAgentMessage(request)).id, result.id)
    assert.equal(f.app.database.read(db => db.prepare('SELECT count(*) n FROM runs').get()).n, 0)
    assert.equal(f.app.database.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get()).n, 1)
  } finally {
    await app?.close(); if (!app) await metadata?.close(); await client?.close()
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill() })
  }
})
