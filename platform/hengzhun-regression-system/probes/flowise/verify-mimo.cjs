'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const appPath = process.env.FLOWISE_PROBE_APP_PATH
  assert.ok(appPath, 'FLOWISE_PROBE_APP_PATH is required')
  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) {
    process.stdout.write(JSON.stringify({ status: 'blocked', reason: 'MIMO_API_KEY_NOT_IN_PROCESS_ENV' }) + '\n')
    process.exitCode = 2
    return
  }

  const runtimeRequire = require('node:module').createRequire(path.join(appPath, 'package.json'))
  const { nodeClass: ChatOpenAI } = runtimeRequire('flowise-components/dist/nodes/chatmodels/ChatOpenAI/ChatOpenAI.js')
  const { HumanMessage, ToolMessage } = runtimeRequire('@langchain/core/messages')
  const { tool } = runtimeRequire('@langchain/core/tools')
  const z = runtimeRequire('zod')
  const node = new ChatOpenAI()
  const model = await node.init({
    id: 'mimo-v2.5-flowise-probe',
    inputs: {
      modelName: 'mimo-v2.5',
      openAIApiKey: apiKey,
      basepath: 'https://api.xiaomimimo.com/v1',
      temperature: '0',
      maxTokens: '128',
      streaming: false
    }
  }, '', {})

  let stage = 'single_response'
  try {
    const response = await model.invoke('用一句简短中文确认连接正常。')
    assert.ok(String(response.content || '').trim().length > 0, 'MiMo returned an empty response')

    stage = 'tool_call'
    const echoTool = tool(async ({ text }) => `FLOWISE_MCP_OK:${text}`, {
      name: 'probe_echo',
      description: 'Return a deterministic Flowise probe value.',
      schema: z.object({ text: z.string().min(1) })
    })
    const modelWithTools = model.bindTools([echoTool])
    const request = new HumanMessage('必须调用 probe_echo 工具，text 参数使用 mimo-tool-call；不要直接回答。')
    const toolRequest = await modelWithTools.invoke([request])
    assert.ok(Array.isArray(toolRequest.tool_calls) && toolRequest.tool_calls.length > 0, 'MiMo did not return a structured tool call')
    const selectedCall = toolRequest.tool_calls.find((item) => item.name === 'probe_echo')
    assert.ok(selectedCall, 'MiMo selected an unexpected tool')

    stage = 'tool_result_continuation'
    const toolResult = await echoTool.invoke(selectedCall.args)
    const continuation = await modelWithTools.invoke([
      request,
      toolRequest,
      new ToolMessage({ content: String(toolResult), tool_call_id: selectedCall.id, name: selectedCall.name })
    ])
    assert.ok(String(continuation.content || '').trim().length > 0, 'MiMo returned an empty continuation')

    process.stdout.write(JSON.stringify({
      status: 'passed',
      provider: 'MiMo',
      model: 'mimo-v2.5',
      adapter: node.name,
      checks: ['single_response', 'tool_call', 'tool_result_continuation']
    }) + '\n')
  } catch (error) {
    error.probeStage = stage
    throw error
  }
}

main().catch((error) => {
  const status = error?.status || error?.response?.status || 'unknown'
  process.stderr.write(JSON.stringify({
    status: 'failed',
    provider: 'MiMo',
    stage: error?.probeStage || 'initialization',
    httpStatus: status,
    errorType: error?.name || 'Error'
  }) + '\n')
  process.exitCode = 1
})
