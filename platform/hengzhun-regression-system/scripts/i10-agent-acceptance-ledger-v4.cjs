#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..')
const CASES = Object.freeze(['L1', 'L2', 'L3', 'M1', 'M2', 'M3', 'H1', 'H2', 'H3'])
const VARIANTS = Object.freeze(['TEXT_ONLY', 'TEXT_WITH_IMAGE'])
const CHECKPOINT_STATUSES = Object.freeze(['RUNNING', 'AWAITING_APPROVAL', 'APPROVAL_EXECUTING', 'FAILED_RECOVERABLE', 'FAILED_DETERMINISTIC'])
const LEDGER_SCHEMA = 'hengzhun-agent-acceptance-ledger/v4'
const RECORD_SCHEMA = 'hengzhun-agent-acceptance-record/v4'
const CHECKPOINT_SCHEMA = 'hengzhun-agent-acceptance-checkpoint/v1'

class AgentAcceptanceLedgerError extends Error {
  constructor(code, details) {
    super(code)
    this.code = code
    this.details = details
  }
}

function fail(code, details) { throw new AgentAcceptanceLedgerError(code, details) }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }

function assertExactKeys(value, allowed, code) {
  if (!isPlainObject(value)) fail(code)
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) fail(code, { unknown })
}

function identityHash(value) {
  const hash = typeof value === 'string' ? value : value?.identityHash ?? value?.releaseIdentityHash
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) fail('AGENT_V4_IDENTITY_INVALID')
  return hash
}

function frozenIdentityHash(value) {
  if (!isPlainObject(value) || value.schemaVersion !== 'hengzhun-i10-release-identity-v4' || value.releaseStatus !== 'FROZEN') {
    fail('AGENT_V4_BOUND_IDENTITY_REQUIRED')
  }
  return identityHash(value)
}

function normalizeCase(value) {
  const caseId = String(value || '').toUpperCase()
  if (!CASES.includes(caseId)) fail('AGENT_V4_CASE_INVALID')
  return caseId
}

function normalizeVariant(value) {
  const variant = String(value || '').toUpperCase()
  if (!VARIANTS.includes(variant)) fail('AGENT_V4_VARIANT_INVALID')
  return variant
}

function normalizeAttempt(value) {
  const attempt = Number(value)
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 9999) fail('AGENT_V4_ATTEMPT_INVALID')
  return attempt
}

function normalizeTimestamp(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail(code)
  return value
}

function safeEvidenceRef(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 512 || value.includes('..') ||
      path.isAbsolute(value) || value.includes('://') || /[?#:]/.test(value) || !/^(?:\.data|[A-Za-z0-9])[A-Za-z0-9._/-]*$/.test(value)) fail('AGENT_V4_EVIDENCE_REF_INVALID')
  return value
}

function safeOpaque(value, code) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 160 || !/^[A-Za-z0-9_-]+$/.test(value)) fail(code)
  return value
}

function safeErrorCode(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 96 || !/^[A-Z][A-Z0-9_]+$/.test(value)) fail('AGENT_V4_FAILURE_CODE_INVALID')
  return value
}

function recordKey(releaseIdentityHash, caseId, variant, attempt) {
  return `${identityHash(releaseIdentityHash)}:${normalizeCase(caseId)}:${normalizeVariant(variant)}:${normalizeAttempt(attempt)}`
}

function chainKey(releaseIdentityHash, caseId, variant) {
  return `${identityHash(releaseIdentityHash)}:${normalizeCase(caseId)}:${normalizeVariant(variant)}`
}

function emptyLedger(now) {
  return { schemaVersion: LEDGER_SCHEMA, createdAt: now(), records: {}, checkpoints: {} }
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  fs.renameSync(temporary, target)
}

function createAgentAcceptanceLedger({
  storageRoot = path.join(productRoot, '.data', 'evidence', 'agent-v4', 'acceptance'),
  now = () => new Date().toISOString(),
} = {}) {
  const ledgerPath = path.join(path.resolve(storageRoot), 'ledger.json')

  function read() {
    if (!fs.existsSync(ledgerPath)) return emptyLedger(now)
    let value
    try { value = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) } catch { fail('AGENT_V4_LEDGER_INVALID') }
    if (value?.schemaVersion !== LEDGER_SCHEMA || !isPlainObject(value.records) || !isPlainObject(value.checkpoints)) {
      fail(value?.schemaVersion === 'hengzhun-i10-acceptance-ledger-v3' ? 'AGENT_V3_LEDGER_IMPORT_FORBIDDEN' : 'AGENT_V4_LEDGER_INVALID')
    }
    return value
  }

  function write(value) {
    value.updatedAt = now()
    atomicWrite(ledgerPath, value)
  }

  function terminalRecord(input, currentIdentity) {
    assertExactKeys(input, ['releaseIdentityHash', 'caseId', 'variant', 'attempt', 'status', 'evidenceRef', 'evidenceHash', 'publicReadbackIdentityHash', 'completedAt'], 'AGENT_V4_RECORD_FIELDS_INVALID')
    const current = frozenIdentityHash(currentIdentity)
    const releaseIdentityHash = identityHash(input.releaseIdentityHash)
    const publicReadbackIdentityHash = identityHash(input.publicReadbackIdentityHash)
    if (releaseIdentityHash !== current || publicReadbackIdentityHash !== current) fail('AGENT_V4_RECORD_IDENTITY_MISMATCH')
    if (input.status !== 'PASSED') fail('AGENT_V4_RECORD_NOT_TERMINAL_PASS')
    const caseId = normalizeCase(input.caseId)
    const variant = normalizeVariant(input.variant)
    const attempt = normalizeAttempt(input.attempt)
    const evidenceRef = safeEvidenceRef(input.evidenceRef)
    const evidenceHash = identityHash(input.evidenceHash)
    const completedAt = normalizeTimestamp(input.completedAt || now(), 'AGENT_V4_RECORD_TIMESTAMP_INVALID')
    const key = recordKey(current, caseId, variant, attempt)
    const immutable = {
      schemaVersion: RECORD_SCHEMA, recordId: `agentv4_${sha256(`${key}\0${evidenceRef}\0${evidenceHash}`).slice(0, 32)}`,
      releaseIdentityHash: current, caseId, variant, attempt, status: 'PASSED', evidenceRef, evidenceHash,
      publicReadbackIdentityHash: current, completedAt,
    }
    const ledger = read()
    const existing = ledger.records[key]
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(immutable)) fail('AGENT_V4_TERMINAL_RECORD_IMMUTABLE')
      return existing
    }
    ledger.records[key] = immutable
    delete ledger.checkpoints[key]
    write(ledger)
    return immutable
  }

  function currentRecords(currentIdentity) {
    const current = frozenIdentityHash(currentIdentity)
    const latest = new Map()
    for (const record of Object.values(read().records)) {
      if (record?.schemaVersion !== RECORD_SCHEMA || record.status !== 'PASSED' || record.releaseIdentityHash !== current || record.publicReadbackIdentityHash !== current) continue
      const caseId = normalizeCase(record.caseId)
      const variant = normalizeVariant(record.variant)
      const attempt = normalizeAttempt(record.attempt)
      const key = `${caseId}:${variant}`
      if (!latest.has(key) || latest.get(key).attempt < attempt) latest.set(key, record)
    }
    return CASES.flatMap((caseId) => VARIANTS.map((variant) => latest.get(`${caseId}:${variant}`)).filter(Boolean))
  }

  function status(currentIdentity) {
    const releaseIdentityHash = frozenIdentityHash(currentIdentity)
    const records = currentRecords(currentIdentity)
    const ledger = read()
    const historicalStale = Object.values(ledger.records).filter((record) => record?.releaseIdentityHash !== releaseIdentityHash).length
    const checkpoints = Object.values(ledger.checkpoints).filter((item) => item?.releaseIdentityHash === releaseIdentityHash).length
    return Object.freeze({ schemaVersion: LEDGER_SCHEMA, releaseIdentityHash, currentPassed: records.length, required: 18, full18: records.length === 18, historicalStale, checkpoints })
  }

  function writeCheckpoint(input, currentIdentity) {
    assertExactKeys(input, ['releaseIdentityHash', 'caseId', 'variant', 'attempt', 'status', 'sessionId', 'proposalId', 'contentHash', 'expiresAt', 'errorCode'], 'AGENT_V4_CHECKPOINT_FIELDS_INVALID')
    const current = frozenIdentityHash(currentIdentity)
    const releaseIdentityHash = identityHash(input.releaseIdentityHash)
    if (releaseIdentityHash !== current) fail('AGENT_V4_CHECKPOINT_IDENTITY_MISMATCH')
    const caseId = normalizeCase(input.caseId)
    const variant = normalizeVariant(input.variant)
    const attempt = normalizeAttempt(input.attempt)
    if (!CHECKPOINT_STATUSES.includes(input.status)) fail('AGENT_V4_CHECKPOINT_STATUS_INVALID')
    const checkpoint = {
      schemaVersion: CHECKPOINT_SCHEMA, releaseIdentityHash: current, caseId, variant, attempt,
      status: input.status, updatedAt: normalizeTimestamp(now(), 'AGENT_V4_CHECKPOINT_TIMESTAMP_INVALID'),
    }
    if (['AWAITING_APPROVAL', 'APPROVAL_EXECUTING'].includes(input.status)) {
      checkpoint.sessionId = safeOpaque(input.sessionId, 'AGENT_V4_SESSION_ID_INVALID')
      checkpoint.proposalId = safeOpaque(input.proposalId, 'AGENT_V4_PROPOSAL_ID_INVALID')
      checkpoint.contentHash = identityHash(input.contentHash)
      checkpoint.expiresAt = normalizeTimestamp(input.expiresAt, 'AGENT_V4_APPROVAL_EXPIRY_INVALID')
    } else if (['FAILED_RECOVERABLE', 'FAILED_DETERMINISTIC'].includes(input.status)) {
      checkpoint.errorCode = safeErrorCode(input.errorCode)
    } else if ([input.sessionId, input.proposalId, input.contentHash, input.expiresAt, input.errorCode].some((value) => value !== undefined)) {
      fail('AGENT_V4_CHECKPOINT_FIELDS_INVALID')
    }
    const ledger = read()
    const key = recordKey(current, caseId, variant, attempt)
    if (ledger.records[key]) fail('AGENT_V4_TERMINAL_CHECKPOINT_FORBIDDEN')
    ledger.checkpoints[key] = checkpoint
    write(ledger)
    return checkpoint
  }

  function checkpoint(currentIdentity, caseId, variant, attempt = 1) {
    return read().checkpoints[recordKey(frozenIdentityHash(currentIdentity), caseId, variant, attempt)] || null
  }

  function currentCheckpoints(currentIdentity) {
    const current = frozenIdentityHash(currentIdentity)
    return Object.values(read().checkpoints)
      .filter((item) => item?.releaseIdentityHash === current)
      .sort((left, right) => {
        const leftOrder = CASES.indexOf(left.caseId) * VARIANTS.length + VARIANTS.indexOf(left.variant)
        const rightOrder = CASES.indexOf(right.caseId) * VARIANTS.length + VARIANTS.indexOf(right.variant)
        return leftOrder - rightOrder || left.attempt - right.attempt
      })
  }

  function resolveCheckpoint(input, currentIdentity) {
    assertExactKeys(input, ['releaseIdentityHash', 'caseId', 'variant', 'attempt', 'sessionId', 'proposalId', 'contentHash'], 'AGENT_V4_CHECKPOINT_RESOLUTION_INVALID')
    const current = frozenIdentityHash(currentIdentity)
    if (identityHash(input.releaseIdentityHash) !== current) fail('AGENT_V4_CHECKPOINT_IDENTITY_MISMATCH')
    const key = recordKey(current, input.caseId, input.variant, input.attempt)
    const ledger = read()
    const existing = ledger.checkpoints[key]
    if (!existing) fail('AGENT_V4_CHECKPOINT_NOT_FOUND')
    if (['AWAITING_APPROVAL', 'APPROVAL_EXECUTING'].includes(existing.status) && (
      existing.sessionId !== input.sessionId || existing.proposalId !== input.proposalId || existing.contentHash !== input.contentHash
    )) fail('AGENT_V4_CHECKPOINT_RESOLUTION_MISMATCH')
    delete ledger.checkpoints[key]
    write(ledger)
    return existing
  }

  return Object.freeze({ ledgerPath, read, terminalRecord, currentRecords, status, writeCheckpoint, checkpoint, currentCheckpoints, resolveCheckpoint })
}

if (require.main === module) {
  try {
    if (process.argv[2] !== 'status') fail('AGENT_V4_LEDGER_COMMAND_INVALID')
    const releaseV4 = require('./i10-release-identity-v4.cjs')
    const identity = releaseV4.currentReleaseIdentityV4({ productRoot })
    if (identity.releaseStatus !== 'FROZEN') {
      process.stdout.write(`${JSON.stringify({ schemaVersion: LEDGER_SCHEMA, status: 'SOURCE_UNBOUND', releaseIdentityHash: identity.identityHash, currentPassed: 0, required: 18, full18: false })}\n`)
    } else process.stdout.write(`${JSON.stringify(createAgentAcceptanceLedger().status(identity))}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'AGENT_V4_LEDGER_FAILED' })}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  AgentAcceptanceLedgerError, CASES, VARIANTS, CHECKPOINT_STATUSES, LEDGER_SCHEMA, RECORD_SCHEMA, CHECKPOINT_SCHEMA,
  chainKey, createAgentAcceptanceLedger, frozenIdentityHash, identityHash, normalizeAttempt, normalizeCase, normalizeVariant, recordKey,
}
