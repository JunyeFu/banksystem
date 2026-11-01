'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { policyForAction, resolveVerificationAfterAction } = require('../../worker/src/i10-verification-policy.cjs');
const fs = require('node:fs');
const path = require('node:path');

function pageAt(pathname) {
  let current = pathname;
  return {
    url: () => `http://127.0.0.1:18082${current}`,
    waitForURL: async predicate => { assert.equal(typeof predicate, 'function'); },
    moveTo: value => { current = value; }
  };
}

const fuxingBinding = Object.freeze({ adapterId: 'fuxing-bank-demo', adapterVersion: '2.0.0' });

test('actual Worker challenge report conforms to the strict HTTP schema without leaking attempt payloads',async()=>{
  const root=path.resolve(__dirname,'../..');
  const source=fs.readFileSync(path.join(root,'worker/src/index.cjs'),'utf8');
  const body=source.match(/async function waitForVerificationConfirmation\(challenge, namespace\) \{([\s\S]*?)\r?\n\}\r?\n/)[1];
  let report;
  const wait=new Function('post','workerId','verificationTerminalStatuses',`return async function(challenge,namespace){${body}}`)(
    async(route,value)=>{assert.equal(route,'/internal/worker/i10/verification:report');report=value;throw Error('test-stop-after-report');},'worker-test',new Set());
  await assert.rejects(wait({taskRef:'task_test123',verificationType:'UKEY',actionOrdinal:1,userPreparation:'Complete in original browser',attempts:[{private:'not-for-report'}]},'rf064'),/test-stop-after-report/);
  const {verificationChallengeReportSchema}=require('../../dist/harness/src/i10/schemas.js');
  assert.equal(verificationChallengeReportSchema.safeParse(report).success,true);
  assert.equal(report.attempts,undefined);assert.ok(Date.parse(report.expiresAt)>Date.now());
  const formal=fs.readFileSync(path.join(root,'worker/src/i8-formal-runner.cjs'),'utf8');
  const author=fs.readFileSync(path.join(root,'worker/src/i10-midscene-candidate-authoring.cjs'),'utf8');
  assert.doesNotMatch(formal,/verificationType: 'USER_ASSISTED'/);assert.doesNotMatch(author,/verificationType: 'USER_ASSISTED'/);
});

test('isolated Chromium synthetic captcha handoff continues only from the original browser after explicit completion',async t=>{
  const root=path.resolve(__dirname,'../..'),runtimeRequire=require('node:module').createRequire(path.join(root,'runtime/package.json'));
  const {chromium}=runtimeRequire('playwright'),freeze=JSON.parse(fs.readFileSync(path.join(root,'config/demo-runtime-freeze.json'),'utf8'));
  const browser=await chromium.launch({executablePath:path.join(root,'runtime',freeze.chromium.executable),headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();let submissions=0;
  const success='/portal/transfers/11111111-1111-4111-8111-111111111111';
  await page.route('http://captcha.test/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname===success){submissions++;return route.fulfill({contentType:'text/html',body:'<span data-testid="transfer-result-status" data-status="SETTLED">SETTLED</span>'});}
    return route.fulfill({contentType:'text/html; charset=utf-8',body:`<p>合成验证码 4242</p><input id="captcha"><button onclick="if(document.querySelector('#captcha').value==='4242')location.href='${success}'">确认</button>`});
  });
  await page.goto('http://captcha.test/portal/verification');
  const policy={mode:'EXTERNAL_CONFIRM_REQUIRED',expectedRoutes:['/portal/verification',success],successRoute:'/portal/transfers/',successEvidenceTargetRef:'TRANSFER_SETTLED'};
  await assert.rejects(resolveVerificationAfterAction(page,policy,{onExternalChallenge:async()=>({status:'CANCELLED'})}),e=>e.code==='I10_VERIFICATION_NOT_CONFIRMED');
  assert.equal(submissions,0);assert.equal(new URL(page.url()).pathname,'/portal/verification');
  let checked=false;
  const result=await resolveVerificationAfterAction(page,policy,{
    onExternalChallenge:async()=>{assert.equal(submissions,0);await page.locator('#captcha').fill('4242');await page.getByRole('button',{name:'确认'}).click();return {status:'VERIFICATION_CONFIRMED'};},
    assertSuccessEvidence:async()=>{await page.locator('[data-status="SETTLED"]').waitFor({state:'visible'});checked=true;},
  });
  assert.equal(result.status,'EXTERNAL_CONFIRMED');assert.equal(checked,true);assert.equal(submissions,1);
});

test('current bank DOM exposes actual selected parties, currency and untranslated settlement status',()=>{
  const repository=path.resolve(__dirname,'../../../..');
  const create=fs.readFileSync(path.join(repository,'apps/customer-portal/src/pages/TransferCreate.tsx'),'utf8');
  const result=fs.readFileSync(path.join(repository,'apps/customer-portal/src/pages/TransferResult.tsx'),'utf8');
  assert.match(create,/data-payer-account-id=\{sourceId\}/);assert.match(create,/data-beneficiary-id=\{beneficiaryId\}/);
  assert.match(create,/data-currency=\{account\?\.currency \?\? ''\}/);
  assert.match(create,/transfer-source-option-\$\{option.value\}/);
  assert.match(create,/transfer-beneficiary-option-\$\{option.value\}/);
  assert.match(create,/data-account-id=\{option.value\}/);
  assert.match(create,/data-beneficiary-id=\{option.value\}/);
  assert.match(create,/data-testid="transfer-currency"/);
  assert.match(result,/data-testid="transfer-result-id">\{item.transferId\}/);
  assert.match(result,/data-testid="transfer-result-status" data-status=\{item.status\}/);
  assert.match(result,/item\.status/);assert.doesNotMatch(result,/data-status="SETTLED"/);
});

test('transfer request uses the reviewed account currency and unavailable parties never call the API',async()=>{
  const repository=path.resolve(__dirname,'../../../..');
  const source=fs.readFileSync(path.join(repository,'apps/customer-portal/src/pages/TransferCreate.tsx'),'utf8');
  const body=source.match(/mutationFn: \(value: FormData\) => \{([\s\S]*?)\n    \},/);
  assert.ok(body,'exercise the actual frontend mutation, not a copied request helper');
  const ts=require('typescript');
  const executable=ts.transpileModule(`const execute=(value: FormData)=>{${body[1]}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const accounts={data:{items:[{accountId:'14',currency:'CNY'},{accountId:'16',currency:'USD'}]}};
  const beneficiaries={data:{items:[{beneficiaryId:'payee-reviewed'}]}};
  const requests=[];
  const submit=new Function('accounts','beneficiaries','customerApi','idempotencyKey','correlationId',`${executable}\nreturn execute;`)(
    accounts,beneficiaries,{createTransfer:async(...args)=>{requests.push(args);return {transferId:'actual'};}},'fixed-key','fixed-correlation');
  const review={sourceAccountId:'14',beneficiaryId:'payee-reviewed',amount:1,reference:'regression'};
  await submit(review);
  assert.deepEqual(requests[0],[{sourceAccountId:'14',beneficiaryId:'payee-reviewed',amount:'1.00',currency:'CNY',reference:'regression'},'fixed-key','fixed-correlation']);
  accounts.data.items[0].currency='';
  assert.throws(()=>submit(review),/账户或收款人已不可用/);
  accounts.data.items[0].currency='CNY';beneficiaries.data.items=[];
  assert.throws(()=>submit(review),/账户或收款人已不可用/);
  assert.equal(requests.length,1);
});

test('login actions never infer verification from static page wording', async () => {
  const policy = policyForAction({ semanticTargetRef: 'LOGIN_SUBMIT' }, 'LOGIN_PROFILE', fuxingBinding);
  assert.equal(policy.mode, 'NONE');
  const result = await resolveVerificationAfterAction(pageAt('/portal/login'), policy);
  assert.equal(result.status, 'SKIPPED');
});

test('persisted UKey skips when first confirmation already reaches a settled transfer result', async () => {
  const page = pageAt('/portal/transfers/11111111-1111-4111-8111-111111111111');
  const policy = policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding);
  let evidence = 0;
  const result = await resolveVerificationAfterAction(page, policy, { assertSuccessEvidence: async ref => { evidence += 1; assert.equal(ref, 'TRANSFER_SETTLED'); } });
  assert.equal(result.status, 'AUTO_PASSED');
  assert.equal(evidence, 1);
});

test('current settlement bridge rejects old, malformed and form routes and requires actual settlement evidence',async()=>{
  const policy=policyForAction({semanticTargetRef:'TRANSFER_FIRST_CONFIRM'},'TRANSFER_UKEY_ORDER_QUERY',fuxingBinding);
  for(const route of ['/portal/orders/query','/portal/transfers/new','/portal/transfers/not-a-uuid']){
    await assert.rejects(resolveVerificationAfterAction(pageAt(route),policy,{assertSuccessEvidence:async()=>{throw Error('must not inspect invalid route');}}),
      error=>error.code==='I10_VERIFICATION_ROUTE_NOT_REACHED');
  }
  const result=pageAt('/portal/transfers/11111111-1111-4111-8111-111111111111');
  await assert.rejects(resolveVerificationAfterAction(result,policy),error=>error.code==='I10_SETTLEMENT_EVIDENCE_REQUIRED');
  await assert.rejects(resolveVerificationAfterAction(result,policy,{assertSuccessEvidence:async()=>{throw Error('test-only-pending-status');}}),/pending-status/);
});

test('real isolated Chromium does not accept a pending result as settled',async t=>{
  const root=path.resolve(__dirname,'../..'),runtimeRequire=require('node:module').createRequire(path.join(root,'runtime/package.json'));
  const {chromium}=runtimeRequire('playwright'),freeze=JSON.parse(fs.readFileSync(path.join(root,'config/demo-runtime-freeze.json'),'utf8'));
  const browser=await chromium.launch({executablePath:path.join(root,'runtime',freeze.chromium.executable),headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.route('http://policy.test/**',route=>route.fulfill({contentType:'text/html',body:'<span data-testid="transfer-result-status" data-status="PENDING_CORE_POSTING">处理中</span>'}));
  await page.goto('http://policy.test/portal/transfers/11111111-1111-4111-8111-111111111111');
  const policy=policyForAction({semanticTargetRef:'TRANSFER_FIRST_CONFIRM'},'TRANSFER_UKEY_ORDER_QUERY',fuxingBinding);
  const handlers={assertSuccessEvidence:async ref=>{assert.equal(ref,'TRANSFER_SETTLED');await page.locator('[data-testid="transfer-result-status"][data-status="SETTLED"]').waitFor({state:'visible',timeout:100});}};
  await assert.rejects(resolveVerificationAfterAction(page,policy,handlers));
  await page.getByTestId('transfer-result-status').evaluate(node=>{node.dataset.status='SETTLED';node.textContent='已结算';});
  assert.equal((await resolveVerificationAfterAction(page,policy,handlers)).status,'AUTO_PASSED');
});

test('authoring and generated formal code select exact parties and reject each mismatch before submission',async t=>{
  const root=path.resolve(__dirname,'../..'),runtimeRequire=require('node:module').createRequire(path.join(root,'runtime/package.json'));
  const {chromium}=runtimeRequire('playwright'),freeze=JSON.parse(fs.readFileSync(path.join(root,'config/demo-runtime-freeze.json'),'utf8'));
  const browser=await chromium.launch({executablePath:path.join(root,'runtime',freeze.chromium.executable),headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();
  const adapter=require('../../worker/src/adapters/fuxing-bank-demo/index.cjs');
  const {generatedSource}=require('../../dist/harness/src/i8/script-package-builder.js');
  const fixtures={'TRANSFER.PAYER_ACCOUNT_ID':'14','TRANSFER.PAYEE_REF':'11111111-1111-4111-8111-111111111111','TRANSFER.CURRENCY':'CNY'};
  const html=`<form data-testid="transfer-form" data-payer-account-id="16" data-beneficiary-id="wrong" data-currency="USD"></form>
  <button data-testid="transfer-source-account" onclick="document.getElementById('payer').hidden=false">payer</button>
  <button id="payer" hidden data-testid="transfer-source-option-14" onclick="const f=document.querySelector('form');f.dataset.payerAccountId='14';f.dataset.currency='CNY';this.hidden=true">actual payer</button>
  <button data-testid="transfer-beneficiary" onclick="document.getElementById('payee').hidden=false">payee</button>
  <button id="payee" hidden data-testid="transfer-beneficiary-option-${fixtures['TRANSFER.PAYEE_REF']}" onclick="document.querySelector('form').dataset.beneficiaryId='${fixtures['TRANSFER.PAYEE_REF']}';this.hidden=true">actual beneficiary</button>
  <button data-testid="transfer-submit" onclick="window.submissions++">submit</button><button data-testid="transfer-first-confirm" onclick="window.submissions++">confirm</button><script>window.submissions=0</script>`;
  const steps=[{operation:'select',targetRef:'TRANSFER_SOURCE_ACCOUNT',optionRef:'TRANSFER.PAYER_ACCOUNT_ID'},{operation:'select',targetRef:'TRANSFER_BENEFICIARY',optionRef:'TRANSFER.PAYEE_REF'},{operation:'click',targetRef:'TRANSFER_SUBMIT'},{operation:'click',targetRef:'TRANSFER_FIRST_CONFIRM'}];
  const locators=Object.fromEntries(steps.map(step=>[step.targetRef,adapter.FUXING_BANK_DEMO_TARGETS[step.targetRef]]));
  const module={exports:{}};
  new Function('module',generatedSource({steps},locators,fixtures,{}))(module);
  for(const mode of ['authoring','formal']) {
    await page.setContent(html);
    if(mode==='formal') await module.exports.execute({page,fixtures});
    else {await adapter.selectTransferParty(page,'TRANSFER_SOURCE_ACCOUNT',fixtures['TRANSFER.PAYER_ACCOUNT_ID']);await adapter.selectTransferParty(page,'TRANSFER_BENEFICIARY',fixtures['TRANSFER.PAYEE_REF']);await adapter.assertTransferSelection(page,fixtures);await page.getByTestId('transfer-submit').click();}
    assert.equal(await page.getByTestId('transfer-form').getAttribute('data-payer-account-id'),'14');
    assert.equal(await page.evaluate(()=>window.submissions),mode==='formal'?2:1);
    for(const attribute of ['data-payer-account-id','data-beneficiary-id','data-currency']) {
      await page.getByTestId('transfer-form').evaluate((node,name)=>node.setAttribute(name,'wrong'),attribute);
      for(const targetRef of ['TRANSFER_SUBMIT','TRANSFER_FIRST_CONFIRM']) {
        const clickModule={exports:{}};
        new Function('module',generatedSource({steps:[{operation:'click',targetRef}]},locators,fixtures,{}))(clickModule);
        await assert.rejects(mode==='formal'?clickModule.exports.execute({page,fixtures}):adapter.assertTransferSelection(page,fixtures),error=>error.code==='CANDIDATE_TRANSFER_SELECTION_MISMATCH');
      }
      assert.equal(await page.evaluate(()=>window.submissions),mode==='formal'?2:1);
      await page.getByTestId('transfer-form').evaluate((node,values)=>{node.dataset.payerAccountId=values['TRANSFER.PAYER_ACCOUNT_ID'];node.dataset.beneficiaryId=values['TRANSFER.PAYEE_REF'];node.dataset.currency=values['TRANSFER.CURRENCY'];},fixtures);
    }
  }
});

test('verification route observes a control then delegates the only click to the Playwright executor', async () => {
  const page = pageAt('/portal/verification');
  const policy = policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding);
  let observations = 0;
  let clicks = 0;
  const result = await resolveVerificationAfterAction(page, policy, {
    observeControl: async () => { observations += 1; return { locator: { kind: 'ROLE', value: 'button|确认验证' } }; },
    executeControl: async observation => { clicks += 1; page.moveTo('/portal/transfers/11111111-1111-4111-8111-111111111111'); return observation.locator; },
    assertSuccessEvidence: async () => undefined
  });
  assert.equal(result.status, 'WEB_CONTROL_CLICKED');
  assert.equal(observations, 1);
  assert.equal(clicks, 1);
});

test('verification route fails closed without a verified web control', async () => {
  await assert.rejects(
    resolveVerificationAfterAction(pageAt('/portal/verification'), policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding)),
    error => error.code === 'I10_UKEY_WEB_CONTROL_NOT_FOUND'
  );
});

test('persisted UKey stops after one failed observation without automatically retrying', async () => {
  const page = pageAt('/portal/verification');
  let observations = 0;
  const attempts = [];
  await assert.rejects(
    resolveVerificationAfterAction(page, policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding), {
      observeControl: async () => { observations += 1; throw Object.assign(new Error('not found'), { code: 'I10_UKEY_WEB_CONTROL_NOT_FOUND' }); },
      executeControl: async () => { throw new Error('must not execute without an observation'); },
      pageFingerprint: async () => `fingerprint-${observations}`,
      recordAttempt: async attempt => attempts.push(attempt)
    }),
    error => error.code === 'I10_UKEY_AUTOMATION_ATTEMPTS_EXHAUSTED'
  );
  assert.equal(observations, 1);
  assert.equal(attempts.length, 1);
  assert.deepEqual(attempts.map(item => item.attempt), [1]);
});

test('persisted UKey resumes the same visible page only after one failed observation and explicit confirmation', async () => {
  const page = pageAt('/portal/verification');
  let observations = 0;
  let handoffs = 0;
  const result = await resolveVerificationAfterAction(
    page,
    policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY', fuxingBinding),
    {
      observeControl: async () => { observations += 1; throw Object.assign(new Error('not found'), { code: 'I10_UKEY_WEB_CONTROL_NOT_FOUND' }); },
      executeControl: async () => { throw new Error('must not execute without an observation'); },
      allowExternalFallback: true,
      onExternalChallenge: async ({ attempts }) => {
        handoffs += 1;
        assert.equal(attempts.length, 1);
        page.moveTo('/portal/transfers/11111111-1111-4111-8111-111111111111');
        return { status: 'VERIFICATION_CONFIRMED' };
      },
      assertSuccessEvidence: async () => undefined
    }
  );
  assert.equal(observations, 1);
  assert.equal(handoffs, 1);
  assert.equal(result.status, 'EXTERNAL_CONFIRMED_AFTER_AUTO_ATTEMPTS');
});

test('clicked UKey with unresolved navigation is never clicked again',async()=>{
  const page=pageAt('/portal/verification');let clicks=0,observations=0;
  await assert.rejects(resolveVerificationAfterAction(page,
    policyForAction({semanticTargetRef:'TRANSFER_FIRST_CONFIRM'},'TRANSFER_UKEY_ORDER_QUERY',fuxingBinding),{
      observeControl:async()=>{observations++;return {locator:{kind:'TEST_ID',value:'ukey-verify-control'}};},
      executeControl:async()=>{clicks++;return {kind:'TEST_ID',value:'ukey-verify-control'};}
    }),error=>error.code==='I10_UKEY_AUTOMATION_ATTEMPTS_EXHAUSTED');
  assert.equal(clicks,1);assert.equal(observations,1);assert.equal(new URL(page.url()).pathname,'/portal/verification');
});

test('real isolated Chromium confirms an unresolved money control receives exactly one DOM click',async t=>{
  const root=path.resolve(__dirname,'../..');
  const {createRequire}=require('node:module');
  const runtimeRequire=createRequire(path.join(root,'runtime/package.json'));
  const {chromium}=runtimeRequire('playwright');
  const freeze=JSON.parse(fs.readFileSync(path.join(root,'config/demo-runtime-freeze.json'),'utf8'));
  const browser=await chromium.launch({executablePath:path.join(root,'runtime',freeze.chromium.executable),headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.route('http://policy.test/**',route=>route.fulfill({contentType:'text/html',
    body:'<button data-testid="ukey-verify-control" onclick="window.clicks=(window.clicks||0)+1">确认验证</button>'}));
  await page.goto('http://policy.test/portal/verification');
  const adapter={url:()=>page.url(),waitForURL:predicate=>page.waitForURL(predicate,{timeout:100})};
  let observations=0;
  await assert.rejects(resolveVerificationAfterAction(adapter,
    policyForAction({semanticTargetRef:'TRANSFER_FIRST_CONFIRM'},'TRANSFER_UKEY_ORDER_QUERY',fuxingBinding),{
      observeControl:async()=>{observations++;return {locator:{kind:'TEST_ID',value:'ukey-verify-control'}};},
      executeControl:async()=>{const locator=page.getByTestId('ukey-verify-control');await locator.click();return locator;}
    }),error=>error.code==='I10_UKEY_AUTOMATION_ATTEMPTS_EXHAUSTED');
  assert.equal(observations,1);assert.equal(await page.evaluate(()=>window.clicks),1);
});

test('workers do not scan whole-page static text after every action', () => {
  const root = path.resolve(__dirname, '..', '..');
  const authoring = fs.readFileSync(path.join(root, 'worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  const formal = fs.readFileSync(path.join(root, 'worker/src/i8-formal-runner.cjs'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'harness/src/i8/script-package-builder.ts'), 'utf8');
  assert.doesNotMatch(authoring, /classifyVerificationChallenge\(await page\.locator\('body'\)\.innerText/);
  assert.doesNotMatch(formal, /classifyVerificationChallenge/);
  assert.doesNotMatch(builder, /验证码\|U盾\|OTP\|PIN\|human verification\).*humanVerification/);
});

test('generic targets never inherit the Fuxing U-key policy without a frozen adapter binding', () => {
  const policy = policyForAction({ semanticTargetRef: 'TRANSFER_FIRST_CONFIRM' }, 'TRANSFER_UKEY_ORDER_QUERY');
  assert.equal(policy.mode, 'NONE');
});

test('formal and stability workers normalize a target launch page to its origin root', () => {
  const root = path.resolve(__dirname, '..', '..');
  const { formalBaseUrl, runtimeAllowedOrigins } = require(path.join(root, 'worker/src/i8-formal-runner.cjs'));
  const { stabilityAllowedOrigins } = require(path.join(root, 'worker/src/i8-stability-runner.cjs'));
  const task = { execution: { targetProfile: {
    launchUrl: 'http://127.0.0.1:18082/portal/login',
    status: 'ACTIVE',
    allowedNavigationOrigins:['http://127.0.0.1:18082','http://127.0.0.1:19000'],
    adapterBinding: { adapterId: 'fuxing-bank-demo', adapterVersion: '2.0.0' }
  } } };
  const baseUrl = formalBaseUrl(task, {}, {});
  assert.equal(baseUrl, 'http://127.0.0.1:18082/');
  assert.ok(runtimeAllowedOrigins(task, baseUrl).has('http://127.0.0.1:19000'));
  assert.ok(stabilityAllowedOrigins(task.execution.targetProfile, baseUrl).includes('http://127.0.0.1:19000'));
});

test('Midscene remains a locator observer and never invokes a browser action API', () => {
  const root = path.resolve(__dirname, '..', '..');
  const authoring = fs.readFileSync(path.join(root, 'worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8');
  const legacyPolicy = fs.readFileSync(path.join(root, 'worker/src/i10-verification-policy.cjs'), 'utf8');
  const policy = fs.readFileSync(path.join(root, 'worker/src/adapters/fuxing-bank-demo/verification-policy.cjs'), 'utf8');
  assert.match(authoring, /async function observeTargetWithMidscene/);
  assert.match(authoring, /withMidsceneLocateTimeout\(\(\) => agent\.aiLocate\(prompt\)\)/);
  assert.doesNotMatch(authoring, /\.ai(?:Action|Tap|Click|Input|Hover|Scroll)\s*\(/);
  assert.match(authoring, /async function executePlaywrightClick/);
  assert.match(legacyPolicy, /isFuxingDemoBinding/);
  assert.match(legacyPolicy, /adapterId === BANK_AUTH.adapterId/);
  assert.match(policy, /const observation = await observeControl/);
  assert.match(policy, /const locator = await executeControl\(observation\)/);
});

test('transfer template delegates persisted U-key navigation to the verification policy exactly once', () => {
  const root = path.resolve(__dirname, '..', '..');
  const adapter = fs.readFileSync(path.join(root, 'harness/src/i8/adapters/fuxing-bank-demo.ts'), 'utf8');
  const transferTemplate = adapter.slice(adapter.indexOf('export const FUXING_BANK_DEMO_TRANSFER_TEMPLATE'), adapter.indexOf('export function fuxingBankDemoPageSignature'));
  assert.match(transferTemplate, /TRANSFER_FIRST_CONFIRM/);
  assert.match(transferTemplate, /PORTAL_TRANSFER_RESULT/);
  assert.doesNotMatch(transferTemplate, /routePatternRef: 'PORTAL_VERIFICATION'/);
  assert.doesNotMatch(transferTemplate, /target: 'UKEY_VERIFY'/);
});
