#!/usr/bin/env node
'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const lifecycle = require('./i10-agent-lifecycle.cjs')
const releaseV4 = require('./i10-release-identity-v4.cjs')

const productRoot = path.resolve(__dirname, '..')
const VARIANTS = Object.freeze(['TEXT_ONLY', 'TEXT_WITH_IMAGE'])

class AgentL1Error extends Error {
  constructor(code, details) { super(code); this.code = code; this.details = details }
}

function assertIdentity(value, expected, code = 'AGENT_L1_RELEASE_IDENTITY_MISMATCH') {
  const actual = typeof value === 'string' ? value : value?.identityHash ?? value?.releaseIdentityHash
  if (actual !== expected) throw new AgentL1Error(code, { expected, actual: actual || null })
  return actual
}

function boundIdentity({ root = productRoot, environment = process.env } = {}) {
  return releaseV4.currentReleaseIdentityV4({
    productRoot: root,
    modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment),
  })
}

function parseJsonLines(value) {
  const lines = String(value || '').split(/\r?\n/).filter(Boolean)
  try { return lines.map((line) => JSON.parse(line)) } catch { throw new AgentL1Error('AGENT_L1_PUBLIC_READBACK_INVALID') }
}

function publicVersionReadback({ root = productRoot, environment = process.env } = {}) {
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'managed-process-spec-v1.json'), 'utf8'))
  const result = childProcess.spawnSync(path.resolve(root, spec.interactive.executable), [path.resolve(root, spec.interactive.entrypoint), 'version'], {
    cwd: root, env: environment, encoding: 'utf8', windowsHide: true,
  })
  if (result.status !== 0) throw new AgentL1Error('AGENT_L1_PUBLIC_READBACK_FAILED')
  const event = parseJsonLines(result.stdout).findLast((item) => item?.type === 'COMMAND_RESULT')
  if (event?.result?.runtime !== 'CONTROLLER_V2_BOUND') throw new AgentL1Error('AGENT_L1_PUBLIC_READBACK_UNBOUND')
  return event.result
}

function checkpointPaths(root = productRoot) {
  return Object.freeze({
    stateFile: path.join(root, '.data', 'runtime', 'agent-l1-state.json'),
    evidenceRoot: path.join(root, '.data', 'evidence', 'agent-l1'),
  })
}

function writeJsonAtomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

function readCheckpoint(root = productRoot) {
  const { stateFile } = checkpointPaths(root)
  if (!fs.existsSync(stateFile)) return null
  try {
    const value = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    if (value?.schemaVersion !== 'hengzhun-agent-l1-checkpoint/v1' || !VARIANTS.includes(value.currentVariant) || !Array.isArray(value.results)) throw new Error('schema')
    return value
  } catch { throw new AgentL1Error('AGENT_L1_CHECKPOINT_INVALID') }
}

function inputContract(environment, variant) {
  const inputName = variant === 'TEXT_ONLY' ? 'HENGZHUN_AGENT_L1_TEXT_INPUT_FILE' : 'HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE'
  const inputFile = String(environment[inputName] || '').trim()
  if (!path.isAbsolute(inputFile)) throw new AgentL1Error('AGENT_L1_INPUT_FILE_REQUIRED', { variant, variable: inputName })
  const args = ['run', '--input-file', inputFile]
  if (variant === 'TEXT_WITH_IMAGE') {
    const attachmentFile = String(environment.HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE || '').trim()
    if (!path.isAbsolute(attachmentFile)) throw new AgentL1Error('AGENT_L1_IMAGE_ATTACHMENT_REQUIRED', { variable: 'HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE' })
    args.push('--attach', attachmentFile)
  }
  args.push('--jsonl')
  return args
}

function invokeHeadless({ root = productRoot, environment = process.env, args }) {
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'managed-process-spec-v1.json'), 'utf8'))
  const result = childProcess.spawnSync(path.resolve(root, spec.interactive.executable), [path.resolve(root, spec.interactive.entrypoint), ...args], {
    cwd: root, env: environment, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  })
  return { exitCode: result.status, events: parseJsonLines(result.stdout) }
}

function classifyHeadless({ exitCode, events }, variant, releaseIdentityHash) {
  const terminal = events.at(-1)
  if (exitCode === 20 && terminal?.type === 'APPROVAL_REQUIRED') return Object.freeze({
    status: 'AWAITING_APPROVAL', variant, releaseIdentityHash,
    pending: Object.freeze({
      sessionId: terminal.sessionId, journeyId: terminal.journeyId, proposalId: terminal.proposal?.proposalId,
      contentHash: terminal.proposal?.contentHash, risk: terminal.proposal?.risk, expiresAt: terminal.proposal?.expiresAt,
      summary: terminal.proposal?.summary,
    }),
  })
  if (exitCode === 0 && terminal?.type === 'RESPONSE' && terminal.status === 'COMPLETED') return Object.freeze({
    status: 'PASSED', variant, releaseIdentityHash, sessionId: terminal.sessionId, journeyId: terminal.journeyId,
  })
  if (exitCode === 21 && terminal?.type === 'COMMAND_RESULT') return Object.freeze({ status: 'REJECTED', variant, releaseIdentityHash })
  throw new AgentL1Error('AGENT_L1_VARIANT_EXECUTION_FAILED', { variant, exitCode: Number.isInteger(exitCode) ? exitCode : null, terminalType: terminal?.type || null, messageCode: terminal?.messageCode || null })
}

function safeCheckpoint(identityHash, variant, results = []) {
  return {
    schemaVersion: 'hengzhun-agent-l1-checkpoint/v1', releaseIdentityHash: identityHash,
    status: 'RUNNING', currentVariant: variant, results, pending: null, updatedAt: new Date().toISOString(),
  }
}

function persistTerminalEvidence(root, checkpoint) {
  const { evidenceRoot } = checkpointPaths(root)
  fs.mkdirSync(evidenceRoot, { recursive: true })
  const target = path.join(evidenceRoot, `${checkpoint.releaseIdentityHash}.json`)
  const evidence = {
    schemaVersion: 'hengzhun-agent-l1-evidence/v1', status: 'PASSED', profile: 'NORMAL_CLI',
    releaseIdentityHash: checkpoint.releaseIdentityHash, results: checkpoint.results,
    full18Claim: false, completedAt: new Date().toISOString(),
  }
  if (fs.existsSync(target)) {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'))
    if (existing.status === 'PASSED' && existing.releaseIdentityHash === evidence.releaseIdentityHash) return { target, evidence: existing }
    throw new AgentL1Error('AGENT_L1_EVIDENCE_CONFLICT')
  }
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return { target, evidence }
}

async function withManagedRuntime({ root, environment, authorizationValue, deps }, action) {
  const expected = (deps.authorizedIdentity || lifecycle.authorizedIdentity)({ root, environment, authorizationValue }).identityHash
  const start = deps.start || lifecycle.startManaged
  const stop = deps.stop || lifecycle.stopManaged
  let started = false
  let primaryError
  try {
    assertIdentity(await start({ root, environment, authorizationValue, ...(deps.lifecycleDeps ? { deps: deps.lifecycleDeps } : {}) }), expected, 'AGENT_L1_START_IDENTITY_MISMATCH')
    started = true
    assertIdentity(await (deps.publicReadback || publicVersionReadback)({ root, environment }), expected, 'AGENT_L1_PUBLIC_IDENTITY_MISMATCH')
    const value = await action(expected)
    assertIdentity(await (deps.currentIdentity || boundIdentity)({ root, environment }), expected)
    return value
  } catch (error) { primaryError = error; throw error }
  finally {
    if (started) {
      try { await stop({ root, environment, authorizationValue, ...(deps.lifecycleDeps ? { deps: deps.lifecycleDeps } : {}) }) }
      catch (stopError) { if (!primaryError) throw stopError }
    }
  }
}

async function runCheckpointedL1({ root = productRoot, environment = process.env, authorizationValue, command = 'run', sessionId, proposalId, contentHash, deps = {} } = {}) {
  await preflightL1({ root, environment, authorizationValue, deps })
  const readState = deps.readCheckpoint || readCheckpoint
  const writeState = deps.writeCheckpoint || ((value) => writeJsonAtomic(checkpointPaths(root).stateFile, value))
  const invoke = deps.invoke || invokeHeadless
  let state = readState(root)
  if (command === 'run') {
    if (state && state.status !== 'PASSED') throw new AgentL1Error('AGENT_L1_CHECKPOINT_REQUIRES_DECISION', { status: state.status })
    if (state?.status === 'PASSED') return Object.freeze({ status: 'ALREADY_PASSED', releaseIdentityHash: state.releaseIdentityHash, results: state.results, full18Claim: false })
    const identity = (deps.authorizedIdentity || lifecycle.authorizedIdentity)({ root, environment, authorizationValue })
    state = safeCheckpoint(identity.identityHash, VARIANTS[0])
  } else {
    if (!state || state.status !== 'AWAITING_APPROVAL' || !state.pending) throw new AgentL1Error('AGENT_L1_NO_PENDING_APPROVAL')
    if (state.pending.sessionId !== sessionId || state.pending.proposalId !== proposalId || state.pending.contentHash !== contentHash) {
      throw new AgentL1Error('AGENT_L1_APPROVAL_IDENTITY_MISMATCH')
    }
    if (!['approve', 'reject'].includes(command)) throw new AgentL1Error('AGENT_L1_COMMAND_INVALID')
  }
  return withManagedRuntime({ root, environment, authorizationValue, deps }, async (expected) => {
    assertIdentity(state, expected, 'AGENT_L1_CHECKPOINT_IDENTITY_MISMATCH')
    try {
      let step = command === 'run'
        ? classifyHeadless(await invoke({ root, environment, args: inputContract(environment, state.currentVariant) }), state.currentVariant, expected)
        : classifyHeadless(await invoke({ root, environment, args: ['resume', sessionId, command === 'approve' ? '--approve' : '--reject', '--proposal', proposalId] }), state.currentVariant, expected)
      if (step.status === 'REJECTED') {
        state = { ...state, status: 'REJECTED', pending: null, updatedAt: new Date().toISOString() }
        writeState(state)
        return Object.freeze({ status: 'REJECTED', releaseIdentityHash: expected, variant: state.currentVariant })
      }
      while (step.status === 'PASSED') {
        state = { ...state, results: [...state.results, { variant: state.currentVariant, status: 'PASSED', sessionId: step.sessionId, journeyId: step.journeyId }], pending: null, updatedAt: new Date().toISOString() }
        if (state.currentVariant === VARIANTS.at(-1)) {
          state = { ...state, status: 'PASSED' }
          writeState(state)
          const terminal = (deps.persistEvidence || persistTerminalEvidence)(root, state)
          return Object.freeze({ status: 'PASSED', releaseIdentityHash: expected, results: state.results, evidenceFile: path.relative(root, terminal.target).replaceAll('\\', '/'), full18Claim: false })
        }
        state = { ...state, currentVariant: VARIANTS[1] }
        writeState(state)
        step = classifyHeadless(await invoke({ root, environment, args: inputContract(environment, state.currentVariant) }), state.currentVariant, expected)
      }
      state = { ...state, status: 'AWAITING_APPROVAL', pending: step.pending, updatedAt: new Date().toISOString() }
      writeState(state)
      return Object.freeze({ status: 'AWAITING_APPROVAL', releaseIdentityHash: expected, variant: state.currentVariant, pending: state.pending, full18Claim: false })
    } catch (error) {
      state = { ...state, status: 'FAILED', pending: null, failure: { errorCode: error.code || 'AGENT_L1_FAILED', variant: state.currentVariant }, updatedAt: new Date().toISOString() }
      writeState(state)
      throw error
    }
  })
}

async function preflightL1({ root = productRoot, environment = process.env, authorizationValue, deps = {} } = {}) {
  const identity = (deps.authorizedIdentity || lifecycle.authorizedIdentity)({ root, environment, authorizationValue })
  if (identity.releaseStatus !== 'FROZEN') throw new AgentL1Error('AGENT_L1_RELEASE_NOT_FROZEN')
  const doctor = await (deps.doctor || lifecycle.doctor)({ root })
  if (doctor?.status !== 'READY' || doctor.profile !== 'NORMAL_CLI' || doctor.flowiseAbsent !== true) {
    throw new AgentL1Error('AGENT_L1_PREFLIGHT_NOT_READY')
  }
  return Object.freeze({ status: 'READY', profile: 'NORMAL_CLI', releaseIdentityHash: identity.identityHash })
}

async function executeOrderedL1({ root = productRoot, environment = process.env, authorizationValue, deps = {} } = {}) {
  const preflight = await preflightL1({ root, environment, authorizationValue, deps })
  const expected = preflight.releaseIdentityHash
  const start = deps.start || lifecycle.startManaged
  const stop = deps.stop || lifecycle.stopManaged
  const readback = deps.publicReadback || publicVersionReadback
  const currentIdentity = deps.currentIdentity || boundIdentity
  const runVariant = deps.runVariant
  if (typeof runVariant !== 'function') throw new AgentL1Error('AGENT_L1_VARIANT_DRIVER_REQUIRED')
  const results = []
  let primaryError
  let started = false
  try {
    const startedValue = await start({ root, environment, authorizationValue, ...(deps.lifecycleDeps ? { deps: deps.lifecycleDeps } : {}) })
    started = true
    assertIdentity(startedValue, expected, 'AGENT_L1_START_IDENTITY_MISMATCH')
    assertIdentity(await readback({ root, environment }), expected, 'AGENT_L1_PUBLIC_IDENTITY_MISMATCH')
    assertIdentity(await currentIdentity({ root, environment }), expected)
    for (const variant of VARIANTS) {
      const result = await runVariant({ variant, releaseIdentityHash: expected, root, environment })
      if (result?.status !== 'PASSED' || result.variant !== variant || result.releaseIdentityHash !== expected) {
        throw new AgentL1Error('AGENT_L1_VARIANT_FAILED', { variant, status: result?.status || 'INVALID' })
      }
      results.push(Object.freeze({ variant, status: 'PASSED', evidenceRef: result.evidenceRef || null }))
      assertIdentity(await currentIdentity({ root, environment }), expected)
    }
    return Object.freeze({ schemaVersion: 'hengzhun-agent-l1-result/v1', status: 'PASSED', releaseIdentityHash: expected, results, full18Claim: false })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (started) {
      try { await stop({ root, environment, authorizationValue, ...(deps.lifecycleDeps ? { deps: deps.lifecycleDeps } : {}) }) }
      catch (stopError) { if (!primaryError) throw stopError }
    }
  }
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const command = process.argv[2]
    const environment = lifecycle.environmentWithRuntimeFile()
    if (command === 'preflight') {
      const identity = boundIdentity({ environment })
      const doctor = lifecycle.doctor()
      process.stdout.write(`${JSON.stringify({ status: doctor.status, profile: doctor.profile, flowiseAbsent: doctor.flowiseAbsent, releaseIdentityHash: identity.identityHash, executionPerformed: false })}\n`)
      return
    }
    if (!['run', 'approve', 'reject'].includes(command)) throw new AgentL1Error('AGENT_L1_COMMAND_INVALID')
    const result = await runCheckpointedL1({ environment, command, sessionId: process.argv[3], proposalId: process.argv[4], contentHash: process.argv[5] })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'AGENT_L1_FAILED' })}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  AgentL1Error, VARIANTS, assertIdentity, boundIdentity, checkpointPaths, classifyHeadless,
  executeOrderedL1, inputContract, parseJsonLines, preflightL1, publicVersionReadback,
  readCheckpoint, runCheckpointedL1, safeCheckpoint, withManagedRuntime,
}
