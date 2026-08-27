'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..', '..')
const policy = require(path.join(productRoot, 'scripts/i10-acceptance-execution-policy.cjs'))
const acceptance = require(path.join(productRoot, 'scripts/i10-18-chain-acceptance-live.cjs'))
const stage8 = require(path.join(productRoot, 'scripts/i10-stage8-live.cjs'))
const ledger = require(path.join(productRoot, 'scripts/i10-acceptance-ledger-v3.cjs'))

const exactArtifact = Object.freeze({
  producerIdentity: 'release-identity-a',
  normalizedInputHash: '1'.repeat(64),
  targetProfileId: 'targetprofile_11111111-1111-4111-8111-111111111111',
  credentialBindingStatus: 'BOUND',
  candidateHash: '2'.repeat(64),
  downstreamContractVersion: 'i10-v1'
})

function acceptedRecord(overrides = {}) {
  return {
    status: 'PASSED',
    caseId: 'L1',
    variant: 'TEXT_ONLY',
    candidateId: 'candidate_' + '1'.repeat(40),
    scriptId: 'script_' + '2'.repeat(40),
    scriptHash: '3'.repeat(64),
    playwrightValidationTaskId: 'buildjob_11111111-1111-4111-8111-111111111111',
    stabilityCertificateId: 'certificate_' + '4'.repeat(40),
    fourRunIds: ['desktop-1', 'desktop-2', 'narrow-1', 'narrow-2'],
    activationDecision: { mode: 'DIRECT_ACTIVATE', verified: true },
    execution: { mode: 'ON_DEMAND', taskId: 'task_11111111-1111-4111-8111-111111111111', runId: 'run_11111111-1111-4111-8111-111111111111' },
    resultInboxId: 'inbox_11111111-1111-4111-8111-111111111111',
    terminalArtifactId: 'art_11111111-1111-4111-8111-111111111111',
    ...overrides
  }
}

test('RF-006 comparison evidence root is restricted to the product comparison area', () => {
  const allowed = ledger.resolveEvidenceRoot('.data/evidence/i10/rf006-comparison/legacy')
  assert.equal(allowed, path.join(productRoot, '.data', 'evidence', 'i10', 'rf006-comparison', 'legacy'))
  assert.throws(
    () => ledger.resolveEvidenceRoot(path.join(productRoot, '.data', 'outside-comparison')),
    error => error.code === 'I10_RF006_COMPARISON_ROOT_INVALID'
  )
})

test('RF-006 classifies the earliest invalidated surface deterministically', () => {
  const result = policy.classifyChangedSurfaces({
    previous: {
      'scripts/intake.cjs': 'a',
      'worker/src/authoring.cjs': 'b',
      'docs/readme.md': 'c'
    },
    current: {
      'scripts/intake.cjs': 'a',
      'worker/src/authoring.cjs': 'changed',
      'docs/readme.md': 'changed'
    }
  })
  assert.deepEqual(result.changedSurfaces, ['authoring', 'evidence_only'])
  assert.equal(result.invalidationFrom, 'authoring')
  assert.deepEqual(result.invalidatedStages, ['authoring', 'builder', 'runner'])
})

test('RF-006 exact artifact reuse requires every identity and artifact predicate', () => {
  assert.deepEqual(policy.exactReuseDecision(exactArtifact, exactArtifact), {
    reusable: true,
    reasons: [],
    requiredLiveGates: ['PURE_PLAYWRIGHT', 'I10_2X2_V1', 'ACTIVATION', 'FORMAL_EXECUTION']
  })
  for (const field of Object.keys(exactArtifact)) {
    const actual = { ...exactArtifact, [field]: `${exactArtifact[field]}-different` }
    const decision = policy.exactReuseDecision(exactArtifact, actual)
    assert.equal(decision.reusable, false, field)
    assert.deepEqual(decision.reasons, [`${field}:MISMATCH`], field)
  }
  assert.equal(policy.exactReuseDecision(exactArtifact, { ...exactArtifact, credentialBindingStatus: 'EXPIRED' }).reusable, false)
})

test('RF-006 authoring idempotency key is stable and binds all four authorities', () => {
  const input = {
    journeyId: 'journey_11111111-1111-4111-8111-111111111111',
    draftHash: '3'.repeat(64),
    targetProfileId: 'targetprofile_11111111-1111-4111-8111-111111111111',
    authoringIdentity: 'worker-authoring-a'
  }
  const first = policy.authoringIdempotencyKey(input)
  const reordered = policy.authoringIdempotencyKey({
    authoringIdentity: input.authoringIdentity,
    targetProfileId: input.targetProfileId,
    draftHash: input.draftHash,
    journeyId: input.journeyId
  })
  assert.match(first, /^authoring_[0-9a-f]{64}$/)
  assert.equal(first, reordered)
  assert.notEqual(first, policy.authoringIdempotencyKey({ ...input, draftHash: '4'.repeat(64) }))
})

test('RF-006 current in-flight checkpoint requires recovery and blocks duplicate authoring', () => {
  const decision = policy.inFlightReuseDecision({
    checkpoint: {
      releaseIdentityHash: 'release-a',
      authoringIdempotencyKey: 'authoring_' + '5'.repeat(64),
      runDirectory: '.data/evidence/run-a',
      stage: 'SCENARIO_PREPARED'
    },
    expectedReleaseIdentityHash: 'release-a',
    expectedAuthoringIdempotencyKey: 'authoring_' + '5'.repeat(64)
  })
  assert.deepEqual(decision, {
    action: 'RECOVER_IN_PLACE',
    runDirectory: '.data/evidence/run-a',
    reason: 'MATCHING_IN_FLIGHT_AUTHORING'
  })
  assert.equal(policy.inFlightReuseDecision({
    checkpoint: { ...decision, releaseIdentityHash: 'release-b' },
    expectedReleaseIdentityHash: 'release-a',
    expectedAuthoringIdempotencyKey: 'authoring_' + '5'.repeat(64)
  }).action, 'INVALIDATE')
})

test('RF-006 acceptance driver recovers a matching current checkpoint before a new run', () => {
  const releaseIdentity = { schemaVersion: 'hengzhun-i10-release-identity-v1', identityHash: 'a'.repeat(64) }
  const ledger = {
    checkpoints: {
      'L1:TEXT_ONLY:1': {
        stage: 'SCENARIO_PREPARED',
        runDirectory: '.data/evidence/i10/run-one',
        releaseIdentity
      }
    }
  }
  assert.deepEqual(acceptance.acceptanceCheckpointDisposition({
    ledger,
    caseId: 'L1',
    variant: 'TEXT_ONLY',
    attempt: 1,
    releaseIdentity
  }), {
    action: 'RECOVER_IN_PLACE',
    runDirectory: '.data/evidence/i10/run-one',
    reason: 'CURRENT_IDENTITY_CHECKPOINT'
  })
  assert.equal(acceptance.acceptanceCheckpointDisposition({
    ledger: { checkpoints: {} }, caseId: 'L1', variant: 'TEXT_ONLY', attempt: 1, releaseIdentity
  }).action, 'START_NEW')
})

test('RF-006 Stage8 poll delay uses bounded backoff and preserves a legacy rollback switch', () => {
  assert.equal(stage8.acceptancePollDelayMs(1), 1000)
  assert.deepEqual([1, 2, 3, 8].map(attempt => stage8.acceptancePollDelayMs(attempt, { enabled: true })), [1000, 1500, 2250, 15000])
  assert.equal(stage8.acceptancePollDelayMs(4, { enabled: false }), 15000)
})

test('RF-006 terminal-aware polling backs off, stops immediately and respects budget', async () => {
  const delays = []
  let reads = 0
  const result = await policy.pollUntilTerminal({
    read: async () => ({ status: ++reads >= 4 ? 'PASSED' : 'PROCESSING' }),
    classify: value => value.status,
    sleep: async milliseconds => { delays.push(milliseconds) },
    initialDelayMs: 1000,
    multiplier: 2,
    maximumDelayMs: 5000,
    maximumPolls: 6
  })
  assert.equal(result.terminal.status, 'PASSED')
  assert.equal(result.pollCount, 4)
  assert.deepEqual(delays, [1000, 2000, 4000])

  await assert.rejects(() => policy.pollUntilTerminal({
    read: async () => ({ status: 'PROCESSING' }),
    classify: value => value.status,
    sleep: async () => {},
    maximumPolls: 2
  }), error => error.code === 'I10_RF006_POLL_BUDGET_EXHAUSTED')
})

test('RF-006 timing ledger reconciles sequential stages, polls, retries and cache decisions', () => {
  const ticks = [100, 160, 220, 310]
  const ledger = policy.createTimingLedger({ runId: 'run-test', clock: () => ticks.shift() })
  ledger.startStage('controller')
  ledger.recordPoll('controller')
  ledger.endStage('controller')
  ledger.startStage('authoring')
  ledger.recordRetry('authoring')
  ledger.recordCacheDecision({ reusable: false, reason: 'authoring:CHANGED' })
  ledger.endStage('authoring')
  const result = ledger.finalize()
  assert.equal(result.totalDurationMs, 210)
  assert.equal(result.measuredDurationMs, 150)
  assert.equal(result.unattributedDurationMs, 60)
  assert.equal(result.pollCount, 1)
  assert.equal(result.retryCount, 1)
  assert.equal(result.stages.length, 2)
  assert.equal(result.status, 'RECONCILED')
})

test('RF-006 S3 accepts only a record that preserves every live gate', () => {
  const gates = policy.liveGateProjection(acceptedRecord())
  assert.deepEqual(gates, {
    authoringCandidate: true,
    purePlaywright: true,
    stability2x2: true,
    activation: true,
    formalExecution: true,
    resultReadback: true,
    terminalArtifact: true
  })
  assert.equal(policy.allLiveGatesPassed(gates), true)
  for (const field of Object.keys(gates)) {
    const broken = acceptedRecord()
    if (field === 'authoringCandidate') broken.candidateId = null
    if (field === 'purePlaywright') broken.playwrightValidationTaskId = null
    if (field === 'stability2x2') broken.fourRunIds = ['desktop-1']
    if (field === 'activation') broken.activationDecision = { verified: false }
    if (field === 'formalExecution') broken.execution = { mode: 'ON_DEMAND' }
    if (field === 'resultReadback') broken.resultInboxId = null
    if (field === 'terminalArtifact') broken.terminalArtifactId = null
    assert.equal(policy.liveGateProjection(broken)[field], false, field)
  }
})

test('RF-006 S3 comparison requires gate equivalence and measured polling reduction', () => {
  const legacy = {
    record: acceptedRecord(), timing: { totalDurationMs: 180000, pollCount: 10, status: 'RECONCILED' },
    runDirectoryCountBeforeReplay: 1, runDirectoryCountAfterReplay: 1, ledgerCountBeforeReplay: 1, ledgerCountAfterReplay: 1
  }
  const selective = {
    record: acceptedRecord({ candidateId: 'candidate_' + '5'.repeat(40) }), timing: { totalDurationMs: 90000, pollCount: 10, status: 'RECONCILED' },
    runDirectoryCountBeforeReplay: 1, runDirectoryCountAfterReplay: 1, ledgerCountBeforeReplay: 1, ledgerCountAfterReplay: 1
  }
  const result = policy.compareModes({ legacy, selective })
  assert.equal(result.gateEquivalent, true)
  assert.equal(result.observedWallClockReduced, true)
  assert.equal(result.selectiveReplayAvoidedDuplicateAuthoring, true)
  assert.equal(result.selectiveReplayAvoidedFullRerun, true)
  assert.equal(result.cutoverDecision, 'ENABLE_SELECTIVE')
})

test('RF-006 S3 comparison fails closed when a selective gate is missing', () => {
  const common = { timing: { totalDurationMs: 180000, pollCount: 4, status: 'RECONCILED' }, runDirectoryCountBeforeReplay: 1, runDirectoryCountAfterReplay: 1, ledgerCountBeforeReplay: 1, ledgerCountAfterReplay: 1 }
  const result = policy.compareModes({
    legacy: { ...common, record: acceptedRecord() },
    selective: { ...common, timing: { ...common.timing, totalDurationMs: 80000 }, record: acceptedRecord({ resultInboxId: null }) }
  })
  assert.equal(result.gateEquivalent, false)
  assert.equal(result.cutoverDecision, 'KEEP_LEGACY')
})
