-- GENERATED FILE — full SQL Server schema dumped 1:1 from the live db_eformation
-- database (sys.tables/sys.columns/sys.foreign_keys), not hand-maintained. The
-- previous hand-written version of this file was missing columns/tables that exist
-- live (courses.category/level/duration/category_id, badges.badge_type, etc.) --
-- see the "schema drift" note in HANDOFF.md. SQL Server is currently the fallback
-- DBMS (Postgres is active, see backend/.env DB_CLIENT) but this file is kept in
-- sync so switching back doesn't hit undocumented-schema surprises.
--
-- Some tables the application code references don't exist here (or anywhere) --
-- ai_usage_logs, awarded_badges, blog_categories/blog_tags/blog_post_tags/
-- blog_comments, push_subscriptions, scheduled_reports, search_history,
-- user_devices, user_profiles, webhooks, webhook_deliveries -- those code paths
-- are already broken against the real database today; this file intentionally
-- matches live reality rather than inventing tables for already-broken features.
--
-- Regenerate: node db/scripts/dump_mssql_schema.js <dir> && node db/scripts/gen_mssql_schema.js <dir>

USE [db_eformation];
SET NOCOUNT ON;

IF OBJECT_ID(N'[dbo].[ai_chat_history]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ai_chat_history (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [role]                  NVARCHAR(20) NOT NULL CHECK (([role]='assistant' OR [role]='user')),
  [message]               NVARCHAR(MAX) NOT NULL,
  [context]               NVARCHAR(MAX) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[ai_generated_contents]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ai_generated_contents (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [source_type]           NVARCHAR(20) NOT NULL CHECK (([source_type]='chat' OR [source_type]='document' OR [source_type]='video' OR [source_type]='lesson' OR [source_type]='module' OR [source_type]='course')),
  [source_id]             BIGINT NULL,
  [kind]                  NVARCHAR(20) NOT NULL CHECK (([kind]='transcript' OR [kind]='description' OR [kind]='title' OR [kind]='revision_sheet' OR [kind]='quiz' OR [kind]='summary')),
  [content]               NVARCHAR(MAX) NULL,
  [metadata]              NVARCHAR(MAX) NULL CHECK (([metadata] IS NULL OR isjson([metadata])=(1))),
  [created_by]            BIGINT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[ai_recommendations]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ai_recommendations (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [recommendation]        NVARCHAR(MAX) NOT NULL CHECK ((isjson([recommendation])=(1))),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[ai_usage_logs]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ai_usage_logs (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [feature]               NVARCHAR(50) NOT NULL,
  [prompt_tokens]         INT NOT NULL DEFAULT (0),
  [completion_tokens]     INT NOT NULL DEFAULT (0),
  [model]                 NVARCHAR(50) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[answers]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.answers (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [attempt_id]            BIGINT NOT NULL,
  [question_id]           BIGINT NOT NULL,
  [choice_id]             BIGINT NULL,
  [text_answer]           NVARCHAR(MAX) NULL,
  [is_correct]            BIT NULL,
  [points]                INT NULL DEFAULT (0)
);
END;

IF OBJECT_ID(N'[dbo].[api_keys]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.api_keys (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [key]                   NVARCHAR(255) NOT NULL,
  [scopes]                NVARCHAR(MAX) NULL CHECK (([scopes] IS NULL OR isjson([scopes])=(1))),
  [is_active]             BIT NOT NULL DEFAULT (1),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[assignment_reminders]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.assignment_reminders (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [course_assignment_id]  BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [reminder_type]         NVARCHAR(20) NOT NULL CHECK (([reminder_type]='escalation' OR [reminder_type]='overdue' OR [reminder_type]='urgent' OR [reminder_type]='upcoming')),
  [sent_at]               DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[attempts]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.attempts (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [quiz_id]               BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [started_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [submitted_at]          DATETIME2(0) NULL,
  [score]                 INT NULL,
  [status]                NVARCHAR(20) NOT NULL CHECK (([status]='graded' OR [status]='submitted' OR [status]='in_progress'))
);
END;

IF OBJECT_ID(N'[dbo].[audit_logs]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.audit_logs (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NULL,
  [action]                NVARCHAR(255) NOT NULL,
  [entity]                NVARCHAR(100) NULL,
  [entity_id]             BIGINT NULL,
  [metadata]              NVARCHAR(MAX) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[badges]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.badges (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [code]                  NVARCHAR(100) NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [description]           NVARCHAR(MAX) NULL,
  [icon_file_id]          BIGINT NULL,
  [criteria]              NVARCHAR(MAX) NOT NULL CHECK ((isjson([criteria])=(1))),
  [badge_type]            NVARCHAR(50) NULL
);
END;

IF OBJECT_ID(N'[dbo].[blog_categories]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.blog_categories (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [slug]                  NVARCHAR(255) NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[blog_comments]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.blog_comments (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [post_id]               BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [body]                  NVARCHAR(MAX) NOT NULL,
  [parent_id]             BIGINT NULL,
  [deleted_at]            DATETIME2(0) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[blog_post_tags]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.blog_post_tags (
  [post_id]               BIGINT NOT NULL,
  [tag_id]                BIGINT NOT NULL,
  CONSTRAINT pk_blog_post_tags PRIMARY KEY ([post_id], [tag_id])
);
END;

IF OBJECT_ID(N'[dbo].[blog_posts]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.blog_posts (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [author_id]             BIGINT NULL,
  [title]                 NVARCHAR(500) NOT NULL,
  [body]                  NVARCHAR(MAX) NOT NULL,
  [status]                NVARCHAR(20) NOT NULL CHECK (([status]='published' OR [status]='draft')),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [published_at]          DATETIME2(0) NULL,
  [category_id]           BIGINT NULL,
  [slug]                  NVARCHAR(255) NULL,
  [featured_image_id]     BIGINT NULL,
  [view_count]            INT NOT NULL DEFAULT (0),
  [updated_at]            DATETIME2(0) NULL
);
END;

IF OBJECT_ID(N'[dbo].[blog_tags]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.blog_tags (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [slug]                  NVARCHAR(255) NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[breakout_rooms]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.breakout_rooms (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [session_id]            BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[categories]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.categories (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[certificate_templates]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.certificate_templates (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(100) NOT NULL,
  [description]           NVARCHAR(500) NULL,
  [template_html]         NVARCHAR(MAX) NULL,
  [background_file_id]    BIGINT NULL,
  [is_default]            BIT NULL DEFAULT (0),
  [created_at]            DATETIME2(0) NULL DEFAULT (getdate())
);
END;

IF OBJECT_ID(N'[dbo].[certificates]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.certificates (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [course_id]             BIGINT NOT NULL,
  [serial]                NVARCHAR(255) NOT NULL,
  [issued_at]             DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [pdf_file_id]           BIGINT NULL,
  [validity_months]       INT NULL,
  [expires_at]            DATETIME2(0) NULL,
  [renewal_reminder_sent_at] DATETIME2(0) NULL,
  [template_id]           BIGINT NULL,
  [revoked_at]            DATETIME2(0) NULL,
  [revoked_by]            BIGINT NULL
);
END;

IF OBJECT_ID(N'[dbo].[chat_attachments]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.chat_attachments (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [message_id]            BIGINT NOT NULL,
  [file_id]               BIGINT NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[chat_conversations]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.chat_conversations (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [scope]                 NVARCHAR(20) NOT NULL CHECK (([scope]='module' OR [scope]='course' OR [scope]='group' OR [scope]='direct')),
  [title]                 NVARCHAR(255) NULL,
  [created_by]            BIGINT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[chat_messages]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.chat_messages (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [conversation_id]       BIGINT NOT NULL,
  [sender_id]             BIGINT NOT NULL,
  [body]                  NVARCHAR(MAX) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [deleted_at]            DATETIME2(0) NULL
);
END;

IF OBJECT_ID(N'[dbo].[chat_participants]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.chat_participants (
  [conversation_id]       BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [role]                  NVARCHAR(20) NULL CHECK (([role]='member' OR [role]='owner')),
  [joined_at]             DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  CONSTRAINT pk_chat_participants PRIMARY KEY ([conversation_id], [user_id])
);
END;

IF OBJECT_ID(N'[dbo].[choices]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.choices (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [question_id]           BIGINT NOT NULL,
  [label]                 NVARCHAR(MAX) NOT NULL,
  [is_correct]            BIT NOT NULL DEFAULT (0),
  [position]              INT NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[comments]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.comments (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [post_id]               BIGINT NOT NULL,
  [user_id]               BIGINT NULL,
  [body]                  NVARCHAR(MAX) NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[contents]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.contents (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [lesson_id]             BIGINT NOT NULL,
  [type]                  NVARCHAR(20) NOT NULL CHECK (([type]='text' OR [type]='youtube_link' OR [type]='video_mp4' OR [type]='image' OR [type]='docx' OR [type]='pdf')),
  [title]                 NVARCHAR(255) NOT NULL,
  [body]                  NVARCHAR(MAX) NULL,
  [file_id]               BIGINT NULL,
  [url]                   NVARCHAR(1000) NULL,
  [position]              INT NOT NULL DEFAULT (1),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[course_assignments]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.course_assignments (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [course_id]             BIGINT NOT NULL,
  [assignment_type]       NVARCHAR(20) NOT NULL CHECK (([assignment_type]='role' OR [assignment_type]='service' OR [assignment_type]='direction' OR [assignment_type]='enterprise' OR [assignment_type]='user')),
  [target_id]             BIGINT NULL,
  [target_role]           NVARCHAR(20) NULL,
  [is_mandatory]          BIT NOT NULL DEFAULT (0),
  [due_date]              DATETIME2(0) NULL,
  [assigned_by]           BIGINT NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[course_evaluations]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.course_evaluations (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [course_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [rating]                INT NOT NULL CHECK (([rating]>=(1) AND [rating]<=(5))),
  [comment]               NVARCHAR(MAX) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[courses]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.courses (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [title]                 NVARCHAR(255) NOT NULL,
  [description]           NVARCHAR(MAX) NULL,
  [audience_scope]        NVARCHAR(MAX) NULL CHECK (([audience_scope] IS NULL OR isjson([audience_scope])=(1))),
  [prerequisites]         NVARCHAR(MAX) NULL CHECK (([prerequisites] IS NULL OR isjson([prerequisites])=(1))),
  [is_published]          BIT NOT NULL DEFAULT (0),
  [created_by]            BIGINT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [category]              NVARCHAR(50) NULL,
  [level]                 NVARCHAR(20) NULL DEFAULT ('beginner'),
  [duration]              INT NULL,
  [category_id]           BIGINT NULL
);
END;

IF OBJECT_ID(N'[dbo].[data_retention_policies]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.data_retention_policies (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [entity]                NVARCHAR(100) NOT NULL,
  [retention_days]        INT NOT NULL CHECK (([retention_days]>(0))),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[directions]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.directions (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [enterprise_id]         BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [code]                  NVARCHAR(100) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[email_settings]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.email_settings (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [enabled]               BIT NOT NULL DEFAULT (0),
  [smtp_host]             NVARCHAR(255) NULL,
  [smtp_port]             INT NOT NULL DEFAULT (587),
  [smtp_secure]           BIT NOT NULL DEFAULT (0),
  [smtp_user]             NVARCHAR(255) NULL,
  [smtp_password]         NVARCHAR(500) NULL,
  [from_email]            NVARCHAR(255) NULL,
  [from_name]             NVARCHAR(255) NULL,
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[livekit_settings]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.livekit_settings (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [enabled]               BIT NOT NULL DEFAULT (0),
  [url]                   NVARCHAR(500) NULL,
  [api_key]               NVARCHAR(255) NULL,
  [api_secret]            NVARCHAR(500) NULL,
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[enrollments]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.enrollments (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [course_id]             BIGINT NOT NULL,
  [enrolled_at]           DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [progress_percent]      INT NULL DEFAULT (0),
  [completed_at]          DATETIME2(0) NULL
);
END;

IF OBJECT_ID(N'[dbo].[enterprises]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.enterprises (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [code]                  NVARCHAR(100) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[file_assets]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.file_assets (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [filename]              NVARCHAR(255) NOT NULL,
  [mime_type]             NVARCHAR(100) NOT NULL,
  [storage_key]           NVARCHAR(512) NOT NULL,
  [size_bytes]            BIGINT NULL,
  [checksum]              NVARCHAR(255) NULL,
  [created_by]            BIGINT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[inactivity_policies]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.inactivity_policies (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [role]                  NVARCHAR(20) NOT NULL,
  [max_inactive_days]     INT NOT NULL,
  [updated_by]            BIGINT NULL,
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[learning_analytics]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.learning_analytics (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NULL,
  [course_id]             BIGINT NULL,
  [metric]                NVARCHAR(100) NOT NULL,
  [value]                 DECIMAL(18,4) NULL,
  [context]               NVARCHAR(MAX) NULL CHECK (([context] IS NULL OR isjson([context])=(1))),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[lesson_progress]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.lesson_progress (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [lesson_id]             BIGINT NOT NULL,
  [course_id]             BIGINT NOT NULL,
  [status]                NVARCHAR(20) NULL DEFAULT ('not_started'),
  [progress_percent]      INT NULL DEFAULT (0),
  [started_at]            DATETIME2(0) NULL,
  [last_accessed_at]      DATETIME2(0) NULL,
  [completed_at]          DATETIME2(0) NULL,
  [time_spent_seconds]    INT NULL DEFAULT (0)
);
END;

IF OBJECT_ID(N'[dbo].[lessons]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.lessons (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [module_id]             BIGINT NOT NULL,
  [title]                 NVARCHAR(255) NOT NULL,
  [position]              INT NOT NULL,
  [duration_min]          INT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [type]                  NVARCHAR(50) NULL
);
END;

IF OBJECT_ID(N'[dbo].[live_participants]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.live_participants (
  [session_id]            BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [role]                  NVARCHAR(20) NULL CHECK (([role]='attendee' OR [role]='speaker' OR [role]='host')),
  [joined_at]             DATETIME2(0) NULL,
  [left_at]               DATETIME2(0) NULL,
  CONSTRAINT pk_live_participants PRIMARY KEY ([session_id], [user_id])
);
END;

IF OBJECT_ID(N'[dbo].[live_recordings]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.live_recordings (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [session_id]            BIGINT NOT NULL,
  [file_id]               BIGINT NULL,
  [duration_sec]          INT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[live_sessions]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.live_sessions (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [course_id]             BIGINT NULL,
  [module_id]             BIGINT NULL,
  [title]                 NVARCHAR(255) NOT NULL,
  [status]                NVARCHAR(20) NOT NULL CHECK (([status]='canceled' OR [status]='ended' OR [status]='live' OR [status]='scheduled')),
  [scheduled_at]          DATETIME2(0) NULL,
  [started_at]            DATETIME2(0) NULL,
  [ended_at]              DATETIME2(0) NULL,
  [organizer_id]          BIGINT NULL,
  [meeting_provider]      NVARCHAR(20) NULL CHECK (([meeting_provider]='meet' OR [meeting_provider]='teams' OR [meeting_provider]='zoom' OR [meeting_provider]='webrtc')),
  [meeting_link]          NVARCHAR(1000) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [description]           NVARCHAR(MAX) NULL,
  [duration]              INT NULL,
  [max_participants]      INT NULL
);
END;

IF OBJECT_ID(N'[dbo].[modules]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.modules (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [course_id]             BIGINT NOT NULL,
  [title]                 NVARCHAR(255) NOT NULL,
  [position]              INT NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[notification_deliveries]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.notification_deliveries (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [notification_id]       BIGINT NOT NULL,
  [channel]               NVARCHAR(20) NOT NULL CHECK (([channel]='push_mobile' OR [channel]='push_web' OR [channel]='sms' OR [channel]='whatsapp' OR [channel]='email')),
  [status]                NVARCHAR(20) NOT NULL CHECK (([status]='clicked' OR [status]='opened' OR [status]='failed' OR [status]='sent' OR [status]='queued')),
  [provider_msg_id]       NVARCHAR(255) NULL,
  [sent_at]               DATETIME2(0) NULL,
  [error]                 NVARCHAR(MAX) NULL
);
END;

IF OBJECT_ID(N'[dbo].[notification_preferences]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.notification_preferences (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [email]                 BIT NOT NULL DEFAULT (1),
  [whatsapp]              BIT NOT NULL DEFAULT (0),
  [sms]                   BIT NOT NULL DEFAULT (0),
  [push_web]              BIT NOT NULL DEFAULT (1),
  [push_mobile]           BIT NOT NULL DEFAULT (1),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[notification_templates]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.notification_templates (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [code]                  NVARCHAR(255) NOT NULL,
  [channel]               NVARCHAR(20) NOT NULL CHECK (([channel]='push_mobile' OR [channel]='push_web' OR [channel]='sms' OR [channel]='whatsapp' OR [channel]='email')),
  [subject]               NVARCHAR(255) NULL,
  [body]                  NVARCHAR(MAX) NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[notifications]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.notifications (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [template_id]           BIGINT NULL,
  [payload]               NVARCHAR(MAX) NULL CHECK (([payload] IS NULL OR isjson([payload])=(1))),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [channel]               NVARCHAR(20) NULL,
  [subject]               NVARCHAR(500) NULL,
  [body]                  NVARCHAR(MAX) NULL,
  [action_url]            NVARCHAR(1000) NULL,
  [metadata]              NVARCHAR(MAX) NULL,
  [read_at]               DATETIME2(0) NULL,
  [sent_at]               DATETIME2(0) NULL,
  [external_id]           NVARCHAR(255) NULL,
  [failed_at]             DATETIME2(0) NULL,
  [error_message]         NVARCHAR(MAX) NULL
);
END;

IF OBJECT_ID(N'[dbo].[post_tags]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.post_tags (
  [post_id]               BIGINT NOT NULL,
  [tag_id]                BIGINT NOT NULL,
  CONSTRAINT pk_post_tags PRIMARY KEY ([post_id], [tag_id])
);
END;

IF OBJECT_ID(N'[dbo].[privacy_consents]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.privacy_consents (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [policy_code]           NVARCHAR(100) NOT NULL,
  [consented]             BIT NOT NULL DEFAULT (1),
  [consented_at]          DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[push_subscriptions]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.push_subscriptions (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [endpoint]              NVARCHAR(1000) NOT NULL,
  [p256dh]                NVARCHAR(255) NOT NULL,
  [auth]                  NVARCHAR(255) NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NULL
);
END;

IF OBJECT_ID(N'[dbo].[questions]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.questions (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [quiz_id]               BIGINT NOT NULL,
  [type]                  NVARCHAR(20) NOT NULL CHECK (([type]='essay' OR [type]='short_text' OR [type]='true_false' OR [type]='mcq')),
  [prompt]                NVARCHAR(MAX) NOT NULL,
  [position]              INT NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [points]                INT NOT NULL DEFAULT (1)
);
END;

IF OBJECT_ID(N'[dbo].[quiz_answers]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.quiz_answers (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [attempt_id]            BIGINT NOT NULL,
  [question_id]           BIGINT NOT NULL,
  [choice_id]             BIGINT NULL,
  [text_answer]           NVARCHAR(MAX) NULL,
  [is_correct]            BIT NULL DEFAULT (0),
  [created_at]            DATETIME2(0) NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[quiz_attempts]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.quiz_attempts (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [quiz_id]               BIGINT NOT NULL,
  [score]                 INT NULL DEFAULT (0),
  [passed]                BIT NULL DEFAULT (0),
  [started_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [completed_at]          DATETIME2(0) NULL,
  [time_spent]            INT NULL DEFAULT (0),
  [question_ids]          NVARCHAR(MAX) NULL
);
END;

IF OBJECT_ID(N'[dbo].[quizzes]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.quizzes (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [lesson_id]             BIGINT NOT NULL,
  [title]                 NVARCHAR(255) NOT NULL,
  [passing_score]         INT NOT NULL DEFAULT (70),
  [randomized]            BIT NOT NULL DEFAULT (0),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [time_limit_minutes]    INT NULL,
  [max_attempts]          INT NULL DEFAULT (3),
  [expires_at]            DATETIME2(0) NULL,
  [badge_id]              BIGINT NULL,
  [certificate_enabled]   BIT NULL DEFAULT (0),
  [show_correct_answers]  BIT NULL DEFAULT (1),
  [shuffle_choices]       BIT NULL DEFAULT (0),
  [description]           NVARCHAR(500) NULL,
  [instructions]          NVARCHAR(1000) NULL,
  [questions_to_draw]     INT NULL
);
END;

IF OBJECT_ID(N'[dbo].[scheduled_reports]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.scheduled_reports (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [report_type]           NVARCHAR(50) NOT NULL,
  [frequency]             NVARCHAR(20) NOT NULL CHECK (([frequency]='monthly' OR [frequency]='weekly' OR [frequency]='daily')),
  [format]                NVARCHAR(20) NOT NULL CHECK (([format]='pdf' OR [format]='excel' OR [format]='csv')),
  [recipients]            NVARCHAR(MAX) NOT NULL CHECK ((isjson([recipients])=(1))),
  [filters]               NVARCHAR(MAX) NULL CHECK (([filters] IS NULL OR isjson([filters])=(1))),
  [created_by]            BIGINT NOT NULL,
  [is_active]             BIT NOT NULL DEFAULT (1),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[search_history]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.search_history (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [query]                 NVARCHAR(500) NOT NULL,
  [result_count]          INT NOT NULL DEFAULT (0),
  [searched_at]           DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[search_index]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.search_index (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [entity]                NVARCHAR(50) NOT NULL,
  [entity_id]             BIGINT NOT NULL,
  [text]                  NVARCHAR(MAX) NULL,
  [metadata]              NVARCHAR(MAX) NULL CHECK (([metadata] IS NULL OR isjson([metadata])=(1))),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[services]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.services (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [direction_id]          BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [code]                  NVARCHAR(100) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[sso_identities]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.sso_identities (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [provider]              NVARCHAR(20) NOT NULL CHECK (([provider]='saml' OR [provider]='google' OR [provider]='azure_ad')),
  [external_id]           NVARCHAR(255) NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[tags]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.tags (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL
);
END;

IF OBJECT_ID(N'[dbo].[team_report_subscriptions]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.team_report_subscriptions (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [is_enabled]            BIT NOT NULL DEFAULT (1),
  [frequency]             NVARCHAR(10) NOT NULL DEFAULT ('weekly') CHECK (([frequency]='weekly' OR [frequency]='daily')),
  [weekday]               TINYINT NULL,
  [channel_email]         BIT NOT NULL DEFAULT (1),
  [channel_in_app]        BIT NOT NULL DEFAULT (1),
  [last_sent_at]          DATETIME2(0) NULL,
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[tenant_settings]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.tenant_settings (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [description]           NVARCHAR(MAX) NULL,
  [logo_url]              NVARCHAR(500) NULL,
  [primary_color]         NVARCHAR(20) NOT NULL DEFAULT ('#3B82F6'),
  [secondary_color]       NVARCHAR(20) NOT NULL DEFAULT ('#10B981'),
  [contact_email]         NVARCHAR(255) NULL,
  [contact_phone]         NVARCHAR(50) NULL,
  [address]               NVARCHAR(500) NULL,
  [website]               NVARCHAR(255) NULL,
  [allow_self_registration] BIT NOT NULL DEFAULT (1),
  [default_language]      NVARCHAR(10) NOT NULL DEFAULT ('fr'),
  [timezone]              NVARCHAR(100) NOT NULL DEFAULT ('Europe/Paris'),
  [enable_notifications]  BIT NOT NULL DEFAULT (1),
  [enable_chat]           BIT NOT NULL DEFAULT (1),
  [enable_live_sessions]  BIT NOT NULL DEFAULT (1),
  [max_users_per_group]   INT NOT NULL DEFAULT (50),
  [certificate_validity]  INT NOT NULL DEFAULT (365),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[tenants]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.tenants (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [name]                  NVARCHAR(255) NOT NULL,
  [slug]                  NVARCHAR(255) NOT NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[user_badges]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.user_badges (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [user_id]               BIGINT NOT NULL,
  [badge_id]              BIGINT NOT NULL,
  [awarded_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [quiz_id]               BIGINT NULL,
  [course_id]             BIGINT NULL,
  [score]                 INT NULL
);
END;

IF OBJECT_ID(N'[dbo].[user_devices]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.user_devices (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [user_id]               BIGINT NOT NULL,
  [fcm_token]             NVARCHAR(500) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[user_profiles]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.user_profiles (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [user_id]               BIGINT NOT NULL,
  [interests]             NVARCHAR(MAX) NULL,
  [learning_goals]        NVARCHAR(MAX) NULL
);
END;

IF OBJECT_ID(N'[dbo].[users]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.users (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [enterprise_id]         BIGINT NULL,
  [direction_id]          BIGINT NULL,
  [service_id]            BIGINT NULL,
  [email]                 NVARCHAR(255) NOT NULL,
  [username]              NVARCHAR(255) NULL,
  [password_hash]         NVARCHAR(MAX) NOT NULL,
  [display_name]          NVARCHAR(255) NOT NULL,
  [role]                  NVARCHAR(20) NOT NULL CHECK (([role]='stagiaire' OR [role]='externe' OR [role]='agent' OR [role]='supervisor' OR [role]='manager' OR [role]='director' OR [role]='admin' OR [role]='super_admin')),
  [is_active]             BIT NOT NULL DEFAULT (1),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [deleted_at]            DATETIME2(0) NULL,
  [avatar_url]            NVARCHAR(500) NULL,
  [supervisor_id]         BIGINT NULL,
  [status]                NVARCHAR(20) NOT NULL DEFAULT ('active') CHECK (([status]='deactivated' OR [status]='suspended' OR [status]='active' OR [status]='pending')),
  [last_login_at]         DATETIME2(0) NULL,
  [phone]                 NVARCHAR(50) NULL
);
END;

IF OBJECT_ID(N'[dbo].[webhook_deliveries]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.webhook_deliveries (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [webhook_id]            BIGINT NOT NULL,
  [event]                 NVARCHAR(100) NOT NULL,
  [payload]               NVARCHAR(MAX) NOT NULL,
  [response_status]       INT NULL,
  [response_body]         NVARCHAR(1000) NULL,
  [response_time_ms]      INT NULL,
  [success]               BIT NOT NULL,
  [error_message]         NVARCHAR(1000) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[webhook_subscriptions]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.webhook_subscriptions (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [url]                   NVARCHAR(1000) NOT NULL,
  [event]                 NVARCHAR(100) NOT NULL,
  [secret]                NVARCHAR(255) NULL,
  [is_active]             BIT NOT NULL DEFAULT (1),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

IF OBJECT_ID(N'[dbo].[webhooks]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.webhooks (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [name]                  NVARCHAR(255) NOT NULL,
  [url]                   NVARCHAR(1000) NOT NULL,
  [events]                NVARCHAR(MAX) NOT NULL CHECK ((isjson([events])=(1))),
  [secret]                NVARCHAR(255) NOT NULL,
  [headers]               NVARCHAR(MAX) NULL CHECK (([headers] IS NULL OR isjson([headers])=(1))),
  [created_by]            BIGINT NOT NULL,
  [is_active]             BIT NOT NULL DEFAULT (1),
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NULL,
  [last_triggered_at]     DATETIME2(0) NULL
);
END;

IF OBJECT_ID(N'[dbo].[whiteboards]', N'U') IS NULL
BEGIN
CREATE TABLE dbo.whiteboards (
  [id]                    BIGINT IDENTITY(1,1) PRIMARY KEY,
  [tenant_id]             BIGINT NOT NULL,
  [session_id]            BIGINT NULL,
  [data]                  NVARCHAR(MAX) NULL,
  [created_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime()),
  [updated_at]            DATETIME2(0) NOT NULL DEFAULT (sysutcdatetime())
);
END;

-- Unique constraints
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_api_key' AND object_id = OBJECT_ID(N'[dbo].[api_keys]'))
  ALTER TABLE dbo.api_keys ADD CONSTRAINT uq_api_key UNIQUE ([key]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_assignment_reminder' AND object_id = OBJECT_ID(N'[dbo].[assignment_reminders]'))
  ALTER TABLE dbo.assignment_reminders ADD CONSTRAINT uq_assignment_reminder UNIQUE ([course_assignment_id], [user_id], [reminder_type]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__badges__357D4CF96D52398F' AND object_id = OBJECT_ID(N'[dbo].[badges]'))
  ALTER TABLE dbo.badges ADD CONSTRAINT UQ__badges__357D4CF96D52398F UNIQUE ([code]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_blog_categories_tenant_slug' AND object_id = OBJECT_ID(N'[dbo].[blog_categories]'))
  ALTER TABLE dbo.blog_categories ADD CONSTRAINT uq_blog_categories_tenant_slug UNIQUE ([tenant_id], [slug]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_blog_tags_tenant_slug' AND object_id = OBJECT_ID(N'[dbo].[blog_tags]'))
  ALTER TABLE dbo.blog_tags ADD CONSTRAINT uq_blog_tags_tenant_slug UNIQUE ([tenant_id], [slug]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_category_name' AND object_id = OBJECT_ID(N'[dbo].[categories]'))
  ALTER TABLE dbo.categories ADD CONSTRAINT uq_category_name UNIQUE ([tenant_id], [name]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__certific__61787229C0EA02EE' AND object_id = OBJECT_ID(N'[dbo].[certificates]'))
  ALTER TABLE dbo.certificates ADD CONSTRAINT UQ__certific__61787229C0EA02EE UNIQUE ([serial]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_course_eval' AND object_id = OBJECT_ID(N'[dbo].[course_evaluations]'))
  ALTER TABLE dbo.course_evaluations ADD CONSTRAINT uq_course_eval UNIQUE ([tenant_id], [course_id], [user_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__email_se__D6F29F3F469BE66D' AND object_id = OBJECT_ID(N'[dbo].[email_settings]'))
  ALTER TABLE dbo.email_settings ADD CONSTRAINT UQ__email_se__D6F29F3F469BE66D UNIQUE ([tenant_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_livekit_settings_tenant' AND object_id = OBJECT_ID(N'[dbo].[livekit_settings]'))
  ALTER TABLE dbo.livekit_settings ADD CONSTRAINT uq_livekit_settings_tenant UNIQUE ([tenant_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_enrollment' AND object_id = OBJECT_ID(N'[dbo].[enrollments]'))
  ALTER TABLE dbo.enrollments ADD CONSTRAINT uq_enrollment UNIQUE ([user_id], [course_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__enterpri__357D4CF94A2DB61D' AND object_id = OBJECT_ID(N'[dbo].[enterprises]'))
  ALTER TABLE dbo.enterprises ADD CONSTRAINT UQ__enterpri__357D4CF94A2DB61D UNIQUE ([code]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_inactivity_policies_tenant_role' AND object_id = OBJECT_ID(N'[dbo].[inactivity_policies]'))
  ALTER TABLE dbo.inactivity_policies ADD CONSTRAINT uq_inactivity_policies_tenant_role UNIQUE ([tenant_id], [role]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_lesson_progress' AND object_id = OBJECT_ID(N'[dbo].[lesson_progress]'))
  ALTER TABLE dbo.lesson_progress ADD CONSTRAINT UQ_lesson_progress UNIQUE ([tenant_id], [user_id], [lesson_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_notif_pref' AND object_id = OBJECT_ID(N'[dbo].[notification_preferences]'))
  ALTER TABLE dbo.notification_preferences ADD CONSTRAINT uq_notif_pref UNIQUE ([tenant_id], [user_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_template_code' AND object_id = OBJECT_ID(N'[dbo].[notification_templates]'))
  ALTER TABLE dbo.notification_templates ADD CONSTRAINT uq_template_code UNIQUE ([tenant_id], [code]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_privacy' AND object_id = OBJECT_ID(N'[dbo].[privacy_consents]'))
  ALTER TABLE dbo.privacy_consents ADD CONSTRAINT uq_privacy UNIQUE ([tenant_id], [user_id], [policy_code]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_sso' AND object_id = OBJECT_ID(N'[dbo].[sso_identities]'))
  ALTER TABLE dbo.sso_identities ADD CONSTRAINT uq_sso UNIQUE ([tenant_id], [provider], [external_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_tag_name' AND object_id = OBJECT_ID(N'[dbo].[tags]'))
  ALTER TABLE dbo.tags ADD CONSTRAINT uq_tag_name UNIQUE ([tenant_id], [name]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_team_report_sub_user' AND object_id = OBJECT_ID(N'[dbo].[team_report_subscriptions]'))
  ALTER TABLE dbo.team_report_subscriptions ADD CONSTRAINT uq_team_report_sub_user UNIQUE ([tenant_id], [user_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__tenant_s__D6F29F3FA4193B2B' AND object_id = OBJECT_ID(N'[dbo].[tenant_settings]'))
  ALTER TABLE dbo.tenant_settings ADD CONSTRAINT UQ__tenant_s__D6F29F3FA4193B2B UNIQUE ([tenant_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__tenants__32DD1E4CDE6EF953' AND object_id = OBJECT_ID(N'[dbo].[tenants]'))
  ALTER TABLE dbo.tenants ADD CONSTRAINT UQ__tenants__32DD1E4CDE6EF953 UNIQUE ([slug]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__tenants__72E12F1B2648929A' AND object_id = OBJECT_ID(N'[dbo].[tenants]'))
  ALTER TABLE dbo.tenants ADD CONSTRAINT UQ__tenants__72E12F1B2648929A UNIQUE ([name]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_user_badges_course' AND object_id = OBJECT_ID(N'[dbo].[user_badges]'))
  ALTER TABLE dbo.user_badges ADD CONSTRAINT UQ_user_badges_course UNIQUE ([tenant_id], [user_id], [badge_id], [course_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_user_badges_quiz' AND object_id = OBJECT_ID(N'[dbo].[user_badges]'))
  ALTER TABLE dbo.user_badges ADD CONSTRAINT UQ_user_badges_quiz UNIQUE ([tenant_id], [user_id], [badge_id], [quiz_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_user_badge' AND object_id = OBJECT_ID(N'[dbo].[user_badges]'))
  ALTER TABLE dbo.user_badges ADD CONSTRAINT uq_user_badge UNIQUE ([tenant_id], [user_id], [badge_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_user_profiles_user' AND object_id = OBJECT_ID(N'[dbo].[user_profiles]'))
  ALTER TABLE dbo.user_profiles ADD CONSTRAINT uq_user_profiles_user UNIQUE ([user_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__users__AB6E616433F29DE1' AND object_id = OBJECT_ID(N'[dbo].[users]'))
  ALTER TABLE dbo.users ADD CONSTRAINT UQ__users__AB6E616433F29DE1 UNIQUE ([email]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ__users__F3DBC572B3F5EB8D' AND object_id = OBJECT_ID(N'[dbo].[users]'))
  ALTER TABLE dbo.users ADD CONSTRAINT UQ__users__F3DBC572B3F5EB8D UNIQUE ([username]);

-- Foreign keys
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK__enrollmen__cours__0BE6BFCF')
  ALTER TABLE dbo.enrollments ADD CONSTRAINT FK__enrollmen__cours__0BE6BFCF FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK__enrollmen__user___0AF29B96')
  ALTER TABLE dbo.enrollments ADD CONSTRAINT FK__enrollmen__user___0AF29B96 FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK__quiz_atte__user___10AB74EC')
  ALTER TABLE dbo.quiz_attempts ADD CONSTRAINT FK__quiz_atte__user___10AB74EC FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_chat_tenant')
  ALTER TABLE dbo.ai_chat_history ADD CONSTRAINT fk_ai_chat_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_chat_user')
  ALTER TABLE dbo.ai_chat_history ADD CONSTRAINT fk_ai_chat_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_gen_tenant')
  ALTER TABLE dbo.ai_generated_contents ADD CONSTRAINT fk_ai_gen_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_gen_user')
  ALTER TABLE dbo.ai_generated_contents ADD CONSTRAINT fk_ai_gen_user FOREIGN KEY ([created_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_rec_tenant')
  ALTER TABLE dbo.ai_recommendations ADD CONSTRAINT fk_ai_rec_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_rec_user')
  ALTER TABLE dbo.ai_recommendations ADD CONSTRAINT fk_ai_rec_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_usage_logs_tenant')
  ALTER TABLE dbo.ai_usage_logs ADD CONSTRAINT fk_ai_usage_logs_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_ai_usage_logs_user')
  ALTER TABLE dbo.ai_usage_logs ADD CONSTRAINT fk_ai_usage_logs_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_analytics_course')
  ALTER TABLE dbo.learning_analytics ADD CONSTRAINT fk_analytics_course FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_analytics_tenant')
  ALTER TABLE dbo.learning_analytics ADD CONSTRAINT fk_analytics_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_analytics_user')
  ALTER TABLE dbo.learning_analytics ADD CONSTRAINT fk_analytics_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_answers_attempt')
  ALTER TABLE dbo.answers ADD CONSTRAINT fk_answers_attempt FOREIGN KEY ([attempt_id]) REFERENCES dbo.attempts ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_answers_choice')
  ALTER TABLE dbo.answers ADD CONSTRAINT fk_answers_choice FOREIGN KEY ([choice_id]) REFERENCES dbo.choices ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_answers_question')
  ALTER TABLE dbo.answers ADD CONSTRAINT fk_answers_question FOREIGN KEY ([question_id]) REFERENCES dbo.questions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_answers_tenant')
  ALTER TABLE dbo.answers ADD CONSTRAINT fk_answers_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_api_keys_tenant')
  ALTER TABLE dbo.api_keys ADD CONSTRAINT fk_api_keys_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_assignment_reminders_tenant')
  ALTER TABLE dbo.assignment_reminders ADD CONSTRAINT fk_assignment_reminders_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_assignment_reminders_user')
  ALTER TABLE dbo.assignment_reminders ADD CONSTRAINT fk_assignment_reminders_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_assignments_course')
  ALTER TABLE dbo.course_assignments ADD CONSTRAINT fk_assignments_course FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_assignments_tenant')
  ALTER TABLE dbo.course_assignments ADD CONSTRAINT fk_assignments_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_assignments_user')
  ALTER TABLE dbo.course_assignments ADD CONSTRAINT fk_assignments_user FOREIGN KEY ([assigned_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_attempts_quiz')
  ALTER TABLE dbo.attempts ADD CONSTRAINT fk_attempts_quiz FOREIGN KEY ([quiz_id]) REFERENCES dbo.quizzes ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_attempts_tenant')
  ALTER TABLE dbo.attempts ADD CONSTRAINT fk_attempts_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_attempts_user')
  ALTER TABLE dbo.attempts ADD CONSTRAINT fk_attempts_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_audit_tenant')
  ALTER TABLE dbo.audit_logs ADD CONSTRAINT fk_audit_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_audit_user')
  ALTER TABLE dbo.audit_logs ADD CONSTRAINT fk_audit_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_badges_icon')
  ALTER TABLE dbo.badges ADD CONSTRAINT fk_badges_icon FOREIGN KEY ([icon_file_id]) REFERENCES dbo.file_assets ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_badges_tenant')
  ALTER TABLE dbo.badges ADD CONSTRAINT fk_badges_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_author')
  ALTER TABLE dbo.blog_posts ADD CONSTRAINT fk_blog_author FOREIGN KEY ([author_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_categories_tenant')
  ALTER TABLE dbo.blog_categories ADD CONSTRAINT fk_blog_categories_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_comments_parent')
  ALTER TABLE dbo.blog_comments ADD CONSTRAINT fk_blog_comments_parent FOREIGN KEY ([parent_id]) REFERENCES dbo.blog_comments ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_comments_post')
  ALTER TABLE dbo.blog_comments ADD CONSTRAINT fk_blog_comments_post FOREIGN KEY ([post_id]) REFERENCES dbo.blog_posts ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_comments_tenant')
  ALTER TABLE dbo.blog_comments ADD CONSTRAINT fk_blog_comments_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_comments_user')
  ALTER TABLE dbo.blog_comments ADD CONSTRAINT fk_blog_comments_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_post_tags_post')
  ALTER TABLE dbo.blog_post_tags ADD CONSTRAINT fk_blog_post_tags_post FOREIGN KEY ([post_id]) REFERENCES dbo.blog_posts ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_post_tags_tag')
  ALTER TABLE dbo.blog_post_tags ADD CONSTRAINT fk_blog_post_tags_tag FOREIGN KEY ([tag_id]) REFERENCES dbo.blog_tags ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_posts_category')
  ALTER TABLE dbo.blog_posts ADD CONSTRAINT fk_blog_posts_category FOREIGN KEY ([category_id]) REFERENCES dbo.blog_categories ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_posts_featured_image')
  ALTER TABLE dbo.blog_posts ADD CONSTRAINT fk_blog_posts_featured_image FOREIGN KEY ([featured_image_id]) REFERENCES dbo.file_assets ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_tags_tenant')
  ALTER TABLE dbo.blog_tags ADD CONSTRAINT fk_blog_tags_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_blog_tenant')
  ALTER TABLE dbo.blog_posts ADD CONSTRAINT fk_blog_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_breakout_sess')
  ALTER TABLE dbo.breakout_rooms ADD CONSTRAINT fk_breakout_sess FOREIGN KEY ([session_id]) REFERENCES dbo.live_sessions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_breakout_tenant')
  ALTER TABLE dbo.breakout_rooms ADD CONSTRAINT fk_breakout_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_categories_tenant')
  ALTER TABLE dbo.categories ADD CONSTRAINT fk_categories_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_certificates_course')
  ALTER TABLE dbo.certificates ADD CONSTRAINT fk_certificates_course FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_certificates_file')
  ALTER TABLE dbo.certificates ADD CONSTRAINT fk_certificates_file FOREIGN KEY ([pdf_file_id]) REFERENCES dbo.file_assets ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_certificates_tenant')
  ALTER TABLE dbo.certificates ADD CONSTRAINT fk_certificates_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_certificates_user')
  ALTER TABLE dbo.certificates ADD CONSTRAINT fk_certificates_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_att_file')
  ALTER TABLE dbo.chat_attachments ADD CONSTRAINT fk_chat_att_file FOREIGN KEY ([file_id]) REFERENCES dbo.file_assets ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_att_msg')
  ALTER TABLE dbo.chat_attachments ADD CONSTRAINT fk_chat_att_msg FOREIGN KEY ([message_id]) REFERENCES dbo.chat_messages ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_att_tenant')
  ALTER TABLE dbo.chat_attachments ADD CONSTRAINT fk_chat_att_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_conv_tenant')
  ALTER TABLE dbo.chat_conversations ADD CONSTRAINT fk_chat_conv_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_conv_user')
  ALTER TABLE dbo.chat_conversations ADD CONSTRAINT fk_chat_conv_user FOREIGN KEY ([created_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_msg_conv')
  ALTER TABLE dbo.chat_messages ADD CONSTRAINT fk_chat_msg_conv FOREIGN KEY ([conversation_id]) REFERENCES dbo.chat_conversations ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_msg_sender')
  ALTER TABLE dbo.chat_messages ADD CONSTRAINT fk_chat_msg_sender FOREIGN KEY ([sender_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_msg_tenant')
  ALTER TABLE dbo.chat_messages ADD CONSTRAINT fk_chat_msg_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_part_conv')
  ALTER TABLE dbo.chat_participants ADD CONSTRAINT fk_chat_part_conv FOREIGN KEY ([conversation_id]) REFERENCES dbo.chat_conversations ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_chat_part_user')
  ALTER TABLE dbo.chat_participants ADD CONSTRAINT fk_chat_part_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_choices_question')
  ALTER TABLE dbo.choices ADD CONSTRAINT fk_choices_question FOREIGN KEY ([question_id]) REFERENCES dbo.questions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_choices_tenant')
  ALTER TABLE dbo.choices ADD CONSTRAINT fk_choices_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_comments_post')
  ALTER TABLE dbo.comments ADD CONSTRAINT fk_comments_post FOREIGN KEY ([post_id]) REFERENCES dbo.blog_posts ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_comments_tenant')
  ALTER TABLE dbo.comments ADD CONSTRAINT fk_comments_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_comments_user')
  ALTER TABLE dbo.comments ADD CONSTRAINT fk_comments_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_contents_file')
  ALTER TABLE dbo.contents ADD CONSTRAINT fk_contents_file FOREIGN KEY ([file_id]) REFERENCES dbo.file_assets ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_contents_lesson')
  ALTER TABLE dbo.contents ADD CONSTRAINT fk_contents_lesson FOREIGN KEY ([lesson_id]) REFERENCES dbo.lessons ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_contents_tenant')
  ALTER TABLE dbo.contents ADD CONSTRAINT fk_contents_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_course_eval_course')
  ALTER TABLE dbo.course_evaluations ADD CONSTRAINT fk_course_eval_course FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_course_eval_tenant')
  ALTER TABLE dbo.course_evaluations ADD CONSTRAINT fk_course_eval_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_course_eval_user')
  ALTER TABLE dbo.course_evaluations ADD CONSTRAINT fk_course_eval_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_courses_category')
  ALTER TABLE dbo.courses ADD CONSTRAINT fk_courses_category FOREIGN KEY ([category_id]) REFERENCES dbo.categories ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_courses_tenant')
  ALTER TABLE dbo.courses ADD CONSTRAINT fk_courses_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_courses_user')
  ALTER TABLE dbo.courses ADD CONSTRAINT fk_courses_user FOREIGN KEY ([created_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_directions_enterprise')
  ALTER TABLE dbo.directions ADD CONSTRAINT fk_directions_enterprise FOREIGN KEY ([enterprise_id]) REFERENCES dbo.enterprises ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_directions_tenant')
  ALTER TABLE dbo.directions ADD CONSTRAINT fk_directions_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_email_settings_tenant')
  ALTER TABLE dbo.email_settings ADD CONSTRAINT fk_email_settings_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_livekit_settings_tenant')
  ALTER TABLE dbo.livekit_settings ADD CONSTRAINT fk_livekit_settings_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_enterprises_tenant')
  ALTER TABLE dbo.enterprises ADD CONSTRAINT fk_enterprises_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_file_assets_tenant')
  ALTER TABLE dbo.file_assets ADD CONSTRAINT fk_file_assets_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_file_assets_user')
  ALTER TABLE dbo.file_assets ADD CONSTRAINT fk_file_assets_user FOREIGN KEY ([created_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_inactivity_policies_tenant')
  ALTER TABLE dbo.inactivity_policies ADD CONSTRAINT fk_inactivity_policies_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_inactivity_policies_user')
  ALTER TABLE dbo.inactivity_policies ADD CONSTRAINT fk_inactivity_policies_user FOREIGN KEY ([updated_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_lessons_module')
  ALTER TABLE dbo.lessons ADD CONSTRAINT fk_lessons_module FOREIGN KEY ([module_id]) REFERENCES dbo.modules ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_lessons_tenant')
  ALTER TABLE dbo.lessons ADD CONSTRAINT fk_lessons_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_part_sess')
  ALTER TABLE dbo.live_participants ADD CONSTRAINT fk_live_part_sess FOREIGN KEY ([session_id]) REFERENCES dbo.live_sessions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_part_user')
  ALTER TABLE dbo.live_participants ADD CONSTRAINT fk_live_part_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_rec_file')
  ALTER TABLE dbo.live_recordings ADD CONSTRAINT fk_live_rec_file FOREIGN KEY ([file_id]) REFERENCES dbo.file_assets ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_rec_sess')
  ALTER TABLE dbo.live_recordings ADD CONSTRAINT fk_live_rec_sess FOREIGN KEY ([session_id]) REFERENCES dbo.live_sessions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_rec_tenant')
  ALTER TABLE dbo.live_recordings ADD CONSTRAINT fk_live_rec_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_sess_course')
  ALTER TABLE dbo.live_sessions ADD CONSTRAINT fk_live_sess_course FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_sess_module')
  ALTER TABLE dbo.live_sessions ADD CONSTRAINT fk_live_sess_module FOREIGN KEY ([module_id]) REFERENCES dbo.modules ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_sess_org')
  ALTER TABLE dbo.live_sessions ADD CONSTRAINT fk_live_sess_org FOREIGN KEY ([organizer_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_live_sess_tenant')
  ALTER TABLE dbo.live_sessions ADD CONSTRAINT fk_live_sess_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_modules_course')
  ALTER TABLE dbo.modules ADD CONSTRAINT fk_modules_course FOREIGN KEY ([course_id]) REFERENCES dbo.courses ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_modules_tenant')
  ALTER TABLE dbo.modules ADD CONSTRAINT fk_modules_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notif_deliv_notif')
  ALTER TABLE dbo.notification_deliveries ADD CONSTRAINT fk_notif_deliv_notif FOREIGN KEY ([notification_id]) REFERENCES dbo.notifications ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notif_deliv_tenant')
  ALTER TABLE dbo.notification_deliveries ADD CONSTRAINT fk_notif_deliv_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notif_pref_tenant')
  ALTER TABLE dbo.notification_preferences ADD CONSTRAINT fk_notif_pref_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notif_pref_user')
  ALTER TABLE dbo.notification_preferences ADD CONSTRAINT fk_notif_pref_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notif_templates_tenant')
  ALTER TABLE dbo.notification_templates ADD CONSTRAINT fk_notif_templates_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notifications_template')
  ALTER TABLE dbo.notifications ADD CONSTRAINT fk_notifications_template FOREIGN KEY ([template_id]) REFERENCES dbo.notification_templates ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notifications_tenant')
  ALTER TABLE dbo.notifications ADD CONSTRAINT fk_notifications_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notifications_user')
  ALTER TABLE dbo.notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_post_tags_post')
  ALTER TABLE dbo.post_tags ADD CONSTRAINT fk_post_tags_post FOREIGN KEY ([post_id]) REFERENCES dbo.blog_posts ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_post_tags_tag')
  ALTER TABLE dbo.post_tags ADD CONSTRAINT fk_post_tags_tag FOREIGN KEY ([tag_id]) REFERENCES dbo.tags ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_privacy_tenant')
  ALTER TABLE dbo.privacy_consents ADD CONSTRAINT fk_privacy_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_privacy_user')
  ALTER TABLE dbo.privacy_consents ADD CONSTRAINT fk_privacy_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_push_subscriptions_tenant')
  ALTER TABLE dbo.push_subscriptions ADD CONSTRAINT fk_push_subscriptions_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_push_subscriptions_user')
  ALTER TABLE dbo.push_subscriptions ADD CONSTRAINT fk_push_subscriptions_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_questions_quiz')
  ALTER TABLE dbo.questions ADD CONSTRAINT fk_questions_quiz FOREIGN KEY ([quiz_id]) REFERENCES dbo.quizzes ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_questions_tenant')
  ALTER TABLE dbo.questions ADD CONSTRAINT fk_questions_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_quizzes_lesson')
  ALTER TABLE dbo.quizzes ADD CONSTRAINT fk_quizzes_lesson FOREIGN KEY ([lesson_id]) REFERENCES dbo.lessons ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_quizzes_tenant')
  ALTER TABLE dbo.quizzes ADD CONSTRAINT fk_quizzes_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_retention_tenant')
  ALTER TABLE dbo.data_retention_policies ADD CONSTRAINT fk_retention_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_scheduled_reports_tenant')
  ALTER TABLE dbo.scheduled_reports ADD CONSTRAINT fk_scheduled_reports_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_scheduled_reports_user')
  ALTER TABLE dbo.scheduled_reports ADD CONSTRAINT fk_scheduled_reports_user FOREIGN KEY ([created_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_search_history_tenant')
  ALTER TABLE dbo.search_history ADD CONSTRAINT fk_search_history_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_search_history_user')
  ALTER TABLE dbo.search_history ADD CONSTRAINT fk_search_history_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_search_tenant')
  ALTER TABLE dbo.search_index ADD CONSTRAINT fk_search_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_services_direction')
  ALTER TABLE dbo.services ADD CONSTRAINT fk_services_direction FOREIGN KEY ([direction_id]) REFERENCES dbo.directions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_services_tenant')
  ALTER TABLE dbo.services ADD CONSTRAINT fk_services_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_sso_tenant')
  ALTER TABLE dbo.sso_identities ADD CONSTRAINT fk_sso_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_sso_user')
  ALTER TABLE dbo.sso_identities ADD CONSTRAINT fk_sso_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_tags_tenant')
  ALTER TABLE dbo.tags ADD CONSTRAINT fk_tags_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_team_report_sub_tenant')
  ALTER TABLE dbo.team_report_subscriptions ADD CONSTRAINT fk_team_report_sub_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_team_report_sub_user')
  ALTER TABLE dbo.team_report_subscriptions ADD CONSTRAINT fk_team_report_sub_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_tenant_settings_tenant')
  ALTER TABLE dbo.tenant_settings ADD CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_badges_badge')
  ALTER TABLE dbo.user_badges ADD CONSTRAINT fk_user_badges_badge FOREIGN KEY ([badge_id]) REFERENCES dbo.badges ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_badges_tenant')
  ALTER TABLE dbo.user_badges ADD CONSTRAINT fk_user_badges_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_badges_user')
  ALTER TABLE dbo.user_badges ADD CONSTRAINT fk_user_badges_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_devices_user')
  ALTER TABLE dbo.user_devices ADD CONSTRAINT fk_user_devices_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_profiles_user')
  ALTER TABLE dbo.user_profiles ADD CONSTRAINT fk_user_profiles_user FOREIGN KEY ([user_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_users_direction')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_direction FOREIGN KEY ([direction_id]) REFERENCES dbo.directions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_users_enterprise')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_enterprise FOREIGN KEY ([enterprise_id]) REFERENCES dbo.enterprises ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_users_service')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_service FOREIGN KEY ([service_id]) REFERENCES dbo.services ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_users_supervisor')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_supervisor FOREIGN KEY ([supervisor_id]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_users_tenant')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_webhook_deliveries_webhook')
  ALTER TABLE dbo.webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_webhook FOREIGN KEY ([webhook_id]) REFERENCES dbo.webhooks ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_webhook_tenant')
  ALTER TABLE dbo.webhook_subscriptions ADD CONSTRAINT fk_webhook_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_webhooks_tenant')
  ALTER TABLE dbo.webhooks ADD CONSTRAINT fk_webhooks_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_webhooks_user')
  ALTER TABLE dbo.webhooks ADD CONSTRAINT fk_webhooks_user FOREIGN KEY ([created_by]) REFERENCES dbo.users ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_whiteboards_sess')
  ALTER TABLE dbo.whiteboards ADD CONSTRAINT fk_whiteboards_sess FOREIGN KEY ([session_id]) REFERENCES dbo.live_sessions ([id]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_whiteboards_tenant')
  ALTER TABLE dbo.whiteboards ADD CONSTRAINT fk_whiteboards_tenant FOREIGN KEY ([tenant_id]) REFERENCES dbo.tenants ([id]);

