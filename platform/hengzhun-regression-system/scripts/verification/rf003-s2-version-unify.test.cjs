'use strict'

// RF-003-S2: version unification tests.
// 1. Static: server.cjs derives both SDK registration and /health version
//    from the runtime contract contractVersion; startup fails closed.
// 2. Isolated runtime: the real MCP /health reports version == contract
//    version and a tool call still works (behavior unchanged).

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const nodeExecutable = process.execPath
const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const runtimeContract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/mcp/hengzhun-i8.json'), 'utf8'))
const ISO = path.join(root, '.data', 'tests', 'rf003-s2')
const HARNESS_PORT = 28807
const MCP_PORT = 28809

function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(url, { timeout: 1000 }, response => {
        response.resume()
        if (response.statusCode === 200) return resolve()
        retry()
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`health timeout: ${url}`))
      setTimeout(tick, 300)
    }
    tick()
  })
}

test('RF-003-S2 static: version derives from the contract with fail-closed startup', () => {
  assert.match(serverSource, /const runtimeContractVersion = /, 'runtimeContractVersion must be defined')
  assert.ok(serverSource.includes("contracts/mcp/hengzhun-i8.json"), 'version must read the runtime contract file')
  assert.match(serverSource, /HENGZHUN_CONTRACT_VERSION_INVALID/, 'startup must fail closed on missing/malformed version')
  assert.match(serverSource, /version: runtimeContractVersion/, 'SDK registration must use runtimeContractVersion')
  assert.match(serverSource, /version: runtimeContractVersion/, 'health endpoint must use runtimeContractVersion')
  assert.doesNotMatch(serverSource, /version: '8\\.0\\.0'/, 'no legacy SDK version literal')
  assert.doesNotMatch(serverSource, /version: '10\\.0\\.0'/, 'no legacy health version literal')
  assert.equal(runtimeContract.contractVersion, '10.4.0')
})

test('RF-003-S2 isolated runtime: /health version matches the contract, tools still work', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const token = crypto.randomBytes(32).toString('hex')
  const harness = spawn(nodeExecutable, ['dist/harness/src/index.js'], { cwd: root, env: { ...process.env, HENGZHUN_PRODUCT_ROOT: root, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_WORKER_TOKEN: token, HENGZHUN_DATABASE_PATH: path.join(ISO, 'state.sqlite'), HOST: '127.0.0.1', PORT: String(HARNESS_PORT), HENGZHUN_ALLOWED_CLIENTS: '127.0.0.1,::1' }, stdio: 'ignore' })
  const mcp = spawn(nodeExecutable, ['mcp/src/server.cjs'], { cwd: root, env: { ...process.env, HENGZHUN_MCP_PORT: String(MCP_PORT), HENGZHUN_HARNESS_URL: `http://127.0.0.1:${HARNESS_PORT}`, FLOWISE_APP_PATH: path.join(root, 'flowise', 'app'), HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await waitForHealth(`http://127.0.0.1:${HARNESS_PORT}/health`, 30_000)
    await waitForHealth(`http://127.0.0.1:${MCP_PORT}/health`, 30_000)
    const health = await (await fetch(`http://127.0.0.1:${MCP_PORT}/health`)).json()
    assert.equal(health.version, runtimeContract.contractVersion, '/health must report the unified contract version')
    assert.equal(health.status, 'ok')
    // tool surface still works: unknown task returns the canonical envelope
    const r = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 's2', method: 'tools/call', params: { name: 'task_get', arguments: { taskId: 'task_nonexistent_0001' } } }) })
    const raw = await r.text()
    const dataLine = raw.split('\n').find(l => l.startsWith('data:'))
    const body = JSON.parse(dataLine.slice(5).trim())
    const text = JSON.parse(body.result.content[0].text)
    assert.ok(text.errorCode, 'tool call must still return the canonical envelope')
    assert.ok('retryable' in text, 'canonical envelope fields must be present')
  } finally {
    mcp.kill()
    harness.kill()
    setTimeout(() => { try { fs.rmSync(ISO, { recursive: true, force: true }) } catch { /* best effort */ } }, 1200)
  }
})
