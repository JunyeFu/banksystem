CREATE TABLE IF NOT EXISTS i10_target_profiles (
  target_profile_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  launch_url TEXT NOT NULL,
  launch_origin TEXT NOT NULL,
  allowed_navigation_origins_json TEXT NOT NULL,
  allowed_interaction_origins_json TEXT NOT NULL,
  credential_origins_json TEXT NOT NULL,
  redirect_rules_json TEXT NOT NULL,
  credential_ref TEXT,
  tls_policy TEXT NOT NULL CHECK(tls_policy IN ('STRICT','ALLOW_SELF_SIGNED')),
  network_mode TEXT NOT NULL CHECK(network_mode IN ('LOCAL','INTRANET','PUBLIC')),
  status TEXT NOT NULL CHECK(status IN ('PENDING_CONFIRMATION','ACTIVE','REJECTED','DISABLED')),
  profile_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(namespace,idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_i10_target_profiles_lookup
  ON i10_target_profiles(namespace,launch_origin,status,updated_at);

ALTER TABLE i10_credential_refs ADD COLUMN target_profile_id TEXT;

CREATE INDEX IF NOT EXISTS idx_i10_credential_refs_target_profile
  ON i10_credential_refs(namespace,target_profile_id);
