'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  applyCrossSourceConflictGate,
  detectCrossSourceConflicts
} = require('../../dist/harness/src/i10/cross-source-conflicts.js')

const draft = {
  schemaVersion: 'hengzhun-i10-case-draft-v1',
  title: '复兴银行客户资料回归',
  objective: '打开客户资料页面并核对姓名',
  summary: '视频显示旧页面名称为客户资料',
  targetSystem: '复兴银行门户',
  entryUrl: 'http://127.0.0.1:18082/portal/login',
  preconditions: [],
  steps: [{ action: '进入客户资料页面', expected: '客户资料页面打开' }],
  assertions: ['客户资料页面可见'],
  caseFacts: [],
  actionStepsV2: [],
  verificationRequirements: [],
  source: {
    inputType: 'VIDEO',
    sourceRef: 'video-fixture-f012',
    sourceHash: '1'.repeat(64),
    provenanceSummary: 'F012 video fixture'
  },
  confidence: 0.9,
  missingFields: [],
  confirmationStatus: 'DRAFT',
  authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',
  executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY',
  evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
}

const imageFact = {
  factId: 'fact_f012_image_page_label',
  field: 'OTHER',
  value: '新版页面名称：个人资料',
  provenanceRefs: ['image:1:f012'],
  confidence: 0.94,
  selected: true,
  requiresUserConfirmation: false
}

test('video and image page-label conflict blocks approval and preserves both provenances', () => {
  const conflicts = detectCrossSourceConflicts(draft, [imageFact])
  assert.deepEqual(conflicts.map(item => item.conflictKey), ['PAGE_LABEL'])

  const gated = applyCrossSourceConflictGate(draft, [imageFact])
  assert.equal(gated.confirmationStatus, 'WAITING_USER')
  assert.deepEqual(gated.missingFields, ['crossSourceConflict:PAGE_LABEL'])
  assert.equal(gated.caseFacts.length, 2)
  assert.equal(gated.caseFacts.some(fact => fact.provenanceRefs.includes('image:1:f012')), true)
  assert.equal(gated.caseFacts.some(fact => fact.provenanceRefs.includes('video:video-fixture-f012')), true)
  assert.equal(gated.caseFacts.every(fact => fact.requiresUserConfirmation), true)
})

test('non-conflicting image facts do not create an artificial gate', () => {
  const fact = { ...imageFact, value: '页面名称：客户资料' }
  const gated = applyCrossSourceConflictGate(draft, [fact])
  assert.deepEqual(gated.missingFields, [])
  assert.equal(gated.confirmationStatus, 'DRAFT')
  assert.deepEqual(gated.caseFacts, [fact])
})

test('a corrected draft can retain the original video conflict fact for audit', () => {
  const initiallyGated = applyCrossSourceConflictGate(draft, [imageFact])
  const corrected = {
    ...initiallyGated,
    title: '复兴银行个人资料回归',
    objective: '打开个人资料页面并核对姓名',
    summary: '用户选择图片中的个人资料作为权威页面名称',
    steps: [{ action: '进入个人资料页面', expected: '个人资料页面打开' }],
    assertions: ['个人资料页面可见'],
    missingFields: [],
    confirmationStatus: 'WAITING_USER'
  }
  const retainedVideoFacts = corrected.caseFacts
    .filter(fact => fact.provenanceRefs.some(ref => ref.startsWith('video:')))
    .map(fact => ({ ...fact, requiresUserConfirmation: false }))
  const resolved = applyCrossSourceConflictGate(corrected, [imageFact])
  resolved.caseFacts.push(...retainedVideoFacts.filter(prior => !resolved.caseFacts.some(current => current.factId === prior.factId)))
  assert.deepEqual(resolved.missingFields, [])
  assert.equal(resolved.caseFacts.some(fact => fact.value === '客户资料'), true)
  assert.equal(resolved.caseFacts.some(fact => /个人资料/.test(fact.value)), true)
})

test('a persisted OCR video fact is used as the conflict provenance', () => {
  const videoFact = {
    factId: 'video_fact_f012_page_label',
    field: 'OTHER',
    value: '旧版页面名称：客户资料',
    provenanceRefs: ['video:ingest_f012:frame:1:ocr'],
    confidence: 0.95,
    selected: true,
    requiresUserConfirmation: false
  }
  const neutralDraft = {
    ...draft,
    title: '复兴银行资料页回归',
    objective: '打开资料页并核对姓名',
    summary: '由真实视频观察生成',
    steps: [{ action: '进入资料页', expected: '资料页打开' }],
    assertions: ['资料页可见'],
    caseFacts: [videoFact]
  }
  const conflicts = detectCrossSourceConflicts(neutralDraft, [imageFact])
  assert.equal(conflicts[0].videoProvenanceRef, 'video:ingest_f012:frame:1:ocr')
  const gated = applyCrossSourceConflictGate(neutralDraft, [imageFact])
  assert.equal(gated.caseFacts.some(fact => fact.factId === videoFact.factId), true)
  assert.deepEqual(gated.missingFields, ['crossSourceConflict:PAGE_LABEL'])
})
