import { z } from 'zod';

const safeRef = z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const evidencePathSchema = z.string().min(20).max(500)
  .regex(/^\.data\/stability\/[a-z0-9][a-z0-9._-]{2,63}\/candidate_[0-9a-f]{40}\/validation_[0-9a-f]{40}_(?:desktop|narrow)_[123]\/(?:report\.json|screenshot\.png|steps\.log)$/);

export const I8_STABILITY_VIEWPORTS = Object.freeze([
  { viewportId: 'DESKTOP_1440X900', width: 1440, height: 900, suffix: 'desktop' },
  { viewportId: 'NARROW_390X844', width: 390, height: 844, suffix: 'narrow' }
] as const);

const stabilityEvidenceIdentity = {
  relativePath: evidencePathSchema,
  sha256: sha256Schema,
  byteLength: z.number().int().positive().max(8 * 1024 * 1024)
};

export const stabilityEvidenceSchema = z.discriminatedUnion('artifactType', [
  z.object({
    artifactType: z.literal('REPORT'),
    mediaType: z.literal('application/json'),
    redactionStatus: z.literal('REDACTED'),
    ...stabilityEvidenceIdentity
  }).strict(),
  z.object({
    artifactType: z.literal('SCREENSHOT'),
    mediaType: z.literal('image/png'),
    redactionStatus: z.literal('QUARANTINED'),
    ...stabilityEvidenceIdentity
  }).strict(),
  z.object({
    artifactType: z.literal('LOG'),
    mediaType: z.literal('text/plain; charset=utf-8'),
    redactionStatus: z.literal('REDACTED'),
    ...stabilityEvidenceIdentity
  }).strict()
]);

export const stabilityRunResultSchema = z.object({
  validationRunId: safeRef,
  viewportId: z.enum(['DESKTOP_1440X900', 'NARROW_390X844']),
  viewportWidth: z.union([z.literal(1440), z.literal(390)]),
  viewportHeight: z.union([z.literal(900), z.literal(844)]),
  sequenceNo: z.number().int().min(1).max(3),
  fixtureRef: safeRef,
  outcome: z.enum(['PASSED', 'FAILED']),
  durationMs: z.number().int().nonnegative().max(10 * 60 * 1000),
  assertionSetHash: sha256Schema,
  evidenceSetHash: sha256Schema,
  evidence: z.array(stabilityEvidenceSchema).length(3),
  errorCode: safeRef.optional()
}).strict().superRefine((value, context) => {
  const expected = value.viewportId === 'DESKTOP_1440X900' ? [1440, 900] : [390, 844];
  if (value.viewportWidth !== expected[0] || value.viewportHeight !== expected[1]) {
    context.addIssue({ code: 'custom', path: ['viewportWidth'], message: '视口ID与固定尺寸不一致。' });
  }
  if (value.outcome === 'FAILED' && !value.errorCode) {
    context.addIssue({ code: 'custom', path: ['errorCode'], message: '失败样本必须提供受控错误码。' });
  }
  const types = [...value.evidence.map(item => item.artifactType)].sort();
  if (types.join(',') !== 'LOG,REPORT,SCREENSHOT') {
    context.addIssue({ code: 'custom', path: ['evidence'], message: '每次验证必须包含报告、隔离截图和步骤日志。' });
  }
});

export const i8StabilityCompletionSchema = z.object({
  workerId: safeRef,
  candidateId: safeRef,
  scriptHash: sha256Schema,
  runtimeFingerprint: sha256Schema,
  runs: z.array(stabilityRunResultSchema).min(4).max(6)
}).strict().superRefine((value, context) => {
  if (![4, 6].includes(value.runs.length)) {
    context.addIssue({ code: 'custom', path: ['runs'], message: '只接受I10四次或I8历史六次验证结果。' });
    return;
  }
  const sequences = value.runs.length === 4 ? 2 : 3;
  const keys = new Set<string>();
  for (const run of value.runs) {
    const key = `${run.viewportId}:${run.sequenceNo}`;
    if (keys.has(key)) context.addIssue({ code: 'custom', path: ['runs'], message: '验证不得重复视口与序号。' });
    keys.add(key);
  }
  for (const viewport of I8_STABILITY_VIEWPORTS) {
    for (let sequence = 1; sequence <= sequences; sequence += 1) {
      if (!keys.has(`${viewport.viewportId}:${sequence}`)) context.addIssue({ code: 'custom', path: ['runs'], message: `必须完整提交两个视口各${sequences}次结果。` });
    }
  }
});

export type I8StabilityCompletionInput = z.infer<typeof i8StabilityCompletionSchema>;
export type I8StabilityRunResult = z.infer<typeof stabilityRunResultSchema>;
