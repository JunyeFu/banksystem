'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createWorker } = require('tesseract.js');

const productRoot = path.resolve(__dirname, '..', '..');
const ffmpegPath = path.join(productRoot, 'runtime', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');
const engData = require('@tesseract.js-data/eng');
const chiData = require('@tesseract.js-data/chi_sim');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function redactText(value) {
  return String(value || '')
    .replace(/(?:password|passwd|pwd|密码)\s*[:=：]?\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\b1\d{10}\b/g, '[PHONE_REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]')
    .slice(0, 4000);
}

function runFfmpeg(args, errorCode) {
  const result = spawnSync(ffmpegPath, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const error = new Error(errorCode);
    error.code = errorCode;
    error.details = redactText(result.stderr).slice(-1000);
    throw error;
  }
  return result;
}

function inspectVideo(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 500 * 1024 * 1024) {
    throw Object.assign(new Error('I10_VIDEO_SIZE_INVALID'), { code: 'I10_VIDEO_SIZE_INVALID' });
  }
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', filePath, '-f', 'null', '-'], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024
  });
  const output = String(result.stderr || '');
  const video = output.match(/Video:\s*([^,]+).*?(\d{2,5})x(\d{2,5})/i);
  const duration = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!video || !duration) throw Object.assign(new Error('I10_VIDEO_METADATA_UNREADABLE'), { code: 'I10_VIDEO_METADATA_UNREADABLE' });
  const codec = video[1].trim().toLowerCase();
  const width = Number(video[2]);
  const height = Number(video[3]);
  const durationSeconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  if (!codec.includes('h264')) throw Object.assign(new Error('I10_VIDEO_CODEC_UNSUPPORTED'), { code: 'I10_VIDEO_CODEC_UNSUPPORTED' });
  if (width > 1920 || height > 1080 || durationSeconds > 900) throw Object.assign(new Error('I10_VIDEO_LIMIT_EXCEEDED'), { code: 'I10_VIDEO_LIMIT_EXCEEDED' });
  return { codec: 'h264', width, height, durationSeconds };
}

function sensitiveBoxesFromTsv(tsvDocuments) {
  const words = [];
  for (const tsv of tsvDocuments) {
    for (const line of String(tsv || '').split(/\r?\n/).slice(1)) {
      const columns = line.split('\t');
      if (columns.length < 12 || Number(columns[0]) !== 5) continue;
      const text = columns.slice(11).join('\t').trim();
      if (!text) continue;
      words.push({ text, left: Number(columns[6]), top: Number(columns[7]), width: Number(columns[8]), height: Number(columns[9]) });
    }
  }
  const sensitive = /(?:password|passwd|pwd|密码|口令|验证码)|\b1\d{10}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\bsk-[A-Za-z0-9_-]{8,}\b/i;
  const sensitiveBoxes = [];
  for (let index = 0; index < words.length; index += 1) {
    if (!sensitive.test(words[index].text)) continue;
    for (const word of words.slice(index, index + 3)) {
      if ([word.left, word.top, word.width, word.height].every(Number.isFinite) && word.width > 0 && word.height > 0) sensitiveBoxes.push(word);
    }
  }
  return sensitiveBoxes.slice(0, 50);
}

async function ocrFrame(imagePath) {
  const texts = [];
  const tsvDocuments = [];
  for (const data of [chiData, engData]) {
    const worker = await createWorker(data.code, 1, { langPath: data.langPath, gzip: data.gzip, cacheMethod: 'readOnly' });
    try {
      const result = (await worker.recognize(imagePath)).data;
      texts.push(result.text || '');
      tsvDocuments.push(result.tsv || '');
    }
    finally { await worker.terminate(); }
  }
  return { text: redactText(texts.join('\n')), sensitiveBoxes: sensitiveBoxesFromTsv(tsvDocuments) };
}

function redactFrame(rawPath, redactedPath, sensitiveBoxes) {
  const filters = [
    'drawbox=x=0:y=0:w=iw:h=ih*0.12:color=black:t=fill',
    'drawbox=x=0:y=ih*0.88:w=iw:h=ih*0.12:color=black:t=fill',
    ...sensitiveBoxes.map(box => `drawbox=x=${Math.max(0, Math.floor(box.left - 4))}:y=${Math.max(0, Math.floor(box.top - 4))}:w=${Math.ceil(box.width + 8)}:h=${Math.ceil(box.height + 8)}:color=black:t=fill`),
    "scale='min(1280,iw)':-2"
  ];
  runFfmpeg(['-y', '-i', rawPath, '-vf', filters.join(','), '-frames:v', '1', redactedPath], 'I10_VIDEO_REDACTION_FAILED');
}

function estimateVisualInputTokens(width, height, text) {
  const scaledWidth = Math.min(1280, width);
  const scaledHeight = Math.ceil(height * scaledWidth / width);
  const imageTokens = Math.ceil(scaledWidth / 28) * Math.ceil(scaledHeight / 28);
  const textTokens = Math.ceil(String(text || '').length / 2) + 512;
  return imageTokens + textTokens;
}

function modelEndpoint(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

async function observeFrame(imagePath, ordinal, timestampMs, ocrText, dimensions) {
  const apiKey = process.env.VISION_API_KEY || process.env.MIDSCENE_MODEL_API_KEY;
  const baseUrl = process.env.VISION_BASE_URL || process.env.MIDSCENE_MODEL_BASE_URL;
  const model = process.env.VISION_MODEL_NAME || process.env.MIDSCENE_MODEL_NAME || 'mimo-v2.5';
  if (!apiKey || !baseUrl) throw Object.assign(new Error('I10_MIMO_CONFIGURATION_MISSING'), { code: 'I10_MIMO_CONFIGURATION_MISSING' });
  const estimatedInputTokens = estimateVisualInputTokens(dimensions.width, dimensions.height, ocrText);
  if (estimatedInputTokens > 12_000) throw Object.assign(new Error('I10_VISUAL_INPUT_BUDGET_EXCEEDED'), { code: 'I10_VISUAL_INPUT_BUDGET_EXCEEDED' });
  const image = fs.readFileSync(imagePath).toString('base64');
  const requestBody = JSON.stringify({
    model, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [
      { type: 'text', text: `你是衡准视频案例视觉观察器。只描述第${ordinal}帧中可见的浏览器操作事实，不推测密码或隐藏内容。时间${timestampMs}ms。OCR摘要：${ocrText.slice(0, 1200)}。严格输出JSON：{"visibleAction":"...","target":"...","expectedVisibleResult":"...","cursorVisible":true,"browserWindowCount":1,"confidence":0.0}` },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }
    ] }]
  });
  let response;
  let modelAttempts = 0;
  for (modelAttempts = 1; modelAttempts <= 3; modelAttempts += 1) {
    try {
      response = await fetch(modelEndpoint(baseUrl), {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: requestBody, signal: AbortSignal.timeout(90_000)
      });
    } catch {
      if (modelAttempts === 3) throw Object.assign(new Error('I10_MIMO_VISUAL_CALL_FAILED'), { code: 'I10_MIMO_VISUAL_CALL_FAILED' });
      await new Promise(resolve => setTimeout(resolve, modelAttempts * 1_000));
      continue;
    }
    if (response.ok) break;
    if (modelAttempts === 3 || (response.status !== 429 && response.status < 500)) {
      throw Object.assign(new Error('I10_MIMO_VISUAL_CALL_FAILED'), { code: 'I10_MIMO_VISUAL_CALL_FAILED' });
    }
    await new Promise(resolve => setTimeout(resolve, modelAttempts * 1_000));
  }
  if (!response?.ok) throw Object.assign(new Error('I10_MIMO_VISUAL_CALL_FAILED'), { code: 'I10_MIMO_VISUAL_CALL_FAILED' });
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === 'string' ? content : '');
  if (!parsed || typeof parsed.visibleAction !== 'string' || typeof parsed.confidence !== 'number' || !Number.isInteger(parsed.browserWindowCount)) {
    throw Object.assign(new Error('I10_MIMO_VISUAL_RESPONSE_INVALID'), { code: 'I10_MIMO_VISUAL_RESPONSE_INVALID' });
  }
  return {
    visibleAction: redactText(parsed.visibleAction).slice(0, 500),
    target: redactText(parsed.target).slice(0, 300),
    expectedVisibleResult: redactText(parsed.expectedVisibleResult).slice(0, 500),
    cursorVisible: parsed.cursorVisible === true,
    browserWindowCount: parsed.browserWindowCount,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    provider: 'mimo', model, invocation: 'REAL', modelAttempts, estimatedInputTokens, totalContextTokens: 16000, reservedOutputTokens: 4000
  };
}

async function executeVideoIngest(claim, options = {}) {
  if (!fs.existsSync(ffmpegPath)) throw Object.assign(new Error('I10_FFMPEG_MISSING'), { code: 'I10_FFMPEG_MISSING' });
  const metadata = inspectVideo(claim.filePath);
  const executionRoot = path.resolve(options.productRoot || productRoot);
  const frameObserver = options.observeFrame || observeFrame;
  const frameOcr = options.ocrFrame || ocrFrame;
  const runRelative = path.join('.data', 'video-ingest', claim.ingestJobId);
  const runRoot = path.join(executionRoot, runRelative);
  const rawRoot = path.join(runRoot, 'raw');
  const redactedRoot = path.join(runRoot, 'redacted');
  fs.mkdirSync(rawRoot, { recursive: true });
  fs.mkdirSync(redactedRoot, { recursive: true });
  try {
  const everySeconds = Math.max(2, Math.ceil(metadata.durationSeconds / 12));
  runFfmpeg(['-y', '-i', claim.filePath, '-vf', `fps=1/${everySeconds}`, '-frames:v', '12', path.join(rawRoot, 'frame-%03d.png')], 'I10_VIDEO_FRAME_EXTRACTION_FAILED');
  const rawFrames = fs.readdirSync(rawRoot).filter(name => /^frame-\d{3}\.png$/.test(name)).sort();
  if (rawFrames.length === 0) throw Object.assign(new Error('I10_VIDEO_NO_FRAMES'), { code: 'I10_VIDEO_NO_FRAMES' });
  const frames = [];
  const observations = [];
  for (let index = 0; index < rawFrames.length; index += 1) {
    const raw = path.join(rawRoot, rawFrames[index]);
    const redacted = path.join(redactedRoot, rawFrames[index]);
    const timestampMs = Math.min(Math.round(index * everySeconds * 1000), Math.round(metadata.durationSeconds * 1000));
    const ocrResult = await frameOcr(raw);
    const normalizedOcr = typeof ocrResult === 'string' ? { text: redactText(ocrResult), sensitiveBoxes: [] } : { text: redactText(ocrResult.text), sensitiveBoxes: Array.isArray(ocrResult.sensitiveBoxes) ? ocrResult.sensitiveBoxes : [] };
    redactFrame(raw, redacted, normalizedOcr.sensitiveBoxes);
    const observation = await frameObserver(redacted, index + 1, timestampMs, normalizedOcr.text, { width: metadata.width, height: metadata.height });
    if (!observation.cursorVisible) observation.confidence = Math.min(observation.confidence, 0.49);
    if (observation.browserWindowCount !== 1) observation.confidence = Math.min(observation.confidence, 0.49);
    observations.push(observation);
    frames.push({
      ordinal: index + 1, timestampMs,
      imageSha256: sha256(fs.readFileSync(redacted)),
      redactedImagePath: path.join(runRelative, 'redacted', rawFrames[index]).replace(/\\/g, '/'),
      ocrTextHash: sha256(normalizedOcr.text), visualObservation: observation, confidence: observation.confidence
    });
  }
  const hints = claim.hints || {};
  const confidence = observations.reduce((sum, item) => sum + item.confidence, 0) / observations.length;
  const missingFields = [];
  if (!hints.targetSystemHint) missingFields.push('targetSystem');
  if (!hints.entryUrlHint) missingFields.push('entryUrl');
  if (!claim.credentialRef) missingFields.push('credentialRef');
  if (confidence < 0.75) missingFields.push('lowConfidenceActions');
  if (observations.some(item => !item.cursorVisible)) missingFields.push('mousePointerVisibility');
  if (observations.some(item => item.browserWindowCount !== 1)) missingFields.push('singleBrowserWindow');
  const steps = observations.map((item, index) => ({
    action: item.visibleAction || `确认第${index + 1}个可见动作`,
    expected: item.expectedVisibleResult || '需人工确认可见结果'
  }));
  const draft = {
    schemaVersion: 'hengzhun-i10-case-draft-v1',
    title: '视频导入的成功回归案例', objective: '复现并验证视频中展示的成功浏览器操作路径。',
    summary: '由离线抽帧、离线OCR和MiMo v2.5真实视觉观察生成，提交前必须人工确认。',
    ...(hints.targetSystemHint ? { targetSystem: hints.targetSystemHint } : {}),
    ...(hints.entryUrlHint ? { entryUrl: hints.entryUrlHint } : {}),
    preconditions: ['目标系统可访问', '用户确认动作时间线与预期结果'], steps,
    assertions: steps.map(item => item.expected), ...(claim.credentialRef ? { credentialRef: claim.credentialRef } : {}),
    source: { inputType: 'VIDEO', sourceRef: claim.ingestJobId, sourceHash: claim.sourceHash, provenanceSummary: `MP4/H.264；${metadata.width}x${metadata.height}；${metadata.durationSeconds.toFixed(2)}秒；${frames.length}个脱敏关键帧。` },
    confidence, missingFields: [...new Set(missingFields)], confirmationStatus: 'WAITING_USER',
    authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY', executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY', evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
  };
  return { workerId: claim.workerId, ingestJobId: claim.ingestJobId, sourceHash: claim.sourceHash, frames, drafts: [draft] };
  } finally {
    fs.rmSync(rawRoot, { recursive: true, force: true });
  }
}

module.exports = { executeVideoIngest, inspectVideo, redactText, estimateVisualInputTokens, sensitiveBoxesFromTsv, ocrFrame, redactFrame, sha256 };
