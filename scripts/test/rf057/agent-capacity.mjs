import assert from 'node:assert/strict';
import {requireCliSuccess,failureMetadata} from './agent-result.mjs';

/** One admitted read-only batch, with native ledger verification and drained failure evidence. */
export async function executeReadOnlyBatch({concurrency,source,identity,cli,harness,snapshot,checkpoint}) {
    const before=await snapshot();
    const start=performance.now();
    const sessions=[];
    for(let i=0;i<concurrency;i++)sessions.push(requireCliSuccess(await cli(['session','start']),'P05_SESSION').result.sessionId);
    const samples=await Promise.all(sessions.map(async sessionId=>{
      const started=performance.now();
      let phase='P05_REPEAT',binding={sessionId};
      try {
        const value=requireCliSuccess(await cli(['journey','execute',source.journeyId,'--session',sessionId,'--repeat','--jsonl']),phase).result;
        binding={...binding,journeyId:value.journeyId,runId:value.runId,taskId:value.taskId};
        assert.equal(value.status,'PASSED');
        phase='P05_LEDGER';
        const proof=await harness('/v1/releases:verify',{caseId:'P05',journeyId:value.journeyId});
        assert.equal(proof.verdict,'VERIFIED');assert.equal(proof.releaseIdentityHash,identity);
        assert.equal(proof.sameFrozenScript,true);assert.equal(proof.sourceJourneyId,source.journeyId);
        assert.equal(proof.sourceRunId,source.runId);assert.equal(proof.runId,value.runId);assert.equal(proof.taskId,value.taskId);
        const {createdAt,startedAt,completedAt,queueMs,executionMs}=proof.timing;
        assert.ok(Number.isFinite(queueMs)&&queueMs>=0&&Number.isFinite(executionMs)&&executionMs>=0);
        return {...binding,status:'PASSED',candidateId:proof.candidateId,scriptHash:proof.scriptHash,
          createdAt,startedAt,completedAt,queueMs,executionMs,wallMs:performance.now()-started,artifacts:proof.artifacts};
      }catch(error){return {...binding,status:'FAILED',wallMs:performance.now()-started,...failureMetadata(error,phase)};}
    }));
    const stage={concurrency,offered:concurrency,completed:samples.length,elapsedMs:performance.now()-start,samples};
    // Checkpoint before any further readback: even a failed read must retain drained task failures.
    await checkpoint(stage);
    const after=await snapshot();stage.coreObservations={before,after};
    await checkpoint(stage);
    assert.deepEqual(after,before,'RF057_P05_MONEY_ACTION_OBSERVED');
    assert.ok(samples.every(s=>s.status==='PASSED'),'RF057_P05_TASK_FAILED');
    assert.ok(Math.max(...samples.map(s=>Date.parse(s.createdAt)))<=Math.min(...samples.map(s=>Date.parse(s.completedAt))),
      'RF057_P05_ADMISSION_NOT_CONCURRENT');
    return stage;
}

/** The formal P05 remains exactly seven samples at the three declared levels. */
export async function executeAgentCapacity({source,identity,cli,harness,snapshot,checkpoint}) {
  const stages=[];
  for(const concurrency of [1,2,4]) {
    await executeReadOnlyBatch({concurrency,source,identity,cli,harness,snapshot,checkpoint:async stage=>{
      if(stages.at(-1)!==stage)stages.push(stage);
      await checkpoint({sourceJourneyId:source.journeyId,sourceRunId:source.runId,stages});
    }});
  }
  const all=stages.flatMap(s=>s.samples);
  for(const field of ['journeyId','runId','taskId','sessionId'])assert.equal(new Set(all.map(s=>s[field])).size,7,'RF057_P05_BINDING_REUSED');
  assert.ok(all.every(s=>s.journeyId!==source.journeyId&&s.runId!==source.runId),'RF057_P05_SOURCE_REUSED');
  return {sourceJourneyId:source.journeyId,sourceRunId:source.runId,stages,noMoneyMovement:true};
}
