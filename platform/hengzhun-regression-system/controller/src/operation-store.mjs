import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Dpapi, isPlatformSupported } from '@primno/dpapi'

import { atomicWriteFile } from './session-store.mjs'

const ENVELOPE_SCHEMA = 'hengzhun-operation-envelope/v1'
const PAYLOAD_SCHEMA = 'hengzhun-operation-payload/v1'
const INDEX_SCHEMA = 'hengzhun-operation-index/v1'
const CIPHER = 'WINDOWS_DPAPI_CURRENT_USER'
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000
const OPERATION_ID = /^operation-[a-f0-9]{32}$/
const HASH = /^[a-f0-9]{64}$/
const KINDS = new Set(['CREDENTIAL_ENROLLMENT'])
const STATUSES = new Set(['ACTIVE', 'COMPLETED', 'ARCHIVED'])
const ENVELOPE_KEYS = Object.freeze([
  'cipher', 'ciphertextBase64', 'ciphertextSha256', 'createdAt', 'expiresAt', 'namespaceHash',
  'operationId', 'operationKind', 'releaseIdentityHash', 'revision', 'schemaVersion', 'status', 'updatedAt',
])

export class OperationStoreError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'OperationStoreError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}

function sha256(value) { return createHash('sha256').update(value).digest('hex') }
function requireOperationId(value) {
  if (!OPERATION_ID.test(String(value || ''))) throw new OperationStoreError('OPERATION_ID_INVALID')
  return value
}
function requireKind(value) {
  if (!KINDS.has(value)) throw new OperationStoreError('OPERATION_KIND_INVALID')
  return value
}
function requireText(value, code) {
  if (typeof value !== 'string' || !value) throw new OperationStoreError(code)
  return value
}
function parseDate(value) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new OperationStoreError('OPERATION_TIME_INVALID')
  return parsed
}
function entropy(operationId, releaseIdentityHash) {
  return Buffer.from(`${PAYLOAD_SCHEMA}\0${operationId}\0${releaseIdentityHash}`, 'utf8')
}
function defaultDpapi() {
  if (process.platform !== 'win32' || !isPlatformSupported) throw new OperationStoreError('OPERATION_DPAPI_PLATFORM_UNSUPPORTED')
  return Object.freeze({
    protect: (plain, additionalEntropy) => Buffer.from(Dpapi.protectData(plain, additionalEntropy, 'CurrentUser')),
    unprotect: (ciphertext, additionalEntropy) => Buffer.from(Dpapi.unprotectData(ciphertext, additionalEntropy, 'CurrentUser')),
  })
}
function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OperationStoreError('OPERATION_ENVELOPE_INVALID')
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...ENVELOPE_KEYS].sort())) throw new OperationStoreError('OPERATION_ENVELOPE_FIELDS_INVALID')
  if (value.schemaVersion !== ENVELOPE_SCHEMA || value.cipher !== CIPHER) throw new OperationStoreError('OPERATION_ENVELOPE_VERSION_INVALID')
  requireOperationId(value.operationId)
  requireKind(value.operationKind)
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new OperationStoreError('OPERATION_REVISION_INVALID')
  if (!STATUSES.has(value.status)) throw new OperationStoreError('OPERATION_STATUS_INVALID')
  if (!HASH.test(String(value.releaseIdentityHash))) throw new OperationStoreError('OPERATION_RELEASE_IDENTITY_INVALID')
  for (const field of ['namespaceHash', 'ciphertextSha256']) if (!HASH.test(String(value[field]))) throw new OperationStoreError('OPERATION_HASH_INVALID', { field })
  for (const field of ['createdAt', 'updatedAt', 'expiresAt']) parseDate(value[field])
  if (typeof value.ciphertextBase64 !== 'string' || !value.ciphertextBase64) throw new OperationStoreError('OPERATION_CIPHERTEXT_INVALID')
  return value
}
function validatePayload(payload, envelope) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schemaVersion !== PAYLOAD_SCHEMA) throw new OperationStoreError('OPERATION_PAYLOAD_VERSION_INVALID')
  for (const field of ['operationId', 'operationKind', 'revision', 'createdAt', 'updatedAt', 'expiresAt', 'status', 'releaseIdentityHash']) {
    if (payload[field] !== envelope[field]) throw new OperationStoreError('OPERATION_PAYLOAD_ENVELOPE_MISMATCH', { field })
  }
  if (sha256(payload.namespace) !== envelope.namespaceHash) throw new OperationStoreError('OPERATION_NAMESPACE_HASH_MISMATCH')
  if (!Array.isArray(payload.events) || !payload.proposalArguments || typeof payload.proposalArguments !== 'object' || Array.isArray(payload.proposalArguments)) {
    throw new OperationStoreError('OPERATION_PAYLOAD_SHAPE_INVALID')
  }
  return payload
}
function indexEntry(envelope) {
  const { cipher: _cipher, ciphertextBase64: _bytes, ciphertextSha256: _hash, ...safe } = envelope
  return Object.freeze({ ...safe })
}

export class EncryptedOperationStore {
  constructor({
    root,
    dpapi,
    now = () => Date.now(),
    retentionMs = DEFAULT_RETENTION_MS,
    operationIdFactory = () => `operation-${randomBytes(16).toString('hex')}`,
    atomicWriter = atomicWriteFile,
  } = {}) {
    if (!path.isAbsolute(String(root || ''))) throw new OperationStoreError('OPERATION_ROOT_INVALID')
    if (!Number.isInteger(retentionMs) || retentionMs < 60_000) throw new OperationStoreError('OPERATION_RETENTION_INVALID')
    this.root = path.resolve(root)
    this.dpapi = dpapi ?? defaultDpapi()
    this.now = now
    this.retentionMs = retentionMs
    this.operationIdFactory = operationIdFactory
    this.atomicWriter = atomicWriter
    this.indexPath = path.join(this.root, 'index-v1.json')
    this.mutationQueue = Promise.resolve()
  }

  operationPath(operationId) { return path.join(this.root, `${requireOperationId(operationId)}.hzo`) }

  async initialize() {
    try { await readFile(this.indexPath) } catch (error) {
      if (error?.code !== 'ENOENT') throw new OperationStoreError('OPERATION_INDEX_READ_FAILED')
      await this.#writeIndex([])
    }
    return this
  }

  async #readIndex() {
    let parsed
    try { parsed = JSON.parse(await readFile(this.indexPath, 'utf8')) } catch { throw new OperationStoreError('OPERATION_INDEX_INVALID') }
    if (parsed?.schemaVersion !== INDEX_SCHEMA || !Array.isArray(parsed.operations)) throw new OperationStoreError('OPERATION_INDEX_INVALID')
    return parsed.operations
  }

  async #writeIndex(operations) {
    const value = { schemaVersion: INDEX_SCHEMA, operations: [...operations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
    await this.atomicWriter(this.indexPath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'))
  }

  async #writePayload(payload) {
    const plain = Buffer.from(JSON.stringify(payload), 'utf8')
    let ciphertext
    try { ciphertext = this.dpapi.protect(plain, entropy(payload.operationId, payload.releaseIdentityHash)) } catch { throw new OperationStoreError('OPERATION_DPAPI_PROTECT_FAILED') }
    const envelope = validateEnvelope({
      schemaVersion: ENVELOPE_SCHEMA, cipher: CIPHER,
      operationId: payload.operationId, operationKind: payload.operationKind, revision: payload.revision,
      createdAt: payload.createdAt, updatedAt: payload.updatedAt, expiresAt: payload.expiresAt,
      status: payload.status, releaseIdentityHash: payload.releaseIdentityHash,
      namespaceHash: sha256(payload.namespace), ciphertextSha256: sha256(ciphertext), ciphertextBase64: ciphertext.toString('base64'),
    })
    await this.atomicWriter(this.operationPath(payload.operationId), Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, 'utf8'))
    const current = await this.#readIndex()
    await this.#writeIndex([...current.filter((item) => item.operationId !== payload.operationId), indexEntry(envelope)])
    return indexEntry(envelope)
  }

  async create({ namespace, operationKind, releaseIdentityHash, events = [], operationId: suppliedOperationId }) {
    requireText(namespace, 'OPERATION_NAMESPACE_INVALID')
    requireKind(operationKind)
    if (!HASH.test(String(releaseIdentityHash))) throw new OperationStoreError('OPERATION_RELEASE_IDENTITY_INVALID')
    const operationId = requireOperationId(suppliedOperationId ?? this.operationIdFactory())
    const timestamp = new Date(this.now()).toISOString()
    await this.#writePayload({
      schemaVersion: PAYLOAD_SCHEMA, operationId, operationKind, revision: 1,
      createdAt: timestamp, updatedAt: timestamp, expiresAt: new Date(this.now() + this.retentionMs).toISOString(),
      status: 'ACTIVE', releaseIdentityHash, namespace, events: structuredClone(events), proposalArguments: {},
    })
    return Object.freeze({ operationId, operationKind, revision: 1, status: 'ACTIVE' })
  }

  async load(operationId, { expectedReleaseIdentityHash, expectedKind, allowExpired = false } = {}) {
    let envelope
    try { envelope = validateEnvelope(JSON.parse(await readFile(this.operationPath(operationId), 'utf8'))) } catch (error) {
      if (error instanceof OperationStoreError) throw error
      if (error?.code === 'ENOENT') throw new OperationStoreError('OPERATION_NOT_FOUND')
      throw new OperationStoreError('OPERATION_ENVELOPE_INVALID')
    }
    if (expectedReleaseIdentityHash && envelope.releaseIdentityHash !== expectedReleaseIdentityHash) throw new OperationStoreError('OPERATION_RELEASE_IDENTITY_CONFLICT')
    if (expectedKind && envelope.operationKind !== expectedKind) throw new OperationStoreError('OPERATION_KIND_CONFLICT')
    const ciphertext = Buffer.from(envelope.ciphertextBase64, 'base64')
    if (sha256(ciphertext) !== envelope.ciphertextSha256) throw new OperationStoreError('OPERATION_CIPHERTEXT_TAMPERED')
    let plain
    try { plain = this.dpapi.unprotect(ciphertext, entropy(envelope.operationId, envelope.releaseIdentityHash)) } catch { throw new OperationStoreError('OPERATION_DPAPI_UNPROTECT_FAILED') }
    let payload
    try { payload = validatePayload(JSON.parse(Buffer.from(plain).toString('utf8')), envelope) } catch (error) {
      if (error instanceof OperationStoreError) throw error
      throw new OperationStoreError('OPERATION_PAYLOAD_INVALID')
    }
    if (!allowExpired && this.now() >= parseDate(payload.expiresAt)) throw new OperationStoreError('OPERATION_EXPIRED')
    return structuredClone(payload)
  }

  async update(operationId, releaseIdentityHash, mutator) {
    const action = this.mutationQueue.then(async () => {
      const payload = await this.load(operationId, { expectedReleaseIdentityHash: releaseIdentityHash })
      if (payload.status !== 'ACTIVE') throw new OperationStoreError('OPERATION_NOT_ACTIVE')
      const originalRevision = payload.revision
      const next = await mutator(structuredClone(payload))
      if (!next || next.operationId !== operationId || next.revision !== originalRevision) throw new OperationStoreError('OPERATION_UPDATE_INVALID')
      next.revision += 1
      next.updatedAt = new Date(this.now()).toISOString()
      await this.#writePayload(next)
      return structuredClone(next)
    })
    this.mutationQueue = action.catch(() => undefined)
    return action
  }

  appendEvent(operationId, releaseIdentityHash, event) {
    return this.update(operationId, releaseIdentityHash, (payload) => { payload.events.push(structuredClone(event)); return payload })
  }
  putProposalArguments(operationId, releaseIdentityHash, proposalId, args) {
    requireText(proposalId, 'OPERATION_PROPOSAL_ID_INVALID')
    return this.update(operationId, releaseIdentityHash, (payload) => { payload.proposalArguments[proposalId] = structuredClone(args); return payload })
  }
  async getProposalArguments(operationId, releaseIdentityHash, proposalId) {
    const payload = await this.load(operationId, { expectedReleaseIdentityHash: releaseIdentityHash })
    return payload.proposalArguments[proposalId] === undefined ? undefined : structuredClone(payload.proposalArguments[proposalId])
  }
  deleteProposalArguments(operationId, releaseIdentityHash, proposalId) {
    return this.update(operationId, releaseIdentityHash, (payload) => { delete payload.proposalArguments[proposalId]; return payload })
  }
  complete(operationId, releaseIdentityHash, event) {
    return this.update(operationId, releaseIdentityHash, (payload) => {
      if (event) payload.events.push(structuredClone(event))
      payload.proposalArguments = {}
      payload.status = 'COMPLETED'
      return payload
    })
  }
  list() { return this.#readIndex().then((items) => items.map((item) => Object.freeze({ ...item }))) }
}

export { DEFAULT_RETENTION_MS as OPERATION_RETENTION_MS }
