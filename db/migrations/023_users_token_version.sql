-- 023_users_token_version.sql
-- Bumped on password reset so the reset token can't be replayed and outstanding
-- refresh tokens issued before the reset stop renewing. Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'token_version'
  ) THEN
    ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
