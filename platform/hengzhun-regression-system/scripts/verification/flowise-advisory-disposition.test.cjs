'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { classifyAudit, normalizeAuditNodePath } = require('../i10-flowise-advisory-disposition.cjs')

test('audit node paths are normalized without losing nested package identity', () => {
  assert.equal(normalizeAuditNodePath('node_modules/parent/node_modules/@scope/pkg'), 'parent/node_modules/@scope/pkg')
  assert.throws(() => normalizeAuditNodePath('../node_modules/pkg'), /I10_FLOWISE_AUDIT_NODE_PATH_INVALID/)
})

test('advisory disposition separates reachable, present-unreachable and acquisition-only paths', () => {
  const manifest = {
    closureHash: 'a'.repeat(64),
    packages: [
      { path: 'reachable', name: 'reachable', version: '1.0.0' },
      { path: 'present', name: 'present', version: '1.0.0' }
    ]
  }
  const audit = {
    metadata: { vulnerabilities: { critical: 2, high: 1 } },
    vulnerabilities: {
      reachable: { severity: 'critical', nodes: ['node_modules/reachable'], via: [] },
      present: { severity: 'high', nodes: ['node_modules/present'], via: [] },
      acquisition: { severity: 'critical', nodes: ['node_modules/acquisition'], via: [] }
    }
  }
  const result = classifyAudit(audit, manifest, { appRoot: process.cwd(), reachablePaths: new Set(['reachable']) })
  assert.deepEqual(result.dispositionCounts, {
    RUNTIME_REACHABLE: 1,
    RUNTIME_PRESENT_UNREACHABLE: 1,
    ACQUISITION_ONLY: 1,
    UNKNOWN: 0
  })
  assert.equal(result.blockingFindingCount, 2)
  assert.equal(result.dispositionGateStatus, 'BLOCKED')
  assert.equal(result.acquisitionRiskAccepted, false)
})

test('mixed audit nodes take the strongest runtime disposition', () => {
  const result = classifyAudit({
    vulnerabilities: {
      aggregate: { severity: 'critical', nodes: ['node_modules/absent', 'node_modules/reachable'], via: ['child'] }
    }
  }, {
    closureHash: 'b'.repeat(64),
    packages: [{ path: 'reachable', name: 'reachable', version: '1.0.0' }]
  }, { appRoot: process.cwd(), reachablePaths: new Set(['reachable']) })
  assert.equal(result.records[0].disposition, 'RUNTIME_REACHABLE')
  assert.deepEqual(result.records[0].nodes.map(node => node.disposition), ['ACQUISITION_ONLY', 'RUNTIME_REACHABLE'])
})

test('aggregate-only findings inherit governed child disposition instead of package presence', () => {
  const result = classifyAudit({
    vulnerabilities: {
      parent: { severity: 'critical', nodes: ['node_modules/parent'], via: ['child'] },
      child: { severity: 'critical', nodes: ['node_modules/absent-child'], via: [{ source: 123, name: 'child' }] }
    }
  }, {
    closureHash: 'c'.repeat(64),
    packages: [{ path: 'parent', name: 'parent', version: '1.0.0' }]
  }, { appRoot: process.cwd(), reachablePaths: new Set(['parent']) })
  const parent = result.records.find(record => record.name === 'parent')
  assert.equal(parent.aggregateOnly, true)
  assert.equal(parent.nodeDisposition, 'RUNTIME_REACHABLE')
  assert.equal(parent.disposition, 'ACQUISITION_ONLY')
  assert.equal(result.blockingFindingCount, 0)
})

test('critical aggregate ignores reachable high child when critical child is acquisition-only', () => {
  const result = classifyAudit({
    vulnerabilities: {
      parent: { severity: 'critical', nodes: ['node_modules/parent'], via: ['critical-child', 'high-child'] },
      'critical-child': { severity: 'critical', nodes: ['node_modules/absent-critical'], via: [{ source: 1, name: 'critical-child' }] },
      'high-child': { severity: 'high', nodes: ['node_modules/reachable-high'], via: [{ source: 2, name: 'high-child' }] }
    }
  }, {
    closureHash: 'd'.repeat(64),
    packages: [
      { path: 'parent', name: 'parent', version: '1.0.0' },
      { path: 'reachable-high', name: 'high-child', version: '1.0.0' }
    ]
  }, { appRoot: process.cwd(), reachablePaths: new Set(['parent', 'reachable-high']) })
  assert.equal(result.records.find(record => record.name === 'parent').disposition, 'ACQUISITION_ONLY')
})

test('direct advisory range applies to each physical node version instead of every same-name copy', () => {
  const result = classifyAudit({
    vulnerabilities: {
      package: {
        severity: 'high',
        nodes: ['node_modules/safe', 'node_modules/removed-vulnerable'],
        via: [{ source: 42, name: 'package', range: '<0.3.80' }]
      }
    }
  }, {
    closureHash: 'e'.repeat(64),
    packages: [{ path: 'safe', name: 'package', version: '1.1.20' }]
  }, { appRoot: process.cwd(), reachablePaths: new Set(['safe']) })
  const record = result.records[0]
  assert.deepEqual(record.directAffectedNodePaths, ['removed-vulnerable'])
  assert.equal(record.disposition, 'ACQUISITION_ONLY')
  assert.equal(result.dispositionGateStatus, 'READY')
})
