-- 074: per-gym sports catalog (كتالوج رياضات الصالة).
-- Sports used to be a fixed code enum: manageable in no UI, so every plan
-- stayed «بدون تصنيف». Each gym now owns its rows (icon/color/order/active);
-- plan.sport و member_subscriptions.sport يشيران إلى code هنا.
-- Delete is guarded in the API (plans/subs referencing a code block it).
CREATE TABLE IF NOT EXISTS gym_sports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  code character varying(30) NOT NULL,
  name_ar character varying(100) NOT NULL,
  icon character varying(60) NOT NULL DEFAULT 'fitness_center',
  color character varying(20) NOT NULL DEFAULT '#0284c7',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (gym_id, code)
);

-- Backfill the 7 historic codes for gyms that predate the catalog.
INSERT INTO gym_sports (gym_id, code, name_ar, icon, color, sort_order, is_active)
SELECT g.id, d.code, d.name_ar, d.icon, d.color, d.sort_order, true
FROM gyms g
CROSS JOIN (VALUES
  ('gym', 'جيم', 'fitness_center', '#f97316', 1),
  ('cardio', 'كارديو', 'favorite', '#ef4444', 2),
  ('boxing', 'ملاكمة', 'sports_mma', '#8b5cf6', 3),
  ('kickboxing', 'كيك بوكسينج', 'bolt', '#eab308', 4),
  ('swimming', 'سباحة', 'pool', '#0ea5e9', 5),
  ('crossfit', 'كروس فيت', 'directions_run', '#22c55e', 6),
  ('yoga', 'يوجا', 'self_improvement', '#14b8a6', 7)
) AS d(code, name_ar, icon, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM gym_sports s WHERE s.gym_id = g.id AND s.code = d.code);
