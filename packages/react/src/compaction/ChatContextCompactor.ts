/**
 * ChatContextCompactor — Strategy pattern interface for chat context compaction.
 *
 * When a conversation grows beyond a model's context window, compactors reduce
 * the message array to fit while preserving the most relevant information.
 * Different strategies (sliding window, summarization, etc.) implement the same
 * interface so they can be swapped at runtime.
 */

import type { LLMMessage } from '../types'

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** The (possibly compacted) message array to send to the LLM */
  messages: LLMMessage[]
  /** Whether compaction was actually applied (false if under threshold) */
  wasCompacted: boolean
  /** Estimated token count of the output messages */
  estimatedTokens: number
  /** Number of messages that were removed or summarized */
  messagesCompacted: number
  /** Human-readable summary of what was compacted (for logging/debug) */
  summary?: string
}

/**
 * Configuration provided to the compactor for each invocation.
 */
export interface CompactionContext {
  /** The model's context window size in tokens */
  contextWindowSize: number
  /** Fraction of context window at which to trigger compaction (0.0–1.0, default 0.75) */
  compactionThreshold: number
  /** Number of most-recent non-system messages to always preserve */
  preserveRecentCount: number
}

/**
 * Strategy interface for chat context compaction.
 *
 * Implementations receive the full message array and a context object,
 * and return a potentially compacted version. System messages at the start
 * of the array should always be preserved — they contain the mode prompt
 * and tool definitions that the LLM depends on.
 */
export interface ChatContextCompactor {
  /** Unique identifier for serialization/settings */
  readonly id: string
  /** Human-readable name for UI display */
  readonly name: string
  /** Short description of the strategy */
  readonly description: string

  /**
   * Compact the message array if it exceeds the threshold.
   *
   * @param messages - The full message array (system + conversation)
   * @param context  - Context window info and configuration
   * @returns The (possibly compacted) messages and metadata
   */
  compact(
    messages: LLMMessage[],
    context: CompactionContext
  ): Promise<CompactionResult>
}
