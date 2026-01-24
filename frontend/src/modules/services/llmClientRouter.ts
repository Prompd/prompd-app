/**
 * LLM Client Router
 *
 * Routes LLM requests to either local or remote client based on configuration
 * Provides a unified interface for chat regardless of execution mode
 */

import type { IPrompdLLMClient, LLMProvider } from '@prompd/react'
import { DefaultLLMClient } from '@prompd/react'
import { LocalLLMClient } from './LocalLLMClient'
import { getBackendHost } from './apiConfig'

export interface LLMClientRouterConfig {
  provider: LLMProvider
  model: string
  getAuthToken?: () => Promise<string | null>
}

/**
 * Router that selects between local and remote LLM clients
 */
export class LLMClientRouter implements IPrompdLLMClient {
  private config: LLMClientRouterConfig
  private localClient: LocalLLMClient
  private remoteClient: DefaultLLMClient

  constructor(config: LLMClientRouterConfig) {
    this.config = config

    // Initialize both clients
    this.localClient = new LocalLLMClient({
      provider: config.provider,
      model: config.model
    })

    this.remoteClient = new DefaultLLMClient({
      apiBaseUrl: getBackendHost(),
      provider: config.provider,
      model: config.model,
      getAuthToken: config.getAuthToken
    })
  }

  async send(request: any): Promise<any> {
    const provider = request.provider || this.config.provider

    // Check if we can execute locally
    const canExecuteLocally = await LocalLLMClient.canExecuteLocally(provider)

    console.log(`[LLMClientRouter] Routing ${provider} request to ${canExecuteLocally ? 'LOCAL' : 'REMOTE'} execution`)

    if (canExecuteLocally) {
      try {
        return await this.localClient.send(request)
      } catch (error) {
        console.error('[LLMClientRouter] Local execution failed, falling back to remote:', error)
        // Fallback to remote if local fails
        return await this.remoteClient.send(request)
      }
    } else {
      return await this.remoteClient.send(request)
    }
  }

  configure(config: Partial<LLMClientRouterConfig>): void {
    if (config.provider) {
      this.config.provider = config.provider
      this.localClient.configure({ provider: config.provider })
      this.remoteClient.configure({ provider: config.provider })
    }
    if (config.model) {
      this.config.model = config.model
      this.localClient.configure({ model: config.model })
      this.remoteClient.configure({ model: config.model })
    }
  }

  getConfig(): LLMClientRouterConfig {
    return { ...this.config }
  }
}