-- Migration: adds the super_admin role (cross-tenant platform operator).
-- The existing role CHECK constraint on dbo.users was auto-named by SQL Server
-- (e.g. CK__users__role__xxxxxxxx), so it's located dynamically rather than
-- hardcoded, then replaced with an explicitly-named one that also allows it.
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/005_super_admin_role.sql

IF OBJECT_ID('dbo.CK_users_role', 'C') IS NULL
BEGIN
  DECLARE @constraintName NVARCHAR(200);

  SELECT @constraintName = cc.name
  FROM sys.check_constraints cc
  JOIN sys.tables t ON cc.parent_object_id = t.object_id
  WHERE t.name = 'users' AND cc.definition LIKE '%[role]%';

  IF @constraintName IS NOT NULL
  BEGIN
    DECLARE @dropSql NVARCHAR(MAX) = N'ALTER TABLE dbo.users DROP CONSTRAINT ' + QUOTENAME(@constraintName);
    EXEC sp_executesql @dropSql;
  END

  ALTER TABLE dbo.users ADD CONSTRAINT CK_users_role
    CHECK (role IN ('super_admin', 'admin', 'director', 'manager', 'supervisor', 'agent'));
END
GO
