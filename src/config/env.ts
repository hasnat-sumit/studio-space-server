import { config } from 'dotenv';

config();

/**
 * Central place for every environment variable.
 * Never read `process.env` anywhere else in the codebase.
 */

const REQUIRED_IN_PRODUCTION = ['MONGODB_URI', 'BETTER_AUTH_SECRET'] as const;

function readString(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function readPort(key: string, fallback: number): number {
  const raw = readString(key);
  if (raw === '') return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid ${key}="${raw}": expected a number between 1 and 65535.`);
  }
  return parsed;
}

function assertRequiredEnv(): void {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => readString(key) === '');
  if (missing.length === 0) return;

  const message =
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Copy .env.example to .env and provide a value.';

  // Fail fast in production; warn (and keep serving) during local development.
  if (readString('NODE_ENV', 'development') === 'production') {
    throw new Error(message);
  }
  // eslint-disable-next-line no-console -- intentional startup warning
  console.warn(`[env] WARNING: ${message}`);
}

assertRequiredEnv();

const env = {
  NODE_ENV: readString('NODE_ENV', 'development'),
  PORT: readPort('PORT', 5000),
  MONGODB_URI: readString('MONGODB_URI'),
  DB_NAME: readString('DB_NAME', 'studiospace'),
  CLIENT_URL: readString('CLIENT_URL', 'http://localhost:3000'),
  BETTER_AUTH_SECRET: readString('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: readString('BETTER_AUTH_URL', 'http://localhost:5000'),
  GOOGLE_CLIENT_ID: readString('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: readString('GOOGLE_CLIENT_SECRET'),
  LOG_LEVEL: readString('LOG_LEVEL', 'info'),
} as const;

export type AppEnv = typeof env;

export default env;
