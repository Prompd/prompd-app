/**
 * Provider Types and Interfaces
 *
 * Re-exported from @prompd/cli/providers — the CLI is the canonical source
 * of truth for all provider types, interfaces, and the KNOWN_PROVIDERS registry.
 * This subpath export is browser-compatible (pure types + data, no Node.js deps).
 * Frontend keeps its own HTTP implementation (electronFetch) in base.ts.
 */

export type {
  GenerationMode,
  ExecutionRequest,
  TokenUsage,
  ExecutionResult,
  StreamChunk,
  ModelInfo,
  ProviderConfig,
  IExecutionProvider,
  ProviderEntry
} from '@prompd/cli/providers'

export { KNOWN_PROVIDERS } from '@prompd/cli/providers'
