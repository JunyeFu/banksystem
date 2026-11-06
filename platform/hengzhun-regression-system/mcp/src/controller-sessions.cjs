'use strict'
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js')
const z=require('zod/v4')
const contract=require('../../contracts/mcp/controller-sessions-v1.json')
const {projectCanonicalHarnessError}=require('./rf001-contract-adapter.cjs')
function createControllerSessionServer({namespace,requestHarness,textResult}) {
  const server=new McpServer({name:'hengzhun-controller-sessions',version:contract.contractVersion})
  const id=z.string().regex(/^session-[a-f0-9]{32}$/)
  const schemas={save:{expectedRevision:z.number().int().nonnegative(),envelope:z.record(z.string(),z.unknown())},
    load:{sessionId:id},list:{cursor:id.optional()},purge:{before:z.string().datetime()}}
  schemas.import=schemas.save
  for(const [operation,inputSchema] of Object.entries(schemas))server.registerTool(`controller_session_${operation}`,{
    description:'Controller-only opaque encrypted checkpoint storage. Never exposed to the model.',inputSchema
  },async input=>{
    const {response,body}=await requestHarness(`/v1/controller-sessions/${operation}`,{namespace,...input})
    return response.ok?textResult(body,false,contract.maxOutputBytes):textResult(projectCanonicalHarnessError(body,response.status),true)
  })
  return server
}
module.exports={createControllerSessionServer}
