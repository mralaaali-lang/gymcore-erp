-- ====================================================================
-- 013 — Extended gym configuration columns for the Create Gym Wizard
--        (contact info, address, localization settings, logo)
-- ====================================================================

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS dba_name         varchar(255),
  ADD COLUMN IF NOT EXISTS phone            varchar(50),
  ADD COLUMN IF NOT EXISTS email            varchar(255),
  ADD COLUMN IF NOT EXISTS address_street   varchar(500),
  ADD COLUMN IF NOT EXISTS address_city     varchar(255),
  ADD COLUMN IF NOT EXISTS address_state    varchar(255),
  ADD COLUMN IF NOT EXISTS address_zip      varchar(20),
  ADD COLUMN IF NOT EXISTS address_country  varchar(100) DEFAULT 'Egypt',
  ADD COLUMN IF NOT EXISTS timezone         varchar(100) DEFAULT 'Africa/Cairo',
  ADD COLUMN IF NOT EXISTS date_format      varchar(20)  DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS time_format      varchar(10)  DEFAULT '12h',
  ADD COLUMN IF NOT EXISTS first_day_of_week varchar(10) DEFAULT 'Sunday',
  ADD COLUMN IF NOT EXISTS language         varchar(10)  DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS units_system     varchar(10)  DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS logo_url         varchar(500);

COMMENT ON COLUMN gyms.dba_name IS 'Doing Business As — shown on invoices instead of gym name (optional)';
COMMENT ON COLUMN gyms.logo_url IS 'URL path to uploaded gym logo image';
COMMENT ON COLUMN gyms.language IS 'Default UI language: ar or en';
COMMENT ON COLUMN gyms.units_system IS 'metric (kg/km) or imperial (lb/mi)';
