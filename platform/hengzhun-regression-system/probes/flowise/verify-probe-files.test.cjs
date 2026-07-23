'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = __dirname

test('runtime manifest and probe configuration are pinned', () => {
  const runtime = JSON.parse(fs.readFileSync(path.join(root, 'runtime-package.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(root, 'probe.config.json'), 'utf8'))
  assert.equal(runtime.dependencies.flowise, '3.0.12')
  assert.equal(runtime.dependencies['flowise-components'], '3.0.12')
  assert.equal(runtime.dependencies['flowise-ui'], '3.0.12')
  assert.equal(runtime.dependencies['connect-sqlite3'], '0.9.15')
  assert.equal(config.databaseType, 'sqlite')
  assert.equal(config.host, '127.0.0.1')
})

test('probe artifacts do not contain credential literals or public listeners', () => {
  const files = fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name))
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(content, /sk-[A-Za-z0-9_-]{12,}/, file)
    assert.doesNotMatch(content, /0\.0\.0\.0/, file)
  }
})
