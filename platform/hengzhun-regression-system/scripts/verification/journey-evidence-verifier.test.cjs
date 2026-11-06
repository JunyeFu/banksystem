'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { HarnessService } = require('../../dist/harness/src/service.js')
const { journeyPrepareSchema } = require('../../dist/harness/src/i10/schemas.js')

const IDENTITY = 'a'.repeat(64)
const NAMESPACE = 'rf046-test'
const JOURNEY = 'journey_12345678-1234-1234-1234-123456789abc'
const RUN = 'run_12345678-1234-1234-1234-123456789abc'
const TASK = 'task_12345678-1234-1234-1234-123456789abc'
const productRoot=path.resolve(__dirname,'../..')

async function fixture({ omitKind, runIdentity = IDENTITY, noExecution=false,candidateId=null,scriptBinding={},migrationsDirectory=path.resolve(__dirname, '../../harness/migrations') } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-rf046-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root, 'db.sqlite'),
    migrationsDirectory,
    backupDirectory: path.join(root, 'backups'),
  })
  const service = new HarnessService(database, path.join(root, 'artifacts'), root, IDENTITY)
  const db = database.connection
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(NAMESPACE, now, now)
  db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES ('case_rf046',?,1,'VALIDATED','Evidence','Evidence','LOW',?,?)`).run(NAMESPACE, now, now)
  db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES ('case_rf046',1,'{}',?,'TEST',?)`).run('b'.repeat(64), now)
  db.prepare(`INSERT INTO plans(plan_id,namespace,case_id,case_version,version,status,summary_json,content_hash,created_at) VALUES ('plan_rf046',?,'case_rf046',1,1,'READY','{}',?,?)`).run(NAMESPACE, 'c'.repeat(64), now)
  db.prepare(`INSERT INTO i10_interaction_journeys(journey_id,namespace,session_ref,idempotency_key,request_intent,input_type,stage,status,input_envelope_json,missing_fields_json,allowed_actions_json,next_action_json,references_json,progress_json,error_json,version,recoverable,created_at,updated_at) VALUES (?,?, 'session-rf046','idem-rf046','CASE_AUTHORING','NATURAL_LANGUAGE','COMPLETED','COMPLETED','{}','[]','[]','{"type":"RESULT_AVAILABLE"}',?,'{"percent":100}',NULL,1,1,?,?)`).run(JOURNEY, NAMESPACE, JSON.stringify({ runId: RUN, taskId: TASK }), now, now)
  if(!noExecution) {
  db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,result_summary,payload_json,version,created_at,updated_at,completed_at) VALUES (?,?,'RUN_EXECUTE','SUCCEEDED',100,'case_rf046',?,'passed',?,1,?,?,?)`).run(TASK, NAMESPACE, RUN,JSON.stringify(scriptBinding), now, now, now)
  db.exec('DROP TRIGGER trg_i10_run_execution_binding_required; DROP TRIGGER trg_i10_run_execution_binding_valid;')
  db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at,started_at,completed_at,journey_id,release_identity_hash,candidate_id) VALUES (?,?,'case_rf046',1,'plan_rf046',?,'PASSED',1,?,?,?,?,?,?)`).run(RUN, NAMESPACE, TASK, now, now, now, JOURNEY, runIdentity,candidateId)
  }
  const artifactIds = []
  for (const kind of ['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER']) {
    if (noExecution || kind === omitKind) continue
    const artifact = await service.artifacts.create({
      namespace: NAMESPACE, runId: RUN, taskId: TASK,
      artifactType: kind === 'SCREENSHOT' ? 'SCREENSHOT' : kind === 'TRACE' ? 'TRACE' : 'JSON',
      mediaType: kind === 'SCREENSHOT' ? 'image/png' : kind === 'TRACE' ? 'application/zip' : 'application/json',
      redactionStatus: ['SCREENSHOT', 'TRACE'].includes(kind) ? 'QUARANTINED' : 'REDACTED',
      extension: kind === 'SCREENSHOT' ? 'png' : kind === 'TRACE' ? 'zip' : 'json',
      content: Buffer.from(`rf046-${kind}`), metadata: { evidenceKind: kind },
    })
    artifactIds.push(artifact.artifactId)
  }
  db.prepare(`INSERT INTO audit_events(event_id,namespace,run_id,task_id,actor_type,action,object_type,object_id,outcome,correlation_id,details_json,created_at) VALUES ('evt_rf046',?,?,?,'WORKER','run.complete','RUN',?,'SUCCEEDED','corr_rf046',?,?)`).run(NAMESPACE, RUN, TASK, RUN, JSON.stringify({ outcome: 'PASSED', artifactIds }), now)
  return { root, database, service, artifactIds }
}

test('A04 cannot substitute a credential gap for missing money inputs',async t=>{
  const f=await fixture({noExecution:true});await closeFixture(t,f)
  f.database.connection.prepare("UPDATE i10_interaction_journeys SET stage='NEEDS_INPUT',status='NEEDS_INPUT',missing_fields_json=? WHERE journey_id=?")
    .run(JSON.stringify(['credentialRef']),JOURNEY)
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A04',NAMESPACE,JOURNEY),e=>e.errorCode==='RELEASE_MISSING_INPUT_NOT_BLOCKED')
})

test('A04 proves a current-identity money input gap with no execution and rejects stale input',async t=>{
  const f=await fixture({noExecution:true});await closeFixture(t,f)
  const input={releaseIdentityHash:IDENTITY,naturalLanguage:'发起转账',draftJson:{missingFields:['businessInputs.amount','businessInputs.payeeRef']}};
  const write=value=>f.database.connection.prepare("UPDATE i10_interaction_journeys SET stage='NEEDS_INPUT',status='NEEDS_INPUT',input_envelope_json=?,missing_fields_json=?,references_json='{}' WHERE journey_id=?")
    .run(JSON.stringify(value),JSON.stringify(value.draftJson.missingFields),JOURNEY);
  write(input)
  const proof=f.service.verifyReleaseCaseEvidence('A04',NAMESPACE,JOURNEY)
  assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.executionCount,0)
  assert.deepEqual(proof.blockedFields,['payeeRef','amount'])
  write({...input,releaseIdentityHash:'f'.repeat(64)})
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A04',NAMESPACE,JOURNEY),e=>e.errorCode==='RELEASE_MISSING_INPUT_NOT_BLOCKED')
})

const EXPECTED_FAILURE={operation:'expectText',expectedText:'草稿',caseMarker:'RF057-A07'};
async function failedFixture(t,reasonCode='I8_FORMAL_ASSERTION_FAILED',options={}) {
  const f=await fixture(options);await closeFixture(t,f);const db=f.database.connection,now=new Date().toISOString();
  db.prepare("UPDATE runs SET status='FAILED' WHERE run_id=?").run(RUN);
  db.prepare("UPDATE tasks SET status='FAILED',error_code=? WHERE task_id=?").run(reasonCode,TASK);
  db.prepare("UPDATE i10_interaction_journeys SET stage='FAILED_ACTIONABLE',status='FAILED',input_envelope_json=? WHERE journey_id=?")
    .run(JSON.stringify({releaseIdentityHash:IDENTITY,naturalLanguage:'验证 RF057-A07 运营文档草稿状态'}),JOURNEY);
  db.prepare("INSERT INTO scripts(script_id,namespace,case_id,current_version,status,created_at,updated_at) VALUES ('script_rf057',?,'case_rf046',1,'SCRIPT_VALIDATED',?,?)").run(NAMESPACE,now,now);
  db.prepare("INSERT INTO failure_incidents(incident_id,namespace,run_id,case_id,script_id,script_version,classification,reason_code,summary,diagnostic_status,version,created_at,updated_at) VALUES ('incident_rf057',?,?,'case_rf046','script_rf057',1,'ASSERTION',?,'CI assertion','CLASSIFIED',1,?,?)").run(NAMESPACE,RUN,reasonCode,now,now);
  return f;
}
test('A07 cannot exempt a different assertion failure even with all five evidence kinds',async t=>{
  const f=await failedFixture(t,'IDENTITY_ASSERTION_FAILED');
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A07',NAMESPACE,JOURNEY,EXPECTED_FAILURE),e=>e.errorCode==='RELEASE_ASSERTION_FAILURE_REQUIRED')
})

async function expectedFailureFixture(t,{failedStep='dsl_02',reportIdentity='candidate_rf057',omitKind,planExtra={},dslVersion='HENGZHUN_DSL_V1',dslSchemaVersion=dslVersion,migrationsDirectory,assertionOperation='expectText'}={}) {
  const f=await failedFixture(t,'I8_FORMAL_ASSERTION_FAILED',{candidateId:'candidate_rf057',omitKind,...(migrationsDirectory?{migrationsDirectory}:{})});const db=f.database.connection,now=new Date().toISOString();
  const hash=require('../../dist/harness/src/utils.js').sha256;
  const dsl=JSON.stringify({schemaVersion:dslSchemaVersion,steps:[{stepId:'dsl_02',...(planExtra.actions?.[0]?{sourceActionId:planExtra.actions[0].actionId}:{}),operation:assertionOperation,targetRef:'DOCUMENT.STATUS',
    ...(assertionOperation==='expectEqual'?{comparisonTargetRef:'COMPARISON.STATUS'}:{expectedTextRef:'EXPECTED.STATUS'})}]});
  const plan=JSON.stringify({fixtureValues:{'EXPECTED.STATUS':'草稿'},...planExtra});
  db.prepare("INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,status,created_at,updated_at) VALUES ('prep_rf057',?,'case_rf046',1,?,'{}','{}','AWAITING_STAGE3',?,?)").run(NAMESPACE,'d'.repeat(64),now,now);
  db.prepare("INSERT INTO i8_executable_plans(executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,plan_json,plan_hash,status,created_at,updated_at) VALUES ('executable_rf057',?,'prep_rf057','case_rf046',1,?, ?,?,'CANDIDATE_GENERATED',?,?)").run(NAMESPACE,'d'.repeat(64),plan,hash(plan),now,now);
  db.prepare(`INSERT INTO i8_script_candidates(candidate_id,namespace,executable_plan_id,script_id,script_version,dsl_version,dsl_json,dsl_hash,generator_version,relative_directory,script_sha256,manifest_json,manifest_sha256,source_chain_hash,status,created_at,updated_at)
    VALUES ('candidate_rf057',?,'executable_rf057','script_rf057',1,?,?,?,'hengzhun-script-package-builder-1.0.0','.data/candidates/ci',?,'{}',?,?,'SCRIPT_VALIDATED',?,?)`).run(NAMESPACE,dslVersion,dsl,hash(dsl),'e'.repeat(64),'f'.repeat(64),'d'.repeat(64),now,now);
  const report={schemaVersion:'i8-formal-run-report-v1',runId:RUN,taskId:TASK,passed:false,
    candidateId:reportIdentity,scriptHash:'e'.repeat(64),manifestHash:'f'.repeat(64),failureReason:assertionOperation==='expectEqual'?'CANDIDATE_EXPECT_EQUAL_FAILED':'CANDIDATE_EXPECT_TEXT_FAILED',
    assertions:[{stepId:failedStep,operation:assertionOperation,passed:false}]};
  await f.service.artifacts.create({namespace:NAMESPACE,runId:RUN,taskId:TASK,artifactType:'REPORT',mediaType:'application/json',
    redactionStatus:'REDACTED',extension:'json',content:Buffer.from(JSON.stringify(report)),metadata:{evidenceKind:'REPORT'}});
  return f;
}
test('A07 exempts only the frozen designated assertion and its exact failed task report',async t=>{
  const f=await expectedFailureFixture(t);
  const proof=f.service.verifyReleaseCaseEvidence('A07',NAMESPACE,JOURNEY,EXPECTED_FAILURE)
  assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.expectedAssertionStepId,'dsl_02')
  assert.equal(proof.runStatus,'FAILED');assert.equal(proof.taskStatus,'FAILED')
  assert.equal(proof.artifacts.length,6)
})
test('A07 rejects another failing step or candidate even when the expected assertion exists',async t=>{
  for(const options of [{failedStep:'dsl_03'},{reportIdentity:'candidate_other'}]){
    const f=await expectedFailureFixture(t,options)
    assert.throws(()=>f.service.verifyReleaseCaseEvidence('A07',NAMESPACE,JOURNEY,EXPECTED_FAILURE),e=>e.errorCode==='RELEASE_EXPECTED_ASSERTION_MISMATCH')
  }
})
test('A07 rejects incomplete evidence and an absent suite expectation',async t=>{
  const f=await expectedFailureFixture(t,{omitKind:'TRACE'})
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A07',NAMESPACE,JOURNEY,EXPECTED_FAILURE),e=>e.errorCode==='RELEASE_FAILURE_EVIDENCE_INCOMPLETE')
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A07',NAMESPACE,JOURNEY),e=>e.errorCode==='RELEASE_EXPECTED_ASSERTION_REQUIRED')
})

async function closeFixture(t, f) {
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
}

test('Journey evidence cards include exact run/task artifacts without exposing unrelated or quarantined downloads',async t=>{
  const f=await fixture();await closeFixture(t,f);
  const unrelated=await f.service.artifacts.create({namespace:NAMESPACE,artifactType:'JSON',mediaType:'application/json',
    redactionStatus:'REDACTED',extension:'json',content:'{}',metadata:{evidenceKind:'DOM'}});
  const partialBindings=[];
  for(const binding of [{runId:RUN},{taskId:TASK}])partialBindings.push(await f.service.artifacts.create({
    namespace:NAMESPACE,...binding,artifactType:'JSON',mediaType:'application/json',redactionStatus:'REDACTED',extension:'json',content:'{}',metadata:{evidenceKind:'DOM'}}));
  const view=await f.service.i10.getJourney({namespace:NAMESPACE,journeyId:JOURNEY,waitSeconds:0});
  const cards=view.artifactCards;
  for(const artifactId of f.artifactIds)assert.ok(cards.some(card=>card.artifactId===artifactId));
  assert.equal(cards.some(card=>card.artifactId===unrelated.artifactId),false);
  for(const artifact of partialBindings)assert.equal(cards.some(card=>card.artifactId===artifact.artifactId),false);
  for(const card of cards){
    const metadata=f.service.artifacts.getMetadata(NAMESPACE,card.artifactId);
    assert.equal(card.downloadGrantRequired,metadata.redactionStatus!=='QUARANTINED');
  }
  const quarantined=cards.find(card=>card.downloadGrantRequired===false);
  await assert.rejects(f.service.i10.grantArtifactDownload(NAMESPACE,quarantined.artifactId),error=>error.errorCode==='I10_ARTIFACT_QUARANTINED');
  const publicCard=cards.find(card=>card.downloadGrantRequired===true);
  const grant=await f.service.i10.grantArtifactDownload(NAMESPACE,publicCard.artifactId);
  assert.equal(grant.artifactId,publicCard.artifactId);
});

test('validated repeat accepts only a frozen source reference, not new business input',()=>{
  const input={namespace:NAMESPACE,idempotencyKey:'repeat-input-contract',sessionRef:'session-repeat',
    interactionContractVersion:'v6',requestIntent:'CASE_AUTHORING',inputType:'NONE',supportingImages:[],validatedJourneyId:JOURNEY};
  assert.equal(journeyPrepareSchema.safeParse(input).success,true);
  for(const extra of [{interactionContractVersion:'v3'},{naturalLanguage:'转账100元'},{draftJson:{}},{credentialRef:'credential_12345678-1234-1234-1234-123456789abc'}])
    assert.equal(journeyPrepareSchema.safeParse({...input,...extra}).success,false);
});

test('A06 rejects a normal passed run without a distinct frozen source Journey',async t=>{
  const f=await fixture();await closeFixture(t,f);
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A06',NAMESPACE,JOURNEY),e=>e.errorCode==='RELEASE_REPEAT_SOURCE_REQUIRED');
});

test('validated repeat refuses stale identity and incomplete source artifact evidence before preparing a new execution',async t=>{
  for(const options of [{runIdentity:'f'.repeat(64)},{omitKind:'TRACE'}]){
    const f=await fixture(options);await closeFixture(t,f);
    await assert.rejects(f.service.repeatValidatedJourney({namespace:NAMESPACE,idempotencyKey:'repeat-invalid-source',
      sessionRef:'session-repeat',interactionContractVersion:'v6',requestIntent:'CASE_AUTHORING',inputType:'NONE',
      supportingImages:[],validatedJourneyId:JOURNEY},{requestId:'repeat-invalid-source'}),
      e=>['I10_EVIDENCE_RELEASE_IDENTITY_MISMATCH','I10_EVIDENCE_KIND_MISSING'].includes(e.errorCode));
  }
});

function seedActivatedRepeat(f){
  const db=f.database.connection,now=new Date().toISOString(),hash='c'.repeat(64);
  db.prepare("INSERT INTO scripts(script_id,namespace,case_id,current_version,status,created_at,updated_at) VALUES ('script_repeat',?,'case_rf046',1,'SCRIPT_VALIDATED',?,?)").run(NAMESPACE,now,now);
  db.prepare("INSERT INTO script_versions(script_id,version,relative_path,sha256,validation_status,created_at) VALUES ('script_repeat',1,'scripts/repeat.cjs',?,'PASSED',?)").run(hash,now);
  db.prepare("UPDATE plans SET script_id='script_repeat' WHERE plan_id='plan_rf046'").run();
  db.prepare("INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,status,created_at,updated_at) VALUES ('prep_repeat',?,'case_rf046',1,?,'{}','{}','AWAITING_STAGE3',?,?)").run(NAMESPACE,hash,now,now);
  db.prepare("INSERT INTO i8_executable_plans(executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,plan_json,plan_hash,status,created_at,updated_at) VALUES ('executable_repeat',?,'prep_repeat','case_rf046',1,?,'{}',?,'CANDIDATE_GENERATED',?,?)").run(NAMESPACE,hash,hash,now,now);
  db.prepare(`INSERT INTO i8_script_candidates(candidate_id,namespace,executable_plan_id,script_id,script_version,dsl_version,dsl_json,dsl_hash,generator_version,relative_directory,script_sha256,manifest_json,manifest_sha256,source_chain_hash,status,created_at,updated_at)
    VALUES ('candidate_repeat',?,'executable_repeat','script_repeat',1,'HENGZHUN_DSL_V1','{}',?,'hengzhun-script-package-builder-1.0.0','.data/candidates/repeat',?,'{}',?,?,'SCRIPT_VALIDATED',?,?)`).run(NAMESPACE,hash,hash,hash,hash,now,now);
  db.prepare("INSERT INTO i8_stability_batches(batch_id,namespace,candidate_id,status,version,created_at,updated_at) VALUES ('batch_repeat',?,'candidate_repeat','PASSED',1,?,?)").run(NAMESPACE,now,now);
  db.prepare(`INSERT INTO i8_stability_certificates(certificate_id,namespace,candidate_id,batch_id,script_sha256,case_version,executable_plan_version,runtime_fingerprint,viewport_set_json,validation_run_ids_json,assertion_set_hash,evidence_set_hash,status,issued_at)
    VALUES ('cert_repeat',?,'candidate_repeat','batch_repeat',?,1,1,?,'[]','[]',?,?,'PASSED',?)`).run(NAMESPACE,hash,hash,hash,hash,now);
  db.prepare(`INSERT INTO i8_script_delivery_decisions(decision_id,namespace,candidate_id,certificate_id,expected_candidate_version,choice,reason,confirmation_ref,effect,case_version,executable_plan_id,executable_plan_version,activated_plan_id,script_id,script_version,script_sha256,created_at)
    VALUES ('delivery_repeat',?,'candidate_repeat','cert_repeat',1,'ACTIVATE','test','confirmation-repeat','SCRIPT_VERSION_ACTIVATED',1,'executable_repeat',1,'plan_rf046','script_repeat',1,?,?)`).run(NAMESPACE,hash,now);
  return {db,now,hash};
}

test('CLI through real MCP and Harness persists one frozen schedule, pauses first failure and retains original evidence',async t=>{
  const {spawn}=require('node:child_process'),net=require('node:net');
  const {startHarness}=require('../../dist/harness/src/server.js');
  const {connectMcpRuntime}=await import('../../controller/src/runtime-adapters.mjs');
  const {createProductionService}=await import('../../agent-cli/src/production-service.mjs');
  const scriptBinding={scriptId:'script_repeat',scriptVersion:1,scriptHash:'c'.repeat(64)};
  const f=await fixture({candidateId:'candidate_repeat',scriptBinding});
  let started,mcp,client;
  t.after(async()=>{
    await client?.close();if(mcp?.exitCode===null){mcp.kill();await new Promise(resolve=>mcp.once('exit',resolve));}
    if(started){await new Promise(resolve=>started.server.close(resolve));await started.application.close();}
    await f.database.close();fs.rmSync(f.root,{recursive:true,force:true});
  });
  const {db,hash}=seedActivatedRepeat(f);
  const credentialRef='credential_12345678-1234-1234-1234-123456789abc';
  db.prepare("UPDATE case_versions SET definition_json=? WHERE case_id='case_rf046' AND version=1").run(JSON.stringify({credentialRef}));
  const sourceBefore=f.service.verifyJourneyEvidence(NAMESPACE,JOURNEY);
  const token='s'.repeat(32);
  started=await startHarness({productRoot:f.root,databasePath:path.join(f.root,'db.sqlite'),
    migrationsDirectory:path.join(productRoot,'harness/migrations'),backupDirectory:path.join(f.root,'backups'),
    artifactRoot:path.join(f.root,'artifacts'),releaseIdentityHash:IDENTITY,schedulerIntervalMs:0,
    workerToken:token,security:{serviceToken:token,allowedClients:['127.0.0.1']},host:'127.0.0.1',port:0});
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const mcpPort=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  mcp=spawn(path.join(productRoot,'runtime/node-v20.20.2-win-x64/node.exe'),['mcp/src/server.cjs'],{
    cwd:productRoot,windowsHide:true,stdio:['ignore','ignore','ignore'],env:{...process.env,
      HENGZHUN_MCP_HOST:'127.0.0.1',HENGZHUN_MCP_PORT:String(mcpPort),HENGZHUN_MCP_TOKEN:token,
      HENGZHUN_SERVICE_TOKEN:token,HENGZHUN_HARNESS_URL:`http://127.0.0.1:${started.server.address().port}`,HENGZHUN_NAMESPACE:NAMESPACE}});
  let ready=false;const deadline=Date.now()+20000;
  while(Date.now()<deadline){assert.equal(mcp.exitCode,null);try{ready=(await fetch(`http://127.0.0.1:${mcpPort}/health`)).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready);client=await connectMcpRuntime({url:`http://127.0.0.1:${mcpPort}/mcp`,token});
  let bound='journey-bootstrap-rf064';const events=[{type:'SESSION_STARTED'}],sessionId=`session-${'b'.repeat(32)}`;
  const store={async create(){},async list(){return [];},async load(){return {sessionId,journeyId:bound,status:'ACTIVE',events};},
    async rebindJourney(_,__,value){assert.equal(value.expectedJourneyId,bound);bound=value.journeyId;},async appendEvent(_,__,event){events.push(event);}};
  const cli=createProductionService({sessionStore:store,releaseIdentityHash:IDENTITY,mcpClient:client,namespace:NAMESPACE,writeGate:async()=>{},
    modelConfig:{apiKey:'test-only',baseURL:'http://model.invalid/v1',model:'test-only'}});
  const create=()=>cli.scheduleCreate({sessionId,journeyId:JOURNEY,cronExpression:'* * * * *',timezone:'Asia/Shanghai'});
  const schedule=await create();assert.equal(schedule.scriptHash,hash);assert.equal(schedule.maxRetries,0);
  assert.equal((await create()).scheduleId,schedule.scheduleId);
  assert.equal(db.prepare('SELECT count(*) AS n FROM schedules').get().n,1);
  const row=db.prepare('SELECT * FROM schedules WHERE schedule_id=?').get(schedule.scheduleId);
  assert.equal(row.script_version,1);assert.equal(row.script_sha256,hash);assert.equal(row.max_retries,0);
  const due=new Date(row.next_fire_at);assert.equal((await started.application.service.tickSchedules(due)).queued,1);
  assert.equal((await started.application.service.tickSchedules(due)).queued,0);
  const claim=await started.application.service.claimNextRun('rf064-test-worker');assert.equal(claim.status,'CLAIMED');
  const reportResponse=await fetch(`http://127.0.0.1:${started.server.address().port}/internal/worker/i10/verification:report`,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({namespace:NAMESPACE,
    workerId:'rf064-test-worker',taskRef:claim.taskId,verificationType:'CAPTCHA',policyMode:'EXTERNAL_CONFIRM_REQUIRED',
    detectionSummary:'isolated synthetic verification',userPreparation:'Complete verification in the original browser',
    expiresAt:new Date(Date.now()+60000).toISOString()})});
  assert.equal(reportResponse.status,200);const challenge=await reportResponse.json();
  const challengeStatus=await cli.verificationStatus({challengeId:challenge.challengeId});
  assert.equal(challengeStatus.status,'WAITING_USER_PREPARATION');assert.equal(challengeStatus.taskRef,claim.taskId);
  assert.equal(challengeStatus.userPreparation,undefined);
  const readyChallenge=await cli.verificationDecide({sessionId,challengeId:challenge.challengeId,revision:1,decision:'USER_READY'});
  assert.equal(readyChallenge.status,'WAITING_USER_ACTION');
  await assert.rejects(cli.verificationDecide({sessionId,challengeId:challenge.challengeId,revision:1,decision:'USER_ACTION_COMPLETED'}),e=>e.code==='I10_VERIFICATION_VERSION_CONFLICT');
  const confirmedChallenge=await cli.verificationDecide({sessionId,challengeId:challenge.challengeId,revision:2,decision:'USER_ACTION_COMPLETED'});
  assert.equal(confirmedChallenge.status,'VERIFICATION_CONFIRMED');
  const resumeResponse=await fetch(`http://127.0.0.1:${started.server.address().port}/internal/worker/i10/verification:resume`,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({namespace:NAMESPACE,challengeId:challenge.challengeId,workerId:'rf064-test-worker'})});
  assert.equal(resumeResponse.status,200);assert.equal((await resumeResponse.json()).status,'RESUMED');
  assert.equal(db.prepare('SELECT task_ref FROM i10_verification_challenges WHERE challenge_id=?').get(challenge.challengeId).task_ref,claim.taskId);
  assert.equal(db.prepare('SELECT count(*) n FROM runs WHERE origin_schedule_id=?').get(schedule.scheduleId).n,1);
  const completed=await started.application.service.completeRun(claim.taskId,{workerId:'rf064-test-worker',leaseVersion:claim.leaseVersion,
    outcome:'FAILED',summary:'isolated RF064 environment failure',errorCode:'RF064_TEST_ENV_FAILURE',errorCategory:'ENVIRONMENT',retryable:true,userActionRequired:true,
    evidence:[{artifactType:'DIAGNOSTIC',mediaType:'application/json',redactionStatus:'REDACTED',extension:'json',
      base64Content:Buffer.from('{"testOnly":true}').toString('base64'),metadata:{containsCredentials:false}}]});
  const paused=await cli.scheduleStatus({scheduleId:schedule.scheduleId});assert.equal(paused.status,'PAUSED_FAILURE');
  assert.equal(paused.pausedIncidentId,completed.incidentId);assert.equal(paused.lastExecutionStatus,'FAILED');
  const failure=await cli.failureShow({incidentId:completed.incidentId});assert.equal(failure.reasonCode,'RF064_TEST_ENV_FAILURE');
  assert.equal(failure.runId,claim.runId);assert.equal(failure.humanInterventionRequired,true);assert.equal(failure.artifactRefs.length,1);
  assert.equal((await started.application.service.tickSchedules(new Date(due.getTime()+60000))).queued,0);
  assert.equal((await started.application.service.claimNextRun('rf064-test-worker')).status,'EMPTY');
  assert.equal(db.prepare('SELECT retry_count FROM schedule_executions WHERE schedule_id=?').get(schedule.scheduleId).retry_count,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM runs WHERE origin_schedule_id=?').get(schedule.scheduleId).n,1);
  assert.equal((await cli.scheduleDisable({sessionId,scheduleId:schedule.scheduleId,reason:'结束隔离验收'})).status,'DISABLED');
  assert.equal(db.prepare('SELECT status FROM runs WHERE run_id=?').get(claim.runId).status,'FAILED');
  assert.deepEqual(started.application.service.verifyJourneyEvidence(NAMESPACE,JOURNEY),sourceBefore);
});

test('a validated repeat creates a new Journey with the frozen candidate and leaves source evidence intact',async t=>{
  const scriptBinding={scriptId:'script_repeat',scriptVersion:1,scriptHash:'c'.repeat(64)};
  const f=await fixture({candidateId:'candidate_repeat',scriptBinding});await closeFixture(t,f);
  const {db,now,hash}=seedActivatedRepeat(f);
  const input={namespace:NAMESPACE,idempotencyKey:'repeat-test-request',sessionRef:'session-repeat',
    interactionContractVersion:'v6',requestIntent:'CASE_AUTHORING',inputType:'NONE',supportingImages:[],validatedJourneyId:JOURNEY};
  const sourceBefore=f.service.verifyJourneyEvidence(NAMESPACE,JOURNEY);
  const repeated=await f.service.repeatValidatedJourney(input,{requestId:'repeat-test-request'});
  assert.notEqual(repeated.journeyId,JOURNEY);
  assert.equal(repeated.stage,'NEEDS_INPUT');assert.equal(repeated.references.candidateId,'candidate_repeat');
  assert.equal(repeated.references.planId,'plan_rf046');assert.equal(repeated.references.validatedJourneyId,JOURNEY);
  assert.equal(repeated.references.runId,undefined);assert.equal(repeated.references.taskId,undefined);
  const same=await f.service.repeatValidatedJourney(input,{requestId:'repeat-test-retry'});
  assert.equal(same.journeyId,repeated.journeyId);
  assert.deepEqual(f.service.verifyJourneyEvidence(NAMESPACE,JOURNEY),sourceBefore);
  const proposed=await f.service.i10.submitJourneyInput({namespace:NAMESPACE,idempotencyKey:'repeat-input',journeyId:repeated.journeyId,
    expectedVersion:repeated.version,inputKind:'EXECUTION_PLAN',normalizedInput:{mode:'ON_DEMAND'},submissionRef:'repeat-input'}, {requestId:'repeat-input'});
  const confirmed=await f.service.i10.decideJourney({namespace:NAMESPACE,idempotencyKey:'repeat-decision',journeyId:repeated.journeyId,
    expectedVersion:proposed.version,decision:proposed.proposal.proceedDecision,proposalId:proposed.proposal.proposalId,
    payloadHash:proposed.proposal.payloadHash,payload:proposed.proposal.payload,confirmationRef:'repeat-decision'},{requestId:'repeat-decision'});
  const runInput={namespace:NAMESPACE,idempotencyKey:'repeat-run',preparationId:repeated.references.preparationId,
    journeyId:repeated.journeyId,confirmedDecisionEventId:confirmed.references.confirmedDecisionEventId,credentialAlias:'test-fixture'};
  const submitted=await f.service.submitI8Run(runInput,{requestId:'repeat-run'});
  const repeatedRun=submitted.response.runId,repeatedTask=submitted.response.taskId;
  assert.notEqual(repeatedRun,RUN);assert.notEqual(repeatedTask,TASK);assert.equal(submitted.response.scriptHash,hash);
  assert.equal((await f.service.submitI8Run(runInput,{requestId:'repeat-run-replay'})).response.runId,repeatedRun);
  db.prepare("UPDATE tasks SET status='SUCCEEDED',progress=100,completed_at=? WHERE task_id=?").run(now,repeatedTask);
  db.prepare("UPDATE runs SET status='PASSED',started_at=?,completed_at=? WHERE run_id=?").run(now,now,repeatedRun);
  const artifactIds=[];
  for(const kind of ['DOM','SCREENSHOT','TRACE','NETWORK','LEDGER']){
    const artifact=await f.service.artifacts.create({namespace:NAMESPACE,runId:repeatedRun,taskId:repeatedTask,
      artifactType:kind==='SCREENSHOT'?'SCREENSHOT':kind==='TRACE'?'TRACE':'JSON',mediaType:'application/json',
      redactionStatus:'REDACTED',extension:'json',content:Buffer.from(`repeat-${kind}`),metadata:{evidenceKind:kind}});
    artifactIds.push(artifact.artifactId);
  }
  db.prepare("INSERT INTO audit_events(event_id,namespace,run_id,task_id,actor_type,action,object_type,object_id,outcome,correlation_id,details_json,created_at) VALUES ('evt_repeat',?,?,?,'WORKER','run.complete','RUN',?,'SUCCEEDED','corr_repeat',?,?)")
    .run(NAMESPACE,repeatedRun,repeatedTask,repeatedRun,JSON.stringify({outcome:'PASSED',artifactIds}),now);
  db.prepare("UPDATE i10_interaction_journeys SET stage='COMPLETED',status='COMPLETED',references_json=? WHERE journey_id=?")
    .run(JSON.stringify({...repeated.references,runId:repeatedRun,taskId:repeatedTask}),repeated.journeyId);
  const proof=f.service.verifyReleaseCaseEvidence('A06',NAMESPACE,repeated.journeyId);
  assert.equal(proof.sourceJourneyId,JOURNEY);assert.equal(proof.sourceRunId,RUN);
  assert.equal(proof.runId,repeatedRun);assert.equal(proof.taskId,repeatedTask);assert.equal(proof.scriptHash,hash);
  assert.equal(proof.sameFrozenScript,true);
  db.prepare('UPDATE tasks SET payload_json=? WHERE task_id=?').run(JSON.stringify({...scriptBinding,scriptHash:'f'.repeat(64)}),TASK);
  await assert.rejects(f.service.repeatValidatedJourney({...input,idempotencyKey:'repeat-wrong-executed-script'}, {requestId:'repeat-wrong-executed-script'}),e=>e.errorCode==='I10_REPEAT_SOURCE_NOT_ACTIVATED');
  assert.throws(()=>f.service.verifyReleaseCaseEvidence('A06',NAMESPACE,repeated.journeyId),e=>e.errorCode==='RELEASE_REPEAT_FROZEN_BINDING_INVALID');
  db.prepare('UPDATE tasks SET payload_json=? WHERE task_id=?').run(JSON.stringify(scriptBinding),TASK);
  db.prepare("UPDATE scripts SET status='RETIRED' WHERE script_id='script_repeat'").run();
  await assert.rejects(f.service.repeatValidatedJourney({...input,idempotencyKey:'repeat-retired'},{requestId:'repeat-retired'}),e=>e.errorCode==='I10_REPEAT_SOURCE_NOT_ACTIVATED');
});

test('Harness verifies exact terminal Journey artifact bytes including quarantined evidence', async t => {
  const f = await fixture()
  await closeFixture(t, f)
  const result = f.service.verifyJourneyEvidence(NAMESPACE, JOURNEY)
  assert.equal(result.verdict, 'VERIFIED')
  assert.deepEqual(result.requiredKinds, ['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER'])
  assert.equal(result.artifacts.length, 5)
  assert.ok(result.artifacts.every(item => item.sha256Verified && item.sizeVerified))
  assert.doesNotMatch(JSON.stringify(result), /(?:relativePath|href|token|credential|content)/i)
})

test('Harness fails closed for missing evidence kind', async t => {
  const f = await fixture({ omitKind: 'TRACE' })
  await closeFixture(t, f)
  assert.throws(() => f.service.verifyJourneyEvidence(NAMESPACE, JOURNEY), error => error.errorCode === 'I10_EVIDENCE_KIND_MISSING')
})

test('human locator feedback is immutable, persists across restart and never becomes verified by recording',async t=>{
  const {FUXING_BANK_OPERATIONS_ADAPTER}=require('../../dist/harness/src/i8/target-adapter-registry.js');
  const f=await expectedFailureFixture(t,{planExtra:{fixtureProfile:'OPERATIONS_DOCUMENT_STATUS',targetProfileSnapshot:{adapterBinding:FUXING_BANK_OPERATIONS_ADAPTER}}});let db=f.database.connection;
  db.prepare("UPDATE failure_incidents SET classification='LOCATOR' WHERE incident_id='incident_rf057'").run();
  const input={namespace:NAMESPACE,incidentId:'incident_rf057',confirmationRef:'feedback-test-confirmation',
    correction:{type:'TARGET_MAPPING',targetRef:'DOCUMENT.STATUS',locator:{kind:'TEST_ID',value:'document-status'}}};
  const before=db.prepare('SELECT status,payload_json FROM tasks WHERE task_id=?').get(TASK);
  const result=await f.service.recordFeedback(input);assert.equal(result.status,'PENDING_VERIFICATION');
  assert.equal((await f.service.recordFeedback(input)).feedbackId,result.feedbackId);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM reviewed_feedback').get().count,1);
  await assert.rejects(f.service.recordFeedback({...input,correction:{...input.correction,locator:{kind:'TEST_ID',value:'another'}}}),e=>e.errorCode==='FEEDBACK_CONFIRMATION_CONFLICT');
  await assert.rejects(f.service.recordFeedback({...input,confirmationRef:'unknown-target-confirmation',correction:{...input.correction,targetRef:'TRANSFER.AMOUNT'}}),e=>e.errorCode==='FEEDBACK_TARGET_NOT_IN_SOURCE');
  await assert.rejects(f.service.recordFeedback({...input,namespace:'other-namespace'}),e=>e.errorCode==='FEEDBACK_FAILED_LOCATOR_SOURCE_REQUIRED');
  db.prepare('UPDATE runs SET release_identity_hash=? WHERE run_id=?').run('f'.repeat(64),RUN);
  await assert.rejects(f.service.recordFeedback(input),e=>e.errorCode==='FEEDBACK_SOURCE_IDENTITY_MISMATCH');
  db.prepare('UPDATE runs SET release_identity_hash=? WHERE run_id=?').run(IDENTITY,RUN);
  db.prepare("UPDATE runs SET status='PASSED' WHERE run_id=?").run(RUN);
  await assert.rejects(f.service.recordFeedback(input),e=>e.errorCode==='FEEDBACK_FAILED_LOCATOR_SOURCE_REQUIRED');
  db.prepare("UPDATE runs SET status='FAILED' WHERE run_id=?").run(RUN);
  const {feedbackRecordSchema}=require('../../dist/harness/src/feedback.js');
  for(const extra of [{amount:'100.00'},{expectedText:'已成功'},{rationale:'skip assertion'}])assert.equal(feedbackRecordSchema.safeParse({...input,correction:{...input.correction,...extra}}).success,false);
  assert.equal(feedbackRecordSchema.safeParse({...input,correction:{...input.correction,locator:{kind:'LABEL',value:'Bearer test-secret'}}}).success,false);
  assert.throws(()=>db.prepare("UPDATE reviewed_feedback SET correction_json='{}' WHERE feedback_id=?").run(result.feedbackId),/FEEDBACK_SOURCE_IMMUTABLE/);
  assert.deepEqual(db.prepare('SELECT status,payload_json FROM tasks WHERE task_id=?').get(TASK),before);
  await f.database.close();
  f.database=await HarnessDatabase.open({databasePath:path.join(f.root,'db.sqlite'),migrationsDirectory:path.join(productRoot,'harness/migrations'),backupDirectory:path.join(f.root,'backups')});
  f.service=new HarnessService(f.database,path.join(f.root,'artifacts'),f.root,IDENTITY);db=f.database.connection;
  assert.equal((await f.service.recordFeedback(input)).feedbackId,result.feedbackId);
  const persisted=db.prepare('SELECT * FROM reviewed_feedback WHERE feedback_id=?').get(result.feedbackId);
  assert.equal(persisted.status,'PENDING_VERIFICATION');assert.equal(persisted.verification_journey_id,null);
  assert.deepEqual(JSON.parse(persisted.adapter_binding_json),FUXING_BANK_OPERATIONS_ADAPTER);
  assert.equal(db.prepare('SELECT status FROM runs WHERE run_id=?').get(RUN).status,'FAILED');
});

test('Harness fails closed for artifact byte tamper and release identity drift', async t => {
  const tampered = await fixture()
  await closeFixture(t, tampered)
  const metadata = tampered.service.artifacts.getMetadata(NAMESPACE, tampered.artifactIds[0])
  fs.writeFileSync(path.join(tampered.root, 'artifacts', ...metadata.relativePath.split('/')), 'tampered')
  assert.throws(() => tampered.service.verifyJourneyEvidence(NAMESPACE, JOURNEY), error => error.errorCode === 'ARTIFACT_HASH_MISMATCH')

  const stale = await fixture({ runIdentity: 'f'.repeat(64) })
  await closeFixture(t, stale)
  assert.throws(() => stale.service.verifyJourneyEvidence(NAMESPACE, JOURNEY), error => error.errorCode === 'I10_EVIDENCE_RELEASE_IDENTITY_MISMATCH')
})

async function feedbackVerificationFixture(t,{changeGoal=false,differentCorrection=false,planExtra={},dslVersion='HENGZHUN_DSL_V1',assertionCorrection=false,omitAssertionExecution=false,assertionOperation='expectText'}={}) {
  const {FUXING_BANK_OPERATIONS_ADAPTER}=require('../../dist/harness/src/i8/target-adapter-registry.js');
  const {canonicalJson,sha256}=require('../../dist/harness/src/utils.js');
  const f=await expectedFailureFixture(t,{planExtra:{fixtureProfile:'OPERATIONS_DOCUMENT_STATUS',targetProfileSnapshot:{adapterBinding:FUXING_BANK_OPERATIONS_ADAPTER},...planExtra},dslVersion,assertionOperation});
  const db=f.database.connection,now=new Date().toISOString();
  if(!assertionCorrection)db.prepare("UPDATE failure_incidents SET classification='LOCATOR' WHERE incident_id='incident_rf057'").run();
  const correction=assertionCorrection?{type:'ASSERTION_IMPLEMENTATION',stepId:'dsl_02',implementation:assertionOperation==='expectEqual'?'EXACT_EQUAL':'EXACT_TEXT'}:
    {type:'TARGET_MAPPING',targetRef:'DOCUMENT.STATUS',locator:{kind:'TEST_ID',value:'document-status'}};
  const feedback=await f.service.recordFeedback({namespace:NAMESPACE,incidentId:'incident_rf057',confirmationRef:'verification-feedback',correction});
  const verifiedJourney='journey_22222222-2222-4222-8222-222222222222',verifiedRun='run_feedback_verified',verifiedTask='task_feedback_verified';
  const originalDsl=JSON.parse(db.prepare("SELECT dsl_json FROM i8_script_candidates WHERE candidate_id='candidate_rf057'").get().dsl_json);
  const implementations=assertionCorrection?{dsl_02:correction.implementation}:{};
  const script=assertionCorrection?require('../../dist/harness/src/i8/script-package-builder.js').generatedSource(originalDsl,
    {'DOCUMENT.STATUS':{kind:'TEST_ID',value:'document-status'},'COMPARISON.STATUS':{kind:'TEST_ID',value:'comparison-status'}},{'EXPECTED.STATUS':'草稿'},{},{},omitAssertionExecution?{}:implementations):
    'module.exports = { testOnly: true };';
  const manifest=canonicalJson({testOnly:true,...(assertionCorrection?{assertionImplementations:implementations}:{})}),scriptHash=sha256(script);
  const relativeDirectory='candidate-fixture-repair';fs.mkdirSync(path.join(f.root,relativeDirectory));
  fs.writeFileSync(path.join(f.root,relativeDirectory,'script.cjs'),script);fs.writeFileSync(path.join(f.root,relativeDirectory,'manifest.json'),manifest);
  const repairedDsl=structuredClone(originalDsl);if(changeGoal)repairedDsl.steps[0].expectedTextRef='CHANGED.EXPECTED';
  const patch={schemaVersion:'i8-script-patch-proposal-v1',operations:[differentCorrection?
    assertionCorrection?{...correction,stepId:'dsl_03'}:{...correction,locator:{kind:'TEST_ID',value:'other-status'}}:correction],rationale:'test-only human correction'};
  // Explicit synthetic ledger rows exercise domain verification, not browser execution.
  function insert(table,row){const columns=Object.keys(row);db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(row));}
  insert('i8_failure_incidents',{incident_id:'incident_rf057',namespace:NAMESPACE,classification:assertionCorrection?'ASSERTION':'LOCATOR',disposition:'PATCH_ALLOWED',status:'RESOLVED',created_at:now,updated_at:now});
  insert('i8_step_failure_envelopes',{envelope_id:'envelope_feedback',namespace:NAMESPACE,incident_id:'incident_rf057',stage:'FORMAL_RUN',context_level:'CTX-L1',envelope_json:'{}',envelope_hash:'a'.repeat(64),attempt_count:0,max_attempts:3,created_at:now,updated_at:now});
  insert('i8_script_patch_proposals',{proposal_id:'patch_feedback',namespace:NAMESPACE,incident_id:'incident_rf057',envelope_id:'envelope_feedback',base_candidate_id:'candidate_rf057',repair_candidate_id:'candidate_feedback_repair',attempt_no:1,
    patch_json:canonicalJson(patch),patch_hash:sha256(canonicalJson(patch)),script_id:'script_rf057',script_version:2,dsl_json:canonicalJson(repairedDsl),dsl_hash:sha256(canonicalJson(repairedDsl)),generator_version:'test-only',relative_directory:relativeDirectory,script_sha256:scriptHash,manifest_json:manifest,manifest_sha256:sha256(manifest),source_chain_hash:'c'.repeat(64),status:'ACTIVATED',version:2,created_at:now,updated_at:now});
  insert('i8_repair_stability_batches',{batch_id:'batch_feedback',namespace:NAMESPACE,proposal_id:'patch_feedback',repair_candidate_id:'candidate_feedback_repair',status:'PASSED',version:1,created_at:now,updated_at:now});
  insert('i8_repair_stability_certificates',{certificate_id:'cert_feedback',namespace:NAMESPACE,proposal_id:'patch_feedback',batch_id:'batch_feedback',repair_candidate_id:'candidate_feedback_repair',script_sha256:scriptHash,runtime_fingerprint:'d'.repeat(64),validation_run_ids_json:'[]',assertion_set_hash:'e'.repeat(64),evidence_set_hash:'f'.repeat(64),status:'PASSED',issued_at:now});
  insert('i8_repair_decisions',{decision_id:'decision_feedback',namespace:NAMESPACE,proposal_id:'patch_feedback',expected_proposal_version:1,choice:'ACTIVATE',reason:'test-only',confirmation_ref:'repair-confirmation-feedback',activated_plan_id:'plan_rf046',created_at:now});
  insert('i10_interaction_journeys',{journey_id:verifiedJourney,namespace:NAMESPACE,session_ref:'session-feedback',idempotency_key:'feedback-journey',request_intent:'CASE_AUTHORING',input_type:'NONE',stage:'COMPLETED',status:'COMPLETED',input_envelope_json:'{}',missing_fields_json:'[]',allowed_actions_json:'[]',next_action_json:'{}',references_json:JSON.stringify({runId:verifiedRun,taskId:verifiedTask}),progress_json:'{}',version:1,recoverable:1,created_at:now,updated_at:now});
  insert('tasks',{task_id:verifiedTask,namespace:NAMESPACE,task_type:'RUN_EXECUTE',status:'SUCCEEDED',progress:100,case_id:'case_rf046',run_id:verifiedRun,payload_json:JSON.stringify({scriptId:'script_rf057',scriptVersion:2,scriptHash}),version:1,created_at:now,updated_at:now,completed_at:now});
  insert('runs',{run_id:verifiedRun,namespace:NAMESPACE,case_id:'case_rf046',case_version:1,plan_id:'plan_rf046',task_id:verifiedTask,status:'PASSED',version:1,created_at:now,started_at:now,completed_at:now,journey_id:verifiedJourney,release_identity_hash:IDENTITY,candidate_id:'candidate_feedback_repair'});
  const artifactIds=[];
  for(const kind of ['DOM','SCREENSHOT','TRACE','NETWORK','LEDGER']){
    const artifact=await f.service.artifacts.create({namespace:NAMESPACE,runId:verifiedRun,taskId:verifiedTask,artifactType:kind==='SCREENSHOT'?'SCREENSHOT':kind==='TRACE'?'TRACE':'JSON',mediaType:'application/json',redactionStatus:'REDACTED',extension:'json',content:`test-only-verified-${kind}`,metadata:{evidenceKind:kind}});artifactIds.push(artifact.artifactId);
  }
  insert('audit_events',{event_id:'evt_feedback_verified',namespace:NAMESPACE,run_id:verifiedRun,task_id:verifiedTask,actor_type:'WORKER',action:'run.complete',object_type:'RUN',object_id:verifiedRun,outcome:'SUCCEEDED',correlation_id:'corr_feedback_verified',details_json:JSON.stringify({outcome:'PASSED',artifactIds}),created_at:now});
  return {...f,db,feedback,verifiedJourney,verifiedRun,verifiedTask,script,scriptHash,relativeDirectory,artifactIds,
    input:{namespace:NAMESPACE,feedbackId:feedback.feedbackId,verificationJourneyId:verifiedJourney}};
}

test('assertion feedback binds the exact failed report and requires actual unchanged-goal execution before promotion',async t=>{
  const f=await feedbackVerificationFixture(t,{assertionCorrection:true});
  const correction={type:'ASSERTION_IMPLEMENTATION',stepId:'dsl_02',implementation:'EXACT_TEXT'};
  const input={namespace:NAMESPACE,incidentId:'incident_rf057',confirmationRef:'assertion-feedback-copy',correction};
  const recorded=await f.service.recordFeedback(input);assert.equal(recorded.status,'PENDING_VERIFICATION');
  assert.equal((await f.service.recordFeedback(input)).feedbackId,recorded.feedbackId);
  await assert.rejects(f.service.recordFeedback({...input,confirmationRef:'wrong-step-feedback',correction:{...correction,stepId:'dsl_99'}}),e=>e.errorCode==='FEEDBACK_ASSERTION_IMPLEMENTATION_MISMATCH');
  await assert.rejects(f.service.recordFeedback({...input,confirmationRef:'wrong-mode-feedback',correction:{...correction,implementation:'EXACT_EQUAL'}}),e=>e.errorCode==='FEEDBACK_ASSERTION_IMPLEMENTATION_MISMATCH');
  const {feedbackRecordSchema,matchReviewedLocators}=require('../../dist/harness/src/feedback.js');
  assert.equal(feedbackRecordSchema.safeParse({...input,correction:{...correction,implementation:'BOUNDED_VISIBLE'}}).success,false);
  assert.equal(feedbackRecordSchema.safeParse({...input,correction:{...correction,expectedText:'已成功'}}).success,false);
  f.db.prepare("UPDATE failure_incidents SET classification='LOCATOR' WHERE incident_id='incident_rf057'").run();
  await assert.rejects(f.service.recordFeedback(input),e=>e.errorCode==='FEEDBACK_FAILED_ASSERTION_SOURCE_REQUIRED');
  f.db.prepare("UPDATE failure_incidents SET classification='ASSERTION' WHERE incident_id='incident_rf057'").run();
  const result=await f.service.verifyFeedback(f.input);assert.equal(result.status,'VERIFIED');
  const equality=await feedbackVerificationFixture(t,{assertionCorrection:true,assertionOperation:'expectEqual'});
  assert.equal((await equality.service.verifyFeedback(equality.input)).status,'VERIFIED');
  assert.equal((await f.service.verifyFeedback(f.input)).deduplicated,true);
  const source=f.db.prepare(`SELECT f.*,p.plan_json FROM reviewed_feedback f JOIN i8_executable_plans p ON p.executable_plan_id='executable_rf057' WHERE f.feedback_id=?`).get(f.feedback.feedbackId);
  assert.equal(matchReviewedLocators(JSON.parse(source.plan_json),NAMESPACE,IDENTITY,[source]).size,0);
  assert.deepEqual(f.service.getFeedback(NAMESPACE,f.feedback.feedbackId).consumptions,[]);
  assert.equal(f.db.prepare('SELECT status FROM runs WHERE run_id=?').get(RUN).status,'FAILED');
  for(const options of [{omitAssertionExecution:true},{changeGoal:true},{differentCorrection:true}]) {
    const bad=await feedbackVerificationFixture(t,{assertionCorrection:true,...options});
    await assert.rejects(bad.service.verifyFeedback(bad.input),e=>e.errorCode===
      (options.omitAssertionExecution?'FEEDBACK_ASSERTION_EXECUTION_REQUIRED':'FEEDBACK_CORRECTION_OR_GOAL_CHANGED'));
    assert.equal(bad.service.getFeedback(NAMESPACE,bad.feedback.feedbackId).status,'PENDING_VERIFICATION');
  }
});

test('assertion feedback refuses a frozen step that is not the reported failed step',async t=>{
  const {FUXING_BANK_OPERATIONS_ADAPTER}=require('../../dist/harness/src/i8/target-adapter-registry.js');
  const f=await expectedFailureFixture(t,{failedStep:'dsl_99',planExtra:{fixtureProfile:'OPERATIONS_DOCUMENT_STATUS',targetProfileSnapshot:{adapterBinding:FUXING_BANK_OPERATIONS_ADAPTER}}});
  await assert.rejects(f.service.recordFeedback({namespace:NAMESPACE,incidentId:'incident_rf057',confirmationRef:'wrong-report-step-feedback',
    correction:{type:'ASSERTION_IMPLEMENTATION',stepId:'dsl_02',implementation:'EXACT_TEXT'}}),e=>e.errorCode==='FEEDBACK_ASSERTION_REPORT_MISMATCH');
  assert.equal(f.database.connection.prepare('SELECT count(*) n FROM reviewed_feedback').get().n,0);
});

test('candidate DSL version migration preserves populated old records, references and immutable protections',async t=>{
  const oldMigrations=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-feedback-old-migrations-'));
  t.after(()=>fs.rmSync(oldMigrations,{recursive:true,force:true}));
  const currentMigrations=path.join(productRoot,'harness/migrations');
  for(const name of fs.readdirSync(currentMigrations).filter(name=>/^\d+_.+\.sql$/.test(name)&&Number(name.split('_')[0])<=42))
    fs.copyFileSync(path.join(currentMigrations,name),path.join(oldMigrations,name));
  const f=await expectedFailureFixture(t,{migrationsDirectory:oldMigrations,dslSchemaVersion:'HENGZHUN_DSL_V2'});
  const before=f.database.connection.prepare("SELECT * FROM i8_script_candidates WHERE candidate_id='candidate_rf057'").get();
  const now=new Date().toISOString();
  f.database.connection.prepare(`INSERT INTO i8_stability_batches(batch_id,namespace,candidate_id,status,version,created_at,updated_at)
    VALUES ('batch_upgrade',?,'candidate_rf057','QUEUED',1,?,?)`).run(NAMESPACE,now,now);
  await f.database.close();
  f.database=await HarnessDatabase.open({databasePath:path.join(f.root,'db.sqlite'),migrationsDirectory:currentMigrations,backupDirectory:path.join(f.root,'backups')});
  const db=f.database.connection,after=db.prepare("SELECT * FROM i8_script_candidates WHERE candidate_id='candidate_rf057'").get();
  assert.equal(before.dsl_version,'HENGZHUN_DSL_V1');assert.equal(after.dsl_version,'HENGZHUN_DSL_V2');
  assert.deepEqual({...before,dsl_version:after.dsl_version},after);
  assert.equal(db.prepare("SELECT candidate_id FROM i8_stability_batches WHERE batch_id='batch_upgrade'").get().candidate_id,'candidate_rf057');
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
  assert.throws(()=>db.prepare("UPDATE i8_script_candidates SET dsl_json='{}' WHERE candidate_id='candidate_rf057'").run(),/I8_SCRIPT_CANDIDATE_IMMUTABLE/);
  assert.throws(()=>db.prepare("DELETE FROM i8_script_candidates WHERE candidate_id='candidate_rf057'").run(),/I8_SCRIPT_CANDIDATE_IMMUTABLE/);
  const expectedVersions=fs.readdirSync(currentMigrations).filter(name=>/^\d+_.+\.sql$/.test(name))
    .map(name=>Number(name.split('_')[0])).sort((a,b)=>a-b);
  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row=>row.version),expectedVersions);
  assert.equal(f.database.migrationStatus().appliedVersion,Math.max(...expectedVersions));
});

for(const assertionCorrection of [false,true])test(`authoring matches only verified scoped experience and proves completed candidate consumption (${assertionCorrection?'assertion':'locator'})`,async t=>{
  const {canonicalJson,sha256}=require('../../dist/harness/src/utils.js');
  const {matchReviewedLocators,matchReviewedAssertions}=require('../../dist/harness/src/feedback.js');
  const matchExperience=assertionCorrection?matchReviewedAssertions:matchReviewedLocators;
  const {executableActionPlanSchema}=require('../../dist/harness/src/i8/stage3-schemas.js');
  const {buildMidscenePrompt}=require('../../dist/harness/src/context-envelope.js');
  const action={actionId:'action_document',ordinal:1,operation:'expectText',instruction:'核对文档状态为草稿',expected:'草稿',
    pageSignature:{routePatternRef:'OPS_DOCUMENTS',landmarkRef:'DOCUMENT.STATUS',requiredAriaRefs:[]},
    semanticTargetRef:'DOCUMENT.STATUS',fixtureRefs:['EXPECTED.STATUS'],preconditions:[],invariants:['业务预期不变'],postconditions:[],
    riskLevel:'LOW',retryPolicy:{maximumRetries:0,sideEffectFree:true},branchRules:[],failureExit:'FAIL_ACTION',
    evidencePolicy:'FACTS_AND_SCREENSHOT',sourceIntentStepId:'intent_document'};
  const f=await feedbackVerificationFixture(t,{assertionCorrection,dslVersion:'HENGZHUN_DSL_V2',planExtra:{fixtureProfile:'GENERIC_WEB',actions:[action]}});
  const original=JSON.parse(f.db.prepare("SELECT plan_json FROM i8_executable_plans WHERE executable_plan_id='executable_rf057'").get().plan_json);
  const plan=executableActionPlanSchema.parse({...original,schemaVersion:'hengzhun-executable-action-plan-v2',executablePlanId:'executable_consumer',
    caseId:'case_rf046',caseVersion:2,intentPlanHash:'d'.repeat(64),planVersion:1,
    targetProfileSnapshot:{...original.targetProfileSnapshot,launchUrl:'http://127.0.0.1:18083/ops/documents'}});
  const source=()=>f.db.prepare(`SELECT f.*,ep.plan_json,c.dsl_json FROM reviewed_feedback f JOIN runs r ON r.run_id=f.source_run_id
    JOIN i8_script_candidates c ON c.candidate_id=r.candidate_id JOIN i8_executable_plans ep ON ep.executable_plan_id=c.executable_plan_id`).get();
  assert.equal(matchExperience(plan,NAMESPACE,IDENTITY,[source()]).size,0);
  await f.service.verifyFeedback(f.input);
  const row=source(),before=canonicalJson(plan),locator={kind:'TEST_ID',value:'document-status'};
  const hint={feedbackId:f.feedback.feedbackId,...(assertionCorrection?{implementation:'EXACT_TEXT'}:{locator})};
  assert.deepEqual(matchExperience(plan,NAMESPACE,IDENTITY,[row]).get(action.actionId),hint);
  for(const changed of [{namespace:'other-namespace'},{status:'PENDING_VERIFICATION'},{release_identity_hash:'f'.repeat(64)},
    {adapter_binding_json:'{}'},{fixture_profile:'LOGIN_PROFILE'},{dsl_version:'HENGZHUN_DSL_V1'}])
    assert.equal(matchExperience(plan,NAMESPACE,IDENTITY,[{...row,...changed}]).size,0);
  assert.equal(matchExperience({...plan,actions:[{...action,expected:'已发布'}]},NAMESPACE,IDENTITY,[row]).size,0);
  assert.equal(matchExperience({...plan,actions:[{...action,inputValue:'0.01'}]},NAMESPACE,IDENTITY,[row]).size,0);
  assert.equal(matchExperience({...plan,fixtureValues:{'EXPECTED.STATUS':'已发布'}},NAMESPACE,IDENTITY,[row]).size,0);
  if(assertionCorrection)assert.equal(matchExperience(plan,NAMESPACE,IDENTITY,[{...row,dsl_json:JSON.stringify({steps:[{stepId:'dsl_02',sourceActionId:'other_action'}]})}]).size,0);
  else assert.throws(()=>matchReviewedLocators(plan,NAMESPACE,IDENTITY,[row,{...row,feedback_id:'feedback_33333333-3333-4333-8333-333333333333',
    correction_json:canonicalJson({type:'TARGET_MAPPING',targetRef:'DOCUMENT.STATUS',locator:{kind:'TEST_ID',value:'other-status'}})}]),e=>e.errorCode==='FEEDBACK_LOCATOR_CONFLICT');
  assert.equal(canonicalJson(plan),before);
  const now=new Date().toISOString(),planJson=canonicalJson(plan),planHash=sha256(planJson);
  f.db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at)
    VALUES ('case_rf046',2,'{}',?,'TEST',?)`).run('b'.repeat(64),now);
  f.db.prepare(`INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,status,created_at,updated_at)
    VALUES ('prep_feedback_consumer',?,'case_rf046',2,?,'{}','{}','AWAITING_STAGE3',?,?)`).run(NAMESPACE,'d'.repeat(64),now,now);
  f.db.prepare(`INSERT INTO i8_executable_plans(executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,plan_json,plan_hash,status,created_at,updated_at)
    VALUES ('executable_consumer',?,'prep_feedback_consumer','case_rf046',2,?,?,?,'EXECUTABLE_PLAN_READY',?,?)`).run(NAMESPACE,plan.intentPlanHash,planJson,planHash,now,now);
  f.db.prepare(`INSERT INTO i8_candidate_build_jobs(job_id,namespace,executable_plan_id,status,stability_policy_version,version,created_at,updated_at)
    VALUES ('job_feedback_consumer',?,'executable_consumer','QUEUED','I10_2X2_V1',1,?,?)`).run(NAMESPACE,now,now);
  let claimed=await f.service.claimNextI8CandidateBuild('worker-feedback-consumer');
  assert.equal(claimed.jobId,'job_feedback_consumer');assert.deepEqual(claimed.plan,plan);
  assert.deepEqual(claimed.authoringContexts[0].envelope.currentAction[assertionCorrection?'reviewedAssertion':'reviewedLocator'],hint);
  assert.match(buildMidscenePrompt(claimed.authoringContexts[0].envelope),assertionCorrection?/EXACT_TEXT/:/document-status/);
  const stored=f.db.prepare('SELECT envelope_json,envelope_hash FROM i10_authoring_contexts WHERE job_id=?').get(claimed.jobId);
  assert.equal(sha256(canonicalJson(JSON.parse(stored.envelope_json))),stored.envelope_hash);
  assert.deepEqual(f.service.getFeedback(NAMESPACE,f.feedback.feedbackId).consumptions,[]); // Issuance is not consumption.
  const expiredJob=claimed.jobId;
  f.db.prepare('UPDATE i8_candidate_build_jobs SET lease_expires_at=? WHERE job_id=?').run('2000-01-01T00:00:00.000Z',expiredJob);
  await assert.rejects(f.service.completeI8CandidateBuild(expiredJob,{workerId:'worker-feedback-consumer',planHash,
    outcome:'FAILED',errorCode:'TEST_LATE_RESULT',verifiedActionRecords:[]}),e=>e.errorCode==='I8_CANDIDATE_JOB_LEASE_INVALID');
  assert.equal((await f.service.claimNextI8CandidateBuild('worker-recovery')).status,'EMPTY');
  const failed=f.db.prepare('SELECT status,error_code FROM i8_candidate_build_jobs WHERE job_id=?').get(expiredJob);
  assert.deepEqual(failed,{status:'FAILED',error_code:'I10_AUTHORING_LEASE_EXPIRED'});
  assert.deepEqual(f.db.prepare('SELECT envelope_json,envelope_hash FROM i10_authoring_contexts WHERE job_id=?').get(expiredJob),stored);
  assert.deepEqual(f.service.getFeedback(NAMESPACE,f.feedback.feedbackId).consumptions,[]);
  f.db.prepare("UPDATE i8_case_preparations SET intent_plan_json=?,intent_plan_hash=? WHERE preparation_id='prep_feedback_consumer'")
    .run(JSON.stringify({executionProfile:'GENERIC_WEB'}),plan.intentPlanHash);
  const resumed=await f.service.compileI8Candidate({namespace:NAMESPACE,idempotencyKey:'feedback-explicit-resume',
    preparationId:'prep_feedback_consumer',expectedPreparationVersion:1,stabilityPolicyVersion:'I10_2X2_V1',retryFailed:true},{requestId:'feedback-explicit-resume'});
  assert.equal(resumed.response.retriedFromJobId,expiredJob);
  claimed=await f.service.claimNextI8CandidateBuild('worker-feedback-consumer');
  assert.equal(claimed.jobId,resumed.response.jobId);assert.notEqual(claimed.jobId,expiredJob);
  assert.notEqual(claimed.authoringContexts[0].envelopeHash,stored.envelope_hash);
  assert.deepEqual(claimed.authoringContexts[0].envelope.currentAction[assertionCorrection?'reviewedAssertion':'reviewedLocator'],hint);
  // Synthetic authenticated Worker facts prove the Harness contract, not real model/browser execution.
  const locatorHash=sha256(canonicalJson(locator)),context=claimed.authoringContexts[0];
  const record={schemaVersion:'hengzhun-verified-action-record-v3',executablePlanId:plan.executablePlanId,actionId:action.actionId,
    ordinal:1,outcome:'VERIFIED_PASSED',locator,pageSignatureHash:sha256(canonicalJson(action.pageSignature)),factsHash:'e'.repeat(64),
    ...(assertionCorrection?{assertionImplementation:'EXACT_TEXT'}:{}),
    verification:{dom:true,url:true,request:true,business:true},contextLevel:context.contextLevel,contextEnvelopeHash:context.envelopeHash,
    visualEvidence:{invocation:'REAL',provider:'MIDSCENE',role:'LOCATOR_PROPOSAL',model:'test-only',
      promptHash:sha256(buildMidscenePrompt(context.envelope)),locatorMatched:true,screenshotHash:'a'.repeat(64),proposalHash:'b'.repeat(64),playwrightLocatorHash:locatorHash},
    playwrightEvidence:{role:'EXECUTOR',locatorHash,operation:action.operation,domPassed:true,urlPassed:true,requestPassed:true,businessPassed:true},verifiedAt:now};
  await assert.rejects(f.service.completeI8CandidateBuild(claimed.jobId,{workerId:'worker-feedback-consumer',planHash,
    outcome:'VERIFIED_PASSED',verifiedActionRecords:[{...record,contextEnvelopeHash:'f'.repeat(64)}]}),e=>e.errorCode==='I10_LOCATE_EXECUTE_EVIDENCE_REQUIRED');
  await assert.rejects(f.service.completeI8CandidateBuild(claimed.jobId,{workerId:'worker-feedback-consumer',planHash,
    outcome:'VERIFIED_PASSED',verifiedActionRecords:[{...record,locator:{kind:'TEST_ID',value:'unverified-control'}}]}),e=>e.errorCode==='I10_LOCATE_EXECUTE_EVIDENCE_REQUIRED');
  assert.deepEqual(f.service.getFeedback(NAMESPACE,f.feedback.feedbackId).consumptions,[]);
  await assert.rejects(f.service.completeI8CandidateBuild(claimed.jobId,{workerId:'worker-feedback-consumer',planHash,
    outcome:'VERIFIED_PASSED',verifiedActionRecords:[{...record,assertionImplementation:assertionCorrection?undefined:'EXACT_TEXT'}]}),e=>e.errorCode==='I10_ASSERTION_EXPERIENCE_EVIDENCE_REQUIRED');
  if(assertionCorrection)await assert.rejects(f.service.completeI8CandidateBuild(claimed.jobId,{workerId:'worker-feedback-consumer',planHash,
    outcome:'VERIFIED_PASSED',verifiedActionRecords:[{...record,assertionImplementation:'EXACT_EQUAL'}]}),e=>e.errorCode==='I10_ASSERTION_EXPERIENCE_EVIDENCE_REQUIRED');
  await f.service.completeI8CandidateBuild(claimed.jobId,{workerId:'worker-feedback-consumer',planHash,
    outcome:'VERIFIED_PASSED',verifiedActionRecords:[record]});
  const candidate=f.db.prepare('SELECT * FROM i8_script_candidates WHERE executable_plan_id=?').get(plan.executablePlanId);
  assert.equal(candidate.dsl_version,'HENGZHUN_DSL_V2');assert.equal(candidate.status,'GENERATED');
  assert.equal(JSON.parse(candidate.dsl_json).steps[0].expectedTextRef,'EXPECTED.STATUS');
  if(assertionCorrection){
    const manifest=JSON.parse(candidate.manifest_json);
    assert.deepEqual(manifest.reviewedAssertionApplications,{action_document:{...hint,stepId:'dsl_01'}});
    assert.deepEqual(manifest.assertionImplementations,{dsl_01:'EXACT_TEXT'});
    const source=fs.readFileSync(path.join(f.root,candidate.relative_directory,'script.cjs'),'utf8');
    const embedded=JSON.parse(source.match(/^const PACKAGE = Object\.freeze\((.*)\)$/m)[1]);
    assert.deepEqual(embedded.assertionImplementations,{dsl_01:'EXACT_TEXT'});
    assert.equal(embedded.fixtures['EXPECTED.STATUS'],'草稿');
  }
  assert.deepEqual(f.service.getFeedback(NAMESPACE,f.feedback.feedbackId).consumptions,[{jobId:claimed.jobId,actionId:action.actionId,candidateId:candidate.candidate_id}]);
  assert.throws(()=>f.db.prepare("UPDATE i8_script_candidates SET dsl_version='HENGZHUN_DSL_V1' WHERE candidate_id=?").run(candidate.candidate_id),/I8_SCRIPT_CANDIDATE_IMMUTABLE/);
  assert.deepEqual(f.db.pragma('foreign_key_check'),[]);
  assert.equal(f.db.prepare('SELECT status FROM runs WHERE run_id=?').get(RUN).status,'FAILED');
});

test('feedback promotion requires exact activated repair, unchanged goal and current complete artifact bytes',async t=>{
  const f=await feedbackVerificationFixture(t);
  const payload=f.db.prepare('SELECT payload_json FROM tasks WHERE task_id=?').get(f.verifiedTask).payload_json;
  f.db.prepare('UPDATE tasks SET payload_json=? WHERE task_id=?').run(JSON.stringify({scriptId:'script_rf057',scriptVersion:2,scriptHash:'a'.repeat(64)}),f.verifiedTask);
  await assert.rejects(f.service.verifyFeedback(f.input),e=>e.errorCode==='FEEDBACK_VERIFIED_REPAIR_REQUIRED');
  f.db.prepare('UPDATE tasks SET payload_json=? WHERE task_id=?').run(payload,f.verifiedTask);
  f.db.prepare("UPDATE i8_script_patch_proposals SET status='WAITING_USER' WHERE proposal_id='patch_feedback'").run();
  await assert.rejects(f.service.verifyFeedback(f.input),e=>e.errorCode==='FEEDBACK_VERIFIED_REPAIR_REQUIRED');
  f.db.prepare("UPDATE i8_script_patch_proposals SET status='ACTIVATED' WHERE proposal_id='patch_feedback'").run();
  fs.writeFileSync(path.join(f.root,f.relativeDirectory,'script.cjs'),'tampered');
  await assert.rejects(f.service.verifyFeedback(f.input),e=>e.errorCode==='FEEDBACK_REPAIR_ARTIFACT_INVALID');
  fs.writeFileSync(path.join(f.root,f.relativeDirectory,'script.cjs'),f.script);
  f.db.prepare('UPDATE runs SET release_identity_hash=? WHERE run_id=?').run('f'.repeat(64),f.verifiedRun);
  await assert.rejects(f.service.verifyFeedback(f.input),e=>e.errorCode==='I10_EVIDENCE_RELEASE_IDENTITY_MISMATCH');
  f.db.prepare('UPDATE runs SET release_identity_hash=? WHERE run_id=?').run(IDENTITY,f.verifiedRun);
  const artifact=f.service.artifacts.getMetadata(NAMESPACE,f.artifactIds[0]);
  const artifactPath=path.join(f.root,'artifacts',...artifact.relativePath.split('/'));
  fs.writeFileSync(artifactPath,'tampered-evidence');
  await assert.rejects(f.service.verifyFeedback(f.input),e=>e.errorCode==='ARTIFACT_HASH_MISMATCH');
  fs.writeFileSync(artifactPath,'test-only-verified-DOM');
  assert.equal(f.db.prepare('SELECT status FROM reviewed_feedback WHERE feedback_id=?').get(f.feedback.feedbackId).status,'PENDING_VERIFICATION');
  const result=await f.service.verifyFeedback(f.input);assert.equal(result.status,'VERIFIED');assert.equal(result.verificationRunId,f.verifiedRun);
  assert.equal((await f.service.verifyFeedback(f.input)).deduplicated,true);
  await assert.rejects(f.service.verifyFeedback({...f.input,verificationJourneyId:JOURNEY}),e=>e.errorCode==='FEEDBACK_VERIFICATION_CONFLICT');
  assert.equal(f.db.prepare('SELECT status FROM runs WHERE run_id=?').get(RUN).status,'FAILED');
  const changed=await feedbackVerificationFixture(t,{changeGoal:true});
  await assert.rejects(changed.service.verifyFeedback(changed.input),e=>e.errorCode==='FEEDBACK_CORRECTION_OR_GOAL_CHANGED');
  const other=await feedbackVerificationFixture(t,{differentCorrection:true});
  await assert.rejects(other.service.verifyFeedback(other.input),e=>e.errorCode==='FEEDBACK_CORRECTION_OR_GOAL_CHANGED');
});

for(const assertionCorrection of [false,true])test(`feedback CLI through real MCP and authenticated Harness records, replays, verifies and reads SQLite state (${assertionCorrection?'assertion':'locator'})`,async t=>{
  const cleanups=[];let started,mcp,client;
  t.after(async()=>{
    await client?.close();if(mcp?.exitCode===null){mcp.kill();await new Promise(resolve=>mcp.once('exit',resolve));}
    if(started){await new Promise(resolve=>started.server.close(resolve));await started.application.close();}
    for(const cleanup of cleanups)await cleanup();
  });
  const f=await feedbackVerificationFixture({after:cleanup=>cleanups.push(cleanup)},{assertionCorrection});
  const {startHarness}=require('../../dist/harness/src/server.js'),{spawn}=require('node:child_process'),net=require('node:net');
  const {connectMcpRuntime}=await import('../../controller/src/runtime-adapters.mjs');
  const {createProductionService}=await import('../../agent-cli/src/production-service.mjs');
  const token='s'.repeat(32);
  started=await startHarness({productRoot:f.root,databasePath:path.join(f.root,'db.sqlite'),migrationsDirectory:path.join(productRoot,'harness/migrations'),
    backupDirectory:path.join(f.root,'backups'),artifactRoot:path.join(f.root,'artifacts'),releaseIdentityHash:IDENTITY,schedulerIntervalMs:0,
    security:{serviceToken:token,allowedClients:['127.0.0.1']},host:'127.0.0.1',port:0});
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  mcp=spawn(path.join(productRoot,'runtime/node-v20.20.2-win-x64/node.exe'),['mcp/src/server.cjs'],{cwd:productRoot,windowsHide:true,stdio:['ignore','ignore','ignore'],env:{...process.env,
    HENGZHUN_MCP_HOST:'127.0.0.1',HENGZHUN_MCP_PORT:String(port),HENGZHUN_MCP_TOKEN:token,HENGZHUN_SERVICE_TOKEN:token,
    HENGZHUN_HARNESS_URL:`http://127.0.0.1:${started.server.address().port}`,HENGZHUN_NAMESPACE:NAMESPACE}});
  let ready=false;const deadline=Date.now()+20000;
  while(Date.now()<deadline){assert.equal(mcp.exitCode,null);try{ready=(await fetch(`http://127.0.0.1:${port}/health`)).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready);client=await connectMcpRuntime({url:`http://127.0.0.1:${port}/mcp`,token});
  const sessionId=`session-${'b'.repeat(32)}`,sessionStore={async create(){},async list(){return [];},async load(){return {sessionId,status:'ACTIVE',events:[]};}};
  const cli=createProductionService({sessionStore,releaseIdentityHash:IDENTITY,mcpClient:client,namespace:NAMESPACE,writeGate:async()=>{},
    modelConfig:{apiKey:'test-only',baseURL:'http://model.invalid/v1',model:'test-only'}});
  const correction=assertionCorrection?{type:'ASSERTION_IMPLEMENTATION',stepId:'dsl_02',implementation:'EXACT_TEXT'}:
    {type:'TARGET_MAPPING',targetRef:'DOCUMENT.STATUS',locator:{kind:'TEST_ID',value:'document-status'}};
  const input={sessionId,incidentId:'incident_rf057',correction};
  const recorded=await cli.feedbackRecord(input);assert.equal(recorded.status,'PENDING_VERIFICATION');
  const replayed=await cli.feedbackRecord(input);assert.equal(replayed.feedbackId,recorded.feedbackId);assert.equal(replayed.deduplicated,true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM reviewed_feedback').get().n,2); // One source fixture plus one CLI record.
  const denied=await fetch(`http://127.0.0.1:${started.server.address().port}/v1/feedback:get`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({namespace:NAMESPACE,feedbackId:recorded.feedbackId})});
  assert.equal(denied.status,401);
  const verified=await cli.feedbackVerify({sessionId,feedbackId:recorded.feedbackId,verificationJourneyId:f.verifiedJourney});assert.equal(verified.status,'VERIFIED');
  const shown=await cli.feedbackShow({feedbackId:recorded.feedbackId});assert.equal(shown.status,'VERIFIED');assert.deepEqual(shown.correction,correction);
  assert.equal(shown.verificationJourneyId,f.verifiedJourney);assert.equal(shown.sourceRunId,RUN);
  assert.equal(f.db.prepare('SELECT status FROM runs WHERE run_id=?').get(RUN).status,'FAILED');
  assert.equal(f.db.prepare('SELECT status FROM reviewed_feedback WHERE feedback_id=?').get(recorded.feedbackId).status,'VERIFIED');
});
