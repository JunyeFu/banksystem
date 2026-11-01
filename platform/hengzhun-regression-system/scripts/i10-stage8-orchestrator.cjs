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
const ffmpeg = path.join(root, 'runtime', require('../config/demo-runtime-freeze.json').mediaFfmpeg.executable)
const runtimeRequire = createRequire(path.join(root, 'runtime/node_modules/_hengzhun_loader.cjs'))
const { chromium } = runtimeRequire('playwright')
const ExcelJS = runtimeRequire('exceljs')
const acceptancePolicy = require('./i10-acceptance-execution-policy.cjs')
const portalPort = 28884
const portalBase = `http://127.0.0.1:${portalPort}`
const dataRoot = path.join(root, '.data/tests/i10-stage8-live')
const attachmentRoot = path.join(dataRoot, 'attachments')
let preparationTiming = null

// The portable entrypoints load this non-versioned local runtime configuration
// before launching child processes.  Stage 8 is an internal live acceptance
// runner, so it must do the same without printing or serializing any value.
function loadLocalRuntimeEnvironment() {
  const runtimeEnv = path.join(root, '.data', 'runtime.env')
  if (!fs.existsSync(runtimeEnv)) return
  for (const line of fs.readFileSync(runtimeEnv, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
loadLocalRuntimeEnvironment()

function fail(code, details = {}) {
  const error = new Error(code)
  error.code = code
  error.details = details
  throw error
}

async function request(url, options = {}) {
  let response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 30_000) })
  } catch (error) {
    const route = new URL(url).pathname
    if (error?.name === 'TimeoutError' || error?.code === 23) {
      fail('I10_STAGE8_PREPARE_HTTP_TIMEOUT', { route, timeoutMs: options.timeoutMs || 30_000 })
    }
    fail('I10_STAGE8_PREPARE_HTTP_UNREACHABLE', {
      route,
      causeName: error?.name || 'Error',
      causeCode: typeof error?.code === 'string' ? error.code : undefined
    })
  }
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = { text } }
  if (!response.ok) fail('I10_STAGE8_PREPARE_HTTP_FAILED', { route: new URL(url).pathname, status: response.status, errorCode: body?.errorCode })
  return body
}

async function phase(stageName, action) {
  if (preparationTiming) preparationTiming.startStage(stageName)
  try {
    const result = await action()
    if (preparationTiming) preparationTiming.endStage(stageName)
    return result
  } catch (error) {
    if (preparationTiming) {
      try { preparationTiming.endStage(stageName) } catch {}
    }
    if (typeof error?.code === 'string' && error.code.startsWith('I10_STAGE8_')) {
      error.details = { stageName, ...(error.details || {}) }
      throw error
    }
    fail('I10_STAGE8_PREPARATION_PHASE_FAILED', {
      stageName,
      causeName: error?.name || 'Error',
      causeCode: typeof error?.code === 'string' ? error.code : undefined
    })
  }
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

async function screenshot(page, route, target, options = {}) {
  await page.goto(`${portalBase}${route}`, { waitUntil: 'networkidle' })
  await page.evaluate(({ obstructTarget, evidenceLabel }) => {
    const marker = document.createElement('div')
    marker.setAttribute('aria-label', '可见鼠标指针')
    Object.assign(marker.style, { position: 'fixed', left: '62%', top: '48%', width: '18px', height: '24px', background: '#d71920', clipPath: 'polygon(0 0, 0 100%, 28% 70%, 48% 100%, 62% 92%, 42% 62%, 100% 62%)', zIndex: '2147483647' })
    document.body.appendChild(marker)
    const markerLabel = document.createElement('div')
    markerLabel.textContent = '鼠标指针'
    markerLabel.setAttribute('aria-hidden', 'true')
    Object.assign(markerLabel.style, {
      position: 'fixed', left: '63.5%', top: '47%', padding: '2px 6px',
      background: '#fff', color: '#d71920', border: '2px solid #d71920',
      fontSize: '16px', fontWeight: '700', zIndex: '2147483647'
    })
    document.body.appendChild(markerLabel)
    if (obstructTarget) {
      const obstruction = document.createElement('div')
      obstruction.setAttribute('aria-label', '测试录屏中的目标区域遮挡')
      obstruction.textContent = '目标区域暂时被浮层遮挡，点击对象无法确定'
      Object.assign(obstruction.style, {
        position: 'fixed', left: '31%', top: '38%', width: '38%', height: '25%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(45,45,45,.94)', color: '#fff', fontSize: '24px',
        border: '4px dashed #d71920', zIndex: '2147483646'
      })
      document.body.appendChild(obstruction)
    }
    if (evidenceLabel) {
      const label = document.createElement('div')
      label.setAttribute('aria-label', '测试证据页面名称')
      label.textContent = evidenceLabel
      Object.assign(label.style, {
        position: 'fixed', left: '20%', top: '16%', padding: '18px 28px',
        background: '#fff', color: '#111', border: '4px solid #d71920',
        fontSize: '34px', fontWeight: '800', zIndex: '2147483645'
      })
      document.body.appendChild(label)
    }
  }, { obstructTarget: options.obstructTarget === true, evidenceLabel: options.evidenceLabel || '' })
  await page.screenshot({ path: target })
}

async function createAttachments() {
  fs.mkdirSync(attachmentRoot, { recursive: true })
  const caseFile = path.join(attachmentRoot, 'portal-login-case.xlsx')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('自动化测试案例')
  sheet.addRow(['案例名称', '目标系统', '入口地址', '前置条件', '执行步骤', '预期结果'])
  sheet.addRow([
    '门户账号密码登录资料一致性',
    '复兴银行',
    `${portalBase}/portal/login`,
    '门户可访问',
    '输入账号密码登录；打开个人资料',
    '登录成功；页眉姓名头像与个人资料一致'
  ])
  await workbook.xlsx.writeFile(caseFile)
  const correctionCaseFile = path.join(attachmentRoot, 'portal-login-case-needs-correction.csv')
  fs.writeFileSync(correctionCaseFile, [
    '案例名称,目标系统,入口地址,前置条件,执行步骤,预期结果',
    '门户账号密码登录资料一致性,复兴银行,http://127.0.0.1:28884,门户可访问,"输入账号密码登录；打开个人资料","登录成功；页眉姓名头像与个人资料一致"'
  ].join('\r\n'), 'utf8')
  const imageMergeCaseFile = path.join(attachmentRoot, 'portal-login-case-with-image.json')
  fs.writeFileSync(imageMergeCaseFile, `${JSON.stringify({
    cases: [{
      '案例名称': '门户登录与成功页资料一致性',
      '测试目标': '验证登录成功页和个人资料页的客户姓名与头像一致',
      '目标系统': '复兴银行',
      '入口地址': `${portalBase}/portal/login`,
      '前置条件': '门户可访问',
      '执行步骤': '输入账号密码登录；检查成功页姓名头像；打开个人资料',
      '预期结果': '登录成功；成功页显示姓名头像；个人资料与成功页一致',
      '断言': '成功页姓名与个人资料姓名一致；头像正常显示'
    }]
  }, null, 2)}\n`, 'utf8')

  const loginPng = path.join(attachmentRoot, 'login.png')
  const profilePng = path.join(attachmentRoot, 'profile.png')
  const obstructedLoginPng = path.join(attachmentRoot, 'login-obstructed.png')
  const conflictVideoPng = path.join(attachmentRoot, 'video-old-page-label.png')
  const conflictImagePng = path.join(attachmentRoot, 'image-new-page-label.png')
  const browser = await chromium.launch({ executablePath: chromiumExecutable, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await screenshot(page, '/portal/login', loginPng)
    await screenshot(page, '/portal/profile', profilePng)
    await screenshot(page, '/portal/login', obstructedLoginPng, { obstructTarget: true })
    await screenshot(page, '/portal/profile', conflictVideoPng, { evidenceLabel: '旧版页面名称：客户资料' })
    await screenshot(page, '/portal/profile', conflictImagePng, { evidenceLabel: '新版页面名称：个人资料' })
  } finally { await browser.close() }

  const video = path.join(attachmentRoot, 'portal-login-success.mp4')
  const result = spawnSync(ffmpeg, [
    '-y', '-loop', '1', '-t', '2', '-i', loginPng, '-loop', '1', '-t', '2', '-i', profilePng,
    '-filter_complex', '[0:v]fps=5,format=yuv420p[v0];[1:v]fps=5,format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || result.status !== 0 || !fs.existsSync(video)) fail('I10_STAGE8_VIDEO_FIXTURE_FAILED')
  const lowConfidenceVideo = path.join(attachmentRoot, 'portal-login-low-confidence.mp4')
  const lowConfidenceResult = spawnSync(ffmpeg, [
    '-y', '-loop', '1', '-t', '2', '-i', obstructedLoginPng, '-loop', '1', '-t', '2', '-i', profilePng,
    '-filter_complex', '[0:v]fps=5,format=yuv420p[v0];[1:v]fps=5,format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', lowConfidenceVideo
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  if (lowConfidenceResult.error || lowConfidenceResult.status !== 0 || !fs.existsSync(lowConfidenceVideo)) {
    fail('I10_STAGE8_LOW_CONFIDENCE_VIDEO_FIXTURE_FAILED')
  }
  const conflictVideo = path.join(attachmentRoot, 'portal-login-source-conflict.mp4')
  const conflictVideoResult = spawnSync(ffmpeg, [
    '-y', '-loop', '1', '-t', '2', '-i', conflictVideoPng, '-loop', '1', '-t', '2', '-i', conflictVideoPng,
    '-filter_complex', '[0:v]fps=5,format=yuv420p[v0];[1:v]fps=5,format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', conflictVideo
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  if (conflictVideoResult.error || conflictVideoResult.status !== 0 || !fs.existsSync(conflictVideo)) {
    fail('I10_STAGE8_CONFLICT_VIDEO_FIXTURE_FAILED')
  }
  return {
    caseFile,
    correctionCaseFile,
    imageMergeCaseFile,
    video,
    lowConfidenceVideo,
    conflictVideo,
    conflictSupportingImage: conflictImagePng,
    supportingImages: [loginPng, profilePng]
  }
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
  preparationTiming = acceptancePolicy.createTimingLedger({ runId: `stage8-prepare-${Date.now()}` })
  try {
    await phase('controlled_portal_health', waitForPortal)
    const credentialRef = await phase('credential_capture', () => createCredentialRef(username, password))
    const attachments = await phase('attachment_fixture_generation', createAttachments)
    const scenarioFile = path.join(dataRoot, 'scenario.json')
    fs.writeFileSync(scenarioFile, `${JSON.stringify({
      schemaVersion: 'hengzhun-i10-stage8-scenario-v1',
      credentialRef,
      caseFilePath: attachments.caseFile,
      correctionCaseFilePath: attachments.correctionCaseFile,
      imageMergeCaseFilePath: attachments.imageMergeCaseFile,
      videoPath: attachments.video,
      lowConfidenceVideoPath: attachments.lowConfidenceVideo,
      conflictVideoPath: attachments.conflictVideo,
      conflictSupportingImagePath: attachments.conflictSupportingImage,
      supportingImagePaths: attachments.supportingImages,
      portalUrl: portalBase,
      failureControlUrl: portalBase
    }, null, 2)}\n`)
    const live = spawnSync(node, [path.join(root, 'scripts/i10-stage8-live.cjs')], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: {
        ...process.env,
        I10_STAGE8_SCENARIO_FILE: scenarioFile,
        // F-002 uses these values only inside the child process to exercise
        // the same DPAPI capture endpoint as the local form. They are never
        // written to the scenario or evidence files.
        I10_STAGE8_FIXTURE_USERNAME: username,
        I10_STAGE8_FIXTURE_PASSWORD: password
      }
    })
    if (live.error || live.status !== 0) fail('I10_STAGE8_LIVE_MATRIX_FAILED', { exitCode: live.status })
  } finally {
    if (preparationTiming) {
      try {
        fs.mkdirSync(path.join(root, '.data/evidence/i10/stage8'), { recursive: true })
        fs.writeFileSync(
          path.join(root, '.data/evidence/i10/stage8/preparation-timing.json'),
          `${JSON.stringify(preparationTiming.finalize(), null, 2)}\n`,
          'utf8'
        )
      } catch {}
      preparationTiming = null
    }
    if (portal.exitCode === null) portal.kill('SIGTERM')
    await new Promise(resolve => { if (portal.exitCode !== null) resolve(); else { portal.once('exit', resolve); setTimeout(resolve, 5_000) } })
  }
}

if (require.main === module) main().catch(error => {
  const errorCode = typeof error?.code === 'string'
    ? error.code
    : (error?.name === 'TimeoutError' || error?.code === 23)
        ? 'I10_STAGE8_REQUEST_TIMEOUT'
        : error?.message || 'I10_STAGE8_ORCHESTRATION_FAILED'
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode, details: error.details || {} })}\n`)
  process.exitCode = 2
})

module.exports = { createAttachments, createCredentialRef }
