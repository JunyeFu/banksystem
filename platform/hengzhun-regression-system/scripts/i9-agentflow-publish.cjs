#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const runtimeConfig = JSON.parse(fs.readFileSync(path.join(root, 'config/i9.runtime.example.json'), 'utf8'))
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/p5-agentflow-publication-v1.json'), 'utf8'))
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

function buildFlowData(credentialId) {
  const source = JSON.parse(fs.readFileSync(path.join(root, publication.primaryFlowDataPath), 'utf8'))
  const serialized = JSON.stringify(source)
    .replaceAll('{{$vars.HENGZHUN_KNOWLEDGE_STORE}}', publication.knowledgeStoreId)
    .replaceAll('{{$vars.MIMO_BASE_URL}}', '{{$vars.HZ_I9_MODEL_BASE_URL}}')
  const flow = JSON.parse(serialized)
  for (const node of flow.nodes || []) {
    if (node.data?.name === 'llmAgentflow') {
      node.data.inputs.llmModelConfig = {
        ...node.data.inputs.llmModelConfig,
        credential: credentialId,
        modelName: 'mimo-v2.5',
        basepath: '{{$vars.HZ_I9_MODEL_BASE_URL}}',
        streaming: false
      }
    }
  }
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
