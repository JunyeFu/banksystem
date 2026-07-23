'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { validateAgentflow } = require('../../scripts/verify-i10-agentflow-paths.cjs')

const root = path.resolve(__dirname, '../..')
const load = () => JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v2.json'), 'utf8'))

test('I10 Agentflow has path-safe node references and definitely assigned flow state', () => {
  assert.deepEqual(validateAgentflow(load()), [])
})

test('attachment review persists confirm, correction-loop and rejection paths', () => {
  const flow = load()
  const edges = new Set(flow.edges.map(edge => `${edge.source}:${edge.sourceHandle}->${edge.target}`))
  assert.ok(edges.has('humanInputAgentflow_ingest_confirm:humanInputAgentflow_ingest_confirm-output-0->llmAgentflow_ingest_decision'))
  assert.ok(edges.has('humanInputAgentflow_ingest_confirm:humanInputAgentflow_ingest_confirm-output-1->toolAgentflow_ingest_reject'))
  assert.ok(edges.has('toolAgentflow_ingest_correct:toolAgentflow_ingest_correct-output-toolAgentflow->toolAgentflow_ingest_get'))
  assert.ok(edges.has('toolAgentflow_ingest_reject:toolAgentflow_ingest_reject-output-toolAgentflow->directReplyAgentflow_rejected'))
  const correct = flow.nodes.find(node => node.id === 'toolAgentflow_ingest_correct')
  const reject = flow.nodes.find(node => node.id === 'toolAgentflow_ingest_reject')
  assert.equal(correct.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'choice').inputArgValue, 'CORRECT')
  assert.equal(reject.data.inputs.toolInputArgs.find(arg => arg.inputArgName === 'choice').inputArgValue, 'REJECT')
  assert.equal(correct.data.inputs.toolInputArgs.some(arg => arg.inputArgName === 'correctionsJson'), true)
})

test('path validator rejects references to a node that is absent on another branch', () => {
  const flow = load()
  const target = flow.nodes.find(node => node.id === 'toolAgentflow_ingest_get')
  target.data.inputs.toolInputArgs[0].inputArgValue = '{{toolAgentflow_ingest_video.output.ingestJobId}}'
  assert.ok(validateAgentflow(flow).includes('REFERENCE_NOT_PATH_SAFE:toolAgentflow_ingest_get:toolAgentflow_ingest_video'))
})

test('path validator rejects a state value not assigned on every incoming path', () => {
  const flow = load()
  flow.nodes.find(node => node.id === 'toolAgentflow_ingest_file').data.inputs.toolUpdateState = []
  assert.ok(validateAgentflow(flow).includes('STATE_NOT_ASSIGNED_ON_ALL_PATHS:toolAgentflow_ingest_get:ingestJobId'))
})
