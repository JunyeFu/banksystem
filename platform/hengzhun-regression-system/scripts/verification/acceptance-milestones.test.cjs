#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const milestones = require('../i10-acceptance-milestones.cjs')

const identity = { schemaVersion: 'hengzhun-i10-release-identity-v2', identityHash: 'a'.repeat(64) }
const cases = ['L1', 'L2', 'L3', 'M1', 'M2', 'M3', 'H1', 'H2', 'H3']
const records = cases.flatMap(caseId => ['TEXT_ONLY', 'TEXT_WITH_IMAGE'].map(variant => ({
  caseId,
  variant,
  status: 'PASSED',
  releaseIdentity: identity,
  scriptHash: 'b'.repeat(64),
  stabilityCertificateId: `certificate_${caseId}_${variant}`,
  resultInboxId: `inbox_${caseId}_${variant}`,
  terminalArtifactId: `artifact_${caseId}_${variant}`,
  inputArtifactHashes: variant === 'TEXT_WITH_IMAGE' ? ['c'.repeat(64)] : [],
  ocrFactHash: variant === 'TEXT_WITH_IMAGE' ? 'd'.repeat(64) : null,
  execution: { mode: variant === 'TEXT_ONLY' ? 'ON_DEMAND' : caseId.startsWith('H') ? 'RECURRING' : 'ONE_TIME' }
})))
const pairs = Object.fromEntries(cases.map(caseId => [caseId, 'SEMANTIC_MATCH']))
const specialties = {
  releaseIdentityHash: identity.identityHash,
  reverseRepair: { passed: true },
  recovery: { authoring: true, modelTimeout: true, visibleVerification: true },
  verificationBranches: { directResult: true, webConfirmation: true, visibleHandoff: true }
}

test('milestone evaluator earns only claims proved by current-identity evidence', () => {
  const result = milestones.evaluateMilestones({ identity, records, pairs, checkpoints: 0, specialties })
  assert.equal(result.markers.I10_BROWSER_OCR_CASE_SUITE_ACCEPTED.earned, true)
  assert.equal(result.markers.I10_FLOWISE_18_CHAIN_ACCEPTED.earned, true)
  assert.equal(result.markers.I10_PORTABLE_FOLDER_VERIFIED.earned, false)
  assert.equal(result.markers.I10_FLOWISE_LOCAL_ACCEPTED.earned, false)
  assert.deepEqual(result.markers.I10_PORTABLE_FOLDER_VERIFIED.missing, ['portableVerification'])
})

test('milestone evaluator fails closed on stale identity, missing image provenance or checkpoints', () => {
  const stale = structuredClone(records)
  stale[0].releaseIdentity = { ...identity, identityHash: 'e'.repeat(64) }
  const result = milestones.evaluateMilestones({ identity, records: stale, pairs, checkpoints: 1, specialties })
  assert.equal(result.markers.I10_FLOWISE_18_CHAIN_ACCEPTED.earned, false)
  assert.ok(result.markers.I10_FLOWISE_18_CHAIN_ACCEPTED.missing.includes('currentIdentityRecords:18'))
  assert.ok(result.markers.I10_FLOWISE_18_CHAIN_ACCEPTED.missing.includes('checkpoints:0'))

  const noOcr = structuredClone(records)
  noOcr.find(record => record.variant === 'TEXT_WITH_IMAGE').ocrFactHash = null
  const imageResult = milestones.evaluateMilestones({ identity, records: noOcr, pairs, checkpoints: 0, specialties })
  assert.equal(imageResult.markers.I10_BROWSER_OCR_CASE_SUITE_ACCEPTED.earned, false)
  assert.ok(imageResult.markers.I10_BROWSER_OCR_CASE_SUITE_ACCEPTED.missing.includes('imageOcrProvenance:9'))
})

test('controlled marker writer records the computed predicate and never accepts caller-supplied labels', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'i10-milestones-'))
  const target = path.join(directory, 'current.json')
  const result = milestones.evaluateMilestones({ identity, records, pairs, checkpoints: 0, specialties })
  const written = milestones.writeMilestones(target, result)
  assert.equal(written.releaseIdentityHash, identity.identityHash)
  assert.deepEqual(written.earned, ['I10_BROWSER_OCR_CASE_SUITE_ACCEPTED', 'I10_FLOWISE_18_CHAIN_ACCEPTED'])
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), written)
})

test('full chain marker remains unearned until reverse repair, recovery and all verification branches are current', () => {
  const result = milestones.evaluateMilestones({ identity, records, pairs, checkpoints: 0 })
  assert.equal(result.markers.I10_FLOWISE_18_CHAIN_ACCEPTED.earned, false)
  assert.deepEqual(result.markers.I10_FLOWISE_18_CHAIN_ACCEPTED.missing, [
    'reverseRepair', 'recovery:authoring,modelTimeout,visibleVerification',
    'verificationBranches:directResult,webConfirmation,visibleHandoff'
  ])
})
