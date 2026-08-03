'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I10Service } = require('../../dist/harness/src/i10/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')

const hash = value => crypto.createHash('sha256').update(value).digest('hex')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-image-decision-'))
  const database = await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  const service = new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts')))
  const now = new Date().toISOString()
  const namespace = 'image-decision-test'
  const imageIngestId = 'imageingest_12345678-1234-1234-1234-123456789abc'
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`)
    .run(namespace,now,now)
  database.connection.prepare(`INSERT INTO i10_image_ingest_jobs(
    image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,status,image_count,total_size_bytes,version,created_at,updated_at
  ) VALUES (?,?,?,?,?,'WAITING_USER',1,100,2,?,?)`)
    .run(imageIngestId,namespace,'image-decision-job-001','session-image-001','NATURAL_LANGUAGE',now,now)
  const insertFact = database.connection.prepare(`INSERT INTO i10_case_fact_candidates(
    fact_id,image_ingest_id,field_name,value_redacted,value_hash,provenance_json,confidence,selected,requires_user_confirmation,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  insertFact.run('fact_00000001',imageIngestId,'entryUrl','http://old.example/login',hash('http://old.example/login'),'["image:1"]',0.91,1,1,now)
  insertFact.run('fact_00000002',imageIngestId,'expected','显示客户姓名',hash('显示客户姓名'),'["image:1"]',0.82,1,1,now)
  return {root,database,service,namespace,imageIngestId}
}

test('image facts require a complete immutable user decision set',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  await assert.rejects(()=>f.service.decideImageIngest({
    namespace:f.namespace,idempotencyKey:'image-decision-incomplete-001',imageIngestId:f.imageIngestId,
    expectedVersion:2,confirmationRef:'confirm-image-001',
    decisions:[{factId:'fact_00000001',decision:'CONFIRM'}]
  },{requestId:'request-image-001',actorType:'COZE'}),error=>error.errorCode==='I10_IMAGE_DECISION_SET_INCOMPLETE')

  const result = await f.service.decideImageIngest({
    namespace:f.namespace,idempotencyKey:'image-decision-complete-001',imageIngestId:f.imageIngestId,
    expectedVersion:2,confirmationRef:'confirm-image-002',
    decisions:[
      {factId:'fact_00000001',decision:'CORRECT',replacementValue:'http://127.0.0.1:18082/portal/login'},
      {factId:'fact_00000002',decision:'CONFIRM'}
    ]
  },{requestId:'request-image-002',actorType:'COZE'})
  assert.deepEqual({status:result.status,version:result.version,correctedCount:result.correctedCount,confirmedCount:result.confirmedCount},
    {status:'CONFIRMED',version:3,correctedCount:1,confirmedCount:1})

  const view = await f.service.getImageIngest(f.namespace,f.imageIngestId)
  assert.equal(view.status,'CONFIRMED')
  assert.equal(view.facts[0].value,'http://127.0.0.1:18082/portal/login')
  assert.equal(view.facts[0].userDecision,'CORRECT')
  assert.equal(view.facts[1].userDecision,'CONFIRM')
  assert.equal(view.facts.every(fact=>fact.selected),true)

  assert.throws(()=>f.database.connection.prepare(`UPDATE i10_image_fact_decisions SET decision='REJECT' WHERE fact_id='fact_00000002'`).run(),
    /I10_IMAGE_FACT_DECISION_IMMUTABLE/)
})

test('image decision rejects stale versions and secret-bearing corrections',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const decisions=[
    {factId:'fact_00000001',decision:'CONFIRM'},
    {factId:'fact_00000002',decision:'CORRECT',replacementValue:'密码=should-never-be-stored'}
  ]
  await assert.rejects(()=>f.service.decideImageIngest({
    namespace:f.namespace,idempotencyKey:'image-decision-secret-001',imageIngestId:f.imageIngestId,
    expectedVersion:2,confirmationRef:'confirm-image-003',decisions
  },{requestId:'request-image-003',actorType:'COZE'}),error=>error.errorCode==='I10_SECRET_INPUT_REJECTED')
  await assert.rejects(()=>f.service.decideImageIngest({
    namespace:f.namespace,idempotencyKey:'image-decision-stale-001',imageIngestId:f.imageIngestId,
    expectedVersion:1,confirmationRef:'confirm-image-004',
    decisions:[
      {factId:'fact_00000001',decision:'CONFIRM'},
      {factId:'fact_00000002',decision:'REJECT'}
    ]
  },{requestId:'request-image-004',actorType:'COZE'}),error=>error.errorCode==='I10_IMAGE_DECISION_VERSION_CONFLICT')
})
