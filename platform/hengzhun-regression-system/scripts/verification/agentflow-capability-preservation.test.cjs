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
  assert.ok(roots.includes('startAgentflow_i10_v3'))
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
