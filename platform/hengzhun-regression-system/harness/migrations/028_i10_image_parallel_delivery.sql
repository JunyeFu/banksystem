CREATE TABLE i10_image_analysis_deliveries (
  image_ingest_id TEXT PRIMARY KEY REFERENCES i10_image_ingest_jobs(image_ingest_id) ON DELETE RESTRICT,
  ocr_status TEXT NOT NULL CHECK (ocr_status IN ('SUCCEEDED','FAILED','TIMED_OUT')),
  ocr_engine TEXT NOT NULL,
  ocr_duration_ms INTEGER NOT NULL CHECK (ocr_duration_ms >= 0),
  ocr_error_code TEXT,
  vision_status TEXT NOT NULL CHECK (vision_status IN ('SUCCEEDED','FAILED','TIMED_OUT')),
  vision_engine TEXT NOT NULL,
  vision_duration_ms INTEGER NOT NULL CHECK (vision_duration_ms >= 0),
  vision_error_code TEXT,
  report_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  json_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  purge_status TEXT NOT NULL CHECK (purge_status IN ('PENDING_CONFIRMATION','PURGED','INCOMPLETE')),
  purge_receipt_json TEXT CHECK (purge_receipt_json IS NULL OR json_valid(purge_receipt_json)),
  purged_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER trg_i10_image_analysis_delivery_no_delete
BEFORE DELETE ON i10_image_analysis_deliveries
BEGIN
  SELECT RAISE(ABORT,'I10_IMAGE_ANALYSIS_DELIVERY_IMMUTABLE');
END;
