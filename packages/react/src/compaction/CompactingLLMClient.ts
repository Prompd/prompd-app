/**
 * CompactingLLMClient — Decorator that applies context compaction before delegating.
 *
 * Wraps any IPrompdLLMClient and transparently compacts messages when the
 * estimated token count approaches the model's context window. This is
 * composable into any client chain (agent mode, direct chat, etc.).
 */

import type { IPrompdLLMClient, PrompdLLMRequest, PrompdLLMResponse } from '../types'
import type { ChatContextCompactor, CompactionContext } from './ChatContextCompactor'
import { estimateMessagesTokenCount } from './tokenEstimator'

/** Default compaction configuration */
const DEFAULT_COMPACTION_THRESHOLD = 0.75
const DEFAULT_PRESERVE_RECENT_COUNT = 20

/**
 * Extended client interface that includes configure/getConfig methods
 * used by the agent wrapper (AgentCompatibleLLMClient).
 */
interface ConfigurableLLMClient extends IPrompdLLMClient {
  configure?: (config: Record<string, unknown>) => void
  getConfig?: () => object
}

export class CompactingLLMClient implements IPrompdLLMClient {
  private delegate: ConfigurableLLMClient
  private compactor: ChatContextCompactor
  private contextWindowSize: number
  private threshold: number
  private preserveRecentCount: number

  constructor(
    delegate: ConfigurableLLMClient,
    compactor: ChatContextCompactor,
    contextWindowSize: number,
    options?: {
      threshold?: number
      preserveRecentCount?: number
    }
  ) {
    this.delegate = delegate
    this.compactor = compactor
    this.contextWindowSize = contextWindowSize
    this.threshold = options?.threshold ?? DEFAULT_COMPACTION_THRESHOLD
    this.preserveRecentCount = options?.preserveRecentCount ?? DEFAULT_PRESERVE_RECENT_COUNT
  }

  /**
   * Update the context window size (e.g., when the user switches models).
   */
  setContextWindowSize(size: number): void {
    this.contextWindowSize = size
  }

  /**
   * Update the compaction strategy at runtime.
   */
  setCompactor(compactor: ChatContextCompactor): void {
    this.compactor = compactor
  }

  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    const compactionContext: CompactionContext = {
      contextWindowSize: this.contextWindowSize,
      compactionThreshold: this.threshold,
      preserveRecentCount: this.preserveRecentCount,
    }

    const result = await this.compactor.compact(request.messages, compactionContext)

    if (result.wasCompacted) {
      const beforeTokens = estimateMessagesTokenCount(request.messages)
      console.log(
        `[CompactingLLMClient] Compacted: ${result.messagesCompacted} messages removed, ` +
        `~${beforeTokens} -> ~${result.estimatedTokens} tokens` +
        (result.summary ? ` (${result.summary})` : '')
      )

      return this.delegate.send({
        ...request,
        messages: result.messages,
      })
    }

    return this.delegate.send(request)
  }

  /**
   * Delegate configure to the inner client (required by AgentCompatibleLLMClient).
   */
  configure(config: Record<string, unknown>): void {
    this.delegate.configure?.(config)
  }

  /**
   * Delegate getConfig to the inner client (required by AgentCompatibleLLMClient).
   */
  getConfig(): object {
    return this.delegate.getConfig?.() ?? {}
  }
}
