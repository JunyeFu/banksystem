ALTER TABLE schedules ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'RECURRING'
  CHECK (schedule_type IN ('RECURRING', 'ONE_TIME'));
ALTER TABLE schedules ADD COLUMN run_at TEXT;
ALTER TABLE schedules ADD COLUMN script_id TEXT REFERENCES scripts(script_id) ON DELETE RESTRICT;
ALTER TABLE schedules ADD COLUMN script_version INTEGER CHECK (script_version IS NULL OR script_version > 0);
ALTER TABLE schedules ADD COLUMN script_sha256 TEXT CHECK (script_sha256 IS NULL OR length(script_sha256) = 64);
ALTER TABLE schedules ADD COLUMN one_time_state TEXT
  CHECK (one_time_state IS NULL OR one_time_state IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'));
ALTER TABLE schedules ADD COLUMN completed_at TEXT;
ALTER TABLE schedules ADD COLUMN confirmation_ref TEXT;

UPDATE schedules
SET script_id = (SELECT p.script_id FROM plans p WHERE p.plan_id = schedules.plan_id),
    script_version = (
      SELECT s.current_version FROM plans p
      JOIN scripts s ON s.script_id = p.script_id
      JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
      WHERE p.plan_id = schedules.plan_id AND sv.created_at <= schedules.created_at
    ),
    script_sha256 = (
      SELECT sv.sha256 FROM plans p
      JOIN scripts s ON s.script_id = p.script_id
      JOIN script_versions sv ON sv.script_id = s.script_id AND sv.version = s.current_version
      WHERE p.plan_id = schedules.plan_id AND sv.created_at <= schedules.created_at
    );

UPDATE schedules
SET status = 'DISABLED', completed_at = updated_at
WHERE script_id IS NULL OR script_version IS NULL OR script_sha256 IS NULL;

CREATE TABLE result_inbox_items (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id TEXT NOT NULL UNIQUE,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE RESTRICT,
  schedule_id TEXT REFERENCES schedules(schedule_id) ON DELETE RESTRICT,
  schedule_type TEXT CHECK (schedule_type IS NULL OR schedule_type IN ('RECURRING', 'ONE_TIME')),
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  plan_id TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE RESTRICT,
  script_id TEXT NOT NULL REFERENCES scripts(script_id) ON DELETE RESTRICT,
  script_version INTEGER NOT NULL CHECK (script_version > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('PASSED', 'FAILED', 'BLOCKED')),
  summary TEXT NOT NULL,
  result_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  artifact_metadata_json TEXT NOT NULL CHECK (json_valid(artifact_metadata_json)),
  delivery_status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (delivery_status IN ('UNREAD', 'READ')),
  read_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (namespace, run_id),
  FOREIGN KEY (case_id, case_version) REFERENCES case_versions(case_id, version)
) STRICT;

CREATE INDEX idx_result_inbox_namespace_sequence
  ON result_inbox_items(namespace, delivery_status, sequence DESC);
CREATE INDEX idx_schedules_exact_script
  ON schedules(namespace, script_id, script_version);
CREATE UNIQUE INDEX idx_i8_schedules_confirmation
  ON schedules(namespace, confirmation_ref) WHERE confirmation_ref IS NOT NULL;

CREATE TRIGGER trg_result_inbox_identity_immutable
BEFORE UPDATE OF inbox_id, namespace, run_id, task_id, schedule_id, schedule_type,
  case_id, case_version, plan_id, script_id, script_version, outcome, summary,
  result_artifact_id, artifact_metadata_json, created_at
ON result_inbox_items
BEGIN
  SELECT RAISE(ABORT, 'RESULT_INBOX_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER trg_result_inbox_no_delete
BEFORE DELETE ON result_inbox_items
BEGIN
  SELECT RAISE(ABORT, 'RESULT_INBOX_IMMUTABLE');
END;
