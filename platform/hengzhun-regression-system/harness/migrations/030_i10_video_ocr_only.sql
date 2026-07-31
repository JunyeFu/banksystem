CREATE TABLE i10_video_controller_invocations (
  invocation_id TEXT PRIMARY KEY,
  ingest_job_id TEXT NOT NULL UNIQUE REFERENCES i10_ingest_jobs(ingest_job_id),
  invocation_type TEXT NOT NULL CHECK (invocation_type = 'REAL'),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  created_at TEXT NOT NULL
);

CREATE TRIGGER trg_i10_video_controller_invocation_immutable
BEFORE UPDATE ON i10_video_controller_invocations
BEGIN
  SELECT RAISE(ABORT,'I10_VIDEO_CONTROLLER_INVOCATION_IMMUTABLE');
END;

CREATE TRIGGER trg_i10_video_controller_invocation_no_delete
BEFORE DELETE ON i10_video_controller_invocations
BEGIN
  SELECT RAISE(ABORT,'I10_VIDEO_CONTROLLER_INVOCATION_IMMUTABLE');
END;
