'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const source = fs.readFileSync(path.join(root, 'mcp/src/server.cjs'), 'utf8')

function toolBlock(name) {
  const start = source.indexOf(`server.registerTool('${name}'`)
  assert.ok(start >= 0, `missing tool ${name}`)
  const next = source.indexOf("\n  server.registerTool('", start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

test('MCP resolves its exact SDK from the product root without Flowise fallback', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const sdk = require.resolve('@modelcontextprotocol/sdk/server/mcp.js', { paths: [root] })
  assert.equal(pkg.dependencies['@modelcontextprotocol/sdk'], '1.30.0')
  assert.match(sdk, /hengzhun-regression-system[\\/]node_modules[\\/]@modelcontextprotocol[\\/]sdk/)
  assert.doesNotMatch(source, /FLOWISE_APP_PATH|runtimeRequire|flowiseAppPath/)
})

test('35-tool v2 surface has pure candidate, preview and inbox reads', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/mcp/hengzhun-i8.json'), 'utf8'))
  const runtime = [...source.matchAll(/server\.registerTool\('([^']+)'/g)].map(match => match[1])
  assert.equal(contract.tools.length, 35)
  assert.equal(new Set(runtime).size, 35)
  assert.deepEqual([...runtime].sort(), contract.tools.map(tool => tool.name).sort())
  assert.doesNotMatch(toolBlock('candidate_get'), /candidates:compile|authoring:get|retryFailed/)
  assert.match(toolBlock('candidate_compile'), /candidates:compile/)
  assert.doesNotMatch(toolBlock('candidate_preview'), /includeDownload:\s*true|artifacts:grant-download/)
  assert.match(toolBlock('candidate_preview'), /includeDownload:\s*false/)
  assert.doesNotMatch(toolBlock('result_inbox_list'), /acknowledgeInboxIds:\s*z\./)
  assert.match(toolBlock('result_inbox_list'), /acknowledgeInboxIds:\s*\[\]/)
  assert.match(toolBlock('result_inbox_ack'), /results:inbox-ack/)
  assert.match(toolBlock('result_inbox_ack'), /expectedItemHash/)
})

test('canonical attachment import is atomic, hash-bound and path-safe', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-attachment-v2-'))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
  const { I10Service } = require('../../dist/harness/src/i10/service.js')
  const service = new I10Service({}, tempRoot, {})
  const content = Buffer.from('deterministic attachment fixture', 'utf8')
  const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex')
  const receipt = await service.importAttachment({ originalFilename: 'case.txt', purpose: 'CASE_FILE', expectedSha256, content })
  assert.equal(receipt.schemaVersion, 'AttachmentReceiptV1')
  assert.match(receipt.attachmentRef, /^att_[0-9a-f-]{36}$/)
  assert.equal(receipt.sha256, expectedSha256)
  const resolved = service.resolveAttachmentWithCanonicalName(receipt.attachmentRef, 'case.txt')
  assert.equal(fs.readFileSync(resolved.filePath, 'utf8'), content.toString('utf8'))
  await assert.rejects(
    service.importAttachment({ originalFilename: 'case.txt', purpose: 'CASE_FILE', expectedSha256: '0'.repeat(64), content }),
    error => error?.errorCode === 'I10_ATTACHMENT_HASH_MISMATCH'
  )
  assert.equal(fs.readdirSync(path.join(tempRoot, '.data', 'attachments')).some(name => name.startsWith('.staging-')), false)
})
