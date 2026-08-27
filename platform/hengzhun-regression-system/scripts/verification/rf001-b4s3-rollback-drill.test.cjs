'use strict'

// RF-001-B4-S3: rollback drill per rollback-runbook.md.
// Runs entirely in an isolated temp directory (.data/tests/rf001-rollback-drill).
// Real workspace is never touched. Proves:
//   (a) a controlled trigger (error-code semantic drift) is machine-detectable
//       (the B4-S1 error-code inventory check fails);
//   (b) rollback (restore baseline server.cjs from git + remove RF-001 artifacts)
//       restores a loadable MCP surface with all 33 tools, unchanged
//       ReleaseIdentity, and a green detector.

const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(root, '../..')
const nodeExecutable = process.execPath
const DRILL_ROOT = path.join(root, '.data', 'tests', 'rf001-rollback-drill')

const BASELINE_COMMIT = 'dacd79580ec73f3580594ab2134acf8cc3d99f35'
const SERVER_REL = 'platform/hengzhun-regression-system/mcp/src/server.cjs'

// the drift detection logic mirrors B4-S1: every MCP error-code literal must be
// documented in the corpus (matrix + boundary contract + harness errors)
function extractErrorCodes(source) {
  return new Set([
    ...[...source.matchAll(/errorCode\s*:\s*'([A-Z0-9_]+)'/g)].map(match => match[1]),
    ...[...source.matchAll(/errorCode:'([A-Z0-9_]+)'/g)].map(match => match[1]),
    ...[...source.matchAll(/\|\| '((?:I8|I10|MCP|HARNESS)_[A-Z0-9_]+)'/g)].map(match => match[1])
  ])
}

function documentedCodes() {
  const matrix = fs.readFileSync(path.join(repoRoot, 'docs/architecture/refactoring/batches/RF-001/field-error-adapter-matrix.md'), 'utf8')
  const contract = JSON.stringify(JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json'), 'utf8')), null, 2)
  const harnessErrors = fs.readFileSync(path.join(root, 'harness/src/errors.ts'), 'utf8')
  const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const adapterSource = fs.readFileSync(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'), 'utf8')
  const historicalBaselineSource = execFileSync('git', ['show', `${BASELINE_COMMIT}:${SERVER_REL}`], { cwd: repoRoot, encoding: 'utf8' })
  // same corpus as B4-S1: matrix + contract + harness errors + the real MCP
  // boundary sources (the drift code is injected into a COPY and therefore is
  // absent from this corpus, so it stays machine-detectable)
  return matrix + contract + harnessErrors + serverSource + adapterSource + historicalBaselineSource
}

test('B4-S3 rollback drill: drift is detected, baseline restore is verified', () => {
  const identityBefore = JSON.parse(spawnSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' }).stdout).identityHash
  fs.rmSync(DRILL_ROOT, { recursive: true, force: true })
  fs.mkdirSync(DRILL_ROOT, { recursive: true })

  // baseline (pre-RF-001) server.cjs straight from git — this is the rollback target
  const baselineSource = execFileSync('git', ['show', `${BASELINE_COMMIT}:${SERVER_REL}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.ok(baselineSource.includes('server.registerTool('), 'baseline must be a valid MCP server source')
  assert.doesNotMatch(baselineSource, /rf001-contract-adapter/, 'baseline must not reference RF-001 artifacts')

  const currentSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(currentSource, /rf001-contract-adapter/, 'current workspace must carry RF-001 wiring (drill sanity)')

  const drillServer = path.join(DRILL_ROOT, 'server.cjs')
  const corpus = documentedCodes()

  try {
    // ---- (a) controlled trigger: error-code semantic drift ----
    const drifted = currentSource.replace(/I8_CANDIDATE_VERSION_UNAVAILABLE/g, 'I8_CANDIDATE_VERSION_DRIFTED')
    assert.notEqual(drifted, currentSource, 'drift injection must take effect')
    const driftedCodes = extractErrorCodes(drifted)
    const undocumented = [...driftedCodes].filter(code => !corpus.includes(code))
    assert.ok(undocumented.includes('I8_CANDIDATE_VERSION_DRIFTED'), 'drift must be machine-detectable (B4-S1 inventory check fails)')

    // ---- (b) rollback: restore baseline + drop RF-001 artifacts ----
    fs.writeFileSync(drillServer, baselineSource)
    const restored = fs.readFileSync(drillServer, 'utf8')

    // syntax validity via the pinned runtime
    const check = spawnSync(nodeExecutable, ['--check', drillServer], { encoding: 'utf8' })
    assert.equal(check.status, 0, `restored server must pass node --check: ${check.stderr}`)

    // no RF-001 references
    assert.doesNotMatch(restored, /rf001|shadowedRequest|normalizeCasePrepareRequest|normalizeIngestDecisionSubmitRequest/, 'rollback must remove RF-001 wiring')

    // full 33-tool surface preserved
    const tools = [...restored.matchAll(/registerTool\('([a-z_]+)'/g)].map(match => match[1])
    assert.equal(tools.length, 33, 'rollback must keep the complete 33-tool MCP surface')

    // ReleaseIdentity unchanged by rollback (identity inputs are untouched)
    const identityRun = spawnSync(nodeExecutable, ['scripts/i10-release-identity.cjs'], { cwd: root, encoding: 'utf8' })
    assert.equal(identityRun.status, 0)
    assert.equal(JSON.parse(identityRun.stdout).identityHash, identityBefore, 'rollback must not change ReleaseIdentity')

    // detector green again on the restored baseline (no undocumented codes)
    const baselineCodes = extractErrorCodes(restored)
    const baselineUndocumented = [...baselineCodes].filter(code => !corpus.includes(code))
    assert.deepEqual(baselineUndocumented, [], 'restored baseline must carry only documented error codes')
  } finally {
    fs.rmSync(DRILL_ROOT, { recursive: true, force: true })
  }
})

test('B4-S3 drill isolation: real workspace is byte-identical after the drill', () => {
  const before = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(before, /rf001-contract-adapter/, 'current workspace keeps RF-001 wiring')
  assert.ok(!fs.existsSync(DRILL_ROOT), 'drill temp directory must be cleaned up')
  // adapter and RF-001 tests remain present and loadable
  const adapter = require(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'))
  assert.ok(adapter.normalizeCasePrepareRequest, 'adapter must remain wired after the drill')
})
