"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Import configurations
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const database_service_1 = require("./services/database.service");
const socket_1 = require("./socket");
// Import routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const organization_routes_1 = __importDefault(require("./routes/organization.routes"));
const course_routes_1 = __importDefault(require("./routes/course.routes"));
const module_routes_1 = __importDefault(require("./routes/module.routes"));
const lesson_routes_1 = __importDefault(require("./routes/lesson.routes"));
const content_routes_1 = __importDefault(require("./routes/content.routes"));
const quiz_routes_1 = __importDefault(require("./routes/quiz.routes"));
const attempt_routes_1 = __importDefault(require("./routes/attempt.routes"));
const badge_routes_1 = __importDefault(require("./routes/badge.routes"));
const certificate_routes_1 = __importDefault(require("./routes/certificate.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const live_session_routes_1 = __importDefault(require("./routes/live-session.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const blog_routes_1 = __importDefault(require("./routes/blog.routes"));
const ai_routes_1 = __importDefault(require("./routes/ai.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const file_routes_1 = __importDefault(require("./routes/file.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const search_routes_1 = __importDefault(require("./routes/search.routes"));
const assignment_routes_1 = __importDefault(require("./routes/assignment.routes"));
// Import middleware
const error_middleware_1 = require("./middleware/error.middleware");
const notFound_middleware_1 = require("./middleware/notFound.middleware");
const tenant_middleware_1 = require("./middleware/tenant.middleware");
class App {
    app;
    server;
    io;
    constructor() {
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: config_1.config.corsOrigins,
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
        this.initializeSocketIO();
    }
    initializeMiddleware() {
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
                    connectSrc: ["'self'", 'wss:', 'https:'],
                    fontSrc: ["'self'", 'https:', 'data:'],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'", 'https:', 'blob:'],
                    frameSrc: ["'self'", 'https:'],
                },
            },
            crossOriginEmbedderPolicy: false,
        }));
        // CORS
        this.app.use((0, cors_1.default)({
            origin: config_1.config.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Requested-With'],
        }));
        // Rate limiting
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: config_1.config.rateLimitWindow,
            max: config_1.config.rateLimitMax,
            message: { error: 'Too many requests, please try again later.' },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);
        // Compression
        this.app.use((0, compression_1.default)());
        // Body parsing
        this.app.use(express_1.default.json({ limit: '50mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
        // Cookies
        this.app.use((0, cookie_parser_1.default)());
        // Logging
        this.app.use((0, morgan_1.default)('combined', {
            stream: { write: (message) => logger_1.logger.info(message.trim()) },
        }));
        // Tenant middleware
        this.app.use(tenant_middleware_1.tenantMiddleware);
        // Health check
        this.app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            });
        });
    }
    initializeRoutes() {
        const apiRouter = express_1.default.Router();
        // Public routes
        apiRouter.use('/auth', auth_routes_1.default);
        // Protected routes
        apiRouter.use('/users', user_routes_1.default);
        apiRouter.use('/organizations', organization_routes_1.default);
        apiRouter.use('/courses', course_routes_1.default);
        apiRouter.use('/modules', module_routes_1.default);
        apiRouter.use('/lessons', lesson_routes_1.default);
        apiRouter.use('/contents', content_routes_1.default);
        apiRouter.use('/quizzes', quiz_routes_1.default);
        apiRouter.use('/attempts', attempt_routes_1.default);
        apiRouter.use('/badges', badge_routes_1.default);
        apiRouter.use('/certificates', certificate_routes_1.default);
        apiRouter.use('/chat', chat_routes_1.default);
        apiRouter.use('/live-sessions', live_session_routes_1.default);
        apiRouter.use('/notifications', notification_routes_1.default);
        apiRouter.use('/blog', blog_routes_1.default);
        apiRouter.use('/ai', ai_routes_1.default);
        apiRouter.use('/analytics', analytics_routes_1.default);
        apiRouter.use('/reports', report_routes_1.default);
        apiRouter.use('/files', file_routes_1.default);
        apiRouter.use('/webhooks', webhook_routes_1.default);
        apiRouter.use('/search', search_routes_1.default);
        apiRouter.use('/assignments', assignment_routes_1.default);
        this.app.use('/api/v1', apiRouter);
        // Static files for uploads
        this.app.use('/uploads', express_1.default.static(config_1.config.uploadDir));
    }
    initializeErrorHandling() {
        this.app.use(notFound_middleware_1.notFoundHandler);
        this.app.use(error_middleware_1.errorHandler);
    }
    initializeSocketIO() {
        (0, socket_1.setupSocketIO)(this.io);
    }
    async start() {
        try {
            // Initialize database connection
            await database_service_1.DatabaseService.initialize();
            logger_1.logger.info('Database connected successfully');
            // Start server
            this.server.listen(config_1.config.port, () => {
                logger_1.logger.info(`🚀 Server running on http://${config_1.config.host}:${config_1.config.port}`);
                logger_1.logger.info(`📚 API documentation available at http://${config_1.config.host}:${config_1.config.port}/api/v1`);
                logger_1.logger.info(`🔌 Socket.IO ready for connections`);
            });
            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown());
            process.on('SIGINT', () => this.shutdown());
        }
        catch (error) {
            logger_1.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }
    async shutdown() {
        logger_1.logger.info('Shutting down gracefully...');
        this.io.close();
        this.server.close(async () => {
            await database_service_1.DatabaseService.close();
            logger_1.logger.info('Server closed');
            process.exit(0);
        });
        // Force close after 10 seconds
        setTimeout(() => {
            logger_1.logger.error('Forced shutdown');
            process.exit(1);
        }, 10000);
    }
}
const app = new App();
app.start();
exports.default = app;
//# sourceMappingURL=index.js.map