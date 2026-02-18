import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Server, Play, Square, Copy, Check, Key, Eye, EyeOff,
  RefreshCw, Shield, Wrench, Users, AlertCircle, Loader
} from 'lucide-react'
import './McpServerSettings.css'

interface McpServerStatus {
  running: boolean
  port: number
  url: string | null
  apiKey: string
  workspacePath: string | null
  toolCount: number
}

interface McpClient {
  ip: string
  userAgent: string
  lastSeen: string
  requestCount: number
}

interface McpServerSettingsProps {
  colors: {
    bgPrimary: string
    bgSecondary: string
    border: string
    text: string
    textSecondary: string
    textMuted: string
    primary: string
    success: string
    error: string
    infoBg: string
    infoBorder: string
  }
}

const TOOLS = [
  { name: 'workspace_list_files', desc: 'List .prmd and .pdflow files in the workspace' },
  { name: 'workspace_compile', desc: 'Compile a .prmd file with parameter substitution' },
  { name: 'workspace_read_file', desc: 'Read raw contents of a workspace file' },
  { name: 'deployment_list', desc: 'List all workflow deployments and their status' },
  { name: 'deployment_execute', desc: 'Trigger execution of a deployed workflow' },
  { name: 'deployment_status', desc: 'Get deployment status and recent execution history' },
  { name: 'connections_list', desc: 'List configured connections (DB, SSH, API, MCP)' },
]

export function McpServerSettings({ colors }: McpServerSettingsProps) {
  const [status, setStatus] = useState<McpServerStatus | null>(null)
  const [clients, setClients] = useState<McpClient[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [port, setPort] = useState(18791)
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [autoStart, setAutoStart] = useState(false)
  const [configFormat, setConfigFormat] = useState<'openclaw' | 'claude-desktop'>('openclaw')
  const [configJson, setConfigJson] = useState<string>('')
  const [confirmRegen, setConfirmRegen] = useState(false)

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI?.mcpServer?.status()
      if (result?.success) {
        setStatus({
          running: result.running ?? false,
          port: result.port ?? 18791,
          url: result.url ?? null,
          apiKey: result.apiKey ?? '',
          workspacePath: result.workspacePath ?? null,
          toolCount: result.toolCount ?? 0,
        })
        if (!actionInProgress) {
          setPort(result.port ?? 18791)
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [actionInProgress])

  const fetchClients = useCallback(async () => {
    try {
      const result = await window.electronAPI?.mcpServer?.getClients()
      if (result?.success && result.clients) {
        setClients(result.clients)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadAutoStart = useCallback(async () => {
    try {
      const result = await window.electronAPI?.config?.load()
      if (result?.success && result.config) {
        setAutoStart(result.config.services?.mcp_server?.auto_start ?? false)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await fetchStatus()
      await fetchClients()
      await loadAutoStart()
      setLoading(false)
    }
    init()

    const interval = setInterval(() => {
      fetchStatus()
      fetchClients()
    }, 5000)
    return () => {
      clearInterval(interval)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [fetchStatus, fetchClients, loadAutoStart])

  const fetchConfig = useCallback(async () => {
    if (!status?.running) {
      setConfigJson('')
      return
    }
    try {
      const result = await window.electronAPI?.mcpServer?.getConfig(configFormat)
      if (result?.success && result.config) {
        setConfigJson(JSON.stringify(result.config, null, 2))
      }
    } catch {
      setConfigJson('')
    }
  }, [status?.running, configFormat])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const showCopiedFeedback = (key: string) => {
    setCopied(key)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), 2000)
  }

  const persistMcpConfig = async (apiKey?: string) => {
    try {
      const result = await window.electronAPI?.config?.load()
      const config = result?.config ?? {}
      if (!config.services) config.services = {}
      config.services.mcp_server = {
        ...config.services.mcp_server,
        port,
        ...(apiKey ? { api_key: apiKey } : {}),
      }
      await window.electronAPI?.config?.save(config, 'global')
    } catch {
      // non-critical
    }
  }

  const handleStart = async () => {
    setActionInProgress('start')
    setError(null)
    try {
      const result = await window.electronAPI?.mcpServer?.start({ port })
      if (!result?.success) {
        setError(result?.error ?? 'Failed to start MCP server')
      } else if (result.apiKey) {
        await persistMcpConfig(result.apiKey)
      }
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStop = async () => {
    setActionInProgress('stop')
    setError(null)
    try {
      const result = await window.electronAPI?.mcpServer?.stop()
      if (!result?.success) {
        setError(result?.error ?? 'Failed to stop MCP server')
      }
      await fetchStatus()
      setClients([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleAutoStartToggle = async () => {
    const newValue = !autoStart
    setAutoStart(newValue)
    try {
      const result = await window.electronAPI?.config?.load()
      const config = result?.config ?? {}
      if (!config.services) config.services = {}
      config.services.mcp_server = {
        ...config.services.mcp_server,
        auto_start: newValue,
        port,
      }
      await window.electronAPI?.config?.save(config, 'global')
    } catch {
      setAutoStart(!newValue)
    }
  }

  const handleRegenerateApiKey = async () => {
    if (!confirmRegen) {
      setConfirmRegen(true)
      return
    }
    setConfirmRegen(false)
    setActionInProgress('regen')
    setError(null)
    try {
      const result = await window.electronAPI?.mcpServer?.regenerateApiKey()
      if (!result?.success) {
        setError(result?.error ?? 'Failed to regenerate API key')
      } else if (result.apiKey) {
        await persistMcpConfig(result.apiKey)
      }
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setActionInProgress(null)
    }
  }

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showCopiedFeedback(key)
    } catch {
      // fallback
    }
  }

  const maskApiKey = (key: string) => {
    if (!key) return ''
    if (key.length <= 8) return '*'.repeat(key.length)
    return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
  }

  if (loading) {
    return (
      <div className="mcp-server-settings" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <Loader size={24} className="spinning" style={{ color: colors.textMuted }} />
      </div>
    )
  }

  const isRunning = status?.running ?? false

  return (
    <div className="mcp-server-settings">
      {/* Header */}
      <div className="mcp-section">
        <div className="mcp-section-header">
          <h3 style={{ color: colors.text }}><Server size={18} /> MCP Server</h3>
          <p className="mcp-section-description">
            Expose workspace tools to external AI agents (OpenClaw, Claude Desktop, etc.) via the Model Context Protocol.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mcp-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Status Card */}
      <div className="mcp-section">
        <div className="mcp-status-card">
          <div className="mcp-status-header">
            <div className="mcp-status-indicator">
              <div className={`mcp-status-dot ${isRunning ? 'running' : 'stopped'}`} />
              <span className="mcp-status-text" style={{ color: colors.text }}>
                {isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
            <div className="mcp-controls">
              <div className="mcp-port-input">
                <label style={{ color: colors.textSecondary }}>Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 18791)}
                  disabled={isRunning}
                  min={1024}
                  max={65535}
                />
              </div>
              {isRunning ? (
                <button
                  className="btn-secondary"
                  onClick={handleStop}
                  disabled={actionInProgress !== null}
                >
                  {actionInProgress === 'stop' ? <Loader size={14} className="spinning" /> : <Square size={14} />}
                  Stop
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleStart}
                  disabled={actionInProgress !== null}
                >
                  {actionInProgress === 'start' ? <Loader size={14} className="spinning" /> : <Play size={14} />}
                  Start
                </button>
              )}
            </div>
          </div>

          {isRunning && status && (
            <div className="mcp-status-details">
              <div className="mcp-detail-item">
                <span className="mcp-detail-label">URL</span>
                <span className="mcp-detail-value">{status.url}</span>
              </div>
              <div className="mcp-detail-item">
                <span className="mcp-detail-label">Workspace</span>
                <span className="mcp-detail-value" style={{ fontFamily: 'inherit' }}>
                  {status.workspacePath || 'None'}
                </span>
              </div>
              <div className="mcp-detail-item">
                <span className="mcp-detail-label">Tools</span>
                <span className="mcp-detail-value">{status.toolCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Start Toggle */}
      <div className="mcp-section">
        <div className="mcp-toggle-row">
          <div className="mcp-toggle-info">
            <span className="mcp-toggle-label" style={{ color: colors.text }}>Auto-start on launch</span>
            <span className="mcp-toggle-description">
              Start the MCP server automatically when Prompd opens
            </span>
          </div>
          <button
            className={`mcp-toggle-switch ${autoStart ? 'on' : 'off'}`}
            onClick={handleAutoStartToggle}
          >
            <div className={`mcp-toggle-knob ${autoStart ? 'on' : 'off'}`} />
          </button>
        </div>
      </div>

      {/* Authentication */}
      <div className="mcp-section">
        <div className="mcp-section-header">
          <h3 style={{ color: colors.text }}><Shield size={16} /> Authentication</h3>
          <p className="mcp-section-description">
            Bearer token required by external clients to connect. Included automatically in copied configs.
          </p>
        </div>
        <div className="mcp-api-key-row">
          <Key size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
          <span className="mcp-api-key-value" style={{ color: colors.text }}>
            {status?.apiKey
              ? (showApiKey ? status.apiKey : maskApiKey(status.apiKey))
              : 'No key generated yet — start the server'
            }
          </span>
          {status?.apiKey && (
            <>
              <button
                className="btn-icon"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide' : 'Show'}
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                className="btn-icon"
                onClick={() => copyToClipboard(status.apiKey, 'apiKey')}
                title="Copy API key"
              >
                {copied === 'apiKey' ? <Check size={14} style={{ color: colors.success }} /> : <Copy size={14} />}
              </button>
              <button
                className={confirmRegen ? 'btn-danger' : 'btn-icon'}
                onClick={handleRegenerateApiKey}
                disabled={actionInProgress === 'regen'}
                title="Regenerate API key"
                style={confirmRegen ? { fontSize: 12 } : undefined}
              >
                {actionInProgress === 'regen'
                  ? <Loader size={14} className="spinning" />
                  : confirmRegen
                    ? 'Confirm?'
                    : <RefreshCw size={14} />
                }
              </button>
            </>
          )}
        </div>
      </div>

      {/* Connection Config */}
      <div className="mcp-section">
        <div className="mcp-section-header">
          <h3 style={{ color: colors.text }}><Copy size={16} /> Connection Config</h3>
          <p className="mcp-section-description">
            Copy this JSON into your MCP client configuration to connect.
          </p>
        </div>

        {isRunning ? (
          <>
            <div className="mcp-config-tabs">
              <button
                className={`mcp-config-tab ${configFormat === 'openclaw' ? 'active' : ''}`}
                onClick={() => setConfigFormat('openclaw')}
              >
                OpenClaw
              </button>
              <button
                className={`mcp-config-tab ${configFormat === 'claude-desktop' ? 'active' : ''}`}
                onClick={() => setConfigFormat('claude-desktop')}
              >
                Claude Desktop
              </button>
            </div>
            <div className="mcp-config-block">
              <pre className="mcp-config-pre">{configJson || 'Loading...'}</pre>
              {configJson && (
                <button
                  className="btn-icon mcp-config-copy-btn"
                  onClick={() => copyToClipboard(configJson, 'config')}
                  title="Copy config"
                >
                  {copied === 'config' ? <Check size={14} style={{ color: colors.success }} /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mcp-empty-state">
            Start the server to generate connection configuration.
          </div>
        )}
      </div>

      {/* Available Tools */}
      <div className="mcp-section">
        <div className="mcp-section-header">
          <h3 style={{ color: colors.text }}><Wrench size={16} /> Available Tools ({TOOLS.length})</h3>
          <p className="mcp-section-description">
            These tools are exposed to connected MCP clients.
          </p>
        </div>
        <div className="mcp-tool-list">
          {TOOLS.map(tool => (
            <div key={tool.name} className="mcp-tool-item">
              <span className="mcp-tool-name">{tool.name}</span>
              <span className="mcp-tool-desc">{tool.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Connected Clients */}
      <div className="mcp-section">
        <div className="mcp-section-header">
          <h3 style={{ color: colors.text }}><Users size={16} /> Connected Clients</h3>
          <p className="mcp-section-description">
            MCP clients that have connected in the last 5 minutes.
          </p>
        </div>
        {clients.length > 0 ? (
          <div className="mcp-client-list">
            {clients.map((client, i) => (
              <div key={`${client.ip}-${i}`} className="mcp-client-item">
                <div className="mcp-client-info">
                  <span className="mcp-client-ip">{client.ip}</span>
                  <span className="mcp-client-agent">{client.userAgent}</span>
                </div>
                <div className="mcp-client-meta">
                  <span>{client.requestCount} request{client.requestCount !== 1 ? 's' : ''}</span>
                  <span>{new Date(client.lastSeen).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mcp-empty-state">
            {isRunning
              ? 'No clients connected yet. Connect an MCP client to see it here.'
              : 'Start the server to accept client connections.'
            }
          </div>
        )}
      </div>
    </div>
  )
}
