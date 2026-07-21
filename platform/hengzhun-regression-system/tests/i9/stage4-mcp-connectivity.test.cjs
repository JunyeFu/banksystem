'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')
const { I8_CONTROLLED_CATALOG } = require('../../dist/harness/src/i8/script-package-builder.js')

const productRoot = path.resolve(__dirname, '../..')
const nodePath = path.join(productRoot, 'runtime/node-v20.20.2-win-x64/node.exe')
const flowiseAppPath = path.join(productRoot, 'flowise/app')
const serviceToken = 'synthetic-i9-p4-service-token-0000000001'
const workerToken = 'synthetic-i9-p4-worker-token-00000000002'
const mcpToken = 'synthetic-i9-p4-mcp-token-0000000000003'
const namespace = 'i9-p4-connectivity'
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stableJson = value => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}` : JSON.stringify(value)

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body)
  })
  return { response, body: await response.json() }
}

function parseToolResult(value) {
  const content = JSON.parse(value)
  assert.equal(Array.isArray(content), true)
  assert.equal(content[0].type, 'text')
  return { body: JSON.parse(content[0].text), byteLength: Buffer.byteLength(value, 'utf8') }
}

function domainObjects() {
  const knowledgePath = path.join(productRoot, 'flowise/i8/knowledge/portal-login-consistency.md')
  const knowledgeHash = sha256(fs.readFileSync(knowledgePath))
  const draft = {
    schemaVersion: 'i8-regression-case-draft-v1', title: 'P4门户登录资料一致性', objective: '验证客户登录后的姓名和头像来自当前账户。',
    summary: '登录后核对页眉身份与个人资料。', riskLevel: 'LOW', route: '/portal/login', preconditions: ['使用受控合成客户身份'],
    steps: [{ action: '在门户输入账号密码并登录', expected: '进入受保护页面' }, { action: '打开个人资料', expected: '显示当前客户资料' }],
    assertions: ['页眉姓名与个人资料姓名相等', '页眉头像属于当前账户'],
    knowledgeSnapshot: { knowledgeSnapshotId: 'flowise-portal-login-v1', sourceVersion: '1.0.0', contentHash: knowledgeHash, citationIds: ['HZ-KNOW-PORTAL-LOGIN-001#identity-consistency'] }
  }
  return {
    draft,
    acceptanceSummary: { schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective, stepCount: 2, assertionCount: 2, riskLevel: 'LOW', clarificationRequired: false, clarificationQuestions: [] }
  }
}

function recordsFor(plan) {
  return plan.actions.map(action => ({
    schemaVersion: 'i8-verified-action-record-v1', executablePlanId: plan.executablePlanId, actionId: action.actionId, ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED', ...(action.semanticTargetRef ? { locator: I8_CONTROLLED_CATALOG.targets[action.semanticTargetRef] } : {}),
    pageSignatureHash: sha256(stableJson(action.pageSignature)), factsHash: sha256(stableJson({ actionId: action.actionId })),
    verification: { dom: true, url: true, request: true, business: true }, verifiedAt: '2026-07-21T00:00:00.000Z'
  }))
}

function stabilityCompletion(root, claim) {
  const assertionSetHash = sha256('i9-p4-assertions')
  const evidenceSetHash = sha256('i9-p4-evidence-shape')
  return {
    workerId: 'i9-p4-certifier', candidateId: claim.candidateId, scriptHash: claim.scriptHash, runtimeFingerprint: sha256('i9-p4-runtime'),
    runs: claim.runs.map(run => {
      const directory = path.join(root, '.data/stability', claim.namespace, claim.candidateId, run.validationRunId)
      fs.mkdirSync(directory, { recursive: true })
      const evidence = [['REPORT', 'application/json', 'report.json'], ['SCREENSHOT', 'image/png', 'screenshot.png'], ['LOG', 'text/plain; charset=utf-8', 'steps.log']].map(([artifactType, mediaType, name]) => {
        const target = path.join(directory, name); fs.writeFileSync(target, `${run.validationRunId}:${artifactType}`)
        const bytes = fs.readFileSync(target)
        return { artifactType, mediaType, redactionStatus: 'REDACTED', relativePath: path.relative(root, target).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.byteLength }
      })
      return { ...run, outcome: 'PASSED', durationMs: 1, assertionSetHash, evidenceSetHash, evidence }
    })
  }
}

async function startFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i9-p4-'))
  const harness = await startHarness({
    productRoot: root, databasePath: path.join(root, '.data/sqlite/regression.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'),
    backupDirectory: path.join(root, '.data/backups'), artifactRoot: path.join(root, '.data/artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] }, workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0
  })
  const baseUrl = `http://127.0.0.1:${harness.server.address().port}`
  const mcpPort = await freePort()
  const mcp = spawn(nodePath, [path.join(productRoot, 'mcp/src/server.cjs')], {
    cwd: productRoot,
    env: { ...process.env, FLOWISE_APP_PATH: flowiseAppPath, HENGZHUN_HARNESS_URL: baseUrl, HENGZHUN_NAMESPACE: namespace, HENGZHUN_SERVICE_TOKEN: serviceToken, HENGZHUN_MCP_TOKEN: mcpToken, HENGZHUN_MCP_PORT: String(mcpPort) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stderr = ''
  mcp.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${mcpPort}/health`)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal((await fetch(`http://127.0.0.1:${mcpPort}/health`)).status, 200, stderr)
  const runtimeRequire = require('node:module').createRequire(path.join(flowiseAppPath, 'package.json'))
  const { MCPToolkit } = runtimeRequire('flowise-components/dist/nodes/tools/MCP/core.js')
  const toolkit = new MCPToolkit({ url: `http://127.0.0.1:${mcpPort}/mcp`, headers: { Authorization: `Bearer ${mcpToken}` } }, 'sse')
  await toolkit.initialize()
  t.after(async () => {
    if (!mcp.killed) mcp.kill()
    await new Promise(resolve => harness.server.close(resolve)); await harness.application.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, baseUrl, mcpPort, toolkit }
}

test('Flowise MCP client executes all fourteen governed tools with auth, idempotency, bounded output and safe errors', async t => {
  const { root, baseUrl, mcpPort, toolkit } = await startFixture(t)
  assert.deepEqual(toolkit.tools.map(tool => tool.name).sort(), [
    'authoring_get', 'authoring_submit', 'candidate_decide', 'candidate_get', 'candidate_preview', 'case_prepare', 'decision_submit',
    'failure_get', 'repair_propose', 'result_inbox_list', 'run_submit', 'schedule_create', 'schedule_get', 'task_get'
  ])
  const unauthorized = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'negative', version: '1' } } }) })
  assert.equal(unauthorized.status, 401)

  const invoke = async (name, args) => {
    const result = parseToolResult(await toolkit.tools.find(tool => tool.name === name).invoke(args))
    assert.ok(result.byteLength <= 16 * 1024, `${name} exceeded response budget`)
    assert.equal(JSON.stringify(result.body).includes(root), false)
    assert.equal(JSON.stringify(result.body).includes(serviceToken), false)
    assert.equal(JSON.stringify(result.body).includes(mcpToken), false)
    return result.body
  }
  const { draft, acceptanceSummary } = domainObjects()
  const prepareArgs = { caseDescription: '客户在门户登录后核对页眉姓名、头像与个人资料一致', draftJson: JSON.stringify(draft), acceptanceSummaryJson: JSON.stringify(acceptanceSummary), sessionRef: 'i9-p4-session-prepare' }
  const prepared = await invoke('case_prepare', prepareArgs)
  assert.equal(prepared.status, 'PREPARED')
  const replay = await invoke('case_prepare', prepareArgs)
  assert.equal(replay.preparationId, prepared.preparationId)

  const intentPlan = { schemaVersion: 'i8-intent-plan-v1', caseId: prepared.caseId, caseVersion: 1, route: '/portal/login', steps: [{ intentStepId: 'login', action: '登录', expected: '成功', riskLevel: 'LOW' }, { intentStepId: 'verify', action: '核对身份', expected: '一致', riskLevel: 'LOW' }], assertions: draft.assertions }
  const submitted = await invoke('authoring_submit', { preparationId: prepared.preparationId, expectedVersion: 1, choice: 'APPROVE', confirmationRef: 'i9-p4-confirm-author', reason: '用户批准案例摘要', intentPlanJson: JSON.stringify(intentPlan), sessionRef: 'i9-p4-session-author' })
  assert.equal(submitted.status, 'AWAITING_STAGE3')
  const authoring = await invoke('authoring_get', { preparationId: prepared.preparationId })
  assert.equal(authoring.nextAction, 'EXECUTABLE_PLAN_COMPILER_REQUIRED')
  const compiled = await invoke('candidate_get', { preparationId: prepared.preparationId, sessionRef: 'i9-p4-session-candidate' })
  assert.equal(compiled.status, 'EXECUTABLE_PLAN_READY')

  const build = await post(baseUrl, '/internal/worker/i8/candidates:claim', { workerId: 'i9-p4-builder' }, workerToken)
  assert.equal(build.body.status, 'CLAIMED')
  await post(baseUrl, `/internal/worker/i8/candidates/${build.body.jobId}:complete`, { workerId: 'i9-p4-builder', planHash: build.body.planHash, outcome: 'VERIFIED_PASSED', verifiedActionRecords: recordsFor(build.body.plan) }, workerToken)
  const stability = await post(baseUrl, '/internal/worker/i8/stability:claim', { workerId: 'i9-p4-certifier' }, workerToken)
  await post(baseUrl, `/internal/worker/i8/stability/${stability.body.batchId}:complete`, stabilityCompletion(root, stability.body), workerToken)

  const preview = await invoke('candidate_preview', { preparationId: prepared.preparationId, limit: 20, includeDownload: false })
  assert.equal(preview.certificate.status, 'PASSED')
  const activated = await invoke('candidate_decide', { preparationId: prepared.preparationId, choice: 'ACTIVATE', confirmationRef: 'i9-p4-confirm-activate', reason: '用户确认激活', sessionRef: 'i9-p4-session-activate' })
  assert.equal(activated.status, 'SCRIPT_VALIDATED')
  const run = await invoke('run_submit', { preparationId: prepared.preparationId, sessionRef: 'i9-p4-session-run' })
  assert.ok(run.taskId)
  const task = await invoke('task_get', { taskId: run.taskId })
  assert.equal(task.taskId, run.taskId)
  const schedule = await invoke('schedule_create', { preparationId: prepared.preparationId, scheduleType: 'ONE_TIME', runAt: '2030-01-01T09:00:00+08:00', timezone: 'Asia/Shanghai', misfirePolicy: 'SKIP', misfireGraceSeconds: 0, maxRetries: 0, confirmationRef: 'i9-p4-confirm-schedule', sessionRef: 'i9-p4-session-schedule' })
  assert.ok(schedule.scheduleId)
  const scheduleState = await invoke('schedule_get', { scheduleId: schedule.scheduleId })
  assert.equal(scheduleState.scheduleId, schedule.scheduleId)
  const inbox = await invoke('result_inbox_list', { limit: 10, unreadOnly: false, acknowledgeInboxIds: [] })
  assert.ok(Array.isArray(inbox.items))

  const claim = await post(baseUrl, '/internal/worker/tasks:claim', { workerId: 'i9-p4-failure-worker' }, workerToken)
  assert.equal(claim.body.taskId, run.taskId)
  const failureEvidence = { artifactType: 'DIAGNOSTIC', mediaType: 'application/json', redactionStatus: 'REDACTED', extension: 'json', base64Content: Buffer.from('{"code":"LOCATOR_NOT_FOUND"}').toString('base64'), metadata: { containsCredentials: false } }
  const failed = await post(baseUrl, `/internal/worker/tasks/${claim.body.taskId}:complete`, { workerId: 'i9-p4-failure-worker', outcome: 'FAILED', summary: '受控定位器失效', errorCode: 'LOGIN_USERNAME_LOCATOR_NOT_FOUND', errorCategory: 'TEST_FAILURE', retryable: false, userActionRequired: true, evidence: [failureEvidence] }, workerToken)
  const failure = await invoke('failure_get', { incidentId: failed.body.incidentId })
  assert.equal(failure.classification, 'LOCATOR')
  const patch = { schemaVersion: 'i8-script-patch-proposal-v1', operations: [{ type: 'TARGET_MAPPING', targetRef: 'LOGIN_USERNAME', locator: I8_CONTROLLED_CATALOG.repairTargets.LOGIN_USERNAME[1] }], rationale: '使用审查过的标签定位映射' }
  const proposal = await invoke('repair_propose', { incidentId: failed.body.incidentId, patchJson: JSON.stringify(patch), sessionRef: 'i9-p4-session-repair' })
  assert.ok(proposal.proposalId)
  const repairStability = await post(baseUrl, '/internal/worker/i8/repairs/stability:claim', { workerId: 'i9-p4-certifier' }, workerToken)
  await post(baseUrl, `/internal/worker/i8/repairs/stability/${repairStability.body.batchId}:complete`, stabilityCompletion(root, repairStability.body), workerToken)
  const rejected = await invoke('decision_submit', { incidentId: failed.body.incidentId, proposalId: proposal.proposalId, choice: 'REJECT', confirmationRef: 'i9-p4-confirm-reject', reason: 'P4连通测试拒绝候选', sessionRef: 'i9-p4-session-decision' })
  assert.equal(rejected.status, 'RECORDED')

  const safeError = await invoke('failure_get', { incidentId: 'incident-does-not-exist' })
  assert.equal(safeError.errorCode, 'I8_FAILURE_INCIDENT_NOT_FOUND')
})

test('MCP converts a Harness timeout into a bounded deterministic tool error', async t => {
  const delayed = net.createServer(socket => setTimeout(() => socket.destroy(), 1000))
  await new Promise(resolve => delayed.listen(0, '127.0.0.1', resolve))
  const delayedPort = delayed.address().port
  t.after(() => new Promise(resolve => delayed.close(resolve)))
  const mcpPort = await freePort()
  const child = spawn(nodePath, [path.join(productRoot, 'mcp/src/server.cjs')], {
    cwd: productRoot,
    env: { ...process.env, NODE_ENV: 'test', FLOWISE_APP_PATH: flowiseAppPath, HENGZHUN_HARNESS_URL: `http://127.0.0.1:${delayedPort}`, HENGZHUN_NAMESPACE: namespace, HENGZHUN_SERVICE_TOKEN: serviceToken, HENGZHUN_MCP_TOKEN: mcpToken, HENGZHUN_MCP_PORT: String(mcpPort), HENGZHUN_MCP_HARNESS_TIMEOUT_MS: '100' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  t.after(() => { if (!child.killed) child.kill() })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${mcpPort}/health`)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const runtimeRequire = require('node:module').createRequire(path.join(flowiseAppPath, 'package.json'))
  const { MCPToolkit } = runtimeRequire('flowise-components/dist/nodes/tools/MCP/core.js')
  const toolkit = new MCPToolkit({ url: `http://127.0.0.1:${mcpPort}/mcp`, headers: { Authorization: `Bearer ${mcpToken}` } }, 'sse')
  await toolkit.initialize()
  const result = parseToolResult(await toolkit.tools.find(tool => tool.name === 'authoring_get').invoke({ preparationId: 'timeout-probe' }))
  assert.equal(result.body.errorCode, 'HARNESS_REQUEST_TIMEOUT')
  assert.ok(result.byteLength < 1024)
})

test('portable Flowise definitions freeze Human Input, loop limits and prohibit bypass nodes', () => {
  const primary = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise/i8/agentflow-v2.json'), 'utf8'))
  const loop = primary.nodes.find(node => node.data?.name === 'loopAgentflow')
  assert.equal(loop.data.inputs.maxLoopCount, 2)
  assert.ok(primary.nodes.filter(node => node.data?.name === 'humanInputAgentflow').length >= 2)
  const deployment = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise/i8/deployment-manifest.json'), 'utf8'))
  assert.deepEqual(deployment.allowedNodeSemantics, ['chat_input', 'knowledge_retrieval', 'structured_llm', 'condition', 'human_input', 'loop', 'mcp_tool', 'direct_reply'])
  for (const forbidden of ['code', 'http', 'database', 'file', 'shell', 'browser', 'arbitrary_url']) assert.equal(deployment.allowedNodeSemantics.includes(forbidden), false)
  const controller = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise/i9/p4-controller-profile-v1.json'), 'utf8'))
  assert.equal(controller.controllerContext.maximumInputTokens + controller.controllerContext.reservedOutputTokens, 1000000)
  assert.equal(controller.visualContext.maximumInputTokens + controller.visualContext.reservedOutputTokens, 16384)
  assert.equal(controller.mcp.toolCount, 14)
  assert.equal(controller.apiKeyVariable, 'MIMO_API_KEY')
})
