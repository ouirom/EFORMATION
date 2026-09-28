import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { RoomServiceClient } from 'livekit-server-sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db } from '../database/db-helpers';
import { BadRequestError } from '../middleware/error.middleware';
import { NotificationService } from '../services/notification.service';
import { InactivityPolicyService, INACTIVITY_POLICY_ROLES } from '../services/inactivity.service';
import { LiveKitService } from '../services/livekit.service';
import { RecordingService } from '../services/recording.service';
import { AuditService } from '../services/audit.service';
import { LdapService } from '../services/ldap.service';
import { DEFAULT_LDAP_SEARCH_FILTER, SsoConfigService } from '../services/sso-config.service';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

const MASKED_PASSWORD = '••••••••';

/**
 * @route GET /api/v1/settings/email
 * @desc Get the tenant's email (SMTP) notification settings
 */
router.get('/email', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const rows = await DatabaseService.query<any>(
      'SELECT * FROM email_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );

    const settings = rows[0] || {
      enabled: false,
      smtp_host: '',
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: '',
      smtp_password: null,
      from_email: '',
      from_name: '',
    };

    res.json({
      success: true,
      data: {
        enabled: !!settings.enabled,
        smtpHost: settings.smtp_host || '',
        smtpPort: settings.smtp_port,
        smtpSecure: !!settings.smtp_secure,
        smtpUser: settings.smtp_user || '',
        // Never return the real secret; the frontend only re-sends it if the admin types a new one.
        smtpPassword: settings.smtp_password ? MASKED_PASSWORD : '',
        fromEmail: settings.from_email || '',
        fromName: settings.from_name || '',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/settings/email
 * @desc Update the tenant's email (SMTP) notification settings
 */
router.put(
  '/email',
  authenticate,
  authorize('admin'),
  [
    body('enabled').isBoolean(),
    body('smtpHost').optional({ nullable: true }).isString(),
    body('smtpPort').isInt({ min: 1, max: 65535 }),
    body('smtpSecure').isBoolean(),
    body('smtpUser').optional({ nullable: true }).isString(),
    body('smtpPassword').optional({ nullable: true }).isString(),
    body('fromEmail').optional({ nullable: true }).isString(),
    body('fromName').optional({ nullable: true }).isString(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number; smtp_password: string | null }>(
        'SELECT id, smtp_password FROM email_settings WHERE tenant_id = @tenantId',
        { tenantId }
      );

      // Keep the stored secret if the client sent back the masked placeholder (i.e. didn't change it).
      const incomingPassword = req.body.smtpPassword;
      const smtpPassword =
        incomingPassword === MASKED_PASSWORD || incomingPassword === undefined
          ? existing[0]?.smtp_password ?? null
          : incomingPassword || null;

      const params = {
        tenantId,
        enabled: req.body.enabled,
        smtpHost: req.body.smtpHost || null,
        smtpPort: req.body.smtpPort,
        smtpSecure: req.body.smtpSecure,
        smtpUser: req.body.smtpUser || null,
        smtpPassword,
        fromEmail: req.body.fromEmail || null,
        fromName: req.body.fromName || null,
      };

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO email_settings (
             tenant_id, enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, from_name
           ) VALUES (
             @tenantId, @enabled, @smtpHost, @smtpPort, @smtpSecure, @smtpUser, @smtpPassword, @fromEmail, @fromName
           )`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE email_settings SET
             enabled = @enabled, smtp_host = @smtpHost, smtp_port = @smtpPort,
             smtp_secure = @smtpSecure, smtp_user = @smtpUser, smtp_password = @smtpPassword,
             from_email = @fromEmail, from_name = @fromName, updated_at = ${db.now()}
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      NotificationService.invalidateEmailSettingsCache(tenantId);

      res.json({ success: true, message: 'Email settings updated' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/settings/email/test
 * @desc Send a test email using the tenant's configured SMTP settings
 */
router.post(
  '/email/test',
  authenticate,
  authorize('admin'),
  [body('to').isEmail()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      await NotificationService.sendTestEmail(req.user!.tenantId, req.body.to);
      res.json({ success: true, message: 'Test email sent' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/settings/livekit
 * @desc Get the tenant's LiveKit (embedded video conferencing) settings
 */
router.get('/livekit', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const rows = await DatabaseService.query<any>(
      'SELECT * FROM livekit_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );

    const settings = rows[0] || {
      enabled: false,
      url: '',
      api_key: '',
      api_secret: null,
    };

    res.json({
      success: true,
      data: {
        enabled: !!settings.enabled,
        url: settings.url || '',
        apiKey: settings.api_key || '',
        // Never return the real secret; the frontend only re-sends it if the admin types a new one.
        apiSecret: settings.api_secret ? MASKED_PASSWORD : '',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/settings/livekit
 * @desc Update the tenant's LiveKit settings
 */
router.put(
  '/livekit',
  authenticate,
  authorize('admin'),
  [
    body('enabled').isBoolean(),
    body('url').optional({ nullable: true }).isString(),
    body('apiKey').optional({ nullable: true }).isString(),
    body('apiSecret').optional({ nullable: true }).isString(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number; api_secret: string | null }>(
        'SELECT id, api_secret FROM livekit_settings WHERE tenant_id = @tenantId',
        { tenantId }
      );

      // Keep the stored secret if the client sent back the masked placeholder (i.e. didn't change it).
      const incomingSecret = req.body.apiSecret;
      const apiSecret =
        incomingSecret === MASKED_PASSWORD || incomingSecret === undefined
          ? existing[0]?.api_secret ?? null
          : incomingSecret || null;

      const params = {
        tenantId,
        enabled: req.body.enabled,
        url: req.body.url || null,
        apiKey: req.body.apiKey || null,
        apiSecret,
      };

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO livekit_settings (tenant_id, enabled, url, api_key, api_secret)
           VALUES (@tenantId, @enabled, @url, @apiKey, @apiSecret)`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE livekit_settings SET
             enabled = @enabled, url = @url, api_key = @apiKey, api_secret = @apiSecret,
             updated_at = ${db.now()}
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      LiveKitService.invalidateLiveKitSettingsCache(tenantId);

      res.json({ success: true, message: 'LiveKit settings updated' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/settings/livekit/test
 * @desc Verify the tenant's (or, absent one, the global) LiveKit credentials actually work
 */
router.post('/livekit/test', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    LiveKitService.invalidateLiveKitSettingsCache(req.user!.tenantId);
    const liveKitConfig = await LiveKitService.getLiveKitConfig(req.user!.tenantId);
    if (!liveKitConfig) {
      throw BadRequestError("Aucune configuration LiveKit n'est disponible (ni tenant, ni globale).");
    }

    const host = liveKitConfig.url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    const client = new RoomServiceClient(host, liveKitConfig.apiKey, liveKitConfig.apiSecret);
    try {
      await client.listRooms();
    } catch (err: any) {
      throw BadRequestError(`Connexion à LiveKit échouée : ${err?.message || 'erreur inconnue'}`);
    }

    res.json({ success: true, message: 'Connexion LiveKit réussie' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/settings/recording-storage
 * @desc Get the tenant's S3-compatible storage settings for live-session recordings (LiveKit Egress)
 */
router.get('/recording-storage', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const rows = await DatabaseService.query<any>(
      'SELECT * FROM recording_storage_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );

    const settings = rows[0] || {
      enabled: false,
      bucket: '',
      region: '',
      endpoint: '',
      access_key: '',
      secret_key: null,
    };

    res.json({
      success: true,
      data: {
        enabled: !!settings.enabled,
        bucket: settings.bucket || '',
        region: settings.region || '',
        endpoint: settings.endpoint || '',
        accessKey: settings.access_key || '',
        // Never return the real secret; the frontend only re-sends it if the admin types a new one.
        secretKey: settings.secret_key ? MASKED_PASSWORD : '',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/settings/recording-storage
 * @desc Update the tenant's recording storage settings
 */
router.put(
  '/recording-storage',
  authenticate,
  authorize('admin'),
  [
    body('enabled').isBoolean(),
    body('bucket').optional({ nullable: true }).isString(),
    body('region').optional({ nullable: true }).isString(),
    body('endpoint').optional({ nullable: true }).isString(),
    body('accessKey').optional({ nullable: true }).isString(),
    body('secretKey').optional({ nullable: true }).isString(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number; secret_key: string | null }>(
        'SELECT id, secret_key FROM recording_storage_settings WHERE tenant_id = @tenantId',
        { tenantId }
      );

      // Keep the stored secret if the client sent back the masked placeholder (i.e. didn't change it).
      const incomingSecret = req.body.secretKey;
      const secretKey =
        incomingSecret === MASKED_PASSWORD || incomingSecret === undefined
          ? existing[0]?.secret_key ?? null
          : incomingSecret || null;

      const params = {
        tenantId,
        enabled: req.body.enabled,
        bucket: req.body.bucket || null,
        region: req.body.region || null,
        endpoint: req.body.endpoint || null,
        accessKey: req.body.accessKey || null,
        secretKey,
      };

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO recording_storage_settings (tenant_id, enabled, bucket, region, endpoint, access_key, secret_key)
           VALUES (@tenantId, @enabled, @bucket, @region, @endpoint, @accessKey, @secretKey)`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE recording_storage_settings SET
             enabled = @enabled, bucket = @bucket, region = @region, endpoint = @endpoint,
             access_key = @accessKey, secret_key = @secretKey, updated_at = ${db.now()}
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      RecordingService.invalidateRecordingStorageCache(tenantId);

      res.json({ success: true, message: 'Recording storage settings updated' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/settings/inactivity-policies
 * @desc List the tenant's per-role inactivity-suspension thresholds. A role
 *       with no policy row is never auto-suspended.
 */
router.get('/inactivity-policies', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const policies = await InactivityPolicyService.getPolicies(req.user!.tenantId);
    res.json({ success: true, data: policies });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/settings/inactivity-policies
 * @desc Set (or, with maxInactiveDays: null, remove) the inactivity-suspension
 *       threshold for one role. admin/super_admin can never be targeted.
 */
router.put(
  '/inactivity-policies',
  authenticate,
  authorize('admin'),
  [
    body('role').isIn(INACTIVITY_POLICY_ROLES),
    body('maxInactiveDays').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const maxInactiveDays = req.body.maxInactiveDays === undefined ? null : req.body.maxInactiveDays;
      await InactivityPolicyService.setPolicy(req.user!.tenantId, req.body.role, maxInactiveDays, req.user!.id);
      res.json({ success: true, message: 'Inactivity policy updated' });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== SSO & DIRECTORY (per organization) ====================

const SSO_SECRET_FIELDS = {
  azureClientSecret: 'azure_client_secret',
  googleClientSecret: 'google_client_secret',
  ldapBindPassword: 'ldap_bind_password',
} as const;

/** Masked secret on the way out, like the SMTP password: never the real value. */
const maskSecret = (value: string | null | undefined) => (value ? MASKED_PASSWORD : '');

/**
 * @route GET /api/v1/settings/sso
 * @desc The organization's identity providers (Azure AD, Google, LDAP), secrets
 *       masked, plus the redirect URIs to register with the providers.
 */
router.get('/sso', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const rows = await DatabaseService.query<any>('SELECT * FROM tenant_sso_settings WHERE tenant_id = @tenantId', {
      tenantId,
    });
    const row = rows[0] || {};
    const resolved = await SsoConfigService.get(tenantId);

    res.json({
      success: true,
      data: {
        azureEnabled: !!row.azure_enabled,
        azureDirectoryId: row.azure_directory_id || '',
        azureClientId: row.azure_client_id || '',
        azureClientSecret: maskSecret(row.azure_client_secret),
        googleEnabled: !!row.google_enabled,
        googleClientId: row.google_client_id || '',
        googleClientSecret: maskSecret(row.google_client_secret),
        ldapEnabled: !!row.ldap_enabled,
        ldapUrl: row.ldap_url || '',
        ldapBindDn: row.ldap_bind_dn || '',
        ldapBindPassword: maskSecret(row.ldap_bind_password),
        ldapSearchBase: row.ldap_search_base || '',
        ldapSearchFilter: row.ldap_search_filter || DEFAULT_LDAP_SEARCH_FILTER,
        ldapEmailAttribute: row.ldap_email_attribute || 'mail',
        ldapNameAttribute: row.ldap_name_attribute || 'displayName',
        redirectUris: {
          azure: SsoConfigService.redirectUri('azure'),
          google: SsoConfigService.redirectUri('google'),
        },
        // What the login page will actually offer, and whether it's this
        // organization's provider or the platform one (.env, default tenant only).
        active: resolved.source,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/settings/sso
 * @desc Save the organization's identity providers. A secret sent back masked
 *       (or omitted) keeps its stored value; an empty string clears it.
 */
router.put(
  '/sso',
  authenticate,
  authorize('admin'),
  [
    body('azureEnabled').optional().isBoolean(),
    body('googleEnabled').optional().isBoolean(),
    body('ldapEnabled').optional().isBoolean(),
    body(['azureDirectoryId', 'azureClientId', 'googleClientId', 'ldapBindDn', 'ldapSearchBase', 'ldapEmailAttribute', 'ldapNameAttribute'])
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 255 }),
    body(['azureClientSecret', 'googleClientSecret', 'ldapBindPassword']).optional({ nullable: true }).isString(),
    body('ldapUrl')
      .optional({ nullable: true })
      .custom((value) => !value || /^ldaps?:\/\/[^\s]+$/i.test(value))
      .withMessage('The LDAP URL must start with ldap:// or ldaps://'),
    body('ldapSearchFilter')
      .optional({ nullable: true })
      .custom((value) => !value || String(value).includes('{{username}}'))
      .withMessage('The LDAP search filter must contain {{username}}'),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;
      const b = req.body;

      const existing = await DatabaseService.query<any>('SELECT * FROM tenant_sso_settings WHERE tenant_id = @tenantId', {
        tenantId,
      });
      const current = existing[0] || {};

      const secret = (field: keyof typeof SSO_SECRET_FIELDS) => {
        const incoming = b[field];
        return incoming === undefined || incoming === MASKED_PASSWORD
          ? current[SSO_SECRET_FIELDS[field]] ?? null
          : incoming || null;
      };
      const text = (field: string, column: string) =>
        b[field] === undefined ? current[column] ?? null : String(b[field] ?? '').trim() || null;
      const flag = (field: string, column: string) => (b[field] === undefined ? !!current[column] : !!b[field]);

      const params = {
        tenantId,
        azureEnabled: flag('azureEnabled', 'azure_enabled'),
        azureDirectoryId: text('azureDirectoryId', 'azure_directory_id'),
        azureClientId: text('azureClientId', 'azure_client_id'),
        azureClientSecret: secret('azureClientSecret'),
        googleEnabled: flag('googleEnabled', 'google_enabled'),
        googleClientId: text('googleClientId', 'google_client_id'),
        googleClientSecret: secret('googleClientSecret'),
        ldapEnabled: flag('ldapEnabled', 'ldap_enabled'),
        ldapUrl: text('ldapUrl', 'ldap_url'),
        ldapBindDn: text('ldapBindDn', 'ldap_bind_dn'),
        ldapBindPassword: secret('ldapBindPassword'),
        ldapSearchBase: text('ldapSearchBase', 'ldap_search_base'),
        ldapSearchFilter: text('ldapSearchFilter', 'ldap_search_filter'),
        ldapEmailAttribute: text('ldapEmailAttribute', 'ldap_email_attribute'),
        ldapNameAttribute: text('ldapNameAttribute', 'ldap_name_attribute'),
        updatedBy: req.user!.id,
      };

      // An enabled provider must be usable: otherwise the login page would offer a
      // button that can only fail.
      const missing: string[] = [];
      if (params.azureEnabled && !(params.azureClientId && params.azureClientSecret)) missing.push('Azure AD');
      if (params.googleEnabled && !(params.googleClientId && params.googleClientSecret)) missing.push('Google');
      if (params.ldapEnabled && !(params.ldapUrl && params.ldapBindDn && params.ldapBindPassword && params.ldapSearchBase)) {
        missing.push('LDAP');
      }
      if (missing.length > 0) {
        throw BadRequestError(`Incomplete configuration for: ${missing.join(', ')}`, 'SSO_INCOMPLETE', { missing });
      }

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO tenant_sso_settings (
             tenant_id, azure_enabled, azure_directory_id, azure_client_id, azure_client_secret,
             google_enabled, google_client_id, google_client_secret,
             ldap_enabled, ldap_url, ldap_bind_dn, ldap_bind_password, ldap_search_base,
             ldap_search_filter, ldap_email_attribute, ldap_name_attribute, updated_by
           ) VALUES (
             @tenantId, @azureEnabled, @azureDirectoryId, @azureClientId, @azureClientSecret,
             @googleEnabled, @googleClientId, @googleClientSecret,
             @ldapEnabled, @ldapUrl, @ldapBindDn, @ldapBindPassword, @ldapSearchBase,
             @ldapSearchFilter, @ldapEmailAttribute, @ldapNameAttribute, @updatedBy
           )`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE tenant_sso_settings SET
             azure_enabled = @azureEnabled, azure_directory_id = @azureDirectoryId,
             azure_client_id = @azureClientId, azure_client_secret = @azureClientSecret,
             google_enabled = @googleEnabled, google_client_id = @googleClientId,
             google_client_secret = @googleClientSecret,
             ldap_enabled = @ldapEnabled, ldap_url = @ldapUrl, ldap_bind_dn = @ldapBindDn,
             ldap_bind_password = @ldapBindPassword, ldap_search_base = @ldapSearchBase,
             ldap_search_filter = @ldapSearchFilter, ldap_email_attribute = @ldapEmailAttribute,
             ldap_name_attribute = @ldapNameAttribute, updated_by = @updatedBy, updated_at = ${db.now()}
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      SsoConfigService.invalidate(tenantId);
      // Audit which providers changed state, never the secrets themselves.
      await AuditService.log(tenantId, req.user!.id, 'SSO_SETTINGS_UPDATED', 'tenant_sso_settings', null, {
        azureEnabled: params.azureEnabled,
        googleEnabled: params.googleEnabled,
        ldapEnabled: params.ldapEnabled,
      });

      res.json({ success: true, message: 'SSO settings updated' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/settings/sso/ldap/test
 * @desc Bind with the service account and read the search base, using the
 *       values in the form (masked password = the stored one). Saves nothing.
 */
router.post('/sso/ldap/test', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const rows = await DatabaseService.query<any>('SELECT ldap_bind_password FROM tenant_sso_settings WHERE tenant_id = @tenantId', {
      tenantId,
    });
    const b = req.body || {};
    const bindPassword =
      b.ldapBindPassword === undefined || b.ldapBindPassword === MASKED_PASSWORD ? rows[0]?.ldap_bind_password : b.ldapBindPassword;

    if (!b.ldapUrl || !/^ldaps?:\/\//i.test(b.ldapUrl) || !b.ldapBindDn || !bindPassword || !b.ldapSearchBase) {
      throw BadRequestError('Fill in the URL, service account, password and search base first', 'SSO_INCOMPLETE');
    }

    await LdapService.testConnection({
      url: b.ldapUrl,
      bindDN: b.ldapBindDn,
      bindPassword,
      searchBase: b.ldapSearchBase,
      searchFilter: b.ldapSearchFilter || DEFAULT_LDAP_SEARCH_FILTER,
      emailAttribute: b.ldapEmailAttribute || 'mail',
      nameAttribute: b.ldapNameAttribute || 'displayName',
    });
    res.json({ success: true, message: 'LDAP connection succeeded' });
  } catch (error) {
    next(error);
  }
});

export default router;
