-- Admin-defined teams composed of a mix of users, directions, services and
-- enterprises. Membership resolves dynamically at read time via the same
-- multi-type OR-join pattern already used by course_assignments -- adding a
-- whole service to a team means new hires in that service automatically
-- become team members, no manual resync needed.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/017_teams.sql

IF OBJECT_ID('dbo.teams', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.teams (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    name         NVARCHAR(255) NOT NULL,
    description  NVARCHAR(500) NULL,
    created_by   BIGINT NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at   DATETIME2(0) NULL,
    CONSTRAINT fk_teams_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );
  CREATE INDEX ix_teams_tenant ON dbo.teams (tenant_id);
END;
GO

IF OBJECT_ID('dbo.team_members', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_members (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    team_id      BIGINT NOT NULL,
    member_type  NVARCHAR(20) NOT NULL
      CHECK ((member_type='user' OR member_type='enterprise' OR member_type='direction' OR member_type='service')),
    target_id    BIGINT NOT NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id) ON DELETE CASCADE,
    CONSTRAINT uq_team_members_entry UNIQUE (team_id, member_type, target_id)
  );
  CREATE INDEX ix_team_members_team ON dbo.team_members (team_id);
END;
GO
