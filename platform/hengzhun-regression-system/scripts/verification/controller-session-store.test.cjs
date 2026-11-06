'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { assertTapSuccess } = require('../run-registered-tests.cjs')

test('Controller CurrentUser DPAPI session and typed operation stores pass their isolated matrix', () => {
  const productRoot = path.resolve(__dirname, '..', '..')
  const targets = [
    path.join(productRoot, 'controller', 'test', 'session-store.test.mjs'),
    path.join(productRoot, 'controller', 'test', 'operation-store.test.mjs'),
  ]
  const childEnv = { ...process.env }
  delete childEnv.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...targets], {
    cwd: productRoot,
    encoding: 'utf8',
    env: childEnv,
  })
  assert.equal(
    result.status,
    0,
    `Controller session matrix failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )
  assertTapSuccess(result.stdout)
})
