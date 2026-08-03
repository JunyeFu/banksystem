'use strict'

// RF-001-B3-S3: 13 entry-alias authoritative projections + sample tests.
// Scope: mcp/src/rf001-contract-adapter.cjs and mcp/src/server.cjs wiring.
// Evidence level: CONTRACT. No runtime shadow, no cutover.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const adapter = require(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'))
const serverSource = () => fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const adapterSource = () => fs.readFileSync(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'), 'utf8')

const CRED = 'credential_12345678-1234-1234-1234-123456789abc'

// ---- alias 1: ingest_submit.supportingImageIngestId=NONE -> omitted ----
test('B3-S3 alias ingest_submit NONE sentinel is omitted from the canonical request', () => {
  assert.deepEqual(adapter.normalizeIngestSubmitRequest({ inputType: 'CASE_FILE', supportingImageIngestId: 'NONE' }), { inputType: 'CASE_FILE' })
  assert.deepEqual(adapter.normalizeIngestSubmitRequest({ inputType: 'CASE_FILE', supportingImageIngestId: '' }), { inputType: 'CASE_FILE' })
  assert.deepEqual(adapter.normalizeIngestSubmitRequest({ inputType: 'CASE_FILE' }), { inputType: 'CASE_FILE' })
  const kept = adapter.normalizeIngestSubmitRequest({ inputType: 'CASE_FILE', supportingImageIngestId: 'img_123' })
  assert.equal(kept.supportingImageIngestId, 'img_123')
  assert.ok(!Object.prototype.hasOwnProperty.call(adapter.normalizeIngestSubmitRequest({ supportingImageIngestId: 'NONE' }), 'supportingImageIngestId'))
})

// ---- aliases 2-3: ingest_decision_submit.correctionsJson/itemDecisionsJson ----
test('B3-S3 alias ingest_decision_submit Json fields project to canonical corrections/itemDecisions', () => {
  const out = adapter.normalizeIngestDecisionSubmitRequest({
    correctionsJson: '[{"field":"title","replacement":"T"}]',
    itemDecisionsJson: '{"itemDecisions":[{"ordinal":1,"decision":"CONFIRM"}]}'
  })
  assert.deepEqual(out, {
    corrections: [{ field: 'title', replacement: 'T' }],
    itemDecisions: [{ ordinal: 1, decision: 'CONFIRM' }]
  })
  // object forms and array pass-through
  const obj = adapter.normalizeIngestDecisionSubmitRequest({
    correctionsJson: { corrections: [{ field: 'a' }] },
    itemDecisionsJson: [{ ordinal: 2, decision: 'REJECT' }]
  })
  assert.deepEqual(obj.corrections, [{ field: 'a' }])
  assert.deepEqual(obj.itemDecisions, [{ ordinal: 2, decision: 'REJECT' }])
  // absent aliases produce empty canonical arrays (pre-RF-001 behavior)
  assert.deepEqual(adapter.normalizeIngestDecisionSubmitRequest({}), { corrections: [], itemDecisions: [] })
  // malformed JSON string still fails closed exactly as before (SyntaxError
  // from JSON.parse; the handler catch projects I10_INGEST_CORRECTIONS_INVALID)
  assert.throws(() => adapter.normalizeIngestDecisionSubmitRequest({ correctionsJson: '{broken' }), SyntaxError)
  // scalar object without the array key fails closed
  assert.throws(() => adapter.normalizeIngestDecisionSubmitRequest({ correctionsJson: '{"x":1}' }), /corrections array required/)
})

// ---- alias 4: journey_prepare.draftJson self-mapping (DEC-2) ----
test('B3-S3 alias journey_prepare draftJson is a self-mapping: parsed, field name preserved', () => {
  assert.deepEqual(adapter.normalizeJourneyPrepareDraft('{"title":"T","steps":[]}'), { title: 'T', steps: [] })
  assert.deepEqual(adapter.normalizeJourneyPrepareDraft({ title: 'T' }), { title: 'T' })
  assert.equal(adapter.normalizeJourneyPrepareDraft(undefined), undefined)
  assert.throws(() => adapter.normalizeJourneyPrepareDraft('not-json'), /I10_JOURNEY_DRAFT_INVALID/)
  // regression: the Harness request keeps the executable-canonical name draftJson
  const source = serverSource()
  const block = source.slice(source.indexOf("registerTool('journey_prepare'"), source.indexOf("registerTool('journey_get'"))
  assert.match(block, /\.\.\.\(normalizedDraft \? \{ draftJson: normalizedDraft \} : \{\}\)/, 'journey_prepare must keep draftJson at the Harness boundary (DEC-2 self-mapping)')
})

// ---- aliases 5-6: case_prepare.draftArray/draftJson -> draft ----
test('B3-S3 alias case_prepare draftArray and draftJson project to canonical draft', () => {
  const draftInput = { schemaVersion: 'hengzhun-i10-case-draft-v1', title: 'T', steps: [{ action: 'a', expected: 'b' }] }
  const fromArray = adapter.normalizeCasePrepareRequest({ caseDescription: 'd', draftArray: [draftInput], credentialRef: '' })
  const fromJson = adapter.normalizeCasePrepareRequest({ caseDescription: 'd', draftJson: JSON.stringify(draftInput), credentialRef: '' })
  const fromObject = adapter.normalizeCasePrepareRequest({ caseDescription: 'd', draftJson: draftInput, credentialRef: '' })
  assert.deepEqual(fromArray.draft, draftInput)
  assert.deepEqual(fromJson.draft, draftInput)
  assert.deepEqual(fromObject.draft, draftInput)
  // both sources at once fails closed (pre-RF-001 rule preserved)
  assert.throws(() => adapter.normalizeCasePrepareRequest({ caseDescription: 'd', draftArray: [draftInput], draftJson: draftInput, credentialRef: '' }), /I10_DRAFT_SOURCE_AMBIGUOUS/)
})

// ---- alias 7: case_prepare.acceptanceSummaryJson -> acceptanceSummary ----
test('B3-S3 alias case_prepare acceptanceSummaryJson projects to canonical acceptanceSummary', () => {
  assert.deepEqual(adapter.normalizeCaseAcceptanceSummary('{"goal":"G"}'), { goal: 'G' })
  assert.deepEqual(adapter.normalizeCaseAcceptanceSummary({ goal: 'G' }), { goal: 'G' })
  assert.throws(() => adapter.normalizeCaseAcceptanceSummary('[1]'), /I8_ACCEPTANCE_JSON_INVALID/)
})

// ---- alias 8: case_prepare.multimodalContextJson merge (flat-draft path) ----
test('B3-S3 alias case_prepare multimodalContextJson merges into the flat draft only', () => {
  const out = adapter.normalizeCasePrepareRequest({
    caseDescription: 'd', caseTitle: 'T', objective: 'O', summary: 'S', targetSystem: '复兴银行',
    entryUrl: 'https://bank.example.com/portal/login', preconditions: ['P'], actions: ['登录'], expectedOutcomes: ['成功'],
    assertions: ['A'], missingFields: [], credentialRef: '',
    multimodalContextJson: { supportingImageIngestId: 'img_9', caseFacts: [{ fact: 'f' }], actionStepsV2: [], verificationRequirements: [{ kind: 'SMS' }] }
  })
  assert.equal(out.draft.supportingImageIngestId, 'img_9')
  assert.deepEqual(out.draft.caseFacts, [{ fact: 'f' }])
  assert.deepEqual(out.draft.verificationRequirements, [{ kind: 'SMS' }])
  // invalid actionStepsV2 shape fails closed
  assert.throws(() => adapter.normalizeCasePrepareRequest({
    caseDescription: 'd', caseTitle: 'T', objective: 'O', summary: 'S', targetSystem: '复兴银行',
    entryUrl: 'https://bank.example.com/portal/login', preconditions: ['P'], actions: ['a'], expectedOutcomes: ['b'],
    assertions: ['A'], credentialRef: '',
    multimodalContextJson: { actionStepsV2: 'not-array' }
  }), /I10_ACTION_STEPS_INVALID/)
})

// ---- alias 9: authoring_submit seven array fields declared no-effect (DEC-1) ----
test('B3-S3 alias authoring_submit seven array fields are declared no-effect and never canonical', () => {
  const canonical = adapter.normalizeAuthoringSubmitRequest({
    preparationId: 'prep_1', expectedVersion: 2, choice: 'APPROVE', confirmationRef: 'c', reason: 'r',
    intentStepIds: ['a'], actions: ['b'], expectedOutcomes: ['c'], riskLevels: ['LOW'], inputValues: ['v'], inputValueSources: ['s'], assertions: ['q']
  })
  assert.deepEqual([...canonical.declaredNoEffect].sort(), [...adapter.AUTHORING_SUBMIT_NO_EFFECT_ALIASES].sort(), 'declared no-effect set must match the B2 contract list')
  for (const field of adapter.AUTHORING_SUBMIT_NO_EFFECT_ALIASES) {
    assert.ok(!(field in canonical), `${field} must never appear in the canonical authoring request`)
  }
  assert.deepEqual(canonical, {
    preparationId: 'prep_1', expectedVersion: 2, choice: 'APPROVE', confirmationRef: 'c', reason: 'r',
    declaredNoEffect: [...adapter.AUTHORING_SUBMIT_NO_EFFECT_ALIASES]
  })
  // absent aliases declare nothing
  assert.deepEqual(adapter.normalizeAuthoringSubmitRequest({ preparationId: 'p', expectedVersion: 1, choice: 'REJECT', confirmationRef: 'c', reason: 'r' }).declaredNoEffect, [])
  // regression: the handler builds the Harness payload from canonical fields only
  const source = serverSource()
  const block = source.slice(source.indexOf("registerTool('authoring_submit'"), source.indexOf("registerTool('authoring_get'"))
  assert.match(block, /normalizeAuthoringSubmitRequest\(\{/)
  assert.match(block, /preparationId: canonical\.preparationId/)
  assert.doesNotMatch(block, /businessPayload[\s\S]{0,120}intentStepIds/, 'authoring_submit Harness payload must never carry the seven array aliases')
})

// ---- aliases 10-11: run_submit/schedule_create implicit credentialAlias ----
test('RF-004-S2 alias run_submit/schedule_create: default no injection, legacy fallback channel only', () => {
  // DP-S4-1=A: MCP no longer injects an execution credential; Harness owns
  // the authoritative resolution (S3). i3-customer survives only behind the
  // explicit HENGZHUN_RF004_LEGACY_CREDENTIAL=1 channel.
  const defaultBinding = adapter.normalizeCredentialBinding(false)
  assert.equal(defaultBinding.credentialAlias, undefined, 'default binding must not inject a credential alias')
  assert.match(defaultBinding.auditDigest, /^[0-9a-f]{64}$/)
  const legacyBinding = adapter.normalizeCredentialBinding(true)
  assert.equal(legacyBinding.credentialAlias, 'i3-customer', 'legacy channel must restore the frozen alias')
  assert.match(legacyBinding.auditDigest, /^[0-9a-f]{64}$/)
  const source = serverSource()
  assert.match(source, /legacyCredentialBinding = process\.env\.HENGZHUN_RF004_LEGACY_CREDENTIAL === '1'/, 'legacy credential switch must exist')
  assert.equal((source.match(/\.\.\.\(binding\.credentialAlias \? \{ credentialAlias: binding\.credentialAlias \} : \{\}\)/g) || []).length, 2, 'both tools must conditionally attach the alias')
})

// ---- aliases 12-13: repair_propose.patchJson + 5 flat fields -> patch ----
test('B3-S3 alias repair_propose patchJson and flat fields project to canonical patch', () => {
  const fromJson = adapter.normalizeRepairProposeRequest({ patchJson: '{"schemaVersion":"i8-script-patch-proposal-v1","operations":[]}' })
  assert.deepEqual(fromJson.patch, { schemaVersion: 'i8-script-patch-proposal-v1', operations: [] })
  const fromObject = adapter.normalizeRepairProposeRequest({ patchJson: { schemaVersion: 's', operations: [] } })
  assert.deepEqual(fromObject.patch, { schemaVersion: 's', operations: [] })
  const fromFlat = adapter.normalizeRepairProposeRequest({ operationType: 'REPLACE', targetRef: 'r', locatorKind: 'TEST_ID', locatorValue: 'v', rationale: 'why' })
  assert.deepEqual(fromFlat.patch, {
    schemaVersion: 'i8-script-patch-proposal-v1',
    operations: [{ type: 'REPLACE', targetRef: 'r', locator: { kind: 'TEST_ID', value: 'v' } }],
    rationale: 'why'
  })
  // patchJson wins over flat fields (pre-RF-001 precedence)
  const precedence = adapter.normalizeRepairProposeRequest({ patchJson: '{"schemaVersion":"s","operations":[]}', operationType: 'REPLACE', targetRef: 'r', locatorKind: 'TEST_ID', locatorValue: 'v', rationale: 'w' })
  assert.deepEqual(precedence.patch, { schemaVersion: 's', operations: [] })
  // neither source fails closed with the exact legacy code
  assert.throws(() => adapter.normalizeRepairProposeRequest({}), error => error.code === 'I8_PATCH_FLAT_FIELDS_INVALID')
  assert.throws(() => adapter.normalizeRepairProposeRequest({ patchJson: '[1]' }), error => error.code === 'I8_PATCH_JSON_INVALID')
})

// ---- projections are deterministic and pure (no IO, no second request) ----
test('B3-S3 projections are deterministic, pure and never issue Harness requests', () => {
  const source = adapterSource()
  assert.doesNotMatch(source, /requestHarness|callHarness|fetch\(|http\.request/, 'adapter must stay IO-free')
  assert.doesNotMatch(source, /process\.env/, 'adapter must not read runtime state')
  const input = { caseDescription: 'd', caseTitle: 'T', objective: 'O', summary: 'S', targetSystem: '复兴银行', entryUrl: 'https://bank.example.com/portal/login', preconditions: ['P'], actions: ['登录'], expectedOutcomes: ['成功'], assertions: ['A'], missingFields: [], credentialRef: '' }
  const a = adapter.normalizeCasePrepareRequest(input)
  const b = adapter.normalizeCasePrepareRequest(input)
  assert.equal(JSON.stringify(a.draft), JSON.stringify(b.draft), 'same input must produce byte-identical canonical draft')
  assert.match(source, /function normalizeCasePrepareRequest\(input\) \{/, 'projection entry present')
})

// ---- handlers are wired to the projections ----
test('B3-S3 tool handlers route alias fields through the adapter projections', () => {
  const source = serverSource()
  assert.match(source, /const request = normalizeIngestSubmitRequest\(business\)/)
  assert.match(source, /normalizeIngestDecisionSubmitRequest\(\{ correctionsJson, itemDecisionsJson \}\)/)
  assert.match(source, /const normalizedDraft = normalizeJourneyPrepareDraft\(draftJson\)/)
  assert.match(source, /const \{ normalizedCredentialRef, draft \} = normalizeCasePrepareRequest\(/)
  assert.match(source, /const acceptanceSummary = normalizeCaseAcceptanceSummary\(acceptanceSummaryJson\)/)
  assert.match(source, /const \{ patch \} = normalizeRepairProposeRequest\(/)
  assert.match(source, /const binding = normalizeCredentialBinding\(legacyCredentialBinding\)/)
  // the deleted local duplicates must not return
  assert.doesNotMatch(source, /function normalizeCasePrepareUrl\(/)
  assert.doesNotMatch(source, /function normalizeI10NaturalDraft\(/)
  assert.doesNotMatch(source, /function normalizeCasePrepareCredentialRef\(/)
  assert.doesNotMatch(source, /function normalizeCasePrepareActionSteps\(/)
  assert.doesNotMatch(source, /function parseJsonArgument\(/)
})
