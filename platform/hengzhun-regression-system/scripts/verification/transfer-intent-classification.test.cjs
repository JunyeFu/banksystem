'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { requestsTransferAction } = require('../../dist/harness/src/service.js')

test('an explicit transfer action selects the controlled transfer profile', () => {
  assert.equal(requestsTransferAction(['向已确认收款人发起转账。']), true)
})

test('the observed read-only prohibition does not become a transfer action', () => {
  assert.equal(requestsTransferAction(['保持页面停留在查询状态，不点击任何转账或修改按钮。']), false)
})

test('a read-only scope sentence with a later transfer noun does not become a transfer action', () => {
  assert.equal(requestsTransferAction(['只读范围，不修改资料或发起转账。']), false)
})
