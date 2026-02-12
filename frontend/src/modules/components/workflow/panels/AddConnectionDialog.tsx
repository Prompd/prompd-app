/**
 * AddConnectionDialog - Modal dialog for creating new connections
 */

import { useState, useCallback } from 'react'
import { X, Server, Database, Globe, MessageSquare, Link2, RefreshCw, Settings, Search } from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import type {
  WorkflowConnectionType,
  WorkflowConnectionConfig,
  SSHConnectionConfig,
  DatabaseConnectionConfig,
  HttpApiConnectionConfig,
  SlackConnectionConfig,
  GitHubConnectionConfig,
  McpServerConnectionConfig,
  WebSocketConnectionConfig,
  CustomConnectionConfig,
  WebSearchConnectionConfig,
} from '../../../services/workflowTypes'

// ============================================================================
// Types
// ============================================================================

interface AddConnectionDialogProps {
  onClose: () => void
  /** Pre-select a connection type */
  initialType?: WorkflowConnectionType
}

// ============================================================================
// Connection Type Metadata
// ============================================================================

const CONNECTION_TYPES: Array<{
  type: WorkflowConnectionType
  label: string
  icon: typeof Server
  color: string
  description: string
}> = [
  {
    type: 'ssh',
    label: 'SSH',
    icon: Server,
    color: 'var(--node-purple, #a855f7)',
    description: 'Connect to remote servers via SSH',
  },
  {
    type: 'database',
    label: 'Database',
    icon: Database,
    color: 'var(--node-blue, #3b82f6)',
    description: 'PostgreSQL, MySQL, MongoDB, Redis, SQLite',
  },
  {
    type: 'http-api',
    label: 'HTTP API',
    icon: Globe,
    color: 'var(--node-emerald, #10b981)',
    description: 'REST APIs with authentication',
  },
  {
    type: 'slack',
    label: 'Slack',
    icon: MessageSquare,
    color: 'var(--node-purple, #a855f7)',
    description: 'Slack workspace integration',
  },
  {
    type: 'github',
    label: 'GitHub',
    icon: Globe,
    color: 'var(--node-gray, #6b7280)',
    description: 'GitHub API access',
  },
  {
    type: 'mcp-server',
    label: 'MCP Server',
    icon: Link2,
    color: 'var(--node-cyan, #06b6d4)',
    description: 'External MCP server connection',
  },
  {
    type: 'websocket',
    label: 'WebSocket',
    icon: RefreshCw,
    color: 'var(--node-orange, #f97316)',
    description: 'WebSocket connections',
  },
  {
    type: 'web-search',
    label: 'Web Search',
    icon: Search,
    color: 'var(--node-sky, #0ea5e9)',
    description: 'Web search providers (LangSearch, Brave, Tavily)',
  },
  {
    type: 'custom',
    label: 'Custom',
    icon: Settings,
    color: 'var(--muted)',
    description: 'Custom connection type',
  },
]

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
  justifyContent: 'flex-end',
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
// Type-Specific Config Forms
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
          placeholder="example.com or 192.168.1.1"
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
            placeholder="root"
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Authentication Method</label>
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

/** Default ports per database type */
const DB_DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
}

/** Placeholder text for the username field per db type */
const DB_USERNAME_PLACEHOLDER: Record<string, string> = {
  postgresql: 'postgres',
  mysql: 'root',
  mongodb: 'admin',
  redis: '(optional)',
}

function DatabaseConfigForm({ config, onChange }: ConfigFormProps<DatabaseConnectionConfig>) {
  const dbType = config.dbType || 'postgresql'
  const isNetworkDb = dbType !== 'sqlite'
  const showConnectionString = dbType === 'mongodb'
  const showDatabase = dbType !== 'redis'
  const showUsername = dbType !== 'redis' || !!config.username

  /** Reset host/port/username/ssl when switching db type to keep config clean */
  const handleDbTypeChange = (newType: DatabaseConnectionConfig['dbType']) => {
    const base: Partial<DatabaseConnectionConfig> = {
      type: 'database',
      dbType: newType,
      database: newType === 'sqlite' ? '' : config.database || '',
    }
    if (newType !== 'sqlite') {
      base.host = config.host || ''
      base.port = undefined
    }
    if (newType === 'mongodb') {
      base.connectionString = config.connectionString || ''
    }
    onChange(base)
  }

  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Database Type</label>
        <select
          value={dbType}
          onChange={(e) => handleDbTypeChange(e.target.value as DatabaseConnectionConfig['dbType'])}
          style={selectStyle}
        >
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="mongodb">MongoDB</option>
          <option value="redis">Redis</option>
          <option value="sqlite">SQLite</option>
        </select>
      </div>

      {/* MongoDB: connection string option */}
      {showConnectionString && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Connection String (optional)</label>
          <input
            type="text"
            value={config.connectionString || ''}
            onChange={(e) => onChange({ ...config, connectionString: e.target.value })}
            placeholder="mongodb+srv://user:pass@cluster.example.net/mydb"
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            If provided, host/port/database fields below are ignored.
          </div>
        </div>
      )}

      {/* Network databases: host + port */}
      {isNetworkDb && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>Host</label>
            <input
              type="text"
              value={config.host || ''}
              onChange={(e) => onChange({ ...config, host: e.target.value })}
              placeholder="localhost"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Port</label>
            <input
              type="number"
              value={config.port || ''}
              onChange={(e) => onChange({ ...config, port: parseInt(e.target.value) || undefined })}
              placeholder={String(DB_DEFAULT_PORTS[dbType] || 5432)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Database name (not for Redis or SQLite) */}
      {isNetworkDb && showDatabase && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Database</label>
            <input
              type="text"
              value={config.database || ''}
              onChange={(e) => onChange({ ...config, database: e.target.value })}
              placeholder={dbType === 'mongodb' ? 'mydb' : dbType === 'mysql' ? 'mydb' : 'postgres'}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={config.username || ''}
              onChange={(e) => onChange({ ...config, username: e.target.value })}
              placeholder={DB_USERNAME_PLACEHOLDER[dbType] || 'user'}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Redis: database number + optional username */}
      {dbType === 'redis' && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Database Number</label>
            <input
              type="number"
              min={0}
              max={15}
              value={config.database || '0'}
              onChange={(e) => onChange({ ...config, database: e.target.value })}
              placeholder="0"
              style={inputStyle}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Redis databases are numbered 0-15
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Username (ACL)</label>
            <input
              type="text"
              value={config.username || ''}
              onChange={(e) => onChange({ ...config, username: e.target.value })}
              placeholder="default"
              style={inputStyle}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Only needed if Redis ACL is enabled
            </div>
          </div>
        </div>
      )}

      {/* SQLite: file path */}
      {dbType === 'sqlite' && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Database File Path</label>
          <input
            type="text"
            value={config.database || ''}
            onChange={(e) => onChange({ ...config, database: e.target.value })}
            placeholder="./data/mydb.sqlite"
            style={inputStyle}
          />
        </div>
      )}

      {/* SSL (network databases only, not Redis) */}
      {isNetworkDb && dbType !== 'redis' && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={config.ssl || false}
              onChange={(e) => onChange({ ...config, ssl: e.target.checked })}
            />
            Use SSL
          </label>
        </div>
      )}
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
        <label style={labelStyle}>Authentication Type</label>
        <select
          value={config.authType || 'none'}
          onChange={(e) => onChange({ ...config, authType: e.target.value as HttpApiConnectionConfig['authType'] })}
          style={selectStyle}
        >
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="api-key">API Key</option>
          <option value="basic">Basic Auth</option>
          <option value="oauth2">OAuth 2.0</option>
        </select>
      </div>
      {config.authType === 'api-key' && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>API Key Header Name</label>
          <input
            type="text"
            value={config.apiKeyHeader || ''}
            onChange={(e) => onChange({ ...config, apiKeyHeader: e.target.value })}
            placeholder="X-API-Key"
            style={inputStyle}
          />
        </div>
      )}
    </>
  )
}

function McpServerConfigForm({ config, onChange }: ConfigFormProps<McpServerConnectionConfig>) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Server Name</label>
        <input
          type="text"
          value={config.serverName || ''}
          onChange={(e) => onChange({ ...config, serverName: e.target.value })}
          placeholder="my-mcp-server"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Server URL</label>
        <input
          type="text"
          value={config.serverUrl || ''}
          onChange={(e) => onChange({ ...config, serverUrl: e.target.value })}
          placeholder="http://localhost:3333"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Transport</label>
        <select
          value={config.transport || 'http'}
          onChange={(e) => onChange({ ...config, transport: e.target.value as 'stdio' | 'http' | 'websocket' })}
          style={selectStyle}
        >
          <option value="stdio">Standard I/O</option>
          <option value="http">HTTP</option>
          <option value="websocket">WebSocket</option>
        </select>
      </div>
    </>
  )
}

function SlackConfigForm({ config, onChange }: ConfigFormProps<SlackConnectionConfig>) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Workspace</label>
        <input
          type="text"
          value={config.workspace || ''}
          onChange={(e) => onChange({ ...config, workspace: e.target.value })}
          placeholder="my-workspace"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Default Channel (optional)</label>
        <input
          type="text"
          value={config.defaultChannel || ''}
          onChange={(e) => onChange({ ...config, defaultChannel: e.target.value })}
          placeholder="#general"
          style={inputStyle}
        />
      </div>
    </>
  )
}

function GitHubConfigForm({ config, onChange }: ConfigFormProps<GitHubConnectionConfig>) {
  return (
    <>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Owner (optional)</label>
          <input
            type="text"
            value={config.owner || ''}
            onChange={(e) => onChange({ ...config, owner: e.target.value })}
            placeholder="username or org"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Repository (optional)</label>
          <input
            type="text"
            value={config.repo || ''}
            onChange={(e) => onChange({ ...config, repo: e.target.value })}
            placeholder="repo-name"
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Base URL (for GitHub Enterprise)</label>
        <input
          type="text"
          value={config.baseUrl || ''}
          onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
          placeholder="https://github.example.com/api/v3"
          style={inputStyle}
        />
      </div>
    </>
  )
}

function WebSocketConfigForm({ config, onChange }: ConfigFormProps<WebSocketConnectionConfig>) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>WebSocket URL</label>
        <input
          type="text"
          value={config.url || ''}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="wss://example.com/socket"
          style={inputStyle}
        />
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

export function AddConnectionDialog({ onClose, initialType }: AddConnectionDialogProps) {
  const [step, setStep] = useState<'type' | 'config'>(initialType ? 'config' : 'type')
  const [selectedType, setSelectedType] = useState<WorkflowConnectionType | null>(initialType || null)
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Partial<WorkflowConnectionConfig>>({})

  const addConnection = useWorkflowStore(state => state.addConnection)

  const handleSelectType = useCallback((type: WorkflowConnectionType) => {
    setSelectedType(type)
    setConfig({ type } as Partial<WorkflowConnectionConfig>)
    setStep('config')
  }, [])

  const handleCreate = useCallback(() => {
    if (!selectedType || !name.trim()) return

    const fullConfig = { ...config, type: selectedType } as WorkflowConnectionConfig

    addConnection({
      name: name.trim(),
      type: selectedType,
      status: 'disconnected',
      config: fullConfig,
    })

    onClose()
  }, [selectedType, name, config, addConnection, onClose])

  const handleBack = useCallback(() => {
    setStep('type')
  }, [])

  const isValid = name.trim().length > 0 && selectedType !== null

  const renderConfigForm = () => {
    if (!selectedType) return null

    switch (selectedType) {
      case 'ssh':
        return <SSHConfigForm config={config as Partial<SSHConnectionConfig>} onChange={setConfig} />
      case 'database':
        return <DatabaseConfigForm config={config as Partial<DatabaseConnectionConfig>} onChange={setConfig} />
      case 'http-api':
        return <HttpApiConfigForm config={config as Partial<HttpApiConnectionConfig>} onChange={setConfig} />
      case 'slack':
        return <SlackConfigForm config={config as Partial<SlackConnectionConfig>} onChange={setConfig} />
      case 'github':
        return <GitHubConfigForm config={config as Partial<GitHubConnectionConfig>} onChange={setConfig} />
      case 'mcp-server':
        return <McpServerConfigForm config={config as Partial<McpServerConnectionConfig>} onChange={setConfig} />
      case 'websocket':
        return <WebSocketConfigForm config={config as Partial<WebSocketConnectionConfig>} onChange={setConfig} />
      case 'web-search':
        return <WebSearchConfigForm config={config as Partial<WebSearchConnectionConfig>} onChange={setConfig} />
      case 'custom':
        return (
          <div style={{ color: 'var(--muted)', fontSize: '12px', fontStyle: 'italic' }}>
            Custom connection configuration can be added after creation.
          </div>
        )
      default:
        return null
    }
  }

  const selectedTypeInfo = CONNECTION_TYPES.find(t => t.type === selectedType)

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
            {step === 'type' ? 'Add Connection' : `New ${selectedTypeInfo?.label || ''} Connection`}
          </h2>
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
          {step === 'type' ? (
            // Type Selection
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {CONNECTION_TYPES.map(({ type, label, icon: Icon, color, description }) => (
                <button
                  key={type}
                  onClick={() => handleSelectType(type)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = color
                    e.currentTarget.style.background = `color-mix(in srgb, ${color} 5%, var(--bg))`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--bg)'
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '6px',
                      background: `color-mix(in srgb, ${color} 15%, transparent)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{description}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Configuration Form
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Connection Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`My ${selectedTypeInfo?.label || ''} Connection`}
                  style={inputStyle}
                  autoFocus
                />
              </div>
              {renderConfigForm()}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          {step === 'config' && !initialType && (
            <button
              onClick={handleBack}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Back
            </button>
          )}
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
          {step === 'config' && (
            <button
              onClick={handleCreate}
              disabled={!isValid}
              style={{
                ...buttonStyle,
                background: isValid ? 'var(--accent)' : 'var(--muted)',
                color: 'white',
                opacity: isValid ? 1 : 0.5,
                cursor: isValid ? 'pointer' : 'not-allowed',
              }}
            >
              Create Connection
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddConnectionDialog
