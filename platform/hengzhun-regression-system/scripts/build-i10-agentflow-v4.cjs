#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { structuredFlowiseFunctionSource } = require('./i10-case-draft-normalizer.cjs')
const {
  schemaVersion: capabilityManifestVersion,
  generationAuthority,
  activeCapabilities,
  plannedCapabilities
} = require('./i10-agentflow-capabilities.cjs')
const { flowiseSecretGuardSource } = require('./i10-input-safety.cjs')

const root = path.resolve(__dirname, '..')
const node = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
execFileSync(node, [path.join(__dirname, 'build-i10-agentflow-v3.cjs')], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit']
})

const sourcePath = path.join(root, 'flowise/i10/agentflow-v3.json')
const legacySourcePath = path.join(root, 'flowise/i10/agentflow-v2.json')
const targetPath = path.join(root, 'flowise/i10/agentflow-v4.json')
const layoutPath = path.join(root, 'flowise/i10/agentflow-v4-layout.json')
const flow = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const byId = new Map(flow.nodes.map(item => [item.id, item]))
const legacyById = new Map(
  JSON.parse(fs.readFileSync(legacySourcePath, 'utf8')).nodes.map(item => [item.id, item])
)
const edge = (id, source, output, target) => ({
  id,
  source,
  sourceHandle: `${source}-output-${output}`,
  target,
  targetHandle: target
})
const cloneNode = (sourceId, id, label, x, y) => {
  const item = byId.get(sourceId) || legacyById.get(sourceId)
  if (!item) throw new Error(`I10_V4_PROTOTYPE_MISSING:${sourceId}`)
  const node = structuredClone(item)
  node.id = id
  node.position = { x, y }
  node.data.id = id
  node.data.label = label
  byId.set(id, node)
  return node
}
const state = key => `{{$flow.state.${key}}}`
const draftFieldNames = [
  'caseTitle', 'objective', 'summary', 'targetSystem', 'entryUrl',
  'preconditions', 'actions', 'expectedOutcomes', 'assertions', 'missingFields',
  'multimodalContext', 'acceptanceSummary', 'clarificationRequired',
  'clarificationQuestion', 'semanticVerdict', 'satisfiedRequirementIds',
  'unresolvedRequirements', 'semanticConfidence'
]
const caseDraftJsonContract =
  '最终只输出JSON对象，字段必须且只能是：caseTitle、objective、summary、targetSystem、entryUrl、preconditions、actions、expectedOutcomes、assertions、missingFields、multimodalContext、acceptanceSummary、clarificationRequired、clarificationQuestion、semanticVerdict、satisfiedRequirementIds、unresolvedRequirements、semanticConfidence。semanticVerdict只能是COMPLETE或NEEDS_CLARIFICATION；unresolvedRequirements是由requirementId和question组成的对象数组。字段不得改名或省略；actions和expectedOutcomes必须是等长字符串数组；不得输出schemaVersion、title、steps或credentialRef。'
const draftStateKey = field => `controllerDraft_${field}`
const structuredDraftNormalizerSource = () =>
  structuredFlowiseFunctionSource(draftFieldNames)
const mcpConfig = action => ({
  toolAgentflowSelectedTool: 'customMCP',
  mcpServerConfig: '{"url":"http://127.0.0.1:18789/mcp","headers":{"Authorization":"Bearer {{$vars.HENGZHUN_MCP_TOKEN}}"}}',
  mcpActions: [action]
})
const journeyUpdates = [
  ['journeyId', 'journeyId'],
  ['journeyVersion', 'version'],
  ['journeyStatus', 'status'],
  ['journeyStage', 'stage'],
  ['journeySummary', 'summary'],
  ['journeyMissingFields', 'missingFields'],
  ['journeyAllowedActions', 'allowedActions'],
  ['journeyInteractionMode', 'interactionMode'],
  ['journeyInputRequest', 'inputRequest'],
  ['journeyProposal', 'proposal'],
  ['journeyProposalId', 'proposalId'],
  ['journeyProposalPayloadHash', 'proposalPayloadHash'],
  ['journeyProposalSummary', 'proposalSummary'],
  ['journeyProposalEffect', 'proposalEffect'],
  ['journeyProposalRejectEffect', 'proposalRejectEffect'],
  ['journeyProceedDecision', 'proposalProceedDecision'],
  ['journeyRejectDecision', 'proposalRejectDecision'],
  ['journeyNextAction', 'nextAction'],
  ['journeyNextActionType', 'nextAction.type'],
  ['journeyNextActionText', 'nextAction.description'],
  ['journeyRenderedMarkdown', 'renderedMarkdown'],
  ['journeyArtifactCards', 'artifactCards']
].map(([key, output]) => ({ key, value: `{{ output.${output} }}` }))

flow.name = '衡准自动化回归主控-I10明确交互闭环版'
flow.description = '衡准 I10 Agentflow v4：proceed/reject逐门槛精确语义、输入先校验、冻结提案二次确认、Harness权威状态机。'
flow.i10Contract = {
  ...flow.i10Contract,
  schemaVersion: 'hengzhun-i10-agentflow-v4',
  toolCount: 33,
  publicJourneyTools: ['journey_prepare', 'journey_get', 'journey_input_submit', 'journey_decision_submit'],
  interactionModes: ['STATUS_ONLY', 'INPUT_REQUIRED', 'CONFIRM_EXACT'],
  unifiedOutputEnvelope: 'hengzhun-i10-interaction-response-v3',
  binaryChoiceSemantics: 'EXACT_PROPOSAL_ONLY',
  currentFeedbackOnly: true,
  internalStructuredOutputRole: 'userMessage',
  generationAuthority,
  capabilityManifestVersion,
  activeCapabilities: activeCapabilities.map(item => item.id),
  plannedCapabilities
}

const start = byId.get('startAgentflow_i10_v3')
const removedState = new Set(['journeyPrimaryDecision'])
const newState = [
  'journeyInteractionMode', 'journeyInputRequest', 'journeyProposal',
  'journeyProposalId', 'journeyProposalPayloadHash', 'journeyProposalSummary',
  'journeyProposalEffect', 'journeyProposalRejectEffect',
  'journeyProceedDecision', 'journeyRejectDecision',
  'interactionFeedback', 'interactionFeedbackSafe', 'initialInputRoute', 'initialEntryUrl', 'accumulatedCaseInput',
  'caseInputRevision', 'semanticAssessmentJson', 'executionPlanJson',
  'executionPlanDisplay', 'initialNormalizedInput',
  'imageRoute', 'imageIngestStatus', 'imageIngestVersion', 'imageFactDecisionsJson',
  'imageProgressStage', 'imageProgressPercent', 'imageProcessedCount',
  'imageElapsedSeconds', 'imageIdleSeconds', 'imageMaxWaitSeconds',
  'imageLastActivityAt', 'imageLeaseExpiresAt', 'imageTimeoutStatus',
  'imageProgressMessage', 'imageFactsBrief', 'imagePreviewBrief', 'imageArtifactsBrief',
  'imageRecognitionBranches', 'imagePurgeStatus',
  'ingestDraftCount', 'ingestItemsJson', 'ingestItemDecisionsJson', 'batchCasesJson',
  'ingestCorrectionRequired', 'ingestCorrectionTitle', 'ingestCorrectionObjective',
  'ingestCorrectionSummary', 'ingestCorrectionTargetSystem', 'ingestCorrectionEntryUrl',
  'ingestCorrectionPreconditions', 'ingestCorrectionActions',
  'ingestCorrectionExpectedOutcomes', 'ingestCorrectionAssertions',
  'ingestCorrectionReason', 'ingestCorrectionNormalizeValid',
  'ingestCorrectionNormalizedJson',
  'candidateNextAction', 'candidateJobId', 'verificationChallengeId',
  'verificationStatus', 'verificationVersion', 'verificationType', 'verificationPreparation',
  'formalTaskStatus', 'formalTaskNextAction', 'formalVerificationChallengeId',
  'formalVerificationStatus', 'formalVerificationVersion',
  'formalVerificationType', 'formalVerificationPreparation',
  'resumeRoute', 'resumeJourneyId', 'entrySafe',
  'classifiedRequestIntent', 'classifiedInputType', 'classifiedNaturalLanguage',
  'classifiedRaw',
  'classifiedFlowiseFileRef', 'classifiedOriginalFilename',
  'classifiedCredentialRef',
  'classifiedSupportingImageRef1', 'classifiedSupportingImageName1',
  'classifiedSupportingImageRef2', 'classifiedSupportingImageName2',
  'classifiedScheduleId', 'classifiedTaskId', 'classifiedJourneyId',
  'scheduleType', 'scheduleRunAt', 'scheduleCronExpression',
  'scheduleTimezone', 'scheduleMisfirePolicy',
  'scheduleMisfireGraceSeconds', 'scheduleMaxRetries',
  'scheduleValidationStatus', 'scheduleValidationError',
  'controllerScheduleType', 'controllerScheduleRunAt',
  'controllerScheduleCronExpression', 'controllerScheduleTimezone',
  'controllerScheduleMisfirePolicy', 'controllerScheduleMisfireGraceSeconds',
  'controllerScheduleMaxRetries',
  'targetProfileId', 'targetProfileVersion', 'targetProfileHash',
  'targetProfileStatus', 'targetProfileLaunchUrl', 'targetProfileSnapshot',
  'targetProfilePrerequisiteRoute', 'targetProfilePrerequisiteReason',
  ...draftFieldNames.map(draftStateKey)
]
start.data.inputs.startState = [
  ...start.data.inputs.startState.filter(item => !removedState.has(item.key)),
  ...newState.filter(key => !start.data.inputs.startState.some(item => item.key === key)).map(key => ({ key, value: '' }))
]
const caseInputRevisionState = start.data.inputs.startState.find(item => item.key === 'caseInputRevision')
if (caseInputRevisionState) caseInputRevisionState.value = 1
const semanticAssessmentState = start.data.inputs.startState.find(item => item.key === 'semanticAssessmentJson')
if (semanticAssessmentState) semanticAssessmentState.value = JSON.stringify({
  schemaVersion:'hengzhun-i10-semantic-assessment-v1',
  verdict:'NEEDS_CLARIFICATION',
  satisfiedRequirementIds:[],
  unresolvedRequirements:[],
  confidence:0
})

// Flowise does not reliably resolve a structured LLM node's direct output
// inside a later custom-function input. Persist every structured field first,
// then let the deterministic normalizer read only Flow state.
const controllerStructure = byId.get('llmAgentflow_i10_v3_structure')
const controllerNormalize = byId.get('customFunctionAgentflow_i10_v3_normalize')
controllerStructure.data.inputs.llmUpdateState = draftFieldNames.map(field => ({
  key: draftStateKey(field),
  value: `{{ output.${field} }}`
}))
controllerNormalize.data.inputs.customFunctionJavascriptFunction = structuredDraftNormalizerSource()
controllerNormalize.data.inputs.customFunctionInputVariables = [
  ...draftFieldNames.map(field => ({
    variableName: field,
    variableValue: state(draftStateKey(field))
  })),
  { variableName:'credentialRef', variableValue:state('credentialRef') },
  { variableName:'naturalLanguage', variableValue:state('naturalLanguage') },
  { variableName:'imageIngestId', variableValue:state('imageIngestId') },
  { variableName:'imageFactsJson', variableValue:state('imageFactsJson') },
  { variableName:'priorDraft', variableValue:state('caseDraftJson') }
]
controllerNormalize.data.inputs.customFunctionUpdateState = [
  { key: 'caseDraftJson', value: '{{ output.draftJson }}' },
  { key: 'draftDisplayJson', value: '{{ output.displayJson }}' },
  { key: 'semanticAssessmentJson', value: '{{ output.semanticAssessmentJson }}' }
]

// The first free-text message must be inspected locally before any controller
// LLM node is reachable.
const entryGuard = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_entry_secret_guard',
  '入口秘密本地拦截',
  120,
  160
)
entryGuard.data.inputs.customFunctionJavascriptFunction = flowiseSecretGuardSource()
entryGuard.data.inputs.customFunctionInputVariables = [{
  variableName: 'rawInput',
  variableValue: '{{question}}'
}]
entryGuard.data.inputs.customFunctionUpdateState = [{
  key: 'entrySafe',
  value: '{{ output.safe }}'
}]

const entrySafe = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_entry_safe',
  '入口内容是否允许进入模型',
  240,
  160
)
entrySafe.data.inputs.conditions = [{
  type: 'string',
  value1: state('entrySafe'),
  operation: 'equal',
  value2: 'YES'
}]
entrySafe.data.outputAnchors = [{ label: '安全', name: '0' }, { label: '拦截', name: '1' }]

// The classifier may interpret the new utterance, but it must not erase the
// persisted case or journey when the user returns from the local credential
// capture page and says "继续". Store its output in temporary keys and merge
// it deterministically with the prior Flow state.
const classifier = byId.get('llmAgentflow_i10_v3_classify')
classifier.data.inputs.systemMessage =
  '你是衡准请求分类器，只做语义识别，不调用工具、不判断业务是否已经就绪。requestIntent只能是CASE_AUTHORING、RESULT_QUERY、SCHEDULE_DISABLE、JOURNEY_RESUME、HELP、UNSUPPORTED。inputType只能是NATURAL_LANGUAGE、CASE_FILE、VIDEO、NONE。用户说“继续、恢复、查询当前进度”且给出或上下文已有journeyId时使用JOURNEY_RESUME。描述新测试案例、上传案例文件或录屏时使用CASE_AUTHORING。内部标记[I10_ATTACHMENT_ONLY_INPUT]表示用户只上传了受控附件、没有输入文字；若附件均为图片，必须判为CASE_AUTHORING和NATURAL_LANGUAGE，naturalLanguage保持空字符串，以便下一节点向用户追问业务目标。附件引用只能逐字复制FLOWISE_CONTROLLED_ATTACHMENTS，不得猜测。credentialRef只能逐字复制上下文中的credential_引用，不得生成。附件必须按用途确定性分流：NATURAL_LANGUAGE没有主文件，图片依次写入supportingImageRef1/Name1和supportingImageRef2/Name2；CASE_FILE或VIDEO的主案例文件/视频写入flowiseFileRef和originalFilename，补充图片再写入两个图片标量字段。图片扩展名包括.png、.jpg、.jpeg、.webp、.bmp。没有值的字符串输出空字符串。不得输出解释。'
// The office-controller endpoint has proven able to return valid JSON while
// occasionally retaining an older field name. Do not let Flowise's Zod parser
// turn that recoverable shape drift into a 500 before local validation.
classifier.data.inputs.llmStructuredOutput = []
classifier.data.inputs.llmUpdateState = [{
  key: 'classifiedRaw',
  // Flowise passes the LLM final response itself to state template
  // resolution. `output.content` is undefined for unstructured JSON text.
  value: '{{ output }}'
}]

const classificationMerge = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_classification_merge',
  '确定性合并分类与会话上下文',
  1020,
  260
)
classificationMerge.data.inputs.customFunctionJavascriptFunction = `
const clean = value => String(value || '').trim();
const parseJsonObject = value => {
  const raw = clean(value).replace(/^\\\`\\\`\\\`(?:json)?\\s*/i, '').replace(/\\s*\\\`\\\`\\\`$/, '');
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};
const parsed = parseJsonObject($classifiedRaw);
const rawQuestion = clean($question);
const attachmentEnvelope = rawQuestion.match(/(?:^|\\n)FLOWISE_CONTROLLED_ATTACHMENTS=(\\[[^\\r\\n]*\\])\\s*$/);
let controlledAttachments = [];
try {
  controlledAttachments = attachmentEnvelope ? JSON.parse(attachmentEnvelope[1]) : [];
} catch { controlledAttachments = []; }
if (!Array.isArray(controlledAttachments)) controlledAttachments = [];
controlledAttachments = [...new Map(controlledAttachments
  .filter(item => item && typeof item === 'object' && clean(item.flowiseFileRef))
  .map(item => [clean(item.flowiseFileRef), {
    flowiseFileRef: clean(item.flowiseFileRef),
    originalFilename: clean(item.originalFilename)
  }])).values()];
const userQuestion = rawQuestion
  .replace(/(?:^|\\n)FLOWISE_CONTROLLED_ATTACHMENTS=\\[[^\\r\\n]*\\]\\s*$/, '')
  .trim();
const continuing = /^(继续|恢复|查询进度|继续查询|resume)(?:[：:。,.，\\s]|$)/i.test(userQuestion) &&
  clean($credentialSessionId) !== '';
const choose = (classified, existing) => {
  const next = clean(classified);
  return next || clean(existing);
};
let existingImages = $supportingImages;
try { if (typeof existingImages === 'string') existingImages = JSON.parse(existingImages || '[]'); } catch { existingImages = []; }
if (!Array.isArray(existingImages)) existingImages = [];
let classifiedImages = [
  [parsed.supportingImageRef1, parsed.supportingImageName1],
  [parsed.supportingImageRef2, parsed.supportingImageName2]
].map(([ref, name]) => ({
  flowiseFileRef: clean(ref),
  originalFilename: clean(name),
  purposeHint: '补充页面事实'
})).filter(item => item.flowiseFileRef);
if (Array.isArray(parsed.supportingImages)) {
  for (const value of parsed.supportingImages) {
    const item = typeof value === 'string'
      ? { flowiseFileRef: clean(value), originalFilename: '', purposeHint: '补充页面事实' }
      : value;
    if (item && typeof item === 'object' && clean(item.flowiseFileRef) &&
        !classifiedImages.some(existing => existing.flowiseFileRef === clean(item.flowiseFileRef))) {
      classifiedImages.push({
        flowiseFileRef: clean(item.flowiseFileRef),
        originalFilename: clean(item.originalFilename),
        purposeHint: clean(item.purposeHint) || '补充页面事实'
      });
    }
  }
}
for (const item of controlledAttachments.filter(value =>
  /\\.(?:png|jpe?g|webp|bmp)$/i.test(clean(value.originalFilename))
)) {
  if (!classifiedImages.some(existing => existing.flowiseFileRef === item.flowiseFileRef)) {
    classifiedImages.push({
      flowiseFileRef: item.flowiseFileRef,
      originalFilename: item.originalFilename,
      purposeHint: '补充页面事实'
    });
  }
}
const classifiedInputType = choose($classifiedInputType, $inputType);
const parsedValue = (key, legacy) => clean(parsed[key]) || clean(legacy);
const classifiedRequestIntent = parsedValue('requestIntent', $classifiedRequestIntent);
const parsedInputType = parsedValue('inputType', $classifiedInputType);
const classifiedNaturalLanguage = parsedValue('naturalLanguage', $classifiedNaturalLanguage);
let classifiedFileRef = parsedValue('flowiseFileRef', $classifiedFlowiseFileRef) || clean($flowiseFileRef);
let classifiedFilename = parsedValue('originalFilename', $classifiedOriginalFilename) || clean($originalFilename);
const controlledPrimary = controlledAttachments.find(item =>
  /\\.(?:xlsx|csv|docx|json|mp4)$/i.test(clean(item.originalFilename))
);
if (controlledPrimary) {
  classifiedFileRef = controlledPrimary.flowiseFileRef;
  classifiedFilename = controlledPrimary.originalFilename;
}
const attachmentOnly = userQuestion === '[I10_ATTACHMENT_ONLY_INPUT]';
let effectiveInputType = attachmentOnly ? 'NATURAL_LANGUAGE' : (parsedInputType || classifiedInputType);
const isImageFilename = /\.(?:png|jpe?g|webp|bmp)$/i.test(classifiedFilename);
const isVideoFilename = /\.mp4$/i.test(classifiedFilename);
const isCaseFileFilename = /\.(?:xlsx|csv|docx|json)$/i.test(classifiedFilename);
// A managed primary attachment is stronger evidence than the controller's
// semantic guess. Prevent an uploaded video or case file from silently taking
// the natural-language route when the classifier drifts.
if (!continuing && classifiedFileRef && isVideoFilename) effectiveInputType = 'VIDEO';
if (!continuing && classifiedFileRef && isCaseFileFilename) effectiveInputType = 'CASE_FILE';
// The controller is not allowed to turn a managed image into a primary case
// file for a natural-language request. Correct the one-image case
// deterministically even when the classifier put it in flowiseFileRef.
if (!continuing && effectiveInputType === 'NATURAL_LANGUAGE' &&
    classifiedFileRef && isImageFilename) {
  if (!classifiedImages.some(item =>
    item && typeof item === 'object' &&
    clean(item.flowiseFileRef) === classifiedFileRef
  )) {
    classifiedImages.push({
      flowiseFileRef: classifiedFileRef,
      originalFilename: classifiedFilename,
      purposeHint: '补充页面事实'
    });
  }
  classifiedFileRef = '';
  classifiedFilename = '';
}
const normalizeImages = images => images.map(item => {
  const originalFilename = clean(item?.originalFilename);
  return {
    flowiseFileRef: clean(item?.flowiseFileRef),
    ...(originalFilename ? { originalFilename } : {}),
    purposeHint: clean(item?.purposeHint) || '补充页面事实'
  };
}).filter(item => item.flowiseFileRef);
return {
  requestIntent: continuing ? 'CASE_AUTHORING' : (classifiedRequestIntent || clean($requestIntent)),
  inputType: continuing ? clean($inputType) : effectiveInputType,
  naturalLanguage: attachmentOnly
    ? ''
    : (continuing
      ? (clean($naturalLanguage) || classifiedNaturalLanguage)
      : (classifiedNaturalLanguage || clean($naturalLanguage))),
  flowiseFileRef: continuing ? clean($flowiseFileRef) : classifiedFileRef,
  originalFilename: continuing ? clean($originalFilename) : classifiedFilename,
  credentialRef: parsedValue('credentialRef', $classifiedCredentialRef) || clean($credentialRef),
  supportingImages: normalizeImages(continuing ? existingImages : (classifiedImages.length ? classifiedImages : existingImages)),
  scheduleId: parsedValue('scheduleId', $classifiedScheduleId) || clean($scheduleId),
  taskId: parsedValue('taskId', $classifiedTaskId) || clean($taskId),
  journeyId: continuing ? clean($journeyId) : (parsedValue('journeyId', $classifiedJourneyId) || clean($journeyId))
};`
classificationMerge.data.inputs.customFunctionInputVariables = [
  { variableName: 'question', variableValue: '{{question}}' },
  { variableName: 'credentialSessionId', variableValue: state('credentialSessionId') },
  { variableName: 'classifiedRaw', variableValue: state('classifiedRaw') },
  ...[
    'requestIntent', 'inputType', 'naturalLanguage', 'flowiseFileRef',
    'originalFilename', 'credentialRef', 'supportingImages', 'scheduleId',
    'taskId', 'journeyId'
  ].map(key => ({ variableName: key, variableValue: state(key) })),
  ...[
    'RequestIntent', 'InputType', 'NaturalLanguage', 'FlowiseFileRef',
    'OriginalFilename', 'CredentialRef',
    'SupportingImageRef1', 'SupportingImageName1',
    'SupportingImageRef2', 'SupportingImageName2',
    'ScheduleId', 'TaskId', 'JourneyId'
  ].map(suffix => ({
    variableName: `classified${suffix}`,
    variableValue: state(`classified${suffix}`)
  }))
]
classificationMerge.data.inputs.customFunctionUpdateState = [
  'requestIntent', 'inputType', 'naturalLanguage', 'flowiseFileRef',
  'originalFilename', 'credentialRef', 'supportingImages', 'scheduleId',
  'taskId', 'journeyId'
].map(key => ({ key, value: `{{ output.${key} }}` }))
flow.nodes.push(classificationMerge)
flow.edges = flow.edges.filter(item =>
  !(item.source === 'llmAgentflow_i10_v3_classify' &&
    item.target === 'conditionAgentflow_i10_v3_route_resume')
)
flow.edges.push(
  edge(
    'i10-v4-classification-merge',
    'llmAgentflow_i10_v3_classify',
    'llmAgentflow',
    classificationMerge.id
  ),
  edge(
    'i10-v4-classification-merged',
    classificationMerge.id,
    'customFunctionAgentflow',
    'conditionAgentflow_i10_v3_route_resume'
  )
)

const entryBlocked = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_entry_blocked',
  '入口安全提示',
  420,
  40
)
entryBlocked.data.inputs.directReplyMessage =
  '## 输入未进入主控模型\n\n内容为空，或检测到账号、密码、验证码、PIN、API Key等秘密格式。\n\n请通过本机安全凭据页面录入账号密码；验证码、PIN和U盾操作只能在被测页面或物理设备上完成。重新发起请求时只描述业务步骤和预期结果。'

flow.nodes.push(entryGuard, entrySafe, entryBlocked)
flow.edges = flow.edges.filter(item => item.id !== 'i10-v3-e01')
flow.edges.push(
  edge('i10-v4-entry-guard', start.id, 'start', entryGuard.id),
  edge('i10-v4-entry-safe', entryGuard.id, 'customFunctionAgentflow', entrySafe.id),
  edge('i10-v4-entry-block', entrySafe.id, '1', entryBlocked.id)
)

const candidateResumeDetect = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_candidate_resume_detect',
  '识别同会话候选继续请求',
  420,
  180
)
candidateResumeDetect.data.inputs.customFunctionJavascriptFunction = `
const text=String($rawInput||'').trim();
const preparationId=String($preparationId||'').trim();
const ingestJobId=String($ingestJobId||'').trim();
const exactJourney=text.match(/(?:恢复|继续)(?:处理)?(?:旅程)?\s*(journey_[0-9a-f-]{36})|resume\s*(journey_[0-9a-f-]{36})/i);
const journeyId=exactJourney?(exactJourney[1]||exactJourney[2]):'';
const wantsResume=/^(继续|恢复|查询进度|继续查询|resume)(?:处理)?(?:旅程)?/i.test(text);
return {
  route:wantsResume&&ingestJobId?'RESUME_INGEST':(journeyId?'RESUME_JOURNEY':(wantsResume&&preparationId?'RESUME_CANDIDATE':'CLASSIFY')),
  journeyId
};`
candidateResumeDetect.data.inputs.customFunctionInputVariables=[
  {variableName:'rawInput',variableValue:'{{question}}'},
  {variableName:'preparationId',variableValue:state('preparationId')},
  {variableName:'ingestJobId',variableValue:state('ingestJobId')}
]
candidateResumeDetect.data.inputs.customFunctionUpdateState=[
  {key:'resumeRoute',value:'{{ output.route }}'},
  {key:'resumeJourneyId',value:'{{ output.journeyId }}'}
]
const candidateResumeRoute=cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_candidate_resume_route',
  '是否恢复候选查询',
  600,
  180
)
candidateResumeRoute.data.inputs.conditions=[
  {type:'string',value1:state('resumeRoute'),operation:'equal',value2:'RESUME_CANDIDATE'},
  {type:'string',value1:state('resumeRoute'),operation:'equal',value2:'RESUME_JOURNEY'},
  {type:'string',value1:state('resumeRoute'),operation:'equal',value2:'RESUME_INGEST'}
]
candidateResumeRoute.data.outputAnchors=[
  {label:'恢复候选',name:'0'},
  {label:'跨会话恢复旅程',name:'1'},
  {label:'恢复异步附件导入',name:'2'},
  {label:'正常分类',name:'3'}
]

const crossSessionJourneyGet=cloneNode(
  'toolAgentflow_i10_v3_resume',
  'toolAgentflow_i10_v4_cross_session_journey_get',
  'MCP按旅程编号跨会话恢复',
  780,
  100
)
crossSessionJourneyGet.data.inputs.toolInputArgs=[
  {inputArgName:'journeyId',inputArgValue:state('resumeJourneyId')},
  {inputArgName:'waitSeconds',inputArgValue:0}
]
crossSessionJourneyGet.data.inputs.toolUpdateState=[
  ...journeyUpdates,
  {key:'preparationId',value:'{{ output.references.preparationId }}'},
  {key:'caseId',value:'{{ output.references.caseId }}'},
  {key:'candidateId',value:'{{ output.references.candidateId }}'},
  {key:'taskId',value:'{{ output.references.taskId }}'},
  {key:'scheduleId',value:'{{ output.references.scheduleId }}'}
]
crossSessionJourneyGet.data.inputs.toolAgentflowSelectedToolConfig=mcpConfig('journey_get')

const crossSessionRoute=cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_cross_session_route',
  '跨会话旅程是否已有作者化引用',
  960,
  100
)
crossSessionRoute.data.inputs.conditions=[{
  type:'string',value1:state('preparationId'),operation:'notEmpty'
}]
crossSessionRoute.data.outputAnchors=[{label:'恢复候选查询',name:'0'},{label:'显示权威旅程状态',name:'1'}]

const crossSessionStatus=cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_cross_session_status',
  '返回跨会话权威状态',
  1140,
  160
)
crossSessionStatus.data.inputs.directReplyMessage='{{$flow.state.journeyRenderedMarkdown}}\n\n旅程编号：{{$flow.state.journeyId}}\n\n如果当前状态需要输入或确认，请按上方唯一提示继续；系统不会凭旧会话中的proceed自动执行。'

flow.nodes.push(candidateResumeDetect,candidateResumeRoute,crossSessionJourneyGet,crossSessionRoute,crossSessionStatus)
flow.edges.push(
  edge('i10-v4-entry-allow',entrySafe.id,'0',candidateResumeDetect.id),
  edge('i10-v4-candidate-resume-detected',candidateResumeDetect.id,'customFunctionAgentflow',candidateResumeRoute.id),
  edge('i10-v4-candidate-resume',candidateResumeRoute.id,'0','toolAgentflow_candidate_ready'),
  edge('i10-v4-cross-session-resume',candidateResumeRoute.id,'1',crossSessionJourneyGet.id),
  edge('i10-v4-ingest-resume',candidateResumeRoute.id,'2','toolAgentflow_i10_v3_ingest_get'),
  edge('i10-v4-normal-classify',candidateResumeRoute.id,'3','llmAgentflow_i10_v3_classify'),
  edge('i10-v4-cross-session-got',crossSessionJourneyGet.id,'toolAgentflow',crossSessionRoute.id),
  edge('i10-v4-cross-session-candidate',crossSessionRoute.id,'0','toolAgentflow_candidate_ready'),
  edge('i10-v4-cross-session-status',crossSessionRoute.id,'1',crossSessionStatus.id)
)

// Supporting images are a mandatory, user-confirmed fact source. They are
// processed before the CaseDraft is frozen, and a persisted imageIngestId is
// queried rather than submitted again when the conversation resumes.
const imageRoute = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_image_route',
  '判断补充图片处理路径',
  1140,
  40
)
imageRoute.data.inputs.customFunctionJavascriptFunction = `
let images = $supportingImages;
try { if (typeof images === 'string') images = JSON.parse(images || '[]'); } catch { images = []; }
if (!Array.isArray(images)) images = [];
const imageIngestId = String($imageIngestId || '').trim();
return { route: images.length === 0 ? 'NONE' : ((!imageIngestId || imageIngestId === 'NONE') ? 'SUBMIT' : 'GET') };`
imageRoute.data.inputs.customFunctionInputVariables = [
  { variableName:'supportingImages', variableValue:state('supportingImages') },
  { variableName:'imageIngestId', variableValue:state('imageIngestId') }
]
imageRoute.data.inputs.customFunctionUpdateState = [
  { key:'imageRoute', value:'{{ output.route }}' }
]

const imageRouteCondition = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_image_route',
  '选择补充图片处理路径',
  1320,
  40
)
imageRouteCondition.data.inputs.conditions = [
  { type:'string', value1:state('imageRoute'), operation:'equal', value2:'SUBMIT' },
  { type:'string', value1:state('imageRoute'), operation:'equal', value2:'GET' }
]
imageRouteCondition.data.outputAnchors = [
  { label:'提交', name:'0' }, { label:'查询', name:'1' }, { label:'无图片', name:'2' }
]

const imageSubmit = cloneNode(
  'toolAgentflow_image_ingest_submit',
  'toolAgentflow_i10_v4_image_submit',
  'MCP提交补充图片分析',
  1500,
  -40
)
imageSubmit.data.inputs.toolInputArgs = [
  { inputArgName:'sourceRef', inputArgValue:'{{$flow.sessionId}}' },
  { inputArgName:'primaryInputType', inputArgValue:state('inputType') },
  { inputArgName:'images', inputArgValue:state('supportingImages') },
  { inputArgName:'primaryText', inputArgValue:state('naturalLanguage') },
  { inputArgName:'sessionRef', inputArgValue:'{{$flow.sessionId}}-images' }
]
imageSubmit.data.inputs.toolUpdateState = [
  { key:'imageIngestId', value:'{{ output.imageIngestId }}' },
  { key:'imageIngestStatus', value:'{{ output.status }}' },
  { key:'imageIngestVersion', value:'{{ output.version }}' },
  { key:'imageProgressStage', value:'{{ output.progressStage }}' },
  { key:'imageProgressPercent', value:'{{ output.progressPercent }}' },
  { key:'imageProcessedCount', value:'{{ output.processedImageCount }}' },
  { key:'imageElapsedSeconds', value:'{{ output.elapsedSeconds }}' },
  { key:'imageIdleSeconds', value:'{{ output.idleSeconds }}' },
  { key:'imageMaxWaitSeconds', value:'{{ output.maxWaitSeconds }}' },
  { key:'imageTimeoutStatus', value:'{{ output.timeoutStatus }}' },
  { key:'imageProgressMessage', value:'{{ output.progressMessage }}' }
]
imageSubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('image_ingest_submit')

const imageWait = cloneNode(
  'humanInputAgentflow_image_wait',
  'humanInputAgentflow_i10_v4_image_wait',
  '等待补充图片OCR与事实筛选',
  1680,
  -40
)
imageWait.data.inputs.humanInputEnableFeedback = false
imageWait.data.outputAnchors = [{ label:'继续查询', name:'proceed' }, { label:'暂不继续', name:'reject' }]
imageWait.data.inputs.humanInputDescription =
  '## 补充图片正在处理\n\n{{$flow.state.imageProgressMessage}}\n\n- 当前阶段：`{{$flow.state.imageProgressStage}}`\n- 已完成：`{{$flow.state.imageProgressPercent}}%`\n- 已处理图片：`{{$flow.state.imageProcessedCount}}`\n- 已等待：`{{$flow.state.imageElapsedSeconds}}秒`\n- 最近活动距今：`{{$flow.state.imageIdleSeconds}}秒`\n- 单次Worker最长租约：`{{$flow.state.imageMaxWaitSeconds}}秒`\n- 超时状态：`{{$flow.state.imageTimeoutStatus}}`\n- 租约截止：`{{$flow.state.imageLeaseExpiresAt}}`\n\n你现在可以：\n\n- 点击 proceed（继续）：查询本次图片分析的最新状态；不会重复提交图片。\n- 点击 reject（拒绝）：暂不继续，本次图片任务和当前旅程会保留。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'

const imageGet = cloneNode(
  'toolAgentflow_image_ingest_get',
  'toolAgentflow_i10_v4_image_get',
  'MCP查询补充图片事实',
  1860,
  40
)
imageGet.data.inputs.toolInputArgs = [{ inputArgName:'imageIngestId', inputArgValue:state('imageIngestId') }]
imageGet.data.inputs.toolUpdateState = [
  { key:'imageIngestStatus', value:'{{ output.status }}' },
  { key:'imageIngestVersion', value:'{{ output.version }}' },
  { key:'imageFactsJson', value:'{{ output.facts }}' },
  { key:'imageFactsBrief', value:'{{ output.humanBriefMarkdown }}' },
  { key:'imagePreviewBrief', value:'{{ output.previewMarkdown }}' },
  { key:'imageArtifactsBrief', value:'{{ output.artifactMarkdown }}' },
  { key:'imageRecognitionBranches', value:'{{ output.recognitionBranches }}' },
  { key:'imageProgressStage', value:'{{ output.progressStage }}' },
  { key:'imageProgressPercent', value:'{{ output.progressPercent }}' },
  { key:'imageProcessedCount', value:'{{ output.processedImageCount }}' },
  { key:'imageElapsedSeconds', value:'{{ output.elapsedSeconds }}' },
  { key:'imageIdleSeconds', value:'{{ output.idleSeconds }}' },
  { key:'imageMaxWaitSeconds', value:'{{ output.maxWaitSeconds }}' },
  { key:'imageLastActivityAt', value:'{{ output.lastActivityAt }}' },
  { key:'imageLeaseExpiresAt', value:'{{ output.leaseExpiresAt }}' },
  { key:'imageTimeoutStatus', value:'{{ output.timeoutStatus }}' },
  { key:'imageProgressMessage', value:'{{ output.progressMessage }}' }
]
imageGet.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('image_ingest_get')

const imageStatus = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_image_status',
  '补充图片状态路由',
  2040,
  40
)
imageStatus.data.inputs.conditions = [
  { type:'string', value1:state('imageIngestStatus'), operation:'equal', value2:'WAITING_USER' },
  { type:'string', value1:state('imageIngestStatus'), operation:'equal', value2:'CONFIRMED' },
  { type:'string', value1:state('imageIngestStatus'), operation:'equal', value2:'FAILED' }
]
imageStatus.data.outputAnchors = [
  { label:'待逐项确认', name:'0' }, { label:'已确认', name:'1' },
  { label:'失败', name:'2' }, { label:'处理中', name:'3' }
]

const imageFactsGate = cloneNode(
  'humanInputAgentflow_image_confirm',
  'humanInputAgentflow_i10_v4_image_facts_gate',
  '确认图片事实建议',
  2220,
  -40
)
imageFactsGate.data.inputs.humanInputEnableFeedback = false
imageFactsGate.data.inputs.humanInputDescription =
  '## 请核对图片事实\n\n{{$flow.state.imageFactsBrief}}\n\n{{$flow.state.imagePreviewBrief}}\n\n{{$flow.state.imageArtifactsBrief}}\n\n你现在可以：\n\n- 点击 proceed（继续）：确认简报中的全部事实；系统记录决定后删除本任务的原图、OCR中间图和临时预览，只保留结构化事实、Hash、OCR模型证据、主控调用证据与删除收据。\n- 点击 reject（拒绝）：进入逐项纠正输入，图片暂时保留且不会写入案例草案。\n\n完整技术细节请使用上方成果文件，不再在对话中展开OCR全文或原始JSON。'

const imageSuggestedDecisions = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_image_suggested_decisions',
  '形成图片事实逐项决定',
  2400,
  -80
)
imageSuggestedDecisions.data.inputs.customFunctionJavascriptFunction = `
let facts = $facts;
try { if (typeof facts === 'string') facts = JSON.parse(facts || '[]'); } catch { facts = []; }
if (!Array.isArray(facts) || facts.length === 0) throw new Error('I10_IMAGE_FACTS_REQUIRED');
const decisions = facts.map(fact => ({
  factId:String(fact.factId || ''),
  decision:'CONFIRM'
}));
if (decisions.some(item => !item.factId)) throw new Error('I10_IMAGE_FACT_ID_REQUIRED');
return { decisions:JSON.stringify(decisions) };`
imageSuggestedDecisions.data.inputs.customFunctionInputVariables = [
  { variableName:'facts', variableValue:state('imageFactsJson') }
]
imageSuggestedDecisions.data.inputs.customFunctionUpdateState = [
  { key:'imageFactDecisionsJson', value:'{{ output.decisions }}' }
]

const imageCorrectionInput = cloneNode(
  'humanInputAgentflow_run',
  'humanInputAgentflow_i10_v4_image_correction_input',
  '输入图片事实纠正',
  2400,
  80
)
imageCorrectionInput.data.inputs.humanInputEnableFeedback = true
imageCorrectionInput.data.inputs.humanInputDescription =
  '## 请说明需要纠正或拒绝的图片事实\n\n请按事实编号说明，例如：`fact_... 改为“入口地址……”；fact_... 拒绝`。\n\n你现在可以：\n\n- 填写后点击 proceed（继续）：只提交当前文字进行安全检查和结构化，再让你确认唯一决定清单。\n- 点击 reject（拒绝）：保留图片任务为待确认状态并结束本次操作。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'

const imageCorrectionGuard = cloneNode(
  'customFunctionAgentflow_i10_v4_entry_secret_guard',
  'customFunctionAgentflow_i10_v4_image_correction_guard',
  '校验图片事实纠正输入',
  2580,
  80
)
imageCorrectionGuard.data.inputs.customFunctionInputVariables = [{
  variableName:'rawInput', variableValue:'{{humanInputAgentflow_i10_v4_image_correction_input.output.conditions.0.feedback}}'
}]
imageCorrectionGuard.data.inputs.customFunctionUpdateState = [
  { key:'interactionFeedbackSafe', value:'{{ output.safe }}' }
]

const imageCorrectionSafe = cloneNode(
  'conditionAgentflow_i10_v4_entry_safe',
  'conditionAgentflow_i10_v4_image_correction_safe',
  '图片纠正是否安全',
  2760,
  80
)
imageCorrectionSafe.data.inputs.conditions = [{
  type:'string', value1:state('interactionFeedbackSafe'), operation:'equal', value2:'YES'
}]

const imageCorrectionBlocked = cloneNode(
  'directReplyAgentflow_i10_v4_entry_blocked',
  'directReplyAgentflow_i10_v4_image_correction_blocked',
  '图片纠正输入已拦截',
  2940,
  180
)
imageCorrectionBlocked.data.inputs.directReplyMessage =
  '## 图片事实纠正未提交\n\n输入为空或包含秘密格式。系统没有调用主控模型或业务MCP。请恢复当前旅程后，仅按事实编号描述确认、纠正或拒绝。'

const imageCorrectionLlm = cloneNode(
  'llmAgentflow_i10_v3_structure',
  'llmAgentflow_i10_v4_image_correction_structure',
  '结构化图片事实决定',
  2940,
  60
)
imageCorrectionLlm.data.inputs.llmMessages = [
  { role:'system', content:'你只根据用户纠正说明，为每一条输入事实输出一个JSON决定对象。输出对象只能有factDecisions这一个顶层字段。factDecisions必须是数组；每项包含factId和decision。decision只能是CONFIRM、CORRECT、REJECT；CORRECT必须给replacementValue，另外两种不得给。不得增加或遗漏factId，不得输出秘密。' },
  { role:'user', content:'事实候选：{{$flow.state.imageFactsJson}}\n用户纠正说明：{{humanInputAgentflow_i10_v4_image_correction_input.output.conditions.0.feedback}}' }
]
imageCorrectionLlm.data.inputs.llmStructuredOutput = [{
  key:'factDecisions', type:'jsonArray', description:'覆盖全部事实的factId、decision及可选replacementValue数组'
}]
imageCorrectionLlm.data.inputs.llmUpdateState = [
  { key:'imageFactDecisionsJson', value:'{{ output.factDecisions }}' }
]

const imageCorrectionConfirm = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_image_correction_confirm',
  '确认图片事实纠正清单',
  3120,
  60
)
imageCorrectionConfirm.data.inputs.humanInputEnableFeedback = false
imageCorrectionConfirm.data.inputs.humanInputDescription =
  '## 请确认图片事实决定清单\n\n{{$flow.state.imageFactDecisionsJson}}\n\n你现在可以：\n\n- 点击 proceed（继续）：提交上方唯一决定清单，成功后图片事实才可进入案例草案。\n- 点击 reject（拒绝）：不提交，保留图片任务为待确认状态。\n\n本节点不接受自由文本。'

const imageDecisionSubmit = cloneNode(
  'toolAgentflow_image_ingest_get',
  'toolAgentflow_i10_v4_image_decision_submit',
  'MCP提交图片事实决定',
  3300,
  -40
)
imageDecisionSubmit.data.inputs.toolInputArgs = [
  { inputArgName:'imageIngestId', inputArgValue:state('imageIngestId') },
  { inputArgName:'expectedVersion', inputArgValue:state('imageIngestVersion') },
  { inputArgName:'confirmationRef', inputArgValue:'{{$flow.sessionId}}-image-facts' },
  { inputArgName:'decisions', inputArgValue:state('imageFactDecisionsJson') },
  { inputArgName:'sessionRef', inputArgValue:'{{$flow.sessionId}}-image-facts' }
]
imageDecisionSubmit.data.inputs.toolUpdateState = [
  { key:'imageIngestStatus', value:'{{ output.status }}' },
  { key:'imageIngestVersion', value:'{{ output.version }}' }
]
imageDecisionSubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('image_ingest_decision_submit')

const imageConfirmedGet = cloneNode(
  'toolAgentflow_image_ingest_get',
  'toolAgentflow_i10_v4_image_confirmed_get',
  'MCP回读已确认图片事实',
  3480,
  -40
)
imageConfirmedGet.data.inputs.toolInputArgs = [{ inputArgName:'imageIngestId', inputArgValue:state('imageIngestId') }]
imageConfirmedGet.data.inputs.toolUpdateState = [
  { key:'imageIngestStatus', value:'{{ output.status }}' },
  { key:'imageIngestVersion', value:'{{ output.version }}' },
  { key:'imageFactsJson', value:'{{ output.facts }}' },
  { key:'imagePurgeStatus', value:'{{ output.purgeStatus }}' },
  { key:'imageFactsBrief', value:'{{ output.humanBriefMarkdown }}' }
]
imageConfirmedGet.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('image_ingest_get')

const imagePendingReply = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_image_pending',
  '返回补充图片处理状态',
  2220,
  180
)
imagePendingReply.data.inputs.directReplyMessage =
  '## 补充图片任务已结束但未进入案例\n\n当前状态：{{$flow.state.imageIngestStatus}}\n\n用户已选择暂不继续，或图片分析已失败关闭。系统没有生成或确认案例草案；可在新旅程中重新提交图片。'

const imageFailedReply = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_image_failed',
  '返回补充图片失败状态',
  2220,
  240
)
imageFailedReply.data.inputs.directReplyMessage =
  '## 补充图片分析失败\n\n当前状态：{{$flow.state.imageIngestStatus}}\n\n图片没有进入案例草案。本机ONNX OCR失败时系统会直接失败关闭，不调用视觉模型、Playwright或其他模型冒充识别成功。请在新旅程中重新提交清晰且包含案例信息的图片。'

flow.nodes.push(
  imageRoute,imageRouteCondition,imageSubmit,imageWait,imageGet,imageStatus,imageFactsGate,
  imageSuggestedDecisions,imageCorrectionInput,imageCorrectionGuard,imageCorrectionSafe,
  imageCorrectionBlocked,imageCorrectionLlm,imageCorrectionConfirm,imageDecisionSubmit,
  imageConfirmedGet,imagePendingReply,imageFailedReply
)
flow.edges = flow.edges.filter(item => !['i10-v3-e02a','i10-v3-e02c'].includes(item.id))
flow.edges.push(
  edge('i10-v4-image-from-empty-session','conditionAgentflow_i10_v3_credential_session_empty','0',imageRoute.id),
  edge('i10-v4-image-from-refreshed-session','toolAgentflow_i10_v3_credential_refresh','toolAgentflow',imageRoute.id),
  edge('i10-v4-image-route-eval',imageRoute.id,'customFunctionAgentflow',imageRouteCondition.id),
  edge('i10-v4-image-route-submit',imageRouteCondition.id,'0',imageSubmit.id),
  edge('i10-v4-image-route-get',imageRouteCondition.id,'1',imageGet.id),
  edge('i10-v4-image-route-none',imageRouteCondition.id,'2','llmAgentflow_i10_v3_structure'),
  edge('i10-v4-image-submitted',imageSubmit.id,'toolAgentflow',imageWait.id),
  edge('i10-v4-image-wait-proceed',imageWait.id,'0',imageGet.id),
  edge('i10-v4-image-wait-reject',imageWait.id,'1',imagePendingReply.id),
  edge('i10-v4-image-got',imageGet.id,'toolAgentflow',imageStatus.id),
  edge('i10-v4-image-waiting-user',imageStatus.id,'0',imageFactsGate.id),
  edge('i10-v4-image-confirmed',imageStatus.id,'1','llmAgentflow_i10_v3_structure'),
  edge('i10-v4-image-failed',imageStatus.id,'2',imageFailedReply.id),
  edge('i10-v4-image-processing',imageStatus.id,'3',imageWait.id),
  edge('i10-v4-image-accept-suggested',imageFactsGate.id,'0',imageSuggestedDecisions.id),
  edge('i10-v4-image-correct',imageFactsGate.id,'1',imageCorrectionInput.id),
  edge('i10-v4-image-decisions-ready',imageSuggestedDecisions.id,'customFunctionAgentflow',imageDecisionSubmit.id),
  edge('i10-v4-image-correction-proceed',imageCorrectionInput.id,'0',imageCorrectionGuard.id),
  edge('i10-v4-image-correction-reject',imageCorrectionInput.id,'1',imagePendingReply.id),
  edge('i10-v4-image-correction-guarded',imageCorrectionGuard.id,'customFunctionAgentflow',imageCorrectionSafe.id),
  edge('i10-v4-image-correction-safe',imageCorrectionSafe.id,'0',imageCorrectionLlm.id),
  edge('i10-v4-image-correction-blocked',imageCorrectionSafe.id,'1',imageCorrectionBlocked.id),
  edge('i10-v4-image-correction-structured',imageCorrectionLlm.id,'llmAgentflow',imageCorrectionConfirm.id),
  edge('i10-v4-image-correction-confirmed',imageCorrectionConfirm.id,'0',imageDecisionSubmit.id),
  edge('i10-v4-image-correction-cancelled',imageCorrectionConfirm.id,'1',imagePendingReply.id),
  edge('i10-v4-image-decision-complete',imageDecisionSubmit.id,'toolAgentflow',imageConfirmedGet.id),
  edge('i10-v4-image-confirmed-facts-loaded',imageConfirmedGet.id,'toolAgentflow','llmAgentflow_i10_v3_structure')
)

for (const item of flow.nodes) {
  const inputs = item.data?.inputs
  if (!inputs) continue
  for (const field of ['toolUpdateState', 'llmUpdateState', 'customFunctionUpdateState']) {
    if (Array.isArray(inputs[field])) inputs[field] = inputs[field].filter(update => update.key !== 'journeyPrimaryDecision')
  }
  if (item.data.name === 'humanInputAgentflow') {
    const original = String(inputs.humanInputDescription || '')
    if (!/\bproceed\b/.test(original) || !/\breject\b/.test(original)) {
      inputs.humanInputDescription = `${original}\n\n你现在可以：\n\n- 点击 proceed（继续）：提交本节点页面所示的唯一操作。\n- 点击 reject（拒绝）：不执行该操作并保留当前安全状态。\n\n不要在这里输入账号、密码、验证码、PIN或其他秘密。`
    }
  }
}

const prepare = byId.get('toolAgentflow_i10_v3_prepare')
const mainNormalize = byId.get('customFunctionAgentflow_i10_v3_normalize')
if (!mainNormalize.data.inputs.customFunctionInputVariables.some(item => item.variableName === 'imageIngestId')) {
  mainNormalize.data.inputs.customFunctionInputVariables.push({
    variableName:'imageIngestId',
    variableValue:state('imageIngestId')
  })
}
prepare.data.inputs.toolInputArgs.push({
  inputArgName: 'interactionContractVersion',
  inputArgValue: 'v4'
})
prepare.data.inputs.toolInputArgs.push(
  { inputArgName: 'semanticAssessment', inputArgValue: state('semanticAssessmentJson') },
  { inputArgName: 'inputRevision', inputArgValue: state('caseInputRevision') }
)
prepare.data.inputs.toolUpdateState = journeyUpdates
if (!prepare.data.inputs.toolInputArgs.some(item => item.inputArgName === 'targetProfileId')) {
  prepare.data.inputs.toolInputArgs.push({ inputArgName:'targetProfileId', inputArgValue:state('targetProfileId') })
}
byId.get('toolAgentflow_i10_v3_resume').data.inputs.toolUpdateState = journeyUpdates

// The target-site MCP must never be reached directly from the draft
// normalizer.  This deterministic gate is the single authority for checking
// the persisted journey, URL, credential reference and executable case
// fields.  It deliberately has no model, filesystem, database or MCP access.
const targetProfilePrerequisite = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_target_profile_prerequisite',
  '目标站点前置门槛',
  1860,
  420
)
targetProfilePrerequisite.data.inputs.customFunctionInputVariables = [
  { variableName:'journeyStatus', variableValue:state('journeyStatus') },
  { variableName:'journeyNeedsCredential', variableValue:state('journeyNeedsCredential') },
  { variableName:'journeyMissingFields', variableValue:state('journeyMissingFields') },
  { variableName:'entryUrl', variableValue:state(draftStateKey('entryUrl')) },
  { variableName:'draftJson', variableValue:state('caseDraftJson') },
  { variableName:'credentialRef', variableValue:state('credentialRef') },
  { variableName:'targetProfileStatus', variableValue:state('targetProfileStatus') },
  { variableName:'actions', variableValue:state(draftStateKey('actions')) },
  { variableName:'expectedOutcomes', variableValue:state(draftStateKey('expectedOutcomes')) }
]
targetProfilePrerequisite.data.inputs.customFunctionJavascriptFunction = `
const parse = value => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) { try { const parsed = JSON.parse(value); return parsed; } catch {} }
  return value;
};
const fields = parse($journeyMissingFields);
const missing = Array.isArray(fields) ? fields.map(value => String(value)) : [];
const status = String($journeyStatus || '').trim().toUpperCase();
const needsCredential = String($journeyNeedsCredential || '').trim().toUpperCase();
let draft = {};
try {
  draft = typeof $draftJson === 'string' ? JSON.parse($draftJson || '{}') : ($draftJson || {});
} catch { draft = {}; }
// The normalized CaseDraft is authoritative after a URL-only correction.
// controllerDraft_* can still describe the pre-correction LLM response.
const entryUrl = String(draft.entryUrl || $entryUrl || '').trim();
const credentialRef = String($credentialRef || '').trim();
const actions = parse($actions);
const expected = parse($expectedOutcomes);
let route = 'PREPARE_TARGET_PROFILE';
let reason = '';
if (needsCredential === 'YES' || missing.includes('credentialRef') || !/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) {
  route = 'MISSING_CREDENTIAL'; reason = 'I10_CREDENTIAL_REF_REQUIRED';
} else if (!entryUrl) {
  route = 'MISSING_ENTRY_URL'; reason = 'I10_ENTRY_URL_REQUIRED';
} else {
  // Flowise CustomFunction sandboxes may not expose WHATWG URL. Keep the
  // deterministic protocol/user-info gate local and let Harness perform the
  // authoritative URL parse; use URL only when the runtime provides it.
  if (!/^https?:\\/\\/[^\\s]+$/i.test(entryUrl) || /https?:\\/\\/[^/]*@/i.test(entryUrl)) {
    route = 'MISSING_ENTRY_URL'; reason = 'I10_ENTRY_URL_INVALID';
  } else if (typeof URL === 'function') {
    try {
      const parsed = new URL(entryUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('protocol');
    } catch { route = 'MISSING_ENTRY_URL'; reason = 'I10_ENTRY_URL_INVALID'; }
  }
}
if (route === 'PREPARE_TARGET_PROFILE' && (status === 'NEEDS_INPUT' || status === '')) {
  route = 'MISSING_CASE_FIELDS'; reason = 'I10_TARGET_PROFILE_PREREQUISITES_INCOMPLETE';
}
if (route === 'PREPARE_TARGET_PROFILE' && (!Array.isArray(actions) || !actions.length || !Array.isArray(expected) || !expected.length || actions.length !== expected.length)) {
  route = 'MISSING_CASE_FIELDS'; reason = 'I10_ACTION_STEPS_INVALID';
}
if (route === 'PREPARE_TARGET_PROFILE' && String($targetProfileStatus || '').trim().toUpperCase() === 'ACTIVE') {
  route = 'TARGET_PROFILE_ALREADY_ACTIVE'; reason = 'ACTIVE';
}
return { route, reason }`
targetProfilePrerequisite.data.inputs.customFunctionUpdateState = [
  { key:'targetProfilePrerequisiteRoute', value:'{{ output.route }}' },
  { key:'targetProfilePrerequisiteReason', value:'{{ output.reason }}' }
]

const targetProfilePrerequisiteRoute = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_target_profile_prerequisite_route',
  '目标站点前置门槛路由',
  2040,
  420
)
targetProfilePrerequisiteRoute.data.inputs.conditions = [
  { type:'string', value1:state('targetProfilePrerequisiteRoute'), operation:'equal', value2:'MISSING_CREDENTIAL' },
  { type:'string', value1:state('targetProfilePrerequisiteRoute'), operation:'equal', value2:'MISSING_ENTRY_URL' },
  { type:'string', value1:state('targetProfilePrerequisiteRoute'), operation:'equal', value2:'MISSING_CASE_FIELDS' },
  { type:'string', value1:state('targetProfilePrerequisiteRoute'), operation:'equal', value2:'PREPARE_TARGET_PROFILE' },
  { type:'string', value1:state('targetProfilePrerequisiteRoute'), operation:'equal', value2:'TARGET_PROFILE_ALREADY_ACTIVE' }
]
targetProfilePrerequisiteRoute.data.outputAnchors = [
  { label:'缺少凭据', name:'0' }, { label:'缺少入口地址', name:'1' },
  { label:'缺少案例字段', name:'2' }, { label:'准备目标站点', name:'3' },
  { label:'已有有效档案', name:'4' }
]

const targetProfilePrepare = cloneNode(
  'toolAgentflow_prepare',
  'toolAgentflow_i10_v4_target_profile_prepare',
  'MCP准备目标站点档案',
  1860,
  260
)
targetProfilePrepare.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('target_profile_prepare')
targetProfilePrepare.data.inputs.toolInputArgs = [
  { inputArgName:'displayName', inputArgValue:state(draftStateKey('targetSystem')) },
  { inputArgName:'launchUrl', inputArgValue:state(draftStateKey('entryUrl')) },
  { inputArgName:'credentialRef', inputArgValue:state('credentialRef') },
  { inputArgName:'tlsPolicy', inputArgValue:'STRICT' },
  { inputArgName:'sessionRef', inputArgValue:'{{$flow.sessionId}}' }
]
targetProfilePrepare.data.inputs.toolUpdateState = [
  { key:'targetProfileId', value:'{{ output.targetProfileId }}' },
  { key:'targetProfileVersion', value:'{{ output.version }}' },
  { key:'targetProfileHash', value:'{{ output.profileHash }}' },
  { key:'targetProfileStatus', value:'{{ output.status }}' },
  { key:'targetProfileLaunchUrl', value:'{{ output.launchUrl }}' },
  { key:'targetProfileSnapshot', value:'{{ output }}' }
]
const targetProfileConfirm = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_target_profile_confirm',
  '确认目标站点边界',
  2040,
  260
)
targetProfileConfirm.data.inputs.humanInputEnableFeedback = false
targetProfileConfirm.data.inputs.humanInputDescription =
  '## 请确认目标站点\n\n名称：{{$flow.state.controllerDraft_targetSystem}}\n\n启动地址：{{$flow.state.targetProfileLaunchUrl}}\n\n系统将只在该站点档案允许的HTTP/HTTPS来源内导航和交互，跨来源跳转会失败关闭。\n\n你现在可以：\n\n- 点击 proceed（继续）：冻结该目标站点并进入案例准备。\n- 点击 reject（拒绝）：拒绝该目标站点，本次案例不会进入作者化。\n\n本节点不接受自由文本。'
const targetProfileApprove = cloneNode(
  'toolAgentflow_prepare',
  'toolAgentflow_i10_v4_target_profile_approve',
  'MCP批准目标站点',
  2220,
  220
)
targetProfileApprove.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('target_profile_decision_submit')
targetProfileApprove.data.inputs.toolInputArgs = [
  { inputArgName:'targetProfileId', inputArgValue:state('targetProfileId') },
  { inputArgName:'expectedVersion', inputArgValue:state('targetProfileVersion') },
  { inputArgName:'decision', inputArgValue:'APPROVE' },
  { inputArgName:'confirmationRef', inputArgValue:'{{$flow.sessionId}}-target-profile-approve' },
  { inputArgName:'sessionRef', inputArgValue:'{{$flow.sessionId}}' }
]
targetProfileApprove.data.inputs.toolUpdateState = targetProfilePrepare.data.inputs.toolUpdateState
const targetProfileReject = cloneNode(
  'toolAgentflow_prepare',
  'toolAgentflow_i10_v4_target_profile_reject',
  'MCP拒绝目标站点',
  2220,
  320
)
targetProfileReject.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('target_profile_decision_submit')
targetProfileReject.data.inputs.toolInputArgs = [
  { inputArgName:'targetProfileId', inputArgValue:state('targetProfileId') },
  { inputArgName:'expectedVersion', inputArgValue:state('targetProfileVersion') },
  { inputArgName:'decision', inputArgValue:'REJECT' },
  { inputArgName:'confirmationRef', inputArgValue:'{{$flow.sessionId}}-target-profile-reject' },
  { inputArgName:'sessionRef', inputArgValue:'{{$flow.sessionId}}' }
]
targetProfileReject.data.inputs.toolUpdateState = targetProfilePrepare.data.inputs.toolUpdateState
const targetProfileGet = cloneNode(
  'toolAgentflow_prepare',
  'toolAgentflow_i10_v4_target_profile_get',
  'MCP回读已冻结目标站点',
  2400,
  220
)
targetProfileGet.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('target_profile_get')
targetProfileGet.data.inputs.toolInputArgs = [
  { inputArgName:'targetProfileId', inputArgValue:state('targetProfileId') }
]
targetProfileGet.data.inputs.toolUpdateState = targetProfilePrepare.data.inputs.toolUpdateState
const targetProfileRejected = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_target_profile_rejected',
  '目标站点已拒绝',
  2400,
  320
)
targetProfileRejected.data.inputs.directReplyMessage =
  '## 已拒绝目标站点\n\n本次案例没有进入作者化，也没有访问该网站。请在新请求中提供正确的HTTP或HTTPS入口地址。'
// Flowise execution graphs do not safely re-enter an already completed Human
// Input node. A prerequisite inconsistency must be visible and fail closed,
// rather than silently terminating on a loop back to the initial input node.
const targetProfileContextIncomplete = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_target_profile_context_incomplete',
  '目标站点上下文未完成',
  2220,
  460
)
targetProfileContextIncomplete.data.inputs.directReplyMessage =
  '## 案例上下文未完成\n\n系统检测到案例状态与目标站点准备条件不一致，因此没有访问网站、没有生成脚本，也没有静默结束。请在对话框重新提交当前案例；若只缺入口地址，请在下一次提示的 feedback 中仅填写完整的 HTTP 或 HTTPS 地址。'
flow.nodes.push(targetProfilePrerequisite, targetProfilePrerequisiteRoute, targetProfilePrepare, targetProfileConfirm, targetProfileApprove, targetProfileReject, targetProfileGet, targetProfileRejected, targetProfileContextIncomplete)
flow.edges = flow.edges.filter(item =>
  !(item.source === mainNormalize.id && item.target === prepare.id) &&
  !(item.source === mainNormalize.id && item.target === targetProfilePrepare.id) &&
  item.id !== 'i10-v3-e07'
)
flow.edges.push(
  edge('i10-v4-normalize-to-journey-prepare', mainNormalize.id, 'customFunctionAgentflow', prepare.id),
  edge('i10-v4-needs-input-to-target-gate', 'conditionAgentflow_i10_v3_needs_input', '1', targetProfilePrerequisite.id),
  edge('i10-v4-target-gate-route', targetProfilePrerequisite.id, 'customFunctionAgentflow', targetProfilePrerequisiteRoute.id),
  edge('i10-v4-target-gate-missing-credential', targetProfilePrerequisiteRoute.id, '0', 'toolAgentflow_i10_v3_credential_create'),
  edge('i10-v4-target-gate-missing-url', targetProfilePrerequisiteRoute.id, '1', targetProfileContextIncomplete.id),
  edge('i10-v4-target-gate-missing-fields', targetProfilePrerequisiteRoute.id, '2', targetProfileContextIncomplete.id),
  edge('i10-v4-target-gate-prepare', targetProfilePrerequisiteRoute.id, '3', targetProfilePrepare.id),
  edge('i10-v4-target-gate-active', targetProfilePrerequisiteRoute.id, '4', 'conditionAgentflow_i10_v3_awaiting_user'),
  edge('i10-v4-target-profile-prepared', targetProfilePrepare.id, 'toolAgentflow', targetProfileConfirm.id),
  edge('i10-v4-target-profile-approved', targetProfileConfirm.id, '0', targetProfileApprove.id),
  edge('i10-v4-target-profile-rejected', targetProfileConfirm.id, '1', targetProfileReject.id),
  edge('i10-v4-target-profile-readback', targetProfileApprove.id, 'toolAgentflow', targetProfileGet.id),
  edge('i10-v4-target-profile-continue', targetProfileGet.id, 'toolAgentflow', prepare.id),
  edge('i10-v4-target-profile-stop', targetProfileReject.id, 'toolAgentflow', targetProfileRejected.id)
)
const authoringSubmit = byId.get('toolAgentflow_submit')
for (const [inputArgName, inputArgValue] of Object.entries({
  route: state('targetProfileLaunchUrl'),
  executionProfile: 'GENERIC_WEB',
  targetProfileId: state('targetProfileId'),
  targetProfileVersion: state('targetProfileVersion'),
  targetProfileHash: state('targetProfileHash'),
  targetProfileSnapshot: state('targetProfileSnapshot')
})) {
  const existing = authoringSubmit.data.inputs.toolInputArgs.find(item => item.inputArgName === inputArgName)
  if (existing) existing.inputArgValue = inputArgValue
  else authoringSubmit.data.inputs.toolInputArgs.push({ inputArgName, inputArgValue })
}
const casePrepare = byId.get('toolAgentflow_prepare')
if (!casePrepare.data.inputs.toolInputArgs.some(item => item.inputArgName === 'journeyId')) {
  casePrepare.data.inputs.toolInputArgs.push({
    inputArgName:'journeyId',
    inputArgValue:state('journeyId')
  })
}

const exactDecision = byId.get('humanInputAgentflow_i10_v3_decision')
exactDecision.data.label = '确认唯一冻结提案'
exactDecision.data.inputs.humanInputEnableFeedback = false
exactDecision.data.inputs.humanInputDescription =
  '## 请确认唯一方案\n\n{{$flow.state.journeyProposalSummary}}\n\n执行影响：{{$flow.state.journeyProposalEffect}}\n\n拒绝影响：{{$flow.state.journeyProposalRejectEffect}}\n\n你现在可以：\n\n- 点击 proceed（继续）：执行上方唯一且已冻结的方案。\n- 点击 reject（拒绝）：按“拒绝影响”处理，不会自动选择其他业务动作。\n\n本节点不接受自由文本。不要输入账号、密码、验证码、PIN或其他秘密。'

const approve = byId.get('toolAgentflow_i10_v3_approve')
approve.data.label = 'MCP提交冻结提案批准决定'
approve.data.inputs.toolInputArgs = [
  { inputArgName: 'journeyId', inputArgValue: state('journeyId') },
  { inputArgName: 'expectedVersion', inputArgValue: state('journeyVersion') },
  { inputArgName: 'decision', inputArgValue: state('journeyProceedDecision') },
  { inputArgName: 'proposalId', inputArgValue: state('journeyProposalId') },
  { inputArgName: 'payloadHash', inputArgValue: state('journeyProposalPayloadHash') },
  { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}' },
  { inputArgName: 'payload', inputArgValue: '{}' },
  { inputArgName: 'reason', inputArgValue: '用户通过proceed批准页面所示唯一冻结提案' },
  { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
]
approve.data.inputs.toolUpdateState = journeyUpdates

const reject = byId.get('toolAgentflow_i10_v3_reject')
reject.data.label = 'MCP提交冻结提案拒绝决定'
reject.data.inputs.toolInputArgs = [
  { inputArgName: 'journeyId', inputArgValue: state('journeyId') },
  { inputArgName: 'expectedVersion', inputArgValue: state('journeyVersion') },
  { inputArgName: 'decision', inputArgValue: state('journeyRejectDecision') },
  { inputArgName: 'proposalId', inputArgValue: state('journeyProposalId') },
  { inputArgName: 'payloadHash', inputArgValue: state('journeyProposalPayloadHash') },
  { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}' },
  { inputArgName: 'payload', inputArgValue: '{}' },
  { inputArgName: 'reason', inputArgValue: '用户通过reject拒绝页面所示唯一冻结提案' },
  { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
]
reject.data.inputs.toolUpdateState = journeyUpdates

// 案例草案 reject 不是取消：进入一次明确修订并再次确认。
const rejectRoute = cloneNode(
  'conditionAgentflow_i10_v3_awaiting_user',
  'conditionAgentflow_i10_v4_reject_route',
  '拒绝后是否进入案例修订',
  3060,
  380
)
rejectRoute.data.inputs.conditions = [{
  type: 'string',
  value1: state('journeyStage'),
  operation: 'equal',
  value2: 'NEEDS_INPUT'
}]
rejectRoute.data.outputAnchors = [{ label: '修订案例', name: '0' }, { label: '保留或取消', name: '1' }]

const correctionInput = cloneNode(
  'humanInputAgentflow_run',
  'humanInputAgentflow_i10_v4_case_correction',
  '输入案例修订内容',
  3240,
  360
)
correctionInput.data.inputs.humanInputEnableFeedback = true
correctionInput.data.inputs.humanInputDescription =
  '## 请说明要修改的案例内容\n\n示例：将入口地址改为 http://127.0.0.1:18082/portal/login；把第6步改为“检查右上角姓名和头像”。\n\n你现在可以：\n\n- 填写修订内容后点击 proceed（继续）：只提交这段文字进行安全检查、结构化和确定性校验，不会立即执行案例。\n- 点击 reject（拒绝）：放弃本次修订并保留原草案，不会写入正式案例。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'

const correctionGuard = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_case_correction_guard',
  '校验当前修订反馈',
  3420,
  360
)
correctionGuard.data.inputs.customFunctionJavascriptFunction = `
const text = String($feedback ?? '').trim();
const secret = /(?:账号|用户名|密码|口令|验证码|PIN|U盾密码)\\s*[:：=]\\s*\\S+/i.test(text);
return {
  safe: text.length > 0 && !secret ? 'YES' : 'NO',
  feedback: text.length > 0 && !secret ? text : '',
  reason: text.length === 0 ? 'I10_INPUT_REQUIRED' : (secret ? 'I10_SECRET_INPUT_FORBIDDEN' : '')
};`
correctionGuard.data.inputs.customFunctionInputVariables = [{
  variableName: 'feedback',
  variableValue: '{{humanInputAgentflow_i10_v4_case_correction.output.conditions.0.feedback}}'
}]
correctionGuard.data.inputs.customFunctionUpdateState = [
  { key: 'interactionFeedbackSafe', value: '{{ output.safe }}' },
  { key: 'interactionFeedback', value: '{{ output.feedback }}' }
]

const correctionSafe = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_case_correction_safe',
  '修订内容是否安全完整',
  3600,
  360
)
correctionSafe.data.inputs.conditions = [{
  type: 'string',
  value1: state('interactionFeedbackSafe'),
  operation: 'equal',
  value2: 'YES'
}]
correctionSafe.data.outputAnchors = [{ label: '通过', name: '0' }, { label: '拦截', name: '1' }]

const correctionBlocked = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_case_correction_blocked',
  '修订输入安全拦截',
  3780,
  480
)
correctionBlocked.data.inputs.directReplyMessage =
  '## 修订内容未提交\n\n输入为空，或包含账号、密码、验证码、PIN等秘密。系统未调用主控模型或业务MCP。\n\n请重新进入案例修订，并只描述业务步骤、入口地址或预期结果。'

const correctionLlm = cloneNode(
  'llmAgentflow_i10_v3_structure',
  'llmAgentflow_i10_v4_case_correction',
  '合并案例修订',
  3780,
  340
)
correctionLlm.data.inputs.llmMessages = [
  {
    role: 'system',
    content: `你只把用户修订合并进现有案例草案。不得生成credentialRef，不得要求元素定位器，不得增加用户未表达的秘密。${caseDraftJsonContract}`
  },
  {
    role: 'user',
    content: '现有案例草案：{{$flow.state.caseDraftJson}}\n本次已通过安全检查的修订：{{$flow.state.interactionFeedback}}'
  }
]
correctionLlm.data.inputs.llmUpdateState = draftFieldNames.map(field => ({
  key: draftStateKey(field),
  value: `{{ output.${field} }}`
}))

const correctionNormalize = cloneNode(
  'customFunctionAgentflow_i10_v3_normalize',
  'customFunctionAgentflow_i10_v4_case_correction_normalize',
  '规范化修订后案例',
  3960,
  340
)
correctionNormalize.data.inputs.customFunctionJavascriptFunction = structuredDraftNormalizerSource()
correctionNormalize.data.inputs.customFunctionInputVariables = [
  ...draftFieldNames.map(field => ({
    variableName: field,
    variableValue: state(draftStateKey(field))
  })),
  { variableName: 'credentialRef', variableValue: state('credentialRef') },
  { variableName: 'naturalLanguage', variableValue: '{{$flow.state.accumulatedCaseInput}}\n{{$flow.state.interactionFeedback}}' },
  { variableName: 'imageIngestId', variableValue: state('imageIngestId') },
  { variableName: 'imageFactsJson', variableValue: state('imageFactsJson') },
  { variableName: 'priorDraft', variableValue: state('caseDraftJson') }
]
correctionNormalize.data.inputs.customFunctionUpdateState = [
  { key: 'caseDraftJson', value: '{{ output.draftJson }}' },
  { key: 'draftDisplayJson', value: '{{ output.displayJson }}' },
  { key: 'semanticAssessmentJson', value: '{{ output.semanticAssessmentJson }}' }
]

const correctionSubmit = cloneNode(
  'toolAgentflow_i10_v3_approve',
  'toolAgentflow_i10_v4_case_correction_submit',
  'MCP提交规范化案例修订',
  4140,
  340
)
correctionSubmit.data.inputs.toolInputArgs = [
  { inputArgName: 'journeyId', inputArgValue: state('journeyId') },
  { inputArgName: 'expectedVersion', inputArgValue: state('journeyVersion') },
  { inputArgName: 'inputKind', inputArgValue: 'CASE_CORRECTION' },
  { inputArgName: 'normalizedInput', inputArgValue: state('caseDraftJson') },
  { inputArgName: 'submissionRef', inputArgValue: '{{$flow.sessionId}}-case-correction' },
  { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
]
correctionSubmit.data.inputs.toolUpdateState = journeyUpdates
correctionSubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_input_submit')

const reconfirm = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_case_reconfirm',
  '再次确认修订后案例',
  4320,
  340
)
reconfirm.data.inputs.humanInputDescription = exactDecision.data.inputs.humanInputDescription

const reapprove = cloneNode(
  'toolAgentflow_i10_v3_approve',
  'toolAgentflow_i10_v4_case_reapprove',
  'MCP批准修订后案例',
  4500,
  300
)
reapprove.data.inputs = structuredClone(approve.data.inputs)
const rereject = cloneNode(
  'toolAgentflow_i10_v3_reject',
  'toolAgentflow_i10_v4_case_rereject',
  'MCP放弃修订后案例',
  4500,
  420
)
rereject.data.inputs = structuredClone(reject.data.inputs)

flow.nodes.push(
  rejectRoute, correctionInput, correctionGuard, correctionSafe, correctionBlocked,
  correctionLlm, correctionNormalize, correctionSubmit, reconfirm, reapprove, rereject
)
flow.edges = flow.edges.filter(item => item.id !== 'i10-v3-e13')
flow.edges.push(
  edge('i10-v4-reject-route', reject.id, 'toolAgentflow', rejectRoute.id),
  edge('i10-v4-reject-correct', rejectRoute.id, '0', correctionInput.id),
  edge('i10-v4-reject-card', rejectRoute.id, '1', 'directReplyAgentflow_i10_v3_card'),
  edge('i10-v4-correction-proceed', correctionInput.id, '0', correctionGuard.id),
  edge('i10-v4-correction-reject', correctionInput.id, '1', 'directReplyAgentflow_i10_v3_card'),
  edge('i10-v4-correction-safe-check', correctionGuard.id, 'customFunctionAgentflow', correctionSafe.id),
  edge('i10-v4-correction-safe', correctionSafe.id, '0', correctionLlm.id),
  edge('i10-v4-correction-blocked', correctionSafe.id, '1', correctionBlocked.id),
  edge('i10-v4-correction-merge', correctionLlm.id, 'llmAgentflow', correctionNormalize.id),
  edge('i10-v4-correction-normalize', correctionNormalize.id, 'customFunctionAgentflow', correctionSubmit.id),
  edge('i10-v4-correction-submit', correctionSubmit.id, 'toolAgentflow', reconfirm.id),
  edge('i10-v4-correction-reapprove', reconfirm.id, '0', reapprove.id),
  edge('i10-v4-correction-rereject', reconfirm.id, '1', rereject.id),
  edge('i10-v4-correction-approved', reapprove.id, 'toolAgentflow', 'conditionAgentflow_i10_v3_approve_case_route'),
  edge('i10-v4-correction-rejected', rereject.id, 'toolAgentflow', 'directReplyAgentflow_i10_v3_card')
)

// INITIAL_CASE_INPUT stays inside the current journey. Proceed only submits
// feedback for deterministic validation; it never approves or executes work.
const initialInput = cloneNode(
  'humanInputAgentflow_run',
  'humanInputAgentflow_i10_v4_initial_case_input',
  '补充当前案例缺口',
  2340,
  80
)
initialInput.data.inputs.humanInputEnableFeedback = true
initialInput.data.inputs.humanInputDescription =
  '## 当前案例仍缺少必要信息\n\n{{$flow.state.journeyNextActionText}}\n\n本轮只需补充上方列出的内容。不要重复填写已经确认的业务目标、操作步骤、预期结果或本机安全凭据。\n\n如果上方只缺少入口地址，请在 feedback 输入框填写完整地址，例如：`http://127.0.0.1:18082/portal/login`。\n\n你现在可以：\n\n- 在 feedback 填写内容后点击 proceed（继续）：只提交本次文字进行安全检查、结构化和确定性校验；不会立即写入正式案例。\n- 点击 reject（拒绝）：结束本次补充并保留当前未完成旅程。\n\n不要输入账号、密码、验证码、PIN或API Key。'

const initialGuard = cloneNode(
  'customFunctionAgentflow_i10_v4_entry_secret_guard',
  'customFunctionAgentflow_i10_v4_initial_case_guard',
  '校验初始案例补充',
  2520,
  80
)
initialGuard.data.inputs.customFunctionInputVariables = [{
  variableName: 'rawInput',
  variableValue: '{{humanInputAgentflow_i10_v4_initial_case_input.output.conditions.0.feedback}}'
}]
initialGuard.data.inputs.customFunctionUpdateState = [
  { key: 'interactionFeedbackSafe', value: '{{ output.safe }}' },
  { key: 'interactionFeedback', value: '{{ output.feedback }}' }
]

const initialSafe = cloneNode(
  'conditionAgentflow_i10_v4_entry_safe',
  'conditionAgentflow_i10_v4_initial_case_safe',
  '初始补充是否安全完整',
  2700,
  80
)
initialSafe.data.inputs.conditions = [{
  type: 'string',
  value1: state('interactionFeedbackSafe'),
  operation: 'equal',
  value2: 'YES'
}]

const initialBlocked = cloneNode(
  'directReplyAgentflow_i10_v4_entry_blocked',
  'directReplyAgentflow_i10_v4_initial_case_blocked',
  '初始补充安全拦截',
  2880,
  180
)
initialBlocked.data.inputs.directReplyMessage =
  '## 补充内容未提交\n\n输入为空，或含有账号、密码、验证码、PIN、API Key等秘密。系统没有调用主控模型或业务MCP。\n\n请重新恢复当前旅程，并只补充业务信息。'

// A single valid HTTP(S) URL is a deterministic field update. Do not make a
// model call merely to merge it into an otherwise complete CaseDraft.
const initialRouteDetect = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_initial_input_route_detect',
  '判断初始补充类型',
  2880,
  40
)
initialRouteDetect.data.inputs.customFunctionJavascriptFunction = `
const text = String($feedback || '').trim();
const urls = text.match(/https?:\\/\\/[^\\s，。；]+/gi) || [];
let residue = text;
for (const url of urls) residue = residue.replace(url, '');
residue = residue
  .replace(/(?:入口(?:地址)?|网站地址|网址|url)\\s*(?:是|为)?/ig, '')
  .replace(/[\\s:：，。；]+/g, '');
let entryUrl = '';
if (urls.length === 1 && residue.length === 0) {
  const candidate = urls[0];
  if (/^https?:\\/\\/[^\\s]+$/i.test(candidate) && !/https?:\\/\\/[^/]*@/i.test(candidate)) entryUrl = candidate;
}
return { route: entryUrl ? 'URL_ONLY' : 'COMPLEX', entryUrl };`
initialRouteDetect.data.inputs.customFunctionInputVariables = [
  { variableName: 'feedback', variableValue: state('interactionFeedback') }
]
initialRouteDetect.data.inputs.customFunctionUpdateState = [
  { key: 'initialInputRoute', value: '{{ output.route }}' },
  { key: 'initialEntryUrl', value: '{{ output.entryUrl }}' }
]

const initialRoute = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_initial_input_route',
  '选择初始补充处理路径',
  3060,
  40
)
initialRoute.data.inputs.conditions = [
  { type: 'string', value1: state('initialInputRoute'), operation: 'equal', value2: 'URL_ONLY' }
]
initialRoute.data.outputAnchors = [
  { label: '仅入口地址', name: '0' }, { label: '复杂补充', name: '1' }
]

const initialUrlMerge = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_initial_url_merge',
  '合并入口地址补充',
  3240,
  -60
)
initialUrlMerge.data.inputs.customFunctionJavascriptFunction = `
let draft = {};
try { draft = typeof $draftJson === 'string' ? JSON.parse($draftJson) : ($draftJson || {}); } catch { draft = {}; }
let semanticAssessment = {};
try { semanticAssessment = typeof $semanticAssessmentJson === 'string' ? JSON.parse($semanticAssessmentJson) : ($semanticAssessmentJson || {}); } catch { semanticAssessment = {}; }
const entryUrl = String($entryUrl || '').trim();
if (!entryUrl) throw new Error('I10_ENTRY_URL_REQUIRED');
if (!/^https?:\\/\\/[^\\s]+$/i.test(entryUrl) || /https?:\\/\\/[^/]*@/i.test(entryUrl)) throw new Error('I10_ENTRY_URL_INVALID');
draft = { ...draft, entryUrl };
draft.missingFields = Array.isArray(draft.missingFields)
  ? draft.missingFields.filter(field => !/(entryurl|入口.*(?:url|地址)|门户网站.*(?:url|地址))/i.test(String(field)))
  : [];
const unresolved = Array.isArray(semanticAssessment.unresolvedRequirements)
  ? semanticAssessment.unresolvedRequirements.filter(item => !/(entryurl|入口.*(?:url|地址)|门户网站.*(?:url|地址))/i.test(JSON.stringify(item)))
  : [];
semanticAssessment = { ...semanticAssessment, unresolvedRequirements: unresolved };
if (unresolved.length === 0) semanticAssessment.verdict = 'COMPLETE';
const prior = String($accumulatedCaseInput || $priorNaturalLanguage || '').trim();
const feedback = String($feedback || '').trim();
const segments = [prior];
if (feedback && !segments.includes(feedback)) segments.push(feedback);
const accumulatedCaseInput = segments.filter(Boolean).join('\\n').slice(0,8000);
const inputRevision = Math.max(1, Number($caseInputRevision || 0) + 1);
const display = {
  caseTitle: String(draft.title || draft.caseTitle || '').trim(),
  objective: String(draft.objective || '').trim(),
  targetSystem: String(draft.targetSystem || '').trim(),
  entryUrl,
  actions: Array.isArray(draft.steps) ? draft.steps.map(step => String(step?.action || '')).filter(Boolean) : [],
  expectedOutcomes: Array.isArray(draft.steps) ? draft.steps.map(step => String(step?.expected || '')).filter(Boolean) : [],
  assertions: Array.isArray(draft.assertions) ? draft.assertions : [],
  credentialStatus: String($credentialRef || '').trim() ? 'READY_BY_REFERENCE' : 'MISSING',
  verificationRequirements: Array.isArray(draft.verificationRequirements) ? draft.verificationRequirements : []
};
const normalized = {
  inputType: String($inputType || 'NATURAL_LANGUAGE'),
  naturalLanguage: accumulatedCaseInput,
  entryUrl,
  targetSystem: String(draft.targetSystem || '').trim(),
  credentialRef: String($credentialRef || '').trim(),
  draftJson: draft,
  semanticAssessment,
  inputRevision
};
return {
  normalizedInput: JSON.stringify(normalized),
  draftJson: JSON.stringify(draft),
  displayJson: JSON.stringify(display),
  semanticAssessmentJson: JSON.stringify(semanticAssessment),
  entryUrl,
  missingFields: JSON.stringify(draft.missingFields || []),
  accumulatedCaseInput,
  inputRevision
};`
initialUrlMerge.data.inputs.customFunctionInputVariables = [
  { variableName: 'draftJson', variableValue: state('caseDraftJson') },
  { variableName: 'semanticAssessmentJson', variableValue: state('semanticAssessmentJson') },
  { variableName: 'entryUrl', variableValue: state('initialEntryUrl') },
  { variableName: 'inputType', variableValue: state('inputType') },
  { variableName: 'priorNaturalLanguage', variableValue: state('naturalLanguage') },
  { variableName: 'accumulatedCaseInput', variableValue: state('accumulatedCaseInput') },
  { variableName: 'caseInputRevision', variableValue: state('caseInputRevision') },
  { variableName: 'feedback', variableValue: state('interactionFeedback') },
  { variableName: 'credentialRef', variableValue: state('credentialRef') }
]
initialUrlMerge.data.inputs.customFunctionUpdateState = [
  { key: 'initialNormalizedInput', value: '{{ output.normalizedInput }}' },
  { key: 'caseDraftJson', value: '{{ output.draftJson }}' },
  { key: 'draftDisplayJson', value: '{{ output.displayJson }}' },
  { key: 'semanticAssessmentJson', value: '{{ output.semanticAssessmentJson }}' },
  { key: draftStateKey('entryUrl'), value: '{{ output.entryUrl }}' },
  { key: draftStateKey('missingFields'), value: '{{ output.missingFields }}' },
  { key: 'accumulatedCaseInput', value: '{{ output.accumulatedCaseInput }}' },
  { key: 'caseInputRevision', value: '{{ output.inputRevision }}' },
  { key: 'naturalLanguage', value: '{{ output.accumulatedCaseInput }}' }
]

const initialLlm = cloneNode(
  'llmAgentflow_i10_v3_structure',
  'llmAgentflow_i10_v4_initial_case_structure',
  '合并初始案例补充',
  2880,
  40
)
initialLlm.data.inputs.llmMessages = [
  {
    role: 'system',
    content: `你只把本次安全补充合并为完整案例草案候选。不得生成credentialRef，不得要求元素定位器，不得增加用户未表达的秘密。保持已有案例事实。${caseDraftJsonContract}`
  },
  {
    role: 'user',
    content: '已有案例草案：{{$flow.state.caseDraftJson}}\n已有案例描述：{{$flow.state.naturalLanguage}}\n本次已通过本地秘密检查的补充：{{$flow.state.interactionFeedback}}'
  }
]
initialLlm.data.inputs.llmUpdateState = draftFieldNames.map(field => ({
  key: draftStateKey(field),
  value: `{{ output.${field} }}`
}))

const initialNormalize = cloneNode(
  'customFunctionAgentflow_i10_v3_normalize',
  'customFunctionAgentflow_i10_v4_initial_case_normalize',
  '规范化初始案例补充',
  3060,
  40
)
initialNormalize.data.inputs.customFunctionJavascriptFunction = structuredDraftNormalizerSource()
initialNormalize.data.inputs.customFunctionInputVariables = [
  ...draftFieldNames.map(field => ({
    variableName: field,
    variableValue: state(draftStateKey(field))
  })),
  { variableName: 'credentialRef', variableValue: state('credentialRef') },
  { variableName: 'naturalLanguage', variableValue: '{{$flow.state.naturalLanguage}}\n{{$flow.state.interactionFeedback}}' },
  { variableName: 'imageIngestId', variableValue: state('imageIngestId') },
  { variableName: 'imageFactsJson', variableValue: state('imageFactsJson') },
  { variableName: 'priorDraft', variableValue: state('caseDraftJson') }
]
initialNormalize.data.inputs.customFunctionUpdateState = [
  { key: 'caseDraftJson', value: '{{ output.draftJson }}' },
  { key: 'draftDisplayJson', value: '{{ output.displayJson }}' },
  { key: 'semanticAssessmentJson', value: '{{ output.semanticAssessmentJson }}' }
]

const initialAssemble = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_initial_case_assemble',
  '形成初始补充提交对象',
  3240,
  40
)
initialAssemble.data.inputs.customFunctionJavascriptFunction = `
let draft = {};
try { draft = typeof $draftJson === 'string' ? JSON.parse($draftJson) : ($draftJson || {}); } catch { draft = {}; }
let semanticAssessment = {};
try { semanticAssessment = typeof $semanticAssessmentJson === 'string' ? JSON.parse($semanticAssessmentJson) : ($semanticAssessmentJson || {}); } catch { semanticAssessment = {}; }
const controlOnly = /^(继续|恢复|查询当前进度|proceed)$/i;
const prior = String($accumulatedCaseInput || $priorNaturalLanguage || '').trim();
const feedback = String($feedback || '').trim();
const segments = [prior];
if (feedback && !controlOnly.test(feedback) && !segments.includes(feedback)) segments.push(feedback);
const accumulatedCaseInput = segments.filter(Boolean).join('\\n').slice(0,8000);
const inputRevision = Math.max(1, Number($caseInputRevision || 0) + (feedback && !controlOnly.test(feedback) ? 1 : 0));
const normalized = {
  inputType: String($inputType || 'NATURAL_LANGUAGE'),
  naturalLanguage: accumulatedCaseInput,
  entryUrl: String(draft.entryUrl || '').trim(),
  targetSystem: String(draft.targetSystem || '').trim(),
  credentialRef: String($credentialRef || '').trim(),
  draftJson: draft,
  semanticAssessment,
  inputRevision
};
return { normalizedInput: JSON.stringify(normalized), accumulatedCaseInput, inputRevision };`
initialAssemble.data.inputs.customFunctionInputVariables = [
  { variableName: 'draftJson', variableValue: state('caseDraftJson') },
  { variableName: 'semanticAssessmentJson', variableValue: state('semanticAssessmentJson') },
  { variableName: 'inputType', variableValue: state('inputType') },
  { variableName: 'priorNaturalLanguage', variableValue: state('naturalLanguage') },
  { variableName: 'accumulatedCaseInput', variableValue: state('accumulatedCaseInput') },
  { variableName: 'caseInputRevision', variableValue: state('caseInputRevision') },
  { variableName: 'feedback', variableValue: state('interactionFeedback') },
  { variableName: 'credentialRef', variableValue: state('credentialRef') }
]
initialAssemble.data.inputs.customFunctionUpdateState = [
  { key: 'initialNormalizedInput', value: '{{ output.normalizedInput }}' },
  { key: 'accumulatedCaseInput', value: '{{ output.accumulatedCaseInput }}' },
  { key: 'caseInputRevision', value: '{{ output.inputRevision }}' },
  { key: 'naturalLanguage', value: '{{ output.accumulatedCaseInput }}' }
]

const initialSubmit = cloneNode(
  'toolAgentflow_i10_v4_case_correction_submit',
  'toolAgentflow_i10_v4_initial_case_submit',
  'MCP提交初始案例补充',
  3420,
  40
)
initialSubmit.data.inputs.toolInputArgs = [
  { inputArgName: 'journeyId', inputArgValue: state('journeyId') },
  { inputArgName: 'expectedVersion', inputArgValue: state('journeyVersion') },
  { inputArgName: 'inputKind', inputArgValue: 'INITIAL_CASE_INPUT' },
  { inputArgName: 'normalizedInput', inputArgValue: state('initialNormalizedInput') },
  { inputArgName: 'submissionRef', inputArgValue: '{{$flow.sessionId}}-initial-case-input' },
  { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
]
initialSubmit.data.inputs.toolUpdateState = journeyUpdates
initialSubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_input_submit')

flow.nodes.push(
  initialInput, initialGuard, initialSafe, initialBlocked,
  initialRouteDetect, initialRoute, initialUrlMerge,
  initialLlm, initialNormalize, initialAssemble, initialSubmit
)
flow.edges = flow.edges.filter(item => item.id !== 'i10-v3-e06d')
flow.edges.push(
  edge('i10-v4-initial-enter', 'conditionAgentflow_i10_v3_needs_credential', '1', initialInput.id),
  edge('i10-v4-initial-proceed', initialInput.id, '0', initialGuard.id),
  edge('i10-v4-initial-reject', initialInput.id, '1', 'directReplyAgentflow_i10_v3_card'),
  edge('i10-v4-initial-guarded', initialGuard.id, 'customFunctionAgentflow', initialSafe.id),
  edge('i10-v4-initial-safe', initialSafe.id, '0', initialRouteDetect.id),
  edge('i10-v4-initial-blocked', initialSafe.id, '1', initialBlocked.id),
  edge('i10-v4-initial-route-detected', initialRouteDetect.id, 'customFunctionAgentflow', initialRoute.id),
  edge('i10-v4-initial-route-url-only', initialRoute.id, '0', initialUrlMerge.id),
  edge('i10-v4-initial-route-complex', initialRoute.id, '1', initialLlm.id),
  edge('i10-v4-initial-url-merged', initialUrlMerge.id, 'customFunctionAgentflow', initialSubmit.id),
  edge('i10-v4-initial-structured', initialLlm.id, 'llmAgentflow', initialNormalize.id),
  edge('i10-v4-initial-normalized', initialNormalize.id, 'customFunctionAgentflow', initialAssemble.id),
  edge('i10-v4-initial-assembled', initialAssemble.id, 'customFunctionAgentflow', initialSubmit.id),
  edge('i10-v4-initial-submitted', initialSubmit.id, 'toolAgentflow', 'conditionAgentflow_i10_v3_needs_input')
)

// Returning from the local credential page must complete the existing Journey
// instead of creating a second Journey for the same case description.
const credentialResumeRoute = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_credential_resume_route',
  '凭据录入后是否恢复现有旅程',
  1320,
  180
)
credentialResumeRoute.data.inputs.conditions = [{
  type: 'string',
  value1: state('journeyId'),
  operation: 'notEmpty'
}]
credentialResumeRoute.data.outputAnchors = [
  { label: '恢复现有旅程', name: '0' },
  { label: '继续新请求', name: '1' }
]

const credentialResumeAssemble = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_credential_resume_assemble',
  '将新凭据引用并入原案例',
  1500,
  180
)
credentialResumeAssemble.data.inputs.customFunctionJavascriptFunction = `
let draft = {};
try { draft = typeof $draftJson === 'string' ? JSON.parse($draftJson) : ($draftJson || {}); } catch { draft = {}; }
let semanticAssessment = {};
try { semanticAssessment = typeof $semanticAssessmentJson === 'string' ? JSON.parse($semanticAssessmentJson) : ($semanticAssessmentJson || {}); } catch { semanticAssessment = {}; }
const credentialRef = String($credentialRef || '').trim();
if (!/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) throw new Error('I10_CREDENTIAL_REF_INVALID');
draft = {
  ...draft,
  credentialRef,
  missingFields: Array.isArray(draft.missingFields)
    ? draft.missingFields.filter(field => field !== 'credentialRef')
    : []
};
if (Array.isArray(draft.actionStepsV2)) {
  draft.actionStepsV2 = draft.actionStepsV2.map(step => {
    if (!step || step.inputValueSource !== 'CREDENTIAL_REF') return step;
    return { ...step, provenanceRefs: [credentialRef] };
  });
}
const normalized = {
  inputType: String($inputType || 'NATURAL_LANGUAGE'),
  naturalLanguage: String($accumulatedCaseInput || $naturalLanguage || '').trim(),
  entryUrl: String(draft.entryUrl || '').trim(),
  targetSystem: String(draft.targetSystem || '').trim(),
  credentialRef,
  draftJson: draft,
  semanticAssessment,
  inputRevision: Math.max(1,Number($caseInputRevision || 1))
};
return { draftJson: JSON.stringify(draft), normalizedInput: JSON.stringify(normalized) };`
credentialResumeAssemble.data.inputs.customFunctionInputVariables = [
  { variableName: 'draftJson', variableValue: state('caseDraftJson') },
  { variableName: 'semanticAssessmentJson', variableValue: state('semanticAssessmentJson') },
  { variableName: 'credentialRef', variableValue: state('credentialRef') },
  { variableName: 'inputType', variableValue: state('inputType') },
  { variableName: 'naturalLanguage', variableValue: state('naturalLanguage') },
  { variableName: 'accumulatedCaseInput', variableValue: state('accumulatedCaseInput') },
  { variableName: 'caseInputRevision', variableValue: state('caseInputRevision') }
]
credentialResumeAssemble.data.inputs.customFunctionUpdateState = [
  { key: 'caseDraftJson', value: '{{ output.draftJson }}' },
  { key: 'initialNormalizedInput', value: '{{ output.normalizedInput }}' }
]

const credentialResumeStructure = cloneNode(
  'llmAgentflow_i10_v3_structure',
  'llmAgentflow_i10_v4_credential_resume_structure',
  '凭据返回后重新结构化补充信息',
  1410,
  180
)
credentialResumeStructure.data.inputs.llmMessages[1].content =
  '当前请求意图：{{$flow.state.requestIntent}}；输入类型：{{$flow.state.inputType}}；用户本轮控制消息：{{question}}；累计案例描述：{{$flow.state.accumulatedCaseInput}}；已有案例草案：{{$flow.state.caseDraftJson}}；已确认图片事实：{{$flow.state.imageFactsJson}}。如果本轮消息只是“继续”或“恢复”，不得把它当作业务缺口或覆盖已有案例。'
credentialResumeStructure.data.inputs.llmUpdateState = draftFieldNames.map(field => ({
  key: draftStateKey(field),
  value: `{{ output.${field} }}`
}))

const credentialResumeNormalize = cloneNode(
  'customFunctionAgentflow_i10_v3_normalize',
  'customFunctionAgentflow_i10_v4_credential_resume_normalize',
  '确定性规范化凭据返回草案',
  1500,
  180
)
credentialResumeNormalize.data.inputs.customFunctionJavascriptFunction = structuredDraftNormalizerSource()
credentialResumeNormalize.data.inputs.customFunctionInputVariables = [
  ...draftFieldNames.map(field => ({
    variableName: field,
    variableValue: state(draftStateKey(field))
  })),
  { variableName: 'credentialRef', variableValue: state('credentialRef') },
  { variableName: 'naturalLanguage', variableValue: state('accumulatedCaseInput') },
  { variableName: 'imageIngestId', variableValue: state('imageIngestId') },
  { variableName: 'imageFactsJson', variableValue: state('imageFactsJson') },
  { variableName: 'priorDraft', variableValue: state('caseDraftJson') }
]
credentialResumeNormalize.data.inputs.customFunctionUpdateState = [
  { key: 'caseDraftJson', value: '{{ output.draftJson }}' },
  { key: 'draftDisplayJson', value: '{{ output.displayJson }}' },
  { key: 'semanticAssessmentJson', value: '{{ output.semanticAssessmentJson }}' }
]

const credentialResumeSubmit = cloneNode(
  'toolAgentflow_i10_v4_initial_case_submit',
  'toolAgentflow_i10_v4_credential_resume_submit',
  'MCP向原旅程提交凭据完成结果',
  1680,
  180
)
credentialResumeSubmit.data.inputs.toolInputArgs = [
  { inputArgName: 'journeyId', inputArgValue: state('journeyId') },
  { inputArgName: 'expectedVersion', inputArgValue: state('journeyVersion') },
  { inputArgName: 'inputKind', inputArgValue: 'INITIAL_CASE_INPUT' },
  { inputArgName: 'normalizedInput', inputArgValue: state('initialNormalizedInput') },
  { inputArgName: 'submissionRef', inputArgValue: '{{$flow.sessionId}}-credential-complete' },
  { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
]
credentialResumeSubmit.data.inputs.toolUpdateState = journeyUpdates
credentialResumeSubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('journey_input_submit')

flow.nodes.push(
  credentialResumeRoute,
  credentialResumeStructure,
  credentialResumeNormalize,
  credentialResumeAssemble,
  credentialResumeSubmit
)
flow.edges = flow.edges.filter(item =>
  !(item.source === 'toolAgentflow_i10_v3_credential_refresh' &&
    item.target === imageRoute.id)
)
flow.edges.push(
  edge('i10-v4-credential-resume-route', 'toolAgentflow_i10_v3_credential_refresh', 'toolAgentflow', credentialResumeRoute.id),
  edge('i10-v4-credential-resume-existing', credentialResumeRoute.id, '0', credentialResumeStructure.id),
  edge('i10-v4-credential-resume-structured', credentialResumeStructure.id, 'llmAgentflow', credentialResumeNormalize.id),
  edge('i10-v4-credential-resume-normalized', credentialResumeNormalize.id, 'customFunctionAgentflow', credentialResumeAssemble.id),
  edge('i10-v4-credential-resume-assembled', credentialResumeAssemble.id, 'customFunctionAgentflow', credentialResumeSubmit.id),
  // Credential completion may leave other required fields unresolved (for
  // example entryUrl). Always re-evaluate the authoritative journey status
  // instead of assuming a frozen proposal already exists.
  edge('i10-v4-credential-resume-submitted', credentialResumeSubmit.id, 'toolAgentflow', 'conditionAgentflow_i10_v3_needs_input'),
  edge('i10-v4-credential-resume-new', credentialResumeRoute.id, '1', imageRoute.id)
)

// 附件草案 reject 进入修订输入，而不是直接丢弃导入。
const ingestGet = byId.get('toolAgentflow_i10_v3_ingest_get')
ingestGet.data.inputs.toolUpdateState = [
  { key:'ingestJobVersion', value:'{{ output.version }}' },
  { key:'ingestStatus', value:'{{ output.status }}' },
  { key:'ingestDraftCount', value:'{{ output.draftCount }}' },
  { key:'ingestItemsJson', value:'{{ output.items }}' },
  { key:'caseDraftJson', value:'{{ output.items.0.draft }}' }
]

const ingestBatchInspect = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_ingest_batch_inspect',
  '计算附件案例数量',
  3060,
  460
)
ingestBatchInspect.data.inputs.customFunctionJavascriptFunction =
  `const count=Number($draftCount||0);return {route:count>1?'MULTI':'SINGLE'};`
ingestBatchInspect.data.inputs.customFunctionInputVariables = [
  {variableName:'draftCount',variableValue:state('ingestDraftCount')}
]
ingestBatchInspect.data.inputs.customFunctionUpdateState = []
const ingestBatchRoute = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_ingest_batch_route',
  '附件是否包含多案例',
  3240,
  460
)
ingestBatchRoute.data.inputs.conditions = [{
  type:'string', value1:'{{customFunctionAgentflow_i10_v4_ingest_batch_inspect.output.route}}', operation:'equal', value2:'MULTI'
}]
ingestBatchRoute.data.outputAnchors = [{label:'多案例',name:'0'},{label:'单案例',name:'1'}]

const ingestBatchInput = cloneNode(
  'humanInputAgentflow_run',
  'humanInputAgentflow_i10_v4_ingest_batch_input',
  '逐项选择附件案例',
  3420,
  420
)
ingestBatchInput.data.inputs.humanInputEnableFeedback = true
ingestBatchInput.data.inputs.humanInputDescription =
  '## 请逐项选择附件中的案例\n\n案例清单：\n\n{{$flow.state.ingestItemsJson}}\n\n请明确写出每个序号的决定，例如：`1确认；2拒绝；3确认`。必须覆盖全部序号。\n\n你现在可以：\n\n- 填写后点击 proceed（继续）：只结构化并校验逐项决定，随后再次展示唯一清单供确认。\n- 点击 reject（拒绝）：拒绝整个附件导入，不写入任何正式案例。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'

const ingestBatchGuard = cloneNode(
  'customFunctionAgentflow_i10_v4_entry_secret_guard',
  'customFunctionAgentflow_i10_v4_ingest_batch_guard',
  '校验批量选择输入',
  3600,
  420
)
ingestBatchGuard.data.inputs.customFunctionInputVariables = [{
  variableName:'rawInput',variableValue:'{{humanInputAgentflow_i10_v4_ingest_batch_input.output.conditions.0.feedback}}'
}]
const ingestBatchSafe = cloneNode(
  'conditionAgentflow_i10_v4_entry_safe',
  'conditionAgentflow_i10_v4_ingest_batch_safe',
  '批量选择是否安全',
  3780,
  420
)
ingestBatchSafe.data.inputs.conditions = [{
  type:'string',value1:'{{customFunctionAgentflow_i10_v4_ingest_batch_guard.output.safe}}',operation:'equal',value2:'YES'
}]
const ingestBatchBlocked = cloneNode(
  'directReplyAgentflow_i10_v4_entry_blocked',
  'directReplyAgentflow_i10_v4_ingest_batch_blocked',
  '批量选择已拦截',
  3960,
  540
)
ingestBatchBlocked.data.inputs.directReplyMessage =
  '## 批量选择未提交\n\n输入为空、未覆盖全部序号或包含秘密格式。系统没有确认任何案例。请恢复当前导入后，仅按序号填写确认或拒绝。'
const ingestBatchLlm = cloneNode(
  'llmAgentflow_ingest_decision',
  'llmAgentflow_i10_v4_ingest_batch_structure',
  '结构化逐项案例决定',
  3960,
  420
)
ingestBatchLlm.data.inputs.llmMessages = [
  {role:'system',content:'你只把用户对全部案例序号的决定转换为itemDecisions数组。每个输入案例必须且只能出现一次，decision只能为CONFIRM或REJECT。不得猜测、不得遗漏、不得增加序号。最终只输出JSON对象。'},
  {role:'user',content:'当前案例清单：{{$flow.state.ingestItemsJson}}\n用户逐项决定：{{humanInputAgentflow_i10_v4_ingest_batch_input.output.conditions.0.feedback}}'}
]
ingestBatchLlm.data.inputs.llmStructuredOutput = [{
  key:'itemDecisions',type:'jsonArray',description:'覆盖全部案例的ordinal与decision数组'
}]
ingestBatchLlm.data.inputs.llmUpdateState = [
  {key:'ingestItemDecisionsJson',value:'{{ output.itemDecisions }}'}
]
const ingestBatchConfirm = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_ingest_batch_confirm',
  '确认逐项案例决定',
  4140,
  420
)
ingestBatchConfirm.data.inputs.humanInputEnableFeedback = false
ingestBatchConfirm.data.inputs.humanInputDescription =
  '## 请确认逐项案例决定\n\n{{$flow.state.ingestItemDecisionsJson}}\n\n你现在可以：\n\n- 点击 proceed（继续）：提交上方唯一决定清单；确认项将成为正式案例，拒绝项不会写入。\n- 点击 reject（拒绝）：返回修改，不提交任何决定。\n\n本节点不接受自由文本。'
const ingestBatchSubmit = cloneNode(
  'toolAgentflow_i10_v3_ingest_decide',
  'toolAgentflow_i10_v4_ingest_batch_submit',
  'MCP提交逐项案例决定',
  4320,
  380
)
ingestBatchSubmit.data.inputs.toolInputArgs = [
  {inputArgName:'ingestJobId',inputArgValue:state('ingestJobId')},
  {inputArgName:'expectedVersion',inputArgValue:state('ingestJobVersion')},
  {inputArgName:'choice',inputArgValue:'CONFIRM'},
  {inputArgName:'itemDecisionsJson',inputArgValue:state('ingestItemDecisionsJson')},
  {inputArgName:'reason',inputArgValue:'用户逐项确认批量导入案例'},
  {inputArgName:'confirmationRef',inputArgValue:'{{$flow.sessionId}}-ingest-batch'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}-ingest-batch'}
]
ingestBatchSubmit.data.inputs.toolUpdateState = [
  {key:'batchCasesJson',value:'{{ output.cases }}'}
]
ingestBatchSubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('ingest_decision_submit')
const ingestBatchDone = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_ingest_batch_done',
  '返回批量案例创建结果',
  4500,
  380
)
ingestBatchDone.data.inputs.directReplyMessage =
  '## 批量案例已按逐项决定处理\n\n已创建案例：{{$flow.state.batchCasesJson}}\n\n每个案例保留独立caseId和preparationId。请选择其中一个案例继续作者化；系统不会悄悄只取第一条，也不会把拒绝项写入正式案例。'

flow.nodes.push(
  ingestBatchInspect,ingestBatchRoute,ingestBatchInput,ingestBatchGuard,ingestBatchSafe,ingestBatchBlocked,
  ingestBatchLlm,ingestBatchConfirm,ingestBatchSubmit,ingestBatchDone
)
flow.edges = flow.edges.filter(item=>item.id==='i10-v3-e20' ? false : true)
flow.edges.push(
  edge('i10-v4-ingest-ready-batch-inspect','conditionAgentflow_i10_v3_ingest_ready','0',ingestBatchInspect.id),
  edge('i10-v4-ingest-ready-batch-route',ingestBatchInspect.id,'customFunctionAgentflow',ingestBatchRoute.id),
  edge('i10-v4-ingest-batch',ingestBatchRoute.id,'0',ingestBatchInput.id),
  edge('i10-v4-ingest-single',ingestBatchRoute.id,'1','humanInputAgentflow_i10_v3_ingest_confirm'),
  edge('i10-v4-ingest-batch-proceed',ingestBatchInput.id,'0',ingestBatchGuard.id),
  edge('i10-v4-ingest-batch-reject-all',ingestBatchInput.id,'1','toolAgentflow_i10_v3_ingest_reject'),
  edge('i10-v4-ingest-batch-guarded',ingestBatchGuard.id,'customFunctionAgentflow',ingestBatchSafe.id),
  edge('i10-v4-ingest-batch-safe',ingestBatchSafe.id,'0',ingestBatchLlm.id),
  edge('i10-v4-ingest-batch-blocked',ingestBatchSafe.id,'1',ingestBatchBlocked.id),
  edge('i10-v4-ingest-batch-structured',ingestBatchLlm.id,'llmAgentflow',ingestBatchConfirm.id),
  edge('i10-v4-ingest-batch-confirmed',ingestBatchConfirm.id,'0',ingestBatchSubmit.id),
  edge('i10-v4-ingest-batch-revise',ingestBatchConfirm.id,'1',ingestBatchInput.id),
  edge('i10-v4-ingest-batch-submitted',ingestBatchSubmit.id,'toolAgentflow',ingestBatchDone.id)
)

const ingestCorrection = cloneNode(
  'humanInputAgentflow_run',
  'humanInputAgentflow_i10_v4_ingest_correction',
  '输入附件草案修订',
  3420,
  520
)
ingestCorrection.data.inputs.humanInputEnableFeedback = true
ingestCorrection.data.inputs.humanInputDescription =
  '## 请说明附件案例的修订内容\n\n示例：把第1条案例的入口地址改为……；将第2条案例的预期结果改为……。\n\n你现在可以：\n\n- 填写修订后点击 proceed（继续）：提交当前文字进行结构化与Harness校验，不会直接确认导入。\n- 点击 reject（拒绝）：放弃本次导入，不改变已有正式案例。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'
const ingestDecisionLlm = cloneNode(
  'llmAgentflow_ingest_decision',
  'llmAgentflow_i10_v4_ingest_correction',
  '结构化附件草案修订',
  3600,
  520
)
ingestDecisionLlm.data.inputs.llmMessages = [
  {
    role: 'system',
    content: [
      '把当前用户对附件草案的修订应用到当前完整CaseDraft。',
      '必须输出修订后的完整用户可编辑字段，不得只输出补丁。',
      '最终字段为correctionRequired、title、objective、summary、targetSystem、entryUrl、preconditions、actions、expectedOutcomes、assertions、reason。',
      'actions与expectedOutcomes必须是非空且等长的字符串数组；入口地址字段名是entryUrl。',
      '原草案中的source、credentialRef、策略、Hash和状态由确定性节点保留，禁止生成或修改。',
      '不得包含明文账号、密码、验证码、PIN或其他秘密。',
      '无法形成完整案例时correctionRequired必须为false，其他字段仍按原草案补全，reason说明缺口。',
      '最终只输出符合结构化输出定义的JSON对象。'
    ].join('')
  },
  {
    role: 'user',
    content: '当前附件草案列表：{{$flow.state.ingestItemsJson}}\n当前Human Input反馈：{{humanInputAgentflow_i10_v4_ingest_correction.output.conditions.0.feedback}}'
  }
]
ingestDecisionLlm.data.inputs.llmStructuredOutput = [
  { key: 'correctionRequired', type: 'boolean', description: '用户修订能否形成完整案例' },
  { key: 'title', type: 'string', description: '修订后的案例标题' },
  { key: 'objective', type: 'string', description: '修订后的测试目标' },
  { key: 'summary', type: 'string', description: '修订后的案例摘要' },
  { key: 'targetSystem', type: 'string', description: '目标系统名称' },
  { key: 'entryUrl', type: 'string', description: '去除首尾空白后的HTTP或HTTPS入口地址' },
  { key: 'preconditions', type: 'stringArray', description: '完整前置条件' },
  { key: 'actions', type: 'stringArray', description: '完整操作列表' },
  { key: 'expectedOutcomes', type: 'stringArray', description: '与操作逐项对应的预期结果' },
  { key: 'assertions', type: 'stringArray', description: '完整断言列表' },
  { key: 'reason', type: 'string', description: '不含凭据的修订理由或缺口' }
]
// Structured LLM direct outputs are not stable custom-function inputs in the
// bundled Flowise runtime. Persist every flat field first, then consume only
// Flow state in the deterministic contract normalizer.
ingestDecisionLlm.data.inputs.llmUpdateState = [
  { key: 'ingestCorrectionRequired', value: '{{ output.correctionRequired }}' },
  { key: 'ingestCorrectionTitle', value: '{{ output.title }}' },
  { key: 'ingestCorrectionObjective', value: '{{ output.objective }}' },
  { key: 'ingestCorrectionSummary', value: '{{ output.summary }}' },
  { key: 'ingestCorrectionTargetSystem', value: '{{ output.targetSystem }}' },
  { key: 'ingestCorrectionEntryUrl', value: '{{ output.entryUrl }}' },
  { key: 'ingestCorrectionPreconditions', value: '{{ output.preconditions }}' },
  { key: 'ingestCorrectionActions', value: '{{ output.actions }}' },
  { key: 'ingestCorrectionExpectedOutcomes', value: '{{ output.expectedOutcomes }}' },
  { key: 'ingestCorrectionAssertions', value: '{{ output.assertions }}' },
  { key: 'ingestCorrectionReason', value: '{{ output.reason }}' }
]
const ingestCorrect = cloneNode(
  'toolAgentflow_ingest_correct',
  'toolAgentflow_i10_v4_ingest_correct',
  'MCP提交附件案例修订',
  3780,
  520
)
const ingestCorrectionNormalize = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_ingest_correction_normalize',
  '确定性规范化附件修订合同',
  3690,
  520
)
ingestCorrectionNormalize.data.inputs.customFunctionJavascriptFunction = `
const asArray = value => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
  } catch {}
  return [];
};
let items = $ingestItemsJson;
if (typeof items === 'string') {
  try { items = JSON.parse(items); } catch { items = []; }
}
const original = Array.isArray(items) && items[0] && items[0].draft;
const actions = asArray($actions);
const expected = asArray($expectedOutcomes);
const preconditions = asArray($preconditions);
const assertions = asArray($assertions);
if (!original || typeof original !== 'object' || Array.isArray(original)) {
  return { valid: 'NO', errorCode: 'I10_INGEST_ORIGINAL_DRAFT_INVALID', correctionsJson: '{"corrections":[]}' };
}
if (actions.length === 0 || actions.length !== expected.length || assertions.length === 0) {
  return { valid: 'NO', errorCode: 'I10_INGEST_CORRECTION_STEPS_INVALID', correctionsJson: '{"corrections":[]}' };
}
let entryUrl = String($entryUrl || '').trim();
// Flowise CustomFunction's vm sandbox does not expose the WHATWG URL global.
// Perform the local protocol/whitespace/user-info gate here; Harness performs
// the authoritative URL schema validation at the MCP boundary.
if (!/^https?:\\/\\/[^\\s]+$/i.test(entryUrl) || /https?:\\/\\/[^/]*@/i.test(entryUrl)) {
  return { valid: 'NO', errorCode: 'I10_ENTRY_URL_INVALID', correctionsJson: '{"corrections":[]}' };
}
const targetSystem = String($targetSystem || '').trim();
if (!targetSystem) {
  return { valid: 'NO', errorCode: 'I10_TARGET_SYSTEM_REQUIRED', correctionsJson: '{"corrections":[]}' };
}
const corrected = {
  ...original,
  title: String($title || original.title || '').trim(),
  objective: String($objective || original.objective || '').trim(),
  summary: String($summary || original.summary || '').trim(),
  targetSystem,
  entryUrl,
  preconditions,
  steps: actions.map((action, index) => ({ action, expected: expected[index] })),
  assertions: assertions.filter(value => !/遮挡|无法点击|无法交互|无法确定|不清晰|模糊|不可见|看不清/.test(value)),
  confidence: Math.max(Number(original.confidence || 0), 0.75),
  missingFields: [],
  confirmationStatus: 'WAITING_USER'
};
if (corrected.assertions.length === 0) corrected.assertions = [...new Set(expected)];
return {
  valid: 'YES',
  errorCode: '',
  correctionsJson: JSON.stringify({ corrections: [{ ordinal: Number(items[0].ordinal || 1), draft: corrected }] })
};`
ingestCorrectionNormalize.data.inputs.customFunctionInputVariables = [
  { variableName: 'ingestItemsJson', variableValue: state('ingestItemsJson') },
  { variableName: 'correctionRequired', variableValue: state('ingestCorrectionRequired') },
  { variableName: 'title', variableValue: state('ingestCorrectionTitle') },
  { variableName: 'objective', variableValue: state('ingestCorrectionObjective') },
  { variableName: 'summary', variableValue: state('ingestCorrectionSummary') },
  { variableName: 'targetSystem', variableValue: state('ingestCorrectionTargetSystem') },
  { variableName: 'entryUrl', variableValue: state('ingestCorrectionEntryUrl') },
  { variableName: 'preconditions', variableValue: state('ingestCorrectionPreconditions') },
  { variableName: 'actions', variableValue: state('ingestCorrectionActions') },
  { variableName: 'expectedOutcomes', variableValue: state('ingestCorrectionExpectedOutcomes') },
  { variableName: 'assertions', variableValue: state('ingestCorrectionAssertions') }
]
ingestCorrectionNormalize.data.inputs.customFunctionUpdateState = [
  { key: 'ingestCorrectionNormalizeValid', value: '{{ output.valid }}' },
  { key: 'ingestCorrectionNormalizedJson', value: '{{ output.correctionsJson }}' }
]
ingestCorrect.data.inputs.toolInputArgs = ingestCorrect.data.inputs.toolInputArgs.map(item =>
  item.inputArgName === 'correctionsJson'
    ? { ...item, inputArgValue: state('ingestCorrectionNormalizedJson') }
    : item
)
flow.nodes.push(ingestCorrection, ingestDecisionLlm, ingestCorrectionNormalize, ingestCorrect)
flow.edges = flow.edges.filter(item => item.id !== 'i10-v3-e25')
flow.edges.push(
  edge('i10-v4-ingest-revise', 'humanInputAgentflow_i10_v3_ingest_confirm', '1', ingestCorrection.id),
  edge('i10-v4-ingest-revise-proceed', ingestCorrection.id, '0', ingestDecisionLlm.id),
  edge('i10-v4-ingest-revise-cancel', ingestCorrection.id, '1', 'toolAgentflow_i10_v3_ingest_reject'),
  edge('i10-v4-ingest-correction-normalize', ingestDecisionLlm.id, 'llmAgentflow', ingestCorrectionNormalize.id),
  edge('i10-v4-ingest-correct', ingestCorrectionNormalize.id, 'customFunctionOutput', ingestCorrect.id),
  edge('i10-v4-ingest-reread', ingestCorrect.id, 'toolAgentflow', 'toolAgentflow_i10_v3_ingest_get')
)

// Runtime verification is a two-step human-in-the-loop gate. Flowise never
// receives the OTP/PIN/biometric secret; it only records readiness and the
// fact that the user completed the action directly in the tested environment.
const candidateReadyTool = byId.get('toolAgentflow_candidate_ready')
for (const arg of candidateReadyTool.data.inputs.toolInputArgs) {
  if (arg.inputArgName === 'waitForCertificate') arg.inputArgValue = true
}
candidateReadyTool.data.inputs.toolUpdateState = [
  {key:'candidateNextAction',value:'{{ output.nextAction }}'},
  {key:'candidateJobId',value:'{{ output.job.jobId }}'},
  {key:'verificationChallengeId',value:'{{ output.verification.challengeId }}'},
  {key:'verificationStatus',value:'{{ output.verification.status }}'},
  {key:'verificationVersion',value:'{{ output.verification.version }}'},
  {key:'verificationType',value:'{{ output.verification.verificationType }}'},
  {key:'verificationPreparation',value:'{{ output.verification.userPreparation }}'}
]

const verificationRoute = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_verification_route',
  '候选是否等待人工验证',
  4680,
  -160
)
verificationRoute.data.inputs.conditions = [{
  type:'string',value1:state('candidateNextAction'),operation:'equal',value2:'HUMAN_VERIFICATION_REQUIRED'
}]
verificationRoute.data.outputAnchors=[{label:'需要验证',name:'0'},{label:'继续候选判断',name:'1'}]
const verificationGet = cloneNode(
  'toolAgentflow_i10_v4_image_get',
  'toolAgentflow_i10_v4_verification_get',
  'MCP读取人工验证挑战',
  4860,
  -220
)
verificationGet.data.inputs.toolInputArgs = [{
  inputArgName:'challengeId',inputArgValue:state('verificationChallengeId')
}]
verificationGet.data.inputs.toolUpdateState = [
  {key:'verificationChallengeId',value:'{{ output.challengeId }}'},
  {key:'verificationStatus',value:'{{ output.status }}'},
  {key:'verificationVersion',value:'{{ output.version }}'},
  {key:'verificationType',value:'{{ output.verificationType }}'},
  {key:'verificationPreparation',value:'{{ output.userPreparation }}'}
]
verificationGet.data.inputs.toolAgentflowSelectedToolConfig=mcpConfig('verification_get')
const verificationReadyGate = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_verification_ready',
  '确认已准备人工验证',
  5040,
  -220
)
verificationReadyGate.data.inputs.humanInputEnableFeedback=false
verificationReadyGate.data.inputs.humanInputDescription =
  '## 执行已暂停，等待人工验证\n\n验证类型：{{$flow.state.verificationType}}\n\n准备事项：{{$flow.state.verificationPreparation}}\n\n你现在可以：\n\n- 点击 proceed（继续）：仅确认你已准备好对应设备或验证方式；不会提交验证码、PIN或其他秘密。\n- 点击 reject（拒绝）：取消本次验证并停止当前候选作者化。\n\n验证码、PIN、U盾按键、扫码和生物验证必须在被测页面、手机或物理设备上完成。'
const verificationReadySubmit = cloneNode(
  'toolAgentflow_i10_v4_image_decision_submit',
  'toolAgentflow_i10_v4_verification_ready_submit',
  'MCP确认验证方式已准备',
  5220,
  -260
)
verificationReadySubmit.data.inputs.toolInputArgs=[
  {inputArgName:'challengeId',inputArgValue:state('verificationChallengeId')},
  {inputArgName:'expectedVersion',inputArgValue:state('verificationVersion')},
  {inputArgName:'decision',inputArgValue:'USER_READY'},
  {inputArgName:'confirmationRef',inputArgValue:'{{$flow.sessionId}}-verification-ready'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}-verification-ready'}
]
verificationReadySubmit.data.inputs.toolUpdateState=[
  {key:'verificationStatus',value:'{{ output.status }}'},
  {key:'verificationVersion',value:'{{ output.version }}'}
]
verificationReadySubmit.data.inputs.toolAgentflowSelectedToolConfig=mcpConfig('verification_decision_submit')
const verificationCancel = cloneNode(
  'toolAgentflow_i10_v4_verification_ready_submit',
  'toolAgentflow_i10_v4_verification_cancel',
  'MCP取消人工验证',
  5220,
  -120
)
verificationCancel.data.inputs.toolInputArgs=verificationCancel.data.inputs.toolInputArgs.map(arg=>
  arg.inputArgName==='decision'?{...arg,inputArgValue:'CANCEL'}:arg)
verificationCancel.data.inputs.toolUpdateState=[
  {key:'verificationStatus',value:'{{ output.status }}'},
  {key:'verificationVersion',value:'{{ output.version }}'}
]
const verificationActionGate = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_verification_action',
  '确认已在被测环境完成验证',
  5400,
  -260
)
verificationActionGate.data.inputs.humanInputEnableFeedback=false
verificationActionGate.data.inputs.humanInputDescription =
  '## 请在被测环境完成验证\n\n请现在直接在浏览器、手机或物理设备上完成页面要求的验证。不要把验证码、PIN或口令输入Flowise。\n\n你现在可以：\n\n- 点击 proceed（继续）：确认人工操作已经完成，Worker随后恢复当前动作并自行验证结果。\n- 点击 reject（拒绝）：取消本次执行，不把未验证状态当作成功。'
const verificationComplete = cloneNode(
  'toolAgentflow_i10_v4_verification_ready_submit',
  'toolAgentflow_i10_v4_verification_complete',
  'MCP确认人工验证已完成',
  5580,
  -300
)
verificationComplete.data.inputs.toolInputArgs=verificationComplete.data.inputs.toolInputArgs.map(arg=>
  arg.inputArgName==='decision'?{...arg,inputArgValue:'USER_ACTION_COMPLETED'}:
  arg.inputArgName==='expectedVersion'?{...arg,inputArgValue:state('verificationVersion')}:
  arg)
verificationComplete.data.inputs.toolUpdateState=[
  {key:'verificationStatus',value:'{{ output.status }}'},
  {key:'verificationVersion',value:'{{ output.version }}'}
]
const verificationCancelledReply=cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_verification_cancelled',
  '返回人工验证取消结果',
  5580,
  -100
)
verificationCancelledReply.data.inputs.directReplyMessage =
  '## 本次人工验证已取消\n\n系统没有把未完成验证当作成功，也没有签发候选证书。需要继续时请重新发起或恢复对应案例作者化。'
const candidateProcessingReply=cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_candidate_processing',
  '返回候选异步处理状态',
  5220,
  40
)
candidateProcessingReply.data.inputs.directReplyMessage =
  '## 候选仍在处理中\n\nMidscene作者化、Playwright验证或2×2稳定性运行尚未结束。这是正常异步状态，不是MCP失败。\n\n请稍后在同一会话发送“继续”；系统会使用当前preparationId恢复查询，不会重复创建案例、作者化任务或调度。'
const authoringRetryGate = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_authoring_retry',
  '确认重新作者化同一案例',
  8500,
  -120
)
authoringRetryGate.data.inputs.humanInputEnableFeedback=false
authoringRetryGate.data.inputs.humanInputDescription =
  '## 视觉作者化已失败关闭\n\n系统没有生成ActionTrace、证书或激活脚本。失败任务会保留供审计。\n\n你现在可以：\n\n- 点击 proceed（继续）：使用原案例和原preparationId创建一个新的作者化任务，重新执行Midscene、Builder、纯Playwright和完整2×2验证。\n- 点击 reject（拒绝）：不重试；保留失败记录并结束当前操作。\n\n重新作者化不会修改项目源码，也不会复用失败任务冒充成功。'
const authoringRetryTool = cloneNode(
  'toolAgentflow_candidate_ready',
  'toolAgentflow_i10_v4_authoring_retry',
  'MCP重新作者化同一案例',
  8680,
  -160
)
for (const arg of authoringRetryTool.data.inputs.toolInputArgs) {
  if (arg.inputArgName === 'waitForCertificate') arg.inputArgValue = true
  if (arg.inputArgName === 'waitTimeoutSeconds') arg.inputArgValue = 45
}
if (!authoringRetryTool.data.inputs.toolInputArgs.some(arg=>arg.inputArgName==='retryFailed')) {
  authoringRetryTool.data.inputs.toolInputArgs.push({inputArgName:'retryFailed',inputArgValue:true})
}
authoringRetryTool.data.inputs.toolUpdateState = candidateReadyTool.data.inputs.toolUpdateState
for (const conditionId of [
  'conditionAgentflow_candidate_ready',
  'conditionAgentflow_candidate_authoring_failed',
  'conditionAgentflow_candidate_validation_failed'
]) {
  const conditionNode = byId.get(conditionId)
  for (const condition of conditionNode.data.inputs.conditions ?? []) {
    condition.value1 = '{{$flow.state.candidateNextAction}}'
  }
}
const authoringRetryDeclined = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_authoring_retry_declined',
  '返回作者化重试拒绝结果',
  8680,
  -40
)
authoringRetryDeclined.data.inputs.directReplyMessage =
  '## 已保留作者化失败记录\n\n没有创建新的作者化任务、候选、证书、激活脚本、正式运行或调度。需要继续时可从同一案例重新发起作者化。'
const stabilityRevisionGate = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_stability_revision',
  '确认限域修订并重新完整验证',
  8500,
  20
)
stabilityRevisionGate.data.inputs.humanInputEnableFeedback=false
stabilityRevisionGate.data.inputs.humanInputDescription =
  '## 候选稳定性验证失败\n\n至少一个2×2样本失败，因此系统没有签发证书、激活脚本、创建正式运行或调度。失败候选及其样本证据保持只读。\n\n系统提出的唯一限域修订是：重新执行Midscene目标识别，由确定性Builder生成一个新版本、新Hash的候选，并从纯Playwright开始重新执行完整4次验证。\n\n你现在可以：\n\n- 点击 proceed（继续）：批准上述唯一修订并创建新候选；旧候选的通过样本不会计入新证书。\n- 点击 reject（拒绝）：保留失败候选并结束，不创建新候选。\n\n本节点不接受账号、密码、验证码、PIN或其他秘密。'
const stabilityRevisionTool = cloneNode(
  'toolAgentflow_candidate_ready',
  'toolAgentflow_i10_v4_stability_revision',
  'MCP提交限域候选修订',
  8680,
  20
)
for (const arg of stabilityRevisionTool.data.inputs.toolInputArgs) {
  if (arg.inputArgName === 'waitForCertificate') arg.inputArgValue = true
  if (arg.inputArgName === 'waitTimeoutSeconds') arg.inputArgValue = 45
}
if (!stabilityRevisionTool.data.inputs.toolInputArgs.some(arg=>arg.inputArgName==='retryFailed')) {
  stabilityRevisionTool.data.inputs.toolInputArgs.push({inputArgName:'retryFailed',inputArgValue:true})
}
stabilityRevisionTool.data.inputs.toolInputArgs.push({
  inputArgName:'revisionReason',
  inputArgValue:'稳定性样本失败后重新执行Midscene目标识别，并由确定性Builder生成全新版本候选。'
})
stabilityRevisionTool.data.inputs.toolUpdateState = candidateReadyTool.data.inputs.toolUpdateState
const stabilityRevisionDeclined = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_stability_revision_declined',
  '返回候选修订拒绝结果',
  8680,
  100
)
stabilityRevisionDeclined.data.inputs.directReplyMessage =
  '## 已保留失败候选\n\n没有签发证书、激活脚本、创建新候选、正式运行或调度。失败样本仍可审计。'

flow.nodes.push(
  verificationRoute,verificationGet,verificationReadyGate,verificationReadySubmit,
  verificationCancel,verificationActionGate,verificationComplete,verificationCancelledReply,
  candidateProcessingReply,authoringRetryGate,authoringRetryTool,authoringRetryDeclined,
  stabilityRevisionGate,stabilityRevisionTool,stabilityRevisionDeclined
)
flow.edges=flow.edges.filter(item=>!(
  item.source==='conditionAgentflow_candidate_authoring_failed' &&
  item.target==='directReplyAgentflow_candidate_failed'
))
flow.edges=flow.edges.filter(item=>item.id!=='i10-e30')
flow.edges=flow.edges.filter(item=>!(
  item.source==='conditionAgentflow_candidate_validation_failed' &&
  item.target==='directReplyAgentflow_candidate_failed'
))
flow.nodes=flow.nodes.filter(item=>item.id!=='directReplyAgentflow_candidate_failed')
flow.edges.push(
  edge('i10-v4-candidate-verification-route','toolAgentflow_candidate_ready','toolAgentflow',verificationRoute.id),
  edge('i10-v4-verification-required',verificationRoute.id,'0',verificationGet.id),
  edge('i10-v4-candidate-normal-route',verificationRoute.id,'1','conditionAgentflow_candidate_ready'),
  edge('i10-v4-verification-loaded',verificationGet.id,'toolAgentflow',verificationReadyGate.id),
  edge('i10-v4-verification-ready',verificationReadyGate.id,'0',verificationReadySubmit.id),
  edge('i10-v4-verification-cancel-early',verificationReadyGate.id,'1',verificationCancel.id),
  edge('i10-v4-verification-action-gate',verificationReadySubmit.id,'toolAgentflow',verificationActionGate.id),
  edge('i10-v4-verification-completed',verificationActionGate.id,'0',verificationComplete.id),
  edge('i10-v4-verification-cancel-late',verificationActionGate.id,'1',verificationCancel.id),
  edge('i10-v4-verification-resume-poll',verificationComplete.id,'toolAgentflow','toolAgentflow_candidate_ready'),
  edge('i10-v4-verification-cancelled',verificationCancel.id,'toolAgentflow',verificationCancelledReply.id),
  edge('i10-v4-authoring-failed-retry-gate','conditionAgentflow_candidate_authoring_failed','0',authoringRetryGate.id),
  edge('i10-v4-authoring-retry-proceed',authoringRetryGate.id,'0',authoringRetryTool.id),
  edge('i10-v4-authoring-retry-reject',authoringRetryGate.id,'1',authoringRetryDeclined.id),
  edge('i10-v4-authoring-retry-result',authoringRetryTool.id,'toolAgentflow',verificationRoute.id),
  edge('i10-v4-stability-failed-revision-gate','conditionAgentflow_candidate_validation_failed','0',stabilityRevisionGate.id),
  edge('i10-v4-stability-revision-proceed',stabilityRevisionGate.id,'0',stabilityRevisionTool.id),
  edge('i10-v4-stability-revision-reject',stabilityRevisionGate.id,'1',stabilityRevisionDeclined.id),
  edge('i10-v4-stability-revision-result',stabilityRevisionTool.id,'toolAgentflow',verificationRoute.id)
)
flow.edges.push(
  edge('i10-v4-candidate-still-processing','conditionAgentflow_candidate_validation_failed','1',candidateProcessingReply.id)
)

// 正式运行中的U盾等验证发生在业务信息填写并首次确认之后。task_get
// 必须先返回人工门槛，Flowise确认后再恢复同一个task/browser，不能把
// 登录阶段当成验证时点，也不能用一次长阻塞MCP调用等待用户。
const formalTask = byId.get('toolAgentflow_task')
formalTask.data.inputs.toolUpdateState = [
  {key:'formalTaskStatus',value:'{{ output.status }}'},
  {key:'formalTaskNextAction',value:'{{ output.nextAction }}'},
  {key:'formalVerificationChallengeId',value:'{{ output.verification.challengeId }}'},
  {key:'formalVerificationStatus',value:'{{ output.verification.status }}'},
  {key:'formalVerificationVersion',value:'{{ output.verification.version }}'},
  {key:'formalVerificationType',value:'{{ output.verification.verificationType }}'},
  {key:'formalVerificationPreparation',value:'{{ output.verification.userPreparation }}'}
]
const formalVerificationRoute = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_formal_verification_route',
  '正式运行是否等待业务验证',
  8840,
  420
)
formalVerificationRoute.data.inputs.conditions = [{
  type:'string',
  value1:state('formalTaskNextAction'),
  operation:'equal',
  value2:'HUMAN_VERIFICATION_REQUIRED'
}]
formalVerificationRoute.data.outputAnchors = [
  {label:'需要验证',name:'0'},
  {label:'检查异步状态',name:'1'}
]
const formalTaskProcessing = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_formal_task_processing',
  '正式运行是否仍在处理',
  9020,
  500
)
formalTaskProcessing.data.inputs.conditions = [{
  type:'string',
  value1:state('formalTaskNextAction'),
  operation:'equal',
  value2:'ASYNC_TASK_RESUME'
}]
formalTaskProcessing.data.outputAnchors = [
  {label:'仍在处理',name:'0'},
  {label:'已到终态',name:'1'}
]
const formalProcessingReply = cloneNode(
  'directReplyAgentflow_i10_v3_card',
  'directReplyAgentflow_i10_v4_formal_processing',
  '返回正式运行异步状态',
  9200,
  560
)
formalProcessingReply.data.inputs.directReplyMessage =
  '## 正式回归仍在处理中\n\n当前任务没有失败，也没有重复创建。请稍后在同一会话发送“继续”，系统会查询同一个任务；若业务首次确认后出现U盾等验证，将转入人工验证门槛。'
const formalVerificationGet = cloneNode(
  'toolAgentflow_i10_v4_image_get',
  'toolAgentflow_i10_v4_formal_verification_get',
  'MCP读取正式运行验证挑战',
  9020,
  300
)
formalVerificationGet.data.inputs.toolInputArgs = [{
  inputArgName:'challengeId',
  inputArgValue:state('formalVerificationChallengeId')
}]
formalVerificationGet.data.inputs.toolUpdateState = [
  {key:'formalVerificationChallengeId',value:'{{ output.challengeId }}'},
  {key:'formalVerificationStatus',value:'{{ output.status }}'},
  {key:'formalVerificationVersion',value:'{{ output.version }}'},
  {key:'formalVerificationType',value:'{{ output.verificationType }}'},
  {key:'formalVerificationPreparation',value:'{{ output.userPreparation }}'}
]
formalVerificationGet.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('verification_get')
const formalReadyGate = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_formal_verification_ready',
  '确认U盾等验证已准备',
  9200,
  260
)
formalReadyGate.data.inputs.humanInputEnableFeedback = false
formalReadyGate.data.inputs.humanInputDescription =
  '## 业务首次确认后已出现人工验证\n\n验证类型：{{$flow.state.formalVerificationType}}\n\n准备事项：{{$flow.state.formalVerificationPreparation}}\n\n如果U盾已完成持久化，只需确认U盾当前可用。\n\n你现在可以：\n\n- 点击 proceed（继续）：确认设备或验证方式已准备；不会提交PIN、验证码或其他秘密。\n- 点击 reject（拒绝）：取消本次正式回归，不把未验证状态当作成功。'
const formalReadySubmit = cloneNode(
  'toolAgentflow_i10_v4_image_decision_submit',
  'toolAgentflow_i10_v4_formal_verification_ready_submit',
  'MCP确认正式运行验证已准备',
  9380,
  220
)
formalReadySubmit.data.inputs.toolInputArgs = [
  {inputArgName:'challengeId',inputArgValue:state('formalVerificationChallengeId')},
  {inputArgName:'expectedVersion',inputArgValue:state('formalVerificationVersion')},
  {inputArgName:'decision',inputArgValue:'USER_READY'},
  {inputArgName:'confirmationRef',inputArgValue:'{{$flow.sessionId}}-formal-verification-ready'},
  {inputArgName:'sessionRef',inputArgValue:'{{$flow.sessionId}}-formal-verification-ready'}
]
formalReadySubmit.data.inputs.toolUpdateState = [
  {key:'formalVerificationStatus',value:'{{ output.status }}'},
  {key:'formalVerificationVersion',value:'{{ output.version }}'}
]
formalReadySubmit.data.inputs.toolAgentflowSelectedToolConfig = mcpConfig('verification_decision_submit')
const formalCancel = cloneNode(
  'toolAgentflow_i10_v4_formal_verification_ready_submit',
  'toolAgentflow_i10_v4_formal_verification_cancel',
  'MCP取消正式运行验证',
  9380,
  380
)
formalCancel.data.inputs.toolInputArgs = formalCancel.data.inputs.toolInputArgs.map(arg =>
  arg.inputArgName === 'decision' ? {...arg,inputArgValue:'CANCEL'} : arg)
const formalActionGate = cloneNode(
  'humanInputAgentflow_i10_v3_decision',
  'humanInputAgentflow_i10_v4_formal_verification_action',
  '确认已完成U盾等验证',
  9560,
  220
)
formalActionGate.data.inputs.humanInputEnableFeedback = false
formalActionGate.data.inputs.humanInputDescription =
  '## 请直接完成U盾等验证\n\n请在被测业务页面确认已持久化的U盾验证。验证通过后，页面应继续进入单号查询；不要在Flowise输入PIN、验证码或口令。\n\n你现在可以：\n\n- 点击 proceed（继续）：确认U盾等验证已经完成，Worker恢复同一个浏览器任务并检查单号查询结果。\n- 点击 reject（拒绝）：取消本次正式回归。'
const formalComplete = cloneNode(
  'toolAgentflow_i10_v4_formal_verification_ready_submit',
  'toolAgentflow_i10_v4_formal_verification_complete',
  'MCP确认正式运行验证完成',
  9740,
  180
)
formalComplete.data.inputs.toolInputArgs = formalComplete.data.inputs.toolInputArgs.map(arg =>
  arg.inputArgName === 'decision' ? {...arg,inputArgValue:'USER_ACTION_COMPLETED'} :
  arg.inputArgName === 'expectedVersion' ? {...arg,inputArgValue:state('formalVerificationVersion')} :
  arg)
formalComplete.data.inputs.toolUpdateState = [
  {key:'formalVerificationStatus',value:'{{ output.status }}'},
  {key:'formalVerificationVersion',value:'{{ output.version }}'}
]
flow.nodes.push(
  formalVerificationRoute,formalTaskProcessing,formalProcessingReply,
  formalVerificationGet,formalReadyGate,formalReadySubmit,formalCancel,
  formalActionGate,formalComplete
)
flow.edges = flow.edges.filter(edgeItem =>
  !(edgeItem.source === 'toolAgentflow_task' && edgeItem.target === 'llmAgentflow_terminal')
)
flow.edges.push(
  edge('i10-v4-formal-verification-route','toolAgentflow_task','toolAgentflow',formalVerificationRoute.id),
  edge('i10-v4-formal-verification-required',formalVerificationRoute.id,'0',formalVerificationGet.id),
  edge('i10-v4-formal-task-status',formalVerificationRoute.id,'1',formalTaskProcessing.id),
  edge('i10-v4-formal-task-processing',formalTaskProcessing.id,'0',formalProcessingReply.id),
  edge('i10-v4-formal-task-terminal',formalTaskProcessing.id,'1','llmAgentflow_terminal'),
  edge('i10-v4-formal-verification-get',formalVerificationGet.id,'toolAgentflow',formalReadyGate.id),
  edge('i10-v4-formal-verification-ready',formalReadyGate.id,'0',formalReadySubmit.id),
  edge('i10-v4-formal-verification-cancel',formalReadyGate.id,'1',formalCancel.id),
  edge('i10-v4-formal-verification-action',formalReadySubmit.id,'toolAgentflow',formalActionGate.id),
  edge('i10-v4-formal-verification-complete',formalActionGate.id,'0',formalComplete.id),
  edge('i10-v4-formal-verification-action-cancel',formalActionGate.id,'1',formalCancel.id),
  edge('i10-v4-formal-verification-resume-task',formalComplete.id,'toolAgentflow','toolAgentflow_task'),
  edge('i10-v4-formal-verification-cancelled',formalCancel.id,'toolAgentflow','directReplyAgentflow_i10_v4_verification_cancelled')
)

// 执行方式：采集当前feedback -> LLM解析 -> 每一种唯一方案二次确认 -> MCP执行。
const runInput = byId.get('humanInputAgentflow_run')
runInput.data.label = '输入即时、单次或周期计划'
runInput.data.inputs.humanInputEnableFeedback = true
runInput.data.inputs.humanInputDescription =
  '## 请选择执行方式\n\n输入示例：\n\n- 立即执行\n- 2026-07-25 10:00 在 Asia/Shanghai 执行一次\n- 每个工作日 09:00，时区 Asia/Shanghai\n\n你现在可以：\n\n- 填写计划后点击 proceed（继续）：只提交当前文字进行解析和确定性校验；系统会再次展示唯一计划，尚不会创建运行或调度。\n- 点击 reject（拒绝）：暂不执行并保留已验证脚本。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'
const scheduleLlm = byId.get('llmAgentflow_schedule_intent')
scheduleLlm.data.label = '解析当前Human Input执行计划'
scheduleLlm.data.inputs.llmMessages[1].content =
  '只解析已经通过本地秘密检查的当前反馈：{{humanInputAgentflow_run.output.conditions.0.feedback}}'
const scheduleFieldState = {
  scheduleType: 'controllerScheduleType',
  runAt: 'controllerScheduleRunAt',
  cronExpression: 'controllerScheduleCronExpression',
  timezone: 'controllerScheduleTimezone',
  misfirePolicy: 'controllerScheduleMisfirePolicy',
  misfireGraceSeconds: 'controllerScheduleMisfireGraceSeconds',
  maxRetries: 'controllerScheduleMaxRetries'
}
scheduleLlm.data.inputs.llmUpdateState = Object.entries(scheduleFieldState).map(([field, key]) => ({
  key,
  value: `{{ output.${field} }}`
}))
const scheduleFeedbackGuard = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_schedule_feedback_guard',
  '执行计划反馈本地安全检查',
  runInput.position.x + 220,
  runInput.position.y
)
scheduleFeedbackGuard.data.inputs.customFunctionJavascriptFunction =
  flowiseSecretGuardSource().replace(
    '  status,',
    "  safeText: status === 'SAFE' ? text : '',\n  status,"
  )
scheduleFeedbackGuard.data.inputs.customFunctionInputVariables = [{
  variableName: 'rawInput',
  variableValue: '{{humanInputAgentflow_run.output.conditions.0.feedback}}'
}]
scheduleFeedbackGuard.data.inputs.customFunctionUpdateState = [
  { key: 'interactionFeedback', value: '{{ output.safeText }}' },
  { key: 'interactionFeedbackSafe', value: '{{ output.safe }}' }
]
flow.nodes.push(scheduleFeedbackGuard)
const scheduleFeedbackSafe = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_schedule_feedback_safe',
  '执行计划反馈是否有效',
  scheduleFeedbackGuard.position.x + 220,
  scheduleFeedbackGuard.position.y
)
scheduleFeedbackSafe.data.inputs.conditions = [{
  type: 'string',
  value1: state('interactionFeedbackSafe'),
  operation: 'equal',
  value2: 'YES'
}]
scheduleFeedbackSafe.data.outputAnchors = [
  { label: '安全', name: '0' },
  { label: '缺失或含秘密', name: '1' }
]
flow.nodes.push(scheduleFeedbackSafe)
flow.edges = flow.edges.filter(item =>
  !(item.source === 'humanInputAgentflow_run' &&
    item.target === 'llmAgentflow_schedule_intent')
)
flow.edges.push(
  edge('i10-v4-schedule-feedback-guard', 'humanInputAgentflow_run', '0', scheduleFeedbackGuard.id),
  edge('i10-v4-schedule-feedback-safe', scheduleFeedbackGuard.id, 'customFunctionOutput', scheduleFeedbackSafe.id),
  edge('i10-v4-schedule-feedback-parse', scheduleFeedbackSafe.id, '0', scheduleLlm.id),
  edge('i10-v4-schedule-feedback-retry', scheduleFeedbackSafe.id, '1', 'humanInputAgentflow_run')
)
const scheduleNormalize = cloneNode(
  'customFunctionAgentflow_i10_v3_inspect_missing',
  'customFunctionAgentflow_i10_v4_schedule_normalize',
  '执行计划确定性规范化',
  scheduleLlm.position.x + 220,
  scheduleLlm.position.y
)
scheduleNormalize.data.inputs.customFunctionJavascriptFunction = `
const text = value => String(value ?? '').trim();
const integer = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed : fallback;
};
const scheduleType = text($scheduleType).toUpperCase();
const timezone = text($timezone);
const runAt = text($runAt);
const cronExpression = text($cronExpression).replace(/\\s+/g, ' ');
const misfirePolicy = ['SKIP', 'RUN_ONCE'].includes(text($misfirePolicy).toUpperCase())
  ? text($misfirePolicy).toUpperCase() : 'SKIP';
let errorCode = '';
if (!['ON_DEMAND', 'ONE_TIME', 'RECURRING'].includes(scheduleType)) {
  errorCode = 'I10_SCHEDULE_TYPE_INVALID';
} else if (scheduleType === 'ONE_TIME') {
  const instant = Date.parse(runAt);
  if (!runAt || !/(?:Z|[+-]\\d{2}:\\d{2})$/.test(runAt) ||
      !Number.isFinite(instant) || instant <= Date.now()) {
    errorCode = 'I10_RUN_AT_INVALID';
  } else if (!/^[A-Za-z_]+(?:\\/[A-Za-z0-9_+-]+)+$/.test(timezone)) {
    errorCode = 'I10_TIMEZONE_INVALID';
  }
} else if (scheduleType === 'RECURRING') {
  if (cronExpression.split(' ').length !== 5) {
    errorCode = 'I10_CRON_INVALID';
  } else if (!/^[A-Za-z_]+(?:\\/[A-Za-z0-9_+-]+)+$/.test(timezone)) {
    errorCode = 'I10_TIMEZONE_INVALID';
  }
}
return {
  valid: errorCode ? 'NO' : 'YES',
  errorCode,
  scheduleType,
  runAt: scheduleType === 'ONE_TIME' ? runAt : '',
  cronExpression: scheduleType === 'RECURRING' ? cronExpression : '',
  timezone: scheduleType === 'ON_DEMAND' ? '' : timezone,
  misfirePolicy,
  misfireGraceSeconds: integer($misfireGraceSeconds, 0, 0, 86400),
  maxRetries: integer($maxRetries, 0, 0, 5)
};`
scheduleNormalize.data.inputs.customFunctionInputVariables = [
  'scheduleType', 'runAt', 'cronExpression', 'timezone', 'misfirePolicy',
  'misfireGraceSeconds', 'maxRetries'
].map(variableName => ({
  variableName,
  variableValue: state(scheduleFieldState[variableName])
}))
scheduleNormalize.data.inputs.customFunctionUpdateState = [
  ['scheduleValidationStatus', 'valid'],
  ['scheduleValidationError', 'errorCode'],
  ['scheduleType', 'scheduleType'],
  ['scheduleRunAt', 'runAt'],
  ['scheduleCronExpression', 'cronExpression'],
  ['scheduleTimezone', 'timezone'],
  ['scheduleMisfirePolicy', 'misfirePolicy'],
  ['scheduleMisfireGraceSeconds', 'misfireGraceSeconds'],
  ['scheduleMaxRetries', 'maxRetries']
].map(([key, output]) => ({ key, value: `{{ output.${output} }}` }))
flow.nodes.push(scheduleNormalize)
const scheduleValid = cloneNode(
  'conditionAgentflow_i10_v3_needs_credential',
  'conditionAgentflow_i10_v4_schedule_valid',
  '执行计划是否通过确定性校验',
  scheduleNormalize.position.x + 220,
  scheduleNormalize.position.y
)
scheduleValid.data.inputs.conditions = [{
  type: 'string',
  value1: state('scheduleValidationStatus'),
  operation: 'equal',
  value2: 'YES'
}]
scheduleValid.data.outputAnchors = [
  { label: '有效', name: '0' },
  { label: '需重新输入', name: '1' }
]
flow.nodes.push(scheduleValid)
flow.edges = flow.edges.filter(item =>
  !(item.source === 'llmAgentflow_schedule_intent' &&
    item.target === 'conditionAgentflow_on_demand')
)
flow.edges.push(
  edge('i10-v4-schedule-normalize', scheduleLlm.id, 'llmAgentflow', scheduleNormalize.id),
  edge('i10-v4-schedule-validate', scheduleNormalize.id, 'customFunctionOutput', scheduleValid.id),
  edge('i10-v4-schedule-valid', scheduleValid.id, '0', 'conditionAgentflow_on_demand'),
  edge('i10-v4-schedule-invalid-retry', scheduleValid.id, '1', 'humanInputAgentflow_run')
)
for (const id of ['conditionAgentflow_on_demand', 'conditionAgentflow_one_time', 'conditionAgentflow_recurring']) {
  const condition = byId.get(id)
  for (const rule of condition.data.inputs.conditions || []) {
    rule.value1 = state('scheduleType')
  }
}
for (const id of ['toolAgentflow_schedule', 'toolAgentflow_schedule_recurring']) {
  const tool = byId.get(id)
  const mapping = {
    runAt: 'scheduleRunAt',
    cronExpression: 'scheduleCronExpression',
    timezone: 'scheduleTimezone',
    misfirePolicy: 'scheduleMisfirePolicy',
    misfireGraceSeconds: 'scheduleMisfireGraceSeconds',
    maxRetries: 'scheduleMaxRetries'
  }
  for (const arg of tool.data.inputs.toolInputArgs || []) {
    if (mapping[arg.inputArgName]) arg.inputArgValue = state(mapping[arg.inputArgName])
  }
}
for (const id of ['conditionAgentflow_on_demand', 'conditionAgentflow_one_time', 'conditionAgentflow_recurring']) {
  const condition = byId.get(id)
  for (const rule of condition.data.inputs.conditions || []) rule.operation = 'equal'
}

const scheduleConfirms = [
  ['conditionAgentflow_on_demand', 'toolAgentflow_run', 'humanInputAgentflow_i10_v4_confirm_on_demand', '确认立即执行', '立即创建一次按需回归任务。', '不创建任务并保留当前脚本。', '0'],
  ['conditionAgentflow_one_time', 'toolAgentflow_schedule', 'humanInputAgentflow_i10_v4_confirm_one_time', '确认单次定时', '按页面所示时间和时区创建一次性调度。', '不创建调度并保留当前脚本。', '0'],
  ['conditionAgentflow_recurring', 'toolAgentflow_schedule_recurring', 'humanInputAgentflow_i10_v4_confirm_recurring', '确认周期回归', '按页面所示Cron语义和时区创建周期调度。', '不创建调度并保留当前脚本。', '0']
]
for (const [conditionId, toolId, confirmId, label, effect, rejectEffect, output] of scheduleConfirms) {
  const condition = byId.get(conditionId)
  const tool = byId.get(toolId)
  const confirm = cloneNode('humanInputAgentflow_i10_v3_decision', confirmId, label, tool.position.x - 160, tool.position.y)
  confirm.data.inputs.humanInputEnableFeedback = false
  const scheduleType = conditionId.endsWith('on_demand') ? '立即执行' : conditionId.endsWith('one_time') ? '单次定时' : '周期执行'
  confirm.data.inputs.humanInputDescription =
    `## 已规范化为：${scheduleType}\n\n时间：${state('scheduleRunAt')}\nCron：${state('scheduleCronExpression')}\n时区：${state('scheduleTimezone')}\n\n你现在可以：\n\n- 点击 proceed（继续）：${effect}\n- 点击 reject（拒绝）：${rejectEffect}\n\n本节点不接受自由文本。不要输入账号、密码、验证码、PIN或其他秘密。`
  flow.nodes.push(confirm)
  const old = flow.edges.find(item => item.source === conditionId && item.target === toolId)
  if (old) {
    flow.edges = flow.edges.filter(item => item !== old)
    flow.edges.push(
      edge(`i10-v4-${confirmId}-enter`, conditionId, output, confirmId),
      edge(`i10-v4-${confirmId}-proceed`, confirmId, '0', toolId),
      edge(`i10-v4-${confirmId}-reject`, confirmId, '1', 'humanInputAgentflow_run')
    )
  }
}

// 修复调度也必须重新采集当前反馈并二次确认。
const repairScheduleInput = byId.get('humanInputAgentflow_repair_schedule')
repairScheduleInput.data.label = '输入修复版单次或周期计划'
repairScheduleInput.data.inputs.humanInputEnableFeedback = true
repairScheduleInput.data.inputs.humanInputDescription =
  '## 为修复版本输入新调度\n\n输入单次时间或周期规则，并明确IANA时区。\n\n你现在可以：\n\n- 填写计划后点击 proceed（继续）：只解析当前输入；系统随后再次展示唯一方案，不会立即创建调度。\n- 点击 reject（拒绝）：不迁移旧调度，也不创建新调度。\n\n不要输入账号、密码、验证码、PIN或其他秘密。'
const repairScheduleLlm = byId.get('llmAgentflow_repair_schedule_intent')
repairScheduleLlm.data.label = '解析当前修复版调度反馈'
repairScheduleLlm.data.inputs.llmMessages[1].content =
  '只解析当前Human Input反馈：{{humanInputAgentflow_repair_schedule.output.conditions.0.feedback}}'
for (const id of ['conditionAgentflow_repair_one_time', 'conditionAgentflow_repair_recurring']) {
  const condition = byId.get(id)
  for (const rule of condition.data.inputs.conditions || []) rule.operation = 'equal'
}
const repairScheduleConfirms = [
  ['conditionAgentflow_repair_one_time', 'toolAgentflow_repair_schedule', 'humanInputAgentflow_i10_v4_confirm_repair_one_time', '确认修复版单次调度', '0'],
  ['conditionAgentflow_repair_recurring', 'toolAgentflow_repair_schedule_recurring', 'humanInputAgentflow_i10_v4_confirm_repair_recurring', '确认修复版周期调度', '0']
]
for (const [conditionId, toolId, confirmId, label, output] of repairScheduleConfirms) {
  const tool = byId.get(toolId)
  const confirm = cloneNode('humanInputAgentflow_i10_v3_decision', confirmId, label, tool.position.x - 160, tool.position.y)
  confirm.data.inputs.humanInputEnableFeedback = false
  confirm.data.inputs.humanInputDescription =
    `## ${label}\n\n时间：{{llmAgentflow_repair_schedule_intent.output.runAt}}\nCron：{{llmAgentflow_repair_schedule_intent.output.cronExpression}}\n时区：{{llmAgentflow_repair_schedule_intent.output.timezone}}\n\n你现在可以：\n\n- 点击 proceed（继续）：创建页面所示的唯一修复版调度。\n- 点击 reject（拒绝）：不创建新调度，旧调度不会自动迁移。\n\n本节点不接受自由文本。不要输入账号、密码、验证码、PIN或其他秘密。`
  flow.nodes.push(confirm)
  const old = flow.edges.find(item => item.source === conditionId && item.target === toolId)
  if (old) {
    flow.edges = flow.edges.filter(item => item !== old)
    flow.edges.push(
      edge(`i10-v4-${confirmId}-enter`, conditionId, output, confirmId),
      edge(`i10-v4-${confirmId}-proceed`, confirmId, '0', toolId),
      edge(`i10-v4-${confirmId}-reject`, confirmId, '1', 'humanInputAgentflow_repair_schedule')
    )
  }
}

// 删除重复的“是否修复”门槛：失败分类后只保留一次修复候选确认。
const duplicateRepairGate = 'humanInputAgentflow_repair'
flow.nodes = flow.nodes.filter(item =>
  ![duplicateRepairGate, 'directReplyAgentflow_failure_report'].includes(item.id)
)
const repairIncoming = flow.edges.find(item => item.target === duplicateRepairGate)
flow.edges = flow.edges.filter(item => item.source !== duplicateRepairGate && item.target !== duplicateRepairGate)
if (repairIncoming) {
  flow.edges.push(edge('i10-v4-repair-single-gate', repairIncoming.source, '1', 'toolAgentflow_failure'))
}

// 所有最终Human Input节点都必须把真实按钮名和本次效果说清楚。
for (const item of flow.nodes.filter(item => item.data?.name === 'humanInputAgentflow')) {
  const description = String(item.data.inputs.humanInputDescription || '')
  if (!/\bproceed\b/.test(description) || !/\breject\b/.test(description)) {
    throw new Error(`I10_V4_HUMAN_INPUT_BUTTON_COPY_MISSING:${item.id}`)
  }
}

// Structured controller JSON is an internal transport object. Keeping it as a
// user-role history item prevents it from becoming the assistant-facing reply;
// only the Harness-rendered brief and artifact links are user-facing.
for (const item of flow.nodes.filter(item =>
  item.data?.name === 'llmAgentflow' &&
  Array.isArray(item.data.inputs?.llmStructuredOutput) &&
  item.data.inputs.llmStructuredOutput.length > 0
)) {
  item.data.inputs.llmReturnResponseAs = 'userMessage'
}

// 关键路径禁止再读取全局question；初始分类/草案理解仍允许读取用户首轮输入。
for (const item of flow.nodes) {
  if (['llmAgentflow_schedule_intent', 'llmAgentflow_repair_schedule_intent'].includes(item.id)) {
    const serialized = JSON.stringify(item.data.inputs)
    if (serialized.includes('{{question}}')) throw new Error(`I10_V4_STALE_QUESTION_REFERENCE:${item.id}`)
  }
}

// 保持修复候选轮询只有一条边，并为仍在处理状态提供明确出口。
flow.edges = flow.edges.filter(item => item.id !== 'i10-v3-e-repair-auto-poll')
if (!flow.edges.some(item =>
  item.source === 'conditionAgentflow_repair_validation_failed' &&
  item.sourceHandle === 'conditionAgentflow_repair_validation_failed-output-1'
)) {
  flow.edges.push(edge(
    'i10-v4-repair-still-processing',
    'conditionAgentflow_repair_validation_failed',
    '1',
    'directReplyAgentflow_i10_v4_candidate_processing'
  ))
}

// The Flowise canvas is user-arranged. Keep its positions in a separate,
// reviewable snapshot so rebuilding business nodes and edges cannot reset the
// accepted layout. The snapshot contains IDs and coordinates only.
if (fs.existsSync(layoutPath)) {
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'))
  if (layout.schemaVersion !== 'hengzhun-i10-agentflow-layout-v1') {
    throw new Error('I10_V4_LAYOUT_SCHEMA_INVALID')
  }
  const positions = new Map((layout.nodes || []).map(item => [item.id, item.position]))
  const flowIds = new Set(flow.nodes.map(item => item.id))
  const missing = flow.nodes.filter(item => !positions.has(item.id)).map(item => item.id)
  const unknown = [...positions.keys()].filter(id => !flowIds.has(id))
  if (missing.length || unknown.length || positions.size !== flow.nodes.length) {
    throw new Error(`I10_V4_LAYOUT_NODE_SET_MISMATCH:missing=${missing.length}:unknown=${unknown.length}`)
  }
  for (const item of flow.nodes) item.position = structuredClone(positions.get(item.id))
}

const rendered = `${JSON.stringify(flow, null, 2)}\n`
fs.writeFileSync(targetPath, rendered)

const publicationPath = path.join(root, 'flowise/i10/publication-manifest-v1.json')
const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'))
publication.rollbackFlowDataPath = 'flowise/i10/agentflow-v3.json'
publication.rollbackFlowSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
publication.primaryFlowDataPath = 'flowise/i10/agentflow-v4.json'
publication.primaryFlowSha256 = crypto.createHash('sha256').update(rendered).digest('hex')
publication.primaryFlowVersion = 4
publication.mcpToolCount = 33
publication.interactionAuthority = 'HARNESS_EXACT_PROPOSAL_JOURNEY'
publication.deployed = false
publication.publishState = 'BUILT_NOT_PUBLISHED'
delete publication.lastVerifiedAt
delete publication.flowiseFlowId
delete publication.flowiseFlowVersion
fs.writeFileSync(publicationPath, `${JSON.stringify(publication, null, 2)}\n`)

process.stdout.write(`HENGZHUN_I10_AGENTFLOW_V4_BUILT:${flow.nodes.length}:${flow.edges.length}\n`)

