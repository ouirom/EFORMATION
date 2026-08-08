
-- =============================================================
-- BCI / Enterprise-grade e-learning platform
-- PostgreSQL schema, indexes, triggers, and seed data
-- Version: 1.0.0
-- Generated: 2025-12-26
-- =============================================================

BEGIN;

-- =====================
-- Extensions
-- =====================
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- optional (for future hashing / UUID)

-- =====================
-- Enumerated Types
-- =====================
CREATE TYPE notification_channel AS ENUM ('email', 'whatsapp', 'sms', 'push_web', 'push_mobile');
CREATE TYPE content_type AS ENUM ('pdf', 'docx', 'image', 'video_mp4', 'youtube_link', 'text');
CREATE TYPE user_role AS ENUM ('admin', 'director', 'manager', 'supervisor', 'agent');
CREATE TYPE live_session_status AS ENUM ('scheduled', 'live', 'ended', 'canceled');

-- =====================
-- Tenants
-- =====================
CREATE TABLE IF NOT EXISTS tenants (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  slug         TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id                        BIGSERIAL PRIMARY KEY,
  tenant_id                 BIGINT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  description               TEXT,
  logo_url                  TEXT,
  primary_color             TEXT NOT NULL DEFAULT '#3B82F6',
  secondary_color           TEXT NOT NULL DEFAULT '#10B981',
  contact_email             TEXT,
  contact_phone             TEXT,
  address                   TEXT,
  website                   TEXT,
  allow_self_registration   BOOLEAN NOT NULL DEFAULT TRUE,
  default_language          TEXT NOT NULL DEFAULT 'fr',
  timezone                  TEXT NOT NULL DEFAULT 'Europe/Paris',
  enable_notifications      BOOLEAN NOT NULL DEFAULT TRUE,
  enable_chat               BOOLEAN NOT NULL DEFAULT TRUE,
  enable_live_sessions      BOOLEAN NOT NULL DEFAULT TRUE,
  max_users_per_group       INT NOT NULL DEFAULT 50,
  certificate_validity      INT NOT NULL DEFAULT 365,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_settings (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_host     TEXT,
  smtp_port     INT NOT NULL DEFAULT 587,
  smtp_secure   BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_user     TEXT,
  smtp_password TEXT,
  from_email    TEXT,
  from_name     TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Organisation
-- =====================
CREATE TABLE IF NOT EXISTS enterprises (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS directions (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  direction_id BIGINT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Utilisateurs & rôles
-- =====================
CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enterprise_id  BIGINT REFERENCES enterprises(id) ON DELETE SET NULL,
  direction_id   BIGINT REFERENCES directions(id) ON DELETE SET NULL,
  service_id     BIGINT REFERENCES services(id) ON DELETE SET NULL,
  email          CITEXT NOT NULL UNIQUE,
  username       CITEXT UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  role           user_role NOT NULL DEFAULT 'agent',
  avatar_url     TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sso_identities (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL CHECK (provider IN ('azure_ad','google','saml')),
  external_id  TEXT NOT NULL,
  UNIQUE (tenant_id, provider, external_id)
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant')),
  message      TEXT NOT NULL,
  context      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user ON ai_chat_history(user_id, created_at DESC);

-- =====================
-- Fichiers / Assets
-- =====================
CREATE TABLE IF NOT EXISTS file_assets (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  storage_key  TEXT NOT NULL,
  size_bytes   BIGINT,
  checksum     TEXT,
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Formations
-- =====================
CREATE TABLE IF NOT EXISTS courses (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  audience_scope JSONB, -- {level:'enterprise'|'direction'|'service'|'role', ids:[...], roles:[...]}
  prerequisites JSONB,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  position     INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id    BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  position     INT NOT NULL,
  duration_min INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contents (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id    BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type         content_type NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  file_id      BIGINT REFERENCES file_assets(id) ON DELETE SET NULL,
  url          TEXT,
  position     INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Quiz & évaluations
-- =====================
CREATE TABLE IF NOT EXISTS quizzes (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id    BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  passing_score INT NOT NULL DEFAULT 70,
  randomized   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quiz_id      BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('mcq','true_false','short_text','essay')),
  prompt       TEXT NOT NULL,
  position     INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS choices (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question_id  BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  is_correct   BOOLEAN NOT NULL DEFAULT FALSE,
  position     INT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quiz_id      BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  score        INT,
  status       TEXT NOT NULL CHECK (status IN ('in_progress','submitted','graded'))
);

CREATE TABLE IF NOT EXISTS answers (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempt_id   BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id  BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice_id    BIGINT REFERENCES choices(id) ON DELETE SET NULL,
  text_answer  TEXT,
  is_correct   BOOLEAN,
  points       INT DEFAULT 0
);

-- =====================
-- Badges & certificats
-- =====================
CREATE TABLE IF NOT EXISTS badges (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  icon_file_id BIGINT REFERENCES file_assets(id) ON DELETE SET NULL,
  criteria     JSONB NOT NULL -- ex: {quiz_id:..., min_score:...}
);

CREATE TABLE IF NOT EXISTS user_badges (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id     BIGINT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  serial       TEXT NOT NULL UNIQUE,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_file_id  BIGINT REFERENCES file_assets(id) ON DELETE SET NULL
);

-- =====================
-- Évaluation des cours
-- =====================
CREATE TABLE IF NOT EXISTS course_evaluations (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, course_id, user_id)
);

-- =====================
-- Blog & communauté
-- =====================
CREATE TABLE IF NOT EXISTS blog_posts (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id    BIGINT REFERENCES users(id),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('draft','published')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categories (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tags (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id      BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id       BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id      BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id      BIGINT REFERENCES users(id),
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Chat (partitionné)
-- =====================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL CHECK (scope IN ('direct','group','course','module')),
  title        TEXT,
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_participants (
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT CHECK (role IN ('owner','member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id   BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_id      BIGINT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE
);

-- =====================
-- Notifications (partitionnées)
-- =====================
CREATE TABLE IF NOT EXISTS notification_templates (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  channel      notification_channel NOT NULL,
  subject      TEXT,
  body         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email        BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp     BOOLEAN NOT NULL DEFAULT FALSE,
  sms          BOOLEAN NOT NULL DEFAULT FALSE,
  push_web     BOOLEAN NOT NULL DEFAULT TRUE,
  push_mobile  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id  BIGINT REFERENCES notification_templates(id),
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel      notification_channel NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('queued','sent','failed','opened','clicked')),
  provider_msg_id TEXT,
  sent_at      TIMESTAMPTZ,
  error        TEXT
);

-- =====================
-- Visioconférence
-- =====================
CREATE TABLE IF NOT EXISTS live_sessions (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  module_id    BIGINT REFERENCES modules(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  status       live_session_status NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  organizer_id BIGINT REFERENCES users(id),
  meeting_provider TEXT CHECK (meeting_provider IN ('webrtc','zoom','teams','meet')),
  meeting_link  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_participants (
  session_id   BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT CHECK (role IN ('host','speaker','attendee')),
  joined_at    TIMESTAMPTZ,
  left_at      TIMESTAMPTZ,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_recordings (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id   BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  file_id      BIGINT REFERENCES file_assets(id),
  duration_sec INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS breakout_rooms (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id   BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whiteboards (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id   BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  data         JSONB, -- serialized shapes/strokes
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- IA & Analytics
-- =====================
CREATE TABLE IF NOT EXISTS ai_generated_contents (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL CHECK (source_type IN ('course','module','lesson','video','document','chat')),
  source_id    BIGINT,
  kind         TEXT NOT NULL CHECK (kind IN ('summary','quiz','revision_sheet','title','description','transcript')),
  content      TEXT,
  metadata     JSONB,
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation JSONB NOT NULL, -- {course_ids:[...], reason:"..."}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_analytics (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  course_id    BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  metric       TEXT NOT NULL, -- e.g., 'time_spent', 'dropout_risk', 'difficulty_index'
  value        NUMERIC,
  context      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_index (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity       TEXT NOT NULL, -- 'course','module','lesson','content','blog','chat'
  entity_id    BIGINT NOT NULL,
  text         TEXT,
  tsv          TSVECTOR, -- for full-text search
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Intégrations & API
-- =====================
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  event        TEXT NOT NULL, -- e.g., 'course.published', 'quiz.passed'
  secret       TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key          TEXT NOT NULL UNIQUE,
  scopes       TEXT[],
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Audit & Conformité
-- =====================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT REFERENCES users(id),
  action       TEXT NOT NULL,
  entity       TEXT,
  entity_id    BIGINT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privacy_consents (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_code  TEXT NOT NULL,
  consented    BOOLEAN NOT NULL DEFAULT TRUE,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, policy_code)
);

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity       TEXT NOT NULL,
  retention_days INT NOT NULL CHECK (retention_days > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Indexes
-- =====================
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_courses_audience ON courses USING GIN (audience_scope);
CREATE INDEX IF NOT EXISTS idx_courses_prereq ON courses USING GIN (prerequisites);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules (course_id, position);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons (module_id, position);
CREATE INDEX IF NOT EXISTS idx_contents_lesson ON contents (lesson_id, position);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes (lesson_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user_quiz ON attempts (user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges (user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user_course ON certificates (user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_eval_course ON course_evaluations (course_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts (status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created ON chat_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_search_index_entity ON search_index (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_search_index_tsv ON search_index USING GIN (tsv);

-- =====================
-- Triggers & Functions
-- =====================
-- Update updated_at automatically
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Apply on tables with updated_at column
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
    ('enterprises','directions','services','users','courses','modules','lessons','whiteboards')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON %I', r.tablename, r.tablename);
    EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', r.tablename, r.tablename);
  END LOOP;
END $$;

-- Generate certificate serials
CREATE OR REPLACE FUNCTION gen_certificate_serial() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.serial IS NULL OR NEW.serial = '' THEN
    NEW.serial := CONCAT('CERT-', NEW.user_id, '-', EXTRACT(EPOCH FROM NOW())::BIGINT);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cert_serial ON certificates;
CREATE TRIGGER trg_cert_serial BEFORE INSERT ON certificates
FOR EACH ROW EXECUTE FUNCTION gen_certificate_serial();

-- Maintain tsvector for search_index
CREATE OR REPLACE FUNCTION search_index_tsv_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.tsv := to_tsvector('simple', coalesce(NEW.text,''));
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_search_index_tsv ON search_index;
CREATE TRIGGER trg_search_index_tsv BEFORE INSERT OR UPDATE ON search_index
FOR EACH ROW EXECUTE FUNCTION search_index_tsv_update();

-- =====================
-- Seed Data (idempotent)
-- =====================
-- Tenant
INSERT INTO tenants(name, slug)
SELECT 'Default Tenant', 'default'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug='default');

-- Enterprise
INSERT INTO enterprises(tenant_id, name, code)
SELECT t.id, 'Demo Enterprise', 'DEMO'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (
  SELECT 1 FROM enterprises e WHERE e.tenant_id=t.id AND e.code='DEMO'
);

-- Directions
INSERT INTO directions(tenant_id, enterprise_id, name, code)
SELECT t.id, e.id, 'Technology', 'TECH'
FROM tenants t JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
WHERE NOT EXISTS (
  SELECT 1 FROM directions d WHERE d.tenant_id=t.id AND d.enterprise_id=e.id AND d.code='TECH'
);

INSERT INTO directions(tenant_id, enterprise_id, name, code)
SELECT t.id, e.id, 'Operations', 'OPS'
FROM tenants t JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
WHERE NOT EXISTS (
  SELECT 1 FROM directions d WHERE d.tenant_id=t.id AND d.enterprise_id=e.id AND d.code='OPS'
);

-- Services
INSERT INTO services(tenant_id, direction_id, name, code)
SELECT t.id, d.id, 'Engineering', 'ENG'
FROM tenants t
JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN directions d ON d.enterprise_id=e.id AND d.code='TECH'
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.tenant_id=t.id AND s.direction_id=d.id AND s.code='ENG'
);

INSERT INTO services(tenant_id, direction_id, name, code)
SELECT t.id, d.id, 'Human Resources', 'HR'
FROM tenants t
JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN directions d ON d.enterprise_id=e.id AND d.code='OPS'
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.tenant_id=t.id AND s.direction_id=d.id AND s.code='HR'
);

-- Users
INSERT INTO users(tenant_id, enterprise_id, direction_id, service_id, email, username, password_hash, display_name, role)
SELECT t.id, e.id, d.id, s.id, 'admin@demo.local', 'admin', 'hashed_password_placeholder', 'Admin Demo', 'admin'
FROM tenants t
JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN directions d ON d.enterprise_id=e.id AND d.code='TECH'
JOIN services s ON s.direction_id=d.id AND s.code='ENG'
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.tenant_id=t.id AND u.email='admin@demo.local'
);

INSERT INTO users(tenant_id, enterprise_id, direction_id, service_id, email, username, password_hash, display_name, role)
SELECT t.id, e.id, d.id, s.id, 'manager@demo.local', 'manager', 'hashed_password_placeholder', 'Manager Demo', 'manager'
FROM tenants t
JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN directions d ON d.enterprise_id=e.id AND d.code='OPS'
JOIN services s ON s.direction_id=d.id AND s.code='HR'
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.tenant_id=t.id AND u.email='manager@demo.local'
);

INSERT INTO users(tenant_id, enterprise_id, direction_id, service_id, email, username, password_hash, display_name, role)
SELECT t.id, e.id, d.id, s.id, 'agent@demo.local', 'agent', 'hashed_password_placeholder', 'Agent Demo', 'agent'
FROM tenants t
JOIN enterprises e ON e.tenant_id=t.id AND e.code='DEMO'
JOIN directions d ON d.enterprise_id=e.id AND d.code='OPS'
JOIN services s ON s.direction_id=d.id AND s.code='HR'
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.tenant_id=t.id AND u.email='agent@demo.local'
);

-- Notification templates
INSERT INTO notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'course_invite_email', 'email', 'Invitation à une formation', 'Bonjour {{name}}, vous êtes invité à la formation {{course}}.'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM notification_templates nt WHERE nt.tenant_id=t.id AND nt.code='course_invite_email');

INSERT INTO notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'quiz_result_email', 'email', 'Résultat de votre quiz', 'Vous avez obtenu {{score}}% au quiz {{quiz}}.'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM notification_templates nt WHERE nt.tenant_id=t.id AND nt.code='quiz_result_email');

INSERT INTO notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'course_invite_whatsapp', 'whatsapp', NULL, 'Formation: {{course}}. Lien: {{link}}'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM notification_templates nt WHERE nt.tenant_id=t.id AND nt.code='course_invite_whatsapp');

INSERT INTO notification_templates(tenant_id, code, channel, subject, body)
SELECT t.id, 'reminder_sms', 'sms', NULL, 'Rappel: formation {{course}} demain.'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM notification_templates nt WHERE nt.tenant_id=t.id AND nt.code='reminder_sms');

-- Badges
INSERT INTO badges(tenant_id, code, name, description, criteria)
SELECT t.id, 'QUIZ_70', 'Quiz 70%', 'Badge obtenu pour score >= 70%', '{"min_score":70}'::jsonb
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM badges b WHERE b.tenant_id=t.id AND b.code='QUIZ_70');

-- Blog Categories & Tags
INSERT INTO categories(tenant_id, name)
SELECT t.id, 'Annonces'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.tenant_id=t.id AND c.name='Annonces');

INSERT INTO tags(tenant_id, name)
SELECT t.id, 'Formation'
FROM tenants t WHERE t.slug='default'
AND NOT EXISTS (SELECT 1 FROM tags tg WHERE tg.tenant_id=t.id AND tg.name='Formation');

COMMIT;

-- End of schema
