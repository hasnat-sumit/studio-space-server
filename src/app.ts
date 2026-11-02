import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { getAuth } from './config/auth';
import env from './config/env';
import apiRouter from './routes';
import { ensureDatabase } from './middleware/database.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { rejectForeignOrigins } from './middleware/origin.middleware';

/**
 * Express application setup only: middleware, routes, error handling.
 * Bootstrap/shutdown logic lives in server.ts.
 */
const app = express();

app.disable('x-powered-by');

// CORS: only the configured client origin may call this API.
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Better Auth reads the raw request body, so it must be mounted before the parsers.
app.all('/api/auth/{*splat}', rejectForeignOrigins, ensureDatabase, (req, res) =>
  toNodeHandler(getAuth())(req, res),
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Routes
app.use('/api', rejectForeignOrigins, apiRouter);

// 404 for unmatched routes, then centralized error handling (must be last).
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
