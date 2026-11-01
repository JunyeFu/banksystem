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
const repoRoot = path.resolve(productRoot, '../..')
const { chromium } = createRequire(path.join(repoRoot, 'tests/e2e/frontend-quality-platform/package.json'))('playwright')
const load = file => import(pathToFileURL(path.join(productRoot, file)).href)
const output = process.env.HENGZHUN_WORKBENCH_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'rf068-s4-browser-'))
const release = 'e'.repeat(64)
const goal = '目标系统：复兴银行。访问 http://127.0.0.1:18082/portal/login，使用 credential_12345678-1234-4234-8234-123456789abc，登录后只读查询账户。'

test('Models: real HTTP/MCP/SQLite configuration, key isolation, conflicts and immutable task binding', { timeout: 150000 }, async t => {
  fs.mkdirSync(output, { recursive: true })
  let web, metadata, child, browser
  t.after(async () => { await browser?.close(); if (web) await web.close(); else await metadata?.close(); if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill() }) })
  const f = await application(t), reserved = await listen((_request, response) => response.end())
  await new Promise(resolve => reserved.server.close(resolve))
  const mcpToken = 'isolated-models-mcp-token-32-characters'
  child = spawn(process.execPath, [path.join(productRoot, 'mcp/src/server.cjs')], { cwd: productRoot,
    env: { NODE_ENV: 'test', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      HENGZHUN_HARNESS_URL: f.url, HENGZHUN_SERVICE_TOKEN: token, HENGZHUN_MCP_TOKEN: mcpToken,
      HENGZHUN_NAMESPACE: ns, HENGZHUN_MCP_PORT: new URL(reserved.url).port }, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('MODELS_TEST_MCP_START_FAILED')), 10000)
    child.once('error', error => { clearTimeout(deadline); reject(error) }); child.once('exit', () => { clearTimeout(deadline); reject(new Error('MODELS_TEST_MCP_EXITED')) })
    let text = ''; child.stdout.on('data', bytes => { text += bytes.toString(); if (text.includes('listening on')) { clearTimeout(deadline); resolve() } })
  })
  const { connectWorkbenchMetadata } = await load('agent-cli/src/workbench-metadata.mjs')
  metadata = await connectWorkbenchMetadata({ url: `${reserved.url}/mcp`, token: mcpToken })
  const { createWorkbenchApplication } = await load('agent-cli/src/workbench-application.mjs')
  const { startWorkbenchServer } = await load('agent-cli/src/workbench-server.mjs')
  const { WorkbenchError } = await load('agent-cli/src/workbench-http.mjs')
  const keys = new Map(), probes = [], starts = [], continuations = []
  const syntheticKey = 'synthetic-s4-test-only-secret', secondKey = 'synthetic-s4-second-key'
  let probeReady = false, failDefault = false, defaultConflict = false, started
  const workbench = createWorkbenchApplication({ metadata, namespace: ns, identityFor: () => release, readiness: async () => ({ status: 'READY' }),
    keyStore: { put: async (_namespace, value) => { const ref = `modelkey_${randomUUID()}`; keys.set(ref, value); return ref }, get: async (_namespace, ref) => keys.get(ref) },
    // Substitutes exist only in this isolated test process, never in the built frontend.
    probeModel: async config => { probes.push(config); return probeReady ? { status: 'READY' } : { status: 'FAILED', code: 'AGENT_MODEL_PROBE_FAILED' } },
    serviceFor: async config => ({
      async start(input) {
        starts.push({ model: config.profile.model, version: config.profile.version })
        started?.()
        if (input.input.includes('等待停止')) await new Promise((_resolve, reject) => input.signal.addEventListener('abort', () => reject(Object.assign(new Error('private aborted detail'), { code: 'AGENT_TEST_INTERRUPTED' })), { once: true }))
        if (input.input.includes('缺金额')) return { status: 'NEEDS_INPUT', question: '请补充金额。', journeyId: 'journey_s4_need', sessionId: 'session-' + 'b'.repeat(32) }
        return { status: 'COMPLETED', journeyId: 'journey_s4_read' }
      },
      async continueDirectJourney(input) { continuations.push({ journeyId: input.journeyId, model: config.profile.model, version: config.profile.version }); return { status: 'COMPLETED', journeyId: input.journeyId } },
      evidenceVerify: async ({ journeyId }) => ({ verdict: 'VERIFIED', journeyId, releaseIdentityHash: release, runId: 'run_s4_isolated', taskId: 'task_s4_isolated' }),
    }),
  })
  const realDefault = workbench.setDefaultAgentModel
  workbench.setDefaultAgentModel = input => {
    if (failDefault) throw new WorkbenchError('AGENT_DEFAULT_UNAVAILABLE', 503)
    if (defaultConflict) throw new WorkbenchError('AGENT_MODEL_VERSION_CONFLICT', 409)
    return realDefault(input)
  }
  web = await startWorkbenchServer({ port: 0, staticRoot: path.join(repoRoot, 'apps/quality-case-portal/dist-agent'), workbench })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  const page = await context.newPage(), requests = [], errors = [], warnings = []
  let fault = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); if (message.type() === 'error' && !(fault && message.text().startsWith('Failed to load resource:'))) errors.push(message.text()) })
  page.on('request', request => { const url = new URL(request.url()); requests.push({ method: request.method(), path: url.pathname, search: url.search,
    // Do not retain or export model/key request bodies, including synthetic credentials.
    submission: request.method() === 'POST' && url.pathname.endsWith('/messages') ? request.postDataJSON() : undefined }) })
  const picker = () => page.getByRole('button', { name: '选择下一任务模型', exact: true })
  const config = async () => { await picker().click(); await page.getByRole('menuitem', { name: '模型配置', exact: true }).click(); await page.getByLabel('显示名称', { exact: true }).waitFor({ state: 'visible' }); await page.getByText('正在读取模型配置…', { exact: true }).waitFor({ state: 'hidden' }) }
  const save = () => page.getByRole('button', { name: '保存并设为默认', exact: true })
  const saved = () => page.getByTestId('model-save-status').filter({ hasText: '配置已保存，并设为后续任务的默认模型。' }).waitFor()
  const fill = async (name, id, key) => { await page.getByLabel('显示名称', { exact: true }).fill(name); await page.getByLabel('模型 ID', { exact: true }).fill(id); await page.getByLabel('Base URL', { exact: true }).fill('https://endpoint.invalid/v1'); if (key) await page.getByLabel('API Key', { exact: true }).fill(key) }
  const back = async () => { await page.getByRole('button', { name: '返回对话', exact: true }).click(); await picker().waitFor() }
  const choose = async name => { await picker().click(); await page.getByRole('menuitem', { name, exact: true }).click(); await page.getByRole('menu').waitFor({ state: 'hidden' }); await picker().filter({ hasText: name }).waitFor() }
  let expectedTurn
  const submit = async text => {
    await page.getByLabel('测试目标', { exact: true }).fill(text)
    const receipt = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/messages'))
    await page.getByRole('button', { name: '发送目标', exact: true }).click()
    const accepted = await (await receipt).json(); assert.ok(accepted.id); expectedTurn = accepted.id
    await page.getByTestId(`turn-${expectedTurn}`).waitFor()
  }
  const outcome = async text => {
    try { await page.getByTestId(expectedTurn ? `outcome-${expectedTurn}` : /^outcome-/).last().filter({ hasText: text }).waitFor() }
    catch (error) {
      await page.screenshot({ path: path.join(output, 'models-failure.png'), fullPage: true })
      console.log(JSON.stringify({ expected: text, starts, continuations, submissions: requests.filter(item => item.submission), alerts: await page.getByRole('alert').allTextContents(), outcomes: await page.getByTestId(/^outcome-/).allTextContents() }))
      throw error
    }
  }

  await page.goto(`${web.origin}/agent/`); await page.getByTestId('connection-status').filter({ hasText: '尚未就绪' }).waitFor()
  assert.equal(await page.title(), '衡准 Agent'); await picker().waitFor({ state: 'visible' })
  assert.equal(await page.getByRole('button', { name: '发送目标', exact: true }).isDisabled(), true)
  await config(); assert.equal(new URL(page.url()).pathname, '/agent/models')
  await page.getByText('尚未配置模型，请添加。', { exact: true }).waitFor()
  await fill('测试配置甲', 'test-s4-alpha', syntheticKey)
  await page.getByRole('button', { name: '检查连接', exact: true }).click()
  await page.getByText('连接检查失败 · AGENT_MODEL_PROBE_FAILED', { exact: true }).waitFor()
  assert.equal(probes.length, 1); assert.equal(probes[0].baseURL, 'https://endpoint.invalid/v1'); assert.equal(probes[0].apiKey, syntheticKey)
  assert.equal((await metadata.call('model_list')).models.length, 0)
  probeReady = true; await page.getByRole('button', { name: '检查连接', exact: true }).click()
  await page.getByText('连接检查通过 · AGENT_MODEL_READY', { exact: true }).waitFor()
  assert.equal((await metadata.call('model_list')).models.length, 0, 'probe never saves')
  await save().dblclick(); await saved()
  let profiles = (await metadata.call('model_list')).models
  const alpha = profiles.find(item => item.displayName === '测试配置甲')
  assert.equal(profiles.length, 1); assert.equal(alpha.version, 1); assert.equal(alpha.isDefault, true)
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('API Key', { exact: true }).getAttribute('placeholder'), '已配置，留空保持')
  assert.equal(JSON.stringify(profiles).includes(syntheticKey), false)
  // Direct route refresh must wait for bootstrap/catalog before choosing the existing profile.
  await page.reload(); await page.getByLabel('显示名称', { exact: true }).filter({ visible: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('#model-display-name')?.value === '测试配置甲')
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '')

  // Leave clears transient secret; no local/session storage, history state or URL contains it.
  await page.getByLabel('API Key', { exact: true }).fill(secondKey); await back(); await config()
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => {
    const button = document.querySelector('.hz-agent__model-actions .ant-btn-primary')
    return button && !button.disabled && getComputedStyle(button).backgroundColor === 'rgb(166, 25, 46)'
  })
  await page.screenshot({ path: path.join(output, 'models-config.png'), fullPage: true })
  await page.getByRole('button', { name: '检查连接', exact: true }).click()
  await page.getByText('连接检查通过 · AGENT_MODEL_READY', { exact: true }).waitFor()
  assert.equal(probes.at(-1).apiKey, syntheticKey)
  await save().waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('.hz-agent__model-actions button').disabled)
  const beforeKeyRefs = keys.size
  await page.getByLabel('显示名称', { exact: true }).fill('测试配置甲已修改')
  await save().click(); await saved(); assert.equal(keys.size, beforeKeyRefs, 'blank key retains existing key ref')
  profiles = (await metadata.call('model_list')).models; assert.equal(profiles[0].version, 2)

  // Stale edit: another writer changes v2 to v3; our v2 must fail once and reload, not overwrite.
  const alphaCore = await metadata.call('model_get', { modelId: alpha.id })
  await metadata.call('model_save', { modelId: alpha.id, expectedVersion: 2, displayName: '外部更新甲', model: alphaCore.model, baseUrl: alphaCore.baseUrl, keyRef: alphaCore.keyRef })
  await page.getByLabel('显示名称', { exact: true }).fill('不应覆盖')
  fault = true; await save().click(); await page.getByTestId('model-save-status').filter({ hasText: 'AGENT_MODEL_VERSION_CONFLICT' }).waitFor(); fault = false
  assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), '外部更新甲')
  assert.equal((await metadata.call('model_get', { modelId: alpha.id })).version, 3)
  await back()
  await picker().filter({ hasText: '所选版本不可用，请重新选择' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '发送目标', exact: true }).isDisabled(), true)
  await config()

  // Save succeeded but default failed: an explicit retry sets default only, not a duplicate create/update.
  await page.getByRole('button', { name: '添加模型', exact: true }).click(); await fill('测试配置乙', 'test-s4-beta', secondKey)
  failDefault = true; fault = true; await save().click()
  await page.getByTestId('model-save-status').filter({ hasText: '配置已保存，但设置默认失败' }).waitFor()
  profiles = (await metadata.call('model_list')).models
  const beta = profiles.find(item => item.displayName === '测试配置乙')
  assert.equal(beta.version, 1); assert.equal(profiles.find(item => item.isDefault).id, alpha.id)
  failDefault = false; await page.getByRole('button', { name: '设为默认', exact: true }).click(); await saved(); fault = false
  assert.equal((await metadata.call('model_get', { modelId: beta.id })).version, 1)
  // A default-stage 409 must retain the saved profile and reload it, without an automatic second PUT.
  defaultConflict = true; fault = true; await save().click()
  await page.getByTestId('model-save-status').filter({ hasText: '配置已保存；设置默认发生冲突' }).waitFor()
  assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), '测试配置乙')
  assert.equal((await metadata.call('model_get', { modelId: beta.id })).version, 2)
  defaultConflict = false; fault = false
  await back(); await page.getByTestId('connection-status').filter({ hasText: '准备就绪' }).waitFor()

  const defaultsBefore = requests.filter(item => item.path.endsWith('/default')).length
  await choose('外部更新甲')
  assert.equal(requests.filter(item => item.path.endsWith('/default')).length, defaultsBefore, 'picker selection is local, not server default')
  await picker().click(); await page.getByRole('menu').waitFor()
  const menuWidth = await page.getByRole('menu').evaluate(element => element.getBoundingClientRect().width)
  assert.equal(menuWidth, 320)
  await page.waitForFunction(() => { const element = document.querySelector('.hz-agent-model-menu'); return element && getComputedStyle(element).opacity === '1' && !element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running') })
  await page.screenshot({ path: path.join(output, 'models-menu.png'), fullPage: true }); await page.keyboard.press('Escape')
  await submit(goal + ' 缺金额。'); await outcome('请补充原任务所需信息')
  const conversationId = page.url().split('/').pop()
  assert.equal(starts.at(-1).version, 3)
  await config(); await page.getByRole('navigation', { name: '已配置模型' }).getByRole('button', { name: /外部更新甲/ }).click()
  await page.getByLabel('模型 ID', { exact: true }).fill('test-s4-alpha-new'); await save().click(); await saved(); await back()
  assert.equal(page.url().split('/').pop(), conversationId)
  await outcome('请补充原任务所需信息'); await page.getByText(/本次绑定：test-s4-alpha · v3/).waitFor()
  await choose('测试配置乙'); await submit('金额100元。'); await outcome('测试通过')
  assert.deepEqual(continuations, [{ journeyId: 'journey_s4_need', model: 'test-s4-alpha', version: 3 }])
  assert.equal(requests.filter(item => item.submission).at(-1).submission.modelProfileVersion, 3)
  const startedPromise = new Promise(resolve => { started = resolve })
  await submit(goal + ' 等待停止。'); await startedPromise; started = undefined; await page.getByRole('button', { name: '停止当前任务', exact: true }).waitFor()
  assert.equal(starts.at(-1).model, 'test-s4-beta')
  await choose('外部更新甲')
  await page.getByText(/本次绑定：test-s4-beta · v2/).waitFor()
  const current = (await metadata.call('conversation_get', { conversationId, limit: 1 })).turns.at(-1)
  assert.equal(current.modelBinding.profileId, beta.id); assert.equal(current.modelBinding.profileVersion, 2)
  await page.getByRole('button', { name: '停止当前任务', exact: true }).click(); await outcome('执行中断，结果未知，需要人工介入')
  await submit(goal); await outcome('测试通过'); assert.deepEqual(starts.at(-1), { model: 'test-s4-alpha-new', version: 4 })

  // Keyboard navigation in the real menu, then narrow configuration without overflow.
  await picker().focus(); await page.keyboard.press('Enter'); await page.getByRole('menu').waitFor()
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape')
  await page.getByRole('menu').waitFor({ state: 'hidden' })
  await config(); await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => document.fonts.ready)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: path.join(output, 'models-narrow.png'), fullPage: true })
  await page.getByRole('button', { name: '检查连接', exact: true }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '检查连接', exact: true }).click()
  await page.getByText('连接检查通过 · AGENT_MODEL_READY', { exact: true }).waitFor()
  await page.locator('.hz-agent__model-actions .anticon-loading').waitFor({ state: 'hidden' })
  await page.screenshot({ path: path.join(output, 'models-narrow-actions.png'), fullPage: true })
  const typography = await page.locator('.hz-agent__models h1,.hz-agent__models p,.hz-agent__models label,.hz-agent__models input,.hz-agent__models button').evaluateAll(nodes => nodes.map(node => { const s = getComputedStyle(node); return [s.fontSize, s.fontWeight, s.lineHeight].join('/') }))
  assert.ok(typography.every(style => style === '14px/400/22px'))
  assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true)
  const browserState = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, history: JSON.stringify(history.state), text: document.body.innerText, url: location.href }))
  assert.equal(browserState.local + browserState.session, 0)
  for (const key of [syntheticKey, secondKey]) assert.equal(JSON.stringify(browserState).includes(key), false)
  assert.equal(requests.some(item => item.search.includes('key') || item.search.includes('secret')), false)
  assert.equal(JSON.stringify((await metadata.call('conversation_get', { conversationId, limit: 20 }))).includes(syntheticKey), false)
  assert.deepEqual(errors, []); assert.deepEqual(warnings, [])
  fs.writeFileSync(path.join(output, 'models.json'), JSON.stringify({ scope: 'ISOLATED_BROWSER', origin: web.origin, viewport: ['1440x1000','390x844'], realHTTPMCPHarnessSQLite: true, modelAndKeySource: 'TEST_PROCESS_ONLY', probes: probes.length, starts, continuations,
    modelWrites: requests.filter(item => item.path.includes('/models') && item.method !== 'GET').map(({ method, path }) => ({ method, path })), menuWidth, typography, errors, warnings, storageItems: browserState.local + browserState.session, bankActions: 0, live: false }, null, 2))
  console.log(`MODELS_BROWSER=PASS screenshots=${output}`)
})
