import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import {
  DEFAULT_PLATFORM_SETTINGS,
  SETTING_SPECS,
  SUPPORTED_LANGUAGES,
  SettingSpec,
  TenantSettingsService,
  isValidTimeZone,
  parseEmailDomains,
  settingToColumn,
} from '../services/tenant-settings.service';
import { AuditService } from '../services/audit.service';
import { OrgLevel, OrgStructureService, copySubsidiaryStructure } from '../services/org-structure.service';
import { effectiveExternalTheme, effectiveSidebarColor, externalColorParam, isHexColor } from '../utils/externalTheme';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== CURRENT ORGANIZATION (tenant profile) ====================

/** express-validator rule of one platform setting (optional: a partial save keeps the rest). */
function settingValidator(spec: SettingSpec) {
  const field = body(spec.key);
  switch (spec.kind) {
    case 'bool':
      return field.optional().isBoolean();
    case 'int':
      return field.optional().isInt({ min: spec.min, max: spec.max });
    case 'enum':
      return field.optional().isIn([...spec.values]);
    case 'language':
      return field.optional().isIn(SUPPORTED_LANGUAGES);
    case 'timezone':
      return field.optional().isString().custom(isValidTimeZone).withMessage('Unknown time zone');
    case 'text':
      return field.optional({ nullable: true }).isString().isLength({ max: spec.max });
    case 'url':
      return field
        .optional({ nullable: true })
        .custom((value) => !value || /^https?:\/\/[^\s]+$/i.test(String(value).trim()))
        .withMessage('The link must start with http:// or https://');
    case 'email':
      return field
        .optional({ nullable: true })
        .custom((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()))
        .withMessage('Invalid email address');
    case 'domains':
      return field
        .optional({ nullable: true })
        .custom((value) => parseEmailDomains(value).every((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)))
        .withMessage('Invalid email domain');
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
        ...effectiveExternalTheme(settings),
        // Staff side menu; null = default look (follows light/dark mode).
        sidebarColor: effectiveSidebarColor(settings),
        contactEmail: settings.contact_email || '',
        contactPhone: settings.contact_phone || '',
        address: settings.address || '',
        website: settings.website || '',
        settings: await TenantSettingsService.get(tenantId),
        // Shown next to each field of the settings page ("par défaut : ...").
        settingsDefaults: DEFAULT_PLATFORM_SETTINGS,
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
    // Partner theme and side menu: strictly #RRGGBB; null or '' resets to the default.
    ...['externalAccentColor', 'externalSurfaceColor', 'sidebarColor'].map((field) =>
      body(field)
        .optional({ nullable: true })
        .custom((value) => value === '' || isHexColor(value))
        .withMessage('Expected a #RRGGBB color')
    ),
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
        externalAccentColor: externalColorParam(req.body.externalAccentColor),
        externalSurfaceColor: externalColorParam(req.body.externalSurfaceColor),
        sidebarColor: externalColorParam(req.body.sidebarColor),
      };
      // The partner and side menu colors are only touched when sent, so an older
      // client saving the profile doesn't reset them.
      const themeAssignments = [
        'externalAccentColor' in req.body ? 'external_accent_color = @externalAccentColor' : null,
        'externalSurfaceColor' in req.body ? 'external_surface_color = @externalSurfaceColor' : null,
        'sidebarColor' in req.body ? 'sidebar_color = @sidebarColor' : null,
      ].filter(Boolean).map((assignment) => `${assignment}, `).join('');

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO tenant_settings (tenant_id, description, logo_url, primary_color, secondary_color, contact_email, contact_phone, address, website, external_accent_color, external_surface_color, sidebar_color)
           VALUES (@tenantId, @description, @logoUrl, @primaryColor, @secondaryColor, @contactEmail, @contactPhone, @address, @website, @externalAccentColor, @externalSurfaceColor, @sidebarColor)`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE tenant_settings SET
             description = @description, logo_url = @logoUrl,
             primary_color = @primaryColor, secondary_color = @secondaryColor,
             contact_email = @contactEmail, contact_phone = @contactPhone,
             address = @address, website = @website, ${themeAssignments}updated_at = ${db.now()}
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
  SETTING_SPECS.map(settingValidator),
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
      const current = await TenantSettingsService.get(tenantId) as unknown as Record<string, unknown>;
      const params: Record<string, unknown> = { tenantId };
      for (const spec of SETTING_SPECS) {
        // `null` is only accepted for the domains (= any domain); other fields reject it above.
        params[spec.key] = settingToColumn(spec, req.body[spec.key] !== undefined ? req.body[spec.key] : current[spec.key]);
      }

      const columns = SETTING_SPECS.map((spec) => spec.column);
      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO tenant_settings (tenant_id, ${columns.join(', ')})
           VALUES (@tenantId, ${SETTING_SPECS.map((spec) => '@' + spec.key).join(', ')})`,
          params
        );
      } else {
        await DatabaseService.execute(
          `UPDATE tenant_settings SET
             ${SETTING_SPECS.map((spec) => `${spec.column} = @${spec.key}`).join(',\n             ')},
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

/**
 * @route GET /api/v1/organizations/current/history
 * @desc Who changed the organization's settings and structure, and what (from the
 *       activity log, which already recorded every save). Newest first.
 */
const HISTORY_ACTIONS = [
  'SETTINGS_UPDATED',
  'SSO_SETTINGS_UPDATED',
  'ORG_UNIT_DELETED',
  'ORG_STRUCTURE_COPIED',
  'ORGANIZATION_IMPORTED',
  'USER_ANONYMIZED',
  'USER_DATA_EXPORTED',
];

router.get('/current/history', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const rows = await DatabaseService.query<any>(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at, u.display_name as actor_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = @tenantId AND a.action IN (${HISTORY_ACTIONS.map((a) => `'${a}'`).join(', ')})
       ORDER BY a.created_at DESC
       ${IS_PG ? 'LIMIT @limit' : 'OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY'}`,
      { tenantId: req.user!.tenantId, limit }
    );
    res.json({
      success: true,
      data: rows.map((r: any) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        actorName: r.actor_name,
        createdAt: r.created_at,
        // The keys that were saved, never long texts in full.
        changes: summarizeMetadata(r.metadata),
      })),
    });
  } catch (error) {
    next(error);
  }
});

function summarizeMetadata(raw: unknown): Record<string, unknown> {
  let value: any = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = typeof v === 'string' && v.length > 80 ? `${v.slice(0, 77)}...` : v;
  }
  return out;
}

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

// ==================== ORGANIZATION STRUCTURE ====================
// entreprise -> filiale (optional) -> direction -> service. Every id received is
// checked against the requester's tenant (they used to be trusted as-is), and a
// unit that is still used can't be deleted (OrgStructureService.assertDeletable).

const unitBody = [
  body('name').optional().trim().notEmpty().isLength({ max: 200 }),
  body('code').optional({ nullable: true }).trim().isLength({ max: 50 }),
];

/** Name/code update shared by every level; returns the updated row. */
async function renameUnit(level: OrgLevel, req: AuthRequest) {
  const tenantId = req.user!.tenantId;
  const unit = await OrgStructureService.get(level, tenantId, req.params.id);
  const fields: string[] = [];
  const params: Record<string, any> = { id: unit.id, tenantId };
  if (req.body.name) { fields.push('name = @name'); params.name = req.body.name; }
  if (req.body.code !== undefined) { fields.push('code = @code'); params.code = req.body.code || null; }
  return { unit, fields, params };
}

async function insertUnit(table: string, columns: Record<string, unknown>) {
  const names = Object.keys(columns);
  const result = await DatabaseService.query<{ id: number }>(
    IS_PG
      ? `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((n) => '@' + n).join(', ')}) RETURNING id`
      : `INSERT INTO ${table} (${names.join(', ')}) OUTPUT INSERTED.id VALUES (${names.map((n) => '@' + n).join(', ')})`,
    columns
  );
  const rows = await DatabaseService.query<any>(`SELECT * FROM ${table} WHERE id = @id`, { id: result[0].id });
  return rows[0];
}

function deleteRoute(level: OrgLevel, table: string, roles: string[]) {
  router.delete(`/${table}/:id`, authenticate, authorize(...(roles as any)), async (req: AuthRequest, res, next) => {
    try {
      const tenantId = req.user!.tenantId;
      const unit = await OrgStructureService.get(level, tenantId, req.params.id);
      await OrgStructureService.assertDeletable(level, tenantId, Number(unit.id));
      await DatabaseService.execute(`DELETE FROM ${table} WHERE id = @id AND tenant_id = @tenantId`, { id: unit.id, tenantId });
      await AuditService.log(tenantId, req.user!.id, 'ORG_UNIT_DELETED', table, Number(unit.id), { name: unit.name });
      res.json({ success: true, message: `${level} deleted` });
    } catch (error) {
      next(error);
    }
  });
}

// ---------- enterprises
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

router.post('/enterprises', authenticate, authorize('admin'), [body('name').notEmpty(), ...unitBody], async (req: AuthRequest, res, next) => {
  try {
    validate(req);
    const enterprise = await insertUnit('enterprises', {
      tenant_id: req.user!.tenantId,
      name: req.body.name,
      code: req.body.code || null,
    });
    res.status(201).json({ success: true, data: enterprise });
  } catch (error) {
    next(error);
  }
});

router.put('/enterprises/:id', authenticate, authorize('admin'), unitBody, async (req: AuthRequest, res, next) => {
  try {
    validate(req);
    const { unit, fields, params } = await renameUnit('enterprise', req);
    if (fields.length > 0) {
      await DatabaseService.execute(`UPDATE enterprises SET ${fields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
    }
    res.json({ success: true, data: await OrgStructureService.get('enterprise', req.user!.tenantId, unit.id) });
  } catch (error) {
    next(error);
  }
});

deleteRoute('enterprise', 'enterprises', ['admin']);

// ---------- subsidiaries (filiales)
router.get('/subsidiaries', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const params: Record<string, any> = { tenantId: req.user!.tenantId };
    let where = 's.tenant_id = @tenantId';
    if (req.query.enterpriseId) {
      where += ' AND s.enterprise_id = @enterpriseId';
      params.enterpriseId = parseInt(req.query.enterpriseId as string, 10);
    }
    const subsidiaries = await DatabaseService.query<any>(
      `SELECT s.*, e.name as enterprise_name FROM subsidiaries s
       JOIN enterprises e ON e.id = s.enterprise_id
       WHERE ${where} ORDER BY s.name`,
      params
    );
    res.json({ success: true, data: subsidiaries });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/subsidiaries',
  authenticate,
  authorize('admin'),
  [body('enterpriseId').isInt(), body('name').notEmpty(), ...unitBody],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;
      const enterprise = await OrgStructureService.get('enterprise', tenantId, req.body.enterpriseId);
      const subsidiary = await insertUnit('subsidiaries', {
        tenant_id: tenantId,
        enterprise_id: enterprise.id,
        name: req.body.name,
        code: req.body.code || null,
      });
      res.status(201).json({ success: true, data: subsidiary });
    } catch (error) {
      next(error);
    }
  }
);

router.put('/subsidiaries/:id', authenticate, authorize('admin'), unitBody, async (req: AuthRequest, res, next) => {
  try {
    validate(req);
    const { unit, fields, params } = await renameUnit('subsidiary', req);
    if (fields.length > 0) {
      await DatabaseService.execute(
        `UPDATE subsidiaries SET ${fields.join(', ')}, updated_at = ${db.now()} WHERE id = @id AND tenant_id = @tenantId`,
        params
      );
    }
    res.json({ success: true, data: await OrgStructureService.get('subsidiary', req.user!.tenantId, unit.id) });
  } catch (error) {
    next(error);
  }
});

deleteRoute('subsidiary', 'subsidiaries', ['admin']);

/**
 * @route POST /api/v1/organizations/subsidiaries/:id/copy-structure
 * @desc Copies the selected directions of this subsidiary, with their services,
 *       into another subsidiary of the tenant (structure only: no members, heads,
 *       assignments or teams). Same-name directions are merged and services the
 *       target already has are skipped. `dryRun: true` only returns the plan.
 */
router.post(
  '/subsidiaries/:id/copy-structure',
  authenticate,
  authorize('admin'),
  [
    body('targetSubsidiaryId').isInt({ min: 1 }),
    body('directionIds').optional().isArray({ max: 1000 }),
    body('directionIds.*').isInt({ min: 1 }).toInt(),
    body('serviceIds').optional().isArray({ max: 5000 }),
    body('serviceIds.*').isInt({ min: 1 }).toInt(),
    body('dryRun').optional().isBoolean().toBoolean(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;
      const result = await copySubsidiaryStructure(tenantId, req.params.id, {
        targetSubsidiaryId: req.body.targetSubsidiaryId,
        directionIds: req.body.directionIds,
        serviceIds: req.body.serviceIds,
        dryRun: req.body.dryRun === true,
      });
      if (!result.dryRun) {
        await AuditService.log(tenantId, req.user!.id, 'ORG_STRUCTURE_COPIED', 'subsidiaries', result.target.id, {
          sourceId: result.source.id,
          source: result.source.name,
          targetId: result.target.id,
          target: result.target.name,
          ...result.summary,
        });
      }
      res.status(result.dryRun ? 200 : 201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// ---------- directions
router.get('/directions', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const params: Record<string, any> = { tenantId: req.user!.tenantId };
    let where = 'd.tenant_id = @tenantId';
    if (req.query.enterpriseId) {
      where += ' AND d.enterprise_id = @enterpriseId';
      params.enterpriseId = parseInt(req.query.enterpriseId as string, 10);
    }
    if (req.query.subsidiaryId) {
      where += ' AND d.subsidiary_id = @subsidiaryId';
      params.subsidiaryId = parseInt(req.query.subsidiaryId as string, 10);
    }
    const directions = await DatabaseService.query<any>(
      `SELECT d.*, e.name as enterprise_name, s.name as subsidiary_name
       FROM directions d
       JOIN enterprises e ON d.enterprise_id = e.id
       LEFT JOIN subsidiaries s ON s.id = d.subsidiary_id
       WHERE ${where} ORDER BY d.name`,
      params
    );
    res.json({ success: true, data: directions });
  } catch (error) {
    next(error);
  }
});

/**
 * Where a direction hangs: under a subsidiary (whose enterprise it inherits) or
 * directly under an enterprise.
 */
async function directionParent(tenantId: number, subsidiaryId: unknown, enterpriseId: unknown) {
  if (subsidiaryId) {
    const subsidiary = await OrgStructureService.get('subsidiary', tenantId, subsidiaryId);
    if (enterpriseId && Number(enterpriseId) !== Number(subsidiary.enterprise_id)) {
      throw BadRequestError('The subsidiary belongs to another enterprise', 'ORG_PLACEMENT_MISMATCH');
    }
    return { enterpriseId: Number(subsidiary.enterprise_id), subsidiaryId: Number(subsidiary.id) };
  }
  const enterprise = await OrgStructureService.get('enterprise', tenantId, enterpriseId);
  return { enterpriseId: Number(enterprise.id), subsidiaryId: null };
}

router.post(
  '/directions',
  authenticate,
  authorize('admin', 'director'),
  [
    body('enterpriseId').optional({ nullable: true }).isInt(),
    body('subsidiaryId').optional({ nullable: true }).isInt(),
    body('name').notEmpty(),
    ...unitBody,
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;
      if (!req.body.enterpriseId && !req.body.subsidiaryId) {
        throw BadRequestError('An enterprise or a subsidiary is required');
      }
      const parent = await directionParent(tenantId, req.body.subsidiaryId, req.body.enterpriseId);
      const direction = await insertUnit('directions', {
        tenant_id: tenantId,
        enterprise_id: parent.enterpriseId,
        subsidiary_id: parent.subsidiaryId,
        name: req.body.name,
        code: req.body.code || null,
      });
      res.status(201).json({ success: true, data: direction });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/directions/:id',
  authenticate,
  authorize('admin', 'director'),
  [...unitBody, body('subsidiaryId').optional({ nullable: true })],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;
      const { unit, fields, params } = await renameUnit('direction', req);

      // Moving under another subsidiary of the same enterprise (or directly under it: null).
      let moved = false;
      if (req.body.subsidiaryId !== undefined) {
        const parent = await directionParent(tenantId, req.body.subsidiaryId, unit.enterprise_id);
        fields.push('subsidiary_id = @subsidiaryId');
        params.subsidiaryId = parent.subsidiaryId;
        moved = (unit.subsidiary_id ? Number(unit.subsidiary_id) : null) !== parent.subsidiaryId;
      }
      if (fields.length > 0) {
        await DatabaseService.execute(`UPDATE directions SET ${fields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
      }
      if (moved) await OrgStructureService.syncDirectionMembers(tenantId, Number(unit.id));
      res.json({ success: true, data: await OrgStructureService.get('direction', tenantId, unit.id) });
    } catch (error) {
      next(error);
    }
  }
);

deleteRoute('direction', 'directions', ['admin']);

// ---------- services
router.get('/services', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const params: Record<string, any> = { tenantId: req.user!.tenantId };
    let where = 's.tenant_id = @tenantId';
    if (req.query.directionId) {
      where += ' AND s.direction_id = @directionId';
      params.directionId = parseInt(req.query.directionId as string, 10);
    }
    const services = await DatabaseService.query<any>(
      `SELECT s.*, d.name as direction_name, e.name as enterprise_name, sub.name as subsidiary_name
       FROM services s
       JOIN directions d ON s.direction_id = d.id
       JOIN enterprises e ON d.enterprise_id = e.id
       LEFT JOIN subsidiaries sub ON sub.id = d.subsidiary_id
       WHERE ${where} ORDER BY s.name`,
      params
    );
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/services',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('directionId').isInt(), body('name').notEmpty(), ...unitBody],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;
      const direction = await OrgStructureService.get('direction', tenantId, req.body.directionId);
      const service = await insertUnit('services', {
        tenant_id: tenantId,
        direction_id: direction.id,
        name: req.body.name,
        code: req.body.code || null,
      });
      res.status(201).json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }
);

router.put('/services/:id', authenticate, authorize('admin', 'director', 'manager'), unitBody, async (req: AuthRequest, res, next) => {
  try {
    validate(req);
    const { unit, fields, params } = await renameUnit('service', req);
    if (fields.length > 0) {
      await DatabaseService.execute(`UPDATE services SET ${fields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
    }
    res.json({ success: true, data: await OrgStructureService.get('service', req.user!.tenantId, unit.id) });
  } catch (error) {
    next(error);
  }
});

deleteRoute('service', 'services', ['admin', 'director']);

// ==================== ORGANIZATION TREE ====================
/**
 * The whole structure with member counts:
 *   enterprise { subsidiaries: [{ directions: [{ services }] }], directions: [...] }
 * where enterprise.directions are the ones attached directly to the enterprise.
 */
router.get('/tree', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const [enterprises, subsidiaries, directions, services, counts] = await Promise.all([
      DatabaseService.query<any>('SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name', { tenantId }),
      DatabaseService.query<any>('SELECT * FROM subsidiaries WHERE tenant_id = @tenantId ORDER BY name', { tenantId }),
      DatabaseService.query<any>('SELECT * FROM directions WHERE tenant_id = @tenantId ORDER BY name', { tenantId }),
      DatabaseService.query<any>('SELECT * FROM services WHERE tenant_id = @tenantId ORDER BY name', { tenantId }),
      DatabaseService.query<any>(
        `SELECT enterprise_id, subsidiary_id, direction_id, service_id, COUNT(*) as n
         FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL
         GROUP BY enterprise_id, subsidiary_id, direction_id, service_id`,
        { tenantId }
      ),
    ]);

    // Members per unit (a user counts for every level they belong to).
    const members = { enterprise: new Map<number, number>(), subsidiary: new Map<number, number>(), direction: new Map<number, number>(), service: new Map<number, number>() };
    for (const row of counts) {
      const n = Number(row.n) || 0;
      for (const level of ['enterprise', 'subsidiary', 'direction', 'service'] as const) {
        const id = row[`${level}_id`];
        if (id) members[level].set(Number(id), (members[level].get(Number(id)) || 0) + n);
      }
    }
    const withCount = (level: keyof typeof members, unit: any) => ({ ...unit, member_count: members[level].get(Number(unit.id)) || 0 });

    const servicesOf = (directionId: number) =>
      services.filter((s: any) => Number(s.direction_id) === directionId).map((s: any) => withCount('service', s));
    const directionNode = (d: any) => ({ ...withCount('direction', d), services: servicesOf(Number(d.id)) });

    const tree = enterprises.map((enterprise: any) => ({
      ...withCount('enterprise', enterprise),
      subsidiaries: subsidiaries
        .filter((s: any) => Number(s.enterprise_id) === Number(enterprise.id))
        .map((s: any) => ({
          ...withCount('subsidiary', s),
          directions: directions.filter((d: any) => Number(d.subsidiary_id) === Number(s.id)).map(directionNode),
        })),
      directions: directions
        .filter((d: any) => Number(d.enterprise_id) === Number(enterprise.id) && !d.subsidiary_id)
        .map(directionNode),
    }));

    res.json({ success: true, data: tree });
  } catch (error) {
    next(error);
  }
});

export default router;
