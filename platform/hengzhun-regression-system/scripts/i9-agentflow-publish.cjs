#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const runtimeConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/i9.runtime.example.json'), 'utf8'))
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/p5-agentflow-publication-v1.json'), 'utf8'))
const connectionProfile = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/connection-profiles-v1.json'), 'utf8'))
const platformManifest = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/platform-resource-manifest-v1.json'), 'utf8'))
const flowiseBase = process.env.FLOWISE_URL || `http://${runtimeConfig.network.host}:${runtimeConfig.network.flowisePort}`
const allowRegistration = process.argv.includes('--allow-register')
const outputDir = path.join(root, '.data/evidence/i9')

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}
function stableJson(value) { return JSON.stringify(stable(value)) }

function verifySources() {
  for (const source of publication.sourceParts) {
    const absolute = path.join(root, source.path)
    assert.equal(sha256(fs.readFileSync(absolute)), source.sha256, `I9_P5_SOURCE_HASH_DRIFT:${source.path}`)
  }
}

function bundledNodePrototypes() {
  const templateRoot = path.join(root, 'flowise/app/node_modules/flowise/marketplaces/agentflowsv2')
  const prototypes = new Map()
  for (const filename of fs.readdirSync(templateRoot).filter(item => item.endsWith('.json')).sort()) {
    const template = JSON.parse(fs.readFileSync(path.join(templateRoot, filename), 'utf8'))
    for (const node of template.nodes || []) {
      const name = node.data?.name
      if (name && !prototypes.has(name)) prototypes.set(name, node)
    }
  }
  return prototypes
}

function structureOutputExample() {
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
    knowledgeSnapshot: {
      knowledgeSnapshotId: platformManifest.knowledge.snapshotId,
      sourceVersion: platformManifest.knowledge.sourceVersion,
      contentHash: platformManifest.knowledge.contentHash,
      citationIds: platformManifest.knowledge.citationIds
    }
  }
  const acceptanceSummary = {
    schemaVersion: 'i8-acceptance-summary-v1', caseTitle: draft.title, objective: draft.objective,
    stepCount: draft.steps.length, assertionCount: draft.assertions.length, riskLevel: 'LOW',
    clarificationRequired: false, clarificationQuestions: []
  }
  return JSON.stringify({
    draftJson: JSON.stringify(draft),
    acceptanceSummaryJson: JSON.stringify(acceptanceSummary),
    clarificationRequired: false,
    clarificationQuestion: ''
  })
}

function intentOutputExample() {
  return JSON.stringify({
    preparationId: 'prep_从MCP准备结果原样复制',
    preparationVersion: 1,
    caseId: 'case_从MCP准备结果原样复制',
    caseVersion: 1,
    route: '/portal/login',
    intentStepIds: ['open-login', 'submit-login', 'compare-profile'],
    actions: ['打开门户登录页', '输入已配置的测试账号并登录', '核对页眉姓名、头像与个人资料'],
    expectedOutcomes: ['显示登录表单', '进入门户首页', '姓名和头像一致'],
    riskLevels: ['LOW', 'LOW', 'LOW'],
    assertions: ['页眉姓名与个人资料姓名相等', '页眉头像与个人资料头像属于同一当前账户']
  })
}

function buildFlowData(credentialId) {
  const source = JSON.parse(fs.readFileSync(path.join(root, publication.primaryFlowDataPath), 'utf8'))
  const serialized = JSON.stringify(source)
    .replaceAll('{{$vars.MIMO_BASE_URL}}', connectionProfile.model.baseUrl)
    .replace(/{{\s*([^{}]+?)\s*}}/g, '{{ $1 }}')
    .replaceAll('{{ $flow.input }}', '{{ question }}')
    .replaceAll('{{ retrieverAgentflow_i8.output }}', '{{ retrieverAgentflow_i8.output.content }}')
    .replaceAll('{{ toolAgentflow_prepare.output }}', '{{ toolAgentflow_prepare }}')
    .replaceAll('{{ toolAgentflow_get.output }}', '{{ toolAgentflow_get }}')
    .replaceAll('{{ toolAgentflow_candidate.output }}', '{{ toolAgentflow_candidate }}')
  const flow = JSON.parse(serialized)
  const prototypes = bundledNodePrototypes()
  flow.nodes = (flow.nodes || []).map(sourceNode => {
    const prototype = prototypes.get(sourceNode.data?.name)
    assert.ok(prototype, `I9_P5_BUNDLED_NODE_PROTOTYPE_MISSING:${sourceNode.data?.name}`)
    const node = JSON.parse(JSON.stringify(prototype))
    node.id = sourceNode.id
    node.type = prototype.type || 'agentFlow'
    node.position = sourceNode.position
    node.positionAbsolute = sourceNode.position
    node.selected = false
    node.dragging = false
    node.data = {
      ...node.data,
      ...sourceNode.data,
      id: sourceNode.id,
      inputs: { ...(node.data?.inputs || {}), ...(sourceNode.data?.inputs || {}) },
      selected: false
    }
    if (node.data?.name === 'llmAgentflow') {
      node.data.inputs.llmModelConfig = {
        ...node.data.inputs.llmModelConfig,
        FLOWISE_CREDENTIAL_ID: credentialId,
        modelName: 'mimo-v2.5',
        basepath: connectionProfile.model.baseUrl,
        maxTokens: 4000,
        streaming: false,
        timeout: 60000
      }
      if (sourceNode.id === 'llmAgentflow_structure') {
        const system = node.data.inputs.llmMessages.find(message => message.role === 'system')
        system.content += `\n顶层draftJson和acceptanceSummaryJson必须是经过JSON.stringify的字符串，绝不能返回嵌套对象。用户不负责提供技术步骤；你必须从自然语言和已发布知识推导业务步骤。当前登录一致性知识已充分时不得反问。draftJson必须严格匹配示例字段，steps每项只能有action和expected，不得添加expectedResult等字段；knowledgeSnapshot必须逐字复制已发布知识metadata，不得发明ID、Hash或引用。严格输出形状示例：${structureOutputExample()}`
      }
      if (sourceNode.id === 'llmAgentflow_intent') {
        const system = node.data.inputs.llmMessages.find(message => message.role === 'system')
        system.content += `\n顶层只能包含preparationId、preparationVersion、caseId、caseVersion、route、intentStepIds、actions、expectedOutcomes、riskLevels、assertions十个扁平字段。preparationId、preparationVersion、caseId和caseVersion必须从MCP准备结果原样复制；业务字段取已确认草案。intentStepIds、actions、expectedOutcomes和riskLevels必须是非空且严格等长的数组，按同一业务步骤顺序对应；riskLevels每项只能是LOW。assertions必须是非空字符串数组，禁止输出对象、嵌套IntentPlan、模板变量、占位符或补造ID。严格输出形状示例（示例中的中文占位说明必须替换为MCP真实值）：${intentOutputExample()}`
      }
    }
    if (node.data?.name === 'retrieverAgentflow') {
      node.data.inputs.retrieverKnowledgeDocumentStores = [{
        documentStore: `${publication.knowledgeStoreId}:${publication.knowledgeStoreName}`
      }]
    }
    return node
  })
  flow.i9Publication = {
    schemaVersion: publication.schemaVersion,
    sourceParts: publication.sourceParts,
    allowedNodeSemantics: publication.allowedNodeSemantics
  }
  return flow
}

function cookieHeader(headers) {
  const combined = headers.get('set-cookie')
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []
  return values.map(value => String(value).split(';', 1)[0]).join('; ')
}

async function rawRequest(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = null
  if (text) { try { body = JSON.parse(text) } catch { body = text } }
  return { response, body }
}

async function createAuthorization() {
  if (process.env.FLOWISE_API_KEY) return { Authorization: `Bearer ${process.env.FLOWISE_API_KEY}` }
  const email = process.env.FLOWISE_ADMIN_EMAIL
  const password = process.env.FLOWISE_ADMIN_PASSWORD
  assert.ok(email && password, 'FLOWISE_ADMIN_CREDENTIAL_REFERENCE_REQUIRED')
  let login = await rawRequest(`${flowiseBase}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  })
  if (!login.response.ok && allowRegistration) {
    await rawRequest(`${flowiseBase}/api/v1/account/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: { name: process.env.FLOWISE_ADMIN_NAME || '衡准管理员', email, type: 'pro', credential: password } })
    })
    login = await rawRequest(`${flowiseBase}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
    })
  }
  assert.ok(login.response.ok, `FLOWISE_LOGIN_FAILED:${login.response.status}`)
  const cookie = cookieHeader(login.response.headers)
  assert.ok(cookie, 'FLOWISE_LOGIN_COOKIE_MISSING')
  return { Cookie: cookie, 'x-request-from': 'internal' }
}

async function authorizedJson(pathname, authorization, options = {}) {
  const result = await rawRequest(`${flowiseBase}${pathname}`, { ...options, headers: { ...(options.headers || {}), ...authorization } })
  if (!result.response.ok) throw new Error(`FLOWISE_PUBLIC_API_FAILED:${pathname}:${result.response.status}`)
  return result.body
}
function asArray(value) { return Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [] }

async function ensureCredential(authorization) {
  const apiKey = process.env[publication.credential.runtimeVariable]
  assert.ok(apiKey && apiKey.length >= 24, 'I9_P5_MIMO_CREDENTIAL_REQUIRED')
  const credentials = asArray(await authorizedJson(`/api/v1/credentials?credentialName=${encodeURIComponent(publication.credential.credentialName)}`, authorization))
  let credential = credentials.find(item => item.name === publication.credential.name)
  if (!credential) {
    credential = await authorizedJson('/api/v1/credentials', authorization, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: publication.credential.id, name: publication.credential.name, credentialName: publication.credential.credentialName, plainDataObj: { openAIApiKey: apiKey } })
    })
  }
  assert.equal(credential.id, publication.credential.id, 'I9_P5_CREDENTIAL_ID_DRIFT')
  return credential.id
}

function emptyImport() {
  return { AgentFlow: [], AgentFlowV2: [], AssistantCustom: [], AssistantFlow: [], AssistantOpenAI: [], AssistantAzure: [], ChatFlow: [], ChatMessage: [], ChatMessageFeedback: [], CustomTemplate: [], Execution: [], Tool: [], DocumentStore: [], DocumentStoreFileChunk: [], Variable: [] }
}

async function main() {
  verifySources()
  const authorization = await createAuthorization()
  const credentialId = await ensureCredential(authorization)
  const flowData = buildFlowData(credentialId)
  const flowDataText = stableJson(flowData)
  const expectedFlowHash = sha256(flowDataText)
  const flows = asArray(await authorizedJson('/api/v1/chatflows?type=AGENTFLOW', authorization))
  let flow = flows.find(item => item.id === publication.flowId || item.name === publication.name)
  if (!flow) {
    const importPayload = emptyImport()
    importPayload.AgentFlowV2 = [{
      id: publication.flowId, name: publication.name, flowData: flowDataText, deployed: false, isPublic: false,
      type: publication.type, createdDate: '2026-07-21T00:00:00.000Z', updatedDate: '2026-07-21T00:00:00.000Z'
    }]
    await authorizedJson(publication.importPath, authorization, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(importPayload)
    })
    flow = await authorizedJson(`/api/v1/chatflows/${publication.flowId}`, authorization)
  }
  assert.equal(flow.id, publication.flowId, 'I9_P5_FLOW_ID_DRIFT')
  if (sha256(stableJson(JSON.parse(flow.flowData))) !== expectedFlowHash || flow.deployed !== true || flow.isPublic !== false) {
    flow = await authorizedJson(publication.publishPath.replace('{id}', publication.flowId), authorization, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: publication.name, type: publication.type, flowData: flowDataText, deployed: true, isPublic: false })
    })
  }
  assert.equal(flow.deployed, true, 'I9_P5_FLOW_NOT_DEPLOYED')
  assert.equal(flow.isPublic, false, 'I9_P5_FLOW_MUST_REMAIN_PRIVATE')
  assert.equal(sha256(stableJson(JSON.parse(flow.flowData))), expectedFlowHash, 'I9_P5_PUBLISHED_FLOW_HASH_DRIFT')

  const exported = await authorizedJson(publication.exportPath, authorization, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentflowv2: true })
  })
  const exportedFlow = asArray(exported.AgentFlowV2).find(item => item.id === publication.flowId)
  assert.ok(exportedFlow, 'I9_P5_EXPORTED_FLOW_MISSING')
  const canonicalExport = {
    id: exportedFlow.id, name: exportedFlow.name, type: exportedFlow.type,
    deployed: exportedFlow.deployed, isPublic: exportedFlow.isPublic,
    flowData: stable(JSON.parse(exportedFlow.flowData))
  }
  const exportHash = sha256(stableJson(canonicalExport))
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'p5-agentflow-export.json'), `${JSON.stringify(canonicalExport, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, 'p5-agentflow-export.sha256'), `${exportHash}\n`)

  let validationIssues = null
  try {
    const validation = await authorizedJson(`/api/v1/validation/${publication.flowId}`, authorization)
    validationIssues = Array.isArray(validation) ? validation.length : null
  } catch { validationIssues = 'ENDPOINT_UNAVAILABLE' }
  process.stdout.write(`${JSON.stringify({
    status: 'HENGZHUN_I9_P5_AGENTFLOW_PUBLISHED', flowId: publication.flowId,
    deployed: true, private: true, sourcePartCount: publication.sourceParts.length,
    expectedFlowHash, exportHash, validationIssues,
    credential: 'ENCRYPTED_FLOWISE_CREDENTIAL_BY_PUBLIC_API'
  }, null, 2)}\n`)
}

if (require.main === module) {
  main().catch(error => {
    const safe = String(error.message || error).replace(/[A-Za-z0-9_-]{32,}/g, '[REDACTED]')
    process.stderr.write(`${safe}\n`)
    process.exitCode = 2
  })
}

module.exports = { buildFlowData, stableJson }
