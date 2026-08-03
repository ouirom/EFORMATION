import { Server as SocketServer } from 'socket.io';
export declare const setupSocketIO: (io: SocketServer) => void;
export declare const emitToUser: (io: SocketServer, userId: number, event: string, data: any) => void;
export declare const emitToTenant: (io: SocketServer, tenantId: number, event: string, data: any) => void;
export declare const emitToConversation: (io: SocketServer, conversationId: number, event: string, data: any) => void;
export declare const emitToLiveSession: (io: SocketServer, sessionId: number, event: string, data: any) => void;
//# sourceMappingURL=index.d.ts.map