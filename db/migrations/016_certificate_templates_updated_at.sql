-- certificate_templates was missing updated_at, but PUT /certificates/templates/:id
-- always tries to stamp it on every edit -- every template update 500'd
-- ("column updated_at does not exist") since the table was first created.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/016_certificate_templates_updated_at.sql

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.certificate_templates') AND name = 'updated_at')
BEGIN
  ALTER TABLE dbo.certificate_templates ADD [updated_at] DATETIME2(0) NULL;
END;
GO
