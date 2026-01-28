// Central settings management for Prompd
// Provides a single source of truth for all application settings

type RegistryUrlChangeListener = (url: string) => void

class PrompdSettingsService {
  private registryUrlListeners = new Set<RegistryUrlChangeListener>()

  constructor() {
    // Listen for storage events from other tabs/windows
    window.addEventListener('storage', (e) => {
      if (e.key === 'prompd.registryUrl') {
        const newUrl = e.newValue || this.getDefaultRegistryUrl()
        this.notifyRegistryUrlChange(newUrl)
      }
    })
  }

  // Registry URL Management
  getRegistryUrl(): string {
    // Check for localStorage override
    const override = localStorage.getItem('prompd.registryUrl')

    if (override) {
      console.log('[PrompdSettings] Using localStorage override:', override)
      return override
    }

    // Return default based on environment
    return this.getDefaultRegistryUrl()
  }

  private getDefaultRegistryUrl(): string {
    // Priority: VITE_REGISTRY_URL env var > DEV default > production default
    // This allows builds to specify a different registry URL
    const envUrl = import.meta.env.VITE_REGISTRY_URL
    if (envUrl) {
      return envUrl
    }

    // Development: localhost:4000, Production: https://registry.prompdhub.ai
    if (import.meta.env.DEV) {
      return 'http://localhost:4000'
    }
    return 'https://registry.prompdhub.ai'
  }

  setRegistryUrl(url: string): void {
    if (url.trim()) {
      localStorage.setItem('prompd.registryUrl', url.trim())
      console.log('[PrompdSettings] Registry URL updated to:', url.trim())
      this.notifyRegistryUrlChange(url.trim())
    } else {
      this.resetRegistryUrl()
    }
  }

  resetRegistryUrl(): void {
    localStorage.removeItem('prompd.registryUrl')
    const defaultUrl = this.getDefaultRegistryUrl()
    console.log('[PrompdSettings] Registry URL reset to default:', defaultUrl)
    this.notifyRegistryUrlChange(defaultUrl)
  }

  // Observer pattern for registry URL changes
  onRegistryUrlChange(listener: RegistryUrlChangeListener): () => void {
    this.registryUrlListeners.add(listener)
    // Return unsubscribe function
    return () => this.registryUrlListeners.delete(listener)
  }

  private notifyRegistryUrlChange(url: string): void {
    this.registryUrlListeners.forEach(listener => {
      try {
        listener(url)
      } catch (error) {
        console.error('[PrompdSettings] Error in registry URL change listener:', error)
      }
    })
  }

  // Theme Management
  getTheme(): 'light' | 'dark' {
    const stored = localStorage.getItem('prompd.theme')
    return (stored === 'light' || stored === 'dark') ? stored : 'dark'
  }

  setTheme(theme: 'light' | 'dark'): void {
    localStorage.setItem('prompd.theme', theme)
  }

  // Sidebar Settings
  getSidebarWidth(): number {
    const stored = localStorage.getItem('prompd.sidebarWidth')
    const value = Number(stored)
    return Number.isFinite(value) && value >= 160 && value <= 640 ? value : 240
  }

  setSidebarWidth(width: number): void {
    localStorage.setItem('prompd.sidebarWidth', width.toString())
  }

  // Hotkey Settings
  getHotkeys(): Record<string, string> {
    try {
      const stored = localStorage.getItem('prompd.hotkeys')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  }

  setHotkeys(hotkeys: Record<string, string>): void {
    localStorage.setItem('prompd.hotkeys', JSON.stringify(hotkeys))
  }

  // Parameter Storage
  getParameters(): Record<string, any> {
    try {
      const stored = localStorage.getItem('prompd.params')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  }

  setParameters(params: Record<string, any>): void {
    localStorage.setItem('prompd.params', JSON.stringify(params))
  }

  // Editor Content Storage
  getEditorText(): string | null {
    return localStorage.getItem('prompd.editor.text')
  }

  setEditorText(text: string): void {
    localStorage.setItem('prompd.editor.text', text)
  }

  // Usage Storage Settings
  getStoreCompiledPrompts(): boolean {
    return localStorage.getItem('prompd.usage.storeCompiledPrompts') === 'true'
  }

  setStoreCompiledPrompts(enabled: boolean): void {
    localStorage.setItem('prompd.usage.storeCompiledPrompts', enabled.toString())
  }

  getStoreResponses(): boolean {
    return localStorage.getItem('prompd.usage.storeResponses') === 'true'
  }

  setStoreResponses(enabled: boolean): void {
    localStorage.setItem('prompd.usage.storeResponses', enabled.toString())
  }

  getStoreChatMessages(): boolean {
    const stored = localStorage.getItem('prompd.usage.storeChatMessages')
    // Default to true if not set
    return stored === null ? true : stored === 'true'
  }

  setStoreChatMessages(enabled: boolean): void {
    localStorage.setItem('prompd.usage.storeChatMessages', enabled.toString())
  }

  getAutoSyncUsage(): boolean {
    const stored = localStorage.getItem('prompd.usage.autoSync')
    // Default to true if not set
    return stored === null ? true : stored === 'true'
  }

  setAutoSyncUsage(enabled: boolean): void {
    localStorage.setItem('prompd.usage.autoSync', enabled.toString())
  }

  // Clear all settings (for debugging/reset)
  clearAll(): void {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('prompd.'))
    keys.forEach(key => localStorage.removeItem(key))
    console.log('[PrompdSettings] Cleared all settings')
  }
}

// Export singleton instance
export const prompdSettings = new PrompdSettingsService()