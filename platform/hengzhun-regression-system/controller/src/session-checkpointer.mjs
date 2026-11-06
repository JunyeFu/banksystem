import { MemorySaver } from '@langchain/langgraph'

import { SessionStoreError } from './session-store.mjs'

const BYTES_MARKER = '__hengzhunUint8ArrayBase64'

function encode(value) {
  if (value instanceof Uint8Array) return { [BYTES_MARKER]: Buffer.from(value).toString('base64') }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encode(nested)]))
  }
  return value
}

function decode(value) {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value[BYTES_MARKER] === 'string') {
      return Uint8Array.from(Buffer.from(value[BYTES_MARKER], 'base64'))
    }
    const restored = Object.create(null)
    for (const [key, nested] of Object.entries(value)) restored[key] = decode(nested)
    return restored
  }
  return value
}

export class EncryptedSessionCheckpointer extends MemorySaver {
  constructor({ store, sessionId, releaseIdentityHash }) {
    super()
    if (!store?.setCheckpointSnapshot) throw new SessionStoreError('SESSION_CHECKPOINTER_STORE_INVALID')
    this.sessionStore = store
    this.sessionId = sessionId
    this.releaseIdentityHash = releaseIdentityHash
    this.persistQueue = Promise.resolve()
  }

  static async create(options) {
    const saver = new EncryptedSessionCheckpointer(options)
    const payload = await options.store.load(options.sessionId, {
      expectedReleaseIdentityHash: options.releaseIdentityHash,
    })
    saver.revision = payload.revision
    if (payload.checkpointSnapshot !== null) {
      if (
        payload.checkpointSnapshot?.schemaVersion !== 'hengzhun-langgraph-checkpoint-snapshot/v1' ||
        !payload.checkpointSnapshot.storage || !payload.checkpointSnapshot.writes
      ) throw new SessionStoreError('SESSION_CHECKPOINT_SNAPSHOT_INVALID')
      saver.storage = decode(payload.checkpointSnapshot.storage)
      saver.writes = decode(payload.checkpointSnapshot.writes)
    }
    return saver
  }

  snapshot() {
    return {
      schemaVersion: 'hengzhun-langgraph-checkpoint-snapshot/v1',
      storage: encode(this.storage),
      writes: encode(this.writes),
    }
  }

  async persist() {
    const snapshot=this.snapshot()
    const operation=this.persistQueue.then(async()=>{
      const saved=await this.sessionStore.setCheckpointSnapshot(this.sessionId,this.releaseIdentityHash,snapshot,()=>this.revision)
      this.revision=saved.revision
    })
    this.persistQueue=operation
    await operation
  }

  async put(...args) {
    const result = await super.put(...args)
    await this.persist()
    return result
  }

  async putWrites(...args) {
    await super.putWrites(...args)
    await this.persist()
  }

  async deleteThread(...args) {
    await super.deleteThread(...args)
    await this.persist()
  }
}

export { decode as decodeCheckpointSnapshot, encode as encodeCheckpointSnapshot }
