/**
 * SlidingWindowCompactor — Drops older messages to stay within context limits.
 *
 * When estimated tokens exceed the threshold:
 * 1. System messages at the start are always preserved.
 * 2. The N most recent non-system messages are preserved.
 * 3. Older non-system messages are dropped entirely.
 * 4. A context-note system message is injected listing topics/files
 *    from the dropped messages (extracted via regex, no LLM call).
 */

import type { LLMMessage } from '../types'
import type {
  ChatContextCompactor,
  CompactionContext,
  CompactionResult,
} from './ChatContextCompactor'
import { estimateMessagesTokenCount } from './tokenEstimator'

/**
 * Extract topic hints from dropped messages without an LLM call.
 * Scans for file paths, tool names, and package references.
 */
function extractTopicHints(messages: LLMMessage[]): string {
  const filePaths = new Set<string>()
  const tools = new Set<string>()

  for (const msg of messages) {
    const content = msg.content

    // Extract file paths (Unix and Windows style)
    const pathMatches = content.match(
      /(?:[\w.-]+\/)+[\w.-]+\.\w{1,10}|(?:[A-Z]:\\[\w\\.-]+)/g
    )
    if (pathMatches) {
      for (const p of pathMatches.slice(0, 10)) {
        filePaths.add(p)
      }
    }

    // Extract tool names from XML tool-call/result patterns
    const toolMatches = content.match(/<tool>([\w_]+)<\/tool>/g)
    if (toolMatches) {
      for (const t of toolMatches) {
        tools.add(t.replace(/<\/?tool>/g, ''))
      }
    }
  }

  const parts: string[] = []
  if (filePaths.size > 0) {
    const fileList = [...filePaths].slice(0, 8).join(', ')
    parts.push(`files referenced: ${fileList}`)
  }
  if (tools.size > 0) {
    parts.push(`tools used: ${[...tools].join(', ')}`)
  }

  return parts.join('; ')
}

export class SlidingWindowCompactor implements ChatContextCompactor {
  readonly id = 'sliding-window'
  readonly name = 'Sliding Window'
  readonly description = 'Keeps recent messages, drops older ones with a topic summary header'

  async compact(
    messages: LLMMessage[],
    context: CompactionContext
  ): Promise<CompactionResult> {
    const totalEstimate = estimateMessagesTokenCount(messages)
    const threshold = context.contextWindowSize * context.compactionThreshold

    // Under threshold — no compaction needed
    if (totalEstimate <= threshold) {
      return {
        messages,
        wasCompacted: false,
        estimatedTokens: totalEstimate,
        messagesCompacted: 0,
      }
    }

    // Separate leading system messages from conversation messages
    let systemEndIndex = 0
    while (
      systemEndIndex < messages.length &&
      messages[systemEndIndex].role === 'system'
    ) {
      systemEndIndex++
    }

    const systemMessages = messages.slice(0, systemEndIndex)
    const conversationMessages = messages.slice(systemEndIndex)

    // Determine how many recent messages to keep
    const preserveCount = Math.min(
      context.preserveRecentCount,
      conversationMessages.length
    )

    const droppedMessages = conversationMessages.slice(
      0,
      conversationMessages.length - preserveCount
    )
    const keptMessages = conversationMessages.slice(
      conversationMessages.length - preserveCount
    )

    // Nothing to drop — conversation is smaller than preserveRecentCount
    if (droppedMessages.length === 0) {
      return {
        messages,
        wasCompacted: false,
        estimatedTokens: totalEstimate,
        messagesCompacted: 0,
      }
    }

    // Extract topic hints from dropped messages
    const topicSummary = extractTopicHints(droppedMessages)

    // Build context note
    const contextNote: LLMMessage = {
      role: 'system',
      content: [
        `[Context compacted: ${droppedMessages.length} earlier messages were removed to stay within context limits.`,
        topicSummary ? ` Earlier conversation covered: ${topicSummary}.` : '',
        ` The most recent ${keptMessages.length} messages are preserved below.]`,
      ].join(''),
    }

    const compactedMessages = [
      ...systemMessages,
      contextNote,
      ...keptMessages,
    ]

    const compactedEstimate = estimateMessagesTokenCount(compactedMessages)

    return {
      messages: compactedMessages,
      wasCompacted: true,
      estimatedTokens: compactedEstimate,
      messagesCompacted: droppedMessages.length,
      summary: topicSummary || undefined,
    }
  }
}
