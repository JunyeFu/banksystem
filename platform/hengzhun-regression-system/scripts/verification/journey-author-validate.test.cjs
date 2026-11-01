const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const node24 = path.join(root, 'runtime', 'node-v24.19.0-win-x64', 'node.exe')
const files = [
  path.join(root, 'agent-cli', 'test', 'journey-author-validate.test.mjs'),
]
const result = spawnSync(node24, ['--test', ...files], { cwd: root, encoding: 'utf8' })

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
console.log('RF043_JOURNEY_AUTHOR_VALIDATE=PASS tests=6')
