'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { executeImageIngest, selectCaseFacts, normalizeFact } = require('../../worker/src/i10-image-ingest-runner.cjs')
const pngFixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

test('fact references must all belong to the current OCR packets',()=>{
  const refs=new Set(['image:1:aaa','image:2:bbb']);
  const fact=provenanceRefs=>({value:'合成页面字段',field:'ACTION',provenanceRefs});
  for(const invalid of [undefined,[],['image:9:foreign'],['image:1:aaa','image:9:foreign']])
    assert.throws(()=>normalizeFact(fact(invalid),0,refs),e=>e.code==='I10_IMAGE_FACT_PROVENANCE_INVALID');
  assert.deepEqual(normalizeFact(fact(['image:1:aaa','image:2:bbb']),0,refs).provenanceRefs,['image:1:aaa','image:2:bbb']);
});

test('image ingest records local ONNX OCR plus controller invocation without a visual branch', async () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-image-ingest-'))
  const source = path.join(productRoot, 'source.png')
  fs.writeFileSync(source, pngFixture)
  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')
  const provenanceRef = `image:1:${sourceSha256}`
  const result = await executeImageIngest({
    workerId: 'worker_test',
    imageIngestId: 'imageingest_11111111-1111-4111-8111-111111111111',
    primaryInputType: 'NATURAL_LANGUAGE',
    images: [{
      ordinal: 1,
      filePath: source,
      originalFilename: 'login.png',
      purposeHint: '登录页面',
      sourceSha256
    }]
  }, {
    productRoot,
    ocrEngineName: 'ONNX_TEST',
    ocrImage: async () => ({
      text: '复兴银行门户 登录 用户名 密码',
      sensitiveBoxes: [],
      engine: 'ONNX_TEST',
      modelSha256: 'a'.repeat(64),
      recognizedRegionCount: 4
    }),
    selectFacts: async () => ({
      facts: [{
        factId: 'fact_test_0001',
        field: 'ACTION',
        value: '点击登录按钮',
        provenanceRefs: [provenanceRef],
        confidence: 0.99,
        selected: true,
        requiresUserConfirmation: true
      }],
      controllerInvocation: {
        invocation: 'REAL', provider: 'openai-compatible', model: 'deepseek-v4-flash',
        inputTokens: 220, outputTokens: 60
      }
    })
  })
  assert.equal(result.facts.length, 1)
  assert.equal(result.controllerInvocation.invocation, 'REAL')
  assert.equal(result.recognitionBranches.ocr.status, 'SUCCEEDED')
  assert.equal(result.recognitionBranches.ocr.engine, 'ONNX_TEST')
  assert.equal(result.recognitionBranches.ocr.modelSha256, 'a'.repeat(64))
  assert.equal(result.recognitionBranches.ocr.recognizedRegionCount, 4)
  assert.equal(Object.hasOwn(result.recognitionBranches, 'vision'), false)
  assert.equal(Object.hasOwn(result, 'visionInvocation'), false)
  assert.equal(Object.hasOwn(result.packets[0], 'redactedAbsolutePath'), false)
  assert.match(result.packets[0].redactedImagePath, /^\.data[\\/]image-ingest/)
  fs.rmSync(productRoot, { recursive: true, force: true })
})

test('OCR failure closes the task and never invokes a visual-model fallback', async () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-image-vision-fallback-'))
  const source = path.join(productRoot, 'source.png')
  fs.writeFileSync(source, pngFixture)
  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')
  let controllerCalled = false
  await assert.rejects(() => executeImageIngest({
    workerId:'worker_test',
    imageIngestId:'imageingest_44444444-4444-4444-8444-444444444444',
    primaryInputType:'NATURAL_LANGUAGE',
    images:[{ordinal:1,filePath:source,originalFilename:'profile.png',sourceSha256}]
  },{
    productRoot,
    ocrImage:async()=>{throw Object.assign(new Error('OCR failed'),{code:'I10_ONNX_OCR_FAILED'})},
    selectFacts:async()=>{controllerCalled=true;return{facts:[],controllerInvocation:{}}}
  }), error => error?.code === 'I10_IMAGE_OCR_FAILED_CLOSED'
    && error?.recognitionBranches?.ocr?.status === 'FAILED'
    && error?.recognitionBranches?.ocr?.errorCode === 'I10_ONNX_OCR_FAILED')
  assert.equal(controllerCalled,false)
  fs.rmSync(productRoot,{recursive:true,force:true})
})

test('image ingest fails closed when controller selects no facts', async () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-image-empty-'))
  const source = path.join(productRoot, 'source.png')
  fs.writeFileSync(source, pngFixture)
  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')
  await assert.rejects(() => executeImageIngest({
    workerId: 'worker_test',
    imageIngestId: 'imageingest_22222222-2222-4222-8222-222222222222',
    primaryInputType: 'NATURAL_LANGUAGE',
    images: [{ ordinal: 1, filePath: source, originalFilename: 'login.png', sourceSha256 }]
  }, {
    productRoot,
    ocrImage: async () => ({ text: '', sensitiveBoxes: [] }),
    selectFacts: async () => ({
      facts: [],
      controllerInvocation: { invocation: 'REAL', provider: 'test', model: 'test', inputTokens: 1, outputTokens: 1 }
    })
  }), error => error?.code === 'I10_IMAGE_FACTS_EMPTY')
  fs.rmSync(productRoot, { recursive: true, force: true })
})

test('corrupt image fails before OCR worker creation and cannot terminate the long-running worker', async () => {
  const productRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-image-corrupt-'))
  const source = path.join(productRoot, 'corrupt.png')
  fs.writeFileSync(source, Buffer.from('not-a-decodable-image', 'utf8'))
  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')
  let ocrCalled = false
  await assert.rejects(() => executeImageIngest({
    workerId: 'worker_test',
    imageIngestId: 'imageingest_33333333-3333-4333-8333-333333333333',
    primaryInputType: 'NATURAL_LANGUAGE',
    images: [{ ordinal: 1, filePath: source, originalFilename: 'corrupt.png', sourceSha256 }]
  }, {
    productRoot,
    ocrImage: async () => {
      ocrCalled = true
      return { text: '', sensitiveBoxes: [] }
    }
  }), error => error?.code === 'I10_IMAGE_DECODE_FAILED')
  assert.equal(ocrCalled, false)
  fs.rmSync(productRoot, { recursive: true, force: true })
})

test('controller returns empty facts after exactly one invocation', async () => {
  const originalFetch = global.fetch
  const previous = {
    CONTROL_API_KEY: process.env.CONTROL_API_KEY,
    CONTROL_BASE_URL: process.env.CONTROL_BASE_URL,
    CONTROL_MODEL_NAME: process.env.CONTROL_MODEL_NAME
  }
  let calls = 0
  global.fetch = async () => {
    calls += 1
    const facts = calls === 1 ? [] : [{
      field: 'ACTION',
      value: '点击登录按钮',
      provenanceRefs: ['image:1:hash'],
      confidence: 0.9,
      selected: true,
      requiresUserConfirmation: true
    }]
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ facts }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  Object.assign(process.env, {
    CONTROL_API_KEY: 'test-key',
    CONTROL_BASE_URL: 'https://example.invalid/v1',
    CONTROL_MODEL_NAME: 'test-controller'
  })
  try {
    const result = await selectCaseFacts(
      [{ ordinal: 1, sourceSha256: 'hash', purposeHint: '', ocrText: '登录 登录按钮', confidence: 0.8 }],
      { imageIngestId: 'imageingest_00000000-0000-4000-8000-000000000000', primaryInputType: 'NATURAL_LANGUAGE' }
    )
    assert.equal(calls, 1)
    assert.equal(result.facts.length, 0)
    assert.equal(result.controllerInvocation.inputTokens, 10)
    assert.equal(result.controllerInvocation.outputTokens, 5)
  } finally {
    global.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
