CREATE TABLE i8_stability_batches (
  batch_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES i8_script_candidates(candidate_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'PASSED', 'FAILED')),
  lease_owner TEXT,
  lease_expires_at TEXT,
  runtime_fingerprint TEXT CHECK (runtime_fingerprint IS NULL OR length(runtime_fingerprint) = 64),
  assertion_set_hash TEXT CHECK (assertion_set_hash IS NULL OR length(assertion_set_hash) = 64),
  evidence_set_hash TEXT CHECK (evidence_set_hash IS NULL OR length(evidence_set_hash) = 64),
  error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE TABLE i8_stability_validation_runs (
  validation_run_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES i8_stability_batches(batch_id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES i8_script_candidates(candidate_id) ON DELETE RESTRICT,
  viewport_id TEXT NOT NULL CHECK (viewport_id IN ('DESKTOP_1440X900', 'NARROW_390X844')),
  viewport_width INTEGER NOT NULL CHECK (viewport_width IN (1440, 390)),
  viewport_height INTEGER NOT NULL CHECK (viewport_height IN (900, 844)),
  sequence_no INTEGER NOT NULL CHECK (sequence_no BETWEEN 1 AND 3),
  fixture_ref TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'PASSED', 'FAILED')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  assertion_set_hash TEXT CHECK (assertion_set_hash IS NULL OR length(assertion_set_hash) = 64),
  evidence_set_hash TEXT CHECK (evidence_set_hash IS NULL OR length(evidence_set_hash) = 64),
  evidence_json TEXT CHECK (evidence_json IS NULL OR json_valid(evidence_json)),
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (batch_id, viewport_id, sequence_no),
  CHECK (
    (viewport_id = 'DESKTOP_1440X900' AND viewport_width = 1440 AND viewport_height = 900)
    OR (viewport_id = 'NARROW_390X844' AND viewport_width = 390 AND viewport_height = 844)
  )
) STRICT;

CREATE TABLE i8_stability_certificates (
  certificate_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES i8_script_candidates(candidate_id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL UNIQUE REFERENCES i8_stability_batches(batch_id) ON DELETE RESTRICT,
  script_sha256 TEXT NOT NULL CHECK (length(script_sha256) = 64),
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  executable_plan_version INTEGER NOT NULL CHECK (executable_plan_version > 0),
  runtime_fingerprint TEXT NOT NULL CHECK (length(runtime_fingerprint) = 64),
  viewport_set_json TEXT NOT NULL CHECK (json_valid(viewport_set_json)),
  validation_run_ids_json TEXT NOT NULL CHECK (json_valid(validation_run_ids_json)),
  assertion_set_hash TEXT NOT NULL CHECK (length(assertion_set_hash) = 64),
  evidence_set_hash TEXT NOT NULL CHECK (length(evidence_set_hash) = 64),
  status TEXT NOT NULL CHECK (status = 'PASSED'),
  issued_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i8_stability_batches_claim ON i8_stability_batches(status, created_at);
CREATE INDEX idx_i8_stability_runs_batch ON i8_stability_validation_runs(batch_id, viewport_id, sequence_no);

INSERT INTO i8_stability_batches(batch_id, namespace, candidate_id, status, version, created_at, updated_at)
SELECT 'stability_' || substr(candidate_id, 11), namespace, candidate_id, 'QUEUED', 1, created_at, updated_at
FROM i8_script_candidates
WHERE NOT EXISTS (SELECT 1 FROM i8_stability_batches b WHERE b.candidate_id = i8_script_candidates.candidate_id);

INSERT INTO i8_stability_validation_runs(
  validation_run_id, batch_id, candidate_id, viewport_id, viewport_width, viewport_height,
  sequence_no, fixture_ref, status, created_at
)
SELECT
  'validation_' || substr(c.candidate_id, 11) || '_' || v.suffix || '_' || s.sequence_no,
  b.batch_id,
  c.candidate_id,
  v.viewport_id,
  v.viewport_width,
  v.viewport_height,
  s.sequence_no,
  'fixture_' || substr(c.candidate_id, 11) || '_' || v.suffix || '_' || s.sequence_no,
  'QUEUED',
  c.created_at
FROM i8_script_candidates c
JOIN i8_stability_batches b ON b.candidate_id = c.candidate_id
CROSS JOIN (
  SELECT 'DESKTOP_1440X900' AS viewport_id, 1440 AS viewport_width, 900 AS viewport_height, 'desktop' AS suffix
  UNION ALL SELECT 'NARROW_390X844', 390, 844, 'narrow'
) v
CROSS JOIN (SELECT 1 AS sequence_no UNION ALL SELECT 2 UNION ALL SELECT 3) s
WHERE NOT EXISTS (
  SELECT 1 FROM i8_stability_validation_runs r
  WHERE r.batch_id = b.batch_id AND r.viewport_id = v.viewport_id AND r.sequence_no = s.sequence_no
);

CREATE TRIGGER trg_i8_stability_batch_identity_immutable
BEFORE UPDATE OF namespace, candidate_id, created_at ON i8_stability_batches
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_BATCH_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_batch_terminal_immutable
BEFORE UPDATE ON i8_stability_batches
WHEN OLD.status IN ('PASSED', 'FAILED')
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_BATCH_TERMINAL_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_run_identity_immutable
BEFORE UPDATE OF batch_id, candidate_id, viewport_id, viewport_width, viewport_height, sequence_no, fixture_ref, created_at
ON i8_stability_validation_runs
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_RUN_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_run_terminal_immutable
BEFORE UPDATE ON i8_stability_validation_runs
WHEN OLD.status IN ('PASSED', 'FAILED')
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_RUN_TERMINAL_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_certificate_immutable
BEFORE UPDATE ON i8_stability_certificates
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_CERTIFICATE_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_no_delete_batch
BEFORE DELETE ON i8_stability_batches
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_BATCH_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_no_delete_run
BEFORE DELETE ON i8_stability_validation_runs
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_RUN_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_stability_no_delete_certificate
BEFORE DELETE ON i8_stability_certificates
BEGIN
  SELECT RAISE(ABORT, 'I8_STABILITY_CERTIFICATE_IMMUTABLE');
END;
