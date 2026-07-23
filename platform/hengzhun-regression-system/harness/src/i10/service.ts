import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HarnessDatabase } from '../database';
import { HarnessError } from '../errors';
import { canonicalJson, nowIso, opaqueId, sha256 } from '../utils';
import { protectWithCurrentUserDpapi, unprotectWithCurrentUserDpapi } from './dpapi';
import { parseCaseFile } from './case-file-parser';
import { decodeFlowiseAttachmentReference } from './flowise-attachment-ref';
import {
  caseDraftSchema,
  type CaseDraft,
  type CredentialCaptureInput,
  type CredentialSessionCreateInput,
  type IngestDecisionSubmitInput,
  type IngestSubmitInput,
  type IngestWorkerCompletionInput,
  type IngestWorkerFailureInput,
  type NaturalLanguagePrepareInput,
  type ImageIngestSubmitInput,
  type ImageIngestWorkerCompletionInput,
  type VerificationChallengeReportInput,
  type VerificationDecisionSubmitInput
} from './schemas';

interface RequestContext {
  requestId: string;
  credentialFingerprint?: string;
  actorType?: 'COZE' | 'SYSTEM';
}

function safeFileRef(value: string): string {
  if (!/^[A-Za-z0-9._:-]{8,1024}$/.test(value)) throw new HarnessError(400, 'I10_FLOWISE_FILE_REF_INVALID', 'CONTRACT', 'Flowise附件引用无效。');
  return value;
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export class I10Service {
  private readonly credentialRoot: string;
  private readonly flowiseAttachmentRoot: string;
  private readonly flowiseStorageRoot: string;

  constructor(private readonly database: HarnessDatabase, private readonly productRoot: string) {
    this.credentialRoot = path.join(productRoot, '.data', 'credentials');
    this.flowiseAttachmentRoot = path.resolve(process.env.HENGZHUN_FLOWISE_ATTACHMENT_ROOT ?? path.join(productRoot, '.data', 'flowise-attachments'));
    this.flowiseStorageRoot = path.resolve(process.env.HENGZHUN_FLOWISE_STORAGE_ROOT ?? path.join(productRoot, '.data', 'flowise', 'storage'));
  }

  async createCredentialSession(input: CredentialSessionCreateInput, _context: RequestContext): Promise<Record<string, unknown>> {
    const captureToken = crypto.randomBytes(32).toString('base64url');
    const captureTokenHash = sha256(captureToken);
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const session = await this.database.write(db => {
      db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,now,now);
      const previous = db.prepare(`SELECT session_id, status, credential_ref, version, expires_at FROM i10_credential_sessions WHERE namespace=? AND idempotency_key=?`)
        .get(input.namespace, input.idempotencyKey) as { session_id: string; status: string; credential_ref: string | null; version: number; expires_at: string } | undefined;
      if (previous) {
        if (previous.status === 'AWAITING_INPUT') {
          db.prepare(`UPDATE i10_credential_sessions SET capture_token_hash=?, expires_at=?, version=version+1, updated_at=? WHERE session_id=?`)
            .run(captureTokenHash, expiresAt, now, previous.session_id);
        }
        return { sessionId: previous.session_id, status: previous.status, credentialRef: previous.credential_ref,
          version: previous.version + (previous.status === 'AWAITING_INPUT' ? 1 : 0),
          expiresAt: previous.status === 'AWAITING_INPUT' ? expiresAt : previous.expires_at };
      }
      const sessionId = opaqueId('credsession');
      db.prepare(`INSERT INTO i10_credential_sessions(session_id,namespace,idempotency_key,label,capture_token_hash,status,version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'AWAITING_INPUT',1,?,?,?)`)
        .run(sessionId, input.namespace, input.idempotencyKey, input.label, captureTokenHash, expiresAt, now, now);
      return { sessionId, status: 'AWAITING_INPUT', credentialRef: null, version: 1, expiresAt };
    });
    const baseUrl = process.env.HENGZHUN_PUBLIC_BASE_URL ?? 'http://127.0.0.1:18788';
    return {
      ...session,
      ...(session.status === 'AWAITING_INPUT' ? { captureUrl: `${baseUrl}/v1/i10/credentials/${session.sessionId}/form#token=${captureToken}` } : {}),
      plaintextNeverEntersFlowise: true
    };
  }

  async getCredentialSession(namespace: string, sessionId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const now = nowIso();
      db.prepare(`UPDATE i10_credential_sessions SET status='EXPIRED',version=version+1,updated_at=? WHERE namespace=? AND session_id=? AND status='AWAITING_INPUT' AND expires_at<=?`)
        .run(now, namespace, sessionId, now);
      const row = db.prepare(`SELECT session_id,status,credential_ref,version,expires_at,created_at,updated_at FROM i10_credential_sessions WHERE namespace=? AND session_id=?`)
        .get(namespace, sessionId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I10_CREDENTIAL_SESSION_NOT_FOUND', 'DOMAIN', '凭据录入会话不存在。');
      return { sessionId: row.session_id, status: row.status, credentialRef: row.credential_ref, version: row.version,
        expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
    });
  }

  credentialCaptureForm(sessionId: string): string {
    const status = this.database.read(db => db.prepare(`SELECT status,expires_at FROM i10_credential_sessions WHERE session_id=?`).get(sessionId) as {status: string; expires_at: string} | undefined);
    if (!status) throw new HarnessError(404, 'I10_CREDENTIAL_SESSION_NOT_FOUND', 'DOMAIN', '凭据录入会话不存在。');
    if (status.status !== 'AWAITING_INPUT' || Date.parse(status.expires_at) <= Date.now()) throw new HarnessError(409, 'I10_CREDENTIAL_SESSION_NOT_WRITABLE', 'DOMAIN', '凭据录入会话已失效。');
    const escapedSession = JSON.stringify(sessionId);
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>衡准安全凭据录入</title><style>body{font-family:system-ui;background:#f5f6f8;margin:0}.card{max-width:420px;margin:10vh auto;background:white;padding:28px;border-radius:12px;box-shadow:0 10px 35px #0002}label{display:block;margin:14px 0 6px}input,button{box-sizing:border-box;width:100%;padding:12px}button{margin-top:20px;background:#b40000;color:#fff;border:0;border-radius:6px;font-weight:700}.hint{color:#666;font-size:13px}.ok{color:#067a37}</style></head><body><main class="card"><h1>本机安全凭据录入</h1><p class="hint">账号密码只在本机通过 Windows DPAPI 加密，不进入 Flowise、模型上下文、日志或脚本。</p><form id="f"><label>用户名</label><input id="u" autocomplete="username" required maxlength="256"><label>密码</label><input id="p" type="password" autocomplete="current-password" required maxlength="1024"><button>加密保存</button></form><p id="m"></p></main><script>const sid=${escapedSession};const token=new URLSearchParams(location.hash.slice(1)).get('token');history.replaceState(null,'',location.pathname);document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const m=document.getElementById('m');m.textContent='保存中…';const r=await fetch('/v1/i10/credentials/'+encodeURIComponent(sid)+':store',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({captureToken:token,username:document.getElementById('u').value,password:document.getElementById('p').value})});const j=await r.json();document.getElementById('u').value='';document.getElementById('p').value='';m.className=r.ok?'ok':'';m.textContent=r.ok?'已安全保存，可关闭此页面。':'保存失败：'+(j.errorCode||'UNKNOWN');});</script></body></html>`;
  }

  async captureCredential(sessionId: string, input: CredentialCaptureInput): Promise<Record<string, unknown>> {
    const row = this.database.read(db => db.prepare(`SELECT namespace,status,capture_token_hash,expires_at FROM i10_credential_sessions WHERE session_id=?`).get(sessionId) as any);
    if (!row) throw new HarnessError(404, 'I10_CREDENTIAL_SESSION_NOT_FOUND', 'DOMAIN', '凭据录入会话不存在。');
    if (row.status !== 'AWAITING_INPUT' || Date.parse(row.expires_at) <= Date.now()) throw new HarnessError(409, 'I10_CREDENTIAL_SESSION_NOT_WRITABLE', 'DOMAIN', '凭据录入会话已失效。');
    const provided = Buffer.from(sha256(input.captureToken));
    const expected = Buffer.from(String(row.capture_token_hash));
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) throw new HarnessError(403, 'I10_CREDENTIAL_CAPTURE_TOKEN_REJECTED', 'AUTHORIZATION', '凭据录入令牌无效。');
    const plaintext = Buffer.from(canonicalJson({ username: input.username, password: input.password }), 'utf8');
    let encrypted: Buffer;
    try { encrypted = protectWithCurrentUserDpapi(plaintext); } finally { plaintext.fill(0); }
    const credentialRef = opaqueId('credential');
    fs.mkdirSync(this.credentialRoot, { recursive: true });
    const target = path.join(this.credentialRoot, `${credentialRef}.bin`);
    fs.writeFileSync(target, encrypted, { flag: 'wx', mode: 0o600 });
    const hash = sha256(encrypted);
    const now = nowIso();
    await this.database.write(db => {
      db.prepare(`INSERT INTO i10_credential_refs(credential_ref,namespace,session_id,encrypted_blob_path,encrypted_blob_sha256,protection_scope,created_at) VALUES (?,?,?,?,?,'WINDOWS_DPAPI_CURRENT_USER',?)`)
        .run(credentialRef, row.namespace, sessionId, `.data/credentials/${credentialRef}.bin`, hash, now);
      db.prepare(`UPDATE i10_credential_sessions SET status='READY',credential_ref=?,capture_token_hash=?,version=version+1,updated_at=? WHERE session_id=? AND status='AWAITING_INPUT'`)
        .run(credentialRef, sha256(crypto.randomBytes(32)), now, sessionId);
    });
    encrypted.fill(0);
    return { sessionId, status: 'READY', credentialRef };
  }

  resolveCredentialForWorker(namespace: string, credentialRef: string): { username: string; password: string } {
    const row = this.database.read(db => db.prepare(`SELECT encrypted_blob_path,encrypted_blob_sha256 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`)
      .get(namespace, credentialRef) as { encrypted_blob_path: string; encrypted_blob_sha256: string } | undefined);
    if (!row) throw new HarnessError(404, 'I10_CREDENTIAL_REF_NOT_FOUND', 'DOMAIN', '凭据引用不存在。');
    const resolved = path.resolve(this.productRoot, ...row.encrypted_blob_path.split('/'));
    if (!resolved.startsWith(`${this.credentialRoot}${path.sep}`) || !fs.existsSync(resolved)) throw new HarnessError(409, 'I10_CREDENTIAL_BLOB_MISSING', 'ENVIRONMENT', '加密凭据文件缺失。', false, true);
    const encrypted = fs.readFileSync(resolved);
    if (sha256(encrypted) !== row.encrypted_blob_sha256) throw new HarnessError(409, 'I10_CREDENTIAL_BLOB_HASH_MISMATCH', 'EVIDENCE', '加密凭据文件校验失败。', false, true);
    const plaintext = unprotectWithCurrentUserDpapi(encrypted);
    encrypted.fill(0);
    try {
      const value = JSON.parse(plaintext.toString('utf8')) as {username?: unknown; password?: unknown};
      if (typeof value.username !== 'string' || typeof value.password !== 'string') throw new Error('invalid');
      void this.database.write(db => db.prepare(`UPDATE i10_credential_refs SET last_used_at=? WHERE credential_ref=?`).run(nowIso(), credentialRef));
      return { username: value.username, password: value.password };
    } catch {
      throw new HarnessError(409, 'I10_CREDENTIAL_PAYLOAD_INVALID', 'EVIDENCE', '加密凭据内容无效。', false, true);
    } finally { plaintext.fill(0); }
  }

  private resolveAttachment(flowiseFileRef: string, originalFilename: string): string {
    safeFileRef(flowiseFileRef);
    const safeName = path.basename(originalFilename);
    if (safeName !== originalFilename || /[\u0000-\u001f]/.test(safeName)) throw new HarnessError(400, 'I10_ATTACHMENT_FILENAME_INVALID', 'CONTRACT', '附件文件名无效。');
    const platformReference = decodeFlowiseAttachmentReference(flowiseFileRef);
    const root = platformReference ? this.flowiseStorageRoot : this.flowiseAttachmentRoot;
    if (platformReference && platformReference.filename !== safeName) throw new HarnessError(409, 'I10_FLOWISE_ATTACHMENT_NAME_MISMATCH', 'CONTRACT', 'Flowise附件引用与文件名不一致。');
    const resolved = platformReference
      ? path.resolve(root, platformReference.orgId, platformReference.chatflowId, platformReference.chatId, platformReference.filename)
      : path.resolve(root, flowiseFileRef, safeName);
    if (!isPathWithin(root, resolved) || !fs.existsSync(resolved)) throw new HarnessError(404, 'I10_FLOWISE_ATTACHMENT_NOT_FOUND', 'DOMAIN', '受控Flowise附件不存在。');
    const rootRealPath = fs.realpathSync.native(root);
    const resolvedRealPath = fs.realpathSync.native(resolved);
    if (!isPathWithin(rootRealPath, resolvedRealPath)) throw new HarnessError(400, 'I10_FLOWISE_ATTACHMENT_ESCAPE_REJECTED', 'AUTHORIZATION', '附件解析后越过受控Flowise存储根目录。');
    return resolvedRealPath;
  }

  private replayIdempotency(namespace: string, operation: string, idempotencyKey: string, input: unknown): Record<string, unknown> | undefined {
    const stored = this.database.read(db => db.prepare(`SELECT request_hash,response_json FROM idempotency_keys WHERE namespace=? AND operation=? AND idempotency_key=?`)
      .get(namespace, operation, idempotencyKey) as {request_hash: string; response_json: string} | undefined);
    if (!stored) return undefined;
    if (stored.request_hash !== sha256(canonicalJson(input))) throw new HarnessError(409, 'IDEMPOTENCY_CONFLICT', 'CONTRACT', '幂等键已被不同请求使用。');
    return JSON.parse(stored.response_json) as Record<string, unknown>;
  }

  private async rememberIdempotency(namespace: string, operation: string, idempotencyKey: string, input: unknown,
    response: Record<string, unknown>, objectType: string, objectId: string): Promise<Record<string, unknown>> {
    await this.database.write(db => db.prepare(`INSERT OR IGNORE INTO idempotency_keys(namespace,operation,idempotency_key,request_hash,response_status,response_json,object_type,object_id,created_at) VALUES (?,?,?,?,200,?,?,?,?)`)
      .run(namespace,operation,idempotencyKey,sha256(canonicalJson(input)),canonicalJson(response),objectType,objectId,nowIso()));
    return response;
  }

  private enrichDraftWithImageFacts(namespace: string, imageIngestId: string | undefined, draft: CaseDraft): CaseDraft {
    if (!imageIngestId) return draft;
    const snapshot = this.database.read(db => {
      const job=db.prepare(`SELECT status FROM i10_image_ingest_jobs WHERE namespace=? AND image_ingest_id=?`).get(namespace,imageIngestId) as {status:string}|undefined;
      if(!job)throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');
      if(job.status!=='WAITING_USER'&&job.status!=='CONFIRMED')throw new HarnessError(409,'I10_IMAGE_FACTS_NOT_READY','DOMAIN','补充图片事实尚未完成分析。',false,true);
      return db.prepare(`SELECT fact_id,field_name,value_redacted,provenance_json,confidence,selected,requires_user_confirmation FROM i10_case_fact_candidates WHERE image_ingest_id=? AND selected=1 ORDER BY created_at,fact_id`).all(imageIngestId) as any[];
    });
    const facts=snapshot.map(fact=>({factId:String(fact.fact_id),field:fact.field_name,value:String(fact.value_redacted),provenanceRefs:JSON.parse(String(fact.provenance_json)),confidence:Number(fact.confidence),selected:true,requiresUserConfirmation:Boolean(fact.requires_user_confirmation)}));
    const inputFacts=facts.filter(fact=>fact.field==='INPUT_VALUE');let inputIndex=0;
    const verificationRequirements=facts.filter(fact=>fact.field==='VERIFICATION_REQUIREMENT').map(fact=>{const value=fact.value;const verificationType=/U盾|UKey|安全钥匙/i.test(value)?'UKEY':/短信|SMS/i.test(value)?'SMS_OTP':/动态口令|TOTP/i.test(value)?'TOTP':/图形|滑块|captcha/i.test(value)?'CAPTCHA':/扫码|二维码|QR/i.test(value)?'QR_CODE':/移动证书|手机盾/i.test(value)?'MOBILE_CERTIFICATE':/指纹|人脸|生物/i.test(value)?'BIOMETRIC':'MANUAL_APPROVAL';return{verificationType,timing:'DURING_ACTION' as const,userPreparation:value,unattendedPolicy:'HUMAN_IN_LOOP_REQUIRED' as const,secretHandling:'USER_ENTERS_DIRECTLY_NEVER_PERSIST' as const};});
    const actionStepsV2=draft.steps.map((step,index)=>{const isInput=/输入|填写|键入/.test(step.action);const credential=/账号|用户名|密码|手机号/.test(step.action);const fact=isInput&&!credential?inputFacts[inputIndex++]:undefined;return{ordinal:index+1,actionType:isInput?'INPUT' as const:/验证|核对|断言/.test(step.action)?'ASSERT' as const:'CLICK' as const,instruction:step.action,targetDescription:step.action,...(fact?{inputValue:fact.value,inputValueSource:'IMAGE_EVIDENCE' as const,provenanceRefs:fact.provenanceRefs}:{...(isInput?{inputValueSource:credential?'CREDENTIAL_REF' as const:'RUNTIME_USER_INPUT' as const}:{}),provenanceRefs:[]}),confidence:fact?.confidence??draft.confidence,expected:step.expected};});
    return caseDraftSchema.parse({...draft,supportingImageIngestId:imageIngestId,caseFacts:facts,actionStepsV2,verificationRequirements:[...draft.verificationRequirements,...verificationRequirements]});
  }

  async submitIngest(input: IngestSubmitInput, _context: RequestContext): Promise<Record<string, unknown>> {
    const namespaceTime = nowIso();
    await this.database.write(db => db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,namespaceTime,namespaceTime));
    const replayed = this.replayIdempotency(input.namespace, 'i10_ingest_submit', input.idempotencyKey, input);
    if (replayed) return replayed;
    const previous = this.database.read(db => db.prepare(`SELECT ingest_job_id FROM i10_ingest_jobs WHERE namespace=? AND idempotency_key=?`).get(input.namespace, input.idempotencyKey) as {ingest_job_id: string} | undefined);
    if (previous) {
      const response = this.getIngest(input.namespace, previous.ingest_job_id);
      return this.rememberIdempotency(input.namespace, 'i10_ingest_submit', input.idempotencyKey, input, response, 'I10_INGEST_JOB', previous.ingest_job_id);
    }
    if (input.credentialRef) {
      const exists = this.database.read(db => Boolean(db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`).get(input.namespace, input.credentialRef)));
      if (!exists) throw new HarnessError(404, 'I10_CREDENTIAL_REF_NOT_FOUND', 'DOMAIN', '凭据引用不存在。');
    }
    if(input.supportingImageIngestId){const imageJob=this.database.read(db=>db.prepare(`SELECT status FROM i10_image_ingest_jobs WHERE namespace=? AND image_ingest_id=?`).get(input.namespace,input.supportingImageIngestId) as {status:string}|undefined);if(!imageJob)throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');if(imageJob.status!=='WAITING_USER'&&imageJob.status!=='CONFIRMED')throw new HarnessError(409,'I10_IMAGE_FACTS_NOT_READY','DOMAIN','补充图片事实尚未完成分析。',false,true);}
    const attachmentPath = this.resolveAttachment(input.flowiseFileRef, input.originalFilename);
    const stat = fs.statSync(attachmentPath);
    const maximum = input.inputType === 'CASE_FILE' ? 20 * 1024 * 1024 : 500 * 1024 * 1024;
    if (!stat.isFile() || stat.size <= 0 || stat.size > maximum) throw new HarnessError(413, 'I10_ATTACHMENT_SIZE_INVALID', 'CONTRACT', '附件大小超出限制。');
    const sourceHash = sha256(fs.readFileSync(attachmentPath));
    const ingestJobId = opaqueId('ingest');
    const now = nowIso();
    if (input.inputType === 'CASE_FILE') {
      let parsed;
      try { parsed = await parseCaseFile(attachmentPath, input); }
      catch (error) { throw new HarnessError(400, error instanceof Error ? error.message : 'I10_CASE_FILE_PARSE_FAILED', 'CONTRACT', '案例文件无法安全解析。', false, true); }
      parsed={...parsed,drafts:parsed.drafts.map((draft:CaseDraft)=>this.enrichDraftWithImageFacts(input.namespace,input.supportingImageIngestId,draft)),items:parsed.items.map((item:{ordinal:number;draft:CaseDraft})=>({...item,draft:this.enrichDraftWithImageFacts(input.namespace,input.supportingImageIngestId,item.draft)}))};
      await this.database.write(db => {
        const allMissing = [...new Set(parsed.drafts.flatMap(item => item.missingFields))];
        const confidence = parsed.drafts.reduce((sum, item) => sum + item.confidence, 0) / parsed.drafts.length;
        db.prepare(`INSERT INTO i10_ingest_jobs(ingest_job_id,namespace,idempotency_key,input_type,flowise_file_ref,original_filename,source_sha256,source_size_bytes,credential_ref,hints_json,status,confidence,missing_fields_json,draft_count,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'WAITING_USER',?,?,?,1,?,?)`)
          .run(ingestJobId,input.namespace,input.idempotencyKey,input.inputType,input.flowiseFileRef,input.originalFilename,sourceHash,stat.size,input.credentialRef??null,canonicalJson({targetSystemHint:input.targetSystemHint,entryUrlHint:input.entryUrlHint,supportingImageIngestId:input.supportingImageIngestId}),confidence,canonicalJson(allMissing),parsed.items.length,now,now);
        const insert = db.prepare(`INSERT INTO i10_ingest_items(ingest_item_id,ingest_job_id,ordinal,draft_json,draft_hash,confidence,missing_fields_json,created_at) VALUES (?,?,?,?,?,?,?,?)`);
        parsed.items.forEach(({ ordinal, draft }) => { const json=canonicalJson(draft); insert.run(opaqueId('ingestitem'),ingestJobId,ordinal,json,sha256(json),draft.confidence,canonicalJson(draft.missingFields),now); });
        const mappingInsert = db.prepare(`INSERT INTO i10_ingest_field_mappings(ingest_job_id,source_field,canonical_field,match_type,created_at) VALUES (?,?,?,?,?)`);
        parsed.fieldMappings.forEach(mapping => mappingInsert.run(ingestJobId,mapping.sourceField,mapping.canonicalField,mapping.matchType,now));
        const errorInsert = db.prepare(`INSERT INTO i10_ingest_errors(error_id,ingest_job_id,ordinal,error_code,field_name,record_hash,created_at) VALUES (?,?,?,?,?,?,?)`);
        parsed.errors.forEach(error => errorInsert.run(opaqueId('ingesterror'),ingestJobId,error.ordinal,error.errorCode,error.fieldName??null,error.recordHash,now));
      });
    } else {
      if (path.extname(input.originalFilename).toLowerCase() !== '.mp4') throw new HarnessError(400, 'I10_VIDEO_FORMAT_UNSUPPORTED', 'CONTRACT', '视频首版只接受MP4/H.264。');
      await this.database.write(db => db.prepare(`INSERT INTO i10_ingest_jobs(ingest_job_id,namespace,idempotency_key,input_type,flowise_file_ref,original_filename,source_sha256,source_size_bytes,credential_ref,hints_json,status,missing_fields_json,draft_count,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'PROCESSING','[]',0,1,?,?)`)
        .run(ingestJobId,input.namespace,input.idempotencyKey,input.inputType,input.flowiseFileRef,input.originalFilename,sourceHash,stat.size,input.credentialRef??null,canonicalJson({targetSystemHint:input.targetSystemHint,entryUrlHint:input.entryUrlHint,supportingImageIngestId:input.supportingImageIngestId}),now,now));
    }
    const response = this.getIngest(input.namespace, ingestJobId);
    return this.rememberIdempotency(input.namespace, 'i10_ingest_submit', input.idempotencyKey, input, response, 'I10_INGEST_JOB', ingestJobId);
  }

  async prepareNaturalLanguage(input: NaturalLanguagePrepareInput, _context: RequestContext): Promise<Record<string, unknown>> {
    const previous = this.database.read(db => db.prepare(`SELECT request_hash,response_json FROM idempotency_keys WHERE namespace=? AND operation='i10_case_prepare' AND idempotency_key=?`)
      .get(input.namespace, input.idempotencyKey) as {request_hash: string; response_json: string} | undefined);
    if (previous) {
      if (previous.request_hash !== sha256(canonicalJson(input))) throw new HarnessError(409, 'IDEMPOTENCY_CONFLICT', 'CONTRACT', '幂等键已被不同请求使用。');
      return JSON.parse(previous.response_json) as Record<string, unknown>;
    }
    const confirmed = caseDraftSchema.parse({ ...this.enrichDraftWithImageFacts(input.namespace,input.draft.supportingImageIngestId,input.draft), confirmationStatus: 'CONFIRMED' });
    if (confirmed.source.inputType !== 'NATURAL_LANGUAGE') throw new HarnessError(400, 'I10_NATURAL_LANGUAGE_SOURCE_REQUIRED', 'CONTRACT', '自然语言准备接口只接受自然语言来源草案。');
    if (!confirmed.credentialRef) throw new HarnessError(409, 'I10_CREDENTIAL_REF_REQUIRED', 'DOMAIN', '完整案例必须引用本机安全凭据。', false, true);
    const credentialExists = this.database.read(db => Boolean(db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`).get(input.namespace, confirmed.credentialRef)));
    if (!credentialExists) throw new HarnessError(404, 'I10_CREDENTIAL_REF_NOT_FOUND', 'DOMAIN', '凭据引用不存在。');
    const now = nowIso();
    return this.database.write(db => {
      db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,now,now);
      const caseId = opaqueId('case');
      const preparationId = opaqueId('prep');
      const definition = { ...confirmed, sourceDescriptionHash: sha256(input.caseDescription) };
      const definitionJson = canonicalJson(definition);
      const acceptanceSummary = {
        schemaVersion: 'hengzhun-i10-acceptance-summary-v1',
        caseTitle: confirmed.title,
        objective: confirmed.objective,
        stepCount: confirmed.steps.length,
        assertionCount: confirmed.assertions.length,
        informationComplete: true
      };
      const intentSource = {
        title: confirmed.title,
        targetSystem: confirmed.targetSystem,
        entryUrl: confirmed.entryUrl,
        steps: confirmed.steps,
        assertions: confirmed.assertions
      };
      db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,'VALIDATED',?,?,'LOW',?,?)`)
        .run(caseId,input.namespace,confirmed.title,confirmed.summary,now,now);
      db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,1,?,?,?,?)`)
        .run(caseId,definitionJson,sha256(definitionJson),input.actorRef,now);
      db.prepare(`INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,status,version,created_at,updated_at) VALUES (?,?,?,1,?,?,?,'PREPARED',1,?,?)`)
        .run(preparationId,input.namespace,caseId,sha256(input.caseDescription),canonicalJson(confirmed.source),canonicalJson(acceptanceSummary),now,now);
      const response = { preparationId, version: 1, status: 'PREPARED', caseId, caseVersion: 1, credentialRef: confirmed.credentialRef,
        acceptanceSummary, intentSource, nextAction: 'HUMAN_CONFIRMATION_REQUIRED' };
      db.prepare(`INSERT INTO idempotency_keys(namespace,operation,idempotency_key,request_hash,response_status,response_json,object_type,object_id,created_at) VALUES (?,'i10_case_prepare',?,?,200,?,?,?,?)`)
        .run(input.namespace,input.idempotencyKey,sha256(canonicalJson(input)),canonicalJson(response),'I10_CASE_PREPARATION',preparationId,now);
      return response;
    });
  }

  getIngest(namespace: string, ingestJobId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`SELECT * FROM i10_ingest_jobs WHERE namespace=? AND ingest_job_id=?`).get(namespace, ingestJobId) as any;
      if (!row) throw new HarnessError(404, 'I10_INGEST_JOB_NOT_FOUND', 'DOMAIN', '导入任务不存在。');
      const items = db.prepare(`SELECT item.ingest_item_id,item.ordinal,COALESCE(rev.draft_json,item.draft_json) draft_json,COALESCE(rev.draft_hash,item.draft_hash) draft_hash FROM i10_ingest_items item LEFT JOIN i10_ingest_item_revisions rev ON rev.revision_id=(SELECT revision_id FROM i10_ingest_item_revisions WHERE ingest_item_id=item.ingest_item_id ORDER BY revision_no DESC LIMIT 1) WHERE item.ingest_job_id=? ORDER BY item.ordinal`).all(ingestJobId) as any[];
      const fieldMappings = db.prepare(`SELECT source_field sourceField,canonical_field canonicalField,match_type matchType FROM i10_ingest_field_mappings WHERE ingest_job_id=? ORDER BY source_field`).all(ingestJobId) as any[];
      const errors = db.prepare(`SELECT error.error_id errorId,error.ordinal,error.error_code errorCode,error.field_name fieldName,error.record_hash recordHash,CASE WHEN resolution.error_id IS NULL THEN 0 ELSE 1 END resolved FROM i10_ingest_errors error LEFT JOIN i10_ingest_error_resolutions resolution ON resolution.error_id=error.error_id WHERE error.ingest_job_id=? ORDER BY error.ordinal,error.error_code`).all(ingestJobId) as any[];
      return { ingestJobId, inputType: row.input_type, status: row.status, version: row.version, confidence: row.confidence,
        missingFields: JSON.parse(row.missing_fields_json), draftCount: row.draft_count, errorCode: row.error_code ?? undefined,
        items: items.map(item => ({ ordinal: item.ordinal, draftHash: item.draft_hash, draft: JSON.parse(item.draft_json) })),
        fieldMappings, errors: errors.map(error => ({ ...error, resolved: Boolean(error.resolved) })),
        createdAt: row.created_at, updatedAt: row.updated_at };
    });
  }

  async decideIngest(input: IngestDecisionSubmitInput, _context: RequestContext): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const requestHash = sha256(canonicalJson(input));
      const stored = db.prepare(`SELECT request_hash,response_json FROM idempotency_keys WHERE namespace=? AND operation='i10_ingest_decision' AND idempotency_key=?`)
        .get(input.namespace,input.idempotencyKey) as {request_hash:string;response_json:string}|undefined;
      if (stored) {
        if (stored.request_hash !== requestHash) throw new HarnessError(409,'IDEMPOTENCY_CONFLICT','CONTRACT','幂等键已被不同请求使用。');
        return JSON.parse(stored.response_json) as Record<string, unknown>;
      }
      const finish = (response: Record<string, unknown>) => {
        db.prepare(`INSERT INTO idempotency_keys(namespace,operation,idempotency_key,request_hash,response_status,response_json,object_type,object_id,created_at) VALUES (?,'i10_ingest_decision',?,?,200,?,'I10_INGEST_JOB',?,?)`)
          .run(input.namespace,input.idempotencyKey,requestHash,canonicalJson(response),input.ingestJobId,nowIso());
        return response;
      };
      const job = db.prepare(`SELECT * FROM i10_ingest_jobs WHERE namespace=? AND ingest_job_id=?`).get(input.namespace,input.ingestJobId) as any;
      if (!job) throw new HarnessError(404,'I10_INGEST_JOB_NOT_FOUND','DOMAIN','导入任务不存在。');
      if (job.status !== 'WAITING_USER' || Number(job.version)!==input.expectedVersion) throw new HarnessError(409,'I10_INGEST_VERSION_CONFLICT','CONCURRENCY','导入任务状态或版本已变化。',false,true,{currentStatus:job.status,currentVersion:job.version});
      const now=nowIso();
      if(input.choice==='REJECT'){
        db.prepare(`UPDATE i10_ingest_jobs SET status='REJECTED',version=version+1,completed_at=?,updated_at=? WHERE ingest_job_id=?`).run(now,now,input.ingestJobId);
        return finish({ingestJobId:input.ingestJobId,status:'REJECTED',version:Number(job.version)+1});
      }
      const items=db.prepare(`SELECT ingest_item_id,ordinal,draft_json FROM i10_ingest_items WHERE ingest_job_id=? ORDER BY ordinal`).all(input.ingestJobId) as any[];
      for(const correction of input.corrections){
        let item=items.find(value=>Number(value.ordinal)===correction.ordinal);
        const draft=caseDraftSchema.parse({...correction.draft,confirmationStatus:'WAITING_USER'}); const json=canonicalJson(draft);
        if (!item) {
          const errors = db.prepare(`SELECT error_id FROM i10_ingest_errors WHERE ingest_job_id=? AND ordinal=? AND error_id NOT IN (SELECT error_id FROM i10_ingest_error_resolutions)`).all(input.ingestJobId,correction.ordinal) as Array<{error_id:string}>;
          if(errors.length===0)throw new HarnessError(400,'I10_INGEST_CORRECTION_ORDINAL_INVALID','CONTRACT','修正序号不存在。');
          const ingestItemId=opaqueId('ingestitem');
          db.prepare(`INSERT INTO i10_ingest_items(ingest_item_id,ingest_job_id,ordinal,draft_json,draft_hash,confidence,missing_fields_json,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(ingestItemId,input.ingestJobId,correction.ordinal,json,sha256(json),draft.confidence,canonicalJson(draft.missingFields),now);
          const resolutionInsert=db.prepare(`INSERT INTO i10_ingest_error_resolutions(error_id,ingest_item_id,confirmation_ref,created_at) VALUES (?,?,?,?)`);
          errors.forEach(error=>resolutionInsert.run(error.error_id,ingestItemId,input.confirmationRef,now));
          item={ingest_item_id:ingestItemId,ordinal:correction.ordinal,draft_json:json};
          items.push(item);
        } else {
          const revisionNo=Number((db.prepare(`SELECT COALESCE(MAX(revision_no),0) n FROM i10_ingest_item_revisions WHERE ingest_item_id=?`).get(item.ingest_item_id) as any).n)+1;
          db.prepare(`INSERT INTO i10_ingest_item_revisions(revision_id,ingest_item_id,revision_no,draft_json,draft_hash,reason,confirmation_ref,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(opaqueId('revision'),item.ingest_item_id,revisionNo,json,sha256(json),input.reason,input.confirmationRef,now);
        }
      }
      if(input.choice==='CORRECT'){
        db.prepare(`UPDATE i10_ingest_jobs SET version=version+1,updated_at=? WHERE ingest_job_id=?`).run(now,input.ingestJobId);
        return finish({ingestJobId:input.ingestJobId,status:'WAITING_USER',version:Number(job.version)+1,nextAction:'REVIEW_CORRECTIONS'});
      }
      const unresolvedErrors=Number((db.prepare(`SELECT COUNT(*) count FROM i10_ingest_errors error LEFT JOIN i10_ingest_error_resolutions resolution ON resolution.error_id=error.error_id WHERE error.ingest_job_id=? AND resolution.error_id IS NULL`).get(input.ingestJobId) as any).count);
      if(unresolvedErrors>0)throw new HarnessError(409,'I10_INGEST_BATCH_ERRORS_UNRESOLVED','DOMAIN','仍有批量解析错误未修正，禁止确认。',false,true,{unresolvedErrors});
      const current=items.map(item=>{const rev=db.prepare(`SELECT draft_json FROM i10_ingest_item_revisions WHERE ingest_item_id=? ORDER BY revision_no DESC LIMIT 1`).get(item.ingest_item_id) as any;return {item,draft:caseDraftSchema.parse(JSON.parse(String(rev?.draft_json??item.draft_json)))};});
      const incomplete=current.filter(value=>value.draft.missingFields.length>0||!value.draft.targetSystem||!value.draft.entryUrl||!value.draft.credentialRef);
      if(incomplete.length>0)throw new HarnessError(409,'I10_INGEST_INFORMATION_INCOMPLETE','DOMAIN','仍有案例信息缺口，禁止确认。',false,true,{ordinals:incomplete.map(value=>value.item.ordinal)});
      for (const value of current) {
        const exists = db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`).get(input.namespace,value.draft.credentialRef as string);
        if (!exists) throw new HarnessError(404,'I10_CREDENTIAL_REF_NOT_FOUND','DOMAIN','凭据引用不存在。');
      }
      const created=current.map(({item,draft})=>{
        const caseId=opaqueId('case'); const preparationId=opaqueId('prep'); const confirmed:CaseDraft=caseDraftSchema.parse({...draft,confirmationStatus:'CONFIRMED'}); const definition={...confirmed,ingestJobId:input.ingestJobId}; const json=canonicalJson(definition);
        db.prepare(`INSERT INTO cases(case_id,namespace,current_version,status,title,summary,risk_level,created_at,updated_at) VALUES (?,?,1,'VALIDATED',?,?,'LOW',?,?)`).run(caseId,input.namespace,confirmed.title,confirmed.summary,now,now);
        db.prepare(`INSERT INTO case_versions(case_id,version,definition_json,content_hash,created_by,created_at) VALUES (?,1,?,?,?,?)`).run(caseId,json,sha256(json),'flowise-i10-ingest',now);
        const acceptanceSummary={schemaVersion:'hengzhun-i10-acceptance-summary-v1',caseTitle:confirmed.title,objective:confirmed.objective,stepCount:confirmed.steps.length,assertionCount:confirmed.assertions.length,informationComplete:true};
        db.prepare(`INSERT INTO i8_case_preparations(preparation_id,namespace,case_id,case_version,source_description_hash,knowledge_snapshot_json,acceptance_summary_json,status,version,created_at,updated_at) VALUES (?,?,?,1,?,?,?,'PREPARED',1,?,?)`)
          .run(preparationId,input.namespace,caseId,confirmed.source.sourceHash,canonicalJson(confirmed.source),canonicalJson(acceptanceSummary),now,now);
        db.prepare(`UPDATE i10_ingest_items SET confirmed_case_id=? WHERE ingest_item_id=?`).run(caseId,item.ingest_item_id);
        return {ordinal:item.ordinal,caseId,version:1,preparationId,preparationVersion:1,credentialRef:confirmed.credentialRef};
      });
      db.prepare(`UPDATE i10_ingest_jobs SET status='CONFIRMED',version=version+1,completed_at=?,updated_at=? WHERE ingest_job_id=?`).run(now,now,input.ingestJobId);
      return finish({ingestJobId:input.ingestJobId,status:'CONFIRMED',version:Number(job.version)+1,cases:created});
    });
  }

  async claimVideoIngest(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db=>{
      const row=db.prepare(`SELECT * FROM i10_ingest_jobs WHERE input_type='VIDEO' AND status='PROCESSING' AND lease_owner IS NULL ORDER BY created_at LIMIT 1`).get() as any;
      if(!row)return{status:'EMPTY'}; const expiresAt=new Date(Date.now()+10*60_000).toISOString();
      db.prepare(`UPDATE i10_ingest_jobs SET lease_owner=?,lease_expires_at=?,updated_at=? WHERE ingest_job_id=?`).run(workerId,expiresAt,nowIso(),row.ingest_job_id);
      const filePath=this.resolveAttachment(row.flowise_file_ref,row.original_filename);
      return{status:'CLAIMED',workerId,ingestJobId:row.ingest_job_id,namespace:row.namespace,sourceHash:row.source_sha256,filePath,originalFilename:row.original_filename,credentialRef:row.credential_ref,hints:JSON.parse(row.hints_json),leaseExpiresAt:expiresAt};
    });
  }

  async completeVideoIngest(input: IngestWorkerCompletionInput): Promise<Record<string, unknown>> {
    const frameOrdinals = new Set(input.frames.map(frame => frame.ordinal));
    if (frameOrdinals.size !== input.frames.length || input.frames.some((frame,index) => index > 0 && frame.timestampMs < (input.frames[index - 1]?.timestampMs ?? -1))) {
      throw new HarnessError(409,'I10_VIDEO_TIMELINE_INVALID','DOMAIN','视频关键帧序号必须唯一且时间线单调。',false,true);
    }
    if (input.drafts.some(draft => draft.source.inputType !== 'VIDEO' || draft.source.sourceRef !== input.ingestJobId || draft.source.sourceHash !== input.sourceHash || draft.confirmationStatus !== 'WAITING_USER')) {
      throw new HarnessError(409,'I10_VIDEO_DRAFT_BINDING_INVALID','DOMAIN','视频CaseDraft与导入任务、来源Hash或人工确认状态不一致。',false,true);
    }
    const evidenceRoot = path.resolve(this.productRoot, '.data', 'video-ingest', input.ingestJobId, 'redacted');
    for (const frame of input.frames) {
      const observation = frame.visualObservation as Record<string, unknown>;
      if (observation.invocation !== 'REAL' || observation.provider !== 'mimo' || typeof observation.model !== 'string' || !observation.model ||
        observation.totalContextTokens !== 16000 || observation.reservedOutputTokens !== 4000 || typeof observation.estimatedInputTokens !== 'number' || observation.estimatedInputTokens > 12000 ||
        typeof observation.browserWindowCount !== 'number' || !Number.isInteger(observation.browserWindowCount)) {
        throw new HarnessError(409,'I10_REAL_VISUAL_EVIDENCE_REQUIRED','DOMAIN','视频导入必须绑定满足16K/12K/4K门禁的真实MiMo视觉观察。',false,true);
      }
      const evidencePath = path.resolve(this.productRoot, frame.redactedImagePath);
      if (!isPathWithin(evidenceRoot,evidencePath) || !fs.existsSync(evidencePath) || !fs.statSync(evidencePath).isFile()) {
        throw new HarnessError(409,'I10_VIDEO_REDACTED_EVIDENCE_INVALID','DOMAIN','脱敏关键帧不在本次视频任务的受控证据目录。',false,true);
      }
      const rootRealPath = fs.realpathSync.native(evidenceRoot);
      const evidenceRealPath = fs.realpathSync.native(evidencePath);
      if (!isPathWithin(rootRealPath,evidenceRealPath) || sha256(fs.readFileSync(evidenceRealPath)) !== frame.imageSha256) {
        throw new HarnessError(409,'I10_VIDEO_REDACTED_EVIDENCE_INVALID','DOMAIN','脱敏关键帧路径或Hash校验失败。',false,true);
      }
    }
    return this.database.write(db=>{
      const job=db.prepare(`SELECT * FROM i10_ingest_jobs WHERE ingest_job_id=?`).get(input.ingestJobId) as any;
      if(!job)throw new HarnessError(404,'I10_INGEST_JOB_NOT_FOUND','DOMAIN','视频导入任务不存在。');
      if(job.status!=='PROCESSING'||job.lease_owner!==input.workerId||job.source_sha256!==input.sourceHash)throw new HarnessError(409,'I10_VIDEO_INGEST_BINDING_INVALID','CONCURRENCY','视频处理回传绑定无效。',false,true);
      const now=nowIso(); const frameInsert=db.prepare(`INSERT INTO i10_video_frames(frame_id,ingest_job_id,ordinal,timestamp_ms,image_sha256,redacted_image_path,ocr_text_hash,visual_observation_json,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      input.frames.forEach(frame=>frameInsert.run(opaqueId('frame'),input.ingestJobId,frame.ordinal,frame.timestampMs,frame.imageSha256,frame.redactedImagePath,frame.ocrTextHash,canonicalJson(frame.visualObservation),frame.confidence,now));
      const itemInsert=db.prepare(`INSERT INTO i10_ingest_items(ingest_item_id,ingest_job_id,ordinal,draft_json,draft_hash,confidence,missing_fields_json,created_at) VALUES (?,?,?,?,?,?,?,?)`);
      const hints=JSON.parse(String(job.hints_json));const enrichedDrafts=input.drafts.map(draft=>this.enrichDraftWithImageFacts(String(job.namespace),hints.supportingImageIngestId,draft));
      enrichedDrafts.forEach((draft,index)=>{const json=canonicalJson(draft);itemInsert.run(opaqueId('ingestitem'),input.ingestJobId,index+1,json,sha256(json),draft.confidence,canonicalJson(draft.missingFields),now);});
      const missing=[...new Set(enrichedDrafts.flatMap(draft=>draft.missingFields))];const confidence=enrichedDrafts.reduce((sum,draft)=>sum+draft.confidence,0)/enrichedDrafts.length;
      db.prepare(`UPDATE i10_ingest_jobs SET status='WAITING_USER',confidence=?,missing_fields_json=?,draft_count=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE ingest_job_id=?`).run(confidence,canonicalJson(missing),input.drafts.length,now,input.ingestJobId);
      return{ingestJobId:input.ingestJobId,status:'WAITING_USER',version:Number(job.version)+1,frameCount:input.frames.length,draftCount:input.drafts.length};
    });
  }

  async failVideoIngest(input: IngestWorkerFailureInput): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const job = db.prepare(`SELECT status,lease_owner,source_sha256,version FROM i10_ingest_jobs WHERE ingest_job_id=?`).get(input.ingestJobId) as any;
      if (!job) throw new HarnessError(404, 'I10_INGEST_JOB_NOT_FOUND', 'DOMAIN', '视频导入任务不存在。');
      if (job.status !== 'PROCESSING' || job.lease_owner !== input.workerId || job.source_sha256 !== input.sourceHash) {
        throw new HarnessError(409, 'I10_VIDEO_INGEST_BINDING_INVALID', 'CONCURRENCY', '视频失败回传绑定无效。', false, true);
      }
      const now = nowIso();
      db.prepare(`UPDATE i10_ingest_jobs SET status='FAILED',error_code=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=? WHERE ingest_job_id=?`)
        .run(input.errorCode, now, now, input.ingestJobId);
      return { ingestJobId: input.ingestJobId, status: 'FAILED', version: Number(job.version) + 1, errorCode: input.errorCode, retryable: input.retryable };
    });
  }

  async submitImageIngest(input: ImageIngestSubmitInput, _context: RequestContext): Promise<Record<string, unknown>> {
    const replayed = this.replayIdempotency(input.namespace, 'i10_image_ingest_submit', input.idempotencyKey, input);
    if (replayed) return replayed;
    const resolved = input.images.map((image, index) => {
      const filePath = this.resolveAttachment(image.flowiseFileRef, image.originalFilename);
      const extension = path.extname(image.originalFilename).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new HarnessError(400, 'I10_IMAGE_FORMAT_UNSUPPORTED', 'CONTRACT', '补充图片只支持 PNG、JPEG 和 WebP。');
      const bytes = fs.readFileSync(filePath);
      if (bytes.byteLength <= 0 || bytes.byteLength > 20 * 1024 * 1024) throw new HarnessError(413, 'I10_IMAGE_SIZE_INVALID', 'CONTRACT', '单张补充图片必须小于等于20MiB。');
      const validMagic = (extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
        || (['.jpg','.jpeg'].includes(extension) && bytes[0] === 0xff && bytes[1] === 0xd8)
        || (extension === '.webp' && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP');
      if (!validMagic) throw new HarnessError(400, 'I10_IMAGE_CONTENT_MISMATCH', 'CONTRACT', '补充图片扩展名与实际内容不一致。');
      return { ...image, ordinal: index + 1, filePath, size: bytes.byteLength, sourceSha256: sha256(bytes) };
    });
    const totalSize = resolved.reduce((sum, image) => sum + image.size, 0);
    if (totalSize > 100 * 1024 * 1024) throw new HarnessError(413, 'I10_IMAGE_BATCH_SIZE_INVALID', 'CONTRACT', '补充图片总大小不得超过100MiB。');
    const imageIngestId = opaqueId('imageingest');
    const now = nowIso();
    await this.database.write(db => {
      db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,now,now);
      db.prepare(`INSERT INTO i10_image_ingest_jobs(image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,primary_text_hash,status,image_count,total_size_bytes,version,created_at,updated_at) VALUES (?,?,?,?,?,?,'PROCESSING',?,?,1,?,?)`)
        .run(imageIngestId,input.namespace,input.idempotencyKey,input.sourceRef,input.primaryInputType,input.primaryText ? sha256(input.primaryText) : null,resolved.length,totalSize,now,now);
      const insert = db.prepare(`INSERT INTO i10_supporting_images(image_id,image_ingest_id,ordinal,flowise_file_ref,original_filename,purpose_hint,source_sha256,source_size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const image of resolved) insert.run(opaqueId('image'),imageIngestId,image.ordinal,image.flowiseFileRef,image.originalFilename,image.purposeHint ?? null,image.sourceSha256,image.size,now);
    });
    const response = { imageIngestId, status: 'PROCESSING', version: 1, imageCount: resolved.length, primaryInputType: input.primaryInputType };
    return this.rememberIdempotency(input.namespace,'i10_image_ingest_submit',input.idempotencyKey,input,response,'I10_IMAGE_INGEST',imageIngestId);
  }

  getImageIngest(namespace: string, imageIngestId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`SELECT * FROM i10_image_ingest_jobs WHERE namespace=? AND image_ingest_id=?`).get(namespace,imageIngestId) as any;
      if (!row) throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');
      const facts = db.prepare(`SELECT fact_id factId,field_name field,value_redacted value,provenance_json provenanceRefs,confidence,selected,requires_user_confirmation requiresUserConfirmation FROM i10_case_fact_candidates WHERE image_ingest_id=? ORDER BY created_at,fact_id`).all(imageIngestId) as any[];
      const controller=db.prepare(`SELECT invocation_type invocation,provider,model,input_tokens inputTokens,output_tokens outputTokens FROM i10_image_controller_invocations WHERE image_ingest_id=?`).get(imageIngestId) as any;
      return { imageIngestId,status:row.status,version:row.version,primaryInputType:row.primary_input_type,imageCount:row.image_count,
        facts:facts.map(fact=>({...fact,provenanceRefs:JSON.parse(fact.provenanceRefs),selected:Boolean(fact.selected),requiresUserConfirmation:Boolean(fact.requiresUserConfirmation)})),controllerInvocation:controller??undefined,errorCode:row.error_code ?? undefined };
    });
  }

  async claimImageIngest(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const row = db.prepare(`SELECT * FROM i10_image_ingest_jobs WHERE status='PROCESSING' AND lease_owner IS NULL ORDER BY created_at LIMIT 1`).get() as any;
      if (!row) return { status: 'EMPTY' };
      const expiresAt = new Date(Date.now()+10*60_000).toISOString();
      db.prepare(`UPDATE i10_image_ingest_jobs SET lease_owner=?,lease_expires_at=?,updated_at=? WHERE image_ingest_id=?`).run(workerId,expiresAt,nowIso(),row.image_ingest_id);
      const images = (db.prepare(`SELECT image_id,ordinal,flowise_file_ref,original_filename,purpose_hint,source_sha256 FROM i10_supporting_images WHERE image_ingest_id=? ORDER BY ordinal`).all(row.image_ingest_id) as any[])
        .map(image=>({imageId:image.image_id,ordinal:image.ordinal,filePath:this.resolveAttachment(image.flowise_file_ref,image.original_filename),originalFilename:image.original_filename,purposeHint:image.purpose_hint,sourceSha256:image.source_sha256}));
      return {status:'CLAIMED',workerId,imageIngestId:row.image_ingest_id,namespace:row.namespace,sourceRef:row.source_ref,primaryInputType:row.primary_input_type,images,leaseExpiresAt:expiresAt};
    });
  }

  async completeImageIngest(input: ImageIngestWorkerCompletionInput): Promise<Record<string, unknown>> {
    const evidenceRoot = path.resolve(this.productRoot,'.data','image-ingest',input.imageIngestId,'redacted');
    for (const packet of input.packets) {
      if (sha256(packet.ocrText) !== packet.ocrTextHash) throw new HarnessError(409,'I10_IMAGE_OCR_HASH_MISMATCH','EVIDENCE','图片OCR文本Hash不一致。',false,true);
      const evidencePath=path.resolve(this.productRoot,packet.redactedImagePath);
      if(!isPathWithin(evidenceRoot,evidencePath)||!fs.existsSync(evidencePath)||sha256(fs.readFileSync(evidencePath))!==packet.redactedImageSha256) throw new HarnessError(409,'I10_IMAGE_EVIDENCE_INVALID','EVIDENCE','图片脱敏证据路径或Hash无效。',false,true);
    }
    return this.database.write(db => {
      const job=db.prepare(`SELECT * FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(input.imageIngestId) as any;
      if(!job)throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');
      if(job.status!=='PROCESSING'||job.lease_owner!==input.workerId)throw new HarnessError(409,'I10_IMAGE_INGEST_BINDING_INVALID','CONCURRENCY','补充图片回传绑定无效。',false,true);
      const images=db.prepare(`SELECT image_id,ordinal,source_sha256 FROM i10_supporting_images WHERE image_ingest_id=?`).all(input.imageIngestId) as any[];
      const byOrdinal=new Map(images.map(image=>[Number(image.ordinal),image])); const now=nowIso();
      const packetInsert=db.prepare(`INSERT INTO i10_image_evidence_packets(packet_id,image_id,redacted_image_path,redacted_image_sha256,ocr_text_hash,ocr_language,confidence,created_at) VALUES (?,?,?,?,?,?,?,?)`);
      const blockInsert=db.prepare(`INSERT INTO i10_image_ocr_blocks(block_id,packet_id,ordinal,text_redacted,text_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?)`);
      for(const packet of input.packets){const image=byOrdinal.get(packet.ordinal);if(!image||image.source_sha256!==packet.sourceSha256)throw new HarnessError(409,'I10_IMAGE_SOURCE_BINDING_INVALID','EVIDENCE','图片证据与源文件不一致。',false,true);const packetId=opaqueId('packet');packetInsert.run(packetId,image.image_id,packet.redactedImagePath,packet.redactedImageSha256,packet.ocrTextHash,packet.language,packet.confidence,now);if(packet.ocrText)blockInsert.run(opaqueId('ocrblock'),packetId,1,packet.ocrText,packet.ocrTextHash,packet.confidence,now);}
      const factInsert=db.prepare(`INSERT INTO i10_case_fact_candidates(fact_id,image_ingest_id,field_name,value_redacted,value_hash,provenance_json,confidence,selected,requires_user_confirmation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for(const fact of input.facts)factInsert.run(fact.factId,input.imageIngestId,fact.field,fact.value,sha256(fact.value),canonicalJson(fact.provenanceRefs),fact.confidence,fact.selected?1:0,fact.requiresUserConfirmation?1:0,now);
      db.prepare(`INSERT INTO i10_image_controller_invocations(invocation_id,image_ingest_id,invocation_type,provider,model,input_tokens,output_tokens,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(opaqueId('modelinvocation'),input.imageIngestId,input.controllerInvocation.invocation,input.controllerInvocation.provider,input.controllerInvocation.model,input.controllerInvocation.inputTokens,input.controllerInvocation.outputTokens,now);
      db.prepare(`UPDATE i10_image_ingest_jobs SET status='WAITING_USER',lease_owner=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE image_ingest_id=?`).run(now,input.imageIngestId);
      return {imageIngestId:input.imageIngestId,status:'WAITING_USER',version:Number(job.version)+1,packetCount:input.packets.length,factCount:input.facts.length,controllerInvocation:input.controllerInvocation};
    });
  }

  async failImageIngest(workerId: string,imageIngestId: string,errorCode: string,retryable: boolean): Promise<Record<string,unknown>> {
    return this.database.write(db=>{const job=db.prepare(`SELECT status,lease_owner,version FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(imageIngestId) as any;if(!job)throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');if(job.status!=='PROCESSING'||job.lease_owner!==workerId)throw new HarnessError(409,'I10_IMAGE_INGEST_BINDING_INVALID','CONCURRENCY','补充图片失败回传绑定无效。');const now=nowIso();db.prepare(`UPDATE i10_image_ingest_jobs SET status='FAILED',error_code=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=? WHERE image_ingest_id=?`).run(errorCode,now,now,imageIngestId);return{imageIngestId,status:'FAILED',version:Number(job.version)+1,errorCode,retryable};});
  }

  async reportVerificationChallenge(input: VerificationChallengeReportInput): Promise<Record<string,unknown>> {
    const challengeId=opaqueId('verification');const now=nowIso();
    await this.database.write(db=>{db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,now,now);db.prepare(`INSERT INTO i10_verification_challenges(challenge_id,namespace,task_ref,verification_type,action_ordinal,status,detection_summary,user_preparation,version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'WAITING_USER_PREPARATION',?,?,1,?,?,?)`).run(challengeId,input.namespace,input.taskRef,input.verificationType,input.actionOrdinal??null,input.detectionSummary,input.userPreparation,input.expiresAt??null,now,now);db.prepare(`INSERT INTO i10_verification_events(event_id,challenge_id,from_status,to_status,actor_type,created_at) VALUES (?,?,?,'WAITING_USER_PREPARATION','WORKER',?)`).run(opaqueId('verificationevent'),challengeId,'DETECTED',now);});
    return{challengeId,status:'WAITING_USER_PREPARATION',version:1,verificationType:input.verificationType,userPreparation:input.userPreparation,unattendedOutcome:'HUMAN_IN_LOOP_REQUIRED'};
  }

  getVerification(namespace:string,challengeId:string):Record<string,unknown>{return this.database.read(db=>{const row=db.prepare(`SELECT challenge_id,status,verification_type,task_ref,action_ordinal,user_preparation,version,expires_at,created_at,updated_at FROM i10_verification_challenges WHERE namespace=? AND challenge_id=?`).get(namespace,challengeId) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','验证挑战不存在。');return{challengeId:row.challenge_id,status:row.status,verificationType:row.verification_type,taskRef:row.task_ref,actionOrdinal:row.action_ordinal,userPreparation:row.user_preparation,version:row.version,expiresAt:row.expires_at,createdAt:row.created_at,updatedAt:row.updated_at};});}

  async decideVerification(input:VerificationDecisionSubmitInput,_context:RequestContext):Promise<Record<string,unknown>>{
    const replayed=this.replayIdempotency(input.namespace,'i10_verification_decision',input.idempotencyKey,input);if(replayed)return replayed;
    const result=await this.database.write(db=>{const row=db.prepare(`SELECT status,version,expires_at FROM i10_verification_challenges WHERE namespace=? AND challenge_id=?`).get(input.namespace,input.challengeId) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','验证挑战不存在。');if(Number(row.version)!==input.expectedVersion)throw new HarnessError(409,'I10_VERIFICATION_VERSION_CONFLICT','CONCURRENCY','验证挑战版本已变化。');if(row.expires_at&&Date.parse(row.expires_at)<=Date.now())throw new HarnessError(409,'I10_VERIFICATION_EXPIRED','DOMAIN','验证挑战已过期。');const allowed:Record<string,Record<string,string>>={WAITING_USER_PREPARATION:{USER_READY:'WAITING_USER_ACTION',CANCEL:'CANCELLED'},WAITING_USER_ACTION:{USER_ACTION_COMPLETED:'VERIFICATION_CONFIRMED',CANCEL:'CANCELLED'}};const next=allowed[row.status]?.[input.decision];if(!next)throw new HarnessError(409,'I10_VERIFICATION_TRANSITION_INVALID','DOMAIN','验证挑战状态迁移无效。');const now=nowIso();const insertEvent=db.prepare(`INSERT INTO i10_verification_events(event_id,challenge_id,from_status,to_status,actor_type,confirmation_ref,note_hash,created_at) VALUES (?,?,?,?, 'USER',?,?,?)`);if(input.decision==='USER_READY'){insertEvent.run(opaqueId('verificationevent'),input.challengeId,row.status,'USER_READY',input.confirmationRef,input.note?sha256(input.note):null,now);insertEvent.run(opaqueId('verificationevent'),input.challengeId,'USER_READY','CHALLENGE_PRESENTED',input.confirmationRef,null,now);insertEvent.run(opaqueId('verificationevent'),input.challengeId,'CHALLENGE_PRESENTED','WAITING_USER_ACTION',input.confirmationRef,null,now);}else{insertEvent.run(opaqueId('verificationevent'),input.challengeId,row.status,next,input.confirmationRef,input.note?sha256(input.note):null,now);}db.prepare(`UPDATE i10_verification_challenges SET status=?,version=version+1,updated_at=? WHERE challenge_id=?`).run(next,now,input.challengeId);return{challengeId:input.challengeId,status:next,version:Number(row.version)+1,resumeAllowed:next==='VERIFICATION_CONFIRMED'};});
    return this.rememberIdempotency(input.namespace,'i10_verification_decision',input.idempotencyKey,input,result,'I10_VERIFICATION_CHALLENGE',input.challengeId);
  }

  async resumeVerification(namespace:string,challengeId:string,workerId:string):Promise<Record<string,unknown>>{
    return this.database.write(db=>{const row=db.prepare(`SELECT status,version FROM i10_verification_challenges WHERE namespace=? AND challenge_id=?`).get(namespace,challengeId) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','验证挑战不存在。');if(row.status!=='VERIFICATION_CONFIRMED')throw new HarnessError(409,'I10_VERIFICATION_RESUME_NOT_ALLOWED','DOMAIN','验证尚未确认，不能恢复执行。');const now=nowIso();db.prepare(`UPDATE i10_verification_challenges SET status='RESUMED',version=version+1,updated_at=? WHERE challenge_id=?`).run(now,challengeId);db.prepare(`INSERT INTO i10_verification_events(event_id,challenge_id,from_status,to_status,actor_type,confirmation_ref,created_at) VALUES (?,?,'VERIFICATION_CONFIRMED','RESUMED','WORKER',?,?)`).run(opaqueId('verificationevent'),challengeId,workerId,now);return{challengeId,status:'RESUMED',version:Number(row.version)+1,resumeAllowed:true};});
  }
}
