'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
const {HarnessDatabase}=require('../../dist/harness/src/database.js')
const {ControllerSessionRepository}=require('../../dist/harness/src/controller-session-repository.js')
const hash=text=>crypto.createHash('sha256').update(text).digest('hex'),namespace='isolated-sessions'
const envelope=(i=1)=>({schemaVersion:'hengzhun-session-envelope/v1',cipher:'WINDOWS_DPAPI_CURRENT_USER',sessionId:`session-${String(i).padStart(32,'0')}`,
  revision:1,releaseIdentityHash:'a'.repeat(64),namespaceHash:hash(namespace),threadIdHash:hash('thread'),journeyIdHash:hash('journey'),
  ciphertextSha256:hash('opaque-test-only'),ciphertextBase64:Buffer.from('opaque-test-only').toString('base64'),
  status:'ACTIVE',createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z',expiresAt:'2026-12-05T00:00:00.000Z'})
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hz-session-cas-'))
  const db=await HarnessDatabase.open({databasePath:path.join(root,'state.sqlite'),backupDirectory:path.join(root,'backups'),migrationsDirectory:path.resolve(__dirname,'../../harness/migrations')})
  t.after(async()=>{await db.close();fs.rmSync(root,{recursive:true,force:true})})
  const repo=new ControllerSessionRepository(db)
  return {repo,call:(op,input)=>repo.execute(op,namespace,input)}
}
test('SQLite sessions CAS admits only one same-revision write and preserves the winning envelope',async t=>{
  const f=await fixture(t),e=envelope();await f.call('save',{expectedRevision:0,envelope:e})
  await assert.rejects(f.call('save',{expectedRevision:0,envelope:e}),error=>error.errorCode==='SESSION_REVISION_CONFLICT')
  const outcomes=await Promise.allSettled(['b','c'].map(marker=>f.call('save',{expectedRevision:1,envelope:{...e,revision:2,journeyIdHash:marker.repeat(64)}})))
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1)
  assert.equal(outcomes.filter(o=>o.status==='rejected'&&o.reason.errorCode==='SESSION_REVISION_CONFLICT').length,1)
  assert.equal((await f.call('load',{sessionId:e.sessionId})).envelope.revision,2)
})
test('session namespace, capacity, import uniqueness and paginated metadata are enforced',async t=>{
  const f=await fixture(t),e=envelope()
  await assert.rejects(f.call('save',{expectedRevision:0,envelope:{...e,namespaceHash:'b'.repeat(64)}}),error=>error.errorCode==='SESSION_NAMESPACE_FORBIDDEN')
  await assert.rejects(f.call('save',{expectedRevision:0,envelope:{...e,ciphertextBase64:'A'.repeat(123000)}}),error=>error.errorCode==='SESSION_ENVELOPE_TOO_LARGE')
  await f.call('import',{expectedRevision:0,envelope:{...e,revision:7}})
  await assert.rejects(f.call('import',{expectedRevision:0,envelope:{...e,revision:7}}),error=>error.errorCode==='SESSION_REVISION_CONFLICT')
  assert.equal((await f.call('load',{sessionId:e.sessionId})).envelope.revision,7)
  await Promise.all(Array.from({length:51},(_,i)=>f.call('save',{expectedRevision:0,envelope:envelope(i+2)})))
  const first=await f.call('list',{}),second=await f.call('list',{cursor:first.nextCursor})
  assert.equal(first.sessions.length,50);assert.equal(second.sessions.length,2)
  assert.equal(JSON.stringify(first).includes('ciphertext'),false)
  await assert.rejects(f.repo.execute('load','other-namespace',{sessionId:e.sessionId}),error=>error.errorCode==='SESSION_NOT_FOUND')
})
