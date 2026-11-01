import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {cents,runLoad,summarize} from './load.mjs';
import evidence from './evidence.cjs';

const root=path.resolve(import.meta.dirname,'../../..');
const config=JSON.parse(await new Promise(resolve=>{let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>resolve(input.replace(/^\uFEFF/,'')));}));
const runId=crypto.randomUUID();
const output=path.join(root,'agent/runs/rf057',runId);
fs.mkdirSync(output,{recursive:true});
const report={schemaVersion:'bank-agent-acceptance-report/v1',suite:'BANK-AGENT-ACCEPTANCE-v1',runId,
  ...evidence.beginEvidence(config.cleanupId),
  profile:config.profile,startedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceDirty:true,contractHashes:config.contractHashes,environment:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,cpuCount:os.cpus().length,memoryBytes:os.totalmem(),node:process.version},
  fixturePolicy:'Existing synthetic alice/bob core accounts; serial exclusive suite, no reset or history deletion',cases:[],status:'RUNNING'};
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
const headers=who=>({authorization:`Bearer ${config.identities[who].token}`});
const refreshes=new Map();
async function refreshIdentity(who){
  const identity=config.identities[who];
  const claims=JSON.parse(Buffer.from(identity.token.split('.')[1],'base64url').toString());
  if(claims.exp*1000-Date.now()>30000)return;
  if(!refreshes.has(who))refreshes.set(who,(async()=>{
    const response=await fetch(`${config.keycloak}/realms/${identity.realm}/protocol/openid-connect/token`,{
      method:'POST',body:new URLSearchParams({grant_type:'password',client_id:identity.client,client_secret:identity.clientSecret,username:identity.username,password:identity.password}),signal:AbortSignal.timeout(10000)});
    assert.ok(response.ok,'RF057_TOKEN_RENEWAL_FAILED');identity.token=(await response.json()).access_token;
  })().finally(()=>refreshes.delete(who)));
  await refreshes.get(who);
}
async function http(route,{who='customer',method='GET',body,extra={},raw=false,base=config.gateway,timeoutMs=30000}={}) {
  await refreshIdentity(who);
  const response=await fetch(base+route,{method,headers:{...headers(who),...(body instanceof FormData?{}:body?{'content-type':'application/json'}:{}),...extra},
    ...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});
  const text=await response.text();
  return {status:response.status,ok:response.ok,body:raw?text:text?JSON.parse(text):null};
}
async function success(route,options) {const r=await http(route,options);assert.ok(r.ok,`HTTP_${r.status}:${route}`);return r.body;}
async function bankCase(id,title,fn,evidenceClass='LIVE_BANK') {
  const started=performance.now();
  try {const assertions=await fn();report.cases.push({id,title,evidenceClass,status:'PASSED',durationMs:performance.now()-started,assertions});}
  catch(error){report.cases.push({id,title,evidenceClass,status:'FAILED',durationMs:performance.now()-started,errorCode:error.code||error.name,message:String(error.message).slice(0,350)});report.status='FAILED';save();console.log(JSON.stringify({runId,caseId:id,status:'FAILED',message:report.cases.at(-1).message,report:path.relative(root,path.join(output,'report.json'))}));throw error;}
  save();console.log(JSON.stringify({runId,caseId:id,status:'PASSED',durationMs:report.cases.at(-1).durationMs}));
}
const accountId=config.golden.sourceAccountId,targetId=config.golden.targetAccountId;
async function coreAccount(id){return success(`/api/v1/savingsaccounts/${id}`,{base:config.fineract,extra:{authorization:'Basic '+Buffer.from(`${config.fineractUser}:${config.fineractPassword}`).toString('base64'),'Fineract-Platform-TenantId':config.fineractTenant}});}
async function balances(){const a=await coreAccount(accountId),b=await coreAccount(targetId);return {source:cents(a.summary.accountBalance),target:cents(b.summary.accountBalance)};}
function moneyObservations(before,after){return {
  before:{source:before.source.toString(),target:before.target.toString()},
  after:{source:after.source.toString(),target:after.target.toString()}};}
let beneficiary,settled,notificationCount;
const transferBody=(amount='1.00')=>({sourceAccountId:accountId,beneficiaryId:beneficiary.beneficiaryId,amount,currency:'CNY',reference:'RF057 synthetic transfer'});
const transferHeaders=key=>({'Idempotency-Key':key,'X-Correlation-Id':key});
async function createTransfer(key,body=transferBody()){return success('/api/customer/v1/transfers',{method:'POST',body,extra:transferHeaders(key)});}
async function confirm(id){return success(`/api/customer/v1/transfers/${id}/confirm`,{method:'POST'});}
async function settlementAssertions(transfer,key) {
  const customer=await success(`/api/customer/v1/transfers/${transfer.transferId}`);
  const operations=await success(`/api/operations/v1/transfers/${transfer.transferId}`,{who:'operator'});
  assert.equal(customer.status,'SETTLED');assert.equal(operations.status,'SETTLED');
  assert.equal(customer.correlationId,key);assert.equal(operations.correlationId,key);assert.ok(operations.coreReference);
  const ledger=await success(`/internal/test-support/v1/assertions/accounting-projection/${key}`,{who:'operator'});
  assert.equal(ledger.projectionBalanced,true);assert.equal(ledger.projectionEntryCount,2);
  return {transferId:transfer.transferId,correlationId:key,fineractTransactionId:String(operations.coreReference),balanced:true};
}
async function reconciliation(){const runs=[];for(const type of ['CHANNEL_TO_CORE','CHANNEL_TO_CLEARING','CORE_TO_GENERAL_LEDGER']){
  const result=await success(`/internal/reconciliation/run?type=${type}`,{method:'POST',who:'accountant'});
  assert.equal(result.status,'MATCHED');assert.equal(result.differenceCount,0);
  const list=await success('/api/operations/v1/reconciliations',{who:'accountant'});
  assert.ok(list.some(x=>x.runId===result.runId&&x.status==='MATCHED'));runs.push({type,runId:result.runId});
}return runs;}

try {
  await bankCase('B04','Golden transfer through real Fineract',async()=>config.golden);
  await bankCase('B03','Account balance matches Fineract and other account is hidden',async()=>{
    const account=await success(`/api/customer/v1/accounts/${accountId}`),core=await coreAccount(accountId);
    assert.equal(cents(account.balance),cents(core.summary.accountBalance));assert.equal(account.currency,'CNY');
    assert.equal((await http(`/api/customer/v1/accounts/${targetId}`)).status,404);
    return {accountId,balanceMatches:true,otherAccountStatus:404};
  });
  await bankCase('B10','Beneficiary duplicate registration gives one object',async()=>{
    const target=await coreAccount(targetId);const body={accountNumber:target.accountNo,displayName:'RF057 Synthetic Receiver'};
    beneficiary=await success('/api/customer/v1/beneficiaries',{method:'POST',body});
    const repeated=await success('/api/customer/v1/beneficiaries',{method:'POST',body});assert.equal(repeated.beneficiaryId,beneficiary.beneficiaryId);
    const list=await success('/api/customer/v1/beneficiaries');assert.equal(list.items.filter(x=>x.beneficiaryId===beneficiary.beneficiaryId).length,1);
    return {beneficiaryId:beneficiary.beneficiaryId,unique:true};
  });
  await bankCase('B05','Repeat submission and lost-response replay do not repost',async()=>{
    notificationCount=(await success('/api/customer/v1/notifications')).items.length;
    const before=await balances(),key=`rf057-${runId}-repeat`;const first=await createTransfer(key);
    const replay=await createTransfer(key);assert.equal(first.transferId,replay.transferId);
    settled=await confirm(first.transferId);assert.equal(settled.status,'SETTLED');
    await createTransfer(key);const again=await confirm(first.transferId);assert.equal(again.status,'SETTLED');
    const after=await balances();assert.equal(before.source-after.source,100n);assert.equal(after.target-before.target,100n);
    assert.equal(before.source+before.target,after.source+after.target);
    return {...await settlementAssertions(first,key),deltaCents:'100',replaySameTransfer:true,balances:moneyObservations(before,after)};
  });
  await bankCase('B06','Same key with changed amount conflicts without money movement',async()=>{
    const before=await balances(),key=`rf057-${runId}-repeat`;
    assert.equal((await http('/api/customer/v1/transfers',{method:'POST',body:transferBody('2.00'),extra:transferHeaders(key)})).status,409);
    const after=await balances();assert.deepEqual(after,before);return {conflict:409,noMoneyMovement:true,balances:moneyObservations(before,after)};
  });
  await bankCase('B08','Foreign source and customer operations access rejected',async()=>{
    const before=await balances();assert.equal((await http('/api/customer/v1/transfers',{method:'POST',body:{...transferBody(),sourceAccountId:targetId},extra:transferHeaders(`rf057-${runId}-foreign`)})).status,403);
    assert.equal((await http('/api/operations/v1/transfers')).status,403);const after=await balances();assert.deepEqual(after,before);
    return {sourceOwnership:403,operationsAccess:403,noMoneyMovement:true,balances:moneyObservations(before,after)};
  });
  await bankCase('B07','Insufficient funds fails without debit or credit',async()=>{
    const before=await balances();const over=(before.source/100n+1000n).toString()+'.00';
    const created=await createTransfer(`rf057-${runId}-insufficient`,transferBody(over));
    const result=await confirm(created.transferId);assert.equal(result.status,'FAILED');const after=await balances();assert.deepEqual(after,before);
    return {status:'FAILED',noMoneyMovement:true,balances:moneyObservations(before,after)};
  });
  await bankCase('B09','Settled transfer generates subject-scoped notification',async()=>{
    const messages=await success('/api/customer/v1/notifications');assert.equal(messages.items.length-notificationCount,1);
    const message=messages.items[0];const read=await success(`/api/customer/v1/notifications/${message.messageId}/read`,{method:'POST'});
    assert.equal(read.read,true);assert.equal((await success('/api/customer/v1/notifications')).items.find(x=>x.messageId===message.messageId).read,true);
    return {notificationId:message.messageId,readPersisted:true};
  });
  await bankCase('B12','Operations document concurrent publication and archive',async()=>{
    const content=`RF057 synthetic policy ${runId}`;const form=new FormData();form.set('file',new Blob([content],{type:'text/plain'}),'rf057.txt');form.set('title',`RF057 ${runId}`);form.set('category','POLICY');
    const doc=await success('/api/operations/v1/documents',{who:'accountant',method:'POST',body:form});assert.equal(doc.status,'DRAFT');
    const change=()=>http(`/api/operations/v1/documents/${doc.documentId}/status`,{who:'accountant',method:'PATCH',body:{status:'PUBLISHED',version:doc.version}});
    const results=await Promise.all(Array.from({length:20},change));assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.status===409).length,19);
    const published=results.find(x=>x.ok).body;assert.equal(published.version,2);
    const missing=await http(`/api/operations/v1/documents/${doc.documentId}/status`,{who:'accountant',method:'PATCH',body:{status:'ARCHIVED'}});assert.equal(missing.status,400);
    const archived=await success(`/api/operations/v1/documents/${doc.documentId}/status`,{who:'accountant',method:'PATCH',body:{status:'ARCHIVED',version:published.version}});assert.equal(archived.version,3);
    assert.equal((await http(`/api/operations/v1/documents/${doc.documentId}/download`,{who:'accountant',raw:true})).body,content);
    return {documentId:doc.documentId,winners:1,conflicts:19,status:'ARCHIVED',downloadMatches:true};
  });
  await bankCase('B13','Three real reconciliation types match',reconciliation);
  await bankCase('B11','Loan materials independent checker and real core submission',async()=>{
    const draft=await success('/api/customer/v1/loans/applications',{method:'POST',body:{amount:'1000.00',termMonths:12,purpose:'RF057 synthetic education',repaymentMethod:'EQUAL_INSTALLMENTS',note:'Synthetic test'}});
    const id=draft.applicationId;
    const document=await success(`/api/customer/v1/loans/applications/${id}/documents`,{method:'POST',body:{documentType:'ID_CARD'}});
    assert.equal(document.status,'RECEIVED');
    const submitted=await success(`/api/customer/v1/loans/applications/${id}/submit`,{method:'POST',body:{version:draft.version}});
    const scored=await success(`/api/operations/v1/loans/applications/${id}/score`,{who:'maker',method:'POST',body:{version:submitted.version}});
    const approval=await success(`/api/operations/v1/loans/applications/${id}/approval`,{who:'maker',method:'POST',body:{version:scored.version,reason:'Synthetic complete materials'}});
    const decision={version:approval.version,approvedAmount:'1000.00',annualInterestRate:'4.35',reason:'Independent RF057 review'};
    assert.equal((await http(`/api/operations/v1/loans/approvals/${approval.approvalId}/approve`,{who:'maker',method:'POST',body:decision})).status,409);
    const approved=await success(`/api/operations/v1/loans/approvals/${approval.approvalId}/approve`,{who:'checker',method:'POST',body:decision});assert.equal(approved.status,'APPROVED');
    const key=`rf057-${runId}-loan`;
    const core=await success(`/api/operations/v1/loans/applications/${id}/core-submit`,{who:'maker',method:'POST',extra:{'Idempotency-Key':key}});
    const replay=await success(`/api/operations/v1/loans/applications/${id}/core-submit`,{who:'maker',method:'POST',extra:{'Idempotency-Key':key}});assert.equal(replay.coreLoanId,core.coreLoanId);
    assert.equal((await http(`/api/operations/v1/loans/applications/${id}/core-submit`,{who:'maker',method:'POST',extra:{'Idempotency-Key':`${key}-different`}})).status,409);
    const detail=await success(`/api/v1/loans/${core.coreLoanId}`,{base:config.fineract,extra:{authorization:'Basic '+Buffer.from(`${config.fineractUser}:${config.fineractPassword}`).toString('base64'),'Fineract-Platform-TenantId':config.fineractTenant}});
    assert.equal(cents(detail.principal),100000n);
    // Test-only preparation of this newly created synthetic loan uses the core API.
    // Customer repayment/close operations below still use Gateway -> Channel -> Fineract.
    const coreOptions={base:config.fineract,extra:{authorization:'Basic '+Buffer.from(`${config.fineractUser}:${config.fineractPassword}`).toString('base64'),'Fineract-Platform-TenantId':config.fineractTenant}};
    const postingDate=detail.timeline.expectedDisbursementDate.map((n,i)=>String(n).padStart(i===0?4:2,'0')).join('-');
    await success(`/api/v1/loans/${core.coreLoanId}?command=approve`,{...coreOptions,method:'POST',body:{approvedOnDate:postingDate,dateFormat:'yyyy-MM-dd',locale:'en'}});
    await success(`/api/v1/loans/${core.coreLoanId}?command=disburse`,{...coreOptions,method:'POST',body:{actualDisbursementDate:postingDate,dateFormat:'yyyy-MM-dd',locale:'en'}});
    const repaymentRoute=`/api/customer/v1/loans/applications/${id}/repayment`;
    const repaymentOptions={method:'POST',body:{transactionAmount:'1.00'},extra:{'Idempotency-Key':`${key}-repayment`}};
    const paid=await success(repaymentRoute,repaymentOptions);
    assert.deepEqual(await success(repaymentRoute,repaymentOptions),paid);
    assert.equal((await http(repaymentRoute,{...repaymentOptions,body:{transactionAmount:'2.00'}})).status,409);
    const repaid=await success(`/api/v1/loans/${core.coreLoanId}?associations=transactions`,coreOptions);
    const payments=repaid.transactions.filter(x=>x.type.repayment&&!x.manuallyReversed);
    assert.equal(payments.length,1);assert.equal(cents(payments[0].amount),100n);
    assert.equal((await http(`/api/customer/v1/loans/applications/${id}/close`,{method:'POST',extra:{'Idempotency-Key':`${key}-premature-close`}})).status,409);
    return {applicationId:id,coreLoanId:core.coreLoanId,selfApproval:409,independentApproval:true,principalCents:'100000',idempotent:true,
      repaymentTransactionId:payments[0].id,repaymentCount:1,changedRepayment:409,prematureClose:409};
  });
  const runtime=path.join(root,'platform/hengzhun-regression-system/runtime');
  const require=createRequire(path.join(runtime,'package.json'));
  const {chromium}=require('playwright');
  const freeze=JSON.parse(fs.readFileSync(path.join(root,'platform/hengzhun-regression-system/config/demo-runtime-freeze.json'),'utf8'));
  const browser=await chromium.launch({executablePath:path.join(runtime,freeze.chromium.executable),headless:true});
  let customerContext,customerPage;
  const portalSessions=[];
  try {
    await bankCase('B01','Both portals real PKCE login and refresh',async()=>{
      const observations=[];
      for(const [who,origin,button,ready] of [
        ['customer','http://127.0.0.1:18082/portal','login-sso-submit','[data-page-id="customer.dashboard"][data-page-state="READY"]'],
        ['operator','http://127.0.0.1:18083/ops','ops-login-submit','[data-page-id="operations.dashboard"][data-view-state="READY"]']]) {
        const context=await browser.newContext();const page=await context.newPage();
        await page.goto(`${origin}/login`);await page.getByTestId(button).click();
        await page.locator('#username').fill(config.identities[who].username);await page.locator('#password').fill(config.identities[who].password);
        const response=page.waitForResponse(r=>r.url().includes('/protocol/openid-connect/token'));
        await page.locator('#kc-login').click();const token=await (await response).json();
        const claims=JSON.parse(Buffer.from(token.access_token.split('.')[1],'base64url').toString());
        assert.ok([claims.aud].flat().includes('bank-channel-service'));assert.equal(claims.azp,who==='customer'?'customer-portal':'operations-console');
        await page.locator(ready).waitFor({timeout:20000});
        const begin=performance.now();await page.reload();await page.locator(ready).waitFor({timeout:20000});
        observations.push({who,refreshMs:performance.now()-begin,audienceBound:true,sessionRestored:true});
        await page.screenshot({path:path.join(output,`${who}-dashboard.png`),fullPage:true});
        portalSessions.push({who,page,ready});
        if(who==='customer'){customerContext=context;customerPage=page;}
      }
      return observations;
    });
    if(config.profile==='Performance')await bankCase('P07','Authenticated portal reload to READY, twenty samples per portal',async()=>{
      const portals=[];
      for(const {who,page,ready} of portalSessions) {
        const samples=[],started=performance.now();
        for(let index=0;index<20;index++) {
          const start=performance.now();await page.reload();await page.locator(ready).waitFor({timeout:20000});
          samples.push({ms:performance.now()-start,ok:true,status:200});
        }
        const measurement={who,...summarize(samples,performance.now()-started)};
        portals.push(measurement);report.pageMeasurements=portals;save();
        assert.ok(measurement.p95Ms<=3000,'PAGE_READY_P95_EXCEEDED');
      }
      return {portals,goalP95Ms:3000,scope:'Authenticated reload through Keycloak session to dashboard READY; initial manual login excluded'};
    },'PERFORMANCE');
    await bankCase('B02','Customer logout removes local access and protects navigation',async()=>{
      await customerPage.getByTestId('customer-profile-menu').click();
      await customerPage.getByText('退出登录',{exact:true}).click();
      await customerPage.waitForURL(/\/login/);
      await customerPage.goto('http://127.0.0.1:18082/portal/accounts');await customerPage.waitForURL(/\/login/);
      assert.equal((await fetch(`${config.gateway}/api/customer/v1/accounts`)).status,401);
      return {localAccessCleared:true,protectedNavigation:'LOGIN',anonymousApi:401,scope:'Local logout; not Keycloak global-session revocation'};
    });
  }finally{await browser.close();}
  await bankCase('B14','Controlled restart preserves containers mounts and bank history',async()=>{
    const before=await balances();
    const result=execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/demo/verify-rf056-controlled-restart.ps1')],{cwd:root,encoding:'utf8',timeout:600000});
    assert.ok(result.includes('RF056_CONTROLLED_RESTART=PASS'));
    assert.deepEqual(await balances(),before);
    const previous=await success(`/api/operations/v1/transfers?query=${encodeURIComponent(config.golden.correlationId)}`,{who:'operator'});
    assert.equal(previous.items.length,1);assert.equal(previous.items[0].status,'SETTLED');
    return {containers:'PRESERVED',mounts:'PRESERVED',history:'SETTLED',balancesUnchanged:true,servicesLeftRunning:true};
  });
  if(config.profile==='Performance') {
    await bankCase('P01','Authenticated mixed read ramp 1 5 10 20 concurrent',async()=>{
      const stages=[];
      for(const concurrency of [1,5,10,20]) {
        const stage=await runLoad({concurrency,durationMs:120000,request:async i=>{
          const options=i%3===2?{who:'operator',timeoutMs:10000}:{timeoutMs:10000};
          const route=[`/api/customer/v1/accounts/${accountId}`,'/api/customer/v1/transfers','/api/operations/v1/transfers?page=1&size=20'][i%3];
          const r=await http(route,options);return {ok:r.ok,status:r.status};
        }});
        stages.push(stage);console.log(JSON.stringify({caseId:'P01',concurrency,...stage},(key,value)=>key==='samples'?undefined:value));
        assert.ok(stage.errorRate<=.01,'READ_ERROR_RATE_EXCEEDED');assert.ok(stage.p95Ms<=1000,'READ_P95_EXCEEDED');
      }return {stages,goalP95Ms:1000,goalErrorRate:.01};
    },'PERFORMANCE');
    await bankCase('P02','Small-value transfer ramp with per-transaction accounting proof',async()=>{
      const stages=[];
      for(const concurrency of [1,5,10]) {
        const before=await balances(),transactions=[];
        report.activePaymentStage={concurrency,attempts:[]};save();
        const stage=await runLoad({concurrency,maxRequests:100,stopOnFailure:true,request:async i=>{
          const key=`rf057-${runId}-load-${concurrency}-${i}`;
          const attempt={correlationId:key,status:'SUBMITTING'};
          report.activePaymentStage.attempts.push(attempt);save();
          const transfer=await createTransfer(key);attempt.transferId=transfer.transferId;attempt.status='CREATED';save();
          const result=await confirm(transfer.transferId);attempt.status=result.status;save();assert.equal(result.status,'SETTLED');
          transactions.push(await settlementAssertions(transfer,key));attempt.accountingVerified=true;save();return {ok:true,status:200};
        }});
        const after=await balances();
        report.activePaymentStage.measurement=stage;
        report.activePaymentStage.balances={before:{source:before.source.toString(),target:before.target.toString()},after:{source:after.source.toString(),target:after.target.toString()}};save();
        assert.equal(before.source+before.target,after.source+after.target);
        assert.equal(before.source-after.source,BigInt(transactions.length)*100n);assert.equal(after.target-before.target,BigInt(transactions.length)*100n);
        stages.push({...stage,transactions,balances:moneyObservations(before,after)});console.log(JSON.stringify({caseId:'P02',concurrency,...stage},(key,value)=>key==='samples'?undefined:value));
        assert.equal(stage.failed,0,'PAYMENT_EXECUTION_FAILED');assert.equal(stage.offered,100);assert.ok(stage.p95Ms<=15000,'SETTLEMENT_P95_EXCEEDED');
        await reconciliation();
      }return {stages,amountPerTransfer:'1.00',goalP95Ms:15000};
    },'PERFORMANCE');
    await bankCase('P03','Twenty same-key requests settle exactly once',async()=>{
      const before=await balances(),key=`rf057-${runId}-storm`;
      const results=await Promise.all(Array.from({length:20},()=>http('/api/customer/v1/transfers',{method:'POST',body:transferBody(),extra:transferHeaders(key)})));
      assert.ok(results.every(x=>x.ok),'SAME_KEY_REPLAY_REJECTED');
      assert.equal(new Set(results.map(x=>x.body.transferId)).size,1);
      const transfer=results[0].body;assert.equal((await confirm(transfer.transferId)).status,'SETTLED');
      const after=await balances();assert.equal(before.source-after.source,100n);assert.equal(after.target-before.target,100n);
      return {...await settlementAssertions(transfer,key),requests:20,uniqueTransfers:1,balances:moneyObservations(before,after),statusCounts:results.reduce((r,x)=>(r[x.status]=(r[x.status]||0)+1,r),{})};
    },'PERFORMANCE');
    await bankCase('P04','Twenty same-version document writes have one winner',async()=>{
      const form=new FormData();form.set('file',new Blob([`RF057 contention ${runId}`],{type:'text/plain'}),'contention.txt');form.set('title',`RF057 contention ${runId}`);form.set('category','REPORT');
      const doc=await success('/api/operations/v1/documents',{who:'accountant',method:'POST',body:form});const outcomes=[];
      const load=await runLoad({concurrency:20,maxRequests:20,request:async()=>{
        const r=await http(`/api/operations/v1/documents/${doc.documentId}/status`,{who:'accountant',method:'PATCH',body:{status:'PUBLISHED',version:1}});outcomes.push(r.status);return {ok:r.ok||r.status===409,status:r.status};
      }});assert.equal(outcomes.filter(x=>x===200).length,1);assert.equal(outcomes.filter(x=>x===409).length,19);
      await success(`/api/operations/v1/documents/${doc.documentId}/status`,{who:'accountant',method:'PATCH',body:{status:'ARCHIVED',version:2}});
      return {documentId:doc.documentId,...load,expectedConflicts:19};
    },'PERFORMANCE');
    await bankCase('P06','Thirty-minute authenticated read soak at concurrency ten',async()=>{
      const windows=[];
      for(let minute=0;minute<30;minute++) {
        const window=await runLoad({concurrency:10,durationMs:60000,request:async i=>{
          const r=await http(i%2?'/api/customer/v1/transfers':`/api/customer/v1/accounts/${accountId}`,{timeoutMs:10000});return {ok:r.ok,status:r.status};
        }});windows.push(window);console.log(JSON.stringify({caseId:'P06',minute:minute+1,...window},(key,value)=>key==='samples'?undefined:value));
        assert.ok(window.errorRate<=.01,'SOAK_ERROR_RATE_EXCEEDED');assert.ok(window.p95Ms<=1000,'SOAK_P95_EXCEEDED');
      }
      return {windows,durationMinutes:30,concurrency:10,reconciliation:await reconciliation()};
    },'PERFORMANCE');
  }
  report.status='PARTIAL';evidence.finishEvidence(report,output);
  console.log(JSON.stringify({runId,status:report.status,passed:report.cases.length,report:path.relative(root,path.join(output,'report.json'))}));
}catch{
  report.status='FAILED';
  try { evidence.finishEvidence(report,output); }
  finally { process.exitCode=1; }
}
