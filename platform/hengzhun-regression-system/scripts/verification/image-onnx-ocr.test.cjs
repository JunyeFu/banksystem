'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const {
  engineName,
  modelFingerprint,
  ocrImageOnnx
} = require('../../worker/src/i10-onnx-ocr.cjs')

test('bundled PP-OCRv5 ONNX reads required Chinese banking UI text', async () => {
  const fixture = path.resolve(__dirname, '../../worker/fixtures/i10-ocr-chinese-bank.png')
  const result = await ocrImageOnnx(fixture)
  assert.equal(engineName, 'PPU_PADDLE_OCR_V5_ONNX_CPU')
  assert.equal(result.engine, engineName)
  assert.equal(result.modelSha256, modelFingerprint())
  assert.match(result.modelSha256, /^[0-9a-f]{64}$/)
  assert.ok(result.confidence >= 0.85, `unexpected OCR confidence: ${result.confidence}`)
  assert.ok(result.recognizedRegionCount >= 4)
  for (const expected of ['复兴银行', '个人资料', '客户姓名', '身份状态', '已验证', '账户概览', '转账', '收款', '个人中心']) {
    assert.match(result.text, new RegExp(expected))
  }
})
