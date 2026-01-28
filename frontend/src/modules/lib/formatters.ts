/**
 * Shared formatting utilities
 */

/**
 * Format a price per million tokens for display
 * @param price - Price in dollars per million tokens (null if unknown)
 * @returns Formatted string like "$0.15", "Free", or "N/A"
 */
export function formatPricePerMillion(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'N/A'
  if (price === 0) return 'Free'
  // For very small prices (< 1 cent), show in cents with 2 decimal places
  if (price < 0.01) return `$${(price * 100).toFixed(2)}c`
  // For prices under $1, show 2 decimal places
  if (price < 1) return `$${price.toFixed(2)}`
  // For larger prices, show 2 decimal places
  return `$${price.toFixed(2)}`
}
