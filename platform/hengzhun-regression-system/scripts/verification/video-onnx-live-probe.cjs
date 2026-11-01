#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const runtimeEnv = path.join(root, '.data/runtime.env')
const ffmpeg = path.join(root, 'runtime', require('../../config/demo-runtime-freeze.json').mediaFfmpeg.executable)
const fixture = path.join(root, 'worker/fixtures/i10-ocr-chinese-bank.png')

for (const line of fs.readFileSync(runtimeEnv, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
}

const token = process.env.HENGZHUN_SERVICE_TOKEN
assert.ok(token, 'I10_LIVE_SERVICE_TOKEN_MISSING')
const harnessBase = process.env.HENGZHUN_HARNESS_BASE_URL || 'http://127.0.0.1:18788'
const attachmentRef = `video-live-${crypto.randomUUID()}`
const attachmentRoot = path.join(root, '.data/flowise-attachments', attachmentRef)
const filename = 'video-onnx-live.mp4'
const video = path.join(attachmentRoot, filename)
fs.mkdirSync(attachmentRoot, { recursive: true })

const request = async (pathname, body) => {
  const response = await fetch(`${harnessBase}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  })
  const value = await response.json()
  if (!response.ok) throw Object.assign(new Error(value?.errorCode || `HTTP_${response.status}`), { value })
  return value
}

async function main() {
  const encoded = spawnSync(ffmpeg, [
    '-y', '-loop', '1', '-i', fixture, '-t', '2', '-r', '1',
    '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video
  ], { encoding: 'utf8', windowsHide: true })
  assert.equal(encoded.status, 0, 'I10_LIVE_VIDEO_FIXTURE_FAILED')

  const submitted = await request('/v1/i10/ingest:submit', {
    namespace: 'hengzhun-local',
    idempotencyKey: `video-ocr-live-${crypto.randomUUID()}`,
    inputType: 'VIDEO',
    flowiseFileRef: attachmentRef,
    originalFilename: filename,
    targetSystemHint: '复兴银行门户',
    entryUrlHint: 'http://127.0.0.1:18082/portal/profile'
  })
  const deadline = Date.now() + 180_000
  let current = submitted
  while (current.status === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    current = await request('/v1/i10/ingest:get', {
      namespace: 'hengzhun-local',
      ingestJobId: submitted.ingestJobId
    })
  }
  assert.equal(current.status, 'WAITING_USER', current.errorCode || 'I10_LIVE_VIDEO_NOT_READY')
  assert.equal(current.items.length, 1)
  const draft = current.items[0].draft
  assert.ok(draft.caseFacts.length >= 1)
  assert.equal(draft.caseFacts.every(fact =>
    fact.requiresUserConfirmation === true &&
    fact.provenanceRefs.every(ref => /:ocr$/.test(ref))
  ), true)
  assert.equal(draft.missingFields.includes('lowConfidenceActions'), true)
  assert.doesNotMatch(JSON.stringify(draft), /mimo/i)
  process.stdout.write(JSON.stringify({
    status: 'I10_LIVE_VIDEO_OCR_ONLY_PASSED',
    ingestJobId: current.ingestJobId,
    frameDerivedFactCount: draft.caseFacts.length,
    confidence: draft.confidence,
    provenance: 'OCR_ONLY',
    requiresUserConfirmation: true
  }, null, 2) + '\n')
}

main()
  .finally(() => fs.rmSync(attachmentRoot, { recursive: true, force: true }))
  .catch(error => {
    process.stderr.write(JSON.stringify({
      status: 'I10_LIVE_VIDEO_OCR_ONLY_FAILED',
      errorCode: error?.message || 'UNKNOWN'
    }) + '\n')
    process.exitCode = 1
  })
