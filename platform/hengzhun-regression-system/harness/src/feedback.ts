import { z } from 'zod';
import { namespaceSchema } from './schemas';
import { patchOperationSchema } from './i8/stage7-schemas';
import { type ExecutableActionPlan } from './i8/stage3-schemas';
import { resolveTargetAdapterBinding } from './i8/target-adapter-registry';
import { canonicalJson } from './utils';
import { HarnessError } from './errors';

export const feedbackRecordSchema = z.object({
  namespace: namespaceSchema,
  incidentId: z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/),
  confirmationRef: z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/),
  correction: z.discriminatedUnion('type', [patchOperationSchema.options[0],
    patchOperationSchema.options[4].extend({implementation:z.enum(['EXACT_TEXT','EXACT_EQUAL'])})])
}).strict().refine(value => !/(?:\bsk-[A-Za-z0-9_-]{8,}|\bBearer\s+\S+|(?:password|api[_-]?key)\s*[:=])/i.test(JSON.stringify(value.correction)),
  { message: '反馈不得包含凭据。' });

export type FeedbackRecordInput = z.infer<typeof feedbackRecordSchema>;

export const feedbackVerifySchema = z.object({
  namespace: namespaceSchema,
  feedbackId: z.string().regex(/^feedback_[0-9a-f-]{36}$/),
  verificationJourneyId: z.string().regex(/^journey_[0-9a-f-]{36}$/)
}).strict();
export type FeedbackVerifyInput = z.infer<typeof feedbackVerifySchema>;
export const feedbackGetSchema = feedbackVerifySchema.omit({verificationJourneyId:true});

export const reviewedLocatorSchema = z.object({
  feedbackId: feedbackVerifySchema.shape.feedbackId,
  locator: patchOperationSchema.options[0].shape.locator
}).strict();
export type ReviewedLocator = z.infer<typeof reviewedLocatorSchema>;
export const reviewedAssertionSchema = z.object({
  feedbackId:feedbackVerifySchema.shape.feedbackId,
  implementation:z.enum(['EXACT_TEXT','EXACT_EQUAL'])
}).strict();
export type ReviewedAssertion = z.infer<typeof reviewedAssertionSchema>;
export type ReviewedFeedbackSource = {
  feedback_id: string; namespace: string; status: string; release_identity_hash: string;
  adapter_binding_json: string; fixture_profile: string; dsl_version: string;
  correction_json: string; plan_json: string; dsl_json:string;
};

export function matchReviewedLocators(plan: ExecutableActionPlan, namespace: string,
  identity: string | undefined, sources: ReviewedFeedbackSource[]): Map<string, ReviewedLocator> {
  const binding = resolveTargetAdapterBinding(plan.targetProfileSnapshot?.adapterBinding);
  const result = new Map<string, ReviewedLocator>();
  if (!binding || !identity) return result;
  const actionMeaning = (action: ExecutableActionPlan['actions'][number]) => {
    const { actionId, ordinal, sourceIntentStepId, ...meaning } = action;
    return canonicalJson(meaning);
  };
  for (const source of sources) {
    if (source.namespace !== namespace || source.status !== 'VERIFIED' || source.release_identity_hash !== identity
      || source.adapter_binding_json !== canonicalJson(binding) || source.fixture_profile !== plan.fixtureProfile
      || source.dsl_version !== (plan.fixtureProfile === 'GENERIC_WEB' ? 'HENGZHUN_DSL_V2' : 'HENGZHUN_DSL_V1')) continue;
    const correction = feedbackRecordSchema.shape.correction.parse(JSON.parse(source.correction_json));
    if (correction.type !== 'TARGET_MAPPING') continue;
    const original = JSON.parse(source.plan_json) as ExecutableActionPlan;
    for (const action of plan.actions.filter(item => item.semanticTargetRef === correction.targetRef)) {
      if (!original.actions?.some(item => item.semanticTargetRef === correction.targetRef && actionMeaning(item) === actionMeaning(action))) continue;
      if (action.fixtureRefs.some(ref => original.fixtureValues?.[ref] !== plan.fixtureValues[ref])) continue;
      const previous = result.get(action.actionId);
      if (previous && canonicalJson(previous.locator) !== canonicalJson(correction.locator))
        throw new HarnessError(409, 'FEEDBACK_LOCATOR_CONFLICT', 'CONTRACT', '匹配经验的定位纠正冲突，需要人工核对。', false, true);
      if (!previous) result.set(action.actionId, reviewedLocatorSchema.parse({feedbackId:source.feedback_id,locator:correction.locator}));
    }
  }
  return result;
}

export function matchReviewedAssertions(plan: ExecutableActionPlan, namespace: string,
  identity: string | undefined, sources: ReviewedFeedbackSource[]): Map<string, ReviewedAssertion> {
  const binding=resolveTargetAdapterBinding(plan.targetProfileSnapshot?.adapterBinding),result=new Map<string,ReviewedAssertion>();
  if(!binding||!identity)return result;
  const meaning=(action:ExecutableActionPlan['actions'][number])=>{
    const {actionId,ordinal,sourceIntentStepId,...value}=action;return canonicalJson(value);
  };
  for(const source of sources) {
    if(source.namespace!==namespace||source.status!=='VERIFIED'||source.release_identity_hash!==identity||
      source.adapter_binding_json!==canonicalJson(binding)||source.fixture_profile!==plan.fixtureProfile||
      source.dsl_version!==(plan.fixtureProfile==='GENERIC_WEB'?'HENGZHUN_DSL_V2':'HENGZHUN_DSL_V1'))continue;
    const correction=feedbackRecordSchema.shape.correction.parse(JSON.parse(source.correction_json));
    if(correction.type!=='ASSERTION_IMPLEMENTATION')continue;
    const original=JSON.parse(source.plan_json) as ExecutableActionPlan;
    const step=JSON.parse(source.dsl_json).steps.find((item:{stepId:string})=>item.stepId===correction.stepId);
    const action=original.actions?.find(item=>item.actionId===step?.sourceActionId);
    if(!action||action.operation!==(correction.implementation==='EXACT_TEXT'?'expectText':'expectEqual'))continue;
    for(const current of plan.actions) {
      if(meaning(current)!==meaning(action)||current.fixtureRefs.some(ref=>original.fixtureValues[ref]!==plan.fixtureValues[ref]))continue;
      result.set(current.actionId,{feedbackId:source.feedback_id,implementation:correction.implementation});
    }
  }
  return result;
}
