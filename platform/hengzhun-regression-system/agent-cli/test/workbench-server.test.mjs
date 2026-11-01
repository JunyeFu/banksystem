import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import http from 'node:http'
import { startWorkbenchServer } from '../src/workbench-server.mjs'

const id = '12345678-1234-4234-8234-123456789abc'
const artifactId = `art_${id}`
const bytes = Buffer.from('redacted-only')
const hash = value => createHash('sha256').update(value).digest('hex')
async function fixture(t, withUi = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hz-web-server-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  if (withUi) {
    await mkdir(path.join(root, 'assets'))
    await writeFile(path.join(root, 'agent.html'), '<html><body>test process UI only</body></html>')
    await writeFile(path.join(root, 'assets/app.js'), 'console.log("test")')
    await writeFile(path.join(root, 'favicon.svg'), 'test process public asset only')
  }
  const imported = [], downloads = []
  let closed = false
  const listener = await startWorkbenchServer({ port: 0, staticRoot: root, workbench: {
    getAgentBootstrap: async () => ({ status: 'NOT_READY', releaseIdentityHash: null, environment: 'LOCAL', blockingReasons: ['AGENT_MODEL_CONFIGURATION_REQUIRED'] }),
    importAgentAttachment: async input => { imported.push(input); return { attachmentRef: 'att_testimage_1234', sha256: hash(input.bytes), size: input.bytes.length, originalFilename: input.filename, mediaType: input.mediaType } },
    downloadAgentArtifact: async input => { downloads.push(input); return { bytes, filename: '证据.txt', sha256: hash(bytes) } },
    close: async () => { closed = true },
  } })
  t.after(() => listener.close())
  const token = (await (await fetch(`${listener.origin}/api/agent/v1/bootstrap`)).json()).csrfToken
  return { ...listener, imported, downloads, token, get closed() { return closed } }
}

test('loopback same-origin API and SPA deep links use distinct CSP; no other local files are served', async t => {
  const f = await fixture(t)
  const page = await fetch(`${f.origin}/conversations/${id}`)
  assert.equal(page.status, 200); assert.match(await page.text(), /test process UI/)
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/)
  const api = await fetch(`${f.origin}/api/agent/v1/bootstrap`)
  assert.match(api.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal((await api.json()).status, 'NOT_READY')
  assert.equal((await fetch(`${f.origin}/assets/app.js`)).status, 200)
  assert.equal((await fetch(`${f.origin}/agent/assets/app.js`)).status, 200)
  const favicon = await fetch(`${f.origin}/agent/favicon.svg`)
  assert.equal(favicon.status, 200); assert.equal(await favicon.text(), 'test process public asset only')
  for (const url of ['/agent/', `/agent/conversations/${id}`]) {
    const page = await fetch(`${f.origin}${url}`)
    assert.equal(page.status, 200); assert.match(await page.text(), /test process UI/)
  }
  for (const url of ['/.env', '/package.json', '/assets/%2e%2e%2fpackage.json', '/api/quality/v1/cases']) assert.ok((await fetch(`${f.origin}${url}`)).status >= 400)
  const forbidden = await new Promise((resolve, reject) => {
    http.get(`${f.origin}/`, { headers: { host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode) }).once('error', reject)
  })
  assert.equal(forbidden, 403)
})

test('absent Agent build is explicit 503 while bootstrap remains reachable', async t => {
  const f = await fixture(t, false)
  const response = await fetch(f.origin)
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'AGENT_UI_NOT_BUILT')
  assert.equal((await fetch(`${f.origin}/api/agent/v1/bootstrap`)).status, 200)
})

test('single image binary import enforces filename, type, origin and size before the existing importer', async t => {
  const f = await fixture(t), image = Buffer.from('89504e470d0a1a0a', 'hex')
  const headers = { origin: f.origin, 'x-hengzhun-csrf': f.token, 'content-type': 'image/png', 'x-hengzhun-filename': Buffer.from('补充.png').toString('base64url') }
  const upload = (body, changes = {}) => fetch(`${f.origin}/api/agent/v1/attachments`, { method: 'POST', headers: { ...headers, ...changes }, body })
  const receipt = await upload(image)
  assert.equal(receipt.status, 201); assert.equal((await receipt.json()).originalFilename, '补充.png')
  assert.equal(f.imported.length, 1); assert.deepEqual(f.imported[0].bytes, image)
  assert.equal((await upload(image, { origin: 'https://attacker.invalid' })).status, 403)
  assert.equal((await upload(image, { 'content-type': 'application/pdf' })).status, 415)
  assert.equal((await upload(Buffer.from('not an image'))).status, 400)
  assert.equal((await upload(image, { 'x-hengzhun-filename': Buffer.from('C:\\secret.png').toString('base64url') })).status, 400)
  assert.equal((await upload(Buffer.alloc(16 * 1024 * 1024 + 1))).status, 413)
  assert.equal(f.imported.length, 1)
})

test('artifact binary response contains no grant URL, internal token, local path or active content type', async t => {
  const f = await fixture(t)
  const result = await fetch(`${f.origin}/api/agent/v1/turns/${id}/artifacts/${artifactId}`)
  assert.equal(result.status, 200)
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes)
  assert.equal(result.headers.get('content-type'), 'application/octet-stream')
  assert.equal(result.headers.get('x-content-sha256'), hash(bytes))
  assert.match(result.headers.get('content-disposition'), /^attachment;/)
  assert.deepEqual(f.downloads, [{ turnId: id, artifactId }])
})
