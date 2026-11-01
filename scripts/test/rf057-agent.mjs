import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {assertAgentEvidence,assertAgentTransfer} from './rf057/agent-assertions.mjs';
import {requireCliSuccess,failureMetadata} from './rf057/agent-result.mjs';
import {cents} from './rf057/load.mjs';
import {registerBankCredential,prepareBankValidationPool} from './rf057/bank-validation-pool.mjs';
import evidence from './rf057/evidence.cjs';
import {executeControlledDocumentFailure} from './rf057/controlled-document-failure.mjs';
import {executeAgentCapacity} from './rf057/agent-capacity.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const product=path.join(root,'platform/hengzhun-regression-system');
const require=createRequire(import.meta.url);
const lifecycle=require(path.join(product,'scripts/i10-agent-lifecycle.cjs'));
const release=require(path.join(product,'scripts/i10-release-identity-v4.cjs'));
const environment=lifecycle.environmentWithRuntimeFile({root:product});
const identity=release.currentReleaseIdentityV4({productRoot:product,modelConfigIdentity:lifecycle.modelIdentityFromEnvironment(environment)});
const spec=JSON.parse(fs.readFileSync(path.join(product,'agent-cli/managed-process-spec-v1.json'),'utf8'));
const node=path.resolve(product,spec.interactive.executable),cli=path.resolve(product,spec.interactive.entrypoint);
const suiteFile=path.join(root,'scripts/test/rf057/suite.json');
const suiteHash=crypto.createHash('sha256').update(fs.readFileSync(suiteFile)).digest('hex');
const args=process.argv.slice(2);
const performanceOnly=args.includes('--performance');

function printGate(status,code){console.log(JSON.stringify({status,code,releaseIdentityHash:identity.identityHash,suiteSha256:suiteHash,executionPerformed:false}));}
if(args.includes('--preflight')) {
  const runtime=await lifecycle.managedStatus({root:product,identity});
  printGate(runtime.healthy?'RUNTIME_READY':'RUNTIME_NOT_RUNNING','LIVE_AUTHORIZATION_REQUIRED');
  process.exit(0);
}
try{lifecycle.authorizedIdentity({root:product,environment});}
catch(error){printGate('NOT_AUTHORIZED',error.code);process.exit(3);}
if(args.includes('--check-authority')){printGate('AUTHORIZED','EXACT_IDENTITY_MATCH');process.exit(0);}

const config=JSON.parse(await new Promise(resolve=>{let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>resolve(text.replace(/^\uFEFF/,'')));}));
const runId=crypto.randomUUID(),output=path.join(root,'agent/runs/rf057-agent',runId);
fs.mkdirSync(output,{recursive:true});
const report={schemaVersion:'bank-agent-acceptance-report/v1',suite:'BANK-AGENT-ACCEPTANCE-v1',suiteSha256:suiteHash,
  ...evidence.beginEvidence(config.cleanupId),
  runId,profile:performanceOnly?'PERFORMANCE':'LIVE_AGENT',releaseIdentityHash:identity.identityHash,startedAt:new Date().toISOString(),
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),cases:[],status:'RUNNING'};
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
const terminalProofs=[];
let phase='SERVICE_START';
function startPublicCli(arguments_) {
  let child;
  const result=new Promise((resolve,reject)=>{
    child=spawn(node,[cli,...arguments_],{cwd:product,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='';child.stdout.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);
    // CLI stderr may contain upstream diagnostics. Consume without publishing.
    child.stderr.resume();child.on('error',reject);
    child.on('close',code=>{try{
      const events=stdout.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>JSON.parse(s.replace(/^\uFEFF/,'')));
      const terminal=events.at(-1);resolve({code,terminal,events});
    }catch{reject(new Error('RF057_CLI_JSONL_INVALID'));}});
  });
  return {child,result};
}
async function publicCli(arguments_){return startPublicCli(arguments_).result;}
async function harness(route,body) {
  const response=await fetch(`http://127.0.0.1:18788${route}`,{method:'POST',headers:{authorization:`Bearer ${environment.HENGZHUN_SERVICE_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,`RF057_HARNESS_HTTP_${response.status}`);return response.json();
}
async function coreMoneySnapshot(){
  const observations={};
  for(const [side,id] of [['source',config.golden.sourceAccountId],['target',config.golden.targetAccountId]]){
    const response=await fetch(`${config.fineract}/api/v1/savingsaccounts/${id}?associations=transactions`,{
      headers:{authorization:'Basic '+Buffer.from(`${config.fineractUser}:${config.fineractPassword}`).toString('base64'),
        'Fineract-Platform-TenantId':config.fineractTenant},signal:AbortSignal.timeout(30000)});
    assert.ok(response.ok,`RF057_CORE_READ_HTTP_${response.status}`);
    const account=await response.json();
    observations[side]={balanceCents:cents(account.summary.accountBalance).toString(),
      transactionIds:(account.transactions??[]).map(t=>String(t.id)).sort()};
  }
  return observations;
}
async function createCredentialReference(identity=config.identities.customer,idempotencyKey=`rf057-${runId}`){
  return registerBankCredential(identity,idempotencyKey,harness);
}
async function refreshBankIdentity(who){
  const owner=config.identities[who];
  const claims=JSON.parse(Buffer.from(owner.token.split('.')[1],'base64url').toString());
  if(claims.exp*1000-Date.now()>30000)return;
  const response=await fetch(`${config.keycloak}/realms/${owner.realm}/protocol/openid-connect/token`,{
    method:'POST',body:new URLSearchParams({grant_type:'password',client_id:owner.client,client_secret:owner.clientSecret,
      username:owner.username,password:owner.password})});
  assert.ok(response.ok,'RF057_TOKEN_RENEWAL_FAILED');owner.token=(await response.json()).access_token;
}
async function readBank(route,who='customer'){
  await refreshBankIdentity(who);
  const response=await fetch(config.gateway+route,{headers:{authorization:`Bearer ${config.identities[who].token}`}});
  assert.ok(response.ok,`RF057_BANK_READ_HTTP_${response.status}`);return response.json();
}
async function runCase(id,fn){
  const start=performance.now();
  const evidenceClass=id==='P05'?'PERFORMANCE':'LIVE_AGENT';
  try{const assertions=await fn();report.cases.push({id,evidenceClass,status:'PASSED',durationMs:performance.now()-start,assertions});}
  catch(error){
    const failurePhase=phase;
    let financialFailure;
    if(id==='A02'){
      financialFailure={humanInterventionRequired:true,moneyResubmitted:false};
      try {financialFailure.coreReadback=await coreMoneySnapshot();}catch {financialFailure.coreReadbackStatus='FAILED';}
      try {
        const current=await readBank('/api/customer/v1/transfers');
        financialFailure.bankReadback=current.items.map(item=>({transferId:item.transferId,status:item.status,
          correlationId:item.correlationId,coreReference:item.coreReference}));
      }catch {financialFailure.bankReadbackStatus='FAILED';}
    }
    report.cases.push({id,evidenceClass,status:'FAILED',durationMs:performance.now()-start,
      ...failureMetadata(error,failurePhase),...(financialFailure?{financialFailure}:{})});
    report.status='FAILED';save();console.log(JSON.stringify({runId,caseId:id,status:'FAILED',...failureMetadata(error,failurePhase),
      ...(financialFailure?{humanInterventionRequired:true,moneyResubmitted:false}:{}),report:path.relative(root,path.join(output,'report.json'))}));throw error;
  }
  save();console.log(JSON.stringify({runId,caseId:id,status:'PASSED',durationMs:report.cases.at(-1).durationMs}));
}
try{
  // Only the lifecycle may remove an absent stale ownership record or start
  // owned services. Never stop healthy bank services after this test.
  const state=lifecycle.readManagedState(product);
  const runtime=await lifecycle.managedStatus({root:product,identity});
  if(!runtime.healthy&&state){
    assert.ok(runtime.services.every(s=>s.owned===false),'RF057_EXISTING_SERVICE_REQUIRES_OWNERSHIP_REVIEW');
    await lifecycle.stopManaged({root:product,environment});
  }
  await lifecycle.startManaged({root:product,environment});
  phase='DOCTOR';
  const doctor=requireCliSuccess(await publicCli(['doctor']),'DOCTOR');assert.equal(doctor.result.status,'READY');
  phase='CREDENTIAL_PREPARATION';
  const credentialRef=await createCredentialReference();
  await runCase('A01',async()=>{
    const goal=`目标系统：复兴银行客户门户。访问 http://127.0.0.1:18082/portal/login ，通过真实 Keycloak 统一身份认证登录，打开账户页面，确认账户卡片、人民币余额和账户状态正常显示。使用 ${credentialRef} 安全凭据，明确选择适配器 fuxing-bank-demo。只读测试，不发起转账，不访问历史受控门户。`;
    const inputFile=path.join(output,'a01-input.txt');fs.writeFileSync(inputFile,goal);
    phase='AUTHORING_EXECUTION';
    const value=requireCliSuccess(await publicCli(['run','--input-file',inputFile,'--jsonl']),phase);
    assert.equal(value.status,'COMPLETED');const journeyId=value.journeyId;
    phase='EVIDENCE_VERIFICATION';
    const verified=requireCliSuccess(await publicCli(['evidence','verify',journeyId,'--jsonl']),phase);
    const profile=await harness('/v1/i10/target-profiles:get',{namespace:'hengzhun-local',launchUrl:'http://127.0.0.1:18082/portal/login'});
    const proof=assertAgentEvidence(verified.result,{identity:identity.identityHash,journeyId,targetProfile:profile,expectedOrigin:'http://127.0.0.1:18082'});
    phase='QUALITY_READBACK';
    const response=await fetch('http://127.0.0.1:18788/api/quality/v1/runs');assert.ok(response.ok);const runs=await response.json();
    const projected=runs.find(x=>x.runId===proof.runId);assert.ok(projected);assert.equal(projected.journeyId,journeyId);assert.equal(projected.releaseIdentity,identity.identityHash);assert.equal(projected.status,'COMPLETED');
    terminalProofs.push({journeyId,sessionId:value.sessionId});
    return {journeyId,sessionId:value.sessionId,runId:proof.runId,taskId:proof.taskId,targetOrigin:'http://127.0.0.1:18082',artifacts:proof.artifacts,qualityReadback:true};
  });
  if(performanceOnly){
    await runCase('P05',()=>executeAgentCapacity({source:report.cases.find(item=>item.id==='A01').assertions,
      identity:identity.identityHash,cli:publicCli,harness,snapshot:coreMoneySnapshot,
      checkpoint:async facts=>{fs.writeFileSync(path.join(output,'p05-drained-tasks.json'),JSON.stringify(facts,null,2));}}));
  }else{
  await runCase('A02',async()=>{
    phase='FINANCIAL_POOL_PREPARATION';
    const before=await coreMoneySnapshot();
    const prior=await readBank('/api/customer/v1/transfers');
    assert.equal(prior.totalItems,0,'RF057_A02_OWNED_IDENTITY_ALREADY_USED');
    await refreshBankIdentity('operator');
    const pool=await prepareBankValidationPool({gateway:config.gateway,testToken:config.identities.operator.token,runId,
      identities:config.bankSampleIdentities,formalAccountIds:config.golden},{registerCredential:createCredentialReference});
    assert.deepEqual(await coreMoneySnapshot(),before,'RF057_A02_POOL_CHANGED_FORMAL_ACCOUNTS');
    const poolFile=path.join(output,'a02-bank-validation-fixtures.json');
    fs.writeFileSync(poolFile,JSON.stringify(pool,null,2),{flag:'wx'});
    const purpose=`RF057-A02-${runId}`,inputFile=path.join(output,'a02-input.txt');
    const goal=`目标系统：复兴银行客户门户。访问 http://127.0.0.1:18082/portal/login，通过真实Keycloak登录。使用 ${credentialRef} 安全凭据，明确选择适配器 fuxing-bank-demo。付款账户 ${config.golden.sourceAccountId}，收款人 ${config.beneficiaryRef}，转账 1.00 CNY，用途：${purpose}；提交后核验转账最终成功，付款与收款账户余额变化正确。异常先查询原结果，失败要求人工介入，不重复提交。`;
    fs.writeFileSync(inputFile,goal);
    phase='FINANCIAL_AUTHORING_EXECUTION';
    const value=requireCliSuccess(await publicCli(['run','--input-file',inputFile,'--bank-validation-fixtures',poolFile,'--jsonl']),phase);
    assert.equal(value.status,'COMPLETED');
    phase='FINANCIAL_EVIDENCE_VERIFICATION';
    const verified=requireCliSuccess(await publicCli(['evidence','verify',value.journeyId,'--jsonl']),phase);
    const profile=await harness('/v1/i10/target-profiles:get',{namespace:'hengzhun-local',launchUrl:'http://127.0.0.1:18082/portal/login'});
    const proof=assertAgentEvidence(verified.result,{identity:identity.identityHash,journeyId:value.journeyId,
      targetProfile:profile,expectedOrigin:'http://127.0.0.1:18082'});
    phase='FINANCIAL_BANK_READBACK';
    const orders=await readBank('/api/customer/v1/transfers');
    assert.equal(orders.totalItems,1,'RF057_A02_SINGLE_FORMAL_TRANSFER_REQUIRED');
    const order=orders.items[0];assert.ok(order?.transferId,'RF057_A02_FORMAL_TRANSFER_NOT_FOUND');
    const customer=await readBank(`/api/customer/v1/transfers/${order.transferId}`);
    const operations=await readBank(`/api/operations/v1/transfers/${order.transferId}`,'operator');
    const payment=await readBank(`/internal/test-support/v1/assertions/payments/${order.transferId}`,'operator');
    const projection=await readBank(`/internal/test-support/v1/assertions/accounting-projection/${customer.correlationId}`,'operator');
    const after=await coreMoneySnapshot();
    const money=assertAgentTransfer({before,after,customer,operations,payment,projection},
      {...config.golden,beneficiaryRef:config.beneficiaryRef,purpose});
    terminalProofs.push({journeyId:value.journeyId,sessionId:value.sessionId});
    return {journeyId:value.journeyId,sessionId:value.sessionId,runId:proof.runId,taskId:proof.taskId,
      artifacts:proof.artifacts,financialPoolFile:path.relative(root,poolFile).replaceAll('\\','/'),...money};
  });
  await runCase('A03',async()=>{
    phase='ACTUAL_PAGE_IMAGE_CAPTURE';
    const runtimeRoot=path.join(product,'runtime');
    const runtimeRequire=createRequire(path.join(runtimeRoot,'package.json'));
    const {chromium}=runtimeRequire('playwright');
    const freeze=JSON.parse(fs.readFileSync(path.join(product,'config/demo-runtime-freeze.json'),'utf8'));
    const browser=await chromium.launch({executablePath:path.join(runtimeRoot,freeze.chromium.executable),headless:true});
    const screenshot=path.join(output,'a03-real-login.png');
    try{
      const page=await browser.newPage();
      await page.goto('http://127.0.0.1:18082/portal/login');
      await page.getByTestId('login-sso-submit').waitFor({state:'visible'});
      await page.screenshot({path:screenshot});
    }finally{await browser.close();}
    const inputFile=path.join(output,'a03-input.txt');
    fs.writeFileSync(inputFile,`目标系统：复兴银行客户门户。附件是刚从 http://127.0.0.1:18082/portal/login 捕获的真实登录页面，请结合图片识别统一认证入口，通过真实Keycloak登录，打开账户页面，核验账户卡片、人民币余额与账户状态。使用 ${credentialRef} 安全凭据，明确选择适配器 fuxing-bank-demo。只读，不发起资金动作。`);
    phase='IMAGE_AUTHORING_EXECUTION';
    const invocation=await publicCli(['run','--input-file',inputFile,'--attach',screenshot,'--jsonl']);
    const value=requireCliSuccess(invocation,phase);assert.equal(value.status,'COMPLETED');
    const imported=invocation.events.find(event=>event.type==='ATTACHMENT_IMPORTED');
    const bytes=fs.readFileSync(screenshot);
    assert.ok(imported?.attachmentRef);assert.equal(imported.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(imported.size,bytes.length);
    phase='IMAGE_EVIDENCE_VERIFICATION';
    const verified=requireCliSuccess(await publicCli(['evidence','verify',value.journeyId,'--jsonl']),phase);
    const profile=await harness('/v1/i10/target-profiles:get',{namespace:'hengzhun-local',launchUrl:'http://127.0.0.1:18082/portal/login'});
    const proof=assertAgentEvidence(verified.result,{identity:identity.identityHash,journeyId:value.journeyId,targetProfile:profile,expectedOrigin:'http://127.0.0.1:18082'});
    terminalProofs.push({journeyId:value.journeyId,sessionId:value.sessionId});
    return {journeyId:value.journeyId,sessionId:value.sessionId,runId:proof.runId,taskId:proof.taskId,
      attachmentRef:imported.attachmentRef,imageSha256:imported.sha256,imageSize:imported.size,
      imageOrigin:'http://127.0.0.1:18082',artifacts:proof.artifacts};
  });
  await runCase('A04',async()=>{
    const before=await coreMoneySnapshot();
    const goal=`目标系统：复兴银行客户门户。访问 http://127.0.0.1:18082/portal/login ，使用 ${credentialRef} 安全凭据，明确选择适配器 fuxing-bank-demo。发起转账并核验成功；收款人和金额尚未提供，请先明确缺失输入，不得提交资金动作。`;
    const inputFile=path.join(output,'a04-input.txt');fs.writeFileSync(inputFile,goal);
    phase='MISSING_INPUT_AUTHORING';
    const value=requireCliSuccess(await publicCli(['run','--input-file',inputFile,'--jsonl']),phase);
    assert.equal(value.type,'CLARIFICATION_REQUIRED','RF057_A04_CLARIFICATION_REQUIRED');
    phase='MISSING_INPUT_LEDGER_VERIFICATION';
    const proof=await harness('/v1/releases:verify',{caseId:'A04',journeyId:value.journeyId});
    assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.runStatus,'NEEDS_INPUT');
    assert.equal(proof.releaseIdentityHash,identity.identityHash);assert.equal(proof.executionCount,0);
    assert.ok(['payeeRef','amount'].every(field=>proof.blockedFields.includes(field)));
    const after=await coreMoneySnapshot();assert.deepEqual(after,before,'RF057_A04_MONEY_ACTION_OBSERVED');
    return {journeyId:value.journeyId,sessionId:value.sessionId,blockedFields:proof.blockedFields,
      executionCount:0,noMoneyMovement:true,coreObservations:{before,after}};
  });
  await runCase('A05',async()=>{
    const before=await coreMoneySnapshot();
    phase='RESUME_SESSION_START';
    const session=requireCliSuccess(await publicCli(['session','start']),phase).result;
    assert.ok(session.sessionId);
    const inputFile=path.join(output,'a05-input.txt');
    fs.writeFileSync(inputFile,'登录复兴银行客户门户，打开账户页面，核验账户卡片、人民币余额和状态显示正常。只读，不转账。');
    phase='RESUME_AUTHORING';
    const authored=await publicCli(['journey','author',session.sessionId,'--input-file',inputFile,
      '--entry-url','http://127.0.0.1:18082/portal/login','--target-system','复兴银行客户门户',
      '--credential-ref',credentialRef,'--adapter','fuxing-bank-demo','--jsonl']);
    assert.equal(authored.code,20);const candidate=authored.terminal.result;
    assert.equal(candidate.status,'AWAITING_USER');
    requireCliSuccess(await publicCli(['journey','approve',candidate.journeyId,'--session',session.sessionId,
      '--revision',String(candidate.revision),'--proposal',candidate.proposalId,'--content-hash',candidate.contentHash,'--jsonl']),phase);
    phase='FORMAL_RUN_INTERRUPTION';
    const executionArgs=['journey','execute',candidate.journeyId,'--session',session.sessionId,'--jsonl'];
    const execution=startPublicCli(executionArgs);
    // Consume the result immediately, including early process errors, while observing the authoritative Journey.
    const settled=execution.result.then(value=>({value}),error=>({error}));
    let linked;
    let interruption;
    const deadline=Date.now()+600000;
    try{
    while(Date.now()<deadline){
      assert.equal(execution.child.exitCode,null,'RF057_A05_CLI_FINISHED_BEFORE_INTERRUPTION');
      assert.equal(execution.child.signalCode,null,'RF057_A05_CLI_FINISHED_BEFORE_INTERRUPTION');
      const journey=await harness('/v1/i10/journeys:get',{namespace:'hengzhun-local',journeyId:candidate.journeyId,waitSeconds:0});
      if(journey.stage==='RUNNING'&&journey.references?.runId&&journey.references?.taskId){
        const task=await harness('/v1/i8/tasks:get',{namespace:'hengzhun-local',taskId:journey.references.taskId});
        assert.ok(['QUEUED','RUNNING'].includes(task.status),'RF057_A05_TASK_FINISHED_BEFORE_INTERRUPTION');
        linked=journey.references;
        interruption={schemaVersion:'rf057-cli-interruption/v1',releaseIdentityHash:identity.identityHash,
          journeyId:candidate.journeyId,sessionId:session.sessionId,runId:linked.runId,taskId:linked.taskId,
          cliPid:execution.child.pid,journeyStage:journey.stage,taskStatus:task.status,observedAt:new Date().toISOString()};
        break;
      }
      assert.notEqual(journey.status,'FAILED','RF057_A05_AUTHORING_FAILED');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!linked){
      if(execution.child.exitCode===null)execution.child.kill();
      await settled;
      throw new Error('RF057_A05_FORMAL_RUN_NOT_LINKED');
    }
    assert.equal(execution.child.exitCode,null,'RF057_A05_CLI_FINISHED_BEFORE_INTERRUPTION');
    assert.equal(execution.child.kill(),true,'RF057_A05_OWNED_CLI_STOP_FAILED');
    await settled;
    assert.ok(execution.child.exitCode!==null||execution.child.signalCode!==null,'RF057_A05_CLI_STILL_RUNNING');
    interruption.interruptedAt=new Date().toISOString();
    }finally{
      if(execution.child.exitCode===null&&execution.child.signalCode===null)execution.child.kill();
      await settled;
    }
    phase='FORMAL_RUN_RECOVERY';
    const resumedSession=requireCliSuccess(await publicCli(['session','resume',session.sessionId]),phase).result;
    assert.equal(resumedSession.journeyId,candidate.journeyId);
    const resumed=requireCliSuccess(await publicCli(executionArgs),phase).result;
    assert.equal(resumed.runId,linked.runId);assert.equal(resumed.taskId,linked.taskId);
    assert.equal(resumed.status,'PASSED');
    const proof=await harness('/v1/releases:verify',{caseId:'A05',journeyId:candidate.journeyId});
    assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.runId,linked.runId);assert.equal(proof.taskId,linked.taskId);
    assert.equal(proof.releaseIdentityHash,identity.identityHash);
    interruption.recoveredAt=new Date().toISOString();
    interruption.recoveredRunId=proof.runId;interruption.recoveredTaskId=proof.taskId;
    const witnessFile=path.join(output,'a05-process-interruption.json');
    fs.writeFileSync(witnessFile,JSON.stringify(interruption,null,2));
    const after=await coreMoneySnapshot();assert.deepEqual(after,before,'RF057_A05_MONEY_ACTION_OBSERVED');
    return {journeyId:candidate.journeyId,sessionId:session.sessionId,runId:proof.runId,taskId:proof.taskId,
      processInterrupted:true,sameRun:true,sameTask:true,interruptionEvidence:path.relative(root,witnessFile).replaceAll('\\','/'),
      noMoneyMovement:true,coreObservations:{before,after},artifacts:proof.artifacts};
  });
  assert.equal(release.currentReleaseIdentityV4({productRoot:product,modelConfigIdentity:lifecycle.modelIdentityFromEnvironment(environment)}).identityHash,identity.identityHash,'RF057_SOURCE_CHANGED_DURING_AGENT_TEST');
  await runCase('A06',async()=>{
    const source=report.cases.find(item=>item.id==='A01').assertions;
    const before=await coreMoneySnapshot();
    phase='REPEAT_SESSION_START';
    const session=requireCliSuccess(await publicCli(['session','start']),phase).result;
    phase='FROZEN_SCRIPT_REPEAT';
    const value=requireCliSuccess(await publicCli(['journey','execute',source.journeyId,'--session',session.sessionId,'--repeat','--jsonl']),phase).result;
    assert.equal(value.status,'PASSED');assert.notEqual(value.journeyId,source.journeyId);
    assert.notEqual(value.runId,source.runId);assert.notEqual(value.taskId,source.taskId);
    phase='REPEAT_LEDGER_VERIFICATION';
    const proof=await harness('/v1/releases:verify',{caseId:'A06',journeyId:value.journeyId});
    assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.releaseIdentityHash,identity.identityHash);
    assert.equal(proof.sourceJourneyId,source.journeyId);assert.equal(proof.sourceRunId,source.runId);
    assert.equal(proof.runId,value.runId);assert.equal(proof.taskId,value.taskId);assert.equal(proof.sameFrozenScript,true);
    const after=await coreMoneySnapshot();assert.deepEqual(after,before,'RF057_A06_MONEY_ACTION_OBSERVED');
    return {journeyId:value.journeyId,sessionId:session.sessionId,runId:proof.runId,taskId:proof.taskId,
      sourceJourneyId:source.journeyId,sourceRunId:source.runId,candidateId:proof.candidateId,scriptHash:proof.scriptHash,
      sameFrozenScript:true,noMoneyMovement:true,coreObservations:{before,after},artifacts:proof.artifacts};
  });
  assert.equal(release.currentReleaseIdentityV4({productRoot:product,modelConfigIdentity:lifecycle.modelIdentityFromEnvironment(environment)}).identityHash,identity.identityHash,'RF057_SOURCE_CHANGED_DURING_AGENT_TEST');
  await runCase('A07',async()=>{
    const before=await coreMoneySnapshot();
    phase='CONTROLLED_FAILURE_CREDENTIAL';
    const operatorCredential=await createCredentialReference(config.identities.accountant,`rf057-a07-${runId}`);
    const facts=await executeControlledDocumentFailure({runId,identity:identity.identityHash,credentialRef:operatorCredential,
      cli:publicCli,harness,phase:value=>{phase=value;},
      writeInput:goal=>{const file=path.join(output,'a07-input.txt');fs.writeFileSync(file,goal);return file;},
      bank:async(route,options={})=>{
        await refreshBankIdentity('accountant');
        const headers={authorization:`Bearer ${config.identities.accountant.token}`};
        const json=options.body&&!(options.body instanceof FormData);
        if(json)headers['content-type']='application/json';
        const response=await fetch(config.gateway+route,{...options,headers,body:json?JSON.stringify(options.body):options.body});
        assert.ok(response.ok,`RF057_A07_BANK_HTTP_${response.status}`);return response.json();
      },
      quality:async proof=>{
        const response=await fetch('http://127.0.0.1:18788/api/quality/v1/runs');assert.ok(response.ok);
        const row=(await response.json()).find(item=>item.runId===proof.runId);
        assert.ok(row);assert.equal(row.journeyId,proof.journeyId);assert.equal(row.releaseIdentity,identity.identityHash);assert.equal(row.status,'FAILED');
      }});
    const after=await coreMoneySnapshot();assert.deepEqual(after,before,'RF057_A07_MONEY_ACTION_OBSERVED');
    return {...facts,noMoneyMovement:true,coreObservations:{before,after}};
  });
  assert.equal(release.currentReleaseIdentityV4({productRoot:product,modelConfigIdentity:lifecycle.modelIdentityFromEnvironment(environment)}).identityHash,identity.identityHash,'RF057_SOURCE_CHANGED_DURING_AGENT_TEST');
  }
  assert.deepEqual(report.cases.map(item=>item.id),performanceOnly?['A01','P05']:['A01','A02','A03','A04','A05','A06','A07']);
  report.status='PARTIAL';evidence.finishEvidence(report,output);console.log(JSON.stringify({runId,status:report.status,passed:report.cases.length,report:path.relative(root,path.join(output,'report.json')),remainingAgentCases:performanceOnly?['A02','A03','A04','A05','A06','A07']:[]}));
}catch(error){
  if(report.status==='RUNNING'){
    report.status='FAILED';report.failure=failureMetadata(error,phase);save();
    console.log(JSON.stringify({runId,status:'FAILED',...report.failure,report:path.relative(root,path.join(output,'report.json'))}));
  }
  try { evidence.finishEvidence(report,output); }
  finally { process.exitCode=4; }
}
