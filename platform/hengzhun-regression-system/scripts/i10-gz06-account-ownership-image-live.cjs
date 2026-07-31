#!/usr/bin/env node
'use strict'

// Real image-assisted acceptance for GZ06.  A fresh, masked account page is
// captured with the DPAPI-backed customer credential, stored as a controlled
// Flowise attachment, then sent through the exact Harness OCR/fact-confirmation
// contract used by the Agentflow.  No credential value is written to disk.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../runtime/node_modules/playwright')

const root = path.resolve(__dirname, '..')
const scenarioPath = path.join(root, '.data', 'tests', 'i10-stage8-live', 'scenario.json')
const evidencePath = path.join(root, '.data', 'evidence', 'i10', 'gz06-account-ownership-image', 'result.json')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
let phase = 'STARTUP'

function fail(code) { const error = new Error(code); error.code = code; throw error }
function loadRuntimeEnvironment() {
  const source = path.join(root, '.data', 'runtime.env')
  if (!fs.existsSync(source)) fail('I10_GZ06_RUNTIME_ENV_MISSING')
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
async function post(route, body, token = process.env.HENGZHUN_SERVICE_TOKEN) {
  const base = String(process.env.HENGZHUN_HARNESS_URL || 'http://127.0.0.1:18788').replace(/\/$/, '')
  const response = await fetch(`${base}${route}`, {
    method: 'POST', headers: { authorization: `Bearer ${token || ''}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45_000)
  })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(String(value?.errorCode || `HTTP_${response.status}`))
    error.code = String(value?.errorCode || 'I10_GZ06_IMAGE_HARNESS_FAILED')
    throw error
  }
  return value
}
async function resolveCredential() {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
  const credentialRef = String(scenario.credentialRef || '')
  if (!/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) fail('I10_GZ06_CREDENTIAL_REF_MISSING')
  const result = await post('/internal/worker/i10/credentials:resolve', { namespace: 'hengzhun-local', credentialRef }, process.env.HENGZHUN_WORKER_TOKEN)
  if (!result?.username || !result?.password) fail('I10_GZ06_CREDENTIAL_RESOLVE_FAILED')
  return { credentialRef, username: result.username, password: result.password }
}
async function captureAccountPage(credential, targetPath) {
  const executablePath = process.env.HENGZHUN_CHROMIUM_EXECUTABLE || path.join(root, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe')
  if (!fs.existsSync(executablePath)) fail('CHROMIUM_UNAVAILABLE')
  const base = String(process.env.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '')
  const browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  try {
    await page.goto(`${base}/portal/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByTestId('login-username').fill(credential.username)
    await page.getByTestId('login-password').fill(credential.password)
    await page.getByTestId('login-submit').click()
    await page.getByTestId('customer-profile-name').waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('link', { name: '账户', exact: true }).click()
    const table = page.locator('.customer-table-card table')
    await table.waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('.customer-table-card tbody tr').length > 0, undefined, { timeout: 30_000 })
    await page.screenshot({ path: targetPath, fullPage: true, mask: [table, page.getByTestId('customer-profile-name')], maskColor: '#202020' })
  } finally {
    await context.close()
    await browser.close()
  }
}
async function waitForFacts(namespace, imageIngestId) {
  const deadline = Date.now() + 4 * 60_000
  while (Date.now() < deadline) {
    const result = await post('/v1/i10/images:get', { namespace, imageIngestId })
    if (result.status === 'WAITING_USER' || result.status === 'FAILED') return result
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  fail('I10_GZ06_IMAGE_OCR_TIMEOUT')
}
function safeFacts(facts) {
  return (Array.isArray(facts) ? facts : []).map(fact => ({
    field: String(fact?.field || ''), value: String(fact?.value || '').slice(0, 300),
    confidence: Number(fact?.confidence || 0), selected: fact?.selected === true
  }))
}
async function main() {
  phase = 'LOAD_RUNTIME'
  loadRuntimeEnvironment()
  phase = 'RESOLVE_CREDENTIAL'
  const credential = await resolveCredential()
  const attachmentRef = `i10-gz06-account-image-${crypto.randomUUID()}`
  const attachmentName = 'account-overview.png'
  const attachmentDirectory = path.join(root, '.data', 'flowise-attachments', attachmentRef)
  const attachmentPath = path.join(attachmentDirectory, attachmentName)
  const namespace = `i10-gz06-image-${Date.now()}`
  try {
    phase = 'CAPTURE_MASKED_ACCOUNT_SCREENSHOT'
    fs.mkdirSync(attachmentDirectory, { recursive: true })
    await captureAccountPage(credential, attachmentPath)
    const sourceSha256 = sha256(fs.readFileSync(attachmentPath))
    phase = 'SUBMIT_CONTROLLED_ATTACHMENT'
    const submitted = await post('/v1/i10/images:submit', {
      namespace, idempotencyKey: `gz06-image-${crypto.randomUUID()}`,
      sourceRef: 'gz06-account-ownership-natural-language', primaryInputType: 'NATURAL_LANGUAGE',
      primaryText: '登录复兴银行门户，打开账户页面，核对账户列表可见；进入本人账户详情并验证伪造的他人账户详情被拒绝。',
      images: [{ flowiseFileRef: attachmentRef, originalFilename: attachmentName, purposeHint: '账户页面截图：识别页面标题、账户入口、账户列表与可见操作，不读取或保留账户数据。' }]
    })
    phase = 'WAIT_FOR_OCR_AND_CONTROLLER'
    const image = await waitForFacts(namespace, submitted.imageIngestId)
    if (image.status !== 'WAITING_USER') fail(String(image.errorCode || 'I10_GZ06_IMAGE_INGEST_FAILED'))
    const ocr = image.recognitionBranches?.ocr
    if (image.controllerInvocation?.invocation !== 'REAL' || !Array.isArray(image.facts) || image.facts.length === 0
      || ocr?.status !== 'SUCCEEDED' || !ocr?.engine || Number(ocr?.processedImageCount) !== 1) fail('I10_GZ06_IMAGE_FACTS_NOT_READY')
    phase = 'CONFIRM_IMAGE_FACTS'
    const confirmed = await post('/v1/i10/images:decide', {
      namespace, idempotencyKey: `gz06-image-confirm-${crypto.randomUUID()}`,
      imageIngestId: submitted.imageIngestId, expectedVersion: image.version,
      confirmationRef: `gz06-image-confirm-${crypto.randomUUID()}`,
      decisions: image.facts.map(fact => ({ factId: fact.factId, decision: 'CONFIRM' }))
    })
    if (confirmed.status !== 'CONFIRMED' || confirmed.purgeStatus !== 'PURGED') fail('I10_GZ06_IMAGE_CONFIRM_OR_PURGE_FAILED')
    phase = 'WRITE_EVIDENCE'
    const evidence = {
      schemaVersion: 'hengzhun-i10-gz06-account-ownership-image-evidence-v1', mock: false, degraded: false, status: 'PASSED',
      case: 'ACCOUNT_OWNERSHIP', input: { naturalLanguage: true, controlledFlowiseAttachment: true, screenshotSha256: sourceSha256 },
      imageIngestId: submitted.imageIngestId,
      ocr: { status: ocr.status, engine: ocr.engine, recognizedRegionCount: ocr.recognizedRegionCount, processedImageCount: ocr.processedImageCount },
      controller: { invocation: image.controllerInvocation.invocation, provider: image.controllerInvocation.provider, model: image.controllerInvocation.model },
      facts: safeFacts(image.facts), confirmation: { status: confirmed.status, purgeStatus: confirmed.purgeStatus, deletedImageCount: confirmed.deletedImageCount },
      completedAt: new Date().toISOString()
    }
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } finally {
    credential.username = ''; credential.password = ''
    // A successful image decision owns the purge.  Remove an incomplete local
    // test attachment on failure so no source image is retained by this probe.
    if (fs.existsSync(attachmentDirectory)) fs.rmSync(attachmentDirectory, { recursive: true, force: true })
  }
}
main().catch(error => {
  const failure = { schemaVersion: 'hengzhun-i10-gz06-account-ownership-image-evidence-v1', mock: false, degraded: false, status: 'FAILED', failurePhase: phase, errorCode: String(error?.code || 'I10_GZ06_IMAGE_FAILED').replace(/[^A-Z0-9_]/g, '_').slice(0, 160), completedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, `${JSON.stringify(failure, null, 2)}\n`)
  process.stderr.write(`${JSON.stringify(failure)}\n`)
  process.exitCode = 2
})
