import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {EncryptedSessionStore,validateEnvelope,indexEntry,SessionStoreError} from '../controller/src/session-store.mjs'
import {connectSessionPersistence} from '../controller/src/session-persistence.mjs'

export async function importLegacySessions({directory,namespace,persistence,dpapi}) {
  const index=JSON.parse(await fs.readFile(path.join(directory,'index-v1.json'),'utf8'))
  if(index.schemaVersion!=='hengzhun-session-index/v1'||!Array.isArray(index.sessions))throw new SessionStoreError('SESSION_INDEX_INVALID')
  const files=(await fs.readdir(directory,{withFileTypes:true})).filter(e=>e.name.endsWith('.hzs'))
  if(files.length!==index.sessions.length||new Set(index.sessions.map(e=>e.sessionId)).size!==index.sessions.length)throw new SessionStoreError('SESSION_INDEX_INVALID')
  const envelopes=[]
  for(const file of files) {
    if(!file.isFile())throw new SessionStoreError('SESSION_ENVELOPE_INVALID')
    const envelope=validateEnvelope(JSON.parse(await fs.readFile(path.join(directory,file.name),'utf8')))
    const metadata=index.sessions.find(e=>`${e.sessionId}.hzs`===file.name)
    if(!metadata||Object.entries(indexEntry(envelope)).some(([key,value])=>metadata[key]!==value))throw new SessionStoreError('SESSION_INDEX_INVALID')
    const reader=new EncryptedSessionStore({persistence:{load:async()=>envelope,save(){},list(){}},dpapi})
    await reader.load(envelope.sessionId,{expectedNamespace:namespace,allowExpired:true})
    envelopes.push(envelope)
  }
  for(const envelope of envelopes) {
    await persistence.import(envelope)
    const actual=await persistence.load(envelope.sessionId)
    if(Object.keys(envelope).some(key=>actual[key]!==envelope[key]))throw new SessionStoreError('SESSION_IMPORT_READBACK_MISMATCH')
  }
  return {imported:envelopes.length,originalFilesUnchanged:true}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..')
  const lifecycle=require('./i10-agent-lifecycle.cjs'),env=lifecycle.environmentWithRuntimeFile({root})
  const source=process.argv[2]
  if(!path.isAbsolute(source??''))throw new SessionStoreError('SESSION_IMPORT_SOURCE_REQUIRED')
  const persistence=await connectSessionPersistence({url:env.HENGZHUN_MCP_URL,token:env.HENGZHUN_MCP_TOKEN})
  try { console.log(JSON.stringify(await importLegacySessions({directory:source,namespace:env.HENGZHUN_AGENT_NAMESPACE,persistence}))) }
  finally {await persistence.close()}
}
