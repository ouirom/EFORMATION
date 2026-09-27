import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error.middleware';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { resolveEntityId } from '../utils/resolvePublicId';
import { TenantSettingsService, requireFeature } from '../services/tenant-settings.service';

const router = Router();

// Every chat endpoint is unavailable when the organization turned the chat off.
router.use(authenticate, requireFeature('chat'));

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// Folds the reply_to_* columns joined onto a chat_messages row into a nested
// `replyTo` object, and drops the raw join columns from the response. A reply
// whose original message was since soft-deleted still gets a replyTo (so the
// quoted preview doesn't just vanish) but with the body replaced -- the deleted
// text shouldn't leak to someone who wasn't meant to keep seeing it.
const formatMessageReplyTo = (msg: any) => {
  const { reply_to_id, reply_to_body, reply_to_deleted_at, reply_to_sender_name, ...rest } = msg;
  const replyTo = reply_to_id
    ? {
        id: reply_to_id,
        body: reply_to_deleted_at ? null : reply_to_body,
        senderName: reply_to_sender_name,
        deleted: !!reply_to_deleted_at,
      }
    : null;
  return { ...rest, replyTo };
};

// ==================== CONVERSATIONS ====================

/**
 * @route GET /api/v1/chat/conversations
 * @desc Get user's conversations
 */
router.get('/conversations', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const conversations = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT c.*,
                  (SELECT cm.body FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.deleted_at IS NULL ORDER BY cm.created_at DESC LIMIT 1) as last_message,
                  (SELECT cm.created_at FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.deleted_at IS NULL ORDER BY cm.created_at DESC LIMIT 1) as last_message_at,
                  (SELECT COUNT(*) FROM chat_participants WHERE conversation_id = c.id) as participant_count
           FROM chat_conversations c
           JOIN chat_participants cp ON c.id = cp.conversation_id
           WHERE cp.user_id = @userId AND c.tenant_id = @tenantId
           ORDER BY last_message_at DESC`
        : `SELECT c.*,
                  (SELECT TOP 1 cm.body FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.deleted_at IS NULL ORDER BY cm.created_at DESC) as last_message,
                  (SELECT TOP 1 cm.created_at FROM chat_messages cm WHERE cm.conversation_id = c.id AND cm.deleted_at IS NULL ORDER BY cm.created_at DESC) as last_message_at,
                  (SELECT COUNT(*) FROM chat_participants WHERE conversation_id = c.id) as participant_count
           FROM chat_conversations c
           JOIN chat_participants cp ON c.id = cp.conversation_id
           WHERE cp.user_id = @userId AND c.tenant_id = @tenantId
           ORDER BY last_message_at DESC`,
      { userId: req.user!.id, tenantId: req.user!.tenantId }
    );

    // Get participants for all conversations in one grouped query instead of one per conversation.
    const participantsByConversation = new Map<number, any[]>();
    if (conversations.length > 0) {
      const conversationIds: number[] = conversations.map((c: any) => c.id);
      const placeholders = conversationIds.map((_, i) => `@conversationId${i}`).join(', ');
      const params: Record<string, any> = {};
      conversationIds.forEach((id, i) => { params[`conversationId${i}`] = id; });

      const allParticipants = await DatabaseService.query<any>(
        `SELECT cp.conversation_id, cp.user_id, cp.role, u.display_name, u.email
         FROM chat_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.conversation_id IN (${placeholders})`,
        params
      );
      for (const p of allParticipants) {
        const list = participantsByConversation.get(p.conversation_id) || [];
        list.push(p);
        participantsByConversation.set(p.conversation_id, list);
      }
    }

    const conversationsWithParticipants = conversations.map((conv: any) => ({
      ...conv,
      participants: participantsByConversation.get(conv.id) || [],
    }));

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

      // Group conversations are capped by the organization's "max users per group"
      // (participants listed + the creator).
      if (scope !== 'direct') {
        const { maxUsersPerGroup } = await TenantSettingsService.get(req.user!.tenantId);
        const size = new Set<number>([req.user!.id, ...participantIds.map(Number)]).size;
        if (size > maxUsersPerGroup) {
          throw BadRequestError(
            `A group conversation can have at most ${maxUsersPerGroup} participants (${size} requested)`,
            'GROUP_TOO_LARGE',
            { max: maxUsersPerGroup, requested: size }
          );
        }
      }

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
        IS_PG
          ? `INSERT INTO chat_conversations (tenant_id, scope, title, created_by)
             VALUES (@tenantId, @scope, @title, @createdBy)
             RETURNING id`
          : `INSERT INTO chat_conversations (tenant_id, scope, title, created_by)
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
    const conversationId = await resolveEntityId('chat_conversations', req.params.id, req.user!.tenantId);

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
    const conversationId = await resolveEntityId('chat_conversations', req.params.id, req.user!.tenantId);
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });

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
        `SELECT cm.*, u.display_name as sender_name, u.email as sender_email,
                rt.id as reply_to_id, rt.body as reply_to_body, rt.deleted_at as reply_to_deleted_at,
                rtu.display_name as reply_to_sender_name
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         LEFT JOIN chat_messages rt ON rt.id = cm.reply_to_message_id
         LEFT JOIN users rtu ON rtu.id = rt.sender_id
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
          // f.id is exposed as the attachment's id -- the frontend uses it to stream/
          // download the file (POST /files/:id/stream-token), which needs the
          // file_assets id, not chat_attachments' own join-row id.
          `SELECT f.id, f.filename, f.mime_type, f.storage_key, f.size_bytes
           FROM chat_attachments ca
           JOIN file_assets f ON ca.file_id = f.id
           WHERE ca.message_id = @messageId`,
          { messageId: msg.id }
        );
        return { ...formatMessageReplyTo(msg), attachments };
      })
    );

    res.json({
      success: true,
      data: messagesWithAttachments.reverse(), // Chronological order
      meta: buildPaginationMeta(countResult[0].total, page, limit),
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
    body('replyToMessageId').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const conversationId = await resolveEntityId('chat_conversations', req.params.id, req.user!.tenantId);

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

      let replyToMessageId: number | null = null;
      if (req.body.replyToMessageId) {
        // Must belong to this same conversation -- otherwise a reply could quote
        // a message from a conversation the sender isn't even part of.
        const replyTarget = await DatabaseService.query<any>(
          'SELECT id FROM chat_messages WHERE id = @replyToMessageId AND conversation_id = @conversationId',
          { replyToMessageId: req.body.replyToMessageId, conversationId }
        );
        if (replyTarget.length === 0) {
          throw BadRequestError('The message being replied to was not found in this conversation');
        }
        replyToMessageId = req.body.replyToMessageId;
      }

      // Create message
      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO chat_messages (tenant_id, conversation_id, sender_id, body, reply_to_message_id)
             VALUES (@tenantId, @conversationId, @senderId, @body, @replyToMessageId)
             RETURNING id`
          : `INSERT INTO chat_messages (tenant_id, conversation_id, sender_id, body, reply_to_message_id)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @conversationId, @senderId, @body, @replyToMessageId)`,
        {
          tenantId: req.user!.tenantId,
          conversationId,
          senderId: req.user!.id,
          body: req.body.body || null,
          replyToMessageId,
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
        `SELECT cm.*, u.display_name as sender_name, u.email as sender_email,
                rt.id as reply_to_id, rt.body as reply_to_body, rt.deleted_at as reply_to_deleted_at,
                rtu.display_name as reply_to_sender_name
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         LEFT JOIN chat_messages rt ON rt.id = cm.reply_to_message_id
         LEFT JOIN users rtu ON rtu.id = rt.sender_id
         WHERE cm.id = @messageId`,
        { messageId }
      );

      const attachments = await DatabaseService.query<any>(
        `SELECT f.id, f.filename, f.mime_type, f.storage_key, f.size_bytes
         FROM chat_attachments ca
         JOIN file_assets f ON ca.file_id = f.id
         WHERE ca.message_id = @messageId`,
        { messageId }
      );

      res.status(201).json({
        success: true,
        data: { ...formatMessageReplyTo(messages[0]), attachments },
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
      `UPDATE chat_messages SET deleted_at = ${db.now()} WHERE id = @messageId`,
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
