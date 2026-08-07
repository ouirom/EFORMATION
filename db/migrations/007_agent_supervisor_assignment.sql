-- Adds an explicit direct-supervisor assignment on users, so a supervisor's
-- team ("Mon équipe") can be the agents specifically assigned to them rather
-- than every agent who happens to share their service.
IF COL_LENGTH('dbo.users', 'supervisor_id') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD supervisor_id BIGINT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_users_supervisor')
BEGIN
  ALTER TABLE dbo.users
    ADD CONSTRAINT fk_users_supervisor FOREIGN KEY (supervisor_id) REFERENCES dbo.users(id);
END;
