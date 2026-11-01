#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { afterEach, test } = require('node:test')

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
const scriptPath = path.join(repoRoot, 'scripts', 'deploy', 'ensure-fineract-credentials.ps1')
const temporaryRoots = []

afterEach(() => {
  for (const target of temporaryRoots.splice(0)) fs.rmSync(target, { recursive: true, force: true })
})

function writeEnvironment(adminPassword, channelPassword = 'OutdatedChannel1!') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fineract-credential-bootstrap-'))
  temporaryRoots.push(root)
  const environmentPath = path.join(root, '.env')
  fs.writeFileSync(environmentPath, [
    'FINERACT_USERNAME=mifos',
    `FINERACT_PASSWORD=${channelPassword}`,
    'FINERACT_ADMIN_USERNAME=mifos',
    `FINERACT_ADMIN_PASSWORD=${adminPassword}`,
    'FINERACT_TENANT=default',
    ''
  ].join('\n'))
  return environmentPath
}

function runPowerShell(environmentPath, baseUrl) {
  return new Promise(resolve => {
    const child = spawn('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      '-EnvironmentPath', environmentPath, '-BaseUrl', baseUrl
    ], { cwd: repoRoot, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
}

async function withFineractStub(initialPassword, callback) {
  const state = { password: initialPassword, rotations: 0 }
  const server = http.createServer((request, response) => {
    const expected = `Basic ${Buffer.from(`mifos:${state.password}`, 'ascii').toString('base64')}`
    const authorized = request.headers.authorization === expected && request.headers['fineract-platform-tenantid'] === 'default'
    if (request.method === 'GET' && request.url === '/fineract-provider/api/v1/offices?limit=1') {
      response.writeHead(authorized ? 200 : 401, { 'content-type': 'application/json' })
      response.end(authorized ? '[]' : '{"error":"unauthorized"}')
      return
    }
    if (request.method === 'POST' && request.url === '/fineract-provider/api/v1/users/1/pwd') {
      if (!authorized) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end('{"error":"unauthorized"}')
        return
      }
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        const payload = JSON.parse(body)
        assert.equal(payload.password, payload.repeatPassword)
        state.password = payload.password
        state.rotations += 1
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{}')
      })
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    return await callback(`http://127.0.0.1:${address.port}/fineract-provider`, state)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('fresh Fineract database rotates the bootstrap administrator to the declared local credential', async () => {
  await withFineractStub('password', async (baseUrl, state) => {
    const configured = 'ConfiguredAdmin1!'
    const environmentPath = writeEnvironment(configured)
    const result = await runPowerShell(environmentPath, baseUrl)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /FINERACT_CREDENTIALS=ROTATED_AND_SYNCHRONIZED/)
    assert.equal(state.password, configured)
    assert.equal(state.rotations, 1)
    assert.match(fs.readFileSync(environmentPath, 'utf8'), /^FINERACT_PASSWORD=ConfiguredAdmin1!$/m)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ConfiguredAdmin1!|OutdatedChannel1!|mifos:password/)
  })
})

test('configured Fineract administrator is reused and only the channel credential is synchronized', async () => {
  await withFineractStub('ConfiguredAdmin1!', async (baseUrl, state) => {
    const environmentPath = writeEnvironment('ConfiguredAdmin1!')
    const result = await runPowerShell(environmentPath, baseUrl)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /FINERACT_CREDENTIALS=VERIFIED_AND_SYNCHRONIZED/)
    assert.equal(state.rotations, 0)
    assert.match(fs.readFileSync(environmentPath, 'utf8'), /^FINERACT_PASSWORD=ConfiguredAdmin1!$/m)
  })
})

test('unknown Fineract administrator state fails closed without changing the local credential file', async () => {
  await withFineractStub('UnknownAdmin1!', async baseUrl => {
    const environmentPath = writeEnvironment('ConfiguredAdmin1!')
    const before = fs.readFileSync(environmentPath, 'utf8')
    const result = await runPowerShell(environmentPath, baseUrl)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /FINERACT_ADMIN_CREDENTIAL_MISMATCH/)
    assert.equal(fs.readFileSync(environmentPath, 'utf8'), before)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ConfiguredAdmin1!|UnknownAdmin1!|OutdatedChannel1!|mifos:password/)
  })
})
