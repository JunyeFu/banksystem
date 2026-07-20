CREATE TABLE i8_case_preparations (
  preparation_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  source_description_hash TEXT NOT NULL CHECK (length(source_description_hash) = 64),
  knowledge_snapshot_json TEXT NOT NULL CHECK (json_valid(knowledge_snapshot_json)),
  acceptance_summary_json TEXT NOT NULL CHECK (json_valid(acceptance_summary_json)),
  intent_plan_json TEXT CHECK (intent_plan_json IS NULL OR json_valid(intent_plan_json)),
  intent_plan_hash TEXT CHECK (intent_plan_hash IS NULL OR length(intent_plan_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('PREPARED', 'REJECTED', 'AWAITING_STAGE3')),
  confirmation_ref TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id, case_version) REFERENCES case_versions(case_id, version),
  UNIQUE (namespace, case_id, case_version)
) STRICT;

CREATE INDEX idx_i8_case_preparations_namespace_status
ON i8_case_preparations(namespace, status, updated_at DESC);

CREATE TRIGGER i8_case_preparations_protected_fields
BEFORE UPDATE ON i8_case_preparations
WHEN OLD.namespace IS NOT NEW.namespace
  OR OLD.case_id IS NOT NEW.case_id
  OR OLD.case_version IS NOT NEW.case_version
  OR OLD.source_description_hash IS NOT NEW.source_description_hash
  OR OLD.knowledge_snapshot_json IS NOT NEW.knowledge_snapshot_json
  OR OLD.acceptance_summary_json IS NOT NEW.acceptance_summary_json
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'I8_PREPARATION_SOURCE_IMMUTABLE');
END;
CREATE TRIGGER i8_case_preparations_no_delete
BEFORE DELETE ON i8_case_preparations
BEGIN
  SELECT RAISE(ABORT, 'I8_PREPARATION_IMMUTABLE');
END;
