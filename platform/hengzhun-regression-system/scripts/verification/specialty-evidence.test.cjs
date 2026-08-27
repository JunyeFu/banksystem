#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const specialties = require('../i10-specialty-evidence.cjs')

const identity = { schemaVersion: 'hengzhun-i10-release-identity-v2', identityHash: 'a'.repeat(64) }

function stage8(results) {
  return { releaseIdentity: identity, mock: false, degraded: false, results }
}

test('specialty evaluator derives recovery and reverse repair from current Stage8 results', () => {
  const evidence = specialties.evaluateSpecialties({
    identity,
    stage8Evidence: stage8([
      { reverse: true, status: 'PASSED', executionEvidence: { controlledFailure: true, recovered: true } },
      { variant: 'F013_AUTHORING_FAIL_RETRY_RETAIN', status: 'PASSED', interactionMetadata: { authoringRetry: { sameCaseRecovery: true, failedTaskRetained: true } } },
      { variant: 'F014_VERIFICATION_RESUME_ON_DEMAND', status: 'PASSED', interactionMetadata: { verificationResume: { sameTaskRecovery: true, externalVerificationCompleted: true, secretEnteredInFlowise: false } } },
      { variant: 'F015_STABILITY_FAIL_REVISE_RETAIN', status: 'PASSED', interactionMetadata: { stabilityRevision: { failedSamplesNotReused: true } } }
    ]),
    verificationEvidence: { releaseIdentity: identity, mock: false, degraded: false, branches: { directResult: true, webConfirmation: true, visibleHandoff: true } },
    genericEvidence: ['neutral-a', 'neutral-b'].map(neutralFixture => ({ releaseIdentity: identity, mock: false, degraded: false, status: 'PASSED', fixtureProfile: 'GENERIC_WEB', neutralFixture }))
  })
  assert.equal(evidence.reverseRepair.passed, true)
  assert.deepEqual(evidence.recovery, { authoring: true, modelTimeout: true, visibleVerification: true, stabilityRevision: true })
  assert.deepEqual(evidence.verificationBranches, { directResult: true, webConfirmation: true, visibleHandoff: true })
  assert.deepEqual(evidence.genericNeutralTargets, { neutralA: true, neutralB: true })
})

test('specialty evaluator fails closed for stale, mock, or incomplete evidence', () => {
  const stale = { ...identity, identityHash: 'b'.repeat(64) }
  const evidence = specialties.evaluateSpecialties({
    identity,
    stage8Evidence: { ...stage8([]), releaseIdentity: stale },
    verificationEvidence: { releaseIdentity: identity, mock: true, branches: { directResult: true, webConfirmation: true, visibleHandoff: true } },
    genericEvidence: []
  })
  assert.equal(evidence.reverseRepair.passed, false)
  assert.deepEqual(evidence.recovery, { authoring: false, modelTimeout: false, visibleVerification: false, stabilityRevision: false })
  assert.deepEqual(evidence.verificationBranches, { directResult: false, webConfirmation: false, visibleHandoff: false })
})

test('specialty evaluator merges separate current-identity Stage8 runs', () => {
  const evidence = specialties.evaluateSpecialties({
    identity,
    stage8Evidence: [
      stage8([{ reverse: true, status: 'PASSED', executionEvidence: { controlledFailure: true, recovered: true } }]),
      stage8([{ variant: 'F013_AUTHORING_FAIL_RETRY_RETAIN', status: 'PASSED', interactionMetadata: { authoringRetry: { sameCaseRecovery: true, failedTaskRetained: true } } }])
    ]
  })
  assert.equal(evidence.reverseRepair.passed, true)
  assert.equal(evidence.recovery.authoring, true)
})
