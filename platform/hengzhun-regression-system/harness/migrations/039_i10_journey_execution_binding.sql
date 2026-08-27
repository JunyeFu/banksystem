ALTER TABLE runs ADD COLUMN journey_id TEXT REFERENCES i10_interaction_journeys(journey_id) ON DELETE RESTRICT;
ALTER TABLE runs ADD COLUMN confirmed_decision_event_id TEXT REFERENCES i10_interaction_events(event_id) ON DELETE RESTRICT;
ALTER TABLE runs ADD COLUMN preparation_id TEXT REFERENCES i8_case_preparations(preparation_id) ON DELETE RESTRICT;
ALTER TABLE runs ADD COLUMN candidate_id TEXT;

ALTER TABLE schedules ADD COLUMN journey_id TEXT REFERENCES i10_interaction_journeys(journey_id) ON DELETE RESTRICT;
ALTER TABLE schedules ADD COLUMN confirmed_decision_event_id TEXT REFERENCES i10_interaction_events(event_id) ON DELETE RESTRICT;
ALTER TABLE schedules ADD COLUMN preparation_id TEXT REFERENCES i8_case_preparations(preparation_id) ON DELETE RESTRICT;
ALTER TABLE schedules ADD COLUMN candidate_id TEXT;

CREATE UNIQUE INDEX idx_i10_on_demand_run_decision
  ON runs(confirmed_decision_event_id)
  WHERE confirmed_decision_event_id IS NOT NULL AND origin_schedule_id IS NULL;

CREATE INDEX idx_i10_runs_journey_decision
  ON runs(namespace,journey_id,confirmed_decision_event_id);

CREATE UNIQUE INDEX idx_i10_schedule_decision
  ON schedules(confirmed_decision_event_id)
  WHERE confirmed_decision_event_id IS NOT NULL;

CREATE INDEX idx_i10_schedules_journey_decision
  ON schedules(namespace,journey_id,confirmed_decision_event_id);

CREATE TRIGGER trg_i10_run_execution_binding_required
BEFORE INSERT ON runs
WHEN (NEW.journey_id IS NULL AND (
        NEW.confirmed_decision_event_id IS NOT NULL OR NEW.preparation_id IS NOT NULL OR NEW.candidate_id IS NOT NULL
      ))
  OR (NEW.journey_id IS NOT NULL AND (
        NEW.confirmed_decision_event_id IS NULL OR NEW.preparation_id IS NULL OR NEW.candidate_id IS NULL
      ))
BEGIN
  SELECT RAISE(ABORT,'I10_RUN_EXECUTION_BINDING_INCOMPLETE');
END;

CREATE TRIGGER trg_i10_run_execution_binding_valid
BEFORE INSERT ON runs
WHEN NEW.journey_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM i10_interaction_journeys journey
  JOIN i10_interaction_events event
    ON event.journey_id=journey.journey_id
   AND event.event_id=NEW.confirmed_decision_event_id
   AND event.event_type='DECISION'
  JOIN i8_case_preparations preparation
    ON preparation.preparation_id=NEW.preparation_id
   AND preparation.namespace=NEW.namespace
   AND preparation.case_id=NEW.case_id
   AND preparation.case_version=NEW.case_version
  JOIN i8_executable_plans executable_plan
    ON executable_plan.preparation_id=preparation.preparation_id
   AND executable_plan.namespace=NEW.namespace
   AND executable_plan.case_id=NEW.case_id
   AND executable_plan.case_version=NEW.case_version
  JOIN plans plan
    ON plan.plan_id=NEW.plan_id
   AND plan.namespace=NEW.namespace
   AND plan.case_id=NEW.case_id
   AND plan.case_version=NEW.case_version
  LEFT JOIN i8_script_candidates candidate
    ON candidate.candidate_id=NEW.candidate_id
   AND candidate.namespace=NEW.namespace
   AND candidate.executable_plan_id=executable_plan.executable_plan_id
  LEFT JOIN i8_script_delivery_decisions delivery
    ON delivery.candidate_id=candidate.candidate_id
   AND delivery.namespace=NEW.namespace
   AND delivery.choice='ACTIVATE'
   AND delivery.activated_plan_id=NEW.plan_id
  LEFT JOIN i8_script_patch_proposals repair
    ON repair.repair_candidate_id=NEW.candidate_id
   AND repair.namespace=NEW.namespace
  LEFT JOIN i8_script_candidates base_candidate
    ON base_candidate.candidate_id=repair.base_candidate_id
   AND base_candidate.executable_plan_id=executable_plan.executable_plan_id
  LEFT JOIN i8_repair_decisions repair_decision
    ON repair_decision.proposal_id=repair.proposal_id
   AND repair_decision.namespace=NEW.namespace
   AND repair_decision.choice='ACTIVATE'
   AND repair_decision.activated_plan_id=NEW.plan_id
  WHERE journey.journey_id=NEW.journey_id
    AND journey.namespace=NEW.namespace
    AND (delivery.decision_id IS NOT NULL OR (
      base_candidate.candidate_id IS NOT NULL AND repair_decision.decision_id IS NOT NULL
    ))
    AND json_extract(event.safe_payload_json,'$.executionBinding.namespace')=NEW.namespace
    AND json_extract(event.safe_payload_json,'$.executionBinding.journeyId')=NEW.journey_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.preparationId')=NEW.preparation_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.caseId')=NEW.case_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.planId')=NEW.plan_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.candidateId')=NEW.candidate_id
    AND (NEW.origin_schedule_id IS NOT NULL OR (
      json_extract(journey.references_json,'$.confirmedDecisionEventId')=NEW.confirmed_decision_event_id
      AND json_extract(journey.references_json,'$.preparationId')=NEW.preparation_id
      AND json_extract(journey.references_json,'$.caseId')=NEW.case_id
      AND json_extract(journey.references_json,'$.planId')=NEW.plan_id
      AND json_extract(journey.references_json,'$.candidateId')=NEW.candidate_id
    ))
    AND (
      (NEW.origin_schedule_id IS NULL AND event.decision='RUN_ON_DEMAND')
      OR (
        NEW.origin_schedule_id IS NOT NULL
        AND event.decision IN ('CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE')
        AND EXISTS (
          SELECT 1 FROM schedules origin
          WHERE origin.schedule_id=NEW.origin_schedule_id
            AND origin.namespace=NEW.namespace
            AND origin.journey_id=NEW.journey_id
            AND origin.confirmed_decision_event_id=NEW.confirmed_decision_event_id
            AND origin.preparation_id=NEW.preparation_id
            AND origin.case_id=NEW.case_id
            AND origin.plan_id=NEW.plan_id
            AND origin.candidate_id=NEW.candidate_id
        )
      )
    )
)
BEGIN
  SELECT RAISE(ABORT,'I10_RUN_EXECUTION_BINDING_INVALID');
END;

CREATE TRIGGER trg_i10_schedule_execution_binding_required
BEFORE INSERT ON schedules
WHEN (NEW.journey_id IS NULL AND (
        NEW.confirmed_decision_event_id IS NOT NULL OR NEW.preparation_id IS NOT NULL OR NEW.candidate_id IS NOT NULL
      ))
  OR (NEW.journey_id IS NOT NULL AND (
        NEW.confirmed_decision_event_id IS NULL OR NEW.preparation_id IS NULL OR NEW.candidate_id IS NULL
      ))
BEGIN
  SELECT RAISE(ABORT,'I10_SCHEDULE_EXECUTION_BINDING_INCOMPLETE');
END;

CREATE TRIGGER trg_i10_schedule_execution_binding_valid
BEFORE INSERT ON schedules
WHEN NEW.journey_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM i10_interaction_journeys journey
  JOIN i10_interaction_events event
    ON event.journey_id=journey.journey_id
   AND event.event_id=NEW.confirmed_decision_event_id
   AND event.event_type='DECISION'
  JOIN i8_case_preparations preparation
    ON preparation.preparation_id=NEW.preparation_id
   AND preparation.namespace=NEW.namespace
   AND preparation.case_id=NEW.case_id
   AND preparation.case_version=NEW.case_version
  JOIN i8_executable_plans executable_plan
    ON executable_plan.preparation_id=preparation.preparation_id
   AND executable_plan.namespace=NEW.namespace
   AND executable_plan.case_id=NEW.case_id
   AND executable_plan.case_version=NEW.case_version
  JOIN plans plan
    ON plan.plan_id=NEW.plan_id
   AND plan.namespace=NEW.namespace
   AND plan.case_id=NEW.case_id
   AND plan.case_version=NEW.case_version
  LEFT JOIN i8_script_candidates candidate
    ON candidate.candidate_id=NEW.candidate_id
   AND candidate.namespace=NEW.namespace
   AND candidate.executable_plan_id=executable_plan.executable_plan_id
  LEFT JOIN i8_script_delivery_decisions delivery
    ON delivery.candidate_id=candidate.candidate_id
   AND delivery.namespace=NEW.namespace
   AND delivery.choice='ACTIVATE'
   AND delivery.activated_plan_id=NEW.plan_id
  LEFT JOIN i8_script_patch_proposals repair
    ON repair.repair_candidate_id=NEW.candidate_id
   AND repair.namespace=NEW.namespace
  LEFT JOIN i8_script_candidates base_candidate
    ON base_candidate.candidate_id=repair.base_candidate_id
   AND base_candidate.executable_plan_id=executable_plan.executable_plan_id
  LEFT JOIN i8_repair_decisions repair_decision
    ON repair_decision.proposal_id=repair.proposal_id
   AND repair_decision.namespace=NEW.namespace
   AND repair_decision.choice='ACTIVATE'
   AND repair_decision.activated_plan_id=NEW.plan_id
  WHERE journey.journey_id=NEW.journey_id
    AND journey.namespace=NEW.namespace
    AND (delivery.decision_id IS NOT NULL OR (
      base_candidate.candidate_id IS NOT NULL AND repair_decision.decision_id IS NOT NULL
    ))
    AND event.decision IN ('CREATE_ONE_TIME_SCHEDULE','CREATE_RECURRING_SCHEDULE')
    AND json_extract(event.safe_payload_json,'$.executionBinding.namespace')=NEW.namespace
    AND json_extract(event.safe_payload_json,'$.executionBinding.journeyId')=NEW.journey_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.preparationId')=NEW.preparation_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.caseId')=NEW.case_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.planId')=NEW.plan_id
    AND json_extract(event.safe_payload_json,'$.executionBinding.candidateId')=NEW.candidate_id
    AND json_extract(journey.references_json,'$.confirmedDecisionEventId')=NEW.confirmed_decision_event_id
    AND json_extract(journey.references_json,'$.preparationId')=NEW.preparation_id
    AND json_extract(journey.references_json,'$.caseId')=NEW.case_id
    AND json_extract(journey.references_json,'$.planId')=NEW.plan_id
    AND json_extract(journey.references_json,'$.candidateId')=NEW.candidate_id
)
BEGIN
  SELECT RAISE(ABORT,'I10_SCHEDULE_EXECUTION_BINDING_INVALID');
END;

CREATE TRIGGER trg_i10_run_execution_binding_immutable
BEFORE UPDATE OF namespace,case_id,case_version,plan_id,task_id,origin_schedule_id,
  journey_id,confirmed_decision_event_id,preparation_id,candidate_id ON runs
WHEN OLD.journey_id IS NOT NULL OR NEW.journey_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'I10_RUN_EXECUTION_BINDING_IMMUTABLE');
END;

CREATE TRIGGER trg_i10_schedule_execution_binding_immutable
BEFORE UPDATE OF namespace,case_id,case_version,plan_id,schedule_type,script_id,script_version,script_sha256,
  journey_id,confirmed_decision_event_id,preparation_id,candidate_id ON schedules
WHEN OLD.journey_id IS NOT NULL OR NEW.journey_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'I10_SCHEDULE_EXECUTION_BINDING_IMMUTABLE');
END;
