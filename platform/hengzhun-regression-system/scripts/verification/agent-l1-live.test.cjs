'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const l1 = require('../i10-agent-l1-live.cjs')

const IDENTITY = 'a'.repeat(64)

function baseDeps(calls, variantResult = (variant) => ({ variant, status: 'PASSED', releaseIdentityHash: IDENTITY, evidenceRef: `evidence:${variant}` })) {
  return {
    authorizedIdentity: () => ({ identityHash: IDENTITY, releaseStatus: 'FROZEN' }),
    doctor: () => ({ status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true }),
    start: async () => { calls.push('start'); return { releaseIdentityHash: IDENTITY } },
    publicReadback: async () => { calls.push('readback'); return { releaseIdentityHash: IDENTITY } },
    currentIdentity: async () => ({ identityHash: IDENTITY }),
    runVariant: async ({ variant }) => { calls.push(variant); return variantResult(variant) },
    stop: async () => { calls.push('stop'); return { status: 'STOPPED' } },
  }
}

test('L1 runs public readback then TEXT_ONLY and TEXT_WITH_IMAGE on one identity', async () => {
  const calls = []
  const result = await l1.executeOrderedL1({ deps: baseDeps(calls) })
  assert.equal(result.status, 'PASSED')
  assert.equal(result.full18Claim, false)
  assert.deepEqual(result.results.map((item) => item.variant), ['TEXT_ONLY', 'TEXT_WITH_IMAGE'])
  assert.deepEqual(calls, ['start', 'readback', 'TEXT_ONLY', 'TEXT_WITH_IMAGE', 'stop'])
})

test('first deterministic failure stops immediately and never executes the image variant', async () => {
  const calls = []
  await assert.rejects(l1.executeOrderedL1({ deps: baseDeps(calls, (variant) => ({ variant, status: 'FAILED', releaseIdentityHash: IDENTITY })) }),
    (error) => error.code === 'AGENT_L1_VARIANT_FAILED' && error.details.variant === 'TEXT_ONLY')
  assert.deepEqual(calls, ['start', 'readback', 'TEXT_ONLY', 'stop'])
})

test('public identity mismatch blocks every variant and still stops owned services', async () => {
  const calls = []
  const deps = baseDeps(calls)
  deps.publicReadback = async () => { calls.push('readback'); return { releaseIdentityHash: 'b'.repeat(64) } }
  await assert.rejects(l1.executeOrderedL1({ deps }), (error) => error.code === 'AGENT_L1_PUBLIC_IDENTITY_MISMATCH')
  assert.deepEqual(calls, ['start', 'readback', 'stop'])
})

test('preflight failure performs no lifecycle or variant mutation', async () => {
  const calls = []
  const deps = baseDeps(calls)
  deps.doctor = () => ({ status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: false })
  await assert.rejects(l1.executeOrderedL1({ deps }), (error) => error.code === 'AGENT_L1_PREFLIGHT_NOT_READY')
  assert.deepEqual(calls, [])
})

test('checkpointed run exposes one exact approval without auto-approving it', async () => {
  const calls = []
  let written
  const deps = baseDeps(calls)
  Object.assign(deps, {
    readCheckpoint: () => null,
    writeCheckpoint: (value) => { written = value },
    invoke: async ({ args }) => {
      calls.push(args[0] === 'run' && args.includes('--attach') ? 'invoke-image' : 'invoke-text')
      return { exitCode: 20, events: [{ type: 'APPROVAL_REQUIRED', sessionId: 'session-12345678', journeyId: 'journey-12345678', proposal: {
        proposalId: 'proposal-12345678', contentHash: 'c'.repeat(64), risk: 'LOW', expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Create Journey.',
      } }] }
    },
  })
  const result = await l1.runCheckpointedL1({ environment: {
    HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\l1-text.txt', HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE: 'D:\\l1-image.txt',
    HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE: 'D:\\l1-image.png',
  }, deps })
  assert.equal(result.status, 'AWAITING_APPROVAL')
  assert.equal(written.pending.contentHash, 'c'.repeat(64))
  assert.deepEqual(calls, ['start', 'readback', 'invoke-text', 'stop'])
})

test('exact approval can complete text then advance only to the image approval', async () => {
  const calls = []
  let written
  const pending = {
    sessionId: 'session-12345678', journeyId: 'journey-12345678', proposalId: 'proposal-12345678',
    contentHash: 'c'.repeat(64), risk: 'LOW', expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Create Journey.',
  }
  const state = { ...l1.safeCheckpoint(IDENTITY, 'TEXT_ONLY'), status: 'AWAITING_APPROVAL', pending }
  const deps = baseDeps(calls)
  Object.assign(deps, {
    readCheckpoint: () => state, writeCheckpoint: (value) => { written = value },
    invoke: async ({ args }) => {
      if (args[0] === 'resume') {
        calls.push('resume-text')
        return { exitCode: 0, events: [{ type: 'RESPONSE', status: 'COMPLETED', sessionId: pending.sessionId, journeyId: pending.journeyId }] }
      }
      calls.push('invoke-image')
      return { exitCode: 20, events: [{ type: 'APPROVAL_REQUIRED', sessionId: 'session-image1', journeyId: 'journey-image1', proposal: {
        proposalId: 'proposal-image1', contentHash: 'd'.repeat(64), risk: 'MEDIUM', expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Submit image case.',
      } }] }
    },
  })
  const result = await l1.runCheckpointedL1({ command: 'approve', sessionId: pending.sessionId, proposalId: pending.proposalId, contentHash: pending.contentHash,
    environment: { HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\l1-text.txt', HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE: 'D:\\l1-image.txt', HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE: 'D:\\l1-image.png' }, deps })
  assert.equal(result.status, 'AWAITING_APPROVAL')
  assert.equal(result.variant, 'TEXT_WITH_IMAGE')
  assert.deepEqual(written.results.map((item) => item.variant), ['TEXT_ONLY'])
  assert.deepEqual(calls, ['start', 'readback', 'resume-text', 'invoke-image', 'stop'])
})

test('approval tuple mismatch fails before starting services', async () => {
  const calls = []
  const state = { ...l1.safeCheckpoint(IDENTITY, 'TEXT_ONLY'), status: 'AWAITING_APPROVAL', pending: {
    sessionId: 'session-12345678', proposalId: 'proposal-12345678', contentHash: 'c'.repeat(64),
  } }
  const deps = baseDeps(calls)
  deps.readCheckpoint = () => state
  await assert.rejects(l1.runCheckpointedL1({ command: 'approve', sessionId: state.pending.sessionId, proposalId: state.pending.proposalId,
    contentHash: 'd'.repeat(64), deps }), (error) => error.code === 'AGENT_L1_APPROVAL_IDENTITY_MISMATCH')
  assert.deepEqual(calls, [])
})
