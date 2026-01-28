/**
 * Tray Manager - System tray icon and context menu for Prompd
 *
 * Provides background workflow trigger management with:
 * - Status indicator in system tray
 * - Context menu for quick actions
 * - Cross-platform support (Windows, macOS, Linux)
 */

const { Tray, Menu, nativeImage, Notification, app } = require('electron')
const path = require('path')
const EventEmitter = require('events')

/**
 * @typedef {Object} TrayState
 * @property {number} activeWorkflows - Number of running workflows
 * @property {number} scheduledTriggers - Number of scheduled triggers
 * @property {number} fileWatchers - Number of active file watchers
 * @property {boolean} webhookServerRunning - Whether webhook server is active
 * @property {number} [webhookPort] - Webhook server port if running
 * @property {string} [nextScheduledRun] - ISO timestamp of next scheduled run
 * @property {string} [lastError] - Last error message if any
 */

class TrayManager extends EventEmitter {
  constructor() {
    super()
    /** @type {Tray | null} */
    this.tray = null
    /** @type {TrayState} */
    this.state = {
      activeWorkflows: 0,
      scheduledTriggers: 0,
      fileWatchers: 0,
      webhookServerRunning: false,
      webhookPort: undefined,
      nextScheduledRun: undefined,
      lastError: undefined,
    }
    this.mainWindow = null
    this.isQuitting = false
  }

  /**
   * Initialize the system tray
   * @param {Electron.BrowserWindow} mainWindow - Main application window
   */
  init(mainWindow) {
    this.mainWindow = mainWindow

    // Get the appropriate icon for the platform
    const icon = this.getIcon()
    this.tray = new Tray(icon)

    // Set tooltip
    this.tray.setToolTip('Prompd - Workflow Automation')

    // Build initial context menu
    this.updateMenu()

    // Platform-specific click behavior
    if (process.platform !== 'darwin') {
      // Windows/Linux: left-click shows/hides main window
      this.tray.on('click', () => {
        this.toggleMainWindow()
      })
    }

    // Handle double-click to show window
    this.tray.on('double-click', () => {
      this.showMainWindow()
    })

    console.log('[Tray] Initialized')
  }

  /**
   * Get the appropriate icon for the current platform
   * @returns {Electron.NativeImage}
   */
  getIcon() {
    let iconPath

    if (app.isPackaged) {
      // In production, icons are in resources folder
      const resourcesPath = process.resourcesPath
      if (process.platform === 'win32') {
        iconPath = path.join(resourcesPath, 'logo.ico')
      } else {
        iconPath = path.join(resourcesPath, 'logo.png')
      }
    } else {
      // In development, use public folder
      const publicPath = path.join(__dirname, '..', 'public')
      if (process.platform === 'win32') {
        iconPath = path.join(publicPath, 'logo.ico')
      } else {
        iconPath = path.join(publicPath, 'logo.png')
      }
    }

    const icon = nativeImage.createFromPath(iconPath)

    // macOS: Use template image for menu bar
    if (process.platform === 'darwin') {
      // Resize for menu bar (16x16 or 22x22)
      const resized = icon.resize({ width: 16, height: 16 })
      resized.setTemplateImage(true)
      return resized
    }

    // Windows/Linux: Use 16x16 for tray
    return icon.resize({ width: 16, height: 16 })
  }

  /**
   * Update the context menu based on current state
   */
  updateMenu() {
    if (!this.tray) return

    const menuTemplate = [
      // Status section
      {
        label: this.getStatusLabel(),
        enabled: false,
      },
      { type: 'separator' },

      // Active triggers info
      {
        label: `Scheduled: ${this.state.scheduledTriggers}`,
        enabled: false,
      },
      {
        label: `File Watchers: ${this.state.fileWatchers}`,
        enabled: false,
      },
      {
        label: this.state.webhookServerRunning
          ? `Webhooks: :${this.state.webhookPort}`
          : 'Webhooks: Off',
        enabled: false,
      },
      { type: 'separator' },

      // Quick actions
      {
        label: 'Open Prompd',
        click: () => this.showMainWindow(),
      },
      {
        label: 'View Active Workflows',
        click: () => {
          this.showMainWindow()
          this.emit('show-workflows')
        },
        enabled: this.state.activeWorkflows > 0,
      },
      { type: 'separator' },

      // Trigger controls
      {
        label: 'Triggers',
        submenu: [
          {
            label: 'Pause All Schedules',
            click: () => this.emit('pause-all-schedules'),
            enabled: this.state.scheduledTriggers > 0,
          },
          {
            label: 'Resume All Schedules',
            click: () => this.emit('resume-all-schedules'),
          },
          { type: 'separator' },
          {
            label: 'Stop File Watchers',
            click: () => this.emit('stop-all-file-watchers'),
            enabled: this.state.fileWatchers > 0,
          },
          {
            label: 'Restart File Watchers',
            click: () => this.emit('restart-all-file-watchers'),
          },
          { type: 'separator' },
          {
            label: this.state.webhookServerRunning
              ? 'Stop Webhook Server'
              : 'Start Webhook Server',
            click: () => this.emit('toggle-webhook-server'),
          },
        ],
      },
      { type: 'separator' },

      // Settings
      {
        label: 'Settings',
        submenu: [
          {
            label: 'Notifications',
            type: 'checkbox',
            checked: true, // Will be managed by triggerService
            click: (menuItem) => this.emit('toggle-notifications', menuItem.checked),
          },
          {
            label: 'Start on Login',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (menuItem) => {
              app.setLoginItemSettings({
                openAtLogin: menuItem.checked,
                openAsHidden: true, // Start minimized to tray
              })
            },
          },
          {
            label: 'Minimize to Tray on Close',
            type: 'checkbox',
            checked: true, // Will be managed by config
            click: (menuItem) => this.emit('toggle-minimize-to-tray', menuItem.checked),
          },
        ],
      },
      { type: 'separator' },

      // Quit
      {
        label: 'Quit Prompd',
        click: () => {
          this.isQuitting = true
          app.quit()
        },
      },
    ]

    const contextMenu = Menu.buildFromTemplate(menuTemplate)
    this.tray.setContextMenu(contextMenu)
  }

  /**
   * Get status label for tray menu
   * @returns {string}
   */
  getStatusLabel() {
    if (this.state.activeWorkflows > 0) {
      return `Running ${this.state.activeWorkflows} workflow${this.state.activeWorkflows > 1 ? 's' : ''}`
    }
    if (this.state.nextScheduledRun) {
      const next = new Date(this.state.nextScheduledRun)
      const now = new Date()
      const diffMs = next.getTime() - now.getTime()
      const diffMins = Math.round(diffMs / 60000)

      if (diffMins < 1) {
        return 'Next run: <1 min'
      } else if (diffMins < 60) {
        return `Next run: ${diffMins} min`
      } else {
        const hours = Math.floor(diffMins / 60)
        return `Next run: ${hours}h ${diffMins % 60}m`
      }
    }
    return 'Idle'
  }

  /**
   * Update tray state and refresh menu
   * @param {Partial<TrayState>} newState
   */
  setState(newState) {
    this.state = { ...this.state, ...newState }
    this.updateMenu()
    this.updateTooltip()
  }

  /**
   * Update tray tooltip based on state
   */
  updateTooltip() {
    if (!this.tray) return

    const parts = ['Prompd']

    if (this.state.activeWorkflows > 0) {
      parts.push(`${this.state.activeWorkflows} running`)
    }
    if (this.state.scheduledTriggers > 0) {
      parts.push(`${this.state.scheduledTriggers} scheduled`)
    }
    if (this.state.fileWatchers > 0) {
      parts.push(`${this.state.fileWatchers} watchers`)
    }
    if (this.state.webhookServerRunning) {
      parts.push(`webhooks :${this.state.webhookPort}`)
    }

    this.tray.setToolTip(parts.join(' - '))
  }

  /**
   * Show notification
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.body
   * @param {'success' | 'error' | 'info'} [options.type='info']
   * @param {string} [options.executionId]
   */
  showNotification({ title, body, type = 'info', executionId }) {
    // Check if notifications are supported and enabled
    if (!Notification.isSupported()) {
      console.log('[Tray] Notifications not supported')
      return
    }

    const notification = new Notification({
      title,
      body,
      icon: this.getIcon(),
      silent: type === 'info',
    })

    notification.on('click', () => {
      this.showMainWindow()
      if (executionId) {
        this.emit('show-execution', executionId)
      }
    })

    notification.show()
  }

  /**
   * Show the main window
   */
  showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * Hide the main window (minimize to tray)
   */
  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide()
    }
  }

  /**
   * Toggle main window visibility
   */
  toggleMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideMainWindow()
      } else {
        this.showMainWindow()
      }
    }
  }

  /**
   * Check if app is quitting (vs minimizing to tray)
   * @returns {boolean}
   */
  isAppQuitting() {
    return this.isQuitting
  }

  /**
   * Set quitting state
   * @param {boolean} quitting
   */
  setQuitting(quitting) {
    this.isQuitting = quitting
  }

  /**
   * Destroy the tray
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}

// Export singleton instance
const trayManager = new TrayManager()

module.exports = {
  trayManager,
  TrayManager,
}
