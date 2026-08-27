import assert from 'node:assert/strict'
import test from 'node:test'
import { createReadOnlyShadowComparator, evaluateShadowWindow } from '../src/shadow-comparator.mjs'

const baseline = Object.freeze({ summary: 'submit', risk: 'LOW', toolName: 'journey_input_submit', clarificationRequired: false })

test('shadow compares proposals without a mutation capability or raw payload output', async () => {
  let ticks = 10
  const comparator = createReadOnlyShadowComparator({
    planner: { plan: async () => ({ ...baseline, arguments: { secretBusinessValue: 'not-emitted' } }) },
    now: () => (ticks += 5),
  })
  const report = await comparator.compare({ requestId: 'request-1', facts: { version: 4 }, redactedUserInput: '[CUSTOMER] submit', baselineProposal: baseline })
  assert.equal(report.schemaValid, true)
  assert.equal(report.toolSelectionMatch, true)
  assert.equal(report.stateWriteCount, 0)
  assert.equal(JSON.stringify(report).includes('not-emitted'), false)
  assert.equal(JSON.stringify(report).includes('[CUSTOMER] submit'), false)
})

test('shadow rejects secret-like unredacted input before planner invocation', async () => {
  let calls = 0
  const comparator = createReadOnlyShadowComparator({ planner: { plan: async () => { calls += 1; return baseline } } })
  await assert.rejects(() => comparator.compare({ requestId: 'r', facts: {}, redactedUserInput: 'Authorization: Bearer abc.def', baselineProposal: baseline }), /AGENT_SHADOW_REDACTION_INVALID/)
  assert.equal(calls, 0)
})

test('invalid candidate fails closed as a metric row and never claims a write', async () => {
  const comparator = createReadOnlyShadowComparator({ planner: { plan: async () => ({ risk: 'LOW' }) } })
  const report = await comparator.compare({ requestId: 'r', facts: {}, redactedUserInput: '[REDACTED]', baselineProposal: baseline })
  assert.equal(report.schemaValid, false)
  assert.equal(report.stateWriteCount, 0)
  assert.equal(report.failureCode, 'AGENT_SHADOW_CANDIDATE_INVALID')
})

test('window gate rejects writes, unauthorized attempts, schema failures and major risk divergence', () => {
  const good = { schemaValid: true, toolSelectionMatch: true, majorRiskDisagreement: false, stateWriteCount: 0, unauthorizedAttemptCount: 0 }
  assert.equal(evaluateShadowWindow([good]).passed, true)
  for (const drift of [
    { stateWriteCount: 1 }, { unauthorizedAttemptCount: 1 }, { schemaValid: false },
    { toolSelectionMatch: false }, { majorRiskDisagreement: true },
  ]) assert.equal(evaluateShadowWindow([{ ...good, ...drift }]).passed, false)
})
