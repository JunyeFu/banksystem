#!/usr/bin/env node
'use strict'

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ledgerV4 = require('./i10-agent-acceptance-ledger-v4.cjs')
const lifecycle = require('./i10-agent-lifecycle.cjs')
const l1 = require('./i10-agent-l1-live.cjs')
const releaseV4 = require('./i10-release-identity-v4.cjs')
const sbom = require('./i10-agent-offline-sbom.cjs')

const productRoot = path.resolve(__dirname, '..')
const HASH = /^[a-f0-9]{64}$/
const ELIGIBILITY_SCHEMA = 'hengzhun-agent-release-eligibility/v1'
const HUMAN_DECISION_SCHEMA = 'hengzhun-agent-release-decision/v1'
const HUMAN_DECISION_AUTHORIZATION_VARIABLE = 'HENGZHUN_PROJECT_OWNER_RELEASE_DECISION'

class AgentReleaseDecisionError extends Error {
  constructor(code, details) { super(code); this.code = code; this.details = details }
}

function fail(code, details) { throw new AgentReleaseDecisionError(code, details) }
function identityHash(value, code = 'AGENT_RELEASE_IDENTITY_INVALID') {
  const hash = typeof value === 'string' ? value : value?.identityHash ?? value?.releaseIdentityHash
  if (!HASH.test(String(hash || ''))) fail(code)
  return hash
}

function currentBoundIdentity({ root = productRoot, environment = process.env } = {}) {
  const identity = releaseV4.currentReleaseIdentityV4({
    productRoot: root,
    modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment),
  })
  if (identity.releaseStatus !== 'FROZEN') fail('AGENT_RELEASE_SOURCE_UNBOUND')
  return identity
}

function verifySbomCurrent({ root = productRoot, releaseIdentityHash } = {}) {
  const expected = sbom.serialized()
  const actual = fs.readFileSync(path.join(root, 'agent-cli', 'offline-sbom.cdx.json'), 'utf8')
  if (actual !== expected) fail('AGENT_RELEASE_SBOM_STALE')
  const document = JSON.parse(actual)
  if (document?.bomFormat !== 'CycloneDX' || document.specVersion !== '1.5' || !Array.isArray(document.components)) fail('AGENT_RELEASE_SBOM_INVALID')
  return Object.freeze({
    status: 'CURRENT', releaseIdentityHash: identityHash(releaseIdentityHash),
    componentCount: document.components.length,
    sbomSha256: crypto.createHash('sha256').update(actual).digest('hex'),
  })
}

function auditOne(root, relative, runtime) {
  const result = childProcess.spawnSync(runtime.node, [runtime.npmCli, 'audit', '--omit=dev', '--audit-level=high', '--json'], {
    cwd: path.join(root, relative), encoding: 'utf8', windowsHide: true, timeout: 120_000,
  })
  let report
  try { report = JSON.parse(String(result.stdout || '')) } catch { fail('AGENT_RELEASE_AUDIT_UNAVAILABLE', { scope: relative || '.' }) }
  const counts = report?.metadata?.vulnerabilities
  if (!counts || !Number.isInteger(counts.high) || !Number.isInteger(counts.critical)) fail('AGENT_RELEASE_AUDIT_INVALID', { scope: relative || '.' })
  if (result.status !== 0 || counts.high !== 0 || counts.critical !== 0) {
    fail('AGENT_RELEASE_AUDIT_HIGH_OR_CRITICAL', { scope: relative || '.', high: counts.high, critical: counts.critical })
  }
  return Object.freeze({ scope: relative || '.', high: 0, critical: 0 })
}

function runDependencyAudits({ root = productRoot, releaseIdentityHash, now = () => new Date() } = {}) {
  const runtimeRoot = path.join(root, 'runtime', 'node-v20.20.2-win-x64')
  const runtime = { node: path.join(runtimeRoot, 'node.exe'), npmCli: path.join(runtimeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js') }
  if (!fs.existsSync(runtime.node) || !fs.existsSync(runtime.npmCli)) fail('AGENT_RELEASE_AUDIT_RUNTIME_MISSING')
  return Object.freeze({
    status: 'CURRENT', releaseIdentityHash: identityHash(releaseIdentityHash), checkedAt: now().toISOString(),
    scopes: Object.freeze(['', 'agent-cli', 'controller'].map((relative) => auditOne(root, relative, runtime))),
  })
}

async function runDpapiRestoreDrill({ root = productRoot, releaseIdentityHash, now = () => new Date() } = {}) {
  const current = identityHash(releaseIdentityHash)
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-agent-dpapi-release-'))
  const marker = `release-drill-${crypto.randomBytes(16).toString('hex')}`
  const sessionId = `session-${crypto.randomBytes(16).toString('hex')}`
  try {
    const { EncryptedSessionStore } = await import(pathToFileURL(path.join(root, 'controller', 'src', 'session-store.mjs')).href)
    const first = await new EncryptedSessionStore({ root: temporaryRoot }).initialize()
    await first.create({
      sessionId, namespace: 'release-gate', threadId: 'dpapi-restart-drill', journeyId: 'journey-release-gate',
      releaseIdentityHash: current, events: [{ type: 'DPAPI_RESTORE_DRILL', marker }],
    })
    const envelope = fs.readFileSync(path.join(temporaryRoot, `${sessionId}.hzs`), 'utf8')
    if (envelope.includes(marker) || JSON.parse(envelope).cipher !== 'WINDOWS_DPAPI_CURRENT_USER') fail('AGENT_RELEASE_DPAPI_PLAINTEXT_LEAK')
    const restarted = await new EncryptedSessionStore({ root: temporaryRoot }).initialize()
    const restored = await restarted.load(sessionId, { expectedReleaseIdentityHash: current })
    if (restored?.events?.[0]?.marker !== marker || restored.releaseIdentityHash !== current) fail('AGENT_RELEASE_DPAPI_RESTORE_MISMATCH')
    return Object.freeze({ status: 'RESTORED', releaseIdentityHash: current, checkedAt: now().toISOString(), cipher: 'WINDOWS_DPAPI_CURRENT_USER' })
  } catch (error) {
    if (error instanceof AgentReleaseDecisionError) throw error
    fail(error?.code === 'SESSION_DPAPI_PLATFORM_UNSUPPORTED' ? 'AGENT_RELEASE_DPAPI_PLATFORM_UNSUPPORTED' : 'AGENT_RELEASE_DPAPI_RESTORE_FAILED')
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function notReady(identity, ledger, failureCode, gates = {}, executionPerformed = false) {
  return Object.freeze({
    schemaVersion: ELIGIBILITY_SCHEMA, state: 'NOT_READY', releaseIdentityHash: identity?.identityHash || null,
    currentPassed: ledger?.currentPassed || 0, required: 18, machineGatesReady: false, failureCode,
    gates: Object.freeze({ ...gates }), executionPerformed,
  })
}

function assertGateIdentity(result, expected, code) {
  if (result?.status === undefined || identityHash(result, code) !== expected) fail(code)
  return result
}

function decisionPaths(root = productRoot, releaseIdentityHash) {
  const current = identityHash(releaseIdentityHash)
  const evidenceRoot = path.join(root, '.data', 'evidence', 'agent-v4')
  return Object.freeze({
    eligibilityFile: path.join(evidenceRoot, 'release-eligibility', `${current}.json`),
    decisionFile: path.join(evidenceRoot, 'release-decisions', `${current}.json`),
    acceptanceRef: '.data/evidence/agent-v4/acceptance/ledger.json',
    coldRollbackRef: `.data/evidence/flowise-cold-rollback-v1/${current}.json`,
    eligibilityRef: `.data/evidence/agent-v4/release-eligibility/${current}.json`,
  })
}

function writeJsonExclusive(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  try { fs.linkSync(temporary, target) } finally { fs.rmSync(temporary, { force: true }) }
}

function validateHumanDecision(value, expectedReleaseIdentity) {
  const paths = decisionPaths(productRoot, expectedReleaseIdentity)
  if (value?.schemaVersion !== HUMAN_DECISION_SCHEMA || value.releaseIdentityHash !== expectedReleaseIdentity ||
      !['GO', 'NO_GO'].includes(value.decision) || value.actor !== 'project-owner' ||
      !/^decision_[a-f0-9]{32}$/.test(String(value.decisionId || '')) || !HASH.test(String(value.eligibilityHash || '')) ||
      !Number.isFinite(Date.parse(value.decidedAt)) || JSON.stringify(value.evidenceRefs) !== JSON.stringify([
        paths.acceptanceRef, paths.coldRollbackRef, paths.eligibilityRef,
      ])) fail('AGENT_RELEASE_HUMAN_DECISION_INVALID')
  return Object.freeze({ ...value, evidenceRefs: Object.freeze([...value.evidenceRefs]) })
}

async function evaluateReleaseEligibility({ root = productRoot, environment = process.env, deps = {} } = {}) {
  let identity
  try { identity = (deps.currentIdentity || currentBoundIdentity)({ root, environment }) } catch (error) {
    return notReady(null, null, error.code || 'AGENT_RELEASE_SOURCE_UNBOUND', { sourceIdentity: 'FAILED' })
  }
  if (identity.releaseStatus !== 'FROZEN') return notReady(identity, null, 'AGENT_RELEASE_SOURCE_UNBOUND', { sourceIdentity: 'FAILED' })
  const current = identityHash(identity)
  let ledger
  try { ledger = (deps.ledgerStatus || ((value) => ledgerV4.createAgentAcceptanceLedger().status(value)))(identity) } catch (error) {
    return notReady(identity, null, error.code || 'AGENT_RELEASE_LEDGER_INVALID', { sourceIdentity: 'PASSED', ledger: 'FAILED' })
  }
  const baseGates = { sourceIdentity: 'PASSED', ledger: ledger?.full18 === true && ledger.currentPassed === 18 && ledger.checkpoints === 0 ? 'PASSED' : 'FAILED' }
  if (ledger?.releaseIdentityHash !== current) return notReady(identity, ledger, 'AGENT_RELEASE_LEDGER_IDENTITY_MISMATCH', baseGates)
  if (ledger?.full18 !== true || ledger.currentPassed !== 18 || ledger.required !== 18) return notReady(identity, ledger, 'AGENT_RELEASE_LEDGER_INCOMPLETE', baseGates)
  if (ledger.checkpoints !== 0) return notReady(identity, ledger, 'AGENT_RELEASE_CHECKPOINTS_REMAIN', baseGates)

  const gates = { ...baseGates }
  try {
    const readback = (deps.publicReadback || l1.publicVersionReadback)({ root, environment })
    if (identityHash(readback, 'AGENT_RELEASE_PUBLIC_READBACK_INVALID') !== current || readback.runtime !== 'CONTROLLER_V2_BOUND') fail('AGENT_RELEASE_PUBLIC_READBACK_MISMATCH')
    gates.publicReadback = 'PASSED'
    const sbomResult = assertGateIdentity(await (deps.verifySbom || verifySbomCurrent)({ root, releaseIdentityHash: current }), current, 'AGENT_RELEASE_SBOM_IDENTITY_MISMATCH')
    if (sbomResult.status !== 'CURRENT') fail('AGENT_RELEASE_SBOM_STALE')
    gates.sbom = 'PASSED'
    const auditResult = assertGateIdentity(await (deps.runAudits || runDependencyAudits)({ root, releaseIdentityHash: current }), current, 'AGENT_RELEASE_AUDIT_IDENTITY_MISMATCH')
    if (auditResult.status !== 'CURRENT') fail('AGENT_RELEASE_AUDIT_NOT_CURRENT')
    gates.dependencyAudit = 'PASSED'
    const dpapiResult = assertGateIdentity(await (deps.runDpapiDrill || runDpapiRestoreDrill)({ root, releaseIdentityHash: current }), current, 'AGENT_RELEASE_DPAPI_IDENTITY_MISMATCH')
    if (dpapiResult.status !== 'RESTORED' || dpapiResult.cipher !== 'WINDOWS_DPAPI_CURRENT_USER') fail('AGENT_RELEASE_DPAPI_RESTORE_FAILED')
    gates.dpapiRestore = 'PASSED'
  } catch (error) {
    return notReady(identity, ledger, error.code || 'AGENT_RELEASE_GATE_FAILED', gates, true)
  }

  let coldRollback
  try {
    coldRollback = await (deps.readColdRollback || ((value) => lifecycle.readColdRollbackEvidence(root, value)))(current)
    if (coldRollback) lifecycle.validateColdRollbackEvidence(coldRollback, current)
  } catch (error) {
    return Object.freeze({
      schemaVersion: ELIGIBILITY_SCHEMA, state: 'NOT_READY', releaseIdentityHash: current,
      currentPassed: 18, required: 18, machineGatesReady: true, nextGate: 'COLD_ROLLBACK',
      failureCode: error.code || 'AGENT_RELEASE_COLD_ROLLBACK_EVIDENCE_INVALID',
      gates: Object.freeze({ ...gates, coldRollback: 'FAILED', humanDecision: 'PENDING' }), executionPerformed: true,
    })
  }
  if (!coldRollback) return Object.freeze({
    schemaVersion: ELIGIBILITY_SCHEMA, state: 'NOT_READY', releaseIdentityHash: current,
    currentPassed: 18, required: 18, machineGatesReady: true, nextGate: 'COLD_ROLLBACK',
    failureCode: 'AGENT_RELEASE_COLD_ROLLBACK_REQUIRED', gates: Object.freeze({ ...gates, coldRollback: 'PENDING', humanDecision: 'PENDING' }),
    executionPerformed: true,
  })
  gates.coldRollback = 'PASSED'
  try {
    const finalReadback = (deps.finalPublicReadback || deps.publicReadback || l1.publicVersionReadback)({ root, environment })
    if (identityHash(finalReadback, 'AGENT_RELEASE_FINAL_READBACK_INVALID') !== current || finalReadback.runtime !== 'CONTROLLER_V2_BOUND') {
      fail('AGENT_RELEASE_FINAL_READBACK_MISMATCH')
    }
    gates.finalPublicReadback = 'PASSED'
  } catch (error) {
    return notReady(identity, ledger, error.code || 'AGENT_RELEASE_FINAL_READBACK_FAILED', { ...gates, humanDecision: 'PENDING' }, true)
  }
  return Object.freeze({
    schemaVersion: ELIGIBILITY_SCHEMA, state: 'ELIGIBLE_FOR_HUMAN_DECISION', releaseIdentityHash: current,
    currentPassed: 18, required: 18, machineGatesReady: true, nextGate: 'HUMAN_DECISION',
    gates: Object.freeze({ ...gates, humanDecision: 'PENDING' }), executionPerformed: true,
  })
}

async function recordHumanDecision({
  root = productRoot, environment = process.env, decision, expectedReleaseIdentity, authorizationValue,
  deps = {}, now = () => new Date(),
} = {}) {
  const normalizedDecision = String(decision || '').toUpperCase()
  const expected = identityHash(expectedReleaseIdentity, 'AGENT_RELEASE_HUMAN_IDENTITY_INVALID')
  if (!['GO', 'NO_GO'].includes(normalizedDecision)) fail('AGENT_RELEASE_HUMAN_DECISION_INVALID')
  const supplied = authorizationValue ?? environment[HUMAN_DECISION_AUTHORIZATION_VARIABLE]
  if (supplied !== `${normalizedDecision}:${expected}`) fail('AGENT_RELEASE_HUMAN_DECISION_NOT_AUTHORIZED')
  const eligibility = await (deps.evaluateEligibility || evaluateReleaseEligibility)({ root, environment, deps: deps.eligibilityDeps || {} })
  if (eligibility?.state !== 'ELIGIBLE_FOR_HUMAN_DECISION' || eligibility.releaseIdentityHash !== expected) {
    fail('AGENT_RELEASE_NOT_ELIGIBLE_FOR_HUMAN_DECISION')
  }
  const eligibilityHash = releaseV4.canonicalHash(eligibility)
  const paths = decisionPaths(root, expected)
  const readJson = deps.readJson || ((target) => fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null)
  const existing = readJson(paths.decisionFile)
  if (existing) {
    const validated = validateHumanDecision(existing, expected)
    if (validated.decision !== normalizedDecision || validated.eligibilityHash !== eligibilityHash) fail('AGENT_RELEASE_HUMAN_DECISION_IMMUTABLE')
    return validated
  }
  const write = deps.writeJson || writeJsonExclusive
  const eligibilityRecord = Object.freeze({ ...eligibility, eligibilityHash, recordedAt: now().toISOString() })
  const existingEligibility = readJson(paths.eligibilityFile)
  if (existingEligibility && (existingEligibility.eligibilityHash !== eligibilityHash || existingEligibility.releaseIdentityHash !== expected ||
      existingEligibility.state !== 'ELIGIBLE_FOR_HUMAN_DECISION')) {
    fail('AGENT_RELEASE_ELIGIBILITY_IMMUTABLE')
  }
  if (!existingEligibility) write(paths.eligibilityFile, eligibilityRecord)
  const basis = {
    schemaVersion: HUMAN_DECISION_SCHEMA, releaseIdentityHash: expected, decision: normalizedDecision, actor: 'project-owner',
    eligibilityHash, evidenceRefs: [paths.acceptanceRef, paths.coldRollbackRef, paths.eligibilityRef], decidedAt: now().toISOString(),
  }
  const record = validateHumanDecision({ ...basis, decisionId: `decision_${releaseV4.canonicalHash(basis).slice(0, 32)}` }, expected)
  write(paths.decisionFile, record)
  return record
}

if (require.main === module) {
  const environment = lifecycle.environmentWithRuntimeFile()
  const command = process.argv[2] || 'status'
  const operation = command === 'status' ? evaluateReleaseEligibility({ environment })
    : command === 'record' ? recordHumanDecision({
      environment, decision: process.argv[3], expectedReleaseIdentity: process.argv[4],
    }) : Promise.reject(new AgentReleaseDecisionError('AGENT_RELEASE_DECISION_COMMAND_INVALID'))
  operation.then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (command === 'status' && result.state !== 'ELIGIBLE_FOR_HUMAN_DECISION') process.exitCode = 3
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'AGENT_RELEASE_DECISION_FAILED' })}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  AgentReleaseDecisionError, ELIGIBILITY_SCHEMA, HUMAN_DECISION_AUTHORIZATION_VARIABLE, HUMAN_DECISION_SCHEMA,
  currentBoundIdentity, decisionPaths, evaluateReleaseEligibility, recordHumanDecision,
  runDependencyAudits, runDpapiRestoreDrill, validateHumanDecision, verifySbomCurrent,
}
