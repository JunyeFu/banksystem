import fs from 'node:fs';
import path from 'node:path';
import { ArtifactStore } from './artifact-store';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import type { CaseCreateDraftInput, DecisionSubmitInput, PlanCompileInput, RunSubmitInput } from './schemas';
import { canonicalJson, nowIso, opaqueId, requestHash, sha256 } from './utils';

interface RequestContext {
  requestId: string;
  credentialFingerprint?: string;
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
      ) VALUES (?, ?, ?, ?, 'COZE', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opaqueId('evt'), input.namespace, input.runId ?? null, input.taskId ?? null,
      input.action, input.objectType, input.objectId, input.outcome, context.requestId,
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
      db.prepare(`
        INSERT INTO plans(
          plan_id, namespace, case_id, case_version, version, status, summary_json,
          content_hash, created_at, script_id, full_action_plan_json
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(
        planId, input.namespace, caseId, input.expectedCaseVersion, planStatus,
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
          caseVersion: input.expectedCaseVersion
        }
      };
    });
  }

  async submitRun(input: RunSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'run_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const plan = db.prepare(`
        SELECT p.status, p.case_id, p.case_version, p.script_id, c.current_version,
               s.status AS script_status, sv.relative_path AS script_path
        FROM plans p
        JOIN cases c ON c.case_id = p.case_id
        LEFT JOIN scripts s ON s.script_id = p.script_id
        LEFT JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
        WHERE p.namespace = ? AND p.plan_id = ?
      `).get(input.namespace, input.planId) as {
        status: string; case_id: string; case_version: number; current_version: number;
        script_id: string | null; script_status: string | null; script_path: string | null;
      } | undefined;
      if (!plan || plan.case_id !== input.caseId) throw new HarnessError(404, 'PLAN_NOT_FOUND', 'DOMAIN', '执行计划不存在。');
      if (plan.case_version !== input.expectedCaseVersion || plan.current_version !== input.expectedCaseVersion) {
        throw new HarnessError(409, 'CASE_VERSION_CONFLICT', 'CONCURRENCY', '案例或计划版本已变化。', false, true);
      }
      if (plan.status !== 'READY') throw new HarnessError(409, 'PLAN_NOT_RUNNABLE', 'DOMAIN', '计划当前不可执行。', false, true);
      if (!plan.script_id || plan.script_status !== 'SCRIPT_VALIDATED' || !plan.script_path) {
        throw new HarnessError(409, 'SCRIPT_NOT_VALIDATED', 'DOMAIN', '正式回归只能执行 SCRIPT_VALIDATED 脚本。', false, true);
      }
      const runId = opaqueId('run');
      const taskId = opaqueId('task');
      const fixtureNamespace = `fx-${sha256(`${input.namespace}:${runId}`).slice(0, 20)}`;
      const payload = canonicalJson({
        environment: input.environment,
        credentialAlias: input.credentialAlias,
        fixtureNamespace,
        scriptId: plan.script_id,
        scriptPath: plan.script_path
      });
      db.prepare(`
        INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, run_id, payload_json, version, created_at, updated_at)
        VALUES (?, ?, 'RUN_EXECUTE', 'QUEUED', 0, ?, ?, ?, 1, ?, ?)
      `).run(taskId, input.namespace, input.caseId, runId, payload, timestamp, timestamp);
      db.prepare(`
        INSERT INTO runs(run_id, namespace, case_id, case_version, plan_id, task_id, status, credential_alias, fixture_namespace, version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, 1, ?)
      `).run(runId, input.namespace, input.caseId, input.expectedCaseVersion, input.planId, taskId, input.credentialAlias, fixtureNamespace, timestamp);
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

  async claimNextAuthoringAction(workerId: string, leaseSeconds = 360): Promise<Record<string, unknown>> {
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
               p.case_id, p.case_version, p.summary_json,
               current.action_id, current.action_type, current.prompt, current.target_ref, current.value_ref, current.risk_level,
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
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      const risk = String(row.risk_level);
      const capability = String(row.capability_status ?? 'UNVERIFIED');
      const locateCapability = String(row.locate_capability_status ?? 'UNVERIFIED');
      const executionMode = risk !== 'HIGH' && capability === 'VERIFIED'
        ? 'MIDSCENE_EXECUTE_PLAYWRIGHT_VERIFY'
        : locateCapability === 'VERIFIED'
          ? 'MIDSCENE_LOCATE_PLAYWRIGHT_EXECUTE'
          : 'PLAYWRIGHT_ONLY';
      db.prepare(`
        INSERT INTO action_execution_slots(
          slot_id, plan_id, task_id, action_id, lease_owner, lease_expires_at, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
      `).run(slotId, row.plan_id, row.task_id, row.action_id, workerId, leaseExpiresAt, timestamp, timestamp);
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
        window: {
          globalExecutionSummary: JSON.parse(String(row.summary_json)),
          previousActionSummary: row.previous_action_summary_json ? JSON.parse(String(row.previous_action_summary_json)) : null,
          currentAction: {
            actionType: row.action_type,
            prompt: row.prompt,
            targetRef: row.target_ref,
            valueRef: row.value_ref,
            riskLevel: row.risk_level,
            executionMode
          },
          nextActionPreview: row.next_type ? { actionType: row.next_type, prompt: row.next_prompt } : null,
          lastObservation: row.last_observation_json ? JSON.parse(String(row.last_observation_json)) : null,
          currentPageState: row.current_page_state_json ? JSON.parse(String(row.current_page_state_json)) : null,
          currentLease: { slotId, leaseExpiresAt }
        }
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
  }): Promise<Record<string, unknown>> {
    return this.database.write(db => {
      const timestamp = nowIso();
      const slot = db.prepare(`
        SELECT s.*, i.ordinal, i.action_type, ap.cursor_ordinal, ap.script_id
        FROM action_execution_slots s
        JOIN action_plan_items i ON i.action_id = s.action_id
        JOIN action_plans ap ON ap.plan_id = s.plan_id
        WHERE s.slot_id = ? AND s.task_id = ?
      `).get(input.slotId, taskId) as Record<string, unknown> | undefined;
      if (!slot) throw new HarnessError(404, 'ACTION_SLOT_NOT_FOUND', 'DOMAIN', '动作租约不存在。');
      if (slot.status !== 'ACTIVE' || slot.lease_owner !== input.workerId || String(slot.lease_expires_at) < timestamp) {
        throw new HarnessError(409, 'ACTION_LEASE_CONFLICT', 'CONCURRENCY', '动作租约已失效。', false, true);
      }
      const deterministicVerified = Object.values(input.verification).every(Boolean);
      if (input.outcome === 'VERIFIED_PASSED' && !deterministicVerified) {
        throw new HarnessError(400, 'PLAYWRIGHT_VERIFICATION_REQUIRED', 'EVIDENCE', 'Midscene 动作必须由 Playwright 独立验证。');
      }
      const itemStatus = input.outcome;
      db.prepare(`UPDATE action_plan_items SET status = ?, verification_json = ?, updated_at = ? WHERE action_id = ?`)
        .run(itemStatus, canonicalJson(input.verification), timestamp, slot.action_id);
      db.prepare(`UPDATE action_execution_slots SET status = ?, version = version + 1, updated_at = ? WHERE slot_id = ?`)
        .run(input.outcome === 'VERIFIED_PASSED' ? 'COMPLETED' : 'FAILED', timestamp, input.slotId);
      if (input.outcome !== 'VERIFIED_PASSED') {
        db.prepare(`UPDATE action_plans SET status = 'WAITING_USER', version = version + 1, updated_at = ? WHERE plan_id = ?`)
          .run(timestamp, slot.plan_id);
        db.prepare(`
          UPDATE tasks SET status = 'WAITING_USER', progress = 0, result_summary = ?, error_code = ?,
            error_category = 'TEST_FAILURE', user_action_required = 1, version = version + 1, updated_at = ?
          WHERE task_id = ?
        `).run(input.summary, input.outcome === 'AMBIGUOUS' ? 'MIDSCENE_ACTION_AMBIGUOUS' : 'MIDSCENE_ACTION_FAILED', timestamp, taskId);
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
      SELECT namespace, run_id, status, lease_owner FROM tasks
      WHERE task_id = ? AND task_type = 'RUN_EXECUTE'
    `).get(taskId) as { namespace: string; run_id: string; status: string; lease_owner: string | null } | undefined);
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
    const taskStatus = input.outcome === 'PASSED' ? 'SUCCEEDED' : 'FAILED';
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
    });
    return {
      taskId,
      runId: task.run_id,
      status: taskStatus,
      outcome: input.outcome,
      resultArtifactId: resultArtifact?.artifactId ?? null,
      artifactIds: artifacts.map(item => item.artifactId)
    };
  }

  getTask(namespace: string, taskId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT t.*, r.version AS run_version
        FROM tasks t LEFT JOIN runs r ON r.run_id = t.run_id
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
        summary: row.result_summary,
        resultArtifactId: row.result_artifact_id,
        errorCode: row.error_code,
        errorCategory: row.error_category,
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
      } else {
        currentVersion = (db.prepare('SELECT current_version AS version FROM scripts WHERE namespace = ? AND script_id = ?').get(input.namespace, input.targetId) as { version: number } | undefined)?.version;
      }
      if (currentVersion === undefined) throw new HarnessError(404, 'DECISION_TARGET_NOT_FOUND', 'DOMAIN', '决策目标不存在。');
      if (currentVersion !== input.expectedVersion) {
        throw new HarnessError(409, 'TARGET_VERSION_CONFLICT', 'CONCURRENCY', '决策目标版本已变化。', false, true, { currentVersion });
      }
      const decisionId = opaqueId('decision');
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
