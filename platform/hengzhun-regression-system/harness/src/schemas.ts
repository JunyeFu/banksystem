import { z } from 'zod';

export const namespaceSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
export const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const caseCreateDraftSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  actorRef: boundedText(128).default('coze-agent'),
  title: boundedText(160),
  objective: boundedText(2000),
  summary: boundedText(1000),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  route: boundedText(512),
  steps: z.array(z.object({
    action: boundedText(500),
    expected: boundedText(500)
  }).strict()).min(1).max(50),
  assertions: z.array(boundedText(500)).min(1).max(50),
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

export const decisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  targetType: z.enum(['SCRIPT_ACTIVATION', 'RUN_RECOVERY']),
  targetId: boundedText(80),
  expectedVersion: z.number().int().positive(),
  choice: z.enum(['APPROVE', 'REJECT', 'RETRY', 'CANCEL']),
  reason: boundedText(1000),
  confirmationRef: boundedText(160)
}).strict();

export type CaseCreateDraftInput = z.infer<typeof caseCreateDraftSchema>;
export type PlanCompileInput = z.infer<typeof planCompileSchema>;
export type RunSubmitInput = z.infer<typeof runSubmitSchema>;
export type DecisionSubmitInput = z.infer<typeof decisionSubmitSchema>;

export function validationIssues(error: z.ZodError): Array<{ path: string; code: string; message: string }> {
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message
  }));
}
