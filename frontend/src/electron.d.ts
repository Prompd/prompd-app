// Type definitions for Electron API exposed via preload script

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown  // Will be JSON.stringify'd
}

export interface ApiRequestResponse {
  success: boolean
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
  ok?: boolean
  error?: string
}

export interface ElectronAPI {
  // System info
  getHomePath: () => Promise<string>

  // Environment variables (filtered by prefix for security)
  // Returns env vars with prefix stripped: PROMPD_API_KEY -> { API_KEY: value }
  getSystemEnvVars: (prefix: string) => Promise<Record<string, string>>

  // File dialogs
  openFile: () => Promise<string | null>
  openFolder: () => Promise<string | null>
  saveFile: (defaultPath?: string) => Promise<string | null>
  showOpenDialog: (options: {
    properties?: ('openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles')[]
    filters?: Array<{ name: string; extensions: string[] }>
    defaultPath?: string
    title?: string
  }) => Promise<string[] | null>

  // File system operations
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  readBinaryFile: (filePath: string) => Promise<{ success: boolean; data?: string; size?: number; error?: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  readDir: (dirPath: string) => Promise<{
    success: boolean
    files?: Array<{ name: string; isDirectory: boolean; path: string }>
    error?: string
  }>
  createDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>

  // Shell operations
  showItemInFolder: (itemPath: string) => Promise<{ success: boolean; error?: string }>
  openPath: (folderPath: string) => Promise<{ success: boolean; error?: string }>

  // Git operations
  runGitCommand: (args: string[], cwd?: string) => Promise<{ success: boolean; output: string }>
  findGitRoot: (startPath?: string) => Promise<{ success: boolean; path?: string; error?: string }>

  // API requests (bypasses CORS by using main process)
  apiRequest: (url: string, options: ApiRequestOptions) => Promise<ApiRequestResponse>

  // Connection testing (for workflow connections)
  testSSHConnection?: (config: { host: string; port?: number; username?: string }) => Promise<{ success: boolean; message: string }>
  testDatabaseConnection?: (config: { host: string; port?: number; type?: string }) => Promise<{ success: boolean; message: string }>
  testMCPConnection?: (config: { serverUrl: string }) => Promise<{ success: boolean; message: string }>

  // Agent command execution (for workflow Command nodes and AI agent tool calls)
  runCommand: (command: string, cwd?: string) => Promise<{ success: boolean; output: string; exitCode?: number }>

  // Workspace management
  getWorkspacePath: () => Promise<string | null>
  setWorkspacePath: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>

  // Window focus (fix for input fields becoming readonly after native dialogs)
  focusWindow: () => Promise<void>

  // Deep linking and file associations
  getPendingFile: () => Promise<string | null>
  getPendingProtocolUrl: () => Promise<string | null>
  onFileOpen: (callback: (filePath: string) => void) => () => void
  onProtocolUrl: (callback: (url: string) => void) => () => void

  // Menu event handlers (from Electron menu bar)
  // Each returns an unsubscribe function for cleanup
  // Prompd menu
  onMenuApiKeys: (callback: () => void) => () => void
  onMenuSettings: (callback: () => void) => () => void
  onMenuSchedulerSettings: (callback: () => void) => () => void
  onMenuSchedulerService: (callback: () => void) => () => void
  // Project menu
  onMenuNewFile: (callback: () => void) => () => void
  onMenuOpenFile: (callback: (filePath: string) => void) => () => void
  onMenuOpenFolder: (callback: (folderPath: string) => void) => () => void
  onMenuCloseFolder: (callback: () => void) => () => void
  onMenuOpenProject: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void
  onMenuSaveAs: (callback: () => void) => () => void
  onMenuSaveProject: (callback: () => void) => () => void
  onMenuManageProjects: (callback: () => void) => () => void
  // Package menu
  onMenuPackageCreate: (callback: () => void) => () => void
  onMenuPackagePublish: (callback: () => void) => () => void
  onMenuPackageInstall: (callback: () => void) => () => void
  // Run menu
  onMenuRunExecute: (callback: () => void) => () => void
  onMenuRunStop: (callback: () => void) => () => void
  // View menu
  onMenuToggleSidebar: (callback: (panel: string) => void) => () => void
  onMenuSetViewMode: (callback: (mode: string) => void) => () => void
  onMenuToggleTheme: (callback: () => void) => () => void
  onMenuToggleProblemsPanel: (callback: () => void) => () => void
  onMenuCommandPalette: (callback: () => void) => () => void

  // Clerk OAuth authentication
  auth: {
    startOAuth: () => Promise<{ success: boolean; error?: string }>
    exchangeCode: (code: string) => Promise<{ success: boolean; tokens?: unknown; error?: string }>
    getConfig: () => Promise<{ clientId: string; frontendApi: string; redirectUri: string }>
    signOut: (idToken?: string) => Promise<{ success: boolean; error?: string }>
  }

  // App control
  showMenu: () => Promise<boolean>
  updateMenuState: (state: {
    hasWorkspace?: boolean
    hasActiveTab?: boolean
    isPrompdFile?: boolean
    canExecute?: boolean
  }) => Promise<boolean>

  // Platform info
  platform: string
  isElectron: boolean

  // Slash command execution (uses @prompd/cli in main process)
  executeSlashCommand?: (
    commandId: string,
    args: string,
    context: {
      fileContent?: string
      fileName?: string
      workspacePath?: string
      registryUrl?: string
    }
  ) => Promise<{ success: boolean; output: string; data?: unknown; error?: string }>
  listPrmdFiles?: (workspacePath: string) => Promise<{ success: boolean; files: string[]; error?: string }>

  // Config management (reads/writes ~/.prompd/config.yaml)
  // Shared config with @prompd/cli - same format, same locations
  config?: {
    // Load merged config following hierarchy: env > local > global > defaults
    load: (workspacePath?: string) => Promise<{
      success: boolean
      config?: PrompdConfig
      sources?: {
        globalPath: string
        localPath: string | null
        hasGlobal: boolean
        hasLocal: boolean
      }
      error?: string
    }>

    // Save config to file (location: 'global' | 'local')
    save: (
      config: PrompdConfig,
      location: 'global' | 'local',
      workspacePath?: string
    ) => Promise<{ success: boolean; path?: string; error?: string }>

    // Get API key for a provider (checks env vars first, then config)
    getApiKey: (
      provider: string,
      workspacePath?: string
    ) => Promise<{
      success: boolean
      apiKey?: string | null
      source?: 'env' | 'config' | 'custom_provider' | null
      error?: string
    }>

    // Set API key for a provider (always saves to global config)
    setApiKey: (
      provider: string,
      apiKey: string
    ) => Promise<{ success: boolean; error?: string }>

    // Get registry URL from config
    getRegistryUrl: (
      registryName?: string,
      workspacePath?: string
    ) => Promise<{
      success: boolean
      url?: string
      name?: string
      error?: string
    }>

    // Get list of configured providers with their status
    getProviders: (workspacePath?: string) => Promise<{
      success: boolean
      providers?: ProviderInfo[]
      defaultProvider?: string
      defaultModel?: string
      error?: string
    }>

    // Clear config cache (force reload on next access)
    clearCache: () => Promise<{ success: boolean }>
  }

  // Local compilation using @prompd/cli library
  compiler?: {
    // Compile a prompt to specified format
    compile: (
      content: string,
      options?: CompileOptions
    ) => Promise<CompileResult>

    // Compile with detailed context (errors, warnings, stages, dependencies)
    compileWithContext: (
      content: string,
      options?: CompileOptions
    ) => Promise<CompileContextResult>

    // Validate a prompt without full compilation
    validate: (content: string) => Promise<ValidateResult>

    // Get compiler version and capabilities
    info: () => Promise<CompilerInfo>

    // Get structured diagnostics with line numbers for IDE integration
    getDiagnostics: (
      content: string,
      options?: CompileOptions
    ) => Promise<DiagnosticsResult>
  }

  // Local package creation using @prompd/cli library
  package?: {
    // Create package from prompd.json in workspace
    createLocal: (
      workspacePath: string,
      outputDir?: string
    ) => Promise<CreatePackageResult>

    // Install all dependencies from prompd.json
    installAll: (workspacePath: string) => Promise<InstallAllResult>
  }

  // Workflow trigger management (schedule, webhook, file-watch)
  trigger?: {
    register: (config: TriggerConfig) => Promise<{ success: boolean; error?: string }>
    unregister: (workflowId: string) => Promise<{ success: boolean; error?: string }>
    setEnabled: (workflowId: string, enabled: boolean) => Promise<{ success: boolean }>
    list: () => Promise<{ success: boolean; triggers: TriggerConfig[] }>
    status: (workflowId: string) => Promise<{ success: boolean; status?: TriggerStatus }>
    history: (workflowId: string, limit?: number) => Promise<{ success: boolean; executions: TriggerExecution[] }>
    webhookServerInfo: () => Promise<{ success: boolean; running: boolean; port?: number; endpoints: WebhookEndpoint[] }>
    trayState: () => Promise<TriggerState>
    updateSettings: (settings: TriggerSettings) => Promise<void>
    addWorkflow: () => Promise<{ success: boolean; workflowId?: string; triggerConfig?: TriggerConfig; error?: string }>
    runManually: (workflowId: string) => Promise<void>
  }

  // Trigger event listeners
  onTriggerExecutionStart?: (callback: (data: { workflowId: string; executionId: string }) => void) => () => void
  onTriggerExecutionComplete?: (callback: (data: { workflowId: string; executionId: string; status: string }) => void) => () => void
  onTriggerStatusChange?: (callback: (data: { workflowId: string; enabled: boolean }) => void) => () => void

  // Service management (for standalone scheduler service)
  startService?: () => Promise<{ success: boolean; message?: string; error?: string }>
  stopService?: () => Promise<{ success: boolean; message?: string; error?: string }>
  restartService?: () => Promise<{ success: boolean; message?: string; error?: string }>
  getServiceStatus?: () => Promise<{
    success: boolean
    running: boolean
    port?: number
    uptime?: number
    error?: string
  }>
  saveServiceConfig?: (config: ServiceConfig) => Promise<{ success: boolean; error?: string }>
  loadServiceConfig?: () => Promise<{ success: boolean; config?: ServiceConfig; error?: string }>

  // Scheduler API (for tray mode scheduling)
  scheduler?: {
    getSchedules: () => Promise<{ success: boolean; schedules?: ScheduleInfo[]; error?: string }>
    addSchedule: (config: ScheduleConfig) => Promise<{ success: boolean; scheduleId?: string; error?: string }>
    createSchedule: (config: ScheduleConfig) => Promise<{ success: boolean; scheduleId?: string; error?: string }>
    updateSchedule: (scheduleId: string, config: Partial<ScheduleConfig>) => Promise<{ success: boolean; error?: string }>
    deleteSchedule: (scheduleId: string) => Promise<{ success: boolean; error?: string }>
    executeNow: (scheduleId: string) => Promise<{ success: boolean; error?: string }>
    getHistory: (workflowId?: string | null, options?: { limit?: number }) => Promise<{ success: boolean; history?: ScheduleExecution[]; error?: string }>
    getNextRunTimes: (scheduleId: string, count: number) => Promise<{ success: boolean; times?: number[]; error?: string }>
  }

  // Memory service API (for persistent memory storage via IPC)
  memory?: {
    get: (scope: string, namespace: string, key: string) => Promise<unknown>
    set: (scope: string, namespace: string, key: string, value: unknown, ttl?: number) => Promise<void>
    delete: (scope: string, namespace: string, key: string) => Promise<void>
    list: (scope: string, namespace: string) => Promise<string[]>
    clear: (scope: string, namespace: string) => Promise<void>
  }

  // Workflow execution API (proxies to @prompd/cli in main process)
  workflow?: {
    // Execute workflow (non-blocking, returns executionId immediately)
    execute: (workflow: unknown, params: Record<string, unknown>, options?: unknown) => Promise<{ executionId: string }>

    // Listen to execution events (single event loop with type-based routing)
    onEvent: (callback: (event: WorkflowExecutionEvent) => void) => () => void

    // Cancel execution
    cancel: (executionId: string) => Promise<void>

    // Download trace (shows save dialog and writes to disk)
    downloadTrace: (trace: unknown, filename?: string) => Promise<{ success: boolean; filePath?: string; cancelled?: boolean }>

    // Respond to user input request (bidirectional IPC)
    respondToUserInput: (requestId: string, response: unknown) => Promise<void>

    // Respond to checkpoint request (bidirectional IPC)
    respondToCheckpoint: (requestId: string, shouldContinue: boolean) => Promise<void>
  }
}

// Workflow execution event types (single event channel with type-based routing)
// Discriminated union allows TypeScript to narrow types based on event.type
export type WorkflowExecutionEvent =
  | { type: 'node-start'; executionId: string; nodeId: string; timestamp: number }
  | { type: 'node-complete'; executionId: string; nodeId: string; data: { output: unknown }; timestamp: number }
  | { type: 'node-error'; executionId: string; nodeId: string; data: { error: string }; timestamp: number }
  | { type: 'progress'; executionId: string; data: unknown; timestamp: number }
  | { type: 'trace-entry'; executionId: string; data: unknown; timestamp: number }
  | { type: 'checkpoint'; executionId: string; data: unknown; timestamp: number }
  | { type: 'complete'; executionId: string; data: unknown; timestamp: number }
  | { type: 'error'; executionId: string; data: { error: string; stack?: string }; timestamp: number }
  | { type: 'user-input-request'; executionId: string; requestId: string; data: unknown; timestamp: number }
  | { type: 'checkpoint-request'; executionId: string; requestId: string; data: unknown; timestamp: number }

// Compilation types
export interface CompileOptions {
  format?: 'markdown' | 'openai' | 'anthropic' | 'json'
  parameters?: Record<string, unknown>
  filePath?: string  // Full disk path to source file
  registryUrl?: string
  verbose?: boolean
}

export interface CompileResult {
  success: boolean
  output?: string
  error?: string
  metadata: {
    compilationTime: number
    outputSize?: number
    format?: string
  }
}

export interface CompileContextResult {
  success: boolean
  output?: string
  error?: string
  errors: string[]
  warnings: string[]
  metadata: {
    compilationTime: number
    outputSize?: number
    format?: string
    stages?: unknown[]
    dependencies?: unknown[]
    parameters?: Record<string, unknown>
  }
}

export interface ValidateResult {
  success: boolean
  isValid: boolean
  issues: Array<{
    type: 'error' | 'warning'
    message: string
  }>
  error?: string
  parsed?: {
    hasMetadata: boolean
    hasBody: boolean
    parameters: string[]
    inherits?: string
  }
}

export interface CompilerInfo {
  success: boolean
  version?: string
  capabilities?: {
    formats: string[]
    features: string[]
    stages: string[]
  }
  error?: string
}

export interface CompilationDiagnostic {
  /** The diagnostic message */
  message: string
  /** Severity level */
  severity: 'error' | 'warning' | 'info'
  /** Source stage that generated this diagnostic */
  source?: string
  /** Starting line number (1-indexed) */
  line?: number
  /** Starting column number (1-indexed) */
  column?: number
  /** Ending line number (1-indexed) */
  endLine?: number
  /** Ending column number (1-indexed) */
  endColumn?: number
  /** Optional error code for quick-fix identification */
  code?: string
  /** File path if different from main source file */
  file?: string
}

export interface DiagnosticsResult {
  success: boolean
  diagnostics: CompilationDiagnostic[]
  error?: string
}

// Package creation result
export interface CreatePackageResult {
  success: boolean
  outputPath?: string
  fileName?: string
  size?: number
  fileCount?: number
  message?: string
  error?: string
  log?: string  // Detailed build log for raw output display
}

// Package install all result
export interface InstallAllResult {
  success: boolean
  message: string
  installed?: Array<{
    name: string
    version: string
    status: 'installed' | 'cached' | 'skipped'
  }>
  failed?: Array<{
    name: string
    version: string
    error: string
  }>
  error?: string
}

// Trigger types for workflow automation
export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'file-watch'

export interface TriggerConfig {
  workflowId: string
  workflowPath: string
  workflowName?: string
  enabled: boolean
  triggerType: TriggerType
  // Schedule config
  scheduleType?: 'cron' | 'interval'
  scheduleCron?: string
  scheduleIntervalMs?: number
  scheduleTimezone?: string
  // Webhook config
  webhookPath?: string
  webhookSecret?: string
  webhookMethods?: string[]
  // File watch config
  fileWatchPaths?: string[]
  fileWatchEvents?: ('create' | 'modify' | 'delete')[]
  fileWatchDebounceMs?: number
  // Status
  lastTriggered?: number
  lastStatus?: 'success' | 'failed'
  lastError?: string
  createdAt: number
}

export interface TriggerStatus {
  enabled: boolean
  lastTriggered?: number
  lastStatus?: 'success' | 'failed'
  lastError?: string
  nextRun?: string
}

export interface TriggerExecution {
  executionId: string
  workflowId: string
  triggeredAt: number
  completedAt?: number
  status: 'pending' | 'running' | 'success' | 'failed'
  error?: string
  output?: unknown
}

export interface WebhookEndpoint {
  path: string
  workflowId: string
  methods: string[]
}

export interface TriggerState {
  activeWorkflows: number
  scheduledTriggers: number
  fileWatchers: number
  webhookServerRunning: boolean
  webhookPort?: number
  nextScheduledRun?: string
}

export interface TriggerSettings {
  webhookPort?: number
  maxConcurrentExecutions?: number
  notificationsEnabled?: boolean
  minimizeToTray?: boolean
}

// Service configuration types (for standalone scheduler service)
export interface ServiceConfig {
  port: number
  host: string
  enableWebhooks: boolean
  dbPath: string
}

// Scheduler types (for tray mode)
export interface ScheduleConfig {
  workflowId?: string
  workflowPath: string
  name: string
  cronExpression: string
  timezone: string
  enabled: boolean
  parameters: Record<string, unknown>
}

export interface ScheduleInfo {
  id: string
  workflowId: string
  workflowPath: string
  name: string
  cronExpression: string
  timezone: string
  enabled: boolean
  parameters: Record<string, unknown>
  nextRunAt?: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'error' | 'skipped'
  createdAt: number
  updatedAt: number
}

export interface ScheduleExecution {
  id: string
  scheduleId: string
  workflowId: string
  trigger: 'manual' | 'schedule' | 'webhook'
  status: 'success' | 'error' | 'cancelled'
  result?: unknown
  error?: string
  startedAt: number
  completedAt?: number
}

// Config types matching ~/.prompd/config.yaml schema
export interface PrompdConfig {
  default_provider?: string
  default_model?: string
  api_keys?: Record<string, string>
  custom_providers?: Record<string, CustomProviderConfig>
  provider_configs?: Record<string, unknown>
  registry?: RegistryConfig
  scopes?: Record<string, string>
  timeout?: number
  max_retries?: number
  verbose?: boolean
  disabled_providers?: string[]  // List of provider IDs to disable (preserves API keys)
}

export interface CustomProviderConfig {
  base_url: string
  api_key?: string
  models?: string[]
  type?: string
  enabled?: boolean
}

export interface RegistryConfig {
  default?: string
  current_namespace?: string
  registries?: Record<string, RegistryEntry>
}

export interface RegistryEntry {
  url: string
  api_key?: string
  username?: string
}

export interface ProviderInfo {
  name: string
  type: 'standard' | 'openai-compatible' | string
  configured: boolean
  baseUrl?: string
  models: string[]
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
