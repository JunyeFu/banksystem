'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  canonicalHash,
  minimalExportPackage,
  requiredCollections,
  validateExportPackage
} = require('../i10-flowise-export-package.cjs')
const { allowedDataRoot } = require('../i10-flowise-export-import-isolated.cjs')

function fixture(overrides = {}) {
  const flowData = overrides.flowData || { nodes: [], edges: [] }
  const chatbotConfig = overrides.chatbotConfig || { showAgentMessages: false }
  const publication = {
    flowId: 'flow-1',
    name: 'target-flow',
    deployed: true,
    isPublic: false,
    primaryFlowVersion: 7,
    deployedFlowDataSha256: canonicalHash(flowData),
    chatbotConfigSha256: canonicalHash(chatbotConfig)
  }
  const full = Object.fromEntries(requiredCollections.map(name => [name, []]))
  full.AgentFlowV2 = [{
    id: publication.flowId,
    name: publication.name,
    type: 'AGENTFLOW',
    deployed: true,
    isPublic: false,
    flowData,
    chatbotConfig
  }]
  return { full, publication }
}

test('Flowise export projection retains exactly one AgentFlowV2 and no runtime collections', () => {
  const { full, publication } = fixture()
  full.ChatMessage.push({ id: 'unrelated-message', content: 'private runtime data' })
  full.Execution.push({ id: 'unrelated-execution' })
  const projected = minimalExportPackage(full, publication)
  const result = validateExportPackage(projected, { publication })
  assert.equal(result.deployed, true)
  assert.equal(result.isPublic, false)
  assert.equal(projected.AgentFlowV2.length, 1)
  assert.ok(requiredCollections.filter(name => name !== 'AgentFlowV2').every(name => projected[name].length === 0))
})

test('Flowise package rejects unrelated runtime rows and non-deployed or public flows', () => {
  const { full, publication } = fixture()
  full.ChatMessage.push({ id: 'message-1' })
  assert.throws(() => validateExportPackage(full, { publication }), /I10_EXPORT_PACKAGE_UNRELATED_COLLECTION_NOT_EMPTY:ChatMessage/)
  full.ChatMessage.length = 0
  full.AgentFlowV2[0].deployed = false
  assert.throws(() => validateExportPackage(full, { publication }), /I10_EXPORT_PACKAGE_DEPLOYED_FLAG_INVALID/)
  full.AgentFlowV2[0].deployed = true
  full.AgentFlowV2[0].isPublic = true
  assert.throws(() => validateExportPackage(full, { publication }), /I10_EXPORT_PACKAGE_PUBLIC_FLAG_INVALID/)
})

test('Flowise package rejects secret-like values and absolute host paths', () => {
  const token = ['sk', 'abcdefghijklmnop'].join('-')
  const secretFixture = fixture({ flowData: { token } })
  secretFixture.publication.deployedFlowDataSha256 = canonicalHash(secretFixture.full.AgentFlowV2[0].flowData)
  assert.throws(() => validateExportPackage(secretFixture.full, { publication: secretFixture.publication }), /I10_EXPORT_PACKAGE_SECRET_CONTENT/)
  const pathFixture = fixture({ flowData: { output: 'C:\\private\\artifact.txt' } })
  pathFixture.publication.deployedFlowDataSha256 = canonicalHash(pathFixture.full.AgentFlowV2[0].flowData)
  assert.throws(() => validateExportPackage(pathFixture.full, { publication: pathFixture.publication }), /I10_EXPORT_PACKAGE_ABSOLUTE_PATH_CONTENT/)
})

test('Flowise package does not confuse serialized regex escapes with an absolute host path', () => {
  const regexFixture = fixture({ flowData: { source: "const value = text.replace(/\\s+/g, ' ')" } })
  regexFixture.publication.deployedFlowDataSha256 = canonicalHash(regexFixture.full.AgentFlowV2[0].flowData)
  assert.equal(validateExportPackage(regexFixture.full, { publication: regexFixture.publication }).deployed, true)
})

test('isolated import always allocates an owned unique directory below an allowed temp parent', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-export-test-parent-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const first = allowedDataRoot(parent)
  const second = allowedDataRoot(parent)
  assert.notEqual(first, second)
  assert.equal(path.dirname(first), fs.realpathSync.native(parent))
  assert.match(path.basename(first), /^hengzhun-i10-isolated-/)
})
