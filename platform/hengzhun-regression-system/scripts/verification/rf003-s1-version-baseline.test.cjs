'use strict'

// RF-003-S1: version contract archaeology baseline (zero code changes).
// Freezes the three-source version drift as machine-checkable assertions
// (reverse anchors for S2 unification): MCP SDK registration 8.0.0 vs
// health endpoint 10.0.0 vs runtime contract 10.1.0. Also verifies the
// safety premise of the unification plan: the runtime contract file is NOT
// part of the ReleaseIdentity inputs.

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

test('S1 baseline: the three version sources are drifting (SDK 8.0.0 / health 10.0.0 / contract 10.1.0)', () => {
  const sdkVersion = serverSource.match(/new McpServer\(\{ name: 'hengzhun-i10-regression', version: '([0-9.]+)' \}\)/)?.[1]
  const healthVersion = serverSource.match(/version: '([0-9.]+)',\n\s*rf001Shadow/)?.[1] || serverSource.match(/'10\.0\.0'/)?.[0]?.replace(/'/g, '')
  assert.equal(sdkVersion, '8.0.0', 'S1 baseline: SDK registration must still be 8.0.0')
  assert.equal(healthVersion, '10.0.0', 'S1 baseline: health endpoint must still be 10.0.0')
  assert.equal(runtimeContract.contractVersion, '10.1.0', 'S1 baseline: runtime contract must still be 10.1.0')
  const sources = [sdkVersion, healthVersion, runtimeContract.contractVersion]
  assert.equal(new Set(sources).size, 3, 'S1 baseline: the three sources must be mutually distinct (drift)')
})

test('S1 baseline: B2 version policy is frozen in the boundary contract', () => {
  assert.ok(boundaryContract.versionPolicy, 'versionPolicy must exist')
  assert.match(boundaryContract.versionPolicy.contractVersionSource, /active executable MCP contract/, 'contract is the version source')
  assert.ok(boundaryContract.versionPolicy.rule, 'version policy rule must be present')
})

test('S1 safety premise: the runtime contract is not a ReleaseIdentity input', () => {
  // identity inputs come from publication-manifest, the agentflow flow path,
  // the case catalog, harness service and worker authoring source
  assert.match(identitySource, /publication-manifest-v1\.json/, 'identity reads the publication manifest')
  assert.match(identitySource, /case-catalog-v1\.json/, 'identity reads the case catalog')
  assert.match(identitySource, /harness\/src\/i10\/service\.ts/, 'identity reads the harness service source')
  assert.match(identitySource, /worker\/src\/i10-midscene-candidate-authoring\.cjs/, 'identity reads the worker authoring source')
  assert.doesNotMatch(identitySource, /contracts\/mcp\/hengzhun-i8\.json/, 'identity must NOT read the MCP runtime contract (version unification is identity-safe)')
})

test('S1 baseline: release identity stays at the frozen baseline', () => {
  const { execFileSync } = require('node:child_process')
  const nodeExecutable = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
  const run = execFileSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(JSON.parse(run).identityHash, '632ad5ee7981b59f00824d0072d28da6075eef095d55a898d51c0103a897988f')
})
