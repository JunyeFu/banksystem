import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const CHECK_ORDER = Object.freeze(['model', 'vision', 'harness', 'mcp', 'worker', 'browser', 'bank'])
const execute = promisify(execFile)

export async function probeVisualModel({ root, environment, signal } = {}) {
  try {
    const value = await execute(path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe'),
      [path.join(root, 'worker/src/i10-vision-readiness.cjs')], { cwd: root, env: environment, signal, timeout: 90_000, maxBuffer: 8192, windowsHide: true })
    const result = JSON.parse(value.stdout)
    return result.status === 'READY' && result.code === 'I10_VISION_READY' ? result : modelFailure('I10_VISION_RESPONSE_INVALID')
  } catch (error) {
    if (signal?.aborted) return modelFailure('AGENT_READINESS_CANCELLED')
    if (error.killed) return modelFailure('I10_VISION_TIMEOUT')
    let code
    try { code = JSON.parse(error.stdout).code } catch { /* No valid subprocess receipt. */ }
    return modelFailure(/^I10_(?:VISION|MIDSCENE)_[A-Z0-9_]{1,80}$/.test(code || '') ? code : 'I10_VISION_PROBE_FAILED')
  }
}

function notReady(checks, name, code) {
  checks.push(Object.freeze({ name, status: 'FAILED', code }))
  return Object.freeze({ status: 'NOT_READY', failedCheck: name, code, checks: Object.freeze(checks) })
}

async function requestJson(fetchFn, url, options, code) {
  const timeout = AbortSignal.timeout(10_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  try {
    signal.throwIfAborted()
    const response = await fetchFn(url, { ...options, signal })
    if (!response?.ok) return { error: code }
    return { value: await response.json() }
  } catch {
    if (options.signal?.aborted) return { error: 'AGENT_READINESS_CANCELLED' }
    if (timeout.aborted) return { error: `${code}_TIMEOUT` }
    return { error: code }
  }
}

function modelFailure(code, binding = {}) {
  return Object.freeze({ status: 'NOT_READY', code, ...binding })
}

export async function probeConfiguredModel({ environment, fetchFn = globalThis.fetch, signal, timeoutMs = 90_000 } = {}) {
  const env = environment || process.env
  const modelName = String(env.HENGZHUN_MODEL_NAME || '').trim()
  const configuredBaseUrl = String(env.HENGZHUN_MODEL_BASE_URL || '').trim()
  const apiKey = String(env.HENGZHUN_MODEL_API_KEY || '').trim()
  if (!modelName || !configuredBaseUrl || !apiKey) return modelFailure('MODEL_CONFIGURATION_REQUIRED')

  let parsedBase
  try { parsedBase = new URL(configuredBaseUrl) } catch { return modelFailure('MODEL_BASE_URL_INVALID') }
  if (!['http:', 'https:'].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    return modelFailure('MODEL_BASE_URL_INVALID')
  }
  const normalizedBaseUrl = parsedBase.toString().replace(/\/+$/, '')
  const binding = Object.freeze({
    modelName,
    baseUrlHash: createHash('sha256').update(normalizedBaseUrl).digest('hex'),
    providerProtocol: 'OPENAI_COMPATIBLE',
    endpointKind: 'CHAT_COMPLETIONS',
  })

  const timeout = AbortSignal.timeout(timeoutMs)
  const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout
  const interrupted = () => signal?.aborted ? 'AGENT_READINESS_CANCELLED' : timeout.aborted ? 'MODEL_TIMEOUT' : null
  let response
  try {
    bounded.throwIfAborted()
    response = await fetchFn(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST', signal: bounded,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelName, temperature: 0, max_tokens: 8, stream: false,
        messages: [{ role: 'user', content: 'Reply READY.' }],
      }),
    })
  } catch {
    return modelFailure(interrupted() || 'MODEL_TRANSPORT_FAILED', binding)
  }
  if (!response?.ok) {
    const suffix = Number.isInteger(response?.status) ? `_${response.status}` : '_FAILED'
    return modelFailure(`MODEL_HTTP${suffix}`, binding)
  }
  let value
  try { value = await response.json() } catch { return modelFailure(interrupted() || 'MODEL_RESPONSE_JSON_INVALID', binding) }
  if (interrupted()) return modelFailure(interrupted(), binding)
  if (!Array.isArray(value?.choices) || value.choices.length === 0) return modelFailure('MODEL_RESPONSE_INVALID', binding)
  return Object.freeze({ status: 'READY', ...binding })
}

export async function probeProductReadiness({
  root,
  environment,
  fetchFn = globalThis.fetch,
  exists = fs.existsSync,
  signal,
  visionProbe = probeVisualModel,
} = {}) {
  const env = environment || process.env
  const checks = []
  const model = await probeConfiguredModel({ environment: env, fetchFn, signal })
  if (model.status !== 'READY') return notReady(checks, 'model', model.code)
  const { status: modelStatus, ...modelBinding } = model
  checks.push(Object.freeze({ name: 'model', status: modelStatus, ...modelBinding }))
  const vision = await visionProbe({ root, environment: env, signal })
  if (vision.status !== 'READY') return notReady(checks, 'vision', vision.code)
  checks.push(Object.freeze({ name: 'vision', status: 'READY' }))

  const harnessUrl = String(env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '')
  const harness = await requestJson(fetchFn, `${harnessUrl}/health`, { signal }, 'HARNESS_NOT_READY')
  const quickCheck = Array.isArray(harness.value?.database?.quickCheck) ? harness.value.database.quickCheck.join(',') : harness.value?.database?.quickCheck
  if (harness.error || harness.value?.runtime?.migrationsReady !== true || quickCheck !== 'ok') return notReady(checks, 'harness', harness.error || 'HARNESS_STATE_INVALID')
  checks.push(Object.freeze({ name: 'harness', status: 'READY' }))

  const mcpEndpoint = String(env.HENGZHUN_MCP_URL || 'http://127.0.0.1:18789/mcp')
  const mcp = await requestJson(fetchFn, new URL('/health', mcpEndpoint), { signal }, 'MCP_NOT_READY')
  if (mcp.error || typeof mcp.value?.version !== 'string') return notReady(checks, 'mcp', mcp.error || 'MCP_RESPONSE_INVALID')
  checks.push(Object.freeze({ name: 'mcp', status: 'READY' }))

  if (harness.value?.worker?.codeSetReady !== true) return notReady(checks, 'worker', 'WORKER_NOT_READY')
  checks.push(Object.freeze({ name: 'worker', status: 'READY' }))

  let browserPath
  try {
    const freeze = JSON.parse(fs.readFileSync(path.join(root, 'config', 'demo-runtime-freeze.json'), 'utf8'))
    browserPath = path.join(root, 'runtime', freeze.chromium.executable)
  } catch { return notReady(checks, 'browser', 'BROWSER_RUNTIME_CONTRACT_INVALID') }
  if (!exists(browserPath)) return notReady(checks, 'browser', 'BROWSER_NOT_READY')
  checks.push(Object.freeze({ name: 'browser', status: 'READY' }))

  const bankUrl = String(env.HENGZHUN_BANK_BASE_URL || 'http://127.0.0.1:18443').replace(/\/$/, '')
  const bank = await requestJson(fetchFn, `${bankUrl}/health`, { signal }, 'BANK_NOT_READY')
  if (bank.error) return notReady(checks, 'bank', bank.error)
  checks.push(Object.freeze({ name: 'bank', status: 'READY' }))
  return Object.freeze({ status: 'READY', checkOrder: CHECK_ORDER, checks: Object.freeze(checks) })
}

export { CHECK_ORDER }
