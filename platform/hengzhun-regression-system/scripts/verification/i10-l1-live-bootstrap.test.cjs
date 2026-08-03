'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.resolve(__dirname, '..', 'i10-l1-live-bootstrap.cjs'), 'utf8')

test('L1 live bootstrap accepts an explicit isolated local port instead of reusing a fixed listener', () => {
  assert.match(source, /process\.env\.I10_STAGE8_PORT \|\| 28884/)
  assert.match(source, /I10_L1_PORT_INVALID/)
  assert.match(source, /I10_L1_PORT_IN_USE/)
  assert.match(source, /await assertControlledPortalPortAvailable\(\);[\s\S]*const serviceToken/)
  assert.match(source, /HENGZHUN_I10_STAGE8_PORT: String\(port\)/)
})
