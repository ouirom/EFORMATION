import 'reflect-metadata';
import { Application } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
declare class App {
    app: Application;
    server: ReturnType<typeof createServer>;
    io: SocketServer;
    constructor();
    private initializeMiddleware;
    private initializeRoutes;
    private initializeErrorHandling;
    private initializeSocketIO;
    start(): Promise<void>;
    private shutdown;
}
declare const app: App;
export default app;
//# sourceMappingURL=index.d.ts.map