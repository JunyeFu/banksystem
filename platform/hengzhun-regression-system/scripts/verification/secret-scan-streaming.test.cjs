'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { inspect } = require('../verify-i10-secret-leaks.cjs')

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-secret-scan-'))
}

test('secret scan detects a token split across bounded read chunks', t => {
  const root = fixture()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'split-token.txt')
  const syntheticToken = ['sk', 'abcdefghijklmnop'].join('-')
  fs.writeFileSync(file, `${'x'.repeat(14)} ${syntheticToken}\n`, 'utf8')

  assert.deepEqual(inspect(file, { chunkBytes: 16, maxTextBytes: 1024 }), ['SECRET_PATTERN'])
})

test('secret scan rejects oversized text instead of silently skipping it', t => {
  const root = fixture()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'oversized.txt')
  fs.writeFileSync(file, 'ordinary text that exceeds the test limit', 'utf8')

  assert.deepEqual(inspect(file, { maxTextBytes: 8 }), ['SCAN_FILE_TOO_LARGE'])
})

test('secret scan classifies binary paths before filesystem access', () => {
  const nonexistentDatabase = path.join(os.tmpdir(), `missing-${process.pid}.sqlite`)
  assert.deepEqual(inspect(nonexistentDatabase), [])
})

test('secret scan fails closed when a text file cannot be inspected', () => {
  const nonexistentText = path.join(os.tmpdir(), `missing-${process.pid}.txt`)
  assert.deepEqual(inspect(nonexistentText), ['SCAN_FILE_STAT_FAILED'])
})
