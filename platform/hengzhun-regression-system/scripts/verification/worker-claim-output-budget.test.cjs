'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')

test('formal worker claim uses bounded L1 rather than conversational L0', () => {
  const source = fs.readFileSync(path.join(root, 'harness/src/server.ts'), 'utf8')
  assert.match(
    source,
    /service\.claimNextRun\(input\.workerId\), 'L1', requestId/
  )
  assert.doesNotMatch(
    source,
    /service\.claimNextRun\(input\.workerId\), 'L[23]', requestId/
  )
})
