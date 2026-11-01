'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const z = require('zod/v4')
const { projectCanonicalHarnessError } = require('./rf001-contract-adapter.cjs')

// A separate tool surface in the SAME process. The existing 39-tool /mcp contract is unchanged.
function createWorkbenchMetadataServer({ namespace, requestHarness, textResult }) {
  z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/).parse(namespace)
  const contract = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../contracts/mcp/workbench-metadata-v1.json'), 'utf8'))
  if (contract.schemaVersion !== 'hengzhun-workbench-metadata/v1' || contract.contractVersion !== '1.1.0') throw new Error('WORKBENCH_CONTRACT_INVALID')
  const server = new McpServer({ name: 'hengzhun-workbench-metadata', version: contract.contractVersion })
  for (const tool of contract.tools) {
    const inputSchema = z.fromJSONSchema(tool.inputSchema)
    const outputSchema = z.fromJSONSchema(tool.outputSchema)
    server.registerTool(tool.name, {
      description: `Controller-only ${tool.access.toLowerCase()} conversation metadata; never executes a bank or browser task.`,
      inputSchema, annotations: { readOnlyHint: tool.access === 'READ', destructiveHint: false, openWorldHint: false }
    }, async (input) => {
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) return textResult({ errorCode: 'AGENT_METADATA_INPUT_INVALID', status: 400 }, true)
      const { response, body } = await requestHarness(tool.route, { namespace, ...parsed.data })
      if (!response.ok) return textResult(projectCanonicalHarnessError(body, response.status), true)
      const safe = outputSchema.safeParse(body)
      if (!safe.success) return textResult({ errorCode: 'AGENT_METADATA_RESPONSE_INVALID', status: 502 }, true)
      return textResult(safe.data, false, tool.maxOutputBytes)
    })
  }
  return server
}
module.exports = { createWorkbenchMetadataServer }
