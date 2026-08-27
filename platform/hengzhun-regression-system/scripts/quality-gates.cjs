#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const productRoot = path.resolve(__dirname, '..')
const sourceRoots = ['scripts', 'worker/src', 'mcp/src', 'flowise/i10', 'tests']

function discoverJavaScript(directory, files = []) {
  if (!fs.existsSync(directory)) return files
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) discoverJavaScript(absolute, files)
    else if (entry.isFile() && /\.(?:cjs|js)$/.test(entry.name)) files.push(absolute)
  }
  return files
}

function main() {
  if ((process.argv[2] || 'syntax') !== 'syntax') throw new Error(`QUALITY_GATE_MODE_INVALID:${process.argv[2]}`)
  const files = sourceRoots.flatMap(root => discoverJavaScript(path.join(productRoot, ...root.split('/')))).sort()
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: productRoot, encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) {
      process.stderr.write(result.stdout || '')
      process.stderr.write(result.stderr || '')
      throw new Error(`JAVASCRIPT_SYNTAX_INVALID:${path.relative(productRoot, file)}`)
    }
  }
  process.stdout.write(`JavaScript syntax gate passed: ${files.length} files.\n`)
}

try { main() }
catch (error) {
  process.stderr.write(`${error?.stack || error}\n`)
  process.exitCode = 1
}
