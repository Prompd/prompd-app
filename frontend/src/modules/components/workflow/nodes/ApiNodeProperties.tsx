/**
 * ApiNodeProperties - Property editor for API Call nodes
 *
 * When an http-api connection is selected (via the common ConnectionSelector),
 * the connection provides baseUrl and auth headers. The URL field becomes
 * a relative path. Without a connection, full URL is used (inline config).
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ApiNodeData, HttpApiConnectionConfig } from '../../../services/workflowTypes'
import { useConnection } from '../shared/hooks/useNodeConnections'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface ApiNodePropertiesProps {
  data: ApiNodeData
  onChange: (field: string, value: unknown) => void
}

export function ApiNodeProperties({ data, onChange }: ApiNodePropertiesProps) {
  const [headerKey, setHeaderKey] = useState('')
  const [headerValue, setHeaderValue] = useState('')

  const connection = useConnection(data.connectionId)
  const hasConnection = !!connection
  const httpConfig = hasConnection && connection.type === 'http-api'
    ? connection.config as HttpApiConnectionConfig
    : undefined

  const headers = data.headers || {}

  const handleAddHeader = () => {
    if (headerKey.trim()) {
      onChange('headers', {
        ...headers,
        [headerKey.trim()]: headerValue,
      })
      setHeaderKey('')
      setHeaderValue('')
    }
  }

  const handleRemoveHeader = (key: string) => {
    const newHeaders = { ...headers }
    delete newHeaders[key]
    onChange('headers', newHeaders)
  }

  const methodHasBody = data.method !== 'GET' && data.method !== 'DELETE'

  return (
    <>
      {/* HTTP Method */}
      <div>
        <label style={labelStyle}>Method</label>
        <select
          value={data.method || 'GET'}
          onChange={(e) => onChange('method', e.target.value)}
          style={selectStyle}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      {/* URL / Path */}
      <div>
        <label style={labelStyle}>{hasConnection ? 'Path' : 'URL'}</label>
        {httpConfig?.baseUrl && (
          <div style={{
            marginBottom: '4px',
            padding: '4px 8px',
            background: 'color-mix(in srgb, var(--node-cyan) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
          }}>
            {httpConfig.baseUrl}
          </div>
        )}
        <input
          type="text"
          value={data.url || ''}
          onChange={(e) => onChange('url', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
          placeholder={hasConnection ? '/api/endpoint' : 'https://api.example.com/endpoint'}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {hasConnection
            ? 'Relative path appended to connection base URL'
            : <>Supports {'{{ }}'} expressions for dynamic values</>
          }
        </div>
      </div>

      {/* Headers */}
      <div>
        <label style={labelStyle}>
          {hasConnection ? 'Additional Headers' : 'Headers'}
        </label>
        {httpConfig?.authType && httpConfig.authType !== 'none' && (
          <div style={{
            marginBottom: '4px',
            padding: '4px 8px',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}>
            Auth from connection: {httpConfig.authType}
          </div>
        )}
        <div style={{
          border: '1px solid var(--input-border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          {Object.keys(headers).length > 0 ? (
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {Object.entries(headers).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                  }}
                >
                  <code style={{ fontSize: '11px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{key}</code>
                  <span style={{ color: 'var(--muted)', fontSize: '11px' }}>:</span>
                  <code style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {value.length > 40 ? value.slice(0, 40) + '...' : value}
                  </code>
                  <button
                    onClick={() => handleRemoveHeader(key)}
                    style={{
                      padding: '2px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '10px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '11px',
              background: 'var(--input-bg)',
            }}>
              No {hasConnection ? 'additional ' : ''}headers defined
            </div>
          )}

          {/* Add Header */}
          <div style={{
            display: 'flex',
            gap: '4px',
            padding: '6px 8px',
            background: 'var(--panel-2)',
          }}>
            <input
              type="text"
              value={headerKey}
              onChange={(e) => setHeaderKey(e.target.value)}
              placeholder="Header-Name"
              style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: '11px' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddHeader() }}
            />
            <input
              type="text"
              value={headerValue}
              onChange={(e) => setHeaderValue(e.target.value)}
              placeholder="value or {{ expression }}"
              style={{ ...inputStyle, flex: 2, padding: '4px 8px', fontSize: '11px' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddHeader() }}
            />
            <button
              onClick={handleAddHeader}
              disabled={!headerKey.trim()}
              style={{
                padding: '4px 8px',
                background: headerKey.trim() ? 'var(--accent)' : 'var(--muted)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: headerKey.trim() ? 'pointer' : 'not-allowed',
                fontSize: '11px',
                flexShrink: 0,
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Request Body (only for POST/PUT/PATCH) */}
      {methodHasBody && (
        <div>
          <label style={labelStyle}>Request Body</label>
          <textarea
            value={data.body || ''}
            onChange={(e) => onChange('body', e.target.value)}
            style={{ ...inputStyle, minHeight: '100px', fontFamily: 'monospace', fontSize: '12px' }}
            placeholder={'{\n  "key": "{{ value }}"\n}'}
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            JSON body with {'{{ }}'} expression support
          </div>
        </div>
      )}

      {/* Retry Policy */}
      <div>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--text)',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={data.retryPolicy?.enabled ?? false}
            onChange={(e) => onChange('retryPolicy', {
              ...data.retryPolicy,
              enabled: e.target.checked,
              maxRetries: data.retryPolicy?.maxRetries ?? 3,
              backoffMs: data.retryPolicy?.backoffMs ?? 1000,
            })}
          />
          Enable retry on failure
        </label>
      </div>

      {data.retryPolicy?.enabled && (
        <>
          <div>
            <label style={labelStyle}>Max Retries</label>
            <input
              type="number"
              min={1}
              max={10}
              value={data.retryPolicy.maxRetries ?? 3}
              onChange={(e) => onChange('retryPolicy', {
                ...data.retryPolicy,
                maxRetries: parseInt(e.target.value) || 3,
              })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Backoff (ms)</label>
            <input
              type="number"
              min={100}
              step={500}
              value={data.retryPolicy.backoffMs ?? 1000}
              onChange={(e) => onChange('retryPolicy', {
                ...data.retryPolicy,
                backoffMs: parseInt(e.target.value) || 1000,
              })}
              style={inputStyle}
            />
          </div>
        </>
      )}
    </>
  )
}
