/**
 * Provider Types and Interfaces
 *
 * Defines the contracts for LLM execution providers in the local-first architecture.
 */

/** Generation mode for LLM execution */
export type GenerationMode = 'default' | 'thinking' | 'json'

/**
 * Request to execute a prompt against an LLM
 */
export interface ExecutionRequest {
  /** The prompt content to send */
  prompt: string
  /** The model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022') */
  model: string
  /** API key for authentication */
  apiKey: string
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Temperature for response randomness (0-2) */
  temperature?: number
  /** System prompt to set context */
  systemPrompt?: string
  /** Whether to stream the response */
  stream?: boolean
  /** Generation mode (default, thinking, json, code) */
  mode?: GenerationMode
  /** Enable image generation output for models that support it */
  enableImageGeneration?: boolean
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Result from an LLM execution
 */
export interface ExecutionResult {
  success: boolean
  response?: string
  error?: string
  usage: TokenUsage
  /** Execution duration in milliseconds */
  duration: number
}

/**
 * A chunk of streamed response
 */
export interface StreamChunk {
  /** The text content of this chunk */
  content: string
  /** Whether this is the final chunk */
  done: boolean
  /** Token usage (only available on final chunk for some providers) */
  usage?: TokenUsage
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
  maxOutput?: number
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Base URL for API calls (for OpenAI-compatible providers) */
  baseUrl?: string
  /** Default model for this provider */
  defaultModel?: string
  /** Available models */
  models?: string[]
  /** Whether this provider requires an API key */
  requiresApiKey?: boolean
}

/**
 * Interface for LLM execution providers
 */
export interface IExecutionProvider {
  /** Provider identifier (e.g., 'openai', 'anthropic') */
  readonly name: string
  /** Display name for UI */
  readonly displayName: string
  /** Base URL for API calls */
  readonly baseUrl: string

  /**
   * Execute a prompt and return the full response
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>

  /**
   * Execute a prompt with streaming response
   */
  stream(request: ExecutionRequest): AsyncGenerator<StreamChunk, void, unknown>

  /**
   * List available models for this provider
   */
  listModels(): ModelInfo[]

  /**
   * Validate an API key (optional - not all providers support this)
   */
  validateApiKey?(apiKey: string): Promise<boolean>
}

/**
 * Provider registry entry
 */
export interface ProviderEntry {
  name: string
  displayName: string
  baseUrl: string
  keyPrefix?: string
  consoleUrl?: string
  models: ModelInfo[]
  isLocal?: boolean
  isOpenAICompatible?: boolean
}

/**
 * Known provider configurations
 */
export const KNOWN_PROVIDERS: Record<string, ProviderEntry> = {
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyPrefix: 'sk-',
    consoleUrl: 'https://platform.openai.com/api-keys',
    isOpenAICompatible: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxOutput: 16384 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxOutput: 16384 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, maxOutput: 4096 },
      { id: 'gpt-4', name: 'GPT-4', contextWindow: 8192, maxOutput: 4096 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385, maxOutput: 4096 },
      { id: 'o1-preview', name: 'o1 Preview', contextWindow: 128000, maxOutput: 32768 },
      { id: 'o1-mini', name: 'o1 Mini', contextWindow: 128000, maxOutput: 65536 }
    ]
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyPrefix: 'sk-ant-',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    isOpenAICompatible: false,
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxOutput: 8192 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000, maxOutput: 8192 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000, maxOutput: 4096 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000, maxOutput: 4096 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000, maxOutput: 4096 }
    ]
  },
  google: {
    name: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyPrefix: 'AIza',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    isOpenAICompatible: false,
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2097152, maxOutput: 8192 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1048576, maxOutput: 8192 },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', contextWindow: 1048576, maxOutput: 8192 },
      { id: 'gemini-pro', name: 'Gemini Pro', contextWindow: 32760, maxOutput: 8192 }
    ]
  },
  groq: {
    name: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefix: 'gsk_',
    consoleUrl: 'https://console.groq.com/keys',
    isOpenAICompatible: true,
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000, maxOutput: 32768 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', contextWindow: 128000, maxOutput: 8192 },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768, maxOutput: 32768 },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', contextWindow: 8192, maxOutput: 8192 }
    ]
  },
  mistral: {
    name: 'mistral',
    displayName: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    consoleUrl: 'https://console.mistral.ai/api-keys',
    isOpenAICompatible: true,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128000, maxOutput: 8192 },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', contextWindow: 32000, maxOutput: 8192 },
      { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 32000, maxOutput: 8192 },
      { id: 'open-mixtral-8x22b', name: 'Mixtral 8x22B', contextWindow: 64000, maxOutput: 8192 },
      { id: 'codestral-latest', name: 'Codestral', contextWindow: 32000, maxOutput: 8192 }
    ]
  },
  cohere: {
    name: 'cohere',
    displayName: 'Cohere',
    baseUrl: 'https://api.cohere.ai',
    consoleUrl: 'https://dashboard.cohere.com/api-keys',
    isOpenAICompatible: false,
    models: [
      { id: 'command-r-plus', name: 'Command R+', contextWindow: 128000, maxOutput: 4096 },
      { id: 'command-r', name: 'Command R', contextWindow: 128000, maxOutput: 4096 },
      { id: 'command', name: 'Command', contextWindow: 4096, maxOutput: 4096 },
      { id: 'command-light', name: 'Command Light', contextWindow: 4096, maxOutput: 4096 }
    ]
  },
  together: {
    name: 'together',
    displayName: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    consoleUrl: 'https://api.together.xyz/settings/api-keys',
    isOpenAICompatible: true,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', contextWindow: 128000 },
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B Turbo', contextWindow: 128000 },
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', contextWindow: 128000 },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', contextWindow: 65536 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', contextWindow: 32768 }
    ]
  },
  perplexity: {
    name: 'perplexity',
    displayName: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    consoleUrl: 'https://www.perplexity.ai/settings/api',
    isOpenAICompatible: true,
    models: [
      { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large Online', contextWindow: 128000 },
      { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small Online', contextWindow: 128000 },
      { id: 'llama-3.1-sonar-large-128k-chat', name: 'Sonar Large Chat', contextWindow: 128000 },
      { id: 'llama-3.1-sonar-small-128k-chat', name: 'Sonar Small Chat', contextWindow: 128000 }
    ]
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    isOpenAICompatible: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 64000 },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', contextWindow: 64000 }
    ]
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    isOpenAICompatible: true,
    isLocal: true,
    models: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'llama3.1', name: 'Llama 3.1' },
      { id: 'qwen2.5', name: 'Qwen 2.5' },
      { id: 'codellama', name: 'Code Llama' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'phi3', name: 'Phi 3' }
    ]
  }
}
