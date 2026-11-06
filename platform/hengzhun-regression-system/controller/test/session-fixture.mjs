// Unit-test storage only. Native SQLite/MCP concurrency is verified separately.
import {EncryptedSessionStore,SessionStoreError,indexEntry} from '../src/session-store.mjs'
const roots=new Map()
export class TestSessionStore extends EncryptedSessionStore {
  constructor({root,...options}={}) {
    if(!roots.has(root))roots.set(root,new Map())
    const records=roots.get(root)
    const persistence={records,
      async save(envelope,expectedRevision) {
        if((records.get(envelope.sessionId)?.revision??0)!==expectedRevision)throw new SessionStoreError('SESSION_REVISION_CONFLICT')
        if(persistence.failure)throw persistence.failure
        records.set(envelope.sessionId,structuredClone(envelope))
        return {revision:envelope.revision}
      },
      async load(id) {if(!records.has(id))throw new SessionStoreError('SESSION_NOT_FOUND');return structuredClone(records.get(id))},
      async list({cursor}={}) {return {sessions:[...records.values()].filter(e=>!cursor||e.sessionId>cursor).map(indexEntry)}},
      async purge(before) {let deleted=0;for(const [id,e] of records)if(e.expiresAt<=before){records.delete(id);deleted++}return {deleted}},
    }
    super({persistence,...options})
  }
}
