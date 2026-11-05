import env from './env';

const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

/**
 * Next.js moves to another port when 3000 is busy, so development accepts any
 * localhost port. Everywhere else, only `CLIENT_URL` is allowed.
 */
export function isAllowedOrigin(origin: string, nodeEnv: string = env.NODE_ENV): boolean {
  return origin === env.CLIENT_URL || (nodeEnv === 'development' && LOCALHOST_ORIGIN.test(origin));
}

/** The same rule, in the form Better Auth's `trustedOrigins` expects. */
export function trustedOrigins(nodeEnv: string = env.NODE_ENV): string[] {
  return nodeEnv === 'development' ? [env.CLIENT_URL, 'http://localhost:*'] : [env.CLIENT_URL];
}
