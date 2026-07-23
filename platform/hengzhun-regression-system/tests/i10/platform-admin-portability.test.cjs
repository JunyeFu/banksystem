#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const Database = require(path.join(root, 'node_modules', 'better-sqlite3'))
const bcrypt = require(path.join(root, 'flowise', 'app', 'node_modules', 'bcryptjs'))
const { configuration, reconcileExisting, ensureLive } = require('../../scripts/platform-admin.cjs')

test('fixed local platform identity is scoped away from model access and satisfies Flowise policy', () => {
  const admin = configuration()
  assert.equal(admin.mode, 'FIXED_LOCAL_PORTABLE_ADMIN')
  assert.equal(admin.scope, 'FLOWISE_LOCAL_UI_ONLY')
  assert.equal(admin.modelAccessAllowed, false)
  assert.match(admin.email, /@hengzhun\.local$/)
  assert.match(admin.password, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/)
  const runtime = JSON.parse(fs.readFileSync(path.join(root, 'config', 'i10.runtime.example.json'), 'utf8'))
  assert.equal(runtime.modelSecretsInPackage, false)
  assert.equal(runtime.fixedLocalPlatformLoginInPackage, true)
})

test('existing single-user Flowise database is reconciled without changing ownership ids', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-admin-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'database.sqlite')
  const database = new Database(file)
  database.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, credential TEXT, tempToken TEXT, tokenExpiry TEXT, status TEXT, createdDate TEXT, updatedDate TEXT, createdBy TEXT, updatedBy TEXT)')
  database.prepare('INSERT INTO "user" VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)')
    .run('stable-user-id', 'old', 'old@example.test', bcrypt.hashSync('OldPassword1', 5), 'active', new Date(0).toISOString(), new Date(0).toISOString(), 'stable-user-id', 'stable-user-id')
  database.close()
  const result = reconcileExisting({ databasePath: file })
  assert.equal(result.status, 'EXISTING_ADMIN_RECONCILED')
  const verified = new Database(file, { readonly: true })
  const row = verified.prepare('SELECT * FROM "user"').get()
  verified.close()
  const admin = configuration()
  assert.equal(row.id, 'stable-user-id')
  assert.equal(row.email, admin.email)
  assert.equal(row.name, admin.name)
  assert.equal(row.status, 'active')
  assert.equal(bcrypt.compareSync(admin.password, row.credential), true)
})

test('fresh Flowise instance is registered through public API and then logged in', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-admin-api-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  let loginCalls = 0
  let registerCalls = 0
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      if (request.url === '/api/v1/auth/login') {
        loginCalls += 1
        response.statusCode = loginCalls === 1 ? 401 : 200
        if (loginCalls > 1) response.setHeader('set-cookie', 'token=local-session; HttpOnly; SameSite=Lax')
      } else if (request.url === '/api/v1/account/register') {
        registerCalls += 1
        const admin = configuration()
        assert.equal(payload.user.email, admin.email)
        assert.equal(payload.user.name, admin.name)
        assert.equal(payload.user.credential, admin.password)
        response.statusCode = 201
      } else response.statusCode = 404
      response.end('{}')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const result = await ensureLive({ baseUrl: `http://127.0.0.1:${server.address().port}`, databasePath: path.join(directory, 'database.sqlite') })
  assert.equal(result.status, 'PLATFORM_ADMIN_LOGIN_VERIFIED')
  assert.equal(result.registered, true)
  assert.equal(registerCalls, 1)
  assert.equal(loginCalls, 2)
})

test('failed login against an existing user database cannot create a second administrator', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-admin-closed-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'database.sqlite')
  const database = new Database(file)
  database.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY)')
  database.prepare('INSERT INTO "user" VALUES (?)').run('existing-user')
  database.close()
  let registrationCalls = 0
  const server = http.createServer((request, response) => {
    if (request.url === '/api/v1/account/register') registrationCalls += 1
    response.statusCode = 401
    response.end('{}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  await assert.rejects(
    ensureLive({ baseUrl: `http://127.0.0.1:${server.address().port}`, databasePath: file }),
    /PLATFORM_ADMIN_EXISTING_LOGIN_FAILED_STOP_AND_PREPARE/
  )
  assert.equal(registrationCalls, 0)
})

test('I10 lifecycle imports generic platform identity and invokes reconcile before start', () => {
  const importer = fs.readFileSync(path.join(root, 'scripts', 'import-i10-runtime-env.ps1'), 'utf8')
  for (const name of ['PLATFORM_ADMIN_EMAIL', 'PLATFORM_ADMIN_PASSWORD', 'PLATFORM_ADMIN_NAME']) assert.match(importer, new RegExp(name))
  const start = fs.readFileSync(path.join(root, 'scripts', 'start-i10.ps1'), 'utf8')
  assert.ok(start.indexOf('reconcile-existing') < start.indexOf("i9-lifecycle.cjs') start"))
  assert.ok(start.indexOf('ensure-live') > start.indexOf("i9-lifecycle.cjs') start"))
})
