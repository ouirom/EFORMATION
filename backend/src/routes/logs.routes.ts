import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

function buildFilters(req: AuthRequest) {
  const whereClauses = ['a.tenant_id = @tenantId'];
  const params: Record<string, any> = { tenantId: req.user!.tenantId };

  if (req.query.userId) {
    whereClauses.push('a.user_id = @userId');
    params.userId = parseInt(req.query.userId as string, 10);
  }
  if (req.query.action) {
    whereClauses.push('a.action = @action');
    params.action = req.query.action as string;
  }
  if (req.query.actions) {
    const actionList = (req.query.actions as string).split(',').map((a) => a.trim()).filter(Boolean);
    const placeholders = actionList.map((_, i) => `@actionIn${i}`);
    actionList.forEach((a, i) => { params[`actionIn${i}`] = a; });
    if (placeholders.length > 0) {
      whereClauses.push(`a.action IN (${placeholders.join(', ')})`);
    }
  }
  if (req.query.entity) {
    whereClauses.push('a.entity = @entity');
    params.entity = req.query.entity as string;
  }
  if (req.query.dateFrom) {
    whereClauses.push('a.created_at >= @dateFrom');
    params.dateFrom = new Date(req.query.dateFrom as string);
  }
  if (req.query.dateTo) {
    whereClauses.push('a.created_at <= @dateTo');
    params.dateTo = new Date(req.query.dateTo as string);
  }

  return { whereClause: whereClauses.join(' AND '), params };
}

/**
 * @route GET /api/v1/logs
 * @desc List audit log entries with filters (admin/director only — directors see their
 * own tenant same as admins here, since logs are already tenant-scoped)
 */
router.get(
  '/',
  authenticate,
  authorize('admin', 'director'),
  [
    query('userId').optional().isInt(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      const { whereClause, params } = buildFilters(req);

      const [countResult, logs] = await Promise.all([
        DatabaseService.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM audit_logs a WHERE ${whereClause}`,
          params
        ),
        DatabaseService.query<any>(
          `SELECT a.id, a.user_id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
                  u.display_name as user_name, u.email as user_email
           FROM audit_logs a
           LEFT JOIN users u ON a.user_id = u.id
           WHERE ${whereClause}
           ORDER BY a.created_at DESC
           OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
          { ...params, offset, limit }
        ),
      ]);

      res.json({
        success: true,
        data: logs,
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
  }
);

/**
 * @route GET /api/v1/logs/actions
 * @desc Distinct action/entity values currently in the log, to populate filter dropdowns
 */
router.get('/actions', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const [actions, entities] = await Promise.all([
      DatabaseService.query<{ action: string }>(
        'SELECT DISTINCT action FROM audit_logs WHERE tenant_id = @tenantId ORDER BY action',
        { tenantId: req.user!.tenantId }
      ),
      DatabaseService.query<{ entity: string }>(
        'SELECT DISTINCT entity FROM audit_logs WHERE tenant_id = @tenantId AND entity IS NOT NULL ORDER BY entity',
        { tenantId: req.user!.tenantId }
      ),
    ]);
    res.json({
      success: true,
      data: {
        actions: actions.map((a) => a.action),
        entities: entities.map((e) => e.entity),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/logs/export
 * @desc Export filtered audit logs as CSV
 */
router.get(
  '/export',
  authenticate,
  authorize('admin', 'director'),
  [
    query('userId').optional().isInt(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { whereClause, params } = buildFilters(req);

      const logs = await DatabaseService.query<any>(
        `SELECT a.id, a.created_at, u.display_name as user_name, u.email as user_email,
                a.action, a.entity, a.entity_id, a.metadata
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE ${whereClause}
         ORDER BY a.created_at DESC`,
        params
      );

      const escapeCsv = (value: any) => {
        const str = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };

      const header = ['ID', 'Date', 'Utilisateur', 'Email', 'Action', 'Entité', 'ID Entité', 'Détails'];
      const rows = logs.map((l: any) => [
        l.id,
        new Date(l.created_at).toISOString(),
        l.user_name || '',
        l.user_email || '',
        l.action,
        l.entity || '',
        l.entity_id ?? '',
        l.metadata || '',
      ]);

      const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
      res.send('﻿' + csv); // BOM so Excel opens UTF-8 accents correctly
    } catch (error) {
      next(error);
    }
  }
);

function buildTrainingFilters(req: AuthRequest) {
  const whereClauses = ['lp.tenant_id = @tenantId'];
  const params: Record<string, any> = { tenantId: req.user!.tenantId };

  if (req.query.userId) {
    whereClauses.push('lp.user_id = @userId');
    params.userId = parseInt(req.query.userId as string, 10);
  }
  if (req.query.courseId) {
    whereClauses.push('lp.course_id = @courseId');
    params.courseId = parseInt(req.query.courseId as string, 10);
  }
  if (req.query.dateFrom) {
    whereClauses.push('lp.last_accessed_at >= @dateFrom');
    params.dateFrom = new Date(req.query.dateFrom as string);
  }
  if (req.query.dateTo) {
    whereClauses.push('lp.last_accessed_at <= @dateTo');
    params.dateTo = new Date(req.query.dateTo as string);
  }

  return { whereClause: whereClauses.join(' AND '), params };
}

// progress_percent is computed from actual lesson_progress rows rather than read from
// enrollments.progress_percent — that column is only ever written by the lesson
// /complete endpoint's UPDATE, which silently affects 0 rows for any user who has
// lesson progress without a matching enrollments row (e.g. admin/test accounts that
// never went through an explicit "enroll" step), leaving it permanently NULL/0.
const TRAINING_AGGREGATE_SQL = `
  SELECT
    lp.user_id, u.display_name as user_name, u.email as user_email,
    lp.course_id, c.title as course_title,
    SUM(lp.time_spent_seconds) as total_seconds,
    MIN(lp.started_at) as started_at,
    MAX(lp.last_accessed_at) as last_accessed_at,
    COUNT(DISTINCT lp.lesson_id) as lessons_touched,
    COUNT(DISTINCT CASE WHEN lp.status = 'completed' THEN lp.lesson_id END) as lessons_completed,
    (SELECT COUNT(*) FROM lessons l WHERE l.module_id IN (SELECT id FROM modules WHERE course_id = lp.course_id)) as total_lessons,
    e.completed_at,
    (SELECT COUNT(*) FROM audit_logs a
     WHERE a.action = 'COURSE_RESUMED' AND a.entity = 'courses' AND a.entity_id = lp.course_id AND a.user_id = lp.user_id) as resume_count
  FROM lesson_progress lp
  JOIN users u ON lp.user_id = u.id
  JOIN courses c ON lp.course_id = c.id
  LEFT JOIN enrollments e ON e.course_id = lp.course_id AND e.user_id = lp.user_id AND e.tenant_id = lp.tenant_id
  WHERE {whereClause}
  GROUP BY lp.user_id, u.display_name, u.email, lp.course_id, c.title, e.completed_at
`;

function withProgressPercent(rows: any[]) {
  return rows.map((r) => ({
    ...r,
    progress_percent: r.total_lessons > 0 ? Math.round((100 * r.lessons_completed) / r.total_lessons) : 0,
  }));
}

/**
 * @route GET /api/v1/logs/training
 * @desc Per-user/per-course training summary: time spent, resume count, completion —
 * built from lesson_progress + the COURSE_RESUMED/COURSE_STARTED/COURSE_COMPLETED
 * audit trail, not a separate table.
 */
router.get(
  '/training',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    query('userId').optional().isInt(),
    query('courseId').optional().isInt(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      const { whereClause, params } = buildTrainingFilters(req);
      const aggregateSql = TRAINING_AGGREGATE_SQL.replace('{whereClause}', whereClause);

      const [rows, countRows] = await Promise.all([
        DatabaseService.query<any>(
          `${aggregateSql} ORDER BY MAX(lp.last_accessed_at) DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
          { ...params, offset, limit }
        ),
        DatabaseService.query<{ total: number }>(
          `SELECT COUNT(*) as total FROM (${aggregateSql}) t`,
          params
        ),
      ]);

      res.json({
        success: true,
        data: withProgressPercent(rows),
        meta: {
          page,
          limit,
          total: countRows[0]?.total || 0,
          totalPages: Math.ceil((countRows[0]?.total || 0) / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/logs/training/export
 * @desc Export the training summary as CSV
 */
router.get(
  '/training/export',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    query('userId').optional().isInt(),
    query('courseId').optional().isInt(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { whereClause, params } = buildTrainingFilters(req);
      const aggregateSql = TRAINING_AGGREGATE_SQL.replace('{whereClause}', whereClause);

      const rows = withProgressPercent(
        await DatabaseService.query<any>(
          `${aggregateSql} ORDER BY MAX(lp.last_accessed_at) DESC`,
          params
        )
      );

      const escapeCsv = (value: any) => {
        const str = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };

      const header = [
        'Utilisateur', 'Email', 'Formation', 'Temps total (min)', 'Leçons terminées',
        'Leçons totales', 'Progression (%)', 'Nombre de reprises', 'Démarré le', 'Dernier accès', 'Terminé le',
      ];
      const dataRows = rows.map((r: any) => [
        r.user_name,
        r.user_email,
        r.course_title,
        Math.round((r.total_seconds || 0) / 60),
        r.lessons_completed,
        r.total_lessons,
        r.progress_percent ?? '',
        r.resume_count,
        r.started_at ? new Date(r.started_at).toISOString() : '',
        r.last_accessed_at ? new Date(r.last_accessed_at).toISOString() : '',
        r.completed_at ? new Date(r.completed_at).toISOString() : '',
      ]);

      const csv = [header, ...dataRows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="training-logs-${Date.now()}.csv"`);
      res.send('﻿' + csv);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
