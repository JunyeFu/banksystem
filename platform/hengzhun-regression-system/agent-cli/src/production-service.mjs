import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { createPersistentControllerRuntimeV2 } from '../../controller/src/controller-runtime.mjs'
import { createJourneyCandidateAuthor, assertSafeAgentText } from '../../controller/src/journey-author.mjs'
import { EncryptedOperationStore } from '../../controller/src/operation-store.mjs'
import { connectMcpRuntime, createMcpControllerAdapters, createOpenAIJsonInvoker, stableHash } from '../../controller/src/runtime-adapters.mjs'
import { EncryptedSessionStore } from '../../controller/src/session-store.mjs'
import { connectSessionPersistence } from '../../controller/src/session-persistence.mjs'
import { CliError, EXIT } from './contracts.mjs'
import { probeProductReadiness } from './product-doctor.mjs'

const require = createRequire(import.meta.url)
const lifecycle = require('../../scripts/i10-agent-lifecycle.cjs')
const releaseV4 = require('../../scripts/i10-release-identity-v4.cjs')

const HASH = /^[a-f0-9]{64}$/
const BOOTSTRAP_TTL_MS = 300_000
const CREDENTIAL_TTL_MS = 300_000
const OPERATION_ID = /^operation-[a-f0-9]{32}$/
const CREDENTIAL_SESSION_ID = /^credsession_[0-9a-f-]{36}$/
const EXECUTION_POLL_MS = 750
const EXECUTION_WAIT_MS = 180_000

function serviceError(code, exitCode = EXIT.FAILURE) {
  return new CliError(code, exitCode)
}

export function modelResponseEvidenceWriter(root) {
  return value => {
    const directory = path.join(root, '.data/evidence/model-response-formats');
    fs.mkdirSync(directory, { recursive: true });
    const callId = randomUUID();
    fs.writeFileSync(path.join(directory, `${callId}.json`), JSON.stringify({
      schemaVersion: 'agent-model-response-receipt/v1', callId, recordedAt: new Date().toISOString(),
      evidenceClass: 'MODEL_PROTOCOL_DIAGNOSTIC', ...value,
    }, null, 2), { flag: 'wx' });
  };
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

function approvalEvent(result, source) {
  return {
    type: 'APPROVAL_PENDING',
    ...(source ? { source } : {}),
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

export function bootstrapInputFacts(input) {
  const goal = String(input || '').trim()
  const entryUrl = goal.match(/https?:\/\/[^\s，。；;]+/i)?.[0]
  const credentialRef = goal.match(/credential_[0-9a-f-]{36}/i)?.[0]
  const targetSystem = goal.match(/(?:目标系统|target system)\s*[:：]\s*([^。\r\n]{1,160})/i)?.[1]?.trim()
  const adapterSelection = goal.match(/(?:明确选择|使用|采用)\s*(?:本机)?(?:复兴银行)?(?:演示)?适配器\s*[（(]?\s*(fuxing-bank-demo|fuxing-bank-operations)\b\s*[）)]?/i)?.[1]?.toLowerCase()
  return { goal, entryUrl, targetSystem, credentialRef, ...(adapterSelection ? { adapterSelection } : {}) }
}

function naturalLanguageBootstrapInput(input) {
  const facts = bootstrapInputFacts(input)
  for (const [field, code] of [['entryUrl', 'JOURNEY_ENTRY_URL_INVALID'], ['targetSystem', 'JOURNEY_TARGET_SYSTEM_INVALID'], ['credentialRef', 'JOURNEY_CREDENTIAL_REF_INVALID']]) {
    if (!facts[field]) throw serviceError(code, EXIT.INPUT_INVALID)
  }
  return facts
}

function bootstrapProposal({ namespace, threadId, journeyId, sessionId, releaseIdentityHash, input, attachmentRefs, authorInput, draftJson, now }) {
  const args = {
    sessionRef: sessionId,
    interactionContractVersion: 'v6',
    requestIntent: 'CASE_AUTHORING',
    inputType: attachmentRefs.length ? 'CASE_FILE' : 'NATURAL_LANGUAGE',
    naturalLanguage: input,
    ...(!attachmentRefs.length ? {
      entryUrl: authorInput.entryUrl,
      targetSystem: authorInput.targetSystem,
      credentialRef: authorInput.credentialRef,
      draftJson,
      supportingImages: [],
      ...(authorInput.adapterSelection ? { adapterSelection: authorInput.adapterSelection } : {}),
    } : {}),
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

function sessionAuthority(payload, journey, { resumed = false } = {}) {
  if (journey?.journeyId !== payload.journeyId) throw serviceError('SESSION_JOURNEY_AUTHORITY_CONFLICT')
  return {
    sessionId: payload.sessionId,
    journeyId: journey.journeyId,
    journeyVersion: Number.isInteger(journey.version) ? journey.version : 0,
    status: typeof journey.status === 'string' ? journey.status : 'UNKNOWN',
    terminal: journey.terminal === true,
    resumable: journey.terminal !== true && payload.status === 'ACTIVE',
    resumed,
    releaseIdentityHash: payload.releaseIdentityHash,
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

function projectJourneyCandidate(value, requestedJourneyId) {
  const journeyId = requireText(value?.journeyId ?? requestedJourneyId, 'JOURNEY_CANDIDATE_ID_INVALID')
  if(value.stage==='NEEDS_INPUT'&&value.status==='NEEDS_INPUT')return {
    status:'NEEDS_INPUT',journeyId,revision:value.version,stage:value.stage,missingFields:value.missingFields,
    question:value.nextAction?.description??value.message,
  }
  const proposalId = requireText(value?.proposalId ?? value?.proposal?.proposalId, 'JOURNEY_CANDIDATE_PROPOSAL_INVALID')
  const contentHash = value?.proposalPayloadHash ?? value?.proposal?.payloadHash
  if (!HASH.test(String(contentHash || ''))) throw serviceError('JOURNEY_CANDIDATE_HASH_INVALID')
  if (!Number.isInteger(value?.version) || value.version < 1) throw serviceError('JOURNEY_CANDIDATE_VERSION_INVALID')
  if (value?.stage !== 'READY_FOR_CASE_APPROVAL' || value?.status !== 'AWAITING_USER') {
    throw serviceError('JOURNEY_CANDIDATE_NOT_READY')
  }
  const steps = Array.isArray(value?.caseDraft?.steps) ? value.caseDraft.steps.length : 0
  const assertions = Array.isArray(value?.caseDraft?.assertions) ? value.caseDraft.assertions.length : 0
  if (steps < 1 || assertions < 1) throw serviceError('JOURNEY_CANDIDATE_INVALID')
  return {
    status: 'AWAITING_USER', journeyId, revision: value.version, stage: value.stage,
    proposalId, contentHash, stepCount: steps, assertionCount: assertions,
  }
}

function projectJourneyDecision(value, { journeyId, approved }) {
  if (value?.journeyId !== journeyId || !Number.isInteger(value?.version)) throw serviceError('JOURNEY_DECISION_RESULT_INVALID')
  const expected = approved
    ? { stage: 'PROCESSING_AUTHORING', status: 'PROCESSING', decision: 'APPROVED' }
    : { stage: 'NEEDS_INPUT', status: 'NEEDS_INPUT', decision: 'REJECTED' }
  if (value.stage !== expected.stage || value.status !== expected.status) throw serviceError('JOURNEY_DECISION_RESULT_INVALID')
  return { journeyId, revision: value.version, stage: value.stage, status: value.status, decision: expected.decision }
}

export function createProductionService({
  sessionStore,
  operationStore,
  releaseIdentityHash,
  modelConfig,
  modelFactory,
  recordModelResponse,
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
  executionWaitMs = EXECUTION_WAIT_MS,
  executionPollMs = EXECUTION_POLL_MS,
  directExecution = false,
  onCheckpoint,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
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
  const authorCandidate = async (input, options) => {
    try {
      const invokeJson = createOpenAIJsonInvoker({ ...modelConfig, modelFactory,
        ...(recordModelResponse ? { onResponseEvidence: evidence => recordModelResponse({
          releaseIdentityHash, namespace, sessionId: options?.sessionId ?? null, evidence,
        }) } : {}),
      })
      return await createJourneyCandidateAuthor({ invokeJson }).author(input, options)
    } catch (error) {
      throw serviceError(error?.code || 'JOURNEY_AUTHOR_FAILED', error?.code?.startsWith('AGENT_ADAPTER_MODEL_')
        ? EXIT.RUNTIME_UNAVAILABLE : EXIT.FAILURE)
    }
  }
  const validateBankPool = (pool, adapterSelection) => {
    if(pool===undefined)return undefined
    const parsed=require('../../dist/harness/src/i10/schemas.js').bankValidationFixturesSchema.safeParse(pool)
    if(!parsed.success || adapterSelection!=='fuxing-bank-demo')throw serviceError('BANK_VALIDATION_POOL_INVALID',EXIT.INPUT_INVALID)
    return parsed.data
  }
  const bindBankPool = (draftJson, pool) => {
    if(pool===undefined)return draftJson
    const bound=require('../../dist/harness/src/i10/schemas.js').caseDraftSchema.safeParse({...draftJson,bankValidationFixtures:pool})
    if(!bound.success)throw serviceError('BANK_VALIDATION_FORMAL_BINDING_INVALID',EXIT.INPUT_INVALID)
    return bound.data
  }
  const executeMutation = async (adapter, { toolName, args, expectedVersion = 0, sessionId, signal }) => {
    const argumentsHash = stableHash(args)
    try {
      return await adapter.invoke({
        toolName, arguments: args, argumentsHash,
        contentHash: stableHash({ kind: 'CLI_JOURNEY_EXECUTE', releaseIdentityHash, toolName, argumentsHash }),
        expectedVersion, risk: 'HIGH',
        idempotencyKey: createHash('sha256').update(`journey-execute\0${sessionId}\0${toolName}\0${argumentsHash}`).digest('hex'),
      }, { signal })
    } catch (error) {
      const businessCode = error?.details?.businessCode
      if (typeof businessCode === 'string' && businessCode) {
        throw serviceError(businessCode, EXIT.EXECUTION_FAILED)
      }
      throw error
    }
  }

  const waitForJourneyStage = async (adapter, journeyId, acceptedStages, signal) => {
    const deadline = now() + executionWaitMs
    while (true) {
      const current = await adapter.readJourney(journeyId, { signal })
      if (acceptedStages.includes(current.stage)) return current
      if (current.stage === 'FAILED_ACTIONABLE' || current.status === 'FAILED') {
        throw serviceError(current?.error?.errorCode || 'JOURNEY_EXECUTION_FAILED', EXIT.EXECUTION_FAILED)
      }
      if (now() >= deadline) throw serviceError('JOURNEY_EXECUTION_WAIT_TIMEOUT', EXIT.RUNTIME_UNAVAILABLE)
      await sleep(executionPollMs)
    }
  }

  const waitForIngestStatus = async (adapter, ingestJobId, acceptedStatuses, signal) => {
    const deadline = now() + executionWaitMs
    while (true) {
      const current = await adapter.readIngest(ingestJobId, { signal })
      if (acceptedStatuses.includes(current.status)) return current
      if (['REJECTED', 'FAILED', 'EXPIRED_PURGED'].includes(current.status)) {
        throw serviceError(current.errorCode || 'I10_INGEST_FAILED', EXIT.EXECUTION_FAILED)
      }
      if (now() >= deadline) throw serviceError('I10_INGEST_WAIT_TIMEOUT', EXIT.RUNTIME_UNAVAILABLE)
      await sleep(executionPollMs)
    }
  }

  const waitForImageIngestStatus = async (adapter, imageIngestId, acceptedStatuses, signal) => {
    const deadline = now() + executionWaitMs
    while (true) {
      const current = await adapter.readImageIngest(imageIngestId, { signal })
      if (acceptedStatuses.includes(current.status)) return current
      if (['FAILED', 'INCOMPLETE', 'EXPIRED_PURGED'].includes(current.status)) {
        throw serviceError(current.errorCode || 'I10_IMAGE_INGEST_FAILED', EXIT.EXECUTION_FAILED)
      }
      if (now() >= deadline) throw serviceError('I10_IMAGE_INGEST_WAIT_TIMEOUT', EXIT.RUNTIME_UNAVAILABLE)
      await sleep(executionPollMs)
    }
  }

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

  let service
  service = Object.freeze({
    async sessionStart({ signal } = {}) {
      await gate()
      const threadId = threadIdFactory()
      const placeholderJourneyId = `journey-bootstrap-${randomUUID()}`
      const created = await sessionStore.create({
        namespace, threadId, journeyId: placeholderJourneyId, releaseIdentityHash,
        events: [{ type: 'SESSION_STARTED' }],
        ...(sessionIdFactory ? { sessionId: sessionIdFactory() } : {}),
      })
      const args = {
        sessionRef: created.sessionId,
        interactionContractVersion: 'v6',
        requestIntent: 'HELP',
        inputType: 'NONE',
        supportingImages: [],
      }
      try {
        const journey = await createMcpControllerAdapters({ client: mcpClient }).invoke({
          toolName: 'journey_prepare', arguments: args, argumentsHash: stableHash(args),
          contentHash: stableHash({ kind: 'CLI_SESSION_START', namespace, sessionId: created.sessionId, releaseIdentityHash }),
          expectedVersion: 0, risk: 'LOW',
          idempotencyKey: createHash('sha256').update(`session-start\0${created.sessionId}\0${releaseIdentityHash}`).digest('hex'),
        }, { signal })
        await sessionStore.rebindJourney(created.sessionId, releaseIdentityHash, {
          expectedJourneyId: placeholderJourneyId,
          journeyId: requireText(journey.journeyId, 'SESSION_JOURNEY_INVALID'),
        })
        const payload = await sessionStore.load(created.sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
        return sessionAuthority(payload, journey)
      } catch (error) {
        await sessionStore.archive(created.sessionId, releaseIdentityHash)
        throw error
      }
    },
    async sessionStatus({ sessionId, signal } = {}) {
      const payload = await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
      const journey = await createMcpControllerAdapters({ client: mcpClient }).readSessionJourney(sessionId, { signal })
      return sessionAuthority(payload, journey)
    },
    async sessionResume({ sessionId, signal } = {}) {
      const payload = await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
      const journey = await createMcpControllerAdapters({ client: mcpClient }).readSessionJourney(sessionId, { signal })
      return sessionAuthority(payload, journey, { resumed: true })
    },
    async journeyAuthor({ sessionId, goal, entryUrl, targetSystem, credentialRef, adapterSelection, bankValidationFixtures, signal } = {}) {
      assertSafeAgentText(goal, targetSystem)
      await gate()
      const payload = await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
      if (payload.status !== 'ACTIVE') throw serviceError('SESSION_NOT_ACTIVE')
      if (hasUnresolvedApproval(payload.events)) throw serviceError('APPROVAL_DECISION_REQUIRED', EXIT.APPROVAL_REQUIRED)
      const pool=validateBankPool(bankValidationFixtures,adapterSelection)
      const draftJson=bindBankPool(await authorCandidate({goal,entryUrl,targetSystem,credentialRef,adapterSelection},{signal,sessionId}),pool)
      const args = {
        sessionRef: sessionId, journeyId: payload.journeyId, interactionContractVersion: 'v6',
        requestIntent: 'CASE_AUTHORING', inputType: 'NATURAL_LANGUAGE', naturalLanguage: goal,
        entryUrl, targetSystem, credentialRef, draftJson, supportingImages: [],
        ...(adapterSelection ? { adapterSelection } : {}),
      }
      const argumentsHash = stableHash(args)
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      const value = await adapter.invoke({
        toolName: 'journey_prepare', arguments: args, argumentsHash,
        contentHash: stableHash({ kind: 'CLI_JOURNEY_AUTHOR', sessionId, releaseIdentityHash, argumentsHash }),
        expectedVersion: 0, risk: 'LOW',
        idempotencyKey: createHash('sha256').update(`journey-author\0${sessionId}\0${argumentsHash}`).digest('hex'),
      }, { signal })
      const candidate = projectJourneyCandidate(value)
      if (candidate.journeyId !== payload.journeyId) {
        await sessionStore.rebindJourney(sessionId, releaseIdentityHash, {
          expectedJourneyId: payload.journeyId, journeyId: candidate.journeyId,
        })
      }
      await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
        type: 'JOURNEY_CANDIDATE_AUTHORED', journeyId: candidate.journeyId, harnessVersion: candidate.revision,
        proposalId: candidate.proposalId, contentHash: candidate.contentHash,
      })
      return { sessionId, ...candidate }
    },
    async start({ input, attachmentRefs = [], attachmentMetadata = [], noSession, bankValidationFixtures, signal }) {
      assertSafeAgentText(input)
      if (noSession) throw serviceError('DURABLE_SESSION_REQUIRED', EXIT.INPUT_INVALID)
      await gate()
      if(bankValidationFixtures!==undefined && !directExecution)throw serviceError('BANK_VALIDATION_POOL_REQUIRES_DIRECT_EXECUTION',EXIT.INPUT_INVALID)
      const threadId = threadIdFactory()
      const resolvedJourneyId = await journeyResolver?.({ input, attachmentRefs, signal })
      if(bankValidationFixtures!==undefined && resolvedJourneyId)throw serviceError('BANK_VALIDATION_POOL_REQUIRES_NEW_JOURNEY',EXIT.INPUT_INVALID)
      const directAuthorInput=directExecution && !resolvedJourneyId ? naturalLanguageBootstrapInput(input) : undefined
      const pool=validateBankPool(bankValidationFixtures,directAuthorInput?.adapterSelection)
      const journeyId = resolvedJourneyId || `journey-bootstrap-${randomUUID()}`
      const created = await sessionStore.create({
        namespace, threadId, journeyId, releaseIdentityHash,
        events: [{ type: 'RUN_STARTED', attachmentCount: attachmentRefs.length }],
        ...(sessionIdFactory ? { sessionId: sessionIdFactory() } : {}),
      })
      await onCheckpoint?.({ sessionId: created.sessionId })
      if (!resolvedJourneyId) {
        if (!directExecution) {
          const authorInput = attachmentRefs.length ? undefined : naturalLanguageBootstrapInput(input)
          const draftJson = authorInput ? await authorCandidate(authorInput, { signal, sessionId: created.sessionId }) : undefined
          const proposal = bootstrapProposal({
            namespace, threadId, journeyId, sessionId: created.sessionId, releaseIdentityHash,
            input, attachmentRefs, authorInput, draftJson, now,
          })
          await sessionStore.putProposalArguments(created.sessionId, releaseIdentityHash, proposal.proposalId, proposal.args)
          await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, {
            type: 'APPROVAL_PENDING', source: 'JOURNEY_BOOTSTRAP', proposalId: proposal.proposalId,
            contentHash: proposal.contentHash, argumentsHash: proposal.argumentsHash,
            expectedVersion: 0, risk: proposal.risk, expiresAt: proposal.expiresAt, summary: proposal.summary,
          })
          return resultForCli({ status: 'AWAITING_USER', journeyId, approval: proposal }, created.sessionId)
        }
        const authorInput = directAuthorInput
        let draftJson=bindBankPool(await authorCandidate(authorInput,{signal,sessionId:created.sessionId}),pool)
        const adapter = createMcpControllerAdapters({ client: mcpClient })
        if (attachmentRefs.length > 0) {
          const first = attachmentMetadata[0]
          const attachmentRef = attachmentRefs[0]
          if (!first || first.attachmentRef !== attachmentRef || typeof first.originalFilename !== 'string' || !first.originalFilename.trim()) {
            throw serviceError('ATTACHMENT_METADATA_REQUIRED', EXIT.INPUT_INVALID)
          }
          const imageJob = await executeMutation(adapter, {
            toolName: 'image_ingest_submit', sessionId: created.sessionId, signal,
            args: {
              sourceRef: created.sessionId, primaryInputType: 'NATURAL_LANGUAGE', primaryText: input,
              credentialRef: authorInput.credentialRef, sessionRef: created.sessionId,
              images: [{ attachmentRef, originalFilename: first.originalFilename }],
            },
          })
          const waiting = await waitForImageIngestStatus(adapter, imageJob.imageIngestId, ['WAITING_USER'], signal)
          const facts = Array.isArray(waiting.facts) ? waiting.facts : []
          if (facts.length === 0 || facts.some(fact => typeof fact?.factId !== 'string')) {
            throw serviceError('I10_IMAGE_FACTS_INVALID', EXIT.EXECUTION_FAILED)
          }
          await executeMutation(adapter, {
            toolName: 'image_ingest_decision_submit', sessionId: created.sessionId, signal,
            expectedVersion: waiting.version,
            args: {
              imageIngestId: waiting.imageIngestId, expectedVersion: waiting.version,
              confirmationRef: `image-${waiting.imageIngestId.slice(-24)}`,
              decisions: facts.map(fact => ({ factId: fact.factId, decision: 'CONFIRM' })), sessionRef: created.sessionId,
            },
          })
          draftJson = { ...draftJson, supportingImageIngestId: waiting.imageIngestId }
        }
        let bootstrapped
        const args = {
          sessionRef: created.sessionId,
          interactionContractVersion: 'v6',
          requestIntent: 'CASE_AUTHORING',
          inputType: 'NATURAL_LANGUAGE',
          naturalLanguage: input,
          entryUrl: authorInput.entryUrl,
          targetSystem: authorInput.targetSystem,
          credentialRef: authorInput.credentialRef,
          draftJson,
          supportingImages: [],
          ...(authorInput.adapterSelection ? { adapterSelection: authorInput.adapterSelection } : {}),
        }
        const argumentsHash = stableHash(args)
        try {
          bootstrapped = await adapter.invoke({
            toolName: 'journey_prepare', arguments: args, argumentsHash,
            contentHash: stableHash({ kind: 'CLI_DIRECT_CASE_START', sessionId: created.sessionId, releaseIdentityHash, argumentsHash }),
            expectedVersion: 0, risk: 'LOW',
            idempotencyKey: createHash('sha256').update(`direct-case-start\0${created.sessionId}\0${argumentsHash}`).digest('hex'),
          }, { signal })
        } catch (error) {
          const businessCode = error?.details?.businessCode
          const safeCode = typeof businessCode === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(businessCode)
            ? businessCode : 'AGENT_BOOTSTRAP_FAILED'
          throw serviceError(safeCode)
        }
        const actualJourneyId = requireText(bootstrapped.journeyId, 'AGENT_BOOTSTRAP_JOURNEY_INVALID')
        await sessionStore.rebindJourney(created.sessionId, releaseIdentityHash, {
          expectedJourneyId: journeyId, journeyId: actualJourneyId,
        })
        const candidate = projectJourneyCandidate(bootstrapped, actualJourneyId)
        if(candidate.status==='NEEDS_INPUT') {
          await sessionStore.appendEvent(created.sessionId,releaseIdentityHash,{
            type:'TURN_FINISHED',status:'NEEDS_INPUT',journeyId:actualJourneyId,missingFields:candidate.missingFields,
          })
          return {sessionId:created.sessionId,...candidate}
        }
        await service.journeyDecision({
          sessionId: created.sessionId, journeyId: actualJourneyId, revision: candidate.revision,
          proposalId: candidate.proposalId, contentHash: candidate.contentHash, approved: true, signal,
        })
        const execution = await service.journeyExecute({ sessionId: created.sessionId, journeyId: actualJourneyId, signal })
        if (execution.status !== 'PASSED') throw serviceError('JOURNEY_EXECUTION_NOT_TERMINAL', EXIT.RUNTIME_UNAVAILABLE)
        await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, {
          type: 'TURN_FINISHED', status: 'COMPLETED', journeyId: actualJourneyId,
          runId: execution.runId, taskId: execution.taskId,
        })
        return {
          status: 'COMPLETED', sessionId: created.sessionId, journeyId: actualJourneyId,
          answer: 'The Agent authored and executed the Journey without a manual approval gate.',
        }
      }
      const runtime = await runtimeFor(created.sessionId)
      const result = await runtime.start({ requestId: `request-${randomUUID()}`, namespace, threadId, journeyId, userInput: input })
      if (result.approval) await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, approvalEvent(result))
      else await sessionStore.appendEvent(created.sessionId, releaseIdentityHash, { type: 'TURN_FINISHED', status: result.status })
      return resultForCli(result, created.sessionId)
    },

    async continueDirectJourney({ sessionId, journeyId, input, signal }) {
      assertSafeAgentText(input)
      await gate()
      if (!directExecution) throw serviceError('JOURNEY_DIRECT_EXECUTION_REQUIRED')
      await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash, expectedJourneyId: journeyId })
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      const current = await adapter.readJourney(journeyId, { signal })
      const kind = current.nextAction?.inputRequest?.inputKind
      if (current.status !== 'NEEDS_INPUT' || !['INITIAL_CASE_INPUT', 'CASE_CORRECTION'].includes(kind)) {
        throw serviceError('JOURNEY_INPUT_NOT_EXPECTED', EXIT.INPUT_INVALID)
      }
      const facts = naturalLanguageBootstrapInput(input)
      const draftJson = await authorCandidate(facts, { signal, sessionId })
      await executeMutation(adapter, { toolName: 'journey_input_submit', sessionId, signal, expectedVersion: current.version,
        args: { journeyId, expectedVersion: current.version, inputKind: kind, submissionRef: `input-${stableHash(input).slice(0, 24)}`,
          normalizedInput: { inputType: 'NATURAL_LANGUAGE', naturalLanguage: input, draftJson,
            entryUrl: facts.entryUrl, targetSystem: facts.targetSystem, credentialRef: facts.credentialRef } } })
      const candidate = projectJourneyCandidate(await adapter.readJourney(journeyId, { signal }), journeyId)
      if (candidate.status === 'NEEDS_INPUT') return { sessionId, ...candidate }
      await service.journeyDecision({ sessionId, journeyId, revision: candidate.revision, proposalId: candidate.proposalId, contentHash: candidate.contentHash, approved: true, signal })
      const execution = await service.journeyExecute({ sessionId, journeyId, signal })
      if (execution.status !== 'PASSED') throw serviceError('JOURNEY_EXECUTION_NOT_TERMINAL', EXIT.EXECUTION_FAILED)
      return { ...execution, status: 'COMPLETED', answer: '已执行当前目标，业务结果需由证据校验器核验。' }
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
      if (!approved && pending.source !== 'JOURNEY_CASE_APPROVAL') {
        await sessionStore.deleteProposalArguments(sessionId, releaseIdentityHash, proposalId)
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, { type: 'APPROVAL_REJECTED', proposalId })
        return { status: 'REJECTED', sessionId, journeyId: payload.journeyId }
      }
      if (pending.source === 'JOURNEY_BOOTSTRAP') {
        if (now() >= Date.parse(pending.expiresAt)) throw serviceError('AGENT_CONTROLLER_APPROVAL_EXPIRED')
        const args = await sessionStore.getProposalArguments(sessionId, releaseIdentityHash, proposalId)
        if (!args || stableHash(args) !== pending.argumentsHash) throw serviceError('AGENT_BOOTSTRAP_ARGUMENTS_UNAVAILABLE')
        const adapter = createMcpControllerAdapters({ client: mcpClient })
        let bootstrapped
        try {
          bootstrapped = await adapter.invoke({
            toolName: 'journey_prepare', arguments: args, argumentsHash: pending.argumentsHash,
            contentHash: pending.contentHash, expectedVersion: 0, risk: 'LOW',
            idempotencyKey: createHash('sha256').update(`${sessionId}\0${proposalId}`).digest('hex'),
          }, { signal })
        } catch (error) {
          const businessCode = error?.details?.businessCode
          const safeCode = typeof businessCode === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(businessCode)
            ? businessCode
            : typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)
              ? error.code
              : 'AGENT_BOOTSTRAP_FAILED'
          throw serviceError(safeCode)
        }
        const actualJourneyId = requireText(bootstrapped.journeyId, 'AGENT_BOOTSTRAP_JOURNEY_INVALID')
        await sessionStore.rebindJourney(sessionId, releaseIdentityHash, {
          expectedJourneyId: payload.journeyId, journeyId: actualJourneyId,
        })
        await sessionStore.deleteProposalArguments(sessionId, releaseIdentityHash, proposalId)
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
          type: 'JOURNEY_BOOTSTRAP_RESOLVED', proposalId, journeyId: actualJourneyId,
          harnessVersion: bootstrapped.harnessVersion,
        })
        const candidate = projectJourneyCandidate(bootstrapped, actualJourneyId)
        const result = {
          status: 'AWAITING_USER', journeyId: actualJourneyId,
          approval: {
            proposalId: candidate.proposalId,
            contentHash: candidate.contentHash,
            expectedVersion: candidate.revision,
            risk: 'HIGH',
            expiresAt: new Date(now() + BOOTSTRAP_TTL_MS).toISOString(),
            summary: bootstrapped.proposalSummary || 'Approve the exact Harness case draft.',
          },
        }
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, approvalEvent(result, 'JOURNEY_CASE_APPROVAL'))
        return resultForCli(result, sessionId)
      }
      if (pending.source === 'JOURNEY_CASE_APPROVAL') {
        if (now() >= Date.parse(pending.expiresAt)) throw serviceError('AGENT_CONTROLLER_APPROVAL_EXPIRED')
        const decision = await service.journeyDecision({
          sessionId, journeyId: payload.journeyId, revision: pending.expectedVersion,
          proposalId, contentHash: pending.contentHash, approved, signal,
        })
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
          type: approved ? 'APPROVAL_RESOLVED' : 'APPROVAL_REJECTED',
          proposalId, status: decision.status,
        })
        if (!approved) return { status: 'REJECTED', sessionId, journeyId: payload.journeyId }
        const execution = await service.journeyExecute({ sessionId, journeyId: payload.journeyId, signal })
        if (execution.status !== 'PASSED') throw serviceError('JOURNEY_EXECUTION_NOT_TERMINAL', EXIT.RUNTIME_UNAVAILABLE)
        await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
          type: 'TURN_FINISHED', status: 'COMPLETED', journeyId: payload.journeyId,
          runId: execution.runId, taskId: execution.taskId,
        })
        return {
          status: 'COMPLETED', sessionId, journeyId: payload.journeyId,
          answer: 'The approved Journey completed with verified browser execution evidence.',
        }
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
      assertSafeAgentText(input)
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
    async journeyValidate({ journeyId, signal }) {
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      const candidate = projectJourneyCandidate(await adapter.readJourney(journeyId, { signal }), journeyId)
      return candidate.status === 'NEEDS_INPUT' ? candidate : { ...candidate, status: 'VALIDATED' }
    },
    async journeyDecision({ sessionId, journeyId, revision, proposalId, contentHash, approved, signal }) {
      await gate()
      if (!Number.isInteger(revision) || revision < 1 || !HASH.test(String(contentHash || '')) || typeof approved !== 'boolean') {
        throw serviceError('JOURNEY_DECISION_INPUT_INVALID', EXIT.INPUT_INVALID)
      }
      await sessionStore.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash, expectedJourneyId: journeyId })
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      const current = projectJourneyCandidate(await adapter.readJourney(journeyId, { signal }), journeyId)
      if (current.revision !== revision || current.proposalId !== proposalId || current.contentHash !== contentHash) {
        throw serviceError('JOURNEY_APPROVAL_TUPLE_STALE', EXIT.EVIDENCE_GATE_FAILED)
      }
      const args = {
        journeyId, expectedVersion: revision, decision: approved ? 'APPROVE_CASE' : 'REJECT_CASE',
        confirmationRef: `confirmation-${contentHash.slice(0, 24)}`, proposalId, payloadHash: contentHash,
        payload: {}, sessionRef: sessionId,
      }
      const argumentsHash = stableHash(args)
      const result = await adapter.invoke({
        toolName: 'journey_decision_submit', arguments: args, argumentsHash,
        contentHash: stableHash({ kind: 'CLI_JOURNEY_DECISION', releaseIdentityHash, argumentsHash }),
        expectedVersion: revision, risk: 'HIGH',
        idempotencyKey: createHash('sha256').update(`journey-decision\0${sessionId}\0${argumentsHash}`).digest('hex'),
      }, { signal })
      const projected = projectJourneyDecision(result, { journeyId, approved })
      await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
        type: 'JOURNEY_DECISION_RECORDED', journeyId, harnessVersion: projected.revision,
        proposalId, contentHash, decision: projected.decision,
      })
      return { sessionId, ...projected }
    },
    async scheduleCreate({sessionId,journeyId:sourceJourneyId,cronExpression,runAt,timezone,signal}={}) {
      await gate()
      const session=await sessionStore.load(sessionId,{expectedReleaseIdentityHash:releaseIdentityHash})
      const plan={mode:cronExpression?'RECURRING':'ONE_TIME',timezone,...(cronExpression?{cronExpression}:{runAt})}
      const planHash=stableHash(plan),previous=session.events.find(e=>e.type==='SCHEDULE_REQUEST_BOUND')
      if(session.status!=='ACTIVE'||(previous&&(previous.sourceJourneyId!==sourceJourneyId||previous.planHash!==planHash||session.journeyId!==previous.journeyId))||
        (!previous&&(session.journeyId===sourceJourneyId||session.events.length!==1||session.events[0].type!=='SESSION_STARTED')))
        throw serviceError('SCHEDULE_FRESH_SESSION_OR_SAME_REQUEST_REQUIRED',EXIT.EVIDENCE_GATE_FAILED)
      const adapter=createMcpControllerAdapters({client:mcpClient})
      const proof=await service.evidenceVerify({journeyId:sourceJourneyId,signal})
      if(proof.releaseIdentityHash!==releaseIdentityHash||proof.runStatus!=='PASSED'||proof.taskStatus!=='SUCCEEDED')
        throw serviceError('SCHEDULE_SOURCE_EVIDENCE_INVALID',EXIT.EVIDENCE_GATE_FAILED)
      const prepared=await executeMutation(adapter,{toolName:'journey_prepare',sessionId,signal,args:{
        sessionRef:sessionId,interactionContractVersion:'v6',requestIntent:'CASE_AUTHORING',inputType:'NONE',supportingImages:[],validatedJourneyId:sourceJourneyId,
      }})
      const journeyId=prepared.journeyId
      if(!journeyId||journeyId===sourceJourneyId||prepared.references?.validatedJourneyId!==sourceJourneyId)
        throw serviceError('SCHEDULE_FROZEN_BINDING_INVALID',EXIT.EVIDENCE_GATE_FAILED)
      if(session.journeyId!==journeyId)await sessionStore.rebindJourney(sessionId,releaseIdentityHash,{expectedJourneyId:session.journeyId,journeyId})
      if(!previous)await sessionStore.appendEvent(sessionId,releaseIdentityHash,{type:'SCHEDULE_REQUEST_BOUND',journeyId,sourceJourneyId,planHash})
      let current=await adapter.readJourney(journeyId,{signal})
      if(current.references?.scheduleId){
        const existing=await service.scheduleStatus({scheduleId:current.references.scheduleId,signal})
        if(existing.scriptHash!==current.references.scriptHash||existing.maxRetries!==0)throw serviceError('SCHEDULE_SCRIPT_OR_RETRY_BINDING_INVALID',EXIT.EVIDENCE_GATE_FAILED)
        return existing
      }
      if(current.stage==='NEEDS_INPUT') {
        await executeMutation(adapter,{toolName:'journey_input_submit',sessionId,signal,expectedVersion:current.version,args:{
          journeyId,expectedVersion:current.version,inputKind:'EXECUTION_PLAN',normalizedInput:plan,submissionRef:`schedule-${planHash.slice(0,24)}`,sessionRef:sessionId,
        }})
        current=await adapter.readJourney(journeyId,{signal})
      }
      if(current.stage==='READY_FOR_EXECUTION_DECISION') {
        const proposal=current.proposal
        if(!proposal?.proposalId||!HASH.test(String(proposal.payloadHash||'')))throw serviceError('SCHEDULE_DECISION_BINDING_INVALID',EXIT.EVIDENCE_GATE_FAILED)
        await executeMutation(adapter,{toolName:'journey_decision_submit',sessionId,signal,expectedVersion:current.version,args:{
          journeyId,expectedVersion:current.version,decision:cronExpression?'CREATE_RECURRING_SCHEDULE':'CREATE_ONE_TIME_SCHEDULE',
          confirmationRef:`schedule-${planHash.slice(0,24)}`,proposalId:proposal.proposalId,payloadHash:proposal.payloadHash,payload:{},sessionRef:sessionId,
        }})
        current=await adapter.readJourney(journeyId,{signal})
      }
      const refs=current.references
      if(current.nextAction?.type!=='CALL_SCHEDULE_CREATE'||!refs?.preparationId||!refs.confirmedDecisionEventId||
        refs.executionPlan?.maxRetries!==0||refs.executionPlan.mode!==plan.mode)
        throw serviceError('SCHEDULE_EXECUTION_BINDING_INVALID',EXIT.EVIDENCE_GATE_FAILED)
      const result=await executeMutation(adapter,{toolName:'schedule_create',sessionId,signal,args:{
        preparationId:refs.preparationId,journeyId,confirmedDecisionEventId:refs.confirmedDecisionEventId,
        scheduleType:plan.mode,timezone:refs.executionPlan.timezone,
        ...(plan.mode==='RECURRING'?{cronExpression:refs.executionPlan.cronExpression}:{runAt:refs.executionPlan.runAt}),
        maxRetries:0,misfirePolicy:refs.executionPlan.misfirePolicy,misfireGraceSeconds:refs.executionPlan.misfireGraceSeconds,
        confirmationRef:`schedule-${journeyId.slice(-24)}`,sessionRef:sessionId,
      }})
      const status=await service.scheduleStatus({scheduleId:result.scheduleId,signal})
      if(status.scriptHash!==refs.scriptHash||status.maxRetries!==0)throw serviceError('SCHEDULE_SCRIPT_OR_RETRY_BINDING_INVALID',EXIT.EVIDENCE_GATE_FAILED)
      await sessionStore.appendEvent(sessionId,releaseIdentityHash,{type:'SCHEDULE_CREATED',journeyId,scheduleId:status.scheduleId,scriptHash:status.scriptHash})
      return status
    },
    async scheduleStatus({scheduleId,signal}={}) {
      const value=await createMcpControllerAdapters({client:mcpClient}).readSchedule(scheduleId,{signal})
      const result={}
      for(const key of ['scheduleId','scheduleType','status','version','caseId','caseVersion','planId','scriptId','scriptVersion','scriptHash',
        'cronExpression','runAt','timezone','misfirePolicy','maxRetries','nextFireAt','oneTimeState','executionCount','lastExecutionStatus','pausedIncidentId'])
        if(value[key]!==undefined)result[key]=value[key]
      return result
    },
    async scheduleDisable({sessionId,scheduleId,reason,signal}={}) {
      await gate();await sessionStore.load(sessionId,{expectedReleaseIdentityHash:releaseIdentityHash})
      const current=await service.scheduleStatus({scheduleId,signal})
      if(current.status==='DISABLED')return current
      const adapter=createMcpControllerAdapters({client:mcpClient})
      await executeMutation(adapter,{toolName:'schedule_disable',sessionId,signal,expectedVersion:current.version,
        args:{scheduleId,reason,sessionRef:sessionId}})
      return service.scheduleStatus({scheduleId,signal})
    },
    async failureShow({incidentId,signal}={}) {
      const failure=await createMcpControllerAdapters({client:mcpClient}).readFailure(incidentId,{signal})
      const result={humanInterventionRequired:true}
      for(const key of ['incidentId','runId','caseId','scriptId','scriptVersion','classification','reasonCode','disposition','status'])
        if(failure[key]!==undefined)result[key]=failure[key]
      result.artifactRefs=failure.failureEnvelope?.payload?.artifactRefs??[]
      return result
    },
    async feedbackRecord({sessionId,incidentId,correction,signal}={}) {
      await gate();await sessionStore.load(sessionId,{expectedReleaseIdentityHash:releaseIdentityHash})
      const {feedbackRecordSchema}=require('../../dist/harness/src/feedback.js')
      const confirmationRef=`feedback-${sessionId}-${stableHash(correction).slice(0,16)}`
      const parsed=feedbackRecordSchema.safeParse({namespace,incidentId,confirmationRef,correction})
      if(!parsed.success)throw serviceError('FEEDBACK_CORRECTION_INVALID',EXIT.INPUT_INVALID)
      return executeMutation(createMcpControllerAdapters({client:mcpClient}),{toolName:'feedback_record',sessionId,signal,
        args:{incidentId,confirmationRef,correction:parsed.data.correction,sessionRef:sessionId}})
    },
    async feedbackVerify({sessionId,feedbackId,verificationJourneyId,signal}={}) {
      await gate();await sessionStore.load(sessionId,{expectedReleaseIdentityHash:releaseIdentityHash})
      return executeMutation(createMcpControllerAdapters({client:mcpClient}),{toolName:'feedback_verify',sessionId,signal,
        args:{feedbackId,verificationJourneyId,sessionRef:sessionId}})
    },
    async feedbackShow({feedbackId,signal}={}) {
      return createMcpControllerAdapters({client:mcpClient}).readFeedback(feedbackId,{signal})
    },
    async verificationStatus({challengeId,signal}={}) {
      const value=await createMcpControllerAdapters({client:mcpClient}).readVerification(challengeId,{signal})
      const result={humanInterventionRequired:['WAITING_USER_PREPARATION','WAITING_USER_ACTION'].includes(value.status)}
      for(const key of ['challengeId','taskRef','verificationType','status','version','expiresAt'])
        if(value[key]!==undefined)result[key]=value[key]
      return result
    },
    async verificationDecide({sessionId,challengeId,revision,decision,signal}={}) {
      await gate();await sessionStore.load(sessionId,{expectedReleaseIdentityHash:releaseIdentityHash})
      const current=await service.verificationStatus({challengeId,signal})
      if(current.version!==revision)throw serviceError('I10_VERIFICATION_VERSION_CONFLICT',EXIT.EVIDENCE_GATE_FAILED)
      if(!['USER_READY','USER_ACTION_COMPLETED','CANCEL'].includes(decision))throw serviceError('I10_VERIFICATION_DECISION_INVALID',EXIT.USAGE)
      await executeMutation(createMcpControllerAdapters({client:mcpClient}),{
        toolName:'verification_decision_submit',sessionId,signal,expectedVersion:revision,args:{
          challengeId,expectedVersion:revision,decision,confirmationRef:`verification-${sessionId}-${revision}`,
          sessionRef:sessionId,
        },
      })
      return service.verificationStatus({challengeId,signal})
    },
    async journeyExecute({ sessionId, journeyId, signal,repeat=false } = {}) {
      await gate()
      const session=await sessionStore.load(sessionId,{expectedReleaseIdentityHash:releaseIdentityHash,
        ...(!repeat ? {expectedJourneyId:journeyId} : {})})
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      if(repeat){
        const previous=session.events.find(event=>event.type==='JOURNEY_REPEAT_PREPARED')
        if(session.status!=='ACTIVE'||(previous&&(previous.sourceJourneyId!==journeyId||session.journeyId!==previous.journeyId))||
          (!previous&&(session.journeyId===journeyId||session.events.length!==1||session.events[0].type!=='SESSION_STARTED')))
          throw serviceError('JOURNEY_REPEAT_FRESH_SESSION_REQUIRED',EXIT.EVIDENCE_GATE_FAILED)
        const proof=await service.evidenceVerify({journeyId,signal})
        if(proof.releaseIdentityHash!==releaseIdentityHash||proof.runStatus!=='PASSED'||proof.taskStatus!=='SUCCEEDED')
          throw serviceError('JOURNEY_REPEAT_SOURCE_IDENTITY_INVALID',EXIT.EVIDENCE_GATE_FAILED)
        const prepared=await executeMutation(adapter,{toolName:'journey_prepare',sessionId,signal,args:{
          sessionRef:sessionId,interactionContractVersion:'v6',requestIntent:'CASE_AUTHORING',inputType:'NONE',supportingImages:[],validatedJourneyId:journeyId,
        }})
        if(!prepared.journeyId||prepared.journeyId===journeyId||prepared.references?.validatedJourneyId!==journeyId)
          throw serviceError('JOURNEY_REPEAT_BINDING_INVALID',EXIT.EVIDENCE_GATE_FAILED)
        if(session.journeyId!==prepared.journeyId)await sessionStore.rebindJourney(sessionId,releaseIdentityHash,{
          expectedJourneyId:session.journeyId,journeyId:prepared.journeyId,
        })
        if(!previous)await sessionStore.appendEvent(sessionId,releaseIdentityHash,{
          type:'JOURNEY_REPEAT_PREPARED',sourceJourneyId:journeyId,journeyId:prepared.journeyId,candidateId:prepared.references.candidateId,
        })
        return service.journeyExecute({sessionId,journeyId:prepared.journeyId,signal})
      }
      let current = await adapter.readJourney(journeyId, { signal })
      if (current.stage === 'COMPLETED' && current.status === 'COMPLETED' &&
          current.references?.runId && current.references?.taskId) {
        const proof = await service.evidenceVerify({ journeyId, signal })
        if (proof.releaseIdentityHash !== releaseIdentityHash || proof.runStatus !== 'PASSED' ||
            proof.taskStatus !== 'SUCCEEDED' || proof.runId !== current.references.runId ||
            proof.taskId !== current.references.taskId) {
          throw serviceError('JOURNEY_RUN_RECOVERY_EVIDENCE_INVALID', EXIT.EVIDENCE_GATE_FAILED)
        }
        return { status: 'PASSED', sessionId, journeyId, runId: proof.runId, taskId: proof.taskId,
          candidateId: current.references.candidateId,
          confirmedDecisionEventId: current.references.confirmedDecisionEventId }
      }
      let submitted
      const recoveringRun = current.stage === 'RUNNING' &&
        ['CALL_RUN_SUBMIT', 'QUERY_TASK', 'RESUME_RUN'].includes(current.nextAction?.type)
      if (recoveringRun) {
        const { preparationId, candidateId, confirmedDecisionEventId, runId, taskId } = current.references ?? {}
        if (!preparationId || !confirmedDecisionEventId || Boolean(runId) !== Boolean(taskId)) {
          throw serviceError('JOURNEY_RUN_BINDING_INVALID', EXIT.EVIDENCE_GATE_FAILED)
        }
        if (runId && taskId) {
          submitted = { runId, taskId, candidateId, journeyId, confirmedDecisionEventId }
        } else {
          if (current.nextAction?.type !== 'CALL_RUN_SUBMIT') {
            throw serviceError('JOURNEY_RUN_BINDING_INVALID', EXIT.EVIDENCE_GATE_FAILED)
          }
          submitted = await executeMutation(adapter, {
            toolName: 'run_submit', sessionId, signal,
            args: { preparationId, journeyId, confirmedDecisionEventId, sessionRef: sessionId },
          })
        }
      } else {
      const frozenReady=current.stage==='NEEDS_INPUT'&&current.references?.validatedJourneyId&&
        current.references?.preparationId&&current.references?.candidateId&&current.references?.planId
      if(!frozenReady){
      const importedAuthoringReady = current.stage === 'PROCESSING_AUTHORING' && current.nextAction?.type === 'SUBMIT_AUTHORING'
      if (current.stage !== 'PROCESSING_AUTHORING' || (!importedAuthoringReady && current.nextAction?.type !== 'CALL_CASE_PREPARE')) {
        throw serviceError('JOURNEY_NOT_APPROVED_FOR_EXECUTION', EXIT.EVIDENCE_GATE_FAILED)
      }
      const draft = current.caseDraft
      if (!draft || !Array.isArray(draft.steps) || draft.steps.length === 0 || !Array.isArray(draft.assertions) || draft.assertions.length === 0) {
        throw serviceError('JOURNEY_EXECUTION_DRAFT_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      if (typeof draft.targetSystem !== 'string' || !draft.targetSystem.trim() ||
          typeof draft.entryUrl !== 'string' || !draft.entryUrl.trim() ||
          typeof draft.credentialRef !== 'string' || !draft.credentialRef.trim()) {
        throw serviceError('JOURNEY_TARGET_PROFILE_INPUT_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      if (importedAuthoringReady) {
        if (!current.preparationId || !Number.isInteger(current.preparationVersion)) {
          throw serviceError('JOURNEY_AUTHORING_PREPARATION_INVALID', EXIT.EVIDENCE_GATE_FAILED)
        }
      }
      const profileArgs = {
        displayName: draft.targetSystem,
        launchUrl: draft.entryUrl,
        credentialRef: draft.credentialRef,
        tlsPolicy: 'STRICT',
        sessionRef: sessionId,
        ...(typeof draft.adapterSelection === 'string' && draft.adapterSelection.trim()
          ? { adapterSelection: draft.adapterSelection }
          : {}),
      }
      const preparedProfile = importedAuthoringReady ? null : await executeMutation(adapter, {
        toolName: 'target_profile_prepare', sessionId, signal, args: profileArgs,
      })
      if (!importedAuthoringReady && (!preparedProfile.targetProfileId || !Number.isInteger(preparedProfile.version) ||
          preparedProfile.status !== 'PENDING_CONFIRMATION' || preparedProfile.nextAction !== 'TARGET_PROFILE_CONFIRMATION_REQUIRED')) {
        throw serviceError('JOURNEY_TARGET_PROFILE_PREPARATION_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      const activeProfile = importedAuthoringReady ? null : await executeMutation(adapter, {
        toolName: 'target_profile_decision_submit', sessionId, signal, expectedVersion: preparedProfile.version,
        args: {
          targetProfileId: preparedProfile.targetProfileId,
          expectedVersion: preparedProfile.version,
          decision: 'APPROVE',
          confirmationRef: `profile-${journeyId.slice(-24)}`,
          sessionRef: sessionId,
        },
      })
      if (!importedAuthoringReady && (activeProfile.targetProfileId !== preparedProfile.targetProfileId || activeProfile.status !== 'ACTIVE' ||
          activeProfile.nextAction !== 'CASE_AUTHORING_AVAILABLE')) {
        throw serviceError('JOURNEY_TARGET_PROFILE_ACTIVATION_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      if (!importedAuthoringReady) {
        await executeMutation(adapter, {
          toolName: 'case_prepare', sessionId, signal,
          args: { caseDescription: draft.summary || draft.objective, draftJson: draft, journeyId, sessionRef: sessionId },
        })
        current = await adapter.readJourney(journeyId, { signal })
        if (current.nextAction?.type !== 'SUBMIT_AUTHORING' || !current.preparationId || !Number.isInteger(current.preparationVersion)) {
          throw serviceError('JOURNEY_AUTHORING_PREPARATION_INVALID')
        }
      }
      await executeMutation(adapter, {
        toolName: 'authoring_submit', sessionId, signal, expectedVersion: current.preparationVersion,
        args: {
          preparationId: current.preparationId, expectedVersion: current.preparationVersion, choice: 'APPROVE',
          confirmationRef: `execute-${journeyId.slice(-24)}`, reason: 'Explicit hz-agent journey execute command', sessionRef: sessionId,
        },
      })
      current = await adapter.readJourney(journeyId, { signal })
      if (current.nextAction?.type !== 'COMPILE_CANDIDATE' || !current.preparationId || !Number.isInteger(current.preparationVersion)) {
        throw serviceError('JOURNEY_CANDIDATE_COMPILE_NOT_READY')
      }
      await executeMutation(adapter, {
        toolName: 'candidate_compile', sessionId, signal, expectedVersion: current.preparationVersion,
        args: { preparationId: current.preparationId, expectedPreparationVersion: current.preparationVersion, retryFailed: false, sessionRef: sessionId },
      })
      current = await waitForJourneyStage(adapter, journeyId, ['READY_FOR_SCRIPT_ACTIVATION'], signal)
      const activationProposal = current.proposal
      if (!activationProposal?.proposalId || !HASH.test(String(activationProposal.payloadHash || '')) || !current.preparationId) {
        throw serviceError('JOURNEY_ACTIVATION_PROPOSAL_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      await executeMutation(adapter, {
        toolName: 'journey_decision_submit', sessionId, signal, expectedVersion: current.version,
        args: {
          journeyId, expectedVersion: current.version, decision: 'ACTIVATE_SCRIPT',
          confirmationRef: `activate-${journeyId.slice(-24)}`, proposalId: activationProposal.proposalId,
          payloadHash: activationProposal.payloadHash, payload: {}, sessionRef: sessionId,
        },
      })
      await executeMutation(adapter, {
        toolName: 'candidate_decide', sessionId, signal,
        args: {
          preparationId: current.preparationId, choice: 'ACTIVATE', confirmationRef: `activate-${journeyId.slice(-24)}`,
          reason: 'Explicit hz-agent journey execute command', sessionRef: sessionId,
        },
      })
      current = await adapter.readJourney(journeyId, { signal })
      if (current.stage !== 'NEEDS_INPUT') throw serviceError('JOURNEY_EXECUTION_PLAN_NOT_READY')
      }
      await executeMutation(adapter, {
        toolName: 'journey_input_submit', sessionId, signal, expectedVersion: current.version,
        args: {
          journeyId, expectedVersion: current.version, inputKind: 'EXECUTION_PLAN', normalizedInput: { mode: 'ON_DEMAND' },
          submissionRef: `on-demand-${journeyId.slice(-24)}`, sessionRef: sessionId,
        },
      })
      current = await adapter.readJourney(journeyId, { signal })
      const runProposal = current.proposal
      if (!runProposal?.proposalId || !HASH.test(String(runProposal.payloadHash || ''))) {
        throw serviceError('JOURNEY_RUN_PROPOSAL_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      await executeMutation(adapter, {
        toolName: 'journey_decision_submit', sessionId, signal, expectedVersion: current.version,
        args: {
          journeyId, expectedVersion: current.version, decision: 'RUN_ON_DEMAND',
          confirmationRef: `run-${journeyId.slice(-24)}`, proposalId: runProposal.proposalId,
          payloadHash: runProposal.payloadHash, payload: {}, sessionRef: sessionId,
        },
      })
      current = await adapter.readJourney(journeyId, { signal })
      const preparationId = current.references?.preparationId
      const confirmedDecisionEventId = current.references?.confirmedDecisionEventId
      if (current.nextAction?.type !== 'CALL_RUN_SUBMIT' || !preparationId || !confirmedDecisionEventId) {
        throw serviceError('JOURNEY_RUN_BINDING_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      submitted = await executeMutation(adapter, {
        toolName: 'run_submit', sessionId, signal,
        args: { preparationId, journeyId, confirmedDecisionEventId, sessionRef: sessionId },
      })
      }
      if (!submitted.runId || !submitted.taskId || submitted.journeyId !== journeyId ||
          submitted.confirmedDecisionEventId !== current.references?.confirmedDecisionEventId) {
        throw serviceError('JOURNEY_RUN_RESULT_INVALID', EXIT.EVIDENCE_GATE_FAILED)
      }
      const deadline = now() + executionWaitMs
      let task
      while (true) {
        try {
          task = await adapter.readTask(submitted.taskId, { signal })
        } catch (error) {
          if (error?.details?.toolName === 'task_get' && typeof error.details.businessCode === 'string') {
            throw serviceError(error.details.businessCode, EXIT.EXECUTION_FAILED)
          }
          throw error
        }
        if (task.terminal === true || ['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(task.status)) break
        if (!['QUEUED', 'RUNNING'].includes(task.status)) throw serviceError('WORKER_TASK_STATUS_INVALID', EXIT.EXECUTION_FAILED)
        if (now() >= deadline) throw serviceError('WORKER_TASK_NOT_CLAIMED', EXIT.RUNTIME_UNAVAILABLE)
        await sleep(executionPollMs)
      }
      if (['FAILED', 'BLOCKED', 'CANCELLED'].includes(task.status)) {
        throw serviceError(task.errorCode || 'JOURNEY_BROWSER_EXECUTION_FAILED', EXIT.EXECUTION_FAILED)
      }
      // Harness owns Journey projection. A SUCCEEDED Worker task is not yet
      // terminal Journey evidence until the authoritative read projects the
      // linked inbox and five evidence kinds to COMPLETED.
      const completedJourney = await waitForJourneyStage(adapter, journeyId, ['COMPLETED'], signal)
      if (completedJourney.status !== 'COMPLETED') throw serviceError('JOURNEY_EXECUTION_NOT_TERMINAL', EXIT.EVIDENCE_GATE_FAILED)
      await sessionStore.appendEvent(sessionId, releaseIdentityHash, {
        type: recoveringRun ? 'JOURNEY_EXECUTION_RECOVERED' : 'JOURNEY_EXECUTION_STARTED', journeyId, runId: submitted.runId, taskId: submitted.taskId,
        confirmedDecisionEventId: submitted.confirmedDecisionEventId, taskStatus: task.status,
      })
      return {
        status: task.status === 'SUCCEEDED' ? 'PASSED' : task.status,
        sessionId, journeyId, runId: submitted.runId, taskId: submitted.taskId,
        candidateId: submitted.candidateId, confirmedDecisionEventId: submitted.confirmedDecisionEventId,
      }
    },
    async evidence({ journeyId, signal }) {
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      return projectJourneyEvidence(await adapter.readJourney(journeyId, { signal }), journeyId)
    },
    async evidenceVerify({ journeyId, signal }) {
      const adapter = createMcpControllerAdapters({ client: mcpClient })
      try {
        const result = await adapter.readJourneyEvidence(journeyId, { signal })
        if (result?.schemaVersion !== 'hengzhun-cli-evidence-verification/v1' || result?.verdict !== 'VERIFIED' || result?.journeyId !== journeyId) {
          throw serviceError('I10_EVIDENCE_VERIFICATION_INVALID', EXIT.EVIDENCE_GATE_FAILED)
        }
        return result
      } catch (error) {
        if (error instanceof CliError) throw error
        throw serviceError(error?.details?.businessCode || error?.code || 'I10_EVIDENCE_VERIFICATION_FAILED', EXIT.EVIDENCE_GATE_FAILED)
      }
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
    async doctor({ signal } = {}) { return doctorProbe ? doctorProbe({ signal }) : { status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true } },
    async serviceStatus() { return { status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true } },
    async version() { return { version: '0.2.0-offline-candidate', runtime: 'CONTROLLER_V2', releaseIdentityHash } },
  })
  return service
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
  const sessionPersistence=await connectSessionPersistence({url:mcpUrl,token:mcpToken})
  const store = await new EncryptedSessionStore({ persistence:sessionPersistence }).initialize()
  const operationStore = await new EncryptedOperationStore({ root: path.join(sessionRoot, 'operations-v1') }).initialize()
  const mcpClient = await connectMcpRuntime({ url: mcpUrl, token: mcpToken })
  return createProductionService({
    sessionStore: store, operationStore, releaseIdentityHash: identity.identityHash, mcpClient,
    modelConfig: { apiKey: modelApiKey, baseURL, model: modelName },
    recordModelResponse: modelResponseEvidenceWriter(root),
    namespace: configuredNamespace,
    attachmentImporter: createHarnessAttachmentImporter({ harnessUrl, serviceToken }),
    captureLauncher: createLocalCaptureLauncher(),
    ...(configuredJourneyId ? { journeyResolver: async () => configuredJourneyId } : {}),
    writeGate: async () => lifecycle.assertFlowiseAbsent(spec, lifecycle.discoverFlowiseObservation()),
    directExecution: true,
    doctorProbe: ({ signal } = {}) => probeProductReadiness({ root, environment: effectiveEnv, signal }),
  })
}

export function createLazyEnvironmentService(options = {}) {
  let pending
  const get = () => (pending ??= createEnvironmentProductionService(options))
  const root = path.resolve(options.productRoot || fileURLToPath(new URL('../..', import.meta.url)))
  const environment = lifecycle.environmentWithRuntimeFile({ root, environment: options.env || process.env })
  return new Proxy({}, { get: (_target, key) => {
    if (key === 'doctor') return async ({ signal } = {}) => probeProductReadiness({ root, environment, signal })
    if (key === 'serviceStatus') return async () => lifecycle.managedStatus({ root })
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
