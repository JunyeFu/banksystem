'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I10Service } = require('../../dist/harness/src/i10/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-journey-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root,'data.sqlite'),
    migrationsDirectory: path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory: path.join(root,'backups')
  })
  const artifacts = new ArtifactStore(database,path.join(root,'artifacts'))
  const service = new I10Service(database,root,artifacts)
  const now = new Date().toISOString()
  const namespace = 'journey-test'
  const credentialRef = 'credential_12345678-1234-1234-1234-123456789abc'
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(namespace,now,now)
  database.connection.prepare(`INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at)
    VALUES ('credsession_12345678-1234-1234-1234-123456789abc',?,?,? ,?,'READY',?,1,?,?,?)`)
    .run(namespace,'journey-test-credential','测试凭据','0'.repeat(64),credentialRef,'2099-01-01T00:00:00.000Z',now,now)
  database.connection.prepare(`INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at)
    VALUES (?,?,'credsession_12345678-1234-1234-1234-123456789abc','.data/credentials/test.bin',?,'WINDOWS_DPAPI_CURRENT_USER',?)`)
    .run(credentialRef,namespace,'1'.repeat(64),now)
  return { root,database,service,namespace,credentialRef }
}

function validDraft(credentialRef) {
  return {
    schemaVersion:'hengzhun-i10-case-draft-v1',
    title:'门户登录',
    objective:'验证登录',
    summary:'验证门户登录和资料一致',
    targetSystem:'复兴银行门户',
    entryUrl:'http://127.0.0.1:18082/portal/login',
    preconditions:['门户可访问'],
    steps:[{action:'打开登录页',expected:'显示登录页'}],
    assertions:['登录页可见'],
    caseFacts:[],
    actionStepsV2:[],
    verificationRequirements:[],
    credentialRef,
    source:{inputType:'NATURAL_LANGUAGE',sourceRef:'session-test-001',sourceHash:'2'.repeat(64),provenanceSummary:'测试输入'},
    confidence:0.9,
    missingFields:[],
    confirmationStatus:'CONFIRMED',
    authoringStrategy:'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',
    executionStrategy:'PLAYWRIGHT_VALIDATED_ONLY',
    evidenceStrategy:'REDACTED_HASHED_EVIDENCE'
  }
}

test('journey blocks incomplete input before business MCP submission',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-incomplete-001',sessionRef:'session-test-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    supportingImages:[]
  },{requestId:'request-test-001',actorType:'COZE'})
  assert.equal(result.status,'NEEDS_INPUT')
  assert.equal(result.stage,'NEEDS_INPUT')
  assert.ok(result.missingFields.includes('credentialRef'))
  assert.ok(result.missingFields.includes('I10_ENTRY_URL_REQUIRED'))
  assert.deepEqual(result.allowedActions,[])
})

test('missing and invalid entry URLs produce one precise, mutually exclusive hard-gate code',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const base = {
    namespace:f.namespace,requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',
    naturalLanguage:'验证门户登录和个人资料信息一致性',targetSystem:'复兴银行门户',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),interactionContractVersion:'v4'
  }
  const missing = await f.service.prepareJourney({
    ...base,idempotencyKey:'journey-url-missing-001',sessionRef:'session-url-missing-001',entryUrl:''
  },{requestId:'request-url-missing-001',actorType:'COZE'})
  assert.ok(missing.missingFields.includes('I10_ENTRY_URL_REQUIRED'))
  assert.equal(missing.missingFields.includes('I10_ENTRY_URL_INVALID'),false)
  const invalid = await f.service.prepareJourney({
    ...base,idempotencyKey:'journey-url-invalid-001',sessionRef:'session-url-invalid-001',entryUrl:'not-a-url'
  },{requestId:'request-url-invalid-001',actorType:'COZE'})
  assert.ok(invalid.missingFields.includes('I10_ENTRY_URL_INVALID'))
  assert.equal(invalid.missingFields.includes('I10_ENTRY_URL_REQUIRED'),false)
})

test('URL-only initial input preserves the frozen business draft and reaches case approval',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = {...validDraft(f.credentialRef),entryUrl:'',missingFields:['entryUrl'],confirmationStatus:'WAITING_USER'}
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-url-only-001',sessionRef:'session-url-only-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证门户登录和资料一致性',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:draft,interactionContractVersion:'v4'
  },{requestId:'request-url-only-001',actorType:'COZE'})
  const completed = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:'journey-url-only-submit-001',journeyId:prepared.journeyId,
    expectedVersion:prepared.version,inputKind:'INITIAL_CASE_INPUT',submissionRef:'journey-url-only-submit-ref-001',
    normalizedInput:{
      inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证门户登录和资料一致性\n入口地址：http://127.0.0.1:18082/portal/login',
      entryUrl:'http://127.0.0.1:18082/portal/login',targetSystem:'复兴银行门户',credentialRef:f.credentialRef,
      draftJson:{...draft,entryUrl:'http://127.0.0.1:18082/portal/login',missingFields:[]},
      semanticAssessment:{schemaVersion:'hengzhun-i10-semantic-assessment-v1',verdict:'COMPLETE',satisfiedRequirementIds:[],unresolvedRequirements:[],confidence:0.9},
      inputRevision:2
    }
  },{requestId:'request-url-only-submit-001',actorType:'COZE'})
  assert.equal(completed.stage,'READY_FOR_CASE_APPROVAL')
  assert.deepEqual(completed.missingFields,[])
  assert.equal(completed.proposal.proceedDecision,'APPROVE_CASE')
  assert.deepEqual(completed.artifactCards.map(item => item.displayName).sort(),['案例草案.json','案例草案.md'])
})

test('INITIAL_CASE_INPUT completes missing fields in the same journey',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-initial-input-001',sessionRef:'session-initial-input-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],interactionContractVersion:'v4'
  },{requestId:'request-initial-input-001',actorType:'COZE'})
  assert.equal(prepared.stage,'NEEDS_INPUT')
  assert.equal(prepared.inputRequest.inputKind,'INITIAL_CASE_INPUT')

  const stillMissing = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:'journey-initial-input-partial',
    journeyId:prepared.journeyId,expectedVersion:prepared.version,
    inputKind:'INITIAL_CASE_INPUT',
    normalizedInput:{inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录'},
    submissionRef:'submit-initial-partial'
  },{requestId:'request-initial-input-002',actorType:'COZE'})
  assert.equal(stillMissing.journeyId,prepared.journeyId)
  assert.equal(stillMissing.stage,'NEEDS_INPUT')
  assert.ok(stillMissing.missingFields.includes('I10_ENTRY_URL_REQUIRED'))
  assert.ok(stillMissing.missingFields.includes('caseDraft'))

  const completed = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:'journey-initial-input-complete',
    journeyId:prepared.journeyId,expectedVersion:stillMissing.version,
    inputKind:'INITIAL_CASE_INPUT',
    normalizedInput:{
      inputType:'NATURAL_LANGUAGE',
      naturalLanguage:'验证门户登录和资料一致性',
      entryUrl:' http://127.0.0.1:18082/portal/login ',
      targetSystem:'复兴银行门户',
      credentialRef:f.credentialRef,
      draftJson:validDraft(f.credentialRef)
    },
    submissionRef:'submit-initial-complete'
  },{requestId:'request-initial-input-003',actorType:'COZE'})
  assert.equal(completed.journeyId,prepared.journeyId)
  assert.equal(completed.stage,'READY_FOR_CASE_APPROVAL')
  assert.equal(completed.status,'AWAITING_USER')
  assert.deepEqual(completed.missingFields,[])
  assert.equal(completed.proposal.proceedDecision,'APPROVE_CASE')
  assert.equal(completed.proposalId,completed.proposal.proposalId)
  assert.equal(completed.proposalPayloadHash,completed.proposal.payloadHash)
  assert.equal(completed.proposalSummary,completed.proposal.summary)
  assert.equal(completed.proposalProceedDecision,completed.proposal.proceedDecision)
  assert.equal(completed.artifactCards.length,2)
  assert.deepEqual(completed.artifactCards.map(item=>item.displayName).sort(),['案例草案.json','案例草案.md'])
})

test('journey reports concrete draft gaps instead of generic caseDraft',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = {
    ...validDraft(f.credentialRef),
    missingFields:['expectedOutcomes'],
    confirmationStatus:'WAITING_USER'
  }
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-specific-gaps-001',sessionRef:'session-specific-gaps-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',
    naturalLanguage:'验证登录，入口地址 http://127.0.0.1:18082/portal/login',
    entryUrl:'http://127.0.0.1:18082/portal/login',targetSystem:'复兴银行门户',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:draft,
    interactionContractVersion:'v4'
  },{requestId:'request-specific-gaps-001',actorType:'COZE'})
  assert.equal(result.status,'NEEDS_INPUT')
  assert.ok(result.missingFields.includes('expectedOutcomes'))
  assert.equal(result.missingFields.includes('caseDraft'),false)
})

test('semantic COMPLETE waives authoring-discovery gaps but still freezes one exact draft',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = {
    ...validDraft(f.credentialRef),
    missingFields:['个人资料页面入口方式','元素定位信息'],
    confirmationStatus:'WAITING_USER'
  }
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-semantic-complete-001',
    sessionRef:'session-semantic-complete-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',
    naturalLanguage:'打开门户登录，进入个人资料并验证姓名头像一致。入口地址：http://127.0.0.1:18082/portal/login',
    entryUrl:'http://127.0.0.1:18082/portal/login',targetSystem:'复兴银行门户',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:draft,
    semanticAssessment:{
      schemaVersion:'hengzhun-i10-semantic-assessment-v1',
      verdict:'COMPLETE',
      satisfiedRequirementIds:['BUSINESS_OBJECTIVE','ENTRY_POINT','ACTION_SEQUENCE','EXPECTED_RESULTS','ASSERTIONS','AUTHORING_DISCOVERY'],
      unresolvedRequirements:[],confidence:0.96
    },
    inputRevision:3,interactionContractVersion:'v4'
  },{requestId:'request-semantic-complete-001',actorType:'COZE'})
  assert.equal(result.stage,'READY_FOR_CASE_APPROVAL')
  assert.equal(result.interactionMode,'CONFIRM_EXACT')
  assert.deepEqual(result.contractMissingFields,[])
  assert.deepEqual(result.semanticMissingFields,[])
  assert.equal(result.proposal.proceedDecision,'APPROVE_CASE')
})

test('semantic COMPLETE cannot bypass an invalid entry URL hard gate',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = {...validDraft(f.credentialRef),entryUrl:'not-a-url'}
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-semantic-hard-gate-001',
    sessionRef:'session-semantic-hard-gate-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',
    naturalLanguage:'验证门户登录',entryUrl:'not-a-url',targetSystem:'复兴银行门户',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:draft,
    semanticAssessment:{
      schemaVersion:'hengzhun-i10-semantic-assessment-v1',verdict:'COMPLETE',
      satisfiedRequirementIds:['ENTRY_POINT'],unresolvedRequirements:[],confidence:0.99
    },
    inputRevision:2,interactionContractVersion:'v4'
  },{requestId:'request-semantic-hard-gate-001',actorType:'COZE'})
  assert.equal(result.stage,'NEEDS_INPUT')
  assert.ok(result.missingFields.includes('I10_ENTRY_URL_INVALID'))
  assert.equal(result.missingFields.includes('I10_ENTRY_URL_REQUIRED'),false)
  assert.notEqual(result.interactionMode,'CONFIRM_EXACT')
})

test('semantic clarification asks only the model identified business question',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = {...validDraft(f.credentialRef),missingFields:[],confirmationStatus:'WAITING_USER'}
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-semantic-question-001',
    sessionRef:'session-semantic-question-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',
    naturalLanguage:'验证门户登录',entryUrl:draft.entryUrl,targetSystem:draft.targetSystem,
    credentialRef:f.credentialRef,supportingImages:[],draftJson:draft,
    semanticAssessment:{
      schemaVersion:'hengzhun-i10-semantic-assessment-v1',verdict:'NEEDS_CLARIFICATION',
      satisfiedRequirementIds:['ENTRY_POINT'],
      unresolvedRequirements:[{requirementId:'EXPECTED_RESULTS',question:'登录成功后需要核对哪些业务结果？'}],
      confidence:0.72
    },
    inputRevision:2,interactionContractVersion:'v4'
  },{requestId:'request-semantic-question-001',actorType:'COZE'})
  assert.equal(result.stage,'NEEDS_INPUT')
  assert.deepEqual(result.contractMissingFields,[])
  assert.deepEqual(result.semanticMissingFields,['登录成功后需要核对哪些业务结果？'])
  assert.ok(result.missingFields.includes('登录成功后需要核对哪些业务结果？'))
})

test('INITIAL_CASE_INPUT rejects unknown fields and secrets without changing the journey',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-initial-guard-001',sessionRef:'session-initial-guard-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],interactionContractVersion:'v4'
  },{requestId:'request-initial-guard-001',actorType:'COZE'})
  await assert.rejects(
    () => f.service.submitJourneyInput({
      namespace:f.namespace,idempotencyKey:'journey-initial-guard-unknown',
      journeyId:prepared.journeyId,expectedVersion:prepared.version,
      inputKind:'INITIAL_CASE_INPUT',normalizedInput:{command:'run anything'},
      submissionRef:'submit-initial-unknown'
    },{requestId:'request-initial-guard-002',actorType:'COZE'}),
    error => error.errorCode === 'I10_INITIAL_CASE_INPUT_FIELDS_INVALID'
  )
  await assert.rejects(
    () => f.service.submitJourneyInput({
      namespace:f.namespace,idempotencyKey:'journey-initial-guard-secret',
      journeyId:prepared.journeyId,expectedVersion:prepared.version,
      inputKind:'INITIAL_CASE_INPUT',normalizedInput:{password:'example-password'},
      submissionRef:'submit-initial-secret'
    },{requestId:'request-initial-guard-003',actorType:'COZE'}),
    error => error.errorCode === 'I10_SECRET_INPUT_REJECTED'
  )
  const current = await f.service.getJourney({namespace:f.namespace,journeyId:prepared.journeyId,waitSeconds:0})
  assert.equal(current.version,prepared.version)
  assert.equal(current.stage,'NEEDS_INPUT')
})

test('journey exposes one deterministic approval gate and optimistic decision',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-ready-001',sessionRef:'session-test-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    entryUrl:' \nhttp://127.0.0.1:18082/portal/login\n ',targetSystem:'复兴银行门户',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),
    interactionContractVersion:'v4'
  },{requestId:'request-test-002',actorType:'COZE'})
  assert.equal(prepared.status,'AWAITING_USER')
  assert.equal(prepared.stage,'READY_FOR_CASE_APPROVAL')
  assert.deepEqual(prepared.allowedActions,['APPROVE_CASE','REJECT_CASE'])
  assert.equal(prepared.primaryDecision,undefined)
  assert.equal(prepared.interactionMode,'CONFIRM_EXACT')
  assert.equal(prepared.proposal.proceedDecision,'APPROVE_CASE')
  assert.equal(prepared.proposal.rejectDecision,'REJECT_CASE')
  assert.match(prepared.proposal.proposalId,/^proposal_[0-9a-f]{32}$/)
  assert.match(prepared.proposal.payloadHash,/^[0-9a-f]{64}$/)
  assert.equal(prepared.schemaVersion,'hengzhun-i10-interaction-response-v3')
  assert.equal(prepared.artifactCards.length,2)
  assert.deepEqual(prepared.artifactCards.map(item=>item.displayName).sort(),['案例草案.json','案例草案.md'])
  const downloadToken = new URL(prepared.artifactCards[0].href).pathname.split('/').pop()
  const downloaded = await f.service.consumeArtifactDownload(downloadToken)
  assert.equal(downloaded.sha256,prepared.artifactCards[0].sha256)
  assert.ok(Buffer.isBuffer(downloaded.content))
  await assert.rejects(
    () => f.service.consumeArtifactDownload(downloadToken),
    error => error.errorCode === 'I10_ARTIFACT_DOWNLOAD_NOT_ACTIVE'
  )
  const decided = await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:'journey-decision-001',
    journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'APPROVE_CASE',
    proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
    confirmationRef:'confirm-test-001',payload:{}
  },{requestId:'request-test-003',actorType:'COZE'})
  assert.equal(decided.status,'PROCESSING')
  assert.equal(decided.stage,'PROCESSING_AUTHORING')
  assert.equal(decided.nextAction.type,'CALL_CASE_PREPARE')
  await assert.rejects(
    () => f.service.decideJourney({
      namespace:f.namespace,idempotencyKey:'journey-decision-stale',
      journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'APPROVE_CASE',
      proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
      confirmationRef:'confirm-test-002',payload:{}
    },{requestId:'request-test-004',actorType:'COZE'}),
    error => error.errorCode === 'I10_JOURNEY_VERSION_CONFLICT'
  )
})

test('case preparation binds authoritative references for exact cross-session resume',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = validDraft(f.credentialRef)
  const journey = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-cross-session-001',sessionRef:'old-flowise-session',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证门户登录',
    entryUrl:draft.entryUrl,targetSystem:draft.targetSystem,credentialRef:f.credentialRef,
    supportingImages:[],draftJson:draft,interactionContractVersion:'v4'
  },{requestId:'request-cross-session-001',actorType:'COZE'})
  const approved = await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:'journey-cross-session-approve',
    journeyId:journey.journeyId,expectedVersion:journey.version,decision:'APPROVE_CASE',
    proposalId:journey.proposal.proposalId,payloadHash:journey.proposal.payloadHash,
    confirmationRef:'cross-session-confirm',payload:{}
  },{requestId:'request-cross-session-002',actorType:'COZE'})
  assert.equal(approved.stage,'PROCESSING_AUTHORING')

  const prepared = await f.service.prepareNaturalLanguage({
    namespace:f.namespace,idempotencyKey:'case-cross-session-001',actorRef:'flowise-controller',
    journeyId:journey.journeyId,caseDescription:'验证门户登录',draft
  },{requestId:'request-cross-session-003',actorType:'COZE'})
  const restored = await f.service.getJourney({
    namespace:f.namespace,journeyId:journey.journeyId,sessionRef:'brand-new-flowise-session',waitSeconds:0
  })
  assert.equal(restored.stage,'PROCESSING_AUTHORING')
  assert.equal(restored.references.caseId,prepared.caseId)
  assert.equal(restored.references.preparationId,prepared.preparationId)
  assert.equal(restored.caseDraft.title,draft.title)
  assert.deepEqual(restored.caseDraft.steps,draft.steps)
  assert.equal(restored.caseDraft.credentialRef,f.credentialRef)
  // Native Flowise custom-MCP tools complete one durable action per chat
  // execution.  A freshly prepared case must therefore expose the next real
  // write (authoring submit), not claim that a candidate already exists.
  assert.equal(restored.nextAction.type,'SUBMIT_AUTHORING')
  assert.equal(restored.preparationVersion,1)
})

test('journey projection reaches the authoritative result terminal after downstream completion',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const draft = validDraft(f.credentialRef)
  const journey = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-projection-001',sessionRef:'projection-old-session',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证门户登录',
    entryUrl:draft.entryUrl,targetSystem:draft.targetSystem,credentialRef:f.credentialRef,
    supportingImages:[],draftJson:draft,interactionContractVersion:'v4'
  },{requestId:'request-projection-001',actorType:'COZE'})
  await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:'journey-projection-approve',
    journeyId:journey.journeyId,expectedVersion:journey.version,decision:'APPROVE_CASE',
    proposalId:journey.proposal.proposalId,payloadHash:journey.proposal.payloadHash,
    confirmationRef:'projection-confirm',payload:{}
  },{requestId:'request-projection-002',actorType:'COZE'})
  const prepared = await f.service.prepareNaturalLanguage({
    namespace:f.namespace,idempotencyKey:'case-projection-001',actorRef:'flowise-controller',
    journeyId:journey.journeyId,caseDescription:'验证门户登录',draft
  },{requestId:'request-projection-003',actorType:'COZE'})

  const now = new Date().toISOString()
  const executablePlanId = 'eap_projection_001'
  const planId = 'plan_projection_001'
  const scriptId = 'script_projection_001'
  const taskId = 'task_77777777-7777-4777-8777-777777777777'
  const runId = 'run_88888888-8888-4888-8888-888888888888'
  const artifactId = 'art_99999999-9999-4999-8999-999999999999'
  const inboxId = 'inbox_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const hash = 'a'.repeat(64)
  const db = f.database.connection
  db.prepare(`INSERT INTO i8_executable_plans(
      executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,
      plan_json,plan_hash,status,version,created_at,updated_at
    ) VALUES (?,?,?,?,1,?, '{}',?,'CANDIDATE_GENERATED',1,?,?)`)
    .run(executablePlanId,f.namespace,prepared.preparationId,prepared.caseId,hash,'b'.repeat(64),now,now)
  db.prepare(`INSERT INTO i8_candidate_build_jobs(
      job_id,namespace,executable_plan_id,status,attempt_count,version,created_at,updated_at,completed_at
    ) VALUES ('buildjob_projection_001',?,?,'COMPLETED',1,1,?,?,?)`)
    .run(f.namespace,executablePlanId,now,now,now)
  db.prepare(`INSERT INTO scripts(script_id,namespace,case_id,current_version,status,created_at,updated_at)
    VALUES (?,?,?,1,'SCRIPT_VALIDATED',?,?)`).run(scriptId,f.namespace,prepared.caseId,now,now)
  db.prepare(`INSERT INTO script_versions(script_id,version,relative_path,sha256,validation_status,created_at)
    VALUES (?,1,'scripts/projection.cjs',?,'PASSED',?)`).run(scriptId,hash,now)
  db.prepare(`INSERT INTO plans(plan_id,namespace,case_id,case_version,version,status,summary_json,content_hash,created_at,script_id,full_action_plan_json)
    VALUES (?,?,?,1,1,'READY','{}',?,?,?,'{}')`).run(planId,f.namespace,prepared.caseId,'c'.repeat(64),now,scriptId)
  db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,result_summary,
      result_artifact_id,retryable,user_action_required,version,created_at,updated_at,completed_at)
    VALUES (?,?,'RUN_EXECUTE','SUCCEEDED',100,?,?, '通过',NULL,0,0,2,?,?,?)`)
    .run(taskId,f.namespace,prepared.caseId,runId,now,now,now)
  db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at,started_at,completed_at)
    VALUES (?,?,?,1,?,?,'PASSED',2,?,?,?)`).run(runId,f.namespace,prepared.caseId,planId,taskId,now,now,now)
  db.prepare(`INSERT INTO artifacts(artifact_id,namespace,run_id,task_id,artifact_type,relative_path,sha256,
      byte_size,media_type,redaction_status,metadata_json,created_at)
    VALUES (?,?,?,?,'REPORT','artifacts/projection.json',?,2,'application/json','REDACTED','{}',?)`)
    .run(artifactId,f.namespace,runId,taskId,'d'.repeat(64),now)
  db.prepare(`UPDATE tasks SET result_artifact_id=? WHERE task_id=?`).run(artifactId,taskId)
  db.prepare(`INSERT INTO result_inbox_items(
      inbox_id,namespace,run_id,task_id,case_id,case_version,plan_id,script_id,script_version,
      outcome,summary,result_artifact_id,artifact_metadata_json,delivery_status,created_at
    ) VALUES (?,?,?,?,?,1,?,?,1,'PASSED','通过',?,'{}','UNREAD',?)`)
    .run(inboxId,f.namespace,runId,taskId,prepared.caseId,planId,scriptId,artifactId,now)

  const restored = await f.service.getJourney({
    namespace:f.namespace,journeyId:journey.journeyId,sessionRef:'projection-new-session',waitSeconds:0
  })
  assert.equal(restored.stage,'COMPLETED')
  assert.equal(restored.status,'COMPLETED')
  assert.equal(restored.nextAction.type,'RESULT_AVAILABLE')
  assert.equal(restored.references.taskId,taskId)
  assert.equal(restored.references.runId,runId)
  assert.equal(restored.references.inboxId,inboxId)
  assert.equal(restored.references.resultArtifactId,artifactId)
  assert.equal(restored.progress.percent,100)

  const secondRead = await f.service.getJourney({
    namespace:f.namespace,journeyId:journey.journeyId,waitSeconds:0
  })
  assert.equal(secondRead.version,restored.version)
  const projectedEvents = db.prepare(`SELECT COUNT(*) count FROM i10_interaction_events
    WHERE journey_id=? AND event_type='PROJECTED'`).get(journey.journeyId)
  assert.equal(projectedEvents.count,1)
})

test('v4 reject enters same-journey correction and only normalized input can reopen approval',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const initialDraft = validDraft(f.credentialRef)
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-correct-001',sessionRef:'session-correct-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:initialDraft,
    interactionContractVersion:'v4'
  },{requestId:'request-correct-001',actorType:'COZE'})
  const rejected = await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:'journey-correct-reject-001',
    journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'REJECT_CASE',
    proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
    confirmationRef:'confirm-correct-001',payload:{}
  },{requestId:'request-correct-002',actorType:'COZE'})
  assert.equal(rejected.stage,'NEEDS_INPUT')
  assert.equal(rejected.interactionMode,'INPUT_REQUIRED')
  assert.equal(rejected.inputRequest.secretInputAllowed,false)

  const revisedDraft = {
    ...initialDraft,
    summary:'验证门户登录、姓名和头像一致性',
    source:{...initialDraft.source,sourceHash:'3'.repeat(64)}
  }
  const revised = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:'journey-correct-submit-001',
    journeyId:prepared.journeyId,expectedVersion:rejected.version,
    inputKind:'CASE_CORRECTION',normalizedInput:revisedDraft,
    submissionRef:'submit-correct-001'
  },{requestId:'request-correct-003',actorType:'COZE'})
  assert.equal(revised.stage,'READY_FOR_CASE_APPROVAL')
  assert.equal(revised.interactionMode,'CONFIRM_EXACT')
  assert.equal(revised.proposal.proceedDecision,'APPROVE_CASE')
  assert.notEqual(revised.proposal.payloadHash,prepared.proposal.payloadHash)
})

test('v4 exact proposal rejects stale or mismatched proposal identity',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-proposal-001',sessionRef:'session-proposal-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),
    interactionContractVersion:'v4'
  },{requestId:'request-proposal-001',actorType:'COZE'})
  await assert.rejects(
    () => f.service.decideJourney({
      namespace:f.namespace,idempotencyKey:'journey-proposal-bad-001',
      journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'APPROVE_CASE',
      proposalId:'proposal_'+'0'.repeat(32),payloadHash:'0'.repeat(64),
      confirmationRef:'confirm-proposal-001',payload:{}
    },{requestId:'request-proposal-002',actorType:'COZE'}),
    error => error.errorCode === 'I10_PROPOSAL_REFERENCE_MISMATCH'
  )
})

test('v4 input boundary rejects blank and secret content before state transition',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-input-guard-001',sessionRef:'session-input-guard-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),
    interactionContractVersion:'v4'
  },{requestId:'request-input-guard-001',actorType:'COZE'})
  const rejected = await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:'journey-input-guard-reject',
    journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'REJECT_CASE',
    proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
    confirmationRef:'confirm-input-guard-001',payload:{}
  },{requestId:'request-input-guard-002',actorType:'COZE'})
  await assert.rejects(
    () => f.service.submitJourneyInput({
      namespace:f.namespace,idempotencyKey:'journey-input-guard-empty',
      journeyId:prepared.journeyId,expectedVersion:rejected.version,
      inputKind:'CASE_CORRECTION',normalizedInput:{},submissionRef:'submit-input-empty'
    },{requestId:'request-input-guard-003',actorType:'COZE'}),
    error => error.errorCode === 'I10_INPUT_REQUIRED'
  )
  await assert.rejects(
    () => f.service.submitJourneyInput({
      namespace:f.namespace,idempotencyKey:'journey-input-guard-secret',
      journeyId:prepared.journeyId,expectedVersion:rejected.version,
      inputKind:'CASE_CORRECTION',normalizedInput:{password:'do-not-store'},
      submissionRef:'submit-input-secret'
    },{requestId:'request-input-guard-004',actorType:'COZE'}),
    error => error.errorCode === 'I10_SECRET_INPUT_REJECTED'
  )
  const current = await f.service.getJourney({namespace:f.namespace,journeyId:prepared.journeyId,waitSeconds:0})
  assert.equal(current.version,rejected.version)
  assert.equal(current.stage,'NEEDS_INPUT')
})

test('resume returns the latest session journey and never invents an unsupported route',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const unsupported = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-unsupported-001',sessionRef:'session-test-001',
    requestIntent:'UNSUPPORTED',inputType:'NONE',supportingImages:[]
  },{requestId:'request-test-005',actorType:'COZE'})
  assert.equal(unsupported.stage,'FAILED_ACTIONABLE')
  const resumed = await f.service.getJourney({namespace:f.namespace,sessionRef:'session-test-001',waitSeconds:0})
  assert.equal(resumed.journeyId,unsupported.journeyId)
  assert.equal(resumed.nextAction.type,'REFORMULATE')
})

test('new requests never reuse a stale Flowise journey identifier',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const first = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-fresh-001',sessionRef:'session-stale-001',
    requestIntent:'HELP',inputType:'NONE',journeyId:'journey_stale_from_flow_state',supportingImages:[]
  },{requestId:'request-test-006',actorType:'COZE'})
  const second = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-fresh-002',sessionRef:'session-stale-001',
    requestIntent:'HELP',inputType:'NONE',journeyId:first.journeyId,supportingImages:[]
  },{requestId:'request-test-007',actorType:'COZE'})
  assert.notEqual(first.journeyId,'journey_stale_from_flow_state')
  assert.notEqual(second.journeyId,first.journeyId)
})
