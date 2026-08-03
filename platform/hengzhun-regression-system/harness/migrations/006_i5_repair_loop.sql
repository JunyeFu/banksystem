ALTER TABLE script_versions
ADD COLUMN configuration_json TEXT CHECK (configuration_json IS NULL OR json_valid(configuration_json));

ALTER TABLE script_versions
ADD COLUMN source_sha256 TEXT CHECK (source_sha256 IS NULL OR length(source_sha256) = 64);

CREATE TABLE case_import_batches (
  batch_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  source_format TEXT NOT NULL CHECK (source_format IN ('HENGZHUN_JSON_V1')),
  source_ref TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 1 AND 50),
  status TEXT NOT NULL CHECK (status IN ('IMPORTED', 'REJECTED')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE case_import_items (
  batch_id TEXT NOT NULL REFERENCES case_import_batches(batch_id) ON DELETE RESTRICT,
  item_ordinal INTEGER NOT NULL CHECK (item_ordinal > 0),
  external_case_ref TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  PRIMARY KEY (batch_id, item_ordinal),
  UNIQUE (batch_id, external_case_ref)
) STRICT;

CREATE TABLE failure_incidents (
  incident_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  script_id TEXT NOT NULL REFERENCES scripts(script_id) ON DELETE RESTRICT,
  script_version INTEGER NOT NULL CHECK (script_version > 0),
  classification TEXT NOT NULL CHECK (classification IN ('ENVIRONMENT', 'AUTHENTICATION', 'CONTRACT', 'LOCATOR', 'ASSERTION', 'MODEL', 'TOOL')),
  reason_code TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  diagnostic_status TEXT NOT NULL CHECK (diagnostic_status IN ('CLASSIFIED', 'DIAGNOSED', 'CANDIDATE_READY', 'RESOLVED', 'UNRESOLVED')),
  diagnosis_json TEXT CHECK (diagnosis_json IS NULL OR json_valid(diagnosis_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE repair_candidates (
  candidate_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  incident_id TEXT NOT NULL REFERENCES failure_incidents(incident_id) ON DELETE RESTRICT,
  script_id TEXT NOT NULL REFERENCES scripts(script_id) ON DELETE RESTRICT,
  base_script_version INTEGER NOT NULL CHECK (base_script_version > 0),
  candidate_script_version INTEGER NOT NULL CHECK (candidate_script_version > 0),
  patch_type TEXT NOT NULL CHECK (patch_type = 'LOCATOR_OVERRIDE'),
  patch_json TEXT NOT NULL CHECK (json_valid(patch_json)),
  patch_hash TEXT NOT NULL CHECK (length(patch_hash) = 64),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL CHECK (status IN ('VALIDATION_QUEUED', 'VALIDATING', 'WAITING_USER', 'ACTIVE', 'REJECTED', 'VALIDATION_FAILED')),
  validation_artifact_id TEXT REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (script_id, candidate_script_version)
) STRICT;

CREATE TABLE repair_validation_jobs (
  job_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES repair_candidates(candidate_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'PASSED', 'FAILED')),
  credential_alias TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE TABLE repair_activation_decisions (
  decision_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES repair_candidates(candidate_id) ON DELETE RESTRICT,
  expected_version INTEGER NOT NULL CHECK (expected_version > 0),
  choice TEXT NOT NULL CHECK (choice IN ('APPROVE', 'REJECT')),
  reason TEXT NOT NULL,
  confirmation_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECORDED', 'REJECTED_VERSION_CONFLICT')),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_case_import_batches_namespace ON case_import_batches(namespace, created_at DESC);
CREATE INDEX idx_failure_incidents_namespace_status ON failure_incidents(namespace, diagnostic_status, updated_at DESC);
CREATE INDEX idx_repair_candidates_incident ON repair_candidates(incident_id, created_at DESC);
CREATE INDEX idx_repair_jobs_queue ON repair_validation_jobs(status, created_at);
