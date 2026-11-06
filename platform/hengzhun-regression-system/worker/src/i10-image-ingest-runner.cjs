'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { redactFrame, redactText, sha256 } = require('./i10-video-ingest-runner.cjs');
const { engineName: onnxEngineName, ocrImageOnnx } = require('./i10-onnx-ocr.cjs');

const productRoot = path.resolve(__dirname,'..','..');
const ffmpegPath = path.join(productRoot, 'runtime', require('../../config/demo-runtime-freeze.json').mediaFfmpeg.executable);

function validateImageForOcr(filePath){
  const stat=fs.statSync(filePath);
  if(!stat.isFile()||stat.size<=0||stat.size>20*1024*1024)throw Object.assign(new Error('I10_IMAGE_SIZE_INVALID'),{code:'I10_IMAGE_SIZE_INVALID'});
  if(!fs.existsSync(ffmpegPath))throw Object.assign(new Error('I10_FFMPEG_MISSING'),{code:'I10_FFMPEG_MISSING'});
  const result=spawnSync(ffmpegPath,['-v','error','-i',filePath,'-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});
  if(result.error||result.status!==0){
    throw Object.assign(new Error('I10_IMAGE_DECODE_FAILED'),{code:'I10_IMAGE_DECODE_FAILED'});
  }
}

function modelEndpoint(baseUrl){const normalized=String(baseUrl||'').replace(/\/$/,'');return normalized.endsWith('/chat/completions')?normalized:`${normalized}/chat/completions`;}

function branchResult(status, startedAt, details = {}) {
  return {
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...details
  };
}

async function runOcrBranch(basePackets, redactedRoot, runRelative, options = {}) {
  const startedAt = Date.now();
  const packets = [];
  let modelSha256;
  let recognizedRegionCount = 0;
  let activeEngine = options.ocrEngineName || onnxEngineName;
  for (const packet of basePackets) {
    const ocr = await (options.ocrImage || ocrImageOnnx)(packet.rawAbsolutePath);
    activeEngine = ocr.engine || activeEngine;
    modelSha256 = ocr.modelSha256 || modelSha256;
    recognizedRegionCount += Number(ocr.recognizedRegionCount) || 0;
    const normalized = {
      text: redactText(ocr.text || ocr),
      sensitiveBoxes: Array.isArray(ocr.sensitiveBoxes) ? ocr.sensitiveBoxes : []
    };
    const redacted = path.join(redactedRoot, `image-${String(packet.ordinal).padStart(3, '0')}.png`);
    redactFrame(packet.rawAbsolutePath, redacted, normalized.sensitiveBoxes);
    const chinese = (normalized.text.match(/[\u3400-\u9fff]/g) || []).length;
    const latin = (normalized.text.match(/[A-Za-z]/g) || []).length;
    packets.push({
      ...packet,
      redactedAbsolutePath: redacted,
      redactedImagePath: path.join(runRelative, 'redacted', path.basename(redacted)).replace(/\\/g, '/'),
      redactedImageSha256: sha256(fs.readFileSync(redacted)),
      ocrText: normalized.text,
      ocrTextHash: sha256(normalized.text),
      language: chinese && latin ? 'zh+en' : chinese ? 'zh' : latin ? 'en' : 'unknown',
      confidence: normalized.text ? Math.max(0,Math.min(1,Number(ocr.confidence ?? 0.8))) : 0.2
    });
  }
  return {
    packets,
    evidence: branchResult('SUCCEEDED', startedAt, {
      engine: activeEngine,
      modelSha256,
      processedImageCount: packets.length,
      recognizedRegionCount
    })
  };
}

function failedBranch(startedAt, error, engine) {
  return branchResult(error?.name === 'TimeoutError' ? 'TIMED_OUT' : 'FAILED', startedAt, {
    engine,
    errorCode: String(error?.code || error?.name || 'I10_IMAGE_BRANCH_FAILED').toUpperCase().replace(/[^A-Z0-9_]/g,'_').slice(0, 120)
  });
}

function normalizeFact(raw,index,packetRefs,factPrefix='fact'){
  const fields=new Set(['TITLE','OBJECTIVE','TARGET_SYSTEM','ENTRY_URL','PRECONDITION','ACTION','INPUT_VALUE','EXPECTED_RESULT','VERIFICATION_REQUIREMENT','OTHER']);
  const value=redactText(raw?.value).slice(0,2000);
  if(!value)return null;
  const refs=raw?.provenanceRefs;
  if(!Array.isArray(refs)||!refs.length||refs.some(ref=>typeof ref!=='string'||!packetRefs.has(ref)))
    throw Object.assign(new Error('I10_IMAGE_FACT_PROVENANCE_INVALID'),{code:'I10_IMAGE_FACT_PROVENANCE_INVALID'});
  return{factId:`${factPrefix}_${String(index+1).padStart(4,'0')}`,field:fields.has(raw?.field)?raw.field:'OTHER',value,provenanceRefs:refs,confidence:Math.max(0,Math.min(1,Number(raw?.confidence)||0)),selected:raw?.selected===true,requiresUserConfirmation:raw?.requiresUserConfirmation!==false};
}

async function selectCaseFacts(packets,claim,options={}){
  if(options.selectFacts)return options.selectFacts(packets,claim);
  const apiKey=process.env.HENGZHUN_MODEL_API_KEY||process.env.CONTROL_API_KEY,baseUrl=process.env.HENGZHUN_MODEL_BASE_URL||process.env.CONTROL_BASE_URL,model=process.env.HENGZHUN_MODEL_NAME||process.env.CONTROL_MODEL_NAME;
  if(!apiKey||!baseUrl||!model)throw Object.assign(new Error('I10_CONTROL_CONFIGURATION_MISSING'),{code:'I10_CONTROL_CONFIGURATION_MISSING'});
  const evidence=packets.map(packet=>({provenanceRef:`image:${packet.ordinal}:${packet.sourceSha256}`,purposeHint:packet.purposeHint||'',ocrText:packet.ocrText.slice(0,12000),ocrConfidence:packet.confidence}));
  const packetRefs=new Set(evidence.map(item=>item.provenanceRef));const factPrefix=`fact_${String(claim.imageIngestId).replace(/[^A-Za-z0-9]/g,'').slice(-12)}`;
  let inputTokens=0,outputTokens=0;
    const prompt={role:'user',content:`你是衡准回归案例事实筛选器。主输入类型=${claim.primaryInputType}。输入只有本机ONNX中英文OCR文字，不存在视觉模型观察。请从OCR证据中选择与回归案例有关的事实，尤其补齐页面文字、输入字段、前置条件、动作、预期结果和验证要求。只能引用对应provenanceRef，不得猜测未知值，不得恢复被脱敏信息。低置信度或歧义事实必须requiresUserConfirmation=true。只要OCR包含页面标题、输入框、按钮或状态文字，就至少输出一个可确认事实；确实没有案例信息时才输出空数组。严格输出JSON {"facts":[{"field":"INPUT_VALUE","value":"...","provenanceRefs":["image:1:hash"],"confidence":0.8,"selected":true,"requiresUserConfirmation":true}]}。OCR证据：${JSON.stringify(evidence)}`};
    const response=await fetch(modelEndpoint(baseUrl),{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,temperature:0,max_tokens:8192,response_format:{type:'json_object'},messages:[prompt]}),signal:AbortSignal.timeout(90_000)}).catch(()=>null);
    if(!response?.ok)throw Object.assign(new Error('I10_CONTROL_IMAGE_FACT_CALL_FAILED'),{code:'I10_CONTROL_IMAGE_FACT_CALL_FAILED'});
    const body=await response.json();inputTokens+=Number(body?.usage?.prompt_tokens)||0;outputTokens+=Number(body?.usage?.completion_tokens)||0;const content=body?.choices?.[0]?.message?.content;let parsed;
    try{parsed=JSON.parse(content);}catch{throw Object.assign(new Error('I10_CONTROL_IMAGE_FACT_RESPONSE_INVALID'),{code:'I10_CONTROL_IMAGE_FACT_RESPONSE_INVALID'});}
    const facts=(Array.isArray(parsed?.facts)?parsed.facts:[]).map((fact,index)=>normalizeFact(fact,index,packetRefs,factPrefix)).filter(Boolean).slice(0,200);
    return{facts,controllerInvocation:{invocation:'REAL',provider:'openai-compatible',model,inputTokens,outputTokens}};
}

async function executeImageIngest(claim,options={}){
  const executionRoot=path.resolve(options.productRoot||productRoot);const runRelative=path.join('.data','image-ingest',claim.imageIngestId);const rawRoot=path.join(executionRoot,runRelative,'raw');const redactedRoot=path.join(executionRoot,runRelative,'redacted');fs.mkdirSync(rawRoot,{recursive:true});fs.mkdirSync(redactedRoot,{recursive:true});
  const basePackets=[];
  try{
    for(const image of claim.images){const extension=path.extname(image.originalFilename).toLowerCase()==='.webp'?'.png':path.extname(image.originalFilename).toLowerCase();const raw=path.join(rawRoot,`image-${String(image.ordinal).padStart(3,'0')}${extension}`);fs.copyFileSync(image.filePath,raw);const sourceSha256=sha256(fs.readFileSync(raw));if(sourceSha256!==image.sourceSha256)throw Object.assign(new Error('I10_IMAGE_SOURCE_HASH_MISMATCH'),{code:'I10_IMAGE_SOURCE_HASH_MISMATCH'});validateImageForOcr(raw);basePackets.push({ordinal:image.ordinal,sourceSha256,purposeHint:image.purposeHint,rawAbsolutePath:raw});}
    const ocrStartedAt=Date.now();
    let ocr;
    try {
      ocr = await runOcrBranch(basePackets,redactedRoot,runRelative,options);
    } catch (error) {
      const evidence = failedBranch(ocrStartedAt,error,options.ocrEngineName||onnxEngineName);
      throw Object.assign(new Error('I10_IMAGE_OCR_FAILED_CLOSED'), {
        code:'I10_IMAGE_OCR_FAILED_CLOSED',
        recognitionBranches:{ocr:evidence}
      });
    }
    const recognitionBranches={ocr:ocr.evidence};
    const packets=ocr.packets;
    const selected=await selectCaseFacts(packets,claim,options);
    if(!selected.facts.length)throw Object.assign(new Error('I10_IMAGE_FACTS_EMPTY'),{code:'I10_IMAGE_FACTS_EMPTY'});
    return{workerId:claim.workerId,imageIngestId:claim.imageIngestId,packets:packets.map(({purposeHint,rawAbsolutePath,analysisAbsolutePath,redactedAbsolutePath,...packet})=>packet),facts:selected.facts,controllerInvocation:selected.controllerInvocation,recognitionBranches};
  }finally{fs.rmSync(rawRoot,{recursive:true,force:true});}
}

module.exports={executeImageIngest,selectCaseFacts,normalizeFact,validateImageForOcr,runOcrBranch};
