'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const runner = require('../i10-ledger-runner.cjs')
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/acceptance-ledger-execution-matrix-v1.json'), 'utf8'))

test('ledger matrix contains 24 base and 48 interruption scenarios exactly once', () => {
  const ids = runner.allScenarioIds()
  assert.equal(ids.length, 72)
  assert.equal(new Set(ids).size, 72)
  assert.equal(ids.filter(id => !id.includes('+')).length, 24)
  assert.equal(ids.filter(id => id.includes('+')).length, 48)
})

test('fresh summary never aliases NOT_RUN to BLOCKED', () => {
  const summary = runner.freshSummary()
  assert.deepEqual(summary.counts, { total: 72, PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 72 })
  assert.ok(Object.values(summary.scenarios).every(record => record.acceptanceStatus === 'NOT_RUN'))
})

test('BLOCKED requires an external blocker, stable state and recovery command', () => {
  const temp = path.join(root, '.data/tests/ledger-runner-blocked.json')
  fs.mkdirSync(path.dirname(temp), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify({ implementationStatus: 'IMPLEMENTED' }))
  const summary = runner.freshSummary()
  assert.throws(() => runner.recordOutcome(summary, 'F-001+I-01', 'BLOCKED', path.relative(root, temp)), /I10_LEDGER_BLOCKED_DETAIL_MISSING/)
  fs.rmSync(temp, { force: true })
})

test('all stage8 bindings point to unique in-range sequences', () => {
  const values = Object.values(matrix.stage8Bindings)
  assert.equal(new Set(values).size, values.length)
  assert.ok(values.every(value => Number.isInteger(value) && value >= 1 && value <= 12))
  assert.deepEqual(matrix.ledgerVariantBindings['F-002'], {
    variant: 'F002_CAPTURE_ACTIVATE_NO_RUN',
    sequence: 2,
    expectedOutcome: 'SCRIPT_ACTIVATED_NO_RUN'
  })
  assert.deepEqual(matrix.ledgerVariantBindings['F-003'], {
    variant: 'F003_REVISE_RETAIN',
    sequence: 3,
    expectedOutcome: 'CANDIDATE_RETAINED'
  })
  assert.deepEqual(matrix.ledgerVariantBindings['F-004'], {
    variant: 'F004_NL_IMAGE_ONE_TIME',
    sequence: 4,
    expectedOutcome: 'SCHEDULED_ONE_TIME'
  })
  assert.deepEqual(matrix.ledgerVariantBindings['F-005'], {
    variant: 'F005_NL_MULTI_IMAGE_CONFLICT_RETAIN',
    sequence: 5,
    expectedOutcome: 'CANDIDATE_RETAINED'
  })
  assert.deepEqual(matrix.ledgerVariantBindings['F-006'], {
    variant: 'F006_IMAGE_ONLY_CLARIFY_RECURRING',
    sequence: 6,
    expectedOutcome: 'SCHEDULED_RECURRING'
  })
})

test('F-007 is bound to the XLSX recurring variant rather than the legacy file on-demand sequence', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-007'], {
    variant: 'F007_XLSX_RECURRING',
    sequence: 7,
    expectedOutcome: 'SCHEDULED_RECURRING'
  })
})

test('F-008 is bound to file revision and retained-candidate semantics', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-008'], {
    variant: 'F008_FILE_REVISE_RETAIN',
    sequence: 8,
    expectedOutcome: 'CANDIDATE_RETAINED'
  })
})

test('F-009 is bound to JSON file plus image and on-demand execution', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-009'], {
    variant: 'F009_FILE_IMAGE_ON_DEMAND',
    sequence: 9,
    expectedOutcome: 'RUN_PASSED'
  })
})

test('F-010 is bound to real video ingest and one-time execution', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-010'], {
    variant: 'F010_VIDEO_ONE_TIME',
    sequence: 10,
    expectedOutcome: 'SCHEDULED_ONE_TIME'
  })
})

test('F-011 is bound to low-confidence correction and on-demand execution', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-011'], {
    variant: 'F011_VIDEO_LOW_CONFIDENCE_CORRECT_ON_DEMAND',
    sequence: 11,
    expectedOutcome: 'RUN_PASSED'
  })
})

test('F-012 is bound to video-image conflict resolution and retained-candidate semantics', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-012'], {
    variant: 'F012_VIDEO_IMAGE_CONFLICT_RETAIN',
    sequence: 12,
    expectedOutcome: 'CANDIDATE_RETAINED'
  })
})

test('F-013 is bound to failed-authoring retry and retained-candidate semantics', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-013'], {
    variant: 'F013_AUTHORING_FAIL_RETRY_RETAIN',
    sequence: 13,
    expectedOutcome: 'CANDIDATE_RETAINED'
  })
})

test('F-014 is bound to two-gate verification resume and on-demand execution', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-014'], {
    variant: 'F014_VERIFICATION_RESUME_ON_DEMAND',
    sequence: 14,
    expectedOutcome: 'RUN_PASSED'
  })
})

test('F-015 is bound to failed stability, versioned revision and retained-candidate semantics', () => {
  assert.deepEqual(matrix.ledgerVariantBindings['F-015'], {
    variant: 'F015_STABILITY_FAIL_REVISE_RETAIN',
    sequence: 15,
    expectedOutcome: 'CANDIDATE_RETAINED'
  })
})
