const test=require('node:test');
const assert=require('node:assert/strict');
const {compileExecutableActionPlan,buildDslDocument,generatedSource}=require('../../dist/harness/src/i8/script-package-builder.js');
const {FUXING_BANK_DEMO_ADAPTER}=require('../../dist/harness/src/i8/target-adapter-registry.js');
const {targetRuntimeAllowedOrigins}=require('../../worker/src/i10-worker-utils.cjs');
const {assertCredentialOrigin}=require('../../worker/src/adapters/fuxing-bank-demo/authentication.cjs');
test('operations compiler and worker bind the actual internal realm without becoming a customer template',()=>{
  const {FUXING_BANK_OPERATIONS_ADAPTER:binding}=require('../../dist/harness/src/i8/target-adapter-registry.js');
  const {authenticationForBinding}=require('../../worker/src/adapters/fuxing-bank-demo/authentication.cjs');
  const authentication=authenticationForBinding(binding);
  assert.equal(authentication.targets.LOGIN_SSO_SUBMIT.value,'ops-login-submit');
  assert.equal(authentication.issuerPath,'/realms/bank-internal');assert.equal(authentication.authenticatedPath,'/ops/dashboard');
  assert.equal(authenticationForBinding({...binding,manifestHash:'0'.repeat(64)}),undefined);
  const profile={targetProfileId:'targetprofile_12345678-1234-1234-1234-123456789abc',version:1,status:'ACTIVE',profileHash:'f'.repeat(64),
    launchUrl:authentication.portalOrigin+'/ops/login',allowedNavigationOrigins:[authentication.portalOrigin,authentication.identityOrigin],allowedInteractionOrigins:[authentication.portalOrigin,authentication.identityOrigin],credentialOrigins:[authentication.identityOrigin],adapterBinding:binding};
  const plan=compileExecutableActionPlan({schemaVersion:'i8-intent-plan-v1',caseId:'case_12345678-1234-1234-1234-123456789abc',caseVersion:1,
    route:profile.launchUrl,executionProfile:'GENERIC_WEB',targetProfileId:profile.targetProfileId,targetProfileVersion:profile.version,targetProfileHash:profile.profileHash,targetProfileSnapshot:profile,adapterBinding:binding,
    steps:[{intentStepId:'intent-login',action:'登录运营控制台',expected:'认证成功进入主页',riskLevel:'LOW',inputValueSource:'CREDENTIAL_REF'},
      {intentStepId:'intent-document',action:'验证文档状态',expected:'草稿',riskLevel:'LOW',inputValueSource:'NONE'}],assertions:['草稿']},'a'.repeat(64));
  assert.equal(plan.fixtureProfile,'GENERIC_WEB');assert.equal(plan.actions.filter(a=>a.routePatternRef==='IDENTITY_PROVIDER').length,1);
  const {canonicalJson,sha256}=require('../../dist/harness/src/utils.js');
  const records=plan.actions.map(a=>({schemaVersion:'hengzhun-verified-action-record-v2',executablePlanId:plan.executablePlanId,actionId:a.actionId,ordinal:a.ordinal,outcome:'VERIFIED_PASSED',
    locator:a.semanticTargetRef?{kind:'CSS',value:'#observed-'+a.ordinal}:undefined,pageSignatureHash:sha256(canonicalJson(a.pageSignature)),factsHash:'b'.repeat(64),verification:{dom:true,url:true,request:true,business:true},verifiedAt:new Date().toISOString()}));
  const built=buildDslDocument(plan,records);
  assert.deepEqual(JSON.parse(built.routes.IDENTITY_PROVIDER),{origin:authentication.identityOrigin,path:authentication.issuerPath});
  assert.deepEqual(JSON.parse(built.routes.PORTAL_AUTHENTICATED),{origin:authentication.portalOrigin,path:authentication.authenticatedPath});
  assert.deepEqual(JSON.parse(built.routes.CREDENTIAL_ORIGINS),[authentication.identityOrigin]);
});
const snapshot={targetProfileId:'targetprofile_12345678-1234-1234-1234-123456789abc',version:1,status:'ACTIVE',profileHash:'f'.repeat(64),displayName:'真实银行',launchUrl:'http://127.0.0.1:18082/portal/login',allowedNavigationOrigins:['http://127.0.0.1:18082','http://127.0.0.1:19000'],allowedInteractionOrigins:['http://127.0.0.1:18082','http://127.0.0.1:19000'],credentialOrigins:['http://127.0.0.1:19000'],adapterBinding:FUXING_BANK_DEMO_ADAPTER};
test('bank SSO is compiled before credential filling and preserves account navigation',()=>{
  const p=compileExecutableActionPlan({schemaVersion:'i8-intent-plan-v1',caseId:'case_12345678-1234-1234-1234-123456789abc',caseVersion:1,route:snapshot.launchUrl,executionProfile:'GENERIC_WEB',targetProfileId:snapshot.targetProfileId,targetProfileVersion:1,targetProfileHash:snapshot.profileHash,targetProfileSnapshot:snapshot,steps:[{intentStepId:'intent-001',action:'通过真实 Keycloak 统一身份认证使用安全凭据登录',expected:'认证成功',riskLevel:'LOW',inputValueSource:'CREDENTIAL_REF'},{intentStepId:'intent-002',action:'进入账户页面',expected:'账户页面可见',riskLevel:'LOW',inputValueSource:'NONE'}],assertions:['账户页面可见']},'1'.repeat(64));
  assert.deepEqual(p.actions.slice(0,7).map(x=>x.operation),['goto','click','waitForURL','fill','fill','click','waitForURL']);
  assert.equal(p.actions[2].routePatternRef,'IDENTITY_PROVIDER');
  assert.equal(p.actions[6].routePatternRef,'PORTAL_AUTHENTICATED');
  assert.equal(p.actions[7].instruction,'进入账户页面');
});

test('credential-bound 身份认证 expands to the registered SSO protocol without a 登录 keyword',()=>{
  const plan=compileExecutableActionPlan({schemaVersion:'i8-intent-plan-v1',caseId:'case_12345678-1234-1234-1234-123456789abc',caseVersion:1,
    route:snapshot.launchUrl,executionProfile:'GENERIC_WEB',targetProfileId:snapshot.targetProfileId,targetProfileVersion:1,targetProfileHash:snapshot.profileHash,targetProfileSnapshot:snapshot,
    steps:[{intentStepId:'intent-auth',action:'使用已登记安全凭据完成 Keycloak 统一身份认证并进入复兴银行客户门户。',expected:'认证完成并进入客户门户；不在输出中暴露任何凭据。',riskLevel:'LOW',inputValueSource:'CREDENTIAL_REF'},
      {intentStepId:'intent-accounts',action:'从门户导航打开账户列表页面。',expected:'账户列表可见',riskLevel:'LOW',inputValueSource:'NONE'}],assertions:['账户列表可见']},'2'.repeat(64));
  assert.deepEqual(plan.actions.slice(0,7).map(a=>a.operation),['goto','click','waitForURL','fill','fill','click','waitForURL']);
  assert.equal(plan.actions[6].routePatternRef,'PORTAL_AUTHENTICATED');
  assert.equal(plan.actions[7].sourceIntentStepId,'intent-accounts');
});
test('a frozen profile does not inherit undeclared identity origins',()=>{
  const p={...snapshot,allowedNavigationOrigins:['http://127.0.0.1:18082'],allowedInteractionOrigins:['http://127.0.0.1:18082'],credentialOrigins:['http://127.0.0.1:18082']};
  assert.equal(targetRuntimeAllowedOrigins(p,p.launchUrl).has('http://127.0.0.1:19000'),false);
});
test('navigation permission never grants credential input permission',()=>{
  assert.throws(()=>assertCredentialOrigin(snapshot,'http://127.0.0.1:18082/portal/login'),{code:'I10_CREDENTIAL_ORIGIN_NOT_ALLOWED'});
  assert.doesNotThrow(()=>assertCredentialOrigin(snapshot,'http://127.0.0.1:19000/realms/bank-customer/protocol/openid-connect/auth'));
});
test('controlled PKCE routes are valid without a generic launch URL',()=>{
  const p=compileExecutableActionPlan({schemaVersion:'i8-intent-plan-v1',caseId:'case_12345678-1234-1234-1234-123456789abc',caseVersion:1,executionProfile:'LOGIN_PROFILE',route:snapshot.launchUrl,targetProfileSnapshot:snapshot,adapterBinding:FUXING_BANK_DEMO_ADAPTER,steps:[{intentStepId:'intent-001',action:'登录',expected:'认证成功',riskLevel:'LOW',inputValueSource:'CREDENTIAL_REF'}],assertions:['认证成功']},'1'.repeat(64));
  const {FUXING_BANK_DEMO_TARGETS:TARGETS}=require('../../dist/harness/src/i8/adapters/fuxing-bank-demo.js');
  const {sha256,canonicalJson}=require('../../dist/harness/src/utils.js');
  const records=p.actions.map(a=>({schemaVersion:'hengzhun-verified-action-record-v2',executablePlanId:p.executablePlanId,actionId:a.actionId,ordinal:a.ordinal,outcome:'VERIFIED_PASSED',locator:a.semanticTargetRef?TARGETS[a.semanticTargetRef]:undefined,pageSignatureHash:sha256(canonicalJson(a.pageSignature)),factsHash:'e'.repeat(64),verification:{dom:true,url:true,request:true,business:true},verifiedAt:new Date().toISOString()}));
  const built=buildDslDocument(p,records);
  assert.equal(JSON.parse(built.routes.PORTAL_AUTHENTICATED).origin,'http://127.0.0.1:18082');
});
test('formal candidate refuses credential filling on a navigation-only origin',async()=>{
  const dsl={schemaVersion:'HENGZHUN_DSL_V2',steps:[{stepId:'dsl_01',operation:'fill',targetRef:'USERNAME',fixtureValueRef:'CREDENTIAL.USERNAME'}]};
  const source=generatedSource(dsl,{USERNAME:{kind:'CSS',value:'#username'}},{},{CREDENTIAL_ORIGINS:JSON.stringify(snapshot.credentialOrigins)});
  const module={exports:{}};new Function('module',source)(module);
  let filled=false;
  const page={url:()=>snapshot.launchUrl,locator:()=>({fill:async()=>{filled=true;}})};
  await assert.rejects(()=>module.exports.execute({page,baseUrl:snapshot.launchUrl,fixtures:{'CREDENTIAL.USERNAME':'synthetic'},capture:async()=>{}}),{code:'CANDIDATE_CREDENTIAL_ORIGIN_NOT_ALLOWED'});
  assert.equal(filled,false);
});

test('operations credentials cannot be filled into the customer realm or a lookalike realm',async()=>{
  const {FUXING_BANK_OPERATIONS_ADAPTER:binding}=require('../../dist/harness/src/i8/target-adapter-registry.js');
  const {authenticationForBinding,assertAuthenticationRealm}=require('../../worker/src/adapters/fuxing-bank-demo/authentication.cjs');
  const authentication=authenticationForBinding(binding);
  for(const realm of ['bank-customer','bank-internal-extra']){
    const url=`${authentication.identityOrigin}/realms/${realm}/protocol/openid-connect/auth`;
    assert.throws(()=>assertAuthenticationRealm(authentication,url),{code:'I10_BANK_AUTH_REALM_NOT_ALLOWED'});
    const source=generatedSource({steps:[{operation:'fill',targetRef:'USERNAME',fixtureValueRef:'CREDENTIAL.USERNAME'}]},
      {USERNAME:{kind:'CSS',value:'#username'}},{},{CREDENTIAL_ORIGINS:JSON.stringify([authentication.identityOrigin]),IDENTITY_PROVIDER:JSON.stringify({origin:authentication.identityOrigin,path:authentication.issuerPath})});
    const module={exports:{}};new Function('module',source)(module);let filled=false;
    await assert.rejects(module.exports.execute({page:{url:()=>url,locator:()=>({fill:async()=>{filled=true;}})},fixtures:{'CREDENTIAL.USERNAME':'test-only'}}),{code:'CANDIDATE_CREDENTIAL_REALM_NOT_ALLOWED'});
    assert.equal(filled,false);
  }
});
