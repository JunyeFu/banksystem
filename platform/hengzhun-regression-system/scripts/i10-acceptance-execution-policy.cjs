#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')

const PIPELINE = Object.freeze(['intake', 'controller', 'authoring', 'builder', 'runner'])
const SURFACE_ORDER = Object.freeze([...PIPELINE, 'platform_publication', 'evidence_only'])
const REQUIRED_REUSE_FIELDS = Object.freeze([
  'producerIdentity',
  'normalizedInputHash',
  'targetProfileId',
  'credentialBindingStatus',
  'candidateHash',
  'downstreamContractVersion'
])
const REQUIRED_LIVE_GATES = Object.freeze(['PURE_PLAYWRIGHT', 'I10_2X2_V1', 'ACTIVATION', 'FORMAL_EXECUTION'])
const TERMINAL_STATES = new Set(['PASSED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REJECTED', 'DISABLED'])

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function surfaceForPath(filePath) {
  const value = String(filePath || '').replaceAll('\\', '/').toLowerCase()
  if (/^(?:docs|agent)\//.test(value) || /evidence|ledger|report|readme/.test(value)) return 'evidence_only'
  if (/^flowise\/|publication|agentflow/.test(value)) return 'platform_publication'
  if (/authoring|midscene|action-trace/.test(value)) return 'authoring'
  if (/builder|script-package|candidate/.test(value)) return 'builder'
  if (/formal-runner|stability-runner|playwright/.test(value)) return 'runner'
  if (/controller|prompt|semantic/.test(value)) return 'controller'
  return 'intake'
}

function classifyChangedSurfaces({ previous = {}, current = {} } = {}) {
  const paths = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort()
  const changedPaths = paths.filter(filePath => previous[filePath] !== current[filePath])
  const changedSurfaces = [...new Set(changedPaths.map(surfaceForPath))]
    .sort((left, right) => SURFACE_ORDER.indexOf(left) - SURFACE_ORDER.indexOf(right))
  const invalidating = changedSurfaces.filter(surface => PIPELINE.includes(surface) || surface === 'platform_publication')
  const invalidationFrom = invalidating[0] || null
  const startIndex = PIPELINE.indexOf(invalidationFrom)
  const invalidatedStages = invalidationFrom === 'platform_publication'
    ? [...PIPELINE]
    : startIndex >= 0 ? PIPELINE.slice(startIndex) : []
  return {
    changedPaths,
    changedSurfaces,
    invalidationFrom,
    invalidatedStages,
    reasons: changedPaths.map(filePath => `${surfaceForPath(filePath)}:${filePath}`)
  }
}

function exactReuseDecision(expected = {}, actual = {}) {
  const reasons = []
  for (const field of REQUIRED_REUSE_FIELDS) {
    if (expected[field] === undefined || expected[field] === null || expected[field] === '') {
      reasons.push(`${field}:EXPECTED_MISSING`)
    } else if (actual[field] === undefined || actual[field] === null || actual[field] === '') {
      reasons.push(`${field}:ACTUAL_MISSING`)
    } else if (expected[field] !== actual[field]) {
      reasons.push(`${field}:MISMATCH`)
    }
  }
  if (actual.credentialBindingStatus !== 'BOUND' && !reasons.includes('credentialBindingStatus:MISMATCH')) {
    reasons.push('credentialBindingStatus:NOT_BOUND')
  }
  return { reusable: reasons.length === 0, reasons, requiredLiveGates: [...REQUIRED_LIVE_GATES] }
}

function requireText(value, name) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    const error = new Error(`I10_RF006_${name}_REQUIRED`)
    error.code = `I10_RF006_${name}_REQUIRED`
    throw error
  }
  return normalized
}

function authoringIdempotencyKey(input = {}) {
  const material = {
    journeyId: requireText(input.journeyId, 'JOURNEY_ID'),
    draftHash: requireText(input.draftHash, 'DRAFT_HASH'),
    targetProfileId: requireText(input.targetProfileId, 'TARGET_PROFILE_ID'),
    authoringIdentity: requireText(input.authoringIdentity, 'AUTHORING_IDENTITY')
  }
  return `authoring_${hash(material)}`
}

function inFlightReuseDecision({ checkpoint, expectedReleaseIdentityHash, expectedAuthoringIdempotencyKey } = {}) {
  if (!checkpoint) return { action: 'START_NEW', reason: 'NO_CHECKPOINT' }
  if (checkpoint.releaseIdentityHash !== expectedReleaseIdentityHash) {
    return { action: 'INVALIDATE', reason: 'RELEASE_IDENTITY_CHANGED' }
  }
  if (checkpoint.authoringIdempotencyKey !== expectedAuthoringIdempotencyKey) {
    return { action: 'INVALIDATE', reason: 'AUTHORING_INPUT_CHANGED' }
  }
  if (!checkpoint.runDirectory) return { action: 'INVALIDATE', reason: 'RUN_DIRECTORY_MISSING' }
  return {
    action: 'RECOVER_IN_PLACE',
    runDirectory: checkpoint.runDirectory,
    reason: 'MATCHING_IN_FLIGHT_AUTHORING'
  }
}

function pollDelayMs(attempt, options = {}) {
  const initial = Math.max(1, Number(options.initialDelayMs || 1000))
  const multiplier = Math.max(1, Number(options.multiplier || 1.5))
  const maximum = Math.max(initial, Number(options.maximumDelayMs || 15000))
  return Math.min(maximum, Math.round(initial * (multiplier ** Math.max(0, Number(attempt) - 1))))
}

async function pollUntilTerminal(options = {}) {
  const read = options.read
  const classify = options.classify
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const maximumPolls = Math.max(1, Number(options.maximumPolls || 80))
  if (typeof read !== 'function' || typeof classify !== 'function') {
    const error = new Error('I10_RF006_POLL_CONTRACT_INVALID')
    error.code = 'I10_RF006_POLL_CONTRACT_INVALID'
    throw error
  }
  for (let pollCount = 1; pollCount <= maximumPolls; pollCount += 1) {
    const terminal = await read(pollCount)
    const state = String(classify(terminal) || '').toUpperCase()
    if (TERMINAL_STATES.has(state)) return { terminal, terminalState: state, pollCount }
    if (pollCount < maximumPolls) await sleep(pollDelayMs(pollCount, options))
  }
  const error = new Error('I10_RF006_POLL_BUDGET_EXHAUSTED')
  error.code = 'I10_RF006_POLL_BUDGET_EXHAUSTED'
  error.details = { maximumPolls }
  throw error
}

function createTimingLedger({ runId, clock = Date.now } = {}) {
  const stages = []
  const stageByName = new Map()
  const cacheDecisions = []
  let firstStartedAtMs = null
  let lastEndedAtMs = null
  let pollCount = 0
  let retryCount = 0

  function requireStage(stageName) {
    const stage = stageByName.get(stageName)
    if (!stage || stage.endedAtMs !== null) {
      const error = new Error('I10_RF006_TIMING_STAGE_NOT_ACTIVE')
      error.code = 'I10_RF006_TIMING_STAGE_NOT_ACTIVE'
      throw error
    }
    return stage
  }

  return {
    startStage(stageName) {
      if (stageByName.has(stageName)) {
        const error = new Error('I10_RF006_TIMING_STAGE_DUPLICATE')
        error.code = 'I10_RF006_TIMING_STAGE_DUPLICATE'
        throw error
      }
      const startedAtMs = Number(clock())
      if (firstStartedAtMs === null) firstStartedAtMs = startedAtMs
      const stage = { stageName, startedAtMs, endedAtMs: null, durationMs: null, pollCount: 0, retryCount: 0 }
      stages.push(stage)
      stageByName.set(stageName, stage)
      return stage
    },
    endStage(stageName) {
      const stage = requireStage(stageName)
      stage.endedAtMs = Number(clock())
      stage.durationMs = stage.endedAtMs - stage.startedAtMs
      if (stage.durationMs < 0) {
        const error = new Error('I10_RF006_TIMING_CLOCK_REGRESSION')
        error.code = 'I10_RF006_TIMING_CLOCK_REGRESSION'
        throw error
      }
      lastEndedAtMs = stage.endedAtMs
      return stage
    },
    recordPoll(stageName) { requireStage(stageName).pollCount += 1; pollCount += 1 },
    recordRetry(stageName) { requireStage(stageName).retryCount += 1; retryCount += 1 },
    recordCacheDecision(decision) { cacheDecisions.push({ ...decision }) },
    finalize() {
      if (stages.some(stage => stage.endedAtMs === null)) {
        const error = new Error('I10_RF006_TIMING_STAGE_OPEN')
        error.code = 'I10_RF006_TIMING_STAGE_OPEN'
        throw error
      }
      const totalDurationMs = stages.length ? lastEndedAtMs - firstStartedAtMs : 0
      const measuredDurationMs = stages.reduce((total, stage) => total + stage.durationMs, 0)
      const unattributedDurationMs = totalDurationMs - measuredDurationMs
      if (unattributedDurationMs < 0) {
        const error = new Error('I10_RF006_TIMING_OVERLAP_UNSUPPORTED')
        error.code = 'I10_RF006_TIMING_OVERLAP_UNSUPPORTED'
        throw error
      }
      return {
        schemaVersion: 'hengzhun-rf006-stage-timing-v1',
        runId: runId || null,
        stages: stages.map(stage => ({ ...stage })),
        totalDurationMs,
        measuredDurationMs,
        unattributedDurationMs,
        pollCount,
        retryCount,
        cacheDecisions: cacheDecisions.map(decision => ({ ...decision })),
        status: 'RECONCILED'
      }
    }
  }
}

function liveGateProjection(record = {}) {
  const execution = record.execution || {}
  return {
    authoringCandidate: /^candidate_[0-9a-f]{40}$/i.test(String(record.candidateId || '')),
    purePlaywright: /^buildjob_[0-9a-f-]{36}$/i.test(String(record.playwrightValidationTaskId || '')) &&
      /^script_[0-9a-f]{40}$/i.test(String(record.scriptId || '')) && /^[0-9a-f]{64}$/i.test(String(record.scriptHash || '')),
    stability2x2: /^certificate_[0-9a-f]{40}$/i.test(String(record.stabilityCertificateId || '')) &&
      Array.isArray(record.fourRunIds) && record.fourRunIds.length === 4 && new Set(record.fourRunIds).size === 4,
    activation: record.activationDecision?.verified === true,
    formalExecution: execution.mode === 'ON_DEMAND' && /^task_[0-9a-f-]{36}$/i.test(String(execution.taskId || '')) &&
      /^run_[0-9a-f-]{36}$/i.test(String(execution.runId || '')),
    resultReadback: /^inbox_[0-9a-f-]{36}$/i.test(String(record.resultInboxId || '')),
    terminalArtifact: /^(?:art|artifact)_[0-9a-f-]{36}$/i.test(String(record.terminalArtifactId || '')) && record.status === 'PASSED'
  }
}

function allLiveGatesPassed(gates = {}) {
  return Object.keys(liveGateProjection({})).every(name => gates[name] === true)
}

function estimatedPollingWaitMs(mode, pollCount) {
  const count = Math.max(0, Number(pollCount || 0))
  if (mode === 'LEGACY') return count * 15_000
  let total = 0
  for (let attempt = 1; attempt <= count; attempt += 1) total += pollDelayMs(attempt, { initialDelayMs: 1000, multiplier: 1.5, maximumDelayMs: 15000 })
  return total
}

function compareModes({ legacy, selective } = {}) {
  const legacyGates = liveGateProjection(legacy?.record)
  const selectiveGates = liveGateProjection(selective?.record)
  const gateEquivalent = allLiveGatesPassed(legacyGates) && allLiveGatesPassed(selectiveGates) &&
    Object.keys(legacyGates).every(name => legacyGates[name] === selectiveGates[name])
  const observedWallClockReduced = Number(selective?.timing?.totalDurationMs) < Number(legacy?.timing?.totalDurationMs)
  const selectiveReplayAvoidedDuplicateAuthoring = selective?.runDirectoryCountBeforeReplay === selective?.runDirectoryCountAfterReplay
  const selectiveReplayAvoidedFullRerun = selective?.ledgerCountBeforeReplay === selective?.ledgerCountAfterReplay
  const legacyEstimatedPollingWaitMs = estimatedPollingWaitMs('LEGACY', legacy?.timing?.pollCount)
  const selectiveEstimatedPollingWaitMs = estimatedPollingWaitMs('SELECTIVE', selective?.timing?.pollCount)
  const serialPollingReduced = selectiveEstimatedPollingWaitMs < legacyEstimatedPollingWaitMs
  const timingReconciled = legacy?.timing?.status === 'RECONCILED' && selective?.timing?.status === 'RECONCILED'
  const cutoverReady = gateEquivalent && observedWallClockReduced && serialPollingReduced && timingReconciled &&
    selectiveReplayAvoidedDuplicateAuthoring && selectiveReplayAvoidedFullRerun
  return {
    legacyGates,
    selectiveGates,
    gateEquivalent,
    observedWallClockReduced,
    serialPollingReduced,
    legacyEstimatedPollingWaitMs,
    selectiveEstimatedPollingWaitMs,
    savedWallClockMs: Number(legacy?.timing?.totalDurationMs) - Number(selective?.timing?.totalDurationMs),
    selectiveReplayAvoidedDuplicateAuthoring,
    selectiveReplayAvoidedFullRerun,
    timingReconciled,
    cutoverDecision: cutoverReady ? 'ENABLE_SELECTIVE' : 'KEEP_LEGACY'
  }
}

module.exports = {
  PIPELINE,
  REQUIRED_LIVE_GATES,
  surfaceForPath,
  classifyChangedSurfaces,
  exactReuseDecision,
  authoringIdempotencyKey,
  inFlightReuseDecision,
  pollDelayMs,
  pollUntilTerminal,
  createTimingLedger,
  liveGateProjection,
  allLiveGatesPassed,
  estimatedPollingWaitMs,
  compareModes
}
