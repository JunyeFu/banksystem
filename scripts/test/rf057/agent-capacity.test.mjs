import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAgentCapacity} from './agent-capacity.mjs';

function fixture({failAt=0,reuse=false}={}){
  let sessions=0,executions=0,finished=0;const checkpoints=[];
  const source={journeyId:'source',runId:'source-run'},identity='a'.repeat(64);
  const money={source:{balanceCents:'10000',transactionIds:['1']},target:{balanceCents:'20000',transactionIds:['2']}};
  const cli=async args=>{
    if(args[0]==='session')return {code:0,terminal:{result:{sessionId:`session-${++sessions}`}}};
    assert.deepEqual(args.slice(0,3),['journey','execute','source']);assert.ok(args.includes('--repeat'));
    const i=++executions;await new Promise(resolve=>setTimeout(resolve,i===failAt?1:10));finished++;
    if(i===failAt)return {code:4,terminal:{messageCode:'EXPECTED_TEST_FAILURE'}};
    return {code:0,terminal:{result:{status:'PASSED',journeyId:`journey-${reuse?1:i}`,runId:`run-${i}`,taskId:`task-${i}`}}};
  };
  const harness=async(route,body)=>{
    assert.equal(body.caseId,'P05');const i=Number(body.journeyId.split('-')[1]);
    return {verdict:'VERIFIED',releaseIdentityHash:identity,runStatus:'PASSED',sameFrozenScript:true,
      sourceJourneyId:'source',sourceRunId:'source-run',runId:`run-${i}`,taskId:`task-${i}`,candidateId:'candidate',scriptHash:'b'.repeat(64),artifacts:[],
      timing:{createdAt:'2026-10-09T00:00:00.000Z',startedAt:'2026-10-09T00:00:00.010Z',completedAt:'2026-10-09T00:00:00.020Z',queueMs:10,executionMs:10}};
  };
  return {deps:{source,identity,cli,harness,snapshot:async()=>structuredClone(money),checkpoint:async f=>checkpoints.push(structuredClone(f))},
    counts:()=>({sessions,executions,finished}),checkpoints};
}
test('P05 repeats exactly seven real entry calls in distinct 1/2/4 batches and retains ledger timing',async()=>{
  const f=fixture(),result=await executeAgentCapacity(f.deps);
  assert.deepEqual(result.stages.map(s=>s.samples.length),[1,2,4]);assert.deepEqual(f.counts(),{sessions:7,executions:7,finished:7});
  assert.ok(result.stages.every(s=>s.samples.every(v=>v.queueMs===10&&v.executionMs===10)));
});
test('failure drains admitted peers, checkpoints reasons and never starts the next level',async()=>{
  const f=fixture({failAt:2});await assert.rejects(executeAgentCapacity(f.deps),/RF057_P05_TASK_FAILED/);
  assert.deepEqual(f.counts(),{sessions:3,executions:3,finished:3});
  const samples=f.checkpoints.at(-1).stages[1].samples;
  assert.equal(samples[0].status,'FAILED');assert.equal(samples[1].status,'PASSED');assert.equal(samples[0].errorCode,'EXPECTED_TEST_FAILURE');
});
test('duplicate Journey binding cannot count as seven tasks',async()=>{
  const f=fixture({reuse:true});await assert.rejects(executeAgentCapacity(f.deps));
});
test('missing actual ledger timestamps fails and seals the failed sample',async()=>{
  const f=fixture();f.deps.harness=async()=>({verdict:'VERIFIED',releaseIdentityHash:f.deps.identity,sameFrozenScript:true,
    sourceJourneyId:'source',sourceRunId:'source-run',runId:'run-1',taskId:'task-1'});
  await assert.rejects(executeAgentCapacity(f.deps),/RF057_P05_TASK_FAILED/);assert.equal(f.counts().executions,1);
});
