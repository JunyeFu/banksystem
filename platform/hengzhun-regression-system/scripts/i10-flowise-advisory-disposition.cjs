#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const semver = require('semver')
const { runAudit } = require('./check-flowise-audit.cjs')

const root = path.resolve(__dirname, '..')
const defaultAppRoot = path.join(root, 'flowise', 'app')
const governedSeverities = new Set(['high', 'critical'])
const dispositionRank = Object.freeze({ ACQUISITION_ONLY: 0, RUNTIME_PRESENT_UNREACHABLE: 1, RUNTIME_REACHABLE: 2 })
const severityRank = Object.freeze({ high: 1, critical: 2 })
const posix = value => String(value).replaceAll('\\', '/')

function fail(code, details = '') {
  const error = new Error(details ? `${code}:${details}` : code)
  error.code = code
  throw error
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function normalizeAuditNodePath(value) {
  const normalized = posix(value).replace(/^\.\//, '')
  if (!normalized.startsWith('node_modules/')) fail('I10_FLOWISE_AUDIT_NODE_PATH_INVALID', value)
  const relative = normalized.slice('node_modules/'.length)
  if (!relative || relative.split('/').includes('..') || path.isAbsolute(relative)) fail('I10_FLOWISE_AUDIT_NODE_PATH_INVALID', value)
  return relative
}

function resolveDependencyRecord(appRoot, nodeModulesRoot, recordsByPath, owner, dependencyName) {
  let current = path.join(nodeModulesRoot, ...owner.path.split('/'))
  while (true) {
    const candidate = path.join(current, 'node_modules', ...dependencyName.split('/'))
    const relative = posix(path.relative(nodeModulesRoot, candidate))
    if (recordsByPath.has(relative)) return recordsByPath.get(relative)
    const parent = path.dirname(current)
    if (parent === current || !path.resolve(parent).startsWith(path.resolve(appRoot))) return null
    current = parent
  }
}

function runtimeReachabilityGraph(appRoot, manifest) {
  const nodeModulesRoot = path.join(appRoot, 'node_modules')
  const recordsByPath = new Map((manifest.packages || []).map(record => [posix(record.path), record]))
  const reachable = new Set()
  const enqueued = new Set()
  const parents = new Map()
  const pending = []
  const enqueue = (record, parent = null, dependency = null) => {
    if (!record || reachable.has(record.path) || enqueued.has(record.path)) return
    enqueued.add(record.path)
    parents.set(record.path, parent ? { parent, dependency } : null)
    pending.push(record)
  }
  for (const seed of ['flowise', 'flowise-components', 'flowise-ui', 'connect-sqlite3']) enqueue(recordsByPath.get(seed))
  const components = recordsByPath.get('flowise-components')
  for (const item of manifest.reachablePackages || []) enqueue(resolveDependencyRecord(appRoot, nodeModulesRoot, recordsByPath, components, item.name), components.path, item.name)
  const flowise = recordsByPath.get('flowise')
  for (const item of manifest.serverReachablePackages || []) enqueue(resolveDependencyRecord(appRoot, nodeModulesRoot, recordsByPath, flowise, item.name), flowise.path, item.name)

  while (pending.length) {
    const record = pending.shift()
    if (!record || reachable.has(record.path)) continue
    reachable.add(record.path)
    if (record.name === 'flowise' || record.name === 'flowise-components' || record.name === 'flowise-ui') continue
    const packageJson = path.join(nodeModulesRoot, ...record.path.split('/'), 'package.json')
    if (!fs.existsSync(packageJson)) fail('I10_FLOWISE_RUNTIME_PACKAGE_METADATA_MISSING', record.path)
    const metadata = readJson(packageJson)
    const dependencies = new Set([
      ...Object.keys(metadata.dependencies || {}),
      ...Object.keys(metadata.optionalDependencies || {}),
      ...Object.keys(metadata.peerDependencies || {}).filter(name => !metadata.peerDependenciesMeta?.[name]?.optional)
    ])
    for (const dependencyName of dependencies) enqueue(resolveDependencyRecord(appRoot, nodeModulesRoot, recordsByPath, record, dependencyName), record.path, dependencyName)
  }
  return { reachable, parents }
}

function runtimeReachablePaths(appRoot, manifest) {
  return runtimeReachabilityGraph(appRoot, manifest).reachable
}

function reachabilityPath(target, parents) {
  if (!parents.has(target)) return []
  const result = [target]
  let cursor = target
  while (parents.get(cursor)) {
    cursor = parents.get(cursor).parent
    result.unshift(cursor)
  }
  return result
}

function classifyAudit(audit, manifest, options = {}) {
  const appRoot = path.resolve(options.appRoot || defaultAppRoot)
  const physicalRecords = new Map((manifest.packages || []).map(record => [posix(record.path), record]))
  const physical = new Set(physicalRecords.keys())
  const graph = options.reachablePaths
    ? { reachable: options.reachablePaths, parents: new Map() }
    : runtimeReachabilityGraph(appRoot, manifest)
  const reachable = graph.reachable
  const records = []
  const unknownNodePaths = []
  for (const [name, vulnerability] of Object.entries(audit?.vulnerabilities || {})) {
    const severity = String(vulnerability?.severity || '')
    if (!governedSeverities.has(severity)) continue
    const nodes = (vulnerability.nodes || []).map(raw => {
      let runtimePath
      try { runtimePath = normalizeAuditNodePath(raw) } catch (error) {
        unknownNodePaths.push(String(raw))
        return { auditPath: String(raw), runtimePath: null, disposition: 'UNKNOWN' }
      }
      const disposition = reachable.has(runtimePath)
        ? 'RUNTIME_REACHABLE'
        : physical.has(runtimePath)
          ? 'RUNTIME_PRESENT_UNREACHABLE'
          : 'ACQUISITION_ONLY'
      const installedVersion = physicalRecords.get(runtimePath)?.version || null
      return {
        auditPath: String(raw),
        runtimePath,
        installedVersion,
        disposition,
        ...(disposition === 'RUNTIME_REACHABLE' ? { reachabilityPath: reachabilityPath(runtimePath, graph.parents) } : {})
      }
    })
    const known = nodes.filter(node => node.disposition !== 'UNKNOWN')
    const disposition = known.length
      ? known.map(node => node.disposition).sort((left, right) => dispositionRank[right] - dispositionRank[left])[0]
      : 'UNKNOWN'
    const viaItems = vulnerability.via || []
    const directAdvisories = viaItems.filter(item => typeof item !== 'string').map(item => ({
      source: String(item?.source || item?.name || 'UNKNOWN'),
      range: String(item?.range || '')
    }))
    const directAffectedNodePaths = nodes.filter(node => {
      if (!directAdvisories.length) return false
      if (node.disposition === 'ACQUISITION_ONLY') return true
      if (!node.installedVersion) return false
      return directAdvisories.some(advisory => advisory.range && semver.satisfies(node.installedVersion, advisory.range, { includePrerelease: true }))
    }).map(node => node.runtimePath).filter(Boolean)
    records.push({
      name,
      severity,
      isDirect: Boolean(vulnerability.isDirect),
      range: String(vulnerability.range || ''),
      nodeDisposition: disposition,
      disposition,
      nodes,
      aggregateOnly: viaItems.length > 0 && viaItems.every(item => typeof item === 'string'),
      directAdvisoryCount: directAdvisories.length,
      directAffectedNodePaths,
      aggregateViaNames: viaItems.filter(item => typeof item === 'string').sort(),
      via: viaItems.map(item => typeof item === 'string' ? item : String(item?.name || item?.source || 'UNKNOWN')).sort()
    })
  }
  const recordsByName = new Map(records.map(record => [record.name, record]))
  const resolving = new Set()
  const resolveAggregateDisposition = record => {
    if (resolving.has(record.name)) return record.nodeDisposition
    resolving.add(record.name)
    if (record.nodes.length && record.nodes.every(node => node.disposition === 'ACQUISITION_ONLY')) {
      resolving.delete(record.name)
      record.disposition = 'ACQUISITION_ONLY'
      return record.disposition
    }
    const children = record.aggregateViaNames
      .map(name => recordsByName.get(name))
      .filter(child => child && severityRank[child.severity] >= severityRank[record.severity])
    const candidateDispositions = children.map(resolveAggregateDisposition)
    if (record.directAdvisoryCount) {
      candidateDispositions.push(...record.nodes
        .filter(node => record.directAffectedNodePaths.includes(node.runtimePath))
        .map(node => node.disposition))
    } else if (!record.via.length) {
      candidateDispositions.push(record.nodeDisposition)
    }
    if (record.directAdvisoryCount === 0 && record.aggregateViaNames.length && children.length === 0) candidateDispositions.push(record.nodeDisposition)
    const result = candidateDispositions.length
      ? candidateDispositions.sort((left, right) => dispositionRank[right] - dispositionRank[left])[0]
      : 'ACQUISITION_ONLY'
    resolving.delete(record.name)
    record.disposition = result
    return result
  }
  for (const record of records) resolveAggregateDisposition(record)
  records.sort((left, right) => left.severity.localeCompare(right.severity) || left.name.localeCompare(right.name, 'en'))
  const counts = { RUNTIME_REACHABLE: 0, RUNTIME_PRESENT_UNREACHABLE: 0, ACQUISITION_ONLY: 0, UNKNOWN: 0 }
  for (const record of records) counts[record.disposition] += 1
  const blocking = records.filter(record => ['RUNTIME_REACHABLE', 'RUNTIME_PRESENT_UNREACHABLE', 'UNKNOWN'].includes(record.disposition))
  const runtimeReachableCriticalCount = records.filter(record => record.severity === 'critical' && record.disposition === 'RUNTIME_REACHABLE').length
  const runtimeReachableHighCount = records.filter(record => record.severity === 'high' && record.disposition === 'RUNTIME_REACHABLE').length
  const runtimeReachableGovernedCount = runtimeReachableCriticalCount + runtimeReachableHighCount
  const runtimePresentUnreachableGovernedCount = records.filter(record => record.disposition === 'RUNTIME_PRESENT_UNREACHABLE').length
  return Object.freeze({
    schemaVersion: 'hengzhun-i10-flowise-advisory-disposition-v1',
    runtimeForkClosureHash: manifest.closureHash,
    auditCounts: audit.metadata?.vulnerabilities || {},
    governedFindingCount: records.length,
    dispositionCounts: counts,
    reachablePackagePathCount: reachable.size,
    unknownNodePaths: [...new Set(unknownNodePaths)].sort(),
    blockingFindingCount: blocking.length,
    runtimeReachableCriticalCount,
    runtimeReachableHighCount,
    runtimeReachableGovernedCount,
    runtimePresentUnreachableGovernedCount,
    dispositionGateStatus: runtimeReachableGovernedCount === 0 && runtimePresentUnreachableGovernedCount === 0 && unknownNodePaths.length === 0 ? 'READY' : 'BLOCKED',
    acquisitionRiskAccepted: false,
    records
  })
}

module.exports = {
  classifyAudit,
  normalizeAuditNodePath,
  runtimeReachabilityGraph,
  runtimeReachablePaths
}

if (require.main === module) {
  try {
    const appRootIndex = process.argv.indexOf('--app-root')
    const appRoot = appRootIndex >= 0 ? path.resolve(process.argv[appRootIndex + 1]) : defaultAppRoot
    const manifest = readJson(path.join(appRoot, 'node_modules', '.hengzhun-runtime-fork-v1.json'))
    const result = classifyAudit(runAudit(), manifest, { appRoot })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.dispositionGateStatus !== 'READY') process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`)
    process.exitCode = 1
  }
}
