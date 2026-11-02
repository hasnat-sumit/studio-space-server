import app from './app';
import env from './config/env';
import { closeDatabase, connectDatabase } from './config/database';
import logger from './utils/logger';

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
  } catch (error) {
    // Non-fatal: the API still serves traffic and reports db status via /api/health.
    logger.warn(
      'MongoDB connection failed - starting without a database connection.',
      error instanceof Error ? error.message : error,
    );
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`StudioSpace API listening on http://localhost:${env.PORT}`);
    logger.info(`Health check: http://localhost:${env.PORT}/api/health`);
    logger.info(`Allowed origin: ${env.CLIENT_URL}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`${signal} received - shutting down gracefully`);
    server.close(async () => {
      try {
        await closeDatabase();
      } catch (error) {
        logger.error('Error while closing the database connection', error);
      }
      process.exit(0);
    });

    // Do not hang forever on open keep-alive connections.
    setTimeout(() => {
      logger.error('Forced shutdown: timed out waiting for open connections');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
}

void startServer();
