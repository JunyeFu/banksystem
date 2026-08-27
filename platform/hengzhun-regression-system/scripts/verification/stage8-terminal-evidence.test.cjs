'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const root = path.resolve(__dirname, '..', '..')

const {
  authoringFailedTerminal,
  authoringProcessingPending,
  ingestProcessingPending,
  journeyProcessingPending,
  stopped,
  attachmentIngestTransitionPending,
  attachmentTargetTransitionPending,
  attachmentJourneyTransitionPending,
  isolatedJourneyTransitionPending,
  crossSessionProposalDecisionPending,
  crossSessionToolContinuationPending,
  latestOpaqueId,
  authoritativeJourneyId,
  authoritativeScheduleId,
  findOnDemandInboxItem,
  findScheduledInboxItem,
  findTaskTerminal,
  requireOnDemandTerminalEvidence,
  retryablePredictionStatus,
  predictionRetryDecision,
  safePredictionFailure
} = require('../i10-stage8-live.cjs')

test('cross-session authoring failure is a failed terminal, never a missing schedule', () => {
  assert.equal(authoringFailedTerminal({
    text: '## 作者化已失败',
    agentFlowExecutedData: [{
      nodeId: 'directReplyAgentflow_i10_v7_cross_session_authoring_failed',
      status: 'FINISHED'
    }]
  }), true)
  assert.equal(authoringFailedTerminal({ text: '作者化仍在处理中', agentFlowExecutedData: [] }), false)
})

const taskId = 'task_11111111-1111-4111-8111-111111111111'
const runId = 'run_22222222-2222-4222-8222-222222222222'
const inboxId = 'inbox_33333333-3333-4333-8333-333333333333'
const artifactId = 'art_44444444-4444-4444-8444-444444444444'
const scheduleId = 'schedule_55555555-5555-4555-8555-555555555555'

test('a later direct reply makes an earlier stopped Human Input non-actionable', () => {
  const body = {
    agentFlowExecutedData: [
      { nodeId: 'humanInputAgentflow_i10_v4_image_wait', status: 'STOPPED' },
      { nodeId: 'directReplyAgentflow_i10_v6_image_facts_transition', status: 'SUCCEEDED' }
    ]
  }
  assert.equal(stopped(body), null)
})

test('the latest stopped Human Input remains actionable when no later reply exists', () => {
  const gate = { nodeId: 'humanInputAgentflow_run', status: 'STOPPED' }
  assert.equal(stopped({ agentFlowExecutedData: [gate] }), gate)
})

test('recognizes the isolated journey transition reply as a resumable gate', () => {
  assert.equal(isolatedJourneyTransitionPending({ agentFlowExecutedData: [{
    nodeId: 'directReplyAgentflow_i10_v6_confirmed_image_journey_ready', status: 'SUCCEEDED'
  }] }), true)
})

test('recognizes the cross-session proposal reply as an explicit approval gate', () => {
  assert.equal(crossSessionProposalDecisionPending({ agentFlowExecutedData: [{
    nodeId: 'directReplyAgentflow_i10_v6_cross_session_decision_prompt', status: 'SUCCEEDED'
  }] }), true)
})

test('recognizes a native Flowise MCP write as a durable continuation boundary', () => {
  assert.equal(crossSessionToolContinuationPending({ agentFlowExecutedData: [{
    nodeId: 'toolAgentflow_i10_v6_cross_session_authoring_resume_submit', status: 'FINISHED'
  }] }), true)
  assert.equal(crossSessionToolContinuationPending({ agentFlowExecutedData: [{
    nodeId: 'directReplyAgentflow_result', status: 'SUCCEEDED'
  }] }), false)
})

function successfulTranscript() {
  return [
    {
      content: JSON.stringify({
        taskId,
        runId,
        status: 'SUCCEEDED',
        outcome: 'PASSED',
        resultArtifactId: artifactId
      })
    },
    {
      content: JSON.stringify({
        items: [{
          taskId,
          runId,
          inboxId,
          executionMode: 'ON_DEMAND',
          outcome: 'PASSED',
          artifact: { artifactId }
        }]
      })
    }
  ]
}

test('accepts a Chinese terminal summary when structured task and inbox evidence agree', () => {
  const evidence = requireOnDemandTerminalEvidence(
    successfulTranscript(),
    '回归执行已结束，正式结果和脱敏证据已经写入衡准制品库。'
  )
  assert.deepEqual(evidence, {
    taskId,
    runId,
    inboxId,
    artifactId,
    outcome: 'PASSED',
    executionMode: 'ON_DEMAND'
  })
})

test('prefers the newest Flowise response when cumulative history exceeds the traversal budget', () => {
  const taskId = 'task_11111111-1111-4111-8111-111111111111'
  const runId = 'run_22222222-2222-4222-8222-222222222222'
  const artifactId = 'art_33333333-3333-4333-8333-333333333333'
  const inboxId = 'inbox_44444444-4444-4444-8444-444444444444'
  const transcript = [
    { padding: Array.from({ length: 60_000 }, (_, index) => ({ index })) },
    {
      agentFlowExecutedData: [{
        output: {
          taskId,
          runId,
          status: 'SUCCEEDED',
          outcome: 'PASSED',
          resultArtifactId: artifactId
        }
      }, {
        output: {
          inboxId,
          taskId,
          runId,
          executionMode: 'ON_DEMAND',
          outcome: 'PASSED',
          artifact: { artifactId }
        }
      }]
    }
  ]
  assert.equal(
    requireOnDemandTerminalEvidence(transcript, '回归执行已结束').taskId,
    taskId
  )
})

test('does not accept PASSED text without structured terminal evidence', () => {
  assert.throws(
    () => requireOnDemandTerminalEvidence([], 'PASSED'),
    error => error.code === 'I10_STAGE8_ON_DEMAND_TASK_TERMINAL_MISSING'
  )
})

test('rejects an inbox item that belongs to another task', () => {
  const transcript = successfulTranscript()
  const parsed = JSON.parse(transcript[1].content)
  parsed.items[0].taskId = 'task_55555555-5555-4555-8555-555555555555'
  transcript[1].content = JSON.stringify(parsed)
  assert.throws(
    () => requireOnDemandTerminalEvidence(transcript, '回归执行已结束。'),
    error => error.code === 'I10_STAGE8_ON_DEMAND_INBOX_TERMINAL_MISSING'
  )
})

test('rejects task and inbox run identifiers that disagree', () => {
  const transcript = successfulTranscript()
  const parsed = JSON.parse(transcript[1].content)
  parsed.items[0].runId = 'run_66666666-6666-4666-8666-666666666666'
  transcript[1].content = JSON.stringify(parsed)
  assert.throws(
    () => requireOnDemandTerminalEvidence(transcript, '回归执行已结束。'),
    error => error.code === 'I10_STAGE8_ON_DEMAND_RUN_ID_CONFLICT'
  )
})

test('requires a user-visible terminal summary even when internal evidence passed', () => {
  assert.throws(
    () => requireOnDemandTerminalEvidence(successfulTranscript(), '正在处理，请稍候。'),
    error => error.code === 'I10_STAGE8_USER_TERMINAL_SUMMARY_MISSING'
  )
})

test('finders parse JSON strings nested in Flowise output', () => {
  const transcript = successfulTranscript()
  assert.equal(findTaskTerminal(transcript).taskId, taskId)
  assert.equal(findOnDemandInboxItem(transcript, taskId).inboxId, inboxId)
})

test('scheduled inbox evidence requires schedule, task, run and artifact references', () => {
  const valid = [{
    content: JSON.stringify({
      items: [{
        scheduleId,
        scheduleType: 'ONE_TIME',
        taskId,
        runId,
        inboxId,
        outcome: 'PASSED',
        artifact: { artifactId }
      }]
    })
  }]
  assert.equal(findScheduledInboxItem(valid, scheduleId).artifact.artifactId, artifactId)
  const missingRun = structuredClone(valid)
  const body = JSON.parse(missingRun[0].content)
  delete body.items[0].runId
  missingRun[0].content = JSON.stringify(body)
  assert.equal(findScheduledInboxItem(missingRun, scheduleId), null)
})

test('recognizes the asynchronous authoring reply as a continuation state', () => {
  assert.equal(authoringProcessingPending({
    text: '候选仍在处理中，请稍后在同一会话发送“继续”。',
    agentFlowExecutedData: [{ nodeId: 'directReplyAgentflow_i10_v4_candidate_processing' }]
  }), true)
  assert.equal(authoringProcessingPending({
    text: '案例已完成。',
    agentFlowExecutedData: [{ nodeId: 'directReplyAgentflow_result' }]
  }), false)
})

test('recognizes asynchronous case-file and video ingest replies as continuation states', () => {
  assert.equal(ingestProcessingPending({
    text: '## 衡准正在解析附件\n文件已进入受控导入流程，稍后在同一对话发送“继续”。',
    agentFlowExecutedData: [{ nodeId: 'directReplyAgentflow_i10_v3_ingest_processing' }]
  }), true)
  assert.equal(ingestProcessingPending({
    text: '案例已完成。',
    agentFlowExecutedData: [{ nodeId: 'directReplyAgentflow_result' }]
  }), false)
})

test('asynchronous resume binds the newest journey identifier from cumulative Flowise output', () => {
  assert.equal(latestOpaqueId([
    { text: 'journey_11111111-1111-4111-8111-111111111111' },
    { text: 'journey_22222222-2222-4222-8222-222222222222' }
  ], 'journey'), 'journey_22222222-2222-4222-8222-222222222222')
})

test('recognizes a resumed journey status card as an asynchronous continuation', () => {
  assert.equal(journeyProcessingPending({
    text: '## 衡准正在处理\n附件已通过入口校验。无需重复提交；稍后发送“继续”。',
    agentFlowExecutedData: [{
      output: JSON.stringify({ status: 'PROCESSING', stage: 'PROCESSING_INGEST' })
    }]
  }), true)
  assert.equal(journeyProcessingPending({
    text: '## 已完成',
    agentFlowExecutedData: [{ output: JSON.stringify({ status: 'COMPLETED' }) }]
  }), false)
})

test('only transient server failures are eligible for read-only prediction retry', () => {
  assert.equal(retryablePredictionStatus(500), true)
  assert.equal(retryablePredictionStatus(503), true)
  assert.equal(retryablePredictionStatus(400), false)
  assert.equal(retryablePredictionStatus(401), false)
})

test('recognizes every governed attachment continuation boundary', () => {
  const body = nodeId => ({ agentFlowExecutedData: [{ nodeId, status: 'SUCCEEDED' }] })
  assert.equal(attachmentIngestTransitionPending(body('directReplyAgentflow_i10_v6_attachment_ingest_confirmed')), true)
  assert.equal(attachmentTargetTransitionPending(body('directReplyAgentflow_i10_v6_attachment_target_profile_ready')), true)
  assert.equal(attachmentJourneyTransitionPending(body('directReplyAgentflow_i10_v6_attachment_journey_ready')), true)
  assert.equal(attachmentJourneyTransitionPending(body('directReplyAgentflow_result')), false)
})

test('prefers the newest repair rerun terminal over an older failed task in one cumulative response', () => {
  const failedTaskId = 'task_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const repairedTaskId = 'task_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const repairedRunId = 'run_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const repairedInboxId = 'inbox_dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const repairedArtifactId = 'art_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const transcript = [{
    output: {
      history: [{
        taskId: failedTaskId,
        runId: 'run_ffffffff-ffff-4fff-8fff-ffffffffffff',
        status: 'FAILED',
        updatedAt: '2026-08-13T00:58:20.414Z'
      }, {
        taskId: repairedTaskId,
        runId: repairedRunId,
        status: 'SUCCEEDED',
        outcome: 'PASSED',
        resultArtifactId: repairedArtifactId,
        updatedAt: '2026-08-13T00:59:11.295Z'
      }, {
        taskId: repairedTaskId,
        runId: repairedRunId,
        inboxId: repairedInboxId,
        executionMode: 'ON_DEMAND',
        outcome: 'PASSED',
        artifact: { artifactId: repairedArtifactId }
      }]
    }
  }]

  assert.equal(
    requireOnDemandTerminalEvidence(transcript, '修复复跑已结束').taskId,
    repairedTaskId
  )
})

test('target-profile resume prefers the authoritative projected Journey over stale trailing state', () => {
  const oldJourneyId = 'journey_11111111-1111-4111-8111-111111111111'
  const newJourneyId = 'journey_22222222-2222-4222-8222-222222222222'
  const body = {
    agentFlowExecutedData: [{
      nodeId: 'customFunctionAgentflow_i10_v6_post_target_journey_projection_cross_session',
      data: { output: { journeyId: newJourneyId }, state: { journeyId: oldJourneyId } }
    }, {
      nodeId: 'directReplyAgentflow_i10_v6_target_profile_transition_cross_session',
      data: { state: { journeyId: oldJourneyId } }
    }]
  }
  assert.equal(latestOpaqueId([body], 'journey'), oldJourneyId)
  assert.equal(authoritativeJourneyId(body), newJourneyId)
})

test('scheduled terminal handling prefers the authoritative created schedule over stale transcript ids', () => {
  const oldScheduleId = 'schedule_11111111-1111-4111-8111-111111111111'
  const newScheduleId = 'schedule_22222222-2222-4222-8222-222222222222'
  const transcript = [{ text: oldScheduleId }, {
    agentFlowExecutedData: [{
      nodeId: 'toolAgentflow_i10_v6_cross_session_schedule_create',
      data: { output: { scheduleId: newScheduleId }, state: { scheduleId: oldScheduleId } }
    }]
  }]
  assert.equal(authoritativeScheduleId(transcript), newScheduleId)
})

test('schema failure evidence retains only safe type and length diagnostics', () => {
  const prefix = 'Error: predictionsServices.buildChatflow - I10_MCP_TOOL_INPUT_SCHEMA_FAILED:'
  const diagnostic = {
    actual: { preparationId: { type: 'string', length: 41 } },
    expected: { preparationId: { type: 'string' } },
    schemaError: 'Input validation error at targetProfileSnapshot: expected object'
  }
  assert.equal(
    safePredictionFailure({ message: prefix + JSON.stringify(diagnostic) }),
    'I10_MCP_TOOL_INPUT_SCHEMA_FAILED:' + JSON.stringify({ actual: diagnostic.actual, expected: diagnostic.expected, invalidKeys: [], schemaIssues: [], schemaError: diagnostic.schemaError })
  )
  assert.doesNotMatch(safePredictionFailure({ message: prefix + JSON.stringify(diagnostic) }), /rejected value/)
})

test('prediction retry requires an explicit read-only call and ignores failure prose', () => {
  assert.deepEqual(predictionRetryDecision({
    status: 500,
    attempt: 1,
    readOnlyRetry: false,
    responseError: 'Failed to parse. Text: empty before any tool call'
  }), { retry: false, maximumAttempts: 1 })
  assert.deepEqual(predictionRetryDecision({
    status: 503,
    attempt: 1,
    readOnlyRetry: true,
    responseError: 'arbitrary untrusted error text'
  }), { retry: true, maximumAttempts: 3 })
  assert.deepEqual(predictionRetryDecision({ status: 503, attempt: 3, readOnlyRetry: true }), {
    retry: false,
    maximumAttempts: 3
  })
  assert.deepEqual(predictionRetryDecision({ status: 400, attempt: 1, readOnlyRetry: true }), {
    retry: false,
    maximumAttempts: 3
  })
})

test('live Stage8 evidence is bound to one unchanged ReleaseIdentity', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/i10-stage8-live.cjs'), 'utf8')
  assert.match(source, /const frozenReleaseIdentity = currentReleaseIdentity\(\)/)
  assert.match(source, /sameReleaseIdentity\(frozenReleaseIdentity, currentReleaseIdentity\(\)\)/)
  assert.match(source, /releaseIdentity: frozenReleaseIdentity/)
})

test('fast certification uses an exact candidate-to-action-trace fallback instead of transcript timing', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/i10-stage8-live.cjs'), 'utf8')
  assert.match(source, /function assertCandidateDeliveryEvidenceWithTraceFallback/)
  assert.match(source, /JOIN i8_executable_plans p/)
  assert.match(source, /JOIN i10_action_traces t/)
  assert.match(source, /c\.candidate_id=\?/)
  assert.match(source, /FROM i8_script_patch_proposals repair/)
  assert.match(source, /repair\.repair_candidate_id=\?/)
  assert.match(source, /assertCandidateDeliveryEvidenceWithTraceFallback\(transcript, candidateId/)
})

test('the controlled Fuxing portal explicitly selects its registered adapter', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/i10-stage8-live.cjs'), 'utf8')
  assert.match(source, /明确选择并使用复兴银行演示适配器（fuxing-bank-demo）/)
})

test('reverse recovery injects the controlled drift before cross-session run submission', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/i10-stage8-live.cjs'), 'utf8')
  assert.match(source, /if \(reverse && !failureInjected\) \{\s*await setFailureMode\(scenario\.failureControlUrl, 'changed'\)\s*failureInjected = true\s*\}\s*const planAnswer/)
})

test('v7 routes a cross-session execution failure into the governed failure and repair chain', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/build-i10-agentflow-v7.cjs'), 'utf8')
  assert.match(source, /value1: '\{\{\$flow\.state\.journeyNextActionType\}\}'[\s\S]*value2: 'QUERY_FAILURE'/)
  assert.match(source, /crossSessionFailureTaskId = 'toolAgentflow_i10_v7_cross_session_failure_task_get'/)
  assert.match(source, /target: crossSessionFailureTaskId/)
  assert.match(source, /split\('toolAgentflow_task'\)\.join\(crossSessionFailureTaskId\)/)
})

test('Stage8 classifies cloned cross-session repair nodes by their canonical base id', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/i10-stage8-live.cjs'), 'utf8')
  assert.match(source, /function canonicalRepairNodeId\(nodeId\)/)
  assert.match(source, /canonicalRepairNodeId\(node\.nodeId\) === 'humanInputAgentflow_repair_rerun'/)
})
