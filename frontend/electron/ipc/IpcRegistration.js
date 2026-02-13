/**
 * IpcRegistration — Modular IPC handler registration interface
 *
 * Each IPC module implements this interface to register its handlers
 * and optionally provide cleanup on app quit.
 *
 * Usage in main.js:
 *   const modules = [new McpIpcRegistration(), ...]
 *   modules.forEach(m => m.register(ipcMain))
 *   app.on('before-quit', async () => {
 *     for (const m of modules) { if (m.cleanup) await m.cleanup() }
 *   })
 *
 * @typedef {Object} IpcRegistration
 * @property {string} name - Module name for logging
 * @property {(ipcMain: Electron.IpcMain) => void} register - Register all IPC handlers
 * @property {() => Promise<void>} [cleanup] - Optional cleanup on app quit
 */

/**
 * Base class for IPC registration modules.
 * Extend this class to create a new IPC module.
 */
class BaseIpcRegistration {
  /**
   * @param {string} name - Module name (used for logging)
   */
  constructor(name) {
    this.name = name
  }

  /**
   * Register all IPC handlers for this module.
   * @param {Electron.IpcMain} _ipcMain
   */
  register(_ipcMain) {
    throw new Error(`${this.name}: register() must be implemented`)
  }

  /**
   * Optional cleanup on app quit.
   * @returns {Promise<void>}
   */
  async cleanup() {
    // No-op by default — override in subclass if needed
  }
}

module.exports = { BaseIpcRegistration }
