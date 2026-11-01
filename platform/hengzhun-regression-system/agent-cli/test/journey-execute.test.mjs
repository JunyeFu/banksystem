import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'

import { connectMcpRuntime } from '../../controller/src/runtime-adapters.mjs'
import { createProductionService } from '../src/production-service.mjs'

const RELEASE = 'a'.repeat(64)
const SESSION = `session-${'b'.repeat(32)}`
const JOURNEY = `journey_${'1'.repeat(8)}-${'2'.repeat(4)}-4${'3'.repeat(3)}-8${'4'.repeat(3)}-${'5'.repeat(12)}`
const PREPARATION = `prep_${'6'.repeat(32)}`
const TARGET_PROFILE = `targetprofile_${'0'.repeat(32)}`
const CREDENTIAL = `credential_${'c'.repeat(8)}-${'d'.repeat(4)}-4${'e'.repeat(3)}-8${'f'.repeat(3)}-${'a'.repeat(12)}`
const CANDIDATE = `candidate_${'7'.repeat(32)}`
const RUN = `run_${'8'.repeat(32)}`
const TASK = `task_${'9'.repeat(32)}`
const DECISION = `journeyevent_${'1'.repeat(8)}-${'2'.repeat(4)}-4${'3'.repeat(3)}-8${'4'.repeat(3)}-${'6'.repeat(12)}`
const HASH = 'd'.repeat(64)
const REPEATED_JOURNEY=JOURNEY.slice(0,-1)+'0'
const REPEATED_RUN=`run_${'0'.repeat(32)}`
const REPEATED_TASK=`task_${'0'.repeat(32)}`
const productRoot = path.resolve(import.meta.dirname, '..', '..')

function toolResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], isError }
}

function fixture({ terminalTask, authoringError, candidateError, caseApproval = false, resumeSubmitted = false, resumeBeforeSubmission = false, resumeCompleted = false, proofIdentity = RELEASE,repeatSource=false } = {}) {
  const calls = []
  const events = []
  let journeyRead = 0
  let taskRead = 0
  let clock = 0
  let boundJourney=repeatSource ? JOURNEY.slice(0,-1)+'9' : JOURNEY
  const activeJourney=repeatSource ? REPEATED_JOURNEY : JOURNEY
  const activeRun=repeatSource ? REPEATED_RUN : RUN
  const activeTask=repeatSource ? REPEATED_TASK : TASK
  const journeyStates = [
    { version: 2, status: 'PROCESSING', stage: 'PROCESSING_AUTHORING', nextAction: { type: 'CALL_CASE_PREPARE' }, caseDraft: {
      summary: 'Verify transfer', objective: 'Verify transfer', targetSystem: 'Fuxing Bank', entryUrl: 'http://127.0.0.1:5173/portal/',
      credentialRef: CREDENTIAL, steps: [{ action: 'transfer', expected: 'completed' }], assertions: ['completed'],
    } },
    { version: 3, status: 'PROCESSING', stage: 'PROCESSING_AUTHORING', nextAction: { type: 'SUBMIT_AUTHORING' }, preparationId: PREPARATION, preparationVersion: 1 },
    { version: 4, status: 'PROCESSING', stage: 'PROCESSING_AUTHORING', nextAction: { type: 'COMPILE_CANDIDATE' }, preparationId: PREPARATION, preparationVersion: 2 },
    { version: 5, status: 'AWAITING_USER', stage: 'READY_FOR_SCRIPT_ACTIVATION', nextAction: { type: 'CONFIRM_EXACT' }, preparationId: PREPARATION,
      proposal: { proposalId: `proposal_${'a'.repeat(32)}`, payloadHash: HASH } },
    { version: 7, status: 'NEEDS_INPUT', stage: 'NEEDS_INPUT', nextAction: { type: 'INPUT_REQUIRED' }, references: { preparationId: PREPARATION, candidateId: CANDIDATE } },
    { version: 8, status: 'AWAITING_USER', stage: 'READY_FOR_EXECUTION_CONFIRMATION', nextAction: { type: 'CONFIRM_EXACT' },
      proposal: { proposalId: `proposal_${'b'.repeat(32)}`, payloadHash: 'e'.repeat(64) } },
    { version: 9, status: 'PROCESSING', stage: 'RUNNING', nextAction: { type: 'CALL_RUN_SUBMIT' },
      references: { preparationId: PREPARATION, candidateId: CANDIDATE, confirmedDecisionEventId: DECISION } },
    { version: 10, status: 'COMPLETED', stage: 'COMPLETED', nextAction: { type: 'RESULT_AVAILABLE' },
      references: { preparationId: PREPARATION, candidateId: CANDIDATE, confirmedDecisionEventId: DECISION, runId: RUN, taskId: TASK } },
  ]
  if (candidateError) journeyStates[3] = { version: 5, stage: 'FAILED_ACTIONABLE', status: 'FAILED', error: { category: 'AUTHORING', errorCode: candidateError, recoverable: true } };
  if (resumeSubmitted || resumeBeforeSubmission) {
    journeyStates.splice(0,6)
    if(resumeSubmitted){
      Object.assign(journeyStates[0].references,{runId:RUN,taskId:TASK})
      journeyStates[0].nextAction={type:'QUERY_TASK'}
    }
  }
  if (resumeCompleted) journeyStates.splice(0,7)
  if(repeatSource){
    journeyStates.splice(0,4)
    Object.assign(journeyStates[0].references,{validatedJourneyId:JOURNEY,planId:'plan-frozen',scriptHash:HASH})
    Object.assign(journeyStates.at(-1).references,{runId:activeRun,taskId:activeTask})
  }
  if (caseApproval) journeyStates.unshift({
    version: 1, status: 'AWAITING_USER', stage: 'READY_FOR_CASE_APPROVAL',
    proposalId: `proposal_${'c'.repeat(32)}`, proposalPayloadHash: HASH,
    caseDraft: { steps: [{ action: 'login', expected: 'profile' }], assertions: ['name is visible'] },
  })
  const client = { async callTool(request) {
    calls.push({ name: request.name, arguments: request.arguments })
    if(request.name==='journey_prepare'&&repeatSource)return toolResult({journeyId:activeJourney,...journeyStates[0]})
    if(request.name==='journey_get'&&repeatSource&&request.arguments.journeyId===JOURNEY)
      return toolResult({journeyId:JOURNEY,stage:'COMPLETED',status:'COMPLETED',references:{runId:RUN,taskId:TASK,candidateId:CANDIDATE}})
    if (request.name === 'journey_get') return toolResult({ journeyId: activeJourney, ...journeyStates[Math.min(journeyRead++, journeyStates.length - 1)] })
    if (request.name === 'journey_evidence_verify') return toolResult({schemaVersion:'hengzhun-cli-evidence-verification/v1',
      verdict:'VERIFIED',journeyId:request.arguments.journeyId,runId:request.arguments.journeyId===JOURNEY?RUN:activeRun,
      taskId:request.arguments.journeyId===JOURNEY?TASK:activeTask,runStatus:'PASSED',taskStatus:'SUCCEEDED',releaseIdentityHash:proofIdentity})
    if (request.name === 'target_profile_prepare') return toolResult({
      targetProfileId: TARGET_PROFILE, version: 1, status: 'PENDING_CONFIRMATION', profileHash: HASH,
      nextAction: 'TARGET_PROFILE_CONFIRMATION_REQUIRED',
    })
    if (request.name === 'target_profile_decision_submit') return toolResult({
      targetProfileId: TARGET_PROFILE, version: 2, status: 'ACTIVE', nextAction: 'CASE_AUTHORING_AVAILABLE',
    })
    if (request.name === 'candidate_decide') return toolResult({
      candidateId: CANDIDATE, candidateVersion: 2, status: 'SCRIPT_VALIDATED', nextAction: 'ON_DEMAND_RUN_AVAILABLE',
    })
    if (request.name === 'authoring_submit' && authoringError) return toolResult({ errorCode: authoringError }, true)
    if (request.name === 'task_get') {
      const taskStates = terminalTask
        ? [{ status: 'QUEUED', terminal: false }, terminalTask]
        : [{ status: 'QUEUED', terminal: false }, { status: 'RUNNING', terminal: false }, { status: 'SUCCEEDED', terminal: true }]
      const state = taskStates[Math.min(taskRead++, taskStates.length - 1)]
      return toolResult({ taskId: activeTask, runId: activeRun, version: taskRead, ...state })
    }
    if (request.name === 'journey_decision_submit' && request.arguments.decision === 'APPROVE_CASE') {
      return toolResult({ journeyId: JOURNEY, version: 2, stage: 'PROCESSING_AUTHORING', status: 'PROCESSING' })
    }
    if (request.name === 'run_submit') return toolResult({
      status: 'QUEUED', runId: activeRun, taskId: activeTask, candidateId: CANDIDATE,
      journeyId: activeJourney, confirmedDecisionEventId: DECISION,
    })
    return toolResult({ status: 'ACCEPTED', version: 1 })
  } }
  const sessionStore = {
    async load(sessionId, options) {
      assert.equal(sessionId, SESSION)
      if (options.expectedJourneyId !== undefined) assert.equal(options.expectedJourneyId, boundJourney)
      return { sessionId: SESSION, journeyId: boundJourney, status: 'ACTIVE', events: repeatSource?[{type:'SESSION_STARTED'},...events]:caseApproval ? [{
        type: 'APPROVAL_PENDING', source: 'JOURNEY_CASE_APPROVAL', proposalId: `proposal_${'c'.repeat(32)}`,
        contentHash: HASH, expectedVersion: 1, expiresAt: '2099-01-01T00:00:00.000Z',
      }] : [] }
    },
    async appendEvent(_sessionId, _release, event) { events.push(event) },
    async rebindJourney(_sessionId,_release,{expectedJourneyId,journeyId}){assert.equal(expectedJourneyId,boundJourney);boundJourney=journeyId},
    async create() {}, async list() { return [] },
  }
  const service = createProductionService({
    sessionStore, releaseIdentityHash: RELEASE, mcpClient: client, namespace: 'rf045', writeGate: async () => undefined,
    modelConfig: { apiKey: 'test', baseURL: 'http://model.invalid/v1', model: 'test' }, executionWaitMs: 20, executionPollMs: 1,
    now: () => clock, sleep: async (milliseconds) => { clock += milliseconds },
  })
  return { service, calls, events }
}

test('candidate model rejection preserves the exact Journey error without formal run submission', async () => {
  const f = fixture({ candidateError: 'I10_MIDSCENE_MODEL_UNSUPPORTED' });
  await assert.rejects(f.service.journeyExecute({ sessionId: SESSION, journeyId: JOURNEY }), error => error.code === 'I10_MIDSCENE_MODEL_UNSUPPORTED');
  assert.equal(f.calls.some(call => call.name === 'run_submit'), false);
});

test('explicit repeat uses a fresh Journey and run with no model authoring, and replay recovers that same execution',async()=>{
  const f=fixture({repeatSource:true});
  const result=await f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY,repeat:true});
  assert.equal(result.journeyId,REPEATED_JOURNEY);assert.equal(result.runId,REPEATED_RUN);assert.equal(result.taskId,REPEATED_TASK);
  assert.equal(result.candidateId,CANDIDATE);assert.equal(result.status,'PASSED');
  assert.ok(f.calls.every(call=>['journey_get','journey_evidence_verify','journey_prepare','journey_input_submit','journey_decision_submit','run_submit','task_get'].includes(call.name)));
  assert.equal(f.calls.find(call=>call.name==='journey_prepare').arguments.validatedJourneyId,JOURNEY);
  const recovered=await f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY,repeat:true});
  assert.equal(recovered.runId,REPEATED_RUN);
  assert.equal(f.calls.filter(call=>call.name==='run_submit').length,1);
});

test('repeat rejects stale source evidence before creating another Journey',async()=>{
  const f=fixture({repeatSource:true,proofIdentity:'f'.repeat(64)});
  await assert.rejects(f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY,repeat:true}),e=>e.code==='JOURNEY_REPEAT_SOURCE_IDENTITY_INVALID');
  assert.ok(!f.calls.some(call=>call.name==='journey_prepare'));
});

test('repeat cannot reuse the original execution session as a fresh request',async()=>{
  const f=fixture({resumeCompleted:true});
  await assert.rejects(f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY,repeat:true}),e=>e.code==='JOURNEY_REPEAT_FRESH_SESSION_REQUIRED');
  assert.equal(f.calls.length,0);
});

test('journey execute advances the exact approved Journey through MCP and observes the Worker task', async () => {
  const f = fixture()
  const result = await f.service.journeyExecute({ sessionId: SESSION, journeyId: JOURNEY })
  assert.deepEqual(result, {
    status: 'PASSED', sessionId: SESSION, journeyId: JOURNEY, runId: RUN, taskId: TASK,
    candidateId: CANDIDATE, confirmedDecisionEventId: DECISION,
  })
  assert.deepEqual(f.calls.map((call) => call.name), [
    'journey_get', 'target_profile_prepare', 'target_profile_decision_submit',
    'case_prepare', 'journey_get', 'authoring_submit', 'journey_get', 'candidate_compile', 'journey_get',
    'journey_decision_submit', 'candidate_decide', 'journey_get', 'journey_input_submit', 'journey_get',
    'journey_decision_submit', 'journey_get', 'run_submit', 'task_get', 'task_get', 'task_get', 'journey_get',
  ])
  assert.equal(f.calls.find((call) => call.name === 'run_submit').arguments.confirmedDecisionEventId, DECISION)
  assert.equal(f.events.at(-1).runId, RUN)
  assert.equal(f.events.at(-1).taskId, TASK)
})

test('a restarted CLI attaches to the persisted formal run without another authoring or submission',async()=>{
  const f=fixture({resumeSubmitted:true})
  const result=await f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY})
  assert.equal(result.runId,RUN)
  assert.equal(result.taskId,TASK)
  assert.equal(result.status,'PASSED')
  assert.ok(f.calls.every(call=>['journey_get','task_get'].includes(call.name)))
})

test('a restarted CLI reports the original failed task without resubmitting it',async()=>{
  const f=fixture({resumeSubmitted:true,terminalTask:{status:'FAILED',terminal:true,errorCode:'BANK_ASSERTION_FAILED'}})
  await assert.rejects(f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY}),error=>error.code==='BANK_ASSERTION_FAILED')
  assert.ok(f.calls.every(call=>['journey_get','task_get'].includes(call.name)))
})

test('recovery before the first run submission uses the existing exact decision, not a new execution decision',async()=>{
  const f=fixture({resumeBeforeSubmission:true})
  const result=await f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY})
  assert.equal(result.runId,RUN)
  const submissions=f.calls.filter(call=>call.name==='run_submit')
  assert.equal(submissions.length,1)
  assert.equal(submissions[0].arguments.confirmedDecisionEventId,DECISION)
  assert.ok(f.calls.every(call=>['journey_get','run_submit','task_get'].includes(call.name)))
})

test('a run that finishes during CLI restart is verified and returned without another submission',async()=>{
  const f=fixture({resumeCompleted:true})
  const result=await f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY})
  assert.equal(result.status,'PASSED');assert.equal(result.runId,RUN)
  assert.deepEqual(f.calls.map(call=>call.name),['journey_get','journey_evidence_verify'])
})

test('completed-run recovery cannot accept another release identity',async()=>{
  const f=fixture({resumeCompleted:true,proofIdentity:'f'.repeat(64)})
  await assert.rejects(f.service.journeyExecute({sessionId:SESSION,journeyId:JOURNEY}),error=>error.code==='JOURNEY_RUN_RECOVERY_EVIDENCE_INVALID')
})

test('resume submits an exact Harness case approval and completes the browser execution', async () => {
  const f = fixture({ caseApproval: true })
  const result = await f.service.resume({
    sessionId: SESSION, proposalId: `proposal_${'c'.repeat(32)}`, approved: true,
  })
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.journeyId, JOURNEY)
  const decision = f.calls.find((call) => call.name === 'journey_decision_submit' && call.arguments.decision === 'APPROVE_CASE')
  assert.deepEqual({
    journeyId: decision.arguments.journeyId,
    expectedVersion: decision.arguments.expectedVersion,
    proposalId: decision.arguments.proposalId,
    payloadHash: decision.arguments.payloadHash,
  }, { journeyId: JOURNEY, expectedVersion: 1, proposalId: `proposal_${'c'.repeat(32)}`, payloadHash: HASH })
  assert.equal(f.events.some((event) => event.type === 'APPROVAL_RESOLVED'), true)
  assert.equal(f.events.at(-1).type, 'TURN_FINISHED')
})

test('journey execute preserves the authoring business failure and stops before candidate compilation', async () => {
  const f = fixture({ authoringError: 'I8_AUTHORING_CONTEXT_REQUIRED' })
  await assert.rejects(
    f.service.journeyExecute({ sessionId: SESSION, journeyId: JOURNEY }),
    (error) => error.code === 'I8_AUTHORING_CONTEXT_REQUIRED' && error.exitCode === 4,
  )
  assert.deepEqual(f.calls.map((call) => call.name), [
    'journey_get', 'target_profile_prepare', 'target_profile_decision_submit',
    'case_prepare', 'journey_get', 'authoring_submit',
  ])
  assert.equal(f.events.length, 0)
})

test('journey execute stops on the first deterministic Worker failure', async () => {
  const f = fixture({ terminalTask: { status: 'FAILED', terminal: true, errorCode: 'BANK_ASSERTION_FAILED' } })
  await assert.rejects(
    f.service.journeyExecute({ sessionId: SESSION, journeyId: JOURNEY }),
    (error) => error.code === 'BANK_ASSERTION_FAILED' && error.exitCode === 4,
  )
  assert.equal(f.events.length, 0)
  assert.equal(f.calls.at(-1).name, 'task_get')
})

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('MCP_EXITED_BEFORE_READY')
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('MCP_HEALTH_TIMEOUT')
}

test('real MCP transports the exact CLI execution sequence to one deterministic isolated Harness test projection', async (t) => {
  const harnessPort = await freePort()
  const mcpPort = await freePort()
  const token = 's'.repeat(32)
  const routes = []
  let stage = 'APPROVED'
  let taskReads = 0
  const proposal = (suffix, hash) => ({ proposalId: `proposal_${suffix.repeat(32)}`, payloadHash: hash })
  const oversizedJourney = (value) => ({
    ...value,
    renderedMarkdown: 'bounded-projection-required-'.repeat(500),
  })
  const journey = () => {
    const common = { journeyId: JOURNEY, status: 'PROCESSING', version: 2, references: {} }
    if (stage === 'APPROVED') return { ...common, stage: 'PROCESSING_AUTHORING', nextAction: { type: 'CALL_CASE_PREPARE' }, caseDraft: {
      summary: 'Verify transfer', objective: 'Verify transfer', targetSystem: 'Fuxing Bank', entryUrl: 'http://127.0.0.1:5173/portal/',
      credentialRef: CREDENTIAL, steps: [{ action: 'transfer', expected: 'completed' }], assertions: ['completed'],
    } }
    if (stage === 'PREPARED') return { ...common, version: 3, stage: 'PROCESSING_AUTHORING', nextAction: { type: 'SUBMIT_AUTHORING' }, preparationId: PREPARATION, preparationVersion: 1 }
    if (stage === 'AUTHORED') return { ...common, version: 4, stage: 'PROCESSING_AUTHORING', nextAction: { type: 'COMPILE_CANDIDATE' }, preparationId: PREPARATION, preparationVersion: 2 }
    if (stage === 'CERTIFIED') return { ...common, status: 'AWAITING_USER', version: 5, stage: 'READY_FOR_SCRIPT_ACTIVATION', nextAction: { type: 'CONFIRM_EXACT' }, preparationId: PREPARATION, proposal: proposal('a', HASH) }
    if (stage === 'ACTIVATED') return { ...common, status: 'NEEDS_INPUT', version: 7, stage: 'NEEDS_INPUT', nextAction: { type: 'INPUT_REQUIRED' }, references: { preparationId: PREPARATION, candidateId: CANDIDATE } }
    if (stage === 'PLANNED') return { ...common, status: 'AWAITING_USER', version: 8, stage: 'READY_FOR_EXECUTION_CONFIRMATION', nextAction: { type: 'CONFIRM_EXACT' }, proposal: proposal('b', 'e'.repeat(64)) }
    if (stage === 'RUN_COMPLETED') return { ...common, status: 'COMPLETED', version: 10, stage: 'COMPLETED', nextAction: { type: 'RESULT_AVAILABLE' }, references: { preparationId: PREPARATION, candidateId: CANDIDATE, confirmedDecisionEventId: DECISION, runId: RUN, taskId: TASK } }
    return { ...common, version: 9, stage: 'RUNNING', nextAction: { type: 'CALL_RUN_SUBMIT' }, references: { preparationId: PREPARATION, candidateId: CANDIDATE, confirmedDecisionEventId: DECISION } }
  }
  const harness = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
    routes.push({ path: request.url, body })
    let value
    if (request.url === '/v1/i10/journeys:get') value = journey()
    else if(request.url==='/v1/i10/journeys:prepare'){
      assert.equal(body.validatedJourneyId,JOURNEY);
      value={journeyId:REPEATED_JOURNEY,stage:'NEEDS_INPUT',status:'NEEDS_INPUT',version:1,
        references:{validatedJourneyId:JOURNEY,sourceRunId:RUN,candidateId:CANDIDATE,preparationId:PREPARATION,planId:'plan-frozen'},
        nextAction:{type:'PROVIDE_INPUT'}}
    }
    else if (request.url === '/v1/i10/target-profiles:prepare') value = {
      targetProfileId: TARGET_PROFILE, version: 1, status: 'PENDING_CONFIRMATION', profileHash: HASH,
      nextAction: 'TARGET_PROFILE_CONFIRMATION_REQUIRED',
    }
    else if (request.url === '/v1/i10/target-profiles:decide') value = {
      targetProfileId: TARGET_PROFILE, version: 2, status: 'ACTIVE', nextAction: 'CASE_AUTHORING_AVAILABLE',
    }
    else if (request.url === '/v1/i10/cases:prepare') { stage = 'PREPARED'; value = { status: 'PREPARED', version: 1, preparationId: PREPARATION } }
    else if (request.url === '/v1/i8/authoring:submit') { stage = 'AUTHORED'; value = { status: 'AWAITING_STAGE3', version: 2, preparationId: PREPARATION } }
    else if (request.url === '/v1/i8/candidates:compile') { stage = 'CERTIFIED'; value = { status: 'QUEUED', version: 1, preparationId: PREPARATION } }
    else if (request.url === '/v1/i8/candidates:get') value = { status: 'STABILITY_CERTIFIED', version: 1, terminal: true, candidate: { candidateId: CANDIDATE, version: 1 } }
    else if (request.url === '/v1/i8/candidates:decide') { stage = 'ACTIVATED'; value = { status: 'SCRIPT_VALIDATED', candidateVersion: 2, candidateId: CANDIDATE, nextAction: 'ON_DEMAND_RUN_AVAILABLE' } }
    else if (request.url === '/v1/i10/journeys:submit-input') { stage = 'PLANNED'; value = oversizedJourney({ ...journey(), status: 'AWAITING_USER' }) }
    else if (request.url === '/v1/i10/journeys:decide' && body.decision === 'ACTIVATE_SCRIPT') { stage = 'ACTIVATED'; value = oversizedJourney({ ...journey(), status: 'NEEDS_INPUT' }) }
    else if (request.url === '/v1/i10/journeys:decide' && body.decision === 'RUN_ON_DEMAND') { stage = 'RUN_DECIDED'; value = oversizedJourney(journey()) }
    else if (request.url === '/v1/i8/runs:submit') value = { status: 'QUEUED', runId: RUN, taskId: TASK, candidateId: CANDIDATE, journeyId: JOURNEY, confirmedDecisionEventId: DECISION }
    else if (request.url === '/v1/i8/tasks:get') {
      const states = [
        { status: 'QUEUED', terminal: false },
        { status: 'RUNNING', terminal: false },
        { status: 'SUCCEEDED', terminal: true },
      ]
      const state = states[Math.min(taskReads++, states.length - 1)]
      if (state.status === 'SUCCEEDED') stage = 'RUN_COMPLETED'
      value = { ...state, runId: RUN, taskId: TASK }
    }
    else { response.writeHead(404, { 'content-type': 'application/json' }); response.end(JSON.stringify({ errorCode: 'NOT_FOUND' })); return }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(value))
  })
  await new Promise((resolve, reject) => harness.listen(harnessPort, '127.0.0.1', resolve).once('error', reject))
  const node20 = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
  const mcp = spawn(node20, ['mcp/src/server.cjs'], { cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, HENGZHUN_MCP_HOST: '127.0.0.1', HENGZHUN_MCP_PORT: String(mcpPort), HENGZHUN_MCP_TOKEN: token,
    HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_HARNESS_URL: `http://127.0.0.1:${harnessPort}`, HENGZHUN_NAMESPACE: 'rf045',
  } })
  let client
  t.after(async () => {
    await client?.close().catch(() => undefined)
    if (mcp.exitCode === null) mcp.kill()
    if (mcp.exitCode === null) await new Promise((resolve) => mcp.once('exit', resolve))
    await new Promise((resolve) => harness.close(resolve))
  })
  await waitForHealth(`http://127.0.0.1:${mcpPort}/health`, mcp)
  client = await connectMcpRuntime({ url: `http://127.0.0.1:${mcpPort}/mcp`, token })
  const sessionStore = {
    async load() { return { sessionId: SESSION, journeyId: JOURNEY, status: 'ACTIVE', events: [] } },
    async appendEvent() {}, async create() {}, async list() { return [] },
  }
  const service = createProductionService({
    sessionStore, releaseIdentityHash: RELEASE, mcpClient: client, namespace: 'rf045', writeGate: async () => undefined,
    modelConfig: { apiKey: 'test', baseURL: 'http://model.invalid/v1', model: 'test' }, executionPollMs: 1,
  })
  const result = await service.journeyExecute({ sessionId: SESSION, journeyId: JOURNEY })
  assert.equal(result.runId, RUN)
  assert.equal(result.taskId, TASK)
  assert.equal(result.status, 'PASSED')
  const targetPrepare = routes.find((item) => item.path === '/v1/i10/target-profiles:prepare').body
  assert.equal(targetPrepare.credentialRef, CREDENTIAL)
  assert.equal(targetPrepare.launchUrl, 'http://127.0.0.1:5173/portal/')
  const targetDecision = routes.find((item) => item.path === '/v1/i10/target-profiles:decide').body
  assert.equal(targetDecision.targetProfileId, TARGET_PROFILE)
  assert.equal(targetDecision.expectedVersion, 1)
  assert.equal(targetDecision.decision, 'APPROVE')
  assert.equal(routes.find((item) => item.path === '/v1/i8/runs:submit').body.confirmedDecisionEventId, DECISION)
  assert.equal(routes.filter((item) => item.path === '/v1/i8/runs:submit').length, 1)
  const repeated=await client.callTool({name:'journey_prepare',arguments:{sessionRef:SESSION,interactionContractVersion:'v6',requestIntent:'CASE_AUTHORING',
    inputType:'NONE',supportingImages:[],validatedJourneyId:JOURNEY}})
  assert.notEqual(repeated.isError,true)
  const projected=JSON.parse(repeated.content.find(item=>item.type==='text').text)
  assert.equal(projected.journeyId,REPEATED_JOURNEY)
  assert.equal(projected.references.validatedJourneyId,JOURNEY)
  assert.equal(projected.references.sourceRunId,RUN)
  assert.equal(projected.references.planId,'plan-frozen')
})
