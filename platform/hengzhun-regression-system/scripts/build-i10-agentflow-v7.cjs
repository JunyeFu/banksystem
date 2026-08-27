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

// A cross-session poll can observe a journey whose asynchronous authoring job
// has already failed.  v6 only distinguished "candidate exists" from
// "candidate absent", so a terminal FAILED journey fell through to the
// default "authoring processing" reply forever.  Keep the rollback graph
// byte-addressable and close the gap only in v7: FAILED is an explicit terminal
// route, while the unmatched default remains the sole processing route.
const crossSessionRouteId = 'conditionAgentflow_i10_v4_cross_session_route'
const crossSessionProcessingReplyId = 'directReplyAgentflow_i10_v6_cross_session_authoring_processing'
const crossSessionFailureReplyId = 'directReplyAgentflow_i10_v7_cross_session_authoring_failed'
const crossSessionRoute = flow.nodes.find(nodeItem => nodeItem.id === crossSessionRouteId)
const crossSessionProcessingReply = flow.nodes.find(nodeItem => nodeItem.id === crossSessionProcessingReplyId)
if (!crossSessionRoute || !crossSessionProcessingReply) {
  throw new Error('I10_V7_CROSS_SESSION_AUTHORING_ROUTE_MISSING')
}
const existingCrossSessionConditions = [...crossSessionRoute.data.inputs.conditions]
const existingCrossSessionAnchors = [...crossSessionRoute.data.outputAnchors]
if (existingCrossSessionAnchors.length !== existingCrossSessionConditions.length + 1 ||
    existingCrossSessionAnchors.at(-1)?.label !== '作者化处理中') {
  throw new Error('I10_V7_CROSS_SESSION_ROUTE_SHAPE_INVALID')
}
const crossSessionExecutionFailureOutputIndex = existingCrossSessionConditions.length
const crossSessionFailureOutputIndex = crossSessionExecutionFailureOutputIndex + 1
const crossSessionProcessingOutputIndex = crossSessionFailureOutputIndex + 1
crossSessionRoute.data.inputs.conditions = [
  ...existingCrossSessionConditions,
  {
    type: 'string',
    value1: '{{$flow.state.journeyNextActionType}}',
    operation: 'equal',
    value2: 'QUERY_FAILURE'
  },
  {
    type: 'string',
    value1: '{{$flow.state.journeyStatus}}',
    operation: 'equal',
    value2: 'FAILED'
  }
]
crossSessionRoute.data.outputAnchors = [
  ...existingCrossSessionAnchors.slice(0, -1),
  { label: '读取执行失败并进入修复', name: String(crossSessionExecutionFailureOutputIndex) },
  { label: '作者化失败', name: String(crossSessionFailureOutputIndex) },
  { ...existingCrossSessionAnchors.at(-1), name: String(crossSessionProcessingOutputIndex) }
]
const processingEdge = flow.edges.find(edge =>
  edge.source === crossSessionRouteId && edge.target === crossSessionProcessingReplyId)
if (!processingEdge) throw new Error('I10_V7_CROSS_SESSION_PROCESSING_EDGE_MISSING')
processingEdge.sourceHandle = `${crossSessionRouteId}-output-${crossSessionProcessingOutputIndex}`
const crossSessionFailureReply = JSON.parse(JSON.stringify(crossSessionProcessingReply))
crossSessionFailureReply.id = crossSessionFailureReplyId
crossSessionFailureReply.data.id = crossSessionFailureReplyId
crossSessionFailureReply.data.label = '返回跨会话作者化失败终态'
crossSessionFailureReply.data.inputs.directReplyMessage =
  '## 作者化已失败\n\n系统已保留失败任务和脱敏诊断，没有生成候选、证书或正式运行。请先修复被测环境或失败原因，再从同一案例重新发起作者化；系统不会把失败任务继续显示为处理中。'
crossSessionFailureReply.position = {
  x: Number(crossSessionProcessingReply.position?.x || 0),
  y: Number(crossSessionProcessingReply.position?.y || 0) + 160
}
flow.nodes.push(crossSessionFailureReply)
const crossSessionFailureTaskId = 'toolAgentflow_i10_v7_cross_session_failure_task_get'
const legacyFailureTask = flow.nodes.find(nodeItem => nodeItem.id === 'toolAgentflow_task')
if (!legacyFailureTask) throw new Error('I10_V7_FAILURE_TASK_NODE_MISSING')
const crossSessionFailureTask = JSON.parse(JSON.stringify(legacyFailureTask))
crossSessionFailureTask.id = crossSessionFailureTaskId
crossSessionFailureTask.data.id = crossSessionFailureTaskId
crossSessionFailureTask.data.label = '跨会话读取失败任务'
crossSessionFailureTask.position = {
  x: Number(legacyFailureTask.position?.x || 0),
  y: Number(legacyFailureTask.position?.y || 0) + 160
}
flow.nodes.push(crossSessionFailureTask)
// Flowise condition/tool nodes with multiple inbound edges behave as joins.
// Reusing the legacy terminal parser therefore waits for the unrelated old
// task branch and silently stops. Clone the governed failure/repair subgraph
// so every node has one authoritative inbound chain in this execution.
const repairStartId = 'llmAgentflow_terminal'
const repairIds = new Set([repairStartId])
const repairQueue = [repairStartId]
while (repairQueue.length) {
  const source = repairQueue.shift()
  for (const edge of flow.edges.filter(item => item.source === source)) {
    if (source === 'conditionAgentflow_terminal' && edge.sourceHandle.endsWith('-output-0')) continue
    if (!repairIds.has(edge.target)) {
      repairIds.add(edge.target)
      repairQueue.push(edge.target)
    }
  }
}
const repairIdMap = new Map([...repairIds].map(id => [id, `${id}_i10_v7_cross_session`]))
function rewriteRepairReferences(value) {
  let text = JSON.stringify(value)
  for (const [from, to] of [...repairIdMap.entries()].sort((a, b) => b[0].length - a[0].length)) {
    text = text.split(from).join(to)
  }
  return JSON.parse(text)
}
for (const id of repairIds) {
  const original = flow.nodes.find(nodeItem => nodeItem.id === id)
  if (!original) throw new Error(`I10_V7_REPAIR_NODE_MISSING:${id}`)
  const cloned = rewriteRepairReferences(original)
  if (id === repairStartId) {
    cloned.data.inputs = JSON.parse(JSON.stringify(cloned.data.inputs)
      .split('toolAgentflow_task').join(crossSessionFailureTaskId))
  }
  flow.nodes.push(cloned)
}
const repairEdges = flow.edges.filter(edge => repairIds.has(edge.source) && repairIds.has(edge.target) &&
  !(edge.source === 'conditionAgentflow_terminal' && edge.sourceHandle.endsWith('-output-0')))
for (const edge of repairEdges) flow.edges.push(rewriteRepairReferences(edge))
flow.edges.push({
  id: 'edge-i10-v7-cross-session-execution-failed',
  source: crossSessionRouteId,
  target: crossSessionFailureTaskId,
  sourceHandle: `${crossSessionRouteId}-output-${crossSessionExecutionFailureOutputIndex}`,
  targetHandle: crossSessionFailureTaskId
})
flow.edges.push({
  id: 'edge-i10-v7-cross-session-failure-task-terminal',
  source: crossSessionFailureTaskId,
  target: repairIdMap.get(repairStartId),
  sourceHandle: `${crossSessionFailureTaskId}-output-toolAgentflow`,
  targetHandle: repairIdMap.get(repairStartId)
})
flow.edges.push({
  id: 'edge-i10-v7-cross-session-authoring-failed',
  source: crossSessionRouteId,
  target: crossSessionFailureReplyId,
  sourceHandle: `${crossSessionRouteId}-output-${crossSessionFailureOutputIndex}`,
  targetHandle: crossSessionFailureReplyId,
  type: 'buttonedge'
})
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
