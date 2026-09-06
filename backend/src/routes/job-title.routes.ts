import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { IS_PG } from '../database/db-helpers';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/job-titles
 * @desc List job-title labels for the tenant
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const jobTitles = await DatabaseService.query<any>(
      `SELECT id, label FROM job_titles WHERE tenant_id = @tenantId ORDER BY id`,
      { tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: jobTitles });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/job-titles
 * @desc Create a new job-title label
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director'),
  [body('label').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM job_titles WHERE tenant_id = @tenantId AND label = @label',
        { tenantId, label: req.body.label }
      );
      if (existing.length > 0) {
        throw BadRequestError('This label already exists');
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO job_titles (tenant_id, label) VALUES (@tenantId, @label) RETURNING id`
          : `INSERT INTO job_titles (tenant_id, label) OUTPUT INSERTED.id VALUES (@tenantId, @label)`,
        { tenantId, label: req.body.label }
      );

      res.status(201).json({
        success: true,
        data: { id: result[0].id, label: req.body.label },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/job-titles/:id
 * @desc Rename a job-title label
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director'),
  [body('label').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const jobTitleId = parseInt(req.params.id, 10);
      const tenantId = req.user!.tenantId;

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM job_titles WHERE id = @id AND tenant_id = @tenantId',
        { id: jobTitleId, tenantId }
      );
      if (existing.length === 0) throw NotFoundError('Job title');

      const duplicate = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM job_titles WHERE tenant_id = @tenantId AND label = @label AND id != @id',
        { tenantId, label: req.body.label, id: jobTitleId }
      );
      if (duplicate.length > 0) {
        throw BadRequestError('This label already exists');
      }

      await DatabaseService.execute(
        `UPDATE job_titles SET label = @label WHERE id = @id AND tenant_id = @tenantId`,
        { id: jobTitleId, tenantId, label: req.body.label }
      );

      res.json({
        success: true,
        data: { id: jobTitleId, label: req.body.label },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/job-titles/:id
 * @desc Delete a job-title label. Users already carrying this label as free
 *       text keep it -- only removes it from the picker's future options.
 */
router.delete('/:id', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const jobTitleId = parseInt(req.params.id, 10);
    const tenantId = req.user!.tenantId;

    const existing = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM job_titles WHERE id = @id AND tenant_id = @tenantId',
      { id: jobTitleId, tenantId }
    );
    if (existing.length === 0) throw NotFoundError('Job title');

    await DatabaseService.execute(
      `DELETE FROM job_titles WHERE id = @id AND tenant_id = @tenantId`,
      { id: jobTitleId, tenantId }
    );

    res.json({ success: true, message: 'Job title deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
