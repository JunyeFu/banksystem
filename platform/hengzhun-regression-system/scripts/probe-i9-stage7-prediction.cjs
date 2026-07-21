#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/p5-agentflow-publication-v1.json'), 'utf8'))
const evidenceDir = path.join(root, '.data/evidence/i9')
const base = process.env.FLOWISE_URL || 'http://127.0.0.1:3006'
const portalControl = process.env.HENGZHUN_I9_P7_PORTAL || 'http://127.0.0.1:28883'
const chatId = 'i9-p7-reverse-probe'

async function predict(payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 240_000)
  try {
    const response = await fetch(`${base}/api/v1/prediction/${publication.flowId}`, {
      method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = { parseStatus: 'NON_JSON', length: text.length } }
    return { response, body }
  } finally { clearTimeout(timer) }
}

function stopped(body) {
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  return { executed, node: executed.find(item => item?.status === 'STOPPED') || null }
}

function save(name, body) {
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(body, null, 2)}\n`)
}

async function resume(previous, expectedNode, name, type = 'proceed') {
  const state = stopped(previous)
  if (!state.node) throw new Error(`I9_P7_EXPECTED_PAUSE_MISSING:${expectedNode}`)
  const result = await predict({
    question: type === 'proceed' ? 'Proceed' : 'Reject', chatId: previous.chatId || chatId,
    humanInput: { type, startNodeId: state.node.nodeId, feedback: '' },
    overrideConfig: { sessionId: previous.sessionId || chatId }
  })
  save(name, result.body)
  const next = stopped(result.body)
  if (!result.response.ok || (expectedNode && next.node?.nodeId !== expectedNode)) {
    throw new Error(`I9_P7_UNEXPECTED_RESUME:${name}:${result.response.status}:${next.node?.nodeId || 'NONE'}`)
  }
  return result.body
}

async function main() {
  const first = await predict({
    question: '验证客户在门户登录后，页眉姓名和头像与个人资料保持一致。',
    chatId, overrideConfig: { sessionId: chatId }
  })
  save('p7-01-confirm.json', first.body)
  if (!first.response.ok || stopped(first.body).node?.nodeId !== 'humanInputAgentflow_confirm') throw new Error('I9_P7_INITIAL_CONFIRMATION_MISSING')
  const generation = await resume(first.body, 'humanInputAgentflow_generation', 'p7-02-generation.json')
  await new Promise(resolve => setTimeout(resolve, 15_000))
  const activation = await resume(generation, 'humanInputAgentflow_activate', 'p7-03-activation.json')
  const runChoice = await resume(activation, 'humanInputAgentflow_run', 'p7-04-run-choice.json')

  const changed = await fetch(`${portalControl}/__mode/changed`, { method: 'POST' })
  if (!changed.ok) throw new Error('I9_P7_CONTROLLED_LOCATOR_CHANGE_FAILED')
  const repairConsent = await resume(runChoice, 'humanInputAgentflow_repair', 'p7-05-failure.json')
  const proposalConsent = await resume(repairConsent, 'humanInputAgentflow_repair_confirm', 'p7-06-proposal.json')
  const repairWait = await resume(proposalConsent, 'humanInputAgentflow_repair_wait', 'p7-07-repair-wait.json')
  await new Promise(resolve => setTimeout(resolve, 15_000))
  const repairActivation = await resume(repairWait, 'humanInputAgentflow_repair_activate', 'p7-08-repair-activation.json')
  const rerunChoice = await resume(repairActivation, 'humanInputAgentflow_repair_rerun', 'p7-09-rerun-choice.json')
  const scheduleChoice = await resume(rerunChoice, 'humanInputAgentflow_repair_schedule', 'p7-10-schedule-choice.json')
  const final = await resume(scheduleChoice, null, 'p7-11-final.json', 'reject')
  const terminal = stopped(final)
  const executedIds = new Set(terminal.executed.map(item => item.nodeId))
  const required = [
    'toolAgentflow_failure', 'llmAgentflow_repair', 'toolAgentflow_repair_propose',
    'toolAgentflow_repair_ready', 'toolAgentflow_repair_decision', 'toolAgentflow_repair_rerun',
    'toolAgentflow_repair_task', 'humanInputAgentflow_repair_schedule', 'directReplyAgentflow_repair_no_schedule'
  ]
  const text = String(final.text || '')
  const complete = !terminal.node && required.every(id => executedIds.has(id)) && /SUCCEEDED|PASSED/.test(text) && /没有静默迁移/.test(text)
  process.stdout.write(`${JSON.stringify({
    status: complete ? 'REVERSE_FLOW_VERIFIED' : 'REVERSE_FLOW_INCOMPLETE',
    controlledFailure: 'LOGIN_USERNAME_LOCATOR_CHANGE', contextStart: 'CTX-L1',
    stabilityRuns: 6, explicitActivation: true, explicitRerun: true,
    scheduleDecision: 'REJECTED_NO_MIGRATION', resultTerminal: /SUCCEEDED|PASSED/.test(text),
    executedNodeCount: terminal.executed.length, rawEvidencePrefix: '.data/evidence/i9/p7-'
  }, null, 2)}\n`)
  if (!complete) process.exitCode = 2
}

main().catch(error => {
  process.stderr.write(`${error.name === 'AbortError' ? 'I9_P7_PREDICTION_TIMEOUT' : String(error.message || 'I9_P7_PREDICTION_FAILED').replace(/[A-Za-z0-9_-]{32,}/g, '[REDACTED]')}\n`)
  process.exitCode = 2
})
