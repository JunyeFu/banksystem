import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {validateMcpLoopbackUrl} from './runtime-adapters.mjs'
import {SessionStoreError} from './session-store.mjs'
import {createRequire} from 'node:module'
const contract=createRequire(import.meta.url)('../../contracts/mcp/controller-sessions-v1.json')

export async function connectSessionPersistence({url,token}) {
  const endpoint=validateMcpLoopbackUrl(url);endpoint.pathname=contract.endpoint
  const client=new Client({name:'hengzhun-session-client',version:contract.contractVersion})
  const transport=new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{authorization:`Bearer ${token}`}},
    reconnectionOptions:{maxReconnectionDelay:1,initialReconnectionDelay:1,reconnectionDelayGrowFactor:1,maxRetries:0}})
  try {
    await client.connect(transport)
    const catalog=await client.listTools()
    if(JSON.stringify(catalog.tools.map(t=>t.name).sort())!==JSON.stringify(contract.operations.map(op=>`controller_session_${op}`).sort()))
      throw new SessionStoreError('SESSION_PERSISTENCE_CONTRACT_MISMATCH')
  }catch(error){await transport.close();if(error instanceof SessionStoreError)throw error;throw new SessionStoreError('SESSION_PERSISTENCE_UNAVAILABLE')}
  async function call(operation,args) {
    const result=await client.callTool({name:`controller_session_${operation}`,arguments:args})
    const value=JSON.parse(result.content.find(block=>block.type==='text').text)
    if(result.isError||value.errorCode)throw new SessionStoreError(/^SESSION_[A-Z_]+$/.test(value.errorCode)?value.errorCode:'SESSION_PERSISTENCE_FAILED')
    return value
  }
  return {save:(envelope,expectedRevision)=>call('save',{envelope,expectedRevision}),import:envelope=>call('import',{envelope,expectedRevision:0}),
    load:async sessionId=>(await call('load',{sessionId})).envelope,
    list:args=>call('list',args),purge:before=>call('purge',{before}),close:()=>client.close()}
}
