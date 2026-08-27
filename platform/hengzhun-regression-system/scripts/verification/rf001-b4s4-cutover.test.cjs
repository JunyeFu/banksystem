'use strict'

// RF-001-B4-S4: cutover verification (canonical 8-field error envelope).
// 1. adapter unit: projectCanonicalToolError is a deterministic, idempotent,
//    redacting canonical projection (legacy validationIssues -> fieldErrors).
// 2. server.cjs static: the LEGACY_ERROR fallback switch exists and defaults
//    off; callHarness outputs canonical; textResult projects tool errors.
// 3. legacy-shape preservation behind the switch (unit-level).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const adapter = require(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'))
const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')

test('B4-S4 projectCanonicalToolError produces the frozen 8-field envelope', () => {
  const projected = adapter.projectCanonicalToolError({ errorCode: 'I8_TASK_STATUS_UNAVAILABLE', status: 404 })
  assert.deepEqual(Object.keys(projected).sort(), [
    'category', 'errorCode', 'retryable', 'status', 'userActionRequired'
  ])
  assert.equal(projected.errorCode, 'I8_TASK_STATUS_UNAVAILABLE')
  assert.equal(projected.category, 'TOOL')
  assert.equal(projected.status, 404)
  assert.equal(projected.retryable, false)
  assert.equal(projected.userActionRequired, false)
})

test('B4-S4 tool error projection is idempotent and maps legacy validationIssues', () => {
  const canonical = adapter.projectCanonicalToolError({ errorCode: 'I10_INGEST_CORRECTIONS_INVALID', category: 'CONTRACT', status: 422 })
  assert.deepEqual(adapter.projectCanonicalToolError(canonical), canonical, 'projection must be idempotent on canonical payloads')
  const legacy = adapter.projectCanonicalToolError({
    errorCode: 'I10_DRAFT_SOURCE_AMBIGUOUS', category: 'TOOL', status: 400,
    validationIssues: [{ path: 'draft', code: 'ambiguous' }]
  })
  assert.deepEqual(legacy.fieldErrors, [{ path: 'draft', code: 'ambiguous' }], 'legacy validationIssues must project to fieldErrors')
  assert.equal(legacy.validationIssues, undefined)
})

test('B4-S4 tool error projection redacts secrets and bounds free-text fields', () => {
  const syntheticApiKey = ['sk', 'abcdefghijklmnop'].join('-')
  const projected = adapter.projectCanonicalToolError({
    errorCode: 'X', category: 'TOOL', status: 500,
    message: `Bearer ${syntheticApiKey} failed`, requestId: 'req_' + 'x'.repeat(500)
  })
  assert.ok(!JSON.stringify(projected).includes(syntheticApiKey), 'secret values must be redacted')
  assert.ok(!projected.safeMessage.includes('Bearer'), 'bearer tokens must be redacted')
  assert.ok(projected.correlationRef.length <= 160, 'correlationRef must be bounded')
})

test('B4-S4 server.cjs cutover wiring: default canonical output with legacy fallback switch', () => {
  assert.match(serverSource, /const legacyErrorOutput = process\.env\.HENGZHUN_RF001_LEGACY_ERROR === '1'/, 'fallback switch must exist and default off')
  assert.match(serverSource, /legacyErrorOutput \? legacy : canonical/, 'callHarness must emit canonical by default')
  assert.match(serverSource, /: projectCanonicalToolError\(value\)/, 'textResult must project error payloads to the canonical envelope')
  assert.match(serverSource, /\? \{\s*\.\.\.value,\s*category: typeof value\.category/, 'legacy shape must remain behind the switch')
  assert.doesNotMatch(serverSource, /return textResult\(legacy, true\)/, 'no bare legacy output may remain on the default path')
})
