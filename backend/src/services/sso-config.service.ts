import jwt from 'jsonwebtoken';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { BadRequestError } from '../middleware/error.middleware';

/**
 * Identity providers of an organization (Administration > SSO & annuaire).
 * Each organization can bring its own Azure AD app, Google OAuth client and
 * LDAP directory (table tenant_sso_settings). The platform-wide values from
 * backend/.env stay in use for the default tenant only (DEFAULT_TENANT_ID), which
 * is where they always provisioned accounts; another organization never gets
 * the platform's identity provider by accident.
 */
export type SsoProvider = 'azure' | 'google';

export interface AzureConfig {
  directoryId: string;
  clientId: string;
  clientSecret: string;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface LdapConfig {
  url: string;
  bindDN: string;
  bindPassword: string;
  searchBase: string;
  searchFilter: string;
  emailAttribute: string;
  nameAttribute: string;
}

export interface TenantIdentityProviders {
  azure: AzureConfig | null;
  google: GoogleConfig | null;
  ldap: LdapConfig | null;
  /** Where each provider's configuration comes from, for the admin page. */
  source: Record<'azure' | 'google' | 'ldap', 'tenant' | 'platform' | null>;
}

export const DEFAULT_LDAP_SEARCH_FILTER = '(|(sAMAccountName={{username}})(mail={{username}}))';

const CACHE_TTL_MS = 10_000;
const cache = new Map<number, { value: TenantIdentityProviders; expires: number }>();

const STATE_TTL = '10m';

function platformAzure(): AzureConfig | null {
  const { tenantId, clientId, clientSecret } = config.azureAd;
  return clientId && clientSecret ? { directoryId: tenantId || 'common', clientId, clientSecret } : null;
}

function platformGoogle(): GoogleConfig | null {
  const { clientId, clientSecret } = config.google;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function platformLdap(): LdapConfig | null {
  const l = config.ldap;
  return l.url && l.bindDN && l.bindPassword && l.searchBase
    ? {
        url: l.url,
        bindDN: l.bindDN,
        bindPassword: l.bindPassword,
        searchBase: l.searchBase,
        searchFilter: l.searchFilter,
        emailAttribute: l.emailAttribute,
        nameAttribute: l.nameAttribute,
      }
    : null;
}

export class SsoConfigService {
  static async get(tenantId: number): Promise<TenantIdentityProviders> {
    const cached = cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.value;

    const rows = await DatabaseService.query<any>('SELECT * FROM tenant_sso_settings WHERE tenant_id = @tenantId', {
      tenantId,
    });
    const row = rows[0];
    const isDefaultTenant = tenantId === config.defaultTenantId;

    const tenantAzure: AzureConfig | null =
      row?.azure_enabled && row.azure_client_id && row.azure_client_secret
        ? { directoryId: row.azure_directory_id || 'common', clientId: row.azure_client_id, clientSecret: row.azure_client_secret }
        : null;
    const tenantGoogle: GoogleConfig | null =
      row?.google_enabled && row.google_client_id && row.google_client_secret
        ? { clientId: row.google_client_id, clientSecret: row.google_client_secret }
        : null;
    const tenantLdap: LdapConfig | null =
      row?.ldap_enabled && row.ldap_url && row.ldap_bind_dn && row.ldap_bind_password && row.ldap_search_base
        ? {
            url: row.ldap_url,
            bindDN: row.ldap_bind_dn,
            bindPassword: row.ldap_bind_password,
            searchBase: row.ldap_search_base,
            searchFilter: row.ldap_search_filter || DEFAULT_LDAP_SEARCH_FILTER,
            emailAttribute: row.ldap_email_attribute || 'mail',
            nameAttribute: row.ldap_name_attribute || 'displayName',
          }
        : null;

    // The organization's own provider wins; the .env one only serves the default tenant.
    const pick = <T>(own: T | null, platform: () => T | null): [T | null, 'tenant' | 'platform' | null] => {
      if (own) return [own, 'tenant'];
      const fallback = isDefaultTenant ? platform() : null;
      return [fallback, fallback ? 'platform' : null];
    };
    const [azure, azureSource] = pick(tenantAzure, platformAzure);
    const [google, googleSource] = pick(tenantGoogle, platformGoogle);
    const [ldap, ldapSource] = pick(tenantLdap, platformLdap);

    const value: TenantIdentityProviders = {
      azure,
      google,
      ldap,
      source: { azure: azureSource, google: googleSource, ldap: ldapSource },
    };
    cache.set(tenantId, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  static invalidate(tenantId: number): void {
    cache.delete(tenantId);
  }

  /** Test helper. */
  static clearCache(): void {
    cache.clear();
  }

  static redirectUri(provider: SsoProvider): string {
    return `${config.frontendUrl}/auth/callback/${provider}`;
  }

  /**
   * Signed OAuth `state`: names the organization whose provider started the
   * login (the callback must use the same credentials and provision into it),
   * and doubles as CSRF protection -- a callback without a state we issued is refused.
   */
  static signState(tenantId: number, provider: SsoProvider): string {
    return jwt.sign({ type: 'sso_state', tenantId, provider }, config.jwt.secret, { expiresIn: STATE_TTL });
  }

  static verifyState(state: unknown, provider: SsoProvider): number {
    try {
      const payload = jwt.verify(String(state || ''), config.jwt.secret) as any;
      if (payload?.type === 'sso_state' && payload.provider === provider && Number.isInteger(payload.tenantId)) {
        return payload.tenantId;
      }
    } catch {
      // fall through
    }
    throw BadRequestError('Invalid or expired SSO session, please start the login again', 'SSO_INVALID_STATE');
  }

  /** The provider's authorization URL, or 400 SSO_NOT_CONFIGURED. */
  static async authorizationUrl(tenantId: number, provider: SsoProvider): Promise<string> {
    const providers = await this.get(tenantId);
    const state = this.signState(tenantId, provider);
    const redirectUri = encodeURIComponent(this.redirectUri(provider));
    const scope = encodeURIComponent('openid profile email');

    if (provider === 'azure') {
      if (!providers.azure) throw BadRequestError('Azure AD SSO is not configured for this organization', 'SSO_NOT_CONFIGURED');
      const { directoryId, clientId } = providers.azure;
      return (
        `https://login.microsoftonline.com/${encodeURIComponent(directoryId)}/oauth2/v2.0/authorize?` +
        `client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${redirectUri}` +
        `&scope=${scope}&response_mode=query&state=${encodeURIComponent(state)}`
      );
    }
    if (!providers.google) throw BadRequestError('Google SSO is not configured for this organization', 'SSO_NOT_CONFIGURED');
    return (
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(providers.google.clientId)}&response_type=code&redirect_uri=${redirectUri}` +
      `&scope=${scope}&state=${encodeURIComponent(state)}`
    );
  }
}
