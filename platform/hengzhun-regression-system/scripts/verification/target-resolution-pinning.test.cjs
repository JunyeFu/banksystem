'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertTargetUrlResolution,
  chromiumHostResolverRules
} = require('../../worker/src/i10-worker-utils.cjs')

test('target runtime rejects a DNS snapshot mismatch before browser launch', async () => {
  await assert.rejects(
    () => assertTargetUrlResolution('http://127.0.0.1:28884', {
      networkMode: 'LOCAL',
      resolvedAddresses: { '127.0.0.1': ['127.0.0.2'] }
    }),
    error => error && error.code === 'I10_TARGET_DNS_REBINDING_DETECTED'
  )
})

test('target runtime enforces the confirmed network class', async () => {
  await assert.rejects(
    () => assertTargetUrlResolution('http://127.0.0.1:28884', {
      networkMode: 'PUBLIC',
      resolvedAddresses: { '127.0.0.1': ['127.0.0.1'] }
    }),
    error => error && error.code === 'I10_TARGET_ADDRESS_POLICY_REJECTED'
  )
})

test('Chromium receives deterministic host resolver pins for every confirmed host', () => {
  const rule = chromiumHostResolverRules({
    resolvedAddresses: {
      'portal.example.test': ['203.0.113.4'],
      'auth.example.test': ['203.0.113.5']
    }
  })
  assert.equal(rule, '--host-resolver-rules=MAP auth.example.test 203.0.113.5,MAP portal.example.test 203.0.113.4')
  assert.throws(
    () => chromiumHostResolverRules({ resolvedAddresses: {} }),
    error => error && error.code === 'I10_TARGET_RESOLUTION_PIN_MISSING'
  )
})
