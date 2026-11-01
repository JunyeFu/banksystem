'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

test('hz-agent headless contract passes its Node 24 isolated matrix', () => {
  const productRoot = path.resolve(__dirname, '..', '..')
  const node24 = path.join(productRoot, 'runtime', 'node-v24.19.0-win-x64', 'node.exe')
  const target = path.join(productRoot, 'agent-cli', 'test', 'headless-cli.test.mjs')
  const childEnv = { ...process.env }
  delete childEnv.NODE_TEST_CONTEXT
  const result = spawnSync(node24, ['--test', target], { cwd: productRoot, encoding: 'utf8', env: childEnv })
  assert.equal(result.status, 0, `CLI matrix failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`)
  assert.match(result.stdout, /tests 26/)
  assert.match(result.stdout, /pass 26/)
  assert.match(result.stdout, /fail 0/)
})
