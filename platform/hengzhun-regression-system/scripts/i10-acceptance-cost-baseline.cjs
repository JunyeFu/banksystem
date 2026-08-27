#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const productRoot = path.resolve(__dirname, '..')
const bundledNode = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
const acceptanceDriver = path.join(productRoot, 'scripts', 'i10-18-chain-acceptance-live.cjs')
const manifestPath = path.join(productRoot, 'flowise', 'i10', 'publication-manifest-v1.json')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readSource(root, relative) {
  const filePath = path.join(root, relative)
  const bytes = fs.readFileSync(filePath)
  return { relative, bytes, text: bytes.toString('utf8'), sha256: sha256(bytes) }
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`RF006_BASELINE_START_MARKER_MISSING:${startMarker}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error(`RF006_BASELINE_END_MARKER_MISSING:${endMarker}`)
  return source.slice(start, end)
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length
}

function uniqueMatches(source, pattern, group = 1) {
  return [...new Set([...source.matchAll(pattern)].map(match => match[group]).filter(Boolean))]
}

function boundedInteger(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`boundedIntegerEnvironment\\('${escaped}',\\s*([0-9_]+),\\s*([0-9_]+),\\s*([0-9_]+)\\)`))
  if (!match) throw new Error(`RF006_BASELINE_INTEGER_CONFIG_MISSING:${name}`)
  return {
    environment: name,
    default: Number(match[1].replaceAll('_', '')),
    minimum: Number(match[2].replaceAll('_', '')),
    maximum: Number(match[3].replaceAll('_', ''))
  }
}

function numericLiteral(source, pattern, code) {
  const match = source.match(pattern)
  if (!match) throw new Error(code)
  return Number(match[1].replaceAll('_', ''))
}

function buildBaseline(options = {}) {
  const root = path.resolve(options.root || productRoot)
  const driver = readSource(root, 'scripts/i10-18-chain-acceptance-live.cjs')
  const stage8 = readSource(root, 'scripts/i10-stage8-live.cjs')
  const orchestrator = readSource(root, 'scripts/i10-stage8-orchestrator.cjs')
  const ledger = readSource(root, 'scripts/i10-acceptance-ledger-v3.cjs')
  const policy = readSource(root, 'scripts/i10-acceptance-execution-policy.cjs')
  const runBody = section(driver.text, 'async function run(', 'async function recover(')
  const recoverBody = section(driver.text, 'async function recover(', 'async function main(')
  const phaseBody = section(orchestrator.text, 'async function phase(', 'async function waitForPortal(')
  const guardIndex = runBody.indexOf('acceptanceLedger.existingTerminal(')
  const fixtureIndex = runBody.indexOf('loadBrowserCase(')
  const conversationIndex = runBody.indexOf('stage8.runConversation(')
  const scheduleWait = boundedInteger(stage8.text, 'I10_STAGE8_SCHEDULE_WAIT_MS')
  const schedulePoll = boundedInteger(stage8.text, 'I10_STAGE8_SCHEDULE_POLL_MS')
  const checkpointStages = uniqueMatches(driver.text, /stage:\s*'([A-Z][A-Z0-9_]*)'/g)
  const orchestratorPhases = uniqueMatches(orchestrator.text, /phase\('([^']+)'/g)
  const adaptivePolling = /acceptancePollDelayMs\(/.test(stage8.text) && /pollDelayMs\(/.test(policy.text)
  const timingPrimitive = /createTimingLedger\(/.test(orchestrator.text) && /createTimingLedger\(/.test(driver.text)
  const durationProjection = /timing-ledger\.json/.test(driver.text) && /preparation-timing\.json/.test(orchestrator.text)
  const acceptanceTimingStages = uniqueMatches(driver.text, /startTimingStage\('([^']+)'/g)

  const baseline = {
    schemaVersion: 'hengzhun-rf006-acceptance-cost-baseline-v2',
    evidenceClass: 'STATIC_CONTRACT_IMPLEMENTATION_SNAPSHOT',
    capturedAt: options.capturedAt || null,
    releaseIdentity: options.releaseIdentity || null,
    ledgerStatus: options.ledgerStatus || null,
    sourceFiles: [driver, stage8, orchestrator, ledger, policy].map(item => ({ path: item.relative, sha256: item.sha256, bytes: item.bytes.length })),
    callGraph: {
      run: ['acceptanceLedger.existingTerminal', 'loadBrowserCase', 'stage8.runConversation', 'finalizeRecord'],
      recover: ['fileBodies', 'stage8.runConversation', 'finalizeRecord'],
      terminalIdempotencyGuard: {
        present: guardIndex >= 0,
        beforeFixtureLoad: guardIndex >= 0 && guardIndex < fixtureIndex,
        beforeFlowiseConversation: guardIndex >= 0 && guardIndex < conversationIndex,
        recursivePairMismatchRetryPresent: /return run\(caseId, variant, attempt \+ 1\)/.test(runBody)
      },
      flowiseConversationCallSites: {
        freshRun: countMatches(runBody, /stage8\.runConversation\(/g),
        recovery: countMatches(recoverBody, /stage8\.runConversation\(/g)
      },
      terminalPersistence: {
        recordTerminalCalls: countMatches(driver.text, /acceptanceLedger\.recordTerminal\(/g),
        immutableTerminalReuseGuard: /cached\?\.status === 'PASSED'/.test(ledger.text)
      }
    },
    polling: {
      conversationHumanGate: {
        maximumGates: numericLiteral(stage8.text, /if \(\+\+step > ([0-9_]+)\) fail\('I10_STAGE8_TOO_MANY_HUMAN_GATES'/, 'RF006_BASELINE_GATE_LIMIT_MISSING'),
        fixedWaitMs: adaptivePolling ? null : 15000,
        fixedWaitCallSites: countMatches(stage8.text, /sleep\(15_000\)/g),
        strategy: adaptivePolling ? 'TERMINAL_AWARE_BOUNDED_BACKOFF' : 'SERIAL_FIXED_INTERVAL',
        rollbackSwitch: /I10_RF006_S2_ENABLED/.test(stage8.text)
      },
      scheduledResult: {
        wait: scheduleWait,
        poll: schedulePoll,
        strategy: adaptivePolling ? 'TERMINAL_AWARE_BOUNDED_BACKOFF' : 'SERIAL_FIXED_INTERVAL'
      },
      controlledPortalHealth: {
        maximumWaitMs: numericLiteral(orchestrator.text, /const deadline = Date\.now\(\) \+ ([0-9_]+)/, 'RF006_BASELINE_PORTAL_WAIT_MISSING'),
        pollIntervalMs: numericLiteral(orchestrator.text, /setTimeout\(resolve, ([0-9_]+)\)/, 'RF006_BASELINE_PORTAL_POLL_MISSING'),
        strategy: 'SERIAL_FIXED_INTERVAL'
      },
      pendingPredicates: [
        'stopped', 'journeyProcessingPending', 'ingestProcessingPending', 'imageProcessingPending',
        'authoringProcessingPending', 'targetProfileTransitionPending', 'imageFactsTransitionPending',
        'imageConfirmedTransitionPending', 'isolatedJourneyTransitionPending',
        'crossSessionProposalDecisionPending', 'crossSessionToolContinuationPending',
        'crossSessionAuthoringAsyncPending', 'crossSessionExecutionPlanPending',
        'crossSessionCaseInputPending', 'crossSessionSilentPending'
      ]
    },
    stageTiming: {
      orchestratorPhases,
      acceptanceTimingStages,
      acceptanceCheckpointStages: checkpointStages,
      phaseWrapperMeasuresDuration: timingPrimitive,
      acceptanceRecordProjectsStageDuration: durationProjection,
      measuredStageCount: timingPrimitive && durationProjection ? orchestratorPhases.length + acceptanceTimingStages.length : 0,
      status: timingPrimitive && durationProjection ? 'INSTRUMENTED' : 'NOT_INSTRUMENTED'
    },
    findings: [
      {
        id: 'RF006-B01',
        classification: 'PRESERVED_GUARD',
        statement: 'A current-identity terminal record is checked before fixture loading or Flowise execution.'
      },
      {
        id: 'RF006-B02',
        classification: timingPrimitive && durationProjection ? 'RESOLVED' : 'MEASUREMENT_GAP',
        statement: timingPrimitive && durationProjection
          ? 'Preparation and acceptance execution emit reconciled machine-readable stage timings.'
          : 'Named orchestration/checkpoint stages do not currently emit reconciled per-stage durations.'
      },
      {
        id: 'RF006-B03',
        classification: adaptivePolling ? 'MITIGATED' : 'COST_DRIVER',
        statement: adaptivePolling
          ? 'Conversation and scheduled-result polling use bounded backoff and stop on authoritative terminal state.'
          : 'Conversation and scheduled-result polling use serial fixed waits with bounded but potentially long wall time.'
      },
      {
        id: 'RF006-B04',
        classification: /acceptanceCheckpointDisposition/.test(driver.text) ? 'RESOLVED' : 'OPEN_QUESTION',
        statement: /acceptanceCheckpointDisposition/.test(driver.text)
          ? 'A current-identity in-flight acceptance checkpoint requires same-directory recovery before any fresh authoring run.'
          : 'In-flight authoring reuse cannot be inferred from the terminal-record guard and requires S2 idempotency design.'
      },
      {
        id: 'RF006-B05',
        classification: /if \(latestReply\) return canonicalRepairNodeId\(latestReply\.nodeId\) === 'directReplyAgentflow_i10_v4_candidate_processing'/.test(stage8.text) ? 'RESOLVED' : 'POLLING_DEFECT',
        statement: /if \(latestReply\) return canonicalRepairNodeId\(latestReply\.nodeId\) === 'directReplyAgentflow_i10_v4_candidate_processing'/.test(stage8.text)
          ? 'Latest authoritative Direct Reply wins over historical candidate-processing text.'
          : 'Historical candidate-processing text can still classify a latest terminal Direct Reply as pending through the text fallback.'
      }
    ]
  }
  return baseline
}

function assertBaseline(baseline) {
  if (!baseline.callGraph.terminalIdempotencyGuard.beforeFixtureLoad || !baseline.callGraph.terminalIdempotencyGuard.beforeFlowiseConversation) {
    throw new Error('RF006_TERMINAL_REUSE_GUARD_NOT_EARLY')
  }
  if (baseline.callGraph.flowiseConversationCallSites.freshRun !== 1 || baseline.callGraph.flowiseConversationCallSites.recovery < 1) {
    throw new Error('RF006_FLOWISE_CALL_GRAPH_UNEXPECTED')
  }
  if (baseline.polling.conversationHumanGate.maximumGates !== 80 || baseline.polling.scheduledResult.wait.default !== 420000) {
    throw new Error('RF006_POLLING_BASELINE_UNEXPECTED')
  }
  if (baseline.polling.conversationHumanGate.strategy !== 'TERMINAL_AWARE_BOUNDED_BACKOFF') throw new Error('RF006_POLLING_STRATEGY_UNEXPECTED')
  if (baseline.stageTiming.status !== 'INSTRUMENTED' || baseline.stageTiming.measuredStageCount < 1) throw new Error('RF006_TIMING_IMPLEMENTATION_MISSING')
  return baseline
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function relativeComparisonRoot(sessionId, mode) {
  return path.join('.data', 'evidence', 'i10', 'rf006-comparison', sessionId, mode.toLowerCase())
}

function runDriver({ mode, relativeRoot, replay = false }) {
  const startedAtMs = Date.now()
  process.stderr.write(`[RF-006-S3] ${mode}${replay ? ' replay' : ''}: L1 TEXT_ONLY\n`)
  const child = spawnSync(bundledNode, [acceptanceDriver, 'run', 'L1', 'TEXT_ONLY'], {
    cwd: productRoot,
    env: {
      ...process.env,
      I10_RF006_S2_ENABLED: mode === 'LEGACY' ? '0' : '1',
      I10_RF006_ACCEPTANCE_EVIDENCE_ROOT: relativeRoot
    },
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024
  })
  const elapsedMs = Date.now() - startedAtMs
  if (child.error || child.status !== 0) {
    const error = new Error(`I10_RF006_${mode}_L1_FAILED`)
    error.code = `I10_RF006_${mode}_L1_FAILED`
    error.details = { exitCode: child.status, signal: child.signal || null, safeStderrTail: String(child.stderr || '').slice(-1000) }
    throw error
  }
  return { elapsedMs }
}

function loadMode(relativeRoot) {
  const absoluteRoot = path.resolve(productRoot, relativeRoot)
  const ledger = readJson(path.join(absoluteRoot, 'ledger.json'))
  const records = Object.values(ledger.records || {}).filter(record => record.caseId === 'L1' && record.variant === 'TEXT_ONLY' && record.status === 'PASSED')
  if (records.length !== 1) throw new Error('I10_RF006_MODE_RECORD_CARDINALITY_INVALID')
  const record = records[0]
  const timing = readJson(path.resolve(productRoot, record.runDirectory, 'timing-ledger.json'))
  const runsRoot = path.join(absoluteRoot, 'runs')
  const runDirectoryCount = fs.existsSync(runsRoot) ? fs.readdirSync(runsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).length : 0
  return {
    record,
    timing,
    ledgerCount: records.length,
    runDirectoryCount,
    ledgerPath: path.relative(productRoot, path.join(absoluteRoot, 'ledger.json')).replaceAll('\\', '/')
  }
}

function publicationSnapshot() {
  const bytes = fs.readFileSync(manifestPath)
  const manifest = JSON.parse(bytes.toString('utf8'))
  return {
    fileSha256: sha256(bytes),
    deployed: manifest.deployed === true,
    sourceHash: manifest.primaryFlowSha256,
    deployedHash: manifest.deployedFlowDataSha256,
    publishState: manifest.publishState
  }
}

function runComparison(outputPath) {
  const { currentReleaseIdentity, sameReleaseIdentity } = require('./i10-release-identity.cjs')
  const policy = require('./i10-acceptance-execution-policy.cjs')
  const identityBefore = currentReleaseIdentity({ requireDeployed: true })
  const publicationBefore = publicationSnapshot()
  const sessionId = new Date().toISOString().replace(/[:.]/g, '-')
  const legacyRoot = relativeComparisonRoot(sessionId, 'legacy')
  const selectiveRoot = relativeComparisonRoot(sessionId, 'selective')

  const legacyInvocation = runDriver({ mode: 'LEGACY', relativeRoot: legacyRoot })
  const legacy = loadMode(legacyRoot)
  const selectiveInvocation = runDriver({ mode: 'SELECTIVE', relativeRoot: selectiveRoot })
  const selective = loadMode(selectiveRoot)
  const beforeReplay = { ledgerCount: selective.ledgerCount, runDirectoryCount: selective.runDirectoryCount }
  const selectiveReplayInvocation = runDriver({ mode: 'SELECTIVE', relativeRoot: selectiveRoot, replay: true })
  const selectiveAfterReplay = loadMode(selectiveRoot)
  selective.ledgerCountBeforeReplay = beforeReplay.ledgerCount
  selective.ledgerCountAfterReplay = selectiveAfterReplay.ledgerCount
  selective.runDirectoryCountBeforeReplay = beforeReplay.runDirectoryCount
  selective.runDirectoryCountAfterReplay = selectiveAfterReplay.runDirectoryCount

  const identityAfter = currentReleaseIdentity({ requireDeployed: true })
  const publicationAfter = publicationSnapshot()
  const comparison = policy.compareModes({ legacy, selective })
  const identityUnchanged = sameReleaseIdentity(identityBefore, identityAfter)
  const publicationUnchanged = JSON.stringify(publicationBefore) === JSON.stringify(publicationAfter)
  const result = {
    schemaVersion: 'hengzhun-rf006-s3-mode-comparison-v1',
    evidenceClass: 'LIVE_E2E_COMPARATIVE',
    completedAt: new Date().toISOString(),
    caseId: 'L1',
    variant: 'TEXT_ONLY',
    releaseIdentityBefore: identityBefore,
    releaseIdentityAfter: identityAfter,
    releaseIdentityUnchanged: identityUnchanged,
    publicationBefore,
    publicationAfter,
    publicationUnchanged,
    modes: {
      legacy: { recordId: legacy.record.recordId, ledgerPath: legacy.ledgerPath, timing: legacy.timing, invocationElapsedMs: legacyInvocation.elapsedMs },
      selective: {
        recordId: selective.record.recordId,
        ledgerPath: selective.ledgerPath,
        timing: selective.timing,
        invocationElapsedMs: selectiveInvocation.elapsedMs,
        replayElapsedMs: selectiveReplayInvocation.elapsedMs,
        replayLedgerCountBefore: selective.ledgerCountBeforeReplay,
        replayLedgerCountAfter: selective.ledgerCountAfterReplay,
        replayRunDirectoryCountBefore: selective.runDirectoryCountBeforeReplay,
        replayRunDirectoryCountAfter: selective.runDirectoryCountAfterReplay
      }
    },
    comparison,
    rollback: {
      switch: 'I10_RF006_S2_ENABLED=0',
      liveLegacyL1Passed: policy.allLiveGatesPassed(comparison.legacyGates),
      status: policy.allLiveGatesPassed(comparison.legacyGates) ? 'VERIFIED' : 'FAILED'
    },
    status: comparison.cutoverDecision === 'ENABLE_SELECTIVE' && identityUnchanged && publicationUnchanged ? 'PASSED' : 'FAILED'
  }
  if (outputPath) {
    const resolved = path.resolve(productRoot, outputPath)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }
  if (result.status !== 'PASSED') {
    const error = new Error('I10_RF006_S3_COMPARISON_NOT_ACCEPTED')
    error.code = 'I10_RF006_S3_COMPARISON_NOT_ACCEPTED'
    error.details = result
    throw error
  }
  return result
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'compare') {
    const outputIndex = argv.indexOf('--output')
    const result = runComparison(outputIndex >= 0 ? argv[outputIndex + 1] : null)
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      releaseIdentityHash: result.releaseIdentityAfter.identityHash,
      cutoverDecision: result.comparison.cutoverDecision,
      legacyDurationMs: result.modes.legacy.timing.totalDurationMs,
      selectiveDurationMs: result.modes.selective.timing.totalDurationMs,
      savedWallClockMs: result.comparison.savedWallClockMs,
      rollbackStatus: result.rollback.status
    }, null, 2)}\n`)
    return
  }
  const { currentReleaseIdentity } = require('./i10-release-identity.cjs')
  const acceptanceLedger = require('./i10-acceptance-ledger-v3.cjs')
  const identity = currentReleaseIdentity({ requireDeployed: false })
  const status = acceptanceLedger.status()
  const baseline = assertBaseline(buildBaseline({
    capturedAt: new Date().toISOString(),
    releaseIdentity: { schemaVersion: identity.schemaVersion, identityHash: identity.identityHash },
    ledgerStatus: { currentPassed: status.currentPassed, required: status.required, historicalStale: status.historicalStale, checkpoints: status.checkpoints }
  }))
  process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`)
}

if (require.main === module) {
  try { main() } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || error.message || 'RF006_BASELINE_FAILED' })}\n`)
    process.exitCode = 2
  }
}

module.exports = { assertBaseline, buildBaseline, runComparison }
