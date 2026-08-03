CREATE TABLE i10_artifact_download_grants (
  grant_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE RESTRICT,
  token_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','USED','EXPIRED')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_i10_artifact_download_grants_token
  ON i10_artifact_download_grants(token_sha256,status,expires_at);

CREATE TRIGGER trg_i10_artifact_download_grant_identity_immutable
BEFORE UPDATE OF namespace,artifact_id,token_sha256,expires_at,created_at
ON i10_artifact_download_grants
BEGIN
  SELECT RAISE(ABORT,'I10_ARTIFACT_DOWNLOAD_GRANT_IDENTITY_IMMUTABLE');
END;
