-- §34ح — real check-out tracking for attendance.
-- attendance_logs recorded arrival only; "who is inside right now" was
-- computable by nobody. Adds an explicit exit timestamp plus an index that
-- keeps the open-session lookup cheap. Sessions left open longer than the
-- house limit (60 minutes) are stamped automatically at read time by
-- closeStaleSessions() — this migration only owns the schema.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS check_out_time timestamp with time zone;

-- Open sessions per gym, newest first: the "متواجدين الآن" count and the
-- today-list checkout buttons both scan exactly this slice.
CREATE INDEX IF NOT EXISTS idx_attendance_open_sessions
  ON attendance_logs (gym_id, check_in_time DESC)
  WHERE check_out_time IS NULL;
