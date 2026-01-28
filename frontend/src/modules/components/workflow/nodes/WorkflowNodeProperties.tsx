/**
 * WorkflowNodeProperties - Property editor for Workflow nodes
 */

import { useState, useCallback, useRef } from 'react'
import { Loader2, Workflow, Plus, Trash2 } from 'lucide-react'
import type { WorkflowNodeData } from '../../../services/workflowTypes'
import { useEditorStore } from '../../../../stores/editorStore'
import { labelStyle, inputStyle } from '../shared/styles/propertyStyles'
import { searchLocalFilesByExtension } from '../shared/services/fileSearchService'

export interface WorkflowNodePropertiesProps {
  data: WorkflowNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function WorkflowNodeProperties({ data, onChange }: WorkflowNodePropertiesProps) {
  const [paramKey, setParamKey] = useState('')
  const [paramValue, setParamValue] = useState('')
  const [workflowFiles, setWorkflowFiles] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const workspaceHandle = useEditorStore(state => state.explorerDirHandle)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  const parameters = data.parameters || {}

  // Search for .pdflow files in workspace
  const searchWorkflowFiles = useCallback(async (query: string) => {
    const canSearchLocal = workspaceHandle || (workspacePath && (window as Window & { electronAPI?: { readDir: unknown } }).electronAPI?.readDir)
    if (!canSearchLocal) return

    setIsSearching(true)
    try {
      const files = await searchLocalFilesByExtension(workspaceHandle, workspacePath, query || '.', '.pdflow')
      setWorkflowFiles(files)
      setShowDropdown(true)
      setHighlightedIndex(0)
    } catch (err) {
      console.error('Failed to search workflow files:', err)
      setWorkflowFiles([])
    } finally {
      setIsSearching(false)
    }
  }, [workspaceHandle, workspacePath])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    onChange('source', value)

    // Search for files when input starts with "." or is being cleared
    if (value.startsWith('.') || value === '') {
      searchWorkflowFiles(value || '.')
    } else {
      setShowDropdown(false)
    }
  }

  const handleSelectFile = (filePath: string) => {
    onChange('source', filePath)
    setShowDropdown(false)
    setWorkflowFiles([])
  }

  const handleInputFocus = () => {
    // Show workflow files when focusing
    const currentValue = data.source || ''
    if (currentValue === '' || currentValue.startsWith('.')) {
      searchWorkflowFiles(currentValue || '.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Only handle navigation keys when dropdown is open
    if (!showDropdown || !workflowFiles.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => prev < workflowFiles.length - 1 ? prev + 1 : prev)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selectedFile = workflowFiles[highlightedIndex]
      if (selectedFile) handleSelectFile(selectedFile)
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

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

  return (
    <>
      {/* Source Workflow */}
      <div style={{ position: 'relative' }}>
        <label style={labelStyle}>Source Workflow</label>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={data.source || ''}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            onKeyDown={handleKeyDown}
            style={{
              ...inputStyle,
              paddingRight: isSearching ? '32px' : '12px',
            }}
            placeholder='Type "." to search workspace or enter path'
          />
          {isSearching && (
            <div style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
            }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
        </div>

        {/* Dropdown for workflow files */}
        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 100,
            }}
          >
            {workflowFiles.length > 0 ? (
              workflowFiles.map((file, index) => (
                <div
                  key={file}
                  onClick={() => handleSelectFile(file)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: 'var(--text)',
                    background: index === highlightedIndex ? 'var(--accent-bg)' : 'transparent',
                    borderBottom: index < workflowFiles.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Workflow size={12} style={{ color: 'var(--node-teal)', flexShrink: 0 }} />
                    <span>{file}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{
                padding: '12px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '11px',
              }}>
                {isSearching ? 'Searching...' : 'No .pdflow files found in workspace'}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Path to .pdflow file or package reference
        </div>
      </div>

      {/* Parameters */}
      <div>
        <label style={labelStyle}>Parameters</label>
        <div style={{
          border: '1px solid var(--input-border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          {Object.entries(parameters).length > 0 ? (
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {Object.entries(parameters).map(([key, value]) => (
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
            <div style={{
              padding: '12px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '11px',
              background: 'var(--input-bg)',
            }}>
              No parameters defined
            </div>
          )}

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
          value={data.timeout ?? 60000}
          onChange={(e) => onChange('timeout', parseInt(e.target.value) || 60000)}
          style={inputStyle}
        />
      </div>

      {/* Inherit Variables */}
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
            checked={data.inheritVariables ?? false}
            onChange={(e) => onChange('inheritVariables', e.target.checked)}
          />
          Inherit parent workflow variables
        </label>
      </div>

      {/* Max Recursion Depth */}
      <div>
        <label style={labelStyle}>Max Recursion Depth</label>
        <input
          type="number"
          min={1}
          max={10}
          value={data.maxDepth ?? 5}
          onChange={(e) => onChange('maxDepth', parseInt(e.target.value) || 5)}
          style={inputStyle}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Prevents infinite loops in recursive workflows
        </div>
      </div>
    </>
  )
}
