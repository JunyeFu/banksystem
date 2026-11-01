import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { EncryptedSessionStore } from '../../controller/src/session-store.mjs'
import { connectMcpRuntime } from '../../controller/src/runtime-adapters.mjs'
import { createProductionService } from '../src/production-service.mjs'

const productRoot = path.resolve(import.meta.dirname, '..', '..')
const releaseIdentityHash = '9'.repeat(64)
const namespace = 'rf041-session'
const token = 's'.repeat(32)

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  return address.port
}

async function waitForHealth(url, process) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error('MCP_EXITED_BEFORE_READY')
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('MCP_HEALTH_TIMEOUT')
}

test('real MCP and Fresh Harness preserve CLI session authority across process reconstruction', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-rf041-'))
  const harnessPort = await freePort()
  const mcpPort = await freePort()
  const node20 = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
  const harness = spawn(node20, ['agent-cli/test/harness-session-fixture.cjs'], {
    cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, PORT: String(harnessPort), HENGZHUN_SERVICE_TOKEN: token,
      HENGZHUN_NAMESPACE: namespace, HENGZHUN_RELEASE_IDENTITY_HASH: releaseIdentityHash,
      RF041_DATABASE_PATH: path.join(root, 'harness.sqlite'), RF041_BACKUP_ROOT: path.join(root, 'backups'),
      RF041_ARTIFACT_ROOT: path.join(root, 'artifacts'),
    },
  })
  let harnessError = ''
  harness.stderr.on('data', (chunk) => { harnessError += chunk.toString().slice(0, 4000) })
  await waitForHealth(`http://127.0.0.1:${harnessPort}/health`, harness)
  const mcp = spawn(node20, ['mcp/src/server.cjs'], {
    cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HENGZHUN_MCP_HOST: '127.0.0.1', HENGZHUN_MCP_PORT: String(mcpPort),
      HENGZHUN_MCP_TOKEN: token, HENGZHUN_SERVICE_TOKEN: token,
      HENGZHUN_HARNESS_URL: `http://127.0.0.1:${harnessPort}`, HENGZHUN_NAMESPACE: namespace,
    },
  })
  let mcpError = ''
  mcp.stderr.on('data', (chunk) => { mcpError += chunk.toString().slice(0, 4000) })
  let client
  t.after(async () => {
    await client?.close().catch(() => undefined)
    if (mcp.exitCode === null) mcp.kill()
    if (harness.exitCode === null) harness.kill()
    await Promise.all([
      mcp.exitCode === null ? new Promise((resolve) => mcp.once('exit', resolve)) : undefined,
      harness.exitCode === null ? new Promise((resolve) => harness.once('exit', resolve)) : undefined,
    ])
    await rm(root, { recursive: true, force: true })
  })
  await waitForHealth(`http://127.0.0.1:${mcpPort}/health`, mcp)
  client = await connectMcpRuntime({ url: `http://127.0.0.1:${mcpPort}/mcp`, token })
  const credentialToolResult = await client.callTool({
    name: 'credential_session_create',
    arguments: { label: 'Fresh Harness integration credential', sessionRef: 'session-integration-credential' },
  })
  assert.notEqual(credentialToolResult.isError, true)
  const credentialSession = JSON.parse(credentialToolResult.content.find((item) => item.type === 'text').text)
  const captureUrl = new URL(credentialSession.captureUrl)
  const captureToken = new URLSearchParams(captureUrl.hash.slice(1)).get('token')
  const credentialSessionId = captureUrl.pathname.split('/').at(-2)
  const storedCredentialResponse = await fetch(`http://127.0.0.1:${harnessPort}/v1/i10/credentials/${credentialSessionId}:store`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ captureToken, username: 'synthetic-user', password: 'synthetic-password' }),
  })
  assert.equal(storedCredentialResponse.ok, true)
  const storedCredential = await storedCredentialResponse.json()
  assert.match(storedCredential.credentialRef, /^credential_[0-9a-f-]{36}$/)
  const sessionRoot = path.join(root, 'sessions')
  const firstStore = await new EncryptedSessionStore({ root: sessionRoot }).initialize()
  const options = {
    releaseIdentityHash, modelConfig: { apiKey: 'unused-test-key', baseURL: 'http://model.invalid/v1', model: 'unused' },
    modelFactory: () => ({ withConfig: () => ({ async invoke() { return { content: JSON.stringify({
      title: '合成只读登录检查', objective: '登录后检查客户姓名。', summary: '只读登录检查。',
      preconditions: ['安全凭据已登记'],
      steps: [{ action: '使用已登记安全凭据登录', expected: '客户主页成功显示' }],
      assertions: ['客户姓名非空'], confidence: 0.95,
    }) } } }) }),
    mcpClient: client, namespace, writeGate: async () => undefined,
  }
  let created
  try { created = await createProductionService({ ...options, sessionStore: firstStore }).sessionStart({}) }
  catch (error) { throw new Error(`SESSION_START_FAILED:${error?.code || 'UNKNOWN'}:MCP=${mcpError.trim()}:HARNESS=${harnessError.trim()}`) }
  assert.match(created.sessionId, /^session-/)
  assert.match(created.journeyId, /^journey_/)

  const secondStore = await new EncryptedSessionStore({ root: sessionRoot }).initialize()
  const restarted = createProductionService({ ...options, sessionStore: secondStore })
  const status = await restarted.sessionStatus({ sessionId: created.sessionId })
  const resumed = await restarted.sessionResume({ sessionId: created.sessionId })
  assert.equal(status.journeyId, created.journeyId)
  assert.equal(status.status, created.status)
  assert.equal(resumed.resumed, true)
  assert.equal(resumed.journeyId, created.journeyId)

  const pending = await restarted.start({
    input: `目标系统：复兴银行客户门户。入口：http://127.0.0.1:18082/portal/login 。使用 ${storedCredential.credentialRef} 登录并核对姓名。`,
    attachmentRefs: [], noSession: false,
  })
  assert.equal(pending.status, 'AWAITING_USER')
  const bootstrapped = await restarted.resume({ sessionId: pending.sessionId, proposalId: pending.approval.proposalId, approved: true })
  assert.notEqual(bootstrapped.journeyId, pending.journeyId)
  assert.equal(bootstrapped.status, 'AWAITING_USER')
  assert.match(bootstrapped.approval.proposalId, /^proposal_/)
  const bootstrapStatus = await restarted.sessionStatus({ sessionId: pending.sessionId })
  assert.equal(bootstrapStatus.journeyId, bootstrapped.journeyId)
  assert.equal(bootstrapStatus.status, 'AWAITING_USER')
})
