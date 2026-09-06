-- Watermark images that can be composited onto generated certificate PDFs.
-- Reuses an already-uploaded file_assets row (via POST /files/upload,
-- folder=watermarks) rather than duplicating storage_key -- same precedent
-- as certificate_templates.background_file_id. Only one row per tenant may
-- have is_default=1 at a time (enforced app-side, same blanket
-- clear-then-set pattern as certificate_templates.is_default).
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/019_certificate_watermarks.sql

IF OBJECT_ID('dbo.certificate_watermarks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.certificate_watermarks (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    file_id      BIGINT NOT NULL,
    name         NVARCHAR(150) NULL,
    is_default   BIT NOT NULL DEFAULT (0),
    created_by   BIGINT NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_cert_watermarks_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_cert_watermarks_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id),
    CONSTRAINT fk_cert_watermarks_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );
  CREATE INDEX ix_cert_watermarks_tenant ON dbo.certificate_watermarks (tenant_id);
END;
GO
