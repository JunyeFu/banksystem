'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const Database = require('better-sqlite3')
const { startHarness } = require('../../dist/harness/src/server.js')

const productRoot = path.resolve(__dirname, '../..')
const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise/i9/platform-resource-manifest-v1.json'), 'utf8'))
const profile = JSON.parse(fs.readFileSync(path.join(productRoot, 'flowise/i9/connection-profiles-v1.json'), 'utf8'))
const knowledgeText = fs.readFileSync(path.join(productRoot, manifest.knowledge.sourcePath), 'utf8')

test('platform manifest freezes source hash, citations and P4 connectivity boundary', () => {
  assert.equal(crypto.createHash('sha256').update(knowledgeText).digest('hex'), manifest.knowledge.contentHash)
  assert.equal(manifest.importMethod.method, 'POST')
  assert.equal(manifest.importMethod.path, '/api/v1/export-import/import')
  assert.ok(manifest.knowledge.citationIds.length >= 3)
  assert.equal(profile.model.actualConnectivityStage, 'I9-P4')
  assert.equal(profile.mcp.actualConnectivityStage, 'I9-P4')
  assert.equal(profile.model.apiKeyVariable, 'MIMO_API_KEY')
  assert.equal(profile.mcp.bearerTokenVariable, 'HENGZHUN_MCP_TOKEN')
  const serialized = JSON.stringify({ manifest, profile })
  assert.equal(/sk-[a-z0-9]{16,}/i.test(serialized), false)
  assert.equal(serialized.includes('RAG'), false)
})

test('bootstrap accesses Flowise through public API only', () => {
  const source = fs.readFileSync(path.join(productRoot, 'scripts/i9-platform-bootstrap.cjs'), 'utf8')
  for (const route of ['/api/v1/account/register', '/api/v1/auth/login', '/api/v1/export-import/import', '/api/v1/document-store/store', '/api/v1/document-store/chunks/']) {
    assert.ok(source.includes(route), `missing public route ${route}`)
  }
  assert.equal(source.includes("require('better-sqlite3')"), false)
  assert.equal(source.includes('database.sqlite'), false)
  assert.match(source, /'x-request-from': 'internal'/)
  assert.match(source, /REGISTERED_WITH_RUNTIME_SECRET_REFERENCE/)
  assert.match(source, /actualConnectivityStage: 'I9-P4'/)
})

test('Harness stores immutable knowledge snapshot references without platform knowledge body', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i9-p3-ref-'))
  const databasePath = path.join(temporary, 'sqlite', 'platform.sqlite')
  const serviceToken = 'synthetic-i9-p3-service-token-0000000001'
  const running = await startHarness({
    productRoot: temporary,
    databasePath,
    migrationsDirectory: path.join(productRoot, 'harness', 'migrations'),
    backupDirectory: path.join(temporary, 'backups'),
    artifactRoot: path.join(temporary, 'artifacts'),
    security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] },
    schedulerIntervalMs: 0,
    host: '127.0.0.1',
    port: 0
  })
  t.after(async () => {
    await new Promise(resolve => running.server.close(resolve))
    await running.application.close()
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const port = running.server.address().port
  const payload = {
    namespace: profile.mcp.namespace,
    idempotencyKey: 'i9-p3-platform-snapshot-ref-test',
    snapshot: {
      knowledgeSnapshotId: manifest.knowledge.snapshotId,
      sourceVersion: manifest.knowledge.sourceVersion,
      contentHash: manifest.knowledge.contentHash,
      citationIds: manifest.knowledge.citationIds
    },
    platform: 'FLOWISE',
    platformResourceId: manifest.knowledge.storeId,
    sourceRef: manifest.knowledge.sourcePath
  }
  const request = () => fetch(`http://127.0.0.1:${port}/v1/platform/knowledge-snapshots:register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hengzhun-service-token': serviceToken },
    body: JSON.stringify(payload)
  })
  const first = await request()
  assert.equal(first.status, 201)
  const replay = await request()
  assert.equal(replay.status, 201)
  assert.equal((await replay.json()).replayed, true)

  const database = new Database(databasePath, { readonly: true })
  try {
    const columns = database.prepare('PRAGMA table_info(i9_knowledge_snapshot_refs)').all().map(row => row.name)
    for (const forbidden of ['body', 'content', 'page_content', 'knowledge_text']) assert.equal(columns.includes(forbidden), false)
    const row = database.prepare('SELECT * FROM i9_knowledge_snapshot_refs').get()
    assert.equal(row.snapshot_id, manifest.knowledge.snapshotId)
    assert.equal(row.platform, 'FLOWISE')
    assert.equal(row.content_hash, manifest.knowledge.contentHash)
  } finally { database.close() }
})

test('dual SQLite snapshot tool enforces separate authority tables and test-root confinement', () => {
  const source = fs.readFileSync(path.join(productRoot, 'scripts/i9-sqlite-snapshot.cjs'), 'utf8')
  assert.match(source, /I9_TEST_DATA_ROOT_OUTSIDE_PRODUCT_DATA/)
  assert.match(source, /I9_FLOWISE_CONTAINS_HARNESS_TABLE/)
  assert.match(source, /I9_HARNESS_CONTAINS_FLOWISE_TABLE/)
  assert.match(source, /I9_HARNESS_KNOWLEDGE_BODY_COLUMN_FORBIDDEN/)
  assert.match(source, /database\.backup/)
  assert.equal(source.includes('copyFileSync'), false)
})
