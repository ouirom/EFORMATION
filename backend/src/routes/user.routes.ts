import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import { authenticate, authorize, AuthRequest, ROLE_HIERARCHY } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { AuditService } from '../services/audit.service';
import { NotificationService } from '../services/notification.service';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../middleware/error.middleware';
import { config } from '../config';
import { parseSpreadsheet } from '../utils/xlsx';

const router = Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const ALLOWED_ROLES = ['super_admin', 'admin', 'director', 'manager', 'supervisor', 'agent', 'externe', 'stagiaire'];

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * Validates a proposed supervisor_id: must be an active user in the same tenant
 * with a strictly higher role level than the user being assigned to them —
 * otherwise an agent could end up "supervised" by a peer or another agent.
 */
async function resolveSupervisorId(
  tenantId: number,
  supervisorId: number | undefined | null,
  targetRole: string
): Promise<number | null> {
  if (supervisorId === undefined || supervisorId === null) return null;

  const supervisors = await DatabaseService.query<{ id: number; role: string }>(
    `SELECT id, role FROM users WHERE id = @supervisorId AND tenant_id = @tenantId AND deleted_at IS NULL AND is_active = ${db.bool(true)}`,
    { supervisorId, tenantId }
  );
  if (supervisors.length === 0) {
    throw BadRequestError('Supervisor not found');
  }

  const supervisorLevel = ROLE_HIERARCHY[supervisors[0].role] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
  if (supervisorLevel <= targetLevel) {
    throw BadRequestError('The supervisor must have a higher role level than the assigned user');
  }

  return supervisorId;
}

interface HierarchyRequester {
  id: number;
  role: string;
  directionId?: number;
  serviceId?: number;
}

interface HierarchyTarget {
  role: string;
  direction_id: number | null;
  service_id: number | null;
  supervisor_id: number | null;
}

/**
 * Whether `requester` may view/manage `target` per the org hierarchy: target's
 * role level must be strictly below requester's, AND target must fall within
 * requester's own scope — a director's whole direction, a manager's whole
 * service, or a supervisor's explicitly assigned direct reports (supervisor_id).
 * Does not special-case admin/super_admin — callers check that separately since
 * not every caller wants the "admins see everyone" bypass.
 */
function isInHierarchicalScope(requester: HierarchyRequester, target: HierarchyTarget): boolean {
  const requesterLevel = ROLE_HIERARCHY[requester.role] || 0;
  const targetLevel = ROLE_HIERARCHY[target.role] || 0;
  if (targetLevel >= requesterLevel) return false;

  if (requester.role === 'director' && requester.directionId && target.direction_id === requester.directionId) return true;
  if (requester.role === 'manager' && requester.serviceId && target.service_id === requester.serviceId) return true;
  if (requester.role === 'supervisor' && target.supervisor_id === requester.id) return true;
  return false;
}

/**
 * @route POST /api/v1/users
 * @desc Create a new user (admin only)
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director'),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('displayName').notEmpty().trim(),
    body('role').isIn(ALLOWED_ROLES),
    body('enterpriseId').optional().isInt(),
    body('directionId').optional().isInt(),
    body('serviceId').optional().isInt(),
    body('supervisorId').optional({ nullable: true }).isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      // Directors can only create non-admin, non-super-admin users; admins can't
      // create super_admins (only an existing super_admin can create another).
      if (req.user!.role === 'director' && ['admin', 'super_admin'].includes(req.body.role)) {
        throw BadRequestError('Directors cannot create admin or super admin users');
      }
      if (req.user!.role === 'admin' && req.body.role === 'super_admin') {
        throw BadRequestError('Only a super admin can create another super admin');
      }

      // Check if email already exists
      const existingUsers = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM users WHERE email = @email AND tenant_id = @tenantId',
        { email: req.body.email, tenantId: req.user!.tenantId }
      );

      if (existingUsers.length > 0) {
        throw ConflictError('Email already registered');
      }

      const supervisorId = await resolveSupervisorId(req.user!.tenantId, req.body.supervisorId, req.body.role);

      // Generate username from email
      const username = req.body.email.split('@')[0] + '_' + Date.now().toString(36);

      // Hash password
      const passwordHash = await bcrypt.hash(req.body.password, config.bcryptRounds);

      // Insert user
      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, direction_id, service_id, supervisor_id, is_active
            )
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @directionId, @serviceId, @supervisorId, @isActive
            )
            RETURNING id`
          : `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role,
              enterprise_id, direction_id, service_id, supervisor_id, is_active
            )
            OUTPUT INSERTED.id
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role,
              @enterpriseId, @directionId, @serviceId, @supervisorId, @isActive
            )`,
        {
          tenantId: req.user!.tenantId,
          email: req.body.email,
          username,
          passwordHash,
          displayName: req.body.displayName,
          role: req.body.role,
          enterpriseId: req.body.enterpriseId || null,
          directionId: req.body.directionId || null,
          serviceId: req.body.serviceId || null,
          supervisorId,
          isActive: true,
        }
      );

      const userId = result[0].id;

      await AuditService.log(req.user!.tenantId, req.user!.id, 'USER_CREATED', 'users', userId, {
        email: req.body.email,
        role: req.body.role,
      });

      // Get created user
      const users = await DatabaseService.query<any>(
        `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active,
                u.enterprise_id, u.direction_id, u.service_id, u.supervisor_id, u.created_at,
                e.name as enterprise_name, d.name as direction_name, s.name as service_name,
                sup.display_name as supervisor_name
         FROM users u
         LEFT JOIN enterprises e ON u.enterprise_id = e.id
         LEFT JOIN directions d ON u.direction_id = d.id
         LEFT JOIN services s ON u.service_id = s.id
         LEFT JOIN users sup ON u.supervisor_id = sup.id
         WHERE u.id = @userId`,
        { userId }
      );

      res.status(201).json({
        success: true,
        data: users[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

interface ImportRowResult {
  line: number;
  email: string;
  status: 'created' | 'skipped' | 'error';
  message?: string;
}

const MAX_IMPORT_ROWS = 500;

/**
 * @route POST /api/v1/users/import
 * @desc Bulk-create users from a CSV or Excel (.xlsx) file (columns: email, displayName,
 *       role, enterpriseCode, directionCode, serviceCode, supervisorEmail — all optional
 *       except email/displayName. supervisorEmail is matched against an already-existing
 *       user's email in this tenant (including one created earlier in the same file, if
 *       their row came first) with a strictly higher role level. A downloadable .xlsx
 *       template is available at GET /import/users/template.
 */
router.post(
  '/import',
  authenticate,
  authorize('admin', 'director'),
  csvUpload.single('file'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file) {
        throw BadRequestError('File is required (field name: file)');
      }

      const rows = await parseSpreadsheet(req.file);
      if (rows.length === 0) {
        throw BadRequestError('The file has no data rows');
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        throw BadRequestError(`The file has too many rows (max ${MAX_IMPORT_ROWS})`);
      }

      const tenantId = req.user!.tenantId;

      // Preload org-unit code -> id lookups so we don't run a query per row.
      const [enterprises, directions, services] = await Promise.all([
        DatabaseService.query<{ id: number; code: string }>(
          'SELECT id, code FROM enterprises WHERE tenant_id = @tenantId AND code IS NOT NULL',
          { tenantId }
        ),
        DatabaseService.query<{ id: number; code: string }>(
          'SELECT id, code FROM directions WHERE tenant_id = @tenantId AND code IS NOT NULL',
          { tenantId }
        ),
        DatabaseService.query<{ id: number; code: string }>(
          'SELECT id, code FROM services WHERE tenant_id = @tenantId AND code IS NOT NULL',
          { tenantId }
        ),
      ]);
      const enterpriseByCode = new Map(enterprises.map((e) => [e.code, e.id]));
      const directionByCode = new Map(directions.map((d) => [d.code, d.id]));
      const serviceByCode = new Map(services.map((s) => [s.code, s.id]));

      const existingUsersRows = await DatabaseService.query<{ id: number; email: string; role: string }>(
        'SELECT id, email, role FROM users WHERE tenant_id = @tenantId',
        { tenantId }
      );
      const knownEmails = new Set(existingUsersRows.map((u) => u.email.toLowerCase()));
      const userByEmail = new Map(existingUsersRows.map((u) => [u.email.toLowerCase(), u]));

      const results: ImportRowResult[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const line = i + 2; // +1 for header, +1 for 1-based line numbers
        const row = rows[i];
        const email = (row.email || '').toLowerCase().trim();
        const displayName = (row.displayName || '').trim();
        const role = (row.role || 'agent').trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          results.push({ line, email, status: 'error', message: 'Invalid or missing email' });
          continue;
        }
        if (!displayName) {
          results.push({ line, email, status: 'error', message: 'Missing displayName' });
          continue;
        }
        if (!ALLOWED_ROLES.includes(role)) {
          results.push({ line, email, status: 'error', message: `Invalid role "${role}"` });
          continue;
        }
        if (['admin', 'super_admin'].includes(role) && req.user!.role === 'director') {
          results.push({ line, email, status: 'error', message: 'Directors cannot create admin or super admin users' });
          continue;
        }
        if (role === 'super_admin' && req.user!.role === 'admin') {
          results.push({ line, email, status: 'error', message: 'Only a super admin can create another super admin' });
          continue;
        }
        if (knownEmails.has(email)) {
          results.push({ line, email, status: 'skipped', message: 'Email already registered' });
          continue;
        }

        const enterpriseId = row.enterpriseCode ? enterpriseByCode.get(row.enterpriseCode.trim()) ?? null : null;
        const directionId = row.directionCode ? directionByCode.get(row.directionCode.trim()) ?? null : null;
        const serviceId = row.serviceCode ? serviceByCode.get(row.serviceCode.trim()) ?? null : null;

        let supervisorId: number | null = null;
        if (row.supervisorEmail) {
          const supervisor = userByEmail.get(row.supervisorEmail.trim().toLowerCase());
          if (!supervisor) {
            results.push({ line, email, status: 'error', message: `Supervisor "${row.supervisorEmail}" not found` });
            continue;
          }
          if ((ROLE_HIERARCHY[supervisor.role] || 0) <= (ROLE_HIERARCHY[role] || 0)) {
            results.push({ line, email, status: 'error', message: 'The supervisor must have a higher role level than this user' });
            continue;
          }
          supervisorId = supervisor.id;
        }

        try {
          const tempPassword = crypto.randomBytes(9).toString('base64url');
          const passwordHash = await bcrypt.hash(tempPassword, config.bcryptRounds);
          const username = email.split('@')[0] + '_' + Date.now().toString(36) + i;

          const result = await DatabaseService.query<{ id: number }>(
            IS_PG
              ? `INSERT INTO users (
                  tenant_id, email, username, password_hash, display_name, role,
                  enterprise_id, direction_id, service_id, supervisor_id, is_active
                )
                VALUES (
                  @tenantId, @email, @username, @passwordHash, @displayName, @role,
                  @enterpriseId, @directionId, @serviceId, @supervisorId, @isActive
                )
                RETURNING id`
              : `INSERT INTO users (
                  tenant_id, email, username, password_hash, display_name, role,
                  enterprise_id, direction_id, service_id, supervisor_id, is_active
                )
                OUTPUT INSERTED.id
                VALUES (
                  @tenantId, @email, @username, @passwordHash, @displayName, @role,
                  @enterpriseId, @directionId, @serviceId, @supervisorId, @isActive
                )`,
            { tenantId, email, username, passwordHash, displayName, role, enterpriseId, directionId, serviceId, supervisorId, isActive: true }
          );

          knownEmails.add(email);
          userByEmail.set(email, { id: result[0].id, email, role });
          created++;
          results.push({ line, email, status: 'created' });

          try {
            await NotificationService.send({
              tenantId,
              userId: result[0].id,
              channel: 'email',
              subject: 'Votre compte E-Formation a été créé',
              body: `Bonjour ${displayName},\n\nVotre compte a été créé. Identifiant : ${email}\nMot de passe temporaire : ${tempPassword}\n\nMerci de le changer dès votre première connexion.`,
              actionUrl: `${config.frontendUrl}/login`,
            });
          } catch (notifyError) {
            // Account creation still succeeds even if the welcome email fails to send.
          }
        } catch (error) {
          results.push({ line, email, status: 'error', message: (error as Error).message });
        }
      }

      await AuditService.log(tenantId, req.user!.id, 'USERS_IMPORTED', 'users', null, {
        totalRows: rows.length,
        created,
      });

      res.status(201).json({
        success: true,
        data: {
          totalRows: rows.length,
          created,
          skipped: results.filter((r) => r.status === 'skipped').length,
          errors: results.filter((r) => r.status === 'error').length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/users
 * @desc List users (with filters)
 */
router.get('/', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const role = req.query.role as string;
    const directionId = req.query.directionId as string;
    const serviceId = req.query.serviceId as string;
    const supervisorId = req.query.supervisorId as string;
    const status = req.query.status as string;

    let whereClause = 'WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL';
    const params: Record<string, any> = { tenantId: req.user!.tenantId, limit, offset };

    if (search) {
      whereClause += ` AND (u.display_name LIKE @search OR u.email LIKE @search)`;
      params.search = `%${search}%`;
    }
    if (role) {
      whereClause += ' AND u.role = @role';
      params.role = role;
    }
    if (directionId) {
      whereClause += ' AND u.direction_id = @directionId';
      params.directionId = parseInt(directionId, 10);
    }
    if (serviceId) {
      whereClause += ' AND u.service_id = @serviceId';
      params.serviceId = parseInt(serviceId, 10);
    }
    if (supervisorId) {
      whereClause += ' AND u.supervisor_id = @supervisorId';
      params.supervisorId = parseInt(supervisorId, 10);
    }
    if (status) {
      whereClause += ' AND u.status = @status';
      params.status = status;
    }

    // Apply scope restrictions for non-admins: directors/managers only ever see
    // their subordinates (strictly lower role level) within their own org unit —
    // never peers or superiors, even ones attached to the same direction/service.
    const roleLevelSql = `CASE u.role
      WHEN 'super_admin' THEN 6 WHEN 'admin' THEN 5 WHEN 'director' THEN 4
      WHEN 'manager' THEN 3 WHEN 'supervisor' THEN 2
      WHEN 'agent' THEN 1 WHEN 'externe' THEN 1 WHEN 'stagiaire' THEN 1 ELSE 0 END`;
    if (req.user!.role === 'director' && req.user!.directionId) {
      whereClause += ` AND u.direction_id = @userDirectionId AND (${roleLevelSql}) < @requesterLevel`;
      params.userDirectionId = req.user!.directionId;
      params.requesterLevel = ROLE_HIERARCHY[req.user!.role];
    } else if (req.user!.role === 'manager' && req.user!.serviceId) {
      whereClause += ` AND u.service_id = @userServiceId AND (${roleLevelSql}) < @requesterLevel`;
      params.userServiceId = req.user!.serviceId;
      params.requesterLevel = ROLE_HIERARCHY[req.user!.role];
    }

    const [countResult, users] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM users u ${whereClause}`,
        params
      ),
      DatabaseService.query<any>(
        `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active, u.status,
                u.enterprise_id, u.direction_id, u.service_id, u.supervisor_id, u.last_login_at, u.created_at,
                e.name as enterprise_name, d.name as direction_name, s.name as service_name,
                sup.display_name as supervisor_name
         FROM users u
         LEFT JOIN enterprises e ON u.enterprise_id = e.id
         LEFT JOIN directions d ON u.direction_id = d.id
         LEFT JOIN services s ON u.service_id = s.id
         LEFT JOIN users sup ON u.supervisor_id = sup.id
         ${whereClause}
         ORDER BY u.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: users,
      meta: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/users/:id
 * @desc Get user by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);
    const requester = req.user!;

    const users = await DatabaseService.query<any>(
      `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active, u.status,
              u.enterprise_id, u.direction_id, u.service_id, u.supervisor_id, u.last_login_at, u.created_at, u.updated_at,
              e.name as enterprise_name, d.name as direction_name, s.name as service_name,
              sup.display_name as supervisor_name
       FROM users u
       LEFT JOIN enterprises e ON u.enterprise_id = e.id
       LEFT JOIN directions d ON u.direction_id = d.id
       LEFT JOIN services s ON u.service_id = s.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       WHERE u.id = @userId AND u.tenant_id = @tenantId AND u.deleted_at IS NULL`,
      { userId, tenantId: requester.tenantId }
    );

    if (users.length === 0) {
      throw NotFoundError('User');
    }

    const target = users[0];

    // A user may always view their own record. Admins/super_admins see everyone.
    // Everyone else may only view a strict subordinate within their own scope —
    // see isInHierarchicalScope for the exact rules per role.
    if (userId !== requester.id && requester.role !== 'admin' && requester.role !== 'super_admin') {
      if (!isInHierarchicalScope(requester, target)) {
        throw ForbiddenError('Insufficient permissions to view this user');
      }
    }

    res.json({
      success: true,
      data: target,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/users/:id
 * @desc Update user
 */
router.put(
  '/:id',
  authenticate,
  [
    body('displayName').optional().trim(),
    body('avatarUrl').optional({ nullable: true }).isString(),
    body('role').optional().isIn(ALLOWED_ROLES),
    body('isActive').optional().isBoolean(),
    body('enterpriseId').optional().isInt(),
    body('directionId').optional().isInt(),
    body('serviceId').optional().isInt(),
    body('supervisorId').optional({ nullable: true }).isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);
      const isAdminLike = req.user!.role === 'admin' || req.user!.role === 'super_admin';

      // Check permissions
      const canEdit = isAdminLike ||
                     (req.user!.role === 'director' && !['admin', 'super_admin'].includes(req.body.role)) ||
                     req.user!.id === userId;

      if (!canEdit) {
        throw BadRequestError('Insufficient permissions to update this user');
      }

      if (req.body.role === 'super_admin' && req.user!.role !== 'super_admin') {
        throw BadRequestError('Only a super admin can grant the super admin role');
      }

      const updateFields: string[] = [];
      const params: Record<string, any> = { userId, tenantId: req.user!.tenantId };

      if (req.body.displayName) {
        updateFields.push('display_name = @displayName');
        params.displayName = req.body.displayName;
      }
      if (req.body.avatarUrl !== undefined) {
        updateFields.push('avatar_url = @avatarUrl');
        params.avatarUrl = req.body.avatarUrl;
      }
      if (req.body.role && isAdminLike) {
        updateFields.push('role = @role');
        params.role = req.body.role;
      }
      if (req.body.isActive !== undefined && isAdminLike) {
        updateFields.push('is_active = @isActive');
        params.isActive = req.body.isActive;
        // Keep status in sync so the two fields never contradict each other —
        // use the dedicated PUT /:id/status route for pending/suspended.
        updateFields.push('status = @statusFromIsActive');
        params.statusFromIsActive = req.body.isActive ? 'active' : 'deactivated';
      }
      if (req.body.enterpriseId !== undefined) {
        updateFields.push('enterprise_id = @enterpriseId');
        params.enterpriseId = req.body.enterpriseId;
      }
      if (req.body.directionId !== undefined) {
        updateFields.push('direction_id = @directionId');
        params.directionId = req.body.directionId;
      }
      if (req.body.serviceId !== undefined) {
        updateFields.push('service_id = @serviceId');
        params.serviceId = req.body.serviceId;
      }
      // Assigning a direct supervisor is an organizational decision, not personal
      // profile data — only admins/directors may set it (never the user themselves).
      if (req.body.supervisorId !== undefined && (isAdminLike || req.user!.role === 'director')) {
        let targetRoleForCheck = req.body.role && isAdminLike ? req.body.role : null;
        if (!targetRoleForCheck) {
          const existing = await DatabaseService.query<{ role: string }>(
            'SELECT role FROM users WHERE id = @userId AND tenant_id = @tenantId',
            { userId, tenantId: req.user!.tenantId }
          );
          if (existing.length === 0) throw NotFoundError('User');
          targetRoleForCheck = existing[0].role;
        }
        const supervisorId = await resolveSupervisorId(req.user!.tenantId, req.body.supervisorId, targetRoleForCheck);
        updateFields.push('supervisor_id = @supervisorId');
        params.supervisorId = supervisorId;
      }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE users SET ${updateFields.join(', ')}, updated_at = ${db.now()}
           WHERE id = @userId AND tenant_id = @tenantId`,
          params
        );

        // Only the fields actually changed, not the whole body — keeps the trail readable
        // and avoids ever writing a password/token into a log by accident.
        const changedFields = Object.keys(req.body).filter((k) =>
          ['displayName', 'role', 'isActive', 'enterpriseId', 'directionId', 'serviceId', 'avatarUrl', 'supervisorId'].includes(k)
        );
        await AuditService.log(req.user!.tenantId, req.user!.id, 'USER_UPDATED', 'users', userId, {
          fields: changedFields,
        });
      }

      const users = await DatabaseService.query<any>(
        `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.is_active, u.status,
                u.enterprise_id, u.direction_id, u.service_id, u.supervisor_id,
                sup.display_name as supervisor_name
         FROM users u
         LEFT JOIN users sup ON u.supervisor_id = sup.id
         WHERE u.id = @userId AND u.tenant_id = @tenantId`,
        { userId, tenantId: req.user!.tenantId }
      );

      res.json({
        success: true,
        data: users[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

const ACCOUNT_STATUSES = ['pending', 'active', 'suspended', 'deactivated'];

/**
 * @route PUT /api/v1/users/:id/status
 * @desc Change a user's account status (activate a pending signup, suspend,
 *       deactivate, or reinstate). Available to admins/super_admins for anyone,
 *       and to a director/manager/supervisor for their own subordinates — this
 *       is the "n+1 activates the pending account" action.
 */
router.put(
  '/:id/status',
  authenticate,
  [body('status').isIn(ACCOUNT_STATUSES)],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const userId = parseInt(req.params.id, 10);
      const requester = req.user!;
      const nextStatus = req.body.status as string;

      const targets = await DatabaseService.query<any>(
        `SELECT id, role, direction_id, service_id, supervisor_id, status, display_name, email
         FROM users WHERE id = @userId AND tenant_id = @tenantId AND deleted_at IS NULL`,
        { userId, tenantId: requester.tenantId }
      );
      if (targets.length === 0) throw NotFoundError('User');
      const target = targets[0];

      const isAdminLike = requester.role === 'admin' || requester.role === 'super_admin';
      const canManage = isAdminLike || isInHierarchicalScope(requester, target);
      if (!canManage) {
        throw ForbiddenError("Insufficient permissions to manage this user's status");
      }

      const previousStatus = target.status;
      await DatabaseService.execute(
        `UPDATE users SET status = @status, is_active = @isActive, updated_at = ${db.now()}
         WHERE id = @userId AND tenant_id = @tenantId`,
        { status: nextStatus, isActive: nextStatus === 'active', userId, tenantId: requester.tenantId }
      );

      await AuditService.log(requester.tenantId, requester.id, 'USER_STATUS_CHANGED', 'users', userId, {
        from: previousStatus,
        to: nextStatus,
      });

      if (nextStatus !== previousStatus) {
        const messages: Record<string, { subject: string; body: string }> = {
          active: {
            subject: 'Votre compte E-Formation est activé',
            body: `Bonjour ${target.display_name},\n\nVotre compte a été activé. Vous pouvez maintenant vous connecter.`,
          },
          suspended: {
            subject: 'Votre compte E-Formation a été suspendu',
            body: `Bonjour ${target.display_name},\n\nVotre compte a été suspendu. Contactez votre responsable pour plus d'informations.`,
          },
          deactivated: {
            subject: 'Votre compte E-Formation a été désactivé',
            body: `Bonjour ${target.display_name},\n\nVotre compte a été désactivé.`,
          },
          pending: {
            subject: 'Votre compte E-Formation est en attente',
            body: `Bonjour ${target.display_name},\n\nVotre compte est de nouveau en attente d'activation.`,
          },
        };
        const message = messages[nextStatus];
        NotificationService.send({
          tenantId: requester.tenantId,
          userId,
          channel: 'email',
          subject: message.subject,
          body: message.body,
          actionUrl: `${config.frontendUrl}/login`,
        }).catch(() => {
          // A failed notification must never roll back the status change itself.
        });
      }

      res.json({ success: true, data: { id: userId, status: nextStatus } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/users/:id
 * @desc Soft delete user
 */
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user!.id) {
      throw BadRequestError('Cannot delete your own account');
    }

    await DatabaseService.execute(
      `UPDATE users SET deleted_at = ${db.now()}, is_active = ${db.bool(false)}
       WHERE id = @userId AND tenant_id = @tenantId`,
      { userId, tenantId: req.user!.tenantId }
    );

    await AuditService.log(req.user!.tenantId, req.user!.id, 'USER_DELETED', 'users', userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/users/:id/badges
 * @desc Get user's badges
 */
router.get('/:id/badges', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);

    const badges = await DatabaseService.query<any>(
      `SELECT b.id, b.code, b.name, b.description, ub.awarded_at,
              f.storage_key as icon_url
       FROM user_badges ub
       JOIN badges b ON ub.badge_id = b.id
       LEFT JOIN file_assets f ON b.icon_file_id = f.id
       WHERE ub.user_id = @userId AND ub.tenant_id = @tenantId
       ORDER BY ub.awarded_at DESC`,
      { userId, tenantId: req.user!.tenantId }
    );

    res.json({
      success: true,
      data: badges,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/users/:id/certificates
 * @desc Get user's certificates
 */
router.get('/:id/certificates', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);

    const certificates = await DatabaseService.query<any>(
      `SELECT c.id, c.serial, c.issued_at, co.title as course_title,
              f.storage_key as pdf_url
       FROM certificates c
       JOIN courses co ON c.course_id = co.id
       LEFT JOIN file_assets f ON c.pdf_file_id = f.id
       WHERE c.user_id = @userId AND c.tenant_id = @tenantId
       ORDER BY c.issued_at DESC`,
      { userId, tenantId: req.user!.tenantId }
    );

    res.json({
      success: true,
      data: certificates,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/users/:id/progress
 * @desc Get user's learning progress
 */
router.get('/:id/progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);

    // Get course progress
    const progress = await DatabaseService.query<any>(
      `SELECT 
        c.id as course_id, c.title as course_title,
        COUNT(DISTINCT a.quiz_id) as quizzes_attempted,
        MAX(a.score) as best_score,
        (SELECT COUNT(*) FROM quizzes q 
         JOIN lessons l ON q.lesson_id = l.id 
         JOIN modules m ON l.module_id = m.id 
         WHERE m.course_id = c.id) as total_quizzes,
        CASE WHEN cert.id IS NOT NULL THEN 1 ELSE 0 END as completed
       FROM courses c
       LEFT JOIN modules m ON m.course_id = c.id
       LEFT JOIN lessons l ON l.module_id = m.id
       LEFT JOIN quizzes q ON q.lesson_id = l.id
       LEFT JOIN attempts a ON a.quiz_id = q.id AND a.user_id = @userId
       LEFT JOIN certificates cert ON cert.course_id = c.id AND cert.user_id = @userId
       WHERE c.tenant_id = @tenantId AND c.is_published = ${db.bool(true)}
       GROUP BY c.id, c.title, cert.id
       ORDER BY c.title`,
      { userId, tenantId: req.user!.tenantId }
    );

    res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
