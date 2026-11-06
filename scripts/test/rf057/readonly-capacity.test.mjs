import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {executeReadOnlyCapacity} from './readonly-capacity.mjs';

function fixture({failAt=0,reuse=false,slowAt=0,observationFailure=0,advancePerTask=0}={}){
  let sessions=0,executions=0,finished=0,clock=0,observations=0;const checkpoints=[];
  const source={journeyId:'source',runId:'source-run'},identity='a'.repeat(64);
  const money={source:{balanceCents:'10000',transactionIds:['1']},target:{balanceCents:'20000',transactionIds:['2']}};
  const cli=async args=>{
    if(args[0]==='session')return {code:0,terminal:{result:{sessionId:`session-${++sessions}`}}};
    assert.deepEqual(args.slice(0,3),['journey','execute','source']);assert(args.includes('--repeat'));
    const i=++executions;clock+=advancePerTask;await Promise.resolve();finished++;
    if(i===failAt)return {code:4,terminal:{messageCode:'EXPECTED_CAPACITY_FAILURE'}};
    const id=reuse&&i>2?i-2:i;
    return {code:0,terminal:{result:{status:'PASSED',journeyId:`journey-${id}`,runId:`run-${id}`,taskId:`task-${id}`}}};
  };
  const harness=async(route,body)=>{
    assert.equal(route,'/v1/releases:verify');assert.equal(body.caseId,'P05');
    const i=Number(body.journeyId.split('-')[1]),executionMs=i===slowAt?180001:20;
    return {verdict:'VERIFIED',releaseIdentityHash:identity,sameFrozenScript:true,sourceJourneyId:source.journeyId,
      sourceRunId:source.runId,runId:`run-${i}`,taskId:`task-${i}`,candidateId:'candidate',scriptHash:'b'.repeat(64),artifacts:[],
      timing:{createdAt:'2026-11-06T00:00:00.000Z',startedAt:'2026-11-06T00:00:00.010Z',
        completedAt:new Date(Date.parse('2026-11-06T00:00:00.010Z')+executionMs).toISOString(),queueMs:10,executionMs}};
  };
  return {deps:{source,identity,cli,harness,snapshot:async()=>structuredClone(money),now:()=>clock,
    wait:async ms=>{clock+=ms;},readStatus:async()=>({healthy:++observations!==observationFailure,services:[]}),
    checkpoint:async value=>checkpoints.push(structuredClone(value))},checkpoints,
    counts:()=>({sessions,executions,finished,observations,clock})};
}

test('supplement executes 100 fixed repeats and 10 independent tasks at each level, then observes two hours',async()=>{
  const f=fixture(),result=await executeReadOnlyCapacity(f.deps);
  assert.equal(result.status,'PASSED');assert.equal(result.fixed.completed,100);assert.equal(result.fixed.concurrency,2);
  assert.deepEqual(result.levels.map(stage=>[stage.concurrency,stage.completed]),[[1,10],[2,10],[4,10]]);
  assert.deepEqual(result.levels.map(stage=>stage.executionP95Ms),[20,20,20]);
  assert.deepEqual(result.levels.map(stage=>stage.queueP95Ms),[10,10,10]);
  assert.equal(result.observation.elapsedMs,7200000);assert.equal(result.observation.samples.length,121);
  assert.deepEqual(f.counts(),{sessions:130,executions:130,finished:130,observations:121,clock:7200000});
  assert.equal(result.publicationDecision,'NOT_EVALUATED');
});
test('first failed repeat drains admitted peers and seals the reason without further admission',async()=>{
  const f=fixture({failAt:1});await assert.rejects(executeReadOnlyCapacity(f.deps));
  assert.equal(f.counts().executions,2);assert.equal(f.counts().finished,2);assert.equal(f.counts().observations,0);
  const sealed=f.checkpoints.at(-1);assert.equal(sealed.status,'FAILED');
  assert.equal(sealed.fixed.batches[0].samples[0].errorCode,'EXPECTED_CAPACITY_FAILURE');
});
test('session startup failure seals zero admitted work and its original dependency code',async()=>{
  const f=fixture();f.deps.cli=async()=>({code:3,terminal:{messageCode:'SYNTHETIC_DEPENDENCY_UNAVAILABLE'}});
  await assert.rejects(executeReadOnlyCapacity(f.deps));
  const last=f.checkpoints.at(-1);assert.equal(last.fixed.completed,0);assert.equal(last.fixed.offered,0);
  assert.equal(last.failure.errorCode,'SYNTHETIC_DEPENDENCY_UNAVAILABLE');assert.equal(last.failure.exitCode,3);
});
test('reused cross-batch bindings cannot count toward the hundred tasks',async()=>{
  const f=fixture({reuse:true});await assert.rejects(executeReadOnlyCapacity(f.deps),/RF064_CAPACITY_BINDING_REUSED/);
  assert.equal(f.counts().executions,4);assert.equal(f.checkpoints.at(-1).status,'FAILED');
});
test('fixed regression elapsed deadline stops admission and keeps completed samples',async()=>{
  const f=fixture({advancePerTask:1000000});await assert.rejects(executeReadOnlyCapacity(f.deps),/RF064_FIXED_CAPACITY_DEADLINE/);
  assert.equal(f.counts().executions,4);assert.equal(f.checkpoints.at(-1).fixed.completed,4);
});
test('execution percentile is distinct from queue time and enforces 180 seconds at each Agent level',async()=>{
  const f=fixture({slowAt:101});await assert.rejects(executeReadOnlyCapacity(f.deps),/RF064_AGENT_EXECUTION_P95/);
  assert.equal(f.counts().executions,110);assert.equal(f.checkpoints.at(-1).levels[0].executionP95Ms,180001);
});
test('unhealthy observation is retained and is not retried or restarted',async()=>{
  const f=fixture({observationFailure:3});await assert.rejects(executeReadOnlyCapacity(f.deps),/RF064_PLATFORM_NOT_HEALTHY/);
  const last=f.checkpoints.at(-1);assert.equal(last.status,'FAILED');assert.equal(f.counts().observations,3);
  assert.equal(last.observation.samples.at(-1).healthy,false);assert.equal(last.observation.elapsedMs,120000);
});
test('a failed status read retains its actual sampling time and error instead of the last healthy timestamp',async()=>{
  const f=fixture();let observed=0;
  f.deps.readStatus=async()=>{
    if(++observed===3){const error=new Error('synthetic health failure');error.code='SYNTHETIC_HEALTH_FAILURE';throw error;}
    return {healthy:true};
  };
  await assert.rejects(executeReadOnlyCapacity(f.deps),/synthetic health failure/);
  const last=f.checkpoints.at(-1);assert.equal(last.observation.elapsedMs,120000);
  assert.equal(last.observation.samples.at(-1).errorCode,'SYNTHETIC_HEALTH_FAILURE');
});
test('public capacity profile selects the existing readonly Agent setup and cleanup rather than golden transfer',()=>{
  const source=fs.readFileSync(new URL('../rf057-bank.ps1',import.meta.url),'utf8');
  assert(source.includes("elseif($Profile -eq 'ReadOnlyCapacity'){@('--readonly-capacity')}"));
  assert(source.includes("$family=if($Profile -in @('Agent','AgentPerformance','ReadOnlyCapacity')){'rf057-agent'}"));
  assert(source.includes("$entry=if($Profile -in @('Agent','AgentPerformance','ReadOnlyCapacity')){'rf057-agent.mjs'}"));
  assert(source.includes("if($Profile -eq 'Agent'){$bankSampleIdentities=@(New-BankSampleIdentities)}"));
  assert.equal((source.match(/@\('Agent','AgentPerformance','ReadOnlyCapacity','Authentication'\)/g)||[]).length,2);
});
test('supplement is an evidence artifact of A01 and cannot add a P05 pass or a release decision',()=>{
  const source=fs.readFileSync(new URL('../rf057-agent.mjs',import.meta.url),'utf8');
  assert(source.includes("capacityOnly?['A01']:performanceOnly?['A01','P05']"));
  const branch=source.slice(source.indexOf('if(capacityOnly){'),source.indexOf('}else if(performanceOnly){'));
  assert(branch.includes('executeReadOnlyCapacity'));assert(branch.includes('lifecycle.managedStatus'));
  assert(!/runCase\(|doctor|startManaged|stopManaged|prepareBankValidationPool/.test(branch));
  assert(!branch.includes("decision:'GO'"));
});
