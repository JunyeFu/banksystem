import { randomUUID } from 'node:crypto'
import { readFile, open, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Dpapi, isPlatformSupported } from '@primno/dpapi'

// Only keys live here. Versioned public profiles and all task state remain in Harness.
export class ModelKeyStore {
  constructor({ root }) {
    if (!path.isAbsolute(root) || process.platform !== 'win32' || !isPlatformSupported) throw new Error('AGENT_MODEL_KEY_STORE_UNAVAILABLE')
    this.root = root
  }
  async put(namespace, apiKey) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096) throw new Error('AGENT_MODEL_KEY_REQUIRED')
    const keyRef = `modelkey_${randomUUID()}`
    const entropy = Buffer.from(`hengzhun-model-key/v1\0${namespace}\0${keyRef}`)
    const encrypted = Buffer.from(Dpapi.protectData(Buffer.from(apiKey), entropy, 'CurrentUser'))
    await mkdir(this.root, { recursive: true })
    const file = await open(path.join(this.root, `${keyRef}.hzk`), 'wx', 0o600)
    try { await file.writeFile(encrypted); await file.sync() } finally { await file.close() }
    return keyRef
  }
  async get(namespace, keyRef) {
    if (!/^modelkey_[0-9a-f-]{36}$/.test(keyRef)) throw new Error('AGENT_MODEL_KEY_REF_INVALID')
    const encrypted = await readFile(path.join(this.root, `${keyRef}.hzk`))
    try { return Buffer.from(Dpapi.unprotectData(encrypted, Buffer.from(`hengzhun-model-key/v1\0${namespace}\0${keyRef}`), 'CurrentUser')).toString('utf8') }
    catch { throw new Error('AGENT_MODEL_KEY_UNAVAILABLE') }
  }
}
