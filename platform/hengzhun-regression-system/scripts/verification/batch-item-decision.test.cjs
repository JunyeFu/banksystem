'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const crypto=require('node:crypto')
const {HarnessDatabase}=require('../../dist/harness/src/database.js')
const {I10Service}=require('../../dist/harness/src/i10/service.js')
const {ArtifactStore}=require('../../dist/harness/src/artifact-store.js')
const hash=value=>crypto.createHash('sha256').update(value).digest('hex')

async function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-batch-decision-'))
  const database=await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  const service=new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts')))
  const namespace='batch-decision-test'
  const now=new Date().toISOString()
  const credentialRef='credential_12345678-1234-1234-1234-123456789abc'
  const ingestJobId='ingest_12345678-1234-1234-1234-123456789abc'
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace,now,now)
  database.connection.prepare(`INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at)
    VALUES ('credsession_12345678-1234-1234-1234-123456789abc',?,?,?,?,'READY',?,1,?,?,?)`)
    .run(namespace,'batch-credential-001','批量测试凭据','0'.repeat(64),credentialRef,'2099-01-01T00:00:00.000Z',now,now)
  database.connection.prepare(`INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at)
    VALUES (?,?,'credsession_12345678-1234-1234-1234-123456789abc','.data/credentials/test.bin',?,'WINDOWS_DPAPI_CURRENT_USER',?)`)
    .run(credentialRef,namespace,'1'.repeat(64),now)
  database.connection.prepare(`INSERT INTO i10_ingest_jobs(
    ingest_job_id,namespace,idempotency_key,input_type,flowise_file_ref,original_filename,source_sha256,source_size_bytes,
    credential_ref,hints_json,status,confidence,missing_fields_json,draft_count,version,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,'WAITING_USER',0.9,'[]',2,1,?,?)`)
    .run(ingestJobId,namespace,'batch-job-001','CASE_FILE','uploads/cases.json','cases.json','2'.repeat(64),200,credentialRef,'{}',now,now)
  const insert=database.connection.prepare(`INSERT INTO i10_ingest_items(
    ingest_item_id,ingest_job_id,ordinal,draft_json,draft_hash,confidence,missing_fields_json,created_at
  ) VALUES (?,?,?,?,?,0.9,'[]',?)`)
  for(const ordinal of [1,2]){
    const draft={
      schemaVersion:'hengzhun-i10-case-draft-v1',title:`案例${ordinal}`,objective:'验证门户',summary:'批量导入测试',
      targetSystem:'复兴银行门户',entryUrl:'http://127.0.0.1:18082/portal/login',preconditions:['门户可访问'],
      steps:[{action:'打开登录页',expected:'显示登录页'}],assertions:['登录页可见'],caseFacts:[],actionStepsV2:[],
      verificationRequirements:[],credentialRef,
      source:{inputType:'CASE_FILE',sourceRef:ingestJobId,sourceHash:'2'.repeat(64),provenanceSummary:'批量测试'},
      confidence:0.9,missingFields:[],confirmationStatus:'WAITING_USER',
      authoringStrategy:'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',executionStrategy:'PLAYWRIGHT_VALIDATED_ONLY',
      evidenceStrategy:'REDACTED_HASHED_EVIDENCE'
    }
    const json=JSON.stringify(draft)
    insert.run(`ingestitem_12345678-1234-1234-1234-123456789ab${ordinal}`,ingestJobId,ordinal,json,hash(json),now)
  }
  return{root,database,service,namespace,ingestJobId}
}

test('multi-case ingest requires an explicit decision for every item',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  await assert.rejects(()=>f.service.decideIngest({
    namespace:f.namespace,idempotencyKey:'batch-missing-001',ingestJobId:f.ingestJobId,expectedVersion:1,
    choice:'CONFIRM',corrections:[],itemDecisions:[],reason:'测试',confirmationRef:'batch-confirm-001'
  },{requestId:'batch-request-001',actorType:'COZE'}),error=>error.errorCode==='I10_INGEST_ITEM_DECISIONS_REQUIRED')
})

test('multi-case ingest creates only confirmed cases and records immutable decisions',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const result=await f.service.decideIngest({
    namespace:f.namespace,idempotencyKey:'batch-complete-001',ingestJobId:f.ingestJobId,expectedVersion:1,
    choice:'CONFIRM',corrections:[],itemDecisions:[
      {ordinal:1,decision:'CONFIRM'},{ordinal:2,decision:'REJECT'}
    ],reason:'逐项确认',confirmationRef:'batch-confirm-002'
  },{requestId:'batch-request-002',actorType:'COZE'})
  assert.equal(result.status,'CONFIRMED')
  assert.equal(result.confirmedCount,1)
  assert.equal(result.rejectedCount,1)
  assert.equal(result.cases.length,1)
  assert.equal(result.cases[0].ordinal,1)
  const view=f.service.getIngest(f.namespace,f.ingestJobId)
  assert.equal(view.items[0].userDecision,'CONFIRM')
  assert.equal(view.items[1].userDecision,'REJECT')
  assert.throws(()=>f.database.connection.prepare(`UPDATE i10_ingest_item_decisions SET decision='CONFIRM' WHERE ordinal=2`).run(),
    /I10_INGEST_ITEM_DECISION_IMMUTABLE/)
})
