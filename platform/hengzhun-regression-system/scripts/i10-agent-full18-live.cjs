#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ledgerV4 = require('./i10-agent-acceptance-ledger-v4.cjs')
const lifecycle = require('./i10-agent-lifecycle.cjs')
const l1 = require('./i10-agent-l1-live.cjs')

const productRoot = path.resolve(__dirname, '..')
const CHAIN_ORDER = Object.freeze(ledgerV4.CASES.flatMap((caseId) => ledgerV4.VARIANTS.map((variant) => Object.freeze({ caseId, variant }))))
const L1_KEYS = Object.freeze(['L1:TEXT_ONLY', 'L1:TEXT_WITH_IMAGE'])
const ON_DEMAND_CASES = new Set(['L1', 'L2', 'L3'])
const HASH = /^[a-f0-9]{64}$/

class AgentFull18Error extends Error {
  constructor(code, details) { super(code); this.code = code; this.details = details }
}

function fail(code, details) { throw new AgentFull18Error(code, details) }
function chainLabel(chain) { return `${chain.caseId}:${chain.variant}` }

function exactBoundIdentity(value) {
  try { ledgerV4.frozenIdentityHash(value) } catch { fail('AGENT_FULL18_BOUND_IDENTITY_REQUIRED') }
  return value
}

function parseJsonLines(value) {
  try { return String(value || '').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) }
  catch { fail('AGENT_FULL18_CLI_OUTPUT_INVALID') }
}

function readManagedSpec(root = productRoot) {
  return JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'managed-process-spec-v1.json'), 'utf8'))
}

function spawnHeadless({ root = productRoot, environment = process.env, args }) {
  const spec = readManagedSpec(root)
  const result = childProcess.spawnSync(path.resolve(root, spec.interactive.executable), [path.resolve(root, spec.interactive.entrypoint), ...args], {
    cwd: root, env: environment, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  })
  return { exitCode: result.status, events: parseJsonLines(result.stdout) }
}

function classifyInvocation(value) {
  const terminal = value?.events?.at(-1)
  if (value?.exitCode === 20 && terminal?.type === 'APPROVAL_REQUIRED') {
    return Object.freeze({
      status: 'AWAITING_APPROVAL', sessionId: terminal.sessionId, journeyId: terminal.journeyId,
      proposalId: terminal.proposal?.proposalId, contentHash: terminal.proposal?.contentHash,
      risk: terminal.proposal?.risk, expiresAt: terminal.proposal?.expiresAt,
    })
  }
  if (value?.exitCode === 0 && terminal?.type === 'RESPONSE' && terminal.status === 'COMPLETED') {
    return Object.freeze({ status: 'COMPLETED', sessionId: terminal.sessionId, journeyId: terminal.journeyId })
  }
  if (value?.exitCode === 21 && terminal?.type === 'COMMAND_RESULT') return Object.freeze({ status: 'REJECTED' })
  fail('AGENT_FULL18_CHAIN_EXECUTION_FAILED', {
    exitCode: Number.isInteger(value?.exitCode) ? value.exitCode : null,
    terminalType: terminal?.type || null, messageCode: terminal?.messageCode || null,
  })
}

function inputArguments(environment, chain) {
  const prefix = `HENGZHUN_AGENT_FULL18_${chain.caseId}_${chain.variant}`
  const inputFile = String(environment[`${prefix}_INPUT_FILE`] || '').trim()
  if (!path.isAbsolute(inputFile) || !fs.existsSync(inputFile) || !fs.statSync(inputFile).isFile()) {
    fail('AGENT_FULL18_INPUT_FILE_REQUIRED', { chain: chainLabel(chain), variable: `${prefix}_INPUT_FILE` })
  }
  const args = ['run', '--input-file', inputFile]
  if (chain.variant === 'TEXT_WITH_IMAGE') {
    const attachmentFile = String(environment[`${prefix}_ATTACHMENT_FILE`] || '').trim()
    if (!path.isAbsolute(attachmentFile) || !fs.existsSync(attachmentFile) || !fs.statSync(attachmentFile).isFile()) {
      fail('AGENT_FULL18_ATTACHMENT_FILE_REQUIRED', { chain: chainLabel(chain), variable: `${prefix}_ATTACHMENT_FILE` })
    }
    args.push('--attach', attachmentFile)
  }
  args.push('--jsonl')
  return args
}

function invokeStart({ root, environment, chain }) {
  return classifyInvocation(spawnHeadless({ root, environment, args: inputArguments(environment, chain) }))
}

function invokeDecision({ root, environment, sessionId, proposalId, approved }) {
  return classifyInvocation(spawnHeadless({
    root, environment,
    args: ['resume', sessionId, approved ? '--approve' : '--reject', '--proposal', proposalId, '--jsonl'],
  }))
}

function invokeEvidence({ root, environment, journeyId }) {
  const value = spawnHeadless({ root, environment, args: ['evidence', journeyId] })
  const terminal = value.events.at(-1)
  if (value.exitCode !== 0 || terminal?.type !== 'COMMAND_RESULT' || terminal.status !== 'COMPLETED') {
    fail('AGENT_FULL18_EVIDENCE_READ_FAILED')
  }
  return terminal.result
}

function requireText(value, code) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 160) fail(code)
  return value
}

function assertTerminalEvidence(value, chain, journeyId) {
  if (value?.schemaVersion !== 'hengzhun-cli-evidence-view/v1' || value.terminal !== true || value.status !== 'COMPLETED' || value.journeyId !== journeyId) {
    fail('AGENT_FULL18_JOURNEY_NOT_TERMINAL', { chain: chainLabel(chain) })
  }
  const references = value.references
  if (!references || typeof references !== 'object' || Array.isArray(references)) fail('AGENT_FULL18_AUTHORITY_REFERENCES_MISSING')
  for (const field of ['caseId', 'preparationId', 'candidateId', 'certificateId', 'scriptId', 'scriptHash', 'planId', 'confirmedDecisionEventId', 'inboxId', 'resultArtifactId']) {
    requireText(references[field], `AGENT_FULL18_${field.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase()}_MISSING`)
  }
  if (!HASH.test(references.scriptHash)) fail('AGENT_FULL18_SCRIPT_HASH_INVALID')
  if (ON_DEMAND_CASES.has(chain.caseId)) {
    requireText(references.taskId, 'AGENT_FULL18_TASK_ID_MISSING')
    requireText(references.runId, 'AGENT_FULL18_RUN_ID_MISSING')
  } else requireText(references.scheduleId, 'AGENT_FULL18_SCHEDULE_ID_MISSING')
  const artifactCards = Array.isArray(value.artifactCards) ? value.artifactCards : []
  const terminalArtifact = artifactCards.find((card) => card?.artifactId === references.resultArtifactId && HASH.test(String(card?.sha256 || '')))
  if (!terminalArtifact) fail('AGENT_FULL18_TERMINAL_ARTIFACT_MISSING')
  return Object.freeze({
    schemaVersion: value.schemaVersion, journeyId: value.journeyId, version: value.version, status: value.status,
    terminal: true, references: Object.freeze({ ...references }), artifactCards: Object.freeze(artifactCards.map((card) => Object.freeze({ ...card }))),
  })
}

function evidencePaths(root, identityHash, chain, attempt) {
  const evidenceRoot = path.join(root, '.data', 'evidence', 'agent-v4', 'chains', identityHash)
  const target = path.join(evidenceRoot, `${chain.caseId}-${chain.variant}-${attempt}.json`)
  return { evidenceRoot, target }
}

function persistChainEvidence({ root, identityHash, chain, attempt, sessionId, journeyId, evidence, now = () => new Date().toISOString() }) {
  const { target } = evidencePaths(root, identityHash, chain, attempt)
  const core = {
    schemaVersion: 'hengzhun-agent-chain-evidence/v1', releaseIdentityHash: identityHash,
    caseId: chain.caseId, variant: chain.variant, attempt, sessionId, journeyId, evidence,
  }
  let value
  if (fs.existsSync(target)) {
    try { value = JSON.parse(fs.readFileSync(target, 'utf8')) } catch { fail('AGENT_FULL18_EVIDENCE_FILE_INVALID') }
    const existingCore = { ...value }
    delete existingCore.completedAt
    if (JSON.stringify(existingCore) !== JSON.stringify(core)) fail('AGENT_FULL18_EVIDENCE_FILE_CONFLICT')
  } else {
    value = { ...core, completedAt: now() }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  }
  const bytes = fs.readFileSync(target)
  return Object.freeze({
    value, evidenceRef: path.relative(root, target).replaceAll('\\', '/'),
    evidenceHash: crypto.createHash('sha256').update(bytes).digest('hex'),
  })
}

function readTp09Evidence(root, identityHash) {
  const target = path.join(root, '.data', 'evidence', 'agent-l1', `${identityHash}.json`)
  if (!fs.existsSync(target) || fs.statSync(target).size > 64 * 1024) fail('AGENT_FULL18_TP09_L1_EVIDENCE_REQUIRED')
  let value
  try { value = JSON.parse(fs.readFileSync(target, 'utf8')) } catch { fail('AGENT_FULL18_TP09_L1_EVIDENCE_INVALID') }
  const labels = Array.isArray(value?.results) ? value.results.map((item) => `${item?.variant}:${item?.status}`) : []
  if (value?.schemaVersion !== 'hengzhun-agent-l1-evidence/v1' || value.status !== 'PASSED' || value.profile !== 'NORMAL_CLI' ||
      value.releaseIdentityHash !== identityHash || value.full18Claim !== false ||
      JSON.stringify(labels) !== JSON.stringify(['TEXT_ONLY:PASSED', 'TEXT_WITH_IMAGE:PASSED'])) {
    fail('AGENT_FULL18_TP09_L1_EVIDENCE_INVALID')
  }
  return value
}

function currentLabels(ledger, identity) {
  return new Set(ledger.currentRecords(identity).map((record) => `${record.caseId}:${record.variant}`))
}

function firstMissing(ledger, identity) {
  const present = currentLabels(ledger, identity)
  return CHAIN_ORDER.find((chain) => !present.has(chainLabel(chain))) || null
}

async function admitTp09L1({ root, environment, identity, ledger, deps }) {
  const present = currentLabels(ledger, identity)
  if (L1_KEYS.every((key) => present.has(key))) return
  const prior = (deps.readTp09Evidence || readTp09Evidence)(root, identity.identityHash)
  for (const result of prior.results) {
    const chain = { caseId: 'L1', variant: result.variant }
    if (present.has(chainLabel(chain))) continue
    const projected = assertTerminalEvidence(await (deps.invokeEvidence || invokeEvidence)({
      root, environment, journeyId: result.journeyId,
    }), chain, result.journeyId)
    const readback = await (deps.publicReadback || l1.publicVersionReadback)({ root, environment })
    l1.assertIdentity(readback, identity.identityHash, 'AGENT_FULL18_PUBLIC_IDENTITY_MISMATCH')
    const persisted = (deps.persistEvidence || persistChainEvidence)({
      root, identityHash: identity.identityHash, chain, attempt: 1,
      sessionId: result.sessionId, journeyId: result.journeyId, evidence: projected, now: deps.now,
    })
    ledger.terminalRecord({
      releaseIdentityHash: identity.identityHash, caseId: chain.caseId, variant: chain.variant, attempt: 1,
      status: 'PASSED', evidenceRef: persisted.evidenceRef, evidenceHash: persisted.evidenceHash,
      publicReadbackIdentityHash: identity.identityHash, completedAt: persisted.value.completedAt,
    }, identity)
  }
}

function approvalCheckpoint(identity, chain, step) {
  return {
    releaseIdentityHash: identity.identityHash, caseId: chain.caseId, variant: chain.variant, attempt: 1,
    status: 'AWAITING_APPROVAL', sessionId: step.sessionId, proposalId: step.proposalId,
    contentHash: step.contentHash, expiresAt: step.expiresAt,
  }
}

function validateApprovalTuple(checkpoint, { sessionId, proposalId, contentHash }) {
  if (!checkpoint || checkpoint.status !== 'AWAITING_APPROVAL' || checkpoint.sessionId !== sessionId ||
      checkpoint.proposalId !== proposalId || checkpoint.contentHash !== contentHash) {
    fail('AGENT_FULL18_APPROVAL_IDENTITY_MISMATCH')
  }
}

async function withExecutionLock(root, identityHash, action) {
  const target = path.join(root, '.data', 'runtime', `agent-full18-${identityHash}.lock`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  let descriptor
  try {
    descriptor = fs.openSync(target, 'wx')
    fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, releaseIdentityHash: identityHash, acquiredAt: new Date().toISOString() })}\n`)
  } catch { fail('AGENT_FULL18_EXECUTION_LOCKED') }
  try { return await action() }
  finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor) } catch {}
    try { fs.unlinkSync(target) } catch {}
  }
}

async function preflightFull18({ root = productRoot, environment = process.env, authorizationValue, deps = {} } = {}) {
  const identity = exactBoundIdentity((deps.authorizedIdentity || lifecycle.authorizedIdentity)({ root, environment, authorizationValue }))
  const doctor = await (deps.doctor || lifecycle.doctor)({ root })
  if (doctor?.status !== 'READY' || doctor.profile !== 'NORMAL_CLI' || doctor.flowiseAbsent !== true) fail('AGENT_FULL18_PREFLIGHT_NOT_READY')
  return Object.freeze({ status: 'READY', profile: 'NORMAL_CLI', identity })
}

async function executeFull18({
  root = productRoot, environment = process.env, authorizationValue, command = 'run',
  sessionId, proposalId, contentHash, deps = {},
} = {}) {
  if (!['run', 'approve', 'reject'].includes(command)) fail('AGENT_FULL18_COMMAND_INVALID')
  const preflight = await preflightFull18({ root, environment, authorizationValue, deps })
  const identity = preflight.identity
  const ledger = deps.ledger || ledgerV4.createAgentAcceptanceLedger()
  const lock = deps.withExecutionLock || withExecutionLock
  return lock(root, identity.identityHash, async () => {
    const checkpoints = ledger.currentCheckpoints(identity)
    if (checkpoints.length > 1) fail('AGENT_FULL18_MULTIPLE_CHECKPOINTS')
    const existing = checkpoints[0]
    if (existing?.status === 'FAILED_DETERMINISTIC') fail('AGENT_FULL18_DETERMINISTIC_FAILURE_LOCKED', { errorCode: existing.errorCode })
    if (existing?.status === 'APPROVAL_EXECUTING') fail('AGENT_FULL18_AMBIGUOUS_APPROVAL_REQUIRES_RECONCILIATION')
    if (existing?.status === 'RUNNING') fail('AGENT_FULL18_AMBIGUOUS_RUN_REQUIRES_RECONCILIATION')
    if (command === 'run' && existing) fail('AGENT_FULL18_CHECKPOINT_REQUIRES_DECISION')
    if (command !== 'run') validateApprovalTuple(existing, { sessionId, proposalId, contentHash })

    return l1.withManagedRuntime({ root, environment, authorizationValue, deps }, async (expected) => {
      if (expected !== identity.identityHash) fail('AGENT_FULL18_RELEASE_IDENTITY_MISMATCH')
      await admitTp09L1({ root, environment, identity, ledger, deps })
      if (!L1_KEYS.every((key) => currentLabels(ledger, identity).has(key))) fail('AGENT_FULL18_TP09_L1_PAIR_REQUIRED')

      let chain = command === 'run' ? firstMissing(ledger, identity) : { caseId: existing.caseId, variant: existing.variant }
      if (!chain) return Object.freeze({ status: 'ALREADY_PASSED', releaseIdentityHash: expected, currentPassed: 18, required: 18, full18: true })
      let step
      try {
        if (command === 'run') {
          ledger.writeCheckpoint({ releaseIdentityHash: expected, caseId: chain.caseId, variant: chain.variant, attempt: 1, status: 'RUNNING' }, identity)
          step = await (deps.invokeStart || invokeStart)({ root, environment, chain })
        } else {
          ledger.writeCheckpoint({ ...approvalCheckpoint(identity, chain, existing), status: 'APPROVAL_EXECUTING' }, identity)
          step = await (deps.invokeDecision || invokeDecision)({ root, environment, sessionId, proposalId, approved: command === 'approve' })
        }
        if (command === 'reject') {
          if (step.status !== 'REJECTED') fail('AGENT_FULL18_REJECTION_RESULT_INVALID')
          ledger.resolveCheckpoint({ releaseIdentityHash: expected, caseId: chain.caseId, variant: chain.variant, attempt: 1, sessionId, proposalId, contentHash }, identity)
          return Object.freeze({ status: 'REJECTED', releaseIdentityHash: expected, chain: chainLabel(chain), full18: false })
        }
        while (true) {
          if (step.status === 'AWAITING_APPROVAL') {
            ledger.writeCheckpoint(approvalCheckpoint(identity, chain, step), identity)
            return Object.freeze({
              status: 'AWAITING_APPROVAL', releaseIdentityHash: expected, chain: chainLabel(chain),
              pending: { sessionId: step.sessionId, proposalId: step.proposalId, contentHash: step.contentHash, risk: step.risk, expiresAt: step.expiresAt }, full18: false,
            })
          }
          if (step.status !== 'COMPLETED') fail('AGENT_FULL18_CHAIN_RESULT_INVALID')
          const projected = assertTerminalEvidence(await (deps.invokeEvidence || invokeEvidence)({
            root, environment, journeyId: step.journeyId,
          }), chain, step.journeyId)
          const readback = await (deps.publicReadback || l1.publicVersionReadback)({ root, environment })
          l1.assertIdentity(readback, expected, 'AGENT_FULL18_PUBLIC_IDENTITY_MISMATCH')
          const persisted = (deps.persistEvidence || persistChainEvidence)({
            root, identityHash: expected, chain, attempt: 1, sessionId: step.sessionId,
            journeyId: step.journeyId, evidence: projected, now: deps.now,
          })
          ledger.terminalRecord({
            releaseIdentityHash: expected, caseId: chain.caseId, variant: chain.variant, attempt: 1,
            status: 'PASSED', evidenceRef: persisted.evidenceRef, evidenceHash: persisted.evidenceHash,
            publicReadbackIdentityHash: expected, completedAt: persisted.value.completedAt,
          }, identity)
          chain = firstMissing(ledger, identity)
          if (!chain) return Object.freeze({ status: 'PASSED', releaseIdentityHash: expected, currentPassed: 18, required: 18, full18: true })
          ledger.writeCheckpoint({ releaseIdentityHash: expected, caseId: chain.caseId, variant: chain.variant, attempt: 1, status: 'RUNNING' }, identity)
          step = await (deps.invokeStart || invokeStart)({ root, environment, chain })
        }
      } catch (error) {
        const current = ledger.checkpoint(identity, chain.caseId, chain.variant, 1)
        if (!current || current.status !== 'FAILED_DETERMINISTIC') {
          ledger.writeCheckpoint({
            releaseIdentityHash: expected, caseId: chain.caseId, variant: chain.variant, attempt: 1,
            status: 'FAILED_DETERMINISTIC', errorCode: error.code || 'AGENT_FULL18_CHAIN_FAILED',
          }, identity)
        }
        throw error
      }
    })
  })
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const command = process.argv[2]
    const environment = lifecycle.environmentWithRuntimeFile()
    if (command === 'preflight') {
      const result = await preflightFull18({ environment })
      process.stdout.write(`${JSON.stringify({ status: result.status, profile: result.profile, releaseIdentityHash: result.identity.identityHash, executionPerformed: false })}\n`)
      return
    }
    const result = await executeFull18({
      environment, command, sessionId: process.argv[3], proposalId: process.argv[4], contentHash: process.argv[5],
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'AGENT_FULL18_FAILED' })}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  AgentFull18Error, CHAIN_ORDER, L1_KEYS, admitTp09L1, assertTerminalEvidence, chainLabel, classifyInvocation,
  executeFull18, firstMissing, inputArguments, invokeDecision, invokeEvidence, invokeStart, parseJsonLines,
  persistChainEvidence, preflightFull18, readTp09Evidence, withExecutionLock,
}
