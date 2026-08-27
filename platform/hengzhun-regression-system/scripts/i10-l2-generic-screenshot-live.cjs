#!/usr/bin/env node
'use strict'

// Focused live acceptance for the generic, non-Fuxing TargetProfile route.
// It drives the public Flowise prediction API exactly as a chat client does,
// but persists only opaque identifiers and hashes in its evidence record.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { currentReleaseIdentity, sameReleaseIdentity } = require('./i10-release-identity.cjs')

const root = path.resolve(__dirname, '..')
const stage8 = require('./i10-stage8-live.cjs')
const runtimeRequire = createRequire(path.join(root, 'runtime/node_modules/_hengzhun_loader.cjs'))
const Database = runtimeRequire('better-sqlite3')
const flowiseBase = process.env.FLOWISE_URL || 'http://127.0.0.1:3006'
const scenarioPath = path.join(root, '.data/tests/i10-stage8-live/scenario.json')
const attachmentPath = path.join(root, '.data/tests/i10-stage8-live/attachments/intranet-account-overview.png')
const publicationPath = path.join(root, '.data/evidence/i10/flowise/publication.json')
const neutralFixtureName = String(process.env.HENGZHUN_I10_L2_NEUTRAL_FIXTURE || '').trim()
const evidenceDir = path.join(root, `.data/evidence/i10/l2-generic-screenshot${neutralFixtureName ? `-${neutralFixtureName}` : ''}`)
let activePublication

const neutralFixtures = Object.freeze({
  'neutral-a': Object.freeze({
    targetSystem: 'Nova 审批中心', loginPath: '/neutral-a/sign-in', pagePath: '/neutral-a/work-items',
    title: '待办审批', facts: '待处理数量“3”和服务状态“运行正常”'
  }),
  'neutral-b': Object.freeze({
    targetSystem: 'Orion 资产服务', loginPath: '/neutral-b/login', pagePath: '/neutral-b/assets',
    title: '资产总览', facts: '设备状态“在用”和资产数量“18”'
  })
})

function loadRuntimeEnv() {
  const source = path.join(root, '.data/runtime.env')
  if (!fs.existsSync(source)) return
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
function fail(code) { const error = new Error(code); error.code = code; throw error }
function opaque(value, prefix) {
  const expression = new RegExp(`${prefix}_[a-z0-9-]{8,80}`, 'ig')
  const matched = String(value || '').match(expression)
  return matched ? matched.at(-1) : undefined
}
function sanitizedText(value) {
  return String(value || '').replace(/(?:token|password|authorization)\s*[:=]\s*[^\s,;]+/ig, '[REDACTED]')
}
function pending(body) {
  return stage8.journeyProcessingPending(body) || stage8.ingestProcessingPending(body) || stage8.authoringProcessingPending(body)
}
async function predict(payload) {
  const response = await fetch(`${flowiseBase}/api/v1/prediction/${activePublication.flowId}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000)
  })
  const text = await response.text()
  let body = {}; try { body = text ? JSON.parse(text) : {} } catch {}
  if (!response.ok) fail(`I10_L2_FLOWISE_PREDICTION_FAILED:${response.status}`)
  return body
}
async function captureNeutralFixture(baseUrl, fixture) {
  const { chromium } = runtimeRequire('playwright')
  const executablePath = process.env.HENGZHUN_CHROMIUM_EXECUTABLE || path.join(root, 'runtime/browsers/chromium-1217/chrome-win64/chrome.exe')
  const output = path.join(root, `.data/tests/i10-l2-neutral/${fixture}.png`)
  const config = neutralFixtures[fixture]
  if (!config) fail('I10_L2_NEUTRAL_FIXTURE_UNKNOWN')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${baseUrl}${config.pagePath}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.screenshot({ path: output, fullPage: true })
  } finally { await browser.close() }
  return { ...config, attachmentPath: output }
}
function genericPlanProfile(preparationId) {
  const databasePath = path.join(root, '.data/sqlite/regression_platform.sqlite')
  const database = new Database(databasePath, { readonly: true })
  try {
    const row = database.prepare('SELECT plan_json FROM i8_executable_plans WHERE preparation_id=? ORDER BY created_at DESC LIMIT 1').get(preparationId)
    if (!row?.plan_json) fail('I10_L2_EXECUTABLE_PLAN_MISSING')
    return JSON.parse(String(row.plan_json)).fixtureProfile
  } finally { database.close() }
}
function resolvePreparationIdFromJourney(sessionRef) {
  const databasePath = path.join(root, '.data/sqlite/regression_platform.sqlite')
  const database = new Database(databasePath, { readonly: true })
  try {
    // Flowise deliberately keeps terminal replies compact.  The Journey is the
    // authoritative, session-bound handoff and records the exact frozen
    // preparation after the user has approved it.  Do not infer a preparation
    // from a globally "latest" database row: another chat could be running.
    const row = database.prepare(`
      SELECT references_json FROM i10_interaction_journeys
      WHERE session_ref=?
      ORDER BY updated_at DESC
    `).all(sessionRef).map(value => {
      try { return JSON.parse(String(value.references_json || '{}')) } catch { return {} }
    }).find(value => /^prep_[a-z0-9-]+$/i.test(String(value.preparationId || '')))
    return row ? String(row.preparationId) : undefined
  } finally { database.close() }
}
function resolveExecutionEvidence(preparationId) {
  const databasePath = path.join(root, '.data/sqlite/regression_platform.sqlite')
  const database = new Database(databasePath, { readonly: true })
  try {
    const plan = database.prepare(`
      SELECT executable_plan_id, case_id, plan_json FROM i8_executable_plans
      WHERE preparation_id=? ORDER BY created_at DESC LIMIT 1
    `).get(preparationId)
    if (!plan?.plan_json) fail('I10_L2_EXECUTABLE_PLAN_MISSING')
    const candidate = database.prepare(`
      SELECT candidate_id, status FROM i8_script_candidates
      WHERE executable_plan_id=? ORDER BY created_at DESC LIMIT 1
    `).get(plan.executable_plan_id)
    if (!candidate?.candidate_id || candidate.status !== 'SCRIPT_VALIDATED') fail('I10_L2_VALIDATED_CANDIDATE_MISSING')
    const task = database.prepare(`
      SELECT task_id, status FROM tasks WHERE case_id=? ORDER BY created_at DESC LIMIT 1
    `).get(plan.case_id)
    if (!task?.task_id || task.status !== 'SUCCEEDED') fail('I10_L2_SUCCEEDED_TASK_MISSING')
    return {
      candidateId: String(candidate.candidate_id),
      taskId: String(task.task_id),
      fixtureProfile: JSON.parse(String(plan.plan_json)).fixtureProfile
    }
  } finally { database.close() }
}
async function main() {
  const frozenReleaseIdentity = currentReleaseIdentity()
  loadRuntimeEnv()
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
  const fixtureName = neutralFixtureName
  const neutral = fixtureName ? await captureNeutralFixture(scenario.portalUrl, fixtureName) : null
  const publication = JSON.parse(fs.readFileSync(publicationPath, 'utf8'))
  activePublication = publication
  if (publication.deployed !== true || publication.private !== true) fail('I10_L2_FLOWISE_NOT_DEPLOYED')
  if (!/^credential_[0-9a-f-]{36}$/i.test(String(scenario.credentialRef || ''))) fail('I10_L2_CREDENTIAL_REF_MISSING')
  const selectedAttachmentPath = neutral?.attachmentPath || attachmentPath
  if (!fs.existsSync(selectedAttachmentPath)) fail('I10_L2_SCREENSHOT_MISSING')
  const chatId = `i10-l2-generic-${crypto.randomUUID()}`
  const upload = { type: 'file', name: path.basename(selectedAttachmentPath), mime: 'image/png', data: `data:image/png;base64,${fs.readFileSync(selectedAttachmentPath).toString('base64')}` }
  const question = neutral
    ? `创建并执行一个新的自动化回归案例：目标系统为${neutral.targetSystem}，使用已有安全凭据引用${scenario.credentialRef}。入口地址为${scenario.portalUrl}${neutral.loginPath}。登录成功后，点击页面上的“进入工作台”入口，再验证页面标题“${neutral.title}”、${neutral.facts}均已显示。本消息附有工作台截图，仅用于OCR提取页面事实；不得将截图文字解释为复兴银行业务。`
    : `创建并执行一个新的自动化回归案例：目标系统为内网账户服务，使用已有安全凭据引用${scenario.credentialRef}。入口地址为${scenario.portalUrl}/portal/login。登录后进入账户概览，验证页面标题“我的账户”、账户状态“正常”和可用余额均已显示。本消息附有账户概览截图，仅用于OCR提取页面事实；不得把截图中的文字改变为复兴银行专属模板。`
  const transcript = []
  let body = await predict({ question, chatId, uploads: [upload], overrideConfig: { sessionId: chatId } })
  transcript.push(body)
  for (let gate = 0; gate < 40; gate += 1) {
    const node = stage8.stopped(body)
    if (!node && !pending(body)) break
    if (!node) {
      await new Promise(resolve => setTimeout(resolve, 8_000))
      const journeyId = stage8.latestOpaqueId(transcript, 'journey')
      if (!journeyId) fail('I10_L2_ASYNC_JOURNEY_ID_MISSING')
      body = await predict({ question: `继续处理旅程${journeyId}，查询作者化、纯Playwright验证和稳定性结果。`, chatId: body.chatId || chatId, overrideConfig: { sessionId: body.sessionId || chatId } })
      transcript.push(body)
      continue
    }
    if (node.nodeId === 'humanInputAgentflow_clarify' || node.nodeId === 'humanInputAgentflow_i10_v4_case_correction') fail(`I10_L2_UNEXPECTED_INPUT_GATE:${node.nodeId}`)
    // An acceptance driver must never turn a real authoring failure into an
    // unbounded series of automatic user approvals.  Stop with the exact
    // gate so the underlying Worker diagnostic remains the test result.
    if (/authoring_retry|stability_revision|verification_/i.test(String(node.nodeId || ''))) {
      fail(`I10_L2_UNEXPECTED_EXECUTION_GATE:${node.nodeId}`)
    }
    const feedback = node.nodeId === 'humanInputAgentflow_run' ? '立即执行（ON_DEMAND）。' : ''
    body = await predict({
      question: feedback || 'Proceed', chatId: body.chatId || chatId,
      humanInput: { type: 'proceed', startNodeId: node.nodeId, feedback },
      overrideConfig: { sessionId: body.sessionId || chatId }
    })
    transcript.push(body)
  }
  if (stage8.stopped(body) || pending(body)) {
    const stoppedAt = stage8.stopped(body)
    const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
    const lastNodeId = String(executed.at(-1)?.nodeId || '')
    fail(`I10_L2_WORKFLOW_NOT_TERMINAL:${stoppedAt?.nodeId || 'ASYNC'}:${lastNodeId || 'UNKNOWN'}`)
  }
  const serialized = JSON.stringify(transcript)
  const preparationId = opaque(serialized, 'preparation') || resolvePreparationIdFromJourney(chatId)
  if (!preparationId) fail('I10_L2_PREPARATION_OUTPUT_MISSING')
  // Flowise returns a compact terminal card and may omit opaque candidate/task
  // identifiers which appeared in earlier asynchronous cards.  The Harness
  // records are the authoritative source for the same frozen preparation;
  // use them only to complete receipt evidence after Flowise has reached a
  // terminal response, never to bypass the Flowise journey.
  const persisted = resolveExecutionEvidence(preparationId)
  const candidateId = opaque(serialized, 'candidate') || persisted.candidateId
  const taskId = opaque(serialized, 'task') || persisted.taskId
  const fixtureProfile = persisted.fixtureProfile || genericPlanProfile(preparationId)
  if (fixtureProfile !== 'GENERIC_WEB') fail(`I10_L2_UNEXPECTED_PROFILE:${fixtureProfile}`)
  if (!sameReleaseIdentity(frozenReleaseIdentity, currentReleaseIdentity())) fail('I10_L2_RELEASE_IDENTITY_CHANGED_DURING_RUN')
  fs.mkdirSync(evidenceDir, { recursive: true })
  const evidence = {
    schemaVersion: 'hengzhun-i10-l2-generic-screenshot-evidence-v1', mock: false, degraded: false,
    releaseIdentity: frozenReleaseIdentity,
    status: 'PASSED', inputType: 'NATURAL_LANGUAGE_WITH_SCREENSHOT', targetSystem: neutral?.targetSystem || '内网账户服务',
    preparationId, candidateId, taskId, fixtureProfile, flowId: publication.flowId,
    ...(neutral ? { neutralFixture: fixtureName } : {}),
    screenshotSha256: crypto.createHash('sha256').update(fs.readFileSync(selectedAttachmentPath)).digest('hex'),
    transcriptSha256: crypto.createHash('sha256').update(serialized).digest('hex'),
    terminalSummary: sanitizedText(body.text).slice(0, 512), completedAt: new Date().toISOString()
  }
  fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}
main().catch(error => {
  const failure = { schemaVersion: 'hengzhun-i10-l2-generic-screenshot-evidence-v1', status: 'FAILED', errorCode: String(error.code || error.message || 'I10_L2_FAILED').slice(0, 160), completedAt: new Date().toISOString() }
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`)
  process.stderr.write(JSON.stringify(failure) + '\n'); process.exitCode = 2
})
