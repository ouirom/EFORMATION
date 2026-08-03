import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { UserPayload } from '../middleware/auth.middleware';

interface AuthenticatedSocket extends Socket {
  user?: UserPayload;
}

export const setupSocketIO = (io: SocketServer): void => {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const user = jwt.verify(token as string, config.jwt.secret) as UserPayload;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    logger.info(`User ${user.id} connected via WebSocket`);

    // Join user's personal room
    socket.join(`user:${user.id}`);
    
    // Join tenant room
    socket.join(`tenant:${user.tenantId}`);

    // Join organization rooms based on user's role
    if (user.enterpriseId) {
      socket.join(`enterprise:${user.enterpriseId}`);
    }
    if (user.directionId) {
      socket.join(`direction:${user.directionId}`);
    }
    if (user.serviceId) {
      socket.join(`service:${user.serviceId}`);
    }

    // === CHAT EVENTS ===
    socket.on('chat:join', (conversationId: number) => {
      socket.join(`chat:${conversationId}`);
      logger.debug(`User ${user.id} joined chat ${conversationId}`);
    });

    socket.on('chat:leave', (conversationId: number) => {
      socket.leave(`chat:${conversationId}`);
      logger.debug(`User ${user.id} left chat ${conversationId}`);
    });

    socket.on('chat:message', async (data: {
      conversationId: number;
      body: string;
      attachments?: number[];
    }) => {
      // Emit to all participants in the conversation
      io.to(`chat:${data.conversationId}`).emit('chat:message', {
        conversationId: data.conversationId,
        senderId: user.id,
        senderName: user.email,
        body: data.body,
        attachments: data.attachments,
        createdAt: new Date(),
      });
    });

    socket.on('chat:typing', (conversationId: number) => {
      socket.to(`chat:${conversationId}`).emit('chat:typing', {
        userId: user.id,
        conversationId,
      });
    });

    socket.on('chat:stop-typing', (conversationId: number) => {
      socket.to(`chat:${conversationId}`).emit('chat:stop-typing', {
        userId: user.id,
        conversationId,
      });
    });

    // === LIVE SESSION EVENTS ===
    socket.on('live:join', (sessionId: number) => {
      socket.join(`live:${sessionId}`);
      io.to(`live:${sessionId}`).emit('live:participant-joined', {
        userId: user.id,
        sessionId,
      });
      logger.debug(`User ${user.id} joined live session ${sessionId}`);
    });

    socket.on('live:leave', (sessionId: number) => {
      socket.leave(`live:${sessionId}`);
      io.to(`live:${sessionId}`).emit('live:participant-left', {
        userId: user.id,
        sessionId,
      });
    });

    socket.on('live:raise-hand', (sessionId: number) => {
      io.to(`live:${sessionId}`).emit('live:hand-raised', {
        userId: user.id,
        sessionId,
      });
    });

    socket.on('live:lower-hand', (sessionId: number) => {
      io.to(`live:${sessionId}`).emit('live:hand-lowered', {
        userId: user.id,
        sessionId,
      });
    });

    socket.on('live:message', (data: {
      sessionId: number;
      body: string;
    }) => {
      io.to(`live:${data.sessionId}`).emit('live:message', {
        userId: user.id,
        body: data.body,
        createdAt: new Date(),
      });
    });

    // === WHITEBOARD EVENTS ===
    socket.on('whiteboard:join', (whiteboardId: number) => {
      socket.join(`whiteboard:${whiteboardId}`);
    });

    socket.on('whiteboard:draw', (data: {
      whiteboardId: number;
      stroke: any;
    }) => {
      socket.to(`whiteboard:${data.whiteboardId}`).emit('whiteboard:draw', {
        userId: user.id,
        stroke: data.stroke,
      });
    });

    socket.on('whiteboard:clear', (whiteboardId: number) => {
      socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:clear', {
        userId: user.id,
      });
    });

    // === BREAKOUT ROOM EVENTS ===
    socket.on('breakout:join', (roomId: number) => {
      socket.join(`breakout:${roomId}`);
      io.to(`breakout:${roomId}`).emit('breakout:participant-joined', {
        userId: user.id,
        roomId,
      });
    });

    socket.on('breakout:leave', (roomId: number) => {
      socket.leave(`breakout:${roomId}`);
      io.to(`breakout:${roomId}`).emit('breakout:participant-left', {
        userId: user.id,
        roomId,
      });
    });

    // === NOTIFICATION EVENTS ===
    socket.on('notification:read', (notificationId: number) => {
      // Mark notification as read - handled by API
      logger.debug(`User ${user.id} read notification ${notificationId}`);
    });

    // === WEBRTC SIGNALING ===
    socket.on('webrtc:offer', (data: {
      sessionId: number;
      targetUserId: number;
      offer: any;
    }) => {
      io.to(`user:${data.targetUserId}`).emit('webrtc:offer', {
        sessionId: data.sessionId,
        fromUserId: user.id,
        offer: data.offer,
      });
    });

    socket.on('webrtc:answer', (data: {
      sessionId: number;
      targetUserId: number;
      answer: any;
    }) => {
      io.to(`user:${data.targetUserId}`).emit('webrtc:answer', {
        sessionId: data.sessionId,
        fromUserId: user.id,
        answer: data.answer,
      });
    });

    socket.on('webrtc:ice-candidate', (data: {
      sessionId: number;
      targetUserId: number;
      candidate: any;
    }) => {
      io.to(`user:${data.targetUserId}`).emit('webrtc:ice-candidate', {
        sessionId: data.sessionId,
        fromUserId: user.id,
        candidate: data.candidate,
      });
    });

    // === PRESENCE ===
    socket.on('presence:status', (status: 'online' | 'away' | 'busy' | 'offline') => {
      // Broadcast to relevant rooms
      socket.to(`tenant:${user.tenantId}`).emit('presence:status', {
        userId: user.id,
        status,
      });
    });

    // === DISCONNECT ===
    socket.on('disconnect', (reason) => {
      logger.info(`User ${user.id} disconnected: ${reason}`);
      
      // Notify presence
      io.to(`tenant:${user.tenantId}`).emit('presence:status', {
        userId: user.id,
        status: 'offline',
      });
    });
  });
};

// Helper function to emit to specific users or rooms
export const emitToUser = (io: SocketServer, userId: number, event: string, data: any): void => {
  io.to(`user:${userId}`).emit(event, data);
};

export const emitToTenant = (io: SocketServer, tenantId: number, event: string, data: any): void => {
  io.to(`tenant:${tenantId}`).emit(event, data);
};

export const emitToConversation = (io: SocketServer, conversationId: number, event: string, data: any): void => {
  io.to(`chat:${conversationId}`).emit(event, data);
};

export const emitToLiveSession = (io: SocketServer, sessionId: number, event: string, data: any): void => {
  io.to(`live:${sessionId}`).emit(event, data);
};
