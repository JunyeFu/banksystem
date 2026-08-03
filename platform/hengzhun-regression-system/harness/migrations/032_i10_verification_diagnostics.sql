ALTER TABLE i10_verification_challenges ADD COLUMN page_fingerprint TEXT;
ALTER TABLE i10_verification_challenges ADD COLUMN policy_mode TEXT;
CREATE UNIQUE INDEX idx_i10_verification_challenge_dedupe
  ON i10_verification_challenges(namespace, task_ref, action_ordinal, page_fingerprint)
  WHERE page_fingerprint IS NOT NULL;

CREATE TABLE i10_execution_diagnostics (
  diagnostic_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  action_ordinal INTEGER,
  semantic_target_ref TEXT,
  verification_policy TEXT,
  page_fingerprint TEXT,
  route_path TEXT,
  safe_error_code TEXT NOT NULL,
  model_status TEXT NOT NULL CHECK (model_status IN ('NOT_CALLED','CALLED','TIMEOUT','FAILED')),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_i10_execution_diagnostics_job ON i10_execution_diagnostics(job_id, created_at DESC);
