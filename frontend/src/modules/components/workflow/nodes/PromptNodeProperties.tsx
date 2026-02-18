/**
 * PromptNodeProperties - Property editor for Prompt nodes
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { FileText, AlignLeft, Package, Search, Shield, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { PromptNodeData } from '../../../services/workflowTypes'
import { useEditorStore } from '../../../../stores/editorStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { LLMProviderConfig } from '../shared/property-components/LLMProviderConfig'
import { searchLocalFiles } from '../shared/services/fileSearchService'
import { registryApi } from '../../../services/registryApi'

export interface PromptNodePropertiesProps {
  data: PromptNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
  onOpenPrompd?: () => void
}

export function PromptNodeProperties({ data, onChange, onOpenPrompd }: PromptNodePropertiesProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ name: string; version: string; description?: string }>>([])
  const [localFileResults, setLocalFileResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const [guardrailExpanded, setGuardrailExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const workspaceHandle = useEditorStore(state => state.explorerDirHandle)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  // Get active workflow file path to convert workspace-relative to workflow-file-relative
  const tabs = useEditorStore(state => state.tabs)
  const activeTabId = useEditorStore(state => state.activeTabId)
  const activeTab = tabs.find(t => t.id === activeTabId)
  const workflowFilePath = activeTab?.filePath || null

  // Source type - defaults to 'file' if not set
  const sourceType = data.sourceType || 'file'

  // For package file selection (step 2)
  const [selectedPackage, setSelectedPackage] = useState<{ name: string; version: string } | null>(null)
  const [packageFiles, setPackageFiles] = useState<string[]>([])
  const [loadingPackageFiles, setLoadingPackageFiles] = useState(false)

  // Update dropdown position when shown
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      })
    }
  }, [showDropdown])

  // Determine if searching locally (starts with "." or "..")
  const trimmedQuery = searchQuery.trim()
  const isLocalSearch = trimmedQuery.startsWith('.') || trimmedQuery.startsWith('..')

  // Convert workspace-relative path (./folder/file) to workflow-file-relative path (../folder/file)
  const convertToWorkflowRelative = (workspaceRelativePath: string): string => {
    if (!workflowFilePath || !workspacePath) return workspaceRelativePath

    // Remove leading ./ from workspace-relative path
    const cleanPath = workspaceRelativePath.replace(/^\.\//, '')

    // Get workflow directory - use Math.max to handle both / and \ separators
    const lastSlash = Math.max(workflowFilePath.lastIndexOf('/'), workflowFilePath.lastIndexOf('\\'))
    const workflowDir = lastSlash > 0 ? workflowFilePath.substring(0, lastSlash) : workflowFilePath

    // Normalize both paths for cross-platform comparison
    const normalizedWorkflowDir = workflowDir.replace(/\\/g, '/')
    const normalizedWorkspace = workspacePath.replace(/\\/g, '/')

    // Calculate workflow directory relative to workspace root
    const workflowDirFromRoot = normalizedWorkflowDir.startsWith(normalizedWorkspace)
      ? normalizedWorkflowDir.substring(normalizedWorkspace.length).replace(/^\//, '')
      : normalizedWorkflowDir.replace(/^\//, '')
    const depth = workflowDirFromRoot ? workflowDirFromRoot.split('/').length : 0

    // Build relative path with appropriate number of ../
    const prefix = depth > 0 ? '../'.repeat(depth) : './'
    return prefix + cleanPath
  }

  // Debounced search handler
  const handleSearchChange = useCallback(async (query: string) => {
    setSearchQuery(query)

    if (query.trim().length === 0) {
      setSearchResults([])
      setLocalFileResults([])
      setShowDropdown(false)
      return
    }

    const trimmedQueryInner = query.trim()
    const isLocal = trimmedQueryInner.startsWith('.') || trimmedQueryInner.startsWith('..')

    // For package search require 2+ chars, for local search just need "."
    if (!isLocal && query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      // Check if we can search local files (either via handle or Electron path)
      const canSearchLocal = workspaceHandle || (workspacePath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir)

      console.log('[PropertiesPanel] Local search debug:', {
        query,
        isLocal,
        canSearchLocal,
        workspaceHandle: !!workspaceHandle,
        workspacePath,
        electronAPI: !!(window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir
      })

      if (isLocal) {
        if (canSearchLocal) {
          // Search local .prmd files
          const files = await searchLocalFiles(workspaceHandle, workspacePath, query)
          console.log('[PropertiesPanel] Found files:', files)
          setLocalFileResults(files)
          setSearchResults([])
          setShowDropdown(true) // Always show dropdown for local search to show feedback
        } else {
          // No workspace available - show message
          console.log('[PropertiesPanel] No workspace available')
          setLocalFileResults([])
          setSearchResults([])
          setShowDropdown(true) // Show dropdown with "no workspace" message
        }
      } else {
        // Search registry packages
        const result = await registryApi.searchPackages(query, 10)
        const packages = result.packages.map((pkg: { name: string; version: string; description?: string }) => ({
          name: pkg.name,
          version: pkg.version,
          description: pkg.description
        }))
        setSearchResults(packages)
        setLocalFileResults([])
        setShowDropdown(true)
      }
      setHighlightedIndex(0)
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
      setLocalFileResults([])
    } finally {
      setIsSearching(false)
    }
  }, [workspaceHandle, workspacePath])

  const handleSelectLocalFile = (filePath: string) => {
    // If it's a workspace-relative path from dropdown, convert to workflow-file-relative
    const finalPath = filePath.startsWith('./') ? convertToWorkflowRelative(filePath) : filePath
    console.log('[PromptNodeProperties] Selected file:', filePath, '→', finalPath)
    onChange('source', finalPath)
    setSearchQuery('')
    setShowDropdown(false)
    setLocalFileResults([])
  }

  const handleSelectPackage = async (pkg: { name: string; version: string }) => {
    setSelectedPackage(pkg)
    setSearchQuery('')
    setShowDropdown(false)
    setSearchResults([])

    // Load package files
    setLoadingPackageFiles(true)
    try {
      const files = await registryApi.getPackageFiles(pkg.name, pkg.version)
      // Filter to only .prmd files
      const prmdFiles = files.filter((f: string) => f.endsWith('.prmd'))
      setPackageFiles(prmdFiles)

      // If only one .prmd file, auto-select it
      if (prmdFiles.length === 1) {
        onChange('source', `${pkg.name}@${pkg.version}/${prmdFiles[0]}`)
        setSelectedPackage(null)
        setPackageFiles([])
      }
    } catch (err) {
      console.error('Failed to load package files:', err)
      // Fallback: set package without specific file
      onChange('source', `${pkg.name}@${pkg.version}`)
      setSelectedPackage(null)
    } finally {
      setLoadingPackageFiles(false)
    }
  }

  const handleSelectPackageFile = (fileName: string) => {
    if (selectedPackage) {
      onChange('source', `${selectedPackage.name}@${selectedPackage.version}/${fileName}`)
      setSelectedPackage(null)
      setPackageFiles([])
    }
  }

  const handleCancelPackageSelection = () => {
    setSelectedPackage(null)
    setPackageFiles([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const hasResults = isLocalSearch ? localFileResults.length > 0 : searchResults.length > 0
    const resultsLength = isLocalSearch ? localFileResults.length : searchResults.length

    if (e.key === 'ArrowDown' && hasResults) {
      e.preventDefault()
      setHighlightedIndex(prev => prev < resultsLength - 1 ? prev + 1 : prev)
    } else if (e.key === 'ArrowUp' && hasResults) {
      e.preventDefault()
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev)
    } else if (e.key === 'Enter') {
      e.preventDefault()

      // For local file search, allow direct path entry
      if (isLocalSearch) {
        const trimmedQuery = searchQuery.trim()

        // Always use typed path directly - don't use dropdown results
        // This preserves ../ relative paths instead of converting to ./ workspace-relative
        if (trimmedQuery.length > 0) {
          handleSelectLocalFile(trimmedQuery)
        }
      } else {
        // For package search, only select from dropdown
        if (hasResults && showDropdown) {
          const selectedPkg = searchResults[highlightedIndex]
          if (selectedPkg) handleSelectPackage(selectedPkg)
        }
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  // Handle source type change
  const handleSourceTypeChange = (newType: 'file' | 'raw') => {
    onChange('sourceType', newType)
    // Clear the opposite source when switching
    if (newType === 'raw') {
      onChange('source', '')
    } else {
      onChange('rawPrompt', '')
    }
  }

  return (
    <>
      {/* Source Type Toggle */}
      <div>
        <label style={labelStyle}>Source Type</label>
        <div style={{
          display: 'flex',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          padding: '2px',
          border: '1px solid var(--border)',
        }}>
          <button
            onClick={() => handleSourceTypeChange('file')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: sourceType === 'file' ? 'var(--accent)' : 'transparent',
              color: sourceType === 'file' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <FileText size={12} />
            File
          </button>
          <button
            onClick={() => handleSourceTypeChange('raw')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: sourceType === 'raw' ? 'var(--accent)' : 'transparent',
              color: sourceType === 'raw' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <AlignLeft size={12} />
            Raw Text
          </button>
        </div>
      </div>

      {/* Raw Text Mode */}
      {sourceType === 'raw' && (
        <div>
          <label style={labelStyle}>Prompt Text</label>
          <textarea
            value={data.rawPrompt || ''}
            onChange={(e) => onChange('rawPrompt', e.target.value)}
            placeholder="Enter your prompt text here...&#10;&#10;You can use {{ parameters }} and {{ previous_output }}"
            rows={8}
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: '12px',
              minHeight: '150px',
            }}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Supports {'{{ }}'} template expressions. Will be compiled as .prmd format.
          </p>
        </div>
      )}

      {/* File Source selector with local file and package search */}
      {sourceType === 'file' && (
      <div style={{ position: 'relative' }}>
        <label style={labelStyle}>Source (.prmd file or package)</label>

        {data.source ? (
          // Show selected source
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '6px'
          }}>
            {data.source.startsWith('.') ? (
              <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            ) : (
              <Package size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            )}
            <code style={{
              fontSize: '12px',
              color: 'var(--text)',
              fontFamily: 'monospace',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {data.source}
            </code>
            {onOpenPrompd && (
              <button
                onClick={onOpenPrompd}
                title="Open in editor"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  borderRadius: '3px',
                  transition: 'color 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <ExternalLink size={13} />
              </button>
            )}
            <button
              onClick={() => onChange('source', '')}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '10px'
              }}
            >
              Change
            </button>
          </div>
        ) : selectedPackage ? (
          // Step 2: Select file from package
          <div style={{
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            {/* Package header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--panel-2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={14} style={{ color: 'var(--accent)' }} />
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  fontFamily: 'monospace'
                }}>
                  {selectedPackage.name}@{selectedPackage.version}
                </span>
              </div>
              <button
                onClick={handleCancelPackageSelection}
                style={{
                  padding: '2px 6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: '10px'
                }}
              >
                Cancel
              </button>
            </div>

            {/* File list */}
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {loadingPackageFiles ? (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}>
                  Loading files...
                </div>
              ) : packageFiles.length === 0 ? (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic'
                }}>
                  No .prmd files found in this package
                </div>
              ) : (
                <>
                  <div style={{
                    padding: '6px 12px',
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    Select a prompt file:
                  </div>
                  {packageFiles.map((file) => (
                    <div
                      key={file}
                      onClick={() => handleSelectPackageFile(file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent)'
                        e.currentTarget.style.color = 'white'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--text)'
                      }}
                    >
                      <FileText size={12} style={{ flexShrink: 0 }} />
                      <span style={{
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {file}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          // Search input
          <>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none'
              }} />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchQuery.length > 0) setShowDropdown(true)
                }}
                onBlur={() => {
                  // Delay to allow click on dropdown items
                  setTimeout(() => setShowDropdown(false), 200)
                }}
                placeholder="Type . for local files, or search packages..."
                style={{
                  ...inputStyle,
                  paddingLeft: '32px'
                }}
              />
              {isSearching && (
                <span style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '10px',
                  color: 'var(--text-secondary)'
                }}>
                  Searching...
                </span>
              )}
            </div>

            {/* Dropdown results - rendered as portal to escape overflow clipping */}
            {showDropdown && dropdownPosition && createPortal(
              <div style={{
                position: 'fixed',
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 9999
              }}>
                {/* Local file results */}
                {isLocalSearch && localFileResults.map((filePath, index) => {
                  // Convert workspace-relative paths to workflow-file-relative for display
                  const displayPath = filePath.startsWith('./') ? convertToWorkflowRelative(filePath) : filePath
                  return (
                    <div
                      key={filePath}
                      onMouseDown={() => handleSelectLocalFile(filePath)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: index === highlightedIndex ? 'var(--accent)' : 'transparent'
                      }}
                    >
                      <FileText size={14} style={{
                        color: index === highlightedIndex ? 'white' : 'var(--accent)',
                        flexShrink: 0
                      }} />
                      <span style={{
                        fontSize: '12px',
                        color: index === highlightedIndex ? 'white' : 'var(--text)',
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {displayPath}
                      </span>
                    </div>
                  )
                })}

                {/* Package results */}
                {!isLocalSearch && searchResults.map((pkg, index) => (
                  <div
                    key={`${pkg.name}@${pkg.version}`}
                    onMouseDown={() => handleSelectPackage(pkg)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: index === highlightedIndex ? 'var(--accent)' : 'transparent'
                    }}
                  >
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: index === highlightedIndex ? 'white' : 'var(--text)',
                      fontFamily: 'monospace'
                    }}>
                      {pkg.name}@{pkg.version}
                    </div>
                    {pkg.description && (
                      <div style={{
                        fontSize: '10px',
                        color: index === highlightedIndex ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {pkg.description}
                      </div>
                    )}
                  </div>
                ))}

                {/* No results */}
                {((isLocalSearch && localFileResults.length === 0) ||
                  (!isLocalSearch && searchResults.length === 0)) &&
                  !isSearching && searchQuery.length >= 1 && (
                  <div style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic'
                  }}>
                    {isLocalSearch
                      ? (workspaceHandle || workspacePath
                          ? `No local .prmd files found matching "${searchQuery}"`
                          : 'Open a folder first to search local files')
                      : `No packages found for "${searchQuery}"`}
                  </div>
                )}
              </div>,
              document.body
            )}
          </>
        )}
      </div>
      )}

      {/* Provider Configuration - either reference a provider node or use inline */}
      <LLMProviderConfig
        providerNodeId={data.providerNodeId}
        provider={data.provider}
        model={data.model}
        onProviderNodeChange={(nodeId) => onChange('providerNodeId', nodeId)}
        onProviderChange={(providerId) => onChange('provider', providerId)}
        onModelChange={(model) => onChange('model', model)}
        label="Provider Source"
      />

      <div>
        <label style={labelStyle}>Auto-inject Previous Output</label>
        <select
          value={data.context?.previous_output || 'none'}
          onChange={(e) => onChange('context', {
            ...data.context,
            previous_output: e.target.value === 'none' ? undefined : e.target.value
          })}
          style={selectStyle}
        >
          <option value="none">None</option>
          <option value="auto">Auto (as previous_output)</option>
        </select>
      </div>

      {/* Guardrail Settings - Collapsible Section */}
      <div style={{
        marginTop: '16px',
        borderTop: '1px solid var(--border)',
        paddingTop: '12px'
      }}>
        <button
          onClick={() => setGuardrailExpanded(!guardrailExpanded)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 10px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={14} style={{ color: 'var(--accent)' }} />
            Guardrail Settings
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: data.guardrail?.enabled ? 'color-mix(in srgb, var(--node-amber) 20%, transparent)' : 'var(--panel)',
              color: data.guardrail?.enabled ? 'var(--node-amber)' : 'var(--muted)',
            }}>
              {data.guardrail?.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {guardrailExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {guardrailExpanded && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* Enable/Disable Toggle */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={data.guardrail?.enabled || false}
                onChange={(e) => onChange('guardrail', {
                  ...data.guardrail,
                  enabled: e.target.checked
                })}
                style={{ margin: 0, width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                Validate output before passing to next node
              </span>
            </label>

            {data.guardrail?.enabled && (
            <>
            {/* Output Mode */}
            <div>
              <label style={labelStyle}>Output Mode</label>
              <select
                value={data.guardrail?.outputMode || 'passthrough'}
                onChange={(e) => onChange('guardrail', {
                  ...data.guardrail,
                  outputMode: e.target.value as 'passthrough' | 'original' | 'reject-message'
                })}
                style={selectStyle}
              >
                <option value="passthrough">Pass Through (return LLM response)</option>
                <option value="original">Pass Original Input (when clean)</option>
                <option value="reject-message">Custom Reject Message</option>
              </select>
              <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                What to output when guardrail passes
              </p>
            </div>

            {/* Expected Response Format */}
            <div>
              <label style={labelStyle}>Expected Response Format</label>
              <select
                value={data.guardrail?.expectedFormat || 'json'}
                onChange={(e) => onChange('guardrail', {
                  ...data.guardrail,
                  expectedFormat: e.target.value as 'json' | 'text'
                })}
                style={selectStyle}
              >
                <option value="json">JSON Object</option>
                <option value="text">Plain Text</option>
              </select>
            </div>

            {data.guardrail?.expectedFormat === 'json' && (
              <>
                {/* Field to Check */}
                <div>
                  <label style={labelStyle}>Rejection Field</label>
                  <input
                    type="text"
                    value={data.guardrail?.rejectionField || 'rejected'}
                    onChange={(e) => onChange('guardrail', {
                      ...data.guardrail,
                      rejectionField: e.target.value
                    })}
                    placeholder="rejected"
                    style={inputStyle}
                  />
                  <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                    JSON field that indicates rejection (e.g., "rejected", "blocked", "unsafe")
                  </p>
                </div>

                {/* Pass Condition */}
                <div>
                  <label style={labelStyle}>Pass When</label>
                  <select
                    value={data.guardrail?.passWhen || 'false'}
                    onChange={(e) => onChange('guardrail', {
                      ...data.guardrail,
                      passWhen: e.target.value as 'false' | 'true'
                    })}
                    style={selectStyle}
                  >
                    <option value="false">Field is false</option>
                    <option value="true">Field is true</option>
                  </select>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                    Workflow continues if this condition is met
                  </p>
                </div>

                {/* Advanced: Custom Rejection Expression */}
                <div>
                  <label style={labelStyle}>
                    Custom Rejection Expression (Advanced)
                  </label>
                  <input
                    type="text"
                    value={data.guardrail?.rejectionExpression || ''}
                    onChange={(e) => onChange('guardrail', {
                      ...data.guardrail,
                      rejectionExpression: e.target.value
                    })}
                    placeholder="e.g., {{ response.rejected === true || response.score > 0.8 }}"
                    style={inputStyle}
                  />
                  <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                    Optional: Override field check with custom expression. Supports {'{{ }}'} syntax.
                  </p>
                </div>
              </>
            )}

            {/* Action on Fail */}
            <div>
              <label style={labelStyle}>Action on Fail</label>
              <select
                value={data.guardrail?.failAction || 'error'}
                onChange={(e) => onChange('guardrail', {
                  ...data.guardrail,
                  failAction: e.target.value as 'error' | 'stop' | 'continue'
                })}
                style={selectStyle}
              >
                <option value="error">Throw Error</option>
                <option value="stop">Stop Workflow Silently</option>
                <option value="continue">Continue Anyway (log warning)</option>
              </select>
            </div>

            {/* Custom Reject Message */}
            {data.guardrail?.outputMode === 'reject-message' && (
              <div>
                <label style={labelStyle}>Custom Reject Message</label>
                <textarea
                  value={data.guardrail?.customRejectMessage || ''}
                  onChange={(e) => onChange('guardrail', {
                    ...data.guardrail,
                    customRejectMessage: e.target.value
                  })}
                  placeholder="Input rejected by guardrail"
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontSize: '11px'
                  }}
                />
                <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                  Message to show when guardrail fails
                </p>
              </div>
            )}

            {/* Example Configuration */}
            <div style={{
              padding: '8px 10px',
              background: 'var(--panel)',
              borderRadius: '4px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Example Setup:
              </div>
              <code style={{
                fontSize: '10px',
                color: 'var(--muted)',
                fontFamily: 'monospace',
                display: 'block',
                lineHeight: '1.4'
              }}>
                1. LLM returns: {`{"rejected": false, "score": 0}`}<br />
                2. Check field "rejected" === false<br />
                3. If true → output original input<br />
                4. If false → throw error
              </code>
            </div>
            </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
