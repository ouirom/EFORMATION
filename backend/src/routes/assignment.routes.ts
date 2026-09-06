import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { DatabaseService } from '../services/database.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { AuditService } from '../services/audit.service';
import { ReminderService } from '../services/reminder.service';
import { PendingNotificationService } from '../services/pending-notification.service';
import { db, IS_PG } from '../database/db-helpers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { teamAssignmentClause, teamAssignmentClauseForUserRow } from '../utils/teamAssignment';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== CATEGORIES ====================

/**
 * @route GET /api/v1/assignments/categories
 * @desc List all categories
 */
router.get('/categories', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const categories = await DatabaseService.query<any>(
      `SELECT id, name FROM categories WHERE tenant_id = @tenantId ORDER BY name`,
      { tenantId: req.user!.tenantId }
    );

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/assignments/categories
 * @desc Create a new category
 */
router.post(
  '/categories',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO categories (tenant_id, name)
             VALUES (@tenantId, @name)
             RETURNING id`
          : `INSERT INTO categories (tenant_id, name)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @name)`,
        {
          tenantId: req.user!.tenantId,
          name: req.body.name,
        }
      );

      res.status(201).json({
        success: true,
        data: { id: result[0].id, name: req.body.name },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/assignments/categories/:id
 * @desc Update a category
 */
router.put(
  '/categories/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const categoryId = parseInt(req.params.id, 10);

      await DatabaseService.execute(
        `UPDATE categories SET name = @name WHERE id = @id AND tenant_id = @tenantId`,
        {
          id: categoryId,
          tenantId: req.user!.tenantId,
          name: req.body.name,
        }
      );

      res.json({
        success: true,
        data: { id: categoryId, name: req.body.name },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/assignments/categories/:id
 * @desc Delete a category
 */
router.delete(
  '/categories/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const categoryId = parseInt(req.params.id, 10);

      await DatabaseService.execute(
        `DELETE FROM categories WHERE id = @id AND tenant_id = @tenantId`,
        {
          id: categoryId,
          tenantId: req.user!.tenantId,
        }
      );

      res.json({
        success: true,
        message: 'Category deleted',
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== COURSE ASSIGNMENTS ====================

/**
 * @route GET /api/v1/assignments
 * @desc List all course assignments
 */
router.get('/', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const courseId = req.query.courseId ? parseInt(req.query.courseId as string, 10) : null;

    let whereClause = 'WHERE ca.tenant_id = @tenantId';
    const params: any = { tenantId: req.user!.tenantId };

    if (courseId) {
      whereClause += ' AND ca.course_id = @courseId';
      params.courseId = courseId;
    }

    const assignments = await DatabaseService.query<any>(
      `SELECT ca.*,
              c.title as course_title,
              l.title as lesson_title,
              u.display_name as assigned_by_name,
              CASE
                WHEN ca.assignment_type = 'user' THEN (SELECT display_name FROM users WHERE id = ca.target_id AND tenant_id = ca.tenant_id)
                WHEN ca.assignment_type = 'enterprise' THEN (SELECT name FROM enterprises WHERE id = ca.target_id AND tenant_id = ca.tenant_id)
                WHEN ca.assignment_type = 'direction' THEN (SELECT name FROM directions WHERE id = ca.target_id AND tenant_id = ca.tenant_id)
                WHEN ca.assignment_type = 'service' THEN (SELECT name FROM services WHERE id = ca.target_id AND tenant_id = ca.tenant_id)
                WHEN ca.assignment_type = 'team' THEN (SELECT name FROM teams WHERE id = ca.target_id AND tenant_id = ca.tenant_id)
                ELSE NULL
              END as target_name
       FROM course_assignments ca
       JOIN courses c ON ca.course_id = c.id
       LEFT JOIN lessons l ON ca.lesson_id = l.id
       LEFT JOIN users u ON ca.assigned_by = u.id
       ${whereClause}
       ORDER BY ca.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: assignments.map((a: any) => ({
        id: a.id,
        tenantId: a.tenant_id,
        courseId: a.course_id,
        courseTitle: a.course_title,
        lessonId: a.lesson_id,
        lessonTitle: a.lesson_title,
        assignmentType: a.assignment_type,
        targetId: a.target_id,
        targetName: a.target_name,
        targetRole: a.target_role,
        isMandatory: a.is_mandatory,
        dueDate: a.due_date,
        assignedBy: a.assigned_by,
        assignedByName: a.assigned_by_name,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/assignments
 * @desc Create course assignments (assign course to users/groups)
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('courseId').isInt(),
    body('lessonId').optional().isInt(),
    body('assignmentType').isIn(['user', 'enterprise', 'direction', 'service', 'role', 'team']),
    body('targetIds').isArray({ min: 1 }),
    body('targetRole').optional().trim(),
    body('isMandatory').optional().isBoolean(),
    body('dueDate').optional().isISO8601(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const { courseId, lessonId, assignmentType, targetIds, targetRole, isMandatory, dueDate } = req.body;

      // Check if course exists
      const courseExists = await DatabaseService.query<{ id: number; title: string }>(
        `SELECT id, title FROM courses WHERE id = @courseId AND tenant_id = @tenantId`,
        { courseId, tenantId: req.user!.tenantId }
      );

      if (courseExists.length === 0) {
        throw NotFoundError('Course');
      }
      const courseTitle = courseExists[0].title;

      // When scoped to a single lesson (rather than the whole course), confirm that
      // lesson actually belongs to this course before attributing anything to it.
      let lessonTitle: string | null = null;
      if (lessonId) {
        const lessonRows = await DatabaseService.query<{ title: string }>(
          `SELECT l.title FROM lessons l
           JOIN modules m ON l.module_id = m.id
           WHERE l.id = @lessonId AND m.course_id = @courseId AND l.tenant_id = @tenantId`,
          { lessonId, courseId, tenantId: req.user!.tenantId }
        );
        if (lessonRows.length === 0) {
          throw BadRequestError('This lesson does not belong to the given course', 'INVALID_LESSON');
        }
        lessonTitle = lessonRows[0].title;
      }

      // Validate every target belongs to the caller's tenant before inserting anything,
      // so an assignment can never be created against another tenant's user/org unit.
      if (assignmentType !== 'role') {
        const targetTable =
          assignmentType === 'user' ? 'users' :
          assignmentType === 'enterprise' ? 'enterprises' :
          assignmentType === 'direction' ? 'directions' :
          assignmentType === 'service' ? 'services' : 'teams';

        const placeholders = targetIds.map((_: any, i: number) => `@targetId${i}`).join(', ');
        const params: Record<string, any> = { tenantId: req.user!.tenantId };
        targetIds.forEach((id: any, i: number) => { params[`targetId${i}`] = id; });

        const validTargets = await DatabaseService.query<{ id: number }>(
          `SELECT id FROM ${targetTable} WHERE tenant_id = @tenantId AND id IN (${placeholders})`,
          params
        );

        if (validTargets.length !== new Set(targetIds.map((id: any) => Number(id))).size) {
          throw BadRequestError('One or more targets do not belong to this organization', 'INVALID_TARGET');
        }
      }

      const createdAssignments: Array<{ id: number; courseId: any; assignmentType: string; targetId: any }> = [];

      for (const targetId of targetIds) {
        // Check if assignment already exists -- lesson_id compared NULL-safely so a
        // whole-course assignment and a specific-lesson assignment for the same
        // course/target are treated as distinct, but re-submitting the exact same
        // (course, lesson, target) is caught as a duplicate.
        const existing = await DatabaseService.query<any>(
          `SELECT id FROM course_assignments
           WHERE tenant_id = @tenantId AND course_id = @courseId
           AND assignment_type = @assignmentType AND target_id = @targetId
           AND (lesson_id = @lessonId OR (lesson_id IS NULL AND @lessonId${IS_PG ? '::bigint' : ''} IS NULL))`,
          {
            tenantId: req.user!.tenantId,
            courseId,
            assignmentType,
            targetId,
            lessonId: lessonId || null,
          }
        );

        if (existing.length === 0) {
          const result = await DatabaseService.query<{ id: number }>(
            IS_PG
              ? `INSERT INTO course_assignments (tenant_id, course_id, lesson_id, assignment_type, target_id, target_role, is_mandatory, due_date, assigned_by)
                 VALUES (@tenantId, @courseId, @lessonId, @assignmentType, @targetId, @targetRole, @isMandatory, @dueDate, @assignedBy)
                 RETURNING id`
              : `INSERT INTO course_assignments (tenant_id, course_id, lesson_id, assignment_type, target_id, target_role, is_mandatory, due_date, assigned_by)
                 OUTPUT INSERTED.id
                 VALUES (@tenantId, @courseId, @lessonId, @assignmentType, @targetId, @targetRole, @isMandatory, @dueDate, @assignedBy)`,
            {
              tenantId: req.user!.tenantId,
              courseId,
              lessonId: lessonId || null,
              assignmentType,
              targetId,
              targetRole: targetRole || null,
              isMandatory: isMandatory || false,
              dueDate: dueDate || null,
              assignedBy: req.user!.id,
            }
          );

          createdAssignments.push({
            id: result[0].id,
            courseId: courseId,
            assignmentType: assignmentType as string,
            targetId: targetId as number,
          });
        }
      }

      if (createdAssignments.length > 0) {
        await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_ASSIGNMENT_CREATED', 'course_assignments', courseId, {
          courseId,
          assignmentType,
          targetCount: createdAssignments.length,
          isMandatory: isMandatory || false,
        });
      }

      // Notify the affected learners -- queued rather than sent immediately.
      // A single user assigned by id gets an immediate confirm dialog
      // (Bucket A); anything broader (multiple targets, or a whole
      // enterprise/direction/service/role) is queued for later review in the
      // admin "File d'attente emails" page (Bucket B), since resolving a
      // group can affect many users and no one admin is "confirming" each one.
      let pendingNotification: { id: number; subject: string; recipientEmail: string } | null = null;
      if (createdAssignments.length > 0) {
        try {
          const assignmentIds = createdAssignments.map((a) => a.id);
          const placeholders = assignmentIds.map((_, i) => `@assignmentId${i}`).join(', ');
          const params: Record<string, any> = { tenantId: req.user!.tenantId };
          assignmentIds.forEach((id, i) => { params[`assignmentId${i}`] = id; });

          const affectedUsers = await DatabaseService.query<{ id: number }>(
            `SELECT DISTINCT u.id
             FROM course_assignments ca
             JOIN users u ON u.tenant_id = ca.tenant_id AND (
               (ca.assignment_type = 'user' AND u.id = ca.target_id)
               OR (ca.assignment_type = 'enterprise' AND u.enterprise_id = ca.target_id)
               OR (ca.assignment_type = 'direction' AND u.direction_id = ca.target_id)
               OR (ca.assignment_type = 'service' AND u.service_id = ca.target_id)
               OR (ca.assignment_type = 'role' AND u.role = ca.target_role)
               OR ${teamAssignmentClauseForUserRow('ca', 'u')}
             )
             WHERE ca.id IN (${placeholders}) AND ca.tenant_id = @tenantId AND u.is_active = ${db.bool(true)} AND u.deleted_at IS NULL`,
            params
          );

          const subject = lessonId
            ? `Une leçon vous a été attribuée : ${lessonTitle}`
            : `Un cours vous a été attribué : ${courseTitle}`;
          const body = lessonId
            ? `Bonjour,\n\nLa leçon "${lessonTitle}" (cours "${courseTitle}") vous a été attribuée${isMandatory ? ' (obligatoire)' : ''}.${dueDate ? `\nÀ terminer avant le ${new Date(dueDate).toLocaleDateString('fr-FR')}.` : ''}`
            : `Bonjour,\n\nLe cours "${courseTitle}" vous a été attribué${isMandatory ? ' (obligatoire)' : ''}.${dueDate ? `\nÀ terminer avant le ${new Date(dueDate).toLocaleDateString('fr-FR')}.` : ''}`;
          const actionUrl = lessonId
            ? `${config.frontendUrl}/courses/${courseId}/lessons/${lessonId}`
            : `${config.frontendUrl}/courses/${courseId}`;

          const queued = await Promise.all(
            affectedUsers.map((u) =>
              PendingNotificationService.queue({
                tenantId: req.user!.tenantId,
                userId: u.id,
                eventType: 'course_assigned',
                subject,
                body,
                actionUrl,
                triggeredBy: req.user!.id,
                metadata: { courseId, lessonId: lessonId || undefined, assignmentType },
              })
            )
          );

          const isSingleTargetedUser = assignmentType === 'user' && targetIds.length === 1;
          if (isSingleTargetedUser && queued.length === 1) {
            pendingNotification = queued[0];
          }
        } catch (error) {
          logger.error('Failed to queue course-assignment emails', { error, courseId });
        }
      }

      res.status(201).json({
        success: true,
        data: createdAssignments,
        message: `${createdAssignments.length} assignment(s) created`,
        pendingNotification,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/assignments/:id
 * @desc Remove a course assignment
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const assignmentId = parseInt(req.params.id, 10);

      await DatabaseService.execute(
        `DELETE FROM course_assignments WHERE id = @id AND tenant_id = @tenantId`,
        {
          id: assignmentId,
          tenantId: req.user!.tenantId,
        }
      );

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_ASSIGNMENT_DELETED', 'course_assignments', assignmentId);

      res.json({
        success: true,
        message: 'Assignment removed',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/assignments/users
 * @desc Get users for assignment selection
 */
router.get('/users', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const search = req.query.search as string;
    
    let whereClause = `WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)} AND deleted_at IS NULL`;
    const params: any = { tenantId: req.user!.tenantId };

    if (search) {
      whereClause += ' AND (display_name LIKE @search OR email LIKE @search)';
      params.search = `%${search}%`;
    }

    const users = await DatabaseService.query<any>(
      `SELECT id, display_name, email, role 
       FROM users 
       ${whereClause}
       ORDER BY display_name`,
      params
    );

    res.json({
      success: true,
      data: users.map((u: any) => ({
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        role: u.role,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/assignments/my-courses
 * @desc Get courses assigned to current user
 */
router.get('/my-courses', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const enterpriseId = req.user!.enterpriseId;
    const directionId = req.user!.directionId;
    const serviceId = req.user!.serviceId;
    const userRole = req.user!.role;

    // Get all courses assigned to user directly or via their organization/role
    const courses = await DatabaseService.query<any>(
      `SELECT DISTINCT c.*, 
              ca.is_mandatory, ca.due_date,
              (SELECT COUNT(*) FROM modules WHERE course_id = c.id) as module_count
       FROM courses c
       INNER JOIN course_assignments ca ON c.id = ca.course_id AND ca.tenant_id = c.tenant_id
       WHERE c.tenant_id = @tenantId
         AND c.is_published = ${db.bool(true)}
         AND (
           (ca.assignment_type = 'user' AND ca.target_id = @userId)
           OR (ca.assignment_type = 'enterprise' AND ca.target_id = @enterpriseId)
           OR (ca.assignment_type = 'direction' AND ca.target_id = @directionId)
           OR (ca.assignment_type = 'service' AND ca.target_id = @serviceId)
           OR (ca.assignment_type = 'role' AND ca.target_role = @userRole)
           OR ${teamAssignmentClause('ca', 'userId', 'enterpriseId', 'directionId', 'serviceId')}
         )
       ORDER BY ca.is_mandatory DESC, ca.due_date ASC`,
      {
        tenantId: req.user!.tenantId,
        userId,
        enterpriseId: enterpriseId || 0,
        directionId: directionId || 0,
        serviceId: serviceId || 0,
        userRole,
      }
    );

    res.json({
      success: true,
      data: courses.map((c: any) => ({
        id: c.id,
        publicId: c.public_id,
        title: c.title,
        description: c.description,
        category: c.category,
        level: c.level,
        duration: c.duration,
        isMandatory: c.is_mandatory,
        dueDate: c.due_date,
        moduleCount: c.module_count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/assignments/reminders/run
 * @desc Manually trigger the due-date reminder/escalation job (admin only, for testing/on-demand runs)
 */
router.post('/reminders/run', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const result = await ReminderService.runDailyAssignmentReminders();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
