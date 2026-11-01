'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto')
const {generatedSource}=require('../../dist/harness/src/i8/script-package-builder.js')

const formal = require('../../worker/src/i8-formal-runner.cjs')

test('formal evidence helpers redact DOM and network values', () => {
  const dom = formal.buildDomEvidence({
    title: 'Private customer name', path: '/portal/dashboard', nodeCount: 2,
    nodes: [{ tag: 'input', role: 'textbox', type: 'password', visible: true, attributeHash: 'a'.repeat(64), textHash: 'b'.repeat(64) }],
  })
  const network = formal.buildNetworkEvidence([
    { phase: 'request', method: 'POST', url: 'http://127.0.0.1:18443/api/accounts?token=private', resourceType: 'fetch' },
    { phase: 'response', method: 'POST', url: 'http://127.0.0.1:18443/api/accounts?token=private', resourceType: 'fetch', status: 200 },
  ])
  const serialized = JSON.stringify({ dom, network })
  assert.equal(dom.schemaVersion, 'hengzhun-dom-evidence/v1')
  assert.equal(dom.titleHash.length, 64)
  assert.equal(Object.hasOwn(dom, 'title'), false)
  assert.deepEqual(network.events.map(item => item.url), [
    'http://127.0.0.1:18443/api/accounts', 'http://127.0.0.1:18443/api/accounts',
  ])
  assert.doesNotMatch(serialized, /Private customer name|token=private|password/i)
})

test('execution ledger binds immutable evidence digests without paths or bytes', () => {
  const ledger = formal.buildEvidenceLedger({
    task: { taskId: 'task_12345678', runId: 'run_12345678', caseId: 'case_12345678' },
    candidateId: 'candidate_12345678', scriptHash: 'a'.repeat(64),
    entries: [
      { evidenceKind: 'DOM', bytes: Buffer.from('dom') },
      { evidenceKind: 'TRACE', bytes: Buffer.from('trace') },
    ],
  })
  assert.equal(ledger.schemaVersion, 'hengzhun-execution-evidence-ledger/v1')
  assert.equal(ledger.entries.length, 2)
  assert.ok(ledger.entries.every(item => /^[a-f0-9]{64}$/.test(item.sha256) && item.byteSize > 0))
  assert.ok(ledger.entries.every(item => !Object.hasOwn(item, 'bytes')))
  assert.doesNotMatch(JSON.stringify(ledger), /(?:path|base64|credential)/i)
})

test('real browser assertion failure returns the frozen failing step and complete evidence',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rf057-assertion-'));
  const server=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<html><title>CI probe</title><span data-testid="probe">PUBLISHED</span></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
  const dsl={schemaVersion:'HENGZHUN_DSL_V2',executablePlanId:'plan_ci',steps:[
    {stepId:'dsl_01',sourceActionId:'action_01',operation:'goto',routeRef:'PROBE'},
    {stepId:'dsl_02',sourceActionId:'action_02',operation:'expectText',targetRef:'DOCUMENT.STATUS',expectedTextRef:'EXPECTED.STATUS'},
  ]};
  const source=generatedSource(dsl,{'DOCUMENT.STATUS':{kind:'TEST_ID',value:'probe'}},{'EXPECTED.STATUS':'DRAFT'},{PROBE:'/portal/login'});
  const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
  const candidateId='candidate_'+ 'a'.repeat(40);
  const manifest={candidateId,generatorVersion:'hengzhun-script-package-builder-1.0.0',dependencyAllowlist:[]};
  const relativeDirectory=`.data/candidates/ci-namespace/${candidateId}`;fs.mkdirSync(path.join(root,relativeDirectory),{recursive:true});
  fs.writeFileSync(path.join(root,relativeDirectory,'script.cjs'),source);
  fs.writeFileSync(path.join(root,relativeDirectory,'manifest.json'),JSON.stringify(manifest));
  const task={namespace:'ci',taskId:'task_ci',runId:'run_ci',caseId:'case_ci',caseVersion:1,execution:{
    candidate:{candidateId,relativeDirectory,scriptHash:sha(source),manifestHash:sha(JSON.stringify({candidateId,dependencyAllowlist:[],generatorVersion:'hengzhun-script-package-builder-1.0.0'}))},
  }};
  const result=await formal.executeI8FormalRun(task,{HENGZHUN_PORTAL_BASE_URL:`http://127.0.0.1:${server.address().port}`},
    {productRoot:root,runtimeProductRoot:path.resolve(__dirname,'../..'),credential:{username:'ci-user',password:'ci-password'}});
  assert.equal(result.outcome,'FAILED');assert.equal(result.errorCode,'I8_FORMAL_ASSERTION_FAILED');
  const kinds=result.evidence.map(e=>e.metadata.evidenceKind);
  for(const kind of ['REPORT','DOM','SCREENSHOT','TRACE','NETWORK','LEDGER'])assert.ok(kinds.includes(kind),kind);
  assert.equal(result.failureDiagnostic.stepId,'dsl_02');assert.equal(result.failureDiagnostic.operation,'expectText');
});
