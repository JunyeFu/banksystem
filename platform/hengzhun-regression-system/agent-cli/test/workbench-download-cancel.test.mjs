import assert from 'node:assert/strict'
import http from 'node:http'
import {randomUUID,createHash} from 'node:crypto'
import test from 'node:test'
import {startWorkbenchServer} from '../src/workbench-server.mjs'
import {createArtifactProxy} from '../src/workbench-production.mjs'

for(const stage of ['grant','headers','body'])test(`native HTTP disconnect cancels artifact ${stage} wait`,{timeout:5000},async t=>{
  let entered,aborted
  const entry=new Promise(resolve=>{entered=resolve}),cancelled=new Promise(resolve=>{aborted=resolve})
  const bytes=Buffer.from('redacted evidence'),artifactId=`art_${randomUUID()}`
  const downstream=http.createServer((request,response)=>{
    if(stage==='body'){response.writeHead(200,{'content-length':bytes.length});response.write(bytes.subarray(0,1))}
    request.on('close',aborted);entered()
  })
  await new Promise(resolve=>downstream.listen(0,'127.0.0.1',resolve))
  t.after(()=>new Promise(resolve=>{downstream.closeAllConnections();downstream.close(resolve)}))
  const base=`http://127.0.0.1:${downstream.address().port}`
  const download=createArtifactProxy({harnessUrl:base,client:{async callTool(_request,{signal}){
    if(stage==='grant'){
      entered();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted();reject(signal.reason)},{once:true}))
    }
    return {content:[{type:'text',text:JSON.stringify({artifactId,sha256:createHash('sha256').update(bytes).digest('hex'),
      byteSize:bytes.length,displayName:'evidence.txt',href:`${base}/v1/i10/artifacts/download_${randomUUID()}`})}]}
  }}})
  let ended=false
  const server=await startWorkbenchServer({port:0,staticRoot:'.',workbench:{async downloadAgentArtifact(input){
    try{return await download(input)}finally{ended=true}
  }}})
  t.after(()=>server.close())
  const request=http.get(`${server.origin}/api/agent/v1/turns/${randomUUID()}/artifacts/${artifactId}`)
  request.on('error',()=>{})
  await entry;request.destroy();await cancelled
  // The disconnect must end the awaited operation, not merely flip a flag.
  await new Promise(resolve=>setImmediate(resolve))
  for(let i=0;i<30&&!ended;i++)await new Promise(resolve=>setTimeout(resolve,10))
  assert.equal(ended,true)
})
