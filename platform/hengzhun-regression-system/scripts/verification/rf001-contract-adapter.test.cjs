'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const adapter = require(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'))

test('canonical error projection preserves safe recovery fields and redacts secrets', () => {
  const projected = adapter.projectCanonicalHarnessError({
    errorCode: 'I10_ENTRY_URL_INVALID',
    category: 'CONTRACT',
    message: 'Bearer should-not-leak sk-example',
    retryable: true,
    userActionRequired: true,
    requestId: 'req_123',
    details: { issues: [{ path: 'entryUrl', code: 'invalid_url', submittedValue: 'secret' }] }
  }, 422)
  assert.deepEqual(Object.keys(projected).sort(), [
    'category', 'correlationRef', 'errorCode', 'fieldErrors', 'retryable',
    'safeMessage', 'status', 'userActionRequired'
  ])
  assert.equal(projected.safeMessage.includes('should-not-leak'), false)
  assert.equal(projected.safeMessage.includes('sk-example'), false)
  assert.deepEqual(projected.fieldErrors, [{ path: 'entryUrl', code: 'invalid_url' }])
  assert.equal(projected.retryable, true)
  assert.equal(projected.userActionRequired, true)
})

test('legacy and canonical projections are semantically equivalent on shared fields', () => {
  const events = []
  const observer = adapter.createShadowObserver({ enabled: true, sink: event => events.push(event) })
  const body = {
    errorCode: 'I10_INPUT_REQUIRED', category: 'CONTRACT', retryable: false,
    userActionRequired: true, requestId: 'req_456', details: { issues: [{ path: 'entryUrl', code: 'required' }] }
  }
  const legacy = adapter.projectLegacyHarnessError(body, 400)
  const canonical = adapter.projectCanonicalHarnessError(body, 400)
  observer.observeError('credential_session_get', legacy, canonical)
  assert.deepEqual(observer.snapshot(), {
    enabled: true, observed: 1, equivalent: 1, mismatched: 0, lastMismatch: null
  })
  assert.deepEqual(events, [])
})

test('shadow mismatch evidence contains shape and digest but no submitted values', () => {
  const events = []
  const observer = adapter.createShadowObserver({ enabled: true, sink: event => events.push(event) })
  observer.observeSuccess('credential_session_get', { status: 'READY', token: 'secret' }, { status: 'DIFFERENT' })
  const snapshot = observer.snapshot()
  assert.equal(snapshot.mismatched, 1)
  assert.deepEqual(snapshot.lastMismatch.legacyFields, ['status'])
  assert.equal(JSON.stringify(events).includes('secret'), false)
  assert.match(snapshot.lastMismatch.digest, /^[0-9a-f]{64}$/)
})

test('credential session read normalization is deterministic and bounded to the canonical field', () => {
  assert.deepEqual(adapter.normalizeCredentialSessionGetRequest({ sessionId: '  credsession_123  ', ignored: 'x' }), {
    sessionId: 'credsession_123'
  })
})

test('B3 integration uses one Harness response and keeps legacy output active', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  assert.match(source, /const \{ response, body \} = await requestHarness\(route, payload\)/)
  assert.match(source, /rf001Shadow\.observeError\(shadowOperation, legacy, canonical\)/)
  assert.match(source, /rf001Shadow\.observeSuccess\(shadowOperation, legacy, legacy\)/)
  assert.match(source, /return textResult\(legacyErrorOutput \? legacy : canonical, true\)/)
  assert.match(source, /return textResult\(legacy\)/)
  assert.doesNotMatch(source, /rf001Shadow[\s\S]{0,300}requestHarness\(/)
  const wrapper = source.slice(source.indexOf('async function shadowedRequest('), source.indexOf('\n}', source.indexOf('async function shadowedRequest(')))
  assert.match(wrapper, /async function shadowedRequest\(operation, route, payload\) \{/)
  assert.equal((wrapper.match(/requestHarness\(/g) || []).length, 1, 'shadowedRequest must issue exactly one Harness request per observation')
  assert.match(wrapper, /projectLegacyHarnessError\(body, response\.status\)/)
  assert.match(wrapper, /projectCanonicalHarnessError\(body, response\.status\)/)
  assert.match(wrapper, /rf001Shadow\.observeError\(/)
  assert.match(wrapper, /rf001Shadow\.observeSuccess\(operation, body, body\)/)
  assert.match(wrapper, /return \{ response, body \}/)
})

const ORCHESTRATION_TOOLS = [
  'candidate_get', 'candidate_preview', 'task_get', 'schedule_get',
  'result_inbox_list', 'failure_get', 'repair_propose', 'decision_submit',
  'candidate_decide', 'schedule_disable'
]

function toolBlock(source, name) {
  const start = source.indexOf(`server.registerTool('${name}',`)
  assert.ok(start >= 0, `missing tool registration: ${name}`)
  const end = source.indexOf('\n  })', start)
  assert.ok(end >= 0, `unterminated tool block: ${name}`)
  return source.slice(start, end)
}

test('B3-S2 all ten orchestration tools observe every direct Harness round-trip', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  for (const name of ORCHESTRATION_TOOLS) {
    const block = toolBlock(source, name)
    assert.match(block, new RegExp(`shadowedRequest\\('${name}',`), `${name} must route direct round-trips through shadowedRequest`)
    assert.doesNotMatch(block, /requestHarness\(/, `${name} must not contain a bare direct Harness request`)
  }
})

test('B3-S2/S4 conditional-write tools declare their side effects: schedule_get retired to read-only', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  // RF-002-S4 (G5): schedule_get is read-only since the v7 consumer evidence
  // showed zero action=DISABLE calls; the authoritative disable path is
  // schedule_disable only.
  assert.equal((toolBlock(source, 'schedule_get').match(/\/v1\/plugin\/schedules:disable/g) || []).length, 0, 'schedule_get must no longer call schedules:disable')
  assert.doesNotMatch(toolBlock(source, 'schedule_get'), /z\.enum\(\['READ', 'DISABLE'\]/, 'schedule_get must no longer carry the DISABLE enum')
  assert.equal((toolBlock(source, 'candidate_get').match(/\/v1\/i8\/candidates:compile/g) || []).length, 1, 'candidate_get compile path must call candidates:compile exactly once')
  assert.equal((toolBlock(source, 'result_inbox_list').match(/\/v1\/i8\/results:inbox-list/g) || []).length, 1, 'result_inbox_list must call inbox-list exactly once')
})

test('B3-S2 shadow wrapper projects errors through legacy and canonical envelopes', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const wrapper = source.slice(source.indexOf('async function shadowedRequest('), source.indexOf('\n}', source.indexOf('async function shadowedRequest(')))
  assert.match(wrapper, /observeError\(\n?\s*operation,\n?\s*projectLegacyHarnessError\(body, response\.status\),\n?\s*projectCanonicalHarnessError\(body, response\.status\)\n?\s*\)/)
})

test('B3-S4 candidate_decide and schedule_disable pre-reads are observed with the tool operation name', () => {
  const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
  const decide = toolBlock(source, 'candidate_decide')
  assert.equal((decide.match(/shadowedRequest\('candidate_decide',/g) || []).length, 1, 'candidate_decide pre-read must be observed exactly once')
  assert.match(decide, /callHarness\('\/v1\/i8\/candidates:decide'/, 'candidate_decide write path must stay on callHarness')
  assert.match(decide, /I8_CANDIDATE_VERSION_UNAVAILABLE/, 'candidate_decide error code must be preserved')
  const disable = toolBlock(source, 'schedule_disable')
  assert.equal((disable.match(/shadowedRequest\('schedule_disable',/g) || []).length, 1, 'schedule_disable pre-read must be observed exactly once')
  assert.match(disable, /callHarness\('\/v1\/plugin\/schedules:disable'/, 'schedule_disable write path must stay on callHarness')
  assert.match(disable, /I8_SCHEDULE_STATUS_UNAVAILABLE/, 'schedule_disable error code must be preserved')
})

test('adapter error fields remain aligned with the approved B2 contract', () => {
  const review = JSON.parse(fs.readFileSync(path.resolve(root, '../../docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json'), 'utf8'))
  assert.deepEqual([...adapter.CANONICAL_ERROR_FIELDS].sort(), [...review.canonicalErrorEnvelope.fields].sort())
})
