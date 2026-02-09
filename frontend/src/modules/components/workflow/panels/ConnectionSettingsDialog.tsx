/**
 * ConnectionSettingsDialog - Edit and test existing connections
 */

import { useState, useCallback } from 'react'
import { X, Server, Database, Globe, MessageSquare, Link2, RefreshCw, Settings, Check, AlertCircle, Loader2, Trash2, Search } from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import type {
  WorkflowConnection,
  WorkflowConnectionType,
  WorkflowConnectionConfig,
  SSHConnectionConfig,
  DatabaseConnectionConfig,
  HttpApiConnectionConfig,
  SlackConnectionConfig,
  GitHubConnectionConfig,
  McpServerConnectionConfig,
  WebSocketConnectionConfig,
  WebSearchConnectionConfig,
} from '../../../services/workflowTypes'

// ============================================================================
// Types
// ============================================================================

interface ConnectionSettingsDialogProps {
  connection: WorkflowConnection
  onClose: () => void
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

// ============================================================================
// Connection Type Metadata
// ============================================================================

const CONNECTION_TYPE_INFO: Record<WorkflowConnectionType, {
  label: string
  icon: typeof Server
  color: string
}> = {
  ssh: { label: 'SSH', icon: Server, color: 'var(--node-purple, #a855f7)' },
  database: { label: 'Database', icon: Database, color: 'var(--node-blue, #3b82f6)' },
  'http-api': { label: 'HTTP API', icon: Globe, color: 'var(--node-emerald, #10b981)' },
  slack: { label: 'Slack', icon: MessageSquare, color: 'var(--node-purple, #a855f7)' },
  github: { label: 'GitHub', icon: Globe, color: 'var(--node-gray, #6b7280)' },
  'mcp-server': { label: 'MCP Server', icon: Link2, color: 'var(--node-cyan, #06b6d4)' },
  websocket: { label: 'WebSocket', icon: RefreshCw, color: 'var(--node-orange, #f97316)' },
  'web-search': { label: 'Web Search', icon: Search, color: 'var(--node-sky, #0ea5e9)' },
  custom: { label: 'Custom', icon: Settings, color: 'var(--muted)' },
}

// ============================================================================
// Styles
// ============================================================================

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const dialogStyle: React.CSSProperties = {
  background: 'var(--panel)',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  width: '500px',
  maxHeight: '80vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid var(--border)',
}

const contentStyle: React.CSSProperties = {
  padding: '20px',
  overflowY: 'auto',
  flex: 1,
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '16px 20px',
  borderTop: '1px solid var(--border)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '13px',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: '4px',
}

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 16px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
}

// ============================================================================
// Test Connection Function
// ============================================================================

async function testConnection(connection: WorkflowConnection): Promise<{ success: boolean; message: string }> {
  // Simulate connection test based on type
  // In production, this would use Electron IPC or backend API
  const config = connection.config

  try {
    switch (connection.type) {
      case 'http-api': {
        const httpConfig = config as HttpApiConnectionConfig
        if (!httpConfig.baseUrl) {
          return { success: false, message: 'Base URL is required' }
        }
        // Try a HEAD request to the base URL
        const response = await fetch(httpConfig.baseUrl, {
          method: 'HEAD',
          mode: 'no-cors', // Avoid CORS issues for testing
        })
        // no-cors mode always returns opaque response, so we can't check status
        // But if fetch doesn't throw, the URL is reachable
        return { success: true, message: 'URL is reachable' }
      }

      case 'websocket': {
        const wsConfig = config as WebSocketConnectionConfig
        if (!wsConfig.url) {
          return { success: false, message: 'WebSocket URL is required' }
        }
        // Try to establish WebSocket connection
        return new Promise((resolve) => {
          const ws = new WebSocket(wsConfig.url)
          const timeout = setTimeout(() => {
            ws.close()
            resolve({ success: false, message: 'Connection timed out' })
          }, 5000)

          ws.onopen = () => {
            clearTimeout(timeout)
            ws.close()
            resolve({ success: true, message: 'WebSocket connection successful' })
          }

          ws.onerror = () => {
            clearTimeout(timeout)
            resolve({ success: false, message: 'Failed to connect to WebSocket' })
          }
        })
      }

      case 'ssh': {
        // Use Electron IPC to test SSH
        if (window.electronAPI?.testSSHConnection) {
          const sshConfig = config as SSHConnectionConfig
          if (!sshConfig.host) {
            return { success: false, message: 'Host is required' }
          }
          const result = await window.electronAPI.testSSHConnection({
            host: sshConfig.host,
            port: sshConfig.port || 22,
            username: sshConfig.username,
          })
          return result
        }
        return { success: false, message: 'SSH testing requires the desktop app' }
      }

      case 'database': {
        // Use Electron IPC to test database
        if (window.electronAPI?.testDatabaseConnection) {
          const dbConfig = config as DatabaseConnectionConfig
          if (!dbConfig.host) {
            return { success: false, message: 'Host is required' }
          }
          const result = await window.electronAPI.testDatabaseConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            type: dbConfig.type,
          })
          return result
        }
        return { success: false, message: 'Database testing requires the desktop app' }
      }

      case 'mcp-server': {
        // Use Electron IPC to test MCP server
        if (window.electronAPI?.testMCPConnection) {
          const mcpConfig = config as McpServerConnectionConfig
          if (!mcpConfig.serverUrl) {
            return { success: false, message: 'Server URL is required' }
          }
          const result = await window.electronAPI.testMCPConnection({
            serverUrl: mcpConfig.serverUrl,
          })
          return result
        }
        return { success: false, message: 'MCP testing requires the desktop app' }
      }

      case 'slack':
      case 'github':
        // OAuth-based connections need API key to test
        return { success: false, message: 'Configure API credentials to test this connection' }

      case 'web-search': {
        const wsConfig = config as WebSearchConnectionConfig
        const provider = wsConfig.provider || 'langsearch'
        if (!wsConfig.apiKey) {
          return { success: false, message: `API key is required for ${provider}` }
        }
        return { success: true, message: `${provider} API key configured` }
      }

      case 'custom':
        return { success: true, message: 'Custom connections cannot be automatically tested' }

      default:
        return { success: false, message: 'Unknown connection type' }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message }
  }
}

// ============================================================================
// Config Forms (simplified for editing)
// ============================================================================

interface ConfigFormProps<T> {
  config: Partial<T>
  onChange: (config: Partial<T>) => void
}

function SSHConfigForm({ config, onChange }: ConfigFormProps<SSHConnectionConfig>) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Host</label>
        <input
          type="text"
          value={config.host || ''}
          onChange={(e) => onChange({ ...config, host: e.target.value })}
          placeholder="example.com"
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Port</label>
          <input
            type="number"
            value={config.port || 22}
            onChange={(e) => onChange({ ...config, port: parseInt(e.target.value) || 22 })}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={config.username || ''}
            onChange={(e) => onChange({ ...config, username: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Auth Method</label>
        <select
          value={config.authMethod || 'key'}
          onChange={(e) => onChange({ ...config, authMethod: e.target.value as 'key' | 'password' | 'agent' })}
          style={selectStyle}
        >
          <option value="key">SSH Key</option>
          <option value="password">Password</option>
          <option value="agent">SSH Agent</option>
        </select>
      </div>
      {config.authMethod === 'key' && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Key Path</label>
          <input
            type="text"
            value={config.keyPath || ''}
            onChange={(e) => onChange({ ...config, keyPath: e.target.value })}
            placeholder="~/.ssh/id_rsa"
            style={inputStyle}
          />
        </div>
      )}
    </>
  )
}

function DatabaseConfigForm({ config, onChange }: ConfigFormProps<DatabaseConnectionConfig>) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Database Type</label>
        <select
          value={config.dbType || 'postgresql'}
          onChange={(e) => onChange({ ...config, dbType: e.target.value as DatabaseConnectionConfig['dbType'] })}
          style={selectStyle}
        >
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mongodb">MongoDB</option>
          <option value="redis">Redis</option>
          <option value="sqlite">SQLite</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Host</label>
          <input
            type="text"
            value={config.host || ''}
            onChange={(e) => onChange({ ...config, host: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Port</label>
          <input
            type="number"
            value={config.port || ''}
            onChange={(e) => onChange({ ...config, port: parseInt(e.target.value) || undefined })}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Database</label>
          <input
            type="text"
            value={config.database || ''}
            onChange={(e) => onChange({ ...config, database: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={config.username || ''}
            onChange={(e) => onChange({ ...config, username: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
    </>
  )
}

function HttpApiConfigForm({ config, onChange }: ConfigFormProps<HttpApiConnectionConfig>) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Base URL</label>
        <input
          type="text"
          value={config.baseUrl || ''}
          onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Auth Type</label>
        <select
          value={config.authType || 'none'}
          onChange={(e) => onChange({ ...config, authType: e.target.value as HttpApiConnectionConfig['authType'] })}
          style={selectStyle}
        >
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="api-key">API Key</option>
          <option value="basic">Basic Auth</option>
        </select>
      </div>
    </>
  )
}

function WebSearchConfigForm({ config, onChange }: ConfigFormProps<WebSearchConnectionConfig>) {
  const provider = config.provider || 'langsearch'

  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Search Provider</label>
        <select
          value={provider}
          onChange={(e) => onChange({ ...config, provider: e.target.value as WebSearchConnectionConfig['provider'] })}
          style={selectStyle}
        >
          <option value="langsearch">LangSearch (Free)</option>
          <option value="brave">Brave Search (API key required)</option>
          <option value="tavily">Tavily (API key required)</option>
        </select>
      </div>
      {(provider === 'langsearch' || provider === 'brave' || provider === 'tavily') && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>API Key</label>
          <input
            type="password"
            value={config.apiKey || ''}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
            placeholder={provider === 'langsearch' ? 'LangSearch API key' : provider === 'brave' ? 'Brave Search API key' : 'Tavily API key'}
            style={inputStyle}
          />
        </div>
      )}
    </>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ConnectionSettingsDialog({ connection, onClose }: ConnectionSettingsDialogProps) {
  const [name, setName] = useState(connection.name)
  const [config, setConfig] = useState<WorkflowConnectionConfig>(connection.config)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const updateConnection = useWorkflowStore(state => state.updateConnection)
  const deleteConnection = useWorkflowStore(state => state.deleteConnection)
  const updateConnectionStatus = useWorkflowStore(state => state.updateConnectionStatus)

  const typeInfo = CONNECTION_TYPE_INFO[connection.type]
  const Icon = typeInfo.icon

  const handleSave = useCallback(() => {
    updateConnection(connection.id, {
      name: name.trim(),
      config,
    })
    onClose()
  }, [connection.id, name, config, updateConnection, onClose])

  const handleTest = useCallback(async () => {
    setTestStatus('testing')
    setTestMessage('')
    updateConnectionStatus(connection.id, 'connecting')

    const result = await testConnection({ ...connection, name, config })

    setTestStatus(result.success ? 'success' : 'error')
    setTestMessage(result.message)
    updateConnectionStatus(
      connection.id,
      result.success ? 'connected' : 'error',
      result.success ? undefined : result.message
    )
  }, [connection, name, config, updateConnectionStatus])

  const handleDelete = useCallback(() => {
    deleteConnection(connection.id)
    onClose()
  }, [connection.id, deleteConnection, onClose])

  const renderConfigForm = () => {
    switch (connection.type) {
      case 'ssh':
        return <SSHConfigForm config={config as SSHConnectionConfig} onChange={setConfig as (c: Partial<SSHConnectionConfig>) => void} />
      case 'database':
        return <DatabaseConfigForm config={config as DatabaseConnectionConfig} onChange={setConfig as (c: Partial<DatabaseConnectionConfig>) => void} />
      case 'http-api':
        return <HttpApiConfigForm config={config as HttpApiConnectionConfig} onChange={setConfig as (c: Partial<HttpApiConnectionConfig>) => void} />
      case 'web-search':
        return <WebSearchConfigForm config={config as WebSearchConnectionConfig} onChange={setConfig as (c: Partial<WebSearchConnectionConfig>) => void} />
      default:
        return (
          <div style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>
            Edit configuration for {typeInfo.label} connections is limited.
          </div>
        )
    }
  }

  const isValid = name.trim().length > 0

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '6px',
                background: `color-mix(in srgb, ${typeInfo.color} 15%, transparent)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={16} style={{ color: typeInfo.color }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                Connection Settings
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {typeInfo.label} Connection
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* Connection Name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Connection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Config Form */}
          {renderConfigForm()}

          {/* Test Result */}
          {testStatus !== 'idle' && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '6px',
                background: testStatus === 'success'
                  ? 'color-mix(in srgb, var(--success) 10%, transparent)'
                  : testStatus === 'error'
                    ? 'color-mix(in srgb, var(--error) 10%, transparent)'
                    : 'color-mix(in srgb, var(--accent) 10%, transparent)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {testStatus === 'testing' && (
                <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
              )}
              {testStatus === 'success' && (
                <Check size={16} style={{ color: 'var(--success)' }} />
              )}
              {testStatus === 'error' && (
                <AlertCircle size={16} style={{ color: 'var(--error)' }} />
              )}
              <span style={{
                fontSize: '12px',
                color: testStatus === 'success' ? 'var(--success)' : testStatus === 'error' ? 'var(--error)' : 'var(--text)',
              }}>
                {testStatus === 'testing' ? 'Testing connection...' : testMessage}
              </span>
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--error) 10%, transparent)',
                border: '1px solid var(--error)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--error)', marginBottom: '8px' }}>
                Delete this connection?
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Any workflow nodes referencing this connection will need to be updated.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    ...buttonStyle,
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    padding: '6px 12px',
                    fontSize: '12px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  style={{
                    ...buttonStyle,
                    background: 'var(--error)',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '12px',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: 'var(--error)',
                border: '1px solid var(--error)',
                opacity: showDeleteConfirm ? 0.5 : 1,
              }}
              disabled={showDeleteConfirm}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                opacity: testStatus === 'testing' ? 0.5 : 1,
              }}
            >
              {testStatus === 'testing' ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <RefreshCw size={14} />
              )}
              Test Connection
            </button>
            <button
              onClick={onClose}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid}
              style={{
                ...buttonStyle,
                background: isValid ? 'var(--accent)' : 'var(--muted)',
                color: 'white',
                opacity: isValid ? 1 : 0.5,
                cursor: isValid ? 'pointer' : 'not-allowed',
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConnectionSettingsDialog
