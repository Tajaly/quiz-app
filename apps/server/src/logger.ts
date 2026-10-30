import { pino, type Logger, type LoggerOptions } from 'pino';
import type { AppConfig } from './config';

export type { Logger };

/**
 * JSON logs everywhere except local development, where logs are pretty-printed in-process.
 * (pino's worker-thread transports deadlock under the tsx loader, and pino-pretty is not deployed.)
 */
export async function createLogger(config: Pick<AppConfig, 'env' | 'logLevel'>): Promise<Logger> {
  const options: LoggerOptions = {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };
  if (config.env !== 'development') return pino(options);
  try {
    const { default: pretty } = await import('pino-pretty');
    return pino(options, pretty({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }));
  } catch {
    return pino(options);
  }
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}
