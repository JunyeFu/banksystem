'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {HarnessDatabase} = require('../../dist/harness/src/database.js');
const {ReleaseVerification} = require('../../dist/harness/src/release-verification.js');
const {validPerformanceCaseEvidence} = require('../../dist/harness/src/release-case-evidence.js');
const IDENTITY = 'a'.repeat(64);

test('authenticated production HTTP route admits P05 but rejects unsupported performance case IDs',async t=>{
  const {startHarness}=require('../../dist/harness/src/server.js');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rf057-p05-http-')),token='s'.repeat(32);
  const started=await startHarness({productRoot:path.resolve(__dirname,'../..'),databasePath:path.join(root,'state.sqlite'),
    backupDirectory:path.join(root,'backups'),artifactRoot:path.join(root,'artifacts'),schedulerIntervalMs:0,
    security:{serviceToken:token,allowedClients:['127.0.0.1']},host:'127.0.0.1',port:0});
  t.after(async()=>{await new Promise(resolve=>started.server.close(resolve));await started.application.close();fs.rmSync(root,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${started.server.address().port}/v1/releases:verify`;
  for(const [caseId,authorized,expected] of [['P05',true,409],['P06',true,400],['P05',false,401]]){
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(authorized?{authorization:`Bearer ${token}`}:{})},
      body:JSON.stringify({caseId,journeyId:'journey_11111111-1111-4111-8111-111111111111'})});
    assert.equal(response.status,expected);
    if(caseId==='P05'&&authorized)assert.equal((await response.json()).errorCode,'RELEASE_SOURCE_STALE');
  }
});

function capacityFacts(){
  let i=0;const money={source:{balanceCents:'10000',transactionIds:['1']},target:{balanceCents:'20000',transactionIds:['2']}};
  return {sourceJourneyId:'journey-source',sourceRunId:'run-source',noMoneyMovement:true,stages:[1,2,4].map(concurrency=>({
    concurrency,offered:concurrency,completed:concurrency,elapsedMs:100,coreObservations:{before:money,after:structuredClone(money)},
    samples:Array.from({length:concurrency},()=>{const n=++i;return {journeyId:`journey-${n}`,runId:`run-${n}`,taskId:`task-${n}`,
      sessionId:`session-${n}`,candidateId:'candidate-source',scriptHash:'c'.repeat(64),status:'PASSED',wallMs:100,
      createdAt:'2026-10-09T00:00:00.000Z',startedAt:'2026-10-09T00:00:00.010Z',completedAt:'2026-10-09T00:00:00.020Z',queueMs:10,executionMs:10};})}))};
}
test('P05 proof computes timing from the actual run rows and rejects missing claim time',()=>{
  const Sqlite=require('better-sqlite3'),db=new Sqlite(':memory:');
  const {HarnessService}=require('../../dist/harness/src/service.js');
  try{
    db.exec(`CREATE TABLE i10_interaction_journeys(namespace TEXT,journey_id TEXT,references_json TEXT);
      CREATE TABLE runs(namespace TEXT,run_id TEXT,task_id TEXT,case_id TEXT,case_version INTEGER,plan_id TEXT,candidate_id TEXT,created_at TEXT,started_at TEXT,completed_at TEXT);
      CREATE TABLE tasks(task_id TEXT,payload_json TEXT);
      CREATE TABLE i8_script_candidates(namespace TEXT,candidate_id TEXT,script_id TEXT,script_version INTEGER,script_sha256 TEXT);
      CREATE TABLE i8_script_patch_proposals(namespace TEXT,repair_candidate_id TEXT,script_id TEXT,script_version INTEGER,script_sha256 TEXT);`);
    const namespace='hengzhun-local',scriptHash='c'.repeat(64);
    db.prepare('INSERT INTO i10_interaction_journeys VALUES (?,?,?)').run(namespace,'repeat',JSON.stringify({
      validatedJourneyId:'source',sourceRunId:'source-run',candidateId:'candidate',planId:'plan',scriptHash}));
    const payload=JSON.stringify({scriptId:'script',scriptVersion:1,scriptHash});
    for(const name of ['source','repeat'])db.prepare('INSERT INTO tasks VALUES (?,?)').run(`${name}-task`,payload);
    const insert=db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?)');
    insert.run(namespace,'source-run','source-task','case',1,'plan','candidate','2026-10-09T00:00:00.000Z','2026-10-09T00:00:00.001Z','2026-10-09T00:00:00.010Z');
    insert.run(namespace,'repeat-run','repeat-task','case',1,'plan','candidate','2026-10-09T00:00:00.020Z','2026-10-09T00:00:00.050Z','2026-10-09T00:00:00.100Z');
    db.prepare('INSERT INTO i8_script_candidates VALUES (?,?,?,?,?)').run(namespace,'candidate','script',1,scriptHash);
    const context={database:{read:fn=>fn(db)},verifyJourneyEvidence:(_,id)=>({verdict:'VERIFIED',runId:`${id}-run`,taskId:`${id}-task`})};
    const proof=HarnessService.prototype.verifyReleaseCaseEvidence.call(context,'P05',namespace,'repeat');
    assert.equal(proof.timing.queueMs,30);assert.equal(proof.timing.executionMs,50);assert.equal(proof.sameFrozenScript,true);
    db.prepare("UPDATE runs SET started_at=NULL WHERE run_id='repeat-run'").run();
    assert.throws(()=>HarnessService.prototype.verifyReleaseCaseEvidence.call(context,'P05',namespace,'repeat'),e=>e.errorCode==='RELEASE_QUEUE_TIMING_MISSING');
  }finally{db.close();}
});
test('P05 validates exact bounded concurrency, unique bindings, ordered measured timing and unchanged money',()=>{
  assert.equal(validPerformanceCaseEvidence('P05',capacityFacts()),true);
  for(const mutate of [f=>f.stages[2].samples.pop(),f=>f.stages[1].samples[0].runId='run-1',
    f=>f.stages[0].samples[0].queueMs=1,f=>f.stages[0].coreObservations.after.source.balanceCents='9999',
    f=>f.stages[2].samples[3].status='FAILED',f=>f.stages[1].samples[1].createdAt='2026-10-09T00:00:01.000Z']){
    const f=capacityFacts();mutate(f);assert.equal(validPerformanceCaseEvidence('P05',f),false);
  }
});
test('P05 release verifies every task against ledger and its admitted A01, including exact timing',async t=>{
  const facts=capacityFacts(),f=await fixture(t,facts,'P05','PERFORMANCE');
  const suite={suite:'BANK-AGENT-ACCEPTANCE-v1',cases:[{id:'A01',required:true,evidenceClass:'LIVE_AGENT'},{id:'P05',required:true,evidenceClass:'PERFORMANCE'}]};
  f.write('scripts/test/rf057/suite.json',suite);f.report.suiteSha256=digest(JSON.stringify(suite));
  f.report.cases.unshift({id:'A01',evidenceClass:'LIVE_AGENT',status:'PASSED',assertions:{journeyId:'journey-source',runId:'run-source'}});
  f.write(f.reportPath,f.report);
  for(const wrong of [false,true]){
    let checked=0;
    const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,(id,namespace,journeyId)=>{
      if(id==='A01')return {verdict:'VERIFIED',releaseIdentityHash:IDENTITY,runStatus:'PASSED'};
      checked++;const sample=facts.stages.flatMap(s=>s.samples).find(s=>s.journeyId===journeyId);
      return {...sample,verdict:'VERIFIED',releaseIdentityHash:IDENTITY,runStatus:'PASSED',sameFrozenScript:true,
        sourceJourneyId:facts.sourceJourneyId,sourceRunId:facts.sourceRunId,timing:{createdAt:sample.createdAt,startedAt:sample.startedAt,
          completedAt:sample.completedAt,queueMs:wrong&&checked===7?11:10,executionMs:10}};
    });
    await verifier.register(f.reportPath);const result=await verifier.verify();
    assert.equal(result.decision,wrong?'NO_GO':'GO');assert.equal(checked,7);
  }
});
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

const financialInputs={schemaVersion:'hengzhun-i10-typed-business-inputs-v2',source:'USER_CONFIRMED',
  values:{payerAccountId:'3',payeeRef:'33333333-3333-4333-8333-333333333333',amount:'1.00',currency:'CNY',purpose:'RF057-A02-test'}};
function financialFacts(){
  const transfer={transferId:'11111111-1111-4111-8111-111111111111',correlationId:'correlation-test',coreReference:'core-test',
    status:'SETTLED',sourceAccountId:'3',destinationAccountId:'4',beneficiaryId:financialInputs.values.payeeRef,
    amount:'1.00',currency:'CNY',reference:financialInputs.values.purpose};
  return {journeyId:'journey-financial',runId:'run-financial',taskId:'task-financial',transferId:transfer.transferId,
    correlationId:transfer.correlationId,fineractTransactionId:transfer.coreReference,balanced:true,
    coreObservations:{before:{source:{balanceCents:'100000',transactionIds:['s0']},target:{balanceCents:'200000',transactionIds:['t0']}},
      after:{source:{balanceCents:'99900',transactionIds:['s0','s1']},target:{balanceCents:'200100',transactionIds:['t0','t1']}}},
    bankReadbacks:{customer:transfer,operations:{...transfer},payment:{transfer:{...transfer},coreTransactionVerified:true,
      coreAmountMatched:true,coreEntryCount:4},projection:{projectionBalanced:true,projectionEntryCount:2,projectionDebits:'1.00',projectionCredits:'1.00'}}};
}
const financialProof=()=>({verdict:'VERIFIED',releaseIdentityHash:IDENTITY,runStatus:'PASSED',
  journeyId:'journey-financial',runId:'run-financial',taskId:'task-financial',businessInputs:structuredClone(financialInputs),
  formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'}});

test('A02 release admission rejects financial false positives despite a PASSED browser ledger',async t=>{
  for(const change of [
    f=>{delete f.bankReadbacks},f=>{f.coreObservations.after.source.balanceCents='100000'},
    f=>{f.bankReadbacks.customer.status='PENDING_CORE_POSTING'},f=>{f.bankReadbacks.operations.correlationId='other'},
    f=>{f.bankReadbacks.customer.sourceAccountId='9'},f=>{f.bankReadbacks.customer.reference='other'},
    f=>{f.bankReadbacks.payment.coreTransactionVerified=false},f=>{f.bankReadbacks.payment.transfer.coreReference='other'},
    f=>{f.bankReadbacks.projection.projectionDebits='0.00'},f=>{f.coreObservations.after.target.transactionIds.push('extra')},
    f=>{f.runId='other'}
  ]){
    const facts=financialFacts();change(facts);const f=await fixture(t,facts,'A02','LIVE_AGENT');
    const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,financialProof);
    await verifier.register(f.reportPath);const result=await verifier.verify();
    assert.equal(result.decision,'NO_GO');assert.equal(result.cases[0].status,'INVALID_AGENT_OBSERVATION');
  }
});

test('A02 binds exact financial evidence to frozen inputs and rejects absent or different bindings',async t=>{
  const f=await fixture(t,financialFacts(),'A02','LIVE_AGENT');
  for(const mode of ['correct','missing','different-payer','different-target']){
    const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,()=>{
      const proof=financialProof();if(mode==='missing')delete proof.businessInputs;
      if(mode==='different-payer')proof.businessInputs.values.payerAccountId='9';
      if(mode==='different-target')proof.formalAccountIds.targetAccountId='9';return proof;
    });
    await verifier.register(f.reportPath);
    assert.equal((await verifier.verify()).decision,mode==='correct'?'GO':'NO_GO');
  }
});

test('A02 latest valid evidence cannot conceal an older admitted invalid money observation',async t=>{
  const bad=financialFacts();bad.coreObservations.after.target.balanceCents='200000';
  const f=await fixture(t,bad,'A02','LIVE_AGENT');
  const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,financialProof);
  await verifier.register(f.reportPath);
  const report=structuredClone(f.report);report.runId=crypto.randomUUID();report.cases[0].assertions=financialFacts();
  const nextPath=`agent/runs/rf057-agent/${report.runId}/report.json`;f.bindCleanup(report);f.write(nextPath,report);await verifier.register(nextPath);
  assert.equal((await verifier.verify()).decision,'NO_GO');
});

test('A02 proof reads the immutable version actually used by the run rather than the latest version',()=>{
  const Sqlite=require('better-sqlite3'),db=new Sqlite(':memory:');
  const {HarnessService}=require('../../dist/harness/src/service.js');
  try{
    db.exec('CREATE TABLE runs(namespace TEXT,run_id TEXT,task_id TEXT,journey_id TEXT,case_id TEXT,case_version INTEGER); CREATE TABLE case_versions(case_id TEXT,version INTEGER,definition_json TEXT);');
    db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?)').run('hengzhun-local','run-financial','task-financial','journey-financial','case-financial',1);
    const sample=i=>({fixtureId:crypto.randomUUID(),subject:crypto.randomUUID(),credentialRef:`credential_${crypto.randomUUID()}`,
      sourceClientId:String(100+i*2),targetClientId:String(101+i*2),sourceAccountId:String(200+i*2),targetAccountId:String(201+i*2),
      beneficiaryRef:crypto.randomUUID(),sourceBalance:'1000.00',targetBalance:'2000.00',currency:'CNY'});
    const pool={schemaVersion:'hengzhun-bank-validation-fixtures-v1',formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'},authoring:sample(0),
      stability:['DESKTOP_1440X900','NARROW_390X844'].flatMap((viewportId,i)=>[1,2].map(sequenceNo=>({viewportId,sequenceNo,fixture:sample(1+i*2+sequenceNo-1)})))};
    db.prepare('INSERT INTO case_versions VALUES (?,?,?)').run('case-financial',1,JSON.stringify({businessInputs:financialInputs,bankValidationFixtures:pool}));
    const later=structuredClone(financialInputs);later.values.payerAccountId='9';
    db.prepare('INSERT INTO case_versions VALUES (?,?,?)').run('case-financial',2,JSON.stringify({businessInputs:later}));
    const service={database:{read:fn=>fn(db)},verifyJourneyEvidence:financialProof};
    const verify=()=>HarnessService.prototype.verifyReleaseCaseEvidence.call(service,'A02','hengzhun-local','journey-financial');
    assert.deepEqual(verify().businessInputs,financialInputs);assert.deepEqual(verify().formalAccountIds,pool.formalAccountIds);
    db.prepare('DELETE FROM case_versions WHERE version=1').run();
    assert.throws(verify,error=>error.errorCode==='RELEASE_FINANCIAL_BINDING_REQUIRED');
  }finally{db.close();}
});

async function fixture(t, assertions, caseId='B07', evidenceClass='LIVE_BANK') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf057-release-'));
  const database = await HarnessDatabase.open({databasePath:path.join(root,'state.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'), backupDirectory:path.join(root,'backups')});
  t.after(async()=>{await database.close();fs.rmSync(root,{recursive:true,force:true});});
  const write=(relative,value)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
  const suite={suite:'BANK-AGENT-ACCEPTANCE-v1',cases:[{id:caseId,required:true,evidenceClass}]};
  write('scripts/test/rf057/suite.json',suite);
  const runId=crypto.randomUUID(), cleanupId=crypto.randomUUID().replaceAll('-','');
  const reportPath=`agent/runs/${evidenceClass==='LIVE_AGENT'?'rf057-agent':'rf057'}/${runId}/report.json`;
  const cleanupRef=`agent/runs/rf057-cleanup/${cleanupId}.json`;
  const cleanup={schemaVersion:'rf057-identity-cleanup/v2',cleanupId,runId,releaseIdentityHash:IDENTITY,status:'COMPLETED',
    createdAt:new Date().toISOString(),ownedResources:[],results:[],failures:[]};
  write(cleanupRef,cleanup);
  const report={schemaVersion:'bank-agent-acceptance-report/v1',suite:suite.suite,runId,
    releaseIdentityHash:IDENTITY,suiteSha256:digest(JSON.stringify(suite)),finishedAt:new Date().toISOString(),
    cleanupRef,cleanupSha256:digest(JSON.stringify(cleanup)),status:'PARTIAL',artifacts:[],cases:[{id:caseId,evidenceClass,status:'PASSED',assertions}]};
  write(reportPath,report);
  let current=IDENTITY;
  const verifier=new ReleaseVerification(database,root,IDENTITY,()=>current,()=>{throw Error('No Agent proof in bank fixture');});
  const bindCleanup=report=>{
    const id=crypto.randomUUID().replaceAll('-','');
    const next={...cleanup,cleanupId:id,runId:report.runId};
    report.cleanupRef=`agent/runs/rf057-cleanup/${id}.json`;report.cleanupSha256=digest(JSON.stringify(next));write(report.cleanupRef,next);
  };
  return {root,database,write,report,reportPath,cleanupRef,cleanup,bindCleanup,verifier,setIdentity:value=>{current=value;}};
}

test('cleanup ownership, completeness and digest are enforced together',async t=>{
  for(const mutate of [c=>{c.runId=crypto.randomUUID()},c=>{c.releaseIdentityHash='b'.repeat(64)},c=>{delete c.schemaVersion},
    c=>{c.failures=['NOT_REMOVED']},c=>{c.ownedResources=[{kind:'KEYCLOAK_USER',ref:'synthetic:user'}]},
    c=>{c.results=[{kind:'KEYCLOAK_USER',ref:'unowned',status:'REMOVED'}]}]){
    const f=await fixture(t,{status:'FAILED',noMoneyMovement:true,balances:{before:{source:'10000',target:'20000'},after:{source:'10000',target:'20000'}}});
    const c=structuredClone(f.cleanup);mutate(c);f.write(f.cleanupRef,c);
    f.report.cleanupSha256=digest(JSON.stringify(c));f.write(f.reportPath,f.report);
    await assert.rejects(f.verifier.register(f.reportPath));
  }
});

test('a registered report detects later cleanup changes',async t=>{
  const f=await fixture(t,{status:'FAILED',noMoneyMovement:true,balances:{before:{source:'10000',target:'20000'},after:{source:'10000',target:'20000'}}});
  await f.verifier.register(f.reportPath);
  f.write(f.cleanupRef,{...f.cleanup,createdAt:new Date(Date.now()+1000).toISOString()});
  await assert.rejects(f.verifier.verify(),e=>e.errorCode==='RELEASE_CLEANUP_BINDING_MISMATCH');
});

test('the actual required 28-case suite cannot get GO from one valid case',async t=>{
  const f=await fixture(t,{status:'FAILED',noMoneyMovement:true,balances:{before:{source:'10000',target:'20000'},after:{source:'10000',target:'20000'}}});
  const suite=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../scripts/test/rf057/suite.json'),'utf8'));
  f.write('scripts/test/rf057/suite.json',suite);f.report.suiteSha256=digest(JSON.stringify(suite));f.write(f.reportPath,f.report);
  await f.verifier.register(f.reportPath);const decision=await f.verifier.verify();
  assert.equal(decision.required,28);assert.equal(decision.decision,'NO_GO');assert.equal(decision.passed,1);
});

test('a PASSED label cannot admit an insufficient-funds case that moved money',async t=>{
  const f=await fixture(t,{status:'FAILED',noMoneyMovement:false});
  await f.verifier.register(f.reportPath);
  const result=await f.verifier.verify();
  assert.equal(result.decision,'NO_GO');
  assert.equal(result.passed,0);
  assert.equal(result.cases[0].status,'INVALID_CASE_EVIDENCE');
});

test('expected business rejection with unchanged money can pass the case contract',async t=>{
  const f=await fixture(t,{status:'FAILED',noMoneyMovement:true,
    balances:{before:{source:'10000',target:'20000'},after:{source:'10000',target:'20000'}}});
  await f.verifier.register(f.reportPath);
  const result=await f.verifier.verify();
  assert.equal(result.decision,'GO');
  assert.equal(result.passed,1);
});

test('a true no-movement label cannot hide changed observed balances',async t=>{
  const f=await fixture(t,{status:'FAILED',noMoneyMovement:true,
    balances:{before:{source:'10000',target:'20000'},after:{source:'9900',target:'20100'}}});
  await f.verifier.register(f.reportPath);
  assert.equal((await f.verifier.verify()).decision,'NO_GO');
});

const unchanged={status:'FAILED',noMoneyMovement:true,
  balances:{before:{source:'10000',target:'20000'},after:{source:'10000',target:'20000'}}};

test('missing required evidence is NOT_RUN rather than GO',async t=>{
  const f=await fixture(t,unchanged);
  const result=await f.verifier.verify();
  assert.equal(result.decision,'NO_GO');
  assert.equal(result.cases[0].status,'NOT_RUN');
});

test('registered reports cannot be changed or re-registered with different content',async t=>{
  const f=await fixture(t,unchanged);
  await f.verifier.register(f.reportPath);
  f.report.cases[0].assertions.noMoneyMovement=false;
  f.write(f.reportPath,f.report);
  await assert.rejects(f.verifier.register(f.reportPath),/已登记报告不可替换/);
  await assert.rejects(f.verifier.verify(),/已登记报告被修改/);
});

test('current source identity is required after registration',async t=>{
  const f=await fixture(t,unchanged);
  await f.verifier.register(f.reportPath);
  f.setIdentity('b'.repeat(64));
  await assert.rejects(f.verifier.verify(),/运行身份与当前源码不一致/);
});

test('cleanup failure blocks report admission',async t=>{
  const f=await fixture(t,unchanged);
  f.write(f.cleanupRef,{status:'FAILED'});
  await assert.rejects(f.verifier.register(f.reportPath),/测试清理未完成/);
});

test('a failed report cannot get GO even when its listed case passes',async t=>{
  const f=await fixture(t,unchanged);
  f.report.status='FAILED';f.write(f.reportPath,f.report);
  await f.verifier.register(f.reportPath);
  assert.equal((await f.verifier.verify()).decision,'NO_GO');
});

test('artifact changes invalidate registered evidence',async t=>{
  const f=await fixture(t,unchanged);
  const artifact=f.reportPath.replace('report.json','observation.json');
  f.write(artifact,{balance:'100.00'});
  const original=fs.readFileSync(path.join(f.root,artifact));
  f.report.artifacts=[{path:artifact,size:original.length,sha256:digest(original)}];
  f.write(f.reportPath,f.report);
  await f.verifier.register(f.reportPath);
  f.write(artifact,{balance:'200.00'});
  await assert.rejects(f.verifier.verify(),/证据文件摘要不匹配/);
});

test('a PASSED performance label without measurements cannot grant GO',async t=>{
  const f=await fixture(t,{p95Ms:1},'P07','PERFORMANCE');
  await f.verifier.register(f.reportPath);
  const result=await f.verifier.verify();
  assert.equal(result.decision,'NO_GO');
  assert.equal(result.cases[0].status,'INVALID_CASE_EVIDENCE');
});

function measurement(count=20,concurrency=1,elapsedMs=120000) {
  return {samples:Array.from({length:count},()=>({ms:100,ok:true,status:200})),
    attempted:count,completed:count,failed:0,errorRate:0,p95Ms:100,elapsedMs,statusCounts:{200:count},
    concurrency,offered:count,stoppedEarly:false};
}
test('portal performance requires both portals and recomputes p95 from twenty observations',()=>{
  const facts={portals:['customer','operator'].map(who=>({who,...measurement()}))};
  assert.equal(validPerformanceCaseEvidence('P07',facts),true);
  facts.portals[0].samples[18].ms=4000;facts.portals[0].samples[19].ms=4000;
  assert.equal(validPerformanceCaseEvidence('P07',facts),false);
  facts.portals[0].p95Ms=4000;
  assert.equal(validPerformanceCaseEvidence('P07',facts),false);
});
test('read load requires all concurrency stages and full duration, not a claimed error rate',()=>{
  const facts={stages:[1,5,10,20].map(c=>measurement(100,c))};
  assert.equal(validPerformanceCaseEvidence('P01',facts),true);
  facts.stages[0].elapsedMs=100;
  assert.equal(validPerformanceCaseEvidence('P01',facts),false);
  facts.stages[0].elapsedMs=120000;facts.stages[0].samples[0].ok=false;
  assert.equal(validPerformanceCaseEvidence('P01',facts),false);
});
test('payment performance requires unique transactions and exact balance changes at all three stages',()=>{
  const facts={stages:[1,5,10].map(c=>({...measurement(100,c),
    balances:{before:{source:'100000',target:'100000'},after:{source:'90000',target:'110000'}},
    transactions:Array.from({length:100},(_,i)=>({transferId:`t-${c}-${i}`,correlationId:`c-${c}-${i}`,fineractTransactionId:`f-${c}-${i}`,balanced:true}))}))};
  assert.equal(validPerformanceCaseEvidence('P02',facts),true);
  facts.stages[0].balances.after.target='110001';
  assert.equal(validPerformanceCaseEvidence('P02',facts),false);
  facts.stages[0].balances.after.target='110000';
  facts.stages[1].transactions[0].fineractTransactionId='f-1-0';
  assert.equal(validPerformanceCaseEvidence('P02',facts),false);
});
test('same-key concurrency requires only one debit and twenty successful responses',()=>{
  const facts={requests:20,uniqueTransfers:1,transferId:'t',correlationId:'c',fineractTransactionId:'f',balanced:true,
    balances:{before:{source:'10000',target:'20000'},after:{source:'9900',target:'20100'}},statusCounts:{200:20}};
  assert.equal(validPerformanceCaseEvidence('P03',facts),true);
  facts.balances.after.source='9800';
  assert.equal(validPerformanceCaseEvidence('P03',facts),false);
});
test('document contention treats only the expected nineteen conflicts as success',()=>{
  const facts={...measurement(20,20),documentId:'doc',expectedConflicts:19,statusCounts:{200:1,409:19}};
  facts.samples.slice(1).forEach(s=>{s.status=409;});
  assert.equal(validPerformanceCaseEvidence('P04',facts),true);
  facts.samples[1].status=500;
  assert.equal(validPerformanceCaseEvidence('P04',facts),false);
});
test('soak admission requires thirty measured minutes and all three reconciliations',()=>{
  const facts={windows:Array.from({length:30},()=>measurement(100,10,60000)),durationMinutes:30,concurrency:10,
    reconciliation:['CHANNEL_TO_CORE','CHANNEL_TO_CLEARING','CORE_TO_GENERAL_LEDGER'].map(type=>({type,runId:type}))};
  assert.equal(validPerformanceCaseEvidence('P06',facts),true);
  facts.windows.pop();
  assert.equal(validPerformanceCaseEvidence('P06',facts),false);
});
async function repeatReleaseFixture(t,extra={}){
  const observations={source:{balanceCents:'10000',transactionIds:['1']},target:{balanceCents:'20000',transactionIds:['2']}};
  const facts={journeyId:'journey-repeat',sourceJourneyId:'journey-source',sourceRunId:'run-source',runId:'run-repeat',
    taskId:'task-repeat',candidateId:'candidate-source',scriptHash:'c'.repeat(64),sameFrozenScript:true,
    coreObservations:{before:observations,after:structuredClone(observations)},...extra};
  const f=await fixture(t,facts,'A06','LIVE_AGENT');
  const suite={suite:'BANK-AGENT-ACCEPTANCE-v1',cases:['A01','A06'].map(id=>({id,required:true,evidenceClass:'LIVE_AGENT'}))};
  f.write('scripts/test/rf057/suite.json',suite);f.report.suiteSha256=digest(JSON.stringify(suite));
  f.report.cases.unshift({id:'A01',evidenceClass:'LIVE_AGENT',status:'PASSED',assertions:{journeyId:'journey-source',runId:'run-source'}});
  f.write(f.reportPath,f.report);
  const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,(id)=>({
    verdict:'VERIFIED',releaseIdentityHash:IDENTITY,runStatus:'PASSED',
    ...(id==='A01'?{journeyId:'journey-source',runId:'run-source'}:{journeyId:'journey-repeat',runId:'run-repeat',taskId:'task-repeat',
      sourceJourneyId:'journey-source',sourceRunId:'run-source',candidateId:'candidate-source',scriptHash:'c'.repeat(64),sameFrozenScript:true}),
  }));
  await verifier.register(f.reportPath);return {f,verifier,facts};
}

test('A06 release admission binds its source to A01 and unchanged core observations',async t=>{
  const {verifier}=await repeatReleaseFixture(t);
  assert.equal((await verifier.verify()).decision,'GO');
});

test('A06 cannot pass with another source or money movement despite a passed frozen-script proof',async t=>{
  for(const extra of [{sourceJourneyId:'journey-other'},{coreObservations:{before:{source:{balanceCents:'10000',transactionIds:['1']},target:{balanceCents:'20000',transactionIds:['2']}},
    after:{source:{balanceCents:'9900',transactionIds:['1','3']},target:{balanceCents:'20100',transactionIds:['2','4']}}}}]){
    const {verifier}=await repeatReleaseFixture(t,extra);
    const result=await verifier.verify();assert.equal(result.decision,'NO_GO');
    assert.equal(result.cases.find(c=>c.id==='A06').status,'INVALID_AGENT_OBSERVATION');
  }
});

test('Agent performance cannot pass without its unfinished ledger-backed driver',()=>{
  assert.equal(validPerformanceCaseEvidence('P05',{stages:[1,2,4].map(c=>measurement(10,c))}),false);
});

test('single Agent case proof reads the frozen suite expectation without publishing GO',async t=>{
  const f=await fixture(t,{},'A07','LIVE_AGENT');
  const expectedFailure={operation:'expectText',expectedText:'草稿',caseMarker:'RF057-A07'};
  f.write('scripts/test/rf057/suite.json',{suite:'BANK-AGENT-ACCEPTANCE-v1',cases:[
    {id:'A07',required:true,evidenceClass:'LIVE_AGENT',expectedFailure}]});
  let observed;
  const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,
    (...args)=>{observed=args;return {verdict:'VERIFIED',runStatus:'FAILED'};});
  const proof=verifier.verifyCaseEvidence('A07','journey-proof');
  assert.equal(proof.runStatus,'FAILED');
  assert.deepEqual(observed,['A07','hengzhun-local','journey-proof',expectedFailure]);
  assert.throws(()=>verifier.verifyCaseEvidence('B07','journey-proof'),error=>error.errorCode==='RELEASE_AGENT_CASE_INVALID');
  assert.equal(f.database.read(db=>db.prepare('SELECT COUNT(*) AS n FROM release_verifications').get().n),0);
  f.setIdentity('b'.repeat(64));
  assert.throws(()=>f.verifier.verifyCaseEvidence('A07','journey-proof'),error=>error.errorCode==='RELEASE_SOURCE_STALE');
});

test('A05 cannot pass from a normal successful run without a bound process interruption receipt',async t=>{
  const f=await fixture(t,{journeyId:'journey-resume',processInterrupted:true},'A05','LIVE_AGENT');
  const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,
    ()=>({verdict:'VERIFIED',releaseIdentityHash:IDENTITY,runStatus:'PASSED',runId:'run-resume',taskId:'task-resume'}));
  await verifier.register(f.reportPath);
  assert.equal((await verifier.verify()).cases[0].status,'INVALID_AGENT_OBSERVATION');
});

test('A05 verifies the bound interruption receipt and rejects a different recovered run or money movement',async t=>{
  for(const variant of ['valid','different-run','money-moved']){
  const snapshot={source:{balanceCents:'10000',transactionIds:['1']},target:{balanceCents:'20000',transactionIds:['2']}};
  const f=await fixture(t,{journeyId:'journey-resume',sessionId:'session-resume',coreObservations:{before:snapshot,after:structuredClone(snapshot)}},'A05','LIVE_AGENT');
  const witnessPath=f.reportPath.replace('report.json','a05-process-interruption.json');
  f.report.cases[0].assertions.interruptionEvidence=witnessPath;
  const receipt={schemaVersion:'rf057-cli-interruption/v1',releaseIdentityHash:IDENTITY,
    journeyId:'journey-resume',sessionId:'session-resume',runId:'run-resume',taskId:'task-resume',cliPid:1234,
    journeyStage:'RUNNING',taskStatus:'RUNNING',observedAt:'2026-10-09T01:00:00.000Z',
    interruptedAt:'2026-10-09T01:00:01.000Z',recoveredAt:'2026-10-09T01:00:02.000Z',
    recoveredRunId:'run-resume',recoveredTaskId:'task-resume'};
  const update=()=>{
    f.write(witnessPath,receipt);
    const bytes=Buffer.from(JSON.stringify(receipt));
    f.report.artifacts=[{path:witnessPath,sha256:digest(bytes),size:bytes.length}];
    f.write(f.reportPath,f.report);
  };
  const verifier=new ReleaseVerification(f.database,f.root,IDENTITY,()=>IDENTITY,
    ()=>({verdict:'VERIFIED',releaseIdentityHash:IDENTITY,runStatus:'PASSED',runId:'run-resume',taskId:'task-resume'}));
  if(variant==='different-run')receipt.recoveredRunId='run-second';
  if(variant==='money-moved')f.report.cases[0].assertions.coreObservations.after.source.balanceCents='9900';
  update();await verifier.register(f.reportPath);
  assert.equal((await verifier.verify()).cases[0].status,variant==='valid'?'PASSED':'INVALID_AGENT_OBSERVATION');
  }
});
