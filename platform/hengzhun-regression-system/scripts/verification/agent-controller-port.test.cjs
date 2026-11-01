'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

const {
  CONTROLLER_KINDS,
  FlowiseAdapter,
  assertResumeInput,
  assertStartInput,
} = require('../../controller/src/controller-port.cjs')
const {
  defaultContractPath,
  defaultPolicyPath,
  loadToolPolicy,
  validateToolPolicy,
} = require('../../controller/src/tool-policy.cjs')
const { loadRiskPolicy } = require('../../controller/src/risk-policy.cjs')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

test('current 39-tool population is classified exactly once and planner projection is read-only', () => {
  const policy = loadToolPolicy()
  assert.equal(policy.activeToolCount, 39)
  assert.equal(policy.readOnlyTools.length, 15)
  assert.equal(policy.mutatingTools.length, 24)
  assert.equal(policy.readOnlyTools.length + policy.mutatingTools.length, 39)
  assert.equal(policy.classify('journey_get'), 'READ_ONLY')
  assert.equal(policy.classify('journey_evidence_verify'), 'READ_ONLY')
  assert.equal(policy.classify('schedule_create'), 'MUTATING')
  assert.equal(policy.classify('candidate_preview'), 'READ_ONLY')
  assert.equal(policy.classify('result_inbox_list'), 'READ_ONLY')
  assert.equal(policy.classify('candidate_compile'), 'MUTATING')
  assert.equal(policy.classify('result_inbox_ack'), 'MUTATING')
  assert.deepEqual(policy.plannerTools, policy.readOnlyTools)
  for (const toolName of policy.plannerTools) assert.equal(policy.classify(toolName), 'READ_ONLY')
  assert.throws(() => policy.classify('future_unknown_tool'), /AGENT_CONTROLLER_TOOL_DENIED/)
})

test('ControllerPort registers inactive JSON v2 and policy risk covers all mutators', () => {
  assert.ok(CONTROLLER_KINDS.includes('langgraph-json-v2'))
  const tools = loadToolPolicy().mutatingTools
  const risk = loadRiskPolicy()
  assert.equal(risk.profile, 'DETERMINISTIC_PREFETCH_JSON')
  assert.deepEqual(Object.keys(risk.toolRisk).sort(), [...tools].sort())
})

test('missing, overlapping, unknown and conditionally misclassified tools fail closed', async (t) => {
  const contract = readJson(defaultContractPath)
  const original = readJson(defaultPolicyPath)

  await t.test('missing', () => {
    const policy = structuredClone(original)
    policy.readOnlyTools = policy.readOnlyTools.filter((name) => name !== 'journey_get')
    assert.throws(() => validateToolPolicy(contract, policy), /AGENT_CONTROLLER_TOOL_POLICY_MISSING/)
  })
  await t.test('overlap', () => {
    const policy = structuredClone(original)
    policy.readOnlyTools.push('schedule_create')
    assert.throws(() => validateToolPolicy(contract, policy), /AGENT_CONTROLLER_TOOL_POLICY_OVERLAP/)
  })
  await t.test('unknown', () => {
    const policy = structuredClone(original)
    policy.readOnlyTools.push('future_unknown_tool')
    assert.throws(() => validateToolPolicy(contract, policy), /AGENT_CONTROLLER_TOOL_POLICY_UNKNOWN/)
  })
  await t.test('conditional side effect', () => {
    const policy = structuredClone(original)
    policy.conditionalSideEffectTools = ['candidate_preview']
    assert.throws(
      () => validateToolPolicy(contract, policy),
      /AGENT_CONTROLLER_CONDITIONAL_SIDE_EFFECT_NOT_MUTATING/,
    )
  })
})

test('FlowiseAdapter delegates stable inputs and results without framework coupling', async () => {
  const calls = []
  const expectedStart = {
    controllerKind: 'flowise-v7',
    threadId: 'thread-1',
    journeyId: 'journey-1',
    status: 'AWAITING_USER',
    message: 'Confirm the frozen proposal.',
    proposalRef: 'proposal-1',
    harnessVersion: 3,
  }
  const expectedResume = { ...expectedStart, status: 'COMPLETED', message: 'Completed.' }
  const adapter = new FlowiseAdapter({
    async start(input) {
      calls.push(['start', input])
      return expectedStart
    },
    async resume(input) {
      calls.push(['resume', input])
      return expectedResume
    },
  })
  const startInput = { requestId: 'request-1', namespace: 'test', userInput: 'prepare case' }
  const resumeInput = {
    requestId: 'request-2',
    namespace: 'test',
    threadId: 'thread-1',
    journeyId: 'journey-1',
    decision: { approved: true },
  }
  assert.equal(await adapter.start(startInput), expectedStart)
  assert.equal(await adapter.resume(resumeInput), expectedResume)
  assert.deepEqual(calls, [['start', startInput], ['resume', resumeInput]])
  const source = fs.readFileSync(require.resolve('../../controller/src/controller-port.cjs'), 'utf8')
  assert.doesNotMatch(source, /require\(['"](?:@langchain\/langgraph|deepagents)['"]\)/)
  assert.doesNotMatch(source, /from\s+['"](?:@langchain\/langgraph|deepagents)['"]/)
})

test('ControllerPort input and result shapes reject incomplete values', async () => {
  assert.throws(() => assertStartInput({}), /AGENT_CONTROLLER_INPUT_INVALID/)
  assert.throws(() => assertResumeInput({}), /AGENT_CONTROLLER_INPUT_INVALID/)
  const adapter = new FlowiseAdapter({
    async start() {
      return { controllerKind: 'langgraph-deepagents-v1' }
    },
    async resume() {
      return null
    },
  })
  await assert.rejects(
    adapter.start({ requestId: 'r', namespace: 'n', userInput: 'u' }),
    /AGENT_CONTROLLER_KIND_MISMATCH/,
  )
})
