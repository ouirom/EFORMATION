-- 035_tenant_security_settings.sql
-- Access & security settings per organization (Administration > Organisation),
-- read by TenantSettingsService, and the per-account state they need.
--
-- tenant_settings:
--   password_min_length          -- minimum length of a local password (8..64)
--   password_require_complexity  -- upper + lower case, digit and special character
--   password_expiry_days         -- 0 = never; otherwise a password login past that
--                                   age must choose a new password first
--   max_login_attempts           -- 0 = no lockout; otherwise wrong passwords in a row
--                                   before the account is locked
--   lockout_minutes              -- how long such a lock lasts
--   session_idle_minutes         -- automatic logout after this much inactivity
--   session_max_days             -- a login is valid at most this long, refreshes included
--   allowed_email_domains        -- comma-separated; NULL/empty = any domain. Applies
--                                   to self-registration and SSO/LDAP auto-provisioning
--   require_registration_approval -- self-registered accounts wait for an n+1 (the
--                                    behaviour so far) or are active right away
-- users:
--   password_changed_at    -- NULL = unknown (created_at is used instead)
--   failed_login_attempts  -- wrong passwords since the last successful login
--   locked_until           -- set when max_login_attempts is reached
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'password_min_length') THEN
    ALTER TABLE tenant_settings ADD COLUMN password_min_length INTEGER NOT NULL DEFAULT 8;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'password_require_complexity') THEN
    ALTER TABLE tenant_settings ADD COLUMN password_require_complexity BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'password_expiry_days') THEN
    ALTER TABLE tenant_settings ADD COLUMN password_expiry_days INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'max_login_attempts') THEN
    ALTER TABLE tenant_settings ADD COLUMN max_login_attempts INTEGER NOT NULL DEFAULT 5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'lockout_minutes') THEN
    ALTER TABLE tenant_settings ADD COLUMN lockout_minutes INTEGER NOT NULL DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'session_idle_minutes') THEN
    ALTER TABLE tenant_settings ADD COLUMN session_idle_minutes INTEGER NOT NULL DEFAULT 5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'session_max_days') THEN
    ALTER TABLE tenant_settings ADD COLUMN session_max_days INTEGER NOT NULL DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'allowed_email_domains') THEN
    ALTER TABLE tenant_settings ADD COLUMN allowed_email_domains TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'require_registration_approval') THEN
    ALTER TABLE tenant_settings ADD COLUMN require_registration_approval BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_changed_at') THEN
    ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'failed_login_attempts') THEN
    ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'locked_until') THEN
    ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL;
  END IF;
END $$;
