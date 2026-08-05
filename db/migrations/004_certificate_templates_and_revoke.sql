-- Migration: certificate templates + revocation, closing the gap between
-- AdminCertificatesPage.tsx (which already called these endpoints) and the backend.
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/004_certificate_templates_and_revoke.sql

IF OBJECT_ID('dbo.certificate_templates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.certificate_templates (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id     BIGINT NOT NULL,
    name          NVARCHAR(255) NOT NULL,
    description   NVARCHAR(MAX) NULL,
    template_html NVARCHAR(MAX) NULL,
    is_default    BIT NOT NULL DEFAULT 0,
    created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_certificate_templates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
  );
END
GO

IF COL_LENGTH('dbo.certificates', 'template_id') IS NULL
BEGIN
  ALTER TABLE dbo.certificates ADD template_id BIGINT NULL;
END
GO

IF COL_LENGTH('dbo.certificates', 'revoked_at') IS NULL
BEGIN
  ALTER TABLE dbo.certificates ADD revoked_at DATETIME2(0) NULL;
END
GO

IF COL_LENGTH('dbo.certificates', 'revoked_by') IS NULL
BEGIN
  ALTER TABLE dbo.certificates ADD revoked_by BIGINT NULL;
END
GO
