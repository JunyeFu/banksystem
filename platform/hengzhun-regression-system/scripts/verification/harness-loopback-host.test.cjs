'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveHarnessHost } = require('../../dist/harness/src/index.js')

test('Harness listener defaults to and accepts only explicit loopback hosts', () => {
  assert.equal(resolveHarnessHost(undefined), '127.0.0.1')
  assert.equal(resolveHarnessHost('127.0.0.1'), '127.0.0.1')
  assert.equal(resolveHarnessHost('LOCALHOST'), 'localhost')
  assert.equal(resolveHarnessHost(' ::1 '), '::1')

  for (const host of ['', '0.0.0.0', '::', '192.168.1.20', 'hengzhun.internal']) {
    assert.throws(
      () => resolveHarnessHost(host),
      error => error?.code === 'HENGZHUN_HOST_NOT_LOOPBACK',
      host
    )
  }
})

