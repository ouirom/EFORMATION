-- 045_single_session.sql
-- One active session per user (Administration > Organisation > Sécurité).
--   tenant_settings.single_session_per_user -- a new login revokes the user's other
--                                              sessions ("the most recent login wins");
--                                              default on
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'single_session_per_user') THEN
    ALTER TABLE tenant_settings ADD COLUMN single_session_per_user BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
