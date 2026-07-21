import { z } from 'zod';
import { idempotencyKeySchema, namespaceSchema } from '../schemas';

const text = (max: number) => z.string().trim().min(1).max(max);
const safeRef = text(160).regex(/^[A-Za-z0-9._:-]+$/);

export const i8IncidentClassificationSchema = z.enum([
  'ENVIRONMENT', 'AUTHENTICATION', 'CONTRACT', 'LOCATOR', 'ASSERTION', 'MODEL', 'TOOL',
  'FIXTURE_DATA', 'PRODUCT_DEFECT', 'FLAKY_TIMING', 'SCRIPT_LOGIC'
]);

export type I8IncidentClassification = z.infer<typeof i8IncidentClassificationSchema>;

export function classifyI8Failure(errorCategory?: string, errorCode?: string): I8IncidentClassification {
  const code = String(errorCode ?? '').toUpperCase();
  if (/FIXTURE|TEST_DATA|DATA_PREPARATION/.test(code)) return 'FIXTURE_DATA';
  if (/PRODUCT_DEFECT|SUT_DEFECT|BUSINESS_DEFECT/.test(code)) return 'PRODUCT_DEFECT';
  if (/FLAKY|TIMING|RACE|EVENT_TIMEOUT/.test(code)) return 'FLAKY_TIMING';
  if (/SCRIPT_LOGIC|CANDIDATE_STEP|DSL_LOGIC/.test(code)) return 'SCRIPT_LOGIC';
  if (errorCategory === 'ENVIRONMENT') return 'ENVIRONMENT';
  if (/AUTH|CREDENTIAL|LOGIN_REJECTED/.test(code)) return 'AUTHENTICATION';
  if (/CONTRACT|SCHEMA|HTTP_4\d\d/.test(code)) return 'CONTRACT';
  if (/LOCATOR|SELECTOR|ELEMENT_NOT_FOUND/.test(code)) return 'LOCATOR';
  if (/MODEL|MIDSCENE|LLM/.test(code)) return 'MODEL';
  if (/ASSERTION|MISMATCH|EXPECT_|TEST_FAILURE/.test(code) || errorCategory === 'TEST_FAILURE') return 'ASSERTION';
  return 'TOOL';
}

export const patchOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TARGET_MAPPING'), targetRef: safeRef, locator: z.object({ kind: z.enum(['ROLE', 'LABEL', 'TEST_ID']), value: text(256) }).strict() }).strict(),
  z.object({ type: z.literal('WAIT_CONDITION'), stepId: safeRef, timeoutPolicyRef: z.literal('DEFAULT_30S') }).strict(),
  z.object({ type: z.literal('ACTION_PARAMETER'), stepId: safeRef, parameter: z.literal('optionRef'), value: safeRef }).strict(),
  z.object({ type: z.literal('STEP_ORDER'), orderedStepIds: z.array(safeRef).min(1).max(100) }).strict(),
  z.object({ type: z.literal('ASSERTION_IMPLEMENTATION'), stepId: safeRef, implementation: z.enum(['BOUNDED_VISIBLE', 'EXACT_TEXT', 'EXACT_EQUAL']) }).strict()
]);

export const scriptPatchProposalSchema = z.object({
  schemaVersion: z.literal('i8-script-patch-proposal-v1'),
  operations: z.array(patchOperationSchema).min(1).max(10),
  rationale: text(1000)
}).strict();

export const i8FailureGetSchema = z.object({ namespace: namespaceSchema, incidentId: safeRef }).strict();
export const i8RepairProposeSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  incidentId: safeRef,
  expectedEnvelopeHash: z.string().regex(/^[0-9a-f]{64}$/),
  patch: scriptPatchProposalSchema
}).strict();
export const i8RepairDecisionSchema = z.object({
  namespace: namespaceSchema,
  idempotencyKey: idempotencyKeySchema,
  proposalId: safeRef,
  expectedProposalVersion: z.number().int().positive(),
  choice: z.enum(['ACTIVATE', 'REJECT']),
  reason: text(1000),
  confirmationRef: safeRef
}).strict();

export type I8RepairProposeInput = z.infer<typeof i8RepairProposeSchema>;
export type I8RepairDecisionInput = z.infer<typeof i8RepairDecisionSchema>;
