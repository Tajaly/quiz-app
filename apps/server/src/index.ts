import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDevAuthenticator,
  createEntraAuthenticator,
  createGuestAuthenticator,
} from './auth/authenticator';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createCosmosRepositories } from './repositories/cosmos';
import { createInMemoryRepositories } from './repositories/memory';
import { createPowerQuizServer } from './server';

function resolveStaticDir(configured: string | null): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = configured
    ? [path.resolve(configured)]
    : [path.join(here, 'public'), path.resolve(here, '../../web/dist')];
  return candidates.find((dir) => existsSync(path.join(dir, 'index.html'))) ?? null;
}

const config = loadConfig();
const logger = await createLogger(config);

const repos = config.cosmos ? await createCosmosRepositories(config.cosmos) : createInMemoryRepositories();
if (!config.cosmos)
  logger.warn('COSMOS_ENDPOINT is not set: using in-memory storage (data is lost on restart).');

const auth =
  config.auth.mode === 'entra'
    ? createEntraAuthenticator(config.auth)
    : config.auth.mode === 'guest'
      ? createGuestAuthenticator()
      : createDevAuthenticator();
if (auth.mode === 'dev')
  logger.warn('Using DEV sign-in without real authentication. Never use this in production.');

const staticDir = resolveStaticDir(config.staticDir);
if (!staticDir) logger.info('No web build found: serving the API only (use the Vite dev server for the UI).');

const server = createPowerQuizServer({ config, logger, auth, repos, staticDir });
server.httpServer.listen(config.port, () => {
  logger.info(
    { port: config.port, auth: auth.mode, storage: config.cosmos ? 'cosmos' : 'memory' },
    'Power Quiz is running',
  );
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    },
  );
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
