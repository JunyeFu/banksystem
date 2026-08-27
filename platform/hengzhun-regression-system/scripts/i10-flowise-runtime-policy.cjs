#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

// I10 is an AgentFlowV2-only deployment.  Flowise ships hundreds of optional
// integrations in one package, so expose only the node kinds referenced by the
// governed graph.  This is a reachability boundary, not a claim that loading a
// bundled third-party module makes its advisory disappear.
const ALLOWED_NODE_NAMES = Object.freeze([
  // AgentFlow runtime dependencies referenced from governed node inputs.
  'chatOpenAI',
  'conditionAgentflow',
  'customMCP',
  'customFunctionAgentflow',
  'directReplyAgentflow',
  'humanInputAgentflow',
  'llmAgentflow',
  'startAgentflow',
  'toolAgentflow'
])

function fail(code, details = '') {
  const error = new Error(details ? `${code}:${details}` : code)
  error.code = code
  throw error
}

function assertNodeEngineCompatible(appRoot, nodeVersion = process.version, satisfiesOverride) {
  const absoluteRoot = path.resolve(appRoot)
  const flowisePackagePath = path.join(absoluteRoot, 'node_modules', 'flowise', 'package.json')
  if (!fs.existsSync(flowisePackagePath)) fail('I10_FLOWISE_PACKAGE_MISSING', flowisePackagePath)
  const flowisePackage = JSON.parse(fs.readFileSync(flowisePackagePath, 'utf8'))
  const required = String(flowisePackage?.engines?.node || '').trim()
  if (!required) fail('I10_FLOWISE_NODE_ENGINE_MISSING')
  const satisfies = satisfiesOverride || createRequire(path.join(absoluteRoot, 'package.json'))('semver').satisfies
  if (!satisfies(nodeVersion, required, { includePrerelease: true })) {
    fail('I10_FLOWISE_NODE_ENGINE_UNSUPPORTED', `actual=${nodeVersion},required=${required}`)
  }
  return Object.freeze({ actual: nodeVersion, required })
}

function walkJavaScript(directory, output = []) {
  if (!fs.existsSync(directory)) fail('I10_FLOWISE_COMPONENT_NODES_MISSING', directory)
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walkJavaScript(absolute, output)
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(absolute)
  }
  return output
}

function discoverInstalledNodeNames(appRoot) {
  const nodesRoot = path.join(path.resolve(appRoot), 'node_modules', 'flowise-components', 'dist', 'nodes')
  const names = new Set()
  for (const file of walkJavaScript(nodesRoot)) {
    const source = fs.readFileSync(file, 'utf8')
    const matcher = /this\.name\s*=\s*(['"])([A-Za-z0-9_-]+)\1/g
    for (let match = matcher.exec(source); match; match = matcher.exec(source)) names.add(match[2])
  }
  if (names.size < ALLOWED_NODE_NAMES.length) fail('I10_FLOWISE_COMPONENT_NODE_DISCOVERY_INCOMPLETE', String(names.size))
  return Object.freeze([...names].sort((left, right) => left.localeCompare(right, 'en')))
}

function graphNodeNames(graphPath = path.join(root, 'flowise', 'i10', 'agentflow-v7.json')) {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'))
  const names = [...new Set((graph.nodes || []).map(node => String(node?.data?.name || '')).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en'))
  if (!names.length) fail('I10_FLOWISE_GRAPH_NODE_SET_EMPTY')
  return Object.freeze(names)
}

function flowiseRuntimePolicy(appRoot, options = {}) {
  const nodeEngine = assertNodeEngineCompatible(appRoot, options.nodeVersion, options.satisfies)
  const installed = discoverInstalledNodeNames(appRoot)
  const graphNames = graphNodeNames(options.graphPath)
  const allowed = new Set(ALLOWED_NODE_NAMES)
  const unexpectedGraphNodes = graphNames.filter(name => !allowed.has(name))
  if (unexpectedGraphNodes.length) fail('I10_FLOWISE_GRAPH_NODE_NOT_ALLOWLISTED', unexpectedGraphNodes.join(','))
  const missing = graphNames.filter(name => !installed.includes(name))
  if (missing.length) fail('I10_FLOWISE_GRAPH_NODE_NOT_INSTALLED', missing.join(','))
  const disabled = installed.filter(name => !allowed.has(name))
  if (!disabled.length) fail('I10_FLOWISE_DISABLED_NODE_SET_EMPTY')
  return Object.freeze({
    schemaVersion: 'hengzhun-i10-flowise-runtime-policy-v1',
    allowedNodeNames: ALLOWED_NODE_NAMES,
    graphNodeNames: graphNames,
    disabledNodeNames: Object.freeze(disabled),
    nodeEngine,
    environment: Object.freeze({
      SHOW_COMMUNITY_NODES: 'false',
      DISABLED_NODES: disabled.join(','),
      HENGZHUN_FLOWISE_ALLOWED_NODE_FILES: policyAllowedNodeFiles(options.forkPolicyPath).join(';'),
      STORAGE_TYPE: 'local',
      SECRETKEY_STORAGE_TYPE: 'local'
    })
  })
}

function policyAllowedNodeFiles(policyPath = path.join(root, 'flowise', 'i10', 'flowise-runtime-fork-policy-v1.json')) {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  const entries = [...new Set(policy.allowedNodeEntries || [])].sort((left, right) => left.localeCompare(right, 'en'))
  if (!entries.length) fail('I10_FLOWISE_FORK_ALLOWED_NODE_FILES_EMPTY')
  return Object.freeze(entries)
}

function assertEnabledNodeReadback(nodes, policy) {
  if (!Array.isArray(nodes)) fail('I10_FLOWISE_NODE_READBACK_INVALID')
  const names = [...new Set(nodes.map(node => String(node?.name || '')).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en'))
  const allowed = new Set(policy.allowedNodeNames)
  const unexpected = names.filter(name => !allowed.has(name))
  const missing = policy.graphNodeNames.filter(name => !names.includes(name))
  if (unexpected.length) fail('I10_FLOWISE_NODE_READBACK_EXPOSES_DISABLED', unexpected.join(','))
  if (missing.length) fail('I10_FLOWISE_NODE_READBACK_MISSING_GRAPH_NODE', missing.join(','))
  return Object.freeze(names)
}

module.exports = {
  ALLOWED_NODE_NAMES,
  assertNodeEngineCompatible,
  assertEnabledNodeReadback,
  discoverInstalledNodeNames,
  flowiseRuntimePolicy,
  graphNodeNames
  , policyAllowedNodeFiles
}

if (require.main === module) {
  const appRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'flowise', 'app')
  const policy = flowiseRuntimePolicy(appRoot)
  process.stdout.write(`${JSON.stringify({
    schemaVersion: policy.schemaVersion,
    allowedNodeNames: policy.allowedNodeNames,
    graphNodeNames: policy.graphNodeNames,
    disabledNodeCount: policy.disabledNodeNames.length
  }, null, 2)}\n`)
}
