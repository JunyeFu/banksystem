'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessDatabase } = require('../../dist/harness/src/database.js')

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-image-evidence-'))
  const database = await HarnessDatabase.open({
    databasePath: path.join(root, 'data.sqlite'),
    migrationsDirectory: path.resolve(__dirname, '../../harness/migrations'),
    backupDirectory: path.join(root, 'backups')
  })
  return { root, database }
}

test('one image ingest stores one immutable controller invocation and a local OCR delivery', async t => {
  const f = await fixture()
  t.after(async () => {
    await f.database.close()
    fs.rmSync(f.root, { recursive: true, force: true })
  })

  const imageIngestId = 'imageingest_12345678-1234-4234-8234-123456789abc'
  const now = new Date().toISOString()
  f.database.connection.prepare(`
    INSERT INTO namespaces(namespace, status, version, created_at, updated_at)
    VALUES (?, 'ACTIVE', 1, ?, ?)
  `).run('test', now, now)
  f.database.connection.prepare(`
    INSERT INTO i10_image_ingest_jobs(
      image_ingest_id, namespace, idempotency_key, source_ref, primary_input_type,
      primary_text_hash, status, image_count, total_size_bytes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    imageIngestId, 'test', 'image-dual-evidence-001', 'attachment-test',
    'NATURAL_LANGUAGE', null, 'PROCESSING', 1, 128, now, now
  )

  f.database.connection.prepare(`
    INSERT INTO i10_image_controller_invocations(
      invocation_id, image_ingest_id, invocation_type, provider, model,
      input_tokens, output_tokens, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('modelinvocation_controller', imageIngestId, 'REAL', 'controller-provider', 'controller-model', 10, 5, now)
  f.database.connection.prepare(`
    INSERT INTO i10_image_ocr_deliveries(
      image_ingest_id, ocr_status, ocr_engine, ocr_model_sha256,
      ocr_duration_ms, ocr_processed_image_count, ocr_recognized_region_count,
      purge_status, created_at, updated_at
    ) VALUES (?, 'SUCCEEDED', 'PPU_PADDLE_OCR_V5_ONNX_CPU', ?, 25, 1, 4,
      'PENDING_CONFIRMATION', ?, ?)
  `).run(imageIngestId, 'a'.repeat(64), now, now)

  const rows = f.database.connection.prepare(`
    SELECT invocation_type FROM i10_image_controller_invocations
    WHERE image_ingest_id = ? ORDER BY invocation_type
  `).all(imageIngestId)
  assert.deepEqual(rows.map(row => row.invocation_type), ['REAL'])
  const ocrDelivery = f.database.connection.prepare(`
    SELECT ocr_status, ocr_engine, ocr_processed_image_count
    FROM i10_image_ocr_deliveries WHERE image_ingest_id = ?
  `).get(imageIngestId)
  assert.deepEqual(ocrDelivery, {
    ocr_status: 'SUCCEEDED',
    ocr_engine: 'PPU_PADDLE_OCR_V5_ONNX_CPU',
    ocr_processed_image_count: 1
  })

  assert.throws(
    () => f.database.connection.prepare(`
      UPDATE i10_image_controller_invocations SET input_tokens = input_tokens + 1
      WHERE invocation_id = ?
    `).run('modelinvocation_controller'),
    /I10_IMAGE_CONTROLLER_EVIDENCE_IMMUTABLE/
  )
  assert.throws(
    () => f.database.connection.prepare(`
      DELETE FROM i10_image_controller_invocations WHERE invocation_id = ?
    `).run('modelinvocation_controller'),
    /I10_IMAGE_CONTROLLER_EVIDENCE_IMMUTABLE/
  )
  assert.throws(
    () => f.database.connection.prepare(`
      DELETE FROM i10_image_ocr_deliveries WHERE image_ingest_id = ?
    `).run(imageIngestId),
    /I10_IMAGE_OCR_DELIVERY_IMMUTABLE/
  )
})
