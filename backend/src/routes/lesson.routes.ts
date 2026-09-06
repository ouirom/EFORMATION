import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { LessonService, CourseService } from '../services/course.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error.middleware';
import { DatabaseService } from '../services/database.service';
import { AuditService } from '../services/audit.service';
import { db, IS_PG } from '../database/db-helpers';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { resolveEntityId } from '../utils/resolvePublicId';

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
 * @route GET /api/v1/lessons/catalog
 * @desc Lessons across every course the caller can access, with their own progress on
 * each -- ?status=in_progress for a "continue where I left off" list, ?courseId= to
 * scope to one course, otherwise the full browsable catalog. Registered ahead of
 * GET /:id so "catalog" isn't captured as a lesson id.
 */
router.get('/catalog', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const status = req.query.status as string | undefined;
    const courseId = req.query.courseId ? parseInt(req.query.courseId as string, 10) : undefined;
    const mandatory = req.query.mandatory === 'true';

    const { data, total } = await CourseService.getLessonCatalog(req.user!.tenantId, req.user!, {
      status,
      courseId,
      mandatory,
      page,
      limit,
    });

    res.json({
      success: true,
      data,
      meta: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

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
       WHERE l.module_id = @moduleId AND l.tenant_id = @tenantId AND l.deleted_at IS NULL
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
    const lessonId = await resolveEntityId('lessons', req.params.id, req.user!.tenantId);

    const lessons = await DatabaseService.query<any>(
      `SELECT l.*, m.course_id
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = @lessonId AND l.tenant_id = @tenantId AND l.deleted_at IS NULL`,
      { lessonId, tenantId: req.user!.tenantId }
    );

    if (lessons.length === 0) {
      throw BadRequestError('Lesson not found');
    }

    // Being in the same tenant isn't enough on its own -- a lesson is only readable
    // if its course is (audience scope, enrollment, or a direct/group assignment).
    // Without this, changing the id in /lessons/:id lets any authenticated user read
    // any lesson in the tenant, including ones from courses restricted to other teams.
    const canAccess = await CourseService.canAccessCourse(req.user!.tenantId, lessons[0].course_id, req.user!);
    if (!canAccess) {
      throw ForbiddenError('You do not have access to this lesson');
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
    body('isMandatory').optional().isBoolean(),
    body('presenceCheckPercent').optional({ nullable: true }).isInt({ min: 0, max: 100 }),
    body('resetTimeOnReopen').optional().isBoolean(),
    body('allowDocumentDownload').optional().isBoolean(),
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
        isMandatory: req.body.isMandatory,
        presenceCheckPercent: req.body.presenceCheckPercent,
        resetTimeOnReopen: req.body.resetTimeOnReopen,
        allowDocumentDownload: req.body.allowDocumentDownload,
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
    body('isMandatory').optional().isBoolean(),
    body('presenceCheckPercent').optional({ nullable: true }).isInt({ min: 0, max: 100 }),
    body('resetTimeOnReopen').optional().isBoolean(),
    body('allowDocumentDownload').optional().isBoolean(),
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
          isMandatory: req.body.isMandatory,
          presenceCheckPercent: req.body.presenceCheckPercent,
          resetTimeOnReopen: req.body.resetTimeOnReopen,
          allowDocumentDownload: req.body.allowDocumentDownload,
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
      const isGenuineReopen = Date.now() - lastAccessedAt > RESUME_GAP_MS;
      if (isGenuineReopen) {
        await AuditService.log(tenantId, userId, 'COURSE_RESUMED', 'courses', courseId, { lessonId });
      }

      // A lesson can be configured to restart its time-to-complete counter every time
      // it's reopened instead of resuming the time already accumulated -- on every
      // /start call (not gated by the "genuine reopen" break above, which is only
      // about the COURSE_RESUMED audit log), except for an already-completed lesson
      // (that would un-complete finished progress).
      let resetTime = false;
      if (existing[0].status !== 'completed') {
        const lessonRows = await DatabaseService.query<{ reset_time_on_reopen: boolean }>(
          'SELECT reset_time_on_reopen FROM lessons WHERE id = @lessonId',
          { lessonId }
        );
        resetTime = !!lessonRows[0]?.reset_time_on_reopen;
      }

      // Update last accessed
      await DatabaseService.query(
        `UPDATE lesson_progress
         SET last_accessed_at = ${db.now()}, status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END
             ${resetTime ? ', time_spent_seconds = 0' : ''}
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

    // Same duration gate as POST /:id/complete -- otherwise a learner scrubbing a
    // video to the end (progressPercent hits 100 via the periodic tracker or the
    // beforeunload beacon) would auto-complete the lesson without it, bypassing
    // the explicit "Marquer comme terminé" gate entirely. Content progress is
    // still recorded either way; only the 'completed' status transition is gated.
    const lessons = await DatabaseService.query<{ duration_min: number | null }>(
      'SELECT duration_min FROM lessons WHERE id = @lessonId',
      { lessonId }
    );
    const requiredSeconds = (lessons[0]?.duration_min || 0) * 60;
    const existingProgress = await DatabaseService.query<{ time_spent_seconds: number }>(
      'SELECT time_spent_seconds FROM lesson_progress WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
      { lessonId, userId, tenantId }
    );
    const projectedSeconds = (existingProgress[0]?.time_spent_seconds || 0) + (timeSpentSeconds || 0);
    const durationReached = requiredSeconds === 0 || projectedSeconds >= requiredSeconds;
    const shouldComplete = progressPercent >= 100 && durationReached;

    await DatabaseService.query(
      `UPDATE lesson_progress
       SET progress_percent = @progressPercent,
           time_spent_seconds = time_spent_seconds + COALESCE(@timeSpentSeconds, 0),
           last_accessed_at = ${db.now()},
           status = CASE WHEN @shouldComplete = ${db.bool(true)} THEN 'completed' ELSE 'in_progress' END,
           completed_at = CASE WHEN @shouldComplete = ${db.bool(true)} AND completed_at IS NULL THEN ${db.now()} ELSE completed_at END
       WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
      { lessonId, userId, tenantId, progressPercent, timeSpentSeconds, shouldComplete }
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

    // Mirrors the quiz-start gate in attempt.routes.ts: a lesson with a set
    // duration can't be marked complete before that much time has actually
    // been spent on it (progress is tracked via /lessons/:id/progress).
    const lessons = await DatabaseService.query<{ duration_min: number | null }>(
      'SELECT duration_min FROM lessons WHERE id = @lessonId',
      { lessonId }
    );
    const requiredMinutes = lessons[0]?.duration_min || 0;
    if (requiredMinutes > 0) {
      const progress = await DatabaseService.query<{ time_spent_seconds: number }>(
        'SELECT time_spent_seconds FROM lesson_progress WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
        { lessonId, userId, tenantId }
      );
      const spentSeconds = progress[0]?.time_spent_seconds || 0;
      const requiredSeconds = requiredMinutes * 60;
      if (spentSeconds < requiredSeconds) {
        const remainingMinutes = Math.ceil((requiredSeconds - spentSeconds) / 60);
        throw BadRequestError(
          `Vous devez encore passer environ ${remainingMinutes} minute(s) sur la leçon avant de pouvoir la marquer comme terminée`,
          'LESSON_DURATION_NOT_REACHED',
          { requiredSeconds, spentSeconds }
        );
      }
    }

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
          `INSERT INTO enrollments (tenant_id, user_id, course_id, progress_percent, enrolled_at)
           VALUES (@tenantId, @userId, @courseId, 0, ${db.now()})`,
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

// ==================== NOTES (private, per-user) ====================

/**
 * @route GET /api/v1/lessons/:id/notes
 * @desc Get the current user's personal note for this lesson
 */
router.get('/:id/notes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const notes = await DatabaseService.query<any>(
      'SELECT * FROM lesson_notes WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
      { lessonId, userId: req.user!.id, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: notes[0] || null });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/lessons/:id/notes
 * @desc Create or update the current user's personal note for this lesson
 */
router.put(
  '/:id/notes',
  authenticate,
  [body('body').isString()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const lessonId = parseInt(req.params.id, 10);
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM lesson_notes WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
        { lessonId, userId, tenantId }
      );

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO lesson_notes (tenant_id, lesson_id, user_id, body)
           VALUES (@tenantId, @lessonId, @userId, @body)`,
          { tenantId, lessonId, userId, body: req.body.body }
        );
      } else {
        await DatabaseService.execute(
          `UPDATE lesson_notes SET body = @body, updated_at = ${db.now()}
           WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
          { lessonId, userId, tenantId, body: req.body.body }
        );
      }

      const notes = await DatabaseService.query<any>(
        'SELECT * FROM lesson_notes WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
        { lessonId, userId, tenantId }
      );
      res.json({ success: true, data: notes[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== COMMENTS (shared discussion) ====================

/**
 * @route GET /api/v1/lessons/:id/comments
 * @desc List comments on a lesson, oldest first
 */
router.get('/:id/comments', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const comments = await DatabaseService.query<any>(
      `SELECT lc.*, u.display_name as author_name, u.avatar_url as author_avatar
       FROM lesson_comments lc
       LEFT JOIN users u ON lc.user_id = u.id
       WHERE lc.lesson_id = @lessonId AND lc.tenant_id = @tenantId
       ORDER BY lc.created_at ASC`,
      { lessonId, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/lessons/:id/comments
 * @desc Add a comment to a lesson
 */
router.post(
  '/:id/comments',
  authenticate,
  [body('body').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const lessonId = parseInt(req.params.id, 10);
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO lesson_comments (tenant_id, lesson_id, user_id, body)
             VALUES (@tenantId, @lessonId, @userId, @body)
             RETURNING id`
          : `INSERT INTO lesson_comments (tenant_id, lesson_id, user_id, body)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @lessonId, @userId, @body)`,
        { tenantId, lessonId, userId, body: req.body.body }
      );

      const comment = await DatabaseService.query<any>(
        `SELECT lc.*, u.display_name as author_name, u.avatar_url as author_avatar
         FROM lesson_comments lc
         LEFT JOIN users u ON lc.user_id = u.id
         WHERE lc.id = @id`,
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: comment[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/lessons/:lessonId/comments/:commentId
 * @desc Delete a comment (own comment, or an admin/director moderating)
 */
router.delete('/:lessonId/comments/:commentId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const tenantId = req.user!.tenantId;

    const comments = await DatabaseService.query<{ user_id: number }>(
      'SELECT user_id FROM lesson_comments WHERE id = @commentId AND tenant_id = @tenantId',
      { commentId, tenantId }
    );
    if (comments.length === 0) {
      throw NotFoundError('Comment');
    }
    if (comments[0].user_id !== req.user!.id && !['admin', 'director', 'super_admin'].includes(req.user!.role)) {
      throw BadRequestError('Not authorized to delete this comment', 'FORBIDDEN');
    }

    await DatabaseService.execute('DELETE FROM lesson_comments WHERE id = @commentId AND tenant_id = @tenantId', {
      commentId,
      tenantId,
    });

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== EVALUATIONS (optional star rating) ====================

/**
 * @route GET /api/v1/lessons/:id/evaluations/me
 * @desc Get the current user's rating for this lesson, if any -- lets the
 * frontend skip re-prompting the rating popup once already rated.
 */
router.get('/:id/evaluations/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    const evaluations = await DatabaseService.query<any>(
      'SELECT * FROM lesson_evaluations WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
      { lessonId, userId: req.user!.id, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: evaluations[0] || null });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/lessons/:id/evaluations
 * @desc Submit (or update) the current user's optional star rating for this lesson
 */
router.post(
  '/:id/evaluations',
  authenticate,
  [body('rating').isInt({ min: 1, max: 5 }), body('comment').optional({ nullable: true }).isString()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const lessonId = parseInt(req.params.id, 10);
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM lesson_evaluations WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId',
        { lessonId, userId, tenantId }
      );

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO lesson_evaluations (tenant_id, lesson_id, user_id, rating, comment)
           VALUES (@tenantId, @lessonId, @userId, @rating, @comment)`,
          { tenantId, lessonId, userId, rating: req.body.rating, comment: req.body.comment || null }
        );
      } else {
        await DatabaseService.execute(
          `UPDATE lesson_evaluations SET rating = @rating, comment = @comment
           WHERE lesson_id = @lessonId AND user_id = @userId AND tenant_id = @tenantId`,
          { lessonId, userId, tenantId, rating: req.body.rating, comment: req.body.comment || null }
        );
      }

      res.json({ success: true, message: 'Evaluation saved' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
