import { z } from 'zod';
import { idempotencyKeySchema, namespaceSchema } from '../schemas';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const safeRef = z.string().trim().min(8).max(1024).regex(/^[A-Za-z0-9._:-]+$/);

export const credentialRefSchema = z.string().regex(/^credential_[0-9a-f-]{36}$/);

export const supportingImageAttachmentSchema = z.object({
  flowiseFileRef: safeRef,
  originalFilename: boundedText(260),
  purposeHint: boundedText(500).optional()
}).strict();

export const caseFactCandidateSchema = z.object({
  factId: safeRef,
  field: z.enum(['TITLE', 'OBJECTIVE', 'TARGET_SYSTEM', 'ENTRY_URL', 'PRECONDITION', 'ACTION', 'INPUT_VALUE', 'EXPECTED_RESULT', 'VERIFICATION_REQUIREMENT', 'OTHER']),
  value: boundedText(2000),
  provenanceRefs: z.array(safeRef).min(1).max(20),
  confidence: z.number().min(0).max(1),
  selected: z.boolean(),
  requiresUserConfirmation: z.boolean()
}).strict();

export const verificationRequirementSchema = z.object({
  verificationType: z.enum(['SMS_OTP', 'TOTP', 'CAPTCHA', 'QR_CODE', 'UKEY', 'MOBILE_CERTIFICATE', 'BIOMETRIC', 'MANUAL_APPROVAL']),
  timing: z.enum(['BEFORE_EXECUTION', 'DURING_ACTION', 'AFTER_ACTION']),
  actionOrdinal: z.number().int().min(1).max(100).optional(),
  userPreparation: boundedText(1000),
  unattendedPolicy: z.literal('HUMAN_IN_LOOP_REQUIRED'),
  secretHandling: z.literal('USER_ENTERS_DIRECTLY_NEVER_PERSIST')
}).strict();

export const actionStepV2Schema = z.object({
  ordinal: z.number().int().min(1).max(100),
  actionType: z.enum(['NAVIGATE', 'CLICK', 'INPUT', 'SELECT', 'UPLOAD', 'WAIT', 'ASSERT', 'VERIFY']),
  instruction: boundedText(1000),
  targetDescription: boundedText(500).optional(),
  inputValue: boundedText(2000).optional(),
  inputValueSource: z.enum(['USER_TEXT', 'IMAGE_EVIDENCE', 'CASE_FILE', 'VIDEO_EVIDENCE', 'CREDENTIAL_REF', 'RUNTIME_USER_INPUT']).optional(),
  provenanceRefs: z.array(safeRef).max(20).default([]),
  confidence: z.number().min(0).max(1),
  expected: boundedText(1000),
  verificationRequirement: verificationRequirementSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.actionType === 'INPUT' && !value.inputValue && value.inputValueSource !== 'CREDENTIAL_REF' && value.inputValueSource !== 'RUNTIME_USER_INPUT') {
    context.addIssue({ code: 'custom', path: ['inputValue'], message: '文本输入动作必须具有可追溯输入值，或明确由凭据/用户在运行时输入。' });
  }
});

export const credentialSessionCreateSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  label: boundedText(160)
}).strict();

export const credentialSessionGetSchema = z.object({
  namespace: namespaceSchema,
  sessionId: z.string().regex(/^credsession_[0-9a-f-]{36}$/)
}).strict();

export const credentialCaptureSchema = z.object({
  captureToken: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024)
}).strict();

export const caseDraftSchema = z.object({
  schemaVersion: z.literal('hengzhun-i10-case-draft-v1'),
  title: boundedText(160),
  objective: boundedText(2000),
  summary: boundedText(1000),
  targetSystem: boundedText(160).optional(),
  entryUrl: z.string().url().max(2048).optional(),
  preconditions: z.array(boundedText(500)).max(50),
  steps: z.array(z.object({
    action: boundedText(500),
    expected: boundedText(500)
  }).strict()).min(1).max(50),
  assertions: z.array(boundedText(500)).min(1).max(50),
  supportingImageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/).optional(),
  caseFacts: z.array(caseFactCandidateSchema).max(200).default([]),
  actionStepsV2: z.array(actionStepV2Schema).max(100).default([]),
  verificationRequirements: z.array(verificationRequirementSchema).max(20).default([]),
  credentialRef: credentialRefSchema.optional(),
  source: z.object({
    inputType: z.enum(['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO']),
    sourceRef: safeRef,
    sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
    provenanceSummary: boundedText(1000)
  }).strict(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(boundedText(160)).max(30),
  confirmationStatus: z.enum(['DRAFT', 'WAITING_USER', 'CONFIRMED', 'REJECTED']),
  authoringStrategy: z.literal('MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY'),
  executionStrategy: z.literal('PLAYWRIGHT_VALIDATED_ONLY'),
  evidenceStrategy: z.literal('REDACTED_HASHED_EVIDENCE')
}).strict().superRefine((value, context) => {
  if (value.confirmationStatus === 'CONFIRMED' && value.missingFields.length > 0) {
    context.addIssue({ code: 'custom', path: ['missingFields'], message: '存在信息缺口的案例不得确认。' });
  }
  if (value.confirmationStatus === 'CONFIRMED' && (!value.targetSystem || !value.entryUrl)) {
    context.addIssue({ code: 'custom', path: ['confirmationStatus'], message: '确认案例必须包含目标系统和入口地址。' });
  }
});

export const inputEnvelopeSchema = z.object({
  schemaVersion: z.literal('hengzhun-i10-input-envelope-v1'),
  inputType: z.enum(['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO']),
  sourceRef: safeRef,
  credentialRef: credentialRefSchema.optional(),
  naturalLanguage: boundedText(8000).optional(),
  flowiseFileRef: safeRef.optional(),
  originalFilename: boundedText(260).optional()
  ,supportingImages: z.array(supportingImageAttachmentSchema).max(20).default([])
}).strict().superRefine((value, context) => {
  if (value.inputType === 'NATURAL_LANGUAGE' && !value.naturalLanguage) {
    context.addIssue({ code: 'custom', path: ['naturalLanguage'], message: '自然语言输入必须提供案例描述。' });
  }
  if (value.inputType !== 'NATURAL_LANGUAGE' && (!value.flowiseFileRef || !value.originalFilename)) {
    context.addIssue({ code: 'custom', path: ['flowiseFileRef'], message: '文件和视频输入必须提供受控 Flowise 附件引用。' });
  }
});

export const ingestSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  inputType: z.enum(['CASE_FILE', 'VIDEO']),
  flowiseFileRef: safeRef,
  originalFilename: boundedText(260),
  credentialRef: credentialRefSchema.optional(),
  targetSystemHint: boundedText(160).optional(),
  entryUrlHint: z.string().url().max(2048).optional()
  ,supportingImageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/).optional()
}).strict();

export const imageIngestSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  sourceRef: safeRef,
  primaryInputType: z.enum(['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO']),
  images: z.array(supportingImageAttachmentSchema).min(1).max(20),
  primaryText: z.string().trim().max(8000).optional()
}).strict();

export const imageIngestGetSchema = z.object({
  namespace: namespaceSchema,
  imageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/)
}).strict();

export const imageIngestWorkerCompletionSchema = z.object({
  workerId: safeRef,
  imageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/),
  packets: z.array(z.object({
    ordinal: z.number().int().min(1).max(20),
    sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
    redactedImagePath: z.string().min(20).max(500),
    redactedImageSha256: z.string().regex(/^[0-9a-f]{64}$/),
    ocrText: z.string().max(100000),
    ocrTextHash: z.string().regex(/^[0-9a-f]{64}$/),
    language: z.enum(['zh', 'en', 'zh+en', 'unknown']),
    confidence: z.number().min(0).max(1)
  }).strict()).min(1).max(20),
  facts: z.array(caseFactCandidateSchema).max(200),
  controllerInvocation: z.object({
    invocation: z.literal('REAL'), provider: boundedText(80), model: boundedText(160),
    inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative()
  }).strict()
}).strict();

export const imageIngestWorkerFailureSchema = z.object({
  workerId: safeRef,
  imageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/),
  errorCode: z.string().trim().min(3).max(120).regex(/^[A-Z0-9_]+$/),
  retryable: z.boolean()
}).strict();

export const verificationChallengeReportSchema = z.object({
  namespace: namespaceSchema,
  workerId: safeRef,
  taskRef: safeRef,
  verificationType: verificationRequirementSchema.shape.verificationType,
  actionOrdinal: z.number().int().min(1).max(100).optional(),
  detectionSummary: boundedText(1000),
  userPreparation: boundedText(1000),
  expiresAt: z.string().datetime().optional()
}).strict();

export const verificationGetSchema = z.object({ namespace: namespaceSchema, challengeId: z.string().regex(/^verification_[0-9a-f-]{36}$/) }).strict();

export const verificationResumeSchema = z.object({
  namespace: namespaceSchema,
  challengeId: z.string().regex(/^verification_[0-9a-f-]{36}$/),
  workerId: safeRef
}).strict();

export const verificationDecisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  challengeId: z.string().regex(/^verification_[0-9a-f-]{36}$/),
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['USER_READY', 'USER_ACTION_COMPLETED', 'CANCEL']),
  confirmationRef: safeRef,
  note: z.string().trim().max(500).optional()
}).strict();

export const ingestGetSchema = z.object({
  namespace: namespaceSchema,
  ingestJobId: z.string().regex(/^ingest_[0-9a-f-]{36}$/)
}).strict();

export const ingestDecisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  ingestJobId: z.string().regex(/^ingest_[0-9a-f-]{36}$/),
  expectedVersion: z.number().int().positive(),
  choice: z.enum(['CONFIRM', 'CORRECT', 'REJECT']),
  corrections: z.array(z.object({
    ordinal: z.number().int().min(1).max(1000),
    draft: caseDraftSchema
  }).strict()).max(1000).default([]),
  reason: boundedText(1000),
  confirmationRef: safeRef
}).strict();

export const naturalLanguagePrepareSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  actorRef: safeRef,
  caseDescription: boundedText(8000),
  draft: caseDraftSchema
}).strict();

export const ingestWorkerCompletionSchema = z.object({
  workerId: safeRef,
  ingestJobId: z.string().regex(/^ingest_[0-9a-f-]{36}$/),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  frames: z.array(z.object({
    ordinal: z.number().int().min(1).max(240),
    timestampMs: z.number().int().nonnegative(),
    imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
    redactedImagePath: z.string().min(20).max(500),
    ocrTextHash: z.string().regex(/^[0-9a-f]{64}$/),
    visualObservation: z.record(z.string(), z.unknown()),
    confidence: z.number().min(0).max(1)
  }).strict()).min(1).max(240),
  drafts: z.array(caseDraftSchema).min(1).max(1000)
}).strict();

export const ingestWorkerFailureSchema = z.object({
  workerId: safeRef,
  ingestJobId: z.string().regex(/^ingest_[0-9a-f-]{36}$/),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  errorCode: z.string().trim().min(3).max(120).regex(/^[A-Z0-9_]+$/),
  retryable: z.boolean(),
  evidenceSummary: boundedText(1000)
}).strict();

export type CredentialSessionCreateInput = z.infer<typeof credentialSessionCreateSchema>;
export type CredentialCaptureInput = z.infer<typeof credentialCaptureSchema>;
export type IngestSubmitInput = z.infer<typeof ingestSubmitSchema>;
export type IngestDecisionSubmitInput = z.infer<typeof ingestDecisionSubmitSchema>;
export type IngestWorkerCompletionInput = z.infer<typeof ingestWorkerCompletionSchema>;
export type IngestWorkerFailureInput = z.infer<typeof ingestWorkerFailureSchema>;
export type NaturalLanguagePrepareInput = z.infer<typeof naturalLanguagePrepareSchema>;
export type CaseDraft = z.infer<typeof caseDraftSchema>;
export type ImageIngestSubmitInput = z.infer<typeof imageIngestSubmitSchema>;
export type ImageIngestWorkerCompletionInput = z.infer<typeof imageIngestWorkerCompletionSchema>;
export type VerificationChallengeReportInput = z.infer<typeof verificationChallengeReportSchema>;
export type VerificationDecisionSubmitInput = z.infer<typeof verificationDecisionSubmitSchema>;
