/**
 * McpToolNodeProperties - Property editor for MCP Tool nodes
 *
 * Discovers available tools from the selected MCP server connection
 * and generates schema-driven parameter fields from the tool's inputSchema.
 */

import { useState, useMemo } from 'react'
import { Link2, Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import type { McpToolNodeData } from '../../../services/workflowTypes'
import type { McpServerConnectionConfig } from '../../../services/workflowTypes'
import type { McpToolDefinition } from '../../../../electron.d'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { useMcpTools } from '../../../hooks'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface McpToolNodePropertiesProps {
  data: McpToolNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

/** Extract the serverName from the selected MCP connection */
function resolveServerName(
  connectionId: string | undefined,
  connections: { id: string; type: string; config: { serverName?: string } }[]
): string | undefined {
  if (!connectionId) return undefined
  const conn = connections.find(c => c.id === connectionId)
  if (!conn || conn.type !== 'mcp-server') return undefined
  return (conn.config as McpServerConnectionConfig).serverName
}

/** Build parameter fields from a tool's JSON Schema inputSchema */
function getSchemaProperties(tool: McpToolDefinition | undefined): {
  name: string
  type: string
  description: string
  required: boolean
  enumValues?: string[]
}[] {
  if (!tool?.inputSchema) return []
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string; description?: string; enum?: string[] }>
    required?: string[]
  }
  if (!schema.properties) return []

  const requiredSet = new Set(schema.required || [])
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: prop.type || 'string',
    description: prop.description || '',
    required: requiredSet.has(name),
    enumValues: prop.enum,
  }))
}

export function McpToolNodeProperties({ data, onChange }: McpToolNodePropertiesProps) {
  const connections = useWorkflowStore(state => state.connections)
  const mcpConnections = connections.filter(c => c.type === 'mcp-server')

  const serverName = resolveServerName(data.connectionId, connections as { id: string; type: string; config: { serverName?: string } }[])
  const { tools, isLoading, error: toolsError, refresh } = useMcpTools(serverName)

  const selectedTool = useMemo(
    () => tools.find(t => t.name === data.toolName),
    [tools, data.toolName]
  )

  const schemaProps = useMemo(() => getSchemaProperties(selectedTool), [selectedTool])

  const [paramKey, setParamKey] = useState('')
  const [paramValue, setParamValue] = useState('')

  const parameters = (data.parameters && typeof data.parameters === 'object')
    ? data.parameters as Record<string, unknown>
    : {}

  const handleAddParameter = () => {
    if (paramKey.trim()) {
      onChange('parameters', {
        ...parameters,
        [paramKey.trim()]: paramValue,
      })
      setParamKey('')
      setParamValue('')
    }
  }

  const handleRemoveParameter = (key: string) => {
    const newParams = { ...parameters }
    delete newParams[key]
    onChange('parameters', newParams)
  }

  const handleSchemaParamChange = (name: string, value: string) => {
    onChange('parameters', {
      ...parameters,
      [name]: value,
    })
  }

  const handleServerConfigChange = (field: string, value: unknown) => {
    onChange('serverConfig', {
      ...data.serverConfig,
      [field]: value,
    })
  }

  const useConnection = !!data.connectionId

  return (
    <>
      {/* Connection Mode Toggle */}
      <div>
        <label style={labelStyle}>MCP Server</label>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          marginBottom: '8px',
        }}>
          <button
            onClick={() => {
              if (mcpConnections.length > 0) {
                onChange('connectionId', mcpConnections[0].id)
                onChange('serverConfig', undefined)
              }
            }}
            disabled={mcpConnections.length === 0}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: useConnection ? 'var(--accent)' : 'transparent',
              color: useConnection ? 'white' : mcpConnections.length === 0 ? 'var(--muted)' : 'var(--text-secondary)',
              cursor: mcpConnections.length === 0 ? 'not-allowed' : 'pointer',
              opacity: mcpConnections.length === 0 ? 0.5 : 1,
            }}
            title={mcpConnections.length === 0 ? 'Add an MCP connection first' : 'Use saved connection'}
          >
            <Link2 size={10} style={{ marginRight: '4px' }} />
            Connection
          </button>
          <button
            onClick={() => {
              onChange('connectionId', undefined)
            }}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: !useConnection ? 'var(--accent)' : 'transparent',
              color: !useConnection ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Inline
          </button>
        </div>
      </div>

      {/* Connection Selector or Inline Config */}
      {useConnection ? (
        <div>
          <select
            value={data.connectionId || ''}
            onChange={(e) => onChange('connectionId', e.target.value || undefined)}
            style={selectStyle}
          >
            <option value="">Select connection...</option>
            {mcpConnections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div>
            <label style={labelStyle}>Server URL</label>
            <input
              type="text"
              value={data.serverConfig?.serverUrl || ''}
              onChange={(e) => handleServerConfigChange('serverUrl', e.target.value)}
              style={inputStyle}
              placeholder='http://localhost:3000/mcp'
            />
          </div>

          <div>
            <label style={labelStyle}>Server Name</label>
            <input
              type="text"
              value={data.serverConfig?.serverName || ''}
              onChange={(e) => handleServerConfigChange('serverName', e.target.value)}
              style={inputStyle}
              placeholder='my-mcp-server'
            />
          </div>

          <div>
            <label style={labelStyle}>Transport</label>
            <select
              value={data.serverConfig?.transport || 'http'}
              onChange={(e) => handleServerConfigChange('transport', e.target.value)}
              style={selectStyle}
            >
              <option value="stdio">Stdio</option>
              <option value="http">HTTP</option>
              <option value="websocket">WebSocket</option>
            </select>
          </div>
        </>
      )}

      {/* Tool Selection */}
      <div>
        <label style={{
          ...labelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>Tool Name</span>
          {useConnection && serverName && (
            <button
              onClick={refresh}
              disabled={isLoading}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: isLoading ? 'default' : 'pointer',
                color: 'var(--muted)',
                padding: '0 2px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Refresh tools"
            >
              {isLoading
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <RefreshCw size={12} />
              }
            </button>
          )}
        </label>

        {useConnection && tools.length > 0 ? (
          <select
            value={data.toolName || ''}
            onChange={(e) => onChange('toolName', e.target.value)}
            style={selectStyle}
          >
            <option value="">Select tool...</option>
            {tools.map(tool => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={data.toolName || ''}
            onChange={(e) => onChange('toolName', e.target.value)}
            style={inputStyle}
            placeholder='search_web'
          />
        )}

        {/* Tool description */}
        {selectedTool?.description && (
          <div style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            marginTop: '4px',
            padding: '6px 8px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            lineHeight: '1.4',
          }}>
            {selectedTool.description}
          </div>
        )}

        {/* Error loading tools */}
        {toolsError && (
          <div style={{
            fontSize: '11px',
            color: 'var(--error, #ef4444)',
            marginTop: '4px',
          }}>
            {toolsError}
          </div>
        )}
      </div>

      {/* Schema-Driven Parameters */}
      {schemaProps.length > 0 && (
        <div>
          <label style={labelStyle}>Parameters</label>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {schemaProps.map(prop => (
              <div key={prop.name}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginBottom: '2px',
                }}>
                  <code style={{ color: 'var(--accent)', fontSize: '11px' }}>{prop.name}</code>
                  {prop.required && <span style={{ color: 'var(--error, #ef4444)', marginLeft: '2px' }}>*</span>}
                  {prop.description && (
                    <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>
                      {prop.description.length > 60 ? prop.description.slice(0, 60) + '...' : prop.description}
                    </span>
                  )}
                </label>
                {prop.enumValues ? (
                  <select
                    value={String(parameters[prop.name] ?? '')}
                    onChange={(e) => handleSchemaParamChange(prop.name, e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select...</option>
                    {prop.enumValues.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={prop.type === 'number' || prop.type === 'integer' ? 'text' : 'text'}
                    value={String(parameters[prop.name] ?? '')}
                    onChange={(e) => handleSchemaParamChange(prop.name, e.target.value)}
                    style={inputStyle}
                    placeholder={`{{ expression }} or value`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Parameters (always available for additional/dynamic params) */}
      <div>
        <label style={labelStyle}>
          {schemaProps.length > 0 ? 'Additional Parameters' : 'Parameters'}
        </label>
        <div style={{
          border: '1px solid var(--input-border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          {(() => {
            const schemaNames = new Set(schemaProps.map(p => p.name))
            const manualEntries = Object.entries(parameters).filter(([key]) => !schemaNames.has(key))
            return manualEntries.length > 0 ? (
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {manualEntries.map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--input-bg)',
                    }}
                  >
                    <code style={{ fontSize: '11px', color: 'var(--accent)' }}>{key}</code>
                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>=</span>
                    <code style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1 }}>
                      {String(value).length > 30 ? String(value).slice(0, 30) + '...' : String(value)}
                    </code>
                    <button
                      onClick={() => handleRemoveParameter(key)}
                      style={{
                        padding: '2px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              schemaProps.length === 0 && (
                <div style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '11px',
                  background: 'var(--input-bg)',
                }}>
                  No parameters defined
                </div>
              )
            )
          })()}

          {/* Add Parameter */}
          <div style={{
            display: 'flex',
            gap: '4px',
            padding: '8px',
            background: 'var(--panel-2)',
          }}>
            <input
              type="text"
              value={paramKey}
              onChange={(e) => setParamKey(e.target.value)}
              placeholder="key"
              style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: '11px' }}
            />
            <input
              type="text"
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              placeholder="{{ expression }}"
              style={{ ...inputStyle, flex: 2, padding: '4px 8px', fontSize: '11px' }}
            />
            <button
              onClick={handleAddParameter}
              disabled={!paramKey.trim()}
              style={{
                padding: '4px 8px',
                background: paramKey.trim() ? 'var(--accent)' : 'var(--muted)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: paramKey.trim() ? 'pointer' : 'not-allowed',
                fontSize: '11px',
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={typeof data.timeoutMs === 'number' ? data.timeoutMs : 30000}
          onChange={(e) => onChange('timeoutMs', parseInt(e.target.value) || 30000)}
          style={inputStyle}
        />
      </div>
    </>
  )
}
