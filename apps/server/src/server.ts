import http from 'node:http';
import { Server } from 'socket.io';
import type { Express } from 'express';
import { createApp } from './app';
import type { Authenticator } from './auth/authenticator';
import type { AppConfig } from './config';
import { createModeration } from './game/moderation';
import { RepositoryResultsSink, SessionManager } from './game/SessionManager';
import type { Logger } from './logger';
import { FailureLimiter } from './net';
import { attachRealtime, type QuizIoServer } from './realtime/gateway';
import type { Repositories } from './repositories/types';

export interface ServerDeps {
  config: AppConfig;
  logger: Logger;
  auth: Authenticator;
  repos: Repositories;
  staticDir: string | null;
  countdownMs?: number;
}

export interface PowerQuizServer {
  app: Express;
  httpServer: http.Server;
  io: QuizIoServer;
  manager: SessionManager;
  close(): Promise<void>;
}

/** Wrong PIN lookups allowed per client IP and minute. Generous because venues share one public IP. */
export const PIN_FAILURES_PER_MINUTE = 60;

export function createPowerQuizServer(deps: ServerDeps): PowerQuizServer {
  const manager = new SessionManager({
    sink: new RepositoryResultsSink(deps.repos.sessions, deps.config.resultTtlSeconds),
    moderation: createModeration(),
    logger: deps.logger,
    countdownMs: deps.countdownMs,
  });
  const pinLimiter = new FailureLimiter(PIN_FAILURES_PER_MINUTE, 60_000);
  const app = createApp({ ...deps, manager, pinLimiter });
  const httpServer = http.createServer(app);
  const io: QuizIoServer = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });
  attachRealtime(io, {
    manager,
    auth: deps.auth,
    logger: deps.logger,
    pinLimiter,
    trustProxy: deps.config.trustProxy,
  });
  const stopSweeper = manager.startSweeper();

  return {
    app,
    httpServer,
    io,
    manager,
    async close() {
      stopSweeper();
      await manager.shutdown();
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    },
  };
}
