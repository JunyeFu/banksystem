const CHECKPOINT_SCHEMA_VERSION = '1'
const SECRET_KEY = /(?:password|passwd|secret|token|cookie|authorization|api.?key|credential(?!Ref)|storage.?state)/i
const HOST_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/
const TRACE_FIELDS = Object.freeze([
  'at', 'event', 'requestId', 'namespace', 'threadId', 'journeyId', 'proposalId',
  'contentHash', 'toolName', 'status', 'failureCode', 'harnessVersion', 'releaseIdentityHash',
])

export class ControllerSecurityError extends Error {
  constructor(code, details) {
    super(code)
    this.name = 'ControllerSecurityError'
    this.code = code
    this.details = details
  }
}

export function assertCheckpointSafe(value, path = '$', depth = 0) {
  if (depth > 20) throw new ControllerSecurityError('AGENT_CONTROLLER_CHECKPOINT_DEPTH_INVALID', path)
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    if (HOST_PATH.test(value)) throw new ControllerSecurityError('AGENT_CONTROLLER_HOST_PATH_FORBIDDEN', path)
    return value
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCheckpointSafe(item, `${path}[${index}]`, depth + 1))
    return value
  }
  if (typeof value !== 'object') {
    throw new ControllerSecurityError('AGENT_CONTROLLER_CHECKPOINT_TYPE_INVALID', path)
  }
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || key === 'userInput' || key === 'arguments' || key === 'rawPayload') {
      throw new ControllerSecurityError('AGENT_CONTROLLER_CHECKPOINT_SECRET_FIELD', `${path}.${key}`)
    }
    assertCheckpointSafe(nested, `${path}.${key}`, depth + 1)
  }
  return value
}

export function safeTrace(event) {
  const trace = {}
  for (const field of TRACE_FIELDS) {
    if (event[field] !== undefined) trace[field] = event[field]
  }
  assertCheckpointSafe(trace)
  return Object.freeze(trace)
}

export class ScratchVfs {
  #files = new Map()
  #bytes = 0

  constructor({ maxBytes = 64 * 1024 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1) {
      throw new ControllerSecurityError('AGENT_CONTROLLER_SCRATCH_QUOTA_INVALID')
    }
    this.maxBytes = maxBytes
  }

  #path(value) {
    if (
      typeof value !== 'string' || value.length === 0 || value.includes('\\') ||
      value.startsWith('/') || value.split('/').some((part) => part === '..' || part === '')
    ) {
      throw new ControllerSecurityError('AGENT_CONTROLLER_SCRATCH_PATH_INVALID', value)
    }
    return value
  }

  write(filePath, content) {
    const safePath = this.#path(filePath)
    if (typeof content !== 'string') throw new ControllerSecurityError('AGENT_CONTROLLER_SCRATCH_CONTENT_INVALID')
    const nextBytes = new TextEncoder().encode(content).byteLength
    const previous = this.#files.get(safePath)
    const previousBytes = previous ? new TextEncoder().encode(previous).byteLength : 0
    if (this.#bytes - previousBytes + nextBytes > this.maxBytes) {
      throw new ControllerSecurityError('AGENT_CONTROLLER_SCRATCH_QUOTA_EXCEEDED')
    }
    this.#files.set(safePath, content)
    this.#bytes = this.#bytes - previousBytes + nextBytes
  }

  read(filePath) {
    const safePath = this.#path(filePath)
    if (!this.#files.has(safePath)) throw new ControllerSecurityError('AGENT_CONTROLLER_SCRATCH_NOT_FOUND')
    return this.#files.get(safePath)
  }

  clear() {
    this.#files.clear()
    this.#bytes = 0
  }

  get sizeBytes() { return this.#bytes }
}

export function createControllerSecurity({
  checkpointer,
  now = () => Date.now(),
  ttlMs = 15 * 60 * 1000,
} = {}) {
  if (!checkpointer?.deleteThread || !Number.isInteger(ttlMs) || ttlMs < 1) {
    throw new ControllerSecurityError('AGENT_CONTROLLER_SECURITY_CONFIG_INVALID')
  }
  const bindings = new Map()
  const traces = []

  function bindThread({ namespace, threadId, journeyId, releaseIdentityHash }) {
    for (const [field, value] of Object.entries({ namespace, threadId, journeyId, releaseIdentityHash })) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new ControllerSecurityError('AGENT_CONTROLLER_THREAD_BINDING_INVALID', field)
      }
    }
    const existing = bindings.get(threadId)
    if (existing && (
      existing.namespace !== namespace || existing.journeyId !== journeyId ||
      existing.releaseIdentityHash !== releaseIdentityHash
    )) {
      throw new ControllerSecurityError('AGENT_CONTROLLER_THREAD_BINDING_CONFLICT')
    }
    if (!existing) {
      bindings.set(threadId, Object.freeze({
        checkpointSchemaVersion: CHECKPOINT_SCHEMA_VERSION,
        namespace, threadId, journeyId, releaseIdentityHash,
        createdAt: now(), expiresAt: now() + ttlMs, status: 'ACTIVE',
      }))
    }
    return bindings.get(threadId)
  }

  function assertActive({ namespace, threadId, journeyId }) {
    const binding = bindings.get(threadId)
    if (!binding) throw new ControllerSecurityError('AGENT_CONTROLLER_THREAD_NOT_FOUND')
    if (binding.namespace !== namespace) throw new ControllerSecurityError('AGENT_CONTROLLER_NAMESPACE_CONFLICT')
    if (binding.journeyId !== journeyId) throw new ControllerSecurityError('AGENT_CONTROLLER_JOURNEY_CONFLICT')
    if (binding.status !== 'ACTIVE') throw new ControllerSecurityError('AGENT_CONTROLLER_THREAD_COMPLETED')
    if (now() >= binding.expiresAt) throw new ControllerSecurityError('AGENT_CONTROLLER_THREAD_EXPIRED')
    return binding
  }

  function complete(threadId) {
    const binding = bindings.get(threadId)
    if (!binding) return
    bindings.set(threadId, Object.freeze({ ...binding, status: 'COMPLETED' }))
  }

  async function cleanupExpired() {
    let deleted = 0
    for (const [threadId, binding] of bindings) {
      if (now() < binding.expiresAt) continue
      await checkpointer.deleteThread(threadId)
      bindings.delete(threadId)
      deleted += 1
    }
    return deleted
  }

  function recordTrace(event) {
    const trace = safeTrace({ ...event, at: event.at ?? new Date(now()).toISOString() })
    traces.push(trace)
    return trace
  }

  return Object.freeze({
    checkpointSchemaVersion: CHECKPOINT_SCHEMA_VERSION,
    bindThread, assertActive, complete, cleanupExpired, recordTrace,
    assertCheckpointSafe,
    traces: () => Object.freeze([...traces]),
  })
}

export { CHECKPOINT_SCHEMA_VERSION, TRACE_FIELDS }
