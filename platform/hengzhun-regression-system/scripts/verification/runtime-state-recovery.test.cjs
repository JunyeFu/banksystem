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
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-runtime-state-recovery-'))
  const database=await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  const namespace='runtime-recovery-test'
  const now='2000-01-01T00:00:00.000Z'
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace,now,now)
  return{root,database,service:new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts'))),namespace,now}
}

function insertOrphanJourney(f,id='journey_12345678-1234-1234-1234-123456789abc'){
  f.database.connection.prepare(`INSERT INTO i10_interaction_journeys(
    journey_id,namespace,session_ref,idempotency_key,request_intent,input_type,stage,status,
    input_envelope_json,missing_fields_json,allowed_actions_json,next_action_json,references_json,
    progress_json,error_json,version,recoverable,created_at,updated_at
  ) VALUES (?,?,?,?,?,'NATURAL_LANGUAGE','PROCESSING_AUTHORING','PROCESSING',?,?,?,?,?,?,NULL,1,1,?,?)`).run(
    id,f.namespace,'session_12345678-1234-1234-1234-123456789abc','runtime-recovery-001','CASE_AUTHORING',
    '{}','[]','[]','{}','{}','{}','1999-12-31T23:00:00.000Z','1999-12-31T23:00:00.000Z'
  )
  return id
}

function insertAttachmentOrphanJourney(f,stage='PROCESSING_INGEST',id='journey_22345678-1234-1234-1234-123456789abc'){
  f.database.connection.prepare(`INSERT INTO i10_interaction_journeys(
    journey_id,namespace,session_ref,idempotency_key,request_intent,input_type,stage,status,
    input_envelope_json,missing_fields_json,allowed_actions_json,next_action_json,references_json,
    progress_json,error_json,version,recoverable,created_at,updated_at
  ) VALUES (?,?,?,?,?,'CASE_FILE',?,'PROCESSING',?,?,?,?,?,?,NULL,1,1,?,?)`).run(
    id,f.namespace,'session_22345678-1234-1234-1234-123456789abc',`runtime-attachment-${stage}`,'CASE_AUTHORING',stage,
    '{}','[]','[]','{}','{}','{}','1999-12-31T23:00:00.000Z','1999-12-31T23:00:00.000Z'
  )
  return id
}

test('expired verification transitions once with its actual prior status',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const created=await f.service.reportVerificationChallenge({
    namespace:f.namespace,taskRef:'task_12345678-1234-1234-1234-123456789abc',verificationType:'UKEY',actionOrdinal:4,
    detectionSummary:'网页验证已过期',userPreparation:'无需提供秘密。',workerId:'worker-test',expiresAt:'2000-01-01T00:00:00.000Z'
  })
  const result=await f.service.reconcileExpiredRuntimeState(new Date('2000-01-01T00:01:00.000Z'))
  assert.equal(result.expiredChallenges,1)
  const challenge=f.database.connection.prepare('SELECT status FROM i10_verification_challenges WHERE challenge_id=?').get(created.challengeId)
  assert.equal(challenge.status,'EXPIRED')
  const event=f.database.connection.prepare(`SELECT from_status,to_status,actor_type FROM i10_verification_events WHERE challenge_id=? AND actor_type='SYSTEM'`).get(created.challengeId)
  assert.deepEqual(event,{from_status:'WAITING_USER_PREPARATION',to_status:'EXPIRED',actor_type:'SYSTEM'})
  const second=await f.service.reconcileExpiredRuntimeState(new Date('2000-01-01T00:02:00.000Z'))
  assert.equal(second.expiredChallenges,0)
})

test('orphaned authoring journey fails closed with an explicit retry action',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const journeyId=insertOrphanJourney(f)
  const result=await f.service.reconcileExpiredRuntimeState(new Date('2000-01-01T00:20:00.000Z'))
  assert.equal(result.orphanedAuthoringJourneys,1)
  const row=f.database.connection.prepare(`SELECT stage,status,allowed_actions_json,error_json FROM i10_interaction_journeys WHERE journey_id=?`).get(journeyId)
  assert.equal(row.stage,'FAILED_ACTIONABLE')
  assert.equal(row.status,'FAILED')
  assert.deepEqual(JSON.parse(row.allowed_actions_json),['RETRY_AUTHORING','CANCEL'])
  assert.equal(JSON.parse(row.error_json).errorCode,'I10_AUTHORING_ORPHANED')
  const event=f.database.connection.prepare(`SELECT event_type,from_stage,to_stage FROM i10_interaction_events WHERE journey_id=?`).get(journeyId)
  assert.deepEqual(event,{event_type:'ORPHAN_RECONCILED',from_stage:'PROCESSING_AUTHORING',to_stage:'FAILED_ACTIONABLE'})
})

test('orphaned attachment journey fails closed instead of remaining processing forever',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const journeyId=insertAttachmentOrphanJourney(f)
  const result=await f.service.reconcileExpiredRuntimeState(new Date('2000-01-01T00:20:00.000Z'))
  assert.equal(result.orphanedAttachmentJourneys,1)
  const row=f.database.connection.prepare(`SELECT stage,status,allowed_actions_json,error_json FROM i10_interaction_journeys WHERE journey_id=?`).get(journeyId)
  assert.equal(row.stage,'FAILED_ACTIONABLE')
  assert.equal(row.status,'FAILED')
  assert.deepEqual(JSON.parse(row.allowed_actions_json),['RETRY_INGEST','CANCEL'])
  assert.equal(JSON.parse(row.error_json).errorCode,'I10_INGEST_ORPHANED')
  const event=f.database.connection.prepare(`SELECT event_type,from_stage,to_stage FROM i10_interaction_events WHERE journey_id=?`).get(journeyId)
  assert.deepEqual(event,{event_type:'ORPHAN_RECONCILED',from_stage:'PROCESSING_INGEST',to_stage:'FAILED_ACTIONABLE'})
})
