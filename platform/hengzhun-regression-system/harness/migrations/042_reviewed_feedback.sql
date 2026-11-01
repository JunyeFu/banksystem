CREATE TABLE reviewed_feedback (
  feedback_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES namespaces(namespace) ON DELETE RESTRICT,
  incident_id TEXT NOT NULL REFERENCES failure_incidents(incident_id) ON DELETE RESTRICT,
  source_run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE RESTRICT,
  release_identity_hash TEXT NOT NULL CHECK (length(release_identity_hash)=64),
  confirmation_ref TEXT NOT NULL,
  adapter_binding_json TEXT NOT NULL CHECK (json_valid(adapter_binding_json)),
  dsl_version TEXT NOT NULL,
  fixture_profile TEXT NOT NULL,
  correction_json TEXT NOT NULL CHECK (json_valid(correction_json)),
  status TEXT NOT NULL CHECK (status IN ('PENDING_VERIFICATION','VERIFIED')),
  verification_journey_id TEXT REFERENCES i10_interaction_journeys(journey_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(namespace,confirmation_ref),
  CHECK ((status='PENDING_VERIFICATION' AND verification_journey_id IS NULL)
    OR (status='VERIFIED' AND verification_journey_id IS NOT NULL))
) STRICT;

CREATE TRIGGER trg_reviewed_feedback_source_immutable
BEFORE UPDATE OF namespace,incident_id,source_run_id,release_identity_hash,confirmation_ref,
adapter_binding_json,dsl_version,fixture_profile,correction_json,created_at ON reviewed_feedback
BEGIN SELECT RAISE(ABORT,'FEEDBACK_SOURCE_IMMUTABLE'); END;
