'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..', '..')
const flowiseAppPath = path.resolve(process.env.FLOWISE_APP_PATH || path.join(productRoot, '.data', 'flowise', 'app'))
const runtimeRequire = require('node:module').createRequire(path.join(flowiseAppPath, 'package.json'))
const { McpServer } = runtimeRequire('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = runtimeRequire('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { createMcpExpressApp } = runtimeRequire('@modelcontextprotocol/sdk/server/express.js')
const z = runtimeRequire('zod/v4')

const harnessUrl = new URL(process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788')
const namespace = process.env.HENGZHUN_NAMESPACE || 'hengzhun-local'
const harnessToken = process.env.HENGZHUN_SERVICE_TOKEN
const mcpToken = process.env.HENGZHUN_MCP_TOKEN
const host = '127.0.0.1'
const port = Number(process.env.HENGZHUN_MCP_PORT || 18789)
const harnessTimeoutMs = process.env.NODE_ENV === 'test' && process.env.HENGZHUN_MCP_HARNESS_TIMEOUT_MS
  ? Number(process.env.HENGZHUN_MCP_HARNESS_TIMEOUT_MS)
  : 30_000
const safeRef = z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._:-]+$/)
const controlledAttachmentRef = z.string().trim().min(8).max(1024).regex(/^[A-Za-z0-9._:-]+$/)
const jsonObjectArgument = z.union([
  z.string().trim().min(2).max(24_000),
  z.record(z.string(), z.unknown())
])
const i10NaturalDraftArgument = z.object({
  schemaVersion: z.literal('hengzhun-i10-case-draft-v1'),
  title: z.string(), objective: z.string(), summary: z.string(),
  targetSystem: z.string(), entryUrl: z.string(),
  preconditions: z.array(z.string()),
  steps: z.array(z.object({ action: z.string(), expected: z.string() })),
  assertions: z.array(z.string()), credentialRef: z.string(),
  source: z.object({
    inputType: z.string(), sourceRef: z.string(), sourceHash: z.string(), provenanceSummary: z.string()
  }),
  confidence: z.number(), missingFields: z.array(z.string()), confirmationStatus: z.string(),
  authoringStrategy: z.string(), executionStrategy: z.string(), evidenceStrategy: z.string()
})
const singleJsonObjectArrayArgument = z.array(i10NaturalDraftArgument).length(1)

if (!harnessToken) throw new Error('HENGZHUN_SERVICE_TOKEN_MISSING')
if (!mcpToken || mcpToken.length < 24) throw new Error('HENGZHUN_MCP_TOKEN_MISSING_OR_WEAK')
if (harnessUrl.protocol !== 'http:' || harnessUrl.hostname !== '127.0.0.1') throw new Error('HENGZHUN_HARNESS_URL_MUST_BE_LOOPBACK_HTTP')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('HENGZHUN_MCP_PORT_INVALID')
if (!Number.isInteger(harnessTimeoutMs) || harnessTimeoutMs < 50 || harnessTimeoutMs > 30_000) throw new Error('HENGZHUN_MCP_HARNESS_TIMEOUT_INVALID')

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function digest(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

function idempotencyKey(toolName, sessionRef, payload) {
  return `flowise:${toolName}:${digest({ sessionRef, payload }).slice(0, 40)}`
}

function authorized(value) {
  const expected = Buffer.from(`Bearer ${mcpToken}`, 'utf8')
  const actual = Buffer.from(String(value || ''), 'utf8')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function textResult(value, isError = false, maxBytes = 8 * 1024) {
  const governedValue = isError && value && typeof value === 'object' && !Array.isArray(value)
    ? {
        ...value,
        category: typeof value.category === 'string' ? value.category : 'TOOL',
        status: Number.isInteger(value.status) && value.status >= 400 ? value.status : 400
      }
    : value
  const text = stableJson(governedValue)
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return { isError: true, content: [{ type: 'text', text: stableJson({ errorCode: 'MCP_OUTPUT_BUDGET_EXCEEDED' }) }] }
  }
  return { ...(isError ? { isError: true } : {}), content: [{ type: 'text', text }] }
}

function safeProtocolFailure(error) {
  const rawMessage = String(error?.message || 'MCP_PROTOCOL_INTERNAL_ERROR')
  return {
    event: 'mcp_protocol_failed',
    errorCode: typeof error?.code === 'string' ? error.code : 'MCP_PROTOCOL_INTERNAL_ERROR',
    errorName: typeof error?.name === 'string' ? error.name : 'Error',
    message: rawMessage
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
      .slice(0, 500)
  }
}

async function requestHarness(route, payload) {
  try {
    const response = await fetch(new URL(route, harnessUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${harnessToken}`,
        'content-type': 'application/json',
        'x-correlation-id': `mcp-${digest(payload).slice(0, 24)}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(harnessTimeoutMs)
    })
    const body = await response.json().catch(() => ({ errorCode: 'HARNESS_RESPONSE_INVALID' }))
    return { response, body }
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return {
      response: { ok: false, status: timedOut ? 504 : 502 },
      body: { errorCode: timedOut ? 'HARNESS_REQUEST_TIMEOUT' : 'HARNESS_TRANSPORT_FAILED', category: 'TOOL' }
    }
  }
}

async function callHarness(route, payload) {
  const { response, body } = await requestHarness(route, payload)
  if (!response.ok) {
    return textResult({
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : 'HARNESS_REQUEST_FAILED',
      category: typeof body.category === 'string' ? body.category : 'TOOL',
      status: response.status
    }, true)
  }
  return textResult(body)
}

function parseJsonArgument(value, errorCode) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
    return parsed
  } catch {
    const error = new Error(errorCode)
    error.code = errorCode
    throw error
  }
}

function normalizeControlledPortalRoute(value) {
  const raw = String(value || '').trim()
  if (raw === '/portal/login') return raw
  try {
    const parsed = new URL(raw)
    if (!parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/portal/login') return parsed.pathname
  } catch {}
  return raw
}

function normalizeI10NaturalDraft(draft, caseDescription, sessionRef, credentialRefOverride) {
  const steps = Array.isArray(draft.steps) ? draft.steps.map(step => ({
    action: String(step.action || '').trim(),
    expected: String(step.expected || step.expectedResult || step.expectedResults || '').trim()
  })).filter(step => step.action && step.expected) : []
  const entryUrl = String(draft.entryUrl || caseDescription.match(/https?:\/\/[^\s，。；]+/)?.[0] || '').trim()
  const targetSystem = String(draft.targetSystem || '').trim()
  const credentialRef = String(credentialRefOverride || (typeof draft.credentialRef === 'string' ? draft.credentialRef : '')).trim()
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
    ...(typeof draft.supportingImageIngestId === 'string' ? { supportingImageIngestId: draft.supportingImageIngestId } : {}),
    caseFacts: Array.isArray(draft.caseFacts) ? draft.caseFacts : [],
    actionStepsV2: Array.isArray(draft.actionStepsV2) ? draft.actionStepsV2 : [],
    verificationRequirements: Array.isArray(draft.verificationRequirements) ? draft.verificationRequirements : [],
    source: { inputType: 'NATURAL_LANGUAGE', sourceRef: sessionRef, sourceHash: digest(caseDescription), provenanceSummary: '由Flowise主控模型根据用户自然语言生成，并由MCP确定性规范化来源与固定策略字段。' },
    confidence: Number.isFinite(Number(draft.confidence)) ? Math.max(0, Math.min(1, Number(draft.confidence))) : 0.9,
    missingFields, confirmationStatus: missingFields.length ? 'WAITING_USER' : 'CONFIRMED',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY', executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY', evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  }
}

function createServer() {
  const server = new McpServer({ name: 'hengzhun-i10-regression', version: '8.0.0' })

  server.registerTool('credential_session_create', {
    description: '创建15分钟本机安全凭据录入会话；只返回credentialRef状态和本机表单地址，账号密码不会进入Flowise或模型上下文。',
    inputSchema: { label: z.string().trim().min(1).max(160), sessionRef: safeRef }
  }, async ({ label, sessionRef }) => callHarness('/v1/i10/credentials:sessions-create', {
    namespace, idempotencyKey: idempotencyKey('credential_session_create', sessionRef, { label }), label
  }))

  server.registerTool('credential_session_get', {
    description: '查询本机安全凭据会话是否已生成credentialRef，不返回账号密码。',
    inputSchema: { sessionId: safeRef }
  }, async ({ sessionId }) => callHarness('/v1/i10/credentials:sessions-get', { namespace, sessionId }))

  server.registerTool('ingest_submit', {
    description: '提交Flowise受控附件引用。案例文件同步解析，视频进入本机异步抽帧/OCR/视觉分析；禁止任意本机路径。',
    inputSchema: {
      inputType: z.enum(['CASE_FILE', 'VIDEO']), flowiseFileRef: controlledAttachmentRef,
      originalFilename: z.string().trim().min(1).max(260), credentialRef: safeRef.optional(),
      targetSystemHint: z.string().trim().min(1).max(160).optional(),
      entryUrlHint: z.string().url().max(2048).optional(), supportingImageIngestId: z.union([safeRef,z.literal('')]).optional(), sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => { if(!business.supportingImageIngestId||business.supportingImageIngestId==='NONE')delete business.supportingImageIngestId;return callHarness('/v1/i10/ingest:submit', {
    namespace, idempotencyKey: idempotencyKey('ingest_submit', sessionRef, business), ...business
  })})

  server.registerTool('ingest_get', {
    description: '查询案例文件或视频导入状态、信息缺口和待确认CaseDraft。',
    inputSchema: { ingestJobId: safeRef }
  }, async ({ ingestJobId }) => callHarness('/v1/i10/ingest:get', { namespace, ingestJobId }))

  server.registerTool('ingest_decision_submit', {
    description: '人工确认、修正或拒绝导入草案。仍有缺口时Harness拒绝确认，不允许自动生成正式脚本。',
    inputSchema: {
      ingestJobId: safeRef, expectedVersion: z.number().int().positive(),
      choice: z.enum(['CONFIRM', 'CORRECT', 'REJECT']),
      correctionsJson: jsonObjectArgument.optional(), reason: z.string().trim().min(1).max(1000),
      confirmationRef: safeRef, sessionRef: safeRef
    }
  }, async ({ ingestJobId, expectedVersion, choice, correctionsJson, reason, confirmationRef, sessionRef }) => {
    try {
      let corrections = []
      if (correctionsJson) {
        const parsed = typeof correctionsJson === 'string' ? JSON.parse(correctionsJson) : correctionsJson
        corrections = Array.isArray(parsed) ? parsed : parsed.corrections
        if (!Array.isArray(corrections)) throw new Error('corrections array required')
      }
      const business = { ingestJobId, expectedVersion, choice, corrections, reason, confirmationRef }
      return callHarness('/v1/i10/ingest:decide', {
        namespace, idempotencyKey: idempotencyKey('ingest_decision_submit', sessionRef, business), ...business
      })
    } catch { return textResult({ errorCode: 'I10_INGEST_CORRECTIONS_INVALID' }, true) }
  })

  server.registerTool('image_ingest_submit', {
    description: '为自然语言、案例文件或视频主输入提交0到20张受控补充图片；图片仅经本机中英文OCR和脱敏后供主控模型筛选案例事实。',
    inputSchema: {
      sourceRef: safeRef, primaryInputType: z.enum(['NATURAL_LANGUAGE','CASE_FILE','VIDEO']),
      images: z.array(z.object({ flowiseFileRef: controlledAttachmentRef, originalFilename: z.string().trim().min(1).max(260), purposeHint: z.string().trim().max(500).optional() })).min(1).max(20),
      primaryText: z.string().trim().max(8000).optional(), sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => callHarness('/v1/i10/images:submit', {
    namespace, idempotencyKey: idempotencyKey('image_ingest_submit',sessionRef,business), ...business
  }))

  server.registerTool('image_ingest_get', {
    description: '查询补充图片OCR、主控模型事实筛选和人工确认状态；不返回未脱敏图片或敏感值。',
    inputSchema: { imageIngestId: safeRef }
  }, async ({ imageIngestId }) => callHarness('/v1/i10/images:get',{namespace,imageIngestId}))

  server.registerTool('verification_get', {
    description: '查询Midscene发现的短信、验证码、扫码、UKey等人工验证挑战及用户准备要求。',
    inputSchema: { challengeId: safeRef }
  }, async ({ challengeId }) => callHarness('/v1/i10/verification:get',{namespace,challengeId}))

  server.registerTool('verification_decision_submit', {
    description: '用户确认已准备验证方式或已在浏览器/硬件上完成验证；严禁提交验证码、PIN、私钥或生物信息。',
    inputSchema: { challengeId:safeRef, expectedVersion:z.number().int().positive(), decision:z.enum(['USER_READY','USER_ACTION_COMPLETED','CANCEL']), confirmationRef:safeRef, note:z.string().trim().max(500).optional(), sessionRef:safeRef }
  }, async ({sessionRef,...business})=>callHarness('/v1/i10/verification:decide',{namespace,idempotencyKey:idempotencyKey('verification_decision_submit',sessionRef,business),...business}))

  server.registerTool('case_prepare', {
    description: '将自然语言案例的已澄清统一CaseDraft提交给衡准权威状态库；继续兼容历史I8草案。',
    inputSchema: {
      caseDescription: z.string().trim().min(1).max(2000),
      draftArray: singleJsonObjectArrayArgument.optional(),
      draftJson: jsonObjectArgument.optional(),
      acceptanceSummaryJson: jsonObjectArgument.optional(),
      caseTitle: z.string().trim().min(1).max(160).optional(),
      objective: z.string().trim().min(1).max(2000).optional(),
      summary: z.string().trim().min(1).max(1000).optional(),
      targetSystem: z.string().trim().min(1).max(160).optional(),
      entryUrl: z.string().url().max(2048).optional(),
      preconditions: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
      actions: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      expectedOutcomes: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      assertions: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      missingFields: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      multimodalContextJson: jsonObjectArgument.optional(),
      credentialRef: safeRef.optional(),
      sessionRef: safeRef
    }
  }, async ({
    caseDescription, draftArray, draftJson, acceptanceSummaryJson,
    caseTitle, objective, summary, targetSystem, entryUrl, preconditions,
    actions, expectedOutcomes, assertions, missingFields, multimodalContextJson, credentialRef, sessionRef
  }) => {
    try {
      const flatDraftSupplied = caseTitle !== undefined || actions !== undefined || expectedOutcomes !== undefined
      const suppliedDraftSources = Number(draftArray !== undefined) + Number(draftJson !== undefined) + Number(flatDraftSupplied)
      if (suppliedDraftSources !== 1) {
        const error = new Error('I10_DRAFT_SOURCE_AMBIGUOUS')
        error.code = 'I10_DRAFT_SOURCE_AMBIGUOUS'
        throw error
      }
      let draft
      if (flatDraftSupplied) {
        if (!caseTitle || !objective || !summary || !targetSystem || !entryUrl || !preconditions?.length || !actions?.length ||
          !expectedOutcomes?.length || actions.length !== expectedOutcomes.length || !assertions?.length) {
          const error = new Error('I10_DRAFT_FLAT_FIELDS_INVALID')
          error.code = 'I10_DRAFT_FLAT_FIELDS_INVALID'
          throw error
        }
        draft = {
          schemaVersion: 'hengzhun-i10-case-draft-v1', title: caseTitle, objective, summary, targetSystem, entryUrl,
          preconditions, steps: actions.map((action, index) => ({ action, expected: expectedOutcomes[index] })), assertions,
          credentialRef, missingFields: missingFields || [], confirmationStatus: missingFields?.length ? 'WAITING_USER' : 'CONFIRMED'
        }
        if(multimodalContextJson){const multimodal=parseJsonArgument(multimodalContextJson,'I10_MULTIMODAL_CONTEXT_INVALID');Object.assign(draft,{supportingImageIngestId:multimodal.supportingImageIngestId,caseFacts:Array.isArray(multimodal.caseFacts)?multimodal.caseFacts:[],actionStepsV2:Array.isArray(multimodal.actionStepsV2)?multimodal.actionStepsV2:[],verificationRequirements:Array.isArray(multimodal.verificationRequirements)?multimodal.verificationRequirements:[]})}
      } else {
        draft = draftArray ? draftArray[0] : parseJsonArgument(draftJson, 'I8_DRAFT_JSON_INVALID')
      }
      if (draft.schemaVersion === 'hengzhun-i10-case-draft-v1' || typeof draft.credentialRef === 'string') {
        const normalizedDraft = normalizeI10NaturalDraft(draft, caseDescription, sessionRef, credentialRef)
        return callHarness('/v1/i10/cases:prepare', {
          namespace,
          idempotencyKey: idempotencyKey('case_prepare', sessionRef, { caseDescription, draft: normalizedDraft }),
          actorRef: 'flowise-controller',
          caseDescription,
          draft: normalizedDraft
        })
      }
      const acceptanceSummary = parseJsonArgument(acceptanceSummaryJson, 'I8_ACCEPTANCE_JSON_INVALID')
      const payload = {
        namespace,
        idempotencyKey: idempotencyKey('case_prepare', sessionRef, { caseDescription, draft, acceptanceSummary }),
        actorRef: 'flowise-controller',
        caseDescription,
        draft,
        acceptanceSummary
      }
      return callHarness('/v1/i8/cases:prepare', payload)
    } catch (error) {
      return textResult({ errorCode: error.code || 'MCP_ARGUMENT_INVALID' }, true)
    }
  })

  server.registerTool('authoring_submit', {
    description: '在用户明确确认后提交 IntentPlan；阶段2只推进到等待阶段3执行计划编译。',
    inputSchema: {
      preparationId: safeRef,
      expectedVersion: z.number().int().positive(),
      choice: z.enum(['APPROVE', 'REJECT']),
      confirmationRef: safeRef,
      reason: z.string().trim().min(1).max(1000),
      intentPlanJson: jsonObjectArgument.optional(),
      caseId: safeRef.optional(),
      caseVersion: z.number().int().positive().optional(),
      route: z.string().trim().min(1).max(512).optional(),
      // Controller IDs are alignment placeholders only. Accept short labels here,
      // then replace every value with a Harness-owned deterministic identifier.
      intentStepIds: z.array(z.string().trim().min(1).max(160)).min(1).max(50).optional(),
      actions: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      expectedOutcomes: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      riskLevels: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH'])).min(1).max(50).optional(),
      assertions: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      sessionRef: safeRef
    }
  }, async ({ preparationId, expectedVersion, choice, confirmationRef, reason, intentPlanJson, caseId, caseVersion, route, intentStepIds, actions, expectedOutcomes, riskLevels, assertions, sessionRef }) => {
    try {
      let intentPlan
      if (choice === 'APPROVE') {
        if (intentPlanJson) {
          intentPlan = parseJsonArgument(intentPlanJson, 'I8_INTENT_JSON_INVALID')
        } else {
          const counts = [actions?.length, expectedOutcomes?.length, riskLevels?.length]
          if (!caseId || !caseVersion || !route || !assertions?.length || counts.some(count => !count) || new Set(counts).size !== 1 || (intentStepIds !== undefined && intentStepIds.length !== actions?.length)) {
            const error = new Error('I8_INTENT_FLAT_FIELDS_INVALID')
            error.code = 'I8_INTENT_FLAT_FIELDS_INVALID'
            throw error
          }
          intentPlan = {
            schemaVersion: 'i8-intent-plan-v1', caseId, caseVersion, route: normalizeControlledPortalRoute(route),
            steps: actions.map((_action, index) => ({
              intentStepId: `intent-${String(index + 1).padStart(3, '0')}`,
              action: actions[index], expected: expectedOutcomes[index], riskLevel: riskLevels[index]
            })),
            assertions
          }
        }
      }
      const businessPayload = { preparationId, expectedVersion, choice, confirmationRef, reason, intentPlan }
      return callHarness('/v1/i8/authoring:submit', {
        namespace,
        idempotencyKey: idempotencyKey('authoring_submit', sessionRef, businessPayload),
        preparationId,
        expectedVersion,
        confirmation: { choice, confirmationRef, reason },
        ...(intentPlan ? { intentPlan } : {})
      })
    } catch (error) {
      return textResult({ errorCode: error.code || 'MCP_ARGUMENT_INVALID' }, true)
    }
  })

  server.registerTool('authoring_get', {
    description: '读取作者化准备记录的最小脱敏状态和下一步。',
    inputSchema: { preparationId: safeRef }
  }, async ({ preparationId }) => callHarness('/v1/i8/authoring:get', { namespace, preparationId }))

  server.registerTool('candidate_get', {
    description: '从已确认 IntentPlan 确定性编译阶段3计划，或读取当前候选生成状态；可受控等待本地Worker完成六次稳定性签证，技术参数由 MCP 注入。',
    inputSchema: {
      preparationId: safeRef,
      sessionRef: safeRef,
      waitForCertificate: z.boolean().optional(),
      waitTimeoutSeconds: z.number().int().min(1).max(180).optional()
    }
  }, async ({ preparationId, sessionRef, waitForCertificate, waitTimeoutSeconds }) => {
    let current = await requestHarness('/v1/i8/candidates:get', { namespace, preparationId })
    if (!current.response.ok && current.response.status !== 404) {
      return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_STATUS_UNAVAILABLE', status: current.response.status }, true)
    }
    if (current.response.status === 404) {
      const authoring = await requestHarness('/v1/i8/authoring:get', { namespace, preparationId })
      if (!authoring.response.ok || !Number.isInteger(authoring.body.version)) {
        return textResult({ errorCode: authoring.body.errorCode || 'I8_PREPARATION_VERSION_UNAVAILABLE', status: authoring.response.status }, true)
      }
      const compiled = await requestHarness('/v1/i8/candidates:compile', {
        namespace,
        idempotencyKey: idempotencyKey('candidate_get', sessionRef, { preparationId, expectedPreparationVersion: authoring.body.version }),
        preparationId,
        expectedPreparationVersion: authoring.body.version,
        stabilityPolicyVersion: 'I10_2X2_V1'
      })
      if (!compiled.response.ok) {
        return textResult({ errorCode: compiled.body.errorCode || 'I8_CANDIDATE_COMPILE_FAILED', status: compiled.response.status }, true)
      }
      current = compiled
    }
    if (waitForCertificate !== true) return textResult(current.body)
    const deadline = Date.now() + (waitTimeoutSeconds ?? 120) * 1000
    const terminalActions = new Set(['HUMAN_DELIVERY_DECISION_REQUIRED', 'ACTIVATE_OR_REJECT_AVAILABLE', 'ON_DEMAND_RUN_AVAILABLE', 'CANDIDATE_REPAIR_REQUIRED', 'AUTHORING_REVIEW_REQUIRED', 'NONE'])
    while (!terminalActions.has(current.body?.nextAction) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750))
      current = await requestHarness('/v1/i8/candidates:get', { namespace, preparationId })
      if (!current.response.ok) {
        return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_STATUS_UNAVAILABLE', status: current.response.status }, true)
      }
    }
    if (!terminalActions.has(current.body?.nextAction)) {
      return textResult({ errorCode: 'I8_CANDIDATE_WAIT_TIMEOUT', nextAction: current.body?.nextAction || 'UNKNOWN' }, true)
    }
    return textResult(current.body, false, 16 * 1024)
  })

  server.registerTool('candidate_preview', {
    description: '仅预览已取得稳定性证书且Hash复核通过的候选脚本；按完整行分页，下载链接为短时一次性授权。',
    inputSchema: {
      preparationId: safeRef,
      cursor: z.string().regex(/^line:\d+$/).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      includeDownload: z.boolean().optional()
    }
  }, async ({ preparationId, cursor, limit, includeDownload }) => {
    const current = await requestHarness('/v1/i8/candidates:get', { namespace, preparationId })
    if (!current.response.ok || !current.body.candidate?.candidateId) {
      return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_UNAVAILABLE', status: current.response.status }, true)
    }
    const preview = await requestHarness('/v1/i8/candidates:preview', {
      namespace, candidateId: current.body.candidate.candidateId, ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}), includeDownload: includeDownload === true
    })
    if (!preview.response.ok) return textResult({ errorCode: preview.body.errorCode || 'I8_PREVIEW_FAILED', status: preview.response.status }, true)
    if (preview.body.download?.href) preview.body.download.href = new URL(preview.body.download.href, harnessUrl).toString()
    return textResult(preview.body, false, 16 * 1024)
  })

  server.registerTool('candidate_decide', {
    description: '对已持证候选执行SAVE_ONLY、ACTIVATE或REJECT；ACTIVATE只激活精确版本且不自动运行。',
    inputSchema: {
      preparationId: safeRef,
      choice: z.enum(['SAVE_ONLY', 'ACTIVATE', 'REJECT']),
      confirmationRef: safeRef,
      reason: z.string().trim().min(1).max(1000),
      sessionRef: safeRef
    }
  }, async ({ preparationId, choice, confirmationRef, reason, sessionRef }) => {
    const current = await requestHarness('/v1/i8/candidates:get', { namespace, preparationId })
    const candidate = current.body.candidate
    if (!current.response.ok || !candidate?.candidateId || !Number.isInteger(candidate.version)) {
      return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_VERSION_UNAVAILABLE', status: current.response.status }, true)
    }
    const business = { candidateId: candidate.candidateId, expectedCandidateVersion: candidate.version, choice, confirmationRef, reason }
    return callHarness('/v1/i8/candidates:decide', {
      namespace, idempotencyKey: idempotencyKey('candidate_decide', sessionRef, business), ...business
    })
  })

  server.registerTool('run_submit', {
    description: '仅对已明确激活的精确脚本版本提交一次按需纯Playwright回归。',
    inputSchema: { preparationId: safeRef, sessionRef: safeRef }
  }, async ({ preparationId, sessionRef }) => callHarness('/v1/i8/runs:submit', {
    namespace,
    idempotencyKey: idempotencyKey('run_submit', sessionRef, { preparationId }),
    preparationId,
    credentialAlias: 'i3-customer'
  }))

  server.registerTool('task_get', {
    description: '读取按需回归任务的最小脱敏状态与结果摘要；可受控等待本地纯Playwright Worker进入终态。',
    inputSchema: {
      taskId: safeRef,
      waitForTerminal: z.boolean().optional(),
      waitTimeoutSeconds: z.number().int().min(1).max(180).optional()
    }
  }, async ({ taskId, waitForTerminal, waitTimeoutSeconds }) => {
    let current = await requestHarness('/v1/i8/tasks:get', { namespace, taskId })
    if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_TASK_STATUS_UNAVAILABLE', status: current.response.status }, true)
    if (waitForTerminal !== true) return textResult(current.body)
    const deadline = Date.now() + (waitTimeoutSeconds ?? 120) * 1000
    const terminal = new Set(['SUCCEEDED', 'FAILED', 'BLOCKED', 'WAITING_USER', 'CANCELLED'])
    while (!terminal.has(current.body?.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750))
      current = await requestHarness('/v1/i8/tasks:get', { namespace, taskId })
      if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_TASK_STATUS_UNAVAILABLE', status: current.response.status }, true)
    }
    if (!terminal.has(current.body?.status)) return textResult({ errorCode: 'I8_TASK_WAIT_TIMEOUT', status: current.body?.status || 'UNKNOWN' }, true)
    return textResult(current.body)
  })

  server.registerTool('schedule_create', {
    description: '在用户确认规范化时间后，为已激活候选创建精确绑定脚本版本的周期或一次性回归。用户不提供技术版本和凭据。',
    inputSchema: {
      preparationId: safeRef,
      scheduleType: z.enum(['RECURRING', 'ONE_TIME']),
      cronExpression: z.string().trim().min(9).max(128).optional(),
      runAt: z.string().datetime({ offset: true }).optional(),
      timezone: z.string().trim().min(1).max(80).default('Asia/Shanghai'),
      misfirePolicy: z.enum(['SKIP', 'RUN_ONCE']).default('RUN_ONCE'),
      misfireGraceSeconds: z.number().int().min(0).max(86400).default(300),
      maxRetries: z.number().int().min(0).max(5).default(1),
      confirmationRef: safeRef,
      sessionRef: safeRef
    }
  }, async ({ preparationId, scheduleType, cronExpression, runAt, timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef, sessionRef }) => {
    const business = { preparationId, scheduleType, cronExpression, runAt, timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef }
    return callHarness('/v1/i8/schedules:create', {
      namespace, idempotencyKey: idempotencyKey('schedule_create', sessionRef, business),
      preparationId, scheduleType, ...(cronExpression ? { cronExpression } : {}), ...(runAt ? { runAt } : {}),
      timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef,
      credentialAlias: 'i3-customer'
    })
  })

  server.registerTool('schedule_get', {
    description: '读取调度状态及其精确绑定的案例、计划和脚本版本；仅在用户明确确认时可停用指定调度。',
    inputSchema: {
      scheduleId: safeRef,
      action: z.enum(['READ', 'DISABLE']).default('READ'),
      reason: z.string().trim().min(1).max(1000).optional(),
      sessionRef: safeRef.optional()
    }
  }, async ({ scheduleId, action, reason, sessionRef }) => {
    const current = await requestHarness('/v1/i8/schedules:get', { namespace, scheduleId })
    if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_SCHEDULE_STATUS_UNAVAILABLE', status: current.response.status }, true)
    if (action === 'READ') return textResult(current.body)
    if (!reason || !sessionRef) return textResult({ errorCode: 'I8_SCHEDULE_DISABLE_CONFIRMATION_REQUIRED' }, true)
    return callHarness('/v1/plugin/schedules:disable', {
      namespace,
      idempotencyKey: idempotencyKey('schedule_disable', sessionRef, { scheduleId, expectedVersion: current.body.version, reason }),
      scheduleId,
      expectedVersion: current.body.version,
      reason
    })
  })

  server.registerTool('result_inbox_list', {
    description: '分页读取正式运行的离线结果收件箱，并可显式确认已读；只返回脱敏摘要和制品元数据。',
    inputSchema: {
      cursor: z.string().regex(/^seq:\d+$/).optional(),
      limit: z.number().int().min(1).max(20).default(10),
      unreadOnly: z.boolean().default(false),
      acknowledgeInboxIds: z.array(safeRef).max(50).default([])
    }
  }, async ({ cursor, limit, unreadOnly, acknowledgeInboxIds }) => {
    const result = await requestHarness('/v1/i8/results:inbox-list', {
      namespace, ...(cursor ? { cursor } : {}), limit, unreadOnly, acknowledgeInboxIds
    })
    if (!result.response.ok) return textResult({ errorCode: result.body.errorCode || 'I8_RESULT_INBOX_FAILED', status: result.response.status }, true)
    return textResult(result.body, false, 16 * 1024)
  })

  server.registerTool('failure_get', {
    description: '读取确定性分类的事故、脱敏StepFailureEnvelope和Harness批准的修复选项；可受控等待当前稳定性策略规定的修复复验终态。',
    inputSchema: {
      incidentId: safeRef,
      waitForProposal: z.boolean().optional(),
      waitTimeoutSeconds: z.number().int().min(1).max(180).optional()
    }
  }, async ({ incidentId, waitForProposal, waitTimeoutSeconds }) => {
    let current = await requestHarness('/v1/i8/failures:get', { namespace, incidentId })
    if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_FAILURE_INCIDENT_UNAVAILABLE', status: current.response.status }, true)
    if (waitForProposal !== true) return textResult(current.body, false, 16 * 1024)
    const deadline = Date.now() + (waitTimeoutSeconds ?? 120) * 1000
    const terminal = new Set(['WAITING_USER', 'VALIDATION_FAILED'])
    while (!terminal.has(current.body?.proposal?.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750))
      current = await requestHarness('/v1/i8/failures:get', { namespace, incidentId })
      if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_FAILURE_INCIDENT_UNAVAILABLE', status: current.response.status }, true)
    }
    if (!terminal.has(current.body?.proposal?.status)) return textResult({ errorCode: 'I8_REPAIR_WAIT_TIMEOUT', status: current.body?.proposal?.status || 'UNKNOWN' }, true)
    return textResult(current.body, false, 16 * 1024)
  })

  server.registerTool('repair_propose', {
    description: '提交Schema受限的ScriptPatchProposal；禁止完整源码、项目文件、命令、任意URL和断言弱化。',
    inputSchema: {
      incidentId: safeRef,
      patchJson: jsonObjectArgument.optional(),
      operationType: z.enum(['TARGET_MAPPING']).optional(),
      targetRef: safeRef.optional(),
      locatorKind: z.enum(['TEST_ID', 'LABEL', 'ROLE']).optional(),
      locatorValue: z.string().trim().min(1).max(300).optional(),
      rationale: z.string().trim().min(1).max(1000).optional(),
      sessionRef: safeRef
    }
  }, async ({ incidentId, patchJson, operationType, targetRef, locatorKind, locatorValue, rationale, sessionRef }) => {
    try {
      const patch = patchJson
        ? parseJsonArgument(patchJson, 'I8_PATCH_JSON_INVALID')
        : operationType && targetRef && locatorKind && locatorValue && rationale
          ? { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: operationType, targetRef, locator: { kind: locatorKind, value: locatorValue } }], rationale }
          : (() => { const error = new Error('I8_PATCH_FLAT_FIELDS_INVALID'); error.code = 'I8_PATCH_FLAT_FIELDS_INVALID'; throw error })()
      const current = await requestHarness('/v1/i8/failures:get', { namespace, incidentId })
      if (!current.response.ok || !current.body.failureEnvelope?.envelopeHash) return textResult({ errorCode: current.body.errorCode || 'I8_FAILURE_ENVELOPE_UNAVAILABLE', status: current.response.status }, true)
      const business = { incidentId, expectedEnvelopeHash: current.body.failureEnvelope.envelopeHash, patch }
      return callHarness('/v1/i8/repairs:propose', { namespace, idempotencyKey: idempotencyKey('repair_propose', sessionRef, business), ...business })
    } catch (error) { return textResult({ errorCode: error.code || 'MCP_ARGUMENT_INVALID' }, true) }
  })

  server.registerTool('decision_submit', {
    description: '仅对已完成当前稳定性策略验证的修复提案记录ACTIVATE或REJECT；激活不自动复跑或迁移调度。',
    inputSchema: { incidentId: safeRef, proposalId: safeRef, choice: z.enum(['ACTIVATE', 'REJECT']), confirmationRef: safeRef, reason: z.string().trim().min(1).max(1000), sessionRef: safeRef }
  }, async ({ incidentId, proposalId, choice, confirmationRef, reason, sessionRef }) => {
    const current = await requestHarness('/v1/i8/failures:get', { namespace, incidentId })
    if (!current.response.ok || current.body.proposal?.proposalId !== proposalId || !Number.isInteger(current.body.proposal?.version)) return textResult({ errorCode: current.body.errorCode || 'I8_REPAIR_PROPOSAL_VERSION_UNAVAILABLE', status: current.response.status }, true)
    const business = { proposalId, expectedProposalVersion: current.body.proposal.version, choice, confirmationRef, reason }
    return callHarness('/v1/i8/repairs:decide', { namespace, idempotencyKey: idempotencyKey('decision_submit', sessionRef, business), ...business })
  })
  return server
}

const app = createMcpExpressApp()
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'hengzhun-i10-mcp', version: '8.0.0' }))
app.use('/mcp', (request, response, next) => {
  if (!authorized(request.headers.authorization)) {
    response.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    return
  }
  next()
})
app.post('/mcp', async (request, response) => {
  const server = createServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  try {
    await server.connect(transport)
    await transport.handleRequest(request, response, request.body)
  } catch (error) {
    process.stderr.write(`${JSON.stringify(safeProtocolFailure(error))}\n`)
    if (!response.headersSent) response.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
  } finally {
    response.on('close', () => {
      transport.close().catch(() => undefined)
      server.close().catch(() => undefined)
    })
  }
})

const httpServer = app.listen(port, host, () => process.stdout.write(`hengzhun-i8-mcp listening on ${host}:${port}\n`))
const stopFile = process.env.HENGZHUN_STOP_FILE
if (stopFile) {
  const stopPoller = setInterval(() => {
    if (!fs.existsSync(stopFile)) return
    clearInterval(stopPoller)
    httpServer.close(() => process.exit(0))
  }, 250)
  stopPoller.unref()
}
