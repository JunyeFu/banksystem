'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..')
const audit = require('../scripts/i10-worker-code-set-audit.cjs')
const release = require('../scripts/i10-release-identity.cjs')
const workerCodeSet = require('../scripts/i10-worker-code-set.cjs')

const EXPECTED_GOVERNED_FILES = Object.freeze([
  'dist/harness/src/context-envelope.js',
  'dist/harness/src/errors.js',
  'dist/harness/src/i8/adapters/fuxing-bank-demo.js',
  'dist/harness/src/i8/script-package-builder.js',
  'dist/harness/src/i8/stage3-schemas.js',
  'dist/harness/src/i8/target-adapter-registry.js',
  'dist/harness/src/schemas.js',
  'dist/harness/src/utils.js',
  'worker/src/adapters/fuxing-bank-demo/account-ownership.cjs',
  'worker/src/adapters/fuxing-bank-demo/auth-rejection-recovery.cjs',
  'worker/src/adapters/fuxing-bank-demo/index.cjs',
  'worker/src/adapters/fuxing-bank-demo/login-profile.cjs',
  'worker/src/adapters/fuxing-bank-demo/verification-policy.cjs',
  'worker/src/i10-image-ingest-runner.cjs',
  'worker/src/i10-midscene-candidate-authoring.cjs',
  'worker/src/i10-onnx-ocr.cjs',
  'worker/src/i10-verification-execution.cjs',
  'worker/src/i10-verification-policy.cjs',
  'worker/src/i10-video-ingest-runner.cjs',
  'worker/src/i10-worker-utils.cjs',
  'worker/src/i8-candidate-runner.cjs',
  'worker/src/i8-formal-runner.cjs',
  'worker/src/i8-stability-runner.cjs',
  'worker/src/index.cjs',
  'worker/src/run-lease.cjs'
])

function independentlySpecifiedWorkerCodeSetHash() {
  const hash = crypto.createHash('sha256')
  for (const relativePath of EXPECTED_GOVERNED_FILES) {
    hash.update(relativePath, 'utf8').update('\0')
    hash.update(fs.readFileSync(path.resolve(productRoot, relativePath))).update('\0')
  }
  return hash.digest('hex')
}

test('RF-007-S1 freezes the complete static Worker execution import set', () => {
  const graph = audit.traceWorkerCodeSet()
  assert.deepEqual(graph.governedFiles, [...EXPECTED_GOVERNED_FILES])
  assert.deepEqual(graph.unresolved, [])
  assert.deepEqual(graph.dynamicRequires, [{ from: 'worker/src/i8-candidate-runner.cjs', count: 1 }])
})

test('RF-007-S1 aggregate hash is path-sorted, byte-exact and changes for a non-Midscene dependency', () => {
  const baseline = audit.aggregateWorkerCodeSet(EXPECTED_GOVERNED_FILES)
  const changedPath = 'worker/src/index.cjs'
  const changed = audit.aggregateWorkerCodeSet([...EXPECTED_GOVERNED_FILES].reverse(), {
    readFile(relativePath) {
      const value = fs.readFileSync(path.resolve(productRoot, relativePath))
      return relativePath === changedPath ? Buffer.concat([value, Buffer.from('\n// rf007-characterization')]) : value
    }
  })
  assert.notEqual(changed.workerCodeSetHash, baseline.workerCodeSetHash)
  assert.deepEqual(changed.files.map(item => item.path), [...EXPECTED_GOVERNED_FILES])
})

test('RF-007-S2 shared manifest matches the discovered execution closure', () => {
  const manifest = workerCodeSet.loadWorkerCodeSetManifest()
  const graph = audit.traceWorkerCodeSet()
  assert.equal(manifest.workerCodeSetVersion, 'WORKER_CODE_SET_V1')
  assert.deepEqual(manifest.files, [...EXPECTED_GOVERNED_FILES])
  assert.deepEqual(graph.governedFiles, manifest.files)
  assert.equal(workerCodeSet.currentWorkerCodeSet().workerCodeSetHash, independentlySpecifiedWorkerCodeSetHash())
})

test('RF-007-S2 ReleaseIdentity binds WorkerCodeSet V1 while preserving the legacy field', () => {
  const identity = release.currentReleaseIdentity({ requireDeployed: false })
  const legacySingleFile = crypto.createHash('sha256')
    .update(fs.readFileSync(path.resolve(productRoot, 'worker/src/i10-midscene-candidate-authoring.cjs')))
    .digest('hex')
  assert.equal(identity.schemaVersion, 'hengzhun-i10-release-identity-v3')
  assert.equal(identity.workerCodeHash, legacySingleFile)
  assert.equal(identity.workerCodeSetVersion, 'WORKER_CODE_SET_V1')
  assert.equal(identity.workerCodeSetFileCount, EXPECTED_GOVERNED_FILES.length)
  assert.equal(identity.workerCodeSetHash, independentlySpecifiedWorkerCodeSetHash())
  assert.match(identity.workerCodeSetManifestHash, /^[0-9a-f]{64}$/)
})

test('RF-007-S2 historical identities remain readable but never compare equal across schemas', () => {
  const historicalLeft = { schemaVersion: 'hengzhun-i10-release-identity-v1', identityHash: 'a'.repeat(64) }
  const historicalRight = { ...historicalLeft }
  const current = { schemaVersion: 'hengzhun-i10-release-identity-v3', identityHash: historicalLeft.identityHash }
  assert.equal(release.sameReleaseIdentity(historicalLeft, historicalRight), true)
  assert.equal(release.sameReleaseIdentity(historicalLeft, current), false)
  assert.equal(release.sameReleaseIdentity(current, { ...current }), true)
})

test('RF-007-S2 readiness projection fails closed on version or hash drift', () => {
  const expected = workerCodeSet.currentWorkerCodeSet()
  const aligned = workerCodeSet.compareWorkerCodeSetHealth(expected, {
    workerCodeSetVersion: expected.workerCodeSetVersion,
    workerCodeSetHash: expected.workerCodeSetHash
  })
  assert.equal(aligned.versionMatch, true)
  assert.equal(aligned.hashMatch, true)
  assert.equal(aligned.ready, true)
  assert.equal(workerCodeSet.compareWorkerCodeSetHealth(expected, { workerCodeSetVersion: 'OTHER', workerCodeSetHash: expected.workerCodeSetHash }).ready, false)
  assert.equal(workerCodeSet.compareWorkerCodeSetHealth(expected, { workerCodeSetVersion: expected.workerCodeSetVersion, workerCodeSetHash: '0'.repeat(64) }).ready, false)
  assert.equal(workerCodeSet.compareWorkerCodeSetHealth(expected, {}).ready, false)
  assert.throws(() => workerCodeSet.assertExactMembership(EXPECTED_GOVERNED_FILES, [...EXPECTED_GOVERNED_FILES, 'worker/src/unregistered.cjs']), error => error.code === 'I10_WORKER_CODE_SET_GRAPH_DRIFT')
  assert.throws(() => workerCodeSet.assertExactMembership(EXPECTED_GOVERNED_FILES, EXPECTED_GOVERNED_FILES.slice(1)), error => error.code === 'I10_WORKER_CODE_SET_GRAPH_DRIFT')
})

test('RF-007-S2 Worker writes health v2 with the shared code-set identity', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rf007-worker-health-'))
  const healthFile = path.join(temporaryRoot, 'worker-health.json')
  const stopFile = path.join(temporaryRoot, 'stop')
  fs.writeFileSync(stopFile, '')
  try {
    childProcess.execFileSync(process.execPath, [path.resolve(productRoot, 'worker/src/index.cjs'), '--once'], {
      cwd: productRoot,
      env: {
        ...process.env,
        HENGZHUN_WORKER_TOKEN: 'contract-test-token'.padEnd(32, 'x'),
        HENGZHUN_WORKER_HEALTH_FILE: healthFile,
        HENGZHUN_STOP_FILE: stopFile
      },
      stdio: 'pipe',
      timeout: 10_000
    })
    const health = JSON.parse(fs.readFileSync(healthFile, 'utf8'))
    const expected = workerCodeSet.currentWorkerCodeSet()
    assert.equal(health.schemaVersion, 'hengzhun-worker-health-v2')
    assert.equal(health.status, 'STOPPED')
    assert.equal(health.workerCodeSetVersion, expected.workerCodeSetVersion)
    assert.equal(health.workerCodeSetHash, expected.workerCodeSetHash)
    assert.equal(health.workerCodeVersion, expected.workerCodeSetHash)
    assert.equal(health.workerCodeSetFileCount, EXPECTED_GOVERNED_FILES.length)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('RF-007-S2 lifecycle Worker fingerprint is the shared WorkerCodeSet hash', () => {
  const lifecycle = require('../scripts/i9-lifecycle.cjs')
  assert.equal(lifecycle.serviceFingerprint('worker'), workerCodeSet.currentWorkerCodeSet().workerCodeSetHash)
})

test('RF-007-S2 Harness readiness exposes shared identity and compatibility fields', () => {
  const { projectWorkerCodeSetReadiness } = require('../dist/harness/src/server.js')
  const expected = workerCodeSet.currentWorkerCodeSet()
  const aligned = projectWorkerCodeSetReadiness(productRoot, {
    status: 'HEALTHY',
    workerCodeSetVersion: expected.workerCodeSetVersion,
    workerCodeSetHash: expected.workerCodeSetHash,
    updatedAt: '2026-08-03T00:00:00.000Z'
  })
  assert.equal(aligned.codeSetReady, true)
  assert.equal(aligned.versionMatch, true)
  assert.equal(aligned.hashMatch, true)
  assert.equal(aligned.expectedWorkerCodeSetHash, expected.workerCodeSetHash)
  assert.equal(aligned.observedWorkerCodeSetHash, expected.workerCodeSetHash)
  assert.equal(aligned.expectedCodeVersion, expected.workerCodeSetHash)
  assert.equal(aligned.observedCodeVersion, expected.workerCodeSetHash)
  assert.equal(projectWorkerCodeSetReadiness(productRoot).codeSetReady, false)
  assert.equal(projectWorkerCodeSetReadiness(productRoot, { workerCodeVersion: expected.workerCodeSetHash }).codeSetReady, false)
})

test('RF-007-S3 migration identity ignores CRLF transport but rejects semantic drift', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rf007-migration-eol-'))
  const migrationsDirectory = path.join(temporaryRoot, 'migrations')
  const databasePath = path.join(temporaryRoot, 'data', 'regression.sqlite')
  const backupDirectory = path.join(temporaryRoot, 'backups')
  const migrationPath = path.join(migrationsDirectory, '001_contract.sql')
  const lfSql = [
    'CREATE TABLE portable_contract (',
    '  id INTEGER PRIMARY KEY,',
    '  value TEXT NOT NULL',
    ') STRICT;',
    ''
  ].join('\n')
  fs.mkdirSync(migrationsDirectory, { recursive: true })
  fs.writeFileSync(migrationPath, lfSql, 'utf8')
  const { HarnessDatabase } = require('../dist/harness/src/database.js')
  const options = { databasePath, migrationsDirectory, backupDirectory }
  let database
  try {
    database = await HarnessDatabase.open(options)
    await database.close()
    database = undefined

    fs.writeFileSync(migrationPath, lfSql.replaceAll('\n', '\r\n'), 'utf8')
    database = await HarnessDatabase.open(options)
    await database.close()
    database = undefined

    fs.writeFileSync(migrationPath, `${lfSql}\nCREATE TABLE semantic_drift (id INTEGER PRIMARY KEY) STRICT;\n`, 'utf8')
    await assert.rejects(HarnessDatabase.open(options), /MIGRATION_DRIFT: 001_contract\.sql/)
  } finally {
    if (database) await database.close()
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('RF-007-S3 cross-session recovery routes terminal authoring failure instead of polling forever', () => {
  const flow = JSON.parse(fs.readFileSync(path.resolve(productRoot, 'flowise/i10/agentflow-v7.json'), 'utf8'))
  const routeId = 'conditionAgentflow_i10_v4_cross_session_route'
  const route = flow.nodes.find(node => node.id === routeId)
  assert.ok(route, 'cross-session route must exist')
  assert.ok(route.data.inputs.conditions.some(condition =>
    condition.value1 === '{{$flow.state.journeyStatus}}' &&
    condition.operation === 'equal' &&
    condition.value2 === 'FAILED'
  ), 'terminal FAILED journey must be a first-class route')

  const failureReplyId = 'directReplyAgentflow_i10_v7_cross_session_authoring_failed'
  const failureReply = flow.nodes.find(node => node.id === failureReplyId)
  assert.ok(failureReply, 'terminal authoring failure must have a user-visible reply')
  assert.match(String(failureReply.data.inputs.directReplyMessage || ''), /作者化已失败/)

  assert.ok(flow.edges.some(edge =>
    edge.source === routeId && edge.sourceHandle === `${routeId}-output-8` &&
    edge.target === 'toolAgentflow_i10_v7_cross_session_failure_task_get'
  ), 'FAILED execution must enter the independent governed repair subgraph')
  assert.ok(flow.edges.some(edge =>
    edge.source === routeId && edge.sourceHandle === `${routeId}-output-9` && edge.target === failureReplyId
  ), 'terminal authoring failure must route to the user-visible failure reply')
  assert.ok(flow.edges.some(edge =>
    edge.source === routeId && edge.sourceHandle === `${routeId}-output-10` &&
    edge.target === 'directReplyAgentflow_i10_v6_cross_session_authoring_processing'
  ), 'only the unmatched default route may report authoring processing')
  const routeEdges = flow.edges.filter(edge => edge.source === routeId)
  assert.equal(routeEdges.length, 11, 'eight existing actions, execution repair, authoring failure and default routes must all remain')
  assert.equal(new Set(routeEdges.map(edge => edge.sourceHandle)).size, routeEdges.length,
    'a condition output must never execute two business branches')
})

test('RF-007-S3 lifecycle accepts current Worker health v2 and rejects code-set drift', () => {
  const lifecycle = require('../scripts/i9-lifecycle.cjs')
  const expected = workerCodeSet.currentWorkerCodeSet()
  const now = Date.parse('2026-08-03T14:45:00.000Z')
  const record = { pid: 4321, runtimeFingerprint: expected.workerCodeSetHash }
  const health = {
    schemaVersion: 'hengzhun-worker-health-v2',
    status: 'HEALTHY',
    pid: 4321,
    workerCodeSetVersion: expected.workerCodeSetVersion,
    workerCodeSetHash: expected.workerCodeSetHash,
    updatedAt: '2026-08-03T14:44:59.000Z'
  }
  assert.equal(lifecycle.workerHealthPayloadCurrent(health, record, now), true)
  assert.equal(lifecycle.workerHealthPayloadCurrent({ ...health, workerCodeSetHash: '0'.repeat(64) }, record, now), false)
  assert.equal(lifecycle.workerHealthPayloadCurrent({ ...health, workerCodeSetVersion: 'OTHER' }, record, now), false)
})
