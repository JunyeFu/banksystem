#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
const fileHash = relative => sha256(fs.readFileSync(path.join(root, relative)))

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

function canonicalHash(value) {
  return sha256(JSON.stringify(canonicalize(value)))
}

function currentReleaseIdentity(options = {}) {
  const publication = readJson('flowise/i10/publication-manifest-v1.json')
  const catalog = readJson('contracts/i10/case-catalog-v1.json')
  const flowPath = String(publication.primaryFlowDataPath || '')
  if (!/^flowise\/i10\/agentflow-v\d+\.json$/.test(flowPath)) throw new Error('I10_RELEASE_FLOW_PATH_INVALID')
  const flow = readJson(flowPath)
  const deployedHash = String(options.deployedHash || publication.deployedFlowDataSha256 || '')
  const sourceHash = fileHash(flowPath)
  const identity = {
    schemaVersion: 'hengzhun-i10-release-identity-v1',
    flowId: String(publication.flowId || ''),
    flowVersion: Number(publication.primaryFlowVersion),
    sourceFlowHash: sourceHash,
    deployedFlowHash: deployedHash,
    normalizedFlowHash: canonicalHash(flow),
    harnessCodeHash: fileHash('harness/src/i10/service.ts'),
    workerCodeHash: fileHash('worker/src/i10-midscene-candidate-authoring.cjs'),
    migrationVersion: Number(options.migrationVersion || 36),
    caseCatalogVersion: Number(catalog.catalogVersion),
    caseCatalogHash: canonicalHash(catalog)
  }
  const deploymentReady = Boolean(publication.deployed === true && /^[0-9a-f]{64}$/i.test(identity.deployedFlowHash))
  if (!identity.flowId || !Number.isInteger(identity.flowVersion) || (options.requireDeployed !== false && !deploymentReady)) {
    throw new Error('I10_RELEASE_IDENTITY_INCOMPLETE')
  }
  return { ...identity, deploymentReady, identityHash: canonicalHash({ ...identity, deploymentReady }) }
}

function sameReleaseIdentity(left, right) {
  return Boolean(left && right && left.schemaVersion === 'hengzhun-i10-release-identity-v1' &&
    right.schemaVersion === 'hengzhun-i10-release-identity-v1' && left.identityHash === right.identityHash)
}

module.exports = { root, canonicalize, canonicalHash, currentReleaseIdentity, sameReleaseIdentity }

if (require.main === module) process.stdout.write(`${JSON.stringify(currentReleaseIdentity(), null, 2)}\n`)
