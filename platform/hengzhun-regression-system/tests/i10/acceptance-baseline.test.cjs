'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..', '..')
const stage8 = require(path.join(productRoot, 'scripts/i10-stage8-live.cjs'))
const acceptanceLedger = require(path.join(productRoot, 'scripts/i10-acceptance-ledger-v3.cjs'))
const { assertBaseline, buildBaseline } = require(path.join(productRoot, 'scripts/i10-acceptance-cost-baseline.cjs'))

function identity(hash) {
  return { schemaVersion: 'hengzhun-i10-release-identity-v2', identityHash: hash }
}

test('RF-006 latest terminal authoring reply overrides stale historical processing text', () => {
  const historicalPending = {
    nodeId: 'directReplyAgentflow_i10_v4_candidate_processing',
    status: 'FINISHED'
  }
  const latestTerminal = {
    nodeId: 'directReplyAgentflow_i10_v6_cross_session_candidate_delivery',
    status: 'FINISHED'
  }
  assert.equal(stage8.authoringProcessingPending({
    text: '候选仍在处理中；同一会话发送“继续”。候选已经交付。',
    agentFlowExecutedData: [historicalPending, latestTerminal]
  }), false)
  assert.equal(stage8.authoringProcessingPending({
    text: '候选仍在处理中；请在同一会话发送“继续”。',
    agentFlowExecutedData: [historicalPending]
  }), true)
})

test('RF-006 baseline preserves deterministic journey processing classification', () => {
  assert.equal(stage8.journeyProcessingPending({
    text: '旅程正在处理，稍后发送“继续”。',
    status: 'PROCESSING'
  }), true)
  assert.equal(stage8.journeyProcessingPending({
    text: '旅程已完成。',
    status: 'COMPLETED'
  }), false)
})

test('RF-006 baseline keeps current-identity terminal records separate from stale evidence', () => {
  const current = identity('a'.repeat(64))
  const stale = identity('b'.repeat(64))
  const currentRecord = { status: 'PASSED', releaseIdentity: current, caseId: 'L1', variant: 'TEXT_ONLY', attempt: 1 }
  const staleRecord = { status: 'PASSED', releaseIdentity: stale, caseId: 'L1', variant: 'TEXT_WITH_IMAGE', attempt: 1 }
  const failedRecord = { status: 'FAILED', releaseIdentity: current, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1 }
  const ledger = {
    records: {
      'L1:TEXT_ONLY:1': currentRecord,
      'L1:TEXT_WITH_IMAGE:1': staleRecord,
      'L2:TEXT_ONLY:1': failedRecord
    }
  }
  assert.deepEqual(acceptanceLedger.currentRecords(ledger, current), [currentRecord])
})

test('RF-006 current analyzer inventories the preserved guard and S2 instrumentation', () => {
  const baseline = assertBaseline(buildBaseline({
    root: productRoot,
    capturedAt: '2026-08-03T00:00:00.000Z',
    releaseIdentity: identity('c'.repeat(64)),
    ledgerStatus: { currentPassed: 0, required: 18, historicalStale: 18, checkpoints: 11 }
  }))
  assert.equal(baseline.callGraph.terminalIdempotencyGuard.beforeFlowiseConversation, true)
  assert.equal(baseline.polling.scheduledResult.wait.default, 420000)
  assert.equal(baseline.polling.scheduledResult.poll.default, 10000)
  assert.equal(baseline.polling.conversationHumanGate.maximumGates, 80)
  assert.equal(baseline.polling.conversationHumanGate.strategy, 'TERMINAL_AWARE_BOUNDED_BACKOFF')
  assert.equal(baseline.polling.conversationHumanGate.fixedWaitCallSites, 0)
  assert.equal(baseline.stageTiming.status, 'INSTRUMENTED')
  assert.ok(baseline.findings.some(item => item.id === 'RF006-B05' && item.classification === 'RESOLVED'))
})

test('RF-006 S1 baseline remains an immutable historical source snapshot', () => {
  const evidencePath = path.resolve(productRoot, '..', '..', 'docs/architecture/refactoring/batches/RF-006/evidence/acceptance-cost-baseline-2026-08-03.json')
  const committed = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
  assert.equal(committed.schemaVersion, 'hengzhun-rf006-acceptance-cost-baseline-v1')
  assert.equal(committed.capturedAt, '2026-08-03T10:49:11.552Z')
  assert.equal(committed.findings.some(item => item.id === 'RF006-B05'), true)
  assert.equal(committed.sourceFiles.length, 4)
})
