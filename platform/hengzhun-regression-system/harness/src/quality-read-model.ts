import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import { serializeWithinBudget } from './output-budget';

type Row = Record<string, unknown>;
const stringValue = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

function caseStatus(value: unknown): 'DRAFT' | 'APPROVED' | 'ARCHIVED' {
  if (value === 'VALIDATED') return 'APPROVED';
  if (value === 'ARCHIVED') return 'ARCHIVED';
  return 'DRAFT';
}

function incidentStatus(value: unknown): 'OPEN' | 'INVESTIGATING' | 'RECOVERING' | 'RESOLVED' {
  if (value === 'RESOLVED') return 'RESOLVED';
  if (value === 'CANDIDATE_READY') return 'RECOVERING';
  if (value === 'DIAGNOSED') return 'INVESTIGATING';
  return 'OPEN';
}

function incidentSeverity(value: unknown): 'P1' | 'P2' | 'P3' {
  if (['AUTHENTICATION', 'CONTRACT', 'PRODUCT_DEFECT'].includes(stringValue(value))) return 'P1';
  if (['ASSERTION', 'LOCATOR', 'SCRIPT_LOGIC'].includes(stringValue(value))) return 'P2';
  return 'P3';
}

function parseDefinition(value: unknown): Row {
  try { return JSON.parse(stringValue(value, '{}')) as Row; } catch { return {}; }
}

function definitionSteps(value: unknown): string[] {
  const steps = parseDefinition(value).steps;
  if (!Array.isArray(steps)) return [];
  return steps.flatMap(step => {
    if (typeof step === 'string') return [step];
    if (!step || typeof step !== 'object') return [];
    const record = step as Row;
    const label = record.description ?? record.instruction ?? record.action ?? record.title;
    return typeof label === 'string' ? [label] : [];
  });
}

export class QualityReadModel {
  constructor(private readonly database: HarnessDatabase, private readonly releaseIdentityHash: string | undefined,
    private readonly currentIdentity: () => string | undefined) {}

  private releaseBlocked(db: HarnessDatabase['connection'], identity: string, allowedFailures: unknown): boolean {
    if (identity === this.releaseIdentityHash && this.currentIdentity() !== identity) return true;
    return (db.prepare("SELECT run_id FROM runs WHERE release_identity_hash=? AND status IN ('FAILED','BLOCKED')")
      .all(identity) as Row[]).some(run => !Array.isArray(allowedFailures) || !allowedFailures.includes(run.run_id));
  }

  overview(): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT
          (SELECT count(*) FROM cases WHERE status <> 'ARCHIVED') AS case_count,
          (SELECT count(*) FROM runs WHERE status IN ('QUEUED','RUNNING')) AS running_count,
          (SELECT count(*) FROM failure_incidents WHERE diagnostic_status <> 'RESOLVED') AS open_incident_count,
          (SELECT count(*) FROM runs WHERE created_at >= datetime('now','-7 days') AND status IN ('PASSED','FAILED')) AS terminal_count,
          (SELECT count(*) FROM runs WHERE created_at >= datetime('now','-7 days') AND status = 'PASSED') AS passed_count
      `).get() as Row;
      const terminal = Number(row.terminal_count ?? 0);
      const verification=this.releaseIdentityHash ? db.prepare('SELECT decision,result_json FROM release_verifications WHERE release_identity_hash=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(this.releaseIdentityHash) as Row | undefined : undefined;
      const expectedFailures=verification?parseDefinition(verification.result_json).allowedFailedRunIds:[];
      const unexpectedFailure=this.releaseIdentityHash && this.releaseBlocked(db, this.releaseIdentityHash, expectedFailures);
      return {
        services: [
          { name: 'Harness', status: 'HEALTHY', latencyMs: 0 },
          { name: 'SQLite', status: this.database.quickCheck().join(',') === 'ok' ? 'HEALTHY' : 'DEGRADED', latencyMs: 0 }
        ],
        caseCount: Number(row.case_count ?? 0),
        runningCount: Number(row.running_count ?? 0),
        passRate: terminal === 0 ? 0 : Number(((Number(row.passed_count ?? 0) / terminal) * 100).toFixed(1)),
        openIncidentCount: Number(row.open_incident_count ?? 0),
        // A failed current-identity run blocks release. Passing runs alone do
        // not establish suite coverage, verified evidence or release approval.
        releaseGate: unexpectedFailure?'BLOCKED':verification ? (verification.decision==='GO'?'PASS':'BLOCKED') : 'PENDING'
      };
    });
  }

  cases(query: {limit?: number; cursor?: string | null; q?: string; status?: string} = {}): {items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean} {
    const limit = query.limit ?? 20;
    const search = query.q ?? '';
    const statuses = ['DRAFT','IN_REVIEW','APPROVED','CONFLICT','ARCHIVED'];
    const invalid = () => new HarnessError(400,'QUALITY_CASE_QUERY_INVALID','CONTRACT','质量用例分页参数无效。');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || search.length > 200 || (query.status && !statuses.includes(query.status))) throw invalid();
    let cursor: {updatedAt:string; caseId:string} | undefined;
    if (query.cursor) {
      try {
        if (query.cursor.length > 4096) throw invalid();
        const parsed = JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));
        if (typeof parsed.updatedAt !== 'string' || typeof parsed.caseId !== 'string' || !parsed.updatedAt || !parsed.caseId) throw invalid();
        cursor = parsed;
      } catch { throw invalid(); }
    }
    return this.database.read(db => {
      const rows = db.prepare(`
      SELECT c.case_id, c.title, c.risk_level, c.status, c.current_version, c.updated_at, cv.definition_json
      FROM cases c JOIN case_versions cv ON cv.case_id = c.case_id AND cv.version = c.current_version
      WHERE (? = '' OR instr(lower(c.case_id || c.title || coalesce(json_extract(cv.definition_json,'$.domain'),c.risk_level)),lower(?)) > 0)
        AND (? = '' OR CASE WHEN c.status = 'VALIDATED' THEN 'APPROVED' WHEN c.status = 'ARCHIVED' THEN 'ARCHIVED' ELSE 'DRAFT' END = ?)
        AND (? = '' OR c.updated_at < ? OR (c.updated_at = ? AND c.case_id > ?))
      ORDER BY c.updated_at DESC, c.case_id
      LIMIT ?
    `).all(search,search,query.status ?? '',query.status ?? '',cursor?.updatedAt ?? '',cursor?.updatedAt ?? '',cursor?.updatedAt ?? '',cursor?.caseId ?? '',limit + 1) as Row[];
      const items = rows.slice(0,limit).map(row => {
      const definition = parseDefinition(row.definition_json);
      return { caseId: row.case_id, name: row.title, domain: stringValue(definition.domain, stringValue(row.risk_level, 'GENERAL')),
        status: caseStatus(row.status), version: row.current_version, updatedAt: row.updated_at };
      });
      // Keep the established response budget; the cursor includes every omitted row.
      while (true) {
        const last = items[items.length - 1];
        const hasMore = items.length < rows.length;
        const page = {items,hasMore,nextCursor:hasMore && last ? Buffer.from(JSON.stringify({updatedAt:last.updatedAt,caseId:last.caseId})).toString('base64url') : null};
        try { serializeWithinBudget(page,'L1'); return page; }
        catch (error) {
          if (!(error instanceof HarnessError) || error.errorCode !== 'OUTPUT_BUDGET_EXCEEDED' || items.length <= 1) throw error;
          items.pop();
        }
      }
    });
  }

  caseDetail(caseId: string): Record<string, unknown> {
    return this.database.read(db => {
      const row = db.prepare(`
        SELECT c.case_id, c.title, c.summary, c.risk_level, c.status, c.current_version, c.updated_at,
               cv.definition_json, cv.content_hash,
               (SELECT sc.certificate_id FROM i8_stability_certificates sc
                JOIN i8_script_candidates candidate ON candidate.candidate_id = sc.candidate_id
                JOIN i8_executable_plans executable ON executable.executable_plan_id = candidate.executable_plan_id
                WHERE executable.case_id = c.case_id ORDER BY sc.issued_at DESC LIMIT 1) AS baseline_id,
               (SELECT count(*) FROM artifacts artifact JOIN runs run ON run.run_id = artifact.run_id
                WHERE run.case_id = c.case_id) AS evidence_count
        FROM cases c JOIN case_versions cv ON cv.case_id = c.case_id AND cv.version = c.current_version
        WHERE c.case_id = ?
      `).get(caseId) as Row | undefined;
      if (!row) throw new HarnessError(404, 'QUALITY_CASE_NOT_FOUND', 'CONTRACT', '质量用例不存在。');
      const definition = parseDefinition(row.definition_json);
      return { caseId: row.case_id, name: row.title, domain: stringValue(definition.domain, stringValue(row.risk_level, 'GENERAL')),
        status: caseStatus(row.status), version: row.current_version, updatedAt: row.updated_at,
        description: stringValue(definition.description, stringValue(row.summary)), steps: definitionSteps(row.definition_json),
        baselineId: row.baseline_id ?? null, evidenceCount: Number(row.evidence_count ?? 0), sha256: row.content_hash };
    });
  }

  baselines(): Record<string, unknown>[] {
    return this.database.read(db => (db.prepare(`
      SELECT certificate.certificate_id, executable.case_id, cases.title, certificate.case_version,
             certificate.evidence_set_hash, certificate.issued_at
      FROM i8_stability_certificates certificate
      JOIN i8_script_candidates candidate ON candidate.candidate_id = certificate.candidate_id
      JOIN i8_executable_plans executable ON executable.executable_plan_id = candidate.executable_plan_id
      JOIN cases ON cases.case_id = executable.case_id ORDER BY certificate.issued_at DESC
    `).all() as Row[]).map(row => ({ baselineId: row.certificate_id, caseId: row.case_id, caseName: row.title,
      version: row.case_version, status: 'APPROVED', sha256: row.evidence_set_hash, createdAt: row.issued_at })));
  }

  runs(): Record<string, unknown>[] {
    return this.database.read(db => (db.prepare(`
      SELECT run.run_id, run.journey_id, run.release_identity_hash, cases.title, run.environment, run.status,
             task.progress, task.result_summary, run.created_at, run.started_at, run.completed_at,
             (SELECT json_extract(artifact.metadata_json, '$.correlationId') FROM artifacts artifact
              WHERE artifact.run_id = run.run_id AND json_type(artifact.metadata_json, '$.correlationId') = 'text'
              ORDER BY artifact.created_at DESC LIMIT 1) AS correlation_id
      FROM runs run JOIN cases ON cases.case_id = run.case_id JOIN tasks task ON task.task_id = run.task_id
      ORDER BY run.created_at DESC LIMIT 200
    `).all() as Row[]).map(row => {
      const status = row.status === 'PASSED' ? 'COMPLETED' : row.status === 'BLOCKED' ? 'FAILED' : row.status;
      const startedAt = stringValue(row.started_at, stringValue(row.created_at));
      const completedAt = stringValue(row.completed_at);
      const durationSeconds = completedAt ? Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000)) : undefined;
      return { runId: row.run_id, caseName: row.title, environment: row.environment, status,
        progress: row.status === 'PASSED' ? 100 : Number(row.progress ?? 0), startedAt,
        ...(row.journey_id ? { journeyId: row.journey_id } : {}),
        ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
        ...(row.release_identity_hash ? { releaseIdentity: row.release_identity_hash } : {}),
        ...(durationSeconds === undefined ? {} : { durationSeconds }), ...(row.result_summary ? { assertionSummary: row.result_summary } : {}) };
    }));
  }

  schedules(): Record<string, unknown>[] {
    return this.database.read(db => (db.prepare(`
      SELECT schedule.schedule_id, cases.title, schedule.cron_expression, schedule.environment, schedule.status,
             schedule.next_fire_at, (SELECT execution.status FROM schedule_executions execution
               WHERE execution.schedule_id = schedule.schedule_id ORDER BY execution.scheduled_for DESC LIMIT 1) AS last_status
      FROM schedules schedule JOIN cases ON cases.case_id = schedule.case_id ORDER BY schedule.created_at DESC
    `).all() as Row[]).map(row => ({ scheduleId: row.schedule_id, name: row.title, cron: row.cron_expression,
      environment: row.environment, enabled: row.status === 'ACTIVE', nextRunAt: row.next_fire_at,
      lastResult: row.last_status === 'SUCCEEDED' ? 'PASS' : row.last_status === 'FAILED' ? 'FAIL' : 'NONE' })));
  }

  incidents(): Record<string, unknown>[] {
    return this.database.read(db => (db.prepare(`
      SELECT incident_id, summary, classification, diagnostic_status, run_id, reason_code, diagnosis_json, created_at
      FROM failure_incidents ORDER BY created_at DESC LIMIT 200
    `).all() as Row[]).map(row => {
      const diagnosis = parseDefinition(row.diagnosis_json);
      return { incidentId: row.incident_id, title: row.summary, severity: incidentSeverity(row.classification),
        status: incidentStatus(row.diagnostic_status), runId: row.run_id,
        rootCause: stringValue(diagnosis.rootCause, stringValue(row.reason_code)),
        recoveryOption: stringValue(diagnosis.recoveryOption), createdAt: row.created_at };
    }));
  }

  knowledge(): Record<string, unknown>[] {
    return this.database.read(db => (db.prepare(`
      SELECT snapshot_id, source_ref, source_version, content_hash, citation_ids_json, registered_at
      FROM i9_knowledge_snapshot_refs ORDER BY registered_at DESC LIMIT 200
    `).all() as Row[]).map(row => {
      let citations: unknown[] = [];
      try {
        const parsed = JSON.parse(stringValue(row.citation_ids_json, '[]')) as unknown;
        citations = Array.isArray(parsed) ? parsed : [];
      } catch { citations = []; }
      return { snapshotId: row.snapshot_id, sourceRef: row.source_ref, sourceVersion: row.source_version,
        sha256: row.content_hash, citationCount: citations.length, registeredAt: row.registered_at };
    }));
  }

  releases(): Record<string, unknown>[] {
    return this.database.read(db => {
      const verified=(db.prepare(`SELECT v.* FROM release_verifications v WHERE v.rowid=(
        SELECT x.rowid FROM release_verifications x WHERE x.release_identity_hash=v.release_identity_hash ORDER BY x.created_at DESC,x.rowid DESC LIMIT 1)
        ORDER BY v.created_at DESC LIMIT 100`).all() as Row[]).map(row=>({
          releaseId:row.release_identity_hash,version:row.release_identity_hash,
          status:row.decision==='GO' && !this.releaseBlocked(db, String(row.release_identity_hash),
            parseDefinition(row.result_json).allowedFailedRunIds) ? 'READY':'BLOCKED',
          benchmarkPassRate:Number(row.required)>0?Number(((Number(row.passed)/Number(row.required))*100).toFixed(1)):0,
          evidenceSha256:row.evidence_sha256,createdAt:row.created_at
        }));
      const identities=new Set(verified.map(row=>row.releaseId));
      const runs=(db.prepare(`
      SELECT release_identity_hash, count(*) AS total,
        sum(CASE WHEN status = 'PASSED' THEN 1 ELSE 0 END) AS passed,
        sum(CASE WHEN status IN ('FAILED','BLOCKED') THEN 1 ELSE 0 END) AS failed,
        min(created_at) AS created_at
      FROM runs WHERE release_identity_hash IS NOT NULL
      GROUP BY release_identity_hash ORDER BY min(created_at) DESC LIMIT 100
    `).all() as Row[]).map(row => ({
      releaseId: row.release_identity_hash, version: row.release_identity_hash,
      status: Number(row.failed) > 0 ? 'BLOCKED' : 'DRAFT',
      benchmarkPassRate: Number(((Number(row.passed) / Number(row.total)) * 100).toFixed(1)),
      evidenceSha256: null, createdAt: row.created_at
    })).filter(row=>!identities.has(row.releaseId));
      return [...verified,...runs].slice(0,100);
    });
  }
}
