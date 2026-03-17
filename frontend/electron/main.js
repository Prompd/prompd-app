// Load environment variables from .env file (development only)
// In production (packaged): env vars are set externally or use defaults
const path = require('path')

// dotenv is optional - only used in development
try {
  const envPath = path.join(__dirname, '..', '.env')
  require('dotenv').config({ path: envPath })
} catch (e) {
  // dotenv not available in production build - this is expected
  console.log('[Electron] Running without dotenv (production mode)')
}

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, powerMonitor, net, protocol, nativeTheme, clipboard } = require('electron')
const fs = require('fs-extra')
const os = require('os')

// Lazy-load autoUpdater after app is ready (v6.x requires app.getVersion())
let autoUpdater = null
function getAutoUpdater() {
  if (!autoUpdater) {
    autoUpdater = require('electron-updater').autoUpdater
  }
  return autoUpdater
}

// Modular IPC registration (new pattern — migrate others here over time)
const { McpIpcRegistration } = require('./ipc/McpIpcRegistration')
const { McpServerIpcRegistration } = require('./ipc/McpServerIpcRegistration')
const { TemplateIpcRegistration } = require('./ipc/TemplateIpcRegistration')
const { ResourceIpcRegistration } = require('./ipc/ResourceIpcRegistration')
const { SkillIpcRegistration } = require('./ipc/SkillIpcRegistration')
const { CacheIpcRegistration } = require('./ipc/CacheIpcRegistration')
const mcpService = require('./services/mcpService')
const { mcpServerService } = require('./services/mcpServerService')
const ipcModules = [
  new McpIpcRegistration(),
  new McpServerIpcRegistration(),
  new TemplateIpcRegistration(),
  new ResourceIpcRegistration(),
  new SkillIpcRegistration(),
  new CacheIpcRegistration(),
]

// Tray and trigger services for background workflow execution
const { trayManager } = require('./tray')
const { DeploymentService } = require('@prompd/scheduler')

const { spawn } = require('child_process')
const { Worker } = require('worker_threads')
const yaml = require('yaml')
const analytics = require('./services/analytics')

// Lazy-loaded @prompd/cli compiler (ESM module, loaded on first use)
let prompdCliModule = null
async function getPrompdCli() {
  if (!prompdCliModule) {
    try {
      prompdCliModule = await import('@prompd/cli')
      console.log('[Electron] @prompd/cli loaded successfully')
    } catch (err) {
      console.error('[Electron] Failed to load @prompd/cli:', err.message)
      throw err
    }
  }
  return prompdCliModule
}

// Deployment service instance (initialized in createWindow)

// Deployment service instance (initialized in createWindow)
let deploymentService = null

// Handle creating/removing shortcuts on Windows when installing/uninstalling
// Only needed for Squirrel.Windows installer (not NSIS)
try {
  if (require('electron-squirrel-startup')) {
    app.quit()
  }
} catch (e) {
  // electron-squirrel-startup not available (NSIS installer), which is fine
}

// Register custom protocol scheme for serving generated content (images, etc.)
// Must be called before app.whenReady() per Electron docs
protocol.registerSchemesAsPrivileged([
  { scheme: 'prompd-gen', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true, standard: true, secure: true } }
])

let mainWindow
let currentWorkspacePath = null  // Track the current workspace path for git operations
let pendingFileToOpen = null  // File path passed via command line or file association
let pendingProtocolUrl = null  // Protocol URL passed via deep link

// Menu state - tracks what actions are available
let menuState = {
  hasWorkspace: false,      // Is a folder/workspace open?
  hasActiveTab: false,      // Is there an active tab?
  isPrompdFile: false,      // Is the active file a .prmd file?
  isWorkflowFile: false,    // Is the active file a .pdflow workflow?
  canExecute: false,        // Can we execute (has .prmd file open)?
  isExecutionActive: false  // Is an execution currently running (agent, workflow, etc.)?
}

// Clerk OAuth configuration
// These are loaded from .env in development, or use production defaults
// Note: These are NOT secrets - they're public client IDs (like publishable keys)
const CLERK_OAUTH_CLIENT_ID = process.env.CLERK_OAUTH_CLIENT_ID || 'dUu2QstVNgNfkIf4'
const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API || 'https://clerk.prompdhub.ai'
const OAUTH_REDIRECT_URI = 'prompd://oauth/callback'

// Log OAuth config status
if (!process.env.CLERK_OAUTH_CLIENT_ID || !process.env.CLERK_FRONTEND_API) {
  console.log('[Electron] Using default Clerk OAuth configuration (production)')
} else {
  console.log('[Electron] Clerk OAuth configuration loaded from .env')
}

// Update window title based on workspace
function updateWindowTitle() {
  if (!mainWindow) return
  let title
  if (currentWorkspacePath) {
    const folderName = path.basename(currentWorkspacePath)
    title = `Prompd - ${folderName}`
  } else {
    title = 'Prompd'
  }
  mainWindow.setTitle(title)
  // Notify renderer for custom title bar
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window-title-changed', title)
  }
}

// Configure auto-updater (called after app is ready)
function setupAutoUpdater() {
  const updater = getAutoUpdater()
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true

  // Auto-update event handlers
  updater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...')
  })

  updater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version)
    // Don't show a dialog here — autoDownload is enabled so it downloads immediately.
    // The 'update-downloaded' handler will prompt the user when it's ready to install.
    if (mainWindow) {
      mainWindow.webContents.send('update-available', { version: info.version })
    }
  })

  updater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No updates available. Current version:', info.version)
  })

  updater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err)
  })

  updater.on('download-progress', (progressObj) => {
    const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`
    console.log('[AutoUpdater]', message)
  })

  updater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version)
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', { version: info.version })
    }
  })
}

function createWindow() {
  console.log('[Electron] Creating window...')
  console.log('[Electron] ELECTRON_START_URL:', process.env.ELECTRON_START_URL)

  // Platform-specific icon paths
  // In packaged app, icons are in extraResources (outside asar) at process.resourcesPath
  // In development, icons are in public/ relative to electron/
  const isPackaged = app.isPackaged

  let iconPath
  if (isPackaged) {
    // Packaged app: icons are copied to resources folder via extraResources config
    iconPath = process.platform === 'darwin'
      ? path.join(process.resourcesPath, 'logo.icns')
      : process.platform === 'win32'
      ? path.join(process.resourcesPath, 'logo.ico')
      : path.join(process.resourcesPath, 'logo.png')
  } else {
    // Development: icons are in frontend/public/
    const basePath = path.join(__dirname, '..')
    iconPath = process.platform === 'darwin'
      ? path.join(basePath, 'public/logo.icns')
      : process.platform === 'win32'
      ? path.join(basePath, 'public/logo.ico')
      : path.join(basePath, 'public/logo.png')
  }

  console.log('[Electron] Icon path:', iconPath, 'exists:', fs.existsSync(iconPath))

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: iconPath,
    // Custom title bar: hide native title bar, show OS window controls as overlay
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#f1f5f9',
      height: 39
    },
    autoHideMenuBar: true, // Hide native menu bar (keep for keyboard accelerators)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // TEMP: Disabled to test Monaco List component issue
      userAgent: `Prompd/${app.getVersion()} (${os.type()} ${os.arch()}) Electron/${process.versions.electron}`
    },
    title: 'Prompd',
    backgroundColor: '#0b1220',
    show: false // Don't show until ready
  })

  // Show window when ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    console.log('[Electron] Window ready to show')
    mainWindow.show()
  })

  // Load the app
  if (process.env.ELECTRON_START_URL) {
    // Development mode - load from Vite dev server
    console.log('[Electron] Loading from dev server:', process.env.ELECTRON_START_URL)
    mainWindow.loadURL(process.env.ELECTRON_START_URL).catch(err => {
      console.error('[Electron] Failed to load URL:', err)
    })
    mainWindow.webContents.openDevTools()
  } else {
    // Production mode - load from built files
    const indexPath = path.join(__dirname, '../dist/index.html')
    console.log('[Electron] Loading from file:', indexPath)
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[Electron] Failed to load file:', err)
    })
  }

  // Handle window close - minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    // Check if app is actually quitting or just closing window (minimize to tray)
    if (!trayManager.isAppQuitting()) {
      event.preventDefault()
      mainWindow.hide()
      console.log('[Electron] Window hidden to tray')
      return
    }
  })

  // Handle window closed (after actually closing)
  mainWindow.on('closed', () => {
    console.log('[Electron] Window closed')
    mainWindow = null
  })

  // Context menu for input fields (right-click cut/copy/paste + spellcheck)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags, misspelledWord, dictionarySuggestions } = params

    if (isEditable) {
      const menuItems = []

      // Spelling suggestions when a misspelled word is detected
      if (misspelledWord) {
        if (dictionarySuggestions.length > 0) {
          for (const suggestion of dictionarySuggestions) {
            menuItems.push({
              label: suggestion,
              click: () => mainWindow.webContents.replaceMisspelling(suggestion)
            })
          }
        } else {
          menuItems.push({ label: 'No suggestions', enabled: false })
        }
        menuItems.push(
          { type: 'separator' },
          {
            label: 'Add to Dictionary',
            click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(misspelledWord)
          },
          { type: 'separator' }
        )
      }

      menuItems.push(
        { label: 'Cut', role: 'cut', enabled: editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll', enabled: editFlags.canSelectAll }
      )

      const contextMenu = Menu.buildFromTemplate(menuItems)
      contextMenu.popup()
    } else if (selectionText) {
      // Non-editable text selection - just offer copy
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Copy',
          role: 'copy',
          enabled: editFlags.canCopy
        }
      ])
      contextMenu.popup()
    }
  })

  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Failed to load:', errorCode, errorDescription)
  })

  // Prevent page reload on system wake/resume (Vite HMR issue)
  // This preserves the app state when the system returns from sleep
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.log('[Electron] Render process gone:', details.reason)
  })

  // Block unwanted navigations/reloads from HMR reconnection issues
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation to the app URL but log it
    console.log('[Electron] Navigation requested:', url)
  })
}

// Create application menu
// Helper to get accelerator - use custom if set, otherwise default
function getAccelerator(actionId, defaultAccelerator) {
  return customAccelerators[actionId] || defaultAccelerator
}

function createMenu() {
  const appVersion = app.getVersion()

  const template = [
    // File menu - File operations and app settings
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: getAccelerator('newFile', 'CmdOrCtrl+N'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-file')
            }
          }
        },
        {
          label: 'New Project...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-project')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Prompd Files', extensions: ['prmd'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            })
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu-open-file', result.filePaths[0])
            }
          }
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory']
            })
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu-open-folder', result.filePaths[0])
            }
          }
        },
        {
          label: 'Close Folder',
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              // Clear workspace path in main process
              currentWorkspacePath = null
              updateWindowTitle()
              // Notify renderer to close the folder
              mainWindow.webContents.send('menu-close-folder')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: getAccelerator('closeTab', 'CmdOrCtrl+W'),
          enabled: menuState.hasActiveTab,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-close-tab')
            }
          }
        },
        {
          label: 'Close All Tabs',
          accelerator: 'CmdOrCtrl+Shift+W',
          enabled: menuState.hasActiveTab,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-close-all-tabs')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: getAccelerator('save', 'CmdOrCtrl+S'),
          enabled: menuState.hasActiveTab,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-save')
            }
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: menuState.hasActiveTab,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-save-as')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-settings')
            }
          }
        },
        {
          label: 'API Keys...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-api-keys')
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    // Edit menu - Standard editing operations
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    // View menu - Display options
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle File Explorer',
          accelerator: getAccelerator('toggleExplorer', 'CmdOrCtrl+B'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-toggle-sidebar', 'explorer')
            }
          }
        },
        {
          label: 'Toggle AI Chat',
          accelerator: getAccelerator('toggleAiChat', 'CmdOrCtrl+Shift+A'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-toggle-sidebar', 'ai')
            }
          }
        },
        {
          label: 'Toggle Git Panel',
          accelerator: getAccelerator('toggleGitPanel', 'CmdOrCtrl+Shift+G'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-toggle-sidebar', 'git')
            }
          }
        },
        {
          label: 'Toggle Output Panel',
          accelerator: getAccelerator('toggleOutputPanel', 'CmdOrCtrl+Shift+M'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-toggle-output-panel')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Command Palette',
          accelerator: getAccelerator('commandPalette', 'CmdOrCtrl+Shift+P'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-command-palette')
            }
          }
        },
        {
          label: 'Search Registry',
          accelerator: getAccelerator('searchRegistry', 'CmdOrCtrl+Shift+D'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-search-registry')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Wizard View',
          accelerator: getAccelerator('wizardView', 'CmdOrCtrl+1'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-set-view-mode', 'wizard')
            }
          }
        },
        {
          label: 'Design View',
          accelerator: getAccelerator('designView', 'CmdOrCtrl+2'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-set-view-mode', 'design')
            }
          }
        },
        {
          label: 'Code View',
          accelerator: getAccelerator('codeView', 'CmdOrCtrl+3'),
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-set-view-mode', 'code')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Dark Mode',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-toggle-theme')
            }
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Project menu - Project operations
    {
      label: 'Project',
      submenu: [
        {
          label: 'Open Project...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-open-project')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save Project',
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-save-project')
            }
          }
        },
        {
          label: 'Manage Projects...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-manage-projects')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Build Package',
          accelerator: getAccelerator('compile', 'CmdOrCtrl+Shift+B'),
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-package-create')
            }
          }
        },
        {
          label: 'Publish Package...',
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-package-publish')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Install Dependencies...',
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-run-install')
            }
          }
        },
        {
          label: 'Install Package...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-package-install')
            }
          }
        },
        {
          label: 'Browse Registry',
          click: () => {
            shell.openExternal('https://www.prompdhub.ai')
          }
        }
      ]
    },
    // Run menu - Execution, deployment, and scheduling
    {
      label: 'Run',
      submenu: [
        {
          label: 'Execute',
          accelerator: 'F5',
          enabled: menuState.canExecute,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-run-execute')
            }
          }
        },
        {
          label: 'Stop',
          accelerator: 'Shift+F5',
          enabled: menuState.isExecutionActive,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-run-stop')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Deploy Workflow...',
          enabled: menuState.isWorkflowFile,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-package-deploy')
            }
          }
        },
        {
          label: 'Manage Deployments...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-deployment-manage')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Scheduler',
          submenu: [
            {
              label: 'Manage Schedules...',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('menu-scheduler-settings')
                }
              }
            },
            {
              label: 'Service Settings...',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('menu-scheduler-service')
                }
              }
            }
          ]
        }
      ]
    },
    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://prompd.io/docs')
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/Prompd/prompd-app/issues')
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            getAutoUpdater().checkForUpdates()
          }
        },
        { type: 'separator' },
        {
          label: 'About Prompd',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-about')
            }
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  // Hide native menu bar but keep accelerators working
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false)
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set app name for protocol handler display
  app.setName('Prompd')

  console.log('[Electron] App ready')
  console.log('[Electron] Platform:', process.platform)
  console.log('[Electron] Node version:', process.version)
  console.log('[Electron] Electron version:', process.versions.electron)

  // Register prompd-gen:// protocol to serve generated content from ~/.prompd/generated/
  // This allows <img src="prompd-gen://images/abc123.png"> to load persisted images
  // without file:// restrictions or CSP issues
  protocol.handle('prompd-gen', (request) => {
    // URL format: prompd-gen://images/filename.png → ~/.prompd/generated/images/filename.png
    const url = new URL(request.url)
    const relativePath = decodeURIComponent(url.hostname + url.pathname)
    // Security: block path traversal
    if (relativePath.includes('..')) {
      return new Response('Forbidden', { status: 403 })
    }
    const filePath = path.join(os.homedir(), '.prompd', 'generated', relativePath)
    // On Windows, path.join uses backslashes which break file:// URLs
    const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
    return net.fetch(fileUrl)
  })
  console.log('[Electron] Registered prompd-gen:// protocol')

  // Hide the default menu during loading - menu is shown when user authenticates
  Menu.setApplicationMenu(null)

  createWindow()
  // Menu is created later when user is authenticated (via showAppMenu IPC)

  // Setup auto-updater (must be after app.whenReady)
  setupAutoUpdater()

  // Check for updates on startup (only in production)
  if (!process.env.ELECTRON_START_URL) {
    console.log('[Electron] Checking for updates...')
    getAutoUpdater().checkForUpdates()
  }

  // Initialize GA4 analytics (opt-in, anonymous)
  // These are write-only credentials (can only send events, not read data).
  // Safe to ship with the app — same as any website's GA tracking snippet.
  // User preference is sent from renderer via analytics:setEnabled IPC
  analytics.init({
    measurementId: process.env.GA4_MEASUREMENT_ID || 'G-J7DDP24RMN',
    apiSecret: process.env.GA4_API_SECRET || 'av2bdFP6QkCSyw8lWqMq5A',
    appVersion: app.getVersion(),
    enabled: false, // Always start disabled; renderer sends opt-in state
  })

  // Power monitor events - notify renderer about sleep/wake to prevent unwanted reloads
  powerMonitor.on('suspend', () => {
    console.log('[Electron] System suspending')
    if (mainWindow) {
      mainWindow.webContents.send('power-suspend')
    }
  })

  powerMonitor.on('resume', () => {
    console.log('[Electron] System resumed')
    if (mainWindow) {
      mainWindow.webContents.send('power-resume')
    }
  })

  powerMonitor.on('lock-screen', () => {
    console.log('[Electron] Screen locked')
    if (mainWindow) {
      mainWindow.webContents.send('power-lock')
    }
  })

  powerMonitor.on('unlock-screen', () => {
    console.log('[Electron] Screen unlocked')
    if (mainWindow) {
      mainWindow.webContents.send('power-unlock')
    }
  })

  // Initialize system tray for background workflow execution
  trayManager.init(mainWindow)

  // Initialize deployment service (package-based workflow deployment)
  try {
    const dbPath = path.join(app.getPath('userData'), 'scheduler', 'schedules.db')
    const deploymentsPath = path.join(app.getPath('home'), '.prompd', 'deployments')

    // Create deployment executor wrapper
    const executeDeployedWorkflow = async (deployment, trigger, context) => {
      console.log(`[Electron] Executing deployed workflow: ${deployment.name}`)
      console.log(`[Electron] Deployment path: ${deployment.packagePath}`)
      console.log(`[Electron] Trigger type: ${trigger.triggerType || 'manual'}`)

      try {
        // Resolve workflow file from prompd.json > main, fallback to recursive search
        let workflowPath = null

        const manifestPath = path.join(deployment.packagePath, 'prompd.json')
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
            if (manifest.main) {
              const mainPath = path.join(deployment.packagePath, manifest.main)
              if (fs.existsSync(mainPath)) {
                workflowPath = mainPath
                console.log(`[Electron] Resolved workflow from prompd.json main: ${manifest.main}`)
              }
            }
          } catch (err) {
            console.warn(`[Electron] Failed to read prompd.json:`, err.message)
          }
        }

        // Fallback: search recursively for .pdflow
        if (!workflowPath) {
          const findPdflow = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name)
              if (entry.isDirectory()) {
                const found = findPdflow(fullPath)
                if (found) return found
              } else if (entry.name.endsWith('.pdflow')) {
                return fullPath
              }
            }
            return null
          }
          workflowPath = findPdflow(deployment.packagePath)
        }

        if (!workflowPath) {
          throw new Error('No workflow file found in deployment')
        }

        console.log(`[Electron] Workflow path: ${workflowPath}`)

        // Execute workflow via IPC to renderer process
        console.log(`[Electron] Sending execute-workflow message to renderer...`)

        return new Promise((resolve, reject) => {
          // Send execution request to renderer process
          mainWindow.webContents.send('execute-workflow', {
            workflowPath,
            parameters: context.payload || {},
            trigger: trigger.triggerType || 'manual',
            deploymentId: deployment.id,
            triggerId: trigger.id
          })

          // Wait for execution result (30 minutes timeout for complex workflows with LLM calls)
          const timeoutId = setTimeout(() => {
            console.error('[Electron] Workflow execution timeout (30 minutes)')
            reject(new Error('Workflow execution timeout (30 minutes)'))
          }, 30 * 60 * 1000)

          // Listen for result from renderer process
          const resultHandler = (event, result) => {
            console.log('[Electron] Received workflow-execution-result:', result)
            clearTimeout(timeoutId)
            ipcMain.off('workflow-execution-result', resultHandler)

            if (result.error) {
              console.error('[Electron] Execution failed with error:', result.error)
              reject(new Error(result.error))
            } else {
              console.log('[Electron] Execution succeeded')
              resolve(result)
            }
          }

          ipcMain.on('workflow-execution-result', resultHandler)
        }).then((result) => {
          console.log(`[Electron] Workflow execution completed:`, result)
          return result
        })

        // Emit execution complete event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('trigger:execution-complete', {
            deploymentId: deployment.id,
            triggerId: trigger.id,
            status: result.status || 'success',
            timestamp: Date.now()
          })
        }

        return result
      } catch (error) {
        console.error(`[Electron] Workflow execution failed:`, error)

        // Emit error event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('trigger:execution-complete', {
            deploymentId: deployment.id,
            triggerId: trigger.id,
            status: 'error',
            error: error.message,
            timestamp: Date.now()
          })
        }

        throw error
      }
    }

    deploymentService = new DeploymentService({
      dbPath,
      deploymentsPath,
      executeWorkflow: executeDeployedWorkflow
    })
    console.log('[Electron] Deployment service initialized')

    // Initialize MCP server service with main-process references
    const { loadConnections } = require('./services/connectionStorage')
    mcpServerService.init({
      compilePrompt,
      getPrompdCli,
      deploymentService,
      connectionStorage: { loadConnections: () => loadConnections(currentWorkspacePath) },
      workspacePath: currentWorkspacePath,
    })
    console.log('[Electron] MCP server service initialized')

    // Auto-start MCP server if configured (async, non-blocking)
    ;(async () => {
      try {
        const mcpConfig = await readConfigFile(getGlobalConfigPath())
        if (mcpConfig?.services?.mcp_server?.auto_start) {
          const mcpPort = mcpConfig.services.mcp_server.port || 18791
          const mcpApiKey = mcpConfig.services.mcp_server.api_key || undefined
          console.log('[Electron] Auto-starting MCP server on port', mcpPort)
          await mcpServerService.start({ port: mcpPort, apiKey: mcpApiKey })
          trayManager.setState({ mcpServerRunning: true, mcpServerPort: mcpPort })
        }
      } catch (mcpErr) {
        console.error('[Electron] Failed to auto-start MCP server:', mcpErr.message)
      }
    })()

    // Update tray with deployments
    updateTrayWithDeployments()

    // Refresh tray every 30 seconds with latest deployment data
    setInterval(() => {
      updateTrayWithDeployments()
    }, 30000)
  } catch (error) {
    console.error('[Electron] Failed to initialize deployment service:', error.message)
    console.error('[Electron] Full error:', error)
    console.error('[Electron] Stack trace:', error.stack)
    deploymentService = null
  }

  // Helper function to update tray with deployment data
  function updateTrayWithDeployments() {
    if (!deploymentService) return

    try {
      const deployments = deploymentService.listDeployments({ status: 'enabled' })

      // Get trigger information for each deployment
      const deploymentsWithTriggers = deployments.map(d => {
        const triggers = deploymentService.db.triggers.getByDeployment(d.id)
        const scheduleTriggers = triggers.filter(t => t.enabled && t.triggerType === 'schedule')

        // Find next run time across all schedule triggers
        let nextRunAt = null
        for (const trigger of scheduleTriggers) {
          if (trigger.nextRunAt && (!nextRunAt || trigger.nextRunAt < nextRunAt)) {
            nextRunAt = trigger.nextRunAt
          }
        }

        return {
          id: d.id,
          name: d.name,
          version: d.version,
          status: d.status,
          triggerCount: triggers.length,
          nextRunAt: nextRunAt ? new Date(nextRunAt).toISOString() : undefined
        }
      })

      trayManager.setState({
        deployments: deploymentsWithTriggers,
        scheduledTriggers: deploymentsWithTriggers.reduce((sum, d) => sum + d.triggerCount, 0)
      })
    } catch (error) {
      console.error('[Electron] Failed to update tray with deployments:', error)
    }
  }

  // Tray event handlers
  trayManager.on('show-workflows', () => {
    if (mainWindow) {
      mainWindow.webContents.send('tray:show-workflows')
    }
  })

  trayManager.on('show-execution', (executionId) => {
    if (mainWindow) {
      mainWindow.webContents.send('tray:show-execution', executionId)
    }
  })

  trayManager.on('pause-all-schedules', async () => {
    if (deploymentService) {
      try {
        const deployments = deploymentService.listDeployments({ status: 'enabled' })
        let pausedCount = 0
        for (const deployment of deployments) {
          const triggers = deploymentService.db.triggers.getByDeployment(deployment.id)
          for (const trigger of triggers) {
            if (trigger.enabled) {
              deploymentService.db.triggers.update(trigger.id, { enabled: 0 })
              await deploymentService.triggerManager.unregister(trigger.id)
              pausedCount++
            }
          }
        }
        trayManager.showNotification({
          title: 'Triggers Paused',
          body: `Paused ${pausedCount} trigger(s)`,
          type: 'info'
        })
      } catch (err) {
        console.error('[Electron] Failed to pause triggers:', err)
      }
    }
  })

  trayManager.on('resume-all-schedules', async () => {
    if (deploymentService) {
      try {
        const deployments = deploymentService.listDeployments({ status: 'enabled' })
        let resumedCount = 0
        for (const deployment of deployments) {
          const triggers = deploymentService.db.triggers.getByDeployment(deployment.id)
          for (const trigger of triggers) {
            if (!trigger.enabled) {
              deploymentService.db.triggers.update(trigger.id, { enabled: 1 })
              const triggerData = JSON.parse(trigger.config || '{}')
              await deploymentService.triggerManager.register(trigger.id, triggerData, {
                deploymentId: deployment.id,
                workflowId: deployment.workflowId,
                packagePath: deployment.packagePath
              })
              resumedCount++
            }
          }
        }
        trayManager.showNotification({
          title: 'Triggers Resumed',
          body: `Resumed ${resumedCount} trigger(s)`,
          type: 'info'
        })
      } catch (err) {
        console.error('[Electron] Failed to resume triggers:', err)
      }
    }
  })

  trayManager.on('stop-all-file-watchers', async () => {
    // Will be implemented when fileWatchService is added
    console.log('[Tray] Stop all file watchers requested')
  })

  trayManager.on('restart-all-file-watchers', async () => {
    // Will be implemented when fileWatchService is added
    console.log('[Tray] Restart all file watchers requested')
  })

  // Deployment event handlers
  trayManager.on('execute-deployment', async (deploymentId, deploymentName) => {
    console.log(`[Tray] Execute deployment requested: ${deploymentName}`)
    if (deploymentService) {
      try {
        const result = await deploymentService.execute(deploymentId, {})

        // Emit execution complete event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('trigger:execution-complete', {
            deploymentId,
            executionId: result.id,
            status: result.status || 'success',
            timestamp: Date.now()
          })
        }

        trayManager.showNotification({
          title: 'Workflow Completed',
          body: `${deploymentName} executed successfully`,
          type: 'success'
        })
      } catch (error) {
        console.error('[Tray] Failed to execute deployment:', error)

        // Emit error event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('trigger:execution-complete', {
            deploymentId,
            executionId: null,
            status: 'error',
            error: error.message,
            timestamp: Date.now()
          })
        }

        trayManager.showNotification({
          title: 'Execution Failed',
          body: `${deploymentName}: ${error.message}`,
          type: 'error'
        })
      }
    }
  })

  trayManager.on('show-deployments', () => {
    if (mainWindow) {
      mainWindow.webContents.send('menu-deployment-manage')
    }
  })

  trayManager.on('show-execution-history', () => {
    if (mainWindow) {
      // Open DeploymentPanel (it has History tab)
      mainWindow.webContents.send('menu-deployment-manage')
    }
  })

  trayManager.on('mcp-server-start', async () => {
    try {
      await mcpServerService.start()
      trayManager.setState({ mcpServerRunning: true, mcpServerPort: mcpServerService.port })
    } catch (err) {
      console.error('[Tray] Failed to start MCP server:', err.message)
      trayManager.setState({ mcpServerRunning: false })
    }
  })

  trayManager.on('mcp-server-stop', async () => {
    try {
      await mcpServerService.stop()
      trayManager.setState({ mcpServerRunning: false, mcpServerPort: undefined })
    } catch (err) {
      console.error('[Tray] Failed to stop MCP server:', err.message)
    }
  })

  trayManager.on('mcp-server-copy-config', () => {
    const info = mcpServerService.getInfo()
    if (info.running) {
      const config = {
        mcpServers: {
          'prompd-desktop': {
            url: info.url,
            transport: 'streamable-http',
            headers: {
              Authorization: `Bearer ${info.apiKey}`,
            },
          },
        },
      }
      clipboard.writeText(JSON.stringify(config, null, 2))
      trayManager.showNotification({
        title: 'MCP Config Copied',
        body: 'Connection configuration copied to clipboard',
        type: 'info'
      })
    }
  })

  app.on('activate', () => {
    console.log('[Electron] App activated')
    // On macOS it's common to re-create a window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      // Show existing window
      trayManager.showMainWindow()
    }
  })
})

// Track whether the renderer has confirmed it's ready to quit
let rendererReadyToQuit = false

// Handle app quitting - ask renderer to save/discard dirty files first
app.on('before-quit', async (event) => {
  // If the renderer hasn't confirmed yet, prevent quit and ask it to handle dirty tabs
  // But only if the renderer has finished loading — during initialization it can't respond
  if (!rendererReadyToQuit && mainWindow && !mainWindow.isDestroyed()) {
    const webContents = mainWindow.webContents
    if (webContents.isLoading() || webContents.getURL() === '' || webContents.getURL() === 'about:blank') {
      // Renderer not ready — skip dirty-tab handshake and quit immediately
      console.log('[Electron] Renderer not loaded yet, quitting immediately')
      rendererReadyToQuit = true
    } else {
      event.preventDefault()
      // Show the window if hidden (so save dialogs are visible)
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.webContents.send('app:before-quit')
      return
    }
  }

  // Renderer confirmed — proceed with cleanup
  analytics.trackAppClose()
  analytics.shutdown()
  trayManager.setQuitting(true)
  if (deploymentService) {
    deploymentService.close()
  }
  // Cleanup modular IPC modules (e.g., disconnect MCP servers)
  for (const m of ipcModules) {
    if (m.cleanup) await m.cleanup()
  }
})

// Renderer signals it has handled dirty tabs and is ready to quit
ipcMain.on('app:ready-to-quit', () => {
  rendererReadyToQuit = true
  app.quit()
})

// Quit when all windows are closed (except on macOS or when minimizing to tray)
app.on('window-all-closed', () => {
  // On macOS, apps typically stay running in dock
  // On Windows/Linux, check if we should minimize to tray instead of quitting
  if (process.platform !== 'darwin') {
    // Only quit if user explicitly requested quit (not minimize to tray)
    if (trayManager.isAppQuitting()) {
      app.quit()
    }
    // Otherwise, the app stays running in the tray
  }
})

// Sync Electron native theme with renderer theme
ipcMain.on('app:set-native-theme', (event, theme) => {
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  const bgColor = theme === 'dark' ? '#0f172a' : '#ffffff'
  const symbolColor = theme === 'dark' ? '#f1f5f9' : '#0f1117'
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(bgColor)
    try {
      mainWindow.setTitleBarOverlay({ color: bgColor, symbolColor, height: 39 })
    } catch (_e) { /* titleBarOverlay not supported on this platform */ }
  }
})

// Register modular IPC handlers
ipcModules.forEach(m => m.register(ipcMain))

// IPC Handlers for native file system operations
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Prompd Files', extensions: ['prmd'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (canceled) {
    return null
  }
  return filePaths[0]
})

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (canceled) {
    return null
  }
  // Automatically set workspace path for git operations
  currentWorkspacePath = filePaths[0]
  mcpServerService.setWorkspacePath(currentWorkspacePath)
  updateWindowTitle()
  return filePaths[0]
})

ipcMain.handle('dialog:selectDirectory', async (event, title) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: title || 'Select Directory',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled) return null
  return filePaths[0]
})

ipcMain.handle('dialog:saveFile', async (event, defaultPath) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: 'Prompd Files', extensions: ['prmd'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (canceled) {
    return null
  }
  return filePath
})

// Open file picker starting from a specific directory, returns workspace-relative path
ipcMain.handle('dialog:selectFileFromWorkspace', async (event, workspacePath, title) => {
  if (!workspacePath) {
    return { success: false, error: 'No workspace path provided' }
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    defaultPath: workspacePath,
    title: title || 'Select a file',
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  const selectedPath = filePaths[0]

  // Normalize paths for comparison (handle Windows backslashes)
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/')
  const normalizedSelected = selectedPath.replace(/\\/g, '/')

  // Check if the selected file is within the workspace
  if (!normalizedSelected.startsWith(normalizedWorkspace)) {
    return { success: false, error: 'Selected file is outside the workspace' }
  }

  // Get workspace-relative path
  let relativePath = normalizedSelected.substring(normalizedWorkspace.length)
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1)
  }

  // Read the file content
  try {
    const content = await fs.promises.readFile(selectedPath, 'utf-8')
    return {
      success: true,
      relativePath,
      absolutePath: selectedPath,
      content
    }
  } catch (error) {
    return { success: false, error: `Failed to read file: ${error.message}` }
  }
})

/**
 * Check whether a filesystem path is within an allowed root for mutating operations
 * (write, delete, rename). Allowed roots are:
 *   - The currently open workspace (currentWorkspacePath)
 *   - The user-level Prompd data directory (~/.prompd/)
 *
 * Read-only operations (readFile, readBinaryFile) are not restricted here because
 * the editor must be able to open any user-selected file.
 *
 * @param {string} targetPath - The path to validate (may be absolute or relative)
 * @returns {boolean}
 */
function isAllowedMutablePath(targetPath) {
  const resolved = path.resolve(targetPath)
  const prompdHome = path.resolve(os.homedir(), '.prompd')
  if (resolved.startsWith(prompdHome + path.sep) || resolved === prompdHome) {
    return true
  }
  if (currentWorkspacePath) {
    const resolvedWs = path.resolve(currentWorkspacePath)
    if (resolved.startsWith(resolvedWs + path.sep) || resolved === resolvedWs) {
      return true
    }
  }
  return false
}

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Read binary file and return as base64
ipcMain.handle('fs:readBinaryFile', async (event, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath)
    const base64 = buffer.toString('base64')
    return { success: true, data: base64, size: buffer.length }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  try {
    if (!isAllowedMutablePath(filePath)) {
      return { success: false, error: 'Path is outside the allowed workspace or .prompd directory' }
    }
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:readDir', async (event, dirPath) => {
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const fileList = await Promise.all(files.map(async file => {
      const filePath = path.join(dirPath, file.name)
      let mtime = null
      try {
        const stat = await fs.promises.stat(filePath)
        mtime = stat.mtimeMs
      } catch {
        // If stat fails, mtime stays null
      }
      return {
        name: file.name,
        isDirectory: file.isDirectory(),
        path: filePath,
        mtime
      }
    }))
    return { success: true, files: fileList }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:createDir', async (event, dirPath) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Generated content persistence - saves base64 images to ~/.prompd/generated/images/
// Uses content-addressable hashing (SHA256) so duplicate images share storage
ipcMain.handle('generated:saveImage', async (_event, base64Data, mimeType) => {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return { success: false, error: 'Invalid base64 data' }
    }

    // Determine file extension from mime type and sanitize to alphanumeric only
    const rawExt = (mimeType || 'image/png').split('/')[1]?.replace(/\+.*/, '') || 'png'
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'bin'

    // Compute truncated SHA256 hash for content-addressable filename
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update(base64Data).digest('hex').substring(0, 16)

    const dir = path.join(os.homedir(), '.prompd', 'generated', 'images')
    const fileName = `${hash}.${ext}`
    const filePath = path.join(dir, fileName)

    // Skip writing if file already exists (content-addressable dedup)
    try {
      await fs.promises.access(filePath)
      return { success: true, filePath, fileName, existed: true }
    } catch {
      // File doesn't exist yet, proceed to save
    }

    await fs.promises.mkdir(dir, { recursive: true })

    // Decode base64 and write binary
    const buffer = Buffer.from(base64Data, 'base64')
    await fs.promises.writeFile(filePath, buffer)

    console.log(`[Generated] Saved image: ${fileName} (${buffer.length} bytes)`)
    return { success: true, filePath, fileName }
  } catch (error) {
    console.error('[Generated] Error saving image:', error)
    return { success: false, error: error.message }
  }
})

// List all generated resources from ~/.prompd/generated/ grouped by type (subdirectory)
ipcMain.handle('generated:list', async () => {
  try {
    const baseDir = path.join(os.homedir(), '.prompd', 'generated')

    // Ensure directory exists
    try {
      await fs.promises.access(baseDir)
    } catch {
      return { success: true, resources: [] }
    }

    const resources = []
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const typeDir = path.join(baseDir, entry.name)
      const files = await fs.promises.readdir(typeDir, { withFileTypes: true })

      for (const file of files) {
        if (!file.isFile()) continue
        const filePath = path.join(typeDir, file.name)
        const stat = await fs.promises.stat(filePath)
        resources.push({
          fileName: file.name,
          relativePath: `${entry.name}/${file.name}`,
          type: entry.name,
          protocolUrl: `prompd-gen://${entry.name}/${file.name}`,
          size: stat.size,
          modified: stat.mtimeMs
        })
      }
    }

    // Sort by most recently modified first
    resources.sort((a, b) => b.modified - a.modified)
    return { success: true, resources }
  } catch (error) {
    console.error('[Generated] Error listing resources:', error)
    return { success: false, error: error.message }
  }
})

// Delete a specific generated resource
ipcMain.handle('generated:delete', async (_event, relativePath) => {
  try {
    if (!relativePath || typeof relativePath !== 'string') {
      return { success: false, error: 'Invalid path' }
    }
    // Security: block path traversal
    if (relativePath.includes('..')) {
      return { success: false, error: 'Invalid path: parent directory references not allowed' }
    }
    const filePath = path.join(os.homedir(), '.prompd', 'generated', relativePath)
    await fs.promises.unlink(filePath)
    console.log(`[Generated] Deleted resource: ${relativePath}`)
    return { success: true }
  } catch (error) {
    console.error('[Generated] Error deleting resource:', error)
    return { success: false, error: error.message }
  }
})

// Save text/code content as a generated resource
ipcMain.handle('generated:saveText', async (_event, content, ext) => {
  try {
    if (!content || typeof content !== 'string') {
      return { success: false, error: 'Invalid content' }
    }

    // Sanitize extension to alphanumeric characters only
    const fileExt = (ext || 'md').replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'md'
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)

    const dir = path.join(os.homedir(), '.prompd', 'generated', 'text')
    const fileName = `${hash}.${fileExt}`
    const filePath = path.join(dir, fileName)

    // Content-addressable dedup
    try {
      await fs.promises.access(filePath)
      return { success: true, filePath, fileName, existed: true }
    } catch {
      // File doesn't exist yet
    }

    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(filePath, content, 'utf-8')

    console.log(`[Generated] Saved text: ${fileName} (${content.length} chars)`)
    return { success: true, filePath, fileName }
  } catch (error) {
    console.error('[Generated] Error saving text:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
  try {
    if (!isAllowedMutablePath(oldPath) || !isAllowedMutablePath(newPath)) {
      return { success: false, error: 'Path is outside the allowed workspace or .prompd directory' }
    }
    await fs.promises.rename(oldPath, newPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:delete', async (event, targetPath, options = {}) => {
  try {
    if (!isAllowedMutablePath(targetPath)) {
      return { success: false, error: 'Path is outside the allowed workspace or .prompd directory' }
    }

    // Check if deleting a workflow file - if so, remove associated deployments
    if (targetPath.endsWith('.pdflow')) {
      try {
        const workflowContent = await fs.promises.readFile(targetPath, 'utf-8')
        const workflow = JSON.parse(workflowContent)
        const workflowId = workflow.metadata?.id

        if (workflowId && deploymentService) {
          // Find and delete any deployments with this workflow ID
          const deployments = deploymentService.listDeployments({ workflowId })
          for (const deployment of deployments) {
            if (deployment.status !== 'deleted') {
              console.log(`[File Delete] Deleting workflow deployment: ${deployment.name}`)
              await deploymentService.delete(deployment.id, { deleteFiles: false })
            }
          }
        }
      } catch (err) {
        // If we can't read/parse workflow or delete deployment, log but continue with file deletion
        console.error('[File Delete] Failed to delete workflow deployment:', err)
      }
    }

    const stat = await fs.promises.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: options.recursive || false })
    } else {
      await fs.promises.unlink(targetPath)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Reveal file/folder in system file explorer
ipcMain.handle('shell:showItemInFolder', async (event, itemPath) => {
  try {
    shell.showItemInFolder(itemPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Open folder in system file explorer
ipcMain.handle('shell:openPath', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Open URL in default browser
ipcMain.handle('shell:openExternal', async (event, url) => {
  try {
    // Validate URL to prevent arbitrary command execution
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only http and https URLs are allowed')
    }
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Find git root by searching upward for .git directory
async function findGitRoot(startPath) {
  let currentPath = startPath
  const root = path.parse(currentPath).root

  while (currentPath !== root) {
    const gitPath = path.join(currentPath, '.git')
    try {
      const stats = await fs.promises.stat(gitPath)
      if (stats.isDirectory()) {
        return currentPath
      }
    } catch {
      // .git not found at this level, continue upward
    }
    currentPath = path.dirname(currentPath)
  }
  return null // No git root found
}

// System info handlers
ipcMain.handle('system:getHomePath', async () => {
  return os.homedir()
})

// Environment variable handler - returns filtered env vars by prefix
// Security: Only PROMPD_* vars are exposed to protect sensitive keys
ipcMain.handle('env:getFiltered', async (_event, prefix) => {
  const filtered = {}
  if (!prefix || typeof prefix !== 'string') {
    return filtered
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix)) {
      // Strip the prefix from the key name for cleaner template access
      // e.g., PROMPD_API_KEY becomes API_KEY in {{ env.API_KEY }}
      filtered[key.slice(prefix.length)] = value
    }
  }
  return filtered
})

// Streaming API request handler - sends response body chunks incrementally via IPC events
// Unlike api:request which buffers the entire response, this forwards each data chunk as it arrives
ipcMain.handle('api:streamRequest', async (event, url, options, streamId) => {
  try {
    return new Promise((resolve) => {
      const request = net.request({
        method: options.method || 'GET',
        url: url
      })

      // Set headers
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          request.setHeader(key, value)
        })
      }

      // Handle response - resolve with headers immediately, then stream body chunks
      request.on('response', (response) => {
        const headers = {}
        const rawHeaders = response.rawHeaders
        for (let i = 0; i < rawHeaders.length; i += 2) {
          headers[rawHeaders[i].toLowerCase()] = rawHeaders[i + 1]
        }

        // Resolve with headers right away (don't wait for body)
        resolve({
          success: true,
          status: response.statusCode,
          statusText: response.statusMessage,
          headers: headers,
          ok: response.statusCode >= 200 && response.statusCode < 300
        })

        // Forward data chunks incrementally to renderer
        response.on('data', (chunk) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('api:stream-chunk', streamId, chunk.toString('utf8'))
          }
        })

        response.on('end', () => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('api:stream-end', streamId)
          }
        })

        response.on('error', (err) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('api:stream-error', streamId, err.message)
          }
        })
      })

      // Handle request errors
      request.on('error', (error) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('api:stream-error', streamId, error.message)
        }
        resolve({
          success: false,
          error: error.message
        })
      })

      // Send body if present
      if (options.body) {
        request.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      }

      request.end()
    })
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

// API request handler - bypasses CORS by making requests from main process
ipcMain.handle('api:request', async (_event, url, options) => {
  try {
    console.log('[Electron] Making API request to:', url)

    // Use Electron's net module for HTTP requests (no CORS restrictions)
    return new Promise((resolve) => {
      const request = net.request({
        method: options.method || 'GET',
        url: url
      })

      // Set headers
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          request.setHeader(key, value)
        })
      }

      // Handle response
      request.on('response', (response) => {
        const chunks = []

        response.on('data', (chunk) => {
          chunks.push(chunk)
        })

        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const headers = {}
          const rawHeaders = response.rawHeaders
          for (let i = 0; i < rawHeaders.length; i += 2) {
            headers[rawHeaders[i].toLowerCase()] = rawHeaders[i + 1]
          }

          // Return base64 for binary responses to preserve data integrity
          const isBinary = options.responseType === 'arraybuffer'
          resolve({
            success: true,
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: headers,
            body: isBinary ? buffer.toString('base64') : buffer.toString('utf8'),
            binary: isBinary,
            ok: response.statusCode >= 200 && response.statusCode < 300
          })
        })
      })

      // Handle errors
      request.on('error', (error) => {
        console.error('[Electron] API request failed:', error.message)
        resolve({
          success: false,
          error: error.message
        })
      })

      // Send body if present
      if (options.body) {
        request.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      }

      request.end()
    })
  } catch (error) {
    console.error('[Electron] API request setup failed:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
})

// ============================================================================
// Direct Registry Publish Handler
// ============================================================================

/**
 * Publish a .pdpkg file to the registry via @prompd/cli RegistryClient
 */
ipcMain.handle('package:publish', async (_event, options) => {
  const { filePath, registryUrl, authToken, metadataOverrides } = options

  try {
    console.log('[Electron] Publishing package:', filePath, 'metadataOverrides:', metadataOverrides)

    if (!filePath || !registryUrl || !authToken) {
      return { success: false, error: 'Missing required parameters (filePath, registryUrl, authToken)' }
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Package file not found: ${filePath}` }
    }

    // Find registry name from config matching the URL
    const globalPath = getGlobalConfigPath()
    const config = await readConfigFile(globalPath) || {}
    const registries = config.registry?.registries || {}
    const normalizedUrl = registryUrl.replace(/\/$/, '')

    let registryName = null
    for (const [name, reg] of Object.entries(registries)) {
      if (reg.url && reg.url.replace(/\/$/, '') === normalizedUrl) {
        registryName = name
        break
      }
    }

    if (!registryName) {
      return { success: false, error: `No registry configured for URL: ${registryUrl}. Check ~/.prompd/config.yaml` }
    }

    console.log(`[Electron] Using registry: ${registryName} (${normalizedUrl})`)

    // Read the .pdpkg and extract metadata
    const fileBuffer = fs.readFileSync(filePath)
    console.log(`[Electron] Package file read: ${fileBuffer.length} bytes`)

    const AdmZip = require('adm-zip')
    const zip = new AdmZip(fileBuffer)

    const manifestEntry = zip.getEntry('prompd.json') || zip.getEntry('manifest.json')
    if (!manifestEntry) {
      return { success: false, error: 'Package missing prompd.json' }
    }

    const metadata = JSON.parse(manifestEntry.getData().toString('utf8'))

    // Apply metadata overrides from the UI (e.g., scoped name, version)
    // The registry server re-extracts metadata from the archive's prompd.json,
    // so we must rebuild the archive with updated prompd.json inside it.
    let uploadBuffer = fileBuffer
    if (metadataOverrides && typeof metadataOverrides === 'object') {
      const scopedName = metadataOverrides.name // e.g., "@pikles/loop"

      // Registry extracts metadata from the archive's prompd.json and uses
      // `id || name` as the package identifier. Set id to the scoped name
      // so the registry sees it. Keep name as the friendly display name.
      if (scopedName) metadata.id = scopedName
      if (metadataOverrides.version) metadata.version = metadataOverrides.version
      if (metadataOverrides.description) metadata.description = metadataOverrides.description

      // Rebuild the ZIP with updated prompd.json
      const manifestName = manifestEntry.entryName
      const newZip = new AdmZip()
      for (const entry of zip.getEntries()) {
        if (entry.entryName === manifestName) {
          newZip.addFile(manifestName, Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'))
        } else {
          newZip.addFile(entry.entryName, entry.getData(), entry.comment, entry.attr)
        }
      }
      uploadBuffer = newZip.toBuffer()
      console.log('[Electron] Rebuilt archive with overrides, new size:', uploadBuffer.length, 'bytes')

      // For RegistryClient.uploadPackageBuffer: name must be the scoped identifier
      // because it's used in the URL path (/packages/@scope/name)
      if (scopedName) metadata.name = scopedName
    }

    console.log('[Electron] Final metadata name:', metadata.name, 'version:', metadata.version)

    if (!metadata.name) {
      return { success: false, error: 'Package name missing from prompd.json' }
    }

    // Publish via CLI RegistryClient
    const { RegistryClient } = await import('@prompd/cli')
    const client = new RegistryClient({ registryName })

    await client.uploadPackageBuffer(uploadBuffer, metadata, {
      access: 'public',
      tag: 'latest',
      authToken
    })

    console.log(`[Electron] Published: ${metadata.name}@${metadata.version}`)
    return { success: true, data: { name: metadata.name, version: metadata.version } }
  } catch (error) {
    console.error('[Electron] Publish error:', error.message)
    return { success: false, error: error.message }
  }
})

// ============================================================================
// Connection Testing Handlers
// ============================================================================

// Test SSH connection
ipcMain.handle('connection:testSSH', async (_event, config) => {
  try {
    console.log('[Electron] Testing SSH connection to:', config.host)

    // Use net module to test TCP connectivity first
    return new Promise((resolve) => {
      const socket = require('net').createConnection({
        host: config.host,
        port: config.port || 22,
        timeout: 5000
      })

      socket.on('connect', () => {
        socket.end()
        resolve({
          success: true,
          message: `SSH port reachable at ${config.host}:${config.port || 22}`
        })
      })

      socket.on('timeout', () => {
        socket.destroy()
        resolve({
          success: false,
          message: 'Connection timed out'
        })
      })

      socket.on('error', (err) => {
        resolve({
          success: false,
          message: `Connection failed: ${err.message}`
        })
      })
    })
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// Test Database connection
ipcMain.handle('connection:testDatabase', async (_event, config) => {
  try {
    // Parse connection string to extract host/port if provided
    let host = config.host
    let port = config.port

    if (config.connectionString) {
      try {
        const connStr = config.connectionString
        // Strip protocol prefix to extract host
        const withoutProtocol = connStr.replace(/^[a-z+]+:\/\//, '')
        // Strip credentials (user:pass@)
        const afterAuth = withoutProtocol.includes('@')
          ? withoutProtocol.split('@').slice(1).join('@')
          : withoutProtocol
        // Extract host:port (before /dbname or ?params)
        const hostPart = afterAuth.split('/')[0].split('?')[0]
        // Handle comma-separated hosts (replica sets) - use first host
        const firstHost = hostPart.split(',')[0]

        if (firstHost.includes(':')) {
          host = firstHost.split(':')[0]
          port = parseInt(firstHost.split(':')[1]) || port
        } else {
          host = firstHost
        }

        // mongodb+srv:// uses SRV DNS records - test DNS resolution instead of TCP
        if (connStr.startsWith('mongodb+srv://')) {
          const dns = require('dns')
          return new Promise((resolve) => {
            dns.resolveSrv(`_mongodb._tcp.${host}`, (err, addresses) => {
              if (err) {
                resolve({
                  success: false,
                  message: `SRV lookup failed for ${host}: ${err.message}`
                })
              } else if (addresses && addresses.length > 0) {
                resolve({
                  success: true,
                  message: `SRV resolved to ${addresses.length} host(s): ${addresses[0].name}:${addresses[0].port}`
                })
              } else {
                resolve({
                  success: false,
                  message: `No SRV records found for ${host}`
                })
              }
            })
          })
        }
      } catch (parseErr) {
        console.warn('[Electron] Failed to parse connection string, falling back to host field:', parseErr.message)
      }
    }

    if (!host) {
      return { success: false, message: 'No host specified' }
    }

    console.log('[Electron] Testing database connection to:', host)

    const defaultPorts = {
      postgresql: 5432,
      mysql: 3306,
      mongodb: 27017,
      redis: 6379
    }
    const resolvedPort = port || defaultPorts[config.type] || 5432

    // Use net module to test TCP connectivity
    return new Promise((resolve) => {
      const socket = require('net').createConnection({
        host: host,
        port: resolvedPort,
        timeout: 5000
      })

      socket.on('connect', () => {
        socket.end()
        resolve({
          success: true,
          message: `Database port reachable at ${host}:${resolvedPort}`
        })
      })

      socket.on('timeout', () => {
        socket.destroy()
        resolve({
          success: false,
          message: 'Connection timed out'
        })
      })

      socket.on('error', (err) => {
        resolve({
          success: false,
          message: `Connection failed: ${err.message}`
        })
      })
    })
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// Test MCP Server connection (via HTTP/WebSocket)
ipcMain.handle('connection:testMCP', async (_event, config) => {
  try {
    console.log('[Electron] Testing MCP server connection to:', config.serverUrl)

    if (!config.serverUrl) {
      return { success: false, message: 'Server URL is required' }
    }

    // Use net module to make HTTP request
    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        url: config.serverUrl
      })

      const timeout = setTimeout(() => {
        request.abort()
        resolve({ success: false, message: 'Connection timed out' })
      }, 5000)

      request.on('response', (response) => {
        clearTimeout(timeout)
        resolve({
          success: true,
          message: `MCP server reachable (HTTP ${response.statusCode})`
        })
      })

      request.on('error', (error) => {
        clearTimeout(timeout)
        resolve({
          success: false,
          message: `Connection failed: ${error.message}`
        })
      })

      request.end()
    })
  } catch (error) {
    return {
      success: false,
      message: error.message
    }
  }
})

// Workspace path handlers for git operations
ipcMain.handle('workspace:getPath', async () => {
  return currentWorkspacePath
})

// Find git root directory (searches upward from workspace)
ipcMain.handle('git:findRoot', async (event, startPath) => {
  const searchPath = startPath || currentWorkspacePath
  if (!searchPath) {
    return { success: false, error: 'No workspace path set' }
  }
  const gitRoot = await findGitRoot(searchPath)
  if (gitRoot) {
    return { success: true, path: gitRoot }
  }
  return { success: false, error: 'Not a git repository (or any parent)' }
})

ipcMain.handle('workspace:setPath', async (event, workspacePath) => {
  // Validate path exists
  if (workspacePath && typeof workspacePath === 'string') {
    try {
      const stats = await fs.promises.stat(workspacePath)
      if (stats.isDirectory()) {
        currentWorkspacePath = workspacePath
        mcpServerService.setWorkspacePath(currentWorkspacePath)
        updateWindowTitle()
        return { success: true, path: workspacePath }
      }
    } catch (error) {
      return { success: false, error: 'Path does not exist or is not a directory' }
    }
  }
  return { success: false, error: 'Invalid path' }
})

// Window focus handler - fixes input fields becoming readonly after native dialogs
ipcMain.handle('window:focus', async () => {
  if (mainWindow) {
    mainWindow.focus()
    // Also blur and refocus the webContents to properly restore input focus
    mainWindow.webContents.focus()
  }
})

// Git command handler with security validation
ipcMain.handle('git:runCommand', async (event, args, cwd) => {
  // Validate args is an array of strings
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    return { success: false, output: 'Invalid git arguments' }
  }

  // Whitelist of allowed git commands for security
  const allowedCommands = [
    'status', 'branch', 'add', 'restore', 'commit', 'log', 'init', 'diff'
  ]
  const gitCommand = args[0]
  if (!allowedCommands.includes(gitCommand)) {
    return { success: false, output: `Git command '${gitCommand}' not allowed` }
  }

  // Validate paths in arguments to prevent path traversal
  for (const arg of args) {
    if (arg.includes('..') || arg.includes('~')) {
      return { success: false, output: 'Path traversal not allowed' }
    }
    // Prevent command injection
    const dangerousChars = [';', '&', '|', '`', '$', '(', ')', '<', '>']
    for (const char of dangerousChars) {
      if (arg.includes(char)) {
        return { success: false, output: `Character '${char}' not allowed in arguments` }
      }
    }
  }

  return new Promise((resolve) => {
    const gitProcess = spawn('git', args, {
      cwd: cwd || currentWorkspacePath || process.cwd(),
      shell: false // Important: don't use shell to prevent injection
    })

    let stdout = ''
    let stderr = ''

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout })
      } else {
        resolve({ success: false, output: stderr || stdout })
      }
    })

    gitProcess.on('error', (err) => {
      resolve({ success: false, output: err.message })
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      gitProcess.kill()
      resolve({ success: false, output: 'Git command timed out' })
    }, 30000)
  })
})

// Handle app protocol for deep linking
// In dev mode, process.execPath is electron.exe so we must pass the app path
// as an argument so Windows can relaunch the dev app from a protocol URL.
if (process.defaultApp) {
  app.setAsDefaultProtocolClient('prompd', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('prompd')
}

// Override Windows registry so browser dialogs show "Open Prompd?" instead of "Open Electron?"
// Chrome/Edge read ApplicationName from the Application subkey, not the default value.
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process')
    const exePath = process.execPath.replace(/\\/g, '\\\\')
    const regCmds = [
      'reg add "HKCU\\Software\\Classes\\prompd" /ve /d "Prompd" /f',
      'reg add "HKCU\\Software\\Classes\\prompd\\Application" /v "ApplicationName" /d "Prompd" /f',
      'reg add "HKCU\\Software\\Classes\\prompd\\Application" /v "ApplicationDescription" /d "Prompd - AI Workflow Studio" /f',
      `reg add "HKCU\\Software\\Classes\\prompd\\Application" /v "ApplicationIcon" /d "${exePath},0" /f`,
    ]
    for (const cmd of regCmds) {
      execSync(cmd, { windowsHide: true, stdio: 'ignore' })
    }
  } catch (_) {
    // Non-critical — protocol handler still works
  }
}

// Handle protocol URLs (prompd://)
function handleProtocolUrl(url) {
  console.log('[Electron] Protocol URL received:', url)
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('protocol-url', url)
  } else {
    pendingProtocolUrl = url
  }
}

// Handle file opens (.prmd, .pdflow, .pdpkg)
function handleFileOpen(filePath) {
  console.log('[Electron] File open requested:', filePath)
  // Validate file extension
  const ext = path.extname(filePath).toLowerCase()
  const supportedExtensions = ['.prmd', '.pdflow', '.pdpkg']
  if (!supportedExtensions.includes(ext)) {
    console.log('[Electron] Ignoring non-prompd file:', filePath)
    return
  }

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('file-open', filePath)
  } else {
    pendingFileToOpen = filePath
  }
}

// Windows/Linux: Handle second instance with file path or protocol URL
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Electron] Second instance detected:', commandLine)

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    // Check for protocol URL in command line
    const protocolUrl = commandLine.find(arg => arg.startsWith('prompd://'))
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl)
      return
    }

    // Check for file path in command line
    const filePath = commandLine.find(arg => {
      const ext = path.extname(arg).toLowerCase()
      return ext === '.prmd' || ext === '.pdflow' || ext === '.pdpkg'
    })
    if (filePath) {
      handleFileOpen(filePath)
    }
  })
}

// macOS: Handle protocol URL via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

// macOS: Handle file open via open-file event
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  handleFileOpen(filePath)
})

// Check command line arguments for file path on startup (Windows/Linux)
function checkStartupArgs() {
  const args = process.argv.slice(process.defaultApp ? 2 : 1)

  // Check for protocol URL
  const protocolUrl = args.find(arg => arg.startsWith('prompd://'))
  if (protocolUrl) {
    pendingProtocolUrl = protocolUrl
    return
  }

  // Check for file path
  const filePath = args.find(arg => {
    const ext = path.extname(arg).toLowerCase()
    return ext === '.prmd' || ext === '.pdflow' || ext === '.pdpkg'
  })
  if (filePath) {
    pendingFileToOpen = filePath
  }
}

// Call on startup
checkStartupArgs()

// IPC handler to get pending file/url when renderer is ready
ipcMain.handle('app:getPendingFile', async () => {
  const file = pendingFileToOpen
  pendingFileToOpen = null
  return file
})

ipcMain.handle('app:getPendingProtocolUrl', async () => {
  const url = pendingProtocolUrl
  pendingProtocolUrl = null
  return url
})

// ============================================
// Clerk OAuth Authentication for Electron
// ============================================

// Generate a random string for PKCE code verifier
function generateCodeVerifier() {
  const crypto = require('crypto')
  return crypto.randomBytes(32).toString('base64url')
}

// Generate code challenge from verifier (S256)
function generateCodeChallenge(verifier) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// Store for PKCE verifier
let oauthCodeVerifier = null

// Start OAuth flow - opens browser for Clerk sign-in
ipcMain.handle('auth:startOAuth', async () => {
  try {
    // Generate PKCE codes
    oauthCodeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(oauthCodeVerifier)

    // Build Clerk OAuth authorization URL
    const authUrl = new URL(`${CLERK_FRONTEND_API}/oauth/authorize`)
    authUrl.searchParams.set('client_id', CLERK_OAUTH_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    // Include 'openid' scope to receive id_token (proper JWT for API auth)
    authUrl.searchParams.set('scope', 'openid profile email')
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    // Force fresh login prompt - helps avoid cached sessions causing issues
    authUrl.searchParams.set('prompt', 'login')

    console.log('[Auth] Starting OAuth flow:', authUrl.toString())

    // Open in default browser
    await shell.openExternal(authUrl.toString())

    return { success: true }
  } catch (error) {
    console.error('[Auth] Failed to start OAuth:', error)
    return { success: false, error: error.message }
  }
})

// Exchange authorization code for tokens
ipcMain.handle('auth:exchangeCode', async (event, code) => {
  try {
    if (!oauthCodeVerifier) {
      throw new Error('No code verifier found - OAuth flow not started')
    }

    const https = require('https')
    const tokenUrl = `${CLERK_FRONTEND_API}/oauth/token`

    const body = new URLSearchParams({
      client_id: CLERK_OAUTH_CLIENT_ID,
      code: code,
      redirect_uri: OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: oauthCodeVerifier
    }).toString()

    return new Promise((resolve, reject) => {
      const url = new URL(tokenUrl)
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            // Check if response is empty
            if (!data || data.trim() === '') {
              resolve({ success: false, error: 'Empty response from token endpoint' })
              return
            }

            const tokens = JSON.parse(data)
            if (tokens.error) {
              console.error('[Auth] Token exchange error:', tokens)
              resolve({ success: false, error: tokens.error_description || tokens.error })
            } else {
              console.log('[Auth] Token exchange successful')
              oauthCodeVerifier = null // Clear verifier
              resolve({ success: true, tokens })
            }
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse token response' })
          }
        })
      })

      req.on('error', (error) => {
        console.error('[Auth] Token request error:', error)
        resolve({ success: false, error: error.message })
      })

      req.write(body)
      req.end()
    })
  } catch (error) {
    console.error('[Auth] Exchange code error:', error)
    return { success: false, error: error.message }
  }
})

// Get OAuth config for renderer
ipcMain.handle('auth:getConfig', async () => {
  return {
    clientId: CLERK_OAUTH_CLIENT_ID,
    frontendApi: CLERK_FRONTEND_API,
    redirectUri: OAUTH_REDIRECT_URI
  }
})

// Sign out - for OAuth/PKCE flow in Electron
// Note: OAuth tokens are stored locally, not as browser SSO cookies
// The browser redirect doesn't help - we just clear local tokens
// When user signs in again, they'll see the OAuth consent screen
ipcMain.handle('auth:signOut', async () => {
  console.log('[Auth] Sign-out completed (local tokens will be cleared by renderer)')
  return { success: true }
})

// Track if menu has been shown to prevent duplicate logs
let menuShown = false

// Show the application menu (called when user is authenticated)
ipcMain.handle('app:showMenu', async () => {
  if (menuShown) {
    // Menu already shown, skip duplicate call
    return true
  }
  menuShown = true
  console.log('[Electron] Showing application menu')
  createMenu()
  return true
})

// Update menu state from renderer (enables/disables menu items based on app state)
ipcMain.handle('app:updateMenuState', async (_event, newState) => {
  // Merge new state with existing state
  menuState = { ...menuState, ...newState }
  // Rebuild menu with new state
  createMenu()
  // Notify renderer for custom title bar menu
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-state-changed', menuState)
  }
  return true
})

// ── Custom title bar IPC handlers ──

// Generic menu trigger: renderer fires same IPC events as native menu
ipcMain.handle('menu:trigger', async (_event, action, ...args) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(action, ...args)
  }
})

// Window title query
ipcMain.handle('app:getWindowTitle', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return 'Prompd'
  return mainWindow.getTitle()
})

// Menu state query
ipcMain.handle('app:getMenuState', async () => {
  return { ...menuState }
})

// Auto-update: install downloaded update and restart
ipcMain.handle('update:install', async () => {
  const updater = getAutoUpdater()
  updater.quitAndInstall()
})

// Edit operations (for custom menu — proxy to webContents methods)
ipcMain.handle('edit:undo', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.undo() })
ipcMain.handle('edit:redo', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.redo() })
ipcMain.handle('edit:cut', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.cut() })
ipcMain.handle('edit:copy', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.copy() })
ipcMain.handle('edit:paste', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.paste() })
ipcMain.handle('edit:delete', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.delete() })
ipcMain.handle('edit:selectAll', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.selectAll() })

// View operations (for custom menu)
ipcMain.handle('view:reload', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload() })
ipcMain.handle('view:forceReload', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache() })
ipcMain.handle('view:toggleDevTools', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.toggleDevTools() })
ipcMain.handle('view:resetZoom', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.setZoomLevel(0) })
ipcMain.handle('view:zoomIn', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5)
  }
})
ipcMain.handle('view:zoomOut', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5)
  }
})
ipcMain.handle('view:toggleFullscreen', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

// File dialog menu actions (require main-process dialog)
ipcMain.handle('menu:openFileDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Prompd Files', extensions: ['prmd'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (!result.canceled && result.filePaths.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-open-file', result.filePaths[0])
  }
})

ipcMain.handle('menu:openFolderDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (!result.canceled && result.filePaths.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-open-folder', result.filePaths[0])
  }
})

ipcMain.handle('menu:closeFolder', async () => {
  currentWorkspacePath = null
  updateWindowTitle()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-close-folder')
  }
})

ipcMain.handle('app:quit', async () => { app.quit() })

ipcMain.handle('app:checkForUpdates', async () => {
  try {
    const updater = getAutoUpdater()
    updater.checkForUpdates()
  } catch (e) {
    console.warn('[Electron] Auto-updater check failed:', e.message)
  }
})

// Hotkey accelerator storage - maps action IDs to Electron accelerator strings
let customAccelerators = {}

// Update menu accelerators when user changes hotkeys
ipcMain.handle('app:updateHotkeys', async (_event, accelerators) => {
  console.log('[Electron] Updating hotkey accelerators:', Object.keys(accelerators))
  customAccelerators = accelerators
  // Rebuild menu with new accelerators
  createMenu()
  return true
})

// Agent command handler - runs allowed shell commands for the AI agent
// More permissive than git handler but still security-validated
ipcMain.handle('agent:runCommand', async (_event, command, cwd) => {
  console.log('[Agent] Running command:', command, 'in', cwd || currentWorkspacePath)

  // Validate command is a string
  if (typeof command !== 'string' || !command.trim()) {
    return { success: false, output: 'Invalid command', exitCode: -1 }
  }

  // Parse command into executable and args
  // Simple parsing - split on spaces but respect quotes
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  if (parts.length === 0) {
    return { success: false, output: 'Empty command', exitCode: -1 }
  }

  const executable = parts[0].toLowerCase()
  const args = parts.slice(1).map(arg => {
    // Remove surrounding quotes if present
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return arg.slice(1, -1)
    }
    return arg
  })

  // Whitelist of allowed executables for security
  const allowedExecutables = [
    'npm', 'npx', 'node',           // Node.js ecosystem
    'yarn', 'pnpm',                 // Package managers
    'git',                          // Version control
    'tsc', 'typescript',            // TypeScript compiler
    'eslint', 'prettier',           // Linting/formatting
    'python', 'python3', 'pip',     // Python (for prompd CLI)
    'prompd',                       // Prompd CLI
    'dotnet',                       // .NET CLI
    'ls', 'dir', 'find', 'tree',    // Directory listing
    'cat', 'head', 'tail', 'type',  // File reading
    'grep', 'sed', 'awk',           // Text search/transform
    'wc', 'sort', 'uniq', 'diff',   // Text analysis
    'cp', 'mv', 'mkdir', 'rmdir', 'touch', // File operations
    'echo', 'pwd',                  // Shell basics
    'where', 'which',               // Command location
    'whoami', 'hostname',           // System info (safe)
    'curl', 'wget',                 // HTTP requests
  ]

  if (!allowedExecutables.includes(executable)) {
    return {
      success: false,
      output: `Command '${executable}' not allowed. Allowed: ${allowedExecutables.join(', ')}`,
      exitCode: -1
    }
  }

  // Validate all arguments for security
  for (const arg of args) {
    // Prevent path traversal patterns (../ or ..\) not just '..' in text
    if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(arg)) {
      return { success: false, output: 'Path traversal (..) not allowed in arguments', exitCode: -1 }
    }
    // Prevent home directory expansion
    if (arg.startsWith('~')) {
      return { success: false, output: 'Home directory (~) expansion not allowed', exitCode: -1 }
    }
    // Prevent command injection via shell metacharacters
    const dangerousChars = [';', '&', '|', '`', '$', '(', ')', '<', '>']
    for (const char of dangerousChars) {
      if (arg.includes(char)) {
        return { success: false, output: `Shell metacharacter '${char}' not allowed in arguments`, exitCode: -1 }
      }
    }
  }

  // Determine working directory
  const workingDir = cwd || currentWorkspacePath || process.cwd()

  // Validate working directory exists
  try {
    const stats = await fs.promises.stat(workingDir)
    if (!stats.isDirectory()) {
      return { success: false, output: 'Working directory is not a directory', exitCode: -1 }
    }
  } catch (error) {
    return { success: false, output: `Working directory does not exist: ${workingDir}`, exitCode: -1 }
  }

  return new Promise((resolve) => {
    // Determine executable path and whether we need shell
    let executablePath = executable
    let spawnArgs = args
    let useShell = false

    // Windows-specific handling
    if (process.platform === 'win32') {
      // Use .cmd extension for npm/npx/yarn/pnpm etc.
      if (['npm', 'npx', 'yarn', 'pnpm', 'tsc', 'eslint', 'prettier'].includes(executable)) {
        executablePath = `${executable}.cmd`
      }
      // Shell built-ins need cmd.exe wrapper (echo, type, dir, etc.)
      else if (['echo', 'type', 'dir', 'mkdir', 'rmdir', 'where'].includes(executable)) {
        // Use cmd.exe /c to run shell built-ins safely
        // Arguments are already validated, so this is safe
        executablePath = 'cmd.exe'
        spawnArgs = ['/c', executable, ...args]
      }
    }

    const childProcess = spawn(executablePath, spawnArgs, {
      cwd: workingDir,
      shell: useShell, // Keep shell: false for security
      env: { ...process.env } // Pass through environment variables
    })

    let stdout = ''
    let stderr = ''

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    childProcess.on('close', (code) => {
      console.log('[Agent] Command completed with code:', code)
      // Return 'output' to match the TypeScript type definition (electron.d.ts)
      // Combine stdout and stderr for full visibility
      resolve({
        success: code === 0,
        output: stdout || stderr,  // Match the expected 'output' property
        exitCode: code
      })
    })

    childProcess.on('error', (err) => {
      console.error('[Agent] Command error:', err)
      resolve({
        success: false,
        output: err.message,  // Match the expected 'output' property
        exitCode: -1
      })
    })

    // Timeout after 60 seconds (longer than git for npm install, etc.)
    setTimeout(() => {
      childProcess.kill()
      resolve({
        success: false,
        output: stdout || 'Command timed out after 60 seconds',  // Match expected 'output' property
        exitCode: -1
      })
    }, 60000)
  })
})

// ============================================
// Slash Command Handlers
// ============================================

// List .prmd files in workspace directory recursively
ipcMain.handle('slashCommand:listPrmdFiles', async (_event, workspacePath) => {
  if (!workspacePath) {
    return { success: false, error: 'No workspace path provided', files: [] }
  }

  try {
    const prmdFiles = []

    async function scanDir(dirPath, relativePath = '') {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const relPath = path.join(relativePath, entry.name)

        // Skip hidden folders and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue
        }

        if (entry.isDirectory()) {
          await scanDir(fullPath, relPath)
        } else if (entry.name.endsWith('.prmd')) {
          prmdFiles.push(relPath)
        }
      }
    }

    await scanDir(workspacePath)
    return { success: true, files: prmdFiles }
  } catch (error) {
    return { success: false, error: error.message, files: [] }
  }
})

// Execute slash command using @prompd/cli (compile, validate, etc.)
// This handler routes to the installed @prompd/cli library
ipcMain.handle('slashCommand:execute', async (_event, commandId, args, context) => {
  console.log('[SlashCommand] Execute:', commandId, args)

  try {
    // For now, we delegate to the prompd CLI executable
    // In the future, we can import @prompd/cli directly when bundled
    const workingDir = context.workspacePath || currentWorkspacePath || process.cwd()

    switch (commandId) {
      case 'compile': {
        // Use shared compilePrompt() function - single compilation path for all use cases
        try {
          // Construct full file path from workspace and filename
          // context.fileName is the relative path from workspace root (e.g., "prompts/my-file.prmd")
          let filePath = null
          if (context.workspacePath && context.fileName) {
            filePath = path.join(context.workspacePath, context.fileName)
          } else if (currentWorkspacePath && context.fileName) {
            filePath = path.join(currentWorkspacePath, context.fileName)
          }

          let output
          if (filePath && fs.existsSync(filePath)) {
            // File exists on disk - compile from filesystem (supports inheritance)
            output = await compilePrompt(context.fileContent, {
              workspacePath: context.workspacePath || currentWorkspacePath,
              filePath: filePath,
              format: 'markdown',
              parameters: {}
            })
          } else if (context.fileContent) {
            // No file on disk but we have content - compile in-memory
            // Note: This won't support local file inheritance, only package inheritance
            console.log('[SlashCommand] Compiling in-memory (no file path or file not saved)')
            const cli = await getPrompdCli()
            const { PrompdCompiler, MemoryFileSystem } = cli

            const memFS = new MemoryFileSystem({
              '/main.prmd': context.fileContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            })

            const compiler = new PrompdCompiler()
            output = await compiler.compile('/main.prmd', {
              outputFormat: 'markdown',
              parameters: {},
              fileSystem: memFS,
              registryUrl: context.registryUrl || 'http://localhost:4000',
              workspaceRoot: context.workspacePath || currentWorkspacePath || null,
              verbose: false
            })
          } else {
            return {
              success: false,
              output: '',
              error: 'No file content available. Please open a .prmd file first.'
            }
          }

          console.log('[SlashCommand] Compile result:', {
            outputLength: output?.length,
            outputPreview: output?.substring(0, 200)
          })

          if (output && output.length > 0) {
            return {
              success: true,
              output: output,
              data: { compiled: output }
            }
          } else {
            return {
              success: false,
              output: '',
              error: 'Compilation failed: No output generated'
            }
          }
        } catch (err) {
          console.error('[SlashCommand] Compile error:', err)
          console.error('[SlashCommand] Compile error stack:', err.stack)
          return {
            success: false,
            output: '',
            error: 'Compilation failed:\n' + (err.message || 'Unknown error')
          }
        }
      }

      case 'validate': {
        // Validate is handled in renderer process via slashCommandsLocal.ts
        // This handler is a fallback if IPC is called directly
        try {
          const cli = await getPrompdCli()
          const { PrompdParser, MemoryFileSystem, NodeFileSystem } = cli

          // Normalize line endings - the parser expects Unix-style \n
          const normalizedContent = context.fileContent?.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

          // Determine the file path - prefer actual file path for full filesystem access
          let filePath = context.fileName || 'main.prmd'
          let useRealFS = false

          // If we have a workspace path and filename, construct full path for real FS
          if (context.workspacePath && context.fileName) {
            const fullPath = path.join(context.workspacePath, context.fileName)
            if (fs.existsSync(fullPath)) {
              filePath = fullPath
              useRealFS = true
            }
          }

          console.log('[SlashCommand] Validate: file path:', filePath)
          console.log('[SlashCommand] Validate: using real filesystem:', useRealFS)

          let parserOptions = {}
          if (useRealFS) {
            parserOptions.fileSystem = new NodeFileSystem()
          } else {
            parserOptions.fileSystem = new MemoryFileSystem({
              [filePath]: normalizedContent
            })
          }

          const parser = new PrompdParser(parserOptions)
          const issues = await parser.validateFile(filePath)

          const fileName = context.fileName || 'file'
          if (!issues || issues.length === 0) {
            return {
              success: true,
              output: `**Validation passed** for ${fileName}\n\nNo issues found.`,
              data: { valid: true }
            }
          } else {
            const issuesList = issues.map(issue => {
              const location = issue.line ? ` (line ${issue.line})` : ''
              return `- **${issue.severity || 'error'}**: ${issue.message}${location}`
            }).join('\n')
            const hasErrors = issues.some(i => i.severity === 'error')
            return {
              success: !hasErrors,
              output: `**Validation ${hasErrors ? 'failed' : 'warnings'}** for ${fileName}\n\n${issuesList}`,
              data: { valid: !hasErrors, issues }
            }
          }
        } catch (err) {
          console.error('[SlashCommand] Validate error:', err)
          return {
            success: false,
            output: '',
            error: err.message || 'Validation failed'
          }
        }
      }

      case 'search': {
        if (!args.trim()) {
          return { success: false, output: '', error: 'Please provide a search query: /search <query>' }
        }

        try {
          // Call registry API directly - use /packages endpoint with search param
          // Registry URL from app settings (context), fall back to env var
          const registryUrl = context.registryUrl || process.env.VITE_REGISTRY_URL || 'http://localhost:4000'
          const searchUrl = `${registryUrl}/packages?search=${encodeURIComponent(args)}&limit=10`

          const response = await fetch(searchUrl)
          const data = await response.json()

          if (!response.ok) {
            return {
              success: false,
              output: '',
              error: data.error || `Search failed: ${response.status}`
            }
          }

          const packages = data.data || data.packages || []

          if (packages.length === 0) {
            return {
              success: true,
              output: `## No results for "${args}"\n\nTry a different search term or browse the registry at [prompdhub.ai](https://prompdhub.ai)`,
              data: { query: args, packages: [] }
            }
          }

          let output = `## Search results for "${args}"\n\n`
          for (const pkg of packages.slice(0, 10)) {
            output += `### ${pkg.name}${pkg.version ? ` v${pkg.version}` : ''}\n`
            output += `${pkg.description || 'No description'}\n`
            output += `\`/install ${pkg.name}@${pkg.version || 'latest'}\`\n\n`
          }

          if (packages.length > 10) {
            output += `*...and ${packages.length - 10} more results*\n`
          }

          return {
            success: true,
            output,
            data: { query: args, packages }
          }
        } catch (err) {
          console.error('[SlashCommand] Search error:', err)
          return {
            success: false,
            output: '',
            error: err.message || 'Search failed - check your internet connection'
          }
        }
      }

      case 'install': {
        if (!args.trim()) {
          return { success: false, output: '', error: 'Please provide a package: /install <package@version>' }
        }

        if (!context.workspacePath) {
          return { success: false, output: '', error: 'No workspace open. Open a folder first to install packages.' }
        }

        try {
          // Parse package reference (e.g., "@namespace/name@version" or "name@version")
          const packageRef = args.trim()
          let packageName = packageRef
          let version = 'latest'

          const atIndex = packageRef.lastIndexOf('@')
          if (atIndex > 0 && !packageRef.startsWith('@')) {
            // name@version format
            packageName = packageRef.substring(0, atIndex)
            version = packageRef.substring(atIndex + 1)
          } else if (packageRef.startsWith('@')) {
            // @namespace/name@version format
            const lastAt = packageRef.lastIndexOf('@')
            if (lastAt > packageRef.indexOf('/')) {
              packageName = packageRef.substring(0, lastAt)
              version = packageRef.substring(lastAt + 1)
            }
          }

          // Fetch package info from registry
          const registryUrl = context.registryUrl || process.env.VITE_REGISTRY_URL || 'http://localhost:4000'

          // Build the path for scoped vs unscoped packages
          // Scoped: /packages/@scope/name  Unscoped: /packages/name
          // Don't use encodeURIComponent on the full package name as it needs to be a path
          const packagePath = packageName.startsWith('@')
            ? `/packages/${packageName}`  // @scope/name -> /packages/@scope/name
            : `/packages/${encodeURIComponent(packageName)}`  // name -> /packages/name

          const infoUrl = `${registryUrl}${packagePath}`

          console.log('[SlashCommand] Fetching package info:', infoUrl)
          const infoResponse = await fetch(infoUrl)

          if (!infoResponse.ok) {
            return {
              success: false,
              output: '',
              error: `Package not found: ${packageName}`
            }
          }

          const pkgInfo = await infoResponse.json()
          const pkg = pkgInfo.data || pkgInfo
          const actualVersion = version === 'latest' ? (pkg.version || pkg['dist-tags']?.latest || '1.0.0') : version

          // Download the package tarball/pdpkg
          // Use the same path pattern with /download/version appended
          const downloadUrl = `${registryUrl}${packagePath}/download/${actualVersion}`
          console.log('[SlashCommand] Downloading package:', downloadUrl)

          const downloadResponse = await fetch(downloadUrl)
          if (!downloadResponse.ok) {
            return {
              success: false,
              output: '',
              error: `Failed to download package: ${packageName}@${actualVersion}`
            }
          }

          const packageBlob = await downloadResponse.arrayBuffer()

          // Create cache directory: .prompd/cache/@namespace/package@version/
          const cacheDir = path.join(context.workspacePath, '.prompd', 'cache')
          const packageCacheDir = path.join(cacheDir, `${packageName}@${actualVersion}`)

          // Ensure directories exist
          fs.mkdirSync(packageCacheDir, { recursive: true })

          // Extract the package (it's a ZIP/pdpkg file)
          const JSZip = require('jszip')
          const zip = await JSZip.loadAsync(packageBlob)

          // Extract all files
          const extractedFiles = []
          for (const [filePath, file] of Object.entries(zip.files)) {
            if (file.dir) continue
            const content = await file.async('nodebuffer')
            const fullPath = path.join(packageCacheDir, filePath)
            const fileDir = path.dirname(fullPath)
            fs.mkdirSync(fileDir, { recursive: true })
            fs.writeFileSync(fullPath, content)
            extractedFiles.push(filePath)
          }

          console.log('[SlashCommand] Extracted', extractedFiles.length, 'files to:', packageCacheDir)

          // Update prompd.json with the new dependency
          const prompdJsonPath = path.join(context.workspacePath, 'prompd.json')
          let prompdJson = { dependencies: {} }

          if (fs.existsSync(prompdJsonPath)) {
            try {
              const content = fs.readFileSync(prompdJsonPath, 'utf8')
              if (content && content.trim() !== '') {
                prompdJson = JSON.parse(content)
              }
            } catch (err) {
              console.warn('[SlashCommand] Failed to parse existing prompd.json:', err.message)
            }
          }

          // Ensure dependencies object exists
          if (!prompdJson.dependencies) {
            prompdJson.dependencies = {}
          }

          // Add or update the dependency
          prompdJson.dependencies[packageName] = actualVersion

          // Write updated prompd.json
          fs.writeFileSync(prompdJsonPath, JSON.stringify(prompdJson, null, 2) + '\n')
          console.log('[SlashCommand] Updated prompd.json with dependency:', packageName, '@', actualVersion)

          return {
            success: true,
            output: `## Installed: ${packageName}@${actualVersion}\n\n` +
              `**Description:** ${pkg.description || 'No description'}\n\n` +
              `**Cache location:** \`.prompd/cache/${packageName}@${actualVersion}/\`\n\n` +
              `**Files extracted:** ${extractedFiles.length}\n\n` +
              `Added to \`prompd.json\` dependencies.\n\n` +
              `To use this package:\n` +
              `\`\`\`yaml\ninherits: "${packageName}@${actualVersion}"\n\`\`\``,
            data: {
              package: packageRef,
              info: pkg,
              version: actualVersion,
              cacheDir: packageCacheDir,
              filesExtracted: extractedFiles.length
            }
          }
        } catch (err) {
          console.error('[SlashCommand] Install error:', err)
          return {
            success: false,
            output: '',
            error: err.message || 'Install failed - check your internet connection'
          }
        }
      }

      case 'list': {
        // List all .prmd files in workspace
        if (!context.workspacePath) {
          return { success: false, output: '', error: 'No workspace open. Open a folder first.' }
        }

        try {
          const prmdFiles = []

          const scanDir = async (dir, prefix = '') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name)
              const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

              if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                await scanDir(fullPath, relativePath)
              } else if (entry.isFile() && entry.name.endsWith('.prmd')) {
                prmdFiles.push(relativePath)
              }
            }
          }

          await scanDir(context.workspacePath)

          if (prmdFiles.length === 0) {
            return {
              success: true,
              output: '## .prmd Files\n\nNo .prmd files found in workspace.',
              data: { files: [] }
            }
          }

          const fileList = prmdFiles.map(f => `- ${f}`).join('\n')
          return {
            success: true,
            output: `## .prmd Files (${prmdFiles.length})\n\n${fileList}`,
            data: { files: prmdFiles }
          }
        } catch (err) {
          return {
            success: false,
            output: '',
            error: err.message || 'Failed to list files'
          }
        }
      }

      case 'deps': {
        // Show package dependencies and inherits chain
        if (!context.fileContent) {
          return { success: false, output: '', error: 'No file open. Open a .prmd file first.' }
        }

        try {
          const cli = await getPrompdCli()
          const { PrompdParser, MemoryFileSystem } = cli

          // Normalize line endings
          const normalizedContent = context.fileContent?.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          const filePath = context.fileName || 'main.prmd'

          const memFS = new MemoryFileSystem({
            [filePath]: normalizedContent
          })

          const parser = new PrompdParser({ fileSystem: memFS })
          const parsed = parser.parseContent(normalizedContent)

          const deps = []

          // Check inherits
          if (parsed.metadata?.inherits) {
            deps.push(`**Inherits:** \`${parsed.metadata.inherits}\``)
          }

          // Check using imports
          if (parsed.metadata?.using && Array.isArray(parsed.metadata.using)) {
            deps.push('\n**Using:**')
            for (const pkg of parsed.metadata.using) {
              if (typeof pkg === 'string') {
                deps.push(`- \`${pkg}\``)
              } else if (pkg.name) {
                const prefix = pkg.prefix ? ` (prefix: ${pkg.prefix})` : ''
                deps.push(`- \`${pkg.name}\`${prefix}`)
              }
            }
          }

          if (deps.length === 0) {
            return {
              success: true,
              output: '## Dependencies\n\nNo dependencies found in this file.',
              data: { inherits: null, using: [] }
            }
          }

          return {
            success: true,
            output: `## Dependencies\n\n${deps.join('\n')}`,
            data: {
              inherits: parsed.metadata?.inherits || null,
              using: parsed.metadata?.using || []
            }
          }
        } catch (err) {
          return {
            success: false,
            output: '',
            error: err.message || 'Failed to parse dependencies'
          }
        }
      }

      case 'explain': {
        // Explain the structure and purpose of the file
        if (!context.fileContent) {
          return { success: false, output: '', error: 'No file open. Open a .prmd file first.' }
        }

        try {
          const cli = await getPrompdCli()
          const { PrompdParser, MemoryFileSystem } = cli

          // Normalize line endings
          const normalizedContent = context.fileContent?.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          const filePath = context.fileName || 'main.prmd'

          const memFS = new MemoryFileSystem({
            [filePath]: normalizedContent
          })

          const parser = new PrompdParser({ fileSystem: memFS })
          const parsed = parser.parseContent(normalizedContent)

          const explanation = []
          explanation.push(`## ${parsed.metadata?.name || 'Unnamed Prompd'}\n`)

          if (parsed.metadata?.description) {
            explanation.push(`**Description:** ${parsed.metadata.description}\n`)
          }

          if (parsed.version) {
            explanation.push(`**Version:** ${parsed.version}`)
          }

          if (parsed.metadata?.parameters?.length > 0) {
            explanation.push('\n### Parameters\n')
            for (const param of parsed.metadata.parameters) {
              const required = param.required ? ' *(required)*' : ''
              const defaultVal = param.default !== undefined ? ` (default: \`${param.default}\`)` : ''
              explanation.push(`- **${param.name}** \`${param.type}\`${required}${defaultVal}`)
              if (param.description) {
                explanation.push(`  ${param.description}`)
              }
            }
          }

          if (parsed.metadata?.inherits) {
            explanation.push(`\n### Inherits From\n\`${parsed.metadata.inherits}\``)
          }

          const bodyLength = parsed.body?.length || 0
          explanation.push(`\n### Content\nBody contains ${bodyLength} characters of prompt content.`)

          return {
            success: true,
            output: explanation.join('\n'),
            data: { metadata: parsed.metadata }
          }
        } catch (err) {
          return {
            success: false,
            output: '',
            error: err.message || 'Failed to explain file'
          }
        }
      }

      case 'new': {
        // Create a new .prmd file template
        const name = args.trim() || 'new-prompt'
        const safeName = name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase()

        const template = `---
id: ${safeName}
name: ${name}
description: Description of your prompt
version: 1.0.0
parameters:
  - name: input
    type: string
    description: The main input for this prompt
    required: true
---

# ${name}

Your prompt content goes here.

Use parameters like this: {{input}}`

        return {
          success: true,
          output: `## New Prompd Template: ${name}\n\nHere's a starter template:\n\n\`\`\`yaml\n${template}\n\`\`\`\n\nCopy this to a new file named \`${safeName}.prmd\``,
          data: { template, filename: `${safeName}.prmd` }
        }
      }

      case 'help': {
        const helpText = `## Slash Commands

### File Commands
- **/validate** - Validate the current .prmd file for errors
- **/compile** - Compile to markdown format
- **/explain** - Explain the structure and purpose of this file
- **/deps** - Show package dependencies and inherits chain

### Registry Commands
- **/search** \`<query>\` - Search the package registry
- **/install** \`<package@version>\` - Install a package from the registry

### Workspace Commands
- **/list** - List all .prmd files in workspace
- **/new** \`[name]\` - Create a new .prmd file template

### Help
- **/help** - Show this help message`

        return {
          success: true,
          output: helpText,
          data: {}
        }
      }

      default:
        return {
          success: false,
          output: '',
          error: `Command /${commandId} not implemented in IPC handler`
        }
    }
  } catch (error) {
    console.error('[SlashCommand] Error:', error)
    return {
      success: false,
      output: '',
      error: error.message || 'Command execution failed'
    }
  }
})

// Note: Shell-based CLI spawning removed in favor of @prompd/cli library
// All slash commands now use direct library calls or HTTP API

// ============================================
// Config Management IPC Handlers
// Reads/writes ~/.prompd/config.yaml and ./.prompd/config.yaml
// Config hierarchy: CLI args > env vars > local config > global config > defaults
// ============================================

// Default config values (lowest priority)
const DEFAULT_CONFIG = {
  // LLM provider defaults
  default_provider: '',
  default_model: '',

  // API keys for LLM providers (or set via environment variables)
  // Supported: openai, anthropic, google, groq, mistral, cohere, together, perplexity, deepseek, ollama
  api_keys: {
    openai: '',
    anthropic: '',
    google: '',
    groq: '',
    mistral: '',
    cohere: '',
    together: '',
    perplexity: '',
    deepseek: ''
  },

  // Custom OpenAI-compatible providers
  // custom_providers:
  //   my-provider:
  //     display_name: "My Provider"
  //     base_url: "https://api.my-provider.ai/v1"
  //     api_key: ""
  //     type: "openai-compatible"
  //     enabled: true
  //     models:
  //       - "model-name"
  custom_providers: {},

  // Per-provider settings (temperature, max_tokens, etc.)
  provider_configs: {},

  // Providers to hide from the UI
  disabled_providers: [],

  // System services
  services: {
    mcp_server: {
      auto_start: false,
      port: 3100,
      api_key: ''
    }
  },

  // Package registry configuration
  registry: {
    default: 'prompdhub',
    current_namespace: '',
    registries: {
      prompdhub: {
        url: 'https://registry.prompdhub.ai',
        api_key: '',
        username: ''
      }
    }
  },

  // Scope-to-registry mappings (e.g., @my-org -> my-registry)
  scopes: {},

  // Request settings
  timeout: 30,
  max_retries: 3,
  verbose: false
}

// Get global config path: ~/.prompd/config.yaml
function getGlobalConfigPath() {
  return path.join(os.homedir(), '.prompd', 'config.yaml')
}

// Get local config path: ./.prompd/config.yaml (workspace-specific)
function getLocalConfigPath(workspacePath) {
  if (!workspacePath) return null
  return path.join(workspacePath, '.prompd', 'config.yaml')
}

// Read and parse a YAML config file, returns null if not found
async function readConfigFile(configPath) {
  try {
    const content = await fs.promises.readFile(configPath, 'utf-8')
    return yaml.parse(content) || {}
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null // File doesn't exist
    }
    console.error(`[Config] Error reading ${configPath}:`, error.message)
    return null
  }
}

// Deep merge two config objects (source overwrites target for defined values)
function mergeConfigs(target, source) {
  if (!source) return target
  if (!target) return source

  const result = { ...target }

  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = target[key]

    if (sourceVal === undefined || sourceVal === null) {
      continue // Skip undefined/null values in source
    }

    if (typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
        typeof targetVal === 'object' && !Array.isArray(targetVal)) {
      // Deep merge objects
      result[key] = mergeConfigs(targetVal, sourceVal)
    } else {
      // Overwrite with source value
      result[key] = sourceVal
    }
  }

  return result
}

// Resolve environment variable references in config values
// Supports ${VAR_NAME} syntax
function resolveEnvVars(config) {
  if (!config) return config

  if (typeof config === 'string') {
    return config.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match
    })
  }

  if (Array.isArray(config)) {
    return config.map(item => resolveEnvVars(item))
  }

  if (typeof config === 'object') {
    const result = {}
    for (const key of Object.keys(config)) {
      result[key] = resolveEnvVars(config[key])
    }
    return result
  }

  return config
}

// Cache for config to prevent duplicate loads
// Key is workspace path (or 'global' for no workspace)
const configCache = new Map()
let configLoadingPromise = null
let configLoadingWorkspace = null

// Load merged config following the hierarchy
// Priority: env vars > local config > global config > defaults
ipcMain.handle('config:load', async (_event, workspacePath) => {
  const cacheKey = workspacePath || 'global'

  // Return cached config if available and same workspace
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey)
  }

  // If there's already a load in progress for the same workspace, wait for it
  if (configLoadingPromise && configLoadingWorkspace === cacheKey) {
    return configLoadingPromise
  }

  // Start new load
  configLoadingWorkspace = cacheKey
  configLoadingPromise = (async () => {
    try {
      console.log('[Config] Loading config, workspace:', workspacePath || '(none)')

      // Start with defaults
      let config = { ...DEFAULT_CONFIG }

      // Load global config (~/.prompd/config.yaml)
      const globalPath = getGlobalConfigPath()
      const globalConfig = await readConfigFile(globalPath)
      if (globalConfig) {
        console.log('[Config] Loaded global config from:', globalPath)
        config = mergeConfigs(config, globalConfig)
      }

      // Load local config (./.prompd/config.yaml) if workspace provided
      const localPath = workspacePath ? getLocalConfigPath(workspacePath) : null
      if (localPath) {
        const localConfig = await readConfigFile(localPath)
        if (localConfig) {
          console.log('[Config] Loaded local config from:', localPath)
          config = mergeConfigs(config, localConfig)
        }
      }

      // Apply environment variable overrides
      // These override specific config values when set
      if (process.env.PROMPD_DEFAULT_PROVIDER) {
        config.default_provider = process.env.PROMPD_DEFAULT_PROVIDER
      }
      if (process.env.PROMPD_DEFAULT_MODEL) {
        config.default_model = process.env.PROMPD_DEFAULT_MODEL
      }
      if (process.env.OPENAI_API_KEY) {
        config.api_keys = config.api_keys || {}
        config.api_keys.openai = process.env.OPENAI_API_KEY
      }
      if (process.env.ANTHROPIC_API_KEY) {
        config.api_keys = config.api_keys || {}
        config.api_keys.anthropic = process.env.ANTHROPIC_API_KEY
      }
      if (process.env.GOOGLE_API_KEY) {
        config.api_keys = config.api_keys || {}
        config.api_keys.google = process.env.GOOGLE_API_KEY
      }
      if (process.env.GROQ_API_KEY) {
        config.api_keys = config.api_keys || {}
        config.api_keys.groq = process.env.GROQ_API_KEY
      }
      if (process.env.PROMPD_REGISTRY_URL) {
        config.registry = config.registry || { registries: {} }
        config.registry.registries = config.registry.registries || {}
        config.registry.registries.default = config.registry.registries.default || {}
        config.registry.registries.default.url = process.env.PROMPD_REGISTRY_URL
      }

      // Resolve ${VAR_NAME} syntax in config values
      config = resolveEnvVars(config)

      // Ensure config is complete with all fields and clean up any corrupted camelCase duplicates
      const cleanedConfig = ensureConfigComplete(config)

      // Auto-fix: If we cleaned up corrupted fields, save the clean version back to disk
      if (JSON.stringify(config) !== JSON.stringify(cleanedConfig)) {
        console.log('[Config] Detected and cleaned corrupted config fields, auto-saving...')
        try {
          const yamlContent = yaml.stringify(cleanedConfig, { indent: 2, lineWidth: 0 })
          await fs.promises.writeFile(globalPath, yamlContent, 'utf-8')
          console.log('[Config] Auto-saved cleaned config to:', globalPath)
        } catch (saveError) {
          console.error('[Config] Failed to auto-save cleaned config:', saveError.message)
        }
      }

      config = cleanedConfig

      const result = {
        success: true,
        config,
        sources: {
          globalPath,
          localPath,
          hasGlobal: globalConfig !== null,
          hasLocal: localPath ? (await readConfigFile(localPath)) !== null : false
        }
      }

      // Cache the successful result
      configCache.set(cacheKey, result)
      return result
    } catch (error) {
      console.error('[Config] Error loading config:', error)
      return { success: false, error: error.message }
    } finally {
      // Clean up loading state
      configLoadingPromise = null
      configLoadingWorkspace = null
    }
  })()

  return configLoadingPromise
})

// Ensure config has all required fields with proper structure
// Strips any camelCase duplicate fields and ensures snake_case only
function ensureConfigComplete(config) {
  // Start with full default structure
  const complete = JSON.parse(JSON.stringify(DEFAULT_CONFIG))

  // List of known camelCase duplicates to remove (these are corrupted fields)
  const camelCaseDuplicates = ['apiKeys', 'customProviders', 'providerConfigs', 'maxRetries', 'defaultProvider', 'defaultModel']

  // Merge user config into defaults, preserving their values
  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target

    for (const key of Object.keys(source)) {
      // Skip camelCase duplicates - these are corrupted and should be removed
      if (camelCaseDuplicates.includes(key)) {
        console.warn(`[Config] Removing corrupted camelCase field: ${key}`)
        continue
      }

      const sourceVal = source[key]
      const targetVal = target[key]

      if (sourceVal === undefined || sourceVal === null) {
        continue
      }

      if (typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
          typeof targetVal === 'object' && !Array.isArray(targetVal)) {
        target[key] = deepMerge(targetVal, sourceVal)
      } else {
        target[key] = sourceVal
      }
    }

    return target
  }

  return deepMerge(complete, config)
}

// Save config to file (global or local)
// location: 'global' | 'local'
ipcMain.handle('config:save', async (_event, config, location, workspacePath) => {
  try {
    let configPath

    if (location === 'local') {
      if (!workspacePath) {
        return { success: false, error: 'No workspace path provided for local config' }
      }
      configPath = getLocalConfigPath(workspacePath)
    } else {
      configPath = getGlobalConfigPath()
    }

    console.log('[Config] Saving config to:', configPath)

    // Ensure directory exists
    const configDir = path.dirname(configPath)
    await fs.promises.mkdir(configDir, { recursive: true })

    // Ensure config is complete and strip camelCase duplicates
    const completeConfig = ensureConfigComplete(config)

    // Convert to YAML and write
    const yamlContent = yaml.stringify(completeConfig, {
      indent: 2,
      lineWidth: 0 // Don't wrap lines
    })
    await fs.promises.writeFile(configPath, yamlContent, 'utf-8')

    console.log('[Config] Config saved successfully')

    // Invalidate cache since config changed
    // Clear all cache entries since global config affects all workspaces
    configCache.clear()

    return { success: true, path: configPath }
  } catch (error) {
    console.error('[Config] Error saving config:', error)
    return { success: false, error: error.message }
  }
})

// Clear config cache (force reload on next access)
ipcMain.handle('config:clearCache', async () => {
  console.log('[Config] Clearing config cache')
  configCache.clear()
  return { success: true }
})

// ============================================================================
// Connection Storage (global + workspace persistence with safeStorage encryption)
// ============================================================================

ipcMain.handle('connections:load', async (_event, workspacePath) => {
  try {
    const { loadConnections } = require('./services/connectionStorage')
    return await loadConnections(workspacePath || currentWorkspacePath)
  } catch (error) {
    console.error('[Connections] Load error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('connections:save', async (_event, connections, workspacePath) => {
  try {
    const { saveConnections } = require('./services/connectionStorage')
    return await saveConnections(connections, workspacePath || currentWorkspacePath)
  } catch (error) {
    console.error('[Connections] Save error:', error)
    return { success: false, error: error.message }
  }
})

// Get API key for a specific provider
// Checks: env vars > config file (with hierarchy)
ipcMain.handle('config:getApiKey', async (_event, provider, workspacePath) => {
  try {
    // First check environment variables (highest priority for API keys)
    const envVarMap = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      cohere: 'COHERE_API_KEY',
      together: 'TOGETHER_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      langsearch: 'LANGSEARCH_API_KEY',
      brave: 'BRAVE_API_KEY',
      tavily: 'TAVILY_API_KEY'
    }

    const envVar = envVarMap[provider.toLowerCase()]
    if (envVar && process.env[envVar]) {
      return { success: true, apiKey: process.env[envVar], source: 'env' }
    }

    // Load config and get from there
    const globalPath = getGlobalConfigPath()
    let config = await readConfigFile(globalPath) || {}

    // Check local config if workspace provided
    if (workspacePath) {
      const localPath = getLocalConfigPath(workspacePath)
      const localConfig = await readConfigFile(localPath)
      if (localConfig) {
        config = mergeConfigs(config, localConfig)
      }
    }

    // Check standard api_keys section
    const apiKey = config.api_keys?.[provider.toLowerCase()]
    if (apiKey) {
      return { success: true, apiKey, source: 'config' }
    }

    // Check services section (e.g. services.langsearch.api_key)
    const service = config.services?.[provider.toLowerCase()]
    if (service?.api_key) {
      return { success: true, apiKey: service.api_key, source: 'services' }
    }

    // Check custom providers
    const customProvider = config.custom_providers?.[provider.toLowerCase()]
    if (customProvider?.api_key) {
      return { success: true, apiKey: customProvider.api_key, source: 'custom_provider' }
    }

    return { success: true, apiKey: null, source: null }
  } catch (error) {
    console.error('[Config] Error getting API key:', error)
    return { success: false, error: error.message }
  }
})

// Set API key for a specific provider
// Always saves to global config (API keys shouldn't be project-specific)
ipcMain.handle('config:setApiKey', async (_event, provider, apiKey) => {
  try {
    const globalPath = getGlobalConfigPath()

    // Read existing config
    let config = await readConfigFile(globalPath) || {}

    // Ensure api_keys section exists
    config.api_keys = config.api_keys || {}

    // Set the key
    config.api_keys[provider.toLowerCase()] = apiKey

    // Ensure directory exists
    const configDir = path.dirname(globalPath)
    await fs.promises.mkdir(configDir, { recursive: true })

    // Write back
    const yamlContent = yaml.stringify(config, {
      indent: 2,
      lineWidth: 0
    })
    await fs.promises.writeFile(globalPath, yamlContent, 'utf-8')

    console.log('[Config] API key saved for provider:', provider)
    return { success: true }
  } catch (error) {
    console.error('[Config] Error setting API key:', error)
    return { success: false, error: error.message }
  }
})

// Get registry URL (with discovery support)
ipcMain.handle('config:getRegistryUrl', async (_event, registryName, workspacePath) => {
  try {
    // Load config
    const globalPath = getGlobalConfigPath()
    let config = await readConfigFile(globalPath) || {}

    if (workspacePath) {
      const localPath = getLocalConfigPath(workspacePath)
      const localConfig = await readConfigFile(localPath)
      if (localConfig) {
        config = mergeConfigs(config, localConfig)
      }
    }

    // Determine which registry to use
    const registryKey = registryName || config.registry?.default || 'prompdhub'
    const registry = config.registry?.registries?.[registryKey]

    if (registry?.url) {
      return { success: true, url: registry.url, name: registryKey }
    }

    // Fallback to environment variable
    if (process.env.PROMPD_REGISTRY_URL) {
      return { success: true, url: process.env.PROMPD_REGISTRY_URL, name: 'env' }
    }

    // Default fallback
    return { success: true, url: 'https://registry.prompdhub.ai', name: 'default' }
  } catch (error) {
    console.error('[Config] Error getting registry URL:', error)
    return { success: false, error: error.message }
  }
})

// Get list of configured providers (both standard and custom)
ipcMain.handle('config:getProviders', async (_event, workspacePath) => {
  try {
    // Load config
    const globalPath = getGlobalConfigPath()
    let config = await readConfigFile(globalPath) || {}

    if (workspacePath) {
      const localPath = getLocalConfigPath(workspacePath)
      const localConfig = await readConfigFile(localPath)
      if (localConfig) {
        config = mergeConfigs(config, localConfig)
      }
    }

    const providers = []

    // Standard providers with API keys configured
    const standardProviders = ['openai', 'anthropic', 'google', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'deepseek']
    for (const provider of standardProviders) {
      const hasKey = !!(config.api_keys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`])
      providers.push({
        name: provider,
        type: 'standard',
        configured: hasKey,
        models: getDefaultModelsForProvider(provider)
      })
    }

    // Custom providers
    if (config.custom_providers) {
      for (const [name, providerConfig] of Object.entries(config.custom_providers)) {
        providers.push({
          name,
          type: providerConfig.type || 'openai-compatible',
          configured: providerConfig.enabled !== false,
          baseUrl: providerConfig.base_url,
          models: providerConfig.models || []
        })
      }
    }

    return {
      success: true,
      providers,
      defaultProvider: config.default_provider || '',
      defaultModel: config.default_model || ''
    }
  } catch (error) {
    console.error('[Config] Error getting providers:', error)
    return { success: false, error: error.message }
  }
})

// Helper: Get default models for standard providers
function getDefaultModelsForProvider(provider) {
  const modelMap = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
    anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-6', 'claude-sonnet-4-20250514'],
    google: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    cohere: ['command-r-plus', 'command-r', 'command'],
    together: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    perplexity: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online'],
    deepseek: ['deepseek-chat', 'deepseek-coder']
  }
  return modelMap[provider] || []
}

// =============================================================================
// LOCAL COMPILATION IPC HANDLERS
// Uses @prompd/cli library for local prompt compilation
// Shares the same logic as the /compile slash command
// =============================================================================

// Walk up the directory tree to find the Prompd project root.
// A project root is a directory containing a prompd.json with both 'name' and 'version' fields.
// Falls back to startDir if no project root is found.
function findPrompdProjectRoot(startDir) {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root

  while (true) {
    const candidate = path.join(dir, 'prompd.json')
    if (fs.existsSync(candidate)) {
      try {
        const content = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        if (content.name && content.version) {
          return dir
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir || dir === root) {
      break
    }
    dir = parent
  }

  return path.resolve(startDir)
}

// Shared compilation function - used by both IPC handlers and slash commands
// This ensures consistent behavior across all compilation paths
async function compilePrompt(content, options = {}) {
  const cli = await getPrompdCli()
  const { PrompdCompiler, NodeFileSystem, MemoryFileSystem } = cli

  const fullFilePath = options.filePath  // Full disk path from frontend
  let workspaceRoot = null

  // Determine workspace root
  if (currentWorkspacePath) {
    workspaceRoot = currentWorkspacePath
    console.log('[Compiler] Using workspace root:', workspaceRoot)
  } else if (fullFilePath && fs.existsSync(path.dirname(fullFilePath))) {
    // Walk up from file directory to find project root (prompd.json with name + version)
    workspaceRoot = findPrompdProjectRoot(path.dirname(fullFilePath))
    console.log('[Compiler] No workspace set, auto-detected project root:', workspaceRoot)
  }

  const filePath = fullFilePath ? fullFilePath.replace(/\\/g, '/') : null

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath || 'no path provided'}`)
  }

  // Read disk content to check if content has been modified (e.g., alias rewriting)
  const diskContent = fs.readFileSync(filePath, 'utf-8')
  const contentModified = content && content !== diskContent

  console.log('[Compiler] Compiling:', filePath)
  console.log('[Compiler] Content modified (aliases rewritten):', contentModified)
  console.log('[Compiler] Workspace root:', workspaceRoot)

  // Map output format
  const formatMap = {
    'markdown': 'markdown',
    'openai': 'openai',
    'anthropic': 'anthropic',
    'json': 'openai'
  }
  const outputFormat = formatMap[options.format] || 'markdown'

  const compiler = new PrompdCompiler()

  // Choose file system based on whether content has been modified
  let fileSystem
  let compilePath

  if (contentModified) {
    // Content has been modified (e.g., package aliases rewritten)
    // Use a hybrid approach: MemoryFileSystem with the modified main file,
    // but we need disk access for inherited files. Create an overlay.
    console.log('[Compiler] Using hybrid filesystem (memory main + disk fallback)')

    // Create a custom overlay filesystem that serves the modified content
    // for the main file but falls back to disk for everything else
    const nodeFS = new NodeFileSystem()
    fileSystem = {
      exists: (p) => {
        const normalizedPath = p.replace(/\\/g, '/')
        if (normalizedPath === filePath) return true
        return nodeFS.exists(p)
      },
      readFile: (p) => {
        const normalizedPath = p.replace(/\\/g, '/')
        if (normalizedPath === filePath) {
          console.log('[Compiler] Serving modified content for:', normalizedPath)
          return content
        }
        return nodeFS.readFile(p)
      },
      isDirectory: (p) => nodeFS.isDirectory(p),
      readdir: (p) => nodeFS.readdir(p),
      resolve: (...args) => nodeFS.resolve(...args),
      dirname: (p) => nodeFS.dirname(p),
      join: (...args) => nodeFS.join(...args)
    }
    compilePath = filePath
  } else {
    // Content unchanged - use standard NodeFileSystem
    console.log('[Compiler] Using NodeFileSystem (disk)')
    fileSystem = new NodeFileSystem()
    compilePath = filePath
  }

  const output = await compiler.compile(compilePath, {
    outputFormat,
    parameters: options.parameters || {},
    fileSystem,
    registryUrl: options.registryUrl || 'http://localhost:4000',
    workspaceRoot: workspaceRoot,  // Pass workspace root for package cache
    verbose: options.verbose !== undefined ? options.verbose : false  // Respect config setting
  })

  return output
}

// Compile a prompt using @prompd/cli library
// This is the local equivalent of the backend compilation endpoint
// Supports both file-based compilation (with options.filePath) and in-memory compilation
ipcMain.handle('compiler:compile', async (_event, content, options = {}) => {
  const startTime = Date.now()

  try {
    let output

    // If filePath is provided and exists, use file-based compilation
    if (options.filePath && fs.existsSync(options.filePath)) {
      output = await compilePrompt(content, options)
    } else {
      // Use in-memory compilation with MemoryFileSystem
      const cli = await getPrompdCli()
      const { PrompdCompiler, MemoryFileSystem } = cli

      const compiler = new PrompdCompiler()
      const memFS = new MemoryFileSystem({ '/main.prmd': content })

      // Map output format
      const formatMap = {
        'markdown': 'markdown',
        'openai': 'openai',
        'anthropic': 'anthropic',
        'json': 'openai'
      }
      const outputFormat = formatMap[options.format] || 'markdown'

      output = await compiler.compile('/main.prmd', {
        outputFormat,
        parameters: options.parameters || {},
        fileSystem: memFS,
        registryUrl: options.registryUrl || 'http://localhost:4000',
        workspaceRoot: options.workspaceRoot || currentWorkspacePath || null,
        verbose: options.verbose !== undefined ? options.verbose : false
      })
    }

    const compilationTime = Date.now() - startTime

    return {
      success: true,
      output: output,
      metadata: {
        compilationTime,
        outputSize: Buffer.byteLength(output || '', 'utf8'),
        format: options.format || 'markdown'
      }
    }

  } catch (error) {
    console.error('[Compiler] Compilation error:', error)
    return {
      success: false,
      error: error.message,
      metadata: {
        compilationTime: Date.now() - startTime
      }
    }
  }
})

// Compile with full context (returns more detailed information)
// Supports both file-based compilation (with options.filePath) and in-memory compilation
ipcMain.handle('compiler:compileWithContext', async (_event, content, options = {}) => {
  const startTime = Date.now()

  try {
    let output

    // If filePath is provided and exists, use file-based compilation
    if (options.filePath && fs.existsSync(options.filePath)) {
      output = await compilePrompt(content, options)
    } else {
      // Use in-memory compilation with MemoryFileSystem
      const cli = await getPrompdCli()
      const { PrompdCompiler, MemoryFileSystem } = cli

      const compiler = new PrompdCompiler()
      const memFS = new MemoryFileSystem({ '/main.prmd': content })

      // Map output format
      const formatMap = {
        'markdown': 'markdown',
        'openai': 'openai',
        'anthropic': 'anthropic',
        'json': 'openai'
      }
      const outputFormat = formatMap[options.format] || 'markdown'

      output = await compiler.compile('/main.prmd', {
        outputFormat,
        parameters: options.parameters || {},
        fileSystem: memFS,
        registryUrl: options.registryUrl || 'http://localhost:4000',
        workspaceRoot: options.workspaceRoot || currentWorkspacePath || null,
        verbose: options.verbose !== undefined ? options.verbose : false
      })
    }

    const compilationTime = Date.now() - startTime

    return {
      success: true,
      output: output,
      errors: [],
      warnings: [],
      metadata: {
        compilationTime,
        outputSize: Buffer.byteLength(output || '', 'utf8'),
        format: options.format || 'markdown'
      }
    }

  } catch (error) {
    console.error('[Compiler] Compilation error:', error)
    return {
      success: false,
      error: error.message,
      errors: [error.message],
      warnings: [],
      metadata: {
        compilationTime: Date.now() - startTime
      }
    }
  }
})

// Validate a prompt without full compilation
ipcMain.handle('compiler:validate', async (_event, content) => {
  try {
    const { PrompdParser } = await import('@prompd/cli')
    const parser = new PrompdParser()

    // Parse and validate - parseContent returns { metadata, content, sections }
    const parsed = parser.parseContent(content)

    // Check for basic validation issues
    const issues = []

    if (!parsed.metadata) {
      issues.push({ type: 'warning', message: 'No metadata section found' })
    }

    if (!parsed.content || parsed.content.trim().length === 0) {
      issues.push({ type: 'error', message: 'Prompt body is empty' })
    }

    // Check for undefined parameters
    const paramPattern = /\{\{([^}]+)\}\}/g
    const bodyParams = [...(parsed.content || '').matchAll(paramPattern)]
    // Parameters can be array or object format - normalize to get names
    const metadataParams = parsed.metadata?.parameters || []
    const paramNames = Array.isArray(metadataParams)
      ? metadataParams.map(p => p.name)
      : Object.keys(metadataParams)

    for (const match of bodyParams) {
      const paramName = match[1].trim().split('|')[0].trim()
      if (!paramNames.includes(paramName) && !['if', 'else', 'endif', 'for', 'endfor', 'include', 'env'].includes(paramName)) {
        issues.push({
          type: 'warning',
          message: `Parameter "${paramName}" used but not defined in metadata`
        })
      }
    }

    return {
      success: true,
      isValid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      parsed: {
        hasMetadata: !!parsed.metadata,
        hasBody: !!(parsed.content && parsed.content.trim()),
        parameters: paramNames,
        inherits: parsed.metadata?.inherits
      }
    }

  } catch (error) {
    return {
      success: false,
      isValid: false,
      issues: [{ type: 'error', message: error.message }],
      error: error.message
    }
  }
})

// Validate with full compilation to get structured diagnostics
// This is used by IntelliSense for real-time error highlighting
ipcMain.handle('compiler:getDiagnostics', async (_event, content, options = {}) => {
  try {
    const cli = await getPrompdCli()
    const { PrompdCompiler, MemoryFileSystem, NodeFileSystem } = cli

    const compiler = new PrompdCompiler()

    // Determine file system to use
    let fileSystem
    let sourcePath = '/main.prmd'

    if (options.filePath && fs.existsSync(options.filePath)) {
      // File exists on disk - use NodeFileSystem for proper relative path resolution
      fileSystem = new NodeFileSystem()
      sourcePath = options.filePath.replace(/\\/g, '/')
    } else {
      // Use MemoryFileSystem for in-editor content
      fileSystem = new MemoryFileSystem({ '/main.prmd': content })
    }

    // Use compileWithContext to get full diagnostic information
    const context = await compiler.compileWithContext(sourcePath, {
      outputFormat: 'markdown',
      parameters: options.parameters || {},
      fileSystem,
      registryUrl: options.registryUrl || 'http://localhost:4000',
      workspaceRoot: options.workspaceRoot || (options.filePath ? findPrompdProjectRoot(path.dirname(options.filePath)) : null),
      verbose: false
    })

    // Extract structured diagnostics
    const diagnostics = context.getDiagnostics ? context.getDiagnostics() : []

    // Also include legacy errors/warnings if no structured diagnostics
    if (diagnostics.length === 0) {
      for (const error of context.errors || []) {
        diagnostics.push({ message: error, severity: 'error' })
      }
      for (const warning of context.warnings || []) {
        diagnostics.push({ message: warning, severity: 'warning' })
      }
    }

    return {
      success: !context.hasErrors(),
      diagnostics,
      hasErrors: context.hasErrors(),
      errorCount: diagnostics.filter(d => d.severity === 'error').length,
      warningCount: diagnostics.filter(d => d.severity === 'warning').length
    }

  } catch (error) {
    console.error('[Compiler] getDiagnostics error:', error)

    // Try to extract line info from error message
    let line, column
    const lineMatch = error.message?.match(/at line (\d+)(?:,? column (\d+))?/i)
    if (lineMatch) {
      line = parseInt(lineMatch[1], 10)
      column = lineMatch[2] ? parseInt(lineMatch[2], 10) : 1
    }

    return {
      success: false,
      diagnostics: [{
        message: error.message,
        severity: 'error',
        source: 'compiler',
        line,
        column
      }],
      hasErrors: true,
      errorCount: 1,
      warningCount: 0
    }
  }
})

// Get compiler version and capabilities
ipcMain.handle('compiler:info', async () => {
  try {
    const cli = await import('@prompd/cli')

    return {
      success: true,
      version: cli.VERSION || '0.3.x',
      capabilities: {
        formats: ['markdown', 'openai', 'anthropic'],
        features: ['inheritance', 'parameters', 'package-resolution', 'asset-extraction'],
        stages: ['lexical', 'dependency', 'semantic', 'assets', 'template', 'codegen']
      }
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

// Create a .pdpkg package locally using @prompd/cli
// Runs in a worker thread to avoid blocking the UI
ipcMain.handle('package:createLocal', async (_event, workspacePath, outputDir) => {
  console.log('[Package] Creating local package from:', workspacePath, 'to:', outputDir || 'dist/')

  return new Promise((resolve) => {
    const workerPath = path.join(__dirname, 'workers', 'packageWorker.js')
    const worker = new Worker(workerPath, {
      workerData: {
        workspacePath,
        outputDir: outputDir || path.join(workspacePath, 'dist')
      }
    })

    worker.on('message', (message) => {
      if (message.success) {
        resolve(message.result)
      } else {
        console.error('[Package] Create failed:', message.error)
        resolve({
          success: false,
          error: message.error || 'Package creation failed'
        })
      }
    })

    worker.on('error', (error) => {
      console.error('[Package] Worker error:', error)
      resolve({
        success: false,
        error: error.message || 'Package worker failed'
      })
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error('[Package] Worker exited with code:', code)
        resolve({
          success: false,
          error: `Worker exited with code ${code}`
        })
      }
    })
  })
})

// Install all dependencies from prompd.json using @prompd/cli RegistryClient
// Reads dependencies from prompd.json and installs each one to {workspace}/.prompd/packages/
ipcMain.handle('package:installAll', async (_event, workspacePath) => {
  console.log('[Package] Installing all dependencies from:', workspacePath)
  console.log('[Package] workspacePath type:', typeof workspacePath)

  // Validate workspacePath to prevent installing to wrong directory
  if (!workspacePath || typeof workspacePath !== 'string') {
    console.error('[Package] ERROR: No valid workspace path provided')
    return {
      success: false,
      error: 'No workspace folder open. Please open a folder first.'
    }
  }

  try {
    // Read prompd.json
    const prompdJsonPath = path.join(workspacePath, 'prompd.json')
    if (!fs.existsSync(prompdJsonPath)) {
      return {
        success: false,
        error: 'No prompd.json found in workspace'
      }
    }

    const content = fs.readFileSync(prompdJsonPath, 'utf8')
    if (!content || content.trim() === '') {
      return {
        success: false,
        error: 'prompd.json file is empty'
      }
    }

    const prompdJson = JSON.parse(content)
    const dependencies = prompdJson.dependencies || {}
    const depEntries = Object.entries(dependencies)

    if (depEntries.length === 0) {
      return {
        success: true,
        message: 'No dependencies to install',
        installed: []
      }
    }

    console.log('[Package] Found', depEntries.length, 'dependencies to install')

    // Use @prompd/cli RegistryClient for proper installation
    const { RegistryClient } = await import('@prompd/cli')
    const client = new RegistryClient()

    const installed = []
    const failed = []

    for (const [packageName, version] of depEntries) {
      console.log('[Package] Installing:', packageName, '@', version)

      try {
        // Use the CLI's install method with workspaceRoot option
        await client.install(`${packageName}@${version}`, {
          workspaceRoot: workspacePath,
          skipCache: false
        })

        console.log('[Package] Installed:', packageName, '@', version)
        installed.push({ name: packageName, version, status: 'installed' })

      } catch (err) {
        console.error('[Package] Failed to install', packageName, ':', err.message)
        failed.push({ name: packageName, version, error: err.message })
      }
    }

    // Check for MCP dependencies in the workspace prompd.json
    let missingMcps = []
    try {
      if (prompdJson.mcps && Array.isArray(prompdJson.mcps) && prompdJson.mcps.length > 0) {
        const mcpConfig = mcpService.loadMcpConfig()
        const configuredNames = new Set(Object.keys(mcpConfig.mcpServers || {}))
        missingMcps = prompdJson.mcps.filter(name => !configuredNames.has(name))
        if (missingMcps.length > 0) {
          console.log('[Package] Workspace requires MCP servers not yet configured:', missingMcps)
        }
      }
    } catch (mcpCheckErr) {
      console.warn('[Package] MCP dependency check failed (non-fatal):', mcpCheckErr.message)
    }

    return {
      success: failed.length === 0,
      message: `Installed ${installed.length} of ${depEntries.length} packages`,
      installed,
      failed: failed.length > 0 ? failed : undefined,
      missingMcps: missingMcps.length > 0 ? missingMcps : undefined
    }

  } catch (error) {
    console.error('[Package] Install all failed:', error)
    return {
      success: false,
      error: error.message || 'Installation failed'
    }
  }
})

// Install a single package by reference (e.g. "@prompd/core@0.0.1" or "@prompd/core")
ipcMain.handle('package:install', async (_event, packageRef, workspacePath, options) => {
  const installOptions = options || {}
  console.log('[Package] Installing single package:', packageRef, 'to:', workspacePath, installOptions.global ? '(global)' : '')

  if (!packageRef || typeof packageRef !== 'string') {
    return { success: false, error: 'No package reference provided' }
  }
  // Global installs don't need a workspace path
  if (!installOptions.global && (!workspacePath || typeof workspacePath !== 'string')) {
    return { success: false, error: 'No workspace folder open. Use global install or open a folder first.' }
  }

  try {
    const { RegistryClient } = await import('@prompd/cli')
    const client = new RegistryClient()
    await client.install(packageRef, {
      workspaceRoot: installOptions.global ? os.homedir() : workspacePath,
      global: installOptions.global || false,
      skipCache: false,
      type: installOptions.type || undefined
    })

    console.log('[Package] Installed:', packageRef)
    analytics.trackPackageInstall(packageRef)

    // Parse package name and version from ref
    // Formats: @scope/name@version, @scope/name, name@version, name
    let pkgName, pkgVersion
    if (packageRef.startsWith('@')) {
      const lastAt = packageRef.lastIndexOf('@')
      if (lastAt > 0) {
        pkgName = packageRef.substring(0, lastAt)
        pkgVersion = packageRef.substring(lastAt + 1)
      } else {
        pkgName = packageRef
      }
    } else {
      const atIdx = packageRef.indexOf('@')
      if (atIdx > 0) {
        pkgName = packageRef.substring(0, atIdx)
        pkgVersion = packageRef.substring(atIdx + 1)
      } else {
        pkgName = packageRef
      }
    }

    // The CLI installs packages to .prompd/{typeDir}/{name}/{version}/ based on
    // the type field in the package's internal prompd.json/manifest.json.
    // We need to find the installed package to read its manifest for MCP deps
    // and to determine the resolved version if not specified in the ref.
    const TYPE_DIRS = { 'package': 'packages', 'workflow': 'workflows', 'node-template': 'templates', 'skill': 'skills' }
    const installRoot = installOptions.global
      ? path.join(os.homedir(), '.prompd')
      : path.join(workspacePath, '.prompd')

    let installedPath = null
    let installedType = installOptions.type || 'package'
    let installedManifest = null

    // Search the CLI's install directories to find the installed package
    // Priority: check the hinted type first, then scan all type directories
    const typesToCheck = installOptions.type
      ? [installOptions.type, ...Object.keys(TYPE_DIRS).filter(t => t !== installOptions.type)]
      : Object.keys(TYPE_DIRS)

    for (const type of typesToCheck) {
      const typeDir = TYPE_DIRS[type]
      if (!typeDir) continue

      // CLI structure: .prompd/{typeDir}/{packageName}/{version}/
      const pkgDir = path.join(installRoot, typeDir, pkgName || packageRef)
      if (!fs.existsSync(pkgDir)) continue

      try {
        const versions = fs.readdirSync(pkgDir).filter(v => {
          try { return fs.statSync(path.join(pkgDir, v)).isDirectory() } catch { return false }
        })
        if (versions.length === 0) continue

        // Use specified version or the latest installed version
        const targetVersion = pkgVersion || versions.sort().pop()
        const versionPath = path.join(pkgDir, targetVersion)
        if (!fs.existsSync(versionPath)) continue

        installedPath = versionPath
        installedType = type
        if (!pkgVersion) pkgVersion = targetVersion

        // Read manifest from installed location
        const manifestPath = path.join(versionPath, 'prompd.json')
        if (!fs.existsSync(manifestPath)) {
          const legacyPath = path.join(versionPath, 'manifest.json')
          if (fs.existsSync(legacyPath)) {
            installedManifest = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
          }
        } else {
          installedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        }

        // Determine type: manifest > frontend hint > directory found in
        if (installedManifest && installedManifest.type) {
          installedType = installedManifest.type
        } else if (installOptions.type) {
          installedType = installOptions.type
        } else {
          installedType = type
        }
        break
      } catch (scanErr) {
        console.warn(`[Package] Failed to scan ${typeDir}/:`, scanErr.message)
      }
    }

    console.log(`[Package] Resolved: type=${installedType}, path=${installedPath || 'not found'}`)

    // prompd.json dependency tracking is handled by the CLI's RegistryClient.install()

    // Check installed package for MCP dependencies
    let missingMcps = []
    if (installedManifest && Array.isArray(installedManifest.mcps) && installedManifest.mcps.length > 0) {
      try {
        const mcpConfig = mcpService.loadMcpConfig()
        const configuredNames = new Set(Object.keys(mcpConfig.mcpServers || {}))
        missingMcps = installedManifest.mcps.filter(name => !configuredNames.has(name))
        if (missingMcps.length > 0) {
          console.log('[Package] Package requires MCP servers not yet configured:', missingMcps)
        }
      } catch (mcpErr) {
        console.warn('[Package] MCP dependency check failed (non-fatal):', mcpErr.message)
      }
    }

    return {
      success: true,
      name: packageRef,
      type: installedType,
      installedPath,
      missingMcps: missingMcps.length > 0 ? missingMcps : undefined
    }
  } catch (error) {
    console.error('[Package] Install failed:', packageRef, error.message)
    return { success: false, error: error.message || 'Installation failed' }
  }
})

// Uninstall a package by name, removing installed files and prompd.json dependency
ipcMain.handle('package:uninstall', async (_event, packageName, workspacePath, options) => {
  const uninstallOptions = options || {}
  console.log('[Package] Uninstalling:', packageName, 'from:', workspacePath, uninstallOptions.global ? '(global)' : '')

  if (!packageName || typeof packageName !== 'string') {
    return { success: false, error: 'No package name provided' }
  }
  if (!workspacePath || typeof workspacePath !== 'string') {
    return { success: false, error: 'No workspace folder open' }
  }

  try {
    const { RegistryClient } = await import('@prompd/cli')
    const client = new RegistryClient()
    await client.uninstall(packageName, {
      workspaceRoot: uninstallOptions.global ? os.homedir() : workspacePath,
      global: uninstallOptions.global || false
    })

    console.log('[Package] Uninstalled:', packageName)
    return { success: true, name: packageName }
  } catch (error) {
    console.error('[Package] Uninstall failed:', packageName, error.message)
    return { success: false, error: error.message || 'Uninstall failed' }
  }
})

// ============================================================================
// Analytics IPC Handlers (GA4 Measurement Protocol)
// ============================================================================

ipcMain.handle('analytics:trackEvent', async (_event, eventName, params) => {
  analytics.trackEvent(eventName, params || {})
})

ipcMain.handle('analytics:setEnabled', async (_event, enabled) => {
  analytics.setEnabled(enabled)
})

ipcMain.handle('analytics:isEnabled', async () => {
  return analytics.isEnabled()
})

// ============================================================================
// Trigger Service IPC Handlers
// ============================================================================

// Deployment Service IPC Handlers
// Package-based workflow deployment with multi-trigger support
// ============================================================================

const { packageWorkflow } = require('./services/packageWorkflow')

// Deploy a package or workflow file
ipcMain.handle('deployment:deploy', async (_event, workflowPath, options = {}) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    // Check if it's a .pdflow file (needs packaging) or a .pdpkg (ready to deploy)
    const isWorkflowFile = workflowPath.endsWith('.pdflow')

    let packagePath = workflowPath
    let workspaceDependencies = null

    if (isWorkflowFile) {
      console.log('[Electron] Packaging workflow for deployment:', workflowPath)

      // Read workspace prompd.json to preserve dependencies
      if (options.workspacePath) {
        const workspacePrompdJson = path.join(options.workspacePath, 'prompd.json')
        if (fs.existsSync(workspacePrompdJson)) {
          const prompdData = JSON.parse(fs.readFileSync(workspacePrompdJson, 'utf-8'))
          if (prompdData.dependencies) {
            workspaceDependencies = prompdData.dependencies
            console.log('[Electron] Preserving', Object.keys(workspaceDependencies).length, 'dependencies from workspace')
          }
        }
      }

      // Use shared packaging utility
      const result = await packageWorkflow(workflowPath, options, getPrompdCli)

      if (!result.success) {
        throw new Error(result.error || 'Failed to create package')
      }

      packagePath = result.packagePath
    }

    if (!packagePath) {
      throw new Error('Package path is undefined after creation')
    }

    // Pass dependencies to deployment service
    const deployOptions = {
      ...options,
      ...(workspaceDependencies && { dependencies: workspaceDependencies })
    }

    const deploymentId = await deploymentService.deploy(packagePath, deployOptions)
    analytics.trackDeploymentCreate()
    return { success: true, deploymentId }
  } catch (err) {
    console.error('[Electron] Deployment failed:', err)
    return { success: false, error: err.message }
  }
})

// Delete a deployment (soft-delete: stops triggers, marks as deleted)
ipcMain.handle('deployment:undeploy', async (_event, deploymentId, options = {}) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    await deploymentService.delete(deploymentId, options)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// List all deployments
ipcMain.handle('deployment:list', async (_event, filters = {}) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const deployments = await deploymentService.listDeployments(filters)
    return { success: true, deployments }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Get deployment status
ipcMain.handle('deployment:getStatus', async (_event, deploymentId) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const status = await deploymentService.getDeploymentStatus(deploymentId)
    return { success: true, ...status }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Toggle individual trigger
ipcMain.handle('deployment:toggleTrigger', async (_event, triggerId, enabled) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    await deploymentService.toggleTrigger(triggerId, enabled)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Execute deployment manually
ipcMain.handle('deployment:execute', async (event, deploymentId, parameters = {}) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const result = await deploymentService.execute(deploymentId, parameters)

    // Emit execution complete event to all windows
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger:execution-complete', {
        deploymentId,
        executionId: result.id,
        status: result.status || 'success',
        timestamp: Date.now()
      })
    }

    return { success: true, executionId: result.id }
  } catch (err) {
    // Emit error event
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger:execution-complete', {
        deploymentId,
        executionId: null,
        status: 'error',
        error: err.message,
        timestamp: Date.now()
      })
    }

    return { success: false, error: err.message }
  }
})

// Get execution history for deployment
ipcMain.handle('deployment:getHistory', async (_event, deploymentId, options = {}) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const history = await deploymentService.getHistory(deploymentId, options)
    return { success: true, history }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Get all execution history (across all deployments) with pagination
ipcMain.handle('deployment:getAllExecutions', async (_event, options = {}) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const result = deploymentService.getAllExecutions(options)
    return { success: true, ...result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('deployment:getParameters', async (_event, deploymentId) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const parameters = deploymentService.getParameters(deploymentId)
    return { success: true, ...parameters }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Clear all execution history
ipcMain.handle('deployment:clearAllHistory', async (_event) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const deletedCount = deploymentService.clearAllHistory()
    return { success: true, deletedCount }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Toggle deployment status (enable/disable)
ipcMain.handle('deployment:toggleStatus', async (_event, deploymentId) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const result = await deploymentService.toggleStatus(deploymentId)
    analytics.trackDeploymentToggle(result?.status === 'enabled' ? 'enable' : 'disable')
    return { success: true, deployment: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Get deployment version history
ipcMain.handle('deployment:getVersionHistory', async (_event, deploymentId) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const versions = deploymentService.getVersionHistory(deploymentId)
    return { success: true, versions }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Purge all deleted deployments
ipcMain.handle('deployment:purgeDeleted', async (_event) => {
  if (!deploymentService) {
    return { success: false, error: 'Deployment service not initialized' }
  }

  try {
    const result = await deploymentService.purgeDeleted()
    return { success: true, purgedCount: result.purgedCount }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ============================================================================
// Service Management IPC Handlers
// User-level service install/uninstall for 24/7 background execution
// ============================================================================

const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

ipcMain.handle('service:getStatus', async () => {
  const platform = process.platform

  try {
    if (platform === 'win32') {
      // Windows: System service not supported - use tray deployment instead
      return {
        installed: false,
        running: false,
        mode: 'electron',
        autoStart: false
      }
    } else if (platform === 'darwin') {
      // Check macOS LaunchAgent
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.prompd.service.plist')
      const installed = fs.existsSync(plistPath)
      if (installed) {
        try {
          const { stdout } = await execAsync('launchctl list | grep com.prompd.service')
          const running = stdout.includes('com.prompd.service')
          return { installed, running, mode: 'system-service', autoStart: true }
        } catch (err) {
          return { installed, running: false, mode: 'system-service', autoStart: true }
        }
      }
      return { installed: false, running: false, mode: 'electron', autoStart: false }
    } else if (platform === 'linux') {
      // Check systemd user service
      try {
        const { stdout } = await execAsync('systemctl --user is-enabled prompd-service')
        const installed = stdout.trim() === 'enabled'
        const { stdout: status } = await execAsync('systemctl --user is-active prompd-service')
        const running = status.trim() === 'active'
        return { installed, running, mode: 'system-service', autoStart: true }
      } catch (err) {
        return { installed: false, running: false, mode: 'electron', autoStart: false }
      }
    }
  } catch (error) {
    console.error('[Service] Failed to check service status:', error)
    return { installed: false, running: false, mode: 'electron', autoStart: false }
  }
})

ipcMain.handle('service:install', async () => {
  const platform = process.platform
  const serviceDir = path.join(app.getPath('userData'), '..', 'prompd-service')
  const serviceSrcDir = path.join(__dirname, '..', '..', 'prompd-service')

  try {
    // Copy service files to user data directory
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true })
      // Copy prompd-service/* to serviceDir
      await fs.copy(serviceSrcDir, serviceDir)

      // Copy @prompd/scheduler to avoid symlink issues on Windows
      const schedulerSrc = path.join(__dirname, '..', '..', 'packages', 'scheduler')
      const schedulerDest = path.join(serviceDir, 'node_modules', '@prompd', 'scheduler')
      if (fs.existsSync(schedulerSrc)) {
        fs.mkdirSync(path.dirname(schedulerDest), { recursive: true })
        await fs.copy(schedulerSrc, schedulerDest)
      }

      // Install npm dependencies (without symlinks)
      console.log('[Service] Installing service dependencies...')
      await execAsync('npm install --production --no-optional --prefer-copy', { cwd: serviceDir })
    }

    if (platform === 'win32') {
      // Windows: System service not supported - use tray deployment instead
      return {
        success: false,
        error: 'System service installation is not supported on Windows. Use the tray deployment service instead.'
      }
    } else if (platform === 'darwin') {
      // macOS: Create LaunchAgent
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.prompd.service</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>${serviceDir}/src/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${serviceDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${os.homedir()}/Library/Logs/prompd-service.log</string>
  <key>StandardErrorPath</key>
  <string>${os.homedir()}/Library/Logs/prompd-service-error.log</string>
</dict>
</plist>`

      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.prompd.service.plist')
      fs.writeFileSync(plistPath, plistContent)
      await execAsync(`launchctl load "${plistPath}"`)

      return { success: true, message: 'Service installed and started' }
    } else if (platform === 'linux') {
      // Linux: Create systemd user service
      const serviceContent = `[Unit]
Description=Prompd Workflow Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${serviceDir}
ExecStart=/usr/bin/node ${serviceDir}/src/server.js
Restart=always
Environment="PROMPD_DB_PATH=${os.homedir()}/.prompd/scheduler/schedules.db"

[Install]
WantedBy=default.target`

      const systemdDir = path.join(os.homedir(), '.config/systemd/user')
      if (!fs.existsSync(systemdDir)) {
        fs.mkdirSync(systemdDir, { recursive: true })
      }

      const serviceFile = path.join(systemdDir, 'prompd-service.service')
      fs.writeFileSync(serviceFile, serviceContent)

      await execAsync('systemctl --user daemon-reload')
      await execAsync('systemctl --user enable prompd-service')
      await execAsync('systemctl --user start prompd-service')

      return { success: true, message: 'Service installed and started' }
    }

    return { success: false, error: 'Unsupported platform' }
  } catch (error) {
    console.error('[Service] Install failed:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('service:uninstall', async () => {
  const platform = process.platform

  try {
    if (platform === 'win32') {
      // Windows: System service not supported
      return {
        success: false,
        error: 'System service not supported on Windows'
      }
    } else if (platform === 'darwin') {
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.prompd.service.plist')
      await execAsync(`launchctl unload "${plistPath}"`)
      fs.unlinkSync(plistPath)
      return { success: true, message: 'Service uninstalled' }
    } else if (platform === 'linux') {
      await execAsync('systemctl --user stop prompd-service')
      await execAsync('systemctl --user disable prompd-service')
      return { success: true, message: 'Service uninstalled' }
    }

    return { success: false, error: 'Unsupported platform' }
  } catch (error) {
    console.error('[Service] Uninstall failed:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('service:start', async () => {
  const platform = process.platform

  try {
    if (platform === 'win32') {
      // Windows: System service not supported
      return {
        success: false,
        error: 'System service not supported on Windows'
      }
    } else if (platform === 'darwin') {
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.prompd.service.plist')
      await execAsync(`launchctl load "${plistPath}"`)
      return { success: true, message: 'Service started' }
    } else if (platform === 'linux') {
      await execAsync('systemctl --user start prompd-service')
      return { success: true, message: 'Service started' }
    }

    return { success: false, error: 'Unsupported platform' }
  } catch (error) {
    console.error('[Service] Start failed:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('service:stop', async () => {
  const platform = process.platform

  try {
    if (platform === 'win32') {
      // Windows: System service not supported
      return {
        success: false,
        error: 'System service not supported on Windows'
      }
    } else if (platform === 'darwin') {
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.prompd.service.plist')
      await execAsync(`launchctl unload "${plistPath}"`)
      return { success: true, message: 'Service stopped' }
    } else if (platform === 'linux') {
      await execAsync('systemctl --user stop prompd-service')
      return { success: true, message: 'Service stopped' }
    }

    return { success: false, error: 'Unsupported platform' }
  } catch (error) {
    console.error('[Service] Stop failed:', error)
    return { success: false, error: error.message }
  }
})

// ============================================================================
// Workflow Execution IPC Handlers
// Event-based execution with live updates (single event loop)
// ============================================================================

// Track running executions and pending user input requests
const runningExecutions = new Map()
const pendingUserInputs = new Map() // requestId -> { resolve, reject }

// Popup window for user input during automated workflow execution
let popupWindow = null
let currentPopupRequest = null

// Track which executionId owns the popup so we can close it on completion
let popupExecutionId = null

function createInputPopupWindow(request, requestId, metadata) {
  currentPopupRequest = { request, requestId, metadata }
  popupExecutionId = metadata?.executionId || null

  // If popup already exists and is alive, push the new request into it
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('popup:newRequest', {
      request: currentPopupRequest.request,
      metadata: currentPopupRequest.metadata
    })
    popupWindow.focus()
    return
  }

  // Resolve icon path (reuse same logic as main window)
  const isPackaged = app.isPackaged
  let popupIcon
  if (isPackaged) {
    popupIcon = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'logo.ico')
      : path.join(process.resourcesPath, 'logo.png')
  } else {
    const basePath = path.join(__dirname, '..')
    popupIcon = process.platform === 'win32'
      ? path.join(basePath, 'public/logo.ico')
      : path.join(basePath, 'public/logo.png')
  }

  popupWindow = new BrowserWindow({
    width: 520,
    height: 600,
    minWidth: 400,
    minHeight: 400,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    icon: popupIcon,
    title: 'User Input Required - Prompd',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'popup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    parent: mainWindow,
    modal: false,
    alwaysOnTop: true,
    show: false
  })

  popupWindow.loadFile(path.join(__dirname, 'popup-input.html'))

  popupWindow.once('ready-to-show', () => {
    popupWindow.show()
    popupWindow.focus()
  })

  popupWindow.on('closed', () => {
    // If user closed window without responding, cancel the pending request
    if (currentPopupRequest) {
      const pending = pendingUserInputs.get(currentPopupRequest.requestId)
      if (pending) {
        pendingUserInputs.delete(currentPopupRequest.requestId)
        if (currentPopupRequest.isCheckpoint) {
          pending.resolve(false)
        } else {
          pending.resolve({ value: undefined, cancelled: true })
        }
      }
      currentPopupRequest = null
    }
    popupWindow = null
    popupExecutionId = null
  })
}

/**
 * Close the popup window gracefully (called when workflow execution ends).
 * Sends a 'done' message so the popup can show a completion state before closing.
 */
function closePopupWindow(status, message) {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('popup:done', { status, message })
    // Auto-close after a short delay so the user sees the completion message
    setTimeout(() => {
      if (popupWindow && !popupWindow.isDestroyed()) {
        currentPopupRequest = null
        popupWindow.close()
      }
    }, 2500)
  }
  popupExecutionId = null
}

// Import CLI modules once at startup (prevents blocking on first execution)
let cliModules = null
let configManager = null
let prompdExecutor = null

// Initialize CLI modules asynchronously
;(async () => {
  try {
    cliModules = await import('@prompd/cli')
    const { ConfigManager, PrompdExecutor } = cliModules
    configManager = new ConfigManager()

    // COMPATIBILITY SHIM: workflowExecutor expects load() but ConfigManager has loadConfig()
    // This is a bug in @prompd/cli that should be fixed upstream
    if (!configManager.load && configManager.loadConfig) {
      configManager.load = configManager.loadConfig.bind(configManager)
    }

    prompdExecutor = new PrompdExecutor()
    console.log('[Main Process] @prompd/cli modules initialized and ready')
  } catch (err) {
    console.error('[Main Process] Failed to initialize CLI modules:', err)
  }
})()

/**
 * Execute a workflow using @prompd/cli (non-blocking with live events)
 * workflow: ParsedWorkflow object
 * params: Execution parameters
 * options: Serializable options only (executionMode, breakpoints array)
 * Returns: { executionId: string } immediately, emits events during execution
 */
ipcMain.handle('workflow:execute', async (event, workflow, params, options) => {
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`
  const sender = event.sender

  console.log(`[Workflow Executor] Starting execution: ${executionId}`)

  // Start execution in background (non-blocking)
  setImmediate(async () => {
    try {
      // Check if CLI modules are ready
      if (!cliModules || !configManager || !prompdExecutor) {
        throw new Error('CLI modules not initialized yet. Please try again.')
      }

      const { executeWorkflow } = cliModules

      // Apply workflow parameter defaults for any missing values
      // workflow may be a ParsedWorkflow ({ file: WorkflowFile, ... }) or a raw WorkflowFile
      const workflowParams = workflow.file?.parameters || workflow.parameters
      if (workflowParams && Array.isArray(workflowParams)) {
        for (const param of workflowParams) {
          if (param.name && !(param.name in params) && param.default !== undefined) {
            params[param.name] = param.default
          }
        }
        console.log('[Workflow Executor] Applied parameter defaults, params:', JSON.stringify(params))
      }

      // Build options with event-emitting callbacks
      // Convert breakpoints array back to Set (IPC serializes Sets as arrays)
      const breakpointsSet = options.breakpoints ? new Set(options.breakpoints) : undefined
      const executorOptions = {
        ...options,
        breakpoints: breakpointsSet,
        onNodeStart: (nodeId) => {
          // Check cancellation before starting each node
          const execution = runningExecutions.get(executionId)
          if (execution && execution.cancelled) {
            throw new Error('Execution cancelled by user')
          }
          sender.send('workflow:event', {
            type: 'node-start',
            executionId,
            nodeId,
            timestamp: Date.now()
          })
        },
        onNodeComplete: (nodeId, output) => {
          sender.send('workflow:event', {
            type: 'node-complete',
            executionId,
            nodeId,
            data: { output },
            timestamp: Date.now()
          })
        },
        onNodeError: (nodeId, error) => {
          sender.send('workflow:event', {
            type: 'node-error',
            executionId,
            nodeId,
            data: { error },
            timestamp: Date.now()
          })
        },
        onProgress: (state) => {
          // Check cancellation during progress updates
          const execution = runningExecutions.get(executionId)
          if (execution && execution.cancelled) {
            throw new Error('Execution cancelled by user')
          }
          sender.send('workflow:event', {
            type: 'progress',
            executionId,
            data: state,
            timestamp: Date.now()
          })
        },
        onTraceEntry: (entry) => {
          sender.send('workflow:event', {
            type: 'trace-entry',
            executionId,
            data: entry,
            timestamp: Date.now()
          })
        },
        // Bidirectional: Request user input from renderer (or popup in automated mode)
        onUserInput: async (request) => {
          const requestId = `input-${Date.now()}-${Math.random().toString(36).substring(7)}`
          const isAutomated = options?.executionMode === 'automated'

          if (isAutomated) {
            // Automated mode: show OS notification + popup window
            console.log(`[Workflow Executor] Automated mode - opening popup for user input (${requestId})`)

            trayManager.showNotification({
              title: 'Workflow Needs Input',
              body: `${workflow?.metadata?.name || 'Workflow'}: ${request.prompt || request.nodeLabel || 'Input required'}`,
              type: 'info',
              executionId
            })

            createInputPopupWindow(request, requestId, {
              workflowName: workflow?.metadata?.name || 'Workflow',
              executionId
            })

            return new Promise((resolve, reject) => {
              pendingUserInputs.set(requestId, { resolve, reject })

              // 10 minute timeout for automated mode
              setTimeout(() => {
                if (pendingUserInputs.has(requestId)) {
                  pendingUserInputs.delete(requestId)
                  closePopupWindow('error', 'Input timed out after 10 minutes')
                  reject(new Error('User input timed out after 10 minutes'))
                }
              }, 600000)
            })
          }

          // Interactive mode: send to renderer
          sender.send('workflow:event', {
            type: 'user-input-request',
            executionId,
            requestId,
            data: request,
            timestamp: Date.now()
          })

          return new Promise((resolve, reject) => {
            pendingUserInputs.set(requestId, { resolve, reject })

            // Timeout after 5 minutes
            setTimeout(() => {
              if (pendingUserInputs.has(requestId)) {
                pendingUserInputs.delete(requestId)
                reject(new Error('User input request timed out'))
              }
            }, 300000)
          })
        },
        // Bidirectional: Request checkpoint confirmation from renderer (or popup in automated mode)
        onCheckpoint: async (event) => {
          const requestId = `checkpoint-${Date.now()}-${Math.random().toString(36).substring(7)}`
          const isAutomated = options?.executionMode === 'automated'
          const needsAck = event.waitForAck === true

          if (isAutomated && needsAck) {
            // Automated mode with approval required: show popup
            console.log(`[Workflow Executor] Automated mode - opening popup for checkpoint (${requestId})`)

            trayManager.showNotification({
              title: 'Workflow Checkpoint',
              body: `${workflow?.metadata?.name || 'Workflow'}: ${event.checkpointName || 'Approval required'}`,
              type: 'info',
              executionId
            })

            const checkpointRequest = {
              nodeLabel: event.checkpointName || 'Checkpoint',
              prompt: event.description || 'Continue workflow execution?',
              inputType: 'confirm',
              required: true,
              showContext: !!event.data,
              context: { previousOutput: event.data, variables: {} }
            }

            createInputPopupWindow(checkpointRequest, requestId, {
              workflowName: workflow?.metadata?.name || 'Workflow',
              executionId,
              isCheckpoint: true
            })

            // Store isCheckpoint flag so popup handler resolves correctly
            currentPopupRequest.isCheckpoint = true

            return new Promise((resolve, reject) => {
              pendingUserInputs.set(requestId, { resolve, reject })

              setTimeout(() => {
                if (pendingUserInputs.has(requestId)) {
                  pendingUserInputs.delete(requestId)
                  closePopupWindow('error', 'Checkpoint timed out after 10 minutes')
                  reject(new Error('Checkpoint timed out after 10 minutes'))
                }
              }, 600000)
            })
          }

          // Interactive mode or auto-continue: send to renderer
          sender.send('workflow:event', {
            type: 'checkpoint-request',
            executionId,
            requestId,
            data: event,
            timestamp: Date.now()
          })

          return new Promise((resolve, reject) => {
            pendingUserInputs.set(requestId, { resolve, reject })

            // Timeout after 5 minutes
            setTimeout(() => {
              if (pendingUserInputs.has(requestId)) {
                pendingUserInputs.delete(requestId)
                reject(new Error('Checkpoint request timed out'))
              }
            }, 300000)
          })
        },
        // Bidirectional: Pause execution in debug/step mode and wait for user to continue or stop
        onDebugPause: async (debugState, trace) => {
          const requestId = `debug-pause-${Date.now()}-${Math.random().toString(36).substring(7)}`

          console.log(`[Workflow Executor] Debug/step pause at node '${debugState.currentNodeId}' (${requestId})`)

          // Send pause event to renderer
          sender.send('workflow:event', {
            type: 'debug-pause-request',
            executionId,
            requestId,
            data: {
              isPaused: debugState.isPaused,
              currentNodeId: debugState.currentNodeId,
              breakpoints: debugState.breakpoints ? Array.from(debugState.breakpoints) : [],
              watchedVariables: debugState.watchedVariables || [],
            },
            timestamp: Date.now()
          })

          // Wait for renderer to respond (continue or stop)
          return new Promise((resolve, reject) => {
            pendingUserInputs.set(requestId, { resolve, reject })

            // Timeout after 10 minutes
            setTimeout(() => {
              if (pendingUserInputs.has(requestId)) {
                pendingUserInputs.delete(requestId)
                resolve(false) // Stop execution on timeout
              }
            }, 600000)
          })
        },
        // Centralized .prmd execution — single path for all workflow prompt execution
        executePrompt: async (source, promptParams, provider, model, temperature, maxTokens) => {
          // Merge workflow-level params (includes defaults) into node-level prompt params
          // Node params take priority over workflow params
          const mergedParams = { ...params, ...promptParams }
          let tempFilePath = null
          try {
            console.log(`[Workflow Executor] Executing prompt via CLI: ${source.substring(0, 80)}`)

            // Determine file path to execute
            let fileToExecute = source

            if (source.startsWith('./') || source.startsWith('../') || source.startsWith('@')) {
              // File path - resolve relative to workflow file directory (not workspace root)
              // Source paths in workflow nodes are relative to the workflow file's location
              const workflowDir = options?.workflowFilePath
                ? path.dirname(options.workflowFilePath)
                : currentWorkspacePath
              fileToExecute = workflowDir
                ? path.resolve(workflowDir, source)
                : path.resolve(source)
            } else if (source.startsWith('raw:')) {
              // Raw inline prompt - write to temp file
              const rawText = source.substring(4)
              const uniqueId = `raw-prompt-${Date.now()}`
              const promptContent = [
                '---',
                `id: ${uniqueId}`,
                'name: "Raw Prompt"',
                'version: 0.0.1',
                'description: "Inline raw prompt from workflow"',
                '---',
                '',
                rawText
              ].join('\n')

              // Write to temp file
              tempFilePath = path.join(app.getPath('temp'), `${uniqueId}.prmd`)
              await fs.writeFile(tempFilePath, promptContent, 'utf-8')
              fileToExecute = tempFilePath
            } else {
              // Assume it's .prmd content - write to temp file
              const uniqueId = `inline-prompt-${Date.now()}`
              tempFilePath = path.join(app.getPath('temp'), `${uniqueId}.prmd`)
              await fs.writeFile(tempFilePath, source, 'utf-8')
              fileToExecute = tempFilePath
            }

            // Get API key
            const config = await configManager.load()
            const apiKey = config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`]

            if (!apiKey) {
              throw new Error(`No API key found for provider: ${provider}`)
            }

            // Execute through CLI (centralized compilation + execution)
            const resolvedWorkspaceRoot = options?.workflowFilePath
              ? path.dirname(options.workflowFilePath)
              : currentWorkspacePath
            const executeResult = await prompdExecutor.execute(fileToExecute, {
              provider: provider || 'openai',
              model: model || 'gpt-4o',
              apiKey,
              params: mergedParams,
              workspaceRoot: resolvedWorkspaceRoot || currentWorkspacePath,
              ...(temperature !== undefined && { temperature }),
              ...(maxTokens !== undefined && { maxTokens })
            })

            // Clean up temp file
            if (tempFilePath) {
              await fs.unlink(tempFilePath).catch(() => {})
            }

            return executeResult.response || executeResult.content || ''
          } catch (err) {
            // Clean up temp file on error
            if (tempFilePath) {
              await fs.unlink(tempFilePath).catch(() => {})
            }
            console.error('[Workflow Executor] executePrompt failed:', err)
            throw err
          }
        },
        // Agent LLM execution (for chat-agent nodes)
        // Makes direct API calls to LLM providers with proper message formatting
        // and native tool/function-calling support
        onPromptExecute: async (request) => {
          try {
            const provider = request.provider || 'openai'
            const model = request.model || 'gpt-4o'
            const temperature = request.temperature ?? 0.7

            console.log(`[Workflow Executor] Agent LLM call: provider=${provider} model=${model} tools=${request.tools?.length || 0} messages=${request.messages?.length || 0}`)

            // Get API key
            const config = await configManager.load()
            const apiKey = config.apiKeys?.[provider]
              || config.api_keys?.[provider]
              || process.env[`${provider.toUpperCase()}_API_KEY`]

            if (!apiKey) {
              throw new Error(`No API key found for provider: ${provider}`)
            }

            // Provider endpoint configuration
            const PROVIDER_ENDPOINTS = {
              openai:     { url: 'https://api.openai.com/v1/chat/completions', format: 'openai' },
              groq:       { url: 'https://api.groq.com/openai/v1/chat/completions', format: 'openai' },
              mistral:    { url: 'https://api.mistral.ai/v1/chat/completions', format: 'openai' },
              together:   { url: 'https://api.together.xyz/v1/chat/completions', format: 'openai' },
              perplexity: { url: 'https://api.perplexity.ai/chat/completions', format: 'openai' },
              deepseek:   { url: 'https://api.deepseek.com/v1/chat/completions', format: 'openai' },
              google:     { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', format: 'openai' },
              anthropic:  { url: 'https://api.anthropic.com/v1/messages', format: 'anthropic' },
              ollama:     { url: 'http://localhost:11434/api/chat', format: 'ollama' },
            }

            // Check for custom provider
            let endpoint = PROVIDER_ENDPOINTS[provider]
            if (!endpoint && config.custom_providers?.[provider]) {
              const custom = config.custom_providers[provider]
              endpoint = {
                url: custom.base_url?.replace(/\/$/, '') + '/chat/completions',
                format: custom.type === 'anthropic' ? 'anthropic' : 'openai',
              }
            }
            if (!endpoint) {
              // Fallback: assume OpenAI-compatible
              endpoint = { url: `https://api.${provider}.com/v1/chat/completions`, format: 'openai' }
            }

            // Format native tool definitions for providers that support them
            const formatToolsOpenAI = (tools) => {
              if (!tools || tools.length === 0) return undefined
              return tools.map(t => ({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description || '',
                  parameters: t.parameters || { type: 'object', properties: {} },
                },
              }))
            }

            const formatToolsAnthropic = (tools) => {
              if (!tools || tools.length === 0) return undefined
              return tools.map(t => ({
                name: t.name,
                description: t.description || '',
                input_schema: t.parameters || { type: 'object', properties: {} },
              }))
            }

            // Build request body based on provider format
            let requestBody
            let headers

            if (endpoint.format === 'anthropic') {
              // Anthropic Messages API
              headers = {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
              }
              requestBody = {
                model,
                max_tokens: 4096,
                temperature,
                system: request.prompt || undefined,
                messages: (request.messages || []).map(msg => ({
                  role: msg.role === 'user' ? 'user' : 'assistant',
                  content: msg.content,
                })),
              }
              const anthropicTools = formatToolsAnthropic(request.tools)
              if (anthropicTools) {
                requestBody.tools = anthropicTools
              }
            } else if (endpoint.format === 'ollama') {
              // Ollama API
              headers = { 'Content-Type': 'application/json' }
              const messages = []
              if (request.prompt) {
                messages.push({ role: 'system', content: request.prompt })
              }
              messages.push(...(request.messages || []))
              requestBody = {
                model,
                messages,
                stream: false,
                options: { temperature },
              }
            } else {
              // OpenAI-compatible (OpenAI, Groq, Mistral, Together, etc.)
              headers = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              }
              const messages = []
              if (request.prompt) {
                messages.push({ role: 'system', content: request.prompt })
              }
              messages.push(...(request.messages || []))
              requestBody = {
                model,
                messages,
                max_tokens: 4096,
                temperature,
              }
              const openaiTools = formatToolsOpenAI(request.tools)
              if (openaiTools) {
                requestBody.tools = openaiTools
              }
            }

            // Make the API call
            const https = require('https')
            const http = require('http')
            const urlModule = require('url')
            const parsedUrl = urlModule.parse(endpoint.url)
            const isHttps = parsedUrl.protocol === 'https:'
            const httpModule = isHttps ? https : http

            const apiResponse = await new Promise((resolve, reject) => {
              const bodyStr = JSON.stringify(requestBody)
              const reqOptions = {
                method: 'POST',
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.path,
                headers: {
                  ...headers,
                  'Content-Length': Buffer.byteLength(bodyStr),
                },
              }

              const req = httpModule.request(reqOptions, (res) => {
                let data = ''
                res.on('data', (chunk) => { data += chunk })
                res.on('end', () => {
                  if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                      resolve(JSON.parse(data))
                    } catch (e) {
                      reject(new Error(`Invalid JSON response from ${provider}: ${data.slice(0, 200)}`))
                    }
                  } else {
                    let errorMsg = `${provider} API returned HTTP ${res.statusCode}`
                    try {
                      const errData = JSON.parse(data)
                      errorMsg += `: ${errData.error?.message || errData.error || JSON.stringify(errData).slice(0, 200)}`
                    } catch {
                      errorMsg += `: ${data.slice(0, 200)}`
                    }
                    reject(new Error(errorMsg))
                  }
                })
              })

              req.on('error', (err) => reject(new Error(`${provider} API request failed: ${err.message}`)))
              req.setTimeout(120000, () => {
                req.destroy()
                reject(new Error(`${provider} API request timed out after 120s`))
              })
              req.write(bodyStr)
              req.end()
            })

            // Parse response based on provider format
            let responseContent
            if (endpoint.format === 'anthropic') {
              const contentBlocks = apiResponse.content || []
              // Check for tool_use blocks (Anthropic native tool calling)
              const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use')
              if (toolUseBlocks.length > 0) {
                // Return structured response with tool_calls in OpenAI-compatible format
                // so the CLI's parseToolCall can handle it
                responseContent = {
                  content: contentBlocks.filter(b => b.type === 'text').map(b => b.text).join(''),
                  tool_calls: toolUseBlocks.map(b => ({
                    function: {
                      name: b.name,
                      arguments: JSON.stringify(b.input || {}),
                    },
                  })),
                }
              } else {
                responseContent = contentBlocks.map(b => b.text || '').join('')
              }
            } else if (endpoint.format === 'ollama') {
              responseContent = apiResponse.message?.content || ''
            } else {
              // OpenAI-compatible
              const choice = apiResponse.choices?.[0]
              if (!choice) {
                throw new Error(`No response choices returned from ${provider}`)
              }
              const message = choice.message
              // If the model made tool calls, return the full message object
              // so the CLI's parseToolCall can extract tool_calls
              if (message.tool_calls && message.tool_calls.length > 0) {
                responseContent = {
                  content: message.content || '',
                  tool_calls: message.tool_calls.map(tc => ({
                    function: {
                      name: tc.function?.name,
                      arguments: tc.function?.arguments || '{}',
                    },
                  })),
                }
              } else {
                responseContent = message.content || ''
              }
            }

            console.log(`[Workflow Executor] Agent LLM response received (type=${typeof responseContent})`)

            return {
              success: true,
              response: responseContent,
            }
          } catch (err) {
            console.error('[Workflow Executor] onPromptExecute failed:', err)
            return {
              success: false,
              error: err.message || 'Unknown error'
            }
          }
        },
        // Tool execution for workflow Tool nodes
        onToolCall: async (request) => {
          try {
            // Check cancellation before tool execution
            const execution = runningExecutions.get(executionId)
            if (execution && execution.cancelled) {
              return { success: false, error: 'Execution cancelled by user' }
            }

            console.log(`[Workflow Executor] Tool call request: ${request.toolType}`)

            // Handle HTTP requests
            if (request.toolType === 'http') {
              let { method, url, headers, body } = request.httpConfig || {}
              const httpConnectionId = request.httpConfig?.connectionId

              // Resolve http-api connection for baseUrl and auth headers
              if (httpConnectionId) {
                try {
                  const { loadConnections } = require('./services/connectionStorage')
                  const connResult = await loadConnections(currentWorkspacePath)
                  const savedConnections = (connResult.success && connResult.connections) ? connResult.connections : []
                  const httpConnection = savedConnections.find(c => c.id === httpConnectionId)

                  if (httpConnection && httpConnection.type === 'http-api' && httpConnection.config) {
                    const connConfig = httpConnection.config

                    // Prepend baseUrl if the node URL is relative (no protocol)
                    if (connConfig.baseUrl && url && !url.startsWith('http://') && !url.startsWith('https://')) {
                      const base = connConfig.baseUrl.replace(/\/+$/, '')
                      const path = url.startsWith('/') ? url : '/' + url
                      url = base + path
                      console.log(`[Workflow Executor] Resolved HTTP URL from connection: ${url}`)
                    }

                    // Merge auth headers from connection
                    if (connConfig.headers && typeof connConfig.headers === 'object') {
                      headers = { ...connConfig.headers, ...headers }
                    }

                    // Apply auth configuration
                    if (connConfig.authType === 'bearer' && connConfig.authToken) {
                      headers = { ...headers, 'Authorization': `Bearer ${connConfig.authToken}` }
                    } else if (connConfig.authType === 'api-key' && connConfig.apiKeyHeader && connConfig.apiKeyValue) {
                      headers = { ...headers, [connConfig.apiKeyHeader]: connConfig.apiKeyValue }
                    } else if (connConfig.authType === 'basic' && connConfig.username && connConfig.password) {
                      const credentials = Buffer.from(`${connConfig.username}:${connConfig.password}`).toString('base64')
                      headers = { ...headers, 'Authorization': `Basic ${credentials}` }
                    }
                  }
                } catch (connError) {
                  console.warn('[Workflow Executor] Failed to resolve HTTP connection:', connError.message)
                }
              }

              if (!url) {
                return {
                  success: false,
                  error: 'Missing HTTP URL'
                }
              }

              try {
                const https = require('https')
                const http = require('http')
                const urlModule = require('url')

                const parsedUrl = urlModule.parse(url)
                const isHttps = parsedUrl.protocol === 'https:'
                const httpModule = isHttps ? https : http

                return await new Promise((resolve) => {
                  const options = {
                    method: method || 'GET',
                    headers: {
                      'User-Agent': 'Prompd/1.0',
                      ...headers
                    }
                  }

                  const req = httpModule.request(url, options, (res) => {
                    let responseData = ''

                    res.on('data', (chunk) => {
                      responseData += chunk
                    })

                    res.on('end', () => {
                      const success = res.statusCode >= 200 && res.statusCode < 300

                      // Try to parse JSON response
                      let parsedData = responseData
                      try {
                        parsedData = JSON.parse(responseData)
                      } catch (e) {
                        // Not JSON, use raw string
                      }

                      resolve({
                        success,
                        result: parsedData,
                        statusCode: res.statusCode,
                        headers: res.headers,
                        error: success ? undefined : `HTTP ${res.statusCode}: ${res.statusMessage}`
                      })
                    })
                  })

                  req.on('error', (err) => {
                    console.error('[Workflow Executor] HTTP request error:', err)
                    resolve({
                      success: false,
                      error: err.message,
                      result: null
                    })
                  })

                  // Send request body if present
                  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                    const bodyData = typeof body === 'string' ? body : JSON.stringify(body)
                    req.write(bodyData)
                  }

                  req.end()
                })
              } catch (error) {
                return {
                  success: false,
                  error: error.message,
                  result: null
                }
              }
            }

            // Handle web search
            if (request.toolType === 'web-search') {
              const { query, resultCount, connectionConfig } = request.webSearchConfig || {}

              if (!query) {
                return { success: false, error: 'Missing search query' }
              }

              // Emit 'before search' checkpoint event for docked checkpoint nodes
              sender.send('workflow:event', {
                type: 'checkpoint-data',
                executionId,
                nodeId: request.nodeId,
                data: {
                  sourceNodeType: 'web-search',
                  eventType: 'iteration',
                  query,
                  resultCount: resultCount || 5,
                  provider: connectionConfig?.provider || 'langsearch',
                  timestamp: Date.now()
                }
              })

              // Resolve connection config from workflow connections if not directly provided
              // Normalize legacy providers (e.g. 'searxng') to the default
              const knownProviders = ['langsearch', 'brave', 'tavily']
              let provider = connectionConfig?.provider || 'langsearch'
              if (!knownProviders.includes(provider)) {
                provider = 'langsearch'
              }
              let apiKey = connectionConfig?.apiKey || ''

              // Resolve connection from connectionStorage (connections are stored globally, NOT in .pdflow files)
              if (!connectionConfig || !connectionConfig.apiKey) {
                try {
                  const { loadConnections } = require('./services/connectionStorage')
                  const connResult = await loadConnections(currentWorkspacePath)
                  const savedConnections = (connResult.success && connResult.connections) ? connResult.connections : []

                  // First try connectionId from webSearchConfig (agent tool path) or node data
                  let connId = request.webSearchConfig?.connectionId
                  if (!connId && request.nodeId) {
                    const workflowFile = workflow.file || workflow
                    const nodes = workflowFile.nodes || []
                    const node = nodes.find(n => n.id === request.nodeId)
                    if (node && node.data) {
                      connId = node.data.connectionId
                    }
                  }

                  if (connId) {
                    const conn = savedConnections.find(c => c.id === connId)
                    if (conn && conn.config) {
                      provider = conn.config.provider || provider
                      apiKey = conn.config.apiKey || apiKey
                    }
                  }

                  // Final fallback: use first web-search connection available
                  if (!apiKey && savedConnections.length > 0) {
                    const webSearchConn = savedConnections.find(c => c.type === 'web-search')
                    if (webSearchConn && webSearchConn.config) {
                      provider = webSearchConn.config.provider || 'langsearch'
                      apiKey = webSearchConn.config.apiKey || ''
                    }
                  }
                } catch (connErr) {
                  console.error('[onToolCall:web-search] Failed to load connections:', connErr.message)
                }
              }

              // If no API key resolved from node data or connections, fall back to env/config resolution
              // Priority: workspace .env > system env vars > config.yaml
              if (!apiKey) {
                try {
                  const envVarMap = {
                    langsearch: 'LANGSEARCH_API_KEY',
                    brave: 'BRAVE_API_KEY',
                    tavily: 'TAVILY_API_KEY'
                  }
                  const envVar = envVarMap[provider]

                  // 1. Check workspace .env file
                  const wsPath = workflow.workspacePath || workflow.file?.workspacePath || currentWorkspacePath
                  if (!apiKey && wsPath && envVar) {
                    try {
                      const fs = require('fs')
                      const envFilePath = path.join(wsPath, '.env')
                      if (fs.existsSync(envFilePath)) {
                        const envContent = fs.readFileSync(envFilePath, 'utf-8')
                        const match = envContent.match(new RegExp(`^${envVar}=(.+)$`, 'm'))
                        if (match) {
                          apiKey = match[1].trim().replace(/^["']|["']$/g, '')
                        }
                      }
                    } catch (envErr) {
                      // .env file not found or unreadable - continue to next fallback
                    }
                  }

                  // 2. Check system environment variables
                  if (!apiKey && envVar && process.env[envVar]) {
                    apiKey = process.env[envVar]
                  }

                  // 3. Check ~/.prompd/config.yaml and workspace config
                  if (!apiKey) {
                    const globalPath = getGlobalConfigPath()
                    let config = await readConfigFile(globalPath) || {}
                    if (wsPath) {
                      const localPath = getLocalConfigPath(wsPath)
                      const localConfig = await readConfigFile(localPath)
                      if (localConfig) {
                        config = mergeConfigs(config, localConfig)
                      }
                    }
                    apiKey = config.services?.[provider]?.api_key || ''
                  }
                } catch (configErr) {
                  console.warn('[WebSearch] Config key resolution failed:', configErr.message)
                }
              }

              const maxResults = resultCount || 5
              const https = require('https')
              const http = require('http')
              const urlModule = require('url')

              try {
                let searchUrl = ''
                let searchOptions = {}

                if (provider === 'brave') {
                  searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`
                  searchOptions = {
                    method: 'GET',
                    headers: {
                      'User-Agent': 'Prompd/1.0',
                      'Accept': 'application/json',
                      'Accept-Language': 'en-US,en;q=0.9',
                      'Accept-Encoding': 'gzip',
                      'X-Subscription-Token': apiKey
                    }
                  }
                } else if (provider === 'tavily') {
                  searchUrl = 'https://api.tavily.com/search'
                  searchOptions = {
                    method: 'POST',
                    headers: {
                      'User-Agent': 'Prompd/1.0',
                      'Content-Type': 'application/json',
                      'Accept': 'application/json',
                      'Accept-Language': 'en-US,en;q=0.9'
                    }
                  }
                } else if (provider === 'langsearch') {
                  searchUrl = 'https://api.langsearch.com/v1/web-search'
                  searchOptions = {
                    method: 'POST',
                    headers: {
                      'User-Agent': 'Prompd/1.0',
                      'Content-Type': 'application/json',
                      'Accept': 'application/json',
                      'Accept-Language': 'en-US,en;q=0.9',
                      'Authorization': `Bearer ${apiKey}`
                    }
                  }
                } else {
                  return { success: false, error: `Unknown search provider: ${provider}` }
                }

                return await new Promise((resolve) => {
                  const parsedUrl = urlModule.parse(searchUrl)
                  const isHttps = parsedUrl.protocol === 'https:'
                  const httpModule = isHttps ? https : http

                  const req = httpModule.request(searchUrl, searchOptions, (res) => {
                    const chunks = []

                    res.on('data', (chunk) => {
                      chunks.push(chunk)
                    })

                    res.on('end', () => {
                      try {
                        const responseData = Buffer.concat(chunks).toString('utf-8')

                        // Check HTTP status before parsing
                        if (res.statusCode < 200 || res.statusCode >= 300) {
                          const httpError = `Search provider returned HTTP ${res.statusCode}: ${responseData.slice(0, 200)}`
                          sender.send('workflow:event', {
                            type: 'checkpoint-data',
                            executionId,
                            nodeId: request.nodeId,
                            data: {
                              sourceNodeType: 'web-search',
                              eventType: 'error',
                              query,
                              provider,
                              error: httpError,
                              timestamp: Date.now()
                            }
                          })
                          resolve({
                            success: false,
                            error: httpError,
                            result: null
                          })
                          return
                        }

                        const parsed = JSON.parse(responseData)

                        // Normalize results across providers
                        let results = []
                        if (provider === 'brave') {
                          results = (parsed.web?.results || []).slice(0, maxResults).map(r => ({
                            title: r.title || '',
                            url: r.url || '',
                            content: r.description || '',
                          }))
                        } else if (provider === 'tavily') {
                          results = (parsed.results || []).slice(0, maxResults).map(r => ({
                            title: r.title || '',
                            url: r.url || '',
                            content: r.content || '',
                            score: r.score,
                          }))
                        } else if (provider === 'langsearch') {
                          const pages = parsed.data?.webPages?.value || []
                          results = pages.slice(0, maxResults).map(r => ({
                            title: r.name || '',
                            url: r.url || '',
                            content: r.snippet || '',
                          }))
                        }

                        // Emit 'complete' checkpoint event with search results
                        sender.send('workflow:event', {
                          type: 'checkpoint-data',
                          executionId,
                          nodeId: request.nodeId,
                          data: {
                            sourceNodeType: 'web-search',
                            eventType: 'complete',
                            query,
                            provider,
                            resultCount: results.length,
                            results,
                            timestamp: Date.now()
                          }
                        })

                        resolve({
                          success: true,
                          result: results
                        })
                      } catch (parseErr) {
                        // Emit 'error' checkpoint event for parse failures
                        sender.send('workflow:event', {
                          type: 'checkpoint-data',
                          executionId,
                          nodeId: request.nodeId,
                          data: {
                            sourceNodeType: 'web-search',
                            eventType: 'error',
                            query,
                            provider,
                            error: parseErr.message,
                            timestamp: Date.now()
                          }
                        })

                        resolve({
                          success: false,
                          error: `Failed to parse search response: ${parseErr.message}`,
                          result: null
                        })
                      }
                    })
                  })

                  req.on('error', (err) => {
                    console.error('[Workflow Executor] Web search error:', err)

                    // Emit 'error' checkpoint event for request failures
                    sender.send('workflow:event', {
                      type: 'checkpoint-data',
                      executionId,
                      nodeId: request.nodeId,
                      data: {
                        sourceNodeType: 'web-search',
                        eventType: 'error',
                        query,
                        provider,
                        error: err.message,
                        timestamp: Date.now()
                      }
                    })

                    resolve({
                      success: false,
                      error: err.message,
                      result: null
                    })
                  })

                  // Send body for POST providers
                  if (provider === 'tavily') {
                    req.write(JSON.stringify({
                      api_key: apiKey,
                      query: query,
                      max_results: maxResults,
                    }))
                  } else if (provider === 'langsearch') {
                    req.write(JSON.stringify({
                      query: query,
                      freshness: 'noLimit',
                      summary: false,
                      count: Math.min(maxResults, 10),
                    }))
                  }

                  req.end()
                })
              } catch (error) {
                return {
                  success: false,
                  error: error.message,
                  result: null
                }
              }
            }

            // Handle database query execution
            if (request.toolType === 'database-query') {
              const dbConfig = request.databaseConfig
              if (!dbConfig) {
                return { success: false, error: 'Missing database configuration' }
              }

              // Resolve connection from connectionStorage (connections are stored globally, NOT in .pdflow files)
              let dbConnection = null
              try {
                const { loadConnections } = require('./services/connectionStorage')
                const connResult = await loadConnections(currentWorkspacePath)
                const savedConnections = (connResult.success && connResult.connections) ? connResult.connections : []
                dbConnection = savedConnections.find(c => c.id === dbConfig.connectionId)
              } catch (connErr) {
                console.error('[onToolCall:database-query] Failed to load connections:', connErr.message)
              }

              if (!dbConnection) {
                return { success: false, error: `Database connection not found: ${dbConfig.connectionId}` }
              }

              const connConfig = dbConnection.config || {}
              // Connection config is the source of truth for database type.
              // The CLI may send a placeholder dbType — always prefer the actual connection config.
              const dbType = connConfig.dbType || dbConfig.dbType || 'postgresql'

              // Emit checkpoint event before query
              sender.send('workflow:event', {
                type: 'checkpoint-data',
                executionId,
                nodeId: request.nodeId,
                data: {
                  sourceNodeType: 'database-query',
                  eventType: 'iteration',
                  dbType,
                  queryType: dbConfig.queryType,
                  query: (dbConfig.query || '').slice(0, 200),
                  timestamp: Date.now()
                }
              })

              try {
                let result

                // Build connection URI/options from connection config
                const host = connConfig.host || 'localhost'
                const port = connConfig.port
                const database = connConfig.database || ''
                const username = connConfig.username || ''
                const connectionString = connConfig.connectionString || ''
                const ssl = connConfig.ssl || false
                // Password is resolved from the connection's secure store
                const password = dbConnection.password || connConfig.password || ''
                const timeoutMs = dbConfig.timeoutMs || 30000

                if (dbType === 'postgresql') {
                  try {
                    const { Pool } = require('pg')
                    const poolConfig = connectionString
                      ? { connectionString, ssl: ssl ? { rejectUnauthorized: false } : undefined }
                      : { host, port: port || 5432, database, user: username, password, ssl: ssl ? { rejectUnauthorized: false } : undefined }
                    poolConfig.connectionTimeoutMillis = timeoutMs
                    poolConfig.query_timeout = timeoutMs

                    const pool = new Pool(poolConfig)
                    try {
                      // Parse parameters from JSON string
                      let params = undefined
                      if (dbConfig.parameters) {
                        try { params = JSON.parse(dbConfig.parameters) } catch { /* ignore parse errors */ }
                      }

                      const queryResult = await pool.query(dbConfig.query, params)
                      const maxRows = dbConfig.maxRows || 1000
                      result = {
                        rows: queryResult.rows.slice(0, maxRows),
                        rowCount: queryResult.rowCount,
                        fields: queryResult.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
                      }
                    } finally {
                      await pool.end()
                    }
                  } catch (pgErr) {
                    if (pgErr.code === 'MODULE_NOT_FOUND') {
                      return { success: false, error: 'PostgreSQL driver (pg) not installed. Run: npm install pg' }
                    }
                    throw pgErr
                  }
                } else if (dbType === 'mysql') {
                  try {
                    const mysql = require('mysql2/promise')
                    const connOpts = connectionString
                      ? { uri: connectionString }
                      : { host, port: port || 3306, database, user: username, password, ssl: ssl ? {} : undefined, connectTimeout: timeoutMs }

                    const conn = await mysql.createConnection(connOpts)
                    try {
                      let params = undefined
                      if (dbConfig.parameters) {
                        try { params = JSON.parse(dbConfig.parameters) } catch { /* ignore */ }
                      }

                      const [rows, fields] = await conn.execute(dbConfig.query, params)
                      const maxRows = dbConfig.maxRows || 1000
                      result = {
                        rows: Array.isArray(rows) ? rows.slice(0, maxRows) : rows,
                        rowCount: Array.isArray(rows) ? rows.length : 0,
                        fields: fields?.map(f => ({ name: f.name, type: f.type })),
                      }
                    } finally {
                      await conn.end()
                    }
                  } catch (mysqlErr) {
                    if (mysqlErr.code === 'MODULE_NOT_FOUND') {
                      return { success: false, error: 'MySQL driver (mysql2) not installed. Run: npm install mysql2' }
                    }
                    throw mysqlErr
                  }
                } else if (dbType === 'sqlite') {
                  try {
                    const Database = require('better-sqlite3')
                    const dbPath = connectionString || database
                    if (!dbPath) {
                      return { success: false, error: 'SQLite requires a database file path' }
                    }

                    const db = new Database(dbPath, { readonly: dbConfig.queryType === 'select', timeout: timeoutMs })
                    try {
                      let params = undefined
                      if (dbConfig.parameters) {
                        try { params = JSON.parse(dbConfig.parameters) } catch { /* ignore */ }
                      }

                      const maxRows = dbConfig.maxRows || 1000
                      if (dbConfig.queryType === 'select' || dbConfig.queryType === 'raw') {
                        // Use .all() for queries that return rows
                        const stmt = db.prepare(dbConfig.query)
                        const rows = params ? stmt.all(...params) : stmt.all()
                        result = {
                          rows: rows.slice(0, maxRows),
                          rowCount: rows.length,
                        }
                      } else {
                        // Use .run() for INSERT/UPDATE/DELETE
                        const stmt = db.prepare(dbConfig.query)
                        const info = params ? stmt.run(...params) : stmt.run()
                        result = {
                          changes: info.changes,
                          lastInsertRowid: info.lastInsertRowid,
                        }
                      }
                    } finally {
                      db.close()
                    }
                  } catch (sqliteErr) {
                    if (sqliteErr.code === 'MODULE_NOT_FOUND') {
                      return { success: false, error: 'SQLite driver (better-sqlite3) not installed. Run: npm install better-sqlite3' }
                    }
                    throw sqliteErr
                  }
                } else if (dbType === 'mongodb') {
                  try {
                    const { MongoClient } = require('mongodb')
                    const uri = connectionString || `mongodb://${username}:${password}@${host}:${port || 27017}/${database}`

                    const client = new MongoClient(uri, {
                      serverSelectionTimeoutMS: timeoutMs,
                      connectTimeoutMS: timeoutMs,
                    })
                    try {
                      await client.connect()
                      const db = client.db(database || undefined)
                      const collection = dbConfig.collection || 'test'
                      const coll = db.collection(collection)
                      const maxRows = dbConfig.maxRows || 1000

                      // Parse the query from JSON string
                      let queryDoc = {}
                      try {
                        queryDoc = JSON.parse(dbConfig.query || '{}')
                      } catch {
                        return { success: false, error: 'Invalid MongoDB query JSON' }
                      }

                      if (dbConfig.queryType === 'select') {
                        // Support projection via array syntax: [filter, projection]
                        let filter = queryDoc
                        let projection = undefined
                        if (Array.isArray(queryDoc)) {
                          filter = queryDoc[0] || {}
                          projection = queryDoc[1] || undefined
                        }
                        const findOptions = projection ? { projection } : {}
                        const docs = await coll.find(filter, findOptions).limit(maxRows).toArray()
                        result = { rows: docs, rowCount: docs.length }
                      } else if (dbConfig.queryType === 'insert') {
                        const insertResult = Array.isArray(queryDoc)
                          ? await coll.insertMany(queryDoc)
                          : await coll.insertOne(queryDoc)
                        result = { insertedCount: insertResult.insertedCount || 1, insertedId: insertResult.insertedId }
                      } else if (dbConfig.queryType === 'update') {
                        // Expect { filter: {...}, update: {...} }
                        const filter = queryDoc.filter || {}
                        const update = queryDoc.update || queryDoc
                        const updateResult = await coll.updateMany(filter, update)
                        result = { matchedCount: updateResult.matchedCount, modifiedCount: updateResult.modifiedCount }
                      } else if (dbConfig.queryType === 'delete') {
                        const deleteResult = await coll.deleteMany(queryDoc)
                        result = { deletedCount: deleteResult.deletedCount }
                      } else if (dbConfig.queryType === 'aggregate') {
                        const pipeline = Array.isArray(queryDoc) ? queryDoc : [queryDoc]
                        const docs = await coll.aggregate(pipeline).toArray()
                        result = { rows: docs.slice(0, maxRows), rowCount: docs.length }
                      } else {
                        // Raw command
                        const cmdResult = await db.command(queryDoc)
                        result = cmdResult
                      }
                    } finally {
                      await client.close()
                    }
                  } catch (mongoErr) {
                    if (mongoErr.code === 'MODULE_NOT_FOUND') {
                      return { success: false, error: 'MongoDB driver (mongodb) not installed. Run: npm install mongodb' }
                    }
                    throw mongoErr
                  }
                } else if (dbType === 'redis') {
                  try {
                    const Redis = require('ioredis')
                    const redisOpts = connectionString
                      ? connectionString
                      : { host, port: port || 6379, password: password || undefined, db: parseInt(database) || 0, connectTimeout: timeoutMs }

                    const redis = new Redis(redisOpts)
                    try {
                      // Parse Redis command: "GET mykey" -> ["GET", "mykey"]
                      const parts = (dbConfig.query || '').trim().split(/\s+/)
                      if (parts.length === 0 || !parts[0]) {
                        return { success: false, error: 'Empty Redis command' }
                      }

                      const redisResult = await redis.call(parts[0], ...parts.slice(1))
                      result = { result: redisResult }
                    } finally {
                      redis.disconnect()
                    }
                  } catch (redisErr) {
                    if (redisErr.code === 'MODULE_NOT_FOUND') {
                      return { success: false, error: 'Redis driver (ioredis) not installed. Run: npm install ioredis' }
                    }
                    throw redisErr
                  }
                } else {
                  return { success: false, error: `Unsupported database type: ${dbType}` }
                }

                // Emit checkpoint event with query results
                sender.send('workflow:event', {
                  type: 'checkpoint-data',
                  executionId,
                  nodeId: request.nodeId,
                  data: {
                    sourceNodeType: 'database-query',
                    eventType: 'complete',
                    dbType,
                    queryType: dbConfig.queryType,
                    rowCount: result?.rows?.length || result?.rowCount || 0,
                    timestamp: Date.now()
                  }
                })

                return { success: true, result }
              } catch (dbErr) {
                console.error('[Workflow Executor] Database query error:', dbErr)

                // Emit error checkpoint event
                sender.send('workflow:event', {
                  type: 'checkpoint-data',
                  executionId,
                  nodeId: request.nodeId,
                  data: {
                    sourceNodeType: 'database-query',
                    eventType: 'error',
                    dbType,
                    error: dbErr.message,
                    timestamp: Date.now()
                  }
                })

                return { success: false, error: dbErr.message }
              }
            }

            // Handle MCP tool execution
            if (request.toolType === 'mcp') {
              const toolName = request.toolName
              if (!toolName) {
                return { success: false, error: 'MCP tool name is required' }
              }

              // Resolve server name: first from mcpConfig (inline), then from connectionId on the node
              let serverName = request.mcpConfig?.serverName
              if (!serverName && request.nodeId) {
                const workflowFile = workflow.file || workflow
                const wfNodes = workflowFile.nodes || workflow.nodes || []
                const node = wfNodes.find(n => n.id === request.nodeId)
                if (node && node.data?.connectionId) {
                  try {
                    const { loadConnections } = require('./services/connectionStorage')
                    const connResult = await loadConnections(currentWorkspacePath)
                    const savedConnections = (connResult.success && connResult.connections) ? connResult.connections : []
                    const mcpConn = savedConnections.find(c => c.id === node.data.connectionId)
                    if (mcpConn && mcpConn.config) {
                      serverName = mcpConn.config.serverName
                    }
                  } catch (connErr) {
                    console.error('[onToolCall:mcp] Failed to load connections:', connErr.message)
                  }
                }
              }

              if (!serverName) {
                return { success: false, error: 'MCP server name could not be resolved. Check the connection configuration.' }
              }

              // Emit checkpoint event before MCP call
              sender.send('workflow:event', {
                type: 'checkpoint-data',
                executionId,
                nodeId: request.nodeId,
                data: {
                  sourceNodeType: 'mcp-tool',
                  eventType: 'iteration',
                  serverName,
                  toolName,
                  timestamp: Date.now()
                }
              })

              try {
                // Connect first (no-op if already connected; throws on failure)
                await mcpService.connect(serverName)

                // Call the tool with resolved parameters from the CLI
                // mcpService.callTool returns the raw MCP SDK CallToolResult: { content, isError }
                const toolArgs = request.parameters || {}
                const callResult = await mcpService.callTool(serverName, toolName, toolArgs)

                // MCP SDK signals errors via isError flag on the result
                if (callResult.isError) {
                  const errorText = (callResult.content || [])
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n') || 'MCP tool call returned an error'
                  sender.send('workflow:event', {
                    type: 'checkpoint-data',
                    executionId,
                    nodeId: request.nodeId,
                    data: {
                      sourceNodeType: 'mcp-tool',
                      eventType: 'error',
                      serverName,
                      toolName,
                      error: errorText,
                      timestamp: Date.now()
                    }
                  })
                  return { success: false, error: errorText }
                }

                // Extract text content from the MCP result
                const resultText = (callResult.content || [])
                  .filter(c => c.type === 'text')
                  .map(c => c.text)
                  .join('\n')

                return { success: true, result: resultText || callResult }
              } catch (mcpErr) {
                console.error('[Workflow Executor] MCP tool call error:', mcpErr)

                sender.send('workflow:event', {
                  type: 'checkpoint-data',
                  executionId,
                  nodeId: request.nodeId,
                  data: {
                    sourceNodeType: 'mcp-tool',
                    eventType: 'error',
                    serverName,
                    toolName,
                    error: mcpErr.message,
                    timestamp: Date.now()
                  }
                })

                return { success: false, error: mcpErr.message }
              }
            }

            // Handle command execution
            if (request.toolType !== 'command') {
              return {
                success: false,
                error: `Unsupported tool type: ${request.toolType}. Supported: 'command', 'http', 'web-search', 'database-query', 'mcp'.`
              }
            }

            // Extract command from commandConfig
            if (!request.commandConfig) {
              return {
                success: false,
                error: 'Missing command configuration'
              }
            }

            let { executable, args, cwd } = request.commandConfig
            const command = `${executable} ${args || ''}`.trim()

            // Validate command
            if (!command || !executable) {
              return { success: false, result: 'Missing command executable', error: 'Missing command executable' }
            }

            // Parse command into executable and args
            const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
            if (parts.length === 0) {
              return { success: false, result: 'Empty command', error: 'Empty command' }
            }

            executable = parts[0].toLowerCase()
            args = parts.slice(1).map(arg => {
              // Remove surrounding quotes if present
              if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
                return arg.slice(1, -1)
              }
              return arg
            })

            // Built-in whitelist of allowed executables for security
            const builtinExecutables = [
              'npm', 'npx', 'node',
              'yarn', 'pnpm',
              'git',
              'tsc', 'typescript',
              'eslint', 'prettier',
              'python', 'python3', 'pip',
              'prompd',
              'dotnet',
              'ls', 'dir', 'find', 'tree',
              'cat', 'head', 'tail', 'type',
              'grep', 'sed', 'awk',
              'wc', 'sort', 'uniq', 'diff',
              'cp', 'mv', 'mkdir', 'rmdir', 'touch',
              'echo', 'pwd',
              'where', 'which',
              'whoami', 'hostname',
              'curl', 'wget',
            ]

            // Executables that must never appear in custom command lists from the renderer
            const blockedExecutables = [
              'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
              'bash', 'sh', 'zsh', 'fish', 'dash',
              'cmd', 'cmd.exe', 'command.com',
              'wscript', 'cscript', 'mshta', 'msiexec',
              'reg', 'regedit', 'regedt32',
              'sc', 'net', 'netsh', 'ipconfig',
              'taskkill', 'tasklist', 'schtasks',
              'certutil', 'bitsadmin', 'rundll32', 'regsvr32',
            ]

            // Custom commands from the renderer — strip any that are blocked or overlap with builtins
            const workflowCustomCommands = (options?.customCommands || [])
              .map(c => c.toLowerCase().trim())
              .filter(c => c.length > 0 && !blockedExecutables.includes(c))
            const allowedExecutables = [...new Set([...builtinExecutables, ...workflowCustomCommands])]

            if (!allowedExecutables.includes(executable)) {
              return {
                success: false,
                result: `Command '${executable}' not allowed. Allowed built-in: ${builtinExecutables.join(', ')}${workflowCustomCommands.length > 0 ? `. Custom: ${workflowCustomCommands.join(', ')}` : ''}`,
                error: `Command '${executable}' not allowed`
              }
            }

            // Validate all arguments for security
            for (const arg of args) {
              // Check for actual path traversal patterns (../ or ..\) not just '..' in text
              if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(arg)) {
                return { success: false, result: 'Path traversal (..) not allowed in arguments', error: 'Path traversal not allowed' }
              }
              if (arg.startsWith('~')) {
                return { success: false, result: 'Home directory (~) expansion not allowed', error: 'Home directory expansion not allowed' }
              }
              const dangerousChars = [';', '&', '|', '`', '$', '(', ')', '<', '>']
              for (const char of dangerousChars) {
                if (arg.includes(char)) {
                  return { success: false, result: `Shell metacharacter '${char}' not allowed in arguments`, error: `Shell metacharacter '${char}' not allowed` }
                }
              }
              // Block eval/exec flags for interpreter executables — these allow arbitrary code
              // execution without any shell metacharacters (e.g. node -e "require('child_process')...")
              const interpreters = ['node', 'python', 'python3', 'perl', 'ruby']
              if (interpreters.includes(executable)) {
                const evalFlags = ['-e', '-c', '--eval', '--exec', '--interactive', '-i']
                if (evalFlags.includes(arg.toLowerCase())) {
                  return { success: false, result: `Flag '${arg}' not allowed for interpreter '${executable}'`, error: `Eval flag not allowed` }
                }
              }
            }

            // Determine working directory
            const workingDir = cwd || currentWorkspacePath || process.cwd()

            // Validate working directory exists
            try {
              const stats = await fs.promises.stat(workingDir)
              if (!stats.isDirectory()) {
                return { success: false, result: 'Working directory is not a directory', error: 'Working directory is not a directory' }
              }
            } catch (error) {
              return { success: false, result: `Working directory does not exist: ${workingDir}`, error: `Working directory does not exist: ${workingDir}` }
            }

            // Execute command
            return await new Promise((resolve) => {
              let executablePath = executable
              let spawnArgs = args
              let useShell = false

              // Windows-specific handling
              if (process.platform === 'win32') {
                if (['npm', 'npx', 'yarn', 'pnpm', 'tsc', 'eslint', 'prettier'].includes(executable)) {
                  executablePath = `${executable}.cmd`
                }
                else if (['echo', 'type', 'dir', 'mkdir', 'rmdir', 'where'].includes(executable)) {
                  executablePath = 'cmd.exe'
                  spawnArgs = ['/c', executable, ...args]
                }
              }

              const childProcess = spawn(executablePath, spawnArgs, {
                cwd: workingDir,
                shell: useShell,
                env: { ...process.env }
              })

              let stdout = ''
              let stderr = ''

              childProcess.stdout.on('data', (data) => {
                stdout += data.toString()
              })

              childProcess.stderr.on('data', (data) => {
                stderr += data.toString()
              })

              childProcess.on('close', (code) => {
                console.log('[Workflow Executor] Command completed with code:', code)
                resolve({
                  success: code === 0,
                  result: stdout || stderr,
                  error: code !== 0 ? stderr : undefined
                })
              })

              childProcess.on('error', (err) => {
                console.error('[Workflow Executor] Command error:', err)
                resolve({
                  success: false,
                  result: err.message,
                  error: err.message
                })
              })

              // Timeout after 60 seconds
              setTimeout(() => {
                childProcess.kill()
                resolve({
                  success: false,
                  result: stdout || 'Command timed out after 60 seconds',
                  error: 'Command timed out after 60 seconds'
                })
              }, 60000)
            })
          } catch (err) {
            console.error('[Workflow Executor] onToolCall failed:', err)
            return {
              success: false,
              result: err.message || 'Unknown error',
              error: err.message || 'Unknown error'
            }
          }
        }
      }

      // Store execution reference for cancellation
      runningExecutions.set(executionId, { cancelled: false })

      // Execute workflow with live callbacks
      const result = await executeWorkflow(workflow, params, executorOptions)

      console.log('[Workflow Executor] Result keys:', Object.keys(result))
      console.log('[Workflow Executor] Has trace:', !!result.trace)
      console.log('[Workflow Executor] Trace entries:', result.trace?.entries?.length || 0)

      // Send completion event
      sender.send('workflow:event', {
        type: 'complete',
        executionId,
        data: result,
        timestamp: Date.now()
      })

      // Cleanup
      runningExecutions.delete(executionId)

      // Close popup if it belongs to this execution
      if (popupExecutionId === executionId) {
        closePopupWindow('complete', 'Workflow completed')
      }

      console.log(`[Workflow Executor] Execution completed: ${executionId}`)
    } catch (err) {
      console.error(`[Workflow Executor] Execution failed: ${executionId}`, err)

      // Send error event
      sender.send('workflow:event', {
        type: 'error',
        executionId,
        data: { error: err.message, stack: err.stack },
        timestamp: Date.now()
      })

      // Cleanup
      runningExecutions.delete(executionId)

      // Close popup if it belongs to this execution
      if (popupExecutionId === executionId) {
        closePopupWindow('error', err.message)
      }
    }
  })

  return { executionId }
})

/**
 * Cancel running execution
 */
ipcMain.handle('workflow:cancel', async (_event, executionId) => {
  const execution = runningExecutions.get(executionId)
  if (execution) {
    execution.cancelled = true
    console.log(`[Workflow Executor] Cancelled execution: ${executionId}`)
    // Send immediate cancellation event to frontend
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workflow:event', {
        type: 'cancelled',
        executionId,
        timestamp: Date.now()
      })
    }
  }
})

/**
 * Respond to user input request (bidirectional IPC)
 */
ipcMain.handle('workflow:user-input-response', async (_event, requestId, response) => {
  const pending = pendingUserInputs.get(requestId)
  if (pending) {
    pendingUserInputs.delete(requestId)
    pending.resolve(response)
    console.log(`[Workflow Executor] User input received: ${requestId}`)
  } else {
    console.warn(`[Workflow Executor] No pending request for: ${requestId}`)
  }
})

/**
 * Respond to checkpoint request (bidirectional IPC)
 */
ipcMain.handle('workflow:checkpoint-response', async (_event, requestId, shouldContinue) => {
  const pending = pendingUserInputs.get(requestId)
  if (pending) {
    pendingUserInputs.delete(requestId)
    pending.resolve(shouldContinue)
    console.log(`[Workflow Executor] Checkpoint response received: ${requestId}, continue: ${shouldContinue}`)
  } else {
    console.warn(`[Workflow Executor] No pending request for: ${requestId}`)
  }
})

/**
 * Respond to debug/step pause request (bidirectional IPC)
 */
ipcMain.handle('workflow:debug-pause-response', async (_event, requestId, shouldContinue) => {
  const pending = pendingUserInputs.get(requestId)
  if (pending) {
    pendingUserInputs.delete(requestId)
    pending.resolve(shouldContinue)
    console.log(`[Workflow Executor] Debug pause response received: ${requestId}, continue: ${shouldContinue}`)
  } else {
    console.warn(`[Workflow Executor] No pending debug pause request for: ${requestId}`)
  }
})

/**
 * Popup window IPC handlers (for automated workflow user input)
 */
ipcMain.handle('popup:getRequestData', async () => {
  if (!currentPopupRequest) {
    return { error: 'No active request' }
  }
  return {
    request: currentPopupRequest.request,
    metadata: currentPopupRequest.metadata
  }
})

ipcMain.handle('popup:submitInput', async (_event, response) => {
  if (!currentPopupRequest) {
    return { success: false, error: 'No active request' }
  }

  const { requestId, isCheckpoint } = currentPopupRequest
  const pending = pendingUserInputs.get(requestId)

  if (pending) {
    pendingUserInputs.delete(requestId)

    if (isCheckpoint) {
      pending.resolve(response.value === true)
    } else {
      pending.resolve(response)
    }

    console.log(`[Popup] Input received for: ${requestId}`)

    // Don't close popup — keep it alive for the next request in the loop.
    // The popup will be closed when the workflow execution finishes
    // (via closePopupWindow) or when the user manually closes it.
    currentPopupRequest = null

    return { success: true }
  }

  return { success: false, error: 'Request expired' }
})

ipcMain.handle('popup:cancel', async () => {
  if (!currentPopupRequest) {
    return { success: false }
  }

  const { requestId, isCheckpoint } = currentPopupRequest
  const pending = pendingUserInputs.get(requestId)

  if (pending) {
    pendingUserInputs.delete(requestId)

    if (isCheckpoint) {
      pending.resolve(false)
    } else {
      pending.resolve({ value: undefined, cancelled: true })
    }

    console.log(`[Popup] Input cancelled for: ${requestId}`)
  }

  if (popupWindow && !popupWindow.isDestroyed()) {
    currentPopupRequest = null
    popupWindow.close()
  }

  return { success: true }
})

/**
 * Download execution trace to file
 * trace: ExecutionTrace object
 * filename: Optional custom filename
 */
ipcMain.handle('workflow:downloadTrace', async (event, trace, filename) => {
  try {
    // Import required modules
    const { dialog } = require('electron')
    const fs = require('fs').promises
    const path = require('path')

    // Get the browser window that sent this request
    const win = BrowserWindow.fromWebContents(event.sender)

    // Show save dialog
    const defaultFilename = filename || `workflow-trace-${trace.id || Date.now()}.json`
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Save Execution Trace',
      defaultPath: defaultFilename,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (canceled || !filePath) {
      console.log('[Workflow Executor] Download trace cancelled by user')
      return { success: false, cancelled: true }
    }

    // Convert trace to JSON
    const json = JSON.stringify(trace, null, 2)

    // Write to file
    await fs.writeFile(filePath, json, 'utf-8')

    console.log(`[Workflow Executor] Trace saved to: ${filePath}`)
    return { success: true, filePath }
  } catch (err) {
    console.error('[Workflow Executor] Download trace failed:', err)
    throw err
  }
})

/**
 * Export workflow as Docker deployment
 * workflow: Workflow object
 * workflowPath: Path to the .pdflow file
 * prompdjson: Optional prompd.json manifest
 */
ipcMain.handle('workflow:exportDocker', async (event, workflow, workflowPath, prompdjson) => {
  try {
    const { dialog } = require('electron')
    const path = require('path')
    const { WorkflowExportService } = require('./services/workflowExportService')
    const workflowExportService = new WorkflowExportService(getPrompdCli)

    // Get the browser window that sent this request
    const win = BrowserWindow.fromWebContents(event.sender)

    // Show directory selection dialog
    const workflowName = workflow.name || 'workflow'
    const defaultDir = `${workflowName}-docker`

    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Select Export Directory',
      defaultPath: defaultDir,
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    })

    if (canceled || !filePaths || filePaths.length === 0) {
      console.log('[Workflow Export] Export cancelled by user')
      return { success: false, cancelled: true }
    }

    const outputDir = filePaths[0]
    console.log(`[Workflow Export] Exporting to: ${outputDir}`)

    // Call export service
    const result = await workflowExportService.exportWorkflow({
      workflow,
      workflowPath,
      outputDir,
      prompdjson: prompdjson || {}
    })

    if (result.success) {
      console.log(`[Workflow Export] Successfully exported ${result.files.length} files`)
      return {
        success: true,
        outputDir: result.outputDir,
        files: result.files
      }
    } else {
      console.error('[Workflow Export] Export failed:', result.error)
      return {
        success: false,
        error: result.error
      }
    }
  } catch (err) {
    console.error('[Workflow Export] Export failed:', err)
    return {
      success: false,
      error: err.message
    }
  }
})

/**
 * Export workflow to specific directory (no dialog)
 * workflow: Workflow object
 * workflowPath: Path to the .pdflow file
 * outputDir: Directory to export to
 * prompdjson: Optional prompd.json manifest
 */
ipcMain.handle('workflow:exportDockerToPath', async (_event, workflow, workflowPath, outputDir, prompdjson) => {
  try {
    const { WorkflowExportService } = require('./services/workflowExportService')
    const workflowExportService = new WorkflowExportService(getPrompdCli)

    console.log(`[Workflow Export] Exporting to: ${outputDir}`)

    // Call export service
    const result = await workflowExportService.exportWorkflow({
      workflow,
      workflowPath,
      outputDir,
      prompdjson: prompdjson || {}
    })

    if (result.success) {
      console.log(`[Workflow Export] Successfully exported ${result.files.length} files`)
      return {
        success: true,
        outputDir: result.outputDir,
        files: result.files
      }
    } else {
      console.error('[Workflow Export] Export failed:', result.error)
      return {
        success: false,
        error: result.error
      }
    }
  } catch (err) {
    console.error('[Workflow Export] Export failed:', err)
    return {
      success: false,
      error: err.message
    }
  }
})

/**
 * Export workflow to specific path with export type (Docker or Kubernetes)
 * workflow: Workflow object
 * workflowPath: Path to the .pdflow file
 * outputDir: Directory to export to
 * prompdjson: Optional prompd.json manifest
 * options: { exportType: 'docker' | 'kubernetes', kubernetesOptions?: {...} }
 */
ipcMain.handle('workflow:exportToPath', async (_event, workflow, workflowPath, outputDir, prompdjson, options = {}) => {
  try {
    const { WorkflowExportService } = require('./services/workflowExportService')
    const workflowExportService = new WorkflowExportService(getPrompdCli)

    const { exportType = 'docker', kubernetesOptions, workspacePath } = options

    console.log(`[Workflow Export] Exporting as ${exportType} to: ${outputDir}`)

    // Call export service with export type
    const result = await workflowExportService.exportWorkflow({
      workflow,
      workflowPath,
      outputDir,
      prompdjson: prompdjson || {},
      exportType,
      kubernetesOptions: kubernetesOptions || {},
      workspacePath // Pass through workspace path for preserving directory structure
    })

    if (result.success) {
      console.log(`[Workflow Export] Successfully exported ${result.files.length} files as ${exportType}`)
      return {
        success: true,
        outputDir: result.outputDir,
        files: result.files
      }
    } else {
      console.error('[Workflow Export] Export failed:', result.error)
      return {
        success: false,
        error: result.error
      }
    }
  } catch (err) {
    console.error('[Workflow Export] Export failed:', err)
    return {
      success: false,
      error: err.message
    }
  }
})

