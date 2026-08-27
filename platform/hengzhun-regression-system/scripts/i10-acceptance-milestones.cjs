#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const acceptanceLedger = require('./i10-acceptance-ledger-v3.cjs')
const { currentReleaseIdentity, sameReleaseIdentity } = require('./i10-release-identity.cjs')

const root = path.resolve(__dirname, '..')
const markerPath = path.join(root, '.data', 'evidence', 'i10', 'milestones', 'current.json')
const CASES = Object.freeze(['L1', 'L2', 'L3', 'M1', 'M2', 'M3', 'H1', 'H2', 'H3'])
const VARIANTS = Object.freeze(['TEXT_ONLY', 'TEXT_WITH_IMAGE'])

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, filePath)
}

function validRecord(record, identity) {
  return Boolean(record?.status === 'PASSED' && sameReleaseIdentity(record.releaseIdentity, identity) &&
    /^[0-9a-f]{64}$/.test(String(record.scriptHash || '')) &&
    typeof record.stabilityCertificateId === 'string' && record.stabilityCertificateId.length > 0 &&
    typeof record.resultInboxId === 'string' && record.resultInboxId.length > 0 &&
    typeof record.terminalArtifactId === 'string' && record.terminalArtifactId.length > 0)
}

function evaluateMilestones({ identity, records, pairs, checkpoints, specialties, portableVerification, localReadiness } = {}) {
  if (!sameReleaseIdentity(identity, identity)) throw new Error('I10_MILESTONE_RELEASE_IDENTITY_INVALID')
  const current = Array.isArray(records) ? records.filter(record => validRecord(record, identity)) : []
  const byKey = new Map(current.map(record => [`${record.caseId}:${record.variant}`, record]))
  const expectedKeys = CASES.flatMap(caseId => VARIANTS.map(variant => `${caseId}:${variant}`))
  const currentIdentityComplete = expectedKeys.every(key => byKey.has(key)) && byKey.size === expectedKeys.length
  const imageRecords = CASES.map(caseId => byKey.get(`${caseId}:TEXT_WITH_IMAGE`)).filter(Boolean)
  const imageOcrComplete = imageRecords.length === 9 && imageRecords.every(record =>
    Array.isArray(record.inputArtifactHashes) && record.inputArtifactHashes.some(value => /^[0-9a-f]{64}$/.test(String(value))) &&
    /^[0-9a-f]{64}$/.test(String(record.ocrFactHash || '')))
  const pairComplete = CASES.every(caseId => pairs?.[caseId] === 'SEMANTIC_MATCH')
  const cleanCheckpoints = checkpoints === 0
  const specialtyCurrent = specialties?.releaseIdentityHash === identity.identityHash
  const reverseRepair = specialtyCurrent && specialties?.reverseRepair?.passed === true
  const recoveryNames = ['authoring', 'modelTimeout', 'visibleVerification']
  const missingRecovery = recoveryNames.filter(name => !specialtyCurrent || specialties?.recovery?.[name] !== true)
  const verificationBranchNames = ['directResult', 'webConfirmation', 'visibleHandoff']
  const missingVerificationBranches = verificationBranchNames.filter(name => !specialtyCurrent || specialties?.verificationBranches?.[name] !== true)

  const browserMissing = []
  if (!currentIdentityComplete) browserMissing.push('currentIdentityRecords:18')
  if (!imageOcrComplete) browserMissing.push('imageOcrProvenance:9')
  if (!pairComplete) browserMissing.push('semanticPairs:9')
  if (!cleanCheckpoints) browserMissing.push('checkpoints:0')

  const chainMissing = []
  if (!currentIdentityComplete) chainMissing.push('currentIdentityRecords:18')
  if (!pairComplete) chainMissing.push('semanticPairs:9')
  if (!cleanCheckpoints) chainMissing.push('checkpoints:0')
  if (!reverseRepair) chainMissing.push('reverseRepair')
  if (missingRecovery.length) chainMissing.push(`recovery:${missingRecovery.join(',')}`)
  if (missingVerificationBranches.length) chainMissing.push(`verificationBranches:${missingVerificationBranches.join(',')}`)

  const portableReady = portableVerification?.status === 'I10_PORTABLE_FOLDER_VERIFIED' &&
    portableVerification.releaseIdentityHash === identity.identityHash
  const localReady = localReadiness?.businessReadiness === 'READY' &&
    localReadiness.releaseIdentityHash === identity.identityHash && portableReady && chainMissing.length === 0 && browserMissing.length === 0

  return Object.freeze({
    schemaVersion: 'hengzhun-i10-acceptance-milestones-v1',
    releaseIdentity: identity,
    evaluatedAt: new Date().toISOString(),
    evidenceDigest: hash({ identityHash: identity.identityHash, expectedKeys, pairs, checkpoints, specialties, portableVerification, localReadiness }),
    markers: Object.freeze({
      I10_BROWSER_OCR_CASE_SUITE_ACCEPTED: { earned: browserMissing.length === 0, missing: browserMissing },
      I10_FLOWISE_18_CHAIN_ACCEPTED: { earned: chainMissing.length === 0, missing: chainMissing },
      I10_PORTABLE_FOLDER_VERIFIED: { earned: portableReady, missing: portableReady ? [] : ['portableVerification'] },
      I10_FLOWISE_LOCAL_ACCEPTED: { earned: localReady, missing: localReady ? [] : ['currentIdentityChainOcrPortableReadiness'] }
    })
  })
}

function writeMilestones(filePath, evaluation) {
  if (evaluation?.schemaVersion !== 'hengzhun-i10-acceptance-milestones-v1' || !evaluation.releaseIdentity?.identityHash) {
    throw new Error('I10_MILESTONE_EVALUATION_INVALID')
  }
  const earned = Object.entries(evaluation.markers).filter(([, value]) => value.earned).map(([name]) => name)
  const output = {
    schemaVersion: evaluation.schemaVersion,
    releaseIdentityHash: evaluation.releaseIdentity.identityHash,
    evaluatedAt: evaluation.evaluatedAt,
    evidenceDigest: evaluation.evidenceDigest,
    earned,
    markers: evaluation.markers
  }
  atomicWrite(filePath, output)
  return output
}

function currentEvaluation() {
  const identity = currentReleaseIdentity()
  const ledger = acceptanceLedger.readLedger(identity)
  const records = acceptanceLedger.currentRecords(ledger, identity)
  const chain = require('./i10-18-chain-acceptance-live.cjs')
  const pairs = Object.fromEntries(CASES.map(caseId => [caseId, chain.pairStatus(ledger, caseId)]))
  const specialties = require('./i10-specialty-evidence.cjs').currentSpecialties()
  return evaluateMilestones({ identity, records, pairs, checkpoints: Object.keys(ledger.checkpoints).length, specialties })
}

if (require.main === module) {
  const command = process.argv[2] || 'status'
  const evaluation = currentEvaluation()
  const output = command === 'write' ? writeMilestones(markerPath, evaluation) : evaluation
  if (!['status', 'write'].includes(command)) throw new Error('I10_ACCEPTANCE_MILESTONES_USAGE')
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

module.exports = { CASES, VARIANTS, markerPath, evaluateMilestones, writeMilestones, currentEvaluation }
