/**
 * McpServerSetupFlow - Multi-step guided MCP server connection setup
 *
 * Step 1 (Search): Search the official MCP registry for servers, or skip to manual config
 * Step 2 (Configure): Fill in command, args, env vars (pre-filled from registry metadata)
 * Step 3 (Test): Test the connection and show discovered tool count
 *
 * Returns final config to parent via onConfigReady callback.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, ChevronRight, Loader2, CheckCircle2, XCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import type { McpServerConnectionConfig } from '../../../services/workflowTypes'
import type { McpServerConfig, McpRegistryServer, McpToolDefinition } from '../../../../electron.d'

// ============================================================================
// Types
// ============================================================================

type SetupStep = 'search' | 'configure' | 'test'

interface McpServerSetupFlowProps {
  /** Called when config is ready (user clicked Create) */
  onConfigReady: (connectionConfig: Partial<McpServerConnectionConfig>, mcpConfig: McpServerConfig) => void
  /** Called when user wants to go back to type selection */
  onBack?: () => void
}

// ============================================================================
// Styles (matches AddConnectionDialog patterns)
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '13px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: '4px',
}

const cardStyle: React.CSSProperties = {
  padding: '12px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'border-color 0.2s, background 0.2s',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
}

// ============================================================================
// Helper: derive config from registry server package
// ============================================================================

function deriveConfigFromPackage(server: McpRegistryServer): {
  command: string
  args: string[]
  envVars: Array<{ name: string; description: string; required: boolean }>
  transport: 'stdio' | 'streamable-http'
} {
  // Prefer npm/node packages since they work with npx
  const npmPkg = server.packages?.find(p => p.runtime === 'node' || p.registry_name === 'npm')
  const anyPkg = server.packages?.[0]

  const extractEnvVars = (pkg: NonNullable<McpRegistryServer['packages']>[0]) =>
    (pkg.environment_variables || []).map(ev => ({
      name: ev.name,
      description: ev.description || '',
      required: ev.required ?? false,
    }))

  // npm packages: use npx
  if (npmPkg) {
    return {
      command: 'npx',
      args: ['-y', npmPkg.name],
      envVars: extractEnvVars(npmPkg),
      transport: 'stdio',
    }
  }

  // Docker packages: use docker run
  if (anyPkg && anyPkg.registry_name === 'docker') {
    return {
      command: 'docker',
      args: ['run', '-i', '--rm', anyPkg.name],
      envVars: extractEnvVars(anyPkg),
      transport: 'stdio',
    }
  }

  // PyPI packages: use uvx (or pipx)
  if (anyPkg && (anyPkg.registry_name === 'pip' || anyPkg.registry_name === 'pypi' || anyPkg.runtime === 'python')) {
    return {
      command: 'uvx',
      args: [anyPkg.name],
      envVars: extractEnvVars(anyPkg),
      transport: 'stdio',
    }
  }

  // Unknown registry type: leave command blank for manual entry
  if (anyPkg) {
    return {
      command: '',
      args: [],
      envVars: extractEnvVars(anyPkg),
      transport: anyPkg.transport_type === 'sse' ? 'streamable-http' : 'stdio',
    }
  }

  return {
    command: '',
    args: [],
    envVars: [],
    transport: 'stdio',
  }
}

// ============================================================================
// Step 1: Search
// ============================================================================

interface SearchStepProps {
  onSelectServer: (server: McpRegistryServer) => void
  onManualConfig: () => void
}

function SearchStep({ onSelectServer, onManualConfig }: SearchStepProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<McpRegistryServer[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const result = await window.electronAPI?.mcp?.searchRegistry(searchQuery.trim())
      if (result?.success && result.servers) {
        setResults(result.servers)
      } else {
        setError(result?.error || 'Search failed')
        setResults([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setIsSearching(false)
      setHasSearched(true)
    }
  }, [])

  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      doSearch(value)
    }, 300)
  }, [doSearch])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search MCP servers (e.g., filesystem, github, slack)"
          style={{ ...inputStyle, paddingLeft: '32px' }}
          autoFocus
        />
        {isSearching && (
          <Loader2
            size={14}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'color-mix(in srgb, var(--error) 10%, var(--bg))',
          border: '1px solid color-mix(in srgb, var(--error) 30%, var(--border))',
          borderRadius: '6px',
          color: 'var(--error)',
          fontSize: '12px',
          marginBottom: '12px',
        }}>
          {error}
        </div>
      )}

      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {results.map((server, idx) => {
          const pkg = server.packages?.[0]
          return (
            <div
              key={`${server.name}-${idx}`}
              style={{ ...cardStyle, marginBottom: '8px' }}
              onClick={() => onSelectServer(server)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 5%, var(--bg))'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'var(--bg)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                  {server.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {pkg && (
                    <span style={{
                      ...badgeStyle,
                      background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                      color: 'var(--accent)',
                    }}>
                      {pkg.runtime || 'npm'}
                    </span>
                  )}
                  <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                </div>
              </div>
              {server.description && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', lineHeight: '1.4' }}>
                  {server.description.length > 120
                    ? server.description.slice(0, 120) + '...'
                    : server.description}
                </div>
              )}
              {pkg && (
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'monospace' }}>
                  {pkg.name}
                </div>
              )}
            </div>
          )
        })}

        {hasSearched && results.length === 0 && !isSearching && !error && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '12px' }}>
            No servers found. Try a different search or use manual configuration.
          </div>
        )}
      </div>

      <div style={{
        marginTop: '12px',
        textAlign: 'center',
        borderTop: '1px solid var(--border)',
        paddingTop: '12px',
      }}>
        <button
          onClick={onManualConfig}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Configure manually instead
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Step 2: Configure
// ============================================================================

interface ConfigureStepProps {
  serverName: string
  command: string
  args: string[]
  envVars: Array<{ name: string; description: string; required: boolean }>
  envValues: Record<string, string>
  transport: 'stdio' | 'http' | 'streamable-http'
  serverUrl: string
  registryRef: string | null
  isManual: boolean
  onServerNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onArgsChange: (v: string) => void
  onEnvValueChange: (key: string, value: string) => void
  onTransportChange: (v: 'stdio' | 'http' | 'streamable-http') => void
  onServerUrlChange: (v: string) => void
  onBack: () => void
  onNext: () => void
}

function ConfigureStep({
  serverName, command, args, envVars, envValues, transport, serverUrl,
  registryRef, isManual,
  onServerNameChange, onCommandChange, onArgsChange, onEnvValueChange,
  onTransportChange, onServerUrlChange, onBack, onNext,
}: ConfigureStepProps) {
  const isSensitiveEnvVar = (name: string) =>
    /key|secret|token|password|credential/i.test(name)

  const isValid = serverName.trim() &&
    (transport === 'stdio' ? command.trim() : serverUrl.trim())

  return (
    <div>
      {registryRef && (
        <div style={{
          padding: '8px 12px',
          background: 'color-mix(in srgb, var(--accent) 8%, var(--bg))',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))',
          borderRadius: '6px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          marginBottom: '16px',
        }}>
          From registry: <strong>{registryRef}</strong>
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Server Name</label>
        <input
          type="text"
          value={serverName}
          onChange={(e) => onServerNameChange(e.target.value)}
          placeholder="my-mcp-server"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Transport</label>
        <select
          value={transport}
          onChange={(e) => onTransportChange(e.target.value as 'stdio' | 'http' | 'streamable-http')}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="stdio">Standard I/O (stdio)</option>
          <option value="streamable-http">HTTP (Streamable)</option>
        </select>
      </div>

      {transport === 'stdio' ? (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => onCommandChange(e.target.value)}
              placeholder="npx"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Arguments</label>
            <input
              type="text"
              value={args.join(' ')}
              onChange={(e) => onArgsChange(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-filesystem /path/to/dir"
              style={inputStyle}
            />
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
              Space-separated arguments
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Server URL</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            placeholder="http://localhost:3333/mcp"
            style={inputStyle}
          />
        </div>
      )}

      {/* Environment Variables */}
      {(envVars.length > 0 || isManual) && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>
            Environment Variables
            {isManual && (
              <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: '4px' }}>
                (optional)
              </span>
            )}
          </label>
          {envVars.map((ev) => (
            <div key={ev.name} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  {ev.name}
                </span>
                {ev.required && (
                  <span style={{ color: 'var(--error)', fontSize: '10px' }}>*</span>
                )}
              </div>
              <input
                type={isSensitiveEnvVar(ev.name) ? 'password' : 'text'}
                value={envValues[ev.name] || ''}
                onChange={(e) => onEnvValueChange(ev.name, e.target.value)}
                placeholder={ev.description || ev.name}
                style={inputStyle}
              />
            </div>
          ))}
          {isManual && envVars.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
              Add environment variables after connection is created if needed.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '8px 16px',
            background: isValid ? 'var(--accent)' : 'var(--muted)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: isValid ? 'pointer' : 'not-allowed',
            opacity: isValid ? 1 : 0.5,
          }}
        >
          Test Connection
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Step 3: Test
// ============================================================================

interface TestStepProps {
  serverName: string
  mcpConfig: McpServerConfig
  onBack: () => void
  onDone: () => void
}

function TestStep({ serverName, mcpConfig, onBack, onDone }: TestStepProps) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [tools, setTools] = useState<McpToolDefinition[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  const runTest = useCallback(async () => {
    setStatus('testing')
    setErrorMessage('')
    setTools([])

    try {
      // First add the server config so the MCP service knows about it
      const addResult = await window.electronAPI?.mcp?.addServer(serverName, mcpConfig)
      if (addResult && !addResult.success) {
        throw new Error(addResult.error || 'Failed to save server config')
      }

      // Then connect (which spawns the process / opens HTTP connection)
      const connectResult = await window.electronAPI?.mcp?.connect(serverName)
      if (connectResult?.success && connectResult.tools) {
        setTools(connectResult.tools)
        setStatus('success')
      } else {
        throw new Error(connectResult?.error || 'Connection failed')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Connection test failed')
      setStatus('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-create on retry, not every render
  }, [serverName])

  // Run test once on mount only
  const hasRun = useRef(false)
  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true
      runTest()
    }
  }, [runTest])

  return (
    <div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0',
        gap: '12px',
      }}>
        {status === 'testing' && (
          <>
            <Loader2
              size={32}
              style={{
                color: 'var(--accent)',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ fontSize: '13px', color: 'var(--text)' }}>
              Connecting to {serverName}...
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {mcpConfig.command
                ? `Running: ${mcpConfig.command} ${(mcpConfig.args || []).join(' ')}`
                : `Connecting to: ${mcpConfig.serverUrl}`}
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 size={32} style={{ color: 'var(--success, #22c55e)' }} />
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
              Connected successfully
            </div>
            <div style={{
              ...badgeStyle,
              background: 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
              color: 'var(--success, #22c55e)',
              fontSize: '12px',
              padding: '4px 10px',
            }}>
              {tools.length} tool{tools.length !== 1 ? 's' : ''} discovered
            </div>
            {tools.length > 0 && (
              <div style={{
                width: '100%',
                maxHeight: '120px',
                overflowY: 'auto',
                marginTop: '8px',
                padding: '8px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
              }}>
                {tools.map((tool) => (
                  <div key={tool.name} style={{ marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text)' }}>
                      {tool.name}
                    </span>
                    {tool.description && (
                      <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: '6px' }}>
                        - {tool.description.length > 60
                          ? tool.description.slice(0, 60) + '...'
                          : tool.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={32} style={{ color: 'var(--error, #ef4444)' }} />
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
              Connection failed
            </div>
            <div style={{
              width: '100%',
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--error, #ef4444) 8%, var(--bg))',
              border: '1px solid color-mix(in srgb, var(--error, #ef4444) 20%, var(--border))',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'var(--error, #ef4444)',
              wordBreak: 'break-word',
            }}>
              {errorMessage}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          {status === 'error' && (
            <button
              onClick={runTest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 16px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          )}
          {(status === 'success' || status === 'error') && (
            <button
              onClick={onDone}
              style={{
                padding: '8px 16px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {status === 'success' ? 'Create Connection' : 'Create Anyway'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function McpServerSetupFlow({ onConfigReady, onBack: parentOnBack }: McpServerSetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('search')
  const [isManual, setIsManual] = useState(false)

  // Config state
  const [serverName, setServerName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState<string[]>([])
  const [envVars, setEnvVars] = useState<Array<{ name: string; description: string; required: boolean }>>([])
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [transport, setTransport] = useState<'stdio' | 'http' | 'streamable-http'>('stdio')
  const [serverUrl, setServerUrl] = useState('')
  const [registryRef, setRegistryRef] = useState<string | null>(null)

  const handleSelectServer = useCallback((server: McpRegistryServer) => {
    const derived = deriveConfigFromPackage(server)
    setServerName(server.name.replace(/\s+/g, '-').toLowerCase())
    setCommand(derived.command)
    setArgs(derived.args)
    setEnvVars(derived.envVars)
    setTransport(derived.transport)
    setRegistryRef(server.name)
    setIsManual(false)
    setStep('configure')
  }, [])

  const handleManualConfig = useCallback(() => {
    setIsManual(true)
    setStep('configure')
  }, [])

  const handleArgsChange = useCallback((value: string) => {
    // Split on spaces, but respect quoted strings
    const parts = value.match(/(?:[^\s"]+|"[^"]*")+/g) || []
    setArgs(parts.map(p => p.replace(/^"|"$/g, '')))
  }, [])

  const handleEnvValueChange = useCallback((key: string, value: string) => {
    setEnvValues(prev => ({ ...prev, [key]: value }))
  }, [])

  const buildMcpConfig = useCallback((): McpServerConfig => {
    const config: McpServerConfig = {
      transport,
      serverName,
    }
    if (transport === 'stdio') {
      config.command = command
      config.args = args
    } else {
      config.serverUrl = serverUrl
    }
    // Only include env values that are non-empty
    const filteredEnv: Record<string, string> = {}
    for (const [k, v] of Object.entries(envValues)) {
      if (v.trim()) filteredEnv[k] = v.trim()
    }
    if (Object.keys(filteredEnv).length > 0) {
      config.env = filteredEnv
    }
    if (registryRef) {
      config.registryRef = registryRef
    }
    return config
  }, [serverName, command, args, transport, serverUrl, envValues, registryRef])

  const buildConnectionConfig = useCallback((): Partial<McpServerConnectionConfig> => {
    return {
      type: 'mcp-server',
      serverName,
      transport,
      command: transport === 'stdio' ? command : undefined,
      args: transport === 'stdio' ? args : undefined,
      serverUrl: transport !== 'stdio' ? serverUrl : undefined,
      registryRef: registryRef || undefined,
    }
  }, [serverName, transport, command, args, serverUrl, registryRef])

  const handleDone = useCallback(() => {
    onConfigReady(buildConnectionConfig(), buildMcpConfig())
  }, [onConfigReady, buildConnectionConfig, buildMcpConfig])

  const handleBackFromConfigure = useCallback(() => {
    if (isManual && parentOnBack) {
      // If manual and there's a parent back, go to type selection
      parentOnBack()
    } else {
      setStep('search')
    }
  }, [isManual, parentOnBack])

  return (
    <div>
      {/* Step indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        fontSize: '11px',
        color: 'var(--muted)',
      }}>
        <span style={{ color: step === 'search' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: step === 'search' ? 600 : 400 }}>
          Search
        </span>
        <ChevronRight size={10} />
        <span style={{ color: step === 'configure' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: step === 'configure' ? 600 : 400 }}>
          Configure
        </span>
        <ChevronRight size={10} />
        <span style={{ color: step === 'test' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: step === 'test' ? 600 : 400 }}>
          Test
        </span>
      </div>

      {step === 'search' && (
        <SearchStep
          onSelectServer={handleSelectServer}
          onManualConfig={handleManualConfig}
        />
      )}

      {step === 'configure' && (
        <ConfigureStep
          serverName={serverName}
          command={command}
          args={args}
          envVars={envVars}
          envValues={envValues}
          transport={transport}
          serverUrl={serverUrl}
          registryRef={registryRef}
          isManual={isManual}
          onServerNameChange={setServerName}
          onCommandChange={setCommand}
          onArgsChange={handleArgsChange}
          onEnvValueChange={handleEnvValueChange}
          onTransportChange={setTransport}
          onServerUrlChange={setServerUrl}
          onBack={handleBackFromConfigure}
          onNext={() => setStep('test')}
        />
      )}

      {step === 'test' && (
        <TestStep
          serverName={serverName}
          mcpConfig={buildMcpConfig()}
          onBack={() => setStep('configure')}
          onDone={handleDone}
        />
      )}
    </div>
  )
}

export default McpServerSetupFlow
