'use strict'

const crypto = require('node:crypto')

const CANONICAL_ERROR_FIELDS = Object.freeze([
  'errorCode',
  'category',
  'status',
  'retryable',
  'userActionRequired',
  'safeMessage',
  'fieldErrors',
  'correlationRef'
])

const SECRET_KEY = /(?:authorization|api.?key|token|password|credential(?:value)?|cookie|requestbody)/i
const SECRET_VALUE = /(?:Bearer\s+[^\s"']+|sk-[A-Za-z0-9_-]+)/gi

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return undefined
  const redacted = value.replace(SECRET_VALUE, '[REDACTED]').trim()
  return redacted ? redacted.slice(0, maxLength) : undefined
}

function safeFieldErrors(body) {
  const issues = Array.isArray(body?.details?.issues)
    ? body.details.issues
    : Array.isArray(body?.fieldErrors)
      ? body.fieldErrors
      : Array.isArray(body?.validationIssues)
        ? body.validationIssues
        : []
  return issues
    .filter(issue => issue && typeof issue === 'object')
    .slice(0, 12)
    .map(issue => ({
      path: boundedText(issue.path, 120) || '',
      code: boundedText(issue.code, 80) || 'invalid'
    }))
}

function projectLegacyHarnessError(body, status) {
  const issues = safeFieldErrors(body)
  return {
    errorCode: typeof body?.errorCode === 'string' ? body.errorCode : 'HARNESS_REQUEST_FAILED',
    category: typeof body?.category === 'string' ? body.category : 'TOOL',
    status,
    ...(issues.length ? { validationIssues: issues } : {})
  }
}

function projectCanonicalHarnessError(body, status) {
  const fieldErrors = safeFieldErrors(body)
  const safeMessage = boundedText(body?.safeMessage ?? body?.message, 500)
  const correlationRef = boundedText(body?.correlationRef ?? body?.requestId, 160)
  return {
    errorCode: typeof body?.errorCode === 'string' ? body.errorCode : 'HARNESS_REQUEST_FAILED',
    category: typeof body?.category === 'string' ? body.category : 'TOOL',
    status: Number.isInteger(status) && status >= 400 ? status : 500,
    retryable: body?.retryable === true,
    userActionRequired: body?.userActionRequired === true,
    ...(safeMessage ? { safeMessage } : {}),
    ...(fieldErrors.length ? { fieldErrors } : {}),
    ...(correlationRef ? { correlationRef } : {})
  }
}

// B4-S4 cutover: MCP-local tool errors also leave through the canonical
// 8-field envelope. Idempotent on already-canonical payloads; legacy
// `validationIssues` are projected to `fieldErrors`.
function projectCanonicalToolError(value) {
  const fieldErrors = Array.isArray(value?.fieldErrors) && value.fieldErrors.length
    ? value.fieldErrors
    : Array.isArray(value?.validationIssues) && value.validationIssues.length
      ? value.validationIssues
      : []
  const safeMessage = boundedText(value?.safeMessage ?? value?.message, 500)
  const correlationRef = boundedText(value?.correlationRef ?? value?.requestId, 160)
  return {
    errorCode: typeof value?.errorCode === 'string' && value.errorCode ? value.errorCode : 'MCP_ARGUMENT_INVALID',
    category: typeof value?.category === 'string' ? value.category : 'TOOL',
    status: Number.isInteger(value?.status) && value.status >= 400 ? value.status : 400,
    retryable: value?.retryable === true,
    userActionRequired: value?.userActionRequired === true,
    ...(safeMessage ? { safeMessage } : {}),
    ...(fieldErrors.length ? { fieldErrors } : {}),
    ...(correlationRef ? { correlationRef } : {})
  }
}

function normalizeCredentialSessionGetRequest(input) {
  return { sessionId: String(input?.sessionId || '').trim() }
}

// ---------------------------------------------------------------------------
// RF-001-B3-S3: 13 entry-alias authoritative projections (B2 contract).
// Each alias is read ONLY at this MCP entry; the Harness request payload
// contains canonical field names only. Behavior is byte-identical to the
// pre-RF-001 inline handlers (semantics frozen, names standardized).
// ---------------------------------------------------------------------------

function codeError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function digest(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

function parseJsonArgument(value, errorCode) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
    return parsed
  } catch {
    throw codeError(errorCode)
  }
}

function normalizeCasePrepareUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw codeError('I10_ENTRY_URL_PROTOCOL_INVALID')
    return parsed.href
  } catch (error) {
    if (error?.code) throw error
    throw codeError('I10_ENTRY_URL_INVALID')
  }
}

function normalizeCasePrepareCredentialRef(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (!/^credential_[0-9a-f-]{36}$/.test(raw)) throw codeError('I10_CREDENTIAL_REF_INVALID')
  return raw
}

function normalizeCasePrepareActionSteps(value, steps, credentialRef) {
  if (value !== undefined && !Array.isArray(value)) throw codeError('I10_ACTION_STEPS_INVALID')
  const source = Array.isArray(value) ? value : []
  return steps.map((step, index) => {
    const raw = source[index] && typeof source[index] === 'object' && !Array.isArray(source[index]) ? source[index] : {}
    const instruction = String(raw.instruction || raw.action || step.action || '').trim()
    const expected = String(raw.expected || step.expected || '').trim()
    const rawType = String(raw.actionType || '').toUpperCase()
    const actionType = ['NAVIGATE', 'CLICK', 'INPUT', 'SELECT', 'UPLOAD', 'WAIT', 'ASSERT', 'VERIFY'].includes(rawType)
      ? rawType
      : /输入|填写|键入/i.test(instruction) ? 'INPUT'
        : /等待/i.test(instruction) ? 'WAIT'
          : /验证|核对|确认.*显示/i.test(instruction) ? 'VERIFY'
            : /打开|访问|进入.*页面/i.test(instruction) ? 'NAVIGATE' : 'CLICK'
    const credentialAction = actionType === 'INPUT' && /账号|用户名|密码|手机号/i.test(instruction)
    const allowedInputSources = ['USER_TEXT', 'IMAGE_EVIDENCE', 'CASE_FILE', 'VIDEO_EVIDENCE', 'CREDENTIAL_REF', 'RUNTIME_USER_INPUT']
    const inputValueSource = allowedInputSources.includes(raw.inputValueSource)
      ? raw.inputValueSource
      : actionType === 'INPUT' ? 'RUNTIME_USER_INPUT' : undefined
    if (!instruction || !expected) throw codeError('I10_ACTION_STEPS_INVALID')
    return {
      ordinal: index + 1,
      actionType,
      instruction,
      ...(String(raw.targetDescription || raw.elementDescription || '').trim()
        ? { targetDescription: String(raw.targetDescription || raw.elementDescription).trim().slice(0, 500) }
        : {}),
      ...(!credentialAction && typeof raw.inputValue === 'string' && raw.inputValue.trim()
        ? { inputValue: raw.inputValue.trim().slice(0, 2000) }
        : {}),
      ...(credentialAction
        ? { inputValueSource: 'CREDENTIAL_REF', provenanceRefs: credentialRef ? [credentialRef] : [] }
        : { ...(inputValueSource ? { inputValueSource } : {}), provenanceRefs: Array.isArray(raw.provenanceRefs) ? raw.provenanceRefs : [] }),
      confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.9,
      expected
    }
  })
}

function normalizeI10NaturalDraft(draft, caseDescription, sessionRef, credentialRefOverride) {
  const steps = Array.isArray(draft.steps) ? draft.steps.map(step => ({
    action: String(step.action || '').trim(),
    expected: String(step.expected || step.expectedResult || step.expectedResults || '').trim()
  })).filter(step => step.action && step.expected) : []
  const entryUrl = normalizeCasePrepareUrl(draft.entryUrl || caseDescription.match(/https?:\/\/[^\s，。；]+/)?.[0] || '')
  const targetSystem = String(draft.targetSystem || '').trim()
  const credentialRef = normalizeCasePrepareCredentialRef(credentialRefOverride || (typeof draft.credentialRef === 'string' ? draft.credentialRef : ''))
  const missingFields = [...new Set([
    ...(Array.isArray(draft.missingFields) ? draft.missingFields.map(String) : []),
    ...(!targetSystem ? ['targetSystem'] : []), ...(!entryUrl ? ['entryUrl'] : []),
    ...(!credentialRef ? ['credentialRef'] : []), ...(steps.length === 0 ? ['steps'] : [])
  ])]
  const assertions = Array.isArray(draft.assertions) && draft.assertions.length
    ? draft.assertions.map(String).filter(Boolean)
    : steps.map(step => step.expected)
  return {
    schemaVersion: 'hengzhun-i10-case-draft-v1',
    title: String(draft.title || draft.caseName || '未命名回归案例').slice(0, 160),
    objective: String(draft.objective || draft.caseDescription || caseDescription).slice(0, 2000),
    summary: String(draft.summary || draft.caseDescription || caseDescription).slice(0, 1000),
    ...(targetSystem ? { targetSystem } : {}), ...(entryUrl ? { entryUrl } : {}),
    preconditions: Array.isArray(draft.preconditions) && draft.preconditions.length ? draft.preconditions.map(String).filter(Boolean) : ['目标系统可访问', '本机安全凭据引用有效'],
    steps, assertions, ...(credentialRef ? { credentialRef } : {}),
    ...(typeof draft.supportingImageIngestId === 'string' && draft.supportingImageIngestId.trim()
      ? { supportingImageIngestId: draft.supportingImageIngestId.trim() }
      : {}),
    caseFacts: Array.isArray(draft.caseFacts)
      ? draft.caseFacts.filter(item => item && typeof item === 'object' && !Array.isArray(item))
      : [],
    actionStepsV2: normalizeCasePrepareActionSteps(draft.actionStepsV2, steps, credentialRef),
    verificationRequirements: Array.isArray(draft.verificationRequirements) ? draft.verificationRequirements : [],
    ...(draft.businessInputs && typeof draft.businessInputs === 'object' && !Array.isArray(draft.businessInputs) &&
        draft.businessInputs.values && typeof draft.businessInputs.values === 'object' && !Array.isArray(draft.businessInputs.values)
      ? { businessInputs: {
          schemaVersion: 'hengzhun-i10-typed-business-inputs-v1',
          source: ['USER_CONFIRMED', 'IMPORT_CONFIRMED', 'OCR_CONFIRMED'].includes(draft.businessInputs.source)
            ? draft.businessInputs.source : 'USER_CONFIRMED',
          values: {
            ...(draft.businessInputs.values.payeeRef ? { payeeRef: String(draft.businessInputs.values.payeeRef).slice(0, 160) } : {}),
            ...(draft.businessInputs.values.amount ? { amount: String(draft.businessInputs.values.amount).slice(0, 32) } : {}),
            ...(draft.businessInputs.values.currency ? { currency: String(draft.businessInputs.values.currency).slice(0, 8).toUpperCase() } : {}),
            ...(draft.businessInputs.values.purpose ? { purpose: String(draft.businessInputs.values.purpose).slice(0, 200) } : {}),
            ...(draft.businessInputs.values.dateRange ? { dateRange: String(draft.businessInputs.values.dateRange).slice(0, 80) } : {}),
            ...(draft.businessInputs.values.filter ? { filter: String(draft.businessInputs.values.filter).slice(0, 500) } : {})
          }
        } }
      : {}),
    source: { inputType: 'NATURAL_LANGUAGE', sourceRef: sessionRef, sourceHash: digest(caseDescription), provenanceSummary: '由Flowise主控模型根据用户自然语言生成，并由MCP确定性规范化来源与固定策略字段。' },
    confidence: Number.isFinite(Number(draft.confidence)) ? Math.max(0, Math.min(1, Number(draft.confidence))) : 0.9,
    missingFields, confirmationStatus: missingFields.length ? 'WAITING_USER' : 'CONFIRMED',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY', executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY', evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  }
}

// alias: ingest_submit.supportingImageIngestId=NONE -> omitted (B2 contract)
function normalizeIngestSubmitRequest(business) {
  const request = { ...business }
  if (!request.supportingImageIngestId || request.supportingImageIngestId === 'NONE') delete request.supportingImageIngestId
  return request
}

// aliases: ingest_decision_submit.correctionsJson -> corrections,
//          ingest_decision_submit.itemDecisionsJson -> itemDecisions
function normalizeIngestDecisionSubmitRequest({ correctionsJson, itemDecisionsJson }) {
  let corrections = []
  if (correctionsJson) {
    const parsed = typeof correctionsJson === 'string' ? JSON.parse(correctionsJson) : correctionsJson
    corrections = Array.isArray(parsed) ? parsed : parsed.corrections
    if (!Array.isArray(corrections)) throw new Error('corrections array required')
  }
  let itemDecisions = []
  if (itemDecisionsJson) {
    const parsed = typeof itemDecisionsJson === 'string' ? JSON.parse(itemDecisionsJson) : itemDecisionsJson
    itemDecisions = Array.isArray(parsed) ? parsed : parsed.itemDecisions
    if (!Array.isArray(itemDecisions)) throw new Error('itemDecisions array required')
  }
  return { corrections, itemDecisions }
}

// alias: journey_prepare.draftJson — DEC-2 self-mapping (2026-08-02).
// The executable-canonical field name at the Harness boundary is draftJson
// (harness i10 journeys:prepare schema + service.ts read inputEnvelope.draftJson).
// No projection is performed; the field name is preserved.
function normalizeJourneyPrepareDraft(value) {
  return value === undefined ? undefined : parseJsonArgument(value, 'I10_JOURNEY_DRAFT_INVALID')
}

// aliases: case_prepare.draftArray/draftJson -> draft,
//          case_prepare.multimodalContextJson -> multimodalContext merge
// (flat-draft path only, mirroring pre-RF-001 behavior)
function normalizeCasePrepareRequest(input) {
  const { caseDescription, draftArray, draftJson, caseTitle, objective, summary, targetSystem, entryUrl, preconditions,
    actions, expectedOutcomes, assertions, missingFields, multimodalContextJson, credentialRef } = input
  const normalizedCredentialRef = normalizeCasePrepareCredentialRef(credentialRef)
  const flatDraftSupplied = caseTitle !== undefined || actions !== undefined || expectedOutcomes !== undefined
  const suppliedDraftSources = Number(draftArray !== undefined) + Number(draftJson !== undefined) + Number(flatDraftSupplied)
  if (suppliedDraftSources !== 1) throw codeError('I10_DRAFT_SOURCE_AMBIGUOUS')
  let draft
  if (flatDraftSupplied) {
    const normalizedEntryUrl = normalizeCasePrepareUrl(entryUrl)
    if (!caseTitle || !objective || !summary || !targetSystem || !normalizedEntryUrl || !preconditions?.length || !actions?.length ||
        !expectedOutcomes?.length || actions.length !== expectedOutcomes.length || !assertions?.length) {
      throw codeError('I10_DRAFT_FLAT_FIELDS_INVALID')
    }
    draft = {
      schemaVersion: 'hengzhun-i10-case-draft-v1', title: caseTitle, objective, summary, targetSystem, entryUrl: normalizedEntryUrl,
      preconditions, steps: actions.map((action, index) => ({ action, expected: expectedOutcomes[index] })), assertions,
      credentialRef: normalizedCredentialRef, missingFields: missingFields || [], confirmationStatus: missingFields?.length ? 'WAITING_USER' : 'CONFIRMED'
    }
    if (multimodalContextJson) {
      const multimodal = parseJsonArgument(multimodalContextJson, 'I10_MULTIMODAL_CONTEXT_INVALID')
      if (multimodal.actionStepsV2 !== undefined && !Array.isArray(multimodal.actionStepsV2)) throw codeError('I10_ACTION_STEPS_INVALID')
      if (multimodal.verificationRequirements !== undefined && !Array.isArray(multimodal.verificationRequirements)) throw codeError('I10_VERIFICATION_REQUIREMENTS_INVALID')
      Object.assign(draft, {
        supportingImageIngestId: multimodal.supportingImageIngestId,
        caseFacts: Array.isArray(multimodal.caseFacts) ? multimodal.caseFacts : [],
        actionStepsV2: multimodal.actionStepsV2 || [],
        verificationRequirements: multimodal.verificationRequirements || []
      })
    }
  } else {
    draft = draftArray ? draftArray[0] : parseJsonArgument(draftJson, 'I8_DRAFT_JSON_INVALID')
  }
  return { normalizedCredentialRef, draft }
}

// alias: case_prepare.acceptanceSummaryJson -> acceptanceSummary
// (parsed only on the legacy i8 draft route, mirroring pre-RF-001 behavior)
function normalizeCaseAcceptanceSummary(value) {
  return parseJsonArgument(value, 'I8_ACCEPTANCE_JSON_INVALID')
}

// aliases: repair_propose.patchJson -> patch,
//          repair_propose.operationType/targetRef/locatorKind/locatorValue/rationale -> patch
function normalizeRepairProposeRequest({ patchJson, operationType, targetRef, locatorKind, locatorValue, rationale }) {
  if (patchJson) return { patch: parseJsonArgument(patchJson, 'I8_PATCH_JSON_INVALID') }
  if (operationType && targetRef && locatorKind && locatorValue && rationale) {
    return { patch: { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: operationType, targetRef, locator: { kind: locatorKind, value: locatorValue } }], rationale } }
  }
  throw codeError('I8_PATCH_FLAT_FIELDS_INVALID')
}

// alias: authoring_submit intentStepIds/actions/expectedOutcomes/riskLevels/
// inputValues/inputValueSources/assertions — DEC-1 OPTION-C (2026-08-02):
// declared no-effect. Read only at this MCP entry; they must never reach the
// Harness request. Current Flowise (v5+) does not bind them.
const AUTHORING_SUBMIT_NO_EFFECT_ALIASES = Object.freeze([
  'intentStepIds', 'actions', 'expectedOutcomes', 'riskLevels', 'inputValues', 'inputValueSources', 'assertions'
])

function normalizeAuthoringSubmitRequest(input) {
  const declaredNoEffect = AUTHORING_SUBMIT_NO_EFFECT_ALIASES.filter(key => input[key] !== undefined)
  return {
    preparationId: input.preparationId,
    expectedVersion: input.expectedVersion,
    choice: input.choice,
    confirmationRef: input.confirmationRef,
    reason: input.reason,
    declaredNoEffect
  }
}

// alias: run_submit/schedule_create implicit credentialAlias=i3-customer —
// frozen execution credential binding until B4 credentialRef consumer
// migration (B2 contract). Flowise never supplies the value; any other value
// fails closed.
const FROZEN_EXECUTION_CREDENTIAL_ALIAS = Object.freeze({ credentialAlias: 'i3-customer' })

function normalizeCredentialBinding(credentialAlias) {
  if (credentialAlias !== undefined && credentialAlias !== FROZEN_EXECUTION_CREDENTIAL_ALIAS.credentialAlias) {
    throw codeError('I10_EXECUTION_CREDENTIAL_BINDING_FROZEN')
  }
  return { ...FROZEN_EXECUTION_CREDENTIAL_ALIAS, auditDigest: digest(FROZEN_EXECUTION_CREDENTIAL_ALIAS.credentialAlias) }
}

function comparableError(envelope) {
  return {
    errorCode: envelope?.errorCode,
    category: envelope?.category,
    status: envelope?.status,
    fieldErrors: envelope?.fieldErrors ?? envelope?.validationIssues ?? []
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function safeShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value).filter(key => !SECRET_KEY.test(key)).sort()
}

function createShadowObserver(options = {}) {
  const enabled = options.enabled === true
  const sink = typeof options.sink === 'function' ? options.sink : () => undefined
  const state = { observed: 0, equivalent: 0, mismatched: 0, lastMismatch: null }

  function record(kind, operation, legacy, canonical) {
    if (!enabled) return
    state.observed += 1
    const left = kind === 'error' ? comparableError(legacy) : legacy
    const right = kind === 'error' ? comparableError(canonical) : canonical
    if (stableJson(left) === stableJson(right)) {
      state.equivalent += 1
      return
    }
    state.mismatched += 1
    state.lastMismatch = {
      operation: String(operation || 'unknown').slice(0, 160),
      kind,
      legacyFields: safeShape(legacy),
      canonicalFields: safeShape(canonical),
      digest: crypto.createHash('sha256').update(stableJson({ left, right })).digest('hex')
    }
    sink({ event: 'rf001_shadow_mismatch', ...state.lastMismatch })
  }

  return {
    observeError(operation, legacy, canonical) { record('error', operation, legacy, canonical) },
    observeSuccess(operation, legacy, canonical) { record('success', operation, legacy, canonical) },
    snapshot() { return { enabled, ...state, lastMismatch: state.lastMismatch ? { ...state.lastMismatch } : null } }
  }
}

module.exports = {
  AUTHORING_SUBMIT_NO_EFFECT_ALIASES,
  CANONICAL_ERROR_FIELDS,
  FROZEN_EXECUTION_CREDENTIAL_ALIAS,
  createShadowObserver,
  normalizeAuthoringSubmitRequest,
  normalizeCaseAcceptanceSummary,
  normalizeCasePrepareActionSteps,
  normalizeCasePrepareCredentialRef,
  normalizeCasePrepareRequest,
  normalizeCasePrepareUrl,
  normalizeCredentialBinding,
  normalizeCredentialSessionGetRequest,
  normalizeIngestDecisionSubmitRequest,
  normalizeIngestSubmitRequest,
  normalizeI10NaturalDraft,
  normalizeJourneyPrepareDraft,
  normalizeRepairProposeRequest,
  parseJsonArgument,
  projectCanonicalHarnessError,
  projectCanonicalToolError,
  projectLegacyHarnessError
}
