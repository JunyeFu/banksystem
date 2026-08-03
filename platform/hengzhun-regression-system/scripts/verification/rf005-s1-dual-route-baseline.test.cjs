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

test('C1 (S2 flipped): case_prepare is a single i10 route', () => {
  const block = mcpServer.slice(mcpServer.indexOf("registerTool('case_prepare'"), mcpServer.indexOf("registerTool('authoring_submit'"))
  assert.match(block, /\/v1\/i10\/cases:prepare/, 'i10 endpoint must be the only route')
  assert.doesNotMatch(block, /\/v1\/i8\/cases:prepare/, 'i8 endpoint must no longer be called (RF-005-S2)')
  assert.doesNotMatch(block, /normalizeCaseAcceptanceSummary/, 'acceptance summary path must be retired')
  assert.match(block, /normalizeI10NaturalDraft\(draft, caseDescription, sessionRef, normalizedCredentialRef\)/, 'all drafts must go through the i10 normalizer')
})

test('C2 (S2 flipped): the i8 draft entry aliases are retired from the MCP schema', () => {
  const block = mcpServer.slice(mcpServer.indexOf("registerTool('case_prepare'"), mcpServer.indexOf("registerTool('authoring_submit'"))
  assert.doesNotMatch(block, /draftArray/, 'draftArray must be retired (RF-005-S2)')
  assert.doesNotMatch(block, /acceptanceSummaryJson/, 'acceptanceSummaryJson must be retired')
  assert.doesNotMatch(block, /multimodalContextJson/, 'multimodalContextJson must be retired')
  assert.match(block, /draftJson: jsonObjectArgument\.optional\(\)/, 'draftJson must remain')
})

test('C3 (S2 flipped): boundary contract lists only the draftJson alias', () => {
  const tool = boundaryContract.tools.find(t => t.name === 'case_prepare')
  assert.deepEqual(tool.acceptedAliases.map(a => a.alias), ['draftJson'], 'only draftJson must remain (RF-005-S2)')
})

test('C4 (S2 flipped, DP-R5-1): error codes renamed and retired', () => {
  assert.match(mcpAdapter, /I10_CASE_DRAFT_INVALID/, 'draft error code must carry the i10 semantic name (DP-R5-1)')
  assert.doesNotMatch(mcpAdapter, /I8_DRAFT_JSON_INVALID/, 'legacy draft error code must be gone')
  assert.doesNotMatch(mcpAdapter, /I8_ACCEPTANCE_JSON_INVALID/, 'legacy acceptance error code must be gone')
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
