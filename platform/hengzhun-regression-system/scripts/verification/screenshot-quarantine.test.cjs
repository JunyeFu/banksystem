'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const formal = require('../../worker/src/i8-formal-runner.cjs')
const stability = require('../../worker/src/i8-stability-runner.cjs')
const workerUtils = require('../../worker/src/i10-worker-utils.cjs')
const { stabilityEvidenceSchema } = require('../../dist/harness/src/i8/stage4-schemas.js')

const digest = 'a'.repeat(64)
const candidateId = `candidate_${'b'.repeat(40)}`
const validationRunId = `validation_${'c'.repeat(40)}_desktop_1`
const evidencePath = artifact => `.data/stability/ns1/${candidateId}/${validationRunId}/${artifact}`

test('formal runner constructs unverified screenshot evidence as quarantined', () => {
  const evidence = formal.quarantinedScreenshotArtifact(Buffer.from('unverified pixels'))
  assert.equal(evidence.artifactType, 'SCREENSHOT')
  assert.equal(evidence.mediaType, 'image/png')
  assert.equal(evidence.redactionStatus, 'QUARANTINED')
})

test('shared Worker screenshot constructor quarantines raw or partially masked pixels', () => {
  const evidence = workerUtils.quarantinedScreenshotArtifact(Buffer.from('raw pixels'), { maskedFields: ['partial'] })
  assert.equal(evidence.artifactType, 'SCREENSHOT')
  assert.equal(evidence.redactionStatus, 'QUARANTINED')
  assert.equal(evidence.metadata.pixelRedactionVerified, false)
})

test('controlled adapters use the shared quarantine constructor and never label screenshots REDACTED', () => {
  for (const relative of [
    '../../worker/src/adapters/fuxing-bank-demo/login-profile.cjs',
    '../../worker/src/adapters/fuxing-bank-demo/account-ownership.cjs',
    '../../worker/src/adapters/fuxing-bank-demo/auth-rejection-recovery.cjs'
  ]) {
    const source = fs.readFileSync(path.resolve(__dirname, relative), 'utf8')
    assert.match(source, /quarantinedScreenshotArtifact/)
    assert.doesNotMatch(source, /artifact\(['"]SCREENSHOT['"],[^\n]*['"]REDACTED['"]/)
  }
})

test('stability runner marks only screenshot descriptors as quarantined', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-stability-evidence-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const screenshot = path.join(root, 'screenshot.png')
  const report = path.join(root, 'report.json')
  fs.writeFileSync(screenshot, Buffer.from('unverified pixels'))
  fs.writeFileSync(report, '{}', 'utf8')

  assert.equal(stability.evidenceDescriptor(root, screenshot, 'SCREENSHOT', 'image/png').redactionStatus, 'QUARANTINED')
  assert.equal(stability.evidenceDescriptor(root, report, 'REPORT', 'application/json').redactionStatus, 'REDACTED')
})

test('stability evidence contract discriminates quarantine by artifact type', () => {
  const screenshot = {
    artifactType: 'SCREENSHOT', mediaType: 'image/png', redactionStatus: 'QUARANTINED',
    relativePath: evidencePath('screenshot.png'), sha256: digest, byteLength: 12
  }
  const report = {
    artifactType: 'REPORT', mediaType: 'application/json', redactionStatus: 'REDACTED',
    relativePath: evidencePath('report.json'), sha256: digest, byteLength: 12
  }
  const log = {
    artifactType: 'LOG', mediaType: 'text/plain; charset=utf-8', redactionStatus: 'REDACTED',
    relativePath: evidencePath('steps.log'), sha256: digest, byteLength: 12
  }

  assert.equal(stabilityEvidenceSchema.safeParse(screenshot).success, true)
  assert.equal(stabilityEvidenceSchema.safeParse(report).success, true)
  assert.equal(stabilityEvidenceSchema.safeParse(log).success, true)
  assert.equal(stabilityEvidenceSchema.safeParse({ ...screenshot, redactionStatus: 'REDACTED' }).success, false)
  assert.equal(stabilityEvidenceSchema.safeParse({ ...report, redactionStatus: 'QUARANTINED' }).success, false)
})
