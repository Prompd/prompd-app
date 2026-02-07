/**
 * External module declarations for scheduler package
 */

declare module '@prompd/cli' {
  export class RegistryClient {
    install(packageSpec: string, options: { workspaceRoot: string; skipCache: boolean }): Promise<void>
  }

  export class PrompdParser {
    static parse(content: string): { frontmatter?: any; body?: string; [key: string]: any }
  }

  export class DependencyResolutionStage {
    // Dependency resolution stage from compilation pipeline
  }
}

declare module '../../prompd-service/src/webhookClient.js' {
  export class WebhookClient {
    constructor(options: { onWebhook: (webhook: { workflowId: string; payload: Record<string, unknown> }) => void })
    start(): Promise<boolean>
    stop(): void
    isActive(): boolean
    getMode(): string
  }
}
