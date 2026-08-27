import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const lifecycle = require('../../scripts/i10-agent-lifecycle.cjs')
const v4 = require('../../scripts/i10-release-identity-v4.cjs')
const legacy = require('../../scripts/i10-release-identity.cjs')
const stage9 = require('../../scripts/i10-stage9-portable.cjs')
const fs = require('node:fs')

test('normal managed process spec has one CLI and exactly Harness MCP Worker', () => {
  const plan = lifecycle.buildLifecyclePlan({ root: productRoot, processes: [], listeners: [] })
  assert.equal(plan.profile, 'NORMAL_CLI')
  assert.equal(plan.interactive.name, 'hz-agent')
  assert.deepEqual(plan.services.map((service) => service.name), ['harness', 'mcp', 'worker'])
  assert.doesNotMatch(JSON.stringify(plan.services), /flowise/i)
  assert.equal(plan.flowiseAbsent, true)
  assert.equal(plan.writeReady, true)
})

test('unexpected Flowise process or listener blocks write readiness deterministically', () => {
  for (const observation of [
    { processes: [{ pid: 42, commandLine: 'node flowise/app/node_modules/flowise/bin/run start' }], listeners: [] },
    { processes: [], listeners: [{ pid: 43, port: 3006 }] },
  ]) assert.throws(
    () => lifecycle.buildLifecyclePlan({ root: productRoot, ...observation }),
    (error) => error.code === 'UNEXPECTED_FLOWISE_BLOCKS_WRITES',
  )
})

test('managed ownership binds exact executable and product entrypoint', () => {
  const plan = lifecycle.buildLifecyclePlan({ root: productRoot })
  const harness = plan.services[0]
  const executablePath = path.resolve(productRoot, harness.executable)
  const entrypoint = path.resolve(productRoot, harness.entrypoint)
  assert.equal(lifecycle.ownsProcess(productRoot, { executablePath, commandLine: `"${executablePath}" "${entrypoint}"` }, harness), true)
  assert.equal(lifecycle.ownsProcess(productRoot, { executablePath: path.resolve(productRoot, plan.interactive.executable), commandLine: entrypoint }, harness), false)
})

test('doctor proves exact bundled Node versions without starting a process', () => {
  const result = lifecycle.doctor({ root: productRoot, processes: [], listeners: [] })
  assert.equal(result.status, 'READY')
  assert.deepEqual(result.nodeVersions, { cli: 'v24.19.0', services: 'v20.20.2' })
  assert.equal(result.writeReady, true)
})

test('runtime.env fills only missing HENGZHUN keys and never overrides explicit process values', () => {
  const temporary = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hengzhun-agent-env-'))
  try {
    fs.mkdirSync(path.join(temporary, '.data'), { recursive: true })
    fs.writeFileSync(path.join(temporary, '.data', 'runtime.env'), 'HENGZHUN_SERVICE_TOKEN=file-value\nPATH=forbidden\nHENGZHUN_MCP_TOKEN=mcp-value\n')
    const result = lifecycle.environmentWithRuntimeFile({ root: temporary, environment: { HENGZHUN_SERVICE_TOKEN: 'explicit', PATH: 'original' } })
    assert.equal(result.HENGZHUN_SERVICE_TOKEN, 'explicit')
    assert.equal(result.HENGZHUN_MCP_TOKEN, 'mcp-value')
    assert.equal(result.PATH, 'original')
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
})

test('normal lifecycle mutations require the exact configured-model v4 identity', async () => {
  const environment = {
    HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1',
    HENGZHUN_SERVICE_TOKEN: 's'.repeat(32), HENGZHUN_WORKER_TOKEN: 'w'.repeat(32), HENGZHUN_MCP_TOKEN: 'm'.repeat(24),
  }
  assert.throws(() => lifecycle.authorizedIdentity({ root: productRoot, environment, authorizationValue: 'wrong' }),
    (error) => error.code === 'AGENT_LIVE_NOT_AUTHORIZED' && /^[a-f0-9]{64}$/.test(error.details.expectedReleaseIdentity))
  const expected = v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) })
  assert.equal(lifecycle.authorizedIdentity({ root: productRoot, environment, authorizationValue: expected.identityHash }).identityHash, expected.identityHash)
})

test('managed start launches Harness MCP Worker in order and persists exact fingerprints', async () => {
  const environment = {
    HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1',
    HENGZHUN_SERVICE_TOKEN: 's'.repeat(32), HENGZHUN_WORKER_TOKEN: 'w'.repeat(32), HENGZHUN_MCP_TOKEN: 'm'.repeat(24),
  }
  const identity = v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) })
  const spawned = []
  let state
  const result = await lifecycle.startManaged({ root: productRoot, environment, authorizationValue: identity.identityHash, deps: {
    flowiseObservation: { processes: [], listeners: [] }, readState: () => null,
    portAvailable: async () => true, health: async () => true, waitHealthy: async () => true,
    spawn: async (_root, component) => { spawned.push(component.name); return { pid: 1000 + spawned.length } },
    writeState: (_root, value) => { state = value }, now: () => new Date('2026-08-26T12:00:00.000Z'),
  } })
  assert.deepEqual(spawned, ['harness', 'mcp', 'worker'])
  assert.equal(result.status, 'STARTED')
  assert.equal(state.releaseIdentityHash, identity.identityHash)
  for (const record of state.services) assert.equal(record.runtimeFingerprint, identity.groupHashes[record.name])
})

test('unknown listener fails closed before spawning any managed service', async () => {
  const environment = {
    HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1',
    HENGZHUN_SERVICE_TOKEN: 's'.repeat(32), HENGZHUN_WORKER_TOKEN: 'w'.repeat(32), HENGZHUN_MCP_TOKEN: 'm'.repeat(24),
  }
  const identity = v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) })
  let spawnCount = 0
  await assert.rejects(lifecycle.startManaged({ root: productRoot, environment, authorizationValue: identity.identityHash, deps: {
    flowiseObservation: { processes: [], listeners: [] }, readState: () => null,
    portAvailable: async (port) => port !== 18788, spawn: async () => { spawnCount += 1; return { pid: 99 } },
  } }), (error) => error.code === 'AGENT_PORT_OCCUPIED_UNKNOWN' && error.details.port === 18788)
  assert.equal(spawnCount, 0)
})

test('startup failure rolls back only processes spawned in that transaction', async () => {
  const environment = {
    HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1',
    HENGZHUN_SERVICE_TOKEN: 's'.repeat(32), HENGZHUN_WORKER_TOKEN: 'w'.repeat(32), HENGZHUN_MCP_TOKEN: 'm'.repeat(24),
  }
  const identity = v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) })
  const stopped = []
  let sequence = 0
  await assert.rejects(lifecycle.startManaged({ root: productRoot, environment, authorizationValue: identity.identityHash, deps: {
    flowiseObservation: { processes: [], listeners: [] }, readState: () => null, writeState: () => {}, removeState: () => {},
    portAvailable: async () => true, spawn: async () => ({ pid: 2000 + ++sequence }),
    health: async () => false, waitHealthy: async (_root, record) => record.name !== 'mcp',
    processInfo: async (pid) => {
      const component = pid === 2001 ? 'harness' : 'mcp'
      const spec = lifecycle.buildLifecyclePlan({ root: productRoot }).services.find((item) => item.name === component)
      return { pid, executablePath: path.resolve(productRoot, spec.executable), commandLine: `"${path.resolve(productRoot, spec.executable)}" "${path.resolve(productRoot, spec.entrypoint)}"` }
    },
    signalStop: (_target, record) => stopped.push(record.name), waitStopped: async () => true,
  } }), (error) => error.code === 'AGENT_SERVICE_STARTUP_TIMEOUT')
  assert.deepEqual(stopped, ['mcp', 'harness'])
})

test('managed stop refuses an ownership mismatch and never sends a stop signal', async () => {
  const environment = {
    HENGZHUN_MODEL_NAME: 'configured-model', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1',
    HENGZHUN_SERVICE_TOKEN: 's'.repeat(32), HENGZHUN_WORKER_TOKEN: 'w'.repeat(32), HENGZHUN_MCP_TOKEN: 'm'.repeat(24),
  }
  const identity = v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: lifecycle.modelIdentityFromEnvironment(environment) })
  const record = lifecycle.serviceRecord(productRoot, lifecycle.buildLifecyclePlan({ root: productRoot }).services[0], 31337, identity)
  let signaled = false
  await assert.rejects(lifecycle.stopManaged({ root: productRoot, environment, authorizationValue: identity.identityHash, deps: {
    readState: () => ({ schemaVersion: 'hengzhun-agent-process-state/v1', productRoot, releaseIdentityHash: identity.identityHash, services: [record] }),
    processInfo: async () => ({ pid: 31337, executablePath: process.execPath, commandLine: 'node unknown.js' }),
    signalStop: () => { signaled = true },
  } }), (error) => error.code === 'AGENT_PROCESS_OWNERSHIP_MISMATCH')
  assert.equal(signaled, false)
})

test('cold rollback is disabled, separately authorized and shares no normal switch', async () => {
  const descriptor = JSON.parse(await readFile(new URL('../flowise-cold-rollback-v1.json', import.meta.url), 'utf8'))
  assert.equal(descriptor.status, 'DISABLED')
  assert.equal(descriptor.sharesNormalStartSwitch, false)
  assert.equal(descriptor.evidenceReuseAcrossProfiles, false)
  assert.equal(descriptor.authorizationVariable, 'HENGZHUN_AUTHORIZE_FLOWISE_COLD_ROLLBACK')
  const identity = 'a'.repeat(64)
  assert.throws(() => lifecycle.buildColdRollbackPlan({ root: productRoot, authorizationValue: 'wrong', expectedReleaseIdentity: identity }),
    (error) => error.code === 'FLOWISE_COLD_ROLLBACK_NOT_AUTHORIZED')
  const plan = lifecycle.buildColdRollbackPlan({ root: productRoot, authorizationValue: identity, expectedReleaseIdentity: identity })
  assert.equal(plan.profile, 'FLOWISE_COLD_ROLLBACK')
  assert.equal(plan.normalProfileDisabled, true)
  assert.equal(plan.evidenceReusableByNormalProfile, false)
  assert.equal(plan.executionPerformed, false)
})

test('ReleaseIdentity v4 covers the normal chain and excludes Flowise and user data', () => {
  const identity = v4.currentReleaseIdentityV4({ productRoot })
  assert.equal(identity.schemaVersion, 'hengzhun-i10-release-identity-v4')
  assert.equal(identity.profile, 'NORMAL_CLI')
  assert.equal(identity.releaseStatus, 'SOURCE_FROZEN_UNBOUND')
  for (const group of ['agentCli', 'controller', 'mcp', 'lifecycle', 'harness', 'worker']) assert.match(identity.groupHashes[group], /^[0-9a-f]{64}$/)
  assert.ok(identity.files.includes('agent-cli/package-lock.json'))
  assert.ok(identity.files.includes('controller/session-schema-v1.json'))
  assert.ok(identity.files.includes('scripts/i10-agent-lifecycle.cjs'))
  assert.equal(identity.files.some((file) => file.startsWith('flowise/app/') || /agentflow-v\d+\.json$/.test(file) || file.startsWith('.data/')), false)
})

test('every governed v4 file causes identity drift on one-byte change', () => {
  const baseline = v4.currentReleaseIdentityV4({ productRoot })
  for (const changedPath of baseline.files) {
    const changed = v4.currentReleaseIdentityV4({
      productRoot,
      readFile(relative) {
        const bytes = fs.readFileSync(path.join(productRoot, ...relative.split('/')))
        return relative === changedPath ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes
      },
    })
    assert.notEqual(changed.identityHash, baseline.identityHash, changedPath)
  }
})

test('v4 identity is deterministic and a non-secret model binding changes it', () => {
  const first = v4.currentReleaseIdentityV4({ productRoot })
  const second = v4.currentReleaseIdentityV4({ productRoot })
  assert.equal(second.identityHash, first.identityHash)
  const bound = v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: {
    bindingStatus: 'BOUND', providerProtocol: 'OPENAI_COMPATIBLE', profile: 'CONTROL_GENERIC',
    modelName: 'configured-model', baseUrlHash: 'a'.repeat(64), temperature: 0, streaming: false, toolMode: 'NONE',
  } })
  assert.equal(bound.releaseStatus, 'FROZEN')
  assert.notEqual(bound.identityHash, first.identityHash)
})

test('secret-shaped model identity fields are rejected before hashing', () => {
  assert.throws(() => v4.currentReleaseIdentityV4({ productRoot, modelConfigIdentity: {
    bindingStatus: 'BOUND', apiKey: 'must-not-enter-identity',
  } }), /I10_V4_SECRET_FIELD/)
})

test('legacy v1-v3 evidence can never compare equal to v4', () => {
  const current = v4.currentReleaseIdentityV4({ productRoot })
  const old = legacy.currentReleaseIdentity({ productRoot, requireDeployed: false })
  assert.equal(v4.sameReleaseIdentity(current, old), false)
  assert.equal(v4.sameReleaseIdentity(old, current), false)
  assert.equal(v4.sameReleaseIdentity(current, { ...current }), true)
})

test('root entrypoints expose read-only doctor and identity v4 commands', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.match(manifest.scripts['doctor:agent'], /i10-agent-lifecycle\.cjs doctor/)
  assert.match(manifest.scripts['identity:v4'], /i10-release-identity-v4\.cjs/)
  assert.doesNotMatch(manifest.scripts['doctor:agent'], /start|stop|flowise/i)
})

test('Stage9 worktree projection includes CLI Controller and v4 lifecycle assets', () => {
  const files = stage9.portableWorktreeFiles()
  const prefix = 'platform/hengzhun-regression-system/'
  for (const relative of [
    'agent-cli/package-lock.json', 'agent-cli/managed-process-spec-v1.json',
    'controller/controller-release-manifest-v2.json', 'scripts/i10-agent-lifecycle.cjs', 'scripts/i10-release-identity-v4.cjs',
  ]) assert.ok(files.includes(`${prefix}${relative}`), relative)
})
