import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { db, IS_PG } from '../database/db-helpers';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/enrollments/my
 * @desc List the current user's course enrollments
 */
router.get('/my', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const enrollments = await DatabaseService.query<any>(
      `SELECT e.id, e.course_id, c.title as course_title, e.progress_percent, e.enrolled_at, e.started_at, e.completed_at
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.tenant_id = @tenantId AND e.user_id = @userId
       ORDER BY e.enrolled_at DESC`,
      { tenantId: req.user!.tenantId, userId: req.user!.id }
    );

    res.json({ success: true, data: enrollments });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/enrollments
 * @desc Enroll the current user in a course (idempotent)
 */
router.post(
  '/',
  authenticate,
  [body('courseId').isInt()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const courseId = parseInt(req.body.courseId, 10);
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;

      const course = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM courses WHERE id = @courseId AND tenant_id = @tenantId AND is_published = ${db.bool(true)}`,
        { courseId, tenantId }
      );
      if (course.length === 0) {
        throw NotFoundError('Course');
      }

      const existing = await DatabaseService.query<any>(
        `SELECT id, course_id, progress_percent, enrolled_at, started_at, completed_at
         FROM enrollments WHERE course_id = @courseId AND user_id = @userId AND tenant_id = @tenantId`,
        { courseId, userId, tenantId }
      );

      if (existing.length > 0) {
        res.json({ success: true, data: existing[0] });
        return;
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO enrollments (tenant_id, user_id, course_id, progress_percent, enrolled_at)
             VALUES (@tenantId, @userId, @courseId, 0, ${db.now()})
             RETURNING id`
          : `INSERT INTO enrollments (tenant_id, user_id, course_id, progress_percent, enrolled_at)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @userId, @courseId, 0, ${db.now()})`,
        { tenantId, userId, courseId }
      );

      await AuditService.log(tenantId, userId, 'COURSE_ENROLLED', 'courses', courseId);

      const enrollment = await DatabaseService.query<any>(
        `SELECT id, course_id, progress_percent, enrolled_at, started_at, completed_at
         FROM enrollments WHERE id = @id`,
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: enrollment[0] });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
