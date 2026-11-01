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
const RELEASE = 'b'.repeat(64)
const CREDENTIAL = 'credential_12345678-1234-1234-1234-123456789abc'

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('PROCESS_EXITED_BEFORE_READY')
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('PROCESS_HEALTH_TIMEOUT')
}

test('real MCP and Fresh Harness accept only exact approve/reject tuples and never start execution', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hengzhun-rf044-'))
  const harnessPort = await freePort()
  const mcpPort = await freePort()
  const node20 = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
  const token = 's'.repeat(32)
  const namespace = 'rf044-approval'
  const harness = spawn(node20, ['agent-cli/test/harness-session-fixture.cjs'], {
    cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PORT: String(harnessPort), HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_NAMESPACE: namespace,
      HENGZHUN_RELEASE_IDENTITY_HASH: RELEASE, RF043_CREDENTIAL_REF: CREDENTIAL,
      RF041_DATABASE_PATH: path.join(root, 'harness.sqlite'), RF041_BACKUP_ROOT: path.join(root, 'backups'), RF041_ARTIFACT_ROOT: path.join(root, 'artifacts'),
    },
  })
  const mcp = spawn(node20, ['mcp/src/server.cjs'], {
    cwd: productRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, HENGZHUN_MCP_HOST: '127.0.0.1', HENGZHUN_MCP_PORT: String(mcpPort), HENGZHUN_MCP_TOKEN: token,
      HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_HARNESS_URL: `http://127.0.0.1:${harnessPort}`, HENGZHUN_NAMESPACE: namespace,
    },
  })
  let client
  t.after(async () => {
    await client?.close().catch(() => undefined)
    if (mcp.exitCode === null) mcp.kill()
    if (harness.exitCode === null) harness.kill()
    await Promise.all([mcp.exitCode === null ? new Promise((resolve) => mcp.once('exit', resolve)) : undefined,
      harness.exitCode === null ? new Promise((resolve) => harness.once('exit', resolve)) : undefined])
    await rm(root, { recursive: true, force: true })
  })
  await waitForHealth(`http://127.0.0.1:${harnessPort}/health`, harness)
  await waitForHealth(`http://127.0.0.1:${mcpPort}/health`, mcp)
  client = await connectMcpRuntime({ url: `http://127.0.0.1:${mcpPort}/mcp`, token })
  const calls = []
  const trackedClient = { callTool(request, options) { calls.push(request.name); return client.callTool(request, options) } }
  const store = await new EncryptedSessionStore({ root: path.join(root, 'sessions') }).initialize()
  const service = createProductionService({
    sessionStore: store, releaseIdentityHash: RELEASE, mcpClient: trackedClient, namespace, writeGate: async () => undefined,
    modelConfig: { apiKey: 'offline-not-secret', baseURL: 'http://model.invalid/v1', model: 'offline-model' },
    modelFactory: () => ({ withConfig: () => ({ async invoke() { return { content: JSON.stringify({
      title: '账户查询', objective: '验证账户查询。', summary: '登录并读取账户。', preconditions: ['客户已创建'],
      steps: [{ action: '登录并查看账户', expected: '账户可见' }], assertions: ['余额可见'], confidence: 0.95,
    }) } } }) }),
  })
  async function candidate() {
    const session = await service.sessionStart({})
    return service.journeyAuthor({ sessionId: session.sessionId, goal: '登录并检查账户', entryUrl: 'http://127.0.0.1:18081/login', targetSystem: '复兴银行客户门户', credentialRef: CREDENTIAL })
  }
  const approvedCandidate = await candidate()
  const writesBeforeDrift = calls.filter((name) => name === 'journey_decision_submit').length
  for (const drift of [
    { revision: approvedCandidate.revision + 1 },
    { proposalId: `proposal_${'e'.repeat(32)}` },
    { contentHash: 'f'.repeat(64) },
  ]) {
    await assert.rejects(service.journeyDecision({
      sessionId: approvedCandidate.sessionId, journeyId: approvedCandidate.journeyId,
      revision: approvedCandidate.revision, proposalId: approvedCandidate.proposalId,
      contentHash: approvedCandidate.contentHash, approved: true, ...drift,
    }), (error) => error.code === 'JOURNEY_APPROVAL_TUPLE_STALE')
  }
  assert.equal(calls.filter((name) => name === 'journey_decision_submit').length, writesBeforeDrift)
  const approved = await service.journeyDecision({
    sessionId: approvedCandidate.sessionId, journeyId: approvedCandidate.journeyId, revision: approvedCandidate.revision,
    proposalId: approvedCandidate.proposalId, contentHash: approvedCandidate.contentHash, approved: true,
  })
  assert.equal(approved.decision, 'APPROVED')
  assert.equal(approved.stage, 'PROCESSING_AUTHORING')

  const rejectedCandidate = await candidate()
  const rejected = await service.journeyDecision({
    sessionId: rejectedCandidate.sessionId, journeyId: rejectedCandidate.journeyId, revision: rejectedCandidate.revision,
    proposalId: rejectedCandidate.proposalId, contentHash: rejectedCandidate.contentHash, approved: false,
  })
  assert.equal(rejected.decision, 'REJECTED')
  assert.equal(rejected.stage, 'NEEDS_INPUT')
  assert.equal(calls.filter((name) => name === 'journey_decision_submit').length, 2)
  for (const forbidden of ['case_prepare', 'run_submit', 'authoring_submit']) assert.equal(calls.includes(forbidden), false)
})
