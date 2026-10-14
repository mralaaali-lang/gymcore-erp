-- §44 — canonical expense categories, seeded for every tenant.
-- The expenses screen dropdown reads expense_categories for real
-- (listExpenseCategories); NONOGYM-style tenants were created with zero
-- rows, so the nine buckets the owner specified are inserted once each.
-- There is no unique constraint on (gym_id, name) — guard with NOT EXISTS.
-- Legacy demo synonyms are folded onto the canonical name first (only when
-- the canonical row does not already exist), so no tenant ends up with
-- both «مياه» and «ماء».

UPDATE expense_categories ec SET name = m.canon
FROM (VALUES
  ('مياه', 'ماء'),
  ('صيانة أجهزة', 'صيانة'),
  ('تسويق', 'إعلانات')
) AS m(old, canon)
WHERE ec.name = m.old
  AND NOT EXISTS (
    SELECT 1 FROM expense_categories x
    WHERE x.gym_id = ec.gym_id AND x.name = m.canon
  );

INSERT INTO expense_categories (gym_id, name)
SELECT g.id, c.name
FROM gyms g
CROSS JOIN (VALUES
  ('رواتب'), ('إيجار'), ('كهرباء'), ('ماء'), ('صيانة'),
  ('معدات'), ('نظافة'), ('إعلانات'), ('أخرى')
) AS c(name)
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories ec
  WHERE ec.gym_id = g.id AND ec.name = c.name
);
