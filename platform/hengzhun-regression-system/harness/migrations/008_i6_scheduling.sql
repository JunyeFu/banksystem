ALTER TABLE runs ADD COLUMN environment TEXT NOT NULL DEFAULT 'local' CHECK (environment = 'local');
ALTER TABLE runs ADD COLUMN fixture_scope TEXT;
ALTER TABLE runs ADD COLUMN origin_schedule_id TEXT;
ALTER TABLE runs ADD COLUMN schedule_execution_id TEXT;

CREATE TABLE schedules (
  schedule_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  plan_id TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE RESTRICT,
  credential_alias TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment = 'local'),
  fixture_scope TEXT NOT NULL,
  misfire_policy TEXT NOT NULL CHECK (misfire_policy IN ('SKIP', 'RUN_ONCE')),
  misfire_grace_seconds INTEGER NOT NULL CHECK (misfire_grace_seconds BETWEEN 0 AND 86400),
  max_retries INTEGER NOT NULL CHECK (max_retries BETWEEN 0 AND 5),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED_FAILURE', 'DISABLED')),
  next_fire_at TEXT NOT NULL,
  last_evaluated_at TEXT,
  paused_incident_id TEXT REFERENCES failure_incidents(incident_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id, case_version) REFERENCES case_versions(case_id, version),
  UNIQUE (namespace, schedule_id)
) STRICT;

CREATE TABLE schedule_executions (
  execution_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(schedule_id) ON DELETE RESTRICT,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'PENDING', 'QUEUED', 'RUNNING', 'RETRY_QUEUED',
    'SUCCEEDED', 'FAILED', 'SKIPPED_MISFIRE', 'SKIPPED_MUTEX'
  )),
  run_id TEXT REFERENCES runs(run_id) ON DELETE RESTRICT,
  task_id TEXT REFERENCES tasks(task_id) ON DELETE RESTRICT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
  reason_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (schedule_id, scheduled_for)
) STRICT;

CREATE TABLE schedule_recovery_decisions (
  decision_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  schedule_id TEXT NOT NULL REFERENCES schedules(schedule_id) ON DELETE RESTRICT,
  expected_version INTEGER NOT NULL CHECK (expected_version > 0),
  choice TEXT NOT NULL CHECK (choice IN ('APPROVE', 'REJECT')),
  reason TEXT NOT NULL,
  confirmation_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECORDED', 'REJECTED_VERSION_CONFLICT')),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_schedules_due ON schedules(status, next_fire_at);
CREATE INDEX idx_schedule_executions_schedule ON schedule_executions(schedule_id, scheduled_for DESC);
CREATE INDEX idx_runs_execution_lock ON runs(environment, fixture_scope, status)
WHERE fixture_scope IS NOT NULL AND status IN ('QUEUED', 'RUNNING');

CREATE TRIGGER schedule_recovery_decisions_no_update
BEFORE UPDATE ON schedule_recovery_decisions
BEGIN
  SELECT RAISE(ABORT, 'SCHEDULE_RECOVERY_DECISION_IMMUTABLE');
END;

CREATE TRIGGER schedule_recovery_decisions_no_delete
BEFORE DELETE ON schedule_recovery_decisions
BEGIN
  SELECT RAISE(ABORT, 'SCHEDULE_RECOVERY_DECISION_IMMUTABLE');
END;
