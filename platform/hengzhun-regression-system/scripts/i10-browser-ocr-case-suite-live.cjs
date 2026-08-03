#!/usr/bin/env node
'use strict'

// Browser-level acceptance for the remaining dual-path plan cases.  Every
// scenario uses the local DPAPI credential only in memory, captures a masked
// page image, and sends that image through the same controlled attachment +
// OCR + controller-fact-confirmation contract used by the Flowise workflow.
// This script intentionally reports browser functionality and attachment/OCR
// functionality separately: it does not pretend that an Agentflow chat or a
// generated Playwright candidate was exercised merely because the page works.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('../runtime/node_modules/playwright')

const root = path.resolve(__dirname, '..')
const scenarioPath = path.join(root, '.data', 'tests', 'i10-stage8-live', 'scenario.json')
const suiteRoot = path.join(root, '.data', 'acceptance', 'browser-ocr-dual-path')
const evidencePath = path.join(root, '.data', 'evidence', 'i10', 'browser-ocr-case-suite', 'result.json')
let phase = 'STARTUP'

function fail(code) { const error = new Error(code); error.code = code; throw error }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function loadRuntimeEnvironment() {
  const source = path.join(root, '.data', 'runtime.env')
  if (!fs.existsSync(source)) fail('I10_CASE_SUITE_RUNTIME_ENV_MISSING')
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
  if (!response.ok) { const error = new Error(String(value?.errorCode || `HTTP_${response.status}`)); error.code = error.message; throw error }
  return value
}
async function resolveCredential() {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
  const credentialRef = String(scenario.credentialRef || '')
  if (!/^credential_[0-9a-f-]{36}$/i.test(credentialRef)) fail('I10_CASE_SUITE_CREDENTIAL_REF_MISSING')
  const value = await post('/internal/worker/i10/credentials:resolve', { namespace: 'hengzhun-local', credentialRef }, process.env.HENGZHUN_WORKER_TOKEN)
  if (!value?.username || !value?.password) fail('I10_CASE_SUITE_CREDENTIAL_RESOLVE_FAILED')
  return { credentialRef, username: value.username, password: value.password }
}
async function waitForFacts(namespace, imageIngestId) {
  const deadline = Date.now() + 4 * 60_000
  while (Date.now() < deadline) {
    const value = await post('/v1/i10/images:get', { namespace, imageIngestId })
    if (value.status === 'WAITING_USER' || value.status === 'FAILED') return value
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  fail('I10_CASE_SUITE_IMAGE_OCR_TIMEOUT')
}
function maskedScreenshotTargets(page, caseId) {
  const selectors = {
    L1: ['.profile-card, .profile-information, [data-testid="customer-profile-name"]'],
    L2: ['.customer-table-card table', '[data-testid="customer-profile-name"]'],
    L3: ['.message-list', '[data-testid="customer-profile-name"]'],
    M1: ['.account-transactions, .bank-table table', '[data-testid="customer-profile-name"]'],
    M2: ['.customer-table-card table', '[data-testid="customer-profile-name"]'],
    M3: ['.customer-table-card table', '[data-testid="customer-profile-name"]'],
    H1: ['[data-testid="customer-profile-name"]'],
    H2: ['[data-testid="customer-profile-name"]'],
    H3: ['[data-testid="order-query-page"]', '[data-testid="customer-profile-name"]']
  }[caseId] || []
  return selectors.map(selector => page.locator(selector).first()).filter(locator => locator)
}
async function submitMaskedAttachment({ caseId, description, screenshotPath }) {
  const bytes = fs.readFileSync(screenshotPath)
  const attachmentRef = `i10-${caseId.toLowerCase()}-${crypto.randomUUID()}`
  const attachmentDir = path.join(root, '.data', 'flowise-attachments', attachmentRef)
  const attachmentPath = path.join(attachmentDir, path.basename(screenshotPath))
  const namespace = `i10-browser-${caseId.toLowerCase()}-${Date.now()}`
  fs.mkdirSync(attachmentDir, { recursive: true })
  fs.copyFileSync(screenshotPath, attachmentPath)
  let terminal = false
  try {
    const submitted = await post('/v1/i10/images:submit', {
      namespace, idempotencyKey: `browser-${caseId}-${crypto.randomUUID()}`,
      sourceRef: `browser-dual-path-${caseId}`, primaryInputType: 'NATURAL_LANGUAGE',
      primaryText: description,
      images: [{ flowiseFileRef: attachmentRef, originalFilename: path.basename(screenshotPath), purposeHint: `已脱敏的${caseId}浏览器关键页面截图；只提取页面标题、导航、按钮和状态标签，不保留原图。` }]
    })
    const image = await waitForFacts(namespace, submitted.imageIngestId)
    const ocr = image.recognitionBranches?.ocr
    if (image.status !== 'WAITING_USER' || image.controllerInvocation?.invocation !== 'REAL' || ocr?.status !== 'SUCCEEDED' || Number(ocr?.processedImageCount) !== 1) fail('I10_CASE_SUITE_OCR_FACTS_NOT_READY')
    const confirmed = await post('/v1/i10/images:decide', {
      namespace, idempotencyKey: `browser-${caseId}-confirm-${crypto.randomUUID()}`,
      imageIngestId: submitted.imageIngestId, expectedVersion: image.version,
      confirmationRef: `browser-${caseId}-confirm-${crypto.randomUUID()}`,
      decisions: (image.facts || []).map(fact => ({ factId: fact.factId, decision: 'CONFIRM' }))
    })
    if (confirmed.status !== 'CONFIRMED' || confirmed.purgeStatus !== 'PURGED') fail('I10_CASE_SUITE_OCR_PURGE_FAILED')
    terminal = true
    return {
      status: 'PASSED', screenshotSha256: sha256(bytes), imageIngestId: submitted.imageIngestId,
      ocrEngine: String(ocr.engine || ''), recognizedRegionCount: Number(ocr.recognizedRegionCount || 0),
      factCount: Array.isArray(image.facts) ? image.facts.length : 0, purgeStatus: confirmed.purgeStatus
    }
  } finally {
    // The Worker claims images asynchronously.  On a timeout/failure leave the
    // controlled attachment in place so it can produce a truthful terminal
    // result instead of failing later with ATTACHMENT_NOT_FOUND.  A confirmed
    // image has already been purged by the product, so its test copy is safe to
    // remove here.
    if (terminal) fs.rmSync(attachmentDir, { recursive: true, force: true })
  }
}
async function chooseFirst(page, testId, emptyCode = 'I10_CASE_SUITE_SELECT_OPTIONS_EMPTY') {
  const control = page.getByTestId(testId)
  const deadline = Date.now() + 30_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const selector = control.locator('.ant-select-selector')
      await (await selector.count() ? selector : control).click({ timeout: 5_000 })
      const option = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled)').first()
      await option.waitFor({ state: 'visible', timeout: 3_000 })
      await option.click({ timeout: 5_000 })
      return
    } catch (error) {
      lastError = error
      await page.waitForTimeout(500)
    }
  }
  // The error code remains semantic and does not expose a page dump, selected
  // account, or customer data.  It distinguishes an empty controlled fixture
  // from a slow Ant Design option list.
  if (lastError) fail(`${emptyCode}_OR_OPTION_LIST_TIMEOUT`)
  fail(emptyCode)
}
async function waitForSettledPage(page, selector) {
  await page.waitForFunction(target => {
    const node = document.querySelector(target)
    return Boolean(node && node.getAttribute('data-view-state') !== 'LOADING')
  }, selector, { timeout: 30_000 })
  const state = await page.locator(selector).getAttribute('data-view-state')
  if (state === 'ERROR') fail('I10_CASE_SUITE_PAGE_DATA_ERROR')
  return state
}
async function runCase(page, caseId, base) {
  const result = { caseId, naturalLanguage: '', browser: { status: 'FAILED' }, ocr: { status: 'NOT_RUN' }, scope: 'BROWSER_AND_CONTROLLED_ATTACHMENT_ONLY' }
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(String(error?.message || 'PAGE_ERROR').replace(/[^A-Z0-9_.:-]/gi, '_').slice(0, 160)))
  const outputDir = path.join(suiteRoot, caseId)
  const screenshotPath = path.join(outputDir, `${caseId}-masked.png`)
  fs.mkdirSync(outputDir, { recursive: true })
  try {
    if (caseId === 'L1') {
      result.naturalLanguage = '打开复兴银行门户，使用已保存的安全凭据登录，进入个人资料页面，确认主页与个人资料页的姓名和头像一致。'
      const headerName = await page.getByTestId('customer-profile-name').innerText()
      const headerAvatar = await page.getByTestId('customer-profile-avatar').innerText()
      await page.getByRole('link', { name: '个人资料', exact: true }).click(); await page.getByRole('heading', { name: '个人资料' }).waitFor()
      const profile = page.getByTestId('profile-display-name')
      await profile.waitFor({ state: 'visible', timeout: 30_000 })
      const profileText = await profile.innerText()
      if (!headerName.trim() || !headerAvatar.trim() || !profileText.includes(headerName.trim())) fail('I10_CASE_SUITE_PROFILE_IDENTITY_MISMATCH')
    } else if (caseId === 'L2') {
      result.naturalLanguage = '登录复兴银行门户，打开账户页面，确认账户卡片、余额和账户状态正常显示。'
      await page.getByRole('link', { name: '账户', exact: true }).click(); await page.getByRole('heading', { name: '账户列表' }).waitFor(); await waitForSettledPage(page, 'section[data-view-state]')
      if (await page.locator('.customer-table-card tbody tr').count() < 1) fail('I10_CASE_SUITE_ACCOUNT_LIST_EMPTY')
    } else if (caseId === 'L3') {
      result.naturalLanguage = '登录复兴银行门户，打开消息页面，确认消息列表、未读标识和消息摘要正常显示。'
      await page.getByRole('link', { name: '消息', exact: true }).click(); await page.getByRole('heading', { name: '消息中心' }).waitFor(); await waitForSettledPage(page, 'section[data-view-state]')
      // L3 validates the visible message state.  The Ant Design select's
      // label itself is not an actionable option until its popup is opened,
      // and filtering is not part of the stated L3 acceptance condition.
      await page.getByPlaceholder('搜索消息标题或内容').fill('')
      if (await page.locator('.message-list button').count() < 1) fail('I10_CASE_SUITE_MESSAGE_LIST_EMPTY')
    } else if (caseId === 'M1') {
      result.naturalLanguage = '登录复兴银行门户，进入账户明细，筛选近期交易，确认交易日期、金额和状态可读。'
      await page.getByRole('link', { name: '账户', exact: true }).click(); const accountDetailResponse = page.waitForResponse(response => response.request().method() === 'GET' && /\/api\/customer\/v1\/accounts\/[^/]+$/.test(new URL(response.url()).pathname), { timeout: 30_000 }); await page.getByRole('button', { name: '查看', exact: true }).first().click()
      const accountApi = await accountDetailResponse
      if (!accountApi.ok()) fail(`I10_CASE_SUITE_ACCOUNT_DETAIL_API_${accountApi.status()}`)
      const accountPayload = await accountApi.json().catch(() => null)
      if (!accountPayload || typeof accountPayload !== 'object') fail('I10_CASE_SUITE_ACCOUNT_DETAIL_PAYLOAD_INVALID')
      if (!Array.isArray(accountPayload.transactions)) fail('I10_CASE_SUITE_ACCOUNT_DETAIL_TRANSACTIONS_SHAPE_INVALID')
      await page.waitForURL(/\/portal\/accounts\//, { timeout: 30_000 })
      const accountDetail = page.locator('section.account-detail')
      const accountLoadError = page.locator('.ant-alert-error')
      let accountState
      try {
        accountState = await Promise.any([
          accountDetail.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'DETAIL'),
          accountLoadError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'ERROR')
        ])
      } catch (_) {
        const bodyText = await page.locator('body').innerText().catch(() => '')
        if (bodyText.includes('账户详情加载失败')) fail('I10_CASE_SUITE_ACCOUNT_DETAIL_PAGE_ERROR')
        if (bodyText.includes('正在读取账户信息')) fail('I10_CASE_SUITE_ACCOUNT_DETAIL_LOAD_TIMEOUT')
        fail('I10_CASE_SUITE_ACCOUNT_DETAIL_RENDER_MISSING')
      }
      if (accountState === 'ERROR') fail('I10_CASE_SUITE_ACCOUNT_DETAIL_PAGE_ERROR')
      await waitForSettledPage(page, 'section.account-detail'); await page.getByRole('tab', { name: '交易记录' }).click()
      if (await page.locator('.account-transactions tbody tr').count() < 1) fail('I10_CASE_SUITE_TRANSACTION_LIST_EMPTY')
      await page.getByTestId('account-transaction-type-filter').click()
      await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: '转入' }).click()
      if (await page.locator('.account-transactions tbody tr').count() < 1) fail('I10_CASE_SUITE_TRANSACTION_FILTER_EMPTY')
      await page.getByTestId('account-transaction-filter-reset').click()
    } else if (caseId === 'M2') {
      result.naturalLanguage = '登录复兴银行门户，进入收款人页面，查看收款人列表，确认姓名、账户掩码和状态展示正确。'
      await page.getByRole('link', { name: '收款人', exact: true }).click(); await page.getByRole('heading', { name: '收款人管理' }).waitFor(); await waitForSettledPage(page, 'section[data-view-state]')
      if (await page.locator('.customer-table-card tbody tr').count() < 1) fail('I10_CASE_SUITE_BENEFICIARY_LIST_EMPTY')
      const beneficiaryName = await page.locator('.customer-table-card tbody tr td').first().innerText()
      await page.getByTestId('beneficiary-search').fill(beneficiaryName)
      if (await page.locator('.customer-table-card tbody tr').count() !== 1) fail('I10_CASE_SUITE_BENEFICIARY_FILTER_FAILED')
    } else if (caseId === 'M3') {
      result.naturalLanguage = '登录复兴银行门户，进入文档页面，查询一份文档并确认标题、日期和下载入口正确。'
      await page.getByRole('link', { name: '文档', exact: true }).click(); await page.getByRole('heading', { name: '文档' }).waitFor(); await waitForSettledPage(page, 'section[data-view-state]')
      if (await page.locator('.customer-table-card tbody tr').count() < 1 || await page.locator('.customer-table-card a[download]').count() < 1) fail('I10_CASE_SUITE_DOCUMENT_LIST_OR_DOWNLOAD_MISSING')
    } else if (['H1', 'H2', 'H3'].includes(caseId)) {
      result.naturalLanguage = caseId === 'H1'
        ? '登录复兴银行门户，创建一笔演示转账并完成首次确认，确认系统进入预期的验证或单号查询流程。'
        : caseId === 'H2'
          ? '登录复兴银行门户，创建一笔演示转账；若进入网页U盾验证页则完成验证，若直接进入单号查询页则确认已自动跳过验证。'
          : '登录复兴银行门户，完成一笔演示转账后按单号查询记录，确认收款信息、金额和状态一致。'
      await page.getByRole('link', { name: '转账', exact: true }).click(); await page.getByTestId('transfer-list-new').click()
      await page.getByTestId('transfer-form').waitFor({ state: 'visible', timeout: 30_000 })
      await chooseFirst(page, 'transfer-source-account', 'I10_CASE_SUITE_SOURCE_ACCOUNT_LIST_EMPTY')
      await chooseFirst(page, 'transfer-beneficiary', 'I10_CASE_SUITE_BENEFICIARY_LIST_EMPTY')
      await page.getByTestId('transfer-amount').fill('1.00'); await page.getByTestId('transfer-description').fill('自动化回归测试')
      await page.getByTestId('transfer-submit').click()
      await page.getByTestId('transfer-review').waitFor({ state: 'visible', timeout: 30_000 })
      const transferResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/customer\/v1\/transfers$/.test(new URL(response.url()).pathname), { timeout: 30_000 })
      await page.getByTestId('transfer-first-confirm').click()
      const transferApi = await transferResponse
      if (!transferApi.ok()) fail(`I10_CASE_SUITE_TRANSFER_CREATE_API_${transferApi.status()}`)
      await page.waitForURL(/\/portal\/(verification|orders\/query)/, { timeout: 30_000 })
      if (caseId === 'H1') {
        if (!/\/portal\/(verification|orders\/query)/.test(new URL(page.url()).pathname)) fail('I10_CASE_SUITE_FIRST_CONFIRM_ROUTE_INVALID')
      } else {
        if (/\/portal\/verification/.test(new URL(page.url()).pathname)) {
          await page.getByTestId('ukey-verify-control').click()
          await page.waitForURL(/\/portal\/orders\/query/, { timeout: 30_000 })
        }
        await page.getByTestId('order-query-page').waitFor({ state: 'visible', timeout: 30_000 })
        if (caseId === 'H3') {
          for (const id of ['transfer-order-number', 'transfer-order-status', 'order-beneficiary', 'order-amount']) {
            if (!(await page.getByTestId(id).innerText()).trim()) fail(`I10_CASE_SUITE_${id.toUpperCase()}_MISSING`)
          }
        }
      }
    } else fail('I10_CASE_SUITE_UNKNOWN_CASE')
    await page.screenshot({ path: screenshotPath, fullPage: true, mask: maskedScreenshotTargets(page, caseId), maskColor: '#202020' })
    result.browser = { status: 'PASSED', finalPath: new URL(page.url()).pathname, screenshotPath: path.relative(root, screenshotPath).replaceAll('\\', '/') }
    try {
      result.ocr = await submitMaskedAttachment({ caseId, description: result.naturalLanguage, screenshotPath })
    } catch (error) {
      result.ocr = { status: 'FAILED', errorCode: String(error?.code || error?.message || 'I10_CASE_SUITE_OCR_FAILED').replace(/[^A-Z0-9_]/gi, '_').slice(0, 160) }
    }
  } catch (error) {
    try {
      await page.screenshot({ path: path.join(outputDir, `${caseId}-failure.png`), fullPage: true, mask: maskedScreenshotTargets(page, caseId), maskColor: '#202020' })
    } catch (_) {}
    result.browser = { status: 'FAILED', errorCode: String(error?.code || error?.message || 'I10_CASE_SUITE_BROWSER_FAILED').replace(/[^A-Z0-9_]/gi, '_').slice(0, 160), ...(pageErrors.length ? { pageError: pageErrors.at(-1) } : {}) }
  }
  return result
}
async function main() {
  phase = 'LOAD_RUNTIME'; loadRuntimeEnvironment()
  phase = 'RESOLVE_CREDENTIAL'; const credential = await resolveCredential()
  const selected = (process.env.I10_CASE_SUITE_CASES || 'L1,L2,L3,M1,M2,M3,H1,H2,H3').split(',').map(value => value.trim()).filter(Boolean)
  const base = String(process.env.HENGZHUN_PORTAL_BASE_URL || 'http://127.0.0.1:18082').replace(/\/$/, '')
  const executablePath = process.env.HENGZHUN_CHROMIUM_EXECUTABLE || path.join(root, 'runtime', 'browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe')
  if (!fs.existsSync(executablePath)) fail('CHROMIUM_UNAVAILABLE')
  phase = 'BROWSER_CASES'
  const browser = await chromium.launch({ executablePath, headless: true })
  const results = []
  try {
    for (const caseId of selected) {
      const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      try {
        await page.goto(`${base}/portal/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.getByTestId('login-username').fill(credential.username); await page.getByTestId('login-password').fill(credential.password); await page.getByTestId('login-submit').click()
        await page.getByTestId('customer-profile-name').waitFor({ state: 'visible', timeout: 30_000 })
        const result = await runCase(page, caseId, base)
        results.push(result)
        const caseEvidencePath = path.join(root, '.data', 'evidence', 'i10', 'browser-ocr-case-suite', 'cases', `${caseId}.json`)
        fs.mkdirSync(path.dirname(caseEvidencePath), { recursive: true })
        fs.writeFileSync(caseEvidencePath, `${JSON.stringify({ schemaVersion: 'hengzhun-i10-browser-ocr-case-evidence-v1', mock: false, degraded: false, ...result, completedAt: new Date().toISOString() }, null, 2)}\n`)
      } finally { await context.close() }
    }
  } finally { await browser.close(); credential.username = ''; credential.password = '' }
  phase = 'WRITE_EVIDENCE'
  const evidence = { schemaVersion: 'hengzhun-i10-browser-ocr-case-suite-evidence-v1', mock: false, degraded: false, status: results.every(item => item.browser.status === 'PASSED' && item.ocr.status === 'PASSED') ? 'PASSED' : 'PARTIAL', results, completedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true }); fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  if (evidence.status !== 'PASSED') process.exitCode = 2
}
main().catch(error => { const value = { schemaVersion: 'hengzhun-i10-browser-ocr-case-suite-evidence-v1', mock: false, degraded: false, status: 'FAILED', failurePhase: phase, errorCode: String(error?.code || error?.message || 'I10_CASE_SUITE_FAILED').replace(/[^A-Z0-9_]/g, '_').slice(0, 160), completedAt: new Date().toISOString() }; fs.mkdirSync(path.dirname(evidencePath), { recursive: true }); fs.writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`); process.stderr.write(`${JSON.stringify(value)}\n`); process.exitCode = 2 })
