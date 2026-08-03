#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const configPath = path.join(root, 'config', 'platform-admin.json')
const databasePath = path.join(root, '.data', 'flowise', 'database.sqlite')
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i10.runtime.example.json'), 'utf8'))

function configuration() {
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  assert.equal(value.schemaVersion, 'hengzhun-local-platform-admin-v1')
  assert.equal(value.mode, 'FIXED_LOCAL_PORTABLE_ADMIN')
  assert.equal(value.scope, 'FLOWISE_LOCAL_UI_ONLY')
  assert.equal(value.modelAccessAllowed, false)
  assert.match(value.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  assert.ok(typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 100)
  assert.match(value.password, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/)
  return value
}

function dependencies() {
  return {
    Database: require(path.join(root, 'node_modules', 'better-sqlite3')),
    bcrypt: require(path.join(root, 'flowise', 'app', 'node_modules', 'bcryptjs'))
  }
}

function safeResult(status, extra = {}) {
  return { schemaVersion: 'hengzhun-platform-admin-result-v1', status, emailConfigured: true, passwordConfigured: true, secretPrinted: false, ...extra }
}

function flowiseProcessIsRunning() {
  const stateFile = path.join(root, '.data', 'runtime', 'i9-processes.json')
  if (!fs.existsSync(stateFile)) return false
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    const pid = Number(state?.services?.find(item => item.name === 'flowise')?.pid)
    if (!Number.isInteger(pid) || pid <= 0) return false
    process.kill(pid, 0)
    return true
  } catch { return false }
}

function flowiseUserCount(targetDatabase) {
  if (!fs.existsSync(targetDatabase)) return 0
  const { Database } = dependencies()
  const database = new Database(targetDatabase, { readonly: true, fileMustExist: true })
  try {
    const table = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user'").get()
    return table ? Number(database.prepare('SELECT COUNT(*) AS count FROM "user"').get().count) : 0
  } finally { database.close() }
}

function flowiseRegistrationCredential(password) {
  // Flowise 3.0.12 requires a special character during registration. The
  // portable UI contract intentionally keeps the user-facing fixed password
  // unchanged, so use a one-time in-memory bootstrap credential and rotate the
  // stored hash immediately after the account transaction commits.
  return /[^a-zA-Z0-9]/.test(password) ? password : `${password}!`
}

function rotateRegisteredCredential(targetDatabase, admin) {
  const { Database, bcrypt } = dependencies()
  const database = new Database(targetDatabase)
  try {
    const credential = bcrypt.hashSync(admin.password, bcrypt.genSaltSync(Number(process.env.PASSWORD_SALT_HASH_ROUNDS || 5)))
    const now = new Date().toISOString()
    const changed = database.transaction(() => {
      const users = database.prepare('SELECT id, email FROM "user" ORDER BY createdDate, id').all()
      assert.equal(users.length, 1, 'PLATFORM_ADMIN_ROTATION_REQUIRES_SINGLE_USER_DATABASE')
      assert.equal(String(users[0].email).toLowerCase(), admin.email.toLowerCase(), 'PLATFORM_ADMIN_ROTATION_IDENTITY_MISMATCH')
      return database.prepare('UPDATE "user" SET credential = ?, updatedDate = ?, updatedBy = ? WHERE id = ? AND lower(email) = lower(?)')
        .run(credential, now, users[0].id, users[0].id, admin.email).changes
    })()
    assert.equal(changed, 1, 'PLATFORM_ADMIN_ROTATION_WRITE_FAILED')
  } finally {
    database.close()
  }
}

function reconcileExisting(options = {}) {
  const admin = configuration()
  const targetDatabase = options.databasePath || databasePath
  if (!options.databasePath && flowiseProcessIsRunning()) return safeResult('FLOWISE_RUNNING_RECONCILE_SKIPPED', { databasePresent: fs.existsSync(targetDatabase) })
  if (!fs.existsSync(targetDatabase)) return safeResult('PENDING_FIRST_REGISTRATION', { databasePresent: false })
  const { Database, bcrypt } = dependencies()
  const database = new Database(targetDatabase)
  try {
    const table = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user'").get()
    if (!table) return safeResult('PENDING_FIRST_REGISTRATION', { databasePresent: true, userTablePresent: false })
    const users = database.prepare('SELECT id, email FROM "user" ORDER BY createdDate, id').all()
    if (users.length === 0) return safeResult('PENDING_FIRST_REGISTRATION', { databasePresent: true, userTablePresent: true })
    assert.equal(users.length, 1, 'PLATFORM_ADMIN_RECONCILE_REQUIRES_SINGLE_USER_DATABASE')
    const credential = bcrypt.hashSync(admin.password, bcrypt.genSaltSync(Number(process.env.PASSWORD_SALT_HASH_ROUNDS || 5)))
    const now = new Date().toISOString()
    database.transaction(() => {
      database.prepare('UPDATE "user" SET name = ?, email = ?, credential = ?, status = ?, tempToken = NULL, tokenExpiry = NULL, updatedDate = ?, updatedBy = ? WHERE id = ?')
        .run(admin.name, admin.email, credential, 'active', now, users[0].id, users[0].id)
    })()
    return safeResult('EXISTING_ADMIN_RECONCILED', { databasePresent: true, userCount: 1, identityChanged: users[0].email !== admin.email })
  } finally {
    database.close()
  }
}

function cookieHeader(headers) {
  const combined = headers.get('set-cookie')
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []
  return values.map(value => String(value).split(';', 1)[0]).join('; ')
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = text
  try { body = text ? JSON.parse(text) : null } catch {}
  return { response, body }
}

async function login(base, admin) {
  return request(`${base}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: admin.password })
  })
}

async function ensureLive(options = {}) {
  const admin = configuration()
  const base = options.baseUrl || process.env.FLOWISE_URL || `http://${runtime.network.host}:${runtime.network.flowisePort}`
  let result = await login(base, admin)
  let registered = false
  if (!result.response.ok) {
    const targetDatabase = options.databasePath || databasePath
    assert.equal(flowiseUserCount(targetDatabase), 0, 'PLATFORM_ADMIN_EXISTING_LOGIN_FAILED_STOP_AND_PREPARE')
    const registration = await request(`${base}/api/v1/account/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user: {
          name: admin.name,
          email: admin.email,
          type: 'pro',
          credential: flowiseRegistrationCredential(admin.password)
        }
      })
    })
    assert.ok(registration.response.ok, `PLATFORM_ADMIN_REGISTRATION_FAILED:${registration.response.status}`)
    registered = true
    rotateRegisteredCredential(targetDatabase, admin)
    result = await login(base, admin)
  }
  assert.ok(result.response.ok, `PLATFORM_ADMIN_LOGIN_FAILED:${result.response.status}`)
  assert.ok(cookieHeader(result.response.headers), 'PLATFORM_ADMIN_LOGIN_COOKIE_MISSING')
  return safeResult('PLATFORM_ADMIN_LOGIN_VERIFIED', { registered, flowiseOrigin: new URL(base).origin })
}

async function main() {
  const command = process.argv[2]
  const result = command === 'reconcile-existing'
    ? reconcileExisting()
    : command === 'ensure-live'
      ? await ensureLive()
      : (() => { throw new Error('USAGE: platform-admin.cjs reconcile-existing | ensure-live') })()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${String(error.message || error).replace(/[A-Za-z0-9._-]{20,}/g, '[REDACTED]')}\n`)
  process.exitCode = 2
})

module.exports = { configuration, reconcileExisting, ensureLive }
