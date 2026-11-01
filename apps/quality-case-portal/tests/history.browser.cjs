'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const test = require('node:test')
const { application, listen, ns, token, productRoot } = require('../../../platform/hengzhun-regression-system/scripts/verification/workbench-test-fixture.cjs')
const { WorkbenchRepository } = require('../../../platform/hengzhun-regression-system/dist/harness/src/workbench-repository.js')
const repoRoot = path.resolve(productRoot, '../..')
const { chromium } = createRequire(path.join(repoRoot, 'tests/e2e/frontend-quality-platform/package.json'))('playwright')
const load = file => import(pathToFileURL(path.join(productRoot, file)).href)
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const output = process.env.HENGZHUN_WORKBENCH_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'rf068-s2-browser-'))
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

test('History: real MCP/Harness persistence, create once, both cursors, races, read failures, namespace and zero dispatch', { timeout: 90000 }, async t => {
  fs.mkdirSync(output, { recursive: true })
  let browser, web, metadata, child
  t.after(async () => {
    await browser?.close()
    if (web) await web.close(); else await metadata?.close()
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill() })
  })
  const f = await application(t)
  const reserved = await listen((_request, response) => response.end())
  await new Promise(resolve => reserved.server.close(resolve))
  child = spawn(process.execPath, [path.join(productRoot, 'mcp/src/server.cjs')], { cwd: productRoot,
    env: { NODE_ENV: 'test', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      HENGZHUN_HARNESS_URL: f.url, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: 'isolated-history-mcp-token-32-characters',
      HENGZHUN_NAMESPACE: ns, HENGZHUN_MCP_PORT: new URL(reserved.url).port }, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('HISTORY_TEST_MCP_START_FAILED')), 10000)
    child.once('error', error => { clearTimeout(deadline); reject(error) })
    child.once('exit', () => { clearTimeout(deadline); reject(new Error('HISTORY_TEST_MCP_EXITED')) })
    let text = ''
    child.stdout.on('data', bytes => { text += bytes.toString(); if (text.includes('listening on')) { clearTimeout(deadline); resolve() } })
  })
  const { connectWorkbenchMetadata } = await load('agent-cli/src/workbench-metadata.mjs')
  metadata = await connectWorkbenchMetadata({ url: `${reserved.url}/mcp`, token: 'isolated-history-mcp-token-32-characters' })
  const { createWorkbenchApplication } = await load('agent-cli/src/workbench-application.mjs')
  const { startWorkbenchServer } = await load('agent-cli/src/workbench-server.mjs')
  let serviceCalls = 0, keyReads = 0
  const workbench = createWorkbenchApplication({ metadata, namespace: ns,
    identityFor: () => { throw new Error('HISTORY_MUST_NOT_BIND_A_NEW_TASK') },
    readiness: () => { throw new Error('HISTORY_MUST_NOT_PROBE_MODELS') },
    keyStore: { get: () => { keyReads++; throw new Error('HISTORY_MUST_NOT_READ_KEYS') } },
    serviceFor: () => { serviceCalls++; throw new Error('HISTORY_MUST_NOT_EXECUTE') } })
  web = await startWorkbenchServer({ port: 0, staticRoot: path.join(repoRoot, 'apps/quality-case-portal/dist-agent'), workbench })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
  const page = await context.newPage(), requests = [], pageErrors = [], consoleErrors = [], warnings = []
  let injectingFault = false
  page.on('request', request => requests.push({ method: request.method(), path: new URL(request.url()).pathname }))
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !(injectingFault && message.text().startsWith('Failed to load resource:'))) consoleErrors.push(message.text())
    if (message.type() === 'warning') warnings.push(message.text())
  })
  const go = async id => {
    await page.goto(`${web.origin}/agent/${id ? `conversations/${id}` : ''}`)
    await page.getByTestId('connection-status').filter({ hasText: '尚未就绪' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
  }
  const searchFor = async value => { await page.getByLabel('搜索历史对话').fill(value); await page.getByLabel('搜索历史对话').press('Enter') }
  const counts = () => f.app.database.read(db => ({ turns: db.prepare('SELECT count(*) n FROM workbench_turns').get().n,
    runs: db.prepare('SELECT count(*) n FROM runs').get().n, conversations: db.prepare('SELECT count(*) n FROM workbench_conversations WHERE namespace=?').get(ns).n }))
  await go()
  await page.getByText('还没有历史会话。', { exact: true }).waitFor()
  assert.equal(await page.title(), '衡准 Agent')
  const createGate = deferred(), createSeen = deferred()
  let creations = 0
  let pendingHistoryLength
  await page.route('**/api/agent/v1/conversations', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    creations++
    const response = await route.fetch(); createSeen.resolve(); await createGate.promise; await route.fulfill({ response })
  })
  try {
    await page.getByRole('button', { name: '新对话', exact: true }).dblclick()
    await createSeen.promise
    assert.equal(creations, 1); assert.equal(counts().turns, 0); assert.equal(counts().runs, 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '展开侧栏' }).click()
    assert.equal(await page.getByRole('button', { name: '新对话', exact: true }).isDisabled(), true)
    await page.getByRole('link', { name: /新对话/ }).click()
    await page.getByText('空会话已登记。尚未提交目标，也未启动测试。', { exact: true }).waitFor()
    pendingHistoryLength = await page.evaluate(() => history.length)
  } finally { createGate.resolve() }
  await page.waitForURL(/\/agent\/conversations\/[a-f0-9-]+$/)
  const createdId = page.url().split('/').pop()
  await page.getByText('空会话已登记。尚未提交目标，也未启动测试。', { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.hz-agent__sidebar-actions > button').getAttribute('aria-busy') === 'false')
  assert.equal(await page.evaluate(() => history.length), pendingHistoryLength, 'a stale create response must not navigate again after a viewport change and selection')
  await page.setViewportSize({ width: 1440, height: 1000 })
  assert.equal(counts().conversations, 1)
  await page.unroute('**/api/agent/v1/conversations')

  // Synthetic histories use the actual metadata writer, never the preserved database or browser seed code.
  for (let i = 0; i < 32; i++) await metadata.call('conversation_create', { conversationId: randomUUID(), title: i === 0 ? '合成检索标记' : `合成只读案例 ${String(i).padStart(2, '0')}` })
  const modelId = randomUUID()
  await metadata.call('model_save', { modelId, expectedVersion: 0, displayName: '历史测试元数据', model: 'test-process-history-only', baseUrl: 'https://model.invalid/v1', keyRef: `modelkey_${randomUUID()}` })
  const longAnswer = '<业务结果>\n' + '完整历史正文：账户查询仅为合成历史，不启动银行业务。'.repeat(400)
  async function history(title, total, answer, status = 'COMPLETED') {
    const conversationId = randomUUID(), messages = []
    await metadata.call('conversation_create', { conversationId, title })
    for (let i = 0; i < total; i++) {
      const text = i === 0 ? title : `合成甲会话第${i}条目标，仅回读历史。`
      const { turn } = await metadata.call('turn_submit', { conversationId, submissionId: randomUUID(), input: text,
        modelProfileId: modelId, modelProfileVersion: 1, releaseIdentityHash: 'a'.repeat(64) })
      messages.push({ id: turn.inputMessageId, text })
      const updated = await metadata.call('turn_update', { turnId: turn.id, expectedVersion: turn.version, status,
        answer: i === total - 1 ? answer : `合成甲会话第${i}条回复，尚未声明测试通过。`, humanInterventionRequired: status !== 'COMPLETED',
        event: { type: status, summary: '测试进程建立的只读历史，不含真实执行。' } })
      const detail = await metadata.call('conversation_get', { conversationId, limit: 2 })
      messages.push({ id: detail.messages.find(message => message.role === 'assistant').id, text: updated.answer })
    }
    return { id: conversationId, messages }
  }
  const a = await history('同名回归', 12, longAnswer)
  const b = await history('同名回归', 1, '合成乙会话：打开账户页核对余额。此为已登记回复，不是银行测试通过。')
  await history('合成缺少目标', 1, '请补充目标页面及业务描述。', 'NEEDS_INPUT')
  const pendingId = randomUUID()
  await metadata.call('conversation_create', { conversationId: pendingId, title: '合成运行记录' })
  await metadata.call('turn_submit', { conversationId: pendingId, submissionId: randomUUID(), input: '合成运行记录', modelProfileId: modelId, modelProfileVersion: 1, releaseIdentityHash: 'a'.repeat(64) })
  const foreignId = randomUUID(), repo = new WorkbenchRepository(f.app.database)
  await repo.execute('workbench_conversation_create', 'other-history-namespace', { conversationId: foreignId, title: '不可见的外部工作区记录' })
  const before = counts()

  await searchFor('')
  await page.getByTestId(`conversation-${a.id}`).waitFor()
  await page.getByRole('button', { name: '加载更多会话' }).click()
  await page.getByTestId(`conversation-${createdId}`).waitFor()
  assert.equal(await page.locator('.hz-agent__history-row').count(), before.conversations)
  assert.equal(await page.getByText('不可见的外部工作区记录', { exact: true }).count(), 0)
  await searchFor('找不到的合成查询')
  await page.getByText('没有匹配的历史会话。', { exact: true }).waitFor()
  await searchFor('同名回归')
  await page.getByTestId(`conversation-${a.id}`).waitFor()
  assert.equal(await page.locator('.hz-agent__history-row').count(), 2)
  await page.getByTestId(`conversation-${a.id}`).click()
  await page.locator(`[data-testid="message-${a.messages.at(-1).id}"] > .hz-agent__message-body > p`).waitFor()
  assert.equal(await page.locator(`[data-testid="message-${a.messages.at(-1).id}"] .hz-agent__message-body > p`).textContent(), longAnswer)
  const oldIds = await page.locator('.hz-agent__message').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')))
  const older = page.getByRole('button', { name: '加载更早消息', exact: true })
  await older.scrollIntoViewIfNeeded()
  const anchor = page.getByTestId(oldIds[0]), anchorTop = (await anchor.boundingBox()).y
  await older.click()
  await page.getByTestId(`message-${a.messages[0].id}`).waitFor()
  assert.equal(await page.locator('.hz-agent__message').count(), a.messages.length)
  const anchorAfter = (await anchor.boundingBox()).y
  if (Math.abs(anchorAfter - anchorTop) > 1) {
    console.log(JSON.stringify({ anchorTop, anchorAfter, scroll: await page.getByTestId('conversation-messages').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight })) }))
    await page.screenshot({ path: path.join(output, 'history-scroll-failure.png'), fullPage: true })
  }
  assert.ok(Math.abs(anchorAfter - anchorTop) <= 1, 'prepending must preserve the reading position')
  assert.deepEqual(await page.locator('.hz-agent__message').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid'))), a.messages.map(message => `message-${message.id}`))
  await page.getByTestId(`conversation-${b.id}`).click()
  await page.getByText(b.messages[1].text, { exact: true }).waitFor()
  await page.goBack(); await page.getByTestId(`message-${a.messages.at(-1).id}`).waitFor()
  await page.goForward(); await page.getByText(b.messages[1].text, { exact: true }).waitFor()
  await page.reload(); await page.getByText(b.messages[1].text, { exact: true }).waitFor()
  assert.equal(await page.getByTestId('conversation-status').textContent(), '已完成')
  assert.equal(await page.getByTestId('connection-status').textContent(), '尚未就绪')
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
  assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(warnings, [])

  // Delay real responses, not fabricated history, and prove stale reads cannot overwrite a newer selection.
  async function delayedRead(pattern, action, switchTo, assertCurrent) {
    const seen = deferred(), gate = deferred(), delivered = deferred()
    let intercepted = false
    await page.route(pattern, async route => { if (intercepted) return route.continue(); intercepted = true; const response = await route.fetch(); seen.resolve(); await gate.promise; await route.fulfill({ response }); delivered.resolve() })
    console.log(`HISTORY_DELAY_BEGIN ${pattern.replace(/[a-f0-9-]{36}/g, 'conversation-id')}`)
    try { await action(); await seen.promise; await switchTo() } finally { gate.resolve() }
    await delivered.promise; await settle(page); await assertCurrent(); await page.unroute(pattern)
    console.log('HISTORY_DELAY_DONE')
  }
  await delayedRead(`**/api/agent/v1/conversations/${a.id}?limit=20`, () => page.getByTestId(`conversation-${a.id}`).click(),
    async () => { await page.getByTestId(`conversation-${b.id}`).click(); await page.getByText(b.messages[1].text, { exact: true }).waitFor() },
    async () => { assert.equal(await page.getByText(b.messages[1].text, { exact: true }).count(), 1); assert.equal(await page.getByTestId(`message-${a.messages.at(-1).id}`).count(), 0) })
  await delayedRead(`**/api/agent/v1/conversations/${a.id}?before=*`, async () => {
    await page.getByTestId(`conversation-${a.id}`).click(); await page.getByTestId(`message-${a.messages.at(-1).id}`).waitFor(); await page.getByRole('button', { name: '加载更早消息', exact: true }).click()
  }, async () => { await page.getByTestId(`conversation-${b.id}`).click(); await page.getByText(b.messages[1].text, { exact: true }).waitFor() },
  async () => assert.equal(await page.locator('.hz-agent__message').count(), 2))
  await delayedRead('**/api/agent/v1/conversations?q=%E5%90%8C%E5%90%8D%E5%9B%9E%E5%BD%92*', () => searchFor('同名回归'),
    async () => { await searchFor('合成检索标记'); await page.getByRole('link', { name: /合成检索标记/ }).waitFor() },
    async () => assert.equal(await page.locator('.hz-agent__history-row').count(), 1))

  injectingFault = true
  await searchFor('')
  await page.getByTestId(`conversation-${b.id}`).waitFor()
  let listFailures = 0
  await page.route('**/api/agent/v1/conversations?limit=30', route => { listFailures++; return route.fulfill({ status: 503, json: { code: 'AGENT_METADATA_UNAVAILABLE' } }) })
  await searchFor(''); await page.getByText('历史读取失败，已读记录保留。', { exact: true }).waitFor()
  assert.equal(listFailures, 1); assert.equal(await page.getByTestId(`conversation-${b.id}`).count(), 1)
  await page.unroute('**/api/agent/v1/conversations?limit=30')
  await page.getByRole('button', { name: '重新读取历史', exact: true }).click()
  await page.getByText('历史读取失败，已读记录保留。', { exact: true }).waitFor({ state: 'hidden' })
  let messageFailures = 0
  await page.route(`**/api/agent/v1/conversations/${b.id}?limit=20`, route => { messageFailures++; return route.fulfill({ status: 503, json: { code: 'AGENT_METADATA_UNAVAILABLE' } }) })
  await page.getByRole('button', { name: '重新读取会话', exact: true }).click()
  await page.getByText('会话读取失败，已读正文保留。', { exact: true }).waitFor()
  assert.equal(messageFailures, 1); assert.equal(await page.getByText(b.messages[1].text, { exact: true }).count(), 1)
  await page.unroute(`**/api/agent/v1/conversations/${b.id}?limit=20`)
  await page.getByRole('button', { name: '重新读取会话', exact: true }).click()
  await page.getByText('会话读取失败，已读正文保留。', { exact: true }).waitFor({ state: 'hidden' })
  for (const id of [randomUUID(), foreignId]) { await go(id); await page.getByText('会话不存在，或当前工作区无权访问。', { exact: true }).waitFor() }

  await go(b.id)
  await page.getByText(b.messages[1].text, { exact: true }).waitFor()
  await page.getByTestId(`conversation-${b.id}`).waitFor()
  assert.equal(await page.locator('img').evaluateAll(images => images.filter(image => image.checkVisibility()).every(image => image.complete && image.naturalWidth > 0)), true)
  const typography = await page.locator('.hz-agent__history-row span, .hz-agent__history-row time, .hz-agent__search input, .hz-agent__message-body > p, .hz-agent__message-meta time, .hz-agent__history-readonly').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node)
    return { size: style.fontSize, weight: style.fontWeight, line: style.lineHeight }
  }))
  assert.deepEqual(typography.filter(style => style.size !== '14px' || style.weight !== '400' || style.line !== '22px'), [])
  const geometry = await page.evaluate(() => ({ sidebar: document.querySelector('.hz-agent__sidebar').getBoundingClientRect().width,
    composer: document.querySelector('.hz-agent__composer-column').getBoundingClientRect().width,
    row: document.querySelector('.hz-agent__history-row').getBoundingClientRect().height,
    primary: getComputedStyle(document.querySelector('.hz-agent__sidebar-actions .ant-btn-primary')).backgroundColor,
    sidebarNoOverlap: document.querySelector('.hz-agent__history').getBoundingClientRect().bottom <= document.querySelector('.hz-agent__sidebar-footer').getBoundingClientRect().top }))
  assert.deepEqual(geometry, { sidebar: 248, composer: 832, row: 72, primary: 'rgb(166, 25, 46)', sidebarNoOverlap: true })
  await page.screenshot({ path: path.join(output, 'history-desktop.png'), fullPage: true })
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
  const mobile = await fresh.newPage()
  await mobile.goto(`${web.origin}/agent/conversations/${b.id}`)
  await mobile.getByText(b.messages[1].text, { exact: true }).waitFor(); await mobile.evaluate(() => document.fonts.ready)
  assert.equal(await mobile.evaluate(() => localStorage.length + sessionStorage.length), 0)
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await mobile.screenshot({ path: path.join(output, 'history-narrow.png'), fullPage: true })
  await mobile.getByRole('button', { name: '展开侧栏' }).click()
  await mobile.getByLabel('搜索历史对话').fill('同名回归'); await mobile.getByLabel('搜索历史对话').press('Enter')
  await mobile.getByTestId(`conversation-${a.id}`).waitFor()
  await mobile.waitForFunction(() => Math.abs(document.querySelector('.ant-drawer-content-wrapper').getBoundingClientRect().left) < .1)
  await mobile.screenshot({ path: path.join(output, 'history-narrow-sidebar.png'), fullPage: true })
  await mobile.getByTestId(`conversation-${a.id}`).click(); await mobile.getByTestId(`message-${a.messages.at(-1).id}`).waitFor()
  await mobile.getByRole('button', { name: '展开侧栏' }).waitFor()
  assert.equal(await mobile.getByRole('button', { name: '发送目标' }).isDisabled(), true)

  assert.equal(requests.filter(request => request.method !== 'GET').length, 1)
  assert.equal(counts().turns, before.turns); assert.equal(counts().runs, 0); assert.equal(counts().conversations, before.conversations)
  assert.equal(serviceCalls, 0); assert.equal(keyReads, 0)
  assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(warnings, [])
  fs.writeFileSync(path.join(output, 'history.json'), JSON.stringify({ scope: 'ISOLATED_BROWSER_MCP_SQLITE', before, after: counts(),
    historyRows: before.conversations, completeMessages: a.messages.length, sourceIdentityForHistory: 'a'.repeat(64),
    currentBootstrap: 'NOT_READY', serviceCalls, keyReads, executionPosts: 0, createPosts: creations, pageErrors, consoleErrors, warnings,
    viewport: [1440, 1000], narrowViewport: [390, 844], geometry, typography, originalServicesTouched: false, live: false }, null, 2))
  console.log(`HISTORY_BROWSER=PASS output=${output} dispatches=${serviceCalls} runs=0`)
})
