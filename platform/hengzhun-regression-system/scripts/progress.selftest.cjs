'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Writable } = require('node:stream')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ProgressReporter, formatDuration, safeText } = require('./progress.cjs')

function capture() {
  let value = ''
  const stream = new Writable({ write(chunk, encoding, callback) { value += chunk.toString(); callback() } })
  stream.isTTY = false
  return { stream, read: () => value }
}

test('measurable progress is derived from completed and total only', () => {
  let now = 0
  const output = capture()
  const reporter = new ProgressReporter('VERIFY', { enabled: true, stream: output.stream, clock: () => now, heartbeatSeconds: 60 })
  reporter.startStage(2, 5, '核心文件Hash', { completed: 0, total: 133, heartbeat: false })
  now = 1_000
  reporter.update(37, 133, 'README.md', true)
  const text = output.read()
  assert.match(text, /\[VERIFY 2\/5\]/)
  assert.match(text, /37\/133/)
  assert.match(text, /\[######--------------\]/)
})

test('unknown-duration stages never display a percentage bar', () => {
  const output = capture()
  const reporter = new ProgressReporter('START', { enabled: true, stream: output.stream, heartbeatSeconds: 60 })
  reporter.startStage(7, 8, '验证视觉模型', { maxWaitHint: '每次90秒', heartbeat: false })
  const text = output.read()
  assert.match(text, /\[START 7\/8\]/)
  assert.doesNotMatch(text, /\d+\/\d+.*\[[#-]{20}\]/)
  assert.doesNotMatch(text, /%/)
})

test('duration and secret redaction are deterministic', () => {
  assert.equal(formatDuration(3_661_000), '01:01:01')
  assert.equal(safeText('API_KEY=sk-example-secret Bearer abc.def'), 'API_KEY=[REDACTED] Bearer [REDACTED]')
})

test('progress uses stderr-like stream and does not write stdout', () => {
  const output = capture()
  const reporter = new ProgressReporter('STOP', { enabled: true, stream: output.stream, heartbeatSeconds: 60 })
  reporter.startStage(1, 4, '正在停止Flowise', { heartbeat: false })
  reporter.finish('完成')
  assert.match(output.read(), /正在停止Flowise/)
})

test('Ctrl+C marks cancellation and maps to exit code 130', () => {
  const output = capture()
  const reporter = new ProgressReporter('VERIFY', { enabled: true, stream: output.stream, heartbeatSeconds: 60 })
  reporter.installCancellation()
  process.emit('SIGINT')
  assert.equal(reporter.cancelled, true)
  assert.throws(() => reporter.throwIfCancelled(), error => error.exitCode === 130 && error.code === 'USER_CANCELLED')
  reporter.removeCancellation()
})

test('verify progress stays on stderr and final stdout remains parseable JSON', () => {
  const root = path.resolve(__dirname, '..')
  const candidate = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-progress-'))
  fs.mkdirSync(path.join(candidate, 'manifest'), { recursive: true })
  fs.writeFileSync(path.join(candidate, 'manifest', 'files.sha256.json'), `${JSON.stringify({
    schemaVersion: 'hengzhun-i10-file-manifest-v1',
    sourceCommit: '0'.repeat(40),
    algorithm: 'sha256',
    assets: {},
    coreFiles: {}
  }, null, 2)}\n`)
  const result = childProcess.spawnSync(process.execPath, [
    path.join(root, 'scripts', 'i10-stage9-portable.cjs'),
    'verify', '--candidate', candidate, '--progress'
  ], { encoding: 'utf8', env: { ...process.env, HENGZHUN_PROGRESS: '1' } })
  try {
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).status, 'I10_PORTABLE_FOLDER_VERIFIED')
    assert.match(result.stderr, /\[VERIFY 1\/5\]/)
    assert.doesNotMatch(result.stdout, /\[VERIFY/)
  } finally {
    fs.rmSync(candidate, { recursive: true, force: true })
  }
})
