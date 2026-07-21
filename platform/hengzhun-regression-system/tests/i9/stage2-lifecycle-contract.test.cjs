'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')

const productRoot = path.resolve(__dirname, '../..')
const node = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
const lifecycle = path.join(productRoot, 'scripts', 'i9-lifecycle.cjs')

test('lifecycle contract freezes service order, product-local entrypoints and secret-free state', () => {
  const source = fs.readFileSync(lifecycle, 'utf8')
  assert.match(source, /serviceOrder = \['harness', 'mcp', 'worker', 'flowise'\]/)
  assert.match(source, /\[\.\.\.serviceOrder\]\.reverse\(\)/)
  assert.match(source, /flowise\/app\/node_modules\/flowise\/bin\/run/)
  assert.match(source, /I9_PROCESS_OWNERSHIP_MISMATCH/)
  assert.match(source, /I9_PORT_OCCUPIED_UNKNOWN/)
  assert.match(source, /process\.env\.NODE_ENV === 'test' && process\.env\.HENGZHUN_I9_TEST_FAIL_SERVICE === name/)
  const stateProjection = source.slice(source.indexOf('return { name, pid:'), source.indexOf('async function stopRecords'))
  for (const forbidden of ['SERVICE_TOKEN', 'WORKER_TOKEN', 'MCP_TOKEN', 'MIMO_API_KEY']) assert.equal(stateProjection.includes(forbidden), false)
})

test('start fails closed before spawning when credentials are missing or weak', () => {
  const result = childProcess.spawnSync(node, [lifecycle, 'start'], {
    cwd: productRoot,
    encoding: 'utf8',
    env: { ...process.env, HENGZHUN_SERVICE_TOKEN: '', HENGZHUN_WORKER_TOKEN: 'weak', HENGZHUN_MCP_TOKEN: '' }
  })
  assert.equal(result.status, 1)
  const error = JSON.parse(result.stderr.trim())
  assert.equal(error.errorCode, 'I9_CREDENTIAL_MISSING_OR_WEAK')
  assert.equal(error.message.includes('weak'), false)
})

test('repair stability worker claim uses the worker channel token', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i9-p2-worker-auth-'))
  const workerToken = 'synthetic-i9-p2-worker-token-00000000001'
  const running = await startHarness({
    productRoot: temporary,
    databasePath: path.join(temporary, 'sqlite', 'platform.sqlite'),
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(temporary, 'backups'),
    artifactRoot: path.join(temporary, 'artifacts'),
    security: { serviceToken: 'synthetic-i9-p2-service-token-0000000001', allowedClients: ['127.0.0.1', '::1'] },
    workerToken,
    schedulerIntervalMs: 0,
    host: '127.0.0.1',
    port: 0
  })
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(temporary, { recursive: true, force: true }) })
  const port = running.server.address().port
  const response = await fetch(`http://127.0.0.1:${port}/internal/worker/i8/repairs/stability:claim`, {
    method: 'POST', headers: { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ workerId: 'i9-p2-worker' })
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'EMPTY')
})
