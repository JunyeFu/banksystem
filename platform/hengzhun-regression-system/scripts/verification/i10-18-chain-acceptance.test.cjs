'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')
const acceptanceLedger = require('../i10-acceptance-ledger-v3.cjs')
const {
  semanticEquivalent,
  semanticProjection,
  comparisonProjection,
  fileBodies,
  pairStatus,
  recordKey,
  acceptanceNaturalLanguage,
  acceptanceCheckpointDisposition,
  acceptanceCaseDefinition,
  recoveryChatId,
  recoverableCrossSessionStateLoss,
  recoverySessionId,
  recoveryResumeReference,
  recoveryTranscriptItems,
  journeyBoundCaseReference,
  safeExistingRunDirectory,
  normalizeCredentialLoginGranularity,
  transcriptHasSuccessfulTerminalEvidence,
  restartSafeFailedLowRiskExecution,
  candidateActionTrace,
  retryDispositionForFailure
} = require('../i10-18-chain-acceptance-live.cjs')
const { currentReleaseIdentity } = require('../i10-release-identity.cjs')
const { initialCaseSupplement } = require('../i10-stage8-live.cjs')

function currentIdentity() {
  return currentReleaseIdentity({ requireDeployed: false })
}

function draft(overrides = {}) {
  return semanticProjection({
    targetSystem: '复兴银行门户',
    entryUrl: 'http://127.0.0.1:28887/portal/login',
    objective: '验证登录后主页和个人资料页的姓名和头像一致',
    actions: ['使用已保存安全凭据登录', '进入个人资料页面', '确认姓名和头像一致'],
    expectedOutcomes: ['成功登录至首页', '成功进入个人资料页面', '姓名和头像一致'],
    assertions: ['姓名一致', '头像一致'],
    ...overrides
  })
}

test('I10 acceptance starts a new run only for a reconciled no-side-effect checkpoint', () => {
  const releaseIdentity = currentIdentity()
  const checkpoint = overrides => ({
    releaseIdentity,
    stage: 'FAILED_RECOVERABLE',
    runDirectory: '.data/evidence/failed-run',
    references: {},
    ...overrides
  })
  const ledger = {
    checkpoints: {
      'M3:TEXT_WITH_IMAGE:1': checkpoint({
        references: { retryDisposition: 'NO_SIDE_EFFECT_CONFIRMED', reason: 'JOURNEY_INERT_NO_SIDE_EFFECT' }
      })
    }
  }
  assert.deepEqual(
    acceptanceCheckpointDisposition({ ledger, caseId: 'M3', variant: 'TEXT_WITH_IMAGE', attempt: 1, releaseIdentity }),
    {
      action: 'START_NEW',
      runDirectory: '.data/evidence/failed-run',
      reason: 'JOURNEY_INERT_NO_SIDE_EFFECT'
    }
  )
  ledger.checkpoints['M3:TEXT_WITH_IMAGE:1'] = checkpoint({
    references: { retryDisposition: 'RECOVER_IN_PLACE_REQUIRED' }
  })
  assert.equal(
    acceptanceCheckpointDisposition({ ledger, caseId: 'M3', variant: 'TEXT_WITH_IMAGE', attempt: 1, releaseIdentity }).action,
    'RECOVER_IN_PLACE'
  )
})

test('I10 acceptance allows equivalent L1 controller wording across OCR variants', () => {
  const text = draft()
  const image = draft({
    objective: '验证登录后个人资料页的姓名和头像与主页一致',
    actions: ['使用已保存安全凭据登录', '进入个人资料页面', '验证主页与个人资料页的姓名和头像一致'],
    expectedOutcomes: ['成功登录复兴银行门户', '成功进入个人资料页面', '姓名和头像一致']
  })
  assert.equal(semanticEquivalent('L1', text, image).status, 'SEMANTIC_MATCH')
})

test('I10 acceptance aligns only consecutive leading credential-login granularity', () => {
  const split = {
    actions: ['输入用户名', '输入密码并登录', '进入个人资料'],
    expectedOutcomes: ['用户名已输入', '登录成功', '个人资料显示']
  }
  assert.equal(normalizeCredentialLoginGranularity(split).actions.length, 2)
  const middle = {
    actions: ['进入首页', '输入密码', '进入个人资料'],
    expectedOutcomes: ['首页显示', '密码已输入', '个人资料显示']
  }
  assert.equal(normalizeCredentialLoginGranularity(middle).actions.length, 3)
  const loginPageThenCredential = {
    actions: ['打开复兴银行门户登录页', '使用已保存安全凭据登录', '进入个人资料'],
    expectedOutcomes: ['登录页成功加载', '成功登录门户', '个人资料显示']
  }
  assert.equal(normalizeCredentialLoginGranularity(loginPageThenCredential).actions.length, 2)
  const loginPageWithoutCredential = {
    actions: ['打开复兴银行门户登录页', '进入个人资料'],
    expectedOutcomes: ['登录页成功加载', '个人资料显示']
  }
  assert.equal(normalizeCredentialLoginGranularity(loginPageWithoutCredential).actions.length, 2)
})

test('I10 acceptance treats the exact registered adapter suffix as a target-system annotation only', () => {
  const transfer = targetSystem => semanticProjection({
    targetSystem,
    entryUrl: 'http://127.0.0.1:28887/portal/login',
    objective: '验证转账首次确认后进入验证或单号查询流程',
    actions: ['使用已保存安全凭据登录', '提交转账并完成首次确认'],
    expectedOutcomes: ['登录成功', '进入验证或单号查询流程'],
    assertions: ['进入验证或单号查询流程']
  })
  assert.equal(semanticEquivalent('H1', transfer('复兴银行门户'), transfer('复兴银行门户（fuxing-bank-demo）')).status, 'SEMANTIC_MATCH')
  assert.equal(semanticEquivalent('H1', transfer('复兴银行门户'), transfer('其他银行门户（fuxing-bank-demo）')).reason, 'TARGET_SYSTEM_CHANGED')
})

test('I10 image-chain supplement keeps M3 document intent in natural language, not the Harness top-level contract', () => {
  const supplement = initialCaseSupplement({
    caseDefinition: {
      targetSystem: '复兴银行门户',
      documentName: '账户对账单'
    },
    sourceDescription: '打开文档页面并查看账户对账单。',
    scenario: {
      credentialRef: 'credential_11111111-1111-4111-8111-111111111111',
      portalUrl: 'http://127.0.0.1:28884'
    }
  })
  assert.deepEqual(Object.keys(supplement).sort(), [
    'credentialRef', 'entryUrl', 'inputType', 'naturalLanguage', 'targetSystem'
  ])
  assert.match(supplement.naturalLanguage, /账户对账单/)
})

test('I10 recovery returns an initial-case contract failure to the confirmed image reference', () => {
  const imageRef = 'imageingest_11111111-1111-4111-8111-111111111111'
  const journeyRef = 'journey_22222222-2222-4222-8222-222222222222'
  assert.equal(
    recoveryResumeReference(`${imageRef}\n${journeyRef}\nI10_INITIAL_CASE_INPUT_FIELDS_INVALID`),
    imageRef
  )
  assert.equal(recoveryResumeReference(`${imageRef}\n${journeyRef}`), journeyRef)
})

test('I10 recovery does not mistake a failed Flowise reply for successful terminal evidence', () => {
  assert.equal(transcriptHasSuccessfulTerminalEvidence([
    { text: 'I10_ACCEPTANCE_RUN_PASSED', runId: 'run_11111111-1111-4111-8111-111111111111' }
  ]), true)
  assert.equal(transcriptHasSuccessfulTerminalEvidence([
    { status: 'FAILED', errorCode: 'I8_CANDIDATE_STEP_TIMEOUT', runId: 'run_11111111-1111-4111-8111-111111111111' }
  ]), false)
})

test('I10 recovery consumes only numbered Flowise transcript artifacts', () => {
  const items = [
    { name: 'L2-15-cross-session-tool-continuation.json', value: { status: 'FAILED' } },
    { name: 'timing-ledger.json', value: { runId: 'run_11111111-1111-4111-8111-111111111111' } },
    { name: 'run-result.json', value: { status: 'FAILED' } }
  ]
  assert.deepEqual(recoveryTranscriptItems(items), [items[0]])
})

test('I10 recovery accepts the ledger run-directory as well as its basename', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-run-ref-'))
  const allowed = path.join(workspace, '.data', 'evidence', 'runs')
  const directory = path.join(allowed, 'record-l1-text_only-test')
  fs.mkdirSync(directory, { recursive: true })
  try {
    assert.equal(safeExistingRunDirectory(path.basename(directory), { allowedRoot: allowed, workspaceRoot: workspace }), fs.realpathSync(directory))
    const relative = path.relative(workspace, directory)
    assert.equal(safeExistingRunDirectory(relative, { allowedRoot: allowed, workspaceRoot: workspace }), fs.realpathSync(directory))
    assert.throws(() => safeExistingRunDirectory(workspace, { allowedRoot: allowed, workspaceRoot: workspace }), /I10_ACCEPTANCE_RECOVERY_RUN_ID_INVALID/)
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

test('I10 recovery binds the case only from the exact Journey row', () => {
  assert.equal(journeyBoundCaseReference({ references_json: JSON.stringify({
    caseId: 'case_11111111-1111-4111-8111-111111111111'
  }) }), 'case_11111111-1111-4111-8111-111111111111')
  assert.equal(journeyBoundCaseReference({ references_json: '{"caseId":"case_from_chat"}' }), null)
})

test('I10 recovery admits only exact failed low-risk executions with no schedule to restart', () => {
  const base = {
    caseId: 'L2', journeyStatus: 'FAILED', taskStatus: 'FAILED', runStatus: 'FAILED',
    scheduleCount: 0, errorCode: 'I8_CANDIDATE_STEP_TIMEOUT'
  }
  assert.equal(restartSafeFailedLowRiskExecution(base), true)
  assert.equal(restartSafeFailedLowRiskExecution({ ...base, caseId: 'H1' }), false)
  assert.equal(restartSafeFailedLowRiskExecution({ ...base, scheduleCount: 1 }), false)
  assert.equal(restartSafeFailedLowRiskExecution({ ...base, runStatus: 'PASSED' }), false)
  assert.equal(restartSafeFailedLowRiskExecution({ ...base, errorCode: 'I8_UNKNOWN_EXECUTION_FAILURE' }), false)
})

test('I10 confirmed-image recovery isolates legacy Flow state while Journey recovery preserves it', () => {
  const original = { chatId: 'failed-chat', sessionId: '33333333-3333-4333-8333-333333333333' }
  assert.equal(recoveryChatId('imageingest_11111111-1111-4111-8111-111111111111', original), null)
  assert.equal(recoveryChatId('journey_22222222-2222-4222-8222-222222222222', original), 'failed-chat')
  assert.equal(recoverySessionId('imageingest_11111111-1111-4111-8111-111111111111', original), null)
  assert.equal(recoverySessionId('journey_22222222-2222-4222-8222-222222222222', original), original.sessionId)
})

test('I10 recovery marks an empty cross-session case_prepare state as restart-safe only after reconciliation', () => {
  assert.equal(recoverableCrossSessionStateLoss(
    'MCP_PROTOCOL_ERROR:ARG_TYPES={"caseDescription":"string","sessionRef":"string","draftJson":"object","credentialRef":"string","journeyId":"string"}:ARG_CHECKS={"stringLengths":{"caseDescription":0,"credentialRef":0}}'
  ), true)
  assert.equal(recoverableCrossSessionStateLoss(
    'MCP_PROTOCOL_ERROR:ARG_TYPES={"caseDescription":"string","sessionRef":"string"}'
  ), false)
})

test('I10 confirmed-image recovery can submit a complete deterministic CaseDraft in one transition', () => {
  const supplement = initialCaseSupplement({
    caseDefinition: {
      targetSystem: '复兴银行门户',
      draftJson: {
        objective: '查询账户文档。',
        summary: '进入文档页并核对文档。',
        actions: ['进入文档页面'],
        expectedOutcomes: ['文档页面正常显示'],
        assertions: ['文档条目存在']
      }
    },
    sourceDescription: '查询账户对账单。',
    scenario: {
      credentialRef: 'credential_11111111-1111-4111-8111-111111111111',
      portalUrl: 'http://127.0.0.1:28884'
    }
  })
  assert.equal(supplement.draftJson.entryUrl, 'http://127.0.0.1:28884/portal/login')
  assert.equal(supplement.draftJson.targetSystem, '复兴银行门户')
  assert.deepEqual(supplement.draftJson.missingFields, [])
  assert.equal(supplement.draftJson.actions.length, supplement.draftJson.expectedOutcomes.length)
})

test('I10 M3 first-run and recovery calls share the same complete acceptance case definition', () => {
  const definition = acceptanceCaseDefinition('M3', '查询账户对账单。')
  assert.equal(definition.documentName, '账户对账单')
  assert.ok(definition.draftJson.objective)
  assert.ok(definition.draftJson.summary)
  assert.ok(definition.draftJson.assertions.length)
  assert.equal(definition.draftJson.schemaVersion, 'hengzhun-i10-case-draft-v1')
  assert.equal(definition.draftJson.steps.length, 4)
  assert.ok(definition.draftJson.steps.every(step => step.action && step.expected))
})


test('I10 acceptance accepts an OCR-added terminal read-only confirmation that restates the same outcome', () => {
  const text = draft({
    objective: '验证登录后账户页面信息正常',
    actions: ['登录复兴银行门户', '打开账户页面'],
    expectedOutcomes: ['成功登录门户', '账户卡片、余额和账户状态正常显示']
  })
  const image = draft({
    objective: '验证账户卡片、余额和账户状态正常显示',
    actions: ['登录复兴银行门户', '打开账户页面', '确认账户卡片、余额和账户状态正常显示'],
    expectedOutcomes: ['登录成功', '成功打开账户页面', '账户卡片、余额和账户状态均正常显示']
  })
  assert.equal(semanticEquivalent('L2', text, image).status, 'SEMANTIC_MATCH')
})

test('I10 acceptance treats an anaphoric read-only terminal outcome as the same L2 evidence', () => {
  const text = draft({
    objective: '验证账户卡片、余额和账户状态正常显示',
    actions: ['登录复兴银行门户', '打开账户页面', '确认账户卡片、余额和账户状态正常显示'],
    expectedOutcomes: ['成功登录门户', '成功打开账户页面', '账户卡片、余额和账户状态显示正常']
  })
  const image = draft({
    objective: '验证账户卡片、余额和账户状态正常显示',
    actions: ['登录复兴银行门户', '打开账户页面', '确认账户卡片、余额和账户状态正常显示'],
    expectedOutcomes: ['登录成功进入门户', '账户页面成功显示', '上述信息均正常展示']
  })
  assert.equal(semanticEquivalent('L2', text, image).status, 'SEMANTIC_MATCH')
})

test('I10 acceptance accepts a detailed terminal list inspection when its original outcome is generic', () => {
  const text = draft({
    objective: '验证收款人列表显示正确',
    actions: ['登录复兴银行门户', '进入收款人页面', '查看收款人列表', '确认姓名、账户掩码和状态展示正确'],
    expectedOutcomes: ['成功登录系统', '收款人页面加载', '列表正常显示', '数据展示正确']
  })
  const image = draft({
    objective: '确认收款人列表中姓名、账户掩码和状态展示正确',
    actions: ['登录复兴银行门户', '进入收款人页面', '查看收款人列表', '确认姓名、账户掩码和状态展示正确'],
    expectedOutcomes: ['成功登录', '进入收款人页面', '显示收款人列表', '姓名、账户掩码和状态展示正确']
  })
  assert.equal(semanticEquivalent('M2', text, image).status, 'SEMANTIC_MATCH')
})

test('I10 acceptance does not collapse a terminal U-key confirmation', () => {
  const semantic = draft({
    actions: ['提交转账', '确认U盾验证'],
    expectedOutcomes: ['进入验证页', 'U盾验证成功']
  })
  assert.equal(comparisonProjection(semantic).actions.length, 2)
  assert.equal(semanticEquivalent('H2', semantic, semantic).status, 'SEMANTIC_MATCH')
})

test('I10 acceptance does not collapse a terminal transfer submission as a read-only confirmation', () => {
  const text = draft({
    actions: ['填写转账信息', '提交转账'],
    expectedOutcomes: ['信息已填写', '转账提交成功']
  })
  const image = draft({
    actions: ['填写转账信息'],
    expectedOutcomes: ['信息已填写']
  })
  assert.equal(semanticEquivalent('H1', text, image).reason, 'MUTATION_STEP_CARDINALITY_CHANGED')
})

test('I10 acceptance treats split and combined M3 document assertions as the same read-only evidence', () => {
  const split = draft({
    objective: '验证文档查询功能正确性',
    actions: ['登录门户','进入文档页面','查询指定文档','确认标题正确','确认日期正确','确认下载入口正确'],
    expectedOutcomes: ['登录成功','文档页显示','查询结果返回','标题一致','日期一致','下载入口可见'],
    assertions: ['标题、日期和下载入口正确']
  })
  const combined = draft({
    objective: '验证文档查询及标题日期下载入口',
    actions: ['登录门户','进入文档页面','查询一份文档','确认文档标题、日期和下载入口'],
    expectedOutcomes: ['登录成功','文档页显示','查询结果返回','标题、日期和下载入口正确'],
    assertions: ['标题、日期和下载入口正确']
  })
  assert.equal(semanticEquivalent('M3', split, combined).status, 'SEMANTIC_MATCH')
  assert.equal(semanticEquivalent('M3', split, {...combined, actions:[...combined.actions,'进入其他页面'], expectedOutcomes:[...combined.expectedOutcomes,'其他页面显示']}).reason, 'ACTION_STEP_CARDINALITY_CHANGED')
})

test('I10 acceptance aligns several consecutive terminal read-only facts with one combined assertion', () => {
  const text = draft({
    objective: '验证账户卡片、余额和账户状态正常显示',
    actions: ['登录复兴银行门户','打开账户页面','验证账户卡片、余额和账户状态正常显示'],
    expectedOutcomes: ['登录成功','账户页面加载成功','账户卡片、余额和账户状态正常显示']
  })
  const image = draft({
    objective: '验证账户卡片、余额和账户状态正常显示',
    actions: ['登录复兴银行门户','打开账户页面','验证账户卡片正常显示','验证余额正常显示','验证账户状态正常显示'],
    expectedOutcomes: ['登录成功','账户页面加载成功','账户卡片可见','余额信息正确','账户状态正确']
  })
  assert.equal(semanticEquivalent('L2',text,image).status,'SEMANTIC_MATCH')
})

test('I10 acceptance rejects an extra non-mutating middle action', () => {
  const text = draft()
  const image = draft({
    actions: ['使用已保存安全凭据登录', '打开系统帮助页面', '进入个人资料页面', '确认姓名和头像一致'],
    expectedOutcomes: ['成功登录至首页', '系统帮助页面已显示', '成功进入个人资料页面', '姓名和头像一致']
  })
  const result = semanticEquivalent('L1', text, image)
  assert.equal(result.status, 'SEMANTIC_MISMATCH')
  assert.equal(result.reason, 'ACTION_STEP_CARDINALITY_CHANGED')
})

test('I10 acceptance permits only the explicit L1 homepage identity observation required by a cross-page comparison', () => {
  const text = draft()
  const image = draft({
    actions: ['使用已保存安全凭据登录', '核对主页姓名和头像', '进入个人资料页面', '确认主页与个人资料页的姓名和头像一致'],
    expectedOutcomes: ['成功登录至首页', '主页姓名和头像正确显示', '成功进入个人资料页面', '姓名和头像一致']
  })
  assert.equal(semanticEquivalent('L1', text, image).status, 'SEMANTIC_MATCH')
  assert.equal(semanticEquivalent('L2', text, image).reason, 'ACTION_STEP_CARDINALITY_CHANGED')
})

test('I10 acceptance normalizes L1 identity observation before folding a duplicate terminal assertion', () => {
  const detailed = draft({
    actions: ['使用已保存的安全凭据登录', '核实主页的姓名和头像', '进入个人资料页面', '核实个人资料页的姓名和头像与主页一致', '验证：个人资料页姓名和头像与主页一致'],
    expectedOutcomes: ['登录成功，进入主页', '主页显示正确的姓名和头像', '成功进入个人资料页面', '个人资料页姓名和头像与主页一致', '个人资料页姓名和头像与主页一致']
  })
  assert.equal(semanticEquivalent('L1', detailed, draft()).status, 'SEMANTIC_MATCH')
  assert.equal(semanticEquivalent('L1', draft(), detailed).status, 'SEMANTIC_MATCH')
})

test('I10 acceptance does not treat a different L1 middle inspection as identity evidence', () => {
  const text = draft()
  const image = draft({
    actions: ['使用已保存安全凭据登录', '核对主页姓名和账户余额', '进入个人资料页面', '确认主页与个人资料页的姓名和头像一致'],
    expectedOutcomes: ['成功登录至首页', '主页姓名和账户余额正确显示', '成功进入个人资料页面', '姓名和头像一致']
  })
  assert.equal(semanticEquivalent('L1', text, image).reason, 'ACTION_STEP_CARDINALITY_CHANGED')
})

test('I10 acceptance rejects changed target URL even when wording is equivalent', () => {
  const result = semanticEquivalent('L1', draft(), draft({ entryUrl: 'https://example.invalid/login' }))
  assert.equal(result.status, 'SEMANTIC_MISMATCH')
  assert.equal(result.reason, 'ENTRY_URL_CHANGED')
})

test('I10 acceptance treats a per-run controlled loopback port as fixture infrastructure', () => {
  const result = semanticEquivalent('L1', draft(), draft({ entryUrl: 'http://127.0.0.1:28960/portal/login' }))
  assert.equal(result.status, 'SEMANTIC_MATCH')
})

test('I10 acceptance pair status uses semantic contract rather than raw hash', () => {
  const identity = currentIdentity()
  const ledger = {
    records: {
      [recordKey('L1', 'TEXT_ONLY')]: { status: 'PASSED', semanticHash: 'a', semantic: draft(), releaseIdentity: identity },
      [recordKey('L1', 'TEXT_WITH_IMAGE')]: { status: 'PASSED', semanticHash: 'b', semantic: draft({ objective: '验证主页和个人资料页姓名头像一致' }), releaseIdentity: identity }
    }
  }
  assert.equal(pairStatus(ledger, 'L1'), 'SEMANTIC_MATCH')
})

test('I10 acceptance pair status rejects mixed release identities', () => {
  const ledger = {
    records: {
      [recordKey('L1', 'TEXT_ONLY')]: { status: 'PASSED', semanticHash: 'a', semantic: draft(), releaseIdentity: currentIdentity() },
      [recordKey('L1', 'TEXT_WITH_IMAGE')]: { status: 'PASSED', semanticHash: 'b', semantic: draft(), releaseIdentity: { schemaVersion: 'hengzhun-i10-release-identity-v1', identityHash: 'f'.repeat(64) } }
    }
  }
  assert.equal(pairStatus(ledger, 'L1'), 'PENDING_PAIR')
})

test('I10 acceptance pair status evaluates the newest attempt per variant', () => {
  // Regression: the pair gate must look past a pair-incomplete earlier attempt
  // to the newest terminal evidence.  Keys are written literally because a
  // recordKey helper that collapses every attempt to attempt 1 is exactly the
  // defect under test; building fixture keys through it would hide the bug.
  const identity = currentIdentity()
  const base = draft()
  const diverged = draft({
    actions: [...base.actions, '删除临时缓存记录'],
    expectedOutcomes: [...base.expectedOutcomes, '临时缓存记录已删除']
  })
  const ledger = {
    records: {
      'L1:TEXT_ONLY:1': { status: 'PASSED', semanticHash: 'a', semantic: base, releaseIdentity: identity },
      'L1:TEXT_WITH_IMAGE:1': { status: 'PASSED', semanticHash: 'b', semantic: diverged, releaseIdentity: identity },
      'L1:TEXT_WITH_IMAGE:2': { status: 'PASSED', semanticHash: 'c', semantic: draft(), releaseIdentity: identity }
    }
  }
  assert.equal(pairStatus(ledger, 'L1'), 'SEMANTIC_MATCH')
})

test('I10 acceptance ledger sweeps only checkpoints contradicted by a current PASSED record', () => {
  const identity = currentIdentity()
  const staleIdentity = { schemaVersion: 'hengzhun-i10-release-identity-v1', identityHash: 'e'.repeat(64) }
  const ledger = {
    records: {
      'L1:TEXT_ONLY:1': { status: 'PASSED', releaseIdentity: identity },
      'L2:TEXT_ONLY:1': { status: 'PASSED', releaseIdentity: staleIdentity }
    },
    checkpoints: {
      'L1:TEXT_ONLY:1': { stage: 'FAILED_RECOVERABLE' },
      'L2:TEXT_ONLY:1': { stage: 'FAILED_RECOVERABLE' },
      'L3:TEXT_ONLY:1': { stage: 'FAILED_RECOVERABLE' }
    }
  }
  assert.deepEqual(acceptanceLedger.contradictionCheckpointKeys(ledger, identity), ['L1:TEXT_ONLY:1'])
})

test('I10 acceptance ledger counts only the newest PASSED attempt per fixed case and variant', () => {
  const identity = currentIdentity()
  const record = (caseId, variant, attempt, recordId) => ({
    caseId, variant, attempt, recordId, status: 'PASSED', releaseIdentity: identity
  })
  const ledger = {
    records: {
      'L1:TEXT_ONLY:1': record('L1', 'TEXT_ONLY', 1, 'old-l1-text'),
      'L1:TEXT_ONLY:2': record('L1', 'TEXT_ONLY', 2, 'new-l1-text'),
      'L1:TEXT_WITH_IMAGE:1': record('L1', 'TEXT_WITH_IMAGE', 1, 'l1-image'),
      'X1:TEXT_ONLY:1': record('X1', 'TEXT_ONLY', 1, 'unknown-case'),
      'L1:UNKNOWN:1': record('L1', 'UNKNOWN', 1, 'unknown-variant')
    }
  }
  const current = acceptanceLedger.currentRecords(ledger, identity)
  assert.deepEqual(current.map(item => item.recordId), ['new-l1-text', 'l1-image'])
})

test('I10 candidate trace fallback binds the candidate preparation through explicit joins', () => {
  const database = new Database(':memory:')
  try {
    database.exec(`
      CREATE TABLE i8_executable_plans (
        executable_plan_id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        case_id TEXT NOT NULL,
        preparation_id TEXT NOT NULL
      );
      CREATE TABLE i8_script_candidates (
        candidate_id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        executable_plan_id TEXT NOT NULL
      );
      CREATE TABLE i10_action_traces (
        namespace TEXT NOT NULL,
        case_id TEXT NOT NULL,
        preparation_id TEXT NOT NULL,
        trace_hash TEXT NOT NULL,
        playwright_fact_hash TEXT NOT NULL,
        consumer_model TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO i8_executable_plans VALUES
        ('plan-a', 'hengzhun-local', 'case-shared', 'prep-a'),
        ('plan-b', 'hengzhun-local', 'case-shared', 'prep-b');
      INSERT INTO i8_script_candidates VALUES
        ('candidate-a', 'hengzhun-local', 'plan-a'),
        ('candidate-b', 'hengzhun-local', 'plan-b');
      INSERT INTO i10_action_traces VALUES
        ('hengzhun-local', 'case-shared', 'prep-a', '${'a'.repeat(64)}', '${'1'.repeat(64)}', 'model-a', 'PLAYWRIGHT_VERIFIED', '2026-08-12T12:00:00.000Z'),
        ('hengzhun-local', 'case-shared', 'prep-b', '${'b'.repeat(64)}', '${'2'.repeat(64)}', 'model-b', 'PLAYWRIGHT_VERIFIED', '2026-08-12T11:00:00.000Z');
    `)
    const trace = candidateActionTrace(database, 'candidate-b', 'hengzhun-local')
    assert.equal(trace.trace_hash, 'b'.repeat(64))
    assert.equal(trace.consumer_model, 'model-b')
  } finally {
    database.close()
  }
})

test('I10 prediction error text never proves that a failed run had no side effect', () => {
  const error = Object.assign(new Error('I10_STAGE8_FLOWISE_PREDICTION_FAILED'), {
    code: 'I10_STAGE8_FLOWISE_PREDICTION_FAILED',
    details: { responseError: 'I10_MCP_TOOL_INPUT_SCHEMA_FAILED: claimed before handler' }
  })
  assert.equal(retryDispositionForFailure(error), 'RECOVER_IN_PLACE_REQUIRED')
})

test('I10 recovery excludes a partial acceptance record from the Flowise transcript', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-recovery-'))
  try {
    fs.writeFileSync(path.join(directory, 'M1-01-terminal.json'), JSON.stringify({ text: '回归执行已结束' }))
    fs.writeFileSync(path.join(directory, 'acceptance-record.json'), JSON.stringify({ status: 'PASSED' }))
    const transcript = fileBodies(directory)
    assert.equal(transcript.length, 1)
    assert.equal(transcript[0].value.text, '回归执行已结束')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('high-risk controlled acceptance input explicitly selects the adapter and supplies non-secret transfer data', () => {
  const input = acceptanceNaturalLanguage({ naturalLanguage: '创建演示转账' }, 'H2')
  assert.match(input, /明确选择复兴银行演示适配器\s+fuxing-bank-demo/)
  assert.match(input, /金额为\s*1\.00/)
  assert.match(input, /用途为\s*自动化回归测试/)
  assert.match(input, /U盾验证页/)
})

test('high-risk acceptance runs explicitly arm the controlled U-key path before authoring', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'i10-18-chain-acceptance-live.cjs'), 'utf8')
  assert.match(source, /caseId\.startsWith\('H'\).*stage8\.setFailureMode\(scenario\.failureControlUrl, 'verification'\)/)
})
