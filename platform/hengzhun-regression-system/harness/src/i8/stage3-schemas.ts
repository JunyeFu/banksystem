import { z } from 'zod';
import { idempotencyKeySchema, namespaceSchema } from '../schemas';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const safeRef = boundedText(160).regex(/^[A-Za-z0-9._:-]+$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const dslOperationSchema = z.enum([
  'goto',
  'fill',
  'click',
  'select',
  'waitForURL',
  'waitForResponse',
  'expectVisible',
  'expectText',
  'expectEqual',
  'screenshot'
]);

export const locatorKindSchema = z.enum(['ROLE', 'LABEL', 'TEST_ID']);

export const pageSignatureSchema = z.object({
  routePatternRef: safeRef,
  landmarkRef: safeRef,
  requiredAriaRefs: z.array(safeRef).max(20)
}).strict();

export const executableActionSchema = z.object({
  actionId: safeRef,
  ordinal: z.number().int().positive().max(100),
  operation: dslOperationSchema,
  pageSignature: pageSignatureSchema,
  semanticTargetRef: safeRef.optional(),
  comparisonTargetRef: safeRef.optional(),
  routeRef: safeRef.optional(),
  routePatternRef: safeRef.optional(),
  responsePatternRef: safeRef.optional(),
  optionRef: safeRef.optional(),
  fixtureRefs: z.array(safeRef).max(10),
  preconditions: z.array(boundedText(500)).max(20),
  invariants: z.array(boundedText(500)).min(1).max(20),
  postconditions: z.array(boundedText(500)).max(20),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  retryPolicy: z.object({ maximumRetries: z.union([z.literal(0), z.literal(1)]), sideEffectFree: z.boolean() }).strict(),
  branchRules: z.array(boundedText(500)).max(10),
  failureExit: z.enum(['FAIL_ACTION', 'PLAYWRIGHT_ONLY', 'WAITING_USER']),
  evidencePolicy: z.enum(['NONE', 'FACTS', 'SCREENSHOT', 'FACTS_AND_SCREENSHOT']),
  sourceIntentStepId: safeRef
}).strict().superRefine((value, context) => {
  const targetOperations = new Set(['fill', 'click', 'select', 'expectVisible', 'expectText', 'expectEqual']);
  if (targetOperations.has(value.operation) && !value.semanticTargetRef) {
    context.addIssue({ code: 'custom', path: ['semanticTargetRef'], message: '目标操作必须引用受控语义目标。' });
  }
  if (value.operation === 'expectEqual' && !value.comparisonTargetRef) {
    context.addIssue({ code: 'custom', path: ['comparisonTargetRef'], message: '相等断言必须引用第二个受控目标。' });
  }
  if (value.operation === 'goto' && !value.routeRef) {
    context.addIssue({ code: 'custom', path: ['routeRef'], message: 'goto 必须引用受控路由。' });
  }
  if (value.operation === 'waitForURL' && !value.routePatternRef) {
    context.addIssue({ code: 'custom', path: ['routePatternRef'], message: 'waitForURL 必须引用受控路由模式。' });
  }
  if (value.operation === 'waitForResponse' && !value.responsePatternRef) {
    context.addIssue({ code: 'custom', path: ['responsePatternRef'], message: 'waitForResponse 必须引用受控响应模式。' });
  }
  if (value.operation === 'select' && !value.optionRef) {
    context.addIssue({ code: 'custom', path: ['optionRef'], message: 'select 必须引用受控选项。' });
  }
  if (value.operation === 'fill' && value.fixtureRefs.length !== 1) {
    context.addIssue({ code: 'custom', path: ['fixtureRefs'], message: 'fill 必须且只能引用一个 Fixture 值。' });
  }
});

export const executableActionPlanSchema = z.object({
  schemaVersion: z.literal('i8-executable-action-plan-v1'),
  executablePlanId: safeRef,
  caseId: safeRef,
  caseVersion: z.number().int().positive(),
  intentPlanHash: sha256Schema,
  planVersion: z.number().int().positive(),
  fixtureProfile: z.literal('LOGIN_PROFILE'),
  actions: z.array(executableActionSchema).min(1).max(100)
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.actions.forEach((action, index) => {
    if (action.ordinal !== index + 1) context.addIssue({ code: 'custom', path: ['actions', index, 'ordinal'], message: '动作 ordinal 必须从 1 连续递增。' });
    if (ids.has(action.actionId)) context.addIssue({ code: 'custom', path: ['actions', index, 'actionId'], message: '动作 ID 不得重复。' });
    ids.add(action.actionId);
  });
});

export const verifiedActionRecordSchema = z.object({
  schemaVersion: z.literal('i8-verified-action-record-v1'),
  executablePlanId: safeRef,
  actionId: safeRef,
  ordinal: z.number().int().positive().max(100),
  outcome: z.literal('VERIFIED_PASSED'),
  locator: z.object({ kind: locatorKindSchema, value: boundedText(256) }).strict().optional(),
  pageSignatureHash: sha256Schema,
  factsHash: sha256Schema,
  verification: z.object({ dom: z.boolean(), url: z.boolean(), request: z.boolean(), business: z.boolean() }).strict(),
  contextLevel: z.enum(['CTX-L1', 'CTX-L2', 'CTX-L3']).optional(),
  contextEnvelopeHash: sha256Schema.optional(),
  visualEvidence: z.object({
    invocation: z.literal('REAL'),
    provider: z.literal('MIDSCENE'),
    model: boundedText(160).regex(/^[A-Za-z0-9._:/-]+$/),
    promptHash: sha256Schema,
    locatorMatched: z.literal(true)
  }).strict().optional(),
  verifiedAt: z.string().datetime({ offset: true })
}).strict().superRefine((value, context) => {
  if (!Object.values(value.verification).every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['verification'], message: '候选生成前所有 Playwright 事实必须通过。' });
  }
});

const dslBase = z.object({ stepId: safeRef, sourceActionId: safeRef }).strict();
const dslTarget = dslBase.extend({ targetRef: safeRef }).strict();

export const dslStepSchema = z.discriminatedUnion('operation', [
  dslBase.extend({ operation: z.literal('goto'), routeRef: safeRef }).strict(),
  dslTarget.extend({ operation: z.literal('fill'), fixtureValueRef: safeRef }).strict(),
  dslTarget.extend({ operation: z.literal('click') }).strict(),
  dslTarget.extend({ operation: z.literal('select'), optionRef: safeRef }).strict(),
  dslBase.extend({ operation: z.literal('waitForURL'), routePatternRef: safeRef, timeoutPolicyRef: safeRef }).strict(),
  dslBase.extend({ operation: z.literal('waitForResponse'), responsePatternRef: safeRef, timeoutPolicyRef: safeRef }).strict(),
  dslTarget.extend({ operation: z.literal('expectVisible') }).strict(),
  dslTarget.extend({ operation: z.literal('expectText'), expectedTextRef: safeRef }).strict(),
  dslTarget.extend({ operation: z.literal('expectEqual'), comparisonTargetRef: safeRef }).strict(),
  dslBase.extend({ operation: z.literal('screenshot'), evidenceNameRef: safeRef }).strict()
]);

export const dslDocumentSchema = z.object({
  schemaVersion: z.literal('HENGZHUN_DSL_V1'),
  executablePlanId: safeRef,
  steps: z.array(dslStepSchema).min(1).max(100)
}).strict();

export const i8CandidateCompileSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  preparationId: safeRef,
  expectedPreparationVersion: z.number().int().positive(),
  stabilityPolicyVersion: z.enum(['I8_2X3_V1', 'I10_2X2_V1']).default('I8_2X3_V1')
}).strict();

export const i8CandidateGetSchema = z.object({
  namespace: namespaceSchema,
  preparationId: safeRef
}).strict();

export const i8CandidateBuildCompletionSchema = z.object({
  workerId: safeRef,
  planHash: sha256Schema,
  outcome: z.enum(['VERIFIED_PASSED', 'FAILED']),
  errorCode: safeRef.optional(),
  verifiedActionRecords: z.array(verifiedActionRecordSchema).max(100)
}).strict().superRefine((value, context) => {
  if (value.outcome === 'VERIFIED_PASSED' && value.verifiedActionRecords.length === 0) {
    context.addIssue({ code: 'custom', path: ['verifiedActionRecords'], message: '通过时必须提交 Playwright 验证事实。' });
  }
  if (value.outcome === 'FAILED' && !value.errorCode) {
    context.addIssue({ code: 'custom', path: ['errorCode'], message: '失败时必须提供受控错误码。' });
  }
});

export type ExecutableActionPlan = z.infer<typeof executableActionPlanSchema>;
export type VerifiedActionRecord = z.infer<typeof verifiedActionRecordSchema>;
export type DslDocument = z.infer<typeof dslDocumentSchema>;
export type I8CandidateCompileInput = z.infer<typeof i8CandidateCompileSchema>;
export type I8CandidateBuildCompletionInput = z.infer<typeof i8CandidateBuildCompletionSchema>;
