import { z } from 'zod';
import { idempotencyKeySchema, namespaceSchema } from '../schemas';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const safeRef = boundedText(160).regex(/^[A-Za-z0-9._:-]+$/);
const journeyId = z.string().regex(/^journey_[0-9a-f-]{36}$/);
const journeyEventId = z.string().regex(/^journeyevent_[0-9a-f-]{36}$/);

export const i8ScheduleCreateSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  preparationId: safeRef,
  journeyId,
  confirmedDecisionEventId: journeyEventId,
  scheduleType: z.enum(['RECURRING', 'ONE_TIME']),
  cronExpression: boundedText(128).optional(),
  runAt: z.iso.datetime({ offset: true }).optional(),
  timezone: boundedText(80),
  misfirePolicy: z.enum(['SKIP', 'RUN_ONCE', 'RUN_ONCE_WITHIN_GRACE']).default('RUN_ONCE_WITHIN_GRACE'),
  misfireGraceSeconds: z.number().int().min(0).max(86400).default(300),
  maxRetries: z.number().int().min(0).max(5).default(1),
  confirmationRef: safeRef,
  // RF-004-S3: optional since MCP no longer injects a credential; Harness
  // resolves the authoritative binding from the case definition instead.
  credentialAlias: safeRef.optional()
}).strict().superRefine((input, context) => {
  if (input.scheduleType === 'RECURRING' && (!input.cronExpression || input.runAt)) {
    context.addIssue({ code: 'custom', path: ['cronExpression'], message: '周期调度必须且只能提供五段 Cron。' });
  }
  if (input.scheduleType === 'ONE_TIME' && (!input.runAt || input.cronExpression)) {
    context.addIssue({ code: 'custom', path: ['runAt'], message: '一次性调度必须且只能提供带时区偏移的 runAt。' });
  }
  if (input.scheduleType === 'ONE_TIME' && input.misfirePolicy === 'RUN_ONCE') {
    context.addIssue({ code: 'custom', path: ['misfirePolicy'], message: '一次性调度必须使用 SKIP 或 RUN_ONCE_WITHIN_GRACE，禁止无限迟到执行。' });
  }
  if (input.scheduleType === 'RECURRING' && input.misfirePolicy === 'RUN_ONCE_WITHIN_GRACE') {
    context.addIssue({ code: 'custom', path: ['misfirePolicy'], message: 'RUN_ONCE_WITHIN_GRACE 只适用于一次性调度。' });
  }
});

export const i8ScheduleGetSchema = z.object({
  namespace: namespaceSchema,
  scheduleId: safeRef
}).strict();

export const i8ResultInboxListSchema = z.object({
  namespace: namespaceSchema,
  cursor: z.string().regex(/^seq:[0-9]+$/).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  unreadOnly: z.boolean().default(false)
}).strict();

export const i8ResultInboxAckSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  items: z.array(z.object({
    inboxId: safeRef,
    expectedItemHash: z.string().regex(/^[0-9a-f]{64}$/)
  }).strict()).min(1).max(50)
}).strict();

export type I8ScheduleCreateInput = z.infer<typeof i8ScheduleCreateSchema>;
export type I8ResultInboxListInput = z.infer<typeof i8ResultInboxListSchema>;
export type I8ResultInboxAckInput = z.infer<typeof i8ResultInboxAckSchema>;
