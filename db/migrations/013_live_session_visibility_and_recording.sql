-- Live session enhancements: public/private visibility (with an explicit
-- invitee list for the private case), and recording support (per-tenant
-- S3-compatible storage config + extra tracking columns on live_recordings
-- for the LiveKit Egress lifecycle: egress_id/status/started_at/ended_at/
-- recording_url).
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/013_live_session_visibility_and_recording.sql

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_sessions') AND name = 'visibility')
BEGIN
  ALTER TABLE dbo.live_sessions ADD [visibility] NVARCHAR(20) NOT NULL DEFAULT ('public')
    CHECK (([visibility]='public' OR [visibility]='private'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_recordings') AND name = 'egress_id')
BEGIN
  ALTER TABLE dbo.live_recordings ADD [egress_id] NVARCHAR(255) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_recordings') AND name = 'status')
BEGIN
  ALTER TABLE dbo.live_recordings ADD [status] NVARCHAR(20) NOT NULL DEFAULT ('recording')
    CHECK (([status]='recording' OR [status]='completed' OR [status]='failed'));
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_recordings') AND name = 'started_at')
BEGIN
  ALTER TABLE dbo.live_recordings ADD [started_at] DATETIME2(0) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_recordings') AND name = 'ended_at')
BEGIN
  ALTER TABLE dbo.live_recordings ADD [ended_at] DATETIME2(0) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.live_recordings') AND name = 'recording_url')
BEGIN
  ALTER TABLE dbo.live_recordings ADD [recording_url] NVARCHAR(1000) NULL;
END;
GO

IF OBJECT_ID('dbo.live_session_invitees', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.live_session_invitees (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    session_id   BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_live_session_invitees UNIQUE (session_id, user_id),
    CONSTRAINT fk_live_sess_invitees_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_live_sess_invitees_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id),
    CONSTRAINT fk_live_sess_invitees_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO

IF OBJECT_ID('dbo.recording_storage_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.recording_storage_settings (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    enabled      BIT NOT NULL DEFAULT (0),
    bucket       NVARCHAR(255) NULL,
    region       NVARCHAR(100) NULL,
    endpoint     NVARCHAR(500) NULL,
    access_key   NVARCHAR(255) NULL,
    secret_key   NVARCHAR(500) NULL,
    updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_recording_storage_settings_tenant UNIQUE (tenant_id),
    CONSTRAINT fk_recording_storage_settings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
  );
END;
GO
