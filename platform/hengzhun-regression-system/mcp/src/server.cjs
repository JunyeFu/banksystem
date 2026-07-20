'use strict'

const crypto = require('node:crypto')
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
const safeRef = z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._:-]+$/)

if (!harnessToken) throw new Error('HENGZHUN_SERVICE_TOKEN_MISSING')
if (!mcpToken || mcpToken.length < 24) throw new Error('HENGZHUN_MCP_TOKEN_MISSING_OR_WEAK')
if (harnessUrl.protocol !== 'http:' || harnessUrl.hostname !== '127.0.0.1') throw new Error('HENGZHUN_HARNESS_URL_MUST_BE_LOOPBACK_HTTP')
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('HENGZHUN_MCP_PORT_INVALID')

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

function textResult(value, isError = false) {
  const text = stableJson(value)
  if (Buffer.byteLength(text, 'utf8') > 8 * 1024) {
    return { isError: true, content: [{ type: 'text', text: stableJson({ errorCode: 'MCP_OUTPUT_BUDGET_EXCEEDED' }) }] }
  }
  return { ...(isError ? { isError: true } : {}), content: [{ type: 'text', text }] }
}

async function requestHarness(route, payload) {
  const response = await fetch(new URL(route, harnessUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${harnessToken}`,
      'content-type': 'application/json',
      'x-correlation-id': `mcp-${digest(payload).slice(0, 24)}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000)
  })
  const body = await response.json().catch(() => ({ errorCode: 'HARNESS_RESPONSE_INVALID' }))
  return { response, body }
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

const deferredTools = [
  'candidate_preview', 'candidate_decide', 'run_submit', 'task_get',
  'schedule_create', 'schedule_get', 'result_inbox_list', 'failure_get', 'repair_propose', 'decision_submit'
]

function createServer() {
  const server = new McpServer({ name: 'hengzhun-i8-regression', version: '3.0.0' })

  server.registerTool('case_prepare', {
    description: '将自然语言案例的已澄清结构化草案和知识快照提交给衡准权威状态库。',
    inputSchema: {
      caseDescription: z.string().trim().min(1).max(2000),
      draftJson: z.string().trim().min(2).max(16_000),
      acceptanceSummaryJson: z.string().trim().min(2).max(8_000),
      sessionRef: safeRef
    }
  }, async ({ caseDescription, draftJson, acceptanceSummaryJson, sessionRef }) => {
    try {
      const draft = parseJsonArgument(draftJson, 'I8_DRAFT_JSON_INVALID')
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
      intentPlanJson: z.string().trim().max(24_000).optional(),
      sessionRef: safeRef
    }
  }, async ({ preparationId, expectedVersion, choice, confirmationRef, reason, intentPlanJson, sessionRef }) => {
    try {
      const intentPlan = choice === 'APPROVE'
        ? parseJsonArgument(intentPlanJson || '', 'I8_INTENT_JSON_INVALID')
        : undefined
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
    description: '从已确认 IntentPlan 确定性编译阶段3计划，或读取当前候选生成状态；技术参数由 MCP 注入。',
    inputSchema: {
      preparationId: safeRef,
      sessionRef: safeRef
    }
  }, async ({ preparationId, sessionRef }) => {
    const current = await requestHarness('/v1/i8/authoring:get', { namespace, preparationId })
    if (!current.response.ok || !Number.isInteger(current.body.version)) {
      return textResult({ errorCode: current.body.errorCode || 'I8_PREPARATION_VERSION_UNAVAILABLE', status: current.response.status }, true)
    }
    return callHarness('/v1/i8/candidates:compile', {
      namespace,
      idempotencyKey: idempotencyKey('candidate_get', sessionRef, { preparationId, expectedPreparationVersion: current.body.version }),
      preparationId,
      expectedPreparationVersion: current.body.version
    })
  })

  for (const toolName of deferredTools) {
    server.registerTool(toolName, {
      description: `${toolName} 已冻结名称和边界，但要到 I8 后续阶段实现。`,
      inputSchema: { requestRef: safeRef.optional() }
    }, async () => textResult({
      errorCode: 'I8_STAGE_CAPABILITY_NOT_AVAILABLE',
      tool: toolName,
      availableFrom: toolName.startsWith('candidate_') ? 'I8_STAGE5' : 'I8_LATER_STAGE'
    }, true))
  }
  return server
}

const app = createMcpExpressApp()
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'hengzhun-i8-mcp', version: '3.0.0' }))
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
  } catch {
    if (!response.headersSent) response.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
  } finally {
    response.on('close', () => {
      transport.close().catch(() => undefined)
      server.close().catch(() => undefined)
    })
  }
})

app.listen(port, host, () => process.stdout.write(`hengzhun-i8-mcp listening on ${host}:${port}\n`))
