'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const flow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i8/agentflow-v2.json'), 'utf8'))
const source = JSON.stringify(flow)

test('P6 forward flow freezes natural-language, optional clarification plus four main human gates and the complete governed path', () => {
  const ids = new Set(flow.nodes.map(node => node.id))
  for (const required of [
    'startAgentflow_i8', 'retrieverAgentflow_i8', 'llmAgentflow_structure',
    'humanInputAgentflow_confirm', 'toolAgentflow_prepare', 'llmAgentflow_intent',
    'toolAgentflow_submit', 'toolAgentflow_candidate', 'humanInputAgentflow_generation',
    'toolAgentflow_candidate_ready', 'toolAgentflow_preview', 'humanInputAgentflow_activate',
    'toolAgentflow_activate', 'humanInputAgentflow_run', 'toolAgentflow_run',
    'llmAgentflow_runref', 'toolAgentflow_task', 'directReplyAgentflow_result'
  ]) assert.ok(ids.has(required), `missing node ${required}`)
  assert.equal(flow.nodes.find(node => node.id === 'startAgentflow_i8').data.inputs.startInputType, 'chatInput')
  assert.equal(flow.nodes.filter(node => node.data.name === 'humanInputAgentflow').length, 5)
  assert.equal(source.includes('intentPlanJson'), false)
  for (const forbidden of ['codeAgentflow', 'httpAgentflow', 'databaseAgentflow', 'fileAgentflow', 'shellAgentflow']) {
    assert.equal(source.includes(forbidden), false)
  }
})

test('P6 MCP and Worker keep state, script generation and browser execution outside Flowise', () => {
  const mcp = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const worker = fs.readFileSync(path.join(root, 'worker/src/index.cjs'), 'utf8')
  assert.match(mcp, /I8_INTENT_FLAT_FIELDS_INVALID/)
  assert.match(mcp, /waitForCertificate/)
  assert.match(mcp, /waitForTerminal/)
  assert.match(worker, /runI8CandidateBuildOnce/)
  assert.match(worker, /executeLoginProfile/)
  assert.match(worker, /runI8CandidateBuildOnce\(\).*runI8StabilityOnce\(\).*runOnce\(\)/s)
})

test('P6 live probe requires the bank portal and proves the final terminal reply', () => {
  const wrapper = fs.readFileSync(path.join(root, 'scripts/probe-i9-stage6-live.ps1'), 'utf8')
  const probe = fs.readFileSync(path.join(root, 'scripts/probe-i9-stage6-prediction.cjs'), 'utf8')
  assert.match(wrapper, /I9_STAGE6_PORTAL_UNAVAILABLE/)
  assert.match(probe, /FORWARD_FLOW_VERIFIED/)
  assert.match(probe, /resultTerminal/)
  assert.match(probe, /humanInputAgentflow_confirm/)
  assert.match(probe, /humanInputAgentflow_activate/)
  assert.match(probe, /humanInputAgentflow_run/)
})
