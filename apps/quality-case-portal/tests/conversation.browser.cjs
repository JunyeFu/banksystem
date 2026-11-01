'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const test = require('node:test')
const { application, listen, ns, token, productRoot } = require('../../../platform/hengzhun-regression-system/scripts/verification/workbench-test-fixture.cjs')
const repoRoot = path.resolve(productRoot, '../..')
const { chromium } = createRequire(path.join(repoRoot, 'tests/e2e/frontend-quality-platform/package.json'))('playwright')
const load = file => import(pathToFileURL(path.join(productRoot, file)).href)
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const output = process.env.HENGZHUN_WORKBENCH_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'rf068-s3-browser-'))
const release = 'd'.repeat(64)
const successArtifact = `art_${randomUUID()}`, deniedArtifact = `art_${randomUUID()}`
const goal = '目标系统：复兴银行。访问 http://127.0.0.1:18082/portal/login，使用 credential_12345678-1234-4234-8234-123456789abc，登录后只读查询账户。'
const proof = journeyId => ({ verdict: 'VERIFIED', journeyId, releaseIdentityHash: release, runId: 'run_s3_isolated', taskId: 'task_s3_isolated' })

test('Conversation: production HTTP/MCP/SQLite, once-only intent, continuation, events, stop, image and evidence', { timeout: 180000 }, async t => {
  fs.mkdirSync(output, { recursive: true })
  let web, metadata, child, browser
  t.after(async () => {
    await browser?.close()
    if (web) await web.close(); else await metadata?.close()
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill() })
  })
  const f = await application(t), reserved = await listen((_request, response) => response.end())
  await new Promise(resolve => reserved.server.close(resolve))
  const mcpToken = 'isolated-conversation-mcp-token-32-characters'
  child = spawn(process.execPath, [path.join(productRoot, 'mcp/src/server.cjs')], { cwd: productRoot,
    env: { NODE_ENV: 'test', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      HENGZHUN_HARNESS_URL: f.url, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: mcpToken,
      HENGZHUN_NAMESPACE: ns, HENGZHUN_MCP_PORT: new URL(reserved.url).port }, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('CONVERSATION_TEST_MCP_START_FAILED')), 10000)
    child.once('error', error => { clearTimeout(deadline); reject(error) })
    child.once('exit', () => { clearTimeout(deadline); reject(new Error('CONVERSATION_TEST_MCP_EXITED')) })
    let text = ''
    child.stdout.on('data', bytes => { text += bytes.toString(); if (text.includes('listening on')) { clearTimeout(deadline); resolve() } })
  })
  const { connectWorkbenchMetadata } = await load('agent-cli/src/workbench-metadata.mjs')
  metadata = await connectWorkbenchMetadata({ url: `${reserved.url}/mcp`, token: mcpToken })
  const modelId = randomUUID()
  await metadata.call('model_save', { modelId, expectedVersion: 0, displayName: '隔离浏览器模型', model: 'test-process-only-v1', baseUrl: 'https://model.invalid/v1', keyRef: `modelkey_${randomUUID()}` })
  await metadata.call('model_default', { modelId, expectedVersion: 1 })
  const { createWorkbenchApplication } = await load('agent-cli/src/workbench-application.mjs')
  const { startWorkbenchServer } = await load('agent-cli/src/workbench-server.mjs')
  const { WorkbenchError } = await load('agent-cli/src/workbench-http.mjs')
  const { createHarnessAttachmentImporter } = await load('agent-cli/src/production-service.mjs')
  const starts = [], continuations = [], imports = [], artifactRequests = []
  let runningGate, runningEntered
  const attachmentImporter = createHarnessAttachmentImporter({ harnessUrl: f.url, serviceToken: token })
  const bytes = Buffer.from('isolated evidence, no bank result or credential'), digest = createHash('sha256').update(bytes).digest('hex')
  const workbench = createWorkbenchApplication({ metadata, namespace: ns, identityFor: () => release,
    readiness: async () => ({ status: 'READY' }), keyStore: { get: async () => 'synthetic-test-process-key' },
    importAttachment: async input => { imports.push({ filename: Buffer.from(input.nameBase64Url, 'base64url').toString(), size: input.bytes.length }); return attachmentImporter(input) },
    downloadArtifact: async ({ artifactId }) => {
      artifactRequests.push(artifactId)
      if (artifactId === deniedArtifact) throw new WorkbenchError('AGENT_ARTIFACT_QUARANTINED', 403)
      return { bytes, filename: '隔离证据.txt', sha256: digest }
    },
    // Only this test process substitutes model/execution. Product browser code has no fixture branch.
    serviceFor: async config => ({
      async start(input) {
        starts.push({ input, model: config.profile.model, version: config.profile.version })
        if (input.input.includes('等待停止')) {
          await config.observe({ phase: 'STARTED', name: 'bank_readonly_query' }); runningEntered?.resolve()
          await new Promise((resolve, reject) => {
            runningGate = resolve
            input.signal.addEventListener('abort', () => reject(Object.assign(new Error('private interrupted detail'), { code: 'AGENT_TEST_INTERRUPTED' })), { once: true })
          })
        }
        if (input.input.includes('缺金额')) return { status: 'NEEDS_INPUT', question: '请补充收款人与金额；尚未发生资金动作。', journeyId: 'journey_s3_continue', sessionId: 'session-' + 'a'.repeat(32) }
        if (input.input.includes('受控失败')) throw Object.assign(new Error('private model secret must not render'), { code: 'AGENT_ASSERTION_FAILED' })
        if (input.input.includes('分页事件')) for (let i = 0; i < 32; i++) {
          await config.observe({ phase: 'STARTED', name: 'bank_readonly_query' })
          await config.observe({ phase: 'FINISHED', name: 'bank_readonly_query', result: {} })
        }
        return { status: 'COMPLETED', journeyId: `journey_s3_${starts.length}` }
      },
      async continueDirectJourney(input) { continuations.push({ ...input, version: config.profile.version, model: config.profile.model }); return { status: 'COMPLETED', journeyId: input.journeyId } },
      evidenceVerify: async ({ journeyId }) => proof(journeyId),
      evidence: async ({ journeyId }) => ({ schemaVersion: 'hengzhun-cli-evidence-view/v1', journeyId, version: 1, status: 'COMPLETED', terminal: true,
        references: { runId: 'run_s3_isolated', taskId: 'task_s3_isolated' }, artifactCards: [
          { artifactId: successArtifact, displayName: '隔离证据.txt', mediaType: 'text/plain', sha256: digest, size: bytes.length, downloadGrantRequired: true },
          { artifactId: deniedArtifact, displayName: '隔离工件', downloadGrantRequired: true },
        ] }),
    }),
  })
  web = await startWorkbenchServer({ port: 0, staticRoot: path.join(repoRoot, 'apps/quality-case-portal/dist-agent'), workbench })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
  const page = await context.newPage(), requests = [], errors = [], warnings = []
  let fault = false
  page.on('request', request => { const url = new URL(request.url()); requests.push({ method: request.method(), path: url.pathname, query: url.search, body: request.method() === 'POST' && url.pathname.endsWith('/messages') ? request.postDataJSON() : undefined }) })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); if (message.type() === 'error' && !(fault && message.text().startsWith('Failed to load resource:'))) errors.push(message.text()) })
  const go = async id => { await page.goto(`${web.origin}/agent/${id ? `conversations/${id}` : ''}`); await page.getByTestId('connection-status').filter({ hasText: '准备就绪' }).waitFor(); await page.evaluate(() => document.fonts.ready) }
  const input = () => page.getByLabel('测试目标', { exact: true })
  const posts = () => requests.filter(request => request.path.endsWith('/messages') && request.method === 'POST')
  const outcome = text => page.getByTestId(/^outcome-/).last().filter({ hasText: text }).waitFor()
  const countTurns = () => f.app.database.read(db => db.prepare('SELECT count(*) n FROM workbench_turns').get().n)

  // IME Enter and Shift+Enter must not submit. Root submission creates one real conversation.
  await go(); await input().fill('做一次转账。')
  await input().dispatchEvent('compositionstart'); await input().press('Enter'); await input().dispatchEvent('compositionend')
  assert.equal(posts().length, 0)
  await input().press('Shift+Enter'); assert.match(await input().inputValue(), /\n/); assert.equal(posts().length, 0)
  await page.getByRole('button', { name: '发送目标', exact: true }).dblclick()
  await page.waitForURL(/\/agent\/conversations\/[a-f0-9-]+$/)
  await outcome('请补充原任务所需信息')
  const id = page.url().split('/').pop(), first = (await metadata.call('conversation_get', { conversationId: id, limit: 20 })).turns.at(-1)
  assert.equal(posts().length, 1); assert.equal(starts.length, 0); assert.equal(continuations.length, 0)
  assert.match((await workbench.getAgentTurn({ turnId: first.id })).answer, /目标页面地址/)
  await input().fill(goal + ' 缺金额。'); await input().press('Enter'); await outcome('请补充原任务所需信息')
  await page.getByText('请补充收款人与金额；尚未发生资金动作。', { exact: true }).waitFor()
  assert.equal(starts.length, 1); assert.equal(continuations.length, 0)
  // Change default behind the UI; a continuation must still post the original v1.
  await metadata.call('model_save', { modelId, expectedVersion: 1, displayName: '下一任务模型', model: 'test-process-only-v2', baseUrl: 'https://model.invalid/v1', keyRef: `modelkey_${randomUUID()}` })
  await metadata.call('model_default', { modelId, expectedVersion: 2 })
  await page.reload(); await outcome('请补充原任务所需信息')
  await input().fill('收款人为演示账户，金额100元。'); await input().press('Enter'); await outcome('测试通过')
  assert.equal(continuations.length, 1); assert.equal(continuations[0].version, 1); assert.equal(continuations[0].journeyId, 'journey_s3_continue')
  assert.equal(posts().at(-1).body.modelProfileVersion, 1)
  const beforeRefresh = { turns: countTurns(), posts: posts().length, starts: starts.length, continuations: continuations.length }
  await page.reload(); await outcome('测试通过')
  assert.deepEqual({ turns: countTurns(), posts: posts().length, starts: starts.length, continuations: continuations.length }, beforeRefresh)
  const historical = page.getByTestId(`turn-${first.id}`)
  await historical.locator('summary').click()
  await historical.locator('.hz-agent__events li').first().waitFor()
  assert.equal(starts.length, beforeRefresh.starts, 'expanding historical events is read-only')
  await historical.locator('summary').click()

  // A successful HTTP submit with a lost browser response remains unknown until explicit same-ID reconciliation.
  let lost = true; fault = true
  await page.route(`**/api/agent/v1/conversations/${id}/messages`, async route => {
    if (lost) { lost = false; await route.fetch(); return route.abort('failed') }
    return route.continue()
  })
  await input().fill(goal + ' 丢失回执。'); await input().press('Enter')
  await page.getByRole('button', { name: '核对原提交', exact: true }).waitFor()
  const lostRequest = posts().at(-1), beforeReconcile = starts.length
  assert.equal(await page.getByRole('button', { name: '发送目标', exact: true }).isDisabled(), true)
  assert.ok(requests.some(request => request.method === 'GET' && request.path.endsWith(`/conversations/${id}`)))
  await page.getByRole('button', { name: '核对原提交', exact: true }).click()
  await page.getByRole('button', { name: '核对原提交', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(starts.length, beforeReconcile); assert.deepEqual(posts().at(-1).body, lostRequest.body)
  await page.unroute(`**/api/agent/v1/conversations/${id}/messages`); fault = false

  // Events are appended only from the server, with a real cursor beyond the first page.
  await input().fill(goal + ' 分页事件。'); await input().press('Enter')
  await workbench.waitForIdle()
  await outcome('测试通过')
  await page.waitForFunction(() => [...document.querySelectorAll('.hz-agent__events')].some(list => list.children.length > 50))
  await outcome('测试通过')
  const sequences = await page.locator('.hz-agent__events').last().locator('li').evaluateAll(nodes => nodes.map(node => Number(node.dataset.sequence)))
  assert.equal(new Set(sequences).size, sequences.length); assert.deepEqual(sequences, [...sequences].sort((a, b) => a - b))
  assert.ok(requests.some(request => request.path.includes('/turns/') && /after=[1-9]/.test(request.query)))
  await page.locator('.hz-agent__message-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
  await page.screenshot({ path: path.join(output, 'conversation-completed.png'), fullPage: true })

  await page.getByRole('button', { name: '查看报告与证据', exact: true }).last().click()
  await page.locator('.hz-agent-evidence .ant-drawer-title').waitFor()
  let downloaded
  try {
    [downloaded] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下载 隔离证据.txt', exact: true }).click()])
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'download-first-failure.png'), fullPage: true })
    console.log(JSON.stringify({ artifactRequests, errors, alerts: await page.getByRole('alert').allTextContents(), cards: await page.locator('.hz-agent__evidence-card').count() }))
    throw error
  }
  const downloadedPath = await downloaded.path()
  assert.deepEqual(fs.readFileSync(downloadedPath), bytes); assert.equal(downloaded.suggestedFilename(), '隔离证据.txt')
  await page.screenshot({ path: path.join(output, 'conversation-evidence.png'), fullPage: true })
  fault = true; await page.getByRole('button', { name: '下载 隔离工件', exact: true }).click()
  await page.getByText('AGENT_ARTIFACT_QUARANTINED', { exact: true }).waitFor()
  assert.equal((await page.locator('body').innerText()).includes('private path/token'), false)
  await page.keyboard.press('Escape'); await page.locator('.hz-agent-evidence .ant-drawer-title').waitFor({ state: 'hidden' }); fault = false
  await page.getByRole('button', { name: '设置与连接', exact: true }).click()
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await page.getByTestId('connection-status').filter({ hasText: '准备就绪' }).waitFor()
  await page.getByRole('button', { name: '完成', exact: true }).click()

  const postsBeforeBadImage = posts().length
  await page.getByLabel('选择单张 PNG 或 JPEG', { exact: true }).setInputFiles({ name: '不支持.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not-a-pdf') })
  await page.getByText('仅支持单张 PNG 或 JPEG 图片。', { exact: true }).waitFor()
  assert.equal(imports.length, 0); assert.equal(posts().length, postsBeforeBadImage)

  // Import a real one-pixel PNG through the production importer into the isolated Harness.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5i0AAAAASUVORK5CYII=', 'base64')
  await page.getByLabel('选择单张 PNG 或 JPEG', { exact: true }).setInputFiles({ name: '输入截图.png', mimeType: 'image/png', buffer: png })
  await page.getByAltText('待提交图片预览').waitFor()
  await page.getByRole('button', { name: '移除图片', exact: true }).click(); assert.equal(imports.length, 0)
  fault = true
  await page.route('**/api/agent/v1/attachments', route => route.fulfill({ status: 503, json: { code: 'AGENT_ATTACHMENT_UNAVAILABLE' } }))
  await page.getByLabel('选择单张 PNG 或 JPEG', { exact: true }).setInputFiles({ name: '失败.png', mimeType: 'image/png', buffer: png })
  await input().fill(goal + ' 上传失败不提交。'); await input().press('Enter')
  await page.getByText('AGENT_ATTACHMENT_UNAVAILABLE', { exact: true }).waitFor()
  assert.equal(posts().length, postsBeforeBadImage); assert.equal(imports.length, 0)
  await page.unroute('**/api/agent/v1/attachments'); fault = false
  await page.getByLabel('选择单张 PNG 或 JPEG', { exact: true }).setInputFiles({ name: '输入截图.png', mimeType: 'image/png', buffer: png })
  await input().fill(goal + ' 带图。'); await input().press('Enter'); await workbench.waitForIdle()
  await page.waitForFunction(() => !document.querySelector('img[alt="待提交图片预览"]'))
  await workbench.waitForIdle(); await page.getByRole('button', { name: '发送目标', exact: true }).waitFor()
  assert.equal(imports.length, 1); assert.equal(imports[0].filename, '输入截图.png')
  assert.equal(posts().at(-1).body.attachmentRefs.length, 1); assert.equal(starts.at(-1).input.attachmentRefs[0], posts().at(-1).body.attachmentRefs[0])
  const jpeg = await page.screenshot({ type: 'jpeg' })
  await page.getByLabel('选择单张 PNG 或 JPEG', { exact: true }).setInputFiles({ name: '实际页面.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await input().fill(goal + ' JPEG单图。'); await input().press('Enter')
  await page.getByText(goal + ' JPEG单图。', { exact: true }).waitFor(); await workbench.waitForIdle(); await outcome('测试通过')
  assert.equal(imports.length, 2); assert.equal(imports[1].filename, '实际页面.jpg')

  // Deterministic failure shows a safe reason, never its provider text or a PASSED badge.
  await input().fill(goal + ' 受控失败。'); await input().press('Enter')
  await outcome('任务失败，需要人工介入'); await page.getByText('AGENT_ASSERTION_FAILED', { exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, 'conversation-failed.png'), fullPage: true })

  runningEntered = deferred(); await input().fill(goal + ' 等待停止。'); await input().press('Enter'); await runningEntered.promise
  await page.getByRole('button', { name: '停止当前任务', exact: true }).waitFor()
  const running = (await metadata.call('conversation_get', { conversationId: id, limit: 1 })).turns.at(-1), stopGate = deferred(), readSeen = deferred()
  let faultReads = 0; fault = true
  await page.route(`**/api/agent/v1/turns/${running.id}?*`, route => { faultReads++; return route.fulfill({ status: 503, json: { code: 'AGENT_READ_UNAVAILABLE' } }) })
  await page.getByText('AGENT_READ_UNAVAILABLE', { exact: true }).waitFor()
  await page.clock.install(); await page.clock.fastForward(5000)
  assert.equal(faultReads, 1, 'failed reads must stop; no implicit polling retry')
  await page.unroute(`**/api/agent/v1/turns/${running.id}?*`); fault = false
  await page.getByRole('button', { name: '重新读取任务', exact: true }).click()
  await page.getByText('AGENT_READ_UNAVAILABLE', { exact: true }).waitFor({ state: 'hidden' })
  await page.route(`**/api/agent/v1/turns/${running.id}?*`, async route => { const response = await route.fetch(); readSeen.resolve(); await stopGate.promise; await route.fulfill({ response }) })
  await page.getByTestId(`turn-${running.id}`).waitFor()
  const runningBox = await page.getByTestId(`turn-${running.id}`).boundingBox(), scrollBox = await page.getByTestId('conversation-messages').boundingBox()
  assert.ok(runningBox.y < scrollBox.y + scrollBox.height && runningBox.y + runningBox.height > scrollBox.y, 'the submitted running task must be in the viewport')
  await page.screenshot({ path: path.join(output, 'conversation-running.png'), fullPage: true })
  await page.getByRole('button', { name: '停止当前任务', exact: true }).dblclick()
  await outcome('已请求停止，仍在核对结果'); await readSeen.promise
  assert.equal(requests.filter(request => request.method === 'POST' && request.path.endsWith(`/turns/${running.id}/cancel`)).length, 1)
  stopGate.resolve(); await outcome('执行中断，结果未知，需要人工介入')
  await page.unroute(`**/api/agent/v1/turns/${running.id}?*`); runningGate?.()
  const afterStop = starts.length
  await page.reload(); await outcome('执行中断，结果未知，需要人工介入'); assert.equal(starts.length, afterStop)
  const replyId = randomUUID()
  await metadata.call('conversation_create', { conversationId: replyId, title: '普通回复不是测试通过' })
  const reply = await metadata.call('turn_submit', { conversationId: replyId, submissionId: randomUUID(), input: '解释目标范围。', modelProfileId: modelId, modelProfileVersion: 2, releaseIdentityHash: release })
  await metadata.call('turn_update', { turnId: reply.turn.id, expectedVersion: reply.turn.version, status: 'COMPLETED', answer: '这里只解释范围，未运行测试。', humanInterventionRequired: false, event: { type: 'COMPLETED', summary: '隔离回复回读' } })
  const other = await context.newPage(); await other.goto(`${web.origin}/agent/conversations/${replyId}`)
  await other.getByTestId(`outcome-${reply.turn.id}`).filter({ hasText: '回复完成，未执行测试' }).waitFor()
  assert.equal(await other.getByText('测试通过', { exact: true }).count(), 0); assert.equal(starts.length, afterStop); await other.close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.fonts.ready)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  const styles = await page.locator('.hz-agent__result p,.hz-agent__result dt,.hz-agent__result dd,.hz-agent__composer textarea,.hz-agent__model-label').evaluateAll(nodes => nodes.map(node => { const s = getComputedStyle(node); return [s.fontSize, s.fontWeight, s.lineHeight] }))
  assert.ok(styles.every(style => style.join('/') === '14px/400/22px'))
  await page.screenshot({ path: path.join(output, 'conversation-narrow.png'), fullPage: true })
  assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true)
  const body = await page.locator('body').innerText()
  assert.equal(/synthetic-test-process-key|private model|private interrupted|workbench-isolated|D:\\Agent/.test(body), false)
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
  assert.deepEqual(errors, []); assert.deepEqual(warnings, [])
  fs.writeFileSync(path.join(output, 'conversation.json'), JSON.stringify({ scope: 'ISOLATED_BROWSER', productionHTTP: true, realMCPHarnessSQLite: true,
    modelAndExecution: 'TEST_PROCESS_SUBSTITUTE', bankActions: 0, live: false, originalServicesTouched: false,
    posts: posts().length, turns: countTurns(), starts: starts.length, continuations: continuations.length, imports, artifactRequests, events: sequences.length, errors, warnings }, null, 2))
  console.log(`CONVERSATION_BROWSER=PASS screenshots=${output}`)
})
