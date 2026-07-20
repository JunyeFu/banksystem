import fs from 'node:fs';
import path from 'node:path';
import { ArtifactStore } from './artifact-store';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import {
  buildActionContextEnvelope,
  estimateImageTokens,
  MODEL_CONTEXT_POLICIES,
  type ContextLevel,
  type ModelUsage
} from './context-envelope';
import type {
  CaseCreateDraftInput,
  CaseImportSubmitInput,
  DecisionSubmitInput,
  PlanCompileInput,
  RepairCandidateCreateInput,
  RunSubmitInput,
  ScheduleCreateInput,
  ScheduleDisableInput
} from './schemas';
import type { I8AuthoringSubmitInput, I8CasePrepareInput } from './i8/stage2-schemas';
import {
  i8CandidateBuildCompletionSchema,
  type I8CandidateBuildCompletionInput,
  type I8CandidateCompileInput
} from './i8/stage3-schemas';
import { buildCandidatePackage, compileExecutableActionPlan } from './i8/script-package-builder';
import {
  I8_STABILITY_VIEWPORTS,
  i8StabilityCompletionSchema,
  type I8StabilityCompletionInput
} from './i8/stage4-schemas';
import type {
  I8CandidateDecisionInput,
  I8CandidatePreviewInput,
  I8RunSubmitInput
} from './i8/stage5-schemas';
import { nextCronOccurrence, parseCron, validateTimeZone } from './cron';
import { canonicalJson, nowIso, opaqueId, requestHash, sha256 } from './utils';

interface RequestContext {
  requestId: string;
  credentialFingerprint?: string;
  actorType?: 'COZE' | 'SYSTEM';
}

interface IdempotentResult {
  status: number;
  response: Record<string, unknown>;
  replayed: boolean;
}

interface StoredIdempotency {
  request_hash: string;
  response_status: number;
  response_json: string;
}

export interface WorkerEvidenceInput {
  artifactType: 'JSON' | 'TEXT' | 'SCREENSHOT' | 'LOG' | 'REPORT' | 'DIAGNOSTIC';
  mediaType: string;
  redactionStatus: 'NOT_REQUIRED' | 'REDACTED' | 'QUARANTINED';
  extension: string;
  base64Content: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerCompletionInput {
  workerId: string;
  outcome: 'PASSED' | 'FAILED' | 'BLOCKED';
  summary: string;
  errorCode?: string;
  errorCategory?: 'TEST_FAILURE' | 'ENVIRONMENT' | 'EVIDENCE';
  retryable?: boolean;
  userActionRequired?: boolean;
  evidence: WorkerEvidenceInput[];
}

type ExecutionProfile = 'LOGIN_PROFILE' | 'ACCOUNT_OWNERSHIP' | 'AUTH_REJECTION_RECOVERY';
type AuthoringActionType = 'LOCATE' | 'INPUT' | 'TAP' | 'SCROLL';
type FailureClassification = 'ENVIRONMENT' | 'AUTHENTICATION' | 'CONTRACT' | 'LOCATOR' | 'ASSERTION' | 'MODEL' | 'TOOL';

const LOCATOR_REPAIRS: Record<string, { targetRef: string; selector: string }> = {
  LOGIN_USERNAME_LOCATOR_NOT_FOUND: { targetRef: 'LOGIN_USERNAME', selector: '[data-testid="login-username"]' },
  LOGIN_PASSWORD_LOCATOR_NOT_FOUND: { targetRef: 'LOGIN_PASSWORD', selector: '[data-testid="login-password"]' },
  LOGIN_SUBMIT_LOCATOR_NOT_FOUND: { targetRef: 'LOGIN_SUBMIT', selector: '[data-testid="login-submit"]' },
  PROFILE_NAME_LOCATOR_NOT_FOUND: { targetRef: 'PROFILE_NAME', selector: '[data-testid="customer-profile-name"]' },
  PROFILE_LINK_LOCATOR_NOT_FOUND: { targetRef: 'PROFILE_LINK', selector: 'a[href="/portal/profile"]' },
  PROFILE_DISPLAY_NAME_LOCATOR_NOT_FOUND: { targetRef: 'PROFILE_DISPLAY_NAME', selector: '[data-testid="profile-display-name"]' }
};

function classifyFailure(errorCategory?: string, errorCode?: string): FailureClassification {
  const code = String(errorCode ?? '').toUpperCase();
  if (errorCategory === 'ENVIRONMENT') return 'ENVIRONMENT';
  if (/AUTH|CREDENTIAL|LOGIN_REJECTED/.test(code)) return 'AUTHENTICATION';
  if (/CONTRACT|SCHEMA|HTTP_4\d\d/.test(code)) return 'CONTRACT';
  if (/LOCATOR|SELECTOR|ELEMENT_NOT_FOUND/.test(code)) return 'LOCATOR';
  if (/ASSERTION|MISMATCH|TEST_FAILURE/.test(code) || errorCategory === 'TEST_FAILURE') return 'ASSERTION';
  if (/MODEL|MIDSCENE|LLM/.test(code)) return 'MODEL';
  return 'TOOL';
}

const SCRIPT_CATALOG: Record<ExecutionProfile, string> = {
  LOGIN_PROFILE: 'worker/src/login-profile.cjs',
  ACCOUNT_OWNERSHIP: 'worker/src/account-ownership.cjs',
  AUTH_REJECTION_RECOVERY: 'worker/src/auth-rejection-recovery.cjs'
};

export class HarnessService {
  readonly artifacts: ArtifactStore;

  constructor(readonly database: HarnessDatabase, artifactRoot: string, readonly productRoot: string) {
    this.artifacts = new ArtifactStore(database, artifactRoot);
  }

  private validatedPlan(db: import('better-sqlite3').Database, namespace: string, planId: string, caseId: string, expectedCaseVersion: number): {
    case_id: string; case_version: number; script_id: string; script_path: string; script_configuration: string | null;
  } {
    const plan = db.prepare(`
      SELECT p.status, p.case_id, p.case_version, p.script_id, c.current_version,
             s.status AS script_status, sv.relative_path AS script_path,
             sv.configuration_json AS script_configuration
      FROM plans p
      JOIN cases c ON c.case_id = p.case_id
      LEFT JOIN scripts s ON s.script_id = p.script_id
      LEFT JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
      WHERE p.namespace = ? AND p.plan_id = ?
    `).get(namespace, planId) as Record<string, unknown> | undefined;
    if (!plan || plan.case_id !== caseId) throw new HarnessError(404, 'PLAN_NOT_FOUND', 'DOMAIN', '执行计划不存在。');
    if (Number(plan.case_version) !== expectedCaseVersion || Number(plan.current_version) !== expectedCaseVersion) {
      throw new HarnessError(409, 'CASE_VERSION_CONFLICT', 'CONCURRENCY', '案例或计划版本已变化。', false, true);
    }
    if (plan.status !== 'READY') throw new HarnessError(409, 'PLAN_NOT_RUNNABLE', 'DOMAIN', '计划当前不可执行。', false, true);
    if (!plan.script_id || plan.script_status !== 'SCRIPT_VALIDATED' || !plan.script_path) {
      throw new HarnessError(409, 'SCRIPT_NOT_VALIDATED', 'DOMAIN', '正式回归只能执行 SCRIPT_VALIDATED 脚本。', false, true);
    }
    return {
      case_id: String(plan.case_id), case_version: Number(plan.case_version), script_id: String(plan.script_id),
      script_path: String(plan.script_path), script_configuration: plan.script_configuration ? String(plan.script_configuration) : null
    };
  }

  private enqueueRun(db: import('better-sqlite3').Database, input: {
    namespace: string; caseId: string; caseVersion: number; planId: string; environment: 'local';
    credentialAlias: string; fixtureScope?: string; scheduleId?: string; scheduleExecutionId?: string;
  }, plan: { script_id: string; script_path: string; script_configuration: string | null }, timestamp: string): { runId: string; taskId: string } {
    const runId = opaqueId('run');
    const taskId = opaqueId('task');
    const fixtureNamespace = `fx-${sha256(`${input.namespace}:${runId}`).slice(0, 20)}`;
    const scriptConfiguration = plan.script_configuration ? JSON.parse(plan.script_configuration) as Record<string, unknown> : {};
    const i8Candidate = scriptConfiguration.mode === 'I8_CANDIDATE'
      ? {
          candidateId: String(scriptConfiguration.candidateId),
          relativeDirectory: String(scriptConfiguration.relativeDirectory),
          scriptHash: String(scriptConfiguration.scriptHash),
          manifestHash: String(scriptConfiguration.manifestHash)
        }
      : undefined;
    const payload = canonicalJson({
      executionEngine: 'PLAYWRIGHT',
      formalRegression: true,
      environment: input.environment,
      credentialAlias: input.credentialAlias,
      fixtureNamespace,
      fixtureScope: input.fixtureScope ?? fixtureNamespace,
      scriptId: plan.script_id,
      scriptPath: plan.script_path,
      ...(i8Candidate ? { candidate: i8Candidate } : { selectorOverrides: scriptConfiguration })
    });
    db.prepare(`
      INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, run_id, payload_json, version, created_at, updated_at)
      VALUES (?, ?, 'RUN_EXECUTE', 'QUEUED', 0, ?, ?, ?, 1, ?, ?)
    `).run(taskId, input.namespace, input.caseId, runId, payload, timestamp, timestamp);
    db.prepare(`
      INSERT INTO runs(
        run_id, namespace, case_id, case_version, plan_id, task_id, status,
        credential_alias, fixture_namespace, environment, fixture_scope,
        origin_schedule_id, schedule_execution_id, version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      runId, input.namespace, input.caseId, input.caseVersion, input.planId, taskId,
      input.credentialAlias, fixtureNamespace, input.environment, input.fixtureScope ?? fixtureNamespace,
      input.scheduleId ?? null, input.scheduleExecutionId ?? null, timestamp
    );
    return { runId, taskId };
  }

  private executionProfile(definition: Record<string, unknown>): ExecutionProfile | undefined {
    const explicit = definition.executionProfile;
    if (explicit === 'LOGIN_PROFILE' || explicit === 'ACCOUNT_OWNERSHIP' || explicit === 'AUTH_REJECTION_RECOVERY') return explicit;
    const route = String(definition.route ?? '').toLowerCase();
    if (route.includes('account')) return 'ACCOUNT_OWNERSHIP';
    if (route.includes('session') || route.includes('security') || route.includes('recovery')) return 'AUTH_REJECTION_RECOVERY';
    if (route.includes('login') || route.includes('profile')) return 'LOGIN_PROFILE';
    return undefined;
  }

  private ensureValidatedScript(
    db: import('better-sqlite3').Database,
    namespace: string,
    caseId: string,
    profile: ExecutionProfile,
    timestamp: string
  ): string {
    const existing = db.prepare(`SELECT script_id FROM scripts WHERE namespace = ? AND case_id = ? AND status = 'SCRIPT_VALIDATED'`)
      .get(namespace, caseId) as { script_id: string } | undefined;
    if (existing) return existing.script_id;
    const relativePath = SCRIPT_CATALOG[profile];
    const absolutePath = path.join(this.productRoot, ...relativePath.split('/'));
    if (!fs.existsSync(absolutePath)) {
      throw new HarnessError(409, 'VALIDATED_SCRIPT_UNAVAILABLE', 'ENVIRONMENT', '已验证脚本制品不存在。', false, true);
    }
    const scriptId = opaqueId('script');
    db.prepare(`
      INSERT INTO scripts(script_id, namespace, case_id, current_version, status, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'SCRIPT_VALIDATED', ?, ?)
    `).run(scriptId, namespace, caseId, timestamp, timestamp);
    db.prepare(`
      INSERT INTO script_versions(script_id, version, relative_path, sha256, validation_status, created_at)
      VALUES (?, 1, ?, ?, 'PASSED', ?)
    `).run(scriptId, relativePath, sha256(fs.readFileSync(absolutePath)), timestamp);
    return scriptId;
  }

  private ensureNamespace(db: import('better-sqlite3').Database, namespace: string, timestamp: string): void {
    db.prepare(`
      INSERT OR IGNORE INTO namespaces(namespace, status, version, created_at, updated_at)
      VALUES (?, 'ACTIVE', 1, ?, ?)
    `).run(namespace, timestamp, timestamp);
    const row = db.prepare('SELECT status FROM namespaces WHERE namespace = ?').get(namespace) as { status: string } | undefined;
    if (!row || row.status !== 'ACTIVE') {
      throw new HarnessError(403, 'NAMESPACE_NOT_ACTIVE', 'AUTHORIZATION', '命名空间不可用。');
    }
  }

  private verifiedI8Candidate(
    db: import('better-sqlite3').Database,
    namespace: string,
    candidateId: string
  ): Record<string, unknown> & { scriptSource: string; scriptRelativePath: string } {
    const row = db.prepare(`
      SELECT c.*, p.case_id, p.case_version, p.version AS executable_plan_version,
             prep.acceptance_summary_json,
             cert.certificate_id, cert.status AS certificate_status, cert.script_sha256 AS certificate_script_sha256
      FROM i8_script_candidates c
      JOIN i8_executable_plans p ON p.executable_plan_id = c.executable_plan_id
      JOIN i8_case_preparations prep ON prep.preparation_id = p.preparation_id
      LEFT JOIN i8_stability_certificates cert ON cert.candidate_id = c.candidate_id
      WHERE c.namespace = ? AND c.candidate_id = ?
    `).get(namespace, candidateId) as Record<string, unknown> | undefined;
    if (!row) throw new HarnessError(404, 'I8_CANDIDATE_NOT_FOUND', 'DOMAIN', '候选脚本不存在。');
    if (!row.certificate_id || row.certificate_status !== 'PASSED' || row.certificate_script_sha256 !== row.script_sha256) {
      throw new HarnessError(409, 'I8_STABILITY_CERTIFICATE_REQUIRED', 'DOMAIN', '只有持有有效稳定性证书的候选才能交付。', false, true);
    }
    const candidateRoot = path.resolve(this.productRoot, '.data', 'candidates');
    const directory = path.resolve(this.productRoot, ...String(row.relative_directory).split('/'));
    if (!directory.startsWith(`${candidateRoot}${path.sep}`)) {
      throw new HarnessError(409, 'I8_CANDIDATE_DIRECTORY_INVALID', 'EVIDENCE', '候选目录越过受管边界。', false, true);
    }
    const scriptPath = path.join(directory, 'script.cjs');
    const manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(scriptPath) || !fs.existsSync(manifestPath)) {
      throw new HarnessError(409, 'I8_CANDIDATE_PACKAGE_MISSING', 'EVIDENCE', '候选脚本包不完整。', false, true);
    }
    const scriptBytes = fs.readFileSync(scriptPath);
    const manifestText = fs.readFileSync(manifestPath, 'utf8');
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(manifestText) as Record<string, unknown>;
    } catch {
      throw new HarnessError(409, 'I8_CANDIDATE_MANIFEST_INVALID', 'EVIDENCE', '候选清单无法解析。', false, true);
    }
    if (sha256(scriptBytes) !== row.script_sha256 || sha256(canonicalJson(manifest)) !== row.manifest_sha256) {
      throw new HarnessError(409, 'I8_CANDIDATE_PACKAGE_HASH_MISMATCH', 'EVIDENCE', '候选脚本包Hash不匹配。', false, true);
    }
    if (manifest.candidateId !== row.candidate_id || manifest.scriptId !== row.script_id || manifest.scriptVersion !== row.script_version) {
      throw new HarnessError(409, 'I8_CANDIDATE_PACKAGE_IDENTITY_MISMATCH', 'EVIDENCE', '候选脚本包身份不匹配。', false, true);
    }
    return {
      ...row,
      scriptSource: scriptBytes.toString('utf8'),
      scriptRelativePath: `${String(row.relative_directory)}/script.cjs`
    };
  }

  private audit(
    db: import('better-sqlite3').Database,
    context: RequestContext,
    input: {
      namespace: string;
      runId?: string;
      taskId?: string;
      action: string;
      objectType: string;
      objectId: string;
      outcome: 'ACCEPTED' | 'REJECTED' | 'SUCCEEDED' | 'FAILED';
      details?: Record<string, unknown>;
    }
  ): void {
    db.prepare(`
      INSERT INTO audit_events(
        event_id, namespace, run_id, task_id, actor_type, action, object_type,
        object_id, outcome, correlation_id, credential_fingerprint, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opaqueId('evt'), input.namespace, input.runId ?? null, input.taskId ?? null,
      context.actorType ?? 'COZE', input.action, input.objectType, input.objectId, input.outcome, context.requestId,
      context.credentialFingerprint ?? null, JSON.stringify(input.details ?? {}), nowIso()
    );
  }

  private async idempotent(
    namespace: string,
    operation: string,
    idempotencyKey: string,
    request: unknown,
    context: RequestContext,
    execute: (db: import('better-sqlite3').Database, timestamp: string) => {
      status: number;
      response: Record<string, unknown>;
      objectType: string;
      objectId: string;
      taskId?: string;
      runId?: string;
    }
  ): Promise<IdempotentResult> {
    const hash = requestHash(request);
    return this.database.write(db => {
      const timestamp = nowIso();
      this.ensureNamespace(db, namespace, timestamp);
      const stored = db.prepare(`
        SELECT request_hash, response_status, response_json
        FROM idempotency_keys
        WHERE namespace = ? AND operation = ? AND idempotency_key = ?
      `).get(namespace, operation, idempotencyKey) as StoredIdempotency | undefined;
      if (stored) {
        if (stored.request_hash !== hash) {
          this.audit(db, context, {
            namespace, action: `${operation}.replay`, objectType: 'IDEMPOTENCY_KEY', objectId: idempotencyKey,
            outcome: 'REJECTED', details: { errorCode: 'IDEMPOTENCY_CONFLICT' }
          });
          throw new HarnessError(409, 'IDEMPOTENCY_CONFLICT', 'CONTRACT', '幂等键已被不同请求使用。');
        }
        const response = JSON.parse(stored.response_json) as Record<string, unknown>;
        return { status: stored.response_status, response: { ...response, replayed: true }, replayed: true };
      }
      const result = execute(db, timestamp);
      const response = { ...result.response, replayed: false };
      db.prepare(`
        INSERT INTO idempotency_keys(
          namespace, operation, idempotency_key, request_hash, response_status,
          response_json, object_type, object_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        namespace, operation, idempotencyKey, hash, result.status,
        JSON.stringify(response), result.objectType, result.objectId, timestamp
      );
      this.audit(db, context, {
        namespace, runId: result.runId, taskId: result.taskId, action: operation,
        objectType: result.objectType, objectId: result.objectId, outcome: 'ACCEPTED'
      });
      return { status: result.status, response, replayed: false };
    });
  }

  async createCaseDraft(input: CaseCreateDraftInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'case_create_draft', input.idempotencyKey, input, context, (db, timestamp) => {
      const caseId = opaqueId('case');
      const version = 1;
      const definition = {
        objective: input.objective,
        route: input.route,
        executionProfile: input.executionProfile ?? null,
        steps: input.steps,
        assertions: input.assertions,
        authoringActions: input.authoringActions ?? [],
        credentialAlias: input.credentialAlias ?? null
      };
      db.prepare(`
        INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
        VALUES (?, ?, ?, 'VALIDATED', ?, ?, ?, ?, ?)
      `).run(caseId, input.namespace, version, input.title, input.summary, input.riskLevel, timestamp, timestamp);
      db.prepare(`
        INSERT INTO case_versions(case_id, version, definition_json, content_hash, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(caseId, version, canonicalJson(definition), sha256(canonicalJson(definition)), input.actorRef, timestamp);
      let retrievalId: string | undefined;
      if (input.knowledgeRetrieval) {
        retrievalId = opaqueId('retrieval');
        db.prepare(`
          INSERT INTO knowledge_retrieval_events(
            retrieval_id, namespace, case_id, source_authority, query_hash,
            result_hash, citation_refs_json, created_at
          ) VALUES (?, ?, ?, 'COZE_KNOWLEDGE_BASE', ?, ?, ?, ?)
        `).run(
          retrievalId, input.namespace, caseId, sha256(input.knowledgeRetrieval.query),
          sha256(input.knowledgeRetrieval.resultSummary),
          canonicalJson(input.knowledgeRetrieval.citationRefs), timestamp
        );
      }
      return {
        status: 200,
        objectType: 'CASE',
        objectId: caseId,
        response: {
          caseId,
          version,
          status: 'VALIDATED',
          validationIssues: [],
          summary: input.summary,
          ...(retrievalId ? { knowledgeRetrievalId: retrievalId } : {})
        }
      };
    });
  }

  async importCases(input: CaseImportSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'case_import_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const batchId = opaqueId('import');
      const sourceHash = sha256(canonicalJson({ sourceFormat: input.sourceFormat, sourceRef: input.sourceRef, cases: input.cases }));
      db.prepare(`
        INSERT INTO case_import_batches(batch_id, namespace, source_format, source_ref, source_hash, item_count, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'IMPORTED', ?)
      `).run(batchId, input.namespace, input.sourceFormat, input.sourceRef, sourceHash, input.cases.length, timestamp);
      const insertItem = db.prepare(`
        INSERT INTO case_import_items(batch_id, item_ordinal, external_case_ref, case_id, content_hash)
        VALUES (?, ?, ?, ?, ?)
      `);
      const imported = input.cases.map((item, index) => {
        const caseId = opaqueId('case');
        const definition = {
          objective: item.objective,
          route: item.route,
          executionProfile: item.executionProfile,
          steps: item.steps,
          assertions: item.assertions,
          authoringActions: [],
          credentialAlias: null,
          import: { batchId, externalCaseRef: item.externalCaseRef, sourceFormat: input.sourceFormat }
        };
        const definitionJson = canonicalJson(definition);
        const contentHash = sha256(definitionJson);
        db.prepare(`
          INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
          VALUES (?, ?, 1, 'VALIDATED', ?, ?, ?, ?, ?)
        `).run(caseId, input.namespace, item.title, item.summary, item.riskLevel, timestamp, timestamp);
        db.prepare(`
          INSERT INTO case_versions(case_id, version, definition_json, content_hash, created_by, created_at)
          VALUES (?, 1, ?, ?, ?, ?)
        `).run(caseId, definitionJson, contentHash, input.actorRef, timestamp);
        insertItem.run(batchId, index + 1, item.externalCaseRef, caseId, contentHash);
        return { externalCaseRef: item.externalCaseRef, caseId, version: 1, status: 'VALIDATED' };
      });
      return {
        status: 200,
        objectType: 'CASE_IMPORT_BATCH',
        objectId: batchId,
        response: { batchId, status: 'IMPORTED', itemCount: imported.length, sourceHash, imported }
      };
    });
  }

  getCase(namespace: string, caseId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT c.*, cv.definition_json, cv.content_hash
        FROM cases c
        JOIN case_versions cv ON cv.case_id = c.case_id AND cv.version = c.current_version
        WHERE c.namespace = ? AND c.case_id = ?
      `).get(namespace, caseId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'CASE_NOT_FOUND', 'DOMAIN', '案例不存在。');
      return {
        caseId: row.case_id,
        namespace: row.namespace,
        version: row.current_version,
        status: row.status,
        title: row.title,
        summary: row.summary,
        riskLevel: row.risk_level,
        definition: JSON.parse(String(row.definition_json)),
        contentHash: row.content_hash,
        updatedAt: row.updated_at
      };
    });
  }

  async prepareI8Case(input: I8CasePrepareInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_case_prepare', input.idempotencyKey, input, context, (db, timestamp) => {
      const caseId = opaqueId('case');
      const preparationId = opaqueId('prep');
      const version = 1;
      const definition = {
        schemaVersion: input.draft.schemaVersion,
        objective: input.draft.objective,
        route: input.draft.route,
        executionProfile: null,
        steps: input.draft.steps,
        assertions: input.draft.assertions,
        authoringActions: [],
        credentialAlias: null,
        sourceDescriptionHash: sha256(input.caseDescription),
        knowledgeSnapshot: input.draft.knowledgeSnapshot
      };
      const definitionJson = canonicalJson(definition);
      const definitionHash = sha256(definitionJson);
      db.prepare(`
        INSERT INTO cases(case_id, namespace, current_version, status, title, summary, risk_level, created_at, updated_at)
        VALUES (?, ?, 1, 'VALIDATED', ?, ?, ?, ?, ?)
      `).run(caseId, input.namespace, input.draft.title, input.draft.summary, input.draft.riskLevel, timestamp, timestamp);
      db.prepare(`
        INSERT INTO case_versions(case_id, version, definition_json, content_hash, created_by, created_at)
        VALUES (?, 1, ?, ?, ?, ?)
      `).run(caseId, definitionJson, definitionHash, input.actorRef, timestamp);
      db.prepare(`
        INSERT INTO i8_case_preparations(
          preparation_id, namespace, case_id, case_version, source_description_hash,
          knowledge_snapshot_json, acceptance_summary_json, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, 'PREPARED', 1, ?, ?)
      `).run(
        preparationId,
        input.namespace,
        caseId,
        sha256(input.caseDescription),
        canonicalJson(input.draft.knowledgeSnapshot),
        canonicalJson(input.acceptanceSummary),
        timestamp,
        timestamp
      );
      return {
        status: 200,
        objectType: 'I8_CASE_PREPARATION',
        objectId: preparationId,
        response: {
          preparationId,
          version: 1,
          status: 'PREPARED',
          caseId,
          caseVersion: version,
          caseContentHash: definitionHash,
          knowledgeSnapshotId: input.draft.knowledgeSnapshot.knowledgeSnapshotId,
          knowledgeContentHash: input.draft.knowledgeSnapshot.contentHash,
          acceptanceSummary: input.acceptanceSummary,
          nextAction: 'HUMAN_CONFIRMATION_REQUIRED'
        }
      };
    });
  }

  async submitI8Authoring(input: I8AuthoringSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_authoring_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const row = db.prepare(`
        SELECT preparation_id, case_id, case_version, status, version
        FROM i8_case_preparations
        WHERE namespace = ? AND preparation_id = ?
      `).get(input.namespace, input.preparationId) as {
        preparation_id: string; case_id: string; case_version: number; status: string; version: number;
      } | undefined;
      if (!row) throw new HarnessError(404, 'I8_PREPARATION_NOT_FOUND', 'DOMAIN', 'I8 案例准备记录不存在。');
      if (row.version !== input.expectedVersion) {
        throw new HarnessError(409, 'I8_PREPARATION_VERSION_CONFLICT', 'CONCURRENCY', 'I8 案例准备版本已变化。', false, true, { currentVersion: row.version });
      }
      if (row.status !== 'PREPARED') {
        throw new HarnessError(409, 'I8_PREPARATION_NOT_CONFIRMABLE', 'DOMAIN', 'I8 案例准备记录当前不可确认。', false, true, { currentStatus: row.status });
      }
      const nextVersion = row.version + 1;
      if (input.confirmation.choice === 'REJECT') {
        db.prepare(`
          UPDATE i8_case_preparations
          SET status = 'REJECTED', confirmation_ref = ?, version = ?, updated_at = ?
          WHERE preparation_id = ? AND version = ?
        `).run(input.confirmation.confirmationRef, nextVersion, timestamp, row.preparation_id, row.version);
        return {
          status: 200,
          objectType: 'I8_CASE_PREPARATION',
          objectId: row.preparation_id,
          response: { preparationId: row.preparation_id, version: nextVersion, status: 'REJECTED', nextAction: 'NONE' }
        };
      }
      const intentPlan = input.intentPlan as NonNullable<I8AuthoringSubmitInput['intentPlan']>;
      if (intentPlan.caseId !== row.case_id || intentPlan.caseVersion !== row.case_version) {
        throw new HarnessError(409, 'I8_INTENT_CASE_MISMATCH', 'CONTRACT', 'IntentPlan 与已准备案例版本不一致。');
      }
      const intentJson = canonicalJson(intentPlan);
      const intentHash = sha256(intentJson);
      db.prepare(`
        UPDATE i8_case_preparations
        SET intent_plan_json = ?, intent_plan_hash = ?, status = 'AWAITING_STAGE3',
            confirmation_ref = ?, version = ?, updated_at = ?
        WHERE preparation_id = ? AND version = ?
      `).run(intentJson, intentHash, input.confirmation.confirmationRef, nextVersion, timestamp, row.preparation_id, row.version);
      return {
        status: 202,
        objectType: 'I8_CASE_PREPARATION',
        objectId: row.preparation_id,
        response: {
          preparationId: row.preparation_id,
          version: nextVersion,
          status: 'AWAITING_STAGE3',
          caseId: row.case_id,
          caseVersion: row.case_version,
          intentPlanHash: intentHash,
          nextAction: 'EXECUTABLE_PLAN_COMPILER_REQUIRED'
        }
      };
    });
  }

  getI8Authoring(namespace: string, preparationId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT p.preparation_id, p.case_id, p.case_version, p.status, p.version,
               p.acceptance_summary_json, p.intent_plan_hash, p.updated_at,
               c.title, c.risk_level
        FROM i8_case_preparations p
        JOIN cases c ON c.case_id = p.case_id
        WHERE p.namespace = ? AND p.preparation_id = ?
      `).get(namespace, preparationId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I8_PREPARATION_NOT_FOUND', 'DOMAIN', 'I8 案例准备记录不存在。');
      return {
        preparationId: row.preparation_id,
        version: row.version,
        status: row.status,
        caseId: row.case_id,
        caseVersion: row.case_version,
        caseTitle: row.title,
        riskLevel: row.risk_level,
        acceptanceSummary: JSON.parse(String(row.acceptance_summary_json)),
        ...(row.intent_plan_hash ? { intentPlanHash: row.intent_plan_hash } : {}),
        nextAction: row.status === 'PREPARED'
          ? 'HUMAN_CONFIRMATION_REQUIRED'
          : row.status === 'AWAITING_STAGE3'
            ? 'EXECUTABLE_PLAN_COMPILER_REQUIRED'
            : 'NONE',
        updatedAt: row.updated_at
      };
    });
  }

  async compileI8Candidate(input: I8CandidateCompileInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_candidate_compile', input.idempotencyKey, input, context, (db, timestamp) => {
      const preparation = db.prepare(`
        SELECT preparation_id, case_id, case_version, status, version, intent_plan_json, intent_plan_hash
        FROM i8_case_preparations
        WHERE namespace = ? AND preparation_id = ?
      `).get(input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (!preparation) throw new HarnessError(404, 'I8_PREPARATION_NOT_FOUND', 'DOMAIN', 'I8 案例准备记录不存在。');
      if (Number(preparation.version) !== input.expectedPreparationVersion) {
        throw new HarnessError(409, 'I8_PREPARATION_VERSION_CONFLICT', 'CONCURRENCY', 'I8 案例准备版本已变化。', false, true, { currentVersion: preparation.version });
      }
      if (preparation.status !== 'AWAITING_STAGE3' || !preparation.intent_plan_json || !preparation.intent_plan_hash) {
        throw new HarnessError(409, 'I8_INTENT_PLAN_NOT_READY', 'DOMAIN', '只有已确认的 IntentPlan 才能进入阶段3。', false, true);
      }
      const existing = db.prepare(`
        SELECT p.executable_plan_id, p.plan_hash, p.status, p.version, j.job_id, j.status AS job_status
        FROM i8_executable_plans p
        JOIN i8_candidate_build_jobs j ON j.executable_plan_id = p.executable_plan_id
        WHERE p.namespace = ? AND p.preparation_id = ?
      `).get(input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (existing) {
        return {
          status: 200,
          objectType: 'I8_EXECUTABLE_PLAN',
          objectId: String(existing.executable_plan_id),
          response: {
            preparationId: input.preparationId,
            executablePlanId: existing.executable_plan_id,
            planHash: existing.plan_hash,
            status: existing.status,
            version: existing.version,
            jobId: existing.job_id,
            jobStatus: existing.job_status,
            nextAction: existing.status === 'CANDIDATE_GENERATED' ? 'CANDIDATE_AVAILABLE' : 'AUTHORING_WORKER_REQUIRED'
          }
        };
      }
      let plan;
      try {
        plan = compileExecutableActionPlan(JSON.parse(String(preparation.intent_plan_json)), String(preparation.intent_plan_hash));
      } catch (error) {
        throw new HarnessError(409, error instanceof Error ? error.message : 'I8_EXECUTABLE_PLAN_REJECTED', 'CONTRACT', 'IntentPlan 无法编译为受控可执行计划。', false, true);
      }
      const planJson = canonicalJson(plan);
      const planHash = sha256(planJson);
      const jobId = opaqueId('buildjob');
      db.prepare(`
        INSERT INTO i8_executable_plans(
          executable_plan_id, namespace, preparation_id, case_id, case_version,
          intent_plan_hash, plan_json, plan_hash, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTABLE_PLAN_READY', 1, ?, ?)
      `).run(
        plan.executablePlanId, input.namespace, input.preparationId, preparation.case_id,
        preparation.case_version, preparation.intent_plan_hash, planJson, planHash, timestamp, timestamp
      );
      db.prepare(`
        INSERT INTO i8_candidate_build_jobs(job_id, namespace, executable_plan_id, status, version, created_at, updated_at)
        VALUES (?, ?, ?, 'QUEUED', 1, ?, ?)
      `).run(jobId, input.namespace, plan.executablePlanId, timestamp, timestamp);
      return {
        status: 202,
        objectType: 'I8_EXECUTABLE_PLAN',
        objectId: plan.executablePlanId,
        response: {
          preparationId: input.preparationId,
          executablePlanId: plan.executablePlanId,
          planHash,
          status: 'EXECUTABLE_PLAN_READY',
          version: 1,
          jobId,
          jobStatus: 'QUEUED',
          nextAction: 'AUTHORING_WORKER_REQUIRED'
        }
      };
    });
  }

  getI8Candidate(namespace: string, preparationId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT p.executable_plan_id, p.plan_hash, p.status AS plan_status, p.version AS plan_version,
               j.job_id, j.status AS job_status, j.error_code,
               c.candidate_id, c.script_id, c.script_version, c.dsl_hash, c.generator_version,
               c.script_sha256, c.manifest_sha256, c.source_chain_hash, c.status AS candidate_status, c.version AS candidate_version,
               b.batch_id AS stability_batch_id, b.status AS stability_status, b.error_code AS stability_error_code,
               cert.certificate_id, cert.runtime_fingerprint, cert.viewport_set_json, cert.validation_run_ids_json,
               cert.assertion_set_hash, cert.evidence_set_hash, cert.issued_at,
               (SELECT d.choice FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS delivery_choice,
               (SELECT d.effect FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS delivery_effect,
               (SELECT d.activated_plan_id FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS activated_plan_id,
               (SELECT d.created_at FROM i8_script_delivery_decisions d WHERE d.candidate_id = c.candidate_id ORDER BY d.created_at DESC LIMIT 1) AS delivery_created_at,
               (SELECT COUNT(*) FROM i8_stability_validation_runs r WHERE r.batch_id = b.batch_id AND r.status = 'PASSED') AS stability_passed_runs,
               (SELECT COUNT(*) FROM i8_stability_validation_runs r WHERE r.batch_id = b.batch_id AND r.status = 'FAILED') AS stability_failed_runs
        FROM i8_executable_plans p
        JOIN i8_candidate_build_jobs j ON j.executable_plan_id = p.executable_plan_id
        LEFT JOIN i8_script_candidates c ON c.executable_plan_id = p.executable_plan_id
        LEFT JOIN i8_stability_batches b ON b.candidate_id = c.candidate_id
        LEFT JOIN i8_stability_certificates cert ON cert.candidate_id = c.candidate_id
        WHERE p.namespace = ? AND p.preparation_id = ?
      `).get(namespace, preparationId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'I8_EXECUTABLE_PLAN_NOT_FOUND', 'DOMAIN', '阶段3可执行计划不存在。');
      return {
        preparationId,
        executablePlanId: row.executable_plan_id,
        planHash: row.plan_hash,
        status: row.plan_status,
        version: row.plan_version,
        job: { jobId: row.job_id, status: row.job_status, ...(row.error_code ? { errorCode: row.error_code } : {}) },
        ...(row.candidate_id ? {
          candidate: {
            candidateId: row.candidate_id,
            scriptId: row.script_id,
            scriptVersion: row.script_version,
            dslHash: row.dsl_hash,
            generatorVersion: row.generator_version,
            scriptHash: row.script_sha256,
            manifestHash: row.manifest_sha256,
            sourceChainHash: row.source_chain_hash,
            status: row.candidate_status,
            version: row.candidate_version
          },
          stability: {
            batchId: row.stability_batch_id,
            status: row.stability_status,
            passedRuns: Number(row.stability_passed_runs ?? 0),
            failedRuns: Number(row.stability_failed_runs ?? 0),
            requiredRuns: 6,
            viewportSet: ['1440x900', '390x844'],
            ...(row.stability_error_code ? { errorCode: row.stability_error_code } : {}),
            ...(row.certificate_id ? {
              certificate: {
                certificateId: row.certificate_id,
                runtimeFingerprint: row.runtime_fingerprint,
                viewportSet: JSON.parse(String(row.viewport_set_json)),
                validationRunIds: JSON.parse(String(row.validation_run_ids_json)),
                assertionSetHash: row.assertion_set_hash,
                evidenceSetHash: row.evidence_set_hash,
                status: 'PASSED',
                issuedAt: row.issued_at
              }
            } : {})
          },
          ...(row.delivery_choice ? {
            delivery: {
              choice: row.delivery_choice,
              effect: row.delivery_effect,
              ...(row.activated_plan_id ? { planId: row.activated_plan_id } : {}),
              decidedAt: row.delivery_created_at
            }
          } : {})
        } : {}),
        nextAction: row.candidate_status === 'SCRIPT_VALIDATED'
          ? 'ON_DEMAND_RUN_AVAILABLE'
          : row.candidate_status === 'SAVED'
            ? 'ACTIVATE_OR_REJECT_AVAILABLE'
            : row.candidate_status === 'REJECTED'
              ? 'NONE'
              : row.certificate_id
                ? 'HUMAN_DELIVERY_DECISION_REQUIRED'
          : row.stability_status === 'FAILED'
            ? 'CANDIDATE_REPAIR_REQUIRED'
            : row.candidate_id
              ? 'STABILITY_WORKER_REQUIRED'
              : row.job_status === 'FAILED' ? 'AUTHORING_REVIEW_REQUIRED' : 'AUTHORING_WORKER_REQUIRED'
      };
    });
  }

  async claimNextI8CandidateBuild(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE i8_candidate_build_jobs
        SET status = 'QUEUED', lease_owner = NULL, lease_expires_at = NULL, version = version + 1, updated_at = ?
        WHERE status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      const row = db.prepare(`
        SELECT j.job_id, j.namespace, j.executable_plan_id, p.plan_json, p.plan_hash
        FROM i8_candidate_build_jobs j
        JOIN i8_executable_plans p ON p.executable_plan_id = j.executable_plan_id
        WHERE j.status = 'QUEUED'
        ORDER BY j.created_at LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const leaseExpiresAt = new Date(Date.now() + 120_000).toISOString();
      db.prepare(`
        UPDATE i8_candidate_build_jobs
        SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?, attempt_count = attempt_count + 1,
            version = version + 1, updated_at = ?
        WHERE job_id = ? AND status = 'QUEUED'
      `).run(workerId, leaseExpiresAt, timestamp, row.job_id);
      db.prepare(`UPDATE i8_executable_plans SET status = 'AUTHORING', version = version + 1, updated_at = ? WHERE executable_plan_id = ?`)
        .run(timestamp, row.executable_plan_id);
      return {
        status: 'CLAIMED',
        jobId: row.job_id,
        namespace: row.namespace,
        executablePlanId: row.executable_plan_id,
        planHash: row.plan_hash,
        plan: JSON.parse(String(row.plan_json)),
        leaseExpiresAt
      };
    });
  }

  async completeI8CandidateBuild(jobId: string, inputValue: I8CandidateBuildCompletionInput): Promise<Record<string, unknown>> {
    const input = i8CandidateBuildCompletionSchema.parse(inputValue);
    const job = this.database.read(db => db.prepare(`
      SELECT j.*, p.plan_json, p.plan_hash, p.case_id, p.case_version, p.executable_plan_id
      FROM i8_candidate_build_jobs j
      JOIN i8_executable_plans p ON p.executable_plan_id = j.executable_plan_id
      WHERE j.job_id = ?
    `).get(jobId) as Record<string, unknown> | undefined);
    if (!job) throw new HarnessError(404, 'I8_CANDIDATE_JOB_NOT_FOUND', 'DOMAIN', '阶段3候选构建作业不存在。');
    if (job.status === 'COMPLETED') return this.getI8Candidate(String(job.namespace), this.database.read(db => String((db.prepare('SELECT preparation_id FROM i8_executable_plans WHERE executable_plan_id = ?').get(job.executable_plan_id) as { preparation_id: string }).preparation_id)));
    if (job.status !== 'RUNNING' || job.lease_owner !== input.workerId) throw new HarnessError(409, 'I8_CANDIDATE_JOB_LEASE_INVALID', 'CONCURRENCY', '候选构建作业租约无效。', false, true);
    if (job.plan_hash !== input.planHash) throw new HarnessError(409, 'I8_EXECUTABLE_PLAN_HASH_MISMATCH', 'CONCURRENCY', 'Worker 返回的计划 Hash 不匹配。', false, true);
    if (input.outcome === 'FAILED') {
      await this.database.write(db => {
        const timestamp = nowIso();
        db.prepare(`UPDATE i8_candidate_build_jobs SET status = 'FAILED', error_code = ?, lease_owner = NULL, lease_expires_at = NULL, version = version + 1, completed_at = ?, updated_at = ? WHERE job_id = ?`)
          .run(input.errorCode, timestamp, timestamp, jobId);
        db.prepare(`UPDATE i8_executable_plans SET status = 'FAILED', version = version + 1, updated_at = ? WHERE executable_plan_id = ?`)
          .run(timestamp, job.executable_plan_id);
      });
      return { jobId, status: 'FAILED', errorCode: input.errorCode, nextAction: 'AUTHORING_REVIEW_REQUIRED' };
    }
    let candidate;
    try {
      candidate = buildCandidatePackage(JSON.parse(String(job.plan_json)), input.verifiedActionRecords, String(job.created_at));
    } catch (error) {
      throw new HarnessError(409, error instanceof Error ? error.message : 'I8_CANDIDATE_BUILD_REJECTED', 'CONTRACT', 'Playwright 验证事实无法生成受控候选脚本。', false, true);
    }
    const relativeDirectory = `.data/candidates/${String(job.namespace)}/${candidate.candidateId}`;
    const directory = path.join(this.productRoot, ...relativeDirectory.split('/'));
    const candidateRoot = path.resolve(this.productRoot, '.data', 'candidates');
    const resolvedDirectory = path.resolve(directory);
    if (!resolvedDirectory.startsWith(`${candidateRoot}${path.sep}`)) throw new HarnessError(500, 'I8_CANDIDATE_DIRECTORY_INVALID', 'ENVIRONMENT', '候选目录越过受管根目录。');
    fs.mkdirSync(resolvedDirectory, { recursive: true });
    const scriptPath = path.join(resolvedDirectory, 'script.cjs');
    const manifestPath = path.join(resolvedDirectory, 'manifest.json');
    const manifestJson = canonicalJson(candidate.manifest);
    for (const [target, content] of [[scriptPath, candidate.scriptSource], [manifestPath, manifestJson]] as const) {
      if (fs.existsSync(target)) {
        if (fs.readFileSync(target, 'utf8') !== content) throw new HarnessError(409, 'I8_CANDIDATE_FILE_CONFLICT', 'CONCURRENCY', '候选文件已存在但内容不同。', false, true);
      } else {
        const temporary = `${target}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporary, target);
      }
    }
    await this.database.write(db => {
      const timestamp = nowIso();
      const current = db.prepare('SELECT status, lease_owner FROM i8_candidate_build_jobs WHERE job_id = ?').get(jobId) as { status: string; lease_owner: string | null };
      if (current.status !== 'RUNNING' || current.lease_owner !== input.workerId) throw new HarnessError(409, 'I8_CANDIDATE_JOB_LEASE_INVALID', 'CONCURRENCY', '写入候选前作业租约已变化。', false, true);
      const insertRecord = db.prepare(`
        INSERT INTO i8_verified_action_records(record_id, namespace, executable_plan_id, action_id, ordinal, record_json, record_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const record of input.verifiedActionRecords) {
        const recordJson = canonicalJson(record);
        insertRecord.run(opaqueId('fact'), job.namespace, job.executable_plan_id, record.actionId, record.ordinal, recordJson, sha256(recordJson), timestamp);
      }
      db.prepare(`
        INSERT INTO i8_script_candidates(
          candidate_id, namespace, executable_plan_id, script_id, script_version, dsl_version, dsl_json, dsl_hash,
          generator_version, relative_directory, script_sha256, manifest_json, manifest_sha256, source_chain_hash,
          status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'HENGZHUN_DSL_V1', ?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED', 1, ?, ?)
      `).run(
        candidate.candidateId, job.namespace, job.executable_plan_id, candidate.scriptId, candidate.scriptVersion,
        canonicalJson(candidate.dsl), candidate.dslHash, 'hengzhun-script-package-builder-1.0.0', relativeDirectory,
        candidate.scriptHash, manifestJson, candidate.manifestHash, candidate.sourceChainHash, timestamp, timestamp
      );
      db.prepare(`UPDATE i8_candidate_build_jobs SET status = 'COMPLETED', lease_owner = NULL, lease_expires_at = NULL, version = version + 1, completed_at = ?, updated_at = ? WHERE job_id = ?`)
        .run(timestamp, timestamp, jobId);
      db.prepare(`UPDATE i8_executable_plans SET status = 'CANDIDATE_GENERATED', version = version + 1, updated_at = ? WHERE executable_plan_id = ?`)
        .run(timestamp, job.executable_plan_id);
      const candidateSuffix = candidate.candidateId.slice('candidate_'.length);
      const batchId = `stability_${candidateSuffix}`;
      db.prepare(`
        INSERT INTO i8_stability_batches(batch_id, namespace, candidate_id, status, version, created_at, updated_at)
        VALUES (?, ?, ?, 'QUEUED', 1, ?, ?)
      `).run(batchId, job.namespace, candidate.candidateId, timestamp, timestamp);
      const insertStabilityRun = db.prepare(`
        INSERT INTO i8_stability_validation_runs(
          validation_run_id, batch_id, candidate_id, viewport_id, viewport_width, viewport_height,
          sequence_no, fixture_ref, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?)
      `);
      for (const viewport of I8_STABILITY_VIEWPORTS) {
        for (let sequence = 1; sequence <= 3; sequence += 1) {
          insertStabilityRun.run(
            `validation_${candidateSuffix}_${viewport.suffix}_${sequence}`,
            batchId,
            candidate.candidateId,
            viewport.viewportId,
            viewport.width,
            viewport.height,
            sequence,
            `fixture_${candidateSuffix}_${viewport.suffix}_${sequence}`,
            timestamp
          );
        }
      }
      this.audit(db, { requestId: `worker:${jobId}`, actorType: 'SYSTEM' }, {
        namespace: String(job.namespace), action: 'i8_candidate_build', objectType: 'I8_SCRIPT_CANDIDATE',
        objectId: candidate.candidateId, outcome: 'SUCCEEDED', details: { jobId, scriptHash: candidate.scriptHash, manifestHash: candidate.manifestHash }
      });
    });
    return {
      jobId,
      status: 'CANDIDATE_GENERATED',
      candidateId: candidate.candidateId,
      scriptId: candidate.scriptId,
      scriptVersion: candidate.scriptVersion,
      scriptHash: candidate.scriptHash,
      manifestHash: candidate.manifestHash,
      sourceChainHash: candidate.sourceChainHash,
      nextAction: 'I8_STAGE4_STABILITY_REQUIRED'
    };
  }

  async claimNextI8Stability(workerId: string): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const expired = db.prepare(`SELECT batch_id, candidate_id FROM i8_stability_batches WHERE status = 'RUNNING' AND lease_expires_at < ?`).all(timestamp) as Array<{batch_id: string; candidate_id: string}>;
      for (const item of expired) {
        db.prepare(`UPDATE i8_stability_validation_runs SET status = 'FAILED', error_code = 'STABILITY_WORKER_LEASE_EXPIRED', completed_at = ? WHERE batch_id = ? AND status IN ('QUEUED', 'RUNNING')`)
          .run(timestamp, item.batch_id);
        db.prepare(`UPDATE i8_stability_batches SET status = 'FAILED', error_code = 'STABILITY_WORKER_LEASE_EXPIRED', lease_owner = NULL, lease_expires_at = NULL, version = version + 1, completed_at = ?, updated_at = ? WHERE batch_id = ?`)
          .run(timestamp, timestamp, item.batch_id);
        db.prepare(`UPDATE i8_script_candidates SET status = 'VALIDATION_FAILED', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
          .run(timestamp, item.candidate_id);
      }
      const row = db.prepare(`
        SELECT b.batch_id, b.namespace, b.candidate_id, c.relative_directory, c.script_sha256, c.manifest_sha256,
               c.script_version, p.case_version, p.version AS executable_plan_version
        FROM i8_stability_batches b
        JOIN i8_script_candidates c ON c.candidate_id = b.candidate_id
        JOIN i8_executable_plans p ON p.executable_plan_id = c.executable_plan_id
        WHERE b.status = 'QUEUED'
        ORDER BY b.created_at, b.batch_id LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const leaseExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      db.prepare(`UPDATE i8_stability_batches SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?, version = version + 1, updated_at = ? WHERE batch_id = ? AND status = 'QUEUED'`)
        .run(workerId, leaseExpiresAt, timestamp, row.batch_id);
      db.prepare(`UPDATE i8_stability_validation_runs SET status = 'RUNNING' WHERE batch_id = ? AND status = 'QUEUED'`).run(row.batch_id);
      db.prepare(`UPDATE i8_script_candidates SET status = 'VALIDATING', version = version + 1, updated_at = ? WHERE candidate_id = ? AND status = 'GENERATED'`)
        .run(timestamp, row.candidate_id);
      const runs = db.prepare(`
        SELECT validation_run_id, viewport_id, viewport_width, viewport_height, sequence_no, fixture_ref
        FROM i8_stability_validation_runs WHERE batch_id = ?
        ORDER BY CASE viewport_id WHEN 'DESKTOP_1440X900' THEN 1 ELSE 2 END, sequence_no
      `).all(row.batch_id) as Array<Record<string, unknown>>;
      if (runs.length !== 6) throw new HarnessError(500, 'I8_STABILITY_RUN_SET_CORRUPT', 'EVIDENCE', '稳定性六次样本集合不完整。');
      return {
        status: 'CLAIMED',
        batchId: row.batch_id,
        namespace: row.namespace,
        candidateId: row.candidate_id,
        scriptVersion: row.script_version,
        caseVersion: row.case_version,
        executablePlanVersion: row.executable_plan_version,
        relativeDirectory: row.relative_directory,
        scriptHash: row.script_sha256,
        manifestHash: row.manifest_sha256,
        credentialAlias: 'i3-customer',
        leaseOwner: workerId,
        leaseExpiresAt,
        runs: runs.map(run => ({
          validationRunId: run.validation_run_id,
          viewportId: run.viewport_id,
          viewportWidth: run.viewport_width,
          viewportHeight: run.viewport_height,
          sequenceNo: run.sequence_no,
          fixtureRef: run.fixture_ref
        }))
      };
    });
  }

  async completeI8Stability(batchId: string, inputValue: I8StabilityCompletionInput): Promise<Record<string, unknown>> {
    const input = i8StabilityCompletionSchema.parse(inputValue);
    const snapshot = this.database.read(db => db.prepare(`
      SELECT b.*, c.script_sha256, c.namespace, p.case_version, p.version AS executable_plan_version
      FROM i8_stability_batches b
      JOIN i8_script_candidates c ON c.candidate_id = b.candidate_id
      JOIN i8_executable_plans p ON p.executable_plan_id = c.executable_plan_id
      WHERE b.batch_id = ?
    `).get(batchId) as Record<string, unknown> | undefined);
    if (!snapshot) throw new HarnessError(404, 'I8_STABILITY_BATCH_NOT_FOUND', 'DOMAIN', '稳定性验证批次不存在。');
    if (snapshot.status === 'PASSED' || snapshot.status === 'FAILED') {
      return { batchId, candidateId: snapshot.candidate_id, status: snapshot.status, replayed: true };
    }
    if (snapshot.status !== 'RUNNING' || snapshot.lease_owner !== input.workerId) throw new HarnessError(409, 'I8_STABILITY_LEASE_INVALID', 'CONCURRENCY', '稳定性验证租约无效。', false, true);
    if (snapshot.candidate_id !== input.candidateId || snapshot.script_sha256 !== input.scriptHash) throw new HarnessError(409, 'I8_STABILITY_CANDIDATE_MISMATCH', 'CONCURRENCY', '稳定性结果与候选脚本不匹配。', false, true);
    const expectedRuns = this.database.read(db => db.prepare(`SELECT * FROM i8_stability_validation_runs WHERE batch_id = ?`).all(batchId) as Array<Record<string, unknown>>);
    const expectedById = new Map(expectedRuns.map(run => [String(run.validation_run_id), run]));
    if (expectedById.size !== 6) throw new HarnessError(500, 'I8_STABILITY_RUN_SET_CORRUPT', 'EVIDENCE', '稳定性六次样本集合不完整。');
    const stabilityRoot = path.resolve(this.productRoot, '.data', 'stability');
    for (const result of input.runs) {
      const expected = expectedById.get(result.validationRunId);
      if (!expected || expected.viewport_id !== result.viewportId || Number(expected.viewport_width) !== result.viewportWidth || Number(expected.viewport_height) !== result.viewportHeight || Number(expected.sequence_no) !== result.sequenceNo || expected.fixture_ref !== result.fixtureRef) {
        throw new HarnessError(409, 'I8_STABILITY_RUN_IDENTITY_MISMATCH', 'CONTRACT', 'Worker返回的稳定性样本身份不匹配。', false, true);
      }
      for (const artifact of result.evidence) {
        const resolved = path.resolve(this.productRoot, ...artifact.relativePath.split('/'));
        if (!resolved.startsWith(`${stabilityRoot}${path.sep}`) || !fs.existsSync(resolved)) throw new HarnessError(409, 'I8_STABILITY_EVIDENCE_MISSING', 'EVIDENCE', '稳定性证据文件缺失或越界。', false, true);
        const bytes = fs.readFileSync(resolved);
        if (bytes.byteLength !== artifact.byteLength || sha256(bytes) !== artifact.sha256) throw new HarnessError(409, 'I8_STABILITY_EVIDENCE_HASH_MISMATCH', 'EVIDENCE', '稳定性证据Hash不匹配。', false, true);
      }
    }
    const allPassed = input.runs.every(run => run.outcome === 'PASSED');
    const assertionHashes = new Set(input.runs.map(run => run.assertionSetHash));
    const evidenceHashes = new Set(input.runs.map(run => run.evidenceSetHash));
    const consistent = assertionHashes.size === 1 && evidenceHashes.size === 1;
    const passed = allPassed && consistent;
    const errorCode = passed ? undefined : !allPassed
      ? input.runs.find(run => run.outcome === 'FAILED')?.errorCode ?? 'STABILITY_SAMPLE_FAILED'
      : assertionHashes.size !== 1 ? 'STABILITY_ASSERTION_SET_DRIFT' : 'STABILITY_EVIDENCE_SET_DRIFT';
    return this.database.write(db => {
      const timestamp = nowIso();
      const current = db.prepare('SELECT status, lease_owner FROM i8_stability_batches WHERE batch_id = ?').get(batchId) as {status: string; lease_owner: string | null};
      if (current.status !== 'RUNNING' || current.lease_owner !== input.workerId) throw new HarnessError(409, 'I8_STABILITY_LEASE_INVALID', 'CONCURRENCY', '写入稳定性结果前租约已变化。', false, true);
      const updateRun = db.prepare(`UPDATE i8_stability_validation_runs SET status = ?, duration_ms = ?, assertion_set_hash = ?, evidence_set_hash = ?, evidence_json = ?, error_code = ?, completed_at = ? WHERE validation_run_id = ? AND batch_id = ? AND status = 'RUNNING'`);
      for (const run of input.runs) {
        updateRun.run(run.outcome, run.durationMs, run.assertionSetHash, run.evidenceSetHash, canonicalJson(run.evidence), run.errorCode ?? null, timestamp, run.validationRunId, batchId);
      }
      let certificateId: string | undefined;
      if (passed) {
        certificateId = `certificate_${sha256(canonicalJson({ candidateId: input.candidateId, scriptHash: input.scriptHash, runtimeFingerprint: input.runtimeFingerprint })).slice(0, 40)}`;
        const runIds = input.runs.map(run => run.validationRunId);
        db.prepare(`
          INSERT INTO i8_stability_certificates(
            certificate_id, namespace, candidate_id, batch_id, script_sha256, case_version,
            executable_plan_version, runtime_fingerprint, viewport_set_json, validation_run_ids_json,
            assertion_set_hash, evidence_set_hash, status, issued_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?)
        `).run(
          certificateId, snapshot.namespace, input.candidateId, batchId, input.scriptHash,
          snapshot.case_version, snapshot.executable_plan_version, input.runtimeFingerprint,
          canonicalJson(I8_STABILITY_VIEWPORTS.map(viewport => ({ viewportId: viewport.viewportId, width: viewport.width, height: viewport.height, consecutivePasses: 3 }))),
          canonicalJson(runIds), [...assertionHashes][0], [...evidenceHashes][0], timestamp
        );
      }
      db.prepare(`UPDATE i8_stability_batches SET status = ?, lease_owner = NULL, lease_expires_at = NULL, runtime_fingerprint = ?, assertion_set_hash = ?, evidence_set_hash = ?, error_code = ?, version = version + 1, completed_at = ?, updated_at = ? WHERE batch_id = ?`)
        .run(passed ? 'PASSED' : 'FAILED', input.runtimeFingerprint, assertionHashes.size === 1 ? [...assertionHashes][0] : null, evidenceHashes.size === 1 ? [...evidenceHashes][0] : null, errorCode ?? null, timestamp, timestamp, batchId);
      db.prepare(`UPDATE i8_script_candidates SET status = ?, version = version + 1, updated_at = ? WHERE candidate_id = ?`)
        .run(passed ? 'STABILITY_CERTIFIED' : 'VALIDATION_FAILED', timestamp, input.candidateId);
      this.audit(db, { requestId: `worker:${batchId}`, actorType: 'SYSTEM' }, {
        namespace: String(snapshot.namespace), action: 'i8_stability_complete', objectType: 'I8_STABILITY_BATCH', objectId: batchId,
        outcome: passed ? 'SUCCEEDED' : 'REJECTED', details: { candidateId: input.candidateId, runCount: 6, certificateId: certificateId ?? null, errorCode: errorCode ?? null }
      });
      return {
        batchId,
        candidateId: input.candidateId,
        status: passed ? 'STABILITY_CERTIFIED' : 'VALIDATION_FAILED',
        passedRuns: input.runs.filter(run => run.outcome === 'PASSED').length,
        failedRuns: input.runs.filter(run => run.outcome === 'FAILED').length,
        ...(certificateId ? { certificateId, nextAction: 'I8_STAGE5_DELIVERY_REQUIRED' } : { errorCode, nextAction: 'CANDIDATE_REPAIR_REQUIRED' })
      };
    });
  }

  async previewI8Candidate(input: I8CandidatePreviewInput, context: RequestContext): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      this.ensureNamespace(db, input.namespace, timestamp);
      const candidate = this.verifiedI8Candidate(db, input.namespace, input.candidateId);
      const lines = candidate.scriptSource.replace(/\r\n/g, '\n').split('\n');
      const startIndex = input.cursor ? Number(input.cursor.slice('line:'.length)) : 0;
      if (!Number.isSafeInteger(startIndex) || startIndex < 0 || startIndex > lines.length) {
        throw new HarnessError(400, 'I8_PREVIEW_CURSOR_INVALID', 'CONTRACT', '脚本预览游标无效。');
      }
      const selected: string[] = [];
      for (let index = startIndex; index < lines.length && selected.length < input.limit; index += 1) {
        const trial = [...selected, lines[index] as string];
        const trialBody = {
          candidateId: candidate.candidate_id,
          scriptHash: candidate.script_sha256,
          startLine: startIndex + 1,
          endLine: startIndex + trial.length,
          lines: trial,
          nextCursor: startIndex + trial.length < lines.length ? `line:${startIndex + trial.length}` : null
        };
        if (Buffer.byteLength(JSON.stringify(trialBody), 'utf8') > 15 * 1024) {
          if (selected.length === 0) throw new HarnessError(413, 'OUTPUT_BUDGET_EXCEEDED', 'CONTRACT', '单行脚本超过安全预览预算。');
          break;
        }
        selected.push(lines[index] as string);
      }
      let download: Record<string, unknown> | undefined;
      if (input.includeDownload) {
        const token = opaqueId('download');
        const grantId = opaqueId('grant');
        const expiresAt = new Date(Date.parse(timestamp) + 5 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO i8_script_download_grants(
            grant_id, namespace, candidate_id, certificate_id, token_sha256,
            script_sha256, status, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `).run(
          grantId, input.namespace, candidate.candidate_id, candidate.certificate_id,
          sha256(token), candidate.script_sha256, expiresAt, timestamp
        );
        download = {
          grantId,
          href: `/v1/i8/downloads/${token}`,
          filename: `hengzhun-${candidate.script_id}-v${candidate.script_version}.cjs`,
          mediaType: 'text/javascript; charset=utf-8',
          sha256: candidate.script_sha256,
          expiresAt,
          oneTime: true
        };
      }
      this.audit(db, context, {
        namespace: input.namespace,
        action: input.includeDownload ? 'i8_candidate_preview_and_download_grant' : 'i8_candidate_preview',
        objectType: 'I8_SCRIPT_CANDIDATE',
        objectId: input.candidateId,
        outcome: 'ACCEPTED',
        details: { startLine: startIndex + 1, lineCount: selected.length, downloadGranted: input.includeDownload }
      });
      const endIndex = startIndex + selected.length;
      return {
        candidateId: candidate.candidate_id,
        caseId: candidate.case_id,
        caseVersion: candidate.case_version,
        executablePlanId: candidate.executable_plan_id,
        executablePlanVersion: candidate.executable_plan_version,
        scriptId: candidate.script_id,
        scriptVersion: candidate.script_version,
        scriptHash: candidate.script_sha256,
        generatorVersion: candidate.generator_version,
        certificate: {
          certificateId: candidate.certificate_id,
          status: 'PASSED',
          assertionSummary: JSON.parse(String(candidate.acceptance_summary_json)),
          evidenceHash: candidate.manifest_sha256
        },
        startLine: selected.length > 0 ? startIndex + 1 : 0,
        endLine: selected.length > 0 ? endIndex : 0,
        lines: selected,
        nextCursor: endIndex < lines.length ? `line:${endIndex}` : null,
        ...(download ? { download } : {})
      };
    });
  }

  async consumeI8Download(token: string): Promise<{ filename: string; mediaType: string; sha256: string; content: Buffer }> {
    const result = await this.database.write(db => {
      const timestamp = nowIso();
      const tokenHash = sha256(token);
      const grant = db.prepare(`
        SELECT * FROM i8_script_download_grants WHERE token_sha256 = ?
      `).get(tokenHash) as Record<string, unknown> | undefined;
      if (!grant || grant.status !== 'ACTIVE') return { state: 'UNAVAILABLE' as const };
      if (String(grant.expires_at) <= timestamp) {
        db.prepare(`UPDATE i8_script_download_grants SET status = 'EXPIRED' WHERE grant_id = ? AND status = 'ACTIVE'`).run(grant.grant_id);
        return { state: 'EXPIRED' as const };
      }
      const candidate = this.verifiedI8Candidate(db, String(grant.namespace), String(grant.candidate_id));
      if (candidate.script_sha256 !== grant.script_sha256 || candidate.certificate_id !== grant.certificate_id) {
        throw new HarnessError(409, 'I8_DOWNLOAD_BINDING_MISMATCH', 'EVIDENCE', '下载授权绑定已失效。', false, true);
      }
      db.prepare(`UPDATE i8_script_download_grants SET status = 'USED', used_at = ? WHERE grant_id = ? AND status = 'ACTIVE'`)
        .run(timestamp, grant.grant_id);
      this.audit(db, { requestId: `download:${grant.grant_id}`, actorType: 'SYSTEM' }, {
        namespace: String(grant.namespace),
        action: 'i8_candidate_download',
        objectType: 'I8_SCRIPT_CANDIDATE',
        objectId: String(grant.candidate_id),
        outcome: 'ACCEPTED',
        details: { grantId: grant.grant_id, scriptHash: grant.script_sha256 }
      });
      return {
        state: 'READY' as const,
        filename: `hengzhun-${candidate.script_id}-v${candidate.script_version}.cjs`,
        mediaType: 'text/javascript; charset=utf-8',
        sha256: String(candidate.script_sha256),
        content: Buffer.from(candidate.scriptSource, 'utf8')
      };
    });
    if (result.state === 'EXPIRED') throw new HarnessError(410, 'I8_DOWNLOAD_GRANT_EXPIRED', 'AUTHORIZATION', '下载授权已过期。');
    if (result.state === 'UNAVAILABLE') throw new HarnessError(404, 'I8_DOWNLOAD_GRANT_UNAVAILABLE', 'AUTHORIZATION', '下载授权不存在或已使用。');
    return result;
  }

  async decideI8Candidate(input: I8CandidateDecisionInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_candidate_decide', input.idempotencyKey, input, context, (db, timestamp) => {
      const candidate = this.verifiedI8Candidate(db, input.namespace, input.candidateId);
      if (Number(candidate.version) !== input.expectedCandidateVersion) {
        throw new HarnessError(409, 'I8_CANDIDATE_VERSION_CONFLICT', 'CONCURRENCY', '候选版本已变化。', false, true, { currentVersion: candidate.version });
      }
      if (!['STABILITY_CERTIFIED', 'SAVED'].includes(String(candidate.status))) {
        throw new HarnessError(409, 'I8_CANDIDATE_DECISION_NOT_ALLOWED', 'DOMAIN', '候选当前状态不接受交付决定。', false, true);
      }
      if (candidate.status === 'SAVED' && input.choice === 'SAVE_ONLY') {
        throw new HarnessError(409, 'I8_CANDIDATE_ALREADY_SAVED', 'DOMAIN', '候选已经保存。', false, true);
      }
      let effect: 'CANDIDATE_SAVED' | 'SCRIPT_VERSION_ACTIVATED' | 'CANDIDATE_REJECTED';
      let nextStatus: 'SAVED' | 'SCRIPT_VALIDATED' | 'REJECTED';
      let activatedPlanId: string | undefined;
      if (input.choice === 'SAVE_ONLY') {
        effect = 'CANDIDATE_SAVED';
        nextStatus = 'SAVED';
      } else if (input.choice === 'REJECT') {
        effect = 'CANDIDATE_REJECTED';
        nextStatus = 'REJECTED';
      } else {
        effect = 'SCRIPT_VERSION_ACTIVATED';
        nextStatus = 'SCRIPT_VALIDATED';
        const existingScript = db.prepare('SELECT namespace, case_id FROM scripts WHERE script_id = ?')
          .get(candidate.script_id) as { namespace: string; case_id: string } | undefined;
        if (existingScript && (existingScript.namespace !== input.namespace || existingScript.case_id !== candidate.case_id)) {
          throw new HarnessError(409, 'I8_SCRIPT_ID_CONFLICT', 'CONCURRENCY', '脚本标识已绑定其他案例。', false, true);
        }
        if (!existingScript) {
          db.prepare(`
            INSERT INTO scripts(script_id, namespace, case_id, current_version, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'SCRIPT_VALIDATED', ?, ?)
          `).run(candidate.script_id, input.namespace, candidate.case_id, candidate.script_version, timestamp, timestamp);
        }
        const configuration = canonicalJson({
          mode: 'I8_CANDIDATE',
          candidateId: candidate.candidate_id,
          relativeDirectory: candidate.relative_directory,
          scriptHash: candidate.script_sha256,
          manifestHash: candidate.manifest_sha256
        });
        const existingVersion = db.prepare('SELECT sha256, relative_path FROM script_versions WHERE script_id = ? AND version = ?')
          .get(candidate.script_id, candidate.script_version) as { sha256: string; relative_path: string } | undefined;
        if (existingVersion && (existingVersion.sha256 !== candidate.script_sha256 || existingVersion.relative_path !== candidate.scriptRelativePath)) {
          throw new HarnessError(409, 'I8_SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '脚本版本已绑定不同内容。', false, true);
        }
        if (!existingVersion) {
          db.prepare(`
            INSERT INTO script_versions(
              script_id, version, relative_path, sha256, validation_status,
              configuration_json, source_sha256, created_at
            ) VALUES (?, ?, ?, ?, 'PASSED', ?, ?, ?)
          `).run(
            candidate.script_id, candidate.script_version, candidate.scriptRelativePath,
            candidate.script_sha256, configuration, candidate.script_sha256, timestamp
          );
        }
        db.prepare(`UPDATE scripts SET current_version = ?, status = 'SCRIPT_VALIDATED', updated_at = ? WHERE script_id = ?`)
          .run(candidate.script_version, timestamp, candidate.script_id);
        activatedPlanId = `plan_i8_${sha256(String(candidate.executable_plan_id)).slice(0, 40)}`;
        const summary = canonicalJson({
          source: 'I8_DETERMINISTIC_BUILDER',
          candidateId: candidate.candidate_id,
          certificateId: candidate.certificate_id,
          scriptHash: candidate.script_sha256,
          formalRegression: true
        });
        const existingPlan = db.prepare('SELECT content_hash, script_id FROM plans WHERE plan_id = ?')
          .get(activatedPlanId) as { content_hash: string; script_id: string } | undefined;
        const contentHash = sha256(summary);
        if (existingPlan && (existingPlan.content_hash !== contentHash || existingPlan.script_id !== candidate.script_id)) {
          throw new HarnessError(409, 'I8_ACTIVATED_PLAN_CONFLICT', 'CONCURRENCY', '正式计划已绑定不同脚本。', false, true);
        }
        if (!existingPlan) {
          db.prepare(`
            INSERT INTO plans(
              plan_id, namespace, case_id, case_version, version, status, summary_json,
              content_hash, created_at, script_id, full_action_plan_json
            ) VALUES (?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, NULL)
          `).run(
            activatedPlanId, input.namespace, candidate.case_id, candidate.case_version,
            candidate.executable_plan_version, summary, contentHash, timestamp, candidate.script_id
          );
        }
      }
      const decisionId = opaqueId('delivery');
      db.prepare(`
        INSERT INTO i8_script_delivery_decisions(
          decision_id, namespace, candidate_id, certificate_id, expected_candidate_version,
          choice, reason, confirmation_ref, effect, case_version, executable_plan_id,
          executable_plan_version, activated_plan_id, script_id, script_version, script_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        decisionId, input.namespace, candidate.candidate_id, candidate.certificate_id,
        input.expectedCandidateVersion, input.choice, input.reason, input.confirmationRef,
        effect, candidate.case_version, candidate.executable_plan_id, candidate.executable_plan_version,
        activatedPlanId ?? null, candidate.script_id, candidate.script_version, candidate.script_sha256, timestamp
      );
      db.prepare(`UPDATE i8_script_candidates SET status = ?, version = version + 1, updated_at = ? WHERE candidate_id = ?`)
        .run(nextStatus, timestamp, candidate.candidate_id);
      return {
        status: 200,
        objectType: 'I8_SCRIPT_DELIVERY_DECISION',
        objectId: decisionId,
        response: {
          decisionId,
          candidateId: candidate.candidate_id,
          choice: input.choice,
          effect,
          status: nextStatus,
          candidateVersion: input.expectedCandidateVersion + 1,
          scriptId: candidate.script_id,
          scriptVersion: candidate.script_version,
          scriptHash: candidate.script_sha256,
          ...(activatedPlanId ? { planId: activatedPlanId, nextAction: 'ON_DEMAND_RUN_AVAILABLE' } : { nextAction: nextStatus === 'SAVED' ? 'ACTIVATE_OR_REJECT_AVAILABLE' : 'NONE' })
        }
      };
    });
  }

  async submitI8Run(input: I8RunSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'i8_run_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const row = db.prepare(`
        SELECT p.preparation_id, p.case_id, p.case_version, c.candidate_id, c.status AS candidate_status,
               c.script_id, c.script_version, c.script_sha256, d.activated_plan_id
        FROM i8_executable_plans p
        JOIN i8_script_candidates c ON c.executable_plan_id = p.executable_plan_id
        JOIN i8_script_delivery_decisions d ON d.candidate_id = c.candidate_id AND d.choice = 'ACTIVATE'
        WHERE p.namespace = ? AND p.preparation_id = ?
        ORDER BY d.created_at DESC LIMIT 1
      `).get(input.namespace, input.preparationId) as Record<string, unknown> | undefined;
      if (!row || row.candidate_status !== 'SCRIPT_VALIDATED' || !row.activated_plan_id) {
        throw new HarnessError(409, 'I8_SCRIPT_NOT_ACTIVATED', 'DOMAIN', '按需运行只接受已明确激活的持证脚本。', false, true);
      }
      const plan = this.validatedPlan(db, input.namespace, String(row.activated_plan_id), String(row.case_id), Number(row.case_version));
      const { runId, taskId } = this.enqueueRun(db, {
        namespace: input.namespace,
        caseId: String(row.case_id),
        caseVersion: Number(row.case_version),
        planId: String(row.activated_plan_id),
        environment: 'local',
        credentialAlias: input.credentialAlias
      }, plan, timestamp);
      return {
        status: 202,
        objectType: 'RUN',
        objectId: runId,
        runId,
        taskId,
        response: {
          taskId,
          runId,
          status: 'QUEUED',
          candidateId: row.candidate_id,
          caseId: row.case_id,
          caseVersion: row.case_version,
          planId: row.activated_plan_id,
          scriptId: row.script_id,
          scriptVersion: row.script_version,
          scriptHash: row.script_sha256
        }
      };
    });
  }

  async compilePlan(caseId: string, input: PlanCompileInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'plan_compile', input.idempotencyKey, { caseId, ...input }, context, (db, timestamp) => {
      const caseRow = db.prepare(`
        SELECT current_version, status FROM cases WHERE namespace = ? AND case_id = ?
      `).get(input.namespace, caseId) as { current_version: number; status: string } | undefined;
      if (!caseRow) throw new HarnessError(404, 'CASE_NOT_FOUND', 'DOMAIN', '案例不存在。');
      if (caseRow.current_version !== input.expectedCaseVersion) {
        throw new HarnessError(409, 'CASE_VERSION_CONFLICT', 'CONCURRENCY', '案例版本已变化。', false, true, { currentVersion: caseRow.current_version });
      }
      if (caseRow.status !== 'VALIDATED') {
        throw new HarnessError(409, 'CASE_NOT_VALIDATED', 'DOMAIN', '案例尚未通过结构校验。', false, true);
      }
      const versionRow = db.prepare('SELECT definition_json FROM case_versions WHERE case_id = ? AND version = ?')
        .get(caseId, input.expectedCaseVersion) as { definition_json: string };
      const definition = JSON.parse(versionRow.definition_json) as Record<string, unknown> & {
        steps: unknown[];
        assertions: unknown[];
        authoringActions?: Array<{
          actionType: AuthoringActionType;
          prompt: string;
          targetRef: 'PAGE' | 'LOGIN_USERNAME' | 'LOGIN_SSO_TAB' | 'LOGIN_SUBMIT';
          valueRef?: string;
          riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        }>;
      };
      const planId = opaqueId('plan');
      const taskId = opaqueId('task');
      const profile = this.executionProfile(definition);
      if (!profile) {
        throw new HarnessError(409, 'EXECUTION_PROFILE_UNSUPPORTED', 'DOMAIN', '案例未映射到受支持的执行配置。', false, true);
      }
      const isDeterministic = input.executionRoute === 'PLAYWRIGHT' && profile !== undefined;
      const planStatus = isDeterministic ? 'READY' : 'AUTHORING_REQUIRED';
      const authoringActions = definition.authoringActions ?? [];
      if (planStatus === 'AUTHORING_REQUIRED' && authoringActions.length === 0) {
        throw new HarnessError(409, 'AUTHORING_ACTIONS_REQUIRED', 'DOMAIN', '作者化计划必须包含结构化原子动作。', false, true);
      }
      const scriptId = isDeterministic
        ? this.ensureValidatedScript(db, input.namespace, caseId, profile as ExecutionProfile, timestamp)
        : opaqueId('script');
      if (!isDeterministic) {
        const relativePath = SCRIPT_CATALOG[profile];
        const absolutePath = path.join(this.productRoot, ...relativePath.split('/'));
        if (!fs.existsSync(absolutePath)) {
          throw new HarnessError(409, 'CANDIDATE_SCRIPT_UNAVAILABLE', 'ENVIRONMENT', '候选脚本制品不存在。', false, true);
        }
        db.prepare(`
          INSERT INTO scripts(script_id, namespace, case_id, current_version, status, created_at, updated_at)
          VALUES (?, ?, ?, 1, 'VALIDATING', ?, ?)
        `).run(scriptId, input.namespace, caseId, timestamp, timestamp);
        db.prepare(`
          INSERT INTO script_versions(script_id, version, relative_path, sha256, validation_status, created_at)
          VALUES (?, 1, ?, ?, 'VALIDATING', ?)
        `).run(scriptId, relativePath, sha256(fs.readFileSync(absolutePath)), timestamp);
      }
      const summary = {
        executionRoute: input.executionRoute,
        executionProfile: profile ?? null,
        stepCount: definition.steps.length,
        assertionCount: definition.assertions.length,
        workerRequired: true,
        scriptStatus: isDeterministic ? 'SCRIPT_VALIDATED' : 'VALIDATING'
      };
      const fullActionPlan = planStatus === 'AUTHORING_REQUIRED'
        ? { schemaVersion: 'i4-action-plan-v1', caseId, caseVersion: input.expectedCaseVersion, actions: authoringActions }
        : null;
      const planVersionRow = db.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM plans
        WHERE namespace = ? AND case_id = ? AND case_version = ?
      `).get(input.namespace, caseId, input.expectedCaseVersion) as { next_version: number };
      const planVersion = planVersionRow.next_version;
      db.prepare(`
        INSERT INTO plans(
          plan_id, namespace, case_id, case_version, version, status, summary_json,
          content_hash, created_at, script_id, full_action_plan_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planId, input.namespace, caseId, input.expectedCaseVersion, planVersion, planStatus,
        canonicalJson(summary), sha256(canonicalJson({ summary, fullActionPlan })), timestamp,
        scriptId, fullActionPlan ? canonicalJson(fullActionPlan) : null
      );
      if (planStatus === 'READY') {
        db.prepare(`
          INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, result_summary, version, created_at, updated_at, completed_at)
          VALUES (?, ?, 'PLAN_COMPILE', 'SUCCEEDED', 100, ?, ?, 1, ?, ?, ?)
        `).run(taskId, input.namespace, caseId, `计划 ${planId} 已绑定已验证脚本。`, timestamp, timestamp, timestamp);
      } else {
        db.prepare(`
          INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, payload_json, result_summary, version, created_at, updated_at)
          VALUES (?, ?, 'SCRIPT_VALIDATE', 'QUEUED', 0, ?, ?, ?, 1, ?, ?)
        `).run(taskId, input.namespace, caseId, canonicalJson({ planId, scriptId, mode: 'MIDSCENE_AUTHORING' }), '等待 Midscene 原子动作作者化。', timestamp, timestamp);
        db.prepare(`
          INSERT INTO action_plans(plan_id, task_id, script_id, cursor_ordinal, status, version, created_at, updated_at)
          VALUES (?, ?, ?, 1, 'QUEUED', 1, ?, ?)
        `).run(planId, taskId, scriptId, timestamp, timestamp);
        const insertAction = db.prepare(`
          INSERT INTO action_plan_items(
            action_id, plan_id, ordinal, action_type, prompt, target_ref, value_ref, risk_level, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `);
        authoringActions.forEach((action, index) => insertAction.run(
          opaqueId('action'), planId, index + 1, action.actionType, action.prompt, action.targetRef,
          action.valueRef ?? null, action.riskLevel, timestamp, timestamp
        ));
      }
      return {
        status: 200,
        objectType: 'PLAN',
        objectId: planId,
        taskId,
        response: {
          taskId,
          planId,
          scriptId,
          status: planStatus === 'READY' ? 'SUCCEEDED' : 'QUEUED',
          planStatus,
          caseId,
          caseVersion: input.expectedCaseVersion,
          planVersion
        }
      };
    });
  }

  async submitRun(input: RunSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'run_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const plan = this.validatedPlan(db, input.namespace, input.planId, input.caseId, input.expectedCaseVersion);
      const { runId, taskId } = this.enqueueRun(db, {
        namespace: input.namespace, caseId: input.caseId, caseVersion: input.expectedCaseVersion,
        planId: input.planId, environment: input.environment, credentialAlias: input.credentialAlias
      }, plan, timestamp);
      return {
        status: 200,
        objectType: 'RUN',
        objectId: runId,
        runId,
        taskId,
        response: { taskId, runId, status: 'QUEUED', namespace: input.namespace, caseId: input.caseId }
      };
    });
  }

  async createSchedule(input: ScheduleCreateInput, context: RequestContext): Promise<IdempotentResult> {
    try {
      parseCron(input.cronExpression);
      validateTimeZone(input.timezone);
    } catch (error) {
      throw new HarnessError(400, String((error as Error).message), 'CONTRACT', 'Cron 表达式或 IANA 时区无效。');
    }
    return this.idempotent(input.namespace, 'schedule_create', input.idempotencyKey, input, context, (db, timestamp) => {
      this.validatedPlan(db, input.namespace, input.planId, input.caseId, input.expectedCaseVersion);
      const scheduleId = opaqueId('schedule');
      const nextFireAt = nextCronOccurrence(input.cronExpression, input.timezone, new Date(timestamp)).toISOString();
      db.prepare(`
        INSERT INTO schedules(
          schedule_id, namespace, case_id, case_version, plan_id, credential_alias,
          cron_expression, timezone, environment, fixture_scope, misfire_policy,
          misfire_grace_seconds, max_retries, status, next_fire_at, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 1, ?, ?)
      `).run(
        scheduleId, input.namespace, input.caseId, input.expectedCaseVersion, input.planId,
        input.credentialAlias, input.cronExpression, input.timezone, input.environment,
        input.fixtureScope, input.misfirePolicy, input.misfireGraceSeconds, input.maxRetries,
        nextFireAt, timestamp, timestamp
      );
      return {
        status: 200, objectType: 'SCHEDULE', objectId: scheduleId,
        response: { scheduleId, status: 'ACTIVE', version: 1, nextFireAt, cronExpression: input.cronExpression, timezone: input.timezone }
      };
    });
  }

  getSchedule(namespace: string, scheduleId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM schedule_executions e WHERE e.schedule_id = s.schedule_id) AS execution_count,
          (SELECT status FROM schedule_executions e WHERE e.schedule_id = s.schedule_id ORDER BY scheduled_for DESC LIMIT 1) AS last_execution_status
        FROM schedules s WHERE s.namespace = ? AND s.schedule_id = ?
      `).get(namespace, scheduleId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'SCHEDULE_NOT_FOUND', 'DOMAIN', '调度不存在。');
      return {
        scheduleId: row.schedule_id, caseId: row.case_id, caseVersion: row.case_version, planId: row.plan_id,
        cronExpression: row.cron_expression, timezone: row.timezone, environment: row.environment,
        fixtureScope: row.fixture_scope, misfirePolicy: row.misfire_policy,
        misfireGraceSeconds: row.misfire_grace_seconds, maxRetries: row.max_retries,
        status: row.status, nextFireAt: row.next_fire_at, lastEvaluatedAt: row.last_evaluated_at,
        pausedIncidentId: row.paused_incident_id, executionCount: row.execution_count,
        lastExecutionStatus: row.last_execution_status, version: row.version, updatedAt: row.updated_at
      };
    });
  }

  async disableSchedule(input: ScheduleDisableInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'schedule_disable', input.idempotencyKey, input, context, (db, timestamp) => {
      const row = db.prepare('SELECT version, status FROM schedules WHERE namespace = ? AND schedule_id = ?')
        .get(input.namespace, input.scheduleId) as { version: number; status: string } | undefined;
      if (!row) throw new HarnessError(404, 'SCHEDULE_NOT_FOUND', 'DOMAIN', '调度不存在。');
      if (row.version !== input.expectedVersion) throw new HarnessError(409, 'TARGET_VERSION_CONFLICT', 'CONCURRENCY', '调度版本已变化。', false, true, { currentVersion: row.version });
      if (row.status !== 'DISABLED') db.prepare(`UPDATE schedules SET status = 'DISABLED', version = version + 1, updated_at = ? WHERE schedule_id = ?`)
        .run(timestamp, input.scheduleId);
      return { status: 200, objectType: 'SCHEDULE', objectId: input.scheduleId,
        response: { scheduleId: input.scheduleId, status: 'DISABLED', version: row.status === 'DISABLED' ? row.version : row.version + 1, reason: input.reason } };
    });
  }

  async tickSchedules(now = new Date()): Promise<Record<string, number>> {
    return this.database.write(db => {
      const due = db.prepare(`SELECT * FROM schedules WHERE status = 'ACTIVE' AND next_fire_at <= ? ORDER BY next_fire_at`)
        .all(now.toISOString()) as Array<Record<string, unknown>>;
      const counters = { evaluated: due.length, queued: 0, skippedMisfire: 0, skippedMutex: 0 };
      for (const schedule of due) {
        const occurrences: Date[] = [];
        let occurrence = new Date(String(schedule.next_fire_at));
        while (occurrence <= now && occurrences.length < 600_000) {
          occurrences.push(occurrence);
          occurrence = nextCronOccurrence(String(schedule.cron_expression), String(schedule.timezone), occurrence);
        }
        const runOnceIndex = schedule.misfire_policy === 'RUN_ONCE' ? occurrences.length - 1 : -1;
        occurrences.forEach((scheduledFor, index) => {
          const scheduledIso = scheduledFor.toISOString();
          const existing = db.prepare('SELECT execution_id FROM schedule_executions WHERE schedule_id = ? AND scheduled_for = ?')
            .get(schedule.schedule_id, scheduledIso) as { execution_id: string } | undefined;
          if (existing) return;
          const lateSeconds = Math.max(0, (now.getTime() - scheduledFor.getTime()) / 1000);
          const misfired = lateSeconds > Number(schedule.misfire_grace_seconds);
          if (misfired && (schedule.misfire_policy === 'SKIP' || index !== runOnceIndex)) {
            db.prepare(`INSERT INTO schedule_executions(execution_id, schedule_id, namespace, scheduled_for, status, reason_code, created_at, updated_at, completed_at)
              VALUES (?, ?, ?, ?, 'SKIPPED_MISFIRE', 'MISFIRE_POLICY', ?, ?, ?)`)
              .run(opaqueId('execution'), schedule.schedule_id, schedule.namespace, scheduledIso, now.toISOString(), now.toISOString(), now.toISOString());
            counters.skippedMisfire += 1;
            return;
          }
          const locked = db.prepare(`SELECT run_id FROM runs WHERE environment = ? AND fixture_scope = ? AND status IN ('QUEUED', 'RUNNING') LIMIT 1`)
            .get(schedule.environment, schedule.fixture_scope) as { run_id: string } | undefined;
          if (locked) {
            db.prepare(`INSERT INTO schedule_executions(execution_id, schedule_id, namespace, scheduled_for, status, reason_code, created_at, updated_at, completed_at)
              VALUES (?, ?, ?, ?, 'SKIPPED_MUTEX', 'ENVIRONMENT_FIXTURE_SCOPE_BUSY', ?, ?, ?)`)
              .run(opaqueId('execution'), schedule.schedule_id, schedule.namespace, scheduledIso, now.toISOString(), now.toISOString(), now.toISOString());
            counters.skippedMutex += 1;
            return;
          }
          const executionId = opaqueId('execution');
          db.prepare(`INSERT INTO schedule_executions(execution_id, schedule_id, namespace, scheduled_for, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`)
            .run(executionId, schedule.schedule_id, schedule.namespace, scheduledIso, now.toISOString(), now.toISOString());
          const plan = this.validatedPlan(db, String(schedule.namespace), String(schedule.plan_id), String(schedule.case_id), Number(schedule.case_version));
          const run = this.enqueueRun(db, {
            namespace: String(schedule.namespace), caseId: String(schedule.case_id), caseVersion: Number(schedule.case_version),
            planId: String(schedule.plan_id), environment: 'local', credentialAlias: String(schedule.credential_alias),
            fixtureScope: String(schedule.fixture_scope), scheduleId: String(schedule.schedule_id), scheduleExecutionId: executionId
          }, plan, now.toISOString());
          db.prepare(`UPDATE schedule_executions SET status = 'QUEUED', run_id = ?, task_id = ?, updated_at = ? WHERE execution_id = ?`)
            .run(run.runId, run.taskId, now.toISOString(), executionId);
          counters.queued += 1;
        });
        db.prepare(`UPDATE schedules SET next_fire_at = ?, last_evaluated_at = ?, updated_at = ? WHERE schedule_id = ?`)
          .run(occurrence.toISOString(), now.toISOString(), now.toISOString(), schedule.schedule_id);
      }
      return counters;
    });
  }

  async claimNextRun(workerId: string, leaseSeconds = 300): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE tasks
        SET status = 'QUEUED', progress = 0, lease_owner = NULL, lease_expires_at = NULL,
            version = version + 1, updated_at = ?
        WHERE task_type = 'RUN_EXECUTE' AND status = 'RUNNING'
          AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      db.prepare(`
        UPDATE runs SET status = 'QUEUED', version = version + 1
        WHERE task_id IN (SELECT task_id FROM tasks WHERE task_type = 'RUN_EXECUTE' AND status = 'QUEUED')
          AND status = 'RUNNING'
      `).run();

      const row = db.prepare(`
        SELECT t.task_id, t.namespace, t.case_id, t.run_id, t.payload_json,
               r.case_version, r.plan_id, cv.definition_json
        FROM tasks t
        JOIN runs r ON r.task_id = t.task_id
        JOIN case_versions cv ON cv.case_id = r.case_id AND cv.version = r.case_version
        WHERE t.task_type = 'RUN_EXECUTE' AND t.status = 'QUEUED'
        ORDER BY t.created_at ASC
        LIMIT 1
      `).get() as {
        task_id: string; namespace: string; case_id: string; run_id: string;
        payload_json: string; case_version: number; plan_id: string; definition_json: string;
      } | undefined;
      if (!row) return { status: 'EMPTY' };

      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      db.prepare(`
        UPDATE tasks SET status = 'RUNNING', progress = 10, lease_owner = ?, lease_expires_at = ?,
            attempt_count = attempt_count + 1, version = version + 1, updated_at = ?
        WHERE task_id = ? AND status = 'QUEUED'
      `).run(workerId, leaseExpiresAt, timestamp, row.task_id);
      db.prepare(`
        UPDATE runs SET status = 'RUNNING', version = version + 1,
            started_at = COALESCE(started_at, ?) WHERE run_id = ?
      `).run(timestamp, row.run_id);
      db.prepare(`
        UPDATE schedule_executions SET status = 'RUNNING', updated_at = ?
        WHERE execution_id = (SELECT schedule_execution_id FROM runs WHERE run_id = ?)
          AND status IN ('QUEUED', 'RETRY_QUEUED')
      `).run(timestamp, row.run_id);
      db.prepare(`
        INSERT INTO audit_events(
          event_id, namespace, run_id, task_id, actor_type, action, object_type,
          object_id, outcome, correlation_id, details_json, created_at
        ) VALUES (?, ?, ?, ?, 'WORKER', 'run.claim', 'RUN', ?, 'ACCEPTED', ?, ?, ?)
      `).run(opaqueId('evt'), row.namespace, row.run_id, row.task_id, row.run_id,
        opaqueId('worker'), JSON.stringify({ workerId, leaseExpiresAt }), timestamp);
      return {
        status: 'CLAIMED',
        taskId: row.task_id,
        runId: row.run_id,
        namespace: row.namespace,
        caseId: row.case_id,
        caseVersion: row.case_version,
        planId: row.plan_id,
        definition: JSON.parse(row.definition_json),
        execution: JSON.parse(row.payload_json),
        leaseExpiresAt
      };
    });
  }

  async claimNextAuthoringAction(workerId: string, visualContext?: {
    viewportWidth: number;
    viewportHeight: number;
    tokenizerId: string;
  }, leaseSeconds = 360): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE action_execution_slots SET status = 'EXPIRED', version = version + 1, updated_at = ?
        WHERE status = 'ACTIVE' AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      db.prepare(`
        UPDATE action_plan_items SET status = 'PENDING', updated_at = ?
        WHERE status = 'RUNNING' AND action_id IN (
          SELECT action_id FROM action_execution_slots WHERE status = 'EXPIRED'
        )
      `).run(timestamp);
      const row = db.prepare(`
        SELECT ap.plan_id, ap.task_id, ap.script_id, ap.cursor_ordinal, ap.previous_action_summary_json,
               ap.last_observation_json, ap.current_page_state_json,
               p.namespace, p.case_id, p.case_version, p.summary_json,
               current.action_id, current.action_type, current.prompt, current.target_ref, current.value_ref, current.risk_level,
               current.context_level, current.context_upgrade_reason_code,
               next.action_type AS next_type, next.prompt AS next_prompt,
               cap.status AS capability_status, locate_cap.status AS locate_capability_status
        FROM action_plans ap
        JOIN plans p ON p.plan_id = ap.plan_id
        JOIN action_plan_items current ON current.plan_id = ap.plan_id AND current.ordinal = ap.cursor_ordinal
        LEFT JOIN action_plan_items next ON next.plan_id = ap.plan_id AND next.ordinal = ap.cursor_ordinal + 1
        LEFT JOIN midscene_action_capabilities cap ON cap.action_type = current.action_type
        LEFT JOIN midscene_action_capabilities locate_cap ON locate_cap.action_type = 'LOCATE'
        WHERE ap.status IN ('QUEUED', 'RUNNING') AND current.status = 'PENDING'
          AND NOT EXISTS (
            SELECT 1 FROM action_execution_slots active
            WHERE active.plan_id = ap.plan_id AND active.status = 'ACTIVE'
          )
        ORDER BY ap.created_at ASC
        LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const slotId = opaqueId('slot');
      const contextAuditId = opaqueId('ctxaudit');
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      const risk = String(row.risk_level);
      const capability = String(row.capability_status ?? 'UNVERIFIED');
      const locateCapability = String(row.locate_capability_status ?? 'UNVERIFIED');
      const executionMode: 'MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY' | 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE' | 'PLAYWRIGHT_ONLY' = risk !== 'HIGH' && capability === 'VERIFIED'
        ? 'MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY'
        : locateCapability === 'VERIFIED'
          ? 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE'
          : 'PLAYWRIGHT_ONLY';
      const contextLevel = String(row.context_level ?? 'CTX-L1') as ContextLevel;
      const globalExecutionSummary = JSON.parse(String(row.summary_json)) as Record<string, unknown>;
      const executionProfile = ['LOGIN_PROFILE', 'ACCOUNT_OWNERSHIP', 'AUTH_REJECTION_RECOVERY']
        .includes(String(globalExecutionSummary.executionProfile))
        ? globalExecutionSummary.executionProfile as ExecutionProfile
        : null;
      const assertionCount = typeof globalExecutionSummary.assertionCount === 'number'
        ? globalExecutionSummary.assertionCount
        : null;
      const currentAction = {
        actionType: row.action_type as AuthoringActionType,
        prompt: String(row.prompt),
        targetRef: row.target_ref as 'PAGE' | 'LOGIN_USERNAME' | 'LOGIN_SSO_TAB' | 'LOGIN_SUBMIT',
        valueRef: row.value_ref ? row.value_ref as 'SYNTHETIC_TEXT' : null,
        riskLevel: row.risk_level as 'LOW' | 'MEDIUM' | 'HIGH',
        executionMode
      };
      const contextEnvelope = buildActionContextEnvelope({
        contextLevel,
        tokenizerId: visualContext?.tokenizerId ?? 'mimo-v2.5-conservative-v1',
        imageTokenEstimate: estimateImageTokens(visualContext?.viewportWidth ?? 1024, visualContext?.viewportHeight ?? 520),
        workerId,
        slotId,
        leaseExpiresAt,
        currentAction,
        previousActionSummary: row.previous_action_summary_json ? JSON.parse(String(row.previous_action_summary_json)) : null,
        nextActionPreview: row.next_type ? { actionType: row.next_type as AuthoringActionType, prompt: String(row.next_prompt) } : null,
        recentFacts: row.last_observation_json ? JSON.parse(String(row.last_observation_json)) : null,
        currentPageState: row.current_page_state_json ? JSON.parse(String(row.current_page_state_json)) : null,
        minimalDependencyCone: {
          caseId: String(row.case_id),
          caseVersion: Number(row.case_version),
          executionProfile,
          assertionCount
        }
      });
      const contextEnvelopeHash = sha256(canonicalJson(contextEnvelope));
      db.prepare(`
        INSERT INTO action_execution_slots(
          slot_id, plan_id, task_id, action_id, lease_owner, lease_expires_at, status, version,
          created_at, updated_at, context_level, context_envelope_hash
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?)
      `).run(
        slotId, row.plan_id, row.task_id, row.action_id, workerId, leaseExpiresAt,
        timestamp, timestamp, contextEnvelope.contextLevel, contextEnvelopeHash
      );
      db.prepare(`
        INSERT INTO context_budget_audits(
          audit_id, namespace, plan_id, task_id, action_id, slot_id, consumer_type, context_level,
          model_context_limit_tokens, input_budget_tokens, reserved_output_tokens, estimated_input_tokens,
          image_token_estimate, tokenizer_id, budget_decision, redaction_profile_id,
          context_envelope_hash, upgrade_reason_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        contextAuditId, row.namespace, row.plan_id, row.task_id, row.action_id, slotId,
        contextEnvelope.consumerType, contextEnvelope.contextLevel, contextEnvelope.modelContextLimitTokens,
        contextEnvelope.inputBudgetTokens, contextEnvelope.reservedOutputTokens,
        contextEnvelope.estimatedInputTokens, contextEnvelope.imageTokenEstimate, contextEnvelope.tokenizerId,
        contextEnvelope.budgetDecision, contextEnvelope.redactionProfileId, contextEnvelopeHash,
        row.context_upgrade_reason_code ?? null, timestamp
      );
      db.prepare(`UPDATE action_plan_items SET status = 'RUNNING', updated_at = ? WHERE action_id = ?`)
        .run(timestamp, row.action_id);
      db.prepare(`UPDATE action_plans SET status = 'RUNNING', version = version + 1, updated_at = ? WHERE plan_id = ?`)
        .run(timestamp, row.plan_id);
      db.prepare(`UPDATE tasks SET status = 'RUNNING', progress = 10, version = version + 1, updated_at = ? WHERE task_id = ?`)
        .run(timestamp, row.task_id);
      return {
        status: 'CLAIMED',
        taskId: row.task_id,
        planId: row.plan_id,
        scriptId: row.script_id,
        slotId,
        actionId: row.action_id,
        contextAuditId,
        contextEnvelopeHash,
        contextEnvelope
      };
    });
  }

  async completeAuthoringAction(taskId: string, input: {
    workerId: string;
    slotId: string;
    outcome: 'VERIFIED_PASSED' | 'FAILED' | 'AMBIGUOUS';
    summary: string;
    pageState: Record<string, unknown>;
    verification: { dom: boolean; url: boolean; request: boolean; business: boolean };
    contextAuditId: string;
    contextEnvelopeHash: string;
    modelUsage: ModelUsage;
  }): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const slot = db.prepare(`
        SELECT s.*, i.ordinal, i.action_type, i.context_level AS item_context_level,
               ap.cursor_ordinal, ap.script_id, a.audit_id, a.budget_decision, a.completed_at AS audit_completed_at
        FROM action_execution_slots s
        JOIN action_plan_items i ON i.action_id = s.action_id
        JOIN action_plans ap ON ap.plan_id = s.plan_id
        JOIN context_budget_audits a ON a.slot_id = s.slot_id
        WHERE s.slot_id = ? AND s.task_id = ?
      `).get(input.slotId, taskId) as Record<string, unknown> | undefined;
      if (!slot) throw new HarnessError(404, 'ACTION_SLOT_NOT_FOUND', 'DOMAIN', '动作租约不存在。');
      if (slot.status !== 'ACTIVE' || slot.lease_owner !== input.workerId || String(slot.lease_expires_at) < timestamp) {
        throw new HarnessError(409, 'ACTION_LEASE_CONFLICT', 'CONCURRENCY', '动作租约已失效。', false, true);
      }
      if (slot.audit_id !== input.contextAuditId || slot.context_envelope_hash !== input.contextEnvelopeHash) {
        throw new HarnessError(409, 'ACTION_CONTEXT_AUDIT_CONFLICT', 'CONCURRENCY', '动作上下文审计引用与租约不一致。', false, true);
      }
      if (slot.audit_completed_at) {
        throw new HarnessError(409, 'ACTION_CONTEXT_USAGE_ALREADY_RECORDED', 'CONCURRENCY', '动作上下文用量已经完成记录。');
      }
      const deterministicVerified = Object.values(input.verification).every(Boolean);
      if (input.outcome === 'VERIFIED_PASSED' && !deterministicVerified) {
        throw new HarnessError(400, 'PLAYWRIGHT_VERIFICATION_REQUIRED', 'EVIDENCE', 'Midscene 动作必须由 Playwright 独立验证。');
      }
      const usage = input.modelUsage;
      db.prepare(`
        UPDATE context_budget_audits
        SET usage_status = ?, provider_ref = ?, model_ref = ?, actual_input_tokens = ?,
            actual_output_tokens = ?, actual_total_tokens = ?, completed_at = ?
        WHERE audit_id = ? AND completed_at IS NULL
      `).run(
        usage.status, usage.provider ?? null, usage.model ?? null, usage.inputTokens ?? null,
        usage.outputTokens ?? null, usage.totalTokens ?? null, timestamp, input.contextAuditId
      );
      const usageExceeded = usage.status === 'PROVIDER_REPORTED'
        && (Number(usage.inputTokens) > MODEL_CONTEXT_POLICIES.VISION_LLM.inputBudgetTokens
          || Number(usage.totalTokens) > MODEL_CONTEXT_POLICIES.VISION_LLM.modelContextLimitTokens);
      const effectiveOutcome = usageExceeded ? 'FAILED' : input.outcome;
      if (effectiveOutcome === 'AMBIGUOUS'
        && usage.status !== 'NOT_INVOKED'
        && slot.budget_decision === 'ALLOW'
        && slot.item_context_level !== 'CTX-L3') {
        const nextContextLevel: ContextLevel = slot.item_context_level === 'CTX-L1' ? 'CTX-L2' : 'CTX-L3';
        db.prepare(`
          UPDATE action_plan_items
          SET status = 'PENDING', context_level = ?, context_upgrade_reason_code = 'MIDSCENE_ACTION_AMBIGUOUS',
              verification_json = ?, updated_at = ?
          WHERE action_id = ?
        `).run(nextContextLevel, canonicalJson(input.verification), timestamp, slot.action_id);
        db.prepare(`UPDATE action_execution_slots SET status = 'FAILED', version = version + 1, updated_at = ? WHERE slot_id = ?`)
          .run(timestamp, input.slotId);
        db.prepare(`UPDATE action_plans SET status = 'RUNNING', version = version + 1, updated_at = ? WHERE plan_id = ?`)
          .run(timestamp, slot.plan_id);
        db.prepare(`
          UPDATE tasks SET status = 'QUEUED', result_summary = ?, error_code = NULL, error_category = NULL,
            user_action_required = 0, version = version + 1, updated_at = ? WHERE task_id = ?
        `).run(`视觉候选存在歧义，已按确定性规则升级到 ${nextContextLevel}。`, timestamp, taskId);
        return {
          taskId, planId: slot.plan_id, status: 'QUEUED', cursorAdvanced: false,
          contextUpgraded: true, nextContextLevel
        };
      }
      const itemStatus = effectiveOutcome;
      db.prepare(`UPDATE action_plan_items SET status = ?, verification_json = ?, updated_at = ? WHERE action_id = ?`)
        .run(itemStatus, canonicalJson(input.verification), timestamp, slot.action_id);
      db.prepare(`UPDATE action_execution_slots SET status = ?, version = version + 1, updated_at = ? WHERE slot_id = ?`)
        .run(effectiveOutcome === 'VERIFIED_PASSED' ? 'COMPLETED' : 'FAILED', timestamp, input.slotId);
      if (effectiveOutcome !== 'VERIFIED_PASSED') {
        db.prepare(`UPDATE action_plans SET status = 'WAITING_USER', version = version + 1, updated_at = ? WHERE plan_id = ?`)
          .run(timestamp, slot.plan_id);
        db.prepare(`
          UPDATE tasks SET status = 'WAITING_USER', progress = 0, result_summary = ?, error_code = ?,
            error_category = 'TEST_FAILURE', user_action_required = 1, version = version + 1, updated_at = ?
          WHERE task_id = ?
        `).run(
          usageExceeded ? '视觉模型实际用量超过16K硬上限。' : input.summary,
          usageExceeded ? 'VISION_CONTEXT_BUDGET_EXCEEDED' : effectiveOutcome === 'AMBIGUOUS' ? 'MIDSCENE_ACTION_AMBIGUOUS' : 'MIDSCENE_ACTION_FAILED',
          timestamp, taskId
        );
        return { taskId, planId: slot.plan_id, status: 'WAITING_USER', cursorAdvanced: false };
      }
      const remaining = db.prepare(`
        SELECT COUNT(*) AS count FROM action_plan_items WHERE plan_id = ? AND ordinal > ?
      `).get(slot.plan_id, slot.ordinal) as { count: number };
      const completed = remaining.count === 0;
      db.prepare(`
        UPDATE action_plans SET cursor_ordinal = ?, status = ?, previous_action_summary_json = ?,
          last_observation_json = ?, current_page_state_json = ?, version = version + 1, updated_at = ?
        WHERE plan_id = ?
      `).run(
        Number(slot.ordinal) + (completed ? 0 : 1), completed ? 'WAITING_USER' : 'RUNNING',
        canonicalJson({ ordinal: slot.ordinal, actionType: slot.action_type, summary: input.summary }),
        canonicalJson({ summary: input.summary, verification: input.verification }),
        canonicalJson(input.pageState), timestamp, slot.plan_id
      );
      if (completed) {
        db.prepare(`UPDATE scripts SET status = 'VALIDATING', updated_at = ? WHERE script_id = ?`).run(timestamp, slot.script_id);
        db.prepare(`UPDATE script_versions SET validation_status = 'PASSED' WHERE script_id = ? AND version = 1`).run(slot.script_id);
        db.prepare(`
          UPDATE tasks SET status = 'WAITING_USER', progress = 100, result_summary = ?,
            user_action_required = 1, version = version + 1, updated_at = ? WHERE task_id = ?
        `).run('候选脚本已通过 Playwright 验证，等待 Coze 中的用户明确确认激活。', timestamp, taskId);
      } else {
        const count = db.prepare('SELECT COUNT(*) AS count FROM action_plan_items WHERE plan_id = ?').get(slot.plan_id) as { count: number };
        const progress = Math.max(1, Math.min(99, Math.floor(Number(slot.ordinal) / count.count * 100)));
        db.prepare(`UPDATE tasks SET status = 'QUEUED', progress = ?, version = version + 1, updated_at = ? WHERE task_id = ?`)
          .run(progress, timestamp, taskId);
      }
      return { taskId, planId: slot.plan_id, status: completed ? 'WAITING_USER' : 'QUEUED', cursorAdvanced: true, completed };
    });
  }

  async recordMidsceneCapability(input: {
    actionType: AuthoringActionType;
    viewportCount: number;
    attemptCount: number;
    failureCount: number;
    falseSuccessCount: number;
    verificationRef: string;
  }): Promise<Record<string, unknown>> {
    const status = input.viewportCount >= 5
      && input.attemptCount >= input.viewportCount * 2
      && input.failureCount === 0
      && input.falseSuccessCount === 0
      ? 'VERIFIED'
      : 'DEGRADED';
    await this.database.write(db => db.prepare(`
      UPDATE midscene_action_capabilities SET status = ?, viewport_count = ?, attempt_count = ?,
        failure_count = ?, false_success_count = ?, verification_ref = ?, updated_at = ? WHERE action_type = ?
    `).run(status, input.viewportCount, input.attemptCount, input.failureCount, input.falseSuccessCount, input.verificationRef, nowIso(), input.actionType));
    return { actionType: input.actionType, status, admittedToLowMediumExecution: status === 'VERIFIED' };
  }

  async completeRun(taskId: string, input: WorkerCompletionInput): Promise<Record<string, unknown>> {
    const task = this.database.read(db => db.prepare(`
      SELECT t.namespace, t.run_id, t.case_id, t.status, t.lease_owner,
             p.script_id, s.current_version AS script_version,
             r.origin_schedule_id, r.schedule_execution_id,
             sc.max_retries, se.retry_count
      FROM tasks t
      JOIN runs r ON r.task_id = t.task_id
      JOIN plans p ON p.plan_id = r.plan_id
      JOIN scripts s ON s.script_id = p.script_id
      LEFT JOIN schedules sc ON sc.schedule_id = r.origin_schedule_id
      LEFT JOIN schedule_executions se ON se.execution_id = r.schedule_execution_id
      WHERE t.task_id = ? AND t.task_type = 'RUN_EXECUTE'
    `).get(taskId) as {
      namespace: string; run_id: string; case_id: string; status: string; lease_owner: string | null;
      script_id: string; script_version: number; origin_schedule_id: string | null;
      schedule_execution_id: string | null; max_retries: number | null; retry_count: number | null;
    } | undefined);
    if (!task) throw new HarnessError(404, 'WORKER_TASK_NOT_FOUND', 'DOMAIN', 'Worker 任务不存在。');
    if (task.status !== 'RUNNING' || task.lease_owner !== input.workerId) {
      throw new HarnessError(409, 'WORKER_LEASE_CONFLICT', 'CONCURRENCY', 'Worker 租约已失效。', false, true);
    }
    if (input.outcome === 'PASSED' && input.evidence.length < 3) {
      throw new HarnessError(400, 'EVIDENCE_INCOMPLETE', 'EVIDENCE', '通过结果必须包含报告、截图和日志证据。');
    }

    const artifacts: Record<string, unknown>[] = [];
    for (const evidence of input.evidence) {
      artifacts.push(await this.artifacts.create({
        namespace: task.namespace,
        runId: task.run_id,
        taskId,
        artifactType: evidence.artifactType,
        mediaType: evidence.mediaType,
        redactionStatus: evidence.redactionStatus,
        extension: evidence.extension,
        content: Buffer.from(evidence.base64Content, 'base64'),
        metadata: evidence.metadata
      }));
    }
    const resultArtifact = artifacts.find(item => item.type === 'REPORT') ?? artifacts[0];
    const timestamp = nowIso();
    const scheduledRetry = input.outcome !== 'PASSED'
      && input.errorCategory === 'ENVIRONMENT'
      && input.retryable === true
      && task.origin_schedule_id !== null
      && Number(task.retry_count ?? 0) < Number(task.max_retries ?? 0);
    if (scheduledRetry) {
      await this.database.write(db => {
        db.prepare(`
          UPDATE tasks SET status = 'QUEUED', progress = 0, result_summary = ?, result_artifact_id = ?,
            error_code = ?, error_category = ?, retryable = 1, user_action_required = 0,
            lease_owner = NULL, lease_expires_at = NULL, version = version + 1, updated_at = ?, completed_at = NULL
          WHERE task_id = ?
        `).run(input.summary, resultArtifact?.artifactId ?? null, input.errorCode ?? 'TRANSIENT_ENVIRONMENT_FAILURE', input.errorCategory, timestamp, taskId);
        db.prepare(`UPDATE runs SET status = 'QUEUED', version = version + 1, completed_at = NULL WHERE run_id = ?`).run(task.run_id);
        db.prepare(`
          UPDATE schedule_executions SET status = 'RETRY_QUEUED', retry_count = retry_count + 1,
            reason_code = ?, updated_at = ? WHERE execution_id = ?
        `).run(input.errorCode ?? 'TRANSIENT_ENVIRONMENT_FAILURE', timestamp, task.schedule_execution_id);
        db.prepare(`
          INSERT INTO audit_events(event_id, namespace, run_id, task_id, actor_type, action, object_type,
            object_id, outcome, correlation_id, details_json, created_at)
          VALUES (?, ?, ?, ?, 'HARNESS', 'schedule.retry', 'RUN', ?, 'ACCEPTED', ?, ?, ?)
        `).run(opaqueId('evt'), task.namespace, task.run_id, taskId, task.run_id, opaqueId('scheduler'),
          JSON.stringify({ retryCount: Number(task.retry_count ?? 0) + 1, maxRetries: task.max_retries }), timestamp);
      });
      return {
        taskId, runId: task.run_id, status: 'QUEUED', outcome: input.outcome,
        retryScheduled: true, retryCount: Number(task.retry_count ?? 0) + 1,
        artifactIds: artifacts.map(item => item.artifactId)
      };
    }
    const taskStatus = input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED';
    let incidentId: string | undefined;
    await this.database.write(db => {
      db.prepare(`
        UPDATE tasks SET status = ?, progress = 100, result_summary = ?, result_artifact_id = ?,
            error_code = ?, error_category = ?, retryable = ?, user_action_required = ?,
            lease_owner = NULL, lease_expires_at = NULL, version = version + 1,
            updated_at = ?, completed_at = ?
        WHERE task_id = ?
      `).run(
        taskStatus, input.summary, resultArtifact?.artifactId ?? null,
        input.errorCode ?? null, input.errorCategory ?? null, input.retryable ? 1 : 0,
        input.userActionRequired ? 1 : 0, timestamp, timestamp, taskId
      );
      db.prepare(`
        UPDATE runs SET status = ?, version = version + 1, completed_at = ? WHERE run_id = ?
      `).run(input.outcome, timestamp, task.run_id);
      if (task.schedule_execution_id) {
        db.prepare(`
          UPDATE schedule_executions SET status = ?, reason_code = ?, updated_at = ?, completed_at = ?
          WHERE execution_id = ?
        `).run(input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED', input.errorCode ?? null, timestamp, timestamp, task.schedule_execution_id);
      }
      db.prepare(`
        INSERT INTO audit_events(
          event_id, namespace, run_id, task_id, actor_type, action, object_type,
          object_id, outcome, correlation_id, details_json, created_at
        ) VALUES (?, ?, ?, ?, 'WORKER', 'run.complete', 'RUN', ?, ?, ?, ?, ?)
      `).run(
        opaqueId('evt'), task.namespace, task.run_id, taskId, task.run_id,
        input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED', opaqueId('worker'),
        JSON.stringify({ outcome: input.outcome, artifactIds: artifacts.map(item => item.artifactId) }), timestamp
      );
      if (input.outcome !== 'PASSED') {
        const existing = db.prepare('SELECT incident_id FROM failure_incidents WHERE run_id = ?')
          .get(task.run_id) as { incident_id: string } | undefined;
        incidentId = existing?.incident_id ?? opaqueId('incident');
        if (!existing) {
          const classification = classifyFailure(input.errorCategory, input.errorCode);
          db.prepare(`
            INSERT INTO failure_incidents(
              incident_id, namespace, run_id, case_id, script_id, script_version,
              classification, reason_code, summary, evidence_artifact_id,
              diagnostic_status, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLASSIFIED', 1, ?, ?)
          `).run(
            incidentId, task.namespace, task.run_id, task.case_id, task.script_id, task.script_version,
            classification, input.errorCode ?? 'WORKER_EXECUTION_FAILED', input.summary,
            resultArtifact?.artifactId ?? null, timestamp, timestamp
          );
          if (classification === 'LOCATOR') {
            db.prepare(`UPDATE scripts SET status = 'VALIDATING', updated_at = ? WHERE script_id = ? AND status = 'SCRIPT_VALIDATED'`)
              .run(timestamp, task.script_id);
          }
        }
        if (task.origin_schedule_id && incidentId) {
          db.prepare(`
            UPDATE schedules SET status = 'PAUSED_FAILURE', paused_incident_id = ?,
              version = version + 1, updated_at = ? WHERE schedule_id = ? AND status = 'ACTIVE'
          `).run(incidentId, timestamp, task.origin_schedule_id);
        }
      }
    });
    return {
      taskId,
      runId: task.run_id,
      status: taskStatus,
      outcome: input.outcome,
      resultArtifactId: resultArtifact?.artifactId ?? null,
      artifactIds: artifacts.map(item => item.artifactId),
      ...(incidentId ? { incidentId } : {})
    };
  }

  getFailureIncident(namespace: string, incidentId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT fi.*, rc.candidate_id, rc.status AS candidate_status, rc.version AS candidate_version
        FROM failure_incidents fi
        LEFT JOIN repair_candidates rc ON rc.incident_id = fi.incident_id
        WHERE fi.namespace = ? AND fi.incident_id = ?
        ORDER BY rc.created_at DESC LIMIT 1
      `).get(namespace, incidentId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'FAILURE_INCIDENT_NOT_FOUND', 'DOMAIN', '失败事故不存在。');
      return {
        incidentId: row.incident_id,
        runId: row.run_id,
        caseId: row.case_id,
        scriptId: row.script_id,
        scriptVersion: row.script_version,
        classification: row.classification,
        reasonCode: row.reason_code,
        summary: row.summary,
        evidenceArtifactId: row.evidence_artifact_id,
        diagnosticStatus: row.diagnostic_status,
        diagnosis: row.diagnosis_json ? JSON.parse(String(row.diagnosis_json)) : null,
        version: row.version,
        candidate: row.candidate_id ? {
          candidateId: row.candidate_id,
          status: row.candidate_status,
          version: row.candidate_version
        } : null,
        updatedAt: row.updated_at
      };
    });
  }

  async createRepairCandidate(input: RepairCandidateCreateInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'repair_candidate_create', input.idempotencyKey, input, context, (db, timestamp) => {
      const incident = db.prepare(`
        SELECT fi.*, s.current_version, sv.relative_path, sv.sha256 AS source_sha256
        FROM failure_incidents fi
        JOIN scripts s ON s.script_id = fi.script_id
        JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
        WHERE fi.namespace = ? AND fi.incident_id = ?
      `).get(input.namespace, input.incidentId) as Record<string, unknown> | undefined;
      if (!incident) throw new HarnessError(404, 'FAILURE_INCIDENT_NOT_FOUND', 'DOMAIN', '失败事故不存在。');
      if (incident.classification !== 'LOCATOR') {
        throw new HarnessError(409, 'REPAIR_CLASSIFICATION_UNSUPPORTED', 'DOMAIN', '首版隔离修复只接受已分类的定位器失效。', false, true);
      }
      if (Number(incident.current_version) !== Number(incident.script_version)) {
        throw new HarnessError(409, 'SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '事故对应的脚本版本已不是当前版本。', false, true, { currentVersion: incident.current_version });
      }
      const existing = db.prepare(`
        SELECT candidate_id, status, version FROM repair_candidates
        WHERE incident_id = ? AND status IN ('VALIDATION_QUEUED', 'VALIDATING', 'WAITING_USER', 'ACTIVE')
        ORDER BY created_at DESC LIMIT 1
      `).get(input.incidentId) as { candidate_id: string; status: string; version: number } | undefined;
      if (existing) {
        return {
          status: 200,
          objectType: 'REPAIR_CANDIDATE',
          objectId: existing.candidate_id,
          response: { candidateId: existing.candidate_id, status: existing.status, version: existing.version, reused: true }
        };
      }
      const repair = LOCATOR_REPAIRS[String(incident.reason_code)];
      if (!repair) {
        db.prepare(`
          UPDATE failure_incidents SET diagnostic_status = 'UNRESOLVED', diagnosis_json = ?,
            version = version + 1, updated_at = ? WHERE incident_id = ?
        `).run(canonicalJson({ outcome: 'NO_ALLOWLISTED_REPAIR', reasonCode: incident.reason_code }), timestamp, input.incidentId);
        throw new HarnessError(409, 'REPAIR_TEMPLATE_UNAVAILABLE', 'DOMAIN', '没有与该失败代码匹配的受控修复模板。', false, true);
      }
      const candidateId = opaqueId('candidate');
      const jobId = opaqueId('repairjob');
      const allocated = db.prepare(`
        SELECT MAX(version_value) AS maximum FROM (
          SELECT version AS version_value FROM script_versions WHERE script_id = ?
          UNION ALL
          SELECT candidate_script_version AS version_value FROM repair_candidates WHERE script_id = ?
        )
      `).get(incident.script_id, incident.script_id) as { maximum: number | null };
      const candidateScriptVersion = Number(allocated.maximum ?? incident.current_version) + 1;
      const patch = {
        schemaVersion: 'i5-locator-override-v1',
        targetRef: repair.targetRef,
        selectorOverrides: { [repair.targetRef]: repair.selector },
        diagnosisCode: incident.reason_code
      };
      const patchJson = canonicalJson(patch);
      const diagnosis = {
        classification: 'LOCATOR',
        reasonCode: incident.reason_code,
        strategy: 'ALLOWLISTED_LOCATOR_OVERRIDE',
        targetRef: repair.targetRef,
        requiresIsolatedValidation: true,
        requiresUserActivation: true
      };
      db.prepare(`
        INSERT INTO repair_candidates(
          candidate_id, namespace, incident_id, script_id, base_script_version,
          candidate_script_version, patch_type, patch_json, patch_hash, risk_level,
          status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'LOCATOR_OVERRIDE', ?, ?, 'MEDIUM', 'VALIDATION_QUEUED', 1, ?, ?)
      `).run(
        candidateId, input.namespace, input.incidentId, incident.script_id, incident.current_version,
        candidateScriptVersion, patchJson, sha256(patchJson), timestamp, timestamp
      );
      db.prepare(`
        INSERT INTO repair_validation_jobs(job_id, namespace, candidate_id, status, credential_alias, created_at, updated_at)
        VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)
      `).run(jobId, input.namespace, candidateId, input.credentialAlias, timestamp, timestamp);
      db.prepare(`
        UPDATE failure_incidents SET diagnostic_status = 'DIAGNOSED', diagnosis_json = ?,
          version = version + 1, updated_at = ? WHERE incident_id = ?
      `).run(canonicalJson(diagnosis), timestamp, input.incidentId);
      return {
        status: 200,
        objectType: 'REPAIR_CANDIDATE',
        objectId: candidateId,
        response: {
          candidateId,
          jobId,
          status: 'VALIDATION_QUEUED',
          version: 1,
          riskLevel: 'MEDIUM',
          diagnosis,
          activationRequired: true
        }
      };
    });
  }

  async claimNextRepairValidation(workerId: string, leaseSeconds = 300): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE repair_validation_jobs SET status = 'QUEUED', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      db.prepare(`
        UPDATE repair_candidates SET status = 'VALIDATION_QUEUED', version = version + 1, updated_at = ?
        WHERE status = 'VALIDATING' AND candidate_id IN (
          SELECT candidate_id FROM repair_validation_jobs WHERE status = 'QUEUED'
        )
      `).run(timestamp);
      const row = db.prepare(`
        SELECT j.job_id, j.namespace, j.candidate_id, j.credential_alias,
               rc.patch_json, rc.patch_hash, rc.script_id, rc.base_script_version,
               fi.run_id, fi.case_id, r.case_version, p.plan_id,
               sv.relative_path
        FROM repair_validation_jobs j
        JOIN repair_candidates rc ON rc.candidate_id = j.candidate_id
        JOIN failure_incidents fi ON fi.incident_id = rc.incident_id
        JOIN runs r ON r.run_id = fi.run_id
        JOIN plans p ON p.plan_id = r.plan_id
        JOIN script_versions sv ON sv.script_id = rc.script_id AND sv.version = rc.base_script_version
        WHERE j.status = 'QUEUED'
        ORDER BY j.created_at ASC LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (!row) return { status: 'EMPTY' };
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      db.prepare(`
        UPDATE repair_validation_jobs SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?,
          attempt_count = attempt_count + 1, updated_at = ? WHERE job_id = ? AND status = 'QUEUED'
      `).run(workerId, leaseExpiresAt, timestamp, row.job_id);
      db.prepare(`UPDATE repair_candidates SET status = 'VALIDATING', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
        .run(timestamp, row.candidate_id);
      const patch = JSON.parse(String(row.patch_json)) as { selectorOverrides: Record<string, string> };
      return {
        status: 'CLAIMED',
        jobId: row.job_id,
        candidateId: row.candidate_id,
        namespace: row.namespace,
        runId: row.run_id,
        caseId: row.case_id,
        caseVersion: row.case_version,
        planId: row.plan_id,
        execution: {
          credentialAlias: row.credential_alias,
          fixtureNamespace: `repair-${String(row.candidate_id).slice(-20)}`,
          scriptId: row.script_id,
          scriptPath: row.relative_path,
          selectorOverrides: patch.selectorOverrides,
          isolationMode: 'FRESH_BROWSER_CONTEXT_NO_COMMIT'
        },
        patchHash: row.patch_hash,
        leaseExpiresAt
      };
    });
  }

  async completeRepairValidation(jobId: string, input: WorkerCompletionInput): Promise<Record<string, unknown>> {
    const job = this.database.read(db => db.prepare(`
      SELECT j.*, rc.candidate_id, rc.incident_id, fi.run_id
      FROM repair_validation_jobs j
      JOIN repair_candidates rc ON rc.candidate_id = j.candidate_id
      JOIN failure_incidents fi ON fi.incident_id = rc.incident_id
      WHERE j.job_id = ?
    `).get(jobId) as Record<string, unknown> | undefined);
    if (!job) throw new HarnessError(404, 'REPAIR_JOB_NOT_FOUND', 'DOMAIN', '修复验证任务不存在。');
    if (job.status !== 'RUNNING' || job.lease_owner !== input.workerId || String(job.lease_expires_at) < nowIso()) {
      throw new HarnessError(409, 'REPAIR_JOB_LEASE_CONFLICT', 'CONCURRENCY', '修复验证租约已失效。', false, true);
    }
    if (input.outcome === 'PASSED' && input.evidence.length < 3) {
      throw new HarnessError(400, 'REPAIR_EVIDENCE_INCOMPLETE', 'EVIDENCE', '候选通过必须包含报告、截图和日志。');
    }
    const artifacts: Record<string, unknown>[] = [];
    for (const evidence of input.evidence) {
      artifacts.push(await this.artifacts.create({
        namespace: String(job.namespace),
        runId: String(job.run_id),
        artifactType: evidence.artifactType,
        mediaType: evidence.mediaType,
        redactionStatus: evidence.redactionStatus,
        extension: evidence.extension,
        content: Buffer.from(evidence.base64Content, 'base64'),
        metadata: { ...evidence.metadata, repairCandidateId: job.candidate_id, isolatedValidation: true }
      }));
    }
    const resultArtifact = artifacts.find(item => item.type === 'REPORT') ?? artifacts[0];
    const passed = input.outcome === 'PASSED';
    const timestamp = nowIso();
    await this.database.write(db => {
      db.prepare(`
        UPDATE repair_validation_jobs SET status = ?, summary = ?, lease_owner = NULL,
          lease_expires_at = NULL, completed_at = ?, updated_at = ? WHERE job_id = ?
      `).run(passed ? 'PASSED' : 'FAILED', input.summary, timestamp, timestamp, jobId);
      db.prepare(`
        UPDATE repair_candidates SET status = ?, validation_artifact_id = ?,
          version = version + 1, updated_at = ? WHERE candidate_id = ?
      `).run(passed ? 'WAITING_USER' : 'VALIDATION_FAILED', resultArtifact?.artifactId ?? null, timestamp, job.candidate_id);
      db.prepare(`
        UPDATE failure_incidents SET diagnostic_status = ?, version = version + 1, updated_at = ? WHERE incident_id = ?
      `).run(passed ? 'CANDIDATE_READY' : 'UNRESOLVED', timestamp, job.incident_id);
      db.prepare(`
        INSERT INTO audit_events(
          event_id, namespace, run_id, actor_type, action, object_type, object_id,
          outcome, correlation_id, details_json, created_at
        ) VALUES (?, ?, ?, 'WORKER', 'repair.validate', 'REPAIR_CANDIDATE', ?, ?, ?, ?, ?)
      `).run(
        opaqueId('evt'), job.namespace, job.run_id, job.candidate_id,
        passed ? 'SUCCEEDED' : 'FAILED', opaqueId('worker'),
        canonicalJson({ jobId, artifactIds: artifacts.map(item => item.artifactId), isolated: true }), timestamp
      );
    });
    return {
      jobId,
      candidateId: job.candidate_id,
      status: passed ? 'WAITING_USER' : 'VALIDATION_FAILED',
      activationRequired: passed,
      resultArtifactId: resultArtifact?.artifactId ?? null
    };
  }

  getRepairCandidate(namespace: string, candidateId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT rc.*, j.job_id, j.status AS validation_status, j.summary AS validation_summary
        FROM repair_candidates rc
        JOIN repair_validation_jobs j ON j.candidate_id = rc.candidate_id
        WHERE rc.namespace = ? AND rc.candidate_id = ?
      `).get(namespace, candidateId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'REPAIR_CANDIDATE_NOT_FOUND', 'DOMAIN', '修复候选不存在。');
      return {
        candidateId: row.candidate_id,
        incidentId: row.incident_id,
        scriptId: row.script_id,
        baseScriptVersion: row.base_script_version,
        candidateScriptVersion: row.candidate_script_version,
        patchType: row.patch_type,
        patch: JSON.parse(String(row.patch_json)),
        patchHash: row.patch_hash,
        riskLevel: row.risk_level,
        status: row.status,
        version: row.version,
        validation: {
          jobId: row.job_id,
          status: row.validation_status,
          summary: row.validation_summary,
          artifactId: row.validation_artifact_id
        },
        activationRequired: row.status === 'WAITING_USER',
        updatedAt: row.updated_at
      };
    });
  }

  getTask(namespace: string, taskId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT t.*, r.version AS run_version, r.status AS run_status, fi.incident_id, fi.classification AS failure_classification
        FROM tasks t
        LEFT JOIN runs r ON r.run_id = t.run_id
        LEFT JOIN failure_incidents fi ON fi.run_id = t.run_id
        WHERE t.namespace = ? AND t.task_id = ?
      `).get(namespace, taskId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'TASK_NOT_FOUND', 'DOMAIN', '任务不存在。');
      return {
        taskId: row.task_id,
        runId: row.run_id,
        caseId: row.case_id,
        type: row.task_type,
        status: row.status,
        progress: row.progress,
        version: row.version,
        runVersion: row.run_version,
        outcome: row.run_status === 'PASSED' || row.run_status === 'FAILED' || row.run_status === 'BLOCKED' ? row.run_status : null,
        summary: row.result_summary,
        resultArtifactId: row.result_artifact_id,
        errorCode: row.error_code,
        errorCategory: row.error_category,
        incidentId: row.incident_id,
        failureClassification: row.failure_classification,
        retryable: Boolean(row.retryable),
        userActionRequired: Boolean(row.user_action_required),
        updatedAt: row.updated_at
      };
    });
  }

  getArtifactMetadata(namespace: string, artifactId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare('SELECT * FROM artifacts WHERE namespace = ? AND artifact_id = ?').get(namespace, artifactId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'ARTIFACT_NOT_FOUND', 'DOMAIN', 'Artifact 不存在。');
      return {
        artifactId: row.artifact_id,
        runId: row.run_id,
        taskId: row.task_id,
        type: row.artifact_type,
        sha256: row.sha256,
        byteSize: row.byte_size,
        mediaType: row.media_type,
        redactionStatus: row.redaction_status,
        metadata: JSON.parse(String(row.metadata_json)),
        controlledAccess: { mode: 'HARNESS_MANAGED', downloadable: false },
        createdAt: row.created_at
      };
    });
  }

  async submitDecision(input: DecisionSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'decision_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      let currentVersion: number | undefined;
      if (input.targetType === 'RUN_RECOVERY') {
        currentVersion = (db.prepare('SELECT version FROM runs WHERE namespace = ? AND run_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      } else if (input.targetType === 'SCRIPT_ACTIVATION') {
        currentVersion = (db.prepare('SELECT current_version AS version FROM scripts WHERE namespace = ? AND script_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      } else if (input.targetType === 'SCHEDULE_RECOVERY') {
        currentVersion = (db.prepare('SELECT version FROM schedules WHERE namespace = ? AND schedule_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      } else {
        currentVersion = (db.prepare('SELECT version FROM repair_candidates WHERE namespace = ? AND candidate_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      }
      if (currentVersion === undefined) throw new HarnessError(404, 'DECISION_TARGET_NOT_FOUND', 'DOMAIN', '决策目标不存在。');
      if (currentVersion !== input.expectedVersion) {
        throw new HarnessError(409, 'TARGET_VERSION_CONFLICT', 'CONCURRENCY', '决策目标版本已变化。', false, true, { currentVersion });
      }
      const decisionId = opaqueId('decision');
      if (input.targetType === 'SCHEDULE_RECOVERY') {
        if (input.choice !== 'APPROVE' && input.choice !== 'REJECT') {
          throw new HarnessError(400, 'SCHEDULE_RECOVERY_CHOICE_INVALID', 'CONTRACT', '调度恢复只接受 APPROVE 或 REJECT。');
        }
        const schedule = db.prepare('SELECT * FROM schedules WHERE namespace = ? AND schedule_id = ?')
          .get(input.namespace, input.targetId) as Record<string, unknown>;
        if (schedule.status !== 'PAUSED_FAILURE') {
          throw new HarnessError(409, 'SCHEDULE_NOT_PAUSED', 'DOMAIN', '只有因失败暂停的调度可以执行恢复决策。', false, true);
        }
        db.prepare(`
          INSERT INTO schedule_recovery_decisions(
            decision_id, namespace, schedule_id, expected_version, choice, reason,
            confirmation_ref, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)
        `).run(decisionId, input.namespace, input.targetId, input.expectedVersion, input.choice, input.reason, input.confirmationRef, timestamp);
        let effect = 'SCHEDULE_REMAINS_PAUSED';
        if (input.choice === 'APPROVE') {
          const nextFireAt = nextCronOccurrence(String(schedule.cron_expression), String(schedule.timezone), new Date(timestamp)).toISOString();
          db.prepare(`
            UPDATE schedules SET status = 'ACTIVE', paused_incident_id = NULL, next_fire_at = ?,
              version = version + 1, updated_at = ? WHERE schedule_id = ?
          `).run(nextFireAt, timestamp, input.targetId);
          effect = 'SCHEDULE_RESUMED';
        }
        return {
          status: 200, objectType: 'DECISION', objectId: decisionId,
          response: {
            decisionId, targetType: input.targetType, targetId: input.targetId, status: 'RECORDED', version: 1,
            effect, scheduleVersion: input.choice === 'APPROVE' ? input.expectedVersion + 1 : input.expectedVersion
          }
        };
      }
      if (input.targetType === 'REPAIR_CANDIDATE_ACTIVATION') {
        if (input.choice !== 'APPROVE' && input.choice !== 'REJECT') {
          throw new HarnessError(400, 'REPAIR_DECISION_CHOICE_INVALID', 'CONTRACT', '修复候选只接受 APPROVE 或 REJECT。');
        }
        const candidate = db.prepare(`
          SELECT rc.*, sv.relative_path, COALESCE(sv.source_sha256, sv.sha256) AS base_sha256
          FROM repair_candidates rc
          JOIN script_versions sv ON sv.script_id = rc.script_id AND sv.version = rc.base_script_version
          WHERE rc.namespace = ? AND rc.candidate_id = ?
        `).get(input.namespace, input.targetId) as Record<string, unknown>;
        if (candidate.status !== 'WAITING_USER') {
          throw new HarnessError(409, 'REPAIR_CANDIDATE_NOT_APPROVABLE', 'DOMAIN', '修复候选尚未通过隔离验证或已完成决策。', false, true);
        }
        db.prepare(`
          INSERT INTO repair_activation_decisions(
            decision_id, namespace, candidate_id, expected_version, choice, reason,
            confirmation_ref, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)
        `).run(
          decisionId, input.namespace, input.targetId, input.expectedVersion,
          input.choice, input.reason, input.confirmationRef, timestamp
        );
        let effect: string;
        if (input.choice === 'APPROVE') {
          const script = db.prepare('SELECT current_version FROM scripts WHERE script_id = ?')
            .get(candidate.script_id) as { current_version: number };
          if (script.current_version !== Number(candidate.base_script_version)) {
            throw new HarnessError(409, 'SCRIPT_VERSION_CONFLICT', 'CONCURRENCY', '激活前正式脚本版本已变化。', false, true, { currentVersion: script.current_version });
          }
          const sourcePath = path.join(this.productRoot, ...String(candidate.relative_path).split('/'));
          if (!fs.existsSync(sourcePath)) {
            throw new HarnessError(409, 'CANDIDATE_SCRIPT_UNAVAILABLE', 'ENVIRONMENT', '候选依赖的基础脚本制品不存在。', false, true);
          }
          const sourceSha256 = sha256(fs.readFileSync(sourcePath));
          if (sourceSha256 !== candidate.base_sha256) {
            throw new HarnessError(409, 'SCRIPT_SOURCE_DRIFT', 'CONCURRENCY', '基础脚本文件 Hash 已变化，候选必须重新验证。', false, true);
          }
          const configurationJson = canonicalJson((JSON.parse(String(candidate.patch_json)) as { selectorOverrides: Record<string, string> }).selectorOverrides);
          const compositeSha256 = sha256(canonicalJson({ sourceSha256, configuration: JSON.parse(configurationJson) }));
          db.prepare(`
            INSERT INTO script_versions(
              script_id, version, relative_path, sha256, validation_status, created_at,
              configuration_json, source_sha256
            ) VALUES (?, ?, ?, ?, 'PASSED', ?, ?, ?)
          `).run(
            candidate.script_id, candidate.candidate_script_version, candidate.relative_path,
            compositeSha256, timestamp, configurationJson, sourceSha256
          );
          db.prepare(`UPDATE scripts SET current_version = ?, status = 'SCRIPT_VALIDATED', updated_at = ? WHERE script_id = ?`)
            .run(candidate.candidate_script_version, timestamp, candidate.script_id);
          db.prepare(`UPDATE repair_candidates SET status = 'ACTIVE', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
            .run(timestamp, input.targetId);
          db.prepare(`UPDATE failure_incidents SET diagnostic_status = 'RESOLVED', version = version + 1, updated_at = ? WHERE incident_id = ?`)
            .run(timestamp, candidate.incident_id);
          effect = 'REPAIR_CANDIDATE_ACTIVATED';
        } else {
          db.prepare(`UPDATE repair_candidates SET status = 'REJECTED', version = version + 1, updated_at = ? WHERE candidate_id = ?`)
            .run(timestamp, input.targetId);
          db.prepare(`UPDATE failure_incidents SET diagnostic_status = 'DIAGNOSED', version = version + 1, updated_at = ? WHERE incident_id = ?`)
            .run(timestamp, candidate.incident_id);
          effect = 'REPAIR_CANDIDATE_REJECTED';
        }
        return {
          status: 200,
          objectType: 'DECISION',
          objectId: decisionId,
          response: {
            decisionId,
            targetType: input.targetType,
            targetId: input.targetId,
            status: 'RECORDED',
            version: 1,
            effect
          }
        };
      }
      db.prepare(`
        INSERT INTO decisions(
          decision_id, namespace, target_type, target_id, expected_version, choice,
          reason, status, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECORDED', 1, ?)
      `).run(decisionId, input.namespace, input.targetType, input.targetId, input.expectedVersion, input.choice, input.reason, timestamp);
      let effect = 'DEFERRED_TO_FUTURE_BATCH';
      if (input.targetType === 'SCRIPT_ACTIVATION') {
        const version = db.prepare(`
          SELECT validation_status FROM script_versions WHERE script_id = ? AND version = ?
        `).get(input.targetId, input.expectedVersion) as { validation_status: string } | undefined;
        if (!version || version.validation_status !== 'PASSED') {
          throw new HarnessError(409, 'SCRIPT_VALIDATION_NOT_PASSED', 'DOMAIN', '候选脚本尚未通过 Playwright 验证。', false, true);
        }
        const nextStatus = input.choice === 'APPROVE' ? 'SCRIPT_VALIDATED' : 'RETIRED';
        db.prepare(`UPDATE scripts SET status = ?, updated_at = ? WHERE script_id = ?`)
          .run(nextStatus, timestamp, input.targetId);
        if (input.choice === 'APPROVE') {
          db.prepare(`UPDATE plans SET status = 'READY' WHERE script_id = ? AND status = 'AUTHORING_REQUIRED'`)
            .run(input.targetId);
          const authoring = db.prepare('SELECT task_id, plan_id FROM action_plans WHERE script_id = ?').get(input.targetId) as { task_id: string; plan_id: string } | undefined;
          if (authoring) {
            db.prepare(`UPDATE action_plans SET status = 'COMPLETED', version = version + 1, updated_at = ? WHERE plan_id = ?`)
              .run(timestamp, authoring.plan_id);
            db.prepare(`UPDATE tasks SET status = 'SUCCEEDED', user_action_required = 0, completed_at = ?, updated_at = ?, version = version + 1 WHERE task_id = ?`)
              .run(timestamp, timestamp, authoring.task_id);
          }
        }
        effect = input.choice === 'APPROVE' ? 'SCRIPT_VALIDATED_AND_PLAN_READY' : 'SCRIPT_RETIRED';
      }
      return {
        status: 200,
        objectType: 'DECISION',
        objectId: decisionId,
        response: {
          decisionId,
          targetType: input.targetType,
          targetId: input.targetId,
          status: 'RECORDED',
          version: 1,
          effect
        }
      };
    });
  }
}
