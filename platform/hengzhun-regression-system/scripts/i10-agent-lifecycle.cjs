#!/usr/bin/env node
'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

const releaseV4 = require('./i10-release-identity-v4.cjs')

const productRoot = path.resolve(__dirname, '..')
const SERVICE_ORDER = Object.freeze(['harness', 'mcp', 'worker'])
const LIVE_AUTHORIZATION_VARIABLE = 'HENGZHUN_AUTHORIZE_AGENT_LIVE'

class AgentLifecycleError extends Error {
  constructor(code, details) { super(code); this.code = code; this.details = details }
}

function readSpec(root = productRoot) {
  return JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'managed-process-spec-v1.json'), 'utf8'))
}

function validateManagedProcessSpec(spec) {
  if (spec?.schemaVersion !== 'hengzhun-agent-managed-process-spec/v1' || spec.profile !== 'NORMAL_CLI') throw new AgentLifecycleError('AGENT_PROCESS_SPEC_INVALID')
  const names = spec.services?.map((service) => service.name)
  if (JSON.stringify(names) !== JSON.stringify(['harness', 'mcp', 'worker'])) throw new AgentLifecycleError('AGENT_SERVICE_ORDER_INVALID')
  if (JSON.stringify(spec).toLowerCase().includes('flowise/app/node_modules/flowise/bin/run') && spec.forbiddenRuntime?.processMarker !== 'flowise/app/node_modules/flowise/bin/run') {
    throw new AgentLifecycleError('FLOWISE_NORMAL_ENTRYPOINT_FORBIDDEN')
  }
  if (spec.services.some((service) => /flowise/i.test(JSON.stringify(service)))) throw new AgentLifecycleError('FLOWISE_NORMAL_SERVICE_FORBIDDEN')
  return spec
}

function flowiseFindings(spec, { processes = [], listeners = [] } = {}) {
  const marker = spec.forbiddenRuntime.processMarker.replaceAll('/', '\\').toLowerCase()
  const processHits = processes.filter((process) => String(process.commandLine || '').replaceAll('/', '\\').toLowerCase().includes(marker))
  const portHits = listeners.filter((listener) => Number(listener.port) === Number(spec.forbiddenRuntime.port))
  return Object.freeze([
    ...processHits.map((process) => ({ kind: 'PROCESS', pid: Number(process.pid) || null })),
    ...portHits.map((listener) => ({ kind: 'PORT', pid: Number(listener.pid) || null, port: Number(listener.port) })),
  ])
}

function assertFlowiseAbsent(spec, observation) {
  const findings = flowiseFindings(spec, observation)
  if (findings.length) throw new AgentLifecycleError('UNEXPECTED_FLOWISE_BLOCKS_WRITES', findings)
  return true
}

function ownsProcess(root, process, component) {
  const expectedExecutable = path.resolve(root, component.executable).toLowerCase()
  const expectedEntrypoint = path.resolve(root, component.entrypoint).replaceAll('/', '\\').toLowerCase()
  return path.resolve(String(process.executablePath || '')).toLowerCase() === expectedExecutable &&
    String(process.commandLine || '').replaceAll('/', '\\').toLowerCase().includes(expectedEntrypoint)
}

function statePaths(root = productRoot) {
  const runtimeRoot = path.join(root, '.data', 'runtime')
  return Object.freeze({
    runtimeRoot,
    stateFile: path.join(runtimeRoot, 'agent-processes.json'),
    workerHealthFile: path.join(runtimeRoot, 'worker-health.json'),
    logRoot: path.join(root, '.data', 'logs', 'agent'),
  })
}

function environmentWithRuntimeFile({ root = productRoot, environment = process.env } = {}) {
  const merged = { ...environment }
  const source = path.join(root, '.data', 'runtime.env')
  if (!fs.existsSync(source)) return merged
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(HENGZHUN_[A-Z0-9_]+|VISION_MODEL_NAME|VISION_MODEL_FAMILY)=(.*)$/)
    // Explicit product-local visual binding overrides the inherited workstation model.
    if (match && (match[1].startsWith('VISION_') || !String(merged[match[1]] || '').trim())) merged[match[1]] = match[2]
  }
  return merged
}

function writeJsonAtomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

function readManagedState(root = productRoot) {
  const { stateFile } = statePaths(root)
  if (!fs.existsSync(stateFile)) return null
  try {
    const value = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    if (value?.schemaVersion !== 'hengzhun-agent-process-state/v1' || value.productRoot !== path.resolve(root) || !Array.isArray(value.services)) {
      throw new Error('schema')
    }
    return value
  } catch {
    throw new AgentLifecycleError('AGENT_PROCESS_STATE_INVALID')
  }
}

function removeManagedState(root = productRoot) {
  const { stateFile } = statePaths(root)
  if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
}

function modelIdentityFromEnvironment(environment = process.env) {
  const modelName = String(environment.HENGZHUN_MODEL_NAME || '').trim()
  const baseURL = String(environment.HENGZHUN_MODEL_BASE_URL || '').trim()
  if (!modelName || !baseURL) throw new AgentLifecycleError('AGENT_MODEL_BINDING_REQUIRED')
  return {
    bindingStatus: 'BOUND', providerProtocol: 'OPENAI_COMPATIBLE', profile: 'CONTROL_GENERIC', modelName,
    baseUrlHash: require('node:crypto').createHash('sha256').update(baseURL).digest('hex'),
    temperature: 0, streaming: false, toolMode: 'NONE',
    vision: {
      modelName: environment.VISION_MODEL_NAME || environment.MIDSCENE_MODEL_NAME || '',
      family: environment.VISION_MODEL_FAMILY || environment.MIDSCENE_MODEL_FAMILY || '',
      baseUrlHash: require('node:crypto').createHash('sha256').update(environment.VISION_BASE_URL || environment.MIDSCENE_MODEL_BASE_URL || '').digest('hex'),
    },
  }
}

function authorizedIdentity({ root = productRoot, environment = process.env, authorizationValue } = {}) {
  const identity = releaseV4.currentReleaseIdentityV4({ productRoot: root, modelConfigIdentity: modelIdentityFromEnvironment(environment) })
  const supplied = authorizationValue ?? environment[LIVE_AUTHORIZATION_VARIABLE]
  if (supplied !== identity.identityHash) throw new AgentLifecycleError('AGENT_LIVE_NOT_AUTHORIZED', { expectedReleaseIdentity: identity.identityHash })
  return identity
}

function requiredServiceEnvironment(environment = process.env) {
  for (const [name, minimum] of [['HENGZHUN_SERVICE_TOKEN', 32], ['HENGZHUN_WORKER_TOKEN', 32], ['HENGZHUN_MCP_TOKEN', 24]]) {
    if (String(environment[name] || '').length < minimum) throw new AgentLifecycleError('AGENT_CREDENTIAL_MISSING_OR_WEAK', { variable: name })
  }
}

function bindRuntimeIdentity(environment, releaseIdentityHash) {
  const value = String(releaseIdentityHash || '')
  if (!/^[a-f0-9]{64}$/.test(value)) throw new AgentLifecycleError('AGENT_RELEASE_IDENTITY_INVALID')
  return { ...environment, HENGZHUN_RELEASE_IDENTITY_HASH: value }
}

function defaultServiceEnvironment(root, component, environment = process.env) {
  const paths = statePaths(root)
  const common = {
    ...environment,
    HENGZHUN_PRODUCT_ROOT: root,
    HENGZHUN_HARNESS_URL: 'http://127.0.0.1:18788',
    HENGZHUN_STOP_FILE: path.join(paths.runtimeRoot, `stop-${component.name}.signal`),
  }
  if (component.name === 'harness') return {
    ...common, HOST: '127.0.0.1', PORT: String(component.port),
    HENGZHUN_DATABASE_PATH: path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'),
    HENGZHUN_DATABASE_BACKUP_PATH: path.join(root, '.data', 'sqlite', 'offline-backups'),
    HENGZHUN_ARTIFACT_ROOT: path.join(root, '.data', 'artifacts'),
  }
  if (component.name === 'mcp') return { ...common, HENGZHUN_MCP_HOST: '127.0.0.1', HENGZHUN_MCP_PORT: String(component.port), HENGZHUN_NAMESPACE: environment.HENGZHUN_AGENT_NAMESPACE || 'hengzhun-local' }
  return { ...common, HENGZHUN_WORKER_ID: environment.HENGZHUN_WORKER_ID || 'hengzhun-agent-worker', HENGZHUN_WORKER_HEALTH_FILE: paths.workerHealthFile }
}

function defaultProcessInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const script = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\" -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{pid=$p.ProcessId;executablePath=$p.ExecutablePath;commandLine=$p.CommandLine} | ConvertTo-Json -Compress}`
  const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || !String(result.stdout || '').trim()) return null
  try { return JSON.parse(result.stdout) } catch { return null }
}

function defaultPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

function httpOk(url, timeoutMs = 10_000, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    let timer
    const finish = value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value) }
    const request = http.get(url, (response) => { response.resume(); response.once('end', () => finish(response.statusCode === 200)) })
    const abort = () => { request.destroy(); finish(false) }
    timer = setTimeout(abort, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    request.once('error', () => finish(false))
  })
}

function workerHealth(root, record) {
  const { workerHealthFile } = statePaths(root)
  if (!fs.existsSync(workerHealthFile)) return false
  try {
    const health = JSON.parse(fs.readFileSync(workerHealthFile, 'utf8'))
    const age = Date.now() - Date.parse(health.updatedAt)
    return health.schemaVersion === 'hengzhun-worker-health-v2' && health.status === 'HEALTHY' && health.pid === record.pid && age >= 0 && age <= 15_000
  } catch { return false }
}

async function defaultHealth(root, record, _component, { timeoutMs = 10_000, signal } = {}) {
  if (record.name === 'harness') return httpOk('http://127.0.0.1:18788/health', timeoutMs, signal)
  if (record.name === 'mcp') return httpOk('http://127.0.0.1:18789/health', timeoutMs, signal)
  return workerHealth(root, record)
}

function defaultSpawn(root, component, environment) {
  const paths = statePaths(root)
  fs.mkdirSync(paths.logRoot, { recursive: true })
  const stopFile = path.join(paths.runtimeRoot, `stop-${component.name}.signal`)
  if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
  const stdout = fs.openSync(path.join(paths.logRoot, `${component.name}.stdout.log`), 'a')
  const stderr = fs.openSync(path.join(paths.logRoot, `${component.name}.stderr.log`), 'a')
  let child
  try {
    child = childProcess.spawn(path.resolve(root, component.executable), [path.resolve(root, component.entrypoint)], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr],
      env: defaultServiceEnvironment(root, component, environment),
    })
  } finally {
    fs.closeSync(stdout)
    fs.closeSync(stderr)
  }
  child.unref()
  return child
}

function serviceRecord(root, component, pid, identity, now = () => new Date()) {
  return Object.freeze({
    name: component.name, pid, executable: component.executable, entrypoint: component.entrypoint,
    runtimeFingerprint: identity.groupHashes[component.name], releaseIdentityHash: identity.identityHash,
    startedAt: now().toISOString(),
  })
}

function recordCurrent(root, record, component, identity, info) {
  return Boolean(record && record.name === component.name && record.releaseIdentityHash === identity.identityHash &&
    record.runtimeFingerprint === identity.groupHashes[component.name] && ownsProcess(root, info || {}, component))
}

async function inspectManagedOwnership({ root = productRoot, identity, deps = {}, signal } = {}) {
  const spec = validateManagedProcessSpec(readSpec(root))
  const state = (deps.readState || readManagedState)(root)
  const processInfo = deps.processInfo || defaultProcessInfo
  const sourceIdentity = identity || releaseV4.currentReleaseIdentityV4({ productRoot: root })
  const effectiveIdentity = identity || { ...sourceIdentity, identityHash: state?.releaseIdentityHash || sourceIdentity.identityHash }
  const services = []
  for (const component of spec.services) {
    if (signal?.aborted) throw new AgentLifecycleError('AGENT_READINESS_CANCELLED')
    const record = state?.services.find((item) => item.name === component.name)
    const info = record ? await processInfo(record.pid) : null
    const owned = recordCurrent(root, record, component, effectiveIdentity, info)
    services.push({ name: component.name, pid: record?.pid || null, alive: Boolean(info), owned, current: owned })
  }
  return Object.freeze({ services, owned: services.every(service => service.owned) })
}

async function managedStatus({ root = productRoot, identity, deps = {}, signal } = {}) {
  const observation = await inspectManagedOwnership({ root, identity, deps, signal })
  const health = deps.health || defaultHealth
  const components = readSpec(root).services
  const services = await Promise.all(observation.services.map(async service => ({ ...service,
    healthy: service.owned ? await health(root, service, components.find(item => item.name === service.name), { signal }) : false })))
  const healthy = services.every((service) => service.owned && service.healthy)
  const status = healthy ? 'HEALTHY' : services.some(service => service.alive) ? 'NOT_READY' : 'NOT_RUNNING'
  return Object.freeze({ schemaVersion: 'hengzhun-agent-lifecycle-status/v1', profile: 'NORMAL_CLI', status, healthy, services })
}

async function stopRecord(root, record, component, deps = {}) {
  const processInfo = deps.processInfo || defaultProcessInfo
  const info = await processInfo(record.pid)
  if (!info) return { name: record.name, outcome: 'ALREADY_STOPPED' }
  if (!recordCurrent(root, record, component, { identityHash: record.releaseIdentityHash, groupHashes: { [record.name]: record.runtimeFingerprint } }, info)) {
    throw new AgentLifecycleError('AGENT_PROCESS_OWNERSHIP_MISMATCH', { service: record.name, pid: record.pid })
  }
  const paths = statePaths(root)
  fs.mkdirSync(paths.runtimeRoot, { recursive: true })
  const stopFile = path.join(paths.runtimeRoot, `stop-${record.name}.signal`)
  ;(deps.signalStop || ((target) => fs.writeFileSync(target, 'stop\n', 'utf8')))(stopFile, record)
  const waitStopped = deps.waitStopped || (async (pid) => {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) { if (!defaultProcessInfo(pid)) return true; await new Promise((resolve) => setTimeout(resolve, 200)) }
    return false
  })
  if (!await waitStopped(record.pid, record)) {
    ;(deps.terminate || ((pid) => process.kill(pid, 'SIGTERM')))(record.pid)
    if (!await waitStopped(record.pid, record)) throw new AgentLifecycleError('AGENT_SERVICE_STOP_TIMEOUT', { service: record.name, pid: record.pid })
  }
  if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
  return { name: record.name, outcome: 'STOPPED' }
}

async function startManaged({ root = productRoot, environment = process.env, authorizationValue, deps = {} } = {}) {
  const identity = authorizedIdentity({ root, environment, authorizationValue })
  requiredServiceEnvironment(environment)
  const observation = deps.flowiseObservation || discoverFlowiseObservation()
  const plan = buildLifecyclePlan({ root, ...observation, exists: deps.exists })
  const readState = deps.readState || readManagedState
  const writeState = deps.writeState || ((targetRoot, value) => writeJsonAtomic(statePaths(targetRoot).stateFile, value))
  const processInfo = deps.processInfo || defaultProcessInfo
  const health = deps.health || defaultHealth
  const portAvailable = deps.portAvailable || defaultPortAvailable
  const spawn = deps.spawn || defaultSpawn
  const prior = readState(root)
  const retained = []
  for (const component of plan.services) {
    const record = prior?.services.find((item) => item.name === component.name)
    if (!record) continue
    const info = await processInfo(record.pid)
    if (!recordCurrent(root, record, component, identity, info)) throw new AgentLifecycleError('AGENT_PROCESS_OWNERSHIP_MISMATCH', { service: component.name, pid: record.pid })
    if (!await health(root, record, component)) throw new AgentLifecycleError('AGENT_PREEXISTING_SERVICE_UNHEALTHY', { service: component.name, pid: record.pid })
    retained.push(record)
  }
  for (const component of plan.services.filter((item) => item.port && !retained.some((record) => record.name === item.name))) {
    if (!await portAvailable(component.port)) throw new AgentLifecycleError('AGENT_PORT_OCCUPIED_UNKNOWN', { service: component.name, port: component.port })
  }
  const spawned = []
  try {
    for (const component of plan.services) {
      if (retained.some((record) => record.name === component.name)) continue
      const child = await spawn(root, component, bindRuntimeIdentity(environment, identity.identityHash))
      if (!Number.isInteger(child?.pid) || child.pid <= 0) throw new AgentLifecycleError('AGENT_SERVICE_SPAWN_FAILED', { service: component.name })
      const record = serviceRecord(root, component, child.pid, identity, deps.now)
      spawned.push(record)
      writeState(root, { schemaVersion: 'hengzhun-agent-process-state/v1', productRoot: path.resolve(root), releaseIdentityHash: identity.identityHash, services: [...retained, ...spawned] })
      const waitHealthy = deps.waitHealthy || (async () => {
        const deadline = Date.now() + 30_000
        while (Date.now() < deadline) {
          if (await health(root, record, component, { timeoutMs: Math.min(10_000, deadline - Date.now()) })) return true
          const remaining = deadline - Date.now()
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(250, remaining)))
        }
        return false
      })
      if (!await waitHealthy(root, record, component)) throw new AgentLifecycleError('AGENT_SERVICE_STARTUP_TIMEOUT', { service: component.name, pid: record.pid })
    }
  } catch (error) {
    for (const record of [...spawned].reverse()) {
      const component = plan.services.find((item) => item.name === record.name)
      try { await stopRecord(root, record, component, deps) } catch {}
    }
    if (retained.length) writeState(root, { schemaVersion: 'hengzhun-agent-process-state/v1', productRoot: path.resolve(root), releaseIdentityHash: identity.identityHash, services: retained })
    else (deps.removeState || removeManagedState)(root)
    throw error
  }
  return Object.freeze({ status: spawned.length ? 'STARTED' : 'ALREADY_RUNNING', profile: 'NORMAL_CLI', releaseIdentityHash: identity.identityHash, services: [...retained, ...spawned].map(({ name, pid }) => ({ name, pid })) })
}

async function stopManaged({ root = productRoot, environment = process.env, authorizationValue, deps = {} } = {}) {
  const spec = validateManagedProcessSpec(readSpec(root))
  const readState = deps.readState || readManagedState
  const state = readState(root)
  if (!state?.services.length) return Object.freeze({ status: 'ALREADY_STOPPED', profile: 'NORMAL_CLI', services: [] })
  if (!/^[a-f0-9]{64}$/.test(String(state.releaseIdentityHash || '')) ||
      state.services.some((record) => record.releaseIdentityHash !== state.releaseIdentityHash)) {
    throw new AgentLifecycleError('AGENT_PROCESS_STATE_INVALID')
  }
  const outcomes = []
  for (const record of [...state.services].reverse()) {
    const component = spec.services.find((item) => item.name === record.name)
    if (!component) throw new AgentLifecycleError('AGENT_PROCESS_STATE_INVALID')
    outcomes.push(await stopRecord(root, record, component, deps))
  }
  ;(deps.removeState || removeManagedState)(root)
  return Object.freeze({ status: 'STOPPED', profile: 'NORMAL_CLI', services: outcomes.reverse() })
}

function buildLifecyclePlan({ root = productRoot, processes = [], listeners = [], exists = fs.existsSync } = {}) {
  const spec = validateManagedProcessSpec(readSpec(root))
  assertFlowiseAbsent(spec, { processes, listeners })
  const components = [spec.interactive, ...spec.services]
  const missing = components.flatMap((component) => [component.executable, component.entrypoint])
    .filter((relative) => !exists(path.resolve(root, relative)))
  if (missing.length) throw new AgentLifecycleError('AGENT_RUNTIME_DEPENDENCY_MISSING', missing)
  return Object.freeze({
    schemaVersion: 'hengzhun-agent-lifecycle-plan/v1', profile: spec.profile, flowiseAbsent: true, writeReady: true,
    interactive: Object.freeze({ ...spec.interactive }), services: Object.freeze(spec.services.map((service) => Object.freeze({ ...service }))),
  })
}

function probeNodeVersion(executable) {
  const result = childProcess.spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new AgentLifecycleError('AGENT_NODE_RUNTIME_UNAVAILABLE')
  return String(result.stdout || '').trim()
}

function discoverFlowiseObservation() {
  const script = [
    "$p=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.CommandLine -like '*flowise*node_modules*flowise*bin*run*' } | Select-Object @{n='pid';e={$_.ProcessId}},@{n='commandLine';e={$_.CommandLine}})",
    "$l=@(Get-NetTCPConnection -State Listen -LocalPort 3006 -ErrorAction SilentlyContinue | Select-Object @{n='pid';e={$_.OwningProcess}},@{n='port';e={$_.LocalPort}})",
    "@{processes=$p;listeners=$l} | ConvertTo-Json -Depth 4 -Compress",
  ].join(';')
  const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || !String(result.stdout || '').trim()) throw new AgentLifecycleError('FLOWISE_OBSERVATION_UNAVAILABLE')
  try {
    const parsed = JSON.parse(result.stdout)
    return { processes: Array.isArray(parsed.processes) ? parsed.processes : parsed.processes ? [parsed.processes] : [], listeners: Array.isArray(parsed.listeners) ? parsed.listeners : parsed.listeners ? [parsed.listeners] : [] }
  } catch { throw new AgentLifecycleError('FLOWISE_OBSERVATION_INVALID') }
}

function doctor(options = {}) {
  const root = options.root || productRoot
  const observation = options.processes !== undefined || options.listeners !== undefined
    ? { processes: options.processes || [], listeners: options.listeners || [] }
    : discoverFlowiseObservation()
  const exists = options.exists
  const versionProbe = options.versionProbe || probeNodeVersion
  const { processes, listeners } = observation
  const plan = buildLifecyclePlan({ root, processes, listeners, exists })
  const runtime = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli', 'node-runtime-manifest-v1.json'), 'utf8'))
  const cliVersion = versionProbe(path.resolve(root, runtime.cli.executable))
  const serviceVersion = versionProbe(path.resolve(root, runtime.services.executable))
  if (cliVersion !== runtime.cli.version || serviceVersion !== runtime.services.version) throw new AgentLifecycleError('AGENT_NODE_RUNTIME_VERSION_MISMATCH')
  return Object.freeze({ ...plan, status: 'READY', nodeVersions: Object.freeze({ cli: cliVersion, services: serviceVersion }) })
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const command = process.argv[2]
    const environment = environmentWithRuntimeFile()
    const value = command === 'doctor' ? doctor()
      : command === 'status' ? await managedStatus()
        : command === 'start' ? await startManaged({ environment })
          : command === 'stop' ? await stopManaged({ environment })
            : (() => { throw new AgentLifecycleError('AGENT_LIFECYCLE_COMMAND_INVALID') })()
    process.stdout.write(`${JSON.stringify(value)}\n`)
    if (command === 'status' && !value.healthy) process.exitCode = 3
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'AGENT_LIFECYCLE_FAILED' })}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  AgentLifecycleError, LIVE_AUTHORIZATION_VARIABLE,
  assertFlowiseAbsent, authorizedIdentity, buildLifecyclePlan,
  discoverFlowiseObservation, doctor, flowiseFindings,
  environmentWithRuntimeFile, httpOk, inspectManagedOwnership, workerHealth, managedStatus, modelIdentityFromEnvironment, ownsProcess, readManagedState, recordCurrent,
  bindRuntimeIdentity, requiredServiceEnvironment, serviceRecord, startManaged, statePaths, stopManaged, stopRecord,
  validateManagedProcessSpec,
}
