'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

test('RF-041 session persistence passes real MCP and Fresh Harness integration', () => {
  const productRoot = path.resolve(__dirname, '..', '..')
  const node24 = path.join(productRoot, 'runtime', 'node-v24.19.0-win-x64', 'node.exe')
  const target = path.join(productRoot, 'agent-cli', 'test', 'session-harness-integration.test.mjs')
  const environment = { ...process.env }
  delete environment.NODE_TEST_CONTEXT
  const result = spawnSync(node24, ['--test', target], { cwd: productRoot, encoding: 'utf8', env: environment })
  assert.equal(result.status, 0, `RF-041 integration failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`)
  assert.match(result.stdout, /tests 1/)
  assert.match(result.stdout, /pass 1/)
  assert.match(result.stdout, /fail 0/)
})
