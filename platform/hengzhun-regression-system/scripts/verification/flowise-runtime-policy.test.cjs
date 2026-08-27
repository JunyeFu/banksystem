'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  ALLOWED_NODE_NAMES,
  assertNodeEngineCompatible,
  assertEnabledNodeReadback,
  flowiseRuntimePolicy
} = require('../i10-flowise-runtime-policy.cjs')

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-flowise-policy-'))
  const nodes = path.join(root, 'node_modules', 'flowise-components', 'dist', 'nodes')
  fs.mkdirSync(nodes, { recursive: true })
  const declarations = [...ALLOWED_NODE_NAMES, 'untrustedOptionalIntegration']
    .map(name => `this.name = '${name}'`)
    .join('\n')
  fs.writeFileSync(path.join(nodes, 'fixture.js'), declarations)
  fs.mkdirSync(path.join(root, 'node_modules', 'flowise'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'flowise', 'package.json'), JSON.stringify({
    name: 'flowise',
    version: '3.1.4',
    engines: { node: '^24' }
  }))
  const graphPath = path.join(root, 'agentflow.json')
  fs.writeFileSync(graphPath, JSON.stringify({
    nodes: ALLOWED_NODE_NAMES.map(name => ({ data: { name } }))
  }))
  return { root, graphPath }
}

test('runtime policy exposes only governed graph nodes and forces local storage', t => {
  const current = fixture()
  t.after(() => fs.rmSync(current.root, { recursive: true, force: true }))
  const policy = flowiseRuntimePolicy(current.root, {
    graphPath: current.graphPath,
    nodeVersion: 'v24.1.0',
    satisfies: (actual, required) => actual.startsWith('v24.') && required === '^24'
  })
  assert.deepEqual(policy.graphNodeNames, [...ALLOWED_NODE_NAMES].sort())
  assert.deepEqual(policy.disabledNodeNames, ['untrustedOptionalIntegration'])
  assert.equal(policy.environment.SHOW_COMMUNITY_NODES, 'false')
  assert.equal(policy.environment.STORAGE_TYPE, 'local')
  assert.equal(policy.environment.SECRETKEY_STORAGE_TYPE, 'local')
  assert.deepEqual(policy.nodeEngine, { actual: 'v24.1.0', required: '^24' })
})

test('runtime policy fails closed when the managed Node runtime violates Flowise engines', t => {
  const current = fixture()
  t.after(() => fs.rmSync(current.root, { recursive: true, force: true }))
  assert.throws(
    () => assertNodeEngineCompatible(current.root, 'v20.20.2', () => false),
    /I10_FLOWISE_NODE_ENGINE_UNSUPPORTED:actual=v20.20.2,required=\^24/
  )
})

test('component readback fails closed when a disabled node remains reachable', t => {
  const current = fixture()
  t.after(() => fs.rmSync(current.root, { recursive: true, force: true }))
  const policy = flowiseRuntimePolicy(current.root, {
    graphPath: current.graphPath,
    nodeVersion: 'v24.1.0',
    satisfies: () => true
  })
  assert.throws(
    () => assertEnabledNodeReadback([
      ...ALLOWED_NODE_NAMES.map(name => ({ name })),
      { name: 'untrustedOptionalIntegration' }
    ], policy),
    /I10_FLOWISE_NODE_READBACK_EXPOSES_DISABLED/
  )
})

test('component readback requires every node used by the governed graph', t => {
  const current = fixture()
  t.after(() => fs.rmSync(current.root, { recursive: true, force: true }))
  const policy = flowiseRuntimePolicy(current.root, {
    graphPath: current.graphPath,
    nodeVersion: 'v24.1.0',
    satisfies: () => true
  })
  assert.throws(
    () => assertEnabledNodeReadback(ALLOWED_NODE_NAMES.slice(1).map(name => ({ name })), policy),
    /I10_FLOWISE_NODE_READBACK_MISSING_GRAPH_NODE/
  )
})
