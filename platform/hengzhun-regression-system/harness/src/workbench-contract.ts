import { z } from 'zod';

const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const id = z.uuid();
const version = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime();
const text = z.string().trim().min(1).max(16000);
const ref = z.string().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const status = z.enum(['RUNNING', 'NEEDS_INPUT', 'COMPLETED', 'FAILED', 'STOP_REQUESTED', 'INTERRUPTED']);
const event = object({
  type: z.enum(['PLANNING', 'TOOL_STARTED', 'TOOL_FINISHED', 'NEEDS_INPUT', 'COMPLETED', 'FAILED', 'STOP_REQUESTED', 'INTERRUPTED']),
  summary: z.string().trim().min(1).max(500), toolName: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/).optional()
});
const baseUrl = z.url().max(2048);
const profile = object({
  id, version, displayName: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(160),
  baseUrl, keyConfigured: z.boolean(), isDefault: z.boolean()
});
export const workbenchBindingSchema = object({ profileId: id, profileVersion: version, model: profile.shape.model, baseUrlHash: hash, releaseIdentityHash: hash });
const conversation = object({ id, title: z.string().min(1).max(120), status: z.enum(['IDLE', ...status.options]), createdAt: instant, updatedAt: instant, lastTurnId: id.nullable() });
const message = object({ id, role: z.enum(['user', 'assistant']), text, createdAt: instant, turnId: id });
const turn = object({
  id, conversationId: id, version, status, inputMessageId: id, modelBinding: workbenchBindingSchema,
  createdAt: instant, updatedAt: instant, checkpointSessionId: z.string().regex(/^session-[a-f0-9]{32}$/).optional(),
  journeyId: ref.optional(), runId: ref.optional(), taskId: ref.optional(), answer: text.optional(),
  continuationOfTurnId: id.optional(),
  failureCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/).optional(), humanInterventionRequired: z.boolean(),
  events: z.array(event.extend({ type: z.enum(['ACCEPTED', ...event.shape.type.options]), sequence: version, createdAt: instant })).max(100),
  hasMoreEvents: z.boolean()
});
export type WorkbenchTurn = z.infer<typeof turn>;
export type WorkbenchConversation = z.infer<typeof conversation>;
export type WorkbenchProfile = z.infer<typeof profile>;

const createConversation = object({ conversationId: id, title: z.string().trim().min(1).max(120) });
const listConversations = object({ q: z.string().trim().max(200).optional(), cursor: z.string().max(160).optional(), limit: z.number().int().min(1).max(100).default(30) });
const getConversation = object({ conversationId: id, before: id.optional(), limit: z.number().int().min(1).max(30).default(20) });
const saveModel = object({
  modelId: id, expectedVersion: z.number().int().min(0), displayName: profile.shape.displayName, model: profile.shape.model,
  baseUrl, keyRef: z.string().regex(/^modelkey_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
});
const getModel = object({ modelId: id, version: version.optional() });
const defaultModel = object({ modelId: id, expectedVersion: version });
const submitTurn = object({
  conversationId: id, submissionId: id, input: text, modelProfileId: id, modelProfileVersion: version, releaseIdentityHash: hash,
  attachmentRefs: z.array(z.string().regex(/^att_[A-Za-z0-9_-]{8,160}$/)).max(5).default([]),
  attachmentMetadata: z.array(object({ attachmentRef: z.string().regex(/^att_[A-Za-z0-9_-]{8,160}$/),
    originalFilename: z.string().min(1).max(260).refine(value => !/[\\/:\x00-\x1f]/.test(value)) })).max(1).optional()
});
const getTurn = object({ turnId: id, after: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50) });
const updateTurn = object({
  turnId: id, expectedVersion: version, status, event,
  checkpointSessionId: turn.shape.checkpointSessionId, journeyId: turn.shape.journeyId,
  runId: turn.shape.runId, taskId: turn.shape.taskId, answer: turn.shape.answer,
  failureCode: turn.shape.failureCode, humanInterventionRequired: z.boolean()
});

export const workbenchOperations = {
  workbench_submission_get: { route: '/v1/workbench/submissions:get', access: 'READ', input: object({
    conversationId: id, submissionId: id.optional(), turnId: id.optional()
  }).refine(value => Boolean(value.submissionId) !== Boolean(value.turnId)), output: object({ turn: turn.nullable(), request: submitTurn.nullable() }) },
  workbench_conversation_create: { route: '/v1/workbench/conversations:create', access: 'WRITE', input: createConversation, output: conversation },
  workbench_conversation_list: { route: '/v1/workbench/conversations:list', access: 'READ', input: listConversations, output: object({ conversations: z.array(conversation), nextCursor: z.string().nullable() }) },
  workbench_conversation_get: { route: '/v1/workbench/conversations:get', access: 'READ', input: getConversation, output: object({ conversation, messages: z.array(message).max(30), turns: z.array(turn).max(30), nextMessageCursor: id.nullable() }) },
  workbench_model_save: { route: '/v1/workbench/models:save', access: 'WRITE', input: saveModel, output: profile },
  workbench_model_list: { route: '/v1/workbench/models:list', access: 'READ', input: object({}), output: object({ models: z.array(profile) }) },
  workbench_model_get: { route: '/v1/workbench/models:get', access: 'READ', input: getModel, output: profile.extend({ keyRef: saveModel.shape.keyRef }) },
  workbench_model_default: { route: '/v1/workbench/models:default', access: 'WRITE', input: defaultModel, output: profile },
  workbench_turn_submit: { route: '/v1/workbench/turns:submit', access: 'WRITE', input: submitTurn, output: object({ created: z.boolean(), turn }) },
  workbench_turn_get: { route: '/v1/workbench/turns:get', access: 'READ', input: getTurn, output: turn },
  workbench_turn_update: { route: '/v1/workbench/turns:update', access: 'WRITE', input: updateTurn, output: turn }
} as const;
export type WorkbenchOperation = keyof typeof workbenchOperations;
export type SubmitTurn = z.infer<typeof submitTurn>;
export type UpdateTurn = z.infer<typeof updateTurn>;
export type SaveModel = z.infer<typeof saveModel>;

export const WORKBENCH_OUTPUT_BYTES = 128 * 1024;
export function workbenchContract(): Record<string, unknown> {
  const schema = (value: z.ZodType) => {
    const result = z.toJSONSchema(value, { io: 'input' });
    delete result.$schema;
    return result;
  };
  return {
    schemaVersion: 'hengzhun-workbench-metadata/v1', contractVersion: '1.1.0',
    transport: 'streamable-http', endpointPath: '/mcp/workbench', authentication: 'bearer', additionalToolsAllowed: false,
    description: 'Controller-owned conversation metadata only; never dispatches execution or becomes model-visible tools. Namespace is server-bound.',
    tools: Object.entries(workbenchOperations).map(([name, value]) => ({
      name, route: value.route, access: value.access, maxOutputBytes: WORKBENCH_OUTPUT_BYTES,
      inputSchema: schema(value.input), outputSchema: schema(value.output)
    }))
  };
}
