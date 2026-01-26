/**
 * UI Store
 * Manages UI state: sidebar, modals, theme, view modes
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { SidebarPanel, ModalType, Toast, BuildOutput } from './types'
import { getApiBaseUrl, waitForUserSync, isUserSynced } from '../modules/services/apiConfig'
import { configService } from '../modules/services/configService'

// Module-level flag to prevent concurrent initialization
// This is needed because React StrictMode runs effects twice,
// and Zustand's set() is async, so state checks can race
let isInitializingProviders = false

/**
 * Model info with pricing
 */
export interface ModelWithPricing {
  model: string
  displayName: string
  inputPrice: number | null  // per million tokens
  outputPrice: number | null // per million tokens
  contextWindow?: number
  supportsVision?: boolean
  supportsTools?: boolean
}

/**
 * Provider info with models and pricing
 */
export interface ProviderWithPricing {
  providerId: string
  displayName: string
  hasKey: boolean
  isCustom: boolean
  isLocal?: boolean
  models: ModelWithPricing[]
}

/**
 * LLM Provider types - now supports dynamic providers
 */
export type LLMProvider = string // Support any provider ID

export interface LLMProviderConfig {
  provider: string
  model: string
  // Legacy format for backward compatibility
  availableProviders: {
    openai: { hasKey: boolean; models: string[] }
    anthropic: { hasKey: boolean; models: string[] }
  } | null
  // New format with pricing
  providersWithPricing: ProviderWithPricing[] | null
  isLoading: boolean
  isInitialized: boolean  // Prevents multiple initialization calls
}

/**
 * Recent project entry for welcome screen
 */
export interface RecentProject {
  id: string
  name: string
  path: string
  lastOpened: number  // timestamp
  userId?: string  // user who opened this project
  gitBranch?: string
  gitDirty?: boolean  // has uncommitted changes
  gitChangesCount?: number  // number of uncommitted changes (staged + unstaged)
  gitAhead?: number  // commits ahead of remote
  gitBehind?: number  // commits behind remote
  fileCount?: number  // number of .prmd files
  description?: string  // from .pdproj or package.json
}

/**
 * UI Store State
 */
interface UIState {
  // View mode
  mode: 'wizard' | 'design' | 'code'

  // Default view mode for new .prmd files (user preference)
  defaultViewMode: 'design' | 'code'

  // Sidebar
  showSidebar: boolean
  activeSide: SidebarPanel
  sidebarWidth: number

  // Modals
  activeModal: ModalType

  // Theme
  theme: 'light' | 'dark'

  // Package search
  packageSearchQuery: string

  // Wizard
  wizardState: any | null // WizardState type
  showWizard: boolean

  // LLM Provider (centralized)
  llmProvider: LLMProviderConfig

  // Recent projects for welcome screen
  recentProjects: RecentProject[]

  // Selected .env file for execution (execution context only, not package config)
  selectedEnvFile: string | null

  // Toast notifications
  toasts: Toast[]

  // Build output panel
  buildOutput: BuildOutput
  showBuildPanel: boolean
  buildPanelPinned: boolean

  // Workflow execution panel
  showWorkflowPanel: boolean
  workflowPanelPinned: boolean

  // Workflow connections panel
  showConnectionsPanel: boolean

  // Bottom panel (unified tab interface)
  showBottomPanel: boolean
  activeBottomTab: 'output' | 'execution'
  bottomPanelHeight: number
  bottomPanelPinned: boolean

  // Auto-save settings
  autoSaveEnabled: boolean
}

/**
 * UI Store Actions
 */
interface UIActions {
  // View mode
  setMode: (mode: 'wizard' | 'design' | 'code') => void
  setDefaultViewMode: (mode: 'design' | 'code') => void

  // Sidebar
  toggleSidebar: () => void
  setShowSidebar: (show: boolean) => void
  setActiveSide: (side: SidebarPanel) => void
  setSidebarWidth: (width: number) => void

  // Modals
  openModal: (modal: Exclude<ModalType, null>) => void
  closeModal: () => void

  // Theme
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void

  // Package search
  setPackageSearchQuery: (query: string) => void

  // Wizard
  setWizardState: (state: any | null) => void
  setShowWizard: (show: boolean) => void

  // LLM Provider
  setLLMProvider: (provider: string) => void
  setLLMModel: (model: string) => void
  setAvailableProviders: (providers: LLMProviderConfig['availableProviders']) => void
  setProvidersWithPricing: (providers: ProviderWithPricing[]) => void
  setLLMLoading: (loading: boolean) => void
  initializeLLMProviders: (getToken: () => Promise<string | null>) => Promise<void>
  refreshLLMProviders: (getToken: () => Promise<string | null>) => Promise<void>

  // Recent projects
  addRecentProject: (project: Omit<RecentProject, 'id' | 'lastOpened'>) => void
  updateRecentProject: (path: string, updates: Partial<RecentProject>) => void
  removeRecentProject: (path: string) => void
  clearRecentProjects: () => void

  // Env file selection (execution context)
  setSelectedEnvFile: (file: string | null) => void

  // Toast notifications
  addToast: (message: string, type?: Toast['type'], duration?: number) => string
  removeToast: (id: string) => void
  clearToasts: () => void

  // Build output panel
  setBuildOutput: (output: Partial<BuildOutput>) => void
  clearBuildOutput: () => void
  setShowBuildPanel: (show: boolean) => void
  toggleBuildPanel: () => void
  setBuildPanelPinned: (pinned: boolean) => void

  // Workflow execution panel
  setShowWorkflowPanel: (show: boolean) => void
  toggleWorkflowPanel: () => void
  setWorkflowPanelPinned: (pinned: boolean) => void

  // Workflow connections panel
  setShowConnectionsPanel: (show: boolean) => void
  toggleConnectionsPanel: () => void

  // Bottom panel (unified)
  setShowBottomPanel: (show: boolean) => void
  setActiveBottomTab: (tab: 'output' | 'execution') => void
  setBottomPanelHeight: (height: number) => void
  setBottomPanelPinned: (pinned: boolean) => void

  // Auto-save settings
  setAutoSaveEnabled: (enabled: boolean) => void
}

type UIStore = UIState & UIActions

/**
 * Create UI Store
 */
export const useUIStore = create<UIStore>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          // Initial state
          mode: 'design',
          defaultViewMode: 'design',
          showSidebar: true,
          activeSide: 'explorer',
          sidebarWidth: 280,
          activeModal: null,
          theme: 'dark',
          packageSearchQuery: '',
          wizardState: null,
          showWizard: false,
          llmProvider: {
            provider: 'anthropic',
            model: 'claude-haiku-4-5-20251015', // Default to cheapest
            availableProviders: null,
            providersWithPricing: null,
            isLoading: false,
            isInitialized: false
          },
          recentProjects: [],
          selectedEnvFile: null,
          toasts: [],
          buildOutput: { status: 'idle', message: '' },
          showBuildPanel: false,
          buildPanelPinned: false,
          showWorkflowPanel: false,
          workflowPanelPinned: false,
          showConnectionsPanel: false,
          showBottomPanel: false,
          activeBottomTab: 'output',
          bottomPanelHeight: 200,
          bottomPanelPinned: false,
          autoSaveEnabled: true, // Default to enabled

          // View mode
          setMode: (mode) => set((state) => {
            state.mode = mode
          }),

          setDefaultViewMode: (mode) => set((state) => {
            state.defaultViewMode = mode
          }),

          // Sidebar
          toggleSidebar: () => set((state) => {
            state.showSidebar = !state.showSidebar
          }),

          setShowSidebar: (show) => set((state) => {
            state.showSidebar = show
          }),

          setActiveSide: (side) => set((state) => {
            state.activeSide = side
            state.showSidebar = true
          }),

          setSidebarWidth: (width) => set((state) => {
            state.sidebarWidth = Math.max(200, Math.min(600, width))
          }),

          // Modals
          openModal: (modal) => set((state) => {
            state.activeModal = modal
          }),

          closeModal: () => set((state) => {
            state.activeModal = null
          }),

          // Theme
          setTheme: (theme) => set((state) => {
            state.theme = theme
            // Persist to localStorage
            localStorage.setItem('prompd.theme', theme)
          }),

          toggleTheme: () => set((state) => {
            const newTheme = state.theme === 'light' ? 'dark' : 'light'
            state.theme = newTheme
            localStorage.setItem('prompd.theme', newTheme)
          }),

          // Package search
          setPackageSearchQuery: (query) => set((state) => {
            state.packageSearchQuery = query
          }),

          // Wizard
          setWizardState: (wizardState) => set((state) => {
            state.wizardState = wizardState
          }),

          setShowWizard: (show) => set((state) => {
            state.showWizard = show
          }),

          // LLM Provider
          setLLMProvider: (provider) => set((state) => {
            state.llmProvider.provider = provider
            // Set default model for provider - cheapest options (November 2025)
            if (provider === 'openai') {
              state.llmProvider.model = 'gpt-4.1-nano' // Cheapest OpenAI
            } else {
              state.llmProvider.model = 'claude-haiku-4-5-20251015' // Cheapest Anthropic
            }
          }),

          setLLMModel: (model) => set((state) => {
            state.llmProvider.model = model
          }),

          setAvailableProviders: (providers) => set((state) => {
            state.llmProvider.availableProviders = providers
          }),

          setProvidersWithPricing: (providers) => set((state) => {
            state.llmProvider.providersWithPricing = providers
          }),

          setLLMLoading: (loading) => set((state) => {
            state.llmProvider.isLoading = loading
          }),

          initializeLLMProviders: async (getToken) => {
            // Prevent multiple concurrent initialization calls
            // Use module-level flag for synchronous check (Zustand set is async)
            const currentState = get()
            if (currentState.llmProvider.isInitialized || currentState.llmProvider.isLoading || isInitializingProviders) {
              console.log('[uiStore] initializeLLMProviders skipped - already initialized or loading')
              return
            }

            // Set synchronous flag immediately to prevent race conditions
            isInitializingProviders = true

            console.log('[uiStore] initializeLLMProviders called')
            set((state) => {
              state.llmProvider.isLoading = true
            })

            // Wait for user sync to complete before making API calls
            // This prevents 401 errors when the user hasn't been synced yet
            if (!isUserSynced()) {
              console.log('[uiStore] Waiting for user sync...')
              const synced = await waitForUserSync()
              if (!synced) {
                console.log('[uiStore] User not synced, waiting a bit more...')
                // Give sync a chance to complete (it might have just started)
                await new Promise(resolve => setTimeout(resolve, 500))
              }
            }

            // Get locally configured providers (those with API keys in config.yaml)
            let locallyConfiguredProviders: string[] = []
            if ((window as any).electronAPI?.isElectron) {
              try {
                const { localExecutor } = await import('../modules/services/localExecutor')
                const availableProviders = await localExecutor.getAvailableProviders()
                locallyConfiguredProviders = availableProviders
                  .filter(p => p.hasKey)
                  .map(p => p.name)
                console.log('[uiStore] Locally configured providers:', locallyConfiguredProviders)
              } catch (error) {
                console.warn('[uiStore] Failed to load local providers:', error)
              }
            }

            // Default provider config - filtered by local configuration if in Electron
            // Updated November 2025 with latest models (cheapest first)
            const allDefaultProviders = {
              openai: {
                hasKey: true,
                models: ['gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o', 'o3-mini']
              },
              anthropic: {
                hasKey: true,
                models: ['claude-haiku-4-5-20251015', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514', 'claude-opus-4-5-20251101', 'claude-opus-4-20250514']
              }
            }

            // Filter defaults if we're in Electron and have local config
            // Ensure we always have openai and anthropic keys (even if empty) to satisfy TypeScript
            const shouldFilterToLocal = (window as any).electronAPI?.isElectron && locallyConfiguredProviders.length > 0
            const defaultProviderConfig = {
              openai: shouldFilterToLocal && !locallyConfiguredProviders.includes('openai')
                ? { hasKey: false, models: [] }
                : allDefaultProviders.openai,
              anthropic: shouldFilterToLocal && !locallyConfiguredProviders.includes('anthropic')
                ? { hasKey: false, models: [] }
                : allDefaultProviders.anthropic
            }

            // Default providers with pricing (fallback)
            const allDefaultProvidersWithPricing: ProviderWithPricing[] = [
              {
                providerId: 'anthropic',
                displayName: 'Anthropic',
                hasKey: true,
                isCustom: false,
                models: [
                  { model: 'claude-haiku-4-5-20251015', displayName: 'Claude Haiku 4.5', inputPrice: 0.80, outputPrice: 4.00 },
                  { model: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', inputPrice: 3.00, outputPrice: 15.00 },
                  { model: 'claude-opus-4-5-20251101', displayName: 'Claude Opus 4.5', inputPrice: 15.00, outputPrice: 75.00 }
                ]
              },
              {
                providerId: 'openai',
                displayName: 'OpenAI',
                hasKey: true,
                isCustom: false,
                models: [
                  { model: 'gpt-4o-mini', displayName: 'GPT-4o Mini', inputPrice: 0.15, outputPrice: 0.60 },
                  { model: 'gpt-4o', displayName: 'GPT-4o', inputPrice: 2.50, outputPrice: 10.00 },
                  { model: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', inputPrice: 0.10, outputPrice: 0.40 },
                  { model: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', inputPrice: 0.40, outputPrice: 1.60 }
                ]
              }
            ]

            // Filter defaults if we're in Electron and have local config
            const defaultProvidersWithPricing = (window as any).electronAPI?.isElectron && locallyConfiguredProviders.length > 0
              ? allDefaultProvidersWithPricing.filter(p => locallyConfiguredProviders.includes(p.providerId))
              : allDefaultProvidersWithPricing

            try {
              const token = await getToken()
              console.log('[uiStore] Got token:', token ? 'yes' : 'no')
              if (!token) {
                // No token - still show selector with defaults
                console.log('[uiStore] No token, using defaults')
                set((state) => {
                  state.llmProvider.availableProviders = defaultProviderConfig
                  state.llmProvider.providersWithPricing = defaultProvidersWithPricing
                  state.llmProvider.isLoading = false
                  state.llmProvider.isInitialized = true
                })
                return
              }

              // Fetch available providers with pricing from API
              const rawBase = getApiBaseUrl()
              const API_BASE = rawBase === '/api' ? '' : rawBase.replace(/\/api$/, '')
              console.log('[uiStore] Fetching providers from:', `${API_BASE}/api/llm-providers`)

              // Fetch both endpoints in parallel
              const [providersRes, availableRes] = await Promise.all([
                fetch(`${API_BASE}/api/llm-providers`, {
                  headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE}/api/llm-providers/available`, {
                  headers: { Authorization: `Bearer ${token}` }
                })
              ])

              console.log('[uiStore] Provider response status:', providersRes.status, 'Available response status:', availableRes.status)
              if (!providersRes.ok) {
                throw new Error(`Failed to fetch LLM providers: ${providersRes.status}`)
              }

              const providersData = await providersRes.json()
              const availableData = availableRes.ok ? await availableRes.json() : null
              console.log('[uiStore] Provider data:', providersData)
              console.log('[uiStore] Available data:', availableData)

              // Build providers with pricing from API response
              let providersWithPricing: ProviderWithPricing[] = defaultProvidersWithPricing

              if (availableData?.providers) {
                // Map API response, but fall back to default models if API returns empty models
                const defaultModelsMap: Record<string, ModelWithPricing[]> = {}
                for (const dp of allDefaultProvidersWithPricing) {
                  defaultModelsMap[dp.providerId] = dp.models
                }

                providersWithPricing = availableData.providers.map((p: any) => {
                  const apiModels = (p.models || []).map((m: any) => ({
                    model: m.model,
                    displayName: m.displayName || m.model,
                    inputPrice: m.inputPrice,
                    outputPrice: m.outputPrice,
                    contextWindow: m.contextWindow,
                    supportsVision: m.supportsVision,
                    supportsTools: m.supportsTools
                  }))

                  // If API returned empty models, use default models for known providers
                  const models = apiModels.length > 0
                    ? apiModels
                    : (defaultModelsMap[p.providerId] || [])

                  // In Electron mode, use local config for hasKey instead of backend API
                  const hasKeyFromBackend = providersData.providers?.[p.providerId]?.hasKey ?? false
                  const hasKeyFromLocal = locallyConfiguredProviders.includes(p.providerId)
                  const hasKey = (window as any).electronAPI?.isElectron
                    ? hasKeyFromLocal
                    : hasKeyFromBackend

                  return {
                    providerId: p.providerId,
                    displayName: p.displayName,
                    hasKey,
                    isCustom: p.isCustom ?? false,
                    isLocal: p.isLocal ?? false,
                    models
                  }
                })

                // Filter to only configured providers if in Electron
                if ((window as any).electronAPI?.isElectron && locallyConfiguredProviders.length > 0) {
                  console.log('[uiStore] Filtering providers to locally configured only')
                  providersWithPricing = providersWithPricing.filter(p =>
                    locallyConfiguredProviders.includes(p.providerId)
                  )
                }

                // Filter out disabled providers in Electron mode
                if ((window as any).electronAPI?.isElectron && configService.hasNativeConfig()) {
                  try {
                    const config = await configService.getConfig()
                    const disabledProviders = config.disabled_providers || []
                    if (disabledProviders.length > 0) {
                      console.log('[uiStore] Filtering out disabled providers:', disabledProviders)
                      providersWithPricing = providersWithPricing.filter(p =>
                        !disabledProviders.includes(p.providerId)
                      )
                    }
                  } catch (err) {
                    console.error('[uiStore] Failed to load disabled providers:', err)
                  }
                }

                console.log('[uiStore] Providers with pricing:', providersWithPricing.map(p => ({
                  providerId: p.providerId,
                  hasKey: p.hasKey,
                  modelCount: p.models.length
                })))
              }

              set((state) => {
                // Store the filtered provider list
                state.llmProvider.providersWithPricing = providersWithPricing

                // Build legacy availableProviders format (deprecated, but kept for compatibility)
                // Only includes openai/anthropic if they're in the filtered list
                state.llmProvider.availableProviders = {
                  openai: {
                    hasKey: providersWithPricing.some(p => p.providerId === 'openai'),
                    models: providersWithPricing.find(p => p.providerId === 'openai')?.models.map(m => m.model) || []
                  },
                  anthropic: {
                    hasKey: providersWithPricing.some(p => p.providerId === 'anthropic'),
                    models: providersWithPricing.find(p => p.providerId === 'anthropic')?.models.map(m => m.model) || []
                  }
                }

                // Check if user's saved selection is still valid (provider has configured API key)
                const configuredProviders = providersWithPricing
                const currentProvider = state.llmProvider.provider
                const currentModel = state.llmProvider.model

                // Check if current selection is valid
                const savedProviderStillValid = configuredProviders.some(p => p.providerId === currentProvider)
                const savedModelStillValid = savedProviderStillValid &&
                  configuredProviders.find(p => p.providerId === currentProvider)?.models.some(m => m.model === currentModel)

                // Only auto-select if no valid saved selection
                if (!savedProviderStillValid && configuredProviders.length > 0) {
                  // Find provider with cheapest model
                  let cheapestProvider = configuredProviders[0]
                  let cheapestModel = cheapestProvider.models[0]
                  let cheapestPrice = (cheapestModel?.inputPrice ?? Infinity) + (cheapestModel?.outputPrice ?? Infinity)

                  for (const provider of configuredProviders) {
                    for (const model of provider.models) {
                      const totalPrice = (model.inputPrice ?? Infinity) + (model.outputPrice ?? Infinity)
                      if (totalPrice < cheapestPrice) {
                        cheapestPrice = totalPrice
                        cheapestProvider = provider
                        cheapestModel = model
                      }
                    }
                  }

                  state.llmProvider.provider = cheapestProvider.providerId
                  state.llmProvider.model = cheapestModel?.model || cheapestProvider.models[0]?.model || ''
                } else if (savedProviderStillValid && !savedModelStillValid) {
                  // Provider is valid but model isn't - select cheapest model for that provider
                  const provider = configuredProviders.find(p => p.providerId === currentProvider)
                  if (provider && provider.models.length > 0) {
                    let cheapestModel = provider.models[0]
                    let cheapestPrice = (cheapestModel.inputPrice ?? Infinity) + (cheapestModel.outputPrice ?? Infinity)
                    for (const model of provider.models) {
                      const totalPrice = (model.inputPrice ?? Infinity) + (model.outputPrice ?? Infinity)
                      if (totalPrice < cheapestPrice) {
                        cheapestPrice = totalPrice
                        cheapestModel = model
                      }
                    }
                    state.llmProvider.model = cheapestModel.model
                  }
                } else if (!savedProviderStillValid && configuredProviders.length === 0) {
                  // No configured providers - use fallback defaults
                  if (providersData.providers?.openai?.hasKey) {
                    state.llmProvider.provider = 'openai'
                    state.llmProvider.model = 'gpt-4o-mini'
                  } else if (providersData.providers?.anthropic?.hasKey) {
                    state.llmProvider.provider = 'anthropic'
                    state.llmProvider.model = 'claude-haiku-4-5-20251015'
                  }
                }
                // If savedProviderStillValid && savedModelStillValid, keep current selection

                state.llmProvider.isLoading = false
                state.llmProvider.isInitialized = true
              })
            } catch (error) {
              console.error('[uiStore] Failed to load LLM providers:', error)
              // On error, still show selector with defaults
              console.log('[uiStore] Using default providers due to error')
              set((state) => {
                state.llmProvider.availableProviders = defaultProviderConfig
                state.llmProvider.providersWithPricing = defaultProvidersWithPricing
                state.llmProvider.isLoading = false
                state.llmProvider.isInitialized = true
              })
            }
          },

          // Recent projects
          addRecentProject: (project) => set((state) => {
            const id = `${project.path}-${Date.now()}`
            const existingIndex = state.recentProjects.findIndex(p => p.path === project.path)

            if (existingIndex >= 0) {
              // Update existing and move to top
              state.recentProjects[existingIndex].lastOpened = Date.now()
              state.recentProjects[existingIndex].name = project.name
              if (project.userId !== undefined) state.recentProjects[existingIndex].userId = project.userId
              if (project.gitBranch !== undefined) state.recentProjects[existingIndex].gitBranch = project.gitBranch
              if (project.gitDirty !== undefined) state.recentProjects[existingIndex].gitDirty = project.gitDirty
              if (project.gitChangesCount !== undefined) state.recentProjects[existingIndex].gitChangesCount = project.gitChangesCount
              if (project.gitAhead !== undefined) state.recentProjects[existingIndex].gitAhead = project.gitAhead
              if (project.gitBehind !== undefined) state.recentProjects[existingIndex].gitBehind = project.gitBehind
              if (project.fileCount !== undefined) state.recentProjects[existingIndex].fileCount = project.fileCount
              if (project.description !== undefined) state.recentProjects[existingIndex].description = project.description
              // Move to front
              const [item] = state.recentProjects.splice(existingIndex, 1)
              state.recentProjects.unshift(item)
            } else {
              // Add new project at the beginning
              state.recentProjects.unshift({
                id,
                name: project.name,
                path: project.path,
                lastOpened: Date.now(),
                userId: project.userId,
                gitBranch: project.gitBranch,
                gitDirty: project.gitDirty,
                gitChangesCount: project.gitChangesCount,
                gitAhead: project.gitAhead,
                gitBehind: project.gitBehind,
                fileCount: project.fileCount,
                description: project.description
              })
              // Keep only last 10 projects
              if (state.recentProjects.length > 10) {
                state.recentProjects = state.recentProjects.slice(0, 10)
              }
            }
          }),

          updateRecentProject: (path, updates) => set((state) => {
            const project = state.recentProjects.find(p => p.path === path)
            if (project) {
              Object.assign(project, updates)
            }
          }),

          removeRecentProject: (path) => set((state) => {
            state.recentProjects = state.recentProjects.filter(p => p.path !== path)
          }),

          clearRecentProjects: () => set((state) => {
            state.recentProjects = []
          }),

          // Env file selection (execution context only)
          setSelectedEnvFile: (file) => set((state) => {
            state.selectedEnvFile = file
          }),

          // Toast notifications
          addToast: (message, type = 'info', duration = 5000) => {
            const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
            set((state) => {
              state.toasts.push({ id, message, type, duration })
            })
            // Auto-remove after duration (if not persistent)
            if (duration > 0) {
              setTimeout(() => {
                get().removeToast(id)
              }, duration)
            }
            return id
          },

          removeToast: (id) => set((state) => {
            state.toasts = state.toasts.filter(t => t.id !== id)
          }),

          clearToasts: () => set((state) => {
            state.toasts = []
          }),

          // Build output panel
          setBuildOutput: (output) => set((state) => {
            state.buildOutput = { ...state.buildOutput, ...output }
          }),

          clearBuildOutput: () => set((state) => {
            state.buildOutput = { status: 'idle', message: '' }
          }),

          setShowBuildPanel: (show) => set((state) => {
            state.showBuildPanel = show
          }),

          toggleBuildPanel: () => set((state) => {
            state.showBuildPanel = !state.showBuildPanel
          }),

          setBuildPanelPinned: (pinned) => set((state) => {
            state.buildPanelPinned = pinned
          }),

          // Workflow execution panel
          setShowWorkflowPanel: (show) => set((state) => {
            state.showWorkflowPanel = show
          }),

          toggleWorkflowPanel: () => set((state) => {
            state.showWorkflowPanel = !state.showWorkflowPanel
          }),

          setWorkflowPanelPinned: (pinned) => set((state) => {
            state.workflowPanelPinned = pinned
          }),

          // Workflow connections panel
          setShowConnectionsPanel: (show) => set((state) => {
            state.showConnectionsPanel = show
          }),

          toggleConnectionsPanel: () => set((state) => {
            state.showConnectionsPanel = !state.showConnectionsPanel
          }),

          // Bottom panel (unified)
          setShowBottomPanel: (show) => set((state) => {
            state.showBottomPanel = show
          }),

          setActiveBottomTab: (tab) => set((state) => {
            state.activeBottomTab = tab
            // Show bottom panel when switching tabs
            state.showBottomPanel = true
          }),

          setBottomPanelHeight: (height) => set((state) => {
            state.bottomPanelHeight = height
          }),

          setBottomPanelPinned: (pinned) => set((state) => {
            state.bottomPanelPinned = pinned
          }),

          // Auto-save settings
          setAutoSaveEnabled: (enabled) => set((state) => {
            state.autoSaveEnabled = enabled
          }),

          refreshLLMProviders: async (getToken) => {
            console.log('[uiStore] refreshLLMProviders called - resetting and re-initializing')

            // Reset both module-level and state flags to allow re-initialization
            isInitializingProviders = false
            set((state) => {
              state.llmProvider.isInitialized = false
            })

            // Re-run initialization which will reload local providers and re-filter
            const currentState = get()
            await currentState.initializeLLMProviders(getToken)
          }
        }),
        {
          name: 'prompd-ui-storage',
          partialize: (state) => ({
            theme: state.theme,
            sidebarWidth: state.sidebarWidth,
            showSidebar: state.showSidebar,
            activeSide: state.activeSide,
            defaultViewMode: state.defaultViewMode,
            llmProvider: {
              provider: state.llmProvider.provider,
              model: state.llmProvider.model
            },
            recentProjects: state.recentProjects,
            buildPanelPinned: state.buildPanelPinned,
            workflowPanelPinned: state.workflowPanelPinned,
            activeBottomTab: state.activeBottomTab,
            bottomPanelHeight: state.bottomPanelHeight,
            bottomPanelPinned: state.bottomPanelPinned,
            autoSaveEnabled: state.autoSaveEnabled
          }),
          // After hydration, set mode from defaultViewMode so the app opens in user's preferred view
          onRehydrateStorage: () => (state) => {
            if (state?.defaultViewMode) {
              state.mode = state.defaultViewMode
              console.log('[uiStore] Initialized mode from defaultViewMode:', state.defaultViewMode)
            }
          }
        }
      )
    ),
    { name: 'UIStore' }
  )
)

/**
 * Selectors
 */
export const selectMode = (state: UIStore) => state.mode
export const selectDefaultViewMode = (state: UIStore) => state.defaultViewMode
export const selectTheme = (state: UIStore) => state.theme
export const selectShowSidebar = (state: UIStore) => state.showSidebar
export const selectActiveSide = (state: UIStore) => state.activeSide
export const selectActiveModal = (state: UIStore) => state.activeModal
export const selectLLMProvider = (state: UIStore) => state.llmProvider
export const selectRecentProjects = (state: UIStore) => state.recentProjects
export const selectSelectedEnvFile = (state: UIStore) => state.selectedEnvFile
export const selectToasts = (state: UIStore) => state.toasts
export const selectBuildOutput = (state: UIStore) => state.buildOutput
export const selectShowBuildPanel = (state: UIStore) => state.showBuildPanel
export const selectBuildPanelPinned = (state: UIStore) => state.buildPanelPinned
export const selectShowWorkflowPanel = (state: UIStore) => state.showWorkflowPanel
export const selectWorkflowPanelPinned = (state: UIStore) => state.workflowPanelPinned
export const selectAutoSaveEnabled = (state: UIStore) => state.autoSaveEnabled
