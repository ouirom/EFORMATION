-- 044_login_alerts.sql
-- Sign-in alerts and monitoring (Administration > Organisation > Accès & sécurité,
-- Administration > Connexions).
--   tenant_settings.new_device_alerts -- email a user when their account signs in
--                                        from a device not seen in 90 days (default on)
--   ix_audit_logs_tenant_action_created -- the "Connexions" screen filters the activity
--                                          log by tenant + sign-in actions + period
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'new_device_alerts') THEN
    ALTER TABLE tenant_settings ADD COLUMN new_device_alerts BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_action_created ON audit_logs (tenant_id, action, created_at);
