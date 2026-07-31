#!/usr/bin/env node
'use strict'

// Live acceptance for the unregistered-target boundary. This script stops at
// TargetProfile confirmation and proves that no authoring is dispatched before
// an operator accepts the newly discovered HTTP target.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const stage8 = require('./i10-stage8-live.cjs')
const runtimeRequire = createRequire(path.join(root, 'runtime/node_modules/_hengzhun_loader.cjs'))
const Database = runtimeRequire('better-sqlite3')
const evidenceDir = path.join(root, '.data/evidence/i10/gz05-unregistered-target')

function fail(code) { const error = new Error(code); error.code = code; throw error }
function loadRuntimeEnv() {
  const source = path.join(root, '.data/runtime.env')
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
async function predict(flowId, payload) {
  const response = await fetch(`${process.env.FLOWISE_URL || 'http://127.0.0.1:3006'}/api/v1/prediction/${flowId}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000)
  })
  const text = await response.text()
  let body = {}; try { body = text ? JSON.parse(text) : {} } catch {}
  if (!response.ok) fail(`I10_GZ05_FLOWISE_PREDICTION_FAILED:${response.status}`)
  return body
}
function persistEvidence(value) {
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, `${value.status === 'PASSED' ? 'result' : 'failure'}.json`), `${JSON.stringify(value, null, 2)}\n`)
}
async function main() {
  loadRuntimeEnv()
  const scenario = JSON.parse(fs.readFileSync(path.join(root, '.data/tests/i10-stage8-live/scenario.json'), 'utf8'))
  const publication = JSON.parse(fs.readFileSync(path.join(root, '.data/evidence/i10/flowise/publication.json'), 'utf8'))
  if (publication.deployed !== true || publication.private !== true) fail('I10_GZ05_FLOWISE_NOT_DEPLOYED')
  const launchUrl = `${scenario.portalUrl}/neutral-unregistered/sign-in`
  const chatId = `i10-gz05-unregistered-${crypto.randomUUID()}`
  const question = `创建回归案例：目标系统为 Atlas 工单台，入口地址为 ${launchUrl}。使用已有安全凭据引用 ${scenario.credentialRef} 登录，验证登录页加载成功。请先建立目标站点档案，未得到用户确认前不得开始作者化、生成脚本或执行。`
  const transcript = []
  let body = await predict(publication.flowId, { question, chatId, overrideConfig: { sessionId: chatId } })
  transcript.push(body)
  let stopped
  for (let index = 0; index < 16; index += 1) {
    stopped = stage8.stopped(body)
    if (stopped?.nodeId === 'humanInputAgentflow_i10_v4_target_profile_confirm') break
    if (!stopped) {
      if (!(stage8.journeyProcessingPending(body) || stage8.authoringProcessingPending(body))) fail('I10_GZ05_UNEXPECTED_TERMINAL')
      await new Promise(resolve => setTimeout(resolve, 2_000))
      body = await predict(publication.flowId, { question: '继续处理当前目标站点登记。', chatId: body.chatId || chatId, overrideConfig: { sessionId: body.sessionId || chatId } })
      transcript.push(body)
      continue
    }
    if (/clarify|case_correction/i.test(String(stopped.nodeId))) fail(`I10_GZ05_UNEXPECTED_INPUT_GATE:${stopped.nodeId}`)
    body = await predict(publication.flowId, {
      question: 'Proceed', chatId: body.chatId || chatId,
      humanInput: { type: 'proceed', startNodeId: stopped.nodeId, feedback: '' },
      overrideConfig: { sessionId: body.sessionId || chatId }
    })
    transcript.push(body)
  }
  if (stopped?.nodeId !== 'humanInputAgentflow_i10_v4_target_profile_confirm') fail(`I10_GZ05_TARGET_CONFIRMATION_NOT_REACHED:${stopped?.nodeId || 'NONE'}`)
  const db = new Database(path.join(root, '.data/sqlite/regression_platform.sqlite'), { readonly: true })
  try {
    const profile = db.prepare(`SELECT target_profile_id,status,adapter_binding_json,launch_url FROM i10_target_profiles WHERE launch_url=? ORDER BY created_at DESC LIMIT 1`).get(launchUrl)
    let adapterBinding
    try { adapterBinding = JSON.parse(String(profile?.adapter_binding_json || 'null')) } catch { fail('I10_GZ05_TARGET_PROFILE_BINDING_INVALID') }
    if (!profile || profile.status !== 'PENDING_CONFIRMATION' || adapterBinding !== null) fail('I10_GZ05_UNREGISTERED_PROFILE_BOUND_OR_NOT_PENDING')
    const dispatched = db.prepare(`SELECT COUNT(*) AS count FROM i8_executable_plans WHERE plan_json LIKE ?`).get(`%${profile.target_profile_id}%`).count
    if (Number(dispatched) !== 0) fail('I10_GZ05_AUTHORING_DISPATCHED_BEFORE_TARGET_CONFIRMATION')
    const evidence = {
      schemaVersion: 'hengzhun-i10-gz05-unregistered-target-evidence-v1', status: 'PASSED', mock: false, degraded: false,
      flowId: publication.flowId, launchUrl, targetProfileId: profile.target_profile_id, targetProfileStatus: profile.status,
      adapterBinding: null, authoringPlansForTarget: Number(dispatched), transcriptSha256: crypto.createHash('sha256').update(JSON.stringify(transcript)).digest('hex'),
      completedAt: new Date().toISOString()
    }
    persistEvidence(evidence)
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } finally { db.close() }
}
main().catch(error => {
  const evidence = { schemaVersion: 'hengzhun-i10-gz05-unregistered-target-evidence-v1', status: 'FAILED', errorCode: String(error.code || error.message || 'I10_GZ05_FAILED').slice(0, 160), completedAt: new Date().toISOString() }
  persistEvidence(evidence); process.stderr.write(JSON.stringify(evidence) + '\n'); process.exitCode = 2
})
