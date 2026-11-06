'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { assertTapSuccess } = require('../run-registered-tests.cjs')

test('Controller runtime adapters pass the offline fault-injection matrix', () => {
  const productRoot = path.resolve(__dirname, '..', '..')
  const target = path.join(productRoot, 'controller', 'test', 'runtime-adapters.test.mjs')
  const childEnv = { ...process.env }
  delete childEnv.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', target], {
    cwd: productRoot, encoding: 'utf8', env: childEnv,
  })
  assert.equal(result.status, 0, `Adapter matrix failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`)
  assertTapSuccess(result.stdout)
})
