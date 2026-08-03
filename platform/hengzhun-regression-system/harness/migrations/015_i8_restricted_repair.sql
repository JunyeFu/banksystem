CREATE TABLE i8_failure_incidents (
  incident_id TEXT PRIMARY KEY REFERENCES failure_incidents(incident_id) ON DELETE RESTRICT,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  classification TEXT NOT NULL CHECK (classification IN (
    'ENVIRONMENT', 'AUTHENTICATION', 'CONTRACT', 'LOCATOR', 'ASSERTION', 'MODEL', 'TOOL',
    'FIXTURE_DATA', 'PRODUCT_DEFECT', 'FLAKY_TIMING', 'SCRIPT_LOGIC'
  )),
  disposition TEXT NOT NULL CHECK (disposition IN ('REPORT_ONLY', 'RETRY_ALLOWED', 'REAUTHOR_REQUIRED', 'PATCH_ALLOWED')),
  status TEXT NOT NULL CHECK (status IN ('FAILURE_CLASSIFIED', 'PATCH_ALLOWED', 'WAITING_USER', 'RESOLVED', 'REJECTED', 'UNRESOLVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE i8_step_failure_envelopes (
  envelope_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  incident_id TEXT NOT NULL REFERENCES i8_failure_incidents(incident_id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('KNOWLEDGE_GATE', 'CASE_NORMALIZATION', 'AUTHORING_DISPATCH', 'SCRIPT_BUILD_AND_VERIFY', 'FORMAL_RUN', 'SCHEDULE', 'RESULT_DELIVERY')),
  context_level TEXT NOT NULL CHECK (context_level IN ('CTX-L1', 'CTX-L2', 'CTX-L3')),
  envelope_json TEXT NOT NULL CHECK (json_valid(envelope_json)),
  envelope_hash TEXT NOT NULL UNIQUE CHECK (length(envelope_hash) = 64),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts = 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (incident_id, context_level)
) STRICT;

CREATE TABLE i8_script_patch_proposals (
  proposal_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  incident_id TEXT NOT NULL REFERENCES i8_failure_incidents(incident_id) ON DELETE RESTRICT,
  envelope_id TEXT NOT NULL REFERENCES i8_step_failure_envelopes(envelope_id) ON DELETE RESTRICT,
  base_candidate_id TEXT NOT NULL REFERENCES i8_script_candidates(candidate_id) ON DELETE RESTRICT,
  repair_candidate_id TEXT NOT NULL UNIQUE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
  patch_json TEXT NOT NULL CHECK (json_valid(patch_json)),
  patch_hash TEXT NOT NULL CHECK (length(patch_hash) = 64),
  script_id TEXT NOT NULL,
  script_version INTEGER NOT NULL CHECK (script_version > 1),
  dsl_json TEXT NOT NULL CHECK (json_valid(dsl_json)),
  dsl_hash TEXT NOT NULL CHECK (length(dsl_hash) = 64),
  generator_version TEXT NOT NULL,
  relative_directory TEXT NOT NULL UNIQUE,
  script_sha256 TEXT NOT NULL UNIQUE CHECK (length(script_sha256) = 64),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  manifest_sha256 TEXT NOT NULL UNIQUE CHECK (length(manifest_sha256) = 64),
  source_chain_hash TEXT NOT NULL CHECK (length(source_chain_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('STABILITY_QUEUED', 'STABILITY_VALIDATING', 'VALIDATION_FAILED', 'WAITING_USER', 'ACTIVATED', 'REJECTED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (incident_id, attempt_no)
) STRICT;

CREATE TABLE i8_repair_stability_batches (
  batch_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  proposal_id TEXT NOT NULL UNIQUE REFERENCES i8_script_patch_proposals(proposal_id) ON DELETE RESTRICT,
  repair_candidate_id TEXT NOT NULL UNIQUE,
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

CREATE TABLE i8_repair_stability_runs (
  validation_run_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES i8_repair_stability_batches(batch_id) ON DELETE RESTRICT,
  repair_candidate_id TEXT NOT NULL,
  viewport_id TEXT NOT NULL CHECK (viewport_id IN ('DESKTOP_1440X900', 'NARROW_390X844')),
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
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
  CHECK ((viewport_id = 'DESKTOP_1440X900' AND viewport_width = 1440 AND viewport_height = 900)
      OR (viewport_id = 'NARROW_390X844' AND viewport_width = 390 AND viewport_height = 844))
) STRICT;

CREATE TABLE i8_repair_stability_certificates (
  certificate_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  proposal_id TEXT NOT NULL UNIQUE REFERENCES i8_script_patch_proposals(proposal_id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL UNIQUE REFERENCES i8_repair_stability_batches(batch_id) ON DELETE RESTRICT,
  repair_candidate_id TEXT NOT NULL UNIQUE,
  script_sha256 TEXT NOT NULL CHECK (length(script_sha256) = 64),
  runtime_fingerprint TEXT NOT NULL CHECK (length(runtime_fingerprint) = 64),
  validation_run_ids_json TEXT NOT NULL CHECK (json_valid(validation_run_ids_json)),
  assertion_set_hash TEXT NOT NULL CHECK (length(assertion_set_hash) = 64),
  evidence_set_hash TEXT NOT NULL CHECK (length(evidence_set_hash) = 64),
  status TEXT NOT NULL CHECK (status = 'PASSED'),
  issued_at TEXT NOT NULL
) STRICT;

CREATE TABLE i8_repair_decisions (
  decision_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  proposal_id TEXT NOT NULL REFERENCES i8_script_patch_proposals(proposal_id) ON DELETE RESTRICT,
  expected_proposal_version INTEGER NOT NULL CHECK (expected_proposal_version > 0),
  choice TEXT NOT NULL CHECK (choice IN ('ACTIVATE', 'REJECT')),
  reason TEXT NOT NULL,
  confirmation_ref TEXT NOT NULL,
  activated_plan_id TEXT REFERENCES plans(plan_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (namespace, confirmation_ref)
) STRICT;

CREATE INDEX idx_i8_failure_namespace_status ON i8_failure_incidents(namespace, status, updated_at DESC);
CREATE INDEX idx_i8_patch_incident ON i8_script_patch_proposals(incident_id, attempt_no DESC);
CREATE INDEX idx_i8_repair_stability_claim ON i8_repair_stability_batches(status, created_at);

CREATE TRIGGER trg_i8_failure_identity_immutable BEFORE UPDATE OF incident_id, namespace, classification, disposition, created_at ON i8_failure_incidents BEGIN SELECT RAISE(ABORT, 'I8_FAILURE_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_failure_no_delete BEFORE DELETE ON i8_failure_incidents BEGIN SELECT RAISE(ABORT, 'I8_FAILURE_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_envelope_source_immutable BEFORE UPDATE OF namespace, incident_id, stage, envelope_json, envelope_hash, max_attempts, created_at ON i8_step_failure_envelopes BEGIN SELECT RAISE(ABORT, 'I8_FAILURE_ENVELOPE_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_envelope_no_delete BEFORE DELETE ON i8_step_failure_envelopes BEGIN SELECT RAISE(ABORT, 'I8_FAILURE_ENVELOPE_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_patch_source_immutable BEFORE UPDATE OF namespace, incident_id, envelope_id, base_candidate_id, repair_candidate_id, attempt_no, patch_json, patch_hash, script_id, script_version, dsl_json, dsl_hash, generator_version, relative_directory, script_sha256, manifest_json, manifest_sha256, source_chain_hash, created_at ON i8_script_patch_proposals BEGIN SELECT RAISE(ABORT, 'I8_PATCH_PROPOSAL_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_patch_no_delete BEFORE DELETE ON i8_script_patch_proposals BEGIN SELECT RAISE(ABORT, 'I8_PATCH_PROPOSAL_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_batch_terminal BEFORE UPDATE ON i8_repair_stability_batches WHEN OLD.status IN ('PASSED','FAILED') BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_STABILITY_TERMINAL_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_run_terminal BEFORE UPDATE ON i8_repair_stability_runs WHEN OLD.status IN ('PASSED','FAILED') BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_STABILITY_RUN_TERMINAL_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_certificate_immutable BEFORE UPDATE ON i8_repair_stability_certificates BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_CERTIFICATE_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_decision_immutable BEFORE UPDATE ON i8_repair_decisions BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_DECISION_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_no_delete_batch BEFORE DELETE ON i8_repair_stability_batches BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_STABILITY_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_no_delete_run BEFORE DELETE ON i8_repair_stability_runs BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_STABILITY_RUN_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_no_delete_certificate BEFORE DELETE ON i8_repair_stability_certificates BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_CERTIFICATE_IMMUTABLE'); END;
CREATE TRIGGER trg_i8_repair_no_delete_decision BEFORE DELETE ON i8_repair_decisions BEGIN SELECT RAISE(ABORT, 'I8_REPAIR_DECISION_IMMUTABLE'); END;
