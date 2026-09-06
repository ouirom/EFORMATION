import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { DatabaseService } from '../services/database.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/favorites
 * @desc List the current user's favorited courses and lessons, merged and
 * sorted by most recently favorited first.
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    const courseFavorites = await DatabaseService.query<any>(
      `SELECT f.id, f.favoritable_id as item_id, f.created_at, c.public_id, c.title
       FROM favorites f
       JOIN courses c ON c.id = f.favoritable_id
       WHERE f.user_id = @userId AND f.tenant_id = @tenantId
         AND f.favoritable_type = 'course' AND c.deleted_at IS NULL`,
      { userId, tenantId }
    );

    const lessonFavorites = await DatabaseService.query<any>(
      `SELECT f.id, f.favoritable_id as item_id, f.created_at,
              l.public_id, l.title, l.type, l.duration_min, l.is_mandatory,
              m.id as module_id, m.title as module_title,
              m.course_id, c.public_id as course_public_id, c.title as course_title
       FROM favorites f
       JOIN lessons l ON l.id = f.favoritable_id
       JOIN modules m ON m.id = l.module_id
       JOIN courses c ON c.id = m.course_id
       WHERE f.user_id = @userId AND f.tenant_id = @tenantId
         AND f.favoritable_type = 'lesson' AND l.deleted_at IS NULL`,
      { userId, tenantId }
    );

    const favorites = [
      ...courseFavorites.map((row: any) => ({
        id: row.id,
        type: 'course' as const,
        itemId: row.item_id,
        publicId: row.public_id,
        title: row.title,
        createdAt: row.created_at,
      })),
      ...lessonFavorites.map((row: any) => ({
        id: row.id,
        type: 'lesson' as const,
        itemId: row.item_id,
        publicId: row.public_id,
        title: row.title,
        lessonType: row.type,
        durationMin: row.duration_min,
        isMandatory: row.is_mandatory,
        moduleId: row.module_id,
        moduleTitle: row.module_title,
        courseId: row.course_id,
        coursePublicId: row.course_public_id,
        courseTitle: row.course_title,
        createdAt: row.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, data: favorites });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/favorites
 * @desc Favorite a course or a lesson. Idempotent -- favoriting an
 * already-favorited item is a no-op, not an error (toggle-button friendly).
 */
router.post(
  '/',
  authenticate,
  [
    body('type').isIn(['course', 'lesson']),
    body('id').isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { type, id } = req.body;
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;

      const targetTable = type === 'course' ? 'courses' : 'lessons';
      const target = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM ${targetTable} WHERE id = @id AND tenant_id = @tenantId AND deleted_at IS NULL`,
        { id, tenantId }
      );
      if (target.length === 0) {
        throw NotFoundError(type === 'course' ? 'Course' : 'Lesson');
      }

      const existing = await DatabaseService.query<{ id: number }>(
        `SELECT id FROM favorites
         WHERE user_id = @userId AND tenant_id = @tenantId AND favoritable_type = @type AND favoritable_id = @id`,
        { userId, tenantId, type, id }
      );

      if (existing.length === 0) {
        await DatabaseService.execute(
          `INSERT INTO favorites (tenant_id, user_id, favoritable_type, favoritable_id)
           VALUES (@tenantId, @userId, @type, @id)`,
          { tenantId, userId, type, id }
        );
      }

      res.status(201).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/favorites/:type/:id
 * @desc Remove a favorite. Idempotent -- removing one that isn't favorited
 * is not an error.
 */
router.delete(
  '/:type/:id',
  authenticate,
  [
    param('type').isIn(['course', 'lesson']),
    param('id').isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { type } = req.params;
      const id = parseInt(req.params.id, 10);

      await DatabaseService.execute(
        `DELETE FROM favorites
         WHERE user_id = @userId AND tenant_id = @tenantId AND favoritable_type = @type AND favoritable_id = @id`,
        { userId: req.user!.id, tenantId: req.user!.tenantId, type, id }
      );

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
