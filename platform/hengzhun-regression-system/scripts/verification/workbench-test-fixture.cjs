'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { after } = require('node:test')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')
const { WorkbenchRepository } = require('../../dist/harness/src/workbench-repository.js')
const productRoot = path.resolve(__dirname, '../..')
const token = 'workbench-isolated-service-token-32-characters'
const ns = 'workbench-test'
let template

function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-workbench-test-')) }
function remove(root) {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('hengzhun-workbench-test-')) throw new Error('TEST_CLEANUP_TARGET_INVALID')
  fs.rmSync(root, { recursive: true, force: true })
}
function options(root) {
  return { databasePath: path.join(root, 'state.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, 'backups') }
}
async function templateDatabase() {
  if (!template) template = (async () => {
    const root = temporary(), db = await HarnessDatabase.open(options(root))
    await db.close()
    return root
  })()
  return template
}
after(async () => { if (template) remove(await template) })
async function store(t) {
  const baseline = await templateDatabase(), root = temporary()
  fs.copyFileSync(path.join(baseline, 'state.sqlite'), path.join(root, 'state.sqlite'))
  let db = await HarnessDatabase.open(options(root))
  let open = true
  const close = async () => { if (open) { await db.close(); open = false } }
  t.after(async () => { await close(); remove(root) })
  return { root, get db() { return db }, get repo() { return new WorkbenchRepository(db) },
    close, async reopen() { await close(); db = await HarnessDatabase.open(options(root)); open = true; return this } }
}
async function listen(handler) {
  const server = http.createServer(handler)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
async function application(t) {
  const baseline = await templateDatabase(), root = temporary()
  fs.copyFileSync(path.join(baseline, 'state.sqlite'), path.join(root, 'state.sqlite'))
  const { createHarnessApplication } = require('../../dist/harness/src/server.js')
  const previousAttachmentRoot = process.env.HENGZHUN_ATTACHMENT_ROOT
  process.env.HENGZHUN_ATTACHMENT_ROOT = path.join(root, 'attachments')
  let app
  try {
    app = await createHarnessApplication({ ...options(root), productRoot, artifactRoot: path.join(root, 'artifacts'), schedulerIntervalMs: 0,
      releaseIdentityHash: '1'.repeat(64), workbenchNamespace: ns, security: { serviceToken: token, allowedClients: ['127.0.0.1'] }, workerToken: 'workbench-isolated-worker-token-32-characters' })
  } finally {
    if (previousAttachmentRoot === undefined) delete process.env.HENGZHUN_ATTACHMENT_ROOT
    else process.env.HENGZHUN_ATTACHMENT_ROOT = previousAttachmentRoot
  }
  const { server, url } = await listen(app.handler)
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await app.close(); remove(root) })
  return { app, root, url, async post(route, body, authorization = `Bearer ${token}`) {
    const response = await fetch(new URL(route, url), { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  } }
}
module.exports = { productRoot, token, ns, temporary, remove, options, store, listen, application }
