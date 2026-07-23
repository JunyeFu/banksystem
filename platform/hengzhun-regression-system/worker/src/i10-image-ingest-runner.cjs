'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ocrFrame, redactFrame, redactText, sha256 } = require('./i10-video-ingest-runner.cjs');

const productRoot = path.resolve(__dirname,'..','..');

function modelEndpoint(baseUrl){const normalized=String(baseUrl||'').replace(/\/$/,'');return normalized.endsWith('/chat/completions')?normalized:`${normalized}/chat/completions`;}

function normalizeFact(raw,index,packetRefs,factPrefix='fact'){
  const fields=new Set(['TITLE','OBJECTIVE','TARGET_SYSTEM','ENTRY_URL','PRECONDITION','ACTION','INPUT_VALUE','EXPECTED_RESULT','VERIFICATION_REQUIREMENT','OTHER']);
  const value=redactText(raw?.value).slice(0,2000);
  if(!value)return null;
  const refs=Array.isArray(raw?.provenanceRefs)?raw.provenanceRefs.filter(ref=>packetRefs.has(String(ref))).map(String):[];
  return{factId:`${factPrefix}_${String(index+1).padStart(4,'0')}`,field:fields.has(raw?.field)?raw.field:'OTHER',value,provenanceRefs:refs.length?refs:[...packetRefs].slice(0,1),confidence:Math.max(0,Math.min(1,Number(raw?.confidence)||0)),selected:raw?.selected===true,requiresUserConfirmation:raw?.requiresUserConfirmation!==false};
}

async function selectCaseFacts(packets,claim,options={}){
  if(options.selectFacts)return options.selectFacts(packets,claim);
  const apiKey=process.env.CONTROL_API_KEY,baseUrl=process.env.CONTROL_BASE_URL,model=process.env.CONTROL_MODEL_NAME;
  if(!apiKey||!baseUrl||!model)throw Object.assign(new Error('I10_CONTROL_CONFIGURATION_MISSING'),{code:'I10_CONTROL_CONFIGURATION_MISSING'});
  const evidence=packets.map(packet=>({provenanceRef:`image:${packet.ordinal}:${packet.sourceSha256}`,purposeHint:packet.purposeHint||'',ocrText:packet.ocrText.slice(0,12000),ocrConfidence:packet.confidence}));
  const prompt={role:'user',content:`你是衡准回归案例事实筛选器。主输入类型=${claim.primaryInputType}。从以下已经本机中英文OCR并脱敏的图片证据中只选择与回归案例有关的事实，尤其补齐文本输入内容、前置条件、动作、预期结果和验证要求。不得猜测未知值，不得恢复被脱敏信息。低置信度或歧义事实必须requiresUserConfirmation=true。严格输出JSON {"facts":[{"field":"INPUT_VALUE","value":"...","provenanceRefs":["image:1:hash"],"confidence":0.8,"selected":true,"requiresUserConfirmation":true}]}。证据：${JSON.stringify(evidence)}`};
  const response=await fetch(modelEndpoint(baseUrl),{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,temperature:0,max_tokens:8192,response_format:{type:'json_object'},messages:[prompt]}),signal:AbortSignal.timeout(90_000)}).catch(()=>null);
  if(!response?.ok)throw Object.assign(new Error('I10_CONTROL_IMAGE_FACT_CALL_FAILED'),{code:'I10_CONTROL_IMAGE_FACT_CALL_FAILED'});
  const body=await response.json();const content=body?.choices?.[0]?.message?.content;let parsed;
  try{parsed=JSON.parse(content);}catch{throw Object.assign(new Error('I10_CONTROL_IMAGE_FACT_RESPONSE_INVALID'),{code:'I10_CONTROL_IMAGE_FACT_RESPONSE_INVALID'});}
  const packetRefs=new Set(evidence.map(item=>item.provenanceRef));const factPrefix=`fact_${String(claim.imageIngestId).replace(/[^A-Za-z0-9]/g,'').slice(-12)}`;const facts=(Array.isArray(parsed?.facts)?parsed.facts:[]).map((fact,index)=>normalizeFact(fact,index,packetRefs,factPrefix)).filter(Boolean).slice(0,200);
  return{facts,controllerInvocation:{invocation:'REAL',provider:'openai-compatible',model,inputTokens:Number(body?.usage?.prompt_tokens)||0,outputTokens:Number(body?.usage?.completion_tokens)||0}};
}

async function executeImageIngest(claim,options={}){
  const executionRoot=path.resolve(options.productRoot||productRoot);const runRelative=path.join('.data','image-ingest',claim.imageIngestId);const rawRoot=path.join(executionRoot,runRelative,'raw');const redactedRoot=path.join(executionRoot,runRelative,'redacted');fs.mkdirSync(rawRoot,{recursive:true});fs.mkdirSync(redactedRoot,{recursive:true});
  const packets=[];
  try{
    for(const image of claim.images){const extension=path.extname(image.originalFilename).toLowerCase()==='.webp'?'.png':path.extname(image.originalFilename).toLowerCase();const raw=path.join(rawRoot,`image-${String(image.ordinal).padStart(3,'0')}${extension}`);const redacted=path.join(redactedRoot,`image-${String(image.ordinal).padStart(3,'0')}.png`);fs.copyFileSync(image.filePath,raw);const sourceSha256=sha256(fs.readFileSync(raw));if(sourceSha256!==image.sourceSha256)throw Object.assign(new Error('I10_IMAGE_SOURCE_HASH_MISMATCH'),{code:'I10_IMAGE_SOURCE_HASH_MISMATCH'});const ocr=await (options.ocrImage||ocrFrame)(raw);const normalized={text:redactText(ocr.text||ocr),sensitiveBoxes:Array.isArray(ocr.sensitiveBoxes)?ocr.sensitiveBoxes:[]};redactFrame(raw,redacted,normalized.sensitiveBoxes);const chinese=(normalized.text.match(/[\u3400-\u9fff]/g)||[]).length,latin=(normalized.text.match(/[A-Za-z]/g)||[]).length;const language=chinese&&latin?'zh+en':chinese?'zh':latin?'en':'unknown';packets.push({ordinal:image.ordinal,sourceSha256,purposeHint:image.purposeHint,redactedImagePath:path.join(runRelative,'redacted',path.basename(redacted)).replace(/\\/g,'/'),redactedImageSha256:sha256(fs.readFileSync(redacted)),ocrText:normalized.text,ocrTextHash:sha256(normalized.text),language,confidence:normalized.text?0.8:0.2});}
    const selected=await selectCaseFacts(packets,claim,options);return{workerId:claim.workerId,imageIngestId:claim.imageIngestId,packets:packets.map(({purposeHint,...packet})=>packet),facts:selected.facts,controllerInvocation:selected.controllerInvocation};
  }finally{fs.rmSync(rawRoot,{recursive:true,force:true});}
}

module.exports={executeImageIngest,selectCaseFacts,normalizeFact};
