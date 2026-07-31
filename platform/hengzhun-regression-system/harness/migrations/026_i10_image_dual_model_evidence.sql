DROP TRIGGER trg_i10_image_controller_immutable;
DROP TRIGGER trg_i10_image_controller_no_delete;

ALTER TABLE i10_image_controller_invocations RENAME TO i10_image_controller_invocations_legacy;

CREATE TABLE i10_image_controller_invocations (
  invocation_id TEXT PRIMARY KEY,
  image_ingest_id TEXT NOT NULL REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  invocation_type TEXT NOT NULL CHECK (invocation_type IN ('REAL', 'VISION_REAL')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (image_ingest_id, invocation_type)
) STRICT;

INSERT INTO i10_image_controller_invocations (
  invocation_id,
  image_ingest_id,
  invocation_type,
  provider,
  model,
  input_tokens,
  output_tokens,
  created_at
)
SELECT
  invocation_id,
  image_ingest_id,
  invocation_type,
  provider,
  model,
  input_tokens,
  output_tokens,
  created_at
FROM i10_image_controller_invocations_legacy;

DROP TABLE i10_image_controller_invocations_legacy;

CREATE TRIGGER trg_i10_image_controller_immutable
BEFORE UPDATE ON i10_image_controller_invocations
BEGIN
  SELECT RAISE(ABORT, 'I10_IMAGE_CONTROLLER_EVIDENCE_IMMUTABLE');
END;

CREATE TRIGGER trg_i10_image_controller_no_delete
BEFORE DELETE ON i10_image_controller_invocations
BEGIN
  SELECT RAISE(ABORT, 'I10_IMAGE_CONTROLLER_EVIDENCE_IMMUTABLE');
END;
