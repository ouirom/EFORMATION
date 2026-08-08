"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const notification_service_1 = require("../services/notification.service");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
const MASKED_PASSWORD = '••••••••';
/**
 * @route GET /api/v1/settings/email
 * @desc Get the tenant's email (SMTP) notification settings
 */
router.get('/email', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const tenantId = req.user.tenantId;
        const rows = await database_service_1.DatabaseService.query('SELECT * FROM email_settings WHERE tenant_id = @tenantId', { tenantId });
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
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/settings/email
 * @desc Update the tenant's email (SMTP) notification settings
 */
router.put('/email', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [
    (0, express_validator_1.body)('enabled').isBoolean(),
    (0, express_validator_1.body)('smtpHost').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('smtpPort').isInt({ min: 1, max: 65535 }),
    (0, express_validator_1.body)('smtpSecure').isBoolean(),
    (0, express_validator_1.body)('smtpUser').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('smtpPassword').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('fromEmail').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('fromName').optional({ nullable: true }).isString(),
], async (req, res, next) => {
    try {
        validate(req);
        const tenantId = req.user.tenantId;
        const existing = await database_service_1.DatabaseService.query('SELECT id, smtp_password FROM email_settings WHERE tenant_id = @tenantId', { tenantId });
        // Keep the stored secret if the client sent back the masked placeholder (i.e. didn't change it).
        const incomingPassword = req.body.smtpPassword;
        const smtpPassword = incomingPassword === MASKED_PASSWORD || incomingPassword === undefined
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
            await database_service_1.DatabaseService.execute(`INSERT INTO email_settings (
             tenant_id, enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, from_name
           ) VALUES (
             @tenantId, @enabled, @smtpHost, @smtpPort, @smtpSecure, @smtpUser, @smtpPassword, @fromEmail, @fromName
           )`, params);
        }
        else {
            await database_service_1.DatabaseService.execute(`UPDATE email_settings SET
             enabled = @enabled, smtp_host = @smtpHost, smtp_port = @smtpPort,
             smtp_secure = @smtpSecure, smtp_user = @smtpUser, smtp_password = @smtpPassword,
             from_email = @fromEmail, from_name = @fromName, updated_at = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId`, params);
        }
        notification_service_1.NotificationService.invalidateEmailSettingsCache(tenantId);
        res.json({ success: true, message: 'Email settings updated' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/settings/email/test
 * @desc Send a test email using the tenant's configured SMTP settings
 */
router.post('/email/test', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [(0, express_validator_1.body)('to').isEmail()], async (req, res, next) => {
    try {
        validate(req);
        await notification_service_1.NotificationService.sendTestEmail(req.user.tenantId, req.body.to);
        res.json({ success: true, message: 'Test email sent' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=settings.routes.js.map