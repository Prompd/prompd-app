/**
 * McpIpcRegistration — IPC handlers for all mcp:* channels
 *
 * Handles: mcp:listServers, mcp:addServer, mcp:removeServer,
 *          mcp:connect, mcp:disconnect, mcp:listTools, mcp:callTool,
 *          mcp:searchRegistry
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const mcpService = require('../services/mcpService')

class McpIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('MCP')
  }

  /**
   * Register all MCP IPC handlers.
   * @param {Electron.IpcMain} ipcMain
   */
  register(ipcMain) {
    // List all configured MCP servers with status
    ipcMain.handle('mcp:listServers', async () => {
      try {
        const servers = mcpService.listServers()
        return { success: true, servers }
      } catch (err) {
        console.error('[MCP IPC] listServers error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Add a new MCP server to config
    ipcMain.handle('mcp:addServer', async (_event, name, config) => {
      try {
        if (!name || typeof name !== 'string') {
          return { success: false, error: 'Server name is required' }
        }
        if (!config || typeof config !== 'object') {
          return { success: false, error: 'Server config is required' }
        }
        mcpService.addServer(name, config)
        return { success: true }
      } catch (err) {
        console.error('[MCP IPC] addServer error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Remove an MCP server from config and disconnect
    ipcMain.handle('mcp:removeServer', async (_event, name) => {
      try {
        if (!name || typeof name !== 'string') {
          return { success: false, error: 'Server name is required' }
        }
        await mcpService.removeServer(name)
        return { success: true }
      } catch (err) {
        console.error('[MCP IPC] removeServer error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Connect to an MCP server (spawns process or opens HTTP connection)
    ipcMain.handle('mcp:connect', async (_event, serverName) => {
      try {
        if (!serverName || typeof serverName !== 'string') {
          return { success: false, error: 'Server name is required' }
        }
        const result = await mcpService.connect(serverName)
        return {
          success: true,
          tools: result.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.inputSchema || {},
          })),
        }
      } catch (err) {
        console.error('[MCP IPC] connect error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Disconnect from an MCP server
    ipcMain.handle('mcp:disconnect', async (_event, serverName) => {
      try {
        if (!serverName || typeof serverName !== 'string') {
          return { success: false, error: 'Server name is required' }
        }
        await mcpService.disconnect(serverName)
        return { success: true }
      } catch (err) {
        console.error('[MCP IPC] disconnect error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // List tools available on an MCP server (connects if needed)
    ipcMain.handle('mcp:listTools', async (_event, serverName) => {
      try {
        if (!serverName || typeof serverName !== 'string') {
          return { success: false, error: 'Server name is required' }
        }
        const tools = await mcpService.listTools(serverName)
        return {
          success: true,
          tools: tools.map(t => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.inputSchema || {},
          })),
        }
      } catch (err) {
        console.error('[MCP IPC] listTools error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Call a tool on an MCP server
    ipcMain.handle('mcp:callTool', async (_event, serverName, toolName, args) => {
      try {
        if (!serverName || typeof serverName !== 'string') {
          return { success: false, error: 'Server name is required' }
        }
        if (!toolName || typeof toolName !== 'string') {
          return { success: false, error: 'Tool name is required' }
        }
        const result = await mcpService.callTool(serverName, toolName, args || {})
        return { success: true, result }
      } catch (err) {
        console.error('[MCP IPC] callTool error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Search the official MCP registry
    ipcMain.handle('mcp:searchRegistry', async (_event, query, limit) => {
      try {
        if (!query || typeof query !== 'string') {
          return { success: false, error: 'Search query is required' }
        }
        const result = await mcpService.searchRegistry(query, limit)
        return result
      } catch (err) {
        console.error('[MCP IPC] searchRegistry error:', err.message)
        return { success: false, error: err.message }
      }
    })

    console.log('[MCP IPC] Registered 8 handlers')
  }

  /**
   * Cleanup on app quit — disconnect all MCP connections.
   */
  async cleanup() {
    await mcpService.disconnectAll()
  }
}

module.exports = { McpIpcRegistration }
