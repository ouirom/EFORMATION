
-- =============================================================
-- BCI / Enterprise-grade e-learning platform
-- Microsoft SQL Server 2019+ schema, indexes, triggers, and seed data
-- Version: 1.0.0
-- Generated: 2025-12-26
-- =============================================================
USE [db_eformation];
SET NOCOUNT ON;

-- =====================
-- Helper: epoch seconds
-- =====================
-- We'll use DATEDIFF(SECOND,'1970-01-01', SYSUTCDATETIME()) for serial generation.

-- =====================
-- Tenants
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tenants]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.tenants (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  name         NVARCHAR(255) NOT NULL UNIQUE,
  slug         NVARCHAR(255) NOT NULL UNIQUE,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
END;

-- =====================
-- Tenant settings (organization profile / branding)
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tenant_settings]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.tenant_settings (
  id                        BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id                 BIGINT NOT NULL UNIQUE,
  description               NVARCHAR(MAX) NULL,
  logo_url                  NVARCHAR(500) NULL,
  primary_color             NVARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  secondary_color           NVARCHAR(20) NOT NULL DEFAULT '#10B981',
  contact_email             NVARCHAR(255) NULL,
  contact_phone             NVARCHAR(50) NULL,
  address                   NVARCHAR(500) NULL,
  website                   NVARCHAR(255) NULL,
  allow_self_registration   BIT NOT NULL DEFAULT 1,
  default_language          NVARCHAR(10) NOT NULL DEFAULT 'fr',
  timezone                  NVARCHAR(100) NOT NULL DEFAULT 'Europe/Paris',
  enable_notifications      BIT NOT NULL DEFAULT 1,
  enable_chat               BIT NOT NULL DEFAULT 1,
  enable_live_sessions      BIT NOT NULL DEFAULT 1,
  max_users_per_group       INT NOT NULL DEFAULT 50,
  certificate_validity      INT NOT NULL DEFAULT 365,
  created_at                DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at                DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
END;

-- =====================
-- Email (SMTP) settings, per tenant
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[email_settings]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.email_settings (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL UNIQUE,
  enabled      BIT NOT NULL DEFAULT 0,
  smtp_host    NVARCHAR(255) NULL,
  smtp_port    INT NOT NULL DEFAULT 587,
  smtp_secure  BIT NOT NULL DEFAULT 0,
  smtp_user    NVARCHAR(255) NULL,
  smtp_password NVARCHAR(500) NULL,
  from_email   NVARCHAR(255) NULL,
  from_name    NVARCHAR(255) NULL,
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_email_settings_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
END;

-- =====================
-- Organisation
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[enterprises]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.enterprises (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  code         NVARCHAR(100) UNIQUE,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_enterprises_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[directions]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.directions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  enterprise_id BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  code         NVARCHAR(100),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_directions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_directions_enterprise FOREIGN KEY (enterprise_id) REFERENCES dbo.enterprises(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[services]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.services (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  direction_id BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  code         NVARCHAR(100),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_services_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_services_direction FOREIGN KEY (direction_id) REFERENCES dbo.directions(id) 
);
END;

-- =====================
-- Utilisateurs & rôles
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.users (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id      BIGINT NOT NULL,
  enterprise_id  BIGINT NULL,
  direction_id   BIGINT NULL,
  service_id     BIGINT NULL,
  email          NVARCHAR(255) NOT NULL UNIQUE,
  username       NVARCHAR(255) UNIQUE,
  password_hash  NVARCHAR(MAX) NOT NULL,
  display_name   NVARCHAR(255) NOT NULL,
  role           NVARCHAR(20) NOT NULL CHECK (role IN ('admin','director','manager','supervisor','agent')),
  avatar_url     NVARCHAR(500) NULL,
  phone          NVARCHAR(50) NULL,
  is_active      BIT NOT NULL DEFAULT 1,
  created_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at     DATETIME2(0) NULL,
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_users_enterprise FOREIGN KEY (enterprise_id) REFERENCES dbo.enterprises(id) ,
  CONSTRAINT fk_users_direction FOREIGN KEY (direction_id) REFERENCES dbo.directions(id) ,
  CONSTRAINT fk_users_service FOREIGN KEY (service_id) REFERENCES dbo.services(id)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND name = 'avatar_url')
  BEGIN
    ALTER TABLE db_eformation.dbo.users ADD avatar_url NVARCHAR(500) NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND name = 'phone')
  BEGIN
    ALTER TABLE db_eformation.dbo.users ADD phone NVARCHAR(50) NULL;
  END;
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sso_identities]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.sso_identities (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  provider     NVARCHAR(20) NOT NULL CHECK (provider IN ('azure_ad','google','saml')),
  external_id  NVARCHAR(255) NOT NULL,
  CONSTRAINT uq_sso UNIQUE (tenant_id, provider, external_id),
  CONSTRAINT fk_sso_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_sso_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) 
);
END;

-- =====================
-- Fichiers / Assets
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[file_assets]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.file_assets (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  filename     NVARCHAR(255) NOT NULL,
  mime_type    NVARCHAR(100) NOT NULL,
  storage_key  NVARCHAR(512) NOT NULL,
  size_bytes   BIGINT,
  checksum     NVARCHAR(255),
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_file_assets_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_file_assets_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) 
);
END;

-- =====================
-- Formations
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[courses]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.courses (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  description  NVARCHAR(MAX),
  category     NVARCHAR(100) NULL,
  level        NVARCHAR(50) NULL,
  duration     INT NULL,
  audience_scope NVARCHAR(MAX), -- JSON string; validate via CHECK ISJSON if needed
  prerequisites NVARCHAR(MAX),  -- JSON string
  is_published BIT NOT NULL DEFAULT 0,
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_courses_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_courses_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) ,
  CONSTRAINT chk_courses_audience_json CHECK (audience_scope IS NULL OR ISJSON(audience_scope) = 1),
  CONSTRAINT chk_courses_prereq_json CHECK (prerequisites IS NULL OR ISJSON(prerequisites) = 1)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[courses]') AND name = 'category')
    ALTER TABLE db_eformation.dbo.courses ADD category NVARCHAR(100) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[courses]') AND name = 'level')
    ALTER TABLE db_eformation.dbo.courses ADD level NVARCHAR(50) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[courses]') AND name = 'duration')
    ALTER TABLE db_eformation.dbo.courses ADD duration INT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[modules]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.modules (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  course_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  position     INT NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_modules_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_modules_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[lessons]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.lessons (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  module_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  description  NVARCHAR(MAX) NULL,
  type         NVARCHAR(50) NULL,
  position     INT NOT NULL,
  duration_min INT,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_lessons_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_lessons_module FOREIGN KEY (module_id) REFERENCES dbo.modules(id)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[lessons]') AND name = 'description')
    ALTER TABLE db_eformation.dbo.lessons ADD description NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[lessons]') AND name = 'type')
    ALTER TABLE db_eformation.dbo.lessons ADD type NVARCHAR(50) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[enrollments]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.enrollments (
  id               BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id        BIGINT NOT NULL,
  course_id        BIGINT NOT NULL,
  user_id          BIGINT NOT NULL,
  progress_percent INT NOT NULL DEFAULT 0,
  started_at       DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  completed_at     DATETIME2(0) NULL,
  CONSTRAINT fk_enrollments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT uq_enrollments UNIQUE (tenant_id, course_id, user_id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[lesson_progress]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.lesson_progress (
  id                  BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  user_id             BIGINT NOT NULL,
  lesson_id           BIGINT NOT NULL,
  course_id           BIGINT NOT NULL,
  status              NVARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  progress_percent    INT NOT NULL DEFAULT 0,
  time_spent_seconds  INT NOT NULL DEFAULT 0,
  started_at          DATETIME2(0) NULL,
  last_accessed_at    DATETIME2(0) NULL,
  completed_at        DATETIME2(0) NULL,
  CONSTRAINT fk_lesson_progress_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_lesson_progress_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT fk_lesson_progress_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id) ,
  CONSTRAINT fk_lesson_progress_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT uq_lesson_progress UNIQUE (tenant_id, user_id, lesson_id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[course_assignments]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.course_assignments (
  id              BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  course_id       BIGINT NOT NULL,
  assignment_type NVARCHAR(20) NOT NULL,
  target_id       BIGINT NULL,
  target_role     NVARCHAR(20) NULL,
  is_mandatory    BIT NOT NULL DEFAULT 0,
  due_date        DATETIME2(0) NULL,
  assigned_by     BIGINT NULL,
  created_at      DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_course_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_course_assignments_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT fk_course_assignments_assigner FOREIGN KEY (assigned_by) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[contents]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.contents (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  lesson_id    BIGINT NOT NULL,
  type         NVARCHAR(20) NOT NULL CHECK (type IN ('pdf','docx','image','video_mp4','youtube_link','text')),
  title        NVARCHAR(255) NOT NULL,
  body         NVARCHAR(MAX),
  file_id      BIGINT NULL,
  url          NVARCHAR(1000),
  position     INT NOT NULL DEFAULT 1,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_contents_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_contents_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id) ,
  CONSTRAINT fk_contents_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id) 
);
END;

-- =====================
-- Quiz & évaluations
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[quizzes]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.quizzes (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  lesson_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  passing_score INT NOT NULL DEFAULT 70,
  randomized   BIT NOT NULL DEFAULT 0,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_quizzes_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_quizzes_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[questions]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.questions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  quiz_id      BIGINT NOT NULL,
  type         NVARCHAR(20) NOT NULL CHECK (type IN ('mcq','true_false','short_text','essay')),
  prompt       NVARCHAR(MAX) NOT NULL,
  position     INT NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_questions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES dbo.quizzes(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[choices]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.choices (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  question_id  BIGINT NOT NULL,
  label        NVARCHAR(MAX) NOT NULL,
  is_correct   BIT NOT NULL DEFAULT 0,
  position     INT NOT NULL,
  CONSTRAINT fk_choices_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_choices_question FOREIGN KEY (question_id) REFERENCES dbo.questions(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[attempts]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.attempts (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  quiz_id      BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  started_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  submitted_at DATETIME2(0) NULL,
  completed_at DATETIME2(0) NULL,
  score        INT,
  passed       BIT NULL,
  time_spent   INT NULL,
  status       NVARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','graded')),
  CONSTRAINT fk_attempts_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES dbo.quizzes(id) ,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[answers]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.answers (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  attempt_id   BIGINT NOT NULL,
  question_id  BIGINT NOT NULL,
  choice_id    BIGINT NULL,
  text_answer  NVARCHAR(MAX),
  is_correct   BIT,
  points       INT DEFAULT 0,
  CONSTRAINT fk_answers_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_answers_attempt FOREIGN KEY (attempt_id) REFERENCES dbo.attempts(id) ,
  CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES dbo.questions(id) ,
  CONSTRAINT fk_answers_choice FOREIGN KEY (choice_id) REFERENCES dbo.choices(id) 
);
END;

-- =====================
-- Badges & certificats
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[badges]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.badges (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  code         NVARCHAR(100) NOT NULL UNIQUE,
  name         NVARCHAR(255) NOT NULL,
  description  NVARCHAR(MAX),
  icon_file_id BIGINT NULL,
  criteria     NVARCHAR(MAX) NOT NULL,
  CONSTRAINT fk_badges_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_badges_icon FOREIGN KEY (icon_file_id) REFERENCES dbo.file_assets(id) ,
  CONSTRAINT chk_badges_criteria_json CHECK (ISJSON(criteria) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_badges]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.user_badges (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  badge_id     BIGINT NOT NULL,
  awarded_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_user_badge UNIQUE (tenant_id, user_id, badge_id),
  CONSTRAINT fk_user_badges_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_user_badges_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT fk_user_badges_badge FOREIGN KEY (badge_id) REFERENCES dbo.badges(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[certificates]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.certificates (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  course_id    BIGINT NOT NULL,
  serial       NVARCHAR(255) NOT NULL UNIQUE,
  issued_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  pdf_file_id  BIGINT NULL,
  CONSTRAINT fk_certificates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT fk_certificates_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT fk_certificates_file FOREIGN KEY (pdf_file_id) REFERENCES dbo.file_assets(id) 
);
END;

-- Trigger: certificate serial
IF OBJECT_ID('dbo.trg_cert_serial', 'TR') IS NOT NULL DROP TRIGGER dbo.trg_cert_serial;
GO
CREATE TRIGGER dbo.trg_cert_serial ON dbo.certificates
AFTER INSERT AS
BEGIN
  SET NOCOUNT ON;
  UPDATE c
    SET serial = COALESCE(c.serial, 'CERT-' + CAST(c.user_id AS NVARCHAR(20)) + '-' + CAST(DATEDIFF(SECOND,'1970-01-01', SYSUTCDATETIME()) AS NVARCHAR(20)))
  FROM dbo.certificates c
  INNER JOIN inserted i ON i.id = c.id
  WHERE c.serial IS NULL OR c.serial = '';
END;
GO

-- =====================
-- Évaluation des cours
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[course_evaluations]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.course_evaluations (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  course_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_course_eval UNIQUE (tenant_id, course_id, user_id),
  CONSTRAINT fk_course_eval_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_course_eval_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT fk_course_eval_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) 
);
END;

-- =====================
-- Blog & communauté
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[categories]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.categories (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  slug         NVARCHAR(255) NULL,
  CONSTRAINT uq_category_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_categories_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[categories]') AND name = 'slug')
    ALTER TABLE db_eformation.dbo.categories ADD slug NVARCHAR(255) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[blog_posts]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.blog_posts (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  author_id    BIGINT NULL,
  title        NVARCHAR(500) NOT NULL,
  slug         NVARCHAR(500) NULL,
  body         NVARCHAR(MAX) NOT NULL,
  category_id  BIGINT NULL,
  featured_image_id BIGINT NULL,
  status       NVARCHAR(20) NOT NULL CHECK (status IN ('draft','published')),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  published_at DATETIME2(0) NULL,
  CONSTRAINT fk_blog_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_blog_author FOREIGN KEY (author_id) REFERENCES dbo.users(id) ,
  CONSTRAINT fk_blog_category FOREIGN KEY (category_id) REFERENCES dbo.categories(id) ,
  CONSTRAINT fk_blog_featured_image FOREIGN KEY (featured_image_id) REFERENCES dbo.file_assets(id)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[blog_posts]') AND name = 'slug')
    ALTER TABLE db_eformation.dbo.blog_posts ADD slug NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[blog_posts]') AND name = 'category_id')
    ALTER TABLE db_eformation.dbo.blog_posts ADD category_id BIGINT NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[blog_posts]') AND name = 'featured_image_id')
    ALTER TABLE db_eformation.dbo.blog_posts ADD featured_image_id BIGINT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tags]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.tags (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  CONSTRAINT uq_tag_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_tags_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[post_tags]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.post_tags (
  post_id      BIGINT NOT NULL,
  tag_id       BIGINT NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES dbo.blog_posts(id) ,
  CONSTRAINT fk_post_tags_tag FOREIGN KEY (tag_id) REFERENCES dbo.tags(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[comments]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.comments (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  post_id      BIGINT NOT NULL,
  user_id      BIGINT NULL,
  parent_id    BIGINT NULL,
  body         NVARCHAR(MAX) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at   DATETIME2(0) NULL,
  CONSTRAINT fk_comments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES dbo.blog_posts(id) ,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES dbo.comments(id)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[comments]') AND name = 'parent_id')
    ALTER TABLE db_eformation.dbo.comments ADD parent_id BIGINT NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[comments]') AND name = 'deleted_at')
    ALTER TABLE db_eformation.dbo.comments ADD deleted_at DATETIME2(0) NULL;
END;

-- =====================
-- Chat
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_conversations]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.chat_conversations (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  scope        NVARCHAR(20) NOT NULL CHECK (scope IN ('direct','group','course','module')),
  title        NVARCHAR(255),
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_chat_conv_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_chat_conv_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_participants]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.chat_participants (
  conversation_id BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  role         NVARCHAR(20) NULL CHECK (role IN ('owner','member')),
  joined_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_chat_part_conv FOREIGN KEY (conversation_id) REFERENCES dbo.chat_conversations(id) ,
  CONSTRAINT fk_chat_part_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_messages]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.chat_messages (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  sender_id    BIGINT NOT NULL,
  body         NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at   DATETIME2(0) NULL,
  CONSTRAINT fk_chat_msg_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_chat_msg_conv FOREIGN KEY (conversation_id) REFERENCES dbo.chat_conversations(id) ,
  CONSTRAINT fk_chat_msg_sender FOREIGN KEY (sender_id) REFERENCES dbo.users(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_attachments]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.chat_attachments (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  message_id   BIGINT NOT NULL,
  file_id      BIGINT NOT NULL,
  CONSTRAINT fk_chat_att_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_chat_att_msg FOREIGN KEY (message_id) REFERENCES dbo.chat_messages(id) ,
  CONSTRAINT fk_chat_att_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id) 
);
END;

-- =====================
-- Notifications
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notification_templates]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.notification_templates (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  code         NVARCHAR(255) NOT NULL,
  channel      NVARCHAR(20) NOT NULL CHECK (channel IN ('email','whatsapp','sms','push_web','push_mobile')),
  subject      NVARCHAR(255),
  body         NVARCHAR(MAX) NOT NULL,
  CONSTRAINT uq_template_code UNIQUE (tenant_id, code),
  CONSTRAINT fk_notif_templates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notification_preferences]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.notification_preferences (
  id               BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id        BIGINT NOT NULL,
  user_id          BIGINT NOT NULL,
  email_enabled    BIT NOT NULL DEFAULT 1,
  sms_enabled      BIT NOT NULL DEFAULT 0,
  whatsapp_enabled BIT NOT NULL DEFAULT 0,
  push_enabled     BIT NOT NULL DEFAULT 1,
  in_app_enabled   BIT NOT NULL DEFAULT 1,
  digest_frequency NVARCHAR(20) NOT NULL DEFAULT 'immediate',
  updated_at       DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_notif_pref UNIQUE (tenant_id, user_id),
  CONSTRAINT fk_notif_pref_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[push_subscriptions]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.push_subscriptions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  endpoint     NVARCHAR(1000) NOT NULL,
  p256dh       NVARCHAR(500) NOT NULL,
  auth         NVARCHAR(500) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_push_sub_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_push_sub_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.notifications (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id      BIGINT NOT NULL,
  user_id        BIGINT NOT NULL,
  channel        NVARCHAR(20) NOT NULL CHECK (channel IN ('email','sms','whatsapp','push','in_app')),
  subject        NVARCHAR(500) NULL,
  body           NVARCHAR(MAX) NOT NULL,
  action_url     NVARCHAR(1000) NULL,
  metadata       NVARCHAR(MAX) NULL,
  external_id    NVARCHAR(255) NULL,
  sent_at        DATETIME2(0) NULL,
  failed_at      DATETIME2(0) NULL,
  error_message  NVARCHAR(MAX) NULL,
  read_at        DATETIME2(0) NULL,
  created_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT chk_notifications_metadata_json CHECK (metadata IS NULL OR ISJSON(metadata) = 1)
);
END;
ELSE
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'external_id')
    ALTER TABLE db_eformation.dbo.notifications ADD external_id NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'sent_at')
    ALTER TABLE db_eformation.dbo.notifications ADD sent_at DATETIME2(0) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'failed_at')
    ALTER TABLE db_eformation.dbo.notifications ADD failed_at DATETIME2(0) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'error_message')
    ALTER TABLE db_eformation.dbo.notifications ADD error_message NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'read_at')
    ALTER TABLE db_eformation.dbo.notifications ADD read_at DATETIME2(0) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'channel')
    ALTER TABLE db_eformation.dbo.notifications ADD channel NVARCHAR(20) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'subject')
    ALTER TABLE db_eformation.dbo.notifications ADD subject NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'body')
    ALTER TABLE db_eformation.dbo.notifications ADD body NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'action_url')
    ALTER TABLE db_eformation.dbo.notifications ADD action_url NVARCHAR(1000) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND name = 'metadata')
    ALTER TABLE db_eformation.dbo.notifications ADD metadata NVARCHAR(MAX) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notification_deliveries]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.notification_deliveries (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  notification_id BIGINT NOT NULL,
  channel      NVARCHAR(20) NOT NULL CHECK (channel IN ('email','whatsapp','sms','push_web','push_mobile')),
  status       NVARCHAR(20) NOT NULL CHECK (status IN ('queued','sent','failed','opened','clicked')),
  provider_msg_id NVARCHAR(255),
  sent_at      DATETIME2(0) NULL,
  error        NVARCHAR(MAX),
  CONSTRAINT fk_notif_deliv_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_notif_deliv_notif FOREIGN KEY (notification_id) REFERENCES dbo.notifications(id) 
);
END;

-- =====================
-- Visioconférence
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[live_sessions]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.live_sessions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  course_id    BIGINT NULL,
  module_id    BIGINT NULL,
  title        NVARCHAR(255) NOT NULL,
  status       NVARCHAR(20) NOT NULL CHECK (status IN ('scheduled','live','ended','canceled')),
  scheduled_at DATETIME2(0) NULL,
  started_at   DATETIME2(0) NULL,
  ended_at     DATETIME2(0) NULL,
  organizer_id BIGINT NULL,
  meeting_provider NVARCHAR(20) NULL CHECK (meeting_provider IN ('webrtc','zoom','teams','meet')),
  meeting_link  NVARCHAR(1000),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_live_sess_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_live_sess_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT fk_live_sess_module FOREIGN KEY (module_id) REFERENCES dbo.modules(id) ,
  CONSTRAINT fk_live_sess_org FOREIGN KEY (organizer_id) REFERENCES dbo.users(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[live_participants]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.live_participants (
  session_id   BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  role         NVARCHAR(20) NULL CHECK (role IN ('host','speaker','attendee')),
  joined_at    DATETIME2(0) NULL,
  left_at      DATETIME2(0) NULL,
  PRIMARY KEY (session_id, user_id),
  CONSTRAINT fk_live_part_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) ,
  CONSTRAINT fk_live_part_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[live_recordings]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.live_recordings (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  session_id   BIGINT NOT NULL,
  file_id      BIGINT NULL,
  duration_sec INT,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_live_rec_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_live_rec_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) ,
  CONSTRAINT fk_live_rec_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[breakout_rooms]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.breakout_rooms (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  session_id   BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_breakout_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_breakout_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[whiteboards]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.whiteboards (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  session_id   BIGINT NULL,
  data         NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_whiteboards_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_whiteboards_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) 
);
END;

-- =====================
-- IA & Analytics
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ai_generated_contents]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.ai_generated_contents (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  source_type  NVARCHAR(20) NOT NULL CHECK (source_type IN ('course','module','lesson','video','document','chat')),
  source_id    BIGINT NULL,
  kind         NVARCHAR(20) NOT NULL CHECK (kind IN ('summary','quiz','revision_sheet','title','description','transcript')),
  content      NVARCHAR(MAX),
  metadata     NVARCHAR(MAX),
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_ai_gen_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_ai_gen_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) ,
  CONSTRAINT chk_ai_metadata_json CHECK (metadata IS NULL OR ISJSON(metadata) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ai_recommendations]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.ai_recommendations (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  recommendation NVARCHAR(MAX) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_ai_rec_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_ai_rec_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT chk_ai_rec_json CHECK (ISJSON(recommendation) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ai_chat_history]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.ai_chat_history (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  role         NVARCHAR(20) NOT NULL CHECK (role IN ('user','assistant')),
  message      NVARCHAR(MAX) NOT NULL,
  context      NVARCHAR(MAX) NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_ai_chat_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_ai_chat_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
CREATE INDEX idx_ai_chat_history_user ON db_eformation.dbo.ai_chat_history(user_id, created_at DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_profiles]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.user_profiles (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id      BIGINT NOT NULL,
  user_id        BIGINT NOT NULL UNIQUE,
  interests      NVARCHAR(MAX) NULL,
  learning_goals NVARCHAR(MAX) NULL,
  updated_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_user_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ai_usage_logs]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.ai_usage_logs (
  id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id          BIGINT NOT NULL,
  user_id            BIGINT NOT NULL,
  feature            NVARCHAR(100) NOT NULL,
  prompt_tokens      INT NOT NULL DEFAULT 0,
  completion_tokens  INT NOT NULL DEFAULT 0,
  model              NVARCHAR(100) NULL,
  created_at         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_ai_usage_logs_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_ai_usage_logs_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[learning_analytics]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.learning_analytics (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NULL,
  course_id    BIGINT NULL,
  metric       NVARCHAR(100) NOT NULL,
  value        DECIMAL(18,4),
  context      NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_analytics_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ,
  CONSTRAINT fk_analytics_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ,
  CONSTRAINT chk_analytics_context_json CHECK (context IS NULL OR ISJSON(context) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[search_index]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.search_index (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  entity       NVARCHAR(50) NOT NULL,
  entity_id    BIGINT NOT NULL,
  text         NVARCHAR(MAX),
  metadata     NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_search_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT chk_search_metadata_json CHECK (metadata IS NULL OR ISJSON(metadata) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[search_history]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.search_history (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  user_id       BIGINT NOT NULL,
  query         NVARCHAR(500) NOT NULL,
  result_count  INT NOT NULL DEFAULT 0,
  searched_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_search_history_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_search_history_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
CREATE INDEX idx_search_history_user ON db_eformation.dbo.search_history(user_id, searched_at DESC);
END;

-- =====================
-- Intégrations & API
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[webhooks]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.webhooks (
  id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id          BIGINT NOT NULL,
  name               NVARCHAR(255) NOT NULL,
  url                NVARCHAR(1000) NOT NULL,
  events             NVARCHAR(MAX) NOT NULL, -- JSON array of event names
  secret             NVARCHAR(255),
  headers            NVARCHAR(MAX) NULL,
  is_active          BIT NOT NULL DEFAULT 1,
  created_by         BIGINT NULL,
  created_at         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  last_triggered_at  DATETIME2(0) NULL,
  CONSTRAINT fk_webhook_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_webhook_creator FOREIGN KEY (created_by) REFERENCES dbo.users(id) ,
  CONSTRAINT chk_webhook_events_json CHECK (ISJSON(events) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[webhook_deliveries]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.webhook_deliveries (
  id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
  webhook_id         BIGINT NOT NULL,
  event              NVARCHAR(100) NOT NULL,
  payload            NVARCHAR(MAX) NULL,
  response_status    INT NULL,
  response_body      NVARCHAR(MAX) NULL,
  response_time_ms   INT NULL,
  success            BIT NOT NULL DEFAULT 0,
  error_message      NVARCHAR(MAX) NULL,
  created_at         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_webhook_deliveries_webhook FOREIGN KEY (webhook_id) REFERENCES dbo.webhooks(id) ON DELETE CASCADE
);
CREATE INDEX idx_webhook_deliveries_webhook ON db_eformation.dbo.webhook_deliveries(webhook_id, created_at DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[api_keys]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.api_keys (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  [key]        NVARCHAR(255) NOT NULL,
  scopes       NVARCHAR(MAX),
  is_active    BIT NOT NULL DEFAULT 1,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_api_key UNIQUE ([key]),
  CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT chk_api_scopes_json CHECK (scopes IS NULL OR ISJSON(scopes) = 1)
);
END;

-- =====================
-- Audit & Conformité
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[audit_logs]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.audit_logs (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NULL,
  action       NVARCHAR(255) NOT NULL,
  entity       NVARCHAR(100),
  entity_id    BIGINT,
  metadata     NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[scheduled_reports]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.scheduled_reports (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  report_type  NVARCHAR(50) NOT NULL,
  frequency    NVARCHAR(20) NOT NULL,
  format       NVARCHAR(20) NOT NULL,
  recipients   NVARCHAR(MAX) NOT NULL,
  filters      NVARCHAR(MAX) NULL,
  is_active    BIT NOT NULL DEFAULT 1,
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_scheduled_reports_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_scheduled_reports_creator FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[privacy_consents]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.privacy_consents (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  policy_code  NVARCHAR(100) NOT NULL,
  consented    BIT NOT NULL DEFAULT 1,
  consented_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_privacy UNIQUE (tenant_id, user_id, policy_code),
  CONSTRAINT fk_privacy_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ,
  CONSTRAINT fk_privacy_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) 
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[data_retention_policies]') AND type in (N'U'))
BEGIN
CREATE TABLE db_eformation.dbo.data_retention_policies (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  entity       NVARCHAR(100) NOT NULL,
  retention_days INT NOT NULL CHECK (retention_days > 0),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_retention_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) 
);
END;

-- =====================
-- Indexes
-- =====================
CREATE INDEX idx_modules_course ON dbo.modules (course_id, position);
CREATE INDEX idx_lessons_module ON dbo.lessons (module_id, position);
CREATE INDEX idx_contents_lesson ON dbo.contents (lesson_id, position);
CREATE INDEX idx_quizzes_lesson ON dbo.quizzes (lesson_id);
CREATE INDEX idx_attempts_user_quiz ON dbo.attempts (user_id, quiz_id);
CREATE INDEX idx_answers_attempt ON dbo.answers (attempt_id);
CREATE INDEX idx_user_badges_user ON dbo.user_badges (user_id);
CREATE INDEX idx_certificates_user_course ON dbo.certificates (user_id, course_id);
CREATE INDEX idx_course_eval_course ON dbo.course_evaluations (course_id);
CREATE INDEX idx_blog_posts_status ON dbo.blog_posts (status, created_at);
CREATE INDEX idx_comments_post ON dbo.comments (post_id, created_at);
CREATE INDEX idx_chat_messages_conv_created ON dbo.chat_messages (conversation_id, created_at);
CREATE INDEX idx_audit_logs_entity ON dbo.audit_logs (entity, entity_id);

-- =====================
-- Triggers: updated_at maintenance
-- =====================
-- For tables with updated_at column, create AFTER UPDATE triggers to set updated_at to SYSUTCDATETIME()

DECLARE @tables TABLE (name NVARCHAR(128));
INSERT INTO @tables(name)
VALUES ('enterprises'),('directions'),('services'),('users'),('courses'),('modules'),('lessons'),('whiteboards');

DECLARE @t NVARCHAR(128);
DECLARE cur CURSOR FOR SELECT name FROM @tables;
OPEN cur; FETCH NEXT FROM cur INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  DECLARE @sql NVARCHAR(MAX) = N'';
  SET @sql = N'IF OBJECT_ID(''dbo.trg_touch_' + @t + ''', ''TR'') IS NOT NULL DROP TRIGGER dbo.trg_touch_' + @t + ';';
  EXEC sp_executesql @sql;
  SET @sql = N'CREATE TRIGGER dbo.trg_touch_' + @t + ' ON dbo.' + @t + ' AFTER UPDATE AS BEGIN SET NOCOUNT ON; UPDATE dbo.' + @t + ' SET updated_at = SYSUTCDATETIME() WHERE id IN (SELECT id FROM inserted); END';
  EXEC sp_executesql @sql;
  FETCH NEXT FROM cur INTO @t;
END
CLOSE cur; DEALLOCATE cur;

-- =====================
-- Seeds (idempotent)
-- =====================
IF NOT EXISTS (SELECT 1 FROM dbo.tenants WHERE slug='default')
INSERT INTO dbo.tenants(name, slug) VALUES ('Default Tenant','default');

IF NOT EXISTS (
  SELECT 1 FROM dbo.enterprises e JOIN dbo.tenants t ON e.tenant_id=t.id WHERE t.slug='default' AND e.code='DEMO')
INSERT INTO dbo.enterprises(tenant_id, name, code)
SELECT t.id, 'Demo Enterprise', 'DEMO' FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.directions d JOIN dbo.enterprises e ON d.enterprise_id=e.id JOIN dbo.tenants t ON e.tenant_id=t.id
  WHERE t.slug='default' AND e.code='DEMO' AND d.code='TECH')
INSERT INTO dbo.directions(tenant_id, enterprise_id, name, code)
SELECT t.id, e.id, 'Technology', 'TECH'
FROM dbo.tenants t JOIN dbo.enterprises e ON e.tenant_id=t.id WHERE t.slug='default' AND e.code='DEMO';

IF NOT EXISTS (
  SELECT 1 FROM dbo.directions d JOIN dbo.enterprises e ON d.enterprise_id=e.id JOIN dbo.tenants t ON e.tenant_id=t.id
  WHERE t.slug='default' AND e.code='DEMO' AND d.code='OPS')
INSERT INTO dbo.directions(tenant_id, enterprise_id, name, code)
SELECT t.id, e.id, 'Operations', 'OPS'
FROM dbo.tenants t JOIN dbo.enterprises e ON e.tenant_id=t.id WHERE t.slug='default' AND e.code='DEMO';

IF NOT EXISTS (
  SELECT 1 FROM dbo.services s JOIN dbo.directions d ON s.direction_id=d.id JOIN dbo.enterprises e ON d.enterprise_id=e.id JOIN dbo.tenants t ON e.tenant_id=t.id
  WHERE t.slug='default' AND e.code='DEMO' AND d.code='TECH' AND s.code='ENG')
INSERT INTO dbo.services(tenant_id, direction_id, name, code)
SELECT t.id, d.id, 'Engineering', 'ENG'
FROM dbo.tenants t JOIN dbo.enterprises e ON e.tenant_id=t.id JOIN dbo.directions d ON d.enterprise_id=e.id
WHERE t.slug='default' AND e.code='DEMO' AND d.code='TECH';

IF NOT EXISTS (
  SELECT 1 FROM dbo.services s JOIN dbo.directions d ON s.direction_id=d.id JOIN dbo.enterprises e ON d.enterprise_id=e.id JOIN dbo.tenants t ON e.tenant_id=t.id
  WHERE t.slug='default' AND e.code='DEMO' AND d.code='OPS' AND s.code='HR')
INSERT INTO dbo.services(tenant_id, direction_id, name, code)
SELECT t.id, d.id, 'Human Resources', 'HR'
FROM dbo.tenants t JOIN dbo.enterprises e ON e.tenant_id=t.id JOIN dbo.directions d ON d.enterprise_id=e.id
WHERE t.slug='default' AND e.code='DEMO' AND d.code='OPS';

IF NOT EXISTS (
  SELECT 1 FROM dbo.users u JOIN dbo.tenants t ON u.tenant_id=t.id WHERE t.slug='default' AND u.email='admin@demo.local')
INSERT INTO dbo.users(tenant_id, enterprise_id, direction_id, service_id, email, username, password_hash, display_name, role)
SELECT t.id, e.id, d.id, s.id, 'admin@demo.local', 'admin', 'hashed_password_placeholder', 'Admin Demo', 'admin'
FROM dbo.tenants t
JOIN dbo.enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN dbo.directions d ON d.enterprise_id=e.id AND d.code='TECH'
JOIN dbo.services s ON s.direction_id=d.id AND s.code='ENG'
WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.users u JOIN dbo.tenants t ON u.tenant_id=t.id WHERE t.slug='default' AND u.email='manager@demo.local')
INSERT INTO dbo.users(tenant_id, enterprise_id, direction_id, service_id, email, username, password_hash, display_name, role)
SELECT t.id, e.id, d.id, s.id, 'manager@demo.local', 'manager', 'hashed_password_placeholder', 'Manager Demo', 'manager'
FROM dbo.tenants t
JOIN dbo.enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN dbo.directions d ON d.enterprise_id=e.id AND d.code='OPS'
JOIN dbo.services s ON s.direction_id=d.id AND s.code='HR'
WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.users u JOIN dbo.tenants t ON u.tenant_id=t.id WHERE t.slug='default' AND u.email='agent@demo.local')
INSERT INTO dbo.users(tenant_id, enterprise_id, direction_id, service_id, email, username, password_hash, display_name, role)
SELECT t.id, e.id, d.id, s.id, 'agent@demo.local', 'agent', 'hashed_password_placeholder', 'Agent Demo', 'agent'
FROM dbo.tenants t
JOIN dbo.enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN dbo.directions d ON d.enterprise_id=e.id AND d.code='OPS'
JOIN dbo.services s ON s.direction_id=d.id AND s.code='HR'
WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.notification_templates nt JOIN dbo.tenants t ON nt.tenant_id=t.id WHERE t.slug='default' AND nt.code='course_invite_email')
INSERT INTO dbo.notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'course_invite_email', 'email', 'Invitation à une formation', 'Bonjour {{name}}, vous êtes invité à la formation {{course}}.'
FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.notification_templates nt JOIN dbo.tenants t ON nt.tenant_id=t.id WHERE t.slug='default' AND nt.code='quiz_result_email')
INSERT INTO dbo.notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'quiz_result_email', 'email', 'Résultat de votre quiz', 'Vous avez obtenu {{score}}% au quiz {{quiz}}.'
FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.notification_templates nt JOIN dbo.tenants t ON nt.tenant_id=t.id WHERE t.slug='default' AND nt.code='course_invite_whatsapp')
INSERT INTO dbo.notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'course_invite_whatsapp', 'whatsapp', NULL, 'Formation: {{course}}. Lien: {{link}}'
FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.notification_templates nt JOIN dbo.tenants t ON nt.tenant_id=t.id WHERE t.slug='default' AND nt.code='reminder_sms')
INSERT INTO dbo.notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'reminder_sms', 'sms', NULL, 'Rappel: formation {{course}} demain.'
FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.badges b JOIN dbo.tenants t ON b.tenant_id=t.id WHERE t.slug='default' AND b.code='QUIZ_70')
INSERT INTO dbo.badges(tenant_id, code, name, description, criteria)
SELECT t.id, 'QUIZ_70', 'Quiz 70%', 'Badge obtenu pour score >= 70%', N'{"min_score":70}'
FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.categories c JOIN dbo.tenants t ON c.tenant_id=t.id WHERE t.slug='default' AND c.name='Annonces')
INSERT INTO dbo.categories(tenant_id, name)
SELECT t.id, 'Annonces' FROM dbo.tenants t WHERE t.slug='default';

IF NOT EXISTS (
  SELECT 1 FROM dbo.tags tg JOIN dbo.tenants t ON tg.tenant_id=t.id WHERE t.slug='default' AND tg.name='Formation')
INSERT INTO dbo.tags(tenant_id, name)
SELECT t.id, 'Formation' FROM dbo.tenants t WHERE t.slug='default';
