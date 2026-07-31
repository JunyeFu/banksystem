'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')

test('runtime MCP registrations equal the authoritative 33-tool contract', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const runtimeTools = [...source.matchAll(/server\.registerTool\('([^']+)'/g)].map(match => match[1]).sort()
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/mcp/hengzhun-i8.json'), 'utf8'))
  const contractTools = contract.tools.map(tool => tool.name).sort()
  assert.equal(runtimeTools.length, 33)
  assert.equal(new Set(runtimeTools).size, 33)
  assert.deepEqual(runtimeTools, contractTools)
  assert.ok(runtimeTools.includes('schedule_disable'))
  assert.ok(runtimeTools.includes('artifact_download_grant'))
  assert.ok(runtimeTools.includes('journey_input_submit'))
  assert.ok(runtimeTools.includes('target_profile_prepare'))
  assert.ok(runtimeTools.includes('target_profile_get'))
  assert.ok(runtimeTools.includes('target_profile_decision_submit'))
})

test('both Journey reads and writes use the bounded Flowise response projection', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(
    source,
    /server\.registerTool\('journey_get'[\s\S]{0,1200}?compactJourneyForFlowise/,
    'cross-session journey reads must not exceed the native MCP result budget'
  )
  assert.match(
    source,
    /server\.registerTool\('journey_prepare'[\s\S]{0,12000}?compactJourneyForFlowise/,
    'journey preparation must keep the same bounded contract'
  )
})

test('bounded Journey projection retains the root proposal aliases consumed by Flowise state', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  for (const field of [
    'proposalSummary', 'proposalEffect', 'proposalRejectEffect',
    'proposalProceedDecision', 'proposalRejectDecision'
  ]) assert.match(source, new RegExp(`\\b${field}:`))
})

test('generated Flowise v6 has exact interaction semantics and no raw tool-result reply', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  assert.equal(flow.i10Contract.toolCount, 33)
  const actions = flow.nodes
    .filter(node => node.data?.name === 'toolAgentflow')
    .flatMap(node => node.data.inputs.toolAgentflowSelectedToolConfig?.mcpActions || [])
  for (const required of [
    'journey_prepare', 'journey_get', 'journey_input_submit', 'journey_decision_submit',
    'credential_session_create', 'credential_session_get',
    'target_profile_prepare', 'target_profile_get', 'target_profile_decision_submit',
    'ingest_submit', 'ingest_get', 'ingest_decision_submit',
    'result_inbox_list', 'schedule_disable', 'artifact_download_grant'
  ]) assert.ok(actions.includes(required), `missing tool action ${required}`)
  for (const reply of flow.nodes.filter(node => node.data?.name === 'directReplyAgentflow')) {
    assert.doesNotMatch(reply.data.inputs.directReplyMessage || '', /\{\{\s*toolAgentflow_/)
  }
  for (const gate of flow.nodes.filter(node => node.data?.name === 'humanInputAgentflow')) {
    assert.doesNotMatch(gate.data.inputs.humanInputDescription || '', /\{\{\s*toolAgentflow_/)
    assert.match(gate.data.inputs.humanInputDescription || '', /\bproceed\b/)
    assert.match(gate.data.inputs.humanInputDescription || '', /\breject\b/)
  }
  const preview = flow.nodes.find(node => node.id === 'toolAgentflow_preview')
  assert.deepEqual(
    preview.data.inputs.toolUpdateState.map(item => item.key),
    ['candidateDownloadHref', 'candidateDownloadName', 'candidateDownloadSha256']
  )
  const unified = flow.nodes.find(node => node.id === 'directReplyAgentflow_i10_v3_card')
  assert.equal(unified.data.inputs.directReplyMessage, '{{$flow.state.journeyRenderedMarkdown}}')

  for (const id of ['toolAgentflow_i10_v3_prepare', 'toolAgentflow_i10_v3_resume']) {
    const tool = flow.nodes.find(node => node.id === id)
    const updates = new Map(tool.data.inputs.toolUpdateState.map(item => [item.key, item.value]))
    assert.equal(updates.get('journeyProposalId'), '{{ output.proposalId }}')
    assert.equal(updates.get('journeyProposalPayloadHash'), '{{ output.proposalPayloadHash }}')
    assert.equal(updates.get('journeyProceedDecision'), '{{ output.proposalProceedDecision }}')
    assert.equal(
      [...updates.values()].some(value => String(value).includes('output.proposal.')),
      false
    )
  }

  for (const id of ['toolAgentflow_i10_v3_approve', 'toolAgentflow_i10_v3_reject']) {
    const tool = flow.nodes.find(node => node.id === id)
    assert.ok(tool.data.inputs.toolInputArgs.some(item =>
      item.inputArgName === 'reason' && String(item.inputArgValue).trim().length > 0
    ))
  }
})

test('authoring approval submits a frozen context and never Flowise parallel action arrays', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const submit = flow.nodes.find(node => node.id === 'toolAgentflow_submit')
  assert.ok(submit, 'missing authoring submit tool')
  const args = new Map(submit.data.inputs.toolInputArgs.map(item => [item.inputArgName, item.inputArgValue]))
  // Native Flowise can forward a Custom Function output template literally to
  // a Tool node. The compiler therefore persists its frozen context first and
  // the MCP boundary reads the state value.
  assert.equal(args.get('authoringContext'), '{{$flow.state.authoringContext}}')
  assert.equal(args.get('route'), '{{$flow.state.targetProfileLaunchUrl}}')
  assert.equal(args.get('executionProfile'), 'GENERIC_WEB')
  assert.equal(args.get('targetProfileId'), '{{$flow.state.targetProfileId}}')
  assert.equal(args.get('targetProfileVersion'), '{{$flow.state.targetProfileVersion}}')
  assert.equal(args.get('targetProfileHash'), '{{$flow.state.targetProfileHash}}')
  assert.equal(args.get('targetProfileSnapshot'), '{{$flow.state.targetProfileSnapshot}}')
  const compiler = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
  assert.ok(compiler)
  assert.deepEqual(compiler.data.inputs.customFunctionUpdateState, [
    { key: 'authoringContext', value: '{{ output.authoringContext }}' }
  ])
  for (const field of ['actions', 'expectedOutcomes', 'riskLevels', 'inputValues', 'inputValueSources', 'assertions', 'intentStepIds']) {
    assert.equal(args.has(field), false, `authoring must not interpolate ${field}`)
  }
  const mcp = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const harness = fs.readFileSync(path.join(root, 'harness/src/service.ts'), 'utf8')
  assert.match(mcp, /authoringContext/)
  assert.match(mcp, /z\.literal\(''\)/)
  assert.match(harness, /prepared CaseDraft is immutable/i)
  assert.match(harness, /intentPlanSchema\.parse/)
})

test('compact case structure uses the field-level native structured-output contract', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const structure = flow.nodes.find(node => node.id === 'llmAgentflow_i10_v3_structure')
  const normalizer = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v3_normalize')
  assert.ok(structure)
  assert.ok(normalizer)
  assert.deepEqual(
    structure.data.inputs.llmStructuredOutput.map(item => item.key),
    ['caseTitle', 'objective', 'targetSystem', 'entryUrl', 'actions', 'expectedOutcomes', 'missingFields']
  )
  assert.ok(structure.data.inputs.llmUpdateState.some(item =>
    item.key === 'controllerDraft_actions' && item.value === '{{ output.actions }}'
  ))
  assert.equal(structure.data.inputs.llmUpdateState.some(item => item.key === 'controllerDraftRaw'), false)
  assert.ok(normalizer.data.inputs.customFunctionInputVariables.some(item =>
    item.variableName === 'controllerDraftRaw' && item.variableValue === '{{$flow.state.controllerDraftRaw}}'
  ))
  assert.match(normalizer.data.inputs.customFunctionJavascriptFunction, /controllerRaw=parseObject/)
})

test('authoring compiler reads canonical CaseDraft steps instead of stale parallel arrays', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const compiler = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
  assert.ok(compiler)
  assert.match(compiler.data.inputs.customFunctionJavascriptFunction, /const draftSteps = Array\.isArray\(draft\.steps\)/)
  assert.match(compiler.data.inputs.customFunctionJavascriptFunction, /draftSteps\.map\(step => text\(step && step\.action\)\)/)
})

test('authoring context reconstruction preserves ACTIVE target-profile status', () => {
  const service = fs.readFileSync(path.join(root, 'harness/src/service.ts'), 'utf8')
  assert.match(service, /schemaVersion: 'hengzhun-target-profile-v1',\s+status: 'ACTIVE'/)
})

test('interaction matrix covers every supported input, intent and interaction mode', () => {
  const matrix = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/interaction-matrix-v3.json'), 'utf8'))
  assert.deepEqual(matrix.inputs.map(item => item.type), ['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO'])
  assert.deepEqual(matrix.intents.map(item => item.intent), [
    'CASE_AUTHORING', 'RESULT_QUERY', 'SCHEDULE_DISABLE', 'JOURNEY_RESUME', 'HELP', 'UNSUPPORTED'
  ])
  for (const mode of ['STATUS_ONLY', 'INPUT_REQUIRED', 'CONFIRM_EXACT']) {
    assert.ok(Array.isArray(matrix.interactionModes[mode].modules), `missing interaction mode ${mode}`)
  }
  assert.equal(matrix.interactionModes.CONFIRM_EXACT.freeTextAllowed, false)
  assert.equal(matrix.decisionRules.primaryDecisionAllowed, false)
  assert.equal(matrix.decisionRules.secondConfirmationBeforeMutation, true)
  assert.equal(matrix.inputRules.currentHumanInputFeedbackOnly, true)
  assert.equal(matrix.delivery.rawToolOutput, false)
})
