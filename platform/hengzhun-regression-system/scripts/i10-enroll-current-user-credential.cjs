#!/usr/bin/env node
'use strict'

// Local-only bridge used by controlled test-account provisioning.  It accepts
// credentials only on stdin, encrypts them with the current Windows user DPAPI
// scope, and returns an opaque credentialRef.  It never writes plaintext to a
// file or stdout.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.resolve(__dirname, '..')
const { protectWithCurrentUserDpapi } = require('../dist/harness/src/i10/dpapi.js')
let stage = 'STARTUP'
let inputDiagnostics = { bytes: 0, firstByte: -1 }

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function opaque(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function main() {
  stage = 'PARSE_INPUT'
  const rawInput = fs.readFileSync(0)
  inputDiagnostics = { bytes: rawInput.length, firstByte: rawInput.length ? rawInput[0] : -1 }
  const inputText = rawInput.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? rawInput.subarray(3).toString('utf8')
    : rawInput.toString('utf8')
  const input = JSON.parse(inputText)
  const namespace = String(input.namespace || '')
  const username = String(input.username || '')
  const password = String(input.password || '')
  const label = String(input.label || '本机受控验收客户')
  const requestedCredentialRef = input.credentialRef ? String(input.credentialRef) : ''
  if (!/^[a-z][a-z0-9-]{2,63}$/i.test(namespace)) fail('I10_CREDENTIAL_NAMESPACE_INVALID')
  if (!username || username.length > 256 || !password || password.length > 1024) fail('I10_CREDENTIAL_INPUT_INVALID')

  const databasePath = path.join(root, '.data', 'sqlite', 'regression_platform.sqlite')
  const credentialRoot = path.join(root, '.data', 'credentials')
  if (!fs.existsSync(databasePath)) fail('I10_CREDENTIAL_DATABASE_MISSING')
  fs.mkdirSync(credentialRoot, { recursive: true })

  const credentialRef = requestedCredentialRef || opaque('credential')
  if (requestedCredentialRef && !/^credential_[0-9a-f-]{36}$/i.test(requestedCredentialRef)) fail('I10_CREDENTIAL_REF_INVALID')
  if (requestedCredentialRef) {
    const database = new Database(databasePath, { readonly: true })
    try {
      const existing = database.prepare('SELECT credential_ref FROM i10_credential_refs WHERE namespace=? AND credential_ref=?').get(namespace, credentialRef)
      if (!existing) fail('I10_CREDENTIAL_REF_NOT_FOUND')
    } finally {
      database.close()
    }
    process.stdout.write(`${JSON.stringify({ status: 'READY', credentialRef })}\n`)
    return
  }
  const sessionId = opaque('credsession')
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()
  stage = 'DPAPI_PROTECT'
  const plaintext = Buffer.from(JSON.stringify({ username, password }), 'utf8')
  let encrypted
  try {
    encrypted = protectWithCurrentUserDpapi(plaintext)
  } finally {
    plaintext.fill(0)
  }
  const blobPath = path.join(credentialRoot, `${credentialRef}.bin`)
  try {
    stage = 'WRITE_ENCRYPTED_BLOB'
    fs.writeFileSync(blobPath, encrypted, { flag: requestedCredentialRef ? 'wx' : 'wx', mode: 0o600 })
    stage = 'WRITE_CREDENTIAL_METADATA'
    const database = new Database(databasePath)
    try {
      database.pragma('busy_timeout = 10000')
      database.pragma('foreign_keys = ON')
      database.transaction(() => {
        database.prepare("INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)")
          .run(namespace, now, now)
        if (requestedCredentialRef) {
          fail('I10_CREDENTIAL_REF_ALREADY_EXISTS')
        } else {
          database.prepare("INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,credential_ref,version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'READY',?,1,?,?,?)")
            .run(sessionId, namespace, `controlled-provision-${credentialRef}`, label, sha256(crypto.randomBytes(32)), credentialRef, expiresAt, now, now)
          database.prepare("INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at) VALUES (?,?,?,?,?,'WINDOWS_DPAPI_CURRENT_USER',?)")
            .run(credentialRef, namespace, sessionId, `.data/credentials/${credentialRef}.bin`, sha256(encrypted), now)
        }
      })()
    } finally {
      database.close()
    }
  } catch (error) {
    try { fs.unlinkSync(blobPath) } catch {}
    throw error
  } finally {
    encrypted?.fill(0)
  }
  process.stdout.write(`${JSON.stringify({ status: 'READY', credentialRef })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: String(error?.code || 'I10_CREDENTIAL_ENROLL_FAILED').replace(/[^A-Z0-9_]/g, '_'), failureStage: typeof stage === 'string' ? stage : 'UNKNOWN', inputBytes: inputDiagnostics.bytes, firstByte: inputDiagnostics.firstByte })}\n`)
  process.exitCode = 2
}
