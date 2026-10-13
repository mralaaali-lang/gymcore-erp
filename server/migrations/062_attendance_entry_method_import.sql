-- §34ج — CSV import writes attendance rows with entry_method='import'.
-- chk_entry_method only allowed qr_code/manual_phone, so every imported row
-- died on the constraint. Widening it (not abusing manual_phone) keeps the
-- origin of each visit honest: an imported log never pretend-pretends a
-- front-desk phone entry.
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS chk_entry_method;
ALTER TABLE attendance_logs ADD CONSTRAINT chk_entry_method
  CHECK (entry_method IN ('qr_code', 'manual_phone', 'import'));
