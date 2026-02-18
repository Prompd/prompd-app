const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System info (via IPC - os module not available in sandbox)
  getHomePath: () => ipcRenderer.invoke('system:getHomePath'),

  // Environment variables (filtered by prefix for security)
  // Only PROMPD_* vars are exposed - returns { VAR_NAME: value } with prefix stripped
  getSystemEnvVars: (prefix) => ipcRenderer.invoke('env:getFiltered', prefix),

  // Theme
  setNativeTheme: (theme) => ipcRenderer.send('app:set-native-theme', theme),

  // File dialogs
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFile: (defaultPath) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  selectFileFromWorkspace: (workspacePath, title) => ipcRenderer.invoke('dialog:selectFileFromWorkspace', workspacePath, title),

  // File system operations
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readBinaryFile: (filePath) => ipcRenderer.invoke('fs:readBinaryFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  createDir: (dirPath) => ipcRenderer.invoke('fs:createDir', dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  delete: (targetPath, options) => ipcRenderer.invoke('fs:delete', targetPath, options),

  // Shell operations (reveal in explorer, open folder, open URL)
  showItemInFolder: (itemPath) => ipcRenderer.invoke('shell:showItemInFolder', itemPath),
  openPath: (folderPath) => ipcRenderer.invoke('shell:openPath', folderPath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Git operations
  runGitCommand: (args, cwd) => ipcRenderer.invoke('git:runCommand', args, cwd),
  findGitRoot: (startPath) => ipcRenderer.invoke('git:findRoot', startPath),

  // API requests (bypasses CORS by using main process)
  apiRequest: (url, options) => ipcRenderer.invoke('api:request', url, options),

  // Custom title bar support
  platform: process.platform,
  triggerMenuAction: (action, ...args) => ipcRenderer.invoke('menu:trigger', action, ...args),
  getWindowTitle: () => ipcRenderer.invoke('app:getWindowTitle'),
  onWindowTitleChanged: (callback) => {
    const handler = (_event, title) => callback(title)
    ipcRenderer.on('window-title-changed', handler)
    return () => ipcRenderer.removeListener('window-title-changed', handler)
  },
  getMenuState: () => ipcRenderer.invoke('app:getMenuState'),
  onMenuStateChanged: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('menu-state-changed', handler)
    return () => ipcRenderer.removeListener('menu-state-changed', handler)
  },
  // Edit operations (for custom menu bar)
  editUndo: () => ipcRenderer.invoke('edit:undo'),
  editRedo: () => ipcRenderer.invoke('edit:redo'),
  editCut: () => ipcRenderer.invoke('edit:cut'),
  editCopy: () => ipcRenderer.invoke('edit:copy'),
  editPaste: () => ipcRenderer.invoke('edit:paste'),
  editDelete: () => ipcRenderer.invoke('edit:delete'),
  editSelectAll: () => ipcRenderer.invoke('edit:selectAll'),
  // View operations (for custom menu bar)
  viewReload: () => ipcRenderer.invoke('view:reload'),
  viewForceReload: () => ipcRenderer.invoke('view:forceReload'),
  viewToggleDevTools: () => ipcRenderer.invoke('view:toggleDevTools'),
  viewResetZoom: () => ipcRenderer.invoke('view:resetZoom'),
  viewZoomIn: () => ipcRenderer.invoke('view:zoomIn'),
  viewZoomOut: () => ipcRenderer.invoke('view:zoomOut'),
  viewToggleFullscreen: () => ipcRenderer.invoke('view:toggleFullscreen'),
  // File/App operations (for custom menu bar)
  openFileDialog: () => ipcRenderer.invoke('menu:openFileDialog'),
  openFolderDialog: () => ipcRenderer.invoke('menu:openFolderDialog'),
  closeFolder: () => ipcRenderer.invoke('menu:closeFolder'),
  quit: () => ipcRenderer.invoke('app:quit'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),

  // Connection testing
  testSSHConnection: (config) => ipcRenderer.invoke('connection:testSSH', config),
  testDatabaseConnection: (config) => ipcRenderer.invoke('connection:testDatabase', config),
  testMCPConnection: (config) => ipcRenderer.invoke('connection:testMCP', config),

  // Agent command execution (for AI agent tool calls)
  runCommand: (command, cwd) => ipcRenderer.invoke('agent:runCommand', command, cwd),

  // Get current working directory (for git operations)
  getWorkspacePath: () => ipcRenderer.invoke('workspace:getPath'),
  setWorkspacePath: (path) => ipcRenderer.invoke('workspace:setPath', path),

  // Window focus (fix for input fields becoming readonly after native dialogs)
  focusWindow: () => ipcRenderer.invoke('window:focus'),

  // Deep linking and file associations
  getPendingFile: () => ipcRenderer.invoke('app:getPendingFile'),
  getPendingProtocolUrl: () => ipcRenderer.invoke('app:getPendingProtocolUrl'),
  onFileOpen: (callback) => {
    const handler = (event, filePath) => callback(filePath)
    ipcRenderer.on('file-open', handler)
    return () => ipcRenderer.removeListener('file-open', handler)
  },
  onProtocolUrl: (callback) => {
    const handler = (event, url) => callback(url)
    ipcRenderer.on('protocol-url', handler)
    return () => ipcRenderer.removeListener('protocol-url', handler)
  },

  // Menu events (from Electron menu bar)
  // Each returns an unsubscribe function for cleanup
  // Prompd menu
  onMenuApiKeys: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-api-keys', handler)
    return () => ipcRenderer.removeListener('menu-api-keys', handler)
  },
  onMenuSettings: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-settings', handler)
    return () => ipcRenderer.removeListener('menu-settings', handler)
  },
  onMenuSchedulerSettings: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-scheduler-settings', handler)
    return () => ipcRenderer.removeListener('menu-scheduler-settings', handler)
  },
  onMenuSchedulerService: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-scheduler-service', handler)
    return () => ipcRenderer.removeListener('menu-scheduler-service', handler)
  },
  onMenuAbout: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-about', handler)
    return () => ipcRenderer.removeListener('menu-about', handler)
  },
  // Project menu
  onMenuNewFile: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-new-file', handler)
    return () => ipcRenderer.removeListener('menu-new-file', handler)
  },
  onMenuOpenFile: (callback) => {
    const handler = (event, filePath) => callback(filePath)
    ipcRenderer.on('menu-open-file', handler)
    return () => ipcRenderer.removeListener('menu-open-file', handler)
  },
  onMenuOpenFolder: (callback) => {
    const handler = (event, folderPath) => callback(folderPath)
    ipcRenderer.on('menu-open-folder', handler)
    return () => ipcRenderer.removeListener('menu-open-folder', handler)
  },
  onMenuCloseFolder: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-close-folder', handler)
    return () => ipcRenderer.removeListener('menu-close-folder', handler)
  },
  onMenuCloseTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-close-tab', handler)
    return () => ipcRenderer.removeListener('menu-close-tab', handler)
  },
  onMenuCloseAllTabs: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-close-all-tabs', handler)
    return () => ipcRenderer.removeListener('menu-close-all-tabs', handler)
  },
  onMenuOpenProject: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-open-project', handler)
    return () => ipcRenderer.removeListener('menu-open-project', handler)
  },
  onMenuSave: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-save', handler)
    return () => ipcRenderer.removeListener('menu-save', handler)
  },
  onMenuSaveAs: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-save-as', handler)
    return () => ipcRenderer.removeListener('menu-save-as', handler)
  },
  onMenuSaveProject: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-save-project', handler)
    return () => ipcRenderer.removeListener('menu-save-project', handler)
  },
  onMenuManageProjects: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-manage-projects', handler)
    return () => ipcRenderer.removeListener('menu-manage-projects', handler)
  },
  // Package menu
  onMenuPackageCreate: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-package-create', handler)
    return () => ipcRenderer.removeListener('menu-package-create', handler)
  },
  onMenuPackagePublish: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-package-publish', handler)
    return () => ipcRenderer.removeListener('menu-package-publish', handler)
  },
  onMenuPackageDeploy: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-package-deploy', handler)
    return () => ipcRenderer.removeListener('menu-package-deploy', handler)
  },
  onMenuDeploymentManage: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-deployment-manage', handler)
    return () => ipcRenderer.removeListener('menu-deployment-manage', handler)
  },
  onMenuPackageInstall: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-package-install', handler)
    return () => ipcRenderer.removeListener('menu-package-install', handler)
  },
  // Run menu
  onMenuRunExecute: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-run-execute', handler)
    return () => ipcRenderer.removeListener('menu-run-execute', handler)
  },
  onMenuRunInstall: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-run-install', handler)
    return () => ipcRenderer.removeListener('menu-run-install', handler)
  },
  onMenuRunStop: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-run-stop', handler)
    return () => ipcRenderer.removeListener('menu-run-stop', handler)
  },
  // View menu
  onMenuToggleSidebar: (callback) => {
    const handler = (event, panel) => callback(panel)
    ipcRenderer.on('menu-toggle-sidebar', handler)
    return () => ipcRenderer.removeListener('menu-toggle-sidebar', handler)
  },
  onMenuSetViewMode: (callback) => {
    const handler = (event, mode) => callback(mode)
    ipcRenderer.on('menu-set-view-mode', handler)
    return () => ipcRenderer.removeListener('menu-set-view-mode', handler)
  },
  onMenuToggleTheme: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-toggle-theme', handler)
    return () => ipcRenderer.removeListener('menu-toggle-theme', handler)
  },
  onMenuToggleOutputPanel: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-toggle-output-panel', handler)
    return () => ipcRenderer.removeListener('menu-toggle-output-panel', handler)
  },
  onMenuCommandPalette: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-command-palette', handler)
    return () => ipcRenderer.removeListener('menu-command-palette', handler)
  },
  // Clerk OAuth authentication
  auth: {
    startOAuth: () => ipcRenderer.invoke('auth:startOAuth'),
    exchangeCode: (code) => ipcRenderer.invoke('auth:exchangeCode', code),
    getConfig: () => ipcRenderer.invoke('auth:getConfig'),
    signOut: (idToken) => ipcRenderer.invoke('auth:signOut', idToken)
  },

  // App control
  showMenu: () => ipcRenderer.invoke('app:showMenu'),
  updateMenuState: (state) => ipcRenderer.invoke('app:updateMenuState', state),

  // Hotkey management - sync user-customized hotkeys to Electron menu accelerators
  updateHotkeys: (accelerators) => ipcRenderer.invoke('app:updateHotkeys', accelerators),

  // Power/sleep events (to prevent unwanted reloads on wake)
  onPowerSuspend: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('power-suspend', handler)
    return () => ipcRenderer.removeListener('power-suspend', handler)
  },
  onPowerResume: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('power-resume', handler)
    return () => ipcRenderer.removeListener('power-resume', handler)
  },
  onPowerLock: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('power-lock', handler)
    return () => ipcRenderer.removeListener('power-lock', handler)
  },
  onPowerUnlock: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('power-unlock', handler)
    return () => ipcRenderer.removeListener('power-unlock', handler)
  },

  // Platform info
  platform: process.platform,
  isElectron: true,

  // Slash command execution (uses @prompd/cli in main process)
  executeSlashCommand: (commandId, args, context) =>
    ipcRenderer.invoke('slashCommand:execute', commandId, args, context),
  listPrmdFiles: (workspacePath) =>
    ipcRenderer.invoke('slashCommand:listPrmdFiles', workspacePath),

  // Config management (reads/writes ~/.prompd/config.yaml)
  // Shared config with @prompd/cli - same format, same locations
  config: {
    // Load merged config following hierarchy: env > local > global > defaults
    load: (workspacePath) => ipcRenderer.invoke('config:load', workspacePath),

    // Save config to file (location: 'global' | 'local')
    save: (config, location, workspacePath) =>
      ipcRenderer.invoke('config:save', config, location, workspacePath),

    // Get API key for a provider (checks env vars first, then config)
    getApiKey: (provider, workspacePath) =>
      ipcRenderer.invoke('config:getApiKey', provider, workspacePath),

    // Set API key for a provider (always saves to global config)
    setApiKey: (provider, apiKey) =>
      ipcRenderer.invoke('config:setApiKey', provider, apiKey),

    // Get registry URL from config
    getRegistryUrl: (registryName, workspacePath) =>
      ipcRenderer.invoke('config:getRegistryUrl', registryName, workspacePath),

    // Get list of configured providers with their status
    getProviders: (workspacePath) =>
      ipcRenderer.invoke('config:getProviders', workspacePath),

    // Clear config cache (force reload on next access)
    clearCache: () => ipcRenderer.invoke('config:clearCache')
  },

  // Connection storage (workspace-level persistence with safeStorage encryption)
  connections: {
    load: (workspacePath) => ipcRenderer.invoke('connections:load', workspacePath),
    save: (connections, workspacePath) =>
      ipcRenderer.invoke('connections:save', connections, workspacePath),
  },

  // MCP client management (config, connections, tool discovery, registry search)
  mcp: {
    listServers: () => ipcRenderer.invoke('mcp:listServers'),
    addServer: (name, config) => ipcRenderer.invoke('mcp:addServer', name, config),
    removeServer: (name) => ipcRenderer.invoke('mcp:removeServer', name),
    testConnection: (serverName, config) => ipcRenderer.invoke('mcp:testConnection', serverName, config),
    connect: (serverName) => ipcRenderer.invoke('mcp:connect', serverName),
    disconnect: (serverName) => ipcRenderer.invoke('mcp:disconnect', serverName),
    listTools: (serverName) => ipcRenderer.invoke('mcp:listTools', serverName),
    callTool: (serverName, toolName, args) => ipcRenderer.invoke('mcp:callTool', serverName, toolName, args),
    searchRegistry: (query, limit) => ipcRenderer.invoke('mcp:searchRegistry', query, limit),
  },

  // MCP server (Prompd-as-server for OpenClaw and other MCP clients)
  mcpServer: {
    start: (opts) => ipcRenderer.invoke('mcpServer:start', opts),
    stop: () => ipcRenderer.invoke('mcpServer:stop'),
    status: () => ipcRenderer.invoke('mcpServer:status'),
    getConfig: (format) => ipcRenderer.invoke('mcpServer:getConfig', format),
    regenerateApiKey: () => ipcRenderer.invoke('mcpServer:regenerateApiKey'),
    getClients: () => ipcRenderer.invoke('mcpServer:getClients'),
  },

  // Local compilation using @prompd/cli library
  // Compiles prompts without needing the backend
  compiler: {
    // Compile a prompt to specified format
    // options: { format, parameters, files, registryUrl, verbose }
    compile: (content, options) =>
      ipcRenderer.invoke('compiler:compile', content, options),

    // Compile with detailed context (errors, warnings, stages, dependencies)
    compileWithContext: (content, options) =>
      ipcRenderer.invoke('compiler:compileWithContext', content, options),

    // Validate a prompt without full compilation
    validate: (content) =>
      ipcRenderer.invoke('compiler:validate', content),

    // Get structured diagnostics from full compilation
    // Returns: { success, diagnostics[], hasErrors, errorCount, warningCount }
    // Each diagnostic: { message, severity, source?, line?, column?, endLine?, endColumn?, code? }
    getDiagnostics: (content, options) =>
      ipcRenderer.invoke('compiler:getDiagnostics', content, options),

    // Get compiler version and capabilities
    info: () =>
      ipcRenderer.invoke('compiler:info')
  },

  // Local package creation using @prompd/cli library
  // Creates .pdpkg packages without needing the backend
  package: {
    // Create package from prompd.json in workspace
    // Returns: { success, outputPath?, fileName?, size?, fileCount?, message?, error? }
    createLocal: (workspacePath, outputDir) =>
      ipcRenderer.invoke('package:createLocal', workspacePath, outputDir),

    // Install a single package by reference (e.g. "@prompd/core@0.0.1")
    install: (packageRef, workspacePath) =>
      ipcRenderer.invoke('package:install', packageRef, workspacePath),

    // Install all dependencies from prompd.json
    // Returns: { success, message, installed: [{name, version, status}], failed?: [{name, version, error}] }
    installAll: (workspacePath) =>
      ipcRenderer.invoke('package:installAll', workspacePath)
  },

  // Node template management - save/restore workflow node configurations
  templates: {
    save: (workspacePath, templateData, scope, workflowFilePath) =>
      ipcRenderer.invoke('template:save', workspacePath, templateData, scope || 'workspace', workflowFilePath),
    list: (workspacePath) =>
      ipcRenderer.invoke('template:list', workspacePath),
    delete: (workspacePath, fileName, scope) =>
      ipcRenderer.invoke('template:delete', workspacePath, fileName, scope),
    insert: (workspacePath, fileName, scope, workflowFilePath) =>
      ipcRenderer.invoke('template:insert', workspacePath, fileName, scope, workflowFilePath),
  },

  // Trigger service - background workflow execution management
  // Handles scheduled (cron), webhook, and file-watch triggers
  trigger: {
    // Register a workflow trigger configuration
    // config: { workflowId, workflowPath, triggerType, enabled, schedule?, webhook?, fileWatch? }
    register: (config) => ipcRenderer.invoke('trigger:register', config),

    // Unregister a workflow trigger
    unregister: (workflowId) => ipcRenderer.invoke('trigger:unregister', workflowId),

    // Enable or disable a trigger without removing it
    setEnabled: (workflowId, enabled) => ipcRenderer.invoke('trigger:setEnabled', workflowId, enabled),

    // List all registered triggers
    // Returns: Array of trigger configs with status
    list: () => ipcRenderer.invoke('trigger:list'),

    // Get status of a specific trigger
    // Returns: { enabled, lastTriggered, lastStatus, nextRun?, activeExecution? }
    status: (workflowId) => ipcRenderer.invoke('trigger:status', workflowId),

    // Get execution history for a workflow
    // Returns: Array of { executionId, startTime, endTime, status, error? }
    history: (workflowId, limit) => ipcRenderer.invoke('trigger:history', workflowId, limit),

    // Get webhook server info
    // Returns: { running, port, endpoints: [{ path, workflowId }] }
    webhookServerInfo: () => ipcRenderer.invoke('trigger:webhookServerInfo'),

    // Get tray state summary
    // Returns: { activeWorkflows, scheduledTriggers, fileWatchers, webhookServerRunning, webhookPort, nextScheduledRun }
    trayState: () => ipcRenderer.invoke('trigger:trayState'),

    // Update trigger service settings
    // settings: { webhookPort?, maxConcurrentExecutions?, notificationsEnabled?, minimizeToTray? }
    updateSettings: (settings) => ipcRenderer.invoke('trigger:updateSettings', settings),

    // Open file dialog to add a workflow, reads trigger config from file
    // Returns: { success, workflowId?, triggerConfig?, error? }
    addWorkflow: () => ipcRenderer.invoke('trigger:addWorkflow'),

    // Manually run a workflow (for testing)
    runManually: (workflowId) => ipcRenderer.invoke('trigger:runManually', workflowId)
  },

  // Scheduler service - persistent cron-based workflow scheduling
  // Handles scheduled workflows with SQLite persistence across app restarts
  scheduler: {
    // Get all schedules with optional filters
    // filters: { enabled?, workflowId? }
    // Returns: { success, schedules?, error? }
    getSchedules: (filters) => ipcRenderer.invoke('scheduler:getSchedules', filters),

    // Add a new schedule
    // config: { workflowId, workflowPath, name, cronExpression, timezone?, enabled?, parameters? }
    // Returns: { success, scheduleId?, error? }
    addSchedule: (config) => ipcRenderer.invoke('scheduler:addSchedule', config),

    // Update a schedule
    // Returns: { success, error? }
    updateSchedule: (scheduleId, updates) => ipcRenderer.invoke('scheduler:updateSchedule', scheduleId, updates),

    // Delete a schedule
    // Returns: { success, error? }
    deleteSchedule: (scheduleId) => ipcRenderer.invoke('scheduler:deleteSchedule', scheduleId),

    // Execute a schedule immediately (manual trigger)
    // Returns: { success, result?, error? }
    executeNow: (scheduleId) => ipcRenderer.invoke('scheduler:executeNow', scheduleId),

    // Get execution history
    // workflowId: Optional workflow ID filter
    // options: { limit?, offset? }
    // Returns: { success, history?, error? }
    getHistory: (workflowId, options) => ipcRenderer.invoke('scheduler:getHistory', workflowId, options),

    // Get next N run times for a schedule
    // Returns: { success, times?, error? } where times is array of Date timestamps
    getNextRunTimes: (scheduleId, count) => ipcRenderer.invoke('scheduler:getNextRunTimes', scheduleId, count)
  },

  // Deployment service - package-based workflow deployment with multi-trigger support
  // Deploys .pdpkg packages to ~/.prompd/workflows/{id}/ and extracts triggers from workflow files
  deployment: {
    // Deploy a package
    // packagePath: Path to .pdpkg file or workflow directory
    // options: { name?, redeploy? }
    // Returns: { success, deploymentId?, error? }
    deploy: (packagePath, options) => ipcRenderer.invoke('deployment:deploy', packagePath, options),

    // Undeploy a deployment
    // deploymentId: Deployment ID
    // options: { deleteFiles? }
    // Returns: { success, error? }
    undeploy: (deploymentId, options) => ipcRenderer.invoke('deployment:undeploy', deploymentId, options),

    // List all deployments with optional filters
    // filters: { status?, workflowId? }
    // Returns: { success, deployments?, error? }
    list: (filters) => ipcRenderer.invoke('deployment:list', filters),

    // Get deployment status with triggers and recent executions
    // Returns: { success, deployment?, triggers?, recentExecutions?, error? }
    getStatus: (deploymentId) => ipcRenderer.invoke('deployment:getStatus', deploymentId),

    // Toggle individual trigger
    // Returns: { success, error? }
    toggleTrigger: (triggerId, enabled) => ipcRenderer.invoke('deployment:toggleTrigger', triggerId, enabled),

    // Execute deployment manually
    // Returns: { success, executionId?, error? }
    execute: (deploymentId, parameters) => ipcRenderer.invoke('deployment:execute', deploymentId, parameters),

    // Get execution history for deployment
    // options: { limit?, offset?, triggerId? }
    // Returns: { success, history?, error? }
    getHistory: (deploymentId, options) => ipcRenderer.invoke('deployment:getHistory', deploymentId, options),

    // Get all execution history (across all deployments) with pagination
    // options: { limit?, offset?, filters?: { status?, triggerType?, workflowId? } }
    // Returns: { success, executions?, total?, page?, pageSize?, totalPages?, error? }
    getAllExecutions: (options) => ipcRenderer.invoke('deployment:getAllExecutions', options),

    // Get workflow parameters from a deployment
    // deploymentId: Deployment ID
    // Returns: { success, parameters?, workflowName?, error? }
    getParameters: (deploymentId) => ipcRenderer.invoke('deployment:getParameters', deploymentId),

    // Clear all execution history
    // Returns: { success, deletedCount?, error? }
    clearAllHistory: () => ipcRenderer.invoke('deployment:clearAllHistory'),

    // Toggle deployment status (enable/disable)
    // deploymentId: Deployment ID
    // Returns: { success, deployment?, error? }
    toggleStatus: (deploymentId) => ipcRenderer.invoke('deployment:toggleStatus', deploymentId),

    // Purge all deleted deployments
    // Returns: { success, purgedCount?, error? }
    purgeDeleted: () => ipcRenderer.invoke('deployment:purgeDeleted'),

    // Get deployment version history
    // deploymentId: Deployment ID
    // Returns: { success, versions?, error? }
    getVersionHistory: (deploymentId) => ipcRenderer.invoke('deployment:getVersionHistory', deploymentId)
  },

  // Service Management API
  // User-level service install/uninstall for 24/7 background execution
  service: {
    // Get service installation status
    // Returns: { installed, running, mode, autoStart }
    getStatus: () => ipcRenderer.invoke('service:getStatus'),

    // Install service (user-level systemd/LaunchAgent/Windows Service)
    // Returns: { success, message?, error? }
    install: () => ipcRenderer.invoke('service:install'),

    // Uninstall service
    // Returns: { success, message?, error? }
    uninstall: () => ipcRenderer.invoke('service:uninstall'),

    // Start service
    // Returns: { success, message?, error? }
    start: () => ipcRenderer.invoke('service:start'),

    // Stop service
    // Returns: { success, message?, error? }
    stop: () => ipcRenderer.invoke('service:stop')
  },

  // Trigger service events (from main process to renderer)
  onTriggerExecutionStart: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('trigger:execution-start', handler)
    return () => ipcRenderer.removeListener('trigger:execution-start', handler)
  },
  onTriggerExecutionComplete: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('trigger:execution-complete', handler)
    return () => ipcRenderer.removeListener('trigger:execution-complete', handler)
  },
  onTriggerStatusChange: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('trigger:status-change', handler)
    return () => ipcRenderer.removeListener('trigger:status-change', handler)
  },

  // Tray events (user interactions from tray menu)
  onTrayShowWorkflows: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('tray:show-workflows', handler)
    return () => ipcRenderer.removeListener('tray:show-workflows', handler)
  },
  onTrayShowExecution: (callback) => {
    const handler = (event, executionId) => callback(executionId)
    ipcRenderer.on('tray:show-execution', handler)
    return () => ipcRenderer.removeListener('tray:show-execution', handler)
  },

  // Service management (for standalone scheduler service)
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  restartService: () => ipcRenderer.invoke('service:restart'),
  getServiceStatus: () => ipcRenderer.invoke('service:getStatus'),
  saveServiceConfig: (config) => ipcRenderer.invoke('service:saveConfig', config),
  loadServiceConfig: () => ipcRenderer.invoke('service:loadConfig'),

  // Workflow execution (proxies to @prompd/cli in main process)
  workflow: {
    // Execute a workflow (non-blocking, uses events for live updates)
    // workflow: ParsedWorkflow object
    // params: Execution parameters
    // options: Serializable options only (executionMode, breakpoints array)
    // Returns: Promise<{ executionId: string }> - resolves when execution starts
    execute: (workflow, params, options) => ipcRenderer.invoke('workflow:execute', workflow, params, options),

    // Listen to workflow execution events (single event loop with type-based routing)
    // Event types: 'node-start', 'node-complete', 'node-error', 'progress', 'checkpoint', 'complete', 'error'
    // callback: (event) => void where event = { type, executionId, nodeId?, data?, timestamp }
    // Returns: cleanup function to remove listener
    onEvent: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('workflow:event', handler)
      return () => ipcRenderer.removeListener('workflow:event', handler)
    },

    // Cancel running execution
    // executionId: ID returned from execute()
    cancel: (executionId) => ipcRenderer.invoke('workflow:cancel', executionId),

    // Download execution trace to file
    // trace: ExecutionTrace object
    // filename: Optional custom filename
    downloadTrace: (trace, filename) => ipcRenderer.invoke('workflow:downloadTrace', trace, filename),

    // Respond to user input request (bidirectional IPC)
    // requestId: ID from user-input-request event
    // response: UserInputResponse object
    respondToUserInput: (requestId, response) => ipcRenderer.invoke('workflow:user-input-response', requestId, response),

    // Respond to checkpoint request (bidirectional IPC)
    // requestId: ID from checkpoint-request event
    // shouldContinue: boolean - whether to continue execution
    respondToCheckpoint: (requestId, shouldContinue) => ipcRenderer.invoke('workflow:checkpoint-response', requestId, shouldContinue),

    // Listen for scheduled/deployed workflow execution requests from main process
    // callback: (data: { workflowPath, parameters, trigger, deploymentId?, triggerId? }) => void
    // Returns: cleanup function to remove listener
    onExecuteRequest: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('execute-workflow', handler)
      return () => ipcRenderer.removeListener('execute-workflow', handler)
    },

    // Send workflow execution result back to main process
    // result: { success: boolean, result?: any, error?: string }
    sendExecutionResult: (result) => ipcRenderer.send('workflow-execution-result', result),

    // Export workflow as Docker deployment (with dialog)
    // workflow: Workflow object
    // workflowPath: Path to the .pdflow file
    // prompdjson: Optional prompd.json manifest
    // Returns: Promise<{ success: boolean, outputDir?: string, files?: string[], error?: string, cancelled?: boolean }>
    exportDocker: (workflow, workflowPath, prompdjson) => ipcRenderer.invoke('workflow:exportDocker', workflow, workflowPath, prompdjson),

    // Export workflow to specific directory (no dialog)
    // workflow: Workflow object
    // workflowPath: Path to the .pdflow file
    // outputDir: Directory to export to
    // prompdjson: Optional prompd.json manifest
    // Returns: Promise<{ success: boolean, outputDir?: string, files?: string[], error?: string }>
    exportDockerToPath: (workflow, workflowPath, outputDir, prompdjson) => ipcRenderer.invoke('workflow:exportDockerToPath', workflow, workflowPath, outputDir, prompdjson),

    // Export workflow to specific directory with export type (Docker or Kubernetes)
    // workflow: Workflow object
    // workflowPath: Path to the .pdflow file
    // outputDir: Directory to export to
    // prompdjson: Optional prompd.json manifest
    // options: { exportType: 'docker' | 'kubernetes', kubernetesOptions?: {...} }
    // Returns: Promise<{ success: boolean, outputDir?: string, files?: string[], error?: string }>
    exportToPath: (workflow, workflowPath, outputDir, prompdjson, options) => ipcRenderer.invoke('workflow:exportToPath', workflow, workflowPath, outputDir, prompdjson, options)
  },

  // Analytics - GA4 event tracking (opt-in, anonymous)
  analytics: {
    // Track a custom event
    trackEvent: (eventName, params) => ipcRenderer.invoke('analytics:trackEvent', eventName, params),

    // Enable or disable analytics
    setEnabled: (enabled) => ipcRenderer.invoke('analytics:setEnabled', enabled),

    // Check if analytics is currently enabled
    isEnabled: () => ipcRenderer.invoke('analytics:isEnabled'),
  },

  // Generated content persistence (images saved to ~/.prompd/generated/)
  generated: {
    // Save a base64-encoded image to disk, returns { success, filePath, fileName }
    saveImage: (base64Data, mimeType) => ipcRenderer.invoke('generated:saveImage', base64Data, mimeType),
    // List all generated resources grouped by type
    list: () => ipcRenderer.invoke('generated:list'),
    // Delete a generated resource by relative path
    delete: (relativePath) => ipcRenderer.invoke('generated:delete', relativePath),
    // Save text/code content as a generated resource
    saveText: (content, ext) => ipcRenderer.invoke('generated:saveText', content, ext),
  },

  // App lifecycle — clean close with save/discard prompt
  onBeforeQuit: (callback) => ipcRenderer.on('app:before-quit', callback),
  readyToQuit: () => ipcRenderer.send('app:ready-to-quit'),

  // Storage monitoring
  storage: {
    // Get localStorage usage info
    getUsage: () => {
      try {
        const total = JSON.stringify(localStorage).length
        return { usedBytes: total * 2, quotaBytes: 5 * 1024 * 1024 } // UTF-16 = 2 bytes/char, 5MB limit
      } catch {
        return { usedBytes: 0, quotaBytes: 5 * 1024 * 1024 }
      }
    }
  }
})
