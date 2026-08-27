import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { ArtifactStore } from '../artifact-store';
import { HarnessDatabase } from '../database';
import { HarnessError } from '../errors';
import { canonicalJson, nowIso, opaqueId, sha256 } from '../utils';
import { protectWithCurrentUserDpapi, unprotectWithCurrentUserDpapi } from './dpapi';
import { parseCaseFile } from './case-file-parser';
import { decodeFlowiseAttachmentReference } from './flowise-attachment-ref';
import {
  composeInteractionResponse,
  type InteractionArtifactCard
} from './interaction-response';
import {
  caseDraftSchema,
  semanticAssessmentSchema,
  type CaseDraft,
  type CredentialCaptureInput,
  type CredentialSessionCreateInput,
  type IngestDecisionSubmitInput,
  type IngestSubmitInput,
  type IngestWorkerCompletionInput,
  type IngestWorkerFailureInput,
  type NaturalLanguagePrepareInput,
  type ImageIngestSubmitInput,
  type ImageIngestDecisionSubmitInput,
  type ImageIngestWorkerCompletionInput,
  type VerificationChallengeReportInput,
  type VerificationDecisionSubmitInput,
  type JourneyPrepareInput,
  type JourneyGetInput,
  type JourneyInputSubmitInput,
  type JourneyDecisionSubmitInput,
  type TargetProfilePrepareInput,
  type TargetProfileDecisionSubmitInput,
  type TargetProfileGetInput
} from './schemas';
import { applyCrossSourceConflictGate } from './cross-source-conflicts';
import { FUXING_BANK_DEMO_ADAPTER, resolveTargetAdapterBinding } from '../i8/target-adapter-registry';

interface RequestContext {
  requestId: string;
  credentialFingerprint?: string;
  actorType?: 'COZE' | 'SYSTEM';
}

type JourneyEntryUrlValidation =
  | { status: 'MISSING' }
  | { status: 'INVALID' }
  | { status: 'VALID'; value: string };

function safeFileRef(value: string): string {
  if (!/^[A-Za-z0-9._:-]{8,1024}$/.test(value)) throw new HarnessError(400, 'I10_FLOWISE_FILE_REF_INVALID', 'CONTRACT', 'Flowise附件引用无效。');
  return value;
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function completeCaseDraftContract(
  draft: Record<string, unknown>,
  inputType: 'NATURAL_LANGUAGE' | 'CASE_FILE' | 'VIDEO',
  sourceMaterial: string,
  sourceRef = 'flowise-input'
): Record<string, unknown> {
  return {
    ...draft,
    source: draft.source ?? {
      inputType,
      sourceRef,
      sourceHash: sha256(sourceMaterial || canonicalJson(draft)),
      provenanceSummary: `由Flowise受控${inputType}入口形成，经Harness确定性校验。`
    },
    authoringStrategy: draft.authoringStrategy ?? 'MIDSCENE_VISUAL_AUTHORING_PLAYWRIGHT_VERIFY',
    executionStrategy: draft.executionStrategy ?? 'PLAYWRIGHT_VALIDATED_ONLY',
    evidenceStrategy: draft.evidenceStrategy ?? 'REDACTED_HASHED_EVIDENCE'
  };
}

function explicitAdapterSelectionFromNaturalLanguage(value: unknown): 'fuxing-bank-demo' | undefined {
  if (typeof value !== 'string') return undefined;
  return /(?:明确选择|使用|采用)\s*(?:本机)?(?:复兴银行)?(?:演示)?适配器(?:\s*[（(]?\s*)?fuxing-bank-demo/i.test(value)
    ? 'fuxing-bank-demo'
    : undefined;
}

function draftContractIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  const result = new Set<string>();
  for (const issue of error.issues) {
    const pathValue = issue.path.map(String).join('.');
    if (pathValue === 'entryUrl' || /入口地址/.test(issue.message)) result.add('I10_ENTRY_URL_INVALID');
    else if (pathValue === 'targetSystem') result.add('I10_TARGET_SYSTEM_REQUIRED');
    else if (pathValue === 'steps' || pathValue.startsWith('steps.')) result.add('I10_DRAFT_STEPS_REQUIRED');
    else if (pathValue === 'assertions' || pathValue.startsWith('assertions.')) result.add('I10_ASSERTIONS_REQUIRED');
    else if (pathValue === 'credentialRef') result.add('I10_CREDENTIAL_REF_INVALID');
    else if (pathValue === 'missingFields') result.add('I10_SEMANTIC_INPUT_REQUIRED');
    else result.add(`I10_DRAFT_FIELD_INVALID:${pathValue || 'root'}`);
  }
  return [...result];
}

function bindSemanticAssessment(
  rawValue: unknown,
  draft: CaseDraft,
  accumulatedInput: string,
  inputRevision: number
): Record<string, unknown> {
  const parsed = semanticAssessmentSchema.safeParse(rawValue);
  const fallbackComplete = draft.missingFields.length === 0;
  // Flowise starts every journey with a syntactically valid but empty
  // NEEDS_CLARIFICATION placeholder. A Human Input resume can retain that
  // placeholder after the CaseDraft itself became hard-complete. With no
  // unresolved requirement there is no semantic evidence to keep blocking;
  // preserve explicit requirements, but ignore only this stale bootstrap.
  const staleBootstrap = parsed.success && fallbackComplete &&
    parsed.data.verdict === 'NEEDS_CLARIFICATION' &&
    parsed.data.unresolvedRequirements.length === 0;
  const semantic = parsed.success && !staleBootstrap
    ? parsed.data
    : {
      schemaVersion: 'hengzhun-i10-semantic-assessment-v1' as const,
      verdict: fallbackComplete ? 'COMPLETE' as const : 'NEEDS_CLARIFICATION' as const,
      satisfiedRequirementIds: [] as string[],
      unresolvedRequirements: draft.missingFields.map(field => ({
        requirementId: field,
        question: field
      })),
      confidence: fallbackComplete ? 0.9 : 0.5
    };
  return {
    ...semantic,
    evaluatedDraftHash: sha256(canonicalJson(draft)),
    evaluatedInputHash: sha256(accumulatedInput),
    evaluatedInputRevision: inputRevision
  };
}

function nonWaivableDraftMissing(fields: string[]): string[] {
  return fields.filter(field =>
    field.startsWith('crossSourceConflict:') ||
    field === 'lowConfidenceActions' ||
    field === 'verificationRequirements'
  );
}

function semanticQuestions(assessment: Record<string, unknown>): string[] {
  if (assessment.verdict === 'COMPLETE') return [];
  const unresolved = Array.isArray(assessment.unresolvedRequirements)
    ? assessment.unresolvedRequirements as Array<Record<string, unknown>>
    : [];
  const questions = unresolved
    .map(item => String(item.question || item.requirementId || '').trim())
    .filter(Boolean);
  return questions.length > 0 ? questions : ['I10_SEMANTIC_INPUT_REQUIRED'];
}

type InteractionJourneyRow = {
  journey_id: string;
  namespace: string;
  session_ref: string;
  idempotency_key: string;
  request_intent: string;
  input_type: string;
  stage: string;
  status: string;
  input_envelope_json: string;
  missing_fields_json: string;
  allowed_actions_json: string;
  next_action_json: string;
  references_json: string;
  progress_json: string;
  error_json: string | null;
  version: number;
  recoverable: number;
  created_at: string;
  updated_at: string;
};

type TargetProfileRow = {
  target_profile_id: string;
  namespace: string;
  idempotency_key: string;
  display_name: string;
  launch_url: string;
  launch_origin: string;
  allowed_navigation_origins_json: string;
  allowed_interaction_origins_json: string;
  credential_origins_json: string;
  redirect_rules_json: string;
  credential_ref: string | null;
  tls_policy: 'STRICT' | 'ALLOW_SELF_SIGNED';
  network_mode: 'LOCAL' | 'INTRANET' | 'PUBLIC';
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
  profile_hash: string;
  version: number;
  created_at: string;
  updated_at: string;
  adapter_binding_json: string;
  resolved_addresses_json: string;
};

type ConfirmedAttachmentPreparationRow = {
  preparation_id: string;
  preparation_status: string;
  case_id: string;
  case_version: number;
  case_current_version: number;
  case_status: string;
  definition_json: string;
  ingest_job_id: string;
  ingest_status: string;
  ingest_input_type: 'CASE_FILE' | 'VIDEO';
  ingest_credential_ref: string | null;
};

type ApplicationProfileRow = {
  application_profile_id: string;
  target_profile_id: string;
  display_name: string;
  profile_json: string;
  profile_hash: string;
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
  version: number;
  updated_at: string;
};

export class I10Service {
  private readonly credentialRoot: string;
  private readonly attachmentRoot: string;
  private readonly flowiseAttachmentRoot: string;
  private readonly flowiseStorageRoot: string;

  constructor(
    private readonly database: HarnessDatabase,
    private readonly productRoot: string,
    private readonly artifacts: ArtifactStore
  ) {
    this.credentialRoot = path.join(productRoot, '.data', 'credentials');
    this.attachmentRoot = path.resolve(process.env.HENGZHUN_ATTACHMENT_ROOT ?? path.join(productRoot, '.data', 'attachments'));
    this.flowiseAttachmentRoot = path.resolve(process.env.HENGZHUN_FLOWISE_ATTACHMENT_ROOT ?? path.join(productRoot, '.data', 'flowise-attachments'));
    this.flowiseStorageRoot = path.resolve(process.env.HENGZHUN_FLOWISE_STORAGE_ROOT ?? path.join(productRoot, '.data', 'flowise', 'storage'));
  }

  async importAttachment(input: { originalFilename: string; purpose: string; expectedSha256: string; content: Buffer }): Promise<Record<string, unknown>> {
    const actualSha256 = sha256(input.content);
    if (actualSha256 !== input.expectedSha256) throw new HarnessError(409, 'I10_ATTACHMENT_HASH_MISMATCH', 'EVIDENCE', '附件内容与声明的 SHA-256 不一致。', false, true);
    const attachmentRef = `att_${crypto.randomUUID()}`;
    const staging = path.join(this.attachmentRoot, `.staging-${attachmentRef}`);
    const destination = path.join(this.attachmentRoot, attachmentRef);
    if (!isPathWithin(this.attachmentRoot, staging) || !isPathWithin(this.attachmentRoot, destination)) {
      throw new HarnessError(400, 'I10_ATTACHMENT_ESCAPE_REJECTED', 'AUTHORIZATION', '附件存储路径越界。');
    }
    const receipt = {
      schemaVersion: 'AttachmentReceiptV1', attachmentRef,
      originalFilename: input.originalFilename, purpose: input.purpose,
      sha256: actualSha256, size: input.content.byteLength, createdAt: nowIso()
    };
    fs.mkdirSync(this.attachmentRoot, { recursive: true, mode: 0o700 });
    try {
      fs.mkdirSync(staging, { recursive: false, mode: 0o700 });
      fs.writeFileSync(path.join(staging, 'content'), input.content, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(staging, 'receipt.json'), `${canonicalJson(receipt)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(staging, destination);
      return receipt;
    } catch (error) {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  }

  private normalizeTargetLaunchUrl(value: string): URL {
    const raw = String(value ?? '').trim();
    if (!raw) {
      throw new HarnessError(400, 'I10_ENTRY_URL_REQUIRED', 'CONTRACT', '目标站点入口地址不能为空。');
    }
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error('unsupported');
      }
      return parsed;
    } catch {
      throw new HarnessError(400, 'I10_ENTRY_URL_INVALID', 'CONTRACT', '目标站点入口必须是无内嵌凭据的HTTP或HTTPS URL。');
    }
  }

  private targetNetworkMode(url: URL): 'LOCAL' | 'INTRANET' | 'PUBLIC' {
    const host = url.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(host)) return 'LOCAL';
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local') || host.endsWith('.internal')) {
      return 'INTRANET';
    }
    return 'PUBLIC';
  }

  private normalizedIpAddress(value: string): string {
    const raw = String(value).trim().replace(/^\[|\]$/g, '').split('%', 1)[0]!.toLowerCase();
    const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? mapped[1]! : raw;
  }

  private addressClass(value: string): 'LOOPBACK' | 'PRIVATE' | 'PUBLIC' | 'FORBIDDEN' {
    const address = this.normalizedIpAddress(value);
    const family = net.isIP(address);
    if (family === 4) {
      const parts = address.split('.').map(Number);
      const [a, b] = parts;
      if (a === 127) return 'LOOPBACK';
      if (a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)) return 'PRIVATE';
      if (a === 0 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254)
        || a! >= 224 || (a === 192 && b === 0) || (a === 198 && [18, 19, 51].includes(b!))
        || (a === 203 && b === 0)) return 'FORBIDDEN';
      return 'PUBLIC';
    }
    if (family === 6) {
      if (address === '::1') return 'LOOPBACK';
      if (address === '::' || address.startsWith('fe8') || address.startsWith('fe9')
        || address.startsWith('fea') || address.startsWith('feb') || address.startsWith('ff')
        || address.startsWith('2001:db8:')) return 'FORBIDDEN';
      if (address.startsWith('fc') || address.startsWith('fd')) return 'PRIVATE';
      return 'PUBLIC';
    }
    return 'FORBIDDEN';
  }

  private async approvedTargetAddresses(url: URL, mode: 'LOCAL' | 'INTRANET' | 'PUBLIC'): Promise<string[]> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const literalFamily = net.isIP(hostname);
    const answers = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await dns.lookup(hostname, { all: true, verbatim: true });
    const addresses = [...new Set(answers.map(answer => this.normalizedIpAddress(answer.address)))].sort();
    if (addresses.length === 0) throw new HarnessError(409, 'I10_TARGET_DNS_EMPTY', 'SECURITY', '目标站点未解析到可审核地址。', false, true);
    for (const address of addresses) {
      const classification = this.addressClass(address);
      const allowed = (mode === 'LOCAL' && classification === 'LOOPBACK')
        || (mode === 'INTRANET' && classification === 'PRIVATE')
        || (mode === 'PUBLIC' && classification === 'PUBLIC');
      if (!allowed) {
        throw new HarnessError(409, 'I10_TARGET_ADDRESS_POLICY_REJECTED', 'SECURITY', '目标站点解析地址不符合已确认网络边界。', false, false, {
          networkMode: mode,
          addressClass: classification
        });
      }
    }
    return addresses;
  }

  private async pinnedTargetRequest(url: URL, mode: 'LOCAL' | 'INTRANET' | 'PUBLIC', tlsPolicy: 'STRICT' | 'ALLOW_SELF_SIGNED'):
  Promise<{ statusCode: number; location: string | null; addresses: string[] }> {
    const addresses = await this.approvedTargetAddresses(url, mode);
    const pinnedAddress = addresses[0]!;
    const family = net.isIP(pinnedAddress);
    const requester = (url.protocol === 'https:' ? https.request : http.request) as typeof http.request;
    return await new Promise((resolve, reject) => {
      const request = requester(url, {
        method: 'GET',
        headers: { 'user-agent': 'Hengzhun-Target-Probe/2.0', connection: 'close' },
        lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
          callback(null, pinnedAddress, family);
        }) as never,
        ...(url.protocol === 'https:' ? { servername: url.hostname, rejectUnauthorized: tlsPolicy === 'STRICT' } : {})
      }, response => {
        const observed = this.normalizedIpAddress(response.socket.remoteAddress ?? '');
        if (observed !== pinnedAddress) {
          response.destroy();
          reject(new HarnessError(409, 'I10_TARGET_PEER_ADDRESS_MISMATCH', 'SECURITY', '目标站点连接地址与已审核地址不一致。'));
          return;
        }
        const result = {
          statusCode: response.statusCode ?? 0,
          location: typeof response.headers.location === 'string' ? response.headers.location : null,
          addresses
        };
        response.resume();
        resolve(result);
      });
      request.setTimeout(8_000, () => request.destroy(Object.assign(new Error('TARGET_PROBE_TIMEOUT'), { code: 'TARGET_PROBE_TIMEOUT' })));
      request.once('error', reject);
      request.end();
    });
  }

  private targetProfileEnvelope(row: TargetProfileRow): Record<string, unknown> {
    return {
      schemaVersion: 'hengzhun-target-profile-v1',
      targetProfileId: row.target_profile_id,
      displayName: row.display_name,
      launchUrl: row.launch_url,
      launchOrigin: row.launch_origin,
      allowedNavigationOrigins: JSON.parse(row.allowed_navigation_origins_json),
      allowedInteractionOrigins: JSON.parse(row.allowed_interaction_origins_json),
      credentialOrigins: JSON.parse(row.credential_origins_json),
      redirectRules: JSON.parse(row.redirect_rules_json),
      tlsPolicy: row.tls_policy,
      networkMode: row.network_mode,
      adapterBinding: JSON.parse(row.adapter_binding_json || 'null'),
      resolvedAddresses: JSON.parse(row.resolved_addresses_json || '{}'),
      executionEngine: row.adapter_binding_json && row.adapter_binding_json !== 'null' ? 'TARGET_ADAPTER' : 'GENERIC_DYNAMIC',
      credentialBindingStatus: row.credential_ref ? 'BOUND' : 'NOT_BOUND',
      status: row.status,
      profileHash: row.profile_hash,
      version: row.version,
      updatedAt: row.updated_at
    };
  }

  private applicationProfileEnvelope(row: ApplicationProfileRow): Record<string, unknown> {
    return {
      ...JSON.parse(row.profile_json),
      applicationProfileId: row.application_profile_id,
      targetProfileId: row.target_profile_id,
      profileHash: row.profile_hash,
      status: row.status,
      version: row.version,
      updatedAt: row.updated_at
    };
  }

  private applicationProfileFor(db: import('better-sqlite3').Database, row: TargetProfileRow): Record<string, unknown> | null {
    const profile = db.prepare(`SELECT * FROM i10_application_profiles WHERE namespace=? AND target_profile_id=?`)
      .get(row.namespace, row.target_profile_id) as ApplicationProfileRow | undefined;
    return profile ? this.applicationProfileEnvelope(profile) : null;
  }

  private async probeTargetRedirects(
    launchUrl: URL,
    mode: 'LOCAL' | 'INTRANET' | 'PUBLIC',
    tlsPolicy: 'STRICT' | 'ALLOW_SELF_SIGNED',
    confirmedOrigins: string[]
  ): Promise<{ status: string; origins: string[]; finalUrl: string; resolvedAddresses: Record<string, string[]> }> {
    const origins = new Set<string>([launchUrl.origin]);
    const approvedOrigins = new Set(confirmedOrigins);
    const resolvedAddresses: Record<string, string[]> = {};
    let current = launchUrl;
    try {
      for (let index = 0; index < 8; index += 1) {
        if (!approvedOrigins.has(current.origin)) {
          origins.add(current.origin);
          return { status: 'REDIRECT_CONFIRMATION_REQUIRED', origins: [...origins], finalUrl: current.href, resolvedAddresses };
        }
        const response = await this.pinnedTargetRequest(current, mode, tlsPolicy);
        resolvedAddresses[current.hostname] = response.addresses;
        if (response.statusCode < 300 || response.statusCode >= 400) {
          return { status: 'REACHABLE', origins: [...origins], finalUrl: current.href, resolvedAddresses };
        }
        const location = response.location;
        if (!location) return { status: 'REACHABLE', origins: [...origins], finalUrl: current.href, resolvedAddresses };
        current = new URL(location, current);
        if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) {
          return { status: 'REDIRECT_REJECTED', origins: [...origins], finalUrl: current.href, resolvedAddresses };
        }
        origins.add(current.origin);
      }
      return { status: 'REDIRECT_LIMIT', origins: [...origins], finalUrl: current.href, resolvedAddresses };
    } catch (error) {
      if (error instanceof HarnessError) throw error;
      return { status: 'UNREACHABLE', origins: [...origins], finalUrl: current.href, resolvedAddresses };
    }
  }

  async prepareTargetProfile(input: TargetProfilePrepareInput): Promise<Record<string, unknown>> {
    const previous = this.database.read(db => db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND idempotency_key=?`)
      .get(input.namespace, input.idempotencyKey) as TargetProfileRow | undefined);
    if (previous) {
      return {
        ...this.targetProfileEnvelope(previous),
        applicationProfile: this.database.read(db => this.applicationProfileFor(db, previous)),
        probe: { status: 'NOT_PROBED_BEFORE_CONFIRMATION' },
        nextAction: 'TARGET_PROFILE_CONFIRMATION_REQUIRED'
      };
    }
    const credentialRef = String(input.credentialRef ?? '').trim();
    if (!credentialRef) {
      throw new HarnessError(409, 'I10_CREDENTIAL_REF_REQUIRED', 'CONTRACT', '准备目标站点前必须先完成本机安全凭据录入。');
    }
    if (!/^credential_[0-9a-f-]{36}$/.test(credentialRef)) {
      throw new HarnessError(400, 'I10_CREDENTIAL_REF_INVALID', 'CONTRACT', '凭据引用格式无效。');
    }
    const launch = this.normalizeTargetLaunchUrl(input.launchUrl);
    if (input.adapterBinding && input.adapterSelection) {
      throw new HarnessError(400, 'I10_TARGET_ADAPTER_SELECTION_AMBIGUOUS', 'CONTRACT', '目标适配器只能通过一种受控方式选择。');
    }
    const adapterBinding = input.adapterBinding
      ? resolveTargetAdapterBinding(input.adapterBinding)
      : input.adapterSelection === FUXING_BANK_DEMO_ADAPTER.adapterId
        ? FUXING_BANK_DEMO_ADAPTER
        : undefined;
    if (input.adapterBinding && !adapterBinding) {
      throw new HarnessError(400, 'I10_TARGET_ADAPTER_BINDING_INVALID', 'CONTRACT', '目标适配器绑定未登记、版本不匹配或清单Hash不匹配。');
    }
    const origins = [launch.origin];
    const now = nowIso();
    const profileId = input.targetProfileId ?? opaqueId('targetprofile');
    const profilePayload = {
      schemaVersion: 'hengzhun-target-profile-v1',
      targetProfileId: profileId,
      displayName: input.displayName.trim(),
      launchUrl: launch.href,
      allowedNavigationOrigins: origins,
      allowedInteractionOrigins: origins,
      credentialOrigins: [launch.origin],
      redirectRules: origins.slice(1).map(origin => ({ origin, mode: 'CONFIRMED_REDIRECT' })),
      tlsPolicy: input.tlsPolicy,
      networkMode: this.targetNetworkMode(launch),
      adapterBinding: adapterBinding ?? null,
      resolvedAddresses: {}
    };
    const profileHash = sha256(canonicalJson(profilePayload));
    const row = await this.database.write(db => {
      db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`)
        .run(input.namespace, now, now);
      const idempotent = db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND idempotency_key=?`)
        .get(input.namespace, input.idempotencyKey) as TargetProfileRow | undefined;
      if (idempotent) return idempotent;
      const existing = input.targetProfileId
        ? db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
          .get(input.namespace, input.targetProfileId) as TargetProfileRow | undefined
        : undefined;
      if (input.targetProfileId && !existing) {
        throw new HarnessError(404, 'I10_TARGET_PROFILE_NOT_FOUND', 'CONTRACT', '目标站点档案不存在。');
      }
      if (input.credentialRef) {
        const credential = db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`)
          .get(input.namespace, input.credentialRef);
        if (!credential) throw new HarnessError(409, 'I10_CREDENTIAL_REF_INVALID', 'CONTRACT', '凭据引用不存在或已失效。');
      }
      if (existing) {
        db.prepare(`UPDATE i10_target_profiles SET idempotency_key=?,display_name=?,launch_url=?,launch_origin=?,
          allowed_navigation_origins_json=?,allowed_interaction_origins_json=?,credential_origins_json=?,
          redirect_rules_json=?,credential_ref=?,tls_policy=?,network_mode=?,adapter_binding_json=?,status='PENDING_CONFIRMATION',
          resolved_addresses_json='{}',profile_hash=?,version=version+1,updated_at=? WHERE target_profile_id=?`)
          .run(
            input.idempotencyKey, profilePayload.displayName, profilePayload.launchUrl, launch.origin,
            canonicalJson(origins), canonicalJson(origins), canonicalJson([launch.origin]),
            canonicalJson(profilePayload.redirectRules), input.credentialRef ?? existing.credential_ref,
            input.tlsPolicy, profilePayload.networkMode, canonicalJson(profilePayload.adapterBinding), profileHash, now, existing.target_profile_id
          );
      } else {
        db.prepare(`INSERT INTO i10_target_profiles(
          target_profile_id,namespace,idempotency_key,display_name,launch_url,launch_origin,
          allowed_navigation_origins_json,allowed_interaction_origins_json,credential_origins_json,
          redirect_rules_json,credential_ref,tls_policy,network_mode,adapter_binding_json,resolved_addresses_json,status,profile_hash,version,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING_CONFIRMATION',?,1,?,?)`)
          .run(
            profileId, input.namespace, input.idempotencyKey, profilePayload.displayName, profilePayload.launchUrl,
            launch.origin, canonicalJson(origins), canonicalJson(origins), canonicalJson([launch.origin]),
            canonicalJson(profilePayload.redirectRules), input.credentialRef ?? null, input.tlsPolicy,
            profilePayload.networkMode, canonicalJson(profilePayload.adapterBinding), canonicalJson({}), profileHash, now, now
          );
      }
      const persisted = db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
        .get(input.namespace, profileId) as TargetProfileRow;
      if (input.applicationProfile) {
        const modules = input.applicationProfile.modules.map(module => ({
          moduleId: module.moduleId,
          displayName: module.displayName,
          capabilities: [...new Set(module.capabilities)].sort()
        }));
        const applicationPayload = {
          schemaVersion: 'hengzhun-application-profile-v1',
          displayName: input.applicationProfile.displayName,
          modules
        };
        const applicationProfileId = `appprofile_${sha256(`${persisted.target_profile_id}:${canonicalJson(applicationPayload)}`).slice(0, 40)}`;
        const applicationHash = sha256(canonicalJson(applicationPayload));
        const previous = db.prepare(`SELECT * FROM i10_application_profiles WHERE target_profile_id=?`)
          .get(persisted.target_profile_id) as ApplicationProfileRow | undefined;
        if (previous) {
          db.prepare(`UPDATE i10_application_profiles SET display_name=?,profile_json=?,profile_hash=?,status='PENDING_CONFIRMATION',version=version+1,updated_at=? WHERE application_profile_id=?`)
            .run(applicationPayload.displayName, canonicalJson(applicationPayload), applicationHash, now, previous.application_profile_id);
          db.prepare(`DELETE FROM i10_module_capabilities WHERE application_profile_id=?`).run(previous.application_profile_id);
          db.prepare(`DELETE FROM i10_application_modules WHERE application_profile_id=?`).run(previous.application_profile_id);
          for (const module of modules) {
            db.prepare(`INSERT INTO i10_application_modules(application_profile_id,module_id,display_name) VALUES (?,?,?)`)
              .run(previous.application_profile_id, module.moduleId, module.displayName);
            for (const capability of module.capabilities) db.prepare(`INSERT INTO i10_module_capabilities(application_profile_id,module_id,capability) VALUES (?,?,?)`)
              .run(previous.application_profile_id, module.moduleId, capability);
          }
        } else {
          db.prepare(`INSERT INTO i10_application_profiles(application_profile_id,namespace,target_profile_id,display_name,profile_json,profile_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,'PENDING_CONFIRMATION',1,?,?)`)
            .run(applicationProfileId, input.namespace, persisted.target_profile_id, applicationPayload.displayName, canonicalJson(applicationPayload), applicationHash, now, now);
          for (const module of modules) {
            db.prepare(`INSERT INTO i10_application_modules(application_profile_id,module_id,display_name) VALUES (?,?,?)`)
              .run(applicationProfileId, module.moduleId, module.displayName);
            for (const capability of module.capabilities) db.prepare(`INSERT INTO i10_module_capabilities(application_profile_id,module_id,capability) VALUES (?,?,?)`)
              .run(applicationProfileId, module.moduleId, capability);
          }
        }
      }
      return db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
        .get(input.namespace, profileId) as TargetProfileRow;
    });
    const applicationProfile = this.database.read(db => this.applicationProfileFor(db, row));
    return {
      ...this.targetProfileEnvelope(row),
      applicationProfile,
      probe: { status: 'NOT_PROBED_BEFORE_CONFIRMATION' },
      nextAction: 'TARGET_PROFILE_CONFIRMATION_REQUIRED'
    };
  }

  getTargetProfile(input: TargetProfileGetInput): Record<string, unknown> {
    const row = this.database.read(db => {
      if (input.targetProfileId) {
        return db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
          .get(input.namespace, input.targetProfileId) as TargetProfileRow | undefined;
      }
      const launch = this.normalizeTargetLaunchUrl(input.launchUrl!);
      return db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND launch_origin=? AND status='ACTIVE' ORDER BY updated_at DESC LIMIT 1`)
        .get(input.namespace, launch.origin) as TargetProfileRow | undefined;
    });
    if (!row) throw new HarnessError(404, 'I10_TARGET_PROFILE_NOT_FOUND', 'CONTRACT', '目标站点档案不存在。');
    return { ...this.targetProfileEnvelope(row), applicationProfile: this.database.read(db => this.applicationProfileFor(db, row)) };
  }

  async decideTargetProfile(input: TargetProfileDecisionSubmitInput): Promise<Record<string, unknown>> {
    const now = nowIso();
    const snapshot = this.database.read(db => db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
      .get(input.namespace, input.targetProfileId) as TargetProfileRow | undefined);
    if (!snapshot) throw new HarnessError(404, 'I10_TARGET_PROFILE_NOT_FOUND', 'CONTRACT', '目标站点档案不存在。');
    if (snapshot.version !== input.expectedVersion) {
      throw new HarnessError(409, 'I10_TARGET_PROFILE_VERSION_CONFLICT', 'CONFLICT', '目标站点档案版本已变化。');
    }
    if (snapshot.status !== 'PENDING_CONFIRMATION') {
      throw new HarnessError(409, 'I10_TARGET_PROFILE_DECISION_NOT_ALLOWED', 'CONFLICT', '目标站点档案当前不等待确认。');
    }
    let probe: Awaited<ReturnType<I10Service['probeTargetRedirects']>> | undefined;
    if (input.decision === 'APPROVE') {
      probe = await this.probeTargetRedirects(
        this.normalizeTargetLaunchUrl(snapshot.launch_url), snapshot.network_mode, snapshot.tls_policy,
        JSON.parse(snapshot.allowed_navigation_origins_json) as string[]
      );
      if (probe.status === 'UNREACHABLE' || probe.status === 'REDIRECT_REJECTED' || probe.status === 'REDIRECT_LIMIT') {
        throw new HarnessError(409, `I10_TARGET_${probe.status}`, 'ENVIRONMENT', '目标站点安全探测未通过，档案仍等待确认。', false, true);
      }
      if (probe.status === 'REDIRECT_CONFIRMATION_REQUIRED') {
        const proposedOrigins = [...new Set(probe.origins)].sort();
        const adapterBinding = JSON.parse(snapshot.adapter_binding_json || 'null');
        const proposalPayload = {
          schemaVersion: 'hengzhun-target-profile-v1', targetProfileId: snapshot.target_profile_id,
          displayName: snapshot.display_name, launchUrl: snapshot.launch_url,
          allowedNavigationOrigins: proposedOrigins, allowedInteractionOrigins: proposedOrigins,
          credentialOrigins: JSON.parse(snapshot.credential_origins_json),
          redirectRules: proposedOrigins.slice(1).map(origin => ({ origin, mode: 'CONFIRMED_REDIRECT' })),
          tlsPolicy: snapshot.tls_policy, networkMode: snapshot.network_mode, adapterBinding,
          resolvedAddresses: probe.resolvedAddresses
        };
        const proposed = await this.database.write(db => {
          const updated = db.prepare(`UPDATE i10_target_profiles SET allowed_navigation_origins_json=?,
            allowed_interaction_origins_json=?,redirect_rules_json=?,resolved_addresses_json=?,profile_hash=?,
            version=version+1,updated_at=? WHERE namespace=? AND target_profile_id=? AND status='PENDING_CONFIRMATION' AND version=?`)
            .run(canonicalJson(proposedOrigins), canonicalJson(proposedOrigins), canonicalJson(proposalPayload.redirectRules),
              canonicalJson(probe!.resolvedAddresses), sha256(canonicalJson(proposalPayload)), now,
              input.namespace, input.targetProfileId, input.expectedVersion);
          if (updated.changes !== 1) throw new HarnessError(409, 'I10_TARGET_PROFILE_VERSION_CONFLICT', 'CONFLICT', '目标站点档案版本已变化。');
          return db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
            .get(input.namespace, input.targetProfileId) as TargetProfileRow;
        });
        return {
          ...this.targetProfileEnvelope(proposed),
          applicationProfile: this.database.read(db => this.applicationProfileFor(db, proposed)),
          probe: { status: probe.status, finalUrl: probe.finalUrl, discoveredOrigins: probe.origins },
          nextAction: 'REDIRECT_ORIGIN_CONFIRMATION_REQUIRED'
        };
      }
    }
    const row = await this.database.write(db => {
      const current = db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=?`)
        .get(input.namespace, input.targetProfileId) as TargetProfileRow | undefined;
      if (!current) throw new HarnessError(404, 'I10_TARGET_PROFILE_NOT_FOUND', 'CONTRACT', '目标站点档案不存在。');
      if (current.version !== input.expectedVersion) {
        throw new HarnessError(409, 'I10_TARGET_PROFILE_VERSION_CONFLICT', 'CONFLICT', '目标站点档案版本已变化。');
      }
      if (current.status !== 'PENDING_CONFIRMATION') {
        throw new HarnessError(409, 'I10_TARGET_PROFILE_DECISION_NOT_ALLOWED', 'CONFLICT', '目标站点档案当前不等待确认。');
      }
      const status = input.decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED';
      const resolvedAddresses = probe?.resolvedAddresses ?? JSON.parse(current.resolved_addresses_json || '{}');
      const activePayload = {
        schemaVersion: 'hengzhun-target-profile-v1', targetProfileId: current.target_profile_id,
        displayName: current.display_name, launchUrl: current.launch_url,
        allowedNavigationOrigins: JSON.parse(current.allowed_navigation_origins_json),
        allowedInteractionOrigins: JSON.parse(current.allowed_interaction_origins_json),
        credentialOrigins: JSON.parse(current.credential_origins_json), redirectRules: JSON.parse(current.redirect_rules_json),
        tlsPolicy: current.tls_policy, networkMode: current.network_mode,
        adapterBinding: JSON.parse(current.adapter_binding_json || 'null'), resolvedAddresses
      };
      const updated = db.prepare(`UPDATE i10_target_profiles SET status=?,resolved_addresses_json=?,profile_hash=?,
        version=version+1,updated_at=? WHERE target_profile_id=? AND status='PENDING_CONFIRMATION' AND version=?`)
        .run(status, canonicalJson(resolvedAddresses), sha256(canonicalJson(activePayload)), now,
          current.target_profile_id, input.expectedVersion);
      if (updated.changes !== 1) throw new HarnessError(409, 'I10_TARGET_PROFILE_VERSION_CONFLICT', 'CONFLICT', '目标站点档案版本已变化。');
      db.prepare(`UPDATE i10_application_profiles SET status=?,version=version+1,updated_at=? WHERE namespace=? AND target_profile_id=? AND status='PENDING_CONFIRMATION'`)
        .run(status, now, input.namespace, current.target_profile_id);
      if (status === 'ACTIVE' && current.credential_ref) {
        db.prepare(`UPDATE i10_credential_refs SET target_profile_id=? WHERE namespace=? AND credential_ref=?`)
          .run(current.target_profile_id, input.namespace, current.credential_ref);
      }
      return db.prepare(`SELECT * FROM i10_target_profiles WHERE target_profile_id=?`)
        .get(current.target_profile_id) as TargetProfileRow;
    });
    const applicationProfile = this.database.read(db => this.applicationProfileFor(db, row));
    return {
      ...this.targetProfileEnvelope(row),
      applicationProfile,
      confirmationRef: input.confirmationRef,
      ...(probe ? { probe: { status: probe.status, finalUrl: probe.finalUrl, discoveredOrigins: probe.origins } } : {}),
      nextAction: row.status === 'ACTIVE' ? 'CASE_AUTHORING_AVAILABLE' : 'TARGET_PROFILE_REJECTED'
    };
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
    return await this.database.write(db => {
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
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>衡准安全凭据录入</title><style>body{font-family:system-ui;background:#f5f6f8;margin:0}.card{max-width:420px;margin:10vh auto;background:white;padding:28px;border-radius:12px;box-shadow:0 10px 35px #0002}label{display:block;margin:14px 0 6px}input,button{box-sizing:border-box;width:100%;padding:12px}button{margin-top:20px;background:#b40000;color:#fff;border:0;border-radius:6px;font-weight:700}button:disabled{background:#999;cursor:not-allowed}.hint{color:#666;font-size:13px}.ok{color:#067a37}.error{color:#b40000}</style></head><body><main class="card"><h1>本机安全凭据录入</h1><p class="hint">账号密码只在本机通过 Windows DPAPI 加密，不进入 Flowise、模型上下文、日志或脚本。</p><form id="f"><label>用户名</label><input id="u" autocomplete="username" required maxlength="256"><label>密码</label><input id="p" type="password" autocomplete="current-password" required maxlength="1024"><button id="submit">加密保存</button></form><p id="m"></p></main><script>const sid=${escapedSession};const storageKey='hengzhun.captureToken.'+sid;const fragmentToken=new URLSearchParams(location.hash.slice(1)).get('token');if(fragmentToken)sessionStorage.setItem(storageKey,fragmentToken);const token=fragmentToken||sessionStorage.getItem(storageKey);const form=document.getElementById('f');const message=document.getElementById('m');const submit=document.getElementById('submit');if(!token){submit.disabled=true;message.className='error';message.textContent='凭据链接缺少一次性令牌。请返回Flowise重新打开最新的完整链接。';}form.addEventListener('submit',async e=>{e.preventDefault();if(!token)return;submit.disabled=true;message.className='';message.textContent='保存中…';try{const r=await fetch('/v1/i10/credentials/'+encodeURIComponent(sid)+':store',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({captureToken:token,username:document.getElementById('u').value,password:document.getElementById('p').value})});const j=await r.json();if(r.ok){sessionStorage.removeItem(storageKey);document.getElementById('u').value='';document.getElementById('p').value='';message.className='ok';message.textContent='已安全保存，可关闭此页面。';}else{submit.disabled=false;message.className='error';message.textContent='保存失败：'+(j.errorCode||'UNKNOWN');}}catch{submit.disabled=false;message.className='error';message.textContent='保存失败：无法连接本机Harness，请确认服务正在运行后重试。';}});</script></body></html>`;
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

  private resolveAttachmentWithCanonicalName(flowiseFileRef: string, originalFilename?: string): { filePath: string; originalFilename: string } {
    safeFileRef(flowiseFileRef);
    if (/^att_[0-9a-f-]{36}$/.test(flowiseFileRef)) {
      const directory = path.resolve(this.attachmentRoot, flowiseFileRef);
      const receiptPath = path.join(directory, 'receipt.json');
      const contentPath = path.join(directory, 'content');
      if (!isPathWithin(this.attachmentRoot, directory) || !fs.existsSync(receiptPath) || !fs.existsSync(contentPath)) {
        throw new HarnessError(404, 'I10_ATTACHMENT_NOT_FOUND', 'DOMAIN', '受控附件不存在。');
      }
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as { attachmentRef?: unknown; originalFilename?: unknown; sha256?: unknown };
      if (receipt.attachmentRef !== flowiseFileRef || typeof receipt.originalFilename !== 'string' || typeof receipt.sha256 !== 'string') {
        throw new HarnessError(409, 'I10_ATTACHMENT_RECEIPT_INVALID', 'EVIDENCE', '附件回执无效。', false, true);
      }
      if (originalFilename && originalFilename !== receipt.originalFilename) throw new HarnessError(409, 'I10_ATTACHMENT_NAME_MISMATCH', 'CONTRACT', '附件引用与文件名不一致。');
      const rootRealPath = fs.realpathSync.native(this.attachmentRoot);
      const contentRealPath = fs.realpathSync.native(contentPath);
      if (!isPathWithin(rootRealPath, contentRealPath) || sha256(fs.readFileSync(contentRealPath)) !== receipt.sha256) {
        throw new HarnessError(409, 'I10_ATTACHMENT_CONTENT_INVALID', 'EVIDENCE', '附件内容完整性校验失败。', false, true);
      }
      return { filePath: contentRealPath, originalFilename: receipt.originalFilename };
    }
    const platformReference = decodeFlowiseAttachmentReference(flowiseFileRef);
    const suppliedName = String(originalFilename || '');
    const canonicalName = platformReference?.filename || suppliedName;
    if (!canonicalName) throw new HarnessError(400, 'I10_ATTACHMENT_FILENAME_REQUIRED', 'CONTRACT', '旧式附件引用必须提供文件名。');
    const safeName = path.basename(canonicalName);
    if (safeName !== canonicalName || /[\u0000-\u001f]/.test(safeName)) throw new HarnessError(400, 'I10_ATTACHMENT_FILENAME_INVALID', 'CONTRACT', '附件文件名无效。');
    const root = platformReference ? this.flowiseStorageRoot : this.flowiseAttachmentRoot;
    if (platformReference && suppliedName && platformReference.filename !== suppliedName) throw new HarnessError(409, 'I10_FLOWISE_ATTACHMENT_NAME_MISMATCH', 'CONTRACT', 'Flowise附件引用与文件名不一致。');
    const resolved = platformReference
      ? path.resolve(root, platformReference.orgId, platformReference.chatflowId, platformReference.chatId, platformReference.filename)
      : path.resolve(root, flowiseFileRef, safeName);
    if (!isPathWithin(root, resolved) || !fs.existsSync(resolved)) throw new HarnessError(404, 'I10_FLOWISE_ATTACHMENT_NOT_FOUND', 'DOMAIN', '受控Flowise附件不存在。');
    const rootRealPath = fs.realpathSync.native(root);
    const resolvedRealPath = fs.realpathSync.native(resolved);
    if (!isPathWithin(rootRealPath, resolvedRealPath)) throw new HarnessError(400, 'I10_FLOWISE_ATTACHMENT_ESCAPE_REJECTED', 'AUTHORIZATION', '附件解析后越过受控Flowise存储根目录。');
    return { filePath: resolvedRealPath, originalFilename: safeName };
  }

  private resolveAttachment(flowiseFileRef: string, originalFilename: string): string {
    return this.resolveAttachmentWithCanonicalName(flowiseFileRef, originalFilename).filePath;
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
      if(job.status!=='CONFIRMED')throw new HarnessError(409,'I10_IMAGE_FACTS_NOT_CONFIRMED','DOMAIN','补充图片事实尚未经过用户确认。',false,true);
      return db.prepare(`SELECT f.fact_id,f.field_name,
        COALESCE(d.replacement_value_redacted,f.value_redacted) value_redacted,
        f.provenance_json,f.confidence,f.requires_user_confirmation,d.decision
        FROM i10_case_fact_candidates f
        JOIN i10_image_fact_decisions d ON d.image_ingest_id=f.image_ingest_id AND d.fact_id=f.fact_id
        WHERE f.image_ingest_id=? AND d.decision IN ('CONFIRM','CORRECT')
        ORDER BY f.created_at,f.fact_id`).all(imageIngestId) as any[];
    });
    const facts=snapshot.map(fact=>({factId:String(fact.fact_id),field:fact.field_name,value:String(fact.value_redacted),provenanceRefs:JSON.parse(String(fact.provenance_json)),confidence:Number(fact.confidence),selected:true,requiresUserConfirmation:false}));
    const inputFacts=facts.filter(fact=>fact.field==='INPUT_VALUE');let inputIndex=0;
    // OCR/video text can describe an optional login method.  It is evidence,
    // not permission to create an executable human-verification gate.  Only a
    // later, action-bound policy may promote it to runtime behaviour.
    const verificationRequirements: Array<never> = [];
    const actionStepsV2=draft.steps.map((step,index)=>{const isInput=/输入|填写|键入/.test(step.action);const credential=/账号|用户名|密码|手机号/.test(step.action);const fact=isInput&&!credential?inputFacts[inputIndex++]:undefined;return{ordinal:index+1,actionType:isInput?'INPUT' as const:/验证|核对|断言/.test(step.action)?'ASSERT' as const:'CLICK' as const,instruction:step.action,targetDescription:step.action,...(fact?{inputValue:fact.value,inputValueSource:'IMAGE_EVIDENCE' as const,provenanceRefs:fact.provenanceRefs}:{...(isInput?{inputValueSource:credential?'CREDENTIAL_REF' as const:'RUNTIME_USER_INPUT' as const}:{}),provenanceRefs:[]}),confidence:fact?.confidence??draft.confidence,expected:step.expected};});
    const priorVideoFacts = draft.caseFacts
      .filter(fact => fact.provenanceRefs.some(ref => ref.startsWith('video:')))
      .map(fact => ({ ...fact, requiresUserConfirmation: false }));
    const enriched = caseDraftSchema.parse({
      ...draft,
      supportingImageIngestId:imageIngestId,
      caseFacts:[...facts,...priorVideoFacts],
      actionStepsV2,
      verificationRequirements:[...draft.verificationRequirements,...verificationRequirements]
    });
    const gated = applyCrossSourceConflictGate(enriched, facts);
    return caseDraftSchema.parse({
      ...gated,
      caseFacts:[
        ...gated.caseFacts,
        ...priorVideoFacts.filter(prior => !gated.caseFacts.some(current => current.factId === prior.factId))
      ]
    });
  }

  private async artifactCards(
    namespace: string,
    references: Record<string, unknown>
  ): Promise<Array<InteractionArtifactCard & { downloadGrantRequired: boolean }>> {
    const artifactIds = Array.isArray(references.artifactIds)
      ? references.artifactIds.filter((value): value is string => typeof value === 'string')
      : [];
    const cards: Array<InteractionArtifactCard & { downloadGrantRequired: boolean }> = [];
    for (const artifactId of artifactIds) {
      const metadata = this.artifacts.getMetadata(namespace, artifactId);
      const details = metadata.metadata as Record<string, unknown>;
      cards.push({
        artifactId,
        displayName: typeof details.displayName === 'string' ? details.displayName : `衡准成果.${String(details.format ?? 'bin').toLowerCase()}`,
        purpose: typeof details.purpose === 'string' ? details.purpose : 'HENGZHUN_ARTIFACT',
        format: typeof details.format === 'string' ? details.format : String(metadata.type),
        mediaType: String(metadata.mediaType),
        byteSize: Number(metadata.byteSize),
        sha256: String(metadata.sha256),
        downloadGrantRequired: metadata.redactionStatus !== 'QUARANTINED'
      });
    }
    return cards;
  }

  private async createDraftArtifacts(namespace: string, journeyId: string, draft: CaseDraft): Promise<string[]> {
    const markdown = [
      `# ${draft.title}`,
      '',
      `目标：${draft.objective}`,
      '',
      `系统：${draft.targetSystem ?? '待补充'}`,
      '',
      `入口：${draft.entryUrl ?? '待补充'}`,
      '',
      '## 前置条件',
      '',
      ...draft.preconditions.map(item => `- ${item}`),
      '',
      '## 操作与预期',
      '',
      ...draft.steps.flatMap((step, index) => [
        `${index + 1}. ${step.action}`,
        `   - 预期：${step.expected}`
      ]),
      '',
      '## 验收断言',
      '',
      ...draft.assertions.map(item => `- ${item}`)
    ].join('\n');
    const json = `${canonicalJson(draft)}\n`;
    const md = await this.artifacts.create({
      namespace,
      artifactType: 'REPORT',
      mediaType: 'text/markdown; charset=utf-8',
      redactionStatus: 'REDACTED',
      extension: 'md',
      content: markdown,
      metadata: {
        journeyId,
        purpose: 'CASE_DRAFT_REVIEW',
        displayName: '案例草案.md',
        format: 'MD'
      }
    });
    const machine = await this.artifacts.create({
      namespace,
      artifactType: 'JSON',
      mediaType: 'application/json; charset=utf-8',
      redactionStatus: 'REDACTED',
      extension: 'json',
      content: json,
      metadata: {
        journeyId,
        purpose: 'CASE_DRAFT_MACHINE_READABLE',
        displayName: '案例草案.json',
        format: 'JSON'
      }
    });
    return [String(md.artifactId), String(machine.artifactId)];
  }

  async grantArtifactDownload(namespace: string, artifactId: string): Promise<Record<string, unknown>> {
    const metadata = this.artifacts.getMetadata(namespace, artifactId);
    if (metadata.redactionStatus === 'QUARANTINED') {
      throw new HarnessError(409, 'I10_ARTIFACT_QUARANTINED', 'SECURITY', '隔离制品不可下载。', false, false);
    }
    const token = opaqueId('download');
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await this.database.write(db => {
      db.prepare(`UPDATE i10_artifact_download_grants SET status='EXPIRED'
        WHERE namespace=? AND artifact_id=? AND status='ACTIVE'`)
        .run(namespace, artifactId);
      db.prepare(`INSERT INTO i10_artifact_download_grants(
        grant_id,namespace,artifact_id,token_sha256,status,expires_at,used_at,created_at
      ) VALUES (?,?,?,?,'ACTIVE',?,NULL,?)`)
        .run(opaqueId('grant'), namespace, artifactId, sha256(token), expiresAt, now);
    });
    const details = metadata.metadata as Record<string, unknown>;
    const baseUrl = process.env.HENGZHUN_PUBLIC_BASE_URL ?? 'http://127.0.0.1:18788';
    return {
      artifactId,
      displayName: typeof details.displayName === 'string' ? details.displayName : `衡准成果.${String(details.format ?? 'bin').toLowerCase()}`,
      purpose: typeof details.purpose === 'string' ? details.purpose : 'HENGZHUN_ARTIFACT',
      format: typeof details.format === 'string' ? details.format : String(metadata.type),
      mediaType: metadata.mediaType,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      href: `${baseUrl}/v1/i10/artifacts/${token}`,
      expiresAt,
      oneTime: true
    };
  }

  async consumeArtifactDownload(token: string): Promise<Record<string, unknown>> {
    const now = nowIso();
    const grant = await this.database.write(db => {
      const row = db.prepare(`SELECT grant_id,namespace,artifact_id,status,expires_at
        FROM i10_artifact_download_grants WHERE token_sha256=?`)
        .get(sha256(token)) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I10_ARTIFACT_DOWNLOAD_NOT_FOUND', 'DOMAIN', '下载授权不存在。');
      if (row.status !== 'ACTIVE') throw new HarnessError(409, 'I10_ARTIFACT_DOWNLOAD_NOT_ACTIVE', 'AUTHORIZATION', '下载授权已使用或失效。');
      if (Date.parse(String(row.expires_at)) <= Date.now()) {
        db.prepare(`UPDATE i10_artifact_download_grants SET status='EXPIRED' WHERE grant_id=?`).run(row.grant_id);
        throw new HarnessError(410, 'I10_ARTIFACT_DOWNLOAD_EXPIRED', 'AUTHORIZATION', '下载授权已过期。');
      }
      db.prepare(`UPDATE i10_artifact_download_grants SET status='USED',used_at=? WHERE grant_id=? AND status='ACTIVE'`)
        .run(now, row.grant_id);
      return row;
    });
    const artifact = this.artifacts.read(String(grant.namespace), String(grant.artifact_id));
    const details = artifact.metadata.metadata as Record<string, unknown>;
    return {
      content: artifact.content,
      mediaType: artifact.metadata.mediaType,
      filename: typeof details.displayName === 'string' ? details.displayName : `hengzhun-artifact.${String(details.format ?? 'bin').toLowerCase()}`,
      sha256: artifact.metadata.sha256
    };
  }

  private async grantImagePreviews(namespace: string, imageIngestId: string): Promise<Array<Record<string, unknown>>> {
    const packets = this.database.read(db => {
      const job = db.prepare(`SELECT status FROM i10_image_ingest_jobs WHERE namespace=? AND image_ingest_id=?`)
        .get(namespace, imageIngestId) as { status: string } | undefined;
      if (!job) throw new HarnessError(404, 'I10_IMAGE_INGEST_NOT_FOUND', 'DOMAIN', '补充图片导入任务不存在。');
      if (job.status !== 'WAITING_USER') return [];
      return db.prepare(`SELECT i.ordinal,p.redacted_image_path redactedImagePath,
        p.redacted_image_sha256 redactedImageSha256
        FROM i10_supporting_images i
        JOIN i10_image_evidence_packets p ON p.image_id=i.image_id
        WHERE i.image_ingest_id=?
        ORDER BY i.ordinal`).all(imageIngestId) as Array<{
          ordinal: number;
          redactedImagePath: string;
          redactedImageSha256: string;
        }>;
    });
    if (packets.length === 0) return [];
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const baseUrl = process.env.HENGZHUN_PUBLIC_BASE_URL ?? 'http://127.0.0.1:18788';
    return this.database.write(db => {
      db.prepare(`UPDATE i10_image_preview_grants SET status='EXPIRED'
        WHERE image_ingest_id=? AND status='ACTIVE'`).run(imageIngestId);
      const insert = db.prepare(`INSERT INTO i10_image_preview_grants(
        grant_id,image_ingest_id,namespace,ordinal,token_sha256,status,expires_at,used_at,created_at
      ) VALUES (?,?,?,?,?,'ACTIVE',?,NULL,?)`);
      return packets.map(packet => {
        const token = opaqueId('preview');
        insert.run(opaqueId('previewgrant'), imageIngestId, namespace, packet.ordinal, sha256(token), expiresAt, now);
        return {
          ordinal: packet.ordinal,
          href: `${baseUrl}/v1/i10/images/previews/${token}`,
          expiresAt,
          sourceSha256: packet.redactedImageSha256,
          temporary: true
        };
      });
    });
  }

  async consumeImagePreview(token: string): Promise<Record<string, unknown>> {
    const tokenHash = sha256(token);
    const row = await this.database.write(db => {
      const grant = db.prepare(`SELECT g.grant_id,g.image_ingest_id,g.namespace,g.ordinal,g.status,g.expires_at,
        j.status job_status,d.purge_status,p.redacted_image_path,p.redacted_image_sha256
        FROM i10_image_preview_grants g
        JOIN i10_image_ingest_jobs j ON j.image_ingest_id=g.image_ingest_id
        JOIN i10_image_ocr_deliveries d ON d.image_ingest_id=g.image_ingest_id
        JOIN i10_supporting_images i ON i.image_ingest_id=g.image_ingest_id AND i.ordinal=g.ordinal
        JOIN i10_image_evidence_packets p ON p.image_id=i.image_id
        WHERE g.token_sha256=?`).get(tokenHash) as any;
      if (!grant) throw new HarnessError(404, 'I10_IMAGE_PREVIEW_NOT_FOUND', 'DOMAIN', '图片预览授权不存在。');
      if (grant.status !== 'ACTIVE' || grant.job_status !== 'WAITING_USER' || grant.purge_status !== 'PENDING_CONFIRMATION') {
        throw new HarnessError(409, 'I10_IMAGE_PREVIEW_NOT_ACTIVE', 'AUTHORIZATION', '图片预览已失效或图片已经清理。');
      }
      if (Date.parse(String(grant.expires_at)) <= Date.now()) {
        db.prepare(`UPDATE i10_image_preview_grants SET status='EXPIRED' WHERE grant_id=?`).run(grant.grant_id);
        throw new HarnessError(410, 'I10_IMAGE_PREVIEW_EXPIRED', 'AUTHORIZATION', '图片预览已过期，请刷新分析结果后重试。');
      }
      return grant;
    });
    const evidenceRoot = path.resolve(this.productRoot, '.data', 'image-ingest', String(row.image_ingest_id), 'redacted');
    const evidencePath = path.resolve(this.productRoot, String(row.redacted_image_path));
    if (!isPathWithin(evidenceRoot, evidencePath) || !fs.existsSync(evidencePath)) {
      throw new HarnessError(409, 'I10_IMAGE_PREVIEW_FILE_MISSING', 'EVIDENCE', '脱敏图片预览文件不存在。', false, true);
    }
    const content = fs.readFileSync(evidencePath);
    const contentHash = sha256(content);
    if (contentHash !== String(row.redacted_image_sha256)) {
      throw new HarnessError(409, 'I10_IMAGE_PREVIEW_HASH_MISMATCH', 'EVIDENCE', '脱敏图片预览Hash不一致。', false, true);
    }
    const extension = path.extname(evidencePath).toLowerCase();
    const mediaType = extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/png';
    return { content, mediaType, sha256: contentHash, ordinal: Number(row.ordinal) };
  }

  async cleanupAbandonedImageIngests(at = new Date()): Promise<Record<string, unknown>> {
    const cutoff = new Date(at.getTime() - 72 * 60 * 60_000).toISOString();
    const candidates = this.database.read(db => db.prepare(`SELECT image_ingest_id,namespace,status,updated_at
      FROM i10_image_ingest_jobs
      WHERE status IN ('PROCESSING','WAITING_USER') AND updated_at<=?
      ORDER BY updated_at`).all(cutoff) as Array<{
        image_ingest_id: string;
        namespace: string;
        status: string;
        updated_at: string;
      }>);
    let purged = 0;
    let incomplete = 0;
    for (const candidate of candidates) {
      const images = this.database.read(db => db.prepare(`SELECT flowise_file_ref flowiseFileRef,
        original_filename originalFilename,source_sha256 sourceSha256
        FROM i10_supporting_images WHERE image_ingest_id=? ORDER BY ordinal`)
        .all(candidate.image_ingest_id) as Array<{ flowiseFileRef: string; originalFilename: string; sourceSha256: string }>);
      const targets: string[] = [];
      const failures: Array<{ target: string; errorCode: string }> = [];
      for (const image of images) {
        try {
          targets.push(this.resolveAttachmentWithCanonicalName(image.flowiseFileRef, image.originalFilename).filePath);
        } catch (error) {
          const errorCode = String((error as any)?.errorCode || (error as any)?.code || 'I10_IMAGE_PURGE_RESOLVE_FAILED');
          if (errorCode !== 'I10_FLOWISE_ATTACHMENT_NOT_FOUND') failures.push({ target: image.originalFilename, errorCode });
        }
      }
      const taskRoot = path.resolve(this.productRoot, '.data', 'image-ingest', candidate.image_ingest_id);
      const imageIngestRoot = path.resolve(this.productRoot, '.data', 'image-ingest');
      if (isPathWithin(imageIngestRoot, taskRoot)) targets.push(taskRoot);
      for (const target of targets) {
        try {
          if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
        } catch (error) {
          failures.push({ target: path.basename(target), errorCode: String((error as any)?.code || 'I10_IMAGE_PURGE_DELETE_FAILED') });
        }
      }
      const now = at.toISOString();
      const receipt = {
        imageIngestId: candidate.image_ingest_id,
        reason: 'UNCONFIRMED_FOR_72_HOURS',
        priorStatus: candidate.status,
        deletedCount: targets.length - failures.length,
        expectedCount: targets.length,
        failures,
        sourceHashes: images.map(image => image.sourceSha256),
        purgedAt: now
      };
      await this.database.write(db => {
        db.prepare(`UPDATE i10_image_ingest_jobs
          SET status='FAILED',error_code='I10_IMAGE_CONFIRMATION_EXPIRED',
            lease_owner=NULL,lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=?
          WHERE image_ingest_id=? AND status IN ('PROCESSING','WAITING_USER')`)
          .run(now, now, candidate.image_ingest_id);
        db.prepare(`UPDATE i10_image_ocr_deliveries
          SET purge_status=?,purge_receipt_json=?,purged_at=?,updated_at=?
          WHERE image_ingest_id=?`)
          .run(failures.length ? 'INCOMPLETE' : 'EXPIRED_PURGED', canonicalJson(receipt), now, now, candidate.image_ingest_id);
        db.prepare(`UPDATE i10_image_preview_grants SET status='PURGED'
          WHERE image_ingest_id=? AND status='ACTIVE'`).run(candidate.image_ingest_id);
      });
      if (failures.length) incomplete += 1;
      else purged += 1;
    }
    return { inspected: candidates.length, purged, incomplete, cutoff };
  }

  /**
   * Reconcile asynchronous I10 state which can otherwise survive a worker or
   * desktop restart forever.  This deliberately never deletes a journey,
   * candidate job, challenge, or evidence row: every recovery is represented
   * by an immutable interaction/verification event and a user-visible next
   * action.  A still-linked expired candidate job is re-queued by the normal
   * claimant; a Journey with no linked job/preparation can no longer make
   * progress and is failed closed with an explicit retry action.
   */
  async reconcileExpiredRuntimeState(at = new Date()): Promise<Record<string, unknown>> {
    const now = at.toISOString();
    const journeyCutoff = new Date(at.getTime() - 15 * 60_000).toISOString();
    return this.database.write(db => {
      const expiredChallenges = db.prepare(`SELECT challenge_id,status FROM i10_verification_challenges
        WHERE status IN ('WAITING_USER_PREPARATION','WAITING_USER_ACTION')
          AND expires_at IS NOT NULL AND expires_at <= ?`).all(now) as Array<{ challenge_id: string; status: string }>;
      const expireChallenge = db.prepare(`UPDATE i10_verification_challenges
        SET status='EXPIRED', version=version+1, updated_at=? WHERE challenge_id=?`);
      const insertVerificationEvent = db.prepare(`INSERT INTO i10_verification_events(
        event_id,challenge_id,from_status,to_status,actor_type,created_at
      ) VALUES (?,?,?,'EXPIRED','SYSTEM',?)`);
      for (const challenge of expiredChallenges) {
        expireChallenge.run(now, challenge.challenge_id);
        insertVerificationEvent.run(opaqueId('verificationevent'), challenge.challenge_id, challenge.status, now);
      }

      const orphaned = db.prepare(`SELECT journey_id,references_json,stage,status,version FROM i10_interaction_journeys
        WHERE stage='PROCESSING_AUTHORING' AND status='PROCESSING' AND updated_at <= ?`).all(journeyCutoff) as Array<InteractionJourneyRow>;
      const updateJourney = db.prepare(`UPDATE i10_interaction_journeys
        SET stage='FAILED_ACTIONABLE',status='FAILED',allowed_actions_json=?,next_action_json=?,
            progress_json=?,error_json=?,version=?,updated_at=? WHERE journey_id=?`);
      const insertJourneyEvent = db.prepare(`INSERT INTO i10_interaction_events(
        event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at
      ) VALUES (?,?,?,'ORPHAN_RECONCILED','PROCESSING_AUTHORING','FAILED_ACTIONABLE',NULL,?,NULL,?)`);
      let requeued = 0;
      let failedClosed = 0;
      for (const journey of orphaned) {
        const references = JSON.parse(journey.references_json) as Record<string, unknown>;
        const preparationId = typeof references.preparationId === 'string' ? references.preparationId : null;
        const job = preparationId
          ? db.prepare(`SELECT job_id,status,lease_expires_at FROM i8_candidate_build_jobs
              WHERE executable_plan_id=(SELECT executable_plan_id FROM i8_executable_plans WHERE preparation_id=?)
              ORDER BY created_at DESC LIMIT 1`).get(preparationId) as { job_id: string; status: string; lease_expires_at: string | null } | undefined
          : undefined;
        if (job && (job.status === 'QUEUED' || (job.status === 'RUNNING' && job.lease_expires_at !== null && job.lease_expires_at <= now))) {
          if (job.status === 'RUNNING') {
            db.prepare(`UPDATE i8_candidate_build_jobs SET status='QUEUED',lease_owner=NULL,lease_expires_at=NULL,
              version=version+1,updated_at=? WHERE job_id=? AND status='RUNNING'`).run(now, job.job_id);
          }
          db.prepare(`UPDATE i10_interaction_journeys SET progress_json=?,updated_at=? WHERE journey_id=?`).run(
            canonicalJson({ percent: 0, lastActivityAt: now, recovery: 'AUTHORING_REQUEUED' }), now, journey.journey_id
          );
          requeued += 1;
          continue;
        }
        const nextVersion = journey.version + 1;
        const nextAction = { type: 'RETRY_AUTHORING', description: '作者化任务已失去可恢复的执行绑定。请确认后重新提交作者化；不会覆盖原案例或凭据引用。' };
        const error = { errorCode: 'I10_AUTHORING_ORPHANED', stage: 'PROCESSING_AUTHORING', recoverable: true };
        updateJourney.run(canonicalJson(['RETRY_AUTHORING','CANCEL']), canonicalJson(nextAction),
          canonicalJson({ percent: 0, lastActivityAt: now, recovery: 'AUTHORING_ORPHANED' }), canonicalJson(error), nextVersion, now, journey.journey_id);
        const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`).get(journey.journey_id) as { value: number }).value) + 1;
        insertJourneyEvent.run(opaqueId('journeyevent'), journey.journey_id, sequence,
          canonicalJson({ reason: 'NO_RECOVERABLE_CANDIDATE_JOB', referenceKeys: Object.keys(references).sort() }), now);
        failedClosed += 1;
      }
      // Attachment journeys can be interrupted before a worker owns an
      // ingestion job (for example after Flowise is restarted between the
      // Journey projection and `ingest_submit`).  Leaving those rows in
      // PROCESSING forever makes a healthy desktop look ready while users
      // cannot resume the conversation.  Reconcile only expired records and
      // only when no recoverable job is linked; never delete their evidence.
      const attachmentOrphans = db.prepare(`SELECT journey_id,references_json,stage,status,version FROM i10_interaction_journeys
        WHERE stage IN ('PROCESSING_INGEST','PROCESSING_IMAGE') AND status='PROCESSING' AND updated_at <= ?`)
        .all(journeyCutoff) as Array<InteractionJourneyRow>;
      const insertAttachmentOrphanEvent = db.prepare(`INSERT INTO i10_interaction_events(
        event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at
      ) VALUES (?,?,?,'ORPHAN_RECONCILED',?,'FAILED_ACTIONABLE',NULL,?,NULL,?)`);
      let orphanedAttachmentJourneys = 0;
      for (const journey of attachmentOrphans) {
        const references = JSON.parse(journey.references_json) as Record<string, unknown>;
        const ingestJobId = typeof references.ingestJobId === 'string' ? references.ingestJobId : null;
        const imageIngestId = typeof references.imageIngestId === 'string' ? references.imageIngestId : null;
        const ingest = ingestJobId
          ? db.prepare(`SELECT status,lease_expires_at FROM i10_ingest_jobs WHERE ingest_job_id=?`).get(ingestJobId) as { status: string; lease_expires_at: string | null } | undefined
          : undefined;
        const image = imageIngestId
          ? db.prepare(`SELECT status,lease_expires_at FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(imageIngestId) as { status: string; lease_expires_at: string | null } | undefined
          : undefined;
        const recoverable = [ingest, image].some(job => job && (
          job.status === 'QUEUED' ||
          (job.status === 'PROCESSING' && job.lease_expires_at !== null && job.lease_expires_at > now)
        ));
        if (recoverable) continue;
        const nextVersion = journey.version + 1;
        const retryType = journey.stage === 'PROCESSING_IMAGE' ? 'RETRY_IMAGE_INGEST' : 'RETRY_INGEST';
        const errorCode = journey.stage === 'PROCESSING_IMAGE' ? 'I10_IMAGE_INGEST_ORPHANED' : 'I10_INGEST_ORPHANED';
        updateJourney.run(
          canonicalJson([retryType, 'CANCEL']),
          canonicalJson({ type: retryType, description: '附件处理任务已失去可恢复的执行绑定。请确认后重新提交受控附件；不会覆盖原案例或凭据引用。' }),
          canonicalJson({ percent: 0, lastActivityAt: now, recovery: errorCode }),
          canonicalJson({ errorCode, stage: journey.stage, recoverable: true }),
          nextVersion, now, journey.journey_id
        );
        const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`).get(journey.journey_id) as { value: number }).value) + 1;
        insertAttachmentOrphanEvent.run(
          opaqueId('journeyevent'), journey.journey_id, sequence, journey.stage,
          canonicalJson({ reason: 'NO_RECOVERABLE_ATTACHMENT_JOB', referenceKeys: Object.keys(references).sort() }), now
        );
        orphanedAttachmentJourneys += 1;
      }
      return {
        expiredChallenges: expiredChallenges.length,
        requeuedAuthoringJourneys: requeued,
        orphanedAuthoringJourneys: failedClosed,
        orphanedAttachmentJourneys,
        journeyCutoff
      };
    });
  }

  private async reconcileJourneyProjection(row: InteractionJourneyRow): Promise<InteractionJourneyRow> {
    if (row.request_intent !== 'CASE_AUTHORING' || !['PROCESSING_AUTHORING', 'RUNNING', 'COMPLETED'].includes(row.stage)) return row;
    const initialReferences = JSON.parse(row.references_json) as Record<string, unknown>;
    const preparationId = typeof initialReferences.preparationId === 'string' ? initialReferences.preparationId : undefined;
    if (!preparationId) return row;
    return this.database.write(db => {
      const current = db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`)
        .get(row.journey_id) as InteractionJourneyRow | undefined;
      if (!current || !['PROCESSING_AUTHORING', 'RUNNING', 'COMPLETED'].includes(current.stage)) return current ?? row;
      const references = JSON.parse(current.references_json) as Record<string, unknown>;
      const failClosedExecution = (errorCode: string, description: string): InteractionJourneyRow => {
        const now = nowIso();
        const nextVersion = current.version + 1;
        const error = { errorCode, category: 'EVIDENCE', recoverable: false };
        db.prepare(`UPDATE i10_interaction_journeys
          SET stage='FAILED_CLOSED',status='FAILED',allowed_actions_json='[]',next_action_json=?,
              progress_json=?,error_json=?,recoverable=0,version=?,updated_at=? WHERE journey_id=?`)
          .run(
            canonicalJson({ type:'NONE',description }),
            canonicalJson({ percent:100,lastActivityAt:now }),canonicalJson(error),nextVersion,now,current.journey_id
          );
        const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`)
          .get(current.journey_id) as { value:number }).value) + 1;
        db.prepare(`INSERT INTO i10_interaction_events(
            event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at
          ) VALUES (?,?,?,'PROJECTED',?,'FAILED_CLOSED',NULL,?,NULL,?)`)
          .run(opaqueId('journeyevent'),current.journey_id,sequence,current.stage,
            canonicalJson({ source:'EXACT_EXECUTION_LINK',errorCode:error.errorCode }),now);
        return db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`)
          .get(current.journey_id) as InteractionJourneyRow;
      };
      const projection = db.prepare(`
        SELECT p.case_id,p.executable_plan_id,p.status AS plan_status,p.updated_at AS plan_updated_at,
               j.job_id,j.status AS job_status,j.error_code AS job_error_code,j.updated_at AS job_updated_at,
               c.candidate_id,c.script_id,c.script_version,c.script_sha256,c.status AS candidate_status,
               c.version AS candidate_version,c.updated_at AS candidate_updated_at,
               cert.certificate_id,cert.status AS certificate_status,cert.issued_at,
               delivery.choice AS delivery_choice,delivery.effect AS delivery_effect,
               delivery.activated_plan_id,delivery.created_at AS delivery_created_at
        FROM i8_executable_plans p
        LEFT JOIN i8_candidate_build_jobs j ON j.executable_plan_id=p.executable_plan_id
        LEFT JOIN i8_script_candidates c ON c.executable_plan_id=p.executable_plan_id
        LEFT JOIN i8_stability_certificates cert ON cert.candidate_id=c.candidate_id
        LEFT JOIN i8_script_delivery_decisions delivery ON delivery.decision_id=(
          SELECT decision_id FROM i8_script_delivery_decisions
          WHERE candidate_id=c.candidate_id ORDER BY created_at DESC LIMIT 1
        )
        WHERE p.namespace=? AND p.preparation_id=?
      `).get(current.namespace, preparationId) as Record<string, unknown> | undefined;
      // A native Flowise custom-MCP Tool ends its current execution after the
      // response is returned.  The next authoring action therefore arrives in
      // a fresh chat execution.  Until an executable plan exists, project the
      // durable preparation state as the *next single action* instead of
      // claiming that candidate compilation is already running.
      if (!projection) {
        const unresolvedAction = String((JSON.parse(current.next_action_json) as Record<string, unknown>).type ?? '');
        const executionStateWithoutProjection = current.stage === 'RUNNING' ||
          ['CALL_RUN_SUBMIT','QUERY_TASK','RESUME_RUN','RESULT_AVAILABLE','QUERY_FAILURE','CALL_SCHEDULE_CREATE','QUERY_SCHEDULE'].includes(unresolvedAction) ||
          ['confirmedDecisionEventId','taskId','runId','scheduleId'].some(key => typeof references[key] === 'string');
        if (executionStateWithoutProjection) {
          return failClosedExecution(
            'I10_EXECUTION_PROJECTION_MISSING',
            '旅程声明了运行或调度，但其准备与执行计划投影不存在；系统拒绝猜测其他对象。'
          );
        }
        const preparation = db.prepare(`SELECT status,version,updated_at FROM i8_case_preparations
          WHERE namespace=? AND preparation_id=?`).get(current.namespace, preparationId) as
          | { status: string; version: number; updated_at: string }
          | undefined;
        if (!preparation) return current;
        const nextAction = JSON.parse(current.next_action_json) as Record<string, unknown>;
        const desired = preparation.status === 'PREPARED'
          ? { type: 'SUBMIT_AUTHORING', description: '案例已冻结，等待提交作者化。', retryAfterSeconds: 0 }
          : preparation.status === 'AWAITING_STAGE3'
            ? { type: 'COMPILE_CANDIDATE', description: '作者化意图已提交，等待编译候选脚本。', retryAfterSeconds: 0 }
            : undefined;
        if (!desired || nextAction.type === desired.type) return current;
        const now = nowIso();
        const referencesJson = canonicalJson({ ...references, preparationId, preparationVersion: preparation.version });
        db.prepare(`UPDATE i10_interaction_journeys
          SET next_action_json=?,references_json=?,progress_json=?,version=?,updated_at=? WHERE journey_id=?`)
          .run(canonicalJson(desired), referencesJson,
            canonicalJson({ percent: preparation.status === 'PREPARED' ? 35 : 40, lastActivityAt: preparation.updated_at }),
            current.version + 1, now, current.journey_id);
        const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`)
          .get(current.journey_id) as { value: number }).value) + 1;
        db.prepare(`INSERT INTO i10_interaction_events(
            event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at
          ) VALUES (?,?,?,'PROJECTED',?,?,NULL,?,NULL,?)`)
          .run(opaqueId('journeyevent'), current.journey_id, sequence, current.stage, current.stage,
            canonicalJson({ source: 'PREPARATION_STATE', preparationStatus: preparation.status }), now);
        return db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`)
          .get(current.journey_id) as InteractionJourneyRow;
      }

      const projectedCaseId = String(projection.case_id);
      const confirmedDecisionEventId = typeof references.confirmedDecisionEventId === 'string'
        ? references.confirmedDecisionEventId
        : undefined;
      const executionAction = String((JSON.parse(current.next_action_json) as Record<string, unknown>).type ?? '');
      const executionProjectionRequired = current.stage === 'RUNNING' ||
        ['CALL_RUN_SUBMIT','QUERY_TASK','RESUME_RUN','RESULT_AVAILABLE','QUERY_FAILURE','CALL_SCHEDULE_CREATE','QUERY_SCHEDULE'].includes(executionAction) ||
        ['taskId','runId','scheduleId'].some(key => typeof references[key] === 'string');
      const decisionEvent = confirmedDecisionEventId
        ? db.prepare(`SELECT decision,safe_payload_json FROM i10_interaction_events
            WHERE event_id=? AND journey_id=? AND event_type='DECISION'`)
          .get(confirmedDecisionEventId,current.journey_id) as { decision: string; safe_payload_json: string } | undefined
        : undefined;
      const decisionPayload = decisionEvent
        ? JSON.parse(decisionEvent.safe_payload_json) as Record<string, unknown>
        : undefined;
      const eventBinding = decisionPayload?.executionBinding && typeof decisionPayload.executionBinding === 'object' &&
        !Array.isArray(decisionPayload.executionBinding)
        ? decisionPayload.executionBinding as Record<string, unknown>
        : undefined;
      const exactExecutionBinding = eventBinding && Object.entries({
        namespace:current.namespace,
        journeyId:current.journey_id,
        preparationId,
        caseId:references.caseId,
        planId:references.planId,
        candidateId:references.candidateId
      }).every(([key,value]) => typeof value === 'string' && value.length > 0 && eventBinding[key] === value);
      const decisionMatchesAction = decisionEvent && (
        (decisionEvent.decision === 'RUN_ON_DEMAND' &&
          ['CALL_RUN_SUBMIT','QUERY_TASK','RESUME_RUN','RESULT_AVAILABLE','QUERY_FAILURE'].includes(executionAction)) ||
        (['CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE'].includes(decisionEvent.decision) &&
          ['CALL_SCHEDULE_CREATE','QUERY_SCHEDULE'].includes(executionAction))
      );
      if (executionProjectionRequired && (!confirmedDecisionEventId || !decisionMatchesAction || !exactExecutionBinding)) {
        return failClosedExecution(
          confirmedDecisionEventId ? 'I10_EXECUTION_LINK_INVALID' : 'I10_EXECUTION_LINK_REQUIRED',
          '历史运行或调度没有唯一不可变的旅程链接，系统已停止推断。'
        );
      }
      const caseId = exactExecutionBinding ? String(eventBinding.caseId) : projectedCaseId;
      const planId = exactExecutionBinding ? String(eventBinding.planId) : String(projection.activated_plan_id ?? '');
      const candidateId = exactExecutionBinding ? String(eventBinding.candidateId) : String(projection.candidate_id ?? '');
      const task = confirmedDecisionEventId
        ? db.prepare(`SELECT t.task_id,t.run_id,t.status,t.result_artifact_id,t.error_code,t.error_category,
              t.user_action_required,t.updated_at
            FROM runs r JOIN tasks t ON t.task_id=r.task_id
            WHERE r.namespace=? AND r.journey_id=? AND r.confirmed_decision_event_id=?
              AND r.preparation_id=? AND r.case_id=? AND r.plan_id=? AND r.candidate_id=?
              AND r.origin_schedule_id IS NULL
            LIMIT 1`).get(
              current.namespace,current.journey_id,confirmedDecisionEventId,preparationId,caseId,
              planId,candidateId
            ) as Record<string, unknown> | undefined
        : undefined;
      const inbox = task
        ? db.prepare(`SELECT inbox_id,run_id,task_id,outcome,result_artifact_id,created_at
            FROM result_inbox_items WHERE namespace=? AND task_id=? ORDER BY sequence DESC LIMIT 1`)
          .get(current.namespace, task.task_id) as Record<string, unknown> | undefined
        : undefined;
      const schedule = confirmedDecisionEventId
        ? db.prepare(`SELECT schedule_id,status,schedule_type,script_id,script_version,script_sha256,updated_at
            FROM schedules
            WHERE namespace=? AND journey_id=? AND confirmed_decision_event_id=?
              AND preparation_id=? AND case_id=? AND plan_id=? AND candidate_id=?
            LIMIT 1`).get(
              current.namespace,current.journey_id,confirmedDecisionEventId,preparationId,caseId,
              planId,candidateId
            ) as Record<string, unknown> | undefined
        : undefined;
      const legacyUnlinkedObject = exactExecutionBinding && !task && !schedule
        ? decisionEvent?.decision === 'RUN_ON_DEMAND'
          ? db.prepare(`SELECT run_id AS object_id FROM runs
              WHERE namespace=? AND case_id=? AND plan_id=? AND origin_schedule_id IS NULL
                AND journey_id IS NULL
              LIMIT 1`).get(current.namespace,caseId,planId) as { object_id:string } | undefined
          : db.prepare(`SELECT schedule_id AS object_id FROM schedules
              WHERE namespace=? AND case_id=? AND plan_id=? AND journey_id IS NULL
              LIMIT 1`).get(current.namespace,caseId,planId) as { object_id:string } | undefined
        : undefined;
      if (legacyUnlinkedObject) {
        return failClosedExecution(
          'I10_EXECUTION_LEGACY_OBJECT_UNLINKED',
          '相同案例和计划存在历史运行或调度，但它没有不可变旅程链接；系统拒绝按时间或最新对象猜测。'
        );
      }
      const linkedObjectMissing = executionProjectionRequired && (
        (['QUERY_TASK','RESUME_RUN','RESULT_AVAILABLE','QUERY_FAILURE'].includes(executionAction) && !task) ||
        (executionAction === 'QUERY_SCHEDULE' && !schedule) ||
        ((typeof references.taskId === 'string' || typeof references.runId === 'string') && !task) ||
        (typeof references.scheduleId === 'string' && !schedule)
      );
      if (linkedObjectMissing) {
        return failClosedExecution(
          'I10_EXECUTION_OBJECT_LINK_MISSING',
          '旅程声明的运行或调度不存在对应的精确不可变链接，系统已停止推断。'
        );
      }
      const challenge = task
        ? db.prepare(`SELECT challenge_id,status,verification_type,version,expires_at,updated_at
            FROM i10_verification_challenges WHERE namespace=? AND task_ref=? ORDER BY created_at DESC LIMIT 1`)
          .get(current.namespace, task.task_id) as Record<string, unknown> | undefined
        : undefined;

      references.caseId = caseId;
      references.preparationId = preparationId;
      if (!exactExecutionBinding || String(projection.candidate_id ?? '') === candidateId) {
        references.executablePlanId = projection.executable_plan_id;
      }
      if (projection.job_id) references.jobId = projection.job_id;
      references.candidateId = candidateId;
      if (!exactExecutionBinding || String(projection.candidate_id ?? '') === candidateId) {
        if (projection.certificate_id) references.certificateId = projection.certificate_id;
        if (projection.script_id) references.scriptId = projection.script_id;
        if (projection.script_version) references.scriptVersion = projection.script_version;
        if (projection.script_sha256) references.scriptHash = projection.script_sha256;
      }
      if (planId) references.planId = planId;
      if (task?.task_id) references.taskId = task.task_id;
      if (task?.run_id) references.runId = task.run_id;
      if (schedule?.schedule_id) references.scheduleId = schedule.schedule_id;
      if (challenge?.challenge_id) references.challengeId = challenge.challenge_id;
      if (inbox?.inbox_id) references.inboxId = inbox.inbox_id;
      if (inbox?.result_artifact_id || task?.result_artifact_id) {
        references.resultArtifactId = inbox?.result_artifact_id ?? task?.result_artifact_id;
      }

      let stage = current.stage;
      let status = current.status;
      let allowedActions = JSON.parse(current.allowed_actions_json) as string[];
      let nextAction = JSON.parse(current.next_action_json) as Record<string, unknown>;
      let progress = JSON.parse(current.progress_json) as Record<string, unknown>;
      let error: Record<string, unknown> | null = current.error_json
        ? JSON.parse(current.error_json) as Record<string, unknown>
        : null;

      if (inbox && task?.status === 'SUCCEEDED' && inbox.outcome === 'PASSED') {
        stage = 'COMPLETED';
        status = 'COMPLETED';
        allowedActions = [];
        nextAction = { type: 'RESULT_AVAILABLE', description: '正式回归已完成，脱敏结果和制品可查询。' };
        progress = { percent: 100, lastActivityAt: inbox.created_at };
        error = null;
      } else if (task && ['FAILED', 'BLOCKED', 'CANCELLED'].includes(String(task.status))) {
        stage = 'FAILED_ACTIONABLE';
        status = 'FAILED';
        allowedActions = [];
        nextAction = { type: 'QUERY_FAILURE', description: '正式回归未通过，请读取失败分类后决定是否生成修复候选。' };
        progress = { percent: 100, lastActivityAt: task.updated_at };
        error = {
          errorCode: task.error_code ?? 'I10_FORMAL_RUN_NOT_PASSED',
          category: task.error_category ?? 'EXECUTION',
          recoverable: task.status !== 'CANCELLED'
        };
      } else if (task && (task.status === 'WAITING_USER' || Number(task.user_action_required) === 1) && challenge) {
        stage = 'AWAITING_RUNTIME_VERIFICATION';
        status = 'AWAITING_USER';
        allowedActions = ['COMPLETE_RUNTIME_VERIFICATION', 'ABORT_RUNTIME_VERIFICATION'];
        nextAction = this.exactProposal(
          'COMPLETE_RUNTIME_VERIFICATION',
          `完成人工验证 ${String(challenge.challenge_id)}`,
          '在被测页面或设备完成验证后点击proceed，系统将恢复同一个浏览器任务。',
          '点击reject将中止本次执行；不要在对话中输入验证码、PIN或密码。',
          'ABORT_RUNTIME_VERIFICATION',
          { challengeId: challenge.challenge_id, challengeVersion: challenge.version }
        );
        progress = { percent: 75, lastActivityAt: challenge.updated_at };
        error = null;
      } else if (task) {
        stage = 'RUNNING';
        status = 'PROCESSING';
        allowedActions = [];
        nextAction = { type: 'QUERY_TASK', description: '正式回归正在执行，请继续查询同一任务。', retryAfterSeconds: 5 };
        progress = { percent: 80, lastActivityAt: task.updated_at };
        error = null;
      } else if (schedule) {
        stage = 'COMPLETED';
        status = 'COMPLETED';
        allowedActions = [];
        nextAction = { type: 'QUERY_SCHEDULE', description: '调度已经创建，可按调度编号查询或停用。' };
        progress = { percent: 100, lastActivityAt: schedule.updated_at };
        error = null;
      } else if (current.stage === 'COMPLETED' && nextAction?.type === 'CALL_SCHEDULE_CREATE') {
        // The confirmed schedule decision and the deterministic create call
        // are separate writes. Preserve the exact pending decision until the
        // linked schedule exists instead of falling back to candidate state.
        stage = current.stage;
        status = current.status;
      } else if (current.stage === 'RUNNING' && !task && projection.activated_plan_id &&
        ['CALL_RUN_SUBMIT', 'RESUME_RUN', 'CALL_REPAIR_RERUN'].includes(String(nextAction?.type ?? ''))) {
        // A confirmed run/repair decision whose follow-up submit has not
        // executed yet must survive projection — but only while the script is
        // genuinely activated.  Without an ACTIVATED plan the run_submit call
        // fails closed with I8_SCRIPT_NOT_ACTIVATED, so fall through to the
        // certificate branch and let the Journey present the activation gate
        // again instead of looping on phantom run decisions.
        stage = current.stage;
        status = current.status;
      } else if (projection.delivery_choice === 'ACTIVATE') {
        stage = 'NEEDS_INPUT';
        status = 'NEEDS_INPUT';
        allowedActions = [];
        nextAction = this.inputRequest(
          'EXECUTION_PLAN',
          '脚本已激活，请说明立即执行、单次定时或周期执行。',
          ['立即执行', '2026-07-25 10:00 在 Asia/Shanghai 执行一次', '每个工作日 09:00，时区 Asia/Shanghai'],
          ['executionMode']
        );
        progress = { percent: 70, lastActivityAt: projection.delivery_created_at };
        error = null;
      } else if (projection.delivery_choice === 'REJECT') {
        stage = 'COMPLETED';
        status = 'COMPLETED';
        allowedActions = [];
        nextAction = { type: 'NONE', description: '候选已拒绝；没有激活脚本、运行或调度。' };
        progress = { percent: 100, lastActivityAt: projection.delivery_created_at };
        error = null;
      } else if (projection.delivery_choice === 'SAVE_ONLY') {
        stage = 'READY_FOR_SCRIPT_ACTIVATION';
        status = 'AWAITING_USER';
        allowedActions = ['ACTIVATE_SCRIPT', 'REJECT_SCRIPT'];
        nextAction = this.exactProposal(
          'ACTIVATE_SCRIPT',
          `激活已保存候选 ${String(projection.candidate_id)}`,
          '点击proceed只激活页面所示脚本版本和Hash。',
          '点击reject继续保留候选，不创建运行或调度。',
          'REJECT_SCRIPT',
          { candidateId: projection.candidate_id, candidateVersion: projection.candidate_version, scriptHash: projection.script_sha256 }
        );
        progress = { percent: 65, lastActivityAt: projection.delivery_created_at };
        error = null;
      } else if (projection.certificate_status === 'PASSED' &&
        ['WAITING_USER', 'STABILITY_CERTIFIED'].includes(String(projection.candidate_status))) {
        stage = 'READY_FOR_SCRIPT_ACTIVATION';
        status = 'AWAITING_USER';
        allowedActions = ['ACTIVATE_SCRIPT', 'REJECT_SCRIPT'];
        nextAction = this.exactProposal(
          'ACTIVATE_SCRIPT',
          `激活持证候选 ${String(projection.candidate_id)}`,
          '点击proceed只激活页面所示脚本版本和Hash。',
          '点击reject保留候选但不激活，不创建运行或调度。',
          'REJECT_SCRIPT',
          {
            candidateId: projection.candidate_id,
            candidateVersion: projection.candidate_version,
            certificateId: projection.certificate_id,
            scriptHash: projection.script_sha256
          }
        );
        progress = { percent: 60, lastActivityAt: projection.issued_at };
        error = null;
      } else if (projection.job_status === 'FAILED' || projection.plan_status === 'FAILED') {
        stage = 'FAILED_ACTIONABLE';
        status = 'FAILED';
        allowedActions = [];
        nextAction = { type: 'RETRY_AUTHORING', description: '视觉作者化或候选生成失败；修复原因后可在原案例上重新提交作者化。' };
        progress = { percent: 100, lastActivityAt: projection.job_updated_at ?? projection.plan_updated_at };
        error = {
          errorCode: projection.job_error_code ?? 'I10_AUTHORING_FAILED',
          category: 'AUTHORING',
          recoverable: true
        };
      } else {
        references.jobId = projection.job_id;
        progress = { percent: 40, lastActivityAt: projection.job_updated_at ?? projection.plan_updated_at };
      }

      const changed = stage !== current.stage || status !== current.status ||
        canonicalJson(references) !== current.references_json ||
        canonicalJson(nextAction) !== current.next_action_json ||
        canonicalJson(progress) !== current.progress_json ||
        canonicalJson(allowedActions) !== current.allowed_actions_json ||
        canonicalJson(error) !== canonicalJson(current.error_json ? JSON.parse(current.error_json) : null);
      if (!changed) return current;

      const now = nowIso();
      const nextVersion = current.version + 1;
      db.prepare(`UPDATE i10_interaction_journeys
        SET stage=?,status=?,allowed_actions_json=?,next_action_json=?,references_json=?,progress_json=?,
            error_json=?,version=?,updated_at=? WHERE journey_id=?`)
        .run(stage,status,canonicalJson(allowedActions),canonicalJson(nextAction),canonicalJson(references),
          canonicalJson(progress),error ? canonicalJson(error) : null,nextVersion,now,current.journey_id);
      const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`)
        .get(current.journey_id) as { value: number }).value) + 1;
      db.prepare(`INSERT INTO i10_interaction_events(
          event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at
        ) VALUES (?,?,?,'PROJECTED',?,?,NULL,?,NULL,?)`)
        .run(opaqueId('journeyevent'),current.journey_id,sequence,current.stage,stage,
          canonicalJson({ source: 'AUTHORITATIVE_BUSINESS_STATE', referenceKeys: Object.keys(references).sort() }),now);
      return db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`)
        .get(current.journey_id) as InteractionJourneyRow;
    });
  }

  private async interactionEnvelope(row: InteractionJourneyRow): Promise<Record<string, unknown>> {
    const inputEnvelope = JSON.parse(row.input_envelope_json) as Record<string, unknown>;
    const missingFields = JSON.parse(row.missing_fields_json) as string[];
    const allowedActions = JSON.parse(row.allowed_actions_json) as string[];
    const nextAction = JSON.parse(row.next_action_json) as Record<string, unknown>;
    const references = JSON.parse(row.references_json) as Record<string, unknown>;
    const progress = JSON.parse(row.progress_json) as Record<string, unknown>;
    const error = row.error_json ? JSON.parse(row.error_json) as Record<string, unknown> : undefined;
    const interactionMode = typeof nextAction.interactionMode === 'string'
      ? nextAction.interactionMode
      : row.status === 'NEEDS_INPUT'
        ? 'INPUT_REQUIRED'
        : row.status === 'AWAITING_USER'
          ? 'CONFIRM_EXACT'
          : 'STATUS_ONLY';
    const inputRequest = nextAction.inputRequest && typeof nextAction.inputRequest === 'object'
      ? nextAction.inputRequest as Record<string, unknown>
      : undefined;
    const proposal = nextAction.proposal && typeof nextAction.proposal === 'object'
      ? nextAction.proposal as Record<string, unknown>
      : undefined;
    // Recover the exact, already validated CaseDraft for an explicit Flowise
    // resume. It contains a credential reference only; DPAPI plaintext stays
    // in the credential service and is never returned here.
    const caseDraft = inputEnvelope.draftJson && typeof inputEnvelope.draftJson === 'object' &&
      !Array.isArray(inputEnvelope.draftJson)
      ? inputEnvelope.draftJson as Record<string, unknown>
      : undefined;
    const preparationId = typeof references.preparationId === 'string' ? references.preparationId : undefined;
    const preparation = preparationId
      ? this.database.read(db => db.prepare(`SELECT version,status FROM i8_case_preparations WHERE namespace=? AND preparation_id=?`)
        .get(row.namespace, preparationId) as { version: number; status: string } | undefined)
      : undefined;
    const artifactCards = await this.artifactCards(row.namespace, references);
    const adaptive = composeInteractionResponse({
      journeyId: row.journey_id,
      version: row.version,
      requestIntent: row.request_intent,
      inputType: row.input_type,
      stage: row.stage,
      status: row.status,
      missingFields,
      contractMissingFields: Array.isArray(inputEnvelope.contractMissingFields) ? inputEnvelope.contractMissingFields : [],
      semanticMissingFields: Array.isArray(inputEnvelope.semanticMissingFields) ? inputEnvelope.semanticMissingFields : [],
      allowedActions,
      nextAction,
      references,
      progress,
      interactionMode,
      inputRequest,
      proposal,
      ...(error ? { error } : {}),
      recoverable: Boolean(row.recoverable),
      updatedAt: row.updated_at,
      artifactCards
    });
    const briefItems = adaptive.briefItems as string[];
    const title = String(adaptive.headline);
    const summary = briefItems.join(' ');
    const transition = {
      schemaVersion: 'hengzhun-i10-journey-transition-v2',
      journeyId: row.journey_id,
      journeyVersion: row.version,
      stage: row.stage,
      status: row.status,
      action: String(nextAction.type ?? 'NONE'),
      payloadHash: proposal?.payloadHash ?? sha256(canonicalJson({ stage: row.stage, status: row.status, references, nextAction })),
      references,
      recoverable: Boolean(row.recoverable)
    };
    return {
      ...adaptive,
      legacySchemaVersion: 'hengzhun-i10-interaction-envelope-v1',
      journeyId: row.journey_id,
      version: row.version,
      requestIntent: row.request_intent,
      inputType: row.input_type,
      stage: row.stage,
      status: row.status,
      title,
      summary,
      transition,
      missingFields,
      contractMissingFields: Array.isArray(inputEnvelope.contractMissingFields) ? inputEnvelope.contractMissingFields : [],
      semanticMissingFields: Array.isArray(inputEnvelope.semanticMissingFields) ? inputEnvelope.semanticMissingFields : [],
      allowedActions,
      nextAction,
      interactionMode,
      ...(inputRequest ? { inputRequest } : {}),
      ...(proposal ? { proposal } : {}),
      // Flowise toolUpdateState does not reliably resolve nested MCP output
      // paths such as output.proposal.proposalId. Publish additive top-level
      // aliases so the Agentflow can bind an exact frozen proposal without
      // ever falling back to an unresolved template string.
      ...(proposal ? {
        proposalId: proposal.proposalId,
        proposalPayloadHash: proposal.payloadHash,
        proposalSummary: proposal.summary,
        proposalEffect: proposal.effect,
        proposalRejectEffect: proposal.rejectEffect,
        proposalProceedDecision: proposal.proceedDecision,
        proposalRejectDecision: proposal.rejectDecision
      } : {}),
      ...(caseDraft ? { caseDraft } : {}),
      ...(preparationId ? { preparationId } : {}),
      ...(preparation ? { preparationVersion: preparation.version, preparationStatus: preparation.status } : {}),
      references,
      progress,
      ...(error ? { error } : {}),
      recoverable: Boolean(row.recoverable),
      updatedAt: row.updated_at
    };
  }

  private validateJourneyEntryUrl(value: string | undefined): JourneyEntryUrlValidation {
    const normalized = value?.trim();
    if (!normalized) return { status: 'MISSING' };
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return { status: 'INVALID' };
      return { status: 'VALID', value: parsed.href };
    } catch {
      return { status: 'INVALID' };
    }
  }

  private inputRequest(
    inputKind: string,
    prompt: string,
    examples: string[],
    requiredFields: string[]
  ): Record<string, unknown> {
    return {
      transitionVersion: 'JourneyTransitionV2',
      interactionMode: 'INPUT_REQUIRED',
      type: 'PROVIDE_INPUT',
      description: prompt,
      inputRequest: {
        inputKind,
        prompt,
        examples,
        requiredFields,
        freeTextAllowed: true,
        secretInputAllowed: false,
        secretPolicy: '账号、密码、验证码、PIN和密钥只能通过本机安全页面或被测页面输入。'
      }
    };
  }

  private exactProposal(
    action: string,
    summary: string,
    effect: string,
    rejectEffect: string,
    rejectDecision: string,
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    const payloadJson = canonicalJson(payload);
    const normalizedPayload = JSON.parse(payloadJson) as Record<string, unknown>;
    const payloadHash = sha256(payloadJson);
    const proposalId = `proposal_${sha256(canonicalJson({ action, payloadHash, summary })).slice(0, 32)}`;
    return {
      transitionVersion: 'JourneyTransitionV2',
      interactionMode: 'CONFIRM_EXACT',
      type: 'CONFIRM_EXACT',
      description: summary,
      proposal: {
        proposalId,
        action,
        summary,
        effect,
        rejectEffect,
        proceedDecision: action,
        rejectDecision,
        payloadHash,
        payload: normalizedPayload
      }
    };
  }

  private assertNoSecretInput(value: Record<string, unknown>): void {
    const serialized = canonicalJson(value);
    const sensitiveKey = /"(?:password|passwd|pwd|pin|otp|captcha|verificationCode|apiKey|secret|token)"\s*:/i;
    const labelledSecret = /(?:密码|验证码|PIN|password|otp)\s*[:=：]\s*[^\s",}]{2,}/i;
    if (sensitiveKey.test(serialized) || labelledSecret.test(serialized)) {
      throw new HarnessError(400, 'I10_SECRET_INPUT_REJECTED', 'AUTHORIZATION', '检测到疑似秘密信息。请改用本机安全凭据页面或直接在被测页面完成验证。');
    }
  }

  private normalizeExecutionPlan(value: Record<string, unknown>): Record<string, unknown> {
    const mode = String(value.mode ?? value.scheduleType ?? '').trim().toUpperCase();
    if (!['ON_DEMAND', 'ONE_TIME', 'RECURRING'].includes(mode)) {
      throw new HarnessError(400, 'I10_EXECUTION_MODE_REQUIRED', 'CONTRACT', '请明确选择立即执行、单次定时或周期执行。');
    }
    const timezone = String(value.timezone ?? '').trim();
    if (mode !== 'ON_DEMAND') {
      if (!timezone) throw new HarnessError(400, 'I10_TIMEZONE_REQUIRED', 'CONTRACT', '定时或周期执行必须提供IANA时区。');
      try { new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format(new Date()); }
      catch { throw new HarnessError(400, 'I10_TIMEZONE_INVALID', 'CONTRACT', '时区无效，请使用例如Asia/Shanghai的IANA时区。'); }
    }
    if (mode === 'ONE_TIME') {
      const runAt = String(value.runAt ?? '').trim();
      const instant = Date.parse(runAt);
      if (!runAt || !Number.isFinite(instant) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(runAt)) {
        throw new HarnessError(400, 'I10_RUN_AT_INVALID', 'CONTRACT', '单次定时时间必须是带时区偏移的ISO 8601时间。');
      }
      if (instant <= Date.now()) throw new HarnessError(400, 'I10_RUN_AT_NOT_FUTURE', 'DOMAIN', '单次定时时间必须晚于当前时间。');
      return { mode, runAt, timezone, misfirePolicy: 'RUN_ONCE_WITHIN_GRACE', misfireGraceSeconds: 300, maxRetries: 1 };
    }
    if (mode === 'RECURRING') {
      const cronExpression = String(value.cronExpression ?? '').trim().replace(/\s+/g, ' ');
      if (cronExpression.split(' ').length !== 5 || !/^[\d*/?,\- ]+$/.test(cronExpression)) {
        throw new HarnessError(400, 'I10_CRON_INVALID', 'CONTRACT', '周期计划必须提供合法五段Cron表达式。');
      }
      return { mode, cronExpression, timezone, misfirePolicy: 'SKIP', misfireGraceSeconds: 300, maxRetries: 1 };
    }
    return { mode: 'ON_DEMAND' };
  }

  async prepareJourney(input: JourneyPrepareInput, context: RequestContext): Promise<Record<string, unknown>> {
    if (input.requestIntent === 'JOURNEY_RESUME') {
      return this.getJourney({ namespace: input.namespace, journeyId: input.journeyId, sessionRef: input.sessionRef, waitSeconds: 0 });
    }
    const now = nowIso();
    await this.database.write(db => db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`)
      .run(input.namespace, now, now));
    const existing = this.database.read(db => db.prepare(`SELECT * FROM i10_interaction_journeys WHERE namespace=? AND idempotency_key=?`)
      .get(input.namespace, input.idempotencyKey) as InteractionJourneyRow | undefined);
    if (existing) return await this.interactionEnvelope(existing);

    const missingFields: string[] = [];
    const contractMissingFields: string[] = [];
    const semanticMissingFields: string[] = [];
    const references: Record<string, unknown> = {};
    const draftEntryUrl = typeof input.draftJson?.entryUrl === 'string' ? input.draftJson.entryUrl : undefined;
    const draftTargetSystem = typeof input.draftJson?.targetSystem === 'string' ? input.draftJson.targetSystem : undefined;
    const entryUrlValidation = this.validateJourneyEntryUrl(input.entryUrl ?? draftEntryUrl);
    const normalizedUrl = entryUrlValidation.status === 'VALID' ? entryUrlValidation.value : undefined;
    const normalizedTargetSystem = input.targetSystem?.trim() || draftTargetSystem?.trim();
    const credentialReady = input.credentialRef
      ? this.database.read(db => Boolean(db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`)
        .get(input.namespace, input.credentialRef)))
      : false;
    if (input.credentialRef && credentialReady) references.credentialRef = input.credentialRef;
    const targetProfile = input.targetProfileId
      ? this.database.read(db => db.prepare(`SELECT * FROM i10_target_profiles WHERE namespace=? AND target_profile_id=? AND status='ACTIVE'`)
        .get(input.namespace, input.targetProfileId) as TargetProfileRow | undefined)
      : undefined;
    if (targetProfile) references.targetProfileId = targetProfile.target_profile_id;

    let importedAttachmentDraft: CaseDraft | undefined;
    if (input.preparationId && input.ingestJobId) {
      const bindings = this.database.read(db => db.prepare(`
        SELECT preparation.preparation_id,preparation.status AS preparation_status,
               preparation.case_id,preparation.case_version,
               cases.current_version AS case_current_version,cases.status AS case_status,
               version.definition_json,
               job.ingest_job_id,job.status AS ingest_status,job.input_type AS ingest_input_type,
               job.credential_ref AS ingest_credential_ref
        FROM i8_case_preparations preparation
        JOIN cases ON cases.case_id=preparation.case_id AND cases.namespace=preparation.namespace
        JOIN case_versions version ON version.case_id=preparation.case_id AND version.version=preparation.case_version
        JOIN i10_ingest_items item ON item.confirmed_case_id=preparation.case_id
        JOIN i10_ingest_jobs job ON job.ingest_job_id=item.ingest_job_id AND job.namespace=preparation.namespace
        WHERE preparation.namespace=? AND preparation.preparation_id=? AND job.ingest_job_id=?
      `).all(input.namespace,input.preparationId,input.ingestJobId) as ConfirmedAttachmentPreparationRow[]);
      if (bindings.length !== 1) {
        throw new HarnessError(409,'I10_ATTACHMENT_PREPARATION_BINDING_INVALID','CONTRACT',
          '导入任务、已确认案例与准备记录不能构成唯一精确绑定。');
      }
      const binding = bindings[0]!;
      if (binding.preparation_status !== 'PREPARED' || binding.ingest_status !== 'CONFIRMED' ||
          binding.case_status !== 'VALIDATED' || binding.case_current_version !== binding.case_version ||
          binding.ingest_input_type !== input.inputType) {
        throw new HarnessError(409,'I10_ATTACHMENT_PREPARATION_STATE_INVALID','DOMAIN',
          '导入准备尚未处于可作者化的已确认冻结状态。');
      }
      let storedDefinition: Record<string, unknown>;
      try {
        storedDefinition = JSON.parse(binding.definition_json) as Record<string, unknown>;
      } catch {
        throw new HarnessError(409,'I10_ATTACHMENT_CASE_DEFINITION_INVALID','EVIDENCE','已确认案例定义无法验证。');
      }
      if (storedDefinition.ingestJobId !== input.ingestJobId) {
        throw new HarnessError(409,'I10_ATTACHMENT_INGEST_PROVENANCE_INVALID','EVIDENCE','案例定义未绑定当前导入任务。');
      }
      const { ingestJobId: _storedIngestJobId, ...draftDefinition } = storedDefinition;
      const parsedDraft = caseDraftSchema.safeParse(draftDefinition);
      if (!parsedDraft.success || parsedDraft.data.confirmationStatus !== 'CONFIRMED' ||
          parsedDraft.data.source.inputType !== input.inputType) {
        throw new HarnessError(409,'I10_ATTACHMENT_CASE_DEFINITION_INVALID','EVIDENCE','已确认案例定义与导入类型不一致。');
      }
      if (!credentialReady || parsedDraft.data.credentialRef !== input.credentialRef ||
          binding.ingest_credential_ref !== input.credentialRef) {
        throw new HarnessError(409,'I10_ATTACHMENT_CREDENTIAL_BINDING_INVALID','CONTRACT','导入案例的凭据引用未精确绑定。');
      }
      if (!targetProfile || targetProfile.credential_ref !== input.credentialRef ||
          targetProfile.launch_url !== parsedDraft.data.entryUrl) {
        throw new HarnessError(409,'I10_ATTACHMENT_TARGET_PROFILE_BINDING_INVALID','CONTRACT','活跃目标档案与导入案例的入口或凭据不一致。');
      }
      importedAttachmentDraft = parsedDraft.data;
      Object.assign(references, {
        caseId: binding.case_id,
        caseVersion: binding.case_version,
        credentialRef: input.credentialRef,
        ingestJobId: binding.ingest_job_id,
        preparationId: binding.preparation_id,
        targetProfileId: targetProfile.target_profile_id
      });
    }

    let stage = 'COLLECTING_INPUT';
    let status = 'NEEDS_INPUT';
    let allowedActions: string[] = [];
    let nextAction: Record<string, unknown> = { type: 'PROVIDE_INPUT', description: '请补充缺失信息。' };
    let recoverable = 1;
    let validatedDraft: CaseDraft | undefined;
    let boundSemanticAssessment: Record<string, unknown> | undefined;

    if (input.requestIntent === 'HELP') {
      stage = 'COMPLETED'; status = 'COMPLETED';
      nextAction = { type: 'NONE', description: '您可以创建回归案例、查询结果、停用调度，或发送“继续”恢复已有旅程。' };
    } else if (input.requestIntent === 'UNSUPPORTED') {
      stage = 'FAILED_ACTIONABLE'; status = 'FAILED'; recoverable = 1;
      nextAction = { type: 'REFORMULATE', description: '当前请求不属于衡准支持的案例创建、结果查询、调度停用或旅程恢复。' };
    } else if (input.requestIntent === 'RESULT_QUERY') {
      stage = 'COMPLETED'; status = 'COMPLETED';
      if (input.taskId) references.taskId = input.taskId;
      nextAction = { type: 'QUERY_RESULT_INBOX', description: '已接受结果查询，请按任务引用或最近结果收件箱查询。' };
    } else if (input.requestIntent === 'SCHEDULE_DISABLE') {
      if (!input.scheduleId) missingFields.push('scheduleId');
      if (missingFields.length === 0) {
        references.scheduleId = input.scheduleId;
        stage = 'READY_FOR_EXECUTION_DECISION'; status = 'AWAITING_USER';
        allowedActions = ['DISABLE_SCHEDULE', 'CANCEL'];
        nextAction = this.exactProposal(
          'DISABLE_SCHEDULE',
          `停用调度 ${input.scheduleId}`,
          '点击proceed后将停用这一条调度，后续不再自动执行。',
          '点击reject后保持该调度现状。',
          'CANCEL',
          { scheduleId: input.scheduleId }
        );
      }
    } else if (input.requestIntent === 'CASE_AUTHORING') {
      if (importedAttachmentDraft) {
        validatedDraft = importedAttachmentDraft;
        stage = 'PROCESSING_AUTHORING'; status = 'PROCESSING';
        nextAction = { type: 'SUBMIT_AUTHORING', description: '导入案例已确认并精确绑定目标档案，等待从冻结准备提交作者化。', retryAfterSeconds: 0 };
      } else {
        if (!credentialReady) contractMissingFields.push('credentialRef');
        if (input.inputType === 'NONE') contractMissingFields.push('inputType');
      if (input.inputType === 'NATURAL_LANGUAGE') {
        if (!input.naturalLanguage?.trim()) contractMissingFields.push('naturalLanguage');
        if (entryUrlValidation.status === 'MISSING') contractMissingFields.push('I10_ENTRY_URL_REQUIRED');
        if (entryUrlValidation.status === 'INVALID') contractMissingFields.push('I10_ENTRY_URL_INVALID');
        if (!normalizedTargetSystem) contractMissingFields.push('I10_TARGET_SYSTEM_REQUIRED');
        if (!input.draftJson) contractMissingFields.push('I10_DRAFT_REQUIRED');
        if (input.draftJson) {
          const explicitAdapterSelection = explicitAdapterSelectionFromNaturalLanguage(input.naturalLanguage);
          const candidatePayload: Record<string, unknown> = {
            ...completeCaseDraftContract(
              input.draftJson,
              'NATURAL_LANGUAGE',
              input.naturalLanguage ?? '',
              input.sessionRef
            ),
            ...(normalizedUrl ? { entryUrl: normalizedUrl } : {}),
            ...(normalizedTargetSystem ? { targetSystem: normalizedTargetSystem } : {}),
            ...(input.credentialRef && credentialReady ? { credentialRef: input.credentialRef } : {}),
            ...(targetProfile ? {
              targetProfileId: targetProfile.target_profile_id,
              targetProfileVersion: targetProfile.version
            } : {})
          };
          delete candidatePayload.adapterSelection;
          if (explicitAdapterSelection) candidatePayload.adapterSelection = explicitAdapterSelection;
          // An absent address is a collection gap, not an invalid empty-string
          // schema value. Keep the two diagnostics mutually exclusive.
          if (!normalizedUrl) delete candidatePayload.entryUrl;
          const candidate = caseDraftSchema.safeParse(candidatePayload);
          if (!candidate.success) {
            const issues = draftContractIssues(candidate.error).filter(issue =>
              !(entryUrlValidation.status === 'MISSING' && issue === 'I10_ENTRY_URL_INVALID')
            );
            contractMissingFields.push(...issues);
          }
          else {
            contractMissingFields.push(...nonWaivableDraftMissing(candidate.data.missingFields));
            boundSemanticAssessment = bindSemanticAssessment(
              input.semanticAssessment,
              candidate.data,
              input.naturalLanguage ?? '',
              input.inputRevision ?? 1
            );
            semanticMissingFields.push(...semanticQuestions(boundSemanticAssessment));
            if (contractMissingFields.length === 0 && semanticMissingFields.length === 0) {
              validatedDraft = caseDraftSchema.parse({
                ...candidate.data,
                missingFields: [],
                confirmationStatus: 'CONFIRMED'
              });
              boundSemanticAssessment = bindSemanticAssessment(
                input.semanticAssessment,
                validatedDraft,
                input.naturalLanguage ?? '',
                input.inputRevision ?? 1
              );
            }
          }
        }
      } else if (input.inputType === 'CASE_FILE' || input.inputType === 'VIDEO') {
        if (!input.flowiseFileRef) missingFields.push('flowiseFileRef');
        if (!input.originalFilename) missingFields.push('originalFilename');
      }
      missingFields.push(...contractMissingFields, ...semanticMissingFields);
      if (missingFields.length === 0) {
        if (input.inputType === 'NATURAL_LANGUAGE') {
          stage = 'READY_FOR_CASE_APPROVAL'; status = 'AWAITING_USER';
          allowedActions = ['APPROVE_CASE', 'REJECT_CASE'];
          nextAction = this.exactProposal(
            'APPROVE_CASE',
            `冻结案例草案：${validatedDraft?.title ?? '回归案例'}`,
            '点击proceed后写入这一精确草案并进入视觉作者化。',
            '点击reject后在当前旅程中修改草案，不会写入正式案例。',
            'REJECT_CASE',
            {
              draftHash: sha256(canonicalJson(validatedDraft ?? input.draftJson ?? {})),
              semanticAssessmentHash: sha256(canonicalJson(boundSemanticAssessment ?? {})),
              inputRevision: input.inputRevision ?? 1
            }
          );
        } else {
          stage = 'PROCESSING_INGEST'; status = 'PROCESSING';
          nextAction = { type: 'SUBMIT_INGEST', description: '附件已通过入口校验，下一步由受控导入工具处理。', retryAfterSeconds: 3 };
        }
      }
      }
    }

    const uniqueMissing = [...new Set(missingFields)];
    if (uniqueMissing.length > 0) {
      stage = 'NEEDS_INPUT'; status = 'NEEDS_INPUT'; allowedActions = [];
      nextAction = this.inputRequest(
        'INITIAL_CASE_INPUT',
        `请补充：${uniqueMissing.join('、')}`,
        ['入口地址：http://127.0.0.1:18082/portal/login', '用自然语言说明案例步骤和预期结果'],
        uniqueMissing
      );
    }
    // A journey identifier is authoritative only for an explicit resume request.
    // Flowise may retain an older state value inside a long chat session, so every
    // non-resume request must receive a fresh journey identifier.
    const journeyId = opaqueId('journey');
    const safeInput = {
      requestIntent: input.requestIntent,
      inputType: input.inputType,
      interactionContractVersion: input.interactionContractVersion,
      naturalLanguage: input.naturalLanguage,
      entryUrl: normalizedUrl,
      targetSystem: normalizedTargetSystem,
      flowiseFileRef: input.flowiseFileRef,
      originalFilename: input.originalFilename,
      credentialRef: credentialReady ? input.credentialRef : undefined,
      targetProfileId: targetProfile?.target_profile_id,
      preparationId: input.preparationId,
      ingestJobId: input.ingestJobId,
      supportingImages: input.supportingImages,
      scheduleId: input.scheduleId,
      taskId: input.taskId,
      draftJson: validatedDraft ?? input.draftJson
      ,semanticAssessment: boundSemanticAssessment ?? input.semanticAssessment
      ,inputRevision: input.inputRevision ?? 1
      ,contractMissingFields
      ,semanticMissingFields
    };
    await this.database.write(db => {
      db.prepare(`INSERT INTO i10_interaction_journeys(
        journey_id,namespace,session_ref,idempotency_key,request_intent,input_type,stage,status,
        input_envelope_json,missing_fields_json,allowed_actions_json,next_action_json,references_json,
        progress_json,error_json,version,recoverable,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,1,?,?,?)`).run(
        journeyId,input.namespace,input.sessionRef,input.idempotencyKey,input.requestIntent,input.inputType,stage,status,
        canonicalJson(safeInput),canonicalJson(uniqueMissing),canonicalJson(allowedActions),canonicalJson(nextAction),
        canonicalJson(references),canonicalJson({ percent: status === 'COMPLETED' ? 100 : 0, lastActivityAt: now }),
        recoverable,now,now
      );
      db.prepare(`INSERT INTO i10_interaction_events(event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at)
        VALUES (?,?,1,'PREPARED',NULL,?,NULL,?,NULL,?)`)
        .run(opaqueId('journeyevent'),journeyId,stage,canonicalJson({ requestId: context.requestId, missingFields: uniqueMissing }),now);
    });
    if (validatedDraft && status === 'AWAITING_USER') {
      const artifactIds = await this.createDraftArtifacts(input.namespace, journeyId, validatedDraft);
      references.artifactIds = artifactIds;
      await this.database.write(db => db.prepare(`UPDATE i10_interaction_journeys
        SET references_json=?,updated_at=? WHERE journey_id=?`)
        .run(canonicalJson(references), nowIso(), journeyId));
    }
    return this.getJourney({ namespace: input.namespace, journeyId, waitSeconds: 0 });
  }

  async getJourney(input: JourneyGetInput): Promise<Record<string, unknown>> {
    const row = this.database.read(db => input.journeyId
      ? db.prepare(`SELECT * FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?`).get(input.namespace,input.journeyId)
      : db.prepare(`SELECT * FROM i10_interaction_journeys WHERE namespace=? AND session_ref=? ORDER BY updated_at DESC LIMIT 1`).get(input.namespace,input.sessionRef)
    ) as InteractionJourneyRow | undefined;
    if (!row) throw new HarnessError(404,'I10_JOURNEY_NOT_FOUND','DOMAIN','未找到可恢复的交互旅程。');
    return await this.interactionEnvelope(await this.reconcileJourneyProjection(row));
  }

  async submitJourneyInput(input: JourneyInputSubmitInput, context: RequestContext): Promise<Record<string, unknown>> {
    if (Object.keys(input.normalizedInput).length === 0) {
      throw new HarnessError(400,'I10_INPUT_REQUIRED','CONTRACT','当前节点需要输入内容；系统尚未调用后续业务工具。',false,true);
    }
    this.assertNoSecretInput(input.normalizedInput);
    const updated = await this.database.write(db => {
      const row = db.prepare(`SELECT * FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?`)
        .get(input.namespace,input.journeyId) as InteractionJourneyRow | undefined;
      if (!row) throw new HarnessError(404,'I10_JOURNEY_NOT_FOUND','DOMAIN','交互旅程不存在。');
      if (row.version !== input.expectedVersion) throw new HarnessError(409,'I10_JOURNEY_VERSION_CONFLICT','CONCURRENCY','交互旅程版本已变化。',false,true,{currentVersion:row.version,currentStage:row.stage});
      const envelope = JSON.parse(row.input_envelope_json) as Record<string, unknown>;
      if (!['v4','v5','v6'].includes(String(envelope.interactionContractVersion || ''))) {
        throw new HarnessError(409,'I10_JOURNEY_INPUT_CONTRACT_REQUIRED','CONTRACT','当前旅程不支持补充输入合同，请重新开始。');
      }
      let stage = row.stage;
      let status = row.status;
      let nextAction: Record<string, unknown> = {};
      let allowedActions: string[] = [];
      let nextMissingFields: string[] = [];
      const references = JSON.parse(row.references_json) as Record<string, unknown>;
      const nextEnvelope = { ...envelope };
      const currentNextAction = JSON.parse(row.next_action_json) as Record<string, unknown>;
      const currentInputRequest = currentNextAction.inputRequest && typeof currentNextAction.inputRequest === 'object'
        ? currentNextAction.inputRequest as Record<string, unknown>
        : undefined;

      if (input.inputKind === 'INITIAL_CASE_INPUT') {
        if (row.stage !== 'NEEDS_INPUT' || currentInputRequest?.inputKind !== 'INITIAL_CASE_INPUT') {
          throw new HarnessError(409,'I10_INITIAL_CASE_INPUT_NOT_EXPECTED','DOMAIN','当前阶段不接受初始案例补充。');
        }
        const allowedKeys = new Set([
          'inputType','naturalLanguage','entryUrl','targetSystem','flowiseFileRef',
          'originalFilename','credentialRef','supportingImages','draftJson',
          'semanticAssessment','inputRevision'
        ]);
        const unknownKeys = Object.keys(input.normalizedInput).filter(key => !allowedKeys.has(key));
        if (unknownKeys.length > 0) {
          throw new HarnessError(400,'I10_INITIAL_CASE_INPUT_FIELDS_INVALID','CONTRACT','初始案例补充包含当前阶段不接受的字段。',false,true,{fields:unknownKeys.sort()});
        }
        for (const key of allowedKeys) {
          if (key === 'draftJson' || !(key in input.normalizedInput)) continue;
          const value = input.normalizedInput[key];
          if (value !== undefined && value !== null && value !== '') nextEnvelope[key] = value;
        }
        if (input.normalizedInput.draftJson && typeof input.normalizedInput.draftJson === 'object' &&
            !Array.isArray(input.normalizedInput.draftJson)) {
          const priorDraft = nextEnvelope.draftJson && typeof nextEnvelope.draftJson === 'object' &&
            !Array.isArray(nextEnvelope.draftJson)
            ? nextEnvelope.draftJson as Record<string, unknown>
            : {};
          nextEnvelope.draftJson = {
            ...priorDraft,
            ...(input.normalizedInput.draftJson as Record<string, unknown>)
          };
        }
        const inputType = String(nextEnvelope.inputType ?? '').trim();
        if (!['NATURAL_LANGUAGE','CASE_FILE','VIDEO'].includes(inputType)) nextMissingFields.push('inputType');
        const credentialRef = typeof nextEnvelope.credentialRef === 'string' ? nextEnvelope.credentialRef : undefined;
        const credentialReady = credentialRef
          ? Boolean(db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`).get(input.namespace,credentialRef))
          : false;
        if (!credentialReady) {
          delete nextEnvelope.credentialRef;
          delete references.credentialRef;
          nextMissingFields.push('credentialRef');
        } else {
          references.credentialRef = credentialRef;
        }
        if (inputType === 'NATURAL_LANGUAGE') {
          const naturalLanguage = typeof nextEnvelope.naturalLanguage === 'string' ? nextEnvelope.naturalLanguage.trim() : '';
          const explicitAdapterSelection = explicitAdapterSelectionFromNaturalLanguage(naturalLanguage);
          const draftValue = nextEnvelope.draftJson;
          const draft = draftValue && typeof draftValue === 'object' && !Array.isArray(draftValue)
            ? draftValue as Record<string, unknown>
            : undefined;
          const entryUrlValidation = this.validateJourneyEntryUrl(
            typeof nextEnvelope.entryUrl === 'string' ? nextEnvelope.entryUrl : typeof draft?.entryUrl === 'string' ? draft.entryUrl : undefined
          );
          const entryUrl = entryUrlValidation.status === 'VALID' ? entryUrlValidation.value : undefined;
          const targetSystem = String(nextEnvelope.targetSystem ?? draft?.targetSystem ?? '').trim();
          if (!naturalLanguage) nextMissingFields.push('naturalLanguage');
          if (entryUrlValidation.status === 'MISSING') nextMissingFields.push('I10_ENTRY_URL_REQUIRED');
          if (entryUrlValidation.status === 'INVALID') nextMissingFields.push('I10_ENTRY_URL_INVALID');
          if (!targetSystem) nextMissingFields.push('targetSystem');
          if (!draft) nextMissingFields.push('caseDraft');
          let validated: CaseDraft | undefined;
          let boundAssessment: Record<string, unknown> | undefined;
          if (draft) {
            const candidatePayload: Record<string, unknown> = {
              ...completeCaseDraftContract(
                draft,
                'NATURAL_LANGUAGE',
                naturalLanguage,
                row.session_ref
              ),
              ...(entryUrl ? {entryUrl} : {}),
              ...(targetSystem ? {targetSystem} : {}),
              ...(credentialReady ? {credentialRef} : {})
            };
            delete candidatePayload.adapterSelection;
            if (explicitAdapterSelection) candidatePayload.adapterSelection = explicitAdapterSelection;
            // Do not turn an absent URL into a second, misleading schema error.
            if (!entryUrl) delete candidatePayload.entryUrl;
            const candidate = caseDraftSchema.safeParse(candidatePayload);
            if (!candidate.success) {
              const issues = draftContractIssues(candidate.error).filter(issue =>
                !(entryUrlValidation.status === 'MISSING' && issue === 'I10_ENTRY_URL_INVALID')
              );
              nextMissingFields.push(...issues);
            }
            else {
              nextMissingFields.push(...nonWaivableDraftMissing(candidate.data.missingFields));
              const revision = Number.isInteger(Number(nextEnvelope.inputRevision))
                ? Math.max(1, Number(nextEnvelope.inputRevision))
                : 1;
              boundAssessment = bindSemanticAssessment(
                nextEnvelope.semanticAssessment,
                candidate.data,
                naturalLanguage,
                revision
              );
              const semanticGaps = semanticQuestions(boundAssessment);
              nextMissingFields.push(...semanticGaps);
              if (nextMissingFields.length === 0) {
                validated = caseDraftSchema.parse({
                  ...candidate.data,
                  missingFields: [],
                  confirmationStatus: 'CONFIRMED'
                });
                boundAssessment = bindSemanticAssessment(
                  nextEnvelope.semanticAssessment,
                  validated,
                  naturalLanguage,
                  revision
                );
              }
            }
          }
          nextEnvelope.naturalLanguage = naturalLanguage;
          nextEnvelope.entryUrl = entryUrl;
          nextEnvelope.targetSystem = targetSystem;
          nextEnvelope.contractMissingFields = nextMissingFields.filter(field => field.startsWith('I10_') || field.startsWith('crossSourceConflict:'));
          nextEnvelope.semanticMissingFields = nextMissingFields.filter(field => !field.startsWith('I10_') && !field.startsWith('crossSourceConflict:'));
          if (boundAssessment) nextEnvelope.semanticAssessment = boundAssessment;
          if (validated) nextEnvelope.draftJson = validated;
          if (nextMissingFields.length === 0 && validated) {
            stage = 'READY_FOR_CASE_APPROVAL';
            status = 'AWAITING_USER';
            allowedActions = ['APPROVE_CASE','REJECT_CASE'];
            nextAction = this.exactProposal(
              'APPROVE_CASE',
              `冻结案例草案：${validated.title}`,
              '点击proceed后写入这一精确草案并进入视觉作者化。',
              '点击reject后在当前旅程中修改草案，不会写入正式案例。',
              'REJECT_CASE',
              {
                draftHash:sha256(canonicalJson(validated)),
                semanticAssessmentHash:sha256(canonicalJson(boundAssessment ?? {})),
                inputRevision:Number(nextEnvelope.inputRevision ?? 1)
              }
            );
          }
        } else if (inputType === 'CASE_FILE' || inputType === 'VIDEO') {
          if (typeof nextEnvelope.flowiseFileRef !== 'string' || !nextEnvelope.flowiseFileRef.trim()) nextMissingFields.push('flowiseFileRef');
          if (typeof nextEnvelope.originalFilename !== 'string' || !nextEnvelope.originalFilename.trim()) nextMissingFields.push('originalFilename');
          if (nextMissingFields.length === 0) {
            stage = 'PROCESSING_INGEST';
            status = 'PROCESSING';
            nextAction = {type:'SUBMIT_INGEST',description:'附件已通过入口校验，下一步由受控导入工具处理。',retryAfterSeconds:3};
          }
        }
        nextMissingFields = [...new Set(nextMissingFields)];
        if (nextMissingFields.length > 0) {
          stage = 'NEEDS_INPUT';
          status = 'NEEDS_INPUT';
          allowedActions = [];
          nextAction = this.inputRequest(
            'INITIAL_CASE_INPUT',
            `请补充：${nextMissingFields.join('、')}`,
            ['入口地址：http://127.0.0.1:18082/portal/login','用自然语言说明案例步骤和预期结果'],
            nextMissingFields
          );
        }
      } else if (input.inputKind === 'CASE_CORRECTION') {
        if (row.stage !== 'NEEDS_INPUT' || currentInputRequest?.inputKind !== 'CASE_CORRECTION') {
          throw new HarnessError(409,'I10_CASE_CORRECTION_NOT_EXPECTED','DOMAIN','当前阶段不接受案例修改。');
        }
        const incomingDraft = input.normalizedInput.draftJson ?? input.normalizedInput;
        const priorDraft = envelope.draftJson && typeof envelope.draftJson === 'object' && !Array.isArray(envelope.draftJson)
          ? envelope.draftJson as Record<string, unknown>
          : {};
        const rawDraft = {
          ...priorDraft,
          ...(incomingDraft && typeof incomingDraft === 'object' && !Array.isArray(incomingDraft)
            ? incomingDraft as Record<string, unknown>
            : {})
        };
        const currentCredentialRef = typeof envelope.credentialRef === 'string' ? envelope.credentialRef : undefined;
        const candidate = caseDraftSchema.safeParse({
          ...completeCaseDraftContract(
            rawDraft as Record<string, unknown>,
            (String(envelope.inputType || 'NATURAL_LANGUAGE') as 'NATURAL_LANGUAGE' | 'CASE_FILE' | 'VIDEO'),
            String(envelope.naturalLanguage || ''),
            row.session_ref
          ),
          ...(currentCredentialRef ? { credentialRef: currentCredentialRef } : {})
        });
        if (!candidate.success) {
          throw new HarnessError(400,'I10_CASE_CORRECTION_INVALID','CONTRACT','案例修改仍未通过硬性合同校验。',false,true,{
            contractMissingFields:draftContractIssues(candidate.error)
          });
        }
        const hardGaps = nonWaivableDraftMissing(candidate.data.missingFields);
        const naturalLanguage = String(input.normalizedInput.naturalLanguage || envelope.naturalLanguage || '');
        const revision = Number.isInteger(Number(input.normalizedInput.inputRevision))
          ? Math.max(1,Number(input.normalizedInput.inputRevision))
          : Math.max(1,Number(envelope.inputRevision || 1) + 1);
        const boundAssessment = bindSemanticAssessment(
          input.normalizedInput.semanticAssessment,
          candidate.data,
          naturalLanguage,
          revision
        );
        const semanticGaps = semanticQuestions(boundAssessment);
        if (hardGaps.length > 0 || semanticGaps.length > 0) {
          throw new HarnessError(400,'I10_CASE_CORRECTION_INVALID','CONTRACT','案例修改仍未达到冻结条件。',false,true,{
            contractMissingFields:hardGaps,
            semanticMissingFields:semanticGaps
          });
        }
        const confirmedCandidate = caseDraftSchema.parse({
          ...candidate.data,
          missingFields:[],
          confirmationStatus:'CONFIRMED'
        });
        nextEnvelope.draftJson = confirmedCandidate;
        nextEnvelope.entryUrl = confirmedCandidate.entryUrl;
        nextEnvelope.targetSystem = confirmedCandidate.targetSystem;
        nextEnvelope.naturalLanguage = naturalLanguage;
        nextEnvelope.inputRevision = revision;
        nextEnvelope.semanticAssessment = bindSemanticAssessment(
          input.normalizedInput.semanticAssessment,
          confirmedCandidate,
          naturalLanguage,
          revision
        );
        nextEnvelope.contractMissingFields = [];
        nextEnvelope.semanticMissingFields = [];
        stage = 'READY_FOR_CASE_APPROVAL';
        status = 'AWAITING_USER';
        allowedActions = ['APPROVE_CASE','REJECT_CASE'];
        nextAction = this.exactProposal(
          'APPROVE_CASE',
          `冻结修改后的案例草案：${candidate.data.title}`,
          '点击proceed后写入这一精确草案并进入视觉作者化。',
          '点击reject后继续修改，不会写入正式案例。',
          'REJECT_CASE',
          {
            draftHash: sha256(canonicalJson(confirmedCandidate)),
            semanticAssessmentHash: sha256(canonicalJson(nextEnvelope.semanticAssessment)),
            inputRevision: revision
          }
        );
      } else if (input.inputKind === 'EXECUTION_PLAN' || input.inputKind === 'REPAIR_EXECUTION_PLAN') {
        if (row.stage !== 'NEEDS_INPUT' || currentInputRequest?.inputKind !== input.inputKind) {
          throw new HarnessError(409,'I10_EXECUTION_INPUT_NOT_EXPECTED','DOMAIN','当前阶段不接受执行计划。');
        }
        const plan = this.normalizeExecutionPlan(input.normalizedInput);
        // Delivery activation and the next Flowise input can be separate chat
        // executions. Refresh the exact server-owned activation tuple here so
        // a journey projected just before activation cannot carry a stale
        // reference set into an execution decision.
        const activated = db.prepare(`
          SELECT candidate_id,activated_plan_id FROM (
            SELECT c.candidate_id,d.activated_plan_id,d.created_at,1 AS priority
            FROM i8_executable_plans p
            JOIN i8_script_candidates c ON c.executable_plan_id=p.executable_plan_id
            JOIN i8_script_delivery_decisions d
              ON d.candidate_id=c.candidate_id AND d.choice='ACTIVATE'
            WHERE p.namespace=? AND p.preparation_id=?
            UNION ALL
            SELECT rp.repair_candidate_id AS candidate_id,rd.activated_plan_id,rd.created_at,2 AS priority
            FROM i8_script_patch_proposals rp
            JOIN i8_repair_decisions rd ON rd.proposal_id=rp.proposal_id AND rd.choice='ACTIVATE'
            JOIN i8_script_candidates base ON base.candidate_id=rp.base_candidate_id
            JOIN i8_executable_plans p ON p.executable_plan_id=base.executable_plan_id
            WHERE rp.namespace=? AND p.preparation_id=? AND rp.status='ACTIVATED'
          ) ORDER BY priority DESC,created_at DESC LIMIT 1
        `).get(
          input.namespace,references.preparationId,input.namespace,references.preparationId
        ) as { candidate_id:string; activated_plan_id:string } | undefined;
        if (!activated || !activated.activated_plan_id || !activated.candidate_id ||
            (typeof references.candidateId === 'string' && references.candidateId !== activated.candidate_id)) {
          throw new HarnessError(409,'I10_EXECUTION_ACTIVATION_BINDING_REQUIRED','EVIDENCE','执行计划尚未绑定唯一的已激活候选和计划。',false,true);
        }
        references.candidateId = activated.candidate_id;
        references.planId = activated.activated_plan_id;
        const action = plan.mode === 'ON_DEMAND'
          ? 'RUN_ON_DEMAND'
          : plan.mode === 'ONE_TIME'
            ? 'CREATE_ONE_TIME_SCHEDULE'
            : 'CREATE_RECURRING_SCHEDULE';
        references.executionPlan = plan;
        references.executionPlanKind = input.inputKind;
        stage = 'READY_FOR_EXECUTION_DECISION';
        status = 'AWAITING_USER';
        allowedActions = [action,'REVISE_EXECUTION_PLAN'];
        nextAction = this.exactProposal(
          action,
          plan.mode === 'ON_DEMAND'
            ? '立即执行一次当前持证脚本'
            : plan.mode === 'ONE_TIME'
              ? `在 ${String(plan.runAt)} 执行一次`
              : `按 ${String(plan.cronExpression)}（${String(plan.timezone)}）周期执行`,
          '点击proceed后才会创建这一精确运行或调度。',
          '点击reject后返回执行计划修改，不创建任务或调度。',
          'REVISE_EXECUTION_PLAN',
          plan
        );
      } else {
        throw new HarnessError(409,'I10_JOURNEY_INPUT_KIND_NOT_AVAILABLE','DOMAIN','当前版本尚未为该输入类型建立可提交状态。');
      }

      const nextVersion = row.version + 1;
      const now = nowIso();
      db.prepare(`UPDATE i10_interaction_journeys SET stage=?,status=?,input_envelope_json=?,missing_fields_json=?,allowed_actions_json=?,next_action_json=?,references_json=?,progress_json=?,version=?,updated_at=? WHERE journey_id=?`)
        .run(stage,status,canonicalJson(nextEnvelope),canonicalJson(nextMissingFields),canonicalJson(allowedActions),canonicalJson(nextAction),canonicalJson(references),canonicalJson({percent:0,lastActivityAt:now}),nextVersion,now,row.journey_id);
      const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`).get(row.journey_id) as {value:number}).value) + 1;
      db.prepare(`INSERT INTO i10_interaction_events(event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at)
        VALUES (?,?,?,'INPUT_SUBMITTED',?,?,NULL,?,?,?)`).run(
          opaqueId('journeyevent'),row.journey_id,sequence,row.stage,stage,
          canonicalJson({requestId:context.requestId,inputKind:input.inputKind,normalizedHash:sha256(canonicalJson(input.normalizedInput))}),
          input.submissionRef,now
        );
      return db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`).get(row.journey_id) as InteractionJourneyRow;
    });
    let finalRow = updated;
    if (updated.stage === 'READY_FOR_CASE_APPROVAL') {
      const envelope = JSON.parse(updated.input_envelope_json) as Record<string, unknown>;
      const draft = caseDraftSchema.safeParse(envelope.draftJson);
      const references = JSON.parse(updated.references_json) as Record<string, unknown>;
      if (draft.success && !Array.isArray(references.artifactIds)) {
        references.artifactIds = await this.createDraftArtifacts(input.namespace, updated.journey_id, draft.data);
        const updatedAt = nowIso();
        finalRow = await this.database.write(db => {
          db.prepare(`UPDATE i10_interaction_journeys SET references_json=?,updated_at=? WHERE journey_id=?`)
            .run(canonicalJson(references), updatedAt, updated.journey_id);
          return db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`)
            .get(updated.journey_id) as InteractionJourneyRow;
        });
      }
    }
    return await this.interactionEnvelope(finalRow);
  }

  async decideJourney(input: JourneyDecisionSubmitInput, context: RequestContext): Promise<Record<string, unknown>> {
    const allowedByStage: Record<string, string[]> = {
      READY_FOR_CASE_APPROVAL: ['APPROVE_CASE','REJECT_CASE','CANCEL'],
      READY_FOR_SCRIPT_ACTIVATION: ['ACTIVATE_SCRIPT','REJECT_SCRIPT','CANCEL'],
      READY_FOR_EXECUTION_DECISION: ['RUN_ON_DEMAND','CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE','REVISE_EXECUTION_PLAN','DEFER_EXECUTION','DISABLE_SCHEDULE','CANCEL'],
      AWAITING_RUNTIME_VERIFICATION: ['COMPLETE_RUNTIME_VERIFICATION','ABORT_RUNTIME_VERIFICATION','CANCEL'],
      READY_FOR_REPAIR_ACTIVATION: ['ACTIVATE_REPAIR','REJECT_REPAIR','CANCEL']
    };
    const updated = await this.database.write(db => {
      const row = db.prepare(`SELECT * FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?`)
        .get(input.namespace,input.journeyId) as InteractionJourneyRow | undefined;
      if (!row) throw new HarnessError(404,'I10_JOURNEY_NOT_FOUND','DOMAIN','交互旅程不存在。');
      if (row.version !== input.expectedVersion) throw new HarnessError(409,'I10_JOURNEY_VERSION_CONFLICT','CONCURRENCY','交互旅程版本已变化。',false,true,{currentVersion:row.version,currentStage:row.stage});
      const allowed = allowedByStage[row.stage] ?? [];
      if (!allowed.includes(input.decision)) throw new HarnessError(409,'I10_JOURNEY_DECISION_NOT_ALLOWED','DOMAIN','当前阶段不接受该决定。',false,true,{currentStage:row.stage,allowedActions:allowed});
      const inputEnvelope = JSON.parse(row.input_envelope_json) as Record<string, unknown>;
      const currentNextAction = JSON.parse(row.next_action_json) as Record<string, unknown>;
      const proposal = currentNextAction.proposal && typeof currentNextAction.proposal === 'object'
        ? currentNextAction.proposal as Record<string, unknown>
        : undefined;
      if (['v4','v5','v6'].includes(String(inputEnvelope.interactionContractVersion || '')) && proposal) {
        const frozenPayload = proposal.payload && typeof proposal.payload === 'object' && !Array.isArray(proposal.payload)
          ? proposal.payload as Record<string, unknown>
          : undefined;
        if (!frozenPayload) {
          throw new HarnessError(409,'I10_PROPOSAL_PAYLOAD_INTEGRITY_FAILED','EVIDENCE','冻结方案缺少可校验的规范化载荷，请重新查看或重新发起当前操作。',false,true);
        }
        const frozenPayloadJson = canonicalJson(frozenPayload);
        const recomputedPayloadHash = sha256(frozenPayloadJson);
        if (proposal.payloadHash !== recomputedPayloadHash) {
          throw new HarnessError(409,'I10_PROPOSAL_PAYLOAD_INTEGRITY_FAILED','EVIDENCE','冻结方案载荷与Hash不一致，请重新查看或重新发起当前操作。',false,true);
        }
        if (input.proposalId !== proposal.proposalId || input.payloadHash !== recomputedPayloadHash) {
          throw new HarnessError(409,'I10_PROPOSAL_REFERENCE_MISMATCH','CONCURRENCY','确认对象已经变化，请重新查看当前方案后再选择。',false,true);
        }
        if (![proposal.proceedDecision,proposal.rejectDecision].includes(input.decision)) {
          throw new HarnessError(409,'I10_PROPOSAL_DECISION_MISMATCH','DOMAIN','按钮决定与冻结方案不一致。',false,true);
        }
        // Native Flowise currently sends an empty compatibility payload and
        // confirms the server-owned proposal by ID and Hash. Any caller that
        // does submit payload fields must submit the complete frozen value;
        // partial values and extra technical references are rejected.
        if (Object.keys(input.payload).length > 0 && canonicalJson(input.payload) !== frozenPayloadJson) {
          throw new HarnessError(409,'I10_PROPOSAL_PAYLOAD_MISMATCH','CONCURRENCY','提交载荷与冻结方案不一致，请重新查看当前方案后再选择。',false,true);
        }
      }
      const nextVersion = row.version + 1;
      const now = nowIso();
      const decisionEventId = opaqueId('journeyevent');
      let stage = row.stage;
      let status = row.status;
      let actions: string[] = [];
      let nextAction: Record<string, unknown> = {};
      const references = JSON.parse(row.references_json) as Record<string, unknown>;
      const executionDecision = ['RUN_ON_DEMAND','CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE'].includes(input.decision);
      const executionBinding = executionDecision ? {
        namespace:row.namespace,
        journeyId:row.journey_id,
        preparationId:references.preparationId,
        caseId:references.caseId,
        planId:references.planId,
        candidateId:references.candidateId
      } : undefined;
      if (executionBinding && Object.values(executionBinding).some(value => typeof value !== 'string' || !value)) {
        throw new HarnessError(409,'I10_JOURNEY_EXECUTION_BINDING_INCOMPLETE','EVIDENCE','当前执行提案未绑定唯一准备、案例、计划和候选，禁止创建运行或调度。',false,true);
      }
      if (executionBinding) references.confirmedDecisionEventId = decisionEventId;
      if (input.decision === 'REJECT_CASE' && ['v4','v5','v6'].includes(String(inputEnvelope.interactionContractVersion || ''))) {
        stage = 'NEEDS_INPUT'; status = 'NEEDS_INPUT';
        nextAction = this.inputRequest(
          'CASE_CORRECTION',
          '请用自然语言说明需要修改的内容。',
          ['将入口地址改为……；把第6步改为……'],
          ['caseCorrection']
        );
      } else if (input.decision === 'REVISE_EXECUTION_PLAN') {
        stage = 'NEEDS_INPUT';
        status = 'NEEDS_INPUT';
        const executionInputKind = references.executionPlanKind === 'REPAIR_EXECUTION_PLAN'
          ? 'REPAIR_EXECUTION_PLAN'
          : 'EXECUTION_PLAN';
        nextAction = this.inputRequest(
          executionInputKind,
          '请重新说明立即执行、单次定时或周期执行计划。',
          ['立即执行','2026-07-25 10:00 在 Asia/Shanghai 执行一次','每个工作日 09:00，时区 Asia/Shanghai'],
          ['executionMode']
        );
      } else if (input.decision === 'CANCEL' || input.decision.startsWith('REJECT_')) {
        stage = input.decision === 'CANCEL' ? 'CANCELLED' : 'FAILED_ACTIONABLE';
        status = input.decision === 'CANCEL' ? 'CANCELLED' : 'FAILED';
        nextAction = { type: 'NONE', description: input.decision === 'CANCEL' ? '本次操作已取消。' : '本次候选已拒绝，可修改输入后创建新旅程。' };
      } else if (input.decision === 'APPROVE_CASE') {
        stage = 'PROCESSING_AUTHORING'; status = 'PROCESSING';
        nextAction = { type: 'CALL_CASE_PREPARE', description: '案例草案已批准，下一步提交案例并启动视觉作者化。', retryAfterSeconds: 3 };
      } else if (input.decision === 'ACTIVATE_SCRIPT') {
        if (['v4','v5','v6'].includes(String(inputEnvelope.interactionContractVersion || ''))) {
          stage = 'NEEDS_INPUT'; status = 'NEEDS_INPUT';
          nextAction = this.inputRequest(
            'EXECUTION_PLAN',
            '脚本已激活，请说明立即执行、单次定时或周期执行。',
            ['立即执行','2026-07-25 10:00 在 Asia/Shanghai 执行一次','每个工作日 09:00，时区 Asia/Shanghai'],
            ['executionMode']
          );
        } else {
          stage = 'READY_FOR_EXECUTION_DECISION'; status = 'AWAITING_USER';
          actions = ['RUN_ON_DEMAND','CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE','DEFER_EXECUTION','CANCEL'];
          nextAction = { type: 'CONFIRM_EXECUTION', description: '脚本已激活，请选择立即、单次定时或周期执行。' };
        }
      } else if (input.decision === 'RUN_ON_DEMAND') {
        stage = 'RUNNING'; status = 'PROCESSING';
        nextAction = { type: 'CALL_RUN_SUBMIT', description: '立即回归已确认，正在执行。', retryAfterSeconds: 5 };
      } else if (input.decision === 'CREATE_ONE_TIME_SCHEDULE' || input.decision === 'CREATE_RECURRING_SCHEDULE') {
        stage = 'COMPLETED'; status = 'COMPLETED';
        nextAction = { type: 'CALL_SCHEDULE_CREATE', description: '调度参数已确认并等待确定性创建。' };
      } else if (input.decision === 'DEFER_EXECUTION') {
        stage = 'COMPLETED'; status = 'COMPLETED';
        nextAction = { type: 'NONE', description: '脚本已保留，暂不执行。' };
      } else if (input.decision === 'DISABLE_SCHEDULE') {
        stage = 'COMPLETED'; status = 'COMPLETED';
        nextAction = { type: 'CALL_SCHEDULE_DISABLE', description: '停用决定已确认。' };
      } else if (input.decision === 'COMPLETE_RUNTIME_VERIFICATION') {
        stage = 'RUNNING'; status = 'PROCESSING';
        nextAction = { type: 'RESUME_RUN', description: '人工验证已完成，正在恢复浏览器任务。', retryAfterSeconds: 3 };
      } else if (input.decision === 'ABORT_RUNTIME_VERIFICATION') {
        stage = 'FAILED_ACTIONABLE'; status = 'FAILED';
        nextAction = { type: 'NONE', description: '用户已中止人工验证，运行失败关闭。' };
      } else if (input.decision === 'ACTIVATE_REPAIR') {
        stage = 'RUNNING'; status = 'PROCESSING';
        nextAction = { type: 'CALL_REPAIR_RERUN', description: '持证修复候选已批准，正在复跑。', retryAfterSeconds: 5 };
      }
      // Journey references are server-owned and are populated only while the
      // authoritative preparation, candidate, run, schedule or challenge is
      // resolved. Decision payloads must never inject opaque references.
      db.prepare(`UPDATE i10_interaction_journeys SET stage=?,status=?,allowed_actions_json=?,next_action_json=?,references_json=?,progress_json=?,version=?,updated_at=? WHERE journey_id=?`)
        .run(stage,status,canonicalJson(actions),canonicalJson(nextAction),canonicalJson(references),canonicalJson({percent:status==='COMPLETED'?100:0,lastActivityAt:now}),nextVersion,now,row.journey_id);
      const sequence = Number((db.prepare(`SELECT COALESCE(MAX(sequence),0) value FROM i10_interaction_events WHERE journey_id=?`).get(row.journey_id) as {value:number}).value) + 1;
      db.prepare(`INSERT INTO i10_interaction_events(event_id,journey_id,sequence,event_type,from_stage,to_stage,decision,safe_payload_json,confirmation_ref,created_at)
        VALUES (?,?,?,'DECISION',?,?,?,?,?,?)`).run(
          decisionEventId,row.journey_id,sequence,row.stage,stage,input.decision,
          canonicalJson({
            requestId: context.requestId,
            payloadKeys: Object.keys(input.payload).sort(),
            ...(proposal ? { proposalId:proposal.proposalId,payloadHash:proposal.payloadHash } : {}),
            ...(executionBinding ? { executionBinding } : {})
          }),input.confirmationRef,now
        );
      return db.prepare(`SELECT * FROM i10_interaction_journeys WHERE journey_id=?`).get(row.journey_id) as InteractionJourneyRow;
    });
    return await this.interactionEnvelope(updated);
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
      if (input.journeyId) {
        const journey = db.prepare(`SELECT references_json FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?`)
          .get(input.namespace,input.journeyId) as { references_json: string } | undefined;
        if (!journey) throw new HarnessError(404,'I10_JOURNEY_NOT_FOUND','DOMAIN','案例对应的交互旅程不存在。');
        const references = JSON.parse(journey.references_json) as Record<string, unknown>;
        references.caseId = caseId;
        references.preparationId = preparationId;
        db.prepare(`UPDATE i10_interaction_journeys
          SET references_json=?,stage='PROCESSING_AUTHORING',status='PROCESSING',
              next_action_json=?,updated_at=?
          WHERE namespace=? AND journey_id=?`)
          .run(
            canonicalJson(references),
            // case_prepare is a durable write boundary.  The native Flowise
            // Tool execution can end immediately after this response, before
            // its following authoring_submit node runs.  Do not misrepresent
            // that state as an active candidate build: a recovery execution
            // must first submit authoring from this frozen preparation.
            canonicalJson({type:'SUBMIT_AUTHORING',description:'案例已写入，等待从冻结案例提交作者化。',retryAfterSeconds:3}),
            now,input.namespace,input.journeyId
          );
      }
      return response;
    });
  }

  getIngest(namespace: string, ingestJobId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`SELECT * FROM i10_ingest_jobs WHERE namespace=? AND ingest_job_id=?`).get(namespace, ingestJobId) as any;
      if (!row) throw new HarnessError(404, 'I10_INGEST_JOB_NOT_FOUND', 'DOMAIN', '导入任务不存在。');
      const items = db.prepare(`SELECT item.ingest_item_id,item.ordinal,
        COALESCE(rev.draft_json,item.draft_json) draft_json,COALESCE(rev.draft_hash,item.draft_hash) draft_hash,
        decision.decision user_decision
        FROM i10_ingest_items item
        LEFT JOIN i10_ingest_item_revisions rev ON rev.revision_id=(
          SELECT revision_id FROM i10_ingest_item_revisions WHERE ingest_item_id=item.ingest_item_id ORDER BY revision_no DESC LIMIT 1
        )
        LEFT JOIN i10_ingest_item_decisions decision
          ON decision.ingest_job_id=item.ingest_job_id AND decision.ingest_item_id=item.ingest_item_id
        WHERE item.ingest_job_id=? ORDER BY item.ordinal`).all(ingestJobId) as any[];
      const fieldMappings = db.prepare(`SELECT source_field sourceField,canonical_field canonicalField,match_type matchType FROM i10_ingest_field_mappings WHERE ingest_job_id=? ORDER BY source_field`).all(ingestJobId) as any[];
      const errors = db.prepare(`SELECT error.error_id errorId,error.ordinal,error.error_code errorCode,error.field_name fieldName,error.record_hash recordHash,CASE WHEN resolution.error_id IS NULL THEN 0 ELSE 1 END resolved FROM i10_ingest_errors error LEFT JOIN i10_ingest_error_resolutions resolution ON resolution.error_id=error.error_id WHERE error.ingest_job_id=? ORDER BY error.ordinal,error.error_code`).all(ingestJobId) as any[];
      return { ingestJobId, inputType: row.input_type, status: row.status, version: row.version, confidence: row.confidence,
        missingFields: JSON.parse(row.missing_fields_json), draftCount: row.draft_count, errorCode: row.error_code ?? undefined,
        items: items.map(item => ({ ordinal: item.ordinal, draftHash: item.draft_hash, draft: JSON.parse(item.draft_json), userDecision:item.user_decision ?? undefined })),
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
      const suppliedDecisions = input.itemDecisions.length > 0
        ? input.itemDecisions
        : current.length === 1
          ? [{ ordinal:Number(current[0]!.item.ordinal), decision:'CONFIRM' as const }]
          : [];
      const suppliedOrdinals = suppliedDecisions.map(decision=>decision.ordinal);
      const currentOrdinals = current.map(value=>Number(value.item.ordinal));
      if (new Set(suppliedOrdinals).size !== suppliedOrdinals.length
        || suppliedOrdinals.length !== currentOrdinals.length
        || currentOrdinals.some(ordinal=>!suppliedOrdinals.includes(ordinal))) {
        throw new HarnessError(422,'I10_INGEST_ITEM_DECISIONS_REQUIRED','CONTRACT','多案例导入必须逐项确认或拒绝全部案例。',false,true,{ordinals:currentOrdinals});
      }
      const selected=current.filter(value=>suppliedDecisions.find(decision=>decision.ordinal===Number(value.item.ordinal))?.decision==='CONFIRM');
      if(selected.length===0)throw new HarnessError(422,'I10_INGEST_NO_ITEM_CONFIRMED','CONTRACT','至少需要确认一个案例；若要放弃全部案例，请拒绝整个导入任务。',false,true);
      const incomplete=selected.filter(value=>value.draft.missingFields.length>0||!value.draft.targetSystem||!value.draft.entryUrl||!value.draft.credentialRef);
      if(incomplete.length>0)throw new HarnessError(409,'I10_INGEST_INFORMATION_INCOMPLETE','DOMAIN','仍有案例信息缺口，禁止确认。',false,true,{ordinals:incomplete.map(value=>value.item.ordinal)});
      for (const value of selected) {
        const exists = db.prepare(`SELECT 1 FROM i10_credential_refs WHERE namespace=? AND credential_ref=?`).get(input.namespace,value.draft.credentialRef as string);
        if (!exists) throw new HarnessError(404,'I10_CREDENTIAL_REF_NOT_FOUND','DOMAIN','凭据引用不存在。');
      }
      const insertDecision=db.prepare(`INSERT INTO i10_ingest_item_decisions(
        decision_id,ingest_job_id,ingest_item_id,ordinal,decision,confirmation_ref,expected_job_version,created_at
      ) VALUES (?,?,?,?,?,?,?,?)`);
      for(const value of current){
        const decision=suppliedDecisions.find(item=>item.ordinal===Number(value.item.ordinal))!;
        insertDecision.run(opaqueId('ingestdecision'),input.ingestJobId,value.item.ingest_item_id,
          Number(value.item.ordinal),decision.decision,input.confirmationRef,input.expectedVersion,now);
      }
      const created=selected.map(({item,draft})=>{
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
      return finish({ingestJobId:input.ingestJobId,status:'CONFIRMED',version:Number(job.version)+1,
        confirmedCount:selected.length,rejectedCount:current.length-selected.length,cases:created});
    });
  }

  async claimVideoIngest(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db=>{
      const now=nowIso();
      db.prepare(`UPDATE i10_ingest_jobs SET lease_owner=NULL,lease_expires_at=NULL,version=version+1,updated_at=?
        WHERE input_type='VIDEO' AND status='PROCESSING' AND lease_owner IS NOT NULL
          AND lease_expires_at IS NOT NULL AND lease_expires_at<=?`).run(now,now);
      const row=db.prepare(`SELECT * FROM i10_ingest_jobs WHERE input_type='VIDEO' AND status='PROCESSING' AND lease_owner IS NULL ORDER BY created_at LIMIT 1`).get() as any;
       if(!row)return{status:'EMPTY'};
       let filePath:string;
       try {
         filePath=this.resolveAttachment(row.flowise_file_ref,row.original_filename);
       } catch(error) {
         const errorCode=error instanceof HarnessError?error.errorCode:'I10_VIDEO_ATTACHMENT_RESOLUTION_FAILED';
         const terminalAttachmentFailure=new Set([
           'I10_FLOWISE_ATTACHMENT_NOT_FOUND',
           'I10_FLOWISE_ATTACHMENT_ESCAPE_REJECTED',
           'I10_FLOWISE_ATTACHMENT_NAME_MISMATCH',
           'I10_ATTACHMENT_FILENAME_REQUIRED',
           'I10_ATTACHMENT_FILENAME_INVALID'
         ]);
         if(!terminalAttachmentFailure.has(errorCode))throw error;
         db.prepare(`UPDATE i10_ingest_jobs SET status='FAILED',error_code=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=? WHERE ingest_job_id=? AND status='PROCESSING'`)
           .run(errorCode,now,now,row.ingest_job_id);
         return{status:'SKIPPED_FAILED',ingestJobId:row.ingest_job_id,errorCode};
       }
       const expiresAt=new Date(Date.now()+10*60_000).toISOString();
       db.prepare(`UPDATE i10_ingest_jobs SET lease_owner=?,lease_expires_at=?,updated_at=? WHERE ingest_job_id=?`).run(workerId,expiresAt,now,row.ingest_job_id);
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
    if (input.controllerInvocation.invocation !== 'REAL' || input.controllerInvocation.provider !== 'openai-compatible' ||
      !input.controllerInvocation.model || input.controllerInvocation.inputTokens < 0 || input.controllerInvocation.outputTokens < 0) {
      throw new HarnessError(409,'I10_VIDEO_CONTROLLER_EVIDENCE_REQUIRED','DOMAIN','视频导入必须绑定一次真实主控模型OCR事实筛选记录。',false,true);
    }
    const evidenceRoot = path.resolve(this.productRoot, '.data', 'video-ingest', input.ingestJobId, 'redacted');
    for (const frame of input.frames) {
      const observation = frame.visualObservation as Record<string, unknown>;
      if (observation.invocation !== 'LOCAL' || observation.provider !== 'local-onnx-ocr' ||
        observation.engine !== 'PPU_PADDLE_OCR_V5_ONNX_CPU' ||
        typeof observation.modelSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(observation.modelSha256) ||
        observation.deterministicTimelineVersion !== 'OCR_FRAME_DIFF_V1' ||
        typeof observation.recognizedRegionCount !== 'number' || !Number.isInteger(observation.recognizedRegionCount) ||
        observation.requiresUserConfirmation !== true) {
        throw new HarnessError(409,'I10_VIDEO_OCR_EVIDENCE_REQUIRED','DOMAIN','视频导入必须绑定本机PP-OCRv5、模型Hash和需人工确认的确定性文字变化时间线。',false,true);
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
      db.prepare(`INSERT INTO i10_video_controller_invocations(
        invocation_id,ingest_job_id,invocation_type,provider,model,input_tokens,output_tokens,created_at
      ) VALUES (?,?,?,?,?,?,?,?)`).run(opaqueId('modelinvocation'),input.ingestJobId,input.controllerInvocation.invocation,
        input.controllerInvocation.provider,input.controllerInvocation.model,input.controllerInvocation.inputTokens,
        input.controllerInvocation.outputTokens,now);
      const itemInsert=db.prepare(`INSERT INTO i10_ingest_items(ingest_item_id,ingest_job_id,ordinal,draft_json,draft_hash,confidence,missing_fields_json,created_at) VALUES (?,?,?,?,?,?,?,?)`);
      const hints=JSON.parse(String(job.hints_json));const enrichedDrafts=input.drafts.map(draft=>this.enrichDraftWithImageFacts(String(job.namespace),hints.supportingImageIngestId,draft));
      enrichedDrafts.forEach((draft,index)=>{const json=canonicalJson(draft);itemInsert.run(opaqueId('ingestitem'),input.ingestJobId,index+1,json,sha256(json),draft.confidence,canonicalJson(draft.missingFields),now);});
      const missing=[...new Set(enrichedDrafts.flatMap(draft=>draft.missingFields))];const confidence=enrichedDrafts.reduce((sum,draft)=>sum+draft.confidence,0)/enrichedDrafts.length;
      db.prepare(`UPDATE i10_ingest_jobs SET status='WAITING_USER',confidence=?,missing_fields_json=?,draft_count=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE ingest_job_id=?`).run(confidence,canonicalJson(missing),input.drafts.length,now,input.ingestJobId);
      return{ingestJobId:input.ingestJobId,status:'WAITING_USER',version:Number(job.version)+1,frameCount:input.frames.length,draftCount:input.drafts.length,controllerInvocation:input.controllerInvocation};
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
      const attachment = this.resolveAttachmentWithCanonicalName(image.flowiseFileRef, image.originalFilename);
      const filePath = attachment.filePath;
      const extension = path.extname(attachment.originalFilename).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new HarnessError(400, 'I10_IMAGE_FORMAT_UNSUPPORTED', 'CONTRACT', '补充图片只支持 PNG、JPEG 和 WebP。');
      const bytes = fs.readFileSync(filePath);
      if (bytes.byteLength <= 0 || bytes.byteLength > 20 * 1024 * 1024) throw new HarnessError(413, 'I10_IMAGE_SIZE_INVALID', 'CONTRACT', '单张补充图片必须小于等于20MiB。');
      const validMagic = (extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
        || (['.jpg','.jpeg'].includes(extension) && bytes[0] === 0xff && bytes[1] === 0xd8)
        || (extension === '.webp' && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP');
      if (!validMagic) throw new HarnessError(400, 'I10_IMAGE_CONTENT_MISMATCH', 'CONTRACT', '补充图片扩展名与实际内容不一致。');
      return { ...image, originalFilename: attachment.originalFilename, ordinal: index + 1, filePath, size: bytes.byteLength, sourceSha256: sha256(bytes) };
    });
    const totalSize = resolved.reduce((sum, image) => sum + image.size, 0);
    if (totalSize > 100 * 1024 * 1024) throw new HarnessError(413, 'I10_IMAGE_BATCH_SIZE_INVALID', 'CONTRACT', '补充图片总大小不得超过100MiB。');
    const imageIngestId = opaqueId('imageingest');
    const now = nowIso();
    await this.database.write(db => {
      db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,now,now);
      db.prepare(`INSERT INTO i10_image_ingest_jobs(image_ingest_id,namespace,idempotency_key,source_ref,primary_input_type,primary_text_hash,primary_text_safe,credential_ref,status,image_count,total_size_bytes,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'PROCESSING',?,?,1,?,?)`)
        .run(imageIngestId,input.namespace,input.idempotencyKey,input.sourceRef,input.primaryInputType,input.primaryText ? sha256(input.primaryText) : null,input.primaryText ?? null,input.credentialRef ?? null,resolved.length,totalSize,now,now);
      const insert = db.prepare(`INSERT INTO i10_supporting_images(image_id,image_ingest_id,ordinal,flowise_file_ref,original_filename,purpose_hint,source_sha256,source_size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const image of resolved) insert.run(opaqueId('image'),imageIngestId,image.ordinal,image.flowiseFileRef,image.originalFilename,image.purposeHint ?? null,image.sourceSha256,image.size,now);
    });
    const response = {
      imageIngestId,
      status: 'PROCESSING',
      version: 1,
      imageCount: resolved.length,
      primaryInputType: input.primaryInputType,
      progressStage: 'QUEUED',
      progressPercent: 5,
      processedImageCount: 0,
      elapsedSeconds: 0,
      idleSeconds: 0,
      maxWaitSeconds: 600,
      timeoutStatus: 'NOT_STARTED',
      progressMessage: '图片任务已进入本机处理队列，等待Worker领取。'
    };
    return this.rememberIdempotency(input.namespace,'i10_image_ingest_submit',input.idempotencyKey,input,response,'I10_IMAGE_INGEST',imageIngestId);
  }

  async getImageIngest(namespace: string, imageIngestId: string): Promise<Record<string, unknown>> {
    const result = this.database.read(db => {
      const row = db.prepare(`SELECT * FROM i10_image_ingest_jobs WHERE namespace=? AND image_ingest_id=?`).get(namespace,imageIngestId) as any;
      if (!row) throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');
      const facts = db.prepare(`SELECT f.fact_id factId,f.field_name field,
        COALESCE(d.replacement_value_redacted,f.value_redacted) value,
        f.provenance_json provenanceRefs,f.confidence,
        CASE WHEN d.decision IN ('CONFIRM','CORRECT') THEN 1 ELSE 0 END selected,
        f.requires_user_confirmation requiresUserConfirmation,d.decision userDecision
        FROM i10_case_fact_candidates f
        LEFT JOIN i10_image_fact_decisions d
          ON d.image_ingest_id=f.image_ingest_id AND d.fact_id=f.fact_id
        WHERE f.image_ingest_id=? ORDER BY f.created_at,f.fact_id`).all(imageIngestId) as any[];
      const controller=db.prepare(`SELECT invocation_type invocation,provider,model,input_tokens inputTokens,output_tokens outputTokens FROM i10_image_controller_invocations WHERE image_ingest_id=? AND invocation_type='REAL'`).get(imageIngestId) as any;
      const delivery=db.prepare(`SELECT ocr_status ocrStatus,ocr_engine ocrEngine,ocr_model_sha256 ocrModelSha256,
        ocr_duration_ms ocrDurationMs,ocr_processed_image_count ocrProcessedImageCount,
        ocr_recognized_region_count ocrRecognizedRegionCount,ocr_error_code ocrErrorCode,
        report_artifact_id reportArtifactId,json_artifact_id jsonArtifactId,purge_status purgeStatus,purged_at purgedAt
        FROM i10_image_ocr_deliveries WHERE image_ingest_id=?`).get(imageIngestId) as any;
      const nowMs = Date.now();
      const createdMs = Date.parse(String(row.created_at));
      const updatedMs = Date.parse(String(row.updated_at));
      const evidenceDirectory = path.resolve(this.productRoot,'.data','image-ingest',imageIngestId,'redacted');
      let processedImageCount = 0;
      let lastActivityMs = Number.isFinite(updatedMs) ? updatedMs : createdMs;
      if (isPathWithin(path.resolve(this.productRoot,'.data','image-ingest'),evidenceDirectory) && fs.existsSync(evidenceDirectory)) {
        for (const entry of fs.readdirSync(evidenceDirectory,{withFileTypes:true})) {
          if (!entry.isFile() || !/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
          processedImageCount += 1;
          const modifiedMs = fs.statSync(path.join(evidenceDirectory,entry.name)).mtimeMs;
          if (Number.isFinite(modifiedMs)) lastActivityMs = Math.max(lastActivityMs,modifiedMs);
        }
      }
      const imageCount = Number(row.image_count);
      const leaseExpiresMs = row.lease_expires_at ? Date.parse(String(row.lease_expires_at)) : Number.NaN;
      const elapsedSeconds = Math.max(0,Math.floor((nowMs-createdMs)/1000));
      const idleSeconds = Math.max(0,Math.floor((nowMs-lastActivityMs)/1000));
      const timedOut = row.status === 'PROCESSING' && Number.isFinite(leaseExpiresMs) && leaseExpiresMs <= nowMs;
      let progressStage = 'QUEUED';
      let progressPercent = 5;
      let progressMessage = '图片任务正在等待本机Worker领取。';
      if (row.status === 'PROCESSING' && row.lease_owner) {
        if (processedImageCount <= 0) {
          progressStage = 'OCR_STARTING';
          progressPercent = 15;
          progressMessage = 'Worker已领取任务，正在校验图片并启动中英文OCR。';
        } else if (processedImageCount < imageCount) {
          progressStage = 'OCR_AND_REDACTION';
          progressPercent = Math.min(60,15+Math.floor(processedImageCount/imageCount*45));
          progressMessage = `正在执行中英文OCR和脱敏，已完成${processedImageCount}/${imageCount}张。`;
        } else {
          progressStage = 'OCR_FACT_SELECTION';
          progressPercent = 70;
          progressMessage = 'ONNX OCR与脱敏已完成，正在由主控模型筛选案例事实。';
        }
      }
      if (row.status === 'WAITING_USER') {
        progressStage = 'WAITING_USER_REVIEW';
        progressPercent = 100;
        progressMessage = 'ONNX OCR和案例事实筛选已完成，等待用户核对事实。';
      } else if (row.status === 'CONFIRMED') {
        progressStage = 'CONFIRMED';
        progressPercent = 100;
        progressMessage = '图片事实已经用户确认，可进入案例草案。';
      } else if (row.status === 'FAILED') {
        progressStage = 'FAILED';
        progressPercent = 100;
        progressMessage = '图片分析已失败关闭，请查看安全错误码后重新提交。';
      } else if (timedOut) {
        progressStage = 'TIMED_OUT';
        progressMessage = 'Worker租约已超过最长等待时间，当前任务应按超时处理并重新领取。';
      }
      const timeoutStatus = row.status !== 'PROCESSING'
        ? 'COMPLETE'
        : timedOut
          ? 'TIMED_OUT'
          : row.lease_owner
            ? 'WITHIN_LIMIT'
            : 'NOT_STARTED';
      const lifecycleStatus = delivery?.purgeStatus === 'PURGED' ? 'IMAGE_PURGED' : row.status;
      return { imageIngestId,status:row.status,lifecycleStatus,persistenceStatus:row.status,version:row.version,primaryInputType:row.primary_input_type,primaryText:row.primary_text_safe ?? '',credentialRef:row.credential_ref ?? '',imageCount:row.image_count,
        progressStage,progressPercent,processedImageCount,elapsedSeconds,idleSeconds,maxWaitSeconds:600,
        lastActivityAt:new Date(lastActivityMs).toISOString(),leaseExpiresAt:row.lease_expires_at ?? undefined,
        timeoutStatus,timedOut,progressMessage,
        brief:{title:'图片案例信息分析',summary:`本机ONNX OCR识别${row.image_count}张图片，主控筛选出${facts.length}条待核对事实。`,factSummary:facts.slice(0,8).map((fact,index)=>`${index+1}. [${fact.field}] ${fact.value}`),nextAction:row.status==='WAITING_USER'?'请核对事实后确认或纠正。':'图片事实已处理。'},
        recognitionBranches:delivery?{ocr:{status:delivery.ocrStatus,engine:delivery.ocrEngine,modelSha256:delivery.ocrModelSha256,durationMs:delivery.ocrDurationMs,processedImageCount:delivery.ocrProcessedImageCount,recognizedRegionCount:delivery.ocrRecognizedRegionCount,errorCode:delivery.ocrErrorCode??undefined}}:undefined,
        artifactIds:delivery?[delivery.reportArtifactId,delivery.jsonArtifactId].filter(Boolean):[],
        purgeStatus:delivery?.purgeStatus,purgedAt:delivery?.purgedAt,
        facts:facts.map(fact=>({...fact,provenanceRefs:JSON.parse(fact.provenanceRefs),selected:Boolean(fact.selected),requiresUserConfirmation:Boolean(fact.requiresUserConfirmation)})),controllerInvocation:controller??undefined,errorCode:row.error_code ?? undefined };
    });
    const artifactCards = await this.artifactCards(namespace,{artifactIds:(result as any).artifactIds});
    const previewCards = (result as any).status === 'WAITING_USER'
      ? await this.grantImagePreviews(namespace,imageIngestId)
      : [];
    const branch=(result as any).recognitionBranches;
    const factLines=((result as any).facts as any[]).slice(0,12).map((fact,index)=>`${index+1}. **${fact.field}**：${fact.value}`);
    const humanBriefMarkdown=[
      '### 识别结果简报',
      '',
      `- 已分析图片：${(result as any).imageCount}张`,
      `- 本机OCR：${branch?.ocr?.status??'处理中'}${branch?.ocr?.engine?`（${branch.ocr.engine}）`:''}`,
      `- 识别文字区域：${branch?.ocr?.recognizedRegionCount??'处理中'}`,
      `- 主控筛选事实：${(result as any).facts.length}条`,
      '',
      ...factLines
    ].join('\n');
    const previewMarkdown=previewCards.length?['### 临时图片预览','',...previewCards.map((card:any)=>`- [查看第${card.ordinal}张图片](${card.href})（15分钟内有效，确认后立即删除）`)].join('\n'):'';
    const artifactMarkdown=artifactCards.length?['### 可下载成果','',...artifactCards.map(card=>`- [${card.displayName}](${card.href})（15分钟内一次性下载）`)].join('\n'):'';
    return {...result,artifactCards,previewCards,humanBriefMarkdown,previewMarkdown,artifactMarkdown};
  }

  async decideImageIngest(input: ImageIngestDecisionSubmitInput, _context: RequestContext): Promise<Record<string, unknown>> {
    this.assertNoSecretInput({ decisions: input.decisions });
    const replay = this.replayIdempotency(input.namespace, 'i10_image_ingest_decision_submit', input.idempotencyKey, input);
    if (replay) return replay;
    const result = await this.database.write(db => {
      const job = db.prepare(`SELECT * FROM i10_image_ingest_jobs WHERE namespace=? AND image_ingest_id=?`)
        .get(input.namespace, input.imageIngestId) as any;
      if (!job) throw new HarnessError(404, 'I10_IMAGE_INGEST_NOT_FOUND', 'DOMAIN', '补充图片导入任务不存在。');
      if (job.status !== 'WAITING_USER') {
        throw new HarnessError(409, 'I10_IMAGE_DECISION_STATE_INVALID', 'STATE', '补充图片事实当前不允许确认。', false, true);
      }
      if (job.version !== input.expectedVersion) {
        throw new HarnessError(409, 'I10_IMAGE_DECISION_VERSION_CONFLICT', 'CONCURRENCY', '补充图片事实版本已变化，请刷新后重试。', false, true);
      }
      const currentFacts = db.prepare(`SELECT fact_id FROM i10_case_fact_candidates WHERE image_ingest_id=? ORDER BY fact_id`)
        .all(input.imageIngestId) as Array<{ fact_id: string }>;
      const currentIds = currentFacts.map(fact => fact.fact_id);
      const submittedIds = input.decisions.map(decision => decision.factId);
      if (new Set(submittedIds).size !== submittedIds.length
        || submittedIds.length !== currentIds.length
        || currentIds.some(factId => !submittedIds.includes(factId))) {
        throw new HarnessError(422, 'I10_IMAGE_DECISION_SET_INCOMPLETE', 'CONTRACT', '必须逐项确认、纠正或拒绝当前全部图片事实。', false, true);
      }
      const now = nowIso();
      const insert = db.prepare(`INSERT INTO i10_image_fact_decisions(
        decision_id,image_ingest_id,fact_id,decision,replacement_value_redacted,replacement_value_hash,
        confirmation_ref,expected_job_version,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const decision of input.decisions) {
        const replacement = decision.decision === 'CORRECT' ? decision.replacementValue!.trim() : null;
        insert.run(opaqueId('imgdecision'), input.imageIngestId, decision.factId, decision.decision,
          replacement, replacement ? sha256(replacement) : null, input.confirmationRef, input.expectedVersion, now);
      }
      const update = db.prepare(`UPDATE i10_image_ingest_jobs
        SET status='CONFIRMED',version=version+1,completed_at=?,updated_at=?
        WHERE namespace=? AND image_ingest_id=? AND status='WAITING_USER' AND version=?`)
        .run(now, now, input.namespace, input.imageIngestId, input.expectedVersion);
      if (update.changes !== 1) {
        throw new HarnessError(409, 'I10_IMAGE_DECISION_VERSION_CONFLICT', 'CONCURRENCY', '补充图片事实状态已变化，请刷新后重试。', false, true);
      }
      return {
        imageIngestId: input.imageIngestId,
        status: 'CONFIRMED',
        version: input.expectedVersion + 1,
        confirmedCount: input.decisions.filter(decision => decision.decision === 'CONFIRM').length,
        correctedCount: input.decisions.filter(decision => decision.decision === 'CORRECT').length,
        rejectedCount: input.decisions.filter(decision => decision.decision === 'REJECT').length,
        sourceImages:db.prepare(`SELECT flowise_file_ref flowiseFileRef,original_filename originalFilename,source_sha256 sourceSha256
          FROM i10_supporting_images WHERE image_ingest_id=? ORDER BY ordinal`).all(input.imageIngestId)
      };
    });
    const purgeTargets: Array<{path:string}> = [];
    const purgeFailures: Array<{target:string;errorCode:string}> = [];
    for (const image of (result as any).sourceImages as Array<{flowiseFileRef:string;originalFilename:string}>) {
      try {
        const attachment = this.resolveAttachmentWithCanonicalName(image.flowiseFileRef,image.originalFilename);
        purgeTargets.push({path:attachment.filePath});
      } catch (error) {
        const errorCode=String((error as any)?.errorCode||(error as any)?.code||'I10_IMAGE_PURGE_RESOLVE_FAILED');
        if (errorCode !== 'I10_FLOWISE_ATTACHMENT_NOT_FOUND') {
          purgeFailures.push({target:image.originalFilename,errorCode});
        }
      }
    }
    purgeTargets.push({path:path.resolve(this.productRoot,'.data','image-ingest',input.imageIngestId)});
    let deletedCount=0;
    for(const target of purgeTargets){
      try{
        if(fs.existsSync(target.path))fs.rmSync(target.path,{recursive:true,force:true});
        deletedCount+=1;
      }catch(error){
        purgeFailures.push({target:path.basename(target.path),errorCode:String((error as any)?.code||'I10_IMAGE_PURGE_DELETE_FAILED')});
      }
    }
    const purgedAt=nowIso();
    const sourceHashes=((result as any).sourceImages as Array<{sourceSha256:string}>).map(image=>image.sourceSha256);
    const purgeReceipt={imageIngestId:input.imageIngestId,deletedCount,expectedCount:purgeTargets.length,failures:purgeFailures,sourceHashes,purgedAt};
    await this.database.write(db=>{
      db.prepare(`UPDATE i10_image_ocr_deliveries
      SET purge_status=?,purge_receipt_json=?,purged_at=?,updated_at=? WHERE image_ingest_id=?`)
        .run(purgeFailures.length?'INCOMPLETE':'PURGED',canonicalJson(purgeReceipt),purgedAt,purgedAt,input.imageIngestId);
      db.prepare(`UPDATE i10_image_preview_grants SET status='PURGED' WHERE image_ingest_id=? AND status='ACTIVE'`)
        .run(input.imageIngestId);
    });
    delete (result as any).sourceImages;
    Object.assign(result,{
      status:'CONFIRMED',
      lifecycleStatus:purgeFailures.length?'CONFIRMED':'IMAGE_PURGED',
      persistenceStatus:'CONFIRMED',
      purgeStatus:purgeFailures.length?'INCOMPLETE':'PURGED',
      deletedImageCount:deletedCount,
      errorCode:purgeFailures.length?'I10_IMAGE_PURGE_INCOMPLETE':undefined
    });
    return this.rememberIdempotency(input.namespace, 'i10_image_ingest_decision_submit', input.idempotencyKey,
      input, result, 'I10_IMAGE_INGEST', input.imageIngestId);
  }

  async claimImageIngest(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const now=nowIso();
      db.prepare(`UPDATE i10_image_ingest_jobs SET lease_owner=NULL,lease_expires_at=NULL,version=version+1,updated_at=?
        WHERE status='PROCESSING' AND lease_owner IS NOT NULL
          AND lease_expires_at IS NOT NULL AND lease_expires_at<=?`).run(now,now);
      const row = db.prepare(`SELECT * FROM i10_image_ingest_jobs WHERE status='PROCESSING' AND lease_owner IS NULL ORDER BY created_at LIMIT 1`).get() as any;
      if (!row) return { status: 'EMPTY' };
      // Resolve the controlled attachment before taking a Worker lease.  A
      // missing/unsafe attachment is a terminal property of this queued job;
      // leasing first would leave the job retrying forever after the resolver
      // throws, thereby starving all later valid image submissions.
      const imageRows = db.prepare(`SELECT image_id,ordinal,flowise_file_ref,original_filename,purpose_hint,source_sha256 FROM i10_supporting_images WHERE image_ingest_id=? ORDER BY ordinal`).all(row.image_ingest_id) as any[];
      let images: Array<Record<string, unknown>>;
      try {
        images = imageRows.map(image => ({
          imageId: image.image_id,
          ordinal: image.ordinal,
          filePath: this.resolveAttachment(image.flowise_file_ref, image.original_filename),
          originalFilename: image.original_filename,
          purposeHint: image.purpose_hint,
          sourceSha256: image.source_sha256
        }));
      } catch (error) {
        const errorCode = error instanceof HarnessError ? error.errorCode : 'I10_IMAGE_ATTACHMENT_RESOLUTION_FAILED';
        const terminalAttachmentFailure = new Set([
          'I10_FLOWISE_ATTACHMENT_NOT_FOUND',
          'I10_FLOWISE_ATTACHMENT_ESCAPE_REJECTED',
          'I10_FLOWISE_ATTACHMENT_NAME_MISMATCH',
          'I10_ATTACHMENT_FILENAME_REQUIRED',
          'I10_ATTACHMENT_FILENAME_INVALID'
        ]);
        if (!terminalAttachmentFailure.has(errorCode)) throw error;
        db.prepare(`UPDATE i10_image_ingest_jobs
          SET status='FAILED',error_code=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=?
          WHERE image_ingest_id=? AND status='PROCESSING' AND lease_owner IS NULL`)
          .run(errorCode, now, now, row.image_ingest_id);
        return { status: 'SKIPPED_FAILED', imageIngestId: row.image_ingest_id, errorCode };
      }
      const expiresAt = new Date(Date.now()+10*60_000).toISOString();
      db.prepare(`UPDATE i10_image_ingest_jobs SET lease_owner=?,lease_expires_at=?,updated_at=? WHERE image_ingest_id=?`).run(workerId,expiresAt,now,row.image_ingest_id);
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
    const completion = await this.database.write(db => {
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
    const namespace = this.database.read(db=>(db.prepare(`SELECT namespace FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(input.imageIngestId) as any).namespace) as string;
    const branch=input.recognitionBranches;
    const factLines=input.facts.map((fact,index)=>`${index+1}. **${fact.field}**：${fact.value}（置信度 ${fact.confidence.toFixed(2)}）`);
    const markdown=['# 图片分析报告','',`- 任务：${input.imageIngestId}`,`- 图片数：${input.packets.length}`,`- OCR：${branch.ocr.status} / ${branch.ocr.engine} / ${branch.ocr.durationMs}ms`,`- OCR模型Hash：${branch.ocr.modelSha256??'未提供'}`,`- 识别文字区域：${branch.ocr.recognizedRegionCount??0}个`,`- 主控筛选事实：${input.facts.length}条`,'','## 待确认事实','',...factLines,'','## 使用说明','','请逐项确认、纠正或拒绝。确认后系统删除本任务全部图片文件，仅保留结构化事实、Hash、OCR证据、报告制品和删除收据。'].join('\n');
    const machine={schemaVersion:'i10-image-analysis-v3-ocr-only',imageIngestId:input.imageIngestId,recognitionBranches:branch,facts:input.facts,packets:input.packets.map(packet=>({ordinal:packet.ordinal,sourceSha256:packet.sourceSha256,ocrTextHash:packet.ocrTextHash,language:packet.language,confidence:packet.confidence})),controllerInvocation:input.controllerInvocation};
    const report=await this.artifacts.create({namespace,artifactType:'REPORT',mediaType:'text/markdown; charset=utf-8',redactionStatus:'REDACTED',extension:'md',content:markdown,metadata:{displayName:'图片分析报告.md',format:'MD',imageIngestId:input.imageIngestId}});
    const json=await this.artifacts.create({namespace,artifactType:'JSON',mediaType:'application/json; charset=utf-8',redactionStatus:'REDACTED',extension:'json',content:JSON.stringify(machine,null,2),metadata:{displayName:'图片分析结果.json',format:'JSON',imageIngestId:input.imageIngestId}});
    const deliveryNow=nowIso();
    await this.database.write(db=>db.prepare(`INSERT INTO i10_image_ocr_deliveries(
      image_ingest_id,ocr_status,ocr_engine,ocr_model_sha256,ocr_duration_ms,ocr_processed_image_count,
      ocr_recognized_region_count,ocr_error_code,report_artifact_id,json_artifact_id,purge_status,
      preview_expires_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'PENDING_CONFIRMATION',?,?,?)`).run(
      input.imageIngestId,branch.ocr.status,branch.ocr.engine,branch.ocr.modelSha256??null,branch.ocr.durationMs,
      branch.ocr.processedImageCount??input.packets.length,branch.ocr.recognizedRegionCount??0,branch.ocr.errorCode??null,
      report.artifactId,json.artifactId,new Date(Date.now()+72*60*60_000).toISOString(),deliveryNow,deliveryNow));
    return {...completion,recognitionBranches:branch,artifactIds:[report.artifactId,json.artifactId]};
  }

  async failImageIngest(workerId: string,imageIngestId: string,errorCode: string,retryable: boolean): Promise<Record<string,unknown>> {
    return this.database.write(db=>{const job=db.prepare(`SELECT status,lease_owner,version FROM i10_image_ingest_jobs WHERE image_ingest_id=?`).get(imageIngestId) as any;if(!job)throw new HarnessError(404,'I10_IMAGE_INGEST_NOT_FOUND','DOMAIN','补充图片导入任务不存在。');if(job.status!=='PROCESSING'||job.lease_owner!==workerId)throw new HarnessError(409,'I10_IMAGE_INGEST_BINDING_INVALID','CONCURRENCY','补充图片失败回传绑定无效。');const now=nowIso();db.prepare(`UPDATE i10_image_ingest_jobs SET status='FAILED',error_code=?,lease_owner=NULL,lease_expires_at=NULL,version=version+1,completed_at=?,updated_at=? WHERE image_ingest_id=?`).run(errorCode,now,now,imageIngestId);return{imageIngestId,status:'FAILED',version:Number(job.version)+1,errorCode,retryable};});
  }

  async recordVerificationAttempt(input: import('./schemas').VerificationAttemptReportInput): Promise<Record<string,unknown>> {
    return this.database.write(db => {
      const attemptId = opaqueId('verificationattempt');
      const now = nowIso();
      db.prepare(`INSERT OR IGNORE INTO i10_verification_attempts(
        attempt_id,namespace,task_ref,action_ordinal,page_fingerprint,policy_version,verification_type,attempt_ordinal,
        automation_assessment,assessment_reason,route_path,evidence_hash,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        attemptId,input.namespace,input.taskRef,input.actionOrdinal,input.pageFingerprint,input.policyVersion,input.verificationType,
        input.attemptOrdinal,input.automationAssessment,input.assessmentReason,input.routePath ?? null,input.evidenceHash ?? null,now
      );
      return { taskRef: input.taskRef, actionOrdinal: input.actionOrdinal, attemptOrdinal: input.attemptOrdinal, recorded: true };
    });
  }

  async reportVerificationChallenge(input: VerificationChallengeReportInput): Promise<Record<string,unknown>> {
    const challengeId=opaqueId('verification');const now=nowIso();
    const result=await this.database.write(db=>{db.prepare(`INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)`).run(input.namespace,now,now);if(input.pageFingerprint){const existing=db.prepare(`SELECT challenge_id,status,version FROM i10_verification_challenges WHERE namespace=? AND task_ref=? AND action_ordinal IS ? AND page_fingerprint=?`).get(input.namespace,input.taskRef,input.actionOrdinal??null,input.pageFingerprint) as any;if(existing)return{challengeId:existing.challenge_id,status:existing.status,version:Number(existing.version),deduplicated:true};}db.prepare(`INSERT INTO i10_verification_challenges(challenge_id,namespace,task_ref,verification_type,action_ordinal,status,detection_summary,user_preparation,version,expires_at,page_fingerprint,policy_mode,created_at,updated_at) VALUES (?,?,?,?,?,'WAITING_USER_PREPARATION',?,?,1,?,?,?,?,?)`).run(challengeId,input.namespace,input.taskRef,input.verificationType,input.actionOrdinal??null,input.detectionSummary,input.userPreparation,input.expiresAt??null,input.pageFingerprint??null,input.policyMode??null,now,now);db.prepare(`INSERT INTO i10_verification_events(event_id,challenge_id,from_status,to_status,actor_type,created_at) VALUES (?,?,?,'WAITING_USER_PREPARATION','WORKER',?)`).run(opaqueId('verificationevent'),challengeId,'DETECTED',now);return{challengeId,status:'WAITING_USER_PREPARATION',version:1,deduplicated:false};});
    return{...result,verificationType:input.verificationType,userPreparation:input.userPreparation,unattendedOutcome:'HUMAN_IN_LOOP_REQUIRED'};
  }

  getVerification(namespace:string,challengeId:string):Record<string,unknown>{return this.database.read(db=>{const row=db.prepare(`SELECT challenge_id,status,verification_type,task_ref,action_ordinal,user_preparation,version,expires_at,created_at,updated_at,policy_mode FROM i10_verification_challenges WHERE namespace=? AND challenge_id=?`).get(namespace,challengeId) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','验证挑战不存在。');const attempts=db.prepare(`SELECT attempt_ordinal,automation_assessment,assessment_reason,route_path,created_at FROM i10_verification_attempts WHERE namespace=? AND task_ref=? AND action_ordinal=? ORDER BY attempt_ordinal`).all(namespace,row.task_ref,row.action_ordinal) as Array<{attempt_ordinal:number;automation_assessment:string;assessment_reason:string;route_path:string|null;created_at:string}>;return{policyVersion:'VerificationPolicyV2',challengeId:row.challenge_id,status:row.status,verificationType:row.verification_type,taskRef:row.task_ref,actionOrdinal:row.action_ordinal,userPreparation:row.user_preparation,version:row.version,expiresAt:row.expires_at,createdAt:row.created_at,updatedAt:row.updated_at,attempts,handoffStatus:row.policy_mode==='EXTERNAL_CONFIRM_REQUIRED'?row.status:'NOT_REQUIRED',automationAssessment:attempts.at(-1)?.automation_assessment ?? 'NOT_RECORDED',assessmentReason:attempts.at(-1)?.assessment_reason ?? 'NOT_RECORDED',scriptImpact:'VERIFICATION_GATE'};});}

  getVerificationByTask(namespace:string,taskRef:string):Record<string,unknown>{return this.database.read(db=>{const row=db.prepare(`SELECT challenge_id,status,verification_type,task_ref,action_ordinal,user_preparation,version,expires_at,created_at,updated_at FROM i10_verification_challenges WHERE namespace=? AND task_ref=? ORDER BY created_at DESC LIMIT 1`).get(namespace,taskRef) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','当前任务没有待处理的人工验证挑战。');return{challengeId:row.challenge_id,status:row.status,verificationType:row.verification_type,taskRef:row.task_ref,actionOrdinal:row.action_ordinal,userPreparation:row.user_preparation,version:row.version,expiresAt:row.expires_at,createdAt:row.created_at,updatedAt:row.updated_at};});}

  async decideVerification(input:VerificationDecisionSubmitInput,_context:RequestContext):Promise<Record<string,unknown>>{
    const replayed=this.replayIdempotency(input.namespace,'i10_verification_decision',input.idempotencyKey,input);if(replayed)return replayed;
    const result=await this.database.write(db=>{const row=db.prepare(`SELECT status,version,expires_at FROM i10_verification_challenges WHERE namespace=? AND challenge_id=?`).get(input.namespace,input.challengeId) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','验证挑战不存在。');if(Number(row.version)!==input.expectedVersion)throw new HarnessError(409,'I10_VERIFICATION_VERSION_CONFLICT','CONCURRENCY','验证挑战版本已变化。');if(row.expires_at&&Date.parse(row.expires_at)<=Date.now())throw new HarnessError(409,'I10_VERIFICATION_EXPIRED','DOMAIN','验证挑战已过期。');const allowed:Record<string,Record<string,string>>={WAITING_USER_PREPARATION:{USER_READY:'WAITING_USER_ACTION',CANCEL:'CANCELLED'},WAITING_USER_ACTION:{USER_ACTION_COMPLETED:'VERIFICATION_CONFIRMED',CANCEL:'CANCELLED'}};const next=allowed[row.status]?.[input.decision];if(!next)throw new HarnessError(409,'I10_VERIFICATION_TRANSITION_INVALID','DOMAIN','验证挑战状态迁移无效。');const now=nowIso();const insertEvent=db.prepare(`INSERT INTO i10_verification_events(event_id,challenge_id,from_status,to_status,actor_type,confirmation_ref,note_hash,created_at) VALUES (?,?,?,?, 'USER',?,?,?)`);if(input.decision==='USER_READY'){insertEvent.run(opaqueId('verificationevent'),input.challengeId,row.status,'USER_READY',input.confirmationRef,input.note?sha256(input.note):null,now);insertEvent.run(opaqueId('verificationevent'),input.challengeId,'USER_READY','CHALLENGE_PRESENTED',input.confirmationRef,null,now);insertEvent.run(opaqueId('verificationevent'),input.challengeId,'CHALLENGE_PRESENTED','WAITING_USER_ACTION',input.confirmationRef,null,now);}else{insertEvent.run(opaqueId('verificationevent'),input.challengeId,row.status,next,input.confirmationRef,input.note?sha256(input.note):null,now);}db.prepare(`UPDATE i10_verification_challenges SET status=?,version=version+1,updated_at=? WHERE challenge_id=?`).run(next,now,input.challengeId);return{challengeId:input.challengeId,status:next,version:Number(row.version)+1,resumeAllowed:next==='VERIFICATION_CONFIRMED'};});
    return this.rememberIdempotency(input.namespace,'i10_verification_decision',input.idempotencyKey,input,result,'I10_VERIFICATION_CHALLENGE',input.challengeId);
  }

  async resumeVerification(namespace:string,challengeId:string,workerId:string):Promise<Record<string,unknown>>{
    return this.database.write(db=>{const row=db.prepare(`SELECT status,version FROM i10_verification_challenges WHERE namespace=? AND challenge_id=?`).get(namespace,challengeId) as any;if(!row)throw new HarnessError(404,'I10_VERIFICATION_NOT_FOUND','DOMAIN','验证挑战不存在。');if(row.status!=='VERIFICATION_CONFIRMED')throw new HarnessError(409,'I10_VERIFICATION_RESUME_NOT_ALLOWED','DOMAIN','验证尚未确认，不能恢复执行。');const now=nowIso();db.prepare(`UPDATE i10_verification_challenges SET status='RESUMED',version=version+1,updated_at=? WHERE challenge_id=?`).run(now,challengeId);db.prepare(`INSERT INTO i10_verification_events(event_id,challenge_id,from_status,to_status,actor_type,confirmation_ref,created_at) VALUES (?,?,'VERIFICATION_CONFIRMED','RESUMED','WORKER',?,?)`).run(opaqueId('verificationevent'),challengeId,workerId,now);return{challengeId,status:'RESUMED',version:Number(row.version)+1,resumeAllowed:true};});
  }
}
