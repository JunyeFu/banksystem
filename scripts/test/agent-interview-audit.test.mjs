// Audit counterexamples, not a release/LIVE suite. Known defects intentionally fail.
// All inputs, keys and model replies below are synthetic and stay in this process.
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createJourneyCandidateAuthor } from '../../platform/hengzhun-regression-system/controller/src/journey-author.mjs'
import { createMcpControllerAdapters, createOpenAIJsonInvoker, modelResponseEvidence } from '../../platform/hengzhun-regression-system/controller/src/runtime-adapters.mjs'
import { TestSessionStore as EncryptedSessionStore } from '../../platform/hengzhun-regression-system/controller/test/session-fixture.mjs'
import { workbenchOperations } from '../../platform/hengzhun-regression-system/agent-cli/src/workbench-contract.mjs'
import { createProductionService } from '../../platform/hengzhun-regression-system/agent-cli/src/production-service.mjs'

const release = 'a'.repeat(64)
const credential = 'credential_12345678-1234-4234-8234-123456789abc'
const beneficiary = '11111111-1111-4111-8111-111111111111'
const base = { goal: '只读查询账户', targetSystem: '合成银行', entryUrl: 'http://bank.invalid/portal/', credentialRef: credential }
const candidate = () => ({ title: '合成测试', objective: '验证输入约束', summary: '测试进程内候选', preconditions: [],
  steps: [{ action: '查询账户', expected: '显示余额' }], assertions: ['显示余额'], confidence: 1 })
const authorWith = output => createJourneyCandidateAuthor({ invokeJson: async () => JSON.stringify(output) })
const transferCandidate = amount => ({ ...candidate(), businessInputs: { transfer: {
  payerAccountId: '3', payeeRef: beneficiary, amount, currency: 'CNY', purpose: '回归验证',
} } })

async function productionBoundary(t, output) {
  const { first, id } = await sessions(t)
  const modelMessages = [], requests = []
  const service = createProductionService({ sessionStore: first, releaseIdentityHash: release, namespace: 'audit-only',
    modelConfig: { apiKey: 'audit-test-process-only', baseURL: 'http://model.invalid/v1', model: 'audit-only' },
    modelFactory: () => ({ withConfig: () => ({ async invoke(messages) {
      modelMessages.push(messages); return { content: JSON.stringify(output) }
    } }) }),
    mcpClient: { async callTool(request) { requests.push(request); throw new Error('Audit stops before any real MCP or bank call') } },
    writeGate: async () => undefined })
  return { service, id, modelMessages, requests }
}

async function modelEndpoint(t, reply) {
  const requests = []
  let observed
  const entered=new Promise(resolve=>{observed=resolve})
  const server = http.createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push(JSON.parse(body))
    observed()
    if(reply.drop){request.socket.destroy();return}
    if(reply.hang)return
    response.writeHead(reply.status ?? 200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(reply.body ?? { id: 'audit-only', object: 'chat.completion', created: 1, model: 'audit-only',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return { requests, entered, invoke: createOpenAIJsonInvoker({ apiKey: 'audit-test-process-only',
    baseURL: `http://127.0.0.1:${server.address().port}/v1`, model: 'audit-only', timeoutMs: reply.timeoutMs??2000 }) }
}

test('Q1 positive: hallucinated tool cannot reach MCP', async () => {
  let calls = 0
  const adapter = createMcpControllerAdapters({ client: { async callTool() { calls++ } } })
  await assert.rejects(adapter.invoke({ toolName: 'shell_exec', arguments: { command: 'synthetic' } }),
    error => error.code === 'AGENT_ADAPTER_MUTATION_TOOL_DENIED')
  assert.equal(calls, 0)
})

test('Q1 positive: an amount absent from user input is rejected', async () => {
  await assert.rejects(authorWith(transferCandidate('999.00')).author({ ...base,
    goal: `付款账户 3，收款人 ${beneficiary}，转账金额 100.00 CNY，用途：回归验证。` }),
  error => error.code === 'JOURNEY_BUSINESS_INPUT_NOT_USER_EXPLICIT')
})

test('Q1 counterexample: account balance must not become the USER_CONFIRMED transfer amount', async t => {
  const goal = `付款账户 3 当前余额 900.00 CNY，收款人 ${beneficiary}，本次转账金额 100.00 CNY，用途：回归验证。`
  let result, error
  try { result = await authorWith(transferCandidate('900.00')).author({ ...base, goal }) } catch (caught) { error = caught }
  const boundary = await productionBoundary(t, transferCandidate('900.00'))
  try { await boundary.service.journeyAuthor({ sessionId: boundary.id, ...base, goal }) } catch { /* Stop at the captured MCP boundary. */ }
  assert.equal(boundary.modelMessages.length, 1)
  assert.equal(boundary.requests.length, 0, 'Wrong amount must fail before MCP')
  const submitted = boundary.requests[0]?.arguments?.draftJson
  t.diagnostic(JSON.stringify({ wronglyAccepted: Boolean(result), claimedSource: result?.businessInputs?.source,
    expectedAmount: '100.00', actualAmount: result?.businessInputs?.values?.amount,
    mcpBoundaryTool: boundary.requests[0]?.name, mcpBoundaryAmount: submitted?.businessInputs?.values?.amount,
    evidence: 'PRODUCTION_SERVICE_ISOLATED_NO_BANK_ACTION' }))
  assert.ok(error, 'Wrong labelled amount was accepted and marked USER_CONFIRMED')
})

test('Q2 positive: malformed JSON is rejected without repairing or echoing model text', async () => {
  let calls = 0
  const author = createJourneyCandidateAuthor({ async invokeJson() { calls++; return '{"private":' } })
  await assert.rejects(author.author(base), error => error.code === 'JOURNEY_CANDIDATE_MODEL_OUTPUT_INVALID_JSON_SYNTAX'
    && !error.message.includes('private'))
  assert.equal(calls, 1)
  const evidence = modelResponseEvidence({ content: '{"private":', response_metadata: { finish_reason: 'length' } })
  assert.equal(evidence.finishReason, 'length')
  assert.equal(evidence.jsonValid, false)
  assert.equal(JSON.stringify(evidence).includes('private'), false)
})

test('Q2 counterexample: model 401 and 429 must retain distinct actionable error categories', async t => {
  const codes = []
  for (const status of [401,403,429,500,503]) {
    const endpoint = await modelEndpoint(t, { status, body: { error: { message: 'synthetic failure', type: 'audit-only' } } })
    try { await endpoint.invoke({ systemPrompt: 'Return JSON', input: '{}' }) } catch (error) { codes.push(error.code) }
    assert.equal(endpoint.requests.length, 1, 'No retry should be added to disguise this error')
  }
  t.diagnostic(JSON.stringify({ statuses: [401,403,429,500,503], codes, calls:5, evidence: 'REAL_SDK_LOCAL_HTTP' }))
  assert.deepEqual(codes,['AGENT_ADAPTER_MODEL_HTTP_401','AGENT_ADAPTER_MODEL_HTTP_403','AGENT_ADAPTER_MODEL_HTTP_429','AGENT_ADAPTER_MODEL_HTTP_5XX','AGENT_ADAPTER_MODEL_HTTP_5XX'])
  assert.notEqual(codes[0], codes[1], 'Authentication failure and rate limit collapsed into one transport code')
})

test('Q2 actual SDK disconnect, timeout and cancellation remain distinct without retry',async t=>{
  for(const [reply,code] of [[{drop:true},'AGENT_ADAPTER_MODEL_TRANSPORT_FAILED'],[{hang:true,timeoutMs:100},'AGENT_ADAPTER_MODEL_TIMEOUT']]) {
    const endpoint=await modelEndpoint(t,reply)
    await assert.rejects(endpoint.invoke({systemPrompt:'Return JSON',input:'{}'}),e=>e.code===code)
    assert.equal(endpoint.requests.length,1)
  }
  const endpoint=await modelEndpoint(t,{hang:true}),stop=new AbortController()
  const pending=endpoint.invoke({systemPrompt:'Return JSON',input:'{}',signal:stop.signal})
  await endpoint.entered;stop.abort()
  await assert.rejects(pending,e=>e.code==='AGENT_ADAPTER_CANCELLED');assert.equal(endpoint.requests.length,1)
})

test('Q3 positive: credentialRef is removed from model context and remains local', async () => {
  let context
  const author = createJourneyCandidateAuthor({ async invokeJson(value) { context = value; return JSON.stringify(candidate()) } })
  const result = await author.author({ ...base, goal: `只读查询，使用 ${credential} 安全凭据` })
  assert.equal(JSON.stringify(context).includes(credential), false)
  assert.equal(result.credentialRef, credential)
})

test('Q3 counterexample: pasted plaintext password must not enter the external model context', async t => {
  const marker = 'SYNTHETIC_PASSWORD_NOT_A_REAL_CREDENTIAL'
  const goal = `只读查询账户；密码：${marker}。`
  const route = workbenchOperations.find(route => route.operationId === 'submitAgentMessage')
  assert.ok(route, 'Use the actual web request schema')
  const accepted = route.input.safeParse({ submissionId: '11111111-1111-4111-8111-111111111111', input: goal,
    modelProfileId: '22222222-2222-4222-8222-222222222222', modelProfileVersion: 1 })
  let context
  const author = createJourneyCandidateAuthor({ async invokeJson(value) { context = value; return JSON.stringify(candidate()) } })
  try { await author.author({ ...base, goal }) } catch { /* Rejection before external invocation is also acceptable. */ }
  const leaked = JSON.stringify(context ?? {}).includes(marker)
  const boundary = await productionBoundary(t, candidate())
  try { await boundary.service.journeyAuthor({ sessionId: boundary.id, ...base, goal }) } catch { /* Stop at the captured MCP boundary. */ }
  assert.equal(boundary.modelMessages.length, 0, 'Plaintext credential must fail before model invocation')
  t.diagnostic(JSON.stringify({ webSchemaAccepted: accepted.success, modelBoundaryReceivedPassword: leaked,
    productionModelBoundaryReceivedPassword: JSON.stringify(boundary.modelMessages).includes(marker),
    evidence: 'PRODUCTION_SERVICE_SYNTHETIC_CAPTURE_ONLY_NO_EXTERNAL_MODEL' }))
  assert.equal(leaked, false, 'A free-text password crossed the external model boundary')
})

async function sessions(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hz-interview-audit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const first = await new EncryptedSessionStore({ root }).initialize()
  const id = `session-${'1'.repeat(32)}`
  await first.create({ sessionId: id, namespace: 'audit-only', threadId: 'audit-thread', journeyId: 'audit-journey',
    releaseIdentityHash: release, events: [] })
  return { root, id, first }
}

test('Q4 positive: same-store concurrent updates serialize and wrong identity is denied', async t => {
  const { first, id } = await sessions(t)
  await Promise.all(['A', 'B'].map(type => first.appendEvent(id, release, { type })))
  assert.deepEqual((await first.load(id)).events.map(event => event.type).sort(), ['A', 'B'])
  await assert.rejects(first.load(id, { expectedReleaseIdentityHash: 'b'.repeat(64) }),
    error => error.code === 'SESSION_RELEASE_IDENTITY_CONFLICT')
})

test('Q4 counterexample: independent CLI/web stores must not silently lose a checkpoint update', async t => {
  const { root, id, first } = await sessions(t)
  const second = await new EncryptedSessionStore({ root }).initialize()
  let enterA, enterB, releaseA, releaseB
  const enteredA = new Promise(resolve => { enterA = resolve }), enteredB = new Promise(resolve => { enterB = resolve })
  const waitA = new Promise(resolve => { releaseA = resolve }), waitB = new Promise(resolve => { releaseB = resolve })
  // Both stores load revision 1 before either writes. Then make the overwrite deterministic.
  const a = first.update(id, release, async payload => { enterA(); await waitA; payload.events.push({ type: 'A' }); return payload })
  const b = second.update(id, release, async payload => { enterB(); await waitB; payload.events.push({ type: 'B' }); return payload })
  await Promise.all([enteredA, enteredB])
  releaseA(); await a
  releaseB(); const outcomeB=await b.then(()=>({status:'fulfilled'}),error=>({status:'rejected',code:error.code}))
  const final = await first.load(id)
  t.diagnostic(JSON.stringify({ successfulWriters: outcomeB.status==='rejected'?1:2, finalRevision: final.revision,
    retainedEvents: final.events.map(event => event.type), evidence: 'REAL_DPAPI_UNIT_PERSISTENCE_CAS_NATIVE_MCP_VERIFIED_SEPARATELY' }))
  assert.ok((outcomeB.status==='rejected'&&outcomeB.code==='SESSION_REVISION_CONFLICT')||
    final.events.map(event=>event.type).sort().join(',')==='A,B','A losing writer must not report success')
})

test('Q5 positive: metadata cannot turn invalid JSON into success evidence', () => {
  const evidence = modelResponseEvidence({ content: '{"status":', response_metadata: { finish_reason: 'stop' },
    usage_metadata: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } })
  assert.equal(evidence.jsonValid, false)
  assert.equal(evidence.totalTokens, 16)
  assert.equal('verdict' in evidence, false)
})

test('Q5 counterexample: actual model request must enforce the declared 8192 output-token ceiling', async t => {
  const endpoint = await modelEndpoint(t, {})
  await endpoint.invoke({ systemPrompt: 'Return JSON', input: '{}' })
  const body = endpoint.requests[0]
  const cap = body.max_completion_tokens ?? body.max_tokens
  t.diagnostic(JSON.stringify({ jsonMode: body.response_format?.type, explicitOutputTokenCap: cap ?? null,
    declaredCeiling: 8192, evidence: 'REAL_SDK_LOCAL_HTTP_NOT_A_PERFORMANCE_BENCHMARK' }))
  assert.ok(Number.isInteger(cap) && cap > 0 && cap <= 8192, 'Documented output budget is not enforced on the actual request')
})
