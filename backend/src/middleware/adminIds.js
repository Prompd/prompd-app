/* The admin allowlist: Clerk user ids (the token's `sub`), comma separated, in
 * ADMIN_USER_IDS. Exact matches only, and an unset list admits nobody.
 *
 * Pure so it can be tested without a request, a token or a database. */
export function isAdminUserId(sub, env = process.env) {
  if (!sub || typeof sub !== 'string') return false
  const raw = env?.ADMIN_USER_IDS
  if (!raw || typeof raw !== 'string') return false
  return raw.split(',').map((id) => id.trim()).filter(Boolean).includes(sub)
}
