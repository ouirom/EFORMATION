import { Client } from 'ldapts';
import { config } from '../config';
import { ApiError, BadRequestError, UnauthorizedError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export interface LdapProfile {
  email: string;
  displayName: string;
}

// Escapes characters with special meaning in an LDAP search filter (RFC 4515) so a
// username can never be used to inject extra filter clauses.
function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (char) => {
    switch (char) {
      case '\\': return '\\5c';
      case '*': return '\\2a';
      case '(': return '\\28';
      case ')': return '\\29';
      default: return '\\00';
    }
  });
}

function firstValue(attr: unknown): string | undefined {
  if (Array.isArray(attr)) return attr[0] !== undefined ? String(attr[0]) : undefined;
  if (attr !== undefined && attr !== null) return String(attr);
  return undefined;
}

export class LdapService {
  static isConfigured(): boolean {
    const { url, bindDN, bindPassword, searchBase } = config.ldap;
    return !!(url && bindDN && bindPassword && searchBase);
  }

  /**
   * Authenticates a user against the configured LDAP/Active Directory server:
   * binds with the service account to resolve the user's DN, then re-binds as
   * that DN with the submitted password to verify the credential itself.
   */
  static async authenticate(username: string, password: string): Promise<LdapProfile> {
    if (!this.isConfigured()) {
      throw BadRequestError('LDAP authentication is not configured on this server', 'LDAP_NOT_CONFIGURED');
    }
    if (!username || !password) {
      throw BadRequestError('Username and password are required');
    }

    const { url, bindDN, bindPassword, searchBase, searchFilter, emailAttribute, nameAttribute } = config.ldap;
    const client = new Client({ url });

    try {
      await client.bind(bindDN, bindPassword);

      const filter = searchFilter.replace(/\{\{username\}\}/g, escapeLdapFilter(username));
      const { searchEntries } = await client.search(searchBase, {
        scope: 'sub',
        filter,
        attributes: [emailAttribute, nameAttribute],
      });

      if (searchEntries.length === 0) {
        throw UnauthorizedError('Invalid username or password');
      }

      const entry = searchEntries[0];

      // Re-bind on the same connection as the resolved user to verify their password
      await client.bind(entry.dn, password);

      const email = firstValue(entry[emailAttribute]);
      const displayName = firstValue(entry[nameAttribute]);

      if (!email) {
        throw BadRequestError('This LDAP account has no email address configured');
      }

      return { email, displayName: displayName || username };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.warn({ err: error, username }, 'LDAP authentication failed');
      throw UnauthorizedError('Invalid username or password');
    } finally {
      await client.unbind().catch(() => {});
    }
  }
}
