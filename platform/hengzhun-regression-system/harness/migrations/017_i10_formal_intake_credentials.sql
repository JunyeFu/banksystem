ALTER TABLE i8_candidate_build_jobs ADD COLUMN stability_policy_version TEXT NOT NULL DEFAULT 'I8_2X3_V1'
  CHECK (stability_policy_version IN ('I8_2X3_V1', 'I10_2X2_V1'));

CREATE TABLE i10_credential_sessions (
  session_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  label TEXT NOT NULL,
  capture_token_hash TEXT NOT NULL CHECK (length(capture_token_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('AWAITING_INPUT', 'READY', 'EXPIRED', 'REVOKED')),
  credential_ref TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (namespace, idempotency_key)
) STRICT;

CREATE TABLE i10_credential_refs (
  credential_ref TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  session_id TEXT NOT NULL UNIQUE REFERENCES i10_credential_sessions(session_id) ON DELETE RESTRICT,
  encrypted_blob_path TEXT NOT NULL UNIQUE,
  encrypted_blob_sha256 TEXT NOT NULL CHECK (length(encrypted_blob_sha256) = 64),
  protection_scope TEXT NOT NULL CHECK (protection_scope = 'WINDOWS_DPAPI_CURRENT_USER'),
  created_at TEXT NOT NULL,
  last_used_at TEXT
) STRICT;

CREATE TABLE i10_ingest_jobs (
  ingest_job_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  input_type TEXT NOT NULL CHECK (input_type IN ('CASE_FILE', 'VIDEO')),
  flowise_file_ref TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  source_size_bytes INTEGER NOT NULL CHECK (source_size_bytes > 0),
  credential_ref TEXT REFERENCES i10_credential_refs(credential_ref) ON DELETE RESTRICT,
  hints_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(hints_json)),
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'WAITING_USER', 'CONFIRMED', 'REJECTED', 'FAILED')),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  missing_fields_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_fields_json)),
  draft_count INTEGER NOT NULL DEFAULT 0 CHECK (draft_count BETWEEN 0 AND 1000),
  error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  lease_owner TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (namespace, idempotency_key)
) STRICT;

CREATE TABLE i10_ingest_items (
  ingest_item_id TEXT PRIMARY KEY,
  ingest_job_id TEXT NOT NULL REFERENCES i10_ingest_jobs(ingest_job_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 1000),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  draft_hash TEXT NOT NULL CHECK (length(draft_hash) = 64),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  missing_fields_json TEXT NOT NULL CHECK (json_valid(missing_fields_json)),
  confirmed_case_id TEXT REFERENCES cases(case_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (ingest_job_id, ordinal)
) STRICT;

CREATE TABLE i10_ingest_item_revisions (
  revision_id TEXT PRIMARY KEY,
  ingest_item_id TEXT NOT NULL REFERENCES i10_ingest_items(ingest_item_id) ON DELETE RESTRICT,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  draft_hash TEXT NOT NULL CHECK (length(draft_hash) = 64),
  reason TEXT NOT NULL,
  confirmation_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (ingest_item_id, revision_no)
) STRICT;

CREATE TABLE i10_video_frames (
  frame_id TEXT PRIMARY KEY,
  ingest_job_id TEXT NOT NULL REFERENCES i10_ingest_jobs(ingest_job_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 240),
  timestamp_ms INTEGER NOT NULL CHECK (timestamp_ms >= 0),
  image_sha256 TEXT NOT NULL CHECK (length(image_sha256) = 64),
  redacted_image_path TEXT NOT NULL,
  ocr_text_hash TEXT NOT NULL CHECK (length(ocr_text_hash) = 64),
  visual_observation_json TEXT NOT NULL CHECK (json_valid(visual_observation_json)),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL,
  UNIQUE (ingest_job_id, ordinal)
) STRICT;

CREATE TABLE i10_action_traces (
  trace_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  preparation_id TEXT,
  consumer_model TEXT NOT NULL,
  context_policy TEXT NOT NULL CHECK (context_policy IN ('CTX-L1', 'CTX-L2', 'CTX-L3')),
  trace_json TEXT NOT NULL CHECK (json_valid(trace_json)),
  trace_hash TEXT NOT NULL UNIQUE CHECK (length(trace_hash) = 64),
  playwright_fact_hash TEXT CHECK (playwright_fact_hash IS NULL OR length(playwright_fact_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('MIDSCENE_RECORDED', 'PLAYWRIGHT_VERIFIED', 'REJECTED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE i10_stability_policy_bindings (
  object_type TEXT NOT NULL CHECK (object_type IN ('CANDIDATE_BATCH', 'CANDIDATE_CERTIFICATE', 'REPAIR_BATCH', 'REPAIR_CERTIFICATE')),
  object_id TEXT NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version IN ('I8_2X3_V1', 'I10_2X2_V1')),
  required_runs INTEGER NOT NULL CHECK (required_runs IN (4, 6)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (object_type, object_id)
) STRICT;

INSERT INTO i10_stability_policy_bindings(object_type, object_id, policy_version, required_runs, created_at)
SELECT 'CANDIDATE_BATCH', batch_id, 'I8_2X3_V1', 6, created_at FROM i8_stability_batches;
INSERT INTO i10_stability_policy_bindings(object_type, object_id, policy_version, required_runs, created_at)
SELECT 'CANDIDATE_CERTIFICATE', certificate_id, 'I8_2X3_V1', 6, issued_at FROM i8_stability_certificates;
INSERT INTO i10_stability_policy_bindings(object_type, object_id, policy_version, required_runs, created_at)
SELECT 'REPAIR_BATCH', batch_id, 'I8_2X3_V1', 6, created_at FROM i8_repair_stability_batches;
INSERT INTO i10_stability_policy_bindings(object_type, object_id, policy_version, required_runs, created_at)
SELECT 'REPAIR_CERTIFICATE', certificate_id, 'I8_2X3_V1', 6, issued_at FROM i8_repair_stability_certificates;

CREATE INDEX idx_i10_credential_session_status ON i10_credential_sessions(status, expires_at);
CREATE INDEX idx_i10_ingest_claim ON i10_ingest_jobs(status, input_type, created_at);
CREATE INDEX idx_i10_ingest_items_job ON i10_ingest_items(ingest_job_id, ordinal);
CREATE INDEX idx_i10_ingest_revisions_item ON i10_ingest_item_revisions(ingest_item_id, revision_no DESC);
CREATE INDEX idx_i10_video_frames_job ON i10_video_frames(ingest_job_id, ordinal);

CREATE TRIGGER trg_i10_credential_ref_immutable BEFORE UPDATE OF credential_ref, namespace, session_id, encrypted_blob_path, encrypted_blob_sha256, protection_scope, created_at ON i10_credential_refs BEGIN SELECT RAISE(ABORT, 'I10_CREDENTIAL_REF_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_credential_ref_no_delete BEFORE DELETE ON i10_credential_refs BEGIN SELECT RAISE(ABORT, 'I10_CREDENTIAL_REF_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_item_immutable BEFORE UPDATE OF ingest_job_id, ordinal, draft_json, draft_hash, confidence, missing_fields_json, created_at ON i10_ingest_items BEGIN SELECT RAISE(ABORT, 'I10_INGEST_ITEM_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_revision_immutable BEFORE UPDATE ON i10_ingest_item_revisions BEGIN SELECT RAISE(ABORT, 'I10_INGEST_REVISION_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_revision_no_delete BEFORE DELETE ON i10_ingest_item_revisions BEGIN SELECT RAISE(ABORT, 'I10_INGEST_REVISION_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_video_frame_immutable BEFORE UPDATE ON i10_video_frames BEGIN SELECT RAISE(ABORT, 'I10_VIDEO_FRAME_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_video_frame_no_delete BEFORE DELETE ON i10_video_frames BEGIN SELECT RAISE(ABORT, 'I10_VIDEO_FRAME_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_action_trace_no_delete BEFORE DELETE ON i10_action_traces BEGIN SELECT RAISE(ABORT, 'I10_ACTION_TRACE_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_policy_immutable BEFORE UPDATE ON i10_stability_policy_bindings BEGIN SELECT RAISE(ABORT, 'I10_STABILITY_POLICY_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_policy_no_delete BEFORE DELETE ON i10_stability_policy_bindings BEGIN SELECT RAISE(ABORT, 'I10_STABILITY_POLICY_IMMUTABLE'); END;
