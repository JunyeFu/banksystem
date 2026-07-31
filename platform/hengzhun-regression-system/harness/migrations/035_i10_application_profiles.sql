CREATE TABLE i10_application_profiles (
  application_profile_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  target_profile_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  profile_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING_CONFIRMATION','ACTIVE','REJECTED','DISABLED')),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(target_profile_id) REFERENCES i10_target_profiles(target_profile_id)
) STRICT;

CREATE TABLE i10_application_modules (
  application_profile_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY(application_profile_id,module_id),
  FOREIGN KEY(application_profile_id) REFERENCES i10_application_profiles(application_profile_id)
) STRICT;

CREATE TABLE i10_module_capabilities (
  application_profile_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  PRIMARY KEY(application_profile_id,module_id,capability),
  FOREIGN KEY(application_profile_id,module_id) REFERENCES i10_application_modules(application_profile_id,module_id)
) STRICT;

CREATE INDEX idx_i10_application_profiles_target
  ON i10_application_profiles(namespace,target_profile_id,status,updated_at);
