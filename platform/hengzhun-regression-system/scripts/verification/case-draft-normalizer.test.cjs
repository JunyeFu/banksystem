'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { normalizeFlowiseDraft } = require('../i10-case-draft-normalizer.cjs')

test('Flowise stringified arrays remain complete during deterministic normalization', () => {
  const result = normalizeFlowiseDraft({
    caseTitle: '门户登录',
    objective: '验证登录',
    summary: '登录后核对姓名',
    targetSystem: '复兴银行',
    entryUrl: 'http://127.0.0.1:28884/portal/login',
    preconditions: '["凭据已录入"]',
    actions: '["打开登录页","输入凭据","核对姓名"]',
    expectedOutcomes: '["页面打开","登录成功","姓名一致"]',
    assertions: '["姓名一致"]',
    missingFields: '[]'
  }, 'credential_00000000-0000-4000-8000-000000000001', '入口地址：http://127.0.0.1:28884/portal/login', 'NONE')
  const draft = JSON.parse(result.draftJson)
  assert.equal(result.status, 'READY')
  assert.equal(result.targetSystem, '复兴银行')
  assert.equal(result.entryUrl, 'http://127.0.0.1:28884/portal/login')
  assert.equal(draft.entryUrl, 'http://127.0.0.1:28884/portal/login')
  assert.equal(draft.steps.length, 3)
  assert.equal(draft.actionStepsV2.length, 3)
  assert.deepEqual(draft.missingFields, [])
})

test('authoring navigation and runtime comparison values are not user input gaps', () => {
  const result = normalizeFlowiseDraft({
    caseTitle: '资料一致性',
    objective: '比较姓名头像',
    summary: '跨页面比较',
    targetSystem: '复兴银行',
    entryUrl: 'http://127.0.0.1:28884/portal/login',
    actions: ['登录', '进入个人资料页面', '比较姓名头像'],
    expectedOutcomes: ['登录成功', '资料页打开', '姓名头像一致'],
    assertions: ['姓名头像一致'],
    missingFields: ['个人资料页面的访问方式或预期姓名和头像值']
  }, 'credential_00000000-0000-4000-8000-000000000001', '入口地址：http://127.0.0.1:28884/portal/login', 'NONE')
  assert.equal(result.status, 'READY')
  assert.deepEqual(JSON.parse(result.draftJson).missingFields, [])
})

test('confirmed image facts are projected to strict CaseDraft fields and credential actions use credential references', () => {
  const credentialRef = 'credential_00000000-0000-4000-8000-000000000001'
  const result = normalizeFlowiseDraft({
    caseTitle: '图片辅助登录',
    objective: '验证图片事实进入作者化',
    summary: '图片与自然语言共同形成案例',
    targetSystem: '复兴银行',
    entryUrl: 'http://127.0.0.1:28884/portal/login',
    actions: ['输入凭据并登录', '核对姓名'],
    expectedOutcomes: ['登录成功', '姓名一致'],
    assertions: ['姓名一致'],
    missingFields: ['补充图片', '支持性图片的ingestId', 'imageIngestId', '图片附件引用'],
    multimodalContext: {
      caseFacts: [{
        factId: 'fact_00000000-0000-4000-8000-000000000001',
        field: 'ACTION',
        value: '点击登录按钮',
        provenanceRefs: ['image:1:0123456789abcdef'],
        confidence: 0.95,
        selected: true,
        requiresUserConfirmation: false,
        userDecision: 'CONFIRM'
      }]
    }
  }, credentialRef, '入口地址：http://127.0.0.1:28884/portal/login', 'imageingest_00000000-0000-4000-8000-000000000002')
  const draft = JSON.parse(result.draftJson)
  assert.equal(result.status, 'READY')
  assert.deepEqual(draft.missingFields, [])
  assert.deepEqual(Object.keys(draft.caseFacts[0]).sort(), [
    'confidence', 'factId', 'field', 'provenanceRefs',
    'requiresUserConfirmation', 'selected', 'value'
  ].sort())
  assert.equal(draft.actionStepsV2[0].inputValueSource, 'CREDENTIAL_REF')
  assert.deepEqual(draft.actionStepsV2[0].provenanceRefs, [credentialRef])
})

test('platform-owned image ingest identifiers are never exposed as user input gaps', () => {
  const result = normalizeFlowiseDraft({
    caseTitle: '图片辅助登录',
    objective: '验证登录',
    summary: '使用随消息上传的图片补充事实',
    targetSystem: '复兴银行',
    entryUrl: 'http://127.0.0.1:28884/portal/login',
    actions: ['输入凭据并登录'],
    expectedOutcomes: ['登录成功'],
    assertions: ['页面进入主页'],
    missingFields: ['补充图片的ingestId未提供']
  }, 'credential_00000000-0000-4000-8000-000000000001', '入口地址：http://127.0.0.1:28884/portal/login', 'NONE')
  assert.equal(result.status, 'READY')
  assert.deepEqual(JSON.parse(result.draftJson).missingFields, [])
})

test('model-suggested URL is rejected unless grounded in user text', () => {
  const result = normalizeFlowiseDraft({
    caseTitle: '门户登录',
    objective: '验证登录',
    summary: '登录后核对姓名',
    targetSystem: '复兴银行',
    entryUrl: 'https://fuxingbank.com',
    actions: ['打开登录页', '核对姓名'],
    expectedOutcomes: ['页面打开', '姓名一致'],
    assertions: ['姓名一致'],
    missingFields: []
  }, 'credential_00000000-0000-4000-8000-000000000001', '打开复兴银行门户并验证姓名。', 'NONE')
  const draft = JSON.parse(result.draftJson)
  assert.equal(result.status, 'NEEDS_CLARIFICATION')
  assert.equal(draft.entryUrl, '')
  assert.ok(draft.missingFields.includes('entryUrl'))
})

test('user-supplied URL is accepted and URL plus credential aliases are removed from gaps', () => {
  const url = 'http://127.0.0.1:18082/portal/login'
  const result = normalizeFlowiseDraft({
    caseTitle: '门户登录',
    objective: '验证登录',
    summary: '登录后核对姓名',
    targetSystem: '复兴银行',
    entryUrl: `\n${url}\n`,
    actions: ['打开登录页', '输入账号密码', '核对姓名'],
    expectedOutcomes: ['页面打开', '登录成功', '姓名一致'],
    assertions: ['姓名一致'],
    missingFields: ['账号', '密码', '门户网站URL']
  }, 'credential_00000000-0000-4000-8000-000000000001', `入口地址：${url}`, 'NONE')
  const draft = JSON.parse(result.draftJson)
  assert.equal(result.status, 'READY')
  assert.equal(draft.entryUrl, url)
  assert.deepEqual(draft.missingFields, [])
})

test('URL extraction stops before immediately following Chinese case prose', () => {
  const url = 'http://127.0.0.1:18082/portal/login'
  const result = normalizeFlowiseDraft({
    caseTitle: '门户登录', objective: '验证登录', summary: '登录后核对姓名', targetSystem: '复兴银行',
    entryUrl: '', actions: ['登录'], expectedOutcomes: ['登录成功'], assertions: ['登录成功'], missingFields: []
  }, 'credential_00000000-0000-4000-8000-000000000001', `${url}输入账号密码登录后验证姓名`, 'NONE')
  assert.equal(JSON.parse(result.draftJson).entryUrl, url)
  assert.equal(result.status, 'READY')
})

test('a final page-observation outcome becomes an explicit validation step when the controller omitted it', () => {
  const result = normalizeFlowiseDraft({
    caseTitle: '消息页面验证', objective: '验证未读消息摘要', summary: '登录后打开消息页面',
    targetSystem: '复兴银行门户', entryUrl: 'http://127.0.0.1:28884/portal/login',
    actions: ['登录复兴银行门户', '打开消息页面'],
    expectedOutcomes: ['登录成功', '消息列表、未读标识和消息摘要正常显示'],
    assertions: ['消息列表、未读标识和消息摘要正常显示'], missingFields: []
  }, 'credential_00000000-0000-4000-8000-000000000001', '入口地址：http://127.0.0.1:28884/portal/login', 'NONE')
  const draft = JSON.parse(result.draftJson)
  assert.equal(draft.steps.length, 3)
  assert.equal(draft.steps.at(-1).action, '验证：消息列表、未读标识和消息摘要正常显示')
  assert.equal(draft.steps.at(-1).expected, '消息列表、未读标识和消息摘要正常显示')
})

test('abstract transfer goals remain in clarification until explicit non-secret execution inputs exist', () => {
  const credentialRef = 'credential_00000000-0000-4000-8000-000000000001'
  const missing = normalizeFlowiseDraft({
    caseTitle: '演示转账', objective: '验证转账确认流程', summary: '创建一笔演示转账并确认页面跳转',
    targetSystem: '复兴银行门户', entryUrl: 'http://127.0.0.1:18082/portal/login',
    actions: ['登录系统', '创建一笔演示转账并完成首次确认'],
    expectedOutcomes: ['登录成功', '进入验证或单号查询页面'], assertions: ['进入预期流程'], missingFields: []
  }, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login', 'NONE')
  const missingDraft = JSON.parse(missing.draftJson)
  assert.equal(missing.status, 'NEEDS_CLARIFICATION')
  assert.deepEqual(missingDraft.missingFields.sort(), [
    'businessActionDetails',
    'businessInput.amount',
    'businessInput.currency',
    'businessInput.payeeRef',
    'businessInput.payerAccountId',
    'businessInput.purpose'
  ].sort())

  const ready = normalizeFlowiseDraft({
    caseTitle: '演示转账', objective: '验证转账确认流程', summary: '创建一笔演示转账并确认页面跳转',
    targetSystem: '复兴银行门户', entryUrl: 'http://127.0.0.1:18082/portal/login',
    actions: ['登录系统', '点击转账入口并新建转账', '填写转账金额为 1.00', '填写备注为“自动化回归测试”', '提交并完成首次确认'],
    expectedOutcomes: ['登录成功', '新建转账页打开', '金额已填写', '备注已填写', '进入验证或单号查询页面'],
    assertions: ['进入预期流程'],
    businessInputs: {
      schemaVersion: 'hengzhun-i10-typed-business-inputs-v2',
      values: { payerAccountId:'3', payeeRef: '11111111-1111-4111-8111-111111111111', amount: '1.00', currency: 'CNY', purpose: '自动化回归测试' },
      source: 'USER_CONFIRMED'
    },
    missingFields: []
  }, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login', 'NONE')
  const readyDraft = JSON.parse(ready.draftJson)
  assert.equal(ready.status, 'READY')
  assert.equal(readyDraft.actionStepsV2[2].inputValue, '1.00')
  assert.equal(readyDraft.actionStepsV2[2].inputValueSource, 'USER_TEXT')
  assert.equal(readyDraft.actionStepsV2[3].inputValue, '自动化回归测试')
  assert.equal(readyDraft.actionStepsV2[3].inputValueSource, 'USER_TEXT')
  assert.deepEqual(readyDraft.businessInputs, {
    schemaVersion: 'hengzhun-i10-typed-business-inputs-v2',
    values: { payerAccountId:'3', payeeRef: '11111111-1111-4111-8111-111111111111', amount: '1.00', currency: 'CNY', purpose: '自动化回归测试' },
    source: 'USER_CONFIRMED'
  })
})

test('transfer prose never replaces the typed business input contract', () => {
  const credentialRef = 'credential_00000000-0000-4000-8000-000000000001'
  const result = normalizeFlowiseDraft({
    caseTitle: '转账回归', objective: '验证转账流程', summary: '转账并确认',
    targetSystem: '演示门户', entryUrl: 'http://127.0.0.1:18082/portal/login',
    actions: ['登录系统', '进入转账页面', '填写收款人、金额1.00、用途并提交首次确认'],
    expectedOutcomes: ['登录成功', '页面已打开', '进入验证或查询流程'],
    assertions: ['进入预期流程'],
    businessInputs: {
      schemaVersion: 'hengzhun-i10-typed-business-inputs-v2',
      values: { payerAccountId:'3', payeeRef: '22222222-2222-4222-8222-222222222222', amount: '1.00', currency: 'cny', purpose: '自动化回归测试' },
      source: 'IMPORT_CONFIRMED'
    },
    missingFields: []
  }, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login；填写金额为 1.00；填写用途为“自动化回归测试”；提交后完成首次确认。', 'NONE')
  const draft = JSON.parse(result.draftJson)
  assert.equal(result.status, 'READY')
  assert.ok(draft.steps.some(step => step.action === '填写转账金额为 1.00'))
  assert.ok(draft.steps.some(step => step.action === '填写转账用途为 自动化回归测试'))
  assert.equal(draft.businessInputs.values.currency, 'CNY')
  assert.equal(draft.businessInputs.values.payeeRef, '22222222-2222-4222-8222-222222222222')
})

test('money normalization does not truncate account IDs, coerce numbers or upgrade old versions', () => {
  const values={payerAccountId:'3',payeeRef:'11111111-1111-4111-8111-111111111111',amount:'1.00',currency:'CNY',purpose:'回归'}
  for(const [change,version,missing] of [
    [{payerAccountId:'12345678901234567890'},'hengzhun-i10-typed-business-inputs-v2','payerAccountId'],
    [{payerAccountId:3},'hengzhun-i10-typed-business-inputs-v2','payerAccountId'],
    [{amount:1},'hengzhun-i10-typed-business-inputs-v2','amount'],
    [{},'hengzhun-i10-typed-business-inputs-v1','schemaVersion'],
  ]) {
    const result=normalizeFlowiseDraft({caseTitle:'转账',objective:'完成转账',summary:'核验转账',targetSystem:'银行',
      entryUrl:'http://127.0.0.1:18082/portal/login',actions:['登录系统','填写转账并提交'],
      expectedOutcomes:['登录成功','转账完成'],assertions:['余额正确'],missingFields:[],
      businessInputs:{schemaVersion:version,values:{...values,...change},source:'USER_CONFIRMED'}
    },'credential_00000000-0000-4000-8000-000000000001','入口地址：http://127.0.0.1:18082/portal/login','NONE')
    const draft=JSON.parse(result.draftJson)
    assert.equal(result.status,'NEEDS_CLARIFICATION')
    assert.ok(draft.missingFields.includes(`businessInput.${missing}`))
    assert.equal(draft.businessInputs.schemaVersion,version)
    if(typeof change.payerAccountId==='string')assert.equal(draft.businessInputs.values.payerAccountId,change.payerAccountId)
  }
})

test('partial model delta preserves the previous valid URL, steps and assertions', () => {
  const credentialRef = 'credential_00000000-0000-4000-8000-000000000001'
  const previous = JSON.parse(normalizeFlowiseDraft({
    caseTitle: '门户登录资料一致性',
    objective: '验证登录后姓名头像一致',
    summary: '登录并进入个人资料',
    targetSystem: '复兴银行门户',
    entryUrl: 'http://127.0.0.1:18082/portal/login',
    actions: ['打开登录页', '输入凭据并登录', '进入个人资料', '比较姓名头像'],
    expectedOutcomes: ['显示登录页', '登录成功', '资料页打开', '姓名头像一致'],
    assertions: ['姓名头像一致'],
    missingFields: []
  }, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login', 'NONE').draftJson)
  const result = normalizeFlowiseDraft({
    summary: '用户补充：从右上角头像进入个人资料',
    missingFields: [],
    semanticVerdict: 'COMPLETE',
    satisfiedRequirementIds: ['ENTRY_POINT', 'ACTION_SEQUENCE'],
    unresolvedRequirements: [],
    semanticConfidence: 0.96
  }, credentialRef, '入口地址：http://127.0.0.1:18082/portal/login；从右上角头像进入个人资料', 'NONE', previous)
  const draft = JSON.parse(result.draftJson)
  const semantic = JSON.parse(result.semanticAssessmentJson)
  assert.equal(draft.entryUrl, 'http://127.0.0.1:18082/portal/login')
  assert.equal(draft.steps.length, 4)
  assert.deepEqual(draft.assertions, ['姓名头像一致'])
  assert.equal(semantic.verdict, 'COMPLETE')
  assert.deepEqual(semantic.unresolvedRequirements, [])
})
