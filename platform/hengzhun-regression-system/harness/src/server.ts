import http from 'node:http';
import path from 'node:path';
import { ZodError } from 'zod';
import { HarnessDatabase } from './database';
import { asHarnessError, HarnessError } from './errors';
import { OutputLevel, serializeWithinBudget } from './output-budget';
import {
  caseCreateDraftSchema,
  decisionSubmitSchema,
  namespaceSchema,
  planCompileSchema,
  runSubmitSchema,
  validationIssues
} from './schemas';
import { authorizeRequest, loadSecurityConfig, remoteAddressForAudit, SecurityConfig, SecurityResult } from './security';
import { HarnessService } from './service';
import { credentialFingerprint, nowIso, opaqueId } from './utils';

const MAX_REQUEST_BYTES = 256 * 1024;

export interface HarnessApplicationOptions {
  productRoot: string;
  databasePath?: string;
  migrationsDirectory?: string;
  backupDirectory?: string;
  artifactRoot?: string;
  security?: SecurityConfig;
}

export interface HarnessApplication {
  handler: http.RequestListener;
  service: HarnessService;
  database: HarnessDatabase;
  close(): Promise<void>;
}

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_REQUEST_BYTES) throw new HarnessError(413, 'REQUEST_TOO_LARGE', 'CONTRACT', '请求体超过 256 KiB。');
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HarnessError(400, 'INVALID_JSON', 'CONTRACT', '请求体不是有效 JSON。');
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

export async function createHarnessApplication(options: HarnessApplicationOptions): Promise<HarnessApplication> {
  const database = await HarnessDatabase.open({
    databasePath: options.databasePath ?? path.join(options.productRoot, '.data', 'sqlite', 'regression_platform.sqlite'),
    migrationsDirectory: options.migrationsDirectory ?? path.join(options.productRoot, 'harness', 'migrations'),
    backupDirectory: options.backupDirectory ?? path.join(options.productRoot, '.data', 'sqlite', 'backups')
  });
  const service = new HarnessService(database, options.artifactRoot ?? path.join(options.productRoot, '.data', 'artifacts'));
  const security = options.security ?? loadSecurityConfig();

  const handler: http.RequestListener = async (request, response) => {
    const requestId = opaqueId('req');
    let fingerprint: string | undefined;
    try {
      const url = new URL(request.url ?? '/', 'http://hengzhun.local');
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, {
          status: 'ok',
          service: 'hengzhun-harness',
          version: '1.0.0',
          database: { engine: 'sqlite', quickCheck: database.quickCheck() }
        }, 'L0', requestId);
      }

      let authorization: SecurityResult;
      try {
        authorization = authorizeRequest(request.headers.authorization, request.socket.remoteAddress, security);
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
            tokenFingerprintFromHeader(request.headers.authorization) ?? null, requestId, nowIso()
          );
        });
        throw authError;
      }

      const context = { requestId, credentialFingerprint: fingerprint };
      if (request.method === 'POST' && url.pathname === '/v1/cases/drafts') {
        const input = caseCreateDraftSchema.parse(await readJson(request));
        const result = await service.createCaseDraft(input, context);
        return sendJson(response, result.status, result.response, 'L1', requestId);
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
    close: () => database.close()
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
