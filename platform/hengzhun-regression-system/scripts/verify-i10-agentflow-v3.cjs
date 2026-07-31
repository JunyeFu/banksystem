#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateAgentflow } = require('./verify-i10-agentflow-paths.cjs')

const root = path.resolve(__dirname,'..')
const flow = JSON.parse(fs.readFileSync(path.join(root,'flowise/i10/agentflow-v3.json'),'utf8'))
const failures = validateAgentflow(flow)
assert.deepEqual(failures,[],failures.join('\n'))
assert.equal(flow.i10Contract.authority,'HARNESS_INTERACTION_JOURNEY')
assert.equal(flow.i10Contract.toolCount,28)
assert.deepEqual(flow.i10Contract.publicJourneyTools,['journey_prepare','journey_get','journey_decision_submit'])
assert.ok(flow.nodes.filter(node => node.data?.name === 'directReplyAgentflow').length >= 1)
assert.ok(flow.nodes.filter(node => node.data?.name === 'humanInputAgentflow').length >= 1)
assert.equal(flow.nodes.some(node => ['humanInputAgentflow_generation','humanInputAgentflow_repair_wait'].includes(node.id)),false)
for (const node of flow.nodes.filter(node => node.id.startsWith('conditionAgentflow_i10_v3_'))) {
  for (const condition of node.data.inputs.conditions || []) assert.notEqual(condition.operation,'contains')
}
for (const node of flow.nodes.filter(node => node.data?.name === 'llmAgentflow')) {
  assert.notEqual(node.data.inputs.llmReturnResponseAs,'userMessage')
}
const actions = flow.nodes
  .filter(node => node.data?.name === 'toolAgentflow')
  .flatMap(node => node.data.inputs.toolAgentflowSelectedToolConfig?.mcpActions || [])
assert.ok(actions.includes('journey_prepare'))
assert.ok(actions.includes('journey_decision_submit'))
assert.ok(actions.includes('case_prepare'))
assert.ok(actions.includes('authoring_submit'))
assert.ok(actions.includes('run_submit'))
assert.ok(actions.includes('schedule_disable'))
assert.ok(actions.includes('artifact_download_grant'))
assert.ok(actions.includes('ingest_submit'))
assert.ok(actions.includes('ingest_get'))
assert.ok(actions.includes('result_inbox_list'))
for (const node of flow.nodes.filter(node => node.data?.name === 'directReplyAgentflow')) {
  assert.equal(
    /\{\{\s*toolAgentflow_/.test(node.data.inputs.directReplyMessage || ''),
    false,
    `direct reply leaks raw tool output: ${node.id}`
  )
}
for (const node of flow.nodes.filter(node => node.data?.name === 'humanInputAgentflow')) {
  assert.equal(
    /\{\{\s*toolAgentflow_/.test(node.data.inputs.humanInputDescription || ''),
    false,
    `human input leaks raw tool output: ${node.id}`
  )
  if (node.id !== 'humanInputAgentflow_run') {
    assert.equal(node.data.inputs.humanInputEnableFeedback,false,`decision gate permits free text: ${node.id}`)
  }
}
const candidatePreview = flow.nodes.find(node => node.id === 'toolAgentflow_preview')
assert.deepEqual(
  candidatePreview.data.inputs.toolUpdateState.map(item => item.key),
  ['candidateDownloadHref','candidateDownloadName','candidateDownloadSha256']
)
const unifiedReply = flow.nodes.find(node => node.id === 'directReplyAgentflow_i10_v3_card')
assert.equal(unifiedReply.data.inputs.directReplyMessage,'{{$flow.state.journeyRenderedMarkdown}}')
process.stdout.write('HENGZHUN_I10_AGENTFLOW_V3_OK\n')
