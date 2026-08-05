-- Migration: creates tables that the backend has relied on since early development
-- (course_assignments, enrollments, lesson_progress) but that were never added to
-- db/bci_lms_schema_sqlserver.sql. Safe to run against both a fresh install and an
-- existing database where these tables already exist (each block is a no-op then).
-- Usage: sqlcmd -S <server> -d db_eformation -i db/migrations/003_core_missing_tables.sql

IF OBJECT_ID('dbo.course_assignments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.course_assignments (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id     BIGINT NOT NULL,
    course_id     BIGINT NOT NULL,
    assignment_type NVARCHAR(20) NOT NULL CHECK (assignment_type IN ('user', 'enterprise', 'direction', 'service', 'role')),
    target_id     BIGINT NULL,
    target_role   NVARCHAR(20) NULL,
    is_mandatory  BIT NOT NULL DEFAULT 0,
    due_date      DATETIME2(0) NULL,
    assigned_by   BIGINT NOT NULL,
    created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_course_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_course_assignments_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id),
    CONSTRAINT fk_course_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(id)
  );
  CREATE INDEX idx_course_assignments_course ON dbo.course_assignments(course_id);
END
GO

IF OBJECT_ID('dbo.enrollments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.enrollments (
    id               BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id        BIGINT NOT NULL,
    user_id          BIGINT NOT NULL,
    course_id        BIGINT NOT NULL,
    progress_percent INT NOT NULL DEFAULT 0,
    enrolled_at      DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    started_at       DATETIME2(0) NULL,
    completed_at     DATETIME2(0) NULL,
    CONSTRAINT fk_enrollments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id),
    CONSTRAINT uq_enrollments_user_course UNIQUE (user_id, course_id)
  );
END
GO

IF OBJECT_ID('dbo.lesson_progress', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lesson_progress (
    id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id          BIGINT NOT NULL,
    user_id            BIGINT NOT NULL,
    lesson_id          BIGINT NOT NULL,
    course_id          BIGINT NOT NULL,
    status             NVARCHAR(20) NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
    progress_percent   INT NOT NULL DEFAULT 0,
    time_spent_seconds INT NOT NULL DEFAULT 0,
    started_at         DATETIME2(0) NULL,
    completed_at       DATETIME2(0) NULL,
    last_accessed_at   DATETIME2(0) NULL,
    CONSTRAINT fk_lesson_progress_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_lesson_progress_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_lesson_progress_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id),
    CONSTRAINT fk_lesson_progress_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id),
    CONSTRAINT uq_lesson_progress_user_lesson UNIQUE (user_id, lesson_id)
  );
END
GO
