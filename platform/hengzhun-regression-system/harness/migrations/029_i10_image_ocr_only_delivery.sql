CREATE TABLE i10_image_ocr_deliveries (
  image_ingest_id TEXT PRIMARY KEY REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  ocr_status TEXT NOT NULL CHECK (ocr_status IN ('SUCCEEDED','FAILED','TIMED_OUT')),
  ocr_engine TEXT NOT NULL,
  ocr_model_sha256 TEXT CHECK (ocr_model_sha256 IS NULL OR length(ocr_model_sha256) = 64),
  ocr_duration_ms INTEGER NOT NULL CHECK (ocr_duration_ms >= 0),
  ocr_processed_image_count INTEGER NOT NULL CHECK (ocr_processed_image_count >= 0),
  ocr_recognized_region_count INTEGER NOT NULL CHECK (ocr_recognized_region_count >= 0),
  ocr_error_code TEXT,
  report_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  json_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  purge_status TEXT NOT NULL CHECK (purge_status IN ('PENDING_CONFIRMATION','PURGED','INCOMPLETE','EXPIRED_PURGED')),
  purge_receipt_json TEXT CHECK (purge_receipt_json IS NULL OR json_valid(purge_receipt_json)),
  purged_at TEXT,
  preview_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE i10_image_preview_grants (
  grant_id TEXT PRIMARY KEY,
  image_ingest_id TEXT NOT NULL REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','USED','EXPIRED','PURGED')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i10_image_preview_grants_expiry
ON i10_image_preview_grants(status, expires_at);

CREATE TRIGGER trg_i10_image_ocr_delivery_no_delete
BEFORE DELETE ON i10_image_ocr_deliveries
BEGIN
  SELECT RAISE(ABORT,'I10_IMAGE_OCR_DELIVERY_IMMUTABLE');
END;
