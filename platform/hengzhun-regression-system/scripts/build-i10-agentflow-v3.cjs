#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { flowiseFunctionSource } = require('./i10-case-draft-normalizer.cjs')

const root = path.resolve(__dirname, '..')
const node = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
execFileSync(node, [path.join(__dirname, 'build-i10-agentflow.cjs')], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit']
})
const sourcePath = path.join(root, 'flowise/i10/agentflow-v2.json')
const targetPath = path.join(root, 'flowise/i10/agentflow-v3.json')
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const sourceById = new Map(source.nodes.map(node => [node.id, node]))
const clone = (id, newId, label, x, y) => {
  const node = structuredClone(sourceById.get(id))
  if (!node) throw new Error(`I10_V3_PROTOTYPE_MISSING:${id}`)
  node.id = newId
  node.position = { x, y }
  node.data.id = newId
  node.data.label = label
  return node
}
const edge = (id, sourceId, output, targetId) => ({
  id,
  source: sourceId,
  sourceHandle: `${sourceId}-output-${output}`,
  target: targetId,
  targetHandle: targetId
})
const state = key => `{{$flow.state.${key}}}`
const update = (key, outputPath = key) => ({ key, value: `{{ output.${outputPath} }}` })
const mcpConfig = action => ({
  toolAgentflowSelectedTool: 'customMCP',
  mcpServerConfig: '{"url":"http://127.0.0.1:18789/mcp","headers":{"Authorization":"Bearer {{$vars.HENGZHUN_MCP_TOKEN}}"}}',
  mcpActions: [action]
})

const flow = {
  ...structuredClone(source),
  name: '衡准自动化回归主控-I10交互旅程版',
  description: '衡准 I10 Agentflow v3：Harness权威交互旅程、确定性总出口、最小人工确认、异步状态恢复和统一状态卡。',
  nodes: [],
  edges: [],
  i10Contract: {
    schemaVersion: 'hengzhun-i10-agentflow-v3',
    controller: {
      apiKeyVariable: 'CONTROL_API_KEY',
      baseUrlVariable: 'CONTROL_BASE_URL',
      modelVariable: 'CONTROL_MODEL_NAME',
      contextTokens: 1000000,
      maxOutputTokens: 8192
    },
    visual: {
      apiKeyVariable: 'VISION_API_KEY',
      baseUrlVariable: 'VISION_BASE_URL',
      modelVariable: 'VISION_MODEL_NAME',
      contextTokens: 16000,
      maxInputTokens: 12000,
      maxOutputTokens: 4000
    },
    authority: 'HARNESS_INTERACTION_JOURNEY',
    externalTools: 'MCP_ONLY',
    toolCount: 28,
    publicJourneyTools: ['journey_prepare','journey_get','journey_decision_submit'],
    inputTypes: ['NATURAL_LANGUAGE','CASE_FILE','VIDEO','NONE'],
    naturalLanguageIntents: ['CASE_AUTHORING','RESULT_QUERY','SCHEDULE_DISABLE','JOURNEY_RESUME','HELP','UNSUPPORTED'],
    asyncResume: true,
    unifiedOutputEnvelope: 'hengzhun-i10-interaction-response-v2'
  }
}

const start = clone('startAgentflow_i8','startAgentflow_i10_v3','衡准统一入口',0,160)
start.data.inputs.startPersistState = true
const journeyStateKeys = [
  'requestIntent','inputType','naturalLanguage','flowiseFileRef','originalFilename','credentialRef',
  'supportingImages','scheduleId','taskId','journeyId','journeyVersion','journeyStatus',
  'journeyStage','journeySummary','journeyMissingFields','journeyAllowedActions',
  'journeyPrimaryDecision','journeyNextAction','journeyNextActionType','journeyNextActionText',
  'journeyRenderedMarkdown','journeyArtifactCards','journeyNeedsCredential','caseDraftJson','draftDisplayJson',
  'credentialSessionId','credentialCaptureUrl','resultArtifactId','resultDownloadHref',
  'resultDownloadName','resultDownloadSha256','candidateDownloadHref',
  'candidateDownloadName','candidateDownloadSha256','ingestStatus'
]
const legacyState = sourceById.get('startAgentflow_i8').data.inputs.startState || []
const legacyDefaults = new Map(legacyState.map(item => [item.key,item.value]))
start.data.inputs.startState = [...new Set([...legacyDefaults.keys(),...journeyStateKeys])]
  .map(key => ({ key, value: legacyDefaults.get(key) ?? (key === 'supportingImages' ? '[]' : '') }))

const classify = clone('llmAgentflow_i10_input','llmAgentflow_i10_v3_classify','理解请求并分类',360,160)
classify.data.inputs.llmReturnResponseAs = ''
classify.data.inputs.llmMessages = [
  {
    role: 'system',
    content: '你是衡准请求分类器，只做语义识别，不调用工具、不判断业务是否已经就绪。requestIntent只能是CASE_AUTHORING、RESULT_QUERY、SCHEDULE_DISABLE、JOURNEY_RESUME、HELP、UNSUPPORTED。inputType只能是NATURAL_LANGUAGE、CASE_FILE、VIDEO、NONE。用户说“继续、恢复、查询当前进度”且给出或上下文已有journeyId时使用JOURNEY_RESUME。描述新测试案例、上传案例文件或录屏时使用CASE_AUTHORING。附件引用只能逐字复制FLOWISE_CONTROLLED_ATTACHMENTS，不得猜测。credentialRef只能逐字复制上下文中的credential_引用，不得生成。最终JSON只能包含下列精确字段，字段必须全部出现，不得改名、不得省略、不得为null、不得添加字段；没有值的字符串必须输出空字符串，数组没有值必须输出空数组：{"requestIntent":"","inputType":"","naturalLanguage":"","flowiseFileRef":"","originalFilename":"","credentialRef":"","supportingImages":[],"scheduleId":"","taskId":"","journeyId":""}。不得输出解释。'
  },
  {
    role: 'user',
    content: '用户输入：{{question}}\n已有输入类型：{{$flow.state.inputType}}\n已有案例描述：{{$flow.state.naturalLanguage}}\n已有主附件引用：{{$flow.state.flowiseFileRef}}\n已有主附件名称：{{$flow.state.originalFilename}}\n已有补充图片：{{$flow.state.supportingImages}}\n已有凭据录入会话：{{$flow.state.credentialSessionId}}\n已有旅程：{{$flow.state.journeyId}}\n如果用户仅说“继续”且已有凭据录入会话，请保持CASE_AUTHORING以及原输入类型、案例描述、附件引用、附件名称和补充图片，不要改成JOURNEY_RESUME，也不要把已有值清空。'
  }
]
classify.data.inputs.llmStructuredOutput = [
  { key:'requestIntent',type:'string',description:'六种允许意图之一' },
  { key:'inputType',type:'string',description:'NATURAL_LANGUAGE、CASE_FILE、VIDEO或NONE' },
  { key:'naturalLanguage',type:'string',description:'原始案例描述或空字符串' },
  { key:'flowiseFileRef',type:'string',description:'受控主附件引用或空字符串' },
  { key:'originalFilename',type:'string',description:'主附件原名或空字符串' },
  { key:'credentialRef',type:'string',description:'已有credentialRef或空字符串' },
  { key:'supportingImages',type:'jsonArray',description:'补充图片受控元数据数组' },
  { key:'scheduleId',type:'string',description:'调度ID或空字符串' },
  { key:'taskId',type:'string',description:'任务ID或空字符串' },
  { key:'journeyId',type:'string',description:'恢复旅程ID或空字符串' }
]
classify.data.inputs.llmUpdateState = classify.data.inputs.llmStructuredOutput.map(item => ({
  key: item.key,
  value: `{{ output.${item.key} }}`
}))

const credentialSessionEmpty = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_credential_session_empty','是否已有凭据录入会话',540,40)
credentialSessionEmpty.data.inputs.conditions = [{type:'string',value1:state('credentialSessionId'),operation:'equal',value2:''}]
credentialSessionEmpty.data.outputAnchors = [{label:'没有',name:'0'},{label:'已有',name:'1'}]

const credentialRefresh = clone('toolAgentflow_get','toolAgentflow_i10_v3_credential_refresh','读取本机凭据录入状态',720,40)
credentialRefresh.data.inputs.toolInputArgs = [
  {inputArgName:'sessionId',inputArgValue:state('credentialSessionId')}
]
credentialRefresh.data.inputs.toolUpdateState = [
  {key:'credentialRef',value:'{{ output.credentialRef }}'}
]
credentialRefresh.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('credential_session_get')

const structure = clone('llmAgentflow_structure','llmAgentflow_i10_v3_structure','形成案例草案候选',720,160)
structure.data.inputs.llmReturnResponseAs = ''
structure.data.inputs.llmMessages[0].content = `${structure.data.inputs.llmMessages[0].content} 你只形成候选草案；是否允许确认和提交完全由后续Harness决定。用户未提供元素定位器不是信息缺口。已有credentialRef时账号密码不是信息缺口。页面内导航方式由Midscene在作者化阶段识别，不是用户信息缺口。姓名、头像等页面实际值可在运行时跨页面比较时，不要求用户预先提供具体值。`
structure.data.inputs.llmMessages[1].content = '当前请求意图：{{$flow.state.requestIntent}}；输入类型：{{$flow.state.inputType}}；原始用户输入：{{question}}；案例描述：{{$flow.state.naturalLanguage}}'

const normalize = clone('customFunctionAgentflow_case_normalize','customFunctionAgentflow_i10_v3_normalize','确定性规范化候选草案',1080,160)
normalize.data.inputs.customFunctionJavascriptFunction = flowiseFunctionSource()
normalize.data.inputs.customFunctionInputVariables = [
  { variableName:'rawDraft',variableValue:'{{llmAgentflow_i10_v3_structure.output}}' },
  { variableName:'credentialRef',variableValue:state('credentialRef') },
  { variableName:'naturalLanguage',variableValue:state('naturalLanguage') }
]
normalize.data.inputs.customFunctionUpdateState = [
  { key:'caseDraftJson',value:'{{ output.draftJson }}' },
  { key:'draftDisplayJson',value:'{{ output.displayJson }}' }
]

const inspectMissing = clone('customFunctionAgentflow_case_normalize','customFunctionAgentflow_i10_v3_inspect_missing','识别凭据缺口',1980,40)
inspectMissing.data.inputs.customFunctionJavascriptFunction = `
const value = $missingFields;
let fields = [];
if (Array.isArray(value)) fields = value;
else if (typeof value === 'string' && value.trim()) {
  try { const parsed = JSON.parse(value); fields = Array.isArray(parsed) ? parsed : [value]; }
  catch { fields = [value]; }
}
return { needsCredential: fields.includes('credentialRef') ? 'YES' : 'NO' };`
inspectMissing.data.inputs.customFunctionInputVariables = [
  {variableName:'missingFields',variableValue:state('journeyMissingFields')}
]
inspectMissing.data.inputs.customFunctionUpdateState = [
  {key:'journeyNeedsCredential',value:'{{ output.needsCredential }}'}
]

const needsCredential = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_needs_credential','是否缺少本机凭据',2160,40)
needsCredential.data.inputs.conditions = [{type:'string',value1:state('journeyNeedsCredential'),operation:'equal',value2:'YES'}]
needsCredential.data.outputAnchors = [{label:'缺少凭据',name:'0'},{label:'其他缺口',name:'1'}]

const credentialCreate = clone('toolAgentflow_get','toolAgentflow_i10_v3_credential_create','创建本机安全凭据会话',2340,40)
credentialCreate.data.inputs.toolInputArgs = [
  {inputArgName:'label',inputArgValue:'衡准当前回归案例'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}'}
]
credentialCreate.data.inputs.toolUpdateState = [
  {key:'credentialSessionId',value:'{{ output.sessionId }}'},
  {key:'credentialCaptureUrl',value:'{{ output.captureUrl }}'}
]
credentialCreate.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('credential_session_create')

const credentialReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_credential','安全凭据录入说明',2520,40)
credentialReply.data.inputs.directReplyMessage = '## 请先录入本机安全凭据\n\n账号和密码不能发送到对话中。\n\n1. [打开本机安全凭据页面]({{$flow.state.credentialCaptureUrl}})\n2. 完成加密保存后关闭凭据页面。\n3. 回到此对话发送“继续”。'

const prepare = clone('toolAgentflow_prepare','toolAgentflow_i10_v3_prepare','MCP建立权威交互旅程',1440,160)
prepare.data.inputs.toolInputArgs = [
  { inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}' },
  { inputArgName:'journeyId',inputArgValue:state('journeyId') },
  { inputArgName:'requestIntent',inputArgValue:state('requestIntent') },
  { inputArgName:'inputType',inputArgValue:state('inputType') },
  { inputArgName:'naturalLanguage',inputArgValue:state('naturalLanguage') },
  { inputArgName:'flowiseFileRef',inputArgValue:state('flowiseFileRef') },
  { inputArgName:'originalFilename',inputArgValue:state('originalFilename') },
  { inputArgName:'credentialRef',inputArgValue:state('credentialRef') },
  { inputArgName:'supportingImages',inputArgValue:state('supportingImages') },
  { inputArgName:'scheduleId',inputArgValue:state('scheduleId') },
  { inputArgName:'taskId',inputArgValue:state('taskId') },
  { inputArgName:'draftJson',inputArgValue:state('caseDraftJson') }
]
prepare.data.inputs.toolUpdateState = [
  update('journeyId'),update('journeyVersion','version'),update('journeyStatus','status'),
  update('journeyStage','stage'),update('journeySummary','summary'),
  update('journeyMissingFields','missingFields'),update('journeyAllowedActions','allowedActions'),
  update('journeyPrimaryDecision','primaryDecision'),update('journeyNextAction','nextAction'),
  update('journeyNextActionType','nextAction.type'),update('journeyNextActionText','nextAction.description'),
  update('journeyRenderedMarkdown','renderedMarkdown'),update('journeyArtifactCards','artifactCards')
]
prepare.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_prepare')

const routeResume = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_route_resume','是否恢复已有旅程',360,160)
routeResume.data.inputs.conditions = [{type:'string',value1:state('requestIntent'),operation:'equal',value2:'JOURNEY_RESUME'}]
routeResume.data.outputAnchors = [{label:'恢复旅程',name:'0'},{label:'新请求',name:'1'}]

const resume = clone('toolAgentflow_get','toolAgentflow_i10_v3_resume','读取已有交互旅程',540,280)
resume.data.inputs.toolInputArgs = [
  {inputArgName:'journeyId',inputArgValue:state('journeyId')},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}'},
  {inputArgName:'waitSeconds',inputArgValue:0}
]
resume.data.inputs.toolUpdateState = prepare.data.inputs.toolUpdateState
resume.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_get')

const needsInput = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_needs_input','是否需要补充信息',1800,160)
needsInput.data.inputs.conditions = [{type:'string',value1:state('journeyStatus'),operation:'equal',value2:'NEEDS_INPUT'}]
needsInput.data.outputAnchors = [{label:'需要补充',name:'0'},{label:'已具备',name:'1'}]

const awaitsUser = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_awaiting_user','是否需要人工决定',2160,280)
awaitsUser.data.inputs.conditions = [{type:'string',value1:state('journeyStatus'),operation:'equal',value2:'AWAITING_USER'}]
awaitsUser.data.outputAnchors = [{label:'等待决定',name:'0'},{label:'无需决定',name:'1'}]

const confirm = clone('humanInputAgentflow_confirm','humanInputAgentflow_i10_v3_decision','最小必要确认',2520,280)
confirm.data.inputs.humanInputEnableFeedback = false
confirm.data.inputs.humanInputDescription = '{{$flow.state.journeySummary}} 允许操作：{{$flow.state.journeyAllowedActions}}。请选择“批准”继续第一项允许操作，或选择“拒绝”取消。本节点禁止输入账号、密码、验证码、PIN或其他秘密。'

const approve = clone('toolAgentflow_activate','toolAgentflow_i10_v3_approve','MCP提交批准决定',2880,220)
approve.data.inputs.toolInputArgs = [
  {inputArgName:'journeyId',inputArgValue:state('journeyId')},
  {inputArgName:'expectedVersion',inputArgValue:state('journeyVersion')},
  {inputArgName:'decision',inputArgValue:state('journeyPrimaryDecision')},
  {inputArgName:'confirmationRef',inputArgValue:'{{$flow.sessionId}}'},
  {inputArgName:'payload',inputArgValue:'{}'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}'}
]
approve.data.inputs.toolUpdateState = prepare.data.inputs.toolUpdateState
approve.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_decision_submit')

const reject = clone('toolAgentflow_activate','toolAgentflow_i10_v3_reject','MCP提交取消决定',2880,380)
reject.data.inputs.toolInputArgs = [
  {inputArgName:'journeyId',inputArgValue:state('journeyId')},
  {inputArgName:'expectedVersion',inputArgValue:state('journeyVersion')},
  {inputArgName:'decision',inputArgValue:'CANCEL'},
  {inputArgName:'confirmationRef',inputArgValue:'{{$flow.sessionId}}'},
  {inputArgName:'payload',inputArgValue:'{}'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}'}
]
reject.data.inputs.toolUpdateState = prepare.data.inputs.toolUpdateState
reject.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_decision_submit')

const reply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_card','统一状态卡',3240,160)
reply.data.inputs.directReplyMessage = '{{$flow.state.journeyRenderedMarkdown}}'

const routeIngest = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_route_ingest','是否进入附件导入',2340,520)
routeIngest.data.inputs.conditions = [{type:'string',value1:state('journeyNextActionType'),operation:'equal',value2:'SUBMIT_INGEST'}]
routeIngest.data.outputAnchors = [{label:'附件导入',name:'0'},{label:'其他请求',name:'1'}]

const routeResult = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_route_result','是否查询结果',2520,660)
routeResult.data.inputs.conditions = [{type:'string',value1:state('journeyNextActionType'),operation:'equal',value2:'QUERY_RESULT_INBOX'}]
routeResult.data.outputAnchors = [{label:'结果查询',name:'0'},{label:'普通回复',name:'1'}]

const resultTaskMissing = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_result_task_missing','是否指定任务',2700,660)
resultTaskMissing.data.inputs.conditions = [{type:'string',value1:state('taskId'),operation:'equal',value2:''}]
resultTaskMissing.data.outputAnchors = [{label:'未指定',name:'0'},{label:'已指定',name:'1'}]

const resultInbox = clone('toolAgentflow_management_inbox','toolAgentflow_i10_v3_result_inbox','查询最近回归结果',2880,760)
resultInbox.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('result_inbox_list')
const resultInboxReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_result_inbox_reply','返回结果查询说明',3060,760)
resultInboxReply.data.inputs.directReplyMessage = '## 已查询最近回归结果\n\n结果仍保存在衡准SQLite与受控制品库中。\n\n### 下一步\n\n1. 如需下载某次完整报告，请发送“查询结果”并附上对应任务参考编号。\n2. 如需创建新的回归案例，请直接描述成功案例或上传案例文件/录屏。'

const resultTask = clone('toolAgentflow_task','toolAgentflow_i10_v3_result_task','读取指定任务结果',2880,620)
resultTask.data.inputs.toolInputArgs = [
  {inputArgName:'taskId',inputArgValue:state('taskId')},
  {inputArgName:'waitForTerminal',inputArgValue:false},
  {inputArgName:'waitTimeoutSeconds',inputArgValue:0}
]
resultTask.data.inputs.toolUpdateState = [
  {key:'resultArtifactId',value:'{{ output.resultArtifactId }}'}
]
resultTask.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('task_get')

const resultArtifactMissing = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_result_artifact_missing','任务是否已有结果文件',3060,620)
resultArtifactMissing.data.inputs.conditions = [{type:'string',value1:state('resultArtifactId'),operation:'equal',value2:''}]
resultArtifactMissing.data.outputAnchors = [{label:'尚无文件',name:'0'},{label:'已有文件',name:'1'}]

const resultPendingReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_result_pending','返回任务等待状态',3240,700)
resultPendingReply.data.inputs.directReplyMessage = '## 任务尚未形成可下载结果\n\n任务可能仍在执行，或尚未生成正式制品。\n\n### 下一步\n\n1. 稍后使用同一任务参考编号再次查询。\n2. 不要重复提交相同回归任务。'

const resultGrant = clone('toolAgentflow_get','toolAgentflow_i10_v3_result_grant','签发结果文件下载链接',3240,560)
resultGrant.data.inputs.toolInputArgs = [{inputArgName:'artifactId',inputArgValue:state('resultArtifactId')}]
resultGrant.data.inputs.toolUpdateState = [
  {key:'resultDownloadHref',value:'{{ output.href }}'},
  {key:'resultDownloadName',value:'{{ output.displayName }}'},
  {key:'resultDownloadSha256',value:'{{ output.sha256 }}'}
]
resultGrant.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('artifact_download_grant')

const resultDownloadReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_result_download','返回结果文件',3420,560)
resultDownloadReply.data.inputs.directReplyMessage = '## 回归结果已就绪\n\n### 可下载成果\n\n- [下载 {{$flow.state.resultDownloadName}}]({{$flow.state.resultDownloadHref}})\n  Hash：{{$flow.state.resultDownloadSha256}}\n\n### 下一步\n\n1. 下载链接为短时一次性授权，请及时保存。\n2. 可继续选择立即复跑、单次定时或周期回归。'

const ingestTypeVideo = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_ingest_video','附件是否为视频',2520,500)
ingestTypeVideo.data.inputs.conditions = [{type:'string',value1:state('inputType'),operation:'equal',value2:'VIDEO'}]
ingestTypeVideo.data.outputAnchors = [{label:'视频',name:'0'},{label:'案例文件',name:'1'}]

const ingestVideo = clone('toolAgentflow_ingest_video','toolAgentflow_i10_v3_ingest_video','提交视频导入',2700,460)
const ingestFile = clone('toolAgentflow_ingest_file','toolAgentflow_i10_v3_ingest_file','提交案例文件导入',2700,540)
const ingestGet = clone('toolAgentflow_ingest_get','toolAgentflow_i10_v3_ingest_get','读取统一案例草案',2880,500)
ingestGet.data.inputs.toolUpdateState = [
  {key:'ingestJobVersion',value:'{{ output.version }}'},
  {key:'ingestStatus',value:'{{ output.status }}'},
  {key:'caseDraftJson',value:'{{ output.items.0.draft }}'}
]
const ingestReady = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_ingest_ready','导入草案是否可确认',3060,500)
ingestReady.data.inputs.conditions = [{type:'string',value1:state('ingestStatus'),operation:'equal',value2:'WAITING_USER'}]
ingestReady.data.outputAnchors = [{label:'可确认',name:'0'},{label:'未就绪',name:'1'}]
const ingestProcessing = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_ingest_processing','导入是否仍在处理',3240,620)
ingestProcessing.data.inputs.conditions = [{type:'string',value1:state('ingestStatus'),operation:'equal',value2:'PROCESSING'}]
ingestProcessing.data.outputAnchors = [{label:'处理中',name:'0'},{label:'失败',name:'1'}]
const ingestProcessingReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_ingest_processing','返回附件处理进度',3420,620)
ingestProcessingReply.data.inputs.directReplyMessage = '## 衡准正在解析附件\n\n文件已进入受控导入流程，当前无需重复上传。\n\n### 下一步\n\n1. 稍后在同一对话发送“继续”。\n2. 视频需要完成抽帧、本机ONNX中英文OCR、文字变化时间线和主控事实筛选，等待时间通常长于案例文件。视频导入不调用视觉模型。'
const ingestFailedReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_ingest_failed','返回附件导入失败',3420,700)
ingestFailedReply.data.inputs.directReplyMessage = '## 附件未能形成可确认案例\n\n系统已安全停止，没有继续作者化或生成脚本。\n\n### 下一步\n\n1. 检查文件格式、大小和内容完整性。\n2. 修正后重新上传；不要在对话中粘贴账号密码。'
const ingestConfirm = clone('humanInputAgentflow_confirm','humanInputAgentflow_i10_v3_ingest_confirm','确认导入案例草案',3240,460)
ingestConfirm.data.inputs.humanInputEnableFeedback = false
ingestConfirm.data.inputs.humanInputDescription = '附件已经形成统一案例草案。请选择“批准”写入衡准并进入作者化，或选择“拒绝”放弃本次导入。需要修改时先拒绝，再用自然语言说明修改内容；不得提交JSON或秘密。'
const ingestDecide = clone('toolAgentflow_ingest_decide','toolAgentflow_i10_v3_ingest_decide','确认导入案例',3420,420)
const ingestReject = clone('toolAgentflow_ingest_reject','toolAgentflow_i10_v3_ingest_reject','拒绝导入案例',3420,500)
const ingestRejectedReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_ingest_rejected','返回附件拒绝结果',3600,500)
ingestRejectedReply.data.inputs.directReplyMessage = '## 已放弃本次附件草案\n\n附件草案没有写入正式案例，也没有进入作者化。\n\n### 下一步\n\n1. 如需修改，请重新上传附件并用自然语言说明变更要求。\n2. 不要在对话中粘贴账号密码、验证码或PIN。'

const approveCaseRoute = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_approve_case_route','批准后是否进入作者化',3060,220)
approveCaseRoute.data.inputs.conditions = [{type:'string',value1:state('journeyNextActionType'),operation:'equal',value2:'CALL_CASE_PREPARE'}]
approveCaseRoute.data.outputAnchors = [{label:'作者化',name:'0'},{label:'其他决定',name:'1'}]
const approveScheduleRoute = clone('conditionAgentflow_clarify','conditionAgentflow_i10_v3_approve_schedule_route','是否停用调度',3240,300)
approveScheduleRoute.data.inputs.conditions = [{type:'string',value1:state('journeyNextActionType'),operation:'equal',value2:'CALL_SCHEDULE_DISABLE'}]
approveScheduleRoute.data.outputAnchors = [{label:'停用调度',name:'0'},{label:'仅返回状态',name:'1'}]
const scheduleDisable = clone('toolAgentflow_get','toolAgentflow_i10_v3_schedule_disable','停用已确认调度',3420,280)
scheduleDisable.data.inputs.toolInputArgs = [
  {inputArgName:'scheduleId',inputArgValue:state('scheduleId')},
  {inputArgName:'reason',inputArgValue:'用户在衡准对话中明确确认停用调度'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}'}
]
scheduleDisable.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('schedule_disable')
const scheduleDisableReply = clone('directReplyAgentflow_result','directReplyAgentflow_i10_v3_schedule_disabled','返回调度停用结果',3600,280)
scheduleDisableReply.data.inputs.directReplyMessage = '## 调度已停用\n\n衡准已记录停用决定，后续不会再按该调度自动执行。\n\n### 下一步\n\n1. 可查询最近结果。\n2. 如需恢复定期回归，请重新创建并确认新的调度。'

const frontNodes = [
  start,classify,routeResume,resume,credentialSessionEmpty,credentialRefresh,structure,normalize,prepare,
  needsInput,inspectMissing,needsCredential,credentialCreate,credentialReply,
  awaitsUser,confirm,approve,reject,reply,
  routeIngest,routeResult,resultTaskMissing,resultInbox,resultInboxReply,resultTask,
  resultArtifactMissing,resultPendingReply,resultGrant,resultDownloadReply,
  ingestTypeVideo,ingestVideo,ingestFile,ingestGet,ingestReady,ingestProcessing,
  ingestProcessingReply,ingestFailedReply,ingestConfirm,ingestDecide,ingestReject,ingestRejectedReply,
  approveCaseRoute,approveScheduleRoute,scheduleDisable,scheduleDisableReply
]
const frontEdges = [
  edge('i10-v3-e01',start.id,'start',classify.id),
  edge('i10-v3-e01a',classify.id,'llmAgentflow',routeResume.id),
  edge('i10-v3-e01b',routeResume.id,'0',resume.id),
  edge('i10-v3-e01c',resume.id,'toolAgentflow',reply.id),
  edge('i10-v3-e02',routeResume.id,'1',credentialSessionEmpty.id),
  edge('i10-v3-e02a',credentialSessionEmpty.id,'0',structure.id),
  edge('i10-v3-e02b',credentialSessionEmpty.id,'1',credentialRefresh.id),
  edge('i10-v3-e02c',credentialRefresh.id,'toolAgentflow',structure.id),
  edge('i10-v3-e03',structure.id,'llmAgentflow',normalize.id),
  edge('i10-v3-e04',normalize.id,'customFunctionAgentflow',prepare.id),
  edge('i10-v3-e05',prepare.id,'toolAgentflow',needsInput.id),
  edge('i10-v3-e06',needsInput.id,'0',inspectMissing.id),
  edge('i10-v3-e06a',inspectMissing.id,'customFunctionAgentflow',needsCredential.id),
  edge('i10-v3-e06b',needsCredential.id,'0',credentialCreate.id),
  edge('i10-v3-e06c',credentialCreate.id,'toolAgentflow',credentialReply.id),
  edge('i10-v3-e06d',needsCredential.id,'1',reply.id),
  edge('i10-v3-e07',needsInput.id,'1',awaitsUser.id),
  edge('i10-v3-e08',awaitsUser.id,'0',confirm.id),
  edge('i10-v3-e09',awaitsUser.id,'1',routeIngest.id),
  edge('i10-v3-e10',confirm.id,'0',approve.id),
  edge('i10-v3-e11',confirm.id,'1',reject.id),
  edge('i10-v3-e12',approve.id,'toolAgentflow',approveCaseRoute.id),
  edge('i10-v3-e12a',approveCaseRoute.id,'0','toolAgentflow_prepare'),
  edge('i10-v3-e12b',approveCaseRoute.id,'1',approveScheduleRoute.id),
  edge('i10-v3-e12c',approveScheduleRoute.id,'0',scheduleDisable.id),
  edge('i10-v3-e12d',scheduleDisable.id,'toolAgentflow',scheduleDisableReply.id),
  edge('i10-v3-e12e',approveScheduleRoute.id,'1',reply.id),
  edge('i10-v3-e13',reject.id,'toolAgentflow',reply.id),
  edge('i10-v3-e14',routeIngest.id,'0',ingestTypeVideo.id),
  edge('i10-v3-e15',ingestTypeVideo.id,'0',ingestVideo.id),
  edge('i10-v3-e16',ingestTypeVideo.id,'1',ingestFile.id),
  edge('i10-v3-e17',ingestVideo.id,'toolAgentflow',ingestGet.id),
  edge('i10-v3-e18',ingestFile.id,'toolAgentflow',ingestGet.id),
  edge('i10-v3-e19',ingestGet.id,'toolAgentflow',ingestReady.id),
  edge('i10-v3-e20',ingestReady.id,'0',ingestConfirm.id),
  edge('i10-v3-e21',ingestReady.id,'1',ingestProcessing.id),
  edge('i10-v3-e22',ingestProcessing.id,'0',ingestProcessingReply.id),
  edge('i10-v3-e23',ingestProcessing.id,'1',ingestFailedReply.id),
  edge('i10-v3-e24',ingestConfirm.id,'0',ingestDecide.id),
  edge('i10-v3-e25',ingestConfirm.id,'1',ingestReject.id),
  edge('i10-v3-e26',ingestDecide.id,'toolAgentflow','llmAgentflow_intent'),
  edge('i10-v3-e27',ingestReject.id,'toolAgentflow',ingestRejectedReply.id),
  edge('i10-v3-e28',routeIngest.id,'1',routeResult.id),
  edge('i10-v3-e29',routeResult.id,'0',resultTaskMissing.id),
  edge('i10-v3-e30',routeResult.id,'1',reply.id),
  edge('i10-v3-e31',resultTaskMissing.id,'0',resultInbox.id),
  edge('i10-v3-e32',resultInbox.id,'toolAgentflow',resultInboxReply.id),
  edge('i10-v3-e33',resultTaskMissing.id,'1',resultTask.id),
  edge('i10-v3-e34',resultTask.id,'toolAgentflow',resultArtifactMissing.id),
  edge('i10-v3-e35',resultArtifactMissing.id,'0',resultPendingReply.id),
  edge('i10-v3-e36',resultArtifactMissing.id,'1',resultGrant.id),
  edge('i10-v3-e37',resultGrant.id,'toolAgentflow',resultDownloadReply.id)
]

const sourceAdjacency = new Map(source.nodes.map(node => [node.id,[]]))
for (const item of source.edges) sourceAdjacency.get(item.source)?.push(item.target)
const downstream = new Set(['toolAgentflow_prepare'])
const queue = ['toolAgentflow_prepare']
while (queue.length) {
  const current = queue.shift()
  for (const next of sourceAdjacency.get(current) || []) {
    if (!downstream.has(next)) {
      downstream.add(next)
      queue.push(next)
    }
  }
}
const removedWaitNodes = new Set(['humanInputAgentflow_generation','humanInputAgentflow_repair_wait'])
for (const id of removedWaitNodes) downstream.delete(id)
const downstreamNodes = source.nodes.filter(node => downstream.has(node.id)).map(node => structuredClone(node))
const safeReplyMessages = {
  directReplyAgentflow_result: '## 回归执行已结束\n\n正式结果和脱敏证据已经写入衡准制品库。\n\n### 下一步\n\n1. 发送“查询结果”并附任务参考编号，可获取完整报告下载链接。\n2. 可继续选择单次定时或周期回归。',
  directReplyAgentflow_failure_report: '## 回归执行未通过\n\n事故已按脱敏规则记录；您没有批准创建修复候选，正式脚本和调度均未改变。',
  directReplyAgentflow_repair_rejected: '## 已取消本次修复\n\n原脚本、事故和调度状态保持不变。',
  directReplyAgentflow_repair_not_activated: '## 修复候选未激活\n\n候选虽然完成验证，但未获您的激活确认，因此没有替换正式脚本。',
  directReplyAgentflow_repair_no_rerun: '## 修复版本已保存\n\n您没有批准复跑，因此没有创建新的正式运行或调度。',
  directReplyAgentflow_repair_no_schedule: '## 修复复跑已经结束\n\n本次没有创建新的调度，旧调度也没有被静默迁移。',
  directReplyAgentflow_repair_scheduled: '## 修复版调度已创建\n\n修复候选已完成验证、人工激活和纯Playwright复跑，并绑定到新调度。',
  directReplyAgentflow_not_activated: '## 候选脚本未激活\n\n没有创建正式运行或调度；已验证候选仍保留在衡准中。',
  directReplyAgentflow_run_later: '## 脚本已保留\n\n当前没有创建立即运行或调度。之后可选择单次定时或周期回归。',
  directReplyAgentflow_rejected: '## 本次案例已取消\n\n案例没有写入正式状态，也没有进入作者化。',
  directReplyAgentflow_management_results: '## 已查询最近回归结果\n\n结果保存在衡准制品库中。请提供任务参考编号以获取对应报告下载链接。',
  directReplyAgentflow_schedule_disabled: '## 调度已停用\n\n后续不会再按该调度自动执行。',
  directReplyAgentflow_schedule_disable_cancelled: '## 未停用调度\n\n您没有批准停用，调度状态保持不变。',
  directReplyAgentflow_image_failed: '## 补充图片未形成可确认事实\n\n系统已安全停止，没有继续作者化。请检查图片清晰度和内容后重新上传。',
  directReplyAgentflow_ingest_failed: '## 附件未形成可确认案例\n\n系统已安全停止。请检查文件格式、大小和内容完整性后重新上传。',
  directReplyAgentflow_schedule_invalid: '## 执行时间仍不明确\n\n请重新说明是立即执行、单次定时还是周期回归，并提供时间与时区。',
  directReplyAgentflow_scheduled: '## 回归调度已创建\n\n调度已经绑定当前通过验证的脚本版本。可随时查询或明确确认后停用。',
  directReplyAgentflow_repair_schedule_invalid: '## 修复版调度时间仍不明确\n\n请重新说明单次时间或周期规则与时区。',
  directReplyAgentflow_candidate_failed: '## 候选脚本验证失败\n\n系统没有签发证书、激活脚本或创建调度。可查看失败报告后重新作者化。',
  directReplyAgentflow_repair_validation_failed: '## 修复候选验证失败\n\n系统没有激活、复跑或迁移调度。原正式脚本保持不变。'
}
const safeHumanInputDescriptions = {
  humanInputAgentflow_activate: '## 候选脚本已通过四次稳定性验证\n\n### 可下载成果\n\n- [下载 {{$flow.state.candidateDownloadName}}]({{$flow.state.candidateDownloadHref}})\n  Hash：{{$flow.state.candidateDownloadSha256}}\n\n请选择“批准”激活该精确版本，或选择“拒绝”保留现状。本节点不接受自由文本或秘密。',
  humanInputAgentflow_run: '## 请选择执行方式\n\n请只提供以下一种自然语言计划：立即执行；单次定时并写明日期、时间和时区；周期执行并写明频率和时区。系统解析后还会再次显示计划供您确认。不要输入账号、密码、验证码或PIN。',
  humanInputAgentflow_repair: '## 是否创建受控修复候选\n\n正式回归未通过。批准后只会基于脱敏事故信息生成候选，不会修改项目源码、激活脚本或迁移调度；拒绝则只保留失败报告。',
  humanInputAgentflow_repair_confirm: '## 是否验证修复候选\n\n批准后只生成新的候选并重新执行纯Playwright与四次稳定性验证，不会自动激活、复跑或迁移调度；拒绝则保持现状。',
  humanInputAgentflow_repair_activate: '## 修复候选已经通过验证\n\n请选择“批准”激活已验证的精确版本，或选择“拒绝”继续使用原版本。本节点不接受自由文本或秘密。',
  humanInputAgentflow_repair_rerun: '## 是否复跑修复版本\n\n修复版本已经激活，但不会自动运行。批准将创建一次纯Playwright复跑；拒绝则只保留已激活版本。',
  humanInputAgentflow_repair_schedule: '## 是否为修复版本新建调度\n\n旧调度不会自动迁移。批准仅使用前面已经确认的时间计划另建调度；拒绝则不创建调度。'
}
for (const node of downstreamNodes) {
  if (node.data?.name === 'llmAgentflow') node.data.inputs.llmReturnResponseAs = ''
  if (node.id === 'toolAgentflow_preview') {
    node.data.inputs.toolUpdateState = [
      {key:'candidateDownloadHref',value:'{{ output.download.href }}'},
      {key:'candidateDownloadName',value:'{{ output.download.filename }}'},
      {key:'candidateDownloadSha256',value:'{{ output.download.sha256 }}'}
    ]
  }
  if (node.data?.name === 'humanInputAgentflow') {
    node.data.inputs.humanInputDescription = safeHumanInputDescriptions[node.id]
      ?? '请检查上方简报，并只选择“批准”或“拒绝”。本节点不接受账号、密码、验证码、PIN或其他秘密。'
    node.data.inputs.humanInputEnableFeedback = node.id === 'humanInputAgentflow_run'
  }
  if (node.data?.name === 'directReplyAgentflow') {
    node.data.inputs.directReplyMessage = safeReplyMessages[node.id]
      ?? '## 衡准已完成本轮处理\n\n请根据当前页面提供的操作继续；技术详情和完整证据保存在受控制品中。'
  }
}
const downstreamEdges = source.edges
  .filter(item => downstream.has(item.source) && downstream.has(item.target))
  .map(item => structuredClone(item))
downstreamEdges.push(
  edge('i10-v3-e-authoring-auto-poll','toolAgentflow_candidate','toolAgentflow','toolAgentflow_candidate_ready')
)
flow.nodes = [...frontNodes,...downstreamNodes]
flow.edges = [...frontEdges,...downstreamEdges]

const rendered = `${JSON.stringify(flow,null,2).replaceAll('{{$flow.input}}','{{question}}')}\n`
fs.mkdirSync(path.dirname(targetPath),{recursive:true})
fs.writeFileSync(targetPath,rendered)
const publicationPath = path.join(root,'flowise/i10/publication-manifest-v1.json')
const publication = JSON.parse(fs.readFileSync(publicationPath,'utf8'))
if (publication.primaryFlowDataPath !== 'flowise/i10/agentflow-v3.json') {
  publication.rollbackFlowDataPath = publication.primaryFlowDataPath
  publication.rollbackFlowSha256 = publication.primaryFlowSha256
}
publication.primaryFlowDataPath = 'flowise/i10/agentflow-v3.json'
publication.primaryFlowSha256 = crypto.createHash('sha256').update(rendered).digest('hex')
publication.primaryFlowVersion = 3
publication.mcpToolCount = 28
publication.interactionAuthority = 'HARNESS_INTERACTION_JOURNEY'
publication.deployed = false
publication.publishState = 'BUILT_NOT_PUBLISHED'
delete publication.lastVerifiedAt
fs.writeFileSync(publicationPath,`${JSON.stringify(publication,null,2)}\n`)
process.stdout.write(`HENGZHUN_I10_AGENTFLOW_V3_BUILT:${flow.nodes.length}:${flow.edges.length}\n`)
