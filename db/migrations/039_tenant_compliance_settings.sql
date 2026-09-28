-- 039_tenant_compliance_settings.sql
-- Compliance / GDPR settings per organization (Administration > Organisation >
-- Conformité), read by TenantSettingsService.
--   audit_log_retention_days -- activity log kept this many days, older rows purged
--                               daily (ComplianceService); 0 = kept forever (as so far)
--   anonymize_deleted_users  -- deleting an account also erases its personal data
--                               (name, email, phone, photo...) instead of only hiding it
--   privacy_policy_url       -- link shown on sign-up and in the app
--   privacy_contact_email    -- data protection contact (DPO)
--   legal_notice             -- "mentions légales", public page /legal
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'audit_log_retention_days') THEN
    ALTER TABLE tenant_settings ADD COLUMN audit_log_retention_days INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'anonymize_deleted_users') THEN
    ALTER TABLE tenant_settings ADD COLUMN anonymize_deleted_users BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'privacy_policy_url') THEN
    ALTER TABLE tenant_settings ADD COLUMN privacy_policy_url VARCHAR(500) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'privacy_contact_email') THEN
    ALTER TABLE tenant_settings ADD COLUMN privacy_contact_email VARCHAR(255) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'legal_notice') THEN
    ALTER TABLE tenant_settings ADD COLUMN legal_notice TEXT NULL;
  END IF;
  -- Anonymized accounts are recognisable (and never anonymized twice).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'anonymized_at') THEN
    ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMP NULL;
  END IF;
  CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_created ON audit_logs (tenant_id, created_at);
END $$;
