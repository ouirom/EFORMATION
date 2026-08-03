import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { ContentService } from '../services/course.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError } from '../middleware/error.middleware';
import { DatabaseService } from '../services/database.service';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/contents?lessonId=X
 * @desc Get contents for a lesson
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const lessonId = req.query.lessonId as string;
    if (!lessonId) {
      throw BadRequestError('lessonId is required');
    }

    const contents = await DatabaseService.query<any>(
      `SELECT c.*, f.filename, f.mime_type, f.storage_key, f.size_bytes
       FROM contents c
       LEFT JOIN file_assets f ON c.file_id = f.id
       WHERE c.lesson_id = @lessonId AND c.tenant_id = @tenantId 
       ORDER BY c.position`,
      { lessonId: parseInt(lessonId, 10), tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: contents });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/contents/:id
 * @desc Get content by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const contentId = parseInt(req.params.id, 10);

    const contents = await DatabaseService.query<any>(
      `SELECT c.*, f.filename, f.mime_type, f.storage_key, f.size_bytes
       FROM contents c
       LEFT JOIN file_assets f ON c.file_id = f.id
       WHERE c.id = @contentId AND c.tenant_id = @tenantId`,
      { contentId, tenantId: req.user!.tenantId }
    );

    if (contents.length === 0) {
      throw BadRequestError('Content not found');
    }

    res.json({ success: true, data: contents[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/contents
 * @desc Create new content
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('lessonId').isInt(),
    body('type').isIn(['pdf', 'docx', 'image', 'video_mp4', 'youtube_link', 'text']),
    body('title').notEmpty().trim(),
    body('body').optional(),
    body('fileId').optional().isInt(),
    body('url').optional().trim(),
    body('position').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      let position = req.body.position;
      if (position === undefined) {
        const maxPos = await DatabaseService.query<{ max_pos: number }>(
          'SELECT COALESCE(MAX(position), 0) as max_pos FROM contents WHERE lesson_id = @lessonId',
          { lessonId: req.body.lessonId }
        );
        position = maxPos[0].max_pos + 1;
      }

      const content = await ContentService.create({
        tenantId: req.user!.tenantId,
        lessonId: req.body.lessonId,
        type: req.body.type,
        title: req.body.title,
        body: req.body.body,
        fileId: req.body.fileId,
        url: req.body.url,
        position,
      });

      res.status(201).json({ success: true, data: content });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/contents/:id
 * @desc Update content
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').optional().trim(),
    body('body').optional(),
    body('fileId').optional().isInt(),
    body('url').optional().trim(),
    body('position').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const contentId = parseInt(req.params.id, 10);

      const content = await ContentService.update(
        req.user!.tenantId,
        contentId,
        {
          title: req.body.title,
          body: req.body.body,
          fileId: req.body.fileId,
          url: req.body.url,
          position: req.body.position,
        }
      );

      res.json({ success: true, data: content });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/contents/:id
 * @desc Delete content
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const contentId = parseInt(req.params.id, 10);
      await ContentService.delete(req.user!.tenantId, contentId);
      res.json({ success: true, message: 'Content deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
