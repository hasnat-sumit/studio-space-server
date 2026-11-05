import type { NextFunction, Request, Response } from 'express';
import { getAuth, toAuthHeaders } from '../config/auth';
import { ApiError } from '../utils/api-error';
import type { AuthUser } from '../types/domain';

/** Rejects unauthenticated requests with 401 and exposes the user to controllers. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = await getAuth();
  const { headers, response: session } = await auth.api.getSession({
    headers: await toAuthHeaders(req.headers),
    returnHeaders: true,
  });

  // Passes on the refreshed JWT cookie when the previous one has expired.
  for (const cookie of headers.getSetCookie()) res.append('Set-Cookie', cookie);

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
