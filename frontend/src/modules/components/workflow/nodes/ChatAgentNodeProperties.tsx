/**
 * ChatAgentNodeProperties - Property editor for Chat Agent nodes
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText, AlignLeft, Package, Search, Bot, MessageSquare, Shield,
  ChevronDown, ChevronRight, Plus, Wrench, Trash2, X, Clock, Archive,
  Maximize2, Loader2, Repeat, ShieldCheck, Cpu, Settings
} from 'lucide-react'
import type { ChatAgentNodeData, ChatAgentCheckpointConfig, AgentTool } from '../../../services/workflowTypes'
import { useEditorStore } from '../../../../stores/editorStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { LLMProviderConfig } from '../shared/property-components/LLMProviderConfig'
import { ErrorHandlerSelector } from '../shared/property-components/ErrorHandlerSelector'
import { searchLocalFiles } from '../shared/services/fileSearchService'
import { registryApi } from '../../../services/registryApi'

export interface ChatAgentNodePropertiesProps {
  data: ChatAgentNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ChatAgentNodeProperties({ data, onChange }: ChatAgentNodePropertiesProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('agent')
  const [expandedToolIndex, setExpandedToolIndex] = useState<number | null>(null)

  // Monaco editor state

  // File source search state (for Agent Prompt file selection)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ name: string; version: string; description?: string }>>([])
  const [localFileResults, setLocalFileResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const workspaceHandle = useEditorStore(state => state.explorerDirHandle)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  // Package file selection (step 2)
  const [selectedPackage, setSelectedPackage] = useState<{ name: string; version: string } | null>(null)
  const [packageFiles, setPackageFiles] = useState<string[]>([])
  const [loadingPackageFiles, setLoadingPackageFiles] = useState(false)

  // Source type for agent prompt
  const agentSourceType = data.agentPromptSourceType || 'raw'
  const isLocalSearch = searchQuery.trim().startsWith('.')

  // Update dropdown position
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

  // File search handler for agent prompt
  const handleAgentSourceSearch = useCallback(async (query: string) => {
    setSearchQuery(query)

    if (query.trim().length === 0) {
      setSearchResults([])
      setLocalFileResults([])
      setShowDropdown(false)
      return
    }

    const isLocal = query.trim().startsWith('.')

    if (!isLocal && query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      const canSearchLocal = workspaceHandle || (workspacePath && (window as Window & { electronAPI?: { readDir: unknown } }).electronAPI?.readDir)

      if (isLocal) {
        if (canSearchLocal) {
          const files = await searchLocalFiles(workspaceHandle, workspacePath, query)
          setLocalFileResults(files)
          setSearchResults([])
          setShowDropdown(true)
        } else {
          setLocalFileResults([])
          setSearchResults([])
          setShowDropdown(true)
        }
      } else {
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
      console.error('Agent prompt search failed:', err)
      setSearchResults([])
      setLocalFileResults([])
    } finally {
      setIsSearching(false)
    }
  }, [workspaceHandle, workspacePath])

  const handleSelectLocalFile = (filePath: string) => {
    onChange('agentPromptSource', filePath)
    setSearchQuery('')
    setShowDropdown(false)
    setLocalFileResults([])
  }

  const handleSelectPackage = async (pkg: { name: string; version: string }) => {
    setSelectedPackage(pkg)
    setSearchQuery('')
    setShowDropdown(false)
    setSearchResults([])

    setLoadingPackageFiles(true)
    try {
      const files = await registryApi.getPackageFiles(pkg.name, pkg.version)
      const prmdFiles = files.filter((f: string) => f.endsWith('.prmd'))
      setPackageFiles(prmdFiles)

      if (prmdFiles.length === 1) {
        onChange('agentPromptSource', `${pkg.name}@${pkg.version}/${prmdFiles[0]}`)
        setSelectedPackage(null)
        setPackageFiles([])
      }
    } catch (err) {
      console.error('Failed to load package files:', err)
      onChange('agentPromptSource', `${pkg.name}@${pkg.version}`)
      setSelectedPackage(null)
    } finally {
      setLoadingPackageFiles(false)
    }
  }

  const handleSelectPackageFile = (fileName: string) => {
    if (selectedPackage) {
      onChange('agentPromptSource', `${selectedPackage.name}@${selectedPackage.version}/${fileName}`)
      setSelectedPackage(null)
      setPackageFiles([])
    }
  }

  const handleCancelPackageSelection = () => {
    setSelectedPackage(null)
    setPackageFiles([])
  }

  const handleAgentSourceKeyDown = (e: React.KeyboardEvent) => {
    const hasResults = isLocalSearch ? localFileResults.length > 0 : searchResults.length > 0
    if (!hasResults) return

    const resultsLength = isLocalSearch ? localFileResults.length : searchResults.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => prev < resultsLength - 1 ? prev + 1 : prev)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev)
    } else if (e.key === 'Enter' && showDropdown) {
      e.preventDefault()
      if (isLocalSearch) {
        const selectedFile = localFileResults[highlightedIndex]
        if (selectedFile) handleSelectLocalFile(selectedFile)
      } else {
        const selectedPkg = searchResults[highlightedIndex]
        if (selectedPkg) handleSelectPackage(selectedPkg)
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const handleAgentSourceTypeChange = (newType: 'file' | 'raw') => {
    onChange('agentPromptSourceType', newType)
    if (newType === 'raw') {
      onChange('agentPromptSource', '')
    } else {
      onChange('agentSystemPrompt', '')
    }
  }

  // Checkpoint configuration helper
  const updateCheckpoint = (
    checkpointName: keyof NonNullable<ChatAgentNodeData['checkpoints']>,
    field: keyof ChatAgentCheckpointConfig,
    value: unknown
  ) => {
    const checkpoints = data.checkpoints || {}
    const currentCheckpoint = checkpoints[checkpointName] || { enabled: false }
    onChange('checkpoints', {
      ...checkpoints,
      [checkpointName]: {
        ...currentCheckpoint,
        [field]: value,
      },
    })
  }

  // Tool helpers (reused from AgentNodeProperties)
  const addTool = () => {
    const newTool: AgentTool = {
      name: '',
      description: '',
      toolType: 'function',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    }
    onChange('tools', [...(data.tools || []), newTool])
    setExpandedToolIndex((data.tools || []).length)
    setExpandedSection('tools')
  }

  const updateTool = (index: number, field: string, value: unknown) => {
    const newTools = [...(data.tools || [])]
    newTools[index] = { ...newTools[index], [field]: value }
    onChange('tools', newTools)
  }

  const removeTool = (index: number) => {
    const newTools = (data.tools || []).filter((_, i) => i !== index)
    onChange('tools', newTools)
    if (expandedToolIndex === index) {
      setExpandedToolIndex(null)
    } else if (expandedToolIndex !== null && expandedToolIndex > index) {
      setExpandedToolIndex(expandedToolIndex - 1)
    }
  }

  // Section header component
  const SectionHeader = ({ id, icon: Icon, title, badge }: {
    id: string
    icon: React.ComponentType<{ style?: React.CSSProperties }>
    title: string
    badge?: React.ReactNode
  }) => (
    <button
      onClick={() => setExpandedSection(expandedSection === id ? null : id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '10px 12px',
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text)',
        textAlign: 'left',
      }}
    >
      {expandedSection === id ? (
        <ChevronDown style={{ width: 14, height: 14, color: 'var(--muted)' }} />
      ) : (
        <ChevronRight style={{ width: 14, height: 14, color: 'var(--muted)' }} />
      )}
      <Icon style={{ width: 14, height: 14, color: 'var(--node-indigo)' }} />
      <span style={{ flex: 1 }}>{title}</span>
      {badge}
    </button>
  )

  return (
    <>
      {/* ============================================================== */}
      {/* AGENT CONFIGURATION */}
      {/* ============================================================== */}
      <SectionHeader
        id="agent"
        icon={Bot}
        title="Agent Configuration"
      />

      {expandedSection === 'agent' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '0 0 6px 6px',
          marginTop: '-1px',
          border: '1px solid var(--border)',
          borderTop: 'none',
        }}>
          {/* Agent Prompt Source Type Toggle */}
          <div>
            <label style={labelStyle}>Agent Prompt Source</label>
            <div style={{
              display: 'flex',
              background: 'var(--panel-2)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border)',
            }}>
              <button
                onClick={() => handleAgentSourceTypeChange('file')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '4px',
                  background: agentSourceType === 'file' ? 'var(--accent)' : 'transparent',
                  color: agentSourceType === 'file' ? 'white' : 'var(--text-secondary)',
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
                onClick={() => handleAgentSourceTypeChange('raw')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '4px',
                  background: agentSourceType === 'raw' ? 'var(--accent)' : 'transparent',
                  color: agentSourceType === 'raw' ? 'white' : 'var(--text-secondary)',
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

          {/* Raw Text Mode - System Prompt */}
          {agentSourceType === 'raw' && (
            <div>
              <label style={labelStyle}>System Prompt</label>
              <textarea
                value={data.agentSystemPrompt || ''}
                onChange={(e) => onChange('agentSystemPrompt', e.target.value)}
                placeholder="Define the agent's behavior and capabilities..."
                rows={4}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }}
              />
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                Supports {'{{ }}'} template expressions.
              </p>
            </div>
          )}

          {/* File Source Mode - .prmd file or package search */}
          {agentSourceType === 'file' && (
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Source (.prmd file or package)</label>

              {data.agentPromptSource ? (
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
                  {data.agentPromptSource.startsWith('.') ? (
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
                    {data.agentPromptSource}
                  </code>
                  <button
                    onClick={() => onChange('agentPromptSource', '')}
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
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                        {selectedPackage.name}@{selectedPackage.version}
                      </span>
                    </div>
                    <button
                      onClick={handleCancelPackageSelection}
                      style={{ padding: '2px 6px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '10px' }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div style={{ padding: '8px' }}>
                    {loadingPackageFiles ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', color: 'var(--muted)' }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Loading files...
                      </div>
                    ) : packageFiles.length === 0 ? (
                      <p style={{ fontSize: '11px', color: 'var(--muted)', padding: '8px' }}>No .prmd files found</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {packageFiles.map((file) => (
                          <button
                            key={file}
                            onClick={() => handleSelectPackageFile(file)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                              background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px',
                              cursor: 'pointer', color: 'var(--text)', fontSize: '12px', textAlign: 'left'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <FileText size={12} style={{ color: 'var(--accent)' }} />
                            {file}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Search input
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleAgentSourceSearch(e.target.value)}
                    onKeyDown={handleAgentSourceKeyDown}
                    onFocus={() => { if (searchQuery) setShowDropdown(true) }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    placeholder='Type "." for local files or package name...'
                    style={inputStyle}
                  />
                  {isSearching && (
                    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
                    </div>
                  )}

                  {/* Dropdown results */}
                  {showDropdown && dropdownPosition && createPortal(
                    <div style={{
                      position: 'fixed',
                      top: dropdownPosition.top,
                      left: dropdownPosition.left,
                      width: dropdownPosition.width,
                      maxHeight: '250px',
                      overflowY: 'auto',
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 10001
                    }}>
                      {isLocalSearch ? (
                        localFileResults.length === 0 ? (
                          <div style={{ padding: '12px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
                            {workspaceHandle || workspacePath ? 'No .prmd files found' : 'Open a workspace folder first'}
                          </div>
                        ) : (
                          localFileResults.map((file, idx) => (
                            <button
                              key={file}
                              onClick={() => handleSelectLocalFile(file)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                padding: '10px 12px', background: idx === highlightedIndex ? 'var(--panel-2)' : 'transparent',
                                border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: '12px', textAlign: 'left'
                              }}
                            >
                              <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                              <code style={{ fontFamily: 'monospace' }}>{file}</code>
                            </button>
                          ))
                        )
                      ) : (
                        searchResults.length === 0 ? (
                          <div style={{ padding: '12px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
                            No packages found
                          </div>
                        ) : (
                          searchResults.map((pkg, idx) => (
                            <button
                              key={`${pkg.name}@${pkg.version}`}
                              onClick={() => handleSelectPackage(pkg)}
                              style={{
                                display: 'flex', flexDirection: 'column', gap: '2px', width: '100%',
                                padding: '10px 12px', background: idx === highlightedIndex ? 'var(--panel-2)' : 'transparent',
                                border: 'none', cursor: 'pointer', textAlign: 'left'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Package size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                <code style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text)' }}>
                                  {pkg.name}@{pkg.version}
                                </code>
                              </div>
                              {pkg.description && (
                                <p style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '22px', marginTop: '2px' }}>
                                  {pkg.description}
                                </p>
                              )}
                            </button>
                          ))
                        )
                      )}
                    </div>,
                    document.body
                  )}
                </>
              )}
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                Type "." to search local files or a package name to search the registry.
              </p>
            </div>
          )}

          {/* User Prompt */}
          <div>
            <label style={labelStyle}>User Prompt (Task)</label>
            <textarea
              value={data.agentUserPrompt || ''}
              onChange={(e) => onChange('agentUserPrompt', e.target.value)}
              placeholder="{{ input }}"
              rows={2}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Use {'{{ input }}'} to pass through the previous node's output.
            </p>
          </div>

          {/* LLM Provider Config */}
          <LLMProviderConfig
            providerNodeId={data.providerNodeId}
            provider={data.provider}
            model={data.model}
            onProviderNodeChange={(nodeId) => onChange('providerNodeId', nodeId)}
            onProviderChange={(providerId) => onChange('provider', providerId)}
            onModelChange={(model) => onChange('model', model)}
          />

          {/* Max Iterations */}
          <div>
            <label style={labelStyle}>Max Iterations</label>
            <input
              type="number"
              value={data.maxIterations || 10}
              onChange={(e) => onChange('maxIterations', parseInt(e.target.value) || 10)}
              min={1}
              max={100}
              style={{ ...inputStyle, width: '100px' }}
            />
          </div>

          {/* Tool Call Format */}
          <div>
            <label style={labelStyle}>Tool Call Format</label>
            <select
              value={data.toolCallFormat || 'auto'}
              onChange={(e) => onChange('toolCallFormat', e.target.value)}
              style={selectStyle}
            >
              <option value="auto">Auto-detect</option>
              <option value="openai">OpenAI (function_call)</option>
              <option value="anthropic">Anthropic (tool_use)</option>
              <option value="xml">XML tags</option>
              <option value="json">Generic JSON</option>
            </select>
          </div>

          {/* Output Mode */}
          <div>
            <label style={labelStyle}>Output Mode</label>
            <select
              value={data.outputMode || 'final-response'}
              onChange={(e) => onChange('outputMode', e.target.value)}
              style={selectStyle}
            >
              <option value="final-response">Final Response Only</option>
              <option value="full-conversation">Full Conversation</option>
              <option value="last-tool-result">Last Tool Result</option>
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label style={labelStyle}>Temperature</label>
            <input
              type="number"
              value={data.temperature ?? 0.7}
              onChange={(e) => onChange('temperature', parseFloat(e.target.value) || 0.7)}
              min={0}
              max={2}
              step={0.1}
              style={{ ...inputStyle, width: '80px' }}
            />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* LOOP CONFIGURATION */}
      {/* ============================================================== */}
      <SectionHeader
        id="loop"
        icon={Repeat}
        title="Loop Configuration"
        badge={
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--panel)',
            color: 'var(--node-cyan)',
          }}>
            {data.loopMode || 'multi-turn'}
          </span>
        }
      />

      {expandedSection === 'loop' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '0 0 6px 6px',
          marginTop: '-1px',
          border: '1px solid var(--border)',
          borderTop: 'none',
        }}>
          {/* Loop Mode */}
          <div>
            <label style={labelStyle}>Loop Mode</label>
            <select
              value={data.loopMode || 'multi-turn'}
              onChange={(e) => onChange('loopMode', e.target.value)}
              style={selectStyle}
            >
              <option value="single-turn">Single Turn (no looping)</option>
              <option value="multi-turn">Multi-Turn (continue until condition)</option>
              <option value="until-complete">Until Complete (agent signals done)</option>
              <option value="user-driven">User-Driven (pause for input each turn)</option>
            </select>
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              {data.loopMode === 'single-turn' && 'Execute once and return immediately.'}
              {data.loopMode === 'until-complete' && 'Loop until the agent signals completion via stop phrase.'}
              {data.loopMode === 'user-driven' && 'Pause for user input after each agent response.'}
              {(!data.loopMode || data.loopMode === 'multi-turn') && 'Continue iterating until condition is false or max iterations reached.'}
            </p>
          </div>

          {/* Max Iterations */}
          <div>
            <label style={labelStyle}>Max Iterations</label>
            <input
              type="number"
              value={data.maxIterations || 10}
              onChange={(e) => onChange('maxIterations', parseInt(e.target.value) || 10)}
              min={1}
              max={100}
              style={{ ...inputStyle, width: '100px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Safety limit to prevent infinite loops.
            </p>
          </div>

          {/* Min Iterations (shown for multi-turn and until-complete) */}
          {(data.loopMode === 'multi-turn' || data.loopMode === 'until-complete') && (
            <div>
              <label style={labelStyle}>Min Iterations</label>
              <input
                type="number"
                value={data.minIterations || 0}
                onChange={(e) => onChange('minIterations', parseInt(e.target.value) || 0)}
                min={0}
                max={data.maxIterations || 10}
                style={{ ...inputStyle, width: '100px' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                Run at least this many iterations before checking stop condition.
              </p>
            </div>
          )}

          {/* Loop Condition (for multi-turn mode) */}
          {data.loopMode === 'multi-turn' && (
            <div>
              <label style={labelStyle}>Loop Condition</label>
              <input
                type="text"
                value={data.loopCondition || ''}
                onChange={(e) => onChange('loopCondition', e.target.value)}
                placeholder="{{ iteration < 5 }}"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                Continue while this expression is true. Use {'{{ iteration }}'}, {'{{ response }}'}, {'{{ tools_used }}'}.
              </p>
            </div>
          )}

          {/* Stop Phrases (for multi-turn and until-complete) */}
          {(data.loopMode === 'multi-turn' || data.loopMode === 'until-complete' || !data.loopMode) && (
            <div>
              <label style={labelStyle}>Stop Phrases</label>
              <textarea
                value={(data.stopPhrases || []).join('\n')}
                onChange={(e) => onChange('stopPhrases', e.target.value.split('\n').filter(s => s.trim()))}
                placeholder="TASK_COMPLETE&#10;DONE&#10;I have finished"
                rows={3}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }}
              />
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                Stop the loop when the response contains any of these phrases (one per line).
              </p>
            </div>
          )}

          {/* Loop on User Input (for user-driven mode) */}
          {data.loopMode === 'user-driven' && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={data.loopOnUserInput ?? true}
                onChange={(e) => onChange('loopOnUserInput', e.target.checked)}
                style={{ margin: 0, width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                Wait for user input after each response
              </span>
            </label>
          )}

          {/* Iteration Delay */}
          <div>
            <label style={labelStyle}>Iteration Delay (ms)</label>
            <input
              type="number"
              value={data.iterationDelayMs || 0}
              onChange={(e) => onChange('iterationDelayMs', parseInt(e.target.value) || 0)}
              min={0}
              max={30000}
              step={100}
              style={{ ...inputStyle, width: '120px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Delay between iterations (useful for rate limiting). 0 = no delay.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* USER INPUT CONFIGURATION */}
      {/* ============================================================== */}
      <SectionHeader
        id="userInput"
        icon={MessageSquare}
        title="User Input"
        badge={
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: data.userInputEnabled !== false ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'var(--panel)',
            color: data.userInputEnabled !== false ? 'var(--success)' : 'var(--muted)',
          }}>
            {data.userInputEnabled !== false ? 'Enabled' : 'Disabled'}
          </span>
        }
      />

      {expandedSection === 'userInput' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '0 0 6px 6px',
          marginTop: '-1px',
          border: '1px solid var(--border)',
          borderTop: 'none',
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
              checked={data.userInputEnabled !== false}
              onChange={(e) => onChange('userInputEnabled', e.target.checked)}
              style={{ margin: 0, width: '16px', height: '16px' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Prompt for user input at start
            </span>
          </label>

          {data.userInputEnabled !== false && (
            <>
              {/* Prompt Message */}
              <div>
                <label style={labelStyle}>Prompt Message</label>
                <input
                  type="text"
                  value={data.userInputPrompt || ''}
                  onChange={(e) => onChange('userInputPrompt', e.target.value)}
                  placeholder="Enter your message:"
                  style={inputStyle}
                />
              </div>

              {/* Input Type */}
              <div>
                <label style={labelStyle}>Input Type</label>
                <select
                  value={data.userInputType || 'textarea'}
                  onChange={(e) => onChange('userInputType', e.target.value)}
                  style={selectStyle}
                >
                  <option value="text">Single Line Text</option>
                  <option value="textarea">Multi-line Text</option>
                  <option value="choice">Choice Selection</option>
                  <option value="confirm">Yes/No Confirmation</option>
                </select>
              </div>

              {/* Placeholder */}
              <div>
                <label style={labelStyle}>Placeholder Text</label>
                <input
                  type="text"
                  value={data.userInputPlaceholder || ''}
                  onChange={(e) => onChange('userInputPlaceholder', e.target.value)}
                  placeholder="Type your message..."
                  style={inputStyle}
                />
              </div>

              {/* Show Context */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={data.userInputShowContext || false}
                  onChange={(e) => onChange('userInputShowContext', e.target.checked)}
                  style={{ margin: 0, width: '14px', height: '14px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Show previous context to user
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* GUARDRAIL CONFIGURATION */}
      {/* ============================================================== */}
      <SectionHeader
        id="guardrail"
        icon={ShieldCheck}
        title="Guardrail"
        badge={
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: data.guardrailEnabled ? 'color-mix(in srgb, var(--node-amber) 20%, transparent)' : 'var(--panel)',
            color: data.guardrailEnabled ? 'var(--node-amber)' : 'var(--muted)',
          }}>
            {data.guardrailEnabled ? 'Enabled' : 'Disabled'}
          </span>
        }
      />

      {expandedSection === 'guardrail' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '0 0 6px 6px',
          marginTop: '-1px',
          border: '1px solid var(--border)',
          borderTop: 'none',
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
              checked={data.guardrailEnabled || false}
              onChange={(e) => onChange('guardrailEnabled', e.target.checked)}
              style={{ margin: 0, width: '16px', height: '16px' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Validate input before processing
            </span>
          </label>

          {data.guardrailEnabled && (
            <>
              {/* System Prompt */}
              <div>
                <label style={labelStyle}>Validation System Prompt</label>
                <textarea
                  value={data.guardrailSystemPrompt || ''}
                  onChange={(e) => onChange('guardrailSystemPrompt', e.target.value)}
                  placeholder="Define validation criteria..."
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                />
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                  LLM will evaluate input against these criteria.
                </p>
              </div>

              {/* Guardrail LLM Provider Config */}
              <div style={{
                padding: '12px',
                background: 'var(--panel-2)',
                borderRadius: '6px',
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                }}>
                  <Cpu style={{ width: 12, height: 12 }} />
                  Guardrail LLM Provider
                </div>
                <LLMProviderConfig
                  providerNodeId={data.guardrailProviderNodeId}
                  provider={data.guardrailProvider}
                  model={data.guardrailModel}
                  onProviderNodeChange={(nodeId) => onChange('guardrailProviderNodeId', nodeId)}
                  onProviderChange={(providerId) => onChange('guardrailProvider', providerId)}
                  onModelChange={(model) => onChange('guardrailModel', model)}
                />
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
                  Tip: Use a fast, cheap model for guardrails (e.g., gpt-4o-mini, claude-3-haiku).
                </p>
              </div>

              {/* Guardrail Temperature */}
              <div>
                <label style={labelStyle}>Guardrail Temperature</label>
                <input
                  type="number"
                  value={data.guardrailTemperature ?? 0}
                  onChange={(e) => onChange('guardrailTemperature', parseFloat(e.target.value) || 0)}
                  min={0}
                  max={2}
                  step={0.1}
                  style={{ ...inputStyle, width: '80px' }}
                />
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                  Lower temperatures (0-0.3) recommended for consistent validation.
                </p>
              </div>

              {/* Validation Method Selection */}
              <div>
                <label style={labelStyle}>Validation Method</label>
                <select
                  value={data.guardrailPassExpression ? 'expression' : 'threshold'}
                  onChange={(e) => {
                    if (e.target.value === 'expression' && !data.guardrailPassExpression) {
                      onChange('guardrailPassExpression', '{{ input.valid == true }}')
                    } else if (e.target.value === 'threshold') {
                      onChange('guardrailPassExpression', '')
                    }
                  }}
                  style={inputStyle}
                >
                  <option value="expression">Pass Expression</option>
                  <option value="threshold">Score Threshold</option>
                </select>

                {/* Conditional input based on selection */}
                <div style={{ marginTop: '8px' }}>
                  {data.guardrailPassExpression ? (
                    <>
                      <input
                        type="text"
                        value={data.guardrailPassExpression}
                        onChange={(e) => onChange('guardrailPassExpression', e.target.value)}
                        placeholder="{{ input.valid == true }}"
                        style={{
                          ...inputStyle,
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          width: '100%',
                        }}
                      />
                      <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', marginBottom: 0 }}>
                        Evaluate LLM response with template expressions
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        value={data.guardrailScoreThreshold ?? 0.8}
                        onChange={(e) => onChange('guardrailScoreThreshold', parseFloat(e.target.value) || 0.8)}
                        min={0}
                        max={1}
                        step={0.05}
                        style={{ ...inputStyle, width: '80px' }}
                      />
                      <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', marginBottom: 0 }}>
                        Minimum score (0-1) required to pass
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TOOLS CONFIGURATION */}
      {/* ============================================================== */}
      <SectionHeader
        id="tools"
        icon={Wrench}
        title="Tools"
        badge={
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--panel)',
            color: 'var(--muted)',
          }}>
            {(data.tools || []).length}
          </span>
        }
      />

      {expandedSection === 'tools' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '0 0 6px 6px',
          marginTop: '-1px',
          border: '1px solid var(--border)',
          borderTop: 'none',
        }}>
          {/* Add Tool Button */}
          <button
            onClick={addTool}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'var(--panel-2)',
              border: '1px dashed var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--accent)',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Tool
          </button>

          {/* Tool List */}
          {(data.tools || []).map((tool, index) => (
            <div
              key={index}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {/* Tool Header */}
              <div
                onClick={() => setExpandedToolIndex(expandedToolIndex === index ? null : index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'var(--panel-2)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wrench style={{ width: 12, height: 12, color: 'var(--node-orange)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                    {tool.name || `Tool ${index + 1}`}
                  </span>
                  <span style={{
                    fontSize: '9px',
                    color: 'var(--muted)',
                    background: 'var(--bg)',
                    padding: '1px 4px',
                    borderRadius: '3px',
                  }}>
                    {tool.toolType}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTool(index)
                  }}
                  style={{
                    color: 'var(--error)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              </div>

              {/* Tool Details */}
              {expandedToolIndex === index && (
                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Name</label>
                    <input
                      type="text"
                      value={tool.name}
                      onChange={(e) => updateTool(index, 'name', e.target.value)}
                      placeholder="search_database"
                      style={{ ...inputStyle, fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Description</label>
                    <textarea
                      value={tool.description}
                      onChange={(e) => updateTool(index, 'description', e.target.value)}
                      placeholder="What this tool does..."
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '11px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Type</label>
                    <select
                      value={tool.toolType}
                      onChange={(e) => updateTool(index, 'toolType', e.target.value)}
                      style={{ ...selectStyle, fontSize: '12px' }}
                    >
                      <option value="function">Function</option>
                      <option value="http">HTTP Request</option>
                      <option value="mcp">MCP Server</option>
                      <option value="workflow">Sub-workflow</option>
                      <option value="command">Shell Command</option>
                      <option value="code">Code Execution</option>
                    </select>
                  </div>

                  {/* HTTP Config */}
                  {tool.toolType === 'http' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ width: '80px' }}>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>Method</label>
                          <select
                            value={tool.httpConfig?.method || 'GET'}
                            onChange={(e) => updateTool(index, 'httpConfig', {
                              ...tool.httpConfig,
                              method: e.target.value,
                            })}
                            style={{ ...selectStyle, fontSize: '11px', padding: '6px 8px' }}
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>URL</label>
                          <input
                            type="text"
                            value={tool.httpConfig?.url || ''}
                            onChange={(e) => updateTool(index, 'httpConfig', {
                              ...tool.httpConfig,
                              url: e.target.value,
                            })}
                            placeholder="https://api.example.com/search"
                            style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MCP Config */}
                  {tool.toolType === 'mcp' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                    }}>
                      <label style={{ ...labelStyle, fontSize: '10px' }}>MCP Server</label>
                      <input
                        type="text"
                        value={tool.mcpConfig?.serverName || ''}
                        onChange={(e) => updateTool(index, 'mcpConfig', {
                          ...tool.mcpConfig,
                          serverName: e.target.value,
                        })}
                        placeholder="Server name or URL"
                        style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                      />
                    </div>
                  )}

                  {/* Workflow Config */}
                  {tool.toolType === 'workflow' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                    }}>
                      <label style={{ ...labelStyle, fontSize: '10px' }}>Workflow Path</label>
                      <input
                        type="text"
                        value={tool.workflowConfig?.workflowPath || ''}
                        onChange={(e) => updateTool(index, 'workflowConfig', {
                          ...tool.workflowConfig,
                          workflowPath: e.target.value,
                        })}
                        placeholder="./sub-workflow.pdflow"
                        style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                      />
                    </div>
                  )}

                  {/* Command Config */}
                  {tool.toolType === 'command' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Executable</label>
                        <input
                          type="text"
                          value={tool.commandConfig?.executable || ''}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            executable: e.target.value,
                          })}
                          placeholder="npm, git, python, etc."
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Action</label>
                        <input
                          type="text"
                          value={tool.commandConfig?.action || ''}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            action: e.target.value,
                          })}
                          placeholder="install, status, run, etc."
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Arguments</label>
                        <input
                          type="text"
                          value={tool.commandConfig?.args || ''}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            args: e.target.value,
                          })}
                          placeholder="--save-dev express"
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={tool.commandConfig?.requiresApproval || false}
                          onChange={(e) => updateTool(index, 'commandConfig', {
                            ...tool.commandConfig,
                            requiresApproval: e.target.checked,
                          })}
                          style={{ cursor: 'pointer' }}
                        />
                        <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          Requires user approval
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Code Config */}
                  {tool.toolType === 'code' && (
                    <div style={{
                      padding: '10px',
                      background: 'var(--panel-2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Language</label>
                        <select
                          value={tool.codeConfig?.language || 'javascript'}
                          onChange={(e) => updateTool(index, 'codeConfig', {
                            ...tool.codeConfig,
                            language: e.target.value,
                          })}
                          style={{ ...selectStyle, fontSize: '11px', padding: '6px 8px' }}
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="typescript">TypeScript</option>
                          <option value="python">Python</option>
                          <option value="csharp">C#</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Code Snippet</label>
                        <textarea
                          value={tool.codeConfig?.snippet || ''}
                          onChange={(e) => updateTool(index, 'codeConfig', {
                            ...tool.codeConfig,
                            snippet: e.target.value,
                          })}
                          placeholder="// Your code here..."
                          rows={6}
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px', resize: 'vertical', fontFamily: 'monospace' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '10px' }}>Input Variable Name</label>
                        <input
                          type="text"
                          value={tool.codeConfig?.inputVariable || 'input'}
                          onChange={(e) => updateTool(index, 'codeConfig', {
                            ...tool.codeConfig,
                            inputVariable: e.target.value,
                          })}
                          placeholder="input"
                          style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Tip: Expand the Chat Agent node to drag Tool nodes inside for more complex setups.
          </p>
        </div>
      )}

      {/* ============================================================== */}
      {/* CHECKPOINTS CONFIGURATION */}
      {/* ============================================================== */}
      <SectionHeader
        id="checkpoints"
        icon={Settings}
        title="Checkpoints"
        badge={
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--panel)',
            color: 'var(--muted)',
          }}>
            {Object.values(data.checkpoints || {}).filter(cp => cp?.enabled).length} active
          </span>
        }
      />

      {expandedSection === 'checkpoints' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '0 0 6px 6px',
          marginTop: '-1px',
          border: '1px solid var(--border)',
          borderTop: 'none',
        }}>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
            Enable checkpoints to pause, log, or require approval at different stages.
          </p>

          {/* Checkpoint list */}
          {([
            { key: 'onUserInput', label: 'On User Input', desc: 'When user provides input' },
            { key: 'beforeGuardrail', label: 'Before Guardrail', desc: 'Before validation runs' },
            { key: 'afterGuardrail', label: 'After Guardrail', desc: 'After validation (pass or reject)' },
            { key: 'onIterationStart', label: 'Iteration Start', desc: 'Before each agent iteration' },
            { key: 'onIterationEnd', label: 'Iteration End', desc: 'After each agent iteration' },
            { key: 'onToolCall', label: 'On Tool Call', desc: 'When agent requests a tool' },
            { key: 'onToolResult', label: 'On Tool Result', desc: 'After tool execution returns' },
            { key: 'onAgentComplete', label: 'Agent Complete', desc: 'When agent finishes' },
          ] as { key: keyof NonNullable<ChatAgentNodeData['checkpoints']>; label: string; desc: string }[]).map(({ key, label, desc }) => {
            const checkpoint = data.checkpoints?.[key]
            const isEnabled = checkpoint?.enabled || false

            return (
              <div
                key={key}
                style={{
                  padding: '8px 10px',
                  background: isEnabled ? 'color-mix(in srgb, var(--warning) 8%, transparent)' : 'var(--panel-2)',
                  border: `1px solid ${isEnabled ? 'var(--warning)' : 'var(--border)'}`,
                  borderRadius: '6px',
                }}
              >
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => updateCheckpoint(key, 'enabled', e.target.checked)}
                    style={{ margin: 0, width: '14px', height: '14px' }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', flex: 1 }}>
                    {desc}
                  </span>
                </label>

                {isEnabled && (
                  <div style={{
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={checkpoint?.pause || false}
                        onChange={(e) => updateCheckpoint(key, 'pause', e.target.checked)}
                        style={{ margin: 0, width: '12px', height: '12px' }}
                      />
                      Pause
                    </label>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={checkpoint?.logToConsole || false}
                        onChange={(e) => updateCheckpoint(key, 'logToConsole', e.target.checked)}
                        style={{ margin: 0, width: '12px', height: '12px' }}
                      />
                      Log
                    </label>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={checkpoint?.requireApproval || false}
                        onChange={(e) => updateCheckpoint(key, 'requireApproval', e.target.checked)}
                        style={{ margin: 0, width: '12px', height: '12px' }}
                      />
                      Require Approval
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Info Box */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--node-indigo)' }}>Chat Agent Flow:</strong>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {data.userInputEnabled !== false && (
            <>
              <span style={{ padding: '2px 6px', background: 'var(--bg)', borderRadius: '3px' }}>User Input</span>
              <span>→</span>
            </>
          )}
          {data.guardrailEnabled && (
            <>
              <span style={{ padding: '2px 6px', background: 'var(--bg)', borderRadius: '3px' }}>Guardrail</span>
              <span>→</span>
            </>
          )}
          <span style={{ padding: '2px 6px', background: 'var(--bg)', borderRadius: '3px' }}>Agent</span>
          {(data.tools || []).length > 0 && (
            <>
              <span>↔</span>
              <span style={{ padding: '2px 6px', background: 'var(--bg)', borderRadius: '3px' }}>
                {(data.tools || []).length} Tool{(data.tools || []).length !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  )
}
