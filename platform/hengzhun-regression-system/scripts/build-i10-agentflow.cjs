#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'flowise/i8/agentflow-v2.json')
const targetPath = path.join(root, 'flowise/i10/agentflow-v2.json')
const flow = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

const clone = (id, newId, label, x, y) => {
  const node = structuredClone(flow.nodes.find(item => item.id === id))
  if (!node) throw new Error(`I10_NODE_PROTOTYPE_MISSING:${id}`)
  node.id = newId; node.position = { x, y }; node.data.id = newId; node.data.label = label
  return node
}
const edge = (id, source, output, target) => ({ id, source, sourceHandle: `${source}-output-${output}`, target, targetHandle: target })
const stateValue = key => `{{$flow.state.${key}}}`
const updateFromOutput = (key, outputPath = key) => ({ key, value: `{{ output.${outputPath} }}` })

flow.description = '衡准 I10 正式版：三类输入、安全凭据引用、统一CaseDraft、真实Midscene作者化、纯Playwright四次验证、完整源码交付及即时/定时/周期回归。'
flow.i10Contract = {
  schemaVersion: 'hengzhun-i10-agentflow-v1',
  controller: { apiKeyVariable: 'CONTROL_API_KEY', baseUrlVariable: 'CONTROL_BASE_URL', modelVariable: 'CONTROL_MODEL_NAME', contextTokens: 1000000, maxOutputTokens: 8192 },
  visual: { apiKeyVariable: 'VISION_API_KEY', baseUrlVariable: 'VISION_BASE_URL', modelVariable: 'VISION_MODEL_NAME', contextTokens: 16000, maxInputTokens: 12000, maxOutputTokens: 4000 },
  externalTools: 'MCP_ONLY', toolCount: 23, inputTypes: ['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO'], supportingImagesPerInput: { minimum: 0, maximum: 20 },
  naturalLanguageIntents: ['CASE_AUTHORING', 'RESULT_QUERY', 'SCHEDULE_DISABLE'], schedules: ['ON_DEMAND', 'ONE_TIME', 'RECURRING']
}

const start = flow.nodes.find(item => item.id === 'startAgentflow_i8')
start.data.inputs.startPersistState = false
start.data.inputs.startState = [
  'requestIntent', 'inputType', 'naturalLanguage', 'flowiseFileRef', 'originalFilename', 'credentialRef',
  'supportingImages', 'imageIngestId', 'imageFactsJson', 'ingestJobId', 'ingestJobVersion', 'caseDraftJson', 'acceptanceSummaryJson', 'preparationId',
  'preparationVersion', 'caseId', 'caseVersion', 'taskId', 'scheduleId'
].map(key => ({ key, value: '' }))
start.data.inputs.startState.find(item=>item.key==='imageIngestId').value='NONE'
start.data.inputs.startState.find(item=>item.key==='imageFactsJson').value='[]'

for (const node of flow.nodes.filter(item => item.data?.name === 'llmAgentflow')) {
  node.data.inputs.llmModelConfig = { ...node.data.inputs.llmModelConfig, modelName: '${CONTROL_MODEL_NAME}', basepath: '${CONTROL_BASE_URL}', maxTokens: 8192, streaming: false, strictToolCalling: false }
}

const candidateReady = flow.nodes.find(item => item.id === 'toolAgentflow_candidate_ready')
const candidateWaitTimeout = candidateReady?.data?.inputs?.toolInputArgs?.find(item => item.inputArgName === 'waitTimeoutSeconds')
if (!candidateWaitTimeout) throw new Error('I10_CANDIDATE_WAIT_TIMEOUT_ARGUMENT_MISSING')
candidateReady.data.inputs.toolInputArgs.find(item => item.inputArgName === 'waitForCertificate').inputArgValue = false
candidateWaitTimeout.inputArgValue = 45
const candidateReadyCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_candidate_ready', '候选是否完成四次签证', 7820, -220)
candidateReadyCondition.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_candidate_ready}}', operation: 'contains', value2: 'HUMAN_DELIVERY_DECISION_REQUIRED' }]
candidateReadyCondition.data.outputAnchors = [{ label: '已持证', name: '0' }, { label: '继续等待', name: '1' }]
const candidateAuthoringFailed = clone('conditionAgentflow_terminal', 'conditionAgentflow_candidate_authoring_failed', '作者化是否失败关闭', 8160, 20)
candidateAuthoringFailed.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_candidate_ready}}', operation: 'contains', value2: 'AUTHORING_REVIEW_REQUIRED' }]
candidateAuthoringFailed.data.outputAnchors = [{ label: '作者化失败', name: '0' }, { label: '继续判断', name: '1' }]
const candidateValidationFailed = clone('conditionAgentflow_terminal', 'conditionAgentflow_candidate_validation_failed', '候选验证是否失败关闭', 8500, 80)
candidateValidationFailed.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_candidate_ready}}', operation: 'contains', value2: 'CANDIDATE_REPAIR_REQUIRED' }]
candidateValidationFailed.data.outputAnchors = [{ label: '验证失败', name: '0' }, { label: '仍在处理', name: '1' }]
const candidateFailedReply = clone('directReplyAgentflow_rejected', 'directReplyAgentflow_candidate_failed', '返回作者化或验证失败', 8840, -20)
candidateFailedReply.data.inputs.directReplyMessage = '候选脚本未通过真实作者化或纯Playwright验证，系统已失败关闭，未签发证书、未激活脚本。权威状态：{{toolAgentflow_candidate_ready}}'

const repairReady = flow.nodes.find(item => item.id === 'toolAgentflow_repair_ready')
repairReady.data.label = 'MCP查询修复复验状态'
repairReady.data.inputs.toolInputArgs.find(item => item.inputArgName === 'waitForProposal').inputArgValue = false
repairReady.data.inputs.toolInputArgs = repairReady.data.inputs.toolInputArgs.filter(item => item.inputArgName !== 'waitTimeoutSeconds')
const repairReadyCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_repair_ready', '修复候选是否完成四次签证', 9520, 620)
repairReadyCondition.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_repair_ready}}', operation: 'contains', value2: 'WAITING_USER' }]
repairReadyCondition.data.outputAnchors = [{ label: '已持证', name: '0' }, { label: '继续判断', name: '1' }]
const repairValidationFailed = clone('conditionAgentflow_terminal', 'conditionAgentflow_repair_validation_failed', '修复候选是否验证失败', 9860, 720)
repairValidationFailed.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_repair_ready}}', operation: 'contains', value2: 'VALIDATION_FAILED' }]
repairValidationFailed.data.outputAnchors = [{ label: '验证失败', name: '0' }, { label: '仍在处理', name: '1' }]
const repairValidationFailedReply = clone('directReplyAgentflow_rejected', 'directReplyAgentflow_repair_validation_failed', '返回修复验证失败', 10200, 760)
repairValidationFailedReply.data.inputs.directReplyMessage = '修复候选未通过纯Playwright或四次稳定性验证，系统已失败关闭，未激活、未复跑、未迁移调度。权威状态：{{toolAgentflow_repair_ready}}'
const repairWait = flow.nodes.find(item => item.id === 'humanInputAgentflow_repair_wait')
repairWait.data.label = '等待修复候选四次复验'
repairWait.data.inputs.humanInputDescription = '修复候选仍在本机纯Playwright四次复验中。当前脱敏状态：{{toolAgentflow_repair_ready}}。请稍候后批准继续查询；拒绝将停止续办且不会激活任何修复。'

const classifier = clone('llmAgentflow_structure', 'llmAgentflow_i10_input', '识别三类输入与信息缺口', 340, -220)
classifier.data.inputs.llmMessages = [
  { role: 'system', content: '你是衡准输入分类器。先识别CASE_AUTHORING、RESULT_QUERY或SCHEDULE_DISABLE。凡是描述测试步骤、预期结果并要求创建、执行或验证新案例，必须判为CASE_AUTHORING；只有用户明确要求查询既有任务、调度或结果收件箱且给出对应ID时才判为RESULT_QUERY；只有明确要求停用且给出scheduleId时才判为SCHEDULE_DISABLE。案例创建再严格分类NATURAL_LANGUAGE、CASE_FILE或VIDEO；三类主输入都可附0到20张补充图片，必须把主文件与补充图片分开。附件字段只能逐字复制运行时提供的FLOWISE_CONTROLLED_ATTACHMENTS元数据；没有该元数据时不得猜测。分类阶段imageIngestId必须固定输出NONE，imageFactsJson必须固定输出[]。禁止读取本地路径、SQLite、凭据明文。' },
  { role: 'user', content: '输入：{{question}}' }
]
classifier.data.inputs.llmStructuredOutput = [
  { key: 'requestIntent', type: 'string', description: 'CASE_AUTHORING、RESULT_QUERY或SCHEDULE_DISABLE' },
  { key: 'inputType', type: 'string', description: 'NATURAL_LANGUAGE、CASE_FILE或VIDEO' },
  { key: 'naturalLanguage', type: 'string', description: '自然语言案例描述' },
  { key: 'flowiseFileRef', type: 'string', description: 'Flowise受控附件标识' },
  { key: 'originalFilename', type: 'string', description: '原始文件名' },
  { key: 'hasSupportingImages', type: 'boolean', description: '是否存在除主输入外的补充图片附件' },
  { key: 'supportingImages', type: 'jsonArray', description: '0到20个补充图片受控元数据对象，仅含flowiseFileRef、originalFilename和purposeHint' },
  { key: 'imageIngestId', type: 'string', description: '分类阶段固定输出NONE，后续由Harness图片任务覆盖' },
  { key: 'imageFactsJson', type: 'string', description: '分类阶段固定输出[]，后续由Harness图片事实覆盖' },
  { key: 'credentialRef', type: 'string', description: '已有本机凭据引用；没有则为空' },
  { key: 'credentialMissing', type: 'boolean', description: '是否需要本机录入账号密码' },
  { key: 'informationGap', type: 'string', description: '除凭据外的信息缺口' },
  { key: 'scheduleId', type: 'string', description: '停用调度时用户明确提供的scheduleId，否则为空' }
]
classifier.data.inputs.llmUpdateState = [
  updateFromOutput('requestIntent'), updateFromOutput('inputType'), updateFromOutput('naturalLanguage'),
  updateFromOutput('flowiseFileRef'), updateFromOutput('originalFilename'), updateFromOutput('supportingImages'), updateFromOutput('imageIngestId'), updateFromOutput('imageFactsJson'),
  updateFromOutput('credentialRef'), updateFromOutput('scheduleId')
]

const caseIntentCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_case_intent', '是否创建回归案例', 680, -220)
caseIntentCondition.data.inputs.conditions = [{ type: 'string', value1: stateValue('requestIntent'), operation: 'equal', value2: 'CASE_AUTHORING' }]
caseIntentCondition.data.outputAnchors = [{ label: '创建案例', name: '0' }, { label: '管理意图', name: '1' }]
const resultIntentCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_result_intent', '是否查询回归结果', 1020, -20)
resultIntentCondition.data.inputs.conditions = [{ type: 'string', value1: stateValue('requestIntent'), operation: 'equal', value2: 'RESULT_QUERY' }]
resultIntentCondition.data.outputAnchors = [{ label: '查询结果', name: '0' }, { label: '停用调度', name: '1' }]
const managementInbox = clone('toolAgentflow_get', 'toolAgentflow_management_inbox', 'MCP查询历史回归结果', 1360, 40)
managementInbox.data.inputs.toolInputArgs = [
  { inputArgName: 'limit', inputArgValue: 10 }, { inputArgName: 'unreadOnly', inputArgValue: false },
  { inputArgName: 'acknowledgeInboxIds', inputArgValue: [] }
]
managementInbox.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['result_inbox_list']
const managementReply = clone('directReplyAgentflow_result', 'directReplyAgentflow_management_results', '返回历史回归结果', 1700, 40)
managementReply.data.inputs.directReplyMessage = '以下是Harness SQLite中的正式回归结果收件箱，仅含脱敏摘要和制品元数据：{{toolAgentflow_management_inbox}}'
const disableConfirm = clone('humanInputAgentflow_confirm', 'humanInputAgentflow_schedule_disable', '确认停用指定调度', 1360, -100)
disableConfirm.data.inputs.humanInputDescription = '将停用调度{{$flow.state.scheduleId}}。这不会删除历史结果或脚本。请明确批准；拒绝则保持调度不变。'
const disableTool = clone('toolAgentflow_get', 'toolAgentflow_schedule_disable', 'MCP停用指定调度', 1700, -100)
disableTool.data.inputs.toolInputArgs = [
  { inputArgName: 'scheduleId', inputArgValue: stateValue('scheduleId') }, { inputArgName: 'action', inputArgValue: 'DISABLE' },
  { inputArgName: 'reason', inputArgValue: '用户在Flowise中明确确认停用调度' }, { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-schedule-disable' }
]
disableTool.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['schedule_get']
const disableReply = clone('directReplyAgentflow_result', 'directReplyAgentflow_schedule_disabled', '返回调度停用结果', 2040, -100)
disableReply.data.inputs.directReplyMessage = '调度停用决定已由Harness记录：{{toolAgentflow_schedule_disable}}'
const disableCancelled = clone('directReplyAgentflow_rejected', 'directReplyAgentflow_schedule_disable_cancelled', '取消停用调度', 1700, -220)
disableCancelled.data.inputs.directReplyMessage = '用户未批准停用；调度状态保持不变。'

const credentialCondition = clone('conditionAgentflow_clarify', 'conditionAgentflow_credential', '是否需要本机安全凭据', 680, -220)
credentialCondition.data.inputs.conditions = [{ type: 'boolean', value1: '{{llmAgentflow_i10_input.output.credentialMissing}}', operation: 'equal', value2: true }]
credentialCondition.data.outputAnchors = [{ label: '需要录入', name: '0' }, { label: '已有引用', name: '1' }]
const credentialCreate = clone('toolAgentflow_prepare', 'toolAgentflow_credential_create', 'MCP创建安全凭据会话', 1020, -380)
credentialCreate.data.inputs.toolInputArgs = [{ inputArgName: 'label', inputArgValue: '复兴银行门户测试账户' }, { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-credential' }]
credentialCreate.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['credential_session_create']
const credentialHuman = clone('humanInputAgentflow_confirm', 'humanInputAgentflow_credential', '在本机表单录入凭据', 1360, -380)
credentialHuman.data.inputs.humanInputDescription = '请打开以下本机地址录入账号密码。完成后再批准继续；账号密码不会进入Flowise或模型上下文：{{toolAgentflow_credential_create}}'
const credentialGet = clone('toolAgentflow_get', 'toolAgentflow_credential_get', 'MCP读取凭据引用状态', 1700, -380)
credentialGet.data.inputs.toolInputArgs = [{ inputArgName: 'sessionId', inputArgValue: '{{toolAgentflow_credential_create.sessionId}}' }]
credentialGet.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['credential_session_get']
credentialGet.data.inputs.toolUpdateState = [updateFromOutput('credentialRef')]
const inputReady = clone('llmAgentflow_intent', 'llmAgentflow_i10_ready', '合并输入与credentialRef', 2040, -220)
inputReady.data.inputs.llmMessages = [{ role: 'system', content: '只校验Flow State中已受控的统一输入，不得生成或猜测账号密码，不得改变附件引用。credentialRef为空时必须失败关闭。' }, { role: 'user', content: 'inputType={{$flow.state.inputType}}；naturalLanguage={{$flow.state.naturalLanguage}}；flowiseFileRef={{$flow.state.flowiseFileRef}}；originalFilename={{$flow.state.originalFilename}}；credentialRef={{$flow.state.credentialRef}}' }]
inputReady.data.inputs.llmStructuredOutput = classifier.data.inputs.llmStructuredOutput.filter(item => !['credentialMissing', 'requestIntent', 'scheduleId'].includes(item.key))
const supportingImageCondition=clone('conditionAgentflow_terminal','conditionAgentflow_supporting_images','是否有补充案例图片',2240,-360)
supportingImageCondition.data.inputs.conditions=[{type:'boolean',value1:'{{llmAgentflow_i10_input.output.hasSupportingImages}}',operation:'equal',value2:true}]
supportingImageCondition.data.outputAnchors=[{label:'有补充图片',name:'0'},{label:'没有补充图片',name:'1'}]
const imageSubmit=clone('toolAgentflow_prepare','toolAgentflow_image_ingest_submit','MCP提交补充图片OCR分析',2480,-480)
imageSubmit.data.inputs.toolInputArgs=[{inputArgName:'sourceRef',inputArgValue:'{{$flow.sessionId}}'},{inputArgName:'primaryInputType',inputArgValue:stateValue('inputType')},{inputArgName:'images',inputArgValue:stateValue('supportingImages')},{inputArgName:'primaryText',inputArgValue:stateValue('naturalLanguage')},{inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}-images'}]
imageSubmit.data.inputs.toolAgentflowSelectedToolConfig.mcpActions=['image_ingest_submit'];imageSubmit.data.inputs.toolUpdateState=[updateFromOutput('imageIngestId')]
const imageWait=clone('humanInputAgentflow_generation','humanInputAgentflow_image_wait','等待本机中英文OCR与事实筛选',2720,-480)
imageWait.data.inputs.humanInputDescription='补充图片正在本机执行中英文OCR、敏感信息脱敏和主控模型事实筛选。批准后查询结果；系统不会把原始未脱敏图片、密码、验证码或PIN发送给模型。'
const imageGet=clone('toolAgentflow_candidate_ready','toolAgentflow_image_ingest_get','MCP查询图片事实候选',2960,-480)
imageGet.data.inputs.toolInputArgs=[{inputArgName:'imageIngestId',inputArgValue:stateValue('imageIngestId')}];imageGet.data.inputs.toolAgentflowSelectedToolConfig.mcpActions=['image_ingest_get'];imageGet.data.inputs.toolUpdateState=[updateFromOutput('imageFactsJson','facts')]
const imageReady=clone('conditionAgentflow_terminal','conditionAgentflow_image_ready','图片事实是否可人工确认',3200,-480)
imageReady.data.inputs.conditions=[{type:'string',value1:'{{toolAgentflow_image_ingest_get}}',operation:'contains',value2:'WAITING_USER'}];imageReady.data.outputAnchors=[{label:'可确认',name:'0'},{label:'失败或处理中',name:'1'}]
const imageConfirm=clone('humanInputAgentflow_confirm','humanInputAgentflow_image_confirm','确认图片事实与填空内容',3440,-480)
imageConfirm.data.inputs.humanInputDescription='请确认主控模型从补充图片中选择的案例事实、文本框填充值、来源与置信度。未知值不得猜测；验证码、U盾PIN等只能由您在运行时直接输入：{{toolAgentflow_image_ingest_get}}'
const imageFailed=clone('directReplyAgentflow_rejected','directReplyAgentflow_image_failed','返回图片分析未就绪',3440,-620)
imageFailed.data.inputs.directReplyMessage='补充图片尚未形成可确认事实或已失败关闭，未继续作者化：{{toolAgentflow_image_ingest_get}}'
const naturalCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_natural', '是否自然语言输入', 2380, -220)
naturalCondition.data.inputs.conditions = [{ type: 'string', value1: stateValue('inputType'), operation: 'equal', value2: 'NATURAL_LANGUAGE' }]
naturalCondition.data.outputAnchors = [{ label: '自然语言', name: '0' }, { label: '附件', name: '1' }]
const videoCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_video', '是否视频输入', 2720, -40)
videoCondition.data.inputs.conditions = [{ type: 'string', value1: stateValue('inputType'), operation: 'equal', value2: 'VIDEO' }]
videoCondition.data.outputAnchors = [{ label: '视频', name: '0' }, { label: '案例文件', name: '1' }]

function ingestNode(id, label, type, y) {
  const node = clone('toolAgentflow_prepare', id, label, 3060, y)
  node.data.inputs.toolInputArgs = [
    { inputArgName: 'inputType', inputArgValue: type }, { inputArgName: 'flowiseFileRef', inputArgValue: stateValue('flowiseFileRef') },
    { inputArgName: 'originalFilename', inputArgValue: stateValue('originalFilename') }, { inputArgName: 'credentialRef', inputArgValue: stateValue('credentialRef') },
    { inputArgName: 'supportingImageIngestId', inputArgValue: stateValue('imageIngestId') },
    { inputArgName: 'sessionRef', inputArgValue: `{{$flow.sessionId}}-${type.toLowerCase()}` }
  ]
  node.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['ingest_submit']
  node.data.inputs.toolUpdateState = [updateFromOutput('ingestJobId')]
  return node
}
const ingestVideo = ingestNode('toolAgentflow_ingest_video', 'MCP提交视频导入', 'VIDEO', -140)
const ingestFile = ingestNode('toolAgentflow_ingest_file', 'MCP提交案例文件', 'CASE_FILE', 80)
const ingestWait = clone('humanInputAgentflow_generation', 'humanInputAgentflow_ingest_wait', '等待导入处理并检查缺口', 3400, -40)
ingestWait.data.inputs.humanInputDescription = '附件已进入受控导入。视频需等待本机抽帧、OCR与真实视觉分析；批准后查询状态。任何低置信度或信息缺口都必须人工校正。'
const ingestGet = clone('toolAgentflow_candidate_ready', 'toolAgentflow_ingest_get', 'MCP查询统一CaseDraft', 3740, -40)
ingestGet.data.inputs.toolInputArgs = [{ inputArgName: 'ingestJobId', inputArgValue: stateValue('ingestJobId') }]
ingestGet.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['ingest_get']
ingestGet.data.inputs.toolUpdateState = [updateFromOutput('ingestJobVersion', 'version'), updateFromOutput('caseDraftJson', 'items.0.draft')]
const ingestReadyCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_ingest_ready', '导入是否等待人工确认', 4080, -80)
ingestReadyCondition.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_ingest_get}}', operation: 'contains', value2: 'WAITING_USER' }]
ingestReadyCondition.data.outputAnchors = [{ label: '可确认', name: '0' }, { label: '检查处理中', name: '1' }]
const ingestProcessingCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_ingest_processing', '导入是否仍在处理', 4420, 60)
ingestProcessingCondition.data.inputs.conditions = [{ type: 'string', value1: '{{toolAgentflow_ingest_get}}', operation: 'contains', value2: 'PROCESSING' }]
ingestProcessingCondition.data.outputAnchors = [{ label: '继续等待', name: '0' }, { label: '失败终态', name: '1' }]
const ingestFailedReply = clone('directReplyAgentflow_rejected', 'directReplyAgentflow_ingest_failed', '返回导入失败', 4760, 200)
ingestFailedReply.data.inputs.directReplyMessage = '附件导入未形成可确认的统一CaseDraft，系统已失败关闭。权威状态：{{toolAgentflow_ingest_get}}'
const ingestConfirm = clone('humanInputAgentflow_confirm', 'humanInputAgentflow_ingest_confirm', '确认或校正导入草案', 4760, -80)
ingestConfirm.data.inputs.humanInputDescription = '请逐项检查导入草案、置信度和missingFields。信息完整时直接批准；需要修改时在反馈中提供严格JSON corrections数组后批准；取消导入请选择拒绝：{{toolAgentflow_ingest_get}}'
const ingestDecisionParser = clone('llmAgentflow_intent', 'llmAgentflow_ingest_decision', '解析人工确认或校正', 4420, -40)
ingestDecisionParser.data.inputs.llmMessages = [
  { role: 'system', content: '只解析用户对导入草案的人工决定。没有修正内容时correctionRequired=false且correctionsJson={"corrections":[]}；提供修正时correctionRequired=true，并把每项修正原样规范为{"corrections":[{"ordinal":正整数,"draft":完整CaseDraft}]}。禁止补造CaseDraft、凭据、路径或技术字段。' },
  { role: 'user', content: '待确认草案：{{toolAgentflow_ingest_get}}\n用户本轮确认或校正：{{question}}' }
]
ingestDecisionParser.data.inputs.llmStructuredOutput = [
  { key: 'correctionRequired', type: 'boolean', description: '用户是否明确提交了修正' },
  { key: 'correctionsJson', type: 'string', description: '严格JSON对象，唯一字段为corrections数组' },
  { key: 'reason', type: 'string', description: '不含凭据的人工确认或修正理由' }
]
const ingestCorrectionCondition = clone('conditionAgentflow_clarify', 'conditionAgentflow_ingest_correction', '是否提交案例修正', 4760, -40)
ingestCorrectionCondition.data.inputs.conditions = [{ type: 'boolean', value1: '{{llmAgentflow_ingest_decision.output.correctionRequired}}', operation: 'equal', value2: true }]
ingestCorrectionCondition.data.outputAnchors = [{ label: '提交修正', name: '0' }, { label: '确认无修正', name: '1' }]
const ingestCorrect = clone('toolAgentflow_submit', 'toolAgentflow_ingest_correct', 'MCP提交CaseDraft修正', 5100, -180)
ingestCorrect.data.inputs.toolInputArgs = [
  { inputArgName: 'ingestJobId', inputArgValue: stateValue('ingestJobId') }, { inputArgName: 'expectedVersion', inputArgValue: stateValue('ingestJobVersion') },
  { inputArgName: 'choice', inputArgValue: 'CORRECT' }, { inputArgName: 'correctionsJson', inputArgValue: '{{llmAgentflow_ingest_decision.output.correctionsJson}}' },
  { inputArgName: 'reason', inputArgValue: '用户在Flowise中提交导入草案修正' },
  { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}-ingest-correct' }, { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-ingest-correct' }
]
ingestCorrect.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['ingest_decision_submit']
ingestCorrect.data.inputs.toolUpdateState = []
const ingestDecide = clone('toolAgentflow_submit', 'toolAgentflow_ingest_decide', 'MCP确认统一CaseDraft', 5100, 100)
ingestDecide.data.inputs.toolInputArgs = [
  { inputArgName: 'ingestJobId', inputArgValue: stateValue('ingestJobId') }, { inputArgName: 'expectedVersion', inputArgValue: stateValue('ingestJobVersion') },
  { inputArgName: 'choice', inputArgValue: 'CONFIRM' }, { inputArgName: 'reason', inputArgValue: '用户在Flowise中确认统一CaseDraft' },
  { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}-ingest-confirm' }, { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-ingest-decision' }
]
ingestDecide.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['ingest_decision_submit']
ingestDecide.data.inputs.toolUpdateState = [
  updateFromOutput('preparationId', 'cases.0.preparationId'),
  updateFromOutput('preparationVersion', 'cases.0.preparationVersion'),
  updateFromOutput('caseId', 'cases.0.caseId'), updateFromOutput('caseVersion', 'cases.0.version'),
  updateFromOutput('credentialRef', 'cases.0.credentialRef')
]
const ingestReject = clone('toolAgentflow_submit', 'toolAgentflow_ingest_reject', 'MCP拒绝导入草案', 4420, 220)
ingestReject.data.inputs.toolInputArgs = [
  { inputArgName: 'ingestJobId', inputArgValue: stateValue('ingestJobId') }, { inputArgName: 'expectedVersion', inputArgValue: stateValue('ingestJobVersion') },
  { inputArgName: 'choice', inputArgValue: 'REJECT' }, { inputArgName: 'reason', inputArgValue: '用户在Flowise中明确拒绝导入草案' },
  { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}-ingest-reject' }, { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-ingest-reject' }
]
ingestReject.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['ingest_decision_submit']
ingestReject.data.inputs.toolUpdateState = []

const scheduleIntent = clone('llmAgentflow_intent', 'llmAgentflow_schedule_intent', '解析已确认执行方式', 5440, 380)
scheduleIntent.data.inputs.llmMessages = [{ role: 'system', content: '把用户已经确认的执行方式严格解析为ON_DEMAND、ONE_TIME或RECURRING。ONE_TIME必须给带偏移runAt；RECURRING必须给Cron；必须保留用户确认的IANA时区。禁止填充示例日期。若用户文本已经包含ISO 8601时间，runAt必须逐字符复制该ISO时间，尤其不得把Z改成+08:00或在不换算时钟值的情况下改写偏移；任何时区换算都必须保持同一UTC时间点。' }, { role: 'user', content: '用户本轮确认：{{question}}' }]
scheduleIntent.data.inputs.llmStructuredOutput = [
  { key: 'scheduleType', type: 'string', description: 'ON_DEMAND、ONE_TIME或RECURRING' }, { key: 'runAt', type: 'string', description: 'ONE_TIME带偏移ISO时间，否则空' },
  { key: 'cronExpression', type: 'string', description: 'RECURRING Cron，否则空' }, { key: 'timezone', type: 'string', description: 'IANA时区' },
  { key: 'misfirePolicy', type: 'string', description: 'SKIP或RUN_ONCE' }, { key: 'misfireGraceSeconds', type: 'number', description: '错过执行宽限秒数' }, { key: 'maxRetries', type: 'number', description: '0到5' }
]
const scheduleCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_on_demand', '是否立即执行', 5780, 380)
scheduleCondition.data.inputs.conditions = [{ type: 'string', value1: '{{llmAgentflow_schedule_intent.output.scheduleType}}', operation: 'contains', value2: 'ON_DEMAND' }]
scheduleCondition.data.outputAnchors = [{ label: '立即执行', name: '0' }, { label: '定时或周期', name: '1' }]
const positiveSchedule = clone('toolAgentflow_repair_schedule', 'toolAgentflow_schedule', 'MCP创建已确认调度', 6120, 180)
positiveSchedule.data.inputs.toolInputArgs = [
  { inputArgName: 'preparationId', inputArgValue: stateValue('preparationId') }, { inputArgName: 'scheduleType', inputArgValue: '{{llmAgentflow_schedule_intent.output.scheduleType}}' },
  { inputArgName: 'runAt', inputArgValue: '{{llmAgentflow_schedule_intent.output.runAt}}' },
  { inputArgName: 'timezone', inputArgValue: '{{llmAgentflow_schedule_intent.output.timezone}}' }, { inputArgName: 'misfirePolicy', inputArgValue: '{{llmAgentflow_schedule_intent.output.misfirePolicy}}' },
  { inputArgName: 'misfireGraceSeconds', inputArgValue: '{{llmAgentflow_schedule_intent.output.misfireGraceSeconds}}' }, { inputArgName: 'maxRetries', inputArgValue: '{{llmAgentflow_schedule_intent.output.maxRetries}}' },
  { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}-schedule-confirm' }, { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-schedule' }
]
positiveSchedule.data.inputs.toolUpdateState = [updateFromOutput('scheduleId')]
positiveSchedule.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'scheduleType').inputArgValue = 'ONE_TIME'
positiveSchedule.data.label = 'MCP创建已确认单次调度'
const oneTimeCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_one_time', '是否单次定时', 6120, 380)
oneTimeCondition.data.inputs.conditions = [{ type: 'string', value1: '{{llmAgentflow_schedule_intent.output.scheduleType}}', operation: 'contains', value2: 'ONE_TIME' }]
oneTimeCondition.data.outputAnchors = [{ label: '单次定时', name: '0' }, { label: '检查周期', name: '1' }]
const recurringCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_recurring', '是否周期执行', 6460, 480)
recurringCondition.data.inputs.conditions = [{ type: 'string', value1: '{{llmAgentflow_schedule_intent.output.scheduleType}}', operation: 'contains', value2: 'RECURRING' }]
recurringCondition.data.outputAnchors = [{ label: '周期执行', name: '0' }, { label: '无法确定', name: '1' }]
const recurringSchedule = structuredClone(positiveSchedule)
recurringSchedule.id = 'toolAgentflow_schedule_recurring'; recurringSchedule.data.id = recurringSchedule.id
recurringSchedule.data.label = 'MCP创建已确认周期调度'; recurringSchedule.position = { x: 6800, y: 420 }
recurringSchedule.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'scheduleType').inputArgValue = 'RECURRING'
recurringSchedule.data.inputs.toolInputArgs = recurringSchedule.data.inputs.toolInputArgs.filter(arg => arg.inputArgName !== 'runAt')
recurringSchedule.data.inputs.toolInputArgs.splice(2, 0, { inputArgName: 'cronExpression', inputArgValue: '{{llmAgentflow_schedule_intent.output.cronExpression}}' })
const scheduleInvalid = clone('directReplyAgentflow_rejected', 'directReplyAgentflow_schedule_invalid', '执行方式无法确定', 6800, 620)
scheduleInvalid.data.inputs.directReplyMessage = '无法从用户确认中唯一确定ON_DEMAND、ONE_TIME或RECURRING；未创建任务或调度。请重新明确执行方式、时间与时区。'
const positiveScheduleGet = clone('toolAgentflow_get', 'toolAgentflow_schedule_get', 'MCP回读调度状态', 6460, 180)
positiveScheduleGet.data.inputs.toolInputArgs = [{ inputArgName: 'scheduleId', inputArgValue: stateValue('scheduleId') }]
positiveScheduleGet.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['schedule_get']
const scheduledReply = clone('directReplyAgentflow_repair_scheduled', 'directReplyAgentflow_scheduled', '返回调度创建结果', 6460, 180)
scheduledReply.position = { x: 6800, y: 180 }
scheduledReply.data.inputs.directReplyMessage = '已按用户确认的时区和频率创建并回读调度：{{toolAgentflow_schedule_get}}。脚本版本和Hash保持与四次验证证书一致。'

const repairScheduleGet = clone('toolAgentflow_get', 'toolAgentflow_repair_schedule_get', 'MCP回读修复版调度状态', 12600, 500)
repairScheduleGet.data.inputs.toolInputArgs = [{ inputArgName: 'scheduleId', inputArgValue: stateValue('scheduleId') }]
repairScheduleGet.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['schedule_get']
const repairScheduledReply = flow.nodes.find(item => item.id === 'directReplyAgentflow_repair_scheduled')
repairScheduledReply.data.inputs.directReplyMessage = '限域修复候选已完成四次验证、人工激活和纯Playwright复跑，并按用户独立确认创建精确绑定修复版本的调度。复跑：{{toolAgentflow_repair_task}}；调度：{{toolAgentflow_repair_schedule_get}}'
const resultInbox = clone('toolAgentflow_get', 'toolAgentflow_result_inbox', 'MCP读取正式结果收件箱', 9860, -180)
resultInbox.data.inputs.toolInputArgs = [
  { inputArgName: 'limit', inputArgValue: 10 }, { inputArgName: 'unreadOnly', inputArgValue: false },
  { inputArgName: 'acknowledgeInboxIds', inputArgValue: [] }
]
resultInbox.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['result_inbox_list']
const repairResultInbox = clone('toolAgentflow_get', 'toolAgentflow_repair_result_inbox', 'MCP读取修复复跑结果收件箱', 11920, 500)
repairResultInbox.data.inputs.toolInputArgs = [
  { inputArgName: 'limit', inputArgValue: 10 }, { inputArgName: 'unreadOnly', inputArgValue: false },
  { inputArgName: 'acknowledgeInboxIds', inputArgValue: [] }
]
repairResultInbox.data.inputs.toolAgentflowSelectedToolConfig.mcpActions = ['result_inbox_list']

const repairScheduleIntent = clone('llmAgentflow_intent', 'llmAgentflow_repair_schedule_intent', '解析修复版调度选择', 12240, 500)
repairScheduleIntent.data.inputs.llmMessages = [{ role: 'system', content: '只解析用户已确认的ONE_TIME或RECURRING调度；必须输出带偏移runAt或Cron、IANA时区、misfire与重试。禁止示例日期。若用户文本已经包含ISO 8601时间，runAt必须逐字符复制该ISO时间，尤其不得把Z改成+08:00或在不换算时钟值的情况下改写偏移；任何时区换算都必须保持同一UTC时间点。' }, { role: 'user', content: '用户本轮确认：{{question}}' }]
repairScheduleIntent.data.inputs.llmStructuredOutput = scheduleIntent.data.inputs.llmStructuredOutput.filter(item => item.key !== 'scheduleType').concat([{ key: 'scheduleType', type: 'string', description: 'ONE_TIME或RECURRING' }])
const repairSchedule = flow.nodes.find(item => item.id === 'toolAgentflow_repair_schedule')
repairSchedule.data.label = 'MCP创建已确认单次修复版调度'
repairSchedule.data.inputs.toolUpdateState = [updateFromOutput('scheduleId')]
repairSchedule.data.inputs.toolInputArgs = repairSchedule.data.inputs.toolInputArgs
  .filter(arg => arg.inputArgName !== 'cronExpression')
  .map(arg => ['runAt','timezone','misfirePolicy','misfireGraceSeconds','maxRetries'].includes(arg.inputArgName)
    ? { ...arg, inputArgValue: `{{llmAgentflow_repair_schedule_intent.output.${arg.inputArgName}}}` }
    : arg)
repairSchedule.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'scheduleType').inputArgValue = 'ONE_TIME'
const repairOneTimeCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_repair_one_time', '修复版是否单次定时', 12580, 500)
repairOneTimeCondition.data.inputs.conditions = [{ type: 'string', value1: '{{llmAgentflow_repair_schedule_intent.output.scheduleType}}', operation: 'contains', value2: 'ONE_TIME' }]
repairOneTimeCondition.data.outputAnchors = [{ label: '单次定时', name: '0' }, { label: '检查周期', name: '1' }]
const repairRecurringCondition = clone('conditionAgentflow_terminal', 'conditionAgentflow_repair_recurring', '修复版是否周期执行', 12920, 620)
repairRecurringCondition.data.inputs.conditions = [{ type: 'string', value1: '{{llmAgentflow_repair_schedule_intent.output.scheduleType}}', operation: 'contains', value2: 'RECURRING' }]
repairRecurringCondition.data.outputAnchors = [{ label: '周期执行', name: '0' }, { label: '无法确定', name: '1' }]
const repairRecurringSchedule = structuredClone(repairSchedule)
repairRecurringSchedule.id = 'toolAgentflow_repair_schedule_recurring'; repairRecurringSchedule.data.id = repairRecurringSchedule.id
repairRecurringSchedule.data.label = 'MCP创建已确认周期修复版调度'; repairRecurringSchedule.position = { x: 13260, y: 540 }
repairRecurringSchedule.data.inputs.toolInputArgs = repairRecurringSchedule.data.inputs.toolInputArgs.filter(arg => arg.inputArgName !== 'runAt')
repairRecurringSchedule.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'scheduleType').inputArgValue = 'RECURRING'
repairRecurringSchedule.data.inputs.toolInputArgs.splice(2, 0, { inputArgName: 'cronExpression', inputArgValue: '{{llmAgentflow_repair_schedule_intent.output.cronExpression}}' })
const repairScheduleInvalid = clone('directReplyAgentflow_rejected', 'directReplyAgentflow_repair_schedule_invalid', '修复版执行方式无法确定', 13260, 700)
repairScheduleInvalid.data.inputs.directReplyMessage = '无法从用户确认中唯一确定ONE_TIME或RECURRING；未创建修复版调度。请重新明确执行方式、时间与时区。'

const originalStartEdge = flow.edges.find(item => item.source === 'startAgentflow_i8')
flow.edges = flow.edges.filter(item => item !== originalStartEdge
  && !['e19', 'e25', 'e31', 'e32', 'e33', 'e41', 'e42'].includes(item.id)
  && !(item.source === 'toolAgentflow_candidate_ready' && item.target === 'toolAgentflow_preview')
  && !(item.source === 'toolAgentflow_repair_task' && item.target === 'humanInputAgentflow_repair_schedule'))
flow.edges.push(
  edge('i10-e01', 'startAgentflow_i8', 'startAgentflow', classifier.id), edge('i10-e01a', classifier.id, 'llmAgentflow', caseIntentCondition.id),
  edge('i10-e01b', caseIntentCondition.id, '0', credentialCondition.id), edge('i10-e01c', caseIntentCondition.id, '1', resultIntentCondition.id),
  edge('i10-e01d', resultIntentCondition.id, '0', managementInbox.id), edge('i10-e01e', managementInbox.id, 'toolAgentflow', managementReply.id),
  edge('i10-e01f', resultIntentCondition.id, '1', disableConfirm.id), edge('i10-e01g', disableConfirm.id, '0', disableTool.id),
  edge('i10-e01h', disableTool.id, 'toolAgentflow', disableReply.id), edge('i10-e01i', disableConfirm.id, '1', disableCancelled.id),
  edge('i10-e03', credentialCondition.id, '0', credentialCreate.id), edge('i10-e04', credentialCreate.id, 'toolAgentflow', credentialHuman.id),
  edge('i10-e05', credentialHuman.id, '0', credentialGet.id), edge('i10-e06', credentialGet.id, 'toolAgentflow', inputReady.id),
  edge('i10-e07', credentialCondition.id, '1', inputReady.id), edge('i10-e08', inputReady.id, 'llmAgentflow', supportingImageCondition.id),
  edge('i10-e08a',supportingImageCondition.id,'0',imageSubmit.id),edge('i10-e08b',imageSubmit.id,'toolAgentflow',imageWait.id),edge('i10-e08c',imageWait.id,'0',imageGet.id),edge('i10-e08d',imageGet.id,'toolAgentflow',imageReady.id),edge('i10-e08e',imageReady.id,'0',imageConfirm.id),edge('i10-e08f',imageConfirm.id,'0',naturalCondition.id),edge('i10-e08g',imageReady.id,'1',imageFailed.id),edge('i10-e08h',supportingImageCondition.id,'1',naturalCondition.id),
  edge('i10-e09', naturalCondition.id, '0', 'retrieverAgentflow_i8'), edge('i10-e10', naturalCondition.id, '1', videoCondition.id),
  edge('i10-e11', videoCondition.id, '0', ingestVideo.id), edge('i10-e12', videoCondition.id, '1', ingestFile.id),
  edge('i10-e13', ingestVideo.id, 'toolAgentflow', ingestWait.id), edge('i10-e14', ingestFile.id, 'toolAgentflow', ingestWait.id),
  edge('i10-e15', ingestWait.id, '0', ingestGet.id), edge('i10-e16', ingestGet.id, 'toolAgentflow', ingestReadyCondition.id),
  edge('i10-e16a', ingestReadyCondition.id, '0', ingestConfirm.id), edge('i10-e16b', ingestReadyCondition.id, '1', ingestProcessingCondition.id),
  edge('i10-e16c', ingestProcessingCondition.id, '0', ingestWait.id), edge('i10-e16d', ingestProcessingCondition.id, '1', ingestFailedReply.id),
  edge('i10-e17', ingestConfirm.id, '0', ingestDecisionParser.id), edge('i10-e17r', ingestConfirm.id, '1', ingestReject.id),
  edge('i10-e17a', ingestDecisionParser.id, 'llmAgentflow', ingestCorrectionCondition.id),
  edge('i10-e17b', ingestCorrectionCondition.id, '0', ingestCorrect.id), edge('i10-e17c', ingestCorrect.id, 'toolAgentflow', ingestGet.id),
  edge('i10-e17d', ingestCorrectionCondition.id, '1', ingestDecide.id), edge('i10-e17e', ingestReject.id, 'toolAgentflow', 'directReplyAgentflow_rejected'),
  edge('i10-e18', ingestDecide.id, 'toolAgentflow', 'llmAgentflow_intent'),
  edge('i10-e19', 'humanInputAgentflow_run', '0', scheduleIntent.id), edge('i10-e20', scheduleIntent.id, 'llmAgentflow', scheduleCondition.id),
  edge('i10-e21', scheduleCondition.id, '0', 'toolAgentflow_run'), edge('i10-e22', scheduleCondition.id, '1', oneTimeCondition.id),
  edge('i10-e22a', oneTimeCondition.id, '0', positiveSchedule.id), edge('i10-e22b', oneTimeCondition.id, '1', recurringCondition.id),
  edge('i10-e22c', recurringCondition.id, '0', recurringSchedule.id), edge('i10-e22d', recurringCondition.id, '1', scheduleInvalid.id),
  edge('i10-e23', positiveSchedule.id, 'toolAgentflow', positiveScheduleGet.id), edge('i10-e23a', recurringSchedule.id, 'toolAgentflow', positiveScheduleGet.id), edge('i10-e23b', positiveScheduleGet.id, 'toolAgentflow', scheduledReply.id),
  edge('i10-e23c', 'toolAgentflow_repair_task', 'toolAgentflow', repairResultInbox.id),
  edge('i10-e23d', repairResultInbox.id, 'toolAgentflow', 'humanInputAgentflow_repair_schedule'),
  edge('i10-e24', 'humanInputAgentflow_repair_schedule', '0', repairScheduleIntent.id), edge('i10-e25', repairScheduleIntent.id, 'llmAgentflow', repairOneTimeCondition.id),
  edge('i10-e25a', repairOneTimeCondition.id, '0', repairSchedule.id), edge('i10-e25b', repairOneTimeCondition.id, '1', repairRecurringCondition.id),
  edge('i10-e25c', repairRecurringCondition.id, '0', repairRecurringSchedule.id), edge('i10-e25d', repairRecurringCondition.id, '1', repairScheduleInvalid.id),
  edge('i10-e26', repairSchedule.id, 'toolAgentflow', repairScheduleGet.id), edge('i10-e26a', repairRecurringSchedule.id, 'toolAgentflow', repairScheduleGet.id),
  edge('i10-e27', repairScheduleGet.id, 'toolAgentflow', 'directReplyAgentflow_repair_scheduled'),
  edge('i10-e28', 'conditionAgentflow_terminal', '0', resultInbox.id), edge('i10-e29', resultInbox.id, 'toolAgentflow', 'directReplyAgentflow_result'),
  edge('i10-e30', 'toolAgentflow_candidate_ready', 'toolAgentflow', candidateReadyCondition.id),
  edge('i10-e31', candidateReadyCondition.id, '0', 'toolAgentflow_preview'),
  edge('i10-e32', candidateReadyCondition.id, '1', candidateAuthoringFailed.id),
  edge('i10-e33', candidateAuthoringFailed.id, '0', candidateFailedReply.id),
  edge('i10-e34', candidateAuthoringFailed.id, '1', candidateValidationFailed.id),
  edge('i10-e35', candidateValidationFailed.id, '0', candidateFailedReply.id),
  edge('i10-e36', candidateValidationFailed.id, '1', 'humanInputAgentflow_generation'),
  edge('i10-e37', 'toolAgentflow_repair_propose', 'toolAgentflow', repairReady.id),
  edge('i10-e38', repairReady.id, 'toolAgentflow', repairReadyCondition.id),
  edge('i10-e39', repairReadyCondition.id, '0', 'llmAgentflow_proposalref'),
  edge('i10-e40', repairReadyCondition.id, '1', repairValidationFailed.id),
  edge('i10-e41', repairValidationFailed.id, '0', repairValidationFailedReply.id),
  edge('i10-e42', repairValidationFailed.id, '1', repairWait.id),
  edge('i10-e43', repairWait.id, '0', repairReady.id)
)
flow.nodes.push(classifier, caseIntentCondition, resultIntentCondition, managementInbox, managementReply, disableConfirm, disableTool, disableReply, disableCancelled, credentialCondition, credentialCreate, credentialHuman, credentialGet, inputReady, supportingImageCondition,imageSubmit,imageWait,imageGet,imageReady,imageConfirm,imageFailed,naturalCondition, videoCondition, ingestVideo, ingestFile, ingestWait, ingestGet, ingestReadyCondition, ingestProcessingCondition, ingestFailedReply, ingestConfirm, ingestDecisionParser, ingestCorrectionCondition, ingestCorrect, ingestDecide, ingestReject, scheduleIntent, scheduleCondition, oneTimeCondition, recurringCondition, positiveSchedule, recurringSchedule, scheduleInvalid, positiveScheduleGet, scheduledReply, repairScheduleIntent, repairOneTimeCondition, repairRecurringCondition, repairRecurringSchedule, repairScheduleInvalid, repairScheduleGet, resultInbox, repairResultInbox, candidateReadyCondition, candidateAuthoringFailed, candidateValidationFailed, candidateFailedReply, repairReadyCondition, repairValidationFailed, repairValidationFailedReply)

const structure = flow.nodes.find(item => item.id === 'llmAgentflow_structure')
structure.data.inputs.llmMessages[0].content = '将自然语言案例与已确认的图片事实拆成结构化字段，由MCP组装权威CaseDraft。必须把每个文本输入动作的具体值写进actionStepsV2，并带inputValueSource与provenanceRefs；未知或敏感值不得猜测，凭据用CREDENTIAL_REF，验证码或PIN用RUNTIME_USER_INPUT。识别短信、TOTP、验证码、扫码、U盾、移动证书、生物识别或人工审批时必须生成verificationRequirements，统一unattendedPolicy=HUMAN_IN_LOOP_REQUIRED。preconditions、actions、expectedOutcomes、assertions和missingFields必须是JSON字符串数组。actions与expectedOutcomes必须等长。不得生成定位器、代码、SQL、Shell、账号或密码。credentialRef由Flowise状态直接交给MCP。信息不完整时列出missingFields。multimodalContextJson必须是合法JSON对象字符串，包含supportingImageIngestId、caseFacts、actionStepsV2、verificationRequirements。'
structure.data.inputs.llmMessages[1].content = '案例描述：{{$flow.state.naturalLanguage}}\ncredentialRef：{{$flow.state.credentialRef}}\n已确认图片事实：{{$flow.state.imageFactsJson}}\n图片任务：{{$flow.state.imageIngestId}}\n知识：{{retrieverAgentflow_i8.output}}'
structure.data.inputs.llmStructuredOutput = [
  { key: 'caseTitle', type: 'string', description: '案例名称' },
  { key: 'objective', type: 'string', description: '测试目标' },
  { key: 'summary', type: 'string', description: '案例摘要' },
  { key: 'targetSystem', type: 'string', description: '目标系统' },
  { key: 'entryUrl', type: 'string', description: '入口URL' },
  { key: 'preconditions', type: 'stringArray', description: '前置条件数组' },
  { key: 'actions', type: 'stringArray', description: '业务动作数组' },
  { key: 'expectedOutcomes', type: 'stringArray', description: '与actions等长的预期结果数组' },
  { key: 'assertions', type: 'stringArray', description: '验收断言数组' },
  { key: 'missingFields', type: 'stringArray', description: '信息缺口，完整时为空数组' },
  { key: 'multimodalContextJson', type: 'string', description: 'CaseDraft多模态扩展的严格JSON对象字符串' },
  { key: 'acceptanceSummary', type: 'string', description: '向用户展示的简明验收摘要，不是JSON' },
  { key: 'clarificationRequired', type: 'boolean', description: '是否需要最小业务澄清' },
  { key: 'clarificationQuestion', type: 'string', description: '至多一个业务澄清问题' }
]
structure.data.inputs.llmUpdateState = []
const prepare = flow.nodes.find(item => item.id === 'toolAgentflow_prepare')
prepare.data.inputs.toolInputArgs[0].inputArgValue = stateValue('naturalLanguage')
prepare.data.inputs.toolInputArgs = prepare.data.inputs.toolInputArgs.filter(arg => !['draftJson', 'acceptanceSummaryJson', 'draftArray'].includes(arg.inputArgName))
for (const key of ['caseTitle', 'objective', 'summary', 'targetSystem', 'entryUrl', 'preconditions', 'actions', 'expectedOutcomes', 'assertions', 'missingFields']) {
  prepare.data.inputs.toolInputArgs.push({ inputArgName: key, inputArgValue: `{{llmAgentflow_structure.output.${key}}}` })
}
prepare.data.inputs.toolInputArgs.push({inputArgName:'multimodalContextJson',inputArgValue:'{{llmAgentflow_structure.output.multimodalContextJson}}'})
if (!prepare.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'credentialRef')) {
  prepare.data.inputs.toolInputArgs.push({ inputArgName: 'credentialRef', inputArgValue: stateValue('credentialRef') })
}
const naturalConfirmation = flow.nodes.find(item => item.id === 'humanInputAgentflow_confirm')
naturalConfirmation.data.inputs.humanInputDescription = '请确认以下案例草案、所有文本输入值的来源及验证要求后再写入衡准：{{llmAgentflow_structure.output.acceptanceSummary}}；多模态扩展：{{llmAgentflow_structure.output.multimodalContextJson}}'
prepare.data.inputs.toolUpdateState = [
  updateFromOutput('preparationId'), updateFromOutput('preparationVersion', 'version'),
  updateFromOutput('caseId'), updateFromOutput('caseVersion'), updateFromOutput('caseDraftJson', 'intentSource')
]
const intent = flow.nodes.find(item => item.id === 'llmAgentflow_intent')
intent.data.inputs.llmMessages[0].content = '以JSON格式根据已确认草案形成严格IntentPlan业务字段。当前受控案例的route必须精确输出/portal/login，不得输出完整entryUrl、域名、协议、查询或锚点。动作、预期和风险三个数组必须等长且顺序一致；assertions为字符串数组。步骤ID由MCP按数组顺序确定性生成，模型不得输出、复制、改写或猜测ID。只能描述业务动作和期望，不得生成定位器、代码、SQL、Shell、凭据或可执行脚本。系统标识、权威ID和版本由MCP或Flow State生成并提交。'
intent.data.inputs.llmMessages[1].content = '已由MCP或导入链路确认的统一意图来源：{{$flow.state.caseDraftJson}}'
intent.data.inputs.llmStructuredOutput = intent.data.inputs.llmStructuredOutput.filter(item => !['preparationId', 'preparationVersion', 'caseId', 'caseVersion', 'intentStepIds'].includes(item.key))
const submit = flow.nodes.find(item => item.id === 'toolAgentflow_submit')
submit.data.inputs.toolInputArgs = submit.data.inputs.toolInputArgs.filter(arg => arg.inputArgName !== 'intentStepIds')
for (const arg of submit.data.inputs.toolInputArgs) {
  const stateKeys = { preparationId: 'preparationId', expectedVersion: 'preparationVersion', caseId: 'caseId', caseVersion: 'caseVersion' }
  if (stateKeys[arg.inputArgName]) arg.inputArgValue = stateValue(stateKeys[arg.inputArgName])
}
const runChoice = flow.nodes.find(item => item.id === 'humanInputAgentflow_run')
runChoice.data.label = '确认即时、单次或周期执行'
runChoice.data.inputs.humanInputDescription = '请选择并明确确认：立即执行（ON_DEMAND）、单次定时（ONE_TIME，给出日期时间与时区）或周期执行（RECURRING，给出频率与时区）。Harness提交前会确定性校验，未确认则不执行。'
for (const node of flow.nodes) {
  for (const arg of node.data?.inputs?.toolInputArgs || []) {
    if (arg.inputArgName === 'preparationId') arg.inputArgValue = stateValue('preparationId')
  }
}
const run = flow.nodes.find(item => item.id === 'toolAgentflow_run')
run.data.inputs.toolUpdateState = [updateFromOutput('taskId')]
const task = flow.nodes.find(item => item.id === 'toolAgentflow_task')
task.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'taskId').inputArgValue = stateValue('taskId')
const repairRerun = flow.nodes.find(item => item.id === 'toolAgentflow_repair_rerun')
repairRerun.data.inputs.toolUpdateState = [updateFromOutput('taskId')]
const repairTask = flow.nodes.find(item => item.id === 'toolAgentflow_repair_task')
repairTask.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'taskId').inputArgValue = stateValue('taskId')
const repairScheduleChoice = flow.nodes.find(item => item.id === 'humanInputAgentflow_repair_schedule')
repairScheduleChoice.data.inputs.humanInputDescription = '修复版本复跑终态：{{toolAgentflow_repair_task}}；正式结果收件箱：{{toolAgentflow_repair_result_inbox}}。旧调度不会自动迁移。批准将另建一条用户刚刚确认的单次或周期修复版调度；拒绝则不创建调度。'
const resultReply = flow.nodes.find(item => item.id === 'directReplyAgentflow_result')
resultReply.data.inputs.directReplyMessage = '正向链路已完成纯Playwright执行。权威任务结果：{{toolAgentflow_task}}；正式结果收件箱：{{toolAgentflow_result_inbox}}'

for (const node of flow.nodes) {
  if (typeof node.data?.label === 'string') node.data.label = node.data.label.replaceAll('六次', '四次')
  const inputs = node.data?.inputs
  if (inputs?.humanInputDescription) inputs.humanInputDescription = inputs.humanInputDescription
    .replaceAll('六次', '四次')
    .replaceAll('2视口×3次', '2视口×2次')
    .replaceAll('2030-01-01 09:00（Asia/Shanghai）的一次性', '用户刚刚确认的即时、单次或周期')
  for (const arg of inputs?.toolInputArgs || []) {
    if (arg.inputArgName === 'includeDownload') arg.inputArgValue = true
    if (arg.inputArgName === 'runAt' && String(arg.inputArgValue).startsWith('2030-')) arg.inputArgValue = '{{llmAgentflow_repair_schedule_intent.output.runAt}}'
  }
  if (node.data?.name === 'llmAgentflow') {
    const messages = Array.isArray(inputs?.llmMessages) ? inputs.llmMessages : []
    const system = messages.find(message => message.role === 'system')
    if (system && !/json/i.test(system.content || '')) system.content = `${system.content} 请严格输出JSON对象，字段必须符合结构化输出定义。`
    const outputs = Array.isArray(inputs?.llmStructuredOutput) ? inputs.llmStructuredOutput : []
    if (system && outputs.length > 0) {
      const defaults = { string: '', stringArray: [], jsonArray: [], boolean: false, number: 0, integer: 0, array: [], object: {} }
      const shape = Object.fromEntries(outputs.map(output => [output.key, defaults[output.type] ?? '']))
      const definitions = outputs.map(output => `${output.key}(${output.type})=${output.description || '按字段语义填写'}`).join('；')
      system.content = `${system.content} 最终JSON只能包含这些精确字段且必须全部出现，不得改名、不得省略、不得为null、不得添加额外字段：${JSON.stringify(shape)}。字段语义：${definitions}。`
    }
  }
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true })
const renderedFlow = `${JSON.stringify(flow, null, 2)
  .replaceAll('{{$flow.input}}', '{{question}}')
  .replaceAll('六次', '四次')
  .replaceAll('2视口×3次', '2视口×2次')}\n`
fs.writeFileSync(targetPath, renderedFlow)
const publicationPath = path.join(root, 'flowise/i10/publication-manifest-v1.json')
if (fs.existsSync(publicationPath)) {
  const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'))
  publication.primaryFlowSha256 = crypto.createHash('sha256').update(renderedFlow).digest('hex')
  fs.writeFileSync(publicationPath, `${JSON.stringify(publication, null, 2)}\n`)
}
process.stdout.write(`HENGZHUN_I10_AGENTFLOW_BUILT:${flow.nodes.length}:${flow.edges.length}\n`)
