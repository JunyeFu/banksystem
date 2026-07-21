#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const publication = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i9/p5-agentflow-publication-v1.json'), 'utf8'))
const outputPath = path.join(root, '.data/evidence/i9/p6-first-prediction.json')
const resumedOutputPath = path.join(root, '.data/evidence/i9/p6-confirmed-prediction.json')
const generationOutputPath = path.join(root, '.data/evidence/i9/p6-generation-prediction.json')
const activationOutputPath = path.join(root, '.data/evidence/i9/p6-activation-prediction.json')
const finalOutputPath = path.join(root, '.data/evidence/i9/p6-final-prediction.json')
const base = process.env.FLOWISE_URL || 'http://127.0.0.1:3006'

async function predict(payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 240_000)
  try {
    const response = await fetch(`${base}/api/v1/prediction/${publication.flowId}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = { parseStatus: 'NON_JSON', length: text.length } }
    return { response, body }
  } finally { clearTimeout(timer) }
}

async function main() {
  const first = await predict({
    question: '验证客户在门户登录后，页眉姓名和头像与个人资料保持一致。',
    chatId: 'i9-p6-forward-probe',
    overrideConfig: { sessionId: 'i9-p6-forward-probe' }
  })
  const { response, body } = first
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(body, null, 2)}\n`)
  const executed = Array.isArray(body?.agentFlowExecutedData) ? body.agentFlowExecutedData : []
  const stoppedNode = executed.find(item => item?.status === 'STOPPED')
  const action = stoppedNode?.data?.output?.humanInputAction || null
  const firstSummary = {
    status: response.ok ? 'PREDICTION_RECEIVED' : 'PREDICTION_REJECTED',
    httpStatus: response.status,
    responseKeys: body && typeof body === 'object' ? Object.keys(body).sort() : [],
    hasHumanInputAction: Boolean(action),
    humanInputType: action ? 'AGENTFLOW_V2_APPROVAL' : null,
    stoppedNodeId: stoppedNode?.nodeId || null,
    rawEvidence: '.data/evidence/i9/p6-first-prediction.json'
  }
  if (!response.ok || !action || stoppedNode.nodeId !== 'humanInputAgentflow_confirm') {
    process.stdout.write(`${JSON.stringify(firstSummary, null, 2)}\n`)
    process.exitCode = 2
    return
  }

  const resumed = await predict({
    question: 'Proceed',
    chatId: body.chatId || 'i9-p6-forward-probe',
    humanInput: { type: 'proceed', startNodeId: stoppedNode.nodeId, feedback: '' },
    overrideConfig: { sessionId: body.sessionId || 'i9-p6-forward-probe' }
  })
  fs.writeFileSync(resumedOutputPath, `${JSON.stringify(resumed.body, null, 2)}\n`)
  const resumedExecuted = Array.isArray(resumed.body?.agentFlowExecutedData) ? resumed.body.agentFlowExecutedData : []
  const resumedStopped = resumedExecuted.find(item => item?.status === 'STOPPED')
  const resumedAction = resumedStopped?.data?.output?.humanInputAction || null
  if (!resumed.response.ok || !resumedAction || resumedStopped.nodeId !== 'humanInputAgentflow_generation') {
    process.stdout.write(`${JSON.stringify({
      ...firstSummary,
      confirmationResume: {
        httpStatus: resumed.response.status,
        status: resumed.response.ok ? 'RESUME_RECEIVED' : 'RESUME_REJECTED',
        executedNodeIds: resumedExecuted.map(item => item.nodeId),
        stoppedNodeId: resumedStopped?.nodeId || null,
        rawEvidence: '.data/evidence/i9/p6-confirmed-prediction.json'
      }
    }, null, 2)}\n`)
    process.exitCode = 2
    return
  }

  await new Promise(resolve => setTimeout(resolve, 15_000))
  const generated = await predict({
    question: 'Proceed',
    chatId: resumed.body.chatId || body.chatId || 'i9-p6-forward-probe',
    humanInput: { type: 'proceed', startNodeId: resumedStopped.nodeId, feedback: '' },
    overrideConfig: { sessionId: resumed.body.sessionId || body.sessionId || 'i9-p6-forward-probe' }
  })
  fs.writeFileSync(generationOutputPath, `${JSON.stringify(generated.body, null, 2)}\n`)
  const generatedExecuted = Array.isArray(generated.body?.agentFlowExecutedData) ? generated.body.agentFlowExecutedData : []
  const generatedStopped = generatedExecuted.find(item => item?.status === 'STOPPED')
  const generatedAction = generatedStopped?.data?.output?.humanInputAction || null
  if (!generated.response.ok || !generatedAction || generatedStopped.nodeId !== 'humanInputAgentflow_activate') {
    process.stdout.write(`${JSON.stringify({
      ...firstSummary,
      generationResume: {
        httpStatus: generated.response.status,
        status: generated.response.ok ? 'RESUME_RECEIVED' : 'RESUME_REJECTED',
        executedNodeIds: generatedExecuted.map(item => item.nodeId),
        stoppedNodeId: generatedStopped?.nodeId || null,
        rawEvidence: '.data/evidence/i9/p6-generation-prediction.json'
      }
    }, null, 2)}\n`)
    process.exitCode = 2
    return
  }

  const activated = await predict({
    question: 'Proceed',
    chatId: generated.body.chatId || resumed.body.chatId || body.chatId || 'i9-p6-forward-probe',
    humanInput: { type: 'proceed', startNodeId: generatedStopped.nodeId, feedback: '' },
    overrideConfig: { sessionId: generated.body.sessionId || resumed.body.sessionId || body.sessionId || 'i9-p6-forward-probe' }
  })
  fs.writeFileSync(activationOutputPath, `${JSON.stringify(activated.body, null, 2)}\n`)
  const activatedExecuted = Array.isArray(activated.body?.agentFlowExecutedData) ? activated.body.agentFlowExecutedData : []
  const activatedStopped = activatedExecuted.find(item => item?.status === 'STOPPED')
  const activatedAction = activatedStopped?.data?.output?.humanInputAction || null
  if (!activated.response.ok || !activatedAction || activatedStopped.nodeId !== 'humanInputAgentflow_run') {
    process.stdout.write(`${JSON.stringify({
      ...firstSummary,
      generationStoppedNodeId: generatedStopped.nodeId,
      activationResume: {
        httpStatus: activated.response.status,
        status: activated.response.ok ? 'RESUME_RECEIVED' : 'RESUME_REJECTED',
        executedNodeIds: activatedExecuted.map(item => item.nodeId),
        stoppedNodeId: activatedStopped?.nodeId || null,
        rawEvidence: '.data/evidence/i9/p6-activation-prediction.json'
      }
    }, null, 2)}\n`)
    process.exitCode = 2
    return
  }

  const final = await predict({
    question: 'Proceed',
    chatId: activated.body.chatId || generated.body.chatId || resumed.body.chatId || body.chatId || 'i9-p6-forward-probe',
    humanInput: { type: 'proceed', startNodeId: activatedStopped.nodeId, feedback: '' },
    overrideConfig: { sessionId: activated.body.sessionId || generated.body.sessionId || resumed.body.sessionId || body.sessionId || 'i9-p6-forward-probe' }
  })
  fs.writeFileSync(finalOutputPath, `${JSON.stringify(final.body, null, 2)}\n`)
  const finalExecuted = Array.isArray(final.body?.agentFlowExecutedData) ? final.body.agentFlowExecutedData : []
  const finalStopped = finalExecuted.find(item => item?.status === 'STOPPED')
  const finalText = String(final.body?.text || '')
  const requiredNodes = ['toolAgentflow_candidate', 'humanInputAgentflow_generation', 'toolAgentflow_candidate_ready', 'toolAgentflow_preview', 'humanInputAgentflow_activate', 'toolAgentflow_activate', 'humanInputAgentflow_run', 'toolAgentflow_run', 'toolAgentflow_task', 'directReplyAgentflow_result']
  const executedIds = new Set(finalExecuted.map(item => item.nodeId))
  const complete = final.response.ok && !finalStopped && requiredNodes.every(id => executedIds.has(id)) && /SUCCEEDED|PASSED/.test(finalText)
  process.stdout.write(`${JSON.stringify({
    ...firstSummary,
    confirmationResume: {
      httpStatus: resumed.response.status,
      status: 'LOCAL_GENERATION_IN_PROGRESS',
      stoppedNodeId: resumedStopped.nodeId,
      rawEvidence: '.data/evidence/i9/p6-confirmed-prediction.json'
    },
    generationResume: {
      httpStatus: generated.response.status,
      status: 'ACTIVATION_REVIEW_REQUIRED',
      stoppedNodeId: generatedStopped.nodeId,
      rawEvidence: '.data/evidence/i9/p6-generation-prediction.json'
    },
    activationResume: {
      httpStatus: activated.response.status,
      status: 'RUN_CHOICE_REQUIRED',
      stoppedNodeId: activatedStopped.nodeId,
      rawEvidence: '.data/evidence/i9/p6-activation-prediction.json'
    },
    finalResume: {
      httpStatus: final.response.status,
      status: complete ? 'FORWARD_FLOW_VERIFIED' : 'FORWARD_FLOW_INCOMPLETE',
      executedNodeIds: finalExecuted.map(item => item.nodeId),
      stoppedNodeId: finalStopped?.nodeId || null,
      resultTerminal: /SUCCEEDED|PASSED/.test(finalText),
      rawEvidence: '.data/evidence/i9/p6-final-prediction.json'
    }
  }, null, 2)}\n`)
  if (!complete) process.exitCode = 2
}

main().catch(error => {
  process.stderr.write(`${error.name === 'AbortError' ? 'I9_P6_PREDICTION_TIMEOUT' : 'I9_P6_PREDICTION_TRANSPORT_FAILED'}\n`)
  process.exitCode = 2
})
