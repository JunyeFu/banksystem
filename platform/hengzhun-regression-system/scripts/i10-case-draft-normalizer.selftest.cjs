'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeFlowiseDraft,
  flowiseFunctionSource,
  structuredFlowiseFunctionSource
} = require('./i10-case-draft-normalizer.cjs')

const credentialRef = 'credential_12345678-1234-1234-1234-123456789abc'
const baseDraft = {
  caseTitle: '复兴银行门户登录回归案例',
  objective: '验证登录',
  summary: '验证登录与资料一致性',
  targetSystem: '复兴银行门户',
  entryUrl: 'http://127.0.0.1:18082/portal/login',
  preconditions: ['门户可访问'],
  actions: ['打开登录页', '输入用户名', '输入密码', '点击登录'],
  expectedOutcomes: ['显示登录页', '用户名已输入', '密码已输入', '登录成功'],
  assertions: ['登录成功'],
  missingFields: ['测试账号具体值', '测试密码具体值', '元素定位信息'],
  multimodalContextJson: {
    supportingImageIngestId: '',
    caseFacts: [],
    actionStepsV2: [
      { stepIndex: 1, actionType: 'navigate', elementDescription: '登录页' },
      { stepIndex: 2, action: '输入用户名', inputValue: '不得保留', inputValueSource: 'CREDENTIAL_REF' },
      { stepIndex: 3, action: '输入密码', inputValue: '不得保留', inputValueSource: 'CREDENTIAL_REF' },
      { stepIndex: 4, actionType: 'click', elementDescription: '登录按钮' }
    ],
    verificationRequirements: []
  },
  acceptanceSummary: '验证登录成功'
}

test('normalizes surrounding URL whitespace and freezes credential by reference', () => {
  const result = normalizeFlowiseDraft(
    { ...baseDraft, entryUrl: '\n http://127.0.0.1:18082/portal/login \r\n' },
    credentialRef,
    '入口地址：http://127.0.0.1:18082/portal/login'
  )
  assert.equal(result.status, 'READY')
  const draft = JSON.parse(result.draftJson)
  assert.equal(draft.entryUrl, 'http://127.0.0.1:18082/portal/login')
  assert.equal(draft.credentialRef, credentialRef)
  assert.deepEqual(draft.missingFields, [])
  assert.equal(draft.actionStepsV2[1].inputValueSource, 'CREDENTIAL_REF')
  assert.equal('inputValue' in draft.actionStepsV2[1], false)
  assert.deepEqual(draft.actionStepsV2.map(step => step.ordinal), [1, 2, 3, 4])
})

test('blocks empty or invalid URL before confirmation', () => {
  const empty = normalizeFlowiseDraft({ ...baseDraft, entryUrl: '' }, credentialRef, '没有地址')
  assert.equal(empty.status, 'NEEDS_CLARIFICATION')
  assert.match(empty.clarificationQuestion, /entryUrl/)
  const invalid = normalizeFlowiseDraft({ ...baseDraft, entryUrl: 'file:///tmp/login' }, credentialRef, '')
  assert.equal(invalid.status, 'NEEDS_CLARIFICATION')
  assert.equal(invalid.errorCode, 'I10_ENTRY_URL_PROTOCOL_INVALID')
})

test('accepts legacy JSON string multimodal input and emits canonical steps', () => {
  const raw = { ...baseDraft, multimodalContextJson: JSON.stringify(baseDraft.multimodalContextJson) }
  const result = normalizeFlowiseDraft(raw, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login')
  assert.equal(result.status, 'READY')
  const draft = JSON.parse(result.draftJson)
  assert.equal(draft.actionStepsV2[0].actionType, 'NAVIGATE')
  assert.equal(draft.actionStepsV2[3].actionType, 'CLICK')
  assert.ok(draft.actionStepsV2.every(step => step.instruction && step.expected))
})

test('requires a valid credential reference without exposing credential values', () => {
  const result = normalizeFlowiseDraft(baseDraft, 'credentialRef', '')
  assert.equal(result.status, 'NEEDS_CLARIFICATION')
  assert.match(result.clarificationQuestion, /credentialRef/)
  assert.doesNotMatch(result.displayJson, /不得保留/)
})

test('Flowise function source is self contained and contains no package path', () => {
  const source = flowiseFunctionSource()
  assert.match(source, /normalizeFlowiseDraft/)
  assert.match(source, /return normalizeFlowiseDraft/)
  assert.doesNotMatch(source, /require\s*\(/)
})

test('Flowise function source executes with Agentflow-style sandbox variables', async () => {
  const execute = new Function('$rawDraft', '$credentialRef', '$naturalLanguage', `return (async()=>{${flowiseFunctionSource()}})()`)
  const result = await execute(baseDraft, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login')
  assert.equal(result.status, 'READY')
  assert.equal(JSON.parse(result.draftJson).entryUrl, 'http://127.0.0.1:18082/portal/login')
})

test('structured Flowise source constructs rawDraft from declared field variables', async () => {
  const fields = [
    'caseTitle', 'objective', 'summary', 'targetSystem', 'entryUrl',
    'preconditions', 'actions', 'expectedOutcomes', 'assertions', 'missingFields',
    'multimodalContext', 'acceptanceSummary', 'clarificationRequired',
    'clarificationQuestion', 'semanticVerdict', 'satisfiedRequirementIds',
    'unresolvedRequirements', 'semanticConfidence'
  ]
  const source = structuredFlowiseFunctionSource(fields)
  assert.match(source, /const rawDraft=\{/)
  assert.doesNotMatch(source, /normalizeFlowiseDraft\(\$rawDraft\b/)
  const execute = new Function(
    ...fields.map(field => `$${field}`),
    '$credentialRef',
    '$naturalLanguage',
    '$imageIngestId',
    '$imageFactsJson',
    '$priorDraft',
    `return (async()=>{${source}})()`
  )
  const values = fields.map(field => {
    if (field === 'multimodalContext') return baseDraft.multimodalContextJson
    if (field === 'semanticVerdict') return 'COMPLETE'
    if (field === 'satisfiedRequirementIds') return ['CASE_TITLE', 'ENTRY_URL', 'ACTIONS']
    if (field === 'unresolvedRequirements') return []
    if (field === 'semanticConfidence') return 0.95
    return baseDraft[field]
  })
  const result = await execute(
    ...values,
    credentialRef,
    '入口地址：http://127.0.0.1:18082/portal/login',
    '',
    [],
    {}
  )
  assert.equal(result.status, 'READY')
  const draft = JSON.parse(result.draftJson)
  assert.equal(draft.title, baseDraft.caseTitle)
  assert.equal(draft.entryUrl, 'http://127.0.0.1:18082/portal/login')
  assert.equal(draft.credentialRef, credentialRef)
})

test('structured Flowise source remains safe when optional image and prior draft inputs are absent', async () => {
  const fields = [
    'caseTitle', 'objective', 'summary', 'targetSystem', 'entryUrl',
    'preconditions', 'actions', 'expectedOutcomes', 'assertions', 'missingFields',
    'multimodalContext', 'acceptanceSummary', 'clarificationRequired',
    'clarificationQuestion', 'semanticVerdict', 'satisfiedRequirementIds',
    'unresolvedRequirements', 'semanticConfidence'
  ]
  const source = structuredFlowiseFunctionSource(fields)
  const execute = new Function(
    ...fields.map(field => `$${field}`),
    '$credentialRef',
    '$naturalLanguage',
    `return (async()=>{${source}})()`
  )
  const values = fields.map(field => {
    if (field === 'multimodalContext') return baseDraft.multimodalContextJson
    if (field === 'semanticVerdict') return 'COMPLETE'
    if (field === 'satisfiedRequirementIds') return []
    if (field === 'unresolvedRequirements') return []
    if (field === 'semanticConfidence') return 0.9
    return baseDraft[field]
  })
  const result = await execute(
    ...values,
    credentialRef,
    '入口地址：http://127.0.0.1:18082/portal/login'
  )
  assert.equal(result.status, 'READY')
})

test('structured Flowise source rejects invalid field contracts at build time', () => {
  assert.throws(
    () => structuredFlowiseFunctionSource([]),
    /I10_STRUCTURED_NORMALIZER_FIELDS_REQUIRED/
  )
  assert.throws(
    () => structuredFlowiseFunctionSource(['caseTitle', 'caseTitle']),
    /I10_STRUCTURED_NORMALIZER_FIELDS_INVALID/
  )
  assert.throws(
    () => structuredFlowiseFunctionSource(['caseTitle', 'bad-field']),
    /I10_STRUCTURED_NORMALIZER_FIELDS_INVALID/
  )
})
