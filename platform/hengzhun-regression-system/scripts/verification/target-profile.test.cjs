'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I10Service } = require('../../dist/harness/src/i10/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')
const { compileExecutableActionPlan, buildDslDocument, buildCandidatePackage, generatedSource } = require('../../dist/harness/src/i8/script-package-builder.js')
const { FUXING_BANK_DEMO_ADAPTER } = require('../../dist/harness/src/i8/target-adapter-registry.js')

function s5SemanticPlan(steps, bank=false) {
  const snapshot={targetProfileId:'targetprofile_12345678-1234-1234-1234-123456789abc',version:1,status:'ACTIVE',profileHash:'9'.repeat(64),
    launchUrl:'https://example.test/accounts',allowedNavigationOrigins:['https://example.test'],allowedInteractionOrigins:['https://example.test'],credentialOrigins:['https://example.test']};
  if(bank)snapshot.adapterBinding=FUXING_BANK_DEMO_ADAPTER;
  return compileExecutableActionPlan({schemaVersion:'i8-intent-plan-v1',caseId:'case_12345678-1234-1234-1234-123456789abc',caseVersion:1,
    route:snapshot.launchUrl,executionProfile:'GENERIC_WEB',targetProfileId:snapshot.targetProfileId,targetProfileVersion:1,targetProfileHash:snapshot.profileHash,targetProfileSnapshot:snapshot,
    steps:steps.map((action,index)=>({intentStepId:`intent-s5-${index}`,action,expected:'账户页面和余额可见',riskLevel:'LOW',inputValueSource:'NONE'})),assertions:['账户页面和余额可见']},'9'.repeat(64));
}

function observationPackage(plan) {
  const {canonicalJson,sha256}=require('../../dist/harness/src/utils.js');
  const records=plan.actions.map(a=>({schemaVersion:'hengzhun-verified-action-record-v2',executablePlanId:plan.executablePlanId,actionId:a.actionId,ordinal:a.ordinal,outcome:'VERIFIED_PASSED',
    ...(a.semanticTargetRef?{locator:{kind:'CSS',value:'#observed'}}:{}),pageSignatureHash:sha256(canonicalJson(a.pageSignature)),factsHash:'a'.repeat(64),verification:{dom:true,url:true,request:true,business:true},verifiedAt:new Date().toISOString()}));
  return buildDslDocument(plan,records);
}

test('D01 explicit bank field aliases compile to a bound business observation, not literal UI labels',()=>{
  const plan=s5SemanticPlan(['打开账户页面','查看账户列表中的账户标识、人民币余额和账户状态'],true);
  assert.deepEqual(plan.actions[1].pageObservation,{schemaVersion:'bank-account-fields/v1',fields:['IDENTIFIER','CURRENCY','BALANCE','STATUS'],currency:'CNY'});
  assert.equal(s5SemanticPlan(['打开账户页面','查看账户标识'],false).actions[1].pageObservation,undefined);
  const generic={...plan,targetProfileSnapshot:{...plan.targetProfileSnapshot,adapterBinding:undefined}};
  assert.throws(()=>observationPackage(generic),/BANK_OBSERVATION_BINDING_REQUIRED/);
  assert.equal(s5SemanticPlan(['打开贷款申请页面','核对贷款申请的还款账号'],true).actions[1].pageObservation,undefined);
});

test('D04 expected absence of page errors is not a positive error-text locator',()=>{
  const plan=s5SemanticPlan(['打开账户页面','检查页面是否出现错误提示或加载异常，并保持当前页面不变。']);
  // The semantic compiler must consult the expected outcome, not the keyword alone.
  const action=plan.actions[1];
  const snapshot=plan.targetProfileSnapshot;
  const input={schemaVersion:'i8-intent-plan-v1',caseId:plan.caseId,caseVersion:1,route:snapshot.launchUrl,executionProfile:'GENERIC_WEB',targetProfileId:plan.targetProfileId,targetProfileVersion:1,targetProfileHash:plan.targetProfileHash,targetProfileSnapshot:snapshot,
    steps:[{intentStepId:'open',action:'打开账户页面',expected:'已加载',riskLevel:'LOW',inputValueSource:'NONE'},
      {intentStepId:'errors',action:action.instruction,expected:'页面无错误提示或加载异常，仍停留在账户列表页面。',riskLevel:'LOW',inputValueSource:'NONE'}],assertions:['页面无错误']};
  const absence=compileExecutableActionPlan(input,'b'.repeat(64));
  assert.equal(absence.actions[1].operation,'expectNoErrors');
  assert.equal(absence.actions[1].semanticTargetRef,undefined);
  input.steps[1].expected='显示错误提示';
  assert.equal(compileExecutableActionPlan(input,'c'.repeat(64)).actions[1].operation,'expectVisible');
});

test('S5 completion aspect before a terminal page state does not become literal locator text',()=>{
  const plan=s5SemanticPlan(['打开账户页面','检查完成后保持在账户列表页面']);
  assert.equal(plan.actions[1].operation,'expectVisible');
  assert.equal(plan.actions[1].instruction,'核对账户列表页面');
  assert.equal(s5SemanticPlan(['打开账户页面','点击查询按钮后保持在账户列表页面']).actions[1].operation,'click');
  assert.equal(s5SemanticPlan(['打开账户页面','检查余额后保持在账户列表页面']).actions[1].instruction,'检查余额后保持在账户列表页面');
});

test('D04 actual error absence execution passes a clean page and rejects visible errors without navigating',async t=>{
  const runtimeRequire=require('node:module').createRequire(path.resolve('runtime/package.json'));
  const freeze=JSON.parse(fs.readFileSync('config/demo-runtime-freeze.json','utf8'));
  const browser=await runtimeRequire('playwright').chromium.launch({executablePath:path.resolve('runtime',freeze.chromium.executable),headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();const module={exports:{}};
  new Function('module',generatedSource({schemaVersion:'HENGZHUN_DSL_V2',steps:[{stepId:'errors',operation:'expectNoErrors'}]},{}))(module);
  const run=()=>module.exports.execute({page,fixtures:{},capture:async()=>{}});
  await page.setContent('<h1>账户列表</h1><div role="alert">操作成功</div><div hidden role="alert">错误</div>');const before=page.url();await run();assert.equal(page.url(),before);
  for(const html of ['<div role="alert">账户列表加载失败</div>','<section data-view-state="ERROR"><p>暂时不可用</p></section>','<div class="ant-alert-error">请求未完成</div>']) {
    await page.setContent(html);await assert.rejects(run,{code:'WORKER_PAGE_ERROR_PRESENT'});
  }
});

test('D02 D03 D05 real browser rejects incomplete rows empty tables and corrupted formal business values',async t=>{
  const runtimeRequire=require('node:module').createRequire(path.resolve('runtime/package.json'));
  const freeze=JSON.parse(fs.readFileSync('config/demo-runtime-freeze.json','utf8'));
  const browser=await runtimeRequire('playwright').chromium.launch({executablePath:path.resolve('runtime',freeze.chromium.executable),headless:true});
  t.after(()=>browser.close());const page=await browser.newPage();
  const plan=s5SemanticPlan(['打开账户页面','查看账户列表中的账户标识、人民币余额和账户状态'],true);
  const built=observationPackage(plan);built.dsl.steps=built.dsl.steps.filter(x=>x.operation!=='goto');
  const source=generatedSource(built.dsl,built.locators,built.fixtures,built.routes);const module={exports:{}};new Function('module',source)(module);
  const render=(row)=>page.setContent('<section><h1 id="observed">账户列表</h1><table><thead><tr><th>账号</th><th>币种</th><th>可用余额</th><th>状态</th></tr></thead><tbody>'+row+'</tbody></table></section>');
  const run=()=>module.exports.execute({page,baseUrl:'https://example.test',fixtures:{},capture:async()=>{}});
  await render('<tr><td>****1234</td><td>CNY</td><td>¥100.00</td><td>正常</td></tr>');await run();
  await t.test('D02 missing status in a compound account assertion fails',async()=>{await render('<tr><td>****1234</td><td>CNY</td><td>¥100.00</td><td></td></tr>');await assert.rejects(run,{code:'BANK_ACCOUNT_FIELDS_FAILED'});});
  await t.test('D03 a visible heading and headers cannot make an empty table pass',async()=>{await render('');await assert.rejects(run,{code:'BANK_ACCOUNT_ROWS_MISSING'});});
  await t.test('D05 formal replay preserves currency and balance assertions, not just visibility',async()=>{await render('<tr><td>****1234</td><td>USD</td><td>¥100.00</td><td>正常</td></tr>');await assert.rejects(run,{code:'BANK_ACCOUNT_CURRENCY_FAILED'});await render('<tr><td>****1234</td><td>CNY</td><td>invalid</td><td>正常</td></tr>');await assert.rejects(run,{code:'BANK_ACCOUNT_FIELDS_FAILED'});});
});

test('S5 locative read-only inspection is not a click',()=>{
  const pageQualified=s5SemanticPlan(['打开账户页面','在账户列表页面只读核对账户、人民币余额和账户状态。'],true);
  assert.equal(pageQualified.actions[1].operation,'expectVisible');
  assert.equal(pageQualified.actions[1].pageObservation.schemaVersion,'bank-account-fields/v1');
  assert.equal(s5SemanticPlan(['打开账户页面','在账户列表页面点击转账按钮']).actions[1].operation,'click');
  const instruction='在账户列表中只读核对账户标识、人民币余额和账户状态字段。';
  const plan=s5SemanticPlan(['打开账户页面',instruction]);
  assert.equal(plan.actions.find(a=>a.instruction===instruction).operation,'expectVisible');
  assert.equal(s5SemanticPlan(['打开账户页面','点击账户查询按钮']).actions[1].operation,'click');
});

test('S5 prohibitions become invariants while a positive click in a mixed instruction remains',()=>{
  const prohibition='确认页面处于只读检查状态，不点击转账、业务申请、资料修改或日期修改相关控件。';
  const plan=s5SemanticPlan(['打开账户页面',prohibition]);
  assert.deepEqual(plan.actions.map(a=>a.operation),['goto','screenshot']);
  assert.ok(plan.actions[0].invariants.some(value=>value.includes('不点击转账')));
  const mixed=s5SemanticPlan(['打开账户页面','点击查询按钮，不点击转账按钮。']);
  assert.equal(mixed.actions[1].operation,'click');
  assert.equal(mixed.actions[1].instruction,'点击查询按钮');
  assert.ok(mixed.actions[1].invariants.includes('不点击转账按钮'));
  const standalone='确认当前页面并保持只读状态。';
  const policy=s5SemanticPlan(['打开账户页面',standalone]);
  assert.deepEqual(policy.actions.map(a=>a.operation),['goto','screenshot']);
  assert.ok(policy.actions[0].invariants.includes(standalone));
});

test('S5 staying on a business page asserts the page without navigating to a forbidden destination',()=>{
  const also=s5SemanticPlan(['打开账户页面','保持在账户列表页面，也不访问历史受控门户。']);
  assert.equal(also.actions[1].operation,'expectVisible');
  assert.equal(also.actions[1].instruction,'核对账户列表页面');
  assert.ok(also.actions[1].invariants.includes('也不访问历史受控门户'));
  const positive=s5SemanticPlan(['打开账户页面','点击查询按钮，也不点击转账按钮。']);
  assert.equal(positive.actions[1].operation,'click');
  assert.equal(positive.actions[1].instruction,'点击查询按钮');
  const plan=s5SemanticPlan(['打开账户页面','完成核对后保持在账户列表页面，不进入历史受控门户。']);
  assert.equal(plan.actions[1].operation,'expectVisible');
  assert.equal(plan.actions[1].instruction,'核对账户列表页面');
  assert.ok(plan.actions[1].invariants.includes('不进入历史受控门户'));
  const staying=s5SemanticPlan(['打开账户页面','停留在账户列表页面，不执行任何提交操作。']);
  assert.equal(staying.actions[1].operation,'expectVisible');
  assert.equal(staying.actions[1].instruction,'核对账户列表页面');
  assert.ok(staying.actions[1].invariants.includes('不执行任何提交操作'));
  const current=s5SemanticPlan(['打开账户页面','确认页面停留在账户列表，不访问历史受控门户。']);
  assert.equal(current.actions[1].operation,'expectVisible');
  assert.equal(current.actions[1].instruction,'核对账户列表');
  assert.ok(current.actions[1].invariants.includes('不访问历史受控门户'));
  const maintained=s5SemanticPlan(['打开账户页面','保持当前页面为账户列表，确认未触发转账、业务申请、资料或日期修改。']);
  assert.equal(maintained.actions[1].instruction,'核对账户列表');
  assert.equal(maintained.actions[1].operation,'expectVisible');
  assert.ok(maintained.actions[1].invariants.includes('确认未触发转账、业务申请、资料或日期修改'));
  const final=s5SemanticPlan(['打开账户页面','确认保持在账户列表，且未发起转账、未提交业务申请、未修改资料或日期。']);
  assert.equal(final.actions[1].instruction,'核对账户列表');
  assert.equal(final.actions[1].operation,'expectVisible');
  assert.ok(final.actions[1].invariants.some(value=>value.includes('未发起转账')));
  const readonly=s5SemanticPlan(['打开账户页面','确认页面保持只读并停留在账户列表。']);
  assert.equal(readonly.actions[1].instruction,'核对账户列表');
  assert.equal(readonly.actions[1].operation,'expectVisible');
  assert.equal(s5SemanticPlan(['打开账户页面','点击查询按钮并保持在账户列表。']).actions[1].operation,'click');
});

test('S5 first business assertion is preserved after an explicit launch action',()=>{
  const plan=s5SemanticPlan(['核对账户余额']);
  assert.deepEqual(plan.actions.map(a=>a.operation),['goto','expectVisible','screenshot']);
  assert.equal(plan.actions[1].instruction,'核对账户余额');
  assert.equal(plan.actions[1].sourceIntentStepId,'intent-s5-0');
});

test('operations authentication is an explicit distinct binding with only the registered portal and identity origin',async t=>{
  const {FUXING_BANK_OPERATIONS_ADAPTER:binding,isFuxingBankDemoAdapter,resolveTargetAdapterBinding}=require('../../dist/harness/src/i8/target-adapter-registry.js');
  assert.equal(isFuxingBankDemoAdapter(binding),false);
  assert.equal(resolveTargetAdapterBinding({...binding,manifestHash:'0'.repeat(64)}),undefined);
  const f=await fixture();t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})});
  const input={namespace:f.namespace,idempotencyKey:'operations-profile-contract',displayName:'运营门户',launchUrl:'http://127.0.0.1:18083/ops/login',credentialRef:f.credentialRef,tlsPolicy:'STRICT',adapterSelection:binding.adapterId};
  const profile=await f.service.prepareTargetProfile(input);
  assert.deepEqual(profile.allowedNavigationOrigins,['http://127.0.0.1:18083','http://127.0.0.1:19000']);
  assert.deepEqual(profile.credentialOrigins,['http://127.0.0.1:19000']);assert.deepEqual(profile.adapterBinding,binding);
  for(const launchUrl of ['http://127.0.0.1:18082/portal/login','http://127.0.0.1:18083/ops/documents','https://other.test/ops/login'])
    await assert.rejects(f.service.prepareTargetProfile({...input,idempotencyKey:'reject-'+launchUrl,launchUrl}),error=>error.errorCode==='I10_OPERATIONS_LAUNCH_NOT_ALLOWED');
});

test('bank input v2 admits actual account and beneficiary IDs, not aliases or partial money inputs', () => {
  const {typedBusinessInputsV2Schema} = require('../../dist/harness/src/schemas.js')
  const value={schemaVersion:'hengzhun-i10-typed-business-inputs-v2',source:'USER_CONFIRMED',
    values:{payerAccountId:'3',payeeRef:'11111111-1111-4111-8111-111111111111',amount:'0.01',currency:'CNY',purpose:'回归'}}
  assert.deepEqual(typedBusinessInputsV2Schema.parse(value),value)
  for(const change of [{payerAccountId:'0'},{payerAccountId:'03'},{payeeRef:'payee_demo_0001'},{amount:'0.00'}])
    assert.equal(typedBusinessInputsV2Schema.safeParse({...value,values:{...value.values,...change}}).success,false)
  const {payerAccountId,...withoutPayer}=value.values
  assert.equal(typedBusinessInputsV2Schema.safeParse({...value,values:withoutPayer}).success,false)
  assert.equal(typedBusinessInputsV2Schema.safeParse({...value,schemaVersion:'hengzhun-i10-typed-business-inputs-v1'}).success,false)
})

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-target-profile-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root, 'data.sqlite'),
    migrationsDirectory: path.resolve(__dirname, '../../harness/migrations'),
    backupDirectory: path.join(root, 'backups')
  })
  const service = new I10Service(database, root, new ArtifactStore(database, path.join(root, 'artifacts')))
  const now = new Date().toISOString()
  const namespace = 'target-profile-test'
  const credentialRef = 'credential_12345678-1234-1234-1234-123456789abc'
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace, now, now)
  database.connection.prepare(`INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at)
    VALUES ('credsession_12345678-1234-1234-1234-123456789abc',?,?,?,?,'READY',?,1,?,?,?)`)
    .run(namespace, 'target-profile-credential', '目标站点凭据', '0'.repeat(64), credentialRef, '2099-01-01T00:00:00.000Z', now, now)
  database.connection.prepare(`INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at)
    VALUES (?,?,'credsession_12345678-1234-1234-1234-123456789abc','.data/credentials/test.bin',?,'WINDOWS_DPAPI_CURRENT_USER',?)`)
    .run(credentialRef, namespace, '1'.repeat(64), now)
  return { root, database, service, namespace, credentialRef }
}

async function localTarget(t, handler = (_request, response) => response.end('ok')) {
  const server = http.createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

test('target profile freezes an arbitrary http(s) entry and binds credential reference', async t => {
  const f = await fixture()
  const targetBase = await localTarget(t)
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-prepare-001',
    displayName: '内网业务门户',
    launchUrl: `${targetBase}/app/login`,
    credentialRef: f.credentialRef,
    tlsPolicy: 'STRICT'
  })
  assert.equal(prepared.status, 'PENDING_CONFIRMATION')
  assert.deepEqual(prepared.allowedNavigationOrigins, [targetBase])
  const active = await f.service.decideTargetProfile({
    namespace: f.namespace,
    targetProfileId: prepared.targetProfileId,
    expectedVersion: prepared.version,
    decision: 'APPROVE',
    confirmationRef: 'target-profile-confirm-001'
  })
  assert.equal(active.status, 'ACTIVE')
  assert.equal(active.launchUrl, `${targetBase}/app/login`)
  assert.deepEqual(active.resolvedAddresses, { '127.0.0.1': ['127.0.0.1'] })
  const binding = f.database.connection.prepare('SELECT target_profile_id FROM i10_credential_refs WHERE credential_ref=?').get(f.credentialRef)
  assert.equal(binding.target_profile_id, active.targetProfileId)
})

test('target profile persists only a registered explicit adapter binding', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-adapter-001',
    sessionRef: 'session-target-adapter-001',
    displayName: '演示门户',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    credentialRef: f.credentialRef,
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    tlsPolicy: 'STRICT'
  })
  assert.deepEqual(prepared.adapterBinding, FUXING_BANK_DEMO_ADAPTER)
  assert.deepEqual(prepared.allowedNavigationOrigins,['http://127.0.0.1:28884','http://127.0.0.1:19000'])
  assert.deepEqual(prepared.credentialOrigins,['http://127.0.0.1:19000'])
  assert.equal(prepared.executionEngine, 'TARGET_ADAPTER')
  await assert.rejects(
    () => f.service.prepareTargetProfile({
      namespace: f.namespace,
      idempotencyKey: 'target-profile-adapter-invalid',
      sessionRef: 'session-target-adapter-invalid',
      displayName: '演示门户',
      launchUrl: 'http://127.0.0.1:28884/portal/login',
      credentialRef: f.credentialRef,
      adapterBinding: { ...FUXING_BANK_DEMO_ADAPTER, manifestHash: '0'.repeat(64) },
      tlsPolicy: 'STRICT'
    }),
    error => error && error.errorCode === 'I10_TARGET_ADAPTER_BINDING_INVALID'
  )
})

test('a symbolic adapter selection resolves only to the registered controlled binding', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-adapter-selection-001',
    sessionRef: 'session-target-adapter-selection-001',
    displayName: '演示门户',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    credentialRef: f.credentialRef,
    adapterSelection: 'fuxing-bank-demo',
    tlsPolicy: 'STRICT'
  })
  assert.deepEqual(prepared.adapterBinding, FUXING_BANK_DEMO_ADAPTER)
  assert.equal(prepared.executionEngine, 'TARGET_ADAPTER')
  await assert.rejects(
    () => f.service.prepareTargetProfile({
      namespace: f.namespace,
      idempotencyKey: 'target-profile-adapter-selection-ambiguous',
      sessionRef: 'session-target-adapter-selection-ambiguous',
      displayName: '演示门户',
      launchUrl: 'http://127.0.0.1:28884/portal/login',
      credentialRef: f.credentialRef,
      adapterSelection: 'fuxing-bank-demo',
      adapterBinding: FUXING_BANK_DEMO_ADAPTER,
      tlsPolicy: 'STRICT'
    }),
    error => error && error.errorCode === 'I10_TARGET_ADAPTER_SELECTION_AMBIGUOUS'
  )
})

test('application modules and capabilities are target-owned and activated with their profile', async t => {
  const f = await fixture()
  const targetBase = await localTarget(t)
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const prepared = await f.service.prepareTargetProfile({
    namespace: f.namespace,
    idempotencyKey: 'target-profile-application-001',
    sessionRef: 'session-target-application-001',
    displayName: '内网业务系统',
    launchUrl: `${targetBase}/app/login`,
    credentialRef: f.credentialRef,
    tlsPolicy: 'STRICT',
    applicationProfile: {
      displayName: '内网业务系统已声明模块',
      modules: [
        { moduleId: 'identity', displayName: '统一登录', capabilities: ['AUTHENTICATION', 'NAVIGATION', 'ASSERTION'] },
        { moduleId: 'account-query', displayName: '账户查询', capabilities: ['READ_ONLY_QUERY', 'TABLE_INTERACTION', 'EVIDENCE_CAPTURE'] }
      ]
    }
  })
  assert.equal(prepared.applicationProfile.status, 'PENDING_CONFIRMATION')
  assert.equal(prepared.applicationProfile.modules.length, 2)
  const active = await f.service.decideTargetProfile({
    namespace: f.namespace, targetProfileId: prepared.targetProfileId,
    expectedVersion: prepared.version, decision: 'APPROVE', confirmationRef: 'target-profile-application-confirm-001'
  })
  assert.equal(active.applicationProfile.status, 'ACTIVE')
  const count = f.database.connection.prepare('SELECT COUNT(*) AS count FROM i10_module_capabilities').get()
  assert.equal(count.count, 6)
})

test('generic plan and DSL retain the frozen target profile and dynamic verified locator', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 2,
    status: 'ACTIVE',
    profileHash: 'a'.repeat(64),
    launchUrl: 'https://example.test/sign-in',
    allowedNavigationOrigins: ['https://example.test'],
    allowedInteractionOrigins: ['https://example.test'],
    credentialOrigins: ['https://example.test']
  }
  const intentPlan = {
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 2,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '输入用户名', expected: '用户名已输入', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-003', action: '点击登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['主页可见']
  }
  const plan = compileExecutableActionPlan(intentPlan, 'b'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.equal(plan.targetProfileHash, targetProfileSnapshot.profileHash)
  const records = plan.actions.map(action => ({
    schemaVersion: 'hengzhun-verified-action-record-v2',
    executablePlanId: plan.executablePlanId,
    actionId: action.actionId,
    ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED',
    ...(action.semanticTargetRef ? { locator: { kind: 'CSS', value: `#target-${action.ordinal}` } } : {}),
    pageSignatureHash: require('node:crypto').createHash('sha256').update(JSON.stringify(action.pageSignature, Object.keys(action.pageSignature).sort())).digest('hex'),
    factsHash: 'c'.repeat(64),
    verification: { dom: true, url: true, request: true, business: true },
    verifiedAt: new Date().toISOString()
  }))
  // Use the same canonicalizer as production for page signature hashes.
  const { canonicalJson, sha256 } = require('../../dist/harness/src/utils.js')
  for (let index = 0; index < records.length; index += 1) records[index].pageSignatureHash = sha256(canonicalJson(plan.actions[index].pageSignature))
  const built = buildDslDocument(plan, records)
  assert.equal(built.dsl.schemaVersion, 'HENGZHUN_DSL_V2')
  assert.equal(built.routes.LAUNCH_URL, targetProfileSnapshot.launchUrl)
  assert.equal(built.locators.DYNAMIC_002.kind, 'CSS')
  const candidate = buildCandidatePackage(plan, records, new Date().toISOString())
  assert.equal(candidate.manifest.dslVersion, 'HENGZHUN_DSL_V2')
  assert.equal(candidate.manifest.targetProfileHash, targetProfileSnapshot.profileHash)
  assert.match(candidate.scriptSource, /const \{ page, baseUrl, fixtures, capture, afterStep, humanVerification, onStep \} = context/)
  assert.match(candidate.scriptSource, /await onStep\(\{ phase: 'STARTED'/)
  assert.match(candidate.scriptSource, /await onStep\(\{ phase: 'PASSED'/)
  assert.doesNotThrow(() => new Function('module', 'exports', candidate.scriptSource))
})

test('generic credential login is expanded into executable Playwright steps without banking selectors', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'f'.repeat(64),
    displayName: '内网账户服务',
    launchUrl: 'https://intranet.example.local/login',
    allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'],
    credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录系统', expected: '成功登录系统', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-account', action: '进入账户概览', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['账户概览页面可见']
  }, '1'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.deepEqual(plan.actions.slice(0, 5).map(action => action.operation), ['goto', 'fill', 'fill', 'click', 'waitForURL'])
  assert.deepEqual(plan.actions.slice(1, 3).map(action => action.fixtureRefs[0]), ['CREDENTIAL.USERNAME', 'CREDENTIAL.PASSWORD'])
  assert.equal(plan.actions[4].semanticTargetRef, undefined)
  assert.equal(plan.actions[4].routePatternRef, 'ALLOWED_NAVIGATION')
  assert.equal(plan.actions[5].instruction, '进入账户概览')
  assert.equal(plan.actions[5].semanticTargetRef, 'DYNAMIC_006')
  assert.equal(/复兴银行|PORTAL_LOGIN/.test(JSON.stringify(plan)), false)

  const records = plan.actions.map(action => ({
    schemaVersion: 'hengzhun-verified-action-record-v2',
    executablePlanId: plan.executablePlanId,
    actionId: action.actionId,
    ordinal: action.ordinal,
    outcome: 'VERIFIED_PASSED',
    locator: action.semanticTargetRef
      ? { kind: 'CSS', value: `[data-test-id="${action.semanticTargetRef.toLowerCase()}"]` }
      : undefined,
    pageSignatureHash: require('../../dist/harness/src/utils.js').sha256(
      require('../../dist/harness/src/utils.js').canonicalJson(action.pageSignature)
    ),
    factsHash: 'e'.repeat(64),
    verification: { dom: true, url: true, request: true, business: true },
    verifiedAt: new Date().toISOString()
  }))
  const built = buildDslDocument(plan, records)
  assert.deepEqual(JSON.parse(built.routes.ALLOWED_NAVIGATION), targetProfileSnapshot.allowedNavigationOrigins)
  const candidate = buildCandidatePackage(plan, records, new Date().toISOString())
  assert.match(candidate.scriptSource, /let navigationBaseline = null/)
  assert.match(candidate.scriptSource, /const beforeClickUrl = page\.url\(\); await locator\(page, step\.targetRef\)\.click\(\); navigationBaseline = beforeClickUrl/)
  assert.match(candidate.scriptSource, /const baseline = navigationBaseline \|\| page\.url\(\)/)
  assert.match(candidate.scriptSource, /Array\.isArray\(rule\) \? rule\.includes\(url\.origin\) && url\.toString\(\) !== baseline/)
  assert.doesNotMatch(candidate.scriptSource, /url\.toString\(\) !== launchUrl/)
  assert.doesNotMatch(candidate.scriptSource, /step\.operation === 'waitForURL'\) await page\.waitForLoadState/)
})

test('generic compound assertions share one read-only visual region and navigation remains an executor click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: '2'.repeat(64), launchUrl: 'https://intranet.example.local/login',
    allowedNavigationOrigins: ['https://intranet.example.local'], allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '进入账户概览', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '验证账户状态及余额', expected: '账户状态显示正常，可用余额已显示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['账户状态与余额已显示']
  }, '3'.repeat(64))
  assert.equal(plan.actions[1].operation, 'click')
  const verification = plan.actions.filter(action => /账户状态|余额/.test(action.instruction))
  assert.equal(verification.length, 1)
  assert.deepEqual(verification.map(action => action.operation), ['expectVisible'])
  assert.match(verification[0].instruction, /账户状态/)
  assert.match(verification[0].instruction, /余额/)
})

test('generated candidate URL wait uses the current page as its fallback navigation baseline', async () => {
  const source = generatedSource({
    schemaVersion: 'hengzhun-dsl-v1',
    steps: [{
      stepId: 'dsl-wait-current',
      operation: 'waitForURL',
      timeoutPolicyRef: 'DEFAULT_30S',
      routePatternRef: 'ALLOWED_NAVIGATION'
    }]
  }, {}, {}, {
    LAUNCH_URL: '/portal/',
    ALLOWED_NAVIGATION: JSON.stringify(['http://127.0.0.1:18082'])
  })
  const candidateModule = { exports: {} }
  Function('module', 'exports', source)(candidateModule, candidateModule.exports)
  const predicateResults = []
  const currentUrl = 'http://127.0.0.1:18082/portal/dashboard'
  const page = {
    url: () => currentUrl,
    waitForURL: async predicate => {
      predicateResults.push(
        predicate(new URL(currentUrl)),
        predicate(new URL('http://127.0.0.1:18082/portal/accounts')),
        predicate(new URL('https://outside.example/accounts'))
      )
    },
    waitForLoadState: async () => {}
  }
  await candidateModule.exports.execute({ page, baseUrl: 'http://127.0.0.1:18082/', fixtures: {} })
  assert.deepEqual(predicateResults, [false, true, false])
})

test('generic filtering instruction is compiled as a deterministic select with its requested option', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '5'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '筛选近期交易', expected: '成功筛选出近期交易', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['近期交易可见']
  }, '5'.repeat(64))
  const filter = plan.actions.find(action => action.instruction === '筛选近期交易')
  assert.equal(filter.operation, 'select')
  assert.equal(plan.fixtureValues[filter.optionRef], '近期交易')
})

test('a standalone read-only prohibition is an invariant, never an executor click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '8'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const prohibition = '保持当前只读操作，不点击任何转账、修改或删除类功能按钮'
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: prohibition, expected: '无业务变更', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['登录页可见']
  }, '8'.repeat(64))
  assert.deepEqual(plan.actions.map(action => action.operation), ['goto', 'screenshot'])
  assert.ok(plan.actions[0].invariants.includes(prohibition))
})

test('generic navigation phrased as click or select remains an executor click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '8'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '在导航菜单中点击或选择“账户概览”选项', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['账户概览页面可见']
  }, '8'.repeat(64))
  const navigation = plan.actions.find(action => action.instruction.includes('账户概览'))
  assert.equal(navigation.operation, 'click')
  assert.equal(navigation.optionRef, undefined)
})

test('generic navigation phrased as select and enter compiles as a click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '8'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '在客户门户导航菜单中选择并进入“账户概览”页面', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['账户概览页面可见']
  }, '8'.repeat(64))
  const navigation = plan.actions.find(action => action.instruction.includes('选择并进入'))
  assert.equal(navigation.operation, 'click')
  assert.equal(navigation.optionRef, undefined)
})

test('generic read-only list inspection is an assertion instead of a synthetic click', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '6'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '查看收款人列表', expected: '姓名、账户掩码和状态展示正确', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['收款人列表可见']
  }, '6'.repeat(64))
  const inspection = plan.actions.find(action => action.instruction === '查看收款人列表')
  assert.equal(inspection.operation, 'expectVisible')
  assert.equal(inspection.retryPolicy.sideEffectFree, true)
})

test('generic locative lookup and verification remains a read-only assertion', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '9'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '在账户概览页面中查找并核对人民币账户及其可用余额', expected: '人民币账户及可用余额可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['人民币账户及可用余额可见']
  }, '9'.repeat(64))
  const lookup = plan.actions.find(action => action.instruction.includes('查找并核对'))
  assert.equal(lookup.operation, 'expectVisible')
  assert.equal(lookup.retryPolicy.sideEffectFree, true)
})

test('generic verification phrased as 核验 remains a read-only assertion', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: 'a'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '在账户概览列表中核验人民币账户及其可用余额', expected: '至少展示了一个人民币账户，且其可用余额清晰可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['人民币账户及其可用余额可见']
  }, 'a'.repeat(64))
  const inspection = plan.actions.find(action => action.instruction.includes('核验人民币账户'))
  assert.equal(inspection.operation, 'expectVisible')
  assert.equal(inspection.retryPolicy.sideEffectFree, true)
})

test('generic compiler keeps adjacent read-only facts from different intent steps separate', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: 'b'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '检查页面中是否有币种为人民币（CNY/人民币）的账户。', expected: '至少找到一个人民币账户。', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '查看该人民币账户的可用余额字段。', expected: '显示可用的余额数值。', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['人民币账户及其可用余额可见']
  }, 'b'.repeat(64))
  const inspections = plan.actions.filter(action => action.operation === 'expectVisible')
  assert.equal(inspections.length, 2)
  assert.deepEqual(inspections.map(action => action.sourceIntentStepId), ['intent-002', 'intent-003'])
  assert.doesNotMatch(inspections.map(action => action.instruction).join('\n'), /；/)
})

test('generic document inspection does not invent a query button or download a file while checking its entry', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '7'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '查询一份文档', expected: '查询到文档', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '确认文档标题、日期和下载入口正确', expected: '文档信息正确展示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['文档列表可见']
  }, '7'.repeat(64))
  const inspections = plan.actions.filter(action => action.operation === 'expectVisible')
  assert.ok(inspections.some(action => /查询一份文档/.test(action.instruction)))
  assert.ok(inspections.some(action => /下载入口/.test(action.instruction)))
  assert.equal(plan.actions.some(action => action.operation === 'download'), false)
})

test('generic credential expansion removes only a redundant entry-url pseudo-action', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '4'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-entry', action: '打开入口URL', expected: '页面加载成功', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-login', action: '登录', expected: '登录成功', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-next', action: '进入账户概览', expected: '账户概览页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['账户概览页面可见']
  }, '5'.repeat(64))
  assert.equal(plan.actions.some(action => action.instruction === '打开入口URL'), false)
  assert.equal(plan.actions.at(-2)?.instruction, '进入账户概览')
})

test('only an explicit controlled adapter binding uses the deterministic login template', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'd'.repeat(64),
    displayName: '复兴银行门户网站',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开复兴银行门户并登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'NONE' },
      // The controller may classify the semantic verification as MEDIUM even
      // though the deterministic executable template contains only LOW-risk,
      // allow-listed Playwright operations.
      { intentStepId: 'intent-002', action: '检查头像和姓名后进入个人资料', expected: '头像姓名一致', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['主页和个人资料的头像姓名一致']
  }, 'e'.repeat(64))
  assert.equal(plan.fixtureProfile, 'LOGIN_PROFILE')
  assert.ok(plan.actions.length > 6)
  assert.equal(plan.actions[0].routeRef, 'PORTAL_LOGIN')
})

test('generic operation classification never turns an expected clickable result into a download action', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE', profileHash: '8'.repeat(64),
    launchUrl: 'https://intranet.example.local/login', allowedNavigationOrigins: ['https://intranet.example.local'],
    allowedInteractionOrigins: ['https://intranet.example.local'], credentialOrigins: ['https://intranet.example.local']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '确认下载入口正确', expected: '下载入口存在且可点击', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['下载入口存在']
  }, '8'.repeat(64))
  const inspection = plan.actions.find(action => /确认下载入口/.test(action.instruction))
  assert.equal(inspection.operation, 'expectVisible')

  const corroborationPlan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002b', action: '核对文档标题、日期和下载入口', expected: '文档信息正确展示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['下载入口存在']
  }, '8'.repeat(64))
  assert.equal(corroborationPlan.actions.find(action => /核对文档标题/.test(action.instruction)).operation, 'expectVisible')
  const transactionInspectionPlan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开登录页', expected: '登录页可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002c', action: '校验交易日期、金额和状态可读', expected: '交易信息清晰可读', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ], assertions: ['交易信息可读']
  }, '8'.repeat(64))
  assert.equal(transactionInspectionPlan.actions.find(action => /校验交易日期/.test(action.instruction)).operation, 'expectVisible')
  assert.equal(plan.actions.some(action => action.operation === 'download'), false)
})

test('a controlled adapter binding does not turn a document case into the login profile template', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'f'.repeat(64),
    displayName: '复兴银行门户网站',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'],
    allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884'],
    adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: '使用安全凭据登录', expected: '进入门户主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-002', action: '进入文档页面', expected: '文档页面可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '查询一份文档', expected: '查询到账户文档', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-004', action: '确认文档标题、日期和下载入口正确', expected: '文档信息正确展示', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['文档标题、日期和下载入口正确']
  }, 'f'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.ok(plan.actions.some(action => /查询一份文档/.test(action.instruction)))
  assert.equal(plan.actions.some(action => action.semanticTargetRef === 'HEADER_DISPLAY_NAME'), false)
})

test('generic compilation replaces the completed login boundary once and keeps English inspection read-only', () => {
  const targetProfileSnapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc',
    version: 1,
    status: 'ACTIVE',
    profileHash: 'c'.repeat(64),
    displayName: '复兴银行门户网站',
    launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'],
    allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884'],
    adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: targetProfileSnapshot.launchUrl,
    executionProfile: 'GENERIC_WEB',
    targetProfileId: targetProfileSnapshot.targetProfileId,
    targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash,
    targetProfileSnapshot,
    steps: [
      { intentStepId: 'intent-001', action: 'Navigate to the customer portal login page.', expected: 'Login page is displayed with username and password fields.', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-002', action: 'Enter valid login credentials and submit the login form.', expected: 'User is authenticated and redirected to the customer portal home page.', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-003', action: "Click on the 'Account Overview' link.", expected: 'Account Overview is displayed.', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-004', action: 'Inspect the displayed list of accounts for any account with currency type RMB (CNY).', expected: 'At least one RMB account is visible.', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-005', action: 'Verify that the available balance is displayed for the identified RMB account.', expected: 'The available balance is visible.', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['One RMB account and its available balance are visible.']
  }, 'c'.repeat(64))
  assert.equal(plan.actions.filter(action => action.operation === 'fill').length, 2)
  assert.equal(plan.actions.some(action => /Navigate to|Enter valid login credentials/.test(action.instruction)), false)
  const inspections = plan.actions.filter(action => /^(?:Inspect|Verify)/.test(action.instruction))
  assert.equal(inspections.length, 2)
  assert.deepEqual(inspections.map(action => action.operation), ['expectVisible', 'expectVisible'])
  assert.deepEqual(inspections.map(action => action.sourceIntentStepId), ['intent-004', 'intent-005'])
  assert.doesNotMatch(inspections[0].instruction, /Verify that the available balance/)
})

test('generic compilation removes a separate Chinese login-page step before the authenticated business view', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: 'd'.repeat(64), launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'], allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884'], adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开客户门户首页并进入登录界面', expected: '显示用户名和密码字段', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-002', action: '使用测试环境安全认证方式完成登录', expected: '身份验证通过并跳转至账户概览', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-003', action: '查看账户列表区域', expected: '人民币账户可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['人民币账户可见']
  }, 'd'.repeat(64))
  assert.equal(plan.actions.filter(action => action.operation === 'fill').length, 2)
  assert.equal(plan.actions.some(action => /进入登录界面|完成登录/.test(action.instruction)), false)
  assert.equal(plan.actions.some(action => action.instruction === '查看账户列表区域' && action.operation === 'expectVisible'), true)
})

test('generic compilation treats a locate-only balance instruction as a read-only assertion', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: 'e'.repeat(64), launchUrl: 'http://127.0.0.1:28884/portal/dashboard',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'], allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884']
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [
      { intentStepId: 'intent-001', action: '打开账户概览页面', expected: '账户概览可见', riskLevel: 'LOW', inputValueSource: 'NONE' },
      { intentStepId: 'intent-002', action: '定位该人民币账户对应行中的“可用余额”列。', expected: '可用余额可见', riskLevel: 'LOW', inputValueSource: 'NONE' }
    ],
    assertions: ['可用余额可见']
  }, 'e'.repeat(64))
  assert.equal(plan.actions[1].operation, 'expectVisible')
})

test('I10 controlled transfer compiles only frozen typed business inputs', () => {
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: 'http://127.0.0.1:18082/portal/login',
    executionProfile: 'TRANSFER_UKEY_ORDER_QUERY',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    inputContractVersion: 'TypedBusinessInputsV2',
    typedBusinessInputs: {
      schemaVersion: 'hengzhun-i10-typed-business-inputs-v2',
      values: { payerAccountId:'3', payeeRef: '11111111-1111-4111-8111-111111111111', amount: '1.00', currency: 'CNY', purpose: '自动化回归测试' },
      source: 'USER_CONFIRMED'
    },
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '选择已登记收款人，填写金额 1.00，用途为自动化回归测试', expected: '转账摘要显示金额和用途', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['转账受理成功并显示单号']
  }, 'a'.repeat(64))
  assert.equal(plan.fixtureProfile, 'TRANSFER_UKEY_ORDER_QUERY')
  assert.equal(plan.fixtureValues['TRANSFER.AMOUNT'], '1.00')
  assert.equal(plan.fixtureValues['TRANSFER.PURPOSE'], '自动化回归测试')
  assert.equal(plan.fixtureValues['TRANSFER.PAYEE_REF'], '11111111-1111-4111-8111-111111111111')
  assert.equal(plan.fixtureValues['TRANSFER.PAYER_ACCOUNT_ID'], '3')
  assert.equal(plan.fixtureValues['TRANSFER.CURRENCY'], 'CNY')
  const selections=plan.actions.filter(action=>action.operation==='select')
  assert.deepEqual(selections.map(action=>[action.semanticTargetRef,action.optionRef]),[
    ['TRANSFER_SOURCE_ACCOUNT','TRANSFER.PAYER_ACCOUNT_ID'],['TRANSFER_BENEFICIARY','TRANSFER.PAYEE_REF']])
  assert.ok(selections.every(action=>action.ordinal<plan.actions.find(item=>item.semanticTargetRef==='TRANSFER_SUBMIT').ordinal))
})

test('approved Fuxing adapter plus typed transfer inputs overrides a controller generic profile', () => {
  const targetProfileSnapshot = {
    schemaVersion: 'hengzhun-target-profile-v1',
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: '9'.repeat(64), launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'], allowedInteractionOrigins: ['http://127.0.0.1:28884'],
    credentialOrigins: ['http://127.0.0.1:28884'], adapterBinding: FUXING_BANK_DEMO_ADAPTER
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: targetProfileSnapshot.launchUrl, executionProfile: 'GENERIC_WEB', adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    targetProfileId: targetProfileSnapshot.targetProfileId, targetProfileVersion: 1,
    targetProfileHash: targetProfileSnapshot.profileHash, targetProfileSnapshot,
    inputContractVersion: 'TypedBusinessInputsV2',
    typedBusinessInputs: {
      schemaVersion: 'hengzhun-i10-typed-business-inputs-v2',
      values: { payerAccountId:'3', payeeRef: '11111111-1111-4111-8111-111111111111', amount: '1.00', currency: 'CNY', purpose: '自动化回归测试' },
      source: 'USER_CONFIRMED'
    },
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '提交转账并完成首次确认', expected: '进入网页验证或单号查询流程', riskLevel: 'HIGH', inputValueSource: 'NONE' }
    ],
    assertions: ['转账首次确认完成并进入单号查询']
  }, '9'.repeat(64))
  assert.equal(plan.fixtureProfile, 'TRANSFER_UKEY_ORDER_QUERY')
  assert.ok(plan.actions.some(action => action.semanticTargetRef === 'TRANSFER_FIRST_CONFIRM'))
  assert.ok(plan.actions.some(action => action.semanticTargetRef === 'TRANSFER_RESULT_ID'))
})

test('I10 controlled transfer rejects prose-only business inputs', () => {
  assert.throws(() => compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: 'http://127.0.0.1:18082/portal/login',
    executionProfile: 'TRANSFER_UKEY_ORDER_QUERY',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    inputContractVersion: 'TypedBusinessInputsV2',
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '选择收款人并填写金额 1.00，用途为自动化回归测试', expected: '转账摘要显示', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['转账受理成功并显示单号']
  }, 'typed'.repeat(16)), /转账计划缺少payeeRef/)
})

test('controlled transfer rejects the old prose-only compatibility path', () => {
  assert.throws(() => compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1',
    caseId: 'case_12345678-1234-1234-1234-123456789abc',
    caseVersion: 1,
    route: 'http://127.0.0.1:18082/portal/login',
    executionProfile: 'TRANSFER_UKEY_ORDER_QUERY',
    adapterBinding: FUXING_BANK_DEMO_ADAPTER,
    steps: [
      { intentStepId: 'intent-login', action: '使用安全凭据登录', expected: '进入主页', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' },
      { intentStepId: 'intent-transfer', action: '填写转账信息', expected: '转账摘要显示', riskLevel: 'MEDIUM', inputValueSource: 'NONE' }
    ],
    assertions: ['转账受理成功并显示单号']
  }, 'b'.repeat(64)), /I10_TYPED_BUSINESS_INPUT_REQUIRED/)
})

test('a Fuxing-looking name and portal route without an adapter binding stays generic', () => {
  const snapshot = {
    targetProfileId: 'targetprofile_12345678-1234-1234-1234-123456789abc', version: 1, status: 'ACTIVE',
    profileHash: '6'.repeat(64), displayName: '复兴银行门户网站', launchUrl: 'http://127.0.0.1:28884/portal/login',
    allowedNavigationOrigins: ['http://127.0.0.1:28884'], allowedInteractionOrigins: ['http://127.0.0.1:28884'], credentialOrigins: ['http://127.0.0.1:28884'],
    adapterBinding: null
  }
  const plan = compileExecutableActionPlan({
    schemaVersion: 'i8-intent-plan-v1', caseId: 'case_12345678-1234-1234-1234-123456789abc', caseVersion: 1,
    route: snapshot.launchUrl, executionProfile: 'GENERIC_WEB', targetProfileId: snapshot.targetProfileId,
    targetProfileVersion: 1, targetProfileHash: snapshot.profileHash, targetProfileSnapshot: snapshot,
    steps: [{ intentStepId: 'intent-001', action: '打开门户并登录', expected: '登录成功', riskLevel: 'LOW', inputValueSource: 'CREDENTIAL_REF' }],
    assertions: ['主页可见']
  }, '7'.repeat(64))
  assert.equal(plan.fixtureProfile, 'GENERIC_WEB')
  assert.equal(plan.actions[0].routeRef, 'LAUNCH_URL')
})
