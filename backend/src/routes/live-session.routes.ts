import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { AccessToken } from 'livekit-server-sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError, InternalError } from '../middleware/error.middleware';
import { db, IS_PG } from '../database/db-helpers';
import { config } from '../config';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// The DB and its joins use snake_case (scheduled_at, organizer_id, meeting_link, ...);
// the frontend's LiveSession type expects camelCase. Centralizing the mapping here means
// every response shape stays consistent, instead of each route hand-rolling its own subset.
function mapSession(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instructorId: row.organizer_id,
    instructorName: row.organizer_name,
    scheduledAt: row.scheduled_at,
    duration: row.duration,
    meetingUrl: row.meeting_link,
    meetingProvider: row.meeting_provider,
    maxParticipants: row.max_participants,
    currentParticipants: row.participant_count ?? 0,
    status: row.status,
    recordingUrl: row.recording_url ?? null,
    courseId: row.course_id,
    courseName: row.course_title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

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
    res.json({ success: true, data: sessions.map(mapSession) });
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
        ...mapSession(sessions[0]),
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
    body('description').optional({ nullable: true }).trim(),
    body('courseId').optional({ nullable: true }).isInt(),
    body('moduleId').optional({ nullable: true }).isInt(),
    body('instructorId').optional({ nullable: true }).isInt(),
    // A live session with no scheduled time makes no sense (it drives sorting, the
    // upcoming/live/ended tabs, and reminder emails) -- required, not optional. This was
    // previously `.optional({nullable:true})`, which only skips validation for undefined/
    // null, not for an empty string -- so an incompletely-filled datetime-local input
    // (value === '') fell through to isISO8601() and failed with a generic, unhelpful
    // "Validation error" the frontend couldn't explain to the user.
    body('scheduledAt').notEmpty().withMessage('scheduledAt is required').bail().isISO8601().withMessage('scheduledAt must be a valid date'),
    body('duration').optional({ nullable: true }).isInt({ min: 1 }),
    body('maxParticipants').optional({ nullable: true }).isInt({ min: 1 }),
    body('meetingProvider').optional().isIn(['webrtc', 'zoom', 'teams', 'meet']),
    body('meetingUrl').optional({ nullable: true }).trim(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      // instructorId lets the creator schedule a session hosted by someone else (e.g. an
      // admin scheduling on behalf of a manager who will actually run it) -- defaults to
      // the creator when not given. Only /:id/start and /:id/end check organizer_id, so
      // getting this right matters for who can actually run the session afterward.
      let organizerId = req.user!.id;
      if (req.body.instructorId) {
        const instructors = await DatabaseService.query<any>(
          `SELECT id FROM users WHERE id = @instructorId AND tenant_id = @tenantId
           AND role IN ('super_admin', 'admin', 'director', 'manager')`,
          { instructorId: req.body.instructorId, tenantId: req.user!.tenantId }
        );
        if (instructors.length === 0) {
          throw BadRequestError('Invalid instructor');
        }
        organizerId = req.body.instructorId;
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO live_sessions (
               tenant_id, title, description, course_id, module_id, status, scheduled_at,
               duration, organizer_id, meeting_provider, meeting_link, max_participants
             )
             VALUES (
               @tenantId, @title, @description, @courseId, @moduleId, 'scheduled', @scheduledAt,
               @duration, @organizerId, @meetingProvider, @meetingLink, @maxParticipants
             )
             RETURNING id`
          : `INSERT INTO live_sessions (
               tenant_id, title, description, course_id, module_id, status, scheduled_at,
               duration, organizer_id, meeting_provider, meeting_link, max_participants
             )
             OUTPUT INSERTED.id
             VALUES (
               @tenantId, @title, @description, @courseId, @moduleId, 'scheduled', @scheduledAt,
               @duration, @organizerId, @meetingProvider, @meetingLink, @maxParticipants
             )`,
        {
          tenantId: req.user!.tenantId,
          title: req.body.title,
          description: req.body.description || null,
          courseId: req.body.courseId || null,
          moduleId: req.body.moduleId || null,
          scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
          duration: req.body.duration || null,
          organizerId,
          meetingProvider: req.body.meetingProvider || 'webrtc',
          meetingLink: req.body.meetingUrl || null,
          maxParticipants: req.body.maxParticipants || null,
        }
      );

      // Add the organizer (not necessarily the creator, see instructorId above) as host
      await DatabaseService.execute(
        `INSERT INTO live_participants (session_id, user_id, role)
         VALUES (@sessionId, @userId, 'host')`,
        { sessionId: result[0].id, userId: organizerId }
      );

      const session = await DatabaseService.query<any>(
        `SELECT ls.*, u.display_name as organizer_name, c.title as course_title
         FROM live_sessions ls
         LEFT JOIN users u ON ls.organizer_id = u.id
         LEFT JOIN courses c ON ls.course_id = c.id
         WHERE ls.id = @id`,
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: mapSession(session[0]) });
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
      if (req.body.description !== undefined) {
        updateFields.push('description = @description');
        params.description = req.body.description;
      }
      if (req.body.scheduledAt) {
        updateFields.push('scheduled_at = @scheduledAt');
        params.scheduledAt = new Date(req.body.scheduledAt);
      }
      if (req.body.duration !== undefined) {
        updateFields.push('duration = @duration');
        params.duration = req.body.duration;
      }
      if (req.body.maxParticipants !== undefined) {
        updateFields.push('max_participants = @maxParticipants');
        params.maxParticipants = req.body.maxParticipants;
      }
      if (req.body.meetingUrl) {
        updateFields.push('meeting_link = @meetingLink');
        params.meetingLink = req.body.meetingUrl;
      }
      let newOrganizerId: number | null = null;
      if (req.body.instructorId) {
        const instructors = await DatabaseService.query<any>(
          `SELECT id FROM users WHERE id = @instructorId AND tenant_id = @tenantId
           AND role IN ('super_admin', 'admin', 'director', 'manager')`,
          { instructorId: req.body.instructorId, tenantId: req.user!.tenantId }
        );
        if (instructors.length === 0) {
          throw BadRequestError('Invalid instructor');
        }
        newOrganizerId = req.body.instructorId;
        updateFields.push('organizer_id = @organizerId');
        params.organizerId = newOrganizerId;
      }

      if (updateFields.length > 0) {
        await DatabaseService.execute(
          `UPDATE live_sessions SET ${updateFields.join(', ')} WHERE id = @sessionId AND tenant_id = @tenantId`,
          params
        );
      }

      if (newOrganizerId !== null) {
        // Keep live_participants' host row in sync with the reassigned organizer.
        const existingHost = await DatabaseService.query<any>(
          `SELECT session_id FROM live_participants WHERE session_id = @sessionId AND user_id = @userId`,
          { sessionId, userId: newOrganizerId }
        );
        if (existingHost.length > 0) {
          await DatabaseService.execute(
            `UPDATE live_participants SET role = 'host' WHERE session_id = @sessionId AND user_id = @userId`,
            { sessionId, userId: newOrganizerId }
          );
        } else {
          await DatabaseService.execute(
            `INSERT INTO live_participants (session_id, user_id, role) VALUES (@sessionId, @userId, 'host')`,
            { sessionId, userId: newOrganizerId }
          );
        }
      }

      const session = await DatabaseService.query<any>(
        `SELECT ls.*, u.display_name as organizer_name, c.title as course_title
         FROM live_sessions ls
         LEFT JOIN users u ON ls.organizer_id = u.id
         LEFT JOIN courses c ON ls.course_id = c.id
         WHERE ls.id = @sessionId`,
        { sessionId }
      );

      res.json({ success: true, data: mapSession(session[0]) });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/live-sessions/:id
 * @desc Delete a live session (and its participants/breakout rooms/recordings/whiteboard --
 * none of those child tables have ON DELETE CASCADE, so they're cleared first or the
 * DELETE on live_sessions itself would fail with a foreign-key violation)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const sessionId = parseInt(req.params.id, 10);

      const sessions = await DatabaseService.query<any>(
        'SELECT id FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId',
        { sessionId, tenantId: req.user!.tenantId }
      );
      if (sessions.length === 0) {
        throw NotFoundError('Live session');
      }

      await DatabaseService.execute('DELETE FROM breakout_rooms WHERE session_id = @sessionId', { sessionId });
      await DatabaseService.execute('DELETE FROM live_participants WHERE session_id = @sessionId', { sessionId });
      await DatabaseService.execute('DELETE FROM live_recordings WHERE session_id = @sessionId', { sessionId });
      await DatabaseService.execute('DELETE FROM whiteboards WHERE session_id = @sessionId', { sessionId });
      await DatabaseService.execute('DELETE FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId', { sessionId, tenantId: req.user!.tenantId });

      res.json({ success: true, message: 'Live session deleted' });
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

    // The organizer can always start their own session; admin/director/manager can start
    // any session in their tenant too (e.g. one they scheduled but assigned to someone
    // else as instructor via instructorId -- without this, that session could never be
    // started if the assigned instructor never logs in to do it themselves).
    const isManager = ['super_admin', 'admin', 'director', 'manager'].includes(req.user!.role);
    const sessions = await DatabaseService.query<any>(
      isManager
        ? 'SELECT * FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId'
        : 'SELECT * FROM live_sessions WHERE id = @sessionId AND organizer_id = @organizerId AND tenant_id = @tenantId',
      { sessionId, organizerId: req.user!.id, tenantId: req.user!.tenantId }
    );

    if (sessions.length === 0) {
      throw BadRequestError('Not authorized to start this session');
    }

    await DatabaseService.execute(
      `UPDATE live_sessions SET status = 'live', started_at = ${db.now()} WHERE id = @sessionId`,
      { sessionId }
    );

    const session = await DatabaseService.query<any>(
      `SELECT ls.*, u.display_name as organizer_name, c.title as course_title
       FROM live_sessions ls
       LEFT JOIN users u ON ls.organizer_id = u.id
       LEFT JOIN courses c ON ls.course_id = c.id
       WHERE ls.id = @sessionId`,
      { sessionId }
    );

    res.json({ success: true, data: mapSession(session[0]) });
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

    // Mirrors the /:id/start check: organizer, or any admin/director/manager in the tenant.
    const isManager = ['super_admin', 'admin', 'director', 'manager'].includes(req.user!.role);
    const sessions = await DatabaseService.query<any>(
      isManager
        ? 'SELECT id FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId'
        : 'SELECT id FROM live_sessions WHERE id = @sessionId AND organizer_id = @organizerId AND tenant_id = @tenantId',
      { sessionId, organizerId: req.user!.id, tenantId: req.user!.tenantId }
    );

    if (sessions.length === 0) {
      throw BadRequestError('Not authorized to end this session');
    }

    await DatabaseService.execute(
      `UPDATE live_sessions SET status = 'ended', ended_at = ${db.now()} WHERE id = @sessionId`,
      { sessionId }
    );

    // Update all participants' left_at
    await DatabaseService.execute(
      `UPDATE live_participants SET left_at = ${db.now()} WHERE session_id = @sessionId AND left_at IS NULL`,
      { sessionId }
    );

    res.json({ success: true, message: 'Session ended' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/live-sessions/:id/cancel
 * @desc Cancel a scheduled live session
 */
router.post(
  '/:id/cancel',
  authenticate,
  authorize('admin', 'director', 'manager'),
  async (req: AuthRequest, res, next) => {
    try {
      const sessionId = parseInt(req.params.id, 10);

      await DatabaseService.execute(
        `UPDATE live_sessions SET status = 'canceled' WHERE id = @sessionId AND tenant_id = @tenantId`,
        { sessionId, tenantId: req.user!.tenantId }
      );

      res.json({ success: true, message: 'Session canceled' });
    } catch (error) {
      next(error);
    }
  }
);

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
        `UPDATE live_participants SET joined_at = ${db.now()}, left_at = NULL WHERE session_id = @sessionId AND user_id = @userId`,
        { sessionId, userId: req.user!.id }
      );
    } else {
      // Add as attendee
      await DatabaseService.execute(
        `INSERT INTO live_participants (session_id, user_id, role, joined_at)
         VALUES (@sessionId, @userId, 'attendee', ${db.now()})`,
        { sessionId, userId: req.user!.id }
      );
    }

    // Get session details
    const sessions = await DatabaseService.query<any>(
      `SELECT ls.*, u.display_name as organizer_name, c.title as course_title
       FROM live_sessions ls
       LEFT JOIN users u ON ls.organizer_id = u.id
       LEFT JOIN courses c ON ls.course_id = c.id
       WHERE ls.id = @sessionId AND ls.tenant_id = @tenantId`,
      { sessionId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: mapSession(sessions[0]) });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/live-sessions/:id/livekit-token
 * @desc Mint a per-participant LiveKit access token for this session's embedded
 * video room (used when no external meetingUrl is configured). Registers the
 * caller as a participant the same way POST /:id/join does, so a client can
 * call this directly without a separate join request.
 */
router.post('/:id/livekit-token', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
      throw InternalError(
        "La visioconférence intégrée n'est pas configurée sur ce serveur (LiveKit)."
      );
    }

    const sessionId = parseInt(req.params.id, 10);

    const sessions = await DatabaseService.query<{ id: number; status: string; organizer_id: number }>(
      'SELECT id, status, organizer_id FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId',
      { sessionId, tenantId: req.user!.tenantId }
    );
    if (sessions.length === 0) {
      throw NotFoundError('Live session');
    }
    const session = sessions[0];

    if (session.status !== 'live') {
      throw BadRequestError("La session n'est pas en direct pour le moment.", 'SESSION_NOT_LIVE');
    }

    const isHost = session.organizer_id === req.user!.id;

    const existing = await DatabaseService.query<any>(
      'SELECT session_id FROM live_participants WHERE session_id = @sessionId AND user_id = @userId',
      { sessionId, userId: req.user!.id }
    );
    if (existing.length > 0) {
      await DatabaseService.execute(
        `UPDATE live_participants SET joined_at = ${db.now()}, left_at = NULL WHERE session_id = @sessionId AND user_id = @userId`,
        { sessionId, userId: req.user!.id }
      );
    } else {
      await DatabaseService.execute(
        `INSERT INTO live_participants (session_id, user_id, role, joined_at)
         VALUES (@sessionId, @userId, @role, ${db.now()})`,
        { sessionId, userId: req.user!.id, role: isHost ? 'host' : 'attendee' }
      );
    }

    const displayName = req.user!.displayName || req.user!.email;

    // Room name is namespaced by tenant so two tenants can never collide on the
    // same LiveKit project even though session ids aren't globally unique.
    const roomName = `session-${req.user!.tenantId}-${sessionId}`;

    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: String(req.user!.id),
      name: displayName,
      ttl: '6h',
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Lets the organizer mute/remove participants via the LiveKit server API later;
      // no moderation UI is wired up to use it yet.
      roomAdmin: isHost,
    });
    const token = await at.toJwt();

    res.json({
      success: true,
      data: { token, url: config.livekit.url, roomName },
    });
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
      `UPDATE live_participants SET left_at = ${db.now()} WHERE session_id = @sessionId AND user_id = @userId`,
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

      // The session id comes straight from the URL param -- without this check, a caller
      // could create a breakout room against a session belonging to a different tenant
      // (the FK to live_sessions doesn't care about tenant, only that the id exists).
      const sessions = await DatabaseService.query<any>(
        'SELECT id FROM live_sessions WHERE id = @sessionId AND tenant_id = @tenantId',
        { sessionId, tenantId: req.user!.tenantId }
      );
      if (sessions.length === 0) {
        throw NotFoundError('Live session');
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO breakout_rooms (tenant_id, session_id, name)
             VALUES (@tenantId, @sessionId, @name)
             RETURNING id`
          : `INSERT INTO breakout_rooms (tenant_id, session_id, name)
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
        IS_PG
          ? `INSERT INTO whiteboards (tenant_id, session_id, data)
             VALUES (@tenantId, @sessionId, '{}')
             RETURNING id`
          : `INSERT INTO whiteboards (tenant_id, session_id, data)
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
      `UPDATE whiteboards SET data = @data, updated_at = ${db.now()}
       WHERE session_id = @sessionId AND tenant_id = @tenantId`,
      { sessionId, tenantId: req.user!.tenantId, data: JSON.stringify(req.body.data) }
    );

    res.json({ success: true, message: 'Whiteboard updated' });
  } catch (error) {
    next(error);
  }
});

export default router;
