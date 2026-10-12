-- 042_user_sessions.sql
-- One row per login (password, external portal, LDAP, SSO): the "session" the
-- access and refresh tokens belong to, so a session can be listed (Profil >
-- Sécurité), revoked (logout, "déconnecter cet appareil", admin force-logout,
-- password change) and its refresh token rotated with reuse detection.
--   sid               -- random id carried by both tokens (claim `sid`)
--   refresh_jti_hash  -- SHA-256 of the current refresh token's jti; never the token itself
--   previous_jti_hash -- the jti it replaced, accepted for a few seconds (two tabs
--                        refreshing at once); any older one is a stolen token
--   auth_method       -- password | ldap | sso_azure_ad | sso_google
--   revoked_reason    -- logout | user_revoked | others_revoked | admin_force_logout |
--                        password_changed | password_reset | reuse_detected | not_me ...
-- Rows are purged by a daily job once expired/revoked for 90 days.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS user_sessions (
  id                BIGSERIAL PRIMARY KEY,
  sid               VARCHAR(36) NOT NULL,
  tenant_id         BIGINT NOT NULL,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_jti_hash  VARCHAR(64) NOT NULL,
  previous_jti_hash VARCHAR(64) NULL,
  rotated_at        TIMESTAMP NULL,
  auth_method       VARCHAR(20) NOT NULL DEFAULT 'password',
  user_agent        VARCHAR(500) NULL,
  ip                VARCHAR(64) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  last_used_at      TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  expires_at        TIMESTAMP NOT NULL,
  revoked_at        TIMESTAMP NULL,
  revoked_reason    VARCHAR(30) NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_sid ON user_sessions (sid);
CREATE INDEX IF NOT EXISTS ix_user_sessions_user ON user_sessions (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_user_sessions_expires ON user_sessions (expires_at);
