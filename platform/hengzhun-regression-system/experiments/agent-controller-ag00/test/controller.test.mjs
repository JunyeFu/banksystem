import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  ReadOnlyToolBroker,
  SyntheticHarness,
  createController,
  probeDeepAgentBoundary,
} from '../src/controller.mjs'

function interruptValue(result) {
  assert.equal(result.__interrupt__?.length, 1)
  return result.__interrupt__[0].value
}

function approvedDecision(proposal, overrides = {}) {
  return {
    approved: true,
    proposalId: proposal.proposalId,
    contentHash: proposal.contentHash,
    expectedVersion: proposal.expectedVersion,
    idempotencyKey: 'idem-ag00-0001',
    ...overrides,
  }
}

test('LangGraph interrupts, resumes exact approval, mutates once and reconciles', async () => {
  const harness = new SyntheticHarness()
  const controller = createController({ harness })
  const first = await controller.start(
    { threadId: 'thread-happy', journeyId: 'journey-ag00', userInput: 'advance synthetic journey' },
    'thread-happy',
  )
  const proposal = interruptValue(first)
  const completed = await controller.resume(approvedDecision(proposal), 'thread-happy')

  assert.equal(completed.failureCode, undefined)
  assert.equal(completed.mutationCount, 1)
  assert.equal(completed.result.version, 2)
  assert.equal(completed.result.status, 'SIMULATED_ADVANCED')
  assert.equal(harness.mutationCalls, 1)

  const replay = harness.executeApproved({
    proposal: completed.proposal,
    expectedVersion: 1,
    idempotencyKey: 'idem-ag00-0001',
  })
  assert.deepEqual(replay, completed.result)
  assert.equal(harness.mutationCalls, 1)
})

test('checkpoint cannot override authoritative Harness state after resume', async () => {
  const harness = new SyntheticHarness()
  const controller = createController({ harness })
  const first = await controller.start(
    { threadId: 'thread-conflict', journeyId: 'journey-ag00', userInput: 'advance synthetic journey' },
    'thread-conflict',
  )
  const proposal = interruptValue(first)
  harness.simulateExternalVersionAdvance('journey-ag00')
  const completed = await controller.resume(approvedDecision(proposal), 'thread-conflict')

  assert.equal(completed.failureCode, 'AGENT_CONTROLLER_AUTHORITY_CONFLICT')
  assert.equal(harness.mutationCalls, 0)
  assert.equal(harness.read('journey-ag00').mutationCount, 0)
})

test('changed approval content fails closed with zero mutation', async () => {
  const harness = new SyntheticHarness()
  const controller = createController({ harness })
  const first = await controller.start(
    { threadId: 'thread-hash', journeyId: 'journey-ag00', userInput: 'advance synthetic journey' },
    'thread-hash',
  )
  const proposal = interruptValue(first)
  const completed = await controller.resume(
    approvedDecision(proposal, { contentHash: '0'.repeat(64) }),
    'thread-hash',
  )

  assert.equal(completed.failureCode, 'AGENT_CONTROLLER_CONTENT_HASH_MISMATCH')
  assert.equal(harness.mutationCalls, 0)
})

test('approval version mismatch and expired approval both perform zero mutation', async (t) => {
  await t.test('version mismatch', async () => {
    const harness = new SyntheticHarness()
    const controller = createController({ harness })
    const first = await controller.start(
      { threadId: 'thread-version', journeyId: 'journey-ag00', userInput: 'advance' },
      'thread-version',
    )
    const proposal = interruptValue(first)
    const completed = await controller.resume(
      approvedDecision(proposal, { expectedVersion: proposal.expectedVersion + 1 }),
      'thread-version',
    )
    assert.equal(completed.failureCode, 'AGENT_CONTROLLER_APPROVAL_VERSION_MISMATCH')
    assert.equal(harness.mutationCalls, 0)
  })

  await t.test('expired proposal', async () => {
    const payload = {
      action: 'SIMULATED_JOURNEY_ADVANCE',
      journeyId: 'journey-ag00',
      expectedVersion: 1,
      targetStatus: 'SIMULATED_ADVANCED',
      risk: 'LOW',
      expiresAt: '2000-01-01T00:00:00.000Z',
    }
    const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    const harness = new SyntheticHarness()
    const controller = createController({
      harness,
      planner: {
        async plan() {
          return {
            proposalId: `proposal-${contentHash.slice(0, 16)}`,
            contentHash,
            ...payload,
          }
        },
      },
    })
    const first = await controller.start(
      { threadId: 'thread-expired', journeyId: 'journey-ag00', userInput: 'advance' },
      'thread-expired',
    )
    const proposal = interruptValue(first)
    const completed = await controller.resume(approvedDecision(proposal), 'thread-expired')
    assert.equal(completed.failureCode, 'AGENT_CONTROLLER_APPROVAL_EXPIRED')
    assert.equal(harness.mutationCalls, 0)
  })
})

test('planner cannot forge proposal hash', async () => {
  const harness = new SyntheticHarness()
  const controller = createController({
    harness,
    planner: {
      async plan() {
        return {
          proposalId: 'proposal-0000000000000000',
          contentHash: '0'.repeat(64),
          action: 'SIMULATED_JOURNEY_ADVANCE',
          journeyId: 'journey-ag00',
          expectedVersion: 1,
          targetStatus: 'SIMULATED_ADVANCED',
          risk: 'LOW',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }
      },
    },
  })
  const completed = await controller.start(
    { threadId: 'thread-forged', journeyId: 'journey-ag00', userInput: 'advance' },
    'thread-forged',
  )
  assert.equal(completed.failureCode, 'AGENT_CONTROLLER_PROPOSAL_HASH_INVALID')
  assert.equal(completed.__interrupt__, undefined)
  assert.equal(harness.mutationCalls, 0)
})

test('a second idempotency key cannot create a second mutation', async () => {
  const harness = new SyntheticHarness()
  const controller = createController({ harness })
  const first = await controller.start(
    { threadId: 'thread-limit', journeyId: 'journey-ag00', userInput: 'advance' },
    'thread-limit',
  )
  const proposal = interruptValue(first)
  const completed = await controller.resume(approvedDecision(proposal), 'thread-limit')
  assert.equal(completed.failureCode, undefined)
  assert.throws(
    () =>
      harness.executeApproved({
        proposal: completed.proposal,
        expectedVersion: 2,
        idempotencyKey: 'idem-ag00-0002',
      }),
    /AGENT_CONTROLLER_MUTATION_LIMIT/,
  )
  assert.equal(harness.mutationCalls, 1)
})

test('read-only broker rejects mutating, host and unknown tools', () => {
  const broker = new ReadOnlyToolBroker(new SyntheticHarness())
  assert.deepEqual(broker.visibleTools, ['journey_get'])
  assert.equal(broker.invoke('journey_get', { journeyId: 'journey-ag00' }).version, 1)
  for (const name of [
    'schedule_create',
    'journey_advance',
    'write_file',
    'execute',
    'sqlite_query',
    'browser_execute',
    'credential_get',
    'unknown_tool',
  ]) {
    assert.throws(() => broker.invoke(name, {}), /AGENT_CONTROLLER_TOOL_FORBIDDEN/)
  }
})

test('Deep Agents profile exposes only the synthetic read-only tool under injection', async () => {
  const boundary = await probeDeepAgentBoundary()
  assert.deepEqual(boundary.visibleTools, ['journey_get'])
  assert.deepEqual(boundary.forbiddenToolsVisible, [])
  assert.match(String(boundary.response), /Synthetic planner response/)
})
