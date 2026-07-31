#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const references = require('../i10-reference-contracts.cjs')
const release = require('../i10-release-identity.cjs')

test('opaque reference contract accepts real candidate hashes and rejects legacy UUID-shaped candidates', () => {
  assert.equal(references.isReference('candidate', 'candidate_12f34cdba5abc8565128f12eaa03ddb11f3da6b3'), true)
  assert.equal(references.isReference('candidate', 'candidate_12345678-1234-1234-1234-123456789abc'), false)
  assert.equal(references.latestReference('x candidate_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa y', 'candidate'), 'candidate_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
})

test('all required opaque identifier kinds are centrally declared', () => {
  for (const kind of ['journey', 'preparation', 'candidate', 'certificate', 'script', 'buildjob', 'task', 'run', 'schedule', 'inbox', 'targetprofile']) {
    assert.match(references.source(kind), /^[a-z]+_/)
  }
})

test('current release identity contains a versioned case catalog and hashes', () => {
  const value = release.currentReleaseIdentity({ requireDeployed: false })
  assert.equal(value.schemaVersion, 'hengzhun-i10-release-identity-v1')
  assert.equal(value.flowVersion, 7)
  for (const field of ['sourceFlowHash', 'normalizedFlowHash', 'harnessCodeHash', 'workerCodeHash', 'caseCatalogHash', 'identityHash']) assert.match(value[field], /^[0-9a-f]{64}$/)
  const publication = JSON.parse(fs.readFileSync(path.join(release.root, 'flowise/i10/publication-manifest-v1.json'), 'utf8'))
  const expectedReady = Boolean(publication.deployed === true && /^[0-9a-f]{64}$/i.test(String(publication.deployedFlowDataSha256 || '')))
  assert.equal(value.deploymentReady, expectedReady)
})

test('the v6 rollback builder derives the cross-session candidate gate from the central contract', () => {
  const source = fs.readFileSync(path.join(release.root, 'scripts/build-i10-agentflow-v6.cjs'), 'utf8')
  assert.match(source, /opaqueReferences\.source\('candidate'\)/)
  assert.doesNotMatch(source, /candidate_\[0-9a-f-\]\{36\}/)
})

test('formal transfer input is typed, frozen, and never inferred from controller prose', () => {
  const root = release.root
  const normalizer = fs.readFileSync(path.join(root, 'scripts', 'i10-case-draft-normalizer.cjs'), 'utf8')
  const packageBuilder = fs.readFileSync(path.join(root, 'harness', 'src', 'i8', 'script-package-builder.ts'), 'utf8')
  const service = fs.readFileSync(path.join(root, 'harness', 'src', 'service.ts'), 'utf8')
  assert.match(normalizer, /hengzhun-i10-typed-business-inputs-v1/)
  assert.match(normalizer, /businessInput\.payeeRef/)
  assert.match(packageBuilder, /typedBusinessInputs/)
  assert.match(service, /I10_TYPED_BUSINESS_INPUT_REQUIRED/)
})

test('acceptance ledger refuses a terminal evidence replay for one release identity', () => {
  const source = fs.readFileSync(path.join(release.root, 'scripts', 'i10-acceptance-ledger-v3.cjs'), 'utf8')
  const driver = fs.readFileSync(path.join(release.root, 'scripts', 'i10-18-chain-acceptance-live.cjs'), 'utf8')
  assert.match(source, /I10_ACCEPTANCE_CHECKPOINT_REGRESSION_FORBIDDEN/)
  assert.match(source, /return ledger\.records\[recordKey\]/)
  assert.match(driver, /acceptanceLedger\.existingTerminal\(caseId, variant\)/)
})
