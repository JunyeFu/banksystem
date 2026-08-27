import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHECKPOINT_SCHEMA_VERSION,
  ScratchVfs,
  assertCheckpointSafe,
  createControllerSecurity,
  safeTrace,
} from '../src/state-security.mjs'

test('namespace/thread binding is immutable and cross-namespace resume is denied', () => {
  const checkpointer = { async deleteThread() {} }
  const security = createControllerSecurity({ checkpointer, now: () => 1000, ttlMs: 1000 })
  const binding = security.bindThread({
    namespace: 'tenant-a', threadId: 'thread-1', journeyId: 'journey-1', releaseIdentityHash: 'identity-1234567890',
  })
  assert.equal(binding.checkpointSchemaVersion, CHECKPOINT_SCHEMA_VERSION)
  assert.equal(security.assertActive({ namespace: 'tenant-a', threadId: 'thread-1', journeyId: 'journey-1' }), binding)
  assert.throws(
    () => security.assertActive({ namespace: 'tenant-b', threadId: 'thread-1', journeyId: 'journey-1' }),
    /AGENT_CONTROLLER_NAMESPACE_CONFLICT/,
  )
  assert.throws(
    () => security.bindThread({ namespace: 'tenant-b', threadId: 'thread-1', journeyId: 'journey-1', releaseIdentityHash: 'identity-1234567890' }),
    /AGENT_CONTROLLER_THREAD_BINDING_CONFLICT/,
  )
})

test('expired checkpoint is denied and cleanup deletes it exactly once', async () => {
  let current = 1000
  const deleted = []
  const security = createControllerSecurity({
    checkpointer: { async deleteThread(threadId) { deleted.push(threadId) } },
    now: () => current,
    ttlMs: 100,
  })
  security.bindThread({ namespace: 'n', threadId: 't', journeyId: 'j', releaseIdentityHash: 'identity-1234567890' })
  current = 1100
  assert.throws(() => security.assertActive({ namespace: 'n', threadId: 't', journeyId: 'j' }), /THREAD_EXPIRED/)
  assert.equal(await security.cleanupExpired(), 1)
  assert.deepEqual(deleted, ['t'])
  assert.equal(await security.cleanupExpired(), 0)
})

test('checkpoint rejects secret-like fields, raw payloads and host paths', () => {
  assertCheckpointSafe({ threadId: 't', credentialRef: 'cred_ref', nested: { version: 1 } })
  for (const value of [
    { password: 'x' },
    { nested: { apiToken: 'x' } },
    { userInput: 'raw' },
    { arguments: { safe: true } },
    { artifact: 'C:\\private\\artifact.txt' },
    { artifact: '/var/private/artifact' },
  ]) {
    assert.throws(() => assertCheckpointSafe(value), /AGENT_CONTROLLER_/)
  }
})

test('trace is allowlist-only and omits raw content', () => {
  const trace = safeTrace({
    event: 'RESUME', namespace: 'n', threadId: 't', journeyId: 'j', status: 'FAILED_CLOSED',
    failureCode: 'X', userInput: 'secret text', arguments: { password: 'x' }, message: 'raw',
  })
  assert.deepEqual(trace, {
    event: 'RESUME', namespace: 'n', threadId: 't', journeyId: 'j', status: 'FAILED_CLOSED', failureCode: 'X',
  })
})

test('scratch VFS is in-memory, traversal-safe and quota-bounded', () => {
  const scratch = new ScratchVfs({ maxBytes: 8 })
  scratch.write('notes/a.txt', '1234')
  assert.equal(scratch.read('notes/a.txt'), '1234')
  assert.equal(scratch.sizeBytes, 4)
  assert.throws(() => scratch.write('../escape', 'x'), /SCRATCH_PATH_INVALID/)
  assert.throws(() => scratch.write('C:\\host.txt', 'x'), /SCRATCH_PATH_INVALID/)
  assert.throws(() => scratch.write('notes/b.txt', '12345'), /SCRATCH_QUOTA_EXCEEDED/)
  scratch.clear()
  assert.equal(scratch.sizeBytes, 0)
})
