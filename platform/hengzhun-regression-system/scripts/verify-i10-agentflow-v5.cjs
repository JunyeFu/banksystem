#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { validateAgentflow } = require('./verify-i10-agentflow-paths.cjs')
const {
  schemaVersion: capabilityManifestVersion,
  generationAuthority,
  activeCapabilities,
  plannedCapabilities
} = require('./i10-agentflow-capabilities.cjs')

const root = path.resolve(__dirname, '..')
const flowPath = path.join(root, 'flowise/i10/agentflow-v5.json')
const rollbackPath = path.join(root, 'flowise/i10/agentflow-v4.json')
const manifestPath = path.join(root, 'flowise/i10/publication-manifest-v1.json')
const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const nodes = new Map(flow.nodes.map(item => [item.id, item]))
const predecessors = new Map(flow.nodes.map(item => [item.id, []]))
for (const item of flow.edges) predecessors.get(item.target)?.push(item.source)

const failures = validateAgentflow(flow)
assert.deepEqual(failures, [], failures.join('\n'))
assert.equal(flow.i10Contract.schemaVersion, 'hengzhun-i10-agentflow-v5')
assert.equal(flow.i10Contract.generationAuthority, generationAuthority)
assert.equal(flow.i10Contract.capabilityManifestVersion, capabilityManifestVersion)
assert.deepEqual(flow.i10Contract.activeCapabilities, activeCapabilities.map(item => item.id))
assert.deepEqual(flow.i10Contract.plannedCapabilities, plannedCapabilities)
assert.equal(flow.i10Contract.toolCount, 33)
for (const id of [
  'customFunctionAgentflow_i10_v4_target_profile_prerequisite',
  'conditionAgentflow_i10_v4_target_profile_prerequisite_route',
  'directReplyAgentflow_i10_v4_target_profile_context_incomplete',
  'toolAgentflow_i10_v4_target_profile_prepare',
  'humanInputAgentflow_i10_v4_target_profile_confirm',
  'toolAgentflow_i10_v4_target_profile_approve',
  'toolAgentflow_i10_v4_target_profile_get',
  'toolAgentflow_i10_v4_target_profile_reject'
]) {
  assert.ok(nodes.has(id), `目标站点门槛节点缺失:${id}`)
  assert.ok(predecessors.get(id)?.length, `目标站点门槛节点未连入主链:${id}`)
}
assert.equal(
  flow.edges.some(item => item.source === 'customFunctionAgentflow_i10_v3_normalize' && item.target === 'toolAgentflow_i10_v4_target_profile_prepare'),
  false,
  '规范化节点仍绕过目标站点前置门槛'
)
assert.ok(
  flow.edges.some(item => item.source === 'customFunctionAgentflow_i10_v3_normalize' && item.target === 'toolAgentflow_i10_v3_prepare'),
  '规范化节点未先进入journey_prepare'
)
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v3_needs_input' && item.sourceHandle.endsWith('-output-1') && item.target === 'customFunctionAgentflow_i10_v4_target_profile_prerequisite'),
  'journey已具备分支未经过目标站点前置门槛'
)
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_target_profile_prerequisite_route' && item.sourceHandle.endsWith('-output-3') && item.target === 'toolAgentflow_i10_v4_target_profile_prepare'),
  '只有前置门槛通过后才能准备目标站点'
)
for (const handle of ['-output-1', '-output-2']) {
  assert.equal(
    flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_target_profile_prerequisite_route' &&
      item.sourceHandle.endsWith(handle) && item.target === 'humanInputAgentflow_i10_v4_initial_case_input'),
    false,
    `目标站点门槛${handle}仍回连已执行的初始Human Input节点`
  )
}
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_target_profile_prerequisite_route' &&
    item.sourceHandle.endsWith('-output-1') && item.target === 'directReplyAgentflow_i10_v4_target_profile_context_incomplete') &&
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_target_profile_prerequisite_route' &&
    item.sourceHandle.endsWith('-output-2') && item.target === 'directReplyAgentflow_i10_v4_target_profile_context_incomplete'),
  '目标站点不完整分支没有可见的失败关闭回复'
)
const targetGateSource = nodes.get('customFunctionAgentflow_i10_v4_target_profile_prerequisite')?.data?.inputs?.customFunctionJavascriptFunction || ''
for (const marker of ['MISSING_CREDENTIAL', 'MISSING_ENTRY_URL', 'MISSING_CASE_FIELDS', 'PREPARE_TARGET_PROFILE', 'TARGET_PROFILE_ALREADY_ACTIVE']) {
  assert.match(targetGateSource, new RegExp(marker), `目标站点门槛缺少路由:${marker}`)
}
assert.ok(
  flow.edges.some(item => item.source === 'toolAgentflow_i10_v4_target_profile_get'
    && item.target === 'toolAgentflow_i10_v3_prepare'),
  '目标站点批准后未进入案例准备'
)
assert.deepEqual(flow.i10Contract.publicJourneyTools, [
  'journey_prepare',
  'journey_get',
  'journey_input_submit',
  'journey_decision_submit'
])
assert.deepEqual(flow.i10Contract.interactionModes, [
  'STATUS_ONLY',
  'INPUT_REQUIRED',
  'CONFIRM_EXACT'
])
assert.equal(flow.i10Contract.binaryChoiceSemantics, 'EXACT_PROPOSAL_ONLY')
assert.equal(flow.i10Contract.currentFeedbackOnly, true)
assert.equal(flow.i10Contract.internalStructuredOutputRole, 'userMessage')
for (const node of flow.nodes.filter(item =>
  item.data?.name === 'llmAgentflow' &&
  Array.isArray(item.data.inputs?.llmStructuredOutput) &&
  item.data.inputs.llmStructuredOutput.length > 0
)) {
  assert.equal(node.data.inputs.llmReturnResponseAs, 'userMessage', `${node.id}泄露内部结构化输出`)
}

const classifierUpdates = nodes.get('llmAgentflow_i10_v3_classify')
  ?.data?.inputs?.llmUpdateState || []
assert.equal(classifierUpdates.length, 1)
assert.ok(classifierUpdates.every(item => item.key.startsWith('classified')), '分类LLM仍可直接覆盖权威会话状态')
assert.equal(classifierUpdates[0].key, 'classifiedRaw', '分类LLM没有只写入原始响应')
assert.equal(classifierUpdates[0].value, '{{ output }}', '分类LLM原始响应绑定错误')
const imageRoute = nodes.get('customFunctionAgentflow_i10_v4_image_route')
assert.deepEqual(
  imageRoute?.data?.inputs?.customFunctionUpdateState,
  [{ key: 'imageRoute', value: '{{ output.route }}' }],
  '补充图片路由结果没有写入Flow State'
)
assert.ok(
  (nodes.get('conditionAgentflow_i10_v4_image_route')?.data?.inputs?.conditions || [])
    .every(item => item.value1 === '{{$flow.state.imageRoute}}'),
  '补充图片分支仍读取不可解析的节点输出'
)
assert.ok(
  (nodes.get('customFunctionAgentflow_i10_v4_image_correction_guard')
    ?.data?.inputs?.customFunctionUpdateState || [])
    .some(item => item.key === 'interactionFeedbackSafe' && item.value === '{{ output.safe }}'),
  '图片纠正安全结果未投影到Flow State'
)
assert.equal(
  nodes.get('conditionAgentflow_i10_v4_image_correction_safe')
    ?.data?.inputs?.conditions?.[0]?.value1,
  '{{$flow.state.interactionFeedbackSafe}}',
  '图片纠正分支仍读取不可解析的节点输出'
)
assert.deepEqual(
  nodes.get('customFunctionAgentflow_i10_v4_initial_case_guard')
    ?.data?.inputs?.customFunctionUpdateState,
  [
    { key: 'interactionFeedbackSafe', value: '{{ output.safe }}' },
    { key: 'interactionFeedback', value: '{{ output.feedback }}' }
  ],
  '初始案例补充没有先把本轮安全反馈投影到Flow State'
)
assert.equal(
  nodes.get('conditionAgentflow_i10_v4_initial_case_safe')
    ?.data?.inputs?.conditions?.[0]?.value1,
  '{{$flow.state.interactionFeedbackSafe}}',
  '初始案例补充仍读取不可靠的跨节点嵌套输出'
)
for (const id of [
  'customFunctionAgentflow_i10_v4_initial_input_route_detect',
  'conditionAgentflow_i10_v4_initial_input_route',
  'customFunctionAgentflow_i10_v4_initial_url_merge'
]) assert.ok(nodes.has(id), `初始补充URL快速路径缺失:${id}`)
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_initial_input_route' &&
    item.sourceHandle.endsWith('-output-0') && item.target === 'customFunctionAgentflow_i10_v4_initial_url_merge'),
  '仅补入口地址没有进入确定性合并路径'
)
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_initial_input_route' &&
    item.sourceHandle.endsWith('-output-1') && item.target === 'customFunctionAgentflow_i10_v5_initial_prompt'),
  '复杂补充没有进入主控模型结构化路径'
)
assert.ok(
  flow.edges.some(item => item.source === 'customFunctionAgentflow_i10_v4_initial_url_merge' &&
    item.target === 'toolAgentflow_i10_v4_initial_case_submit'),
  '仅补入口地址没有回到Harness权威提交'
)
const initialUrlMergeUpdates = nodes.get('customFunctionAgentflow_i10_v4_initial_url_merge')?.data?.inputs?.customFunctionUpdateState || []
for (const key of ['caseDraftJson', 'draftDisplayJson', 'semanticAssessmentJson', 'controllerDraft_entryUrl']) {
  assert.ok(initialUrlMergeUpdates.some(item => item.key === key), `仅补入口地址后未回写权威状态:${key}`)
}
assert.match(
  String(nodes.get('humanInputAgentflow_i10_v4_initial_case_input')?.data?.inputs?.humanInputDescription || ''),
  /本轮只需补充上方列出的内容/,
  '初始案例补充仍使用泛化输入提示'
)
assert.doesNotMatch(
  String(nodes.get('humanInputAgentflow_i10_v4_initial_case_input')?.data?.inputs?.humanInputDescription || ''),
  /请只补充业务目标、入口地址、操作步骤或预期结果/,
  '初始案例补充仍把所有字段错误地提示为当前缺口'
)
assert.match(
  JSON.stringify(nodes.get('customFunctionAgentflow_i10_v5_initial_prompt')?.data?.inputs || []),
  /accumulatedCaseInput/,
  '初始案例补充没有经过紧凑上下文封装'
)
assert.deepEqual(
  nodes.get('llmAgentflow_i10_v4_image_correction_structure')
    ?.data?.inputs?.llmStructuredOutput,
  [{
    key: 'factDecisions',
    type: 'jsonArray',
    description: '覆盖全部事实的factId、decision及可选replacementValue数组'
  }],
  '图片事实纠正结构化字段未统一为factDecisions'
)
assert.ok(
  flow.edges.some(item =>
    item.source === 'conditionAgentflow_i10_v4_image_status' &&
    item.sourceHandle.endsWith('-output-3') &&
    item.target === 'humanInputAgentflow_i10_v4_image_wait'
  ),
  '补充图片处理中状态未回到同一Human Input等待节点'
)
assert.ok(
  flow.edges.some(item =>
    item.source === 'conditionAgentflow_i10_v4_image_status' &&
    item.sourceHandle.endsWith('-output-2') &&
    item.target === 'directReplyAgentflow_i10_v4_image_failed'
  ),
  '补充图片失败状态未失败关闭'
)
const classificationMerge = nodes.get('customFunctionAgentflow_i10_v4_classification_merge')
assert.ok(classificationMerge, '缺少分类与会话上下文确定性合并节点')
const classificationMergeSource =
  classificationMerge.data.inputs.customFunctionJavascriptFunction
assert.match(classificationMergeSource, /effectiveInputType === 'NATURAL_LANGUAGE'/)
assert.match(classificationMergeSource, /attachmentOnly\s*\?\s*'NATURAL_LANGUAGE'/)
assert.match(
  nodes.get('llmAgentflow_i10_v3_classify')?.data?.inputs?.systemMessage || '',
  /supportingImageRef1\/Name1/
)
assert.deepEqual(
  nodes.get('llmAgentflow_i10_v3_classify')?.data?.inputs?.llmStructuredOutput,
  []
)
assert.match(classificationMergeSource, /parseJsonObject/)
assert.match(classificationMergeSource, /parsed\.supportingImages/)
assert.match(classificationMergeSource, /\.\.\.\(originalFilename \? \{ originalFilename \} : \{\}\)/)
assert.equal(/\bmime\s*:/.test(classificationMergeSource), false)
assert.equal(/\bsource\s*:/.test(classificationMergeSource), false)
assert.match(classificationMergeSource, /purposeHint/)
assert.ok(
  flow.edges.some(item =>
    item.source === 'llmAgentflow_i10_v3_classify' &&
    item.target === classificationMerge.id
  ),
  '分类LLM未接入确定性合并节点'
)
assert.ok(
  flow.edges.some(item =>
    item.source === classificationMerge.id &&
    item.target === 'conditionAgentflow_i10_v3_route_resume'
  ),
  '确定性合并节点未接回意图路由'
)
const asyncResumeDetect = nodes.get('customFunctionAgentflow_i10_v4_candidate_resume_detect')
assert.ok(
  (asyncResumeDetect?.data?.inputs?.customFunctionInputVariables || [])
    .some(item => item.variableName === 'candidateJobId' && item.variableValue === '{{$flow.state.candidateJobId}}'),
  '继续候选作者化时没有绑定当前candidateJobId'
)
assert.equal(
  (asyncResumeDetect?.data?.inputs?.customFunctionInputVariables || [])
    .some(item => item.variableName === 'preparationId'),
  false,
  '仅有preparationId时不得误判为可恢复候选'
)
assert.ok(
  (asyncResumeDetect?.data?.inputs?.customFunctionInputVariables || [])
    .some(item => item.variableName === 'ingestJobId' && item.variableValue === '{{$flow.state.ingestJobId}}'),
  '继续异步附件导入时没有绑定当前ingestJobId'
)
assert.ok(
  (asyncResumeDetect?.data?.inputs?.customFunctionUpdateState || [])
    .some(item => item.key === 'resumeRoute' && item.value === '{{ output.route }}'),
  '继续请求路由结果未投影到Flow State'
)
assert.match(
  asyncResumeDetect?.data?.inputs?.customFunctionJavascriptFunction || '',
  /RESUME_INGEST/,
  '继续请求没有确定性区分异步附件导入'
)
assert.ok(
  (nodes.get('conditionAgentflow_i10_v4_candidate_resume_route')?.data?.inputs?.conditions || [])
    .every(item => item.value1 === '{{$flow.state.resumeRoute}}'),
  '继续请求路由仍读取Bundled Flowise无法解析的节点输出'
)
assert.ok(
  flow.edges.some(item =>
    item.source === 'conditionAgentflow_i10_v4_candidate_resume_route' &&
    item.sourceHandle.endsWith('-output-2') &&
    item.target === 'toolAgentflow_i10_v3_ingest_get'
  ),
  '异步附件导入继续请求没有回到ingest_get'
)
for (const id of [
  'conditionAgentflow_i10_v4_credential_resume_route',
  'customFunctionAgentflow_i10_v5_credential_resume_prompt',
  'customFunctionAgentflow_i10_v4_credential_resume_assemble',
  'toolAgentflow_i10_v4_credential_resume_submit'
]) {
  assert.ok(nodes.has(id), `缺少凭据录入后同旅程恢复节点:${id}`)
}
assert.ok(
  flow.edges.some(item =>
    item.source === 'toolAgentflow_i10_v3_credential_refresh' &&
    item.target === 'conditionAgentflow_i10_v4_credential_resume_route'
  ),
  '凭据查询后仍未进入同旅程恢复判断'
)
assert.equal(
  flow.edges.some(item =>
    item.source === 'toolAgentflow_i10_v3_credential_refresh' &&
    item.target === 'customFunctionAgentflow_i10_v4_image_route'
  ),
  false,
  '凭据查询仍绕过同旅程恢复'
)
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_credential_resume_route' &&
    item.sourceHandle.endsWith('-output-0') && item.target === 'customFunctionAgentflow_i10_v4_credential_resume_assemble'),
  '已有草案的凭据回流仍触发重复LLM结构化'
)
assert.ok(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v4_credential_resume_route' &&
    item.sourceHandle.endsWith('-output-1') && item.target === 'customFunctionAgentflow_i10_v5_credential_resume_prompt'),
  '缺少草案的历史旅程没有进入紧凑恢复路径'
)

const serialized = JSON.stringify(flow)
assert.equal(serialized.includes('journeyPrimaryDecision'), false)
assert.equal(serialized.includes('批准第一项'), false)
assert.doesNotMatch(
  serialized,
  /humanInputAgentflow[^"}]*\.input\.feedback/,
  'Human Input反馈仍错误引用节点输入；Bundled Flowise只从output.conditions[*].feedback暴露当前反馈'
)
for (const id of ['llmAgentflow_schedule_intent', 'llmAgentflow_repair_schedule_intent']) {
  assert.equal(JSON.stringify(nodes.get(id)?.data?.inputs || {}).includes('{{question}}'), false, id)
}
for (const id of [
  'customFunctionAgentflow_i10_v4_schedule_feedback_guard',
  'conditionAgentflow_i10_v4_schedule_feedback_safe',
  'customFunctionAgentflow_i10_v4_schedule_normalize',
  'conditionAgentflow_i10_v4_schedule_valid'
]) {
  assert.ok(nodes.has(id), `缺少执行计划确定性校验节点:${id}`)
}
assert.match(
  nodes.get('llmAgentflow_schedule_intent')?.data?.inputs?.llmMessages?.[1]?.content || '',
  /humanInputAgentflow_run\.output\.conditions\.0\.feedback/
)
assert.equal(
  JSON.stringify(nodes.get('llmAgentflow_schedule_intent')?.data?.inputs || {})
    .includes('$flow.state.interactionFeedback'),
  false,
  '执行计划LLM仍读取未可靠投影的旧Flow State反馈'
)
assert.match(
  nodes.get('customFunctionAgentflow_i10_v4_schedule_normalize')
    ?.data?.inputs?.customFunctionJavascriptFunction || '',
  /I10_CRON_INVALID/
)

// DeepSeek兼容OpenAI JSON object模式时，渲染后的提示中必须保留字面量JSON。
// 变量名中的Json不算，因为Flowise渲染后变量名本身会消失。
for (const item of flow.nodes.filter(node =>
  Array.isArray(node.data?.inputs?.llmStructuredOutput) &&
  node.data.inputs.llmStructuredOutput.length > 0
)) {
  const promptWithoutTemplates = JSON.stringify(item.data.inputs.llmMessages || [])
    .replace(/\{\{.*?\}\}/gs, '')
  assert.match(promptWithoutTemplates, /json/i, `${item.id}的结构化输出提示缺少字面量JSON`)
}

// Flowise does not reliably expose an entire structured-output wrapper as a
// later custom-function input. Every CaseDraft normalizer must consume the
// persisted structured fields individually; otherwise arrays silently vanish
// before journey_input_submit.
for (const id of [
  'customFunctionAgentflow_i10_v3_normalize',
  'customFunctionAgentflow_i10_v4_case_correction_normalize',
  'customFunctionAgentflow_i10_v4_credential_resume_normalize'
]) {
  const inputVariables = nodes.get(id)?.data?.inputs?.customFunctionInputVariables || []
  const variableNames = inputVariables.map(item => item.variableName)
  for (const field of [
    'caseTitle', 'actions', 'expectedOutcomes', 'assertions', 'multimodalContext',
    'semanticVerdict', 'unresolvedRequirements'
  ]) {
    assert.ok(variableNames.includes(field), `${id}缺少结构化字段绑定:${field}`)
  }
  assert.ok(variableNames.includes('priorDraft'), `${id}缺少上一版草案字段级合并输入`)
  assert.equal(variableNames.includes('rawDraft'), false, `${id}仍使用不可靠的结构化输出包装对象`)
  const functionSource = String(nodes.get(id)?.data?.inputs?.customFunctionJavascriptFunction || '')
  assert.match(functionSource, /const rawDraft=\{/, `${id}没有从字段级输入构造本地rawDraft`)
  assert.doesNotMatch(
    functionSource,
    /normalizeFlowiseDraft\(\$rawDraft\b/,
    `${id}仍在调用未声明的$rawDraft`
  )
  const referencedVariables = [
    ...new Set([...functionSource.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(match => match[1]))
  ]
  const undeclaredVariables = referencedVariables.filter(name => !variableNames.includes(name))
  assert.deepEqual(
    undeclaredVariables,
    [],
    `${id}引用未声明的Flowise变量:${undeclaredVariables.join(',')}`
  )
}

const humanInputs = flow.nodes.filter(item => item.data?.name === 'humanInputAgentflow')
assert.ok(humanInputs.length >= 12)
for (const item of humanInputs) {
  const description = String(item.data.inputs.humanInputDescription || '')
  assert.match(description, /\bproceed\b/, `${item.id}未说明proceed`)
  assert.match(description, /\breject\b/, `${item.id}未说明reject`)
}

const feedbackNodes = humanInputs
  .filter(item => item.data.inputs.humanInputEnableFeedback)
  .map(item => item.id)
  .sort()
assert.deepEqual(feedbackNodes, [
  'humanInputAgentflow_i10_v4_case_correction',
  'humanInputAgentflow_i10_v4_image_correction_input',
  'humanInputAgentflow_i10_v4_ingest_batch_input',
  'humanInputAgentflow_i10_v4_ingest_correction',
  'humanInputAgentflow_i10_v4_initial_case_input',
  'humanInputAgentflow_repair_schedule',
  'humanInputAgentflow_run'
])
for (const id of feedbackNodes) {
  const handles = flow.edges.filter(item => item.source === id).map(item => item.sourceHandle)
  assert.ok(handles.some(value => value.endsWith('-output-0')), `${id}缺少可输入节点proceed句柄0`)
  assert.ok(handles.some(value => value.endsWith('-output-1')), `${id}缺少可输入节点reject句柄1`)
}
const ingestCorrectionMessages = nodes
  .get('llmAgentflow_i10_v4_ingest_correction')
  ?.data?.inputs?.llmMessages || []
const ingestCorrectionPrompt = JSON.stringify(ingestCorrectionMessages)
assert.match(ingestCorrectionPrompt, /ingestItemsJson/, '附件修订LLM未接收当前完整草案')
assert.match(ingestCorrectionPrompt, /完整用户可编辑字段/, '附件修订LLM可能只返回字段补丁')
assert.match(ingestCorrectionPrompt, /source、credentialRef、策略、Hash和状态由确定性节点保留/, '附件修订LLM可能越权改写系统字段')
const ingestCorrectionNormalize = nodes.get('customFunctionAgentflow_i10_v4_ingest_correction_normalize')
assert.ok(ingestCorrectionNormalize, '缺少附件修订确定性合同规范化节点')
const ingestCorrectionStateUpdates = nodes
  .get('llmAgentflow_i10_v4_ingest_correction')
  ?.data?.inputs?.llmUpdateState || []
assert.deepEqual(
  ingestCorrectionStateUpdates.map(item => item.key),
  [
    'ingestCorrectionRequired', 'ingestCorrectionTitle', 'ingestCorrectionObjective',
    'ingestCorrectionSummary', 'ingestCorrectionTargetSystem', 'ingestCorrectionEntryUrl',
    'ingestCorrectionPreconditions', 'ingestCorrectionActions',
    'ingestCorrectionExpectedOutcomes', 'ingestCorrectionAssertions',
    'ingestCorrectionReason'
  ],
  '附件修订LLM未先把结构化字段持久化到Flow state'
)
assert.equal(
  ingestCorrectionNormalize.data.inputs.customFunctionInputVariables
    ?.find(item => item.variableName === 'actions')?.variableValue,
  '{{$flow.state.ingestCorrectionActions}}',
  '附件修订规范化节点仍直接读取不稳定的LLM输出'
)
assert.match(
  ingestCorrectionNormalize.data.inputs.customFunctionJavascriptFunction,
  /JSON\.stringify\(\{ corrections:/,
  '附件修订规范化节点未由扁平字段确定性构造MCP合同'
)
assert.doesNotMatch(
  ingestCorrectionNormalize.data.inputs.customFunctionJavascriptFunction,
  /String\(\$correctionRequired\).*I10_INGEST_CORRECTIONS_REQUIRED/s,
  '附件修订规范化节点仍让模型布尔值凌驾于确定性完整性校验'
)
assert.doesNotMatch(
  ingestCorrectionNormalize.data.inputs.customFunctionJavascriptFunction,
  /new URL\(/,
  '附件修订规范化节点使用了Flowise CustomFunction沙箱不可用的URL全局'
)
const ingestCorrectArgs = nodes.get('toolAgentflow_i10_v4_ingest_correct')?.data?.inputs?.toolInputArgs || []
assert.equal(
  ingestCorrectArgs.find(item => item.inputArgName === 'correctionsJson')?.inputArgValue,
  '{{$flow.state.ingestCorrectionNormalizedJson}}',
  '附件修订MCP仍直接绑定不稳定的LLM字段'
)
assert.deepEqual(
  ingestCorrectionNormalize.data.inputs.customFunctionUpdateState?.map(item => item.key),
  ['ingestCorrectionNormalizeValid', 'ingestCorrectionNormalizedJson'],
  '附件修订确定性输出未先持久化到Flow state'
)
assert.match(ingestCorrectionPrompt, /entryUrl/, '附件修订LLM未锁定权威入口字段名')
assert.match(
  classificationMergeSource,
  /isVideoFilename[\s\S]*effectiveInputType = 'VIDEO'/,
  '受控MP4附件仍可能被模型误分到自然语言路径'
)
assert.match(
  classificationMergeSource,
  /isCaseFileFilename[\s\S]*effectiveInputType = 'CASE_FILE'/,
  '受控案例文件仍可能被模型误分到自然语言路径'
)
for (const id of [
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_case_reconfirm',
  'humanInputAgentflow_i10_v4_confirm_on_demand',
  'humanInputAgentflow_i10_v4_confirm_one_time',
  'humanInputAgentflow_i10_v4_confirm_recurring',
  'humanInputAgentflow_i10_v4_confirm_repair_one_time',
  'humanInputAgentflow_i10_v4_confirm_repair_recurring'
]) {
  assert.equal(nodes.get(id)?.data?.inputs?.humanInputEnableFeedback, false, id)
}

const allActions = flow.nodes
  .filter(item => item.data?.name === 'toolAgentflow')
  .flatMap(item => item.data.inputs.toolAgentflowSelectedToolConfig?.mcpActions || [])
assert.ok(allActions.includes('journey_input_submit'))
assert.ok(allActions.includes('journey_decision_submit'))

const exactDecisionArgs = nodes.get('toolAgentflow_i10_v3_approve').data.inputs.toolInputArgs
const exactDecisionNames = exactDecisionArgs.map(item => item.inputArgName)
assert.ok(exactDecisionNames.includes('proposalId'))
assert.ok(exactDecisionNames.includes('payloadHash'))
assert.equal(
  exactDecisionArgs.find(item => item.inputArgName === 'decision').inputArgValue,
  '{{$flow.state.journeyProceedDecision}}'
)

const prepareArgs = nodes.get('toolAgentflow_i10_v3_prepare').data.inputs.toolInputArgs
assert.equal(
  prepareArgs.find(item => item.inputArgName === 'interactionContractVersion')?.inputArgValue,
  'v5'
)

// 文字采集节点的proceed不得直接连接会改变业务状态的MCP。
const mutationTools = new Set([
  'case_prepare', 'run_submit', 'schedule_create', 'schedule_disable',
  'candidate_activate', 'repair_candidate_activate', 'ingest_decision_submit',
  'journey_decision_submit'
])
for (const id of feedbackNodes) {
  const outgoing = flow.edges.filter(item => item.source === id && /(?:proceed|output-0)$/.test(item.sourceHandle))
  for (const item of outgoing) {
    const target = nodes.get(item.target)
    const actions = target?.data?.inputs?.toolAgentflowSelectedToolConfig?.mcpActions || []
    assert.equal(actions.some(action => mutationTools.has(action)), false, `${id}直接变更业务状态`)
  }
}

// 运行和调度MCP前必须有只读的最终Human Input确认。
for (const id of [
  'toolAgentflow_run',
  'toolAgentflow_schedule',
  'toolAgentflow_schedule_recurring',
  'toolAgentflow_repair_schedule',
  'toolAgentflow_repair_schedule_recurring'
]) {
  const incoming = predecessors.get(id) || []
  assert.ok(
    incoming.some(source => nodes.get(source)?.data?.name === 'humanInputAgentflow' &&
      nodes.get(source).data.inputs.humanInputEnableFeedback === false),
    `${id}缺少最终精确确认`
  )
}

// Structured Flowise LLM output must be projected through Flow State before
// deterministic schedule validation; direct cross-node output references are
// not reliable in the bundled runtime.
const scheduleLlm = nodes.get('llmAgentflow_schedule_intent')
const scheduleNormalize = nodes.get('customFunctionAgentflow_i10_v4_schedule_normalize')
assert.match(
  JSON.stringify(scheduleLlm.data.inputs.llmMessages),
  /\{\{humanInputAgentflow_run\.output\.conditions\.0\.feedback\}\}/
)
assert.doesNotMatch(
  JSON.stringify(scheduleLlm.data.inputs.llmMessages),
  /\$flow\.state\.interactionFeedback/
)
const scheduleStateKeys = new Set(
  (scheduleLlm.data.inputs.llmUpdateState || []).map(item => item.key)
)
for (const key of [
  'controllerScheduleType', 'controllerScheduleRunAt',
  'controllerScheduleCronExpression', 'controllerScheduleTimezone',
  'controllerScheduleMisfirePolicy', 'controllerScheduleMisfireGraceSeconds',
  'controllerScheduleMaxRetries'
]) assert.ok(scheduleStateKeys.has(key), `执行计划结构化字段未投影：${key}`)
for (const input of scheduleNormalize.data.inputs.customFunctionInputVariables || []) {
  assert.match(input.variableValue, /^\{\{\$flow\.state\.controllerSchedule/)
  assert.doesNotMatch(input.variableValue, /llmAgentflow_schedule_intent\.output/)
}
assert.match(scheduleNormalize.data.inputs.customFunctionJavascriptFunction, /replace\(\/\\s\+\/g/)

assert.equal(nodes.has('humanInputAgentflow_repair'), false, '重复修复确认仍存在')
assert.ok(nodes.has('humanInputAgentflow_repair_confirm'), '唯一修复候选确认缺失')

const llmNodes = flow.nodes.filter(item => item.data?.name === 'llmAgentflow')
assert.equal(llmNodes.length, 15, 'v5应移除凭据回流后的重复案例结构化LLM')
for (const item of llmNodes) {
  const maxTokens = Number(item.data?.inputs?.llmModelConfig?.maxTokens || 0)
  assert.ok([512, 1024, 2048].includes(maxTokens), `LLM输出预算未分级:${item.id}:${maxTokens}`)
  assert.equal(item.data?.inputs?.llmEnableMemory, false, `LLM不得启用历史记忆:${item.id}`)
  assert.equal(item.data?.inputs?.llmModelConfig?.streaming, false, `结构化链路不得启用流式输出:${item.id}`)
  if (item.id !== 'llmAgentflow_i10_v3_classify') {
    assert.equal(JSON.stringify(item.data.inputs).includes('{{question}}'), false, `非分类LLM读取了全局question:${item.id}`)
  }
}
assert.equal(
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v3_route_resume' &&
    item.sourceHandle.endsWith('-output-1') && item.target === 'conditionAgentflow_i10_v3_credential_session_empty') &&
  flow.edges.some(item => item.source === 'conditionAgentflow_i10_v3_credential_session_empty' &&
    item.sourceHandle.endsWith('-output-0') && item.target === 'customFunctionAgentflow_i10_v4_image_route'),
  true,
  '新请求没有先形成CaseDraft而是提前进入凭据链路'
)

assert.equal(manifest.primaryFlowDataPath, 'flowise/i10/agentflow-v5.json')
assert.equal(manifest.primaryFlowVersion, 5)
assert.equal(manifest.mcpToolCount, 33)
assert.equal(manifest.rollbackFlowDataPath, 'flowise/i10/agentflow-v4.json')
assert.equal(
  manifest.rollbackFlowSha256,
  crypto.createHash('sha256').update(fs.readFileSync(rollbackPath)).digest('hex')
)
assert.equal(
  manifest.primaryFlowSha256,
  crypto.createHash('sha256').update(fs.readFileSync(flowPath)).digest('hex')
)

process.stdout.write('HENGZHUN_I10_AGENTFLOW_V5_OK\n')
