-- 071: staff commission rate for the employee-sales report (عمولة الموظف).
-- Default 0 = feature off (commissions report 0 until configured per staff
-- in المستخدمين → تعديل). Applied at the CURRENT rate to historical sales.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 0
  CHECK (commission_pct >= 0 AND commission_pct <= 100);
