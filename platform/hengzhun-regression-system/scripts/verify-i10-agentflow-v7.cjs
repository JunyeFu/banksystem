#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const flow = JSON.parse(read('flowise/i10/agentflow-v7.json'))
const manifest = JSON.parse(read('flowise/i10/publication-manifest-v1.json'))
const hash = relative => crypto.createHash('sha256').update(read(relative)).digest('hex')

assert.equal(flow.i10Contract?.schemaVersion, 'hengzhun-i10-agentflow-v7')
assert.equal(flow.i10Contract?.generationAuthority, 'scripts/build-i10-agentflow-v7.cjs')
assert.equal(flow.i10Contract?.opaqueReferenceContract, 'contracts/i10/opaque-reference-v1.json')
assert.equal(flow.i10Contract?.journeyTransitionVersion, 'JourneyTransitionV2')
assert.equal(flow.i10Contract?.mutationBoundary, 'ONE_MUTATING_MCP_PER_FLOWISE_EXECUTION')
assert.equal(manifest.primaryFlowDataPath, 'flowise/i10/agentflow-v7.json')
assert.equal(manifest.primaryFlowVersion, 7)
assert.equal(manifest.primaryFlowSha256, hash('flowise/i10/agentflow-v7.json'))
assert.equal(manifest.rollbackFlowDataPath, 'flowise/i10/agentflow-v6.json')
assert.ok(fs.existsSync(path.join(root, manifest.rollbackFlowDataPath)))
assert.equal(flow.nodes.filter(node => node.data?.name === 'startAgentflow').length, 1, 'I10_V7_START_NODE_COUNT_INVALID')
const active = new Set(flow.nodes.map(node => node.id))
for (const edge of flow.edges) {
  assert.ok(active.has(edge.source) && active.has(edge.target), `I10_V7_EDGE_REFERENCE_INVALID:${edge.id}`)
}
const candidateState = flow.nodes.find(node => node.id === 'customFunctionAgentflow_i10_v6_cross_session_candidate_state')
assert.ok(candidateState, 'I10_V7_CROSS_SESSION_CANDIDATE_STATE_MISSING')
assert.match(String(candidateState.data?.inputs?.customFunctionJavascriptFunction || ''), /candidate_\[0-9a-f\]\{40\}/)
assert.doesNotMatch(String(candidateState.data?.inputs?.customFunctionJavascriptFunction || ''), /candidate_\[0-9a-f-\]\{36\}/)
const interactionContractArgs = flow.nodes.flatMap(node => Array.isArray(node?.data?.inputs?.toolInputArgs) ? node.data.inputs.toolInputArgs : [])
  .filter(arg => arg?.inputArgName === 'interactionContractVersion')
assert.ok(interactionContractArgs.length > 0, 'I10_V7_INTERACTION_CONTRACT_ARGS_MISSING')
assert.ok(interactionContractArgs.every(arg => arg.inputArgValue === 'v6'), 'I10_V7_INTERACTION_CONTRACT_VERSION_STALE')
process.stdout.write('HENGZHUN_I10_AGENTFLOW_V7_OK\n')
