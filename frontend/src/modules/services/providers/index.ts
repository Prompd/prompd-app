/**
 * Providers Module - Barrel Export
 *
 * Local execution providers for direct LLM API calls.
 */

// Types
export type {
  IExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  StreamChunk,
  TokenUsage,
  ModelInfo,
  ProviderConfig,
  ProviderEntry,
  GenerationMode
} from './types'

export { KNOWN_PROVIDERS } from './types'

// Base classes
export {
  BaseProvider,
  OpenAICompatibleProvider,
  AnthropicProvider,
  GoogleGeminiProvider,
  CohereProvider
} from './base'

// Factory
export {
  createProvider,
  getProviderConfig,
  listKnownProviders,
  isKnownProvider
} from './factory'

export type { CustomProviderOptions } from './factory'
