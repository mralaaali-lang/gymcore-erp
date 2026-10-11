-- 056: members.branch_id becomes nullable.
--
-- Why: branch_id is a write-only legacy of the unshipped multi-branch
-- feature — no controller reads or filters on it (only seed scripts filled
-- it). The column being NOT NULL broke member creation for any gym created
-- via the onboarding wizard (no branches row exists on a factory-fresh
-- gym), surfacing as `null value in column "branch_id" violates not-null
-- constraint` on POST /api/members.
--
-- attendance_logs.branch_id is already nullable; no other table carries it.

ALTER TABLE members ALTER COLUMN branch_id DROP NOT NULL;
