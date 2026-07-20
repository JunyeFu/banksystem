CREATE TABLE i8_script_delivery_decisions (
  decision_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES i8_script_candidates(candidate_id) ON DELETE RESTRICT,
  certificate_id TEXT NOT NULL REFERENCES i8_stability_certificates(certificate_id) ON DELETE RESTRICT,
  expected_candidate_version INTEGER NOT NULL CHECK (expected_candidate_version > 0),
  choice TEXT NOT NULL CHECK (choice IN ('SAVE_ONLY', 'ACTIVATE', 'REJECT')),
  reason TEXT NOT NULL,
  confirmation_ref TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('CANDIDATE_SAVED', 'SCRIPT_VERSION_ACTIVATED', 'CANDIDATE_REJECTED')),
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  executable_plan_id TEXT NOT NULL REFERENCES i8_executable_plans(executable_plan_id) ON DELETE RESTRICT,
  executable_plan_version INTEGER NOT NULL CHECK (executable_plan_version > 0),
  activated_plan_id TEXT REFERENCES plans(plan_id) ON DELETE RESTRICT,
  script_id TEXT NOT NULL,
  script_version INTEGER NOT NULL CHECK (script_version > 0),
  script_sha256 TEXT NOT NULL CHECK (length(script_sha256) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (namespace, confirmation_ref)
) STRICT;

CREATE TABLE i8_script_download_grants (
  grant_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES i8_script_candidates(candidate_id) ON DELETE RESTRICT,
  certificate_id TEXT NOT NULL REFERENCES i8_stability_certificates(certificate_id) ON DELETE RESTRICT,
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  script_sha256 TEXT NOT NULL CHECK (length(script_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i8_delivery_decisions_candidate
  ON i8_script_delivery_decisions(candidate_id, created_at DESC);
CREATE INDEX idx_i8_download_grants_token
  ON i8_script_download_grants(token_sha256, status, expires_at);

CREATE TRIGGER trg_i8_delivery_decision_immutable
BEFORE UPDATE ON i8_script_delivery_decisions
BEGIN
  SELECT RAISE(ABORT, 'I8_DELIVERY_DECISION_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_delivery_decision_no_delete
BEFORE DELETE ON i8_script_delivery_decisions
BEGIN
  SELECT RAISE(ABORT, 'I8_DELIVERY_DECISION_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_download_grant_identity_immutable
BEFORE UPDATE OF namespace, candidate_id, certificate_id, token_sha256, script_sha256, expires_at, created_at
ON i8_script_download_grants
BEGIN
  SELECT RAISE(ABORT, 'I8_DOWNLOAD_GRANT_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_download_grant_terminal_immutable
BEFORE UPDATE ON i8_script_download_grants
WHEN OLD.status IN ('USED', 'EXPIRED')
BEGIN
  SELECT RAISE(ABORT, 'I8_DOWNLOAD_GRANT_TERMINAL_IMMUTABLE');
END;

CREATE TRIGGER trg_i8_download_grant_no_delete
BEFORE DELETE ON i8_script_download_grants
BEGIN
  SELECT RAISE(ABORT, 'I8_DOWNLOAD_GRANT_IMMUTABLE');
END;
