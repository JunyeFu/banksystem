#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { spawn, spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const node = path.join(root, 'runtime/node-v20.20.2-win-x64/node.exe')
const chromiumExecutable = path.join(root, 'runtime/browsers/chromium-1217/chrome-win64/chrome.exe')
const ffmpeg = path.join(root, 'runtime/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe')
const runtimeRequire = createRequire(path.join(root, 'runtime/node_modules/_hengzhun_loader.cjs'))
const { chromium } = runtimeRequire('playwright')
const portalPort = 28884
const portalBase = `http://127.0.0.1:${portalPort}`
const dataRoot = path.join(root, '.data/tests/i10-stage8-live')
const attachmentRoot = path.join(dataRoot, 'attachments')

function fail(code, details = {}) {
  const error = new Error(code)
  error.code = code
  error.details = details
  throw error
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 30_000) })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = { text } }
  if (!response.ok) fail('I10_STAGE8_PREPARE_HTTP_FAILED', { route: new URL(url).pathname, status: response.status, errorCode: body?.errorCode })
  return body
}

async function waitForPortal() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try { await request(`${portalBase}/__health`, { timeoutMs: 1_000 }); return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  fail('I10_STAGE8_CONTROLLED_PORTAL_START_TIMEOUT')
}

async function createCredentialRef(username, password) {
  const token = process.env.HENGZHUN_SERVICE_TOKEN
  if (!token || token.length < 32) fail('I10_STAGE8_SERVICE_TOKEN_MISSING')
  const created = await request('http://127.0.0.1:18788/v1/i10/credentials:sessions-create', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ namespace: 'hengzhun-local', idempotencyKey: `i10-s8-${crypto.randomUUID()}`, label: 'I10 S8受控门户凭据' })
  })
  const capture = new URL(created.captureUrl)
  const captureToken = new URLSearchParams(capture.hash.slice(1)).get('token')
  if (!captureToken || !/^credsession_[0-9a-f-]{36}$/.test(created.sessionId)) fail('I10_STAGE8_CREDENTIAL_SESSION_INVALID')
  const stored = await request(`http://127.0.0.1:18788/v1/i10/credentials/${created.sessionId}:store`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ captureToken, username, password })
  })
  if (!/^credential_[0-9a-f-]{36}$/.test(stored.credentialRef || '')) fail('I10_STAGE8_CREDENTIAL_REF_INVALID')
  return stored.credentialRef
}

async function screenshot(page, route, target) {
  await page.goto(`${portalBase}${route}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const marker = document.createElement('div')
    marker.setAttribute('aria-label', '可见鼠标指针')
    Object.assign(marker.style, { position: 'fixed', left: '62%', top: '48%', width: '18px', height: '24px', background: '#d71920', clipPath: 'polygon(0 0, 0 100%, 28% 70%, 48% 100%, 62% 92%, 42% 62%, 100% 62%)', zIndex: '2147483647' })
    document.body.appendChild(marker)
  })
  await page.screenshot({ path: target })
}

async function createAttachments() {
  fs.mkdirSync(attachmentRoot, { recursive: true })
  const caseFile = path.join(attachmentRoot, 'portal-login-case.csv')
  fs.writeFileSync(caseFile, [
    '案例名称,目标系统,入口地址,前置条件,执行步骤,预期结果',
    `门户账号密码登录资料一致性,复兴银行,${portalBase}/portal/login,门户可访问,"输入账号密码登录；打开个人资料","登录成功；页眉姓名头像与个人资料一致"`
  ].join('\r\n'), 'utf8')

  const loginPng = path.join(attachmentRoot, 'login.png')
  const profilePng = path.join(attachmentRoot, 'profile.png')
  const browser = await chromium.launch({ executablePath: chromiumExecutable, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await screenshot(page, '/portal/login', loginPng)
    await screenshot(page, '/portal/profile', profilePng)
  } finally { await browser.close() }

  const video = path.join(attachmentRoot, 'portal-login-success.mp4')
  const result = spawnSync(ffmpeg, [
    '-y', '-loop', '1', '-t', '2', '-i', loginPng, '-loop', '1', '-t', '2', '-i', profilePng,
    '-filter_complex', '[0:v]fps=5,format=yuv420p[v0];[1:v]fps=5,format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  fs.rmSync(loginPng, { force: true }); fs.rmSync(profilePng, { force: true })
  if (result.error || result.status !== 0 || !fs.existsSync(video)) fail('I10_STAGE8_VIDEO_FIXTURE_FAILED')
  return { caseFile, video }
}

async function main() {
  for (const name of ['CONTROL_API_KEY', 'CONTROL_BASE_URL', 'CONTROL_MODEL_NAME', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL_NAME']) if (!process.env[name]) fail(`${name}_MISSING`)
  const username = `i10-user-${crypto.randomUUID()}`
  const password = `Hz!${crypto.randomBytes(32).toString('base64url')}`
  fs.mkdirSync(path.join(root, '.data/logs/i10'), { recursive: true })
  const portalOut = fs.openSync(path.join(root, '.data/logs/i10/stage8-portal.stdout.log'), 'a')
  const portalErr = fs.openSync(path.join(root, '.data/logs/i10/stage8-portal.stderr.log'), 'a')
  const portal = spawn(node, [path.join(root, 'scripts/i10-stage8-controlled-portal.cjs')], {
    cwd: root, windowsHide: true, stdio: ['ignore', portalOut, portalErr],
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, HENGZHUN_I10_STAGE8_PORT: String(portalPort), I10_STAGE8_FIXTURE_USERNAME: username, I10_STAGE8_FIXTURE_PASSWORD: password }
  })
  fs.closeSync(portalOut); fs.closeSync(portalErr)
  try {
    await waitForPortal()
    const credentialRef = await createCredentialRef(username, password)
    const attachments = await createAttachments()
    const scenarioFile = path.join(dataRoot, 'scenario.json')
    fs.writeFileSync(scenarioFile, `${JSON.stringify({ schemaVersion: 'hengzhun-i10-stage8-scenario-v1', credentialRef, caseFilePath: attachments.caseFile, videoPath: attachments.video, portalUrl: portalBase, failureControlUrl: portalBase }, null, 2)}\n`)
    const live = spawnSync(node, [path.join(root, 'scripts/i10-stage8-live.cjs')], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, I10_STAGE8_SCENARIO_FILE: scenarioFile }
    })
    if (live.error || live.status !== 0) fail('I10_STAGE8_LIVE_MATRIX_FAILED', { exitCode: live.status })
  } finally {
    if (portal.exitCode === null) portal.kill('SIGTERM')
    await new Promise(resolve => { if (portal.exitCode !== null) resolve(); else { portal.once('exit', resolve); setTimeout(resolve, 5_000) } })
  }
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: error.code || error.message || 'I10_STAGE8_ORCHESTRATION_FAILED', details: error.details || {} })}\n`)
  process.exitCode = 2
})

module.exports = { createAttachments, createCredentialRef }
