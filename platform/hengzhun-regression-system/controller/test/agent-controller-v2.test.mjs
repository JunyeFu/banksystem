import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createAgentControllerV2, createDeterministicJsonPlanner } from '../src/agent-controller-v2.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadRiskPolicy } = require('../src/risk-policy.cjs')
const { loadToolPolicy } = require('../src/tool-policy.cjs')
const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const productRoot = path.resolve(controllerRoot, '..')

class SyntheticAuthority {
  constructor() {
    this.state = {
      journeyId: 'journey-v2', version: 7, status: 'AWAITING_INPUT',
      preparationId: 'prep-v2', targetProfileRef: 'target-v2',
    }
    this.targetRevision = 1
    this.mutations = 0
    this.lastMutation = null
    this.readbackMismatch = false
  }

  async readJourney(journeyId) {
    assert.equal(journeyId, this.state.journeyId)
    return structuredClone(this.state)
  }

  async prefetch({ namespace, journeyId, expectedVersion }) {
    return {
      schemaVersion: 'hengzhun-deterministic-prefetch/v1',
      namespace,
      journeyId,
      expectedVersion,
      target: { ref: this.state.targetProfileRef, revision: this.targetRevision },
      capabilities: ['journey_input_submit', 'run_submit'],
    }
  }

  async mutate(command) {
    this.mutations += 1
    this.lastMutation = structuredClone(command)
    this.state.version += 1
    this.state.status = 'INPUT_ACCEPTED'
    return {
      harnessVersion: this.readbackMismatch ? this.state.version + 1 : this.state.version,
      status: this.state.status,
    }
  }
}

function proposal(overrides = {}) {
  return {
    type: 'PROPOSE',
    summary: 'Submit the exact prepared input.',
    toolName: 'journey_input_submit',
    arguments: { journeyId: 'journey-v2', input: 'confirmed' },
    ...overrides,
  }
}

function build({ response = proposal(), now = () => 1_800_000_000_000 } = {}) {
  const authority = new SyntheticAuthority()
  const modelCalls = []
  const planner = createDeterministicJsonPlanner({
    async invokeJson(request) {
      modelCalls.push(structuredClone(request))
      return structuredClone(response)
    },
  })
  const controller = createAgentControllerV2({
    planner,
    prefetcher: { prefetch: (input) => authority.prefetch(input) },
    harness: { readJourney: (journeyId) => authority.readJourney(journeyId) },
    mutationInvoker: { invoke: (command) => authority.mutate(command) },
    releaseIdentityHash: '03b6b55797832af8979f97a2dc6b5f6730c3abb680d76fde4f4ad2d8ba815dfa',
    now,
    threadIdFactory: () => 'thread-v2',
  })
  return { authority, controller, modelCalls, response }
}

function startInput(overrides = {}) {
  return {
    requestId: 'request-start-v2', namespace: 'tenant-a', journeyId: 'journey-v2',
    userInput: 'Please continue.', ...overrides,
  }
}

function exactDecision(started, overrides = {}) {
  return {
    approved: true,
    proposalId: started.approval.proposalId,
    contentHash: started.approval.contentHash,
    expectedVersion: started.approval.expectedVersion,
    idempotencyKey: 'idem-controller-v2-001',
    ...overrides,
  }
}

function resumeInput(started, overrides = {}) {
  return {
    requestId: 'request-resume-v2', namespace: 'tenant-a',
    threadId: started.threadId, journeyId: started.journeyId,
    decision: exactDecision(started), ...overrides,
  }
}

test('ANSWER and CLARIFY are strict non-mutating terminal branches', async (t) => {
  for (const [name, response, status] of [
    ['answer', { type: 'ANSWER', answer: 'The journey is awaiting input.' }, 'COMPLETED'],
    ['clarify', { type: 'CLARIFY', question: 'Which case should continue?', missingFields: ['caseRef'] }, 'AWAITING_USER'],
  ]) {
    await t.test(name, async () => {
      const { controller, authority } = build({ response })
      const result = await controller.start(startInput())
      assert.equal(result.outcome.type, response.type)
      assert.equal(result.status, status)
      assert.equal(authority.mutations, 0)
      assert.equal(result.proposalRef, undefined)
    })
  }
})

test('deterministic prefetch JSON reaches a tool-free planner envelope', async () => {
  const { controller, modelCalls } = build({ response: { type: 'ANSWER', answer: 'Ready.' } })
  await controller.start(startInput())
  assert.equal(modelCalls.length, 1)
  assert.equal(modelCalls[0].tools, undefined)
  assert.equal(modelCalls[0].responseSchema, 'ANSWER|CLARIFY|PROPOSE')
  const envelope = JSON.parse(modelCalls[0].input)
  assert.equal(envelope.deterministicPrefetch.expectedVersion, 7)
  assert.equal(envelope.deterministicPrefetch.target.ref, 'target-v2')
})

test('risk policy covers every mutator exactly once', () => {
  const tools = loadToolPolicy().mutatingTools
  const policy = loadRiskPolicy()
  assert.deepEqual(Object.keys(policy.toolRisk).sort(), [...tools].sort())
  for (const toolName of tools) assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(policy.riskFor(toolName)))
})

test('inactive v2 release manifest is complete and graph source has no Deep Agents dependency', () => {
  const manifest = JSON.parse(readFileSync(path.join(controllerRoot, 'controller-release-manifest-v2.json'), 'utf8'))
  assert.equal(manifest.activationStatus, 'INACTIVE')
  assert.equal(manifest.profile, 'DETERMINISTIC_PREFETCH_JSON')
  assert.equal(manifest.modelConfigIdentity.toolMode, 'NONE')
  for (const relativePath of manifest.releaseFiles) {
    assert.equal(existsSync(path.join(productRoot, relativePath)), true, relativePath)
  }
  const source = readFileSync(path.join(controllerRoot, 'src', 'agent-controller-v2.mjs'), 'utf8')
  assert.doesNotMatch(source, /\bdeepagents\b|createDeepAgent|governed_read/)
})

test('PROPOSE risk is policy-owned and exact approval mutates once with frozen arguments', async () => {
  const mutableResponse = proposal()
  const { controller, authority } = build({ response: mutableResponse })
  const started = await controller.start(startInput())
  assert.equal(started.status, 'AWAITING_USER')
  assert.equal(started.outcome.risk, 'MEDIUM')
  mutableResponse.arguments.input = 'tampered after freeze'
  const completed = await controller.resume(resumeInput(started))
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.harnessVersion, 8)
  assert.equal(authority.mutations, 1)
  assert.equal(authority.lastMutation.arguments.input, 'confirmed')
  assert.equal(authority.lastMutation.risk, 'MEDIUM')
})

test('HIGH risk cannot be lowered by model output', async () => {
  const { controller, authority } = build({ response: proposal({
    toolName: 'run_submit',
    arguments: { candidateId: 'candidate-v2' },
  }) })
  const started = await controller.start(startInput())
  assert.equal(started.outcome.risk, 'HIGH')
  assert.equal(authority.mutations, 0)

  const invalid = build({ response: { ...proposal(), risk: 'LOW' } })
  const rejected = await invalid.controller.start(startInput())
  assert.equal(rejected.status, 'FAILED_CLOSED')
  assert.equal(rejected.message, 'AGENT_CONTROLLER_PLAN_INVALID')
  assert.equal(invalid.authority.mutations, 0)
})

test('approval identity hash and version tampering all fail before mutation', async (t) => {
  for (const [name, override, code] of [
    ['proposal', { proposalId: 'proposal-wrong' }, 'AGENT_CONTROLLER_PROPOSAL_MISMATCH'],
    ['hash', { contentHash: '0'.repeat(64) }, 'AGENT_CONTROLLER_CONTENT_HASH_MISMATCH'],
    ['version', { expectedVersion: 999 }, 'AGENT_CONTROLLER_APPROVAL_VERSION_MISMATCH'],
    ['rejection', { approved: false }, 'AGENT_CONTROLLER_APPROVAL_REQUIRED'],
  ]) {
    await t.test(name, async () => {
      const { controller, authority } = build()
      const started = await controller.start(startInput())
      const result = await controller.resume(resumeInput(started, {
        decision: exactDecision(started, override),
      }))
      assert.equal(result.status, 'FAILED_CLOSED')
      assert.equal(result.message, code)
      assert.equal(authority.mutations, 0)
    })
  }
})

test('expired proposal fails closed before mutation', async () => {
  let current = 1_800_000_000_000
  const { controller, authority } = build({ now: () => current })
  const started = await controller.start(startInput())
  current += 300_001
  const result = await controller.resume(resumeInput(started))
  assert.equal(result.message, 'AGENT_CONTROLLER_APPROVAL_EXPIRED')
  assert.equal(authority.mutations, 0)
})

test('authority version or deterministic target drift fails closed before mutation', async (t) => {
  for (const drift of ['version', 'target']) {
    await t.test(drift, async () => {
      const { controller, authority } = build()
      const started = await controller.start(startInput())
      if (drift === 'version') authority.state.version += 1
      else authority.targetRevision += 1
      const result = await controller.resume(resumeInput(started))
      assert.equal(result.message, 'AGENT_CONTROLLER_AUTHORITY_CONFLICT')
      assert.equal(authority.mutations, 0)
    })
  }
})

test('cross-namespace and cross-journey resume are denied', async (t) => {
  for (const [name, override, code] of [
    ['namespace', { namespace: 'tenant-b' }, 'AGENT_CONTROLLER_NAMESPACE_CONFLICT'],
    ['journey', { journeyId: 'journey-other' }, 'AGENT_CONTROLLER_JOURNEY_CONFLICT'],
  ]) {
    await t.test(name, async () => {
      const { controller, authority } = build()
      const started = await controller.start(startInput())
      const result = await controller.resume(resumeInput(started, override))
      assert.equal(result.status, 'FAILED_CLOSED')
      assert.equal(result.message, code)
      assert.equal(authority.mutations, 0)
    })
  }
})

test('completed resume replay never performs a second mutation', async () => {
  const { controller, authority } = build()
  const started = await controller.start(startInput())
  const input = resumeInput(started)
  assert.equal((await controller.resume(input)).status, 'COMPLETED')
  const replay = await controller.resume(input)
  assert.equal(replay.status, 'FAILED_CLOSED')
  assert.equal(replay.message, 'AGENT_CONTROLLER_THREAD_COMPLETED')
  assert.equal(authority.mutations, 1)
})

test('start replay on the same thread is denied before a new graph run', async () => {
  const { controller, authority } = build({ response: { type: 'ANSWER', answer: 'Done.' } })
  await controller.start(startInput())
  await assert.rejects(
    () => controller.start(startInput({ requestId: 'request-start-replay', threadId: 'thread-v2' })),
    /AGENT_CONTROLLER_THREAD_ALREADY_STARTED/,
  )
  assert.equal(authority.mutations, 0)
})

test('readback mismatch fails closed after exactly one mutation', async () => {
  const { controller, authority } = build()
  authority.readbackMismatch = true
  const started = await controller.start(startInput())
  const result = await controller.resume(resumeInput(started))
  assert.equal(result.status, 'FAILED_CLOSED')
  assert.equal(result.message, 'AGENT_CONTROLLER_RECONCILIATION_FAILED')
  assert.equal(authority.mutations, 1)
})
