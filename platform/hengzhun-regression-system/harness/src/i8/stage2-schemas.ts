import { z } from 'zod';
import {
  acceptanceSummarySchema,
  idempotencyKeySchema,
  intentPlanSchema,
  namespaceSchema,
  regressionCaseDraftSchema,
  targetAdapterBindingSchema
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
  // Flowise submits only the frozen target context.  The Harness reads the
  // prepared CaseDraft again and deterministically creates the IntentPlan;
  // browser-node arrays are retained below only for legacy clients.
  authoringContext: z.object({
    route: boundedText(512),
    executionProfile: z.enum(['LOGIN_PROFILE', 'TRANSFER_UKEY_ORDER_QUERY', 'GENERIC_WEB']),
    targetProfileId: boundedText(80).optional(),
    targetProfileVersion: z.number().int().positive().optional(),
    targetProfileHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    targetProfileSnapshot: z.record(z.string(), z.unknown()).optional(),
    adapterBinding: targetAdapterBindingSchema.optional()
  }).strict().optional(),
  intentPlan: intentPlanSchema.optional()
}).strict().superRefine((value, context) => {
  // Native Flowise Human Input nodes do not reliably retain Custom Function
  // state after a user confirmation.  On APPROVE the Harness may therefore
  // reconstruct the context from the immutable CaseDraft credential binding
  // and its already ACTIVE TargetProfile.  It remains fail-closed when that
  // exact persisted binding is absent; no URL/name based inference is allowed.
  if (value.confirmation.choice === 'REJECT' && (value.intentPlan || value.authoringContext)) {
    context.addIssue({ code: 'custom', path: ['authoringContext'], message: '拒绝作者化时不得提交执行上下文。' });
  }
});

export const i8AuthoringGetSchema = z.object({
  namespace: namespaceSchema,
  preparationId: boundedText(80).regex(SAFE_REFERENCE)
}).strict();

export type I8CasePrepareInput = z.infer<typeof i8CasePrepareSchema>;
export type I8AuthoringSubmitInput = z.infer<typeof i8AuthoringSubmitSchema>;
