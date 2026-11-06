'use strict'
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

test('Agent browser transport and real production-service characterization contracts', () => {
  const root = path.resolve(__dirname, '../..')
  const environment = { ...process.env }
  delete environment.NODE_TEST_CONTEXT
  const result = spawnSync(path.join(root, 'runtime/node-v24.19.0-win-x64/node.exe'), [
    '--test', '--test-reporter=tap', 'agent-cli/test/workbench-http.test.mjs', 'agent-cli/test/workbench-characterization.test.mjs', 'agent-cli/test/workbench-server.test.mjs', 'agent-cli/test/workbench-download-cancel.test.mjs',
  ], { cwd: root, env: environment, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /# fail 0/)
})
