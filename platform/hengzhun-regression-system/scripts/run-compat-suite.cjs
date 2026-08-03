#!/usr/bin/env node
'use strict'

// The original I2-I10 scripts referenced an omitted tests/ tree.  Keep their
// public npm names, but execute maintained in-package contract tests instead
// of pretending that absent paths are runnable.
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const node = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
const test = name => `scripts/verification/${name}.test.cjs`
const suites = {
  i2: [test('input-safety'), test('runtime-verification')],
  i3: [test('mcp-interaction-contract'), test('target-profile')],
  i4: [test('verification-policy'), test('midscene-diagnostics')],
  i5: [test('journey-state-machine'), test('interaction-response')],
  i6: [test('ledger-runner'), test('runtime-verification')],
  i7: [test('stage8-terminal-evidence')],
  'i8:stage1': [test('agentflow-capability-preservation')],
  'i8:stage2': [test('mcp-interaction-contract')],
  'i8:stage3': [test('case-draft-normalizer')],
  'i8:stage4': [test('runtime-verification')],
  'i8:stage5': [test('stage8-terminal-evidence')],
  'i8:stage6': [test('ledger-runner')],
  'i8:stage7': [test('journey-state-machine')],
  'i9:stage1': [test('flowise-upload-config')],
  'i9:stage2': [test('flowise-upload-config')],
  'i9:stage3': [test('flowise-upload-routing')],
  'i9:stage4': [test('mcp-interaction-contract')],
  'i9:stage5': [test('flowise-upload-config')],
  'i9:stage6': [test('stage8-terminal-evidence')],
  'i9:stage7': [test('journey-state-machine')],
  'i9:stage8': [test('runtime-verification')],
  'i9:stage9': [test('flowise-upload-config')],
  'i10:stage9': [test('flowise-upload-config')],
  conformance: [test('mcp-interaction-contract')]
}
const requested = process.argv[2]
const files = requested === 'all' ? [...new Set(Object.values(suites).flat())] : suites[requested]
if (!files) throw new Error(`I10_COMPAT_SUITE_UNKNOWN:${requested}`)
for (const file of files) {
  if (!require('node:fs').existsSync(path.join(root, file))) throw new Error(`I10_COMPAT_TEST_MISSING:${file}`)
}
const result = spawnSync(node, ['--test', ...files], { cwd: root, stdio: 'inherit' })
process.exitCode = result.status ?? 1
