-- Migration: widens dbo.notifications with the columns backend/src/services/
-- notification.service.ts and backend/src/routes/notification.routes.ts have
-- always written/read (channel, subject, body, action_url, metadata, read_at,
-- sent_at, external_id, failed_at, error_message) — the base schema file only
-- ever defined the more normalized (template_id, payload) shape, which the
-- application code never actually used. Also adds users.phone, which
-- NotificationService.send() has always selected (for SMS/WhatsApp) but which
-- was never part of the users table. Every NotificationService.send() call
-- across the app (reminders, certificate expiry, team reports, and now
-- registration/status notifications) has been silently failing — first on the
-- `SELECT email, phone FROM users` lookup, then on the notifications INSERT —
-- against the real DB, with every caller swallowing the error. This makes it
-- actually work.
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/010_notifications_flat_columns.sql

IF COL_LENGTH('dbo.notifications', 'channel') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD channel NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'subject') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD subject NVARCHAR(500) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'body') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD body NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'action_url') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD action_url NVARCHAR(1000) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'metadata') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD metadata NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'read_at') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD read_at DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'sent_at') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD sent_at DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'external_id') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD external_id NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'failed_at') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD failed_at DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.notifications', 'error_message') IS NULL
BEGIN
  ALTER TABLE dbo.notifications ADD error_message NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH('dbo.users', 'phone') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD phone NVARCHAR(50) NULL;
END;
GO
