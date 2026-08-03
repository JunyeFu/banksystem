CREATE TABLE i8_executable_plans (
  executable_plan_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  preparation_id TEXT NOT NULL UNIQUE REFERENCES i8_case_preparations(preparation_id) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  intent_plan_hash TEXT NOT NULL CHECK (length(intent_plan_hash) = 64),
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  plan_hash TEXT NOT NULL UNIQUE CHECK (length(plan_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('EXECUTABLE_PLAN_READY', 'AUTHORING', 'ACTIONS_VERIFIED', 'CANDIDATE_GENERATED', 'FAILED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id, case_version) REFERENCES case_versions(case_id, version)
) STRICT;

CREATE TABLE i8_candidate_build_jobs (
  job_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  executable_plan_id TEXT NOT NULL UNIQUE REFERENCES i8_executable_plans(executable_plan_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE TABLE i8_verified_action_records (
  record_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  executable_plan_id TEXT NOT NULL REFERENCES i8_executable_plans(executable_plan_id) ON DELETE RESTRICT,
  action_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  record_hash TEXT NOT NULL CHECK (length(record_hash) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (executable_plan_id, action_id),
  UNIQUE (executable_plan_id, ordinal)
) STRICT;

CREATE TABLE i8_script_candidates (
  candidate_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  executable_plan_id TEXT NOT NULL UNIQUE REFERENCES i8_executable_plans(executable_plan_id) ON DELETE RESTRICT,
  script_id TEXT NOT NULL,
  script_version INTEGER NOT NULL CHECK (script_version > 0),
  dsl_version TEXT NOT NULL CHECK (dsl_version = 'HENGZHUN_DSL_V1'),
  dsl_json TEXT NOT NULL CHECK (json_valid(dsl_json)),
  dsl_hash TEXT NOT NULL CHECK (length(dsl_hash) = 64),
  generator_version TEXT NOT NULL,
  relative_directory TEXT NOT NULL UNIQUE,
  script_sha256 TEXT NOT NULL UNIQUE CHECK (length(script_sha256) = 64),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  manifest_sha256 TEXT NOT NULL UNIQUE CHECK (length(manifest_sha256) = 64),
  source_chain_hash TEXT NOT NULL CHECK (length(source_chain_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('GENERATED', 'VALIDATING', 'VALIDATION_FAILED', 'STABILITY_CERTIFIED', 'WAITING_USER', 'SAVED', 'SCRIPT_VALIDATED', 'REJECTED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i8_candidate_jobs_claim
  ON i8_candidate_build_jobs(status, created_at);

CREATE TRIGGER trg_i8_executable_plan_source_immutable
BEFORE UPDATE OF preparation_id, case_id, case_version, intent_plan_hash, plan_json, plan_hash
ON i8_executable_plans
BEGIN
  SELECT RAISE(ABORT, 'I8_EXECUTABLE_PLAN_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_action_record_immutable
BEFORE UPDATE ON i8_verified_action_records
BEGIN
  SELECT RAISE(ABORT, 'I8_VERIFIED_ACTION_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_candidate_source_immutable
BEFORE UPDATE OF executable_plan_id, script_id, script_version, dsl_version, dsl_json, dsl_hash,
  generator_version, relative_directory, script_sha256, manifest_json, manifest_sha256, source_chain_hash
ON i8_script_candidates
BEGIN
  SELECT RAISE(ABORT, 'I8_SCRIPT_CANDIDATE_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_executable_plan_no_delete
BEFORE DELETE ON i8_executable_plans
BEGIN
  SELECT RAISE(ABORT, 'I8_EXECUTABLE_PLAN_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_action_record_no_delete
BEFORE DELETE ON i8_verified_action_records
BEGIN
  SELECT RAISE(ABORT, 'I8_VERIFIED_ACTION_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_candidate_no_delete
BEFORE DELETE ON i8_script_candidates
BEGIN
  SELECT RAISE(ABORT, 'I8_SCRIPT_CANDIDATE_IMMUTABLE');
END;
