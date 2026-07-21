import { z } from 'zod';
import { HarnessError } from './errors';
import { canonicalJson } from './utils';

export const contextLevelSchema = z.enum(['CTX-L1', 'CTX-L2', 'CTX-L3']);
export const contextConsumerSchema = z.enum(['VISION_LLM', 'CONTROLLER_LLM']);
export const budgetDecisionSchema = z.enum(['ALLOW', 'REDUCE', 'SPLIT', 'PLAYWRIGHT_ONLY', 'WAITING_USER']);
export const modelUsageStatusSchema = z.enum(['PROVIDER_REPORTED', 'NOT_EXPOSED', 'NOT_INVOKED']);

export type ContextLevel = z.infer<typeof contextLevelSchema>;
export type ContextConsumer = z.infer<typeof contextConsumerSchema>;
export type BudgetDecision = z.infer<typeof budgetDecisionSchema>;

export const MODEL_CONTEXT_POLICIES = {
  VISION_LLM: {
    modelContextLimitTokens: 16_000,
    inputBudgetTokens: 12_000,
    reservedOutputTokens: 4_000
  },
  CONTROLLER_LLM: {
    modelContextLimitTokens: 16_000,
    inputBudgetTokens: 12_000,
    reservedOutputTokens: 4_000
  }
} as const;

const verificationFactsSchema = z.object({
  dom: z.boolean(),
  url: z.boolean(),
  request: z.boolean(),
  business: z.boolean()
}).strict();

const previousActionSummarySchema = z.object({
  ordinal: z.number().int().positive(),
  actionType: z.enum(['LOCATE', 'INPUT', 'TAP', 'SCROLL']),
  summary: z.string().trim().min(1).max(1000)
}).strict();

const recentFactsSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  verification: verificationFactsSchema
}).strict();

const minimalDependencyConeSchema = z.object({
  caseId: z.string().min(8).max(80),
  caseVersion: z.number().int().positive(),
  executionProfile: z.enum(['LOGIN_PROFILE', 'ACCOUNT_OWNERSHIP', 'AUTH_REJECTION_RECOVERY']).nullable(),
  assertionCount: z.number().int().nonnegative().max(50).nullable()
}).strict();

export const modelUsageSchema = z.object({
  status: modelUsageStatusSchema,
  provider: z.literal('mimo').optional(),
  model: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional()
}).strict().superRefine((value, context) => {
  if (value.status === 'PROVIDER_REPORTED') {
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
      if (value[field] === undefined) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} is required for provider-reported usage` });
      }
    }
    if (value.inputTokens !== undefined && value.outputTokens !== undefined && value.totalTokens !== undefined
      && value.inputTokens + value.outputTokens !== value.totalTokens) {
      context.addIssue({ code: 'custom', path: ['totalTokens'], message: 'totalTokens must equal inputTokens + outputTokens' });
    }
  } else if (value.inputTokens !== undefined || value.outputTokens !== undefined || value.totalTokens !== undefined) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'token counts require PROVIDER_REPORTED status' });
  }
});

const currentActionSchema = z.object({
  actionType: z.enum(['LOCATE', 'INPUT', 'TAP', 'SCROLL']),
  prompt: z.string().trim().min(1).max(500),
  targetRef: z.enum(['PAGE', 'LOGIN_USERNAME', 'LOGIN_SSO_TAB', 'LOGIN_SUBMIT']),
  valueRef: z.enum(['SYNTHETIC_TEXT']).nullable(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  executionMode: z.enum([
    'MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY',
    'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE',
    'PLAYWRIGHT_ONLY'
  ])
}).strict();

export const actionContextEnvelopeSchema = z.object({
  schemaVersion: z.literal('i8-action-context-v1'),
  consumerType: z.literal('VISION_LLM'),
  contextLevel: contextLevelSchema,
  modelContextLimitTokens: z.literal(16_000),
  inputBudgetTokens: z.literal(12_000),
  reservedOutputTokens: z.literal(4_000),
  estimatedInputTokens: z.number().int().nonnegative(),
  imageTokenEstimate: z.number().int().nonnegative(),
  tokenizerId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/),
  budgetDecision: budgetDecisionSchema,
  redactionProfileId: z.literal('HZ_REDACTION_V1'),
  pageSignature: z.object({
    route: z.string().max(512).nullable(),
    signature: z.string().min(1).max(256),
    source: z.enum(['PLAYWRIGHT_VERIFIED', 'INITIAL_UNKNOWN'])
  }).strict(),
  invariants: z.array(z.string().min(1).max(160)).min(1).max(16),
  allowedTargets: z.array(z.string().min(1).max(128)).min(1).max(16),
  fixtureRefs: z.array(z.string().min(1).max(128)).max(16),
  recentFacts: recentFactsSchema.nullable(),
  previousActionSummary: previousActionSummarySchema.nullable(),
  currentAction: currentActionSchema,
  nextActionPreview: z.object({
    actionType: z.enum(['LOCATE', 'INPUT', 'TAP', 'SCROLL']),
    prompt: z.string().trim().min(1).max(500)
  }).strict().nullable(),
  minimalDependencyCone: minimalDependencyConeSchema.nullable(),
  lease: z.object({
    slotId: z.string().min(8).max(80),
    owner: z.string().min(3).max(128),
    expiresAt: z.string().min(20).max(40)
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.contextLevel === 'CTX-L1' && (value.previousActionSummary !== null || value.nextActionPreview !== null || value.minimalDependencyCone !== null)) {
    context.addIssue({ code: 'custom', path: ['contextLevel'], message: 'CTX-L1 must not include adjacent or dependency context' });
  }
  if (value.contextLevel === 'CTX-L2' && value.minimalDependencyCone !== null) {
    context.addIssue({ code: 'custom', path: ['minimalDependencyCone'], message: 'CTX-L2 must not include a dependency cone' });
  }
  if (value.estimatedInputTokens > value.inputBudgetTokens && !['PLAYWRIGHT_ONLY', 'WAITING_USER'].includes(value.budgetDecision)) {
    context.addIssue({ code: 'custom', path: ['budgetDecision'], message: 'over-budget visual context must fail closed' });
  }
});

export type ActionContextEnvelope = z.infer<typeof actionContextEnvelopeSchema>;
export type ModelUsage = z.infer<typeof modelUsageSchema>;

export interface ActionContextBuildInput {
  contextLevel: ContextLevel;
  tokenizerId: string;
  imageTokenEstimate: number;
  workerId: string;
  slotId: string;
  leaseExpiresAt: string;
  currentAction: z.infer<typeof currentActionSchema>;
  previousActionSummary: z.infer<typeof previousActionSummarySchema> | null;
  nextActionPreview: { actionType: 'LOCATE' | 'INPUT' | 'TAP' | 'SCROLL'; prompt: string } | null;
  recentFacts: z.infer<typeof recentFactsSchema> | null;
  currentPageState: Record<string, unknown> | null;
  minimalDependencyCone: z.infer<typeof minimalDependencyConeSchema> | null;
  fixtureRefs?: string[];
}

export function estimateTextTokens(value: unknown, fixedOverheadTokens = 1_024): number {
  return fixedOverheadTokens + Math.ceil(Buffer.byteLength(canonicalJson(value), 'utf8') / 2);
}

export function estimateImageTokens(width: number, height: number): number {
  const safeWidth = Math.max(1, Math.min(Math.trunc(width), 16_384));
  const safeHeight = Math.max(1, Math.min(Math.trunc(height), 16_384));
  return Math.ceil(safeWidth / 512) * Math.ceil(safeHeight / 512) * 1_024;
}

export function assertContextBudget(consumer: ContextConsumer, estimatedInputTokens: number): void {
  const policy = MODEL_CONTEXT_POLICIES[consumer];
  if (estimatedInputTokens <= policy.inputBudgetTokens
    && estimatedInputTokens + policy.reservedOutputTokens <= policy.modelContextLimitTokens) return;
  throw new HarnessError(
    413,
    consumer === 'VISION_LLM' ? 'VISION_CONTEXT_BUDGET_EXCEEDED' : 'CONTROLLER_CONTEXT_BUDGET_EXCEEDED',
    'CONTRACT',
    consumer === 'VISION_LLM' ? '视觉模型上下文超过安全预算。' : '主控模型上下文超过安全预算。',
    false,
    consumer === 'VISION_LLM',
    { consumer, estimatedInputTokens, ...policy }
  );
}

function pageSignature(state: Record<string, unknown> | null): ActionContextEnvelope['pageSignature'] {
  const route = typeof state?.route === 'string' ? state.route.slice(0, 512) : null;
  return {
    route,
    signature: route ? `route:${route}` : 'initial-page-state',
    source: route ? 'PLAYWRIGHT_VERIFIED' : 'INITIAL_UNKNOWN'
  };
}

export function buildActionContextEnvelope(input: ActionContextBuildInput): ActionContextEnvelope {
  const policy = MODEL_CONTEXT_POLICIES.VISION_LLM;
  const base = {
    schemaVersion: 'i8-action-context-v1' as const,
    consumerType: 'VISION_LLM' as const,
    contextLevel: input.contextLevel,
    modelContextLimitTokens: policy.modelContextLimitTokens,
    inputBudgetTokens: policy.inputBudgetTokens,
    reservedOutputTokens: policy.reservedOutputTokens,
    estimatedInputTokens: 0,
    imageTokenEstimate: input.imageTokenEstimate,
    tokenizerId: input.tokenizerId,
    budgetDecision: 'ALLOW' as BudgetDecision,
    redactionProfileId: 'HZ_REDACTION_V1' as const,
    pageSignature: pageSignature(input.currentPageState),
    invariants: ['NO_SECRET_DISCLOSURE', 'ALLOWLISTED_TARGET_ONLY', 'PLAYWRIGHT_VERIFICATION_REQUIRED'],
    allowedTargets: [input.currentAction.targetRef],
    fixtureRefs: input.fixtureRefs ?? [],
    recentFacts: input.recentFacts,
    previousActionSummary: input.contextLevel === 'CTX-L1' ? null : input.previousActionSummary,
    currentAction: input.currentAction,
    nextActionPreview: input.contextLevel === 'CTX-L1' ? null : input.nextActionPreview,
    minimalDependencyCone: input.contextLevel === 'CTX-L3' ? input.minimalDependencyCone : null,
    lease: { slotId: input.slotId, owner: input.workerId, expiresAt: input.leaseExpiresAt }
  };
  const firstPassEstimate = estimateTextTokens(base) + input.imageTokenEstimate;
  const estimatedInputTokens = estimateTextTokens({ ...base, estimatedInputTokens: firstPassEstimate }) + input.imageTokenEstimate;
  const overBudget = estimatedInputTokens > policy.inputBudgetTokens
    || estimatedInputTokens + policy.reservedOutputTokens > policy.modelContextLimitTokens;
  const envelope = {
    ...base,
    estimatedInputTokens,
    budgetDecision: overBudget ? 'PLAYWRIGHT_ONLY' as const : 'ALLOW' as const,
    currentAction: overBudget ? { ...base.currentAction, executionMode: 'PLAYWRIGHT_ONLY' as const } : base.currentAction
  };
  return actionContextEnvelopeSchema.parse(envelope);
}

export function buildMidscenePrompt(envelope: ActionContextEnvelope): string {
  const parsed = actionContextEnvelopeSchema.parse(envelope);
  if (parsed.budgetDecision !== 'ALLOW') {
    throw new HarnessError(409, 'VISION_CONTEXT_NOT_AUTHORIZED', 'CONTRACT', '当前上下文未获视觉模型调用授权。');
  }
  return [
    '你是衡准受限视觉定位代理。只处理下面受控 JSON 中的 currentAction；相邻上下文只用于消歧。',
    '不得推断或输出凭据，不得操作 allowedTargets 之外的目标，不得宣称业务断言通过。',
    canonicalJson(parsed)
  ].join('\n');
}
