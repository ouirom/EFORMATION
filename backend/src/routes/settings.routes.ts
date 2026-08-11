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

export default router;
