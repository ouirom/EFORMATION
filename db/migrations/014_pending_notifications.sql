-- Outbox for notifications that must be confirmed by a human before the
-- underlying email actually goes out (see PendingNotificationService).
-- Two ways it gets drained: a synchronous admin/self action shows an
-- immediate confirm dialog (triggered_by = the acting user), or an
-- automatic/cron event queues a row for later review in the admin
-- "File d'attente emails" page (triggered_by = NULL).
--
-- Also adds live_sessions.reminder_sent_at, used to dedupe the new hourly
-- upcoming-session reminder job the same way certificates.renewal_reminder_sent_at
-- dedupes the existing certificate-expiry job.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/014_pending_notifications.sql

IF OBJECT_ID('dbo.pending_notifications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.pending_notifications (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    event_type   NVARCHAR(50) NOT NULL,
    channel      NVARCHAR(20) NOT NULL DEFAULT ('email'),
    subject      NVARCHAR(500) NULL,
    body         NVARCHAR(MAX) NOT NULL,
    action_url   NVARCHAR(1000) NULL,
    metadata     NVARCHAR(MAX) NULL,
    status       NVARCHAR(20) NOT NULL DEFAULT ('pending')
      CHECK ((status='pending' OR status='approved' OR status='rejected')),
    triggered_by BIGINT NULL,
    reviewed_by  BIGINT NULL,
    reviewed_at  DATETIME2(0) NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_pending_notif_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_pending_notif_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_pending_notif_triggered_by FOREIGN KEY (triggered_by) REFERENCES dbo.users(id),
    CONSTRAINT fk_pending_notif_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES dbo.users(id)
  );
  CREATE INDEX ix_pending_notif_tenant_status ON dbo.pending_notifications (tenant_id, status);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_sessions') AND name = 'reminder_sent_at')
BEGIN
  ALTER TABLE dbo.live_sessions ADD [reminder_sent_at] DATETIME2(0) NULL;
END;
GO
