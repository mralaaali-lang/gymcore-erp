-- 057: gym_trials — the table platformBilling setTrialPeriod/listTrials always
-- queried but was never actually created (trial endpoints 500'd everywhere).
-- One trial record per gym (ON CONFLICT (gym_id) in setTrialPeriod requires
-- the UNIQUE constraint here).
CREATE TABLE IF NOT EXISTS gym_trials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES billing_plans(id) ON DELETE SET NULL,
    trial_days INTEGER NOT NULL CHECK (trial_days >= 0),
    trial_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gym_trials_end ON gym_trials(trial_end);
