'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const appPath = process.env.FLOWISE_PROBE_APP_PATH
  assert.ok(appPath, 'FLOWISE_PROBE_APP_PATH is required')
  const runtimeRequire = require('node:module').createRequire(path.join(appPath, 'package.json'))
  const { nodeClass: HumanInput } = runtimeRequire('flowise-components/dist/nodes/agentflow/HumanInput/HumanInput.js')
  const node = new HumanInput()
  const base = {
    id: 'humanInputAgentflow_probe',
    inputs: {
      humanInputDescriptionType: 'fixed',
      humanInputDescription: '是否批准执行门户登录回归？',
      humanInputEnableFeedback: true
    }
  }

  const paused = await node.run(base, '', {
    chatId: 'probe-chat',
    pastChatHistory: [{ role: 'assistant', content: '待执行：门户登录一致性案例' }],
    agentflowRuntime: { state: { caseId: 'probe-login-consistency' }, chatHistory: [] }
  })
  assert.match(paused.output.content, /是否批准执行门户登录回归/)

  const approved = await node.run({
    ...base,
    inputs: { ...base.inputs, humanInput: { type: 'proceed', feedback: '批准', startNodeId: base.id } }
  }, '', { agentflowRuntime: { state: paused.state, chatHistory: [] } })
  assert.equal(approved.output.conditions.find((item) => item.type === 'proceed').isFulfilled, true)
  assert.equal(approved.output.conditions.find((item) => item.type === 'reject').isFulfilled, false)

  const rejected = await node.run({
    ...base,
    inputs: { ...base.inputs, humanInput: { type: 'reject', feedback: '拒绝', startNodeId: base.id } }
  }, '', { agentflowRuntime: { state: paused.state, chatHistory: [] } })
  assert.equal(rejected.output.conditions.find((item) => item.type === 'reject').isFulfilled, true)

  process.stdout.write(JSON.stringify({ status: 'passed', node: node.name, paths: ['proceed', 'reject'] }) + '\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
