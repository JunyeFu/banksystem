import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { createPersistentControllerRuntimeV2 } from '../../controller/src/controller-runtime.mjs'
import { EncryptedOperationStore } from '../../controller/src/operation-store.mjs'
import { connectMcpRuntime, createMcpControllerAdapters, stableHash } from '../../controller/src/runtime-adapters.mjs'
import { EncryptedSessionStore } from '../../controller/src/session-store.mjs'
import { CliError, EXIT } from './contracts.mjs'

const require = createRequire(import.meta.url)
const lifecycle = require('../../scripts/i10-agent-lifecycle.cjs')
const releaseV4 = require('../../scripts/i10-release-identity-v4.cjs')

const HASH = /^[a-f0-9]{64}$/
const BOOTSTRAP_TTL_MS = 300_000
const CREDENTIAL_TTL_MS = 300_000
const OPERATION_ID = /^operation-[a-f0-9]{32}$/
const CREDENTIAL_SESSION_ID = /^credsession_[0-9a-f-]{36}$/

function serviceError(code, exitCode = EXIT.FAILURE) {
  return new CliError(code, exitCode)
}

function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw serviceError(code, EXIT.RUNTIME_UNAVAILABLE)
  return value
}

export function createHarnessAttachmentImporter({ harnessUrl, serviceToken }) {
  const baseUrl = new URL(requireText(harnessUrl, 'AGENT_HARNESS_URL_REQUIRED'))
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname)) throw serviceError('AGENT_HARNESS_NOT_LOOPBACK', EXIT.RUNTIME_UNAVAILABLE)
  return async ({ bytes, nameBase64Url, sha256, signal }) => {
    if (!Buffer.isBuffer(bytes) || !/^[A-Za-z0-9_-]+$/.test(String(nameBase64Url || '')) || !HASH.test(String(sha256 || ''))) {
      throw serviceError('ATTACHMENT_DESCRIPTOR_INVALID', EXIT.INPUT_INVALID)
    }
    let response
    try {
      response = await fetch(new URL('/v1/i10/attachments:import', baseUrl), {
        method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${serviceToken}`, 'content-type': 'application/octet-stream',
          'x-hengzhun-filename-base64url': nameBase64Url, 'x-hengzhun-attachment-purpose': 'CLI_CASE_ATTACHMENT',
          'x-hengzhun-content-sha256': sha256,
        },
        body: bytes,
      })
    } catch { throw serviceError('ATTACHMENT_IMPORT_TRANSPORT_FAILED', EXIT.RUNTIME_UNAVAILABLE) }
    let value
    try { value = await response.json() } catch { throw serviceError('ATTACHMENT_IMPORT_RESPONSE_INVALID') }
    if (!response.ok || value?.schemaVersion !== 'AttachmentReceiptV1' || typeof value.attachmentRef !== 'string') {
      throw serviceError('ATTACHMENT_IMPORT_FAILED')
    }
    return { attachmentRef: value.attachmentRef, sha256: value.sha256, size: value.size }
  }
}

export function createLocalCaptureLauncher({ spawnFactory = spawn } = {}) {
  return async (value) => {
    if (typeof value !== 'string' || value.length > 2048) throw serviceError('CREDENTIAL_CAPTURE_URL_INVALID')
    let url
    try { url = new URL(value) } catch { throw serviceError('CREDENTIAL_CAPTURE_URL_INVALID') }
    const fragment = new URLSearchParams(url.hash.slice(1))
    if (
      url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || !CREDENTIAL_SESSION_ID.test(url.pathname.split('/').at(-2) || '') ||
      !/^\/v1\/i10\/credentials\/credsession_[0-9a-f-]{36}\/form$/.test(url.pathname) ||
      fragment.size !== 1 || typeof fragment.get('token') !== 'string' ||
      fragment.get('token').length < 32 || fragment.get('token').length > 256
    ) throw serviceError('CREDENTIAL_CAPTURE_URL_FORBIDDEN')
    await new Promise((resolve, reject) => {
      let child
      try {
        child = spawnFactory('rundll32.exe', ['url.dll,FileProtocolHandler', url.href], {
          detached: true, stdio: 'ignore', windowsHide: false,
        })
      } catch { reject(serviceError('CREDENTIAL_CAPTURE_LAUNCH_FAILED')); return }
      child.once('spawn', () => { child.unref(); resolve() })
      child.once('error', () => reject(serviceError('CREDENTIAL_CAPTURE_LAUNCH_FAILED')))
    })
  }
}

function resultForCli(result, sessionId) {
  if (result.status === 'AWAITING_USER' && result.approval) {
    return { status: 'AWAITING_USER', sessionId, journeyId: result.journeyId, approval: {
      proposalId: result.approval.proposalId,
      contentHash: result.approval.contentHash,
      risk: result.approval.risk,
      expiresAt: result.approval.expiresAt,
      summary: result.approval.summary,
    } }
  }
  if (result.status === 'AWAITING_USER') {
    return { status: 'NEEDS_INPUT', sessionId, journeyId: result.journeyId, question: result.message }
  }
  if (result.status === 'COMPLETED') {
    return { status: 'COMPLETED', sessionId, journeyId: result.journeyId, answer: result.message }
  }
  throw serviceError(result.message || 'CONTROLLER_FAILED_CLOSED')
}

function approvalEvent(result) {
  return {
    type: 'APPROVAL_PENDING',
    proposalId: result.approval.proposalId,
    contentHash: result.approval.contentHash,
    expectedVersion: result.approval.expectedVersion,
    risk: result.approval.risk,
    expiresAt: result.approval.expiresAt,
    summary: result.approval.summary,
  }
}

function hasUnresolvedApproval(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'APPROVAL_PENDING') {
      return !events.slice(index + 1).some((candidate) =>
        ['APPROVAL_REJECTED', 'APPROVAL_RESOLVED', 'JOURNEY_BOOTSTRAP_RESOLVED'].includes(candidate?.type) &&
        candidate.proposalId === event.proposalId)
    }
  }
  return false
}

function bootstrapProposal({ namespace, threadId, journeyId, sessionId, releaseIdentityHash, input, attachmentRefs, now }) {
  const args = {
    sessionRef: sessionId,
    interactionContractVersion: 'v6',
    requestIntent: 'CASE_AUTHORING',
    inputType: attachmentRefs.length ? 'CASE_FILE' : 'NATURAL_LANGUAGE',
    naturalLanguage: input,
    ...(attachmentRefs[0] ? { attachmentRef: attachmentRefs[0] } : {}),
    ...(attachmentRefs.length > 1 ? { supportingImages: attachmentRefs.slice(1).map((attachmentRef) => ({ attachmentRef })) } : {}),
  }
  const argumentsHash = stableHash(args)
  const payload = {
    namespace, threadId, journeyId, sessionId, releaseIdentityHash,
    expectedVersion: 0, summary: 'Create the authoritative Journey for this new CLI session.',
    risk: 'LOW', toolName: 'journey_prepare', argumentsHash,
    expiresAt: new Date(now() + BOOTSTRAP_TTL_MS).toISOString(),
  }
  const contentHash = stableHash(payload)
  return Object.freeze({ proposalId: `proposal-${contentHash.slice(0, 24)}`, contentHash, ...payload, args })
}

function credentialProposal({ namespace, operationId, releaseIdentityHash, now }) {
  const args = { label: 'Hengzhun CLI credential', sessionRef: operationId }
  const argumentsHash = stableHash(args)
  const payload = {
    namespace, operationId, operationKind: 'CREDENTIAL_ENROLLMENT', releaseIdentityHash,
    expectedVersion: 0, summary: 'Open one local DPAPI credential capture session.',
    risk: 'HIGH', toolName: 'credential_session_create', argumentsHash,
    expiresAt: new Date(now() + CREDENTIAL_TTL_MS).toISOString(),
  }
  const contentHash = stableHash(payload)
  return Object.freeze({ proposalId: `proposal-${contentHash.slice(0, 24)}`, contentHash, ...payload, args })
}

function safeSession(entry) {
  return {
    sessionId: entry.sessionId,
    revision: entry.revision,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt,
    status: entry.status,
    releaseIdentityHash: entry.releaseIdentityHash,
  }
}

function projectJourneyEvidence(value, requestedJourneyId) {
  const cards = Array.isArray(value?.artifactCards) ? value.artifactCards.map((card) => ({
    artifactId: requireText(card?.artifactId, 'EVIDENCE_ARTIFACT_ID_INVALID'),
    displayName: requireText(card?.displayName, 'EVIDENCE_DISPLAY_NAME_INVALID').slice(0, 240),
    ...(typeof card.mediaType === 'string' ? { mediaType: card.mediaType.slice(0, 160) } : {}),
    ...(HASH.test(String(card.sha256 || '')) ? { sha256: card.sha256 } : {}),
    ...(Number.isInteger(card.size) && card.size >= 0 ? { size: card.size } : {}),
    downloadGrantRequired: card.downloadGrantRequired === true,
  })) : []
  const referenceFields = [
    'caseId', 'preparationId', 'candidateId', 'certificateId', 'scriptId', 'scriptHash', 'planId',
    'confirmedDecisionEventId', 'taskId', 'runId', 'scheduleId', 'inboxId', 'resultArtifactId',
  ]
  const references = {}
  for (const field of referenceFields) {
    const item = value?.references?.[field]
    if (typeof item === 'string' && item.length >= 8 && item.length <= 160) references[field] = item
  }
  return {
    schemaVersion: 'hengzhun-cli-evidence-view/v1',
    journeyId: value?.journeyId ?? requestedJourneyId,
    version: Number.isInteger(value?.version) ? value.version : 0,
    status: typeof value?.status === 'string' ? value.status : 'UNKNOWN',
    terminal: value?.terminal === true,
    references,
    artifactCards: cards,
  }
}

export function createProductionService({
  sessionStore,
  operationStore,
  releaseIdentityHash,
  modelConfig,
  modelFactory,
  mcpClient,
  namespace,
  journeyResolver,
  attachmentImporter,
  captureLauncher,
  writeGate,
  doctorProbe,
  threadIdFactory = () => `thread-${randomUUID()}`,
  sessionIdFactory,
  operationIdFactory,
  now = () => Date.now(),
} = {}) {
  if (!sessionStore?.create || !sessionStore?.load || !sessionStore?.list || !HASH.test(String(releaseIdentityHash))) {
    throw serviceError('AGENT_SERVICE_SESSION_CONFIG_INVALID', EXIT.RUNTIME_UNAVAILABLE)
  }
  requireText(namespace, 'AGENT_SERVICE_NAMESPACE_REQUIRED')
  if (journeyResolver !== undefined && typeof journeyResolver !== 'function') {
    throw serviceError('AGENT_SERVICE_JOURNEY_RESOLVER_INVALID', EXIT.RUNTIME_UNAVAILABLE)
  }
  if (typeof writeGate !== 'function') {
    throw serviceError('AGENT_SERVICE_RUNTIME_CONFIG_INVALID', EXIT.RUNTIME_UNAVAILABLE)
  }

  const gate = async () => {
    try { await writeGate() } catch (error) {
      throw serviceError(error?.code === 'UNEXPECTED_FLOWISE_BLOCKS_WRITES'
        ? 'UNEXPECTED_FLOWISE_BLOCKS_WRITES' : 'FLOWISE_OBSERVATION_UNAVAILABLE')
    }
  }
  const runtimeFor = (sessionId) => createPersistentControllerRuntimeV2({
    sessionStore, sessionId, modelConfig, modelFactory, mcpClient, releaseIdentityHash, now,
  })

  const resumeCredentialOperation = async ({ operationId, proposalId, approved, signal }) => {
    if (!operationStore?.load || !operationStore?.complete) throw serviceError('CREDENTIAL_ENROLLMENT_NOT_BOUND', EXIT.RUNTIME_UNAVAILABLE)
    const payload = await operationStore.load(operationId, {
      expectedReleaseIdentityHash: releaseIdentityHash, expectedKind: 'CREDENTIAL_ENROLLMENT',
    })
    if (payload.status !== 'ACTIVE') throw serviceError('APPROVAL_ALREADY_RESOLVED')
    const pendingIndex = payload.events.findLastIndex((event) => event?.type === 'APPROVAL_PENDING' && event.proposalId === proposalId)
    const pending = pendingIndex >= 0 ? payload.events[pendingIndex] : undefined
    if (!pending || pending.source !== 'CREDENTIAL_ENROLLMENT') throw serviceError('APPROVAL_PROPOSAL_NOT_FOUND')
    if (!approved) {
      await operationStore.complete(operationId, releaseIdentityHash, { type: 'APPROVAL_REJECTED', proposalId })
      return { status: 'REJECTED', sessionId: operationId, operationKind: payload.operationKind }
    }
    if (now() >= Date.parse(pending.expiresAt)) throw serviceError('AGENT_CONTROLLER_APPROVAL_EXPIRED')
    const args = await operationStore.getProposalArguments(operationId, releaseIdentityHash, proposalId)
    if (!args || stableHash(args) !== pending.argumentsHash) throw serviceError('CREDENTIAL_ENROLLMENT_ARGUMENTS_UNAVAILABLE')
    const result = await createMcpControllerAdapters({ client: mcpClient }).invoke({
      toolName: 'credential_session_create', arguments: args, argumentsHash: pending.argumentsHash,
      contentHash: pending.contentHash, expectedVersion: 0, risk: 'HIGH',
      idempotencyKey: createHash('sha256').update(`${operationId}\0${proposalId}`).digest('hex'),
    }, { signal })
    const credentialSessionId = requireText(result.sessionId, 'CREDENTIAL_SESSION_ID_INVALID')
    if (!CREDENTIAL_SESSION_ID.test(credentialSessionId) || typeof result.captureUrl !== 'string') throw serviceError('CREDENTIAL_SESSION_RESULT_INVALID')
    await operationStore.complete(operationId, releaseIdentityHash, {
      type: 'APPROVAL_RESOLVED', proposalId, credentialSessionId,
      harnessVersion: result.harnessVersion, status: result.status,
      ...(typeof result.expiresAt === 'string' ? { expiresAt: result.expiresAt } : {}),
    })
    if (typeof captureLauncher !== 'function') throw serviceError('CREDENTIAL_CAPTURE_LAUNCHER_UNAVAILABLE', EXIT.RUNTIME_UNAVAILABLE)
    await captureLauncher(result.captureUrl)
    return {
      status: 'COMPLETED', sessionId: operationId, operationKind: payload.operationKind,
      answer: 'Local credential capture form opened.',
    }
  }

  return Object.freeze({
    async start({ input, attachmentRefs = [], noSession, signal }) {
      if (noSession) throw serviceError('DURABLE_SESSION_REQUIRED', EXIT.INPUT_INVALID)
      await gate()
      const threadId = threadIdFactory()
      const resolvedJourneyId = await journeyResolver?.({ input, attachmentRefs, signal })
      const journeyId = resolvedJourneyId || `journey-bootstrap-${randomUUID()}`
      const created = await sessionStore.create({
        namespace, threadId, journeyId, releaseIdentityHash,
        events: [{ type: 'RUN_STARTED', attachmentCount: attachmentRefs.length }],
        ...(sessionIdFactory ? { sessionId: sessionIdFactory() } : {}),
      })
      if (!resolvedJourneyId) {
        const proposal = bootstrapProposal({
          namespace, threadId, journeyId, sessionId: created.sessionId, releaseIdentityHash,
          input, attachmentRefs, now,
        })
        await sessionStore.putProposalArguments(created.sessionId, releaseIdentityHash, proposal.proposalId, proposal.args)
        await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, {
          type: 'APPROVAL_PENDING', source: 'JOURNEY_BOOTSTRAP', proposalId: proposal.proposalId,
          contentHash: proposal.contentHash, argumentsHash: proposal.argumentsHash,
          expectedVersion: 0, risk: proposal.risk, expiresAt: proposal.expiresAt, summary: proposal.summary,
        })
        return resultForCli({ status: 'AWAITING_USER', journeyId, approval: proposal }, created.sessionId)
      }
      const runtime = await runtimeFor(created.sessionId)
      const result = await runtime.start({ requestId: `request-${randomUUID()}`, namespace, threadId, journeyId, userInput: input })
      if (result.approval) await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, approvalEvent(result))
      else await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, { type: 'TURN_FINISHED', status: result.status })
      return resultForCli(result, created.sessionId)
    },

    async resume({ sessionId, proposalId, approved, signal }) {
      await gate()
      if (signal?.aborted) throw Object.assign(new Error('ABORTED'), { name: 'AbortError' })
      if (OPERATION_ID.test(String(sessionId || ''))) {
        return resumeCredentialOperation({ operationId: sessionId, proposalId, approved, signal })
      }
      const payload = await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
      const pendingIndex = payload.events.findLastIndex((event) => event?.type === 'APPROVAL_PENDING' && event.proposalId === proposalId)
      const pending = pendingIndex >= 0 ? payload.events[pendingIndex] : undefined
      if (!pending) throw serviceError('APPROVAL_PROPOSAL_NOT_FOUND')
      if (payload.events.slice(pendingIndex + 1).some((event) =>
        ['APPROVAL_REJECTED', 'APPROVAL_RESOLVED'].includes(event?.type) && event.proposalId === proposalId)) {
        throw serviceError('APPROVAL_ALREADY_RESOLVED')
      }
      if (!approved) {
        await sessionStore.deleteProposalArguments(sessionId, releaseIdentityHash, proposalId)
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, { type: 'APPROVAL_REJECTED', proposalId })
        return { status: 'REJECTED', sessionId, journeyId: payload.journeyId }
      }
      if (pending.source === 'JOURNEY_BOOTSTRAP') {
        if (now() >= Date.parse(pending.expiresAt)) throw serviceError('AGENT_CONTROLLER_APPROVAL_EXPIRED')
        const args = await sessionStore.getProposalArguments(sessionId, releaseIdentityHash, proposalId)
        if (!args || stableHash(args) !== pending.argumentsHash) throw serviceError('AGENT_BOOTSTRAP_ARGUMENTS_UNAVAILABLE')
        const adapter = createMcpControllerAdapters({ client: mcpClient })
        const bootstrapped = await adapter.invoke({
          toolName: 'journey_prepare', arguments: args, argumentsHash: pending.argumentsHash,
          contentHash: pending.contentHash, expectedVersion: 0, risk: 'LOW',
          idempotencyKey: createHash('sha256').update(`${sessionId}\0${proposalId}`).digest('hex'),
        }, { signal })
        const actualJourneyId = requireText(bootstrapped.journeyId, 'AGENT_BOOTSTRAP_JOURNEY_INVALID')
        await sessionStore.rebindJourney(sessionId, releaseIdentityHash, {
          expectedJourneyId: payload.journeyId, journeyId: actualJourneyId,
        })
        await sessionStore.deleteProposalArguments(sessionId, releaseIdentityHash, proposalId)
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
          type: 'JOURNEY_BOOTSTRAP_RESOLVED', proposalId, journeyId: actualJourneyId,
          harnessVersion: bootstrapped.harnessVersion,
        })
        const runtime = await runtimeFor(sessionId)
        const result = await runtime.start({
          requestId: `request-${randomUUID()}`, namespace: payload.namespace,
          threadId: payload.threadId, journeyId: actualJourneyId, userInput: args.naturalLanguage,
        })
        if (result.approval) await sessionStore.appendEvent(sessionId, releaseIdentityHash, approvalEvent(result))
        else await sessionStore.appendEvent(sessionId, releaseIdentityHash, { type: 'TURN_FINISHED', status: result.status })
        return resultForCli(result, sessionId)
      }
      const runtime = await runtimeFor(sessionId)
      const result = await runtime.resume({
        requestId: `request-${randomUUID()}`, namespace: payload.namespace,
        threadId: payload.threadId, journeyId: payload.journeyId,
        decision: {
          approved: true, proposalId, contentHash: pending.contentHash,
          expectedVersion: pending.expectedVersion,
          idempotencyKey: createHash('sha256').update(`${sessionId}\0${proposalId}`).digest('hex'),
        },
      })
      await sessionStore.appendEvent(sessionId, releaseIdentityHash, { type: 'APPROVAL_RESOLVED', proposalId, status: result.status })
      return resultForCli(result, sessionId)
    },

    async continueSession({ sessionId, input, attachmentRefs = [], signal }) {
      await gate()
      if (attachmentRefs.length) throw serviceError('ATTACHMENT_REQUIRES_NEW_SESSION', EXIT.INPUT_INVALID)
      const source = await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
      if (source.status !== 'ACTIVE') throw serviceError('SESSION_NOT_ACTIVE')
      if (hasUnresolvedApproval(source.events)) throw serviceError('APPROVAL_DECISION_REQUIRED', EXIT.APPROVAL_REQUIRED)
      const threadId = threadIdFactory()
      const forked = await sessionStore.fork(sessionId, {
        releaseIdentityHash, threadId,
        ...(sessionIdFactory ? { sessionIdFactory } : {}),
      })
      await sessionStore.appendEvent(forked.sessionId, releaseIdentityHash, { type: 'RUN_CONTINUED', sourceSessionId: sessionId })
      const runtime = await runtimeFor(forked.sessionId)
      const result = await runtime.start({
        requestId: `request-${randomUUID()}`, namespace: source.namespace,
        threadId, journeyId: source.journeyId, userInput: input,
      })
      if (result.approval) await sessionStore.appendEvent(forked.sessionId, releaseIdentityHash, approvalEvent(result))
      else await sessionStore.appendEvent(forked.sessionId, releaseIdentityHash, { type: 'TURN_FINISHED', status: result.status })
      return resultForCli(result, forked.sessionId)
    },

    async importAttachment(descriptor) {
      await gate()
      if (typeof attachmentImporter !== 'function') throw serviceError('ATTACHMENT_IMPORTER_UNAVAILABLE', EXIT.RUNTIME_UNAVAILABLE)
      return attachmentImporter(descriptor)
    },
    async sessionList() { return { sessions: (await sessionStore.list()).map(safeSession) } },
    async sessionShow({ sessionId }) {
      const entry = (await sessionStore.list()).find((item) => item.sessionId === sessionId)
      if (!entry) throw serviceError('SESSION_NOT_FOUND')
      return safeSession(entry)
    },
    async sessionFork({ sessionId }) {
      await gate()
      const created = await sessionStore.fork(sessionId, {
        releaseIdentityHash, threadId: threadIdFactory(),
        ...(sessionIdFactory ? { sessionIdFactory } : {}),
      })
      return safeSession((await sessionStore.list()).find((item) => item.sessionId === created.sessionId))
    },
    async sessionArchive({ sessionId }) { await gate(); return safeSession(await sessionStore.archive(sessionId, releaseIdentityHash)) },
    async journeyShow({ journeyId, signal }) {
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      const value = await adapter.readJourney(journeyId, { signal })
      return { journeyId: value.journeyId ?? journeyId, version: value.version, status: value.status ?? 'UNKNOWN' }
    },
    async evidence({ journeyId, signal }) {
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      return projectJourneyEvidence(await adapter.readJourney(journeyId, { signal }), journeyId)
    },
    async credentialEnroll() {
      await gate()
      if (!operationStore?.create || !operationStore?.putProposalArguments || !operationStore?.appendEvent) {
        throw serviceError('CREDENTIAL_ENROLLMENT_NOT_BOUND', EXIT.RUNTIME_UNAVAILABLE)
      }
      const created = await operationStore.create({
        namespace, operationKind: 'CREDENTIAL_ENROLLMENT', releaseIdentityHash,
        events: [{ type: 'OPERATION_STARTED' }],
        ...(operationIdFactory ? { operationId: operationIdFactory() } : {}),
      })
      const proposal = credentialProposal({ namespace, operationId: created.operationId, releaseIdentityHash, now })
      await operationStore.putProposalArguments(created.operationId, releaseIdentityHash, proposal.proposalId, proposal.args)
      await operationStore.appendEvent(created.operationId, releaseIdentityHash, {
        type: 'APPROVAL_PENDING', source: 'CREDENTIAL_ENROLLMENT', proposalId: proposal.proposalId,
        contentHash: proposal.contentHash, argumentsHash: proposal.argumentsHash,
        expectedVersion: 0, risk: proposal.risk, expiresAt: proposal.expiresAt, summary: proposal.summary,
      })
      return {
        status: 'AWAITING_USER', sessionId: created.operationId, operationKind: 'CREDENTIAL_ENROLLMENT',
        approval: proposal,
      }
    },
    async doctor() { return doctorProbe ? doctorProbe() : { status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true } },
    async serviceStatus() { return { status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true } },
    async version() { return { version: '0.2.0-offline-candidate', runtime: 'CONTROLLER_V2', releaseIdentityHash } },
  })
}

export async function createEnvironmentProductionService({ env = process.env, productRoot } = {}) {
  const root = path.resolve(productRoot || fileURLToPath(new URL('../..', import.meta.url)))
  const effectiveEnv = lifecycle.environmentWithRuntimeFile({ root, environment: env })
  const sessionRoot = requireText(effectiveEnv.HENGZHUN_AGENT_SESSION_ROOT, 'AGENT_SESSION_ROOT_REQUIRED')
  if (!path.isAbsolute(sessionRoot)) throw serviceError('AGENT_SESSION_ROOT_INVALID', EXIT.RUNTIME_UNAVAILABLE)
  const modelName = requireText(effectiveEnv.HENGZHUN_MODEL_NAME, 'AGENT_MODEL_NAME_REQUIRED')
  const baseURL = requireText(effectiveEnv.HENGZHUN_MODEL_BASE_URL, 'AGENT_MODEL_BASE_URL_REQUIRED')
  const modelApiKey = requireText(effectiveEnv.HENGZHUN_MODEL_API_KEY, 'AGENT_MODEL_API_KEY_REQUIRED')
  const mcpUrl = requireText(effectiveEnv.HENGZHUN_MCP_URL, 'AGENT_MCP_URL_REQUIRED')
  const mcpToken = requireText(effectiveEnv.HENGZHUN_MCP_TOKEN, 'AGENT_MCP_TOKEN_REQUIRED')
  const serviceToken = requireText(effectiveEnv.HENGZHUN_SERVICE_TOKEN, 'AGENT_SERVICE_TOKEN_REQUIRED')
  const harnessUrl = effectiveEnv.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788'
  const configuredNamespace = requireText(effectiveEnv.HENGZHUN_AGENT_NAMESPACE, 'AGENT_NAMESPACE_REQUIRED')
  const configuredJourneyId = typeof effectiveEnv.HENGZHUN_AGENT_JOURNEY_ID === 'string' && effectiveEnv.HENGZHUN_AGENT_JOURNEY_ID.trim()
    ? effectiveEnv.HENGZHUN_AGENT_JOURNEY_ID.trim() : undefined
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'managed-process-spec-v1.json'), 'utf8'))
  try { lifecycle.assertFlowiseAbsent(spec, lifecycle.discoverFlowiseObservation()) } catch (error) {
    throw serviceError(error?.code === 'UNEXPECTED_FLOWISE_BLOCKS_WRITES'
      ? 'UNEXPECTED_FLOWISE_BLOCKS_WRITES' : 'FLOWISE_OBSERVATION_UNAVAILABLE')
  }
  const modelConfigIdentity = {
    bindingStatus: 'BOUND', providerProtocol: 'OPENAI_COMPATIBLE', profile: 'CONTROL_GENERIC', modelName,
    baseUrlHash: createHash('sha256').update(baseURL).digest('hex'), temperature: 0, streaming: false, toolMode: 'NONE',
  }
  const identity = releaseV4.currentReleaseIdentityV4({ productRoot: root, modelConfigIdentity })
  const store = await new EncryptedSessionStore({ root: sessionRoot }).initialize()
  const operationStore = await new EncryptedOperationStore({ root: path.join(sessionRoot, 'operations-v1') }).initialize()
  const mcpClient = await connectMcpRuntime({ url: mcpUrl, token: mcpToken })
  return createProductionService({
    sessionStore: store, operationStore, releaseIdentityHash: identity.identityHash, mcpClient,
    modelConfig: { apiKey: modelApiKey, baseURL, model: modelName },
    namespace: configuredNamespace,
    attachmentImporter: createHarnessAttachmentImporter({ harnessUrl, serviceToken }),
    captureLauncher: createLocalCaptureLauncher(),
    ...(configuredJourneyId ? { journeyResolver: async () => configuredJourneyId } : {}),
    writeGate: async () => lifecycle.assertFlowiseAbsent(spec, lifecycle.discoverFlowiseObservation()),
    doctorProbe: () => lifecycle.doctor({ root }),
  })
}

export function createLazyEnvironmentService(options = {}) {
  let pending
  const get = () => (pending ??= createEnvironmentProductionService(options))
  const root = path.resolve(options.productRoot || fileURLToPath(new URL('../..', import.meta.url)))
  const environment = lifecycle.environmentWithRuntimeFile({ root, environment: options.env || process.env })
  return new Proxy({}, { get: (_target, key) => {
    if (key === 'doctor') return async () => lifecycle.doctor({ root })
    if (key === 'version') return async () => {
      const bound = typeof environment.HENGZHUN_MODEL_NAME === 'string' && environment.HENGZHUN_MODEL_NAME.trim() &&
        typeof environment.HENGZHUN_MODEL_BASE_URL === 'string' && environment.HENGZHUN_MODEL_BASE_URL.trim()
      const identity = releaseV4.currentReleaseIdentityV4({
        productRoot: root,
        ...(bound ? { modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) } : {}),
      })
      return {
        version: '0.2.0-offline-candidate', runtime: bound ? 'CONTROLLER_V2_BOUND' : 'CONTROLLER_V2_UNBOUND',
        releaseIdentityHash: identity.identityHash,
      }
    }
    return async (...args) => (await get())[key](...args)
  } })
}
