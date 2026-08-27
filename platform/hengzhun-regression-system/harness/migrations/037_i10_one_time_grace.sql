ALTER TABLE schedules ADD COLUMN misfire_semantics TEXT NOT NULL DEFAULT 'RUN_ONCE'
  CHECK (misfire_semantics IN ('SKIP', 'RUN_ONCE', 'RUN_ONCE_WITHIN_GRACE'));
ALTER TABLE schedules ADD COLUMN deadline_at TEXT;
ALTER TABLE schedules ADD COLUMN deferred_state TEXT
  CHECK (deferred_state IS NULL OR deferred_state = 'WAITING_MUTEX');
ALTER TABLE schedules ADD COLUMN deferred_reason_code TEXT;
ALTER TABLE schedules ADD COLUMN deferred_at TEXT;

UPDATE schedules
SET misfire_semantics = CASE
      WHEN schedule_type = 'ONE_TIME' AND misfire_policy = 'RUN_ONCE' THEN 'RUN_ONCE_WITHIN_GRACE'
      ELSE misfire_policy
    END,
    deadline_at = CASE
      WHEN schedule_type = 'ONE_TIME' AND run_at IS NOT NULL
        THEN strftime('%Y-%m-%dT%H:%M:%fZ', run_at, '+' || misfire_grace_seconds || ' seconds')
      ELSE NULL
    END;

CREATE INDEX idx_schedules_one_time_deadline
ON schedules(status, deadline_at)
WHERE schedule_type = 'ONE_TIME' AND status = 'ACTIVE';
