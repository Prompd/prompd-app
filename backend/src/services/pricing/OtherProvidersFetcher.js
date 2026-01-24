import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Cohere pricing fetcher
 * Fetches active models from Cohere's API
 *
 * API Reference: https://docs.cohere.com/reference/list-models
 * Note: Requires COHERE_API_KEY environment variable
 */
export class CoherePricingFetcher extends BasePricingFetcher {
  constructor() {
    super('cohere')
    this.modelsEndpoint = 'https://api.cohere.ai/v1/models'
  }

  supportsPricingApi() {
    return !!process.env.COHERE_API_KEY
  }

  async fetchPricing() {
    const apiKey = process.env.COHERE_API_KEY
    if (!apiKey) {
      console.warn('[CoherePricingFetcher] No API key available, using defaults')
      return this.getDefaultPricing()
    }

    try {
      const response = await fetch(this.modelsEndpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.warn(`[CoherePricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      // Cohere returns { models: [...] }
      const activeModels = data.models?.map(m => m.name) || []
      console.log(`[CoherePricingFetcher] Fetched ${activeModels.length} models from Cohere API`)

      // Filter to only chat models (exclude embed, rerank, etc.)
      const chatModels = activeModels.filter(m =>
        m.includes('command') && !m.includes('embed') && !m.includes('rerank')
      )

      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => chatModels.includes(p.model))

      const removedModels = defaultPricing.filter(p => !chatModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[CoherePricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      return activePricing
    } catch (error) {
      console.error('[CoherePricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  getDefaultPricing() {
    // Pricing as of December 2024 - https://cohere.com/pricing
    return [
      {
        model: 'command-r-plus',
        displayName: 'Command R+',
        pricing: {
          inputTokens: 2.50,
          outputTokens: 10.00
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'command-r',
        displayName: 'Command R',
        pricing: {
          inputTokens: 0.15,
          outputTokens: 0.60
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'command',
        displayName: 'Command',
        pricing: {
          inputTokens: 1.00,
          outputTokens: 2.00
        },
        capabilities: {
          contextWindow: 4096,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      }
    ]
  }
}

/**
 * Together AI pricing fetcher
 * Fetches active models from Together's OpenAI-compatible API
 *
 * API Reference: https://docs.together.ai/reference/models-1
 * Note: Requires TOGETHER_API_KEY environment variable
 */
export class TogetherPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('together')
    this.modelsEndpoint = 'https://api.together.xyz/v1/models'
  }

  supportsPricingApi() {
    return !!process.env.TOGETHER_API_KEY
  }

  async fetchPricing() {
    const apiKey = process.env.TOGETHER_API_KEY
    if (!apiKey) {
      console.warn('[TogetherPricingFetcher] No API key available, using defaults')
      return this.getDefaultPricing()
    }

    try {
      const response = await fetch(this.modelsEndpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.warn(`[TogetherPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      // Together returns array of models directly or { data: [...] }
      const models = Array.isArray(data) ? data : (data.data || [])
      const activeModels = models.map(m => m.id || m.name).filter(Boolean)
      console.log(`[TogetherPricingFetcher] Fetched ${activeModels.length} models from Together API`)

      // Filter to only chat/instruct models (exclude base, embed models)
      const chatModels = activeModels.filter(m =>
        (m.includes('Instruct') || m.includes('chat') || m.includes('Chat')) &&
        !m.includes('embed')
      )

      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => chatModels.includes(p.model))

      const removedModels = defaultPricing.filter(p => !chatModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[TogetherPricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      return activePricing
    } catch (error) {
      console.error('[TogetherPricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  getDefaultPricing() {
    // Pricing as of December 2024 - https://www.together.ai/pricing
    return [
      {
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        displayName: 'Llama 3.3 70B Turbo',
        pricing: {
          inputTokens: 0.88,
          outputTokens: 0.88
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'meta-llama/Llama-3.1-405B-Instruct-Turbo',
        displayName: 'Llama 3.1 405B Turbo',
        pricing: {
          inputTokens: 3.50,
          outputTokens: 3.50
        },
        capabilities: {
          contextWindow: 130815,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
        displayName: 'Llama 3.1 70B Turbo',
        pricing: {
          inputTokens: 0.88,
          outputTokens: 0.88
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
        displayName: 'Llama 3.1 8B Turbo',
        pricing: {
          inputTokens: 0.18,
          outputTokens: 0.18
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
        displayName: 'Qwen 2.5 72B Turbo',
        pricing: {
          inputTokens: 1.20,
          outputTokens: 1.20
        },
        capabilities: {
          contextWindow: 32768,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

/**
 * Perplexity pricing fetcher
 */
export class PerplexityPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('perplexity')
  }

  supportsPricingApi() {
    return false
  }

  getDefaultPricing() {
    return [
      {
        model: 'sonar-pro',
        displayName: 'Sonar Pro',
        pricing: {
          inputTokens: 3.00,
          outputTokens: 15.00
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      },
      {
        model: 'sonar',
        displayName: 'Sonar',
        pricing: {
          inputTokens: 1.00,
          outputTokens: 1.00
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      },
      {
        model: 'sonar-reasoning',
        displayName: 'Sonar Reasoning',
        pricing: {
          inputTokens: 1.00,
          outputTokens: 5.00
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      }
    ]
  }
}

/**
 * DeepSeek pricing fetcher
 * Fetches active models from DeepSeek's OpenAI-compatible API
 *
 * API Reference: https://api-docs.deepseek.com/api/list-models
 * Note: Requires DEEPSEEK_API_KEY environment variable
 */
export class DeepSeekPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('deepseek')
    this.modelsEndpoint = 'https://api.deepseek.com/models'
  }

  supportsPricingApi() {
    return !!process.env.DEEPSEEK_API_KEY
  }

  async fetchPricing() {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      console.warn('[DeepSeekPricingFetcher] No API key available, using defaults')
      return this.getDefaultPricing()
    }

    try {
      const response = await fetch(this.modelsEndpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.warn(`[DeepSeekPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      const activeModels = data.data?.map(m => m.id) || []
      console.log(`[DeepSeekPricingFetcher] Fetched ${activeModels.length} models from DeepSeek API`)

      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => activeModels.includes(p.model))

      const removedModels = defaultPricing.filter(p => !activeModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[DeepSeekPricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      // Add new models discovered from API
      const knownModels = new Set(defaultPricing.map(p => p.model))
      const newModels = activeModels.filter(m => !knownModels.has(m))
      for (const modelId of newModels) {
        console.log(`[DeepSeekPricingFetcher] New model discovered: ${modelId}`)
        activePricing.push({
          model: modelId,
          displayName: this.formatModelName(modelId),
          pricing: {
            inputTokens: 0.14,
            outputTokens: 0.28
          },
          capabilities: {
            contextWindow: 64000,
            supportsVision: false,
            supportsTools: true,
            supportsStreaming: true
          }
        })
      }

      return activePricing
    } catch (error) {
      console.error('[DeepSeekPricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  formatModelName(modelId) {
    return modelId
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  getDefaultPricing() {
    // Pricing as of December 2024 - https://platform.deepseek.com/api-docs/pricing
    return [
      {
        model: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        pricing: {
          inputTokens: 0.14,      // $0.14 per 1M input (cache miss)
          outputTokens: 0.28,     // $0.28 per 1M output
          cachedInputTokens: 0.014
        },
        capabilities: {
          contextWindow: 64000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'deepseek-reasoner',
        displayName: 'DeepSeek Reasoner',
        pricing: {
          inputTokens: 0.55,
          outputTokens: 2.19
        },
        capabilities: {
          contextWindow: 64000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      },
      {
        model: 'deepseek-coder',
        displayName: 'DeepSeek Coder',
        pricing: {
          inputTokens: 0.14,
          outputTokens: 0.28
        },
        capabilities: {
          contextWindow: 64000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

/**
 * Ollama (local) pricing fetcher
 * Fetches locally installed models from Ollama's API
 * All models are free since they run locally
 *
 * API Reference: https://github.com/ollama/ollama/blob/main/docs/api.md
 * Note: Requires Ollama running locally (default: http://localhost:11434)
 */
export class OllamaPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('ollama')
    // Allow custom Ollama URL via environment variable
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.modelsEndpoint = `${this.baseUrl}/api/tags`
  }

  supportsPricingApi() {
    // Always try to fetch local models - it's a local service
    return true
  }

  async fetchPricing() {
    try {
      // Use a short timeout since this is a local service
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(this.modelsEndpoint, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }
      })
      clearTimeout(timeout)

      if (!response.ok) {
        console.warn(`[OllamaPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      // Ollama returns { models: [{ name: "llama3.2:latest", ... }] }
      const localModels = data.models?.map(m => m.name?.split(':')[0]) || []
      const uniqueModels = [...new Set(localModels)]
      console.log(`[OllamaPricingFetcher] Found ${uniqueModels.length} locally installed models`)

      if (uniqueModels.length === 0) {
        console.warn('[OllamaPricingFetcher] No local models found, using defaults')
        return this.getDefaultPricing()
      }

      // Build pricing for locally installed models
      const activePricing = uniqueModels.map(modelId => ({
        model: modelId,
        displayName: `${this.formatModelName(modelId)} (Local)`,
        pricing: {
          inputTokens: 0.00,
          outputTokens: 0.00
        },
        capabilities: {
          contextWindow: this.estimateContextWindow(modelId),
          maxOutputTokens: 8192,
          supportsVision: modelId.includes('llava') || modelId.includes('vision'),
          supportsTools: true,
          supportsStreaming: true
        }
      }))

      return activePricing
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('[OllamaPricingFetcher] Connection timeout - Ollama may not be running')
      } else {
        console.warn('[OllamaPricingFetcher] Error fetching from API:', error.message)
      }
      return this.getDefaultPricing()
    }
  }

  formatModelName(modelId) {
    return modelId
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  estimateContextWindow(modelId) {
    // Estimate context window based on model name patterns
    if (modelId.includes('qwen')) return 32768
    if (modelId.includes('llama3')) return 128000
    if (modelId.includes('mistral')) return 32768
    if (modelId.includes('gemma')) return 8192
    if (modelId.includes('phi')) return 128000
    return 8192 // Default
  }

  getDefaultPricing() {
    // Common models that users might have installed
    return [
      {
        model: 'llama3.2',
        displayName: 'Llama 3.2 (Local)',
        pricing: {
          inputTokens: 0.00,
          outputTokens: 0.00
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'qwen2.5',
        displayName: 'Qwen 2.5 (Local)',
        pricing: {
          inputTokens: 0.00,
          outputTokens: 0.00
        },
        capabilities: {
          contextWindow: 32768,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'mistral',
        displayName: 'Mistral (Local)',
        pricing: {
          inputTokens: 0.00,
          outputTokens: 0.00
        },
        capabilities: {
          contextWindow: 32768,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'codellama',
        displayName: 'Code Llama (Local)',
        pricing: {
          inputTokens: 0.00,
          outputTokens: 0.00
        },
        capabilities: {
          contextWindow: 16384,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      }
    ]
  }
}
