ALTER TABLE plans ADD COLUMN script_id TEXT REFERENCES scripts(script_id) ON DELETE RESTRICT;
ALTER TABLE plans ADD COLUMN full_action_plan_json TEXT CHECK (full_action_plan_json IS NULL OR json_valid(full_action_plan_json));

CREATE TABLE action_plans (
  plan_id TEXT PRIMARY KEY REFERENCES plans(plan_id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(task_id) ON DELETE RESTRICT,
  script_id TEXT NOT NULL REFERENCES scripts(script_id) ON DELETE RESTRICT,
  cursor_ordinal INTEGER NOT NULL DEFAULT 1 CHECK (cursor_ordinal > 0),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING_USER', 'COMPLETED', 'FAILED')),
  previous_action_summary_json TEXT CHECK (previous_action_summary_json IS NULL OR json_valid(previous_action_summary_json)),
  last_observation_json TEXT CHECK (last_observation_json IS NULL OR json_valid(last_observation_json)),
  current_page_state_json TEXT CHECK (current_page_state_json IS NULL OR json_valid(current_page_state_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE action_plan_items (
  action_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES action_plans(plan_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  action_type TEXT NOT NULL CHECK (action_type IN ('LOCATE', 'INPUT', 'TAP', 'SCROLL')),
  prompt TEXT NOT NULL,
  value_ref TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'VERIFIED_PASSED', 'FAILED', 'AMBIGUOUS')),
  verification_json TEXT CHECK (verification_json IS NULL OR json_valid(verification_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (plan_id, ordinal)
) STRICT;

CREATE TABLE action_execution_slots (
  slot_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES action_plans(plan_id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE RESTRICT,
  action_id TEXT NOT NULL REFERENCES action_plan_items(action_id) ON DELETE RESTRICT,
  lease_owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'FAILED', 'EXPIRED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_action_execution_one_active
ON action_execution_slots(plan_id)
WHERE status = 'ACTIVE';

CREATE INDEX idx_action_plans_queue ON action_plans(status, created_at);
CREATE INDEX idx_action_items_cursor ON action_plan_items(plan_id, ordinal);

CREATE TABLE midscene_action_capabilities (
  action_type TEXT PRIMARY KEY CHECK (action_type IN ('LOCATE', 'INPUT', 'TAP', 'SCROLL')),
  status TEXT NOT NULL CHECK (status IN ('UNVERIFIED', 'VERIFIED', 'DEGRADED')),
  viewport_count INTEGER NOT NULL DEFAULT 0 CHECK (viewport_count >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  false_success_count INTEGER NOT NULL DEFAULT 0 CHECK (false_success_count >= 0),
  verification_ref TEXT,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO midscene_action_capabilities(action_type, status, updated_at)
VALUES
  ('LOCATE', 'UNVERIFIED', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('INPUT', 'UNVERIFIED', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('TAP', 'UNVERIFIED', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('SCROLL', 'UNVERIFIED', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
