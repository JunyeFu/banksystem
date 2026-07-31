#!/usr/bin/env node
'use strict'

// Formal I10 AcceptanceRecordV3 executor.  It deliberately drives the public
// Flowise prediction API through the existing Stage8 Human-Input/MCP driver;
// it never writes Flowise or SQLite rows to manufacture evidence.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const acceptanceLedger = require('./i10-acceptance-ledger-v3.cjs')
const { currentReleaseIdentity } = require('./i10-release-identity.cjs')
const opaqueReferences = require('./i10-reference-contracts.cjs')

const root = path.resolve(__dirname, '..')
const browserSuitePath = path.join(root, '.data/evidence/i10/browser-ocr-case-suite/result.json')
const publicationPath = path.join(root, 'flowise/i10/publication-manifest-v1.json')
// Never permit a current v7 run to inherit a former release's PASS.
const evidenceRoot = acceptanceLedger.evidenceRoot
const defaultScenarioPath = path.join(root, '.data/tests/i10-stage8-live/scenario.json')
const stage8 = require('./i10-stage8-live.cjs')

const CASE_ORDER = ['L1', 'L2', 'L3', 'M1', 'M2', 'M3', 'H1', 'H2', 'H3']
const SCHEDULE_BY_IMAGE_CASE = {
  L1: 'ON_DEMAND', L2: 'ON_DEMAND', L3: 'ON_DEMAND',
  M1: 'ONE_TIME', M2: 'ONE_TIME', M3: 'ONE_TIME',
  H1: 'RECURRING', H2: 'RECURRING', H3: 'RECURRING'
}
// The two variants are allowed to phrase the same business intent differently
// (for example “确认” versus “验证”).  Their equality cannot be a raw JSON
// hash: the OCR branch intentionally adds page facts and a controller may use
// equivalent Chinese wording.  Keep the acceptance boundary strict by
// defining the required, user-visible business concepts for each of the nine
// fixed cases.  Both drafts must preserve every required concept, the target
// and URL, and the action/outcome cardinality; supplemental OCR facts may not
// replace or remove the intent.
const CASE_SEMANTIC_CONTRACTS = Object.freeze({
  L1: ['LOGIN', 'PROFILE', 'NAME', 'AVATAR'],
  L2: ['ACCOUNT', 'BALANCE', 'STATUS'],
  L3: ['MESSAGE', 'UNREAD', 'SUMMARY'],
  M1: ['TRANSACTION', 'FILTER', 'STATUS'],
  M2: ['PAYEE', 'MASKED_ACCOUNT', 'STATUS'],
  M3: ['DOCUMENT', 'DATE', 'DOWNLOAD'],
  H1: ['TRANSFER', 'CONFIRM', 'ROUTE'],
  H2: ['TRANSFER', 'UKEY', 'VERIFY'],
  H3: ['ORDER', 'PAYEE', 'AMOUNT', 'STATUS']
})

const SEMANTIC_MARKERS = Object.freeze({
  LOGIN: /(?:登录|login|sign[ _-]?in)/i,
  PROFILE: /(?:个人资料|个人中心|profile)/i,
  NAME: /(?:姓名|名称|name)/i,
  AVATAR: /(?:头像|avatar)/i,
  ACCOUNT: /(?:账户|账号|account)/i,
  BALANCE: /(?:余额|balance)/i,
  STATUS: /(?:状态|status|正常|可用)/i,
  MESSAGE: /(?:消息|通知|message)/i,
  UNREAD: /(?:未读|unread)/i,
  SUMMARY: /(?:摘要|summary)/i,
  TRANSACTION: /(?:交易|明细|transaction)/i,
  FILTER: /(?:筛选|过滤|filter)/i,
  PAYEE: /(?:收款人|收款方|payee|beneficiary)/i,
  MASKED_ACCOUNT: /(?:掩码|脱敏|尾号|masked)/i,
  DOCUMENT: /(?:文档|文件|document)/i,
  DATE: /(?:日期|时间|date)/i,
  DOWNLOAD: /(?:下载|download)/i,
  TRANSFER: /(?:转账|汇款|transfer)/i,
  CONFIRM: /(?:首次确认|确认|confirm)/i,
  ROUTE: /(?:路由|跳转|页面|route|query)/i,
  UKEY: /(?:U盾|移动证书|ukey)/i,
  VERIFY: /(?:验证|校验|verify)/i,
  ORDER: /(?:单号|订单|order)/i,
  AMOUNT: /(?:金额|amount)/i
})

function fail(code, details = {}) {
  const error = new Error(code)
  error.code = code
  error.details = details
  throw error
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

function safeCaseId(value) {
  const id = String(value || '').toUpperCase()
  if (!CASE_ORDER.includes(id)) fail('I10_ACCEPTANCE_CASE_ID_INVALID')
  return id
}

function safeVariant(value) {
  const variant = String(value || '').toUpperCase()
  if (!['TEXT_ONLY', 'TEXT_WITH_IMAGE'].includes(variant)) fail('I10_ACCEPTANCE_VARIANT_INVALID')
  return variant
}

function acceptanceNaturalLanguage(item, caseId) {
  // H cases opt in to the registered local demo adapter in their own user
  // request.  This is never inferred from the target name or the portal URL.
  const original = String(item?.naturalLanguage || '').trim()
  const transfer = '明确选择复兴银行演示适配器 fuxing-bank-demo。使用已保存安全凭据登录，进入转账汇款，选择已登记收款人，填写金额为 1.00，填写用途为 自动化回归测试，提交后完成首次确认。'
  if (caseId === 'H1') return `${transfer}确认页面进入网页验证或单号查询流程。`
  if (caseId === 'H2') return `${transfer}若进入网页U盾验证页则完成网页验证；若直接进入单号查询页则确认已自动跳过验证。`
  if (caseId === 'H3') return `${transfer}进入单号查询页面，确认收款信息、金额 1.00 和受理状态一致。`
  return original
}

function loadBrowserCase(caseId) {
  if (!fs.existsSync(browserSuitePath)) fail('I10_ACCEPTANCE_BROWSER_OCR_EVIDENCE_MISSING')
  const suite = JSON.parse(fs.readFileSync(browserSuitePath, 'utf8'))
  if (suite.status !== 'PASSED' || suite.mock !== false || suite.degraded !== false) fail('I10_ACCEPTANCE_BROWSER_OCR_EVIDENCE_INVALID')
  const item = Array.isArray(suite.results) ? suite.results.find(row => row.caseId === caseId) : null
  if (!item || item.browser?.status !== 'PASSED' || item.ocr?.status !== 'PASSED') fail('I10_ACCEPTANCE_BROWSER_CASE_MISSING', { caseId })
  const screenshotPath = path.resolve(root, String(item.browser.screenshotPath || ''))
  const relative = path.relative(path.join(root, '.data'), screenshotPath)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(screenshotPath)) {
    fail('I10_ACCEPTANCE_BROWSER_SCREENSHOT_INVALID', { caseId })
  }
  return { item, screenshotPath }
}

function loadScenario(imagePath) {
  // Stage8 intentionally requires an explicit, data-root-contained scenario
  // path.  The acceptance runner owns the canonical scenario file, so make
  // that dependency explicit here rather than relying on the caller's shell
  // environment.  An explicit caller override still wins for diagnostics.
  if (!process.env.I10_STAGE8_SCENARIO_FILE) process.env.I10_STAGE8_SCENARIO_FILE = defaultScenarioPath
  if (imagePath) process.env.I10_STAGE8_SUPPORTING_IMAGE_OVERRIDE = imagePath
  else delete process.env.I10_STAGE8_SUPPORTING_IMAGE_OVERRIDE
  return stage8.requireSafeScenarioFile()
}

function fileBodies(directory) {
  return fs.readdirSync(directory)
    // The recovery writer may have already produced a partial acceptance
    // record before a later cross-variant check fails. That record is not a
    // Flowise transcript item and must never replace the actual terminal
    // response when recovery replays the evidence directory.
    .filter(name => name.endsWith('.json') && name !== 'acceptance-record.json')
    .sort()
    .map(name => ({ name, path: path.join(directory, name), value: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) }))
}

function stringify(value) { return JSON.stringify(value ?? {}) }

function opaqueIds(text, expression) {
  return [...new Set([...text.matchAll(expression)].map(match => match[0]))]
}

function firstOpaqueId(text, expression) { return opaqueIds(text, expression).at(-1) || null }

function lastCaseDraft(bodies) {
  // The raw Flowise execution history is intentionally large.  The public
  // response's early structured reply is the authoritative conversation
  // artifact for this check; do not recursively walk every historical node
  // merely to rediscover it, which can exhaust Node on long conversations.
  for (const body of [...bodies].reverse()) {
    // Compact terminal replies no longer carry the draft, but every journey
    // projection persists it into flow state as caseDraftJson; the executed
    // trace keeps a shallow copy of that state per node.
    const executed = Array.isArray(body.value?.agentFlowExecutedData) ? body.value.agentFlowExecutedData : []
    for (const item of [...executed].reverse()) {
      let stateDraft = item?.data?.state?.caseDraftJson
      if (typeof stateDraft === 'string' && stateDraft.trim().startsWith('{')) {
        try { stateDraft = JSON.parse(stateDraft) } catch { stateDraft = null }
      }
      if (stateDraft && typeof stateDraft === 'object' &&
        (stateDraft.schemaVersion === 'hengzhun-i10-case-draft-v1' || 'entryUrl' in stateDraft)) return stateDraft
    }
    const text = String(body.value?.text || '').trim()
    if (!text.startsWith('{')) continue
    try {
      const parsed = JSON.parse(firstJsonObject(text))
      if (parsed?.schemaVersion === 'hengzhun-i10-case-draft-v1' ||
          (Array.isArray(parsed?.actions) && Array.isArray(parsed?.expectedOutcomes) && 'entryUrl' in parsed)) {
        return parsed
      }
    } catch (_) {}
  }
  return null
}

function firstJsonObject(text) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') { inString = true; continue }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return text.slice(0, index + 1)
    }
  }
  fail('I10_ACCEPTANCE_CASE_DRAFT_JSON_UNTERMINATED')
}

function semanticProjection(draft) {
  if (!draft || typeof draft !== 'object') return null
  // CaseDraft v1 persists paired browser semantics as steps; historical
  // controller output used parallel actions/expectedOutcomes.  Accept both,
  // preferring the immutable paired representation.
  const steps = Array.isArray(draft.steps) ? draft.steps : []
  const stepActions = steps.map(step => String(step?.action || '').trim()).filter(Boolean)
  const stepExpected = steps.map(step => String(step?.expected || '').trim()).filter(Boolean)
  const legacyActions = Array.isArray(draft.actions) ? draft.actions.map(value => String(value).trim()) : []
  const legacyExpected = Array.isArray(draft.expectedOutcomes) ? draft.expectedOutcomes.map(value => String(value).trim()) : []
  return {
    targetSystem: String(draft.targetSystem || '').trim(),
    entryUrl: String(draft.entryUrl || '').trim(),
    objective: String(draft.objective || '').trim(),
    actions: stepActions.length ? stepActions : legacyActions,
    expectedOutcomes: stepActions.length ? stepExpected : legacyExpected,
    assertions: Array.isArray(draft.assertions) ? draft.assertions.map(value => String(value).trim()) : []
  }
}

// The controlled browser fixture allocates an unused loopback port per run.
// That port is execution infrastructure, not a different business target.  A
// text-only run and its screenshot/OCR counterpart therefore remain the same
// case when only that ephemeral port differs.  Keep the original entryUrl in
// the record for traceability; use this narrow canonical form only for the
// cross-variant semantic comparison.
function semanticEntryUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    if (parsed.hostname === '127.0.0.1' && /^\/portal\//.test(parsed.pathname)) {
      return `${parsed.protocol}//127.0.0.1:{CONTROLLED_PORT}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch (_) {}
  return String(value || '').trim()
}

function semanticMarkers(semantic) {
  const text = [
    semantic?.targetSystem, semantic?.objective,
    ...(Array.isArray(semantic?.actions) ? semantic.actions : []),
    ...(Array.isArray(semantic?.expectedOutcomes) ? semantic.expectedOutcomes : []),
    ...(Array.isArray(semantic?.assertions) ? semantic.assertions : [])
  ].map(value => String(value || '')).join('\n')
  return Object.entries(SEMANTIC_MARKERS)
    .filter(([, matcher]) => matcher.test(text))
    .map(([marker]) => marker)
}

function markerSetForText(value) {
  const text = String(value || '')
  return new Set(Object.entries(SEMANTIC_MARKERS)
    .filter(([, matcher]) => matcher.test(text))
    .map(([marker]) => marker))
}

// OCR may turn an already-stated final expected outcome into an explicit
// read-only "confirm/check" action.  That makes the image path more verbose,
// not a different business case.  Compare the canonical intent while keeping
// the complete original CaseDraft in the acceptance record.  Never collapse a
// potential mutation: submission, transfer, save, deletion, activation and
// first confirmation remain independently significant.
function comparisonProjection(semantic) {
  const projected = {
    ...semantic,
    actions: [...(Array.isArray(semantic?.actions) ? semantic.actions : [])],
    expectedOutcomes: [...(Array.isArray(semantic?.expectedOutcomes) ? semantic.expectedOutcomes : [])]
  }
  if (projected.actions.length < 2 || projected.actions.length !== projected.expectedOutcomes.length) return projected
  const action = String(projected.actions.at(-1) || '').trim()
  const outcome = String(projected.expectedOutcomes.at(-1) || '').trim()
  const readOnly = /^(?:确认|验证|检查|核对|比较|查看)/u.test(action)
  const mutation = /(?:提交|转账|汇款|保存|删除|激活|首次确认|点击)/u.test(action)
  // A terminal inspection may provide a detailed field list while its paired
  // expected result remains intentionally generic (for example “数据展示
  // 正确”). It is still not a second business operation. Never apply that
  // convenience to money movement, U-key verification or order evidence.
  const highRiskTerminal = /(?:转账|汇款|U盾|移动证书|单号|订单|金额)/u.test(action)
  // CONFIRM/VERIFY are control verbs in a read-only terminal action, not
  // additional business intent. The matching outcome expresses the actual
  // facts being checked (for example account, balance and status).
  const priorMarkers = new Set([
    ...projected.actions.slice(0, -1),
    ...projected.expectedOutcomes.slice(0, -1)
  ].flatMap(value => [...markerSetForText(value)]))
  const actionMarkers = new Set([...markerSetForText(action)]
    .filter(marker => !['CONFIRM', 'VERIFY'].includes(marker))
    // A terminal assertion can restate the page reached by its immediately
    // preceding navigation. That destination is already preserved in the
    // canonical plan; retain only the newly asserted business facts.
    .filter(marker => !priorMarkers.has(marker)))
  const outcomeMarkers = markerSetForText(outcome)
  const genericReadOnlyOutcome = /(?:数据.*(?:正确|正常)|展示.*(?:正确|正常)|结果.*(?:正确|正常))/u.test(outcome)
  if (readOnly && !mutation && !highRiskTerminal && actionMarkers.size > 0 &&
      ([...actionMarkers].every(marker => outcomeMarkers.has(marker)) || genericReadOnlyOutcome)) {
    projected.actions.pop()
    projected.expectedOutcomes.pop()
  }
  return projected
}

function semanticEquivalent(caseId, left, right) {
  if (!left || !right) return { status: 'SEMANTIC_MISMATCH', reason: 'SEMANTIC_PROJECTION_MISSING' }
  const leftComparable = comparisonProjection(left)
  const rightComparable = comparisonProjection(right)
  if (leftComparable.targetSystem !== rightComparable.targetSystem) return { status: 'SEMANTIC_MISMATCH', reason: 'TARGET_SYSTEM_CHANGED' }
  if (semanticEntryUrl(leftComparable.entryUrl) !== semanticEntryUrl(rightComparable.entryUrl)) return { status: 'SEMANTIC_MISMATCH', reason: 'ENTRY_URL_CHANGED' }
  if (leftComparable.actions.length !== rightComparable.actions.length || leftComparable.expectedOutcomes.length !== rightComparable.expectedOutcomes.length) {
    return { status: 'SEMANTIC_MISMATCH', reason: 'ACTION_OR_OUTCOME_CARDINALITY_CHANGED' }
  }
  const required = CASE_SEMANTIC_CONTRACTS[caseId] || []
  // Evaluate required business concepts against the complete drafts.  The
  // comparison projection only removes a duplicate terminal read-only step
  // for cardinality purposes; it must not erase the evidence that the draft
  // actually covers name/avatar or other required facts.
  const leftMarkers = new Set(semanticMarkers(left))
  const rightMarkers = new Set(semanticMarkers(right))
  const missingLeft = required.filter(marker => !leftMarkers.has(marker))
  const missingRight = required.filter(marker => !rightMarkers.has(marker))
  if (missingLeft.length || missingRight.length) {
    return { status: 'SEMANTIC_MISMATCH', reason: 'REQUIRED_INTENT_MARKER_MISSING', missingLeft, missingRight }
  }
  return { status: 'SEMANTIC_MATCH', requiredMarkers: required, leftMarkers: [...leftMarkers].sort(), rightMarkers: [...rightMarkers].sort() }
}

function readLedger() { return acceptanceLedger.readLedger() }
function writeLedger(ledger) { return acceptanceLedger.writeLedger(ledger) }
function recordKey(caseId, variant) { return acceptanceLedger.key(caseId, variant, 1) }

function comparable(record) {
  return record && record.status === 'PASSED' && typeof record.semanticHash === 'string'
}

function pairStatus(ledger, caseId) {
  const text = ledger.records[recordKey(caseId, 'TEXT_ONLY')]
  const image = ledger.records[recordKey(caseId, 'TEXT_WITH_IMAGE')]
  if (!comparable(text) || !comparable(image)) return 'PENDING_PAIR'
  return semanticEquivalent(caseId, text.semantic, image.semantic).status
}

function stabilityReferences(candidateId, certificateId) {
  const databasePath = path.join(root, '.data/sqlite/regression_platform.sqlite')
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const certificate = database.prepare(`
      SELECT certificate_id, batch_id, script_sha256, validation_run_ids_json, status
      FROM i8_stability_certificates
      WHERE candidate_id=? AND certificate_id=?
      ORDER BY issued_at DESC LIMIT 1
    `).get(candidateId, certificateId)
    if (!certificate || !['ISSUED', 'PASSED'].includes(String(certificate.status))) fail('I10_ACCEPTANCE_STABILITY_CERTIFICATE_INVALID')
    const fourRunIds = JSON.parse(certificate.validation_run_ids_json)
    if (!Array.isArray(fourRunIds) || fourRunIds.length !== 4 || new Set(fourRunIds).size !== 4) fail('I10_ACCEPTANCE_STABILITY_RUNS_INVALID')
    const runs = database.prepare(`
      SELECT validation_run_id, viewport_id, sequence_no, status
      FROM i8_stability_validation_runs
      WHERE batch_id=? ORDER BY viewport_id, sequence_no
    `).all(certificate.batch_id)
    if (runs.length !== 4 || runs.some(run => run.status !== 'PASSED')) fail('I10_ACCEPTANCE_STABILITY_RUNS_NOT_PASSED')
    const candidate = database.prepare(`SELECT script_id, script_sha256, status FROM i8_script_candidates WHERE candidate_id=?`).get(candidateId)
    if (!candidate || candidate.script_sha256 !== certificate.script_sha256 || !['SCRIPT_VALIDATED', 'STABILITY_CERTIFIED', 'ACTIVE'].includes(candidate.status)) fail('I10_ACCEPTANCE_SCRIPT_CERTIFICATE_CONFLICT')
    return { scriptId: candidate.script_id, scriptHash: candidate.script_sha256, fourRunIds, runs }
  } finally {
    database.close()
  }
}

function usage() {
  return [
    'USAGE:',
    '  node scripts/i10-18-chain-acceptance-live.cjs run <L1..H3> <TEXT_ONLY|TEXT_WITH_IMAGE>',
    '  node scripts/i10-18-chain-acceptance-live.cjs recover <L1..H3> <TEXT_ONLY|TEXT_WITH_IMAGE> <run-directory>',
    '  node scripts/i10-18-chain-acceptance-live.cjs status'
  ].join('\n')
}

function safeExistingRunDirectory(value) {
  const name = String(value || '').trim()
  if (!/^record-[a-z0-9_-]+$/i.test(name)) fail('I10_ACCEPTANCE_RECOVERY_RUN_ID_INVALID')
  const directory = path.resolve(evidenceRoot, 'runs', name)
  const allowed = path.resolve(evidenceRoot, 'runs')
  const relative = path.relative(allowed, directory)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(directory)) {
    fail('I10_ACCEPTANCE_RECOVERY_RUN_DIRECTORY_INVALID')
  }
  return directory
}

function assertImageEvidence(transcript, metadata) {
  const transcriptText = stringify(transcript)
  const hasSelectedImageFacts = /本机OCR：\s*SUCCEEDED/i.test(transcriptText) &&
    /主控筛选事实：\s*[1-9]\d*条/.test(transcriptText)
  if (!metadata.imageIngestIds.length ||
      !metadata.mcpCallSequence.includes('image_ingest_submit') ||
      !metadata.mcpCallSequence.includes('image_ingest_get') ||
      !metadata.mcpCallSequence.includes('image_ingest_decision_submit') ||
      !hasSelectedImageFacts) {
    fail('I10_ACCEPTANCE_RECOVERY_IMAGE_EVIDENCE_INVALID')
  }
}

function finalizeRecord({ caseId, variant, directory, item, naturalLanguage, publication, result }) {
  const releaseIdentity = currentReleaseIdentity()
  const flowVersion = Number(releaseIdentity.flowVersion)
  const flowHash = String(releaseIdentity.deployedFlowHash || '')
  if (publication.deployed !== true || flowVersion !== 7 || !/^[0-9a-f]{64}$/i.test(flowHash)) fail('I10_ACCEPTANCE_FLOWISE_V7_NOT_DEPLOYED')
  const bodies = fileBodies(directory)
  if (!bodies.length) fail('I10_ACCEPTANCE_RECOVERY_TRANSCRIPT_MISSING')
  const transcript = bodies.map(body => body.value)
  const serializedBodies = stringify(bodies.map(item => item.value))
  const draft = lastCaseDraft(bodies)
  const semantic = semanticProjection(draft)
  if (!semantic || !semantic.entryUrl || !semantic.actions.length || semantic.actions.length !== semantic.expectedOutcomes.length) {
    fail('I10_ACCEPTANCE_CASE_DRAFT_INCOMPLETE', { caseId, variant })
  }
  const metadata = result.interactionMetadata || {}
  if (variant === 'TEXT_WITH_IMAGE') assertImageEvidence(transcript, metadata)
  stage8.assertCandidateDeliveryEvidence(transcript, { caseId, variant })
  const candidateId = metadata.candidateIds?.at(-1) || firstOpaqueId(serializedBodies, opaqueReferences.scanPattern('candidate'))
  const certificateId = metadata.certificateIds?.at(-1) || firstOpaqueId(serializedBodies, opaqueReferences.scanPattern('certificate'))
  const journeyId = metadata.journeyIds?.at(-1) || firstOpaqueId(serializedBodies, opaqueReferences.scanPattern('journey'))
  const targetProfileId = firstOpaqueId(serializedBodies, opaqueReferences.scanPattern('targetProfile'))
  const execution = result.executionEvidence || {}
  // Only adapter-bound (HIGH class) cases prepare a TargetProfile; GENERIC_WEB
  // cases legitimately have none, so it cannot be an unconditional reference.
  const catalogEntry = (JSON.parse(fs.readFileSync(path.join(root, 'contracts/i10/case-catalog-v1.json'), 'utf8')).cases || {})[caseId] || {}
  const required = [candidateId, certificateId, journeyId,
    ...(catalogEntry.class === 'HIGH' ? [targetProfileId] : []),
    execution.taskId || execution.scheduleId, execution.inboxId || execution.scheduledResult?.inboxId]
  if (required.some(value => !value)) fail('I10_ACCEPTANCE_REQUIRED_REFERENCE_MISSING', { caseId, variant })
  const stability = stabilityReferences(candidateId, certificateId)
  const executionMode = result.mode
  const record = {
    schemaVersion: 'hengzhun-i10-acceptance-record-v3',
    recordId: `acceptance_${crypto.randomUUID()}`,
    caseId,
    variant,
    attempt: 1,
    source: { naturalLanguageHash: sha256(naturalLanguage), browserOcrEvidence: path.relative(root, browserSuitePath).replaceAll('\\', '/') },
    releaseIdentity,
    flowId: releaseIdentity.flowId,
    flowVersion,
    flowHash,
    runDirectory: path.relative(root, directory).replaceAll('\\', '/'),
    journeyId,
    targetProfileId,
    inputArtifactHashes: result.inputArtifactHashes || [],
    ocrFactHash: variant === 'TEXT_WITH_IMAGE' ? sha256(stringify({ imageIngestIds: metadata.imageIngestIds, ocr: item.ocr })) : null,
    caseDraftHash: sha256(stringify(draft)),
    semanticHash: sha256(stringify(semantic)),
    semantic,
    candidateId,
    scriptId: stability.scriptId,
    scriptHash: stability.scriptHash,
    playwrightValidationTaskId: metadata.buildJobIds?.at(-1) || null,
    stabilityCertificateId: certificateId,
    fourRunIds: stability.fourRunIds,
    activationDecision: { mode: 'DIRECT_ACTIVATE', verified: true },
    execution: { mode: executionMode, taskId: execution.taskId || null, scheduleId: execution.scheduleId || null, runId: execution.runId || execution.scheduledResult?.runId || null },
    scheduleType: result.mode,
    scheduleId: execution.scheduleId || null,
    executionTaskId: execution.taskId || execution.scheduledResult?.taskId || null,
    resultInboxId: execution.inboxId || execution.scheduledResult?.inboxId || null,
    terminalArtifactId: execution.artifactId || execution.scheduledResult?.artifactId || null,
    status: 'PASSED',
    failurePhase: null,
    recoveryAction: null,
    transcriptFiles: bodies.map(body => ({ path: path.relative(root, body.path).replaceAll('\\', '/'), sha256: sha256(fs.readFileSync(body.path)) })),
    completedAt: new Date().toISOString()
  }
  if (!/^run_[0-9a-f-]{36}$/i.test(String(execution.runId || execution.scheduledResult?.runId || ''))) fail('I10_ACCEPTANCE_RUN_REFERENCE_INVALID')
  if (!/^[0-9a-f]{64}$/i.test(String(record.scriptHash || ''))) fail('I10_ACCEPTANCE_SCRIPT_HASH_MISSING')
  const runResultPath = path.join(directory, 'run-result.json')
  record.runResultPath = path.relative(root, runResultPath).replaceAll('\\', '/')
  atomicWrite(runResultPath, {
    schemaVersion: 'hengzhun-i10-acceptance-run-result-v1', status: 'PASSED', caseId, variant,
    releaseIdentity, completedAt: record.completedAt,
    references: { journeyId, candidateId, certificateId, scriptHash: record.scriptHash,
      taskId: record.executionTaskId, scheduleId: record.scheduleId, inboxId: record.resultInboxId,
      terminalArtifactId: record.terminalArtifactId }
  })
  atomicWrite(path.join(directory, 'acceptance-record.json'), record)
  const persisted = acceptanceLedger.recordTerminal(record)
  const ledger = readLedger()
  const pair = pairStatus(ledger, caseId)
  if (pair === 'SEMANTIC_MISMATCH') fail('I10_ACCEPTANCE_TEXT_IMAGE_SEMANTIC_MISMATCH', { caseId })
  return { record: persisted, pairStatus: pair, ledgerPath: path.relative(root, acceptanceLedger.ledgerPath).replaceAll('\\', '/') }
}

async function run(caseId, variant) {
  const existing = acceptanceLedger.existingTerminal(caseId, variant)
  if (existing) {
    // Do not execute a side-effecting Flowise journey again for an already
    // accepted release identity.  A replay must reuse the immutable evidence
    // record rather than create a second transfer/order or overwrite a 2x2
    // certificate reference.
    return { record: existing, pairStatus: pairStatus(readLedger(), caseId), reused: true }
  }
  const { item, screenshotPath } = loadBrowserCase(caseId)
  const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'))
  const runId = `record-${caseId.toLowerCase()}-${variant.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
  const directory = path.join(evidenceRoot, 'runs', runId)
  fs.mkdirSync(directory, { recursive: true })
  acceptanceLedger.writeCheckpoint({
    caseId, variant, stage: 'SCENARIO_PREPARED',
    runDirectory: path.relative(root, directory).replaceAll('\\', '/'),
    references: { caseId, variant }
  })
  stage8.setEvidenceRootForAcceptance(directory)
  const scenario = loadScenario(variant === 'TEXT_WITH_IMAGE' ? screenshotPath : null)
  // H1-H3 exercise the explicit AUTO_PERSISTED_UKEY path.  Configure the
  // controlled fixture before authoring; this is test setup, never an
  // inference from static page text or a model response.
  if (caseId.startsWith('H')) await stage8.setFailureMode(scenario.failureControlUrl, 'verification')
  const mode = variant === 'TEXT_ONLY' ? 'ON_DEMAND' : SCHEDULE_BY_IMAGE_CASE[caseId]
  const naturalLanguage = acceptanceNaturalLanguage(item, caseId)
  try {
    const result = await stage8.runConversation({
      inputType: 'NATURAL_LANGUAGE', mode, reverse: false, scenario, sequence: caseId,
      supportingImageCount: variant === 'TEXT_WITH_IMAGE' ? 1 : 0,
      caseDefinition: { targetSystem: '复兴银行门户', naturalLanguage }
    })
    acceptanceLedger.writeCheckpoint({
      caseId, variant, stage: 'FLOWISE_TERMINAL_RECEIVED',
      runDirectory: path.relative(root, directory).replaceAll('\\', '/'),
      references: result.interactionMetadata || {}
    })
    return finalizeRecord({ caseId, variant, directory, item, naturalLanguage, publication, result })
  } catch (error) {
    atomicWrite(path.join(directory, 'run-result.json'), {
      schemaVersion: 'hengzhun-i10-acceptance-run-result-v1', status: 'FAILED', caseId, variant,
      errorCode: error.code || error.message || 'I10_ACCEPTANCE_FAILED', completedAt: new Date().toISOString()
    })
    // A Flowise tool-input schema rejection happens before the MCP handler
    // reaches Harness. It therefore has no business side effect and may be
    // restarted in a fresh evidence directory after the graph contract is
    // fixed. All other failures remain recover-in-place by default.
    const responseError = String(error?.details?.responseError || '')
    const retryDisposition = error?.code === 'I10_STAGE8_FLOWISE_PREDICTION_FAILED' &&
      /I10_MCP_TOOL_INPUT_SCHEMA_FAILED/.test(responseError)
      ? 'NO_SIDE_EFFECT_CONFIRMED'
      : 'RECOVER_IN_PLACE_REQUIRED'
    acceptanceLedger.writeCheckpoint({
      caseId, variant, stage: 'FAILED_RECOVERABLE',
      runDirectory: path.relative(root, directory).replaceAll('\\', '/'), references: { retryDisposition }
    })
    throw error
  }
}

async function recover(caseId, variant, runDirectoryName) {
  const { item } = loadBrowserCase(caseId)
  const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'))
  const directory = safeExistingRunDirectory(runDirectoryName)
  const transcript = fileBodies(directory).map(body => body.value)
  const terminalText = String(transcript.at(-1)?.text || '')
  const metadata = stage8.scenarioMetadata(transcript)
  const mode = variant === 'TEXT_ONLY' ? 'ON_DEMAND' : SCHEDULE_BY_IMAGE_CASE[caseId]
  let executionEvidence
  if (mode === 'ON_DEMAND') {
    try {
      executionEvidence = stage8.requireOnDemandTerminalEvidence(transcript, terminalText)
    } catch (error) {
      // S4: an interrupted acceptance conversation (checkpoint before any
      // terminal reply) must continue from the authoritative journey, not be
      // declared unrecoverable and not be replayed as a fresh side-effecting
      // case.  Resume polling the same journey through the cross-session
      // chain; every new transcript lands in this same run directory.
      const serialized = transcript.map(value => JSON.stringify(value)).join('\n')
      const journeyId = [...new Set(serialized.match(opaqueReferences.scanPattern('journey')) || [])].at(-1)
      if (!journeyId) fail('I10_ACCEPTANCE_RECOVERY_JOURNEY_ID_MISSING', { caseId, variant })
      stage8.setEvidenceRootForAcceptance(directory)
      const scenario = loadScenario(null)
      const result = await stage8.runConversation({
        inputType: 'NATURAL_LANGUAGE', mode, reverse: false, scenario, sequence: caseId,
        resumeJourneyId: journeyId, seedTranscript: transcript
      })
      return finalizeRecord({
        caseId,
        variant,
        directory,
        item,
        naturalLanguage: acceptanceNaturalLanguage(item, caseId),
        publication,
        result
      })
    }
  } else {
    // A caller may be interrupted after the one-time/recurring schedule has
    // been accepted but before the ledger write.  Re-query the already-created
    // schedule through the public Flowise/Harness route; never create a second
    // schedule merely to recover a local evidence write.
    const allText = transcript.map(value => JSON.stringify(value)).join('\n')
    const scheduleIds = [...new Set(allText.match(opaqueReferences.scanPattern('schedule')) || [])]
    const scheduleId = scheduleIds.at(-1)
    if (!scheduleId) fail('I10_ACCEPTANCE_RECOVERY_SCHEDULE_ID_MISSING', { mode })
    const scheduledResult = await stage8.awaitScheduledResult(scheduleId, mode, `${caseId}-recover`)
    executionEvidence = { scheduleId, scheduledResult }
  }
  return finalizeRecord({
    caseId,
    variant,
    directory,
    item,
    naturalLanguage: acceptanceNaturalLanguage(item, caseId),
    publication,
    result: { mode, executionEvidence, interactionMetadata: metadata, inputArtifactHashes: [] }
  })
}

async function main(argv) {
  const [command, caseArgument, variantArgument] = argv
  if (command === 'status' && !caseArgument) {
    const ledger = readLedger()
    const passed = acceptanceLedger.currentRecords(ledger).length
    const pairs = Object.fromEntries(CASE_ORDER.map(caseId => [caseId, pairStatus(ledger, caseId)]))
    process.stdout.write(`${JSON.stringify({ schemaVersion: ledger.schemaVersion, passed, required: 18, pairs, checkpoints: Object.keys(ledger.checkpoints).length }, null, 2)}\n`)
    return
  }
  if (!['run', 'recover'].includes(command)) fail(usage())
  const caseId = safeCaseId(caseArgument)
  const variant = safeVariant(variantArgument)
  const result = command === 'recover'
    ? await recover(caseId, variant, argv[3])
    : await run(caseId, variant)
  process.stdout.write(`${JSON.stringify({ status: 'PASSED', recordId: result.record.recordId, caseId: result.record.caseId, variant: result.record.variant, pairStatus: result.pairStatus, ledgerPath: result.ledgerPath }, null, 2)}\n`)
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || error.message || 'I10_ACCEPTANCE_FAILED', details: error.details || {} })}\n`)
  process.exitCode = 2
})

module.exports = {
  CASE_ORDER,
  SCHEDULE_BY_IMAGE_CASE,
  semanticProjection,
  comparisonProjection,
  fileBodies,
  semanticMarkers,
  semanticEntryUrl,
  semanticEquivalent,
  pairStatus,
  recordKey,
  acceptanceNaturalLanguage
}
