-- Job-title label shown alongside a user's role -- distinct from `role`
-- (which drives permissions), this is free-text HR-style position text
-- (e.g. "Charge de clientele"). Defaults to the literal 'default' for any
-- user who hasn't had one set.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/018_user_job_title.sql

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.users') AND name = 'job_title')
BEGIN
  ALTER TABLE dbo.users ADD [job_title] NVARCHAR(150) NOT NULL DEFAULT ('default');
END;
GO
