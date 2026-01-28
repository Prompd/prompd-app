// AI Generation API client for editor
import { getApiBaseUrl } from './apiConfig'

// getApiBaseUrl() returns URL with /api suffix (e.g., '/api' or 'http://localhost:3010/api')
// Use it directly - no need to strip and re-add

/**
 * Token getter function (set by App.tsx with Clerk authentication)
 */
let authTokenGetter: (() => Promise<string | null>) | null = null

/**
 * Set the authentication token getter function
 */
export function setAiAuthTokenGetter(tokenGetter: () => Promise<string | null>): void {
  authTokenGetter = tokenGetter
}

/**
 * Get authentication token from Clerk or fallback to localStorage
 */
async function getToken(): Promise<string | null> {
  if (authTokenGetter) {
    return await authTokenGetter()
  }
  return localStorage.getItem('prompd.authToken')
}

/**
 * Custom error for quota exceeded responses
 */
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public details: {
      reason?: string
      canAddApiKey?: boolean
      upgradeRequired?: string
      suggestion?: string
    }
  ) {
    super(message)
    this.name = 'QuotaExceededError'
  }
}

/**
 * Generate options interface
 */
export interface GenerateOptions {
  complexity?: 'simple' | 'intermediate' | 'advanced'
  includeExamples?: boolean
  targetProvider?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

/**
 * Generate response interface
 */
export interface GenerateResponse {
  prompd: string
  metadata: {
    tokensUsed: {
      input: number
      output: number
      total: number
    }
    estimatedCost: number
    model: string
    durationMs: number
  }
  usage: {
    used: number
    limit: number
    unlimited: boolean
  }
}

/**
 * Quota status interface
 */
export interface QuotaStatus {
  plan: string
  generations: {
    used: number
    limit: number
    unlimited: boolean
  }
  executions: {
    used: number
    limit: number
    unlimited: boolean
  }
  providers: {
    anthropic: boolean
    openai: boolean
  }
  totalUsage: {
    generations: number
    executions: number
  }
}

/**
 * Execution history interface
 */
export interface ExecutionHistoryItem {
  _id: string
  userId: string
  type: 'generation' | 'execution'
  prompt: string
  provider: string
  model: string
  response: string
  metadata: {
    complexity?: string
    includeExamples?: boolean
    tokensUsed?: {
      prompt: number
      completion: number
      total: number
    }
    estimatedCost?: number
    durationMs: number
    usedOwnApiKey: boolean
  }
  error: {
    occurred: boolean
    message?: string
    code?: string
  }
  executedAt: string
  createdAt: string
  updatedAt: string
}

/**
 * History response interface
 */
export interface HistoryResponse {
  history: ExecutionHistoryItem[]
  pagination: {
    total: number
    limit: number
    skip: number
    hasMore: boolean
  }
}

/**
 * Provider info interface
 */
export interface ProviderInfo {
  providerId: string
  displayName: string
  hasKey: boolean
  addedAt?: string | null
  isCustom: boolean
  keyPrefix?: string
  consoleUrl?: string
  isLocal?: boolean
  baseUrl?: string // For custom providers
  models?: string[] // For custom providers
}

/**
 * Model info with pricing
 */
export interface ModelInfo {
  model: string
  displayName: string
  inputPrice: number | null
  outputPrice: number | null
  contextWindow?: number
  maxOutputTokens?: number
  supportsVision?: boolean
  supportsTools?: boolean
  supportsStreaming?: boolean
}

/**
 * Provider with models interface
 */
export interface ProviderWithModels {
  providerId: string
  displayName: string
  isCustom: boolean
  models: ModelInfo[]
}

/**
 * LLM Providers response interface
 */
export interface LLMProvidersResponse {
  providers: Record<string, ProviderInfo>
  defaultProvider: string | null
  totalConfigured: number
}

/**
 * Custom provider config for adding new providers
 */
export interface CustomProviderConfig {
  displayName: string
  baseUrl: string
  models?: string[]
  keyPrefix?: string
}

/**
 * Generate a .prmd file from natural language description
 */
export async function generatePrompd(
  description: string,
  options?: GenerateOptions
): Promise<GenerateResponse> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ description, options })
  })

  if (!response.ok) {
    const error = await response.json()
    if (response.status === 402) {
      throw new QuotaExceededError(error.reason || 'Quota exceeded', error)
    }
    throw new Error(error.message || 'Failed to generate prompd')
  }

  return response.json()
}

/**
 * Get current AI quota status
 */
export async function getAiQuota(): Promise<QuotaStatus> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/ai/quota`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch quota status')
  }

  return response.json()
}

/**
 * Get execution history
 */
export async function getAiHistory(
  type?: 'generation' | 'execution',
  limit = 20,
  skip = 0
): Promise<HistoryResponse> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) })
  if (type) params.set('type', type)

  const response = await fetch(`${getApiBaseUrl()}/ai/history?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch history')
  }

  return response.json()
}

/**
 * Get configured LLM providers
 */
export async function getLLMProviders(): Promise<LLMProvidersResponse> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/llm-providers`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch LLM providers')
  }

  return response.json()
}

/**
 * Set LLM API key for a provider
 */
export async function setLlmApiKey(
  provider: string,
  apiKey: string,
  customConfig?: CustomProviderConfig
): Promise<{ message: string; hasKey: boolean; isCustom: boolean; unlockedFeatures: string[] }> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/llm-providers/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ apiKey, customConfig })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || error.message || 'Failed to set API key')
  }

  return response.json()
}

/**
 * Remove LLM API key for a provider
 */
export async function removeLlmApiKey(
  provider: string
): Promise<{ message: string; note: string }> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/llm-providers/${provider}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || error.message || 'Failed to remove API key')
  }

  return response.json()
}

/**
 * Get available providers with their pricing
 */
export async function getAvailableProviders(): Promise<{ providers: ProviderWithModels[] }> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/llm-providers/available`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch available providers')
  }

  return response.json()
}

/**
 * Get models for a specific provider
 */
export async function getProviderModels(provider: string): Promise<ProviderWithModels> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/llm-providers/${provider}/models`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || error.message || 'Failed to fetch provider models')
  }

  return response.json()
}

/**
 * Set user's default provider
 */
export async function setDefaultProvider(provider: string): Promise<{ message: string; defaultProvider: string }> {
  const token = await getToken()
  if (!token) {
    throw new Error('Authentication required. Please log in.')
  }

  const response = await fetch(`${getApiBaseUrl()}/llm-providers/default`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ provider })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || error.message || 'Failed to set default provider')
  }

  return response.json()
}

// Re-export from shared utility for backwards compatibility
export { formatPricePerMillion } from '../lib/formatters'
