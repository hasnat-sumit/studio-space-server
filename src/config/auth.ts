import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from 'mongodb';
import env from './env';
import { getDatabase } from './database';

/**
 * Better Auth is ESM-only and this project is CommonJS. Vercel's runtime rejects
 * `require()` of an ES module, so it must only be loaded through `import()` here:
 * a static import elsewhere compiles to `require()` and crashes the deployment.
 */
async function createAuth(db: Db) {
  const [{ betterAuth }, { mongodbAdapter }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/mongodb'),
  ]);
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
    // Optional: without credentials the provider stays off and email sign-in still works.
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              prompt: 'select_account',
            },
          }
        : undefined,
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

/** Converts Node request headers into the `Headers` that Better Auth's API expects. */
export async function toAuthHeaders(headers: IncomingHttpHeaders): Promise<Headers> {
  const { fromNodeHeaders } = await import('better-auth/node');
  return fromNodeHeaders(headers);
}

/** Lets Better Auth answer a request to its `/api/auth` routes. */
export async function handleAuthRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const [{ toNodeHandler }, auth] = await Promise.all([import('better-auth/node'), getAuth()]);
  await toNodeHandler(auth)(req, res);
}
