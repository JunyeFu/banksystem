'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { verifyRuntimeFork } = require('../i10-build-flowise-runtime-fork.cjs')
const { parseProbeOptions } = require('../i10-flowise-runtime-probe.cjs')

const root = path.resolve(__dirname, '..', '..')
const appRoot = path.join(root, 'flowise', 'app')
const policy = JSON.parse(fs.readFileSync(path.join(root, 'flowise', 'i10', 'flowise-runtime-fork-policy-v1.json'), 'utf8'))
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

test('runtime probe forwards an explicit acquisition policy through its public CLI seam', () => {
  const options = parseProbeOptions([
    '--app-root', 'D:/isolated-flowise',
    '--acquisition-policy', 'D:/isolated-flowise/acquisition-policy.json'
  ], {})
  assert.equal(options.appRoot, path.resolve('D:/isolated-flowise'))
  assert.equal(options.acquisitionPolicyPath, path.resolve('D:/isolated-flowise/acquisition-policy.json'))
})

test('effective Flowise runtime fork is complete and internally hashed', () => {
  const result = verifyRuntimeFork({ appRoot })
  assert.equal(result.status, 'READY')
  assert.equal(result.manifest.upstream.flowise, '3.1.4')
  assert.deepEqual(result.manifest.allowedNodeNames, policy.allowedNodeNames)
  assert.deepEqual(result.manifest.allowedCredentialNames, ['openAIApi'])
  assert.deepEqual(result.manifest.reachablePeerIssues, [])
  assert.ok(result.manifest.packages.length >= result.manifest.reachablePackages.length)
  assert.match(result.manifest.closureHash, /^[0-9a-f]{64}$/)
})

test('critical officeparser and decompress chain is physically absent and unreachable', () => {
  const result = verifyRuntimeFork({ appRoot })
  for (const name of ['officeparser', 'decompress']) {
    assert.ok(result.manifest.criticalRemovedPackages.includes(name))
    assert.ok(!result.manifest.packages.some(item => item.name === name))
    assert.ok(!result.manifest.reachablePackages.some(item => item.name === name))
    assert.equal(fs.existsSync(path.join(appRoot, 'node_modules', name)), false)
  }
})

test('NodesPool governed file guard runs before require', () => {
  const source = fs.readFileSync(path.join(appRoot, 'node_modules', 'flowise', 'dist', 'NodesPool.js'), 'utf8')
  const guard = source.indexOf('I10_FLOWISE_ALLOWED_NODE_FILES_BEFORE_REQUIRE_V1')
  const requireCall = source.indexOf('await require(file)')
  assert.ok(guard >= 0)
  assert.ok(requireCall > guard)
  assert.match(source, /if \(!allowed_node_files\.includes\(relative\)\)/)
})

test('unsupported networked features are removed before module loading while AgentflowV2 remains active', () => {
  const flowiseRoot = path.join(appRoot, 'node_modules', 'flowise')
  const componentsRoot = path.join(appRoot, 'node_modules', 'flowise-components')
  const chatflow = fs.readFileSync(path.join(flowiseRoot, 'dist/utils/buildChatflow.js'), 'utf8')
  const telemetry = fs.readFileSync(path.join(flowiseRoot, 'dist/utils/telemetry.js'), 'utf8')
  const email = fs.readFileSync(path.join(flowiseRoot, 'dist/enterprise/utils/sendEmail.js'), 'utf8')
  const handler = fs.readFileSync(path.join(componentsRoot, 'dist/src/handler.js'), 'utf8')
  assert.match(chatflow, /I10_FLOWISE_LEGACY_AGENT_GRAPH_DISABLED_ADVISORY_V1/)
  assert.match(chatflow, /const isAgentFlowV2 = chatflow\.type === 'AGENTFLOW'/)
  assert.match(chatflow, /return \(0, buildAgentflow_1\.executeAgentFlow\)/)
  assert.doesNotMatch(chatflow, /require\("\.\/buildAgentGraph"\)/)
  assert.match(telemetry, /I10_FLOWISE_GEOIP_TELEMETRY_DISABLED_ADVISORY_V1/)
  assert.doesNotMatch(telemetry, /require\("geoip-lite"\)/)
  assert.match(email, /I10_FLOWISE_SMTP_DISABLED_ADVISORY_V1/)
  assert.doesNotMatch(email, /require\("nodemailer"\)/)
  assert.match(handler, /I10_FLOWISE_EXTERNAL_ANALYTICS_DISABLED_ADVISORY_V1/)
  for (const moduleName of ['langsmith', 'langwatch', 'langfuse-langchain', '@opentelemetry/sdk-trace-node']) {
    assert.ok(!handler.includes(`require("${moduleName}")`), `${moduleName} still loads at module initialization`)
  }
})

test('runtime acquisition lock mirrors the exact Flowise app lock', () => {
  assert.equal(hash(path.join(root, 'flowise', 'runtime-package-lock.json')), hash(path.join(appRoot, 'package-lock.json')))
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'flowise', 'runtime-package.json'), 'utf8'))
  assert.equal(metadata.engines.node, '24.19.0')
  assert.equal(metadata.dependencies.flowise, '3.1.4')
})

test('Stage9 consumes the effective fork manifest rather than claiming the full acquisition lock is shipped', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'i10-stage9-portable.cjs'), 'utf8')
  assert.match(source, /effectiveFlowiseComponents/)
  assert.match(source, /\.hengzhun-runtime-fork-v1\.json/)
  assert.doesNotMatch(source, /\.\.\.lockComponents\(path\.join\(candidateRoot, 'flowise', 'runtime-package-lock\.json'\)/)
})
