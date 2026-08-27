'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const lifecycle = require('../i10-agent-lifecycle.cjs')

const productRoot = path.resolve(__dirname, '..', '..')
const IDENTITY = 'c'.repeat(64)

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-cold-rollback-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const relative of ['agent-cli/flowise-cold-rollback-v1.json', 'agent-cli/managed-process-spec-v1.json']) {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(productRoot, relative), target)
  }
  return root
}

function safeDeps(overrides = {}) {
  const calls = []
  return {
    calls,
    deps: {
      readNormalState: () => null,
      readColdState: () => null,
      observeFlowise: async () => ({ processes: [], listeners: [] }),
      normalEvidenceHash: async () => 'd'.repeat(64),
      invokeColdCommand: async (command) => {
        calls.push(command)
        if (command === 'start') return { healthy: true, action: 'STARTED' }
        if (command === 'status') return { healthy: true }
        return { status: 'STOPPED', stopped: ['harness', 'mcp', 'worker', 'flowise'] }
      },
      ...overrides,
    },
  }
}

test('separate exact authorization runs start probe stop and writes non-reusable evidence', async (t) => {
  const root = fixture(t)
  const { calls, deps } = safeDeps()
  const result = await lifecycle.executeColdRollbackDrill({
    root, expectedReleaseIdentity: IDENTITY, authorizationValue: IDENTITY, deps,
    now: () => new Date('2026-08-26T12:00:00.000Z'),
  })
  assert.deepEqual(calls, ['start', 'status', 'stop'])
  assert.equal(result.status, 'PASSED')
  assert.equal(result.profile, 'FLOWISE_COLD_ROLLBACK')
  assert.equal(result.releaseIdentityHash, IDENTITY)
  assert.equal(result.normalEvidenceUnchanged, true)
  assert.equal(result.evidenceReusableByNormalProfile, false)
  assert.equal(result.coldServicesStopped, true)
  assert.deepEqual(lifecycle.readColdRollbackEvidence(root, IDENTITY), result)
  await assert.rejects(
    lifecycle.executeColdRollbackDrill({ root, expectedReleaseIdentity: IDENTITY, authorizationValue: IDENTITY, deps }),
    (error) => error.code === 'FLOWISE_COLD_ROLLBACK_ALREADY_PROVED',
  )
})

test('wrong cold authorization fails before any lifecycle observation or command', async (t) => {
  const root = fixture(t)
  const { calls, deps } = safeDeps()
  await assert.rejects(
    lifecycle.executeColdRollbackDrill({ root, expectedReleaseIdentity: IDENTITY, authorizationValue: 'wrong', deps }),
    (error) => error.code === 'FLOWISE_COLD_ROLLBACK_NOT_AUTHORIZED',
  )
  assert.deepEqual(calls, [])
})

test('normal or pre-existing cold state blocks before start', async (t) => {
  for (const [field, code] of [
    ['readNormalState', 'FLOWISE_COLD_ROLLBACK_NORMAL_PROFILE_ACTIVE'],
    ['readColdState', 'FLOWISE_COLD_ROLLBACK_PREEXISTING_STATE'],
  ]) {
    const root = fixture(t)
    const { calls, deps } = safeDeps({ [field]: () => ({ services: [{ name: 'harness', pid: 42 }] }) })
    await assert.rejects(
      lifecycle.executeColdRollbackDrill({ root, expectedReleaseIdentity: IDENTITY, authorizationValue: IDENTITY, deps }),
      (error) => error.code === code,
    )
    assert.deepEqual(calls, [])
  }
})

test('start or probe failure always attempts exact cold stop and writes no evidence', async (t) => {
  const root = fixture(t)
  const calls = []
  const { deps } = safeDeps({ invokeColdCommand: async (command) => {
    calls.push(command)
    if (command === 'start') throw Object.assign(new Error('failed'), { code: 'COLD_START_FAILED' })
    return { status: 'STOPPED', stopped: ['harness', 'mcp', 'worker', 'flowise'] }
  } })
  await assert.rejects(
    lifecycle.executeColdRollbackDrill({ root, expectedReleaseIdentity: IDENTITY, authorizationValue: IDENTITY, deps }),
    (error) => error.code === 'COLD_START_FAILED',
  )
  assert.deepEqual(calls, ['start', 'stop'])
  assert.equal(lifecycle.readColdRollbackEvidence(root, IDENTITY), null)
})

test('cleanup failure is explicit and cannot produce recovery evidence', async (t) => {
  const root = fixture(t)
  const { deps } = safeDeps({ invokeColdCommand: async (command) => {
    if (command === 'start') return { healthy: true }
    if (command === 'status') return { healthy: true }
    throw Object.assign(new Error('stop failed'), { code: 'COLD_STOP_FAILED' })
  } })
  await assert.rejects(
    lifecycle.executeColdRollbackDrill({ root, expectedReleaseIdentity: IDENTITY, authorizationValue: IDENTITY, deps }),
    (error) => error.code === 'FLOWISE_COLD_ROLLBACK_CLEANUP_FAILED' && error.details.cleanupErrorCode === 'COLD_STOP_FAILED',
  )
  assert.equal(lifecycle.readColdRollbackEvidence(root, IDENTITY), null)
})

test('any normal-profile evidence drift fails after cold stop', async (t) => {
  const root = fixture(t)
  const hashes = ['d'.repeat(64), 'e'.repeat(64)]
  const { calls, deps } = safeDeps({ normalEvidenceHash: async () => hashes.shift() })
  await assert.rejects(
    lifecycle.executeColdRollbackDrill({ root, expectedReleaseIdentity: IDENTITY, authorizationValue: IDENTITY, deps }),
    (error) => error.code === 'FLOWISE_COLD_ROLLBACK_NORMAL_EVIDENCE_CHANGED',
  )
  assert.deepEqual(calls, ['start', 'status', 'stop'])
  assert.equal(lifecycle.readColdRollbackEvidence(root, IDENTITY), null)
})

test('cross-identity or edited evidence is rejected', (t) => {
  const root = fixture(t)
  const paths = lifecycle.coldRollbackEvidencePaths(root, IDENTITY)
  fs.mkdirSync(paths.evidenceRoot, { recursive: true })
  fs.writeFileSync(paths.evidenceFile, `${JSON.stringify({ schemaVersion: lifecycle.COLD_ROLLBACK_EVIDENCE_SCHEMA, releaseIdentityHash: IDENTITY })}\n`)
  assert.throws(() => lifecycle.readColdRollbackEvidence(root, IDENTITY), (error) => error.code === 'FLOWISE_COLD_ROLLBACK_EVIDENCE_INVALID')
  assert.equal(lifecycle.readColdRollbackEvidence(root, 'f'.repeat(64)), null)
})
