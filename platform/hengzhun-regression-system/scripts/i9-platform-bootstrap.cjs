#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const runtimeConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i9.runtime.example.json'), 'utf8'))
const manifestPath = path.join(root, 'flowise', 'i9', 'platform-resource-manifest-v1.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const connectionProfile = JSON.parse(fs.readFileSync(path.join(root, manifest.connectionProfilePath), 'utf8'))
const knowledgePath = path.join(root, manifest.knowledge.sourcePath)
const knowledgeText = fs.readFileSync(knowledgePath, 'utf8')
const knowledgeHash = crypto.createHash('sha256').update(knowledgeText).digest('hex')
const allowRegistration = process.argv.includes('--allow-register')
const flowiseBase = process.env.FLOWISE_URL || `http://${runtimeConfig.network.host}:${runtimeConfig.network.flowisePort}`
const harnessBase = process.env.HENGZHUN_HARNESS_URL || `http://${runtimeConfig.network.host}:${runtimeConfig.network.harnessPort}`

assert.equal(knowledgeHash, manifest.knowledge.contentHash, 'I9_KNOWLEDGE_CONTENT_HASH_MISMATCH')
assert.equal(connectionProfile.model.apiKeyVariable, runtimeConfig.credentialVariables.mimoApiKey, 'I9_MODEL_VARIABLE_DRIFT')
assert.equal(connectionProfile.mcp.bearerTokenVariable, runtimeConfig.credentialVariables.mcpToken, 'I9_MCP_VARIABLE_DRIFT')

function expectedVariables() {
  const definitions = [
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57001', 'HZ_I9_MODEL_PROVIDER', connectionProfile.model.provider, 'static'],
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57002', 'HZ_I9_MODEL_NAME', connectionProfile.model.modelName, 'static'],
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57003', 'HZ_I9_MODEL_BASE_URL', connectionProfile.model.baseUrl, 'static'],
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57004', connectionProfile.model.apiKeyVariable, '', 'runtime'],
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57005', 'HZ_I9_MCP_URL', connectionProfile.mcp.url, 'static'],
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57006', connectionProfile.mcp.bearerTokenVariable, '', 'runtime'],
    ['5b6ae6c6-7416-4a5d-af91-fef3dbb57007', 'HZ_I9_MCP_NAMESPACE', connectionProfile.mcp.namespace, 'static']
  ]
  return definitions.map(([id, name, value, type]) => ({ id, name, value, type }))
}

function buildImportPayload() {
  const createdDate = '2026-07-21T00:00:00.000Z'
  const metadata = {
    snapshotId: manifest.knowledge.snapshotId,
    source: manifest.knowledge.sourcePath,
    sourceVersion: manifest.knowledge.sourceVersion,
    contentHash: manifest.knowledge.contentHash,
    citationIds: manifest.knowledge.citationIds
  }
  const loader = {
    id: manifest.knowledge.documentId,
    loaderId: 'txtFile',
    loaderName: 'Text File',
    loaderConfig: { txtFile: `FILE-STORAGE::${manifest.knowledge.sourcePath}` },
    splitterId: null,
    splitterConfig: null,
    totalChars: knowledgeText.length,
    totalChunks: 1,
    status: 'SYNC'
  }
  return {
    AgentFlow: [], AgentFlowV2: [], AssistantCustom: [], AssistantFlow: [], AssistantOpenAI: [], AssistantAzure: [],
    ChatFlow: [], ChatMessage: [], ChatMessageFeedback: [], CustomTemplate: [], Execution: [], Tool: [],
    DocumentStore: [{
      id: manifest.knowledge.storeId,
      name: manifest.knowledge.storeName,
      description: JSON.stringify(metadata),
      loaders: JSON.stringify([loader]),
      whereUsed: '[]',
      createdDate,
      updatedDate: createdDate,
      status: 'SYNC',
      vectorStoreConfig: null,
      embeddingConfig: null,
      recordManagerConfig: null
    }],
    DocumentStoreFileChunk: [{
      id: manifest.knowledge.chunkId,
      docId: manifest.knowledge.documentId,
      storeId: manifest.knowledge.storeId,
      chunkNo: 1,
      pageContent: knowledgeText,
      metadata: JSON.stringify(metadata)
    }],
    Variable: expectedVariables().map((item) => ({ ...item, createdDate, updatedDate: createdDate }))
  }
}

function cookieHeader(headers) {
  const combined = headers.get('set-cookie')
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : combined
      ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/)
      : []
  return values.map((value) => String(value).split(';', 1)[0]).join('; ')
}

async function rawRequest(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = null
  if (text) {
    try { body = JSON.parse(text) } catch { body = text }
  }
  return { response, body }
}

async function createFlowiseAuthorization() {
  const apiKey = process.env.FLOWISE_API_KEY
  if (apiKey) return { Authorization: `Bearer ${apiKey}` }

  const email = process.env.FLOWISE_ADMIN_EMAIL
  const password = process.env.FLOWISE_ADMIN_PASSWORD
  const name = process.env.FLOWISE_ADMIN_NAME || '衡准管理员'
  assert.ok(email && password, 'FLOWISE_API_KEY or FLOWISE_ADMIN_EMAIL/FLOWISE_ADMIN_PASSWORD is required')

  let login = await rawRequest(`${flowiseBase}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  })
  if (!login.response.ok && allowRegistration) {
    const registration = await rawRequest(`${flowiseBase}/api/v1/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: { name, email, type: 'pro', credential: password } })
    })
    if (!registration.response.ok && registration.response.status !== 400) {
      throw new Error(`FLOWISE_REGISTRATION_FAILED:${registration.response.status}`)
    }
    login = await rawRequest(`${flowiseBase}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
    })
  }
  if (!login.response.ok) throw new Error(`FLOWISE_LOGIN_FAILED:${login.response.status}`)
  const cookie = cookieHeader(login.response.headers)
  assert.ok(cookie, 'FLOWISE_LOGIN_COOKIE_MISSING')
  return { Cookie: cookie, 'x-request-from': 'internal' }
}

async function authorizedJson(pathname, authorization, options = {}) {
  const headers = { ...(options.headers || {}), ...authorization }
  const result = await rawRequest(`${flowiseBase}${pathname}`, { ...options, headers })
  if (!result.response.ok) throw new Error(`FLOWISE_PUBLIC_API_FAILED:${pathname}:${result.response.status}`)
  return result.body
}

function asArray(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []
}

async function main() {
  const authorization = await createFlowiseAuthorization()
  const stores = asArray(await authorizedJson('/api/v1/document-store/store', authorization))
  const variables = asArray(await authorizedJson('/api/v1/variables', authorization))
  const store = stores.find((item) => item.name === manifest.knowledge.storeName)
  const expected = expectedVariables()
  const currentByName = new Map(variables.map((item) => [item.name, item]))
  const partialResources = Boolean(store) || expected.some((item) => currentByName.has(item.name))

  if (!partialResources) {
    await authorizedJson('/api/v1/export-import/import', authorization, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildImportPayload())
    })
  } else {
    assert.ok(store, 'I9_FLOWISE_PLATFORM_RESOURCE_PARTIAL_IMPORT')
    for (const item of expected) {
      const current = currentByName.get(item.name)
      assert.ok(current, `I9_FLOWISE_VARIABLE_MISSING:${item.name}`)
      assert.equal(current.type, item.type, `I9_FLOWISE_VARIABLE_TYPE_DRIFT:${item.name}`)
      assert.equal(current.value || '', item.value, `I9_FLOWISE_VARIABLE_VALUE_DRIFT:${item.name}`)
    }
  }

  const refreshedStores = asArray(await authorizedJson('/api/v1/document-store/store', authorization))
  const importedStore = refreshedStores.find((item) => item.name === manifest.knowledge.storeName)
  assert.ok(importedStore, 'I9_FLOWISE_KNOWLEDGE_STORE_MISSING')
  const chunks = await authorizedJson(
    `/api/v1/document-store/chunks/${encodeURIComponent(importedStore.id)}/${encodeURIComponent(manifest.knowledge.documentId)}/1`,
    authorization
  )
  const chunkRows = Array.isArray(chunks?.chunks) ? chunks.chunks : asArray(chunks)
  const chunk = chunkRows.find((item) => item.pageContent === knowledgeText)
  assert.ok(chunk, 'I9_FLOWISE_FIXED_REFERENCE_NOT_RETRIEVABLE')
  const chunkMetadata = typeof chunk.metadata === 'string' ? JSON.parse(chunk.metadata) : chunk.metadata
  assert.equal(chunkMetadata.contentHash, manifest.knowledge.contentHash, 'I9_FLOWISE_KNOWLEDGE_HASH_DRIFT')
  assert.deepEqual(chunkMetadata.citationIds, manifest.knowledge.citationIds, 'I9_FLOWISE_CITATIONS_DRIFT')

  const serviceToken = process.env.HENGZHUN_SERVICE_TOKEN
  assert.ok(serviceToken && serviceToken.length >= 32, 'HENGZHUN_SERVICE_TOKEN is required')
  const snapshotResponse = await rawRequest(`${harnessBase}/v1/platform/knowledge-snapshots:register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hengzhun-service-token': serviceToken },
    body: JSON.stringify({
      namespace: connectionProfile.mcp.namespace,
      idempotencyKey: `i9-p3-${manifest.knowledge.contentHash.slice(0, 32)}`,
      snapshot: {
        knowledgeSnapshotId: manifest.knowledge.snapshotId,
        sourceVersion: manifest.knowledge.sourceVersion,
        contentHash: manifest.knowledge.contentHash,
        citationIds: manifest.knowledge.citationIds
      },
      platform: 'FLOWISE',
      platformResourceId: importedStore.id,
      sourceRef: manifest.knowledge.sourcePath
    })
  })
  if (!snapshotResponse.response.ok) throw new Error(`HARNESS_KNOWLEDGE_REF_REGISTRATION_FAILED:${snapshotResponse.response.status}`)

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    importMethod: manifest.importMethod,
    knowledge: {
      snapshotId: manifest.knowledge.snapshotId,
      platformResourceId: importedStore.id,
      contentHash: manifest.knowledge.contentHash,
      citationIds: manifest.knowledge.citationIds,
      fixedReferenceRetrieved: true
    },
    connections: {
      modelProfile: 'REGISTERED_WITH_RUNTIME_SECRET_REFERENCE',
      mcpProfile: 'REGISTERED_WITH_RUNTIME_SECRET_REFERENCE',
      actualConnectivityStage: 'I9-P4'
    },
    harnessSnapshotRef: snapshotResponse.body?.status || 'REGISTERED'
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})
