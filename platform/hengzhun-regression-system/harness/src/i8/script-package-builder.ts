import { intentPlanSchema } from '../schemas';
import { canonicalJson, sha256 } from '../utils';
import {
  dslDocumentSchema,
  executableActionPlanSchema,
  verifiedActionRecordSchema,
  type DslDocument,
  type ExecutableActionPlan,
  type VerifiedActionRecord
} from './stage3-schemas';

export const I8_GENERATOR_VERSION = 'hengzhun-script-package-builder-1.0.0';

const ROUTES = Object.freeze({
  PORTAL_LOGIN: '/portal/login',
  PORTAL_PROTECTED: '/portal/dashboard',
  PORTAL_PROFILE: '/portal/profile'
});

const TARGETS = Object.freeze({
  LOGIN_USERNAME: { kind: 'TEST_ID', value: 'login-username' },
  LOGIN_PASSWORD: { kind: 'TEST_ID', value: 'login-password' },
  LOGIN_SUBMIT: { kind: 'TEST_ID', value: 'login-submit' },
  HEADER_DISPLAY_NAME: { kind: 'TEST_ID', value: 'customer-profile-name' },
  HEADER_AVATAR: { kind: 'TEST_ID', value: 'customer-profile-avatar' },
  HEADER_PROFILE_LINK: { kind: 'ROLE', value: 'link|个人资料' },
  PROFILE_DISPLAY_NAME: { kind: 'TEST_ID', value: 'profile-display-name' },
  PROFILE_AVATAR: { kind: 'TEST_ID', value: 'profile-avatar' }
}) satisfies Readonly<Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }>>;

const REPAIR_TARGETS = Object.freeze({
  LOGIN_USERNAME: Object.freeze([
    TARGETS.LOGIN_USERNAME,
    { kind: 'LABEL' as const, value: '用户名 / 手机号' }
  ]),
  LOGIN_PASSWORD: Object.freeze([
    TARGETS.LOGIN_PASSWORD,
    { kind: 'LABEL' as const, value: '密码' }
  ]),
  LOGIN_SUBMIT: Object.freeze([
    TARGETS.LOGIN_SUBMIT,
    { kind: 'ROLE' as const, value: 'button|账号密码登录' }
  ])
}) satisfies Readonly<Record<string, readonly { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }[]>>;

const TIMEOUTS = Object.freeze({ DEFAULT_30S: 30_000 });

const actionTemplate = [
  { operation: 'goto', routeRef: 'PORTAL_LOGIN', page: 'LOGIN', target: undefined, fixture: [] },
  { operation: 'fill', page: 'LOGIN', target: 'LOGIN_USERNAME', fixture: ['LOGIN_PROFILE.USERNAME'] },
  { operation: 'fill', page: 'LOGIN', target: 'LOGIN_PASSWORD', fixture: ['LOGIN_PROFILE.PASSWORD'] },
  { operation: 'click', page: 'LOGIN', target: 'LOGIN_SUBMIT', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_PROTECTED', page: 'DASHBOARD', target: undefined, fixture: [] },
  { operation: 'expectVisible', page: 'DASHBOARD', target: 'HEADER_DISPLAY_NAME', fixture: [] },
  { operation: 'expectVisible', page: 'DASHBOARD', target: 'HEADER_AVATAR', fixture: [] },
  { operation: 'click', page: 'DASHBOARD', target: 'HEADER_PROFILE_LINK', fixture: [] },
  { operation: 'waitForURL', routePatternRef: 'PORTAL_PROFILE', page: 'PROFILE', target: undefined, fixture: [] },
  { operation: 'expectVisible', page: 'PROFILE', target: 'PROFILE_DISPLAY_NAME', fixture: [] },
  { operation: 'expectVisible', page: 'PROFILE', target: 'PROFILE_AVATAR', fixture: [] },
  { operation: 'expectEqual', page: 'PROFILE', target: 'HEADER_DISPLAY_NAME', comparisonTargetRef: 'PROFILE_DISPLAY_NAME', fixture: [] },
  { operation: 'expectEqual', page: 'PROFILE', target: 'HEADER_AVATAR', comparisonTargetRef: 'PROFILE_AVATAR', fixture: [] },
  { operation: 'screenshot', page: 'PROFILE', target: undefined, fixture: [] }
] as const;

function pageSignature(page: 'LOGIN' | 'DASHBOARD' | 'PROFILE') {
  if (page === 'LOGIN') return { routePatternRef: 'PORTAL_LOGIN', landmarkRef: 'PORTAL_LOGIN_FORM', requiredAriaRefs: ['LOGIN_USERNAME', 'LOGIN_PASSWORD', 'LOGIN_SUBMIT'] };
  if (page === 'DASHBOARD') return { routePatternRef: 'PORTAL_PROTECTED', landmarkRef: 'PORTAL_HEADER', requiredAriaRefs: ['HEADER_DISPLAY_NAME', 'HEADER_AVATAR'] };
  return { routePatternRef: 'PORTAL_PROFILE', landmarkRef: 'PROFILE_PANEL', requiredAriaRefs: ['PROFILE_DISPLAY_NAME', 'PROFILE_AVATAR'] };
}

export function compileExecutableActionPlan(intentPlanInput: unknown, intentPlanHash: string): ExecutableActionPlan {
  const intentPlan = intentPlanSchema.parse(intentPlanInput);
  if (intentPlan.route !== '/portal/login' || intentPlan.steps.some(step => step.riskLevel !== 'LOW')) {
    throw new Error('I8_STAGE3_PROFILE_UNSUPPORTED');
  }
  const source = intentPlan.steps;
  const seed = canonicalJson({ caseId: intentPlan.caseId, caseVersion: intentPlan.caseVersion, intentPlanHash, template: 'LOGIN_PROFILE_V1' });
  const executablePlanId = `eap_${sha256(seed).slice(0, 40)}`;
  const actions = actionTemplate.map((template, index) => {
    const sourceIntentStepId = source[Math.min(Math.floor(index / Math.ceil(actionTemplate.length / source.length)), source.length - 1)]!.intentStepId;
    const actionId = `act_${String(index + 1).padStart(2, '0')}_${sha256(canonicalJson({ executablePlanId, index, template })).slice(0, 20)}`;
    return {
      actionId,
      ordinal: index + 1,
      operation: template.operation,
      pageSignature: pageSignature(template.page),
      ...(template.target ? { semanticTargetRef: template.target } : {}),
      ...('comparisonTargetRef' in template ? { comparisonTargetRef: template.comparisonTargetRef } : {}),
      ...('routeRef' in template ? { routeRef: template.routeRef } : {}),
      ...('routePatternRef' in template ? { routePatternRef: template.routePatternRef } : {}),
      fixtureRefs: [...template.fixture],
      preconditions: index === 0 ? ['受控客户 Fixture 已准备'] : ['上一动作已由 Playwright 验证'],
      invariants: ['仅访问复兴银行门户受控路由', '不得记录凭据、Cookie 或 Storage State'],
      postconditions: [template.operation.startsWith('expect') ? '业务断言成立' : '页面事实与动作结果已记录'],
      riskLevel: 'LOW' as const,
      retryPolicy: { maximumRetries: template.operation === 'goto' || template.operation.startsWith('wait') ? 1 as const : 0 as const, sideEffectFree: true },
      branchRules: [],
      failureExit: 'FAIL_ACTION' as const,
      evidencePolicy: template.operation === 'screenshot' ? 'FACTS_AND_SCREENSHOT' as const : 'FACTS' as const,
      sourceIntentStepId
    };
  });
  return executableActionPlanSchema.parse({
    schemaVersion: 'i8-executable-action-plan-v1',
    executablePlanId,
    caseId: intentPlan.caseId,
    caseVersion: intentPlan.caseVersion,
    intentPlanHash,
    planVersion: 1,
    fixtureProfile: 'LOGIN_PROFILE',
    actions
  });
}

function locatorFor(action: ExecutableActionPlan['actions'][number], record: VerifiedActionRecord): { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string } | undefined {
  if (!action.semanticTargetRef) return undefined;
  const controlled = TARGETS[action.semanticTargetRef as keyof typeof TARGETS];
  if (!controlled || !record.locator || record.locator.kind !== controlled.kind || record.locator.value !== controlled.value) {
    throw new Error('I8_VERIFIED_LOCATOR_NOT_ALLOWLISTED');
  }
  if (action.comparisonTargetRef && !TARGETS[action.comparisonTargetRef as keyof typeof TARGETS]) {
    throw new Error('I8_COMPARISON_TARGET_NOT_ALLOWLISTED');
  }
  return controlled;
}

export function buildDslDocument(planInput: unknown, recordsInput: unknown): { dsl: DslDocument; locators: Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }> } {
  const plan = executableActionPlanSchema.parse(planInput);
  const records = (Array.isArray(recordsInput) ? recordsInput : []).map(record => verifiedActionRecordSchema.parse(record));
  if (records.length !== plan.actions.length) throw new Error('I8_VERIFIED_ACTION_SET_INCOMPLETE');
  const byAction = new Map(records.map(record => [record.actionId, record]));
  const locators: Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }> = {};
  const steps = plan.actions.map(action => {
    const record = byAction.get(action.actionId);
    if (!record || record.executablePlanId !== plan.executablePlanId || record.ordinal !== action.ordinal) throw new Error('I8_VERIFIED_ACTION_MISMATCH');
    const expectedPageHash = sha256(canonicalJson(action.pageSignature));
    if (record.pageSignatureHash !== expectedPageHash) throw new Error('I8_PAGE_SIGNATURE_HASH_MISMATCH');
    const locator = locatorFor(action, record);
    if (locator && action.semanticTargetRef) locators[action.semanticTargetRef] = locator;
    if (action.comparisonTargetRef) locators[action.comparisonTargetRef] = TARGETS[action.comparisonTargetRef as keyof typeof TARGETS];
    const base = { stepId: `dsl_${String(action.ordinal).padStart(2, '0')}`, sourceActionId: action.actionId };
    switch (action.operation) {
      case 'goto': return { ...base, operation: 'goto' as const, routeRef: action.routeRef! };
      case 'fill': return { ...base, operation: 'fill' as const, targetRef: action.semanticTargetRef!, fixtureValueRef: action.fixtureRefs[0]! };
      case 'click': return { ...base, operation: 'click' as const, targetRef: action.semanticTargetRef! };
      case 'select': return { ...base, operation: 'select' as const, targetRef: action.semanticTargetRef!, optionRef: action.optionRef! };
      case 'waitForURL': return { ...base, operation: 'waitForURL' as const, routePatternRef: action.routePatternRef!, timeoutPolicyRef: 'DEFAULT_30S' };
      case 'waitForResponse': return { ...base, operation: 'waitForResponse' as const, responsePatternRef: action.responsePatternRef!, timeoutPolicyRef: 'DEFAULT_30S' };
      case 'expectVisible': return { ...base, operation: 'expectVisible' as const, targetRef: action.semanticTargetRef! };
      case 'expectText': return { ...base, operation: 'expectText' as const, targetRef: action.semanticTargetRef!, expectedTextRef: action.fixtureRefs[0]! };
      case 'expectEqual': return { ...base, operation: 'expectEqual' as const, targetRef: action.semanticTargetRef!, comparisonTargetRef: action.comparisonTargetRef! };
      case 'screenshot': return { ...base, operation: 'screenshot' as const, evidenceNameRef: 'LOGIN_PROFILE_FINAL' };
    }
  });
  return { dsl: dslDocumentSchema.parse({ schemaVersion: 'HENGZHUN_DSL_V1', executablePlanId: plan.executablePlanId, steps }), locators };
}

function generatedSourceLegacy(dsl: DslDocument, locators: Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }>): string {
  const embedded = canonicalJson({ dsl, locators, routes: ROUTES, timeouts: TIMEOUTS });
  return `'use strict'\nconst PACKAGE = Object.freeze(${embedded})\n\nfunction locator(page, ref) {\n  const item = PACKAGE.locators[ref]\n  if (!item) throw Object.assign(new Error('Target is not allowlisted'), { code: 'CANDIDATE_TARGET_NOT_ALLOWLISTED' })\n  if (item.kind === 'TEST_ID') return page.getByTestId(item.value)\n  if (item.kind === 'LABEL') return page.getByLabel(item.value, { exact: true })\n  if (item.kind === 'ROLE') {\n    const [role, name] = item.value.split('|')\n    return page.getByRole(role, { name, exact: true })\n  }\n  throw Object.assign(new Error('Locator kind is not allowlisted'), { code: 'CANDIDATE_LOCATOR_KIND_INVALID' })\n}\n\nfunction routeUrl(baseUrl, routeRef) {\n  const route = PACKAGE.routes[routeRef]\n  if (!route || !route.startsWith('/')) throw Object.assign(new Error('Route is not allowlisted'), { code: 'CANDIDATE_ROUTE_NOT_ALLOWLISTED' })\n  const base = new URL(baseUrl)\n  const resolved = new URL(route, base)\n  if (resolved.origin !== base.origin) throw Object.assign(new Error('Route escaped the allowed origin'), { code: 'CANDIDATE_ROUTE_ORIGIN_MISMATCH' })\n  return resolved\n}\n\nasync function execute(context) {\n  const { page, baseUrl, fixtures, capture } = context\n  const facts = []\n  for (const step of PACKAGE.dsl.steps) {\n    if (step.operation === 'goto') await page.goto(routeUrl(baseUrl, step.routeRef).toString(), { waitUntil: 'domcontentloaded', timeout: PACKAGE.timeouts.DEFAULT_30S })\n    else if (step.operation === 'fill') await locator(page, step.targetRef).fill(fixtures[step.fixtureValueRef])\n    else if (step.operation === 'click') await locator(page, step.targetRef).click()\n    else if (step.operation === 'select') await locator(page, step.targetRef).selectOption(step.optionRef)\n    else if (step.operation === 'waitForURL') await page.waitForURL((url) => url.pathname.startsWith(routeUrl(baseUrl, step.routePatternRef).pathname), { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] })\n    else if (step.operation === 'waitForResponse') await page.waitForResponse((response) => response.url().includes(step.responsePatternRef), { timeout: PACKAGE.timeouts[step.timeoutPolicyRef] })\n    else if (step.operation === 'expectVisible' && !(await locator(page, step.targetRef).isVisible())) throw Object.assign(new Error('Expected target to be visible'), { code: 'CANDIDATE_EXPECT_VISIBLE_FAILED' })\n    else if (step.operation === 'expectText') { const actual = (await locator(page, step.targetRef).innerText()).trim(); if (actual !== fixtures[step.expectedTextRef]) throw Object.assign(new Error('Expected text did not match'), { code: 'CANDIDATE_EXPECT_TEXT_FAILED' }) }\n    else if (step.operation === 'expectEqual') { const left = (await locator(page, step.targetRef).innerText()).trim(); const right = (await locator(page, step.comparisonTargetRef).innerText()).trim(); if (left !== right) throw Object.assign(new Error('Expected values to be equal'), { code: 'CANDIDATE_EXPECT_EQUAL_FAILED' }) }\n    else if (step.operation === 'screenshot') await capture(step.evidenceNameRef, page)\n    facts.push({ stepId: step.stepId, operation: step.operation, passed: true })\n  }\n  return { outcome: 'PASSED', facts }\n}\n\nmodule.exports = Object.freeze({ schemaVersion: 'hengzhun-candidate-module-v1', execute })\n`;
}

export function generatedSource(dsl: DslDocument, locators: Record<string, { kind: 'ROLE' | 'LABEL' | 'TEST_ID'; value: string }>): string {
  const legacy = generatedSourceLegacy(dsl, locators);
  const instantaneousAssertion = "else if (step.operation === 'expectVisible' && !(await locator(page, step.targetRef).isVisible())) throw Object.assign(new Error('Expected target to be visible'), { code: 'CANDIDATE_EXPECT_VISIBLE_FAILED' })";
  const boundedAssertion = "else if (step.operation === 'expectVisible') { try { await locator(page, step.targetRef).waitFor({ state: 'visible', timeout: PACKAGE.timeouts.DEFAULT_30S }) } catch { throw Object.assign(new Error('Expected target to become visible'), { code: `CANDIDATE_EXPECT_VISIBLE_FAILED_${step.targetRef}` }) } }";
  if (!legacy.includes(instantaneousAssertion)) throw new Error('CANDIDATE_TEMPLATE_EXPECT_VISIBLE_ANCHOR_MISSING');
  return legacy.replace(instantaneousAssertion, boundedAssertion);
}

export interface CandidatePackage {
  candidateId: string;
  scriptId: string;
  scriptVersion: number;
  dsl: DslDocument;
  dslHash: string;
  scriptSource: string;
  scriptHash: string;
  sourceChainHash: string;
  manifest: Record<string, unknown>;
  manifestHash: string;
}

export interface RestrictedPatchProposal {
  schemaVersion: 'i8-script-patch-proposal-v1';
  operations: Array<Record<string, unknown> & { type: 'TARGET_MAPPING' | 'WAIT_CONDITION' | 'ACTION_PARAMETER' | 'STEP_ORDER' | 'ASSERTION_IMPLEMENTATION' }>;
  rationale: string;
}

export function buildPatchedCandidatePackage(
  planInput: unknown,
  recordsInput: unknown,
  base: { candidateId: string; scriptId: string; scriptVersion: number; sourceChainHash: string },
  proposal: RestrictedPatchProposal,
  attemptNo: number,
  generatedAt: string
): CandidatePackage {
  const { dsl: originalDsl, locators: originalLocators } = buildDslDocument(planInput, recordsInput);
  let steps = originalDsl.steps.map(step => ({ ...step }));
  const locators = { ...originalLocators };
  for (const operation of proposal.operations) {
    if (operation.type === 'TARGET_MAPPING') {
      const targetRef = String(operation.targetRef);
      const requested = operation.locator as { kind?: string; value?: string };
      const alternatives = REPAIR_TARGETS[targetRef as keyof typeof REPAIR_TARGETS];
      const controlled = alternatives?.find(item => item.kind === requested?.kind && item.value === requested?.value);
      if (!controlled) throw new Error('I8_PATCH_TARGET_MAPPING_NOT_ALLOWLISTED');
      if (!steps.some(step => 'targetRef' in step && step.targetRef === targetRef)) throw new Error('I8_PATCH_TARGET_UNUSED');
      locators[targetRef] = controlled;
    } else if (operation.type === 'WAIT_CONDITION') {
      const step = steps.find(item => item.stepId === operation.stepId);
      if (!step || !['waitForURL', 'waitForResponse'].includes(step.operation) || operation.timeoutPolicyRef !== 'DEFAULT_30S') throw new Error('I8_PATCH_WAIT_CONDITION_NOT_ALLOWLISTED');
      Object.assign(step, { timeoutPolicyRef: 'DEFAULT_30S' });
    } else if (operation.type === 'ACTION_PARAMETER') {
      const step = steps.find(item => item.stepId === operation.stepId);
      if (!step || step.operation !== 'select' || operation.parameter !== 'optionRef' || step.optionRef !== operation.value) throw new Error('I8_PATCH_ACTION_PARAMETER_NOT_ALLOWLISTED');
    } else if (operation.type === 'ASSERTION_IMPLEMENTATION') {
      const step = steps.find(item => item.stepId === operation.stepId);
      const expected = step?.operation === 'expectVisible' ? 'BOUNDED_VISIBLE' : step?.operation === 'expectText' ? 'EXACT_TEXT' : step?.operation === 'expectEqual' ? 'EXACT_EQUAL' : undefined;
      if (!expected || operation.implementation !== expected) throw new Error('I8_PATCH_ASSERTION_WEAKENING_REJECTED');
    } else if (operation.type === 'STEP_ORDER') {
      const order = operation.orderedStepIds as unknown;
      if (!Array.isArray(order) || order.length !== steps.length || new Set(order).size !== steps.length || steps.some(step => !order.includes(step.stepId))) throw new Error('I8_PATCH_STEP_ORDER_INVALID');
      const reordered = order.map(id => steps.find(step => step.stepId === id)!);
      const fixedOriginal = steps.filter(step => !step.operation.startsWith('expect')).map(step => step.stepId);
      const fixedReordered = reordered.filter(step => !step.operation.startsWith('expect')).map(step => step.stepId);
      if (canonicalJson(fixedOriginal) !== canonicalJson(fixedReordered) || reordered.at(-1)?.operation !== 'screenshot') throw new Error('I8_PATCH_STEP_ORDER_UNSAFE');
      steps = reordered;
    }
  }
  const dsl = dslDocumentSchema.parse({ ...originalDsl, steps });
  const dslJson = canonicalJson(dsl);
  const dslHash = sha256(dslJson);
  const patchHash = sha256(canonicalJson(proposal));
  const sourceChainHash = sha256(canonicalJson({ baseCandidateId: base.candidateId, baseSourceChainHash: base.sourceChainHash, patchHash, attemptNo, generatorVersion: I8_GENERATOR_VERSION }));
  const repairProvenance = canonicalJson({
    schemaVersion: 'i8-repair-provenance-v1',
    baseCandidateId: base.candidateId,
    patchHash,
    attemptNo,
    sourceChainHash
  });
  const scriptSource = `// HENGZHUN_REPAIR_PROVENANCE ${repairProvenance}\n${generatedSource(dsl, locators)}`;
  const scriptHash = sha256(scriptSource);
  const candidateId = `candidate_${sha256(canonicalJson({ sourceChainHash, scriptHash })).slice(0, 40)}`;
  const scriptVersion = base.scriptVersion + attemptNo;
  const manifest = {
    schemaVersion: 'hengzhun-candidate-manifest-v1', candidateId, scriptId: base.scriptId, scriptVersion,
    executablePlanId: dsl.executablePlanId, dslVersion: 'HENGZHUN_DSL_V1', dslHash,
    generatorVersion: I8_GENERATOR_VERSION, sourceChainHash, repairOfCandidateId: base.candidateId,
    patchHash, repairAttempt: attemptNo, files: [{ relativePath: 'script.cjs', sha256: scriptHash }], dependencyAllowlist: [], generatedAt
  };
  const manifestHash = sha256(canonicalJson(manifest));
  return { candidateId, scriptId: base.scriptId, scriptVersion, dsl, dslHash, scriptSource, scriptHash, sourceChainHash, manifest, manifestHash };
}

export function buildCandidatePackage(planInput: unknown, recordsInput: unknown, generatedAt: string): CandidatePackage {
  const plan = executableActionPlanSchema.parse(planInput);
  const records = (recordsInput as unknown[]).map(record => verifiedActionRecordSchema.parse(record));
  const { dsl, locators } = buildDslDocument(plan, records);
  const dslJson = canonicalJson(dsl);
  const dslHash = sha256(dslJson);
  const recordSetHash = sha256(canonicalJson(records));
  const sourceChainHash = sha256(canonicalJson({ intentPlanHash: plan.intentPlanHash, executablePlanHash: sha256(canonicalJson(plan)), recordSetHash, dslHash, generatorVersion: I8_GENERATOR_VERSION }));
  const scriptSource = generatedSource(dsl, locators);
  const scriptHash = sha256(scriptSource);
  const candidateId = `candidate_${sha256(canonicalJson({ sourceChainHash, scriptHash })).slice(0, 40)}`;
  const scriptId = `script_${sha256(`${plan.caseId}:i8-generated`).slice(0, 40)}`;
  const manifest = {
    schemaVersion: 'hengzhun-candidate-manifest-v1',
    candidateId,
    scriptId,
    scriptVersion: 1,
    caseId: plan.caseId,
    caseVersion: plan.caseVersion,
    executablePlanId: plan.executablePlanId,
    executablePlanVersion: plan.planVersion,
    dslVersion: 'HENGZHUN_DSL_V1',
    dslHash,
    generatorVersion: I8_GENERATOR_VERSION,
    sourceChainHash,
    files: [{ relativePath: 'script.cjs', sha256: scriptHash }],
    dependencyAllowlist: [],
    generatedAt
  };
  const manifestHash = sha256(canonicalJson(manifest));
  return { candidateId, scriptId, scriptVersion: 1, dsl, dslHash, scriptSource, scriptHash, sourceChainHash, manifest, manifestHash };
}

export const I8_CONTROLLED_CATALOG = Object.freeze({ routes: ROUTES, targets: TARGETS, repairTargets: REPAIR_TARGETS, timeouts: TIMEOUTS });
