CREATE TABLE i10_interaction_journeys (
  journey_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  session_ref TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_intent TEXT NOT NULL CHECK (request_intent IN ('CASE_AUTHORING','RESULT_QUERY','SCHEDULE_DISABLE','JOURNEY_RESUME','HELP','UNSUPPORTED')),
  input_type TEXT NOT NULL CHECK (input_type IN ('NATURAL_LANGUAGE','CASE_FILE','VIDEO','NONE')),
  stage TEXT NOT NULL CHECK (stage IN (
    'COLLECTING_INPUT','NEEDS_INPUT','READY_FOR_CASE_APPROVAL','PROCESSING_INGEST',
    'PROCESSING_AUTHORING','READY_FOR_SCRIPT_ACTIVATION','READY_FOR_EXECUTION_DECISION',
    'RUNNING','AWAITING_RUNTIME_VERIFICATION','READY_FOR_REPAIR_ACTIVATION',
    'COMPLETED','FAILED_ACTIONABLE','FAILED_CLOSED','CANCELLED'
  )),
  status TEXT NOT NULL CHECK (status IN ('NEEDS_INPUT','AWAITING_USER','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  input_envelope_json TEXT NOT NULL CHECK (json_valid(input_envelope_json)),
  missing_fields_json TEXT NOT NULL CHECK (json_valid(missing_fields_json)),
  allowed_actions_json TEXT NOT NULL CHECK (json_valid(allowed_actions_json)),
  next_action_json TEXT NOT NULL CHECK (json_valid(next_action_json)),
  references_json TEXT NOT NULL CHECK (json_valid(references_json)),
  progress_json TEXT NOT NULL CHECK (json_valid(progress_json)),
  error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  recoverable INTEGER NOT NULL DEFAULT 1 CHECK (recoverable IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(namespace,idempotency_key)
) STRICT;

CREATE TABLE i10_interaction_events (
  event_id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES i10_interaction_journeys(journey_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  decision TEXT,
  safe_payload_json TEXT NOT NULL CHECK (json_valid(safe_payload_json)),
  confirmation_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(journey_id,sequence)
) STRICT;

CREATE INDEX idx_i10_journey_session ON i10_interaction_journeys(namespace,session_ref,updated_at DESC);
CREATE INDEX idx_i10_journey_status ON i10_interaction_journeys(namespace,status,updated_at DESC);
CREATE INDEX idx_i10_journey_events ON i10_interaction_events(journey_id,sequence);

CREATE TRIGGER trg_i10_interaction_event_immutable
BEFORE UPDATE ON i10_interaction_events
BEGIN SELECT RAISE(ABORT,'I10_INTERACTION_EVENT_IMMUTABLE'); END;

CREATE TRIGGER trg_i10_interaction_event_no_delete
BEFORE DELETE ON i10_interaction_events
BEGIN SELECT RAISE(ABORT,'I10_INTERACTION_EVENT_IMMUTABLE'); END;
