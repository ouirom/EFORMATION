-- 038_subsidiaries.sql
-- Adds the "filiale" (subsidiary) level to the organization structure:
--   entreprise -> filiale -> direction -> service
-- The level is optional: a direction either belongs to a subsidiary of its
-- enterprise or directly to the enterprise (directions.subsidiary_id NULL),
-- so every existing structure stays valid as-is.
--   subsidiaries             -- per tenant, child of an enterprise
--   directions.subsidiary_id -- NULL = attached directly to the enterprise
--   users.subsidiary_id      -- kept in sync with the user's direction (like
--                               enterprise_id), so targeting a subsidiary is the
--                               same simple match as targeting an enterprise
--   course_assignments / team_members accept the 'subsidiary' target type
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS subsidiaries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id),
  enterprise_id BIGINT NOT NULL REFERENCES enterprises(id),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);
CREATE INDEX IF NOT EXISTS ix_subsidiaries_tenant_enterprise ON subsidiaries (tenant_id, enterprise_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'directions' AND column_name = 'subsidiary_id') THEN
    ALTER TABLE directions ADD COLUMN subsidiary_id BIGINT NULL REFERENCES subsidiaries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'subsidiary_id') THEN
    ALTER TABLE users ADD COLUMN subsidiary_id BIGINT NULL REFERENCES subsidiaries(id);
  END IF;

  ALTER TABLE course_assignments DROP CONSTRAINT IF EXISTS course_assignments_assignment_type_check;
  ALTER TABLE course_assignments ADD CONSTRAINT course_assignments_assignment_type_check
    CHECK (assignment_type IN ('role', 'service', 'direction', 'subsidiary', 'enterprise', 'user', 'team'));

  ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_member_type_check;
  ALTER TABLE team_members ADD CONSTRAINT team_members_member_type_check
    CHECK (member_type IN ('user', 'enterprise', 'subsidiary', 'direction', 'service'));
END $$;
