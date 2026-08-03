CREATE TABLE i10_ingest_item_decisions (
  decision_id TEXT PRIMARY KEY,
  ingest_job_id TEXT NOT NULL REFERENCES i10_ingest_jobs(ingest_job_id) ON DELETE RESTRICT,
  ingest_item_id TEXT NOT NULL REFERENCES i10_ingest_items(ingest_item_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 1000),
  decision TEXT NOT NULL CHECK (decision IN ('CONFIRM','REJECT')),
  confirmation_ref TEXT NOT NULL,
  expected_job_version INTEGER NOT NULL CHECK (expected_job_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE(ingest_job_id,ingest_item_id)
) STRICT;

CREATE INDEX idx_i10_ingest_item_decisions_job
  ON i10_ingest_item_decisions(ingest_job_id,ordinal);

CREATE TRIGGER trg_i10_ingest_item_decision_immutable
BEFORE UPDATE ON i10_ingest_item_decisions
BEGIN SELECT RAISE(ABORT,'I10_INGEST_ITEM_DECISION_IMMUTABLE'); END;

CREATE TRIGGER trg_i10_ingest_item_decision_no_delete
BEFORE DELETE ON i10_ingest_item_decisions
BEGIN SELECT RAISE(ABORT,'I10_INGEST_ITEM_DECISION_IMMUTABLE'); END;
