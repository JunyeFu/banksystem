'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/p5-agentflow-publication-v1.json'), 'utf8'))
const { buildFlowData, stableJson } = require(path.join(root, 'scripts/i9-agentflow-publish.cjs'))

test('P5 publication manifest freezes deterministic source parts and private deployment', () => {
  assert.equal(publication.sourceParts.length, 4)
  assert.equal(publication.type, 'AGENTFLOW')
  assert.equal(publication.deployed, true)
  assert.equal(publication.isPublic, false)
  for (const source of publication.sourceParts) {
    assert.match(source.sha256, /^[a-f0-9]{64}$/)
    assert.ok(fs.existsSync(path.join(root, source.path)))
  }
})

test('P5 published flow binds only runtime references and HiAgent-mapped node semantics', () => {
  const flow = buildFlowData(publication.credential.id)
  const text = stableJson(flow)
  assert.equal(text.includes('{{$vars.HENGZHUN_KNOWLEDGE_STORE}}'), false)
  assert.equal(text.includes('{{$vars.MIMO_BASE_URL}}'), false)
  assert.equal(text.includes('{{$vars.HZ_I9_MODEL_BASE_URL}}'), true)
  assert.equal(text.includes('{{$vars.HENGZHUN_MCP_TOKEN}}'), true)
  assert.equal(text.includes(publication.credential.id), true)
  for (const forbidden of ['shellAgentflow', 'httpAgentflow', 'codeAgentflow', 'databaseAgentflow', 'fileAgentflow']) {
    assert.equal(text.includes(forbidden), false)
  }
  const nodeNames = new Set(flow.nodes.map(node => node.data?.name))
  assert.ok(nodeNames.has('humanInputAgentflow'))
  assert.ok(nodeNames.has('toolAgentflow'))
  assert.ok(nodeNames.has('llmAgentflow'))
})

test('P5 scripts use public Flowise APIs and never mutate the platform SQLite directly', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/i9-agentflow-publish.cjs'), 'utf8')
  const contract = `${script}\n${JSON.stringify(publication)}`
  for (const route of ['/api/v1/credentials', '/api/v1/export-import/import', '/api/v1/chatflows/', '/api/v1/export-import/export']) {
    assert.ok(contract.includes(route))
  }
  assert.equal(script.includes('database.sqlite'), false)
  assert.equal(script.includes('UPDATE chat_flow'), false)
  assert.equal(script.includes('INSERT INTO chat_flow'), false)
})
