'use strict'

// RF-004-S2: MCP credential injection exit (DP-S4-1=A).
// 1. Adapter unit: default binding injects no alias; legacy=true restores the
//    frozen i3-customer channel; audit digests only.
// 2. Static: server.cjs default path attaches the alias conditionally; the
//    legacy switch gates the only injection channel.
// 3. Contract: the run_submit/schedule_create alias entries are updated to
//    the RF-004 migration state (13-alias count unchanged).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(root, '../..')
const adapter = require(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'))
const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const boundaryContract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json'), 'utf8'))

test('adapter: default binding injects no credential, legacy channel restores i3-customer', () => {
  const defaultBinding = adapter.normalizeCredentialBinding(false)
  assert.equal(defaultBinding.credentialAlias, undefined, 'default must not inject an alias')
  assert.match(defaultBinding.auditDigest, /^[0-9a-f]{64}$/, 'audit digest must be present')
  const legacyBinding = adapter.normalizeCredentialBinding(true)
  assert.equal(legacyBinding.credentialAlias, 'i3-customer', 'legacy channel must restore the frozen alias')
  assert.notEqual(defaultBinding.auditDigest, legacyBinding.auditDigest, 'the two channels must be distinguishable in audit')
})

test('server.cjs: conditional alias attachment on both tools with the legacy switch gate', () => {
  assert.match(serverSource, /const legacyCredentialBinding = process\.env\.HENGZHUN_RF004_LEGACY_CREDENTIAL === '1'/, 'legacy switch must exist')
  const runBlock = serverSource.slice(serverSource.indexOf("registerTool('run_submit'"), serverSource.indexOf("registerTool('schedule_create'"))
  const scheduleBlock = serverSource.slice(serverSource.indexOf("registerTool('schedule_create'"), serverSource.indexOf("registerTool('schedule_get'"))
  for (const [name, block] of [['run_submit', runBlock], ['schedule_create', scheduleBlock]]) {
    assert.match(block, /normalizeCredentialBinding\(legacyCredentialBinding\)/, `${name} must pass the legacy switch`)
    assert.ok(block.includes('...(binding.credentialAlias ? { credentialAlias: binding.credentialAlias } : {})'), `${name} must attach the alias conditionally`)
  }
  assert.doesNotMatch(serverSource, /credentialAlias: 'i3-customer'/, 'no hardcoded injection may remain in the MCP server')
})

test('contract: alias entries reflect the RF-004 migration state, 13 count unchanged', () => {
  const aliasCount = boundaryContract.tools.reduce((sum, tool) => sum + (tool.acceptedAliases || []).length, 0)
  assert.equal(aliasCount, 10, 'alias count is 10 after RF-005-S2')
  for (const toolName of ['run_submit', 'schedule_create']) {
    const tool = boundaryContract.tools.find(t => t.name === toolName)
    const alias = tool.acceptedAliases[0]
    assert.match(alias.until, /RF-004/, `until must reference the RF-004 migration (${toolName})`)
    assert.ok(!/B4 credentialRef consumer migration/.test(alias.until), 'the stale B4 marker must be gone')
  }
})
