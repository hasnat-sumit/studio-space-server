import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import logger from '../utils/logger';
import type { ApiErrorBody } from '../types';

/** Turns unmatched routes into a 404 ApiError handled centrally. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

interface HttpErrorLike {
  status?: number;
  statusCode?: number;
}

function hasHttpStatus(error: unknown): error is Error & HttpErrorLike {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as HttpErrorLike;
  return typeof candidate.status === 'number' || typeof candidate.statusCode === 'number';
}

/** Map any thrown value onto an ApiError with a safe, client-facing message. */
function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  // Mongoose/driver duplicate key -> conflict.
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    return ApiError.conflict('Duplicate value for a unique field.', {
      keyValue: (error as { keyValue?: unknown }).keyValue,
    });
  }

  // Body-parser / http-errors (invalid JSON, payload too large, ...).
  if (hasHttpStatus(error)) {
    const status = error.status ?? error.statusCode ?? 400;
    if (status >= 400 && status < 500) {
      return new ApiError(status, error.message || 'Invalid request', { cause: error });
    }
  }

  if (error instanceof Error) {
    logger.error('Unhandled error', error.stack ?? error.message);
    return ApiError.internal('Internal server error', error);
  }

  logger.error('Unhandled non-Error value', error);
  return ApiError.internal('Internal server error', error);
}

/** Centralized error handler - always responds with the ApiErrorBody shape. */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = normalizeError(error);
  const label = `${req.method} ${req.originalUrl} -> ${apiError.statusCode}`;

  if (apiError.statusCode >= 500) {
    logger.error(`${label} ${apiError.message}`, apiError.cause ?? '');
  } else {
    logger.warn(`${label} ${apiError.message}`);
  }

  const body: ApiErrorBody = {
    success: false,
    statusCode: apiError.statusCode,
    // Never leak internal/programming error details to clients.
    message: apiError.isOperational ? apiError.message : 'Internal server error',
  };
  if (apiError.isOperational && apiError.details !== undefined) {
    body.details = apiError.details;
  }

  res.status(apiError.statusCode).json(body);
}
