#!/usr/bin/env node
'use strict'

// v6 deliberately keeps v5 as an immutable fallback.  v6 reads the frozen v5
// snapshot but must never rebuild it: otherwise a v6 build mutates the stated
// rollback artifact and can silently invalidate a previously published flow.
// PREPARE, validation and publication all use the v6 result below.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { structuredFlowiseFunctionSource } = require('./i10-case-draft-normalizer.cjs')
const opaqueReferences = require('./i10-reference-contracts.cjs')

const root = path.resolve(__dirname, '..')

const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
const writeJson = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`)
const sha256File = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')

const flow = readJson('flowise/i10/agentflow-v5.json')

// v6 owns the currently published deterministic CaseDraft normalizer.  v5
// remains byte-for-byte rollback evidence, so copy the current source into
// the v6 graph instead of regenerating or mutating the fallback graph.
const caseDraftNormalizer = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v3_normalize')
const normalizerVariables = caseDraftNormalizer?.data?.inputs?.customFunctionInputVariables
if (!caseDraftNormalizer || !Array.isArray(normalizerVariables)) throw new Error('I10_V6_CASE_DRAFT_NORMALIZER_NODE_MISSING')
if (!normalizerVariables.some(item => item?.variableName === 'controllerDraftRaw')) {
  normalizerVariables.push({
    variableName: 'controllerDraftRaw',
    variableValue: '{{$flow.state.controllerDraftRaw}}'
  })
}
const normalizerFields = normalizerVariables
  .map(item => String(item?.variableName || ''))
  .filter(name => !['credentialRef', 'naturalLanguage', 'imageIngestId', 'imageFactsJson', 'priorDraft', 'controllerDraftRaw'].includes(name))
if (normalizerFields.length === 0) throw new Error('I10_V6_CASE_DRAFT_NORMALIZER_FIELDS_MISSING')
caseDraftNormalizer.data.inputs.customFunctionJavascriptFunction = structuredFlowiseFunctionSource(normalizerFields)
const normalizerState = caseDraftNormalizer.data.inputs.customFunctionUpdateState || []
for (const [key, value] of [
  ['controllerDraft_targetSystem', '{{ output.targetSystem }}'],
  ['controllerDraft_entryUrl', '{{ output.entryUrl }}']
]) {
  const existing = normalizerState.find(item => item?.key === key)
  if (existing) existing.value = value
  else normalizerState.push({ key, value })
}
caseDraftNormalizer.data.inputs.customFunctionUpdateState = normalizerState

// Keep the compact CaseDraft on Flowise's *field-level* structured-output
// contract.  A prior v6 experiment stored the entire JSON response in one
// `controllerDraftRaw` state value and parsed it downstream.  Native Flowise
// truncates that state value on an Agentflow continuation, which turned a
// valid model response into an empty CaseDraft and sent the Journey down a
// false clarification/authoring path.  The frozen v5 mapping already stores
// bounded scalar/array fields independently, so it is the safe transport
// boundary.  `controllerDraftRaw` remains only as a legacy read fallback in
// the normalizer; no active LLM writes to it.
const compactCaseStructure = flow.nodes.find(node => node.id === 'llmAgentflow_i10_v3_structure')
if (!compactCaseStructure) throw new Error('I10_V6_COMPACT_CASE_STRUCTURE_NODE_MISSING')
if (!Array.isArray(compactCaseStructure.data.inputs.llmStructuredOutput) ||
    compactCaseStructure.data.inputs.llmStructuredOutput.length === 0 ||
    !Array.isArray(compactCaseStructure.data.inputs.llmUpdateState) ||
    compactCaseStructure.data.inputs.llmUpdateState.length === 0) {
  throw new Error('I10_V6_COMPACT_CASE_STRUCTURE_FIELD_CONTRACT_MISSING')
}
// deepseek-v4-flash is a reasoning model: reasoning_content shares the
// completion budget with content, so the former per-node caps (512/1024/2048)
// were frequently exhausted by reasoning alone and returned content:"" with
// finish_reason:"length", failing structured LLM nodes with
// I10_STAGE8_FLOWISE_PREDICTION_FAILED.  Every LLM node therefore gets the
// full governed output budget (controller profile maximumOutputTokens);
// response shape stays bounded by llmStructuredOutput keys, not the token cap.
for (const node of flow.nodes) {
  if (node?.data?.type === 'LLM') {
    node.data.inputs = node.data.inputs || {}
    node.data.inputs.llmModelConfig = { ...(node.data.inputs.llmModelConfig || {}), maxTokens: 8192 }
  }
}
const compactCaseSystem = compactCaseStructure.data.inputs.llmMessages?.find(message => message?.role === 'system')
if (!compactCaseSystem) throw new Error('I10_V6_COMPACT_CASE_STRUCTURE_SYSTEM_MESSAGE_MISSING')
const typedInputInstruction = '涉及转账、付款、汇款或支付时，只列出实际缺少的businessInput.payeeRef、businessInput.amount、businessInput.currency、businessInput.purpose。冻结业务输入只能由后续确定性表单/已确认附件写入，不能从自然语言猜测。'
if (!String(compactCaseSystem.content || '').includes('冻结业务输入只能由后续确定性表单')) {
  compactCaseSystem.content = `${String(compactCaseSystem.content || '').trim()}\n${typedInputInstruction}`
}

// An exact "continue confirmed image" command is a transport command, not a
// new case description.  Keep it on the main classification branch (which is
// already proven to reach the shared authoring chain), and make the native
// classifier retain the session's existing CASE_AUTHORING payload.  This
// avoids the nested-condition convergence bug without treating the command as
// user-supplied business content.
const requestClassifier = flow.nodes.find(node => node.id === 'llmAgentflow_i10_v3_classify')
if (!requestClassifier?.data?.inputs?.llmMessages) throw new Error('I10_V6_REQUEST_CLASSIFIER_MISSING')
const imageResumeClassifierRule = '用户精确输入“继续已确认图片 imageingest_<UUID>”时，必须输出CASE_AUTHORING和已有输入类型，并逐字保留已有案例描述、主附件、补充图片和credentialRef；不得把该命令当成新的案例描述，也不得清空已有字段。'
const classifierSystem = requestClassifier.data.inputs.llmMessages.find(message => message?.role === 'system')
if (!classifierSystem) throw new Error('I10_V6_REQUEST_CLASSIFIER_SYSTEM_MESSAGE_MISSING')
if (!String(classifierSystem.content || '').includes('继续已确认图片 imageingest_')) {
  classifierSystem.content = `${String(classifierSystem.content || '').trim()}\n${imageResumeClassifierRule}`
}
if (typeof requestClassifier.data.inputs.systemMessage === 'string' && !requestClassifier.data.inputs.systemMessage.includes('继续已确认图片 imageingest_')) {
  requestClassifier.data.inputs.systemMessage = `${requestClassifier.data.inputs.systemMessage.trim()}\n${imageResumeClassifierRule}`
}

const classificationMerge = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_classification_merge')
if (!classificationMerge?.data?.inputs?.customFunctionJavascriptFunction) {
  throw new Error('I10_V6_CLASSIFICATION_MERGE_MISSING')
}
const mergeSource = classificationMerge.data.inputs.customFunctionJavascriptFunction
const continuationMarker = "const continuing = /^(继续|恢复|查询进度|继续查询|resume)(?:[：:。,.，\\s]|$)/i.test(userQuestion) &&\n  clean($credentialSessionId) !== '';"
if (!mergeSource.includes(continuationMarker)) {
  throw new Error('I10_V6_CLASSIFICATION_MERGE_CONTINUATION_MARKER_MISSING')
}
classificationMerge.data.inputs.customFunctionJavascriptFunction = mergeSource.replace(
  continuationMarker,
  "const imageConfirmedContinuation = /^继续已确认图片\\s*imageingest_[0-9a-f-]{36}$/i.test(userQuestion);\n" +
  "const continuing = (/^(继续|恢复|查询进度|继续查询|resume)(?:[：:。,.，\\s]|$)/i.test(userQuestion) || imageConfirmedContinuation) &&\n" +
  "  (clean($credentialSessionId) !== '' || /^credential_[0-9a-f-]{36}$/i.test(clean($credentialRef)));"
)

// The compact case LLM now stores only its raw JSON result.  Its individual
// controllerDraft_* state fields are intentionally no longer populated, so a
// later TargetProfile gate must read the authoritative normalized CaseDraft
// instead of stale/empty parallel arrays.
const targetProfilePrerequisite = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_target_profile_prerequisite')
if (!targetProfilePrerequisite?.data?.inputs?.customFunctionJavascriptFunction) {
  throw new Error('I10_V6_TARGET_PROFILE_PREREQUISITE_NODE_MISSING')
}
const prerequisiteSource = targetProfilePrerequisite.data.inputs.customFunctionJavascriptFunction
const prerequisiteMarker = 'const actions = parse($actions);\nconst expected = parse($expectedOutcomes);'
if (!prerequisiteSource.includes(prerequisiteMarker)) {
  throw new Error('I10_V6_TARGET_PROFILE_PREREQUISITE_SOURCE_UNEXPECTED')
}
targetProfilePrerequisite.data.inputs.customFunctionJavascriptFunction = prerequisiteSource.replace(
  prerequisiteMarker,
  `const draftActions = Array.isArray(draft.steps) ? draft.steps.map(step => String(step?.action || '').trim()).filter(Boolean) : [];
const draftExpected = Array.isArray(draft.steps) ? draft.steps.map(step => String(step?.expected || '').trim()).filter(Boolean) : [];
const actions = draftActions.length ? draftActions : parse($actions);
const expected = draftExpected.length ? draftExpected : parse($expectedOutcomes);`
)

// A Human Input resume can retain Flowise's empty semantic bootstrap even
// after the frozen draft has no remaining hard gaps. Patch the inherited
// resume node so that only an explicit unresolved requirement may block it.
const credentialResumeAssembler = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_credential_resume_assemble')
if (!credentialResumeAssembler?.data?.inputs?.customFunctionJavascriptFunction) {
  throw new Error('I10_V6_CREDENTIAL_RESUME_ASSEMBLER_MISSING')
}
const resumeSource = credentialResumeAssembler.data.inputs.customFunctionJavascriptFunction
const resumeMarker = 'const normalized = {'
const resumePrefix = "// Empty Flowise bootstrap assessment must not override a complete draft.\n" +
  "if (Array.isArray(draft.missingFields) && draft.missingFields.length === 0 && semanticAssessment && semanticAssessment.verdict === 'NEEDS_CLARIFICATION' && Array.isArray(semanticAssessment.unresolvedRequirements) && semanticAssessment.unresolvedRequirements.length === 0) {\n" +
  "  semanticAssessment = { schemaVersion: 'hengzhun-i10-semantic-assessment-v1', verdict: 'COMPLETE', satisfiedRequirementIds: [], unresolvedRequirements: [], confidence: 0.9 };\n" +
  "}\n"
if (!resumeSource.includes(resumeMarker)) throw new Error('I10_V6_CREDENTIAL_RESUME_MARKER_MISSING')
credentialResumeAssembler.data.inputs.customFunctionJavascriptFunction = resumeSource.replace(resumeMarker, resumePrefix + resumeMarker)

// v6 is an immutable v5 snapshot plus narrowly-scoped runtime corrections.
// Do not rebuild v5: it remains the rollback artifact.  Custom Function
// output templates are not reliably interpolated in native Flowise Tool
// nodes, so persist the frozen authoring context in state before the MCP
// boundary reads it.
const intentCompiler = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
const authoringSubmit = flow.nodes.find(node => node.id === 'toolAgentflow_submit')
if (!intentCompiler || !authoringSubmit) throw new Error('I10_V6_AUTHORING_CONTEXT_NODES_MISSING')
intentCompiler.data.inputs.customFunctionUpdateState = [
  { key: 'authoringContext', value: '{{ output.authoringContext }}' }
]
const authoringArgs = authoringSubmit.data.inputs.toolInputArgs || []
const authoringContextArg = authoringArgs.find(arg => arg.inputArgName === 'authoringContext')
if (!authoringContextArg) throw new Error('I10_V6_AUTHORING_CONTEXT_ARGUMENT_MISSING')
authoringContextArg.inputArgValue = '{{$flow.state.authoringContext}}'
// A Custom Function state update is best-effort in native Flowise.  Preserve
// the individual frozen TargetProfile fields as a deterministic fallback for
// the MCP boundary; it can rebuild the exact context when authoringContext is
// rendered as an empty string by a resumed Human Input branch.
const ensureAuthoringFallbackArg = (name, value) => {
  const existing = authoringArgs.find(arg => arg.inputArgName === name)
  if (existing) existing.inputArgValue = value
  else authoringArgs.push({ inputArgName: name, inputArgValue: value })
}
ensureAuthoringFallbackArg('route', '{{$flow.state.targetProfileLaunchUrl}}')
ensureAuthoringFallbackArg('executionProfile', 'GENERIC_WEB')
ensureAuthoringFallbackArg('targetProfileId', '{{$flow.state.targetProfileId}}')
ensureAuthoringFallbackArg('targetProfileVersion', '{{$flow.state.targetProfileVersion}}')
ensureAuthoringFallbackArg('targetProfileHash', '{{$flow.state.targetProfileHash}}')
ensureAuthoringFallbackArg('targetProfileSnapshot', '{{$flow.state.targetProfileSnapshot}}')
authoringSubmit.data.inputs.toolInputArgs = authoringArgs
const start = flow.nodes.find(node => node.data?.name === 'startAgentflow')
if (!start) throw new Error('I10_V6_START_NODE_MISSING')
const classificationScheduleMerge = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_classification_merge')
if (!classificationScheduleMerge) throw new Error('I10_V6_CLASSIFICATION_MERGE_MISSING')
const scheduleProjection = "scheduleId: parsedValue('scheduleId', $classifiedScheduleId) || clean($scheduleId),"
if (!classificationScheduleMerge.data.inputs.customFunctionJavascriptFunction.includes('explicitScheduleRef')) {
  classificationScheduleMerge.data.inputs.customFunctionJavascriptFunction = classificationScheduleMerge.data.inputs.customFunctionJavascriptFunction
    .replace(
      'const rawQuestion = clean($question);',
      "const rawQuestion = clean($question);\nconst scheduleRefs = rawQuestion.match(/schedule_[0-9a-f-]{36}/ig) || [];\nconst explicitScheduleRef = scheduleRefs.length === 1 ? scheduleRefs[0] : '';"
    )
    .replace(scheduleProjection, "scheduleId: explicitScheduleRef || parsedValue('scheduleId', $classifiedScheduleId) || clean($scheduleId),")
}
const startState = start.data.inputs.startState || []
if (!startState.some(item => item.key === 'controllerDraftRaw')) {
  startState.push({ key: 'controllerDraftRaw', value: '' })
}
if (!startState.some(item => item.key === 'authoringContext')) {
  startState.push({ key: 'authoringContext', value: '' })
}
if (!startState.some(item => item.key === 'candidateId')) {
  startState.push({ key: 'candidateId', value: '' })
}
if (!startState.some(item => item.key === 'confirmedDecisionEventId')) {
  startState.push({ key: 'confirmedDecisionEventId', value: '' })
}
if (!startState.some(item => item.key === 'crossSessionHasCandidate')) {
  startState.push({ key: 'crossSessionHasCandidate', value: 'NO' })
}
if (!startState.some(item => item.key === 'crossSessionDecisionRoute')) {
  startState.push({ key: 'crossSessionDecisionRoute', value: 'PRESENT' })
}
start.data.inputs.startState = startState

// A controlled adapter remains opt-in.  The model may carry an exact user
// selection through the accumulated case text, but it cannot manufacture a
// manifest hash or infer this selection from a target name, URL, or screenshot.
// The Harness resolves the small symbolic id against its own registry.
const applicationProfileDerive = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v5_application_profile_derive')
const targetProfilePrepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_prepare')
if (!applicationProfileDerive || !targetProfilePrepare || !targetProfilePrerequisite) throw new Error('I10_V6_TARGET_ADAPTER_SELECTION_NODES_MISSING')
if (!startState.some(item => item.key === 'targetAdapterSelection')) {
  startState.push({ key: 'targetAdapterSelection', value: '' })
}
if (!applicationProfileDerive.data.inputs.customFunctionInputVariables.some(item => item.variableName === 'naturalLanguage')) {
  applicationProfileDerive.data.inputs.customFunctionInputVariables.push({
    variableName: 'naturalLanguage',
    variableValue: '{{$flow.state.accumulatedCaseInput}}\n{{$flow.state.naturalLanguage}}'
  })
}
if (!applicationProfileDerive.data.inputs.customFunctionInputVariables.some(item => item.variableName === 'frozenAdapterSelection')) {
  applicationProfileDerive.data.inputs.customFunctionInputVariables.push({
    variableName: 'frozenAdapterSelection', variableValue: '{{$flow.state.targetAdapterSelection}}'
  })
}
if (!applicationProfileDerive.data.inputs.customFunctionJavascriptFunction.includes('explicitAdapterSelection')) {
  applicationProfileDerive.data.inputs.customFunctionJavascriptFunction = applicationProfileDerive.data.inputs.customFunctionJavascriptFunction
    .replace(
      "return {\n  displayName:",
      "const explicitAdapterSelection = /(?:明确选择|使用|采用)\\s*(?:本机)?(?:复兴银行)?(?:演示)?适配器(?:\\s*[（(]?)?fuxing-bank-demo|fuxing-bank-demo/i.test(String($naturalLanguage || '')) ? 'fuxing-bank-demo' : '';\nreturn {\n  adapterSelection: explicitAdapterSelection,\n  displayName:"
    )
}
if (!applicationProfileDerive.data.inputs.customFunctionUpdateState.some(item => item.key === 'targetAdapterSelection')) {
  applicationProfileDerive.data.inputs.customFunctionUpdateState.push({ key: 'targetAdapterSelection', value: '{{ output.adapterSelection }}' })
}
const targetProfileArgs = targetProfilePrepare.data.inputs.toolInputArgs || []
if (!targetProfileArgs.some(item => item.inputArgName === 'adapterSelection')) {
  targetProfileArgs.splice(Math.max(0, targetProfileArgs.length - 1), 0, {
    inputArgName: 'adapterSelection', inputArgValue: '{{$flow.state.targetAdapterSelection}}'
  })
}
targetProfilePrepare.data.inputs.toolInputArgs = targetProfileArgs
if (!targetProfilePrerequisite.data.inputs.customFunctionInputVariables.some(item => item.variableName === 'naturalLanguage')) {
  targetProfilePrerequisite.data.inputs.customFunctionInputVariables.push({
    variableName: 'naturalLanguage',
    variableValue: '{{$flow.state.accumulatedCaseInput}}\n{{$flow.state.naturalLanguage}}'
  })
}
if (!targetProfilePrerequisite.data.inputs.customFunctionJavascriptFunction.includes('explicitAdapterSelection')) {
  targetProfilePrerequisite.data.inputs.customFunctionJavascriptFunction = targetProfilePrerequisite.data.inputs.customFunctionJavascriptFunction
    .replace(
      "const credentialRef = String($credentialRef || '').trim();",
      "const credentialRef = String($credentialRef || '').trim();\nconst explicitAdapterSelection = /(?:明确选择|使用|采用)\\s*(?:本机)?(?:复兴银行)?(?:演示)?适配器(?:\\s*[（(]?)?fuxing-bank-demo|fuxing-bank-demo/i.test(String($naturalLanguage || ''));"
    )
    .replace(
      "if (route === 'PREPARE_TARGET_PROFILE' && String($targetProfileStatus || '').trim().toUpperCase() === 'ACTIVE') {",
      "if (route === 'PREPARE_TARGET_PROFILE' && !explicitAdapterSelection && String($targetProfileStatus || '').trim().toUpperCase() === 'ACTIVE') {"
    )
}

// Native Flowise Agentflow executions can reliably resume one Human Input
// gate, but a second Human Input reached in the same resumed execution can be
// persisted as ERROR instead of STOPPED.  A new TargetProfile used to create
// exactly that shape:
//
//   target-profile confirm -> approve -> prepare case -> frozen-case confirm
//
// Keep both confirmations, but split them across two executions.  The first
// execution freezes the target and creates the authoritative frozen case
// proposal, then returns a short status card.  A later explicit journey
// resume re-reads that proposal and reaches the single remaining confirmation
// gate.  This is an execution-engine compatibility boundary, not an implicit
// approval of the case proposal.
const targetProfileGet = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_get')
const journeyPrepare = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v3_prepare')
const journeyResume = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v3_resume')
const crossSessionRoute = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v4_cross_session_route')
const resumeDetect = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_candidate_resume_detect')
const crossSessionJourneyGet = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_cross_session_journey_get')
const awaitingUser = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v3_awaiting_user')
const needsInput = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v3_needs_input')
if (!targetProfileGet || !journeyPrepare || !journeyResume || !crossSessionRoute || !resumeDetect || !crossSessionJourneyGet || !awaitingUser || !needsInput) {
  throw new Error('I10_V6_TARGET_PROFILE_TRANSITION_NODES_MISSING')
}

// Custom-MCP nodes expose their response as `output.content`: a JSON string
// containing MCP text blocks.  Flowise does not project fields inside that
// string for toolUpdateState, so `{{ output.journeyId }}` was persisted
// literally and later sent back as an invalid opaque reference.  Project the
// MCP envelope once, immediately after every journey_prepare invocation.
// Downstream nodes only consume these deterministic state values.
const journeyProjectionFields = [
  ['journeyId', 'journeyId'], ['journeyVersion', 'version'],
  ['journeyStatus', 'status'], ['journeyStage', 'stage'],
  ['journeySummary', 'summary'], ['journeyMissingFields', 'missingFields'],
  ['journeyAllowedActions', 'allowedActions'], ['journeyInteractionMode', 'interactionMode'],
  ['journeyInputRequest', 'inputRequest'], ['journeyProposal', 'proposal'],
  ['journeyProposalId', 'proposalId'], ['journeyProposalPayloadHash', 'proposalPayloadHash'],
  ['journeyProposalSummary', 'proposalSummary'], ['journeyProposalEffect', 'proposalEffect'],
  ['journeyProposalRejectEffect', 'proposalRejectEffect'],
  ['journeyProceedDecision', 'proposalProceedDecision'], ['journeyRejectDecision', 'proposalRejectDecision'],
  ['journeyNextAction', 'nextAction'], ['journeyNextActionType', 'nextAction.type'],
  ['journeyNextActionText', 'nextAction.description'], ['journeyRenderedMarkdown', 'renderedMarkdown'],
  ['journeyTransition', 'transition'], ['journeyTransitionHash', 'transition.payloadHash'],
  ['journeyArtifactCards', 'artifactCards'], ['journeyNeedsCredential', 'needsCredential'],
  ['caseDraftJson', 'caseDraft'], ['caseId', 'caseId'], ['caseVersion', 'caseVersion'],
  ['preparationId', 'preparationId'], ['preparationVersion', 'preparationVersion'],
  ['confirmedDecisionEventId', 'references.confirmedDecisionEventId'],
  // The QUERY_TASK / RESULT_AVAILABLE branches and the schedule paths bind
  // these references; legacy toolUpdateState cannot project them out of the
  // custom-MCP content string and would persist the literal template.
  ['taskId', 'references.taskId'], ['runId', 'references.runId'],
  ['scheduleId', 'references.scheduleId'], ['inboxId', 'references.inboxId'],
  ['resultArtifactId', 'references.resultArtifactId'],
  ['executionPlanMode', 'references.executionPlan.mode'], ['executionPlanRunAt', 'references.executionPlan.runAt'],
  ['executionPlanCron', 'references.executionPlan.cronExpression'], ['executionPlanTimezone', 'references.executionPlan.timezone']
]
// Custom Function state updates are resolved by Flowise's own
// processTemplateVariables() *after* the function returns.  That API accepts
// only the current function's `{{ output.field }}` form; explicit node paths
// are for ordinary downstream input variables and would be stored literally.
function journeyProjectionStateUpdates(_projectionId) {
  return journeyProjectionFields.map(([key, output]) => ({
    key,
    value: `{{ output.${output} }}`
  }))
}
const journeyProjectionSource = `
function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try { return JSON.parse(value); } catch { return {}; }
}
let envelope = parseObject($content);
if (Array.isArray(envelope)) envelope = envelope[0] || {};
// Native custom-MCP nodes expose their payload as output.content.  The value
// is a MCP text-block array, so accept both the array wrapper and a direct
// content/text object before parsing the bounded response payload.
let text = envelope && typeof envelope.content === 'string'
  ? envelope.content
  : (envelope && typeof envelope.text === 'string' ? envelope.text : '');
let payload = parseObject(text);
if (payload && typeof payload === 'object' && payload.result && typeof payload.result === 'object') payload = payload.result;
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('I10_JOURNEY_PREPARE_RESPONSE_INVALID');
return payload;
`.trim()
function attachJourneyProjection(toolId, targetId, suffix) {
  const projectionId = `customFunctionAgentflow_i10_v6_${suffix}_journey_projection`;
  const existing = flow.edges.find(item => item.source === toolId && item.target === targetId);
  if (!existing) throw new Error(`I10_V6_JOURNEY_PREPARE_EDGE_MISSING:${suffix}`);
  existing.target = projectionId;
  existing.targetHandle = projectionId;
  flow.nodes.push({
    id: projectionId,
    position: { x: 1860, y: suffix === 'post_target' ? 220 : 40 },
    type: 'customNode',
    data: {
      id: projectionId, label: '解析权威旅程响应', name: 'customFunctionAgentflow', version: 1,
      type: 'Custom Function', baseClasses: ['customFunctionAgentflow'], category: 'Agent Flows',
      inputs: {
        // Agentflow resolves node outputs only through the explicit
        // `<nodeId>.output.<path>` form. A bare `output.content` is preserved
        // literally, which previously turned a successful MCP Journey into
        // `{}` and lost its journeyId.
        customFunctionInputVariables: [{ variableName: 'content', variableValue: `{{ ${toolId}.output.content }}` }],
        customFunctionJavascriptFunction: journeyProjectionSource,
        customFunctionUpdateState: journeyProjectionStateUpdates(projectionId)
      }
    }
  });
  flow.edges.push({
    id: `i10-v6-${suffix}-journey-projection`, source: projectionId,
    target: targetId, sourceHandle: `${projectionId}-output-customFunctionAgentflow`,
    targetHandle: targetId, type: 'buttonedge'
  });
}
attachJourneyProjection(journeyPrepare.id, needsInput.id, 'initial');
// Identifiers alone are insufficient when a frozen proposal is resumed in a
// new Flowise execution. Restore the Harness-owned CaseDraft so the
// deterministic compiler receives the original paired steps and values.
const crossSessionUpdates = crossSessionJourneyGet.data.inputs.toolUpdateState || []
const recoveredDraftUpdate = crossSessionUpdates.find(item => item?.key === 'caseDraftJson')
if (recoveredDraftUpdate) recoveredDraftUpdate.value = '{{ output.caseDraft }}'
else crossSessionUpdates.push({ key: 'caseDraftJson', value: '{{ output.caseDraft }}' })
crossSessionJourneyGet.data.inputs.toolUpdateState = crossSessionUpdates
const postTargetPrepareId = 'toolAgentflow_i10_v6_post_target_journey_prepare'
const targetTransitionReplyId = 'directReplyAgentflow_i10_v6_target_profile_transition'
if (!flow.nodes.some(node => node.id === postTargetPrepareId)) {
  const postTargetPrepare = JSON.parse(JSON.stringify(journeyPrepare))
  postTargetPrepare.id = postTargetPrepareId
  postTargetPrepare.data.id = postTargetPrepareId
  postTargetPrepare.data.label = 'MCP冻结目标站点后的案例提案准备'
  flow.nodes.push(postTargetPrepare)
  const targetGetEdge = flow.edges.find(edge =>
    edge.source === targetProfileGet.id && edge.target === journeyPrepare.id)
  if (!targetGetEdge) throw new Error('I10_V6_TARGET_PROFILE_CONTINUE_EDGE_MISSING')
  targetGetEdge.target = postTargetPrepareId
  targetGetEdge.targetHandle = postTargetPrepareId
  flow.nodes.push({
    id: targetTransitionReplyId,
    position: { x: 2580, y: 220 },
    type: 'customNode',
    data: {
      id: targetTransitionReplyId,
      label: '提示继续确认冻结案例',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: {
        directReplyMessage: '## 目标站点已冻结，案例提案已准备\n\n当前不会自动进入作者化或执行。请在聊天输入框二选一发送：\n\n- `确认冻结案例提案 {{$flow.state.journeyId}}`：写入该精确案例并进入作者化。\n- `拒绝冻结案例提案 {{$flow.state.journeyId}}`：保留当前旅程，不写入正式案例。\n\n该确认必须在聊天输入框提交；不要输入账号、密码、验证码、PIN 或 API Key。'
      }
    }
  })
  flow.edges.push({
    id: 'i10-v6-target-profile-transition-reply',
    source: postTargetPrepareId,
    target: targetTransitionReplyId,
    sourceHandle: `${postTargetPrepareId}-output-toolAgentflow`,
    targetHandle: targetTransitionReplyId,
    type: 'buttonedge'
  })
}
// The cloned post-target preparation node returns the same MCP envelope as
// the initial prepare node.  It needs the identical deterministic projection
// before composing the explicit cross-execution confirmation message.
attachJourneyProjection(postTargetPrepareId, targetTransitionReplyId, 'post_target')

// A resume before a candidate exists must return to the frozen-proposal
// confirmation, not call candidate_ready with an empty value or an unresolved
// Flowise output template.  Once a real candidate identifier exists, the
// existing asynchronous candidate path remains intact.
const crossSessionCandidateStateId = 'customFunctionAgentflow_i10_v6_cross_session_candidate_state'
if (!flow.nodes.some(node => node.id === crossSessionCandidateStateId)) {
  flow.nodes.push({
    id: crossSessionCandidateStateId,
    position: { x: 620, y: 430 },
    type: 'customNode',
    data: {
      id: crossSessionCandidateStateId,
      label: '确认跨会话候选引用是否真实存在',
      name: 'customFunctionAgentflow',
      version: 1.1,
      type: 'CustomFunction',
      baseClasses: ['customFunctionAgentflow'],
      category: 'Agent Flows',
      inputs: {
        customFunctionInputVariables: [
          { variableName: 'candidateId', variableValue: '{{$flow.state.candidateId}}' },
          { variableName: 'journeyStatus', variableValue: '{{$flow.state.journeyStatus}}' }
        ],
        customFunctionJavascriptFunction: `const candidateId = String($candidateId || '').trim();\nconst journeyStatus = String($journeyStatus || '').trim().toUpperCase();\n// AWAITING_USER presents a frozen proposal; NEEDS_INPUT presents an input\n// request (for example EXECUTION_PLAN).  Both are answered through the same\n// single-inbound decision parse, so fold them into one route flag.\nconst decisionReady = journeyStatus === 'AWAITING_USER' || journeyStatus === 'NEEDS_INPUT' ? 'YES' : 'NO';\nreturn { hasCandidate: /^${opaqueReferences.source('candidate')}$/i.test(candidateId) ? 'YES' : 'NO', decisionReady };`,
        customFunctionUpdateState: [
          { key: 'crossSessionHasCandidate', value: '{{ output.hasCandidate }}' },
          { key: 'crossSessionDecisionReady', value: '{{ output.decisionReady }}' }
        ]
      }
    }
  })
  const crossSessionGetEdge = flow.edges.find(edge =>
    edge.source === 'toolAgentflow_i10_v4_cross_session_journey_get' && edge.target === crossSessionRoute.id)
  if (!crossSessionGetEdge) throw new Error('I10_V6_CROSS_SESSION_ROUTE_EDGE_MISSING')
  crossSessionGetEdge.target = crossSessionCandidateStateId
  crossSessionGetEdge.targetHandle = crossSessionCandidateStateId
  flow.edges.push({
    id: 'i10-v6-cross-session-candidate-state-route',
    source: crossSessionCandidateStateId,
    target: crossSessionRoute.id,
    sourceHandle: `${crossSessionCandidateStateId}-output-customFunctionAgentflow`,
    targetHandle: crossSessionRoute.id,
    type: 'buttonedge'
  })
}
// Cross-session recovery also starts with a custom-MCP response.  Project it
// before the candidate/decision route; otherwise its legacy toolUpdateState
// fields retain literal templates and every explicit approval falls back to
// the prompt again.
  attachJourneyProjection(crossSessionJourneyGet.id, crossSessionCandidateStateId, 'cross_session')
  crossSessionRoute.data.inputs.conditions = [
    { type: 'string', value1: '{{$flow.state.crossSessionHasCandidate}}', operation: 'equal', value2: 'YES' },
    { type: 'string', value1: '{{$flow.state.journeyStatus}}', operation: 'equal', value2: 'AWAITING_USER' },
    { type: 'string', value1: '{{$flow.state.journeyNextActionType}}', operation: 'equal', value2: 'SUBMIT_AUTHORING' },
    { type: 'string', value1: '{{$flow.state.journeyNextActionType}}', operation: 'equal', value2: 'COMPILE_CANDIDATE' }
  ]
  crossSessionRoute.data.outputAnchors = [
    { label: '恢复候选查询', name: '0' },
    { label: '确认冻结提案', name: '1' },
    { label: '提交作者化', name: '2' },
    { label: '编译候选脚本', name: '3' },
    { label: '作者化处理中', name: '4' }
  ]
for (const edge of flow.edges) {
  if (edge.source === crossSessionRoute.id &&
      edge.target === 'directReplyAgentflow_i10_v4_cross_session_status' &&
      edge.sourceHandle === `${crossSessionRoute.id}-output-1`) {
    edge.target = awaitingUser.id
    edge.targetHandle = awaitingUser.id
  }
}
// Flowise's native execution engine can mark a cross-execution Human Input
// stop as ERROR before its next resume.  Preserve the exact user decision via
// the normal chat input instead: a deterministic parser accepts only the two
// full phrases emitted above, then routes to the existing proposal approve or
// reject MCP tool.  This is still an explicit user choice; no transition is
// approved merely because the user says "continue".
const resumedDecisionId = 'humanInputAgentflow_i10_v6_resume_decision'
flow.nodes = flow.nodes.filter(node => node.id !== resumedDecisionId)
flow.edges = flow.edges.filter(edge => edge.source !== resumedDecisionId)
const crossDecisionParseId = 'customFunctionAgentflow_i10_v6_cross_session_decision_parse'
const crossDecisionRouteId = 'conditionAgentflow_i10_v6_cross_session_decision_route'
const crossDecisionPromptId = 'directReplyAgentflow_i10_v6_cross_session_decision_prompt'
const crossDecisionApproveId = 'toolAgentflow_i10_v6_cross_session_approve'
const crossDecisionApproveGetId = 'toolAgentflow_i10_v6_cross_session_approve_journey_get'
const crossDecisionApproveProjectionId = 'customFunctionAgentflow_i10_v6_cross_session_approve_journey_projection'
const crossDecisionApproveRouteId = 'conditionAgentflow_i10_v6_cross_session_approve_case_route'
const crossDecisionRejectId = 'toolAgentflow_i10_v6_cross_session_reject'
const crossDecisionRejectGetId = 'toolAgentflow_i10_v6_cross_session_reject_journey_get'
  const crossDecisionRejectProjectionId = 'customFunctionAgentflow_i10_v6_cross_session_reject_journey_projection'
  const crossDecisionRejectRouteId = 'conditionAgentflow_i10_v6_cross_session_reject_route'
  // A Flowise Agentflow node with multiple inbound edges is a join, not an
  // OR-merge.  Cross-session approval therefore cannot reuse the normal
  // prepare -> compile -> submit chain: it would wait forever for the normal
  // Human Input parent.  Keep the complete asynchronous authoring hand-off
  // isolated and ask the user (or the acceptance driver) to resume the same
  // journey for status afterwards.
  const crossDecisionCasePrepareId = 'toolAgentflow_i10_v6_cross_session_case_prepare'
  const crossDecisionIntentCompileId = 'customFunctionAgentflow_i10_v6_cross_session_intent_compile'
  const crossDecisionAuthoringSubmitId = 'toolAgentflow_i10_v6_cross_session_authoring_submit'
  const crossDecisionAuthoringQueuedReplyId = 'directReplyAgentflow_i10_v6_cross_session_authoring_queued'
  const crossSessionAuthoringProcessingReplyId = 'directReplyAgentflow_i10_v6_cross_session_authoring_processing'
  const crossSessionAuthoringSubmitId = 'toolAgentflow_i10_v6_cross_session_authoring_resume_submit'
  const crossSessionCandidateCompileId = 'toolAgentflow_i10_v6_cross_session_candidate_resume_compile'
  const crossDecisionExecutionPlanSubmitId = 'toolAgentflow_i10_v6_cross_session_execution_plan_submit'
  const crossDecisionInputPromptId = 'directReplyAgentflow_i10_v6_cross_session_input_prompt'
  const crossSessionRunSubmitId = 'toolAgentflow_i10_v6_cross_session_run_submit'
  const crossSessionTaskGetId = 'toolAgentflow_i10_v6_cross_session_task_get'
  const crossSessionResultInboxId = 'toolAgentflow_i10_v6_cross_session_result_inbox'
  const crossSessionResultReplyId = 'directReplyAgentflow_i10_v6_cross_session_result'
  const crossSessionCandidatePreviewId = 'toolAgentflow_i10_v6_cross_session_candidate_preview'
  const crossSessionResultPreviewId = 'toolAgentflow_i10_v6_cross_session_result_preview'
  const crossSessionResultTaskGetId = 'toolAgentflow_i10_v6_cross_session_result_task_get'
  const crossSessionScheduleCompileId = 'customFunctionAgentflow_i10_v6_cross_session_schedule_compile'
  const crossSessionScheduleCreateId = 'toolAgentflow_i10_v6_cross_session_schedule_create'
  const crossSessionScheduledReplyId = 'directReplyAgentflow_i10_v6_cross_session_scheduled'
  const crossSessionCaseInputSubmitId = 'toolAgentflow_i10_v6_cross_session_case_input_submit'
// v5 may already contain these node ids with legacy unscoped `output.*`
// templates.  Replace the three-node gate as a unit so v6 cannot silently
// retain the stale configuration from its source graph.
//
// The normal Human Input decision nodes already feed the v3 approve/reject
// tools.  Native Agentflow treats two inbound edges to a Tool as a join, not
// an OR.  Reusing those tools for a later cross-session text command therefore
// leaves the tool permanently waiting for an unrelated Human Input edge.  Keep
// each recovery route isolated through cloned decision and route nodes, then
// rejoin only at downstream nodes that have a single parent.
const crossDecisionIds = new Set([
  crossDecisionParseId, crossDecisionRouteId, crossDecisionPromptId,
  crossDecisionApproveId, crossDecisionApproveGetId, crossDecisionApproveProjectionId, crossDecisionApproveRouteId,
    crossDecisionRejectId, crossDecisionRejectGetId, crossDecisionRejectProjectionId, crossDecisionRejectRouteId,
    crossDecisionCasePrepareId, crossDecisionIntentCompileId, crossDecisionAuthoringSubmitId, crossDecisionAuthoringQueuedReplyId,
    crossSessionAuthoringProcessingReplyId, crossSessionAuthoringSubmitId, crossSessionCandidateCompileId,
    crossDecisionExecutionPlanSubmitId, crossDecisionInputPromptId,
    crossSessionRunSubmitId, crossSessionTaskGetId, crossSessionResultInboxId, crossSessionResultReplyId,
    crossSessionCandidatePreviewId, crossSessionResultPreviewId, crossSessionResultTaskGetId,
    crossSessionScheduleCompileId, crossSessionScheduleCreateId, crossSessionScheduledReplyId,
    crossSessionCaseInputSubmitId
])
flow.nodes = flow.nodes.filter(node => !crossDecisionIds.has(node.id))
flow.edges = flow.edges.filter(edge => !crossDecisionIds.has(edge.source) && !crossDecisionIds.has(edge.target))
{
  const cloneDecisionNode = (sourceId, id, label, position) => {
    const source = flow.nodes.find(node => node.id === sourceId)
    if (!source) throw new Error(`I10_V6_CROSS_SESSION_DECISION_SOURCE_MISSING:${sourceId}`)
    const clone = JSON.parse(JSON.stringify(source))
    clone.id = id
    clone.data.id = id
    clone.data.label = label
    clone.position = position
    flow.nodes.push(clone)
    return clone
  }
  flow.nodes.push({
    id: crossDecisionParseId,
    position: { x: 820, y: 430 },
    type: 'customNode',
    data: {
      id: crossDecisionParseId,
      label: '校验恢复后的冻结提案文字决定',
      name: 'customFunctionAgentflow',
      version: 1.1,
      type: 'CustomFunction',
      baseClasses: ['customFunctionAgentflow'],
      category: 'Agent Flows',
      inputs: {
        customFunctionInputVariables: [
          { variableName: 'rawInput', variableValue: '{{question}}' },
          { variableName: 'journeyId', variableValue: '{{$flow.state.journeyId}}' },
          { variableName: 'journeyStatus', variableValue: '{{$flow.state.journeyStatus}}' },
          { variableName: 'journeyInputRequest', variableValue: '{{$flow.state.journeyInputRequest}}' },
          { variableName: 'journeyProceedDecision', variableValue: '{{$flow.state.journeyProceedDecision}}' }
        ],
        customFunctionJavascriptFunction: `
const text = String($rawInput || '').trim();
const journeyId = String($journeyId || '').trim();
const escaped = journeyId.replace(/[.*+?^$\{\}()|[\\]\\\\]/g, '\\\\$&');
const status = String($journeyStatus || '').trim().toUpperCase();
const inputKind = String($journeyInputRequest || '');
const canDecide = status === 'AWAITING_USER';
const approve = new RegExp('^确认冻结案例提案\\\\s*' + escaped + '$').test(text);
const reject = new RegExp('^拒绝冻结案例提案\\\\s*' + escaped + '$').test(text);
// A NEEDS_INPUT(EXECUTION_PLAN) journey is answered with plan text, not an
// approve/reject command.  Parse the three deterministic plan shapes here
// (never via an LLM) so mode, instant, cron and timezone reach Harness exactly.
if (!canDecide && status === 'NEEDS_INPUT' && /EXECUTION_PLAN/.test(inputKind)) {
  const timezone = (text.match(/时区\\s*([A-Za-z_]+\\/[A-Za-z_]+)/) || [])[1] || 'Asia/Shanghai';
  if (/ON_DEMAND|立即执行/i.test(text)) return { route: 'EXECUTION_PLAN', executionPlan: JSON.stringify({ mode: 'ON_DEMAND' }), caseInput: '' };
  const runAt = (text.match(/执行时间\\s*([^，。]+)/) || [])[1] || '';
  if (/ONE_TIME|单次定时|执行一次/i.test(text) && runAt) return { route: 'EXECUTION_PLAN', executionPlan: JSON.stringify({ mode: 'ONE_TIME', runAt, timezone }), caseInput: '' };
  const cron = (text.match(/Cron为\\s*([^，。]+)/i) || [])[1] || '';
  if (/RECURRING|周期执行/i.test(text) && cron) return { route: 'EXECUTION_PLAN', executionPlan: JSON.stringify({ mode: 'RECURRING', cronExpression: cron.trim().replace(/\\s+/g, ' '), timezone }), caseInput: '' };
}
// A NEEDS_INPUT(INITIAL_CASE_INPUT) journey is answered with the driver's
// deterministic JSON supplement.  Validate the exact keys here (never the
// LLM) so journey_input_submit receives the frozen natural language and any
// typed business inputs byte-for-byte.
if (!canDecide && status === 'NEEDS_INPUT' && /INITIAL_CASE_INPUT/.test(inputKind)) {
  const match = text.match(/补充初始案例输入\\s*(\\{[\\s\\S]*\\})\\s*$/);
  if (match) {
    let parsed = {};
    try { parsed = JSON.parse(match[1]) } catch { parsed = {} }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && String(parsed.naturalLanguage || '').trim() && String(parsed.credentialRef || '').trim()) {
      return { route: 'CASE_INPUT', executionPlan: '', caseInput: JSON.stringify(parsed) };
    }
  }
}
return { route: canDecide && approve ? 'APPROVE' : (canDecide && reject ? 'REJECT' : (status === 'NEEDS_INPUT' ? 'PRESENT_INPUT' : 'PRESENT')), executionPlan: '', approvedDecision: canDecide && approve ? String($journeyProceedDecision || '') : '', caseInput: '' };`,
        customFunctionUpdateState: [
          { key: 'crossSessionDecisionRoute', value: '{{ output.route }}' },
          { key: 'crossSessionExecutionPlan', value: '{{ output.executionPlan }}' },
          { key: 'crossSessionApprovedDecision', value: '{{ output.approvedDecision }}' },
          { key: 'crossSessionCaseInput', value: '{{ output.caseInput }}' }
        ]
      }
    }
  })
  // Native custom-MCP tools end their current Flowise execution.  The durable
  // Journey projects SUBMIT_AUTHORING and COMPILE_CANDIDATE on a *later*
  // explicit resume, so each new execution has exactly one write tool.  This
  // avoids the old tool -> compiler -> tool chain that falsely reported a
  // running authoring task while no worker job had been created.
  const recoveryAuthoringSubmit = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_submit')))
  if (!recoveryAuthoringSubmit) throw new Error('I10_V6_RECOVERY_AUTHORING_SUBMIT_SOURCE_MISSING')
  recoveryAuthoringSubmit.id = crossSessionAuthoringSubmitId
  recoveryAuthoringSubmit.data.id = crossSessionAuthoringSubmitId
  recoveryAuthoringSubmit.data.label = 'MCP恢复旅程提交作者化'
  recoveryAuthoringSubmit.position = { x: 1000, y: 560 }
  recoveryAuthoringSubmit.data.inputs.toolInputArgs = [
    { inputArgName: 'preparationId', inputArgValue: '{{$flow.state.preparationId}}' },
    { inputArgName: 'expectedVersion', inputArgValue: '{{$flow.state.preparationVersion}}' },
    { inputArgName: 'choice', inputArgValue: 'APPROVE' },
    { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}' },
    { inputArgName: 'reason', inputArgValue: '用户已确认冻结案例，恢复提交作者化。' },
    { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
  ]
  flow.nodes.push(recoveryAuthoringSubmit)
  const recoveryCandidateCompile = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_candidate')))
  if (!recoveryCandidateCompile) throw new Error('I10_V6_RECOVERY_CANDIDATE_COMPILE_SOURCE_MISSING')
  recoveryCandidateCompile.id = crossSessionCandidateCompileId
  recoveryCandidateCompile.data.id = crossSessionCandidateCompileId
  recoveryCandidateCompile.data.label = 'MCP恢复旅程编译候选脚本'
  recoveryCandidateCompile.position = { x: 1000, y: 680 }
  recoveryCandidateCompile.data.inputs.toolInputArgs = [
    { inputArgName: 'preparationId', inputArgValue: '{{$flow.state.preparationId}}' },
    { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' },
    { inputArgName: 'waitForCertificate', inputArgValue: false }
  ]
  flow.nodes.push(recoveryCandidateCompile)
  // candidate_get and candidate_preview are both read-only, so chaining them
  // keeps the one-write-per-execution rule while the transcript gains the
  // script source reference (script.cjs lines plus the short-lived download
  // grant) that terminal evidence validation requires.
  const crossCandidatePreview = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_preview')))
  if (!crossCandidatePreview) throw new Error('I10_V6_CROSS_SESSION_CANDIDATE_PREVIEW_SOURCE_MISSING')
  crossCandidatePreview.id = crossSessionCandidatePreviewId
  crossCandidatePreview.data.id = crossSessionCandidatePreviewId
  crossCandidatePreview.data.label = 'MCP预览恢复后候选脚本源码'
  crossCandidatePreview.position = { x: 1180, y: 680 }
  flow.nodes.push(crossCandidatePreview)
  flow.edges.push({ id: 'i10-v6-cross-session-candidate-compile-preview', source: crossSessionCandidateCompileId, target: crossSessionCandidatePreviewId, sourceHandle: `${crossSessionCandidateCompileId}-output-toolAgentflow`, targetHandle: crossSessionCandidatePreviewId, type: 'buttonedge' })
  // A resumed journey can already be COMPLETED when the driver returns; the
  // compile-branch preview never fired for that history.  Re-preview the
  // certified script on the terminal read chain as well, so every terminal
  // transcript carries the script source reference regardless of where the
  // earlier sessions stopped.
  const crossResultPreview = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_preview')))
  if (!crossResultPreview) throw new Error('I10_V6_CROSS_SESSION_RESULT_PREVIEW_SOURCE_MISSING')
  crossResultPreview.id = crossSessionResultPreviewId
  crossResultPreview.data.id = crossSessionResultPreviewId
  crossResultPreview.data.label = 'MCP终态复核候选脚本源码'
  crossResultPreview.position = { x: 1900, y: 210 }
  flow.nodes.push(crossResultPreview)
  // Terminal evidence needs the finished task object itself, not only the
  // inbox summary.  All three terminal tools are read-only, so one execution
  // may chain task -> inbox -> preview before the terminal reply.
  const crossResultTaskGet = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_task')))
  if (!crossResultTaskGet) throw new Error('I10_V6_CROSS_SESSION_RESULT_TASK_GET_SOURCE_MISSING')
  crossResultTaskGet.id = crossSessionResultTaskGetId
  crossResultTaskGet.data.id = crossSessionResultTaskGetId
  crossResultTaskGet.data.label = 'MCP终态读取执行任务'
  crossResultTaskGet.position = { x: 1720, y: 210 }
  flow.nodes.push(crossResultTaskGet)
  // Schedule tail: compile the frozen plan (session state first, then the
  // authoritative journey references for recovered conversations), create the
  // confirmed schedule, and present a terminal card for the driver's
  // out-of-band awaitScheduledResult.  schedule_create is the single write;
  // the reply reads no state and ends the conversation for this mode.
  flow.nodes.push({
    id: crossSessionScheduleCompileId,
    position: { x: 1540, y: -80 },
    type: 'customNode',
    data: {
      id: crossSessionScheduleCompileId,
      label: '编译已确认调度参数',
      name: 'customFunctionAgentflow',
      version: 1.1,
      type: 'CustomFunction',
      baseClasses: ['customFunctionAgentflow'],
      category: 'Agent Flows',
      inputs: {
        customFunctionInputVariables: [
          { variableName: 'sessionPlan', variableValue: '{{$flow.state.crossSessionExecutionPlan}}' },
          { variableName: 'journeyMode', variableValue: '{{$flow.state.executionPlanMode}}' },
          { variableName: 'journeyRunAt', variableValue: '{{$flow.state.executionPlanRunAt}}' },
          { variableName: 'journeyCron', variableValue: '{{$flow.state.executionPlanCron}}' },
          { variableName: 'journeyTimezone', variableValue: '{{$flow.state.executionPlanTimezone}}' }
        ],
        customFunctionJavascriptFunction: `
const parse = value => { try { const parsed = JSON.parse(String(value || '')); return parsed && typeof parsed === 'object' ? parsed : {} } catch { return {} } };
const sessionPlan = parse($sessionPlan);
const plan = {
  mode: String(sessionPlan.mode || $journeyMode || '').trim().toUpperCase(),
  runAt: String(sessionPlan.runAt || $journeyRunAt || '').trim(),
  cronExpression: String(sessionPlan.cronExpression || $journeyCron || '').trim(),
  timezone: String(sessionPlan.timezone || $journeyTimezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
};
if (!['ONE_TIME', 'RECURRING'].includes(plan.mode)) throw new Error('I10_SCHEDULE_PLAN_MODE_MISSING');
if (plan.mode === 'ONE_TIME' && !plan.runAt) throw new Error('I10_SCHEDULE_PLAN_RUN_AT_MISSING');
if (plan.mode === 'RECURRING' && !plan.cronExpression) throw new Error('I10_SCHEDULE_PLAN_CRON_MISSING');
return {
  scheduleType: plan.mode,
  runAt: plan.mode === 'ONE_TIME' ? plan.runAt : '',
  cronExpression: plan.mode === 'RECURRING' ? plan.cronExpression : '',
  timezone: plan.timezone,
  misfirePolicy: plan.mode === 'ONE_TIME' ? 'RUN_ONCE_WITHIN_GRACE' : 'SKIP',
  misfireGraceSeconds: 300,
  maxRetries: 1
};`,
        customFunctionUpdateState: [
          { key: 'scheduleType', value: '{{ output.scheduleType }}' },
          { key: 'scheduleRunAt', value: '{{ output.runAt }}' },
          { key: 'scheduleCronExpression', value: '{{ output.cronExpression }}' },
          { key: 'scheduleTimezone', value: '{{ output.timezone }}' },
          { key: 'scheduleMisfirePolicy', value: '{{ output.misfirePolicy }}' },
          { key: 'scheduleMisfireGraceSeconds', value: '{{ output.misfireGraceSeconds }}' },
          { key: 'scheduleMaxRetries', value: '{{ output.maxRetries }}' }
        ]
      }
    }
  })
  const crossScheduleCreate = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_schedule')))
  if (!crossScheduleCreate) throw new Error('I10_V6_CROSS_SESSION_SCHEDULE_CREATE_SOURCE_MISSING')
  crossScheduleCreate.id = crossSessionScheduleCreateId
  crossScheduleCreate.data.id = crossSessionScheduleCreateId
  crossScheduleCreate.data.label = 'MCP创建已确认调度'
  crossScheduleCreate.position = { x: 1720, y: -80 }
  crossScheduleCreate.data.inputs.toolInputArgs = [
    { inputArgName: 'preparationId', inputArgValue: '{{$flow.state.preparationId}}' },
    { inputArgName: 'scheduleType', inputArgValue: '{{$flow.state.scheduleType}}' },
    { inputArgName: 'cronExpression', inputArgValue: '{{$flow.state.scheduleCronExpression}}' },
    { inputArgName: 'runAt', inputArgValue: '{{$flow.state.scheduleRunAt}}' },
    { inputArgName: 'timezone', inputArgValue: '{{$flow.state.scheduleTimezone}}' },
    { inputArgName: 'misfirePolicy', inputArgValue: '{{$flow.state.scheduleMisfirePolicy}}' },
    { inputArgName: 'misfireGraceSeconds', inputArgValue: '{{$flow.state.scheduleMisfireGraceSeconds}}' },
    { inputArgName: 'maxRetries', inputArgValue: '{{$flow.state.scheduleMaxRetries}}' },
    { inputArgName: 'confirmationRef', inputArgValue: '{{$flow.sessionId}}-schedule-confirm' },
    { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}-schedule' }
  ]
  flow.nodes.push(crossScheduleCreate)
  flow.nodes.push({
    id: crossSessionScheduledReplyId,
    position: { x: 1900, y: -80 },
    type: 'customNode',
    data: {
      id: crossSessionScheduledReplyId,
      label: '返回调度已创建状态',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: { directReplyMessage: '## 调度已经创建\n\n已按唯一冻结计划创建调度 schedule {{$flow.state.scheduleId}}，可按调度编号查询运行结果；周期调度将在验收完成后停用。不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  // NEEDS_INPUT(EXECUTION_PLAN) resumes end at this single write tool.  Like
  // the resume-authoring tools above it has no outgoing edge: native custom
  // MCP tools end the Flowise execution, and the frozen RUN/schedule proposal
  // is projected and confirmed on the user's next resume turn instead of
  // chaining a second write into this one.
  const executionPlanSubmit = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_case_correction_submit')))
  if (!executionPlanSubmit) throw new Error('I10_V6_EXECUTION_PLAN_SUBMIT_SOURCE_MISSING')
  executionPlanSubmit.id = crossDecisionExecutionPlanSubmitId
  executionPlanSubmit.data.id = crossDecisionExecutionPlanSubmitId
  executionPlanSubmit.data.label = 'MCP提交恢复后执行计划'
  executionPlanSubmit.position = { x: 1180, y: 210 }
  executionPlanSubmit.data.inputs.toolInputArgs = [
    { inputArgName: 'journeyId', inputArgValue: '{{$flow.state.journeyId}}' },
    { inputArgName: 'expectedVersion', inputArgValue: '{{$flow.state.journeyVersion}}' },
    { inputArgName: 'inputKind', inputArgValue: 'EXECUTION_PLAN' },
    { inputArgName: 'normalizedInput', inputArgValue: '{{$flow.state.crossSessionExecutionPlan}}' },
    { inputArgName: 'submissionRef', inputArgValue: '{{$flow.sessionId}}-execution-plan' },
    { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
  ]
  flow.nodes.push(executionPlanSubmit)
  // The execution tail of a cross-session resume: create the confirmed
  // on-demand run, poll its task, then read the result inbox.  Each tool ends
  // its own Flowise execution (one write per turn); the driver resumes the
  // journey afterwards, so no tool here chains into a second write.
  const crossRunSubmit = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_run')))
  if (!crossRunSubmit) throw new Error('I10_V6_CROSS_SESSION_RUN_SUBMIT_SOURCE_MISSING')
  crossRunSubmit.id = crossSessionRunSubmitId
  crossRunSubmit.data.id = crossSessionRunSubmitId
  crossRunSubmit.data.label = 'MCP提交恢复后按需执行'
  crossRunSubmit.position = { x: 1360, y: 90 }
  flow.nodes.push(crossRunSubmit)
  const crossTaskGet = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_task')))
  if (!crossTaskGet) throw new Error('I10_V6_CROSS_SESSION_TASK_GET_SOURCE_MISSING')
  crossTaskGet.id = crossSessionTaskGetId
  crossTaskGet.data.id = crossSessionTaskGetId
  crossTaskGet.data.label = 'MCP查询恢复后执行任务'
  crossTaskGet.position = { x: 1540, y: 90 }
  flow.nodes.push(crossTaskGet)
  const crossResultInbox = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_result_inbox')))
  if (!crossResultInbox) throw new Error('I10_V6_CROSS_SESSION_RESULT_INBOX_SOURCE_MISSING')
  crossResultInbox.id = crossSessionResultInboxId
  crossResultInbox.data.id = crossSessionResultInboxId
  crossResultInbox.data.label = 'MCP读取恢复后正式结果收件箱'
  crossResultInbox.position = { x: 1720, y: 90 }
  flow.nodes.push(crossResultInbox)
  flow.nodes.push({
    id: crossSessionResultReplyId,
    position: { x: 1900, y: 90 },
    type: 'customNode',
    data: {
      id: crossSessionResultReplyId,
      label: '返回跨会话正式回归终态简报',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: { directReplyMessage: '## 回归执行已结束\n\n正式结果已经形成并写入结果收件箱。\n\n{{$flow.state.journeyRenderedMarkdown}}\n\n结果引用与制品卡片见上方旅程简报。不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  flow.nodes.push({
    id: crossSessionAuthoringProcessingReplyId,
    position: { x: 820, y: 560 },
    type: 'customNode',
    data: {
      id: crossSessionAuthoringProcessingReplyId,
      label: '返回跨会话作者化处理中状态',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: { directReplyMessage: '## 作者化仍在处理中\n\n系统正在查询 Midscene 定位、Playwright 验证与候选脚本状态，无需重复提交案例。请在同一会话发送“继续处理旅程{{$flow.state.journeyId}}”查询最新进度。' }
    }
  })
  flow.nodes.push({
    id: crossDecisionRouteId,
    position: { x: 1000, y: 430 },
    type: 'customNode',
    data: {
      id: crossDecisionRouteId,
      label: '恢复后的冻结提案文字决定路由',
      name: 'conditionAgentflow',
      version: 1,
      type: 'Condition',
      baseClasses: ['conditionAgentflow'],
      category: 'Agent Flows',
      inputAnchors: [],
      outputAnchors: [{ label: '确认', name: '0' }, { label: '拒绝', name: '1' }, { label: '执行计划', name: '2' }, { label: '案例补充', name: '3' }, { label: '补充输入提示', name: '4' }, { label: '重新提示', name: '5' }],
      inputs: { conditions: [
        { type: 'string', value1: '{{$flow.state.crossSessionDecisionRoute}}', operation: 'equal', value2: 'APPROVE' },
        { type: 'string', value1: '{{$flow.state.crossSessionDecisionRoute}}', operation: 'equal', value2: 'REJECT' },
        { type: 'string', value1: '{{$flow.state.crossSessionDecisionRoute}}', operation: 'equal', value2: 'EXECUTION_PLAN' },
        { type: 'string', value1: '{{$flow.state.crossSessionDecisionRoute}}', operation: 'equal', value2: 'CASE_INPUT' },
        { type: 'string', value1: '{{$flow.state.crossSessionDecisionRoute}}', operation: 'equal', value2: 'PRESENT_INPUT' }
      ] }
    }
  })
  flow.nodes.push({
    id: crossDecisionPromptId,
    position: { x: 1180, y: 560 },
    type: 'customNode',
    data: {
      id: crossDecisionPromptId,
      label: '提示冻结提案文字确认格式',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: { directReplyMessage: '## 请确认唯一冻结提案\n\n{{$flow.state.journeyProposalSummary}}\n\n请在聊天输入框二选一发送：\n\n- `确认冻结案例提案 {{$flow.state.journeyId}}`：执行页面所示唯一冻结方案。\n- `拒绝冻结案例提案 {{$flow.state.journeyId}}`：保留当前旅程，不写入正式案例。\n\n不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  flow.nodes.push({
    id: crossDecisionInputPromptId,
    position: { x: 1000, y: 210 },
    type: 'customNode',
    data: {
      id: crossDecisionInputPromptId,
      label: '提示当前旅程所需补充输入',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: { directReplyMessage: '## 请补充当前步骤所需输入\n\n{{$flow.state.journeyNextActionText}}\n\n请按上述说明直接回复文字（例如：立即执行；2026-07-25 10:00 在 Asia/Shanghai 执行一次；每个工作日 09:00，时区 Asia/Shanghai），系统只做确定性解析与校验。\n\n不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  cloneDecisionNode('toolAgentflow_i10_v3_approve', crossDecisionApproveId, 'MCP提交恢复后冻结提案批准决定', { x: 1180, y: 330 })
  cloneDecisionNode('toolAgentflow_i10_v4_cross_session_journey_get', crossDecisionApproveGetId, '回读恢复后批准旅程状态', { x: 1360, y: 330 })
  cloneDecisionNode('conditionAgentflow_i10_v3_approve_case_route', crossDecisionApproveRouteId, '恢复后批准是否进入作者化', { x: 1720, y: 330 })
  // An approved ACTIVATE_SCRIPT proposal needs the real candidate activation
  // write, not only the Journey decision: without it no ACTIVATED plan exists
  // and the later run_submit fails closed with I8_SCRIPT_NOT_ACTIVATED.
  const approveRoute = flow.nodes.find(node => node.id === crossDecisionApproveRouteId)
  approveRoute.data.inputs.conditions.push({ type: 'string', value1: '{{$flow.state.crossSessionApprovedDecision}}', operation: 'equal', value2: 'ACTIVATE_SCRIPT' })
  approveRoute.data.outputAnchors = [
    { label: '进入案例准备', name: '0' }, { label: '执行真实激活', name: '1' }, { label: '其他', name: '2' }
  ]
  const crossSessionCandidateActivateId = 'toolAgentflow_i10_v6_cross_session_candidate_activate'
  const crossCandidateActivate = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_activate')))
  if (!crossCandidateActivate) throw new Error('I10_V6_CROSS_SESSION_CANDIDATE_ACTIVATE_SOURCE_MISSING')
  crossCandidateActivate.id = crossSessionCandidateActivateId
  crossCandidateActivate.data.id = crossSessionCandidateActivateId
  crossCandidateActivate.data.label = 'MCP执行恢复后真实候选激活'
  crossCandidateActivate.position = { x: 1900, y: 210 }
  flow.nodes.push(crossCandidateActivate)
  // JOIN repair: the legacy result-inbox and schedule-disable tools each have
  // two inbound edges, which native Agentflow treats as a join, so reaching
  // them from the query/disable routes alone stalls with an empty reply (the
  // acceptance driver's out-of-band schedule wait and recurring cleanup depend
  // on these routes).  Give each route its own single-parent clone chain.
  const joinRepairs = [
    {
      routeId: 'conditionAgentflow_i10_v5_result_query_route', routeHandle: 'output-0',
      sourceNodeId: 'toolAgentflow_i10_v3_result_inbox', cloneNodeId: 'toolAgentflow_i10_v6_result_query_inbox',
      sourceReplyId: 'directReplyAgentflow_i10_v3_result_inbox_reply', cloneReplyId: 'directReplyAgentflow_i10_v6_result_query_reply'
    },
    {
      routeId: 'humanInputAgentflow_schedule_disable', routeHandle: 'output-0',
      sourceNodeId: 'toolAgentflow_i10_v3_schedule_disable', cloneNodeId: 'toolAgentflow_i10_v6_schedule_disable',
      sourceReplyId: 'directReplyAgentflow_i10_v3_schedule_disabled', cloneReplyId: 'directReplyAgentflow_i10_v6_schedule_disabled'
    }
  ]
  for (const repair of joinRepairs) {
    flow.nodes = flow.nodes.filter(node => node.id !== repair.cloneNodeId && node.id !== repair.cloneReplyId)
    const sourceNode = flow.nodes.find(node => node.id === repair.sourceNodeId)
    const sourceReply = flow.nodes.find(node => node.id === repair.sourceReplyId)
    if (!sourceNode || !sourceReply) throw new Error(`I10_V6_JOIN_REPAIR_SOURCE_MISSING:${repair.sourceNodeId}`)
    const cloneNode = JSON.parse(JSON.stringify(sourceNode))
    cloneNode.id = repair.cloneNodeId
    cloneNode.data.id = repair.cloneNodeId
    cloneNode.data.label = `${sourceNode.data.label}（隔离查询路由）`
    cloneNode.position = { x: Number(sourceNode.position?.x || 0) + 40, y: Number(sourceNode.position?.y || 0) - 120 }
    flow.nodes.push(cloneNode)
    const cloneReply = JSON.parse(JSON.stringify(sourceReply))
    cloneReply.id = repair.cloneReplyId
    cloneReply.data.id = repair.cloneReplyId
    cloneReply.data.label = `${sourceReply.data.label}（隔离查询路由）`
    cloneReply.position = { x: Number(sourceReply.position?.x || 0) + 40, y: Number(sourceReply.position?.y || 0) - 120 }
    flow.nodes.push(cloneReply)
    flow.edges = flow.edges.filter(edge => !(edge.source === repair.routeId && edge.target === repair.sourceNodeId))
    flow.edges.push({ id: `i10-v6-join-repair-${repair.cloneNodeId}`, source: repair.routeId, target: repair.cloneNodeId, sourceHandle: `${repair.routeId}-${repair.routeHandle}`, targetHandle: repair.cloneNodeId, type: 'buttonedge' })
    flow.edges.push({ id: `i10-v6-join-repair-${repair.cloneReplyId}`, source: repair.cloneNodeId, target: repair.cloneReplyId, sourceHandle: `${repair.cloneNodeId}-output-toolAgentflow`, targetHandle: repair.cloneReplyId, type: 'buttonedge' })
  }
  cloneDecisionNode('toolAgentflow_i10_v3_reject', crossDecisionRejectId, 'MCP提交恢复后冻结提案拒绝决定', { x: 1180, y: 450 })
  cloneDecisionNode('toolAgentflow_i10_v4_cross_session_journey_get', crossDecisionRejectGetId, '回读恢复后拒绝旅程状态', { x: 1360, y: 450 })
  cloneDecisionNode('conditionAgentflow_i10_v4_reject_route', crossDecisionRejectRouteId, '恢复后拒绝是否进入案例修订', { x: 1720, y: 450 })
  cloneDecisionNode('toolAgentflow_prepare', crossDecisionCasePrepareId, 'MCP准备恢复后已批准案例', { x: 1900, y: 330 })
  // The recovery path must compile from the immutable CaseDraft returned by
  // case_prepare.  A legacy v4 clone read controllerDraft_* transient state;
  // that state is not guaranteed to exist in a new Flowise execution, so the
  // tool chain could mark a Journey PROCESSING without ever creating a build
  // job.  The normal intent compiler consumes caseDraftJson, which the prepare
  // tool updates deterministically on this exact path.
  cloneDecisionNode('llmAgentflow_intent', crossDecisionIntentCompileId, '确定性编译恢复后作者化意图', { x: 2080, y: 330 })
  cloneDecisionNode('toolAgentflow_submit', crossDecisionAuthoringSubmitId, 'MCP提交恢复后作者化意图', { x: 2260, y: 330 })
  flow.nodes.push({
    id: crossDecisionAuthoringQueuedReplyId,
    position: { x: 2440, y: 330 },
    type: 'customNode',
    data: {
      id: crossDecisionAuthoringQueuedReplyId,
      label: '返回恢复后作者化已提交状态',
      name: 'directReplyAgentflow',
      version: 1,
      type: 'Direct Reply',
      baseClasses: ['directReplyAgentflow'],
      category: 'Agent Flows',
      inputs: { directReplyMessage: '## 作者化任务已提交\n\n案例已冻结并进入异步作者化。系统将由 Midscene 定位、Playwright 执行并生成候选脚本；此处不会同步等待长任务完成。\n\n请在稍后需要查询时发送：`继续处理旅程 {{$flow.state.journeyId}}`。\n\n不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  // attachJourneyProjection replaces a real Tool->target edge.  Seed the two
  // isolated recovery edges before inserting their projection nodes.
  flow.edges.push({ id: 'i10-v6-cross-session-decision-approve-read', source: crossDecisionApproveGetId, target: crossDecisionApproveRouteId, sourceHandle: `${crossDecisionApproveGetId}-output-toolAgentflow`, targetHandle: crossDecisionApproveRouteId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-reject-read', source: crossDecisionRejectGetId, target: crossDecisionRejectRouteId, sourceHandle: `${crossDecisionRejectGetId}-output-toolAgentflow`, targetHandle: crossDecisionRejectRouteId, type: 'buttonedge' })
  attachJourneyProjection(crossDecisionApproveGetId, crossDecisionApproveRouteId, 'cross_session_approve')
  attachJourneyProjection(crossDecisionRejectGetId, crossDecisionRejectRouteId, 'cross_session_reject')
  // A NEEDS_INPUT journey (for example the EXECUTION_PLAN ask after a
  // successful activation) used to fall through to the "authoring still
  // processing" else reply, which made the acceptance driver poll forever.
  // A second inbound edge into the shared decision parse would be a JOIN in
  // native Agentflow semantics and block it forever, so decision readiness is
  // folded into one deterministic flag by the candidate-state function and
  // matched through the existing single edge instead.
  const crossRouteInputs = crossSessionRoute.data.inputs
  const decisionReadyCondition = { type: 'string', value1: '{{$flow.state.crossSessionDecisionReady}}', operation: 'equal', value2: 'YES' }
  const awaitingIndex = crossRouteInputs.conditions.findIndex(condition => condition.value1 === '{{$flow.state.journeyStatus}}' && condition.value2 === 'AWAITING_USER')
  if (awaitingIndex >= 0) crossRouteInputs.conditions[awaitingIndex] = decisionReadyCondition
  // A confirmed RUN_ON_DEMAND decision only flips the Journey to RUNNING with
  // a CALL_RUN_SUBMIT next action; the actual task is created by the tool
  // branch below.  QUERY_TASK polls it and RESULT_AVAILABLE renders the
  // terminal reply.  Without these three branches the projection silently
  // rewound the Journey to READY_FOR_SCRIPT_ACTIVATION and the driver looped
  // on phantom activation proposals forever.
  for (const actionType of ['CALL_RUN_SUBMIT', 'QUERY_TASK', 'RESULT_AVAILABLE', 'CALL_SCHEDULE_CREATE', 'QUERY_SCHEDULE']) {
    if (!crossRouteInputs.conditions.some(condition => condition.value2 === actionType)) {
      crossRouteInputs.conditions.push({ type: 'string', value1: '{{$flow.state.journeyNextActionType}}', operation: 'equal', value2: actionType })
    }
  }
  crossSessionRoute.data.outputAnchors = [
    { label: '恢复候选查询', name: '0' }, { label: '确认冻结提案', name: '1' }, { label: '提交作者化', name: '2' },
    { label: '编译候选脚本', name: '3' }, { label: '提交按需执行', name: '4' }, { label: '查询执行任务', name: '5' },
    { label: '读取正式结果', name: '6' }, { label: '作者化处理中', name: '7' }
  ]
  // The candidate reference is now projected for real, which would make the
  // legacy hasCandidate branch fire and divert every cross-session resume
  // into the single-session candidate path.  That branch was written before
  // the isolated cross-session chain existed and can only dead-end here, so
  // it is removed and every later output shifts down by one.
  const hasCandidateIndex = crossRouteInputs.conditions.findIndex(condition => condition.value1 === '{{$flow.state.crossSessionHasCandidate}}')
  if (hasCandidateIndex >= 0) crossRouteInputs.conditions.splice(hasCandidateIndex, 1)
  crossSessionRoute.data.outputAnchors = [
    { label: '确认冻结提案或补充输入', name: '0' }, { label: '提交作者化', name: '1' }, { label: '编译候选脚本', name: '2' },
    { label: '提交按需执行', name: '3' }, { label: '查询执行任务', name: '4' }, { label: '读取正式结果', name: '5' },
    { label: '创建已确认调度', name: '6' }, { label: '返回调度已创建', name: '7' }, { label: '作者化处理中', name: '8' }
  ]
  flow.edges = flow.edges.filter(edge => !(edge.source === crossSessionRoute.id && edge.sourceHandle === `${crossSessionRoute.id}-output-0` && edge.target === 'toolAgentflow_candidate_ready'))
  for (const edge of flow.edges) {
    if (edge.source !== crossSessionRoute.id) continue
    const handleMatch = edge.sourceHandle.match(/-output-(\d+)$/)
    if (handleMatch && Number(handleMatch[1]) > 0) edge.sourceHandle = `${crossSessionRoute.id}-output-${Number(handleMatch[1]) - 1}`
  }
  for (const edge of flow.edges) {
    if (edge.source === crossSessionRoute.id &&
        edge.target === awaitingUser.id &&
        edge.sourceHandle === `${crossSessionRoute.id}-output-0`) {
      edge.target = crossDecisionParseId
      edge.targetHandle = crossDecisionParseId
    }
  }
  flow.edges.push({ id: 'i10-v6-cross-session-decision-parse-route', source: crossDecisionParseId, target: crossDecisionRouteId, sourceHandle: `${crossDecisionParseId}-output-customFunctionAgentflow`, targetHandle: crossDecisionRouteId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-approve', source: crossDecisionRouteId, target: crossDecisionApproveId, sourceHandle: `${crossDecisionRouteId}-output-0`, targetHandle: crossDecisionApproveId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-approve-get', source: crossDecisionApproveId, target: crossDecisionApproveGetId, sourceHandle: `${crossDecisionApproveId}-output-toolAgentflow`, targetHandle: crossDecisionApproveGetId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-approve-author', source: crossDecisionApproveRouteId, target: crossDecisionCasePrepareId, sourceHandle: `${crossDecisionApproveRouteId}-output-0`, targetHandle: crossDecisionCasePrepareId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-approve-activate', source: crossDecisionApproveRouteId, target: crossSessionCandidateActivateId, sourceHandle: `${crossDecisionApproveRouteId}-output-1`, targetHandle: crossSessionCandidateActivateId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-case-prepare-compile', source: crossDecisionCasePrepareId, target: crossDecisionIntentCompileId, sourceHandle: `${crossDecisionCasePrepareId}-output-toolAgentflow`, targetHandle: crossDecisionIntentCompileId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-compile-submit', source: crossDecisionIntentCompileId, target: crossDecisionAuthoringSubmitId, sourceHandle: `${crossDecisionIntentCompileId}-output-customFunctionAgentflow`, targetHandle: crossDecisionAuthoringSubmitId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-submit-queued', source: crossDecisionAuthoringSubmitId, target: crossDecisionAuthoringQueuedReplyId, sourceHandle: `${crossDecisionAuthoringSubmitId}-output-toolAgentflow`, targetHandle: crossDecisionAuthoringQueuedReplyId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-approve-other', source: crossDecisionApproveRouteId, target: 'conditionAgentflow_i10_v3_awaiting_user', sourceHandle: `${crossDecisionApproveRouteId}-output-2`, targetHandle: 'conditionAgentflow_i10_v3_awaiting_user', type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-reject', source: crossDecisionRouteId, target: crossDecisionRejectId, sourceHandle: `${crossDecisionRouteId}-output-1`, targetHandle: crossDecisionRejectId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-reject-get', source: crossDecisionRejectId, target: crossDecisionRejectGetId, sourceHandle: `${crossDecisionRejectId}-output-toolAgentflow`, targetHandle: crossDecisionRejectGetId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-reject-correct', source: crossDecisionRejectRouteId, target: 'humanInputAgentflow_i10_v4_case_correction', sourceHandle: `${crossDecisionRejectRouteId}-output-0`, targetHandle: 'humanInputAgentflow_i10_v4_case_correction', type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-reject-card', source: crossDecisionRejectRouteId, target: 'directReplyAgentflow_i10_v3_card', sourceHandle: `${crossDecisionRejectRouteId}-output-1`, targetHandle: 'directReplyAgentflow_i10_v3_card', type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-prompt', source: crossDecisionRouteId, target: crossDecisionPromptId, sourceHandle: `${crossDecisionRouteId}-output-5`, targetHandle: crossDecisionPromptId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-input-prompt', source: crossDecisionRouteId, target: crossDecisionInputPromptId, sourceHandle: `${crossDecisionRouteId}-output-4`, targetHandle: crossDecisionInputPromptId, type: 'buttonedge' })
  flow.edges.push({ id: 'i10-v6-cross-session-decision-execution-plan', source: crossDecisionRouteId, target: crossDecisionExecutionPlanSubmitId, sourceHandle: `${crossDecisionRouteId}-output-2`, targetHandle: crossDecisionExecutionPlanSubmitId, type: 'buttonedge' })
  // INITIAL_CASE_INPUT supplement: the driver's deterministic JSON is already
  // validated by decision-parse; this single write submits it byte-for-byte.
  const crossCaseInputSubmit = JSON.parse(JSON.stringify(flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_initial_case_submit')))
  if (!crossCaseInputSubmit) throw new Error('I10_V6_CROSS_SESSION_CASE_INPUT_SUBMIT_SOURCE_MISSING')
  crossCaseInputSubmit.id = crossSessionCaseInputSubmitId
  crossCaseInputSubmit.data.id = crossSessionCaseInputSubmitId
  crossCaseInputSubmit.data.label = 'MCP提交恢复后初始案例补充'
  crossCaseInputSubmit.position = { x: 1180, y: 90 }
  crossCaseInputSubmit.data.inputs.toolInputArgs = [
    { inputArgName: 'journeyId', inputArgValue: '{{$flow.state.journeyId}}' },
    { inputArgName: 'expectedVersion', inputArgValue: '{{$flow.state.journeyVersion}}' },
    { inputArgName: 'inputKind', inputArgValue: 'INITIAL_CASE_INPUT' },
    { inputArgName: 'normalizedInput', inputArgValue: '{{$flow.state.crossSessionCaseInput}}' },
    { inputArgName: 'submissionRef', inputArgValue: '{{$flow.sessionId}}-initial-case-input' },
    { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' }
  ]
  flow.nodes.push(crossCaseInputSubmit)
  flow.edges.push({ id: 'i10-v6-cross-session-decision-case-input', source: crossDecisionRouteId, target: crossSessionCaseInputSubmitId, sourceHandle: `${crossDecisionRouteId}-output-3`, targetHandle: crossSessionCaseInputSubmitId, type: 'buttonedge' })
  flow.edges.push(
    { id: 'i10-v6-cross-session-authoring-resume-submit', source: crossSessionRoute.id, target: crossSessionAuthoringSubmitId, sourceHandle: `${crossSessionRoute.id}-output-1`, targetHandle: crossSessionAuthoringSubmitId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-candidate-resume-compile', source: crossSessionRoute.id, target: crossSessionCandidateCompileId, sourceHandle: `${crossSessionRoute.id}-output-2`, targetHandle: crossSessionCandidateCompileId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-run-submit', source: crossSessionRoute.id, target: crossSessionRunSubmitId, sourceHandle: `${crossSessionRoute.id}-output-3`, targetHandle: crossSessionRunSubmitId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-task-get', source: crossSessionRoute.id, target: crossSessionTaskGetId, sourceHandle: `${crossSessionRoute.id}-output-4`, targetHandle: crossSessionTaskGetId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-result-inbox', source: crossSessionRoute.id, target: crossSessionResultTaskGetId, sourceHandle: `${crossSessionRoute.id}-output-5`, targetHandle: crossSessionResultTaskGetId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-result-task-inbox', source: crossSessionResultTaskGetId, target: crossSessionResultInboxId, sourceHandle: `${crossSessionResultTaskGetId}-output-toolAgentflow`, targetHandle: crossSessionResultInboxId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-result-inbox-preview', source: crossSessionResultInboxId, target: crossSessionResultPreviewId, sourceHandle: `${crossSessionResultInboxId}-output-toolAgentflow`, targetHandle: crossSessionResultPreviewId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-result-preview-reply', source: crossSessionResultPreviewId, target: crossSessionResultReplyId, sourceHandle: `${crossSessionResultPreviewId}-output-toolAgentflow`, targetHandle: crossSessionResultReplyId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-schedule-compile', source: crossSessionRoute.id, target: crossSessionScheduleCompileId, sourceHandle: `${crossSessionRoute.id}-output-6`, targetHandle: crossSessionScheduleCompileId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-schedule-compile-create', source: crossSessionScheduleCompileId, target: crossSessionScheduleCreateId, sourceHandle: `${crossSessionScheduleCompileId}-output-customFunctionAgentflow`, targetHandle: crossSessionScheduleCreateId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-scheduled-reply', source: crossSessionRoute.id, target: crossSessionScheduledReplyId, sourceHandle: `${crossSessionRoute.id}-output-7`, targetHandle: crossSessionScheduledReplyId, type: 'buttonedge' },
    { id: 'i10-v6-cross-session-authoring-processing', source: crossSessionRoute.id, target: crossSessionAuthoringProcessingReplyId, sourceHandle: `${crossSessionRoute.id}-output-8`, targetHandle: crossSessionAuthoringProcessingReplyId, type: 'buttonedge' }
  )
}
// The old cross-session status card was replaced by the actual frozen-proposal
// gate above.  Remove the now-unreachable display-only node so graph
// validation continues to reject dead interaction paths.
flow.nodes = flow.nodes.filter(node => node.id !== 'directReplyAgentflow_i10_v4_cross_session_status')

const resumeInputs = resumeDetect.data.inputs.customFunctionInputVariables || []
if (!resumeInputs.some(item => item?.variableName === 'journeyId')) {
  resumeInputs.push({ variableName: 'journeyId', variableValue: '{{$flow.state.journeyId}}' })
}
resumeDetect.data.inputs.customFunctionInputVariables = resumeInputs
resumeDetect.data.inputs.customFunctionJavascriptFunction = `
const text = String($rawInput || '').trim();
const candidateJobId = String($candidateJobId || '').trim();
const ingestJobId = String($ingestJobId || '').trim();
const currentJourneyId = String($journeyId || '').trim();
const exactImage = text.match(/^(确认|拒绝)图片事实\\s*(imageingest_[0-9a-f-]{36})$/i);
const confirmedImage = text.match(/^继续已确认图片\\s*(imageingest_[0-9a-f-]{36})$/i);
const imageDecision = exactImage ? (exactImage[1] === '确认' ? 'CONFIRM' : 'REJECT') : (confirmedImage ? 'CONTINUE_CONFIRMED' : '');
const imageIngestId = exactImage ? exactImage[2] : (confirmedImage ? confirmedImage[1] : '');
const exactJourney = text.match(/(?:恢复|继续)(?:处理)?(?:旅程)?\\s*(journey_[0-9a-f-]{36})|resume\\s*(journey_[0-9a-f-]{36})|(?:确认|拒绝)冻结案例提案\\s*(journey_[0-9a-f-]{36})/i);
const explicitJourneyId = exactJourney ? (exactJourney[1] || exactJourney[2] || exactJourney[3]) : '';
const wantsResume = /^(继续|恢复|查询进度|继续查询|resume|确认冻结案例提案|拒绝冻结案例提案)(?:处理)?(?:旅程)?/i.test(text);
const journeyId = explicitJourneyId || (wantsResume && /^journey_[0-9a-f-]{36}$/i.test(currentJourneyId) ? currentJourneyId : '');
return {
  // A confirmed image starts a fresh Flowise execution. It must not re-enter
  // the general classifier: that path can invoke the large controller prompt
  // and loses the confirmed OCR facts. Route it to the isolated image chain.
  route: imageIngestId && imageDecision === 'CONTINUE_CONFIRMED'
    ? 'RESUME_IMAGE_CONFIRMED'
    : (imageIngestId ? 'RESUME_IMAGE_FACTS'
      : (wantsResume && ingestJobId ? 'RESUME_INGEST' : (journeyId ? 'RESUME_JOURNEY' : (wantsResume && candidateJobId ? 'RESUME_CANDIDATE' : 'CLASSIFY')))),
  journeyId,
  imageIngestId,
  imageDecision
};`
const resumeUpdates = resumeDetect.data.inputs.customFunctionUpdateState || []
for (const [key, value] of [
  ['resumeImageIngestId', '{{ output.imageIngestId }}'],
  ['resumeImageDecision', '{{ output.imageDecision }}'],
  ['imageIngestId', '{{ output.imageIngestId }}']
]) {
  const existing = resumeUpdates.find(item => item?.key === key)
  if (existing) existing.value = value
  else resumeUpdates.push({ key, value })
}
resumeDetect.data.inputs.customFunctionUpdateState = resumeUpdates

// The resume command is a fresh chat execution. Declare these transient
// routing values explicitly so Flowise initializes them before conditions
// evaluate them.
if (!Array.isArray(startState)) throw new Error('I10_V6_START_STATE_MISSING')
for (const key of ['resumeImageIngestId', 'resumeImageDecision']) {
  if (!startState.some(item => item?.key === key)) startState.push({ key, value: '' })
}

// A second native Human Input stop in the same Flowise execution can become
// ERROR instead of STOPPED. Image fact confirmation had that exact shape.
// Present an explicit opaque-id command, then process it in a fresh execution
// by rereading the authoritative facts. Confirmation remains explicit; reject
// preserves the image task and enters the existing correction path.
const imageFactsGate = flow.nodes.find(node => node.id === 'humanInputAgentflow_i10_v4_image_facts_gate')
const imageStatus = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v4_image_status')
const imageSubmit = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_image_submit')
const imageGet = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_image_get')
const imageSuggestedDecisions = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v4_image_suggested_decisions')
const imageCorrectionInput = flow.nodes.find(node => node.id === 'humanInputAgentflow_i10_v4_image_correction_input')
const imageDecisionSubmit = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_image_decision_submit')
const candidateResumeRoute = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v4_candidate_resume_route')
if (!imageFactsGate || !imageStatus || !imageSubmit || !imageGet || !imageSuggestedDecisions || !imageCorrectionInput || !imageDecisionSubmit || !candidateResumeRoute) {
  throw new Error('I10_V6_IMAGE_FACT_RESUME_NODES_MISSING')
}
const imageSubmitArgs = imageSubmit.data.inputs.toolInputArgs || []
if (!imageSubmitArgs.some(item => item?.inputArgName === 'credentialRef')) {
  imageSubmitArgs.splice(Math.max(0, imageSubmitArgs.length - 1), 0, {
    inputArgName: 'credentialRef', inputArgValue: '{{$flow.state.credentialRef}}'
  })
}
imageSubmit.data.inputs.toolInputArgs = imageSubmitArgs
const imageTransitionReplyId = 'directReplyAgentflow_i10_v6_image_facts_transition'
const imageResumeDecisionRouteId = 'conditionAgentflow_i10_v6_image_facts_resume_decision_route'
if (!flow.nodes.some(node => node.id === imageTransitionReplyId)) {
  flow.nodes.push({
    id: imageTransitionReplyId,
    position: { x: 2220, y: -40 }, type: 'customNode',
    data: {
      id: imageTransitionReplyId, label: '提示确认图片事实', name: 'directReplyAgentflow', version: 1,
      type: 'Direct Reply', baseClasses: ['directReplyAgentflow'], category: 'Agent Flows',
      inputs: { directReplyMessage: '## 图片事实已准备\n\n{{$flow.state.imageFactsBrief}}\n\n请在聊天输入框二选一发送：\n\n- `确认图片事实 {{$flow.state.imageIngestId}}`：确认当前全部图片事实，并进入案例草案整理。\n- `拒绝图片事实 {{$flow.state.imageIngestId}}`：保留图片任务，进入纠正说明。\n\n不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  const imageWaitingEdge = flow.edges.find(edge =>
    edge.source === imageStatus.id && edge.target === imageFactsGate.id &&
    edge.sourceHandle === `${imageStatus.id}-output-0`)
  if (!imageWaitingEdge) throw new Error('I10_V6_IMAGE_WAITING_EDGE_MISSING')
  imageWaitingEdge.target = imageTransitionReplyId
  imageWaitingEdge.targetHandle = imageTransitionReplyId

  const resumeConditions = candidateResumeRoute.data.inputs.conditions || []
  resumeConditions.push(
    { type: 'string', value1: '{{$flow.state.resumeRoute}}', operation: 'equal', value2: 'RESUME_IMAGE_FACTS' },
    { type: 'string', value1: '{{$flow.state.resumeRoute}}', operation: 'equal', value2: 'RESUME_IMAGE_CONFIRMED' }
  )
  candidateResumeRoute.data.inputs.conditions = resumeConditions
  candidateResumeRoute.data.outputAnchors = [
    { label: '恢复候选', name: '0' }, { label: '跨会话恢复旅程', name: '1' },
    { label: '恢复异步附件导入', name: '2' }, { label: '恢复图片事实决定', name: '3' },
    { label: '继续已确认图片作者化', name: '4' }, { label: '正常分类', name: '5' }
  ]
  const normalClassifyEdge = flow.edges.find(edge =>
    edge.source === candidateResumeRoute.id && edge.target === 'llmAgentflow_i10_v3_classify')
  if (!normalClassifyEdge) throw new Error('I10_V6_NORMAL_CLASSIFY_EDGE_MISSING')
  normalClassifyEdge.sourceHandle = `${candidateResumeRoute.id}-output-5`
  flow.nodes.push({
    id: imageResumeDecisionRouteId, position: { x: 2400, y: -40 }, type: 'customNode',
    data: {
      id: imageResumeDecisionRouteId, label: '图片事实文字决定路由', name: 'conditionAgentflow', version: 1,
      type: 'Condition', baseClasses: ['conditionAgentflow'], category: 'Agent Flows', inputAnchors: [],
      outputAnchors: [{ label: '拒绝并纠正', name: '0' }, { label: '已确认继续作者化', name: '1' }, { label: '确认图片事实', name: '2' }],
      inputs: { conditions: [
        { type: 'string', value1: '{{$flow.state.resumeImageDecision}}', operation: 'equal', value2: 'REJECT' },
        { type: 'string', value1: '{{$flow.state.resumeImageDecision}}', operation: 'equal', value2: 'CONTINUE_CONFIRMED' }
      ] }
    }
  })
  flow.edges.push(
    // Flowise persists the OCR facts inside this chat session. A second native
    // MCP image_get call would be a terminal boundary, so all exact image
    // decisions route directly from the resume gate using that saved state.
    { id: 'i10-v6-resume-image-facts-decision-route', source: candidateResumeRoute.id, target: imageResumeDecisionRouteId, sourceHandle: `${candidateResumeRoute.id}-output-3`, targetHandle: imageResumeDecisionRouteId, type: 'buttonedge' },
    { id: 'i10-v6-resume-image-facts-reject', source: imageResumeDecisionRouteId, target: imageCorrectionInput.id, sourceHandle: `${imageResumeDecisionRouteId}-output-0`, targetHandle: imageCorrectionInput.id, type: 'buttonedge' },
    { id: 'i10-v6-resume-confirmed-image-author', source: imageResumeDecisionRouteId, target: 'customFunctionAgentflow_i10_v5_initial_prompt', sourceHandle: `${imageResumeDecisionRouteId}-output-1`, targetHandle: 'customFunctionAgentflow_i10_v5_initial_prompt', type: 'buttonedge' },
    { id: 'i10-v6-resume-image-facts-confirm', source: imageResumeDecisionRouteId, target: imageSuggestedDecisions.id, sourceHandle: `${imageResumeDecisionRouteId}-output-2`, targetHandle: imageSuggestedDecisions.id, type: 'buttonedge' }
  )
}
// Flowise cannot safely resume two Human Input nodes within one execution.
// The initial WAITING edge has now been retargeted above; remove the retired
// gate and only its remaining correction edge.
flow.nodes = flow.nodes.filter(node => node.id !== imageFactsGate.id)
flow.edges = flow.edges.filter(edge => edge.source !== imageFactsGate.id && edge.target !== imageFactsGate.id)

// Flowise treats a node with inputs from different conditional roots as an
// AND-join.  The inherited graph sent both the normal no-image branch and the
// confirmed-image branch to one shared authoring chain, so a real confirmed
// OCR task could stop at a fulfilled Condition forever.  Keep the same
// deterministic prompt -> controller -> normalizer -> journey contract, but
// give each conditional entry an isolated linear copy.  This is deliberately
// a graph-level compatibility fix; it does not duplicate MCP capabilities or
// change the Harness state machine.
const sharedInitialPrompt = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v5_initial_prompt')
const sharedStructure = flow.nodes.find(node => node.id === 'llmAgentflow_i10_v3_structure')
const sharedNormalizer = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v3_normalize')
const sharedPrepareHydrate = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v5_prepare_hydrate')
if (!sharedInitialPrompt || !sharedStructure || !sharedNormalizer || !sharedPrepareHydrate) {
  throw new Error('I10_V6_ISOLATED_AUTHORING_SOURCE_NODES_MISSING')
}
function cloneNode(node, id, label, position) {
  const clone = JSON.parse(JSON.stringify(node))
  clone.id = id
  clone.data.id = id
  clone.data.label = label
  clone.position = position
  flow.nodes.push(clone)
  return clone
}
function redirectEdge(sourceId, sourceHandle, fromId, toId, edgeId) {
  const edge = flow.edges.find(item => item.source === sourceId && item.sourceHandle === sourceHandle && item.target === fromId)
  if (!edge) throw new Error(`I10_V6_ISOLATED_AUTHORING_ENTRY_MISSING:${edgeId}`)
  edge.id = edgeId
  edge.target = toId
  edge.targetHandle = toId
}
function attachIsolatedAuthoringChain({ suffix, sourceId, sourceHandle, y }) {
  const promptId = `customFunctionAgentflow_i10_v6_${suffix}_prompt`
  const structureId = `llmAgentflow_i10_v6_${suffix}_structure`
  const structureParseId = `customFunctionAgentflow_i10_v6_${suffix}_structure_parse`
  const normalizerId = `customFunctionAgentflow_i10_v6_${suffix}_normalize`
  const hydrateId = `customFunctionAgentflow_i10_v6_${suffix}_prepare_hydrate`
  const prepareId = `toolAgentflow_i10_v6_${suffix}_journey_prepare`
  const projectionId = `customFunctionAgentflow_i10_v6_${suffix}_journey_projection`
  const replyId = `directReplyAgentflow_i10_v6_${suffix}_journey_ready`
  const ids = [promptId, structureId, structureParseId, normalizerId, hydrateId, prepareId, projectionId, replyId]
  if (ids.some(id => flow.nodes.some(node => node.id === id))) {
    throw new Error(`I10_V6_ISOLATED_AUTHORING_DUPLICATE:${suffix}`)
  }
  cloneNode(sharedInitialPrompt, promptId, '形成紧凑案例上下文（隔离恢复）', { x: 3400, y })
  const isolatedStructure = cloneNode(sharedStructure, structureId, '紧凑案例JSON生成（隔离恢复）', { x: 3620, y })
  const structuredStateUpdates = JSON.parse(JSON.stringify(isolatedStructure.data.inputs.llmUpdateState || []))
  // Flowise's llmStructuredOutput wrapper may convert an otherwise valid
  // response-format JSON completion into content:"", which then fails inside
  // its parser before the graph can preserve evidence.  Ask the model for the
  // same bounded JSON text and parse it in the following deterministic node.
  isolatedStructure.data.inputs.llmStructuredOutput = []
  isolatedStructure.data.inputs.llmReturnResponseAs = ''
  isolatedStructure.data.inputs.llmUpdateState = [{ key: 'controllerDraftRawJson', value: '{{ output }}' }]
  flow.nodes.push({
    id: structureParseId, position: { x: 3840, y }, type: 'customNode',
    data: {
      id: structureParseId, label: '严格解析紧凑案例JSON（隔离恢复）', name: 'customFunctionAgentflow', version: 1,
      type: 'Custom Function', baseClasses: ['customFunctionAgentflow'], category: 'Agent Flows',
      inputs: {
        customFunctionInputVariables: [
          { variableName: 'raw', variableValue: '{{$flow.state.controllerDraftRawJson}}' },
          { variableName: 'priorDraft', variableValue: '{{$flow.state.caseDraftJson}}' }
        ],
        customFunctionJavascriptFunction: `
const source = String($raw || '').trim();
const fenced = source.match(/^\\x60\\x60\\x60(?:json)?\\s*([\\s\\S]*?)\\s*\\x60\\x60\\x60$/i);
const text = fenced ? fenced[1] : source;
let value;
if (text) {
  try { value = JSON.parse(text); } catch { throw new Error('I10_CONTROLLER_DRAFT_JSON_INVALID'); }
} else {
  // Image-confirmation resumes already own an authoritative CaseDraft in
  // durable Flow state. Some OpenAI-compatible providers occasionally expose
  // an empty native LLM output even though the prior draft is intact. Reuse
  // only that frozen draft; image facts are merged deterministically by the
  // following normalizer. Fresh authoring without a prior draft still fails
  // closed instead of fabricating controller content.
  let prior = $priorDraft;
  try { if (typeof prior === 'string') prior = JSON.parse(prior || '{}'); } catch { prior = {}; }
  if (!prior || typeof prior !== 'object' || Array.isArray(prior) || !String(prior.entryUrl || '').trim()) {
    throw new Error('I10_CONTROLLER_DRAFT_JSON_EMPTY');
  }
  const steps = Array.isArray(prior.steps) ? prior.steps : [];
  value = {
    caseTitle: String(prior.title || ''),
    objective: String(prior.objective || ''),
    targetSystem: String(prior.targetSystem || ''),
    entryUrl: String(prior.entryUrl || ''),
    actions: steps.map(step => String(step && step.action || '')).filter(Boolean),
    expectedOutcomes: steps.map(step => String(step && step.expected || '')).filter(Boolean),
    missingFields: Array.isArray(prior.missingFields) ? prior.missingFields : []
  };
}
if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('I10_CONTROLLER_DRAFT_JSON_OBJECT_REQUIRED');
const keys = ['actions','caseTitle','entryUrl','expectedOutcomes','missingFields','objective','targetSystem'];
const actual = Object.keys(value).sort();
if (JSON.stringify(actual) !== JSON.stringify(keys)) throw new Error('I10_CONTROLLER_DRAFT_JSON_FIELDS_INVALID');
for (const key of ['caseTitle','objective','targetSystem','entryUrl']) {
  if (typeof value[key] !== 'string' || value[key].length > 1024) throw new Error('I10_CONTROLLER_DRAFT_JSON_STRING_INVALID');
  value[key] = value[key].trim();
}
for (const key of ['actions','expectedOutcomes','missingFields']) {
  if (!Array.isArray(value[key]) || value[key].some(item => typeof item !== 'string')) {
    throw new Error('I10_CONTROLLER_DRAFT_JSON_ARRAY_INVALID');
  }
  // The controller is instructed to stay within these limits, but some
  // providers can still return additional prose-equivalent items.  Keep the
  // boundary deterministic without turning a safely bounded response into a
  // chat-wide HTTP 500: normalize strings and retain only the declared prefix.
  // Non-string values still fail closed above, and action/outcome cardinality
  // is checked before the paired prefix is selected below.
  value[key] = value[key].map(item => item.trim().slice(0, 256)).filter(Boolean);
}
if (value.actions.length !== value.expectedOutcomes.length) throw new Error('I10_CONTROLLER_DRAFT_JSON_CARDINALITY_INVALID');
value.actions = value.actions.slice(0, 6);
value.expectedOutcomes = value.expectedOutcomes.slice(0, 6);
value.missingFields = value.missingFields.slice(0, 8);
return value;`,
        customFunctionUpdateState: structuredStateUpdates
      }
    }
  })
  cloneNode(sharedNormalizer, normalizerId, '确定性规范化候选草案（隔离恢复）', { x: 4060, y })
  cloneNode(sharedPrepareHydrate, hydrateId, '从权威草案回填旅程参数（隔离恢复）', { x: 4280, y })
  const isolatedPrepare = cloneNode(journeyPrepare, prepareId, 'MCP建立权威交互旅程（隔离恢复）', { x: 4500, y })
  // The normal journey tool also carries scheduling/result-resume fields.
  // A Flowise chat session can retain those opaque ids from an earlier run;
  // they are neither needed nor valid input for a fresh authoring Journey.
  // Do not let stale state leak across this isolated authoring boundary.
  const authoringArgs = new Set([
    'sessionRef', 'requestIntent', 'inputType', 'naturalLanguage',
    'credentialRef', 'supportingImages', 'draftJson', 'entryUrl',
    'targetSystem', 'interactionContractVersion', 'semanticAssessment',
    'inputRevision'
  ])
  isolatedPrepare.data.inputs.toolInputArgs = (isolatedPrepare.data.inputs.toolInputArgs || [])
    .filter(item => authoringArgs.has(item?.inputArgName))
  flow.nodes.push({
    id: projectionId, position: { x: 4720, y }, type: 'customNode',
    data: {
      id: projectionId, label: '解析权威旅程响应（隔离恢复）', name: 'customFunctionAgentflow', version: 1,
      type: 'Custom Function', baseClasses: ['customFunctionAgentflow'], category: 'Agent Flows',
      inputs: {
        customFunctionInputVariables: [{ variableName: 'content', variableValue: `{{ ${prepareId}.output.content }}` }],
        customFunctionJavascriptFunction: journeyProjectionSource,
        customFunctionUpdateState: journeyProjectionStateUpdates(projectionId)
      }
    }
  })
  flow.nodes.push({
    id: replyId, position: { x: 4940, y }, type: 'customNode',
    data: {
      id: replyId, label: '提示继续处理隔离恢复旅程', name: 'directReplyAgentflow', version: 1,
      type: 'Direct Reply', baseClasses: ['directReplyAgentflow'], category: 'Agent Flows',
      inputs: { directReplyMessage: '## 案例草案已恢复\n\n已保留已确认的文字与图片事实，并已建立权威旅程 `{{$flow.state.journeyId}}`。\n\n请在聊天输入框发送：`继续处理旅程{{$flow.state.journeyId}}：继续案例准备`。系统会继续读取权威旅程，不会重新上传图片或丢失已确认事实。不要输入账号、密码、验证码、PIN 或 API Key。' }
    }
  })
  redirectEdge(sourceId, sourceHandle, sharedInitialPrompt.id, promptId, `i10-v6-${suffix}-isolated-entry`)
  for (const [source, target, id] of [
    [promptId, structureId, `i10-v6-${suffix}-prompt-structure`],
    [structureId, structureParseId, `i10-v6-${suffix}-structure-parse`],
    [structureParseId, normalizerId, `i10-v6-${suffix}-parse-normalize`],
    [normalizerId, hydrateId, `i10-v6-${suffix}-normalize-hydrate`],
    [hydrateId, prepareId, `i10-v6-${suffix}-hydrate-prepare`],
    [prepareId, projectionId, `i10-v6-${suffix}-prepare-projection`],
    [projectionId, replyId, `i10-v6-${suffix}-projection-reply`]
  ]) {
    flow.edges.push({ id, source, target, sourceHandle: `${source}-output-${source.startsWith('toolAgentflow') ? 'toolAgentflow' : source.startsWith('llmAgentflow') ? 'llmAgentflow' : 'customFunctionAgentflow'}`, targetHandle: target, type: 'buttonedge' })
  }
}
// Normal text-only requests and confirmed OCR requests are separate
// conditional roots, so they must never converge before an explicit
// cross-execution journey resume.
attachIsolatedAuthoringChain({
  suffix: 'no_image', sourceId: 'conditionAgentflow_i10_v4_image_route',
  sourceHandle: 'conditionAgentflow_i10_v4_image_route-output-2', y: -420
})
// The fresh "continue confirmed image" command has no inherited edge to the
// normal prompt. Seed an explicit temporary edge so the isolation helper can
// replace it with the dedicated confirmed-image chain.
flow.edges.push({
  id: 'i10-v6-confirmed-image-resume-entry',
  source: candidateResumeRoute.id,
  target: sharedInitialPrompt.id,
  sourceHandle: `${candidateResumeRoute.id}-output-4`,
  targetHandle: sharedInitialPrompt.id,
  type: 'buttonedge'
})
attachIsolatedAuthoringChain({
  suffix: 'confirmed_image', sourceId: candidateResumeRoute.id,
  sourceHandle: `${candidateResumeRoute.id}-output-4`, y: -160
})
// Image confirmation now ends its original execution with a continuation
// command. Leaving the inherited status -> shared-prompt edge in place would
// reintroduce a second parent for the normal prompt and make it a join.
flow.edges = flow.edges.filter(edge => !(
  edge.source === imageStatus.id && edge.target === sharedInitialPrompt.id
))
// The nested image-decision route no longer owns a confirmed continuation;
// retain only confirm/reject paths and remove its stale incoming shared-chain
// edge so Flowise does not manufacture an additional conditional dependency.
flow.edges = flow.edges.filter(edge => !(edge.source === imageResumeDecisionRouteId && edge.sourceHandle === `${imageResumeDecisionRouteId}-output-1` && edge.target === sharedInitialPrompt.id))

// A custom-MCP image read directly after a decision is a native Flowise
// terminal boundary. End this execution with a clear continuation command;
// a fresh chat execution then rereads the confirmed facts before authoring.
const imageConfirmedTransitionId = 'directReplyAgentflow_i10_v6_image_confirmed_transition'
const imageDecisionToConfirmed = flow.edges.find(edge =>
  edge.source === imageDecisionSubmit.id && edge.target === 'toolAgentflow_i10_v4_image_confirmed_get')
if (!imageDecisionToConfirmed) throw new Error('I10_V6_IMAGE_DECISION_CONTINUE_EDGE_MISSING')
imageDecisionToConfirmed.target = imageConfirmedTransitionId
imageDecisionToConfirmed.targetHandle = imageConfirmedTransitionId
flow.nodes.push({
  id: imageConfirmedTransitionId, position: { x: 3480, y: -40 }, type: 'customNode',
  data: {
    id: imageConfirmedTransitionId, label: '提示继续使用已确认图片', name: 'directReplyAgentflow', version: 1,
    type: 'Direct Reply', baseClasses: ['directReplyAgentflow'], category: 'Agent Flows',
    inputs: { directReplyMessage: '图片事实已确认并完成受控清理。请在聊天输入框发送：继续已确认图片 {{$flow.state.imageIngestId}}。系统将使用已确认的图片事实继续整理案例草案；不要输入账号、密码、验证码、PIN 或 API Key。' }
  }
})
flow.nodes = flow.nodes.filter(node => node.id !== 'toolAgentflow_i10_v4_image_confirmed_get')
flow.edges = flow.edges.filter(edge => edge.source !== 'toolAgentflow_i10_v4_image_confirmed_get' && edge.target !== 'toolAgentflow_i10_v4_image_confirmed_get')

// The v5 compiler was correctly deterministic but always emitted GENERIC_WEB
// and discarded non-secret CaseDraft input values.  Preserve its no-model
// property while deriving the execution profile solely from an already frozen
// adapter binding.  A profile that is not explicitly bound remains generic.
const intentCompilerV6 = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
if (!intentCompilerV6) throw new Error('I10_V6_INTENT_COMPILER_MISSING')
intentCompilerV6.data.inputs.customFunctionInputVariables = [
  { variableName: 'caseDraftJson', variableValue: '{{$flow.state.caseDraftJson}}' },
  { variableName: 'route', variableValue: '{{$flow.state.targetProfileLaunchUrl}}' },
  { variableName: 'targetProfileId', variableValue: '{{$flow.state.targetProfileId}}' },
  { variableName: 'targetProfileVersion', variableValue: '{{$flow.state.targetProfileVersion}}' },
  { variableName: 'targetProfileHash', variableValue: '{{$flow.state.targetProfileHash}}' },
  { variableName: 'targetProfileSnapshot', variableValue: '{{$flow.state.targetProfileSnapshot}}' }
]
intentCompilerV6.data.inputs.customFunctionJavascriptFunction = `
const parseObject = value => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch {} }
  return {};
};
const text = value => String(value || '').trim();
const draft = parseObject($caseDraftJson);
const targetProfileSnapshot = parseObject($targetProfileSnapshot);
// CaseDraft v1 persists paired browser semantics as steps; historical
// Flowise controller output used parallel actions/expectedOutcomes.
// Prefer the immutable paired representation so a confirmed draft cannot
// collapse to an empty authoring context after a Human Input continuation.
const draftSteps = Array.isArray(draft.steps) ? draft.steps : [];
const actions = draftSteps.length
  ? draftSteps.map(step => text(step && step.action)).filter(Boolean)
  : (Array.isArray(draft.actions) ? draft.actions.map(text).filter(Boolean) : []);
const expectedOutcomes = draftSteps.length
  ? draftSteps.map(step => text(step && step.expected)).filter(Boolean)
  : (Array.isArray(draft.expectedOutcomes) ? draft.expectedOutcomes.map(text).filter(Boolean) : []);
const suppliedAssertions = Array.isArray(draft.assertions) ? draft.assertions.map(text).filter(Boolean) : [];
const actionSteps = Array.isArray(draft.actionStepsV2) ? draft.actionStepsV2 : [];
// Native Flowise Human Input continuations can lose transient scalar state.
// Recover the already-confirmed launch URL from durable inputs rather than
// rejecting an otherwise immutable CaseDraft.  The ACTIVE TargetProfile
// snapshot wins when present; CaseDraft.entryUrl is the final bounded fallback.
const route = text($route) || text(targetProfileSnapshot.launchUrl) || text(draft.entryUrl);
if (!/^https?:\\/\\/[^\\s]+$/i.test(route) || !actions.length || actions.length !== expectedOutcomes.length) {
  return { valid: 'NO', errorCode: 'I10_INTENT_COMPILE_PREREQUISITES_INVALID', route: '', executionProfile: 'GENERIC_WEB', actions: '[]', expectedOutcomes: '[]', riskLevels: '[]', inputValues: '[]', inputValueSources: '[]', assertions: '[]', authoringContext: '' };
}
const binding = parseObject(targetProfileSnapshot.adapterBinding);
const transferRequested = actions.some(action => /(?:转账|汇款|付款|transfer|payment)/i.test(action));
const executionProfile = binding.adapterId === 'fuxing-bank-demo' && transferRequested
  ? 'TRANSFER_UKEY_ORDER_QUERY' : 'GENERIC_WEB';
const inputByOrdinal = new Map(actionSteps.map(step => [Number(step && step.ordinal), step]));
const inputValues = actions.map((_, index) => {
  const step = inputByOrdinal.get(index + 1) || {};
  const source = text(step.inputValueSource);
  return ['USER_TEXT', 'RUNTIME_USER_INPUT'].includes(source) ? text(step.inputValue) : '';
});
const inputValueSources = actions.map((action, index) => {
  const step = inputByOrdinal.get(index + 1) || {};
  const supplied = text(step.inputValueSource);
  if (supplied === 'CREDENTIAL_REF' || /账号|用户名|密码|手机号|credential|凭据/i.test(action)) return 'CREDENTIAL_REF';
  return inputValues[index] ? 'USER_TEXT' : 'NONE';
});
const riskLevels = actions.map(action => /转账|支付|提交|确认/i.test(action) ? 'MEDIUM' : 'LOW');
const encodeArray = value => 'uri:' + encodeURIComponent(JSON.stringify(value));
const targetProfileId = text($targetProfileId);
const targetProfileVersion = Number($targetProfileVersion || 0);
const targetProfileHash = text($targetProfileHash);
const authoringContext = {
  route, executionProfile,
  ...(targetProfileId ? { targetProfileId } : {}),
  ...(Number.isInteger(targetProfileVersion) && targetProfileVersion > 0 ? { targetProfileVersion } : {}),
  ...(targetProfileHash ? { targetProfileHash } : {}),
  ...(Object.keys(targetProfileSnapshot).length ? { targetProfileSnapshot } : {}),
  ...(executionProfile !== 'GENERIC_WEB' ? { adapterBinding: binding } : {})
};
// A Human Input continuation may retain the immutable CaseDraft URL while
// losing every transient TargetProfile scalar.  Sending that partial generic
// context would suppress the Harness' strict credentialRef -> ACTIVE profile
// recovery and then fail intentPlan validation.  Submit context only when it
// is complete; an explicit empty value delegates recovery to the Harness and
// never authorizes URL-based adapter inference.
const completeGenericProfile = executionProfile === 'GENERIC_WEB'
  && targetProfileId
  && Number.isInteger(targetProfileVersion) && targetProfileVersion > 0
  && /^[0-9a-f]{64}$/.test(targetProfileHash)
  && Object.keys(targetProfileSnapshot).length > 0;
const completeControlledBinding = executionProfile !== 'GENERIC_WEB'
  && binding.adapterId && binding.adapterVersion && binding.manifestHash;
const authoringContextTransport = completeGenericProfile || completeControlledBinding
  ? 'uri:' + encodeURIComponent(JSON.stringify(authoringContext))
  : '';
return { valid: 'YES', errorCode: '', route, executionProfile, actions: encodeArray(actions), expectedOutcomes: encodeArray(expectedOutcomes), riskLevels: encodeArray(riskLevels), inputValues: encodeArray(inputValues), inputValueSources: encodeArray(inputValueSources), assertions: encodeArray(suppliedAssertions.length ? suppliedAssertions : [expectedOutcomes.at(-1)]), authoringContext: authoringContextTransport };`

// Persist the reconstructed route together with the frozen authoring context.
// The following Tool node deliberately reads Flow state instead of a literal
// Custom Function output template, so both values must survive continuations.
intentCompilerV6.data.inputs.customFunctionUpdateState = [
  { key: 'targetProfileLaunchUrl', value: '{{ output.route }}' },
  { key: 'authoringContext', value: '{{ output.authoringContext }}' }
]

// The recovery compiler is cloned before the v6 compiler is hardened above.
// Copy the finished authoritative inputs now, otherwise the clone retains the
// legacy controllerDraft_* bindings and can silently submit no authoring job.
const crossSessionIntentCompiler = flow.nodes.find(node => node.id === crossDecisionIntentCompileId)
if (!crossSessionIntentCompiler) throw new Error('I10_V6_CROSS_SESSION_INTENT_COMPILER_MISSING')
crossSessionIntentCompiler.data.inputs = JSON.parse(JSON.stringify(intentCompilerV6.data.inputs))

// A candidate can already be activated when the same prepared case is resumed
// after asynchronous authoring.  In that state Harness correctly returns
// ON_DEMAND_RUN_AVAILABLE rather than a second delivery decision.  The frozen
// v5 graph sent that terminal state through its failure cascade and ended with
// the misleading “candidate processing” reply forever.  Add a narrow route
// before the failure checks: it opens the normal execution-plan confirmation,
// while a new candidate still follows the existing preview/activation route.
const candidateReady = flow.nodes.find(node => node.id === 'conditionAgentflow_candidate_ready')
const candidateAuthoringFailed = flow.nodes.find(node => node.id === 'conditionAgentflow_candidate_authoring_failed')
const executionChoice = flow.nodes.find(node => node.id === 'humanInputAgentflow_run')
if (!candidateReady || !candidateAuthoringFailed || !executionChoice) {
  throw new Error('I10_V6_CANDIDATE_RESUME_ROUTE_NODES_MISSING')
}
const alreadyActiveRouteId = 'conditionAgentflow_i10_v6_candidate_on_demand_available'
if (!flow.nodes.some(node => node.id === alreadyActiveRouteId)) {
  const route = JSON.parse(JSON.stringify(candidateAuthoringFailed))
  route.id = alreadyActiveRouteId
  route.data.id = alreadyActiveRouteId
  route.data.label = '已激活候选是否可直接选择执行方式'
  route.data.inputs.conditions = [{
    type: 'string',
    value1: '{{$flow.state.candidateNextAction}}',
    operation: 'contains',
    value2: 'ON_DEMAND_RUN_AVAILABLE'
  }]
  flow.nodes.push(route)
  for (const edge of flow.edges) {
    if (edge.source === candidateReady.id && edge.target === candidateAuthoringFailed.id &&
        edge.sourceHandle === `${candidateReady.id}-output-1`) {
      edge.target = alreadyActiveRouteId
      edge.targetHandle = alreadyActiveRouteId
    }
  }
  flow.edges.push({
    id: `edge-${alreadyActiveRouteId}-run`,
    source: alreadyActiveRouteId,
    target: executionChoice.id,
    sourceHandle: `${alreadyActiveRouteId}-output-0`,
    targetHandle: executionChoice.id,
    type: 'buttonedge'
  })
  flow.edges.push({
    id: `edge-${alreadyActiveRouteId}-authoring-failed`,
    source: alreadyActiveRouteId,
    target: candidateAuthoringFailed.id,
    sourceHandle: `${alreadyActiveRouteId}-output-1`,
    targetHandle: candidateAuthoringFailed.id,
    type: 'buttonedge'
  })
}

// A cross-session CASE_AUTHORING journey can carry an adapter choice that was
// explicitly frozen in its CaseDraft. Route that choice through the same
// TargetProfile human confirmation gate before approving/authoring the case;
// otherwise the recovery branch would silently reuse a credential-bound
// GENERIC_DYNAMIC profile and discard the user's adapter selection.
const crossSessionProjection = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v6_cross_session_journey_projection')
const crossSessionDecisionParse = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v6_cross_session_decision_parse')
const crossSessionAdapterRouteId = 'conditionAgentflow_i10_v6_cross_session_adapter_route'
if (!crossSessionProjection || !crossSessionDecisionParse) throw new Error('I10_V6_CROSS_SESSION_ADAPTER_ROUTE_NODES_MISSING')
const crossSessionProjectionUpdates = crossSessionProjection.data.inputs.customFunctionUpdateState || []
if (!crossSessionProjection.data.inputs.customFunctionJavascriptFunction.includes('adapterConfirmationRequired')) {
  crossSessionProjection.data.inputs.customFunctionJavascriptFunction = crossSessionProjection.data.inputs.customFunctionJavascriptFunction.replace(
    'return payload;',
    "return { ...payload, adapterConfirmationRequired: payload?.caseDraft?.adapterSelection === 'fuxing-bank-demo' && !payload?.caseDraft?.targetProfileId && !payload?.references?.targetProfileId ? 'YES' : 'NO' };"
  )
}
// Every cross-session proposal without a frozen TargetProfile must pass the
// same prepare/confirm chain. Restricting this to an explicit adapter choice
// let ordinary GENERIC_WEB cases reach authoring with an unbound credential.
crossSessionProjection.data.inputs.customFunctionJavascriptFunction =
  crossSessionProjection.data.inputs.customFunctionJavascriptFunction.replace(
    "adapterConfirmationRequired: payload?.caseDraft?.adapterSelection === 'fuxing-bank-demo' && !payload?.caseDraft?.targetProfileId && !payload?.references?.targetProfileId ? 'YES' : 'NO'",
    "adapterConfirmationRequired: !payload?.caseDraft?.targetProfileId && !payload?.references?.targetProfileId ? 'YES' : 'NO'"
  )
// Native Flowise state updates do not consistently resolve nested Custom
// Function output paths after a fresh chat execution.  Publish the immutable
// CaseDraft fields needed by TargetProfile preparation as explicit top-level
// scalars; never reconstruct them from the user continuation command.
if (!crossSessionProjection.data.inputs.customFunctionJavascriptFunction.includes('projectedTargetSystem')) {
  crossSessionProjection.data.inputs.customFunctionJavascriptFunction =
    crossSessionProjection.data.inputs.customFunctionJavascriptFunction.replace(
      "return { ...payload, adapterConfirmationRequired: !payload?.caseDraft?.targetProfileId && !payload?.references?.targetProfileId ? 'YES' : 'NO' };",
      `const projectedCaseDraft = payload && payload.caseDraft && typeof payload.caseDraft === 'object' && !Array.isArray(payload.caseDraft)
  ? payload.caseDraft : {};
return {
  ...payload,
  adapterConfirmationRequired: !projectedCaseDraft.targetProfileId && !payload?.references?.targetProfileId ? 'YES' : 'NO',
  projectedTargetSystem: String(projectedCaseDraft.targetSystem || ''),
  projectedEntryUrl: String(projectedCaseDraft.entryUrl || ''),
  projectedCredentialRef: String(projectedCaseDraft.credentialRef || ''),
  projectedAdapterSelection: String(projectedCaseDraft.adapterSelection || '')
};`
    )
}
for (const [key, value] of [
  ['targetAdapterSelection', '{{ output.projectedAdapterSelection }}'],
  ['targetAdapterConfirmationRequired', '{{ output.adapterConfirmationRequired }}'],
  ['controllerDraft_entryUrl', '{{ output.projectedEntryUrl }}'],
  ['controllerDraft_targetSystem', '{{ output.projectedTargetSystem }}'],
  ['credentialRef', '{{ output.projectedCredentialRef }}']
]) {
  const existing = crossSessionProjectionUpdates.find(item => item?.key === key)
  if (existing) existing.value = value
  else crossSessionProjectionUpdates.push({ key, value })
}
crossSessionProjection.data.inputs.customFunctionUpdateState = crossSessionProjectionUpdates
if (!flow.nodes.some(node => node.id === crossSessionAdapterRouteId)) {
  flow.nodes.push({
    id: crossSessionAdapterRouteId,
    position: { x: 1740, y: 120 },
    type: 'customNode',
    data: {
      id: crossSessionAdapterRouteId,
      label: '跨会话显式适配器是否待确认',
      name: 'conditionAgentflow', version: 1, type: 'Condition',
      baseClasses: ['conditionAgentflow'], category: 'Agent Flows',
      inputs: { conditions: [{ type: 'string', value1: '{{$flow.state.targetAdapterConfirmationRequired}}', operation: 'equal', value2: 'YES' }] }
    }
  })
  const proposalEdge = flow.edges.find(edge => edge.source === crossSessionRoute.id && edge.target === crossSessionDecisionParse.id)
  if (!proposalEdge) throw new Error('I10_V6_CROSS_SESSION_PROPOSAL_EDGE_MISSING')
  proposalEdge.target = crossSessionAdapterRouteId
  proposalEdge.targetHandle = crossSessionAdapterRouteId
  const crossTargetSourceIds = [
    'toolAgentflow_i10_v4_target_profile_prepare',
    'humanInputAgentflow_i10_v4_target_profile_confirm',
    'toolAgentflow_i10_v4_target_profile_approve',
    'toolAgentflow_i10_v4_target_profile_reject',
    'toolAgentflow_i10_v4_target_profile_get',
    'directReplyAgentflow_i10_v4_target_profile_rejected',
    'toolAgentflow_i10_v6_post_target_journey_prepare',
    'customFunctionAgentflow_i10_v6_post_target_journey_projection',
    'directReplyAgentflow_i10_v6_target_profile_transition'
  ]
  const crossTargetSources = new Map(crossTargetSourceIds.map(id => [id, flow.nodes.find(node => node.id === id)]))
  if ([...crossTargetSources.values()].some(node => !node)) throw new Error('I10_V6_CROSS_SESSION_TARGET_CHAIN_SOURCE_MISSING')
  const crossTargetIds = new Map(crossTargetSourceIds.map(id => [id, `${id}_cross_session`]))
  for (const [index, sourceId] of crossTargetSourceIds.entries()) {
    const source = crossTargetSources.get(sourceId)
    cloneNode(source, crossTargetIds.get(sourceId), `${source.data.label}（跨会话隔离）`, {
      x: 1960 + index * 220,
      y: 120
    })
  }
  const crossTargetPrepareId = crossTargetIds.get('toolAgentflow_i10_v4_target_profile_prepare')
  const crossTargetStatusRouteId = 'conditionAgentflow_i10_v6_cross_session_target_profile_status'
  const crossTargetConfirmId = crossTargetIds.get('humanInputAgentflow_i10_v4_target_profile_confirm')
  const crossTargetApproveId = crossTargetIds.get('toolAgentflow_i10_v4_target_profile_approve')
  const crossTargetRejectId = crossTargetIds.get('toolAgentflow_i10_v4_target_profile_reject')
  const crossTargetGetId = crossTargetIds.get('toolAgentflow_i10_v4_target_profile_get')
  const crossTargetRejectedId = crossTargetIds.get('directReplyAgentflow_i10_v4_target_profile_rejected')
  const crossTargetJourneyPrepareId = crossTargetIds.get('toolAgentflow_i10_v6_post_target_journey_prepare')
  const crossTargetJourneyProjectionId = crossTargetIds.get('customFunctionAgentflow_i10_v6_post_target_journey_projection')
  const crossTargetTransitionId = crossTargetIds.get('directReplyAgentflow_i10_v6_target_profile_transition')
  const activeJourneyPrepareId = 'toolAgentflow_i10_v6_post_target_journey_prepare_already_active_cross_session'
  const activeJourneyProjectionId = 'customFunctionAgentflow_i10_v6_post_target_journey_projection_already_active_cross_session'
  const activeTransitionId = 'directReplyAgentflow_i10_v6_target_profile_transition_already_active_cross_session'
  cloneNode(crossTargetSources.get('toolAgentflow_i10_v6_post_target_journey_prepare'), activeJourneyPrepareId, 'MCP冻结已激活目标站点后的案例提案准备（跨会话隔离）', { x: 2840, y: -100 })
  cloneNode(crossTargetSources.get('customFunctionAgentflow_i10_v6_post_target_journey_projection'), activeJourneyProjectionId, '解析已激活目标站点后的权威旅程响应（跨会话隔离）', { x: 3060, y: -100 })
  cloneNode(crossTargetSources.get('directReplyAgentflow_i10_v6_target_profile_transition'), activeTransitionId, '提示继续确认已激活目标站点后的冻结案例（跨会话隔离）', { x: 3280, y: -100 })
  // Flowise templates embedded in a cloned Custom Function still name the
  // source node. Bind each projection to its own prepare node so a continuation
  // cannot project an empty object and retain a stale Journey id in flow state.
  for (const [projectionId, prepareId] of [
    [crossTargetJourneyProjectionId, crossTargetJourneyPrepareId],
    [activeJourneyProjectionId, activeJourneyPrepareId]
  ]) {
    const projectionNode = flow.nodes.find(node => node.id === projectionId)
    const contentVariable = projectionNode?.data?.inputs?.customFunctionInputVariables
      ?.find(item => item?.variableName === 'content')
    if (!contentVariable) throw new Error(`I10_V6_CROSS_SESSION_JOURNEY_PROJECTION_INPUT_MISSING:${projectionId}`)
    contentVariable.variableValue = `{{ ${prepareId}.output.content }}`
  }
  const crossTargetPrepareNode = flow.nodes.find(node => node.id === crossTargetPrepareId)
  crossTargetPrepareNode.data.inputs.toolInputArgs = (crossTargetPrepareNode.data.inputs.toolInputArgs || [])
    .filter(item => item?.inputArgName !== 'applicationProfile')
  flow.nodes.push({
    id: crossTargetStatusRouteId, position: { x: 2180, y: 20 }, type: 'customNode',
    data: {
      id: crossTargetStatusRouteId, label: '跨会话目标档案状态路由', name: 'conditionAgentflow', version: 1,
      type: 'Condition', baseClasses: ['conditionAgentflow'], category: 'Agent Flows',
      inputs: { conditions: [
        { type: 'string', value1: '{{$flow.state.targetProfileStatus}}', operation: 'equal', value2: 'PENDING_CONFIRMATION' },
        { type: 'string', value1: '{{$flow.state.targetProfileStatus}}', operation: 'equal', value2: 'ACTIVE' }
      ] }
    }
  })
  flow.edges.push({
    id: `edge-${crossSessionAdapterRouteId}-prepare`, source: crossSessionAdapterRouteId,
    target: crossTargetPrepareId, sourceHandle: `${crossSessionAdapterRouteId}-output-0`,
    targetHandle: crossTargetPrepareId, type: 'buttonedge'
  })
  flow.edges.push({
    id: `edge-${crossSessionAdapterRouteId}-continue`, source: crossSessionAdapterRouteId,
    target: crossSessionDecisionParse.id, sourceHandle: `${crossSessionAdapterRouteId}-output-1`,
    targetHandle: crossSessionDecisionParse.id, type: 'buttonedge'
  })
  for (const edge of [
    ['cross-target-prepared', crossTargetPrepareId, `${crossTargetPrepareId}-output-toolAgentflow`, crossTargetStatusRouteId],
    ['cross-target-pending', crossTargetStatusRouteId, `${crossTargetStatusRouteId}-output-0`, crossTargetConfirmId],
    ['cross-target-already-active', crossTargetStatusRouteId, `${crossTargetStatusRouteId}-output-1`, activeJourneyPrepareId],
    ['cross-target-unavailable', crossTargetStatusRouteId, `${crossTargetStatusRouteId}-output-2`, crossTargetRejectedId],
    ['cross-target-approved', crossTargetConfirmId, `${crossTargetConfirmId}-output-0`, crossTargetApproveId],
    ['cross-target-rejected', crossTargetConfirmId, `${crossTargetConfirmId}-output-1`, crossTargetRejectId],
    ['cross-target-readback', crossTargetApproveId, `${crossTargetApproveId}-output-toolAgentflow`, crossTargetGetId],
    ['cross-target-stop', crossTargetRejectId, `${crossTargetRejectId}-output-toolAgentflow`, crossTargetRejectedId],
    ['cross-target-continue', crossTargetGetId, `${crossTargetGetId}-output-toolAgentflow`, crossTargetJourneyPrepareId],
    ['cross-target-journey-project', crossTargetJourneyPrepareId, `${crossTargetJourneyPrepareId}-output-toolAgentflow`, crossTargetJourneyProjectionId],
    ['cross-target-transition', crossTargetJourneyProjectionId, `${crossTargetJourneyProjectionId}-output-customFunctionAgentflow`, crossTargetTransitionId]
    ,['cross-target-active-journey-project', activeJourneyPrepareId, `${activeJourneyPrepareId}-output-toolAgentflow`, activeJourneyProjectionId]
    ,['cross-target-active-transition', activeJourneyProjectionId, `${activeJourneyProjectionId}-output-customFunctionAgentflow`, activeTransitionId]
  ]) {
    flow.edges.push({ id: `i10-v6-${edge[0]}`, source: edge[1], sourceHandle: edge[2], target: edge[3], targetHandle: edge[3], type: 'buttonedge' })
  }
}

// The Harness owns the frozen preparation -> CaseDraft -> TargetProfile
// projection. Cross-session authoring must confirm that preparation only;
// replaying controller-derived context fields is redundant and can diverge
// from the authoritative snapshot (or fail the remote MCP union schema).
for (const nodeId of [
  'toolAgentflow_i10_v6_cross_session_authoring_submit',
  'toolAgentflow_i10_v6_cross_session_authoring_resume_submit'
]) {
  const node = flow.nodes.find(item => item.id === nodeId)
  if (!node) throw new Error(`I10_V6_CROSS_SESSION_AUTHORING_NODE_MISSING:${nodeId}`)
  const required = new Set(['preparationId', 'expectedVersion', 'choice', 'confirmationRef', 'reason', 'sessionRef', 'authoringContext'])
  const args = node.data.inputs.toolInputArgs || []
  if (!args.some(item => item?.inputArgName === 'authoringContext')) {
    args.push({ inputArgName: 'authoringContext', inputArgValue: '{{$flow.state.authoringContext}}' })
  }
  node.data.inputs.toolInputArgs = args
    .filter(item => required.has(item?.inputArgName))
}

// Journey-driven run and schedule writes consume the immutable decision event
// projected from the authoritative Journey.  Add the pair at the generated
// graph boundary so cloned normal/cross-session nodes cannot silently omit it.
for (const node of flow.nodes) {
  const actions = node.data?.inputs?.toolAgentflowSelectedToolConfig?.mcpActions
  if (!Array.isArray(actions) || !actions.some(action => action === 'run_submit' || action === 'schedule_create')) continue
  const args = node.data.inputs.toolInputArgs || []
  const preparationIndex = args.findIndex(item => item?.inputArgName === 'preparationId')
  if (preparationIndex < 0) throw new Error(`I10_V6_EXECUTION_BINDING_PREPARATION_MISSING:${node.id}`)
  const required = [
    ['journeyId', '{{$flow.state.journeyId}}'],
    ['confirmedDecisionEventId', '{{$flow.state.confirmedDecisionEventId}}']
  ]
  let offset = 1
  for (const [inputArgName, inputArgValue] of required) {
    const existing = args.find(item => item?.inputArgName === inputArgName)
    if (existing) existing.inputArgValue = inputArgValue
    else args.splice(preparationIndex + offset++, 0, { inputArgName, inputArgValue })
  }
  node.data.inputs.toolInputArgs = args
}

// Primary CASE_FILE and VIDEO uploads must create their governed ingest job
// before Journey preparation.  Creating a PROCESSING_INGEST Journey first
// leaves no durable ingestJobId to poll and the reconciler correctly marks it
// orphaned.  Give the legacy ingest route one unique inbound edge: its former
// post-proposal fallback is semantically the non-attachment result route.
const primaryAttachmentRouteId = 'conditionAgentflow_i10_v6_primary_attachment_route'
if (!flow.nodes.some(node => node.id === primaryAttachmentRouteId)) {
  const imageNoSubmitEdge = flow.edges.find(edge =>
    edge.source === 'conditionAgentflow_i10_v4_image_route' &&
    edge.sourceHandle === 'conditionAgentflow_i10_v4_image_route-output-2' &&
    edge.target === 'customFunctionAgentflow_i10_v6_no_image_prompt')
  const postProposalIngestEdge = flow.edges.find(edge =>
    edge.source === 'conditionAgentflow_i10_v3_awaiting_user' &&
    edge.target === 'conditionAgentflow_i10_v3_route_ingest')
  const legacyIngestDispatchEdge = flow.edges.find(edge =>
    edge.source === 'conditionAgentflow_i10_v3_route_ingest' &&
    edge.target === 'conditionAgentflow_i10_v3_ingest_video')
  if (!imageNoSubmitEdge || !postProposalIngestEdge || !legacyIngestDispatchEdge) {
    throw new Error('I10_V6_PRIMARY_ATTACHMENT_ROUTE_SOURCE_MISSING')
  }
  const primaryAttachmentClassifyId = 'customFunctionAgentflow_i10_v6_primary_attachment_classify'
  flow.nodes.push({
    id: primaryAttachmentClassifyId,
    position: { x: 900, y: 460 },
    type: 'customNode',
    data: {
      id: primaryAttachmentClassifyId,
      label: '归一化主附件导入路由',
      name: 'customFunctionAgentflow', version: 1, type: 'Custom Function',
      baseClasses: ['customFunctionAgentflow'], category: 'Agent Flows',
      inputs: {
        customFunctionInputVariables: [{ variableName: 'inputType', variableValue: '{{$flow.state.inputType}}' }],
        customFunctionJavascriptFunction: "const inputType=String($inputType||'').trim().toUpperCase(); return { primaryAttachment: inputType==='CASE_FILE'||inputType==='VIDEO'?'YES':'NO' };",
        customFunctionUpdateState: [{ key: 'primaryAttachmentRoute', value: '{{ output.primaryAttachment }}' }]
      }
    }
  })
  flow.nodes.push({
    id: primaryAttachmentRouteId,
    position: { x: 1120, y: 460 },
    type: 'customNode',
    data: {
      id: primaryAttachmentRouteId,
      label: '主附件是否进入受控导入',
      name: 'conditionAgentflow', version: 1, type: 'Condition',
      baseClasses: ['conditionAgentflow'], category: 'Agent Flows',
      inputs: { conditions: [
        { type: 'string', value1: '{{$flow.state.primaryAttachmentRoute}}', operation: 'equal', value2: 'YES' }
      ] }
    }
  })
  imageNoSubmitEdge.target = primaryAttachmentClassifyId
  imageNoSubmitEdge.targetHandle = primaryAttachmentClassifyId
  postProposalIngestEdge.target = 'conditionAgentflow_i10_v3_route_result'
  postProposalIngestEdge.targetHandle = 'conditionAgentflow_i10_v3_route_result'
  legacyIngestDispatchEdge.target = 'conditionAgentflow_i10_v3_route_result'
  legacyIngestDispatchEdge.targetHandle = 'conditionAgentflow_i10_v3_route_result'
  flow.edges.push(
    {
      id: 'i10-v6-primary-attachment-classified', source: primaryAttachmentClassifyId,
      sourceHandle: `${primaryAttachmentClassifyId}-output-customFunctionAgentflow`, target: primaryAttachmentRouteId,
      targetHandle: primaryAttachmentRouteId, type: 'buttonedge'
    },
    {
      id: 'i10-v6-primary-attachment-ingest', source: primaryAttachmentRouteId,
      sourceHandle: `${primaryAttachmentRouteId}-output-0`, target: 'conditionAgentflow_i10_v3_ingest_video',
      targetHandle: 'conditionAgentflow_i10_v3_ingest_video', type: 'buttonedge'
    },
    {
      id: 'i10-v6-primary-natural-language', source: primaryAttachmentRouteId,
      sourceHandle: `${primaryAttachmentRouteId}-output-1`, target: 'customFunctionAgentflow_i10_v6_no_image_prompt',
      targetHandle: 'customFunctionAgentflow_i10_v6_no_image_prompt', type: 'buttonedge'
    }
  )
  flow.nodes = flow.nodes.filter(node => node.id !== 'conditionAgentflow_i10_v3_route_ingest')
  flow.edges = flow.edges.filter(edge => edge.source !== 'conditionAgentflow_i10_v3_route_ingest' && edge.target !== 'conditionAgentflow_i10_v3_route_ingest')

  // A confirmed ingest already owns the immutable case and preparation. Do
  // not feed it into the natural-language compiler (which would duplicate the
  // case and has no active TargetProfile). Split the remaining writes across
  // fresh Flowise executions: target profile, Journey binding, then authoring.
  const attachmentIngestReadyId = 'directReplyAgentflow_i10_v6_attachment_ingest_confirmed'
  const attachmentIngestProjectionId = 'customFunctionAgentflow_i10_v6_attachment_ingest_projection'
  const attachmentContextId = 'customFunctionAgentflow_i10_v6_attachment_context_restore'
  const attachmentApplicationId = 'customFunctionAgentflow_i10_v6_attachment_application_profile_derive'
  const attachmentTargetPrepareId = 'toolAgentflow_i10_v6_attachment_target_profile_prepare'
  const attachmentTargetStatusId = 'conditionAgentflow_i10_v6_attachment_target_profile_status'
  const attachmentTargetConfirmId = 'humanInputAgentflow_i10_v6_attachment_target_profile_confirm'
  const attachmentTargetApproveId = 'toolAgentflow_i10_v6_attachment_target_profile_approve'
  const attachmentTargetRejectId = 'toolAgentflow_i10_v6_attachment_target_profile_reject'
  const attachmentTargetGetId = 'toolAgentflow_i10_v6_attachment_target_profile_get'
  const attachmentTargetRejectedId = 'directReplyAgentflow_i10_v6_attachment_target_profile_rejected'
  const attachmentTargetReadyId = 'directReplyAgentflow_i10_v6_attachment_target_profile_ready'
  const attachmentJourneyPrepareId = 'toolAgentflow_i10_v6_attachment_journey_prepare'
  const attachmentJourneyReadyId = 'directReplyAgentflow_i10_v6_attachment_journey_ready'
  const resumeRouteNode = flow.nodes.find(node => node.id === 'conditionAgentflow_i10_v4_candidate_resume_route')
  const sourceTargetConfirm = flow.nodes.find(node => node.id === 'humanInputAgentflow_i10_v4_target_profile_confirm')
  const sourceTargetApprove = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_approve')
  const sourceTargetReject = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_reject')
  const sourceTargetGet = flow.nodes.find(node => node.id === 'toolAgentflow_i10_v4_target_profile_get')
  const sourceTargetRejected = flow.nodes.find(node => node.id === 'directReplyAgentflow_i10_v4_target_profile_rejected')
  const ingestDecisionEdge = flow.edges.find(edge =>
    edge.source === 'toolAgentflow_i10_v3_ingest_decide' && edge.target === 'llmAgentflow_intent')
  const normalClassifyEdge = flow.edges.find(edge =>
    edge.source === 'conditionAgentflow_i10_v4_candidate_resume_route' && edge.target === 'llmAgentflow_i10_v3_classify')
  if (!resumeRouteNode || !sourceTargetConfirm || !sourceTargetApprove || !sourceTargetReject || !sourceTargetGet ||
      !sourceTargetRejected || !ingestDecisionEdge || !normalClassifyEdge) {
    throw new Error('I10_V6_ATTACHMENT_AUTHORING_CHAIN_SOURCE_MISSING')
  }
  for (const [source, id, label, position] of [
    [applicationProfileDerive, attachmentApplicationId, '恢复附件案例应用能力边界', { x: 2600, y: 520 }],
    [targetProfilePrepare, attachmentTargetPrepareId, 'MCP准备附件案例目标档案', { x: 2820, y: 520 }],
    [sourceTargetConfirm, attachmentTargetConfirmId, '确认附件案例目标档案', { x: 3260, y: 520 }],
    [sourceTargetApprove, attachmentTargetApproveId, 'MCP批准附件案例目标档案', { x: 3480, y: 460 }],
    [sourceTargetReject, attachmentTargetRejectId, 'MCP拒绝附件案例目标档案', { x: 3480, y: 620 }],
    [sourceTargetGet, attachmentTargetGetId, '回读附件案例目标档案', { x: 3700, y: 460 }],
    [sourceTargetRejected, attachmentTargetRejectedId, '附件案例目标档案已拒绝', { x: 3700, y: 620 }],
    [postTargetPrepareId && flow.nodes.find(node => node.id === postTargetPrepareId), attachmentJourneyPrepareId, 'MCP绑定已确认导入准备的旅程', { x: 2820, y: 740 }]
  ]) {
    if (!source) throw new Error(`I10_V6_ATTACHMENT_CLONE_SOURCE_MISSING:${id}`)
    const clone = JSON.parse(JSON.stringify(source))
    clone.id = id
    clone.data.id = id
    clone.data.label = label
    clone.position = position
    flow.nodes.push(clone)
  }

  flow.nodes.push(
    {
      id: attachmentIngestProjectionId, position: { x: 2820, y: 740 }, type: 'customNode',
      data: { id: attachmentIngestProjectionId, label: '解析已确认导入的权威引用', name: 'customFunctionAgentflow', version: 1,
        type: 'Custom Function', baseClasses: ['customFunctionAgentflow'], category: 'Agent Flows', inputs: {
          customFunctionInputVariables: [{ variableName: 'content', variableValue: '{{ toolAgentflow_i10_v3_ingest_decide.output.content }}' }],
          customFunctionJavascriptFunction: journeyProjectionSource.replace(
            'return payload;',
            `const confirmed=Array.isArray(payload.cases)?payload.cases[0]:null;if(!confirmed||!/^${opaqueReferences.source('preparation')}$/i.test(String(confirmed.preparationId||'')))throw new Error('I10_ATTACHMENT_INGEST_CONFIRMATION_INVALID');return {preparationId:confirmed.preparationId,preparationVersion:confirmed.preparationVersion,caseId:confirmed.caseId,caseVersion:confirmed.version,credentialRef:confirmed.credentialRef};`
          ),
          customFunctionUpdateState: [
            { key: 'preparationId', value: '{{ output.preparationId }}' },
            { key: 'preparationVersion', value: '{{ output.preparationVersion }}' },
            { key: 'caseId', value: '{{ output.caseId }}' },
            { key: 'caseVersion', value: '{{ output.caseVersion }}' },
            { key: 'credentialRef', value: '{{ output.credentialRef }}' }
          ]
        } }
    },
    {
      id: attachmentIngestReadyId, position: { x: 3040, y: 740 }, type: 'customNode',
      data: { id: attachmentIngestReadyId, label: '导入准备已冻结', name: 'directReplyAgentflow', version: 1,
        type: 'Direct Reply', baseClasses: ['directReplyAgentflow'], category: 'Agent Flows', inputs: {
          directReplyMessage: '## 附件案例已确认\n\n已冻结准备 `{{$flow.state.preparationId}}`，本回合不再执行其他写操作。\n\n请发送：`继续附件目标 {{$flow.state.preparationId}}`。'
        } }
    },
    {
      id: attachmentContextId, position: { x: 2380, y: 520 }, type: 'customNode',
      data: { id: attachmentContextId, label: '校验并恢复已确认附件上下文', name: 'customFunctionAgentflow', version: 1,
        type: 'Custom Function', baseClasses: ['customFunctionAgentflow'], category: 'Agent Flows', inputs: {
          customFunctionInputVariables: [
            { variableName: 'draft', variableValue: '{{$flow.state.caseDraftJson}}' },
            { variableName: 'preparationId', variableValue: '{{$flow.state.preparationId}}' },
            { variableName: 'ingestJobId', variableValue: '{{$flow.state.ingestJobId}}' }
          ],
          customFunctionJavascriptFunction: "const parse=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(String(v||'{}'))}catch{return {}}};const draft=parse($draft);const preparationId=String($preparationId||'').trim();const ingestJobId=String($ingestJobId||'').trim();if(!/^prep_[0-9a-f-]{36}$/i.test(preparationId)||!/^ingest_[0-9a-f-]{36}$/i.test(ingestJobId)||!draft.entryUrl||!draft.targetSystem||!draft.credentialRef)throw new Error('I10_ATTACHMENT_RESUME_CONTEXT_INVALID');return {entryUrl:draft.entryUrl,targetSystem:draft.targetSystem,credentialRef:draft.credentialRef};",
          customFunctionUpdateState: [
            { key: 'controllerDraft_entryUrl', value: '{{ output.entryUrl }}' },
            { key: 'controllerDraft_targetSystem', value: '{{ output.targetSystem }}' },
            { key: 'credentialRef', value: '{{ output.credentialRef }}' }
          ]
        } }
    },
    {
      id: attachmentTargetStatusId, position: { x: 3040, y: 520 }, type: 'customNode',
      data: { id: attachmentTargetStatusId, label: '附件目标档案状态路由', name: 'conditionAgentflow', version: 1,
        type: 'Condition', baseClasses: ['conditionAgentflow'], category: 'Agent Flows', inputs: { conditions: [
          { type: 'string', value1: '{{$flow.state.targetProfileStatus}}', operation: 'equal', value2: 'PENDING_CONFIRMATION' },
          { type: 'string', value1: '{{$flow.state.targetProfileStatus}}', operation: 'equal', value2: 'ACTIVE' }
        ] } }
    },
    {
      id: attachmentTargetReadyId, position: { x: 3920, y: 520 }, type: 'customNode',
      data: { id: attachmentTargetReadyId, label: '附件目标档案已冻结', name: 'directReplyAgentflow', version: 1,
        type: 'Direct Reply', baseClasses: ['directReplyAgentflow'], category: 'Agent Flows', inputs: {
          directReplyMessage: '## 目标档案已冻结\n\n本回合不创建 Journey。请发送：`继续附件旅程 {{$flow.state.preparationId}}`。'
        } }
    },
    {
      id: attachmentJourneyReadyId, position: { x: 3260, y: 740 }, type: 'customNode',
      data: { id: attachmentJourneyReadyId, label: '附件权威旅程已创建', name: 'directReplyAgentflow', version: 1,
        type: 'Direct Reply', baseClasses: ['directReplyAgentflow'], category: 'Agent Flows', inputs: {
          directReplyMessage: '## 附件案例旅程已精确绑定\n\n请发送：`继续旅程 {{$flow.state.journeyId}}`，以在新回合提交作者化。'
        } }
    }
  )

  const attachmentJourneyNode = flow.nodes.find(node => node.id === attachmentJourneyPrepareId)
  const attachmentTargetPrepareNode = flow.nodes.find(node => node.id === attachmentTargetPrepareId)
  attachmentTargetPrepareNode.data.inputs.toolInputArgs = (attachmentTargetPrepareNode.data.inputs.toolInputArgs || [])
    .filter(argument => argument?.inputArgName !== 'applicationProfile')
  attachmentJourneyNode.data.inputs.toolInputArgs = [
    { inputArgName: 'sessionRef', inputArgValue: '{{$flow.sessionId}}' },
    { inputArgName: 'requestIntent', inputArgValue: 'CASE_AUTHORING' },
    { inputArgName: 'inputType', inputArgValue: '{{$flow.state.inputType}}' },
    { inputArgName: 'credentialRef', inputArgValue: '{{$flow.state.credentialRef}}' },
    { inputArgName: 'targetProfileId', inputArgValue: '{{$flow.state.targetProfileId}}' },
    { inputArgName: 'preparationId', inputArgValue: '{{$flow.state.preparationId}}' },
    { inputArgName: 'ingestJobId', inputArgValue: '{{$flow.state.ingestJobId}}' },
    { inputArgName: 'supportingImages', inputArgValue: [] },
    { inputArgName: 'interactionContractVersion', inputArgValue: 'v6' }
  ]

  for (const variable of [
    { variableName: 'preparationId', variableValue: '{{$flow.state.preparationId}}' },
    { variableName: 'targetProfileId', variableValue: '{{$flow.state.targetProfileId}}' }
  ]) {
    if (!resumeDetect.data.inputs.customFunctionInputVariables.some(item => item.variableName === variable.variableName)) {
      resumeDetect.data.inputs.customFunctionInputVariables.push(variable)
    }
  }
  resumeDetect.data.inputs.customFunctionJavascriptFunction = resumeDetect.data.inputs.customFunctionJavascriptFunction
    .replace(
      "const currentJourneyId = String($journeyId || '').trim();",
      `const currentJourneyId = String($journeyId || '').trim();\nconst currentPreparationId=String($preparationId||'').trim();\nconst currentTargetProfileId=String($targetProfileId||'').trim();\nconst attachmentTarget=text.match(/^继续附件目标\\s*(${opaqueReferences.source('preparation')})$/i);\nconst attachmentJourney=text.match(/^继续附件旅程\\s*(${opaqueReferences.source('preparation')})$/i);\nconst exactAttachmentTarget=attachmentTarget&&attachmentTarget[1]===currentPreparationId&&/^${opaqueReferences.source('ingest')}$/i.test(ingestJobId);\nconst exactAttachmentJourney=attachmentJourney&&attachmentJourney[1]===currentPreparationId&&/^${opaqueReferences.source('targetprofile')}$/i.test(currentTargetProfileId);`
    )
    .replace(
      "route: imageIngestId && imageDecision === 'CONTINUE_CONFIRMED'",
      "route: exactAttachmentTarget ? 'RESUME_ATTACHMENT_TARGET' : (exactAttachmentJourney ? 'RESUME_ATTACHMENT_JOURNEY' : (imageIngestId && imageDecision === 'CONTINUE_CONFIRMED'"
    )
    .replace(
      ": (wantsResume && ingestJobId ? 'RESUME_INGEST' : (journeyId ? 'RESUME_JOURNEY' : (wantsResume && candidateJobId ? 'RESUME_CANDIDATE' : 'CLASSIFY')))),",
      ": (journeyId ? 'RESUME_JOURNEY' : (wantsResume && ingestJobId ? 'RESUME_INGEST' : (wantsResume && candidateJobId ? 'RESUME_CANDIDATE' : 'CLASSIFY')))))),"
    )
  resumeRouteNode.data.inputs.conditions.push(
    { type: 'string', value1: '{{$flow.state.resumeRoute}}', operation: 'equal', value2: 'RESUME_ATTACHMENT_TARGET' },
    { type: 'string', value1: '{{$flow.state.resumeRoute}}', operation: 'equal', value2: 'RESUME_ATTACHMENT_JOURNEY' }
  )
  normalClassifyEdge.sourceHandle = 'conditionAgentflow_i10_v4_candidate_resume_route-output-7'
  ingestDecisionEdge.target = attachmentIngestProjectionId
  ingestDecisionEdge.targetHandle = attachmentIngestProjectionId
  flow.edges.push(
    { id: 'i10-v6-attachment-ingest-project', source: attachmentIngestProjectionId, sourceHandle: `${attachmentIngestProjectionId}-output-customFunctionAgentflow`, target: attachmentIngestReadyId, targetHandle: attachmentIngestReadyId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-resume', source: resumeRouteNode.id, sourceHandle: `${resumeRouteNode.id}-output-5`, target: attachmentContextId, targetHandle: attachmentContextId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-context-application', source: attachmentContextId, sourceHandle: `${attachmentContextId}-output-customFunctionAgentflow`, target: attachmentApplicationId, targetHandle: attachmentApplicationId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-application-target', source: attachmentApplicationId, sourceHandle: `${attachmentApplicationId}-output-customFunctionAgentflow`, target: attachmentTargetPrepareId, targetHandle: attachmentTargetPrepareId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-status', source: attachmentTargetPrepareId, sourceHandle: `${attachmentTargetPrepareId}-output-toolAgentflow`, target: attachmentTargetStatusId, targetHandle: attachmentTargetStatusId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-confirm', source: attachmentTargetStatusId, sourceHandle: `${attachmentTargetStatusId}-output-0`, target: attachmentTargetConfirmId, targetHandle: attachmentTargetConfirmId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-active', source: attachmentTargetStatusId, sourceHandle: `${attachmentTargetStatusId}-output-1`, target: attachmentTargetReadyId, targetHandle: attachmentTargetReadyId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-unavailable', source: attachmentTargetStatusId, sourceHandle: `${attachmentTargetStatusId}-output-2`, target: attachmentTargetRejectedId, targetHandle: attachmentTargetRejectedId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-approved', source: attachmentTargetConfirmId, sourceHandle: `${attachmentTargetConfirmId}-output-0`, target: attachmentTargetApproveId, targetHandle: attachmentTargetApproveId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-rejected', source: attachmentTargetConfirmId, sourceHandle: `${attachmentTargetConfirmId}-output-1`, target: attachmentTargetRejectId, targetHandle: attachmentTargetRejectId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-readback', source: attachmentTargetApproveId, sourceHandle: `${attachmentTargetApproveId}-output-toolAgentflow`, target: attachmentTargetGetId, targetHandle: attachmentTargetGetId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-stop', source: attachmentTargetRejectId, sourceHandle: `${attachmentTargetRejectId}-output-toolAgentflow`, target: attachmentTargetRejectedId, targetHandle: attachmentTargetRejectedId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-target-ready', source: attachmentTargetGetId, sourceHandle: `${attachmentTargetGetId}-output-toolAgentflow`, target: attachmentTargetReadyId, targetHandle: attachmentTargetReadyId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-journey-resume', source: resumeRouteNode.id, sourceHandle: `${resumeRouteNode.id}-output-6`, target: attachmentJourneyPrepareId, targetHandle: attachmentJourneyPrepareId, type: 'buttonedge' },
    { id: 'i10-v6-attachment-journey-project', source: attachmentJourneyPrepareId, sourceHandle: `${attachmentJourneyPrepareId}-output-toolAgentflow`, target: attachmentJourneyReadyId, targetHandle: attachmentJourneyReadyId, type: 'buttonedge' }
  )
  attachJourneyProjection(attachmentJourneyPrepareId, attachmentJourneyReadyId, 'attachment')
}
flow.name = '衡准自动化回归主控-I10 v6本机验收收口版'
flow.description = '衡准 I10 Agentflow v6：唯一构建、发布回读、迁移就绪与验证策略收口。'
flow.i10Contract = {
  ...flow.i10Contract,
  schemaVersion: 'hengzhun-i10-agentflow-v6',
  generationAuthority: 'scripts/build-i10-agentflow-v6.cjs',
  verificationPolicyVersion: 'VerificationPolicyV2',
  publicationIntegrity: 'FLOW_SOURCE_API_READBACK_MANIFEST'
}
writeJson('flowise/i10/agentflow-v6.json', flow)

const layout = fs.existsSync(path.join(root, 'flowise/i10/agentflow-v5-layout.json'))
  ? readJson('flowise/i10/agentflow-v5-layout.json') : {}
writeJson('flowise/i10/agentflow-v6-layout.json', { ...layout, schemaVersion: 'hengzhun-i10-agentflow-layout-v6', flowVersion: 6 })

const manifest = readJson('flowise/i10/publication-manifest-v1.json')
const primaryFlowSha256 = sha256File('flowise/i10/agentflow-v6.json')
// A no-op rebuild is frequently performed by PREPARE and static verification.
// Keep a verified publication attestation only when the generated bytes are
// exactly the same as the source that was API-round-trip verified.  Any source
// change deliberately clears that attestation and requires public-API publish.
const retainPublication = manifest.deployed === true &&
  manifest.primaryFlowDataPath === 'flowise/i10/agentflow-v6.json' &&
  manifest.primaryFlowVersion === 6 &&
  manifest.primaryFlowSha256 === primaryFlowSha256 &&
  typeof manifest.deployedFlowDataSha256 === 'string' &&
  manifest.deployedFlowDataSha256.length === 64 &&
  manifest.publishState === 'DEPLOYED_PRIVATE_PUBLIC_API_ROUND_TRIP_VERIFIED'
writeJson('flowise/i10/publication-manifest-v1.json', {
  ...manifest,
  primaryFlowDataPath: 'flowise/i10/agentflow-v6.json',
  primaryFlowVersion: 6,
  primaryFlowSha256,
  layoutSnapshotPath: 'flowise/i10/agentflow-v6-layout.json',
  deployed: retainPublication ? manifest.deployed : false,
  deployedFlowDataSha256: retainPublication ? manifest.deployedFlowDataSha256 : null,
  publishState: retainPublication ? manifest.publishState : 'BUILT_NOT_PUBLISHED',
  publicationEvidencePath: retainPublication ? manifest.publicationEvidencePath : null,
  lastVerifiedAt: retainPublication ? manifest.lastVerifiedAt : null
})
process.stdout.write('HENGZHUN_I10_AGENTFLOW_V6_BUILT\n')
