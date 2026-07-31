#!/usr/bin/env node
'use strict'

const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const fs=require('node:fs')
const path=require('node:path')

const root=path.resolve(__dirname,'..')
const baseUrl=(process.env.HENGZHUN_PUBLIC_BASE_URL||'http://127.0.0.1:18788').replace(/\/$/,'')
const serviceToken=process.env.HENGZHUN_SERVICE_TOKEN
const workerToken=process.env.HENGZHUN_WORKER_TOKEN
assert.ok(serviceToken&&workerToken,'I10_LIVE_INTERNAL_TOKENS_MISSING')
const sha=value=>crypto.createHash('sha256').update(value).digest('hex')

async function post(route,body,token=serviceToken){const response=await fetch(baseUrl+route,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,`${route}:${response.status}:${value.errorCode||'ERROR'}`);return value}
async function waitImage(namespace,imageIngestId){const deadline=Date.now()+4*60_000;while(Date.now()<deadline){const value=await post('/v1/i10/images:get',{namespace,imageIngestId});if(['WAITING_USER','FAILED'].includes(value.status))return value;await new Promise(resolve=>setTimeout(resolve,1000))}throw new Error('I10_IMAGE_LIVE_TIMEOUT')}

async function main(){
  const candidates=fs.readdirSync(path.join(root,'.data/video-ingest'),{withFileTypes:true}).filter(item=>item.isDirectory()).flatMap(item=>{const directory=path.join(root,'.data/video-ingest',item.name,'redacted');return fs.existsSync(directory)?fs.readdirSync(directory).filter(name=>name.endsWith('.png')).map(name=>path.join(directory,name)):[]})
  assert.ok(candidates.length>0,'I10_REDACTED_IMAGE_FIXTURE_MISSING')
  const selected=candidates.sort((a,b)=>fs.statSync(b).size-fs.statSync(a).size)[0]
  const ref='i10-r7-live-image';const filename='case.png';const targetRoot=path.join(root,'.data/flowise-attachments',ref);fs.mkdirSync(targetRoot,{recursive:true});fs.copyFileSync(selected,path.join(targetRoot,filename))
  const namespace=`i10-r7-${Date.now()}`
  const submitted=await post('/v1/i10/images:submit',{namespace,idempotencyKey:`image-${Date.now()}`,sourceRef:'r7-live-natural-language',primaryInputType:'NATURAL_LANGUAGE',images:[{flowiseFileRef:ref,originalFilename:filename,purposeHint:'识别门户成功案例中的可见动作、输入字段、预期结果和验证要求'}],primaryText:'登录复兴银行门户并核对当前用户资料'})
  const image=await waitImage(namespace,submitted.imageIngestId);assert.equal(image.status,'WAITING_USER',JSON.stringify({status:image.status,errorCode:image.errorCode}));assert.equal(image.controllerInvocation?.invocation,'REAL');assert.ok(image.controllerInvocation?.model);assert.ok(image.facts.length>0,'I10_REAL_CONTROLLER_SELECTED_NO_FACTS')
  const reported=await post('/internal/worker/i10/verification:report',{namespace,workerId:'i10-r7-live-probe',taskRef:'i10-r7-verification-probe',verificationType:'UKEY',actionOrdinal:1,detectionSummary:'受控探针模拟页面文字触发U盾协作，不代表物理设备验收',userPreparation:'插入已授权U盾；用户自行处理PIN、物理按键和安全桌面'},workerToken)
  const ready=await post('/v1/i10/verification:decide',{namespace,idempotencyKey:`verification-ready-${Date.now()}`,challengeId:reported.challengeId,expectedVersion:1,decision:'USER_READY',confirmationRef:'r7-controlled-user-ready'})
  const confirmed=await post('/v1/i10/verification:decide',{namespace,idempotencyKey:`verification-complete-${Date.now()}`,challengeId:reported.challengeId,expectedVersion:ready.version,decision:'USER_ACTION_COMPLETED',confirmationRef:'r7-controlled-user-action-complete'})
  assert.equal(confirmed.status,'VERIFICATION_CONFIRMED')
  const resumed=await post('/internal/worker/i10/verification:resume',{namespace,challengeId:reported.challengeId,workerId:'i10-r7-live-probe'},workerToken)
  assert.equal(resumed.status,'RESUMED')
  const evidence={schemaVersion:'hengzhun-i10-multimodal-verification-live-v1',mock:false,degraded:false,imageIngestId:submitted.imageIngestId,imageStatus:image.status,imageCount:image.imageCount,factCount:image.facts.length,controller:{invocation:image.controllerInvocation.invocation,provider:image.controllerInvocation.provider,model:image.controllerInvocation.model,usageReported:image.controllerInvocation.inputTokens>=0&&image.controllerInvocation.outputTokens>=0},verification:{challengeId:reported.challengeId,type:'UKEY',stateMachineStatus:resumed.status,hardwareOperationVerified:false,hardwareBoundary:'PIN_PRIVATE_KEY_PHYSICAL_BUTTON_SECURE_DESKTOP_USER_CONTROLLED'},sourceFixture:{redacted:true,sha256:sha(fs.readFileSync(selected))},completedAt:new Date().toISOString()}
  const directory=path.join(root,'.data/evidence/i10/multimodal-verification');fs.mkdirSync(directory,{recursive:true});const rendered=`${JSON.stringify(evidence,null,2)}\n`;fs.writeFileSync(path.join(directory,'result.json'),rendered);fs.writeFileSync(path.join(directory,'result.sha256'),`${sha(rendered)}  result.json\n`);fs.rmSync(targetRoot,{recursive:true,force:true});process.stdout.write(`${JSON.stringify(evidence,null,2)}\n`)
}
main().catch(error=>{process.stderr.write(`${JSON.stringify({status:'FAILED',errorCode:error.code||'I10_MULTIMODAL_LIVE_FAILED',message:String(error.message||'').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,500)})}\n`);process.exitCode=1})

