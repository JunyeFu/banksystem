#!/usr/bin/env node
'use strict'

const path = require('node:path')

const lifecycle = require('./i10-agent-lifecycle.cjs')
const ledgerV4 = require('./i10-agent-acceptance-ledger-v4.cjs')
const releaseV4 = require('./i10-release-identity-v4.cjs')

const productRoot = path.resolve(__dirname, '..')

class AgentCurrentStatusError extends Error {
  constructor(code, details) { super(code); this.code = code; this.details = details }
}

function frozenIdentity(releaseIdentityHash) {
  if (!/^[a-f0-9]{64}$/.test(String(releaseIdentityHash || ''))) {
    throw new AgentCurrentStatusError('AGENT_CURRENT_RELEASE_IDENTITY_UNAVAILABLE')
  }
  return Object.freeze({
    schemaVersion: 'hengzhun-i10-release-identity-v4',
    profile: 'NORMAL_CLI',
    releaseStatus: 'FROZEN',
    identityHash: releaseIdentityHash,
  })
}

async function currentAgentStatus({ root = productRoot, deps = {} } = {}) {
  const state = await (deps.readManagedState || lifecycle.readManagedState)(root)
  const runtimeIdentity = frozenIdentity(state?.releaseIdentityHash)
  if (!Array.isArray(state.services) || state.services.some((service) => service.releaseIdentityHash !== runtimeIdentity.identityHash)) {
    throw new AgentCurrentStatusError('AGENT_CURRENT_RELEASE_IDENTITY_MISMATCH')
  }
  const identity = deps.currentIdentity
    ? await deps.currentIdentity({ productRoot: root })
    : releaseV4.currentReleaseIdentityV4({
      productRoot: root,
      modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(lifecycle.environmentWithRuntimeFile({ root })),
    })
  if (identity.schemaVersion !== 'hengzhun-i10-release-identity-v4') throw new AgentCurrentStatusError('AGENT_CURRENT_RELEASE_IDENTITY_INVALID')
  const runtime = await (deps.managedStatus || lifecycle.managedStatus)({ root, deps: deps.lifecycleDeps || {} })
  const acceptance = await (deps.ledgerStatus || ((value) => ledgerV4.createAgentAcceptanceLedger({
    storageRoot: path.join(root, '.data', 'evidence', 'agent-v4', 'acceptance'),
  }).status(value)))(identity)
  if (acceptance.releaseIdentityHash !== identity.identityHash) {
    throw new AgentCurrentStatusError('AGENT_CURRENT_LEDGER_IDENTITY_MISMATCH')
  }
  return Object.freeze({
    schemaVersion: 'hengzhun-agent-current-status/v1',
    profile: 'NORMAL_CLI',
    status: runtimeIdentity.identityHash !== identity.identityHash ? 'STALE_SOURCE' : runtime.healthy ? 'HEALTHY' : 'NOT_RUNNING',
    healthy: runtime.healthy && runtimeIdentity.identityHash === identity.identityHash,
    releaseIdentity: Object.freeze({ schemaVersion: identity.schemaVersion, status: 'FROZEN', hash: identity.identityHash }),
    runtimeBinding: Object.freeze({ status: runtimeIdentity.identityHash === identity.identityHash ? 'CURRENT' : 'STALE', hash: runtimeIdentity.identityHash }),
    runtime,
    acceptance,
    legacyFlowise: Object.freeze({ status: 'HISTORICAL_READ_ONLY', currentAuthority: false }),
  })
}

if (require.main === module) {
  currentAgentStatus().then((value) => {
    process.stdout.write(`${JSON.stringify(value)}\n`)
    if (!value.healthy || value.status !== 'HEALTHY') process.exitCode = 3
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'AGENT_CURRENT_STATUS_FAILED' })}\n`)
    process.exitCode = 1
  })
}

module.exports = { AgentCurrentStatusError, currentAgentStatus, frozenIdentity }
