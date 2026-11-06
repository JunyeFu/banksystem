import assert from 'node:assert/strict';
import os from 'node:os';
import {executeReadOnlyBatch} from './agent-capacity.mjs';
import {summarize} from './load.mjs';
import {failureMetadata} from './agent-result.mjs';

const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const samples=stage=>stage.batches.flatMap(batch=>batch.samples);
function measure(stage){
  const all=samples(stage),timed=all.filter(sample=>Number.isFinite(sample.executionMs)&&Number.isFinite(sample.queueMs));
  stage.offered=stage.batches.reduce((sum,batch)=>sum+batch.offered,0);stage.completed=all.length;
  stage.passed=all.filter(sample=>sample.status==='PASSED').length;stage.failed=all.length-stage.passed;
  stage.timingSamples=timed.length;
  stage.executionP95Ms=summarize(timed.map(sample=>({ms:sample.executionMs,ok:sample.status==='PASSED'})),1).p95Ms;
  stage.queueP95Ms=summarize(timed.map(sample=>({ms:sample.queueMs,ok:sample.status==='PASSED'})),1).p95Ms;
}

/** Supplemental N09 measurements; this does not register extra cases or decide release GO. */
export async function executeReadOnlyCapacity({source,identity,cli,harness,snapshot,readStatus,checkpoint,
  now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const report={schemaVersion:'rf064-readonly-capacity/v1',releaseIdentityHash:identity,sourceJourneyId:source.journeyId,
    sourceRunId:source.runId,status:'RUNNING',publicationDecision:'NOT_EVALUATED',
    environment:{platform:os.platform(),architecture:os.arch(),release:os.release(),cpuCount:os.availableParallelism(),totalMemoryBytes:os.totalmem()},
    fixed:{requested:100,concurrency:2,maximumElapsedMs:3600000,minimumPassed:99,batches:[]},levels:[],
    observation:{requiredDurationMs:7200000,intervalMs:60000,samples:[]}};
  measure(report.fixed);
  let phase='FIXED_READONLY_CAPACITY';const all=[];
  const preserve=()=>checkpoint(report);
  const batch=async(stage,count)=>{
    let admitted;
    await executeReadOnlyBatch({concurrency:count,source,identity,cli,harness,snapshot,checkpoint:async value=>{
      if(admitted!==value){admitted=value;stage.batches.push(value);}measure(stage);await preserve();
    }});
    all.push(...admitted.samples);
    for(const field of ['journeyId','runId','taskId','sessionId']){
      if(new Set(all.map(sample=>sample[field])).size!==all.length)fail('RF064_CAPACITY_BINDING_REUSED');
    }
    if(all.some(sample=>sample.journeyId===source.journeyId||sample.runId===source.runId))fail('RF064_CAPACITY_SOURCE_REUSED');
    if(new Set(all.map(sample=>sample.candidateId)).size!==1||new Set(all.map(sample=>sample.scriptHash)).size!==1)
      fail('RF064_CAPACITY_SCRIPT_CHANGED');
  };
  try{
    const fixedStart=now();
    while(report.fixed.completed!==100){
      if(now()-fixedStart>=3600000)fail('RF064_FIXED_CAPACITY_DEADLINE');
      await batch(report.fixed,2);report.fixed.elapsedMs=now()-fixedStart;await preserve();report.fixed.elapsedMs=now()-fixedStart;
      if(report.fixed.elapsedMs>3600000)fail('RF064_FIXED_CAPACITY_DEADLINE');
    }
    assert(report.fixed.passed>=99);
    phase='AGENT_READONLY_CAPACITY';
    for(const concurrency of [1,2,4]){
      const stage={concurrency,requested:10,batches:[]};measure(stage);report.levels.push(stage);const started=now();
      while(stage.completed!==10)await batch(stage,Math.min(concurrency,10-stage.completed));
      stage.elapsedMs=now()-started;await preserve();
      if(stage.executionP95Ms>180000)fail('RF064_AGENT_EXECUTION_P95');
    }
    phase='PLATFORM_READONLY_OBSERVATION';
    const before=await snapshot(),observationStart=now();
    for(;;){
      let status;
      try{status=await readStatus();}catch(error){
        report.observation.elapsedMs=now()-observationStart;
        report.observation.samples.push({elapsedMs:report.observation.elapsedMs,healthy:false,...failureMetadata(error,phase)});
        throw error;
      }
      const elapsedMs=now()-observationStart;
      report.observation.samples.push({elapsedMs,...status});report.observation.elapsedMs=elapsedMs;await preserve();
      if(!status.healthy)fail('RF064_PLATFORM_NOT_HEALTHY');
      if(elapsedMs>=7200000)break;
      await wait(Math.min(60000,7200000-elapsedMs));
    }
    const after=await snapshot();report.observation.coreObservations={before,after};
    assert.deepEqual(after,before,'RF064_OBSERVATION_MONEY_ACTION_OBSERVED');
    report.status='PASSED';await preserve();return report;
  }catch(error){
    report.status='FAILED';report.failure=failureMetadata(error,phase);await preserve();throw error;
  }
}
