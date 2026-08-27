'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const lifecycle = require('../i9-lifecycle.cjs')

test('declared lifecycle entrypoints exist and delegate without printing runtime environment', () => {
  for (const command of ['start', 'status', 'stop']) {
    const relative = `scripts/${command}-i9.ps1`
    assert.match(pkg.scripts[`${command}:i9`], new RegExp(relative.replace('/', '\\\\')))
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    assert.match(source, /import-i9-runtime-env\.ps1/)
    assert.match(source, new RegExp(`i9-lifecycle\\.cjs'\\) '${command}'`))
    assert.doesNotMatch(source, /Write-Output\s+\$env:|Get-ChildItem\s+Env:/i)
  }
})

test('lifecycle selects a dedicated Node24 executable only for Flowise and binds ownership to it', () => {
  const core = lifecycle.executableFor('harness')
  const flowise = lifecycle.executableFor('flowise')
  assert.match(core.replaceAll('\\', '/'), /runtime\/node-v20\.20\.2-win-x64\/node\.exe$/)
  assert.match(flowise.replaceAll('\\', '/'), /runtime\/node-v24\.19\.0-win-x64\/node\.exe$/)
  assert.notEqual(flowise.toLowerCase(), core.toLowerCase())
  const record = {
    name: 'flowise',
    pid: 123,
    entrypoint: 'flowise/app/node_modules/flowise/bin/run',
    startedAt: new Date().toISOString()
  }
  const commandLine = `"${flowise}" "${path.join(root, record.entrypoint)}" start`
  assert.equal(lifecycle.isOwned(record, { ExecutablePath: flowise, CommandLine: commandLine }), true)
  assert.equal(lifecycle.isOwned(record, { ExecutablePath: core, CommandLine: commandLine }), false)
})
