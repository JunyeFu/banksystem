#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const productRoot = path.resolve(__dirname, '..')
const flowiseRoot = path.join(productRoot, 'flowise', 'app')
const baselinePath = path.join(__dirname, 'flowise-audit-exceptions.json')
const governedSeverities = new Set(['high', 'critical'])
const severityRank = Object.freeze({ high: 1, critical: 2 })

function canonicalRecord(name, vulnerability) {
  return {
    name,
    severity: String(vulnerability?.severity || ''),
    range: String(vulnerability?.range || ''),
    nodes: [...(vulnerability?.nodes || [])].map(String).sort(),
    via: [...(vulnerability?.via || [])]
      .map(item => typeof item === 'string' ? `dependency:${item}` : `advisory:${item?.source}`)
      .sort()
  }
}

function fingerprint(record) {
  return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')
}

function governedRecords(audit) {
  return Object.entries(audit?.vulnerabilities || {})
    .map(([name, vulnerability]) => canonicalRecord(name, vulnerability))
    .filter(record => governedSeverities.has(record.severity))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function baselineEntry(record) {
  return {
    name: record.name,
    severity: record.severity,
    range: record.range,
    nodes: record.nodes,
    via: record.via,
    advisories: record.via.filter(value => value.startsWith('advisory:')).map(value => value.slice('advisory:'.length)),
    fingerprint: fingerprint(record)
  }
}

function proposedBaseline(audit) {
  return {
    schemaVersion: 'hengzhun-flowise-audit-exceptions-v2',
    generatedAt: '2026-08-12',
    expiresAt: '2026-09-11T00:00:00.000Z',
    policy: 'TEMPORARY_KNOWN_FINDINGS_ONLY_NOT_A_NON_REACHABILITY_CLAIM',
    allowed: governedRecords(audit).map(baselineEntry)
  }
}

function isSubset(actual, expected) {
  const allowed = new Set(expected)
  return actual.every(value => allowed.has(value))
}

function isMonotonicReduction(actual, expected) {
  return severityRank[actual.severity] <= severityRank[expected.severity]
    && actual.range === expected.range
    && isSubset(actual.nodes, expected.nodes)
    && isSubset(actual.via, expected.via)
    && isSubset(actual.advisories, expected.advisories)
}

function assertAuditAgainstBaseline(audit, baseline, now = new Date()) {
  if (baseline?.schemaVersion !== 'hengzhun-flowise-audit-exceptions-v2'
      || baseline?.policy !== 'TEMPORARY_KNOWN_FINDINGS_ONLY_NOT_A_NON_REACHABILITY_CLAIM'
      || !Array.isArray(baseline?.allowed)) {
    throw Object.assign(new Error('FLOWISE_AUDIT_BASELINE_INVALID'), { code: 'FLOWISE_AUDIT_BASELINE_INVALID' })
  }
  const expiresAt = new Date(baseline.expiresAt)
  if (!Number.isFinite(expiresAt.getTime()) || now.getTime() >= expiresAt.getTime()) {
    throw Object.assign(new Error(`FLOWISE_AUDIT_EXCEPTION_EXPIRED:${baseline.expiresAt}`), { code: 'FLOWISE_AUDIT_EXCEPTION_EXPIRED' })
  }
  const allowed = new Map()
  for (const entry of baseline.allowed) {
    const entryRecord = entry && {
      name: entry.name,
      severity: entry.severity,
      range: entry.range,
      nodes: entry.nodes,
      via: entry.via
    }
    const derivedAdvisories = Array.isArray(entry?.via)
      ? entry.via.filter(value => String(value).startsWith('advisory:')).map(value => String(value).slice('advisory:'.length))
      : []
    if (!entry?.name || allowed.has(entry.name) || !governedSeverities.has(entry.severity)
        || typeof entry.range !== 'string' || !Array.isArray(entry.nodes) || !Array.isArray(entry.via)
        || !Array.isArray(entry.advisories)
        || !/^[0-9a-f]{64}$/.test(entry.fingerprint || '')
        || entry.fingerprint !== fingerprint(entryRecord)
        || JSON.stringify(entry.advisories) !== JSON.stringify(derivedAdvisories)) {
      throw Object.assign(new Error(`FLOWISE_AUDIT_BASELINE_ENTRY_INVALID:${entry?.name || 'UNKNOWN'}`), { code: 'FLOWISE_AUDIT_BASELINE_ENTRY_INVALID' })
    }
    allowed.set(entry.name, entry)
  }

  const actual = governedRecords(audit)
  const drift = []
  let reducedExceptionCount = 0
  for (const record of actual) {
    const expected = allowed.get(record.name)
    const actualEntry = baselineEntry(record)
    if (!expected) drift.push(`NEW:${record.severity}:${record.name}`)
    else if (expected.severity !== actualEntry.severity
        || expected.range !== actualEntry.range
        || JSON.stringify(expected.nodes) !== JSON.stringify(actualEntry.nodes)
        || JSON.stringify(expected.via) !== JSON.stringify(actualEntry.via)
        || JSON.stringify(expected.advisories) !== JSON.stringify(actualEntry.advisories)
        || expected.fingerprint !== actualEntry.fingerprint) {
      if (isMonotonicReduction(actualEntry, expected)) reducedExceptionCount += 1
      else drift.push(`CHANGED:${record.severity}:${record.name}:${actualEntry.fingerprint}`)
    }
  }
  if (drift.length) {
    throw Object.assign(new Error(`FLOWISE_AUDIT_NEW_OR_CHANGED_FINDING\n${drift.join('\n')}`), {
      code: 'FLOWISE_AUDIT_NEW_OR_CHANGED_FINDING',
      details: drift
    })
  }
  const actualNames = new Set(actual.map(record => record.name))
  return {
    current: audit.metadata?.vulnerabilities || {},
    governedFindingCount: actual.length,
    resolvedExceptionCount: baseline.allowed.filter(entry => !actualNames.has(entry.name)).length,
    reducedExceptionCount,
    expiresAt: baseline.expiresAt,
    nonReachabilityClaim: false
  }
}

function runAudit() {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!fs.existsSync(npmCli)) throw new Error(`FLOWISE_AUDIT_NPM_CLI_MISSING:${npmCli}`)
  const result = spawnSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--package-lock-only', '--json'], {
    cwd: flowiseRoot,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.error) throw result.error
  if (![0, 1].includes(result.status)) throw new Error(`FLOWISE_AUDIT_COMMAND_FAILED:${result.status}:${String(result.stderr || '').slice(0, 240)}`)
  try { return JSON.parse(result.stdout) }
  catch { throw new Error('FLOWISE_AUDIT_JSON_INVALID') }
}

function main() {
  const audit = runAudit()
  if (process.argv[2] === 'print-baseline') {
    process.stdout.write(`${JSON.stringify(proposedBaseline(audit), null, 2)}\n`)
    return
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  const result = assertAuditAgainstBaseline(audit, baseline)
  process.stdout.write(`${JSON.stringify({ event: 'flowise_audit_exception_gate_passed', ...result })}\n`)
}

if (require.main === module) {
  try { main() }
  catch (error) {
    process.stderr.write(`${error?.stack || error}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  assertAuditAgainstBaseline,
  baselineEntry,
  canonicalRecord,
  fingerprint,
  governedRecords,
  proposedBaseline,
  runAudit
}
