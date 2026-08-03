import { z } from 'zod';
import { idempotencyKeySchema, namespaceSchema } from '../schemas';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const safeRef = boundedText(160).regex(/^[A-Za-z0-9._:-]+$/);

export const i8CandidatePreviewSchema = z.object({
  namespace: namespaceSchema,
  candidateId: safeRef,
  cursor: z.string().regex(/^line:[0-9]+$/).optional(),
  limit: z.number().int().min(1).max(100).default(40),
  includeDownload: z.boolean().default(false)
}).strict();

export const i8CandidateDecisionSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  candidateId: safeRef,
  expectedCandidateVersion: z.number().int().positive(),
  choice: z.enum(['SAVE_ONLY', 'ACTIVATE', 'REJECT']),
  confirmationRef: safeRef,
  reason: boundedText(1000)
}).strict();

export const i8RunSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  preparationId: safeRef,
  credentialAlias: safeRef
}).strict();

export const i8TaskGetSchema = z.object({
  namespace: namespaceSchema,
  taskId: safeRef
}).strict();

export type I8CandidatePreviewInput = z.infer<typeof i8CandidatePreviewSchema>;
export type I8CandidateDecisionInput = z.infer<typeof i8CandidateDecisionSchema>;
export type I8RunSubmitInput = z.infer<typeof i8RunSubmitSchema>;
