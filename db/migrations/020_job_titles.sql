-- Managed list of job-title labels admins can assign to users (users.job_title
-- stays free-text for backward compatibility, but the UI now offers a picker
-- sourced from this table instead of a plain text box). Seeds the standard
-- French org-chart labels plus 'défaut' for unset users, and migrates any
-- existing users.job_title = 'default' (English sentinel from migration 018)
-- to the new French 'défaut' label for consistency.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/020_job_titles.sql

IF OBJECT_ID('dbo.job_titles', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.job_titles (
    id         BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id  BIGINT NOT NULL,
    label      NVARCHAR(150) NOT NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_job_titles_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT uq_job_titles_tenant_label UNIQUE (tenant_id, label)
  );
  CREATE INDEX ix_job_titles_tenant ON dbo.job_titles (tenant_id);
END;
GO

-- Seed the standard label set for every existing tenant.
INSERT INTO dbo.job_titles (tenant_id, label)
SELECT t.id, v.label
FROM dbo.tenants t
CROSS JOIN (VALUES
  ('PDG'), ('Directeur'), ('Sous-directeur'), ('Chef de service'),
  ('Responsable'), ('Manager'), ('Sinon manager'), ('Assistant'),
  ('Agent'), ('Défaut')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.job_titles jt WHERE jt.tenant_id = t.id AND jt.label = v.label
);
GO

UPDATE dbo.users SET job_title = 'Défaut' WHERE job_title = 'default';
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id WHERE c.object_id = OBJECT_ID('dbo.users') AND c.name = 'job_title' AND dc.name = 'df_users_job_title')
BEGIN
  DECLARE @existingDefault NVARCHAR(128);
  SELECT @existingDefault = dc.name FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id WHERE c.object_id = OBJECT_ID('dbo.users') AND c.name = 'job_title';
  IF @existingDefault IS NOT NULL
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT ' + @existingDefault);
  EXEC('ALTER TABLE dbo.users ADD CONSTRAINT df_users_job_title DEFAULT (''Défaut'') FOR job_title');
END;
GO
