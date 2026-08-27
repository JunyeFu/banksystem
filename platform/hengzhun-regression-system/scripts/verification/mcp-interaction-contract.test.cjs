'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parseJsonArgument } = require('../../mcp/src/rf001-contract-adapter.cjs')

const root = path.resolve(__dirname, '../..')

test('runtime MCP registrations equal the authoritative 35-tool contract', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const runtimeTools = [...source.matchAll(/server\.registerTool\('([^']+)'/g)].map(match => match[1]).sort()
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/mcp/hengzhun-i8.json'), 'utf8'))
  const contractTools = contract.tools.map(tool => tool.name).sort()
  assert.equal(runtimeTools.length, 35)
  assert.equal(new Set(runtimeTools).size, 35)
  assert.deepEqual(runtimeTools, contractTools)
  assert.ok(runtimeTools.includes('schedule_disable'))
  assert.ok(runtimeTools.includes('artifact_download_grant'))
  assert.ok(runtimeTools.includes('journey_input_submit'))
  assert.ok(runtimeTools.includes('target_profile_prepare'))
  assert.ok(runtimeTools.includes('target_profile_get'))
  assert.ok(runtimeTools.includes('target_profile_decision_submit'))
  assert.ok(runtimeTools.includes('candidate_compile'))
  assert.ok(runtimeTools.includes('result_inbox_ack'))
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

  const start = flow.nodes.find(node => node.data?.name === 'startAgentflow')
  assert.ok(start.data.inputs.startState.some(item => item.key === 'confirmedDecisionEventId'))
  const journeyProjections = flow.nodes.filter(node => node.id?.includes('journey_projection'))
  assert.ok(journeyProjections.length > 0)
  for (const projection of journeyProjections) {
    const updates = new Map(projection.data.inputs.customFunctionUpdateState.map(item => [item.key,item.value]))
    assert.equal(updates.get('confirmedDecisionEventId'),'{{ output.references.confirmedDecisionEventId }}')
  }
  const executionTools = flow.nodes.filter(node => {
    const mcpActions = node.data?.inputs?.toolAgentflowSelectedToolConfig?.mcpActions || []
    return mcpActions.includes('run_submit') || mcpActions.includes('schedule_create')
  })
  assert.ok(executionTools.length > 0)
  for (const tool of executionTools) {
    const args = new Map(tool.data.inputs.toolInputArgs.map(item => [item.inputArgName,item.inputArgValue]))
    assert.equal(args.get('journeyId'),'{{$flow.state.journeyId}}')
    assert.equal(args.get('confirmedDecisionEventId'),'{{$flow.state.confirmedDecisionEventId}}')
  }

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
    { key: 'targetProfileLaunchUrl', value: '{{ output.route }}' },
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

test('bounded Journey projection preserves fields required to revalidate a target-bound CaseDraft', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(source,/confidence: Number\.isFinite\(Number\(draft\.confidence\)\)/)
  assert.match(source,/targetProfileId: text\(draft\.targetProfileId, 160\)/)
  assert.match(source,/targetProfileVersion: draft\.targetProfileVersion/)
  assert.match(source,/normalizeRegisteredAdapterSelection\(draft\.adapterSelection\)/)
  assert.match(source,/normalizeRegisteredAdapterSelection\(business\.adapterSelection\)/)
  assert.match(source,/adapterSelection:\s*z\.string\(\)\.trim\(\)\.max\(160\)\.optional\(\)/)
})

test('bounded Journey projection preserves authoritative attachment target bindings', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(source,/targetProfileId: text\(body\.references\.targetProfileId, 160\)/)
  assert.match(source,/ingestJobId: text\(body\.references\.ingestJobId, 160\)/)
})

test('authoring compiler restores a lost cross-session route from the immutable CaseDraft', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const compiler = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
  assert.ok(compiler)
  const execute = new Function(
    '$caseDraftJson', '$route', '$targetProfileId', '$targetProfileVersion', '$targetProfileHash', '$targetProfileSnapshot',
    compiler.data.inputs.customFunctionJavascriptFunction
  )
  const result = execute(JSON.stringify({
    entryUrl: 'http://127.0.0.1:18082/portal/login',
    steps: [
      { action: '登录门户', expected: '进入首页' },
      { action: '打开账户页', expected: '显示账户卡片' }
    ],
    assertions: ['账户页可用']
  }), '', '', 0, '', '{}')
  assert.equal(result.valid, 'YES')
  assert.equal(result.route, 'http://127.0.0.1:18082/portal/login')
  assert.equal(result.authoringContext, '')
})

test('authoring compiler transports only a complete frozen generic target profile', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
  const compiler = flow.nodes.find(node => node.id === 'llmAgentflow_intent')
  const execute = new Function(
    '$caseDraftJson', '$route', '$targetProfileId', '$targetProfileVersion', '$targetProfileHash', '$targetProfileSnapshot',
    compiler.data.inputs.customFunctionJavascriptFunction
  )
  const snapshot = {
    schemaVersion: 'hengzhun-target-profile-v1', status: 'ACTIVE',
    targetProfileId: 'target-profile-test', launchUrl: 'https://example.test/login'
  }
  const result = execute(JSON.stringify({
    entryUrl: snapshot.launchUrl,
    steps: [{ action: '打开登录页', expected: '显示登录页' }],
    assertions: ['登录页可见']
  }), '', snapshot.targetProfileId, 1, 'a'.repeat(64), JSON.stringify(snapshot))
  assert.match(result.authoringContext, /^uri:/)
  const context = parseJsonArgument(result.authoringContext, 'TEST_INVALID')
  assert.equal(context.targetProfileId, snapshot.targetProfileId)
  assert.equal(context.targetProfileVersion, 1)
  assert.equal(context.targetProfileHash, 'a'.repeat(64))
  assert.deepEqual(context.targetProfileSnapshot, snapshot)
})

test('MCP object boundary decodes governed URI transport and rejects arrays', () => {
  const encoded = `uri:${encodeURIComponent(JSON.stringify({ route: 'https://example.test/login' }))}`
  assert.deepEqual(parseJsonArgument(encoded, 'TEST_INVALID'), { route: 'https://example.test/login' })
  assert.throws(() => parseJsonArgument(`uri:${encodeURIComponent('[1,2]')}`, 'TEST_INVALID'), /TEST_INVALID/)
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

test('repair propose reuses an in-flight proposal for the same incident', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(source, /const reusableProposalStatuses = new Set\(\['STABILITY_QUEUED', 'STABILITY_VALIDATING', 'WAITING_USER'\]\)/)
  assert.match(source, /if \(reusableProposalStatuses\.has\(String\(current\.body\.proposal\?\.status \|\| ''\)\)\) return textResult\(current\.body/)
})
