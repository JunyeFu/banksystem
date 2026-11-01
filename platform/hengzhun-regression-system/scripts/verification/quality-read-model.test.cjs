'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { HarnessService } = require('../../dist/harness/src/service.js')
const { QualityReadModel } = require('../../dist/harness/src/quality-read-model.js')
const { startHarness } = require('../../dist/harness/src/server.js')

const productRoot = path.resolve(__dirname, '../..')
const migrationsDirectory = path.join(productRoot, 'harness', 'migrations')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-quality-read-'))
  const qualityPortalRoot = path.join(root, 'quality-dist')
  fs.mkdirSync(path.join(qualityPortalRoot, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(qualityPortalRoot, 'index.html'), '<!doctype html><title>Quality Portal</title>')
  fs.writeFileSync(path.join(qualityPortalRoot, 'assets', 'app.js'), 'globalThis.__quality=true')
  const databasePath = path.join(root, 'quality.sqlite')
  const database = await HarnessDatabase.open({ databasePath, migrationsDirectory, backupDirectory: path.join(root, 'backups') })
  const now = new Date().toISOString()
  const db = database.connection
  db.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES ('quality-test','ACTIVE',1,?,?)`).run(now, now)
  db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at)
    VALUES ('case_quality','quality-test',1,'VALIDATED','Customer transfer','Golden transfer','HIGH',?,?)`).run(now, now)
  db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at)
    VALUES ('case_quality',1,?,?,'TEST',?)`).run(JSON.stringify({ domain: 'PAYMENTS', steps: ['Sign in', { action: 'Transfer' }] }), '1'.repeat(64), now)
  db.prepare(`INSERT INTO plans(plan_id,namespace,case_id,case_version,version,status,summary_json,content_hash,created_at)
    VALUES ('plan_quality','quality-test','case_quality',1,1,'READY','{}',?,?)`).run('2'.repeat(64), now)
  db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,result_summary,version,created_at,updated_at)
    VALUES ('task_quality','quality-test','RUN_EXECUTE','SUCCEEDED',100,'case_quality','run_quality','2 assertions passed',1,?,?)`).run(now, now)
  db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at,started_at,completed_at,release_identity_hash)
    VALUES ('run_quality','quality-test','case_quality',1,'plan_quality','task_quality','PASSED',1,?,?,?,?)`).run(now, now, now, 'a'.repeat(64))
  db.prepare(`INSERT INTO artifacts(artifact_id,namespace,run_id,task_id,artifact_type,relative_path,sha256,byte_size,media_type,redaction_status,metadata_json,created_at)
    VALUES ('artifact_quality','quality-test','run_quality','task_quality','JSON','quality/result.json',?,42,'application/json','REDACTED',?,?)`)
    .run('5'.repeat(64), JSON.stringify({ correlationId: 'corr_quality_001' }), now)
  db.prepare(`INSERT INTO i9_knowledge_snapshot_refs(snapshot_id,namespace,platform,platform_resource_id,source_ref,source_version,content_hash,citation_ids_json,registered_at)
    VALUES ('snapshot_quality','quality-test','FLOWISE','historical-resource','docs/transfer.md','v1',?,'["citation-1"]',?)`).run('3'.repeat(64), now)
  return { root, databasePath, database, qualityPortalRoot, now }
}

test('quality read model projects Harness SQLite without mutations', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const quality = new QualityReadModel(f.database, undefined, () => undefined)
  assert.deepEqual(quality.overview(), {
    services: [{ name: 'Harness', status: 'HEALTHY', latencyMs: 0 }, { name: 'SQLite', status: 'HEALTHY', latencyMs: 0 }],
    caseCount: 1, runningCount: 0, passRate: 100, openIncidentCount: 0, releaseGate: 'PENDING'
  })
  assert.deepEqual(quality.cases().items[0], {
    caseId: 'case_quality', name: 'Customer transfer', domain: 'PAYMENTS', status: 'APPROVED', version: 1, updatedAt: f.now
  })
  assert.deepEqual(quality.caseDetail('case_quality').steps, ['Sign in', 'Transfer'])
  assert.equal(quality.runs()[0].status, 'COMPLETED')
  assert.equal(quality.runs()[0].correlationId, 'corr_quality_001')
  assert.equal(quality.runs()[0].releaseIdentity, 'a'.repeat(64))
  assert.deepEqual(quality.baselines(), [])
  assert.deepEqual(quality.schedules(), [])
  assert.deepEqual(quality.incidents(), [])
  assert.deepEqual(quality.knowledge()[0], { snapshotId: 'snapshot_quality', sourceRef: 'docs/transfer.md', sourceVersion: 'v1', sha256: '3'.repeat(64), citationCount: 1, registeredAt: f.now })
  assert.deepEqual(quality.releases(), [{ releaseId: 'a'.repeat(64), version: 'a'.repeat(64),
    status: 'DRAFT', benchmarkPassRate: 100, evidenceSha256: null, createdAt: f.now }])
  assert.throws(() => quality.caseDetail('missing'), error => error?.errorCode === 'QUALITY_CASE_NOT_FOUND')
  const releaseIdentity = 'a'.repeat(64)
  const service = new HarnessService(f.database, path.join(f.root, 'artifacts'), productRoot, releaseIdentity)
  const queued = service.enqueueRun(f.database.connection, {
    namespace: 'quality-test', caseId: 'case_quality', caseVersion: 1, planId: 'plan_quality', environment: 'local',
    credentialAlias: null
  }, { script_id: 'script_quality', script_version: 1, script_sha256: '4'.repeat(64), script_path: 'worker/quality.cjs', script_configuration: null }, f.now)
  const bound = f.database.connection.prepare('SELECT journey_id, release_identity_hash FROM runs WHERE run_id=?').get(queued.runId)
  assert.deepEqual(bound, { journey_id: null, release_identity_hash: releaseIdentity })
})

test('only a failed current-identity run blocks the overview; passing runs never create GO', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  const current = new QualityReadModel(f.database, 'a'.repeat(64), () => 'a'.repeat(64))
  assert.equal(current.overview().releaseGate, 'PENDING')
  f.database.connection.prepare("UPDATE runs SET status='FAILED' WHERE run_id='run_quality'").run()
  assert.equal(current.overview().releaseGate, 'BLOCKED')
  assert.equal(current.releases()[0].status, 'BLOCKED')
  assert.equal(new QualityReadModel(f.database, 'b'.repeat(64), () => 'b'.repeat(64)).overview().releaseGate, 'PENDING')
})

test('a later unexpected failure invalidates both overview and a previously READY release', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  f.database.connection.prepare(`INSERT INTO release_verifications
    (verification_id,release_identity_hash,decision,passed,required,evidence_sha256,result_json,created_at)
    VALUES ('verification_quality',?,'GO',28,28,?,'{"allowedFailedRunIds":[]}',?)`)
    .run('a'.repeat(64), '6'.repeat(64), f.now)
  const quality = new QualityReadModel(f.database, 'a'.repeat(64), () => 'a'.repeat(64))
  assert.equal(quality.overview().releaseGate, 'PASS')
  assert.equal(quality.releases()[0].status, 'READY')
  f.database.connection.prepare("UPDATE runs SET status='FAILED' WHERE run_id='run_quality'").run()
  assert.equal(quality.overview().releaseGate, 'BLOCKED')
  assert.equal(quality.releases()[0].status, 'BLOCKED')
})

test('source drift invalidates READY without a database write', async t => {
  const f = await fixture()
  t.after(async () => { await f.database.close(); fs.rmSync(f.root, { recursive: true, force: true }) })
  f.database.connection.prepare(`INSERT INTO release_verifications
    (verification_id,release_identity_hash,decision,passed,required,evidence_sha256,result_json,created_at)
    VALUES ('verification_quality',?,'GO',28,28,?,'{"allowedFailedRunIds":[]}',?)`)
    .run('a'.repeat(64), '6'.repeat(64), f.now)
  const quality = new QualityReadModel(f.database, 'a'.repeat(64), () => 'b'.repeat(64))
  assert.equal(quality.overview().releaseGate, 'BLOCKED')
  assert.equal(quality.releases()[0].status, 'BLOCKED')
  assert.equal(f.database.connection.prepare('SELECT decision FROM release_verifications').get().decision, 'GO')
})

test('bounded 200-run browser projection uses the existing L3 budget without dropping rows', async t => {
  const f=await fixture(),db=f.database.connection;
  for(let i=1;i<200;i++){
    db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,result_summary,version,created_at,updated_at)
      VALUES (?,'quality-test','RUN_EXECUTE','SUCCEEDED',100,'case_quality',?,?,1,?,?)`)
      .run(`task_capacity_${i}`,`run_capacity_${i}`,'x'.repeat(120),f.now,f.now);
    db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at,started_at,completed_at,release_identity_hash)
      VALUES (?,'quality-test','case_quality',1,'plan_quality',?,'PASSED',1,?,?,?,?)`)
      .run(`run_capacity_${i}`,`task_capacity_${i}`,f.now,f.now,f.now,'a'.repeat(64));
  }
  await f.database.close();
  const started=await startHarness({productRoot,databasePath:f.databasePath,migrationsDirectory,
    backupDirectory:path.join(f.root,'backups'),artifactRoot:path.join(f.root,'artifacts'),
    security:{serviceToken:'s'.repeat(32),allowedClients:['127.0.0.1']},schedulerIntervalMs:0,
    qualityPortalRoot:f.qualityPortalRoot,host:'127.0.0.1',port:0});
  t.after(async()=>{await new Promise(resolve=>started.server.close(resolve));await started.application.close();fs.rmSync(f.root,{recursive:true,force:true})});
  const response=await fetch(`http://127.0.0.1:${started.server.address().port}/api/quality/v1/runs`);
  assert.equal(response.status,200);
  const body=Buffer.from(await response.arrayBuffer());
  assert.ok(body.length>64*1024&&body.length<=128*1024);
  assert.equal(response.headers.get('x-hengzhun-output-level'),'L3');
  assert.equal(JSON.parse(body).length,200);
  const {serializeWithinBudget}=require('../../dist/harness/src/output-budget.js');
  assert.throws(()=>serializeWithinBudget({text:'x'.repeat(128*1024)},'L3'),error=>error.errorCode==='OUTPUT_BUDGET_EXCEEDED');
})

test('quality HTTP projection is public GET and rejects writes', async t => {
  const f = await fixture()
  await f.database.close()
  const started = await startHarness({
    productRoot, databasePath: f.databasePath, migrationsDirectory,
    backupDirectory: path.join(f.root, 'backups'), artifactRoot: path.join(f.root, 'artifacts'),
    security: { serviceToken: 's'.repeat(32), allowedClients: ['127.0.0.1'] }, schedulerIntervalMs: 0,
    qualityPortalRoot: f.qualityPortalRoot, host: '127.0.0.1', port: 0
  })
  t.after(async () => {
    await new Promise(resolve => started.server.close(resolve))
    await started.application.close()
    fs.rmSync(f.root, { recursive: true, force: true })
  })
  const address = started.server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api/quality/v1`
  const casesResponse = await fetch(`${base}/cases`)
  assert.equal(casesResponse.status, 200)
  assert.equal(casesResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await casesResponse.json()).items[0].caseId, 'case_quality')
  const knowledgeResponse = await fetch(`${base}/knowledge`)
  assert.equal(knowledgeResponse.status, 200)
  assert.equal((await knowledgeResponse.json())[0].snapshotId, 'snapshot_quality')
  const writeResponse = await fetch(`${base}/cases`, { method: 'POST' })
  assert.equal(writeResponse.status, 405)
  assert.equal((await writeResponse.json()).errorCode, 'QUALITY_READ_ONLY')
  const pageResponse = await fetch(`http://127.0.0.1:${address.port}/quality/cases`)
  assert.equal(pageResponse.status, 200)
  assert.match(await pageResponse.text(), /Quality Portal/)
  const assetResponse = await fetch(`http://127.0.0.1:${address.port}/quality/assets/app.js`)
  assert.equal(assetResponse.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(await assetResponse.text(), 'globalThis.__quality=true')
  assert.equal(started.application.database.connection.prepare('SELECT count(*) AS count FROM security_events').get().count, 0)
})
