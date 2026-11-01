'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const currentStatus = require('../i10-agent-current-status.cjs')

const IDENTITY = 'a'.repeat(64)

test('current status joins managed runtime and v4 ledger under one identity', async () => {
  const value = await currentStatus.currentAgentStatus({
    root: 'fixture-root',
    deps: {
      readManagedState: () => ({ releaseIdentityHash: IDENTITY, services: [
        { name: 'harness', releaseIdentityHash: IDENTITY },
        { name: 'mcp', releaseIdentityHash: IDENTITY },
        { name: 'worker', releaseIdentityHash: IDENTITY },
      ] }),
      currentIdentity: () => ({ ...currentStatus.frozenIdentity(IDENTITY), groupHashes: {} }),
      managedStatus: async () => ({ healthy: true, services: [] }),
      ledgerStatus: (identity) => ({ releaseIdentityHash: identity.identityHash, currentPassed: 2, required: 18, full18: false, checkpoints: 0 }),
    },
  })
  assert.equal(value.schemaVersion, 'hengzhun-agent-current-status/v1')
  assert.equal(value.releaseIdentity.schemaVersion, 'hengzhun-i10-release-identity-v4')
  assert.equal(value.releaseIdentity.hash, IDENTITY)
  assert.equal(value.acceptance.releaseIdentityHash, IDENTITY)
  assert.equal(value.legacyFlowise.currentAuthority, false)
})

test('current status rejects mixed service identities', async () => {
  await assert.rejects(() => currentStatus.currentAgentStatus({
    root: 'fixture-root',
    deps: {
      readManagedState: () => ({ releaseIdentityHash: IDENTITY, services: [{ name: 'harness', releaseIdentityHash: 'b'.repeat(64) }] }),
      currentIdentity: () => ({ ...currentStatus.frozenIdentity(IDENTITY), groupHashes: {} }),
    },
  }), (error) => error.code === 'AGENT_CURRENT_RELEASE_IDENTITY_MISMATCH')
})
