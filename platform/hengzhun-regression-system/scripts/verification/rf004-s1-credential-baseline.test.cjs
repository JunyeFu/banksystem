'use strict'

// RF-004-S1: credential binding archaeology baseline (zero code changes).
// Freezes the current execution credential binding facts (C1-C5) as
// machine-checkable reverse anchors for B1/B2, and confirms the v7 consumer
// surface never passes credentialAlias (Flowise stays untouched). Only alias
// and reference SHAPES are asserted - no credential values are ever read.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const mcpServer = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const mcpAdapter = fs.readFileSync(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'), 'utf8')
const harnessService = fs.readFileSync(path.join(root, 'harness/src/service.ts'), 'utf8')
const harnessSchemas = fs.readFileSync(path.join(root, 'harness/src/schemas.ts'), 'utf8')
const agentflow = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/agentflow-v7.json'), 'utf8'))

test('C1 (S2 flipped): MCP run_submit/schedule_create no longer inject a credential by default', () => {
  // RF-004-S2 (DP-S4-1=A): default path injects no credential; the frozen
  // i3-customer value survives only behind the explicit legacy channel.
  assert.match(mcpAdapter, /FROZEN_EXECUTION_CREDENTIAL_ALIAS = Object\.freeze\(\{ credentialAlias: 'i3-customer' \}\)/, 'frozen alias constant must remain as the legacy value')
  assert.match(mcpAdapter, /function normalizeCredentialBinding\(legacy = false\)/, 'binding must default to no injection')
  const runBlock = mcpServer.slice(mcpServer.indexOf("registerTool('run_submit'"), mcpServer.indexOf("registerTool('schedule_create'"))
  assert.match(runBlock, /normalizeCredentialBinding\(legacyCredentialBinding\)/, 'run_submit must pass the legacy switch')
  assert.match(runBlock, /\.\.\.\(binding\.credentialAlias \? \{ credentialAlias: binding\.credentialAlias \} : \{\}\)/, 'run_submit must attach the alias conditionally')
  const scheduleBlock = mcpServer.slice(mcpServer.indexOf("registerTool('schedule_create'"), mcpServer.indexOf("registerTool('schedule_get'"))
  assert.match(scheduleBlock, /normalizeCredentialBinding\(legacyCredentialBinding\)/, 'schedule_create must pass the legacy switch')
  assert.match(scheduleBlock, /\.\.\.\(binding\.credentialAlias \? \{ credentialAlias: binding\.credentialAlias \} : \{\}\)/, 'schedule_create must attach the alias conditionally')
})

test('C2 (S3 flipped): Harness enqueueRun accepts a nullable credentialAlias', () => {
  // RF-004-S3: the alias is optional; no injection persists NULL and the
  // payload omits the alias (the claim passes the authoritative credentialRef)
  assert.match(harnessService, /credentialAlias: string \| null; fixtureScope\?: string/, 'enqueueRun input must accept a nullable alias')
  assert.match(harnessService, /\.\.\.\(input\.credentialAlias \? \{ credentialAlias: input\.credentialAlias \} : \{\}\)/, 'payload must attach the alias conditionally')
  assert.match(harnessService, /input\.credentialAlias \?\? null, fixtureNamespace/, 'runs table must persist NULL without injection')
})

test('C3: the candidate validation path already passes credentialRef through (precedent)', () => {
  assert.match(harnessService, /credentialAlias: 'i3-customer'/, 'validation path still uses the frozen alias (S1 baseline)')
  assert.match(harnessService, /stability_policy_version\) === 'I10_2X2_V1' && typeof definition\.credentialRef === 'string' \? \{ credentialRef: definition\.credentialRef \}/, 'I10_2X2_V1 must pass credentialRef through')
  assert.match(harnessService, /\? \{ entryUrl: definition\.entryUrl \}/, 'entryUrl must pass through with the credentialRef')
})

test('C4: credentialAlias is a bounded text field in the harness schemas', () => {
  const occurrences = (harnessSchemas.match(/credentialAlias: boundedText\(128\)/g) || []).length
  assert.ok(occurrences >= 4, `credentialAlias must be a boundedText schema in >=4 places, got ${occurrences}`)
})

test('C5: v7 consumers never pass credentialAlias (Flowise zero-change boundary)', () => {
  let runNodes = 0
  let scheduleNodes = 0
  for (const node of agentflow.nodes) {
    if (node.data?.type !== 'Tool') continue
    const inputs = node.data.inputs || {}
    const actions = inputs.toolAgentflowSelectedToolConfig?.mcpActions || []
    if (!actions.length) continue
    const args = (inputs.toolInputArgs || []).filter(a => typeof a === 'object').map(a => a.inputArgName)
    if (actions[0] === 'run_submit') {
      runNodes += 1
      assert.ok(!args.includes('credentialAlias'), 'run_submit node must not pass credentialAlias')
    }
    if (actions[0] === 'schedule_create') {
      scheduleNodes += 1
      assert.ok(!args.includes('credentialAlias'), 'schedule_create node must not pass credentialAlias')
    }
  }
  assert.ok(runNodes >= 2, `expected >=2 run_submit nodes, got ${runNodes}`)
  assert.ok(scheduleNodes >= 4, `expected >=4 schedule_create nodes, got ${scheduleNodes}`)
})
