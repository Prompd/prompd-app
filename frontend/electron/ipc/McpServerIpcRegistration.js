/**
 * McpServerIpcRegistration — IPC handlers for the MCP Server (Prompd-as-server)
 *
 * Handles: mcpServer:start, mcpServer:stop, mcpServer:status, mcpServer:getConfig
 *
 * This is separate from McpIpcRegistration which handles Prompd-as-MCP-client.
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const { mcpServerService } = require('../services/mcpServerService')

class McpServerIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('MCP-Server')
  }

  /**
   * Register all MCP Server IPC handlers.
   * @param {Electron.IpcMain} ipcMain
   */
  register(ipcMain) {
    // Start the MCP HTTP server
    ipcMain.handle('mcpServer:start', async (_event, opts = {}) => {
      try {
        await mcpServerService.start(opts)
        return { success: true, ...mcpServerService.getInfo() }
      } catch (err) {
        console.error('[MCP-Server IPC] start error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Stop the MCP HTTP server
    ipcMain.handle('mcpServer:stop', async () => {
      try {
        await mcpServerService.stop()
        return { success: true }
      } catch (err) {
        console.error('[MCP-Server IPC] stop error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Get server status/info
    ipcMain.handle('mcpServer:status', async () => {
      try {
        return { success: true, ...mcpServerService.getInfo() }
      } catch (err) {
        console.error('[MCP-Server IPC] status error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Get config snippet for external tools (OpenClaw, Claude Desktop)
    ipcMain.handle('mcpServer:getConfig', async (_event, format = 'openclaw') => {
      try {
        const info = mcpServerService.getInfo()
        if (!info.running) {
          return {
            success: false,
            error: 'MCP server is not running. Start it first.',
          }
        }

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

        return { success: true, config, format }
      } catch (err) {
        console.error('[MCP-Server IPC] getConfig error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Regenerate API key (restart with new key if running)
    ipcMain.handle('mcpServer:regenerateApiKey', async () => {
      try {
        const crypto = require('crypto')
        const wasRunning = mcpServerService.isRunning
        const currentPort = mcpServerService.port
        if (wasRunning) {
          await mcpServerService.stop()
        }
        const newApiKey = crypto.randomBytes(24).toString('hex')
        mcpServerService.apiKey = newApiKey
        if (wasRunning) {
          await mcpServerService.start({ port: currentPort, apiKey: newApiKey })
        }
        return { success: true, apiKey: mcpServerService.apiKey }
      } catch (err) {
        console.error('[MCP-Server IPC] regenerateApiKey error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Get recently connected clients
    ipcMain.handle('mcpServer:getClients', async () => {
      try {
        return { success: true, clients: mcpServerService.getRecentClients() }
      } catch (err) {
        console.error('[MCP-Server IPC] getClients error:', err.message)
        return { success: false, error: err.message }
      }
    })
  }

  async cleanup() {
    if (mcpServerService.isRunning) {
      await mcpServerService.stop()
    }
  }
}

module.exports = { McpServerIpcRegistration }
