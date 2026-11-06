import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import sensitiveTextRule from '../../contracts/security/sensitive-text-v1.json';
import { HarnessDatabase } from './database';
import { HarnessError } from './errors';
import { serializeWithinBudget } from './output-budget';
import { namespaceSchema } from './schemas';
import { canonicalJson, nowIso, sha256 } from './utils';
import { workbenchOperations, WorkbenchOperation, WorkbenchTurn, WorkbenchProfile, WorkbenchConversation, SubmitTurn, UpdateTurn, SaveModel } from './workbench-contract';

type Sqlite = import('better-sqlite3').Database;
type ConversationRow = { namespace: string; conversation_id: string; title: string; created_at: string; updated_at: string; last_turn_id: string | null };
type TurnRow = { turn_id: string; conversation_id: string; input_message_id: string; request_json: string; model_binding_json: string; version: number; status: WorkbenchTurn['status']; created_at: string; updated_at: string; checkpoint_session_id: string | null; journey_id: string | null; run_id: string | null; task_id: string | null; answer: string | null; failure_code: string | null; human_intervention_required: number };
type MessageRow = { ordinal: number; message_id: string; role: 'user' | 'assistant'; text: string; created_at: string; turn_id: string };
type EventRow = { sequence: number; type: WorkbenchTurn['events'][number]['type']; summary: string; tool_name: string | null; created_at: string };
type ModelRow = { model_id: string; version: number; current_version: number; display_name: string; model: string; base_url: string; key_ref: string; is_default: number };

const conflict = (code: string) => new HarnessError(409, code, 'CONTRACT', '会话状态或版本冲突，请读取最新状态。', false, true);
const invalid = (code: string) => new HarnessError(400, code, 'CONTRACT', '会话元数据请求无效。', false, true);
const missing = () => new HarnessError(404, 'AGENT_METADATA_NOT_FOUND', 'CONTRACT', '未找到本命名空间中的记录。');
const secretPattern = new RegExp(sensitiveTextRule.pattern, sensitiveTextRule.flags);
function assertSafe(value: unknown): void {
  if (typeof value === 'string' && secretPattern.test(value)) throw invalid('AGENT_SECRET_FORBIDDEN');
  if (Array.isArray(value)) value.forEach(assertSafe);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertSafe);
}
function fitsPage(value: unknown): boolean {
  try { serializeWithinBudget(value, 'L2'); return true; }
  catch (error) {
    if (error instanceof HarnessError && error.errorCode === 'OUTPUT_BUDGET_EXCEEDED') return false;
    throw error;
  }
}

export class WorkbenchRepository {
  constructor(private readonly database: HarnessDatabase) {}

  // Trusted local acceptance reads the complete Journey, never the capped Quality list.
  executionSnapshot(namespace: string, journeyId: string): Record<string, unknown> {
    namespaceSchema.parse(namespace);
    if (!/^journey_[0-9a-f-]{36}$/.test(journeyId)) throw invalid('AGENT_JOURNEY_ID_INVALID');
    return this.database.read(db => db.transaction(() => {
      if (!db.prepare('SELECT 1 FROM i10_interaction_journeys WHERE namespace=? AND journey_id=?').get(namespace, journeyId)) throw missing();
      const runs = db.prepare(`SELECT r.run_id AS runId,r.task_id AS taskId,t.attempt_count AS attemptCount,
        (SELECT count(*) FROM audit_events a WHERE a.namespace=r.namespace AND a.run_id=r.run_id
          AND a.task_id=r.task_id AND a.action='run.claim') AS claimCount
        FROM runs r LEFT JOIN tasks t ON t.namespace=r.namespace AND t.task_id=r.task_id
        WHERE r.namespace=? AND r.journey_id=? ORDER BY r.run_id`).all(namespace, journeyId);
      const turns = db.prepare(`SELECT turn_id AS turnId,run_id AS runId,task_id AS taskId,
        checkpoint_session_id AS checkpointSessionId,model_binding_json AS modelBinding
        FROM workbench_turns WHERE namespace=? AND journey_id=? ORDER BY turn_id`).all(namespace, journeyId);
      return { journeyId, runs, turns };
    }).deferred());
  }

  async execute(name: WorkbenchOperation, namespace: string, value: unknown): Promise<unknown> {
    namespaceSchema.parse(namespace);
    const operation = workbenchOperations[name];
    const input = operation.input.parse(value);
    assertSafe(input);
    const perform = (db: Sqlite) => {
      this.namespace(db, namespace, operation.access === 'WRITE');
      const result = this.dispatch(db, name, namespace, input);
      const checked = operation.output.parse(result);
      serializeWithinBudget(checked, 'L3');
      return checked;
    };
    return operation.access === 'WRITE' ? this.database.write(perform)
      : this.database.read(db => db.transaction(() => perform(db)).deferred());
  }

  private dispatch(db: Sqlite, name: WorkbenchOperation, ns: string, value: unknown): unknown {
    switch (name) {
      case 'workbench_submission_get': {
        const input = value as z.output<typeof workbenchOperations.workbench_submission_get.input>;
        const row = db.prepare(`SELECT * FROM workbench_turns WHERE namespace=? AND conversation_id=? AND ${input.turnId ? 'turn_id' : 'submission_id'}=?`)
          .get(ns, input.conversationId, input.turnId ?? input.submissionId) as TurnRow | undefined;
        return { turn: row ? this.turn(db, ns, row) : null, request: row ? JSON.parse(row.request_json) : null };
      }
      case 'workbench_conversation_create': {
        const input = value as z.output<typeof workbenchOperations.workbench_conversation_create.input>;
        const previous = this.conversationRow(db, ns, input.conversationId);
        if (previous) return this.conversation(db, previous);
        const time = nowIso();
        db.prepare('INSERT INTO workbench_conversations(namespace,conversation_id,title,created_at,updated_at) VALUES (?,?,?,?,?)').run(ns, input.conversationId, input.title, time, time);
        return this.conversation(db, this.conversationRow(db, ns, input.conversationId)!);
      }
      case 'workbench_conversation_list': return this.listConversations(db, ns, value as z.output<typeof workbenchOperations.workbench_conversation_list.input>);
      case 'workbench_conversation_get': return this.history(db, ns, value as z.output<typeof workbenchOperations.workbench_conversation_get.input>);
      case 'workbench_model_save': return this.saveModel(db, ns, value as SaveModel);
      case 'workbench_model_list': {
        const rows = db.prepare('SELECT model_id FROM workbench_models WHERE namespace=? ORDER BY is_default DESC,model_id').all(ns) as { model_id: string }[];
        return { models: rows.map(row => this.profile(this.modelRow(db, ns, row.model_id))) };
      }
      case 'workbench_model_get': {
        const input = value as z.output<typeof workbenchOperations.workbench_model_get.input>;
        const row = this.modelRow(db, ns, input.modelId, input.version);
        return { ...this.profile(row), keyRef: row.key_ref };
      }
      case 'workbench_model_default': {
        const input = value as z.output<typeof workbenchOperations.workbench_model_default.input>;
        const row = this.modelRow(db, ns, input.modelId);
        if (row.version !== input.expectedVersion) throw conflict('AGENT_MODEL_VERSION_CONFLICT');
        db.prepare('UPDATE workbench_models SET is_default=0 WHERE namespace=? AND is_default=1').run(ns);
        db.prepare('UPDATE workbench_models SET is_default=1 WHERE namespace=? AND model_id=?').run(ns, input.modelId);
        return this.profile(this.modelRow(db, ns, input.modelId));
      }
      case 'workbench_turn_submit': return this.submit(db, ns, value as SubmitTurn);
      case 'workbench_turn_get': {
        const input = value as z.output<typeof workbenchOperations.workbench_turn_get.input>;
        return this.turn(db, ns, this.turnRow(db, ns, input.turnId), input.after, input.limit);
      }
      case 'workbench_turn_update': return this.update(db, ns, value as UpdateTurn);
    }
  }

  private namespace(db: Sqlite, ns: string, create: boolean): void {
    if (create) {
      const time = nowIso();
      db.prepare("INSERT OR IGNORE INTO namespaces(namespace,status,version,created_at,updated_at) VALUES (?,'ACTIVE',1,?,?)").run(ns, time, time);
    }
    const row = db.prepare('SELECT status FROM namespaces WHERE namespace=?').get(ns) as { status: string } | undefined;
    if (row && row.status !== 'ACTIVE') throw new HarnessError(403, 'NAMESPACE_NOT_ACTIVE', 'AUTHORIZATION', '命名空间不可用。');
  }

  private conversationRow(db: Sqlite, ns: string, id: string): ConversationRow | undefined {
    return db.prepare('SELECT * FROM workbench_conversations WHERE namespace=? AND conversation_id=?').get(ns, id) as ConversationRow | undefined;
  }
  private conversation(db: Sqlite, row: ConversationRow): WorkbenchConversation {
    return { id: row.conversation_id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, lastTurnId: row.last_turn_id,
      status: row.last_turn_id ? this.turnRow(db, row.namespace, row.last_turn_id).status : 'IDLE' };
  }
  private listConversations(db: Sqlite, ns: string, input: z.output<typeof workbenchOperations.workbench_conversation_list.input>) {
    let boundary: { t: string; i: string } | undefined;
    if (input.cursor) {
      try { boundary = z.object({ t: z.iso.datetime(), i: z.uuid() }).strict().parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))); }
      catch { throw invalid('AGENT_HISTORY_CURSOR_INVALID'); }
    }
    const q = `%${(input.q ?? '').replace(/[\\%_]/g, '\\$&')}%`;
    const rows = db.prepare(`SELECT c.* FROM workbench_conversations c WHERE c.namespace=@ns
      AND (c.title LIKE @q ESCAPE '\\' OR EXISTS(SELECT 1 FROM workbench_messages m WHERE m.namespace=c.namespace AND m.conversation_id=c.conversation_id AND m.text LIKE @q ESCAPE '\\'))
      ${boundary ? 'AND (c.updated_at<@t OR (c.updated_at=@t AND c.conversation_id<@id))' : ''}
      ORDER BY c.updated_at DESC,c.conversation_id DESC LIMIT @limit`).all({ ns, q, limit: input.limit + 1, ...(boundary ? { t: boundary.t, id: boundary.i } : {}) }) as ConversationRow[];
    const selected: WorkbenchConversation[] = [];
    for (const row of rows.slice(0, input.limit)) {
      const candidate = this.conversation(db, row);
      if (!fitsPage({ conversations: [...selected, candidate], nextCursor: 'x'.repeat(160) })) break;
      selected.push(candidate);
    }
    if (rows.length && !selected.length) throw invalid('AGENT_HISTORY_ITEM_TOO_LARGE');
    const last = selected.at(-1);
    return { conversations: selected, nextCursor: last && rows.length > selected.length ? Buffer.from(JSON.stringify({ t: last.updatedAt, i: last.id })).toString('base64url') : null };
  }

  private modelRow(db: Sqlite, ns: string, id: string, version?: number): ModelRow {
    const row = db.prepare(`SELECT v.*,m.current_version,m.is_default FROM workbench_models m JOIN workbench_model_versions v
      ON v.namespace=m.namespace AND v.model_id=m.model_id AND v.version=COALESCE(?,m.current_version)
      WHERE m.namespace=? AND m.model_id=?`).get(version ?? null, ns, id) as ModelRow | undefined;
    if (!row) throw missing();
    return row;
  }
  private profile(row: ModelRow): WorkbenchProfile {
    return { id: row.model_id, version: row.version, displayName: row.display_name, model: row.model, baseUrl: row.base_url,
      keyConfigured: true, isDefault: row.is_default === 1 && row.version === row.current_version };
  }
  private saveModel(db: Sqlite, ns: string, input: SaveModel): WorkbenchProfile {
    const url = new URL(input.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw invalid('AGENT_MODEL_BASE_URL_INVALID');
    const row = db.prepare('SELECT current_version FROM workbench_models WHERE namespace=? AND model_id=?').get(ns, input.modelId) as { current_version: number } | undefined;
    if ((row?.current_version ?? 0) !== input.expectedVersion) throw conflict('AGENT_MODEL_VERSION_CONFLICT');
    const next = input.expectedVersion + 1;
    if (!row) db.prepare('INSERT INTO workbench_models(namespace,model_id,current_version) VALUES (?,?,?)').run(ns, input.modelId, next);
    db.prepare('INSERT INTO workbench_model_versions(namespace,model_id,version,display_name,model,base_url,key_ref) VALUES (?,?,?,?,?,?,?)')
      .run(ns, input.modelId, next, input.displayName, input.model, input.baseUrl, input.keyRef);
    if (row) db.prepare('UPDATE workbench_models SET current_version=? WHERE namespace=? AND model_id=? AND current_version=?').run(next, ns, input.modelId, input.expectedVersion);
    return this.profile(this.modelRow(db, ns, input.modelId));
  }

  private turnRow(db: Sqlite, ns: string, id: string): TurnRow {
    const row = db.prepare('SELECT * FROM workbench_turns WHERE namespace=? AND turn_id=?').get(ns, id) as TurnRow | undefined;
    if (!row) throw missing();
    return row;
  }
  private turn(db: Sqlite, ns: string, row: TurnRow, after = 0, limit = 50, summaryOnly = false): WorkbenchTurn {
    const result: WorkbenchTurn = {
      id: row.turn_id, conversationId: row.conversation_id, version: row.version, status: row.status, inputMessageId: row.input_message_id,
      modelBinding: JSON.parse(row.model_binding_json), createdAt: row.created_at, updatedAt: row.updated_at,
      humanInterventionRequired: row.human_intervention_required === 1, events: [], hasMoreEvents: false
    };
    const parent = (row as TurnRow & { continuation_of_turn_id: string | null }).continuation_of_turn_id;
    if (parent) result.continuationOfTurnId = parent;
    for (const [key, value] of Object.entries({ checkpointSessionId: row.checkpoint_session_id, journeyId: row.journey_id, runId: row.run_id, taskId: row.task_id,
      answer: summaryOnly ? null : row.answer, failureCode: row.failure_code })) if (value !== null) Object.assign(result, { [key]: value });
    const rows = db.prepare('SELECT * FROM workbench_events WHERE namespace=? AND turn_id=? AND sequence>? ORDER BY sequence LIMIT ?')
      .all(ns, row.turn_id, after, summaryOnly ? 1 : limit + 1) as EventRow[];
    if (!summaryOnly) for (const item of rows.slice(0, limit)) {
      const event: WorkbenchTurn['events'][number] = { sequence: item.sequence, type: item.type, summary: item.summary, createdAt: item.created_at,
        ...(item.tool_name ? { toolName: item.tool_name } : {}) };
      if (!fitsPage({ ...result, events: [...result.events, event], hasMoreEvents: true })) break;
      result.events.push(event);
    }
    result.hasMoreEvents = rows.length > result.events.length;
    if (!fitsPage(result)) throw invalid('AGENT_TURN_ITEM_TOO_LARGE');
    return result;
  }

  private history(db: Sqlite, ns: string, input: z.output<typeof workbenchOperations.workbench_conversation_get.input>) {
    const conversation = this.conversationRow(db, ns, input.conversationId);
    if (!conversation) throw missing();
    let before: number | undefined;
    if (input.before) {
      const anchor = db.prepare('SELECT ordinal FROM workbench_messages WHERE namespace=? AND conversation_id=? AND message_id=?').get(ns, input.conversationId, input.before) as { ordinal: number } | undefined;
      if (!anchor) throw invalid('AGENT_MESSAGE_CURSOR_INVALID');
      before = anchor.ordinal;
    }
    const rows = db.prepare(`SELECT * FROM workbench_messages WHERE namespace=? AND conversation_id=? ${before === undefined ? '' : 'AND ordinal<?'} ORDER BY ordinal DESC LIMIT ?`)
      .all(ns, input.conversationId, ...(before === undefined ? [] : [before]), input.limit + 1) as MessageRow[];
    const selected: MessageRow[] = [];
    const project = (items: MessageRow[]) => ({
      conversation: this.conversation(db, conversation),
      messages: [...items].reverse().map(row => ({ id: row.message_id, role: row.role, text: row.text, createdAt: row.created_at, turnId: row.turn_id })),
      turns: [...new Set(items.map(row => row.turn_id))].map(id => this.turn(db, ns, this.turnRow(db, ns, id), 0, 0, true)),
      nextMessageCursor: rows.length > items.length ? items.at(-1)?.message_id ?? null : null
    });
    for (const row of rows.slice(0, input.limit)) {
      if (!fitsPage(project([...selected, row]))) break;
      selected.push(row);
    }
    if (rows.length && !selected.length) throw invalid('AGENT_HISTORY_ITEM_TOO_LARGE');
    return project(selected);
  }

  private submit(db: Sqlite, ns: string, input: SubmitTurn) {
    const conversation = this.conversationRow(db, ns, input.conversationId);
    if (!conversation) throw missing();
    const request = canonicalJson(input);
    const duplicate = db.prepare('SELECT * FROM workbench_turns WHERE namespace=? AND conversation_id=? AND submission_id=?').get(ns, input.conversationId, input.submissionId) as TurnRow | undefined;
    if (duplicate) {
      if (duplicate.request_json !== request) throw conflict('AGENT_SUBMISSION_CONFLICT');
      return { created: false, turn: this.turn(db, ns, duplicate) };
    }
    const previous = conversation.last_turn_id ? this.turnRow(db, ns, conversation.last_turn_id) : undefined;
    if (previous && ['RUNNING', 'STOP_REQUESTED'].includes(previous.status)) throw conflict('AGENT_CONVERSATION_BUSY');
    const continuation = previous?.status === 'NEEDS_INPUT' ? previous : undefined;
    const model = this.modelRow(db, ns, input.modelProfileId, continuation ? input.modelProfileVersion : undefined);
    if (model.version !== input.modelProfileVersion) throw conflict('AGENT_MODEL_VERSION_CONFLICT');
    const binding = { profileId: model.model_id, profileVersion: model.version, model: model.model, baseUrlHash: sha256(model.base_url), releaseIdentityHash: input.releaseIdentityHash };
    if (continuation && continuation.model_binding_json !== canonicalJson(binding)) throw conflict('AGENT_CONTINUATION_BINDING_CONFLICT');
    const time = nowIso(), id = randomUUID(), messageId = randomUUID();
    db.prepare(`INSERT INTO workbench_turns(namespace,conversation_id,turn_id,submission_id,input_message_id,request_json,model_binding_json,continuation_of_turn_id,
      version,status,journey_id,human_intervention_required,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,'RUNNING',?,0,?,?)`)
      .run(ns, input.conversationId, id, input.submissionId, messageId, request, canonicalJson(binding), continuation?.turn_id ?? null, continuation?.journey_id ?? null, time, time);
    db.prepare('INSERT INTO workbench_messages(namespace,conversation_id,message_id,turn_id,role,text,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(ns, input.conversationId, messageId, id, 'user', input.input, time);
    db.prepare("INSERT INTO workbench_events(namespace,turn_id,sequence,type,summary,created_at) VALUES (?,?,1,'ACCEPTED','已登记测试目标，尚未声明执行成功。',?)").run(ns, id, time);
    const title = conversation.last_turn_id === null ? input.input.replace(/\s+/g, ' ').slice(0, 120).replace(/[\uD800-\uDBFF]$/, '') : conversation.title;
    db.prepare('UPDATE workbench_conversations SET last_turn_id=?,updated_at=?,title=? WHERE namespace=? AND conversation_id=?').run(id, time, title, ns, input.conversationId);
    return { created: true, turn: this.turn(db, ns, this.turnRow(db, ns, id)) };
  }

  private update(db: Sqlite, ns: string, input: UpdateTurn): WorkbenchTurn {
    const row = this.turnRow(db, ns, input.turnId);
    if (row.version !== input.expectedVersion) throw conflict('AGENT_TURN_VERSION_CONFLICT');
    if (!['RUNNING', 'STOP_REQUESTED'].includes(row.status)) throw conflict('AGENT_TURN_TERMINAL');
    if (row.status === 'STOP_REQUESTED' && ['RUNNING', 'NEEDS_INPUT'].includes(input.status)) throw conflict('AGENT_TURN_TRANSITION_INVALID');
    const final = ['NEEDS_INPUT', 'COMPLETED', 'FAILED', 'STOP_REQUESTED', 'INTERRUPTED'].includes(input.status);
    if ((final && input.event.type !== input.status) || (!final && !['PLANNING', 'TOOL_STARTED', 'TOOL_FINISHED'].includes(input.event.type))) throw invalid('AGENT_EVENT_STATUS_INVALID');
    if (['NEEDS_INPUT', 'COMPLETED'].includes(input.status) && !input.answer) throw invalid('AGENT_ANSWER_REQUIRED');
    if (['FAILED', 'INTERRUPTED'].includes(input.status) && !input.failureCode) throw invalid('AGENT_FAILURE_CODE_REQUIRED');
    if (input.humanInterventionRequired !== !['RUNNING', 'COMPLETED'].includes(input.status)) throw invalid('AGENT_INTERVENTION_STATUS_INVALID');
    const fields = { checkpoint_session_id: input.checkpointSessionId, journey_id: input.journeyId, run_id: input.runId, task_id: input.taskId };
    for (const [key, value] of Object.entries(fields)) {
      const current = row[key as keyof TurnRow];
      if (value !== undefined && current !== null && current !== value) throw conflict('AGENT_EXECUTION_REFERENCE_CONFLICT');
    }
    const runId = input.runId ?? row.run_id, taskId = input.taskId ?? row.task_id;
    if (Boolean(runId) !== Boolean(taskId)) throw invalid('AGENT_EXECUTION_PAIR_REQUIRED');
    const time = nowIso(), next = row.version + 1;
    db.prepare(`UPDATE workbench_turns SET version=?,status=?,checkpoint_session_id=?,journey_id=?,run_id=?,task_id=?,answer=?,failure_code=?,human_intervention_required=?,updated_at=?
      WHERE namespace=? AND turn_id=? AND version=?`).run(next, input.status, input.checkpointSessionId ?? row.checkpoint_session_id, input.journeyId ?? row.journey_id,
      runId, taskId, input.answer ?? row.answer, input.failureCode ?? row.failure_code, Number(input.humanInterventionRequired), time, ns, input.turnId, input.expectedVersion);
    db.prepare('INSERT INTO workbench_events(namespace,turn_id,sequence,type,summary,tool_name,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(ns, input.turnId, next, input.event.type, input.event.summary, input.event.toolName ?? null, time);
    if (input.answer) db.prepare('INSERT INTO workbench_messages(namespace,conversation_id,message_id,turn_id,role,text,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(ns, row.conversation_id, randomUUID(), input.turnId, 'assistant', input.answer, time);
    db.prepare('UPDATE workbench_conversations SET updated_at=? WHERE namespace=? AND conversation_id=?').run(time, ns, row.conversation_id);
    return this.turn(db, ns, this.turnRow(db, ns, input.turnId));
  }
}
