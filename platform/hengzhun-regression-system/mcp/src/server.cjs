'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  createShadowObserver,
  normalizeAuthoringSubmitRequest,
  normalizeCaseAcceptanceSummary,
  normalizeCasePrepareRequest,
  normalizeCredentialBinding,
  normalizeCredentialSessionGetRequest,
  normalizeI10NaturalDraft,
  normalizeIngestDecisionSubmitRequest,
  normalizeIngestSubmitRequest,
  normalizeJourneyPrepareDraft,
  normalizeRepairProposeRequest,
  parseJsonArgument,
  projectCanonicalHarnessError,
  projectCanonicalToolError,
  projectLegacyHarnessError
} = require('./rf001-contract-adapter.cjs')

const productRoot = path.resolve(__dirname, '..', '..')
// RF-003-S2: single version source - the executable runtime contract's
// contractVersion is the only authoritative version; SDK registration and
// the health endpoint both derive from it. Startup fails closed when the
// contract is missing or the version is malformed (no silent fallback).
const runtimeContractVersion = (() => {
  try {
    const contract = JSON.parse(fs.readFileSync(path.join(productRoot, 'contracts/mcp/hengzhun-i8.json'), 'utf8'))
    const version = String(contract.contractVersion || '')
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('malformed')
    return version
  } catch (error) {
    throw new Error(`HENGZHUN_CONTRACT_VERSION_INVALID: ${error.message}`)
  }
})()
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
const rf001Shadow = createShadowObserver({
  enabled: process.env.HENGZHUN_RF001_SHADOW === '1',
  sink: event => process.stderr.write(`${JSON.stringify(event)}\n`)
})
// B4-S4 cutover: error payloads leave through the canonical 8-field envelope by
// default; HENGZHUN_RF001_LEGACY_ERROR=1 restores the pre-cutover legacy shape.
const legacyErrorOutput = process.env.HENGZHUN_RF001_LEGACY_ERROR === '1'
const safeRef = z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._:-]+$/)
const controlledAttachmentRef = z.string().trim().min(8).max(1024).regex(/^[A-Za-z0-9._:-]+$/)
const jsonObjectArgument = z.union([
  z.string().trim().min(2).max(24_000),
  z.record(z.string(), z.unknown())
])
// Agentflow template interpolation serializes Custom Function array outputs as
// JSON strings before invoking MCP.  Keep the wire contract compatible with
// both that representation and native arrays, then restore and validate the
// actual array below.  This is intentionally narrow: it is not a generic JSON
// escape hatch for arbitrary tool arguments.
const jsonArrayArgument = z.union([
  z.string().trim().min(2).max(24_000),
  z.array(z.unknown()).max(50)
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
    ? legacyErrorOutput
      ? {
          ...value,
          category: typeof value.category === 'string' ? value.category : 'TOOL',
          status: Number.isInteger(value.status) && value.status >= 400 ? value.status : 400
        }
      : projectCanonicalToolError(value)
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

async function callHarness(route, payload, responseProjector, shadowOperation = route) {
  const { response, body } = await requestHarness(route, payload)
  if (!response.ok) {
    // Harness validation errors deliberately contain only schema paths/codes. Keep
    // those diagnostics so Flowise can direct the user to the actual missing or
    // malformed field, while never reflecting submitted values, credentials, or
    // request bodies back into the conversation.
    const legacy = projectLegacyHarnessError(body, response.status)
    const canonical = projectCanonicalHarnessError(body, response.status)
    rf001Shadow.observeError(shadowOperation, legacy, canonical)
    // B4-S4 cutover: the canonical envelope (with safeMessage/correlationRef)
    // is the default error output; legacy shape stays behind the
    // HENGZHUN_RF001_LEGACY_ERROR fallback switch. textResult projects
    // idempotently, so the canonical path needs no second transformation.
    return textResult(legacyErrorOutput ? legacy : canonical, true)
  }
  const legacy = typeof responseProjector === 'function' ? responseProjector(body) : body
  // B3 shadow mode never calls Harness twice. It compares the canonical path
  // with the existing output from the same response, so mutating tools cannot
  // duplicate a durable side effect while the adapter is being evaluated.
  rf001Shadow.observeSuccess(shadowOperation, legacy, legacy)
  return textResult(legacy)
}

// B3-S2 shadow scope: orchestration tools that fan out multiple Harness
// round-trips route each round-trip through this wrapper so every response is
// observed exactly once against the response it actually consumed. The wrapper
// never issues a second request and never changes the legacy tool output; it
// only records field shapes and a SHA-256 digest when projections differ.
async function shadowedRequest(operation, route, payload) {
  const { response, body } = await requestHarness(route, payload)
  if (!response.ok) {
    rf001Shadow.observeError(
      operation,
      projectLegacyHarnessError(body, response.status),
      projectCanonicalHarnessError(body, response.status)
    )
    return { response, body }
  }
  rf001Shadow.observeSuccess(operation, body, body)
  return { response, body }
}

// Flowise's native custom-MCP Tool boundary accepts a substantially smaller
// response than the Harness artifact model.  The full Journey remains the
// authority in SQLite and is available through journey_get/artifacts; this
// projection keeps only the fields required to continue the current graph.
// Without it a valid journey_prepare can be replaced by the unhelpful
// MCP_OUTPUT_BUDGET_EXCEEDED sentinel before the next node sees its journeyId.
function compactJourneyForFlowise(body) {
  // This projection crosses Flowise's native MCP Tool result boundary, whose
  // practical limit is smaller than the Harness artifact contract. Keep it
  // deliberately below that boundary: the I10 draft contract currently caps
  // executable steps at four, and the full Journey stays queryable in
  // Harness/SQLite rather than being mirrored into the conversation graph.
  const text = (value, limit = 320) => String(value || '').slice(0, limit)
  const texts = (value, count = 8, limit = 160) => Array.isArray(value)
    ? value.map(item => text(item, limit)).filter(Boolean).slice(0, count)
    : []
  const draft = body?.caseDraft && typeof body.caseDraft === 'object' ? body.caseDraft : {}
  // Frozen typed business inputs (transfer cases) must ride along with the
  // projected draft: case_prepare builds the immutable case from this payload,
  // and authoring later requires every value present.  Dropping them here
  // produced cases that permanently failed I10_TYPED_BUSINESS_INPUT_REQUIRED.
  const businessInputs = draft.businessInputs && typeof draft.businessInputs === 'object' && draft.businessInputs.values && typeof draft.businessInputs.values === 'object'
    ? {
        schemaVersion: text(draft.businessInputs.schemaVersion, 80),
        source: text(draft.businessInputs.source, 40),
        values: {
          ...(draft.businessInputs.values.payeeRef ? { payeeRef: text(draft.businessInputs.values.payeeRef, 160) } : {}),
          ...(draft.businessInputs.values.amount ? { amount: text(draft.businessInputs.values.amount, 32) } : {}),
          ...(draft.businessInputs.values.currency ? { currency: text(draft.businessInputs.values.currency, 8) } : {}),
          ...(draft.businessInputs.values.purpose ? { purpose: text(draft.businessInputs.values.purpose, 240) } : {}),
          ...(draft.businessInputs.values.dateRange ? { dateRange: text(draft.businessInputs.values.dateRange, 80) } : {}),
          ...(draft.businessInputs.values.filter ? { filter: text(draft.businessInputs.values.filter, 500) } : {})
        }
      }
    : undefined
  const steps = Array.isArray(draft.steps)
    ? draft.steps.slice(0, 6).map(step => ({ action: text(step?.action, 240), expected: text(step?.expected, 240) }))
    : []
  const proposal = body?.proposal && typeof body.proposal === 'object'
    ? {
        proposalId: text(body.proposal.proposalId || body.proposalId, 160),
        payloadHash: text(body.proposal.payloadHash || body.proposalPayloadHash, 160),
        summary: text(body.proposal.summary, 320),
        effect: text(body.proposal.effect, 240),
        rejectEffect: text(body.proposal.rejectEffect, 240)
      }
    : undefined
  const nextAction = body?.nextAction && typeof body.nextAction === 'object'
    ? { type: text(body.nextAction.type, 80), description: text(body.nextAction.description, 240) }
    : undefined
  const compact = {
    journeyId: text(body?.journeyId, 160), version: Number.isInteger(body?.version) ? body.version : 0,
    status: text(body?.status, 80), stage: text(body?.stage, 100), summary: text(body?.summary, 320),
    missingFields: texts(body?.missingFields, 20, 160), needsCredential: body?.needsCredential === true,
    interactionMode: text(body?.interactionMode, 80),
    proposalId: text(body?.proposalId, 160), proposalPayloadHash: text(body?.proposalPayloadHash, 160),
    // Flowise state bindings intentionally use these root aliases.  Preserve
    // them in the bounded projection as well as in `proposal`, otherwise a
    // valid cross-session proposal renders literal template text even though
    // the Journey itself was read successfully.
    proposalSummary: text(body?.proposalSummary || proposal?.summary, 320),
    proposalEffect: text(body?.proposalEffect || proposal?.effect, 240),
    proposalRejectEffect: text(body?.proposalRejectEffect || proposal?.rejectEffect, 240),
    proposalProceedDecision: text(body?.proposalProceedDecision, 120),
    proposalRejectDecision: text(body?.proposalRejectDecision, 120),
    caseId: text(body?.caseId, 160), caseVersion: Number.isInteger(body?.caseVersion) ? body.caseVersion : 0,
    preparationId: text(body?.preparationId, 160), preparationVersion: Number.isInteger(body?.preparationVersion) ? body.preparationVersion : 0,
    caseDraft: {
      schemaVersion: text(draft.schemaVersion, 80), title: text(draft.title, 160), objective: text(draft.objective, 320),
      summary: text(draft.summary, 320), targetSystem: text(draft.targetSystem, 160), entryUrl: text(draft.entryUrl, 512),
      preconditions: texts(draft.preconditions, 8, 160), steps, assertions: texts(draft.assertions, 8, 160),
      credentialRef: text(draft.credentialRef, 160), missingFields: texts(draft.missingFields, 20, 160),
      confirmationStatus: text(draft.confirmationStatus, 80),
      ...(businessInputs ? { businessInputs } : {})
    }
  }
  if (body?.inputRequest && typeof body.inputRequest === 'object') {
    compact.inputRequest = {
      prompt: text(body.inputRequest.prompt, 320),
      inputKind: text(body.inputRequest.inputKind, 80),
      requiredFields: texts(body.inputRequest.requiredFields, 8, 120)
    }
  }
  // The QUERY_TASK / RESULT_AVAILABLE branches bind task/run/schedule/inbox
  // references from the authoritative Journey.  Keep them as bounded scalars;
  // omitting them left the literal `{{ output.references.* }}` template in
  // Flowise state and failed the task_get schema at the MCP boundary.
  if (body?.references && typeof body.references === 'object') {
    compact.references = {
      candidateId: text(body.references.candidateId, 160),
      taskId: text(body.references.taskId, 160),
      runId: text(body.references.runId, 160),
      scheduleId: text(body.references.scheduleId, 160),
      inboxId: text(body.references.inboxId, 160),
      resultArtifactId: text(body.references.resultArtifactId, 160)
    }
    // The frozen execution plan must survive a session change: a recovered
    // conversation has no crossSessionExecutionPlan state, so the schedule
    // compile function re-reads these authoritative values instead.
    const plan = body.references.executionPlan && typeof body.references.executionPlan === 'object'
      ? body.references.executionPlan
      : null
    if (plan) {
      compact.references.executionPlan = {
        mode: text(plan.mode, 40),
        runAt: text(plan.runAt, 80),
        cronExpression: text(plan.cronExpression, 160),
        timezone: text(plan.timezone, 80)
      }
    }
  }
  if (typeof body?.renderedMarkdown === 'string' && body.renderedMarkdown.trim()) {
    compact.renderedMarkdown = text(body.renderedMarkdown, 1024)
  }
  if (proposal) compact.proposal = proposal
  if (nextAction) compact.nextAction = nextAction
  return compact
}

function parseJsonArrayArgument(value, errorCode) {
  if (Array.isArray(value)) return value
  try {
    const serialized = typeof value === 'string' && value.startsWith('uri:')
      ? decodeURIComponent(value.slice(4))
      : value
    const parsed = JSON.parse(serialized)
    if (!Array.isArray(parsed)) throw new Error('array required')
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

function createServer() {
  const server = new McpServer({ name: 'hengzhun-i10-regression', version: runtimeContractVersion })

  server.registerTool('credential_session_create', {
    description: '创建15分钟本机安全凭据录入会话；只返回credentialRef状态和本机表单地址，账号密码不会进入Flowise或模型上下文。',
    inputSchema: { label: z.string().trim().min(1).max(160), sessionRef: safeRef }
  }, async ({ label, sessionRef }) => callHarness('/v1/i10/credentials:sessions-create', {
    namespace, idempotencyKey: idempotencyKey('credential_session_create', sessionRef, { label }), label
  }))

  server.registerTool('credential_session_get', {
    description: '查询本机安全凭据会话是否已生成credentialRef，不返回账号密码。',
    inputSchema: { sessionId: safeRef }
  }, async ({ sessionId }) => {
    const canonical = normalizeCredentialSessionGetRequest({ sessionId })
    return callHarness('/v1/i10/credentials:sessions-get', { namespace, ...canonical }, undefined, 'credential_session_get')
  })

  server.registerTool('target_profile_prepare', {
    description: '首次使用任意HTTP/HTTPS网站或扩展已知跳转域名时，探测入口并生成唯一站点档案确认提案。保留完整路径、查询参数和Hash，不执行测试。',
    inputSchema: {
      displayName: z.string().trim().min(1).max(160),
      // Keep the transport schema permissive enough for Harness to return a
      // field-level diagnostic instead of an opaque MCP argument failure.
      launchUrl: z.string().trim().max(4096),
      // Flowise emits undeclared optional tool arguments as empty strings.
      // Treat an empty target-profile reference as omitted so the journey
      // prerequisite gate can decide whether a profile must be prepared.
      targetProfileId: z.union([safeRef,z.literal('')]).optional(),
      credentialRef: z.string().trim().max(160).optional(),
      // Only a registry-owned symbolic id crosses the Flowise boundary.  The
      // Harness, not Flowise or the model, resolves it to a signed binding.
      adapterSelection: z.union([z.literal(''), z.literal('fuxing-bank-demo')]).optional(),
      adapterBinding: z.object({
        adapterId: z.string().trim().min(1).max(80),
        adapterVersion: z.string().trim().min(1).max(40),
        manifestHash: z.string().regex(/^[0-9a-f]{64}$/)
      }).strict().optional(),
      applicationProfile: z.object({
        displayName: z.string().trim().min(1).max(160),
        modules: z.array(z.object({
          moduleId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
          displayName: z.string().trim().min(1).max(160),
          capabilities: z.array(z.enum(['AUTHENTICATION','NAVIGATION','READ_ONLY_QUERY','FORM_INTERACTION','TABLE_INTERACTION','FILE_UPLOAD','FILE_DOWNLOAD','BUSINESS_SUBMISSION','VERIFICATION_GATE','ASSERTION','EVIDENCE_CAPTURE'])).min(1).max(11)
        }).strict()).min(1).max(50)
      }).strict().optional(),
      tlsPolicy: z.enum(['STRICT', 'ALLOW_SELF_SIGNED']).optional(),
      sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => callHarness('/v1/i10/target-profiles:prepare', {
    namespace,
    idempotencyKey: idempotencyKey('target_profile_prepare', sessionRef, business),
    sessionRef,
    ...business
  }))

  server.registerTool('target_profile_get', {
    description: '按目标站点档案ID或入口URL读取冻结的站点、跳转、凭据域名与版本策略。',
    inputSchema: {
      targetProfileId: z.union([safeRef,z.literal('')]).optional(),
      launchUrl: z.string().trim().min(8).max(4096).optional()
    }
  }, async ({ targetProfileId, launchUrl }) => callHarness('/v1/i10/target-profiles:get', {
    namespace,
    ...(targetProfileId ? { targetProfileId } : {}),
    ...(launchUrl ? { launchUrl } : {})
  }))

  server.registerTool('target_profile_decision_submit', {
    description: '对唯一且已冻结的目标站点档案提案执行批准或拒绝；批准后才允许作者化，并将凭据引用绑定到该站点档案。',
    inputSchema: {
      targetProfileId: safeRef,
      expectedVersion: z.number().int().positive(),
      decision: z.enum(['APPROVE', 'REJECT']),
      confirmationRef: safeRef,
      sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => callHarness('/v1/i10/target-profiles:decide', {
    namespace,
    idempotencyKey: idempotencyKey('target_profile_decision_submit', sessionRef, business),
    ...business
  }))

  server.registerTool('ingest_submit', {
    description: '提交Flowise受控附件引用。案例文件同步解析，视频进入本机异步抽帧/OCR/视觉分析；禁止任意本机路径。',
    inputSchema: {
      inputType: z.enum(['CASE_FILE', 'VIDEO']), flowiseFileRef: controlledAttachmentRef,
      originalFilename: z.string().trim().min(1).max(260), credentialRef: safeRef.optional(),
      targetSystemHint: z.string().trim().min(1).max(160).optional(),
      entryUrlHint: z.string().url().max(2048).optional(), supportingImageIngestId: z.union([safeRef,z.literal('')]).optional(), sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => {
    const request = normalizeIngestSubmitRequest(business)
    return callHarness('/v1/i10/ingest:submit', {
      namespace, idempotencyKey: idempotencyKey('ingest_submit', sessionRef, request), ...request
    })
  })

  server.registerTool('ingest_get', {
    description: '查询案例文件或视频导入状态、信息缺口和待确认CaseDraft。',
    inputSchema: { ingestJobId: safeRef }
  }, async ({ ingestJobId }) => callHarness('/v1/i10/ingest:get', { namespace, ingestJobId }))

  server.registerTool('ingest_decision_submit', {
    description: '人工确认、修正或拒绝导入草案。仍有缺口时Harness拒绝确认，不允许自动生成正式脚本。',
    inputSchema: {
      ingestJobId: safeRef, expectedVersion: z.number().int().positive(),
      choice: z.enum(['CONFIRM', 'CORRECT', 'REJECT']),
      correctionsJson: jsonObjectArgument.optional(),
      itemDecisionsJson: z.union([
        z.array(z.object({
          ordinal: z.number().int().min(1).max(1000),
          decision: z.enum(['CONFIRM','REJECT'])
        }).strict()).max(1000),
        jsonObjectArgument
      ]).optional(),
      reason: z.string().trim().min(1).max(1000),
      confirmationRef: safeRef, sessionRef: safeRef
    }
  }, async ({ ingestJobId, expectedVersion, choice, correctionsJson, itemDecisionsJson, reason, confirmationRef, sessionRef }) => {
    try {
      const { corrections, itemDecisions } = normalizeIngestDecisionSubmitRequest({ correctionsJson, itemDecisionsJson })
      const business = { ingestJobId, expectedVersion, choice, corrections, itemDecisions, reason, confirmationRef }
      return callHarness('/v1/i10/ingest:decide', {
        namespace, idempotencyKey: idempotencyKey('ingest_decision_submit', sessionRef, business), ...business
      })
    } catch { return textResult({ errorCode: 'I10_INGEST_CORRECTIONS_INVALID' }, true) }
  })

  server.registerTool('image_ingest_submit', {
    description: '为自然语言、案例文件或视频主输入提交0到20张受控补充图片；图片在本机脱敏后由MiMo视觉观察并结合中英文OCR，再由主控模型筛选案例事实。',
    inputSchema: {
      sourceRef: safeRef, primaryInputType: z.enum(['NATURAL_LANGUAGE','CASE_FILE','VIDEO']),
      images: z.array(z.object({ flowiseFileRef: controlledAttachmentRef, originalFilename: z.string().trim().min(1).max(260).optional(), purposeHint: z.string().trim().max(500).optional() })).min(1).max(20),
      primaryText: z.string().trim().max(8000).optional(), credentialRef: safeRef.optional(), sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => callHarness('/v1/i10/images:submit', {
    namespace, idempotencyKey: idempotencyKey('image_ingest_submit',sessionRef,business), ...business
  }))

  server.registerTool('image_ingest_get', {
    description: '查询补充图片OCR、主控模型事实筛选和人工确认状态；不返回未脱敏图片或敏感值。',
    inputSchema: { imageIngestId: safeRef }
  }, async ({ imageIngestId }) => callHarness('/v1/i10/images:get',{namespace,imageIngestId}))

  server.registerTool('image_ingest_decision_submit', {
    description: '对补充图片提取的每一条事实逐项确认、纠正或拒绝；只有全部事实完成决定后才能进入案例草案。',
    inputSchema: {
      imageIngestId: safeRef,
      expectedVersion: z.number().int().positive(),
      confirmationRef: safeRef,
      decisions: z.array(z.object({
        factId: safeRef,
        decision: z.enum(['CONFIRM','CORRECT','REJECT']),
        replacementValue: z.string().trim().min(1).max(4000).optional()
      })).min(1).max(200),
      sessionRef: safeRef
    }
  }, async ({ sessionRef, ...business }) => callHarness('/v1/i10/images:decide', {
    namespace, idempotencyKey: idempotencyKey('image_ingest_decision_submit',sessionRef,business), ...business
  }))

  server.registerTool('verification_get', {
    description: '查询Midscene发现的短信、验证码、扫码、UKey等人工验证挑战及用户准备要求。',
    inputSchema: { challengeId: safeRef.optional(), taskRef: safeRef.optional() }
  }, async ({ challengeId,taskRef }) => {
    if (Boolean(challengeId) === Boolean(taskRef)) return textResult({errorCode:'I10_VERIFICATION_LOOKUP_REF_INVALID'},true)
    return callHarness('/v1/i10/verification:get',{namespace,...(challengeId?{challengeId}:{taskRef})})
  })

  server.registerTool('verification_decision_submit', {
    description: '用户确认已准备验证方式或已在浏览器/硬件上完成验证；严禁提交验证码、PIN、私钥或生物信息。',
    inputSchema: { challengeId:safeRef, expectedVersion:z.number().int().positive(), decision:z.enum(['USER_READY','USER_ACTION_COMPLETED','CANCEL']), confirmationRef:safeRef, note:z.string().trim().max(500).optional(), sessionRef:safeRef }
  }, async ({sessionRef,...business})=>callHarness('/v1/i10/verification:decide',{namespace,idempotencyKey:idempotencyKey('verification_decision_submit',sessionRef,business),...business}))

  server.registerTool('journey_prepare', {
    description: '创建或恢复衡准权威交互旅程。Harness确定性检查输入完整度、凭据引用和下一允许操作；未就绪时只返回缺口，不进入业务MCP筛查。',
    inputSchema: {
      sessionRef: safeRef,
      // The deployed v7 Agentflow retains the v6 Journey interaction
      // contract.  Flowise validates this schema before the MCP handler can
      // normalize optional empty state, so omitting v6 here turns an otherwise
      // valid first message into a generic MCP protocol failure.
      interactionContractVersion: z.enum(['v3','v4','v5','v6']).optional(),
      // Flowise validates tool inputs before the handler is entered.  In a
      // fresh execution an optional, upstream state value can therefore be
      // sent literally as `{{ output.journeyId }}`.  Accept only that narrow
      // unresolved-template shape here; the handler below removes it before
      // the request reaches Harness.  A normal non-empty value remains
      // subject to the opaque safeRef contract.
      journeyId: z.union([safeRef, z.literal(''), z.string().regex(/^\{\{[^}]+\}\}$/)]).optional(),
      requestIntent: z.enum(['CASE_AUTHORING','RESULT_QUERY','SCHEDULE_DISABLE','JOURNEY_RESUME','HELP','UNSUPPORTED']),
      inputType: z.enum(['NATURAL_LANGUAGE','CASE_FILE','VIDEO','NONE']),
      naturalLanguage: z.string().trim().max(8000).optional(),
      entryUrl: z.string().max(4096).optional(),
      targetSystem: z.string().trim().max(160).optional(),
      flowiseFileRef: z.union([controlledAttachmentRef,z.literal('')]).optional(),
      originalFilename: z.string().trim().max(260).optional(),
      credentialRef: z.string().trim().max(160).optional(),
      // Flowise serializes optional references as "" when no profile exists.
      targetProfileId: z.union([safeRef,z.literal('')]).optional(),
      // Flowise persists an empty start-state collection as the string "" in
      // a fresh resumed chat. Accept that transport representation here and
      // normalize it before calling Harness; the Harness contract remains an
      // array and never receives an ambiguous string.
      supportingImages: z.union([z.array(z.object({
        flowiseFileRef: controlledAttachmentRef,
        // Signed Flowise attachment references carry the canonical filename.
        // Keep this optional so the LLM cannot invent a filename merely to
        // satisfy the transport schema. Harness verifies an explicitly
        // supplied name against the signed value.
        originalFilename: z.string().trim().min(1).max(260).optional(),
        purposeHint: z.string().trim().max(500).optional()
      })).max(20), z.string().max(20000)]).optional(),
      scheduleId: z.union([safeRef,z.literal('')]).optional(),
      taskId: z.union([safeRef,z.literal('')]).optional(),
      draftJson: jsonObjectArgument.optional(),
      // These two fields are produced by the Flowise normalizer and are
      // Flowise exposes every numeric state value to MCP tools as generic
      // `number`, not an OpenAPI `integer`, even when the runtime value is an
      // exact integer. Keep the transport schema compatible and let Harness
      // remain the authority that rejects non-integral revisions.
      semanticAssessment: jsonObjectArgument.optional(),
      inputRevision: z.coerce.number().min(1).optional()
    }
  }, async ({ sessionRef, draftJson, supportingImages, semanticAssessment, inputRevision, ...business }) => {
    try {
      const normalizedDraft = normalizeJourneyPrepareDraft(draftJson)
      let normalizedSupportingImages = supportingImages
      if (typeof normalizedSupportingImages === 'string') {
        const text = normalizedSupportingImages.trim()
        normalizedSupportingImages = text ? parseJsonArgument(text, 'I10_JOURNEY_SUPPORTING_IMAGES_INVALID') : []
      }
      if (!Array.isArray(normalizedSupportingImages)) throw new Error('I10_JOURNEY_SUPPORTING_IMAGES_INVALID')
      const payload = {
        ...business,
        sessionRef,
        supportingImages: normalizedSupportingImages,
        ...(normalizedDraft ? { draftJson: normalizedDraft } : {}),
        ...(semanticAssessment ? { semanticAssessment } : {}),
        ...(inputRevision === undefined ? {} : { inputRevision })
      }
      for (const key of ['journeyId','flowiseFileRef','originalFilename','credentialRef','targetProfileId','scheduleId','taskId']) {
        // A fresh Flowise execution can retain an unresolved upstream
        // template literally (for example "{{ output.journeyId }}"). These
        // are absent optional values, not valid opaque IDs; fail closed for
        // required fields but omit them here so a new authoritative journey
        // can be created from the normalized draft.
        if (typeof payload[key] === 'string' && /\{\{[^}]+\}\}/.test(payload[key])) payload[key] = ''
        if (payload[key] === '') delete payload[key]
      }
      return callHarness('/v1/i10/journeys:prepare', {
        namespace,
        idempotencyKey: idempotencyKey('journey_prepare',sessionRef,payload),
        ...payload
      }, compactJourneyForFlowise)
    } catch (error) {
      return textResult(safeProtocolFailure(error),true)
    }
  })

  server.registerTool('journey_get', {
    description: '按journeyId或当前会话查询统一交互状态卡。长任务返回PROCESSING和建议重试时间，不要求用户点击“等待完成”。',
    inputSchema: {
      journeyId: safeRef.optional(),
      sessionRef: safeRef.optional(),
      waitSeconds: z.number().int().min(0).max(25).optional()
    }
  }, async (business) => callHarness('/v1/i10/journeys:get',{
    namespace,
    ...business,
    waitSeconds: business.waitSeconds || 0
  }, compactJourneyForFlowise))

  server.registerTool('journey_input_submit', {
    description: '提交当前旅程明确要求的非秘密补充输入。输入必须先由主控模型结构化；Harness会确定性校验并冻结唯一候选，不能直接触发运行、调度、激活或停用。',
    inputSchema: {
      journeyId: safeRef,
      expectedVersion: z.number().int().positive(),
      inputKind: z.enum(['INITIAL_CASE_INPUT','CASE_CORRECTION','INGEST_CORRECTION','EXECUTION_PLAN','REPAIR_EXECUTION_PLAN']),
      normalizedInput: jsonObjectArgument,
      submissionRef: safeRef,
      sessionRef: safeRef
    }
  }, async ({ sessionRef, normalizedInput, ...business }) => {
    try {
      const normalized = parseJsonArgument(normalizedInput,'I10_JOURNEY_INPUT_INVALID')
      const request = { ...business, normalizedInput: normalized }
      return callHarness('/v1/i10/journeys:submit-input',{
        namespace,
        idempotencyKey: idempotencyKey('journey_input_submit',sessionRef,request),
        ...request
      })
    } catch (error) {
      return textResult(safeProtocolFailure(error),true)
    }
  })

  server.registerTool('journey_decision_submit', {
    description: '提交旅程当前阶段允许的最小人工决定。必须携带版本和确认引用，禁止把账号、密码、验证码或PIN放入payload。',
    inputSchema: {
      journeyId: safeRef,
      expectedVersion: z.number().int().positive(),
      decision: z.enum([
        'APPROVE_CASE','REJECT_CASE','ACTIVATE_SCRIPT','REJECT_SCRIPT',
         'RUN_ON_DEMAND','CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE','DEFER_EXECUTION',
         'REVISE_EXECUTION_PLAN',
        'ACTIVATE_REPAIR','REJECT_REPAIR','COMPLETE_RUNTIME_VERIFICATION','ABORT_RUNTIME_VERIFICATION',
        'DISABLE_SCHEDULE','CANCEL'
      ]),
      confirmationRef: safeRef,
      proposalId: z.string().regex(/^proposal_[0-9a-f]{32}$/).optional(),
      payloadHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      payload: jsonObjectArgument.optional(),
      reason: z.string().trim().max(1000).optional(),
      sessionRef: safeRef
    }
  }, async ({ sessionRef, payload, ...business }) => {
    try {
      const normalizedPayload = payload === undefined ? {} : parseJsonArgument(payload,'I10_JOURNEY_DECISION_PAYLOAD_INVALID')
      const request = { ...business, payload: normalizedPayload }
      return callHarness('/v1/i10/journeys:decide',{
        namespace,
        idempotencyKey: idempotencyKey('journey_decision_submit',sessionRef,request),
        ...request
      })
    } catch (error) {
      return textResult(safeProtocolFailure(error),true)
    }
  })

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
      entryUrl: z.string().max(4096).optional(),
      preconditions: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
      actions: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      expectedOutcomes: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      assertions: z.array(z.string().trim().min(1).max(500)).min(1).max(50).optional(),
      missingFields: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
      multimodalContextJson: jsonObjectArgument.optional(),
      credentialRef: z.string().trim().max(160).optional(),
      journeyId: safeRef.optional(),
      sessionRef: safeRef
    }
  }, async ({
    caseDescription, draftArray, draftJson, acceptanceSummaryJson,
    caseTitle, objective, summary, targetSystem, entryUrl, preconditions,
    actions, expectedOutcomes, assertions, missingFields, multimodalContextJson, credentialRef, journeyId, sessionRef
  }) => {
    try {
      const { normalizedCredentialRef, draft } = normalizeCasePrepareRequest({
        caseDescription, draftArray, draftJson, caseTitle, objective, summary, targetSystem, entryUrl, preconditions,
        actions, expectedOutcomes, assertions, missingFields, multimodalContextJson, credentialRef
      })
      if (draft.schemaVersion === 'hengzhun-i10-case-draft-v1' || typeof draft.credentialRef === 'string') {
        const normalizedDraft = normalizeI10NaturalDraft(draft, caseDescription, sessionRef, normalizedCredentialRef)
        return callHarness('/v1/i10/cases:prepare', {
          namespace,
          idempotencyKey: idempotencyKey('case_prepare', sessionRef, { caseDescription, draft: normalizedDraft }),
          actorRef: 'flowise-controller',
          ...(journeyId ? { journeyId } : {}),
          caseDescription,
          draft: normalizedDraft
        })
      }
      const acceptanceSummary = normalizeCaseAcceptanceSummary(acceptanceSummaryJson)
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
      // Flowise's native Tool node serializes state interpolation as text even
      // when the originating MCP response contains a JSON number.  Coerce the
      // bounded optimistic-lock version at this transport boundary, then keep
      // the exact integer contract for Harness.  This is not permissive: NaN,
      // fractions, zero and negative values still fail closed.
      expectedVersion: z.coerce.number().int().positive(),
      choice: z.enum(['APPROVE', 'REJECT']),
      confirmationRef: safeRef,
      reason: z.string().trim().min(1).max(1000),
      caseId: safeRef.optional(),
      caseVersion: z.number().int().positive().optional(),
      // Native Flowise interpolates an absent Custom Function state value as an
      // empty string.  Treat '' as absent for every optional field on this
      // boundary (same rule as authoringContext below); the Harness then
      // reconstructs the exact persisted CaseDraft -> credential -> ACTIVE
      // TargetProfile binding or fails closed with a field-level error.
      route: z.union([z.string().trim().min(1).max(512), z.literal('')]).optional(),
      executionProfile: z.enum(['LOGIN_PROFILE', 'TRANSFER_UKEY_ORDER_QUERY', 'GENERIC_WEB']).optional(),
      targetProfileId: z.union([safeRef, z.literal('')]).optional(),
      targetProfileVersion: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
      targetProfileHash: z.union([z.string().regex(/^[0-9a-f]{64}$/), z.literal('')]).optional(),
      targetProfileSnapshot: z.union([jsonObjectArgument, z.literal('')]).optional(),
      // (see the empty-string note above)
      authoringContext: z.union([jsonObjectArgument, z.literal('')]).optional(),
      // Controller IDs are alignment placeholders only. Accept short labels here,
      // then replace every value with a Harness-owned deterministic identifier.
      intentStepIds: jsonArrayArgument.optional(),
      actions: jsonArrayArgument.optional(),
      expectedOutcomes: jsonArrayArgument.optional(),
      riskLevels: jsonArrayArgument.optional(),
      inputValues: jsonArrayArgument.optional(),
      inputValueSources: jsonArrayArgument.optional(),
      assertions: jsonArrayArgument.optional(),
      sessionRef: safeRef
    }
  }, async ({ preparationId, expectedVersion, choice, confirmationRef, reason, caseId, caseVersion, route, executionProfile, targetProfileId, targetProfileVersion, targetProfileHash, targetProfileSnapshot, authoringContext, intentStepIds, actions, expectedOutcomes, riskLevels, inputValues, inputValueSources, assertions, sessionRef }) => {
    try {
      // DEC-1 (OPTION-C, 2026-08-02): the seven legacy array aliases are read
      // only here by the authoritative projection and are declared no-effect;
      // they must never reach the Harness request.
      const canonical = normalizeAuthoringSubmitRequest({
        preparationId, expectedVersion, choice, confirmationRef, reason,
        intentStepIds, actions, expectedOutcomes, riskLevels, inputValues, inputValueSources, assertions
      })
      let context
      if (canonical.choice === 'APPROVE') {
        // Empty-string interpolations are transport noise, not values (schema
        // note above); normalize before the context assembly below.
        const blankToUndefined = value => (typeof value === 'string' && !value.trim()) ? undefined : value
        route = blankToUndefined(route)
        targetProfileId = blankToUndefined(targetProfileId)
        targetProfileVersion = blankToUndefined(targetProfileVersion)
        targetProfileHash = blankToUndefined(targetProfileHash)
        targetProfileSnapshot = blankToUndefined(targetProfileSnapshot)
        context = (typeof authoringContext === 'string' && !authoringContext.trim())
          ? undefined
          : authoringContext
          ? parseJsonArgument(authoringContext, 'I8_AUTHORING_CONTEXT_INVALID')
          : { route, executionProfile: executionProfile || 'GENERIC_WEB', targetProfileId, targetProfileVersion, targetProfileHash,
            targetProfileSnapshot: targetProfileSnapshot ? parseJsonArgument(targetProfileSnapshot, 'I10_TARGET_PROFILE_SNAPSHOT_INVALID') : undefined }
        if (context && !context.route) context = undefined
      }
      const businessPayload = { preparationId: canonical.preparationId, expectedVersion: canonical.expectedVersion, choice: canonical.choice, confirmationRef: canonical.confirmationRef, reason: canonical.reason, context }
      return callHarness('/v1/i8/authoring:submit', {
        namespace,
        idempotencyKey: idempotencyKey('authoring_submit', sessionRef, businessPayload),
        preparationId: canonical.preparationId,
        expectedVersion: canonical.expectedVersion,
        confirmation: { choice: canonical.choice, confirmationRef: canonical.confirmationRef, reason: canonical.reason },
        ...(context ? { authoringContext: context } : {})
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
      waitTimeoutSeconds: z.number().int().min(1).max(180).optional(),
      retryFailed: z.boolean().optional(),
      revisionReason: z.string().trim().min(8).max(500).optional()
    }
  }, async ({ preparationId, sessionRef, waitForCertificate, waitTimeoutSeconds, retryFailed, revisionReason }) => {
    let current = await shadowedRequest('candidate_get', '/v1/i8/candidates:get', { namespace, preparationId })
    if (!current.response.ok && current.response.status !== 404) {
      return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_STATUS_UNAVAILABLE', status: current.response.status }, true)
    }
    if (current.response.status === 404 || (retryFailed === true &&
        ['AUTHORING_REVIEW_REQUIRED', 'CANDIDATE_REPAIR_REQUIRED'].includes(current.body?.nextAction))) {
      const authoring = await shadowedRequest('candidate_get', '/v1/i8/authoring:get', { namespace, preparationId })
      if (!authoring.response.ok || !Number.isInteger(authoring.body.version)) {
        return textResult({ errorCode: authoring.body.errorCode || 'I8_PREPARATION_VERSION_UNAVAILABLE', status: authoring.response.status }, true)
      }
      const compiled = await shadowedRequest('candidate_get', '/v1/i8/candidates:compile', {
        namespace,
        idempotencyKey: idempotencyKey('candidate_get', sessionRef, {
          preparationId,
          expectedPreparationVersion: authoring.body.version,
          retryFailed: retryFailed === true,
          revisionReason: revisionReason || null,
          previousJobId: current.body?.job?.jobId || null
        }),
        preparationId,
        expectedPreparationVersion: authoring.body.version,
        stabilityPolicyVersion: 'I10_2X2_V1',
        retryFailed: retryFailed === true,
        ...(revisionReason ? { revisionReason } : {})
      })
      if (!compiled.response.ok) {
        return textResult({ errorCode: compiled.body.errorCode || 'I8_CANDIDATE_COMPILE_FAILED', status: compiled.response.status }, true)
      }
      current = compiled
    }
    if (waitForCertificate !== true) return textResult(current.body)
    const deadline = Date.now() + (waitTimeoutSeconds ?? 120) * 1000
    // RF-002-S3: polling termination is driven by the Harness-owned terminal flag
    while (current.body?.terminal !== true && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750))
      current = await shadowedRequest('candidate_get', '/v1/i8/candidates:get', { namespace, preparationId })
      if (!current.response.ok) {
        return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_STATUS_UNAVAILABLE', status: current.response.status }, true)
      }
    }
    if (current.body?.terminal !== true) {
      // RF-002-S3: frozen display projection from the Harness verificationGate
      // (no cross-endpoint verification lookup, no business-state inference)
      if (current.body?.verificationGate) {
        return textResult({
          ...current.body,
          status: 'WAITING_USER',
          nextAction: 'HUMAN_VERIFICATION_REQUIRED',
          verification: {
            challengeId: current.body.verificationGate.challengeId,
            status: current.body.verificationGate.status,
            version: current.body.verificationGate.version,
            verificationType: current.body.verificationGate.verificationType,
            userPreparation: current.body.verificationGate.userPreparation
          }
        })
      }
      return textResult({ errorCode: 'I8_CANDIDATE_WAIT_TIMEOUT', status:'PROCESSING', nextAction:'ASYNC_CANDIDATE_RESUME', job:current.body?.job }, false)
    }
    // RF-002-S3: frozen display projection also applies to the terminal return
    // (gate present -> v7-compatible WAITING_USER/HUMAN_VERIFICATION_REQUIRED +
    // verification object built from the Harness verificationGate fields)
    if (current.body?.verificationGate) {
      return textResult({
        ...current.body,
        status: 'WAITING_USER',
        nextAction: 'HUMAN_VERIFICATION_REQUIRED',
        verification: {
          challengeId: current.body.verificationGate.challengeId,
          status: current.body.verificationGate.status,
          version: current.body.verificationGate.version,
          verificationType: current.body.verificationGate.verificationType,
          userPreparation: current.body.verificationGate.userPreparation
        }
      }, false, 16 * 1024)
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
    const current = await shadowedRequest('candidate_preview', '/v1/i8/candidates:get', { namespace, preparationId })
    if (!current.response.ok || !current.body.candidate?.candidateId) {
      return textResult({ errorCode: current.body.errorCode || 'I8_CANDIDATE_UNAVAILABLE', status: current.response.status }, true)
    }
    const preview = await shadowedRequest('candidate_preview', '/v1/i8/candidates:preview', {
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
    const current = await shadowedRequest('candidate_decide', '/v1/i8/candidates:get', { namespace, preparationId })
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
  }, async ({ preparationId, sessionRef }) => {
    const binding = normalizeCredentialBinding()
    return callHarness('/v1/i8/runs:submit', {
      namespace,
      idempotencyKey: idempotencyKey('run_submit', sessionRef, { preparationId }),
      preparationId,
      credentialAlias: binding.credentialAlias
    })
  })

  server.registerTool('task_get', {
    description: '读取按需回归任务的最小脱敏状态与结果摘要；等待期间若Worker在业务首次确认后发现U盾等人工验证，会立即返回人工门槛而不是阻塞到超时。',
    inputSchema: {
      taskId: safeRef,
      waitForTerminal: z.boolean().optional(),
      waitTimeoutSeconds: z.number().int().min(1).max(180).optional()
    }
  }, async ({ taskId, waitForTerminal, waitTimeoutSeconds }) => {
    let current = await shadowedRequest('task_get', '/v1/i8/tasks:get', { namespace, taskId })
    if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_TASK_STATUS_UNAVAILABLE', status: current.response.status }, true)
    // RF-002-S3: display projection from the Harness verificationGate (frozen
    // mapping, no cross-endpoint call, no business-state inference).
    const display = body => {
      if (!body?.verificationGate) return body
      return {
        ...body,
        status: 'WAITING_USER',
        nextAction: 'HUMAN_VERIFICATION_REQUIRED',
        verification: {
          challengeId: body.verificationGate.challengeId,
          status: body.verificationGate.status,
          version: body.verificationGate.version,
          verificationType: body.verificationGate.verificationType,
          userPreparation: body.verificationGate.userPreparation
        }
      }
    }
    if (waitForTerminal !== true) return textResult(display(current.body))
    const deadline = Date.now() + (waitTimeoutSeconds ?? 120) * 1000
    // RF-002-S3: polling termination is driven by the Harness-owned terminal flag
    while (current.body?.terminal !== true && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750))
      current = await shadowedRequest('task_get', '/v1/i8/tasks:get', { namespace, taskId })
      if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_TASK_STATUS_UNAVAILABLE', status: current.response.status }, true)
    }
    if (current.body?.terminal !== true) {
      return textResult({
        status: current.body?.status || 'PROCESSING',
        nextAction: 'ASYNC_TASK_RESUME',
        taskId
      })
    }
    return textResult(display(current.body))
  })

  server.registerTool('schedule_create', {
    description: '在用户确认规范化时间后，为已激活候选创建精确绑定脚本版本的周期或一次性回归。用户不提供技术版本和凭据。',
    inputSchema: {
      preparationId: safeRef,
      scheduleType: z.enum(['RECURRING', 'ONE_TIME']),
      cronExpression: z.union([z.string().trim().min(9).max(128), z.literal('')]).optional(),
      runAt: z.union([z.string().datetime({ offset: true }), z.literal('')]).optional(),
      timezone: z.string().trim().min(1).max(80).default('Asia/Shanghai'),
      misfirePolicy: z.enum(['SKIP', 'RUN_ONCE']).default('RUN_ONCE'),
      misfireGraceSeconds: z.number().int().min(0).max(86400).default(300),
      maxRetries: z.number().int().min(0).max(5).default(1),
      confirmationRef: safeRef,
      sessionRef: safeRef
    }
  }, async ({ preparationId, scheduleType, cronExpression, runAt, timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef, sessionRef }) => {
    const binding = normalizeCredentialBinding()
    const business = { preparationId, scheduleType, cronExpression, runAt, timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef }
    return callHarness('/v1/i8/schedules:create', {
      namespace, idempotencyKey: idempotencyKey('schedule_create', sessionRef, business),
      preparationId, scheduleType, ...(cronExpression ? { cronExpression } : {}), ...(runAt ? { runAt } : {}),
      timezone, misfirePolicy, misfireGraceSeconds, maxRetries, confirmationRef,
      credentialAlias: binding.credentialAlias
    })
  })

  server.registerTool('schedule_get', {
    description: '读取调度状态及其精确绑定的案例、计划和脚本版本；停用调度请使用独立的 schedule_disable 工具（RF-002-S4 G5 退场：v7 零 DISABLE 调用）。',
    inputSchema: {
      scheduleId: safeRef
    }
  }, async ({ scheduleId }) => {
    const current = await shadowedRequest('schedule_get', '/v1/i8/schedules:get', { namespace, scheduleId })
    if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_SCHEDULE_STATUS_UNAVAILABLE', status: current.response.status }, true)
    return textResult(current.body)
  })

  server.registerTool('schedule_disable', {
    description: '在用户明确确认后停用指定调度；先读取当前版本，再以乐观并发方式提交停用决定。',
    inputSchema: {
      scheduleId: safeRef,
      reason: z.string().trim().min(1).max(1000),
      sessionRef: safeRef
    }
  }, async ({ scheduleId, reason, sessionRef }) => {
    const current = await shadowedRequest('schedule_disable', '/v1/i8/schedules:get', { namespace, scheduleId })
    if (!current.response.ok || !Number.isInteger(current.body?.version)) {
      return textResult({ errorCode: current.body?.errorCode || 'I8_SCHEDULE_STATUS_UNAVAILABLE', status: current.response.status }, true)
    }
    return callHarness('/v1/plugin/schedules:disable', {
      namespace,
      idempotencyKey: idempotencyKey('schedule_disable', sessionRef, { scheduleId, expectedVersion: current.body.version, reason }),
      scheduleId,
      expectedVersion: current.body.version,
      reason
    })
  })

  server.registerTool('artifact_download_grant', {
    description: '为衡准已登记且未隔离的制品签发15分钟内有效的一次性下载链接；不接受本地路径。',
    inputSchema: {
      artifactId: z.string().regex(/^art_[0-9a-f-]{36}$/)
    }
  }, async ({ artifactId }) => {
    return callHarness('/v1/i10/artifacts:grant-download', { namespace, artifactId })
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
    const result = await shadowedRequest('result_inbox_list', '/v1/i8/results:inbox-list', {
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
    let current = await shadowedRequest('failure_get', '/v1/i8/failures:get', { namespace, incidentId })
    if (!current.response.ok) return textResult({ errorCode: current.body.errorCode || 'I8_FAILURE_INCIDENT_UNAVAILABLE', status: current.response.status }, true)
    if (waitForProposal !== true) return textResult(current.body, false, 16 * 1024)
    const deadline = Date.now() + (waitTimeoutSeconds ?? 120) * 1000
    const terminal = new Set(['WAITING_USER', 'VALIDATION_FAILED'])
    while (!terminal.has(current.body?.proposal?.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 750))
      current = await shadowedRequest('failure_get', '/v1/i8/failures:get', { namespace, incidentId })
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
      const { patch } = normalizeRepairProposeRequest({ patchJson, operationType, targetRef, locatorKind, locatorValue, rationale })
      const current = await shadowedRequest('repair_propose', '/v1/i8/failures:get', { namespace, incidentId })
      if (!current.response.ok || !current.body.failureEnvelope?.envelopeHash) return textResult({ errorCode: current.body.errorCode || 'I8_FAILURE_ENVELOPE_UNAVAILABLE', status: current.response.status }, true)
      const business = { incidentId, expectedEnvelopeHash: current.body.failureEnvelope.envelopeHash, patch }
      return callHarness('/v1/i8/repairs:propose', { namespace, idempotencyKey: idempotencyKey('repair_propose', sessionRef, business), ...business })
    } catch (error) { return textResult({ errorCode: error.code || 'MCP_ARGUMENT_INVALID' }, true) }
  })

  server.registerTool('decision_submit', {
    description: '仅对已完成当前稳定性策略验证的修复提案记录ACTIVATE或REJECT；激活不自动复跑或迁移调度。',
    inputSchema: { incidentId: safeRef, proposalId: safeRef, choice: z.enum(['ACTIVATE', 'REJECT']), confirmationRef: safeRef, reason: z.string().trim().min(1).max(1000), sessionRef: safeRef }
  }, async ({ incidentId, proposalId, choice, confirmationRef, reason, sessionRef }) => {
    const current = await shadowedRequest('decision_submit', '/v1/i8/failures:get', { namespace, incidentId })
    if (!current.response.ok || current.body.proposal?.proposalId !== proposalId || !Number.isInteger(current.body.proposal?.version)) return textResult({ errorCode: current.body.errorCode || 'I8_REPAIR_PROPOSAL_VERSION_UNAVAILABLE', status: current.response.status }, true)
    const business = { proposalId, expectedProposalVersion: current.body.proposal.version, choice, confirmationRef, reason }
    return callHarness('/v1/i8/repairs:decide', { namespace, idempotencyKey: idempotencyKey('decision_submit', sessionRef, business), ...business })
  })
  return server
}

const app = createMcpExpressApp()
app.get('/health', (_request, response) => response.json({
  status: 'ok',
  service: 'hengzhun-i10-mcp',
  version: runtimeContractVersion,
  rf001Shadow: rf001Shadow.snapshot()
}))
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
