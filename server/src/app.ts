 import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';
import routes from './routes';
import adminRoutes from './routes/admin';
import platformRoutes from './routes/platform';
import billingEngineRoutes from './routes/billing.routes';
import cookieParser from 'cookie-parser';
import { testConnection } from './config/database';
import { runMigrations } from './config/migrate';
import { scheduleDailyCron } from './cron/subscriptionCleanup';
import { scheduleSubscriptionEnforcement } from './cron/subscriptionEnforcement';
import { scheduleAutoBackups } from './cron/autoBackup';
import { globalRateLimit } from './middleware/rateLimit';
import { responseTimeMetrics, healthCheck } from './middleware/metrics';
import { tenantMiddleware } from './middleware/tenant';
import { initRealtimeServer } from './services/realtime';
import { globalErrorHandler } from './middleware/errorHandler';
import logger from './config/logger';

dotenv.config();

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DATABASE_URL', 'QR_SECRET_SALT'] as const;
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Reject known development secrets in production
if (process.env.NODE_ENV === 'production') {
  const JWT_SECRET = process.env.JWT_SECRET || '';
  if (JWT_SECRET.length < 32 || JWT_SECRET.startsWith('gymcore-dev-') || JWT_SECRET.includes('dev-jwt-secret')) {
    logger.error('Production environment detected with weak/development JWT_SECRET. Set a strong, unique secret.');
    process.exit(1);
  }
}

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 0.2,
  enabled: !!process.env.SENTRY_DSN,
});

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(Sentry.Handlers.requestHandler());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com"],
      connectSrc: ["'self'", process.env.CORS_ORIGIN || ''].filter(Boolean),
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : '*'),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
}));

app.use(cookieParser());
app.use(globalRateLimit);
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    // Needed by middleware/webhookAuth.ts: HMAC signature verification must
    // run over the exact raw bytes the sender signed, not a re-serialized
    // JSON.stringify(parsedBody) — those can differ (key order, whitespace,
    // number formatting) and would make every legitimate signature "invalid".
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', requestId);
  (req as any).requestId = requestId;
  next();
});

app.use(responseTimeMetrics);
app.use(tenantMiddleware);

app.use('/api/v1', routes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/platform', platformRoutes);
app.use('/api/v1/platform/billing-engine', billingEngineRoutes);

// The main router already declares its public auth routes at /auth/* and its
// tenant API routes at /api/*. Mount it at the root so those paths resolve as
// /auth/login and /api/settings (instead of accidentally becoming /api/api/*).
app.use(routes);

// Legacy routes for backward compatibility (can be removed after full migration)
app.use('/admin', adminRoutes);
app.use('/platform', platformRoutes);
app.use('/platform/billing-engine', billingEngineRoutes);

// Serve uploaded files (gym logos etc.)
app.use('/uploads', express.static('uploads', { maxAge: '30d' }));

// Health check (overrides the simple one in routes)
app.get('/health', healthCheck);

app.use(Sentry.Handlers.errorHandler());

// Unified, typed error handler — returns consistent JSON for all error types
// and never leaks stack traces in production.
app.use(globalErrorHandler);

async function start() {
  const dbConnected = await testConnection();

  if (!dbConnected) {
    logger.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }

  await runMigrations();
  scheduleDailyCron();
  scheduleSubscriptionEnforcement();
  scheduleAutoBackups();

  // HTTP server (required for graceful shutdown)
  const httpServer = http.createServer(app);

  // Realtime WebSocket server for reception screen QR updates
  // Note: EADDRINUSE is handled async by wss 'error' event (not thrown synchronously)
  const WS_PORT = parseInt(process.env.WS_PORT || '4001', 10);
  const wss = initRealtimeServer(WS_PORT);

  // Mobile WebSocket endpoint — attached to the main HTTP server
  // The mobile app connects to ws://host/ws?token=<member_jwt>
  const mobileWsClients = new Set<WebSocket>();
  const memberConnections = new Map<string, Set<WebSocket>>();

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        member_id?: string;
        gym_id?: string;
        role?: string;
      };

      if (!decoded.member_id || decoded.role !== 'member') {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      const ws = new (WebSocket as any)(socket, head, { maxPayload: 64 * 1024 }) as WebSocket;
      mobileWsClients.add(ws);

      // Track by member for targeted pushes
      const memberKey = `${decoded.gym_id}:${decoded.member_id}`;
      if (!memberConnections.has(memberKey)) {
        memberConnections.set(memberKey, new Set());
      }
      memberConnections.get(memberKey)!.add(ws);

      logger.info('Mobile WS connected', {
        memberId: decoded.member_id,
        gymId: decoded.gym_id,
        totalConnections: mobileWsClients.size,
      });

      ws.on('close', () => {
        mobileWsClients.delete(ws);
        memberConnections.get(memberKey)?.delete(ws);
        if (memberConnections.get(memberKey)?.size === 0) {
          memberConnections.delete(memberKey);
        }
        logger.debug('Mobile WS disconnected', { memberKey });
      });

      ws.on('error', (err) => {
        logger.error('Mobile WS error', { memberKey, error: err.message });
        mobileWsClients.delete(ws);
        memberConnections.get(memberKey)?.delete(ws);
      });

      ws.send(JSON.stringify({ type: 'connected', message: 'Mobile WebSocket connected' }));
    } catch (err: any) {
      logger.error('Mobile WS upgrade failed', { error: err.message });
      socket.destroy();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`GymCore SaaS Backend running`, { port: PORT, env: process.env.NODE_ENV || 'development' });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down gracefully...');
    if (wss) wss.close();
    for (const ws of mobileWsClients) {
      ws.close(1001, 'Server shutting down');
    }
    mobileWsClients.clear();
    memberConnections.clear();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Don't auto-start in test mode — each test file is responsible for setup
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error('Server failed to start', { error: (err as Error).message });
    process.exit(1);
  });
}

export default app;

