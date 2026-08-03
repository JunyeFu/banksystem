'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I10Service } = require('../../dist/harness/src/i10/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')

const digest = value => crypto.createHash('sha256').update(value).digest('hex')

test('OCR-only image analysis creates readable artifacts, temporary previews and purges images after confirmation', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-image-delivery-'))
  const database=await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  t.after(async()=>{await database.close();fs.rmSync(root,{recursive:true,force:true})})
  const service=new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts')))
  const namespace='image-delivery-test'
  const imageIngestId='imageingest_77777777-7777-4777-8777-777777777777'
  const workerId='worker_image_delivery'
  const now=new Date().toISOString()
  const source=Buffer.from('local-image-fixture')
  const sourceHash=digest(source)
  const evidenceRelative=`.data/image-ingest/${imageIngestId}/redacted/image-001.png`
  const evidenceAbsolute=path.join(root,...evidenceRelative.split('/'))
  fs.mkdirSync(path.dirname(evidenceAbsolute),{recursive:true})
  fs.writeFileSync(evidenceAbsolute,source)
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace,now,now)
  database.connection.prepare(`INSERT INTO i10_image_ingest_jobs(
    image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,status,image_count,total_size_bytes,version,lease_owner,lease_expires_at,created_at,updated_at
  ) VALUES (?,?,?,?,?,'PROCESSING',1,?,1,?,?,?,?)`).run(imageIngestId,namespace,'delivery-job-001','source-session-001','NATURAL_LANGUAGE',source.length,workerId,new Date(Date.now()+60000).toISOString(),now,now)
  database.connection.prepare(`INSERT INTO i10_supporting_images(
    image_id,image_ingest_id,ordinal,flowise_file_ref,original_filename,source_sha256,source_size_bytes,created_at
  ) VALUES (?,?,?,?,?,?,?,?)`).run('image_delivery_001',imageIngestId,1,'legacy-file-reference-0001','profile.png',sourceHash,source.length,now)

  const completion=await service.completeImageIngest({
    workerId,imageIngestId,
    packets:[{ordinal:1,sourceSha256:sourceHash,redactedImagePath:evidenceRelative,redactedImageSha256:sourceHash,ocrText:'个人资料 客户姓名',ocrTextHash:digest('个人资料 客户姓名'),language:'zh',confidence:0.9}],
    facts:[{factId:'fact_delivery_0001',field:'EXPECTED_RESULT',value:'个人资料页显示客户姓名',provenanceRefs:[`image:1:${sourceHash}`],confidence:0.95,selected:true,requiresUserConfirmation:true}],
    controllerInvocation:{invocation:'REAL',provider:'local',model:'controller',inputTokens:10,outputTokens:10},
    recognitionBranches:{
      ocr:{status:'SUCCEEDED',durationMs:120,engine:'PPU_PADDLE_OCR_V5_ONNX_CPU',modelSha256:'a'.repeat(64),processedImageCount:1,recognizedRegionCount:2}
    }
  })
  assert.equal(completion.artifactIds.length,2)
  const before=await service.getImageIngest(namespace,imageIngestId)
  assert.match(before.humanBriefMarkdown,/识别结果简报/)
  assert.match(before.artifactMarkdown,/图片分析报告\.md/)
  assert.match(before.previewMarkdown,/查看第1张图片/)
  assert.equal(before.previewCards.length,1)
  assert.equal(Object.hasOwn(before.recognitionBranches,'vision'),false)
  assert.doesNotMatch(before.humanBriefMarkdown,/\{"facts"/)
  const previewToken = new URL(before.previewCards[0].href).pathname.split('/').at(-1)
  const preview = await service.consumeImagePreview(previewToken)
  assert.equal(preview.sha256,sourceHash)
  const decision=await service.decideImageIngest({
    namespace,idempotencyKey:'delivery-decision-001',imageIngestId,expectedVersion:2,
    confirmationRef:'confirmation-delivery-001',
    decisions:[{factId:'fact_delivery_0001',decision:'CONFIRM'}]
  },{requestId:'request-delivery-001',actorType:'COZE'})
  assert.equal(decision.lifecycleStatus,'IMAGE_PURGED',JSON.stringify(decision))
  assert.equal(decision.purgeStatus,'PURGED')
  assert.equal(fs.existsSync(path.join(root,'.data','image-ingest',imageIngestId)),false)
  const after=await service.getImageIngest(namespace,imageIngestId)
  assert.equal(after.lifecycleStatus,'IMAGE_PURGED')
  assert.equal(after.purgeStatus,'PURGED')
  await assert.rejects(()=>service.consumeImagePreview(previewToken),error=>error?.errorCode==='I10_IMAGE_PREVIEW_NOT_ACTIVE')
})

test('unconfirmed image analysis is failed closed and purged after 72 hours', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-image-expiry-'))
  const database=await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  t.after(async()=>{await database.close();fs.rmSync(root,{recursive:true,force:true})})
  const service=new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts')))
  const namespace='image-expiry-test'
  const imageIngestId='imageingest_88888888-8888-4888-8888-888888888888'
  const old=new Date(Date.now()-73*60*60_000).toISOString()
  fs.mkdirSync(path.join(root,'.data','image-ingest',imageIngestId,'redacted'),{recursive:true})
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace,old,old)
  database.connection.prepare(`INSERT INTO i10_image_ingest_jobs(
    image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,status,image_count,total_size_bytes,version,created_at,updated_at
  ) VALUES (?,?,?,?,?,'WAITING_USER',1,1,2,?,?)`).run(imageIngestId,namespace,'expiry-job-001','source-session-002','NATURAL_LANGUAGE',old,old)
  database.connection.prepare(`INSERT INTO i10_image_ocr_deliveries(
    image_ingest_id,ocr_status,ocr_engine,ocr_model_sha256,ocr_duration_ms,ocr_processed_image_count,
    ocr_recognized_region_count,purge_status,preview_expires_at,created_at,updated_at
  ) VALUES (?,'SUCCEEDED','PPU_PADDLE_OCR_V5_ONNX_CPU',?,10,1,1,'PENDING_CONFIRMATION',?,?,?)`)
    .run(imageIngestId,'b'.repeat(64),new Date(Date.now()-58*60*60_000).toISOString(),old,old)
  const cleanup=await service.cleanupAbandonedImageIngests(new Date())
  assert.equal(cleanup.purged,1)
  assert.equal(fs.existsSync(path.join(root,'.data','image-ingest',imageIngestId)),false)
  const row=database.connection.prepare(`SELECT status,error_code FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(imageIngestId)
  assert.deepEqual(row,{status:'FAILED',error_code:'I10_IMAGE_CONFIRMATION_EXPIRED'})
  const delivery=database.connection.prepare(`SELECT purge_status FROM i10_image_ocr_deliveries WHERE image_ingest_id=?`).get(imageIngestId)
  assert.equal(delivery.purge_status,'EXPIRED_PURGED')
})
