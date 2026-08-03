import { z } from 'zod';

export const targetAdapterBindingSchema = z.object({
  adapterId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/),
  adapterVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

export const namespaceSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
export const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const knowledgeSnapshotRefSchema = z.object({
  knowledgeSnapshotId: boundedText(80),
  sourceVersion: boundedText(80),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  citationIds: z.array(boundedText(160)).min(1).max(50)
}).strict();

export const i9KnowledgeSnapshotRegistrationSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  snapshot: knowledgeSnapshotRefSchema,
  platform: z.literal('FLOWISE'),
  platformResourceId: boundedText(160),
  sourceRef: boundedText(512)
}).strict();

export const regressionCaseDraftSchema = z.object({
  schemaVersion: z.literal('i8-regression-case-draft-v1'),
  title: boundedText(160),
  objective: boundedText(2000),
  summary: boundedText(1000),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  route: boundedText(512),
  preconditions: z.array(boundedText(500)).max(50),
  steps: z.array(z.object({ action: boundedText(500), expected: boundedText(500) }).strict()).min(1).max(50),
  assertions: z.array(boundedText(500)).min(1).max(50),
  knowledgeSnapshot: knowledgeSnapshotRefSchema
}).strict();

export const acceptanceSummarySchema = z.object({
  schemaVersion: z.literal('i8-acceptance-summary-v1'),
  caseTitle: boundedText(160),
  objective: boundedText(1000),
  stepCount: z.number().int().positive().max(50),
  assertionCount: z.number().int().positive().max(50),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  clarificationRequired: z.boolean(),
  clarificationQuestions: z.array(boundedText(500)).max(10)
}).strict();

// Non-secret business fields are deliberately separate from free-form action
// prose.  They are frozen with the CaseDraft, can be displayed back to the
// user for confirmation, and are the only I10 source for transfer/query
// fixtures.  Credentials remain referenced elsewhere by credentialRef.
export const typedBusinessInputsV1Schema = z.object({
  schemaVersion: z.literal('hengzhun-i10-typed-business-inputs-v1'),
  values: z.object({
    dateRange: boundedText(80).optional(),
    filter: boundedText(500).optional(),
    payeeRef: z.string().trim().regex(/^payee_[A-Za-z0-9._:-]{4,120}$/).optional(),
    amount: z.string().trim().regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/).optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
    purpose: boundedText(200).optional()
  }).strict(),
  source: z.enum(['USER_CONFIRMED', 'IMPORT_CONFIRMED', 'OCR_CONFIRMED'])
}).strict().superRefine((value, context) => {
  const transferFields = ['payeeRef', 'amount', 'currency', 'purpose'] as const;
  const present = transferFields.filter(field => Boolean(value.values[field]));
  if (present.length > 0 && present.length !== transferFields.length) {
    context.addIssue({
      code: 'custom', path: ['values'],
      message: '转账业务输入必须同时包含payeeRef、amount、currency和purpose。'
    });
  }
  if (value.values.amount && Number(value.values.amount) <= 0) {
    context.addIssue({ code: 'custom', path: ['values', 'amount'], message: '转账金额必须大于0。' });
  }
});

export const intentPlanSchema = z.object({
  schemaVersion: z.literal('i8-intent-plan-v1'),
  caseId: boundedText(80),
  caseVersion: z.number().int().positive(),
  route: boundedText(512),
  executionProfile: z.enum(['LOGIN_PROFILE', 'TRANSFER_UKEY_ORDER_QUERY', 'GENERIC_WEB']).default('LOGIN_PROFILE'),
  targetProfileId: boundedText(80).optional(),
  targetProfileVersion: z.number().int().positive().optional(),
  targetProfileHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  targetProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
  adapterBinding: targetAdapterBindingSchema.optional(),
  inputContractVersion: z.enum(['LEGACY', 'TypedBusinessInputsV1']).default('LEGACY'),
  typedBusinessInputs: typedBusinessInputsV1Schema.optional(),
  steps: z.array(z.object({
    intentStepId: boundedText(80),
    action: boundedText(500),
    expected: boundedText(500),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    inputValue: z.string().trim().max(500).optional(),
    inputValueSource: z.enum(['USER_TEXT', 'CREDENTIAL_REF', 'RUNTIME_USER_INPUT', 'NONE']).default('NONE')
  }).strict()).min(1).max(50),
  assertions: z.array(boundedText(500)).min(1).max(50)
}).strict().superRefine((value, context) => {
  if (value.executionProfile === 'GENERIC_WEB' &&
      (!value.targetProfileId || !value.targetProfileVersion || !value.targetProfileHash || !value.targetProfileSnapshot)) {
    context.addIssue({ code: 'custom', path: ['targetProfileId'], message: '通用Web计划必须冻结目标站点档案。' });
  }
  if (value.executionProfile !== 'GENERIC_WEB' && !value.adapterBinding) {
    context.addIssue({ code: 'custom', path: ['adapterBinding'], message: '受控适配器计划必须冻结显式适配器绑定。' });
  }
  if (value.executionProfile === 'TRANSFER_UKEY_ORDER_QUERY') {
    // I10 service paths always set TypedBusinessInputsV1.  Retain LEGACY for
    // immutable I9 replay evidence, where the Builder deliberately keeps its
    // old frozen-plan compatibility path.  This schema must not retroactively
    // invalidate historical certificates.
    if (value.inputContractVersion === 'TypedBusinessInputsV1') {
      const inputs = value.typedBusinessInputs?.values;
      for (const field of ['payeeRef', 'amount', 'currency', 'purpose'] as const) {
        if (!inputs?.[field]) context.addIssue({ code: 'custom', path: ['typedBusinessInputs', 'values', field], message: `转账计划缺少${field}。` });
      }
    }
  }
});

export const executableActionPlanSchema = z.object({
  schemaVersion: z.literal('i8-executable-action-plan-v1'),
  planId: boundedText(80),
  caseId: boundedText(80),
  caseVersion: z.number().int().positive(),
  actions: z.array(z.object({
    actionId: boundedText(80),
    ordinal: z.number().int().positive(),
    actionType: z.enum(['LOCATE', 'INPUT', 'TAP', 'SCROLL']),
    prompt: boundedText(500),
    targetRef: z.enum(['PAGE', 'LOGIN_USERNAME', 'LOGIN_SSO_TAB', 'LOGIN_SUBMIT']),
    valueRef: z.enum(['SYNTHETIC_TEXT']).optional(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    preconditions: z.array(boundedText(500)).max(20),
    invariants: z.array(boundedText(500)).min(1).max(20),
    postconditions: z.array(boundedText(500)).min(1).max(20),
    sourceIntentStepId: boundedText(80)
  }).strict()).min(1).max(50)
}).strict();

const structuredCaseSchema = z.object({
  externalCaseRef: boundedText(128),
  title: boundedText(160),
  objective: boundedText(2000),
  summary: boundedText(1000),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  route: boundedText(512),
  executionProfile: z.enum(['LOGIN_PROFILE', 'ACCOUNT_OWNERSHIP', 'AUTH_REJECTION_RECOVERY']),
  steps: z.array(z.object({
    action: boundedText(500),
    expected: boundedText(500)
  }).strict()).min(1).max(50),
  assertions: z.array(boundedText(500)).min(1).max(50)
}).strict();

export const caseCreateDraftSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  actorRef: boundedText(128).default('coze-agent'),
  title: boundedText(160),
  objective: boundedText(2000),
  summary: boundedText(1000),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  route: boundedText(512),
  executionProfile: z.enum(['LOGIN_PROFILE', 'ACCOUNT_OWNERSHIP', 'AUTH_REJECTION_RECOVERY']).optional(),
  steps: z.array(z.object({
    action: boundedText(500),
    expected: boundedText(500)
  }).strict()).min(1).max(50),
  assertions: z.array(boundedText(500)).min(1).max(50),
  authoringActions: z.array(z.object({
    actionType: z.enum(['LOCATE', 'INPUT', 'TAP', 'SCROLL']),
    prompt: boundedText(500),
    targetRef: z.enum(['PAGE', 'LOGIN_USERNAME', 'LOGIN_SSO_TAB', 'LOGIN_SUBMIT']),
    valueRef: z.enum(['SYNTHETIC_TEXT']).optional(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH'])
  }).strict()).min(1).max(50).optional(),
  credentialAlias: boundedText(128).optional(),
  knowledgeRetrieval: z.object({
    sourceAuthority: z.literal('COZE_KNOWLEDGE_BASE'),
    query: boundedText(1000),
    resultSummary: boundedText(2000),
    citationRefs: z.array(boundedText(256)).min(1).max(20)
  }).strict().optional()
}).strict();

export const planCompileSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedCaseVersion: z.number().int().positive(),
  executionRoute: z.enum(['PLAYWRIGHT', 'AUTHORING_REQUIRED']).default('PLAYWRIGHT')
}).strict();

export const runSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  caseId: boundedText(80),
  expectedCaseVersion: z.number().int().positive(),
  planId: boundedText(80),
  environment: z.enum(['local']),
  credentialAlias: boundedText(128)
}).strict();

export const caseImportSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  actorRef: boundedText(128).default('coze-agent'),
  sourceFormat: z.literal('HENGZHUN_JSON_V1'),
  sourceRef: boundedText(256),
  cases: z.array(structuredCaseSchema).min(1).max(50)
}).strict().superRefine((value, context) => {
  const references = new Set<string>();
  value.cases.forEach((item, index) => {
    if (references.has(item.externalCaseRef)) {
      context.addIssue({
        code: 'custom',
        path: ['cases', index, 'externalCaseRef'],
        message: '同一导入批次内 externalCaseRef 必须唯一。'
      });
    }
    references.add(item.externalCaseRef);
  });
});

export const repairCandidateCreateSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  incidentId: boundedText(80),
  credentialAlias: boundedText(128)
}).strict();

export const scheduleCreateSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  caseId: boundedText(80),
  expectedCaseVersion: z.number().int().positive(),
  planId: boundedText(80),
  credentialAlias: boundedText(128),
  cronExpression: boundedText(128),
  timezone: boundedText(80),
  environment: z.literal('local'),
  fixtureScope: boundedText(128).regex(/^[A-Za-z0-9._:-]+$/),
  misfirePolicy: z.enum(['SKIP', 'RUN_ONCE']).default('RUN_ONCE'),
  misfireGraceSeconds: z.number().int().min(0).max(86400).default(300),
  maxRetries: z.number().int().min(0).max(5).default(1)
}).strict();

export const scheduleGetSchema = z.object({ namespace: namespaceSchema, scheduleId: boundedText(80) }).strict();
export const scheduleDisableSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  scheduleId: boundedText(80),
  expectedVersion: z.number().int().positive(),
  reason: boundedText(1000)
}).strict();

export const decisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  targetType: z.enum(['SCRIPT_ACTIVATION', 'RUN_RECOVERY', 'REPAIR_CANDIDATE_ACTIVATION', 'SCHEDULE_RECOVERY']),
  targetId: boundedText(80),
  expectedVersion: z.number().int().positive(),
  choice: z.enum(['APPROVE', 'REJECT', 'RETRY', 'CANCEL']),
  reason: boundedText(1000),
  confirmationRef: boundedText(160)
}).strict();

export type CaseCreateDraftInput = z.infer<typeof caseCreateDraftSchema>;
export type PlanCompileInput = z.infer<typeof planCompileSchema>;
export type RunSubmitInput = z.infer<typeof runSubmitSchema>;
export type CaseImportSubmitInput = z.infer<typeof caseImportSubmitSchema>;
export type RepairCandidateCreateInput = z.infer<typeof repairCandidateCreateSchema>;
export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;
export type ScheduleDisableInput = z.infer<typeof scheduleDisableSchema>;
export type DecisionSubmitInput = z.infer<typeof decisionSubmitSchema>;
export type I9KnowledgeSnapshotRegistrationInput = z.infer<typeof i9KnowledgeSnapshotRegistrationSchema>;


export function validationIssues(error: z.ZodError): Array<{ path: string; code: string; message: string }> {
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message
  }));
}
