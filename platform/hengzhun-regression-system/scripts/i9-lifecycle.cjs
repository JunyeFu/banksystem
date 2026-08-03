'use strict'

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { ProgressReporter, enabledFromEnvironment } = require('./progress.cjs')
const { RecoveryStore, fingerprint } = require('./recovery.cjs')

const root = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i9.runtime.example.json'), 'utf8'))
const nodeExecutable = path.resolve(root, config.paths.nodeExecutable)
const stateRoot = path.join(root, '.data', 'runtime')
const stateFile = path.join(stateRoot, 'i9-processes.json')
const lifecycleFile = path.join(stateRoot, 'i9-last-lifecycle.json')
const workerHealthFile = path.join(stateRoot, 'worker-health.json')
const logRoot = path.join(root, '.data', 'logs', 'i9')
const serviceOrder = ['harness', 'mcp', 'worker', 'flowise']
const serviceLabels = { harness: 'Harness', mcp: 'MCP', worker: 'Worker', flowise: 'Flowise' }
let reporter = null
const definitions = {
  harness: { marker: 'dist\\harness\\src\\index.js', args: ['dist/harness/src/index.js'], health: `http://127.0.0.1:${config.network.harnessPort}/health`, port: config.network.harnessPort },
  mcp: { marker: 'mcp\\src\\server.cjs', args: ['mcp/src/server.cjs'], health: `http://127.0.0.1:${config.network.mcpPort}/health`, port: config.network.mcpPort },
  worker: { marker: 'worker\\src\\index.cjs', args: ['worker/src/index.cjs'] },
  flowise: { marker: 'node_modules\\flowise\\bin\\run', args: ['flowise/app/node_modules/flowise/bin/run', 'start'], health: `http://127.0.0.1:${config.network.flowisePort}/api/v1/ping`, port: config.network.flowisePort }
}

// A listening port alone is not enough to prove that it serves the currently
// exported package.  Keep a small, non-secret fingerprint alongside each
// owned process so START can safely replace an older package runtime.
const serviceFingerprintInputs = {
  // Candidate source is compiled by Harness, not Worker.  Include the
  // compiled builder here so START never keeps an older Harness process that
  // silently issues stale candidate scripts after a source rebuild.
  harness: ['dist/harness/src/index.js', 'dist/harness/src/server.js', 'dist/harness/src/database.js', 'dist/harness/src/i8/script-package-builder.js'],
  mcp: ['mcp/src/server.cjs'],
  worker: ['worker/src/index.cjs', 'worker/src/i10-midscene-candidate-authoring.cjs', 'worker/src/i8-candidate-runner.cjs', 'worker/src/i8-formal-runner.cjs', 'worker/src/i10-verification-policy.cjs'],
  // Agentflow data is deployed through the Flowise public API and must not
  // force a server restart after a successful publication.  Only files that
  // alter the locally served Flowise runtime belong in this fingerprint.
  flowise: ['flowise/i10/hengzhun-attachment-bridge-v1.js', 'scripts/apply-i9-flowise-overlays.cjs']
}

function serviceFingerprint(name) {
  const hash = crypto.createHash('sha256')
  for (const relative of serviceFingerprintInputs[name] || []) {
    const absolute = path.join(root, relative)
    hash.update(relative).update('\0')
    if (!fs.existsSync(absolute)) {
      hash.update('MISSING\0')
      continue
    }
    hash.update(fs.readFileSync(absolute)).update('\0')
  }
  return hash.digest('hex')
}

function runtimeCurrent(record) {
  return Boolean(record?.runtimeFingerprint) && record.runtimeFingerprint === serviceFingerprint(record.name)
}

class LifecycleError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
    if (['I9_CREDENTIAL_MISSING_OR_WEAK', 'I9_PORT_OCCUPIED_UNKNOWN', 'I9_PROCESS_OWNERSHIP_MISMATCH'].includes(code)) this.exitCode = 78
  }
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

async function runCheckedWithHeartbeat(command, args, options, label) {
  return await new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, { ...options, stdio: 'pipe', windowsHide: true })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk); reporter?.activity(`${label}仍在运行`, false) })
    child.stdout.on('data', () => reporter?.activity(`${label}仍在运行`, false))
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new LifecycleError('I9_PREPARE_COMMAND_FAILED', `${label} failed with exit code ${code}`, { exitCode: code, stderr: stderr.slice(-500) })))
  })
}

async function prepare(options = {}) {
  const required = [
    nodeExecutable,
    path.join(root, 'flowise', 'app', 'node_modules', 'flowise', 'bin', 'run'),
    path.join(root, config.paths.chromiumExecutable),
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  ]
  for (const target of required) if (!fs.existsSync(target)) throw new LifecycleError('I9_RUNTIME_DEPENDENCY_MISSING', `required product dependency is missing: ${path.relative(root, target)}`)
  for (const relative of ['.data/runtime', '.data/logs/i9', '.data/flowise/secrets', '.data/flowise/storage', '.data/flowise/logs', '.data/sqlite', '.data/backups', '.data/artifacts']) fs.mkdirSync(path.join(root, relative), { recursive: true })
  if (!options.quietProgress) reporter?.startStage(4, 5, '编译Harness并校验运行依赖', { maxWaitHint: '超过10秒将持续显示心跳' })
  await runCheckedWithHeartbeat(nodeExecutable, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')], { cwd: root }, 'TypeScript编译')
  if (!options.quietProgress) reporter?.activity('Harness编译和运行依赖校验完成')
  return { status: 'PREPARED', productRoot: root, runtimeDataRoot: '.data', services: serviceOrder }
}

function processInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const command = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\" -ErrorAction SilentlyContinue; if($p){$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}`
  const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true })
  if (result.status === 0 && result.stdout.trim()) {
    try { return JSON.parse(result.stdout.trim()) } catch {}
  }
  const fallback = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{ProcessId=$p.Id;ExecutablePath=$p.Path;CommandLine=$null;StartTime=$p.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress}`
  const fallbackResult = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', fallback], { encoding: 'utf8', windowsHide: true })
  if (fallbackResult.status !== 0 || !fallbackResult.stdout.trim()) return null
  try { return JSON.parse(fallbackResult.stdout.trim()) } catch { return null }
}

function processInfos(records) {
  const pids = records.map(record => Number(record?.pid)).filter(pid => Number.isInteger(pid) && pid > 0)
  if (!pids.length) return new Map()
  const command = `$ids=@(${pids.join(',')}); @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$ids -contains $_.ProcessId} | Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress`
  const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || !result.stdout.trim()) return new Map()
  try {
    const parsed = JSON.parse(result.stdout.trim())
    return new Map((Array.isArray(parsed) ? parsed : [parsed]).map(info => [Number(info.ProcessId), info]))
  } catch { return new Map() }
}

function isOwned(record, info = processInfo(record.pid)) {
  if (!info) return false
  const executable = path.resolve(String(info.ExecutablePath || '')).toLowerCase()
  const commandLine = String(info.CommandLine || '').replaceAll('/', '\\').toLowerCase()
  if (executable !== nodeExecutable.toLowerCase()) return false
  if (commandLine) return commandLine.includes(definitions[record.name].marker.toLowerCase()) && commandLine.includes(root.toLowerCase())
  const processStartedAt = Date.parse(info.StartTime || '')
  const recordStartedAt = Date.parse(record.startedAt || '')
  const entrypointMatches = record.entrypoint === definitions[record.name].args[0]
  return entrypointMatches && Number.isFinite(processStartedAt) && Number.isFinite(recordStartedAt) && Math.abs(processStartedAt - recordStartedAt) <= 15_000
}

function pidExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
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

async function harnessHealth(record) {
  return await new Promise(resolve => {
    const request = http.get(definitions.harness.health, { timeout: 1500 }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        if (response.statusCode !== 200) return resolve(false)
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const migrations = payload?.database?.migrations
          // Service health proves that Harness can safely serve its own API.
          // Agentflow publication is a later START stage and is exposed as a
          // separate business-readiness signal in STATUS; otherwise a freshly
          // built flow creates a circular startup dependency.
          resolve(Array.isArray(migrations?.pending) && migrations.pending.length === 0)
        } catch { resolve(false) }
      })
    })
    request.on('timeout', () => { request.destroy(); resolve(false) })
    request.on('error', () => resolve(false))
  })
}

function workerHealth(record, owned = isOwned(record)) {
  if (!owned || !fs.existsSync(workerHealthFile)) return false
  try {
    const health = JSON.parse(fs.readFileSync(workerHealthFile, 'utf8'))
    const age = Date.now() - Date.parse(health.updatedAt)
    return health.schemaVersion === 'hengzhun-worker-health-v1' && health.status === 'HEALTHY' && health.pid === record.pid && age >= 0 && age <= config.lifecycle.workerHeartbeatMaxAgeSeconds * 1000
  } catch { return false }
}

async function serviceHealth(record, owned = isOwned(record)) {
  if (!owned || !runtimeCurrent(record)) return false
  if (record.name === 'worker') return workerHealth(record, owned)
  if (record.name === 'harness') return await harnessHealth(record)
  return await httpHealth(definitions[record.name].health)
}

function readState() {
  if (!fs.existsSync(stateFile)) return null
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { throw new LifecycleError('I9_PROCESS_STATE_INVALID', 'process state is not valid JSON') }
}

async function status() {
  const state = readState()
  const records = serviceOrder.map(name => state?.services?.find(item => item.name === name)).filter(Boolean)
  const infoByPid = processInfos(records)
  const services = []
  for (const name of serviceOrder) {
    const record = state?.services?.find(item => item.name === name)
    const owned = record ? isOwned(record, infoByPid.get(record.pid)) : false
    const current = record ? runtimeCurrent(record) : false
    const healthy = record ? await serviceHealth(record, owned) : false
    services.push({ name, pid: record?.pid || null, owned, current, healthy })
  }
  const healthy = services.every(item => item.owned && item.healthy)
  let businessReady = false
  let businessReadiness = 'HARNESS_UNAVAILABLE'
  try {
    const payload = await new Promise(resolve => {
      const request = http.get(definitions.harness.health, { timeout: 1500 }, response => {
        const chunks = []; response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { resolve(null) } })
      }); request.on('timeout', () => { request.destroy(); resolve(null) }); request.on('error', () => resolve(null))
    })
    businessReady = payload?.status === 'ok' && payload?.agentflow?.status === 'PUBLISHED' && payload?.runtime?.migrationsReady === true && payload?.worker?.versionMatch === true
    businessReadiness = businessReady ? 'READY' : (payload?.agentflow?.status === 'PUBLISHED' && payload?.worker?.versionMatch !== true ? 'WORKER_VERSION_DRIFT' : (payload?.agentflow?.status || 'NOT_READY'))
  } catch {}
  return { schemaVersion: 'hengzhun-i9-lifecycle-status-v2', status: healthy ? 'HEALTHY' : 'NOT_RUNNING', healthy, businessReady, businessReadiness, services, flowiseUrl: healthy ? `http://127.0.0.1:${config.network.flowisePort}` : null }
}

async function occupiedPorts(ignoredServices = new Set()) {
  const net = require('node:net')
  const ports = [
    ['flowise', config.network.flowisePort],
    ['harness', config.network.harnessPort],
    ['mcp', config.network.mcpPort]
  ].filter(([name]) => !ignoredServices.has(name)).map(([, port]) => port)
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

async function stopOwnedRecord(record) {
  if (!record || !pidExists(record.pid)) return
  if (!isOwned(record)) throw new LifecycleError('I9_PROCESS_OWNERSHIP_MISMATCH', `refusing to stop unowned process for ${record.name}`, { service: record.name, pid: record.pid })
  const stopFile = path.join(stateRoot, `stop-${record.name}.signal`)
  if (record.name === 'flowise') process.kill(record.pid, 'SIGTERM')
  else fs.writeFileSync(stopFile, 'stop\n')
  const gracefulDeadline = Date.now() + 10_000
  while (pidExists(record.pid) && Date.now() < gracefulDeadline) await new Promise(resolve => setTimeout(resolve, 200))
  if (pidExists(record.pid)) process.kill(record.pid, 'SIGTERM')
  const forcedDeadline = Date.now() + 5_000
  while (pidExists(record.pid) && Date.now() < forcedDeadline) await new Promise(resolve => setTimeout(resolve, 200))
  if (pidExists(record.pid)) throw new LifecycleError('I9_SERVICE_STOP_TIMEOUT', `${record.name} did not stop`, { service: record.name, pid: record.pid })
  if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
}

async function waitForService(record, spawnedChild) {
  if (!spawnedChild || spawnedChild.pid !== record.pid) {
    throw new LifecycleError('I9_SPAWN_HANDLE_MISMATCH', `spawn handle mismatch for ${record.name}`, { service: record.name })
  }
  const deadline = Date.now() + config.lifecycle.startupTimeoutSeconds * 1000
  while (Date.now() < deadline) {
    reporter?.throwIfCancelled()
    if (spawnedChild.exitCode !== null || !pidExists(record.pid)) throw new LifecycleError('I9_SERVICE_EXITED_DURING_STARTUP', `${record.name} exited during startup`, { service: record.name })
    if (await serviceHealth(record, true)) return
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
  const formalOverrides = testDataRoot ? {} : {
    HENGZHUN_DATABASE_PATH: path.join(root, '.data', 'sqlite', 'regression_platform.sqlite'),
    HENGZHUN_DATABASE_BACKUP_PATH: path.join(root, '.data', 'sqlite', 'offline-backups'),
    HENGZHUN_FLOWISE_ATTACHMENT_ROOT: path.join(root, '.data', 'flowise-attachments'),
    HENGZHUN_FLOWISE_STORAGE_ROOT: path.join(root, '.data', 'flowise', 'storage')
  }
  const common = { ...process.env, ...formalOverrides, HENGZHUN_PRODUCT_ROOT: root, HENGZHUN_HARNESS_URL: `http://127.0.0.1:${config.network.harnessPort}`, HENGZHUN_STOP_FILE: path.join(stateRoot, `stop-${name}.signal`) }
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
  return { ...common, HOST: '127.0.0.1', PORT: String(config.network.flowisePort), DATABASE_TYPE: 'sqlite', DATABASE_PATH: flowiseDataRoot, SECRETKEY_PATH: path.join(flowiseDataRoot, 'secrets'), BLOB_STORAGE_PATH: path.join(flowiseDataRoot, 'storage'), LOG_PATH: path.join(flowiseDataRoot, 'logs'), FLOWISE_FILE_SIZE_LIMIT: '500mb', DISABLE_FLOWISE_TELEMETRY: 'true', SECURE_COOKIES: 'false' }
}

function spawnService(name, spawnedChildren = null) {
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
  if (spawnedChildren) spawnedChildren.set(name, child)
  child.unref(); fs.closeSync(stdout); fs.closeSync(stderr)
  return { name, pid: child.pid, executable: config.paths.nodeExecutable, entrypoint: definition.args[0], stdout: stdoutRelative, stderr: stderrRelative, startedAt: new Date().toISOString(), runtimeFingerprint: serviceFingerprint(name) }
}

async function rollbackSpawnedRecords(records, spawnedChildren) {
  const stopped = []
  for (const name of [...serviceOrder].reverse()) {
    const record = records.find(item => item.name === name)
    const child = spawnedChildren.get(name)
    if (!record || !child || child.pid !== record.pid || !pidExists(record.pid)) continue
    const stopFile = path.join(stateRoot, `stop-${name}.signal`)
    if (name === 'flowise') child.kill('SIGTERM')
    else fs.writeFileSync(stopFile, 'stop\n')
    const gracefulDeadline = Date.now() + 3_000
    while (pidExists(record.pid) && Date.now() < gracefulDeadline) await new Promise(resolve => setTimeout(resolve, 100))
    if (pidExists(record.pid)) child.kill('SIGTERM')
    const forcedDeadline = Date.now() + 3_000
    while (pidExists(record.pid) && Date.now() < forcedDeadline) await new Promise(resolve => setTimeout(resolve, 100))
    if (pidExists(record.pid)) throw new LifecycleError('I9_START_ROLLBACK_TIMEOUT', `${name} did not stop during startup rollback`, { service: name, pid: record.pid })
    if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
    stopped.push(name)
  }
  return stopped
}

async function stopRecords(records, onStopped = null) {
  const stopped = []
  let stopIndex = 0
  for (const name of [...serviceOrder].reverse()) {
    stopIndex += 1
    const record = records.find(item => item.name === name)
    reporter?.startStage(stopIndex, serviceOrder.length, `正在停止 ${serviceLabels[name]}`, { maxWaitHint: '优雅停止最长10秒，必要时再检查5秒' })
    if (!record || !pidExists(record.pid)) {
      reporter?.activity(`${serviceLabels[name]} 未运行，跳过`)
      if (onStopped) onStopped(name, 'SKIPPED')
      continue
    }
    if (!isOwned(record)) throw new LifecycleError('I9_PROCESS_OWNERSHIP_MISMATCH', `refusing to stop unowned process for ${name}`, { service: name, pid: record.pid })
    const stopFile = path.join(stateRoot, `stop-${name}.signal`)
    if (name === 'flowise') process.kill(record.pid, 'SIGTERM')
    else fs.writeFileSync(stopFile, 'stop\n')
    const deadline = Date.now() + 10_000
    while (pidExists(record.pid) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    if (pidExists(record.pid)) process.kill(record.pid, 'SIGTERM')
    const forcedDeadline = Date.now() + 5_000
    while (pidExists(record.pid) && Date.now() < forcedDeadline) await new Promise(resolve => setTimeout(resolve, 200))
    if (pidExists(record.pid)) throw new LifecycleError('I9_SERVICE_STOP_TIMEOUT', `${name} did not stop`, { service: name, pid: record.pid })
    if (fs.existsSync(stopFile)) fs.rmSync(stopFile)
    stopped.push(name)
    if (onStopped) onStopped(name, 'STOPPED')
    reporter?.activity(`${serviceLabels[name]} 已停止`)
  }
  return stopped
}

async function start() {
  requiredEnvironment()
  await prepare({ quietProgress: true })
  const current = await status()
  if (current.healthy) return { ...current, action: 'ALREADY_RUNNING' }
  const previous = readState()
  const retained = []
  let prefixHealthy = true
  if (previous?.services?.length) {
    for (const name of serviceOrder) {
      const record = previous.services.find(item => item.name === name)
      if (!record) {
        prefixHealthy = false
        continue
      }
      if (pidExists(record.pid) && !isOwned(record)) {
        throw new LifecycleError('I9_PROCESS_OWNERSHIP_MISMATCH', `refusing to resume with unowned process for ${name}`, { service: name, pid: record.pid })
      }
      const healthy = prefixHealthy && await serviceHealth(record, true)
      if (healthy) retained.push(record)
      else {
        prefixHealthy = false
        await stopOwnedRecord(record)
      }
    }
  }
  if (!retained.length) {
    if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
    if (fs.existsSync(workerHealthFile)) fs.rmSync(workerHealthFile)
  } else {
    writeJsonAtomic(stateFile, { schemaVersion: 'hengzhun-i9-process-state-v1', productRoot: root, services: retained })
    reporter?.activity(`恢复${retained.length}个已由本包拥有且健康的服务：${retained.map(item => serviceLabels[item.name]).join(',')}`)
  }
  reporter?.startStage(2, 8, '检查端口并准备启动Harness', { maxWaitHint: '发现未知占用时立即失败，不终止未知进程' })
  const occupied = await occupiedPorts(new Set(retained.map(item => item.name)))
  if (occupied.length) throw new LifecycleError('I9_PORT_OCCUPIED_UNKNOWN', 'one or more formal ports are occupied', { listeners: occupied })
  const records = [...retained]
  const spawnedChildren = new Map()
  try {
    for (const name of serviceOrder) {
      if (retained.some(item => item.name === name)) {
        reporter?.startStage(serviceOrder.indexOf(name) + 2, 8, `恢复${serviceLabels[name]}健康状态`, { heartbeat: false })
        reporter?.activity(`${serviceLabels[name]}已健康，PID ${retained.find(item => item.name === name).pid}`)
        continue
      }
      const stageIndex = serviceOrder.indexOf(name) + 2
      reporter?.startStage(stageIndex, 8, `启动${serviceLabels[name]}并等待健康检查`, { maxWaitHint: `最长${config.lifecycle.startupTimeoutSeconds}秒` })
      const record = spawnService(name, spawnedChildren)
      records.push(record)
      writeJsonAtomic(stateFile, { schemaVersion: 'hengzhun-i9-process-state-v1', productRoot: root, services: records })
      await waitForService(record, spawnedChildren.get(name))
      reporter?.activity(`${serviceLabels[name]}健康，PID ${record.pid}`)
    }
    const result = await status()
    if (!result.healthy) throw new LifecycleError('I9_FOUR_SERVICE_HEALTH_FAILED', 'four-service health gate failed')
    writeJsonAtomic(lifecycleFile, { action: 'START', status: 'HEALTHY', at: new Date().toISOString(), services: records.map(({ name, pid }) => ({ name, pid })) })
    return { ...result, action: 'STARTED' }
  } catch (error) {
    const healthyRecords = []
    const unhealthySpawned = []
    for (const record of records) {
      if (await serviceHealth(record, true)) healthyRecords.push(record)
      else if (spawnedChildren.has(record.name)) unhealthySpawned.push(record)
    }
    try { await rollbackSpawnedRecords(unhealthySpawned, spawnedChildren) } catch (rollbackError) {
      error.rollback = { code: rollbackError.code || 'I9_START_ROLLBACK_FAILED', message: rollbackError.message }
    }
    if (healthyRecords.length) {
      writeJsonAtomic(stateFile, { schemaVersion: 'hengzhun-i9-process-state-v1', productRoot: root, services: healthyRecords })
      error.preservedHealthyServices = healthyRecords.map(({ name, pid }) => ({ name, pid }))
    } else if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
    throw error
  }
}

async function stop() {
  const state = readState()
  const recovery = new RecoveryStore(root, 'STOP', 'i10-stop-recovery-v1')
  const stateIdentity = fingerprint({
    productRoot: root,
    services: (state?.services || []).map(({ name, pid, startedAt }) => ({ name, pid, startedAt }))
  })
  const started = recovery.begin(stateIdentity)
  const completed = new Set(started.state.completedItems || [])
  if (!state?.services?.length) {
    reporter?.line('[STOP] 所有服务均未运行，跳过停止操作', true)
    recovery.complete({ status: 'ALREADY_STOPPED', stopped: [] })
    recovery.release()
    return { status: 'ALREADY_STOPPED', stopped: [] }
  }
  try {
    const stopped = await stopRecords(state.services, (name, outcome) => {
      completed.add(name)
      recovery.checkpoint(completed.size, `停止${serviceLabels[name]}`, [...completed], { outcomes: { ...(recovery.state.outcomes || {}), [name]: outcome } })
    })
    if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
    if (fs.existsSync(workerHealthFile)) fs.rmSync(workerHealthFile)
    writeJsonAtomic(lifecycleFile, { action: 'STOP', status: 'STOPPED', at: new Date().toISOString(), stopped })
    recovery.complete({ status: 'STOPPED', stopped })
    return { status: 'STOPPED', stopped }
  } catch (error) {
    recovery.fail(error, error.code !== 'I9_PROCESS_OWNERSHIP_MISMATCH', reporter?.cancelled)
    throw error
  } finally {
    recovery.release()
  }
}

async function main() {
  const command = process.argv[2]
  const operation = command === 'stop' ? 'STOP' : command === 'start' ? 'START' : command === 'prepare' ? 'PREPARE' : 'STATUS'
  reporter = new ProgressReporter(operation, { enabled: enabledFromEnvironment() })
  if (command !== 'status') reporter.installCancellation()
  let result
  if (command === 'prepare') result = await prepare()
  else if (command === 'start') result = await start()
  else if (command === 'status') result = await status()
  else if (command === 'stop') result = await stop()
  else throw new LifecycleError('I9_LIFECYCLE_COMMAND_INVALID', 'expected prepare, start, status or stop')
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (command === 'start' && process.env.HENGZHUN_PROGRESS_SUBTASK !== '1') reporter.finish(result.action === 'ALREADY_RUNNING' ? '服务已在运行' : '四项服务启动完成')
  if (command === 'stop') {
    reporter.finish(result.status === 'ALREADY_STOPPED' ? '服务已停止' : '安全停止完成', `实际停止：${result.stopped.join(',') || '无'}`)
    if (reporter.cancelled) process.exitCode = 130
  }
  if (command === 'status' && !result.healthy) process.exitCode = 3
}

main().catch(error => {
  reporter?.fail(error, '.data/logs/i9')
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || 'I9_LIFECYCLE_FAILED', message: error.message, ...(error.details ? { details: error.details } : {}) })}\n`)
  process.exitCode = error.exitCode || 1
})
