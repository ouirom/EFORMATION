"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// ==================== LIVE SESSIONS ====================
/**
 * @route GET /api/v1/live-sessions
 * @desc List live sessions
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const status = req.query.status;
        const courseId = req.query.courseId;
        let query = `SELECT ls.*, u.display_name as organizer_name, c.title as course_title,
                        (SELECT COUNT(*) FROM live_participants WHERE session_id = ls.id) as participant_count
                 FROM live_sessions ls
                 LEFT JOIN users u ON ls.organizer_id = u.id
                 LEFT JOIN courses c ON ls.course_id = c.id
                 WHERE ls.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        if (status) {
            query += ' AND ls.status = @status';
            params.status = status;
        }
        if (courseId) {
            query += ' AND ls.course_id = @courseId';
            params.courseId = parseInt(courseId, 10);
        }
        query += ' ORDER BY ls.scheduled_at DESC';
        const sessions = await database_service_1.DatabaseService.query(query, params);
        res.json({ success: true, data: sessions });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/live-sessions/:id
 * @desc Get live session details
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const sessions = await database_service_1.DatabaseService.query(`SELECT ls.*, u.display_name as organizer_name, c.title as course_title
       FROM live_sessions ls
       LEFT JOIN users u ON ls.organizer_id = u.id
       LEFT JOIN courses c ON ls.course_id = c.id
       WHERE ls.id = @sessionId AND ls.tenant_id = @tenantId`, { sessionId, tenantId: req.user.tenantId });
        if (sessions.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Live session');
        }
        // Get participants
        const participants = await database_service_1.DatabaseService.query(`SELECT lp.*, u.display_name, u.email
       FROM live_participants lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.session_id = @sessionId`, { sessionId });
        // Get breakout rooms
        const breakoutRooms = await database_service_1.DatabaseService.query('SELECT * FROM breakout_rooms WHERE session_id = @sessionId', { sessionId });
        // Get recordings
        const recordings = await database_service_1.DatabaseService.query(`SELECT lr.*, f.filename, f.storage_key
       FROM live_recordings lr
       LEFT JOIN file_assets f ON lr.file_id = f.id
       WHERE lr.session_id = @sessionId`, { sessionId });
        res.json({
            success: true,
            data: {
                ...sessions[0],
                participants,
                breakoutRooms,
                recordings,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/live-sessions
 * @desc Create a new live session
 */
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('title').notEmpty().trim(),
    (0, express_validator_1.body)('courseId').optional().isInt(),
    (0, express_validator_1.body)('moduleId').optional().isInt(),
    (0, express_validator_1.body)('scheduledAt').optional().isISO8601(),
    (0, express_validator_1.body)('meetingProvider').optional().isIn(['webrtc', 'zoom', 'teams', 'meet']),
    (0, express_validator_1.body)('meetingLink').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO live_sessions (tenant_id, title, course_id, module_id, status, scheduled_at, organizer_id, meeting_provider, meeting_link)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @title, @courseId, @moduleId, 'scheduled', @scheduledAt, @organizerId, @meetingProvider, @meetingLink)`, {
            tenantId: req.user.tenantId,
            title: req.body.title,
            courseId: req.body.courseId || null,
            moduleId: req.body.moduleId || null,
            scheduledAt: req.body.scheduledAt || null,
            organizerId: req.user.id,
            meetingProvider: req.body.meetingProvider || 'webrtc',
            meetingLink: req.body.meetingLink || null,
        });
        // Add organizer as host
        await database_service_1.DatabaseService.execute(`INSERT INTO live_participants (session_id, user_id, role)
         VALUES (@sessionId, @userId, 'host')`, { sessionId: result[0].id, userId: req.user.id });
        const session = await database_service_1.DatabaseService.query('SELECT * FROM live_sessions WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: session[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/live-sessions/:id
 * @desc Update live session
 */
router.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { sessionId, tenantId: req.user.tenantId };
        if (req.body.title) {
            updateFields.push('title = @title');
            params.title = req.body.title;
        }
        if (req.body.scheduledAt) {
            updateFields.push('scheduled_at = @scheduledAt');
            params.scheduledAt = req.body.scheduledAt;
        }
        if (req.body.meetingLink) {
            updateFields.push('meeting_link = @meetingLink');
            params.meetingLink = req.body.meetingLink;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE live_sessions SET ${updateFields.join(', ')} WHERE id = @sessionId AND tenant_id = @tenantId`, params);
        }
        const session = await database_service_1.DatabaseService.query('SELECT * FROM live_sessions WHERE id = @sessionId', { sessionId });
        res.json({ success: true, data: session[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/live-sessions/:id/start
 * @desc Start a live session
 */
router.post('/:id/start', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        // Verify organizer
        const sessions = await database_service_1.DatabaseService.query('SELECT * FROM live_sessions WHERE id = @sessionId AND organizer_id = @organizerId', { sessionId, organizerId: req.user.id });
        if (sessions.length === 0) {
            throw (0, error_middleware_1.BadRequestError)('Not authorized to start this session');
        }
        await database_service_1.DatabaseService.execute(`UPDATE live_sessions SET status = 'live', started_at = SYSUTCDATETIME() WHERE id = @sessionId`, { sessionId });
        const session = await database_service_1.DatabaseService.query('SELECT * FROM live_sessions WHERE id = @sessionId', { sessionId });
        res.json({ success: true, data: session[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/live-sessions/:id/end
 * @desc End a live session
 */
router.post('/:id/end', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute(`UPDATE live_sessions SET status = 'ended', ended_at = SYSUTCDATETIME() WHERE id = @sessionId`, { sessionId });
        // Update all participants' left_at
        await database_service_1.DatabaseService.execute(`UPDATE live_participants SET left_at = SYSUTCDATETIME() WHERE session_id = @sessionId AND left_at IS NULL`, { sessionId });
        res.json({ success: true, message: 'Session ended' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/live-sessions/:id/join
 * @desc Join a live session
 */
router.post('/:id/join', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        // Check if already participant
        const existing = await database_service_1.DatabaseService.query('SELECT * FROM live_participants WHERE session_id = @sessionId AND user_id = @userId', { sessionId, userId: req.user.id });
        if (existing.length > 0) {
            // Update joined_at
            await database_service_1.DatabaseService.execute(`UPDATE live_participants SET joined_at = SYSUTCDATETIME(), left_at = NULL WHERE session_id = @sessionId AND user_id = @userId`, { sessionId, userId: req.user.id });
        }
        else {
            // Add as attendee
            await database_service_1.DatabaseService.execute(`INSERT INTO live_participants (session_id, user_id, role, joined_at)
         VALUES (@sessionId, @userId, 'attendee', SYSUTCDATETIME())`, { sessionId, userId: req.user.id });
        }
        // Get session details
        const sessions = await database_service_1.DatabaseService.query('SELECT * FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId', { sessionId, tenantId: req.user.tenantId });
        res.json({ success: true, data: sessions[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/live-sessions/:id/leave
 * @desc Leave a live session
 */
router.post('/:id/leave', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute(`UPDATE live_participants SET left_at = SYSUTCDATETIME() WHERE session_id = @sessionId AND user_id = @userId`, { sessionId, userId: req.user.id });
        res.json({ success: true, message: 'Left session' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== BREAKOUT ROOMS ====================
/**
 * @route POST /api/v1/live-sessions/:id/breakout-rooms
 * @desc Create a breakout room
 */
router.post('/:id/breakout-rooms', auth_middleware_1.authenticate, [(0, express_validator_1.body)('name').notEmpty().trim()], async (req, res, next) => {
    try {
        validate(req);
        const sessionId = parseInt(req.params.id, 10);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO breakout_rooms (tenant_id, session_id, name)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @sessionId, @name)`, { tenantId: req.user.tenantId, sessionId, name: req.body.name });
        const room = await database_service_1.DatabaseService.query('SELECT * FROM breakout_rooms WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: room[0] });
    }
    catch (error) {
        next(error);
    }
});
// ==================== WHITEBOARD ====================
/**
 * @route GET /api/v1/live-sessions/:id/whiteboard
 * @desc Get whiteboard data
 */
router.get('/:id/whiteboard', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const sessionId = parseInt(req.params.id, 10);
        const whiteboards = await database_service_1.DatabaseService.query('SELECT * FROM whiteboards WHERE session_id = @sessionId AND tenant_id = @tenantId', { sessionId, tenantId: req.user.tenantId });
        if (whiteboards.length === 0) {
            // Create new whiteboard
            const result = await database_service_1.DatabaseService.query(`INSERT INTO whiteboards (tenant_id, session_id, data)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @sessionId, '{}')`, { tenantId: req.user.tenantId, sessionId });
            const newWhiteboard = await database_service_1.DatabaseService.query('SELECT * FROM whiteboards WHERE id = @id', { id: result[0].id });
            res.json({ success: true, data: newWhiteboard[0] });
            return;
        }
        res.json({ success: true, data: whiteboards[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route PUT /api/v1/live-sessions/:id/whiteboard
 * @desc Update whiteboard data
 */
router.put('/:id/whiteboard', auth_middleware_1.authenticate, [(0, express_validator_1.body)('data').isObject()], async (req, res, next) => {
    try {
        validate(req);
        const sessionId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute(`UPDATE whiteboards SET data = @data, updated_at = SYSUTCDATETIME() 
       WHERE session_id = @sessionId AND tenant_id = @tenantId`, { sessionId, tenantId: req.user.tenantId, data: JSON.stringify(req.body.data) });
        res.json({ success: true, message: 'Whiteboard updated' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=live-session.routes.js.map