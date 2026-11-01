-- Conversation metadata is not an execution ledger. Model keys stay in DPAPI.
CREATE TABLE workbench_models (
  namespace TEXT NOT NULL REFERENCES namespaces(namespace),
  model_id TEXT NOT NULL,
  current_version INTEGER NOT NULL CHECK(current_version > 0),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  PRIMARY KEY(namespace,model_id),
  FOREIGN KEY(namespace,model_id,current_version)
    REFERENCES workbench_model_versions(namespace,model_id,version) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE UNIQUE INDEX workbench_one_default ON workbench_models(namespace) WHERE is_default=1;
CREATE TABLE workbench_model_versions (
  namespace TEXT NOT NULL,
  model_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  display_name TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT NOT NULL,
  key_ref TEXT NOT NULL,
  PRIMARY KEY(namespace,model_id,version),
  FOREIGN KEY(namespace,model_id) REFERENCES workbench_models(namespace,model_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TRIGGER workbench_model_version_immutable BEFORE UPDATE ON workbench_model_versions
BEGIN SELECT RAISE(ABORT,'WORKBENCH_MODEL_VERSION_IMMUTABLE'); END;
CREATE TRIGGER workbench_model_version_retained BEFORE DELETE ON workbench_model_versions
BEGIN SELECT RAISE(ABORT,'WORKBENCH_MODEL_VERSION_RETAINED'); END;

CREATE TABLE workbench_conversations (
  namespace TEXT NOT NULL REFERENCES namespaces(namespace),
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_turn_id TEXT,
  PRIMARY KEY(namespace,conversation_id),
  FOREIGN KEY(namespace,conversation_id,last_turn_id)
    REFERENCES workbench_turns(namespace,conversation_id,turn_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE workbench_turns (
  namespace TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  input_message_id TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  model_binding_json TEXT NOT NULL CHECK(json_valid(model_binding_json)),
  continuation_of_turn_id TEXT,
  version INTEGER NOT NULL CHECK(version > 0),
  status TEXT NOT NULL CHECK(status IN ('RUNNING','NEEDS_INPUT','COMPLETED','FAILED','STOP_REQUESTED','INTERRUPTED')),
  checkpoint_session_id TEXT,
  journey_id TEXT,
  run_id TEXT,
  task_id TEXT,
  answer TEXT,
  failure_code TEXT,
  human_intervention_required INTEGER NOT NULL CHECK(human_intervention_required IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(namespace,turn_id),
  UNIQUE(namespace,conversation_id,turn_id),
  UNIQUE(namespace,conversation_id,submission_id),
  UNIQUE(namespace,continuation_of_turn_id),
  FOREIGN KEY(namespace,conversation_id) REFERENCES workbench_conversations(namespace,conversation_id),
  FOREIGN KEY(namespace,continuation_of_turn_id) REFERENCES workbench_turns(namespace,turn_id),
  CHECK((run_id IS NULL)=(task_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX workbench_one_running_turn ON workbench_turns(namespace,conversation_id)
  WHERE status IN ('RUNNING','STOP_REQUESTED');
CREATE TRIGGER workbench_turn_binding_immutable
BEFORE UPDATE OF namespace,conversation_id,turn_id,submission_id,input_message_id,request_json,model_binding_json,continuation_of_turn_id,created_at ON workbench_turns
BEGIN SELECT RAISE(ABORT,'WORKBENCH_TURN_BINDING_IMMUTABLE'); END;
CREATE TABLE workbench_messages (
  ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(namespace,message_id),
  FOREIGN KEY(namespace,conversation_id,turn_id) REFERENCES workbench_turns(namespace,conversation_id,turn_id)
) STRICT;
CREATE INDEX workbench_message_page ON workbench_messages(namespace,conversation_id,ordinal);
CREATE TABLE workbench_events (
  namespace TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  tool_name TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(namespace,turn_id,sequence),
  FOREIGN KEY(namespace,turn_id) REFERENCES workbench_turns(namespace,turn_id)
) STRICT;
CREATE TRIGGER workbench_event_immutable BEFORE UPDATE ON workbench_events
BEGIN SELECT RAISE(ABORT,'WORKBENCH_EVENT_IMMUTABLE'); END;
CREATE TRIGGER workbench_event_retained BEFORE DELETE ON workbench_events
BEGIN SELECT RAISE(ABORT,'WORKBENCH_EVENT_RETAINED'); END;
