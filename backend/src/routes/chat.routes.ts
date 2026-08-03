import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== CONVERSATIONS ====================

/**
 * @route GET /api/v1/chat/conversations
 * @desc Get user's conversations
 */
router.get('/conversations', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const conversations = await DatabaseService.query<any>(
      `SELECT c.*, 
              (SELECT TOP 1 cm.body FROM chat_messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC) as last_message,
              (SELECT TOP 1 cm.created_at FROM chat_messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC) as last_message_at,
              (SELECT COUNT(*) FROM chat_participants WHERE conversation_id = c.id) as participant_count
       FROM chat_conversations c
       JOIN chat_participants cp ON c.id = cp.conversation_id
       WHERE cp.user_id = @userId AND c.tenant_id = @tenantId
       ORDER BY last_message_at DESC`,
      { userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    // Get participants for each conversation
    const conversationsWithParticipants = await Promise.all(
      conversations.map(async (conv: any) => {
        const participants = await DatabaseService.query<any>(
          `SELECT cp.user_id, cp.role, u.display_name, u.email
           FROM chat_participants cp
           JOIN users u ON cp.user_id = u.id
           WHERE cp.conversation_id = @conversationId`,
          { conversationId: conv.id }
        );
        return { ...conv, participants };
      })
    );

    res.json({ success: true, data: conversationsWithParticipants });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/chat/conversations
 * @desc Create a new conversation
 */
router.post(
  '/conversations',
  authenticate,
  [
    body('scope').isIn(['direct', 'group', 'course', 'module']),
    body('title').optional().trim(),
    body('participantIds').isArray({ min: 1 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);

      const { scope, title, participantIds } = req.body;

      // For direct messages, check if conversation already exists
      if (scope === 'direct' && participantIds.length === 1) {
        const existing = await DatabaseService.query<any>(
          `SELECT c.id FROM chat_conversations c
           JOIN chat_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = @userId
           JOIN chat_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = @otherUserId
           WHERE c.scope = 'direct' AND c.tenant_id = @tenantId`,
          {
            userId: req.user!.id,
            otherUserId: participantIds[0],
            tenantId: req.user!.tenantId,
          }
        );

        if (existing.length > 0) {
          const conv = await DatabaseService.query<any>(
            'SELECT * FROM chat_conversations WHERE id = @id',
            { id: existing[0].id }
          );
          res.json({ success: true, data: conv[0], existing: true });
          return;
        }
      }

      // Create conversation
      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO chat_conversations (tenant_id, scope, title, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @scope, @title, @createdBy)`,
        {
          tenantId: req.user!.tenantId,
          scope,
          title: title || null,
          createdBy: req.user!.id,
        }
      );

      const conversationId = result[0].id;

      // Add creator as owner
      await DatabaseService.execute(
        `INSERT INTO chat_participants (conversation_id, user_id, role)
         VALUES (@conversationId, @userId, 'owner')`,
        { conversationId, userId: req.user!.id }
      );

      // Add other participants
      for (const participantId of participantIds) {
        if (participantId !== req.user!.id) {
          await DatabaseService.execute(
            `INSERT INTO chat_participants (conversation_id, user_id, role)
             VALUES (@conversationId, @userId, 'member')`,
            { conversationId, userId: participantId }
          );
        }
      }

      const conversation = await DatabaseService.query<any>(
        'SELECT * FROM chat_conversations WHERE id = @id',
        { id: conversationId }
      );

      res.status(201).json({ success: true, data: conversation[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/chat/conversations/:id
 * @desc Get conversation details with messages
 */
router.get('/conversations/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10);

    // Check if user is participant
    const participant = await DatabaseService.query<any>(
      'SELECT * FROM chat_participants WHERE conversation_id = @conversationId AND user_id = @userId',
      { conversationId, userId: req.user!.id }
    );

    if (participant.length === 0) {
      throw ForbiddenError('Not a participant of this conversation');
    }

    const conversations = await DatabaseService.query<any>(
      'SELECT * FROM chat_conversations WHERE id = @conversationId AND tenant_id = @tenantId',
      { conversationId, tenantId: req.user!.tenantId }
    );

    if (conversations.length === 0) {
      throw NotFoundError('Conversation');
    }

    const participants = await DatabaseService.query<any>(
      `SELECT cp.user_id, cp.role, cp.joined_at, u.display_name, u.email
       FROM chat_participants cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.conversation_id = @conversationId`,
      { conversationId }
    );

    res.json({
      success: true,
      data: {
        ...conversations[0],
        participants,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== MESSAGES ====================

/**
 * @route GET /api/v1/chat/conversations/:id/messages
 * @desc Get messages for a conversation
 */
router.get('/conversations/:id/messages', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    // Check participation
    const participant = await DatabaseService.query<any>(
      'SELECT * FROM chat_participants WHERE conversation_id = @conversationId AND user_id = @userId',
      { conversationId, userId: req.user!.id }
    );

    if (participant.length === 0) {
      throw ForbiddenError('Not a participant of this conversation');
    }

    const [countResult, messages] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        'SELECT COUNT(*) as total FROM chat_messages WHERE conversation_id = @conversationId AND deleted_at IS NULL',
        { conversationId }
      ),
      DatabaseService.query<any>(
        `SELECT cm.*, u.display_name as sender_name, u.email as sender_email
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.conversation_id = @conversationId AND cm.deleted_at IS NULL
         ORDER BY cm.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { conversationId, offset, limit }
      ),
    ]);

    // Get attachments for messages
    const messagesWithAttachments = await Promise.all(
      messages.map(async (msg: any) => {
        const attachments = await DatabaseService.query<any>(
          `SELECT ca.id, f.filename, f.mime_type, f.storage_key, f.size_bytes
           FROM chat_attachments ca
           JOIN file_assets f ON ca.file_id = f.id
           WHERE ca.message_id = @messageId`,
          { messageId: msg.id }
        );
        return { ...msg, attachments };
      })
    );

    res.json({
      success: true,
      data: messagesWithAttachments.reverse(), // Chronological order
      meta: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/chat/conversations/:id/messages
 * @desc Send a message
 */
router.post(
  '/conversations/:id/messages',
  authenticate,
  [
    body('body').optional().trim(),
    body('attachmentIds').optional().isArray(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const conversationId = parseInt(req.params.id, 10);

      // Check participation
      const participant = await DatabaseService.query<any>(
        'SELECT * FROM chat_participants WHERE conversation_id = @conversationId AND user_id = @userId',
        { conversationId, userId: req.user!.id }
      );

      if (participant.length === 0) {
        throw ForbiddenError('Not a participant of this conversation');
      }

      if (!req.body.body && (!req.body.attachmentIds || req.body.attachmentIds.length === 0)) {
        throw BadRequestError('Message must have body or attachments');
      }

      // Create message
      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO chat_messages (tenant_id, conversation_id, sender_id, body)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @conversationId, @senderId, @body)`,
        {
          tenantId: req.user!.tenantId,
          conversationId,
          senderId: req.user!.id,
          body: req.body.body || null,
        }
      );

      const messageId = result[0].id;

      // Add attachments
      if (req.body.attachmentIds && req.body.attachmentIds.length > 0) {
        for (const fileId of req.body.attachmentIds) {
          await DatabaseService.execute(
            `INSERT INTO chat_attachments (tenant_id, message_id, file_id)
             VALUES (@tenantId, @messageId, @fileId)`,
            { tenantId: req.user!.tenantId, messageId, fileId }
          );
        }
      }

      // Get the message with user info
      const messages = await DatabaseService.query<any>(
        `SELECT cm.*, u.display_name as sender_name, u.email as sender_email
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.id = @messageId`,
        { messageId }
      );

      const attachments = await DatabaseService.query<any>(
        `SELECT ca.id, f.filename, f.mime_type, f.storage_key
         FROM chat_attachments ca
         JOIN file_assets f ON ca.file_id = f.id
         WHERE ca.message_id = @messageId`,
        { messageId }
      );

      res.status(201).json({
        success: true,
        data: { ...messages[0], attachments },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/chat/messages/:id
 * @desc Delete a message (soft delete)
 */
router.delete('/messages/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const messageId = parseInt(req.params.id, 10);

    // Check if user owns the message
    const messages = await DatabaseService.query<any>(
      'SELECT * FROM chat_messages WHERE id = @messageId AND sender_id = @userId',
      { messageId, userId: req.user!.id }
    );

    if (messages.length === 0) {
      throw ForbiddenError('Cannot delete this message');
    }

    await DatabaseService.execute(
      'UPDATE chat_messages SET deleted_at = SYSUTCDATETIME() WHERE id = @messageId',
      { messageId }
    );

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/chat/conversations/:id/participants
 * @desc Add participant to conversation
 */
router.post(
  '/conversations/:id/participants',
  authenticate,
  [body('userId').isInt()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const conversationId = parseInt(req.params.id, 10);

      // Check if user is owner
      const owner = await DatabaseService.query<any>(
        `SELECT * FROM chat_participants 
         WHERE conversation_id = @conversationId AND user_id = @userId AND role = 'owner'`,
        { conversationId, userId: req.user!.id }
      );

      if (owner.length === 0) {
        throw ForbiddenError('Only conversation owner can add participants');
      }

      // Check if already participant
      const existing = await DatabaseService.query<any>(
        'SELECT * FROM chat_participants WHERE conversation_id = @conversationId AND user_id = @newUserId',
        { conversationId, newUserId: req.body.userId }
      );

      if (existing.length > 0) {
        throw BadRequestError('User is already a participant');
      }

      await DatabaseService.execute(
        `INSERT INTO chat_participants (conversation_id, user_id, role)
         VALUES (@conversationId, @userId, 'member')`,
        { conversationId, userId: req.body.userId }
      );

      res.json({ success: true, message: 'Participant added' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/chat/conversations/:id/participants/:userId
 * @desc Remove participant from conversation
 */
router.delete('/conversations/:id/participants/:userId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    // Check permissions (owner or self-removal)
    const owner = await DatabaseService.query<any>(
      `SELECT * FROM chat_participants 
       WHERE conversation_id = @conversationId AND user_id = @userId AND role = 'owner'`,
      { conversationId, userId: req.user!.id }
    );

    if (owner.length === 0 && req.user!.id !== targetUserId) {
      throw ForbiddenError('Not authorized to remove this participant');
    }

    await DatabaseService.execute(
      'DELETE FROM chat_participants WHERE conversation_id = @conversationId AND user_id = @targetUserId',
      { conversationId, targetUserId }
    );

    res.json({ success: true, message: 'Participant removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
