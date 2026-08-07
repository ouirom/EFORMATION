-- Migration: adds an account status (pending/active/suspended/deactivated) and
-- last_login_at tracking to users, plus a per-role inactivity-suspension policy
-- table. Backs: self-registration now starts 'pending' until an n+1 activates
-- it, and a scheduled job auto-suspends accounts inactive past an admin-set,
-- per-role threshold.
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/009_user_status_and_inactivity.sql
-- Note: each ALTER TABLE is its own batch (GO-separated) — SQL Server resolves
-- column names against the batch's compiled plan, so a later statement in the
-- same batch can't reference a column an earlier statement in that batch added.

IF COL_LENGTH('dbo.users', 'status') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD status NVARCHAR(20) NOT NULL CONSTRAINT DF_users_status DEFAULT 'active';
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_users_status')
BEGIN
  ALTER TABLE dbo.users ADD CONSTRAINT CK_users_status
    CHECK (status IN ('pending', 'active', 'suspended', 'deactivated'));
END;
GO

-- An existing inactive account predates this feature, so we can't know whether it
-- was suspended-for-inactivity or intentionally deactivated — 'deactivated' is the
-- more conservative label; an admin can reclassify manually if it was actually a
-- pending signup or an inactivity suspension.
UPDATE dbo.users SET status = 'deactivated' WHERE is_active = 0 AND status = 'active';
GO

IF COL_LENGTH('dbo.users', 'last_login_at') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD last_login_at DATETIME2(0) NULL;
END;
GO

IF OBJECT_ID('dbo.inactivity_policies', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.inactivity_policies (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    role NVARCHAR(20) NOT NULL,
    max_inactive_days INT NOT NULL,
    updated_by BIGINT NULL,
    updated_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_inactivity_policies_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_inactivity_policies_user FOREIGN KEY (updated_by) REFERENCES dbo.users(id),
    CONSTRAINT uq_inactivity_policies_tenant_role UNIQUE (tenant_id, role)
  );
END;
GO
