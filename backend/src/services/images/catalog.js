/**
 * The names every image provider is spoken to in. Each adapter maps these to
 * its own parameters, so the web picker and the route never learn a provider's
 * size strings or aspect-ratio syntax.
 *
 * Kept in step with prompd-app/backend/src/services/images/catalog.js by the
 * identical catalog.contract.test.js in both repos.
 */
export const SHAPES = ['square', 'wide', 'tall', 'square-2k', 'wide-2k', 'tall-2k']
export const QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
export const DEFAULT_SHAPE = 'square'
export const DEFAULT_QUALITY = 'auto'

/** The nearest shape to an old `WxH` size, among the shapes a model takes.
 * Accepted for one release so a web client older than the server still works.
 * Within 10% of square counts as square; an edge of 2048 or more picks the 2K
 * version when the model has one. Anything unreadable is square. */
export function sizeToShape(size, shapeKeys) {
  const m = /^(\d{2,4})x(\d{2,4})$/.exec(typeof size === 'string' ? size : '')
  if (!m) return DEFAULT_SHAPE
  const w = Number(m[1])
  const h = Number(m[2])
  const aspect = w > h * 1.1 ? 'wide' : h > w * 1.1 ? 'tall' : 'square'
  const big = `${aspect}-2k`
  if (Math.max(w, h) >= 2048 && shapeKeys.includes(big)) return big
  return aspect
}
