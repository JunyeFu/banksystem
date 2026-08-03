#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { ProgressReporter, enabledFromEnvironment } = require('./progress.cjs')
const { configuration: platformAdminConfiguration } = require('./platform-admin.cjs')

const root = path.resolve(__dirname, '..')
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'config/i10.runtime.example.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/platform-resource-manifest-v1.json'), 'utf8'))
const chatbotConfigPath = path.join(root, manifest.chatbotConfigPath || 'flowise/i10/chatbot-config-v1.json')
const chatbotConfig = JSON.parse(fs.readFileSync(chatbotConfigPath, 'utf8'))
const flowiseBase = process.env.FLOWISE_URL || `http://${runtime.network.host}:${runtime.network.flowisePort}`
const allowRegistration = process.argv.includes('--allow-register')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const stableJson = value => JSON.stringify(stable(value))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const reporter = new ProgressReporter('START', { enabled: enabledFromEnvironment() })

function assertChatbotConfig(value) {
  assert.equal(value?.schemaVersion, 'hengzhun-i10-flowise-chatbot-config-v1', 'I10_CHATBOT_CONFIG_VERSION_INVALID')
  assert.equal(value?.fullFileUpload?.status, true, 'I10_FULL_FILE_UPLOAD_DISABLED')
  const allowed = String(value?.fullFileUpload?.allowedUploadFileTypes || '').split(',').filter(Boolean)
  for (const required of [
    'image/png',
    'image/jpeg',
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4'
  ]) assert.ok(allowed.includes(required), `I10_UPLOAD_TYPE_MISSING:${required}`)
  for (const forbidden of ['application/octet-stream', 'application/zip', 'application/x-msdownload', 'application/vnd.ms-excel.sheet.macroEnabled.12']) {
    assert.ok(!allowed.includes(forbidden), `I10_UPLOAD_TYPE_FORBIDDEN:${forbidden}`)
  }
  return value
}

function parseChatbotConfig(value) {
  if (!value) return null
  return typeof value === 'string' ? JSON.parse(value) : value
}

function prototypes() {
  const directory = path.join(root, 'flowise/app/node_modules/flowise/marketplaces/agentflowsv2')
  const values = new Map()
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
    for (const node of JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')).nodes || []) if (node.data?.name && !values.has(node.data.name)) values.set(node.data.name, node)
  }
  return values
}

function buildFlowData(credentialId) {
  const sourcePath = path.join(root, manifest.primaryFlowDataPath)
  assert.equal(sha256(fs.readFileSync(sourcePath)), manifest.primaryFlowSha256, 'I10_AGENTFLOW_SOURCE_HASH_DRIFT')
  const flow = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const nodePrototypes = prototypes()
  flow.nodes = flow.nodes.map(sourceNode => {
    const prototype = nodePrototypes.get(sourceNode.data?.name)
    assert.ok(prototype, `I10_FLOWISE_NODE_PROTOTYPE_MISSING:${sourceNode.data?.name}`)
    const node = structuredClone(prototype)
    node.id = sourceNode.id; node.type = prototype.type || 'agentFlow'; node.position = sourceNode.position; node.positionAbsolute = sourceNode.position; node.selected = false; node.dragging = false
    node.data = { ...node.data, ...sourceNode.data, id: sourceNode.id, inputs: { ...(node.data?.inputs || {}), ...(sourceNode.data?.inputs || {}) }, selected: false }
    if (node.data.name === 'llmAgentflow') {
      const maxTokens = Number(node.data.inputs.llmModelConfig?.maxTokens ?? 1024)
      assert.ok([512, 1024, 2048, 4096, 8192].includes(maxTokens), `I10_LLM_OUTPUT_BUDGET_INVALID:${node.id}:${maxTokens}`)
      node.data.inputs.llmModelConfig = { ...node.data.inputs.llmModelConfig, FLOWISE_CREDENTIAL_ID: credentialId, modelName: process.env.CONTROL_MODEL_NAME, basepath: process.env.CONTROL_BASE_URL, maxTokens, temperature: 0, streaming: false, timeout: 90000 }
    }
    if (node.data.name === 'retrieverAgentflow') node.data.inputs.retrieverKnowledgeDocumentStores = [{ documentStore: `${knowledge.knowledge.storeId}:${knowledge.knowledge.storeName}` }]
    return node
  })
  return flow
}

function cookieHeader(headers) { const combined = headers.get('set-cookie'); const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []; return values.map(value => String(value).split(';', 1)[0]).join('; ') }
async function request(url, options = {}) { const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(90_000) }); const text = await response.text(); let body = text; try { body = text ? JSON.parse(text) : null } catch {} return { response, body } }
async function authorization() {
  if (process.env.FLOWISE_API_KEY) return { Authorization: `Bearer ${process.env.FLOWISE_API_KEY}` }
  // START and the Flowise UI are governed by platform-admin.json.  Requiring
  // a second, unrelated runtime.env copy of the fixed local administrator
  // causes a healthy installation to fail publication with a misleading
  // authentication error.  Keep the API-key override, but otherwise use the
  // same local-admin authority as START/STATUS.  Values are never logged.
  const localAdmin = platformAdminConfiguration()
  const adminEmail = localAdmin.email
  const adminPassword = localAdmin.password
  // Native Flowise session login.  The account controller is not a session
  // endpoint and remains protected by the API-key middleware.
  let login = await request(`${flowiseBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) })
  if (!login.response.ok && allowRegistration) {
    await request(`${flowiseBase}/api/v1/account/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: { name: localAdmin.name, email: adminEmail, type: 'pro', credential: adminPassword } }) })
    login = await request(`${flowiseBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) })
  }
  assert.ok(login.response.ok, login.response.status === 404 ? 'FLOWISE_NATIVE_AUTH_ROUTE_UNAVAILABLE' : `FLOWISE_LOGIN_FAILED:${login.response.status}`)
  assert.ok(cookieHeader(login.response.headers), 'FLOWISE_NATIVE_AUTH_COOKIE_MISSING')
  return { Cookie: cookieHeader(login.response.headers), 'x-request-from': 'internal' }
}
async function api(route, auth, options = {}) { const result = await request(`${flowiseBase}${route}`, { ...options, headers: { ...(options.headers || {}), ...auth } }); assert.ok(result.response.ok, `FLOWISE_PUBLIC_API_FAILED:${route}:${result.response.status}`); return result.body }
const list = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []

async function main() {
  reporter.installCancellation()
  reporter.startStage(8, 8, '发布并回读Agentflow', { completed: 0, total: 5, maxWaitHint: '每个Flowise公共API请求最长90秒' })
  for (const name of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME']) assert.ok(process.env[name], `${name}_MISSING`)
  assertChatbotConfig(chatbotConfig)
  const auth = await authorization()
  reporter.update(1, 5, 'Flowise登录完成')
  let credential = list(await api(`/api/v1/credentials?credentialName=${encodeURIComponent(manifest.controllerCredential.credentialName)}`, auth)).find(item => item.name === manifest.controllerCredential.name)
  if (!credential) credential = await api('/api/v1/credentials', auth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: manifest.controllerCredential.id, name: manifest.controllerCredential.name, credentialName: manifest.controllerCredential.credentialName, plainDataObj: { openAIApiKey: process.env.CONTROL_API_KEY } }) })
  reporter.update(2, 5, '主控模型凭据引用已确认')
  const flowData = stableJson(buildFlowData(credential.id))
  const existing = list(await api('/api/v1/chatflows?type=AGENTFLOW', auth)).find(item => item.id === manifest.flowId || item.name === manifest.name)
  if (!existing) {
    const payload = { AgentFlow: [], AgentFlowV2: [{ id: manifest.flowId, name: manifest.name, flowData, chatbotConfig: JSON.stringify(chatbotConfig), deployed: false, isPublic: false, type: 'AGENTFLOW', createdDate: new Date().toISOString(), updatedDate: new Date().toISOString() }], AssistantCustom: [], AssistantFlow: [], AssistantOpenAI: [], AssistantAzure: [], ChatFlow: [], ChatMessage: [], ChatMessageFeedback: [], CustomTemplate: [], Execution: [], Tool: [], DocumentStore: [], DocumentStoreFileChunk: [], Variable: [] }
    await api(manifest.importPath, auth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  }
  reporter.update(3, 5, existing ? '现有Agentflow已定位' : 'Agentflow已导入')
  const published = await api(manifest.publishPath.replace('{id}', manifest.flowId), auth, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: manifest.name, type: manifest.type, flowData, chatbotConfig: JSON.stringify(chatbotConfig), deployed: true, isPublic: false }) })
  assert.equal(published.deployed, true); assert.equal(published.isPublic, false)
  assert.deepEqual(assertChatbotConfig(parseChatbotConfig(published.chatbotConfig)), chatbotConfig)
  reporter.update(4, 5, 'Agentflow已私有发布')
  const exported = await api(manifest.exportPath, auth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentflowv2: true }) })
  const item = list(exported.AgentFlowV2).find(value => value.id === manifest.flowId); assert.ok(item, 'I10_EXPORTED_AGENTFLOW_MISSING')
  const exportedFlowData = stableJson(JSON.parse(item.flowData))
  assert.equal(exportedFlowData, flowData, 'I10_AGENTFLOW_PUBLIC_READBACK_HASH_DRIFT')
  assert.deepEqual(assertChatbotConfig(parseChatbotConfig(item.chatbotConfig)), chatbotConfig)
  const publicConfig = await api(`/api/v1/public-chatbotConfig/${manifest.flowId}`, {})
  assertChatbotConfig(publicConfig)
  assert.deepEqual(publicConfig.fullFileUpload, chatbotConfig.fullFileUpload)
  const evidence = { schemaVersion: 'hengzhun-i10-agentflow-publication-evidence-v2', mock: false, degraded: false, flowId: manifest.flowId, deployed: true, private: true, sourceFlowSha256: manifest.primaryFlowSha256, deployedFlowDataSha256: sha256(exportedFlowData), chatbotConfigHash: sha256(stableJson(chatbotConfig)), fullFileUploadEnabled: true, completedAt: new Date().toISOString() }
  const directory = path.join(root, '.data/evidence/i10/flowise'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'publication.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  const verifiedManifest = { ...manifest, chatbotConfigPath: path.relative(root, chatbotConfigPath).replaceAll('\\', '/'), chatbotConfigSha256: evidence.chatbotConfigHash, deployedFlowDataSha256: evidence.deployedFlowDataSha256, deployed: true, isPublic: false, publishState: 'DEPLOYED_PRIVATE_PUBLIC_API_ROUND_TRIP_VERIFIED', publicationEvidencePath: '.data/evidence/i10/flowise/publication.json', lastVerifiedAt: evidence.completedAt }
  fs.writeFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), `${JSON.stringify(verifiedManifest, null, 2)}\n`)
  reporter.update(5, 5, '发布状态已通过公共API回读')
  if (process.env.HENGZHUN_PROGRESS_SUBTASK !== '1') reporter.finish('Agentflow发布完成')
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (require.main === module) main().catch(error => { reporter.fail(error, '.data/evidence/i10/flowise'); process.stderr.write(`${String(error.message || error).replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]')}\n`); process.exitCode = error.exitCode || 2 })
module.exports = { assertChatbotConfig, buildFlowData, parseChatbotConfig, stableJson }
