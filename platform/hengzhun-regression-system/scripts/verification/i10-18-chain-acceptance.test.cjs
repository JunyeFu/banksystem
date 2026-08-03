'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  semanticEquivalent,
  semanticProjection,
  comparisonProjection,
  fileBodies,
  pairStatus,
  recordKey,
  acceptanceNaturalLanguage
} = require('../i10-18-chain-acceptance-live.cjs')
const { currentReleaseIdentity } = require('../i10-release-identity.cjs')

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

test('I10 acceptance allows equivalent L1 controller wording across OCR variants', () => {
  const text = draft()
  const image = draft({
    objective: '验证登录后个人资料页的姓名和头像与主页一致',
    actions: ['使用已保存安全凭据登录', '进入个人资料页面', '验证主页与个人资料页的姓名和头像一致'],
    expectedOutcomes: ['成功登录复兴银行门户', '成功进入个人资料页面', '姓名和头像一致']
  })
  assert.equal(semanticEquivalent('L1', text, image).status, 'SEMANTIC_MATCH')
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
  const { contradictionCheckpointKeys } = require('../i10-acceptance-ledger-v3.cjs')
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
  assert.deepEqual(contradictionCheckpointKeys(ledger, identity), ['L1:TEXT_ONLY:1'])
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
