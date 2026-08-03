import 'reflect-metadata';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import configurations
import { config } from './config';
import { logger } from './utils/logger';
import { DatabaseService } from './services/database.service';
import { setupSocketIO } from './socket';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import organizationRoutes from './routes/organization.routes';
import courseRoutes from './routes/course.routes';
import moduleRoutes from './routes/module.routes';
import lessonRoutes from './routes/lesson.routes';
import contentRoutes from './routes/content.routes';
import quizRoutes from './routes/quiz.routes';
import attemptRoutes from './routes/attempt.routes';
import badgeRoutes from './routes/badge.routes';
import certificateRoutes from './routes/certificate.routes';
import chatRoutes from './routes/chat.routes';
import liveSessionRoutes from './routes/live-session.routes';
import notificationRoutes from './routes/notification.routes';
import blogRoutes from './routes/blog.routes';
import aiRoutes from './routes/ai.routes';
import analyticsRoutes from './routes/analytics.routes';
import reportRoutes from './routes/report.routes';
import fileRoutes from './routes/file.routes';
import webhookRoutes from './routes/webhook.routes';
import searchRoutes from './routes/search.routes';
import assignmentRoutes from './routes/assignment.routes';
import settingsRoutes from './routes/settings.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { tenantMiddleware } from './middleware/tenant.middleware';

class App {
  public app: Application;
  public server: ReturnType<typeof createServer>;
  public io: SocketServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketServer(this.server, {
      cors: {
        origin: config.corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeSocketIO();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
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
    this.app.use(cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Requested-With'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimitWindow,
      max: config.rateLimitMax,
      message: { error: 'Too many requests, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Cookies
    this.app.use(cookieParser());

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
    }));

    // Tenant middleware
    this.app.use(tenantMiddleware);

    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
  }

  private initializeRoutes(): void {
    const apiRouter = express.Router();

    // Public routes
    apiRouter.use('/auth', authRoutes);

    // Protected routes
    apiRouter.use('/users', userRoutes);
    apiRouter.use('/organizations', organizationRoutes);
    apiRouter.use('/courses', courseRoutes);
    apiRouter.use('/modules', moduleRoutes);
    apiRouter.use('/lessons', lessonRoutes);
    apiRouter.use('/contents', contentRoutes);
    apiRouter.use('/quizzes', quizRoutes);
    apiRouter.use('/attempts', attemptRoutes);
    apiRouter.use('/badges', badgeRoutes);
    apiRouter.use('/certificates', certificateRoutes);
    apiRouter.use('/chat', chatRoutes);
    apiRouter.use('/live-sessions', liveSessionRoutes);
    apiRouter.use('/notifications', notificationRoutes);
    apiRouter.use('/blog', blogRoutes);
    apiRouter.use('/ai', aiRoutes);
    apiRouter.use('/analytics', analyticsRoutes);
    apiRouter.use('/reports', reportRoutes);
    apiRouter.use('/files', fileRoutes);
    apiRouter.use('/webhooks', webhookRoutes);
    apiRouter.use('/search', searchRoutes);
    apiRouter.use('/assignments', assignmentRoutes);
    apiRouter.use('/settings', settingsRoutes);

    this.app.use('/api/v1', apiRouter);

    // Static files for uploads
    this.app.use('/uploads', express.static(config.uploadDir));
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private initializeSocketIO(): void {
    setupSocketIO(this.io);
  }

  public async start(): Promise<void> {
    try {
      // Initialize database connection
      await DatabaseService.initialize();
      logger.info('Database connected successfully');

      // Start server
      this.server.listen(config.port, () => {
        logger.info(`🚀 Server running on http://${config.host}:${config.port}`);
        logger.info(`📚 API documentation available at http://${config.host}:${config.port}/api/v1`);
        logger.info(`🔌 Socket.IO ready for connections`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down gracefully...');
    
    this.io.close();
    this.server.close(async () => {
      await DatabaseService.close();
      logger.info('Server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, 10000);
  }
}

const app = new App();
app.start();

export default app;
