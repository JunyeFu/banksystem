'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertContextBudget,
  buildActionContextEnvelope,
  buildMidscenePrompt,
  estimateImageTokens,
  estimateTextTokens,
  normalizeMidscenePromptEnvelope
} = require('../../dist/harness/src/context-envelope.js')

function input(overrides = {}) {
  return {
    contextLevel: 'CTX-L1',
    tokenizerId: 'mimo-tokenizer-v1',
    imageTokenEstimate: 1024,
    workerId: 'worker-coverage',
    slotId: 'slot-coverage-0001',
    leaseExpiresAt: '2026-08-12T10:00:00.000Z',
    currentAction: {
      actionType: 'LOCATE',
      prompt: '定位当前客户姓名',
      targetRef: 'HEADER_DISPLAY_NAME',
      valueRef: null,
      riskLevel: 'LOW',
      executionMode: 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE'
    },
    previousActionSummary: { ordinal: 1, actionType: 'TAP', summary: '打开资料页' },
    nextActionPreview: { actionType: 'TAP', prompt: '打开详情' },
    recentFacts: { summary: '登录完成', verification: { dom: true, url: true, request: false, business: false } },
    currentPageState: { route: '/portal/home' },
    minimalDependencyCone: { caseId: 'case-coverage', caseVersion: 1, executionProfile: 'GENERIC_WEB', assertionCount: 1 },
    ...overrides
  }
}

test('context envelope enforces level projection and deterministic token estimates', () => {
  assert.equal(estimateImageTokens(513, 513), 4096)
  assert.ok(estimateTextTokens({ value: '衡准' }, 0) > 0)
  const envelope = buildActionContextEnvelope(input())
  assert.equal(envelope.contextLevel, 'CTX-L1')
  assert.equal(envelope.previousActionSummary, null)
  assert.equal(envelope.nextActionPreview, null)
  assert.equal(envelope.minimalDependencyCone, null)
  assert.equal(envelope.pageSignature.source, 'PLAYWRIGHT_VERIFIED')
  assert.equal(envelope.budgetDecision, 'ALLOW')
  assert.match(buildMidscenePrompt(envelope), /HEADER_DISPLAY_NAME/)
})

test('verified locator experience reaches the bounded visual prompt without changing the action or expected result', () => {
  const feedbackId='feedback_11111111-1111-4111-8111-111111111111';
  const reviewedLocator={feedbackId,locator:{kind:'TEST_ID',value:'customer-name'}};
  const envelope=buildActionContextEnvelope(input({currentAction:{...input().currentAction,reviewedLocator}}));
  assert.deepEqual(envelope.currentAction.reviewedLocator,reviewedLocator);
  assert.equal(envelope.currentAction.targetRef,input().currentAction.targetRef);
  assert.equal(envelope.currentAction.executionMode,'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE');
  const prompt=buildMidscenePrompt(envelope);
  assert.match(prompt,/customer-name/);assert.match(prompt,/不得改变动作、输入或预期/);
  assert.throws(()=>buildActionContextEnvelope(input({currentAction:{...input().currentAction,reviewedLocator:{...reviewedLocator,amount:'0.01'}}})));
});

test('context envelope fails visual invocation closed when its budget is exhausted', () => {
  const envelope = buildActionContextEnvelope(input({ imageTokenEstimate: 20_000 }))
  assert.equal(envelope.budgetDecision, 'PLAYWRIGHT_ONLY')
  assert.equal(envelope.currentAction.executionMode, 'PLAYWRIGHT_ONLY')
  assert.throws(() => buildMidscenePrompt(envelope), error => error?.errorCode === 'VISION_CONTEXT_NOT_AUTHORIZED')
  assert.throws(() => assertContextBudget('VISION_LLM', 12_001), error => error?.errorCode === 'VISION_CONTEXT_BUDGET_EXCEEDED')
})

test('verified assertion experience is frozen without accepting a replacement business goal',()=>{
  const reviewedAssertion={feedbackId:'feedback_11111111-1111-4111-8111-111111111111',implementation:'EXACT_TEXT'};
  const envelope=buildActionContextEnvelope(input({currentAction:{...input().currentAction,reviewedAssertion}}));
  assert.deepEqual(envelope.currentAction.reviewedAssertion,reviewedAssertion);
  assert.match(buildMidscenePrompt(envelope),/EXACT_TEXT/);
  assert.throws(()=>buildActionContextEnvelope(input({currentAction:{...input().currentAction,reviewedAssertion:{...reviewedAssertion,expected:'通过'}}})));
});

test('context envelope normalizes only governed display-name targets', () => {
  const header = buildActionContextEnvelope(input())
  assert.match(normalizeMidscenePromptEnvelope(header).currentAction.prompt, /页面右上角用户区/)
  const profile = buildActionContextEnvelope(input({
    currentAction: { ...input().currentAction, targetRef: 'PROFILE_DISPLAY_NAME' },
    currentPageState: null
  }))
  assert.match(normalizeMidscenePromptEnvelope(profile).currentAction.prompt, /个人资料主卡片/)
  assert.equal(profile.pageSignature.source, 'INITIAL_UNKNOWN')
})

test('assertion implementation patches change execution while preserving the frozen DSL and reject empty or weakened repairs', () => {
  const {buildCandidatePackage,buildPatchedCandidatePackage}=require('../../dist/harness/src/i8/script-package-builder.js');
  const {canonicalJson,sha256}=require('../../dist/harness/src/utils.js');
  const action={actionId:'action_exact',ordinal:1,operation:'expectText',semanticTargetRef:'STATUS',instruction:'核对转账最终成功',expected:'完成',
    pageSignature:{routePatternRef:'DETAIL',landmarkRef:'STATUS',requiredAriaRefs:[]},fixtureRefs:['EXPECTED.STATUS'],preconditions:[],
    invariants:['目标不可修改'],postconditions:[],riskLevel:'LOW',retryPolicy:{maximumRetries:0,sideEffectFree:true},branchRules:[],
    failureExit:'FAIL_ACTION',evidencePolicy:'FACTS',sourceIntentStepId:'intent_exact'};
  const plan={schemaVersion:'hengzhun-executable-action-plan-v2',executablePlanId:'plan_assertion',caseId:'case_assertion',caseVersion:1,
    intentPlanHash:'a'.repeat(64),planVersion:1,fixtureProfile:'GENERIC_WEB',fixtureValues:{'EXPECTED.STATUS':'完成'},
    targetProfileSnapshot:{launchUrl:'http://127.0.0.1:18083/ops/documents'},actions:[action]};
  const record={schemaVersion:'i8-verified-action-record-v1',executablePlanId:plan.executablePlanId,actionId:action.actionId,ordinal:1,
    outcome:'VERIFIED_PASSED',locator:{kind:'TEST_ID',value:'status'},pageSignatureHash:sha256(canonicalJson(action.pageSignature)),
    factsHash:'b'.repeat(64),verification:{dom:true,url:true,request:true,business:true},verifiedAt:'2026-10-09T00:00:00.000Z'};
  const base=buildCandidatePackage(plan,[record],record.verifiedAt);
  const propose=(operations)=>buildPatchedCandidatePackage(plan,[record],base,{schemaVersion:'i8-script-patch-proposal-v1',operations,rationale:'精确断言等待异步页面结果'},1,record.verifiedAt);
  const correction={type:'ASSERTION_IMPLEMENTATION',stepId:'dsl_01',implementation:'EXACT_TEXT'};
  const repaired=propose([correction]);
  assert.deepEqual(repaired.dsl,base.dsl);assert.equal(repaired.dslHash,base.dslHash);
  assert.notEqual(repaired.scriptHash,base.scriptHash);
  assert.deepEqual(repaired.manifest.assertionImplementations,{dsl_01:'EXACT_TEXT'});
  assert.equal(repaired.manifest.dslVersion,'HENGZHUN_DSL_V2');
  assert.throws(()=>propose([{...correction,implementation:'BOUNDED_VISIBLE'}]),/I8_PATCH_ASSERTION_WEAKENING_REJECTED/);
  assert.throws(()=>propose([correction,correction]),/I8_PATCH_ASSERTION_IMPLEMENTATION_NOOP/);
  const visiblePlan={...plan,actions:[{...action,operation:'expectVisible',fixtureRefs:[]}]};
  assert.throws(()=>buildPatchedCandidatePackage(visiblePlan,[record],base,{schemaVersion:'i8-script-patch-proposal-v1',operations:[{...correction,implementation:'BOUNDED_VISIBLE'}],rationale:'已经默认等待'},1,record.verifiedAt),/I8_PATCH_ASSERTION_IMPLEMENTATION_NOOP/);
  const learnedPlan={...plan,actions:[{...action,semanticTargetRef:'LOGIN_SUBMIT'}]};
  const learnedRecord={...record,assertionImplementation:'EXACT_TEXT'};
  const learned=buildCandidatePackage(learnedPlan,[learnedRecord],record.verifiedAt,
    new Map([[action.actionId,{feedbackId:'feedback_11111111-1111-4111-8111-111111111111',implementation:'EXACT_TEXT'}]]));
  const relocated=buildPatchedCandidatePackage(learnedPlan,[learnedRecord],learned,{schemaVersion:'i8-script-patch-proposal-v1',
    operations:[{type:'TARGET_MAPPING',targetRef:'LOGIN_SUBMIT',locator:require('../../dist/harness/src/i8/script-package-builder.js').I8_CONTROLLED_CATALOG.repairTargets.LOGIN_SUBMIT[0]}],rationale:'更正定位且保留已核验断言'},1,record.verifiedAt);
  assert.deepEqual(relocated.manifest.assertionImplementations,{dsl_01:'EXACT_TEXT'});
  assert.deepEqual(relocated.dsl,learned.dsl);
  const embedded=JSON.parse(relocated.scriptSource.match(/^const PACKAGE = Object\.freeze\((.*)\)$/m)[1]);
  assert.deepEqual(embedded.assertionImplementations,{dsl_01:'EXACT_TEXT'});
});

test('real isolated Chromium proves exact-text and equal repair waits for unchanged goals and rejects a wrong outcome', async t => {
  const path=require('node:path'),{createRequire}=require('node:module'),vm=require('node:vm');
  const root=path.resolve(__dirname,'../..');
  const {chromium}=createRequire(path.join(root,'runtime/node_modules/_hengzhun_loader.cjs'))('playwright');
  const {generatedSource}=require('../../dist/harness/src/i8/script-package-builder.js');
  const {executeAuthoringAssertion}=require('../../worker/src/i10-midscene-candidate-authoring.cjs');
  const freeze=require('../../config/demo-runtime-freeze.json');
  const browser=await chromium.launch({executablePath:path.join(root,'runtime',freeze.chromium.executable),headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();
  const setContent=async html=>{await page.goto('about:blank');await page.setContent(html);}; // Fresh document cancels the previous scenario's timer.
  const load=(source)=>{const module={exports:{}};vm.runInNewContext(source,{module});return module.exports;};
  const dsl={schemaVersion:'HENGZHUN_DSL_V2',executablePlanId:'plan_browser_assertion',steps:[{stepId:'dsl_01',sourceActionId:'action_01',operation:'expectText',targetRef:'STATUS',expectedTextRef:'EXPECTED.STATUS'}]};
  const locators={STATUS:{kind:'TEST_ID',value:'status'},OTHER:{kind:'TEST_ID',value:'other'}};
  const fixtures={'EXPECTED.STATUS':'完成'};
  const action={operation:'expectText',fixtureRefs:['EXPECTED.STATUS']};
  const worker=implementation=>executeAuthoringAssertion(page,action,page.getByTestId('status'),null,fixtures,implementation);
  const execute=(source)=>load(source).execute({page,baseUrl:'http://127.0.0.1',fixtures});
  const delayed=`<meta charset="utf-8"><span data-testid="status">处理中</span><script>setTimeout(()=>document.querySelector('span').textContent='完成',600)</script>`;
  await setContent(delayed);
  await assert.rejects(execute(generatedSource(dsl,locators,fixtures)),e=>e.code==='CANDIDATE_EXPECT_TEXT_FAILED');
  await setContent(delayed);
  assert.equal((await execute(generatedSource(dsl,locators,fixtures,{}, {},{dsl_01:'EXACT_TEXT'}))).outcome,'PASSED');
  const equality={...dsl,steps:[{stepId:'dsl_01',sourceActionId:'action_01',operation:'expectEqual',targetRef:'STATUS',comparisonTargetRef:'OTHER'}]};
  const delayedEqual=`<meta charset="utf-8"><span data-testid="status">100.00</span><span data-testid="other">99.00</span><script>setTimeout(()=>document.querySelector('[data-testid="other"]').textContent='100.00',600)</script>`;
  await setContent(delayedEqual);
  await assert.rejects(execute(generatedSource(equality,locators)),e=>e.code==='CANDIDATE_EXPECT_EQUAL_FAILED');
  await setContent(delayedEqual);
  assert.equal((await execute(generatedSource(equality,locators,{}, {}, {},{dsl_01:'EXACT_EQUAL'}))).outcome,'PASSED');
  await setContent('<meta charset="utf-8"><span data-testid="status">未完成</span>');
  await assert.rejects(execute(generatedSource(dsl,locators,fixtures,{}, {},{dsl_01:'EXACT_TEXT'})),e=>e.code==='CANDIDATE_EXPECT_TEXT_FAILED');
  await assert.rejects(worker(),e=>e.code==='I10_EXPECT_TEXT_FAILED'); // Worker must no longer skip expectText.
  await assert.rejects(worker('EXACT_EQUAL'),e=>e.code==='I10_ASSERTION_EXPERIENCE_MISMATCH');
  await setContent(delayed);
  await worker('EXACT_TEXT');
  await setContent(delayedEqual);
  await executeAuthoringAssertion(page,{operation:'expectEqual',fixtureRefs:[]},page.getByTestId('status'),page.getByTestId('other'),{},'EXACT_EQUAL');
  await setContent('<meta charset="utf-8"><span data-testid="status">未完成</span>');
  await assert.rejects(worker('EXACT_TEXT'),e=>e.code==='I10_EXPECT_TEXT_FAILED');
});
