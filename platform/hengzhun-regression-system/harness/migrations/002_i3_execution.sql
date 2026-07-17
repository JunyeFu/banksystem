ALTER TABLE tasks ADD COLUMN payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json));
ALTER TABLE tasks ADD COLUMN lease_owner TEXT;
ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT;
ALTER TABLE tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);

ALTER TABLE runs ADD COLUMN credential_alias TEXT;
ALTER TABLE runs ADD COLUMN fixture_namespace TEXT;

CREATE UNIQUE INDEX idx_runs_fixture_namespace
ON runs(namespace, fixture_namespace)
WHERE fixture_namespace IS NOT NULL;

CREATE INDEX idx_tasks_worker_queue
ON tasks(task_type, status, created_at)
WHERE task_type = 'RUN_EXECUTE';

CREATE TABLE knowledge_retrieval_events (
  retrieval_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT REFERENCES cases(case_id) ON DELETE RESTRICT,
  source_authority TEXT NOT NULL CHECK (source_authority = 'COZE_KNOWLEDGE_BASE'),
  query_hash TEXT NOT NULL CHECK (length(query_hash) = 64),
  result_hash TEXT NOT NULL CHECK (length(result_hash) = 64),
  citation_refs_json TEXT NOT NULL CHECK (json_valid(citation_refs_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_knowledge_retrieval_namespace_case
ON knowledge_retrieval_events(namespace, case_id, created_at DESC);
