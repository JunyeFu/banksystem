'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertContextBudget,
  buildActionContextEnvelope,
  buildMidscenePrompt,
  estimateImageTokens,
  estimateTextTokens,
  normalizeMidscenePromptEnvelope
} = require('../../dist/harness/src/context-envelope.js')

function input(overrides = {}) {
  return {
    contextLevel: 'CTX-L1',
    tokenizerId: 'mimo-tokenizer-v1',
    imageTokenEstimate: 1024,
    workerId: 'worker-coverage',
    slotId: 'slot-coverage-0001',
    leaseExpiresAt: '2026-08-12T10:00:00.000Z',
    currentAction: {
      actionType: 'LOCATE',
      prompt: '定位当前客户姓名',
      targetRef: 'HEADER_DISPLAY_NAME',
      valueRef: null,
      riskLevel: 'LOW',
      executionMode: 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE'
    },
    previousActionSummary: { ordinal: 1, actionType: 'TAP', summary: '打开资料页' },
    nextActionPreview: { actionType: 'TAP', prompt: '打开详情' },
    recentFacts: { summary: '登录完成', verification: { dom: true, url: true, request: false, business: false } },
    currentPageState: { route: '/portal/home' },
    minimalDependencyCone: { caseId: 'case-coverage', caseVersion: 1, executionProfile: 'GENERIC_WEB', assertionCount: 1 },
    ...overrides
  }
}

test('context envelope enforces level projection and deterministic token estimates', () => {
  assert.equal(estimateImageTokens(513, 513), 4096)
  assert.ok(estimateTextTokens({ value: '衡准' }, 0) > 0)
  const envelope = buildActionContextEnvelope(input())
  assert.equal(envelope.contextLevel, 'CTX-L1')
  assert.equal(envelope.previousActionSummary, null)
  assert.equal(envelope.nextActionPreview, null)
  assert.equal(envelope.minimalDependencyCone, null)
  assert.equal(envelope.pageSignature.source, 'PLAYWRIGHT_VERIFIED')
  assert.equal(envelope.budgetDecision, 'ALLOW')
  assert.match(buildMidscenePrompt(envelope), /HEADER_DISPLAY_NAME/)
})

test('context envelope fails visual invocation closed when its budget is exhausted', () => {
  const envelope = buildActionContextEnvelope(input({ imageTokenEstimate: 20_000 }))
  assert.equal(envelope.budgetDecision, 'PLAYWRIGHT_ONLY')
  assert.equal(envelope.currentAction.executionMode, 'PLAYWRIGHT_ONLY')
  assert.throws(() => buildMidscenePrompt(envelope), error => error?.errorCode === 'VISION_CONTEXT_NOT_AUTHORIZED')
  assert.throws(() => assertContextBudget('VISION_LLM', 12_001), error => error?.errorCode === 'VISION_CONTEXT_BUDGET_EXCEEDED')
})

test('context envelope normalizes only governed display-name targets', () => {
  const header = buildActionContextEnvelope(input())
  assert.match(normalizeMidscenePromptEnvelope(header).currentAction.prompt, /页面右上角用户区/)
  const profile = buildActionContextEnvelope(input({
    currentAction: { ...input().currentAction, targetRef: 'PROFILE_DISPLAY_NAME' },
    currentPageState: null
  }))
  assert.match(normalizeMidscenePromptEnvelope(profile).currentAction.prompt, /个人资料主卡片/)
  assert.equal(profile.pageSignature.source, 'INITIAL_UNKNOWN')
})
