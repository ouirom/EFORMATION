
-- =============================================================
-- BCI / Enterprise-grade e-learning platform
-- Microsoft SQL Server 2019+ schema, indexes, triggers, and seed data
-- Version: 1.0.0
-- Generated: 2025-12-26
-- =============================================================

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
CREATE TABLE dbo.tenants (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  name         NVARCHAR(255) NOT NULL UNIQUE,
  slug         NVARCHAR(255) NOT NULL UNIQUE,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
END;

-- =====================
-- Organisation
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[enterprises]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.enterprises (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  code         NVARCHAR(100) UNIQUE,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_enterprises_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[directions]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.directions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  enterprise_id BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  code         NVARCHAR(100),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_directions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_directions_enterprise FOREIGN KEY (enterprise_id) REFERENCES dbo.enterprises(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[services]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.services (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  direction_id BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  code         NVARCHAR(100),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_services_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_services_direction FOREIGN KEY (direction_id) REFERENCES dbo.directions(id) ON DELETE CASCADE
);
END;

-- =====================
-- Utilisateurs & rôles
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.users (
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
  is_active      BIT NOT NULL DEFAULT 1,
  created_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at     DATETIME2(0) NULL,
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_enterprise FOREIGN KEY (enterprise_id) REFERENCES dbo.enterprises(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_direction FOREIGN KEY (direction_id) REFERENCES dbo.directions(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_service FOREIGN KEY (service_id) REFERENCES dbo.services(id) ON DELETE SET NULL
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sso_identities]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.sso_identities (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  provider     NVARCHAR(20) NOT NULL CHECK (provider IN ('azure_ad','google','saml')),
  external_id  NVARCHAR(255) NOT NULL,
  CONSTRAINT uq_sso UNIQUE (tenant_id, provider, external_id),
  CONSTRAINT fk_sso_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sso_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

-- =====================
-- Fichiers / Assets
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[file_assets]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.file_assets (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  filename     NVARCHAR(255) NOT NULL,
  mime_type    NVARCHAR(100) NOT NULL,
  storage_key  NVARCHAR(512) NOT NULL,
  size_bytes   BIGINT,
  checksum     NVARCHAR(255),
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_file_assets_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_file_assets_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) ON DELETE SET NULL
);
END;

-- =====================
-- Formations
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[courses]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.courses (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  description  NVARCHAR(MAX),
  audience_scope NVARCHAR(MAX), -- JSON string; validate via CHECK ISJSON if needed
  prerequisites NVARCHAR(MAX),  -- JSON string
  is_published BIT NOT NULL DEFAULT 0,
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_courses_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_courses_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_courses_audience_json CHECK (audience_scope IS NULL OR ISJSON(audience_scope) = 1),
  CONSTRAINT chk_courses_prereq_json CHECK (prerequisites IS NULL OR ISJSON(prerequisites) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[modules]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.modules (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  course_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  position     INT NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_modules_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_modules_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[lessons]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.lessons (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  module_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  position     INT NOT NULL,
  duration_min INT,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_lessons_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_lessons_module FOREIGN KEY (module_id) REFERENCES dbo.modules(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[contents]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.contents (
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
  CONSTRAINT fk_contents_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_contents_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id) ON DELETE CASCADE,
  CONSTRAINT fk_contents_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id) ON DELETE SET NULL
);
END;

-- =====================
-- Quiz & évaluations
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[quizzes]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.quizzes (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  lesson_id    BIGINT NOT NULL,
  title        NVARCHAR(255) NOT NULL,
  passing_score INT NOT NULL DEFAULT 70,
  randomized   BIT NOT NULL DEFAULT 0,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_quizzes_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_quizzes_lesson FOREIGN KEY (lesson_id) REFERENCES dbo.lessons(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[questions]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.questions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  quiz_id      BIGINT NOT NULL,
  type         NVARCHAR(20) NOT NULL CHECK (type IN ('mcq','true_false','short_text','essay')),
  prompt       NVARCHAR(MAX) NOT NULL,
  position     INT NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_questions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES dbo.quizzes(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[choices]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.choices (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  question_id  BIGINT NOT NULL,
  label        NVARCHAR(MAX) NOT NULL,
  is_correct   BIT NOT NULL DEFAULT 0,
  position     INT NOT NULL,
  CONSTRAINT fk_choices_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_choices_question FOREIGN KEY (question_id) REFERENCES dbo.questions(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[attempts]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.attempts (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  quiz_id      BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  started_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  submitted_at DATETIME2(0) NULL,
  score        INT,
  status       NVARCHAR(20) NOT NULL CHECK (status IN ('in_progress','submitted','graded')),
  CONSTRAINT fk_attempts_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES dbo.quizzes(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[answers]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.answers (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  attempt_id   BIGINT NOT NULL,
  question_id  BIGINT NOT NULL,
  choice_id    BIGINT NULL,
  text_answer  NVARCHAR(MAX),
  is_correct   BIT,
  points       INT DEFAULT 0,
  CONSTRAINT fk_answers_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_attempt FOREIGN KEY (attempt_id) REFERENCES dbo.attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES dbo.questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_choice FOREIGN KEY (choice_id) REFERENCES dbo.choices(id) ON DELETE SET NULL
);
END;

-- =====================
-- Badges & certificats
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[badges]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.badges (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  code         NVARCHAR(100) NOT NULL UNIQUE,
  name         NVARCHAR(255) NOT NULL,
  description  NVARCHAR(MAX),
  icon_file_id BIGINT NULL,
  criteria     NVARCHAR(MAX) NOT NULL,
  CONSTRAINT fk_badges_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_badges_icon FOREIGN KEY (icon_file_id) REFERENCES dbo.file_assets(id) ON DELETE SET NULL,
  CONSTRAINT chk_badges_criteria_json CHECK (ISJSON(criteria) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_badges]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.user_badges (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  badge_id     BIGINT NOT NULL,
  awarded_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_user_badge UNIQUE (tenant_id, user_id, badge_id),
  CONSTRAINT fk_user_badges_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_badges_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_badges_badge FOREIGN KEY (badge_id) REFERENCES dbo.badges(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[certificates]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.certificates (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  course_id    BIGINT NOT NULL,
  serial       NVARCHAR(255) NOT NULL UNIQUE,
  issued_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  pdf_file_id  BIGINT NULL,
  CONSTRAINT fk_certificates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_file FOREIGN KEY (pdf_file_id) REFERENCES dbo.file_assets(id) ON DELETE SET NULL
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
CREATE TABLE dbo.course_evaluations (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  course_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_course_eval UNIQUE (tenant_id, course_id, user_id),
  CONSTRAINT fk_course_eval_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_eval_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_eval_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

-- =====================
-- Blog & communauté
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[blog_posts]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.blog_posts (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  author_id    BIGINT NULL,
  title        NVARCHAR(500) NOT NULL,
  body         NVARCHAR(MAX) NOT NULL,
  status       NVARCHAR(20) NOT NULL CHECK (status IN ('draft','published')),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  published_at DATETIME2(0) NULL,
  CONSTRAINT fk_blog_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_blog_author FOREIGN KEY (author_id) REFERENCES dbo.users(id) ON DELETE SET NULL
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[categories]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.categories (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  CONSTRAINT uq_category_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_categories_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tags]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.tags (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  CONSTRAINT uq_tag_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_tags_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[post_tags]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.post_tags (
  post_id      BIGINT NOT NULL,
  tag_id       BIGINT NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES dbo.blog_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_tags_tag FOREIGN KEY (tag_id) REFERENCES dbo.tags(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[comments]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.comments (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  post_id      BIGINT NOT NULL,
  user_id      BIGINT NULL,
  body         NVARCHAR(MAX) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_comments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES dbo.blog_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL
);
END;

-- =====================
-- Chat
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_conversations]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.chat_conversations (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  scope        NVARCHAR(20) NOT NULL CHECK (scope IN ('direct','group','course','module')),
  title        NVARCHAR(255),
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_chat_conv_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_conv_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) ON DELETE SET NULL
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_participants]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.chat_participants (
  conversation_id BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  role         NVARCHAR(20) NULL CHECK (role IN ('owner','member')),
  joined_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_chat_part_conv FOREIGN KEY (conversation_id) REFERENCES dbo.chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_part_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_messages]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.chat_messages (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  sender_id    BIGINT NOT NULL,
  body         NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at   DATETIME2(0) NULL,
  CONSTRAINT fk_chat_msg_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_msg_conv FOREIGN KEY (conversation_id) REFERENCES dbo.chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_msg_sender FOREIGN KEY (sender_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[chat_attachments]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.chat_attachments (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  message_id   BIGINT NOT NULL,
  file_id      BIGINT NOT NULL,
  CONSTRAINT fk_chat_att_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_att_msg FOREIGN KEY (message_id) REFERENCES dbo.chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_att_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id) ON DELETE CASCADE
);
END;

-- =====================
-- Notifications
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notification_templates]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.notification_templates (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  code         NVARCHAR(255) NOT NULL,
  channel      NVARCHAR(20) NOT NULL CHECK (channel IN ('email','whatsapp','sms','push_web','push_mobile')),
  subject      NVARCHAR(255),
  body         NVARCHAR(MAX) NOT NULL,
  CONSTRAINT uq_template_code UNIQUE (tenant_id, code),
  CONSTRAINT fk_notif_templates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notification_preferences]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.notification_preferences (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  email        BIT NOT NULL DEFAULT 1,
  whatsapp     BIT NOT NULL DEFAULT 0,
  sms          BIT NOT NULL DEFAULT 0,
  push_web     BIT NOT NULL DEFAULT 1,
  push_mobile  BIT NOT NULL DEFAULT 1,
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_notif_pref UNIQUE (tenant_id, user_id),
  CONSTRAINT fk_notif_pref_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notifications]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.notifications (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  template_id  BIGINT NULL,
  payload      NVARCHAR(MAX) NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_template FOREIGN KEY (template_id) REFERENCES dbo.notification_templates(id) ON DELETE SET NULL,
  CONSTRAINT chk_notifications_payload_json CHECK (payload IS NULL OR ISJSON(payload) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[notification_deliveries]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.notification_deliveries (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  notification_id BIGINT NOT NULL,
  channel      NVARCHAR(20) NOT NULL CHECK (channel IN ('email','whatsapp','sms','push_web','push_mobile')),
  status       NVARCHAR(20) NOT NULL CHECK (status IN ('queued','sent','failed','opened','clicked')),
  provider_msg_id NVARCHAR(255),
  sent_at      DATETIME2(0) NULL,
  error        NVARCHAR(MAX),
  CONSTRAINT fk_notif_deliv_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_deliv_notif FOREIGN KEY (notification_id) REFERENCES dbo.notifications(id) ON DELETE CASCADE
);
END;

-- =====================
-- Visioconférence
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[live_sessions]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.live_sessions (
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
  CONSTRAINT fk_live_sess_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_sess_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_live_sess_module FOREIGN KEY (module_id) REFERENCES dbo.modules(id) ON DELETE SET NULL,
  CONSTRAINT fk_live_sess_org FOREIGN KEY (organizer_id) REFERENCES dbo.users(id) ON DELETE SET NULL
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[live_participants]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.live_participants (
  session_id   BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  role         NVARCHAR(20) NULL CHECK (role IN ('host','speaker','attendee')),
  joined_at    DATETIME2(0) NULL,
  left_at      DATETIME2(0) NULL,
  PRIMARY KEY (session_id, user_id),
  CONSTRAINT fk_live_part_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_part_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[live_recordings]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.live_recordings (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  session_id   BIGINT NOT NULL,
  file_id      BIGINT NULL,
  duration_sec INT,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_live_rec_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_rec_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_rec_file FOREIGN KEY (file_id) REFERENCES dbo.file_assets(id) ON DELETE SET NULL
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[breakout_rooms]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.breakout_rooms (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  session_id   BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_breakout_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_breakout_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[whiteboards]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.whiteboards (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  session_id   BIGINT NULL,
  data         NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_whiteboards_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_whiteboards_sess FOREIGN KEY (session_id) REFERENCES dbo.live_sessions(id) ON DELETE SET NULL
);
END;

-- =====================
-- IA & Analytics
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ai_generated_contents]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.ai_generated_contents (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  source_type  NVARCHAR(20) NOT NULL CHECK (source_type IN ('course','module','lesson','video','document','chat')),
  source_id    BIGINT NULL,
  kind         NVARCHAR(20) NOT NULL CHECK (kind IN ('summary','quiz','revision_sheet','title','description','transcript')),
  content      NVARCHAR(MAX),
  metadata     NVARCHAR(MAX),
  created_by   BIGINT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_ai_gen_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_gen_user FOREIGN KEY (created_by) REFERENCES dbo.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_ai_metadata_json CHECK (metadata IS NULL OR ISJSON(metadata) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ai_recommendations]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.ai_recommendations (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  recommendation NVARCHAR(MAX) NOT NULL,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_ai_rec_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_rec_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT chk_ai_rec_json CHECK (ISJSON(recommendation) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[learning_analytics]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.learning_analytics (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NULL,
  course_id    BIGINT NULL,
  metric       NVARCHAR(100) NOT NULL,
  value        DECIMAL(18,4),
  context      NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_analytics_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL,
  CONSTRAINT fk_analytics_course FOREIGN KEY (course_id) REFERENCES dbo.courses(id) ON DELETE SET NULL,
  CONSTRAINT chk_analytics_context_json CHECK (context IS NULL OR ISJSON(context) = 1)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[search_index]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.search_index (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  entity       NVARCHAR(50) NOT NULL,
  entity_id    BIGINT NOT NULL,
  text         NVARCHAR(MAX),
  metadata     NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_search_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT chk_search_metadata_json CHECK (metadata IS NULL OR ISJSON(metadata) = 1)
);
END;

-- =====================
-- Intégrations & API
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[webhook_subscriptions]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.webhook_subscriptions (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  url          NVARCHAR(1000) NOT NULL,
  event        NVARCHAR(100) NOT NULL,
  secret       NVARCHAR(255),
  is_active    BIT NOT NULL DEFAULT 1,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_webhook_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[api_keys]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.api_keys (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  name         NVARCHAR(255) NOT NULL,
  [key]        NVARCHAR(255) NOT NULL,
  scopes       NVARCHAR(MAX),
  is_active    BIT NOT NULL DEFAULT 1,
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_api_key UNIQUE ([key]),
  CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT chk_api_scopes_json CHECK (scopes IS NULL OR ISJSON(scopes) = 1)
);
END;

-- =====================
-- Audit & Conformité
-- =====================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[audit_logs]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.audit_logs (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NULL,
  action       NVARCHAR(255) NOT NULL,
  entity       NVARCHAR(100),
  entity_id    BIGINT,
  metadata     NVARCHAR(MAX),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[privacy_consents]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.privacy_consents (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  policy_code  NVARCHAR(100) NOT NULL,
  consented    BIT NOT NULL DEFAULT 1,
  consented_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_privacy UNIQUE (tenant_id, user_id, policy_code),
  CONSTRAINT fk_privacy_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_privacy_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[data_retention_policies]') AND type in (N'U'))
BEGIN
CREATE TABLE dbo.data_retention_policies (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  entity       NVARCHAR(100) NOT NULL,
  retention_days INT NOT NULL CHECK (retention_days > 0),
  created_at   DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_retention_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id) ON DELETE CASCADE
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
