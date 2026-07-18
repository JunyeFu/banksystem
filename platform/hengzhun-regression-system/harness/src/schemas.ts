import { z } from 'zod';

export const namespaceSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
export const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

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

export function validationIssues(error: z.ZodError): Array<{ path: string; code: string; message: string }> {
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message
  }));
}
