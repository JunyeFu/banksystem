#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { verifyCandidate } = require('./i9-stage8-portable.cjs')

const root = path.resolve(__dirname, '..')
const node = path.join(root, 'runtime', 'node-v20.20.2-win-x64', 'node.exe')
const lifecycle = path.join(root, 'scripts', 'i9-lifecycle.cjs')
const runtimeEnvFile = path.join(root, '.data', 'runtime.env')
const machineRole = (() => {
  const index = process.argv.indexOf('--role')
  return index >= 0 ? process.argv[index + 1] : 'current-clean-directory'
})()
assert.ok(['current-clean-directory', 'second-computer'].includes(machineRole), 'I9_P8_MACHINE_ROLE_INVALID')

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8') }

function runtimeEnvironment() {
  const env = { ...process.env }
  for (const name of ['MIMO_API_KEY', 'MIMO_MODEL_API_KEY', 'HENGZHUN_CUSTOMER_USERNAME', 'HENGZHUN_CUSTOMER_PASSWORD']) delete env[name]
  if (fs.existsSync(runtimeEnvFile)) {
    for (const line of fs.readFileSync(runtimeEnvFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (match) env[match[1]] = match[2]
    }
  }
  return env
}

function runChecked(command, args, label, env = process.env) {
  const result = childProcess.spawnSync(command, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 180000 })
  if (result.error) throw Object.assign(result.error, { code: `${label}_SPAWN_FAILED` })
  assert.equal(result.status, 0, `${label}_FAILED:${String(result.stderr || '').trim().slice(0, 300)}`)
  return String(result.stdout || '')
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 5000 }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300 ? resolve(body) : reject(new Error(`HTTP_${response.statusCode}`)))
    })
    request.on('timeout', () => request.destroy(new Error('HTTP_TIMEOUT')))
    request.on('error', reject)
  })
}

async function startControlledPortal() {
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://127.0.0.1').pathname
    response.setHeader('content-type', 'text/html; charset=utf-8')
    if (route === '/portal/login') return response.end('<!doctype html><meta charset="utf-8"><label>用户名<input data-testid="login-username"></label><label>密码<input data-testid="login-password" type="password"></label><button data-testid="login-submit">登录</button><script>document.querySelector("button").onclick=()=>{if(document.querySelector("[data-testid=login-username]").value==="portable-user"&&document.querySelector("[data-testid=login-password]").value==="portable-password")location.href="/portal/dashboard"}</script>')
    if (route === '/portal/dashboard') return response.end('<!doctype html><meta charset="utf-8"><span data-testid="customer-profile-name">便携验收用户</span><span data-testid="customer-profile-avatar">便</span><a data-testid="profile-link" href="/portal/profile">个人资料</a>')
    if (route === '/portal/profile') return response.end('<!doctype html><meta charset="utf-8"><span data-testid="profile-display-name">便携验收用户</span><span data-testid="profile-avatar">便</span>')
    response.statusCode = 404
    response.end('not found')
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

async function browserSmoke() {
  const { chromium } = require(path.join(root, 'runtime', 'node_modules', 'playwright'))
  const executablePath = path.join(root, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe')
  const portal = await startControlledPortal()
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${portal.baseUrl}/portal/login`)
    await page.getByTestId('login-username').fill('portable-user')
    await page.getByTestId('login-password').fill('portable-password')
    await page.getByTestId('login-submit').click()
    await page.waitForURL('**/portal/dashboard')
    const headerName = await page.getByTestId('customer-profile-name').textContent()
    const headerAvatar = await page.getByTestId('customer-profile-avatar').textContent()
    await page.getByTestId('profile-link').click()
    assert.equal(await page.getByTestId('profile-display-name').textContent(), headerName)
    assert.equal(await page.getByTestId('profile-avatar').textContent(), headerAvatar)
    await context.close()
  } finally {
    await browser.close()
    await new Promise(resolve => portal.server.close(resolve))
  }
}

function parseBackupManifest(output) {
  const match = output.match(/\{[\s\S]*\}/)
  assert.ok(match, 'I9_P8_BACKUP_OUTPUT_INVALID')
  const payload = JSON.parse(match[0])
  assert.equal(payload.status, 'BACKUP_CREATED')
  assert.ok(payload.manifestPath && fs.existsSync(payload.manifestPath), 'I9_P8_BACKUP_MANIFEST_MISSING')
  return payload.manifestPath
}

async function main() {
  assert.equal(process.platform, 'win32', 'I9_P8_WINDOWS_REQUIRED')
  assert.equal(process.arch, 'x64', 'I9_P8_X64_REQUIRED')
  const candidate = verifyCandidate(root)
  const checks = []
  const add = (id, status, evidenceCode) => checks.push({ id, status, evidenceCode })
  let started = false
  try {
    runChecked('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'prepare-i9.ps1')], 'PREPARE')
    add('PREPARE_EMPTY_DATA', 'PASSED', 'P8_PREPARE_READY')
    const env = runtimeEnvironment()
    runChecked(node, [lifecycle, 'start'], 'START', env)
    started = true
    const config = readJson(path.join(root, 'config', 'i9.runtime.example.json'))
    await Promise.all([
      requestJson(`http://127.0.0.1:${config.network.harnessPort}/health`),
      requestJson(`http://127.0.0.1:${config.network.mcpPort}/health`),
      requestJson(`http://127.0.0.1:${config.network.flowisePort}/api/v1/ping`)
    ])
    const status = JSON.parse(runChecked(node, [lifecycle, 'status'], 'STATUS', env))
    assert.equal(status.healthy, true, 'I9_P8_FOUR_SERVICE_HEALTH_FAILED')
    assert.equal(Object.keys(status.services || {}).length, 4)
    add('FOUR_SERVICE_LOOPBACK_HEALTH', 'PASSED', 'P8_FOUR_SERVICES_HEALTHY')
    await browserSmoke()
    add('BUNDLED_PLAYWRIGHT_CHROMIUM_E2E', 'PASSED', 'P8_LOGIN_PROFILE_CONSISTENT')

    runChecked(node, [lifecycle, 'stop'], 'STOP_BEFORE_BACKUP', env)
    started = false
    const backupOutput = runChecked(node, [path.join(root, 'scripts', 'i9-sqlite-snapshot.cjs'), 'backup'], 'DUAL_SQLITE_BACKUP', env)
    const backupManifest = parseBackupManifest(backupOutput)
    runChecked(node, [path.join(root, 'scripts', 'i9-sqlite-snapshot.cjs'), 'restore', backupManifest], 'DUAL_SQLITE_RESTORE', env)
    add('DUAL_SQLITE_BACKUP_RESTORE', 'PASSED', 'P8_DUAL_SQLITE_QUICK_CHECK_OK')

    runChecked(node, [lifecycle, 'start'], 'RESTART_AFTER_RESTORE', env)
    started = true
    const restarted = JSON.parse(runChecked(node, [lifecycle, 'status'], 'RESTART_STATUS', env))
    assert.equal(restarted.healthy, true)
    add('RESTART_AFTER_RESTORE', 'PASSED', 'P8_RESTART_HEALTHY')
  } finally {
    if (started) {
      try { runChecked(node, [lifecycle, 'stop'], 'FINAL_STOP', runtimeEnvironment()) } catch { }
    }
  }

  const machineSeed = `${os.hostname()}|${os.release()}|${os.arch()}|${os.cpus()[0]?.model || 'unknown'}`
  const record = {
    schemaVersion: 'hengzhun-i9-p8-machine-record-v1',
    sourceCommit: candidate.sourceCommit,
    candidateManifestSha256: candidate.candidateManifestSha256,
    machineRole,
    machineIdSha256: sha256(machineSeed),
    platform: { os: 'windows', architecture: os.arch(), release: os.release() },
    constraints: { bundledNodeOnly: true, bundledChromiumOnly: true, externalModelCredentialUsed: false, loopbackServicesOnly: true, absolutePathRecorded: false },
    checks,
    overallStatus: checks.length === 5 && checks.every(item => item.status === 'PASSED') ? 'PASSED' : 'FAILED'
  }
  assert.equal(record.overallStatus, 'PASSED')
  const recordName = `${machineRole}-${Date.now()}.json`
  writeJson(path.join(root, 'acceptance', 'machine-records', recordName), record)
  process.stdout.write(`${JSON.stringify({ status: 'P8_MACHINE_ACCEPTANCE_PASSED', machineRole, sourceCommit: record.sourceCommit, candidateManifestSha256: record.candidateManifestSha256, checks: record.checks.map(item => item.evidenceCode) }, null, 2)}\n`)
}

main().catch(error => { process.stderr.write(`${error.code || 'I9_P8_MACHINE_ACCEPTANCE_FAILED'}:${error.message}\n`); process.exitCode = 2 })
