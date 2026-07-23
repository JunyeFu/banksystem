'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const { assertCandidateDeliveryEvidence, extractOpaqueId, feedbackFor, findAuthoringEvidence, findCaseDraft, findScheduledInboxItem } = require('../../scripts/i10-stage8-live.cjs')

test('S8 matrix requires three inputs, three execution modes and one reverse flow per input', () => {
  const matrix = JSON.parse(read('flowise/i10/stage8-acceptance-matrix-v1.json'))
  assert.deepEqual(matrix.inputTypes, ['NATURAL_LANGUAGE', 'CASE_FILE', 'VIDEO'])
  assert.deepEqual(matrix.executionModes, ['ON_DEMAND', 'ONE_TIME', 'RECURRING'])
  assert.equal(matrix.forwardScenarioCount, 9)
  assert.equal(matrix.reverseScenarioCount, 3)
  assert.equal(matrix.requiredRealEvidence.controller.mock, false)
  assert.equal(matrix.requiredRealEvidence.vision.mock, false)
  assert.equal(matrix.requiredRealEvidence.authoring.playwrightFallbackAccepted, false)
  assert.deepEqual(matrix.requiredRealEvidence.candidate, { policy: 'I10_2X2_V1', uniqueRuns: 4, sourceDownloadRequired: true })
})

test('S8 live verifier runs real probes and public publication before conversation acceptance', () => {
  const wrapper = read('scripts/verify-i10-stage8-live.ps1')
  const live = read('scripts/i10-stage8-live.cjs')
  const overlay = read('scripts/apply-i9-flowise-overlays.cjs')
  assert.ok(wrapper.indexOf('verify-i10-model-probes.cjs') < wrapper.indexOf('i10-agentflow-publish.cjs'))
  assert.ok(wrapper.indexOf('i10-agentflow-publish.cjs') < wrapper.indexOf('i10-stage8-orchestrator.cjs'))
  assert.match(read('scripts/i10-stage8-orchestrator.cjs'), /i10-stage8-live\.cjs/)
  for (const name of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL_NAME']) assert.match(live, new RegExp(name))
  assert.match(live, /mock !== false/)
  assert.match(live, /degraded !== false/)
  assert.match(live, /publicationEvidence\.deployed !== true/)
  assert.match(overlay, /FLOWISE_CONTROLLED_ATTACHMENTS=/)
  assert.match(live, /humanInputAgentflow_repair_rerun/)
  assert.match(live, /setFailureMode\(scenario\.failureControlUrl, 'changed'\)/)
  assert.match(live, /setFailureMode\(scenario\.failureControlUrl, 'recovered'\)/)
  assert.match(live, /awaitScheduledResult\(scheduleId, mode, sequence\)/)
  assert.match(live, /disableRecurringSchedule\(scheduleId, sequence\)/)
  assert.match(live, /I10_STAGE8_SCHEDULED_RESULT_TIMEOUT/)
  assert.match(live, /I10_STAGE8_RECURRING_DISABLE_NOT_PROVEN/)
  assert.match(live, /I10_STAGE8_SOURCE_DOWNLOAD_MISSING/)
})

test('S8 controlled portal takes fixture credentials only from process environment', () => {
  const portal = read('scripts/i10-stage8-controlled-portal.cjs')
  assert.match(portal, /I10_STAGE8_FIXTURE_USERNAME/)
  assert.match(portal, /I10_STAGE8_FIXTURE_PASSWORD/)
  assert.doesNotMatch(portal, /synthetic-password|fixture-password|password\s*=\s*['"][^'"]+/i)
  assert.match(portal, /__mode\/changed/)
  assert.match(portal, /__mode\/recovered/)
})

test('S8 evidence helpers require exact IDs, real Midscene, 2x2 policy and downloadable source', () => {
  const ids = {
    scheduleId: `schedule_${'1'.repeat(36)}`,
    taskId: `task_${'2'.repeat(36)}`,
    inboxId: `inbox_${'3'.repeat(36)}`
  }
  assert.equal(extractOpaqueId({ nested: ids }, 'schedule'), ids.scheduleId)
  assert.equal(extractOpaqueId({ nested: ids }, 'task'), ids.taskId)
  assert.equal(extractOpaqueId({ nested: ids }, 'inbox'), ids.inboxId)
  assert.equal(extractOpaqueId({ nested: ids }, 'run'), null)

  const accepted = {
    authoringEvidence: {
      invocation: 'REAL', provider: 'MIDSCENE', status: 'PLAYWRIGHT_VERIFIED',
      actionTraceHash: 'b'.repeat(64), playwrightFactHash: 'c'.repeat(64)
    },
    certificate: { policy: 'I10_2X2_V1' },
    source: { downloadUrl: '/v1/i8/candidates/source.cjs', sha256: 'a'.repeat(64) }
  }
  assert.doesNotThrow(() => assertCandidateDeliveryEvidence(accepted, {}))
  assert.deepEqual(findAuthoringEvidence(JSON.stringify([{ type: 'text', text: JSON.stringify(accepted) }])), accepted.authoringEvidence)
  assert.deepEqual(findAuthoringEvidence([...Array.from({ length: 25_000 }, (_, index) => ({ noise: index })), accepted]), accepted.authoringEvidence)
  assert.deepEqual(findAuthoringEvidence([...Array.from({ length: 12 }, (_, index) => ({ history: Array.from({ length: 10_000 }, () => index) })), { latest: accepted }]), accepted.authoringEvidence)
  assert.throws(
    () => assertCandidateDeliveryEvidence({ ...accepted, authoringEvidence: { ...accepted.authoringEvidence, provider: 'PLAYWRIGHT' } }, {}),
    error => error.code === 'I10_STAGE8_MIDSCENE_EVIDENCE_MISSING'
  )
  assert.throws(
    () => assertCandidateDeliveryEvidence({ ...accepted, authoringEvidence: { ...accepted.authoringEvidence, actionTraceHash: 'not-a-hash' } }, {}),
    error => error.code === 'I10_STAGE8_MIDSCENE_EVIDENCE_MISSING'
  )
  assert.throws(
    () => assertCandidateDeliveryEvidence({ ...accepted, source: { sha256: 'a'.repeat(64) } }, {}),
    error => error.code === 'I10_STAGE8_SOURCE_DOWNLOAD_MISSING'
  )
})

test('S8 video review submits only the human-known target and entry corrections on the real parsed draft', () => {
  const draft = {
    schemaVersion: 'hengzhun-i10-case-draft-v1', title: '视频案例', objective: '登录', summary: '登录',
    preconditions: ['门户可访问'], steps: [{ action: '登录', expected: '成功' }], assertions: ['成功'],
    credentialRef: `credential_${'1'.repeat(36)}`,
    source: { inputType: 'VIDEO', sourceRef: 'flowise-ref', sourceHash: 'a'.repeat(64), provenanceSummary: '真实视频解析' },
    confidence: 0.9, missingFields: ['targetSystem', 'entryUrl'], confirmationStatus: 'WAITING_USER',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY', executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY', evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  }
  const body = { agentFlowExecutedData: [{ data: { state: { caseDraftJson: draft } } }] }
  const feedback = feedbackFor('humanInputAgentflow_ingest_confirm', 'ON_DEMAND', { portalUrl: 'http://127.0.0.1:28884' }, body, 'VIDEO')
  const parsed = JSON.parse(feedback)
  assert.equal(parsed.corrections[0].ordinal, 1)
  assert.equal(parsed.corrections[0].draft.targetSystem, '复兴银行')
  assert.equal(parsed.corrections[0].draft.entryUrl, 'http://127.0.0.1:28884/portal/login')
  assert.deepEqual(parsed.corrections[0].draft.missingFields, [])
  assert.throws(
    () => feedbackFor('humanInputAgentflow_ingest_confirm', 'ON_DEMAND', { portalUrl: 'http://127.0.0.1:28884' }, { agentFlowExecutedData: [{ data: { state: { caseDraftJson: { ...draft, missingFields: ['steps'] } } } }] }, 'VIDEO'),
    error => error.code === 'I10_STAGE8_VIDEO_CORRECTION_UNEXPECTED_GAPS'
  )
  const nestedMcpContent = [{ type: 'text', text: JSON.stringify({ items: [{ ordinal: 1, draft }] }) }]
  assert.deepEqual(findCaseDraft(JSON.stringify(nestedMcpContent)), draft)
  const nestedFeedback = feedbackFor(
    'humanInputAgentflow_ingest_confirm', 'ON_DEMAND', { portalUrl: 'http://127.0.0.1:28884' },
    { agentFlowExecutedData: [{ data: { state: { caseDraftJson: '' }, output: nestedMcpContent } }] }, 'VIDEO'
  )
  assert.equal(JSON.parse(nestedFeedback).corrections[0].draft.entryUrl, 'http://127.0.0.1:28884/portal/login')
})

test('scheduled-result evidence binds task and inbox IDs to the requested schedule instead of a stale on-demand item', () => {
  const scheduleId = `schedule_${'4'.repeat(36)}`
  const expected = { scheduleId, scheduleType: 'ONE_TIME', inboxId: `inbox_${'5'.repeat(36)}`, taskId: `task_${'6'.repeat(36)}`, outcome: 'PASSED' }
  const decoy = { inboxId: `inbox_${'1'.repeat(36)}`, taskId: `task_${'2'.repeat(36)}`, outcome: 'PASSED', executionMode: 'ON_DEMAND' }
  const transcript = [{ text: JSON.stringify([{ type: 'text', text: JSON.stringify({ items: [decoy, expected] }) }]) }]
  assert.deepEqual(findScheduledInboxItem(transcript, scheduleId), expected)
  assert.equal(findScheduledInboxItem([{ scheduleId, ...decoy }], scheduleId), null)
})
