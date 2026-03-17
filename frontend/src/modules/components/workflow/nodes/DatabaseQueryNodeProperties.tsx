/**
 * DatabaseQueryNodeProperties - Property editor for Database Query nodes
 *
 * Adapts fields and Monaco editor language based on the connected database type:
 * - PostgreSQL / MySQL / SQLite: SQL editor with parameterized query support
 * - MongoDB: JSON editor for query documents + collection field
 * - Redis: Plaintext editor for Redis commands
 */

import { Editor } from '@monaco-editor/react'
import { Maximize2 } from 'lucide-react'
import type { DatabaseQueryNodeData, DatabaseConnectionConfig } from '../../../services/workflowTypes'
import { useUIStore } from '../../../../stores/uiStore'
import { useConnection } from '../shared/hooks/useNodeConnections'

import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

import { getMonacoTheme } from '../../../lib/monacoConfig'

export interface DatabaseQueryNodePropertiesProps {
  data: DatabaseQueryNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
  onExpandEditor?: (content: string, language: string, label: string, field: string) => void
}

/** Placeholder syntax help per database type */
const PARAM_HELP: Record<string, string> = {
  postgresql: 'Use $1, $2, $3 placeholders in SQL. Parameters: ["value1", 42]',
  mysql: 'Use ? placeholders in SQL. Parameters: ["value1", 42]',
  sqlite: 'Use ? placeholders in SQL. Parameters: ["value1", 42]',
  mongodb: 'Filter: { "key": "val" } | With projection: [{ filter }, { "field": 1 }]',
  redis: 'Arguments are part of the command. e.g. GET mykey',
}

/** Monaco language per database type */
function getMonacoLanguage(dbType?: string): string {
  switch (dbType) {
    case 'mongodb':
      return 'json'
    case 'redis':
      return 'plaintext'
    default:
      return 'sql'
  }
}

/** Query placeholder per database type */
function getQueryPlaceholder(dbType?: string, queryType?: string): string {
  switch (dbType) {
    case 'mongodb':
      if (queryType === 'aggregate') {
        return '[\n  { "$match": { "status": "active" } },\n  { "$group": { "_id": "$category", "count": { "$sum": 1 } } }\n]'
      }
      return '{\n  "name": "John",\n  "age": { "$gt": 25 }\n}'
    case 'redis':
      return 'GET mykey'
    default:
      return 'SELECT * FROM users WHERE id = $1 LIMIT 100'
  }
}

export function DatabaseQueryNodeProperties({ data, onChange, onExpandEditor }: DatabaseQueryNodePropertiesProps) {
  const theme = useUIStore(state => state.theme)

  // Look up the connected database type
  const connection = useConnection(data.connectionId)
  const dbType = connection?.type === 'database'
    ? (connection.config as DatabaseConnectionConfig).dbType
    : undefined

  const isMongo = dbType === 'mongodb'
  const isRedis = dbType === 'redis'
  const isSql = !isMongo && !isRedis

  // Query type options adapt based on db type
  const queryTypeOptions = isMongo
    ? [
        { value: 'select', label: 'Find' },
        { value: 'insert', label: 'Insert' },
        { value: 'update', label: 'Update' },
        { value: 'delete', label: 'Delete' },
        { value: 'aggregate', label: 'Aggregate' },
        { value: 'raw', label: 'Raw Command' },
      ]
    : isRedis
      ? [
          { value: 'raw', label: 'Command' },
        ]
      : [
          { value: 'select', label: 'SELECT' },
          { value: 'insert', label: 'INSERT' },
          { value: 'update', label: 'UPDATE' },
          { value: 'delete', label: 'DELETE' },
          { value: 'raw', label: 'Raw SQL' },
        ]

  const monacoLanguage = getMonacoLanguage(dbType)

  return (
    <>
      {/* Query Type */}
      <div>
        <label style={labelStyle}>Query Type</label>
        <select
          value={data.queryType || 'select'}
          onChange={(e) => onChange('queryType', e.target.value)}
          style={selectStyle}
        >
          {queryTypeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* MongoDB Collection */}
      {isMongo && (
        <div>
          <label style={labelStyle}>Collection</label>
          <input
            type="text"
            value={data.collection || ''}
            onChange={(e) => onChange('collection', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="users"
          />
        </div>
      )}

      {/* Query Editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>
            {isMongo ? 'Query Document' : isRedis ? 'Command' : 'SQL Query'}
          </label>
          {onExpandEditor && (
            <button
              onClick={() => onExpandEditor(
                data.query || '',
                monacoLanguage,
                isMongo ? 'Query Document' : isRedis ? 'Command' : 'SQL Query',
                'query'
              )}
              title="Open in expanded editor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <Maximize2 size={11} />
              Expand
            </button>
          )}
        </div>
        <div
          style={{
            border: '1px solid var(--input-border)',
            borderRadius: '6px',
            overflow: 'hidden',
            height: '200px',
          }}
        >
          <Editor
            value={data.query || ''}
            onChange={(val) => onChange('query', val || '')}
            language={monacoLanguage}
            theme={getMonacoTheme(theme === 'dark')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              fontSize: 12,
              padding: { top: 8 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              fixedOverflowWidgets: true,
            }}
          />
        </div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {getQueryPlaceholder(dbType, data.queryType)}
        </div>
      </div>

      {/* Parameters (SQL only) */}
      {isSql && (
        <div>
          <label style={labelStyle}>Parameters (JSON Array)</label>
          <input
            type="text"
            value={data.parameters || ''}
            onChange={(e) => onChange('parameters', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
            placeholder='["value1", 42, true]'
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {PARAM_HELP[dbType || 'postgresql']}
          </div>
        </div>
      )}

      {/* Max Rows */}
      {!isRedis && (
        <div>
          <label style={labelStyle}>Max Rows</label>
          <input
            type="number"
            min={1}
            step={100}
            value={data.maxRows ?? 1000}
            onChange={(e) => onChange('maxRows', parseInt(e.target.value) || 1000)}
            style={inputStyle}
            placeholder="1000"
          />
        </div>
      )}

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={data.timeoutMs ?? 30000}
          onChange={(e) => onChange('timeoutMs', parseInt(e.target.value) || 30000)}
          style={inputStyle}
          placeholder="30000"
        />
      </div>
    </>
  )
}
