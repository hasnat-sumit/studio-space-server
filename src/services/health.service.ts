import env from '../config/env';
import { isDatabaseConnected } from '../config/database';
import type { HealthPayload } from '../types';

/** Builds the health report consumed by GET /api/health. */
export function buildHealthReport(): HealthPayload {
  return {
    status: 'ok',
    service: 'studiospace-server',
    message: 'StudioSpace API is running',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
    database: {
      status: isDatabaseConnected() ? 'connected' : 'disconnected',
      name: env.DB_NAME,
    },
  };
}
