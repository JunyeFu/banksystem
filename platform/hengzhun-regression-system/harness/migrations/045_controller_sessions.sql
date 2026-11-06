CREATE TABLE controller_sessions (
  namespace TEXT NOT NULL,
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  envelope_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(namespace, session_id)
) STRICT;
