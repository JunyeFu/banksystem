'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {HarnessDatabase}=require('../../dist/harness/src/database.js');
const {QualityReadModel}=require('../../dist/harness/src/quality-read-model.js');
const {serializeWithinBudget}=require('../../dist/harness/src/output-budget.js');
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rf057-quality-'));
  const db=await HarnessDatabase.open({databasePath:path.join(root,'data.sqlite'),migrationsDirectory:path.resolve(__dirname,'../../harness/migrations'),backupDirectory:path.join(root,'backups')});
  t.after(async()=>{await db.close();fs.rmSync(root,{recursive:true,force:true});});
  const now='2026-09-28T00:00:00.000Z';
  db.connection.prepare("INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES ('pagination','ACTIVE',1,?,?)").run(now,now);
  for(let i=0;i<350;i++){
    const id='case_'+String(i).padStart(4,'0');
    db.connection.prepare("INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,'pagination',1,?,?,'','LOW',?,?)").run(id,i%2?'VALIDATED':'DRAFT','银行转账'+i+'中'.repeat(200),now,now);
    db.connection.prepare("INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,1,?,?,'TEST',?)").run(id,JSON.stringify({domain:i%2?'PAYMENTS':'ACCOUNTS'}),'a'.repeat(64),now);
  }
  return new QualityReadModel(db, undefined, () => undefined);
}
test('bounded pages retain every case exactly once and fit the L1 budget',async t=>{
  const quality=await fixture(t);const ids=[];let cursor;
  do{
    const page=quality.cases({limit:100,cursor});
    assert.ok(page.items.length>0 && page.items.length<=100);
    assert.ok(serializeWithinBudget(page,'L1').byteLength<=16384);
    ids.push(...page.items.map(x=>x.caseId));
    assert.equal(page.hasMore,page.nextCursor!==null);
    cursor=page.nextCursor;
  }while(cursor);
  assert.equal(ids.length,350);assert.equal(new Set(ids).size,350);
  assert.deepEqual(ids,[...ids].sort());
});
test('search and status are server-side and invalid cursors fail explicitly',async t=>{
  const quality=await fixture(t);
  const page=quality.cases({q:'银行转账349',status:'APPROVED'});
  assert.deepEqual(page.items.map(x=>x.caseId),['case_0349']);
  assert.equal(page.hasMore,false);
  assert.equal(quality.cases({q:'ACCOUNTS',status:'APPROVED'}).items.length,0);
  assert.throws(()=>quality.cases({cursor:'not-a-cursor'}),e=>e.errorCode==='QUALITY_CASE_QUERY_INVALID');
  assert.throws(()=>quality.cases({limit:101}),e=>e.errorCode==='QUALITY_CASE_QUERY_INVALID');
});
