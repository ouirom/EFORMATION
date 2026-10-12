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
import { PendingNotificationService } from '../services/pending-notification.service';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../middleware/error.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { config } from '../config';
import { parseSpreadsheet } from '../utils/xlsx';
import { logger } from '../utils/logger';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isInHierarchicalScope, resolveViewableUserId } from '../utils/hierarchyScope';
import { AuthService } from '../services/auth.service';
import { OrgStructureService } from '../services/org-structure.service';
import { ComplianceService } from '../services/compliance.service';

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
    body('jobTitle').optional({ nullable: true }).trim(),
    body('enterpriseId').optional({ nullable: true }).isInt(),
    body('subsidiaryId').optional({ nullable: true }).isInt(),
    body('directionId').optional({ nullable: true }).isInt(),
    body('serviceId').optional({ nullable: true }).isInt(),
    body('supervisorId').optional({ nullable: true }).isInt(),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);

    // Directors can only create non-admin, non-super-admin users; admins can't
    // create super_admins (only an existing super_admin can create another).
    if (req.user!.role === 'director' && ['admin', 'super_admin'].includes(req.body.role)) {
      throw BadRequestError('Directors cannot create admin or super admin users');
    }
    if (req.user!.role === 'admin' && req.body.role === 'super_admin') {
      throw BadRequestError('Only a super admin can create another super admin');
    }

    await AuthService.assertPasswordAllowed(req.user!.tenantId, req.body.password);

    // users.email/username carry a GLOBAL unique constraint (not scoped per
    // tenant), matching auth.service.ts's register() — a same-email user in a
    // different tenant must be caught here too, or it sails past this check
    // and hits the raw INSERT as an unhandled constraint violation (500)
    // instead of a clean 409. Soft-deleted accounts are excluded so a freed-up
    // email can be reused.
    const existingUsers = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM users WHERE email = @email AND deleted_at IS NULL',
      { email: req.body.email }
    );

    if (existingUsers.length > 0) {
      throw ConflictError('Email already registered');
    }

    const supervisorId = await resolveSupervisorId(req.user!.tenantId, req.body.supervisorId, req.body.role);
    // Enterprise / subsidiary / direction / service, consistent and of this tenant.
    const placement = await OrgStructureService.resolvePlacement(req.user!.tenantId, req.body);

    // Generate username from email
    const username = req.body.email.split('@')[0] + '_' + Date.now().toString(36);

    // Hash password
    const passwordHash = await bcrypt.hash(req.body.password, config.bcryptRounds);

    // Insert user
    let result: { id: number }[];
    try {
      result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role, job_title,
              enterprise_id, subsidiary_id, direction_id, service_id, supervisor_id, is_active
            )
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role, @jobTitle,
              @enterpriseId, @subsidiaryId, @directionId, @serviceId, @supervisorId, @isActive
            )
            RETURNING id`
          : `INSERT INTO users (
              tenant_id, email, username, password_hash, display_name, role, job_title,
              enterprise_id, subsidiary_id, direction_id, service_id, supervisor_id, is_active
            )
            OUTPUT INSERTED.id
            VALUES (
              @tenantId, @email, @username, @passwordHash, @displayName, @role, @jobTitle,
              @enterpriseId, @subsidiaryId, @directionId, @serviceId, @supervisorId, @isActive
            )`,
        {
          tenantId: req.user!.tenantId,
          email: req.body.email,
          username,
          passwordHash,
          displayName: req.body.displayName,
          role: req.body.role,
          jobTitle: req.body.jobTitle || 'Défaut',
          ...placement,
          supervisorId,
          isActive: true,
        }
      );
    } catch (error: any) {
      // Belt-and-suspenders for a race between two concurrent creations with
      // the same email/generated username slipping past the checks above.
      if (error?.code === '23505' || error?.number === 2627 || error?.number === 2601) {
        throw ConflictError('Email already registered');
      }
      throw error;
    }

    const userId = result[0].id;

    await AuditService.log(req.user!.tenantId, req.user!.id, 'USER_CREATED', 'users', userId, {
      email: req.body.email,
      role: req.body.role,
    });

    // Queue the welcome email instead of sending it -- the admin confirms
    // it in a dialog right after this response comes back. Unlike the
    // bulk-import flow (which generates a temporary password nobody else
    // knows), the admin typed this password themselves, so it isn't
    // repeated here; just point the new user at where to log in. A failed
    // queue must never fail account creation itself.
    let pendingNotification: { id: number; subject: string; recipientEmail: string } | null = null;
    try {
      pendingNotification = await PendingNotificationService.queue({
        tenantId: req.user!.tenantId,
        userId,
        eventType: 'account_created',
        subject: 'Votre compte E-Formation a été créé',
        body: `Bonjour ${req.body.displayName},\n\nUn compte E-Formation a été créé pour vous.\nIdentifiant : ${req.body.email}\n\nConnectez-vous avec le mot de passe qui vous a été communiqué par votre administrateur.`,
        actionUrl: `${config.frontendUrl}/login`,
        triggeredBy: req.user!.id,
      });
    } catch (error) {
      logger.error('Failed to queue account-creation email', { error, userId });
    }

    // Get created user
    const users = await DatabaseService.query<any>(
      `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.job_title, u.is_active,
              u.enterprise_id, u.subsidiary_id, u.direction_id, u.service_id, u.supervisor_id, u.created_at,
              e.name as enterprise_name, sub.name as subsidiary_name, d.name as direction_name, s.name as service_name,
              sup.display_name as supervisor_name
       FROM users u
       LEFT JOIN enterprises e ON u.enterprise_id = e.id
       LEFT JOIN subsidiaries sub ON u.subsidiary_id = sub.id
       LEFT JOIN directions d ON u.direction_id = d.id
       LEFT JOIN services s ON u.service_id = s.id
       LEFT JOIN users sup ON u.supervisor_id = sup.id
       WHERE u.id = @userId`,
      { userId }
    );

    res.status(201).json({
      success: true,
      data: users[0],
      pendingNotification,
    });
  })
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
 *       role, enterpriseCode, subsidiaryCode, directionCode, serviceCode, supervisorEmail — all optional
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
  asyncHandler(async (req: AuthRequest, res) => {
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
    const [enterprises, directions, subsidiaries, services] = await Promise.all([
      DatabaseService.query<{ id: number; code: string }>(
        'SELECT id, code FROM enterprises WHERE tenant_id = @tenantId AND code IS NOT NULL',
        { tenantId }
      ),
      DatabaseService.query<{ id: number; code: string }>(
        'SELECT id, code FROM directions WHERE tenant_id = @tenantId AND code IS NOT NULL',
        { tenantId }
      ),
      DatabaseService.query<{ id: number; code: string }>(
        'SELECT id, code FROM subsidiaries WHERE tenant_id = @tenantId AND code IS NOT NULL',
        { tenantId }
      ),
      DatabaseService.query<{ id: number; code: string }>(
        'SELECT id, code FROM services WHERE tenant_id = @tenantId AND code IS NOT NULL',
        { tenantId }
      ),
    ]);
    const enterpriseByCode = new Map(enterprises.map((e) => [e.code, e.id]));
    const subsidiaryByCode = new Map(subsidiaries.map((s) => [s.code, s.id]));
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
      const subsidiaryId = row.subsidiaryCode ? subsidiaryByCode.get(row.subsidiaryCode.trim()) ?? null : null;
      const directionId = row.directionCode ? directionByCode.get(row.directionCode.trim()) ?? null : null;
      const serviceId = row.serviceCode ? serviceByCode.get(row.serviceCode.trim()) ?? null : null;

      // Codes must exist and fit together (a service of another direction was
      // silently accepted before); the lowest level fills in its parents.
      const unknownCode = [
        ['enterpriseCode', enterpriseId],
        ['subsidiaryCode', subsidiaryId],
        ['directionCode', directionId],
        ['serviceCode', serviceId],
      ].find(([column, id]) => row[column as string] && !id);
      if (unknownCode) {
        results.push({ line, email, status: 'error', message: `Unknown ${unknownCode[0]} "${row[unknownCode[0] as string]}"` });
        continue;
      }
      let placement;
      try {
        placement = await OrgStructureService.resolvePlacement(tenantId, { enterpriseId, subsidiaryId, directionId, serviceId });
      } catch (error: any) {
        results.push({ line, email, status: 'error', message: error.message });
        continue;
      }

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
                enterprise_id, subsidiary_id, direction_id, service_id, supervisor_id, is_active
              )
              VALUES (
                @tenantId, @email, @username, @passwordHash, @displayName, @role,
                @enterpriseId, @subsidiaryId, @directionId, @serviceId, @supervisorId, @isActive
              )
              RETURNING id`
            : `INSERT INTO users (
                tenant_id, email, username, password_hash, display_name, role,
                enterprise_id, subsidiary_id, direction_id, service_id, supervisor_id, is_active
              )
              OUTPUT INSERTED.id
              VALUES (
                @tenantId, @email, @username, @passwordHash, @displayName, @role,
                @enterpriseId, @subsidiaryId, @directionId, @serviceId, @supervisorId, @isActive
              )`,
          { tenantId, email, username, passwordHash, displayName, role, ...placement, supervisorId, isActive: true }
        );

        knownEmails.add(email);
        userByEmail.set(email, { id: result[0].id, email, role });
        created++;
        results.push({ line, email, status: 'created' });

        try {
          // Bulk import can create far too many accounts for a per-row
          // confirm dialog -- queued here for batch review in the admin
          // "File d'attente emails" page instead.
          await PendingNotificationService.queue({
            tenantId,
            userId: result[0].id,
            eventType: 'account_created',
            subject: 'Votre compte E-Formation a été créé',
            body: `Bonjour ${displayName},\n\nVotre compte a été créé. Identifiant : ${email}\nMot de passe temporaire : ${tempPassword}\n\nMerci de le changer dès votre première connexion.`,
            actionUrl: `${config.frontendUrl}/login`,
            triggeredBy: req.user!.id,
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
  })
);

/**
 * @route GET /api/v1/users
 * @desc List users (with filters)
 */
router.get('/', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const { page, limit, offset } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
  const search = req.query.search as string;
  const role = req.query.role as string;
  const directionId = req.query.directionId as string;
  const serviceId = req.query.serviceId as string;
  const supervisorId = req.query.supervisorId as string;
  const subsidiaryId = req.query.subsidiaryId as string;
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
  if (subsidiaryId) {
    whereClause += ' AND u.subsidiary_id = @subsidiaryId';
    params.subsidiaryId = parseInt(subsidiaryId, 10);
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
      `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.job_title, u.external_company, u.is_active, u.status,
              u.enterprise_id, u.subsidiary_id, u.direction_id, u.service_id, u.supervisor_id, u.last_login_at, u.created_at,
              CASE WHEN u.locked_until > ${db.now()} THEN u.locked_until ELSE NULL END as locked_until,
              e.name as enterprise_name, sub.name as subsidiary_name, d.name as direction_name, s.name as service_name,
              sup.display_name as supervisor_name
       FROM users u
       LEFT JOIN enterprises e ON u.enterprise_id = e.id
       LEFT JOIN subsidiaries sub ON u.subsidiary_id = sub.id
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
    meta: buildPaginationMeta(countResult[0].total, page, limit),
  });
}));

/**
 * @route POST /api/v1/users/:id/unlock
 * @desc Lift a lockout caused by too many wrong passwords (Administration >
 *       Organisation > Accès & sécurité). Same permission as changing the
 *       account status: admins for anyone, a manager for their subordinates.
 */
router.post('/:id/unlock', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const requester = req.user!;

  const targets = await DatabaseService.query<any>(
    `SELECT id, role, direction_id, service_id, supervisor_id
     FROM users WHERE id = @userId AND tenant_id = @tenantId AND deleted_at IS NULL`,
    { userId, tenantId: requester.tenantId }
  );
  if (targets.length === 0) throw NotFoundError('User');

  const isAdminLike = requester.role === 'admin' || requester.role === 'super_admin';
  if (!isAdminLike && !isInHierarchicalScope(requester, targets[0])) {
    throw ForbiddenError('Insufficient permissions to unlock this user');
  }

  await DatabaseService.execute(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ${db.now()}
     WHERE id = @userId AND tenant_id = @tenantId`,
    { userId, tenantId: requester.tenantId }
  );
  await AuditService.log(requester.tenantId, requester.id, 'ACCOUNT_UNLOCKED', 'users', userId);

  res.json({ success: true, message: 'Account unlocked' });
}));

/**
 * @route POST /api/v1/users/:id/force-logout
 * @desc "Forcer la déconnexion": closes every session of the account right away
 *       (stolen device, departure...). Same permission as unlocking: admins for
 *       anyone of their organization at or below their own level, a manager for
 *       their subordinates.
 */
router.post('/:id/force-logout', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const requester = req.user!;

  const targets = await DatabaseService.query<any>(
    `SELECT id, role, direction_id, service_id, supervisor_id
     FROM users WHERE id = @userId AND tenant_id = @tenantId AND deleted_at IS NULL`,
    { userId, tenantId: requester.tenantId }
  );
  if (targets.length === 0) throw NotFoundError('User');
  const target = targets[0];

  const isAdminLike = requester.role === 'admin' || requester.role === 'super_admin';
  const outranked = (ROLE_HIERARCHY[target.role] || 0) > (ROLE_HIERARCHY[requester.role] || 0);
  if (outranked || (!isAdminLike && !isInHierarchicalScope(requester, target))) {
    throw ForbiddenError('Insufficient permissions to sign this user out');
  }

  const closedSessions = await AuthService.forceLogout(userId, requester.tenantId, requester.id);

  res.json({ success: true, data: { closedSessions } });
}));

/**
 * @route GET /api/v1/users/search
 * @desc Find a colleague to start a chat conversation with. Unlike GET / (admin/
 * director/manager only, tenant-wide), any authenticated user can call this --
 * but the pool it searches is scoped down accordingly: a manager and above search
 * the whole tenant, everyone else only their own direction/service (their
 * organizational neighborhood), never the full user directory. Registered ahead
 * of GET /:id so "search" isn't captured as a user id.
 */
router.get('/search', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const search = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);

  const whereClauses = ['u.tenant_id = @tenantId', 'u.deleted_at IS NULL', `u.is_active = ${db.bool(true)}`, 'u.id != @selfId'];
  const params: Record<string, any> = { tenantId: req.user!.tenantId, selfId: req.user!.id, limit };

  if (search) {
    whereClauses.push('(u.display_name LIKE @search OR u.email LIKE @search)');
    params.search = `%${search}%`;
  }

  const isAdminTier = (ROLE_HIERARCHY[req.user!.role] || 0) >= ROLE_HIERARCHY.manager;
  if (!isAdminTier) {
    const neighborhoodClauses: string[] = [];
    if (req.user!.directionId) {
      neighborhoodClauses.push('u.direction_id = @userDirectionId');
      params.userDirectionId = req.user!.directionId;
    }
    if (req.user!.serviceId) {
      neighborhoodClauses.push('u.service_id = @userServiceId');
      params.userServiceId = req.user!.serviceId;
    }
    if (req.user!.enterpriseId) {
      neighborhoodClauses.push('u.enterprise_id = @userEnterpriseId');
      params.userEnterpriseId = req.user!.enterpriseId;
    }
    // No org unit at all (shouldn't normally happen for a non-admin-tier
    // account) -- fall back to "nobody" rather than accidentally exposing the
    // whole tenant.
    whereClauses.push(neighborhoodClauses.length > 0 ? `(${neighborhoodClauses.join(' OR ')})` : '1=0');
  }

  const users = await DatabaseService.query<any>(
    IS_PG
      ? `SELECT id, display_name, email, avatar_url, role
         FROM users u
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY display_name
         LIMIT @limit`
      : `SELECT TOP (@limit) id, display_name, email, avatar_url, role
         FROM users u
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY display_name`,
    params
  );

  res.json({ success: true, data: users });
}));

/**
 * @route GET /api/v1/users/:id
 * @desc Get user by ID
 */
router.get('/:id', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);
  const requester = req.user!;

  const users = await DatabaseService.query<any>(
    `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.job_title, u.is_active, u.status,
            u.enterprise_id, u.subsidiary_id, u.direction_id, u.service_id, u.supervisor_id, u.last_login_at, u.created_at, u.updated_at,
            e.name as enterprise_name, sub.name as subsidiary_name, d.name as direction_name, s.name as service_name,
            sup.display_name as supervisor_name
     FROM users u
     LEFT JOIN enterprises e ON u.enterprise_id = e.id
       LEFT JOIN subsidiaries sub ON u.subsidiary_id = sub.id
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
}));

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
    body('jobTitle').optional({ nullable: true }).trim(),
    body('isActive').optional().isBoolean(),
    body('enterpriseId').optional({ nullable: true }).isInt(),
    body('subsidiaryId').optional({ nullable: true }).isInt(),
    body('directionId').optional({ nullable: true }).isInt(),
    body('serviceId').optional({ nullable: true }).isInt(),
    body('supervisorId').optional({ nullable: true }).isInt(),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);
    const isAdminLike = req.user!.role === 'admin' || req.user!.role === 'super_admin';

    // Check permissions
    const canEdit = isAdminLike ||
                   (req.user!.role === 'director' && !['admin', 'super_admin'].includes(req.body.role)) ||
                   req.user!.id === userId;

    if (!canEdit) {
      throw ForbiddenError('Insufficient permissions to update this user');
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
    if (req.body.jobTitle !== undefined) {
      updateFields.push('job_title = @jobTitle');
      params.jobTitle = req.body.jobTitle || 'Défaut';
    }
    if (req.body.isActive !== undefined && isAdminLike) {
      updateFields.push('is_active = @isActive');
      params.isActive = req.body.isActive;
      // Keep status in sync so the two fields never contradict each other —
      // use the dedicated PUT /:id/status route for pending/suspended.
      updateFields.push('status = @statusFromIsActive');
      params.statusFromIsActive = req.body.isActive ? 'active' : 'deactivated';
    }
    // Enterprise / subsidiary / direction / service: an organizational decision
    // (a user could move themselves into another manager's scope via PUT /users/me),
    // so admins and directors only, and always a consistent placement of this tenant.
    const placementKeys = ['enterpriseId', 'subsidiaryId', 'directionId', 'serviceId'] as const;
    if (placementKeys.some((key) => req.body[key] !== undefined)) {
      if (!isAdminLike && req.user!.role !== 'director') {
        throw ForbiddenError('Only an administrator can change the organizational placement');
      }
      const current = (
        await DatabaseService.query<any>(
          'SELECT enterprise_id, subsidiary_id, direction_id, service_id FROM users WHERE id = @userId AND tenant_id = @tenantId',
          { userId, tenantId: req.user!.tenantId }
        )
      )[0];
      if (!current) throw NotFoundError('User');
      // Fields left out keep their value; null clears them. The lowest level given
      // then decides its parents (OrgStructureService.resolvePlacement).
      const requested: Record<string, unknown> = {
        enterpriseId: current.enterprise_id,
        subsidiaryId: current.subsidiary_id,
        directionId: current.direction_id,
        serviceId: current.service_id,
      };
      for (const key of placementKeys) {
        if (req.body[key] !== undefined) requested[key] = req.body[key];
      }
      // Changing an upper level without its children drops the children.
      if (req.body.enterpriseId !== undefined && req.body.subsidiaryId === undefined && req.body.directionId === undefined) {
        requested.subsidiaryId = null;
        requested.directionId = null;
        requested.serviceId = null;
      }
      if (req.body.directionId !== undefined && req.body.serviceId === undefined) requested.serviceId = null;
      if (req.body.serviceId && req.body.directionId === undefined) requested.directionId = null;
      if (req.body.directionId !== undefined && req.body.subsidiaryId === undefined) requested.subsidiaryId = null;
      if (req.body.directionId !== undefined && req.body.enterpriseId === undefined) requested.enterpriseId = null;
      const placement = await OrgStructureService.resolvePlacement(req.user!.tenantId, requested);
      updateFields.push(
        'enterprise_id = @enterpriseId',
        'subsidiary_id = @subsidiaryId',
        'direction_id = @directionId',
        'service_id = @serviceId'
      );
      Object.assign(params, placement);
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
        ['displayName', 'role', 'jobTitle', 'isActive', 'enterpriseId', 'subsidiaryId', 'directionId', 'serviceId', 'avatarUrl', 'supervisorId'].includes(k)
      );
      await AuditService.log(req.user!.tenantId, req.user!.id, 'USER_UPDATED', 'users', userId, {
        fields: changedFields,
      });
    }

    const users = await DatabaseService.query<any>(
      `SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.role, u.job_title, u.external_company, u.is_active, u.status,
              u.enterprise_id, u.subsidiary_id, u.direction_id, u.service_id, u.supervisor_id,
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
  })
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
  asyncHandler(async (req: AuthRequest, res) => {
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

    // Suspension is the one status transition in the email-confirmation
    // scope (see plan) -- it goes through the pending-notification queue so
    // the admin confirms it right away. The other transitions keep sending
    // immediately, unchanged.
    let pendingNotification: { id: number; subject: string; recipientEmail: string } | null = null;
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

      if (nextStatus === 'suspended') {
        try {
          pendingNotification = await PendingNotificationService.queue({
            tenantId: requester.tenantId,
            userId,
            eventType: 'account_suspended',
            subject: message.subject,
            body: message.body,
            actionUrl: `${config.frontendUrl}/login`,
            triggeredBy: requester.id,
          });
        } catch (error) {
          logger.error('Failed to queue account-suspension email', { error, userId });
        }
      } else {
        NotificationService.send({
          tenantId: requester.tenantId,
          userId,
          channel: 'email',
          subject: message.subject,
          essential: true, // account activation/suspension
          body: message.body,
          actionUrl: `${config.frontendUrl}/login`,
        }).catch(() => {
          // A failed notification must never roll back the status change itself.
        });
      }
    }

    res.json({ success: true, data: { id: userId, status: nextStatus }, pendingNotification });
  })
);

/**
 * @route DELETE /api/v1/users/:id
 * @desc Soft delete user
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res) => {
  const userId = parseInt(req.params.id, 10);

  if (userId === req.user!.id) {
    throw BadRequestError('Cannot delete your own account');
  }

  // Organization setting (Conformité): deleting also erases the personal data.
  // Done first, so a failure leaves the account untouched rather than deleted
  // but still carrying its personal data.
  const anonymized = await ComplianceService.shouldAnonymizeOnDelete(req.user!.tenantId);
  if (anonymized) {
    await ComplianceService.anonymizeUser(req.user!.tenantId, userId, req.user!.id);
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
    anonymized,
  });
}));

/**
 * @route POST /api/v1/users/:id/anonymize
 * @desc Erase the personal data of an already deleted account (GDPR erasure
 *       request, or accounts deleted before anonymization was turned on).
 */
router.post('/:id/anonymize', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const rows = await DatabaseService.query<{ id: number; deleted_at: string | null; anonymized_at: string | null }>(
    'SELECT id, deleted_at, anonymized_at FROM users WHERE id = @userId AND tenant_id = @tenantId',
    { userId, tenantId: req.user!.tenantId }
  );
  if (rows.length === 0) throw NotFoundError('User');
  if (!rows[0].deleted_at) {
    throw BadRequestError('Delete the account before anonymizing it', 'USER_NOT_DELETED');
  }
  if (!rows[0].anonymized_at) {
    await ComplianceService.anonymizeUser(req.user!.tenantId, userId, req.user!.id);
  }
  res.json({ success: true, message: 'User anonymized' });
}));

/**
 * @route GET /api/v1/users/:id/export
 * @desc Everything stored about a person, as a JSON file (GDPR access /
 *       portability). "me" for oneself; admins for anyone of their organization.
 */
router.get('/:id/export', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.params.id === 'me' ? req.user!.id : parseInt(req.params.id, 10);
  const isAdminLike = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  if (userId !== req.user!.id && !isAdminLike) {
    throw ForbiddenError('You can only export your own data');
  }
  const data = await ComplianceService.exportUserData(req.user!.tenantId, userId);
  if (!data.profile) throw NotFoundError('User');

  await AuditService.log(req.user!.tenantId, req.user!.id, 'USER_DATA_EXPORTED', 'users', userId);
  res.setHeader('Content-Disposition', `attachment; filename="donnees-personnelles-${userId}.json"`);
  res.json(data);
}));

/**
 * @route GET /api/v1/users/:id/badges
 * @desc Get user's badges
 */
router.get('/:id/badges', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = await resolveViewableUserId(req.user!, req.params.id);

  const badges = await DatabaseService.query<any>(
    `SELECT b.id, b.code, b.name, b.description, b.badge_type, ub.awarded_at,
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
}));

/**
 * @route GET /api/v1/users/:id/certificates
 * @desc Get user's certificates
 */
router.get('/:id/certificates', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = await resolveViewableUserId(req.user!, req.params.id);

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
}));

/**
 * @route GET /api/v1/users/:id/progress
 * @desc Get user's learning progress
 */
router.get('/:id/progress', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = await resolveViewableUserId(req.user!, req.params.id);

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
     LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.user_id = @userId
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
}));

export default router;
