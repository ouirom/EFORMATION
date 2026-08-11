-- Per-tenant LiveKit (embedded video conferencing) credentials, mirroring the
-- existing email_settings pattern: an admin can override the global env-based
-- LIVEKIT_URL/API_KEY/API_SECRET for their own tenant. Falls back to the
-- global config when no row exists or enabled=0 -- see
-- backend/src/services/livekit.service.ts.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/012_livekit_settings.sql

IF OBJECT_ID('dbo.livekit_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.livekit_settings (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    enabled      BIT NOT NULL DEFAULT (0),
    url          NVARCHAR(500) NULL,
    api_key      NVARCHAR(255) NULL,
    api_secret   NVARCHAR(500) NULL,
    updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_livekit_settings_tenant UNIQUE (tenant_id),
    CONSTRAINT fk_livekit_settings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
  );
END;
GO
