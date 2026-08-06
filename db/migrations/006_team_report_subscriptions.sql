-- Migration: self-service subscription for each n+1's periodic team-progress report
-- (sent by the team-report cron job to whichever manager/director/supervisor opted in).
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/006_team_report_subscriptions.sql

IF OBJECT_ID('dbo.team_report_subscriptions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_report_subscriptions (
    id             BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id      BIGINT NOT NULL,
    user_id        BIGINT NOT NULL,
    is_enabled     BIT NOT NULL DEFAULT 1,
    frequency      NVARCHAR(10) NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly')),
    weekday        TINYINT NULL, -- 0=Sunday..6=Saturday; only meaningful when frequency='weekly'
    channel_email  BIT NOT NULL DEFAULT 1,
    channel_in_app BIT NOT NULL DEFAULT 1,
    last_sent_at   DATETIME2(0) NULL,
    updated_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_team_report_sub_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_team_report_sub_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT uq_team_report_sub_user UNIQUE (tenant_id, user_id)
  );
END
GO
