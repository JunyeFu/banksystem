'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { startHarness } = require('../../dist/harness/src/server.js')
const { executeVideoIngest, inspectVideo, estimateVisualInputTokens, sensitiveBoxesFromTsv } = require('../../worker/src/i10-video-ingest-runner.cjs')

const productRoot = path.resolve(__dirname, '../..')
const ffmpegPath = path.join(productRoot, 'runtime/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe')
const serviceToken = 'synthetic-i10-video-service-token-00001'
const workerToken = 'synthetic-i10-video-worker-token-000002'

function generateH264(target) {
  const result = spawnSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=640x360:d=2', '-vf', 'drawbox=x=40:y=40:w=80:h=40:color=black:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', target], { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr)
}

async function post(baseUrl, route, body, token = serviceToken) {
  const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { response, body: await response.json() }
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-video-'))
  const running = await startHarness({ productRoot: root, databasePath: path.join(root, '.data/sqlite/platform.sqlite'), migrationsDirectory: path.join(productRoot, 'harness/migrations'), backupDirectory: path.join(root, '.data/backups'), artifactRoot: path.join(root, '.data/artifacts'), security: { serviceToken, allowedClients: ['127.0.0.1', '::1'] }, workerToken, schedulerIntervalMs: 0, host: '127.0.0.1', port: 0 })
  const baseUrl = `http://127.0.0.1:${running.server.address().port}`
  t.after(async () => { await new Promise(resolve => running.server.close(resolve)); await running.application.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, running, baseUrl }
}

test('MP4/H.264 traverses controlled submit, real FFmpeg/OCR, vision HTTP contract, low-confidence review and raw-frame cleanup', { timeout: 180000 }, async t => {
  const { root, baseUrl } = await fixture(t)
  const namespace = 'i10-video-api'
  const flowiseFileRef = 'flowise-video-0000001'
  const fileRoot = path.join(root, '.data/flowise-attachments', flowiseFileRef)
  fs.mkdirSync(fileRoot, { recursive: true })
  const videoPath = path.join(fileRoot, 'success.mp4')
  generateH264(videoPath)
  const metadata = inspectVideo(videoPath)
  assert.deepEqual({ codec: metadata.codec, width: metadata.width, height: metadata.height }, { codec: 'h264', width: 640, height: 360 })

  const submitted = await post(baseUrl, '/v1/i10/ingest:submit', { namespace, idempotencyKey: 'video-submit-00000001', inputType: 'VIDEO', flowiseFileRef, originalFilename: 'success.mp4', targetSystemHint: '复兴银行门户', entryUrlHint: 'http://127.0.0.1:18082/portal/login' })
  assert.equal(submitted.response.status, 202, JSON.stringify(submitted.body))
  assert.equal(submitted.body.status, 'PROCESSING')
  const claimed = await post(baseUrl, '/internal/worker/i10/ingest:claim', { workerId: 'i10-video-worker-0001' }, workerToken)
  assert.equal(claimed.body.status, 'CLAIMED')
  let visionCalls = 0
  const visionServer = http.createServer((request, response) => {
    visionCalls += 1
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const parsed = JSON.parse(body)
      assert.equal(parsed.max_tokens, 4000)
      assert.equal(parsed.messages[0].content.some(item => item.type === 'image_url'), true)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ visibleAction: `观察第${visionCalls}帧`, target: '浏览器页面', expectedVisibleResult: '页面状态可见', cursorVisible: false, browserWindowCount: 2, confidence: 0.96 }) } }] }))
    })
  })
  await new Promise(resolve => visionServer.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => visionServer.close(resolve)))
  const saved = { key: process.env.VISION_API_KEY, base: process.env.VISION_BASE_URL, model: process.env.VISION_MODEL_NAME }
  process.env.VISION_API_KEY = 'synthetic-vision-http-contract-key'
  process.env.VISION_BASE_URL = `http://127.0.0.1:${visionServer.address().port}/v1`
  process.env.VISION_MODEL_NAME = 'synthetic-mimo-contract-model'
  let completion
  try { completion = await executeVideoIngest(claimed.body, { productRoot: root }) }
  finally {
    saved.key === undefined ? delete process.env.VISION_API_KEY : (process.env.VISION_API_KEY = saved.key)
    saved.base === undefined ? delete process.env.VISION_BASE_URL : (process.env.VISION_BASE_URL = saved.base)
    saved.model === undefined ? delete process.env.VISION_MODEL_NAME : (process.env.VISION_MODEL_NAME = saved.model)
  }
  assert.equal(visionCalls, completion.frames.length)
  assert.equal(completion.frames.length > 0, true)
  assert.equal(completion.drafts[0].source.inputType, 'VIDEO')
  assert.equal(completion.drafts[0].missingFields.includes('lowConfidenceActions'), true)
  assert.equal(completion.drafts[0].missingFields.includes('mousePointerVisibility'), true)
  assert.equal(completion.drafts[0].missingFields.includes('singleBrowserWindow'), true)
  assert.equal(completion.drafts[0].missingFields.includes('credentialRef'), true)
  const completed = await post(baseUrl, '/internal/worker/i10/ingest:complete', completion, workerToken)
  assert.equal(completed.body.status, 'WAITING_USER')
  const fetched = await post(baseUrl, '/v1/i10/ingest:get', { namespace, ingestJobId: submitted.body.ingestJobId })
  assert.equal(fetched.body.status, 'WAITING_USER')
  assert.equal(fetched.body.items[0].draft.source.inputType, 'VIDEO')
  const runRoot = path.join(root, '.data/video-ingest', submitted.body.ingestJobId)
  assert.equal(fs.existsSync(path.join(runRoot, 'raw')), false)
  assert.equal(fs.readdirSync(path.join(runRoot, 'redacted')).length, completion.frames.length)
})

test('Harness rejects fabricated or unbound visual observations and frame hashes', { timeout: 60000 }, async t => {
  const { root, baseUrl } = await fixture(t)
  const namespace = 'i10-video-fabricated'
  const flowiseFileRef = 'flowise-video-fabricated-01'
  const fileRoot = path.join(root, '.data/flowise-attachments', flowiseFileRef)
  fs.mkdirSync(fileRoot, { recursive: true })
  generateH264(path.join(fileRoot, 'success.mp4'))
  const submitted = await post(baseUrl, '/v1/i10/ingest:submit', { namespace, idempotencyKey: 'video-fabricated-submit-1', inputType: 'VIDEO', flowiseFileRef, originalFilename: 'success.mp4' })
  const claimed = await post(baseUrl, '/internal/worker/i10/ingest:claim', { workerId: 'i10-video-fabricated-worker' }, workerToken)
  const completion = await executeVideoIngest(claimed.body, { productRoot: root, ocrFrame: async () => '', observeFrame: async () => ({ visibleAction: '伪造观察', target: '页面', expectedVisibleResult: '页面可见', cursorVisible: true, browserWindowCount: 1, confidence: 1, provider: 'test-observer', model: 'synthetic', invocation: 'TEST_INJECTION' }) })
  const rejected = await post(baseUrl, '/internal/worker/i10/ingest:complete', completion, workerToken)
  assert.equal(rejected.response.status, 409)
  assert.equal(rejected.body.errorCode, 'I10_REAL_VISUAL_EVIDENCE_REQUIRED')
  const hashMismatch = structuredClone(completion)
  for (const frame of hashMismatch.frames) {
    frame.visualObservation = { ...frame.visualObservation, provider: 'mimo', model: 'contract-model', invocation: 'REAL', estimatedInputTokens: 1000, totalContextTokens: 16000, reservedOutputTokens: 4000 }
    frame.imageSha256 = 'b'.repeat(64)
  }
  const rejectedHash = await post(baseUrl, '/internal/worker/i10/ingest:complete', hashMismatch, workerToken)
  assert.equal(rejectedHash.response.status, 409)
  assert.equal(rejectedHash.body.errorCode, 'I10_VIDEO_REDACTED_EVIDENCE_INVALID')
  assert.equal(submitted.body.status, 'PROCESSING')
})

test('missing real vision configuration fails closed without Playwright fallback and still cleans raw frames', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-video-fail-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const videoPath = path.join(root, 'success.mp4')
  generateH264(videoPath)
  const names = ['VISION_API_KEY', 'VISION_BASE_URL', 'MIDSCENE_MODEL_API_KEY', 'MIDSCENE_MODEL_BASE_URL']
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  names.forEach(name => { delete process.env[name] })
  try {
    await assert.rejects(executeVideoIngest({ workerId: 'worker-fail', ingestJobId: 'ingest_00000000-0000-4000-8000-000000000001', namespace: 'i10-video-fail', sourceHash: 'a'.repeat(64), filePath: videoPath, hints: {} }, { productRoot: root, ocrFrame: async () => '' }), error => error.code === 'I10_MIMO_CONFIGURATION_MISSING')
  } finally {
    for (const name of names) saved[name] === undefined ? delete process.env[name] : (process.env[name] = saved[name])
  }
  assert.equal(fs.existsSync(path.join(root, '.data/video-ingest/ingest_00000000-0000-4000-8000-000000000001/raw')), false)
})

test('video size is rejected before metadata decoding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i10-video-size-'))
  try {
    const target = path.join(root, 'oversized.mp4')
    fs.writeFileSync(target, Buffer.from([0]))
    fs.truncateSync(target, 500 * 1024 * 1024 + 1)
    assert.throws(() => inspectVideo(target), error => error.code === 'I10_VIDEO_SIZE_INVALID')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('visual input estimator enforces a deterministic 12K ceiling basis', () => {
  assert.equal(estimateVisualInputTokens(1920, 1080, 'OCR摘要') < 12000, true)
  assert.equal(estimateVisualInputTokens(1920, 1080, 'x'.repeat(30000)) > 12000, true)
})

test('OCR TSV redaction marks credential labels and adjacent values without persisting text', () => {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'
  const tsv = [header, '5\t1\t1\t1\t1\t1\t10\t20\t80\t20\t95\t密码', '5\t1\t1\t1\t1\t2\t100\t20\t120\t20\t90\tsensitive-value', '5\t1\t1\t1\t1\t3\t230\t20\t60\t20\t90\t登录'].join('\n')
  const boxes = sensitiveBoxesFromTsv([tsv])
  assert.equal(boxes.length, 3)
  assert.deepEqual(boxes.map(box => [box.left, box.top, box.width, box.height]), [[10, 20, 80, 20], [100, 20, 120, 20], [230, 20, 60, 20]])
})
