CREATE TABLE i10_authoring_contexts_retry_copy AS
SELECT context_id, job_id, action_id, ordinal, context_level, envelope_json, envelope_hash, created_at
FROM i10_authoring_contexts;

DROP TRIGGER trg_i10_authoring_context_no_delete;
DROP TRIGGER trg_i10_authoring_context_immutable;
DROP TABLE i10_authoring_contexts;

CREATE TABLE i8_candidate_build_jobs_retry (
  job_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  executable_plan_id TEXT NOT NULL REFERENCES i8_executable_plans(executable_plan_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  stability_policy_version TEXT NOT NULL DEFAULT 'I8_2X3_V1'
) STRICT;

INSERT INTO i8_candidate_build_jobs_retry(
  job_id, namespace, executable_plan_id, status, lease_owner, lease_expires_at,
  attempt_count, error_code, version, created_at, updated_at, completed_at,
  stability_policy_version
)
SELECT
  job_id, namespace, executable_plan_id, status, lease_owner, lease_expires_at,
  attempt_count, error_code, version, created_at, updated_at, completed_at,
  stability_policy_version
FROM i8_candidate_build_jobs;

DROP TABLE i8_candidate_build_jobs;
ALTER TABLE i8_candidate_build_jobs_retry RENAME TO i8_candidate_build_jobs;

CREATE INDEX idx_i8_candidate_jobs_claim
  ON i8_candidate_build_jobs(status, created_at);
CREATE INDEX idx_i10_candidate_jobs_plan_history
  ON i8_candidate_build_jobs(executable_plan_id, created_at DESC);

CREATE TABLE i10_authoring_contexts (
  context_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES i8_candidate_build_jobs(job_id) ON DELETE RESTRICT,
  action_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  context_level TEXT NOT NULL CHECK (context_level IN ('CTX-L1', 'CTX-L2', 'CTX-L3')),
  envelope_json TEXT NOT NULL CHECK (json_valid(envelope_json)),
  envelope_hash TEXT NOT NULL CHECK (length(envelope_hash) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (job_id, action_id),
  UNIQUE (job_id, ordinal)
) STRICT;

INSERT INTO i10_authoring_contexts(
  context_id, job_id, action_id, ordinal, context_level, envelope_json, envelope_hash, created_at
)
SELECT context_id, job_id, action_id, ordinal, context_level, envelope_json, envelope_hash, created_at
FROM i10_authoring_contexts_retry_copy;

DROP TABLE i10_authoring_contexts_retry_copy;

CREATE INDEX idx_i10_authoring_contexts_job ON i10_authoring_contexts(job_id, ordinal);

CREATE TRIGGER trg_i10_authoring_context_immutable
BEFORE UPDATE ON i10_authoring_contexts
BEGIN
  SELECT RAISE(ABORT, 'I10_AUTHORING_CONTEXT_IMMUTABLE');
END;

CREATE TRIGGER trg_i10_authoring_context_no_delete
BEFORE DELETE ON i10_authoring_contexts
BEGIN
  SELECT RAISE(ABORT, 'I10_AUTHORING_CONTEXT_IMMUTABLE');
END;
