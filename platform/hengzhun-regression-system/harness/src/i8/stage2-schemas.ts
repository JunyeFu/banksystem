import { z } from 'zod';
import {
  acceptanceSummarySchema,
  idempotencyKeySchema,
  intentPlanSchema,
  namespaceSchema,
  regressionCaseDraftSchema
} from '../schemas';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]+$/;
const FORBIDDEN_NATURAL_LANGUAGE = /(?:\bBearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{8,}|[A-Za-z]:\\|\.\.\/|\brequire\s*\(|\beval\s*\(|\b(?:SELECT|INSERT|UPDATE|DELETE)\s+\w+)/i;

export const i8CasePrepareSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  actorRef: boundedText(128).regex(SAFE_REFERENCE).default('flowise-controller'),
  caseDescription: boundedText(2000),
  draft: regressionCaseDraftSchema,
  acceptanceSummary: acceptanceSummarySchema
}).strict().superRefine((value, context) => {
  if (FORBIDDEN_NATURAL_LANGUAGE.test(value.caseDescription)) {
    context.addIssue({ code: 'custom', path: ['caseDescription'], message: '案例描述不得包含凭据、路径、代码或 SQL。' });
  }
  if (value.draft.title !== value.acceptanceSummary.caseTitle) {
    context.addIssue({ code: 'custom', path: ['acceptanceSummary', 'caseTitle'], message: '验收摘要标题必须与案例草案一致。' });
  }
  if (value.draft.riskLevel !== value.acceptanceSummary.riskLevel) {
    context.addIssue({ code: 'custom', path: ['acceptanceSummary', 'riskLevel'], message: '验收摘要风险等级必须与案例草案一致。' });
  }
  if (value.draft.steps.length !== value.acceptanceSummary.stepCount) {
    context.addIssue({ code: 'custom', path: ['acceptanceSummary', 'stepCount'], message: '验收摘要步骤数必须与案例草案一致。' });
  }
  if (value.draft.assertions.length !== value.acceptanceSummary.assertionCount) {
    context.addIssue({ code: 'custom', path: ['acceptanceSummary', 'assertionCount'], message: '验收摘要断言数必须与案例草案一致。' });
  }
  if (value.acceptanceSummary.clarificationRequired) {
    context.addIssue({ code: 'custom', path: ['acceptanceSummary', 'clarificationRequired'], message: '仍需澄清的案例不得提交 Harness。' });
  }
});

export const i8AuthoringSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  preparationId: boundedText(80).regex(SAFE_REFERENCE),
  expectedVersion: z.number().int().positive(),
  confirmation: z.object({
    choice: z.enum(['APPROVE', 'REJECT']),
    confirmationRef: boundedText(160).regex(SAFE_REFERENCE),
    reason: boundedText(1000)
  }).strict(),
  intentPlan: intentPlanSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.confirmation.choice === 'APPROVE' && !value.intentPlan) {
    context.addIssue({ code: 'custom', path: ['intentPlan'], message: '批准作者化必须提交 IntentPlan。' });
  }
  if (value.confirmation.choice === 'REJECT' && value.intentPlan) {
    context.addIssue({ code: 'custom', path: ['intentPlan'], message: '拒绝作者化时不得提交 IntentPlan。' });
  }
});

export const i8AuthoringGetSchema = z.object({
  namespace: namespaceSchema,
  preparationId: boundedText(80).regex(SAFE_REFERENCE)
}).strict();

export type I8CasePrepareInput = z.infer<typeof i8CasePrepareSchema>;
export type I8AuthoringSubmitInput = z.infer<typeof i8AuthoringSubmitSchema>;
