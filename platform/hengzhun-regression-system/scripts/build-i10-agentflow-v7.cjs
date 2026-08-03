#!/usr/bin/env node
'use strict'

// v7 is a versioned projection of the currently hardened v6 graph.  v6 stays
// a byte-addressable rollback artifact.  The v7 wrapper is intentionally the
// only place that promotes a v6 build into the new release identity.
const crypto = require('node:crypto')
const cp = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const node = process.execPath
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
const writeJson = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`)
const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')

// Build the last rollback artifact deterministically first.  It keeps v6
// independently reproducible and ensures v7 never quietly inherits a manual
// Flowise-canvas change.
cp.execFileSync(node, [path.join(__dirname, 'build-i10-agentflow-v6.cjs')], { stdio: 'inherit' })
const flow = readJson('flowise/i10/agentflow-v6.json')
const manifest = readJson('flowise/i10/publication-manifest-v1.json')

flow.name = '衡准自动化回归主控-I10 v7最终标准化版'
flow.description = '衡准 I10 Agentflow v7：引用合同、发布身份、单动作续跑和可重跑验收收口。'
flow.i10Contract = {
  ...flow.i10Contract,
  schemaVersion: 'hengzhun-i10-agentflow-v7',
  generationAuthority: 'scripts/build-i10-agentflow-v7.cjs',
  rollbackFlowDataPath: 'flowise/i10/agentflow-v6.json',
  opaqueReferenceContract: 'contracts/i10/opaque-reference-v1.json',
  caseCatalog: 'contracts/i10/case-catalog-v1.json',
  journeyTransitionVersion: 'JourneyTransitionV2',
  acceptanceRecordVersion: 'AcceptanceRecordV3',
  mutationBoundary: 'ONE_MUTATING_MCP_PER_FLOWISE_EXECUTION'
}
// v6 establishes the JourneyTransitionV2 contract.  Replace only the explicit
// MCP argument values; never perform a raw JSON replacement that could alter
// user-facing history or a model prompt.
for (const nodeItem of flow.nodes) {
  const args = nodeItem?.data?.inputs?.toolInputArgs
  if (!Array.isArray(args)) continue
  for (const arg of args) {
    if (arg?.inputArgName === 'interactionContractVersion' && arg.inputArgValue === 'v5') {
      arg.inputArgValue = 'v6'
    }
  }
}
writeJson('flowise/i10/agentflow-v7.json', flow)
const layout = readJson('flowise/i10/agentflow-v6-layout.json')
writeJson('flowise/i10/agentflow-v7-layout.json', { ...layout, schemaVersion: 'hengzhun-i10-agentflow-layout-v7', flowVersion: 7 })

const primaryFlowSha256 = hash('flowise/i10/agentflow-v7.json')
writeJson('flowise/i10/publication-manifest-v1.json', {
  ...manifest,
  name: '衡准自动化回归主控-I10正式版',
  primaryFlowDataPath: 'flowise/i10/agentflow-v7.json',
  primaryFlowVersion: 7,
  primaryFlowSha256,
  layoutSnapshotPath: 'flowise/i10/agentflow-v7-layout.json',
  rollbackFlowDataPath: 'flowise/i10/agentflow-v6.json',
  rollbackFlowSha256: hash('flowise/i10/agentflow-v6.json'),
  deployed: false,
  deployedFlowDataSha256: null,
  publishState: 'BUILT_NOT_PUBLISHED',
  publicationEvidencePath: null,
  lastVerifiedAt: null
})
process.stdout.write('HENGZHUN_I10_AGENTFLOW_V7_BUILT\n')
