#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { StringDecoder } = require('node:string_decoder')

const root = path.resolve(__dirname, '..')
const policy = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/s9-portability-policy-v1.json'), 'utf8'))
const textExtensions = new Set(['.cjs', '.cmd', '.csv', '.html', '.js', '.json', '.md', '.ps1', '.sql', '.ts', '.txt', '.yaml', '.yml'])
const sourceRoots = ['config', 'contracts', 'flowise/i10', 'harness/migrations', 'harness/src', 'mcp/src', 'worker/src', 'scripts', 'tests/i10']
const runtimeRoots = ['.data/logs', '.data/evidence/i10', '.data/candidates', '.data/stability', '.data/midscene-runs', '.data/video-ingest']
const runtimeFiles = ['.data/flowise/database.sqlite', '.data/sqlite/regression_platform.sqlite']
const secretPatterns = policy.secretContentPatterns.map(pattern => new RegExp(pattern, 'i'))
const sensitiveEnvironmentNames = [
  'CONTROL_API_KEY', 'VISION_API_KEY', 'HENGZHUN_SERVICE_TOKEN', 'HENGZHUN_WORKER_TOKEN',
  'HENGZHUN_MCP_TOKEN', 'I10_STAGE8_FIXTURE_USERNAME', 'I10_STAGE8_FIXTURE_PASSWORD'
]
const sensitiveValues = sensitiveEnvironmentNames.map(name => process.env[name]).filter(value => typeof value === 'string' && value.length >= 6)
const DEFAULT_CHUNK_BYTES = 64 * 1024
const DEFAULT_MAX_TEXT_BYTES = 64 * 1024 * 1024
const DEFAULT_OVERLAP_CHARACTERS = 4096

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function collect(target, files) {
  if (!fs.existsSync(target)) return
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink()) return
  if (stat.isFile()) {
    files.push(target)
    return
  }
  if (!stat.isDirectory()) return
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) collect(path.join(target, entry.name), files)
}

function isTextPath(file) {
  const extension = path.extname(file).toLowerCase()
  return textExtensions.has(extension)
}

function matches(pattern, content) {
  pattern.lastIndex = 0
  const matched = pattern.test(content)
  pattern.lastIndex = 0
  return matched
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function inspect(file, options = {}) {
  // Type classification happens before stat/open so binary and SQLite content
  // is never decoded or searched as if it were text.
  if (!isTextPath(file)) return []

  const maxTextBytes = positiveInteger(options.maxTextBytes, DEFAULT_MAX_TEXT_BYTES)
  const chunkBytes = positiveInteger(options.chunkBytes, DEFAULT_CHUNK_BYTES)
  const patterns = Array.isArray(options.secretPatterns) ? options.secretPatterns : secretPatterns
  const protectedValues = Array.isArray(options.sensitiveValues) ? options.sensitiveValues : sensitiveValues
  const overlapCharacters = Math.max(
    DEFAULT_OVERLAP_CHARACTERS,
    ...protectedValues.map(value => String(value).length + 64)
  )

  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return ['SCAN_FILE_STAT_FAILED']
  }
  if (!stat.isFile()) return ['SCAN_PATH_NOT_REGULAR_FILE']
  if (stat.size > maxTextBytes) return ['SCAN_FILE_TOO_LARGE']

  const findings = new Set()
  const scan = content => {
    if (patterns.some(pattern => matches(pattern, content))) findings.add('SECRET_PATTERN')
    if (protectedValues.some(value => content.includes(value))) findings.add('RUNTIME_SECRET_VALUE')
  }

  let descriptor
  try {
    descriptor = fs.openSync(file, 'r')
  } catch {
    return ['SCAN_FILE_OPEN_FAILED']
  }

  try {
    const decoder = new StringDecoder('utf8')
    const buffer = Buffer.allocUnsafe(chunkBytes)
    let carry = ''
    let totalBytes = 0
    while (true) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      totalBytes += bytesRead
      if (totalBytes > maxTextBytes) {
        findings.add('SCAN_FILE_TOO_LARGE')
        break
      }
      const content = carry + decoder.write(buffer.subarray(0, bytesRead))
      scan(content)
      carry = content.slice(-overlapCharacters)
    }
    scan(carry + decoder.end())
  } catch {
    findings.add('SCAN_FILE_READ_FAILED')
  } finally {
    try {
      fs.closeSync(descriptor)
    } catch {
      findings.add('SCAN_FILE_CLOSE_FAILED')
    }
  }
  return [...findings]
}

function main() {
  const sourceFiles = []
  const runtimeOutputFiles = []
  for (const entry of sourceRoots) collect(path.join(root, ...entry.split('/')), sourceFiles)
  for (const entry of runtimeRoots) collect(path.join(root, ...entry.split('/')), runtimeOutputFiles)
  for (const entry of runtimeFiles) collect(path.join(root, ...entry.split('/')), runtimeOutputFiles)

  const uniqueSourceFiles = [...new Set(sourceFiles)]
  const uniqueRuntimeOutputFiles = [...new Set(runtimeOutputFiles)]
  const findings = []
  for (const file of [...new Set([...uniqueSourceFiles, ...uniqueRuntimeOutputFiles])]) {
    for (const code of inspect(file)) findings.push({ code, path: relative(file) })
  }

  const result = {
    schemaVersion: 'hengzhun-i10-secret-leak-verification-v1',
    status: findings.length === 0 ? 'PASSED' : 'FAILED',
    sourceFilesScanned: uniqueSourceFiles.filter(isTextPath).length,
    runtimeOutputFilesScanned: uniqueRuntimeOutputFiles.filter(isTextPath).length,
    nonTextFilesIgnored: [...uniqueSourceFiles, ...uniqueRuntimeOutputFiles].filter(file => !isTextPath(file)).length,
    protectedEnvironmentValuesChecked: sensitiveValues.length,
    findingCount: findings.length,
    findings
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (findings.length > 0) process.exitCode = 2
}

if (require.main === module) main()

module.exports = { collect, inspect, isTextPath, main }
