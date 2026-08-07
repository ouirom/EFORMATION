-- Migration: adds two new user types, 'externe' and 'stagiaire', at the same
-- hierarchy level as 'agent' (external contractors / interns, tracked separately
-- from regular employees but with identical permissions).
-- Finds whatever CHECK constraint currently governs users.role (whether the
-- auto-named original or CK_users_role from migration 005) and replaces it with
-- one that also allows the two new values — safe to re-run and order-independent.
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/008_externe_stagiaire_roles.sql

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
  CHECK (role IN ('super_admin', 'admin', 'director', 'manager', 'supervisor', 'agent', 'externe', 'stagiaire'));
GO
