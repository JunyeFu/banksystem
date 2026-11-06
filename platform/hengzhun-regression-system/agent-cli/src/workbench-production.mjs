import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { EncryptedSessionStore } from '../../controller/src/session-store.mjs'
import { connectSessionPersistence } from '../../controller/src/session-persistence.mjs'
import { EncryptedOperationStore } from '../../controller/src/operation-store.mjs'
import { ModelKeyStore } from '../../controller/src/model-key-store.mjs'
import { connectMcpRuntime } from '../../controller/src/runtime-adapters.mjs'
import { createProductionService, createHarnessAttachmentImporter, modelResponseEvidenceWriter } from './production-service.mjs'
import { probeConfiguredModel, probeProductReadiness } from './product-doctor.mjs'
import { connectWorkbenchMetadata } from './workbench-metadata.mjs'
import { createWorkbenchApplication } from './workbench-application.mjs'
import { WorkbenchError } from './workbench-http.mjs'

const require = createRequire(import.meta.url)
const lifecycle = require('../../scripts/i10-agent-lifecycle.cjs')
const releaseV4 = require('../../scripts/i10-release-identity-v4.cjs')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

// Observe ownership without invoking the expensive Harness health endpoint twice.
export async function probeWorkbenchReadiness({ root, environment, releaseIdentityHash, signal, deps = {} }) {
  if (signal?.aborted) return { status: 'NOT_READY', code: 'AGENT_READINESS_CANCELLED' }
  let identity
  try { identity = (deps.authorize || lifecycle.authorizedIdentity)({ root, environment }) }
  catch { return { status: 'NOT_READY', code: 'AGENT_LIVE_NOT_AUTHORIZED' } }
  if (identity.identityHash !== releaseIdentityHash) return { status: 'NOT_READY', code: 'AGENT_STALE_SOURCE' }
  const managed = await (deps.inspect || lifecycle.inspectManagedOwnership)({ root, identity, signal })
  const missing = managed.services.find(service => !service.owned)
  if (missing) return { status: 'NOT_READY', code: `AGENT_${missing.name.toUpperCase()}_PROCESS_NOT_OWNED` }
  const worker = managed.services.find(service => service.name === 'worker')
  if (!(deps.workerHealth || lifecycle.workerHealth)(root, worker)) return { status: 'NOT_READY', code: 'WORKER_HEARTBEAT_NOT_READY' }
  if (signal?.aborted) return { status: 'NOT_READY', code: 'AGENT_READINESS_CANCELLED' }
  return (deps.probe || probeProductReadiness)({ root, environment, signal })
}

export function observeMcpClient(client, observe) {
  return { async callTool(request, options) {
    await observe?.({ phase: 'STARTED', name: request.name, args: request.arguments })
    const result = await client.callTool(request, options)
    let value = result.structuredContent
    if (!value) {
      const blocks = result.content?.filter(item => item.type === 'text')
      if (blocks?.length === 1) { try { value = JSON.parse(blocks[0].text) } catch { /* Existing adapter rejects invalid JSON. */ } }
    }
    if (result.isError || value?.errorCode) await observe?.({ phase: 'REJECTED', name: request.name })
    else if (value) await observe?.({ phase: 'FINISHED', name: request.name, args: request.arguments, result: value })
    return result
  } }
}

export function createArtifactProxy({ client, harnessUrl, fetchFn = fetch }) {
  const base = new URL(harnessUrl)
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password) throw new WorkbenchError('AGENT_HARNESS_URL_INVALID', 400)
  return async ({ artifactId, signal }) => {
    const response = await client.callTool({ name: 'artifact_download_grant', arguments: { artifactId } },{signal})
    let grant
    try { grant = JSON.parse(response.content.find(item => item.type === 'text').text) } catch { throw new WorkbenchError('AGENT_ARTIFACT_GRANT_INVALID', 503) }
    if (response.isError || grant.artifactId !== artifactId || !/^[a-f0-9]{64}$/.test(grant.sha256) ||
        !Number.isInteger(grant.byteSize) || grant.byteSize < 0 || grant.byteSize > 64 * 1024 * 1024 || typeof grant.displayName !== 'string') throw new WorkbenchError('AGENT_ARTIFACT_GRANT_INVALID', 503)
    let target
    try { target = new URL(grant.href) } catch { throw new WorkbenchError('AGENT_ARTIFACT_GRANT_INVALID', 503) }
    if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
      target.username || target.password || target.search || target.hash || !/^\/v1\/i10\/artifacts\/download_[0-9a-f-]{36}$/.test(target.pathname)) throw new WorkbenchError('AGENT_ARTIFACT_GRANT_INVALID', 503)
    // Pin the configured loopback origin; never follow a grant/HTTP redirect to another destination.
    const downloaded = await fetchFn(new URL(target.pathname, base), { redirect: 'error', signal })
    if (!downloaded.ok) throw new WorkbenchError('AGENT_ARTIFACT_DOWNLOAD_FAILED', 503)
    const chunks = []; let length = 0
    for await (const chunk of downloaded.body ?? []) {
      length += chunk.byteLength
      if (length > grant.byteSize) throw new WorkbenchError('AGENT_ARTIFACT_SIZE_INVALID', 503)
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    if (length !== grant.byteSize || digest(bytes) !== grant.sha256) throw new WorkbenchError('AGENT_ARTIFACT_HASH_INVALID', 503)
    return { bytes, filename: grant.displayName, sha256: grant.sha256 }
  }
}

export async function createEnvironmentWorkbench({ productRoot, env } = {}) {
  const root = path.resolve(productRoot || fileURLToPath(new URL('../..', import.meta.url)))
  const environment = env ?? lifecycle.environmentWithRuntimeFile({ root, environment: process.env })
  const namespace = environment.HENGZHUN_AGENT_NAMESPACE
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(namespace) || namespace !== (environment.HENGZHUN_NAMESPACE || 'hengzhun-local')) throw new WorkbenchError('AGENT_NAMESPACE_MISMATCH', 400)
  if (!path.isAbsolute(environment.HENGZHUN_AGENT_SESSION_ROOT || '')) throw new WorkbenchError('AGENT_SESSION_ROOT_REQUIRED', 400)
  const metadata = await connectWorkbenchMetadata({ url: environment.HENGZHUN_MCP_URL, token: environment.HENGZHUN_MCP_TOKEN })
  let client
  let sessionPersistence
  try {
    client = await connectMcpRuntime({ url: environment.HENGZHUN_MCP_URL, token: environment.HENGZHUN_MCP_TOKEN })
    const sessionRoot = environment.HENGZHUN_AGENT_SESSION_ROOT
    sessionPersistence = await connectSessionPersistence({url:environment.HENGZHUN_MCP_URL,token:environment.HENGZHUN_MCP_TOKEN})
    const sessionStore = await new EncryptedSessionStore({ persistence:sessionPersistence }).initialize()
    const operationStore = await new EncryptedOperationStore({ root: path.join(sessionRoot, 'operations-v1') }).initialize()
    const keyStore = new ModelKeyStore({ root: path.join(sessionRoot, 'model-keys-v1') })
    const spec = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli/managed-process-spec-v1.json'), 'utf8'))
    const harnessUrl = environment.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788'
    const forModel = profile => ({ ...environment, HENGZHUN_MODEL_NAME: profile.model, HENGZHUN_MODEL_BASE_URL: profile.baseUrl })
    const identityFor = profile => releaseV4.currentReleaseIdentityV4({ productRoot: root,
      modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(forModel(profile)) }).identityHash
    const importAttachment = createHarnessAttachmentImporter({ harnessUrl, serviceToken: environment.HENGZHUN_SERVICE_TOKEN })
    const app = createWorkbenchApplication({ metadata, keyStore, namespace, identityFor, importAttachment,
      probeModel: config => probeConfiguredModel({ environment: { ...forModel({ model: config.model, baseUrl: config.baseURL }), HENGZHUN_MODEL_API_KEY: config.apiKey } }),
      async readiness({ profile, modelConfig, releaseIdentityHash, signal }) {
        const selected = { ...forModel(profile), HENGZHUN_MODEL_API_KEY: modelConfig.apiKey }
        return probeWorkbenchReadiness({ root, environment: selected, releaseIdentityHash, signal })
      },
      serviceFor: async ({ modelConfig, releaseIdentityHash, observe, onCheckpoint }) => createProductionService({
        sessionStore, operationStore, modelConfig, releaseIdentityHash, namespace, onCheckpoint,
        recordModelResponse: modelResponseEvidenceWriter(root),
        mcpClient: observeMcpClient(client, observe), directExecution: true,
        writeGate: async () => lifecycle.assertFlowiseAbsent(spec, lifecycle.discoverFlowiseObservation()),
        attachmentImporter: importAttachment,
        doctorProbe: ({ signal } = {}) => probeProductReadiness({ root, signal, environment: { ...environment,
          HENGZHUN_MODEL_NAME: modelConfig.model, HENGZHUN_MODEL_BASE_URL: modelConfig.baseURL, HENGZHUN_MODEL_API_KEY: modelConfig.apiKey } }),
      }),
      downloadArtifact: createArtifactProxy({ client, harnessUrl }),
    })
    const models = (await app.listAgentModels()).models
    if (!models.length && environment.HENGZHUN_MODEL_NAME && environment.HENGZHUN_MODEL_BASE_URL && environment.HENGZHUN_MODEL_API_KEY) {
      const profile = await app.createAgentModel({ displayName: '当前本机模型', model: environment.HENGZHUN_MODEL_NAME,
        baseUrl: environment.HENGZHUN_MODEL_BASE_URL, apiKey: environment.HENGZHUN_MODEL_API_KEY })
      await app.setDefaultAgentModel({ modelId: profile.id, version: profile.version })
    }
    return { ...app, async close() { await app.close(); await client.close(); await sessionPersistence.close() } }
  } catch (error) {
    await metadata.close(); await client?.close(); await sessionPersistence?.close()
    throw error
  }
}
