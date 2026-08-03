import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== LIVE SESSIONS ====================

/**
 * @route GET /api/v1/live-sessions
 * @desc List live sessions
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const status = req.query.status as string;
    const courseId = req.query.courseId as string;

    let query = `SELECT ls.*, u.display_name as organizer_name, c.title as course_title,
                        (SELECT COUNT(*) FROM live_participants WHERE session_id = ls.id) as participant_count
                 FROM live_sessions ls
                 LEFT JOIN users u ON ls.organizer_id = u.id
                 LEFT JOIN courses c ON ls.course_id = c.id
                 WHERE ls.tenant_id = @tenantId`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    if (status) {
      query += ' AND ls.status = @status';
      params.status = status;
    }
    if (courseId) {
      query += ' AND ls.course_id = @courseId';
      params.courseId = parseInt(courseId, 10);
    }

    query += ' ORDER BY ls.scheduled_at DESC';

    const sessions = await DatabaseService.query<any>(query, params);
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/live-sessions/:id
 * @desc Get live session details
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    const sessions = await DatabaseService.query<any>(
      `SELECT ls.*, u.display_name as organizer_name, c.title as course_title
       FROM live_sessions ls
       LEFT JOIN users u ON ls.organizer_id = u.id
       LEFT JOIN courses c ON ls.course_id = c.id
       WHERE ls.id = @sessionId AND ls.tenant_id = @tenantId`,
      { sessionId, tenantId: req.user!.tenantId }
    );

    if (sessions.length === 0) {
      throw NotFoundError('Live session');
    }

    // Get participants
    const participants = await DatabaseService.query<any>(
      `SELECT lp.*, u.display_name, u.email
       FROM live_participants lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.session_id = @sessionId`,
      { sessionId }
    );

    // Get breakout rooms
    const breakoutRooms = await DatabaseService.query<any>(
      'SELECT * FROM breakout_rooms WHERE session_id = @sessionId',
      { sessionId }
    );

    // Get recordings
    const recordings = await DatabaseService.query<any>(
      `SELECT lr.*, f.filename, f.storage_key
       FROM live_recordings lr
       LEFT JOIN file_assets f ON lr.file_id = f.id
       WHERE lr.session_id = @sessionId`,
      { sessionId }
    );

    res.json({
      success: true,
      data: {
        ...sessions[0],
        participants,
        breakoutRooms,
        recordings,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/live-sessions
 * @desc Create a new live session
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').notEmpty().trim(),
    body('courseId').optional().isInt(),
    body('moduleId').optional().isInt(),
    body('scheduledAt').optional().isISO8601(),
    body('meetingProvider').optional().isIn(['webrtc', 'zoom', 'teams', 'meet']),
    body('meetingLink').optional().trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO live_sessions (tenant_id, title, course_id, module_id, status, scheduled_at, organizer_id, meeting_provider, meeting_link)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @title, @courseId, @moduleId, 'scheduled', @scheduledAt, @organizerId, @meetingProvider, @meetingLink)`,
        {
          tenantId: req.user!.tenantId,
          title: req.body.title,
          courseId: req.body.courseId || null,
          moduleId: req.body.moduleId || null,
          scheduledAt: req.body.scheduledAt || null,
          organizerId: req.user!.id,
          meetingProvider: req.body.meetingProvider || 'webrtc',
          meetingLink: req.body.meetingLink || null,
        }
      );

      // Add organizer as host
      await DatabaseService.execute(
        `INSERT INTO live_participants (session_id, user_id, role)
         VALUES (@sessionId, @userId, 'host')`,
        { sessionId: result[0].id, userId: req.user!.id }
      );

      const session = await DatabaseService.query<any>(
        'SELECT * FROM live_sessions WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: session[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/live-sessions/:id
 * @desc Update live session
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const sessionId = parseInt(req.params.id, 10);

      const updateFields: string[] = [];
      const params: Record<string, any> = { sessionId, tenantId: req.user!.tenantId };

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
        await DatabaseService.execute(
          `UPDATE live_sessions SET ${updateFields.join(', ')} WHERE id = @sessionId AND tenant_id = @tenantId`,
          params
        );
      }

      const session = await DatabaseService.query<any>(
        'SELECT * FROM live_sessions WHERE id = @sessionId',
        { sessionId }
      );

      res.json({ success: true, data: session[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/live-sessions/:id/start
 * @desc Start a live session
 */
router.post('/:id/start', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    // Verify organizer
    const sessions = await DatabaseService.query<any>(
      'SELECT * FROM live_sessions WHERE id = @sessionId AND organizer_id = @organizerId',
      { sessionId, organizerId: req.user!.id }
    );

    if (sessions.length === 0) {
      throw BadRequestError('Not authorized to start this session');
    }

    await DatabaseService.execute(
      `UPDATE live_sessions SET status = 'live', started_at = SYSUTCDATETIME() WHERE id = @sessionId`,
      { sessionId }
    );

    const session = await DatabaseService.query<any>(
      'SELECT * FROM live_sessions WHERE id = @sessionId',
      { sessionId }
    );

    res.json({ success: true, data: session[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/live-sessions/:id/end
 * @desc End a live session
 */
router.post('/:id/end', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      `UPDATE live_sessions SET status = 'ended', ended_at = SYSUTCDATETIME() WHERE id = @sessionId`,
      { sessionId }
    );

    // Update all participants' left_at
    await DatabaseService.execute(
      `UPDATE live_participants SET left_at = SYSUTCDATETIME() WHERE session_id = @sessionId AND left_at IS NULL`,
      { sessionId }
    );

    res.json({ success: true, message: 'Session ended' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/live-sessions/:id/join
 * @desc Join a live session
 */
router.post('/:id/join', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    // Check if already participant
    const existing = await DatabaseService.query<any>(
      'SELECT * FROM live_participants WHERE session_id = @sessionId AND user_id = @userId',
      { sessionId, userId: req.user!.id }
    );

    if (existing.length > 0) {
      // Update joined_at
      await DatabaseService.execute(
        `UPDATE live_participants SET joined_at = SYSUTCDATETIME(), left_at = NULL WHERE session_id = @sessionId AND user_id = @userId`,
        { sessionId, userId: req.user!.id }
      );
    } else {
      // Add as attendee
      await DatabaseService.execute(
        `INSERT INTO live_participants (session_id, user_id, role, joined_at)
         VALUES (@sessionId, @userId, 'attendee', SYSUTCDATETIME())`,
        { sessionId, userId: req.user!.id }
      );
    }

    // Get session details
    const sessions = await DatabaseService.query<any>(
      'SELECT * FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId',
      { sessionId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: sessions[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/live-sessions/:id/leave
 * @desc Leave a live session
 */
router.post('/:id/leave', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      `UPDATE live_participants SET left_at = SYSUTCDATETIME() WHERE session_id = @sessionId AND user_id = @userId`,
      { sessionId, userId: req.user!.id }
    );

    res.json({ success: true, message: 'Left session' });
  } catch (error) {
    next(error);
  }
});

// ==================== BREAKOUT ROOMS ====================

/**
 * @route POST /api/v1/live-sessions/:id/breakout-rooms
 * @desc Create a breakout room
 */
router.post(
  '/:id/breakout-rooms',
  authenticate,
  [body('name').notEmpty().trim()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const sessionId = parseInt(req.params.id, 10);

      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO breakout_rooms (tenant_id, session_id, name)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @sessionId, @name)`,
        { tenantId: req.user!.tenantId, sessionId, name: req.body.name }
      );

      const room = await DatabaseService.query<any>(
        'SELECT * FROM breakout_rooms WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: room[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== WHITEBOARD ====================

/**
 * @route GET /api/v1/live-sessions/:id/whiteboard
 * @desc Get whiteboard data
 */
router.get('/:id/whiteboard', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    const whiteboards = await DatabaseService.query<any>(
      'SELECT * FROM whiteboards WHERE session_id = @sessionId AND tenant_id = @tenantId',
      { sessionId, tenantId: req.user!.tenantId }
    );

    if (whiteboards.length === 0) {
      // Create new whiteboard
      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO whiteboards (tenant_id, session_id, data)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @sessionId, '{}')`,
        { tenantId: req.user!.tenantId, sessionId }
      );

      const newWhiteboard = await DatabaseService.query<any>(
        'SELECT * FROM whiteboards WHERE id = @id',
        { id: result[0].id }
      );

      res.json({ success: true, data: newWhiteboard[0] });
      return;
    }

    res.json({ success: true, data: whiteboards[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/live-sessions/:id/whiteboard
 * @desc Update whiteboard data
 */
router.put('/:id/whiteboard', authenticate, [body('data').isObject()], async (req: AuthRequest, res, next) => {
  try {
    validate(req);
    const sessionId = parseInt(req.params.id, 10);

    await DatabaseService.execute(
      `UPDATE whiteboards SET data = @data, updated_at = SYSUTCDATETIME() 
       WHERE session_id = @sessionId AND tenant_id = @tenantId`,
      { sessionId, tenantId: req.user!.tenantId, data: JSON.stringify(req.body.data) }
    );

    res.json({ success: true, message: 'Whiteboard updated' });
  } catch (error) {
    next(error);
  }
});

export default router;
