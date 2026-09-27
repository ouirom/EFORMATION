import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { AuditService } from '../services/audit.service';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== CURRENT ORGANIZATION (tenant profile) ====================

const SUPPORTED_LANGUAGES = ['fr', 'en'];

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_TENANT_SETTINGS = {
  description: '',
  logo_url: null as string | null,
  primary_color: '#3B82F6',
  secondary_color: '#10B981',
  contact_email: '',
  contact_phone: '',
  address: '',
  website: '',
  // Platform switches (registration, modules, language, time zone...) and their
  // defaults live in TenantSettingsService.
};

router.get('/current', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const tenants = await DatabaseService.query<any>(
      'SELECT id, name, slug, created_at FROM tenants WHERE id = @tenantId',
      { tenantId }
    );
    if (tenants.length === 0) throw NotFoundError('Organization');
    const tenant = tenants[0];

    const settingsRows = await DatabaseService.query<any>(
      'SELECT * FROM tenant_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );
    const settings = settingsRows[0] || DEFAULT_TENANT_SETTINGS;

    const [[{ total_users }], [{ total_courses }], [{ total_enrollments }], [{ active_users }]] = await Promise.all([
      DatabaseService.query<{ total_users: number }>(
        'SELECT COUNT(*) as total_users FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL',
        { tenantId }
      ),
      DatabaseService.query<{ total_courses: number }>(
        'SELECT COUNT(*) as total_courses FROM courses WHERE tenant_id = @tenantId AND deleted_at IS NULL',
        { tenantId }
      ),
      DatabaseService.query<{ total_enrollments: number }>(
        'SELECT COUNT(*) as total_enrollments FROM enrollments WHERE tenant_id = @tenantId',
        { tenantId }
      ),
      DatabaseService.query<{ active_users: number }>(
        `SELECT COUNT(*) as active_users FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL AND is_active = ${db.bool(true)}`,
        { tenantId }
      ),
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
        settings: await TenantSettingsService.get(tenantId),
        stats: {
          totalUsers: total_users,
          totalCourses: total_courses,
          totalEnrollments: total_enrollments,
          activeUsers: active_users,
        },
        createdAt: tenant.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/current',
  authenticate,
  authorize('admin'),
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional({ nullable: true }).isString(),
    body('logo').optional({ nullable: true }).isString(),
    body('primaryColor').optional().isString(),
    body('secondaryColor').optional().isString(),
    body('contactEmail').optional({ nullable: true }).isString(),
    body('contactPhone').optional({ nullable: true }).isString(),
    body('address').optional({ nullable: true }).isString(),
    body('website').optional({ nullable: true }).isString(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      if (req.body.name) {
        await DatabaseService.execute(
          'UPDATE tenants SET name = @name WHERE id = @tenantId',
          { tenantId, name: req.body.name }
        );
      }

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM tenant_settings WHERE tenant_id = @tenantId',
        { tenantId }
      );

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
        await DatabaseService.execute(
          `INSERT INTO tenant_settings (tenant_id, description, logo_url, primary_color, secondary_color, contact_email, contact_phone, address, website)
           VALUES (@tenantId, @description, @logoUrl, @primaryColor, @secondaryColor, @contactEmail, @contactPhone, @address, @website)`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE tenant_settings SET
             description = @description, logo_url = @logoUrl,
             primary_color = @primaryColor, secondary_color = @secondaryColor,
             contact_email = @contactEmail, contact_phone = @contactPhone,
             address = @address, website = @website, updated_at = ${db.now()}
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      res.json({ success: true, message: 'Organization updated' });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/current/settings',
  authenticate,
  authorize('admin'),
  [
    body('allowSelfRegistration').optional().isBoolean(),
    body('defaultLanguage').optional().isIn(SUPPORTED_LANGUAGES),
    body('timezone').optional().isString().custom(isValidTimeZone).withMessage('Unknown time zone'),
    body('enableNotifications').optional().isBoolean(),
    body('enableChat').optional().isBoolean(),
    body('enableLiveSessions').optional().isBoolean(),
    body('maxUsersPerGroup').optional().isInt({ min: 1 }),
    body('certificateValidity').optional().isInt({ min: 1 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM tenant_settings WHERE tenant_id = @tenantId',
        { tenantId }
      );

      // Fields left out of the request keep their current value (they used to be
      // reset to the defaults, so saving one toggle wiped the others).
      TenantSettingsService.invalidate(tenantId);
      const current = await TenantSettingsService.get(tenantId);
      const params = {
        tenantId,
        allowSelfRegistration: req.body.allowSelfRegistration ?? current.allowSelfRegistration,
        defaultLanguage: req.body.defaultLanguage ?? current.defaultLanguage,
        timezone: req.body.timezone ?? current.timezone,
        enableNotifications: req.body.enableNotifications ?? current.enableNotifications,
        enableChat: req.body.enableChat ?? current.enableChat,
        enableLiveSessions: req.body.enableLiveSessions ?? current.enableLiveSessions,
        maxUsersPerGroup: req.body.maxUsersPerGroup ?? current.maxUsersPerGroup,
        certificateValidity: req.body.certificateValidity ?? current.certificateValidity,
      };

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO tenant_settings (
             tenant_id, allow_self_registration, default_language, timezone,
             enable_notifications, enable_chat, enable_live_sessions,
             max_users_per_group, certificate_validity
           ) VALUES (
             @tenantId, @allowSelfRegistration, @defaultLanguage, @timezone,
             @enableNotifications, @enableChat, @enableLiveSessions,
             @maxUsersPerGroup, @certificateValidity
           )`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE tenant_settings SET
             allow_self_registration = @allowSelfRegistration,
             default_language = @defaultLanguage,
             timezone = @timezone,
             enable_notifications = @enableNotifications,
             enable_chat = @enableChat,
             enable_live_sessions = @enableLiveSessions,
             max_users_per_group = @maxUsersPerGroup,
             certificate_validity = @certificateValidity,
             updated_at = ${db.now()}
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      TenantSettingsService.invalidate(tenantId);
      await AuditService.log(tenantId, req.user!.id, 'SETTINGS_UPDATED', 'tenant_settings', null, req.body);
      res.json({ success: true, message: 'Settings updated', data: await TenantSettingsService.get(tenantId) });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== TENANTS ====================
router.get('/tenants', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenants = await DatabaseService.query<any>(
      'SELECT * FROM tenants ORDER BY name'
    );
    res.json({ success: true, data: tenants });
  } catch (error) {
    next(error);
  }
});

// ==================== ENTERPRISES ====================
router.get('/enterprises', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const enterprises = await DatabaseService.query<any>(
      'SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name',
      { tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: enterprises });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/enterprises',
  authenticate,
  authorize('admin'),
  [body('name').notEmpty().trim(), body('code').optional().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO enterprises (tenant_id, name, code)
             VALUES (@tenantId, @name, @code)
             RETURNING id`
          : `INSERT INTO enterprises (tenant_id, name, code)
             OUTPUT INSERTED.id VALUES (@tenantId, @name, @code)`,
        { tenantId: req.user!.tenantId, name: req.body.name, code: req.body.code || null }
      );
      const enterprise = await DatabaseService.query<any>(
        'SELECT * FROM enterprises WHERE id = @id',
        { id: result[0].id }
      );
      res.status(201).json({ success: true, data: enterprise[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/enterprises/:id',
  authenticate,
  authorize('admin'),
  [body('name').optional().trim(), body('code').optional().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const id = parseInt(req.params.id, 10);
      const updateFields: string[] = [];
      const params: Record<string, any> = { id, tenantId: req.user!.tenantId };

      if (req.body.name) { updateFields.push('name = @name'); params.name = req.body.name; }
      if (req.body.code !== undefined) { updateFields.push('code = @code'); params.code = req.body.code; }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE enterprises SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`,
          params
        );
      }

      const enterprise = await DatabaseService.query<any>(
        'SELECT * FROM enterprises WHERE id = @id AND tenant_id = @tenantId',
        { id, tenantId: req.user!.tenantId }
      );
      if (enterprise.length === 0) throw NotFoundError('Enterprise');
      res.json({ success: true, data: enterprise[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/enterprises/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await DatabaseService.execute(
      'DELETE FROM enterprises WHERE id = @id AND tenant_id = @tenantId',
      { id, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Enterprise deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== DIRECTIONS ====================
router.get('/directions', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const enterpriseId = req.query.enterpriseId as string;
    let query = 'SELECT d.*, e.name as enterprise_name FROM directions d JOIN enterprises e ON d.enterprise_id = e.id WHERE d.tenant_id = @tenantId';
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    if (enterpriseId) {
      query += ' AND d.enterprise_id = @enterpriseId';
      params.enterpriseId = parseInt(enterpriseId, 10);
    }
    query += ' ORDER BY d.name';

    const directions = await DatabaseService.query<any>(query, params);
    res.json({ success: true, data: directions });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/directions',
  authenticate,
  authorize('admin', 'director'),
  [
    body('enterpriseId').isInt(),
    body('name').notEmpty().trim(),
    body('code').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO directions (tenant_id, enterprise_id, name, code)
             VALUES (@tenantId, @enterpriseId, @name, @code)
             RETURNING id`
          : `INSERT INTO directions (tenant_id, enterprise_id, name, code)
             OUTPUT INSERTED.id VALUES (@tenantId, @enterpriseId, @name, @code)`,
        {
          tenantId: req.user!.tenantId,
          enterpriseId: req.body.enterpriseId,
          name: req.body.name,
          code: req.body.code || null,
        }
      );
      const direction = await DatabaseService.query<any>(
        'SELECT * FROM directions WHERE id = @id',
        { id: result[0].id }
      );
      res.status(201).json({ success: true, data: direction[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/directions/:id',
  authenticate,
  authorize('admin', 'director'),
  [body('name').optional().trim(), body('code').optional().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const id = parseInt(req.params.id, 10);
      const updateFields: string[] = [];
      const params: Record<string, any> = { id, tenantId: req.user!.tenantId };

      if (req.body.name) { updateFields.push('name = @name'); params.name = req.body.name; }
      if (req.body.code !== undefined) { updateFields.push('code = @code'); params.code = req.body.code; }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE directions SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`,
          params
        );
      }

      const direction = await DatabaseService.query<any>(
        'SELECT * FROM directions WHERE id = @id AND tenant_id = @tenantId',
        { id, tenantId: req.user!.tenantId }
      );
      if (direction.length === 0) throw NotFoundError('Direction');
      res.json({ success: true, data: direction[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/directions/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await DatabaseService.execute(
      'DELETE FROM directions WHERE id = @id AND tenant_id = @tenantId',
      { id, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Direction deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== SERVICES ====================
router.get('/services', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const directionId = req.query.directionId as string;
    let query = `SELECT s.*, d.name as direction_name, e.name as enterprise_name 
                 FROM services s 
                 JOIN directions d ON s.direction_id = d.id 
                 JOIN enterprises e ON d.enterprise_id = e.id
                 WHERE s.tenant_id = @tenantId`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    if (directionId) {
      query += ' AND s.direction_id = @directionId';
      params.directionId = parseInt(directionId, 10);
    }
    query += ' ORDER BY s.name';

    const services = await DatabaseService.query<any>(query, params);
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/services',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('directionId').isInt(),
    body('name').notEmpty().trim(),
    body('code').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO services (tenant_id, direction_id, name, code)
             VALUES (@tenantId, @directionId, @name, @code)
             RETURNING id`
          : `INSERT INTO services (tenant_id, direction_id, name, code)
             OUTPUT INSERTED.id VALUES (@tenantId, @directionId, @name, @code)`,
        {
          tenantId: req.user!.tenantId,
          directionId: req.body.directionId,
          name: req.body.name,
          code: req.body.code || null,
        }
      );
      const service = await DatabaseService.query<any>(
        'SELECT * FROM services WHERE id = @id',
        { id: result[0].id }
      );
      res.status(201).json({ success: true, data: service[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/services/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('name').optional().trim(), body('code').optional().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const id = parseInt(req.params.id, 10);
      const updateFields: string[] = [];
      const params: Record<string, any> = { id, tenantId: req.user!.tenantId };

      if (req.body.name) { updateFields.push('name = @name'); params.name = req.body.name; }
      if (req.body.code !== undefined) { updateFields.push('code = @code'); params.code = req.body.code; }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE services SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`,
          params
        );
      }

      const service = await DatabaseService.query<any>(
        'SELECT * FROM services WHERE id = @id AND tenant_id = @tenantId',
        { id, tenantId: req.user!.tenantId }
      );
      if (service.length === 0) throw NotFoundError('Service');
      res.json({ success: true, data: service[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/services/:id', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await DatabaseService.execute(
      'DELETE FROM services WHERE id = @id AND tenant_id = @tenantId',
      { id, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== ORGANIZATION TREE ====================
router.get('/tree', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const enterprises = await DatabaseService.query<any>(
      'SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name',
      { tenantId }
    );

    if (enterprises.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const [allDirections, allServices] = await Promise.all([
      DatabaseService.query<any>(
        'SELECT * FROM directions WHERE tenant_id = @tenantId ORDER BY name',
        { tenantId }
      ),
      DatabaseService.query<any>(
        'SELECT * FROM services WHERE tenant_id = @tenantId ORDER BY name',
        { tenantId }
      ),
    ]);

    const servicesByDirection = new Map<number, any[]>();
    for (const service of allServices) {
      const list = servicesByDirection.get(service.direction_id) || [];
      list.push(service);
      servicesByDirection.set(service.direction_id, list);
    }

    const directionsByEnterprise = new Map<number, any[]>();
    for (const direction of allDirections) {
      const list = directionsByEnterprise.get(direction.enterprise_id) || [];
      list.push({ ...direction, services: servicesByDirection.get(direction.id) || [] });
      directionsByEnterprise.set(direction.enterprise_id, list);
    }

    const tree = enterprises.map((enterprise: any) => ({
      ...enterprise,
      directions: directionsByEnterprise.get(enterprise.id) || [],
    }));

    res.json({ success: true, data: tree });
  } catch (error) {
    next(error);
  }
});

export default router;
