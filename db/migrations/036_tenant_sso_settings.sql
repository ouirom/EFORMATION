-- 036_tenant_sso_settings.sql
-- Single sign-on per organization (Administration > SSO & annuaire). Until now
-- Azure AD, Google and LDAP were configured once for the whole platform in
-- backend/.env, and every new SSO/LDAP account landed in DEFAULT_TENANT_ID.
-- Each organization can now bring its own identity provider. Read by
-- SsoConfigService; the .env values remain the fallback for the default tenant.
-- Secrets are stored like the SMTP password (email_settings.smtp_password) and
-- never returned by the API.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS tenant_sso_settings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL UNIQUE REFERENCES tenants(id),
  azure_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  azure_directory_id VARCHAR(100) NULL,
  azure_client_id VARCHAR(100) NULL,
  azure_client_secret TEXT NULL,
  google_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  google_client_id VARCHAR(255) NULL,
  google_client_secret TEXT NULL,
  ldap_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ldap_url VARCHAR(255) NULL,
  ldap_bind_dn VARCHAR(255) NULL,
  ldap_bind_password TEXT NULL,
  ldap_search_base VARCHAR(255) NULL,
  ldap_search_filter VARCHAR(255) NULL,
  ldap_email_attribute VARCHAR(100) NULL,
  ldap_name_attribute VARCHAR(100) NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
);
