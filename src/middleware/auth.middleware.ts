import type { NextFunction, Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { getAuth } from '../config/auth';
import { ApiError } from '../utils/api-error';
import type { AuthUser } from '../types/domain';

/** Rejects unauthenticated requests with 401 and exposes the user to controllers. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    throw ApiError.unauthorized('Please sign in to continue.');
  }

  const user: AuthUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    createdAt: new Date(session.user.createdAt),
  };
  res.locals.user = user;
  next();
}

/** The user set by `requireAuth`. Only call from routes behind that middleware. */
export function currentUser(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}
