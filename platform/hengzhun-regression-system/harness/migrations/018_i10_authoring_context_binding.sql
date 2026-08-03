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
