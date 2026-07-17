CREATE TRIGGER repair_activation_decisions_no_update
BEFORE UPDATE ON repair_activation_decisions
BEGIN
  SELECT RAISE(ABORT, 'REPAIR_DECISION_IMMUTABLE');
END;

CREATE TRIGGER repair_activation_decisions_no_delete
BEFORE DELETE ON repair_activation_decisions
BEGIN
  SELECT RAISE(ABORT, 'REPAIR_DECISION_IMMUTABLE');
END;
