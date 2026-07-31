#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { currentReleaseIdentity, sameReleaseIdentity } = require('./i10-release-identity.cjs')

const root = path.resolve(__dirname, '..')
const evidenceRoot = path.join(root, '.data', 'evidence', 'i10', 'acceptance-records-v3')
const ledgerPath = path.join(evidenceRoot, 'ledger.json')
const legacyLedgerPath = path.join(root, '.data', 'evidence', 'i10', 'acceptance-records-v2', 'ledger.json')
const CASES = ['L1', 'L2', 'L3', 'M1', 'M2', 'M3', 'H1', 'H2', 'H3']
const VARIANTS = ['TEXT_ONLY', 'TEXT_WITH_IMAGE']
const CHECKPOINT_STAGES = Object.freeze([
  'SCENARIO_PREPARED',
  'FLOWISE_TERMINAL_RECEIVED',
  'FAILED_RECOVERABLE'
])

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, filePath)
}

function emptyLedger(identity = currentReleaseIdentity({ requireDeployed: false })) {
  return {
    schemaVersion: 'hengzhun-i10-acceptance-ledger-v3',
    createdAt: new Date().toISOString(),
    releaseIdentity: identity,
    records: {},
    checkpoints: {},
    // Checkpoints are mutable only while their exact published Flowise release
    // remains current.  Retain superseded, non-terminal attempts separately
    // so a repaired Agentflow can be re-run without overwriting evidence from
    // the earlier release or being blocked by its stale checkpoint key.
    historicalCheckpoints: []
  }
}

function readLedger(identity = currentReleaseIdentity({ requireDeployed: false })) {
  if (!fs.existsSync(ledgerPath)) return emptyLedger(identity)
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  if (ledger.schemaVersion !== 'hengzhun-i10-acceptance-ledger-v3' || !ledger.records || !ledger.checkpoints) {
    throw new Error('I10_ACCEPTANCE_LEDGER_V3_INVALID')
  }
  if (!Array.isArray(ledger.historicalCheckpoints)) ledger.historicalCheckpoints = []
  return ledger
}

function writeLedger(ledger) {
  ledger.updatedAt = new Date().toISOString()
  atomicWrite(ledgerPath, ledger)
}

function key(caseId, variant, attempt = 1) {
  if (!CASES.includes(caseId) || !VARIANTS.includes(variant) || !Number.isInteger(attempt) || attempt < 1) {
    throw new Error('I10_ACCEPTANCE_RECORD_KEY_INVALID')
  }
  return `${caseId}:${variant}:${attempt}`
}

function writeCheckpoint({ caseId, variant, attempt = 1, stage, references = {}, runDirectory, releaseIdentity = currentReleaseIdentity({ requireDeployed: false }) }) {
  if (!CHECKPOINT_STAGES.includes(stage) || !runDirectory) throw new Error('I10_ACCEPTANCE_CHECKPOINT_INCOMPLETE')
  const ledger = readLedger(releaseIdentity)
  const recordKey = key(caseId, variant, attempt)
  let existing = ledger.checkpoints[recordKey]
  if (existing) {
    if (!sameReleaseIdentity(existing.releaseIdentity, releaseIdentity)) {
      // A source/published-flow change invalidates a non-terminal checkpoint.
      // It is not safe to continue it in place, but it is safe to begin a new
      // run against the new release.  Archive rather than overwrite so audit
      // evidence retains the exact old release identity and failure state.
      ledger.historicalCheckpoints.push({
        ...existing,
        status: 'HISTORICAL_STALE',
        historicalReason: 'RELEASE_IDENTITY_CHANGED',
        supersededAt: new Date().toISOString(),
        supersededByReleaseIdentity: releaseIdentity
      })
      delete ledger.checkpoints[recordKey]
      existing = null
    }
  }
  if (existing) {
    if (existing.runDirectory !== runDirectory) {
      // A new directory is safe only when the previous failure was proved to
      // occur before any Harness/worker side effect.  Never infer that from a
      // generic transport error: those runs must stay in their original
      // directory and use the explicit recovery path.
      const safeRestart = existing.stage === 'FAILED_RECOVERABLE' &&
        existing.references?.retryDisposition === 'NO_SIDE_EFFECT_CONFIRMED' &&
        stage === 'SCENARIO_PREPARED'
      if (!safeRestart) throw new Error('I10_ACCEPTANCE_CHECKPOINT_RUN_DIRECTORY_MISMATCH')
    }
    const existingIndex = CHECKPOINT_STAGES.indexOf(existing.stage)
    const requestedIndex = CHECKPOINT_STAGES.indexOf(stage)
    // A successful response must not be replayed as a fresh scenario merely
    // because a user reruns a launcher.  Recovery can only advance the same
    // immutable run directory or retain a recoverable failure marker.
    if (existingIndex > requestedIndex && !(existing.stage === 'FAILED_RECOVERABLE' && stage === 'SCENARIO_PREPARED')) {
      throw new Error('I10_ACCEPTANCE_CHECKPOINT_REGRESSION_FORBIDDEN')
    }
  }
  ledger.checkpoints[recordKey] = {
    schemaVersion: 'hengzhun-i10-acceptance-checkpoint-v1',
    recordKey,
    releaseIdentity,
    stage,
    references,
    runDirectory,
    updatedAt: new Date().toISOString()
  }
  writeLedger(ledger)
  return ledger.checkpoints[recordKey]
}

function recordTerminal(record) {
  const required = ['caseId', 'variant', 'attempt', 'releaseIdentity', 'runDirectory', 'scriptHash', 'stabilityCertificateId', 'activationDecision', 'execution', 'resultInboxId', 'terminalArtifactId', 'runResultPath']
  if (required.some(name => record[name] === undefined || record[name] === null || record[name] === '')) {
    const missing = required.filter(name => record[name] === undefined || record[name] === null || record[name] === '')
    throw new Error(`I10_ACCEPTANCE_RECORD_V3_INCOMPLETE:${missing.join(',')}`)
  }
  const currentIdentity = currentReleaseIdentity()
  if (!sameReleaseIdentity(record.releaseIdentity, currentIdentity)) throw new Error('I10_ACCEPTANCE_RECORD_RELEASE_IDENTITY_STALE')
  if (!fs.existsSync(path.resolve(root, record.runResultPath))) throw new Error('I10_ACCEPTANCE_RECORD_RUN_RESULT_MISSING')
  const ledger = readLedger(record.releaseIdentity)
  const recordKey = key(record.caseId, record.variant, record.attempt)
  const cached = ledger.records[recordKey]
  if (cached?.status === 'PASSED' && sameReleaseIdentity(cached.releaseIdentity, record.releaseIdentity)) {
    // Terminal evidence is immutable for its release identity.  Returning a
    // cached successful record prevents a second launcher run from replacing
    // a script hash, certificate, or result inbox reference.  A PASSED record
    // and a pending checkpoint for the same key contradict each other (the
    // checkpoint was written by a failure that happened after the record
    // landed), so the checkpoint is retired together with the cached record.
    delete ledger.checkpoints[recordKey]
    writeLedger(ledger)
    return cached
  }
  if (cached?.status === 'PASSED') {
    // A PASSED record from an older release identity must never block the
    // current identity's terminal evidence: archive it read-only instead of
    // silently discarding the new run.
    ledger.historicalRecords = Array.isArray(ledger.historicalRecords) ? ledger.historicalRecords : []
    ledger.historicalRecords.push({
      ...cached,
      status: 'HISTORICAL_STALE',
      historicalReason: 'RELEASE_IDENTITY_CHANGED',
      supersededAt: new Date().toISOString(),
      supersededByReleaseIdentity: record.releaseIdentity
    })
    delete ledger.records[recordKey]
  }
  const persisted = {
    schemaVersion: 'hengzhun-i10-acceptance-record-v3',
    ...record,
    recordId: record.recordId || `acceptance_${crypto.randomUUID()}`,
    status: record.status || 'PASSED',
    completedAt: new Date().toISOString()
  }
  ledger.records[recordKey] = persisted
  delete ledger.checkpoints[recordKey]
  writeLedger(ledger)
  return persisted
}

function existingTerminal(caseId, variant, attempt = 1, identity = currentReleaseIdentity({ requireDeployed: false })) {
  const ledger = readLedger(identity)
  const record = ledger.records[key(caseId, variant, attempt)]
  return record?.status === 'PASSED' && sameReleaseIdentity(record.releaseIdentity, identity) ? record : null
}

function currentRecords(ledger = readLedger(), identity = currentReleaseIdentity({ requireDeployed: false })) {
  return Object.values(ledger.records).filter(record => record.status === 'PASSED' && sameReleaseIdentity(record.releaseIdentity, identity))
}

function status() {
  const identity = currentReleaseIdentity({ requireDeployed: false })
  const ledger = readLedger(identity)
  const current = currentRecords(ledger, identity)
  const historical = Object.values(ledger.records).filter(record => record.status === 'HISTORICAL_STALE' || !sameReleaseIdentity(record.releaseIdentity, identity))
  const archived = Array.isArray(ledger.historicalRecords) ? ledger.historicalRecords.length : 0
  return { schemaVersion: ledger.schemaVersion, releaseIdentity: identity, currentPassed: current.length, required: 18, historicalStale: historical.length + archived, checkpoints: Object.keys(ledger.checkpoints).length }
}

function migrateLegacyV2() {
  const identity = currentReleaseIdentity({ requireDeployed: false })
  const ledger = readLedger(identity)
  if (!fs.existsSync(legacyLedgerPath)) return { migrated: 0, reason: 'LEGACY_LEDGER_MISSING' }
  const legacy = JSON.parse(fs.readFileSync(legacyLedgerPath, 'utf8'))
  if (legacy.schemaVersion !== 'hengzhun-i10-acceptance-ledger-v2' || !legacy.records || typeof legacy.records !== 'object') {
    throw new Error('I10_ACCEPTANCE_LEGACY_LEDGER_INVALID')
  }
  let migrated = 0
  for (const [legacyKey, record] of Object.entries(legacy.records)) {
    const [caseId, variant] = legacyKey.split(':')
    if (!CASES.includes(caseId) || !VARIANTS.includes(variant)) continue
    const recordKey = key(caseId, variant, 1)
    if (ledger.records[recordKey]?.status === 'HISTORICAL_STALE') continue
    ledger.records[recordKey] = {
      schemaVersion: 'hengzhun-i10-acceptance-record-v3',
      recordId: `historical_${crypto.randomUUID()}`,
      caseId,
      variant,
      attempt: 1,
      status: 'HISTORICAL_STALE',
      historicalReason: 'RELEASE_IDENTITY_CHANGED',
      legacyRecordPath: path.relative(root, legacyLedgerPath).replaceAll('\\', '/'),
      legacyRecordId: record.recordId || null,
      legacyFlowId: record.flowId || null,
      legacyFlowVersion: record.flowVersion || null,
      legacyFlowHash: record.flowHash || null,
      legacyCompletedAt: record.completedAt || null,
      releaseIdentity: identity,
      migratedAt: new Date().toISOString()
    }
    migrated += 1
  }
  writeLedger(ledger)
  return { migrated, legacyRecords: Object.keys(legacy.records).length, ledgerPath: path.relative(root, ledgerPath).replaceAll('\\', '/') }
}

module.exports = { root, evidenceRoot, ledgerPath, CASES, VARIANTS, CHECKPOINT_STAGES, atomicWrite, emptyLedger, readLedger, writeLedger, key, writeCheckpoint, recordTerminal, existingTerminal, currentRecords, status, migrateLegacyV2 }
if (require.main === module) {
  const command = process.argv[2] || 'status'
  if (command === 'status') process.stdout.write(`${JSON.stringify(status(), null, 2)}\n`)
  else if (command === 'migrate-v2') process.stdout.write(`${JSON.stringify(migrateLegacyV2(), null, 2)}\n`)
  else throw new Error('I10_ACCEPTANCE_LEDGER_V3_USAGE')
}
