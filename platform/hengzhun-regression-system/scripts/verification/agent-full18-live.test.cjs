'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const full18 = require('../i10-agent-full18-live.cjs')
const ledgerModule = require('../i10-agent-acceptance-ledger-v4.cjs')

const IDENTITY = 'a'.repeat(64)
const HASH = 'b'.repeat(64)
const NOW = '2026-08-26T10:00:00.000Z'
const BOUND = Object.freeze({ schemaVersion: 'hengzhun-i10-release-identity-v4', releaseStatus: 'FROZEN', identityHash: IDENTITY })

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-full18-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const ledger = ledgerModule.createAgentAcceptanceLedger({ storageRoot: path.join(root, 'ledger'), now: () => NOW })
  return { root, ledger }
}

function authorityEvidence(journeyId, chain) {
  const resultArtifactId = `artifact_${chain.caseId.toLowerCase()}_${chain.variant.toLowerCase()}_12345678`
  return {
    schemaVersion: 'hengzhun-cli-evidence-view/v1', journeyId, version: 9, status: 'COMPLETED', terminal: true,
    references: {
      caseId: `case_${chain.caseId.toLowerCase()}_12345678`, preparationId: 'preparation_12345678', candidateId: 'candidate_12345678',
      certificateId: 'certificate_12345678', scriptId: 'script_12345678', scriptHash: HASH, planId: 'plan_12345678',
      confirmedDecisionEventId: 'decision_12345678', inboxId: 'inbox_12345678', resultArtifactId,
      ...(new Set(['L1', 'L2', 'L3']).has(chain.caseId)
        ? { taskId: 'task_12345678', runId: 'run_12345678' }
        : { scheduleId: 'schedule_12345678' }),
    },
    artifactCards: [{ artifactId: resultArtifactId, displayName: 'result.json', mediaType: 'application/json', sha256: HASH, size: 42, downloadGrantRequired: true }],
  }
}

function terminalRecord(caseId, variant, attempt = 1) {
  return {
    releaseIdentityHash: IDENTITY, caseId, variant, attempt, status: 'PASSED',
    evidenceRef: `evidence/${caseId}/${variant}/${attempt}.json`, evidenceHash: HASH,
    publicReadbackIdentityHash: IDENTITY, completedAt: NOW,
  }
}

function seed(ledger, count) {
  for (const chain of full18.CHAIN_ORDER.slice(0, count)) ledger.terminalRecord(terminalRecord(chain.caseId, chain.variant), BOUND)
}

function approval(chain, suffix = '12345678') {
  return {
    status: 'AWAITING_APPROVAL', sessionId: `session_${suffix}`, journeyId: `journey_${suffix}`,
    proposalId: `proposal_${suffix}`, contentHash: 'c'.repeat(64), risk: 'LOW', expiresAt: '2026-08-26T10:30:00.000Z', chain,
  }
}

function baseDeps(calls, ledger) {
  return {
    ledger,
    authorizedIdentity: () => BOUND,
    doctor: () => ({ status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true }),
    start: async () => { calls.push('start'); return { releaseIdentityHash: IDENTITY } },
    stop: async () => { calls.push('stop'); return { status: 'STOPPED' } },
    publicReadback: async () => { calls.push('readback'); return { releaseIdentityHash: IDENTITY } },
    currentIdentity: async () => BOUND,
    withExecutionLock: async (_root, _identity, action) => action(),
    now: () => NOW,
  }
}

test('chain order is the exact L1-H3 by TEXT_ONLY then TEXT_WITH_IMAGE Cartesian product', () => {
  assert.equal(full18.CHAIN_ORDER.length, 18)
  assert.deepEqual(full18.CHAIN_ORDER.map(full18.chainLabel), ledgerModule.CASES.flatMap((caseId) => ledgerModule.VARIANTS.map((variant) => `${caseId}:${variant}`)))
})

test('TP09 L1 evidence is re-read through authoritative Journey evidence before L2 starts', async (t) => {
  const { root, ledger } = fixture(t)
  const calls = []
  const deps = baseDeps(calls, ledger)
  deps.readTp09Evidence = () => ({
    schemaVersion: 'hengzhun-agent-l1-evidence/v1', status: 'PASSED', profile: 'NORMAL_CLI', releaseIdentityHash: IDENTITY, full18Claim: false,
    results: [
      { variant: 'TEXT_ONLY', status: 'PASSED', sessionId: 'session_l1text1', journeyId: 'journey_l1text1' },
      { variant: 'TEXT_WITH_IMAGE', status: 'PASSED', sessionId: 'session_l1image', journeyId: 'journey_l1image' },
    ],
  })
  deps.invokeEvidence = async ({ journeyId }) => {
    calls.push(`evidence:${journeyId}`)
    return authorityEvidence(journeyId, { caseId: 'L1', variant: journeyId.includes('image') ? 'TEXT_WITH_IMAGE' : 'TEXT_ONLY' })
  }
  deps.invokeStart = async ({ chain }) => { calls.push(`run:${full18.chainLabel(chain)}`); return approval(chain) }
  const result = await full18.executeFull18({ root, deps })
  assert.equal(result.status, 'AWAITING_APPROVAL')
  assert.equal(result.chain, 'L2:TEXT_ONLY')
  assert.equal(ledger.status(BOUND).currentPassed, 2)
  assert.equal(ledger.currentCheckpoints(BOUND)[0].status, 'AWAITING_APPROVAL')
  assert.deepEqual(calls, ['start', 'readback', 'evidence:journey_l1text1', 'readback', 'evidence:journey_l1image', 'readback', 'run:L2:TEXT_ONLY', 'stop'])
})

test('exact approval records terminal readback then advances only to the next approval', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const pending = approval({ caseId: 'L2', variant: 'TEXT_ONLY' })
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  const calls = []
  const deps = baseDeps(calls, ledger)
  deps.invokeDecision = async () => ({ status: 'COMPLETED', sessionId: pending.sessionId, journeyId: pending.journeyId })
  deps.invokeEvidence = async ({ journeyId }) => authorityEvidence(journeyId, { caseId: 'L2', variant: 'TEXT_ONLY' })
  deps.invokeStart = async ({ chain }) => { calls.push(`run:${full18.chainLabel(chain)}`); return approval(chain, 'image123') }
  const result = await full18.executeFull18({
    root, command: 'approve', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, deps,
  })
  assert.equal(result.chain, 'L2:TEXT_WITH_IMAGE')
  assert.equal(ledger.status(BOUND).currentPassed, 3)
  assert.equal(ledger.currentCheckpoints(BOUND)[0].status, 'AWAITING_APPROVAL')
  assert.deepEqual(calls, ['start', 'readback', 'readback', 'run:L2:TEXT_WITH_IMAGE', 'stop'])
})

test('approval tuple mismatch fails before lifecycle start or chain mutation', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const pending = approval({ caseId: 'L2', variant: 'TEXT_ONLY' })
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  const calls = []
  await assert.rejects(full18.executeFull18({
    root, command: 'approve', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: 'd'.repeat(64),
    deps: baseDeps(calls, ledger),
  }), (error) => error.code === 'AGENT_FULL18_APPROVAL_IDENTITY_MISMATCH')
  assert.deepEqual(calls, [])
})

test('rejection clears the exact pending checkpoint without recording a pass', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const pending = approval({ caseId: 'L2', variant: 'TEXT_ONLY' })
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  const deps = baseDeps([], ledger)
  deps.invokeDecision = async () => ({ status: 'REJECTED' })
  const result = await full18.executeFull18({
    root, command: 'reject', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, deps,
  })
  assert.equal(result.status, 'REJECTED')
  assert.equal(ledger.status(BOUND).currentPassed, 2)
  assert.equal(ledger.currentCheckpoints(BOUND).length, 0)
})

test('first deterministic execution failure locks the chain and blocks rerun', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const calls = []
  const deps = baseDeps(calls, ledger)
  deps.invokeStart = async () => { calls.push('run'); throw Object.assign(new Error('failed'), { code: 'DETERMINISTIC_PORTAL_FAILURE' }) }
  await assert.rejects(full18.executeFull18({ root, deps }), (error) => error.code === 'DETERMINISTIC_PORTAL_FAILURE')
  assert.equal(ledger.currentCheckpoints(BOUND)[0].status, 'FAILED_DETERMINISTIC')
  const before = calls.length
  await assert.rejects(full18.executeFull18({ root, deps }), (error) => error.code === 'AGENT_FULL18_DETERMINISTIC_FAILURE_LOCKED')
  assert.equal(calls.length, before)
})

test('ambiguous in-flight approval is never replayed after restart', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const pending = approval({ caseId: 'L2', variant: 'TEXT_ONLY' })
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'APPROVAL_EXECUTING',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  const restarted = ledgerModule.createAgentAcceptanceLedger({ storageRoot: path.dirname(ledger.ledgerPath), now: () => NOW })
  const calls = []
  await assert.rejects(full18.executeFull18({ root, deps: baseDeps(calls, restarted) }),
    (error) => error.code === 'AGENT_FULL18_AMBIGUOUS_APPROVAL_REQUIRES_RECONCILIATION')
  assert.deepEqual(calls, [])
})

test('terminal public identity mismatch records no pass and stops before the next chain', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const pending = approval({ caseId: 'L2', variant: 'TEXT_ONLY' })
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  let reads = 0
  const calls = []
  const deps = baseDeps(calls, ledger)
  deps.publicReadback = async () => ({ releaseIdentityHash: ++reads === 1 ? IDENTITY : 'd'.repeat(64) })
  deps.invokeDecision = async () => ({ status: 'COMPLETED', sessionId: pending.sessionId, journeyId: pending.journeyId })
  deps.invokeEvidence = async () => authorityEvidence(pending.journeyId, { caseId: 'L2', variant: 'TEXT_ONLY' })
  deps.invokeStart = async () => { calls.push('unexpected-next'); return approval({ caseId: 'L2', variant: 'TEXT_WITH_IMAGE' }) }
  await assert.rejects(full18.executeFull18({
    root, command: 'approve', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, deps,
  }), (error) => error.code === 'AGENT_FULL18_PUBLIC_IDENTITY_MISMATCH')
  assert.equal(ledger.status(BOUND).currentPassed, 2)
  assert.equal(calls.includes('unexpected-next'), false)
  assert.equal(ledger.currentCheckpoints(BOUND)[0].status, 'FAILED_DETERMINISTIC')
})

test('incomplete terminal authority fails closed and never starts the next chain', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 2)
  const pending = approval({ caseId: 'L2', variant: 'TEXT_ONLY' })
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  const calls = []
  const deps = baseDeps(calls, ledger)
  deps.invokeDecision = async () => ({ status: 'COMPLETED', sessionId: pending.sessionId, journeyId: pending.journeyId })
  deps.invokeEvidence = async () => ({ schemaVersion: 'hengzhun-cli-evidence-view/v1', journeyId: pending.journeyId, status: 'COMPLETED', terminal: true, references: {}, artifactCards: [] })
  deps.invokeStart = async () => { calls.push('unexpected-next'); return approval({ caseId: 'L2', variant: 'TEXT_WITH_IMAGE' }) }
  await assert.rejects(full18.executeFull18({
    root, command: 'approve', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, deps,
  }), (error) => error.code === 'AGENT_FULL18_CASE_ID_MISSING')
  assert.equal(calls.includes('unexpected-next'), false)
  assert.equal(ledger.status(BOUND).currentPassed, 2)
})

test('the final H3 image terminal creates exactly 18 current records', async (t) => {
  const { root, ledger } = fixture(t)
  seed(ledger, 17)
  const chain = { caseId: 'H3', variant: 'TEXT_WITH_IMAGE' }
  const pending = approval(chain)
  ledger.writeCheckpoint({
    releaseIdentityHash: IDENTITY, caseId: chain.caseId, variant: chain.variant, attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, expiresAt: pending.expiresAt,
  }, BOUND)
  const deps = baseDeps([], ledger)
  deps.invokeDecision = async () => ({ status: 'COMPLETED', sessionId: pending.sessionId, journeyId: pending.journeyId })
  deps.invokeEvidence = async () => authorityEvidence(pending.journeyId, chain)
  const result = await full18.executeFull18({
    root, command: 'approve', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash, deps,
  })
  assert.deepEqual(result, { status: 'PASSED', releaseIdentityHash: IDENTITY, currentPassed: 18, required: 18, full18: true })
  assert.equal(ledger.status(BOUND).full18, true)
})

test('runner source has no retired acceptance driver, Flowise route or auto-approval switch', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'i10-agent-full18-live.cjs'), 'utf8')
  assert.doesNotMatch(source, /i10-18-chain-acceptance-live|--yes|flowise\/i10|(?:^|[^0-9])3006(?:[^0-9]|$)/i)
})

test('package exposes explicit status, preflight, run, approve and reject entrypoints', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'))
  assert.deepEqual(Object.fromEntries(Object.entries(packageJson.scripts).filter(([name]) => name.endsWith(':agent:full18'))), {
    'status:agent:full18': 'runtime\\node-v24.19.0-win-x64\\node.exe scripts/i10-agent-acceptance-ledger-v4.cjs status',
    'preflight:agent:full18': 'runtime\\node-v24.19.0-win-x64\\node.exe scripts/i10-agent-full18-live.cjs preflight',
    'run:agent:full18': 'runtime\\node-v24.19.0-win-x64\\node.exe scripts/i10-agent-full18-live.cjs run',
    'approve:agent:full18': 'runtime\\node-v24.19.0-win-x64\\node.exe scripts/i10-agent-full18-live.cjs approve',
    'reject:agent:full18': 'runtime\\node-v24.19.0-win-x64\\node.exe scripts/i10-agent-full18-live.cjs reject',
  })
})
