'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  schemaVersion,
  generationAuthority,
  activeCapabilities,
  plannedCapabilities
} = require('../i10-agentflow-capabilities.cjs')
const { stripTechnicalAdapterActions } = require('../i10-case-draft-normalizer.cjs')

const root = path.resolve(__dirname, '../..')
const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
const nodes = new Map(flow.nodes.map(node => [node.id, node]))
const adjacency = new Map()
for (const edge of flow.edges) {
  if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
  adjacency.get(edge.source).add(edge.target)
}

function hasPath(from, to) {
  const visited = new Set([from])
  const queue = [from]
  while (queue.length) {
    const current = queue.shift()
    if (current === to) return true
    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return false
}

test('v6 declares the publishable generation authority and capability manifest', () => {
  assert.equal(flow.i10Contract.generationAuthority, generationAuthority)
  assert.equal(flow.i10Contract.capabilityManifestVersion, schemaVersion)
  assert.deepEqual(flow.i10Contract.activeCapabilities, activeCapabilities.map(item => item.id))
  assert.deepEqual(flow.i10Contract.plannedCapabilities, plannedCapabilities)
})

for (const capability of activeCapabilities) {
  test(`${capability.id} preserves required nodes and continuous paths`, () => {
    for (const nodeId of capability.requiredNodes) {
      assert.ok(nodes.has(nodeId), `${capability.id} missing node ${nodeId}`)
    }
    for (const [from, to] of capability.requiredPaths) {
      assert.ok(hasPath(from, to), `${capability.id} has no path ${from} -> ${to}`)
    }
  })
}

test('all active capability nodes are reachable from a graph root', () => {
  const incoming = new Set(flow.edges.map(edge => edge.target))
  const roots = flow.nodes.map(node => node.id).filter(id => !incoming.has(id))
  assert.deepEqual(roots, ['startAgentflow_i10_v3'])
  for (const capability of activeCapabilities) {
    for (const nodeId of capability.requiredNodes) {
      assert.ok(roots.some(rootId => hasPath(rootId, nodeId)), `${capability.id}:${nodeId} unreachable`)
    }
  }
})

test('the start node cannot reach a controller LLM without passing the local guard', () => {
  const outgoing = [...(adjacency.get('startAgentflow_i10_v3') || [])]
  assert.deepEqual(outgoing, ['customFunctionAgentflow_i10_v4_entry_secret_guard'])
  assert.equal(
    flow.edges.some(edge =>
      edge.source === 'startAgentflow_i10_v3' &&
      nodes.get(edge.target)?.data?.name === 'llmAgentflow'
    ),
    false
  )
})

test('the entry guard persists its decision to Flow state before the condition reads it', () => {
  const guard = nodes.get('customFunctionAgentflow_i10_v4_entry_secret_guard')
  const condition = nodes.get('conditionAgentflow_i10_v4_entry_safe')
  assert.deepEqual(guard.data.inputs.customFunctionUpdateState, [{
    key: 'entrySafe',
    value: '{{ output.safe }}'
  }])
  assert.equal(condition.data.inputs.conditions[0].value1, '{{$flow.state.entrySafe}}')
  assert.equal(
    JSON.stringify(condition.data.inputs.conditions).includes(
      'customFunctionAgentflow_i10_v4_entry_secret_guard.output'
    ),
    false
  )
})

test('structured controller output is persisted by bounded fields before deterministic normalization', () => {
  const structure = nodes.get('llmAgentflow_i10_v3_structure')
  const normalize = nodes.get('customFunctionAgentflow_i10_v3_normalize')
  assert.ok(structure.data.inputs.llmStructuredOutput.length > 0)
  assert.ok(structure.data.inputs.llmUpdateState.some(item =>
    item.key === 'controllerDraft_actions' && item.value === '{{ output.actions }}'
  ))
  assert.equal(structure.data.inputs.llmUpdateState.some(item => item.key === 'controllerDraftRaw'), false)
  assert.ok(normalize.data.inputs.customFunctionInputVariables.some(item =>
    item.variableName === 'controllerDraftRaw' &&
    item.variableValue === '{{$flow.state.controllerDraftRaw}}'
  ))
  assert.equal(
    JSON.stringify(normalize.data.inputs.customFunctionInputVariables).includes(
      'llmAgentflow_i10_v3_structure.output'
    ),
    false
  )
})

test('credential completion rechecks authoritative missing fields before any exact proposal gate', () => {
  const outgoing = flow.edges.filter(edge =>
    edge.source === 'toolAgentflow_i10_v4_credential_resume_submit'
  )
  assert.deepEqual(
    outgoing.map(edge => edge.target),
    ['conditionAgentflow_i10_v3_needs_input']
  )
  assert.equal(
    outgoing.some(edge => edge.target === 'humanInputAgentflow_i10_v3_decision'),
    false
  )
})

test('initial case feedback is persisted and consumed from Flow state', () => {
  const guard = nodes.get('customFunctionAgentflow_i10_v4_initial_case_guard')
  const condition = nodes.get('conditionAgentflow_i10_v4_initial_case_safe')
  const routeDetect = nodes.get('customFunctionAgentflow_i10_v4_initial_input_route_detect')
  const route = nodes.get('conditionAgentflow_i10_v4_initial_input_route')
  const urlMerge = nodes.get('customFunctionAgentflow_i10_v4_initial_url_merge')
  const structure = nodes.get('customFunctionAgentflow_i10_v5_initial_prompt')
  assert.deepEqual(guard.data.inputs.customFunctionUpdateState, [
    { key: 'interactionFeedbackSafe', value: '{{ output.safe }}' },
    { key: 'interactionFeedback', value: '{{ output.feedback }}' }
  ])
  assert.equal(condition.data.inputs.conditions[0].value1, '{{$flow.state.interactionFeedbackSafe}}')
  assert.ok(routeDetect)
  assert.ok(route)
  assert.ok(urlMerge)
  for (const key of ['caseDraftJson', 'draftDisplayJson', 'semanticAssessmentJson', 'controllerDraft_entryUrl']) {
    assert.ok((urlMerge.data.inputs.customFunctionUpdateState || []).some(item => item.key === key), `I10 URL-only merge does not synchronize ${key}`)
  }
  assert.match(routeDetect.data.inputs.customFunctionJavascriptFunction, /URL_ONLY/)
  assert.equal(route.data.inputs.conditions[0].value1, '{{$flow.state.initialInputRoute}}')
  assert.equal(
    urlMerge.data.inputs.customFunctionInputVariables.find(item => item.variableName === 'entryUrl')?.variableValue,
    '{{$flow.state.initialEntryUrl}}'
  )
  assert.match(String(structure.data.inputs.customFunctionJavascriptFunction), /controller-prompt-envelope-v1/)
  assert.ok(structure.data.inputs.customFunctionInputVariables.some(item =>
    item.variableName === 'currentInput' && item.variableValue.includes('accumulatedCaseInput')
  ))
  assert.ok(hasPath('humanInputAgentflow_i10_v4_initial_case_input', 'llmAgentflow_i10_v3_structure'))
})

test('structured controller payloads are internal user-role transport, not assistant replies', () => {
  assert.equal(flow.i10Contract.internalStructuredOutputRole, 'userMessage')
  for (const node of flow.nodes.filter(item =>
    item.data?.name === 'llmAgentflow' &&
    Array.isArray(item.data.inputs?.llmStructuredOutput) &&
    item.data.inputs.llmStructuredOutput.length > 0
  )) assert.equal(node.data.inputs.llmReturnResponseAs, 'userMessage', node.id)
})

test('human-input branches use Flowise runtime condition indexes', () => {
  for (const edge of flow.edges) {
    if (nodes.get(edge.source)?.data?.name !== 'humanInputAgentflow') continue
    assert.match(
      edge.sourceHandle,
      /-output-[01]$/,
      `${edge.id} must use Flowise human-input outcome index 0 or 1`
    )
  }
})

test('candidate outcome routing reads the latest flow state after a retry', () => {
  for (const id of [
    'conditionAgentflow_candidate_ready',
    'conditionAgentflow_candidate_authoring_failed',
    'conditionAgentflow_candidate_validation_failed'
  ]) {
    const node = nodes.get(id)
    assert.ok(node, `missing ${id}`)
    for (const condition of node.data.inputs.conditions ?? []) {
      assert.equal(condition.value1, '{{$flow.state.candidateNextAction}}')
    }
  }
})

test('case input accumulation and semantic assessment survive credential resume', () => {
  const startState = new Map(nodes.get('startAgentflow_i10_v3')?.data?.inputs?.startState
    ?.map(item => [item.key,item.value]) || [])
  assert.equal(startState.get('caseInputRevision'),1)
  assert.ok(startState.has('accumulatedCaseInput'))
  assert.ok(startState.has('semanticAssessmentJson'))
  const credentialNormalize = nodes.get('customFunctionAgentflow_i10_v4_credential_resume_normalize')
  const variableNames = (credentialNormalize?.data?.inputs?.customFunctionInputVariables || [])
    .map(item => item.variableName)
  for (const required of ['priorDraft','naturalLanguage','credentialRef','semanticVerdict','unresolvedRequirements']) {
    assert.ok(variableNames.includes(required), `凭据恢复规范化缺少:${required}`)
  }
  const resumePromptSource = nodes.get('customFunctionAgentflow_i10_v5_credential_resume_prompt')
    ?.data?.inputs?.customFunctionJavascriptFunction || ''
  assert.match(resumePromptSource,/controller-prompt-envelope-v1/)
  assert.match(resumePromptSource,/caseInputRevision/)
  assert.ok(hasPath('conditionAgentflow_i10_v4_credential_resume_route', 'customFunctionAgentflow_i10_v4_credential_resume_assemble'))
})

test('cross-session recovery restores the authoritative CaseDraft before a frozen decision', () => {
  const restored = nodes.get('toolAgentflow_i10_v4_cross_session_journey_get')
  assert.ok(restored)
  assert.ok((restored.data.inputs.toolUpdateState || []).some(item =>
    item.key === 'caseDraftJson' && item.value === '{{ output.caseDraft }}'
  ))
  assert.ok(hasPath('toolAgentflow_i10_v4_cross_session_journey_get', 'llmAgentflow_intent'))
})

test('cross-session approval compiles authoring intent from the prepared CaseDraft', () => {
  const normal = nodes.get('llmAgentflow_intent')
  const recovery = nodes.get('customFunctionAgentflow_i10_v6_cross_session_intent_compile')
  assert.ok(normal)
  assert.ok(recovery)
  assert.deepEqual(recovery.data.inputs, normal.data.inputs)
  const variables = recovery.data.inputs.customFunctionInputVariables || []
  assert.ok(variables.some(item => item.variableName === 'caseDraftJson' && item.variableValue === '{{$flow.state.caseDraftJson}}'))
  assert.equal(variables.some(item => /^controllerDraft_/.test(item.variableName)), false)
})

test('image fact confirmation is resumed as one exact new-chat decision', () => {
  const transition = nodes.get('directReplyAgentflow_i10_v6_image_facts_transition')
  const decisionRoute = nodes.get('conditionAgentflow_i10_v6_image_facts_resume_decision_route')
  assert.ok(transition)
  assert.ok(decisionRoute)
  assert.match(transition.data.inputs.directReplyMessage, /确认图片事实/)
  assert.ok(hasPath('conditionAgentflow_i10_v4_candidate_resume_route', decisionRoute.id))
  assert.ok(hasPath(decisionRoute.id, 'toolAgentflow_i10_v4_image_decision_submit'))
  assert.ok(hasPath('conditionAgentflow_i10_v4_candidate_resume_route', 'customFunctionAgentflow_i10_v6_confirmed_image_prompt'))
  assert.ok(hasPath('customFunctionAgentflow_i10_v6_confirmed_image_prompt', 'toolAgentflow_i10_v6_confirmed_image_journey_prepare'))
  assert.ok(hasPath('toolAgentflow_i10_v6_confirmed_image_journey_prepare', 'directReplyAgentflow_i10_v6_confirmed_image_journey_ready'))
  assert.equal(hasPath(decisionRoute.id, 'customFunctionAgentflow_i10_v5_initial_prompt'), false)
})

test('conditional image branches do not converge on the shared authoring prompt', () => {
  const sharedPrompt = 'customFunctionAgentflow_i10_v5_initial_prompt'
  assert.equal(
    flow.edges.some(edge => edge.source === 'conditionAgentflow_i10_v4_image_status' && edge.target === sharedPrompt),
    false
  )
  assert.equal(
    flow.edges.some(edge => edge.source === 'conditionAgentflow_i10_v4_image_route' && edge.sourceHandle === 'conditionAgentflow_i10_v4_image_route-output-2' && edge.target === sharedPrompt),
    false
  )
  assert.equal(
    flow.edges.some(edge => edge.source === 'conditionAgentflow_i10_v4_candidate_resume_route' && edge.sourceHandle === 'conditionAgentflow_i10_v4_candidate_resume_route-output-4' && edge.target === sharedPrompt),
    false
  )
})

test('deterministic normalization removes adapter configuration from browser business actions', () => {
  const normalize = nodes.get('customFunctionAgentflow_i10_v3_normalize')
  const source = normalize.data.inputs.customFunctionJavascriptFunction
  assert.match(source, /function stripTechnicalAdapterActions/)
  assert.match(source, /fuxing-bank-demo|复兴银行.*适配器/)
  assert.match(source, /actions\.splice\(index, 1\)/)
  assert.match(source, /expectedOutcomes\.splice\(index, 1\)/)
  const actions = ['使用已保存凭据登录', '选择复兴银行演示适配器', '进入账户页面']
  const outcomes = ['登录成功', '适配器已选择', '账户页面显示']
  stripTechnicalAdapterActions(actions, outcomes)
  assert.deepEqual(actions, ['使用已保存凭据登录', '进入账户页面'])
  assert.deepEqual(outcomes, ['登录成功', '账户页面显示'])
})

test('primary case-file and video uploads enter the governed ingest chain before Journey preparation', () => {
  const entryRouteId = 'conditionAgentflow_i10_v6_primary_attachment_route'
  const entryRoute = nodes.get(entryRouteId)
  assert.ok(entryRoute)
  assert.deepEqual(entryRoute.data.inputs.conditions.map(condition => condition.value2), ['YES'])
  assert.ok(hasPath('conditionAgentflow_i10_v4_image_route', entryRouteId))
  assert.ok(hasPath(entryRouteId, 'toolAgentflow_i10_v3_ingest_file'))
  assert.ok(hasPath(entryRouteId, 'toolAgentflow_i10_v3_ingest_video'))
  assert.equal(flow.edges.filter(edge => edge.target === 'conditionAgentflow_i10_v3_ingest_video').length, 1,
    'the attachment type split must have one inbound edge so native Agentflow does not treat it as a join')
  assert.ok(hasPath('toolAgentflow_i10_v3_ingest_decide', 'directReplyAgentflow_i10_v6_attachment_ingest_confirmed'))
  const ingestProjection = nodes.get('customFunctionAgentflow_i10_v6_attachment_ingest_projection')
  assert.equal(ingestProjection.data.inputs.customFunctionInputVariables[0].variableValue,
    '{{ toolAgentflow_i10_v3_ingest_decide.output.content }}')
  assert.deepEqual(ingestProjection.data.inputs.customFunctionUpdateState.map(update => update.key),
    ['preparationId','preparationVersion','caseId','caseVersion','credentialRef'])
  assert.deepEqual(ingestProjection.data.inputs.customFunctionUpdateState.map(update => update.value),
    ['{{ output.preparationId }}','{{ output.preparationVersion }}','{{ output.caseId }}','{{ output.caseVersion }}','{{ output.credentialRef }}'])
  assert.equal(hasPath('toolAgentflow_i10_v3_ingest_decide', 'toolAgentflow_i10_v6_attachment_target_profile_prepare'), false,
    'ingest confirmation and target-profile preparation must be separate write executions')
  assert.ok(hasPath('conditionAgentflow_i10_v4_candidate_resume_route', 'toolAgentflow_i10_v6_attachment_target_profile_prepare'))
  assert.equal(nodes.get('toolAgentflow_i10_v6_attachment_target_profile_prepare').data.inputs.toolInputArgs
    .some(argument => argument.inputArgName === 'applicationProfile'), false)
  assert.ok(hasPath('toolAgentflow_i10_v6_attachment_target_profile_approve', 'directReplyAgentflow_i10_v6_attachment_target_profile_ready'))
  assert.equal(hasPath('toolAgentflow_i10_v6_attachment_target_profile_approve', 'toolAgentflow_i10_v6_attachment_journey_prepare'), false,
    'target approval and Journey creation must be separate write executions')
  const journeyPrepare = nodes.get('toolAgentflow_i10_v6_attachment_journey_prepare')
  assert.deepEqual(journeyPrepare.data.inputs.toolInputArgs.map(argument => argument.inputArgName), [
    'sessionRef','requestIntent','inputType','credentialRef','targetProfileId','preparationId','ingestJobId',
    'supportingImages','interactionContractVersion'
  ])
  assert.ok(hasPath('toolAgentflow_i10_v6_attachment_journey_prepare', 'directReplyAgentflow_i10_v6_attachment_journey_ready'))
  assert.equal(hasPath('toolAgentflow_i10_v6_attachment_journey_prepare', 'toolAgentflow_i10_v6_cross_session_authoring_submit'), false,
    'Journey creation and authoring submission must be separate write executions')
  for (const id of [
    'customFunctionAgentflow_i10_v4_candidate_resume_detect',
    'customFunctionAgentflow_i10_v6_attachment_ingest_projection',
    'customFunctionAgentflow_i10_v6_attachment_context_restore'
  ]) {
    const node = nodes.get(id)
    const variableNames = node.data.inputs.customFunctionInputVariables.map(variable => `$${variable.variableName}`)
    assert.doesNotThrow(() => new Function(...variableNames, node.data.inputs.customFunctionJavascriptFunction), `${id} must compile`)
    assert.doesNotMatch(node.data.inputs.customFunctionJavascriptFunction, /\$\{opaqueReferences\./)
  }
  const preparationId = 'prep_11111111-1111-1111-1111-111111111111'
  const ingestId = 'ingest_22222222-2222-2222-2222-222222222222'
  const projectionFunction = new Function('$content', ingestProjection.data.inputs.customFunctionJavascriptFunction)
  assert.equal(projectionFunction(JSON.stringify([{ type:'text', text:JSON.stringify({ cases:[{
    preparationId,preparationVersion:1,caseId:'case_33333333-3333-3333-3333-333333333333',version:1,
    credentialRef:'credential_44444444-4444-4444-4444-444444444444'
  }] }) }])).preparationId, preparationId)
  const detector = nodes.get('customFunctionAgentflow_i10_v4_candidate_resume_detect')
  const detectorVariables = detector.data.inputs.customFunctionInputVariables.map(variable => `$${variable.variableName}`)
  const detectorFunction = new Function(...detectorVariables, detector.data.inputs.customFunctionJavascriptFunction)
  const detectorInput = Object.fromEntries(detectorVariables.map(name => [name, '']))
  detectorInput.$rawInput = `继续附件目标 ${preparationId}`
  detectorInput.$preparationId = preparationId
  detectorInput.$ingestJobId = ingestId
  assert.equal(detectorFunction(...detectorVariables.map(name => detectorInput[name])).route, 'RESUME_ATTACHMENT_TARGET')
  detectorInput.$rawInput = `继续附件旅程 ${preparationId}`
  detectorInput.$targetProfileId = 'targetprofile_55555555-5555-5555-5555-555555555555'
  assert.equal(detectorFunction(...detectorVariables.map(name => detectorInput[name])).route, 'RESUME_ATTACHMENT_JOURNEY')
  detectorInput.$rawInput = '继续旅程 journey_66666666-6666-6666-6666-666666666666'
  detectorInput.$journeyId = 'journey_66666666-6666-6666-6666-666666666666'
  assert.equal(detectorFunction(...detectorVariables.map(name => detectorInput[name])).route, 'RESUME_JOURNEY',
    'an explicit Journey reference must outrank a retained ingest job')
})

test('cross-session proposal cannot bypass TargetProfile confirmation when no profile is frozen', () => {
  const projection = nodes.get('customFunctionAgentflow_i10_v6_cross_session_journey_projection')
  const route = nodes.get('conditionAgentflow_i10_v6_cross_session_adapter_route')
  assert.ok(projection)
  assert.ok(route)
  const source = projection.data.inputs.customFunctionJavascriptFunction
  assert.match(source, /!projectedCaseDraft\.targetProfileId\s*&&\s*!payload\?\.references\?\.targetProfileId/)
  assert.doesNotMatch(source, /adapterConfirmationRequired:\s*payload\?\.caseDraft\?\.adapterSelection === 'fuxing-bank-demo'/)
  assert.ok(hasPath(route.id, 'toolAgentflow_i10_v4_target_profile_prepare_cross_session'))
  assert.ok(hasPath(route.id, 'customFunctionAgentflow_i10_v6_cross_session_decision_parse'))
})

test('cross-session Journey projection flattens TargetProfile prerequisites for Flowise state', () => {
  const projection = nodes.get('customFunctionAgentflow_i10_v6_cross_session_journey_projection')
  assert.ok(projection)
  const execute = new Function('$content', projection.data.inputs.customFunctionJavascriptFunction)
  const payload = {
    journeyId: 'journey_11111111-1111-1111-1111-111111111111',
    caseDraft: {
      targetSystem: '复兴银行门户',
      entryUrl: 'http://127.0.0.1:18082/portal/login',
      credentialRef: 'credential_22222222-2222-2222-2222-222222222222',
      adapterSelection: 'fuxing-bank-demo'
    },
    references: {}
  }
  const result = execute(JSON.stringify([{ type: 'text', text: JSON.stringify(payload) }]))
  assert.equal(result.projectedTargetSystem, payload.caseDraft.targetSystem)
  assert.equal(result.projectedEntryUrl, payload.caseDraft.entryUrl)
  assert.equal(result.projectedCredentialRef, payload.caseDraft.credentialRef)
  assert.equal(result.projectedAdapterSelection, payload.caseDraft.adapterSelection)
  const updates = new Map(projection.data.inputs.customFunctionUpdateState.map(item => [item.key, item.value]))
  assert.equal(updates.get('controllerDraft_targetSystem'), '{{ output.projectedTargetSystem }}')
  assert.equal(updates.get('controllerDraft_entryUrl'), '{{ output.projectedEntryUrl }}')
  assert.equal(updates.get('credentialRef'), '{{ output.projectedCredentialRef }}')
  assert.equal(updates.get('targetAdapterSelection'), '{{ output.projectedAdapterSelection }}')
})

test('isolated authoring parses bounded raw JSON without Flowise structured-output wrapping', () => {
  for (const suffix of ['no_image','confirmed_image']) {
    const structureId = `llmAgentflow_i10_v6_${suffix}_structure`
    const parserId = `customFunctionAgentflow_i10_v6_${suffix}_structure_parse`
    const normalizerId = `customFunctionAgentflow_i10_v6_${suffix}_normalize`
    const structure = nodes.get(structureId)
    const parser = nodes.get(parserId)
    assert.ok(structure)
    assert.ok(parser)
    assert.deepEqual(structure.data.inputs.llmStructuredOutput,[])
    assert.ok(hasPath(structureId,parserId))
    assert.ok(hasPath(parserId,normalizerId))
    const parse = new Function('$raw','$priorDraft',parser.data.inputs.customFunctionJavascriptFunction)
    const draft = {
      caseTitle:'转账首次确认',objective:'验证首次确认路由',targetSystem:'复兴银行门户',entryUrl:'http://127.0.0.1:18082/portal/login',
      actions:['登录','提交转账','确认转账'],expectedOutcomes:['登录成功','显示摘要','进入查询'],missingFields:[]
    }
    assert.deepEqual(parse(JSON.stringify(draft),{}),draft)
    const verbose = {
      ...draft,
      actions:[...draft.actions,'打开消息中心','查看未读消息','核对消息摘要','关闭详情'],
      expectedOutcomes:[...draft.expectedOutcomes,'消息中心打开','未读消息可见','摘要一致','详情关闭'],
      missingFields:Array.from({length:10},(_,index)=>`field-${index}`)
    }
    const bounded = parse(JSON.stringify(verbose),{})
    assert.equal(bounded.actions.length,6)
    assert.equal(bounded.expectedOutcomes.length,6)
    assert.equal(bounded.missingFields.length,8)
    assert.throws(() => parse(JSON.stringify({...draft,actions:[{}]}),{}),/I10_CONTROLLER_DRAFT_JSON_ARRAY_INVALID/)
    assert.throws(() => parse('{"caseTitle":"缺少字段"}',{}),/I10_CONTROLLER_DRAFT_JSON_FIELDS_INVALID/)
    assert.throws(() => parse('',{}),/I10_CONTROLLER_DRAFT_JSON_EMPTY/)
    assert.deepEqual(parse('',{
      title:draft.caseTitle,objective:draft.objective,targetSystem:draft.targetSystem,
      entryUrl:draft.entryUrl,steps:draft.actions.map((action,index)=>({action,expected:draft.expectedOutcomes[index]})),missingFields:[]
    }),draft)
  }
})

test('journey response projections use Custom Function local output paths', () => {
  for (const node of flow.nodes.filter(item => /_journey_projection$/.test(item.id))) {
    const updates = node.data?.inputs?.customFunctionUpdateState || []
    assert.ok(updates.length > 0, `${node.id} must project Journey state`)
    for (const update of updates) {
      assert.match(
        String(update.value),
        /^\{\{ output\./,
        `${node.id}:${update.key} must use the Custom Function output contract`
      )
    }
  }
})
