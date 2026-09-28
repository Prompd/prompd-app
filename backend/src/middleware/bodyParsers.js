/* Request body parsing, with small ceilings on the routes anyone can reach
 * without authenticating. (Pattern ported from corenel-api's bodyParsers.js.)
 *
 * The app parses JSON and urlencoded bodies up to 50mb. That ceiling is for
 * authenticated compile/execute requests that carry file content; applied to
 * an unauthenticated route it lets anyone make the process buffer and parse
 * 50mb per request. body-parser flags a request as parsed (req._body) the
 * first time any parser runs, and later parsers silently no-op -- so a smaller
 * ceiling on a route only takes effect if EVERY app-level parser skips that
 * route. Hence one list: the route's own small parser is installed ahead of
 * the app-level parsers, and both app-level parsers are wrapped to skip it.
 *
 * The webhook trigger is also why this matters for correctness: it verifies an
 * HMAC over the RAW body, which the app-level JSON parser used to consume
 * first, leaving it an object. */
import express from 'express'

const KB = 1024
const MB = 1024 * KB

/** Unauthenticated body-bearing routes and their ceilings. `match` gets the
 * full request path. Order does not matter; paths do not overlap. */
export const PUBLIC_BODY_ROUTES = [
  // Public compile preview: the schema allows 1 MB of content; JSON escaping headroom.
  { match: (p) => p === '/api/compilation/preview-public', limit: 2 * MB, type: 'json' },
  { match: (p) => p === '/api/compilation/execute-public', limit: 128 * KB, type: 'json' },
  // Client error reports (optional auth).
  { match: (p) => p === '/api/errors' || p === '/api/errors/', limit: 256 * KB, type: 'json' },
  // Registry webhook (signature-checked).
  { match: (p) => p === '/api/registry/webhook', limit: 256 * KB, type: 'json' },
  // External webhook intake for local workflows.
  { match: (p) => p.startsWith('/api/webhook-proxy/'), limit: 1 * MB, type: 'json' },
  // Workflow webhook trigger (HMAC over the raw body) and its authenticated config routes.
  { match: (p) => p.startsWith('/api/webhooks/'), limit: 1 * MB, type: 'raw-or-json' },
]

/** The public-route entry for this path, or null. Pure. */
export function publicBodyRoute(path) {
  const p = typeof path === 'string' ? path : ''
  return PUBLIC_BODY_ROUTES.find((r) => r.match(p)) || null
}

/** Wrap an app-level parser so it never touches the public routes. */
export const skipPublicRoutes = (parser) => (req, res, next) => {
  if (publicBodyRoute(req.path)) return next()
  return parser(req, res, next)
}

/* One parser instance per route entry, built once. */
const routeParsers = new Map()
function parserFor(route) {
  let p = routeParsers.get(route)
  if (!p) {
    if (route.type === 'raw-or-json') {
      // The trigger (POST /api/webhooks/:id) keeps the raw Buffer for its
      // HMAC; config routes (PUT etc.) get parsed JSON.
      const raw = express.raw({ type: 'application/json', limit: route.limit })
      const json = express.json({ limit: route.limit })
      const urlenc = express.urlencoded({ extended: false, limit: route.limit })
      p = (req, res, next) => {
        const isTrigger = req.method === 'POST' && /^\/api\/webhooks\/[^/]+\/?$/.test(req.path)
        const first = isTrigger ? raw : json
        return first(req, res, (err) => (err ? next(err) : urlenc(req, res, next)))
      }
    } else {
      const json = express.json({ limit: route.limit })
      const urlenc = express.urlencoded({ extended: false, limit: route.limit })
      p = (req, res, next) => json(req, res, (err) => (err ? next(err) : urlenc(req, res, next)))
    }
    routeParsers.set(route, p)
  }
  return p
}

/** Install the app's body parsers: small ceilings on public routes, 50mb elsewhere. */
export function installBodyParsers(app) {
  app.use((req, res, next) => {
    const route = publicBodyRoute(req.path)
    if (!route) return next()
    return parserFor(route)(req, res, next)
  })
  app.use(skipPublicRoutes(express.json({ limit: '50mb' })))
  app.use(skipPublicRoutes(express.urlencoded({ extended: true, limit: '50mb' })))
}
