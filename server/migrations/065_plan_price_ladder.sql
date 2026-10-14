-- =====================================================================
-- 065: توحيد سلّم أسعار الباقات (قرار المستخدم 2026-10-14)
-- Starter هو المدخل بسعر سنوي 5,500، والسلّم متدرّج منه،
-- والسنوي = 10× الشهري (شهرين مجانًا).
-- لا يُمس أي حد/ميزة (max_* / has_*) — الأسعار فقط.
-- =====================================================================

BEGIN;

UPDATE billing_plans SET price_monthly = 550.00,  price_yearly = 5500.00  WHERE name = 'Starter';
UPDATE billing_plans SET price_monthly = 900.00,  price_yearly = 9000.00  WHERE name = 'Growth';
UPDATE billing_plans SET price_monthly = 1400.00, price_yearly = 14000.00 WHERE name = 'Pro';
UPDATE billing_plans SET price_monthly = 2500.00, price_yearly = 25000.00 WHERE name = 'Enterprise';

COMMIT;
