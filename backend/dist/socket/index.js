"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToLiveSession = exports.emitToConversation = exports.emitToTenant = exports.emitToUser = exports.setupSocketIO = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const setupSocketIO = (io) => {
    // Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const user = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
            socket.user = user;
            next();
        }
        catch (error) {
            next(new Error('Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.user;
        logger_1.logger.info(`User ${user.id} connected via WebSocket`);
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
        socket.on('chat:join', (conversationId) => {
            socket.join(`chat:${conversationId}`);
            logger_1.logger.debug(`User ${user.id} joined chat ${conversationId}`);
        });
        socket.on('chat:leave', (conversationId) => {
            socket.leave(`chat:${conversationId}`);
            logger_1.logger.debug(`User ${user.id} left chat ${conversationId}`);
        });
        socket.on('chat:message', async (data) => {
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
        socket.on('chat:typing', (conversationId) => {
            socket.to(`chat:${conversationId}`).emit('chat:typing', {
                userId: user.id,
                conversationId,
            });
        });
        socket.on('chat:stop-typing', (conversationId) => {
            socket.to(`chat:${conversationId}`).emit('chat:stop-typing', {
                userId: user.id,
                conversationId,
            });
        });
        // === LIVE SESSION EVENTS ===
        socket.on('live:join', (sessionId) => {
            socket.join(`live:${sessionId}`);
            io.to(`live:${sessionId}`).emit('live:participant-joined', {
                userId: user.id,
                sessionId,
            });
            logger_1.logger.debug(`User ${user.id} joined live session ${sessionId}`);
        });
        socket.on('live:leave', (sessionId) => {
            socket.leave(`live:${sessionId}`);
            io.to(`live:${sessionId}`).emit('live:participant-left', {
                userId: user.id,
                sessionId,
            });
        });
        socket.on('live:raise-hand', (sessionId) => {
            io.to(`live:${sessionId}`).emit('live:hand-raised', {
                userId: user.id,
                sessionId,
            });
        });
        socket.on('live:lower-hand', (sessionId) => {
            io.to(`live:${sessionId}`).emit('live:hand-lowered', {
                userId: user.id,
                sessionId,
            });
        });
        socket.on('live:message', (data) => {
            io.to(`live:${data.sessionId}`).emit('live:message', {
                userId: user.id,
                body: data.body,
                createdAt: new Date(),
            });
        });
        // === WHITEBOARD EVENTS ===
        socket.on('whiteboard:join', (whiteboardId) => {
            socket.join(`whiteboard:${whiteboardId}`);
        });
        socket.on('whiteboard:draw', (data) => {
            socket.to(`whiteboard:${data.whiteboardId}`).emit('whiteboard:draw', {
                userId: user.id,
                stroke: data.stroke,
            });
        });
        socket.on('whiteboard:clear', (whiteboardId) => {
            socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:clear', {
                userId: user.id,
            });
        });
        // === BREAKOUT ROOM EVENTS ===
        socket.on('breakout:join', (roomId) => {
            socket.join(`breakout:${roomId}`);
            io.to(`breakout:${roomId}`).emit('breakout:participant-joined', {
                userId: user.id,
                roomId,
            });
        });
        socket.on('breakout:leave', (roomId) => {
            socket.leave(`breakout:${roomId}`);
            io.to(`breakout:${roomId}`).emit('breakout:participant-left', {
                userId: user.id,
                roomId,
            });
        });
        // === NOTIFICATION EVENTS ===
        socket.on('notification:read', (notificationId) => {
            // Mark notification as read - handled by API
            logger_1.logger.debug(`User ${user.id} read notification ${notificationId}`);
        });
        // === WEBRTC SIGNALING ===
        socket.on('webrtc:offer', (data) => {
            io.to(`user:${data.targetUserId}`).emit('webrtc:offer', {
                sessionId: data.sessionId,
                fromUserId: user.id,
                offer: data.offer,
            });
        });
        socket.on('webrtc:answer', (data) => {
            io.to(`user:${data.targetUserId}`).emit('webrtc:answer', {
                sessionId: data.sessionId,
                fromUserId: user.id,
                answer: data.answer,
            });
        });
        socket.on('webrtc:ice-candidate', (data) => {
            io.to(`user:${data.targetUserId}`).emit('webrtc:ice-candidate', {
                sessionId: data.sessionId,
                fromUserId: user.id,
                candidate: data.candidate,
            });
        });
        // === PRESENCE ===
        socket.on('presence:status', (status) => {
            // Broadcast to relevant rooms
            socket.to(`tenant:${user.tenantId}`).emit('presence:status', {
                userId: user.id,
                status,
            });
        });
        // === DISCONNECT ===
        socket.on('disconnect', (reason) => {
            logger_1.logger.info(`User ${user.id} disconnected: ${reason}`);
            // Notify presence
            io.to(`tenant:${user.tenantId}`).emit('presence:status', {
                userId: user.id,
                status: 'offline',
            });
        });
    });
};
exports.setupSocketIO = setupSocketIO;
// Helper function to emit to specific users or rooms
const emitToUser = (io, userId, event, data) => {
    io.to(`user:${userId}`).emit(event, data);
};
exports.emitToUser = emitToUser;
const emitToTenant = (io, tenantId, event, data) => {
    io.to(`tenant:${tenantId}`).emit(event, data);
};
exports.emitToTenant = emitToTenant;
const emitToConversation = (io, conversationId, event, data) => {
    io.to(`chat:${conversationId}`).emit(event, data);
};
exports.emitToConversation = emitToConversation;
const emitToLiveSession = (io, sessionId, event, data) => {
    io.to(`live:${sessionId}`).emit(event, data);
};
exports.emitToLiveSession = emitToLiveSession;
//# sourceMappingURL=index.js.map