'use strict'
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { assertTapSuccess } = require('../run-registered-tests.cjs')
const productRoot = path.resolve(__dirname, '../..')
const environment = { ...process.env }
delete environment.NODE_TEST_CONTEXT
for (const key of Object.keys(environment)) if (/^(?:HENGZHUN_|CONTROL_|VISION_|OPENAI_|MIDSCENE_)/.test(key)) delete environment[key]

function run(file, args) {
  const result = spawnSync(file, args, { cwd: productRoot, env: environment, encoding: 'utf8', windowsHide: true })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout
}

test('interview inputs and actual SDK wire boundaries pass under pinned Node 24 without BYOK', () => {
  assertTapSuccess(run(path.join(productRoot, 'runtime/node-v24.19.0-win-x64/node.exe'), [
    '--test', '--test-reporter=tap', 'controller/test/explicit-transfer-input.test.mjs', '../../scripts/test/agent-interview-audit.test.mjs'
  ]))
})

test('interview metadata, cancellation and release cleanup run against isolated SQLite under Node 20', () => {
  assertTapSuccess(run(path.join(productRoot, 'runtime/node-v20.20.2-win-x64/node.exe'), [
    '--test', '--test-reporter=tap', '../../scripts/test/agent-interview-audit-round2.test.mjs',
    '../../scripts/test/rf057/cleanup.test.cjs', '../../scripts/test/rf068-workbench-acceptance.test.mjs'
  ]))
})

test('actual cleanup producer succeeds and fails in the no-network PowerShell fixture', () => {
  const output = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.resolve(productRoot, '../../scripts/test/rf057-cleanup-producer.test.ps1')])
  assert.match(output, /CLEANUP_PRODUCER=PASS cases=2 execution=ISOLATED_NO_NETWORK/)
})
