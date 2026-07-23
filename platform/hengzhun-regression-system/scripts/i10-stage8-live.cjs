#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/stage8-acceptance-matrix-v1.json'), 'utf8'))
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
const flowiseBase = process.env.FLOWISE_URL || 'http://127.0.0.1:3006'
const evidenceRoot = path.join(root, '.data/evidence/i10/stage8')
const scheduleWaitMs = boundedIntegerEnvironment('I10_STAGE8_SCHEDULE_WAIT_MS', 420_000, 60_000, 900_000)
const schedulePollMs = boundedIntegerEnvironment('I10_STAGE8_SCHEDULE_POLL_MS', 10_000, 1_000, 60_000)

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

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 240_000) })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = { text } }
  return { response, body }
}

function stopped(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  return executed.find(item => item?.status === 'STOPPED') || null
}

function safeWrite(name, body) {
  fs.mkdirSync(evidenceRoot, { recursive: true })
  fs.writeFileSync(path.join(evidenceRoot, name), `${JSON.stringify(body, null, 2)}\n`)
}

function serialized(value) {
  return JSON.stringify(value ?? {})
}

function extractOpaqueId(value, prefix) {
  const match = serialized(value).match(new RegExp(`${prefix}_[0-9a-f-]{36}`, 'i'))
  return match ? match[0] : null
}

function findScheduledInboxItem(value, scheduleId) {
  const queue = [value]
  let inspected = 0
  while (queue.length > 0 && inspected < 20_000) {
    inspected += 1
    const current = queue.shift()
    if (current && typeof current === 'object') {
      if (!Array.isArray(current) && current.scheduleId === scheduleId &&
        /^(ONE_TIME|RECURRING)$/.test(String(current.scheduleType || '')) &&
        /^inbox_[0-9a-f-]{36}$/i.test(String(current.inboxId || '')) &&
        /^task_[0-9a-f-]{36}$/i.test(String(current.taskId || '')) &&
        /^(PASSED|SUCCEEDED)$/i.test(String(current.outcome || current.status || ''))) return current
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function assertCandidateDeliveryEvidence(transcript, context) {
  const text = serialized(transcript)
  if (!findAuthoringEvidence(transcript)) fail('I10_STAGE8_MIDSCENE_EVIDENCE_MISSING', context)
  if (!/I10_2X2_V1/.test(text)) fail('I10_STAGE8_STABILITY_EVIDENCE_MISSING', context)
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

async function predict(payload) {
  const result = await request(`${flowiseBase}/api/v1/prediction/${publication.flowId}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  })
  if (!result.response.ok) fail('I10_STAGE8_FLOWISE_PREDICTION_FAILED', { status: result.response.status })
  return result.body
}

async function managementConversation(question, sequence, expectedHumanNode = null) {
  const chatId = `i10-s8-management-${Date.now()}-${crypto.randomUUID()}`
  const transcript = []
  let body = await predict({ question, chatId, overrideConfig: { sessionId: chatId } })
  transcript.push(body)
  safeWrite(`${sequence}-management-00.json`, body)
  let step = 0
  while (stopped(body)) {
    if (++step > 4) fail('I10_STAGE8_MANAGEMENT_TOO_MANY_HUMAN_GATES', { expectedHumanNode })
    const node = stopped(body)
    if (!expectedHumanNode || node.nodeId !== expectedHumanNode) {
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
      return { scheduleId, inboxId: item.inboxId, taskId: item.taskId, evidenceHash: sha256(text), attempts: attempt }
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

function uploadFor(inputType, scenario) {
  if (inputType === 'NATURAL_LANGUAGE') return undefined
  const target = inputType === 'CASE_FILE' ? scenario.caseFilePath : scenario.videoPath
  const mime = inputType === 'CASE_FILE' ? 'text/csv' : 'video/mp4'
  return [{ type: 'file', name: path.basename(target), mime, data: `data:${mime};base64,${fs.readFileSync(target).toString('base64')}` }]
}

async function runConversation({ inputType, mode, reverse, scenario, sequence }) {
  const chatId = `i10-s8-${inputType.toLowerCase()}-${mode.toLowerCase()}-${reverse ? 'reverse' : 'forward'}-${Date.now()}`
  const sourceDescription = `创建并执行一个新的自动化回归案例：目标系统为复兴银行，使用已有安全凭据引用${scenario.credentialRef}，验证客户在${scenario.portalUrl}/portal/login输入账号密码登录后，右上角姓名和头像与个人资料一致。`
  const question = inputType === 'NATURAL_LANGUAGE'
    ? sourceDescription
    : `${sourceDescription} 请导入本次随消息上传的${inputType === 'CASE_FILE' ? '自动化测试案例文件' : '成功操作录屏'}。`
  const transcript = []
  let body = await predict({ question, chatId, uploads: uploadFor(inputType, scenario), overrideConfig: { sessionId: chatId } })
  transcript.push(body)
  safeWrite(`${sequence}-00-start.json`, body)
  let step = 0
  let failureInjected = false
  let recovered = false
  while (stopped(body)) {
    // Real MiMo authoring may span several minutes. Each asynchronous status
    // poll is a human gate continuation, so bound wall time without treating
    // legitimate visual work as a workflow loop defect.
    if (++step > 80) fail('I10_STAGE8_TOO_MANY_HUMAN_GATES', { inputType, mode, reverse })
    const node = stopped(body)
    if (reverse && node.nodeId === 'humanInputAgentflow_run' && !failureInjected) {
      await setFailureMode(scenario.failureControlUrl, 'changed')
      failureInjected = true
    }
    if (reverse && node.nodeId === 'humanInputAgentflow_repair_rerun' && !recovered) {
      await setFailureMode(scenario.failureControlUrl, 'recovered')
      recovered = true
    }
    const reject = node.nodeId === 'humanInputAgentflow_repair_schedule'
    const delay = /generation|ingest_wait|repair_wait/.test(node.nodeId) ? 15_000 : 0
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    const feedback = feedbackFor(node.nodeId, mode, scenario, body, inputType)
    body = await predict({
      question: reject ? 'Reject' : (feedback || 'Proceed'), chatId: body.chatId || chatId,
      humanInput: { type: reject ? 'reject' : 'proceed', startNodeId: node.nodeId, feedback },
      overrideConfig: { sessionId: body.sessionId || chatId }
    })
    transcript.push(body)
    safeWrite(`${sequence}-${String(step).padStart(2, '0')}-${node.nodeId}.json`, body)
  }
  const text = String(body?.text || '')
  assertCandidateDeliveryEvidence(transcript, { inputType, mode, reverse })
  let executionEvidence
  if (reverse) {
    if (!failureInjected || !recovered || !/SUCCEEDED|PASSED|修复/.test(text)) fail('I10_STAGE8_REVERSE_TERMINAL_MISSING', { inputType, mode })
    executionEvidence = {
      taskId: extractOpaqueId(transcript, 'task'),
      inboxId: extractOpaqueId(transcript, 'inbox'),
      controlledFailure: true,
      recovered: true
    }
    if (!executionEvidence.taskId || !executionEvidence.inboxId) fail('I10_STAGE8_REVERSE_RESULT_ID_MISSING', { inputType })
  } else if (mode === 'ON_DEMAND') {
    executionEvidence = { taskId: extractOpaqueId(transcript, 'task'), inboxId: extractOpaqueId(transcript, 'inbox') }
    if (!/SUCCEEDED|PASSED/.test(text) || !executionEvidence.taskId || !executionEvidence.inboxId) {
      fail('I10_STAGE8_FORWARD_TERMINAL_MISSING', { inputType, mode })
    }
  } else {
    const scheduleId = extractOpaqueId(transcript, 'schedule')
    if (!scheduleId || !/schedule|调度/i.test(text)) fail('I10_STAGE8_SCHEDULE_TERMINAL_MISSING', { inputType, mode })
    const scheduledResult = await awaitScheduledResult(scheduleId, mode, sequence)
    const scheduleDisabled = mode === 'RECURRING' ? await disableRecurringSchedule(scheduleId, sequence) : null
    executionEvidence = { scheduleId, scheduledResult, ...(scheduleDisabled ? { scheduleDisabled } : {}) }
  }
  return {
    inputType, mode, reverse, chatId, executionEvidence,
    transcriptHash: sha256(serialized(transcript)), terminalTextHash: sha256(text), humanGateCount: step
  }
}

async function main() {
  for (const name of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL_NAME']) if (!process.env[name]) fail(`${name}_MISSING`)
  assert.equal(matrix.forwardScenarioCount, matrix.inputTypes.length * matrix.executionModes.length)
  const scenario = requireSafeScenarioFile()
  const modelEvidence = freshEvidence('.data/evidence/i10/model-probes/result.json', 'hengzhun-i10-model-probe-evidence-v1')
  const publicationEvidence = freshEvidence('.data/evidence/i10/flowise/publication.json', 'hengzhun-i10-agentflow-publication-evidence-v1')
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
  const selected = diagnosticSequence === null ? scenarios : scenarios.filter(item => Number(item.sequence) === diagnosticSequence)
  for (const item of selected) results.push(await runConversation({ ...item, scenario }))
  const evidence = {
    schemaVersion: 'hengzhun-i10-stage8-live-evidence-v1', mock: false, degraded: false,
    modelProbeCompletedAt: modelEvidence.completedAt, publicationCompletedAt: publicationEvidence.completedAt,
    forwardScenarioCount: results.filter(item => !item.reverse).length,
    reverseScenarioCount: results.filter(item => item.reverse).length,
    results, completedAt: new Date().toISOString()
  }
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
  extractOpaqueId, feedbackFor, findAuthoringEvidence, findCaseDraft, findScheduledInboxItem, latestCaseDraft, requireSafeScenarioFile
}
