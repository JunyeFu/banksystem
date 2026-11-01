'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { projectJourneyEvidenceFields, REFERENCE_FIELDS } = require('../../mcp/src/journey-evidence-projection.cjs')

test('independent MCP preserves bounded terminal authority without URLs or secrets', () => {
  const source = {
    terminal: true,
    references: {
      caseId: 'case_12345678', preparationId: 'preparation_12345678', candidateId: 'candidate_12345678',
      certificateId: 'certificate_12345678', scriptId: 'script_12345678', scriptHash: 'a'.repeat(64),
      planId: 'plan_12345678', confirmedDecisionEventId: 'decision_12345678', taskId: 'task_12345678',
      runId: 'run_12345678', inboxId: 'inbox_12345678', resultArtifactId: 'artifact_12345678',
      credentialRef: 'credential_12345678', captureUrl: 'http://127.0.0.1/form#token=secret',
    },
    artifactCards: [{
      artifactId: 'artifact_12345678', displayName: 'result.json', mediaType: 'application/json', sha256: 'b'.repeat(64), byteSize: 42,
      href: 'http://127.0.0.1/download#token=secret', token: 'secret', downloadGrantRequired: true,
    }],
  }
  const projected = projectJourneyEvidenceFields(source)
  assert.equal(projected.terminal, true)
  assert.deepEqual(Object.keys(projected.references), REFERENCE_FIELDS.filter((field) => source.references[field]))
  assert.equal(projected.references.credentialRef, undefined)
  assert.deepEqual(projected.artifactCards, [{
    artifactId: 'artifact_12345678', displayName: 'result.json', mediaType: 'application/json', sha256: 'b'.repeat(64), size: 42,
    downloadGrantRequired: true,
  }])
  assert.doesNotMatch(JSON.stringify(projected), /(?:href|token|credential|captureUrl|secret)/i)
})

test('projection is bounded and malformed artifact metadata is dropped', () => {
  const projected = projectJourneyEvidenceFields({
    terminal: false,
    references: Object.fromEntries(REFERENCE_FIELDS.map((field) => [field, 'x'.repeat(500)])),
    artifactCards: Array.from({ length: 20 }, (_, index) => ({
      artifactId: `artifact_${String(index).padStart(8, '0')}`, displayName: `result-${index}`, sha256: 'invalid', byteSize: -1,
    })),
  })
  assert.equal(projected.terminal, false)
  assert.equal(projected.artifactCards.length, 16)
  assert.equal(projected.artifactCards[0].sha256, undefined)
  assert.equal(projected.artifactCards[0].size, undefined)
  assert.ok(Object.values(projected.references).every((value) => value.length <= 160))
})
