'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { composeInteractionResponse } = require('../../dist/harness/src/i10/interaction-response.js')

function input(overrides = {}) {
  return {
    journeyId: 'journey_12345678-1234-1234-1234-123456789abc',
    version: 1,
    requestIntent: 'CASE_AUTHORING',
    inputType: 'NATURAL_LANGUAGE',
    stage: 'NEEDS_INPUT',
    status: 'NEEDS_INPUT',
    missingFields: ['entryUrl'],
    allowedActions: [],
    nextAction: { type: 'CLARIFY', description: '请补充入口地址。' },
    references: {},
    progress: {},
    recoverable: true,
    updatedAt: '2026-07-23T00:00:00.000Z',
    ...overrides
  }
}

test('needs-input response is concise and has one explicit user exit', () => {
  const response = composeInteractionResponse(input())
  assert.deepEqual(response.modules, ['BRIEF', 'INPUT_REQUEST', 'USER_STEPS'])
  assert.equal(response.confirmation, undefined)
  assert.match(response.renderedMarkdown, /### 请补充/)
  assert.match(response.renderedMarkdown, /被测系统入口地址/)
  assert.doesNotMatch(response.renderedMarkdown, /CASE_AUTHORING|CLARIFY|MCP|JSON/)
})

test('durable result is delivered as files before a choice-only confirmation', () => {
  const response = composeInteractionResponse(input({
    stage: 'READY_FOR_CASE_APPROVAL',
    status: 'AWAITING_USER',
    missingFields: [],
    allowedActions: ['APPROVE_CASE', 'REJECT_CASE'],
    interactionMode: 'CONFIRM_EXACT',
    proposal: {
      proposalId: 'proposal_' + 'a'.repeat(32),
      action: 'APPROVE_CASE',
      summary: '门户登录案例草案已通过确定性校验。',
      effect: '将该精确草案写入衡准并进入作者化。',
      rejectEffect: '返回案例修订，不写入正式案例。',
      version: 1,
      payloadHash: 'b'.repeat(64),
      proceedDecision: 'APPROVE_CASE',
      rejectDecision: 'REJECT_CASE'
    },
    nextAction: { type: 'HUMAN_CONFIRMATION', description: '案例草案已完成并通过格式校验。' },
    artifactCards: [{
      artifactId: 'art_12345678-1234-1234-1234-123456789abc',
      displayName: '案例草案.md',
      purpose: 'CASE_DRAFT_REVIEW',
      format: 'MD',
      mediaType: 'text/markdown',
      byteSize: 128,
      sha256: 'a'.repeat(64),
      href: 'http://127.0.0.1:18788/v1/i10/artifacts/download_example',
      oneTime: true
    }]
  }))
  assert.deepEqual(response.modules, ['BRIEF', 'ARTIFACTS', 'CONFIRMATION'])
  assert.equal(response.confirmation.freeTextAllowed, false)
  assert.deepEqual(response.confirmation.options.map(option => option.label), ['proceed（继续）', 'reject（拒绝）'])
  assert.deepEqual(
    response.confirmation.options.map(option => option.effect),
    ['将该精确草案写入衡准并进入作者化。', '返回案例修订，不写入正式案例。']
  )
  assert.match(response.renderedMarkdown, /下载 案例草案\.md/)
  assert.match(response.renderedMarkdown, /点击 proceed（继续）/)
  assert.match(response.renderedMarkdown, /点击 reject（拒绝）/)
  assert.doesNotMatch(response.renderedMarkdown, /APPROVE_CASE|artifactId|sha256/)
})

test('processing and failure responses expose progress or safe recovery guidance', () => {
  const processing = composeInteractionResponse(input({
    stage: 'PROCESSING_AUTHORING',
    status: 'PROCESSING',
    missingFields: [],
    nextAction: { type: 'WAIT', description: '正在生成候选脚本。' }
  }))
  assert.deepEqual(processing.modules, ['BRIEF', 'PROGRESS', 'USER_STEPS'])
  assert.match(processing.renderedMarkdown, /### 当前进度/)
  assert.match(processing.renderedMarkdown, /无需重复提交/)

  const failed = composeInteractionResponse(input({
    stage: 'FAILED_ACTIONABLE',
    status: 'FAILED',
    missingFields: [],
    nextAction: { type: 'RETRY' },
    error: { message: '附件格式无法安全解析。' }
  }))
  assert.deepEqual(failed.modules, ['WARNING', 'BRIEF', 'USER_STEPS'])
  assert.match(failed.renderedMarkdown, /注意：附件格式无法安全解析/)
  assert.match(failed.renderedMarkdown, /系统不会在信息不完整时继续调用业务工具/)
})
