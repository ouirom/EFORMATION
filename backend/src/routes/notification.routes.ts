import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { NotificationService } from '../services/notification.service';

const router = Router();

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
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
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
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
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
 * @desc Send bulk notifications (admin only)
 */
router.post(
  '/bulk',
  authenticate,
  authorize('admin', 'director'),
  [
    body('userIds').isArray({ min: 1 }),
    body('channel').isIn(['email', 'sms', 'whatsapp', 'push', 'in_app']),
    body('subject').optional().trim(),
    body('body').notEmpty().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { userIds, channel, subject, body: notificationBody, actionUrl, metadata } = req.body;

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
 * @route PUT /api/v1/notifications/:id/read
 * @desc Mark notification as read
 */
router.put('/:id/read', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const notificationId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      `UPDATE notifications SET read_at = SYSUTCDATETIME() 
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
      `UPDATE notifications SET read_at = SYSUTCDATETIME() 
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
      // Return default preferences
      res.json({
        success: true,
        data: {
          email_enabled: true,
          sms_enabled: false,
          whatsapp_enabled: false,
          push_enabled: true,
          in_app_enabled: true,
          digest_frequency: 'immediate',
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
    const {
      email_enabled,
      sms_enabled,
      whatsapp_enabled,
      push_enabled,
      in_app_enabled,
      digest_frequency,
    } = req.body;

    // Check if preferences exist
    const existing = await DatabaseService.query<any>(
      'SELECT id FROM notification_preferences WHERE user_id = @userId',
      { userId: req.user!.id }
    );

    if (existing.length === 0) {
      // Create new preferences
      await DatabaseService.execute(
        `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, in_app_enabled, digest_frequency)
         VALUES (@userId, @email, @sms, @whatsapp, @push, @inApp, @digest)`,
        {
          userId: req.user!.id,
          email: email_enabled ?? true,
          sms: sms_enabled ?? false,
          whatsapp: whatsapp_enabled ?? false,
          push: push_enabled ?? true,
          inApp: in_app_enabled ?? true,
          digest: digest_frequency ?? 'immediate',
        }
      );
    } else {
      const updateFields: string[] = [];
      const params: Record<string, any> = { userId: req.user!.id };

      if (email_enabled !== undefined) {
        updateFields.push('email_enabled = @email');
        params.email = email_enabled;
      }
      if (sms_enabled !== undefined) {
        updateFields.push('sms_enabled = @sms');
        params.sms = sms_enabled;
      }
      if (whatsapp_enabled !== undefined) {
        updateFields.push('whatsapp_enabled = @whatsapp');
        params.whatsapp = whatsapp_enabled;
      }
      if (push_enabled !== undefined) {
        updateFields.push('push_enabled = @push');
        params.push = push_enabled;
      }
      if (in_app_enabled !== undefined) {
        updateFields.push('in_app_enabled = @inApp');
        params.inApp = in_app_enabled;
      }
      if (digest_frequency !== undefined) {
        updateFields.push('digest_frequency = @digest');
        params.digest = digest_frequency;
      }

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
          `UPDATE push_subscriptions SET p256dh = @p256dh, auth = @auth, updated_at = SYSUTCDATETIME() 
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
