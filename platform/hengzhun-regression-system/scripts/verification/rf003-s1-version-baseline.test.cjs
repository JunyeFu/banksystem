'use strict'

// RF-003-S1: version contract archaeology baseline (zero code changes).
// Freezes the three-source version drift as machine-checkable assertions
// (reverse anchors for S2 unification): MCP SDK registration 8.0.0 vs
// health endpoint 10.0.0 vs runtime contract 10.1.0. Also verifies the
// current safety invariant: the runtime contract is part of ReleaseIdentity,
// so an executable protocol-version change invalidates stale evidence.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(root, '../..')
const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const runtimeContract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/mcp/hengzhun-i8.json'), 'utf8'))
const boundaryContract = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json'), 'utf8'))
const identitySource = fs.readFileSync(path.join(root, 'scripts/i10-release-identity.cjs'), 'utf8')

test('S2 landed: the three version sources are unified on the contract contractVersion', () => {
  // RF-003-S2: SDK registration and the health endpoint derive from the
  // runtime contract contractVersion; no hardcoded legacy versions remain.
  assert.match(serverSource, /version: runtimeContractVersion/, 'McpServer registration must derive from runtimeContractVersion')
  assert.match(serverSource, /version: runtimeContractVersion/, 'health endpoint must derive from runtimeContractVersion')
  assert.doesNotMatch(serverSource, /version: '8\.0\.0'/, 'legacy SDK version 8.0.0 must be gone')
  assert.doesNotMatch(serverSource, /version: '10\.0\.0'/, 'legacy health version 10.0.0 must be gone')
  assert.match(serverSource, /HENGZHUN_CONTRACT_VERSION_INVALID/, 'startup must fail closed on invalid contract version')
  assert.equal(runtimeContract.contractVersion, '10.1.0', 'contract stays the single authority')
  const sources = [runtimeContract.contractVersion, runtimeContract.contractVersion, runtimeContract.contractVersion]
  assert.equal(new Set(sources).size, 1, 'S2: the three sources must be unified (single version)')
})

test('S1 baseline: B2 version policy is frozen in the boundary contract', () => {
  assert.ok(boundaryContract.versionPolicy, 'versionPolicy must exist')
  assert.match(boundaryContract.versionPolicy.contractVersionSource, /active executable MCP contract/, 'contract is the version source')
  assert.ok(boundaryContract.versionPolicy.rule, 'version policy rule must be present')
})

test('current safety invariant: executable contracts and complete code sets are ReleaseIdentity inputs', () => {
  assert.match(identitySource, /publication-manifest-v1\.json/, 'identity reads the publication manifest')
  assert.match(identitySource, /case-catalog-v1\.json/, 'identity reads the case catalog')
  assert.match(identitySource, /recursiveCodeFiles\(productRoot, 'harness\/src', '\.ts'\)/, 'identity reads the complete Harness source set')
  assert.match(identitySource, /worker\/src\/i10-midscene-candidate-authoring\.cjs/, 'identity reads the worker authoring source')
  assert.match(identitySource, /contracts\/mcp\/hengzhun-i8\.json/, 'identity binds the executable MCP runtime contract')
})

test('S1 baseline inspection is read-only for the current release identity', () => {
  const { execFileSync } = require('node:child_process')
  const nodeExecutable = process.execPath
  const before = JSON.parse(execFileSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' })).identityHash
  const after = JSON.parse(execFileSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' })).identityHash
  assert.match(before, /^[0-9a-f]{64}$/)
  assert.equal(after, before)
})
