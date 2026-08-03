'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PaddleOcrService } = require('ppu-paddle-ocr');

const productRoot = path.resolve(__dirname, '..', '..');
const modelRoot = path.join(productRoot, 'runtime', 'ocr-models', 'ppocr-v5-mobile');
const modelPaths = {
  detection: path.join(modelRoot, 'detection.onnx'),
  recognition: path.join(modelRoot, 'recognition.onnx'),
  charactersDictionary: path.join(modelRoot, 'dictionary.txt')
};
const engineName = 'PPU_PADDLE_OCR_V5_ONNX_CPU';
const sensitivePattern = /(?:password|passwd|pwd|密码|口令|验证码)|\b1\d{10}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\bsk-[A-Za-z0-9_-]{8,}\b/i;

let servicePromise;

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyAssets() {
  for (const [name, filePath] of Object.entries(modelPaths)) {
    const stat = fs.statSync(filePath, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size === 0) {
      throw Object.assign(new Error(`I10_ONNX_OCR_${name.toUpperCase()}_MISSING`), {
        code: 'I10_ONNX_OCR_ASSET_MISSING'
      });
    }
  }
}

function modelFingerprint() {
  verifyAssets();
  return crypto.createHash('sha256')
    .update(Object.values(modelPaths).map(fileSha256).join(':'))
    .digest('hex');
}

async function getService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      verifyAssets();
      const service = new PaddleOcrService({
        model: modelPaths,
        processing: { engine: 'opencv' },
        recognition: {
          strategy: 'per-line',
          minimumConfidence: 0.35
        },
        session: {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
          executionMode: 'sequential'
        }
      });
      await service.initialize();
      return service;
    })().catch(error => {
      servicePromise = undefined;
      throw Object.assign(new Error('I10_ONNX_OCR_INITIALIZATION_FAILED'), {
        code: 'I10_ONNX_OCR_INITIALIZATION_FAILED',
        cause: error
      });
    });
  }
  return servicePromise;
}

function normalizeBox(box) {
  if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    left: Math.max(0, Math.floor(box.x)),
    top: Math.max(0, Math.floor(box.y)),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height)
  };
}

function sensitiveBoxesFromResults(results) {
  const boxes = [];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    if (!sensitivePattern.test(String(item?.text || ''))) continue;
    for (const candidate of results.slice(index, index + 3)) {
      const box = normalizeBox(candidate?.box);
      if (box) boxes.push(box);
    }
  }
  return boxes.slice(0, 50);
}

async function ocrImageOnnx(imagePath) {
  const service = await getService();
  const buffer = fs.readFileSync(imagePath);
  const input = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let result;
  try {
    result = await service.recognize(input, {
      flatten: true,
      noCache: true,
      strategy: 'per-line',
      minimumConfidence: 0.35
    });
  } catch (error) {
    throw Object.assign(new Error('I10_ONNX_OCR_INFERENCE_FAILED'), {
      code: 'I10_ONNX_OCR_INFERENCE_FAILED',
      cause: error
    });
  }
  const results = Array.isArray(result?.results)
    ? result.results.filter(item => typeof item?.text === 'string' && item.text.trim())
    : [];
  return {
    text: String(result?.text || results.map(item => item.text).join('\n')).trim(),
    confidence: Math.max(0, Math.min(1, Number(result?.confidence) || 0)),
    sensitiveBoxes: sensitiveBoxesFromResults(results),
    engine: engineName,
    modelSha256: modelFingerprint(),
    recognizedRegionCount: results.length
  };
}

module.exports = {
  engineName,
  modelPaths,
  modelFingerprint,
  ocrImageOnnx,
  sensitiveBoxesFromResults
};
