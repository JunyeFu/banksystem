'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')
const YAML = require('yaml')
const { startHarness } = require('../../dist/harness/src/server.js')

const productRoot = path.resolve(__dirname, '../..')
const nodePath = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
const flowiseAppPath = path.join(productRoot, '.data', 'probes', 'flowise', 'app-3.0.12')
const serviceToken = 'synthetic-i8-stage2-service-token-000001'
const mcpToken = 'synthetic-i8-stage2-mcp-token-00000002'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function parseFlowiseMcpText(value) {
  const content = JSON.parse(value)
  assert.equal(Array.isArray(content), true)
  assert.equal(content[0].type, 'text')
  return JSON.parse(content[0].text)
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i8-stage2-'))
  const running = await startHarness({
    productRoot,
    databasePath: path.join(root, 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(root, 'backups'),
    artifactRoot: path.join(root, 'artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    workerToken: 'synthetic-i8-stage2-worker-token-00003',
    host: '127.0.0.1',
    port: 0
  })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => {
    await new Promise((resolve) => running.server.close(resolve))
    await running.application.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { ...running, baseUrl }
}

async function post(baseUrl, route, body) {
  const response = await fetch(baseUrl + route, {
    method: 'POST',
    headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { response, body: await response.json() }
}

function domainObjects() {
  const knowledgePath = path.join(productRoot, 'flowise', 'i8', 'knowledge', 'portal-login-consistency.md')
  const knowledgeHash = sha256(fs.readFileSync(knowledgePath))
  const knowledgeSnapshot = {
    knowledgeSnapshotId: 'flowise-portal-login-v1',
    sourceVersion: '1.0.0',
    contentHash: knowledgeHash,
    citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency']
  }
  const draft = {
    schemaVersion: 'i8-regression-case-draft-v1',
    title: '门户登录资料一致性',
    objective: '验证客户登录后的姓名和头像来自当前账户。',
    summary: '登录后核对页眉身份与个人资料。',
    riskLevel: 'LOW',
    route: '/portal/login',
    preconditions: ['使用受控合成客户身份'],
    steps: [
      { action: '在门户输入账号密码并登录', expected: '进入受保护的门户页面' },
      { action: '打开个人资料', expected: '显示当前客户资料' }
    ],
    assertions: ['页眉姓名与个人资料姓名相等', '页眉头像属于当前账户'],
    knowledgeSnapshot
  }
  const acceptanceSummary = {
    schemaVersion: 'i8-acceptance-summary-v1',
    caseTitle: draft.title,
    objective: draft.objective,
    stepCount: 2,
    assertionCount: 2,
    riskLevel: 'LOW',
    clarificationRequired: false,
    clarificationQuestions: []
  }
  return { draft, acceptanceSummary }
}

test('migration 010 persists immutable stage2 handoff state', async (t) => {
  const { application } = await fixture(t)
  const migration = application.database.connection.prepare('SELECT name FROM schema_migrations WHERE version = 10').get()
  assert.equal(migration.name, '010_i8_agentflow_handoff.sql')
  const table = application.database.connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='i8_case_preparations'").get()
  assert.equal(table.name, 'i8_case_preparations')
})

test('Harness stage2 prepares, confirms and reports a case without accepting technical input from the user', async (t) => {
  const { application, baseUrl } = await fixture(t)
  const { draft, acceptanceSummary } = domainObjects()
  const prepared = await post(baseUrl, '/v1/i8/cases:prepare', {
    namespace: 'i8-stage2', idempotencyKey: 'stage2-prepare-0001', actorRef: 'flowise-controller',
    caseDescription: '客户在门户登录后，右上角姓名和头像与个人资料一致', draft, acceptanceSummary
  })
  assert.equal(prepared.response.status, 200)
  assert.equal(prepared.body.status, 'PREPARED')
  assert.equal(prepared.body.nextAction, 'HUMAN_CONFIRMATION_REQUIRED')
  assert.equal(JSON.stringify(prepared.body).includes('caseDescription'), false)

  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1', caseId: prepared.body.caseId, caseVersion: 1, route: '/portal/login',
    steps: [
      { intentStepId: 'intent-login', action: '完成门户账号密码登录', expected: '进入受保护页面', riskLevel: 'LOW' },
      { intentStepId: 'intent-profile', action: '比较页眉与个人资料身份', expected: '姓名和头像属于同一账户', riskLevel: 'LOW' }
    ],
    assertions: draft.assertions
  }
  const submitted = await post(baseUrl, '/v1/i8/authoring:submit', {
    namespace: 'i8-stage2', idempotencyKey: 'stage2-submit-0001', preparationId: prepared.body.preparationId,
    expectedVersion: 1,
    confirmation: { choice: 'APPROVE', confirmationRef: 'flowise-session-0001', reason: '用户明确批准案例摘要' },
    intentPlan
  })
  assert.equal(submitted.response.status, 202)
  assert.equal(submitted.body.status, 'AWAITING_STAGE3')
  assert.equal(submitted.body.nextAction, 'EXECUTABLE_PLAN_COMPILER_REQUIRED')

  const status = await post(baseUrl, '/v1/i8/authoring:get', { namespace: 'i8-stage2', preparationId: prepared.body.preparationId })
  assert.equal(status.response.status, 200)
  assert.equal(status.body.intentPlanHash, submitted.body.intentPlanHash)
  assert.equal(status.body.acceptanceSummary.caseTitle, draft.title)

  const row = application.database.connection.prepare('SELECT * FROM i8_case_preparations WHERE preparation_id = ?').get(prepared.body.preparationId)
  assert.equal(row.status, 'AWAITING_STAGE3')
  assert.throws(() => application.database.connection.prepare('DELETE FROM i8_case_preparations WHERE preparation_id = ?').run(prepared.body.preparationId), /I8_PREPARATION_IMMUTABLE/)
})

test('stage2 schemas reject unresolved clarification, secret-like input and mismatched intent plans', async (t) => {
  const { baseUrl } = await fixture(t)
  const { draft, acceptanceSummary } = domainObjects()
  const unresolved = await post(baseUrl, '/v1/i8/cases:prepare', {
    namespace: 'i8-stage2-negative', idempotencyKey: 'stage2-negative-0001', actorRef: 'flowise-controller',
    caseDescription: '请用 sk-secretvalue12345 登录', draft,
    acceptanceSummary: { ...acceptanceSummary, clarificationRequired: true, clarificationQuestions: ['客户还是员工？'] }
  })
  assert.equal(unresolved.response.status, 400)
  assert.equal(unresolved.body.errorCode, 'SCHEMA_VALIDATION_FAILED')
})

test('Flowise 3.0.12 artifact uses only mapped nodes, chat input and MCP for external tools', () => {
  assert.ok(fs.existsSync(path.join(flowiseAppPath, 'package.json')), 'Flowise 3.0.12 probe runtime is required')
  const flow = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'agentflow-v2.json'), 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'deployment-manifest.json'), 'utf8'))
  const mapping = YAML.parse(fs.readFileSync(path.join(productRoot, 'flowise', 'i8', 'hiagent-capability-map.yaml'), 'utf8'))
  const start = flow.nodes.find((node) => node.data.name === 'startAgentflow')
  assert.equal(start.data.inputs.startInputType, 'chatInput')
  assert.deepEqual(manifest.requiredUserInput, ['caseDescription'])
  assert.equal(mapping.claimsHiAgentRuntimeVerified, false)
  assert.equal(flow.nodes.some((node) => ['customFunctionAgentflow', 'httpAgentflow'].includes(node.data.name)), false)
  assert.equal(JSON.stringify(flow).includes('$flow.state.preparation'), false)
  const tools = flow.nodes.filter((node) => node.data.name === 'toolAgentflow')
  assert.deepEqual(tools.flatMap((node) => node.data.inputs.toolAgentflowSelectedToolConfig.mcpActions).sort(), ['authoring_get', 'authoring_submit', 'candidate_get', 'case_prepare'])
  for (const node of tools) {
    assert.equal(node.data.inputs.toolAgentflowSelectedTool, 'customMCP')
    assert.match(node.data.inputs.toolAgentflowSelectedToolConfig.mcpServerConfig, /^\{"url":"http:\/\/127\.0\.0\.1:18789\/mcp"/)
  }

  const runtimeRequire = require('node:module').createRequire(path.join(flowiseAppPath, 'package.json'))
  const componentPaths = {
    startAgentflow: 'flowise-components/dist/nodes/agentflow/Start/Start.js',
    retrieverAgentflow: 'flowise-components/dist/nodes/agentflow/Retriever/Retriever.js',
    llmAgentflow: 'flowise-components/dist/nodes/agentflow/LLM/LLM.js',
    conditionAgentflow: 'flowise-components/dist/nodes/agentflow/Condition/Condition.js',
    humanInputAgentflow: 'flowise-components/dist/nodes/agentflow/HumanInput/HumanInput.js',
    loopAgentflow: 'flowise-components/dist/nodes/agentflow/Loop/Loop.js',
    toolAgentflow: 'flowise-components/dist/nodes/agentflow/Tool/Tool.js',
    directReplyAgentflow: 'flowise-components/dist/nodes/agentflow/DirectReply/DirectReply.js'
  }
  for (const name of new Set(flow.nodes.map((node) => node.data.name))) {
    const NodeClass = runtimeRequire(componentPaths[name]).nodeClass
    assert.equal(new NodeClass().name, name)
  }
})

test('Flowise MCP client reaches the authenticated 14-tool server and active tools reach Harness', async (t) => {
  const { baseUrl } = await fixture(t)
  assert.ok(fs.existsSync(path.join(flowiseAppPath, 'package.json')), 'Flowise 3.0.12 probe runtime is required')
  const port = await freePort()
  const child = spawn(nodePath, [path.join(productRoot, 'mcp', 'src', 'server.cjs')], {
    cwd: productRoot,
    env: {
      ...process.env,
      FLOWISE_APP_PATH: flowiseAppPath,
      HENGZHUN_HARNESS_URL: baseUrl,
      HENGZHUN_NAMESPACE: 'i8-stage2-mcp',
      HENGZHUN_SERVICE_TOKEN: serviceToken,
      HENGZHUN_MCP_TOKEN: mcpToken,
      HENGZHUN_MCP_PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
  t.after(() => { if (!child.killed) child.kill() })
  const healthUrl = `http://127.0.0.1:${port}/health`
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(healthUrl)).ok) break } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal((await fetch(healthUrl)).status, 200, stderr)
  const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'negative', version: '1' } } })
  })
  assert.equal(unauthorized.status, 401)

  const runtimeRequire = require('node:module').createRequire(path.join(flowiseAppPath, 'package.json'))
  const { MCPToolkit } = runtimeRequire('flowise-components/dist/nodes/tools/MCP/core.js')
  const toolkit = new MCPToolkit({ url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${mcpToken}` } }, 'sse')
  await toolkit.initialize()
  assert.equal(toolkit.tools.length, 14)
  assert.deepEqual(toolkit.tools.map((tool) => tool.name).sort(), [
    'authoring_get', 'authoring_submit', 'candidate_decide', 'candidate_get', 'candidate_preview',
    'case_prepare', 'decision_submit', 'failure_get', 'repair_propose', 'result_inbox_list',
    'run_submit', 'schedule_create', 'schedule_get', 'task_get'
  ])
  const { draft, acceptanceSummary } = domainObjects()
  const prepareText = await toolkit.tools.find((tool) => tool.name === 'case_prepare').invoke({
    caseDescription: '客户登录后核对页眉和个人资料身份',
    draftJson: JSON.stringify(draft),
    acceptanceSummaryJson: JSON.stringify(acceptanceSummary),
    sessionRef: 'flowise-stage2-session-01'
  })
  const prepared = parseFlowiseMcpText(prepareText)
  assert.equal(prepared.status, 'PREPARED')

  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1', caseId: prepared.caseId, caseVersion: 1, route: '/portal/login',
    steps: [{ intentStepId: 'intent-login', action: '登录并核对身份', expected: '页眉与个人资料一致', riskLevel: 'LOW' }],
    assertions: draft.assertions
  }
  const submitText = await toolkit.tools.find((tool) => tool.name === 'authoring_submit').invoke({
    preparationId: prepared.preparationId, expectedVersion: 1, choice: 'APPROVE',
    confirmationRef: 'flowise-stage2-session-01', reason: '用户明确批准',
    intentPlanJson: JSON.stringify(intentPlan), sessionRef: 'flowise-stage2-session-01'
  })
  assert.equal(parseFlowiseMcpText(submitText).status, 'AWAITING_STAGE3')
  const getText = await toolkit.tools.find((tool) => tool.name === 'authoring_get').invoke({ preparationId: prepared.preparationId })
  assert.equal(parseFlowiseMcpText(getText).nextAction, 'EXECUTABLE_PLAN_COMPILER_REQUIRED')
  const candidateText = await toolkit.tools.find((tool) => tool.name === 'candidate_get').invoke({
    preparationId: prepared.preparationId,
    sessionRef: 'flowise-stage3-session-01'
  })
  const candidate = parseFlowiseMcpText(candidateText)
  assert.equal(candidate.status, 'EXECUTABLE_PLAN_READY')
  assert.equal(candidate.nextAction, 'AUTHORING_WORKER_REQUIRED')
  const deferred = await toolkit.tools.find((tool) => tool.name === 'candidate_preview').invoke({})
  assert.equal(parseFlowiseMcpText(deferred).errorCode, 'I8_STAGE_CAPABILITY_NOT_AVAILABLE')
})
