-- Migration: certificate expiration + renewal reminders
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/002_certificate_expiry.sql

IF COL_LENGTH('dbo.certificates', 'validity_months') IS NULL
BEGIN
  ALTER TABLE dbo.certificates ADD validity_months INT NULL;
END
GO

IF COL_LENGTH('dbo.certificates', 'expires_at') IS NULL
BEGIN
  ALTER TABLE dbo.certificates ADD expires_at DATETIME2(0) NULL;
END
GO

IF COL_LENGTH('dbo.certificates', 'renewal_reminder_sent_at') IS NULL
BEGIN
  ALTER TABLE dbo.certificates ADD renewal_reminder_sent_at DATETIME2(0) NULL;
END
GO
