import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, runLoad, cents } from './load.mjs';

test('includes failures and timeouts in denominators and latency samples', () => {
  const result = summarize([{ms:10,ok:true},{ms:20,ok:true},{ms:100,ok:false,timeout:true}],1000);
  assert.equal(result.attempted,3);
  assert.equal(result.completed,3);
  assert.equal(result.failed,1);
  assert.equal(result.timeouts,1);
  assert.equal(result.p95Ms,100);
  assert.equal(result.completedPerSecond,3);
  assert.equal(result.errorRate,1/3);
});

test('money uses exact cents and rejects fractional cents', () => {
  assert.equal(cents('123456789012345.67'),12345678901234567n);
  assert.equal(cents('0.01')+cents('0.02'),3n);
  assert.throws(()=>cents('1.001'));
});

test('bounded load drains all started requests and counts thrown requests', async () => {
  let calls=0;
  const result = await runLoad({concurrency:2,maxRequests:7,request:async()=>{
    const n=++calls;
    if(n===3)throw Object.assign(new Error('timeout'),{name:'TimeoutError'});
    return {ok:true};
  }});
  assert.equal(calls,7);
  assert.equal(result.attempted,7);
  assert.equal(result.failed,1);
  assert.equal(result.timeouts,1);
  assert.equal(result.inFlight,0);
});

test('money load stops offering work after failure and drains in-flight requests',async()=>{
  const r=await runLoad({concurrency:1,maxRequests:20,stopOnFailure:true,request:async()=>({ok:false,status:500})});
  assert.equal(r.offered,1);assert.equal(r.failed,1);assert.equal(r.inFlight,0);
});
