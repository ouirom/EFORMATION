-- 041_tenant_external_theme.sql
-- Partner theme for external participants (role 'externe'), set in
-- Administration > Organisation > Personnalisation:
--   tenant_settings.external_accent_color  -- buttons, links, active menu item, ribbon (#RRGGBB)
--   tenant_settings.external_surface_color -- sidebar and auth panel background (#RRGGBB)
-- NULL means "use the default" (amber #D97706 / navy #0F172A).
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'external_accent_color') THEN
    ALTER TABLE tenant_settings ADD COLUMN external_accent_color VARCHAR(7) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'external_surface_color') THEN
    ALTER TABLE tenant_settings ADD COLUMN external_surface_color VARCHAR(7) NULL;
  END IF;
END $$;
