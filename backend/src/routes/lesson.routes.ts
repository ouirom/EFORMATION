import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { LessonService } from '../services/course.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError } from '../middleware/error.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { db, IS_PG } from '../database/db-helpers';

// A lesson revisited within this window is treated as normal in-session navigation,
// not a deliberate return to the training — avoids inflating the "resume" count with
// routine back-and-forth clicks between lessons of the same course.
const RESUME_GAP_MS = 30 * 60 * 1000;

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/lessons?moduleId=X
 * @desc Get lessons for a module
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const moduleId = req.query.moduleId as string;
    if (!moduleId) {
      throw BadRequestError('moduleId is required');
    }

    const lessons = await DatabaseService.query<any>(
      `SELECT l.*, 
              (SELECT COUNT(*) FROM contents WHERE lesson_id = l.id) as content_count,
              (SELECT COUNT(*) FROM quizzes WHERE lesson_id = l.id) as quiz_count
       FROM lessons l 
       WHERE l.module_id = @moduleId AND l.tenant_id = @tenantId 
       ORDER BY l.position`,
      { moduleId: parseInt(moduleId, 10), tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: lessons });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/lessons/:id
 * @desc Get lesson by ID with contents
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);

    const lessons = await DatabaseService.query<any>(
      'SELECT * FROM lessons WHERE id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId: req.user!.tenantId }
    );

    if (lessons.length === 0) {
      throw BadRequestError('Lesson not found');
    }

    const contents = await DatabaseService.query<any>(
      `SELECT c.*, f.id as file_asset_id, f.filename, f.mime_type, f.storage_key
       FROM contents c
       LEFT JOIN file_assets f ON c.file_id = f.id
       WHERE c.lesson_id = @lessonId AND c.tenant_id = @tenantId
       ORDER BY c.position`,
      { lessonId, tenantId: req.user!.tenantId }
    );

    const quizzes = await DatabaseService.query<any>(
      'SELECT * FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId: req.user!.tenantId }
    );

    res.json({
      success: true,
      data: {
        ...lessons[0],
        contents,
        quizzes,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/lessons
 * @desc Create a new lesson
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('moduleId').isInt(),
    body('title').notEmpty().trim(),
    body('type').optional().isString().trim(),
    body('position').optional().isInt(),
    body('durationMin').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      let position = req.body.position;
      if (position === undefined) {
        const maxPos = await DatabaseService.query<{ max_pos: number }>(
          'SELECT COALESCE(MAX(position), 0) as max_pos FROM lessons WHERE module_id = @moduleId',
          { moduleId: req.body.moduleId }
        );
        position = maxPos[0].max_pos + 1;
      }

      const lesson = await LessonService.create({
        tenantId: req.user!.tenantId,
        moduleId: req.body.moduleId,
        title: req.body.title,
        type: req.body.type,
        position,
        durationMin: req.body.durationMin,
      });

      res.status(201).json({ success: true, data: lesson });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/lessons/:id
 * @desc Update lesson
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').optional().trim(),
    body('type').optional().isString().trim(),
    body('position').optional().isInt(),
    body('durationMin').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const lessonId = parseInt(req.params.id, 10);

      const lesson = await LessonService.update(
        req.user!.tenantId,
        lessonId,
        {
          title: req.body.title,
          type: req.body.type,
          position: req.body.position,
          durationMin: req.body.durationMin,
        }
      );

      res.json({ success: true, data: lesson });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/lessons/:id
 * @desc Delete lesson
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const lessonId = parseInt(req.params.id, 10);
      await LessonService.delete(req.user!.tenantId, lessonId);
      res.json({ success: true, message: 'Lesson deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/lessons/:id/progress
 * @desc Get lesson progress for current user
 */
router.get('/:id/progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    const progress = await DatabaseService.query<any>(
      `SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId }
    );

    res.json({ 
      success: true, 
      data: progress[0] || { 
        status: 'not_started', 
        progress_percent: 0,
        time_spent_seconds: 0 
      } 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/lessons/:id/start
 * @desc Start/track lesson progress
 */
router.post('/:id/start', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const courseId = parseInt(req.body.courseId, 10);
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    // Check if progress already exists
    const existing = await DatabaseService.query<any>(
      `SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId }
    );

    if (existing.length > 0) {
      // A genuine return to training after a break — not routine navigation between
      // lessons in the same active session — counts as a course "resume".
      const lastAccessedAt = existing[0].last_accessed_at ? new Date(existing[0].last_accessed_at).getTime() : 0;
      if (Date.now() - lastAccessedAt > RESUME_GAP_MS) {
        await AuditService.log(tenantId, userId, 'COURSE_RESUMED', 'courses', courseId, { lessonId });
      }

      // Update last accessed
      await DatabaseService.query(
        `UPDATE lesson_progress
         SET last_accessed_at = ${db.now()}, status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END
         WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
        { lessonId, userId, tenantId }
      );
    } else {
      // First time this user touches ANY lesson in this course? Log a course start.
      const anyProgressInCourse = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `SELECT id FROM lesson_progress WHERE user_id = @userId AND tenant_id = @tenantId AND course_id = @courseId LIMIT 1`
          : `SELECT TOP 1 id FROM lesson_progress WHERE user_id = @userId AND tenant_id = @tenantId AND course_id = @courseId`,
        { userId, tenantId, courseId }
      );
      if (anyProgressInCourse.length === 0) {
        await AuditService.log(tenantId, userId, 'COURSE_STARTED', 'courses', courseId, { lessonId });
      }

      // Create new progress record
      await DatabaseService.query(
        `INSERT INTO lesson_progress (tenant_id, user_id, lesson_id, course_id, status, progress_percent, started_at, last_accessed_at)
         VALUES (@tenantId, @userId, @lessonId, @courseId, 'in_progress', 0, ${db.now()}, ${db.now()})`,
        { tenantId, userId, lessonId, courseId }
      );
    }

    const progress = await DatabaseService.query<any>(
      `SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId }
    );

    res.json({ success: true, data: progress[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/lessons/:id/progress
 * @desc Update lesson progress
 */
router.post('/:id/progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const { progressPercent, timeSpentSeconds } = req.body;
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    await DatabaseService.query(
      `UPDATE lesson_progress
       SET progress_percent = @progressPercent,
           time_spent_seconds = time_spent_seconds + COALESCE(@timeSpentSeconds, 0),
           last_accessed_at = ${db.now()},
           status = CASE WHEN @progressPercent >= 100 THEN 'completed' ELSE 'in_progress' END,
           completed_at = CASE WHEN @progressPercent >= 100 AND completed_at IS NULL THEN ${db.now()} ELSE completed_at END
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId, progressPercent, timeSpentSeconds }
    );

    const progress = await DatabaseService.query<any>(
      `SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId }
    );

    res.json({ success: true, data: progress[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/lessons/:id/complete
 * @desc Mark lesson as completed
 */
router.post('/:id/complete', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    await DatabaseService.query(
      `UPDATE lesson_progress
       SET status = 'completed',
           progress_percent = 100,
           completed_at = ${db.now()},
           last_accessed_at = ${db.now()}
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId }
    );

    // Update course progress
    const courseProgress = await DatabaseService.query<any>(
      `SELECT 
         lp.course_id,
         COUNT(DISTINCT l.id) as total_lessons,
         COUNT(DISTINCT CASE WHEN lp2.status = 'completed' THEN lp2.lesson_id END) as completed_lessons
       FROM lesson_progress lp
       JOIN lessons l ON l.module_id IN (SELECT id FROM modules WHERE course_id = lp.course_id)
       LEFT JOIN lesson_progress lp2 ON lp2.lesson_id = l.id AND lp2.user_id = @userId AND lp2.tenant_id = @tenantId
       WHERE lp.lesson_id = @lessonId AND lp.user_id = @userId AND lp.tenant_id = @tenantId
       GROUP BY lp.course_id`,
      { lessonId, userId, tenantId }
    );

    if (courseProgress.length > 0) {
      const { course_id, total_lessons, completed_lessons } = courseProgress[0];
      const progressPercent = Math.round((completed_lessons / total_lessons) * 100);

      // Safety net: a learner can reach a lesson via a direct assignment link without
      // ever hitting the explicit "Enroll" action, so completing a lesson may be the
      // first evidence we have of their enrollment.
      const existingEnrollment = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM enrollments WHERE course_id = @courseId AND user_id = @userId AND tenant_id = @tenantId`,
        { courseId: course_id, userId, tenantId }
      );

      if (existingEnrollment.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO enrollments (tenant_id, user_id, course_id, progress_percent, enrolled_at, started_at)
           VALUES (@tenantId, @userId, @courseId, 0, ${db.now()}, ${db.now()})`,
          { tenantId, userId, courseId: course_id }
        );
      }

      await DatabaseService.query(
        `UPDATE enrollments
         SET progress_percent = @progressPercent,
             completed_at = CASE WHEN @progressPercent = 100 THEN ${db.now()} ELSE completed_at END
         WHERE course_id = @courseId AND user_id = @userId AND tenant_id = @tenantId`,
        { courseId: course_id, userId, tenantId, progressPercent }
      );

      if (progressPercent === 100) {
        const totalTime = await DatabaseService.query<{ total_seconds: number }>(
          `SELECT SUM(time_spent_seconds) as total_seconds FROM lesson_progress
           WHERE user_id = @userId AND tenant_id = @tenantId AND course_id = @courseId`,
          { userId, tenantId, courseId: course_id }
        );
        await AuditService.log(tenantId, userId, 'COURSE_COMPLETED', 'courses', course_id, {
          totalTimeSeconds: totalTime[0]?.total_seconds || 0,
        });
      }
    }

    const progress = await DatabaseService.query<any>(
      `SELECT * FROM lesson_progress 
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId }
    );

    res.json({ success: true, data: progress[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
