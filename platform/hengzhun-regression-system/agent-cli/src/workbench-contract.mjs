import { createRequire } from 'node:module'

const { z } = createRequire(new URL('../../package.json', import.meta.url))('zod')
const object = (shape) => z.object(shape).strict()
const id = z.uuid()
const time = z.iso.datetime()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const version = z.number().int().min(1)
const text = z.string().trim().min(1).max(16000)
const empty = object({})
const state = z.enum(['IDLE', 'RUNNING', 'NEEDS_INPUT', 'COMPLETED', 'FAILED', 'STOP_REQUESTED', 'INTERRUPTED'])
const baseUrl = z.url().max(2048).refine((value) => {
  const url = new URL(value)
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
}, 'Use an HTTP(S) API base URL without credentials, query or fragment.')

export const modelProfileSchema = object({
  id, version, displayName: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(160),
  baseUrl, keyConfigured: z.boolean(), isDefault: z.boolean(),
})
export const modelBindingSchema = object({
  profileId: id, profileVersion: version, model: z.string().min(1).max(160), baseUrlHash: hash, releaseIdentityHash: hash,
})
export const conversationSchema = object({
  id, title: z.string().min(1).max(120), status: state, createdAt: time, updatedAt: time,
  lastTurnId: id.nullable(),
})
export const messageSchema = object({
  id, role: z.enum(['user', 'assistant']), text, createdAt: time, turnId: id.nullable(),
})
export const eventSchema = object({
  sequence: z.number().int().min(1), type: z.enum(['ACCEPTED', 'PLANNING', 'TOOL_STARTED', 'TOOL_FINISHED', 'NEEDS_INPUT', 'COMPLETED', 'FAILED', 'STOP_REQUESTED', 'INTERRUPTED']),
  summary: z.string().min(1).max(500), createdAt: time,
  toolName: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/).optional(),
})
export const turnSchema = object({
  id, conversationId: id, version, status: state.exclude(['IDLE']), inputMessageId: id,
  modelBinding: modelBindingSchema, createdAt: time, updatedAt: time,
  checkpointSessionId: z.string().regex(/^session-[a-f0-9]{32}$/).optional(),
  journeyId: z.string().min(1).max(160).optional(), runId: z.string().min(1).max(160).optional(), taskId: z.string().min(1).max(160).optional(),
  events: z.array(eventSchema).max(100), hasMoreEvents: z.boolean(), answer: text.optional(),
  failureCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/).optional(),
  humanInterventionRequired: z.boolean(),
  continuationOfTurnId: id.optional(),
  result: object({ kind: z.enum(['REPLY', 'TEST']), verdict: z.enum(['NOT_RUN', 'PASSED', 'FAILED', 'UNKNOWN']) }),
})
export const problemSchema = object({
  type: z.literal('about:blank'), title: z.string(), status: z.number().int(), code: z.string(),
})
const saveModel = object({
  displayName: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(160), baseUrl,
  apiKey: z.string().max(4096).meta({ writeOnly: true }).optional(),
})
const checkModel = object({
  model: saveModel.shape.model, baseUrl, apiKey: saveModel.shape.apiKey,
  profileId: id.optional(), profileVersion: version.optional(),
})
const conversationDetail = object({
  conversation: conversationSchema, messages: z.array(messageSchema).max(30), turns: z.array(turnSchema).max(30), nextMessageCursor: id.nullable(),
})
const profileList = object({ models: z.array(modelProfileSchema) })
const checkResult = object({ status: z.enum(['READY', 'FAILED']), code: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/) })
const route = (method, path, operationId, input, output, status = 200, description = '') => ({ method, path, operationId, input, output, status, description })

// Only boundary DTOs live here. No planner, persisted ledger or bank execution is implemented by the transport.
export const workbenchOperations = [
  route('GET', '/bootstrap', 'getAgentBootstrap', null, object({
    csrfToken: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['READY', 'NOT_READY']),
    releaseIdentityHash: hash.nullable(), environment: z.literal('LOCAL'),
    blockingReasons: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/)).max(20),
  })),
  route('GET', '/conversations', 'listAgentConversations', object({
    q: z.string().max(200).optional(), cursor: z.string().max(160).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
  }), object({ conversations: z.array(conversationSchema), nextCursor: z.string().nullable() })),
  route('POST', '/conversations', 'createAgentConversation', object({ title: z.string().trim().min(1).max(120) }), conversationSchema, 201),
  route('GET', '/conversations/{conversationId}', 'getAgentConversation', object({
    before: id.optional(), limit: z.coerce.number().int().min(1).max(30).default(20),
  }), conversationDetail, 200, 'Newest message page, displayed oldest-first; before/nextMessageCursor loads older messages. Include only turns linked from this page. Bound pages to the existing Harness/MCP byte budget, without truncating message text.'),
  route('POST', '/conversations/{conversationId}/messages', 'submitAgentMessage', object({
    submissionId: id, input: text, modelProfileId: id, modelProfileVersion: version,
    attachmentRefs: z.array(z.string().regex(/^att_[a-zA-Z0-9_-]{8,160}$/)).max(5).default([]),
    attachmentMetadata: z.array(object({ attachmentRef: z.string().regex(/^att_[a-zA-Z0-9_-]{8,160}$/),
      originalFilename: z.string().min(1).max(260).refine(value => !/[\\/:\x00-\x1f]/.test(value)) })).max(1).optional(),
  }), turnSchema, 202, 'Atomically persist the submission ID before execution; repeat IDs return the original turn, never replay the bank task. A different payload with the same ID returns 409.'),
  route('GET', '/turns/{turnId}', 'getAgentTurn', object({
    after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(50),
  }), turnSchema, 200, 'Read events after an immutable sequence, bounded by count and the existing Harness/MCP byte budget. hasMoreEvents indicates remaining events. Reads never resume or replay execution.'),
  route('POST', '/turns/{turnId}/cancel', 'cancelAgentTurn', empty, turnSchema, 202,
    'Request Controller stop. STOP_REQUESTED is not a rollback or proof that a dispatched Worker stopped. Unknown bank results require authority readback and human intervention.'),
  route('GET', '/models', 'listAgentModels', null, profileList),
  route('POST', '/models', 'createAgentModel', saveModel, modelProfileSchema, 201),
  route('PUT', '/models/{modelId}', 'updateAgentModel', saveModel.extend({ version }), modelProfileSchema),
  route('POST', '/models/check', 'checkAgentModel', checkModel, checkResult, 200, 'Probe exactly the selected endpoint. No fallback or hidden retry. Never echo provider errors or API keys.'),
  route('PUT', '/models/{modelId}/default', 'setDefaultAgentModel', object({ version }), modelProfileSchema, 200,
    'Default selection affects subsequent tasks only. Running turns retain their model/version/ReleaseIdentity snapshot.'),
  { ...route('POST', '/attachments', 'importAgentAttachment', null, object({
    attachmentRef: z.string().regex(/^att_[a-zA-Z0-9_-]{8,160}$/), sha256: hash, size: z.number().int().nonnegative(),
    originalFilename: z.string().min(1).max(260), mediaType: z.enum(['image/png', 'image/jpeg']),
  }), 201, 'Single PNG/JPEG binary import. X-Hengzhun-Filename contains a base64url UTF-8 filename, never a server path.'), binaryInput: true },
  route('GET', '/turns/{turnId}/evidence', 'getAgentTurnEvidence', null, object({
    schemaVersion: z.literal('hengzhun-cli-evidence-view/v1'), journeyId: z.string(), version: z.number().int().nonnegative(),
    status: z.string(), terminal: z.boolean(), references: object(Object.fromEntries([
      'caseId', 'preparationId', 'candidateId', 'certificateId', 'scriptId', 'scriptHash', 'planId',
      'confirmedDecisionEventId', 'taskId', 'runId', 'scheduleId', 'inboxId', 'resultArtifactId',
    ].map(name => [name, z.string().min(8).max(160).optional()]))),
    artifactCards: z.array(object({ artifactId: z.string().regex(/^art_[0-9a-f-]{36}$/), displayName: z.string().max(240),
      mediaType: z.string().max(160).optional(), sha256: hash.optional(), size: z.number().int().nonnegative().optional(), downloadGrantRequired: z.boolean() })),
  })),
  { ...route('GET', '/turns/{turnId}/artifacts/{artifactId}', 'downloadAgentArtifact', null, null, 200,
    'Download only an artifact in the turn Journey evidence. Internal one-time grant and service tokens never reach the browser.'), binaryOutput: true },
]

const pathParameters = { conversationId: id, turnId: id, modelId: id, artifactId: z.string().regex(/^art_[0-9a-f-]{36}$/) }
export const workbenchPathParameters = object(pathParameters).partial()
export const workbenchPrefix = '/api/agent/v1'

function jsonSchema(schema) {
  const result = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
  delete result.$schema
  return result
}

export function agentWorkbenchOpenApi() {
  const paths = {}
  for (const operation of workbenchOperations) {
    const query = operation.method === 'GET' ? operation.input : null
    const parameters = [...operation.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
      name, in: 'path', required: true, schema: jsonSchema(pathParameters[name]),
    }))
    if (query) {
      const querySchema = jsonSchema(query)
      for (const [name, schema] of Object.entries(querySchema.properties)) {
        parameters.push({ name, in: 'query', required: querySchema.required?.includes(name) ?? false, schema })
      }
    }
    const mutates = operation.method !== 'GET'
    const responses = {
      [operation.status]: { description: operation.description || operation.operationId, content: operation.binaryOutput
        ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
        : { 'application/json': { schema: jsonSchema(operation.output) } } },
      ...Object.fromEntries([400, 403, 404, 409, 413, 415, 500, 503].map((code) => [code, { $ref: '#/components/responses/Problem' }])),
    }
    const requestBody = mutates ? { required: true, content: operation.binaryInput
      ? Object.fromEntries(['image/png', 'image/jpeg'].map(type => [type, { schema: { type: 'string', format: 'binary' } }]))
      : { 'application/json': { schema: jsonSchema(operation.input) } } } : undefined
    if (operation.binaryInput) parameters.push({ name: 'X-Hengzhun-Filename', in: 'header', required: true, schema: { type: 'string', maxLength: 1040 } })
    paths[operation.path] ??= {}
    paths[operation.path][operation.method.toLowerCase()] = {
      operationId: operation.operationId, summary: operation.operationId, ...(operation.description ? { description: operation.description } : {}),
      security: mutates ? [{ LocalCsrf: [] }] : [],
      ...(parameters.length ? { parameters } : {}), ...(requestBody ? { requestBody } : {}), responses,
    }
  }
  return {
    openapi: '3.1.0', info: {
      title: 'Hengzhun Local Agent Workbench', version: '1.1.0',
      description: 'Same-origin loopback browser transport to the existing CLI Controller. Harness SQLite owns state; Quality APIs remain read-only. Only safe execution summaries are exposed, never private reasoning or raw checkpoints.',
      license: { name: 'Mozilla Public License 2.0', identifier: 'MPL-2.0' },
    }, servers: [{ url: workbenchPrefix }], paths,
    components: {
      securitySchemes: { LocalCsrf: { type: 'apiKey', in: 'header', name: 'X-Hengzhun-CSRF', description: 'Process-local token from same-origin bootstrap. Mutations also require an exact Origin and Host. Not a Harness service token.' } },
      schemas: { Problem: jsonSchema(problemSchema) },
      responses: { Problem: { description: 'Explicit failure; no raw dependency error or credential details.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } } },
    },
  }
}
