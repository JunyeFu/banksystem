#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'config/i10.runtime.example.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/platform-resource-manifest-v1.json'), 'utf8'))
const flowiseBase = process.env.FLOWISE_URL || `http://${runtime.network.host}:${runtime.network.flowisePort}`
const allowRegistration = process.argv.includes('--allow-register')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const stableJson = value => JSON.stringify(stable(value))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

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
    if (node.data.name === 'llmAgentflow') node.data.inputs.llmModelConfig = { ...node.data.inputs.llmModelConfig, FLOWISE_CREDENTIAL_ID: credentialId, modelName: process.env.CONTROL_MODEL_NAME, basepath: process.env.CONTROL_BASE_URL, maxTokens: 8192, temperature: 0, streaming: false, timeout: 90000 }
    if (node.data.name === 'retrieverAgentflow') node.data.inputs.retrieverKnowledgeDocumentStores = [{ documentStore: `${knowledge.knowledge.storeId}:${knowledge.knowledge.storeName}` }]
    return node
  })
  return flow
}

function cookieHeader(headers) { const combined = headers.get('set-cookie'); const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []; return values.map(value => String(value).split(';', 1)[0]).join('; ') }
async function request(url, options = {}) { const response = await fetch(url, options); const text = await response.text(); let body = text; try { body = text ? JSON.parse(text) : null } catch {} return { response, body } }
async function authorization() {
  if (process.env.FLOWISE_API_KEY) return { Authorization: `Bearer ${process.env.FLOWISE_API_KEY}` }
  assert.ok(process.env.FLOWISE_ADMIN_EMAIL && process.env.FLOWISE_ADMIN_PASSWORD, 'FLOWISE_ADMIN_CREDENTIAL_REFERENCE_REQUIRED')
  let login = await request(`${flowiseBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.FLOWISE_ADMIN_EMAIL, password: process.env.FLOWISE_ADMIN_PASSWORD }) })
  if (!login.response.ok && allowRegistration) {
    await request(`${flowiseBase}/api/v1/account/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: { name: process.env.FLOWISE_ADMIN_NAME || '衡准管理员', email: process.env.FLOWISE_ADMIN_EMAIL, type: 'pro', credential: process.env.FLOWISE_ADMIN_PASSWORD } }) })
    login = await request(`${flowiseBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.FLOWISE_ADMIN_EMAIL, password: process.env.FLOWISE_ADMIN_PASSWORD }) })
  }
  assert.ok(login.response.ok, `FLOWISE_LOGIN_FAILED:${login.response.status}`)
  return { Cookie: cookieHeader(login.response.headers), 'x-request-from': 'internal' }
}
async function api(route, auth, options = {}) { const result = await request(`${flowiseBase}${route}`, { ...options, headers: { ...(options.headers || {}), ...auth } }); assert.ok(result.response.ok, `FLOWISE_PUBLIC_API_FAILED:${route}:${result.response.status}`); return result.body }
const list = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []

async function main() {
  for (const name of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME']) assert.ok(process.env[name], `${name}_MISSING`)
  const auth = await authorization()
  let credential = list(await api(`/api/v1/credentials?credentialName=${encodeURIComponent(manifest.controllerCredential.credentialName)}`, auth)).find(item => item.name === manifest.controllerCredential.name)
  if (!credential) credential = await api('/api/v1/credentials', auth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: manifest.controllerCredential.id, name: manifest.controllerCredential.name, credentialName: manifest.controllerCredential.credentialName, plainDataObj: { openAIApiKey: process.env.CONTROL_API_KEY } }) })
  const flowData = stableJson(buildFlowData(credential.id))
  const existing = list(await api('/api/v1/chatflows?type=AGENTFLOW', auth)).find(item => item.id === manifest.flowId || item.name === manifest.name)
  if (!existing) {
    const payload = { AgentFlow: [], AgentFlowV2: [{ id: manifest.flowId, name: manifest.name, flowData, deployed: false, isPublic: false, type: 'AGENTFLOW', createdDate: new Date().toISOString(), updatedDate: new Date().toISOString() }], AssistantCustom: [], AssistantFlow: [], AssistantOpenAI: [], AssistantAzure: [], ChatFlow: [], ChatMessage: [], ChatMessageFeedback: [], CustomTemplate: [], Execution: [], Tool: [], DocumentStore: [], DocumentStoreFileChunk: [], Variable: [] }
    await api(manifest.importPath, auth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  }
  const published = await api(manifest.publishPath.replace('{id}', manifest.flowId), auth, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: manifest.name, type: manifest.type, flowData, deployed: true, isPublic: false }) })
  assert.equal(published.deployed, true); assert.equal(published.isPublic, false)
  const exported = await api(manifest.exportPath, auth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentflowv2: true }) })
  const item = list(exported.AgentFlowV2).find(value => value.id === manifest.flowId); assert.ok(item, 'I10_EXPORTED_AGENTFLOW_MISSING')
  const evidence = { schemaVersion: 'hengzhun-i10-agentflow-publication-evidence-v1', mock: false, degraded: false, flowId: manifest.flowId, deployed: true, private: true, exportedHash: sha256(stableJson(JSON.parse(item.flowData))), completedAt: new Date().toISOString() }
  const directory = path.join(root, '.data/evidence/i10/flowise'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'publication.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  const verifiedManifest = { ...manifest, deployed: true, isPublic: false, publishState: 'DEPLOYED_PRIVATE_PUBLIC_API_ROUND_TRIP_VERIFIED', publicationEvidencePath: '.data/evidence/i10/flowise/publication.json', lastVerifiedAt: evidence.completedAt }
  fs.writeFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), `${JSON.stringify(verifiedManifest, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (require.main === module) main().catch(error => { process.stderr.write(`${String(error.message || error).replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]')}\n`); process.exitCode = 2 })
module.exports = { buildFlowData, stableJson }
