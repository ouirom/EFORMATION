import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { WebhookReceiver } from 'livekit-server-sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { db, IS_PG } from '../database/db-helpers';
import { config } from '../config';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// Event types supported
const WEBHOOK_EVENTS = [
  'user.created',
  'user.updated',
  'user.deleted',
  'course.created',
  'course.published',
  'course.updated',
  'enrollment.created',
  'enrollment.completed',
  'quiz.completed',
  'badge.awarded',
  'certificate.issued',
  'live_session.started',
  'live_session.ended',
];

/**
 * @route GET /api/v1/webhooks
 * @desc List webhook subscriptions
 */
router.get('/', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhooks = await DatabaseService.query<any>(
      `SELECT id, name, url, events, is_active, created_at, last_triggered_at, 
              (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = webhooks.id) as delivery_count
       FROM webhooks
       WHERE tenant_id = @tenantId
       ORDER BY created_at DESC`,
      { tenantId: req.user!.tenantId }
    );

    // Parse events JSON
    const webhooksWithParsedEvents = webhooks.map((w: any) => ({
      ...w,
      events: db.parseJsonColumn(w.events) || [],
    }));

    res.json({ success: true, data: webhooksWithParsedEvents });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/webhooks/events
 * @desc List available webhook events
 */
router.get('/events', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    res.json({ success: true, data: WEBHOOK_EVENTS });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/webhooks/:id
 * @desc Get webhook details
 */
router.get('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);

    const webhooks = await DatabaseService.query<any>(
      'SELECT * FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId',
      { webhookId, tenantId: req.user!.tenantId }
    );

    if (webhooks.length === 0) {
      throw NotFoundError('Webhook');
    }

    const webhook = {
      ...webhooks[0],
      events: db.parseJsonColumn(webhooks[0].events) || [],
    };

    // Get recent deliveries
    const deliveries = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT * FROM webhook_deliveries
           WHERE webhook_id = @webhookId
           ORDER BY created_at DESC
           LIMIT 10`
        : `SELECT TOP 10 * FROM webhook_deliveries
           WHERE webhook_id = @webhookId
           ORDER BY created_at DESC`,
      { webhookId }
    );

    res.json({
      success: true,
      data: {
        ...webhook,
        recentDeliveries: deliveries,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/webhooks
 * @desc Create a new webhook subscription
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  [
    body('name').notEmpty().trim(),
    body('url').isURL(),
    body('events').isArray({ min: 1 }),
    body('events.*').isIn(WEBHOOK_EVENTS),
    body('secret').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { name, url, events, secret, headers } = req.body;

      // Generate secret if not provided
      const webhookSecret = secret || crypto.randomBytes(32).toString('hex');

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO webhooks (tenant_id, name, url, events, secret, headers, created_by)
             VALUES (@tenantId, @name, @url, @events, @secret, @headers, @createdBy)
             RETURNING id`
          : `INSERT INTO webhooks (tenant_id, name, url, events, secret, headers, created_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @name, @url, @events, @secret, @headers, @createdBy)`,
        {
          tenantId: req.user!.tenantId,
          name,
          url,
          events: JSON.stringify(events),
          secret: webhookSecret,
          headers: headers ? JSON.stringify(headers) : null,
          createdBy: req.user!.id,
        }
      );

      const webhook = await DatabaseService.query<any>(
        'SELECT * FROM webhooks WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({
        success: true,
        data: {
          ...webhook[0],
          events: db.parseJsonColumn(webhook[0].events),
          secret: webhookSecret, // Only return secret on creation
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/webhooks/:id
 * @desc Update a webhook subscription
 */
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);
    const { name, url, events, is_active, headers } = req.body;

    const updateFields: string[] = [];
    const params: Record<string, any> = { webhookId, tenantId: req.user!.tenantId };

    if (name) {
      updateFields.push('name = @name');
      params.name = name;
    }
    if (url) {
      updateFields.push('url = @url');
      params.url = url;
    }
    if (events) {
      updateFields.push('events = @events');
      params.events = JSON.stringify(events);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = @isActive');
      params.isActive = is_active;
    }
    if (headers !== undefined) {
      updateFields.push('headers = @headers');
      params.headers = headers ? JSON.stringify(headers) : null;
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = ${db.now()}`);
      await DatabaseService.execute(
        `UPDATE webhooks SET ${updateFields.join(', ')} WHERE id = @webhookId AND tenant_id = @tenantId`,
        params
      );
    }

    const webhook = await DatabaseService.query<any>(
      'SELECT * FROM webhooks WHERE id = @webhookId',
      { webhookId }
    );

    res.json({
      success: true,
      data: {
        ...webhook[0],
        events: db.parseJsonColumn(webhook[0].events) || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/webhooks/:id
 * @desc Delete a webhook subscription
 */
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      'DELETE FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId',
      { webhookId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/webhooks/:id/test
 * @desc Send a test webhook
 */
router.post('/:id/test', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);

    const webhooks = await DatabaseService.query<any>(
      'SELECT * FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId',
      { webhookId, tenantId: req.user!.tenantId }
    );

    if (webhooks.length === 0) {
      throw NotFoundError('Webhook');
    }

    const webhook = webhooks[0];
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        webhook_id: webhookId,
      },
    };

    const result = await deliverWebhook(webhook, testPayload);

    res.json({
      success: true,
      data: {
        delivered: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/webhooks/:id/regenerate-secret
 * @desc Regenerate webhook secret
 */
router.post('/:id/regenerate-secret', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);
    const newSecret = crypto.randomBytes(32).toString('hex');

    await DatabaseService.execute(
      `UPDATE webhooks SET secret = @secret, updated_at = ${db.now()} WHERE id = @webhookId AND tenant_id = @tenantId`,
      { webhookId, tenantId: req.user!.tenantId, secret: newSecret }
    );

    res.json({ success: true, data: { secret: newSecret } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/webhooks/:id/deliveries
 * @desc Get webhook delivery history
 */
router.get('/:id/deliveries', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });

    const [countResult, deliveries] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        'SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = @webhookId',
        { webhookId }
      ),
      DatabaseService.query<any>(
        `SELECT * FROM webhook_deliveries 
         WHERE webhook_id = @webhookId 
         ORDER BY created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { webhookId, offset, limit }
      ),
    ]);

    res.json({
      success: true,
      data: deliveries,
      meta: buildPaginationMeta(countResult[0].total, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/webhooks/:id/deliveries/:deliveryId/retry
 * @desc Retry a failed webhook delivery
 */
router.post('/:id/deliveries/:deliveryId/retry', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const webhookId = parseInt(req.params.id, 10);
    const deliveryId = parseInt(req.params.deliveryId, 10);

    const [webhooks, deliveries] = await Promise.all([
      DatabaseService.query<any>(
        'SELECT * FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId',
        { webhookId, tenantId: req.user!.tenantId }
      ),
      DatabaseService.query<any>(
        'SELECT * FROM webhook_deliveries WHERE id = @deliveryId AND webhook_id = @webhookId',
        { deliveryId, webhookId }
      ),
    ]);

    if (webhooks.length === 0 || deliveries.length === 0) {
      throw NotFoundError('Webhook or delivery');
    }

    const webhook = webhooks[0];
    const delivery = deliveries[0];
    const payload = db.parseJsonColumn(delivery.payload);

    const result = await deliverWebhook(webhook, payload);

    res.json({
      success: true,
      data: {
        delivered: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/webhooks/livekit
 * @desc Inbound webhook from LiveKit (Egress lifecycle events). Not authenticated
 *       via our JWT middleware -- LiveKit signs the payload itself and we verify
 *       that signature instead. Only egress_ended is acted on; other event types
 *       are accepted and ignored.
 *
 *       Limitation: signature verification uses the single global LIVEKIT_API_KEY/
 *       SECRET (env), not a per-tenant livekit_settings override. A tenant running
 *       its own LiveKit project (different keys) would need its own webhook
 *       endpoint/project-level config -- not needed for this deployment today,
 *       where every tenant shares the one LiveKit Cloud project.
 */
router.post('/livekit', async (req: any, res, next) => {
  try {
    if (!config.livekit.apiKey || !config.livekit.apiSecret) {
      // Not configured -- nothing meaningful to verify against; ack so LiveKit stops retrying.
      res.status(200).json({ success: true });
      return;
    }

    const receiver = new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret);
    const event = await receiver.receive(req.rawBody || JSON.stringify(req.body), req.headers.authorization);

    if (event.event === 'egress_ended' && event.egressInfo) {
      const egressId = event.egressInfo.egressId;
      const failed = event.egressInfo.error && event.egressInfo.error.length > 0;
      const recordingUrl = event.egressInfo.fileResults?.[0]?.location || null;

      await DatabaseService.execute(
        `UPDATE live_recordings SET
           status = @status, ended_at = ${db.now()}, recording_url = @recordingUrl
         WHERE egress_id = @egressId`,
        { egressId, status: failed ? 'failed' : 'completed', recordingUrl }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('LiveKit webhook processing failed', { error });
    // Still 200 -- a malformed/unverifiable payload isn't something LiveKit can fix by retrying.
    res.status(200).json({ success: false });
  }
});

// Helper function to deliver webhook
async function deliverWebhook(
  webhook: any,
  payload: any
): Promise<{ success: boolean; statusCode?: number; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(payload);

  // Create signature
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(payloadString)
    .digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': `sha256=${signature}`,
    'X-Webhook-Id': webhook.id.toString(),
    'X-Webhook-Timestamp': new Date().toISOString(),
    ...(webhook.headers ? db.parseJsonColumn(webhook.headers) : {}),
  };

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const responseTime = Date.now() - startTime;
    const responseBody = await response.text().catch(() => '');

    // Log delivery
    await DatabaseService.execute(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, response_time_ms, success)
       VALUES (@webhookId, @event, @payload, @status, @responseBody, @responseTime, @success)`,
      {
        webhookId: webhook.id,
        event: payload.event,
        payload: payloadString,
        status: response.status,
        responseBody: responseBody.substring(0, 1000),
        responseTime,
        success: response.ok,
      }
    );

    // Update last triggered
    await DatabaseService.execute(
      `UPDATE webhooks SET last_triggered_at = ${db.now()} WHERE id = @id`,
      { id: webhook.id }
    );

    return {
      success: response.ok,
      statusCode: response.status,
      responseTime,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    await DatabaseService.execute(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, response_time_ms, success, error_message)
       VALUES (@webhookId, @event, @payload, @responseTime, ${db.bool(false)}, @error)`,
      {
        webhookId: webhook.id,
        event: payload.event,
        payload: payloadString,
        responseTime,
        error: error.message,
      }
    );

    return {
      success: false,
      responseTime,
      error: error.message,
    };
  }
}

// Export for use in other services
export async function triggerWebhook(tenantId: number, event: string, data: any): Promise<void> {
  try {
    const webhooks = await DatabaseService.query<any>(
      `SELECT * FROM webhooks WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)}`,
      { tenantId }
    );

    const matchingWebhooks = webhooks.filter((w: any) => {
      const events = db.parseJsonColumn(w.events) || [];
      return events.includes(event) || events.includes('*');
    });

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    await Promise.allSettled(
      matchingWebhooks.map((webhook: any) => deliverWebhook(webhook, payload))
    );
  } catch (error) {
    logger.error('Failed to trigger webhooks', { tenantId, event, error });
  }
}

export default router;
