'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { I10Service } = require('../../dist/harness/src/i10/service.js')
const { ArtifactStore } = require('../../dist/harness/src/artifact-store.js')
const { HarnessService } = require('../../dist/harness/src/service.js')
const productRoot = path.resolve(__dirname, '../..')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'hengzhun-journey-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root,'data.sqlite'),
    migrationsDirectory: path.resolve(__dirname,'../../harness/migrations'),
    backupDirectory: path.join(root,'backups')
  })
  const artifacts = new ArtifactStore(database,path.join(root,'artifacts'))
  const service = new I10Service(database,root,artifacts)
  const harness = new HarnessService(database,path.join(root,'artifacts'),root)
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
  return { root,database,service,harness,namespace,credentialRef }
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

function seedConfirmedAttachmentPreparation(f, suffix = '12345678-1234-1234-1234-123456789abc') {
  const now = new Date().toISOString()
  const caseId = `case_${suffix}`
  const preparationId = `prep_${suffix}`
  const ingestJobId = `ingest_${suffix}`
  const ingestItemId = `ingestitem_${suffix}`
  const targetProfileId = `targetprofile_${suffix}`
  const draft = {
    ...validDraft(f.credentialRef),
    source: {
      inputType: 'CASE_FILE',
      sourceRef: 'flowise-file-confirmed-001',
      sourceHash: '3'.repeat(64),
      provenanceSummary: '已确认的附件导入'
    }
  }
  const db = f.database.connection
  db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at)
    VALUES (?,?,1,'VALIDATED',?,?,'MEDIUM',?,?)`).run(caseId,f.namespace,draft.title,draft.summary,now,now)
  db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at)
    VALUES (?,1,?,?,?,?)`).run(caseId,JSON.stringify({...draft,ingestJobId}),'4'.repeat(64),'confirmed-ingest',now)
  db.prepare(`INSERT INTO i10_ingest_jobs(
      ingest_job_id,namespace,idempotency_key,input_type,flowise_file_ref,original_filename,
      source_sha256,source_size_bytes,credential_ref,hints_json,status,confidence,missing_fields_json,
      draft_count,version,created_at,updated_at,completed_at
    ) VALUES (?,?,?,?,?,?,?,1024,?,'{}','CONFIRMED',0.95,'[]',1,1,?,?,?)`)
    .run(ingestJobId,f.namespace,`ingest-seed-${suffix}`,'CASE_FILE','flowise-file-confirmed-001','confirmed.case.json',
      '3'.repeat(64),f.credentialRef,now,now,now)
  db.prepare(`INSERT INTO i10_ingest_items(
      ingest_item_id,ingest_job_id,ordinal,draft_json,draft_hash,confidence,missing_fields_json,confirmed_case_id,created_at
    ) VALUES (?,?,1,?,?,0.95,'[]',?,?)`)
    .run(ingestItemId,ingestJobId,JSON.stringify(draft),'4'.repeat(64),caseId,now)
  db.prepare(`INSERT INTO i8_case_preparations(
      preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,
      acceptance_summary_json,status,confirmation_ref,version,created_at,updated_at
    ) VALUES (?,?,?,1,?,'{}','{}','PREPARED','confirmed-ingest',1,?,?)`)
    .run(preparationId,f.namespace,caseId,'3'.repeat(64),now,now)
  db.prepare(`INSERT INTO i10_target_profiles(
      target_profile_id,namespace,idempotency_key,display_name,launch_url,launch_origin,
      allowed_navigation_origins_json,allowed_interaction_origins_json,credential_origins_json,
      redirect_rules_json,credential_ref,tls_policy,network_mode,adapter_binding_json,resolved_addresses_json,
      status,profile_hash,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,'http://127.0.0.1:18082',?,?,?,'[]',?,'STRICT','LOCAL','null','{}','ACTIVE',?,1,?,?)`)
    .run(targetProfileId,f.namespace,`target-seed-${suffix}`,'复兴银行门户',draft.entryUrl,
      JSON.stringify(['http://127.0.0.1:18082']),JSON.stringify(['http://127.0.0.1:18082']),
      JSON.stringify(['http://127.0.0.1:18082']),f.credentialRef,'5'.repeat(64),now,now)
  return { caseId, preparationId, ingestJobId, targetProfileId, draft }
}

test('confirmed attachment preparation enters authoring through an exact immutable Journey binding', async t => {
  const f = await fixture()
  t.after(async() => { await f.database.close(); fs.rmSync(f.root,{recursive:true,force:true}) })
  const seeded = seedConfirmedAttachmentPreparation(f)
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-confirmed-attachment-001',sessionRef:'session-confirmed-attachment-001',
    requestIntent:'CASE_AUTHORING',inputType:'CASE_FILE',credentialRef:f.credentialRef,
    targetProfileId:seeded.targetProfileId,preparationId:seeded.preparationId,ingestJobId:seeded.ingestJobId,
    supportingImages:[],interactionContractVersion:'v6'
  },{requestId:'request-confirmed-attachment-001',actorType:'COZE'})
  assert.equal(result.stage,'PROCESSING_AUTHORING')
  assert.equal(result.status,'PROCESSING')
  assert.equal(result.nextAction.type,'SUBMIT_AUTHORING')
  assert.equal(result.caseDraft.source.inputType,'CASE_FILE')
  assert.deepEqual(result.references,{
    caseId:seeded.caseId,caseVersion:1,credentialRef:f.credentialRef,ingestJobId:seeded.ingestJobId,
    preparationId:seeded.preparationId,targetProfileId:seeded.targetProfileId
  })
})

test('attachment Journey rejects a mismatched preparation without creating fallback state', async t => {
  const f = await fixture()
  t.after(async() => { await f.database.close(); fs.rmSync(f.root,{recursive:true,force:true}) })
  const seeded = seedConfirmedAttachmentPreparation(f)
  await assert.rejects(() => f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-mismatched-attachment-001',sessionRef:'session-mismatched-attachment-001',
    requestIntent:'CASE_AUTHORING',inputType:'CASE_FILE',credentialRef:f.credentialRef,
    targetProfileId:seeded.targetProfileId,preparationId:'prep_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ingestJobId:seeded.ingestJobId,supportingImages:[],interactionContractVersion:'v6'
  },{requestId:'request-mismatched-attachment-001',actorType:'COZE'}), error =>
    error && error.errorCode === 'I10_ATTACHMENT_PREPARATION_BINDING_INVALID')
  const count = f.database.connection.prepare(`SELECT COUNT(*) count FROM i10_interaction_journeys
    WHERE namespace=? AND idempotency_key=?`).get(f.namespace,'journey-mismatched-attachment-001').count
  assert.equal(count,0)
})

test('journey freezes an explicit registered adapter selection in the CaseDraft', async t => {
  const f = await fixture()
  t.after(async() => { await f.database.close(); fs.rmSync(f.root,{recursive:true,force:true}) })
  const draft = validDraft(f.credentialRef)
  const result = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-explicit-adapter-001',sessionRef:'session-explicit-adapter-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',
    naturalLanguage:'明确选择复兴银行演示适配器 fuxing-bank-demo，验证转账首次确认。',
    entryUrl:draft.entryUrl,targetSystem:draft.targetSystem,credentialRef:f.credentialRef,
    supportingImages:[],draftJson:draft,interactionContractVersion:'v4'
  },{requestId:'request-explicit-adapter-001',actorType:'COZE'})
  assert.equal(result.caseDraft.adapterSelection,'fuxing-bank-demo')
})

test('INITIAL_CASE_INPUT derives adapter selection from explicit language and ignores a forged draft field', async t => {
  const f = await fixture()
  t.after(async() => { await f.database.close(); fs.rmSync(f.root,{recursive:true,force:true}) })
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-explicit-adapter-input-001',sessionRef:'session-explicit-adapter-input-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],interactionContractVersion:'v4'
  },{requestId:'request-explicit-adapter-input-001',actorType:'COZE'})
  assert.equal(prepared.stage,'NEEDS_INPUT')

  const completed = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:'journey-explicit-adapter-input-002',journeyId:prepared.journeyId,
    expectedVersion:prepared.version,inputKind:'INITIAL_CASE_INPUT',submissionRef:'submit-explicit-adapter-input-001',
    normalizedInput:{
      inputType:'NATURAL_LANGUAGE',
      naturalLanguage:'明确选择复兴银行演示适配器 fuxing-bank-demo，验证转账首次确认。',
      entryUrl:'http://127.0.0.1:18082/portal/login',targetSystem:'复兴银行门户',credentialRef:f.credentialRef,
      draftJson:{...validDraft(f.credentialRef),adapterSelection:'unregistered-client-value'}
    }
  },{requestId:'request-explicit-adapter-input-002',actorType:'COZE'})
  assert.equal(completed.stage,'READY_FOR_CASE_APPROVAL')
  assert.equal(completed.caseDraft.adapterSelection,'fuxing-bank-demo')

  const forgedPrepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-forged-adapter-input-001',sessionRef:'session-forged-adapter-input-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],interactionContractVersion:'v4'
  },{requestId:'request-forged-adapter-input-001',actorType:'COZE'})
  const forged = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:'journey-forged-adapter-input-002',journeyId:forgedPrepared.journeyId,
    expectedVersion:forgedPrepared.version,inputKind:'INITIAL_CASE_INPUT',submissionRef:'submit-forged-adapter-input-001',
    normalizedInput:{
      inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证门户登录和资料一致性',
      entryUrl:'http://127.0.0.1:18082/portal/login',targetSystem:'复兴银行门户',credentialRef:f.credentialRef,
      draftJson:{...validDraft(f.credentialRef),adapterSelection:'fuxing-bank-demo'}
    }
  },{requestId:'request-forged-adapter-input-002',actorType:'COZE'})
  assert.equal(forged.stage,'READY_FOR_CASE_APPROVAL')
  assert.equal(forged.caseDraft.adapterSelection,undefined)
})

async function activatedJourney(f,suffix) {
  const draft = {
    ...validDraft(f.credentialRef),
    title:`门户登录-${suffix}`,
    source:{...validDraft(f.credentialRef).source,sourceRef:`session-${suffix}`,sourceHash:suffix.padEnd(64,'a').slice(0,64)}
  }
  const journey = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:`journey-binding-${suffix}`,sessionRef:`session-binding-${suffix}`,
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:`验证登录 ${suffix}`,
    entryUrl:draft.entryUrl,targetSystem:draft.targetSystem,credentialRef:f.credentialRef,
    supportingImages:[],draftJson:draft,interactionContractVersion:'v4'
  },{requestId:`request-binding-${suffix}-01`,actorType:'COZE'})
  await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:`journey-binding-approve-${suffix}`,
    journeyId:journey.journeyId,expectedVersion:journey.version,decision:'APPROVE_CASE',
    proposalId:journey.proposal.proposalId,payloadHash:journey.proposal.payloadHash,
    confirmationRef:`binding-approve-${suffix}`,payload:{}
  },{requestId:`request-binding-${suffix}-02`,actorType:'COZE'})
  const prepared = await f.service.prepareNaturalLanguage({
    namespace:f.namespace,idempotencyKey:`case-binding-${suffix}`,actorRef:'flowise-controller',
    journeyId:journey.journeyId,caseDescription:`验证登录 ${suffix}`,draft
  },{requestId:`request-binding-${suffix}-03`,actorType:'COZE'})
  const now = new Date().toISOString()
  const hash = character => `${character}${suffix}`.repeat(32).slice(0,64)
  const executablePlanId = `eap_binding_${suffix}`
  const candidateId = `candidate_binding_${suffix}`
  const certificateId = `certificate_binding_${suffix}`
  const batchId = `batch_binding_${suffix}`
  const scriptId = `script_binding_${suffix}`
  const planId = `plan_binding_${suffix}`
  const db = f.database.connection
  db.prepare(`INSERT INTO i8_executable_plans(
      executable_plan_id,namespace,preparation_id,case_id,case_version,intent_plan_hash,
      plan_json,plan_hash,status,version,created_at,updated_at
    ) VALUES (?,?,?,?,1,?,'{}',?,'CANDIDATE_GENERATED',1,?,?)`)
    .run(executablePlanId,f.namespace,prepared.preparationId,prepared.caseId,hash('1'),hash('2'),now,now)
  db.prepare(`INSERT INTO scripts(script_id,namespace,case_id,current_version,status,created_at,updated_at)
    VALUES (?,?,?,1,'SCRIPT_VALIDATED',?,?)`).run(scriptId,f.namespace,prepared.caseId,now,now)
  db.prepare(`INSERT INTO script_versions(script_id,version,relative_path,sha256,validation_status,created_at)
    VALUES (?,1,?,?,'PASSED',?)`).run(scriptId,`scripts/${suffix}.cjs`,hash('3'),now)
  db.prepare(`INSERT INTO plans(plan_id,namespace,case_id,case_version,version,status,summary_json,content_hash,created_at,script_id,full_action_plan_json)
    VALUES (?,?,?,1,1,'READY','{}',?,?,?,NULL)`).run(planId,f.namespace,prepared.caseId,hash('4'),now,scriptId)
  db.prepare(`INSERT INTO i8_script_candidates(
      candidate_id,namespace,executable_plan_id,script_id,script_version,dsl_version,dsl_json,dsl_hash,
      generator_version,relative_directory,script_sha256,manifest_json,manifest_sha256,source_chain_hash,
      status,version,created_at,updated_at
    ) VALUES (?,?,?,?,1,'HENGZHUN_DSL_V1','{}',?,'test',?,?,'{}',?,?,'SCRIPT_VALIDATED',1,?,?)`)
    .run(candidateId,f.namespace,executablePlanId,scriptId,hash('5'),`.data/candidates/${suffix}`,hash('3'),hash('6'),hash('7'),now,now)
  db.prepare(`INSERT INTO i8_stability_batches(batch_id,namespace,candidate_id,status,version,created_at,updated_at)
    VALUES (?,?,?,'PASSED',1,?,?)`).run(batchId,f.namespace,candidateId,now,now)
  db.prepare(`INSERT INTO i8_stability_certificates(
      certificate_id,namespace,candidate_id,batch_id,script_sha256,case_version,executable_plan_version,
      runtime_fingerprint,viewport_set_json,validation_run_ids_json,assertion_set_hash,evidence_set_hash,status,issued_at
    ) VALUES (?,?,?,?,?,1,1,?,'[]','[]',?,?,'PASSED',?)`)
    .run(certificateId,f.namespace,candidateId,batchId,hash('3'),hash('8'),hash('9'),hash('a'),now)
  db.prepare(`INSERT INTO i8_script_delivery_decisions(
      decision_id,namespace,candidate_id,certificate_id,expected_candidate_version,choice,reason,confirmation_ref,
      effect,case_version,executable_plan_id,executable_plan_version,activated_plan_id,script_id,script_version,script_sha256,created_at
    ) VALUES (?,?,?, ?,1,'ACTIVATE','test',?,'SCRIPT_VERSION_ACTIVATED',1,?,1,?,?,1,?,?)`)
    .run(`delivery_binding_${suffix}`,f.namespace,candidateId,certificateId,`delivery-confirm-${suffix}`,executablePlanId,planId,scriptId,hash('3'),now)
  const activated = await f.service.getJourney({namespace:f.namespace,journeyId:journey.journeyId,waitSeconds:0})
  assert.equal(activated.stage,'NEEDS_INPUT')
  assert.equal(activated.references.preparationId,prepared.preparationId)
  assert.equal(activated.references.candidateId,candidateId)
  assert.equal(activated.references.planId,planId)
  return {journey:activated,prepared,executablePlanId,candidateId,certificateId,scriptId,planId}
}

async function confirmExecution(f,binding,suffix,normalizedInput) {
  const proposed = await f.service.submitJourneyInput({
    namespace:f.namespace,idempotencyKey:`execution-plan-${suffix}`,
    journeyId:binding.journey.journeyId,expectedVersion:binding.journey.version,
    inputKind:'EXECUTION_PLAN',normalizedInput,submissionRef:`execution-plan-submit-${suffix}`
  },{requestId:`request-execution-plan-${suffix}`,actorType:'COZE'})
  const confirmed = await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:`execution-decision-${suffix}`,
    journeyId:proposed.journeyId,expectedVersion:proposed.version,
    decision:proposed.proposal.proceedDecision,
    proposalId:proposed.proposal.proposalId,payloadHash:proposed.proposal.payloadHash,
    payload:proposed.proposal.payload,confirmationRef:`execution-confirm-${suffix}`
  },{requestId:`request-execution-decision-${suffix}`,actorType:'COZE'})
  return {proposed,confirmed}
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
  assert.equal(prepared.artifactCards.every(item=>item.downloadGrantRequired===true),true)
  assert.equal(prepared.artifactCards.every(item=>!Object.hasOwn(item,'href')),true)
  const explicitGrant = await f.service.grantArtifactDownload(f.namespace,prepared.artifactCards[0].artifactId)
  const downloadToken = new URL(explicitGrant.href).pathname.split('/').pop()
  const downloaded = await f.service.consumeArtifactDownload(downloadToken)
  assert.equal(downloaded.sha256,explicitGrant.sha256)
  assert.ok(Buffer.isBuffer(downloaded.content))
  await assert.rejects(
    () => f.service.consumeArtifactDownload(downloadToken),
    error => error.errorCode === 'I10_ARTIFACT_DOWNLOAD_NOT_ACTIVE'
  )
  const decided = await f.service.decideJourney({
    namespace:f.namespace,idempotencyKey:'journey-decision-001',
    journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'APPROVE_CASE',
    proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
    confirmationRef:'confirm-test-001',payload:prepared.proposal.payload
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

test('journey reads expose artifact metadata without minting or rotating download grants',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-artifact-read-001',sessionRef:'session-artifact-read-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    entryUrl:'http://127.0.0.1:18082/portal/login',targetSystem:'复兴银行门户',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),
    interactionContractVersion:'v4'
  },{requestId:'request-artifact-read-001',actorType:'COZE'})
  assert.equal(prepared.artifactCards.length,2)
  assert.equal(prepared.artifactCards.every(card=>card.downloadGrantRequired===true),true)
  assert.equal(prepared.artifactCards.every(card=>!Object.hasOwn(card,'href')),true)
  const grantCount = () => Number(f.database.connection.prepare(
    `SELECT COUNT(*) count FROM i10_artifact_download_grants WHERE namespace=?`
  ).get(f.namespace).count)
  assert.equal(grantCount(),0)

  const firstRead = await f.service.getJourney({namespace:f.namespace,journeyId:prepared.journeyId,waitSeconds:0})
  assert.deepEqual(firstRead.artifactCards,prepared.artifactCards)
  assert.equal(grantCount(),0)

  const artifactId = prepared.artifactCards[0].artifactId
  const explicitGrant = await f.service.grantArtifactDownload(f.namespace,artifactId)
  const downloadToken = new URL(explicitGrant.href).pathname.split('/').pop()
  assert.equal(grantCount(),1)

  const secondRead = await f.service.getJourney({namespace:f.namespace,journeyId:prepared.journeyId,waitSeconds:0})
  assert.deepEqual(secondRead.artifactCards,prepared.artifactCards)
  assert.equal(grantCount(),1)
  const active = f.database.connection.prepare(
    `SELECT status FROM i10_artifact_download_grants WHERE namespace=? AND artifact_id=?`
  ).get(f.namespace,artifactId)
  assert.equal(active.status,'ACTIVE')
  const downloaded = await f.service.consumeArtifactDownload(downloadToken)
  assert.equal(downloaded.sha256,explicitGrant.sha256)
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
  const binding = await activatedJourney(f,'a')
  const {confirmed} = await confirmExecution(f,binding,'projection',{mode:'ON_DEMAND'})
  const submitted = await f.harness.submitI8Run({
    namespace:f.namespace,idempotencyKey:'journey-projection-run',preparationId:binding.prepared.preparationId,
    journeyId:confirmed.journeyId,confirmedDecisionEventId:confirmed.references.confirmedDecisionEventId
  },{requestId:'request-projection-run',actorType:'COZE'})
  const now = new Date().toISOString()
  const taskId = submitted.response.taskId
  const runId = submitted.response.runId
  const artifactId = 'art_99999999-9999-4999-8999-999999999999'
  const inboxId = 'inbox_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const db = f.database.connection
  db.prepare(`UPDATE tasks SET status='SUCCEEDED',progress=100,result_summary='通过',retryable=0,
      user_action_required=0,version=version+1,updated_at=?,completed_at=? WHERE task_id=?`).run(now,now,taskId)
  db.prepare(`UPDATE runs SET status='PASSED',version=version+1,started_at=?,completed_at=? WHERE run_id=?`).run(now,now,runId)
  db.prepare(`INSERT INTO artifacts(artifact_id,namespace,run_id,task_id,artifact_type,relative_path,sha256,
      byte_size,media_type,redaction_status,metadata_json,created_at)
    VALUES (?,?,?,?,'REPORT','artifacts/projection.json',?,2,'application/json','REDACTED','{}',?)`)
    .run(artifactId,f.namespace,runId,taskId,'d'.repeat(64),now)
  db.prepare(`UPDATE tasks SET result_artifact_id=? WHERE task_id=?`).run(artifactId,taskId)
  db.prepare(`INSERT INTO result_inbox_items(
      inbox_id,namespace,run_id,task_id,case_id,case_version,plan_id,script_id,script_version,
      outcome,summary,result_artifact_id,artifact_metadata_json,delivery_status,created_at
    ) VALUES (?,?,?,?,?,1,?,?,1,'PASSED','通过',?,'{}','UNREAD',?)`)
    .run(inboxId,f.namespace,runId,taskId,binding.prepared.caseId,binding.planId,binding.scriptId,artifactId,now)

  const projectedBefore = db.prepare(`SELECT COUNT(*) count FROM i10_interaction_events
    WHERE journey_id=? AND event_type='PROJECTED'`).get(confirmed.journeyId).count

  const restored = await f.service.getJourney({
    namespace:f.namespace,journeyId:confirmed.journeyId,sessionRef:'projection-new-session',waitSeconds:0
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
    namespace:f.namespace,journeyId:confirmed.journeyId,waitSeconds:0
  })
  assert.equal(secondRead.version,restored.version)
  const projectedEvents = db.prepare(`SELECT COUNT(*) count FROM i10_interaction_events
    WHERE journey_id=? AND event_type='PROJECTED'`).get(confirmed.journeyId)
  assert.equal(projectedEvents.count,projectedBefore+1)
})

test('execution input refreshes an activation created after the last journey projection',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const binding = await activatedJourney(f,'c9')
  const db = f.database.connection
  const row = db.prepare('SELECT references_json FROM i10_interaction_journeys WHERE journey_id=?')
    .get(binding.journey.journeyId)
  const staleReferences = JSON.parse(row.references_json)
  delete staleReferences.planId
  db.prepare('UPDATE i10_interaction_journeys SET references_json=? WHERE journey_id=?')
    .run(JSON.stringify(staleReferences),binding.journey.journeyId)

  const {proposed,confirmed} = await confirmExecution(
    f,binding,'late-activation',{mode:'ON_DEMAND'}
  )
  assert.equal(proposed.references.planId,binding.planId)
  assert.equal(proposed.references.candidateId,binding.candidateId)
  assert.equal(confirmed.references.confirmedDecisionEventId.startsWith('journeyevent_'),true)
})

test('run submission binds one confirmed Journey event and projection ignores newer same-case runs',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const binding = await activatedJourney(f,'a')
  const {confirmed} = await confirmExecution(f,binding,'run-a',{mode:'ON_DEMAND'})
  assert.match(confirmed.references.confirmedDecisionEventId,/^journeyevent_[0-9a-f-]{36}$/)
  const submitted = await f.harness.submitI8Run({
    namespace:f.namespace,idempotencyKey:'bound-run-submit-a',preparationId:binding.prepared.preparationId,
    journeyId:confirmed.journeyId,confirmedDecisionEventId:confirmed.references.confirmedDecisionEventId
  },{requestId:'request-bound-run-submit-a',actorType:'COZE'})
  const runId = submitted.response.runId
  const taskId = submitted.response.taskId
  const db = f.database.connection
  const persisted = db.prepare(`SELECT journey_id,confirmed_decision_event_id,preparation_id,candidate_id
    FROM runs WHERE run_id=?`).get(runId)
  assert.deepEqual(persisted,{
    journey_id:confirmed.journeyId,
    confirmed_decision_event_id:confirmed.references.confirmedDecisionEventId,
    preparation_id:binding.prepared.preparationId,
    candidate_id:binding.candidateId
  })
  assert.throws(
    () => db.prepare(`UPDATE runs SET plan_id=plan_id WHERE run_id=?`).run(runId),
    /I10_RUN_EXECUTION_BINDING_IMMUTABLE/
  )

  const decoyTaskId = 'task_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const decoyRunId = 'run_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const later = new Date(Date.now()+60_000).toISOString()
  db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,version,created_at,updated_at)
    VALUES (?,?,'RUN_EXECUTE','QUEUED',0,?,?,1,?,?)`)
    .run(decoyTaskId,f.namespace,binding.prepared.caseId,decoyRunId,later,later)
  db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at)
    VALUES (?,?,?,1,?,?,'QUEUED',1,?)`)
    .run(decoyRunId,f.namespace,binding.prepared.caseId,binding.planId,decoyTaskId,later)

  const projected = await f.service.getJourney({namespace:f.namespace,journeyId:confirmed.journeyId,waitSeconds:0})
  assert.equal(projected.references.runId,runId)
  assert.equal(projected.references.taskId,taskId)
  assert.notEqual(projected.references.runId,decoyRunId)
})

test('run submission rejects a preparation from another Journey before creating a run',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const first = await activatedJourney(f,'a')
  const second = await activatedJourney(f,'b')
  const {confirmed} = await confirmExecution(f,first,'run-cross',{mode:'ON_DEMAND'})
  const before = f.database.connection.prepare(`SELECT COUNT(*) count FROM runs`).get().count
  await assert.rejects(
    () => f.harness.submitI8Run({
      namespace:f.namespace,idempotencyKey:'bound-run-cross-preparation',preparationId:second.prepared.preparationId,
      journeyId:confirmed.journeyId,confirmedDecisionEventId:confirmed.references.confirmedDecisionEventId
    },{requestId:'request-bound-run-cross-preparation',actorType:'COZE'}),
    error => String(error.errorCode || '').startsWith('I10_JOURNEY_EXECUTION_BINDING_')
  )
  const after = f.database.connection.prepare(`SELECT COUNT(*) count FROM runs`).get().count
  assert.equal(after,before)
})

test('schedule creation binds one confirmed Journey event and projection ignores newer same-case schedules',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const binding = await activatedJourney(f,'a')
  const execution = {mode:'RECURRING',cronExpression:'0 9 * * 1-5',timezone:'Asia/Shanghai'}
  const {confirmed} = await confirmExecution(f,binding,'schedule-a',execution)
  const pending = await f.service.getJourney({namespace:f.namespace,journeyId:confirmed.journeyId,waitSeconds:0})
  assert.equal(pending.nextAction.type,'CALL_SCHEDULE_CREATE')
  assert.equal(pending.references.confirmedDecisionEventId,confirmed.references.confirmedDecisionEventId)
  const created = await f.harness.createI8Schedule({
    namespace:f.namespace,idempotencyKey:'bound-schedule-create-a',preparationId:binding.prepared.preparationId,
    journeyId:confirmed.journeyId,confirmedDecisionEventId:confirmed.references.confirmedDecisionEventId,
    scheduleType:'RECURRING',cronExpression:execution.cronExpression,timezone:execution.timezone,
    misfirePolicy:'SKIP',misfireGraceSeconds:300,maxRetries:1,confirmationRef:'bound-schedule-confirm-a'
  },{requestId:'request-bound-schedule-create-a',actorType:'COZE'})
  const scheduleId = created.response.scheduleId
  const db = f.database.connection
  const persisted = db.prepare(`SELECT journey_id,confirmed_decision_event_id,preparation_id,candidate_id
    FROM schedules WHERE schedule_id=?`).get(scheduleId)
  assert.deepEqual(persisted,{
    journey_id:confirmed.journeyId,
    confirmed_decision_event_id:confirmed.references.confirmedDecisionEventId,
    preparation_id:binding.prepared.preparationId,
    candidate_id:binding.candidateId
  })
  assert.throws(
    () => db.prepare(`UPDATE schedules SET candidate_id=candidate_id WHERE schedule_id=?`).run(scheduleId),
    /I10_SCHEDULE_EXECUTION_BINDING_IMMUTABLE/
  )

  const later = new Date(Date.now()+60_000).toISOString()
  db.prepare(`INSERT INTO schedules(
      schedule_id,namespace,case_id,case_version,plan_id,credential_alias,cron_expression,timezone,
      environment,fixture_scope,misfire_policy,misfire_grace_seconds,max_retries,status,next_fire_at,
      version,created_at,updated_at,schedule_type,script_id,script_version,script_sha256,confirmation_ref,
      misfire_semantics
    ) VALUES ('schedule_decoy_binding',?,?,1,?,'decoy','0 10 * * 1-5','Asia/Shanghai','local','decoy-scope',
      'SKIP',300,1,'ACTIVE',?,1,?,?,'RECURRING',?,1,?,'decoy-confirmation','SKIP')`)
    .run(f.namespace,binding.prepared.caseId,binding.planId,later,later,later,binding.scriptId,'3a'.repeat(32))

  const projected = await f.service.getJourney({namespace:f.namespace,journeyId:confirmed.journeyId,waitSeconds:0})
  assert.equal(projected.references.scheduleId,scheduleId)
  assert.notEqual(projected.references.scheduleId,'schedule_decoy_binding')
  assert.equal(projected.nextAction.type,'QUERY_SCHEDULE')
})

test('ONE_TIME RUN_ONCE_WITHIN_GRACE persists the exact semantics while mapping the legacy constrained column',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  // Keep the fixture suffix within the same bounded semantic-input shape as
  // the existing execution tests; "grace" is implementation terminology and
  // can legitimately cause the controller to request clarification.
  const binding = await activatedJourney(f,'c')
  const runAt = new Date(Date.now()+10*60_000).toISOString()
  const execution = {mode:'ONE_TIME',runAt,timezone:'Asia/Shanghai'}
  const {confirmed} = await confirmExecution(f,binding,'schedule-grace',execution)
  const created = await f.harness.createI8Schedule({
    namespace:f.namespace,idempotencyKey:'bound-schedule-grace',preparationId:binding.prepared.preparationId,
    journeyId:confirmed.journeyId,confirmedDecisionEventId:confirmed.references.confirmedDecisionEventId,
    scheduleType:'ONE_TIME',runAt,timezone:execution.timezone,
    misfirePolicy:'RUN_ONCE_WITHIN_GRACE',misfireGraceSeconds:300,maxRetries:1,
    confirmationRef:'bound-schedule-grace-confirm'
  },{requestId:'request-bound-schedule-grace',actorType:'COZE'})
  assert.equal(created.response.misfirePolicy,'RUN_ONCE_WITHIN_GRACE')
  const persisted = f.database.connection.prepare(`SELECT misfire_policy,misfire_semantics,deadline_at
    FROM schedules WHERE schedule_id=?`).get(created.response.scheduleId)
  assert.equal(persisted.misfire_policy,'RUN_ONCE')
  assert.equal(persisted.misfire_semantics,'RUN_ONCE_WITHIN_GRACE')
  assert.equal(persisted.deadline_at,new Date(new Date(runAt).getTime()+300_000).toISOString())
})

test('historical execution Journey without an immutable decision link fails closed instead of guessing by time',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const binding = await activatedJourney(f,'a')
  const {confirmed} = await confirmExecution(f,binding,'legacy-run',{mode:'ON_DEMAND'})
  const db = f.database.connection
  const stored = db.prepare(`SELECT references_json FROM i10_interaction_journeys WHERE journey_id=?`).get(confirmed.journeyId)
  const references = JSON.parse(stored.references_json)
  delete references.confirmedDecisionEventId
  db.prepare(`UPDATE i10_interaction_journeys SET references_json=? WHERE journey_id=?`)
    .run(JSON.stringify(references),confirmed.journeyId)
  const taskId = 'task_dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const runId = 'run_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const later = new Date(Date.now()+60_000).toISOString()
  db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,version,created_at,updated_at)
    VALUES (?,?,'RUN_EXECUTE','QUEUED',0,?,?,1,?,?)`).run(taskId,f.namespace,binding.prepared.caseId,runId,later,later)
  db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at)
    VALUES (?,?,?,1,?,?,'QUEUED',1,?)`).run(runId,f.namespace,binding.prepared.caseId,binding.planId,taskId,later)

  const projected = await f.service.getJourney({namespace:f.namespace,journeyId:confirmed.journeyId,waitSeconds:0})
  assert.equal(projected.stage,'FAILED_CLOSED')
  assert.equal(projected.status,'FAILED')
  assert.equal(projected.error.errorCode,'I10_EXECUTION_LINK_REQUIRED')
  assert.equal(Object.hasOwn(projected.references,'runId'),false)
})

test('historical same-plan run without an explicit Journey link fails closed instead of being adopted',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const binding = await activatedJourney(f,'a')
  const {confirmed} = await confirmExecution(f,binding,'legacy-unlinked',{mode:'ON_DEMAND'})
  const db = f.database.connection
  const taskId = 'task_f1111111-1111-4111-8111-111111111111'
  const runId = 'run_f2222222-2222-4222-8222-222222222222'
  const later = new Date(Date.now()+60_000).toISOString()
  db.prepare(`INSERT INTO tasks(task_id,namespace,task_type,status,progress,case_id,run_id,version,created_at,updated_at)
    VALUES (?,?,'RUN_EXECUTE','QUEUED',0,?,?,1,?,?)`).run(taskId,f.namespace,binding.prepared.caseId,runId,later,later)
  db.prepare(`INSERT INTO runs(run_id,namespace,case_id,case_version,plan_id,task_id,status,version,created_at)
    VALUES (?,?,?,1,?,?,'QUEUED',1,?)`).run(runId,f.namespace,binding.prepared.caseId,binding.planId,taskId,later)

  const projected = await f.service.getJourney({namespace:f.namespace,journeyId:confirmed.journeyId,waitSeconds:0})
  assert.equal(projected.stage,'FAILED_CLOSED')
  assert.equal(projected.error.errorCode,'I10_EXECUTION_LEGACY_OBJECT_UNLINKED')
  assert.equal(Object.hasOwn(projected.references,'runId'),false)
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

test('v4 exact proposal rejects client payload reference injection without changing the journey',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-proposal-payload-001',sessionRef:'session-proposal-payload-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),
    interactionContractVersion:'v4'
  },{requestId:'request-proposal-payload-001',actorType:'COZE'})
  assert.equal(typeof prepared.proposal.payload,'object')
  const injectedTaskId = 'task_77777777-7777-4777-8777-777777777777'
  await assert.rejects(
    () => f.service.decideJourney({
      namespace:f.namespace,idempotencyKey:'journey-proposal-payload-bad-001',
      journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'APPROVE_CASE',
      proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
      confirmationRef:'confirm-proposal-payload-001',
      payload:{...prepared.proposal.payload,taskId:injectedTaskId}
    },{requestId:'request-proposal-payload-002',actorType:'COZE'}),
    error => error.errorCode === 'I10_PROPOSAL_PAYLOAD_MISMATCH'
  )
  const unchanged = await f.service.getJourney({namespace:f.namespace,journeyId:prepared.journeyId,waitSeconds:0})
  assert.equal(unchanged.version,prepared.version)
  assert.equal(unchanged.stage,'READY_FOR_CASE_APPROVAL')
  assert.equal(Object.hasOwn(unchanged.references,'taskId'),false)
})

test('v4 exact proposal rejects a frozen payload whose stored hash no longer matches',async t => {
  const f = await fixture()
  t.after(async()=>{await f.database.close();fs.rmSync(f.root,{recursive:true,force:true})})
  const prepared = await f.service.prepareJourney({
    namespace:f.namespace,idempotencyKey:'journey-proposal-corrupt-001',sessionRef:'session-proposal-corrupt-001',
    requestIntent:'CASE_AUTHORING',inputType:'NATURAL_LANGUAGE',naturalLanguage:'验证登录',
    credentialRef:f.credentialRef,supportingImages:[],draftJson:validDraft(f.credentialRef),
    interactionContractVersion:'v4'
  },{requestId:'request-proposal-corrupt-001',actorType:'COZE'})
  const row = f.database.connection.prepare(
    `SELECT next_action_json FROM i10_interaction_journeys WHERE journey_id=?`
  ).get(prepared.journeyId)
  const nextAction = JSON.parse(row.next_action_json)
  nextAction.proposal.payload.inputRevision = 999
  f.database.connection.prepare(
    `UPDATE i10_interaction_journeys SET next_action_json=? WHERE journey_id=?`
  ).run(JSON.stringify(nextAction),prepared.journeyId)
  await assert.rejects(
    () => f.service.decideJourney({
      namespace:f.namespace,idempotencyKey:'journey-proposal-corrupt-bad-001',
      journeyId:prepared.journeyId,expectedVersion:prepared.version,decision:'APPROVE_CASE',
      proposalId:prepared.proposal.proposalId,payloadHash:prepared.proposal.payloadHash,
      confirmationRef:'confirm-proposal-corrupt-001',payload:nextAction.proposal.payload
    },{requestId:'request-proposal-corrupt-002',actorType:'COZE'}),
    error => error.errorCode === 'I10_PROPOSAL_PAYLOAD_INTEGRITY_FAILED'
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

test('repair rerun derives a new immutable Journey decision instead of reusing the consumed run decision', () => {
  const source = fs.readFileSync(path.join(productRoot, 'harness/src/service.ts'), 'utf8')
  assert.match(source, /deriveRepairRerunDecision/)
  assert.match(source, /decision:'RERUN_REPAIR'/)
  assert.match(source, /repairRerunOfEventId/)
})
