'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {HarnessDatabase}=require('../../dist/harness/src/database.js')
const {HarnessService}=require('../../dist/harness/src/service.js')
const {bankValidationFixturesSchema}=require('../../dist/harness/src/i10/schemas.js')
const {i8StabilityCompletionSchema}=require('../../dist/harness/src/i8/stage4-schemas.js')
const {FUXING_BANK_DEMO_ADAPTER}=require('../../dist/harness/src/i8/target-adapter-registry.js')
const {canonicalJson,sha256}=require('../../dist/harness/src/utils.js')
const {authoringExecutionFixtureValues}=require('../../worker/src/i10-worker-utils.cjs')
const {resolveStabilityExecution,executeStabilityBatch,bankStabilityFailureReceipt}=require('../../worker/src/i8-stability-runner.cjs')

function sample(index) {
  return {fixtureId:crypto.randomUUID(),subject:crypto.randomUUID(),credentialRef:`credential_${crypto.randomUUID()}`,
    sourceClientId:String(100+index*2),targetClientId:String(101+index*2),
    sourceAccountId:String(200+index*2),targetAccountId:String(201+index*2),beneficiaryRef:crypto.randomUUID(),
    sourceBalance:'1000.00',targetBalance:'2000.00',currency:'CNY'}
}
function pool() {
  return {schemaVersion:'hengzhun-bank-validation-fixtures-v1',formalAccountIds:{sourceAccountId:'3',targetAccountId:'4'},
    authoring:sample(0),stability:['DESKTOP_1440X900','NARROW_390X844'].flatMap((viewportId,i)=>
      [1,2].map(sequenceNo=>({viewportId,sequenceNo,fixture:sample(1+i*2+sequenceNo-1)})))}
}
async function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-bank-pool-'))
  const database=await HarnessDatabase.open({databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),backupDirectory:path.join(root,'backups')})
  t.after(async()=>{await database.close();fs.rmSync(root,{recursive:true,force:true})})
  const namespace='bank-pool-test',now=new Date().toISOString()
  database.connection.prepare("INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)").run(namespace,now,now)
  return {database,namespace,now,service:new HarnessService(database,path.join(root,'artifacts'),root)}
}
function registerCredentials(f,value) {
  for(const item of [value.authoring,...value.stability.map(x=>x.fixture)]) {
    const sessionId=`credsession_${crypto.randomUUID()}`
    f.database.connection.prepare(`INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,'READY',?,1,'2099-01-01T00:00:00.000Z',?,?)`).run(sessionId,f.namespace,sessionId,'owned fixture','0'.repeat(64),item.credentialRef,f.now,f.now)
    f.database.connection.prepare(`INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at)
      VALUES (?,?,?,?,?,'WINDOWS_DPAPI_CURRENT_USER',?)`).run(item.credentialRef,f.namespace,sessionId,`.data/credentials/${item.subject}.bin`,'1'.repeat(64),f.now)
  }
}
function seed(f,value,suffix='one',money=true) {
  const caseId=`case_bank_pool_${suffix}`,preparationId=`preparation_bank_pool_${suffix}`
  const businessInputs={schemaVersion:'hengzhun-i10-typed-business-inputs-v2',source:'USER_CONFIRMED',values:{
    payerAccountId:'3',payeeRef:'11111111-1111-4111-8111-111111111111',amount:'1.00',currency:'CNY',purpose:'隔离验证'}}
  const definition={credentialRef:'credential_12345678-1234-4234-8234-123456789abc',entryUrl:'http://127.0.0.1:18082/portal/login',
    ...(money?{businessInputs}:{}),...(value?{bankValidationFixtures:value}:{})}
  const intent={schemaVersion:'i8-intent-plan-v1',caseId,caseVersion:1,route:definition.entryUrl,
    executionProfile:money?'TRANSFER_UKEY_ORDER_QUERY':'LOGIN_PROFILE',adapterBinding:FUXING_BANK_DEMO_ADAPTER,
    ...(money?{inputContractVersion:'TypedBusinessInputsV2',typedBusinessInputs:businessInputs}:{}),
    steps:[{intentStepId:'intent-login',action:'安全凭据登录',expected:'进入主页',riskLevel:'LOW',inputValueSource:'CREDENTIAL_REF'},
      ...(money?[{intentStepId:'intent-transfer',action:'提交转账并完成首次确认',expected:'进入查询',riskLevel:'HIGH',inputValueSource:'NONE'}]:[])],
    assertions:[money?'转账成功':'登录成功']}
  const db=f.database.connection
  db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at)
    VALUES (?,?,1,'VALIDATED','fixture','fixture','HIGH',?,?)`).run(caseId,f.namespace,f.now,f.now)
  db.prepare("INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,1,?,?,'TEST',?)")
    .run(caseId,canonicalJson(definition),sha256(canonicalJson(definition)),f.now)
  db.prepare(`INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,
    intent_plan_json,intent_plan_hash,status,version,created_at,updated_at) VALUES (?,?,?,1,?,'{}','{}',?,?,'AWAITING_STAGE3',1,?,?)`)
    .run(preparationId,f.namespace,caseId,'2'.repeat(64),canonicalJson(intent),sha256(canonicalJson(intent)),f.now,f.now)
  return {namespace:f.namespace,idempotencyKey:`compile-${suffix}`,preparationId,expectedPreparationVersion:1,stabilityPolicyVersion:'I10_2X2_V1'}
}

test('financial pool requires five distinct real bindings and the exact four viewport samples',()=>{
  const value=pool()
  assert.deepEqual(bankValidationFixturesSchema.parse(value),value)
  for(const mutate of [
    p=>{p.stability[0].fixture.sourceAccountId=p.authoring.sourceAccountId},
    p=>{p.stability[0].fixture.credentialRef=p.authoring.credentialRef},
    p=>{p.stability[0].sequenceNo=p.stability[1].sequenceNo},
    p=>{p.authoring.sourceAccountId='3'},
  ]){const invalid=structuredClone(value);mutate(invalid);assert.equal(bankValidationFixturesSchema.safeParse(invalid).success,false)}
})
test('money compile refuses a missing pool or unenrolled sample credential before queuing',async t=>{
  const f=await fixture(t),value=pool()
  for(const [suffix,p,errorCode] of [['missing',undefined,'I10_BANK_VALIDATION_FIXTURES_REQUIRED'],['credential',value,'I10_BANK_VALIDATION_CREDENTIAL_NOT_READY']])
    await assert.rejects(f.service.compileI8Candidate(seed(f,p,suffix),{requestId:'pool-test'}),e=>e.errorCode===errorCode)
  assert.equal(f.database.connection.prepare('SELECT count(*) n FROM i8_candidate_build_jobs').get().n,0)
})
test('author claim uses its bound sample and preserves the formal plan/hash',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  const claim=await f.service.claimNextI8CandidateBuild('worker-pool')
  assert.equal(claim.credentialRef,value.authoring.credentialRef)
  assert.deepEqual(claim.validationFixture,value.authoring)
  assert.equal(claim.executionFixtureValues['TRANSFER.PAYER_ACCOUNT_ID'],value.authoring.sourceAccountId)
  assert.equal(claim.executionFixtureValues['TRANSFER.PAYEE_REF'],value.authoring.beneficiaryRef)
  assert.equal(claim.plan.fixtureValues['TRANSFER.PAYER_ACCOUNT_ID'],'3')
  assert.equal(claim.planHash,created.response.planHash)
})
test('a financial author lease expiry records unknown failure without another claim or money retry',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const input=seed(f,value),created=await f.service.compileI8Candidate(input,{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-pool')
  f.database.connection.prepare("UPDATE i8_candidate_build_jobs SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE job_id=?").run(created.response.jobId)
  assert.equal((await f.service.claimNextI8CandidateBuild('worker-again')).status,'EMPTY')
  const row=f.database.connection.prepare('SELECT status,error_code,attempt_count FROM i8_candidate_build_jobs WHERE job_id=?').get(created.response.jobId)
  assert.deepEqual(row,{status:'FAILED',error_code:'I10_BANK_AUTHORING_RESULT_UNKNOWN',attempt_count:1})
  await assert.rejects(f.service.compileI8Candidate({...input,idempotencyKey:'explicit-retry',retryFailed:true},{requestId:'pool-test'}),
    e=>e.errorCode==='I10_BANK_VALIDATION_FRESH_POOL_REQUIRED')
})
test('a consumed physical pool cannot be claimed by another case',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  await f.service.compileI8Candidate(seed(f,value,'first'),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-first')
  await assert.rejects(f.service.compileI8Candidate(seed(f,value,'second'),{requestId:'pool-test'}),e=>e.errorCode==='I10_BANK_VALIDATION_FIXTURES_CONSUMED')
})
test('two queued cases sharing one pool grant only one execution right',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  await f.service.compileI8Candidate(seed(f,value,'first'),{requestId:'pool-test'})
  const second=await f.service.compileI8Candidate(seed(f,value,'second'),{requestId:'pool-test'})
  assert.equal((await f.service.claimNextI8CandidateBuild('worker-first')).status,'CLAIMED')
  const blocked=await f.service.claimNextI8CandidateBuild('worker-second')
  assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.errorCode,'I10_BANK_VALIDATION_FIXTURES_CONSUMED')
  assert.deepEqual(f.database.connection.prepare('SELECT status,attempt_count FROM i8_candidate_build_jobs WHERE job_id=?').get(second.response.jobId),
    {status:'FAILED',attempt_count:0})
})
test('changing namespace or credential references cannot reuse consumed physical accounts',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  await f.service.compileI8Candidate(seed(f,value,'first'),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-first')
  f.namespace='bank-pool-other'
  f.database.connection.prepare("INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)").run(f.namespace,f.now,f.now)
  const other=pool();registerCredentials(f,other)
  await assert.rejects(f.service.compileI8Candidate(seed(f,other,'other'),{requestId:'pool-test'}),e=>e.errorCode==='I10_BANK_VALIDATION_FIXTURES_CONSUMED')
})
test('revocation after compile blocks claim without consuming or executing a sample',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  f.database.connection.prepare("UPDATE i10_credential_sessions SET status='REVOKED' WHERE credential_ref=?").run(value.authoring.credentialRef)
  const blocked=await f.service.claimNextI8CandidateBuild('worker-revoked')
  assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.errorCode,'I10_BANK_VALIDATION_CREDENTIAL_NOT_READY')
  assert.equal(f.database.connection.prepare('SELECT attempt_count FROM i8_candidate_build_jobs WHERE job_id=?').get(created.response.jobId).attempt_count,0)
})
test('read-only authoring explicitly recovers an expired lease with a fresh job and no money pool',async t=>{
  const f=await fixture(t),input=seed(f,undefined,'readonly',false),created=await f.service.compileI8Candidate(input,{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-old')
  f.database.connection.prepare("UPDATE i8_candidate_build_jobs SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE job_id=?").run(created.response.jobId)
  assert.equal((await f.service.claimNextI8CandidateBuild('worker-new')).status,'EMPTY')
  assert.equal(f.database.connection.prepare('SELECT status FROM i8_candidate_build_jobs WHERE job_id=?').get(created.response.jobId).status,'FAILED')
  const resumed=await f.service.compileI8Candidate({...input,idempotencyKey:'compile-readonly-recovery',retryFailed:true},{requestId:'pool-recovery'})
  const claim=await f.service.claimNextI8CandidateBuild('worker-new')
  assert.equal(claim.status,'CLAIMED');assert.equal(claim.jobId,resumed.response.jobId)
  assert.notEqual(claim.jobId,created.response.jobId);assert.equal(resumed.response.retriedFromJobId,created.response.jobId)
  assert.equal(claim.planHash,created.response.planHash)
  assert.equal(claim.validationFixture,undefined)
})

function seedStabilityProjection(f,created,value,wrongBinding=false,packageIdentity={}) {
  // Isolated persisted claim projection only: this is not authoring/browser evidence.
  const db=f.database.connection,candidateId=`candidate_${'a'.repeat(40)}`,batchId=`stability_${'a'.repeat(40)}`
  db.prepare(`INSERT INTO i8_script_candidates(candidate_id,namespace,executable_plan_id,script_id,script_version,dsl_version,dsl_json,dsl_hash,
    generator_version,relative_directory,script_sha256,manifest_json,manifest_sha256,source_chain_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,'script_projection',1,'HENGZHUN_DSL_V1','{}',?,'test-projection','.data/candidates/projection',?,'{}',?,?,'GENERATED',1,?,?)`)
    .run(candidateId,f.namespace,created.response.executablePlanId,'a'.repeat(64),packageIdentity.scriptHash||'b'.repeat(64),packageIdentity.manifestHash||'c'.repeat(64),'d'.repeat(64),f.now,f.now)
  db.prepare(`INSERT INTO i8_stability_batches(batch_id,namespace,candidate_id,status,version,created_at,updated_at)
    VALUES (?,?,?,'QUEUED',1,?,?)`).run(batchId,f.namespace,candidateId,f.now,f.now)
  db.prepare(`INSERT INTO i10_stability_policy_bindings(object_type,object_id,policy_version,required_runs,created_at)
    VALUES ('CANDIDATE_BATCH',?,'I10_2X2_V1',4,?)`).run(batchId,f.now)
  for(const item of value.stability) {
    const desktop=item.viewportId==='DESKTOP_1440X900'
    db.prepare(`INSERT INTO i8_stability_validation_runs(validation_run_id,batch_id,candidate_id,viewport_id,viewport_width,viewport_height,sequence_no,fixture_ref,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,'QUEUED',?)`).run(`validation_${'a'.repeat(40)}_${desktop?'desktop':'narrow'}_${item.sequenceNo}`,
      batchId,candidateId,item.viewportId,desktop?1440:390,desktop?900:844,item.sequenceNo,
      wrongBinding?crypto.randomUUID():item.fixture.fixtureId,f.now)
  }
  return batchId
}
test('stability claims bind four different credentials and immutable actual fixture UUIDs',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  seedStabilityProjection(f,created,value)
  const claim=await f.service.claimNextI8Stability('worker-stability')
  assert.equal(claim.credentialRef,undefined)
  assert.deepEqual(claim.bankValidationFixtures,value)
  for(const run of claim.runs) {
    const expected=value.stability.find(item=>item.viewportId===run.viewportId&&item.sequenceNo===run.sequenceNo).fixture
    assert.equal(run.fixtureRef,expected.fixtureId)
    assert.equal(run.credentialRef,expected.credentialRef)
    assert.deepEqual(run.validationFixture,expected)
    assert.equal(run.executionFixtureValues['TRANSFER.PAYER_ACCOUNT_ID'],expected.sourceAccountId)
  }
  assert.equal(new Set(claim.runs.map(run=>run.credentialRef)).size,4)
  assert.throws(()=>f.database.connection.prepare('UPDATE i8_stability_validation_runs SET fixture_ref=? WHERE validation_run_id=?')
    .run(crypto.randomUUID(),claim.runs[0].validationRunId),/IMMUTABLE/)
})
test('a fixture label mismatch cannot replace the immutable physical bank binding',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const batchId=seedStabilityProjection(f,created,value,true)
  await assert.rejects(f.service.claimNextI8Stability('worker-stability'),e=>e.errorCode==='I10_BANK_VALIDATION_RUN_BINDING_INVALID')
  assert.equal(f.database.connection.prepare('SELECT status FROM i8_stability_batches WHERE batch_id=?').get(batchId).status,'QUEUED')
})

test('financial authoring substitutes only the trusted sample values and rejects missing or expired bindings',()=>{
  const value=pool(),claim={credentialRef:value.authoring.credentialRef,validationFixture:value.authoring,
    leaseExpiresAt:'2099-01-01T00:00:00.000Z',plan:{fixtureProfile:'TRANSFER_UKEY_ORDER_QUERY',fixtureValues:{
      'TRANSFER.PAYER_ACCOUNT_ID':'3','TRANSFER.PAYEE_REF':'formal-payee','TRANSFER.AMOUNT':'1.00','TRANSFER.PURPOSE':'冻结用途','TRANSFER.CURRENCY':'CNY'}}}
  const result=authoringExecutionFixtureValues(claim)
  assert.equal(result['TRANSFER.PAYER_ACCOUNT_ID'],value.authoring.sourceAccountId)
  assert.equal(result['TRANSFER.PAYEE_REF'],value.authoring.beneficiaryRef)
  assert.equal(result['TRANSFER.AMOUNT'],'1.00');assert.equal(result['TRANSFER.PURPOSE'],'冻结用途')
  assert.equal(claim.plan.fixtureValues['TRANSFER.PAYER_ACCOUNT_ID'],'3')
  assert.throws(()=>authoringExecutionFixtureValues({...claim,validationFixture:undefined}),e=>e.code==='I10_BANK_VALIDATION_BINDING_REQUIRED')
  assert.throws(()=>authoringExecutionFixtureValues({...claim,credentialRef:'credential_wrong'}),e=>e.code==='I10_BANK_VALIDATION_BINDING_INVALID')
  assert.throws(()=>authoringExecutionFixtureValues({...claim,leaseExpiresAt:'2000-01-01T00:00:00.000Z'}),e=>e.code==='I10_BANK_VALIDATION_LEASE_EXPIRED')
})
test('stability resolves four bound credentials without a primary-credential fallback',async()=>{
  const value=pool(),claim={bankValidationFixtures:value,leaseExpiresAt:'2099-01-01T00:00:00.000Z'},calls=[]
  for(const item of value.stability) {
    const run={credentialRef:item.fixture.credentialRef,fixtureRef:item.fixture.fixtureId,validationFixture:item.fixture}
    const result=await resolveStabilityExecution(claim,run,{credential:{username:'primary',password:'test'},
      resolveCredential:async ref=>{calls.push(ref);return {username:ref,password:'isolated-test'}}})
    assert.equal(result.credential.username,run.credentialRef)
    assert.equal(result.fixtureValues['TRANSFER.PAYER_ACCOUNT_ID'],item.fixture.sourceAccountId)
    await assert.rejects(resolveStabilityExecution(claim,run,{credential:{username:'primary',password:'test'}}),e=>e.code==='I10_BANK_VALIDATION_CREDENTIAL_RESOLVER_REQUIRED')
  }
  assert.equal(new Set(calls).size,4)
})
function failedPrefix(f,claim) {
  const run=claim.runs[0],directory=path.join(f.service.productRoot,'.data','stability',f.namespace,claim.candidateId,run.validationRunId)
  fs.mkdirSync(directory,{recursive:true})
  const evidence=[['REPORT','report.json','application/json','REDACTED',Buffer.from('{"unitTest":true,"bankObserved":false}')],
    ['SCREENSHOT','screenshot.png','image/png','QUARANTINED',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')],
    ['LOG','steps.log','text/plain; charset=utf-8','REDACTED',Buffer.from('unit contract failure, not bank execution')]]
    .map(([artifactType,file,mediaType,redactionStatus,bytes])=>{
      const target=path.join(directory,file);fs.writeFileSync(target,bytes)
      return {artifactType,mediaType,redactionStatus,relativePath:path.relative(f.service.productRoot,target).replaceAll('\\','/'),sha256:sha256(bytes),byteLength:bytes.length}
    })
  return {workerId:'worker-stability',candidateId:claim.candidateId,scriptHash:claim.scriptHash,runtimeFingerprint:'e'.repeat(64),stoppedAfterFailure:true,
    runs:[{validationRunId:run.validationRunId,viewportId:run.viewportId,viewportWidth:run.viewportWidth,viewportHeight:run.viewportHeight,
      sequenceNo:run.sequenceNo,fixtureRef:run.fixtureRef,outcome:'FAILED',durationMs:1,assertionSetHash:'f'.repeat(64),
      evidenceSetHash:'0'.repeat(64),evidence,errorCode:'UNIT_BANK_ASSERTION_FAILED'}]}
}
test('first financial failure completes FAILED and records the other samples unexecuted without artifacts',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const batchId=seedStabilityProjection(f,created,value),claim=await f.service.claimNextI8Stability('worker-stability')
  const result=await f.service.completeI8Stability(batchId,failedPrefix(f,claim))
  assert.equal(result.status,'VALIDATION_FAILED');assert.equal(result.notExecutedRuns,3)
  const rows=f.database.connection.prepare('SELECT status,error_code,duration_ms,evidence_json FROM i8_stability_validation_runs WHERE batch_id=?').all(batchId)
  const skipped=rows.filter(row=>row.error_code==='BANK_VALIDATION_NOT_EXECUTED_AFTER_FAILURE')
  assert.equal(skipped.length,3);assert.ok(skipped.every(row=>row.status==='FAILED'&&row.duration_ms===null&&row.evidence_json===null))
  assert.equal(f.database.connection.prepare('SELECT count(*) n FROM i8_stability_certificates').get().n,0)
})

test('failure-stop receipts reject passing, unordered, repeated-failure and unflagged partial results',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  seedStabilityProjection(f,created,value)
  const claim=await f.service.claimNextI8Stability('worker-stability'),receipt=failedPrefix(f,claim)
  assert.equal(i8StabilityCompletionSchema.safeParse(receipt).success,true)
  const first=receipt.runs[0]
  assert.equal(i8StabilityCompletionSchema.safeParse({...receipt,runs:[{...first,outcome:'PASSED',errorCode:undefined}]}).success,false)
  assert.equal(i8StabilityCompletionSchema.safeParse({...receipt,runs:[{...first,sequenceNo:2}]}).success,false)
  assert.equal(i8StabilityCompletionSchema.safeParse({...receipt,runs:[first,{...first,sequenceNo:2}]}).success,false)
  const {stoppedAfterFailure,...partial}=receipt
  assert.equal(i8StabilityCompletionSchema.safeParse(partial).success,false)
  await assert.rejects(f.service.completeI8RepairStability('no-repair-batch',receipt),e=>e.errorCode==='I10_BANK_FAILURE_PREFIX_NOT_ALLOWED')
})

test('sample credential resolution rejects swapped physical bindings and an expired lease before resolving secrets',async()=>{
  const value=pool(),item=value.stability[0],claim={bankValidationFixtures:value,leaseExpiresAt:'2099-01-01T00:00:00.000Z'}
  const run={credentialRef:item.fixture.credentialRef,fixtureRef:item.fixture.fixtureId,validationFixture:item.fixture}
  let calls=0
  const options={resolveCredential:async()=>{calls++;return {username:'owned-test-user',password:'test-only'}}}
  await assert.rejects(resolveStabilityExecution(claim,{...run,validationFixture:value.stability[1].fixture},options),e=>e.code==='I10_BANK_VALIDATION_BINDING_INVALID')
  await assert.rejects(resolveStabilityExecution({...claim,leaseExpiresAt:'2000-01-01T00:00:00.000Z'},run,options),e=>e.code==='I10_BANK_VALIDATION_LEASE_EXPIRED')
  assert.equal(calls,0)
})

test('no-artifact financial failure records the exact next sample and no invented runtime evidence',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const batchId=seedStabilityProjection(f,created,value),claim=await f.service.claimNextI8Stability('worker-stability')
  const receipt=bankStabilityFailureReceipt(claim,Object.assign(new Error('must-not-appear'),{code:'STABILITY_CREDENTIAL_UNAVAILABLE'}),[],undefined,'worker-stability')
  assert.equal(receipt.runtimeFingerprint,undefined);assert.equal(JSON.stringify(receipt).includes('must-not-appear'),false)
  assert.equal(i8StabilityCompletionSchema.safeParse(receipt).success,true)
  await assert.rejects(f.service.completeI8Stability(batchId,{...receipt,workerId:'other-worker'}),e=>e.errorCode==='I8_STABILITY_LEASE_INVALID')
  await assert.rejects(f.service.completeI8Stability(batchId,{...receipt,scriptHash:'a'.repeat(64)}),e=>e.errorCode==='I8_STABILITY_CANDIDATE_MISMATCH')
  await assert.rejects(f.service.completeI8Stability(batchId,{...receipt,executionFailure:{...receipt.executionFailure,validationRunId:claim.runs[1].validationRunId}}),e=>e.errorCode==='I10_BANK_FAILURE_PREFIX_NOT_ALLOWED')
  const result=await f.service.completeI8Stability(batchId,receipt)
  assert.equal(result.status,'VALIDATION_FAILED');assert.equal(result.notExecutedRuns,3);assert.equal(result.incompleteEvidenceRuns,1)
  assert.equal(result.nextAction,'HUMAN_INTERVENTION_REQUIRED')
  const rows=f.database.connection.prepare('SELECT validation_run_id,status,error_code,duration_ms,evidence_json FROM i8_stability_validation_runs WHERE batch_id=?').all(batchId)
  assert.equal(rows.find(row=>row.validation_run_id===claim.runs[0].validationRunId).error_code,'STABILITY_CREDENTIAL_UNAVAILABLE')
  assert.ok(rows.every(row=>row.status==='FAILED'&&row.duration_ms===null&&row.evidence_json===null))
  assert.equal(f.database.connection.prepare('SELECT runtime_fingerprint FROM i8_stability_batches WHERE batch_id=?').get(batchId).runtime_fingerprint,null)
  assert.equal(f.database.connection.prepare('SELECT count(*) n FROM i8_stability_certificates').get().n,0)
})

test('no-artifact failure preserves completed prefix artifacts and cannot certify an empty or incomplete batch',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const batchId=seedStabilityProjection(f,created,value),claim=await f.service.claimNextI8Stability('worker-stability')
  const completed={...failedPrefix(f,claim).runs[0],outcome:'PASSED',errorCode:undefined}
  const receipt=bankStabilityFailureReceipt(claim,{code:'I10_BANK_VALIDATION_SCREENSHOT_UNAVAILABLE'},[completed],'e'.repeat(64),'worker-stability')
  assert.equal(i8StabilityCompletionSchema.safeParse({...receipt,runtimeFingerprint:undefined}).success,false)
  assert.equal(i8StabilityCompletionSchema.safeParse({...receipt,runs:[{...completed,outcome:'FAILED',errorCode:'UNIT_FAILED'}]}).success,false)
  const result=await f.service.completeI8Stability(batchId,receipt)
  assert.equal(result.passedRuns,1);assert.equal(result.failedRuns,1);assert.equal(result.notExecutedRuns,2)
  const row=f.database.connection.prepare('SELECT status,evidence_json FROM i8_stability_validation_runs WHERE validation_run_id=?').get(completed.validationRunId)
  assert.equal(row.status,'PASSED');assert.deepEqual(JSON.parse(row.evidence_json),completed.evidence)
  assert.equal(f.database.connection.prepare('SELECT count(*) n FROM i8_stability_certificates').get().n,0)
})

test('a no-artifact failure receipt cannot abort a read-only batch',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value,'read-only-abort',false),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const batchId=seedStabilityProjection(f,created,value),claim=await f.service.claimNextI8Stability('worker-stability')
  await assert.rejects(f.service.completeI8Stability(batchId,{workerId:'worker-stability',candidateId:claim.candidateId,scriptHash:claim.scriptHash,
    stoppedAfterFailure:true,runs:[],executionFailure:{validationRunId:claim.runs[0].validationRunId,errorCode:'UNIT_NO_EVIDENCE'}}),e=>e.errorCode==='I10_BANK_FAILURE_PREFIX_NOT_ALLOWED')
  assert.equal(f.database.connection.prepare('SELECT status FROM i8_stability_batches WHERE batch_id=?').get(batchId).status,'RUNNING')
})

test('financial prefix artifacts must belong to their own sample directory even with valid hashes',async t=>{
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const batchId=seedStabilityProjection(f,created,value),claim=await f.service.claimNextI8Stability('worker-stability'),receipt=failedPrefix(f,claim)
  const first=receipt.runs[0],artifact=first.evidence[0]
  const alienRelative=artifact.relativePath.replace(claim.runs[0].validationRunId,claim.runs[1].validationRunId)
  const alien=path.join(f.service.productRoot,...alienRelative.split('/'))
  fs.mkdirSync(path.dirname(alien),{recursive:true});fs.copyFileSync(path.join(f.service.productRoot,...artifact.relativePath.split('/')),alien)
  first.evidence[0]={...artifact,relativePath:alienRelative}
  await assert.rejects(f.service.completeI8Stability(batchId,receipt),e=>e.errorCode==='I8_STABILITY_EVIDENCE_MISSING')
})

for(const mode of ['credential','screenshot','startup','completed-prefix'])test(`production Worker closes ${mode} failure without manufactured evidence`,async t=>{
  // Actual Chromium + temporary candidate. No bank endpoint or model is used.
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  const candidateId=`candidate_${'a'.repeat(40)}`
  const relativeDirectory=`.data/candidates/${f.namespace}/${candidateId}`,directory=path.join(f.service.productRoot,...relativeDirectory.split('/'))
  fs.mkdirSync(directory,{recursive:true})
  const source=`'use strict';module.exports={schemaVersion:'hengzhun-candidate-module-v1',execute:async ({page,capture})=>{
    await page.setContent('<h1>Isolated failure contract, not banking</h1>');
    ${mode==='screenshot'?'await page.close();':"await capture('unit-pass',page);"}
    return {outcome:'PASSED',facts:[{stepId:'dsl_01',operation:'expectVisible',passed:true}]};
  }};`
  const manifest={candidateId,generatorVersion:'hengzhun-script-package-builder-1.0.0',dependencyAllowlist:[]}
  fs.writeFileSync(path.join(directory,'script.cjs'),source);fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest))
  // Bind the exact test package at INSERT; never weaken the immutable candidate trigger.
  const packageIdentity={scriptHash:sha256(source),manifestHash:sha256(canonicalJson(manifest))}
  const batchId=seedStabilityProjection(f,created,value,false,packageIdentity),claim=await f.service.claimNextI8Stability('worker-stability')
  const boundClaim={...claim,relativeDirectory}
  let calls=0
  const result=await executeStabilityBatch(boundClaim,{productRoot:f.service.productRoot,runtimeProductRoot:path.resolve(__dirname,'../..'),workerId:'worker-stability',
    ...(mode==='startup'?{executablePath:path.join(f.service.productRoot,'absent-test-browser.exe')}:{}),
    resolveCredential:async()=>{calls++;if(mode==='credential'||mode==='completed-prefix'&&calls===2)throw Object.assign(new Error('secret-must-not-appear'),{code:'STABILITY_CREDENTIAL_UNAVAILABLE'});
      return {username:'isolated-test-user',password:'test-only'}}})
  assert.equal(result.stoppedAfterFailure,true)
  assert.equal(result.runs.length,mode==='completed-prefix'?1:0)
  assert.equal(JSON.stringify(result).includes('secret-must-not-appear'),false)
  assert.equal(result.executionFailure.validationRunId,claim.runs[result.runs.length].validationRunId)
  assert.equal(result.executionFailure.errorCode,mode==='screenshot'?'I10_BANK_VALIDATION_SCREENSHOT_UNAVAILABLE':mode==='startup'?'STABILITY_RUNTIME_INCOMPLETE':'STABILITY_CREDENTIAL_UNAVAILABLE')
  const completed=await f.service.completeI8Stability(batchId,result)
  assert.equal(completed.status,'VALIDATION_FAILED');assert.equal(completed.nextAction,'HUMAN_INTERVENTION_REQUIRED')
  assert.equal(completed.incompleteEvidenceRuns,1);assert.equal(completed.notExecutedRuns,mode==='completed-prefix'?2:3)
  assert.equal(f.database.connection.prepare('SELECT count(*) n FROM i8_stability_certificates').get().n,0)
})

test('production stability loop uses the first bound credential and real Chromium capture, then stops on its failure',async t=>{
  // Browser contract only. The isolated HTML below is not a banking page or LIVE evidence.
  const f=await fixture(t),value=pool();registerCredentials(f,value)
  const created=await f.service.compileI8Candidate(seed(f,value),{requestId:'pool-test'})
  await f.service.claimNextI8CandidateBuild('worker-author')
  seedStabilityProjection(f,created,value)
  const claim=await f.service.claimNextI8Stability('worker-stability'),calls=[]
  const relativeDirectory=`.data/candidates/${f.namespace}/${claim.candidateId}`
  const directory=path.join(f.service.productRoot,...relativeDirectory.split('/'))
  fs.mkdirSync(directory,{recursive:true})
  const source=`'use strict';module.exports={schemaVersion:'hengzhun-candidate-module-v1',execute:async ({page,fixtures,capture})=>{
    await page.setContent('<h1>Isolated Worker contract</h1><input name="username"><input type="password"><input id="payer"><input id="payee">');
    await page.locator('[name="username"]').fill(fixtures['CREDENTIAL.USERNAME']);
    await page.locator('[type="password"]').fill(fixtures['CREDENTIAL.PASSWORD']);
    await page.locator('#payer').fill(fixtures['TRANSFER.PAYER_ACCOUNT_ID']);
    await page.locator('#payee').fill(fixtures['TRANSFER.PAYEE_REF']);
    const bound=await page.locator('#payer').inputValue()==='${value.stability[0].fixture.sourceAccountId}'
      &&await page.locator('#payee').inputValue()==='${value.stability[0].fixture.beneficiaryRef}';
    if(!bound)throw new Error('UNIT_SAMPLE_BINDING_MISMATCH');
    await capture('unit-failure',page);
    return {outcome:'FAILED',facts:[{stepId:'dsl_01',operation:'expectVisible',passed:false}]};
  }};`
  const manifest={candidateId:claim.candidateId,generatorVersion:'hengzhun-script-package-builder-1.0.0',dependencyAllowlist:[]}
  fs.writeFileSync(path.join(directory,'script.cjs'),source)
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest))
  const result=await executeStabilityBatch({...claim,relativeDirectory,scriptHash:sha256(source),manifestHash:sha256(canonicalJson(manifest))},
    {productRoot:f.service.productRoot,runtimeProductRoot:path.resolve(__dirname,'../..'),workerId:'worker-stability',
      resolveCredential:async ref=>{calls.push(ref);return {username:'isolated-worker-user',password:'unit-test-not-bank'}}})
  assert.deepEqual(calls,[value.stability[0].fixture.credentialRef])
  assert.equal(result.stoppedAfterFailure,true);assert.equal(result.runs.length,1)
  assert.equal(result.runs[0].outcome,'FAILED')
  const screenshot=result.runs[0].evidence.find(item=>item.artifactType==='SCREENSHOT')
  assert.ok(screenshot.byteLength>1000)
  assert.equal(fs.existsSync(path.join(f.service.productRoot,'.data','stability',f.namespace,claim.candidateId,claim.runs[1].validationRunId)),false)
})
