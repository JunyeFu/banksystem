'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')

async function main() {
  const appPath = process.env.FLOWISE_PROBE_APP_PATH
  const endpoint = process.env.FLOWISE_PROBE_MCP_URL || 'http://127.0.0.1:3010/mcp'
  assert.ok(appPath, 'FLOWISE_PROBE_APP_PATH is required')

  const runtimeRequire = require('node:module').createRequire(path.join(appPath, 'package.json'))
  const { MCPToolkit } = runtimeRequire('flowise-components/dist/nodes/tools/MCP/core.js')
  const toolkit = new MCPToolkit({ url: endpoint }, 'sse')
  await toolkit.initialize()

  const names = toolkit.tools.map((tool) => tool.name).sort()
  assert.deepEqual(names, ['probe_echo', 'probe_knowledge_lookup'])

  const echo = toolkit.tools.find((tool) => tool.name === 'probe_echo')
  const result = await echo.invoke({ text: 'windows-native' })
  assert.match(result, /FLOWISE_MCP_OK:windows-native/)

  const knowledge = toolkit.tools.find((tool) => tool.name === 'probe_knowledge_lookup')
  const retrieved = await knowledge.invoke({ query: '门户登录后检查什么' })
  assert.match(retrieved, /姓名和头像必须与当前账户个人资料一致/)

  process.stdout.write(JSON.stringify({ status: 'passed', transport: 'streamable-http', tools: names }) + '\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
