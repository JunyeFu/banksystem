'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'flowise/i10/chatbot-config-v1.json'), 'utf8'))
const publisher = require('../i10-agentflow-publish.cjs')

test('Flowise native full-file upload is enabled with a fail-closed allowlist', () => {
  assert.equal(publisher.assertChatbotConfig(config), config)
  assert.equal(config.fullFileUpload.status, true)
  assert.equal(typeof config.fullFileUpload.allowedUploadFileTypes, 'string')
  assert.doesNotMatch(config.fullFileUpload.allowedUploadFileTypes, /application\/octet-stream|application\/zip|macroEnabled/i)
})

test('Flowise runtime accepts the video ceiling while Harness keeps per-type limits', () => {
  const lifecycle = fs.readFileSync(path.join(root, 'scripts/i9-lifecycle.cjs'), 'utf8')
  assert.match(lifecycle, /FLOWISE_FILE_SIZE_LIMIT:\s*'500mb'/)
  const harness = fs.readFileSync(path.join(root, 'harness/src/i10/service.ts'), 'utf8')
  assert.match(harness, /20\s*\*\s*1024\s*\*\s*1024/)
  assert.match(harness, /500\s*\*\s*1024\s*\*\s*1024/)
})

test('lifecycle refuses to treat a healthy but stale owned runtime as current', () => {
  const lifecycle = fs.readFileSync(path.join(root, 'scripts/i9-lifecycle.cjs'), 'utf8')
  assert.match(lifecycle, /function runtimeCurrent\(record\)/)
  assert.match(lifecycle, /if \(!owned \|\| !runtimeCurrent\(record\)\) return false/)
  assert.match(lifecycle, /runtimeFingerprint: serviceFingerprint\(name\)/)
  assert.match(lifecycle, /owned, current, healthy/)
})

test('Flowise chat UI overlay maps paste and drag-drop into the governed native file input', () => {
  const bridge = fs.readFileSync(path.join(root, 'flowise/i10/hengzhun-attachment-bridge-v1.js'), 'utf8')
  const overlay = fs.readFileSync(path.join(root, 'scripts/apply-i9-flowise-overlays.cjs'), 'utf8')
  assert.match(bridge, /I10_FLOWISE_ATTACHMENT_BRIDGE_V2/)
  assert.match(bridge, /clipboardData\?\.files/)
  assert.match(bridge, /clipboardData\?\.items/)
  assert.match(bridge, /item\.getAsFile/)
  assert.match(bridge, /document\.addEventListener\('paste'/)
  assert.match(bridge, /dataTransfer\?\.files/)
  assert.match(bridge, /input\.dispatchEvent\(new Event\('change'/)
  assert.match(bridge, /maxFilesPerTurn = 16/)
  assert.match(overlay, /hengzhun-attachment-bridge\.js/)
})

test('Flowise chat UI keeps only the latest resumed answer expanded', () => {
  const bridge = fs.readFileSync(path.join(root, 'flowise/i10/hengzhun-attachment-bridge-v1.js'), 'utf8')
  assert.match(bridge, /compactAssistantReplies/)
  assert.match(bridge, /hengzhun-previous-output/)
  assert.match(bridge, /查看本轮较早输出/)
  assert.match(bridge, /headings\.length < 2/)
})

test('image processing reply exposes deterministic progress and timeout fields', () => {
  const harness = fs.readFileSync(path.join(root, 'harness/src/i10/service.ts'), 'utf8')
  const releaseBuilder = fs.readFileSync(path.join(root, 'scripts/build-i10-agentflow-v6.cjs'), 'utf8')
  // v6 is the publishable wrapper. It reads the frozen v5 fallback snapshot
  // but must not rebuild it, otherwise verification would mutate rollback
  // artifacts and erase a valid deployment attestation.
  const sourceBuilder = fs.readFileSync(path.join(root, 'scripts/build-i10-agentflow-v5.cjs'), 'utf8')
  for (const field of [
    'progressStage', 'progressPercent', 'processedImageCount', 'elapsedSeconds',
    'idleSeconds', 'maxWaitSeconds', 'timeoutStatus', 'progressMessage'
  ]) {
    assert.match(harness, new RegExp(field))
  }
  assert.match(harness, /OCR_AND_REDACTION/)
  assert.match(harness, /OCR_FACT_SELECTION/)
  assert.doesNotMatch(harness, /VISION_AND_FACT_SELECTION/)
  assert.match(harness, /TIMED_OUT/)
  assert.match(releaseBuilder, /agentflow-v5\.json/)
  assert.doesNotMatch(releaseBuilder, /execFileSync\(/)
  assert.match(sourceBuilder, /imageProgressPercent/)
  assert.match(sourceBuilder, /最近活动距今/)
  assert.match(sourceBuilder, /租约截止/)
})
