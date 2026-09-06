import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { ModuleService } from '../services/course.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError } from '../middleware/error.middleware';
import { DatabaseService } from '../services/database.service';
import { resolveEntityId } from '../utils/resolvePublicId';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/modules?courseId=X
 * @desc Get modules for a course
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const rawCourseId = req.query.courseId as string;
    if (!rawCourseId) {
      throw BadRequestError('courseId is required');
    }
    const courseId = await resolveEntityId('courses', rawCourseId, req.user!.tenantId);

    const modules = await DatabaseService.query<any>(
      `SELECT m.*,
              (SELECT COUNT(*) FROM lessons WHERE module_id = m.id AND deleted_at IS NULL) as lesson_count
       FROM modules m
       WHERE m.course_id = @courseId AND m.tenant_id = @tenantId
       ORDER BY m.position`,
      { courseId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: modules });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/modules
 * @desc Create a new module
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('courseId').isInt(),
    body('title').notEmpty().trim(),
    body('position').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      // Get next position if not provided
      let position = req.body.position;
      if (position === undefined) {
        const maxPos = await DatabaseService.query<{ max_pos: number }>(
          'SELECT COALESCE(MAX(position), 0) as max_pos FROM modules WHERE course_id = @courseId',
          { courseId: req.body.courseId }
        );
        position = maxPos[0].max_pos + 1;
      }

      const module = await ModuleService.create({
        tenantId: req.user!.tenantId,
        courseId: req.body.courseId,
        title: req.body.title,
        position,
      });

      res.status(201).json({ success: true, data: module });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/modules/:id
 * @desc Update module
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').optional().trim(),
    body('position').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const moduleId = parseInt(req.params.id, 10);

      const module = await ModuleService.update(
        req.user!.tenantId,
        moduleId,
        {
          title: req.body.title,
          position: req.body.position,
        }
      );

      res.json({ success: true, data: module });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/modules/:id
 * @desc Delete module
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const moduleId = parseInt(req.params.id, 10);
      await ModuleService.delete(req.user!.tenantId, moduleId);
      res.json({ success: true, message: 'Module deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/modules/reorder
 * @desc Reorder modules in a course
 */
router.post(
  '/reorder',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('courseId').isInt(),
    body('moduleIds').isArray(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      await ModuleService.reorder(
        req.user!.tenantId,
        req.body.courseId,
        req.body.moduleIds
      );

      res.json({ success: true, message: 'Modules reordered successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
