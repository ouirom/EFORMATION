import { Router } from 'express';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db } from '../database/db-helpers';
import { BadRequestError, NotFoundError, ApiError } from '../middleware/error.middleware';
import { NotificationService } from '../services/notification.service';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

const router = Router();

/** Admin-sent notifications are refused (not silently dropped) when the organization disabled notifications. */
const requireNotificationsEnabled = async (req: AuthRequest, _res: any, next: any) => {
  try {
    if (!(await TenantSettingsService.get(req.user!.tenantId)).enableNotifications) {
      throw new ApiError('Notifications are disabled for this organization', 403, 'FEATURE_DISABLED');
    }
    next();
  } catch (error) {
    next(error);
  }
};

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/notifications
 * @desc Get user's notifications
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 20, maxLimit: 50 });
    const unreadOnly = req.query.unreadOnly === 'true';

    let query = `SELECT * FROM notifications 
                 WHERE user_id = @userId AND tenant_id = @tenantId`;
    const params: Record<string, any> = { userId: req.user!.id, tenantId: req.user!.tenantId };

    if (unreadOnly) {
      query += ' AND read_at IS NULL';
    }

    const [countResult, notifications] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM notifications WHERE user_id = @userId AND tenant_id = @tenantId ${unreadOnly ? 'AND read_at IS NULL' : ''}`,
        params
      ),
      DatabaseService.query<any>(
        `${query} ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { ...params, offset, limit }
      ),
    ]);

    // Get unread count
    const unreadCount = await DatabaseService.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = @userId AND tenant_id = @tenantId AND read_at IS NULL',
      { userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    res.json({
      success: true,
      data: notifications,
      meta: {
        ...buildPaginationMeta(countResult[0].total, page, limit),
        unreadCount: unreadCount[0].count,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/notifications
 * @desc Create and send notification (admin only)
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director'),
  requireNotificationsEnabled,
  [
    body('userId').isInt(),
    body('channel').isIn(['email', 'sms', 'whatsapp', 'push', 'in_app']),
    body('subject').optional().trim(),
    body('body').notEmpty().trim(),
    body('actionUrl').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { userId, channel, subject, body: notificationBody, actionUrl, metadata } = req.body;

      // Get recipient info
      const users = await DatabaseService.query<any>(
        'SELECT * FROM users WHERE id = @userId AND tenant_id = @tenantId',
        { userId, tenantId: req.user!.tenantId }
      );

      if (users.length === 0) {
        throw NotFoundError('User');
      }

      const notification = await NotificationService.send({
        tenantId: req.user!.tenantId,
        userId,
        channel,
        subject,
        body: notificationBody,
        actionUrl,
        metadata,
      });

      res.status(201).json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/notifications/bulk
 * @desc Send bulk notifications (admin only) -- to an explicit list of user IDs, to every
 * user with a given role, or to the whole tenant if neither is provided.
 */
router.post(
  '/bulk',
  authenticate,
  authorize('admin', 'director'),
  requireNotificationsEnabled,
  [
    body('userIds').optional().isArray({ min: 1 }),
    body('role').optional().isIn(['super_admin', 'admin', 'director', 'manager', 'supervisor', 'agent', 'externe', 'stagiaire']),
    body('channel').isIn(['email', 'sms', 'whatsapp', 'push', 'in_app']),
    body('subject').optional().trim(),
    body('body').notEmpty().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { userIds: explicitUserIds, role, channel, subject, body: notificationBody, actionUrl, metadata } = req.body;

      let userIds: number[];
      if (explicitUserIds) {
        userIds = explicitUserIds;
      } else {
        const users = await DatabaseService.query<{ id: number }>(
          `SELECT id FROM users WHERE tenant_id = @tenantId AND deleted_at IS NULL ${role ? 'AND role = @role' : ''}`,
          { tenantId: req.user!.tenantId, role }
        );
        userIds = users.map((u) => u.id);
      }

      if (userIds.length === 0) {
        throw BadRequestError('No matching recipients');
      }

      const results = await Promise.allSettled(
        userIds.map((userId: number) =>
          NotificationService.send({
            tenantId: req.user!.tenantId,
            userId,
            channel,
            subject,
            body: notificationBody,
            actionUrl,
            metadata,
          })
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      res.json({
        success: true,
        data: {
          sent: successful,
          failed,
          total: userIds.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/notifications/all
 * @desc List all notifications sent within the tenant (admin only) -- unlike GET /,
 * which is scoped to the caller's own notifications.
 */
router.get('/all', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });

    const [countResult, notifications] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        'SELECT COUNT(*) as total FROM notifications WHERE tenant_id = @tenantId',
        { tenantId: req.user!.tenantId }
      ),
      DatabaseService.query<any>(
        `SELECT n.*, u.display_name as user_name
         FROM notifications n
         JOIN users u ON n.user_id = u.id
         WHERE n.tenant_id = @tenantId
         ORDER BY n.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { tenantId: req.user!.tenantId, offset, limit }
      ),
    ]);

    res.json({
      success: true,
      data: notifications,
      meta: buildPaginationMeta(countResult[0].total, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/notifications/:id/read
 * @desc Mark notification as read
 */
router.put('/:id/read', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      `UPDATE notifications SET read_at = ${db.now()}
       WHERE id = @notificationId AND user_id = @userId AND read_at IS NULL`,
      { notificationId, userId: req.user!.id }
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/notifications/read-all
 * @desc Mark all notifications as read
 */
router.put('/read-all', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await DatabaseService.execute(
      `UPDATE notifications SET read_at = ${db.now()}
       WHERE user_id = @userId AND tenant_id = @tenantId AND read_at IS NULL`,
      { userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/notifications/:id
 * @desc Delete notification
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      'DELETE FROM notifications WHERE id = @notificationId AND user_id = @userId',
      { notificationId, userId: req.user!.id }
    );

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== NOTIFICATION PREFERENCES ====================

/**
 * @route GET /api/v1/notifications/preferences
 * @desc Get user's notification preferences
 */
router.get('/preferences', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const preferences = await DatabaseService.query<any>(
      'SELECT * FROM notification_preferences WHERE user_id = @userId',
      { userId: req.user!.id }
    );

    if (preferences.length === 0) {
      // Return defaults matching notification_preferences' real columns (email, sms,
      // whatsapp, push_web, push_mobile -- there is no in_app_enabled/digest_frequency
      // column; in-app notifications can't be disabled, they're just a list the user
      // can ignore).
      res.json({
        success: true,
        data: {
          email: true,
          sms: false,
          whatsapp: false,
          push_web: true,
          push_mobile: true,
        },
      });
      return;
    }

    res.json({ success: true, data: preferences[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/notifications/preferences
 * @desc Update user's notification preferences
 */
router.put('/preferences', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // Body fields match notification_preferences' real columns (email, sms, whatsapp,
    // push_web, push_mobile) -- this used to read *_enabled fields and an in_app_enabled/
    // digest_frequency that don't exist as columns at all, so every save (insert or
    // update) 500'd with "column does not exist".
    const { email, sms, whatsapp, push_web, push_mobile } = req.body;

    // Check if preferences exist
    const existing = await DatabaseService.query<any>(
      'SELECT id FROM notification_preferences WHERE user_id = @userId',
      { userId: req.user!.id }
    );

    if (existing.length === 0) {
      // Create new preferences
      await DatabaseService.execute(
        `INSERT INTO notification_preferences (tenant_id, user_id, email, sms, whatsapp, push_web, push_mobile)
         VALUES (@tenantId, @userId, @email, @sms, @whatsapp, @pushWeb, @pushMobile)`,
        {
          tenantId: req.user!.tenantId,
          userId: req.user!.id,
          email: email ?? true,
          sms: sms ?? false,
          whatsapp: whatsapp ?? false,
          pushWeb: push_web ?? true,
          pushMobile: push_mobile ?? true,
        }
      );
    } else {
      const updateFields: string[] = [];
      const params: Record<string, any> = { userId: req.user!.id };

      if (email !== undefined) {
        updateFields.push('email = @email');
        params.email = email;
      }
      if (sms !== undefined) {
        updateFields.push('sms = @sms');
        params.sms = sms;
      }
      if (whatsapp !== undefined) {
        updateFields.push('whatsapp = @whatsapp');
        params.whatsapp = whatsapp;
      }
      if (push_web !== undefined) {
        updateFields.push('push_web = @pushWeb');
        params.pushWeb = push_web;
      }
      if (push_mobile !== undefined) {
        updateFields.push('push_mobile = @pushMobile');
        params.pushMobile = push_mobile;
      }
      updateFields.push(`updated_at = ${db.now()}`);

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE notification_preferences SET ${updateFields.join(', ')} WHERE user_id = @userId`,
          params
        );
      }
    }

    const preferences = await DatabaseService.query<any>(
      'SELECT * FROM notification_preferences WHERE user_id = @userId',
      { userId: req.user!.id }
    );

    res.json({ success: true, data: preferences[0] });
  } catch (error) {
    next(error);
  }
});

// ==================== PUSH SUBSCRIPTIONS ====================

/**
 * @route POST /api/v1/notifications/push/subscribe
 * @desc Register push notification subscription
 */
router.post(
  '/push/subscribe',
  authenticate,
  [
    body('endpoint').notEmpty(),
    body('keys.p256dh').notEmpty(),
    body('keys.auth').notEmpty(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { endpoint, keys } = req.body;

      // Check if subscription exists
      const existing = await DatabaseService.query<any>(
        'SELECT id FROM push_subscriptions WHERE user_id = @userId AND endpoint = @endpoint',
        { userId: req.user!.id, endpoint }
      );

      if (existing.length > 0) {
        // Update existing
        await DatabaseService.execute(
          `UPDATE push_subscriptions SET p256dh = @p256dh, auth = @auth, updated_at = ${db.now()}
           WHERE id = @id`,
          { id: existing[0].id, p256dh: keys.p256dh, auth: keys.auth }
        );
      } else {
        // Create new
        await DatabaseService.execute(
          `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
           VALUES (@tenantId, @userId, @endpoint, @p256dh, @auth)`,
          {
            tenantId: req.user!.tenantId,
            userId: req.user!.id,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
          }
        );
      }

      res.json({ success: true, message: 'Push subscription registered' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/notifications/push/unsubscribe
 * @desc Unregister push notification subscription
 */
router.delete('/push/unsubscribe', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { endpoint } = req.body;

    await DatabaseService.execute(
      'DELETE FROM push_subscriptions WHERE user_id = @userId AND endpoint = @endpoint',
      { userId: req.user!.id, endpoint }
    );

    res.json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
