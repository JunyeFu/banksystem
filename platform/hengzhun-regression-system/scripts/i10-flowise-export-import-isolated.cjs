#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const childProcess = require('node:child_process')
const { configuration: platformAdminConfiguration, ensureLive } = require('./platform-admin.cjs')
const { preflight, validateExportPackage } = require('./i10-flowise-export-package.cjs')

const root = path.resolve(__dirname, '..')
const nodeExecutable = path.join(root, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
const flowiseEntrypoint = path.join(root, 'flowise', 'app', 'node_modules', 'flowise', 'bin', 'run')
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

function allowedDataRoot(value) {
  ensure(typeof value === 'string' && value.trim(), 'I10_ISOLATED_IMPORT_DATA_ROOT_REQUIRED')
  const resolved = path.resolve(value)
  const tempRoot = path.resolve('C:\\tmp')
  const testRoot = path.resolve(root, '.data', 'tests')
  const allowed = [tempRoot, testRoot].some(parent => resolved.startsWith(`${parent}${path.sep}`))
  ensure(allowed, 'I10_ISOLATED_IMPORT_DATA_ROOT_OUTSIDE_ALLOWED_ROOT')
  ensure(resolved !== path.resolve(root, '.data', 'flowise'), 'I10_ISOLATED_IMPORT_FORMAL_DATA_ROOT_FORBIDDEN')
  ensure(!fs.existsSync(resolved), 'I10_ISOLATED_IMPORT_DATA_ROOT_ALREADY_EXISTS')
  return resolved
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

function spawnFlowise(dataRoot, port) {
  ensure(fs.existsSync(nodeExecutable), 'I10_ISOLATED_IMPORT_NODE_MISSING')
  ensure(fs.existsSync(flowiseEntrypoint), 'I10_ISOLATED_IMPORT_FLOWISE_MISSING')
  const flowiseData = path.join(dataRoot, 'flowise')
  for (const relative of ['secrets', 'storage', 'logs']) fs.mkdirSync(path.join(flowiseData, relative), { recursive: true })
  const stdoutPath = path.join(dataRoot, 'flowise.stdout.log')
  const stderrPath = path.join(dataRoot, 'flowise.stderr.log')
  const stdout = fs.openSync(stdoutPath, 'a')
  const stderr = fs.openSync(stderrPath, 'a')
  const environment = {
    ...process.env,
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
  const child = childProcess.spawn(nodeExecutable, [flowiseEntrypoint, 'start'], {
    cwd: root,
    env: environment,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr]
  })
  fs.closeSync(stdout)
  fs.closeSync(stderr)
  return child
}

async function waitForFlowise(child, baseUrl) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail('I10_ISOLATED_IMPORT_FLOWISE_EXITED_DURING_STARTUP')
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
  const sent = child.kill()
  if (!sent && child.exitCode === null) return true
  const deadline = Date.now() + 10_000
  while (child.exitCode === null && Date.now() < deadline) await sleep(200)
  if (child.exitCode === null) {
    const killed = child.kill('SIGKILL')
    if (!killed && child.exitCode === null) return true
    const killDeadline = Date.now() + 2_000
    while (child.exitCode === null && Date.now() < killDeadline) await sleep(100)
  }
  return child.exitCode !== null
}

async function reimportIsolated(packagePath, dataRootValue, requestedPort) {
  const input = preflight(packagePath)
  const packageValue = readJson(input.packagePath)
  const dataRoot = allowedDataRoot(dataRootValue)
  const port = requestedPort ? Number(requestedPort) : await findPort()
  ensure(Number.isInteger(port) && port >= 1024 && port <= 65535, 'I10_ISOLATED_IMPORT_PORT_INVALID')
  ensure(await portAvailable(port), 'I10_ISOLATED_IMPORT_PORT_NOT_AVAILABLE')

  const baseUrl = `http://127.0.0.1:${port}`
  let child = null
  let stopped = false
  try {
    child = spawnFlowise(dataRoot, port)
    await waitForFlowise(child, baseUrl)
    const databasePath = path.join(dataRoot, 'flowise', 'database.sqlite')
    await ensureLive({ baseUrl, databasePath })
    const auth = await authorization(baseUrl)
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
    const output = validateExportPackage(exported.body, { publication })
    ensure(output.flowDataHash === input.flowDataHash, 'I10_ISOLATED_IMPORT_FLOW_HASH_READBACK_MISMATCH')
    ensure(output.chatbotConfigHash === input.chatbotConfigHash, 'I10_ISOLATED_IMPORT_CHATBOT_CONFIG_HASH_READBACK_MISMATCH')
    stopped = await stopOwned(child)
    return {
      status: 'I10_FLOWISE_EXPORT_IMPORT_ISOLATED_PASSED',
      flowId: input.flowId,
      flowVersion: input.flowVersion,
      targetBaseUrl: baseUrl,
      targetDataRoot: dataRoot,
      inputFlowDataHash: input.flowDataHash,
      outputFlowDataHash: output.flowDataHash,
      inputChatbotConfigHash: input.chatbotConfigHash,
      outputChatbotConfigHash: output.chatbotConfigHash,
      processStopped: stopped,
      source: 'ISOLATED_FLOWISE_IMPORT_AND_EXPORT_READBACK'
    }
  } finally {
    if (child && !stopped) await stopOwned(child)
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  try {
    if (process.argv[2] !== 'reimport-isolated') throw new Error('USAGE: i10-flowise-export-import-isolated.cjs reimport-isolated --package <path> --data-root <new-path> [--port <free-port>]')
    const result = await reimportIsolated(argument('--package'), argument('--data-root'), argument('--port'))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.code || error.message}\n`)
    process.exitCode = 2
  }
}

if (require.main === module) main()

module.exports = { allowedDataRoot, findPort, reimportIsolated }
