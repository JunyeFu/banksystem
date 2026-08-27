#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const productRoot = path.resolve(__dirname, '..')
const DEFAULT_ENTRY = 'worker/src/index.cjs'
const FOLLOW_ROOTS = Object.freeze(['worker/src/', 'dist/harness/src/'])

const posix = value => String(value).replaceAll('\\', '/')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

function resolveLocalModule(fromRelativePath, specifier, options = {}) {
  if (!String(specifier).startsWith('.')) return null
  const root = options.productRoot || productRoot
  const base = path.resolve(root, path.dirname(fromRelativePath), specifier)
  const candidates = [base, `${base}.cjs`, `${base}.js`, `${base}.json`, path.join(base, 'index.cjs'), path.join(base, 'index.js')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return posix(path.relative(root, candidate))
  }
  return null
}

function parseRequires(source) {
  const staticSpecifiers = []
  const expression = /require\(\s*(['"])([^'"]+)\1\s*\)/g
  for (const match of source.matchAll(expression)) staticSpecifiers.push(match[2])
  const dynamicCount = [...source.matchAll(/require\(\s*(?!['"])/g)].length
  return { staticSpecifiers, dynamicCount }
}

function shouldFollow(relativePath) {
  const normalized = posix(relativePath)
  return FOLLOW_ROOTS.some(root => normalized.startsWith(root))
}

function traceWorkerCodeSet(options = {}) {
  const root = options.productRoot || productRoot
  const entry = posix(options.entry || DEFAULT_ENTRY)
  const pending = [entry]
  const visited = new Set()
  const edges = []
  const unresolved = []
  const runtimeDependencies = new Set()
  const dynamicRequires = []

  while (pending.length) {
    const current = pending.shift()
    if (visited.has(current)) continue
    const absolute = path.resolve(root, current)
    if (!fs.existsSync(absolute)) throw Object.assign(new Error('I10_WORKER_CODE_SET_FILE_MISSING'), { code: 'I10_WORKER_CODE_SET_FILE_MISSING', details: { path: current } })
    visited.add(current)
    const source = fs.readFileSync(absolute, 'utf8')
    const parsed = parseRequires(source)
    if (parsed.dynamicCount) dynamicRequires.push({ from: current, count: parsed.dynamicCount })
    for (const specifier of parsed.staticSpecifiers) {
      const resolved = resolveLocalModule(current, specifier, { productRoot: root })
      if (!resolved) {
        if (specifier.startsWith('.')) unresolved.push({ from: current, specifier })
        else runtimeDependencies.add(specifier)
        continue
      }
      edges.push({ from: current, to: resolved, specifier })
      if (shouldFollow(resolved) && !visited.has(resolved)) pending.push(resolved)
      else if (!shouldFollow(resolved)) runtimeDependencies.add(resolved)
    }
  }

  return {
    schemaVersion: 'hengzhun-worker-import-graph-v1',
    entry,
    governedFiles: [...visited].sort(),
    edges: edges.sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`)),
    runtimeDependencies: [...runtimeDependencies].sort(),
    unresolved: unresolved.sort((left, right) => `${left.from}\0${left.specifier}`.localeCompare(`${right.from}\0${right.specifier}`)),
    dynamicRequires: dynamicRequires.sort((left, right) => left.from.localeCompare(right.from))
  }
}

function aggregateWorkerCodeSet(files, options = {}) {
  const root = options.productRoot || productRoot
  const readFile = options.readFile || (relativePath => fs.readFileSync(path.resolve(root, relativePath)))
  const normalized = [...new Set(files.map(posix))].sort()
  const aggregate = crypto.createHash('sha256')
  const entries = []
  for (const relativePath of normalized) {
    const bytes = readFile(relativePath)
    if (!Buffer.isBuffer(bytes)) throw Object.assign(new Error('I10_WORKER_CODE_SET_BYTES_REQUIRED'), { code: 'I10_WORKER_CODE_SET_BYTES_REQUIRED' })
    const fileHash = sha256(bytes)
    entries.push({ path: relativePath, bytes: bytes.length, sha256: fileHash })
    aggregate.update(relativePath, 'utf8').update('\0').update(bytes).update('\0')
  }
  return {
    schemaVersion: 'hengzhun-worker-code-set-v1',
    algorithm: 'SHA256_SORTED_POSIX_PATH_NUL_RAW_BYTES_NUL',
    files: entries,
    workerCodeSetHash: aggregate.digest('hex')
  }
}

function audit(options = {}) {
  const graph = traceWorkerCodeSet(options)
  return { ...graph, codeSet: aggregateWorkerCodeSet(graph.governedFiles, options) }
}

module.exports = { productRoot, DEFAULT_ENTRY, FOLLOW_ROOTS, resolveLocalModule, parseRequires, traceWorkerCodeSet, aggregateWorkerCodeSet, audit }

if (require.main === module) process.stdout.write(`${JSON.stringify(audit(), null, 2)}\n`)
