CREATE TABLE i10_verification_attempts (
  attempt_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  task_ref TEXT NOT NULL,
  action_ordinal INTEGER NOT NULL,
  page_fingerprint TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  verification_type TEXT NOT NULL,
  attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal BETWEEN 1 AND 3),
  automation_assessment TEXT NOT NULL CHECK (automation_assessment IN ('AUTO_PASSED','WEB_CONTROL_CLICKED','NOT_APPLICABLE','FAILED','HANDOFF_REQUIRED')),
  assessment_reason TEXT NOT NULL,
  route_path TEXT,
  evidence_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(namespace, task_ref, action_ordinal, page_fingerprint, attempt_ordinal)
) STRICT;
CREATE INDEX idx_i10_verification_attempts_task ON i10_verification_attempts(namespace, task_ref, created_at DESC);

CREATE TRIGGER i10_verification_attempts_no_update
BEFORE UPDATE ON i10_verification_attempts
BEGIN SELECT RAISE(ABORT, 'I10_VERIFICATION_ATTEMPTS_IMMUTABLE'); END;
CREATE TRIGGER i10_verification_attempts_no_delete
BEFORE DELETE ON i10_verification_attempts
BEGIN SELECT RAISE(ABORT, 'I10_VERIFICATION_ATTEMPTS_IMMUTABLE'); END;
