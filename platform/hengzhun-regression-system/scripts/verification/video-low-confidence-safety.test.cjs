'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const {
  buildOcrTimelineObservation,
  normalizeControllerDraft
} = require(path.join(root, 'worker/src/i10-video-ingest-runner.cjs'))

test('OCR timeline never promotes inferred video actions above the human-confirmation threshold', () => {
  const observation = buildOcrTimelineObservation({
    text: '复兴银行\n登录\n个人资料',
    confidence: 0.99,
    engine: 'PPU_PADDLE_OCR_V5_ONNX_CPU',
    modelSha256: 'a'.repeat(64),
    recognizedRegionCount: 3
  }, undefined, 1, 0)
  assert.equal(observation.confidence, 0.74)
  assert.equal(observation.requiresUserConfirmation, true)
  assert.equal(observation.confidenceSafetyReason, 'OCR_TIMELINE_CANNOT_PROVE_POINTER_ACTION')
  assert.equal(observation.provider, 'local-onnx-ocr')
  assert.equal(observation.invocation, 'LOCAL')
})

test('OCR timeline describes text changes without claiming a click or pointer observation', () => {
  const observation = buildOcrTimelineObservation({
    text: '复兴银行\n账户概览\n个人资料',
    confidence: 0.91,
    engine: 'PPU_PADDLE_OCR_V5_ONNX_CPU',
    modelSha256: 'a'.repeat(64),
    recognizedRegionCount: 3
  }, { text: '复兴银行\n登录' }, 2, 2000)
  assert.match(observation.visibleAction, /页面文字发生变化/)
  assert.doesNotMatch(observation.visibleAction, /点击|鼠标/)
  assert.match(observation.expectedVisibleResult, /账户概览/)
})

test('controller video facts must retain OCR provenance and remain user-confirmed', () => {
  const claim = { ingestJobId: 'ingest_00000000-0000-0000-0000-000000000001' }
  const normalized = normalizeControllerDraft({
    title: '登录案例',
    objective: '验证登录',
    summary: 'OCR时间线',
    steps: [{ action: '页面显示登录', expected: '出现账户概览' }],
    caseFacts: [{
      field: 'ACTION',
      value: '页面由登录变为账户概览',
      provenanceRefs: [`video:${claim.ingestJobId}:frame:1:ocr`],
      confidence: 0.95,
      selected: true
    }],
    confidence: 0.95
  }, claim, [{}])
  assert.equal(normalized.confidence, 0.74)
  assert.equal(normalized.caseFacts[0].confidence, 0.74)
  assert.equal(normalized.caseFacts[0].requiresUserConfirmation, true)
})
