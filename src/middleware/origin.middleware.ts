import type { NextFunction, Request, Response } from 'express';
import { isAllowedOrigin } from '../config/origins';
import { ApiError } from '../utils/api-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard, on top of `SameSite=Lax` session cookies. A plain HTML form can POST
 * here without triggering a CORS preflight, so CORS alone doesn't stop a hostile
 * site. Browsers always send `Origin` on cross-site writes; requests without one
 * aren't from a browser form.
 */
export function rejectForeignOrigins(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (!SAFE_METHODS.has(req.method) && origin && !isAllowedOrigin(origin)) {
    throw ApiError.forbidden('Cross-site requests are not allowed.');
  }
  next();
}
