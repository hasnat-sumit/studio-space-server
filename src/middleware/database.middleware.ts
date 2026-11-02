import type { NextFunction, Request, Response } from 'express';
import { connectDatabase } from '../config/database';
import { ensureIndexes } from '../config/indexes';
import { ApiError } from '../utils/api-error';
import logger from '../utils/logger';

/**
 * A failed boot connection is non-fatal, so data routes (re)connect here and
 * answer 503 instead of crashing while MongoDB is unavailable.
 */
export async function ensureDatabase(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await connectDatabase();
    await ensureIndexes();
  } catch (error) {
    logger.warn('Database unavailable', error instanceof Error ? error.message : error);
    throw new ApiError(503, 'The database is temporarily unavailable. Please try again shortly.');
  }
  next();
}
