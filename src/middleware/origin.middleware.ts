import type { NextFunction, Request, Response } from 'express';
import env from '../config/env';
import { ApiError } from '../utils/api-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard. Session cookies are `SameSite=None` in production, and a plain HTML
 * form can POST here without triggering a CORS preflight, so CORS alone doesn't
 * stop a hostile site acting as the signed-in user. Browsers always send `Origin`
 * on cross-site writes; requests without one aren't from a browser form.
 */
export function rejectForeignOrigins(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (!SAFE_METHODS.has(req.method) && origin && origin !== env.CLIENT_URL) {
    throw ApiError.forbidden('Cross-site requests are not allowed.');
  }
  next();
}
