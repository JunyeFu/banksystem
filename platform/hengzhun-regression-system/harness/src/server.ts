import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { z, ZodError } from 'zod';
import { HarnessDatabase } from './database';
import { asHarnessError, HarnessError } from './errors';
import { OutputLevel, serializeWithinBudget } from './output-budget';
import {
  caseCreateDraftSchema,
  caseImportSubmitSchema,
  decisionSubmitSchema,
  i9KnowledgeSnapshotRegistrationSchema,
  namespaceSchema,
  planCompileSchema,
  repairCandidateCreateSchema,
  runSubmitSchema,
  scheduleCreateSchema,
  scheduleDisableSchema,
  scheduleGetSchema,
  validationIssues
} from './schemas';
import { modelUsageSchema } from './context-envelope';
import { i8AuthoringGetSchema, i8AuthoringSubmitSchema, i8CasePrepareSchema } from './i8/stage2-schemas';
import {
  i8CandidateBuildCompletionSchema,
  i8CandidateCompileSchema,
  i8CandidateGetSchema
} from './i8/stage3-schemas';
import { i8StabilityCompletionSchema } from './i8/stage4-schemas';
import { i8CandidateDecisionSchema, i8CandidatePreviewSchema, i8RunSubmitSchema, i8TaskGetSchema } from './i8/stage5-schemas';
import { i8ResultInboxListSchema, i8ScheduleCreateSchema, i8ScheduleGetSchema } from './i8/stage6-schemas';
import { i8FailureGetSchema, i8RepairDecisionSchema, i8RepairProposeSchema } from './i8/stage7-schemas';
import { authorizeRequest, loadSecurityConfig, remoteAddressForAudit, SecurityConfig, SecurityResult } from './security';
import { HarnessService } from './service';
import { credentialFingerprint, nowIso, opaqueId } from './utils';

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_WORKER_REQUEST_BYTES = 8 * 1024 * 1024;

const workerClaimSchema = z.object({
  workerId: z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9._:-]+$/)
}).strict();

const authoringWorkerClaimSchema = workerClaimSchema.extend({
  visualContext: z.object({
    viewportWidth: z.number().int().min(320).max(16_384),
    viewportHeight: z.number().int().min(240).max(16_384),
    tokenizerId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/)
  }).strict()
}).strict();

const workerCompletionSchema = z.object({
  workerId: z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  outcome: z.enum(['PASSED', 'FAILED', 'BLOCKED']),
  summary: z.string().trim().min(1).max(1000),
  errorCode: z.string().trim().min(1).max(128).optional(),
  errorCategory: z.enum(['TEST_FAILURE', 'ENVIRONMENT', 'EVIDENCE']).optional(),
  retryable: z.boolean().optional(),
  userActionRequired: z.boolean().optional(),
  evidence: z.array(z.object({
    artifactType: z.enum(['JSON', 'TEXT', 'SCREENSHOT', 'LOG', 'REPORT', 'DIAGNOSTIC']),
    mediaType: z.string().trim().min(1).max(128),
    redactionStatus: z.enum(['NOT_REQUIRED', 'REDACTED', 'QUARANTINED']),
    extension: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9]+$/),
    base64Content: z.string().min(1).max(7 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    metadata: z.record(z.string(), z.unknown()).optional()
  }).strict()).max(8)
}).strict();

const repairWorkerCompletionSchema = workerCompletionSchema;

const authoringActionCompletionSchema = z.object({
  workerId: z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  slotId: z.string().trim().min(8).max(80),
  outcome: z.enum(['VERIFIED_PASSED', 'FAILED', 'AMBIGUOUS']),
  summary: z.string().trim().min(1).max(1000),
  contextAuditId: z.string().trim().min(8).max(80),
  contextEnvelopeHash: z.string().regex(/^[0-9a-f]{64}$/),
  modelUsage: modelUsageSchema,
  pageState: z.record(z.string(), z.unknown()),
  verification: z.object({
    dom: z.boolean(),
    url: z.boolean(),
    request: z.boolean(),
    business: z.boolean()
  }).strict()
}).strict();

const midsceneCapabilitySchema = z.object({
  actionType: z.enum(['LOCATE', 'INPUT', 'TAP', 'SCROLL']),
  viewportCount: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  falseSuccessCount: z.number().int().nonnegative(),
  verificationRef: z.string().trim().min(8).max(256)
}).strict();

const pluginReferenceSchema = z.string().trim().min(8).max(80);
const pluginCaseGetSchema = z.object({
  namespace: namespaceSchema,
  caseId: pluginReferenceSchema
}).strict();
const pluginPlanCompileSchema = planCompileSchema.extend({
  caseId: pluginReferenceSchema
}).strict();
const pluginTaskGetSchema = z.object({
  namespace: namespaceSchema,
  taskId: pluginReferenceSchema
}).strict();
const pluginArtifactGetSchema = z.object({
  namespace: namespaceSchema,
  artifactId: pluginReferenceSchema
}).strict();
const pluginFailureGetSchema = z.object({
  namespace: namespaceSchema,
  incidentId: pluginReferenceSchema
}).strict();
const pluginRepairCandidateGetSchema = z.object({
  namespace: namespaceSchema,
  candidateId: pluginReferenceSchema
}).strict();

export interface HarnessApplicationOptions {
  productRoot: string;
  databasePath?: string;
  migrationsDirectory?: string;
  backupDirectory?: string;
  artifactRoot?: string;
  security?: SecurityConfig;
  workerToken?: string;
  schedulerIntervalMs?: number;
}

export interface HarnessApplication {
  handler: http.RequestListener;
  service: HarnessService;
  database: HarnessDatabase;
  close(): Promise<void>;
}

async function readJson(request: http.IncomingMessage, maximumBytes = MAX_REQUEST_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumBytes) throw new HarnessError(413, 'REQUEST_TOO_LARGE', 'CONTRACT', '请求体超过允许的大小。');
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HarnessError(400, 'INVALID_JSON', 'CONTRACT', '请求体不是有效 JSON。');
  }
}

function authorizeWorker(header: string | undefined, configuredToken: string | undefined): void {
  if (!configuredToken || configuredToken.length < 32) {
    throw new HarnessError(503, 'WORKER_CHANNEL_DISABLED', 'ENVIRONMENT', 'Worker 内部通道未配置。', true, true);
  }
  if (!header?.startsWith('Bearer ')) {
    throw new HarnessError(401, 'WORKER_AUTH_REQUIRED', 'AUTHENTICATION', 'Worker 鉴权失败。');
  }
  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(configuredToken);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new HarnessError(403, 'WORKER_AUTH_REJECTED', 'AUTHORIZATION', 'Worker 鉴权失败。');
  }
}

function tokenFingerprintFromHeader(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return credentialFingerprint(header.slice('Bearer '.length));
}

function sendJson(response: http.ServerResponse, status: number, value: unknown, level: OutputLevel, requestId: string): void {
  const serialized = serializeWithinBudget(value, level);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': serialized.byteLength,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-request-id': requestId,
    'x-hengzhun-output-level': level,
    'x-hengzhun-output-bytes': String(serialized.byteLength)
  });
  response.end(serialized.body);
}

function errorBody(error: HarnessError, requestId: string): Record<string, unknown> {
  return {
    errorCode: error.errorCode,
    category: error.category,
    message: error.message,
    retryable: error.retryable,
    userActionRequired: error.userActionRequired,
    requestId,
    ...(error.details ? { details: error.details } : {})
  };
}

function omitNullValues(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

export async function createHarnessApplication(options: HarnessApplicationOptions): Promise<HarnessApplication> {
  const database = await HarnessDatabase.open({
    databasePath: options.databasePath ?? path.join(options.productRoot, '.data', 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: options.migrationsDirectory ?? path.join(options.productRoot, 'harness', 'migrations'),
    backupDirectory: options.backupDirectory ?? path.join(options.productRoot, '.data', 'sqlite', 'backups')
  });
  const service = new HarnessService(database, options.artifactRoot ?? path.join(options.productRoot, '.data', 'artifacts'), options.productRoot);
  const security = options.security ?? loadSecurityConfig();
  const workerToken = options.workerToken ?? process.env.HENGZHUN_WORKER_TOKEN;
  const schedulerIntervalMs = options.schedulerIntervalMs ?? 15_000;
  let schedulerRunning = false;
  const schedulerTick = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try { await service.tickSchedules(); } finally { schedulerRunning = false; }
  };
  await schedulerTick();
  const scheduler = schedulerIntervalMs > 0 ? setInterval(() => void schedulerTick().catch(() => undefined), schedulerIntervalMs) : undefined;
  scheduler?.unref();

  const handler: http.RequestListener = async (request, response) => {
    const requestId = opaqueId('req');
    let fingerprint: string | undefined;
    try {
      const url = new URL(request.url ?? '/', 'http://hengzhun.local');
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, {
          status: 'ok',
          service: 'hengzhun-harness',
          version: '1.1.0',
          database: { engine: 'sqlite', quickCheck: database.quickCheck() }
        }, 'L0', requestId);
      }

      const i8DownloadMatch = url.pathname.match(/^\/v1\/i8\/downloads\/(download_[0-9a-f-]{36})$/);
      if (request.method === 'GET' && i8DownloadMatch) {
        const download = await service.consumeI8Download(i8DownloadMatch[1] as string);
        const content = download.content as Buffer;
        response.writeHead(200, {
          'content-type': String(download.mediaType),
          'content-disposition': `attachment; filename="${String(download.filename).replace(/[^A-Za-z0-9._-]/g, '_')}"`,
          'content-length': content.byteLength,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-content-sha256': String(download.sha256),
          'x-request-id': requestId
        });
        return response.end(content);
      }

      if (request.method === 'POST' && url.pathname === '/internal/worker/tasks:claim') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = workerClaimSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.claimNextRun(input.workerId), 'L0', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/internal/worker/authoring:claim') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = authoringWorkerClaimSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.claimNextAuthoringAction(input.workerId, input.visualContext), 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/internal/worker/repairs:claim') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = workerClaimSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.claimNextRepairValidation(input.workerId), 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/internal/worker/i8/candidates:claim') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = workerClaimSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.claimNextI8CandidateBuild(input.workerId), 'L2', requestId);
      }
      const i8CandidateCompleteMatch = url.pathname.match(/^\/internal\/worker\/i8\/candidates\/([^/]+):complete$/);
      if (request.method === 'POST' && i8CandidateCompleteMatch) {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = i8CandidateBuildCompletionSchema.parse(await readJson(request, MAX_WORKER_REQUEST_BYTES));
        return sendJson(response, 200, await service.completeI8CandidateBuild(decodeURIComponent(i8CandidateCompleteMatch[1] as string), input), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/internal/worker/i8/stability:claim') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = workerClaimSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.claimNextI8Stability(input.workerId), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/internal/worker/i8/repairs/stability:claim') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = workerClaimSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.claimNextI8RepairStability(input.workerId), 'L2', requestId);
      }
      const i8RepairStabilityCompleteMatch = url.pathname.match(/^\/internal\/worker\/i8\/repairs\/stability\/([^/]+):complete$/);
      if (request.method === 'POST' && i8RepairStabilityCompleteMatch) {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = i8StabilityCompletionSchema.parse(await readJson(request, MAX_WORKER_REQUEST_BYTES));
        return sendJson(response, 200, await service.completeI8RepairStability(decodeURIComponent(i8RepairStabilityCompleteMatch[1] as string), input), 'L2', requestId);
      }
      const i8StabilityCompleteMatch = url.pathname.match(/^\/internal\/worker\/i8\/stability\/([^/]+):complete$/);
      if (request.method === 'POST' && i8StabilityCompleteMatch) {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = i8StabilityCompletionSchema.parse(await readJson(request, MAX_WORKER_REQUEST_BYTES));
        return sendJson(response, 200, await service.completeI8Stability(decodeURIComponent(i8StabilityCompleteMatch[1] as string), input), 'L2', requestId);
      }
      const repairCompleteMatch = url.pathname.match(/^\/internal\/worker\/repairs\/([^/]+):complete$/);
      if (request.method === 'POST' && repairCompleteMatch) {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = repairWorkerCompletionSchema.parse(await readJson(request, MAX_WORKER_REQUEST_BYTES));
        return sendJson(response, 200, await service.completeRepairValidation(decodeURIComponent(repairCompleteMatch[1] as string), input), 'L1', requestId);
      }
      const authoringCompleteMatch = url.pathname.match(/^\/internal\/worker\/authoring\/([^/]+)\/actions:complete$/);
      if (request.method === 'POST' && authoringCompleteMatch) {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = authoringActionCompletionSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.completeAuthoringAction(decodeURIComponent(authoringCompleteMatch[1] as string), input), 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/internal/worker/midscene-capabilities:record') {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = midsceneCapabilitySchema.parse(await readJson(request));
        return sendJson(response, 200, await service.recordMidsceneCapability(input), 'L0', requestId);
      }
      const workerCompleteMatch = url.pathname.match(/^\/internal\/worker\/tasks\/([^/]+):complete$/);
      if (request.method === 'POST' && workerCompleteMatch) {
        authorizeWorker(request.headers.authorization, workerToken);
        const input = workerCompletionSchema.parse(await readJson(request, MAX_WORKER_REQUEST_BYTES));
        return sendJson(response, 200, await service.completeRun(decodeURIComponent(workerCompleteMatch[1] as string), input), 'L1', requestId);
      }

      let authorization: SecurityResult;
      try {
        authorization = authorizeRequest(
          request.headers.authorization,
          typeof request.headers['x-hengzhun-service-token'] === 'string'
            ? request.headers['x-hengzhun-service-token']
            : undefined,
          request.socket.remoteAddress,
          security
        );
        fingerprint = authorization.credentialFingerprint;
        await database.write(db => {
          db.prepare(`
            INSERT INTO security_events(event_id, outcome, reason_code, remote_address, credential_fingerprint, request_id, created_at)
            VALUES (?, 'ACCEPTED', 'AUTHORIZED', ?, ?, ?, ?)
          `).run(opaqueId('sec'), authorization.remoteAddress, fingerprint ?? null, requestId, nowIso());
        });
      } catch (error) {
        const authError = asHarnessError(error);
        await database.write(db => {
          db.prepare(`
            INSERT INTO security_events(event_id, outcome, reason_code, remote_address, credential_fingerprint, request_id, created_at)
            VALUES (?, 'REJECTED', ?, ?, ?, ?, ?)
          `).run(
            opaqueId('sec'), authError.errorCode, remoteAddressForAudit(request.socket.remoteAddress),
            tokenFingerprintFromHeader(request.headers.authorization)
              ?? (typeof request.headers['x-hengzhun-service-token'] === 'string'
                ? credentialFingerprint(request.headers['x-hengzhun-service-token'])
                : null),
            requestId,
            nowIso()
          );
        });
        throw authError;
      }

      const context = {
        requestId,
        credentialFingerprint: fingerprint,
        actorType: url.pathname.startsWith('/v1/i8/') ? 'SYSTEM' as const : 'COZE' as const
      };
      if (request.method === 'POST' && url.pathname === '/v1/platform/knowledge-snapshots:register') {
        const input = i9KnowledgeSnapshotRegistrationSchema.parse(await readJson(request));
        const result = await service.registerI9KnowledgeSnapshot(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/cases:prepare') {
        const input = i8CasePrepareSchema.parse(await readJson(request));
        const result = await service.prepareI8Case(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/authoring:submit') {
        const input = i8AuthoringSubmitSchema.parse(await readJson(request));
        const result = await service.submitI8Authoring(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/authoring:get') {
        const input = i8AuthoringGetSchema.parse(await readJson(request));
        return sendJson(response, 200, service.getI8Authoring(input.namespace, input.preparationId), 'L0', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/candidates:compile') {
        const input = i8CandidateCompileSchema.parse(await readJson(request));
        const result = await service.compileI8Candidate(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/candidates:get') {
        const input = i8CandidateGetSchema.parse(await readJson(request));
        return sendJson(response, 200, service.getI8Candidate(input.namespace, input.preparationId), 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/candidates:preview') {
        const input = i8CandidatePreviewSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.previewI8Candidate(input, context), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/candidates:decide') {
        const input = i8CandidateDecisionSchema.parse(await readJson(request));
        const result = await service.decideI8Candidate(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/runs:submit') {
        const input = i8RunSubmitSchema.parse(await readJson(request));
        const result = await service.submitI8Run(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/tasks:get') {
        const input = i8TaskGetSchema.parse(await readJson(request));
        return sendJson(response, 200, omitNullValues(service.getTask(input.namespace, input.taskId)), 'L0', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/schedules:create') {
        const input = i8ScheduleCreateSchema.parse(await readJson(request));
        const result = await service.createI8Schedule(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/schedules:get') {
        const input = i8ScheduleGetSchema.parse(await readJson(request));
        return sendJson(response, 200, omitNullValues(service.getI8Schedule(input.namespace, input.scheduleId)), 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/results:inbox-list') {
        const input = i8ResultInboxListSchema.parse(await readJson(request));
        return sendJson(response, 200, await service.listI8ResultInbox(input), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/failures:get') {
        const input = i8FailureGetSchema.parse(await readJson(request));
        return sendJson(response, 200, service.getI8Failure(input.namespace, input.incidentId), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/repairs:propose') {
        const input = i8RepairProposeSchema.parse(await readJson(request));
        const result = await service.proposeI8Repair(input, context);
        return sendJson(response, result.status, result.response, 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/i8/repairs:decide') {
        const input = i8RepairDecisionSchema.parse(await readJson(request));
        const result = await service.decideI8Repair(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/cases:create-draft') {
        const input = caseCreateDraftSchema.parse(await readJson(request));
        const result = await service.createCaseDraft(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/cases:import') {
        const input = caseImportSubmitSchema.parse(await readJson(request));
        const result = await service.importCases(input, context);
        return sendJson(response, result.status, result.response, 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/cases:get') {
        const input = pluginCaseGetSchema.parse(await readJson(request));
        return sendJson(response, 200, service.getCase(input.namespace, input.caseId), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/plans:compile') {
        const { caseId, ...compileInput } = pluginPlanCompileSchema.parse(await readJson(request));
        const result = await service.compilePlan(caseId, compileInput, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/runs:submit') {
        const input = runSubmitSchema.parse(await readJson(request));
        const result = await service.submitRun(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/tasks:get') {
        const input = pluginTaskGetSchema.parse(await readJson(request));
        return sendJson(response, 200, omitNullValues(service.getTask(input.namespace, input.taskId)), 'L0', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/artifacts:get-metadata') {
        const input = pluginArtifactGetSchema.parse(await readJson(request));
        return sendJson(response, 200, service.getArtifactMetadata(input.namespace, input.artifactId), 'L3', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/failures:get') {
        const input = pluginFailureGetSchema.parse(await readJson(request));
        return sendJson(response, 200, omitNullValues(service.getFailureIncident(input.namespace, input.incidentId)), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/repairs:create-candidate') {
        const input = repairCandidateCreateSchema.parse(await readJson(request));
        const result = await service.createRepairCandidate(input, context);
        return sendJson(response, result.status, result.response, 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/repairs:get-candidate') {
        const input = pluginRepairCandidateGetSchema.parse(await readJson(request));
        return sendJson(response, 200, omitNullValues(service.getRepairCandidate(input.namespace, input.candidateId)), 'L2', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/decisions:submit') {
        const input = decisionSubmitSchema.parse(await readJson(request));
        const result = await service.submitDecision(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/schedules:create') {
        const input = scheduleCreateSchema.parse(await readJson(request));
        const result = await service.createSchedule(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/schedules:get') {
        const input = scheduleGetSchema.parse(await readJson(request));
        return sendJson(response, 200, omitNullValues(service.getSchedule(input.namespace, input.scheduleId)), 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/plugin/schedules:disable') {
        const input = scheduleDisableSchema.parse(await readJson(request));
        const result = await service.disableSchedule(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }

      if (request.method === 'POST' && url.pathname === '/v1/cases/drafts') {
        const input = caseCreateDraftSchema.parse(await readJson(request));
        const result = await service.createCaseDraft(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/cases/imports') {
        const input = caseImportSubmitSchema.parse(await readJson(request));
        const result = await service.importCases(input, context);
        return sendJson(response, result.status, result.response, 'L2', requestId);
      }
      const caseMatch = url.pathname.match(/^\/v1\/cases\/([^/]+)$/);
      if (request.method === 'GET' && caseMatch) {
        const namespace = namespaceSchema.parse(url.searchParams.get('namespace'));
        return sendJson(response, 200, service.getCase(namespace, decodeURIComponent(caseMatch[1] as string)), 'L2', requestId);
      }
      const planMatch = url.pathname.match(/^\/v1\/cases\/([^/]+)\/plans:compile$/);
      if (request.method === 'POST' && planMatch) {
        const input = planCompileSchema.parse(await readJson(request));
        const result = await service.compilePlan(decodeURIComponent(planMatch[1] as string), input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/runs') {
        const input = runSubmitSchema.parse(await readJson(request));
        const result = await service.submitRun(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)$/);
      if (request.method === 'GET' && taskMatch) {
        const namespace = namespaceSchema.parse(url.searchParams.get('namespace'));
        return sendJson(response, 200, service.getTask(namespace, decodeURIComponent(taskMatch[1] as string)), 'L0', requestId);
      }
      const artifactMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)\/metadata$/);
      if (request.method === 'GET' && artifactMatch) {
        const namespace = namespaceSchema.parse(url.searchParams.get('namespace'));
        return sendJson(response, 200, service.getArtifactMetadata(namespace, decodeURIComponent(artifactMatch[1] as string)), 'L3', requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/decisions') {
        const input = decisionSubmitSchema.parse(await readJson(request));
        const result = await service.submitDecision(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
      }
      throw new HarnessError(404, 'ROUTE_NOT_FOUND', 'CONTRACT', '请求路径不存在。');
    } catch (error) {
      const normalized = error instanceof ZodError
        ? new HarnessError(400, 'SCHEMA_VALIDATION_FAILED', 'CONTRACT', '请求参数不符合契约。', false, false, { issues: validationIssues(error) })
        : asHarnessError(error);
      try {
        return sendJson(response, normalized.status, errorBody(normalized, requestId), 'L0', requestId);
      } catch {
        const fallback = Buffer.from(JSON.stringify({ errorCode: 'OUTPUT_BUDGET_EXCEEDED', category: 'CONTRACT', requestId }), 'utf8');
        response.writeHead(413, { 'content-type': 'application/json; charset=utf-8', 'content-length': fallback.byteLength, 'cache-control': 'no-store' });
        response.end(fallback);
      }
    }
  };

  return {
    handler,
    service,
    database,
    close: async () => {
      if (scheduler) clearInterval(scheduler);
      while (schedulerRunning) await new Promise(resolve => setTimeout(resolve, 5));
      await database.close();
    }
  };
}

export async function startHarness(options: HarnessApplicationOptions & { host?: string; port?: number }): Promise<{ server: http.Server; application: HarnessApplication }> {
  const application = await createHarnessApplication(options);
  const server = http.createServer(application.handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 18788, options.host ?? '127.0.0.1', () => resolve());
  });
  return { server, application };
}
