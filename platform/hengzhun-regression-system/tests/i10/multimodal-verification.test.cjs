'use strict'

const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const test=require('node:test')
const crypto=require('node:crypto')
const {startHarness}=require('../../dist/harness/src/server.js')
const {inputEnvelopeSchema,actionStepV2Schema}=require('../../dist/harness/src/i10/schemas.js')
const {classifyVerificationChallenge}=require('../../worker/src/i10-midscene-candidate-authoring.cjs')

const productRoot=path.resolve(__dirname,'../..')
const serviceToken='synthetic-i10-service-token-multimodal-0001'
const workerToken='synthetic-i10-worker-token-multimodal-00002'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')
const hash=value=>crypto.createHash('sha256').update(value).digest('hex')

async function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-i10-mm-'));const running=await startHarness({productRoot:root,databasePath:path.join(root,'.data/sqlite/regression_platform.sqlite'),migrationsDirectory:path.join(productRoot,'harness/migrations'),backupDirectory:path.join(root,'.data/sqlite/backups'),artifactRoot:path.join(root,'.data/artifacts'),security:{serviceToken,allowedClients:['127.0.0.1','::1']},workerToken,schedulerIntervalMs:0,host:'127.0.0.1',port:0});const baseUrl=`http://127.0.0.1:${running.server.address().port}`;t.after(async()=>{await new Promise(resolve=>running.server.close(resolve));await running.application.close();fs.rmSync(root,{recursive:true,force:true})});return{root,baseUrl,running}}
async function post(baseUrl,route,body,token=serviceToken){const response=await fetch(baseUrl+route,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});return{response,body:await response.json()}}

test('all three primary inputs accept supplementary images and rich inputs require provenance',()=>{
  for(const inputType of ['NATURAL_LANGUAGE','CASE_FILE','VIDEO']){const base={schemaVersion:'hengzhun-i10-input-envelope-v1',inputType,sourceRef:'session-ref-0001',supportingImages:[{flowiseFileRef:'image-ref-0001',originalFilename:'case.png'}]};if(inputType==='NATURAL_LANGUAGE')base.naturalLanguage='验证登录';else Object.assign(base,{flowiseFileRef:'primary-ref-0001',originalFilename:inputType==='VIDEO'?'case.mp4':'case.xlsx'});assert.equal(inputEnvelopeSchema.safeParse(base).success,true)}
  assert.equal(actionStepV2Schema.safeParse({ordinal:1,actionType:'INPUT',instruction:'输入开户金额',inputValue:'1000',inputValueSource:'IMAGE_EVIDENCE',provenanceRefs:['image:1:abc'],confidence:.9,expected:'金额显示为1000'}).success,true)
  assert.equal(actionStepV2Schema.safeParse({ordinal:1,actionType:'INPUT',instruction:'输入未知值',provenanceRefs:[],confidence:.9,expected:'提交'}).success,false)
})

test('image evidence is controlled, hashed and selected facts never include raw secrets',async t=>{
  const {root,baseUrl}=await fixture(t);const namespace='i10-mm-test';const attachment=path.join(root,'.data/flowise-attachments','image-ref-0001');fs.mkdirSync(attachment,{recursive:true});fs.writeFileSync(path.join(attachment,'case.png'),png)
  const submitted=await post(baseUrl,'/v1/i10/images:submit',{namespace,idempotencyKey:'i10-image-submit-0001',sourceRef:'conversation-0001',primaryInputType:'NATURAL_LANGUAGE',images:[{flowiseFileRef:'image-ref-0001',originalFilename:'case.png'}],primaryText:'登录并核对资料'});assert.equal(submitted.response.status,202,JSON.stringify(submitted.body));assert.match(submitted.body.imageIngestId,/^imageingest_/)
  const claim=await post(baseUrl,'/internal/worker/i10/images:claim',{workerId:'worker-mm-0001'},workerToken);assert.equal(claim.body.status,'CLAIMED')
  const evidenceRoot=path.join(root,'.data/image-ingest',submitted.body.imageIngestId,'redacted');fs.mkdirSync(evidenceRoot,{recursive:true});const evidence=path.join(evidenceRoot,'image-001.png');fs.writeFileSync(evidence,png);const ocr='用户名字段需要输入已确认的客户号；短信验证码由用户现场输入。'
  const completed=await post(baseUrl,'/internal/worker/i10/images:complete',{workerId:'worker-mm-0001',imageIngestId:submitted.body.imageIngestId,packets:[{ordinal:1,sourceSha256:claim.body.images[0].sourceSha256,redactedImagePath:path.relative(root,evidence).replace(/\\/g,'/'),redactedImageSha256:hash(png),ocrText:ocr,ocrTextHash:hash(ocr),language:'zh',confidence:.9}],facts:[{factId:'fact_mm_verify_0001',field:'VERIFICATION_REQUIREMENT',value:'短信验证码必须由用户现场输入',provenanceRefs:[`image:1:${claim.body.images[0].sourceSha256}`],confidence:.9,selected:true,requiresUserConfirmation:true},{factId:'fact_mm_input_0002',field:'INPUT_VALUE',value:'1000',provenanceRefs:[`image:1:${claim.body.images[0].sourceSha256}`],confidence:.95,selected:true,requiresUserConfirmation:false}],controllerInvocation:{invocation:'REAL',provider:'test-injected-controller',model:'contract-probe',inputTokens:40,outputTokens:20}},workerToken);assert.equal(completed.body.status,'WAITING_USER',JSON.stringify(completed.body))
  const result=await post(baseUrl,'/v1/i10/images:get',{namespace,imageIngestId:submitted.body.imageIngestId});assert.equal(result.body.facts.length,2);assert.equal(JSON.stringify(result.body).includes('password'),false)
  const caseRef='case-file-ref-0001';const caseDir=path.join(root,'.data/flowise-attachments',caseRef);fs.mkdirSync(caseDir,{recursive:true});fs.writeFileSync(path.join(caseDir,'case.json'),JSON.stringify({'案例名称':'图片补全输入值','测试目标':'验证金额填写','目标系统':'复兴银行门户','入口地址':'http://127.0.0.1:18082/portal/login','前置条件':'门户可访问','执行步骤':'填写开户金额','预期结果':'显示开户金额','断言':'金额显示正确'}),'utf8')
  const caseSubmitted=await post(baseUrl,'/v1/i10/ingest:submit',{namespace,idempotencyKey:'i10-case-with-image-0001',inputType:'CASE_FILE',flowiseFileRef:caseRef,originalFilename:'case.json',supportingImageIngestId:submitted.body.imageIngestId});assert.equal(caseSubmitted.response.status,202,JSON.stringify(caseSubmitted.body));const draft=caseSubmitted.body.items[0].draft;assert.equal(draft.supportingImageIngestId,submitted.body.imageIngestId);assert.equal(draft.caseFacts.length,2);assert.equal(draft.actionStepsV2[0].inputValue,'1000');assert.equal(draft.verificationRequirements[0].verificationType,'SMS_OTP')
})

test('verification challenge pauses, requires versioned user confirmation, and UKey remains human controlled',async t=>{
  const {baseUrl}=await fixture(t);const namespace='i10-verification-test';const reported=await post(baseUrl,'/internal/worker/i10/verification:report',{namespace,workerId:'worker-verification-0001',taskRef:'task-verification-0001',verificationType:'UKEY',actionOrdinal:3,detectionSummary:'页面要求插入U盾',userPreparation:'插入U盾并由用户完成PIN和物理确认'},workerToken);assert.equal(reported.body.status,'WAITING_USER_PREPARATION');assert.equal(reported.body.unattendedOutcome,'HUMAN_IN_LOOP_REQUIRED')
  const ready=await post(baseUrl,'/v1/i10/verification:decide',{namespace,idempotencyKey:'verification-ready-0001',challengeId:reported.body.challengeId,expectedVersion:1,decision:'USER_READY',confirmationRef:'user-confirm-0001'});assert.equal(ready.body.status,'WAITING_USER_ACTION')
  const confirmed=await post(baseUrl,'/v1/i10/verification:decide',{namespace,idempotencyKey:'verification-done-0001',challengeId:reported.body.challengeId,expectedVersion:2,decision:'USER_ACTION_COMPLETED',confirmationRef:'user-confirm-0002'});assert.equal(confirmed.body.status,'VERIFICATION_CONFIRMED');assert.equal(confirmed.body.resumeAllowed,true)
  const resumed=await post(baseUrl,'/internal/worker/i10/verification:resume',{namespace,challengeId:reported.body.challengeId,workerId:'worker-verification-0001'},workerToken);assert.equal(resumed.body.status,'RESUMED')
  assert.equal(classifyVerificationChallenge('请插入U盾后按下设备确认键').verificationType,'UKEY')
  assert.equal(classifyVerificationChallenge('请输入短信验证码').verificationType,'SMS_OTP')
})
