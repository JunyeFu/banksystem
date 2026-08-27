'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const ledgerModule = require('../i10-agent-acceptance-ledger-v4.cjs')

const ID_A = 'a'.repeat(64)
const ID_B = 'b'.repeat(64)
const HASH = 'c'.repeat(64)
const NOW = '2026-08-26T10:00:00.000Z'
const BOUND_A = Object.freeze({ schemaVersion: 'hengzhun-i10-release-identity-v4', releaseStatus: 'FROZEN', identityHash: ID_A })
const BOUND_B = Object.freeze({ schemaVersion: 'hengzhun-i10-release-identity-v4', releaseStatus: 'FROZEN', identityHash: ID_B })

function store(t) {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-v4-ledger-'))
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }))
  return ledgerModule.createAgentAcceptanceLedger({ storageRoot, now: () => NOW })
}

function record(caseId, variant, attempt = 1, identity = ID_A) {
  return {
    releaseIdentityHash: identity, caseId, variant, attempt, status: 'PASSED',
    evidenceRef: `evidence/${caseId}/${variant}/${attempt}.json`, evidenceHash: HASH,
    publicReadbackIdentityHash: identity, completedAt: NOW,
  }
}

test('current projection counts exactly one immutable record for every 9x2 chain', (t) => {
  const ledger = store(t)
  for (const caseId of ledgerModule.CASES) for (const variant of ledgerModule.VARIANTS) ledger.terminalRecord(record(caseId, variant), BOUND_A)
  const status = ledger.status(BOUND_A)
  assert.deepEqual(status, { schemaVersion: ledgerModule.LEDGER_SCHEMA, releaseIdentityHash: ID_A, currentPassed: 18, required: 18, full18: true, historicalStale: 0, checkpoints: 0 })
  assert.deepEqual(ledger.currentRecords(BOUND_A).map((item) => `${item.caseId}:${item.variant}`), ledgerModule.CASES.flatMap((caseId) => ledgerModule.VARIANTS.map((variant) => `${caseId}:${variant}`)))
})

test('duplicate attempt is idempotent but conflicting terminal evidence is immutable', (t) => {
  const ledger = store(t)
  const first = ledger.terminalRecord(record('L1', 'TEXT_ONLY'), BOUND_A)
  assert.deepEqual(ledger.terminalRecord(record('L1', 'TEXT_ONLY'), BOUND_A), first)
  assert.throws(() => ledger.terminalRecord({ ...record('L1', 'TEXT_ONLY'), evidenceHash: 'd'.repeat(64) }, BOUND_A), (error) => error.code === 'AGENT_V4_TERMINAL_RECORD_IMMUTABLE')
  assert.equal(ledger.status(BOUND_A).currentPassed, 1)
})

test('higher attempts do not inflate one case and variant', (t) => {
  const ledger = store(t)
  ledger.terminalRecord(record('L1', 'TEXT_ONLY', 1), BOUND_A)
  ledger.terminalRecord({ ...record('L1', 'TEXT_ONLY', 2), evidenceHash: 'd'.repeat(64) }, BOUND_A)
  assert.equal(ledger.status(BOUND_A).currentPassed, 1)
  assert.equal(ledger.currentRecords(BOUND_A)[0].attempt, 2)
})

test('cross-identity readback is rejected and stale identities never count', (t) => {
  const ledger = store(t)
  assert.throws(() => ledger.terminalRecord({ ...record('L1', 'TEXT_ONLY'), publicReadbackIdentityHash: ID_B }, BOUND_A), (error) => error.code === 'AGENT_V4_RECORD_IDENTITY_MISMATCH')
  ledger.terminalRecord(record('L1', 'TEXT_ONLY', 1, ID_A), BOUND_A)
  assert.equal(ledger.status(BOUND_B).currentPassed, 0)
  assert.equal(ledger.status(BOUND_B).historicalStale, 1)
})

test('v3 ledger import fails closed', (t) => {
  const ledger = store(t)
  fs.mkdirSync(path.dirname(ledger.ledgerPath), { recursive: true })
  fs.writeFileSync(ledger.ledgerPath, JSON.stringify({ schemaVersion: 'hengzhun-i10-acceptance-ledger-v3', records: {}, checkpoints: {} }))
  assert.throws(() => ledger.read(), (error) => error.code === 'AGENT_V3_LEDGER_IMPORT_FORBIDDEN')
})

test('approval checkpoint accepts only the safe exact tuple and survives restart', (t) => {
  const ledger = store(t)
  const value = ledger.writeCheckpoint({
    releaseIdentityHash: ID_A, caseId: 'L1', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: 'session_12345678', proposalId: 'proposal_12345678', contentHash: HASH, expiresAt: '2026-08-26T10:30:00.000Z',
  }, BOUND_A)
  const restored = ledgerModule.createAgentAcceptanceLedger({ storageRoot: path.dirname(ledger.ledgerPath), now: () => NOW })
  assert.deepEqual(restored.checkpoint(BOUND_A, 'L1', 'TEXT_ONLY'), value)
  const serialized = fs.readFileSync(ledger.ledgerPath, 'utf8')
  assert.doesNotMatch(serialized, /password|credential|attachment|input/i)
  assert.throws(() => ledger.writeCheckpoint({
    releaseIdentityHash: ID_A, caseId: 'L1', variant: 'TEXT_ONLY', attempt: 1, status: 'RUNNING', rawInput: 'secret',
  }, BOUND_A), (error) => error.code === 'AGENT_V4_CHECKPOINT_FIELDS_INVALID')
})

test('terminal admission clears its exact checkpoint and blocks later checkpoint recreation', (t) => {
  const ledger = store(t)
  ledger.writeCheckpoint({ releaseIdentityHash: ID_A, caseId: 'L1', variant: 'TEXT_ONLY', attempt: 1, status: 'RUNNING' }, BOUND_A)
  ledger.terminalRecord(record('L1', 'TEXT_ONLY'), BOUND_A)
  assert.equal(ledger.checkpoint(BOUND_A, 'L1', 'TEXT_ONLY'), null)
  assert.throws(() => ledger.writeCheckpoint({ releaseIdentityHash: ID_A, caseId: 'L1', variant: 'TEXT_ONLY', attempt: 1, status: 'RUNNING' }, BOUND_A), (error) => error.code === 'AGENT_V4_TERMINAL_CHECKPOINT_FORBIDDEN')
})

test('invalid cardinality and unknown terminal fields fail before persistence', (t) => {
  const ledger = store(t)
  assert.throws(() => ledger.terminalRecord(record('X1', 'TEXT_ONLY'), BOUND_A), (error) => error.code === 'AGENT_V4_CASE_INVALID')
  assert.throws(() => ledger.terminalRecord({ ...record('L1', 'TEXT_ONLY'), rawModelOutput: 'secret' }, BOUND_A), (error) => error.code === 'AGENT_V4_RECORD_FIELDS_INVALID')
  assert.equal(fs.existsSync(ledger.ledgerPath), false)
})

test('source-frozen unbound identity can never become acceptance authority', (t) => {
  const ledger = store(t)
  const sourceOnly = { schemaVersion: 'hengzhun-i10-release-identity-v4', releaseStatus: 'SOURCE_FROZEN_UNBOUND', identityHash: ID_A }
  assert.throws(() => ledger.terminalRecord(record('L1', 'TEXT_ONLY'), sourceOnly), (error) => error.code === 'AGENT_V4_BOUND_IDENTITY_REQUIRED')
  assert.equal(fs.existsSync(ledger.ledgerPath), false)
})

test('deterministic failure locks the chain and exact resolution clears only the matching approval', (t) => {
  const ledger = store(t)
  const approval = {
    releaseIdentityHash: ID_A, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1, status: 'AWAITING_APPROVAL',
    sessionId: 'session_12345678', proposalId: 'proposal_12345678', contentHash: HASH, expiresAt: '2026-08-26T10:30:00.000Z',
  }
  ledger.writeCheckpoint(approval, BOUND_A)
  assert.throws(() => ledger.resolveCheckpoint({
    releaseIdentityHash: ID_A, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1,
    sessionId: approval.sessionId, proposalId: approval.proposalId, contentHash: 'd'.repeat(64),
  }, BOUND_A), (error) => error.code === 'AGENT_V4_CHECKPOINT_RESOLUTION_MISMATCH')
  ledger.resolveCheckpoint({
    releaseIdentityHash: ID_A, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1,
    sessionId: approval.sessionId, proposalId: approval.proposalId, contentHash: approval.contentHash,
  }, BOUND_A)
  ledger.writeCheckpoint({
    releaseIdentityHash: ID_A, caseId: 'L2', variant: 'TEXT_ONLY', attempt: 1,
    status: 'FAILED_DETERMINISTIC', errorCode: 'AGENT_FULL18_CHAIN_FAILED',
  }, BOUND_A)
  assert.equal(ledger.currentCheckpoints(BOUND_A)[0].status, 'FAILED_DETERMINISTIC')
})
