import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { validateMcpLoopbackUrl } from '../../controller/src/runtime-adapters.mjs'
import { WorkbenchError } from './workbench-http.mjs'

export async function connectWorkbenchMetadata({ url, token }) {
  const endpoint = validateMcpLoopbackUrl(url)
  endpoint.pathname = '/mcp/workbench'
  const client = new Client({ name: 'hengzhun-workbench', version: '1.1.0' })
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    reconnectionOptions: { maxReconnectionDelay: 1, initialReconnectionDelay: 1, reconnectionDelayGrowFactor: 1, maxRetries: 0 },
  })
  try { await client.connect(transport) } catch { await transport.close(); throw new WorkbenchError('AGENT_METADATA_UNAVAILABLE', 503) }
  return {
    async call(name, args = {}) {
      let result
      try { result = await client.callTool({ name: `workbench_${name}`, arguments: args }) }
      catch { throw new WorkbenchError('AGENT_METADATA_UNAVAILABLE', 503) }
      const blocks = result?.content?.filter(item => item.type === 'text')
      let value
      try { value = JSON.parse(blocks[0].text) } catch { throw new WorkbenchError('AGENT_METADATA_RESPONSE_INVALID', 503) }
      if (result.isError || value.errorCode) {
        const code = value.errorCode
        throw new WorkbenchError(/^AGENT_[A-Z0-9_]+$/.test(code) ? code : 'AGENT_METADATA_FAILED',
          /CONFLICT|BUSY|TERMINAL|TRANSITION/.test(code) ? 409 : /NOT_FOUND/.test(code) ? 404 : 400)
      }
      return value
    },
    close: () => client.close(),
  }
}
