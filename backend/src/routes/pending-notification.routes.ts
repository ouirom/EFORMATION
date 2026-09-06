import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { BadRequestError } from '../middleware/error.middleware';
import { PendingNotificationService } from '../services/pending-notification.service';

const router = Router();

/**
 * @route GET /api/v1/notifications/pending
 * @desc List queued notifications awaiting approval/rejection for the current
 * tenant (or, for a super_admin, across all tenants).
 */
router.get(
  '/',
  authenticate,
  [query('status').optional().isIn(['pending', 'approved', 'rejected'])],
  async (req: AuthRequest, res, next) => {
    try {
      const status = (req.query.status as string) || 'pending';
      const isSuperAdmin = req.user!.role === 'super_admin';
      const items = await PendingNotificationService.list(req.user!.tenantId, { status, isSuperAdmin });
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/notifications/pending/:id/approve
 * @desc Confirm a queued notification -- sends it now.
 */
router.put('/:id/approve', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw BadRequestError('Invalid id');
    }
    await PendingNotificationService.approve(id, {
      id: req.user!.id,
      tenantId: req.user!.tenantId,
      role: req.user!.role,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/notifications/pending/:id/reject
 * @desc Discard a queued notification -- it is never sent.
 */
router.put('/:id/reject', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw BadRequestError('Invalid id');
    }
    await PendingNotificationService.reject(id, {
      id: req.user!.id,
      tenantId: req.user!.tenantId,
      role: req.user!.role,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
