/**
 * Token Estimation Utilities
 *
 * Lightweight heuristic-based token counting for compaction threshold decisions.
 * Uses ~3.5 characters per token (slightly conservative) instead of tiktoken
 * (which would add a ~4MB WASM dependency). The 75% threshold trigger provides
 * 25% headroom for estimation inaccuracy.
 */

import type { LLMMessage } from '../types'

/** Characters per token — slightly conservative to avoid hitting real limits */
const CHARS_PER_TOKEN = 3.5

/** Per-message overhead for role markers, delimiters, etc. */
const MESSAGE_OVERHEAD_TOKENS = 4

/**
 * Estimate the token count of a string.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total tokens for a message array.
 * Includes per-message overhead for role/delimiter tokens.
 */
export function estimateMessagesTokenCount(messages: LLMMessage[]): number {
  let total = 0
  for (const msg of messages) {
    total += MESSAGE_OVERHEAD_TOKENS
    total += estimateTokenCount(msg.content)
  }
  return total
}
