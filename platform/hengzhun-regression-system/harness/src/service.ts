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

export class HarnessService {
  readonly artifacts: ArtifactStore;

  constructor(readonly database: HarnessDatabase, artifactRoot: string) {
    this.artifacts = new ArtifactStore(database, artifactRoot);
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
        steps: input.steps,
        assertions: input.assertions,
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
      return {
        status: 201,
        objectType: 'CASE',
        objectId: caseId,
        response: {
          caseId,
          version,
          status: 'VALIDATED',
          validationIssues: [],
          summary: input.summary
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
      const definition = JSON.parse(versionRow.definition_json) as { steps: unknown[]; assertions: unknown[] };
      const planId = opaqueId('plan');
      const taskId = opaqueId('task');
      const planStatus = input.executionRoute === 'PLAYWRIGHT' ? 'READY' : 'AUTHORING_REQUIRED';
      const summary = {
        executionRoute: input.executionRoute,
        stepCount: definition.steps.length,
        assertionCount: definition.assertions.length,
        workerRequired: input.executionRoute === 'PLAYWRIGHT'
      };
      db.prepare(`
        INSERT INTO plans(plan_id, namespace, case_id, case_version, version, status, summary_json, content_hash, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(planId, input.namespace, caseId, input.expectedCaseVersion, planStatus, canonicalJson(summary), sha256(canonicalJson(summary)), timestamp);
      db.prepare(`
        INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, result_summary, version, created_at, updated_at, completed_at)
        VALUES (?, ?, 'PLAN_COMPILE', 'SUCCEEDED', 100, ?, ?, 1, ?, ?, ?)
      `).run(taskId, input.namespace, caseId, `计划 ${planId} 已编译。`, timestamp, timestamp, timestamp);
      return {
        status: 202,
        objectType: 'PLAN',
        objectId: planId,
        taskId,
        response: { taskId, planId, status: 'SUCCEEDED', planStatus, caseId, caseVersion: input.expectedCaseVersion }
      };
    });
  }

  async submitRun(input: RunSubmitInput, context: RequestContext): Promise<IdempotentResult> {
    return this.idempotent(input.namespace, 'run_submit', input.idempotencyKey, input, context, (db, timestamp) => {
      const plan = db.prepare(`
        SELECT p.status, p.case_id, p.case_version, c.current_version
        FROM plans p JOIN cases c ON c.case_id = p.case_id
        WHERE p.namespace = ? AND p.plan_id = ?
      `).get(input.namespace, input.planId) as { status: string; case_id: string; case_version: number; current_version: number } | undefined;
      if (!plan || plan.case_id !== input.caseId) throw new HarnessError(404, 'PLAN_NOT_FOUND', 'DOMAIN', '执行计划不存在。');
      if (plan.case_version !== input.expectedCaseVersion || plan.current_version !== input.expectedCaseVersion) {
        throw new HarnessError(409, 'CASE_VERSION_CONFLICT', 'CONCURRENCY', '案例或计划版本已变化。', false, true);
      }
      if (plan.status !== 'READY') throw new HarnessError(409, 'PLAN_NOT_RUNNABLE', 'DOMAIN', '计划当前不可执行。', false, true);
      const runId = opaqueId('run');
      const taskId = opaqueId('task');
      db.prepare(`
        INSERT INTO tasks(task_id, namespace, task_type, status, progress, case_id, run_id, version, created_at, updated_at)
        VALUES (?, ?, 'RUN_EXECUTE', 'QUEUED', 0, ?, ?, 1, ?, ?)
      `).run(taskId, input.namespace, input.caseId, runId, timestamp, timestamp);
      db.prepare(`
        INSERT INTO runs(run_id, namespace, case_id, case_version, plan_id, task_id, status, version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', 1, ?)
      `).run(runId, input.namespace, input.caseId, input.expectedCaseVersion, input.planId, taskId, timestamp);
      return {
        status: 202,
        objectType: 'RUN',
        objectId: runId,
        runId,
        taskId,
        response: { taskId, runId, status: 'QUEUED', namespace: input.namespace, caseId: input.caseId }
      };
    });
  }

  getTask(namespace: string, taskId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare('SELECT * FROM tasks WHERE namespace = ? AND task_id = ?').get(namespace, taskId) as Record<string, unknown> | undefined;
      if (!row) throw new HarnessError(404, 'TASK_NOT_FOUND', 'DOMAIN', '任务不存在。');
      return {
        taskId: row.task_id,
        runId: row.run_id,
        caseId: row.case_id,
        type: row.task_type,
        status: row.status,
        progress: row.progress,
        version: row.version,
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
      return {
        status: 201,
        objectType: 'DECISION',
        objectId: decisionId,
        response: {
          decisionId,
          targetType: input.targetType,
          targetId: input.targetId,
          status: 'RECORDED',
          version: 1,
          effect: 'DEFERRED_TO_FUTURE_BATCH'
        }
      };
    });
  }
}
