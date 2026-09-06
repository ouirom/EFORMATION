-- Lesson-level details: private per-user notes, a shared comment thread, and
-- an optional 1-5 star rating prompted at lesson completion (LessonPage.tsx).
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/015_lesson_details_and_ratings.sql

IF OBJECT_ID('dbo.lesson_notes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lesson_notes (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    lesson_id    BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    body         NVARCHAR(MAX) NOT NULL,
    updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_lesson_notes_lesson_user UNIQUE (lesson_id, user_id),
    CONSTRAINT fk_lesson_notes_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_lesson_notes_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id),
    CONSTRAINT fk_lesson_notes_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO

IF OBJECT_ID('dbo.lesson_comments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lesson_comments (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    lesson_id    BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    body         NVARCHAR(MAX) NOT NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_lesson_comments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_lesson_comments_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id),
    CONSTRAINT fk_lesson_comments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
  CREATE INDEX ix_lesson_comments_lesson ON dbo.lesson_comments (lesson_id);
END;
GO

IF OBJECT_ID('dbo.lesson_evaluations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lesson_evaluations (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id    BIGINT NOT NULL,
    lesson_id    BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    rating       INT NOT NULL CHECK ((rating>=1 AND rating<=5)),
    comment      NVARCHAR(MAX) NULL,
    created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_lesson_evaluations_lesson_user UNIQUE (lesson_id, user_id),
    CONSTRAINT fk_lesson_evaluations_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_lesson_evaluations_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id),
    CONSTRAINT fk_lesson_evaluations_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO
