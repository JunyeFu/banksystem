#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const FLOW_REF = /\{\{\s*([A-Za-z][\w-]*)(?:\.output)?(?:\.[^}]*)?\s*\}\}/g
const STATE_REF = /\{\{\s*\$flow\.state\.([A-Za-z][\w-]*)\s*\}\}/g

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, output))
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, output))
  return output
}

function intersection(sets) {
  if (sets.length === 0) return new Set()
  return new Set([...sets[0]].filter(value => sets.slice(1).every(set => set.has(value))))
}

function reachableFrom(startId, adjacency, excludedId) {
  if (startId === excludedId) return new Set()
  const visited = new Set([startId])
  const queue = [startId]
  while (queue.length) {
    const current = queue.shift()
    for (const next of adjacency.get(current) || []) {
      if (next === excludedId || visited.has(next)) continue
      visited.add(next); queue.push(next)
    }
  }
  return visited
}

function validateAgentflow(flow) {
  const failures = []
  const nodes = new Map(flow.nodes.map(node => [node.id, node]))
  const starts = flow.nodes.filter(node => node.data?.name === 'startAgentflow')
  if (starts.length !== 1) failures.push(`START_NODE_COUNT:${starts.length}`)
  const startId = starts[0]?.id
  const adjacency = new Map(flow.nodes.map(node => [node.id, []]))
  const predecessors = new Map(flow.nodes.map(node => [node.id, []]))

  for (const edge of flow.edges) {
    if (!nodes.has(edge.source)) failures.push(`EDGE_SOURCE_MISSING:${edge.id}:${edge.source}`)
    if (!nodes.has(edge.target)) failures.push(`EDGE_TARGET_MISSING:${edge.id}:${edge.target}`)
    if (nodes.has(edge.source) && nodes.has(edge.target)) {
      adjacency.get(edge.source).push(edge.target)
      predecessors.get(edge.target).push(edge.source)
    }
  }

  const reachable = startId ? reachableFrom(startId, adjacency) : new Set()
  for (const node of flow.nodes) {
    if (!reachable.has(node.id)) failures.push(`NODE_UNREACHABLE:${node.id}`)
  }

  const nodeReferences = new Map()
  const stateReferences = new Map()
  for (const node of flow.nodes) {
    const refs = new Set(); const stateRefs = new Set()
    for (const value of collectStrings(node.data?.inputs || {})) {
      for (const match of value.matchAll(FLOW_REF)) {
        if (!['output', 'question'].includes(match[1])) refs.add(match[1])
      }
      for (const match of value.matchAll(STATE_REF)) stateRefs.add(match[1])
    }
    nodeReferences.set(node.id, refs); stateReferences.set(node.id, stateRefs)
  }

  for (const [targetId, refs] of nodeReferences) {
    for (const refId of refs) {
      if (!nodes.has(refId)) { failures.push(`REFERENCE_NODE_MISSING:${targetId}:${refId}`); continue }
      if (!reachable.has(refId)) { failures.push(`REFERENCE_NODE_UNREACHABLE:${targetId}:${refId}`); continue }
      if (reachableFrom(startId, adjacency, refId).has(targetId)) failures.push(`REFERENCE_NOT_PATH_SAFE:${targetId}:${refId}`)
    }
  }

  const declaredState = new Set((starts[0]?.data?.inputs?.startState || []).map(item => item.key))
  const producedState = new Map()
  for (const node of flow.nodes) {
    const inputs = node.data?.inputs || {}
    const updates = inputs.llmUpdateState || inputs.toolUpdateState || inputs.customFunctionUpdateState || inputs.agentUpdateState || inputs.executeFlowUpdateState || inputs.retrieverUpdateState || []
    producedState.set(node.id, new Set(updates.map(item => item.key)))
  }
  for (const [nodeId, refs] of stateReferences) {
    for (const key of refs) if (!declaredState.has(key)) failures.push(`STATE_KEY_UNDECLARED:${nodeId}:${key}`)
  }

  const stateIn = new Map(flow.nodes.map(node => [node.id, new Set(declaredState)]))
  const stateOut = new Map(flow.nodes.map(node => [node.id, new Set(declaredState)]))
  if (startId) {
    stateIn.set(startId, new Set())
    // Flowise initializes every declared startState key before the first edge is
    // evaluated. Treating those values as merely declared (but not produced)
    // creates false path-safety failures for persisted multi-turn state.
    stateOut.set(startId, new Set([...declaredState, ...producedState.get(startId)]))
  }
  for (let iteration = 0; iteration < flow.nodes.length * 4; iteration += 1) {
    let changed = false
    for (const node of flow.nodes) {
      if (node.id === startId || !reachable.has(node.id)) continue
      const incoming = intersection((predecessors.get(node.id) || []).filter(id => reachable.has(id)).map(id => stateOut.get(id)))
      const outgoing = new Set([...incoming, ...producedState.get(node.id)])
      const oldIn = stateIn.get(node.id); const oldOut = stateOut.get(node.id)
      const sameIn = oldIn.size === incoming.size && [...oldIn].every(key => incoming.has(key))
      const sameOut = oldOut.size === outgoing.size && [...oldOut].every(key => outgoing.has(key))
      if (!sameIn) stateIn.set(node.id, incoming)
      if (!sameOut) stateOut.set(node.id, outgoing)
      if (!sameIn || !sameOut) changed = true
    }
    if (!changed) break
  }
  for (const [nodeId, refs] of stateReferences) {
    for (const key of refs) if (!stateIn.get(nodeId)?.has(key)) failures.push(`STATE_NOT_ASSIGNED_ON_ALL_PATHS:${nodeId}:${key}`)
  }

  return [...new Set(failures)].sort()
}

if (require.main === module) {
  const productRoot = path.resolve(__dirname, '..')
  const flowPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(productRoot, 'flowise/i10/agentflow-v6.json')
  const failures = validateAgentflow(JSON.parse(fs.readFileSync(flowPath, 'utf8')))
  if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write('HENGZHUN_I10_AGENTFLOW_PATHS_OK\n')
  }
}

module.exports = { validateAgentflow }
