-- Migration: tracking table for automated due-date reminders / manager escalation
-- on mandatory course_assignments. Run once against db_eformation.
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/001_assignment_reminders.sql

IF OBJECT_ID('dbo.assignment_reminders', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.assignment_reminders (
    id                   BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id            BIGINT NOT NULL,
    course_assignment_id BIGINT NOT NULL,
    user_id              BIGINT NOT NULL,
    reminder_type        NVARCHAR(20) NOT NULL CHECK (reminder_type IN ('upcoming', 'urgent', 'overdue', 'escalation')),
    sent_at              DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_assignment_reminders_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_assignment_reminders_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    -- one reminder of a given type per (assignment, recipient) so the daily job can't double-send
    CONSTRAINT uq_assignment_reminder UNIQUE (course_assignment_id, user_id, reminder_type)
  );

  CREATE INDEX idx_assignment_reminders_lookup ON dbo.assignment_reminders(course_assignment_id, user_id);
END
GO
