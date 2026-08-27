'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertAuditAgainstBaseline,
  proposedBaseline
} = require('../check-flowise-audit.cjs')

function audit(vulnerabilities) {
  return {
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
    vulnerabilities
  }
}

const known = audit({
  example: {
    severity: 'high',
    range: '<2.0.0',
    nodes: ['node_modules/parent/node_modules/example'],
    via: [{ source: 12345 }]
  }
})

function activeBaseline() {
  const baseline = proposedBaseline(known)
  baseline.expiresAt = '2099-01-01T00:00:00.000Z'
  return baseline
}

test('Flowise audit gate admits only the exact known package path and advisory fingerprint', () => {
  const result = assertAuditAgainstBaseline(known, activeBaseline(), new Date('2026-08-12T00:00:00.000Z'))
  assert.equal(result.governedFindingCount, 1)
  assert.equal(result.nonReachabilityClaim, false)
})

test('Flowise audit gate rejects a new advisory, dependency path, or governed package', () => {
  for (const changed of [
    audit({ example: { ...known.vulnerabilities.example, via: [{ source: 99999 }] } }),
    audit({ example: { ...known.vulnerabilities.example, range: '<3.0.0' } }),
    audit({ example: { ...known.vulnerabilities.example, nodes: ['node_modules/example'] } }),
    audit({ ...known.vulnerabilities, added: { severity: 'critical', range: '*', nodes: ['node_modules/added'], via: [{ source: 7 }] } })
  ]) {
    assert.throws(
      () => assertAuditAgainstBaseline(changed, activeBaseline(), new Date('2026-08-12T00:00:00.000Z')),
      error => error?.code === 'FLOWISE_AUDIT_NEW_OR_CHANGED_FINDING'
    )
  }
})

test('Flowise audit gate allows resolved findings but expires the exception automatically', () => {
  const baseline = activeBaseline()
  const clean = audit({})
  assert.equal(assertAuditAgainstBaseline(clean, baseline, new Date('2026-08-12T00:00:00.000Z')).resolvedExceptionCount, 1)
  baseline.expiresAt = '2026-08-12T00:00:00.000Z'
  assert.throws(
    () => assertAuditAgainstBaseline(known, baseline, new Date('2026-08-12T00:00:00.000Z')),
    error => error?.code === 'FLOWISE_AUDIT_EXCEPTION_EXPIRED'
  )
})

test('Flowise audit gate admits a monotonic reduction of an unexpired known finding', () => {
  const historical = audit({
    example: {
      severity: 'critical',
      range: '*',
      nodes: ['node_modules/example', 'node_modules/parent/node_modules/example'],
      via: [{ source: 12345 }, 'legacy-parent']
    }
  })
  const reduced = audit({
    example: {
      severity: 'high',
      range: '*',
      nodes: ['node_modules/example'],
      via: [{ source: 12345 }]
    }
  })
  const baseline = proposedBaseline(historical)
  baseline.expiresAt = '2099-01-01T00:00:00.000Z'
  const result = assertAuditAgainstBaseline(reduced, baseline, new Date('2026-08-12T00:00:00.000Z'))
  assert.equal(result.reducedExceptionCount, 1)
})

test('Flowise audit gate rejects a baseline entry whose fingerprint was not derived from its fields', () => {
  const baseline = activeBaseline()
  baseline.allowed[0].fingerprint = '0'.repeat(64)
  assert.throws(
    () => assertAuditAgainstBaseline(known, baseline, new Date('2026-08-12T00:00:00.000Z')),
    error => error?.code === 'FLOWISE_AUDIT_BASELINE_ENTRY_INVALID'
  )
})
