'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const SCHEMA_VERSION = 'hengzhun-operation-recovery-v1'
const VALID_STATUSES = new Set([
  'RUNNING',
  'INTERRUPTED_RECOVERABLE',
  'FAILED_RECOVERABLE',
  'INVALIDATED',
  'COMPLETED'
])

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex')
}

function hmacFingerprint(secret, value) {
  return crypto.createHmac('sha256', String(secret)).update(String(value)).digest('hex')
}

function writeJsonAtomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, target)
}

function pidExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

class RecoveryStore {
  constructor(root, operation, operationVersion, options = {}) {
    this.root = path.resolve(root)
    this.operation = String(operation).toUpperCase()
    this.operationVersion = String(operationVersion)
    this.directory = path.join(this.root, '.data', 'recovery')
    this.activePath = path.join(this.directory, `${this.operation.toLowerCase()}.json`)
    this.successPath = path.join(this.directory, `${this.operation.toLowerCase()}-last-success.json`)
    this.lockPath = path.join(this.directory, `${this.operation.toLowerCase()}.lock`)
    this.restart = options.restart === true || process.env.HENGZHUN_RESUME_MODE === 'restart'
    this.state = null
    this.locked = false
  }

  acquire() {
    fs.mkdirSync(this.directory, { recursive: true })
    if (fs.existsSync(this.lockPath)) {
      let existing = null
      try { existing = JSON.parse(fs.readFileSync(this.lockPath, 'utf8')) } catch {}
      if (existing && pidExists(Number(existing.pid))) {
        const error = new Error(`${this.operation}已有另一个实例正在运行`)
        error.code = 'RECOVERY_OPERATION_ALREADY_RUNNING'
        throw error
      }
      fs.rmSync(this.lockPath, { force: true })
    }
    const descriptor = fs.openSync(this.lockPath, 'wx')
    fs.writeFileSync(descriptor, `${JSON.stringify({ operation: this.operation, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`)
    fs.closeSync(descriptor)
    this.locked = true
  }

  release() {
    if (this.locked) fs.rmSync(this.lockPath, { force: true })
    this.locked = false
  }

  read() {
    if (!fs.existsSync(this.activePath)) return null
    try {
      const value = JSON.parse(fs.readFileSync(this.activePath, 'utf8'))
      if (value.schemaVersion !== SCHEMA_VERSION ||
          value.operation !== this.operation ||
          value.operationVersion !== this.operationVersion ||
          !VALID_STATUSES.has(value.status) ||
          !Array.isArray(value.completedItems)) {
        throw new Error('RECOVERY_STATE_SCHEMA_INVALID')
      }
      return value
    } catch (cause) {
      const error = new Error(`恢复文件无效：${path.relative(this.root, this.activePath)}`)
      error.code = 'RECOVERY_STATE_INVALID'
      error.cause = cause
      throw error
    }
  }

  begin(inputFingerprint, initial = {}) {
    this.acquire()
    if (this.restart) this.invalidate('USER_RESTART', true)
    let previous = this.read()
    if (previous?.status === 'INVALIDATED') {
      fs.rmSync(this.activePath, { force: true })
      previous = null
    }
    if (previous && previous.inputFingerprint !== inputFingerprint) {
      this.invalidate('INPUT_FINGERPRINT_CHANGED', true)
    }
    this.state = this.read() || {
      schemaVersion: SCHEMA_VERSION,
      operation: this.operation,
      operationVersion: this.operationVersion,
      status: 'RUNNING',
      stageIndex: 0,
      stageName: '',
      inputFingerprint,
      completedItems: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastErrorCode: null,
      recoverable: true,
      ...initial
    }
    this.state.status = 'RUNNING'
    this.state.updatedAt = new Date().toISOString()
    writeJsonAtomic(this.activePath, this.state)
    return { state: this.state, resumed: Boolean(previous && previous.inputFingerprint === inputFingerprint) }
  }

  checkpoint(stageIndex, stageName, completedItems = this.state?.completedItems || [], extra = {}) {
    if (!this.state) throw new Error('RECOVERY_NOT_STARTED')
    this.state = {
      ...this.state,
      status: 'RUNNING',
      stageIndex,
      stageName,
      completedItems,
      updatedAt: new Date().toISOString(),
      lastErrorCode: null,
      recoverable: true,
      ...extra
    }
    writeJsonAtomic(this.activePath, this.state)
    return this.state
  }

  fail(error, recoverable = true, interrupted = false) {
    if (!this.state) return
    this.state = {
      ...this.state,
      status: interrupted ? 'INTERRUPTED_RECOVERABLE' : recoverable ? 'FAILED_RECOVERABLE' : 'INVALIDATED',
      updatedAt: new Date().toISOString(),
      lastErrorCode: error?.code || 'FAILED',
      recoverable
    }
    writeJsonAtomic(this.activePath, this.state)
  }

  invalidate(reason, remove = false) {
    if (!fs.existsSync(this.activePath)) return
    if (remove) {
      fs.rmSync(this.activePath, { force: true })
      return
    }
    const current = this.read()
    writeJsonAtomic(this.activePath, {
      ...current,
      status: 'INVALIDATED',
      updatedAt: new Date().toISOString(),
      lastErrorCode: reason,
      recoverable: false
    })
  }

  complete(summary = {}) {
    if (!this.state) return
    writeJsonAtomic(this.successPath, {
      schemaVersion: SCHEMA_VERSION,
      operation: this.operation,
      operationVersion: this.operationVersion,
      status: 'COMPLETED',
      startedAt: this.state.startedAt,
      completedAt: new Date().toISOString(),
      summary
    })
    fs.rmSync(this.activePath, { force: true })
    this.state = null
  }
}

module.exports = {
  RecoveryStore,
  SCHEMA_VERSION,
  fingerprint,
  hmacFingerprint,
  stableJson,
  writeJsonAtomic
}
