-- 040_external_users.sql
-- External participants (role 'externe') sign up from their own portal
-- (/external/register) and say which company they come from:
--   users.external_company -- the participant's own organization; NULL for staff
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'external_company') THEN
    ALTER TABLE users ADD COLUMN external_company VARCHAR(200) NULL;
  END IF;
END $$;
