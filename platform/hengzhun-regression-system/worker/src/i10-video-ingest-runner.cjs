'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  engineName: onnxEngineName,
  modelFingerprint,
  ocrImageOnnx
} = require('./i10-onnx-ocr.cjs');

const productRoot = path.resolve(__dirname, '..', '..');
const ffmpegPath = path.join(productRoot, 'runtime', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');
const timelineVersion = 'OCR_FRAME_DIFF_V1';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function redactText(value) {
  return String(value || '')
    .replace(/(?:password|passwd|pwd|密码)\s*[:=：]?\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\b1\d{10}\b/g, '[PHONE_REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gi, '[API_KEY_REDACTED]')
    .slice(0, 12000);
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

async function ocrFrame(imagePath) {
  const result = await ocrImageOnnx(imagePath);
  return {
    text: redactText(result.text),
    confidence: Number(result.confidence) || 0,
    sensitiveBoxes: Array.isArray(result.sensitiveBoxes) ? result.sensitiveBoxes : [],
    engine: result.engine || onnxEngineName,
    modelSha256: result.modelSha256 || modelFingerprint(),
    recognizedRegionCount: Number(result.recognizedRegionCount) || 0
  };
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

function meaningfulLines(value) {
  return [...new Set(String(value || '').split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length >= 2))]
    .slice(0, 80);
}

function buildOcrTimelineObservation(current, previous, ordinal, timestampMs) {
  const currentLines = meaningfulLines(current.text);
  const previousLines = new Set(meaningfulLines(previous?.text));
  const added = currentLines.filter(line => !previousLines.has(line)).slice(0, 12);
  const pageSummary = added.length ? added.join('、') : currentLines.slice(0, 8).join('、');
  const confidence = Math.max(0, Math.min(0.74, Number(current.confidence) || 0));
  return {
    visibleAction: ordinal === 1
      ? `打开并查看包含“${pageSummary || '未识别页面文字'}”的页面`
      : added.length
        ? `页面文字发生变化，新增“${pageSummary}”`
        : `页面在${timestampMs}毫秒时未识别到新的文字变化`,
    target: pageSummary || '需要用户根据关键帧确认页面目标',
    expectedVisibleResult: added.length
      ? `页面显示“${pageSummary}”`
      : '需要用户确认该时间点的实际操作和可见结果',
    provider: 'local-onnx-ocr',
    invocation: 'LOCAL',
    engine: current.engine || onnxEngineName,
    modelSha256: current.modelSha256 || modelFingerprint(),
    recognizedRegionCount: current.recognizedRegionCount,
    deterministicTimelineVersion: timelineVersion,
    confidence,
    requiresUserConfirmation: true,
    confidenceSafetyReason: 'OCR_TIMELINE_CANNOT_PROVE_POINTER_ACTION'
  };
}

function modelEndpoint(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

function normalizeControllerDraft(raw, claim, observations) {
  const refs = new Set(observations.map((_, index) => `video:${claim.ingestJobId}:frame:${index + 1}:ocr`));
  const steps = (Array.isArray(raw?.steps) ? raw.steps : []).map(item => ({
    action: redactText(item?.action).slice(0, 1000),
    expected: redactText(item?.expected).slice(0, 1000)
  })).filter(item => item.action && item.expected).slice(0, 100);
  const caseFacts = (Array.isArray(raw?.caseFacts) ? raw.caseFacts : []).map((fact, index) => {
    const value = redactText(fact?.value).slice(0, 2000);
    const provenanceRefs = (Array.isArray(fact?.provenanceRefs) ? fact.provenanceRefs : [])
      .map(String).filter(ref => refs.has(ref));
    if (!value || !provenanceRefs.length) return null;
    return {
      factId: `video_fact_${sha256(`${claim.ingestJobId}:${index}:${value}`).slice(0, 24)}`,
      field: ['TITLE','OBJECTIVE','TARGET_SYSTEM','ENTRY_URL','PRECONDITION','ACTION','INPUT_VALUE','EXPECTED_RESULT','VERIFICATION_REQUIREMENT','OTHER'].includes(fact?.field) ? fact.field : 'OTHER',
      value,
      provenanceRefs,
      confidence: Math.max(0, Math.min(0.74, Number(fact?.confidence) || 0)),
      selected: fact?.selected !== false,
      requiresUserConfirmation: true
    };
  }).filter(Boolean).slice(0, 200);
  if (!steps.length || !caseFacts.length) {
    throw Object.assign(new Error('I10_CONTROL_VIDEO_TIMELINE_EMPTY'), { code: 'I10_CONTROL_VIDEO_TIMELINE_EMPTY' });
  }
  return {
    title: redactText(raw?.title || '视频导入的成功回归案例').slice(0, 300),
    objective: redactText(raw?.objective || '复现并验证视频中展示的成功浏览器操作路径。').slice(0, 1000),
    summary: redactText(raw?.summary || '由本地ONNX OCR时间线生成，提交前必须人工确认。').slice(0, 2000),
    steps,
    caseFacts,
    confidence: Math.max(0, Math.min(0.74, Number(raw?.confidence) || 0))
  };
}

async function selectVideoCase(observations, claim, options = {}) {
  if (options.selectVideoCase) return options.selectVideoCase(observations, claim);
  const apiKey = process.env.CONTROL_API_KEY;
  const baseUrl = process.env.CONTROL_BASE_URL;
  const model = process.env.CONTROL_MODEL_NAME;
  if (!apiKey || !baseUrl || !model) {
    throw Object.assign(new Error('I10_CONTROL_CONFIGURATION_MISSING'), { code: 'I10_CONTROL_CONFIGURATION_MISSING' });
  }
  const evidence = observations.map((item, index) => ({
    provenanceRef: `video:${claim.ingestJobId}:frame:${index + 1}:ocr`,
    timestampMs: item.timestampMs,
    ocrText: item.ocrText.slice(0, 12000),
    ocrConfidence: item.ocrConfidence,
    addedText: item.addedText
  }));
  const prompt = {
    role: 'user',
    content: `你是衡准视频案例整理器。输入只有本机ONNX中英文OCR时间线，不存在视觉模型观察。请从页面文字变化中整理成功案例的候选步骤、预期结果和事实；不得声称看见点击、鼠标、窗口数量或未被OCR证明的动作。所有结果都必须人工确认。严格输出JSON {"title":"...","objective":"...","summary":"...","steps":[{"action":"...","expected":"..."}],"caseFacts":[{"field":"ACTION","value":"...","provenanceRefs":["video:...:frame:1:ocr"],"confidence":0.7,"selected":true}],"confidence":0.7}。OCR时间线：${JSON.stringify(evidence)}`
  };
  const response = await fetch(modelEndpoint(baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 8192, response_format: { type: 'json_object' }, messages: [prompt] }),
    signal: AbortSignal.timeout(90_000)
  }).catch(() => null);
  if (!response?.ok) throw Object.assign(new Error('I10_CONTROL_VIDEO_FACT_CALL_FAILED'), { code: 'I10_CONTROL_VIDEO_FACT_CALL_FAILED' });
  const body = await response.json();
  let parsed;
  try { parsed = JSON.parse(body?.choices?.[0]?.message?.content); }
  catch { throw Object.assign(new Error('I10_CONTROL_VIDEO_FACT_RESPONSE_INVALID'), { code: 'I10_CONTROL_VIDEO_FACT_RESPONSE_INVALID' }); }
  return {
    ...normalizeControllerDraft(parsed, claim, observations),
    controllerInvocation: {
      invocation: 'REAL',
      provider: 'openai-compatible',
      model,
      inputTokens: Number(body?.usage?.prompt_tokens) || 0,
      outputTokens: Number(body?.usage?.completion_tokens) || 0
    }
  };
}

async function executeVideoIngest(claim, options = {}) {
  if (!fs.existsSync(ffmpegPath)) throw Object.assign(new Error('I10_FFMPEG_MISSING'), { code: 'I10_FFMPEG_MISSING' });
  const metadata = inspectVideo(claim.filePath);
  const executionRoot = path.resolve(options.productRoot || productRoot);
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
    let previousOcr;
    for (let index = 0; index < rawFrames.length; index += 1) {
      const raw = path.join(rawRoot, rawFrames[index]);
      const redacted = path.join(redactedRoot, rawFrames[index]);
      const timestampMs = Math.min(Math.round(index * everySeconds * 1000), Math.round(metadata.durationSeconds * 1000));
      const currentOcr = await frameOcr(raw);
      const normalizedOcr = {
        text: redactText(currentOcr.text || currentOcr),
        confidence: Math.max(0, Math.min(1, Number(currentOcr.confidence) || 0)),
        sensitiveBoxes: Array.isArray(currentOcr.sensitiveBoxes) ? currentOcr.sensitiveBoxes : [],
        engine: currentOcr.engine || onnxEngineName,
        modelSha256: currentOcr.modelSha256 || modelFingerprint(),
        recognizedRegionCount: Number(currentOcr.recognizedRegionCount) || 0
      };
      if (!normalizedOcr.text) throw Object.assign(new Error('I10_VIDEO_OCR_EMPTY'), { code: 'I10_VIDEO_OCR_EMPTY' });
      redactFrame(raw, redacted, normalizedOcr.sensitiveBoxes);
      const previousLines = new Set(meaningfulLines(previousOcr?.text));
      const addedText = meaningfulLines(normalizedOcr.text).filter(line => !previousLines.has(line)).slice(0, 12);
      const timeline = buildOcrTimelineObservation(normalizedOcr, previousOcr, index + 1, timestampMs);
      observations.push({
        ...timeline,
        timestampMs,
        ocrText: normalizedOcr.text,
        ocrConfidence: normalizedOcr.confidence,
        addedText
      });
      frames.push({
        ordinal: index + 1,
        timestampMs,
        imageSha256: sha256(fs.readFileSync(redacted)),
        redactedImagePath: path.join(runRelative, 'redacted', rawFrames[index]).replace(/\\/g, '/'),
        ocrTextHash: sha256(normalizedOcr.text),
        visualObservation: timeline,
        confidence: timeline.confidence
      });
      previousOcr = normalizedOcr;
    }
    const selected = await selectVideoCase(observations, claim, options);
    const hints = claim.hints || {};
    const missingFields = [];
    if (!hints.targetSystemHint) missingFields.push('targetSystem');
    if (!hints.entryUrlHint) missingFields.push('entryUrl');
    if (!claim.credentialRef) missingFields.push('credentialRef');
    missingFields.push('lowConfidenceActions');
    const draft = {
      schemaVersion: 'hengzhun-i10-case-draft-v1',
      title: selected.title,
      objective: selected.objective,
      summary: selected.summary,
      ...(hints.targetSystemHint ? { targetSystem: hints.targetSystemHint } : {}),
      ...(hints.entryUrlHint ? { entryUrl: hints.entryUrlHint } : {}),
      preconditions: ['目标系统可访问', '用户逐项确认OCR时间线推导的动作和预期结果'],
      steps: selected.steps,
      caseFacts: selected.caseFacts,
      assertions: selected.steps.map(item => item.expected),
      ...(claim.credentialRef ? { credentialRef: claim.credentialRef } : {}),
      source: {
        inputType: 'VIDEO',
        sourceRef: claim.ingestJobId,
        sourceHash: claim.sourceHash,
        provenanceSummary: `MP4/H.264；${metadata.width}x${metadata.height}；${metadata.durationSeconds.toFixed(2)}秒；${frames.length}个ONNX OCR关键帧；${timelineVersion}。`
      },
      confidence: selected.confidence,
      missingFields: [...new Set(missingFields)],
      confirmationStatus: 'WAITING_USER',
      authoringStrategy: 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',
      executionStrategy: 'PLAYWRIGHT_VALIDATED_ONLY',
      evidenceStrategy: 'REDACTED_HASHED_EVIDENCE'
    };
    return {
      workerId: claim.workerId,
      ingestJobId: claim.ingestJobId,
      sourceHash: claim.sourceHash,
      frames,
      drafts: [draft],
      controllerInvocation: selected.controllerInvocation
    };
  } finally {
    fs.rmSync(rawRoot, { recursive: true, force: true });
  }
}

module.exports = {
  executeVideoIngest,
  inspectVideo,
  redactText,
  ocrFrame,
  redactFrame,
  sha256,
  meaningfulLines,
  buildOcrTimelineObservation,
  normalizeControllerDraft,
  selectVideoCase,
  timelineVersion
};
