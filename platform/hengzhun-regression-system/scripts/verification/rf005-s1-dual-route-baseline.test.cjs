'use strict'

// RF-005-S1: dual-route archaeology baseline (zero code changes).
// Freezes the current case_prepare dual-route facts (C1-C5) as machine
// checkable reverse anchors for R1 (single-route retirement in S2), and
// re-confirms the v7 consumer surface (only draftJson on the i10 route).
// Only alias/reference SHAPES are asserted - no credential values.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(root, '../..')
const mcpServer = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const mcpAdapter = fs.readFileSync(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'), 'utf8')
const boundaryContract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json'), 'utf8'))
const agentflow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v7.json'), 'utf8'))

test('C1: case_prepare still carries the i10/i8 dual-route branch (S1 baseline)', () => {
  const block = mcpServer.slice(mcpServer.indexOf("registerTool('case_prepare'"), mcpServer.indexOf("registerTool('authoring_submit'"))
  assert.match(block, /draft\.schemaVersion === 'hengzhun-i10-case-draft-v1' \|\| typeof draft\.credentialRef === 'string'/, 'i10 routing condition must exist (S1 baseline)')
  assert.match(block, /\/v1\/i10\/cases:prepare/, 'i10 route must call the i10 endpoint')
  assert.match(block, /\/v1\/i8\/cases:prepare/, 'i8 route must still call the i8 endpoint (S1 baseline)')
  assert.match(block, /normalizeCaseAcceptanceSummary\(acceptanceSummaryJson\)/, 'i8 acceptance summary parsing must exist (S1 baseline)')
})

test('C2: the i8 draft entry aliases still exist in the MCP schema (S1 baseline)', () => {
  const block = mcpServer.slice(mcpServer.indexOf("registerTool('case_prepare'"), mcpServer.indexOf("registerTool('authoring_submit'"))
  assert.match(block, /draftArray: singleJsonObjectArrayArgument\.optional\(\)/, 'draftArray must exist (S1 baseline)')
  assert.match(block, /acceptanceSummaryJson: jsonObjectArgument\.optional\(\)/, 'acceptanceSummaryJson must exist (S1 baseline)')
  assert.match(block, /multimodalContextJson: jsonObjectArgument\.optional\(\)/, 'multimodalContextJson must exist (S1 baseline)')
})

test('C3: boundary contract lists four case_prepare aliases (S1 baseline)', () => {
  const tool = boundaryContract.tools.find(t => t.name === 'case_prepare')
  assert.deepEqual(tool.acceptedAliases.map(a => a.alias).sort(), [
    'acceptanceSummaryJson', 'draftArray', 'draftJson', 'multimodalContextJson'
  ].sort(), 'four aliases must be declared (S1 baseline)')
})

test('C4: i8 error codes still exist in the adapter (S1 baseline, DP-R5-1 rename target)', () => {
  assert.match(mcpAdapter, /I8_DRAFT_JSON_INVALID/, 'legacy draft error code must exist (S1 baseline)')
  assert.match(mcpAdapter, /I8_ACCEPTANCE_JSON_INVALID/, 'legacy acceptance error code must exist (S1 baseline)')
  assert.match(mcpServer, /normalizeCaseAcceptanceSummary\(acceptanceSummaryJson\)/, 'server must consume the acceptance summary through the adapter (S1 baseline)')
})

test('C5: v7 consumers only use draftJson on the i10 route (retirement safety)', () => {
  let nodes = 0
  for (const node of agentflow.nodes) {
    if (node.data?.type !== 'Tool') continue
    const inputs = node.data.inputs || {}
    const actions = inputs.toolAgentflowSelectedToolConfig?.mcpActions || []
    if (!actions.length || actions[0] !== 'case_prepare') continue
    nodes += 1
    const args = (inputs.toolInputArgs || []).filter(a => typeof a === 'object').map(a => a.inputArgName)
    assert.ok(args.includes('draftJson'), 'case_prepare node must pass draftJson')
    assert.ok(!args.includes('draftArray'), 'no node may pass draftArray')
    assert.ok(!args.includes('acceptanceSummaryJson'), 'no node may pass acceptanceSummaryJson')
    assert.ok(!args.includes('multimodalContextJson'), 'no node may pass multimodalContextJson')
  }
  assert.ok(nodes >= 2, `expected >=2 case_prepare nodes, got ${nodes}`)
})
