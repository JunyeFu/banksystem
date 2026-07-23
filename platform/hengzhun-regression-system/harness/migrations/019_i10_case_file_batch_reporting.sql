CREATE TABLE i10_ingest_field_mappings (
  ingest_job_id TEXT NOT NULL REFERENCES i10_ingest_jobs(ingest_job_id) ON DELETE RESTRICT,
  source_field TEXT NOT NULL,
  canonical_field TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('ALIAS', 'UNMAPPED')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (ingest_job_id, source_field)
) STRICT;

CREATE TABLE i10_ingest_errors (
  error_id TEXT PRIMARY KEY,
  ingest_job_id TEXT NOT NULL REFERENCES i10_ingest_jobs(ingest_job_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 1000),
  error_code TEXT NOT NULL CHECK (error_code GLOB 'I10_*'),
  field_name TEXT,
  record_hash TEXT NOT NULL CHECK (length(record_hash) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (ingest_job_id, ordinal, error_code, field_name)
) STRICT;

CREATE TABLE i10_ingest_error_resolutions (
  error_id TEXT PRIMARY KEY REFERENCES i10_ingest_errors(error_id) ON DELETE RESTRICT,
  ingest_item_id TEXT NOT NULL REFERENCES i10_ingest_items(ingest_item_id) ON DELETE RESTRICT,
  confirmation_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i10_ingest_errors_job ON i10_ingest_errors(ingest_job_id, ordinal);

CREATE TRIGGER trg_i10_ingest_mapping_immutable BEFORE UPDATE ON i10_ingest_field_mappings BEGIN SELECT RAISE(ABORT, 'I10_INGEST_MAPPING_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_mapping_no_delete BEFORE DELETE ON i10_ingest_field_mappings BEGIN SELECT RAISE(ABORT, 'I10_INGEST_MAPPING_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_error_immutable BEFORE UPDATE ON i10_ingest_errors BEGIN SELECT RAISE(ABORT, 'I10_INGEST_ERROR_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_error_no_delete BEFORE DELETE ON i10_ingest_errors BEGIN SELECT RAISE(ABORT, 'I10_INGEST_ERROR_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_error_resolution_immutable BEFORE UPDATE ON i10_ingest_error_resolutions BEGIN SELECT RAISE(ABORT, 'I10_INGEST_ERROR_RESOLUTION_IMMUTABLE'); END;
CREATE TRIGGER trg_i10_ingest_error_resolution_no_delete BEFORE DELETE ON i10_ingest_error_resolutions BEGIN SELECT RAISE(ABORT, 'I10_INGEST_ERROR_RESOLUTION_IMMUTABLE'); END;
