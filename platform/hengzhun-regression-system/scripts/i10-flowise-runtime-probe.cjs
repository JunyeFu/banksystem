#!/usr/bin/env node
'use strict'

const path = require('node:path')

const root = path.resolve(__dirname, '..')
const { verifyRuntimeFork } = require('./i10-build-flowise-runtime-fork.cjs')
const { flowiseRuntimePolicy } = require('./i10-flowise-runtime-policy.cjs')

function optionValue(argv, name) {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw Object.assign(new Error(`FLOWISE_RUNTIME_PROBE_OPTION_VALUE_REQUIRED:${name}`), { code: 'FLOWISE_RUNTIME_PROBE_OPTION_VALUE_REQUIRED' })
  return value
}

function parseProbeOptions(argv = process.argv.slice(2), environment = process.env) {
  const appRootValue = optionValue(argv, '--app-root') || environment.FLOWISE_APP_PATH
  const acquisitionPolicyValue = optionValue(argv, '--acquisition-policy')
  return Object.freeze({
    appRoot: appRootValue ? path.resolve(appRootValue) : path.join(root, 'flowise', 'app'),
    ...(acquisitionPolicyValue ? { acquisitionPolicyPath: path.resolve(acquisitionPolicyValue) } : {})
  })
}

async function main(options = parseProbeOptions()) {
  const { appRoot } = options
  const fromFlowiseApp = name => require(path.join(appRoot, 'node_modules', name))
  const runtimeFork = verifyRuntimeFork(options)
  const policy = flowiseRuntimePolicy(appRoot, { nodeVersion: process.version })
  Object.assign(process.env, policy.environment)
  const { NodesPool } = fromFlowiseApp('flowise/dist/NodesPool.js')
  const nodesPool = new NodesPool()
  await nodesPool.initialize()
  const nodeNames = Object.keys(nodesPool.componentNodes).sort((left, right) => left.localeCompare(right, 'en'))
  const credentialNames = Object.keys(nodesPool.componentCredentials).sort((left, right) => left.localeCompare(right, 'en'))
  const expectedNodes = [...policy.allowedNodeNames].sort((left, right) => left.localeCompare(right, 'en'))
  if (JSON.stringify(nodeNames) !== JSON.stringify(expectedNodes)) throw Object.assign(new Error('FLOWISE_RUNTIME_NODE_READBACK_DRIFT'), { code: 'FLOWISE_RUNTIME_NODE_READBACK_DRIFT' })
  if (JSON.stringify(credentialNames) !== JSON.stringify(['openAIApi'])) throw Object.assign(new Error('FLOWISE_RUNTIME_CREDENTIAL_READBACK_DRIFT'), { code: 'FLOWISE_RUNTIME_CREDENTIAL_READBACK_DRIFT' })
  const BetterSqlite3 = fromFlowiseApp('better-sqlite3')
  const better = new BetterSqlite3(':memory:')
  try {
    if (better.prepare('select 1 as value').get()?.value !== 1) throw new Error('BETTER_SQLITE3_MEMORY_QUERY_FAILED')
  } finally {
    better.close()
  }

  const sqlite3 = fromFlowiseApp('sqlite3')
  await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(':memory:', error => {
      if (error) return reject(error)
      database.get('select 1 as value', (queryError, row) => {
        if (queryError || row?.value !== 1) return database.close(() => reject(queryError || new Error('SQLITE3_MEMORY_QUERY_FAILED')))
        database.close(closeError => closeError ? reject(closeError) : resolve())
      })
    })
  })

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'hengzhun-i10-flowise-runtime-probe-v1',
    status: 'READY',
    nodeVersion: process.version,
    runtimeForkClosureHash: runtimeFork.manifest.closureHash,
    nodeNames,
    credentialNames,
    nativeModules: ['better-sqlite3', 'sqlite3']
  })}\n`)
}

module.exports = { main, parseProbeOptions }

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error?.code || 'FLOWISE_RUNTIME_PROBE_FAILED' })}\n`)
    process.exitCode = 1
  })
}
