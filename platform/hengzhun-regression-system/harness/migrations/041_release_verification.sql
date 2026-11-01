CREATE TABLE acceptance_reports (
  run_id TEXT PRIMARY KEY,
  release_identity_hash TEXT NOT NULL,
  report_path TEXT NOT NULL,
  report_sha256 TEXT NOT NULL,
  registered_at TEXT NOT NULL
);
CREATE INDEX acceptance_reports_identity ON acceptance_reports(release_identity_hash);
CREATE TABLE release_verifications (
  verification_id TEXT PRIMARY KEY,
  release_identity_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('GO','NO_GO')),
  passed INTEGER NOT NULL,
  required INTEGER NOT NULL,
  evidence_sha256 TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX release_verifications_identity ON release_verifications(release_identity_hash,created_at);
