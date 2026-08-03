"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerWebhook = triggerWebhook;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const crypto_1 = __importDefault(require("crypto"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
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
router.get('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhooks = await database_service_1.DatabaseService.query(`SELECT id, name, url, events, is_active, created_at, last_triggered_at, 
              (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = webhooks.id) as delivery_count
       FROM webhooks
       WHERE tenant_id = @tenantId
       ORDER BY created_at DESC`, { tenantId: req.user.tenantId });
        // Parse events JSON
        const webhooksWithParsedEvents = webhooks.map((w) => ({
            ...w,
            events: JSON.parse(w.events || '[]'),
        }));
        res.json({ success: true, data: webhooksWithParsedEvents });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/webhooks/events
 * @desc List available webhook events
 */
router.get('/events', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        res.json({ success: true, data: WEBHOOK_EVENTS });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/webhooks/:id
 * @desc Get webhook details
 */
router.get('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        const webhooks = await database_service_1.DatabaseService.query('SELECT * FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId', { webhookId, tenantId: req.user.tenantId });
        if (webhooks.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Webhook');
        }
        const webhook = {
            ...webhooks[0],
            events: JSON.parse(webhooks[0].events || '[]'),
        };
        // Get recent deliveries
        const deliveries = await database_service_1.DatabaseService.query(`SELECT TOP 10 * FROM webhook_deliveries 
       WHERE webhook_id = @webhookId 
       ORDER BY created_at DESC`, { webhookId });
        res.json({
            success: true,
            data: {
                ...webhook,
                recentDeliveries: deliveries,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/webhooks
 * @desc Create a new webhook subscription
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [
    (0, express_validator_1.body)('name').notEmpty().trim(),
    (0, express_validator_1.body)('url').isURL(),
    (0, express_validator_1.body)('events').isArray({ min: 1 }),
    (0, express_validator_1.body)('events.*').isIn(WEBHOOK_EVENTS),
    (0, express_validator_1.body)('secret').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const { name, url, events, secret, headers } = req.body;
        // Generate secret if not provided
        const webhookSecret = secret || crypto_1.default.randomBytes(32).toString('hex');
        const result = await database_service_1.DatabaseService.query(`INSERT INTO webhooks (tenant_id, name, url, events, secret, headers, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @name, @url, @events, @secret, @headers, @createdBy)`, {
            tenantId: req.user.tenantId,
            name,
            url,
            events: JSON.stringify(events),
            secret: webhookSecret,
            headers: headers ? JSON.stringify(headers) : null,
            createdBy: req.user.id,
        });
        const webhook = await database_service_1.DatabaseService.query('SELECT * FROM webhooks WHERE id = @id', { id: result[0].id });
        res.status(201).json({
            success: true,
            data: {
                ...webhook[0],
                events: JSON.parse(webhook[0].events),
                secret: webhookSecret, // Only return secret on creation
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/webhooks/:id
 * @desc Update a webhook subscription
 */
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        const { name, url, events, is_active, headers } = req.body;
        const updateFields = [];
        const params = { webhookId, tenantId: req.user.tenantId };
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
            updateFields.push('updated_at = SYSUTCDATETIME()');
            await database_service_1.DatabaseService.execute(`UPDATE webhooks SET ${updateFields.join(', ')} WHERE id = @webhookId AND tenant_id = @tenantId`, params);
        }
        const webhook = await database_service_1.DatabaseService.query('SELECT * FROM webhooks WHERE id = @webhookId', { webhookId });
        res.json({
            success: true,
            data: {
                ...webhook[0],
                events: JSON.parse(webhook[0].events || '[]'),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/webhooks/:id
 * @desc Delete a webhook subscription
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId', { webhookId, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Webhook deleted' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/webhooks/:id/test
 * @desc Send a test webhook
 */
router.post('/:id/test', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        const webhooks = await database_service_1.DatabaseService.query('SELECT * FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId', { webhookId, tenantId: req.user.tenantId });
        if (webhooks.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Webhook');
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
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/webhooks/:id/regenerate-secret
 * @desc Regenerate webhook secret
 */
router.post('/:id/regenerate-secret', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        const newSecret = crypto_1.default.randomBytes(32).toString('hex');
        await database_service_1.DatabaseService.execute('UPDATE webhooks SET secret = @secret, updated_at = SYSUTCDATETIME() WHERE id = @webhookId AND tenant_id = @tenantId', { webhookId, tenantId: req.user.tenantId, secret: newSecret });
        res.json({ success: true, data: { secret: newSecret } });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/webhooks/:id/deliveries
 * @desc Get webhook delivery history
 */
router.get('/:id/deliveries', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const [countResult, deliveries] = await Promise.all([
            database_service_1.DatabaseService.query('SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = @webhookId', { webhookId }),
            database_service_1.DatabaseService.query(`SELECT * FROM webhook_deliveries 
         WHERE webhook_id = @webhookId 
         ORDER BY created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, { webhookId, offset, limit }),
        ]);
        res.json({
            success: true,
            data: deliveries,
            meta: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/webhooks/:id/deliveries/:deliveryId/retry
 * @desc Retry a failed webhook delivery
 */
router.post('/:id/deliveries/:deliveryId/retry', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const webhookId = parseInt(req.params.id, 10);
        const deliveryId = parseInt(req.params.deliveryId, 10);
        const [webhooks, deliveries] = await Promise.all([
            database_service_1.DatabaseService.query('SELECT * FROM webhooks WHERE id = @webhookId AND tenant_id = @tenantId', { webhookId, tenantId: req.user.tenantId }),
            database_service_1.DatabaseService.query('SELECT * FROM webhook_deliveries WHERE id = @deliveryId AND webhook_id = @webhookId', { deliveryId, webhookId }),
        ]);
        if (webhooks.length === 0 || deliveries.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Webhook or delivery');
        }
        const webhook = webhooks[0];
        const delivery = deliveries[0];
        const payload = JSON.parse(delivery.payload);
        const result = await deliverWebhook(webhook, payload);
        res.json({
            success: true,
            data: {
                delivered: result.success,
                statusCode: result.statusCode,
                responseTime: result.responseTime,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Helper function to deliver webhook
async function deliverWebhook(webhook, payload) {
    const startTime = Date.now();
    const payloadString = JSON.stringify(payload);
    // Create signature
    const signature = crypto_1.default
        .createHmac('sha256', webhook.secret)
        .update(payloadString)
        .digest('hex');
    const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Id': webhook.id.toString(),
        'X-Webhook-Timestamp': new Date().toISOString(),
        ...(webhook.headers ? JSON.parse(webhook.headers) : {}),
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
        await database_service_1.DatabaseService.execute(`INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, response_time_ms, success)
       VALUES (@webhookId, @event, @payload, @status, @responseBody, @responseTime, @success)`, {
            webhookId: webhook.id,
            event: payload.event,
            payload: payloadString,
            status: response.status,
            responseBody: responseBody.substring(0, 1000),
            responseTime,
            success: response.ok,
        });
        // Update last triggered
        await database_service_1.DatabaseService.execute('UPDATE webhooks SET last_triggered_at = SYSUTCDATETIME() WHERE id = @id', { id: webhook.id });
        return {
            success: response.ok,
            statusCode: response.status,
            responseTime,
        };
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        await database_service_1.DatabaseService.execute(`INSERT INTO webhook_deliveries (webhook_id, event, payload, response_time_ms, success, error_message)
       VALUES (@webhookId, @event, @payload, @responseTime, 0, @error)`, {
            webhookId: webhook.id,
            event: payload.event,
            payload: payloadString,
            responseTime,
            error: error.message,
        });
        return {
            success: false,
            responseTime,
            error: error.message,
        };
    }
}
// Export for use in other services
async function triggerWebhook(tenantId, event, data) {
    try {
        const webhooks = await database_service_1.DatabaseService.query(`SELECT * FROM webhooks WHERE tenant_id = @tenantId AND is_active = 1`, { tenantId });
        const matchingWebhooks = webhooks.filter((w) => {
            const events = JSON.parse(w.events || '[]');
            return events.includes(event) || events.includes('*');
        });
        const payload = {
            event,
            timestamp: new Date().toISOString(),
            data,
        };
        await Promise.allSettled(matchingWebhooks.map((webhook) => deliverWebhook(webhook, payload)));
    }
    catch (error) {
        logger_1.logger.error('Failed to trigger webhooks', { tenantId, event, error });
    }
}
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map