ALTER TABLE action_plan_items
ADD COLUMN context_level TEXT NOT NULL DEFAULT 'CTX-L1'
CHECK (context_level IN ('CTX-L1', 'CTX-L2', 'CTX-L3'));

ALTER TABLE action_plan_items
ADD COLUMN context_upgrade_reason_code TEXT;

ALTER TABLE action_execution_slots
ADD COLUMN context_level TEXT NOT NULL DEFAULT 'CTX-L1'
CHECK (context_level IN ('CTX-L1', 'CTX-L2', 'CTX-L3'));

ALTER TABLE action_execution_slots
ADD COLUMN context_envelope_hash TEXT
CHECK (context_envelope_hash IS NULL OR (length(context_envelope_hash) = 64 AND context_envelope_hash NOT GLOB '*[^0-9a-f]*'));

CREATE TABLE context_budget_audits (
  audit_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL REFERENCES action_plans(plan_id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE RESTRICT,
  action_id TEXT NOT NULL REFERENCES action_plan_items(action_id) ON DELETE RESTRICT,
  slot_id TEXT NOT NULL UNIQUE REFERENCES action_execution_slots(slot_id) ON DELETE RESTRICT,
  consumer_type TEXT NOT NULL CHECK (consumer_type IN ('VISION_LLM', 'CONTROLLER_LLM')),
  context_level TEXT NOT NULL CHECK (context_level IN ('CTX-L1', 'CTX-L2', 'CTX-L3')),
  model_context_limit_tokens INTEGER NOT NULL CHECK (model_context_limit_tokens > 0),
  input_budget_tokens INTEGER NOT NULL CHECK (input_budget_tokens > 0),
  reserved_output_tokens INTEGER NOT NULL CHECK (reserved_output_tokens > 0),
  estimated_input_tokens INTEGER NOT NULL CHECK (estimated_input_tokens >= 0),
  image_token_estimate INTEGER NOT NULL CHECK (image_token_estimate >= 0),
  tokenizer_id TEXT NOT NULL,
  budget_decision TEXT NOT NULL CHECK (budget_decision IN ('ALLOW', 'REDUCE', 'SPLIT', 'PLAYWRIGHT_ONLY', 'WAITING_USER')),
  redaction_profile_id TEXT NOT NULL,
  context_envelope_hash TEXT NOT NULL CHECK (length(context_envelope_hash) = 64 AND context_envelope_hash NOT GLOB '*[^0-9a-f]*'),
  upgrade_reason_code TEXT,
  usage_status TEXT CHECK (usage_status IS NULL OR usage_status IN ('PROVIDER_REPORTED', 'NOT_EXPOSED', 'NOT_INVOKED')),
  provider_ref TEXT,
  model_ref TEXT,
  actual_input_tokens INTEGER CHECK (actual_input_tokens IS NULL OR actual_input_tokens >= 0),
  actual_output_tokens INTEGER CHECK (actual_output_tokens IS NULL OR actual_output_tokens >= 0),
  actual_total_tokens INTEGER CHECK (actual_total_tokens IS NULL OR actual_total_tokens >= 0),
  created_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE INDEX idx_context_budget_audits_plan
ON context_budget_audits(plan_id, action_id, created_at);

CREATE TRIGGER context_budget_audits_no_update_after_complete
BEFORE UPDATE ON context_budget_audits
WHEN OLD.completed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'CONTEXT_BUDGET_AUDIT_IMMUTABLE');
END;
CREATE TRIGGER context_budget_audits_no_delete
BEFORE DELETE ON context_budget_audits
BEGIN
  SELECT RAISE(ABORT, 'CONTEXT_BUDGET_AUDIT_IMMUTABLE');
END;
