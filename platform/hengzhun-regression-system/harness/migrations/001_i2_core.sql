CREATE TABLE namespaces (
  namespace TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE cases (
  case_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  current_version INTEGER NOT NULL CHECK (current_version > 0),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'VALIDATED', 'ARCHIVED')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (namespace, case_id)
) STRICT;

CREATE TABLE case_versions (
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (case_id, version)
) STRICT;

CREATE TABLE plans (
  plan_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('READY', 'AUTHORING_REQUIRED', 'REJECTED')),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id, case_version) REFERENCES case_versions(case_id, version),
  UNIQUE (namespace, case_id, case_version, version)
) STRICT;

CREATE TABLE scripts (
  script_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  current_version INTEGER NOT NULL CHECK (current_version > 0),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'VALIDATING', 'SCRIPT_VALIDATED', 'RETIRED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE script_versions (
  script_id TEXT NOT NULL REFERENCES scripts(script_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('UNVALIDATED', 'VALIDATING', 'PASSED', 'FAILED')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (script_id, version)
) STRICT;

CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  task_type TEXT NOT NULL CHECK (task_type IN ('PLAN_COMPILE', 'RUN_EXECUTE', 'SCRIPT_VALIDATE', 'ARTIFACT_PROCESS')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING_USER', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  case_id TEXT REFERENCES cases(case_id) ON DELETE RESTRICT,
  run_id TEXT,
  result_summary TEXT,
  result_artifact_id TEXT,
  error_code TEXT,
  error_category TEXT,
  retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  user_action_required INTEGER NOT NULL DEFAULT 0 CHECK (user_action_required IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(task_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'BLOCKED', 'CANCELLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (case_id, case_version) REFERENCES case_versions(case_id, version),
  UNIQUE (namespace, run_id)
) STRICT;

CREATE TABLE decisions (
  decision_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('SCRIPT_ACTIVATION', 'RUN_RECOVERY')),
  target_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL CHECK (expected_version > 0),
  choice TEXT NOT NULL CHECK (choice IN ('APPROVE', 'REJECT', 'RETRY', 'CANCEL')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECORDED', 'REJECTED_VERSION_CONFLICT')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  run_id TEXT REFERENCES runs(run_id) ON DELETE RESTRICT,
  task_id TEXT REFERENCES tasks(task_id) ON DELETE RESTRICT,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('JSON', 'TEXT', 'SCREENSHOT', 'VIDEO', 'TRACE', 'LOG', 'REPORT', 'DIAGNOSTIC')),
  relative_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  media_type TEXT NOT NULL,
  redaction_status TEXT NOT NULL CHECK (redaction_status IN ('NOT_REQUIRED', 'REDACTED', 'QUARANTINED')),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  run_id TEXT,
  task_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('COZE', 'HARNESS', 'WORKER', 'USER', 'SYSTEM')),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'REJECTED', 'SUCCEEDED', 'FAILED')),
  correlation_id TEXT NOT NULL,
  credential_fingerprint TEXT,
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE security_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'REJECTED')),
  reason_code TEXT NOT NULL,
  remote_address TEXT NOT NULL,
  credential_fingerprint TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE idempotency_keys (
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_status INTEGER NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (namespace, operation, idempotency_key)
) STRICT;

CREATE INDEX idx_cases_namespace ON cases(namespace, updated_at DESC);
CREATE INDEX idx_tasks_namespace_status ON tasks(namespace, status, updated_at DESC);
CREATE INDEX idx_runs_namespace_case ON runs(namespace, case_id, created_at DESC);
CREATE INDEX idx_artifacts_namespace_run ON artifacts(namespace, run_id, created_at DESC);
CREATE INDEX idx_audit_namespace_object ON audit_events(namespace, object_type, object_id, sequence);

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE');
END;
