"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// ==================== CURRENT ORGANIZATION (tenant profile) ====================
const DEFAULT_TENANT_SETTINGS = {
    description: '',
    logo_url: null,
    primary_color: '#3B82F6',
    secondary_color: '#10B981',
    contact_email: '',
    contact_phone: '',
    address: '',
    website: '',
    allow_self_registration: true,
    default_language: 'fr',
    timezone: 'Europe/Paris',
    enable_notifications: true,
    enable_chat: true,
    enable_live_sessions: true,
    max_users_per_group: 50,
    certificate_validity: 365,
};
router.get('/current', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const tenantId = req.user.tenantId;
        const tenants = await database_service_1.DatabaseService.query('SELECT id, name, slug, created_at FROM tenants WHERE id = @tenantId', { tenantId });
        if (tenants.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Organization');
        const tenant = tenants[0];
        const settingsRows = await database_service_1.DatabaseService.query('SELECT * FROM tenant_settings WHERE tenant_id = @tenantId', { tenantId });
        const settings = settingsRows[0] || DEFAULT_TENANT_SETTINGS;
        const [[{ totalUsers }], [{ totalCourses }], [{ totalEnrollments }], [{ activeUsers }]] = await Promise.all([
            database_service_1.DatabaseService.query('SELECT COUNT(*) as totalUsers FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL', { tenantId }),
            database_service_1.DatabaseService.query('SELECT COUNT(*) as totalCourses FROM courses WHERE tenant_id = @tenantId', { tenantId }),
            database_service_1.DatabaseService.query('SELECT COUNT(*) as totalEnrollments FROM course_assignments WHERE tenant_id = @tenantId', { tenantId }),
            database_service_1.DatabaseService.query('SELECT COUNT(*) as activeUsers FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL AND is_active = 1', { tenantId }),
        ]);
        res.json({
            success: true,
            data: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                description: settings.description || '',
                logo: settings.logo_url,
                primaryColor: settings.primary_color,
                secondaryColor: settings.secondary_color,
                contactEmail: settings.contact_email || '',
                contactPhone: settings.contact_phone || '',
                address: settings.address || '',
                website: settings.website || '',
                settings: {
                    allowSelfRegistration: !!settings.allow_self_registration,
                    defaultLanguage: settings.default_language,
                    timezone: settings.timezone,
                    enableNotifications: !!settings.enable_notifications,
                    enableChat: !!settings.enable_chat,
                    enableLiveSessions: !!settings.enable_live_sessions,
                    maxUsersPerGroup: settings.max_users_per_group,
                    certificateValidity: settings.certificate_validity,
                },
                stats: { totalUsers, totalCourses, totalEnrollments, activeUsers },
                createdAt: tenant.created_at,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/current', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [
    (0, express_validator_1.body)('name').optional().trim().notEmpty(),
    (0, express_validator_1.body)('description').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('logo').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('primaryColor').optional().isString(),
    (0, express_validator_1.body)('secondaryColor').optional().isString(),
    (0, express_validator_1.body)('contactEmail').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('contactPhone').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('address').optional({ nullable: true }).isString(),
    (0, express_validator_1.body)('website').optional({ nullable: true }).isString(),
], async (req, res, next) => {
    try {
        validate(req);
        const tenantId = req.user.tenantId;
        if (req.body.name) {
            await database_service_1.DatabaseService.execute('UPDATE tenants SET name = @name WHERE id = @tenantId', { tenantId, name: req.body.name });
        }
        const existing = await database_service_1.DatabaseService.query('SELECT id FROM tenant_settings WHERE tenant_id = @tenantId', { tenantId });
        const params = {
            tenantId,
            description: req.body.description ?? '',
            logoUrl: req.body.logo ?? null,
            primaryColor: req.body.primaryColor ?? DEFAULT_TENANT_SETTINGS.primary_color,
            secondaryColor: req.body.secondaryColor ?? DEFAULT_TENANT_SETTINGS.secondary_color,
            contactEmail: req.body.contactEmail ?? '',
            contactPhone: req.body.contactPhone ?? '',
            address: req.body.address ?? '',
            website: req.body.website ?? '',
        };
        if (existing.length === 0) {
            await database_service_1.DatabaseService.execute(`INSERT INTO tenant_settings (tenant_id, description, logo_url, primary_color, secondary_color, contact_email, contact_phone, address, website)
           VALUES (@tenantId, @description, @logoUrl, @primaryColor, @secondaryColor, @contactEmail, @contactPhone, @address, @website)`, params);
        }
        else {
            await database_service_1.DatabaseService.execute(`UPDATE tenant_settings SET
             description = @description, logo_url = @logoUrl,
             primary_color = @primaryColor, secondary_color = @secondaryColor,
             contact_email = @contactEmail, contact_phone = @contactPhone,
             address = @address, website = @website, updated_at = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId`, params);
        }
        res.json({ success: true, message: 'Organization updated' });
    }
    catch (error) {
        next(error);
    }
});
router.put('/current/settings', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [
    (0, express_validator_1.body)('allowSelfRegistration').optional().isBoolean(),
    (0, express_validator_1.body)('defaultLanguage').optional().isString(),
    (0, express_validator_1.body)('timezone').optional().isString(),
    (0, express_validator_1.body)('enableNotifications').optional().isBoolean(),
    (0, express_validator_1.body)('enableChat').optional().isBoolean(),
    (0, express_validator_1.body)('enableLiveSessions').optional().isBoolean(),
    (0, express_validator_1.body)('maxUsersPerGroup').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('certificateValidity').optional().isInt({ min: 1 }),
], async (req, res, next) => {
    try {
        validate(req);
        const tenantId = req.user.tenantId;
        const existing = await database_service_1.DatabaseService.query('SELECT id FROM tenant_settings WHERE tenant_id = @tenantId', { tenantId });
        const params = {
            tenantId,
            allowSelfRegistration: req.body.allowSelfRegistration ?? DEFAULT_TENANT_SETTINGS.allow_self_registration,
            defaultLanguage: req.body.defaultLanguage ?? DEFAULT_TENANT_SETTINGS.default_language,
            timezone: req.body.timezone ?? DEFAULT_TENANT_SETTINGS.timezone,
            enableNotifications: req.body.enableNotifications ?? DEFAULT_TENANT_SETTINGS.enable_notifications,
            enableChat: req.body.enableChat ?? DEFAULT_TENANT_SETTINGS.enable_chat,
            enableLiveSessions: req.body.enableLiveSessions ?? DEFAULT_TENANT_SETTINGS.enable_live_sessions,
            maxUsersPerGroup: req.body.maxUsersPerGroup ?? DEFAULT_TENANT_SETTINGS.max_users_per_group,
            certificateValidity: req.body.certificateValidity ?? DEFAULT_TENANT_SETTINGS.certificate_validity,
        };
        if (existing.length === 0) {
            await database_service_1.DatabaseService.execute(`INSERT INTO tenant_settings (
             tenant_id, allow_self_registration, default_language, timezone,
             enable_notifications, enable_chat, enable_live_sessions,
             max_users_per_group, certificate_validity
           ) VALUES (
             @tenantId, @allowSelfRegistration, @defaultLanguage, @timezone,
             @enableNotifications, @enableChat, @enableLiveSessions,
             @maxUsersPerGroup, @certificateValidity
           )`, params);
        }
        else {
            await database_service_1.DatabaseService.execute(`UPDATE tenant_settings SET
             allow_self_registration = @allowSelfRegistration,
             default_language = @defaultLanguage,
             timezone = @timezone,
             enable_notifications = @enableNotifications,
             enable_chat = @enableChat,
             enable_live_sessions = @enableLiveSessions,
             max_users_per_group = @maxUsersPerGroup,
             certificate_validity = @certificateValidity,
             updated_at = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId`, params);
        }
        res.json({ success: true, message: 'Settings updated' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== TENANTS ====================
router.get('/tenants', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const tenants = await database_service_1.DatabaseService.query('SELECT * FROM tenants ORDER BY name');
        res.json({ success: true, data: tenants });
    }
    catch (error) {
        next(error);
    }
});
// ==================== ENTERPRISES ====================
router.get('/enterprises', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const enterprises = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name', { tenantId: req.user.tenantId });
        res.json({ success: true, data: enterprises });
    }
    catch (error) {
        next(error);
    }
});
router.post('/enterprises', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [(0, express_validator_1.body)('name').notEmpty().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO enterprises (tenant_id, name, code)
         OUTPUT INSERTED.id VALUES (@tenantId, @name, @code)`, { tenantId: req.user.tenantId, name: req.body.name, code: req.body.code || null });
        const enterprise = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: enterprise[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/enterprises/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [(0, express_validator_1.body)('name').optional().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const id = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { id, tenantId: req.user.tenantId };
        if (req.body.name) {
            updateFields.push('name = @name');
            params.name = req.body.name;
        }
        if (req.body.code !== undefined) {
            updateFields.push('code = @code');
            params.code = req.body.code;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE enterprises SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
        }
        const enterprise = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        if (enterprise.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Enterprise');
        res.json({ success: true, data: enterprise[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/enterprises/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM enterprises WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Enterprise deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== DIRECTIONS ====================
router.get('/directions', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const enterpriseId = req.query.enterpriseId;
        let query = 'SELECT d.*, e.name as enterprise_name FROM directions d JOIN enterprises e ON d.enterprise_id = e.id WHERE d.tenant_id = @tenantId';
        const params = { tenantId: req.user.tenantId };
        if (enterpriseId) {
            query += ' AND d.enterprise_id = @enterpriseId';
            params.enterpriseId = parseInt(enterpriseId, 10);
        }
        query += ' ORDER BY d.name';
        const directions = await database_service_1.DatabaseService.query(query, params);
        res.json({ success: true, data: directions });
    }
    catch (error) {
        next(error);
    }
});
router.post('/directions', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [
    (0, express_validator_1.body)('enterpriseId').isInt(),
    (0, express_validator_1.body)('name').notEmpty().trim(),
    (0, express_validator_1.body)('code').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO directions (tenant_id, enterprise_id, name, code)
         OUTPUT INSERTED.id VALUES (@tenantId, @enterpriseId, @name, @code)`, {
            tenantId: req.user.tenantId,
            enterpriseId: req.body.enterpriseId,
            name: req.body.name,
            code: req.body.code || null,
        });
        const direction = await database_service_1.DatabaseService.query('SELECT * FROM directions WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: direction[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/directions/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [(0, express_validator_1.body)('name').optional().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const id = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { id, tenantId: req.user.tenantId };
        if (req.body.name) {
            updateFields.push('name = @name');
            params.name = req.body.name;
        }
        if (req.body.code !== undefined) {
            updateFields.push('code = @code');
            params.code = req.body.code;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE directions SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
        }
        const direction = await database_service_1.DatabaseService.query('SELECT * FROM directions WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        if (direction.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Direction');
        res.json({ success: true, data: direction[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/directions/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM directions WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Direction deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== SERVICES ====================
router.get('/services', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const directionId = req.query.directionId;
        let query = `SELECT s.*, d.name as direction_name, e.name as enterprise_name 
                 FROM services s 
                 JOIN directions d ON s.direction_id = d.id 
                 JOIN enterprises e ON d.enterprise_id = e.id
                 WHERE s.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        if (directionId) {
            query += ' AND s.direction_id = @directionId';
            params.directionId = parseInt(directionId, 10);
        }
        query += ' ORDER BY s.name';
        const services = await database_service_1.DatabaseService.query(query, params);
        res.json({ success: true, data: services });
    }
    catch (error) {
        next(error);
    }
});
router.post('/services', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('directionId').isInt(),
    (0, express_validator_1.body)('name').notEmpty().trim(),
    (0, express_validator_1.body)('code').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO services (tenant_id, direction_id, name, code)
         OUTPUT INSERTED.id VALUES (@tenantId, @directionId, @name, @code)`, {
            tenantId: req.user.tenantId,
            directionId: req.body.directionId,
            name: req.body.name,
            code: req.body.code || null,
        });
        const service = await database_service_1.DatabaseService.query('SELECT * FROM services WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: service[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/services/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [(0, express_validator_1.body)('name').optional().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const id = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { id, tenantId: req.user.tenantId };
        if (req.body.name) {
            updateFields.push('name = @name');
            params.name = req.body.name;
        }
        if (req.body.code !== undefined) {
            updateFields.push('code = @code');
            params.code = req.body.code;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE services SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
        }
        const service = await database_service_1.DatabaseService.query('SELECT * FROM services WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        if (service.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Service');
        res.json({ success: true, data: service[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/services/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM services WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Service deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== ORGANIZATION TREE ====================
router.get('/tree', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const enterprises = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name', { tenantId: req.user.tenantId });
        const tree = await Promise.all(enterprises.map(async (enterprise) => {
            const directions = await database_service_1.DatabaseService.query('SELECT * FROM directions WHERE enterprise_id = @enterpriseId ORDER BY name', { enterpriseId: enterprise.id });
            const directionsWithServices = await Promise.all(directions.map(async (direction) => {
                const services = await database_service_1.DatabaseService.query('SELECT * FROM services WHERE direction_id = @directionId ORDER BY name', { directionId: direction.id });
                return { ...direction, services };
            }));
            return { ...enterprise, directions: directionsWithServices };
        }));
        res.json({ success: true, data: tree });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=organization.routes.js.map