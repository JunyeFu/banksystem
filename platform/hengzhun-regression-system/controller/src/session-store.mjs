import { createHash, randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { Dpapi, isPlatformSupported } from '@primno/dpapi'

const ENVELOPE_SCHEMA = 'hengzhun-session-envelope/v1'
const PAYLOAD_SCHEMA = 'hengzhun-session-payload/v1'
const INDEX_SCHEMA = 'hengzhun-session-index/v1'
const CIPHER = 'WINDOWS_DPAPI_CURRENT_USER'
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_ID = /^session-[a-f0-9]{32}$/
const HASH = /^[a-f0-9]{64}$/
const SAFE_STATUS = new Set(['ACTIVE', 'COMPLETED', 'ARCHIVED'])
const ENVELOPE_KEYS = Object.freeze([
  'cipher', 'ciphertextBase64', 'ciphertextSha256', 'createdAt', 'expiresAt', 'journeyIdHash',
  'namespaceHash', 'releaseIdentityHash', 'revision', 'schemaVersion', 'sessionId', 'status',
  'threadIdHash', 'updatedAt',
])

export class SessionStoreError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'SessionStoreError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertString(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new SessionStoreError(code)
  return value
}

function assertSessionId(value) {
  if (!SESSION_ID.test(String(value))) throw new SessionStoreError('SESSION_ID_INVALID')
  return value
}

function parseDate(value, code) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new SessionStoreError(code)
  return parsed
}

function entropy(sessionId, releaseIdentityHash) {
  return Buffer.from(`${PAYLOAD_SCHEMA}\0${sessionId}\0${releaseIdentityHash}`, 'utf8')
}

function defaultDpapi() {
  if (process.platform !== 'win32' || !isPlatformSupported) {
    throw new SessionStoreError('SESSION_DPAPI_PLATFORM_UNSUPPORTED')
  }
  return Object.freeze({
    protect(plain, additionalEntropy) {
      return Buffer.from(Dpapi.protectData(plain, additionalEntropy, 'CurrentUser'))
    },
    unprotect(ciphertext, additionalEntropy) {
      return Buffer.from(Dpapi.unprotectData(ciphertext, additionalEntropy, 'CurrentUser'))
    },
  })
}

export async function atomicWriteFile(filePath, bytes, { beforeRename } = {}) {
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true })
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)
  let handle
  try {
    handle = await open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    if (beforeRename) await beforeRename({ temporary, target: filePath })
    await rename(temporary, filePath)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(temporary, { force: true }).catch(() => undefined)
    if (error instanceof SessionStoreError) throw error
    throw new SessionStoreError('SESSION_ATOMIC_WRITE_FAILED')
  }
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new SessionStoreError('SESSION_ENVELOPE_INVALID')
  }
  if (JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify([...ENVELOPE_KEYS].sort())) {
    throw new SessionStoreError('SESSION_ENVELOPE_FIELDS_INVALID')
  }
  if (envelope.schemaVersion !== ENVELOPE_SCHEMA || envelope.cipher !== CIPHER) {
    throw new SessionStoreError('SESSION_ENVELOPE_VERSION_INVALID')
  }
  assertSessionId(envelope.sessionId)
  if (!Number.isInteger(envelope.revision) || envelope.revision < 1) throw new SessionStoreError('SESSION_REVISION_INVALID')
  if (!HASH.test(envelope.releaseIdentityHash)) throw new SessionStoreError('SESSION_RELEASE_IDENTITY_INVALID')
  for (const field of ['namespaceHash', 'threadIdHash', 'journeyIdHash', 'ciphertextSha256']) {
    if (!HASH.test(envelope[field])) throw new SessionStoreError('SESSION_ENVELOPE_HASH_INVALID', { field })
  }
  for (const field of ['createdAt', 'updatedAt', 'expiresAt']) parseDate(envelope[field], 'SESSION_ENVELOPE_TIME_INVALID')
  if (!SAFE_STATUS.has(envelope.status)) throw new SessionStoreError('SESSION_STATUS_INVALID')
  if (typeof envelope.ciphertextBase64 !== 'string' || envelope.ciphertextBase64.length === 0) {
    throw new SessionStoreError('SESSION_CIPHERTEXT_INVALID')
  }
  return envelope
}

function validatePayload(payload, envelope) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schemaVersion !== PAYLOAD_SCHEMA) {
    throw new SessionStoreError('SESSION_PAYLOAD_VERSION_INVALID')
  }
  for (const field of ['sessionId', 'revision', 'createdAt', 'updatedAt', 'expiresAt', 'status', 'releaseIdentityHash']) {
    if (payload[field] !== envelope[field]) throw new SessionStoreError('SESSION_PAYLOAD_ENVELOPE_MISMATCH', { field })
  }
  if (
    sha256(payload.namespace) !== envelope.namespaceHash || sha256(payload.threadId) !== envelope.threadIdHash ||
    sha256(payload.journeyId) !== envelope.journeyIdHash
  ) throw new SessionStoreError('SESSION_BINDING_HASH_MISMATCH')
  if (!Array.isArray(payload.events) || !payload.proposalArguments || typeof payload.proposalArguments !== 'object') {
    throw new SessionStoreError('SESSION_PAYLOAD_SHAPE_INVALID')
  }
  return payload
}

function indexEntry(envelope) {
  const { ciphertextBase64: _ciphertext, cipher: _cipher, ciphertextSha256: _digest, ...safe } = envelope
  return Object.freeze({ ...safe })
}

export class EncryptedSessionStore {
  constructor({
    root,
    dpapi,
    now = () => Date.now(),
    retentionMs = DEFAULT_RETENTION_MS,
    sessionIdFactory = () => `session-${randomBytes(16).toString('hex')}`,
    atomicWriter = atomicWriteFile,
  } = {}) {
    if (!path.isAbsolute(String(root || ''))) throw new SessionStoreError('SESSION_ROOT_INVALID')
    if (!Number.isInteger(retentionMs) || retentionMs < 60_000) throw new SessionStoreError('SESSION_RETENTION_INVALID')
    this.root = path.resolve(root)
    this.dpapi = dpapi ?? defaultDpapi()
    this.now = now
    this.retentionMs = retentionMs
    this.sessionIdFactory = sessionIdFactory
    this.atomicWriter = atomicWriter
    this.indexPath = path.join(this.root, 'index-v1.json')
    this.mutationQueue = Promise.resolve()
  }

  sessionPath(sessionId) {
    return path.join(this.root, `${assertSessionId(sessionId)}.hzs`)
  }

  async initialize() {
    await mkdir(this.root, { recursive: true })
    try { await readFile(this.indexPath) } catch (error) {
      if (error?.code !== 'ENOENT') throw new SessionStoreError('SESSION_INDEX_READ_FAILED')
      await this.#writeIndex([])
    }
    return this
  }

  async #readIndex() {
    let parsed
    try { parsed = JSON.parse(await readFile(this.indexPath, 'utf8')) } catch {
      throw new SessionStoreError('SESSION_INDEX_INVALID')
    }
    if (parsed?.schemaVersion !== INDEX_SCHEMA || !Array.isArray(parsed.sessions)) {
      throw new SessionStoreError('SESSION_INDEX_INVALID')
    }
    return parsed.sessions
  }

  async #writeIndex(sessions) {
    const document = { schemaVersion: INDEX_SCHEMA, sessions: [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
    await this.atomicWriter(this.indexPath, Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8'))
  }

  async #upsertIndex(envelope) {
    const sessions = await this.#readIndex()
    const next = sessions.filter((item) => item.sessionId !== envelope.sessionId)
    next.push(indexEntry(envelope))
    await this.#writeIndex(next)
  }

  #seal(payload) {
    const plain = Buffer.from(JSON.stringify(payload), 'utf8')
    let ciphertext
    try { ciphertext = this.dpapi.protect(plain, entropy(payload.sessionId, payload.releaseIdentityHash)) } catch {
      throw new SessionStoreError('SESSION_DPAPI_PROTECT_FAILED')
    }
    return validateEnvelope({
      schemaVersion: ENVELOPE_SCHEMA,
      cipher: CIPHER,
      sessionId: payload.sessionId,
      revision: payload.revision,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      expiresAt: payload.expiresAt,
      status: payload.status,
      releaseIdentityHash: payload.releaseIdentityHash,
      namespaceHash: sha256(payload.namespace),
      threadIdHash: sha256(payload.threadId),
      journeyIdHash: sha256(payload.journeyId),
      ciphertextSha256: sha256(ciphertext),
      ciphertextBase64: ciphertext.toString('base64'),
    })
  }

  async #writePayload(payload) {
    const envelope = this.#seal(payload)
    await this.atomicWriter(this.sessionPath(payload.sessionId), Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, 'utf8'))
    await this.#upsertIndex(envelope)
    return indexEntry(envelope)
  }

  async create({ namespace, threadId, journeyId, releaseIdentityHash, events = [], sessionId: suppliedSessionId }) {
    for (const [field, value] of Object.entries({ namespace, threadId, journeyId })) assertString(value, `SESSION_${field.toUpperCase()}_INVALID`)
    if (!HASH.test(String(releaseIdentityHash))) throw new SessionStoreError('SESSION_RELEASE_IDENTITY_INVALID')
    const sessionId = assertSessionId(suppliedSessionId ?? this.sessionIdFactory())
    const timestamp = new Date(this.now()).toISOString()
    const payload = {
      schemaVersion: PAYLOAD_SCHEMA,
      sessionId,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(this.now() + this.retentionMs).toISOString(),
      status: 'ACTIVE',
      namespace,
      threadId,
      journeyId,
      releaseIdentityHash,
      events: structuredClone(events),
      checkpointSnapshot: null,
      proposalArguments: {},
    }
    await this.#writePayload(payload)
    return Object.freeze({ sessionId, revision: 1, status: 'ACTIVE' })
  }

  async load(sessionId, { expectedReleaseIdentityHash, expectedNamespace, expectedThreadId, expectedJourneyId, allowExpired = false } = {}) {
    let envelope
    try { envelope = validateEnvelope(JSON.parse(await readFile(this.sessionPath(sessionId), 'utf8'))) } catch (error) {
      if (error instanceof SessionStoreError) throw error
      if (error?.code === 'ENOENT') throw new SessionStoreError('SESSION_NOT_FOUND')
      throw new SessionStoreError('SESSION_ENVELOPE_INVALID')
    }
    if (expectedReleaseIdentityHash && envelope.releaseIdentityHash !== expectedReleaseIdentityHash) {
      throw new SessionStoreError('SESSION_RELEASE_IDENTITY_CONFLICT')
    }
    const ciphertext = Buffer.from(envelope.ciphertextBase64, 'base64')
    if (sha256(ciphertext) !== envelope.ciphertextSha256) throw new SessionStoreError('SESSION_CIPHERTEXT_TAMPERED')
    let plain
    try { plain = this.dpapi.unprotect(ciphertext, entropy(envelope.sessionId, envelope.releaseIdentityHash)) } catch {
      throw new SessionStoreError('SESSION_DPAPI_UNPROTECT_FAILED')
    }
    let payload
    try { payload = validatePayload(JSON.parse(Buffer.from(plain).toString('utf8')), envelope) } catch (error) {
      if (error instanceof SessionStoreError) throw error
      throw new SessionStoreError('SESSION_PAYLOAD_INVALID')
    }
    if (!allowExpired && this.now() >= parseDate(payload.expiresAt, 'SESSION_EXPIRES_AT_INVALID')) {
      throw new SessionStoreError('SESSION_EXPIRED')
    }
    for (const [expected, actual, code] of [
      [expectedNamespace, payload.namespace, 'SESSION_NAMESPACE_CONFLICT'],
      [expectedThreadId, payload.threadId, 'SESSION_THREAD_CONFLICT'],
      [expectedJourneyId, payload.journeyId, 'SESSION_JOURNEY_CONFLICT'],
    ]) if (expected !== undefined && expected !== actual) throw new SessionStoreError(code)
    return structuredClone(payload)
  }

  async update(sessionId, expectedReleaseIdentityHash, mutator) {
    const operation = this.mutationQueue.then(async () => {
      const payload = await this.load(sessionId, { expectedReleaseIdentityHash })
      const originalRevision = payload.revision
      const next = await mutator(structuredClone(payload))
      if (!next || next.sessionId !== sessionId || next.revision !== originalRevision) {
        throw new SessionStoreError('SESSION_UPDATE_INVALID')
      }
      next.revision += 1
      next.updatedAt = new Date(this.now()).toISOString()
      await this.#writePayload(next)
      return structuredClone(next)
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  async appendEvent(sessionId, releaseIdentityHash, event) {
    return this.update(sessionId, releaseIdentityHash, (payload) => {
      payload.events.push(structuredClone(event))
      return payload
    })
  }

  async setCheckpointSnapshot(sessionId, releaseIdentityHash, snapshot) {
    return this.update(sessionId, releaseIdentityHash, (payload) => {
      payload.checkpointSnapshot = structuredClone(snapshot)
      return payload
    })
  }

  async putProposalArguments(sessionId, releaseIdentityHash, proposalId, args) {
    assertString(proposalId, 'SESSION_PROPOSAL_ID_INVALID')
    await this.update(sessionId, releaseIdentityHash, (payload) => {
      payload.proposalArguments[proposalId] = structuredClone(args)
      return payload
    })
  }

  async getProposalArguments(sessionId, releaseIdentityHash, proposalId) {
    const payload = await this.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
    return payload.proposalArguments[proposalId] === undefined ? undefined : structuredClone(payload.proposalArguments[proposalId])
  }

  async deleteProposalArguments(sessionId, releaseIdentityHash, proposalId) {
    await this.update(sessionId, releaseIdentityHash, (payload) => {
      delete payload.proposalArguments[proposalId]
      return payload
    })
  }

  async archive(sessionId, releaseIdentityHash) {
    return this.update(sessionId, releaseIdentityHash, (payload) => {
      payload.status = 'ARCHIVED'
      payload.proposalArguments = {}
      return payload
    })
  }

  async rebindJourney(sessionId, releaseIdentityHash, { expectedJourneyId, journeyId }) {
    assertString(expectedJourneyId, 'SESSION_EXPECTED_JOURNEY_INVALID')
    assertString(journeyId, 'SESSION_JOURNEY_INVALID')
    if (expectedJourneyId === journeyId) throw new SessionStoreError('SESSION_JOURNEY_REBIND_NOOP')
    return this.update(sessionId, releaseIdentityHash, (payload) => {
      if (payload.journeyId !== expectedJourneyId) throw new SessionStoreError('SESSION_JOURNEY_CONFLICT')
      if (payload.checkpointSnapshot !== null) throw new SessionStoreError('SESSION_JOURNEY_REBIND_CHECKPOINT_EXISTS')
      if (payload.events.some((event) => event?.type === 'JOURNEY_BOOTSTRAP_RESOLVED')) {
        throw new SessionStoreError('SESSION_JOURNEY_REBIND_ALREADY_RESOLVED')
      }
      payload.journeyId = journeyId
      return payload
    })
  }

  async fork(sessionId, { releaseIdentityHash, threadId, sessionIdFactory } = {}) {
    const source = await this.load(sessionId, { expectedReleaseIdentityHash: releaseIdentityHash })
    return this.create({
      namespace: source.namespace,
      threadId: assertString(threadId, 'SESSION_THREAD_INVALID'),
      journeyId: source.journeyId,
      releaseIdentityHash,
      events: source.events.filter((event) => event?.type !== 'APPROVAL_PENDING'),
      ...(sessionIdFactory ? { sessionId: sessionIdFactory() } : {}),
    })
  }

  async list() {
    return Object.freeze((await this.#readIndex()).map((item) => Object.freeze({ ...item })))
  }

  async purgeExpired() {
    const sessions = await this.#readIndex()
    const retained = []
    let deleted = 0
    for (const entry of sessions) {
      if (this.now() < Date.parse(entry.expiresAt)) retained.push(entry)
      else {
        await rm(this.sessionPath(entry.sessionId), { force: true })
        deleted += 1
      }
    }
    await this.#writeIndex(retained)
    return deleted
  }
}

export function createInMemoryProposalVault() {
  const values = new Map()
  return Object.freeze({
    async put(proposalId, args) { values.set(proposalId, structuredClone(args)) },
    async get(proposalId) { return values.has(proposalId) ? structuredClone(values.get(proposalId)) : undefined },
    async delete(proposalId) { values.delete(proposalId) },
  })
}

export function createSessionProposalVault({ store, sessionId, releaseIdentityHash }) {
  return Object.freeze({
    put: (proposalId, args) => store.putProposalArguments(sessionId, releaseIdentityHash, proposalId, args),
    get: (proposalId) => store.getProposalArguments(sessionId, releaseIdentityHash, proposalId),
    delete: (proposalId) => store.deleteProposalArguments(sessionId, releaseIdentityHash, proposalId),
  })
}

export { CIPHER, DEFAULT_RETENTION_MS, ENVELOPE_SCHEMA, INDEX_SCHEMA, PAYLOAD_SCHEMA }
