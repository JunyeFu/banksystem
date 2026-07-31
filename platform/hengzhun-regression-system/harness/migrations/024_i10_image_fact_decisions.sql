CREATE TABLE i10_image_fact_decisions (
  decision_id TEXT PRIMARY KEY,
  image_ingest_id TEXT NOT NULL REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  fact_id TEXT NOT NULL REFERENCES i10_case_fact_candidates(fact_id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('CONFIRM','CORRECT','REJECT')),
  replacement_value_redacted TEXT,
  replacement_value_hash TEXT CHECK (replacement_value_hash IS NULL OR length(replacement_value_hash)=64),
  confirmation_ref TEXT NOT NULL,
  expected_job_version INTEGER NOT NULL CHECK (expected_job_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE(image_ingest_id,fact_id),
  CHECK (
    (decision='CORRECT' AND replacement_value_redacted IS NOT NULL AND replacement_value_hash IS NOT NULL)
    OR
    (decision IN ('CONFIRM','REJECT') AND replacement_value_redacted IS NULL AND replacement_value_hash IS NULL)
  )
) STRICT;

CREATE INDEX idx_i10_image_fact_decisions_job
  ON i10_image_fact_decisions(image_ingest_id,created_at);

CREATE TRIGGER trg_i10_image_fact_decision_immutable
BEFORE UPDATE ON i10_image_fact_decisions
BEGIN SELECT RAISE(ABORT,'I10_IMAGE_FACT_DECISION_IMMUTABLE'); END;

CREATE TRIGGER trg_i10_image_fact_decision_no_delete
BEFORE DELETE ON i10_image_fact_decisions
BEGIN SELECT RAISE(ABORT,'I10_IMAGE_FACT_DECISION_IMMUTABLE'); END;
