#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

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

function inspect(file) {
  const stat = fs.statSync(file)
  if (stat.size > 64 * 1024 * 1024) return []
  const buffer = fs.readFileSync(file)
  const extension = path.extname(file).toLowerCase()
  const contents = extension === '.sqlite'
    ? [buffer.toString('latin1'), buffer.toString('utf8')]
    : textExtensions.has(extension) && stat.size <= 8 * 1024 * 1024
      ? [buffer.toString('utf8')]
      : []
  const findings = []
  for (const content of contents) {
    if (secretPatterns.some(pattern => pattern.test(content))) findings.push('SECRET_PATTERN')
    if (sensitiveValues.some(value => content.includes(value))) findings.push('RUNTIME_SECRET_VALUE')
  }
  return [...new Set(findings)]
}

const sourceFiles = []
const runtimeOutputFiles = []
for (const entry of sourceRoots) collect(path.join(root, ...entry.split('/')), sourceFiles)
for (const entry of runtimeRoots) collect(path.join(root, ...entry.split('/')), runtimeOutputFiles)
for (const entry of runtimeFiles) collect(path.join(root, ...entry.split('/')), runtimeOutputFiles)

const findings = []
for (const file of [...new Set([...sourceFiles, ...runtimeOutputFiles])]) {
  for (const code of inspect(file)) findings.push({ code, path: relative(file) })
}

const result = {
  schemaVersion: 'hengzhun-i10-secret-leak-verification-v1',
  status: findings.length === 0 ? 'PASSED' : 'FAILED',
  sourceFilesScanned: new Set(sourceFiles).size,
  runtimeOutputFilesScanned: new Set(runtimeOutputFiles).size,
  protectedEnvironmentValuesChecked: sensitiveValues.length,
  findingCount: findings.length,
  findings
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (findings.length > 0) process.exitCode = 2
