'use strict'

// RF-005-S2: case_prepare single-route implementation (R1/R2/R3 + DP-R5-1).
// 1. Adapter unit: draftJson error code renamed to I10_CASE_DRAFT_INVALID;
//    legacy i8 codes gone.
// 2. Static: server.cjs has no i8 route and no retired inputs.
// 3. Isolated runtime: case_prepare with an i10 draft flows through the i10
//    endpoint without MCP-level failures.

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const nodeExecutable = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
const adapter = require(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'))
const serverSource = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')
const adapterSource = fs.readFileSync(path.join(root, 'mcp/src/rf001-contract-adapter.cjs'), 'utf8')
const ISO = path.join(root, '.data', 'tests', 'rf005-s2')
const HARNESS_PORT = 28827
const MCP_PORT = 28829

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

test('adapter: draft JSON error code renamed (DP-R5-1), legacy i8 codes gone', () => {
  const draft = { schemaVersion: 'hengzhun-i10-case-draft-v1', title: 'T', steps: [{ action: 'a', expected: 'b' }] }
  assert.deepEqual(adapter.normalizeCasePrepareRequest({ caseDescription: 'd', draftJson: draft, credentialRef: '' }).draft, draft)
  assert.throws(() => adapter.normalizeCasePrepareRequest({ caseDescription: 'd', draftJson: 'not-json', credentialRef: '' }), error => error.code === 'I10_CASE_DRAFT_INVALID')
  assert.ok(!adapterSource.includes('I8_DRAFT_JSON_INVALID'), 'legacy draft code must be gone')
  assert.ok(!adapterSource.includes('I8_ACCEPTANCE_JSON_INVALID'), 'legacy acceptance code must be gone')
  assert.equal(adapter.normalizeCaseAcceptanceSummary, undefined, 'acceptance summary normalizer must be retired')
})

test('static: single i10 route, retired inputs and codes absent', () => {
  const block = serverSource.slice(serverSource.indexOf("registerTool('case_prepare'"), serverSource.indexOf("registerTool('authoring_submit'"))
  assert.ok(block.includes("callHarness('/v1/i10/cases:prepare'"), 'i10 endpoint must be the only route')
  assert.ok(!block.includes('/v1/i8/cases:prepare'), 'i8 endpoint must not be called')
  assert.ok(!block.includes('draftArray'), 'draftArray must be retired')
  assert.ok(!block.includes('acceptanceSummaryJson'), 'acceptanceSummaryJson must be retired')
  assert.ok(!block.includes('multimodalContextJson'), 'multimodalContextJson must be retired')
  assert.ok(block.includes('normalizeI10NaturalDraft(draft, caseDescription, sessionRef, normalizedCredentialRef)'), 'all drafts must flow through the i10 normalizer')
  assert.ok(!serverSource.includes('normalizeCaseAcceptanceSummary'), 'acceptance summary wiring must be gone')
})

test('isolated runtime: case_prepare with an i10 draft reaches the i10 endpoint', async () => {
  fs.rmSync(ISO, { recursive: true, force: true })
  fs.mkdirSync(ISO, { recursive: true })
  const token = crypto.randomBytes(32).toString('hex')
  const harness = spawn(nodeExecutable, ['dist/harness/src/index.js'], { cwd: root, env: { ...process.env, HENGZHUN_PRODUCT_ROOT: root, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_WORKER_TOKEN: token, HENGZHUN_DATABASE_PATH: path.join(ISO, 'state.sqlite'), HOST: '127.0.0.1', PORT: String(HARNESS_PORT), HENGZHUN_ALLOWED_CLIENTS: '127.0.0.1,::1' }, stdio: 'ignore' })
  const mcp = spawn(nodeExecutable, ['mcp/src/server.cjs'], { cwd: root, env: { ...process.env, HENGZHUN_MCP_PORT: String(MCP_PORT), HENGZHUN_HARNESS_URL: `http://127.0.0.1:${HARNESS_PORT}`, FLOWISE_APP_PATH: path.join(root, 'flowise', 'app'), HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: token, HENGZHUN_NAMESPACE: 'ns1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await waitForHealth(`http://127.0.0.1:${HARNESS_PORT}/health`, 30_000)
    await waitForHealth(`http://127.0.0.1:${MCP_PORT}/health`, 30_000)
    const draftJson = JSON.stringify({
      schemaVersion: 'hengzhun-i10-case-draft-v1',
      title: 'T', objective: 'O', summary: 'S', targetSystem: '复兴银行',
      entryUrl: 'https://bank.example.com/portal/login',
      preconditions: ['P'], steps: [{ action: '登录', expected: '成功' }], assertions: ['A'],
      credentialRef: '', missingFields: ['credentialRef']
    })
    const r = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 's2', method: 'tools/call', params: { name: 'case_prepare', arguments: { caseDescription: '登录复兴银行', draftJson, sessionRef: 'sess-s2' } } }) })
    const raw = await r.text()
    const dataLine = raw.split('\n').find(l => l.startsWith('data:'))
    const body = JSON.parse(dataLine.slice(5).trim())
    const text = body.result.content[0].text
    assert.ok(!text.includes('MCP error'), 'case_prepare must not fail at the MCP transport layer')
    const parsed = JSON.parse(text)
    assert.ok(parsed.caseId || parsed.preparationId || parsed.missingFields || parsed.errorCode, 'the i10 endpoint must return a business response (case/preparation/gaps/domain error)')
  } finally {
    mcp.kill()
    harness.kill()
    setTimeout(() => { try { fs.rmSync(ISO, { recursive: true, force: true }) } catch { /* best effort */ } }, 1200)
  }
})
