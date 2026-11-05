import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from 'mongodb';
import env from './env';
import { getDatabase } from './database';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../validators/password';

/** Better Auth routes that set a password, and the body field that carries it. */
const PASSWORD_FIELDS: Record<string, string> = {
  '/sign-up/email': 'password',
  '/change-password': 'newPassword',
};

/**
 * Better Auth is ESM-only and this project is CommonJS. Vercel's runtime rejects
 * `require()` of an ES module, so it must only be loaded through `import()` here:
 * a static import elsewhere compiles to `require()` and crashes the deployment.
 */
async function createAuth(db: Db) {
  const [{ betterAuth }, { mongodbAdapter }, { APIError, createAuthMiddleware }] =
    await Promise.all([
      import('better-auth'),
      import('better-auth/adapters/mongodb'),
      import('better-auth/api'),
    ]);

  return betterAuth({
    appName: 'StudioSpace',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.CLIENT_URL],
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // New accounts go to the login page rather than straight into a session.
      autoSignIn: false,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const field = PASSWORD_FIELDS[ctx.path];
        if (!field) return;
        const problem = passwordProblem((ctx.body as Record<string, unknown> | undefined)?.[field]);
        if (problem) throw new APIError('BAD_REQUEST', { message: problem });

        // With autoSignIn off, Better Auth answers a duplicate sign-up with a fake
        // success, which would tell the user to log in to an account they don't own.
        if (ctx.path === '/sign-up/email') {
          const email = (ctx.body as { email?: unknown }).email;
          const existing =
            typeof email === 'string'
              ? await ctx.context.internalAdapter.findUserByEmail(email.toLowerCase())
              : null;
          if (existing) {
            throw new APIError('UNPROCESSABLE_ENTITY', {
              message: 'An account with this email already exists. Log in instead.',
            });
          }
        }
      }),
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
