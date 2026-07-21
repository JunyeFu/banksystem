'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { hashRuntimeTree } = require('../../scripts/i9-runtime-tree.cjs')

const productRoot = path.resolve(__dirname, '../..')
const readJson = relative => JSON.parse(fs.readFileSync(path.join(productRoot, relative), 'utf8'))

test('runtime tree hash is deterministic and content-sensitive', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i9-p1-'))
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
  fs.mkdirSync(path.join(fixture, 'nested'))
  fs.writeFileSync(path.join(fixture, 'b.txt'), 'B')
  fs.writeFileSync(path.join(fixture, 'nested', 'a.txt'), 'A')
  const first = hashRuntimeTree(fixture)
  const second = hashRuntimeTree(fixture)
  assert.deepEqual(first, second)
  fs.writeFileSync(path.join(fixture, 'nested', 'a.txt'), 'changed')
  assert.notEqual(hashRuntimeTree(fixture).sha256, first.sha256)
})

test('formal config is loopback-only, relative and secret-value free', () => {
  const config = readJson('config/i9.runtime.example.json')
  assert.equal(config.network.host, '127.0.0.1')
  assert.deepEqual([config.network.flowisePort, config.network.harnessPort, config.network.mcpPort], [3006, 18788, 18789])
  for (const relative of Object.values(config.paths)) {
    assert.equal(path.isAbsolute(relative), false)
    assert.equal(relative.split(/[\\/]/).includes('..'), false)
  }
  for (const variable of Object.values(config.credentialVariables)) assert.match(variable, /^[A-Z][A-Z0-9_]{2,63}$/)
})

test('manifest freezes the I8 baseline and exact runtime versions', () => {
  const manifest = readJson('flowise/manifests/i9-p1-runtime-baseline.json')
  assert.equal(manifest.i8BaselineCommit, '29c3428')
  assert.deepEqual(manifest.versions, {
    node: '20.20.2',
    flowise: '3.0.12',
    flowiseComponents: '3.0.12',
    flowiseUi: '3.0.12',
    connectSqlite3: '0.9.15',
    chromiumRevision: '1217',
    ffmpegRevision: '1011'
  })
  assert.equal(manifest.hashes.runtimeTree.fileCount, 288538)
  assert.equal(manifest.hashes.runtimeTree.totalBytes, 1966406537)
})
