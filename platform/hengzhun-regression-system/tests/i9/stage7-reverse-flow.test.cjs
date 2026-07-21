'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('P7 Agentflow contains the governed reverse path and independent human gates', () => {
  const flow = JSON.parse(read('flowise/i8/agentflow-v2.json'))
  const ids = new Set(flow.nodes.map(node => node.id))
  for (const id of [
    'toolAgentflow_failure', 'llmAgentflow_repair', 'humanInputAgentflow_repair_confirm',
    'toolAgentflow_repair_propose', 'toolAgentflow_repair_ready', 'humanInputAgentflow_repair_activate',
    'toolAgentflow_repair_decision', 'humanInputAgentflow_repair_rerun', 'toolAgentflow_repair_task',
    'humanInputAgentflow_repair_schedule', 'directReplyAgentflow_repair_no_schedule'
  ]) assert.ok(ids.has(id), `missing reverse node ${id}`)
})

test('P7 distinguishes business failure data from MCP error envelopes', () => {
  const overlay = read('scripts/apply-i9-flowise-overlays.cjs')
  assert.match(overlay, /I9_MCP_TOOL_ERROR_FAIL_CLOSED_V3/)
  assert.match(overlay, /payload\?\.errorCode && payload\?\.category && Number\(payload\?\.status\) >= 400/)
  assert.match(overlay, /terminal tasks may contain a business errorCode/)
})

test('P7 maps allowlisted Playwright locator timeouts to repairable deterministic codes', () => {
  const runner = read('worker/src/i8-formal-runner.cjs')
  assert.match(runner, /LOGIN_USERNAME_LOCATOR_NOT_FOUND/)
  assert.match(runner, /PROFILE_DISPLAY_NAME_LOCATOR_NOT_FOUND/)
  assert.match(runner, /error\.category = 'TEST_FAILURE'/)
  const probe = read('scripts/probe-i9-stage7-prediction.cjs')
  assert.match(probe, /stabilityRuns: 6/)
  assert.match(probe, /scheduleDecision: 'REJECTED_NO_MIGRATION'/)
})
