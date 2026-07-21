'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i9.runtime.example.json'), 'utf8'))
const nodeExecutable = path.resolve(root, config.paths.nodeExecutable)
const stateRoot = path.join(root, '.data', 'runtime')
const stateFile = path.join(stateRoot, 'i9-processes.json')
const lifecycleFile = path.join(stateRoot, 'i9-last-lifecycle.json')
const workerHealthFile = path.join(stateRoot, 'worker-health.json')
const logRoot = path.join(root, '.data', 'logs', 'i9')
const serviceOrder = ['harness', 'mcp', 'worker', 'flowise']
const definitions = {
  harness: { marker: 'dist\\harness\\src\\index.js', args: ['dist/harness/src/index.js'], health: `http://127.0.0.1:${config.network.harnessPort}/health`, port: config.network.harnessPort },
  mcp: { marker: 'mcp\\src\\server.cjs', args: ['mcp/src/server.cjs'], health: `http://127.0.0.1:${config.network.mcpPort}/health`, port: config.network.mcpPort },
  worker: { marker: 'worker\\src\\index.cjs', args: ['worker/src/index.cjs'] },
  flowise: { marker: 'node_modules\\flowise\\bin\\run', args: ['flowise/app/node_modules/flowise/bin/run', 'start'], health: `http://127.0.0.1:${config.network.flowisePort}/api/v1/ping`, port: config.network.flowisePort }
}

class LifecycleError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details }
}

function writeJsonAtomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, target)
}

function requiredEnvironment() {
  const rules = [
    ['HENGZHUN_SERVICE_TOKEN', 32],
    ['HENGZHUN_WORKER_TOKEN', 32],
    ['HENGZHUN_MCP_TOKEN', 24]
  ]
  for (const [name, minimum] of rules) {
    const value = process.env[name] || ''
    if (value.length < minimum) throw new LifecycleError('I9_CREDENTIAL_MISSING_OR_WEAK', `${name} must contain at least ${minimum} characters`, { variable: name })
  }
}

function prepare() {
  const required = [
    nodeExecutable,
    path.join(root, 'flowise', 'app', 'node_modules', 'flowise', 'bin', 'run'),
    path.join(root, config.paths.chromiumExecutable),
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  ]
  for (const target of required) if (!fs.existsSync(target)) throw new LifecycleError('I9_RUNTIME_DEPENDENCY_MISSING', `required product dependency is missing: ${path.relative(root, target)}`)
  for (const relative of ['.data/runtime', '.data/logs/i9', '.data/flowise/secrets', '.data/flowise/storage', '.data/flowise/logs', '.data/sqlite', '.data/backups', '.data/artifacts']) fs.mkdirSync(path.join(root, relative), { recursive: true })
  childProcess.execFileSync(nodeExecutable, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')], { cwd: root, stdio: 'pipe' })
  return { status: 'PREPARED', productRoot: root, runtimeDataRoot: '.data', services: serviceOrder }
}

function processInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const command = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\" -ErrorAction SilentlyContinue; if($p){$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}`
  const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || !result.stdout.trim()) return null
  try { return JSON.parse(result.stdout.trim()) } catch { return null }
}

function isOwned(record) {
  const info = processInfo(record.pid)
  if (!info) return false
  const executable = path.resolve(String(info.ExecutablePath || '')).toLowerCase()
  const commandLine = String(info.CommandLine || '').replaceAll('/', '\\').toLowerCase()
  return executable === nodeExecutable.toLowerCase() && commandLine.includes(definitions[record.name].marker.toLowerCase()) && commandLine.includes(root.toLowerCase())
}

function pidExists(pid) {
  return processInfo(pid) !== null
}

async function httpHealth(url, timeoutMs = 1500) {
  return await new Promise(resolve => {
    const request = http.get(url, { timeout: timeoutMs }, response => {
      response.resume()
      resolve(response.statusCode === 200)
    })
    request.on('timeout', () => { request.destroy(); resolve(false) })
    request.on('error', () => resolve(false))
  })
}

function workerHealth(record) {
  if (!isOwned(record) || !fs.existsSync(workerHealthFile)) return false
  try {
    const health = JSON.parse(fs.readFileSync(workerHealthFile, 'utf8'))
    const age = Date.now() - Date.parse(health.updatedAt)
    return health.schemaVersion === 'hengzhun-worker-health-v1' && health.status === 'HEALTHY' && health.pid === record.pid && age >= 0 && age <= config.lifecycle.workerHeartbeatMaxAgeSeconds * 1000
  } catch { return false }
}

async function serviceHealth(record) {
  if (!isOwned(record)) return false
  if (record.name === 'worker') return workerHealth(record)
  return await httpHealth(definitions[record.name].health)
}

function readState() {
  if (!fs.existsSync(stateFile)) return null
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { throw new LifecycleError('I9_PROCESS_STATE_INVALID', 'process state is not valid JSON') }
}

async function status() {
  const state = readState()
  const services = []
  for (const name of serviceOrder) {
    const record = state?.services?.find(item => item.name === name)
    const owned = record ? isOwned(record) : false
    const healthy = record ? await serviceHealth(record) : false
    services.push({ name, pid: record?.pid || null, owned, healthy })
  }
  const healthy = services.every(item => item.owned && item.healthy)
  return { schemaVersion: 'hengzhun-i9-lifecycle-status-v1', status: healthy ? 'HEALTHY' : 'NOT_RUNNING', healthy, services, flowiseUrl: healthy ? `http://127.0.0.1:${config.network.flowisePort}` : null }
}

async function occupiedPorts() {
  const net = require('node:net')
  const ports = [config.network.flowisePort, config.network.harnessPort, config.network.mcpPort]
  const occupied = []
  for (const port of ports) {
    const available = await new Promise(resolve => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)))
    })
    if (!available) occupied.push({ address: '127.0.0.1', port })
  }
  return occupied
}

async function waitForService(record) {
  const deadline = Date.now() + config.lifecycle.startupTimeoutSeconds * 1000
  while (Date.now() < deadline) {
    if (!pidExists(record.pid)) throw new LifecycleError('I9_SERVICE_EXITED_DURING_STARTUP', `${record.name} exited during startup`, { service: record.name })
    if (await serviceHealth(record)) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new LifecycleError('I9_SERVICE_STARTUP_TIMEOUT', `${record.name} did not become healthy`, { service: record.name })
}

function serviceEnvironment(name) {
  const testDataRoot = process.env.NODE_ENV === 'test' && process.env.HENGZHUN_I9_TEST_DATA_ROOT
    ? path.resolve(process.env.HENGZHUN_I9_TEST_DATA_ROOT)
    : null
  if (testDataRoot) {
    const allowedRoot = path.join(root, '.data', 'tests')
    if (!(testDataRoot === allowedRoot || testDataRoot.startsWith(`${allowedRoot}${path.sep}`))) {
      throw new LifecycleError('I9_TEST_DATA_ROOT_OUTSIDE_PRODUCT_DATA', 'test data root must stay under .data/tests')
    }
  }
  const common = { ...process.env, HENGZHUN_PRODUCT_ROOT: root, HENGZHUN_HARNESS_URL: `http://127.0.0.1:${config.network.harnessPort}`, HENGZHUN_STOP_FILE: path.join(stateRoot, `stop-${name}.signal`) }
  if (name === 'harness') {
    if (testDataRoot) {
      for (const relative of ['sqlite', 'sqlite/backups', 'artifacts']) fs.mkdirSync(path.join(testDataRoot, relative), { recursive: true })
    }
    return {
    ...common,
    HOST: '127.0.0.1', PORT: String(config.network.harnessPort), HENGZHUN_ALLOWED_CLIENTS: '127.0.0.1,::1',
    ...(testDataRoot ? {
      HENGZHUN_DATABASE_PATH: path.join(testDataRoot, 'sqlite', 'regression_platform.sqlite'),
      HENGZHUN_DATABASE_BACKUP_PATH: path.join(testDataRoot, 'sqlite', 'backups'),
      HENGZHUN_ARTIFACT_ROOT: path.join(testDataRoot, 'artifacts')
    } : {})
    }
  }
  if (name === 'mcp') return { ...common, FLOWISE_APP_PATH: path.join(root, 'flowise', 'app'), HENGZHUN_MCP_PORT: String(config.network.mcpPort), HENGZHUN_NAMESPACE: process.env.HENGZHUN_NAMESPACE || 'hengzhun-local' }
  if (name === 'worker') return { ...common, HENGZHUN_WORKER_ID: process.env.HENGZHUN_WORKER_ID || 'hengzhun-i9-worker', HENGZHUN_WORKER_HEALTH_FILE: workerHealthFile }
  const flowiseDataRoot = testDataRoot ? path.join(testDataRoot, 'flowise') : path.join(root, '.data', 'flowise')
  for (const relative of ['secrets', 'storage', 'logs']) fs.mkdirSync(path.join(flowiseDataRoot, relative), { recursive: true })
  return { ...common, HOST: '127.0.0.1', PORT: String(config.network.flowisePort), DATABASE_TYPE: 'sqlite', DATABASE_PATH: flowiseDataRoot, SECRETKEY_PATH: path.join(flowiseDataRoot, 'secrets'), BLOB_STORAGE_PATH: path.join(flowiseDataRoot, 'storage'), LOG_PATH: path.join(flowiseDataRoot, 'logs'), DISABLE_FLOWISE_TELEMETRY: 'true', SECURE_COOKIES: 'false' }
}

function spawnService(name) {
  const definition = definitions[name]
  const stdoutRelative = `.data/logs/i9/${name}.stdout.log`
  const stderrRelative = `.data/logs/i9/${name}.stderr.log`
  const stdout = fs.openSync(path.join(root, stdoutRelative), 'a')
  const stderr = fs.openSync(path.join(root, stderrRelative), 'a')
  const stopFile = path.join(stateRoot, `stop-${name}.signal`)
  if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
  const injectedFailure = process.env.NODE_ENV === 'test' && process.env.HENGZHUN_I9_TEST_FAIL_SERVICE === name
  const args = injectedFailure ? ['-e', 'process.exit(91)'] : [path.resolve(root, definition.args[0]), ...definition.args.slice(1)]
  const child = childProcess.spawn(nodeExecutable, args, { cwd: root, env: serviceEnvironment(name), detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr] })
  child.unref(); fs.closeSync(stdout); fs.closeSync(stderr)
  return { name, pid: child.pid, executable: config.paths.nodeExecutable, entrypoint: definition.args[0], stdout: stdoutRelative, stderr: stderrRelative, startedAt: new Date().toISOString() }
}

async function stopRecords(records) {
  const stopped = []
  for (const name of [...serviceOrder].reverse()) {
    const record = records.find(item => item.name === name)
    if (!record || !pidExists(record.pid)) continue
    if (!isOwned(record)) throw new LifecycleError('I9_PROCESS_OWNERSHIP_MISMATCH', `refusing to stop unowned process for ${name}`, { service: name, pid: record.pid })
    const stopFile = path.join(stateRoot, `stop-${name}.signal`)
    if (name === 'flowise') process.kill(record.pid, 'SIGTERM')
    else fs.writeFileSync(stopFile, 'stop\n')
    const deadline = Date.now() + 10_000
    while (pidExists(record.pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200))
    if (pidExists(record.pid)) process.kill(record.pid, 'SIGTERM')
    const forcedDeadline = Date.now() + 5_000
    while (pidExists(record.pid) && Date.now() < forcedDeadline) await new Promise(resolve => setTimeout(resolve, 200))
    if (pidExists(record.pid)) throw new LifecycleError('I9_SERVICE_STOP_TIMEOUT', `${name} did not stop`, { service: name, pid: record.pid })
    if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
    stopped.push(name)
  }
  return stopped
}

async function start() {
  requiredEnvironment()
  prepare()
  const current = await status()
  if (current.healthy) return { ...current, action: 'ALREADY_RUNNING' }
  const previous = readState()
  if (previous?.services?.length) await stopRecords(previous.services)
  if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
  if (fs.existsSync(workerHealthFile)) fs.rmSync(workerHealthFile)
  const occupied = await occupiedPorts()
  if (occupied.length) throw new LifecycleError('I9_PORT_OCCUPIED_UNKNOWN', 'one or more formal ports are occupied', { listeners: occupied })
  const records = []
  try {
    for (const name of serviceOrder) {
      const record = spawnService(name)
      records.push(record)
      writeJsonAtomic(stateFile, { schemaVersion: 'hengzhun-i9-process-state-v1', productRoot: root, services: records })
      await waitForService(record)
    }
    const result = await status()
    if (!result.healthy) throw new LifecycleError('I9_FOUR_SERVICE_HEALTH_FAILED', 'four-service health gate failed')
    writeJsonAtomic(lifecycleFile, { action: 'START', status: 'HEALTHY', at: new Date().toISOString(), services: records.map(({ name, pid }) => ({ name, pid })) })
    return { ...result, action: 'STARTED' }
  } catch (error) {
    try { await stopRecords(records) } catch {}
    if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
    throw error
  }
}

async function stop() {
  const state = readState()
  if (!state?.services?.length) return { status: 'ALREADY_STOPPED', stopped: [] }
  const stopped = await stopRecords(state.services)
  if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
  if (fs.existsSync(workerHealthFile)) fs.rmSync(workerHealthFile)
  writeJsonAtomic(lifecycleFile, { action: 'STOP', status: 'STOPPED', at: new Date().toISOString(), stopped })
  return { status: 'STOPPED', stopped }
}

async function main() {
  const command = process.argv[2]
  let result
  if (command === 'prepare') result = prepare()
  else if (command === 'start') result = await start()
  else if (command === 'status') result = await status()
  else if (command === 'stop') result = await stop()
  else throw new LifecycleError('I9_LIFECYCLE_COMMAND_INVALID', 'expected prepare, start, status or stop')
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (command === 'status' && !result.healthy) process.exitCode = 3
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'I9_LIFECYCLE_FAILED', message: error.message, ...(error.details ? { details: error.details } : {}) })}\n`)
  process.exitCode = 1
})
