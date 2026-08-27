'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8'))
const node = flow.nodes.find(item => item.id === 'customFunctionAgentflow_i10_v4_target_profile_prerequisite')
assert.ok(node, '目标站点前置门槛节点缺失')
const names = node.data.inputs.customFunctionInputVariables.map(item => item.variableName)
const evaluate = values => new Function(...names.map(name => `$${name}`), node.data.inputs.customFunctionJavascriptFunction)(
  ...names.map(name => values[name])
)
const base = {
  journeyStatus: 'READY',
  journeyNeedsCredential: 'NO',
  journeyMissingFields: [],
  entryUrl: 'http://127.0.0.1:18082/portal/login',
  draftJson: { entryUrl: 'http://127.0.0.1:18082/portal/login' },
  credentialRef: 'credential_123e4567-e89b-12d3-a456-426614174000',
  targetProfileStatus: '',
  actions: ['打开登录页'],
  expectedOutcomes: ['登录页显示']
}

test('目标站点门槛按缺口顺序路由', () => {
  assert.equal(evaluate({ ...base, credentialRef: '', entryUrl: '', draftJson: { entryUrl: '' } }).route, 'MISSING_CREDENTIAL')
  assert.equal(evaluate({ ...base, entryUrl: '', draftJson: { entryUrl: '' } }).route, 'MISSING_ENTRY_URL')
  assert.equal(evaluate({ ...base, actions: [], expectedOutcomes: [] }).route, 'MISSING_CASE_FIELDS')
  assert.equal(evaluate(base).route, 'PREPARE_TARGET_PROFILE')
  assert.equal(evaluate({ ...base, targetProfileStatus: 'ACTIVE' }).route, 'TARGET_PROFILE_ALREADY_ACTIVE')
})

test('目标站点门槛优先使用规范化CaseDraft中的入口地址', () => {
  assert.equal(
    evaluate({ ...base, entryUrl: '', draftJson: { entryUrl: 'http://127.0.0.1:18082/portal/login' } }).route,
    'PREPARE_TARGET_PROFILE'
  )
})

test('目标站点门槛输入只依赖确定性状态', () => {
  assert.deepEqual(
    names,
    ['journeyStatus', 'journeyNeedsCredential', 'journeyMissingFields', 'entryUrl', 'draftJson', 'credentialRef', 'targetProfileStatus', 'actions', 'expectedOutcomes', 'naturalLanguage']
  )
  assert.match(node.data.inputs.customFunctionJavascriptFunction, /new URL/)
  assert.doesNotMatch(node.data.inputs.customFunctionJavascriptFunction, /fetch|require\(|MCP/i)
})

test('紧凑草案结构化后目标站点门槛从规范化CaseDraft读取步骤', () => {
  const source = fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v6.json'), 'utf8')
  assert.match(source, /const draftActions = Array\.isArray\(draft\.steps\)/)
  assert.match(source, /const actions = draftActions\.length \? draftActions : parse\(\$actions\)/)
  assert.match(source, /const expected = draftExpected\.length \? draftExpected : parse\(\$expectedOutcomes\)/)
})

test('规范化节点把站点工具所需的标量从权威CaseDraft回写到状态', () => {
  const normalizer = flow.nodes.find(item => item.id === 'customFunctionAgentflow_i10_v3_normalize')
  assert.ok(normalizer)
  const values = Object.fromEntries(normalizer.data.inputs.customFunctionUpdateState.map(item => [item.key, item.value]))
  assert.equal(values.controllerDraft_targetSystem, '{{ output.targetSystem }}')
  assert.equal(values.controllerDraft_entryUrl, '{{ output.entryUrl }}')
})
