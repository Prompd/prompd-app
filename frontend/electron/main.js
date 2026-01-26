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

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, powerMonitor, net } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('fs-extra')
const os = require('os')

// Tray and trigger services for background workflow execution
const { trayManager } = require('./tray')
const { triggerService } = require('./services/triggerService')
const { TraySchedulerService, createWorkflowExecutor } = require('./services/trayScheduler')

// Set app name for protocol handler display
app.setName('Prompd')
const { spawn } = require('child_process')
const { Worker } = require('worker_threads')
const yaml = require('yaml')

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

// Tray scheduler instance (initialized in createWindow)
let trayScheduler = null

// Handle creating/removing shortcuts on Windows when installing/uninstalling
// Only needed for Squirrel.Windows installer (not NSIS)
try {
  if (require('electron-squirrel-startup')) {
    app.quit()
  }
} catch (e) {
  // electron-squirrel-startup not available (NSIS installer), which is fine
}

let mainWindow
let currentWorkspacePath = null  // Track the current workspace path for git operations
let pendingFileToOpen = null  // File path passed via command line or file association
let pendingProtocolUrl = null  // Protocol URL passed via deep link

// Menu state - tracks what actions are available
let menuState = {
  hasWorkspace: false,      // Is a folder/workspace open?
  hasActiveTab: false,      // Is there an active tab?
  isPrompdFile: false,      // Is the active file a .prmd file?
  canExecute: false         // Can we execute (has .prmd file open)?
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
  if (currentWorkspacePath) {
    const folderName = path.basename(currentWorkspacePath)
    mainWindow.setTitle(`Prompd - ${folderName}`)
  } else {
    mainWindow.setTitle('Prompd')
  }
}

// Configure auto-updater
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

// Auto-update event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] Checking for updates...')
})

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] Update available:', info.version)
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'The update will be downloaded in the background. You will be notified when it is ready to install.',
      buttons: ['OK']
    })
  }
})

autoUpdater.on('update-not-available', (info) => {
  console.log('[AutoUpdater] No updates available. Current version:', info.version)
})

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err)
})

autoUpdater.on('download-progress', (progressObj) => {
  const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`
  console.log('[AutoUpdater]', message)
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdater] Update downloaded:', info.version)
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: 'The application will restart to install the update.',
      buttons: ['Restart Now', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  }
})

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
    autoHideMenuBar: false, // Always show menu bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: 'Prompd',
    backgroundColor: '#1e293b',
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
    // Check if app is actually quitting or just closing window
    if (!trayManager.isAppQuitting() && triggerService.settings?.minimizeToTray) {
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

  // Context menu for input fields (right-click cut/copy/paste)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params

    if (isEditable) {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Cut',
          role: 'cut',
          enabled: editFlags.canCut
        },
        {
          label: 'Copy',
          role: 'copy',
          enabled: editFlags.canCopy
        },
        {
          label: 'Paste',
          role: 'paste',
          enabled: editFlags.canPaste
        },
        { type: 'separator' },
        {
          label: 'Select All',
          role: 'selectAll',
          enabled: editFlags.canSelectAll
        }
      ])
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
          label: 'API Keys',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-api-keys')
            }
          }
        },
        {
          label: 'Settings',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-settings')
            }
          }
        },
        {
          label: 'Scheduler',
          submenu: [
            {
              label: 'Manage Schedules',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('menu-scheduler-settings')
                }
              }
            },
            {
              label: 'Service Settings',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('menu-scheduler-service')
                }
              }
            }
          ]
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
        }
      ]
    },
    // Package menu - Package operations
    {
      label: 'Package',
      submenu: [
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
          label: 'Publish Package',
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-package-publish')
            }
          }
        },
        { type: 'separator' },
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
    // Run menu - Prompt execution
    {
      label: 'Run',
      submenu: [
        {
          label: 'Execute Prompt',
          accelerator: 'F5',
          enabled: menuState.canExecute,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-run-execute')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Prompd Install',
          enabled: menuState.hasWorkspace,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-run-install')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Stop Execution',
          accelerator: 'Shift+F6',
          enabled: false,  // Not yet implemented
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-run-stop')
            }
          }
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
            shell.openExternal('https://github.com/Logikbug/prompd.app/issues')
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify()
            if (mainWindow) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Checking for Updates',
                message: 'Checking for updates...',
                detail: 'You will be notified if an update is available.',
                buttons: ['OK']
              })
            }
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
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  console.log('[Electron] App ready')
  console.log('[Electron] Platform:', process.platform)
  console.log('[Electron] Node version:', process.version)
  console.log('[Electron] Electron version:', process.versions.electron)

  // Hide the default menu during loading - menu is shown when user authenticates
  Menu.setApplicationMenu(null)

  createWindow()
  // Menu is created later when user is authenticated (via showAppMenu IPC)

  // Check for updates on startup (only in production)
  if (!process.env.ELECTRON_START_URL) {
    console.log('[Electron] Checking for updates...')
    autoUpdater.checkForUpdatesAndNotify()
  }

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

  // Initialize trigger service
  triggerService.init({ trayManager, mainWindow }).catch(err => {
    console.error('[Electron] Failed to initialize trigger service:', err)
  })

  // Initialize tray scheduler (persistent workflow scheduling)
  try {
    const workflowExecutor = createWorkflowExecutor(mainWindow)
    trayScheduler = new TraySchedulerService({
      mainWindow,
      trayManager,
      workflowExecutor
    })
    trayScheduler.start()
    console.log('[Electron] Tray scheduler initialized')
  } catch (error) {
    console.error('[Electron] Failed to initialize tray scheduler:', error.message)
    console.error('[Electron] Scheduled workflows will not work. Make sure scheduler-shared dependencies are installed.')
    trayScheduler = null
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
    if (trayScheduler) {
      const schedules = trayScheduler.getActiveSchedules()
      for (const schedule of schedules) {
        trayScheduler.updateSchedule(schedule.id, { enabled: false })
      }
      trayManager.showNotification({
        title: 'Schedules Paused',
        body: `Paused ${schedules.length} scheduled workflow(s)`,
        type: 'info'
      })
    }
  })

  trayManager.on('resume-all-schedules', async () => {
    if (trayScheduler) {
      const schedules = trayScheduler.getSchedules({ enabled: false })
      for (const schedule of schedules) {
        trayScheduler.updateSchedule(schedule.id, { enabled: true })
      }
      trayManager.showNotification({
        title: 'Schedules Resumed',
        body: `Resumed ${schedules.length} scheduled workflow(s)`,
        type: 'info'
      })
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

  trayManager.on('toggle-webhook-server', async () => {
    // Will be implemented when webhookService is added
    console.log('[Tray] Toggle webhook server requested')
  })

  trayManager.on('toggle-notifications', (enabled) => {
    triggerService.updateSettings({ notificationsEnabled: enabled })
  })

  trayManager.on('toggle-minimize-to-tray', (enabled) => {
    triggerService.updateSettings({ minimizeToTray: enabled })
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

// Handle app quitting - ensure trigger service shuts down cleanly
app.on('before-quit', async () => {
  trayManager.setQuitting(true)
  await triggerService.shutdown()
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
  updateWindowTitle()
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

ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
  try {
    // Security: Prevent path traversal attacks
    if (oldPath.includes('..') || newPath.includes('..')) {
      return { success: false, error: 'Invalid path: parent directory references not allowed' }
    }
    await fs.promises.rename(oldPath, newPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:delete', async (event, targetPath, options = {}) => {
  try {
    // Security: Prevent path traversal attacks
    if (targetPath.includes('..')) {
      return { success: false, error: 'Invalid path: parent directory references not allowed' }
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
          const responseData = Buffer.concat(chunks).toString('utf8')
          const headers = {}
          const rawHeaders = response.rawHeaders
          for (let i = 0; i < rawHeaders.length; i += 2) {
            headers[rawHeaders[i].toLowerCase()] = rawHeaders[i + 1]
          }

          resolve({
            success: true,
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: headers,
            body: responseData,
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
    console.log('[Electron] Testing database connection to:', config.host)

    // Use net module to test TCP connectivity
    return new Promise((resolve) => {
      const defaultPorts = {
        postgresql: 5432,
        mysql: 3306,
        mongodb: 27017,
        redis: 6379
      }
      const port = config.port || defaultPorts[config.type] || 5432

      const socket = require('net').createConnection({
        host: config.host,
        port: port,
        timeout: 5000
      })

      socket.on('connect', () => {
        socket.end()
        resolve({
          success: true,
          message: `Database port reachable at ${config.host}:${port}`
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
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('prompd', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('prompd')
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

// Handle file opens (.prmd, .pdpkg)
function handleFileOpen(filePath) {
  console.log('[Electron] File open requested:', filePath)
  // Validate file extension
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.prmd' && ext !== '.pdpkg') {
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
      return ext === '.prmd' || ext === '.pdpkg'
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
    return ext === '.prmd' || ext === '.pdpkg'
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
  return true
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
    'mkdir', 'rmdir',               // Directory operations
    'dotnet',                       // .NET CLI
    'echo', 'type', 'dir', 'ls',    // Basic shell commands (safe, read-only)
    'cat', 'head', 'tail',          // File reading (Unix)
    'where', 'which',               // Command location
    'whoami', 'hostname',           // System info (safe)
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
    // Prevent path traversal with ..
    if (arg.includes('..')) {
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

          if (parsed.metadata?.version) {
            explanation.push(`**Version:** ${parsed.metadata.version}`)
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
  default_provider: '',
  default_model: '',
  api_keys: {},
  custom_providers: {},
  provider_configs: {},
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
  scopes: {},
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

    // Convert to YAML and write
    const yamlContent = yaml.stringify(config, {
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
      deepseek: 'DEEPSEEK_API_KEY'
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
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
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
    workspaceRoot = path.dirname(fullFilePath)
    console.log('[Compiler] No workspace set, using file directory:', workspaceRoot)
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
      workspaceRoot: options.workspaceRoot || (options.filePath ? path.dirname(options.filePath) : null),
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
// Reads dependencies from prompd.json and installs each one to .prompd/cache/
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

    return {
      success: failed.length === 0,
      message: `Installed ${installed.length} of ${depEntries.length} packages`,
      installed,
      failed: failed.length > 0 ? failed : undefined
    }

  } catch (error) {
    console.error('[Package] Install all failed:', error)
    return {
      success: false,
      error: error.message || 'Installation failed'
    }
  }
})

// ============================================================================
// Trigger Service IPC Handlers
// ============================================================================

/**
 * Register a workflow trigger
 * Called when user saves a workflow with trigger configuration
 */
ipcMain.handle('trigger:register', async (_event, config) => {
  return triggerService.register(config)
})

/**
 * Unregister a workflow trigger
 */
ipcMain.handle('trigger:unregister', async (_event, workflowId) => {
  return triggerService.unregister(workflowId)
})

/**
 * Enable or disable a trigger
 */
ipcMain.handle('trigger:setEnabled', async (_event, workflowId, enabled) => {
  return triggerService.setEnabled(workflowId, enabled)
})

/**
 * Get all registered triggers
 */
ipcMain.handle('trigger:list', async () => {
  return triggerService.list()
})

/**
 * Get trigger status for a specific workflow
 */
ipcMain.handle('trigger:status', async (_event, workflowId) => {
  return triggerService.getStatus(workflowId)
})

/**
 * Get execution history
 */
ipcMain.handle('trigger:history', async (_event, workflowId, limit) => {
  return triggerService.getHistory(workflowId, limit)
})

/**
 * Get webhook server info
 */
ipcMain.handle('trigger:webhookServerInfo', async () => {
  return triggerService.getWebhookServerInfo()
})

/**
 * Get tray state summary
 */
ipcMain.handle('trigger:trayState', async () => {
  return triggerService.getTrayState()
})

/**
 * Update trigger service settings
 */
ipcMain.handle('trigger:updateSettings', async (_event, settings) => {
  await triggerService.updateSettings(settings)
  return { success: true }
})

/**
 * Open file picker to add a workflow to trigger service
 * Returns the workflow's trigger configuration for the UI to edit
 */
ipcMain.handle('trigger:addWorkflow', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Workflow to Add',
    properties: ['openFile'],
    filters: [
      { name: 'Prompd Workflow', extensions: ['pdflow'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  const workflowPath = filePaths[0]

  try {
    // Read and parse the workflow
    const content = await fs.promises.readFile(workflowPath, 'utf-8')

    if (!content || content.trim() === '') {
      return {
        success: false,
        error: 'Workflow file is empty'
      }
    }

    const workflow = JSON.parse(content)

    // Find the trigger node
    const triggerNode = workflow.nodes?.find(n => n.type === 'trigger')

    if (!triggerNode) {
      return {
        success: false,
        error: 'Workflow does not have a trigger node'
      }
    }

    // Extract trigger config from node data
    const triggerData = triggerNode.data || {}

    return {
      success: true,
      workflowPath,
      workflowName: workflow.metadata?.name || path.basename(workflowPath, '.pdflow'),
      workflowId: workflow.metadata?.id || path.basename(workflowPath, '.pdflow'),
      triggerConfig: {
        triggerType: triggerData.triggerType || 'manual',
        // Schedule config
        scheduleType: triggerData.scheduleType,
        scheduleCron: triggerData.scheduleCron,
        scheduleIntervalMs: triggerData.scheduleIntervalMs,
        scheduleTimezone: triggerData.scheduleTimezone,
        scheduleEnabled: triggerData.scheduleEnabled,
        // Webhook config
        webhookPath: triggerData.webhookPath,
        webhookSecret: triggerData.webhookSecret,
        webhookMethods: triggerData.webhookMethods,
        webhookRequireAuth: triggerData.webhookRequireAuth,
        // File watch config
        fileWatchPaths: triggerData.fileWatchPaths,
        fileWatchEvents: triggerData.fileWatchEvents,
        fileWatchDebounceMs: triggerData.fileWatchDebounceMs,
        fileWatchRecursive: triggerData.fileWatchRecursive,
        // Event config
        eventName: triggerData.eventName,
        eventFilter: triggerData.eventFilter,
      }
    }
  } catch (err) {
    console.error('[Trigger] Failed to read workflow:', err)
    return {
      success: false,
      error: `Failed to read workflow: ${err.message}`
    }
  }
})

/**
 * Manually trigger a workflow (for testing)
 */
ipcMain.handle('trigger:runManually', async (_event, workflowId) => {
  try {
    const result = await triggerService.executeWorkflow(workflowId, {
      triggeredBy: 'manual'
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Scheduler IPC handlers - Persistent workflow scheduling
 */

/**
 * Get all schedules
 */
ipcMain.handle('scheduler:getSchedules', async (_event, filters) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const schedules = trayScheduler.getSchedules(filters || {})
    return { success: true, schedules }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Add a new schedule
 */
ipcMain.handle('scheduler:addSchedule', async (_event, config) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const scheduleId = trayScheduler.addSchedule(config)
    return { success: true, scheduleId }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Update a schedule
 */
ipcMain.handle('scheduler:updateSchedule', async (_event, scheduleId, updates) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const success = trayScheduler.updateSchedule(scheduleId, updates)
    return { success }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Delete a schedule
 */
ipcMain.handle('scheduler:deleteSchedule', async (_event, scheduleId) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const success = trayScheduler.deleteSchedule(scheduleId)
    return { success }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Execute a schedule immediately (manual trigger)
 */
ipcMain.handle('scheduler:executeNow', async (_event, scheduleId) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const result = await trayScheduler.executeScheduleNow(scheduleId)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Get execution history
 */
ipcMain.handle('scheduler:getHistory', async (_event, workflowId, options) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const history = trayScheduler.getExecutionHistory(workflowId, options || {})
    return { success: true, history }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

/**
 * Get next run times for a schedule
 */
ipcMain.handle('scheduler:getNextRunTimes', async (_event, scheduleId, count) => {
  if (!trayScheduler) {
    return { success: false, error: 'Scheduler not initialized' }
  }
  try {
    const times = trayScheduler.getNextRunTimes(scheduleId, count || 5)
    return { success: true, times }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ============================================================================
// Workflow Execution IPC Handlers
// Event-based execution with live updates (single event loop)
// ============================================================================

// Track running executions and pending user input requests
const runningExecutions = new Map()
const pendingUserInputs = new Map() // requestId -> { resolve, reject }

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

      // Build options with event-emitting callbacks
      const executorOptions = {
        ...options,
        onNodeStart: (nodeId) => {
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
        // Bidirectional: Request user input from renderer
        onUserInput: async (request) => {
          const requestId = `input-${Date.now()}-${Math.random().toString(36).substring(7)}`

          // Emit request event
          sender.send('workflow:event', {
            type: 'user-input-request',
            executionId,
            requestId,
            data: request,
            timestamp: Date.now()
          })

          // Wait for response
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
        // Bidirectional: Request checkpoint confirmation from renderer
        onCheckpoint: async (event) => {
          const requestId = `checkpoint-${Date.now()}-${Math.random().toString(36).substring(7)}`

          // Emit request event
          sender.send('workflow:event', {
            type: 'checkpoint-request',
            executionId,
            requestId,
            data: event,
            timestamp: Date.now()
          })

          // Wait for response (boolean: continue or not)
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
        // Local prompt execution through CLI (centralized compilation + execution)
        executePrompt: async (source, promptParams, provider, model) => {
          let tempFilePath = null
          try {
            console.log(`[Workflow Executor] Executing prompt via CLI: ${source}`)

            // Determine file path to execute
            let fileToExecute = source

            if (source.startsWith('./') || source.startsWith('../') || source.startsWith('@')) {
              // File path - resolve to absolute path
              fileToExecute = path.resolve(source)
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
            const apiKey = config.api_keys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`]

            if (!apiKey) {
              throw new Error(`No API key found for provider: ${provider}`)
            }

            // Execute through CLI (centralized compilation + execution)
            const executeResult = await prompdExecutor.execute(fileToExecute, {
              provider: provider || 'openai',
              model: model || 'gpt-4o',
              apiKey,
              params: promptParams
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
        onPromptExecute: async (request) => {
          let tempFilePath = null
          try {
            console.log(`[Workflow Executor] Agent LLM request from node: ${request.nodeId}`)

            // Get API key from config
            const config = await configManager.load()
            const apiKey = config.api_keys?.[request.provider] || process.env[`${request.provider.toUpperCase()}_API_KEY`]

            if (!apiKey) {
              return {
                success: false,
                error: `No API key found for provider: ${request.provider}`
              }
            }

            // Format prompt with system message and conversation history
            let fullPrompt = request.prompt + '\n\n'
            for (const msg of request.messages) {
              if (msg.role === 'user') {
                fullPrompt += `User: ${msg.content}\n\n`
              } else if (msg.role === 'assistant') {
                fullPrompt += `Assistant: ${msg.content}\n\n`
              }
            }
            fullPrompt += 'Assistant:'

            // Write to temp .prmd file (PrompdExecutor requires file path)
            const uniqueId = `agent-prompt-${Date.now()}`
            const promptContent = [
              '---',
              `id: ${uniqueId}`,
              'name: "Agent Prompt"',
              'version: 0.0.1',
              'description: "Chat agent LLM request"',
              '---',
              '',
              fullPrompt
            ].join('\n')

            tempFilePath = path.join(app.getPath('temp'), `${uniqueId}.prmd`)
            await fs.writeFile(tempFilePath, promptContent, 'utf-8')

            // Execute through CLI (centralized compilation + execution)
            const executeResult = await prompdExecutor.execute(tempFilePath, {
              provider: request.provider || 'openai',
              model: request.model || 'gpt-4o',
              apiKey,
              params: {}
            })

            // Clean up temp file
            await fs.unlink(tempFilePath).catch(() => {})

            return {
              success: true,
              response: executeResult.response || executeResult.content || ''
            }
          } catch (err) {
            // Clean up temp file on error
            if (tempFilePath) {
              await fs.unlink(tempFilePath).catch(() => {})
            }
            console.error('[Workflow Executor] onPromptExecute failed:', err)
            return {
              success: false,
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
 * Download execution trace to file
 * trace: ExecutionTrace object
 * filename: Optional custom filename
 */
ipcMain.handle('workflow:downloadTrace', async (_event, trace, filename) => {
  try {
    // Dynamic import @prompd/cli in main process
    const { downloadTrace } = await import('@prompd/cli')

    // Download trace
    await downloadTrace(trace, filename)
  } catch (err) {
    console.error('[Workflow Executor] Download trace failed:', err)
    throw err
  }
})

// ============================================================================
// Service Management IPC Handlers
// For controlling standalone scheduler service (separate Node.js process)
// ============================================================================

/**
 * Start the standalone scheduler service
 */
ipcMain.handle('service:start', async () => {
  try {
    // Check if service is already running
    const status = await checkServiceHealth()
    if (status.running) {
      return {
        success: false,
        error: 'Service is already running',
        message: `Service running on port ${status.port}`
      }
    }

    // Start service process
    const { spawn } = require('child_process')
    const servicePath = path.join(__dirname, '../../prompd-service/src/server.js')

    // Check if service path exists
    if (!fs.existsSync(servicePath)) {
      return {
        success: false,
        error: 'Service not found',
        message: 'prompd-service not installed. Please run: cd prompd-service && npm install'
      }
    }

    // Spawn service process (detached so it continues running)
    const serviceProcess = spawn('node', [servicePath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(servicePath)
    })

    serviceProcess.unref() // Allow parent to exit independently

    // Wait a moment for service to start
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Verify service started
    const newStatus = await checkServiceHealth()
    if (newStatus.running) {
      return {
        success: true,
        message: `Service started on port ${newStatus.port}`
      }
    } else {
      return {
        success: false,
        error: 'Service failed to start',
        message: 'Check service logs for details'
      }
    }

  } catch (err) {
    console.error('[Service] Start failed:', err)
    return {
      success: false,
      error: err.message,
      message: 'Failed to start service'
    }
  }
})

/**
 * Stop the standalone scheduler service
 */
ipcMain.handle('service:stop', async () => {
  try {
    // Call service shutdown endpoint
    const config = await loadServiceConfig()
    const serviceUrl = `http://${config.host}:${config.port}`

    const response = await fetch(`${serviceUrl}/api/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    if (response.ok) {
      return {
        success: true,
        message: 'Service stopped successfully'
      }
    } else {
      return {
        success: false,
        error: `Service responded with status ${response.status}`,
        message: 'Failed to stop service'
      }
    }

  } catch (err) {
    console.error('[Service] Stop failed:', err)
    return {
      success: false,
      error: err.message,
      message: 'Failed to stop service (may already be stopped)'
    }
  }
})

/**
 * Restart the standalone scheduler service
 */
ipcMain.handle('service:restart', async () => {
  try {
    // Stop the service first
    const stopResult = await ipcMain.handle('service:stop', async () => {})()

    // Wait for service to fully shut down
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Start the service again
    const startResult = await ipcMain.handle('service:start', async () => {})()

    if (startResult.success) {
      return {
        success: true,
        message: 'Service restarted successfully'
      }
    } else {
      return {
        success: false,
        error: startResult.error,
        message: 'Failed to restart service'
      }
    }

  } catch (err) {
    console.error('[Service] Restart failed:', err)
    return {
      success: false,
      error: err.message,
      message: 'Failed to restart service'
    }
  }
})

/**
 * Get service status
 */
ipcMain.handle('service:getStatus', async () => {
  try {
    const status = await checkServiceHealth()
    return {
      success: true,
      running: status.running,
      port: status.port,
      uptime: status.uptime
    }
  } catch (err) {
    return {
      success: false,
      running: false,
      error: err.message
    }
  }
})

/**
 * Save service configuration
 */
ipcMain.handle('service:saveConfig', async (_event, config) => {
  try {
    const configPath = getServiceConfigPath()
    const configDir = path.dirname(configPath)

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Write config to JSON file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    return {
      success: true,
      path: configPath
    }
  } catch (err) {
    console.error('[Service] Save config failed:', err)
    return {
      success: false,
      error: err.message
    }
  }
})

/**
 * Load service configuration
 */
ipcMain.handle('service:loadConfig', async () => {
  try {
    const config = await loadServiceConfig()
    return {
      success: true,
      config
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
})

// ============================================================================
// Service Helper Functions
// ============================================================================

/**
 * Get path to service config file
 */
function getServiceConfigPath() {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, '.prompd', 'service-config.json')
}

/**
 * Load service configuration with defaults
 */
async function loadServiceConfig() {
  const configPath = getServiceConfigPath()

  const defaultConfig = {
    port: 9876,
    host: '127.0.0.1',
    enableWebhooks: true,
    dbPath: path.join(app.getPath('userData'), '.prompd', 'scheduler', 'schedules.db')
  }

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      return { ...defaultConfig, ...config }
    }
  } catch (err) {
    console.error('[Service] Failed to load config:', err)
  }

  return defaultConfig
}

/**
 * Check if service is running by hitting health endpoint
 */
async function checkServiceHealth() {
  const config = await loadServiceConfig()
  const serviceUrl = `http://${config.host}:${config.port}`

  try {
    const response = await fetch(`${serviceUrl}/health`, {
      signal: AbortSignal.timeout(2000)
    })

    if (response.ok) {
      const data = await response.json()
      return {
        running: true,
        port: config.port,
        uptime: data.uptime,
        activeSchedules: data.activeSchedules
      }
    }
  } catch (err) {
    // Service not responding
  }

  return { running: false }
}
