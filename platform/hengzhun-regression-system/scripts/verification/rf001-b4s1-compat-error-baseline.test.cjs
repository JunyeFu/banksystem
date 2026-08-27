'use strict'

// RF-001-B4-S1: compatibility and error-path baseline verification.
// Zero runtime code changes. Machine-checkable cross-source checks:
//   1. 33 tool names identical across contracts/mcp/hengzhun-i8.json,
//      mcp-boundary-contract-v1.json and server.cjs registerTool calls;
//      13 aliases / 8 error fields / 3 conditional writes frozen by B2.
//   2. Every MCP error-code literal is documented (matrix + contract text)
//      and every error path fails closed with an errorCode.
//   3. Flowise v7 (agentflow-v7.json) tool nodes call only the 33 tools.
//   4. Pre-cutover baseline: error output is currently legacy projection +
//      shadow comparison; the B4-S4 HENGZHUN_RF001_LEGACY_ERROR switch does
//      not exist yet (S4 introduces it).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(root, '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const readJson = relative => JSON.parse(read(relative))
const readRepo = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8')
const readRepoJson = relative => JSON.parse(readRepo(relative))

const runtimeContract = readJson('contracts/mcp/hengzhun-i8.json')
const boundaryContract = readRepoJson('docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json')
const serverSource = read('mcp/src/server.cjs')
const matrixSource = readRepo('docs/architecture/refactoring/batches/RF-001/field-error-adapter-matrix.md')

test('RF-016 current 35-tool surface preserves the historical RF-001 33-tool subset', () => {
  const contractNames = runtimeContract.tools.map(tool => tool.name).sort()
  const boundaryNames = boundaryContract.tools.map(tool => tool.name).sort()
  const registered = [...serverSource.matchAll(/registerTool\('([a-z_]+)'/g)].map(match => match[1]).sort()
  assert.equal(contractNames.length, 35, 'runtime contract must freeze exactly 35 tools')
  assert.equal(boundaryNames.length, 33, 'boundary contract must freeze exactly 33 tools')
  assert.equal(registered.length, 35, 'server.cjs must register exactly 35 tools')
  assert.deepEqual(boundaryNames.filter(name => !contractNames.includes(name)), [], 'historical RF-001 tools must remain available')
  assert.deepEqual(contractNames.filter(name => !boundaryNames.includes(name)), ['candidate_compile', 'result_inbox_ack'])
  assert.deepEqual(contractNames, registered, 'server.cjs must register exactly the frozen tool set')
})

test('B4-S1 aliases, error envelope and conditional writes match the frozen B2 contract', () => {
  const aliasCount = boundaryContract.tools.reduce((sum, tool) => sum + (tool.acceptedAliases || []).length, 0)
  assert.equal(aliasCount, 10, '10 entry aliases are frozen after RF-005-S2 (case_prepare 4->1)')
  for (const tool of boundaryContract.tools) {
    for (const alias of tool.acceptedAliases || []) {
      assert.ok(alias.alias && alias.canonical && alias.until, `alias entry of ${tool.name} must carry alias/canonical/until`)
    }
  }
  assert.deepEqual(
    [...boundaryContract.canonicalErrorEnvelope.fields].sort(),
    ['correlationRef', 'errorCode', 'category', 'status', 'retryable', 'userActionRequired', 'safeMessage', 'fieldErrors'].sort(),
    '8-field canonical error envelope must be frozen'
  )
  // RF-002-S4 (G5): schedule_get retired to READ_ONLY; exactly two
  // conditional-write tools remain declared (candidate_get, result_inbox_list)
  const conditional = boundaryContract.tools.filter(tool => tool.sideEffect === 'CONDITIONAL_MUTATION')
  assert.equal(conditional.length, 2, 'exactly 2 conditional-write tools must be declared after S4')
  for (const tool of conditional) {
    assert.ok(serverSource.includes(`registerTool('${tool.name}'`), `conditional-write tool ${tool.name} must exist in server.cjs`)
  }
  assert.equal(boundaryContract.tools.find(tool => tool.name === 'schedule_get').sideEffect, 'READ_ONLY', 'schedule_get must be READ_ONLY after retirement')
})

test('B4-S1 every MCP error-code literal is documented and every error path fails closed', () => {
  const adapterSource = read('mcp/src/rf001-contract-adapter.cjs')
  const harnessErrors = fs.existsSync(path.join(root, 'harness/src/errors.ts')) ? read('harness/src/errors.ts') : ''
  const literals = new Set([
    ...[...serverSource.matchAll(/errorCode\s*:\s*'([A-Z0-9_]+)'/g)].map(match => match[1]),
    ...[...serverSource.matchAll(/errorCode:'([A-Z0-9_]+)'/g)].map(match => match[1]),
    // fail-closed fallback codes when the upstream body lacks errorCode
    ...[...serverSource.matchAll(/\|\| '((?:I8|I10|MCP|HARNESS)_[A-Z0-9_]+)'/g)].map(match => match[1]),
    ...[...adapterSource.matchAll(/codeError\('([A-Z0-9_]+)'\)/g)].map(match => match[1]),
    ...[...adapterSource.matchAll(/errorCode\s*:\s*'([A-Z0-9_]+)'/g)].map(match => match[1])
  ])
  assert.ok(literals.size >= 25, `expected a substantial error-code inventory, got ${literals.size}`)
  const contractText = JSON.stringify(boundaryContract, null, 2)
  const corpus = matrixSource + contractText + harnessErrors + adapterSource + serverSource
  for (const code of literals) {
    assert.match(code, /^[A-Z][A-Z0-9_]{3,}$/, `error code must be UPPER_SNAKE: ${code}`)
    assert.ok(corpus.includes(code), `error code ${code} must be documented in matrix/contract/harness errors`)
  }
  // every ERROR-flagged textResult (isError=true) must fail closed carrying errorCode;
  // success responses legitimately carry no errorCode
  const errorResults = [...serverSource.matchAll(/textResult\(\{([^}]*)\} *,\s*true\)/g)]
  assert.ok(errorResults.length >= 15, `expected fail-closed error returns, got ${errorResults.length}`)
  for (const match of errorResults) {
    assert.match(match[1], /errorCode/, 'every error textResult must carry errorCode')
  }
})

test('B4-S1 Flowise v7 tool nodes call only the frozen 33 tools', () => {
  const agentflow = readJson('flowise/i10/agentflow-v7.json')
  const frozen = new Set(boundaryContract.tools.map(tool => tool.name))
  const called = new Set()
  let nodes = 0
  for (const node of agentflow.nodes) {
    const inputs = node.data?.inputs || {}
    const actions = inputs.toolAgentflowSelectedToolConfig?.mcpActions || []
    if (!actions.length) continue
    nodes += 1
    for (const action of actions) {
      called.add(action)
      assert.ok(frozen.has(action), `agentflow v7 must not call unknown tool: ${action}`)
    }
  }
  assert.ok(nodes >= 20, `expected a rich MCP call surface, got ${nodes} tool nodes`)
  assert.ok(called.size >= 25, `expected >=25 distinct tools called by v7, got ${called.size}`)
})

test('B4-S1 cutover baseline: canonical envelope is the default, legacy switch preserved', () => {
  assert.match(serverSource, /projectLegacyHarnessError\(body, response\.status\)/, 'legacy projection must remain for the fallback path')
  assert.match(serverSource, /rf001Shadow\.observeError\(/, 'shadow comparison must remain wired')
  // B4-S4 cutover (2026-08-03): the fallback switch now exists and defaults off;
  // error output leaves through the canonical envelope unless LEGACY_ERROR=1.
  assert.match(serverSource, /HENGZHUN_RF001_LEGACY_ERROR === '1'/, 'legacy fallback switch must exist after cutover')
  assert.match(serverSource, /legacyErrorOutput \? legacy : canonical/, 'callHarness must output canonical by default')
  assert.match(serverSource, /projectCanonicalToolError\(value\)/, 'textResult must project tool errors to the canonical envelope')
  // alias projections remain the only request path (B3-S3 baseline preserved)
  assert.match(serverSource, /normalizeCasePrepareRequest\(/, 'canonical request projections must remain wired')
  assert.match(serverSource, /normalizeIngestDecisionSubmitRequest\(/, 'canonical request projections must remain wired')
})
