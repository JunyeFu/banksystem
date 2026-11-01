'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const ffmpeg = path.join(root, 'runtime', require('../../config/demo-runtime-freeze.json').mediaFfmpeg.executable)
const fixture = path.join(root, 'worker/fixtures/i10-ocr-chinese-bank.png')
const { executeVideoIngest } = require(path.join(root, 'worker/src/i10-video-ingest-runner.cjs'))
const { HarnessDatabase } = require(path.join(root, 'dist/harness/src/database.js'))
const { I10Service } = require(path.join(root, 'dist/harness/src/i10/service.js'))
const { ArtifactStore } = require(path.join(root, 'dist/harness/src/artifact-store.js'))

const digest = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

test('video ingest uses real bundled ONNX OCR and never creates a MiMo observation', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-video-onnx-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(temporary, 'data.sqlite'),
    migrationsDirectory: path.join(root, 'harness/migrations'),
    backupDirectory: path.join(temporary, 'backups')
  })
  t.after(async () => {
    await database.close()
    fs.rmSync(temporary, { recursive: true, force: true })
  })
  const service = new I10Service(database, temporary, new ArtifactStore(database, path.join(temporary, 'artifacts')))
  const video = path.join(temporary, 'bank-case.mp4')
  const encoded = spawnSync(ffmpeg, [
    '-y', '-loop', '1', '-i', fixture, '-t', '2', '-r', '1',
    '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video
  ], { encoding: 'utf8', windowsHide: true })
  assert.equal(encoded.status, 0, encoded.stderr)

  const ingestJobId = 'ingest_00000000-0000-0000-0000-000000000001'
  const namespace = 'video-onnx-test'
  const now = new Date().toISOString()
  database.connection.prepare(`INSERT INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`)
    .run(namespace, now, now)
  database.connection.prepare(`INSERT INTO i10_ingest_jobs(
    ingest_job_id,namespace,idempotency_key,input_type,flowise_file_ref,original_filename,source_sha256,source_size_bytes,
    hints_json,status,missing_fields_json,draft_count,version,lease_owner,lease_expires_at,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,'{}','PROCESSING','[]',0,1,?,'2099-01-01T00:00:00.000Z',?,?)`)
    .run(ingestJobId, namespace, 'video-onnx-test-001', 'VIDEO', 'video-ref', 'bank-case.mp4', digest(video), fs.statSync(video).size, 'worker-video-onnx', now, now)
  const result = await executeVideoIngest({
    workerId: 'worker-video-onnx',
    ingestJobId,
    filePath: video,
    sourceHash: digest(video),
    credentialRef: 'cred_00000000-0000-0000-0000-000000000001',
    hints: {
      targetSystemHint: '复兴银行门户',
      entryUrlHint: 'http://127.0.0.1:18082/portal/login'
    }
  }, {
    productRoot: temporary,
    selectVideoCase: async observations => ({
      title: '复兴银行视频OCR案例',
      objective: '验证视频页面文字',
      summary: '由ONNX OCR时间线整理',
      steps: [{ action: '确认个人资料页面文字', expected: '页面显示客户姓名和身份状态' }],
      caseFacts: [{
        factId: 'ignored-by-worker',
        field: 'ACTION',
        value: '页面显示个人资料、客户姓名和身份状态',
        provenanceRefs: [`video:${ingestJobId}:frame:1:ocr`],
        confidence: 0.7,
        selected: true,
        requiresUserConfirmation: true
      }],
      confidence: 0.7,
      controllerInvocation: {
        invocation: 'REAL',
        provider: 'openai-compatible',
        model: 'test-controller',
        inputTokens: 0,
        outputTokens: 0
      }
    })
  })

  assert.ok(result.frames.length >= 1)
  assert.equal(result.frames.every(frame => frame.visualObservation.provider === 'local-onnx-ocr'), true)
  assert.equal(result.frames.every(frame => frame.visualObservation.invocation === 'LOCAL'), true)
  assert.equal(result.frames.every(frame => frame.visualObservation.engine === 'PPU_PADDLE_OCR_V5_ONNX_CPU'), true)
  assert.equal(result.frames.every(frame => frame.visualObservation.requiresUserConfirmation === true), true)
  assert.equal(result.frames.some(frame => JSON.stringify(frame).toLowerCase().includes('mimo')), false)
  assert.match(result.drafts[0].source.provenanceSummary, /ONNX OCR关键帧/)
  assert.ok(result.drafts[0].missingFields.includes('lowConfidenceActions'))
  const completed = await service.completeVideoIngest(result)
  assert.equal(completed.status, 'WAITING_USER')
  assert.equal(completed.frameCount, result.frames.length)
})
