import path from 'node:path';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { pinSchema, type ClientConfig, type ErrorCode } from '@power-quiz/shared';
import { requireAuth, currentUser, type Authenticator } from './auth/authenticator';
import type { AppConfig } from './config';
import { SessionError } from './game/LiveSession';
import type { SessionManager } from './game/SessionManager';
import type { Logger } from './logger';
import { clientIp, type FailureLimiter } from './net';
import type { Repositories } from './repositories/types';
import { quizRoutes } from './routes/quizzes';
import { sessionRoutes } from './routes/sessions';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  auth: Authenticator;
  repos: Repositories;
  manager: SessionManager;
  pinLimiter: FailureLimiter;
  staticDir: string | null;
}

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  INVALID: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  FULL: 429,
  RATE_LIMITED: 429,
};

export function clientConfig(config: AppConfig): ClientConfig {
  if (config.auth.mode !== 'entra') return { authMode: config.auth.mode, entra: null };
  return {
    authMode: 'entra',
    entra: {
      clientId: config.auth.clientId,
      tenantId: config.auth.tenantId,
      scope: `api://${config.auth.clientId}/${config.auth.scopeName}`,
    },
  };
}

export function createApp(deps: AppDeps): Express {
  const { config, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'https://login.microsoftonline.com'],
          frameSrc: ['https://login.microsoftonline.com'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.env === 'production' ? [] : null,
        },
      },
    }),
  );
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/config', (_req, res) => {
    res.json(clientConfig(config));
  });

  app.get('/api/live/:pin', (req, res) => {
    const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, config.trustProxy);
    if (deps.pinLimiter.isLimited(ip)) {
      res.status(429).json({ error: 'Too many wrong PINs. Please wait a minute and try again.' });
      return;
    }
    const pin = pinSchema.safeParse(req.params.pin);
    const session = pin.success ? deps.manager.getByPin(pin.data) : undefined;
    if (!session) {
      deps.pinLimiter.recordFailure(ip);
      res.status(404).json({ error: 'No race found with that PIN.' });
      return;
    }
    res.json(session.joinInfo());
  });

  const api = express.Router();
  api.use(requireAuth(deps.auth));
  api.get('/me', (_req, res) => {
    res.json(currentUser(res));
  });
  api.use('/quizzes', quizRoutes(deps.repos));
  api.use('/sessions', sessionRoutes(deps.repos, deps.manager));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.use('/api', api);

  const staticDir = deps.staticDir;
  if (staticDir) {
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Single-page app: every other GET renders index.html and the client router takes over.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      // `root` keeps the dot-file check to the file name (the app may live under e.g. `.deploy/`).
      res.sendFile('index.html', { root: staticDir });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Please check your input.',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
      return;
    }
    if (error instanceof SessionError) {
      res.status(STATUS_BY_CODE[error.code] ?? 409).json({ error: error.message, code: error.code });
      return;
    }
    const type = (error as { type?: unknown } | null)?.type;
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON body.' });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    const status = (error as { status?: unknown; statusCode?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ error: status === 404 ? 'Not found.' : 'Bad request.' });
      return;
    }
    logger.error({ err: error }, 'Unhandled request error');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(errorHandler);

  return app;
}
