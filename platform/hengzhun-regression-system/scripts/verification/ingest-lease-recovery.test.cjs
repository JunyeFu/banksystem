'use strict'

const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {HarnessDatabase}=require('../../dist/harness/src/database.js')
const {I10Service}=require('../../dist/harness/src/i10/service.js')
const {ArtifactStore}=require('../../dist/harness/src/artifact-store.js')

async function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-lease-recovery-'))
  const database=await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  const service=new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts')))
  const namespace='lease-recovery-test'
  const now=new Date().toISOString()
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace,now,now)
  return{root,database,service,namespace,now}
}

function attachment(root,ref,name,bytes){
  const dir=path.join(root,'.data','flowise-attachments',ref)
  fs.mkdirSync(dir,{recursive:true})
  fs.writeFileSync(path.join(dir,name),bytes)
}

test('expired video lease is reclaimed once while an active lease remains exclusive',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  attachment(f.root,'video-ref-001','case.mp4',Buffer.from('video-fixture'))
  const id='ingest_12345678-1234-1234-1234-123456789abc'
  f.database.connection.prepare(`INSERT INTO i10_ingest_jobs(
    ingest_job_id,namespace,idempotency_key,input_type,flowise_file_ref,original_filename,source_sha256,source_size_bytes,
    hints_json,status,missing_fields_json,draft_count,version,lease_owner,lease_expires_at,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,'{}','PROCESSING','[]',0,1,'old-worker','2000-01-01T00:00:00.000Z',?,?)`)
    .run(id,f.namespace,'lease-video-001','VIDEO','video-ref-001','case.mp4','1'.repeat(64),13,f.now,f.now)
  const claimed=await f.service.claimVideoIngest('new-worker')
  assert.equal(claimed.status,'CLAIMED')
  assert.equal(claimed.ingestJobId,id)
  assert.equal(claimed.workerId,'new-worker')
  assert.equal((await f.service.claimVideoIngest('other-worker')).status,'EMPTY')
  const row=f.database.connection.prepare(`SELECT lease_owner,version FROM i10_ingest_jobs WHERE ingest_job_id=?`).get(id)
  assert.equal(row.lease_owner,'new-worker')
  assert.equal(row.version,2)
})

test('expired image lease is reclaimed once while an active lease remains exclusive',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  attachment(f.root,'image-ref-001','case.png',Buffer.from([137,80,78,71,13,10,26,10,0]))
  const id='imageingest_12345678-1234-1234-1234-123456789abc'
  f.database.connection.prepare(`INSERT INTO i10_image_ingest_jobs(
    image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,status,image_count,total_size_bytes,
    version,lease_owner,lease_expires_at,created_at,updated_at
  ) VALUES (?,?,?,?,?,'PROCESSING',1,9,1,'old-worker','2000-01-01T00:00:00.000Z',?,?)`)
    .run(id,f.namespace,'lease-image-001','source-ref-001','NATURAL_LANGUAGE',f.now,f.now)
  f.database.connection.prepare(`INSERT INTO i10_supporting_images(
    image_id,image_ingest_id,ordinal,flowise_file_ref,original_filename,source_sha256,source_size_bytes,created_at
  ) VALUES ('image_12345678-1234-1234-1234-123456789abc',?,1,'image-ref-001','case.png',?,9,?)`)
    .run(id,'2'.repeat(64),f.now)
  const claimed=await f.service.claimImageIngest('new-worker')
  assert.equal(claimed.status,'CLAIMED')
  assert.equal(claimed.imageIngestId,id)
  assert.equal(claimed.workerId,'new-worker')
  assert.equal((await f.service.claimImageIngest('other-worker')).status,'EMPTY')
  const row=f.database.connection.prepare(`SELECT lease_owner,version FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(id)
  assert.equal(row.lease_owner,'new-worker')
  assert.equal(row.version,2)
})

test('missing image attachment becomes terminal and cannot starve a later valid image job',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const missingId='imageingest_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const validId='imageingest_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const insertJob=f.database.connection.prepare(`INSERT INTO i10_image_ingest_jobs(
    image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,status,image_count,total_size_bytes,version,created_at,updated_at
  ) VALUES (?,?,?,?,?,'PROCESSING',1,9,1,?,?)`)
  const insertImage=f.database.connection.prepare(`INSERT INTO i10_supporting_images(
    image_id,image_ingest_id,ordinal,flowise_file_ref,original_filename,source_sha256,source_size_bytes,created_at
  ) VALUES (?,?,?,?,?,?,?,?)`)
  insertJob.run(missingId,f.namespace,'missing-image-001','source-missing','NATURAL_LANGUAGE',f.now,f.now)
  insertImage.run('image_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',missingId,1,'missing-ref','case.png','3'.repeat(64),9,f.now)
  attachment(f.root,'valid-ref','case.png',Buffer.from([137,80,78,71,13,10,26,10,0]))
  insertJob.run(validId,f.namespace,'valid-image-001','source-valid','NATURAL_LANGUAGE',f.now,f.now)
  insertImage.run('image_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',validId,1,'valid-ref','case.png','4'.repeat(64),9,f.now)
  const skipped=await f.service.claimImageIngest('new-worker')
  assert.equal(skipped.status,'SKIPPED_FAILED')
  assert.equal(skipped.errorCode,'I10_FLOWISE_ATTACHMENT_NOT_FOUND')
  const claimed=await f.service.claimImageIngest('new-worker')
  assert.equal(claimed.status,'CLAIMED')
  assert.equal(claimed.imageIngestId,validId)
  const missing=f.database.connection.prepare(`SELECT status,error_code,lease_owner FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(missingId)
  assert.deepEqual(missing,{status:'FAILED',error_code:'I10_FLOWISE_ATTACHMENT_NOT_FOUND',lease_owner:null})
})
