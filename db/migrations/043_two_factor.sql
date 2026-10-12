-- 043_two_factor.sql
-- Two-step sign-in by a 6-digit code sent by email (Administration >
-- Organisation > Accès & sécurité, Profil > Sécurité).
--   tenant_settings.two_factor_mode -- 'off' (default) | 'optional' (each user
--                                      chooses) | 'required' (every password/LDAP login)
--   users.two_factor_enabled        -- the user's own choice in 'optional' mode
--   two_factor_challenges           -- one row per code sent: the code is stored
--                                      HMAC-hashed, never in clear; 10 min validity,
--                                      5 attempts, resend throttled (60 s, 5 sends).
--                                      token_hash = SHA-256 of the opaque challenge
--                                      token handed to the browser.
--                                      Rows older than a day are purged daily.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = 'two_factor_mode') THEN
    ALTER TABLE tenant_settings ADD COLUMN two_factor_mode VARCHAR(10) NOT NULL DEFAULT 'off';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'two_factor_enabled') THEN
    ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id           BIGSERIAL PRIMARY KEY,
  token_hash   VARCHAR(64) NOT NULL,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      VARCHAR(10) NOT NULL,
  auth_method  VARCHAR(20) NULL,
  portal       VARCHAR(20) NULL,
  code_hash    VARCHAR(64) NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  send_count   INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  expires_at   TIMESTAMP NOT NULL,
  consumed_at  TIMESTAMP NULL,
  ip           VARCHAR(64) NULL,
  user_agent   VARCHAR(500) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_two_factor_challenges_token ON two_factor_challenges (token_hash);
CREATE INDEX IF NOT EXISTS ix_two_factor_challenges_created ON two_factor_challenges (created_at);
