-- GENERATED FILE — full PostgreSQL schema translated 1:1 from the live SQL Server
-- database (db_eformation), introspected via sys.tables/sys.columns/sys.foreign_keys
-- rather than from db/bci_lms_schema_sqlserver.sql + db/migrations/*.sql, because those
-- files were found to be out of sync with the real running schema (missing tables like
-- course_assignments/enrollments/lesson_progress were already known; this generation
-- pass additionally found the live DB itself is missing several tables the application
-- code references — ai_usage_logs, awarded_badges, blog_categories/blog_tags/
-- blog_post_tags/blog_comments, push_subscriptions, scheduled_reports, search_history,
-- user_devices, user_profiles, webhooks, webhook_deliveries — those code paths are
-- already broken against SQL Server today; this file intentionally matches the real
-- mssql schema as-is rather than inventing tables for already-broken features.
-- Regenerate: node db/scripts/dump_mssql_schema.js <dir> && node db/scripts/gen_pg_schema.js <dir>

BEGIN;

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  role                 VARCHAR(20) NOT NULL CHECK ((role='assistant' OR role='user')),
  message              TEXT NOT NULL,
  context              TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS ai_generated_contents (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  source_type          VARCHAR(20) NOT NULL CHECK ((source_type='chat' OR source_type='document' OR source_type='video' OR source_type='lesson' OR source_type='module' OR source_type='course')),
  source_id            BIGINT,
  kind                 VARCHAR(20) NOT NULL CHECK ((kind='transcript' OR kind='description' OR kind='title' OR kind='revision_sheet' OR kind='quiz' OR kind='summary')),
  content              TEXT,
  metadata             JSONB,
  created_by           BIGINT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  recommendation       JSONB NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS answers (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  attempt_id           BIGINT NOT NULL,
  question_id          BIGINT NOT NULL,
  choice_id            BIGINT,
  text_answer          TEXT,
  is_correct           BOOLEAN,
  points               INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_keys (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  key                  VARCHAR(255) NOT NULL,
  scopes               JSONB,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS assignment_reminders (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  course_assignment_id BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  reminder_type        VARCHAR(20) NOT NULL CHECK ((reminder_type='escalation' OR reminder_type='overdue' OR reminder_type='urgent' OR reminder_type='upcoming')),
  sent_at              TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS attempts (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  quiz_id              BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  started_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  submitted_at         TIMESTAMP,
  score                INTEGER,
  status               VARCHAR(20) NOT NULL CHECK ((status='graded' OR status='submitted' OR status='in_progress'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT,
  action               VARCHAR(255) NOT NULL,
  entity               VARCHAR(100),
  entity_id            BIGINT,
  metadata             TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS badges (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  code                 VARCHAR(100) NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  description          TEXT,
  icon_file_id         BIGINT,
  criteria             JSONB NOT NULL,
  badge_type           VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  author_id            BIGINT,
  title                VARCHAR(500) NOT NULL,
  body                 TEXT NOT NULL,
  status               VARCHAR(20) NOT NULL CHECK ((status='published' OR status='draft')),
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  published_at         TIMESTAMP
);

CREATE TABLE IF NOT EXISTS breakout_rooms (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  session_id           BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS categories (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate_templates (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  name                 VARCHAR(100) NOT NULL,
  description          VARCHAR(500),
  template_html        TEXT,
  background_file_id   BIGINT,
  is_default           BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMP DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS certificates (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  course_id            BIGINT NOT NULL,
  serial               VARCHAR(255) NOT NULL,
  issued_at            TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  pdf_file_id          BIGINT,
  validity_months      INTEGER,
  expires_at           TIMESTAMP,
  renewal_reminder_sent_at TIMESTAMP,
  template_id          BIGINT,
  revoked_at           TIMESTAMP,
  revoked_by           BIGINT
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  message_id           BIGINT NOT NULL,
  file_id              BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  scope                VARCHAR(20) NOT NULL CHECK ((scope='module' OR scope='course' OR scope='group' OR scope='direct')),
  title                VARCHAR(255),
  created_by           BIGINT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  conversation_id      BIGINT NOT NULL,
  sender_id            BIGINT NOT NULL,
  body                 TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  deleted_at           TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_participants (
  conversation_id      BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  role                 VARCHAR(20) CHECK ((role='member' OR role='owner')),
  joined_at            TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS choices (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  question_id          BIGINT NOT NULL,
  label                TEXT NOT NULL,
  is_correct           BOOLEAN NOT NULL DEFAULT FALSE,
  position             INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  post_id              BIGINT NOT NULL,
  user_id              BIGINT,
  body                 TEXT NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS contents (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  lesson_id            BIGINT NOT NULL,
  type                 VARCHAR(20) NOT NULL CHECK ((type='text' OR type='youtube_link' OR type='video_mp4' OR type='image' OR type='docx' OR type='pdf')),
  title                VARCHAR(255) NOT NULL,
  body                 TEXT,
  file_id              BIGINT,
  url                  VARCHAR(1000),
  position             INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS course_assignments (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  course_id            BIGINT NOT NULL,
  assignment_type      VARCHAR(20) NOT NULL CHECK ((assignment_type='role' OR assignment_type='service' OR assignment_type='direction' OR assignment_type='enterprise' OR assignment_type='user')),
  target_id            BIGINT,
  target_role          VARCHAR(20),
  is_mandatory         BOOLEAN NOT NULL DEFAULT FALSE,
  due_date             TIMESTAMP,
  assigned_by          BIGINT NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS course_evaluations (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  course_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  rating               INTEGER NOT NULL CHECK ((rating>=(1) AND rating<=(5))),
  comment              TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS courses (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  audience_scope       JSONB,
  prerequisites        JSONB,
  is_published         BOOLEAN NOT NULL DEFAULT FALSE,
  created_by           BIGINT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  category             VARCHAR(50),
  level                VARCHAR(20) DEFAULT 'beginner',
  duration             INTEGER,
  category_id          BIGINT
);

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  entity               VARCHAR(100) NOT NULL,
  retention_days       INTEGER NOT NULL CHECK ((retention_days>(0))),
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS directions (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  enterprise_id        BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  code                 VARCHAR(100),
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS email_settings (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_host            VARCHAR(255),
  smtp_port            INTEGER NOT NULL DEFAULT 587,
  smtp_secure          BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_user            VARCHAR(255),
  smtp_password        VARCHAR(500),
  from_email           VARCHAR(255),
  from_name            VARCHAR(255),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS enrollments (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  course_id            BIGINT NOT NULL,
  enrolled_at          TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  progress_percent     INTEGER DEFAULT 0,
  completed_at         TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enterprises (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  code                 VARCHAR(100),
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS file_assets (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  filename             VARCHAR(255) NOT NULL,
  mime_type            VARCHAR(100) NOT NULL,
  storage_key          VARCHAR(512) NOT NULL,
  size_bytes           BIGINT,
  checksum             VARCHAR(255),
  created_by           BIGINT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS inactivity_policies (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  role                 VARCHAR(20) NOT NULL,
  max_inactive_days    INTEGER NOT NULL,
  updated_by           BIGINT,
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS learning_analytics (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT,
  course_id            BIGINT,
  metric               VARCHAR(100) NOT NULL,
  value                NUMERIC(18,4),
  context              JSONB,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  lesson_id            BIGINT NOT NULL,
  course_id            BIGINT NOT NULL,
  status               VARCHAR(20) DEFAULT 'not_started',
  progress_percent     INTEGER DEFAULT 0,
  started_at           TIMESTAMP,
  last_accessed_at     TIMESTAMP,
  completed_at         TIMESTAMP,
  time_spent_seconds   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  module_id            BIGINT NOT NULL,
  title                VARCHAR(255) NOT NULL,
  position             INTEGER NOT NULL,
  duration_min         INTEGER,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  type                 VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS live_participants (
  session_id           BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  role                 VARCHAR(20) CHECK ((role='attendee' OR role='speaker' OR role='host')),
  joined_at            TIMESTAMP,
  left_at              TIMESTAMP,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_recordings (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  session_id           BIGINT NOT NULL,
  file_id              BIGINT,
  duration_sec         INTEGER,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  course_id            BIGINT,
  module_id            BIGINT,
  title                VARCHAR(255) NOT NULL,
  status               VARCHAR(20) NOT NULL CHECK ((status='canceled' OR status='ended' OR status='live' OR status='scheduled')),
  scheduled_at         TIMESTAMP,
  started_at           TIMESTAMP,
  ended_at             TIMESTAMP,
  organizer_id         BIGINT,
  meeting_provider     VARCHAR(20) CHECK ((meeting_provider='meet' OR meeting_provider='teams' OR meeting_provider='zoom' OR meeting_provider='webrtc')),
  meeting_link         VARCHAR(1000),
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  description          TEXT,
  duration             INTEGER,
  max_participants     INTEGER
);

CREATE TABLE IF NOT EXISTS modules (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  course_id            BIGINT NOT NULL,
  title                VARCHAR(255) NOT NULL,
  position             INTEGER NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  notification_id      BIGINT NOT NULL,
  channel              VARCHAR(20) NOT NULL CHECK ((channel='push_mobile' OR channel='push_web' OR channel='sms' OR channel='whatsapp' OR channel='email')),
  status               VARCHAR(20) NOT NULL CHECK ((status='clicked' OR status='opened' OR status='failed' OR status='sent' OR status='queued')),
  provider_msg_id      VARCHAR(255),
  sent_at              TIMESTAMP,
  error                TEXT
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  email                BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp             BOOLEAN NOT NULL DEFAULT FALSE,
  sms                  BOOLEAN NOT NULL DEFAULT FALSE,
  push_web             BOOLEAN NOT NULL DEFAULT TRUE,
  push_mobile          BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  code                 VARCHAR(255) NOT NULL,
  channel              VARCHAR(20) NOT NULL CHECK ((channel='push_mobile' OR channel='push_web' OR channel='sms' OR channel='whatsapp' OR channel='email')),
  subject              VARCHAR(255),
  body                 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  template_id          BIGINT,
  payload              JSONB,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  channel              VARCHAR(20),
  subject              VARCHAR(500),
  body                 TEXT,
  action_url           VARCHAR(1000),
  metadata             JSONB,
  read_at              TIMESTAMP,
  sent_at              TIMESTAMP,
  external_id          VARCHAR(255),
  failed_at            TIMESTAMP,
  error_message        TEXT
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id              BIGINT NOT NULL,
  tag_id               BIGINT NOT NULL,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS privacy_consents (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  policy_code          VARCHAR(100) NOT NULL,
  consented            BOOLEAN NOT NULL DEFAULT TRUE,
  consented_at         TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS questions (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  quiz_id              BIGINT NOT NULL,
  type                 VARCHAR(20) NOT NULL CHECK ((type='essay' OR type='short_text' OR type='true_false' OR type='mcq')),
  prompt               TEXT NOT NULL,
  position             INTEGER NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  points               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  attempt_id           BIGINT NOT NULL,
  question_id          BIGINT NOT NULL,
  choice_id            BIGINT,
  text_answer          TEXT,
  is_correct           BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMP DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  quiz_id              BIGINT NOT NULL,
  score                INTEGER DEFAULT 0,
  passed               BOOLEAN DEFAULT FALSE,
  started_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  completed_at         TIMESTAMP,
  time_spent           INTEGER DEFAULT 0,
  question_ids         JSONB
);

CREATE TABLE IF NOT EXISTS quizzes (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  lesson_id            BIGINT NOT NULL,
  title                VARCHAR(255) NOT NULL,
  passing_score        INTEGER NOT NULL DEFAULT 70,
  randomized           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  time_limit_minutes   INTEGER,
  max_attempts         INTEGER DEFAULT 3,
  expires_at           TIMESTAMP,
  badge_id             BIGINT,
  certificate_enabled  BOOLEAN DEFAULT FALSE,
  show_correct_answers BOOLEAN DEFAULT TRUE,
  shuffle_choices      BOOLEAN DEFAULT FALSE,
  description          VARCHAR(500),
  instructions         VARCHAR(1000),
  questions_to_draw    INTEGER
);

CREATE TABLE IF NOT EXISTS search_index (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  entity               VARCHAR(50) NOT NULL,
  entity_id            BIGINT NOT NULL,
  text                 TEXT,
  metadata             JSONB,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS services (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  direction_id         BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  code                 VARCHAR(100),
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS sso_identities (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  provider             VARCHAR(20) NOT NULL CHECK ((provider='saml' OR provider='google' OR provider='azure_ad')),
  external_id          VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  name                 VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS team_report_subscriptions (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  is_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  frequency            VARCHAR(10) NOT NULL DEFAULT 'weekly' CHECK ((frequency='weekly' OR frequency='daily')),
  weekday              SMALLINT,
  channel_email        BOOLEAN NOT NULL DEFAULT TRUE,
  channel_in_app       BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at         TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  description          TEXT,
  logo_url             VARCHAR(500),
  primary_color        VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  secondary_color      VARCHAR(20) NOT NULL DEFAULT '#10B981',
  contact_email        VARCHAR(255),
  contact_phone        VARCHAR(50),
  address              VARCHAR(500),
  website              VARCHAR(255),
  allow_self_registration BOOLEAN NOT NULL DEFAULT TRUE,
  default_language     VARCHAR(10) NOT NULL DEFAULT 'fr',
  timezone             VARCHAR(100) NOT NULL DEFAULT 'Europe/Paris',
  enable_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  enable_chat          BOOLEAN NOT NULL DEFAULT TRUE,
  enable_live_sessions BOOLEAN NOT NULL DEFAULT TRUE,
  max_users_per_group  INTEGER NOT NULL DEFAULT 50,
  certificate_validity INTEGER NOT NULL DEFAULT 365,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS tenants (
  id                   BIGSERIAL PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  slug                 VARCHAR(255) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS user_badges (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  badge_id             BIGINT NOT NULL,
  awarded_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  quiz_id              BIGINT,
  course_id            BIGINT,
  score                INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  enterprise_id        BIGINT,
  direction_id         BIGINT,
  service_id           BIGINT,
  email                VARCHAR(255) NOT NULL,
  username             VARCHAR(255),
  password_hash        TEXT NOT NULL,
  display_name         VARCHAR(255) NOT NULL,
  role                 VARCHAR(20) NOT NULL CHECK ((role='stagiaire' OR role='externe' OR role='agent' OR role='supervisor' OR role='manager' OR role='director' OR role='admin' OR role='super_admin')),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  deleted_at           TIMESTAMP,
  avatar_url           VARCHAR(500),
  supervisor_id        BIGINT,
  status               VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ((status='deactivated' OR status='suspended' OR status='active' OR status='pending')),
  last_login_at        TIMESTAMP,
  phone                VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  url                  VARCHAR(1000) NOT NULL,
  event                VARCHAR(100) NOT NULL,
  secret               VARCHAR(255),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS whiteboards (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL,
  session_id           BIGINT,
  data                 TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at           TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

-- Unique constraints
ALTER TABLE api_keys ADD CONSTRAINT uq_api_key UNIQUE (key);
ALTER TABLE assignment_reminders ADD CONSTRAINT uq_assignment_reminder UNIQUE (course_assignment_id, user_id, reminder_type);
ALTER TABLE badges ADD CONSTRAINT UQ__badges__357D4CF96D52398F UNIQUE (code);
ALTER TABLE categories ADD CONSTRAINT uq_category_name UNIQUE (tenant_id, name);
ALTER TABLE certificates ADD CONSTRAINT UQ__certific__61787229C0EA02EE UNIQUE (serial);
ALTER TABLE course_evaluations ADD CONSTRAINT uq_course_eval UNIQUE (tenant_id, course_id, user_id);
ALTER TABLE email_settings ADD CONSTRAINT UQ__email_se__D6F29F3F469BE66D UNIQUE (tenant_id);
ALTER TABLE enrollments ADD CONSTRAINT uq_enrollment UNIQUE (user_id, course_id);
ALTER TABLE enterprises ADD CONSTRAINT UQ__enterpri__357D4CF94A2DB61D UNIQUE (code);
ALTER TABLE inactivity_policies ADD CONSTRAINT uq_inactivity_policies_tenant_role UNIQUE (tenant_id, role);
ALTER TABLE lesson_progress ADD CONSTRAINT UQ_lesson_progress UNIQUE (tenant_id, user_id, lesson_id);
ALTER TABLE notification_preferences ADD CONSTRAINT uq_notif_pref UNIQUE (tenant_id, user_id);
ALTER TABLE notification_templates ADD CONSTRAINT uq_template_code UNIQUE (tenant_id, code);
ALTER TABLE privacy_consents ADD CONSTRAINT uq_privacy UNIQUE (tenant_id, user_id, policy_code);
ALTER TABLE sso_identities ADD CONSTRAINT uq_sso UNIQUE (tenant_id, provider, external_id);
ALTER TABLE tags ADD CONSTRAINT uq_tag_name UNIQUE (tenant_id, name);
ALTER TABLE team_report_subscriptions ADD CONSTRAINT uq_team_report_sub_user UNIQUE (tenant_id, user_id);
ALTER TABLE tenant_settings ADD CONSTRAINT UQ__tenant_s__D6F29F3FA4193B2B UNIQUE (tenant_id);
ALTER TABLE tenants ADD CONSTRAINT UQ__tenants__32DD1E4CDE6EF953 UNIQUE (slug);
ALTER TABLE tenants ADD CONSTRAINT UQ__tenants__72E12F1B2648929A UNIQUE (name);
ALTER TABLE user_badges ADD CONSTRAINT UQ_user_badges_course UNIQUE (tenant_id, user_id, badge_id, course_id);
ALTER TABLE user_badges ADD CONSTRAINT UQ_user_badges_quiz UNIQUE (tenant_id, user_id, badge_id, quiz_id);
ALTER TABLE user_badges ADD CONSTRAINT uq_user_badge UNIQUE (tenant_id, user_id, badge_id);
ALTER TABLE users ADD CONSTRAINT UQ__users__AB6E616433F29DE1 UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT UQ__users__F3DBC572B3F5EB8D UNIQUE (username);

-- Foreign keys
ALTER TABLE enrollments ADD CONSTRAINT FK__enrollmen__cours__0BE6BFCF FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE enrollments ADD CONSTRAINT FK__enrollmen__user___0AF29B96 FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE quiz_attempts ADD CONSTRAINT FK__quiz_atte__user___10AB74EC FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE ai_chat_history ADD CONSTRAINT fk_ai_chat_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE ai_chat_history ADD CONSTRAINT fk_ai_chat_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE ai_generated_contents ADD CONSTRAINT fk_ai_gen_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE ai_generated_contents ADD CONSTRAINT fk_ai_gen_user FOREIGN KEY (created_by) REFERENCES users (id);
ALTER TABLE ai_recommendations ADD CONSTRAINT fk_ai_rec_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE ai_recommendations ADD CONSTRAINT fk_ai_rec_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE learning_analytics ADD CONSTRAINT fk_analytics_course FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE learning_analytics ADD CONSTRAINT fk_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE learning_analytics ADD CONSTRAINT fk_analytics_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE answers ADD CONSTRAINT fk_answers_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id);
ALTER TABLE answers ADD CONSTRAINT fk_answers_choice FOREIGN KEY (choice_id) REFERENCES choices (id);
ALTER TABLE answers ADD CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES questions (id);
ALTER TABLE answers ADD CONSTRAINT fk_answers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE assignment_reminders ADD CONSTRAINT fk_assignment_reminders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE assignment_reminders ADD CONSTRAINT fk_assignment_reminders_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE course_assignments ADD CONSTRAINT fk_assignments_course FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE course_assignments ADD CONSTRAINT fk_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE course_assignments ADD CONSTRAINT fk_assignments_user FOREIGN KEY (assigned_by) REFERENCES users (id);
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id);
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE attempts ADD CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE badges ADD CONSTRAINT fk_badges_icon FOREIGN KEY (icon_file_id) REFERENCES file_assets (id);
ALTER TABLE badges ADD CONSTRAINT fk_badges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE blog_posts ADD CONSTRAINT fk_blog_author FOREIGN KEY (author_id) REFERENCES users (id);
ALTER TABLE blog_posts ADD CONSTRAINT fk_blog_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE breakout_rooms ADD CONSTRAINT fk_breakout_sess FOREIGN KEY (session_id) REFERENCES live_sessions (id);
ALTER TABLE breakout_rooms ADD CONSTRAINT fk_breakout_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE categories ADD CONSTRAINT fk_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE certificates ADD CONSTRAINT fk_certificates_course FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE certificates ADD CONSTRAINT fk_certificates_file FOREIGN KEY (pdf_file_id) REFERENCES file_assets (id);
ALTER TABLE certificates ADD CONSTRAINT fk_certificates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE certificates ADD CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE chat_attachments ADD CONSTRAINT fk_chat_att_file FOREIGN KEY (file_id) REFERENCES file_assets (id);
ALTER TABLE chat_attachments ADD CONSTRAINT fk_chat_att_msg FOREIGN KEY (message_id) REFERENCES chat_messages (id);
ALTER TABLE chat_attachments ADD CONSTRAINT fk_chat_att_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE chat_conversations ADD CONSTRAINT fk_chat_conv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE chat_conversations ADD CONSTRAINT fk_chat_conv_user FOREIGN KEY (created_by) REFERENCES users (id);
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_msg_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id);
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_msg_sender FOREIGN KEY (sender_id) REFERENCES users (id);
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_msg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE chat_participants ADD CONSTRAINT fk_chat_part_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id);
ALTER TABLE chat_participants ADD CONSTRAINT fk_chat_part_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE choices ADD CONSTRAINT fk_choices_question FOREIGN KEY (question_id) REFERENCES questions (id);
ALTER TABLE choices ADD CONSTRAINT fk_choices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE comments ADD CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES blog_posts (id);
ALTER TABLE comments ADD CONSTRAINT fk_comments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE comments ADD CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE contents ADD CONSTRAINT fk_contents_file FOREIGN KEY (file_id) REFERENCES file_assets (id);
ALTER TABLE contents ADD CONSTRAINT fk_contents_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id);
ALTER TABLE contents ADD CONSTRAINT fk_contents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE course_evaluations ADD CONSTRAINT fk_course_eval_course FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE course_evaluations ADD CONSTRAINT fk_course_eval_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE course_evaluations ADD CONSTRAINT fk_course_eval_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE courses ADD CONSTRAINT fk_courses_category FOREIGN KEY (category_id) REFERENCES categories (id);
ALTER TABLE courses ADD CONSTRAINT fk_courses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE courses ADD CONSTRAINT fk_courses_user FOREIGN KEY (created_by) REFERENCES users (id);
ALTER TABLE directions ADD CONSTRAINT fk_directions_enterprise FOREIGN KEY (enterprise_id) REFERENCES enterprises (id);
ALTER TABLE directions ADD CONSTRAINT fk_directions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE email_settings ADD CONSTRAINT fk_email_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE enterprises ADD CONSTRAINT fk_enterprises_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE file_assets ADD CONSTRAINT fk_file_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE file_assets ADD CONSTRAINT fk_file_assets_user FOREIGN KEY (created_by) REFERENCES users (id);
ALTER TABLE inactivity_policies ADD CONSTRAINT fk_inactivity_policies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE inactivity_policies ADD CONSTRAINT fk_inactivity_policies_user FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE lessons ADD CONSTRAINT fk_lessons_module FOREIGN KEY (module_id) REFERENCES modules (id);
ALTER TABLE lessons ADD CONSTRAINT fk_lessons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE live_participants ADD CONSTRAINT fk_live_part_sess FOREIGN KEY (session_id) REFERENCES live_sessions (id);
ALTER TABLE live_participants ADD CONSTRAINT fk_live_part_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE live_recordings ADD CONSTRAINT fk_live_rec_file FOREIGN KEY (file_id) REFERENCES file_assets (id);
ALTER TABLE live_recordings ADD CONSTRAINT fk_live_rec_sess FOREIGN KEY (session_id) REFERENCES live_sessions (id);
ALTER TABLE live_recordings ADD CONSTRAINT fk_live_rec_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE live_sessions ADD CONSTRAINT fk_live_sess_course FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE live_sessions ADD CONSTRAINT fk_live_sess_module FOREIGN KEY (module_id) REFERENCES modules (id);
ALTER TABLE live_sessions ADD CONSTRAINT fk_live_sess_org FOREIGN KEY (organizer_id) REFERENCES users (id);
ALTER TABLE live_sessions ADD CONSTRAINT fk_live_sess_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE modules ADD CONSTRAINT fk_modules_course FOREIGN KEY (course_id) REFERENCES courses (id);
ALTER TABLE modules ADD CONSTRAINT fk_modules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE notification_deliveries ADD CONSTRAINT fk_notif_deliv_notif FOREIGN KEY (notification_id) REFERENCES notifications (id);
ALTER TABLE notification_deliveries ADD CONSTRAINT fk_notif_deliv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE notification_preferences ADD CONSTRAINT fk_notif_pref_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE notification_preferences ADD CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE notification_templates ADD CONSTRAINT fk_notif_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_template FOREIGN KEY (template_id) REFERENCES notification_templates (id);
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE post_tags ADD CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES blog_posts (id);
ALTER TABLE post_tags ADD CONSTRAINT fk_post_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id);
ALTER TABLE privacy_consents ADD CONSTRAINT fk_privacy_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE privacy_consents ADD CONSTRAINT fk_privacy_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE questions ADD CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id);
ALTER TABLE questions ADD CONSTRAINT fk_questions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE quizzes ADD CONSTRAINT fk_quizzes_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id);
ALTER TABLE quizzes ADD CONSTRAINT fk_quizzes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE data_retention_policies ADD CONSTRAINT fk_retention_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE search_index ADD CONSTRAINT fk_search_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE services ADD CONSTRAINT fk_services_direction FOREIGN KEY (direction_id) REFERENCES directions (id);
ALTER TABLE services ADD CONSTRAINT fk_services_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE sso_identities ADD CONSTRAINT fk_sso_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE sso_identities ADD CONSTRAINT fk_sso_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE tags ADD CONSTRAINT fk_tags_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE team_report_subscriptions ADD CONSTRAINT fk_team_report_sub_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE team_report_subscriptions ADD CONSTRAINT fk_team_report_sub_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE tenant_settings ADD CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE user_badges ADD CONSTRAINT fk_user_badges_badge FOREIGN KEY (badge_id) REFERENCES badges (id);
ALTER TABLE user_badges ADD CONSTRAINT fk_user_badges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE user_badges ADD CONSTRAINT fk_user_badges_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE users ADD CONSTRAINT fk_users_direction FOREIGN KEY (direction_id) REFERENCES directions (id);
ALTER TABLE users ADD CONSTRAINT fk_users_enterprise FOREIGN KEY (enterprise_id) REFERENCES enterprises (id);
ALTER TABLE users ADD CONSTRAINT fk_users_service FOREIGN KEY (service_id) REFERENCES services (id);
ALTER TABLE users ADD CONSTRAINT fk_users_supervisor FOREIGN KEY (supervisor_id) REFERENCES users (id);
ALTER TABLE users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE webhook_subscriptions ADD CONSTRAINT fk_webhook_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
ALTER TABLE whiteboards ADD CONSTRAINT fk_whiteboards_sess FOREIGN KEY (session_id) REFERENCES live_sessions (id);
ALTER TABLE whiteboards ADD CONSTRAINT fk_whiteboards_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);

COMMIT;
