import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { probeProductReadiness, probeConfiguredModel } from '../src/product-doctor.mjs'
import { probeWorkbenchReadiness } from '../src/workbench-production.mjs'
const lifecycle = createRequire(import.meta.url)('../../scripts/i10-agent-lifecycle.cjs')
const root = fileURLToPath(new URL('../../', import.meta.url))
const env = { HENGZHUN_MODEL_NAME: 'test', HENGZHUN_MODEL_BASE_URL: 'https://model.invalid/v1', HENGZHUN_MODEL_API_KEY: 'synthetic-only' }
const identity = { identityHash: 'd'.repeat(64) }
const services = ['harness', 'mcp', 'worker'].map(name => ({ name, pid: 1, owned: true }))
const deps = () => ({ authorize: () => identity, inspect: async () => ({ services }), workerHealth: () => true })

test('owned but unhealthy is NOT_READY rather than a stopped process; wrong ownership stays blocked', async () => {
  const current = createRequire(import.meta.url)('../../scripts/i10-release-identity-v4.cjs').currentReleaseIdentityV4({ productRoot: root })
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'agent-cli/managed-process-spec-v1.json')))
  const records = spec.services.map((component, index) => lifecycle.serviceRecord(root, component, 1000 + index, current))
  const observation = { readState: () => ({ services: records }), health: async () => false,
    processInfo: async pid => {
      const component = spec.services[pid - 1000], executablePath = path.resolve(root, component.executable)
      return { executablePath, commandLine: `"${executablePath}" "${path.resolve(root, component.entrypoint)}"` }
    } }
  const status = await lifecycle.managedStatus({ root, identity: current, deps: observation })
  assert.equal(status.status, 'NOT_READY'); assert.equal(status.healthy, false); assert.ok(status.services.every(service => service.owned))
  const wrong = await lifecycle.inspectManagedOwnership({ root, identity: { ...current, identityHash: 'f'.repeat(64) }, deps: observation })
  assert.equal(wrong.owned, false)
  const absent = await lifecycle.managedStatus({ root, identity: current, deps: { ...observation, processInfo: () => null } })
  assert.equal(absent.status, 'NOT_RUNNING')
})

test('worker heartbeat requires the owned PID and a fresh healthy record', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rf068-health-test-'))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const file = lifecycle.statePaths(temporary).workerHealthFile
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const record = { name: 'worker', pid: 123 }
  for (const [change, expected] of [[{}, true], [{ pid: 124 }, false], [{ status: 'FAILED' }, false], [{ updatedAt: new Date(Date.now() - 16000).toISOString() }, false]]) {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 'hengzhun-worker-health-v2', pid: 123, status: 'HEALTHY', updatedAt: new Date().toISOString(), ...change }))
    assert.equal(lifecycle.workerHealth(temporary, record), expected)
  }
})

test('healthy HTTP at 1800ms is accepted; missing endpoint, deadline and cancellation fail', async t => {
  const server = http.createServer((_req, res) => setTimeout(() => res.end('{}'), 1800))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}`
  assert.equal(await lifecycle.httpOk(url), true)
  assert.equal(await lifecycle.httpOk(url, 20), false)
  const stop = new AbortController(), waiting = lifecycle.httpOk(url, 10_000, stop.signal)
  stop.abort(); assert.equal(await waiting, false)
  assert.equal(await lifecycle.httpOk('http://127.0.0.1:1'), false)
})

test('workbench checks ownership and worker freshness then invokes deep doctor once', async () => {
  let calls = 0
  const controller = new AbortController()
  const result = await probeWorkbenchReadiness({ root, environment: env, releaseIdentityHash: identity.identityHash, signal: controller.signal,
    deps: { ...deps(), probe: async input => { calls++; assert.equal(input.signal, controller.signal); return { status: 'READY' } } } })
  assert.equal(result.status, 'READY'); assert.equal(calls, 1)
  controller.abort()
  assert.equal((await probeWorkbenchReadiness({ root, environment: env, releaseIdentityHash: identity.identityHash, signal: controller.signal,
    deps: { authorize: () => { throw Error('Must not inspect after cancellation') } } })).code, 'AGENT_READINESS_CANCELLED')
  for (const [change, code] of [
    [{ authorize: () => { throw Error() } }, 'AGENT_LIVE_NOT_AUTHORIZED'],
    [{ inspect: async () => ({ services: [{ name: 'harness', owned: false }] }) }, 'AGENT_HARNESS_PROCESS_NOT_OWNED'],
    [{ workerHealth: () => false }, 'WORKER_HEARTBEAT_NOT_READY'],
  ]) {
    const failure = await probeWorkbenchReadiness({ root, environment: env, releaseIdentityHash: identity.identityHash,
      deps: { ...deps(), ...change, probe: () => { throw Error('Must not probe model') } } })
    assert.equal(failure.code, code)
  }
})

test('deep doctor retains migration, database and worker code-set gates and makes one Harness request', async () => {
  for (const [health, code] of [
    [{ runtime: { migrationsReady: false }, database: { quickCheck: ['ok'] } }, 'HARNESS_STATE_INVALID'],
    [{ runtime: { migrationsReady: true }, database: { quickCheck: ['corrupt'] } }, 'HARNESS_STATE_INVALID'],
    [{ runtime: { migrationsReady: true }, database: { quickCheck: ['ok'] }, worker: { codeSetReady: false } }, 'WORKER_NOT_READY'],
  ]) {
    let harnessCalls = 0
    const result = await probeProductReadiness({ root, environment: env, visionProbe: async () => ({ status: 'READY' }), fetchFn: async url => {
      if (String(url).endsWith('/chat/completions')) return Response.json({ choices: [{}] })
      if (String(url).includes('18788')) { harnessCalls++; return Response.json(health) }
      return Response.json({ version: 'test' })
    } })
    assert.equal(result.code, code); assert.equal(harnessCalls, 1)
  }
})

test('visual dependency failure stops doctor before dispatch and retains its safe code', async () => {
  let calls = 0, visualCalls = 0;
  const result = await probeProductReadiness({ root, environment: env,
    fetchFn: async () => { calls++; return Response.json({ choices: [{}] }) },
    visionProbe: async () => { visualCalls++; return { status: 'NOT_READY', code: 'I10_MIDSCENE_MODEL_UNSUPPORTED' } } });
  assert.equal(result.failedCheck, 'vision'); assert.equal(result.code, 'I10_MIDSCENE_MODEL_UNSUPPORTED');
  assert.equal(calls, 1); assert.equal(visualCalls, 1);
})

test('product-local visual selection overrides inherited model and participates in release identity', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rf068-visual-config-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temporary, '.data'));
  fs.writeFileSync(path.join(temporary, '.data/runtime.env'), 'VISION_MODEL_NAME=mimo-v2.6-flash\n');
  const inherited = { ...env, VISION_MODEL_NAME: 'mimo-v2.5', VISION_BASE_URL: 'https://visual.invalid/v1', VISION_MODEL_FAMILY: 'xiaomi-mimo' };
  const merged = lifecycle.environmentWithRuntimeFile({ root: temporary, environment: inherited });
  assert.equal(merged.VISION_MODEL_NAME, 'mimo-v2.6-flash');
  assert.notDeepEqual(lifecycle.modelIdentityFromEnvironment(merged), lifecycle.modelIdentityFromEnvironment(inherited));
})

test('model 401 remains specific; hanging transport is bounded and externally cancellable', async () => {
  assert.equal((await probeConfiguredModel({ environment: env, fetchFn: async () => new Response('', { status: 401 }) })).code, 'MODEL_HTTP_401')
  const server = http.createServer((req, res) => { if (req.url.startsWith('/body')) { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders() } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const environment = { ...env, HENGZHUN_MODEL_BASE_URL: `http://127.0.0.1:${server.address().port}` }
    assert.equal((await probeConfiguredModel({ environment, timeoutMs: 25 })).code, 'MODEL_TIMEOUT')
    assert.equal((await probeConfiguredModel({ environment: { ...environment, HENGZHUN_MODEL_BASE_URL: environment.HENGZHUN_MODEL_BASE_URL + '/body' }, timeoutMs: 25 })).code, 'MODEL_TIMEOUT')
    const controller = new AbortController(), waiting = probeConfiguredModel({ environment, signal: controller.signal })
    controller.abort(); assert.equal((await waiting).code, 'AGENT_READINESS_CANCELLED')
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
