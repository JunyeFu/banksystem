CREATE TABLE i10_image_controller_invocations (
  invocation_id TEXT PRIMARY KEY,
  image_ingest_id TEXT NOT NULL UNIQUE REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  invocation_type TEXT NOT NULL CHECK (invocation_type='REAL'),
  provider TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens>=0), output_tokens INTEGER NOT NULL CHECK (output_tokens>=0),
  created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER trg_i10_image_controller_immutable BEFORE UPDATE ON i10_image_controller_invocations BEGIN SELECT RAISE(ABORT,'I10_IMAGE_CONTROLLER_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_image_controller_no_delete BEFORE DELETE ON i10_image_controller_invocations BEGIN SELECT RAISE(ABORT,'I10_IMAGE_CONTROLLER_EVIDENCE_IMMUTABLE'); END;
