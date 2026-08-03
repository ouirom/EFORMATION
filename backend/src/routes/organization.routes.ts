import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== CURRENT ORGANIZATION (tenant profile) ====================

const DEFAULT_TENANT_SETTINGS = {
  description: '',
  logo_url: null as string | null,
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

    const [[{ totalUsers }], [{ totalCourses }], [{ totalEnrollments }], [{ activeUsers }]] = await Promise.all([
      DatabaseService.query<{ totalUsers: number }>(
        'SELECT COUNT(*) as totalUsers FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL',
        { tenantId }
      ),
      DatabaseService.query<{ totalCourses: number }>(
        'SELECT COUNT(*) as totalCourses FROM courses WHERE tenant_id = @tenantId',
        { tenantId }
      ),
      DatabaseService.query<{ totalEnrollments: number }>(
        'SELECT COUNT(*) as totalEnrollments FROM course_assignments WHERE tenant_id = @tenantId',
        { tenantId }
      ),
      DatabaseService.query<{ activeUsers: number }>(
        'SELECT COUNT(*) as activeUsers FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL AND is_active = 1',
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
             address = @address, website = @website, updated_at = SYSUTCDATETIME()
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
    body('defaultLanguage').optional().isString(),
    body('timezone').optional().isString(),
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
             updated_at = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId`,
          params
        );
      }

      res.json({ success: true, message: 'Settings updated' });
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
        `INSERT INTO enterprises (tenant_id, name, code)
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
        `INSERT INTO directions (tenant_id, enterprise_id, name, code)
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
        `INSERT INTO services (tenant_id, direction_id, name, code)
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
    const enterprises = await DatabaseService.query<any>(
      'SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name',
      { tenantId: req.user!.tenantId }
    );

    const tree = await Promise.all(
      enterprises.map(async (enterprise: any) => {
        const directions = await DatabaseService.query<any>(
          'SELECT * FROM directions WHERE enterprise_id = @enterpriseId ORDER BY name',
          { enterpriseId: enterprise.id }
        );

        const directionsWithServices = await Promise.all(
          directions.map(async (direction: any) => {
            const services = await DatabaseService.query<any>(
              'SELECT * FROM services WHERE direction_id = @directionId ORDER BY name',
              { directionId: direction.id }
            );
            return { ...direction, services };
          })
        );

        return { ...enterprise, directions: directionsWithServices };
      })
    );

    res.json({ success: true, data: tree });
  } catch (error) {
    next(error);
  }
});

export default router;
