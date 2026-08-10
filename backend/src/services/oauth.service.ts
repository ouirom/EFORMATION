import axios from 'axios';
import { config } from '../config';
import { ApiError, BadRequestError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export interface OAuthProfile {
  externalId: string;
  email: string;
  displayName: string;
}

/**
 * Exchanges an OAuth authorization code for a verified user profile, calling the
 * provider's own token + userinfo endpoints server-side. The frontend never supplies
 * identity claims directly — only the provider's response is trusted.
 */
export class OAuthService {
  static async exchangeAzureCode(code: string): Promise<OAuthProfile> {
    const { tenantId, clientId, clientSecret } = config.azureAd;
    if (!clientId || !clientSecret) {
      throw BadRequestError('Azure AD SSO is not configured on this server', 'SSO_NOT_CONFIGURED');
    }

    try {
      const redirectUri = `${config.frontendUrl}/auth/callback/azure`;

      const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${tenantId || 'common'}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'openid profile email User.Read',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenResponse.data.access_token;

      const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const profile = profileResponse.data;
      const email = profile.mail || profile.userPrincipalName;
      if (!email) {
        throw BadRequestError('Your Azure AD account has no email address');
      }

      return {
        externalId: profile.id,
        email,
        displayName: profile.displayName || email,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.warn({ err: error }, 'Azure AD code exchange failed');
      throw BadRequestError('Azure AD authentication failed', 'SSO_EXCHANGE_FAILED');
    }
  }

  static async exchangeGoogleCode(code: string): Promise<OAuthProfile> {
    const { clientId, clientSecret } = config.google;
    if (!clientId || !clientSecret) {
      throw BadRequestError('Google SSO is not configured on this server', 'SSO_NOT_CONFIGURED');
    }

    try {
      const redirectUri = `${config.frontendUrl}/auth/callback/google`;

      const tokenResponse = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenResponse.data.access_token;

      const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const profile = profileResponse.data;
      if (!profile.email) {
        throw BadRequestError('Your Google account has no email address');
      }

      return {
        externalId: profile.sub,
        email: profile.email,
        displayName: profile.name || profile.email,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.warn({ err: error }, 'Google code exchange failed');
      throw BadRequestError('Google authentication failed', 'SSO_EXCHANGE_FAILED');
    }
  }
}
