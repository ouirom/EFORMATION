import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from './logger';

export const sentryEnabled = !!config.sentryDsn;

/** Call once, as early as possible in the process, before anything that might throw. */
export function initSentry(): void {
  if (!sentryEnabled) return;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    tracesSampleRate: 0.1,
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    Sentry.captureException(err);
    // An uncaught exception leaves the process in an undefined state -- log/report
    // then exit, rather than keep serving requests on a possibly-corrupted process.
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
    Sentry.captureException(reason);
  });
}

export function captureException(err: unknown): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err);
}
