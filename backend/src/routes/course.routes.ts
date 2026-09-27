import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { CourseService, ModuleService, LessonService, ContentService } from '../services/course.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError, ForbiddenError } from '../middleware/error.middleware';
import { AuditService } from '../services/audit.service';
import { DatabaseService } from '../services/database.service';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { resolveEntityId } from '../utils/resolvePublicId';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== COURSES ====================

/**
 * @route GET /api/v1/courses
 * @desc List all courses
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const sortBy = req.query.sortBy as string;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc';
    const search = req.query.search as string;
    const status = req.query.status as string;
    const category = req.query.category as string;

    const result = await CourseService.findAll(
      req.user!.tenantId,
      { page, limit, sortBy, sortOrder },
      { search, status, category },
      req.user!.id,
      req.user!.role,
      req.user!.enterpriseId,
      req.user!.directionId,
      req.user!.serviceId
    );

    res.json({
      success: true,
      data: result.data,
      meta: buildPaginationMeta(result.total, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/courses
 * @desc Create a new course
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').notEmpty().trim(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    body('duration').optional().toInt(),
    body('audienceScope').optional().isObject(),
    body('prerequisites').optional().isObject(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const course = await CourseService.create({
        tenantId: req.user!.tenantId,
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        level: req.body.level,
        duration: req.body.duration ? parseInt(req.body.duration, 10) : undefined,
        audienceScope: req.body.audienceScope,
        prerequisites: req.body.prerequisites,
        createdBy: req.user!.id,
      });

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_CREATED', 'courses', course.id, {
        title: course.title,
      });

      res.status(201).json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/courses/categories
 * @desc Get all course categories
 */
router.get('/categories', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const categories = await CourseService.getCategories(req.user!.tenantId);

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/courses/:id
 * @desc Get course by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const courseId = await resolveEntityId('courses', req.params.id, req.user!.tenantId);
    const course = await CourseService.findById(req.user!.tenantId, courseId);

    res.json({
      success: true,
      data: course,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/courses/:id/full
 * @desc Get full course structure with modules, lessons, contents
 */
router.get('/:id/full', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const courseId = await resolveEntityId('courses', req.params.id, req.user!.tenantId);

    const canAccess = await CourseService.canAccessCourse(req.user!.tenantId, courseId, req.user!);
    if (!canAccess) {
      throw ForbiddenError('You do not have access to this course');
    }

    const fullCourse = await CourseService.getFullStructure(req.user!.tenantId, courseId);

    res.json({
      success: true,
      data: fullCourse,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/courses/:id/my-progress
 * @desc The current user's real enrollment/progress state for this course --
 * used by the course detail page instead of assuming every visitor is
 * enrolled and every lesson incomplete.
 */
router.get('/:id/my-progress', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const courseId = await resolveEntityId('courses', req.params.id, req.user!.tenantId);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const enrollments = await DatabaseService.query<any>(
      `SELECT progress_percent, enrolled_at, completed_at
       FROM enrollments WHERE course_id = @courseId AND user_id = @userId AND tenant_id = @tenantId`,
      { courseId, userId, tenantId }
    );

    const completedLessons = await DatabaseService.query<{ lesson_id: number }>(
      `SELECT lp.lesson_id
       FROM lesson_progress lp
       JOIN lessons l ON l.id = lp.lesson_id
       JOIN modules m ON m.id = l.module_id
       WHERE m.course_id = @courseId AND lp.user_id = @userId AND lp.tenant_id = @tenantId AND lp.status = 'completed'`,
      { courseId, userId, tenantId }
    );

    res.json({
      success: true,
      data: {
        enrolled: enrollments.length > 0,
        progressPercent: enrollments[0]?.progress_percent || 0,
        completedLessonIds: completedLessons.map((r) => r.lesson_id),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/courses/:id
 * @desc Update course
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('level').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    body('duration').optional().isInt({ min: 0 }),
    body('audienceScope').optional().isObject(),
    body('prerequisites').optional().isObject(),
    body('isPublished').optional().isBoolean(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const courseId = parseInt(req.params.id, 10);
      const course = await CourseService.update(
        req.user!.tenantId,
        courseId,
        req.body,
        req.user!.id,
        req.user!.role
      );

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_UPDATED', 'courses', courseId, {
        fields: Object.keys(req.body),
      });

      res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/courses/:id
 * @desc Delete course
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const courseId = parseInt(req.params.id, 10);
      await CourseService.delete(
        req.user!.tenantId,
        courseId,
        req.user!.id,
        req.user!.role
      );

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_DELETED', 'courses', courseId);

      res.json({
        success: true,
        message: 'Course deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/courses/:id/publish
 * @desc Publish course
 */
router.post(
  '/:id/publish',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const courseId = parseInt(req.params.id, 10);
      const course = await CourseService.publish(req.user!.tenantId, courseId);

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_PUBLISHED', 'courses', courseId, {
        title: course.title,
      });

      res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/courses/:id/unpublish
 * @desc Unpublish course
 */
router.post(
  '/:id/unpublish',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const courseId = parseInt(req.params.id, 10);
      const course = await CourseService.unpublish(req.user!.tenantId, courseId);

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_UNPUBLISHED', 'courses', courseId, {
        title: course.title,
      });

      res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/courses/:id/clone
 * @desc Clone course
 */
router.post(
  '/:id/clone',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [body('title').optional().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      const courseId = parseInt(req.params.id, 10);
      const course = await CourseService.clone(
        req.user!.tenantId,
        courseId,
        req.body.title,
        req.user!.id
      );

      await AuditService.log(req.user!.tenantId, req.user!.id, 'COURSE_CLONED', 'courses', course.id, {
        sourceCourseId: courseId,
        title: course.title,
      });

      res.status(201).json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/courses/:id/statistics
 * @desc Get course statistics
 */
router.get(
  '/:id/statistics',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const courseId = parseInt(req.params.id, 10);
      const stats = await CourseService.getStatistics(req.user!.tenantId, courseId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
