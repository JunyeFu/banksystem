'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const { inputEnvelopeSchema, caseDraftSchema } = require('../../dist/harness/src/i10/schemas.js')

test('I10 InputEnvelope and CaseDraft fail closed at the completeness boundary', () => {
  const common = { schemaVersion: 'hengzhun-i10-input-envelope-v1', sourceRef: 'flowise-session-0001' }
  assert.equal(inputEnvelopeSchema.safeParse({ ...common, inputType: 'NATURAL_LANGUAGE', naturalLanguage: '登录门户并核对个人资料' }).success, true)
  assert.equal(inputEnvelopeSchema.safeParse({ ...common, inputType: 'CASE_FILE', flowiseFileRef: 'attachment-0001', originalFilename: 'cases.xlsx' }).success, true)
  assert.equal(inputEnvelopeSchema.safeParse({ ...common, inputType: 'VIDEO', flowiseFileRef: 'attachment-0002', originalFilename: 'success.mp4' }).success, true)
  assert.equal(inputEnvelopeSchema.safeParse({ ...common, inputType: 'VIDEO' }).success, false)
  const incompleteConfirmed = {
    schemaVersion: 'hengzhun-i10-case-draft-v1', title: '门户登录', objective: '验证登录', summary: '登录案例',
    preconditions: [], steps: [{ action: '输入凭据', expected: '进入门户' }], assertions: ['登录成功'],
    source: { inputType: 'NATURAL_LANGUAGE', sourceRef: 'conversation-0001', sourceHash: 'a'.repeat(64), provenanceSummary: '用户描述' },
    confidence: 0.8, missingFields: ['entryUrl'], confirmationStatus: 'CONFIRMED',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY', executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY', evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  }
  assert.equal(caseDraftSchema.safeParse(incompleteConfirmed).success, false)
})

test('I10 migration freezes five intake domains and dual stability policies', () => {
  const sql = fs.readFileSync(path.join(root, 'harness/migrations/017_i10_formal_intake_credentials.sql'), 'utf8')
  for (const table of ['i10_credential_sessions', 'i10_credential_refs', 'i10_ingest_jobs', 'i10_ingest_items', 'i10_video_frames', 'i10_action_traces', 'i10_stability_policy_bindings']) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`))
  }
  assert.match(sql, /I8_2X3_V1/)
  assert.match(sql, /I10_2X2_V1/)
  assert.match(sql, /required_runs IN \(4, 6\)/)
  const binding = fs.readFileSync(path.join(root, 'harness/migrations/018_i10_authoring_context_binding.sql'), 'utf8')
  assert.match(binding, /CREATE TABLE i10_authoring_contexts\b/)
  assert.match(binding, /I10_AUTHORING_CONTEXT_IMMUTABLE/)
  const batchReporting = fs.readFileSync(path.join(root, 'harness/migrations/019_i10_case_file_batch_reporting.sql'), 'utf8')
  for (const table of ['i10_ingest_field_mappings', 'i10_ingest_errors', 'i10_ingest_error_resolutions']) assert.match(batchReporting, new RegExp(`CREATE TABLE ${table}\\b`))
  assert.match(batchReporting, /I10_INGEST_ERROR_IMMUTABLE/)
  const multimodal = fs.readFileSync(path.join(root, 'harness/migrations/020_i10_multimodal_verification.sql'), 'utf8')
  for (const table of ['i10_image_ingest_jobs','i10_supporting_images','i10_image_evidence_packets','i10_image_ocr_blocks','i10_case_fact_candidates','i10_verification_challenges','i10_verification_events']) assert.match(multimodal,new RegExp(`CREATE TABLE ${table}\\b`))
})

test('I10 twenty-gap closure matrix binds implementation, tests and runtime evidence without claiming S9', () => {
  const matrix = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/gap-closure-matrix-v1.json'), 'utf8'))
  assert.equal(matrix.schemaVersion, 'hengzhun-i10-gap-closure-matrix-v1')
  assert.equal(matrix.scope, 'I10-S0-S8-R0-R7')
  assert.equal(matrix.status, 'VERIFIED')
  assert.deepEqual(matrix.gaps.map((gap) => gap.id), Array.from({ length: 20 }, (_, index) => `I10-G${String(index + 1).padStart(2, '0')}`))
  assert.equal(matrix.releaseBoundary.i10Stage9Included, false)
  assert.match(matrix.releaseBoundary.reason, /paused by user instruction/)
  for (const gap of matrix.gaps) {
    assert.equal(gap.status, 'VERIFIED', gap.id)
    assert.ok(gap.implementation.length > 0, `${gap.id} implementation`)
    assert.ok(gap.tests.length > 0, `${gap.id} tests`)
    assert.ok(gap.runtimeEvidence.length > 0, `${gap.id} runtime evidence`)
    for (const relativePath of [...gap.implementation, ...gap.tests]) {
      assert.equal(path.isAbsolute(relativePath), false, `${gap.id} path`)
      assert.equal(fs.existsSync(path.join(root, ...relativePath.split('/'))), true, `${gap.id} missing ${relativePath}`)
    }
  }
  assert.equal(matrix.stage8Evidence.mock, false)
  assert.equal(matrix.stage8Evidence.degraded, false)
  assert.equal(matrix.stage8Evidence.forwardScenarioCount, 9)
  assert.equal(matrix.stage8Evidence.reverseScenarioCount, 3)
})

test('I10 MCP exposes legacy tools plus governed multimodal and verification tools', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const tools = [...source.matchAll(/server\.registerTool\('([^']+)'/g)].map(match => match[1])
  assert.equal(tools.length, 23)
  for (const name of ['credential_session_create', 'credential_session_get', 'ingest_submit', 'ingest_get', 'ingest_decision_submit','image_ingest_submit','image_ingest_get','verification_get','verification_decision_submit']) assert.ok(tools.includes(name), name)
  assert.match(source, /stabilityPolicyVersion: 'I10_2X2_V1'/)
  assert.match(source, /includeDownload: includeDownload === true/)
  assert.match(source, /function normalizeControlledPortalRoute/)
  assert.match(source, /parsed\.pathname === '\/portal\/login'/)
  assert.match(source, /intentStepId: `intent-\$\{String\(index \+ 1\)\.padStart\(3, '0'\)\}`/)
  assert.match(source, /intentStepIds: z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(160\)\)/)
  assert.match(source, /action: z\.enum\(\['READ', 'DISABLE'\]\)/)
  assert.match(source, /I8_SCHEDULE_DISABLE_CONFIRMATION_REQUIRED/)
  assert.match(source, /controlledAttachmentRef = z\.string\(\)\.trim\(\)\.min\(8\)\.max\(1024\)/)
  assert.match(source, /flowiseFileRef: controlledAttachmentRef/)
  assert.match(source, /function normalizeControlledPortalRoute/)
  assert.match(source, /parsed\.pathname === '\/portal\/login'/)
  for (const forbidden of ['child_process', 'execSync(', 'database.sqlite', 'SELECT * FROM']) assert.equal(source.includes(forbidden), false)
})

test('portable model profiles use generic variables and fixed capability ceilings', () => {
  const controller = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/controller-profile-v1.json'), 'utf8'))
  const vision = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/visual-profile-v1.json'), 'utf8'))
  const intranetGate = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/intranet-qwen35-capability-gate-v1.json'), 'utf8'))
  const runtime = fs.readFileSync(path.join(root, 'config/i10.runtime.example.json'), 'utf8')
  const probe = fs.readFileSync(path.join(root, 'scripts/verify-i10-model-probes.cjs'), 'utf8')
  const importer = fs.readFileSync(path.join(root, 'scripts/import-i10-runtime-env.ps1'), 'utf8')
  const joined = `${JSON.stringify(controller)}\n${JSON.stringify(vision)}\n${runtime}\n${probe}\n${importer}`
  for (const required of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL_NAME']) assert.ok(joined.includes(required), required)
  for (const internal of ['HENGZHUN_SERVICE_TOKEN', 'HENGZHUN_MCP_TOKEN', 'HENGZHUN_WORKER_TOKEN']) assert.ok(importer.includes(internal), internal)
  for (const flowiseCredential of ['FLOWISE_API_KEY', 'FLOWISE_ADMIN_EMAIL', 'FLOWISE_ADMIN_PASSWORD', 'FLOWISE_ADMIN_NAME']) assert.ok(importer.includes(flowiseCredential), flowiseCredential)
  assert.match(importer, /GetEnvironmentVariable\(\$name, 'User'\)/)
  assert.equal(controller.context.totalTokens, 1000000)
  assert.equal(controller.context.maximumOutputTokens, 8192)
  assert.equal(vision.context.totalTokens, 16000)
  assert.equal(vision.context.maximumInputTokens, 12000)
  assert.equal(vision.context.reservedOutputTokens, 4000)
  assert.equal(intranetGate.status, 'LIVE_ENDPOINT_UNVERIFIED')
  assert.equal(intranetGate.minimumCapabilities.controller.contextTokens, 1000000)
  assert.equal(intranetGate.minimumCapabilities.controller.maximumOutputTokens, 8192)
  assert.equal(intranetGate.minimumCapabilities.vision.contextTokens, 16000)
  assert.equal(intranetGate.capacitySemantics.adapterMaySilentlyClampDeclaredCapacity, false)
  assert.equal(intranetGate.decision.belowMinimum, 'BLOCK_MIGRATION_NO_SILENT_DOWNGRADE')
  assert.equal(intranetGate.decision.aboveMinimum, 'SUPPORTED_AND_RECORDED_WITHOUT_ADAPTER_CLAMP')
  assert.deepEqual(intranetGate.publicRuntimeVariables.controller, ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME'])
  const configurationOnly = `${JSON.stringify(controller)}\n${JSON.stringify(vision)}\n${runtime}\n${importer}`
  assert.equal(configurationOnly.includes('sk-'), false)
})

test('real model probes retry only bounded transient HTTP failures and record attempts', () => {
  const probe = fs.readFileSync(path.join(root, 'scripts/verify-i10-model-probes.cjs'), 'utf8')
  assert.match(probe, /attempt <= 3/)
  assert.match(probe, /response\.status !== 429 && response\.status < 500/)
  assert.match(probe, /structureProbeAttempts/)
  assert.match(probe, /scheduleProbeAttempts/)
  assert.match(probe, /screenshotProbeAttempts/)
  const video = fs.readFileSync(path.join(root, 'worker/src/i10-video-ingest-runner.cjs'), 'utf8')
  assert.match(video, /modelAttempts <= 3/)
  assert.match(video, /response\.status !== 429 && response\.status < 500/)
  assert.match(video, /invocation: 'REAL', modelAttempts/)
})

test('I10 Worker resolves Midscene and Playwright from the bundled runtime', () => {
  const worker = fs.readFileSync(path.join(root, 'worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8')
  const context = fs.readFileSync(path.join(root, 'harness/src/context-envelope.ts'), 'utf8')
  assert.match(worker, /createRequire/)
  assert.match(worker, /runtimeRequire\('@midscene\/web\/playwright'\)/)
  assert.match(worker, /I10_MIDSCENE_MODEL_CALL_FAILED/)
  assert.match(worker, /locateAttempt === I10_MIDSCENE_MAX_LOCATE_ATTEMPTS/)
  assert.match(worker, /runtimeRequire\('playwright'\)/)
  assert.doesNotMatch(worker, /locator:\s*controlled\[/)
  assert.match(worker, /kind:\s*controlled\[action\.semanticTargetRef\]\.kind/)
  assert.match(worker, /value:\s*controlled\[action\.semanticTargetRef\]\.value/)
  assert.match(context, /不得假设1920x1080或其他分辨率后再次缩放/)
  assert.doesNotThrow(() => require('../../worker/src/i10-midscene-candidate-authoring.cjs'))
})

test('I10 Worker survives one failed queue iteration but keeps authentication failures fatal', () => {
  const worker = fs.readFileSync(path.join(root, 'worker/src/index.cjs'), 'utf8')
  assert.match(worker, /event: 'worker_iteration_failed'/)
  assert.match(worker, /writeHealth\('DEGRADED'/)
  assert.match(worker, /\^HARNESS_401_/)
  assert.match(worker, /setTimeout\(resolve, 1_000\)/)
})

test('I10 S8 orchestrator keeps plaintext credentials out of scenario and portal environment', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/i10-stage8-orchestrator.cjs'), 'utf8')
  assert.match(source, /credentialRef, caseFilePath:/)
  assert.doesNotMatch(source, /JSON\.stringify\(\{[^}]*username[^}]*caseFilePath/s)
  assert.match(source, /env: \{ SystemRoot:/)
  assert.match(source, /I10_STAGE8_FIXTURE_USERNAME: username/)
  assert.match(source, /I10_STAGE8_SCENARIO_FILE: scenarioFile/)
})

test('I10 Flowise contract has three inputs and no fixed 2030 schedule', () => {
  const files = ['formal-workflow-spec-v1.json', 'input-and-schedule-contract-v1.json', 'agentflow-v2.json']
  const text = files.map(file => fs.readFileSync(path.join(root, 'flowise/i10', file), 'utf8')).join('\n')
  for (const input of ['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO']) assert.ok(text.includes(input), input)
  for (const schedule of ['ON_DEMAND', 'ONE_TIME', 'RECURRING']) assert.ok(text.includes(schedule), schedule)
  assert.equal(/2030[-/]/.test(text), false)
  assert.equal(text.includes('2视口×3次'), false)
  assert.equal(text.includes('2视口×2次'), true)
  assert.match(text, /credentialRef/)
  assert.match(text, /route必须精确输出\/portal\/login/)
  assert.match(text, /route必须精确输出\/portal\/login/)
  assert.match(text, /includeDownload/)
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v2.json'), 'utf8'))
  for (const node of flow.nodes.filter(item => item.data?.name === 'llmAgentflow')) {
    const system = (node.data.inputs.llmMessages || []).find(message => message.role === 'system')
    assert.match(system?.content || '', /json/i, `${node.id} must explicitly request JSON for DeepSeek json_object mode`)
    assert.match(system?.content || '', /不得改名、不得省略、不得为null/, `${node.id} must freeze exact structured-output keys`)
  }
  const labels = new Set(flow.nodes.map(node => node.data?.label))
  for (const label of ['识别三类输入与信息缺口', '是否创建回归案例', 'MCP查询历史回归结果', '确认停用指定调度', 'MCP停用指定调度', 'MCP创建安全凭据会话', 'MCP提交视频导入', 'MCP提交案例文件', '确认或校正导入草案', '解析人工确认或校正', 'MCP提交CaseDraft修正', 'MCP拒绝导入草案', 'MCP回读调度状态', 'MCP读取正式结果收件箱', 'MCP读取修复复跑结果收件箱']) assert.ok(labels.has(label), label)
  const readyOutputs = flow.nodes.find(node => node.id === 'llmAgentflow_i10_ready').data.inputs.llmStructuredOutput
  assert.equal(readyOutputs.filter(item => item.key === 'credentialRef').length, 1)
  assert.equal(JSON.stringify(flow).includes('CONTROL_MODEL_NAME'), true)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, manifest.primaryFlowDataPath))).digest('hex'), manifest.primaryFlowSha256)
  assert.equal(typeof manifest.deployed, 'boolean')
  assert.equal(manifest.controllerCredential.runtimeVariable, 'CONTROL_API_KEY')
})

test('I10 publisher materializes bundled Flowise prototypes without private database writes', () => {
  const previous = { CONTROL_MODEL_NAME: process.env.CONTROL_MODEL_NAME, CONTROL_BASE_URL: process.env.CONTROL_BASE_URL }
  process.env.CONTROL_MODEL_NAME = 'office-controller-model'
  process.env.CONTROL_BASE_URL = 'https://controller.invalid/v1'
  try {
    const publisherPath = path.join(root, 'scripts/i10-agentflow-publish.cjs')
    const { buildFlowData } = require(publisherPath)
    const flow = buildFlowData('credential-i10-test')
    const text = JSON.stringify(flow)
    assert.equal(flow.nodes.length, JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v2.json'), 'utf8')).nodes.length)
    assert.equal(text.includes('credential-i10-test'), true)
    assert.equal(text.includes('office-controller-model'), true)
    assert.equal(text.includes('8b7b962b-74b2-4c11-969f-46b7ebac6901'), true)
    const script = fs.readFileSync(publisherPath, 'utf8')
    const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
    const publicationContract = `${script}\n${JSON.stringify(publication)}`
    for (const forbidden of ['database.sqlite', 'UPDATE chat_flow', 'INSERT INTO chat_flow']) assert.equal(script.includes(forbidden), false)
    for (const route of ['/api/v1/credentials', '/api/v1/export-import/import', '/api/v1/chatflows', '/api/v1/export-import/export']) assert.equal(publicationContract.includes(route), true)
    assert.match(script, /DEPLOYED_PRIVATE_PUBLIC_API_ROUND_TRIP_VERIFIED/)
  } finally {
    if (previous.CONTROL_MODEL_NAME === undefined) delete process.env.CONTROL_MODEL_NAME; else process.env.CONTROL_MODEL_NAME = previous.CONTROL_MODEL_NAME
    if (previous.CONTROL_BASE_URL === undefined) delete process.env.CONTROL_BASE_URL; else process.env.CONTROL_BASE_URL = previous.CONTROL_BASE_URL
  }
})

test('Flowise overlay exposes governed attachment metadata without file bytes or machine paths', () => {
  const overlay = fs.readFileSync(path.join(root, 'scripts/apply-i9-flowise-overlays.cjs'), 'utf8')
  const runtime = fs.readFileSync(path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/LLM/LLM.js'), 'utf8')
  for (const source of [overlay, runtime]) assert.match(source, /I10_FLOWISE_CONTROLLED_ATTACHMENT_METADATA_V1/)
  assert.match(runtime, /FLOWISE_CONTROLLED_ATTACHMENTS=/)
  assert.match(runtime, /FLOWISE_MANAGED_UPLOAD/)
  assert.doesNotMatch(runtime, /readFileSync\(.*options\.uploads/)
  assert.doesNotMatch(runtime, /upload\.data/)
  const agentflowRuntime = fs.readFileSync(path.join(root, 'flowise/app/node_modules/flowise/dist/utils/buildAgentflow.js'), 'utf8')
  assert.match(agentflowRuntime, /I10_FLOWISE_OUTERMOST_CONDITION_MERGE_V3/)
  assert.match(agentflowRuntime, /return outermostConditionParent \|\| nearestHumanParent/)
  const toolRuntime = fs.readFileSync(path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/agentflow/Tool/Tool.js'), 'utf8')
  assert.match(toolRuntime, /I10_FLOWISE_SCHEMA_AWARE_TOOL_ARGUMENT_COERCION_V1/)
  assert.match(toolRuntime, /I10_FLOWISE_MCP_STATE_PAYLOAD_UNWRAP_V1/)
  assert.match(toolRuntime, /I10_FLOWISE_MCP_ARGUMENT_TYPE_DIAGNOSTICS_V1/)
  assert.match(toolRuntime, /I10_FLOWISE_MCP_ARGUMENT_CONSTRAINT_CHECKS_V1/)
  const mcpCoreRuntime = fs.readFileSync(path.join(root, 'flowise/app/node_modules/flowise-components/dist/nodes/tools/MCP/core.js'), 'utf8')
  assert.match(mcpCoreRuntime, /I10_FLOWISE_MCP_TYPED_SCHEMA_V1/)
  assert.match(mcpCoreRuntime, /case 'integer': return zod_1\.z\.number\(\)\.int\(\)/)
  const builtFlow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v2.json'), 'utf8'))
  const intent = builtFlow.nodes.find((node) => node.id === 'llmAgentflow_intent')
  assert.deepEqual(intent.data.inputs.llmStructuredOutput.map((item) => item.key), ['route', 'actions', 'expectedOutcomes', 'riskLevels', 'assertions'])
  const submit = builtFlow.nodes.find((node) => node.id === 'toolAgentflow_submit')
  assert.equal(submit.data.inputs.toolInputArgs.some((item) => item.inputArgName === 'intentStepIds'), false)
  const prepare = builtFlow.nodes.find((node) => node.id === 'toolAgentflow_prepare')
  assert.equal(prepare.data.inputs.toolInputArgs.find((item) => item.inputArgName === 'credentialRef')?.inputArgValue, '{{$flow.state.credentialRef}}')
  assert.equal(prepare.data.inputs.toolInputArgs.find((item) => item.inputArgName === 'actions')?.inputArgValue, '{{llmAgentflow_structure.output.actions}}')
  assert.equal(prepare.data.inputs.toolInputArgs.find((item) => item.inputArgName === 'expectedOutcomes')?.inputArgValue, '{{llmAgentflow_structure.output.expectedOutcomes}}')
  assert.equal(prepare.data.inputs.toolInputArgs.some((item) => ['draftJson', 'acceptanceSummaryJson', 'draftArray'].includes(item.inputArgName)), false)
  const structure = builtFlow.nodes.find((node) => node.id === 'llmAgentflow_structure')
  assert.deepEqual(structure.data.inputs.llmStructuredOutput.map((item) => [item.key, item.type]), [
    ['caseTitle', 'string'], ['objective', 'string'], ['summary', 'string'], ['targetSystem', 'string'], ['entryUrl', 'string'],
    ['preconditions', 'stringArray'], ['actions', 'stringArray'], ['expectedOutcomes', 'stringArray'], ['assertions', 'stringArray'], ['missingFields', 'stringArray'], ['multimodalContextJson','string'],
    ['acceptanceSummary', 'string'],
    ['clarificationRequired', 'boolean'], ['clarificationQuestion', 'string']
  ])
  assert.doesNotMatch(structure.data.inputs.llmMessages[0].content, /draftJson|acceptanceSummaryJson/)
  assert.match(structure.data.inputs.llmMessages[0].content, /由MCP组装权威CaseDraft/)
  for(const id of ['conditionAgentflow_supporting_images','toolAgentflow_image_ingest_submit','toolAgentflow_image_ingest_get','humanInputAgentflow_image_confirm'])assert.ok(builtFlow.nodes.some(node=>node.id===id),id)
  assert.equal(builtFlow.i10Contract.toolCount,23)
  assert.equal(prepare.data.inputs.toolUpdateState.find((item) => item.key === 'caseDraftJson')?.value, '{{ output.intentSource }}')
  const candidateReady = builtFlow.nodes.find((node) => node.id === 'toolAgentflow_candidate_ready')
  assert.equal(candidateReady.data.inputs.toolInputArgs.find((item) => item.inputArgName === 'waitForCertificate')?.inputArgValue, false)
  assert.equal(candidateReady.data.inputs.toolInputArgs.find((item) => item.inputArgName === 'waitTimeoutSeconds')?.inputArgValue, 45)
  const candidateReadyCondition = builtFlow.nodes.find((item) => item.id === 'conditionAgentflow_candidate_ready')
  assert.equal(candidateReadyCondition.data.inputs.conditions[0].value2, 'HUMAN_DELIVERY_DECISION_REQUIRED')
  const candidateAuthoringFailed = builtFlow.nodes.find((item) => item.id === 'conditionAgentflow_candidate_authoring_failed')
  const candidateValidationFailed = builtFlow.nodes.find((item) => item.id === 'conditionAgentflow_candidate_validation_failed')
  assert.equal(candidateReadyCondition.data.inputs.conditions[0].value1, '{{toolAgentflow_candidate_ready}}')
  assert.equal(candidateAuthoringFailed.data.inputs.conditions[0].value2, 'AUTHORING_REVIEW_REQUIRED')
  assert.equal(candidateValidationFailed.data.inputs.conditions[0].value2, 'CANDIDATE_REPAIR_REQUIRED')
  assert.ok(builtFlow.edges.some((item) => item.source === 'conditionAgentflow_candidate_validation_failed' && item.target === 'humanInputAgentflow_generation'))
  const stage8Runner = fs.readFileSync(path.join(root, 'scripts/i10-stage8-live.cjs'), 'utf8')
  assert.match(stage8Runner, /question: reject \? 'Reject' : \(feedback \|\| 'Proceed'\)/)
  assert.match(stage8Runner, /if \(\+\+step > 80\)/)
  assert.match(stage8Runner, /I10_STAGE8_SINGLE_SEQUENCE/)
  assert.match(stage8Runner, /diagnosticOnly: true/)
  for (const [id, token] of [['conditionAgentflow_on_demand', 'ON_DEMAND'], ['conditionAgentflow_one_time', 'ONE_TIME'], ['conditionAgentflow_recurring', 'RECURRING']]) {
    const node = builtFlow.nodes.find((item) => item.id === id)
    assert.equal(node.data.inputs.conditions[0].operation, 'contains')
    assert.equal(node.data.inputs.conditions[0].value2, token)
  }
  assert.equal(builtFlow.nodes.find((item) => item.id === 'toolAgentflow_schedule').data.inputs.toolInputArgs.find((item) => item.inputArgName === 'scheduleType').inputArgValue, 'ONE_TIME')
  assert.equal(builtFlow.nodes.find((item) => item.id === 'toolAgentflow_schedule_recurring').data.inputs.toolInputArgs.find((item) => item.inputArgName === 'scheduleType').inputArgValue, 'RECURRING')
  for (const id of ['toolAgentflow_schedule', 'toolAgentflow_repair_schedule']) {
    const names = builtFlow.nodes.find((item) => item.id === id).data.inputs.toolInputArgs.map((item) => item.inputArgName)
    assert.ok(names.includes('runAt'), `${id} must provide runAt`)
    assert.equal(names.includes('cronExpression'), false, `${id} must omit cronExpression`)
  }
  for (const id of ['toolAgentflow_schedule_recurring', 'toolAgentflow_repair_schedule_recurring']) {
    const names = builtFlow.nodes.find((item) => item.id === id).data.inputs.toolInputArgs.map((item) => item.inputArgName)
    assert.ok(names.includes('cronExpression'), `${id} must provide cronExpression`)
    assert.equal(names.includes('runAt'), false, `${id} must omit runAt`)
  }
  assert.ok(builtFlow.edges.some((item) => item.source === 'conditionAgentflow_repair_one_time' && item.target === 'toolAgentflow_repair_schedule'))
  assert.ok(builtFlow.edges.some((item) => item.source === 'conditionAgentflow_repair_recurring' && item.target === 'toolAgentflow_repair_schedule_recurring'))
  const repairReady = builtFlow.nodes.find((item) => item.id === 'toolAgentflow_repair_ready')
  assert.equal(repairReady.data.inputs.toolInputArgs.find((item) => item.inputArgName === 'waitForProposal').inputArgValue, false)
  assert.equal(repairReady.data.inputs.toolInputArgs.some((item) => item.inputArgName === 'waitTimeoutSeconds'), false)
  assert.ok(builtFlow.edges.some((item) => item.source === 'toolAgentflow_repair_ready' && item.target === 'conditionAgentflow_repair_ready'))
  assert.ok(builtFlow.edges.some((item) => item.source === 'conditionAgentflow_repair_validation_failed' && item.target === 'humanInputAgentflow_repair_wait'))
  assert.ok(builtFlow.edges.some((item) => item.source === 'humanInputAgentflow_repair_wait' && item.target === 'toolAgentflow_repair_ready'))
  const flowText = JSON.stringify(builtFlow)
  assert.doesNotMatch(flowText, /humanInputAgentflow_[^"}]+\.output/)
  assert.doesNotMatch(flowText, /toolAgentflow_ingest_get\.output/)
  assert.doesNotMatch(flowText, /toolAgentflow_ingest_get\.version/)
  assert.ok(builtFlow.nodes.find((item) => item.id === 'toolAgentflow_ingest_get').data.inputs.toolUpdateState.some((item) => item.key === 'ingestJobVersion'))
  for (const id of ['toolAgentflow_ingest_correct', 'toolAgentflow_ingest_decide', 'toolAgentflow_ingest_reject']) {
    assert.equal(builtFlow.nodes.find((item) => item.id === id).data.inputs.toolInputArgs.find((item) => item.inputArgName === 'expectedVersion').inputArgValue, '{{$flow.state.ingestJobVersion}}')
  }
  assert.equal(builtFlow.nodes.find((item) => item.id === 'toolAgentflow_ingest_correct').data.inputs.toolInputArgs.find((item) => item.inputArgName === 'reason').inputArgValue, '用户在Flowise中提交导入草案修正')
  assert.equal(builtFlow.nodes.find((item) => item.id === 'toolAgentflow_ingest_decide').data.inputs.toolInputArgs.find((item) => item.inputArgName === 'reason').inputArgValue, '用户在Flowise中确认统一CaseDraft')
  assert.match(builtFlow.nodes.find((item) => item.id === 'llmAgentflow_schedule_intent').data.inputs.llmMessages[1].content, /\{\{question\}\}/)
  assert.match(builtFlow.nodes.find((item) => item.id === 'llmAgentflow_schedule_intent').data.inputs.llmMessages[0].content, /runAt必须逐字符复制该ISO时间/)
  assert.match(builtFlow.nodes.find((item) => item.id === 'llmAgentflow_repair_schedule_intent').data.inputs.llmMessages[0].content, /保持同一UTC时间点/)
  assert.match(builtFlow.nodes.find((item) => item.id === 'llmAgentflow_ingest_decision').data.inputs.llmMessages[1].content, /\{\{question\}\}/)
})

test('I10 Midscene locator validation tolerates bounded visual-box approximation only', () => {
  const { locatorMatchesExpected } = require('../../worker/src/i10-midscene-candidate-authoring.cjs')
  const source = fs.readFileSync(path.join(root, 'worker/src/i10-midscene-candidate-authoring.cjs'), 'utf8')
  const exactDomBox = { x: 1252, y: 27, width: 44, height: 19 }
  assert.equal(locatorMatchesExpected({ center: [1281, 22.5] }, exactDomBox), true)
  assert.equal(locatorMatchesExpected({ center: [1217, 35] }, exactDomBox), false)
  assert.equal(locatorMatchesExpected({ center: [NaN, 35] }, exactDomBox), false)
  assert.match(source, /I10_MIDSCENE_MAX_LOCATE_ATTEMPTS = 3/)
  assert.match(source, /重新独立观察整张当前截图/)
})

test('I10 repair stability inherits credentialRef instead of legacy credential aliases', () => {
  const service = fs.readFileSync(path.join(root, 'harness/src/service.ts'), 'utf8')
  const worker = fs.readFileSync(path.join(root, 'worker/src/index.cjs'), 'utf8')
  assert.match(service, /LEFT JOIN case_versions cv ON cv\.case_id = r\.case_id AND cv\.version = r\.case_version/)
  assert.match(service, /definition\.credentialRef/)
  assert.match(service, /definition\.entryUrl/)
  const repairWorker = worker.slice(worker.indexOf('async function runI8RepairStabilityOnce'), worker.indexOf('async function runI10VideoIngestOnce'))
  assert.match(repairWorker, /credentialRef: claim\.credentialRef/)
  assert.match(repairWorker, /credential: i10Credential, baseUrl: claim\.entryUrl/)
})
