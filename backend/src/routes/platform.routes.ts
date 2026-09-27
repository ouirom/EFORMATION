import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { IS_PG } from '../database/db-helpers';
import { AuditService } from '../services/audit.service';
import { BadRequestError, ConflictError } from '../middleware/error.middleware';
import { CategoryService } from '../services/category.service';
import { slugify } from '../utils/slugify';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/platform/tenants
 * @desc super_admin only: list every organization on the platform, with basic counts
 */
router.get('/tenants', authenticate, authorize('super_admin'), async (req: AuthRequest, res, next) => {
  try {
    const tenants = await DatabaseService.query<any>(
      `SELECT t.id, t.name, t.slug, t.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) as user_count,
              (SELECT COUNT(*) FROM courses c WHERE c.tenant_id = t.id) as course_count
       FROM tenants t
       ORDER BY t.name`
    );

    res.json({
      success: true,
      data: tenants.map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.created_at,
        userCount: t.user_count,
        courseCount: t.course_count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/platform/tenants
 * @desc super_admin only: create a new organization
 */
router.post(
  '/tenants',
  authenticate,
  authorize('super_admin'),
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const name: string = req.body.name;
      const slug: string = req.body.slug ? slugify(req.body.slug) : slugify(name);

      const existing = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM tenants WHERE name = @name OR slug = @slug',
        { name, slug }
      );
      if (existing.length > 0) {
        throw ConflictError('A tenant with this name or slug already exists');
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO tenants (name, slug) VALUES (@name, @slug) RETURNING id`
          : `INSERT INTO tenants (name, slug) OUTPUT INSERTED.id VALUES (@name, @slug)`,
        { name, slug }
      );

      await CategoryService.seedDefaults(result[0].id);
      await AuditService.log(result[0].id, req.user!.id, 'TENANT_CREATED', 'tenants', result[0].id, { name, slug });

      res.status(201).json({
        success: true,
        data: { id: result[0].id, name, slug, userCount: 0, courseCount: 0 },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
