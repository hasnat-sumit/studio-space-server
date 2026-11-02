/** Shared API types. Keep route/controller-specific types next to their code. */

/** Error body produced by the centralized error handler. */
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string;
  details?: unknown;
}

export type DatabaseStatus = 'connected' | 'disconnected';

/** Response body for GET /api/health. */
export interface HealthPayload {
  status: 'ok';
  service: string;
  message: string;
  timestamp: string;
  /** Seconds since the process started. */
  uptime: number;
  environment: string;
  database: {
    status: DatabaseStatus;
    name: string;
  };
}
