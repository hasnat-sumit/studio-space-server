import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import type { Db } from 'mongodb';
import env from './env';
import { getDatabase } from './database';

function createAuth(db: Db) {
  const isProduction = env.NODE_ENV === 'production';

  return betterAuth({
    appName: 'StudioSpace',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.CLIENT_URL],
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    // The client and API live on different sites in production, so the session
    // cookie must be sent cross-site there. On localhost they are same-site.
    advanced: isProduction
      ? { defaultCookieAttributes: { sameSite: 'none', secure: true } }
      : undefined,
  });
}

let instance: ReturnType<typeof createAuth> | null = null;

/**
 * Better Auth needs a live `Db`, which only exists after `connectDatabase()`,
 * so the instance is created on first use (behind the `ensureDatabase` guard).
 */
export function getAuth(): ReturnType<typeof createAuth> {
  if (!instance) instance = createAuth(getDatabase());
  return instance;
}
