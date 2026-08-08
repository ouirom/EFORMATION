-- GENERATED BRIDGE FILE, superseded once the full mssql schema/migration set is
-- converted to Knex migrations (see the DBMS-portability plan). This is NOT the
-- full 54-table schema (db/bci_lms_schema_sqlserver.sql) — it covers only the
-- core tables the pilot-converted files (auth.service.ts, user.routes.ts,
-- course.service.ts) and the 003 proof migration depend on, enough to run and
-- verify the portability work against a real PostgreSQL instance.
--
-- Note: db/bci_lms_schema.sql already exists as an older, now-stale attempt at
-- a full Postgres schema (predates migrations 001-010 and the externe/stagiaire
-- roles) and has its own unrelated bug (a partitioned chat_messages primary key
-- missing its partition column) — left as-is; reconciling it fully is a
-- separate, larger undertaking outside this session's scope.
--
-- Usage: psql -U <user> -d <database> -f db/bci_lms_schema_postgres_bridge.sql

CREATE TABLE IF NOT EXISTS tenants (
  id           BIGSERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL UNIQUE,
  slug         VARCHAR(255) NOT NULL UNIQUE,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS enterprises (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  name         VARCHAR(255) NOT NULL,
  code         VARCHAR(100) UNIQUE,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS directions (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES tenants(id),
  enterprise_id BIGINT NOT NULL REFERENCES enterprises(id),
  name          VARCHAR(255) NOT NULL,
  code          VARCHAR(100),
  created_at    TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at    TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS services (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  direction_id BIGINT NOT NULL REFERENCES directions(id),
  name         VARCHAR(255) NOT NULL,
  code         VARCHAR(100),
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- Role/status lists reflect db/migrations/008_externe_stagiaire_roles.sql and
-- db/migrations/009_user_status_and_inactivity.sql — not just the original schema.
CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES tenants(id),
  enterprise_id  BIGINT NULL REFERENCES enterprises(id),
  direction_id   BIGINT NULL REFERENCES directions(id),
  service_id     BIGINT NULL REFERENCES services(id),
  supervisor_id  BIGINT NULL REFERENCES users(id),
  email          VARCHAR(255) NOT NULL UNIQUE,
  username       VARCHAR(255) UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   VARCHAR(255) NOT NULL,
  role           VARCHAR(20) NOT NULL CHECK (role IN ('admin','director','manager','supervisor','agent','externe','stagiaire')),
  status         VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','disabled')),
  phone          VARCHAR(50) NULL,
  avatar_url     VARCHAR(500) NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMP NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  deleted_at     TIMESTAMP NULL
);

-- category/level/duration: referenced by course.service.ts but, as of this
-- writing, absent from BOTH the committed mssql schema and its migrations too
-- (confirmed by grep) -- a pre-existing schema-drift bug unrelated to
-- portability, not fixed here. Included in this bridge only so the pilot's
-- live pg smoke test can exercise CourseService.create/findAll at all.
CREATE TABLE IF NOT EXISTS courses (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES tenants(id),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  category       VARCHAR(100),
  level          VARCHAR(50),
  duration       INT,
  audience_scope JSONB,
  prerequisites  JSONB,
  is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     BIGINT NULL REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at     TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS course_evaluations (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  course_id    BIGINT NOT NULL REFERENCES courses(id),
  user_id      BIGINT NOT NULL REFERENCES users(id),
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  UNIQUE (tenant_id, course_id, user_id)
);

CREATE TABLE IF NOT EXISTS modules (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  course_id    BIGINT NOT NULL REFERENCES courses(id),
  title        VARCHAR(255) NOT NULL,
  position     INT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS lessons (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  module_id    BIGINT NOT NULL REFERENCES modules(id),
  title        VARCHAR(255) NOT NULL,
  position     INT NOT NULL,
  duration_min INT,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  updated_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  user_id      BIGINT NOT NULL REFERENCES users(id),
  email        BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp     BOOLEAN NOT NULL DEFAULT FALSE,
  sms          BOOLEAN NOT NULL DEFAULT FALSE,
  push_web     BOOLEAN NOT NULL DEFAULT TRUE,
  push_mobile  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  UNIQUE (tenant_id, user_id)
);

-- Flat notification columns per db/migrations/010_notifications_flat_columns.sql.
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  user_id      BIGINT NOT NULL REFERENCES users(id),
  channel      VARCHAR(20) NOT NULL DEFAULT 'in_app',
  subject      VARCHAR(500) NULL,
  body         TEXT NULL,
  action_url   VARCHAR(1000) NULL,
  metadata     JSONB NULL,
  read_at      TIMESTAMP NULL,
  sent_at      TIMESTAMP NULL,
  external_id  VARCHAR(255) NULL,
  failed_at    TIMESTAMP NULL,
  error_message TEXT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
