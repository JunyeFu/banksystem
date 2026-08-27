#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { currentReleaseIdentity, sameReleaseIdentity } = require('./i10-release-identity.cjs')

const root = path.resolve(__dirname, '..')
const outputPath = path.join(root, '.data/evidence/i10/specialties/current.json')

function authoritative(value, identity) {
  return Boolean(value && value.mock === false && value.degraded === false &&
    sameReleaseIdentity(value.releaseIdentity, identity))
}

function evaluateSpecialties({ identity, stage8Evidence, verificationEvidence, genericEvidence = [] } = {}) {
  if (!sameReleaseIdentity(identity, identity)) throw new Error('I10_SPECIALTY_RELEASE_IDENTITY_INVALID')
  const stage8Runs = Array.isArray(stage8Evidence) ? stage8Evidence : [stage8Evidence]
  const stage8Results = stage8Runs.flatMap(evidence => authoritative(evidence, identity) && Array.isArray(evidence.results)
    ? evidence.results : [])
  const passed = predicate => stage8Results.some(result => result?.status !== 'FAILED' && predicate(result))
  const reverseRepair = passed(result => result.reverse === true &&
    result.executionEvidence?.controlledFailure === true && result.executionEvidence?.recovered === true)
  const authoringRecovery = passed(result => result.variant === 'F013_AUTHORING_FAIL_RETRY_RETAIN' &&
    result.interactionMetadata?.authoringRetry?.sameCaseRecovery === true &&
    result.interactionMetadata?.authoringRetry?.failedTaskRetained === true)
  const verificationRecovery = passed(result => result.variant === 'F014_VERIFICATION_RESUME_ON_DEMAND' &&
    result.interactionMetadata?.verificationResume?.sameTaskRecovery === true &&
    result.interactionMetadata?.verificationResume?.externalVerificationCompleted === true &&
    result.interactionMetadata?.verificationResume?.secretEnteredInFlowise === false)
  const stabilityRevision = passed(result => result.variant === 'F015_STABILITY_FAIL_REVISE_RETAIN' &&
    result.interactionMetadata?.stabilityRevision?.failedSamplesNotReused === true)
  const verificationCurrent = authoritative(verificationEvidence, identity)
  const branches = verificationCurrent && verificationEvidence.branches && typeof verificationEvidence.branches === 'object'
    ? verificationEvidence.branches : {}
  const genericCurrent = new Set(genericEvidence.filter(value => authoritative(value, identity) &&
    value.status === 'PASSED' && value.fixtureProfile === 'GENERIC_WEB').map(value => value.neutralFixture))

  return Object.freeze({
    schemaVersion: 'hengzhun-i10-specialty-evidence-v1',
    releaseIdentityHash: identity.identityHash,
    reverseRepair: Object.freeze({ passed: reverseRepair }),
    recovery: Object.freeze({
      authoring: authoringRecovery,
      modelTimeout: authoringRecovery,
      visibleVerification: verificationRecovery,
      stabilityRevision
    }),
    verificationBranches: Object.freeze({
      directResult: branches.directResult === true,
      webConfirmation: branches.webConfirmation === true,
      visibleHandoff: branches.visibleHandoff === true
    }),
    genericNeutralTargets: Object.freeze({ neutralA: genericCurrent.has('neutral-a'), neutralB: genericCurrent.has('neutral-b') }),
    completedAt: new Date().toISOString()
  })
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return undefined
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return undefined }
}

function readStage8Evidence() {
  const files = [path.join(root, '.data/evidence/i10/stage8/result.json')]
  const runsRoot = path.join(root, '.data/evidence/i10/stage8/runs')
  if (fs.existsSync(runsRoot)) {
    for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) files.push(path.join(runsRoot, entry.name, 'result.json'))
    }
  }
  return files.map(readJson).filter(Boolean)
}

function currentSpecialties() {
  const identity = currentReleaseIdentity()
  return evaluateSpecialties({
    identity,
    stage8Evidence: readStage8Evidence(),
    verificationEvidence: readJson(path.join(root, '.data/evidence/i10/verification-branches/result.json')),
    genericEvidence: ['neutral-a', 'neutral-b'].map(name => readJson(path.join(root, `.data/evidence/i10/l2-generic-screenshot-${name}/result.json`))).filter(Boolean)
  })
}

function writeCurrent(evidence) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const temporary = `${outputPath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, outputPath)
}

if (require.main === module) {
  const evidence = currentSpecialties()
  if (process.argv[2] === 'write') writeCurrent(evidence)
  else if (process.argv[2] && process.argv[2] !== 'status') throw new Error('I10_SPECIALTY_EVIDENCE_USAGE')
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

module.exports = { outputPath, evaluateSpecialties, currentSpecialties, writeCurrent }
