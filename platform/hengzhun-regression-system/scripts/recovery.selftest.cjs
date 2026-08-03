'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { RecoveryStore, fingerprint, hmacFingerprint } = require('./recovery.cjs')

function fixture(operation = 'TEST') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-recovery-'))
  const store = new RecoveryStore(root, operation, 'v1')
  return { root, store }
}

test('checkpoint resumes only with the same input fingerprint', () => {
  const { root, store } = fixture()
  const input = fingerprint({ manifest: 'abc' })
  const first = store.begin(input)
  assert.equal(first.resumed, false)
  store.checkpoint(2, 'hash', ['a'])
  store.release()

  const resumed = new RecoveryStore(root, 'TEST', 'v1')
  const second = resumed.begin(input)
  assert.equal(second.resumed, true)
  assert.deepEqual(second.state.completedItems, ['a'])
  resumed.release()
})

test('restart discards active recovery without deleting success history', () => {
  const { root, store } = fixture()
  const input = fingerprint({ value: 1 })
  store.begin(input)
  store.checkpoint(1, 'one', ['one'])
  store.release()
  const restarted = new RecoveryStore(root, 'TEST', 'v1', { restart: true })
  const result = restarted.begin(input)
  assert.equal(result.resumed, false)
  assert.deepEqual(result.state.completedItems, [])
  restarted.complete({ ok: true })
  restarted.release()
  assert.ok(fs.existsSync(path.join(root, '.data', 'recovery', 'test-last-success.json')))
})

test('live operation lock rejects a concurrent writer', () => {
  const { root, store } = fixture()
  store.begin(fingerprint({ value: 1 }))
  const concurrent = new RecoveryStore(root, 'TEST', 'v1')
  assert.throws(() => concurrent.begin(fingerprint({ value: 1 })), error => error.code === 'RECOVERY_OPERATION_ALREADY_RUNNING')
  store.release()
})

test('failure state contains no supplied secret and HMAC fingerprint is deterministic', () => {
  const { root, store } = fixture()
  const secret = 'not-written-to-recovery'
  const proof = hmacFingerprint('local-key', secret)
  store.begin(fingerprint({ proof }))
  const error = new Error('temporary network failure')
  error.code = 'NETWORK_TIMEOUT'
  store.fail(error, true)
  store.release()
  const content = fs.readFileSync(path.join(root, '.data', 'recovery', 'test.json'), 'utf8')
  assert.doesNotMatch(content, new RegExp(secret))
  assert.equal(proof, hmacFingerprint('local-key', secret))
})
