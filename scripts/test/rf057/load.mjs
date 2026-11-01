export function cents(value) {
  const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if(!match)throw new Error('INVALID_DECIMAL_MONEY');
  return (match[1]? -1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));
}

export function summarize(samples,elapsedMs) {
  const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b);
  const percentile=p=>sorted.length?sorted[Math.ceil(sorted.length*p)-1]:null;
  const failed=samples.filter(x=>!x.ok).length;
  return {samples,attempted:samples.length,completed:samples.length,failed,
    timeouts:samples.filter(x=>x.timeout).length,inFlight:0,elapsedMs,
    completedPerSecond:samples.length/(elapsedMs/1000),
    errorRate:samples.length?failed/samples.length:0,
    p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),
    p99SampleCount:samples.length,loadModel:'CLOSED_LOOP',
    statusCounts:Object.fromEntries([...new Set(samples.map(x=>String(x.status||'TRANSPORT_ERROR')))]
      .map(key=>[key,samples.filter(x=>String(x.status||'TRANSPORT_ERROR')===key).length]))};
}

export async function runLoad({concurrency,durationMs=Infinity,maxRequests=Infinity,request,stopOnFailure=false}) {
  const start=performance.now();let offered=0,stopped=false;
  const samples=[];
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(!stopped&&performance.now()-start<durationMs&&offered<maxRequests){
      const index=offered++;const begin=performance.now();
      try { const result=await request(index);samples.push({ms:performance.now()-begin,...result});if(stopOnFailure&&!result.ok)stopped=true; }
      catch(error){samples.push({ms:performance.now()-begin,ok:false,timeout:['TimeoutError','AbortError'].includes(error.name)});if(stopOnFailure)stopped=true;}
    }
  }));
  const result=summarize(samples,Math.max(.001,performance.now()-start));
  return {...result,offered,concurrency,stoppedEarly:stopped};
}
