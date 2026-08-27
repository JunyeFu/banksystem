#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')
const { configuration: platformAdminConfiguration, ensureLive } = require('./platform-admin.cjs')
const { minimalExportPackage, preflight, validateExportPackage } = require('./i10-flowise-export-package.cjs')
const { assertEnabledNodeReadback, flowiseRuntimePolicy } = require('./i10-flowise-runtime-policy.cjs')

const root = path.resolve(__dirname, '..')
const nodeExecutable = path.join(root, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
const formalFlowiseAppRoot = path.join(root, 'flowise', 'app')
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise', 'i10', 'publication-manifest-v1.json'), 'utf8'))
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i10.runtime.example.json'), 'utf8'))

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function ensure(condition, code) {
  if (!condition) fail(code)
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { fail('I10_ISOLATED_IMPORT_PACKAGE_JSON_INVALID') }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function cookieHeader(headers) {
  const combined = headers.get('set-cookie')
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []
  return values.map(value => String(value).split(';', 1)[0]).join('; ')
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30_000) })
  const text = await response.text()
  let body = text
  try { body = text ? JSON.parse(text) : null } catch {}
  return { response, body }
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function assertNoReparsePoint(directory, allowedRoot) {
  const canonicalRoot = fs.realpathSync.native(allowedRoot)
  const canonicalDirectory = fs.realpathSync.native(directory)
  ensure(isWithin(canonicalRoot, canonicalDirectory), 'I10_ISOLATED_IMPORT_PATH_REALPATH_ESCAPE')
  let current = canonicalDirectory
  while (isWithin(canonicalRoot, current)) {
    ensure(!fs.lstatSync(current).isSymbolicLink(), 'I10_ISOLATED_IMPORT_REPARSE_POINT_FORBIDDEN')
    if (current === canonicalRoot) break
    current = path.dirname(current)
  }
  return canonicalDirectory
}

function allowedRoots() {
  const testRoot = path.resolve(root, '.data', 'tests')
  fs.mkdirSync(testRoot, { recursive: true })
  return [os.tmpdir(), testRoot].map(directory => assertNoReparsePoint(directory, directory))
}

function allowedDataRoot(value) {
  const requested = typeof value === 'string' && value.trim() ? path.resolve(value) : fs.realpathSync.native(os.tmpdir())
  const requestedParent = fs.existsSync(requested) ? requested : path.dirname(requested)
  ensure(fs.existsSync(requestedParent) && fs.statSync(requestedParent).isDirectory(), 'I10_ISOLATED_IMPORT_TEMP_PARENT_MISSING')
  const roots = allowedRoots()
  const matchedRoot = roots.find(allowed => isWithin(allowed, fs.realpathSync.native(requestedParent)))
  ensure(matchedRoot, 'I10_ISOLATED_IMPORT_DATA_ROOT_OUTSIDE_ALLOWED_ROOT')
  const safeParent = assertNoReparsePoint(requestedParent, matchedRoot)
  ensure(!isWithin(path.resolve(root, '.data', 'flowise'), safeParent), 'I10_ISOLATED_IMPORT_FORMAL_DATA_ROOT_FORBIDDEN')
  const requestedName = fs.existsSync(requested) ? 'hengzhun-i10-isolated-' : `${path.basename(requested).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40) || 'hengzhun-i10-isolated'}-`
  const created = fs.mkdtempSync(path.join(safeParent, requestedName))
  return assertNoReparsePoint(created, matchedRoot)
}

function flowiseInstallation(appRootValue) {
  const requested = path.resolve(appRootValue || formalFlowiseAppRoot)
  ensure(fs.existsSync(requested) && fs.statSync(requested).isDirectory(), 'I10_ISOLATED_IMPORT_FLOWISE_APP_ROOT_MISSING')
  const permitted = requested === path.resolve(formalFlowiseAppRoot)
    || allowedRoots().some(parent => isWithin(parent, fs.realpathSync.native(requested)))
  ensure(permitted, 'I10_ISOLATED_IMPORT_FLOWISE_APP_ROOT_OUTSIDE_ALLOWED_ROOT')
  const appPackage = readJson(path.join(requested, 'package.json'))
  const expectedPackage = readJson(path.join(formalFlowiseAppRoot, 'package.json'))
  const packageVersions = {}
  for (const name of ['flowise', 'flowise-components', 'flowise-ui']) {
    const expected = String(expectedPackage.dependencies?.[name] || '').replace(/^\^|~/, '')
    const installed = readJson(path.join(requested, 'node_modules', name, 'package.json'))
    ensure(installed.version === expected, `I10_ISOLATED_IMPORT_FLOWISE_VERSION_MISMATCH:${name}`)
    packageVersions[name] = installed.version
  }
  const entrypoint = path.join(requested, 'node_modules', 'flowise', 'bin', 'run')
  ensure(fs.existsSync(entrypoint), 'I10_ISOLATED_IMPORT_FLOWISE_MISSING')
  return { appRoot: requested, entrypoint, packageVersions: Object.freeze(packageVersions) }
}

async function portAvailable(port) {
  return await new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

async function findPort(start = 32000) {
  for (let port = start; port < start + 100; port += 1) if (await portAvailable(port)) return port
  fail('I10_ISOLATED_IMPORT_NO_FREE_PORT')
}

function spawnFlowise(dataRoot, port, installation) {
  ensure(fs.existsSync(nodeExecutable), 'I10_ISOLATED_IMPORT_NODE_MISSING')
  const flowiseData = path.join(dataRoot, 'flowise')
  for (const relative of ['secrets', 'storage', 'logs']) fs.mkdirSync(path.join(flowiseData, relative), { recursive: true })
  const stdoutPath = path.join(dataRoot, 'flowise.stdout.log')
  const stderrPath = path.join(dataRoot, 'flowise.stderr.log')
  const stdout = fs.openSync(stdoutPath, 'a')
  const stderr = fs.openSync(stderrPath, 'a')
  const inherited = Object.fromEntries([
    'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PATH', 'TEMP', 'TMP', 'LANG', 'TZ'
  ].filter(name => typeof process.env[name] === 'string').map(name => [name, process.env[name]]))
  const runtimePolicy = flowiseRuntimePolicy(installation.appRoot)
  const environment = {
    ...inherited,
    ...runtimePolicy.environment,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_TYPE: 'sqlite',
    DATABASE_PATH: flowiseData,
    SECRETKEY_PATH: path.join(flowiseData, 'secrets'),
    BLOB_STORAGE_PATH: path.join(flowiseData, 'storage'),
    LOG_PATH: path.join(flowiseData, 'logs'),
    FLOWISE_FILE_SIZE_LIMIT: '500mb',
    DISABLE_FLOWISE_TELEMETRY: 'true',
    SECURE_COOKIES: 'false'
  }
  const child = childProcess.spawn(nodeExecutable, [installation.entrypoint, 'start'], {
    cwd: installation.appRoot,
    env: environment,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr]
  })
  fs.closeSync(stdout)
  fs.closeSync(stderr)
  return { child, runtimePolicy }
}

async function waitForFlowise(child, baseUrl) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`I10_ISOLATED_IMPORT_FLOWISE_EXITED_DURING_STARTUP_EXIT_${child.exitCode}`)
    try {
      const result = await request(`${baseUrl}/api/v1/ping`, { signal: AbortSignal.timeout(2_000) })
      if (result.response.status === 200) return
    } catch {}
    await sleep(500)
  }
  fail('I10_ISOLATED_IMPORT_FLOWISE_STARTUP_TIMEOUT')
}

async function authorization(baseUrl) {
  const admin = platformAdminConfiguration()
  const login = await request(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: admin.password })
  })
  ensure(login.response.ok, `I10_ISOLATED_IMPORT_LOGIN_FAILED:${login.response.status}`)
  const cookie = cookieHeader(login.response.headers)
  ensure(cookie, 'I10_ISOLATED_IMPORT_LOGIN_COOKIE_MISSING')
  return { Cookie: cookie, 'x-request-from': 'internal' }
}

async function stopOwned(child) {
  if (!child || child.exitCode !== null) return true
  const waitForExit = async milliseconds => {
    const deadline = Date.now() + milliseconds
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await sleep(100)
    return child.exitCode !== null || child.signalCode !== null
  }
  child.kill('SIGTERM')
  if (await waitForExit(15_000)) return true
  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    // This PID was returned by spawnFlowise in this process.  Terminate only
    // that owned tree; never search by image name or command-line substring.
    childProcess.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
  } else child.kill('SIGKILL')
  return await waitForExit(15_000)
}

async function smokeIsolated(dataRootValue, requestedPort, flowiseAppRootValue) {
  const dataRoot = allowedDataRoot(dataRootValue)
  const installation = flowiseInstallation(flowiseAppRootValue)
  const port = requestedPort ? Number(requestedPort) : await findPort()
  ensure(Number.isInteger(port) && port >= 1024 && port <= 65535, 'I10_ISOLATED_IMPORT_PORT_INVALID')
  ensure(await portAvailable(port), 'I10_ISOLATED_IMPORT_PORT_NOT_AVAILABLE')
  const baseUrl = `http://127.0.0.1:${port}`
  let child = null
  let stopped = false
  try {
    const spawned = spawnFlowise(dataRoot, port, installation)
    child = spawned.child
    await waitForFlowise(child, baseUrl)
    await ensureLive({ baseUrl, databasePath: path.join(dataRoot, 'flowise', 'database.sqlite') })
    const auth = await authorization(baseUrl)
    const enabledNodes = await request(`${baseUrl}/api/v1/nodes`, { headers: auth })
    ensure(enabledNodes.response.ok, `I10_ISOLATED_IMPORT_NODE_READBACK_FAILED:${enabledNodes.response.status}`)
    const enabledNodeNames = assertEnabledNodeReadback(enabledNodes.body, spawned.runtimePolicy)
    stopped = await stopOwned(child)
    ensure(stopped, 'I10_ISOLATED_IMPORT_PROCESS_STOP_FAILED')
    return {
      status: 'I10_FLOWISE_ISOLATED_SMOKE_PASSED',
      targetBaseUrl: baseUrl,
      targetDataRoot: dataRoot,
      flowiseAppRoot: installation.appRoot,
      packageVersions: installation.packageVersions,
      allowedNodeNames: enabledNodeNames,
      disabledNodeCount: spawned.runtimePolicy.disabledNodeNames.length,
      processStopped: stopped
    }
  } finally {
    if (child && !stopped) {
      stopped = await stopOwned(child)
      if (!stopped && !process.exitCode) process.exitCode = 2
    }
  }
}

async function reimportIsolated(packagePath, dataRootValue, requestedPort, flowiseAppRootValue) {
  const input = preflight(packagePath)
  const packageValue = readJson(input.packagePath)
  const dataRoot = allowedDataRoot(dataRootValue)
  const installation = flowiseInstallation(flowiseAppRootValue)
  const port = requestedPort ? Number(requestedPort) : await findPort()
  ensure(Number.isInteger(port) && port >= 1024 && port <= 65535, 'I10_ISOLATED_IMPORT_PORT_INVALID')
  ensure(await portAvailable(port), 'I10_ISOLATED_IMPORT_PORT_NOT_AVAILABLE')

  const baseUrl = `http://127.0.0.1:${port}`
  let child = null
  let stopped = false
  try {
    const spawned = spawnFlowise(dataRoot, port, installation)
    child = spawned.child
    await waitForFlowise(child, baseUrl)
    const databasePath = path.join(dataRoot, 'flowise', 'database.sqlite')
    await ensureLive({ baseUrl, databasePath })
    const auth = await authorization(baseUrl)
    const enabledNodes = await request(`${baseUrl}/api/v1/nodes`, { headers: auth })
    ensure(enabledNodes.response.ok, `I10_ISOLATED_IMPORT_NODE_READBACK_FAILED:${enabledNodes.response.status}`)
    const enabledNodeNames = assertEnabledNodeReadback(enabledNodes.body, spawned.runtimePolicy)
    const imported = await request(`${baseUrl}${publication.importPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify(packageValue)
    })
    ensure(imported.response.ok, `I10_ISOLATED_IMPORT_FAILED:${imported.response.status}`)

    const listed = await request(`${baseUrl}/api/v1/chatflows?type=AGENTFLOW`, { headers: auth })
    ensure(listed.response.ok, `I10_ISOLATED_IMPORT_LIST_FAILED:${listed.response.status}`)
    const chatflows = Array.isArray(listed.body) ? listed.body : Array.isArray(listed.body?.data) ? listed.body.data : []
    ensure(chatflows.filter(item => item?.id === input.flowId).length === 1, 'I10_ISOLATED_IMPORT_FLOW_READBACK_MISSING')

    const exported = await request(`${baseUrl}${publication.exportPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ agentflowv2: true })
    })
    ensure(exported.response.ok, `I10_ISOLATED_IMPORT_EXPORT_READBACK_FAILED:${exported.response.status}`)
    const output = validateExportPackage(minimalExportPackage(exported.body, publication), { publication })
    ensure(output.flowDataHash === input.flowDataHash, 'I10_ISOLATED_IMPORT_FLOW_HASH_READBACK_MISMATCH')
    ensure(output.chatbotConfigHash === input.chatbotConfigHash, 'I10_ISOLATED_IMPORT_CHATBOT_CONFIG_HASH_READBACK_MISMATCH')
    stopped = await stopOwned(child)
    ensure(stopped, 'I10_ISOLATED_IMPORT_PROCESS_STOP_FAILED')
    return {
      status: 'I10_FLOWISE_EXPORT_IMPORT_ISOLATED_PASSED',
      flowId: input.flowId,
      flowVersion: input.flowVersion,
      targetBaseUrl: baseUrl,
      targetDataRoot: dataRoot,
      flowiseAppRoot: installation.appRoot,
      inputFlowDataHash: input.flowDataHash,
      outputFlowDataHash: output.flowDataHash,
      inputChatbotConfigHash: input.chatbotConfigHash,
      outputChatbotConfigHash: output.chatbotConfigHash,
      processStopped: stopped,
      allowedNodeNames: enabledNodeNames,
      disabledNodeCount: spawned.runtimePolicy.disabledNodeNames.length,
      source: 'ISOLATED_FLOWISE_IMPORT_AND_EXPORT_READBACK'
    }
  } finally {
    if (child && !stopped) {
      stopped = await stopOwned(child)
      if (!stopped && !process.exitCode) process.exitCode = 2
    }
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  try {
    const command = process.argv[2]
    if (!['reimport-isolated', 'smoke-isolated'].includes(command)) throw new Error('USAGE: i10-flowise-export-import-isolated.cjs <reimport-isolated|smoke-isolated> [--package <path>] [--data-root <safe-temp-parent>] [--flowise-app-root <isolated-app>] [--port <free-port>]')
    const result = command === 'reimport-isolated'
      ? await reimportIsolated(argument('--package'), argument('--data-root'), argument('--port'), argument('--flowise-app-root'))
      : await smokeIsolated(argument('--data-root'), argument('--port'), argument('--flowise-app-root'))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.code || error.message}\n`)
    process.exitCode = 2
  }
}

if (require.main === module) main()

module.exports = { allowedDataRoot, findPort, flowiseInstallation, reimportIsolated, smokeIsolated, spawnFlowise }
