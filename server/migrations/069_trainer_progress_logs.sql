-- ====================================================================
-- 069 — Trainer daily progress logs (§41)
-- ====================================================================
-- The frontend trainer-progress family (§Phase-5 era) called
-- /trainer/*/progress/* paths that existed on no server route, so the
-- feature was never backed by data. This table makes it real: one row
-- per trainer per day, tenant-scoped by gym_id.

BEGIN;

CREATE TABLE IF NOT EXISTS trainer_progress_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    trainer_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    client_count INTEGER NOT NULL DEFAULT 0 CHECK (client_count >= 0),
    session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
    duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trainer_progress_one_log_per_day UNIQUE (gym_id, trainer_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_trainer_progress_gym_date
    ON trainer_progress_logs(gym_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_progress_trainer
    ON trainer_progress_logs(trainer_id, log_date DESC);

COMMIT;
