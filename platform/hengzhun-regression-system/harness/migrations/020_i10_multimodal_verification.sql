CREATE TABLE i10_image_ingest_jobs (
  image_ingest_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  primary_input_type TEXT NOT NULL CHECK (primary_input_type IN ('NATURAL_LANGUAGE','CASE_FILE','VIDEO')),
  primary_text_hash TEXT CHECK (primary_text_hash IS NULL OR length(primary_text_hash)=64),
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','WAITING_USER','CONFIRMED','FAILED')),
  image_count INTEGER NOT NULL CHECK (image_count BETWEEN 1 AND 20),
  total_size_bytes INTEGER NOT NULL CHECK (total_size_bytes BETWEEN 1 AND 104857600),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  lease_owner TEXT, lease_expires_at TEXT, error_code TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
  UNIQUE(namespace,idempotency_key)
) STRICT;

CREATE TABLE i10_supporting_images (
  image_id TEXT PRIMARY KEY,
  image_ingest_id TEXT NOT NULL REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
  flowise_file_ref TEXT NOT NULL, original_filename TEXT NOT NULL, purpose_hint TEXT,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256)=64), source_size_bytes INTEGER NOT NULL CHECK (source_size_bytes > 0),
  created_at TEXT NOT NULL, UNIQUE(image_ingest_id,ordinal)
) STRICT;

CREATE TABLE i10_image_evidence_packets (
  packet_id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL UNIQUE REFERENCES i10_supporting_images(image_id) ON DELETE RESTRICT,
  redacted_image_path TEXT NOT NULL,
  redacted_image_sha256 TEXT NOT NULL CHECK (length(redacted_image_sha256)=64),
  ocr_text_hash TEXT NOT NULL CHECK (length(ocr_text_hash)=64),
  ocr_language TEXT NOT NULL CHECK (ocr_language IN ('zh','en','zh+en','unknown')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE i10_image_ocr_blocks (
  block_id TEXT PRIMARY KEY,
  packet_id TEXT NOT NULL REFERENCES i10_image_evidence_packets(packet_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0), text_redacted TEXT NOT NULL,
  text_hash TEXT NOT NULL CHECK (length(text_hash)=64), confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL, UNIQUE(packet_id,ordinal)
) STRICT;

CREATE TABLE i10_case_fact_candidates (
  fact_id TEXT PRIMARY KEY,
  image_ingest_id TEXT NOT NULL REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  field_name TEXT NOT NULL, value_redacted TEXT NOT NULL, value_hash TEXT NOT NULL CHECK (length(value_hash)=64),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)), confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  selected INTEGER NOT NULL CHECK (selected IN (0,1)), requires_user_confirmation INTEGER NOT NULL CHECK (requires_user_confirmation IN (0,1)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE i10_verification_challenges (
  challenge_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  task_ref TEXT NOT NULL, verification_type TEXT NOT NULL CHECK (verification_type IN ('SMS_OTP','TOTP','CAPTCHA','QR_CODE','UKEY','MOBILE_CERTIFICATE','BIOMETRIC','MANUAL_APPROVAL')),
  action_ordinal INTEGER CHECK (action_ordinal IS NULL OR action_ordinal BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('DETECTED','WAITING_USER_PREPARATION','USER_READY','CHALLENGE_PRESENTED','WAITING_USER_ACTION','VERIFICATION_CONFIRMED','RESUMED','EXPIRED','CANCELLED','DEVICE_UNAVAILABLE','MIDDLEWARE_UNAVAILABLE','PERMISSION_DENIED','SESSION_LOST','VERIFICATION_FAILED','LOCKOUT_RISK')),
  detection_summary TEXT NOT NULL, user_preparation TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE i10_verification_events (
  event_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES i10_verification_challenges(challenge_id) ON DELETE RESTRICT,
  from_status TEXT, to_status TEXT NOT NULL, actor_type TEXT NOT NULL CHECK (actor_type IN ('WORKER','USER','SYSTEM')),
  confirmation_ref TEXT, note_hash TEXT, created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i10_image_claim ON i10_image_ingest_jobs(status,created_at);
CREATE INDEX idx_i10_supporting_images_job ON i10_supporting_images(image_ingest_id,ordinal);
CREATE INDEX idx_i10_verification_task ON i10_verification_challenges(namespace,task_ref,created_at DESC);
CREATE TRIGGER trg_i10_supporting_image_immutable BEFORE UPDATE ON i10_supporting_images BEGIN SELECT RAISE(ABORT,'I10_SUPPORTING_IMAGE_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_supporting_image_no_delete BEFORE DELETE ON i10_supporting_images BEGIN SELECT RAISE(ABORT,'I10_SUPPORTING_IMAGE_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_image_evidence_immutable BEFORE UPDATE ON i10_image_evidence_packets BEGIN SELECT RAISE(ABORT,'I10_IMAGE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_image_evidence_no_delete BEFORE DELETE ON i10_image_evidence_packets BEGIN SELECT RAISE(ABORT,'I10_IMAGE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_image_ocr_immutable BEFORE UPDATE ON i10_image_ocr_blocks BEGIN SELECT RAISE(ABORT,'I10_IMAGE_OCR_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_image_ocr_no_delete BEFORE DELETE ON i10_image_ocr_blocks BEGIN SELECT RAISE(ABORT,'I10_IMAGE_OCR_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_case_fact_immutable BEFORE UPDATE ON i10_case_fact_candidates BEGIN SELECT RAISE(ABORT,'I10_CASE_FACT_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_case_fact_no_delete BEFORE DELETE ON i10_case_fact_candidates BEGIN SELECT RAISE(ABORT,'I10_CASE_FACT_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_verification_event_immutable BEFORE UPDATE ON i10_verification_events BEGIN SELECT RAISE(ABORT,'I10_VERIFICATION_EVENT_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_verification_event_no_delete BEFORE DELETE ON i10_verification_events BEGIN SELECT RAISE(ABORT,'I10_VERIFICATION_EVENT_IMMUTABLE'); END;
