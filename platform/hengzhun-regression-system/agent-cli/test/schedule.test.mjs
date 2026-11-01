import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {connectMcpRuntime} from '../../controller/src/runtime-adapters.mjs';
import {createProductionService} from '../src/production-service.mjs';
import {parseCommand} from '../src/contracts.mjs';

const RELEASE='a'.repeat(64),SESSION=`session-${'b'.repeat(32)}`,
  SOURCE='journey_11111111-1111-4111-8111-111111111111',JOURNEY='journey_22222222-2222-4222-8222-222222222222',HASH='c'.repeat(64);
function fixture({sourceIdentity=RELEASE,wrongHash=false,oneTime=false}={}){
  const calls=[],events=[{type:'SESSION_STARTED'}];let bound='journey-bootstrap-test',stage='NEEDS_INPUT',version=1,schedule;
  const plan={mode:oneTime?'ONE_TIME':'RECURRING',...(oneTime?{runAt:'2099-01-01T00:00:00Z'}:{cronExpression:'0 9 * * 1-5'}),
    timezone:'Asia/Shanghai',maxRetries:0,misfirePolicy:oneTime?'RUN_ONCE_WITHIN_GRACE':'SKIP',misfireGraceSeconds:300};
  const refs={validatedJourneyId:SOURCE,preparationId:'prep_test123',confirmedDecisionEventId:'journeyevent_33333333-3333-4333-8333-333333333333',scriptHash:HASH,executionPlan:plan};
  const view=()=>({journeyId:JOURNEY,stage,status:stage==='NEEDS_INPUT'?'NEEDS_INPUT':'COMPLETED',version,references:{...refs,...(schedule?{scheduleId:schedule.scheduleId}:{})},
    nextAction:{type:stage==='COMPLETED'?'CALL_SCHEDULE_CREATE':'INPUT'},proposal:{proposalId:`proposal_${'d'.repeat(32)}`,payloadHash:HASH}});
  const client={async callTool(request){calls.push(structuredClone(request));let value;
    switch(request.name){
      case 'journey_evidence_verify':value={schemaVersion:'hengzhun-cli-evidence-verification/v1',journeyId:SOURCE,verdict:'VERIFIED',releaseIdentityHash:sourceIdentity,runStatus:'PASSED',taskStatus:'SUCCEEDED'};break;
      case 'journey_prepare':value=view();break;
      case 'journey_get':value=view();break;
      case 'journey_input_submit':stage='READY_FOR_EXECUTION_DECISION';version++;value=view();break;
      case 'journey_decision_submit':stage='COMPLETED';version++;value=view();break;
      case 'schedule_create':schedule={scheduleId:'schedule_test123',status:'ACTIVE',version:1,scriptHash:wrongHash?'f'.repeat(64):HASH,maxRetries:0};value=schedule;break;
      case 'schedule_get':value={...schedule,credentialAlias:'do-not-output',fixtureScope:'private-scope'};break;
      case 'schedule_disable':schedule={...schedule,status:'DISABLED',version:schedule.version+1};value=schedule;break;
      case 'failure_get':value={incidentId:request.arguments.incidentId,reasonCode:'CANDIDATE_EXPECT_TEXT_FAILED',classification:'ASSERTION',
        failureEnvelope:{payload:{artifactRefs:['artifact_test123'],inputSummary:{password:'do-not-output'}}}};break;
      case 'feedback_record':value={feedbackId:'feedback_test123',status:'PENDING_VERIFICATION',deduplicated:false};break;
      case 'feedback_verify':value={feedbackId:request.arguments.feedbackId,status:'VERIFIED',verificationJourneyId:request.arguments.verificationJourneyId};break;
      case 'feedback_get':value={feedbackId:request.arguments.feedbackId,status:'PENDING_VERIFICATION'};break;
      default:throw Error(`unexpected test call ${request.name}`);
    }
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }};
  const sessionStore={async create(){},async list(){return [];},async load(){return {sessionId:SESSION,journeyId:bound,status:'ACTIVE',events};},async appendEvent(_,__,event){events.push(event);},
    async rebindJourney(_,__,{expectedJourneyId,journeyId}){assert.equal(expectedJourneyId,bound);bound=journeyId;}};
  const service=createProductionService({sessionStore,releaseIdentityHash:RELEASE,mcpClient:client,namespace:'rf064',writeGate:async()=>{},
    modelConfig:{apiKey:'test-only',baseURL:'http://model.invalid/v1',model:'test-only'}});
  const create=()=>service.scheduleCreate({sessionId:SESSION,journeyId:SOURCE,cronExpression:plan.cronExpression,runAt:plan.runAt,timezone:plan.timezone});
  return {service,calls,events,create,client,sessionStore};
}
test('schedule create uses current passed frozen source and exact MCP execution binding without authoring',async()=>{
  const f=fixture(),value=await f.create();assert.equal(value.status,'ACTIVE');assert.equal(value.maxRetries,0);
  assert.deepEqual(f.calls.map(c=>c.name),['journey_evidence_verify','journey_prepare','journey_get','journey_input_submit','journey_get','journey_decision_submit','journey_get','schedule_create','schedule_get']);
  const submitted=f.calls.find(c=>c.name==='schedule_create').arguments;
  assert.equal(submitted.journeyId,JOURNEY);assert.equal(submitted.maxRetries,0);assert.equal(submitted.scheduleType,'RECURRING');
  assert.equal(value.credentialAlias,undefined);assert.equal(value.fixtureScope,undefined);
  assert.equal((await f.create()).scheduleId,value.scheduleId);assert.equal(f.calls.filter(c=>c.name==='schedule_create').length,1);
});
test('a changed schedule plan cannot reuse the original session and create another schedule',async()=>{
  const f=fixture();await f.create();
  await assert.rejects(f.service.scheduleCreate({sessionId:SESSION,journeyId:SOURCE,cronExpression:'* * * * *',timezone:'Asia/Shanghai'}),e=>e.code==='SCHEDULE_FRESH_SESSION_OR_SAME_REQUEST_REQUIRED');
  assert.equal(f.calls.filter(c=>c.name==='schedule_create').length,1);
});
test('one-time scheduling binds the exact future instant and finite grace with no retry',async()=>{
  const f=fixture({oneTime:true});await f.create();
  const created=f.calls.find(c=>c.name==='schedule_create').arguments;
  assert.equal(created.scheduleType,'ONE_TIME');assert.equal(created.runAt,'2099-01-01T00:00:00Z');
  assert.equal(created.cronExpression,undefined);assert.equal(created.maxRetries,0);assert.equal(created.misfirePolicy,'RUN_ONCE_WITHIN_GRACE');
  assert.equal(f.calls.find(c=>c.name==='journey_decision_submit').arguments.decision,'CREATE_ONE_TIME_SCHEDULE');
});
test('stale source rejects before any state mutation; changed frozen script is rejected after readback',async()=>{
  const stale=fixture({sourceIdentity:'f'.repeat(64)});await assert.rejects(stale.create(),e=>e.code==='SCHEDULE_SOURCE_EVIDENCE_INVALID');
  assert.deepEqual(stale.calls.map(c=>c.name),['journey_evidence_verify']);
  const wrong=fixture({wrongHash:true});await assert.rejects(wrong.create(),e=>e.code==='SCHEDULE_SCRIPT_OR_RETRY_BINDING_INVALID');
});
test('disable explicitly calls the existing optimistic MCP stop and does not repeat a completed stop',async()=>{
  const f=fixture();await f.create();
  assert.equal((await f.service.scheduleDisable({sessionId:SESSION,scheduleId:'schedule_test123',reason:'本轮结束'})).status,'DISABLED');
  await f.service.scheduleDisable({sessionId:SESSION,scheduleId:'schedule_test123',reason:'本轮结束'});
  assert.equal(f.calls.filter(c=>c.name==='schedule_disable').length,1);
});
test('failure show projects reason and evidence references without secret-containing envelope',async()=>{
  const f=fixture(),value=await f.service.failureShow({incidentId:'incident_test123'});
  assert.equal(value.humanInterventionRequired,true);assert.equal(value.reasonCode,'CANDIDATE_EXPECT_TEXT_FAILED');
  assert.deepEqual(value.artifactRefs,['artifact_test123']);assert.ok(!JSON.stringify(value).includes('do-not-output'));
});

test('verification CLI requires explicit version and sends no captcha or free-text payload',async()=>{
  assert.equal(parseCommand(['verification','status','challenge_test123']).kind,'verification-status');
  const command=parseCommand(['verification','confirm','challenge_test123','--session',SESSION,'--revision','2','--jsonl']);
  assert.equal(command.decision,'USER_ACTION_COMPLETED');assert.equal(command.revision,2);
  assert.throws(()=>parseCommand(['verification','confirm','challenge_test123','--session',SESSION,'--jsonl']));
  assert.throws(()=>parseCommand(['verification','confirm','challenge_test123','--session',SESSION,'--revision','2','--code','1234','--jsonl']));
});

test('feedback CLI records structured correction and verifies explicitly without model authoring or direct writes',async()=>{
  assert.equal(parseCommand(['feedback','show','feedback_test123']).kind,'feedback-show');
  assert.equal(parseCommand(['feedback','record','incident_test123','--session',SESSION,'--input-file','correction.json','--jsonl']).kind,'feedback-record');
  assert.equal(parseCommand(['feedback','verify','feedback_test123','--session',SESSION,'--journey',JOURNEY,'--jsonl']).verificationJourneyId,JOURNEY);
  assert.throws(()=>parseCommand(['feedback','record','incident_test123','--session',SESSION,'--jsonl']));
  const f=fixture(),correction={type:'TARGET_MAPPING',targetRef:'DOCUMENT.STATUS',locator:{kind:'TEST_ID',value:'document-status'}};
  assert.equal((await f.service.feedbackRecord({sessionId:SESSION,incidentId:'incident_test123',correction})).status,'PENDING_VERIFICATION');
  await f.service.feedbackRecord({sessionId:SESSION,incidentId:'incident_test123',correction:{locator:correction.locator,targetRef:correction.targetRef,type:correction.type}});
  const records=f.calls.filter(c=>c.name==='feedback_record');assert.equal(records[0].arguments.confirmationRef,records[1].arguments.confirmationRef);
  assert.deepEqual(records[0].arguments.correction,correction);
  await assert.rejects(f.service.feedbackRecord({sessionId:SESSION,incidentId:'incident_test123',correction:{...correction,amount:'100'}}),e=>e.code==='FEEDBACK_CORRECTION_INVALID');
  assert.equal((await f.service.feedbackVerify({sessionId:SESSION,feedbackId:'feedback_test123',verificationJourneyId:JOURNEY})).status,'VERIFIED');
  assert.equal((await f.service.feedbackShow({feedbackId:'feedback_test123'})).status,'PENDING_VERIFICATION');
  assert.ok(f.calls.every(c=>['feedback_record','feedback_verify','feedback_get'].includes(c.name)));
});

test('verification service uses original challenge version, safe projection and MCP decision only',async()=>{
  const f=fixture();let version=1,status='WAITING_USER_PREPARATION';
  f.client.callTool=async request=>{
    f.calls.push(request);let value;
    if(request.name==='verification_get')value={challengeId:'challenge_test123',taskRef:'task_test123',verificationType:'USER_ASSISTED',status,version,userPreparation:'private-input',pageFingerprint:'private-input'};
    else if(request.name==='verification_decision_submit'){
      assert.equal(request.arguments.expectedVersion,version);
      assert.deepEqual(Object.keys(request.arguments).sort(),['challengeId','confirmationRef','decision','expectedVersion','sessionRef'].sort());
      status=request.arguments.decision==='USER_READY'?'WAITING_USER_ACTION':request.arguments.decision==='CANCEL'?'CANCELLED':'VERIFICATION_CONFIRMED';version++;value={status,version};
    }else throw Error(request.name);
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  };
  const ready=await f.service.verificationDecide({sessionId:SESSION,challengeId:'challenge_test123',revision:1,decision:'USER_READY'});
  assert.equal(ready.status,'WAITING_USER_ACTION');assert.ok(!JSON.stringify(ready).includes('private-input'));
  await assert.rejects(f.service.verificationDecide({sessionId:SESSION,challengeId:'challenge_test123',revision:1,decision:'USER_ACTION_COMPLETED'}),e=>e.code==='I10_VERIFICATION_VERSION_CONFLICT');
  assert.equal(f.calls.filter(c=>c.name==='verification_decision_submit').length,1);
  const confirmed=await f.service.verificationDecide({sessionId:SESSION,challengeId:'challenge_test123',revision:2,decision:'USER_ACTION_COMPLETED'});
  assert.equal(confirmed.status,'VERIFICATION_CONFIRMED');assert.equal(confirmed.humanInterventionRequired,false);
  assert.ok(f.calls.every(c=>['verification_get','verification_decision_submit'].includes(c.name)));
});

test('real MCP preserves frozen schedule semantics and routes create/status/disable with no runtime model call',async t=>{
  const f=fixture(),routes=[];
  const routeTools={'/v1/i10/journeys:evidence-verify':'journey_evidence_verify','/v1/i10/journeys:prepare':'journey_prepare',
    '/v1/i10/journeys:get':'journey_get','/v1/i10/journeys:submit-input':'journey_input_submit',
    '/v1/i10/journeys:decide':'journey_decision_submit','/v1/i8/schedules:create':'schedule_create',
    '/v1/i8/schedules:get':'schedule_get','/v1/plugin/schedules:disable':'schedule_disable'};
  const token='s'.repeat(32),root=path.resolve(import.meta.dirname,'../..');
  const harness=http.createServer(async(request,response)=>{
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());routes.push({route:request.url,body});
    assert.equal(request.headers.authorization,`Bearer ${token}`);
    const tool=routeTools[request.url];
    if(!tool){response.writeHead(404);response.end('{}');return;}
    const result=await f.client.callTool({name:tool,arguments:body});
    response.writeHead(200,{'content-type':'application/json'});response.end(result.content[0].text);
  });
  await new Promise(resolve=>harness.listen(0,'127.0.0.1',resolve));
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const mcpPort=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const mcp=spawn(path.join(root,'runtime/node-v20.20.2-win-x64/node.exe'),['mcp/src/server.cjs'],{cwd:root,windowsHide:true,stdio:['ignore','ignore','ignore'],env:{
    ...process.env,HENGZHUN_MCP_HOST:'127.0.0.1',HENGZHUN_MCP_PORT:String(mcpPort),HENGZHUN_MCP_TOKEN:token,
    HENGZHUN_SERVICE_TOKEN:token,HENGZHUN_HARNESS_URL:`http://127.0.0.1:${harness.address().port}`,HENGZHUN_NAMESPACE:'rf064',
  }});
  let client;t.after(async()=>{await client?.close();if(mcp.exitCode===null){mcp.kill();await new Promise(resolve=>mcp.once('exit',resolve));}await new Promise(resolve=>harness.close(resolve));});
  const deadline=Date.now()+20000;let ready=false;
  while(Date.now()<deadline){assert.equal(mcp.exitCode,null);try{ready=(await fetch(`http://127.0.0.1:${mcpPort}/health`)).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'test MCP startup failed');
  client=await connectMcpRuntime({url:`http://127.0.0.1:${mcpPort}/mcp`,token});
  const service=createProductionService({sessionStore:f.sessionStore,releaseIdentityHash:RELEASE,mcpClient:client,namespace:'rf064',writeGate:async()=>{},
    modelConfig:{apiKey:'test-only',baseURL:'http://model.invalid/v1',model:'test-only'}});
  const value=await service.scheduleCreate({sessionId:SESSION,journeyId:SOURCE,cronExpression:'0 9 * * 1-5',timezone:'Asia/Shanghai'});
  assert.equal(value.maxRetries,0);assert.equal(value.scriptHash,HASH);
  const created=routes.find(r=>r.route==='/v1/i8/schedules:create').body;
  assert.equal(created.maxRetries,0);assert.equal(created.misfirePolicy,'SKIP');assert.equal(created.misfireGraceSeconds,300);
  assert.equal((await service.scheduleDisable({sessionId:SESSION,scheduleId:value.scheduleId,reason:'本轮结束'})).status,'DISABLED');
  assert.equal(routes.filter(r=>r.route==='/v1/i8/schedules:create').length,1);
  assert.equal(routes.filter(r=>r.route==='/v1/plugin/schedules:disable').length,1);
});
