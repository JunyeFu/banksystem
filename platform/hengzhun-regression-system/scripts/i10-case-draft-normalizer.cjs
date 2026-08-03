'use strict'

const INVISIBLE_EDGE = /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g
const CREDENTIAL_REF = /^credential_[0-9a-f-]{36}$/
const SAFE_REF = /^[A-Za-z0-9._:-]{3,160}$/

function cleanText(value, maxLength = 2000) {
  return String(value ?? '').replace(INVISIBLE_EDGE, '').slice(0, maxLength)
}

function cleanTextArray(value, maxItems = 50, maxLength = 500) {
  let source = value
  if (typeof source === 'string' && source.trim()) {
    try { source = JSON.parse(source) } catch { source = [] }
  }
  return Array.isArray(source)
    ? source.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : []
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mergeFlowiseDraft(previousValue, incomingValue) {
  const previous = parseObject(previousValue)
  const incoming = parseObject(incomingValue)
  const previousActions = Array.isArray(previous.steps)
    ? previous.steps.map(item => cleanText(item && item.action, 500)).filter(Boolean)
    : cleanTextArray(previous.actions)
  const previousExpected = Array.isArray(previous.steps)
    ? previous.steps.map(item => cleanText(item && item.expected, 500)).filter(Boolean)
    : cleanTextArray(previous.expectedOutcomes)
  const priorRaw = {
    caseTitle: previous.caseTitle || previous.title,
    objective: previous.objective,
    summary: previous.summary,
    targetSystem: previous.targetSystem,
    entryUrl: previous.entryUrl,
    preconditions: previous.preconditions,
    actions: previousActions,
    expectedOutcomes: previousExpected,
    assertions: previous.assertions,
    missingFields: previous.missingFields,
    businessInputs: previous.businessInputs,
    multimodalContext: {
      supportingImageIngestId: previous.supportingImageIngestId,
      caseFacts: previous.caseFacts,
      actionStepsV2: previous.actionStepsV2,
      verificationRequirements: previous.verificationRequirements
    },
    acceptanceSummary: previous.acceptanceSummary || previous.summary
  }
  const merged = { ...priorRaw }
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      if (value.length > 0 || key === 'missingFields') merged[key] = value
      continue
    }
    if (value && typeof value === 'object') {
      merged[key] = { ...parseObject(merged[key]), ...value }
      continue
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      merged[key] = value
      continue
    }
    if (cleanText(value, 8000)) merged[key] = value
  }
  return merged
}

function normalizeEntryUrl(value, naturalLanguage) {
  const direct = cleanText(value, 2048)
  const groundingText = cleanText(naturalLanguage, 8000)
  if (direct && !/^https?:\/\//i.test(direct)) {
    return { value: '', errorCode: 'I10_ENTRY_URL_PROTOCOL_INVALID' }
  }
  // Do not let Chinese prose immediately following an address become part of
  // the URL (for example: ".../portal/login输入账号密码"). A URL accepted by
  // this local contract is deliberately limited to RFC3986-style ASCII path,
  // query and fragment characters.
  const groundedUrls = groundingText.match(/https?:\/\/[A-Za-z0-9._~%:\/\?#[\]@!$&'()*+,;=-]+/g) ?? []
  // The controller model may suggest a plausible URL that the user never
  // supplied. Only accept a URL grounded in the current accumulated user
  // description. The direct model field is retained only when it matches a
  // grounded URL after edge-whitespace cleanup.
  const groundedDirect = direct && groundedUrls.some(item => cleanText(item, 2048) === direct)
    ? direct
    : ''
  const candidate = groundedDirect || groundedUrls[0] || ''
  if (!candidate) return { value: '', errorCode: 'I10_ENTRY_URL_REQUIRED' }
  if (!/^https?:\/\/[^\s]+$/i.test(candidate)) {
    return { value: '', errorCode: 'I10_ENTRY_URL_INVALID' }
  }
  // Flowise's custom-function sandbox does not always expose the WHATWG URL
  // constructor. Use it when available, while retaining a deterministic
  // protocol/whitespace validation fallback for the sandbox.
  if (typeof URL !== 'function') return { value: candidate, errorCode: '' }
  try {
    const parsed = new URL(candidate)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { value: '', errorCode: 'I10_ENTRY_URL_PROTOCOL_INVALID' }
    }
    return { value: parsed.href, errorCode: '' }
  } catch {
    return { value: '', errorCode: 'I10_ENTRY_URL_INVALID' }
  }
}

function inferActionType(rawType, instruction) {
  const aliases = {
    NAVIGATE: 'NAVIGATE', OPEN: 'NAVIGATE',
    CLICK: 'CLICK', INPUT: 'INPUT', FILL: 'INPUT',
    SELECT: 'SELECT', UPLOAD: 'UPLOAD', WAIT: 'WAIT',
    ASSERT: 'ASSERT', VERIFY: 'VERIFY'
  }
  const normalized = cleanText(rawType, 32).toUpperCase()
  if (aliases[normalized]) return aliases[normalized]
  if (/打开|访问|进入.*页面|navigate|open/i.test(instruction)) return 'NAVIGATE'
  if (/输入|填写|键入|input|fill/i.test(instruction)) return 'INPUT'
  if (/等待|wait/i.test(instruction)) return 'WAIT'
  if (/验证|核对|确认.*显示|verify|assert/i.test(instruction)) return 'VERIFY'
  if (/选择|select/i.test(instruction)) return 'SELECT'
  if (/上传|upload/i.test(instruction)) return 'UPLOAD'
  return 'CLICK'
}

function normalizeVerificationRequirement(value, ordinal) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const allowed = new Set(['SMS_OTP', 'TOTP', 'CAPTCHA', 'QR_CODE', 'UKEY', 'MOBILE_CERTIFICATE', 'BIOMETRIC', 'MANUAL_APPROVAL'])
  const verificationType = allowed.has(value.verificationType) ? value.verificationType : 'MANUAL_APPROVAL'
  const timing = ['BEFORE_EXECUTION', 'DURING_ACTION', 'AFTER_ACTION'].includes(value.timing) ? value.timing : 'DURING_ACTION'
  return {
    verificationType,
    timing,
    actionOrdinal: Number.isInteger(value.actionOrdinal) ? value.actionOrdinal : ordinal,
    userPreparation: cleanText(value.userPreparation || '请在执行前准备对应的人工验证方式。', 1000),
    unattendedPolicy: 'HUMAN_IN_LOOP_REQUIRED',
    secretHandling: 'USER_ENTERS_DIRECTLY_NEVER_PERSIST'
  }
}

function normalizeActionSteps(multimodal, actions, expectedOutcomes, credentialRef) {
  const source = Array.isArray(multimodal.actionStepsV2) ? multimodal.actionStepsV2 : []
  return actions.map((fallbackAction, index) => {
    const raw = source[index] && typeof source[index] === 'object' ? source[index] : {}
    const instruction = cleanText(raw.instruction || raw.action || fallbackAction, 1000)
    const ordinal = index + 1
    const actionType = inferActionType(raw.actionType, instruction)
    const credentialAction = actionType === 'INPUT' && /账号|用户名|密码|手机号|凭据|credential/i.test(`${instruction} ${raw.elementDescription || ''}`)
    // Non-secret form values must be explicitly supplied by the user (or an
    // already-confirmed attachment).  Do not let a high-level instruction
    // such as "创建一笔演示转账" silently turn into a browser action with a
    // guessed amount or note.  Preserve a value when it is plainly embedded
    // in the user's action text so the later Harness plan has an auditable,
    // deterministic fixture rather than re-parsing controller prose.
    const inlineInputValue = !credentialAction && !cleanText(raw.inputValue, 2000)
      ? extractExplicitBusinessInput(instruction)
      : ''
    const inputValueSource = credentialAction
      ? 'CREDENTIAL_REF'
      : ['USER_TEXT', 'IMAGE_EVIDENCE', 'CASE_FILE', 'VIDEO_EVIDENCE', 'CREDENTIAL_REF', 'RUNTIME_USER_INPUT'].includes(raw.inputValueSource)
        ? raw.inputValueSource
        : inlineInputValue ? 'USER_TEXT'
        : actionType === 'INPUT' ? 'RUNTIME_USER_INPUT' : undefined
    const provenanceRefs = credentialAction
      ? [credentialRef]
      : Array.isArray(raw.provenanceRefs)
        ? raw.provenanceRefs.map(item => cleanText(item, 160)).filter(item => SAFE_REF.test(item)).slice(0, 20)
        : []
    const verificationRequirement = normalizeVerificationRequirement(raw.verificationRequirement, ordinal)
    return {
      ordinal,
      actionType,
      instruction,
      ...(cleanText(raw.targetDescription || raw.elementDescription, 500)
        ? { targetDescription: cleanText(raw.targetDescription || raw.elementDescription, 500) }
        : {}),
      ...(!credentialAction && cleanText(raw.inputValue, 2000) ? { inputValue: cleanText(raw.inputValue, 2000) } : inlineInputValue ? { inputValue: inlineInputValue } : {}),
      ...(inputValueSource ? { inputValueSource } : {}),
      provenanceRefs,
      confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.9,
      expected: cleanText(raw.expected || expectedOutcomes[index], 1000),
      ...(verificationRequirement ? { verificationRequirement } : {})
    }
  })
}

function extractExplicitBusinessInput(instruction) {
  const text = cleanText(instruction, 1000)
  // Amount is intentionally numeric-only. Currency words are presentation
  // context, not part of the value sent to the deterministic executor.
  const amount = text.match(/(?:金额|amount)\s*(?:为|是|:|：)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)
  if (amount) return amount[1]
  // A note/reference has to be quoted, or explicitly introduced by
  // "备注为/用途为".  This avoids treating the entire action sentence as a
  // value and therefore avoids accidental submission of prose.
  const quoted = text.match(/(?:备注|用途|附言|reference|purpose)\s*(?:为|是|:|：)?\s*[“\"]([^”\"]{1,240})[”\"]/i)
  if (quoted) return cleanText(quoted[1], 240)
  const plain = text.match(/(?:备注|用途|附言|reference|purpose)\s*(?:为|是|:|：)\s*([^，,。；;]{1,240})/i)
  return plain ? cleanText(plain[1], 240) : ''
}

function explicitTransferFixtures(sourceText) {
  const text = cleanText(sourceText, 8000)
  const amount = text.match(/(?:金额|amount)\s*(?:为|是|:|：)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)
  const quoted = text.match(/(?:备注|用途|附言|reference|purpose)\s*(?:为|是|:|：)?\s*[“"]([^”"]{1,240})[”"]/i)
  const plain = text.match(/(?:备注|用途|附言|reference|purpose)\s*(?:为|是|:|：)\s*([^，,。；;]{1,240})/i)
  return {
    amount: amount ? amount[1] : '',
    purpose: quoted ? cleanText(quoted[1], 240) : (plain ? cleanText(plain[1], 240) : '')
  }
}

// I10 formal transfer cases must carry their non-secret business inputs as a
// frozen typed object.  Do not derive that object from prose: two equivalent
// sentences must never produce different amount/payee/purpose fixtures on a
// later retry.  The old prose helpers remain below solely for historical I9
// replay normalization and are not used to satisfy the I10 formal gate.
function normalizeTypedBusinessInputs(value) {
  const source = parseObject(value)
  const values = parseObject(source.values)
  const payeeRef = cleanText(values.payeeRef, 160)
  const amount = cleanText(values.amount, 32)
  const currency = cleanText(values.currency, 8).toUpperCase()
  const purpose = cleanText(values.purpose, 200)
  const sourceType = ['USER_CONFIRMED', 'IMPORT_CONFIRMED', 'OCR_CONFIRMED'].includes(source.source)
    ? source.source
    : ''
  if (!payeeRef && !amount && !currency && !purpose && !sourceType) return undefined
  return {
    schemaVersion: 'hengzhun-i10-typed-business-inputs-v1',
    values: { payeeRef, amount, currency, purpose },
    source: sourceType || 'USER_CONFIRMED'
  }
}

function isTransferCase(actions, sourceText = '') {
  const allText = [...actions.map(action => cleanText(action, 1000)), cleanText(sourceText, 8000)]
    .filter(Boolean)
    .join('\n')
  return /(?:转账|汇款|付款|支付|transfer|payment)/i.test(allText) &&
    /(?:创建|发起|提交|确认|转账|汇款|付款|支付|transfer|payment)/i.test(allText)
}

function expandExplicitTransferActions(actions, expectedOutcomes, sourceText) {
  const source = explicitTransferFixtures(sourceText)
  const allText = actions.map(action => cleanText(action, 1000)).join('\n')
  if (!/(?:转账|汇款|付款|支付|transfer|payment)/i.test(allText) || !source.amount || !source.purpose) return
  const hasAmount = actions.some(action => new RegExp(`(?:金额|amount)\\s*(?:为|是|:|：)?\\s*${source.amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(String(action)))
  const hasPurpose = actions.some(action => /(?:备注|用途|附言|reference|purpose)\s*(?:为|是|:|：)\s*\S+/i.test(String(action)))
  if (hasAmount && hasPurpose) return
  const index = actions.findIndex(action => /(?:填写|输入|提交|确认|转账|汇款|付款|支付)/i.test(String(action)))
  const replacements = [
    '选择已登记收款人',
    `填写转账金额为 ${source.amount}`,
    `填写转账用途为 ${source.purpose}`,
    '提交转账并完成首次确认'
  ]
  const outcomes = ['已选择收款人', '金额已填写', '用途已填写', '进入验证或单号查询流程']
  if (index >= 0) {
    actions.splice(index, 1, ...replacements)
    expectedOutcomes.splice(index, 1, ...outcomes)
  } else {
    actions.push(...replacements)
    expectedOutcomes.push(...outcomes)
  }
}

function appendHighRiskBusinessGaps(actions, actionStepsV2, missingFields, sourceText = '', businessInputs) {
  const allText = [...actions.map(action => cleanText(action, 1000)), cleanText(sourceText, 8000)].filter(Boolean).join('\n')
  // A payment/transfer submission needs concrete, non-secret business data.
  // This is deliberately a semantic gate, not a Fuxing-specific UI rule:
  // any case that asks the executor to create/submit a transfer must either
  // state its amount and purpose/reference, or stop for clarification.
  if (!isTransferCase(actions, sourceText)) return
  const values = businessInputs?.values || {}
  // The following four values are a single execution contract.  Require the
  // whole object so a partial retry cannot silently reuse prose from a prior
  // version of the draft.
  if (!/^payee_[A-Za-z0-9._:-]{4,120}$/.test(values.payeeRef || '')) missingFields.push('businessInput.payeeRef')
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/.test(values.amount || '') || Number(values.amount) <= 0) missingFields.push('businessInput.amount')
  if (!/^[A-Z]{3}$/.test(values.currency || '')) missingFields.push('businessInput.currency')
  if (!cleanText(values.purpose, 200)) missingFields.push('businessInput.purpose')
  // "创建一笔演示转账" is a business goal, not an executable page action.
  // Require at least one explicit navigation/click/entry instruction before
  // authoring so Midscene never tries to locate the whole business phrase.
  // A bare "完成首次确认" only names a business milestone.  It does not tell
  // the authoring worker which form fields or page control lead to that
  // milestone, so it must not be treated as an executable interaction.
  const hasConcreteInteraction = actions.some(action => /(?:点击|打开|进入|导航|填写|输入|选择|提交)/i.test(String(action)))
  if (!hasConcreteInteraction) missingFields.push('businessActionDetails')
}

function normalizeVerificationRequirements(multimodal) {
  const source = Array.isArray(multimodal.verificationRequirements) ? multimodal.verificationRequirements : []
  return source.map((item, index) => normalizeVerificationRequirement(item, index + 1)).filter(Boolean).slice(0, 20)
}

function normalizeCaseFacts(multimodal) {
  const source = Array.isArray(multimodal.caseFacts) ? multimodal.caseFacts : []
  // image_ingest_get carries interaction-only fields such as userDecision.
  // CaseDraft is strict: only project fields owned by caseFactCandidateSchema.
  return source
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      factId: cleanText(item.factId, 160),
      field: cleanText(item.field, 64),
      value: cleanText(item.value, 2000),
      provenanceRefs: Array.isArray(item.provenanceRefs)
        ? item.provenanceRefs.map(ref => cleanText(ref, 160)).filter(ref => SAFE_REF.test(ref)).slice(0, 20)
        : [],
      confidence: Number.isFinite(Number(item.confidence))
        ? Math.max(0, Math.min(1, Number(item.confidence)))
        : 0,
      selected: item.selected === true,
      requiresUserConfirmation: item.requiresUserConfirmation === true
    }))
    .filter(item =>
      SAFE_REF.test(item.factId) &&
      ['TITLE', 'OBJECTIVE', 'TARGET_SYSTEM', 'ENTRY_URL', 'PRECONDITION', 'ACTION', 'INPUT_VALUE', 'EXPECTED_RESULT', 'VERIFICATION_REQUIREMENT', 'OTHER'].includes(item.field) &&
      Boolean(item.value) &&
      item.provenanceRefs.length > 0
    )
    .slice(0, 200)
}

function normalizeMissingFields(rawFields, credentialReady, entryUrl, actions, expectedOutcomes, targetSystem, assertions, multimodalValid, imageReady) {
  const credentialOrLocator = /账号|用户名|密码|credential|元素定位|定位器|selector|locator/i
  const entryUrlGap = /(?:入口|门户|网站|系统).*(?:URL|网址|地址)|entryUrl|入口地址|门户网站URL/i
  const targetSystemGap = /目标系统|系统名称|targetSystem/i
  const authoringOrRuntimeFact = /(?:个人资料|目标)页面.*(?:访问方式|访问地址)|预期.*(?:姓名|头像).*值|(?:姓名|头像).*具体值/i
  const supportingImageGap = /补充图片|支持性图片|图片附件|图片.*(?:ingestId|引用)|supportingImage|imageIngestId/i
  const derivableCaseText = /^(?:caseTitle|title|objective|summary|案例名称|测试目标|案例摘要)$/i
  const fields = cleanTextArray(rawFields, 30, 160).filter(field =>
    !(credentialReady && credentialOrLocator.test(field)) &&
    !(entryUrl && entryUrlGap.test(field)) &&
    !(targetSystem && targetSystemGap.test(field)) &&
    !authoringOrRuntimeFact.test(field) &&
    // Attachment identifiers are platform-owned. A user must never be asked
    // to type an ingestId or internal image reference; the image route owns
    // submission, status polling and confirmation.
    !supportingImageGap.test(field) &&
    // Title/objective/summary are safely derived from the user's preserved
    // natural-language case description. They are presentation metadata, not
    // a reason to block an otherwise executable case.
    !derivableCaseText.test(field)
  )
  if (!credentialReady) fields.push('credentialRef')
  if (!entryUrl) fields.push('entryUrl')
  if (!targetSystem) fields.push('targetSystem')
  if (!actions.length) fields.push('actions')
  if (!expectedOutcomes.length || expectedOutcomes.length !== actions.length) fields.push('expectedOutcomes')
  if (!assertions.length) fields.push('assertions')
  if (!multimodalValid) fields.push('multimodalContext')
  return [...new Set(fields)]
}

function ensureExplicitValidationStep(actions, expectedOutcomes) {
  if (!Array.isArray(actions) || !Array.isArray(expectedOutcomes) ||
      actions.length === 0 || actions.length !== expectedOutcomes.length) return
  const finalOutcome = cleanText(expectedOutcomes.at(-1), 500)
  // A controller often writes a page-observation requirement only as the
  // final expected result (for example “消息列表、未读标识和摘要正常显示”).
  // Make that observation an explicit deterministic Playwright assertion so
  // the text-only and OCR branches have the same executable step boundary.
  // Do not add a redundant step when the controller already expressed one.
  const observation = /(?:一致|显示|存在|状态|摘要|未读|余额|金额|单号|下载)/i.test(finalOutcome)
  const alreadyExplicit = actions.some(action => /(?:验证|确认|检查|核对|比较|断言|assert|verify)/i.test(String(action)))
  if (observation && !alreadyExplicit) {
    actions.push(`验证：${finalOutcome}`)
    expectedOutcomes.push(finalOutcome)
  }
}

function normalizeFlowiseDraft(rawDraft, credentialRefValue, naturalLanguage, confirmedImageIngestIdValue = '', previousDraftValue = {}) {
  const raw = mergeFlowiseDraft(previousDraftValue, rawDraft)
  const credentialRef = cleanText(credentialRefValue, 160)
  const credentialReady = CREDENTIAL_REF.test(credentialRef)
  const url = normalizeEntryUrl(raw.entryUrl, naturalLanguage)
  const actions = cleanTextArray(raw.actions)
  const expectedOutcomes = cleanTextArray(raw.expectedOutcomes)
  // Preserve explicitly supplied, non-secret transfer fields even when the
  // controller compressed them into one natural-language action.
  // Legacy action expansion remains presentation-only.  It must not be used
  // as a source of formal I10 transfer fixture values.
  expandExplicitTransferActions(actions, expectedOutcomes, naturalLanguage)
  ensureExplicitValidationStep(actions, expectedOutcomes)
  // A compact controller response may omit a separately worded assertion.
  // Its final expected outcome is already a deterministic, user-visible
  // acceptance condition, so reuse it rather than sending a complete case
  // back to the user merely to restate the same fact.
  const assertions = cleanTextArray(raw.assertions)
  if (!assertions.length && expectedOutcomes.length) assertions.push(expectedOutcomes.at(-1))
  const targetSystem = cleanText(raw.targetSystem, 160)
  const multimodalRaw = raw.multimodalContext ?? raw.multimodalContextJson
  const multimodal = parseObject(multimodalRaw)
  const confirmedImageIngestId = cleanText(confirmedImageIngestIdValue, 160)
  if (confirmedImageIngestId && confirmedImageIngestId !== 'NONE') {
    multimodal.supportingImageIngestId = confirmedImageIngestId
  }
  const multimodalValid =
    (Boolean(multimodalRaw) && Object.keys(multimodal).length > 0) ||
    Boolean(confirmedImageIngestId && confirmedImageIngestId !== 'NONE') ||
    (actions.length > 0 && expectedOutcomes.length === actions.length)
  const imageReady = Boolean(confirmedImageIngestId && confirmedImageIngestId !== 'NONE')
  const missingFields = normalizeMissingFields(
    raw.missingFields, credentialReady, url.value, actions, expectedOutcomes, targetSystem, assertions, multimodalValid, imageReady
  )
  const actionStepsV2 = normalizeActionSteps(multimodal, actions, expectedOutcomes, credentialRef)
  if (actionStepsV2.some(step => !step.instruction || !step.expected)) missingFields.push('actionStepsV2')
  const businessInputs = normalizeTypedBusinessInputs(raw.businessInputs)
  appendHighRiskBusinessGaps(actions, actionStepsV2, missingFields, naturalLanguage, businessInputs)

  const draft = {
    schemaVersion: 'hengzhun-i10-case-draft-v1',
    title: cleanText(raw.caseTitle || raw.title || '未命名回归案例', 160),
    objective: cleanText(raw.objective || naturalLanguage, 2000),
    summary: cleanText(raw.summary || naturalLanguage, 1000),
    targetSystem,
    entryUrl: url.value,
    preconditions: cleanTextArray(raw.preconditions),
    steps: actions.map((action, index) => ({ action, expected: expectedOutcomes[index] || '' })),
    assertions,
    credentialRef,
    ...(cleanText(multimodal.supportingImageIngestId, 160) && cleanText(multimodal.supportingImageIngestId, 160) !== 'NONE'
      ? { supportingImageIngestId: cleanText(multimodal.supportingImageIngestId, 160) }
      : {}),
    caseFacts: normalizeCaseFacts(multimodal),
    actionStepsV2,
    verificationRequirements: normalizeVerificationRequirements(multimodal),
    ...(businessInputs ? { businessInputs } : {}),
    confidence: 0.9,
    missingFields: [...new Set(missingFields)],
    confirmationStatus: missingFields.length ? 'WAITING_USER' : 'CONFIRMED'
  }
  const status = draft.missingFields.length ? 'NEEDS_CLARIFICATION' : 'READY'
  const clarificationQuestion = status === 'READY'
    ? ''
    : `案例尚不能提交，请补充或修正：${draft.missingFields.join('、')}。`
  const acceptanceSummary = cleanText(raw.acceptanceSummary || draft.summary, 1000)
  const display = {
    caseTitle: draft.title,
    objective: draft.objective,
    targetSystem: draft.targetSystem,
    entryUrl: draft.entryUrl,
    actions: draft.steps.map(step => step.action),
    expectedOutcomes: draft.steps.map(step => step.expected),
    assertions: draft.assertions,
    credentialStatus: credentialReady ? 'READY_BY_REFERENCE' : 'MISSING',
    ...(businessInputs ? { businessInputs } : {}),
    verificationRequirements: draft.verificationRequirements
  }
  const semanticVerdict = raw.semanticVerdict === 'NEEDS_CLARIFICATION' ||
    raw.clarificationRequired === true ||
    (Array.isArray(raw.unresolvedRequirements) && raw.unresolvedRequirements.length > 0)
    ? 'NEEDS_CLARIFICATION'
    : raw.semanticVerdict === 'COMPLETE' || raw.clarificationRequired === false
      ? 'COMPLETE'
      : status === 'READY' ? 'COMPLETE' : 'NEEDS_CLARIFICATION'
  const unresolvedRequirements = Array.isArray(raw.unresolvedRequirements)
    ? raw.unresolvedRequirements
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => ({
        requirementId: cleanText(item.requirementId, 80),
        question: cleanText(item.question, 1000)
      }))
      .filter(item => item.requirementId && item.question)
      .slice(0, 20)
    : []
  const semanticAssessment = {
    schemaVersion: 'hengzhun-i10-semantic-assessment-v1',
    verdict: semanticVerdict,
    satisfiedRequirementIds: cleanTextArray(raw.satisfiedRequirementIds, 20, 80),
    unresolvedRequirements,
    confidence: Number.isFinite(Number(raw.semanticConfidence))
      ? Math.max(0, Math.min(1, Number(raw.semanticConfidence)))
      : semanticVerdict === 'COMPLETE' ? 0.9 : 0.5
  }
  return {
    status,
    errorCode: url.errorCode,
    clarificationQuestion,
    acceptanceSummary,
    // Downstream Flowise Tool nodes can only bind scalar state values.  Keep
    // these derived values alongside the canonical serialized CaseDraft so
    // a text-JSON LLM result cannot leave target-profile preparation reading
    // stale controllerDraft_* fields from an earlier execution.
    targetSystem: draft.targetSystem,
    entryUrl: draft.entryUrl,
    draftJson: JSON.stringify(draft),
    displayJson: JSON.stringify(display),
    semanticAssessmentJson: JSON.stringify(semanticAssessment)
  }
}

function flowiseFunctionSource(options = {}) {
  const rawDraftExpression = options.rawDraftExpression === 'rawDraft'
    ? 'rawDraft'
    : '$rawDraft'
  const beforeNormalizeSource = typeof options.beforeNormalizeSource === 'string'
    ? options.beforeNormalizeSource.trim()
    : ''
  const declarations = [
    cleanText, cleanTextArray, parseObject, normalizeEntryUrl, inferActionType,
    normalizeVerificationRequirement, normalizeActionSteps, normalizeVerificationRequirements,
    normalizeCaseFacts, normalizeMissingFields, ensureExplicitValidationStep,
    // Keep every helper referenced by the generated functions inside the
    // Flowise NodeVM source.  NodeVM does not share this CommonJS module
    // scope, so omitting either helper turns a valid draft into a runtime
    // ReferenceError only after the controller has completed its work.
    extractExplicitBusinessInput, explicitTransferFixtures, normalizeTypedBusinessInputs, isTransferCase, expandExplicitTransferActions, appendHighRiskBusinessGaps,
    mergeFlowiseDraft, normalizeFlowiseDraft
  ].map(fn => fn.toString()).join('\n')
  return `const INVISIBLE_EDGE = ${INVISIBLE_EDGE.toString()};\nconst CREDENTIAL_REF = ${CREDENTIAL_REF.toString()};\nconst SAFE_REF = ${SAFE_REF.toString()};\n${declarations}\n${beforeNormalizeSource ? `${beforeNormalizeSource}\n` : ''}const imageIngestIdValue = typeof $imageIngestId === 'undefined' ? '' : $imageIngestId;\nconst priorDraftValue = typeof $priorDraft === 'undefined' ? {} : $priorDraft;\nreturn normalizeFlowiseDraft(${rawDraftExpression}, $credentialRef, $naturalLanguage, imageIngestIdValue, priorDraftValue);`
}

function structuredFlowiseFunctionSource(draftFieldNames) {
  if (!Array.isArray(draftFieldNames) || draftFieldNames.length === 0) {
    throw new Error('I10_STRUCTURED_NORMALIZER_FIELDS_REQUIRED')
  }
  const uniqueFields = [...new Set(draftFieldNames)]
  if (
    uniqueFields.length !== draftFieldNames.length ||
    uniqueFields.some(field => typeof field !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field))
  ) {
    throw new Error('I10_STRUCTURED_NORMALIZER_FIELDS_INVALID')
  }
  const assignment = uniqueFields
    .map(field => `${JSON.stringify(field)}:$${field}`)
    .join(',')
  const beforeNormalizeSource = `const controllerRaw=parseObject(typeof $controllerDraftRaw === 'undefined' ? {} : $controllerDraftRaw);
const rawDraft={${assignment},...controllerRaw};
let imageFacts=typeof $imageFactsJson === 'undefined' ? [] : $imageFactsJson;
try { if (typeof imageFacts === 'string') imageFacts=JSON.parse(imageFacts || '[]'); } catch { imageFacts=[]; }
if (Array.isArray(imageFacts) && imageFacts.length > 0) {
  let multimodal=rawDraft.multimodalContext;
  try { if (typeof multimodal === 'string') multimodal=JSON.parse(multimodal || '{}'); } catch { multimodal={}; }
  if (!multimodal || typeof multimodal !== 'object' || Array.isArray(multimodal)) multimodal={};
  multimodal.caseFacts=imageFacts.filter(item => item && item.selected === true && item.userDecision === 'CONFIRM');
  rawDraft.multimodalContext=multimodal;
}`
  const source = flowiseFunctionSource({
    rawDraftExpression: 'rawDraft',
    beforeNormalizeSource
  })
  if (!source.includes('const controllerRaw=parseObject') || !source.includes('const rawDraft={') || source.includes('normalizeFlowiseDraft($rawDraft')) {
    throw new Error('I10_STRUCTURED_NORMALIZER_GENERATION_FAILED')
  }
  return source
}

module.exports = {
  normalizeFlowiseDraft,
  mergeFlowiseDraft,
  flowiseFunctionSource,
  structuredFlowiseFunctionSource
}
