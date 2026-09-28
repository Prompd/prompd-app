/* Clerk session-token verification, the ONE way this API verifies a Clerk JWT.
 * Ported from corenel-api's services/strictClerk.js and extended with the azp
 * allowlist.
 *
 * The previous middleware called jwt.verify(token, getKey, {}): signature and
 * expiry only. Any RS256 token signed by the shared Clerk instance -- issued to
 * another Clerk application or satellite -- was accepted, and the algorithm was
 * whatever the token header said.
 *
 * What is enforced here:
 *   - algorithms: ['RS256'] only, so an HS256 or alg:none token never passes.
 *   - issuer must equal https://<CLERK_FRONTEND_API> exactly.
 *   - azp, when CLERK_AUTHORIZED_PARTIES is set: a token that carries an azp
 *     must name one of the listed origins. A token with no azp is accepted
 *     (Clerk only stamps azp on tokens minted for a browser Origin), which is
 *     the same rule Clerk's own SDK applies for `authorizedParties`.
 *   - clockTolerance: 5 s of skew on exp/nbf, the allowance Clerk's SDK makes.
 *   - a non-empty string `sub`.
 *
 * When CLERK_AUTHORIZED_PARTIES is unset in production we log loudly (once)
 * and still enforce issuer + algorithm. */
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { clerkIssuer, authorizedParties as configuredParties } from '../config/identity.js'

/**
 * Verify a Clerk session token.
 *
 * @param {string} token
 * @param {{ issuer: string, getKey: Function, authorizedParties?: string[] }} opts
 * @returns {Promise<object>} the decoded payload
 */
export function verifyClerkStrict(token, { issuer, getKey, authorizedParties = [] }) {
  return new Promise((resolve, reject) => {
    if (typeof token !== 'string' || !token) {
      return reject(new jwt.JsonWebTokenError('jwt must be provided'))
    }
    jwt.verify(token, getKey, { issuer, algorithms: ['RS256'], clockTolerance: 5 }, (err, decoded) => {
      if (err) return reject(err)
      if (!decoded || typeof decoded !== 'object' || typeof decoded.sub !== 'string' || !decoded.sub) {
        return reject(new jwt.JsonWebTokenError('no subject'))
      }
      if (authorizedParties.length > 0 && decoded.azp !== undefined) {
        const azp = typeof decoded.azp === 'string' ? decoded.azp.replace(/\/+$/, '') : ''
        if (!authorizedParties.includes(azp)) {
          return reject(new jwt.JsonWebTokenError('azp not allowed'))
        }
      }
      resolve(decoded)
    })
  })
}

/* JWKS clients, one per issuer. jwks-rsa is lazy: constructing a client does no
 * I/O; the key set is fetched on first use and cached. */
const jwksClients = new Map()

function defaultGetKeyFor(issuer) {
  let client = jwksClients.get(issuer)
  if (!client) {
    client = jwksClient({
      jwksUri: `${issuer}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    })
    jwksClients.set(issuer, client)
  }
  return (header, cb) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) return cb(err)
      return cb(null, key.getPublicKey())
    })
  }
}

/* Test seam: replace how a signing key is found. Production never calls it. */
let keyResolverOverride = null
export function setSigningKeyResolverForTests(fn) {
  keyResolverOverride = typeof fn === 'function' ? fn : null
}

let warnedMissingParties = false
/** Log loudly (once) when production runs without an azp allowlist. Called at
 * startup and on first verification. */
export function warnIfAuthorizedPartiesMissing(env = process.env, parties = configuredParties(env)) {
  if (parties.length > 0 || warnedMissingParties) return
  if (env.NODE_ENV !== 'production') return
  warnedMissingParties = true
  console.error('[Auth] SECURITY WARNING: CLERK_AUTHORIZED_PARTIES is not set. Clerk tokens are verified for issuer and RS256 only; azp is NOT checked. Set CLERK_AUTHORIZED_PARTIES to the allowed browser origins.')
}

/**
 * Verify a Clerk session token against the configured instance: issuer from
 * CLERK_FRONTEND_API, azp allowlist from CLERK_AUTHORIZED_PARTIES.
 *
 * @param {string} token
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<object>} the decoded payload
 */
export function verifyClerkToken(token, env = process.env) {
  const issuer = clerkIssuer(env)
  const parties = configuredParties(env)
  warnIfAuthorizedPartiesMissing(env, parties)
  const getKey = keyResolverOverride || defaultGetKeyFor(issuer)
  return verifyClerkStrict(token, { issuer, getKey, authorizedParties: parties })
}
