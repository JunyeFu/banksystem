#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const opaqueReferences = require('./i10-reference-contracts.cjs')

const root = path.resolve(__dirname, '..')
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/stage8-acceptance-matrix-v1.json'), 'utf8'))
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
const flowiseBase = process.env.FLOWISE_URL || 'http://127.0.0.1:3006'
const evidenceRoot = path.join(root, '.data/evidence/i10/stage8')
let activeEvidenceRoot = evidenceRoot
const scheduleWaitMs = boundedIntegerEnvironment('I10_STAGE8_SCHEDULE_WAIT_MS', 420_000, 60_000, 900_000)
const schedulePollMs = boundedIntegerEnvironment('I10_STAGE8_SCHEDULE_POLL_MS', 10_000, 1_000, 60_000)
const traceEnabled = process.env.I10_STAGE8_TRACE === '1'

function traceStage8(message) {
  if (traceEnabled) process.stderr.write(`[I10 stage8] ${message}\n`)
}

function boundedIntegerEnvironment(name, fallback, minimum, maximum) {
  if (process.env[name] === undefined) return fallback
  const value = Number(process.env[name])
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(`${name}_INVALID`)
  return value
}

function fail(code, details = {}) {
  const error = new Error(code)
  error.code = code
  error.details = details
  throw error
}

function requireSafeScenarioFile() {
  const configured = process.env.I10_STAGE8_SCENARIO_FILE
  if (!configured) fail('I10_STAGE8_SCENARIO_FILE_MISSING')
  const resolved = path.resolve(configured)
  const allowed = path.resolve(root, '.data')
  const relative = path.relative(allowed, resolved)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('I10_STAGE8_SCENARIO_FILE_OUTSIDE_DATA')
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  assert.match(String(value.credentialRef || ''), /^credential_[0-9a-f-]{36}$/, 'I10_STAGE8_CREDENTIAL_REF_INVALID')
  for (const key of ['caseFilePath', 'videoPath']) {
    const target = path.resolve(root, String(value[key] || ''))
    const targetRelative = path.relative(allowed, target)
    if (!targetRelative || targetRelative.startsWith(`..${path.sep}`) || path.isAbsolute(targetRelative) || !fs.statSync(target).isFile()) fail('I10_STAGE8_INPUT_FILE_INVALID', { key })
    value[key] = target
  }
  for (const key of ['correctionCaseFilePath', 'imageMergeCaseFilePath']) {
    if (!value[key]) continue
    const target = path.resolve(root, String(value[key]))
    const targetRelative = path.relative(allowed, target)
    if (!targetRelative || targetRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(targetRelative) || !fs.statSync(target).isFile()) {
      fail('I10_STAGE8_INPUT_FILE_INVALID', { key })
    }
    value[key] = target
  }
  if (value.lowConfidenceVideoPath) {
    const target = path.resolve(root, String(value.lowConfidenceVideoPath))
    const targetRelative = path.relative(allowed, target)
    if (!targetRelative || targetRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(targetRelative) || !fs.statSync(target).isFile()) {
      fail('I10_STAGE8_INPUT_FILE_INVALID', { key: 'lowConfidenceVideoPath' })
    }
    value.lowConfidenceVideoPath = target
  }
  for (const key of ['conflictVideoPath', 'conflictSupportingImagePath']) {
    if (!value[key]) continue
    const target = path.resolve(root, String(value[key]))
    const targetRelative = path.relative(allowed, target)
    if (!targetRelative || targetRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(targetRelative) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      fail('I10_STAGE8_INPUT_FILE_INVALID', { key })
    }
    value[key] = target
  }
  if (!Array.isArray(value.supportingImagePaths) || value.supportingImagePaths.length < 2) {
    fail('I10_STAGE8_SUPPORTING_IMAGES_INVALID')
  }
  value.supportingImagePaths = value.supportingImagePaths.map((configured, index) => {
    const target = path.resolve(root, String(configured || ''))
    const targetRelative = path.relative(allowed, target)
    if (!targetRelative || targetRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(targetRelative) || !fs.statSync(target).isFile()) {
      fail('I10_STAGE8_SUPPORTING_IMAGE_INVALID', { index })
    }
    return target
  })
  // A focused screenshot/OCR acceptance run may use an independently captured
  // browser screenshot. It remains subject to exactly the same `.data` root
  // confinement as generated fixtures and replaces only the first supporting
  // image used by the selected scenario.
  const supportingImageOverride = String(process.env.I10_STAGE8_SUPPORTING_IMAGE_OVERRIDE || '').trim()
  if (supportingImageOverride) {
    const target = path.resolve(supportingImageOverride)
    const targetRelative = path.relative(allowed, target)
    if (!targetRelative || targetRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(targetRelative) || !fs.statSync(target).isFile()) {
      fail('I10_STAGE8_SUPPORTING_IMAGE_OVERRIDE_INVALID')
    }
    value.supportingImagePaths[0] = target
  }
  value.portalUrl = String(value.portalUrl || process.env.HENGZHUN_PORTAL_BASE_URL || '')
  value.failureControlUrl = String(value.failureControlUrl || '')
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.portalUrl)) fail('I10_STAGE8_PORTAL_URL_INVALID')
  return value
}

function freshEvidence(relative, schemaVersion) {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) fail('I10_STAGE8_REQUIRED_EVIDENCE_MISSING', { relative })
  const value = JSON.parse(fs.readFileSync(target, 'utf8'))
  if (value.schemaVersion !== schemaVersion || value.mock !== false || value.degraded !== false) fail('I10_STAGE8_REQUIRED_EVIDENCE_INVALID', { relative })
  if (Date.now() - Date.parse(value.completedAt) > 30 * 60_000) fail('I10_STAGE8_REQUIRED_EVIDENCE_STALE', { relative })
  return value
}

function freshPublicationEvidence() {
  const relative = '.data/evidence/i10/flowise/publication.json'
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) fail('I10_STAGE8_REQUIRED_EVIDENCE_MISSING', { relative })
  const value = JSON.parse(fs.readFileSync(target, 'utf8'))
  const acceptedSchemas = new Set([
    'hengzhun-i10-agentflow-publication-evidence-v1',
    'hengzhun-i10-agentflow-publication-evidence-v2'
  ])
  if (!acceptedSchemas.has(value.schemaVersion) || value.mock !== false || value.degraded !== false) {
    fail('I10_STAGE8_REQUIRED_EVIDENCE_INVALID', { relative, schemaVersion: value.schemaVersion || '' })
  }
  if (Date.now() - Date.parse(value.completedAt) > 30 * 60_000) {
    fail('I10_STAGE8_REQUIRED_EVIDENCE_STALE', { relative })
  }
  return value
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 240_000) })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = { text } }
  return { response, body }
}

function stopped(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  // Flowise returns the complete chat execution history. A completed Human
  // Input remains STOPPED after a later Direct Reply, so even the last
  // STOPPED entry may be stale. A later Direct Reply is the current terminal
  // state and must take priority; otherwise the acceptance driver repeatedly
  // clicks an already-completed gate instead of following the reply's exact
  // continuation command.
  let stoppedIndex = -1
  let replyIndex = -1
  for (let index = 0; index < executed.length; index += 1) {
    const item = executed[index]
    if (item?.status === 'STOPPED') stoppedIndex = index
    if (String(item?.nodeId || '').startsWith('directReplyAgentflow_')) replyIndex = index
  }
  if (replyIndex > stoppedIndex) return null
  return stoppedIndex >= 0 ? executed[stoppedIndex] : null
}

function imageProcessingPending(body) {
  const text = String(body?.text || '')
  return /补充图片尚未进入案例/.test(text) && /PROCESSING|图片仍在处理/.test(text)
}

function ingestProcessingPending(body) {
  const text = String(body?.text || '')
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  // Flowise returns the full historical execution trace for continuations.
  // A previous async-status reply is not evidence that the *current* reply is
  // still pending, so inspect the latest reply node rather than `some()`.
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v3_ingest_processing' ||
    (/正在解析附件|附件.*受控导入流程/.test(text) &&
      /同一对话发送[“"]继续|稍后.*继续/.test(text))
}

function journeyProcessingPending(body) {
  const text = String(body?.text || '')
  const processing = visitStructuredValues(body, current =>
    String(current.status || '') === 'PROCESSING' ||
    /^PROCESSING(?:_[A-Z_]+)?$/.test(String(current.stage || ''))
  )
  return Boolean(processing) && /稍后发送[“"]?继续|无需重复提交|正在处理/.test(text)
}

function authoringProcessingPending(body) {
  const text = String(body?.text || '')
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  // Same stale-history rule as ingestion.  Otherwise a completed candidate
  // keeps the acceptance driver polling forever merely because its first
  // asynchronous status card remains in the trace.
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v4_candidate_processing' ||
    (/候选仍在处理中/.test(text) && /同一会话发送[“"]继续/.test(text))
}

function targetProfileTransitionPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v6_target_profile_transition'
}

function imageFactsTransitionPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v6_image_facts_transition'
}

function imageConfirmedTransitionPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v6_image_confirmed_transition'
}

function isolatedJourneyTransitionPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return /^directReplyAgentflow_i10_v6_(?:no_image|confirmed_image)_journey_ready$/.test(String(latestReply?.nodeId || ''))
}

function crossSessionProposalDecisionPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v6_cross_session_decision_prompt'
}

// Native Flowise ends a turn after an MCP write.  The durable Journey state is
// already updated, but the same chat response contains the raw tool payload
// instead of a Direct Reply.  Treat this as an explicit continuation boundary,
// never as candidate completion or as a signal to click an old Human Input.
function crossSessionToolContinuationPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latest = executed.at(-1)
  return [
    'toolAgentflow_i10_v6_cross_session_authoring_resume_submit',
    'toolAgentflow_i10_v6_cross_session_candidate_resume_compile',
    'toolAgentflow_i10_v6_cross_session_candidate_preview',
    'toolAgentflow_i10_v6_cross_session_execution_plan_submit',
    'toolAgentflow_i10_v6_cross_session_candidate_activate',
    'toolAgentflow_i10_v6_cross_session_run_submit',
    'toolAgentflow_i10_v6_cross_session_task_get',
    'toolAgentflow_i10_v6_cross_session_schedule_create',
    'toolAgentflow_i10_v6_cross_session_result_inbox'
  ].includes(String(latest?.nodeId || ''))
}

// A NEEDS_INPUT(EXECUTION_PLAN) journey is presented through the dedicated
// input-prompt reply.  It must be answered with a deterministic plan text
// (parsed by the graph's decision-parse function), never with the
// approve/reject proposal command.
function crossSessionExecutionPlanPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  // Match only the actual EXECUTION_PLAN ask.  The input-prompt template lists
  // the plan phrasings as examples for humans, so a loose /立即执行/ match
  // would fire on ANY input request (for example missing case basics) and
  // loop the driver on a plan answer that can never be accepted.
  return latestReply?.nodeId === 'directReplyAgentflow_i10_v6_cross_session_input_prompt' &&
    /脚本已激活，请说明立即执行|请说明立即执行、单次定时或周期执行/.test(String(body?.text || ''))
}

// A cross-session write outside the case-preparation path (for example the
// final RUN_ON_DEMAND decision) ends the Flowise execution with an empty
// message: no Direct Reply, no Human Input.  The durable journey has already
// advanced, so the only correct continuation is to poll the journey again.
function crossSessionSilentPending(body) {
  return !stopped(body) && !String(body?.text || '').trim() &&
    Array.isArray(body?.agentFlowExecutedData) && body.agentFlowExecutedData.length > 0
}

// The cross-session chain ends a turn with an explicit "authoring queued /
// still processing" Direct Reply while the durable Journey keeps compiling
// asynchronously.  Neither reply is terminal: the driver must keep polling
// the authoritative journey instead of finalizing without candidate evidence.
function crossSessionAuthoringAsyncPending(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const latestReply = [...executed].reverse().find(item => String(item?.nodeId || '').startsWith('directReplyAgentflow_'))
  return [
    'directReplyAgentflow_i10_v6_cross_session_authoring_queued',
    'directReplyAgentflow_i10_v6_cross_session_authoring_processing'
  ].includes(String(latestReply?.nodeId || ''))
}

function safeWrite(name, body) {
  fs.mkdirSync(activeEvidenceRoot, { recursive: true })
  fs.writeFileSync(path.join(activeEvidenceRoot, name), `${JSON.stringify(body, null, 2)}\n`)
}

function setEvidenceRootForAcceptance(target) {
  const resolved = path.resolve(target)
  const allowed = path.resolve(root, '.data', 'evidence', 'i10')
  const relative = path.relative(allowed, resolved)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('I10_STAGE8_EVIDENCE_ROOT_OUTSIDE_I10')
  }
  activeEvidenceRoot = resolved
}

function serialized(value) {
  return JSON.stringify(value ?? {})
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function scenarioMetadata(transcript) {
  const text = serialized(transcript)
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const toolByNode = new Map(flow.nodes.map(node => [
    node.id,
    node.data?.inputs?.toolAgentflowSelectedToolConfig?.mcpActions?.[0]
  ]).filter(([, tool]) => typeof tool === 'string' && tool))
  const executedNodeIds = []
  for (const body of transcript) {
    for (const item of Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []) {
      if (typeof item?.nodeId === 'string') executedNodeIds.push(item.nodeId)
    }
  }
  return {
    journeyIds: unique([...text.matchAll(/journey_[0-9a-f-]{36}/g)].map(match => match[0])),
    candidateIds: unique([...text.matchAll(/candidate_[0-9a-f]{40}/g)].map(match => match[0])),
    certificateIds: unique([...text.matchAll(/certificate_[0-9a-f]{40}/g)].map(match => match[0])),
    scriptIds: unique([...text.matchAll(/script_[0-9a-f]{40}/g)].map(match => match[0])),
    imageIngestIds: unique([...text.matchAll(/imageingest_[0-9a-f-]{36}/g)].map(match => match[0])),
    ingestJobIds: unique([...text.matchAll(/ingest_[0-9a-f-]{36}/g)].map(match => match[0])),
    buildJobIds: unique([...text.matchAll(/buildjob_[0-9a-f-]{36}/g)].map(match => match[0])),
    verificationChallengeIds: unique([...text.matchAll(/verification_[0-9a-f-]{36}/g)].map(match => match[0])),
    mcpCallSequence: unique(executedNodeIds.map(nodeId => toolByNode.get(nodeId))),
    stateTransitions: unique([...text.matchAll(/\\?"(?:stage|status)\\?"\s*:\s*\\?"([A-Z][A-Z0-9_]*)\\?"/g)].map(match => match[1]))
  }
}

function extractOpaqueId(value, prefix) {
  return opaqueReferences.referencesIn(serialized(value), prefix).at(0) || null
}

function latestOpaqueId(value, prefix) {
  return opaqueReferences.latestReference(serialized(value), prefix)
}

function latestStructuredNumber(value, key) {
  const queue = [value]
  let found = null
  let inspected = 0
  while (queue.length > 0 && inspected < 50_000) {
    inspected += 1
    const current = queue.shift()
    if (!current || typeof current !== 'object') continue
    if (!Array.isArray(current) && Number.isFinite(Number(current[key]))) found = Number(current[key])
    queue.push(...(Array.isArray(current) ? current : Object.values(current)))
  }
  return found
}

function visitStructuredValues(value, visitor, maximum = 50_000) {
  const queue = [value]
  let inspected = 0
  while (queue.length > 0 && inspected < maximum) {
    inspected += 1
    const current = queue.shift()
    if (current && typeof current === 'object') {
      if (!Array.isArray(current) && visitor(current) === true) return current
      queue.push(...(Array.isArray(current) ? current : Object.values(current)))
      continue
    }
    if (typeof current !== 'string') continue
    const trimmed = current.trim()
    if (!trimmed || !/^[{[]/.test(trimmed)) continue
    try { queue.push(JSON.parse(trimmed)) } catch {}
  }
  return null
}

function findTaskTerminal(value, taskId = null) {
  return visitStructuredValues(value, current => {
    const currentTaskId = String(current.taskId || '')
    if (!/^task_[0-9a-f-]{36}$/i.test(currentTaskId)) return false
    if (taskId && currentTaskId !== taskId) return false
    if (!/^(SUCCEEDED|FAILED|CANCELLED|BLOCKED)$/i.test(String(current.status || ''))) return false
    if (!/^run_[0-9a-f-]{36}$/i.test(String(current.runId || ''))) return false
    if (String(current.status).toUpperCase() === 'SUCCEEDED' &&
      !/^(PASSED|SUCCEEDED)$/i.test(String(current.outcome || current.status || ''))) return false
    return true
  })
}

function findOnDemandInboxItem(value, taskId) {
  return visitStructuredValues(value, current => {
    if (current.taskId !== taskId || current.executionMode !== 'ON_DEMAND') return false
    if (!/^inbox_[0-9a-f-]{36}$/i.test(String(current.inboxId || ''))) return false
    if (!/^run_[0-9a-f-]{36}$/i.test(String(current.runId || ''))) return false
    if (!/^(PASSED|SUCCEEDED)$/i.test(String(current.outcome || ''))) return false
    if (!/^art_[0-9a-f-]{36}$/i.test(String(current.artifact?.artifactId || current.artifactId || ''))) return false
    return true
  })
}

function requireOnDemandTerminalEvidence(transcript, terminalText) {
  // Flowise appends the full prior execution history to every response. Search
  // newest responses first so a long authoring/image transcript cannot consume
  // the bounded traversal budget before the current task terminal is reached.
  const newestFirst = Array.isArray(transcript) ? [...transcript].reverse() : [transcript]
  let task = null
  for (const response of newestFirst) {
    task = findTaskTerminal(response)
    if (task) break
  }
  if (!task || String(task.status).toUpperCase() !== 'SUCCEEDED') {
    fail('I10_STAGE8_ON_DEMAND_TASK_TERMINAL_MISSING')
  }
  let inbox = null
  for (const response of newestFirst) {
    inbox = findOnDemandInboxItem(response, task.taskId)
    if (inbox) break
  }
  if (!inbox) fail('I10_STAGE8_ON_DEMAND_INBOX_TERMINAL_MISSING', { taskId: task.taskId })
  if (task.runId !== inbox.runId) {
    fail('I10_STAGE8_ON_DEMAND_RUN_ID_CONFLICT', { taskId: task.taskId })
  }
  const taskArtifactId = String(task.resultArtifactId || task.artifactId || '')
  const inboxArtifactId = String(inbox.artifact?.artifactId || inbox.artifactId || '')
  if (taskArtifactId && taskArtifactId !== inboxArtifactId) {
    fail('I10_STAGE8_ON_DEMAND_ARTIFACT_ID_CONFLICT', { taskId: task.taskId })
  }
  if (!/回归执行已结束|正式结果(?:已经|已)?(?:形成|写入|就绪)|执行(?:已经|已)?完成|修复复跑(?:已经|已)?结束/.test(String(terminalText || ''))) {
    fail('I10_STAGE8_USER_TERMINAL_SUMMARY_MISSING', { taskId: task.taskId })
  }
  return {
    taskId: task.taskId,
    runId: task.runId,
    inboxId: inbox.inboxId,
    artifactId: inboxArtifactId,
    outcome: 'PASSED',
    executionMode: 'ON_DEMAND'
  }
}

function findScheduledInboxItem(value, scheduleId) {
  return visitStructuredValues(value, current => {
      const artifactId = current?.artifact?.artifactId || current?.artifactId || current?.resultArtifactId
      if (current.scheduleId === scheduleId &&
        /^(ONE_TIME|RECURRING)$/.test(String(current.scheduleType || '')) &&
        /^inbox_[0-9a-f-]{36}$/i.test(String(current.inboxId || '')) &&
        /^task_[0-9a-f-]{36}$/i.test(String(current.taskId || '')) &&
        /^run_[0-9a-f-]{36}$/i.test(String(current.runId || '')) &&
        /^(?:art|artifact)_[0-9a-f-]{36}$/i.test(String(artifactId || '')) &&
        /^(PASSED|SUCCEEDED)$/i.test(String(current.outcome || current.status || ''))) return true
      return false
  }, 20_000)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function assertCandidateDeliveryEvidence(transcript, context) {
  const text = serialized(transcript)
  // The raw execution history of a long resume can hold hundreds of large
  // responses; one shared traversal budget was exhausted before reaching the
  // candidate payload.  Search each response newest-first instead: candidate
  // delivery evidence always lives in the latest compile/preview payload.
  const newestFirst = Array.isArray(transcript) ? [...transcript].reverse() : [transcript]
  let authoring = null
  for (const response of newestFirst) {
    authoring = findAuthoringEvidence(response)
    if (authoring) break
  }
  if (!authoring) fail('I10_STAGE8_MIDSCENE_EVIDENCE_MISSING', context)
  // The stability policy string only reaches the conversation while the
  // certificate is still being produced; on a fast worker the candidate can
  // certify between polls and the string never appears.  The certificate
  // reference is timing-independent, and finalizeRecord separately enforces
  // the authoritative invariant in SQLite (certificate ISSUED/PASSED plus
  // four unique PASSED validation runs), so accept either form here.
  if (!/I10_2X2_V1/.test(text) && !/certificate_[0-9a-f]{40}/i.test(text)) fail('I10_STAGE8_STABILITY_EVIDENCE_MISSING', context)
  if (!/(?:downloadUrl|downloadPath|\.cjs)/i.test(text)) fail('I10_STAGE8_SOURCE_DOWNLOAD_MISSING', context)
  if (!/[0-9a-f]{64}/i.test(text)) fail('I10_STAGE8_SOURCE_HASH_MISSING', context)
}

function findAuthoringEvidence(value) {
  const stack = Array.isArray(value) ? [...value] : [value]
  let inspected = 0
  while (stack.length > 0 && inspected < 50_000) {
    inspected += 1
    const current = stack.pop()
    if (current && typeof current === 'object') {
      if (!Array.isArray(current) &&
        current.invocation === 'REAL' &&
        current.provider === 'MIDSCENE' &&
        current.status === 'PLAYWRIGHT_VERIFIED' &&
        /^[0-9a-f]{64}$/i.test(String(current.actionTraceHash || '')) &&
        /^[0-9a-f]{64}$/i.test(String(current.playwrightFactHash || ''))) return current
      stack.push(...(Array.isArray(current) ? current : Object.values(current)))
      if (!Array.isArray(current) && current.authoringEvidence) stack.push(current.authoringEvidence)
      continue
    }
    if (typeof current !== 'string') continue
    const trimmed = current.trim()
    if (!trimmed || !/^[{[]/.test(trimmed)) continue
    try { stack.push(JSON.parse(trimmed)) } catch {}
  }
  return null
}

function findCaseDraft(value) {
  const queue = [value]
  let inspected = 0
  while (queue.length > 0 && inspected < 20_000) {
    inspected += 1
    const current = queue.shift()
    if (current && typeof current === 'object') {
      if (!Array.isArray(current) && current.schemaVersion === 'hengzhun-i10-case-draft-v1') return current
      queue.push(...(Array.isArray(current) ? current : Object.values(current)))
      continue
    }
    if (typeof current !== 'string') continue
    const trimmed = current.trim()
    if (!trimmed || !/^[{[]/.test(trimmed)) continue
    try { queue.push(JSON.parse(trimmed)) } catch {}
  }
  return null
}

function latestCaseDraft(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  for (let index = executed.length - 1; index >= 0; index -= 1) {
    const draft = findCaseDraft(executed[index])
    if (draft) return draft
  }
  return null
}

function feedbackFor(nodeId, mode, scenario, body, inputType) {
  if (nodeId === 'humanInputAgentflow_clarify') return scenario.clarification || '目标是门户账号密码登录后核对页眉姓名、头像与个人资料一致。'
  if (nodeId === 'humanInputAgentflow_ingest_confirm') {
    if (inputType !== 'VIDEO') return ''
    const draft = latestCaseDraft(body)
    if (!draft) fail('I10_STAGE8_VIDEO_DRAFT_MISSING')
    const missing = Array.isArray(draft.missingFields) ? draft.missingFields : []
    const allowedHumanFields = new Set(['targetSystem', 'entryUrl'])
    if (missing.some(field => !allowedHumanFields.has(field))) {
      fail('I10_STAGE8_VIDEO_CORRECTION_UNEXPECTED_GAPS', { missingFields: missing })
    }
    if (missing.length === 0) return ''
    const corrected = {
      ...draft,
      targetSystem: '复兴银行',
      entryUrl: `${scenario.portalUrl}/portal/login`,
      missingFields: []
    }
    return JSON.stringify({ corrections: [{ ordinal: 1, draft: corrected }] })
  }
  if (nodeId === 'humanInputAgentflow_run') {
    if (mode === 'ON_DEMAND') return '确认立即执行（ON_DEMAND），时区Asia/Shanghai。'
    if (mode === 'ONE_TIME') return `确认单次定时（ONE_TIME），执行时间${new Date(Date.now() + 120_000).toISOString()}，时区Asia/Shanghai，misfire为RUN_ONCE，重试0次。`
    return '确认周期执行（RECURRING），Cron为* * * * *，时区Asia/Shanghai，misfire为RUN_ONCE，重试0次。'
  }
  if (nodeId === 'humanInputAgentflow_repair_schedule') return '不创建新的修复版调度。'
  return ''
}

async function setFailureMode(base, mode) {
  if (!base) fail('I10_STAGE8_FAILURE_CONTROL_URL_MISSING')
  const result = await request(`${base}/__mode/${mode}`, { method: 'POST', timeoutMs: 10_000 })
  if (!result.response.ok) fail('I10_STAGE8_FAILURE_CONTROL_FAILED', { mode, status: result.response.status })
}

async function completeControlledVerification(base) {
  if (!base) fail('I10_STAGE8_FAILURE_CONTROL_URL_MISSING')
  const result = await request(`${base}/__verification/complete`, { method: 'POST', timeoutMs: 10_000 })
  if (!result.response.ok || result.body?.status !== 'completed') {
    fail('I10_STAGE8_VERIFICATION_CONTROL_FAILED', { status: result.response.status })
  }
}

async function controlledPortalHealth(base) {
  if (!base) fail('I10_STAGE8_FAILURE_CONTROL_URL_MISSING')
  const result = await request(`${base}/__health`, { timeoutMs: 10_000 })
  if (!result.response.ok || result.body?.status !== 'ok') {
    fail('I10_STAGE8_PORTAL_HEALTH_FAILED', { status: result.response.status })
  }
  return result.body
}

function retryablePredictionStatus(status) {
  return [500, 502, 503, 504].includes(Number(status))
}

function safePredictionFailure(body) {
  // Flowise may return a NodeVM/MCP error body on a non-2xx response.  Keep
  // the acceptance driver diagnosable without copying user text, credentials,
  // request data or provider responses into the evidence ledger.
  const source = body && typeof body === 'object' ? body : {}
  const candidates = [source.errorCode, source.code, source.name, source.error, source.message]
  const value = candidates.find(item => typeof item === 'string' && item.trim()) || ''
  const normalized = String(value)
    .replace(/(?:credential|token|password|authorization|bearer|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .trim()
  // Only return a compact error classifier.  Long free-form output is an
  // untrusted transport payload and must not become acceptance evidence.
  return normalized ? normalized.slice(0, 240) : 'FLOWISE_HTTP_ERROR'
}

async function predict(payload, { readOnlyRetry = false } = {}) {
  const maximumAttempts = readOnlyRetry ? 3 : 1
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const result = await request(`${flowiseBase}/api/v1/prediction/${publication.flowId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    })
    if (result.response.ok) return result.body
    if (!readOnlyRetry || !retryablePredictionStatus(result.response.status) || attempt === maximumAttempts) {
      fail('I10_STAGE8_FLOWISE_PREDICTION_FAILED', {
        status: result.response.status,
        attempts: attempt,
        readOnlyRetry,
        responseError: safePredictionFailure(result.body)
      })
    }
    await sleep(attempt * 2_000)
  }
}

// The compile -> preview read chain fails closed with I8_CANDIDATE_UNAVAILABLE
// (or I8_PREVIEW_FAILED) while the stability certificate is still being
// produced.  On polling paths that means "still compiling", not a defect.
// Tolerate only these two codes; every other failure stays fail-closed.
function candidatePreviewPendingError(error) {
  const haystack = `${String(error?.message || '')}\n${String(error?.details?.responseError || '')}`
  return /I8_CANDIDATE_UNAVAILABLE|I8_PREVIEW_FAILED/.test(haystack)
}

async function predictOrCandidatePending(payload) {
  try {
    return await predict(payload)
  } catch (error) {
    if (candidatePreviewPendingError(error)) return null
    throw error
  }
}

function findCredentialCapture(value) {
  const capture = visitStructuredValues(value, current =>
    /^credsession_[0-9a-f-]{36}$/i.test(String(current.sessionId || '')) &&
    typeof current.captureUrl === 'string' &&
    current.captureUrl.includes('#')
  )
  if (capture) return { sessionId: capture.sessionId, captureUrl: capture.captureUrl }
  return null
}

async function storeFixtureCredential(capture) {
  const username = process.env.I10_STAGE8_FIXTURE_USERNAME
  const password = process.env.I10_STAGE8_FIXTURE_PASSWORD
  if (!username || !password) fail('I10_STAGE8_FIXTURE_CREDENTIAL_MISSING')
  const target = new URL(capture.captureUrl)
  const captureToken = new URLSearchParams(target.hash.slice(1)).get('token')
  if (!captureToken) fail('I10_STAGE8_CREDENTIAL_CAPTURE_TOKEN_MISSING')
  const stored = await request(
    `http://127.0.0.1:18788/v1/i10/credentials/${capture.sessionId}:store`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ captureToken, username, password }),
      timeoutMs: 30_000
    }
  )
  if (!stored.response.ok || !/^credential_[0-9a-f-]{36}$/i.test(String(stored.body?.credentialRef || ''))) {
    fail('I10_STAGE8_CREDENTIAL_CAPTURE_STORE_FAILED', { status: stored.response.status })
  }
  return stored.body.credentialRef
}

async function managementConversation(question, sequence, expectedHumanNode = null) {
  const chatId = `i10-s8-management-${Date.now()}-${crypto.randomUUID()}`
  const transcript = []
  let body = await predict(
    { question, chatId, overrideConfig: { sessionId: chatId } },
    { readOnlyRetry: true }
  )
  transcript.push(body)
  safeWrite(`${sequence}-management-00.json`, body)
  let step = 0
  while (stopped(body)) {
    if (++step > 4) fail('I10_STAGE8_MANAGEMENT_TOO_MANY_HUMAN_GATES', { expectedHumanNode })
    const node = stopped(body)
    const exactProposalNode = 'humanInputAgentflow_i10_v3_decision'
    if (!expectedHumanNode ||
        (node.nodeId !== expectedHumanNode && node.nodeId !== exactProposalNode)) {
      fail('I10_STAGE8_MANAGEMENT_UNEXPECTED_HUMAN_GATE', { expectedHumanNode, actual: node.nodeId })
    }
    body = await predict({
      question: 'Proceed', chatId: body.chatId || chatId,
      humanInput: {
        type: 'proceed', startNodeId: node.nodeId,
        feedback: '确认停用该调度；保留历史结果、脚本和审计记录。'
      },
      overrideConfig: { sessionId: body.sessionId || chatId }
    })
    transcript.push(body)
    safeWrite(`${sequence}-management-${String(step).padStart(2, '0')}-${node.nodeId}.json`, body)
  }
  return { body, transcript }
}

async function awaitScheduledResult(scheduleId, mode, sequence) {
  const deadline = Date.now() + scheduleWaitMs
  let attempt = 0
  while (Date.now() < deadline) {
    attempt += 1
    const query = await managementConversation(
      `查询调度${scheduleId}最近一次正式回归结果，只返回Harness结果收件箱中的记录。`,
      `${sequence}-result-${String(attempt).padStart(2, '0')}`
    )
    const text = serialized(query.transcript)
    const item = findScheduledInboxItem(query.transcript, scheduleId)
    if (item) {
      return {
        scheduleId,
        scheduleType: item.scheduleType,
        inboxId: item.inboxId,
        taskId: item.taskId,
        runId: item.runId,
        artifactId: item.artifact?.artifactId || item.artifactId || item.resultArtifactId,
        outcome: 'PASSED',
        evidenceHash: sha256(text),
        attempts: attempt
      }
    }
    await sleep(schedulePollMs)
  }
  fail('I10_STAGE8_SCHEDULED_RESULT_TIMEOUT', { scheduleId, mode, waitMs: scheduleWaitMs })
}

async function disableRecurringSchedule(scheduleId, sequence) {
  const disabled = await managementConversation(
    `停用调度${scheduleId}。必须先展示该调度并请求我确认，不得停用其他调度。`,
    `${sequence}-disable`,
    'humanInputAgentflow_schedule_disable'
  )
  const text = serialized(disabled.transcript)
  if (!text.includes(scheduleId) || !/DISABLED|已停用/.test(text)) {
    fail('I10_STAGE8_RECURRING_DISABLE_NOT_PROVEN', { scheduleId })
  }
  return { scheduleId, status: 'DISABLED', evidenceHash: sha256(text) }
}

function primaryInputFor(inputType, scenario, variant = 'STANDARD') {
  if (inputType === 'CASE_FILE') {
    return variant === 'F008_FILE_REVISE_RETAIN'
      ? scenario.correctionCaseFilePath
      : variant === 'F009_FILE_IMAGE_ON_DEMAND'
        ? scenario.imageMergeCaseFilePath
        : scenario.caseFilePath
  }
  if (inputType === 'VIDEO') {
    return variant === 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND'
      ? scenario.lowConfidenceVideoPath
      : variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN'
        ? scenario.conflictVideoPath
      : scenario.videoPath
  }
  return null
}

function imageUploadDescriptor(target) {
  const bytes = fs.readFileSync(target)
  const extension = path.extname(target).toLowerCase()
  const detected = bytes.subarray(0, 12)
  const isPng = detected.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJpeg = detected[0] === 0xff && detected[1] === 0xd8
  const isWebp = detected.subarray(0, 4).toString('ascii') === 'RIFF'
    && detected.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!isPng && !isJpeg && !isWebp) {
    fail('I10_STAGE8_SUPPORTING_IMAGE_CONTENT_INVALID', { extension, size: bytes.byteLength })
  }
  const format = isPng ? { extension: '.png', mime: 'image/png' }
    : isJpeg ? { extension: '.jpg', mime: 'image/jpeg' }
      : { extension: '.webp', mime: 'image/webp' }
  const name = `${path.basename(target, extension)}${format.extension}`
  return { type: 'file', name, mime: format.mime, data: `data:${format.mime};base64,${bytes.toString('base64')}` }
}

function uploadFor(inputType, scenario, supportingImageCount = 0, variant = 'STANDARD') {
  const uploads = []
  if (inputType !== 'NATURAL_LANGUAGE') {
    const target = primaryInputFor(inputType, scenario, variant)
    const extension = path.extname(target).toLowerCase()
    const mime = inputType === 'CASE_FILE'
      ? (extension === '.xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : extension === '.json'
            ? 'application/json'
            : 'text/csv')
      : 'video/mp4'
    uploads.push({ type: 'file', name: path.basename(target), mime, data: `data:${mime};base64,${fs.readFileSync(target).toString('base64')}` })
  }
  const supportingTargets = variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN'
    ? [scenario.conflictSupportingImagePath]
    : scenario.supportingImagePaths.slice(0, supportingImageCount)
  for (const target of supportingTargets) {
    uploads.push(imageUploadDescriptor(target))
  }
  return uploads.length ? uploads : undefined
}

async function runConversation({
  inputType,
  mode,
  reverse,
  scenario,
  sequence,
  variant = 'STANDARD',
  supportingImageCount = 0,
  caseDefinition = null,
  resumeJourneyId = null,
  // Terminal validations must see the whole evidence chain, not only the
  // responses produced by this resume turn: candidate delivery, authoring and
  // 2x2 evidence were written by earlier sessions of the same run directory.
  seedTranscript = null,
  // Resuming the ORIGINAL chat preserves its session state (naturalLanguage,
  // credentialRef, crossSessionExecutionPlan, confirmed image facts).  A fresh
  // chat forces the confirmed-image chain to rebuild a deficient draft that
  // misses every case field.
  resumeChatId = null,
  resumeSessionId = null
}) {
  const chatId = resumeChatId || `i10-s8-${inputType.toLowerCase()}-${mode.toLowerCase()}-${reverse ? 'reverse' : 'forward'}-${Date.now()}`
  // Flowise chat ids are presentation identifiers and may carry a descriptive
  // prefix.  The Agentflow's MCP contracts, however, use $flow.sessionId as
  // an opaque session reference.  Keep that value UUID-shaped for the whole
  // conversation instead of accidentally binding it to the longer chat id.
  // This mirrors the actual Flowise UI session contract and prevents an
  // otherwise valid authoring approval from failing at the MCP boundary.
  const flowSessionId = resumeSessionId || crypto.randomUUID()
  const credentialClause = variant === 'F002_CAPTURE_ACTIVATE_NO_RUN'
    ? '当前尚未录入安全凭据，请先创建本机安全凭据录入会话；不得要求我在对话中输入明文账号密码'
    : `使用已有安全凭据引用${scenario.credentialRef}`
  const sourceDescription = variant === 'F014_VERIFICATION_RESUME_ON_DEMAND'
    ? `创建并立即执行一个新的转账自动化回归案例：目标系统为复兴银行，${credentialClause}。从${scenario.portalUrl}/portal/login登录后进入转账汇款，收款户名填写“测试收款人”，收款账号填写“6222000000000001”，金额填写“1.00”，用途填写“自动化回归测试”；第一次确认后会弹出U盾验证。Midscene必须临场识别该阻断并暂停，提醒用户只在U盾或被测页面直接确认，不得在Flowise输入PIN、验证码或口令。确认完成后必须在同一个浏览器和同一个任务继续，进入单号查询页面并验证单号存在、状态为“受理成功”。`
    : caseDefinition && typeof caseDefinition.naturalLanguage === 'string' && caseDefinition.naturalLanguage.trim()
      ? `创建并执行一个新的自动化回归案例：目标系统为${caseDefinition.targetSystem || '复兴银行'}，${credentialClause}，入口地址为${scenario.portalUrl}/portal/login。${caseDefinition.naturalLanguage.trim()}`
      : `创建并执行一个新的自动化回归案例：目标系统为复兴银行，${credentialClause}，验证客户在${scenario.portalUrl}/portal/login输入账号密码登录后，右上角姓名和头像与个人资料一致。`
  const question = variant === 'F006_IMAGE_ONLY_CLARIFY_RECURRING'
    ? ''
    : inputType === 'NATURAL_LANGUAGE'
    ? `${sourceDescription}${supportingImageCount ? ` 本消息另有${supportingImageCount}张补充图片，用于提取页面字段和成功状态事实。` : ''}`
    : `${sourceDescription} 请导入本次随消息上传的${inputType === 'CASE_FILE' ? '自动化测试案例文件' : '成功操作录屏'}。${supportingImageCount ? `另有${supportingImageCount}张补充图片需要合并为可追溯事实。` : ''}`
  const transcript = Array.isArray(seedTranscript) ? [...seedTranscript] : []
  const primaryInputPath = primaryInputFor(inputType, scenario, variant)
  const inputArtifactHashes = [
    ...(primaryInputPath ? [sha256(fs.readFileSync(primaryInputPath))] : []),
    ...(variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN'
      ? [scenario.conflictSupportingImagePath]
      : scenario.supportingImagePaths.slice(0, supportingImageCount))
      .map(target => sha256(fs.readFileSync(target)))
  ]
  if (variant === 'F013_AUTHORING_FAIL_RETRY_RETAIN') {
    const injectionRoot = path.join(root, '.data', 'tests', 'i10-acceptance-injections')
    fs.mkdirSync(injectionRoot, { recursive: true })
    fs.writeFileSync(path.join(injectionRoot, 'authoring-fail-next.json'), `${JSON.stringify({
      schemaVersion: 'hengzhun-i10-authoring-failure-injection-v1',
      failureCode: 'I10_MIDSCENE_MODEL_TIMEOUT',
      createdAt: new Date().toISOString(),
      scenarioId: 'F-013'
    }, null, 2)}\n`, 'utf8')
  }
  if (variant === 'F015_STABILITY_FAIL_REVISE_RETAIN') {
    const injectionRoot = path.join(root, '.data', 'tests', 'i10-acceptance-injections')
    fs.mkdirSync(injectionRoot, { recursive: true })
    fs.writeFileSync(path.join(injectionRoot, 'stability-fail-next.json'), `${JSON.stringify({
      schemaVersion: 'hengzhun-i10-stability-failure-injection-v1',
      failureCode: 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED',
      viewportId: 'NARROW_390X844',
      sequenceNo: 1,
      createdAt: new Date().toISOString(),
      scenarioId: 'F-015'
    }, null, 2)}\n`, 'utf8')
  }
  if (variant === 'F014_VERIFICATION_RESUME_ON_DEMAND') {
    await setFailureMode(scenario.failureControlUrl, 'verification')
  }
  let body
  if (resumeJourneyId) {
    // S4 recovery entry: resume polling the authoritative journey through the
    // cross-session chain instead of replaying a fresh natural-language case.
    // A fresh case would duplicate the frozen case and the authoring job that
    // the interrupted run already created as side effects.  When the interrupt
    // happened before any journey existed (image-ingest stage), resume the
    // confirmed-image chain by its opaque ingest reference instead.
    const resumeQuestion = /^imageingest_[0-9a-f-]{36}$/i.test(resumeJourneyId)
      ? `继续已确认图片 ${resumeJourneyId}`
      : `继续处理旅程${resumeJourneyId}：查询作者化、Playwright验证和稳定性运行结果。`
    body = await predict({
      question: resumeQuestion,
      chatId,
      overrideConfig: { sessionId: flowSessionId }
    })
    transcript.push(body)
    safeWrite(`${sequence}-resume-00-journey-poll.json`, body)
  } else {
    body = await predict({ question, chatId, uploads: uploadFor(inputType, scenario, supportingImageCount, variant), overrideConfig: { sessionId: flowSessionId } })
    transcript.push(body)
    safeWrite(`${sequence}-00-start.json`, body)
  }
  if (!resumeJourneyId && variant === 'F002_CAPTURE_ACTIVATE_NO_RUN') {
    const capture = findCredentialCapture(body)
    if (!capture) fail('I10_LEDGER_F002_CREDENTIAL_CAPTURE_MISSING')
    await storeFixtureCredential(capture)
    body = await predict({
      question: '继续',
      chatId: body.chatId || chatId,
      overrideConfig: { sessionId: body.sessionId || flowSessionId }
    })
    transcript.push(body)
    safeWrite(`${sequence}-01-credential-captured.json`, body)
  }
  let step = 0
  let failureInjected = false
  let recovered = false
  let attachmentOnlyCredentialCaptured = false
  let attachmentCorrectionSubmitted = false
  let videoCorrectionSubmitted = false
  let lowConfidenceVideoObserved = false
  let lowConfidenceOriginalVersion = null
  let crossSourceConflictObserved = false
  let verificationReadyGateCount = 0
  let verificationActionGateCount = 0
  const verificationPhaseEvidence = []
  let formalVerificationArmed = false
  let authoringFinalHealth = null
  while (stopped(body) || journeyProcessingPending(body) || ingestProcessingPending(body) || imageProcessingPending(body) || authoringProcessingPending(body) || targetProfileTransitionPending(body) || imageFactsTransitionPending(body) || imageConfirmedTransitionPending(body) || isolatedJourneyTransitionPending(body) || crossSessionProposalDecisionPending(body) || crossSessionToolContinuationPending(body) || crossSessionAuthoringAsyncPending(body) || crossSessionExecutionPlanPending(body) || crossSessionSilentPending(body) ||
    (variant === 'F006_IMAGE_ONLY_CLARIFY_RECURRING' && Boolean(findCredentialCapture(body)))) {
    // Real MiMo authoring may span several minutes. Each asynchronous status
    // poll is a human gate continuation, so bound wall time without treating
    // legitimate visual work as a workflow loop defect.
    if (++step > 80) fail('I10_STAGE8_TOO_MANY_HUMAN_GATES', { inputType, mode, reverse })
    traceStage8(`loop gate ${step}: ${stopped(body)?.nodeId || (targetProfileTransitionPending(body) ? 'target-transition' : (imageFactsTransitionPending(body) ? 'image-facts-transition' : (imageConfirmedTransitionPending(body) ? 'image-confirmed-transition' : (isolatedJourneyTransitionPending(body) ? 'isolated-journey-transition' : (crossSessionProposalDecisionPending(body) ? 'cross-session-proposal-decision' : (crossSessionToolContinuationPending(body) ? 'cross-session-tool-continuation' : 'async'))))))}`)
    const attachmentOnlyCapture = variant === 'F006_IMAGE_ONLY_CLARIFY_RECURRING'
      ? findCredentialCapture(body)
      : null
    if (attachmentOnlyCapture) {
      if (attachmentOnlyCredentialCaptured) fail('I10_LEDGER_F006_CREDENTIAL_CAPTURE_REPEATED')
      await storeFixtureCredential(attachmentOnlyCapture)
      attachmentOnlyCredentialCaptured = true
      body = await predict({
        question: `继续：业务目标是验证复兴银行门户登录后页眉姓名、头像与个人资料一致；入口地址为${scenario.portalUrl}/portal/login。`,
        chatId: body.chatId || chatId,
        overrideConfig: { sessionId: body.sessionId || flowSessionId }
      })
      transcript.push(body)
      safeWrite(`${sequence}-${String(step).padStart(2, '0')}-credential-and-business-supplement.json`, body)
      continue
    }
    const node = stopped(body)
    if (!node) {
      const journeyId = latestOpaqueId(transcript, 'journey')
      if (!journeyId && !imageFactsTransitionPending(body) && !imageConfirmedTransitionPending(body)) fail('I10_STAGE8_ASYNC_JOURNEY_ID_MISSING', { inputType, mode, reverse })
      if (imageFactsTransitionPending(body)) {
        const imageIngestId = latestOpaqueId(transcript, 'imageingest')
        if (!imageIngestId) fail('I10_STAGE8_IMAGE_FACTS_INGEST_ID_MISSING', { inputType, mode, reverse })
        body = await predict({
          question: `确认图片事实 ${imageIngestId}`,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-image-facts-transition-resume.json`, body)
        continue
      }
      if (imageConfirmedTransitionPending(body)) {
        const imageIngestId = latestOpaqueId(transcript, 'imageingest')
        if (!imageIngestId) fail('I10_STAGE8_IMAGE_FACTS_INGEST_ID_MISSING', { inputType, mode, reverse })
        body = await predict({
          question: `继续已确认图片 ${imageIngestId}`,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-image-confirmed-transition-resume.json`, body)
        continue
      }
      if (isolatedJourneyTransitionPending(body)) {
        if (!journeyId) fail('I10_STAGE8_ASYNC_JOURNEY_ID_MISSING', { inputType, mode, reverse })
        body = await predict({
          question: `继续处理旅程${journeyId}：继续案例准备`,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-isolated-journey-transition-resume.json`, body)
        continue
      }
      if (crossSessionExecutionPlanPending(body)) {
        if (!journeyId) fail('I10_STAGE8_ASYNC_JOURNEY_ID_MISSING', { inputType, mode, reverse })
        const planAnswer = mode === 'ONE_TIME'
          ? `继续处理旅程${journeyId}：确认单次定时（ONE_TIME），执行时间${new Date(Date.now() + 120_000).toISOString()}，时区Asia/Shanghai。`
          : mode === 'RECURRING'
            ? `继续处理旅程${journeyId}：确认周期执行（RECURRING），Cron为* * * * *，时区Asia/Shanghai。`
            : `继续处理旅程${journeyId}：确认立即执行（ON_DEMAND），时区Asia/Shanghai。`
        body = await predict({
          question: planAnswer,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-cross-session-execution-plan.json`, body)
        continue
      }
      if (crossSessionProposalDecisionPending(body)) {
        if (!journeyId) fail('I10_STAGE8_ASYNC_JOURNEY_ID_MISSING', { inputType, mode, reverse })
        body = await predict({
          question: `确认冻结案例提案 ${journeyId}`,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-cross-session-proposal-approve.json`, body)
        continue
      }
      if (crossSessionToolContinuationPending(body)) {
        if (!journeyId) fail('I10_STAGE8_ASYNC_JOURNEY_ID_MISSING', { inputType, mode, reverse })
        const polled = await predictOrCandidatePending({
          question: `继续处理旅程${journeyId}：继续作者化与候选编译。`,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        if (!polled) {
          // Null means "preview not ready, still compiling".  Reassigning body
          // to null here would turn every pending predicate false and exit the
          // loop into the terminal assert, so keep the previous body instead.
          traceStage8(`candidate preview not ready at gate ${step}; polling again`)
          await sleep(15_000)
          continue
        }
        body = polled
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-cross-session-tool-continuation.json`, body)
        continue
      }
      if (targetProfileTransitionPending(body)) {
        traceStage8(`resuming frozen proposal after target transition at gate ${step}`)
        body = await predict({
          question: `确认冻结案例提案 ${journeyId}`,
          chatId: body.chatId || chatId,
          overrideConfig: { sessionId: body.sessionId || flowSessionId }
        })
        transcript.push(body)
        safeWrite(`${sequence}-${String(step).padStart(2, '0')}-target-profile-transition-resume.json`, body)
        traceStage8(`received ${stopped(body)?.nodeId || 'terminal-or-async'} after target transition resume`)
        continue
      }
      await sleep(15_000)
      const resumePrefix = `继续处理旅程${journeyId}：`
      const polled = await predictOrCandidatePending({
        question: ingestProcessingPending(body) || journeyProcessingPending(body)
          ? `${resumePrefix}查询附件导入、抽帧、本机ONNX OCR和文字变化时间线结果。`
          : imageProcessingPending(body)
          ? `${resumePrefix}查询补充图片处理结果。`
          : `${resumePrefix}查询作者化、Playwright验证和稳定性运行结果。`,
        chatId: body.chatId || chatId,
        overrideConfig: { sessionId: body.sessionId || flowSessionId }
      })
      if (!polled) {
        // Same null-body guard as the tool-continuation branch above.
        traceStage8(`candidate preview not ready at gate ${step}; polling again`)
        continue
      }
      body = polled
      transcript.push(body)
      safeWrite(`${sequence}-${String(step).padStart(2, '0')}-image-processing-poll.json`, body)
      continue
    }
    traceStage8(`continuing ${node.nodeId} at gate ${step}`)
    // A normal positive-path acceptance sequence must never turn an authoring
    // failure into an implicit retry.  The retry gate is deliberately a human
    // decision point and is exercised only by F013.  Previously the generic
    // Human Input driver clicked proceed here, creating a fresh build job on
    // every polling cycle after a real Midscene failure and polluting the
    // acceptance ledger.
    if (node.nodeId === 'humanInputAgentflow_i10_v4_authoring_retry' &&
        variant !== 'F013_AUTHORING_FAIL_RETRY_RETAIN') {
      fail('I10_STAGE8_AUTHORING_FAILED_NO_IMPLICIT_RETRY', {
        inputType,
        mode,
        reverse,
        variant,
        instruction: '作者化失败已保留；正向验收不会自动批准重新作者化。'
      })
    }
    if (reverse && node.nodeId === 'humanInputAgentflow_run' && !failureInjected) {
      await setFailureMode(scenario.failureControlUrl, 'changed')
      failureInjected = true
    }
    if (reverse && node.nodeId === 'humanInputAgentflow_repair_rerun' && !recovered) {
      await setFailureMode(scenario.failureControlUrl, 'recovered')
      recovered = true
    }
    if (variant === 'F014_VERIFICATION_RESUME_ON_DEMAND' &&
        [
          'humanInputAgentflow_i10_v4_verification_ready',
          'humanInputAgentflow_i10_v4_formal_verification_ready'
        ].includes(node.nodeId)) {
      verificationReadyGateCount += 1
    }
    if (variant === 'F014_VERIFICATION_RESUME_ON_DEMAND' &&
        [
          'humanInputAgentflow_i10_v4_verification_action',
          'humanInputAgentflow_i10_v4_formal_verification_action'
        ].includes(node.nodeId)) {
      if (verificationReadyGateCount <= verificationActionGateCount) {
        fail('I10_LEDGER_F014_VERIFICATION_GATE_ORDER_INVALID')
      }
      await completeControlledVerification(scenario.failureControlUrl)
      verificationActionGateCount += 1
      verificationPhaseEvidence.push({
        phase: formalVerificationArmed ? 'FORMAL_RUN' : 'AUTHORING',
        completedAt: new Date().toISOString(),
        portal: await controlledPortalHealth(scenario.failureControlUrl)
      })
    }
    if (variant === 'F014_VERIFICATION_RESUME_ON_DEMAND' &&
        node.nodeId === 'humanInputAgentflow_run' &&
        !formalVerificationArmed) {
      authoringFinalHealth = await controlledPortalHealth(scenario.failureControlUrl)
      const authoringExecutionCounts = Object.values(authoringFinalHealth.transferConfirmCountByExecution || {})
      if (authoringExecutionCounts.length < 2 ||
          authoringExecutionCounts.some(count => count !== 1) ||
          !authoringFinalHealth.verificationCompleted) {
        fail('I10_LEDGER_F014_AUTHORING_TRANSFER_EXECUTION_COUNT_INVALID', {
          transferFirstConfirmCount: authoringFinalHealth.transferFirstConfirmCount,
          executionCount: authoringExecutionCounts.length,
          transferConfirmCountByExecution: authoringFinalHealth.transferConfirmCountByExecution,
          verificationCompleted: authoringFinalHealth.verificationCompleted
        })
      }
      await setFailureMode(scenario.failureControlUrl, 'verification')
      const armedHealth = await controlledPortalHealth(scenario.failureControlUrl)
      if (armedHealth.transferFirstConfirmCount !== 0 ||
          armedHealth.verificationCompleted) {
        fail('I10_LEDGER_F014_FORMAL_VERIFICATION_ARM_FAILED', armedHealth)
      }
      formalVerificationArmed = true
    }
    const retainVariant = [
      'F003_REVISE_RETAIN',
      'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN',
      'F008_FILE_REVISE_RETAIN',
      'F012_VIDEO_IMAGE_CONFLICT_RETAIN',
      'F013_AUTHORING_FAIL_RETRY_RETAIN',
      'F015_STABILITY_FAIL_REVISE_RETAIN'
    ].includes(variant)
    const videoDraft = inputType === 'VIDEO' &&
      node.nodeId === 'humanInputAgentflow_i10_v3_ingest_confirm'
      ? latestCaseDraft(body)
      : null
    const videoNeedsCorrection = Boolean(
      videoDraft &&
      !videoCorrectionSubmitted &&
      Array.isArray(videoDraft.missingFields) &&
      videoDraft.missingFields.length > 0
    )
    if (variant === 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND' &&
        videoDraft && Array.isArray(videoDraft.missingFields) &&
        videoDraft.missingFields.includes('lowConfidenceActions')) {
      lowConfidenceVideoObserved = true
      lowConfidenceOriginalVersion = latestStructuredNumber(body, 'version') || lowConfidenceOriginalVersion
    }
    if (variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN' &&
        videoDraft && Array.isArray(videoDraft.missingFields) &&
        videoDraft.missingFields.includes('crossSourceConflict:PAGE_LABEL')) {
      crossSourceConflictObserved = true
    }
    const reject = node.nodeId === 'humanInputAgentflow_repair_schedule' ||
      (['F003_REVISE_RETAIN', 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN'].includes(variant) && (
        node.nodeId === 'humanInputAgentflow_i10_v3_decision' ||
        node.nodeId === 'humanInputAgentflow_activate'
      )) ||
      (variant === 'F008_FILE_REVISE_RETAIN' && (
        node.nodeId === 'humanInputAgentflow_activate' ||
        (node.nodeId === 'humanInputAgentflow_i10_v3_ingest_confirm' && !attachmentCorrectionSubmitted)
      )) ||
      (variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_activate') ||
      (variant === 'F013_AUTHORING_FAIL_RETRY_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_activate') ||
      (variant === 'F015_STABILITY_FAIL_REVISE_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_activate') ||
      videoNeedsCorrection ||
      (variant === 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_i10_v4_image_facts_gate') ||
      (variant === 'F002_CAPTURE_ACTIVATE_NO_RUN' && node.nodeId === 'humanInputAgentflow_run')
    const delay = /generation|ingest_wait|image_wait|repair_wait/.test(node.nodeId) ? 15_000 : 0
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    const feedback = variant === 'F006_IMAGE_ONLY_CLARIFY_RECURRING' &&
      node.nodeId === 'humanInputAgentflow_clarify'
      ? `业务目标是验证复兴银行门户登录后页眉姓名、头像与个人资料一致；入口地址为${scenario.portalUrl}/portal/login；使用已有安全凭据引用${scenario.credentialRef}。`
      : variant === 'F003_REVISE_RETAIN' && node.nodeId === 'humanInputAgentflow_i10_v4_case_correction'
      ? '将案例名称改为“复兴银行门户登录与资料一致性回归”；保留入口地址、凭据引用、执行步骤和预期结果。'
      : variant === 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_i10_v4_image_correction_input'
        ? '登录标识以“用户名”事实为准；成功页姓名采用第二张图片对应事实；其余图片事实保持确认。'
      : variant === 'F008_FILE_REVISE_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_i10_v4_ingest_correction'
        ? `将第1条案例的入口地址改为${scenario.portalUrl}/portal/login；其余字段保持不变。`
      : inputType === 'VIDEO' &&
        node.nodeId === 'humanInputAgentflow_i10_v4_ingest_correction'
        ? variant === 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND'
          ? `将第1条视频案例的目标系统改为“复兴银行”，入口地址改为${scenario.portalUrl}/portal/login；被遮挡的低置信度动作应修正为“点击登录按钮”，预期结果为“登录成功并进入主页”；其余已确认的视频事实、来源、步骤和断言保持不变，并清除已纠正的lowConfidenceActions缺口。`
          : variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN'
            ? `将第1条视频案例的目标系统改为“复兴银行”，入口地址改为${scenario.portalUrl}/portal/login；页面名称冲突采用补充图片中的“个人资料”为权威事实，将步骤和断言中的“客户资料”统一修订为“个人资料”；保留视频旧值和图片新值的双来源溯源，并清除crossSourceConflict:PAGE_LABEL缺口。`
            : `将第1条视频案例的目标系统改为“复兴银行”，入口地址改为${scenario.portalUrl}/portal/login；其余视频事实、步骤和断言保持不变。`
      : feedbackFor(node.nodeId, mode, scenario, body, inputType)
    body = await predict({
      question: reject ? 'Reject' : (feedback || 'Proceed'), chatId: body.chatId || chatId,
      humanInput: { type: reject ? 'reject' : 'proceed', startNodeId: node.nodeId, feedback },
      overrideConfig: { sessionId: body.sessionId || flowSessionId }
    })
    transcript.push(body)
    safeWrite(`${sequence}-${String(step).padStart(2, '0')}-${node.nodeId}.json`, body)
    traceStage8(`received ${stopped(body)?.nodeId || 'terminal-or-async'} after ${node.nodeId}`)
    if (variant === 'F008_FILE_REVISE_RETAIN' &&
        node.nodeId === 'humanInputAgentflow_i10_v4_ingest_correction') {
      attachmentCorrectionSubmitted = true
    }
    if (inputType === 'VIDEO' &&
        node.nodeId === 'humanInputAgentflow_i10_v4_ingest_correction') {
      videoCorrectionSubmitted = true
    }
  }
  const text = String(body?.text || '')
  if (variant === 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND') {
    const finalDraft = latestCaseDraft(body) || findCaseDraft(transcript)
    if (!lowConfidenceVideoObserved || !videoCorrectionSubmitted ||
        !finalDraft || (Array.isArray(finalDraft.missingFields) && finalDraft.missingFields.length > 0)) {
      fail('I10_LEDGER_F011_LOW_CONFIDENCE_CORRECTION_EVIDENCE_INVALID', {
        lowConfidenceVideoObserved,
        videoCorrectionSubmitted,
        remainingMissingFields: Array.isArray(finalDraft?.missingFields) ? finalDraft.missingFields : null
      })
    }
  }
  assertCandidateDeliveryEvidence(transcript, { inputType, mode, reverse })
  if (supportingImageCount > 0) {
    const multimodal = scenarioMetadata(transcript)
    // The terminal reply intentionally contains only a short human summary.
    // On v6 it therefore need not repeat the early CaseDraft object.  Require
    // the immutable image tool sequence, its opaque ingest reference, and the
    // selected fact payload observed anywhere in this same public Flowise
    // transcript instead of falsely treating a compact terminal reply as an
    // OCR-chain failure.
    const transcriptText = serialized(transcript)
    // Flowise v6 intentionally presents an OCR summary card instead of the
    // raw CaseDraft object at the image-confirmation gate.  The selected facts
    // remain available to Harness, but are not repeated as `caseFacts` in the
    // public text response.  Treat the public OCR-success and selected-fact
    // count as the user-visible evidence, while the three immutable MCP calls
    // prove ingest, read-back and user decision.  Requiring a private internal
    // JSON property here previously rejected a fully completed image chain.
    const hasSelectedImageFacts = /本机OCR：\s*SUCCEEDED/i.test(transcriptText) &&
      /主控筛选事实：\s*[1-9]\d*条/.test(transcriptText)
    if (!multimodal.imageIngestIds.length ||
        !multimodal.mcpCallSequence.includes('image_ingest_submit') ||
        !multimodal.mcpCallSequence.includes('image_ingest_get') ||
        !multimodal.mcpCallSequence.includes('image_ingest_decision_submit') ||
        !hasSelectedImageFacts) {
      fail('I10_STAGE8_SUPPORTING_IMAGE_EVIDENCE_MISSING', { supportingImageCount })
    }
  }
  if ([
    'F003_REVISE_RETAIN',
    'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN',
    'F008_FILE_REVISE_RETAIN',
    'F012_VIDEO_IMAGE_CONFLICT_RETAIN',
    'F013_AUTHORING_FAIL_RETRY_RETAIN',
    'F015_STABILITY_FAIL_REVISE_RETAIN'
  ].includes(variant)) {
    const structured = scenarioMetadata(transcript)
    if (!structured.candidateIds.length || structured.mcpCallSequence.includes('run_submit') ||
        structured.mcpCallSequence.includes('schedule_create') ||
        !/保留|未激活|不挂载/.test(text)) {
      fail('I10_LEDGER_RETAIN_TERMINAL_INVALID', { variant })
    }
    if (variant === 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN' && (
      inputArtifactHashes.length !== 2 ||
      new Set(inputArtifactHashes).size !== 2 ||
      !structured.mcpCallSequence.includes('image_ingest_submit') ||
      !structured.mcpCallSequence.includes('image_ingest_get') ||
      !structured.mcpCallSequence.includes('image_ingest_decision_submit')
    )) {
      fail('I10_LEDGER_F005_MULTI_IMAGE_DECISION_EVIDENCE_INVALID')
    }
    if (variant === 'F008_FILE_REVISE_RETAIN' && (
      inputArtifactHashes.length !== 1 ||
      !structured.mcpCallSequence.includes('ingest_submit') ||
      !structured.mcpCallSequence.includes('ingest_get') ||
      !structured.mcpCallSequence.includes('ingest_decision_submit') ||
      !attachmentCorrectionSubmitted
    )) {
      fail('I10_LEDGER_F008_FILE_REVISION_EVIDENCE_INVALID')
    }
    if (variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN') {
      const finalDraft = latestCaseDraft(body) || findCaseDraft(transcript)
      const provenance = Array.isArray(finalDraft?.caseFacts)
        ? finalDraft.caseFacts.flatMap(fact => Array.isArray(fact.provenanceRefs) ? fact.provenanceRefs : [])
        : []
      if (!crossSourceConflictObserved ||
          inputArtifactHashes.length !== 2 ||
          new Set(inputArtifactHashes).size !== 2 ||
          !structured.mcpCallSequence.includes('ingest_submit') ||
          !structured.mcpCallSequence.includes('image_ingest_submit') ||
          !structured.mcpCallSequence.includes('image_ingest_decision_submit') ||
          !structured.mcpCallSequence.includes('ingest_decision_submit') ||
          !videoCorrectionSubmitted ||
          !provenance.some(ref => String(ref).startsWith('video:')) ||
          !provenance.some(ref => String(ref).startsWith('image:')) ||
          (Array.isArray(finalDraft?.missingFields) && finalDraft.missingFields.length > 0)) {
        fail('I10_LEDGER_F012_CONFLICT_RESOLUTION_EVIDENCE_INVALID', {
          inputHashCount: inputArtifactHashes.length,
          crossSourceConflictObserved,
          videoCorrectionSubmitted,
          hasVideoProvenance: provenance.some(ref => String(ref).startsWith('video:')),
          hasImageProvenance: provenance.some(ref => String(ref).startsWith('image:')),
          remainingMissingFields: finalDraft?.missingFields || null
        })
      }
    }
    if (variant === 'F013_AUTHORING_FAIL_RETRY_RETAIN') {
      const failedTaskGateSeen = transcript.some(item =>
        (item.agentFlowExecutedData || []).some(executed =>
          executed.nodeId === 'humanInputAgentflow_i10_v4_authoring_retry'
        )
      )
      if (!failedTaskGateSeen ||
          structured.buildJobIds.length < 2 ||
          !structured.mcpCallSequence.includes('candidate_get')) {
        fail('I10_LEDGER_F013_AUTHORING_RETRY_EVIDENCE_INVALID', {
          failedTaskGateSeen,
          buildJobIds: structured.buildJobIds,
          mcpCallSequence: structured.mcpCallSequence
        })
      }
    }
    if (variant === 'F015_STABILITY_FAIL_REVISE_RETAIN') {
      const revisionGateSeen = transcript.some(item =>
        (item.agentFlowExecutedData || []).some(executed =>
          executed.nodeId === 'humanInputAgentflow_i10_v4_stability_revision'
        )
      )
      if (!revisionGateSeen ||
          structured.candidateIds.length < 2 ||
          new Set(structured.candidateIds).size < 2 ||
          structured.certificateIds.length !== 1) {
        fail('I10_LEDGER_F015_STABILITY_REVISION_EVIDENCE_INVALID', {
          revisionGateSeen,
          candidateIds: structured.candidateIds,
          certificateIds: structured.certificateIds
        })
      }
    }
    return {
      inputType, mode: 'RETAIN_ONLY', reverse: false, variant, chatId,
      inputArtifactHashes,
      executionEvidence: {
        candidateId: structured.candidateIds.at(-1),
        activated: false,
        taskCreated: false,
        scheduleCreated: false,
        outcome: 'CANDIDATE_RETAINED'
      },
      interactionMetadata: variant === 'F012_VIDEO_IMAGE_CONFLICT_RETAIN'
        ? {
            ...structured,
            crossSourceConflict: {
              observed: crossSourceConflictObserved,
              resolved: true,
              correctionSubmitted: videoCorrectionSubmitted,
              finalDraftHash: sha256(serialized(latestCaseDraft(body) || findCaseDraft(transcript)))
            }
          }
        : variant === 'F013_AUTHORING_FAIL_RETRY_RETAIN'
          ? {
              ...structured,
              authoringRetry: {
                failedJobId: structured.buildJobIds[0],
                retryJobId: structured.buildJobIds.at(-1),
                sameCaseRecovery: true,
                failedTaskRetained: true
              }
            }
          : variant === 'F015_STABILITY_FAIL_REVISE_RETAIN'
            ? {
                ...structured,
                stabilityRevision: {
                  failedCandidateId: structured.candidateIds[0],
                  revisedCandidateId: structured.candidateIds.at(-1),
                  certificateId: structured.certificateIds[0],
                  failureCode: 'I10_ACCEPTANCE_STABILITY_SAMPLE_FAILED',
                  failedSamplesNotReused: true,
                  newFourRunSetRequired: true
                }
              }
          : structured,
      transcriptHash: sha256(serialized(transcript)),
      terminalTextHash: sha256(text),
      humanGateCount: step
    }
  }
  if (variant === 'F002_CAPTURE_ACTIVATE_NO_RUN') {
    const structured = scenarioMetadata(transcript)
    if (!structured.candidateIds.length ||
        !structured.mcpCallSequence.includes('credential_session_create') ||
        !structured.mcpCallSequence.includes('credential_session_get') ||
        !structured.mcpCallSequence.includes('candidate_decide') ||
        structured.mcpCallSequence.includes('run_submit') ||
        structured.mcpCallSequence.includes('schedule_create') ||
        !/保留|已激活|挂载|暂不/.test(text)) {
      fail('I10_LEDGER_F002_ACTIVATED_NO_RUN_TERMINAL_INVALID')
    }
    return {
      inputType, mode: 'ACTIVATED_NO_RUN', reverse: false, variant, chatId,
      executionEvidence: {
        candidateId: structured.candidateIds.at(-1),
        activated: true,
        taskCreated: false,
        scheduleCreated: false,
        outcome: 'SCRIPT_ACTIVATED_NO_RUN'
      },
      interactionMetadata: structured,
      transcriptHash: sha256(serialized(transcript)),
      terminalTextHash: sha256(text),
      humanGateCount: step
    }
  }
  let executionEvidence
  if (reverse) {
    if (!failureInjected || !recovered) fail('I10_STAGE8_REVERSE_RECOVERY_NOT_EXECUTED', { inputType, mode })
    executionEvidence = {
      ...requireOnDemandTerminalEvidence(transcript, text),
      controlledFailure: true,
      recovered: true
    }
  } else if (mode === 'ON_DEMAND') {
    executionEvidence = requireOnDemandTerminalEvidence(transcript, text)
  } else {
    const scheduleId = extractOpaqueId(transcript, 'schedule')
    if (!scheduleId || !/schedule|调度/i.test(text)) fail('I10_STAGE8_SCHEDULE_TERMINAL_MISSING', { inputType, mode })
    const scheduledResult = await awaitScheduledResult(scheduleId, mode, sequence)
    const scheduleDisabled = mode === 'RECURRING' ? await disableRecurringSchedule(scheduleId, sequence) : null
    executionEvidence = { scheduleId, scheduledResult, ...(scheduleDisabled ? { scheduleDisabled } : {}) }
  }
  const interactionMetadata = scenarioMetadata(transcript)
  let finalPortalHealth = null
  if (variant === 'F014_VERIFICATION_RESUME_ON_DEMAND') {
    const requiredTools = [
      'verification_get',
      'verification_decision_submit',
      'candidate_decide',
      'run_submit',
      'task_get',
      'result_inbox_list'
    ]
    finalPortalHealth = await controlledPortalHealth(scenario.failureControlUrl)
    const formalExecutionCounts = Object.values(finalPortalHealth.transferConfirmCountByExecution || {})
    const distinctChallenges = new Set(interactionMetadata.verificationChallengeIds)
    if (verificationReadyGateCount !== 2 || verificationActionGateCount !== 2 ||
        verificationPhaseEvidence.length !== 2 ||
        !formalVerificationArmed ||
        formalExecutionCounts.length !== 1 ||
        formalExecutionCounts[0] !== 1 ||
        finalPortalHealth.transferFirstConfirmCount !== 1 ||
        !finalPortalHealth.verificationCompleted ||
        distinctChallenges.size < 2 ||
        requiredTools.some(tool => !interactionMetadata.mcpCallSequence.includes(tool))) {
      fail('I10_LEDGER_F014_VERIFICATION_RESUME_EVIDENCE_INVALID', {
        verificationReadyGateCount,
        verificationActionGateCount,
        verificationPhaseEvidence,
        formalVerificationArmed,
        finalPortalHealth,
        verificationChallengeIds: interactionMetadata.verificationChallengeIds,
        missingTools: requiredTools.filter(tool => !interactionMetadata.mcpCallSequence.includes(tool))
      })
    }
    await setFailureMode(scenario.failureControlUrl, 'standard')
  }
  if (executionEvidence.scheduleDisabled) {
    interactionMetadata.mcpCallSequence = [
      ...new Set([...(interactionMetadata.mcpCallSequence || []), 'schedule_disable'])
    ]
  }
  return {
    inputType, mode, reverse, ...(variant !== 'STANDARD' ? { variant } : {}), chatId, executionEvidence,
    inputArtifactHashes,
    interactionMetadata: {
      ...interactionMetadata,
      ...(variant === 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND'
        ? {
            lowConfidenceCorrection: {
              observed: lowConfidenceVideoObserved,
              submitted: videoCorrectionSubmitted,
              originalVersion: lowConfidenceOriginalVersion,
              correctedDraftHash: sha256(serialized(latestCaseDraft(body) || findCaseDraft(transcript)))
            }
          }
        : {}),
      ...(variant === 'F014_VERIFICATION_RESUME_ON_DEMAND'
        ? {
            verificationResume: {
              authoringChallengeId: interactionMetadata.verificationChallengeIds.at(-2),
              formalChallengeId: interactionMetadata.verificationChallengeIds.at(-1),
              readyGateCount: verificationReadyGateCount,
              actionGateCount: verificationActionGateCount,
              phases: verificationPhaseEvidence,
              authoringFinalHealth,
              finalPortalHealth,
              externalVerificationCompleted: verificationPhaseEvidence.length === 2,
              sameTaskRecovery: true,
              secretEnteredInFlowise: false
            }
          }
        : {})
    },
    transcriptHash: sha256(serialized(transcript)), terminalTextHash: sha256(text), humanGateCount: step
  }
}

async function main() {
  for (const name of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL_NAME']) if (!process.env[name]) fail(`${name}_MISSING`)
  assert.equal(matrix.forwardScenarioCount, matrix.inputTypes.length * matrix.executionModes.length)
  const scenario = requireSafeScenarioFile()
  const modelEvidence = freshEvidence('.data/evidence/i10/model-probes/result.json', 'hengzhun-i10-model-probe-evidence-v1')
  const publicationEvidence = freshPublicationEvidence()
  if (publicationEvidence.deployed !== true || publicationEvidence.private !== true) fail('I10_STAGE8_FLOWISE_NOT_DEPLOYED_PRIVATE')
  const portalHealth = await request(`${scenario.portalUrl}/__health`, { timeoutMs: 10_000 }).catch(() => null)
  if (!portalHealth?.response?.ok) fail('I10_STAGE8_PORTAL_NOT_REACHABLE')

  const results = []
  const scenarios = []
  let sequence = 0
  for (const inputType of matrix.inputTypes) {
    for (const mode of matrix.executionModes) scenarios.push({ inputType, mode, reverse: false, sequence: String(++sequence).padStart(2, '0') })
    scenarios.push({ inputType, mode: 'ON_DEMAND', reverse: true, sequence: String(++sequence).padStart(2, '0') })
  }
  const diagnosticSequence = process.env.I10_STAGE8_SINGLE_SEQUENCE === undefined
    ? null
    : boundedIntegerEnvironment('I10_STAGE8_SINGLE_SEQUENCE', 1, 1, scenarios.length)
  const ledgerVariant = String(process.env.I10_STAGE8_LEDGER_VARIANT || '').trim()
  const variantScenario = {
    F002: { inputType: 'NATURAL_LANGUAGE', mode: 'ON_DEMAND', reverse: false, sequence: '02', variant: 'F002_CAPTURE_ACTIVATE_NO_RUN' },
    F003: { inputType: 'NATURAL_LANGUAGE', mode: 'ON_DEMAND', reverse: false, sequence: '03', variant: 'F003_REVISE_RETAIN' },
    F004: { inputType: 'NATURAL_LANGUAGE', mode: 'ONE_TIME', reverse: false, sequence: '04', variant: 'F004_NL_IMAGE_ONE_TIME', supportingImageCount: 1 },
    F005: { inputType: 'NATURAL_LANGUAGE', mode: 'ON_DEMAND', reverse: false, sequence: '05', variant: 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN', supportingImageCount: 2 },
    F006: { inputType: 'NATURAL_LANGUAGE', mode: 'RECURRING', reverse: false, sequence: '06', variant: 'F006_IMAGE_ONLY_CLARIFY_RECURRING', supportingImageCount: 1 },
    F007: { inputType: 'CASE_FILE', mode: 'RECURRING', reverse: false, sequence: '07', variant: 'F007_XLSX_RECURRING' }
    ,
    F008: { inputType: 'CASE_FILE', mode: 'ON_DEMAND', reverse: false, sequence: '08', variant: 'F008_FILE_REVISE_RETAIN' },
    F009: { inputType: 'CASE_FILE', mode: 'ON_DEMAND', reverse: false, sequence: '09', variant: 'F009_FILE_IMAGE_ON_DEMAND', supportingImageCount: 1 },
    F010: { inputType: 'VIDEO', mode: 'ONE_TIME', reverse: false, sequence: '10', variant: 'F010_VIDEO_ONE_TIME' },
    F011: { inputType: 'VIDEO', mode: 'ON_DEMAND', reverse: false, sequence: '11', variant: 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND' }
    ,F012: { inputType: 'VIDEO', mode: 'ON_DEMAND', reverse: false, sequence: '12', variant: 'F012_VIDEO_IMAGE_CONFLICT_RETAIN', supportingImageCount: 1 }
    ,F013: { inputType: 'NATURAL_LANGUAGE', mode: 'ON_DEMAND', reverse: false, sequence: '13', variant: 'F013_AUTHORING_FAIL_RETRY_RETAIN' }
    ,F014: { inputType: 'NATURAL_LANGUAGE', mode: 'ON_DEMAND', reverse: false, sequence: '14', variant: 'F014_VERIFICATION_RESUME_ON_DEMAND' }
    ,F015: { inputType: 'NATURAL_LANGUAGE', mode: 'ON_DEMAND', reverse: false, sequence: '15', variant: 'F015_STABILITY_FAIL_REVISE_RETAIN' }
  }[ledgerVariant]
  const selected = variantScenario
    ? [variantScenario]
    : (diagnosticSequence === null ? scenarios : scenarios.filter(item => Number(item.sequence) === diagnosticSequence))
  const runEvidenceId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`
  activeEvidenceRoot = path.join(evidenceRoot, 'runs', runEvidenceId)
  for (const item of selected) results.push(await runConversation({ ...item, scenario }))
  const evidence = {
    schemaVersion: 'hengzhun-i10-stage8-live-evidence-v1', mock: false, degraded: false,
    modelProbeCompletedAt: modelEvidence.completedAt, publicationCompletedAt: publicationEvidence.completedAt,
    forwardScenarioCount: results.filter(item => !item.reverse).length,
    reverseScenarioCount: results.filter(item => item.reverse).length,
    evidenceDirectory: path.relative(root, activeEvidenceRoot).replaceAll('\\', '/'),
    results, completedAt: new Date().toISOString()
  }
  safeWrite('result.json', diagnosticSequence === null
    ? evidence
    : { ...evidence, schemaVersion: 'hengzhun-i10-stage8-live-diagnostic-evidence-v1', diagnosticOnly: true })
  activeEvidenceRoot = evidenceRoot
  if (diagnosticSequence === null) safeWrite('result.json', evidence)
  else safeWrite(`diagnostic-${String(diagnosticSequence).padStart(2, '0')}-result.json`, { ...evidence, schemaVersion: 'hengzhun-i10-stage8-live-diagnostic-evidence-v1', diagnosticOnly: true })
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || error.message || 'I10_STAGE8_FAILED', details: error.details || {} })}\n`)
  process.exitCode = 2
})

module.exports = {
  assertCandidateDeliveryEvidence, awaitScheduledResult, disableRecurringSchedule,
  authoringProcessingPending, ingestProcessingPending, journeyProcessingPending, stopped, targetProfileTransitionPending, imageFactsTransitionPending, imageConfirmedTransitionPending, isolatedJourneyTransitionPending, crossSessionProposalDecisionPending, crossSessionToolContinuationPending,
  extractOpaqueId, latestOpaqueId, feedbackFor, findAuthoringEvidence, findCaseDraft, findOnDemandInboxItem,
  findScheduledInboxItem, findTaskTerminal, latestCaseDraft, requireOnDemandTerminalEvidence,
  requireSafeScenarioFile, retryablePredictionStatus, runConversation, scenarioMetadata,
  setEvidenceRootForAcceptance, setFailureMode, visitStructuredValues
}
