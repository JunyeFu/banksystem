'use strict'

const path = require('node:path')

const appPath = process.env.FLOWISE_PROBE_APP_PATH
if (!appPath) {
  throw new Error('FLOWISE_PROBE_APP_PATH is required')
}

const runtimeRequire = require('node:module').createRequire(path.join(appPath, 'package.json'))
const { McpServer } = runtimeRequire('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = runtimeRequire('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { createMcpExpressApp } = runtimeRequire('@modelcontextprotocol/sdk/server/express.js')
const z = runtimeRequire('zod/v4')

function createServer() {
  const server = new McpServer({ name: 'hengzhun-flowise-probe', version: '1.0.0' })

  server.registerTool(
    'probe_echo',
    {
      description: 'Return a deterministic value for the isolated Flowise MCP probe.',
      inputSchema: { text: z.string().min(1).max(256) }
    },
    async ({ text }) => ({ content: [{ type: 'text', text: `FLOWISE_MCP_OK:${text}` }] })
  )

  server.registerTool(
    'probe_knowledge_lookup',
    {
      description: 'Retrieve the deterministic portal-login rule used by the probe.',
      inputSchema: { query: z.string().min(1).max(256) }
    },
    async ({ query }) => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          source: 'knowledge/portal-login-consistency.md',
          rule: '登录后右上角姓名和头像必须与当前账户个人资料一致'
        })
      }]
    })
  )

  return server
}

const app = createMcpExpressApp()
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'hengzhun-flowise-probe-mcp' }))
app.post('/mcp', async (req, res) => {
  const server = createServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  } finally {
    res.on('close', () => {
      transport.close().catch(() => {})
      server.close().catch(() => {})
    })
  }
})

const port = Number(process.env.FLOWISE_PROBE_MCP_PORT || 3010)
app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`hengzhun-flowise-probe-mcp listening on 127.0.0.1:${port}\n`)
})
