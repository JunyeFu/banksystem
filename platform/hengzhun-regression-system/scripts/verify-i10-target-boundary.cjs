#!/usr/bin/env node
'use strict'

// GZ-00: keep the current controlled Fuxing compatibility surface explicit
// until it is migrated to an adapter. This verifier intentionally reports
// classifications instead of treating all historical references as defects.
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const boundaryPath = path.join(root, 'contracts', 'target-generalization-boundary-v1.json')
const boundary = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'))
const expectedSchema = 'hengzhun-target-generalization-boundary-v1'
if (boundary.schemaVersion !== expectedSchema) throw new Error('I10_TARGET_BOUNDARY_SCHEMA_INVALID')
if (!Array.isArray(boundary.markers) || !Array.isArray(boundary.classifications)) throw new Error('I10_TARGET_BOUNDARY_CONTRACT_INVALID')

const classified = new Map(boundary.classifications.map(item => [item.path, item]))
const pathRules = Array.isArray(boundary.pathRules) ? boundary.pathRules : []
const sourceRoots = ['harness/src', 'worker/src', 'mcp/src', 'scripts', 'flowise']
const ignored = new Set(['flowise/i10/agentflow-v2.json', 'flowise/i10/agentflow-v3.json', 'flowise/i10/agentflow-v4.json', 'flowise/i10/agentflow-v5.json', 'flowise/i10/agentflow-v6.json'])
const fileExtensions = new Set(['.ts', '.cjs', '.js', '.json', '.md'])
const markerPattern = new RegExp(boundary.markers.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')

function walk(relative) {
  const results = []
  const pending = [relative]
  const ignoredDirectories = new Set(['.data', '.git', '.idea', 'dist', 'node_modules', 'runtime', 'uploads'])
  while (pending.length) {
    const current = pending.pop()
    const absolute = path.join(root, current)
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(current, entry.name).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) pending.push(child)
      } else if (fileExtensions.has(path.extname(entry.name))) {
        results.push(child)
      }
    }
  }
  return results
}

const discovered = []
for (const sourceRoot of sourceRoots) {
  for (const relative of walk(sourceRoot)) {
    if (ignored.has(relative)) continue
    const content = fs.readFileSync(path.join(root, relative), 'utf8')
    if (markerPattern.test(content)) discovered.push(relative)
  }
}

const classify = relative => classified.get(relative)?.classification
  || pathRules.find(rule => relative.startsWith(String(rule.prefix)))?.classification
const unclassified = discovered.filter(relative => !classify(relative))
const missing = [...classified.keys()].filter(relative => !fs.existsSync(path.join(root, relative)))
if (missing.length) throw new Error(`I10_TARGET_BOUNDARY_CLASSIFIED_FILE_MISSING:${missing.join(',')}`)
if (unclassified.length) throw new Error(`I10_TARGET_BOUNDARY_UNCLASSIFIED_REFERENCE:${unclassified.join(',')}`)

const summary = boundary.classifications
  .map(item => `${item.classification}:${item.path}`)
  .sort()
process.stdout.write(`${JSON.stringify({ status: 'I10_TARGET_BOUNDARY_VERIFIED', classifiedFiles: summary.length, discoveredFiles: discovered.length, summary }, null, 2)}\n`)
