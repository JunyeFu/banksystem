import { z } from 'zod';
import { idempotencyKeySchema, namespaceSchema, typedBusinessInputsV1Schema } from '../schemas';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const safeRef = z.string().trim().min(8).max(1024).regex(/^[A-Za-z0-9._:-]+$/);

export const credentialRefSchema = z.string().regex(/^credential_[0-9a-f-]{36}$/);
export const targetProfileIdSchema = z.string().regex(/^targetprofile_[0-9a-f-]{36}$/);
export const targetAdapterBindingSchema = z.object({
  adapterId: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/),
  adapterVersion: z.string().trim().min(1).max(40).regex(/^\d+\.\d+\.\d+$/),
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

const moduleCapabilitySchema = z.enum([
  'AUTHENTICATION', 'NAVIGATION', 'READ_ONLY_QUERY', 'FORM_INTERACTION',
  'TABLE_INTERACTION', 'FILE_UPLOAD', 'FILE_DOWNLOAD', 'BUSINESS_SUBMISSION',
  'VERIFICATION_GATE', 'ASSERTION', 'EVIDENCE_CAPTURE'
]);
export const applicationProfileSchema = z.object({
  displayName: boundedText(160),
  modules: z.array(z.object({
    moduleId: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    displayName: boundedText(160),
    capabilities: z.array(moduleCapabilitySchema).min(1).max(11)
  }).strict()).min(1).max(50)
}).strict();

const originSchema = z.string().url().max(2048).superRefine((value, context) => {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    context.addIssue({ code: 'custom', message: '站点Origin必须是无路径、查询和凭据的HTTP/HTTPS Origin。' });
  }
});

export const targetProfilePrepareSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  sessionRef: safeRef,
  displayName: boundedText(160),
  // URL syntax and credential presence are checked by the service so callers
  // receive stable I10_* diagnostics rather than a generic Zod/MCP failure.
  launchUrl: z.string().trim().max(4096),
  targetProfileId: targetProfileIdSchema.optional(),
  credentialRef: z.string().trim().max(160).optional(),
  // A binding is an explicit user-confirmed selection. Omitting it means
  // GENERIC_DYNAMIC; target name and URL can never select an adapter.
  adapterBinding: targetAdapterBindingSchema.optional(),
  // Human-facing selection is intentionally narrower than adapterBinding:
  // Flowise may only request a registered symbolic id.  The Harness resolves
  // it to the versioned, hash-verified binding; callers cannot forge hashes.
  adapterSelection: z.union([z.literal(''), z.literal('fuxing-bank-demo')]).optional(),
  applicationProfile: applicationProfileSchema.optional(),
  tlsPolicy: z.enum(['STRICT', 'ALLOW_SELF_SIGNED']).default('STRICT')
}).strict();

export const targetProfileDecisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  targetProfileId: targetProfileIdSchema,
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['APPROVE', 'REJECT']),
  confirmationRef: safeRef
}).strict();

export const targetProfileGetSchema = z.object({
  namespace: namespaceSchema,
  targetProfileId: targetProfileIdSchema.optional(),
  launchUrl: z.string().trim().url().max(4096).optional()
}).strict().superRefine((value, context) => {
  if (Boolean(value.targetProfileId) === Boolean(value.launchUrl)) {
    context.addIssue({ code: 'custom', message: '必须且只能使用targetProfileId或launchUrl查询站点档案。' });
  }
});

export const supportingImageAttachmentSchema = z.object({
  flowiseFileRef: safeRef,
  originalFilename: boundedText(260).optional(),
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
  targetProfileId: targetProfileIdSchema.optional(),
  targetProfileVersion: z.number().int().positive().optional(),
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
  businessInputs: typedBusinessInputsV1Schema.optional(),
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
  targetProfileId: targetProfileIdSchema.optional(),
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
  primaryText: z.string().trim().max(8000).optional(),
  credentialRef: credentialRefSchema.optional()
}).strict();

export const imageIngestGetSchema = z.object({
  namespace: namespaceSchema,
  imageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/)
}).strict();

export const imageIngestDecisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  imageIngestId: z.string().regex(/^imageingest_[0-9a-f-]{36}$/),
  expectedVersion: z.number().int().positive(),
  confirmationRef: safeRef,
  decisions: z.array(z.object({
    factId: safeRef,
    decision: z.enum(['CONFIRM', 'CORRECT', 'REJECT']),
    replacementValue: boundedText(2000).optional()
  }).strict().superRefine((value, context) => {
    if (value.decision === 'CORRECT' && !value.replacementValue) {
      context.addIssue({ code: 'custom', path: ['replacementValue'], message: 'CORRECT必须提供脱敏后的替换值。' });
    }
    if (value.decision !== 'CORRECT' && value.replacementValue !== undefined) {
      context.addIssue({ code: 'custom', path: ['replacementValue'], message: '只有CORRECT允许提供替换值。' });
    }
  })).min(1).max(200)
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
  }).strict(),
  recognitionBranches: z.object({
    ocr: z.object({
      status: z.enum(['SUCCEEDED','FAILED','TIMED_OUT']),
      durationMs: z.number().int().nonnegative(),
      engine: boundedText(160),
      modelSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      processedImageCount: z.number().int().nonnegative().optional(),
      recognizedRegionCount: z.number().int().nonnegative().optional(),
      errorCode: z.string().regex(/^[A-Z0-9_]+$/).max(120).optional()
    }).strict()
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
  pageFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  policyMode: z.enum(['NONE','AUTO_PERSISTED_UKEY','EXTERNAL_CONFIRM_REQUIRED']).optional(),
  detectionSummary: boundedText(1000),
  userPreparation: boundedText(1000),
  expiresAt: z.string().datetime().optional()
}).strict();

export const verificationAttemptReportSchema = z.object({
  namespace: namespaceSchema,
  workerId: safeRef,
  taskRef: safeRef,
  actionOrdinal: z.number().int().min(1).max(100),
  pageFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  policyVersion: z.literal('VerificationPolicyV2'),
  verificationType: verificationRequirementSchema.shape.verificationType,
  attemptOrdinal: z.number().int().min(1).max(3),
  automationAssessment: z.enum(['AUTO_PASSED','WEB_CONTROL_CLICKED','NOT_APPLICABLE','FAILED','HANDOFF_REQUIRED']),
  assessmentReason: boundedText(500),
  routePath: boundedText(512).optional(),
  evidenceHash: z.string().regex(/^[0-9a-f]{64}$/).optional()
}).strict();

export const verificationGetSchema = z.object({
  namespace: namespaceSchema,
  challengeId: z.string().regex(/^verification_[0-9a-f-]{36}$/).optional(),
  taskRef: safeRef.optional()
}).strict().superRefine((value,context)=>{
  if (Boolean(value.challengeId) === Boolean(value.taskRef)) {
    context.addIssue({code:'custom',message:'必须且只能提供challengeId或taskRef。'});
  }
});

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
  itemDecisions: z.array(z.object({
    ordinal: z.number().int().min(1).max(1000),
    decision: z.enum(['CONFIRM','REJECT'])
  }).strict()).max(1000).default([]),
  reason: boundedText(1000),
  confirmationRef: safeRef
}).strict();

export const naturalLanguagePrepareSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  actorRef: safeRef,
  journeyId: z.string().regex(/^journey_[0-9a-f-]{36}$/).optional(),
  caseDescription: boundedText(8000),
  draft: caseDraftSchema
}).strict();

export const interactionRequestIntentSchema = z.enum([
  'CASE_AUTHORING',
  'RESULT_QUERY',
  'SCHEDULE_DISABLE',
  'JOURNEY_RESUME',
  'HELP',
  'UNSUPPORTED'
]);

export const interactionInputTypeSchema = z.enum([
  'NATURAL_LANGUAGE',
  'CASE_FILE',
  'VIDEO',
  'NONE'
]);

export const interactionDecisionSchema = z.enum([
  'APPROVE_CASE',
  'REJECT_CASE',
  'ACTIVATE_SCRIPT',
  'REJECT_SCRIPT',
  'RUN_ON_DEMAND',
  'CREATE_ONE_TIME_SCHEDULE',
  'CREATE_RECURRING_SCHEDULE',
  'REVISE_EXECUTION_PLAN',
  'DEFER_EXECUTION',
  'ACTIVATE_REPAIR',
  'REJECT_REPAIR',
  'COMPLETE_RUNTIME_VERIFICATION',
  'ABORT_RUNTIME_VERIFICATION',
  'DISABLE_SCHEDULE',
  'CANCEL'
]);

export const semanticAssessmentSchema = z.object({
  schemaVersion: z.literal('hengzhun-i10-semantic-assessment-v1'),
  verdict: z.enum(['COMPLETE', 'NEEDS_CLARIFICATION']),
  satisfiedRequirementIds: z.array(z.string().trim().min(2).max(80)).max(20).default([]),
  unresolvedRequirements: z.array(z.object({
    requirementId: z.string().trim().min(2).max(80),
    question: boundedText(1000)
  }).strict()).max(20).default([]),
  confidence: z.number().min(0).max(1)
}).strict();

export const journeyPrepareSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  sessionRef: safeRef,
  interactionContractVersion: z.enum(['v3', 'v4', 'v5', 'v6']).default('v3'),
  journeyId: z.string().regex(/^journey_[0-9a-f-]{36}$/).optional(),
  requestIntent: interactionRequestIntentSchema,
  inputType: interactionInputTypeSchema,
  naturalLanguage: z.string().trim().max(8000).optional(),
  entryUrl: z.string().trim().max(4096).optional(),
  targetSystem: z.string().trim().max(160).optional(),
  flowiseFileRef: safeRef.optional(),
  originalFilename: boundedText(260).optional(),
  credentialRef: credentialRefSchema.optional(),
  targetProfileId: targetProfileIdSchema.optional(),
  supportingImages: z.array(supportingImageAttachmentSchema).max(20).default([]),
  scheduleId: safeRef.optional(),
  taskId: safeRef.optional(),
  draftJson: z.record(z.string(), z.unknown()).optional(),
  semanticAssessment: semanticAssessmentSchema.optional(),
  inputRevision: z.number().int().min(1).optional()
}).strict();

export const journeyGetSchema = z.object({
  namespace: namespaceSchema,
  journeyId: z.string().regex(/^journey_[0-9a-f-]{36}$/).optional(),
  sessionRef: safeRef.optional(),
  waitSeconds: z.number().int().min(0).max(45).default(0)
}).strict().superRefine((value, context) => {
  if (!value.journeyId && !value.sessionRef) {
    context.addIssue({ code: 'custom', path: ['journeyId'], message: 'journeyId与sessionRef至少提供一个。' });
  }
});

export const journeyDecisionSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  journeyId: z.string().regex(/^journey_[0-9a-f-]{36}$/),
  expectedVersion: z.number().int().positive(),
  decision: interactionDecisionSchema,
  confirmationRef: safeRef,
  proposalId: z.string().regex(/^proposal_[0-9a-f]{32}$/).optional(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().max(1000).optional()
}).strict();

export const journeyInputSubmitSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  journeyId: z.string().regex(/^journey_[0-9a-f-]{36}$/),
  expectedVersion: z.number().int().positive(),
  inputKind: z.enum([
    'INITIAL_CASE_INPUT',
    'CASE_CORRECTION',
    'INGEST_CORRECTION',
    'EXECUTION_PLAN',
    'REPAIR_EXECUTION_PLAN'
  ]),
  normalizedInput: z.record(z.string(), z.unknown()),
  submissionRef: safeRef
}).strict();

export const artifactDownloadGrantSchema = z.object({
  namespace: namespaceSchema,
  artifactId: z.string().regex(/^art_[0-9a-f-]{36}$/)
}).strict();

export const ingestWorkerCompletionSchema = z.object({
  workerId: safeRef,
  ingestJobId: z.string().regex(/^ingest_[0-9a-f-]{36}$/),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  controllerInvocation: z.object({
    invocation: z.literal('REAL'),
    provider: boundedText(120),
    model: boundedText(200),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative()
  }).strict(),
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
export type TargetProfilePrepareInput = z.infer<typeof targetProfilePrepareSchema>;
export type TargetProfileDecisionSubmitInput = z.infer<typeof targetProfileDecisionSubmitSchema>;
export type TargetProfileGetInput = z.infer<typeof targetProfileGetSchema>;
export type CredentialCaptureInput = z.infer<typeof credentialCaptureSchema>;
export type IngestSubmitInput = z.infer<typeof ingestSubmitSchema>;
export type IngestDecisionSubmitInput = z.infer<typeof ingestDecisionSubmitSchema>;
export type IngestWorkerCompletionInput = z.infer<typeof ingestWorkerCompletionSchema>;
export type IngestWorkerFailureInput = z.infer<typeof ingestWorkerFailureSchema>;
export type NaturalLanguagePrepareInput = z.infer<typeof naturalLanguagePrepareSchema>;
export type CaseDraft = z.infer<typeof caseDraftSchema>;
export type ImageIngestSubmitInput = z.infer<typeof imageIngestSubmitSchema>;
export type ImageIngestDecisionSubmitInput = z.infer<typeof imageIngestDecisionSubmitSchema>;
export type ImageIngestWorkerCompletionInput = z.infer<typeof imageIngestWorkerCompletionSchema>;
export type VerificationChallengeReportInput = z.infer<typeof verificationChallengeReportSchema>;
export type VerificationAttemptReportInput = z.infer<typeof verificationAttemptReportSchema>;
export type VerificationDecisionSubmitInput = z.infer<typeof verificationDecisionSubmitSchema>;
export type JourneyPrepareInput = z.infer<typeof journeyPrepareSchema>;
export type JourneyGetInput = z.infer<typeof journeyGetSchema>;
export type JourneyDecisionSubmitInput = z.infer<typeof journeyDecisionSubmitSchema>;
export type JourneyInputSubmitInput = z.infer<typeof journeyInputSubmitSchema>;
