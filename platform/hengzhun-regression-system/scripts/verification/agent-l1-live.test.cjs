'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const l1 = require('../i10-agent-l1-live.cjs')

const IDENTITY = 'a'.repeat(64)
const INPUTS = { sha256: 'e'.repeat(64), files: [{ variant: 'TEXT_ONLY', textHash: 'f'.repeat(64) }] }
function verified(journeyId = 'journey-12345678') {
  return { schemaVersion: 'hengzhun-cli-evidence-verification/v1', verdict: 'VERIFIED', journeyId,
    releaseIdentityHash: IDENTITY, journeyTerminal: true, runStatus: 'PASSED', taskStatus: 'SUCCEEDED', runId: 'run-12345678', taskId: 'task-12345678',
    artifacts: ['DOM', 'SCREENSHOT', 'TRACE', 'NETWORK', 'LEDGER'].map(evidenceKind => ({ evidenceKind, artifactId: `artifact-${evidenceKind}`, sha256: 'b'.repeat(64), size: 12, sha256Verified: true, sizeVerified: true })) }
}

function baseDeps(calls, variantResult = (variant) => ({ variant, status: 'PASSED', releaseIdentityHash: IDENTITY, journeyId: `journey-${variant}` })) {
  return {
    authorizedIdentity: () => ({ identityHash: IDENTITY, releaseStatus: 'FROZEN' }),
    doctor: () => ({ status: 'READY', profile: 'NORMAL_CLI', flowiseAbsent: true }),
    start: async () => { calls.push('start'); return { releaseIdentityHash: IDENTITY } },
    publicReadback: async () => { calls.push('readback'); return { releaseIdentityHash: IDENTITY } },
    currentIdentity: async () => ({ identityHash: IDENTITY }),
    captureInputContract: () => INPUTS,
    verifyEvidence: async ({ journeyId }) => verified(journeyId),
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

test('an explicitly rejected checkpoint permits one fresh text proposal', async () => {
  const calls = []
  let written
  const state = { ...l1.safeCheckpoint(IDENTITY, 'TEXT_ONLY'), inputContract: INPUTS, status: 'REJECTED', pending: null }
  const deps = baseDeps(calls)
  Object.assign(deps, {
    readCheckpoint: () => state,
    writeCheckpoint: value => { written = value },
    invoke: async () => ({ exitCode: 20, events: [{ type: 'APPROVAL_REQUIRED', sessionId: 'session-fresh123', journeyId: 'journey-fresh123', proposal: {
      proposalId: 'proposal-fresh123', contentHash: 'd'.repeat(64), risk: 'LOW', expiresAt: '2026-09-21T04:30:00.000Z', summary: 'Create Journey.',
    } }] }),
  })
  const result = await l1.runCheckpointedL1({ environment: {
    HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\l1-text.txt', HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE: 'D:\\l1-image.txt',
    HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE: 'D:\\l1-image.png',
  }, deps })
  assert.equal(result.status, 'AWAITING_APPROVAL')
  assert.equal(written.pending.proposalId, 'proposal-fresh123')
  assert.deepEqual(calls, ['start', 'readback', 'stop'])
})

test('exact approval can complete text then advance only to the image approval', async () => {
  const calls = []
  let written
  const pending = {
    sessionId: 'session-12345678', journeyId: 'journey-12345678', proposalId: 'proposal-12345678',
    contentHash: 'c'.repeat(64), risk: 'LOW', expiresAt: '2026-08-26T21:00:00.000Z', summary: 'Create Journey.',
  }
  const state = { ...l1.safeCheckpoint(IDENTITY, 'TEXT_ONLY'), inputContract: INPUTS, status: 'AWAITING_APPROVAL', pending }
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

test('a completed CLI response is only awaiting authoritative evidence', () => {
  assert.equal(l1.classifyHeadless({ exitCode: 0, events: [{ type: 'RESPONSE', status: 'COMPLETED', journeyId: 'journey-12345678' }] }, 'TEXT_ONLY', IDENTITY).status, 'AWAITING_EVIDENCE')
})

test('production verification uses the public CLI evidence verify command and rejects its failure exit', t => {
  const childProcess = require('node:child_process')
  const spawn = t.mock.method(childProcess, 'spawnSync', (_executable, args) => {
    assert.deepEqual(args.slice(1), ['evidence', 'verify', 'journey-12345678', '--jsonl'])
    return { status: 0, stdout: JSON.stringify({ type: 'COMMAND_RESULT', result: verified() }) }
  })
  assert.equal(l1.verifyJourneyEvidence({ root: path.resolve(__dirname, '../..'), environment: {}, journeyId: 'journey-12345678' }).verdict, 'VERIFIED')
  spawn.mock.mockImplementation(() => ({ status: 5, stdout: JSON.stringify({ type: 'ERROR', messageCode: 'I10_EVIDENCE_KIND_MISSING' }) }))
  assert.throws(() => l1.verifyJourneyEvidence({ root: path.resolve(__dirname, '../..'), environment: {}, journeyId: 'journey-12345678' }), error => error.code === 'AGENT_L1_EVIDENCE_VERIFY_FAILED')
})

for (const [name, corrupt, code] of [
  ['missing kind', value => { value.artifacts.pop() }, 'AGENT_L1_ARTIFACT_VERIFICATION_FAILED'],
  ['hash mismatch', value => { value.artifacts[0].sha256Verified = false }, 'AGENT_L1_ARTIFACT_VERIFICATION_FAILED'],
  ['size mismatch', value => { value.artifacts[0].sizeVerified = false }, 'AGENT_L1_ARTIFACT_VERIFICATION_FAILED'],
  ['different identity', value => { value.releaseIdentityHash = 'c'.repeat(64) }, 'AGENT_L1_EVIDENCE_IDENTITY_MISMATCH'],
  ['different Journey', value => { value.journeyId = 'journey-other123' }, 'AGENT_L1_TERMINAL_EVIDENCE_REQUIRED'],
  ['nonterminal task', value => { value.taskStatus = 'RUNNING' }, 'AGENT_L1_TERMINAL_EVIDENCE_REQUIRED'],
]) {
  test(`${name} stops the checkpointed text chain without image or PASS persistence`, async () => {
    const calls = []
    let written
    const deps = { ...baseDeps(calls), readCheckpoint: () => null, writeCheckpoint: state => { written = state },
      invoke: async () => { calls.push('invoke-text'); return { exitCode: 0, events: [{ type: 'RESPONSE', status: 'COMPLETED', journeyId: 'journey-12345678' }] } },
      verifyEvidence: async () => { const value = verified(); corrupt(value); return value },
      persistEvidence: () => assert.fail('invalid evidence must never persist PASS'),
    }
    await assert.rejects(l1.runCheckpointedL1({ environment: { HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\test.txt' }, deps }), error => error.code === code)
    assert.equal(written.status, 'FAILED')
    assert.equal(written.results.length, 0)
    assert.deepEqual(calls, ['start', 'readback', 'invoke-text', 'stop'])
  })
}

test('old identity checkpoint is archived before a fresh current-identity proposal', async () => {
  const calls = []
  const deps = { ...baseDeps(calls), readCheckpoint: () => ({ ...l1.safeCheckpoint('b'.repeat(64), 'TEXT_WITH_IMAGE'), status: 'PASSED' }) }
  deps.archiveStaleCheckpoint = (_root, state) => { calls.push(`archive-${state.status}`) }
  deps.invoke = async () => ({ exitCode: 20, events: [{ type: 'APPROVAL_REQUIRED', sessionId: 'session-current1', journeyId: 'journey-current1', proposal: {
    proposalId: 'proposal-current1', contentHash: 'd'.repeat(64), risk: 'LOW', expiresAt: '2026-09-21T05:00:00.000Z', summary: 'Create Journey.',
  } }] })
  assert.equal((await l1.runCheckpointedL1({ environment: {
    HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\l1-text.txt', HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE: 'D:\\l1-image.txt',
    HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE: 'D:\\l1-image.png',
  }, deps })).status, 'AWAITING_APPROVAL')
  assert.deepEqual(calls, ['archive-PASSED', 'start', 'readback', 'stop'])
})

test('old identity cannot be approved or rejected across the identity fence', async () => {
  const calls = []
  const pending = { sessionId: 'session-old1234', proposalId: 'proposal-old1234', contentHash: 'c'.repeat(64) }
  const deps = { ...baseDeps(calls), readCheckpoint: () => ({ ...l1.safeCheckpoint('b'.repeat(64), 'TEXT_ONLY'), status: 'AWAITING_APPROVAL', pending }) }
  await assert.rejects(l1.runCheckpointedL1({ command: 'reject', ...pending, deps }), error => error.code === 'AGENT_L1_CHECKPOINT_IDENTITY_MISMATCH')
  assert.deepEqual(calls, [])
})

test('source identity drift after text verification stops before invoking the image', async () => {
  const calls = []
  let written
  const deps = { ...baseDeps(calls), readCheckpoint: () => null, writeCheckpoint: state => { written = state },
    currentIdentity: async () => ({ identityHash: 'b'.repeat(64) }),
    invoke: async () => { calls.push('invoke-text'); return { exitCode: 0, events: [{ type: 'RESPONSE', status: 'COMPLETED', journeyId: 'journey-12345678' }] } },
  }
  await assert.rejects(l1.runCheckpointedL1({ environment: { HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\text.txt' }, deps }), error => error.code === 'AGENT_L1_RELEASE_IDENTITY_MISMATCH')
  assert.equal(written.status, 'FAILED')
  assert.deepEqual(calls, ['start', 'readback', 'invoke-text', 'stop'])
})

test('same-identity cached PASS is reverified and cannot hide artifact tampering', async () => {
  const calls = []
  const state = { ...l1.safeCheckpoint(IDENTITY, 'TEXT_WITH_IMAGE'), status: 'PASSED', inputContract: INPUTS,
    results: ['TEXT_ONLY', 'TEXT_WITH_IMAGE'].map(variant => ({ variant, status: 'PASSED', journeyId: `journey-${variant}`, verification: verified(`journey-${variant}`) })) }
  const deps = { ...baseDeps(calls), readCheckpoint: () => state }
  assert.equal((await l1.runCheckpointedL1({ deps })).status, 'ALREADY_PASSED')
  deps.verifyEvidence = async () => { throw new Error('ARTIFACT_TAMPERED') }
  await assert.rejects(l1.runCheckpointedL1({ deps }), /ARTIFACT_TAMPERED/)
  assert.equal(state.status, 'PASSED') // Historical checkpoint is not rewritten.
  assert.deepEqual(calls, ['start', 'readback', 'stop', 'start', 'readback', 'stop'])
})

test('input drift rejects an exact pending approval before runtime starts', async () => {
  const calls = []
  const pending = { sessionId: 'session-12345678', proposalId: 'proposal-12345678', contentHash: 'c'.repeat(64) }
  const state = { ...l1.safeCheckpoint(IDENTITY, 'TEXT_ONLY'), status: 'AWAITING_APPROVAL', inputContract: { ...INPUTS, sha256: '0'.repeat(64) }, pending }
  await assert.rejects(l1.runCheckpointedL1({ command: 'approve', ...pending, deps: { ...baseDeps(calls), readCheckpoint: () => state } }), error => error.code === 'AGENT_L1_INPUT_CONTRACT_MISMATCH')
  assert.deepEqual(calls, [])
})

test('input contract hashes actual text and image bytes without exposing their paths or contents', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rf047-inputs-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const textFile = path.join(directory, 'text.txt'), imageText = path.join(directory, 'image.txt'), image = path.join(directory, 'image.png')
  fs.writeFileSync(textFile, 'synthetic read-only login and account goal')
  fs.writeFileSync(imageText, 'confirm synthetic image facts')
  fs.writeFileSync(image, Buffer.from([137, 80, 78, 71]))
  const environment = { HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: textFile, HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE: imageText, HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE: image }
  const before = l1.captureInputContract(environment)
  assert.deepEqual(before, l1.captureInputContract(environment))
  assert.equal(before.files.length, 2)
  assert.equal(before.expected.requiredKinds.length, 5)
  assert.doesNotMatch(JSON.stringify(before), /synthetic|\.png|\.txt/)
  fs.appendFileSync(image, Buffer.from([1]))
  assert.notEqual(l1.captureInputContract(environment).sha256, before.sha256)
  fs.appendFileSync(textFile, ' changed')
  assert.notEqual(l1.captureInputContract(environment).files[0].textHash, before.files[0].textHash)
})

test('verified text and image persist both precise Run Task and artifact projections', async () => {
  const calls = []
  let saved
  const deps = { ...baseDeps(calls), readCheckpoint: () => null, writeCheckpoint: () => {},
    invoke: async ({ args }) => ({ exitCode: 0, events: [{ type: 'RESPONSE', status: 'COMPLETED', journeyId: args.includes('--attach') ? 'journey-image123' : 'journey-text1234' }] }),
    persistEvidence: (_root, state) => { saved = state; return { target: 'evidence.json' } },
  }
  const result = await l1.runCheckpointedL1({ environment: { HENGZHUN_AGENT_L1_TEXT_INPUT_FILE: 'D:\\text.txt', HENGZHUN_AGENT_L1_IMAGE_INPUT_FILE: 'D:\\image.txt', HENGZHUN_AGENT_L1_IMAGE_ATTACHMENT_FILE: 'D:\\image.png' }, deps })
  assert.equal(result.status, 'PASSED')
  assert.deepEqual(saved.inputContract, INPUTS)
  assert.equal(saved.results.length, 2)
  assert.ok(saved.results.every(item => item.verification.runId && item.verification.taskId && item.verification.artifacts.length === 5))
  assert.deepEqual(calls, ['start', 'readback', 'stop'])
})
