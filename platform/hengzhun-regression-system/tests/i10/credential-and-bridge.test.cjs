'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')

const productRoot = path.resolve(__dirname, '../..')
const serviceToken = 'synthetic-i10-service-token-0000000001'
const workerToken = 'synthetic-i10-worker-token-00000000002'

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-credential-'))
  const running = await startHarness({ productRoot: root, databasePath: path.join(root, '.data/sqlite/regression_platform.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, '.data/sqlite/backups'), artifactRoot: path.join(root, '.data/artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] }, workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0 })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, running, baseUrl }
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { response, body: await response.json() }
}

function filesBelow(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(root, entry.name)
    return entry.isDirectory() ? filesBelow(target) : [target]
  })
}

test('DPAPI form stores only credentialRef and bridges natural language CaseDraft to preparationId', { timeout: 60000 }, async t => {
  const { root, running, baseUrl } = await fixture(t)
  const namespace = 'i10-credential-test'
  const created = await post(baseUrl, '/v1/i10/credentials:sessions-create', { namespace, idempotencyKey: 'i10-credential-create-0001', label: '门户测试账户' })
  assert.equal(created.response.status, 200)
  const awaiting = await post(baseUrl, '/v1/i10/credentials:sessions-get', { namespace, sessionId: created.body.sessionId })
  assert.equal(awaiting.body.status, 'AWAITING_INPUT')
  const url = new URL(created.body.captureUrl)
  const captureToken = url.hash.slice('#token='.length)
  const username = 'i10-local-user'
  const password = 'I10-Never-Store-Plaintext-42!'
  const storePath = url.pathname.replace(/\/form$/, ':store')
  const rejectedToken = await fetch(`${baseUrl}${storePath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captureToken: 'x'.repeat(43), username, password }) })
  assert.equal(rejectedToken.status, 403)
  const storedResponse = await fetch(`${baseUrl}${storePath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captureToken, username, password }) })
  const stored = await storedResponse.json()
  assert.equal(storedResponse.status, 200, JSON.stringify(stored))
  assert.match(stored.credentialRef, /^credential_[0-9a-f-]{36}$/)
  const ready = await post(baseUrl, '/v1/i10/credentials:sessions-get', { namespace, sessionId: created.body.sessionId })
  assert.equal(ready.body.status, 'READY')
  assert.equal(ready.body.credentialRef, stored.credentialRef)
  const replayStore = await fetch(`${baseUrl}${storePath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captureToken, username, password }) })
  assert.equal(replayStore.status, 409)
  const resolved = await post(baseUrl, '/internal/worker/i10/credentials:resolve', { namespace, credentialRef: stored.credentialRef }, workerToken)
  assert.equal(resolved.response.status, 200)
  assert.deepEqual(resolved.body, { username, password })
  const crossNamespace = await post(baseUrl, '/internal/worker/i10/credentials:resolve', { namespace: 'different-namespace', credentialRef: stored.credentialRef }, workerToken)
  assert.equal(crossNamespace.response.status, 404)
  const databaseBytes = fs.readFileSync(path.join(root, '.data/sqlite/regression_platform.sqlite'))
  const encryptedBytes = fs.readFileSync(path.join(root, `.data/credentials/${stored.credentialRef}.bin`))
  assert.equal(databaseBytes.includes(Buffer.from(password)), false)
  assert.equal(encryptedBytes.includes(Buffer.from(password)), false)
  assert.equal(encryptedBytes.includes(Buffer.from(username)), false)

  const draft = {
    schemaVersion: 'hengzhun-i10-case-draft-v1', title: '门户登录资料一致性', objective: '验证当前账户资料', summary: '登录后核对页眉与个人资料',
    targetSystem: '复兴银行门户', entryUrl: 'http://127.0.0.1:18082/portal/login', preconditions: ['门户可访问'],
    steps: [{ action: '输入账号密码并登录', expected: '进入门户' }, { action: '打开个人资料', expected: '资料可见' }], assertions: ['姓名一致', '头像一致'], credentialRef: stored.credentialRef,
    source: { inputType: 'NATURAL_LANGUAGE', sourceRef: 'conversation-0001', sourceHash: 'a'.repeat(64), provenanceSummary: '用户自然语言确认' }, confidence: 1, missingFields: [], confirmationStatus: 'CONFIRMED',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY', executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY', evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  }
  const prepared = await post(baseUrl, '/v1/i10/cases:prepare', { namespace, idempotencyKey: 'i10-natural-prepare-0001', actorRef: 'flowise-controller', caseDescription: '登录后核对资料', draft })
  assert.equal(prepared.response.status, 200)
  assert.match(prepared.body.preparationId, /^prep_/)
  assert.equal(prepared.body.credentialRef, stored.credentialRef)
  assert.deepEqual(prepared.body.intentSource.steps, draft.steps)
  assert.deepEqual(prepared.body.intentSource.assertions, draft.assertions)
  const definition = running.application.database.connection.prepare('SELECT definition_json FROM case_versions WHERE case_id=? AND version=1').get(prepared.body.caseId)
  assert.equal(JSON.parse(definition.definition_json).credentialRef, stored.credentialRef)

  for (const file of filesBelow(root)) {
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.includes(Buffer.from(password)), false, file)
    assert.equal(bytes.includes(Buffer.from(username)), false, file)
  }
})

test('expired credential capture sessions fail closed and persist EXPIRED state', { timeout: 60000 }, async t => {
  const { running, baseUrl } = await fixture(t)
  const namespace = 'i10-expired-credential-test'
  const created = await post(baseUrl, '/v1/i10/credentials:sessions-create', { namespace, idempotencyKey: 'i10-credential-expired-0001', label: '过期测试账户' })
  assert.equal(created.response.status, 200)
  running.application.database.connection.prepare(`UPDATE i10_credential_sessions SET expires_at=? WHERE session_id=?`).run('2000-01-01T00:00:00.000Z', created.body.sessionId)
  const expired = await post(baseUrl, '/v1/i10/credentials:sessions-get', { namespace, sessionId: created.body.sessionId })
  assert.equal(expired.body.status, 'EXPIRED')
  const captureToken = new URL(created.body.captureUrl).hash.slice('#token='.length)
  const response = await fetch(`${baseUrl}/v1/i10/credentials/${created.body.sessionId}:store`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captureToken, username: 'expired-user', password: 'expired-password' }) })
  assert.equal(response.status, 409)
  const refs = running.application.database.connection.prepare(`SELECT COUNT(*) count FROM i10_credential_refs WHERE namespace=?`).get(namespace)
  assert.equal(refs.count, 0)
})
