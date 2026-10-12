-- 046_tenant_sidebar_color.sql
-- Custom side menu (sidebar) color for the staff interface, set in
-- Administration > Organisation > Personnalisation:
--   tenant_settings.sidebar_color -- sidebar background (#RRGGBB)
-- NULL means "use the default look" (follows the light/dark theme). External
-- participants (role 'externe') keep their own partner theme (041).
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'sidebar_color') THEN
    ALTER TABLE tenant_settings ADD COLUMN sidebar_color VARCHAR(7) NULL;
  END IF;
END $$;
