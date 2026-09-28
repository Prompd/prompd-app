/* Identity settings for Clerk session-token verification.
 *
 * Functions, not constants: ESM imports are evaluated before server.js runs
 * dotenv.config(), so an import-time read would miss a value that only lives
 * in .env. Every caller reads them when it verifies.
 *
 * Env var names match corenel-api (CLERK_FRONTEND_API). CLERK_AUTHORIZED_PARTIES
 * is new: a comma-separated list of the browser origins whose Clerk session
 * tokens this API accepts (the token's `azp` claim). */

const DEV_CLERK_FRONTEND_API = 'decent-bird-33.clerk.accounts.dev'

/** The Clerk Frontend API host (no scheme). Defaults to the dev instance;
 * production must set CLERK_FRONTEND_API. */
export function clerkFrontendApi(env = process.env) {
  const raw = (env.CLERK_FRONTEND_API || DEV_CLERK_FRONTEND_API).trim()
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

/** The exact `iss` a Clerk session token from our instance carries. */
export function clerkIssuer(env = process.env) {
  return `https://${clerkFrontendApi(env)}`
}

/** Allowed `azp` values (origins). Empty means "not configured". */
export function authorizedParties(env = process.env) {
  const raw = env.CLERK_AUTHORIZED_PARTIES
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}
