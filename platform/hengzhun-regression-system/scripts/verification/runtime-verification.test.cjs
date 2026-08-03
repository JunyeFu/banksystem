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
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-runtime-verification-'))
  const database=await HarnessDatabase.open({
    databasePath:path.join(root,'data.sqlite'),
    migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory:path.join(root,'backups')
  })
  const service=new I10Service(database,root,new ArtifactStore(database,path.join(root,'artifacts')))
  const namespace='verification-test'
  const result=await service.reportVerificationChallenge({
    namespace,taskRef:'candidatejob_12345678-1234-1234-1234-123456789abc',
    verificationType:'UKEY',actionOrdinal:4,detectionSummary:'页面要求U盾确认',
    userPreparation:'请插入测试U盾并在设备上确认',workerId:'worker-test-001'
  })
  return{root,database,service,namespace,challengeId:result.challengeId}
}

test('verification can be discovered by task and requires both human gates',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const discovered=f.service.getVerificationByTask(f.namespace,'candidatejob_12345678-1234-1234-1234-123456789abc')
  assert.equal(discovered.challengeId,f.challengeId)
  assert.equal(discovered.status,'WAITING_USER_PREPARATION')
  const ready=await f.service.decideVerification({
    namespace:f.namespace,idempotencyKey:'verification-ready-001',challengeId:f.challengeId,
    expectedVersion:1,decision:'USER_READY',confirmationRef:'verification-confirm-001'
  })
  assert.equal(ready.status,'WAITING_USER_ACTION')
  assert.equal(ready.resumeAllowed,false)
  const completed=await f.service.decideVerification({
    namespace:f.namespace,idempotencyKey:'verification-complete-001',challengeId:f.challengeId,
    expectedVersion:2,decision:'USER_ACTION_COMPLETED',confirmationRef:'verification-confirm-002'
  })
  assert.equal(completed.status,'VERIFICATION_CONFIRMED')
  assert.equal(completed.resumeAllowed,true)
  const resumed=await f.service.resumeVerification(f.namespace,f.challengeId,'worker-test-001')
  assert.equal(resumed.status,'RESUMED')
})

test('verification cancellation fails closed and cannot be resumed',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const cancelled=await f.service.decideVerification({
    namespace:f.namespace,idempotencyKey:'verification-cancel-001',challengeId:f.challengeId,
    expectedVersion:1,decision:'CANCEL',confirmationRef:'verification-confirm-003'
  })
  assert.equal(cancelled.status,'CANCELLED')
  await assert.rejects(()=>f.service.resumeVerification(f.namespace,f.challengeId,'worker-test-001'),
    error=>error.errorCode==='I10_VERIFICATION_RESUME_NOT_ALLOWED')
})

test('the same task action and page fingerprint creates one challenge only',async t=>{
  const f=await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const base={
    namespace:f.namespace,taskRef:'candidatejob_98765432-1234-1234-1234-123456789abc',
    verificationType:'UKEY',actionOrdinal:6,detectionSummary:'转账首次确认后的网页验证页',
    userPreparation:'网页验证按钮已经作者化。',workerId:'worker-test-001',
    pageFingerprint:'a'.repeat(64),policyMode:'AUTO_PERSISTED_UKEY'
  }
  const first=await f.service.reportVerificationChallenge(base)
  const second=await f.service.reportVerificationChallenge(base)
  assert.equal(second.challengeId,first.challengeId)
  assert.equal(second.deduplicated,true)
  const count=f.database.connection.prepare(`SELECT COUNT(*) AS count FROM i10_verification_challenges WHERE task_ref=? AND action_ordinal=? AND page_fingerprint=?`).get(base.taskRef,base.actionOrdinal,base.pageFingerprint)
  assert.equal(Number(count.count),1)
})
