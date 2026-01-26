/**
 * WorkflowPropertiesPanel - Side panel for editing selected node properties
 *
 * ============================================================================
 * REFACTORING NOTES (TODO - Prioritize this cleanup)
 * ============================================================================
 *
 * This file has grown too large (~5000+ lines) and needs restructuring.
 * Discussion points and proposed approach:
 *
 * 1. EXTRACT NODE PROPERTIES TO SEPARATE FILES
 *    - Move each *NodeProperties function to its own file in a `properties/` folder
 *    - Example structure:
 *      properties/
 *        PromptNodeProperties.tsx
 *        AgentNodeProperties.tsx
 *        ChatAgentNodeProperties.tsx
 *        MemoryNodeProperties.tsx
 *        ...etc
 *    - This file becomes a thin router that imports and renders the right component
 *
 * 2. CREATE SHARED PROPERTY COMPONENTS
 *    - Extract common patterns into reusable components:
 *      - SourceSelector (file/raw toggle + search) - used by Prompt, ChatAgent
 *      - LLMProviderConfig (provider/model dropdowns) - already exists, maybe enhance
 *      - ConditionEditor (expression input with validation)
 *      - ToolDefinitionEditor (tool schema builder)
 *      - CollapsibleSection (the section header + expand/collapse pattern)
 *
 * 3. SHARED HOOKS
 *    - useSourceSearch() - local file + registry package search logic
 *    - useProviderNodes() - find provider nodes in workflow
 *    - useNodeConnections() - find connected nodes for dropdowns
 *
 * 4. FILE SEARCH CONSOLIDATION
 *    - searchLocalFiles() and searchLocalFilesByExtension() are duplicated
 *    - Move to a shared service (e.g., fileSearchService.ts)
 *
 * 5. STYLE CONSOLIDATION
 *    - inputStyle, labelStyle, selectStyle, etc. are defined inline
 *    - Move to a shared styles file or use CSS-in-JS properly
 *
 * 6. CONSIDER USING A FORM LIBRARY
 *    - react-hook-form or similar could reduce boilerplate
 *    - Add validation schema per node type
 *
 * SUGGESTED REFACTOR ORDER:
 * 1. Extract shared components (SourceSelector, CollapsibleSection)
 * 2. Extract individual NodeProperties files one at a time
 * 3. Move file search to service
 * 4. Clean up remaining this file to be just the router
 *
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { X, MessageSquare, GitBranch, Repeat, GitFork, Flag, FileText, Search, Package, Radio, Cpu, Link2, Combine, ArrowRight, UserCircle, AlignLeft, Maximize2, Wrench, ScanSearch, Globe, Server, Code, Bot, Plus, Trash2, Activity, AlertTriangle, Terminal, Workflow, Plug, Loader2, FileCode, Wand2, Braces, Play, Webhook, Clock, FolderSync, Zap, Copy, Eye, EyeOff, ShieldCheck, RotateCcw, MessagesSquare, Settings, ChevronDown, ChevronRight, Database, Key, Route, Edit } from 'lucide-react'
import { CronInput } from './CronInput'
import { CronEditorDialog } from './CronEditorDialog'
import Editor from '@monaco-editor/react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import { useEditorStore } from '../../../stores/editorStore'
import { useUIStore } from '../../../stores/uiStore'
import { registryApi } from '../../services/registryApi'
import { getMonacoTheme } from '../../lib/monacoConfig'
import { ProviderModelSelector } from '../ProviderModelSelector'
import type { PromptNodeData, ProviderNodeData, ConditionNodeData, LoopNodeData, ParallelNodeData, MergeNodeData, OutputNodeData, CallbackNodeData, UserInputNodeData, ToolNodeData, ToolCallParserNodeData, ToolCallRouterNodeData, AgentNodeData, AgentTool, AgentCheckpointEventType, ErrorHandlerNodeData, BaseNodeData, CommandNodeData, ClaudeCodeNodeData, WorkflowNodeData, McpToolNodeData, CodeNodeData, TransformerNodeData, TriggerNodeData, ChatAgentNodeData, ChatAgentCheckpointConfig, MemoryNodeData, GuardrailNodeData } from '../../services/workflowTypes'
import { VariablePreview, hasVariables } from '../common/VariableReference'

// Shared styles - matching DesignView.tsx input styling
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: '4px',
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

/**
 * LLMProviderConfig - Wrapper component for Node/Inline provider selection
 * Combines toggle for Node vs Inline mode with the appropriate UI for each:
 * - Node mode: Provider node dropdown selector
 * - Inline mode: ProviderModelSelector component
 */
interface LLMProviderConfigProps {
  /** Reference to a Provider node by ID (when using Node mode) */
  providerNodeId?: string
  /** Provider ID (when using Inline mode) */
  provider?: string
  /** Model ID (when using Inline mode) */
  model?: string
  /** Called when providerNodeId changes */
  onProviderNodeChange: (nodeId: string | undefined) => void
  /** Called when inline provider changes */
  onProviderChange: (providerId: string | undefined) => void
  /** Called when inline model changes */
  onModelChange: (model: string | undefined) => void
  /** Optional label for the section */
  label?: string
}

function LLMProviderConfig({
  providerNodeId,
  provider,
  model,
  onProviderNodeChange,
  onProviderChange,
  onModelChange,
  label = 'LLM Provider',
}: LLMProviderConfigProps) {
  const nodes = useWorkflowStore(state => state.nodes)
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)

  // Find all provider nodes in the workflow
  const providerNodes = nodes.filter(n => n.type === 'provider')
  const useProviderNode = !!providerNodeId
  const selectedProviderNode = providerNodes.find(n => n.id === providerNodeId)
  const selectedProviderData = selectedProviderNode?.data as ProviderNodeData | undefined

  // Get available providers for inline mode
  const availableProviders = (providersWithPricing || []).filter(p => p.hasKey)

  const handleProviderModeChange = (useNode: boolean) => {
    if (useNode) {
      // Switch to Node mode
      onProviderChange(undefined)
      onModelChange(undefined)
      if (providerNodes.length > 0) {
        onProviderNodeChange(providerNodes[0].id)
      }
    } else {
      // Switch to Inline mode
      onProviderNodeChange(undefined)
      if (availableProviders.length > 0) {
        onProviderChange(availableProviders[0].providerId)
        onModelChange(availableProviders[0].models[0]?.model || '')
      } else {
        onProviderChange('openai')
      }
    }
  }

  return (
    <>
      {/* Provider Mode Toggle */}
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          marginBottom: '8px',
        }}>
          <button
            onClick={() => handleProviderModeChange(true)}
            disabled={providerNodes.length === 0}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: useProviderNode ? 'var(--accent)' : 'transparent',
              color: useProviderNode ? 'white' : providerNodes.length === 0 ? 'var(--muted)' : 'var(--text-secondary)',
              cursor: providerNodes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              opacity: providerNodes.length === 0 ? 0.5 : 1,
            }}
            title={providerNodes.length === 0 ? 'Add a Provider node first' : 'Use a Provider node'}
          >
            <Link2 size={12} />
            Node
          </button>
          <button
            onClick={() => handleProviderModeChange(false)}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: !useProviderNode ? 'var(--accent)' : 'transparent',
              color: !useProviderNode ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Inline
          </button>
        </div>
      </div>

      {/* Provider Node Selector */}
      {useProviderNode && (
        <div>
          <label style={labelStyle}>Provider Node</label>
          {providerNodes.length === 0 ? (
            <div style={{
              padding: '10px',
              background: 'var(--panel-2)',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}>
              No Provider nodes in workflow. Add one from the palette.
            </div>
          ) : (
            <>
              <select
                value={providerNodeId || ''}
                onChange={(e) => onProviderNodeChange(e.target.value)}
                style={selectStyle}
              >
                <option value="">Select a provider node...</option>
                {providerNodes.map(node => {
                  const pData = node.data as ProviderNodeData
                  return (
                    <option key={node.id} value={node.id}>
                      {pData.label || node.id} ({pData.providerId}/{pData.model})
                    </option>
                  )
                })}
              </select>
              {selectedProviderData && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'color-mix(in srgb, var(--node-rose) 10%, transparent)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <Cpu size={14} style={{ color: 'var(--node-rose)' }} />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                      {selectedProviderData.providerId}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {selectedProviderData.model}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Inline Provider/Model - uses ProviderModelSelector component */}
      {!useProviderNode && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          <ProviderModelSelector
            providers={providersWithPricing || []}
            selectedProvider={provider || ''}
            selectedModel={model || ''}
            onProviderChange={(providerId) => onProviderChange(providerId)}
            onModelChange={(m) => onModelChange(m)}
            layout="vertical"
            forceDropdown={true}
            shrinkModel={true}
          />
        </div>
      )}
    </>
  )
}

/**
 * ErrorHandlerSelector - Dropdown to select an ErrorHandler node to use for this node
 * Similar to LLMProviderConfig but simpler - just a dropdown to select error handler node
 */
interface ErrorHandlerSelectorProps {
  errorHandlerNodeId?: string
  onErrorHandlerChange: (nodeId: string | undefined) => void
  currentNodeType: string
}

function ErrorHandlerSelector({
  errorHandlerNodeId,
  onErrorHandlerChange,
  currentNodeType,
}: ErrorHandlerSelectorProps) {
  const nodes = useWorkflowStore(state => state.nodes)

  // Error handler nodes are config nodes - shouldn't reference themselves
  // And error-handler nodes don't need error handlers
  if (currentNodeType === 'error-handler') {
    return null
  }

  // Find all error handler nodes in the workflow
  const errorHandlerNodes = nodes.filter(n => n.type === 'error-handler')
  const selectedHandler = errorHandlerNodes.find(n => n.id === errorHandlerNodeId)
  const selectedHandlerData = selectedHandler?.data as ErrorHandlerNodeData | undefined

  // Strategy display
  const strategyLabels: Record<string, string> = {
    retry: 'Retry',
    fallback: 'Fallback',
    notify: 'Notify',
    ignore: 'Ignore',
    rethrow: 'Rethrow',
  }

  if (errorHandlerNodes.length === 0) {
    return null // Don't show if no error handlers exist
  }

  return (
    <div>
      <label style={labelStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={12} style={{ color: 'var(--node-rose)' }} />
          Error Handler
        </span>
      </label>
      <select
        value={errorHandlerNodeId || ''}
        onChange={(e) => onErrorHandlerChange(e.target.value || undefined)}
        style={selectStyle}
      >
        <option value="">None (fail on error)</option>
        {errorHandlerNodes.map(node => {
          const hData = node.data as ErrorHandlerNodeData
          return (
            <option key={node.id} value={node.id}>
              {hData.label || node.id} ({strategyLabels[hData.strategy] || hData.strategy})
            </option>
          )
        })}
      </select>
      {selectedHandlerData && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          background: 'color-mix(in srgb, var(--node-rose) 10%, transparent)',
          borderRadius: '6px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertTriangle size={14} style={{ color: 'var(--node-rose)' }} />
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>
              {strategyLabels[selectedHandlerData.strategy] || selectedHandlerData.strategy}
            </div>
            {selectedHandlerData.strategy === 'retry' && selectedHandlerData.retry && (
              <div style={{ color: 'var(--text-secondary)' }}>
                {selectedHandlerData.retry.maxAttempts} attempts, {selectedHandlerData.retry.backoffMs}ms backoff
              </div>
            )}
            {selectedHandlerData.description && (
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                {selectedHandlerData.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ConnectionSelector - Dropdown to select an external connection for this node
 * Used for nodes that need to connect to external services (SSH, Database, HTTP API, etc.)
 */
interface ConnectionSelectorProps {
  connectionId?: string
  onConnectionChange: (connectionId: string | undefined) => void
  /** Optional filter to only show connections of certain types */
  connectionTypes?: string[]
  /** Label override */
  label?: string
}

function ConnectionSelector({
  connectionId,
  onConnectionChange,
  connectionTypes,
  label = 'Connection',
}: ConnectionSelectorProps) {
  const connections = useWorkflowStore(state => state.connections)

  // Filter connections by type if specified
  const filteredConnections = connectionTypes
    ? connections.filter(c => connectionTypes.includes(c.type))
    : connections

  if (filteredConnections.length === 0) {
    return null // Don't show if no connections exist
  }

  const selectedConnection = connections.find(c => c.id === connectionId)

  // Status indicator colors
  const statusColors: Record<string, string> = {
    disconnected: 'var(--muted)',
    connecting: 'var(--warning)',
    connected: 'var(--success)',
    error: 'var(--error)',
  }

  // Type labels
  const typeLabels: Record<string, string> = {
    ssh: 'SSH',
    database: 'Database',
    'http-api': 'HTTP API',
    slack: 'Slack',
    github: 'GitHub',
    'mcp-server': 'MCP Server',
    websocket: 'WebSocket',
    custom: 'Custom',
  }

  return (
    <div>
      <label style={labelStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link2 size={12} style={{ color: 'var(--node-cyan)' }} />
          {label}
        </span>
      </label>
      <select
        value={connectionId || ''}
        onChange={(e) => onConnectionChange(e.target.value || undefined)}
        style={selectStyle}
      >
        <option value="">None</option>
        {filteredConnections.map(conn => (
          <option key={conn.id} value={conn.id}>
            {conn.name} ({typeLabels[conn.type] || conn.type})
          </option>
        ))}
      </select>
      {selectedConnection && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          background: 'color-mix(in srgb, var(--node-cyan) 10%, transparent)',
          borderRadius: '6px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColors[selectedConnection.status] || 'var(--muted)',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>
              {typeLabels[selectedConnection.type] || selectedConnection.type}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {selectedConnection.status.charAt(0).toUpperCase() + selectedConnection.status.slice(1)}
              {selectedConnection.lastError && selectedConnection.status === 'error' && (
                <span style={{ color: 'var(--error)' }}> - {selectedConnection.lastError}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function WorkflowPropertiesPanel() {
  // Subscribe to selectedNodeId separately - this is a primitive and won't cause extra re-renders
  const selectedNodeId = useWorkflowStore(state => state.selectedNodeId)

  // Get the selected node using useShallow for stable object comparison
  const selectedNode = useWorkflowStore(
    useShallow(state => {
      if (!state.selectedNodeId) return null
      return state.nodes.find(n => n.id === state.selectedNodeId) || null
    })
  )

  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const selectNode = useWorkflowStore(state => state.selectNode)

  if (!selectedNode || !selectedNodeId) return null

  const handleClose = () => {
    selectNode(null)
  }

  const handleDataChange = (field: string, value: unknown) => {
    updateNodeData(selectedNode.id, { [field]: value })
  }

  const getNodeIcon = () => {
    const iconStyle = { width: 20, height: 20 }
    switch (selectedNode.type) {
      case 'prompt':
        return <MessageSquare style={{ ...iconStyle, color: 'var(--node-purple)' }} />
      case 'provider':
        return <Cpu style={{ ...iconStyle, color: 'var(--node-rose)' }} />
      case 'condition':
        return <GitBranch style={{ ...iconStyle, color: 'var(--node-amber)' }} />
      case 'loop':
        return <Repeat style={{ ...iconStyle, color: 'var(--node-cyan)' }} />
      case 'parallel':
        return <GitFork style={{ ...iconStyle, color: 'var(--node-indigo)' }} />
      case 'merge':
        return <Combine style={{ ...iconStyle, color: 'var(--node-emerald)' }} />
      case 'callback':
      case 'checkpoint':  // Alias for callback (legacy compatibility)
        return <Radio style={{ ...iconStyle, color: 'var(--node-teal)' }} />
      case 'user-input':
        return <UserCircle style={{ ...iconStyle, color: 'var(--node-violet)' }} />
      case 'tool':
        return <Wrench style={{ ...iconStyle, color: 'var(--node-orange)' }} />
      case 'tool-call-parser':
        return <ScanSearch style={{ ...iconStyle, color: 'var(--node-cyan)' }} />
      case 'tool-call-router':
        return <Route style={{ ...iconStyle, color: 'var(--node-emerald)' }} />
      case 'agent':
        return <Bot style={{ ...iconStyle, color: 'var(--node-indigo)' }} />
      case 'guardrail':
        return <ShieldCheck style={{ ...iconStyle, color: 'var(--node-amber)' }} />
      case 'output':
        return <Flag style={{ ...iconStyle, color: 'var(--node-green)' }} />
      case 'error-handler':
        return <AlertTriangle style={{ ...iconStyle, color: 'var(--node-orange)' }} />
      case 'command':
        return <Terminal style={{ ...iconStyle, color: 'var(--node-slate, var(--muted))' }} />
      case 'code':
        return <FileCode style={{ ...iconStyle, color: 'var(--node-blue)' }} />
      case 'claude-code':
        return <Server style={{ ...iconStyle, color: 'var(--node-violet)' }} />
      case 'workflow':
        return <Workflow style={{ ...iconStyle, color: 'var(--node-teal)' }} />
      case 'mcp-tool':
        return <Plug style={{ ...iconStyle, color: 'var(--node-cyan)' }} />
      case 'transformer':
        return <Wand2 style={{ ...iconStyle, color: 'var(--node-orange)' }} />
      case 'memory':
        return <Database style={{ ...iconStyle, color: 'var(--node-emerald)' }} />
      case 'trigger':
        return <Play style={{ ...iconStyle, color: 'var(--node-green)' }} />
      case 'chat-agent':
        return <MessagesSquare style={{ ...iconStyle, color: 'var(--node-indigo)' }} />
      default:
        return null
    }
  }

  // Stop keyboard events from bubbling to React Flow
  // This prevents keys like Backspace/Delete/P/etc from triggering React Flow shortcuts while typing
  // BUT we need to let Monaco editor handle arrow keys and other navigation keys
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Check if event is from inside a Monaco editor - if so, let it handle everything
    const target = e.target as HTMLElement
    const isMonacoEditor = target.closest('.monaco-editor') !== null

    if (isMonacoEditor) {
      // Let Monaco handle the event - only stop propagation to React Flow
      // Don't use stopPropagation in capture phase for Monaco
      return
    }

    e.stopPropagation()
  }

  // For capture phase, only stop non-Monaco events
  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isMonacoEditor = target.closest('.monaco-editor') !== null

    // Don't intercept Monaco editor events in capture phase
    if (isMonacoEditor) {
      return
    }

    // For non-Monaco elements, stop propagation to prevent React Flow shortcuts
    e.stopPropagation()
  }

  return (
    <div
      style={{
        width: '320px',
        height: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--panel)',
        overflowY: 'auto',
      }}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {getNodeIcon()}
          <h3 style={{ fontWeight: 600, color: 'var(--text)', margin: 0, fontSize: '14px' }}>
            {(selectedNode.type || 'Unknown').charAt(0).toUpperCase() + (selectedNode.type || '').slice(1)} Node
          </h3>
        </div>
        <button
          onClick={handleClose}
          style={{
            padding: '4px',
            borderRadius: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
        >
          <X style={{ width: 20, height: 20 }} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Common fields */}
        <div>
          <label style={labelStyle}>Label</label>
          <input
            type="text"
            value={(selectedNode.data as { label?: string }).label || ''}
            onChange={(e) => handleDataChange('label', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Enable/Disable Toggle */}
        <div>
          <label style={labelStyle}>Node Status</label>
          <button
            onClick={() => {
              const currentDisabled = (selectedNode.data as BaseNodeData).disabled ?? false
              handleDataChange('disabled', !currentDisabled)
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--input-border)',
              borderRadius: '6px',
              background: (selectedNode.data as BaseNodeData).disabled
                ? 'var(--panel-2)'
                : 'color-mix(in srgb, var(--success) 15%, var(--panel-2))',
              color: 'var(--text)',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(selectedNode.data as BaseNodeData).disabled ? (
                <>
                  <EyeOff style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                  Disabled
                </>
              ) : (
                <>
                  <Eye style={{ width: 16, height: 16, color: 'var(--success)' }} />
                  Enabled
                </>
              )}
            </span>
            <span style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontWeight: 500,
            }}>
              {(selectedNode.data as BaseNodeData).disabled ? 'Click to enable' : 'Click to disable'}
            </span>
          </button>
          {(selectedNode.data as BaseNodeData).disabled && (
            <div style={{
              marginTop: '6px',
              padding: '8px 10px',
              background: 'color-mix(in srgb, var(--node-amber) 10%, var(--panel-2))',
              border: '1px solid color-mix(in srgb, var(--node-amber) 30%, transparent)',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
            }}>
              <AlertTriangle style={{ width: 12, height: 12, marginTop: '1px', flexShrink: 0, color: 'var(--node-amber)' }} />
              <span>This node will be skipped during workflow execution.</span>
            </div>
          )}
        </div>

        {/* Error Handler Selector - shows for all nodes except error-handler itself */}
        <ErrorHandlerSelector
          errorHandlerNodeId={(selectedNode.data as BaseNodeData).errorHandlerNodeId}
          onErrorHandlerChange={(nodeId) => handleDataChange('errorHandlerNodeId', nodeId)}
          currentNodeType={selectedNode.type || ''}
        />

        {/* Connection Selector - shows for nodes that can use external connections */}
        {['tool', 'api', 'agent'].includes(selectedNode.type || '') && (
          <ConnectionSelector
            connectionId={(selectedNode.data as BaseNodeData).connectionId}
            onConnectionChange={(connId) => handleDataChange('connectionId', connId)}
          />
        )}

        {/* Node-specific fields */}
        {selectedNode.type === 'prompt' && (
          <PromptNodeProperties
            data={selectedNode.data as PromptNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'provider' && (
          <ProviderNodeProperties
            data={selectedNode.data as ProviderNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'condition' && (
          <ConditionNodeProperties
            data={selectedNode.data as ConditionNodeData}
            onChange={handleDataChange}
            nodeId={selectedNode.id}
          />
        )}

        {selectedNode.type === 'loop' && (
          <LoopNodeProperties
            data={selectedNode.data as LoopNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'parallel' && (
          <ParallelNodeProperties
            data={selectedNode.data as ParallelNodeData}
            onChange={handleDataChange}
            nodeId={selectedNode.id}
          />
        )}

        {selectedNode.type === 'merge' && (
          <MergeNodeProperties
            data={selectedNode.data as MergeNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'output' && (
          <OutputNodeProperties
            data={selectedNode.data as OutputNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'callback' && (
          <CallbackNodeProperties
            data={selectedNode.data as CallbackNodeData}
            onChange={handleDataChange}
            nodeId={selectedNodeId}
          />
        )}

        {selectedNode.type === 'checkpoint' && (
          <CallbackNodeProperties
            data={selectedNode.data as CallbackNodeData}
            onChange={handleDataChange}
            nodeId={selectedNodeId}
          />
        )}

        {selectedNode.type === 'user-input' && (
          <UserInputNodeProperties
            data={selectedNode.data as UserInputNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'tool' && (
          <ToolNodeProperties
            data={selectedNode.data as ToolNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'tool-call-parser' && (
          <ToolCallParserNodeProperties
            data={selectedNode.data as ToolCallParserNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'tool-call-router' && (
          <ToolCallRouterNodeProperties
            data={selectedNode.data as ToolCallRouterNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'agent' && (
          <AgentNodeProperties
            data={selectedNode.data as AgentNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'chat-agent' && (
          <ChatAgentNodeProperties
            data={selectedNode.data as ChatAgentNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'error-handler' && (
          <ErrorHandlerNodeProperties
            data={selectedNode.data as ErrorHandlerNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'command' && (
          <CommandNodeProperties
            data={selectedNode.data as CommandNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'code' && (
          <CodeNodeProperties
            data={selectedNode.data as CodeNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'claude-code' && (
          <ClaudeCodeNodeProperties
            data={selectedNode.data as ClaudeCodeNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'workflow' && (
          <WorkflowNodeProperties
            data={selectedNode.data as WorkflowNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'mcp-tool' && (
          <McpToolNodeProperties
            data={selectedNode.data as McpToolNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'transformer' && (
          <TransformerNodeProperties
            data={selectedNode.data as TransformerNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'memory' && (
          <MemoryNodeProperties
            data={selectedNode.data as MemoryNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'guardrail' && (
          <GuardrailNodeProperties
            data={selectedNode.data as GuardrailNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'trigger' && (
          <TriggerNodeProperties
            data={selectedNode.data as TriggerNodeData}
            onChange={handleDataChange}
          />
        )}

        {/* Node ID (read-only) */}
        <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <label style={{ ...labelStyle, fontSize: '11px', color: 'var(--text-secondary)' }}>
            Node ID
          </label>
          <code
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            {selectedNode.id}
          </code>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Node-Specific Property Editors
// ============================================================================

interface PropertyEditorProps<T> {
  data: T
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

/**
 * Full-screen modal editor for raw prompt text
 */
/**
 * MonacoEditorModal - Configurable full-screen Monaco editor modal
 * Used by PromptNode (raw text mode) and CodeNode (expand button)
 */
interface MonacoEditorModalProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  /** Monaco editor language (e.g., 'markdown', 'typescript', 'python') */
  language: string
  /** Modal title displayed in header */
  title: string
  /** Lucide icon component for header */
  icon?: React.ComponentType<{ style?: React.CSSProperties }>
  /** Help text shown in footer */
  helpText?: string
}

function MonacoEditorModal({
  value,
  onChange,
  onClose,
  language,
  title,
  icon: Icon = AlignLeft,
  helpText = 'Ctrl+S to save, Esc to cancel',
}: MonacoEditorModalProps) {
  const theme = useUIStore(state => state.theme)
  const [localValue, setLocalValue] = useState(value)

  const handleSave = () => {
    onChange(localValue)
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  // Handle only specific shortcuts - let other keys pass through to Monaco
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Save on Cmd/Ctrl+S
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      e.stopPropagation()
      handleSave()
      return
    }
    // Close on Escape (only if not in Monaco editor - Monaco handles its own Escape)
    if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('.monaco-editor')) {
      e.preventDefault()
      e.stopPropagation()
      handleCancel()
      return
    }
    // Stop propagation to prevent React Flow shortcuts, but don't prevent default
    // This allows Monaco to handle the keys normally
    e.stopPropagation()
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          width: '80%',
          maxWidth: '900px',
          height: '80%',
          maxHeight: '700px',
          background: 'var(--panel)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon style={{ width: 18, height: 18, color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              {title}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Ctrl+S to save, Esc to cancel
            </span>
            <button
              onClick={handleCancel}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Editor
            value={localValue}
            onChange={(val) => setLocalValue(val || '')}
            language={language}
            theme={getMonacoTheme(theme === 'dark')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              fontSize: 13,
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--panel-2)',
          }}
        >
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>
            {helpText}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'white',
                fontWeight: 500,
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * RawPromptEditorModal - Wrapper for backward compatibility
 * Uses MonacoEditorModal with markdown-specific configuration
 */
function RawPromptEditorModal({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (value: string) => void
  onClose: () => void
}) {
  return (
    <MonacoEditorModal
      value={value}
      onChange={onChange}
      onClose={onClose}
      language="markdown"
      title="Raw Prompt Editor"
      icon={AlignLeft}
      helpText="Use {{ previous_output }} and {{ param_name }} for template expressions"
    />
  )
}

function PromptNodeProperties({ data, onChange }: PropertyEditorProps<PromptNodeData>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ name: string; version: string; description?: string }>>([])
  const [localFileResults, setLocalFileResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const [showRawEditor, setShowRawEditor] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const workspaceHandle = useEditorStore(state => state.explorerDirHandle)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

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

  // Determine if searching locally (starts with ".")
  const isLocalSearch = searchQuery.trim().startsWith('.')

  // Debounced search handler
  const handleSearchChange = useCallback(async (query: string) => {
    setSearchQuery(query)

    if (query.trim().length === 0) {
      setSearchResults([])
      setLocalFileResults([])
      setShowDropdown(false)
      return
    }

    const isLocal = query.trim().startsWith('.')

    // For package search require 2+ chars, for local search just need "."
    if (!isLocal && query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      // Check if we can search local files (either via handle or Electron path)
      const canSearchLocal = workspaceHandle || (workspacePath && (window as any).electronAPI?.readDir)

      console.log('[PropertiesPanel] Local search debug:', {
        query,
        isLocal,
        canSearchLocal,
        workspaceHandle: !!workspaceHandle,
        workspacePath,
        electronAPI: !!(window as any).electronAPI?.readDir
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
    onChange('source', filePath)
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
          <button
            onClick={() => setShowRawEditor(true)}
            style={{
              marginTop: '8px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              borderRadius: '5px',
              cursor: 'pointer',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 25%, transparent)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)'
            }}
          >
            <Maximize2 size={12} />
            Open Full Editor
          </button>

          {/* Full Raw Prompt Editor Modal */}
          {showRawEditor && <RawPromptEditorModal
            value={data.rawPrompt || ''}
            onChange={(value) => onChange('rawPrompt', value)}
            onClose={() => setShowRawEditor(false)}
          />}
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
                {isLocalSearch && localFileResults.map((filePath, index) => (
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
                      {filePath}
                    </span>
                  </div>
                ))}

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
      <PromptProviderSelector data={data} onChange={onChange} />

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
    </>
  )
}

// Helper function to search local files by extension
async function searchLocalFilesByExtension(
  workspaceHandle: FileSystemDirectoryHandle | null,
  workspacePath: string | null,
  query: string,
  extension: string
): Promise<string[]> {
  const results: string[] = []
  // Strip leading ./ or . and get the actual search term
  const searchTerm = query.toLowerCase().replace(/^\.+\/?/, '').trim()

  const electronPath = (workspaceHandle as unknown as { _electronPath?: string })?._electronPath || workspacePath
  const isElectron = electronPath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir

  const matchesSearch = (filePath: string): boolean => {
    if (searchTerm === '') return true
    return filePath.toLowerCase().includes(searchTerm)
  }

  if (isElectron) {
    const searchDir = async (dirPath: string, currentPath: string = '') => {
      try {
        const result = await (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI!.readDir(dirPath)
        if (!result.success || !result.files) return

        for (const entry of result.files) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

          if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await searchDir(`${dirPath}/${entry.name}`, relativePath)
          } else if (!entry.isDirectory && entry.name.endsWith(extension)) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', dirPath, err)
      }
    }

    await searchDir(electronPath)
  } else {
    const searchDir = async (handle: FileSystemDirectoryHandle, currentPath: string = '') => {
      try {
        for await (const [name, entry] of (handle as unknown as Iterable<[string, FileSystemHandle]>)) {
          const relativePath = currentPath ? `${currentPath}/${name}` : name

          if (entry.kind === 'directory' && !name.startsWith('.') && name !== 'node_modules') {
            await searchDir(entry as FileSystemDirectoryHandle, relativePath)
          } else if (entry.kind === 'file' && name.endsWith(extension)) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', currentPath, err)
      }
    }

    if (workspaceHandle) {
      await searchDir(workspaceHandle)
    }
  }

  return results.sort().slice(0, 20)
}

// Helper function to search local .prmd files
async function searchLocalFiles(
  workspaceHandle: FileSystemDirectoryHandle | null,
  workspacePath: string | null,
  query: string
): Promise<string[]> {
  const results: string[] = []
  // Strip leading ./ or . and get the actual search term
  // If query is just "." or "./", searchTerm will be empty (show all files)
  const searchTerm = query.toLowerCase().replace(/^\.+\/?/, '').trim()

  // Check if Electron mode - either via handle with _electronPath or direct workspacePath
  const electronPath = (workspaceHandle as any)?._electronPath || workspacePath
  const isElectron = electronPath && (window as any).electronAPI?.readDir

  console.log('[searchLocalFiles] Starting search:', {
    query,
    searchTerm,
    electronPath,
    isElectron,
    hasHandle: !!workspaceHandle,
    handleElectronPath: (workspaceHandle as any)?._electronPath,
    workspacePath
  })

  // Helper to check if file matches search term
  const matchesSearch = (filePath: string): boolean => {
    if (searchTerm === '') return true // Show all files when query is just "." or "./"
    return filePath.toLowerCase().includes(searchTerm)
  }

  if (isElectron) {
    const searchDir = async (dirPath: string, currentPath: string = '') => {
      try {
        const result = await (window as any).electronAPI.readDir(dirPath)
        if (!result.success || !result.files) return

        for (const entry of result.files) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

          if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await searchDir(`${dirPath}/${entry.name}`, relativePath)
          } else if (!entry.isDirectory && entry.name.endsWith('.prmd')) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', dirPath, err)
      }
    }

    await searchDir(electronPath)
  } else {
    // Browser File System Access API
    const searchDir = async (handle: FileSystemDirectoryHandle, currentPath: string = '') => {
      try {
        for await (const [name, entry] of (handle as any).entries()) {
          const relativePath = currentPath ? `${currentPath}/${name}` : name

          if (entry.kind === 'directory' && !name.startsWith('.') && name !== 'node_modules') {
            await searchDir(entry as FileSystemDirectoryHandle, relativePath)
          } else if (entry.kind === 'file' && name.endsWith('.prmd')) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', currentPath, err)
      }
    }

    if (workspaceHandle) {
      await searchDir(workspaceHandle)
    } else {
      console.log('[searchLocalFiles] No workspace handle for browser mode')
    }
  }

  console.log('[searchLocalFiles] Search complete, found:', results.length, 'files')
  return results.sort().slice(0, 20) // Limit results
}

/**
 * Provider selector for prompt nodes - uses LLMProviderConfig component
 */
function PromptProviderSelector({ data, onChange }: { data: PromptNodeData; onChange: (field: string, value: unknown) => void }) {
  return (
    <LLMProviderConfig
      providerNodeId={data.providerNodeId}
      provider={data.provider}
      model={data.model}
      onProviderNodeChange={(nodeId) => onChange('providerNodeId', nodeId)}
      onProviderChange={(providerId) => onChange('provider', providerId)}
      onModelChange={(model) => onChange('model', model)}
      label="Provider Source"
    />
  )
}

/**
 * Provider node properties editor
 */
function ProviderNodeProperties({ data, onChange }: PropertyEditorProps<ProviderNodeData>) {
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)

  return (
    <>
      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="e.g., Fast model for quick tasks"
          style={inputStyle}
        />
      </div>

      {/* Provider & Model Selector */}
      <div>
        <label style={labelStyle}>Provider & Model</label>
        <ProviderModelSelector
          providers={providersWithPricing || []}
          selectedProvider={data.providerId || ''}
          selectedModel={data.model || ''}
          onProviderChange={(providerId) => onChange('providerId', providerId)}
          onModelChange={(model) => onChange('model', model)}
          layout="vertical"
          forceDropdown={true}
        />
      </div>

      {/* Advanced options */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
        <h4 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '12px',
        }}>
          Advanced Options
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Temperature</label>
            <input
              type="number"
              value={data.temperature ?? ''}
              onChange={(e) => onChange('temperature', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Default"
              min={0}
              max={2}
              step={0.1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Max Tokens</label>
            <input
              type="number"
              value={data.maxTokens ?? ''}
              onChange={(e) => onChange('maxTokens', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="Default"
              min={1}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>How to use:</strong>
        <p style={{ margin: '8px 0 0' }}>
          Connect this provider node to Prompt nodes via the properties panel.
          All connected prompts will use this provider configuration.
        </p>
      </div>
    </>
  )
}

function ConditionNodeProperties({ data, onChange, nodeId }: PropertyEditorProps<ConditionNodeData>) {
  // Get edges to determine connected targets
  // We need to be careful here - subscribing to edges/nodes can cause re-renders
  // Use a memoized selector to only re-render when relevant edges change
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  // Build map of connected targets - memoize to avoid recalculating on every render
  const connectedTargets = useMemo(() => {
    if (!nodeId) return {} as Record<string, { id: string; label: string }>
    const targets: Record<string, { id: string; label: string }> = {}
    for (const edge of edges) {
      if (edge.source === nodeId && edge.sourceHandle) {
        const targetNode = nodes.find(n => n.id === edge.target)
        if (targetNode) {
          targets[edge.sourceHandle] = {
            id: edge.target,
            label: targetNode.data.label || edge.target,
          }
        }
      }
    }
    return targets
  }, [edges, nodes, nodeId])

  const addCondition = () => {
    const newConditions = [
      ...(data.conditions || []),
      {
        id: `branch-${Date.now()}`,
        expression: '',
        target: '',
      },
    ]
    onChange('conditions', newConditions)
  }

  const updateCondition = (index: number, field: string, value: string) => {
    const newConditions = [...(data.conditions || [])]
    newConditions[index] = { ...newConditions[index], [field]: value }
    onChange('conditions', newConditions)
  }

  const removeCondition = (index: number) => {
    const newConditions = (data.conditions || []).filter((_, i) => i !== index)
    onChange('conditions', newConditions)
  }

  return (
    <>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Conditions</label>
          <button
            onClick={addCondition}
            style={{
              fontSize: '12px',
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.conditions?.map((condition, index) => {
            const handleId = `condition-${condition.id}`
            const connected = connectedTargets[handleId]

            return (
              <div
                key={index}  // Use index as key since condition.id changes while typing
                style={{
                  padding: '12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={condition.id}
                    onChange={(e) => updateCondition(index, 'id', e.target.value)}
                    placeholder="Branch ID"
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--input-border)',
                      color: 'var(--text)',
                      padding: '2px 0',
                    }}
                  />
                  <button
                    onClick={() => removeCondition(index)}
                    style={{
                      color: 'var(--error)',
                      fontSize: '11px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted)' }}>Expression</label>
                  <input
                    type="text"
                    value={condition.expression}
                    onChange={(e) => updateCondition(index, 'expression', e.target.value)}
                    placeholder="{{ score >= 0.8 }}"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted)' }}>Target</label>
                  {connected ? (
                    <div style={{
                      padding: '8px 12px',
                      background: 'color-mix(in srgb, var(--success) 10%, var(--panel))',
                      border: '1px solid var(--success)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <ArrowRight style={{ width: 12, height: 12 }} />
                      <span>{connected.label}</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px 12px',
                      background: 'var(--panel-2)',
                      border: '1px dashed var(--border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      fontStyle: 'italic',
                    }}>
                      Drag edge from condition handle to target node
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Default Target</label>
        {connectedTargets['default'] ? (
          <div style={{
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--success) 10%, var(--panel))',
            border: '1px solid var(--success)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <ArrowRight style={{ width: 12, height: 12 }} />
            <span>{connectedTargets['default'].label}</span>
          </div>
        ) : (
          <div style={{
            padding: '8px 12px',
            background: 'var(--panel-2)',
            border: '1px dashed var(--border)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}>
            Drag edge from default handle to target node
          </div>
        )}
      </div>
    </>
  )
}

function LoopNodeProperties({ data, onChange }: PropertyEditorProps<LoopNodeData>) {
  return (
    <>
      <div>
        <label style={labelStyle}>Loop Type</label>
        <select
          value={data.loopType || 'while'}
          onChange={(e) => onChange('loopType', e.target.value)}
          style={selectStyle}
        >
          <option value="while">While (condition)</option>
          <option value="for-each">For Each (items)</option>
          <option value="count">Count (fixed)</option>
        </select>
      </div>

      {data.loopType === 'while' && (
        <div>
          <label style={labelStyle}>Condition</label>
          <input
            type="text"
            value={data.condition || ''}
            onChange={(e) => onChange('condition', e.target.value)}
            placeholder="{{ iteration < 5 }}"
            style={inputStyle}
          />
        </div>
      )}

      {data.loopType === 'for-each' && (
        <>
          <div>
            <label style={labelStyle}>Items Expression</label>
            <input
              type="text"
              value={data.items || ''}
              onChange={(e) => onChange('items', e.target.value)}
              placeholder="{{ previous_output.items }}"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Item Variable Name</label>
            <input
              type="text"
              value={data.itemVariable || 'item'}
              onChange={(e) => onChange('itemVariable', e.target.value)}
              placeholder="item"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {data.loopType === 'count' && (
        <div>
          <label style={labelStyle}>Count</label>
          <input
            type="number"
            value={data.count || 5}
            onChange={(e) => onChange('count', parseInt(e.target.value, 10))}
            min={1}
            style={inputStyle}
          />
        </div>
      )}

      <div>
        <label style={labelStyle}>Max Iterations (safety limit)</label>
        <input
          type="number"
          value={data.maxIterations || 10}
          onChange={(e) => onChange('maxIterations', parseInt(e.target.value, 10))}
          min={1}
          max={100}
          style={inputStyle}
        />
      </div>
    </>
  )
}

function ParallelNodeProperties({ data, onChange, nodeId }: PropertyEditorProps<ParallelNodeData>) {
  const mode = data.mode || 'broadcast'
  const forkCount = data.forkCount || 2
  const ejectChildNodes = useWorkflowStore(state => state.ejectChildNodes)

  // Handle mode change with child node ejection
  const handleModeChange = (newMode: string) => {
    // If switching from broadcast to fork, eject child nodes first
    if (mode === 'broadcast' && newMode === 'fork' && nodeId) {
      ejectChildNodes(nodeId)
    }
    onChange('mode', newMode)
  }

  return (
    <>
      {/* Mode Selection */}
      <div>
        <label style={labelStyle}>Parallel Mode</label>
        <select
          value={mode}
          onChange={(e) => handleModeChange(e.target.value)}
          style={selectStyle}
        >
          <option value="broadcast">Broadcast (container)</option>
          <option value="fork">Fork (edge-based)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {mode === 'broadcast' && 'Drag nodes into this container - all run in parallel with same input.'}
          {mode === 'fork' && 'Connect edges from output handles to different branch paths.'}
        </p>
      </div>

      {/* Fork Count - only in fork mode */}
      {mode === 'fork' && (
        <div>
          <label style={labelStyle}>Number of Branches</label>
          <input
            type="number"
            value={forkCount}
            onChange={(e) => onChange('forkCount', Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 2)))}
            min={2}
            max={10}
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Number of parallel output handles (2-10)
          </p>
        </div>
      )}

      {/* Fork Labels - only in fork mode */}
      {mode === 'fork' && (
        <div>
          <label style={labelStyle}>Branch Labels</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: forkCount }, (_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  minWidth: '16px',
                }}>
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={data.forkLabels?.[i] || ''}
                  onChange={(e) => {
                    const newLabels = [...(data.forkLabels || [])]
                    newLabels[i] = e.target.value
                    onChange('forkLabels', newLabels)
                  }}
                  placeholder={`Branch ${i + 1}`}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '11px',
                  }}
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Custom names for each branch (optional)
          </p>
        </div>
      )}

      {/* Wait Strategy */}
      <div>
        <label style={labelStyle}>Wait Strategy</label>
        <select
          value={data.waitFor || 'all'}
          onChange={(e) => onChange('waitFor', e.target.value)}
          style={selectStyle}
        >
          <option value="all">All (wait for all branches)</option>
          <option value="any">Any (first success)</option>
          <option value="race">Race (first to finish)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.waitFor === 'all' && 'Waits for all parallel branches to complete before continuing.'}
          {data.waitFor === 'any' && 'Continues when the first branch succeeds; ignores failures.'}
          {data.waitFor === 'race' && 'Continues when the first branch completes (success or failure).'}
        </p>
      </div>

      {/* Merge Strategy */}
      <div>
        <label style={labelStyle}>Merge Strategy</label>
        <select
          value={data.mergeStrategy || 'object'}
          onChange={(e) => onChange('mergeStrategy', e.target.value)}
          style={selectStyle}
        >
          <option value="object">Object (keyed by branch)</option>
          <option value="array">Array (list of outputs)</option>
          <option value="first">First (single result)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.mergeStrategy === 'object' && 'Outputs an object with branch IDs as keys.'}
          {data.mergeStrategy === 'array' && 'Outputs an array of all branch results.'}
          {data.mergeStrategy === 'first' && 'Outputs only the first successful result.'}
        </p>
      </div>

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>How to use:</strong>
        <p style={{ margin: '8px 0 0' }}>
          {mode === 'broadcast'
            ? 'Drag nodes into this container to run them in parallel. All child nodes will execute simultaneously and their outputs will be merged according to your selected strategy.'
            : 'Connect edges from each output handle to different nodes. Each connected path runs in parallel, and results are merged when all paths complete.'}
        </p>
      </div>
    </>
  )
}

function MergeNodeProperties({ data, onChange }: PropertyEditorProps<MergeNodeData>) {
  const inputs = data.inputs || []
  const inputCount = Math.max(inputs.length, 2)

  const updateInputCount = (count: number) => {
    const newInputs = Array.from({ length: count }, (_, i) => inputs[i] || '')
    onChange('inputs', newInputs)
  }

  const updateInputExpression = (index: number, value: string) => {
    const newInputs = [...inputs]
    // Ensure array is long enough
    while (newInputs.length <= index) {
      newInputs.push('')
    }
    newInputs[index] = value
    onChange('inputs', newInputs)
  }

  return (
    <>
      {/* Number of Inputs */}
      <div>
        <label style={labelStyle}>Number of Inputs</label>
        <input
          type="number"
          value={inputCount}
          onChange={(e) => updateInputCount(Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 2)))}
          min={2}
          max={10}
          style={inputStyle}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Number of input connections to merge (2-10)
        </p>
      </div>

      {/* Input Expressions */}
      <div>
        <label style={labelStyle}>Input Mappings</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Array.from({ length: inputCount }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                minWidth: '16px',
              }}>
                {i + 1}.
              </span>
              <input
                type="text"
                value={inputs[i] || ''}
                onChange={(e) => updateInputExpression(i, e.target.value)}
                placeholder={`{{ input_${i + 1} }}`}
                style={{
                  ...inputStyle,
                  flex: 1,
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Template expressions to extract from each input (optional)
        </p>
      </div>

      {/* Mode */}
      <div>
        <label style={labelStyle}>Mode</label>
        <select
          value={data.mode || 'wait'}
          onChange={(e) => onChange('mode', e.target.value)}
          style={selectStyle}
        >
          <option value="wait">Wait (collect all inputs)</option>
          <option value="transform">Transform (passthrough)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {(!data.mode || data.mode === 'wait') && 'Waits for all connected inputs before executing. Skipped branches are excluded.'}
          {data.mode === 'transform' && 'Executes immediately with whatever inputs are available (router/passthrough).'}
        </p>
      </div>

      {/* Merge Strategy */}
      <div>
        <label style={labelStyle}>Merge As</label>
        <select
          value={data.mergeAs || 'object'}
          onChange={(e) => onChange('mergeAs', e.target.value)}
          style={selectStyle}
        >
          <option value="object">Object (keyed by input)</option>
          <option value="array">Array (list of values)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.mergeAs === 'object' && 'Outputs an object with input keys as property names.'}
          {data.mergeAs === 'array' && 'Outputs an array of all input values in order.'}
        </p>
      </div>

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>How to use:</strong>
        <p style={{ margin: '8px 0 0' }}>
          Connect multiple nodes to this merge node to combine their outputs into a single result.
          Use with Parallel to collect results from parallel branches.
        </p>
        <p style={{ margin: '8px 0 0' }}>
          <strong>Wait mode:</strong> Waits until all non-skipped inputs have produced output.
        </p>
        <p style={{ margin: '4px 0 0' }}>
          <strong>Transform mode:</strong> Passes through immediately, useful for routing/aggregation.
        </p>
      </div>
    </>
  )
}

function OutputNodeProperties({ data, onChange }: PropertyEditorProps<OutputNodeData>) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
      <p style={{ marginBottom: '8px' }}>
        The Output node marks the end of the workflow and collects the final result.
      </p>
      <p>
        Connect the last node in your workflow to this output to capture its result.
      </p>
    </div>
  )
}

function UserInputNodeProperties({ data, onChange }: PropertyEditorProps<UserInputNodeData>) {
  const addChoice = () => {
    const newChoices = [...(data.choices || []), '']
    onChange('choices', newChoices)
  }

  const updateChoice = (index: number, value: string) => {
    const newChoices = [...(data.choices || [])]
    newChoices[index] = value
    onChange('choices', newChoices)
  }

  const removeChoice = (index: number) => {
    const newChoices = (data.choices || []).filter((_, i) => i !== index)
    onChange('choices', newChoices)
  }

  return (
    <>
      {/* Prompt */}
      <div>
        <label style={labelStyle}>Prompt Message</label>
        <textarea
          value={data.prompt || ''}
          onChange={(e) => onChange('prompt', e.target.value)}
          placeholder="Enter your message here..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Supports {'{{ }}'} template expressions
        </p>
      </div>

      {/* Input Type */}
      <div>
        <label style={labelStyle}>Input Type</label>
        <select
          value={data.inputType || 'text'}
          onChange={(e) => onChange('inputType', e.target.value)}
          style={selectStyle}
        >
          <option value="text">Single Line Text</option>
          <option value="textarea">Multi-line Text</option>
          <option value="choice">Multiple Choice</option>
          <option value="confirm">Yes/No Confirmation</option>
          <option value="number">Number</option>
        </select>
      </div>

      {/* Choices (for choice type) */}
      {data.inputType === 'choice' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Choices</label>
            <button
              onClick={addChoice}
              style={{
                fontSize: '12px',
                color: 'var(--accent)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              + Add
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(data.choices || []).map((choice, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={choice}
                  onChange={(e) => updateChoice(index, e.target.value)}
                  placeholder={`Choice ${index + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => removeChoice(index)}
                  style={{
                    color: 'var(--error)',
                    fontSize: '11px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {(!data.choices || data.choices.length === 0) && (
              <p style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                Add choices for the user to select from
              </p>
            )}
          </div>
        </div>
      )}

      {/* Placeholder */}
      {(data.inputType === 'text' || data.inputType === 'textarea' || data.inputType === 'number') && (
        <div>
          <label style={labelStyle}>Placeholder</label>
          <input
            type="text"
            value={data.placeholder || ''}
            onChange={(e) => onChange('placeholder', e.target.value)}
            placeholder="Placeholder text..."
            style={inputStyle}
          />
        </div>
      )}

      {/* Default Value */}
      {data.inputType !== 'confirm' && (
        <div>
          <label style={labelStyle}>Default Value</label>
          <input
            type={data.inputType === 'number' ? 'number' : 'text'}
            value={data.defaultValue || ''}
            onChange={(e) => onChange('defaultValue', e.target.value)}
            placeholder="Default value (optional)"
            style={inputStyle}
          />
        </div>
      )}

      {/* Required */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={data.required || false}
            onChange={(e) => onChange('required', e.target.checked)}
          />
          Required input
        </label>
      </div>

      {/* Show Context */}
      <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={data.showContext || false}
            onChange={(e) => onChange('showContext', e.target.checked)}
          />
          Show previous output to user
        </label>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Displays the previous node's output as context
        </p>
      </div>

      {/* Context Template (if showing context) */}
      {data.showContext && (
        <div>
          <label style={labelStyle}>Context Template (optional)</label>
          <textarea
            value={data.contextTemplate || ''}
            onChange={(e) => onChange('contextTemplate', e.target.value)}
            placeholder="Custom template for context display..."
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Use {'{{ previous_output }}'} to reference the output
          </p>
        </div>
      )}

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>Use cases:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
          <li>Interactive chat workflows</li>
          <li>Human-in-the-loop approval</li>
          <li>Data collection mid-workflow</li>
          <li>Debugging with manual input</li>
        </ul>
      </div>
    </>
  )
}

function CallbackNodeProperties({ data, onChange, nodeId }: PropertyEditorProps<CallbackNodeData>) {
  // Detect source node type for context-aware options
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  const { sourceNodeType, sourceHandle, isConnectedToCheckpointHandle } = useMemo(() => {
    if (!nodeId) return { sourceNodeType: null, sourceHandle: null, isConnectedToCheckpointHandle: false }
    const incomingEdge = edges.find(e => e.target === nodeId)
    if (!incomingEdge) return { sourceNodeType: null, sourceHandle: null, isConnectedToCheckpointHandle: false }
    const sourceNode = nodes.find(n => n.id === incomingEdge.source)
    const nodeType = sourceNode?.type || null
    const handleId = incomingEdge.sourceHandle || null
    // Check if connected to ANY node's onCheckpoint handle
    const isFromCheckpoint = handleId === 'onCheckpoint'
    return { sourceNodeType: nodeType, sourceHandle: handleId, isConnectedToCheckpointHandle: isFromCheckpoint }
  }, [edges, nodes, nodeId])

  const isConnectedToAgent = sourceNodeType === 'agent'
  const isConnectedToLoop = sourceNodeType === 'loop'
  const isConnectedToPrompt = sourceNodeType === 'prompt'
  const isConnectedToGuardrail = sourceNodeType === 'guardrail'
  const isConnectedToChatAgent = sourceNodeType === 'chat-agent'

  // Checkbox style helper
  const checkboxRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '6px 0',
  }

  return (
    <>
      {/* Checkpoint Name */}
      <div>
        <label style={labelStyle}>Checkpoint Name</label>
        <input
          type="text"
          value={data.checkpointName || ''}
          onChange={(e) => onChange('checkpointName', e.target.value)}
          placeholder="e.g., after-validation"
          style={inputStyle}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Identifier for this checkpoint in logs and execution history
        </p>
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="What this checkpoint monitors"
          style={inputStyle}
        />
      </div>

      {/* Behaviors Section */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginTop: '4px',
      }}>
        <label style={{ ...labelStyle, marginBottom: '8px' }}>Behaviors</label>
        <p style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '12px' }}>
          Enable one or more behaviors. Combine them as needed.
        </p>

        {/* Log to Console */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.logToConsole || false}
            onChange={(e) => onChange('logToConsole', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>Log to console</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Write checkpoint data to stdout
            </span>
          </div>
        </label>

        {/* Log to History */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.logToHistory || false}
            onChange={(e) => onChange('logToHistory', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>Log to execution history</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Store for later review
            </span>
          </div>
        </label>

        {/* Pause in Debug */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.pauseInDebug || false}
            onChange={(e) => onChange('pauseInDebug', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: 'var(--node-amber)' }}>Pause in debug mode</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Breakpoint for inspection
            </span>
          </div>
        </label>

        {/* Require Approval */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.requireApproval || false}
            onChange={(e) => onChange('requireApproval', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: 'var(--node-orange)' }}>Require approval</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              Human gate (works in production)
            </span>
          </div>
        </label>

        {/* Send Webhook */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={data.sendWebhook || false}
            onChange={(e) => onChange('sendWebhook', e.target.checked)}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500, color: 'var(--node-teal)' }}>Send webhook</span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--muted)' }}>
              HTTP notification
            </span>
          </div>
        </label>
      </div>

      {/* Message Template */}
      <div>
        <label style={labelStyle}>Message (optional)</label>
        <textarea
          value={data.message || ''}
          onChange={(e) => onChange('message', e.target.value)}
          placeholder="Status: Processing completed for {{ previous_output.id }}"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Template with {'{{ }}'} expressions for dynamic content
        </p>
      </div>

      {/* Data Capture Options */}
      <div>
        <label style={labelStyle}>Data to Capture</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.capturePreviousOutput !== false}
              onChange={(e) => onChange('capturePreviousOutput', e.target.checked)}
            />
            Previous node output
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.captureTimestamp !== false}
              onChange={(e) => onChange('captureTimestamp', e.target.checked)}
            />
            Timestamp & duration
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.captureFullContext || false}
              onChange={(e) => onChange('captureFullContext', e.target.checked)}
            />
            Full execution context (variables, state)
          </label>
        </div>
      </div>

      {/* Approval Options - shown when requireApproval is enabled */}
      {data.requireApproval && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-orange) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-orange) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <ShieldCheck style={{ width: 14, height: 14, color: 'var(--node-orange)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-orange)' }}>
              Approval Settings
            </label>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>Dialog Title</label>
            <input
              type="text"
              value={data.approvalTitle || ''}
              onChange={(e) => onChange('approvalTitle', e.target.value)}
              placeholder="Review Required"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>Instructions</label>
            <textarea
              value={data.approvalInstructions || ''}
              onChange={(e) => onChange('approvalInstructions', e.target.value)}
              placeholder="Please review the data and approve to continue..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontSize: '11px' }}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>Timeout (ms, 0 = wait forever)</label>
            <input
              type="number"
              value={data.approvalTimeoutMs || 0}
              onChange={(e) => onChange('approvalTimeoutMs', parseInt(e.target.value, 10))}
              min={0}
              step={60000}
              style={inputStyle}
            />
          </div>

          {(data.approvalTimeoutMs ?? 0) > 0 && (
            <div>
              <label style={{ ...labelStyle, fontSize: '11px' }}>On Timeout</label>
              <select
                value={data.approvalTimeoutAction || 'fail'}
                onChange={(e) => onChange('approvalTimeoutAction', e.target.value)}
                style={selectStyle}
              >
                <option value="fail">Fail workflow</option>
                <option value="continue">Continue anyway</option>
                <option value="skip">Skip this step</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Webhook Options - shown when sendWebhook is enabled */}
      {data.sendWebhook && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-teal) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-teal) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <Webhook style={{ width: 14, height: 14, color: 'var(--node-teal)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-teal)' }}>
              Webhook Settings
            </label>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>URL</label>
            <input
              type="url"
              value={data.webhookUrl || ''}
              onChange={(e) => onChange('webhookUrl', e.target.value)}
              placeholder="https://api.example.com/webhook"
              style={inputStyle}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={data.webhookWaitForAck || false}
              onChange={(e) => onChange('webhookWaitForAck', e.target.checked)}
            />
            Wait for acknowledgment before continuing
          </label>

          {data.webhookWaitForAck && (
            <div>
              <label style={{ ...labelStyle, fontSize: '11px' }}>Ack Timeout (ms, 0 = no timeout)</label>
              <input
                type="number"
                value={data.webhookAckTimeoutMs || 0}
                onChange={(e) => onChange('webhookAckTimeoutMs', parseInt(e.target.value, 10))}
                min={0}
                step={1000}
                style={inputStyle}
              />
            </div>
          )}
        </div>
      )}

      {/* Pre-Node Aware: Agent options */}
      {isConnectedToAgent && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-indigo) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-indigo) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <Bot style={{ width: 14, height: 14, color: 'var(--node-indigo)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-indigo)' }}>
              Agent Data Capture
            </label>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px' }}>
            Connected to Agent node. Capture agent-specific execution data.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureIterations ?? false}
                onChange={(e) => onChange('agentCaptureIterations', e.target.checked)}
              />
              Iteration history (LLM calls)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureConversation ?? false}
                onChange={(e) => onChange('agentCaptureConversation', e.target.checked)}
              />
              Conversation history
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureToolCalls ?? false}
                onChange={(e) => onChange('agentCaptureToolCalls', e.target.checked)}
              />
              Tool call details & results
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.agentCaptureThinking ?? false}
                onChange={(e) => onChange('agentCaptureThinking', e.target.checked)}
              />
              Thinking/reasoning (if available)
            </label>
          </div>
        </div>
      )}

      {/* Pre-Node Aware: Loop options */}
      {isConnectedToLoop && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-green) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-green) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <RotateCcw style={{ width: 14, height: 14, color: 'var(--node-green)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-green)' }}>
              Loop Data Capture
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.loopCaptureIteration ?? true}
                onChange={(e) => onChange('loopCaptureIteration', e.target.checked)}
              />
              Current iteration index
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.loopCaptureVariable ?? true}
                onChange={(e) => onChange('loopCaptureVariable', e.target.checked)}
              />
              Loop variable value
            </label>
          </div>
        </div>
      )}

      {/* Pre-Node Aware: Prompt options */}
      {isConnectedToPrompt && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-blue) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-blue) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <MessageSquare style={{ width: 14, height: 14, color: 'var(--node-blue)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-blue)' }}>
              Prompt Data Capture
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.promptCaptureCompiled ?? false}
                onChange={(e) => onChange('promptCaptureCompiled', e.target.checked)}
              />
              Compiled prompt (sent to LLM)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={data.promptCaptureTokens ?? false}
                onChange={(e) => onChange('promptCaptureTokens', e.target.checked)}
              />
              Token usage stats
            </label>
          </div>
        </div>
      )}

      {/* Event Subscription - shown when connected to ANY node's onCheckpoint handle */}
      {isConnectedToCheckpointHandle && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'color-mix(in srgb, var(--node-amber) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--node-amber) 30%, transparent)',
          borderRadius: '6px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            <Activity style={{ width: 14, height: 14, color: 'var(--node-amber)' }} />
            <label style={{ ...labelStyle, margin: 0, color: 'var(--node-amber)' }}>
              Event Subscription
            </label>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px' }}>
            Connected to {sourceNodeType}'s checkpoint output. Select which events trigger this checkpoint.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Agent Node Events */}
            {sourceNodeType === 'agent' && [
              { value: 'toolCall', label: 'Tool Calls', desc: 'When agent requests tool execution' },
              { value: 'iteration', label: 'Iterations', desc: 'After each LLM response' },
              { value: 'thinking', label: 'Thinking', desc: 'Agent reasoning/chain-of-thought' },
              { value: 'error', label: 'Errors', desc: 'When errors occur' },
              { value: 'complete', label: 'Complete', desc: 'When agent finishes' },
            ].map(eventType => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={eventType.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['toolCall', 'iteration', 'thinking', 'error', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}

            {/* ChatAgent Node Events */}
            {sourceNodeType === 'chat-agent' && [
              { value: 'iteration', label: 'User Input', desc: 'onUserInput checkpoint' },
              { value: 'iteration', label: 'Before Guardrail', desc: 'beforeGuardrail checkpoint' },
              { value: 'iteration', label: 'After Guardrail', desc: 'afterGuardrail checkpoint' },
              { value: 'iteration', label: 'Iteration Start', desc: 'onIterationStart checkpoint' },
              { value: 'iteration', label: 'Iteration End', desc: 'onIterationEnd checkpoint' },
              { value: 'toolCall', label: 'Tool Call', desc: 'onToolCall checkpoint' },
              { value: 'toolCall', label: 'Tool Result', desc: 'onToolResult checkpoint' },
              { value: 'complete', label: 'Complete', desc: 'onAgentComplete checkpoint' },
            ].map((eventType, index) => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={`${eventType.value}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['iteration', 'toolCall', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}

            {/* Guardrail Node Events */}
            {sourceNodeType === 'guardrail' && [
              { value: 'iteration', label: 'Before Validation', desc: 'Before LLM validation' },
              { value: 'error', label: 'Errors', desc: 'When validation fails' },
              { value: 'complete', label: 'Complete', desc: 'Validation result (pass/reject)' },
            ].map(eventType => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={eventType.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['iteration', 'error', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}

            {/* Prompt Node Events */}
            {sourceNodeType === 'prompt' && [
              { value: 'iteration', label: 'Before Execution', desc: 'Before prompt is sent to LLM' },
              { value: 'error', label: 'Errors', desc: 'When execution fails' },
              { value: 'complete', label: 'Complete', desc: 'LLM response received' },
            ].map(eventType => {
              const currentListenTo = data.listenTo || []
              const isAllEvents = currentListenTo.length === 0
              const isChecked = isAllEvents || currentListenTo.includes(eventType.value as AgentCheckpointEventType)

              return (
                <label
                  key={eventType.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const allTypes = ['iteration', 'error', 'complete']
                      let newListenTo: AgentCheckpointEventType[]

                      if (isAllEvents) {
                        newListenTo = e.target.checked
                          ? []
                          : allTypes.filter(t => t !== eventType.value) as AgentCheckpointEventType[]
                      } else {
                        if (e.target.checked) {
                          newListenTo = [...currentListenTo, eventType.value as AgentCheckpointEventType]
                          if (newListenTo.length === allTypes.length) newListenTo = []
                        } else {
                          newListenTo = currentListenTo.filter(t => t !== eventType.value)
                        }
                      }

                      onChange('listenTo', newListenTo.length > 0 ? newListenTo : undefined)
                    }}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{eventType.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{eventType.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '10px', fontStyle: 'italic' }}>
            {(!data.listenTo || data.listenTo.length === 0)
              ? 'Subscribed to all events'
              : `Subscribed to: ${data.listenTo.join(', ')}`}
          </p>
        </div>
      )}
    </>
  )
}

// Helper function to get code placeholder based on language
function getCodePlaceholder(language: string): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return `// Input is available as 'input' variable
// Return the result to pass to next node

const result = input.toUpperCase();
return result;`
    case 'python':
      return `# Input is available as 'input' variable
# Print the result to pass to next node

result = input.upper()
print(result)`
    case 'csharp':
      return `// Input is available as 'input' variable
// Return the result to pass to next node

var result = input.ToUpper();
return result;`
    default:
      return '// Enter your code here'
  }
}

function ToolNodeProperties({ data, onChange }: PropertyEditorProps<ToolNodeData>) {
  const theme = useUIStore(state => state.theme)
  const [showCodeEditor, setShowCodeEditor] = useState(false)
  const toolType = data.toolType || 'function'

  // Check if code contains {{ }} variables
  const codeHasVariables = toolType === 'code' && hasVariables(data.codeSnippet || '')

  // Get Monaco language for code editor
  const getMonacoLanguage = (): string => {
    switch (data.codeLanguage || 'typescript') {
      case 'typescript': return 'typescript'
      case 'javascript': return 'javascript'
      case 'python': return 'python'
      case 'csharp': return 'csharp'
      default: return 'typescript'
    }
  }

  // Get icon for tool type
  const getToolTypeIcon = () => {
    switch (toolType) {
      case 'function':
        return <Code style={{ width: 14, height: 14 }} />
      case 'mcp':
        return <Server style={{ width: 14, height: 14 }} />
      case 'http':
        return <Globe style={{ width: 14, height: 14 }} />
      default:
        return <Wrench style={{ width: 14, height: 14 }} />
    }
  }

  return (
    <>
      {/* Tool Type */}
      <div>
        <label style={labelStyle}>Tool Type</label>
        <select
          value={toolType}
          onChange={(e) => onChange('toolType', e.target.value)}
          style={selectStyle}
        >
          <option value="function">Function (registered callback)</option>
          <option value="mcp">MCP Server Tool</option>
          <option value="http">HTTP Request</option>
          <option value="command">Shell Command</option>
          <option value="code">Code Snippet</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {toolType === 'function' && 'Call a function/callback registered with the workflow executor.'}
          {toolType === 'mcp' && 'Call a tool exposed by an MCP (Model Context Protocol) server.'}
          {toolType === 'http' && 'Make an HTTP request to an external API.'}
          {toolType === 'command' && 'Execute a whitelisted shell command (npm, git, python, etc.).'}
          {toolType === 'code' && 'Execute a code snippet in TypeScript, Python, or C#.'}
        </p>
      </div>

      {/* Tool Name (for function and mcp) */}
      {(toolType === 'function' || toolType === 'mcp') && (
        <div>
          <label style={labelStyle}>
            {toolType === 'function' ? 'Function Name' : 'Tool Name'}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getToolTypeIcon()}
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder={toolType === 'function' ? 'e.g., searchDatabase' : 'e.g., web_search'}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            {toolType === 'function'
              ? 'Must match a function name registered in the executor options.'
              : 'The tool name as exposed by the MCP server.'}
          </p>
        </div>
      )}

      {/* MCP Server (for mcp type) */}
      {toolType === 'mcp' && (
        <>
          <div>
            <label style={labelStyle}>MCP Server</label>
            <input
              type="text"
              value={data.mcpServerName || ''}
              onChange={(e) => onChange('mcpServerName', e.target.value)}
              placeholder="Server name (from config) or leave blank for URL"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>MCP Server URL (if not using named server)</label>
            <input
              type="text"
              value={data.mcpServerUrl || ''}
              onChange={(e) => onChange('mcpServerUrl', e.target.value)}
              placeholder="e.g., http://localhost:3333"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* HTTP Configuration (for http type) */}
      {toolType === 'http' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name</label>
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder="e.g., api_call, weather"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The name the LLM will use to call this tool
            </p>
          </div>
          <div>
            <label style={labelStyle}>HTTP Method</label>
            <select
              value={data.httpMethod || 'GET'}
              onChange={(e) => onChange('httpMethod', e.target.value)}
              style={selectStyle}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>URL</label>
            <input
              type="text"
              value={data.httpUrl || ''}
              onChange={(e) => onChange('httpUrl', e.target.value)}
              placeholder="https://api.example.com/endpoint"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Supports {'{{ }}'} template expressions
            </p>
          </div>
          <div>
            <label style={labelStyle}>Request Body (for POST/PUT/PATCH)</label>
            <textarea
              value={data.httpBody || ''}
              onChange={(e) => onChange('httpBody', e.target.value)}
              placeholder='{"key": "{{ previous_output }}"}'
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
            />
          </div>
        </>
      )}

      {/* Command Configuration (for command type) */}
      {toolType === 'command' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name</label>
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder="e.g., echo, git_status"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The name the LLM will use to call this tool
            </p>
          </div>
          <div>
            <label style={labelStyle}>Executable</label>
            <select
              value={data.commandExecutable || ''}
              onChange={(e) => onChange('commandExecutable', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select a command...</option>
              <optgroup label="Package Managers">
                <option value="npm">npm - Node.js package manager</option>
                <option value="yarn">yarn - Yarn package manager</option>
                <option value="pnpm">pnpm - PNPM package manager</option>
                <option value="pip">pip - Python package manager</option>
              </optgroup>
              <optgroup label="Runtimes">
                <option value="node">node - Node.js runtime</option>
                <option value="npx">npx - Execute npm packages</option>
                <option value="python">python - Python interpreter</option>
                <option value="python3">python3 - Python 3 interpreter</option>
              </optgroup>
              <optgroup label="Build Tools">
                <option value="tsc">tsc - TypeScript compiler</option>
                <option value="dotnet">dotnet - .NET CLI</option>
                <option value="prompd">prompd - Prompd CLI</option>
              </optgroup>
              <optgroup label="Version Control">
                <option value="git">git - Version control</option>
              </optgroup>
              <optgroup label="Utilities">
                <option value="eslint">eslint - JavaScript linter</option>
                <option value="prettier">prettier - Code formatter</option>
                <option value="echo">echo - Print text</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Action/Subcommand (optional)</label>
            <input
              type="text"
              value={data.commandAction || ''}
              onChange={(e) => onChange('commandAction', e.target.value)}
              placeholder="e.g., run, install, build"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Common actions: run, install, build, test, start
            </p>
          </div>
          <div>
            <label style={labelStyle}>Arguments</label>
            <input
              type="text"
              value={data.commandArgs || ''}
              onChange={(e) => onChange('commandArgs', e.target.value)}
              placeholder="e.g., {{ script_name }} --flag"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Supports {'{{ }}'} template expressions
            </p>
          </div>
          <div>
            <label style={labelStyle}>Working Directory (optional)</label>
            <input
              type="text"
              value={data.commandCwd || ''}
              onChange={(e) => onChange('commandCwd', e.target.value)}
              placeholder="Relative to workspace (leave blank for workspace root)"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="commandRequiresApproval"
              checked={data.commandRequiresApproval || false}
              onChange={(e) => onChange('commandRequiresApproval', e.target.checked)}
            />
            <label htmlFor="commandRequiresApproval" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Require approval before execution
            </label>
          </div>
        </>
      )}

      {/* Code Configuration (for code type) - Using CodeNode-style properties */}
      {toolType === 'code' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name</label>
            <input
              type="text"
              value={data.toolName || ''}
              onChange={(e) => onChange('toolName', e.target.value)}
              placeholder="e.g., typescript, calculate"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The name the LLM will use to call this tool
            </p>
          </div>
          {/* Language */}
          <div>
            <label style={labelStyle}>Language</label>
            <select
              value={data.codeLanguage || 'typescript'}
              onChange={(e) => onChange('codeLanguage', e.target.value)}
              style={selectStyle}
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="csharp">C#</option>
            </select>
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {data.codeLanguage === 'typescript' && 'Executes via Node.js vm or temp file'}
              {data.codeLanguage === 'javascript' && 'Executes via Node.js vm or temp file'}
              {data.codeLanguage === 'python' && 'Executes via python -c or temp file'}
              {data.codeLanguage === 'csharp' && 'Executes via dotnet-script'}
              {!data.codeLanguage && 'Executes via Node.js vm or temp file'}
            </div>
          </div>

          {/* Input Variable Name */}
          <div>
            <label style={labelStyle}>Input Variable Name</label>
            <input
              type="text"
              value={data.codeInputVariable || 'input'}
              onChange={(e) => onChange('codeInputVariable', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder='input'
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Name of the variable that receives the previous node's output
            </div>
          </div>

          {/* Execution Context (TS/JS only) */}
          {(data.codeLanguage === 'typescript' || data.codeLanguage === 'javascript' || !data.codeLanguage) && (
            <div>
              <label style={labelStyle}>Execution Context</label>
              <select
                value={data.codeExecutionContext || 'isolated'}
                onChange={(e) => onChange('codeExecutionContext', e.target.value)}
                style={selectStyle}
              >
                <option value="isolated">Isolated (VM)</option>
                <option value="main">Main Process</option>
              </select>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                {data.codeExecutionContext === 'main'
                  ? 'Runs with full access (use with caution)'
                  : 'Runs in sandboxed context for security'}
              </div>
            </div>
          )}

          {/* Code Editor */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Code</label>
              <button
                onClick={() => setShowCodeEditor(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                title="Open full-screen editor (Ctrl+E)"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 25%, transparent)'
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)'
                }}
              >
                <Maximize2 style={{ width: 12, height: 12 }} />
                Open Full Editor
              </button>
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
                value={data.codeSnippet || ''}
                onChange={(val) => onChange('codeSnippet', val || '')}
                language={getMonacoLanguage()}
                theme={getMonacoTheme(theme === 'dark')}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  fontSize: 12,
                  padding: { top: 8 },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                }}
              />
            </div>

            {/* Variable Preview - shows pills for {{ }} syntax in code */}
            {codeHasVariables && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  background: 'var(--panel-2)',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', marginBottom: '4px' }}>
                  <Braces style={{ width: 10, height: 10 }} />
                  Variables used:
                </div>
                <VariablePreview text={data.codeSnippet || ''} size="sm" />
              </div>
            )}

            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {getCodePlaceholder(data.codeLanguage || 'typescript').split('\n')[0]}
            </div>
          </div>

          {/* Full-screen Code Editor Modal */}
          {showCodeEditor && (
            <MonacoEditorModal
              value={data.codeSnippet || ''}
              onChange={(val) => onChange('codeSnippet', val)}
              onClose={() => setShowCodeEditor(false)}
              language={getMonacoLanguage()}
              title={`Tool Code Editor - ${data.codeLanguage === 'python' ? 'Python' : data.codeLanguage === 'csharp' ? 'C#' : data.codeLanguage === 'javascript' ? 'JavaScript' : 'TypeScript'}`}
              icon={Code}
              helpText={`Input variable: ${data.codeInputVariable || 'input'} | Return your result to pass to next node`}
            />
          )}
        </>
      )}

      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Brief description of what this tool does"
          style={inputStyle}
        />
      </div>

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          value={data.timeout || 30000}
          onChange={(e) => onChange('timeout', parseInt(e.target.value, 10))}
          min={0}
          step={1000}
          style={inputStyle}
        />
      </div>

      {/* Output Transform */}
      <div>
        <label style={labelStyle}>Output Transform (optional)</label>
        <textarea
          value={data.outputTransform || ''}
          onChange={(e) => onChange('outputTransform', e.target.value)}
          placeholder='{{ result }} for full output, {{ result.fieldName }} to extract fields'
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Transform tool output before passing to next node. Use `result` to access tool output. Leave blank to pass through unchanged.
        </p>
      </div>

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>Tool Node:</strong>
        <p style={{ margin: '8px 0 0' }}>
          Execute external tools, APIs, or MCP server capabilities and use the result in your workflow.
        </p>
      </div>
    </>
  )
}

function ToolCallParserNodeProperties({ data, onChange }: PropertyEditorProps<ToolCallParserNodeData>) {
  const addAllowedTool = () => {
    const newTools = [...(data.allowedTools || []), '']
    onChange('allowedTools', newTools)
  }

  const updateAllowedTool = (index: number, value: string) => {
    const newTools = [...(data.allowedTools || [])]
    newTools[index] = value
    onChange('allowedTools', newTools)
  }

  const removeAllowedTool = (index: number) => {
    const newTools = (data.allowedTools || []).filter((_, i) => i !== index)
    onChange('allowedTools', newTools)
  }

  return (
    <>
      {/* Outputs explanation */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginBottom: '8px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
          Two Outputs:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--success)',
              flexShrink: 0,
            }} />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--success)' }}>Found</strong> - Tool call detected, outputs parsed tool info
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--muted)',
              flexShrink: 0,
              marginLeft: '1px',
            }} />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--muted)' }}>Not Found</strong> - No tool call, outputs original text
            </div>
          </div>
        </div>
      </div>

      {/* Format Selection */}
      <div>
        <label style={labelStyle}>Parse Format</label>
        <select
          value={data.format || 'auto'}
          onChange={(e) => onChange('format', e.target.value)}
          style={selectStyle}
        >
          <option value="auto">Auto-detect</option>
          <option value="openai">OpenAI (tool_calls array)</option>
          <option value="anthropic">Anthropic (tool_use blocks)</option>
          <option value="xml">XML tags</option>
          <option value="json">Generic JSON</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.format === 'auto' && 'Automatically detect the tool call format from the LLM response.'}
          {data.format === 'openai' && 'Parse OpenAI function calling format (tool_calls array).'}
          {data.format === 'anthropic' && 'Parse Anthropic tool_use content blocks.'}
          {data.format === 'xml' && 'Parse XML-style <tool_call> tags.'}
          {data.format === 'json' && 'Parse generic JSON with configurable field names.'}
        </p>
      </div>

      {/* JSON format options */}
      {data.format === 'json' && (
        <>
          <div>
            <label style={labelStyle}>Tool Name Field</label>
            <input
              type="text"
              value={data.jsonToolNameField || 'tool'}
              onChange={(e) => onChange('jsonToolNameField', e.target.value)}
              placeholder="tool"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Parameters Field</label>
            <input
              type="text"
              value={data.jsonParametersField || 'parameters'}
              onChange={(e) => onChange('jsonParametersField', e.target.value)}
              placeholder="parameters"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* XML format options */}
      {data.format === 'xml' && (
        <div>
          <label style={labelStyle}>XML Tag Name</label>
          <input
            type="text"
            value={data.xmlTagName || 'tool_call'}
            onChange={(e) => onChange('xmlTagName', e.target.value)}
            placeholder="tool_call"
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Will look for {'<tag_name><name>...</name><params>...</params></tag_name>'}
          </p>
        </div>
      )}

      {/* Allowed Tools */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Allowed Tools (optional)</label>
          <button
            onClick={addAllowedTool}
            style={{
              fontSize: '12px',
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {(data.allowedTools || []).map((tool, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={tool}
                onChange={(e) => updateAllowedTool(index, e.target.value)}
                placeholder={`Tool name ${index + 1}`}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => removeAllowedTool(index)}
                style={{
                  color: 'var(--error)',
                  fontSize: '11px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                Remove
              </button>
            </div>
          ))}
          {(!data.allowedTools || data.allowedTools.length === 0) && (
            <p style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
              Leave empty to allow any tool name. If specified, unrecognized tools go to "Not Found" output.
            </p>
          )}
        </div>
      </div>

      {/* Found output data structure */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--success)' }}>Found Output:</strong>
        <pre style={{
          margin: '6px 0 0 0',
          padding: '8px',
          background: 'var(--bg)',
          borderRadius: '4px',
          fontSize: '10px',
          overflow: 'auto',
        }}>
{`{
  hasToolCall: true,
  toolName: "search",
  toolParameters: { query: "..." },
  format: "openai"
}`}
        </pre>
      </div>
    </>
  )
}

/**
 * ToolCallRouterNodeProperties - Configure Tool Call Router container
 */
function ToolCallRouterNodeProperties({ data, onChange }: PropertyEditorProps<ToolCallRouterNodeData>) {
  const nodes = useWorkflowStore(state => state.nodes)
  const selectedNodeId = useWorkflowStore(state => state.selectedNodeId)

  // Get child Tool nodes for fallback dropdown
  const childToolNodes = useMemo(() => {
    if (!selectedNodeId) return []
    return nodes.filter(n => n.parentId === selectedNodeId && n.type === 'tool')
  }, [nodes, selectedNodeId])

  return (
    <>
      {/* Description */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginBottom: '16px',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Routes tool calls from AI agents to the appropriate Tool node inside this container.
          Drag Tool nodes inside this container to make them available for routing.
        </div>
      </div>

      {/* Routing Mode */}
      <div>
        <label style={labelStyle}>Routing Mode</label>
        <select
          value={data.routingMode || 'name-match'}
          onChange={(e) => onChange('routingMode', e.target.value as 'name-match' | 'pattern' | 'fallback')}
          style={selectStyle}
        >
          <option value="name-match">Name Match</option>
          <option value="pattern">Pattern Match</option>
          <option value="fallback">Fallback Only</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.routingMode === 'name-match' && 'Match tool calls by exact tool name.'}
          {data.routingMode === 'pattern' && 'Match tool calls using regex patterns defined in Tool nodes.'}
          {data.routingMode === 'fallback' && 'All tool calls route to the fallback tool.'}
        </p>
      </div>

      {/* No Match Behavior */}
      <div>
        <label style={labelStyle}>When No Tool Matches</label>
        <select
          value={data.onNoMatch || 'error'}
          onChange={(e) => onChange('onNoMatch', e.target.value as 'error' | 'passthrough' | 'fallback-tool')}
          style={selectStyle}
        >
          <option value="error">Error</option>
          <option value="passthrough">Pass Through</option>
          <option value="fallback-tool">Use Fallback Tool</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.onNoMatch === 'error' && 'Return an error if no Tool node matches the requested tool name.'}
          {data.onNoMatch === 'passthrough' && 'Pass the tool call through unchanged (useful for debugging).'}
          {data.onNoMatch === 'fallback-tool' && 'Route to a designated fallback Tool node.'}
        </p>
      </div>

      {/* Fallback Tool Selection */}
      {data.onNoMatch === 'fallback-tool' && (
        <div>
          <label style={labelStyle}>Fallback Tool</label>
          <select
            value={data.fallbackToolId || ''}
            onChange={(e) => onChange('fallbackToolId', e.target.value || undefined)}
            style={selectStyle}
          >
            <option value="">Select a tool...</option>
            {childToolNodes.map(node => (
              <option key={node.id} value={node.id}>
                {(node.data as ToolNodeData).toolName || node.data.label}
              </option>
            ))}
          </select>
          {childToolNodes.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '4px' }}>
              No Tool nodes found inside this container. Drag Tool nodes into this container to make them available.
            </p>
          )}
        </div>
      )}

      {/* Tool Count Display */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginTop: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wrench style={{ width: 16, height: 16, color: 'var(--node-emerald)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
              Tools Available
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {childToolNodes.length} tool{childToolNodes.length !== 1 ? 's' : ''} in this router
            </div>
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--node-emerald)',
          }}>
            {childToolNodes.length}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * AgentNodeProperties - Configure AI Agent with ReAct-style tool-use loop
 */
function AgentNodeProperties({ data, onChange }: PropertyEditorProps<AgentNodeData>) {
  const [expandedToolIndex, setExpandedToolIndex] = useState<number | null>(null)

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
    setExpandedToolIndex((data.tools || []).length) // Expand the new tool
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

  // Parameter schema helpers
  const addParameter = (toolIndex: number) => {
    const tool = data.tools?.[toolIndex]
    if (!tool) return

    const params = tool.parameters || { type: 'object', properties: {}, required: [] }
    const existingNames = Object.keys(params.properties || {})
    let newName = 'param'
    let counter = 1
    while (existingNames.includes(newName)) {
      newName = `param${counter++}`
    }

    const newProperties = {
      ...params.properties,
      [newName]: { type: 'string', description: '' },
    }

    updateTool(toolIndex, 'parameters', {
      ...params,
      properties: newProperties,
    })
  }

  const updateParameter = (toolIndex: number, paramName: string, updates: { name?: string; type?: string; description?: string; isRequired?: boolean }) => {
    const tool = data.tools?.[toolIndex]
    if (!tool) return

    const params = tool.parameters || { type: 'object', properties: {}, required: [] }
    const properties = { ...params.properties }
    const required = [...(params.required || [])]

    // Handle name change
    if (updates.name !== undefined && updates.name !== paramName) {
      const paramValue = properties[paramName]
      delete properties[paramName]
      properties[updates.name] = paramValue

      // Update required array
      const reqIndex = required.indexOf(paramName)
      if (reqIndex !== -1) {
        required[reqIndex] = updates.name
      }
    }

    // Get current param name (after potential rename)
    const currentName = updates.name ?? paramName

    // Update type/description
    if (updates.type !== undefined || updates.description !== undefined) {
      properties[currentName] = {
        ...properties[currentName],
        ...(updates.type !== undefined && { type: updates.type }),
        ...(updates.description !== undefined && { description: updates.description }),
      }
    }

    // Handle required toggle
    if (updates.isRequired !== undefined) {
      const reqIndex = required.indexOf(currentName)
      if (updates.isRequired && reqIndex === -1) {
        required.push(currentName)
      } else if (!updates.isRequired && reqIndex !== -1) {
        required.splice(reqIndex, 1)
      }
    }

    updateTool(toolIndex, 'parameters', {
      type: 'object',
      properties,
      required,
    })
  }

  const removeParameter = (toolIndex: number, paramName: string) => {
    const tool = data.tools?.[toolIndex]
    if (!tool) return

    const params = tool.parameters || { type: 'object', properties: {}, required: [] }
    const properties = { ...params.properties }
    delete properties[paramName]

    const required = (params.required || []).filter(r => r !== paramName)

    updateTool(toolIndex, 'parameters', {
      type: 'object',
      properties,
      required,
    })
  }

  return (
    <>
      {/* System Prompt */}
      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea
          value={data.systemPrompt || ''}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
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
          Instructions for the AI agent. Tool definitions are automatically appended.
        </p>
      </div>

      {/* User Prompt */}
      <div>
        <label style={labelStyle}>User Prompt (Task)</label>
        <textarea
          value={data.userPrompt || ''}
          onChange={(e) => onChange('userPrompt', e.target.value)}
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
          The task/request to send to the agent. Use {'{{ input }}'} to pass through the previous node's output.
        </p>
      </div>

      {/* LLM Provider Config (Node/Inline toggle with provider selector) */}
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
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Maximum number of reasoning/tool-use cycles before stopping.
        </p>
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
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.outputMode === 'final-response' && 'Output the LLM\'s final answer after all tool calls complete.'}
          {data.outputMode === 'full-conversation' && 'Output the complete conversation history including all tool calls.'}
          {data.outputMode === 'last-tool-result' && 'Output only the result from the last tool that was called.'}
          {!data.outputMode && 'Output the LLM\'s final answer after all tool calls complete.'}
        </p>
      </div>

      {/* Tools Section */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <label style={{ ...labelStyle, marginBottom: 0, fontSize: '13px', fontWeight: 600 }}>
            Tools ({(data.tools || []).length})
          </label>
          <button
            onClick={addTool}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Tool
          </button>
        </div>

        {(data.tools || []).length === 0 && (
          <div style={{
            padding: '16px',
            background: 'var(--panel-2)',
            borderRadius: '6px',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '12px',
          }}>
            No tools defined. Add tools to enable the agent to take actions.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  padding: '10px 12px',
                  background: 'var(--panel-2)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench style={{ width: 14, height: 14, color: 'var(--node-orange)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                    {tool.name || `Tool ${index + 1}`}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    color: 'var(--muted)',
                    background: 'var(--bg)',
                    padding: '2px 6px',
                    borderRadius: '4px',
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
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* Tool Details (expanded) */}
              {expandedToolIndex === index && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Tool Name</label>
                    <input
                      type="text"
                      value={tool.name}
                      onChange={(e) => updateTool(index, 'name', e.target.value)}
                      placeholder="search_database"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Description</label>
                    <textarea
                      value={tool.description}
                      onChange={(e) => updateTool(index, 'description', e.target.value)}
                      placeholder="Search the database for relevant records..."
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Tool Type</label>
                    <select
                      value={tool.toolType}
                      onChange={(e) => updateTool(index, 'toolType', e.target.value)}
                      style={selectStyle}
                    >
                      <option value="function">Function (callback)</option>
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

                  {/* Parameter Schema Editor */}
                  <div style={{ marginTop: '4px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}>
                      <label style={{ ...labelStyle, fontSize: '11px', marginBottom: 0 }}>
                        Parameters ({Object.keys(tool.parameters?.properties || {}).length})
                      </label>
                      <button
                        onClick={() => addParameter(index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '10px',
                          color: 'var(--accent)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 6px',
                        }}
                      >
                        <Plus style={{ width: 12, height: 12 }} />
                        Add
                      </button>
                    </div>

                    {Object.keys(tool.parameters?.properties || {}).length === 0 ? (
                      <div style={{
                        padding: '10px',
                        background: 'var(--panel-2)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: 'var(--muted)',
                        textAlign: 'center',
                      }}>
                        No parameters defined. The LLM will call this tool without arguments.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {Object.entries(tool.parameters?.properties || {}).map(([paramName, paramDef], paramIndex) => {
                          const isRequired = (tool.parameters?.required || []).includes(paramName)
                          return (
                            <div
                              key={`param-${index}-${paramIndex}`}
                              style={{
                                padding: '8px',
                                background: 'var(--panel-2)',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                <input
                                  type="text"
                                  value={paramName}
                                  onChange={(e) => updateParameter(index, paramName, { name: e.target.value })}
                                  placeholder="param_name"
                                  style={{
                                    ...inputStyle,
                                    flex: 1,
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    fontFamily: 'monospace',
                                  }}
                                />
                                <select
                                  value={paramDef.type || 'string'}
                                  onChange={(e) => updateParameter(index, paramName, { type: e.target.value })}
                                  style={{
                                    ...selectStyle,
                                    width: '80px',
                                    fontSize: '10px',
                                    padding: '4px 6px',
                                  }}
                                >
                                  <option value="string">string</option>
                                  <option value="number">number</option>
                                  <option value="integer">integer</option>
                                  <option value="boolean">boolean</option>
                                  <option value="array">array</option>
                                  <option value="object">object</option>
                                </select>
                                <button
                                  onClick={() => removeParameter(index, paramName)}
                                  style={{
                                    color: 'var(--error)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                  title="Remove parameter"
                                >
                                  <X style={{ width: 12, height: 12 }} />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={paramDef.description || ''}
                                onChange={(e) => updateParameter(index, paramName, { description: e.target.value })}
                                placeholder="Description for the LLM..."
                                style={{
                                  ...inputStyle,
                                  fontSize: '10px',
                                  padding: '4px 8px',
                                  marginBottom: '4px',
                                }}
                              />
                              <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}>
                                <input
                                  type="checkbox"
                                  checked={isRequired}
                                  onChange={(e) => updateParameter(index, paramName, { isRequired: e.target.checked })}
                                  style={{ margin: 0, width: '12px', height: '12px' }}
                                />
                                Required
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agent Loop Explanation */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--node-indigo)' }}>How it works:</strong>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>Send prompt + tools to LLM</li>
          <li>Parse response for tool calls</li>
          <li>Execute tools, feed results back</li>
          <li>Repeat until final answer or max iterations</li>
        </ol>
      </div>
    </>
  )
}

/**
 * ChatAgentNodeProperties - Configure composite Chat Agent container
 *
 * Bundles: User Input → Guardrail → AI Agent ↔ Tool Router
 * with checkpoints at each stage for observability.
 */
function ChatAgentNodeProperties({ data, onChange }: PropertyEditorProps<ChatAgentNodeData>) {
  const [expandedSection, setExpandedSection] = useState<string | null>('agent')
  const [expandedToolIndex, setExpandedToolIndex] = useState<number | null>(null)

  // Monaco editor state
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false)
  const [showUserPromptEditor, setShowUserPromptEditor] = useState(false)

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
              <button
                onClick={() => setShowSystemPromptEditor(true)}
                style={{
                  marginTop: '8px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 25%, transparent)'
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)'
                }}
              >
                <Maximize2 size={12} />
                Open Full Editor
              </button>
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
            <button
              onClick={() => setShowUserPromptEditor(true)}
              style={{
                marginTop: '8px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 500,
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                borderRadius: '5px',
                cursor: 'pointer',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 25%, transparent)'
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)'
              }}
            >
              <Maximize2 size={12} />
              Open Full Editor
            </button>
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

      {/* Monaco Editor Modals */}
      {showSystemPromptEditor && (
        <MonacoEditorModal
          value={data.agentSystemPrompt || ''}
          onChange={(value) => onChange('agentSystemPrompt', value)}
          onClose={() => setShowSystemPromptEditor(false)}
          language="markdown"
          title="System Prompt Editor"
          icon={MessageSquare}
          helpText="Use {{ }} for template expressions"
        />
      )}

      {showUserPromptEditor && (
        <MonacoEditorModal
          value={data.agentUserPrompt || ''}
          onChange={(value) => onChange('agentUserPrompt', value)}
          onClose={() => setShowUserPromptEditor(false)}
          language="markdown"
          title="User Prompt Editor"
          icon={MessageSquare}
          helpText="Use {{ input }} to pass through the previous node's output"
        />
      )}
    </>
  )
}

/**
 * ErrorHandlerNodeProperties - Configure error handling strategy
 */
function ErrorHandlerNodeProperties({ data, onChange }: PropertyEditorProps<ErrorHandlerNodeData>) {
  const strategyOptions = [
    { value: 'retry', label: 'Retry', description: 'Retry the operation with exponential backoff' },
    { value: 'fallback', label: 'Fallback', description: 'Return a fallback value or execute fallback node' },
    { value: 'notify', label: 'Notify', description: 'Send notification and continue' },
    { value: 'ignore', label: 'Ignore', description: 'Swallow the error and continue with null' },
    { value: 'rethrow', label: 'Rethrow', description: 'Re-throw the error to stop execution' },
  ]

  return (
    <>
      {/* Strategy Selection */}
      <div>
        <label style={labelStyle}>Strategy</label>
        <select
          value={data.strategy || 'retry'}
          onChange={(e) => onChange('strategy', e.target.value)}
          style={selectStyle}
        >
          {strategyOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{
          marginTop: '4px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}>
          {strategyOptions.find(o => o.value === data.strategy)?.description}
        </div>
      </div>

      {/* Retry Configuration */}
      {data.strategy === 'retry' && (
        <>
          <div>
            <label style={labelStyle}>Max Attempts</label>
            <input
              type="number"
              min={1}
              max={10}
              value={data.retry?.maxAttempts ?? 3}
              onChange={(e) => onChange('retry', {
                ...data.retry,
                maxAttempts: parseInt(e.target.value) || 3,
              })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Initial Backoff (ms)</label>
            <input
              type="number"
              min={100}
              step={100}
              value={data.retry?.backoffMs ?? 1000}
              onChange={(e) => onChange('retry', {
                ...data.retry,
                backoffMs: parseInt(e.target.value) || 1000,
              })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Backoff Multiplier</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={data.retry?.backoffMultiplier ?? 2}
              onChange={(e) => onChange('retry', {
                ...data.retry,
                backoffMultiplier: parseFloat(e.target.value) || 2,
              })}
              style={inputStyle}
            />
            <div style={{
              marginTop: '4px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}>
              Each retry waits {data.retry?.backoffMultiplier || 2}x longer than the previous
            </div>
          </div>
        </>
      )}

      {/* Fallback Configuration */}
      {data.strategy === 'fallback' && (
        <>
          <div>
            <label style={labelStyle}>Fallback Type</label>
            <select
              value={data.fallback?.type || 'value'}
              onChange={(e) => onChange('fallback', {
                ...data.fallback,
                type: e.target.value as 'value' | 'template' | 'node',
              })}
              style={selectStyle}
            >
              <option value="value">Static Value</option>
              <option value="template">Template Expression</option>
              <option value="node">Fallback Node</option>
            </select>
          </div>

          {data.fallback?.type === 'value' && (
            <div>
              <label style={labelStyle}>Fallback Value (JSON)</label>
              <textarea
                value={typeof data.fallback?.value === 'string'
                  ? data.fallback.value
                  : JSON.stringify(data.fallback?.value ?? null, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    onChange('fallback', { ...data.fallback, value: parsed })
                  } catch {
                    onChange('fallback', { ...data.fallback, value: e.target.value })
                  }
                }}
                style={{ ...inputStyle, minHeight: '80px', fontFamily: 'monospace', fontSize: '11px' }}
                placeholder='null'
              />
            </div>
          )}

          {data.fallback?.type === 'template' && (
            <div>
              <label style={labelStyle}>Template Expression</label>
              <input
                type="text"
                value={data.fallback?.template || ''}
                onChange={(e) => onChange('fallback', {
                  ...data.fallback,
                  template: e.target.value,
                })}
                style={inputStyle}
                placeholder='{{ error.message }}'
              />
            </div>
          )}
        </>
      )}

      {/* Notification Configuration */}
      {(data.strategy === 'notify' || data.notify?.webhookUrl) && (
        <>
          <div>
            <label style={labelStyle}>Webhook URL</label>
            <input
              type="url"
              value={data.notify?.webhookUrl || ''}
              onChange={(e) => onChange('notify', {
                ...data.notify,
                webhookUrl: e.target.value,
              })}
              style={inputStyle}
              placeholder='https://hooks.slack.com/...'
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={data.notify?.includeStack ?? false}
                onChange={(e) => onChange('notify', {
                  ...data.notify,
                  includeStack: e.target.checked,
                })}
              />
              Include stack trace
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={data.notify?.includeContext ?? false}
                onChange={(e) => onChange('notify', {
                  ...data.notify,
                  includeContext: e.target.checked,
                })}
              />
              Include context
            </label>
          </div>
        </>
      )}

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          style={{ ...inputStyle, minHeight: '60px' }}
          placeholder='Describe when this error handler should be used...'
        />
      </div>

      {/* Info box */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'color-mix(in srgb, var(--node-rose) 10%, transparent)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--node-rose)' }}>Config Node:</strong>
        <div style={{ marginTop: '4px' }}>
          This node doesn't participate in data flow. Other nodes reference it via the Error Handler dropdown.
        </div>
      </div>
    </>
  )
}

// ============================================================================
// Phase E: Advanced Node Property Editors
// ============================================================================

/**
 * CommandNodeProperties - Properties for shell command execution
 */
function CommandNodeProperties({ data, onChange }: PropertyEditorProps<CommandNodeData>) {
  const outputFormatOptions = [
    { value: 'text', label: 'Plain Text', description: 'Raw command output as string' },
    { value: 'json', label: 'JSON', description: 'Parse output as JSON object' },
    { value: 'lines', label: 'Lines', description: 'Split output into array of lines' },
  ]

  return (
    <>
      {/* Command */}
      <div>
        <label style={labelStyle}>Command</label>
        <textarea
          value={data.command || ''}
          onChange={(e) => onChange('command', e.target.value)}
          style={{ ...inputStyle, minHeight: '60px', fontFamily: 'monospace', fontSize: '12px' }}
          placeholder='npm run build'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Supports {'{{ }}'} expressions for dynamic values
        </div>
      </div>

      {/* Working Directory */}
      <div>
        <label style={labelStyle}>Working Directory</label>
        <input
          type="text"
          value={data.cwd || ''}
          onChange={(e) => onChange('cwd', e.target.value)}
          style={inputStyle}
          placeholder='./src (relative to workspace)'
        />
      </div>

      {/* Output Format */}
      <div>
        <label style={labelStyle}>Output Format</label>
        <select
          value={data.outputFormat || 'text'}
          onChange={(e) => onChange('outputFormat', e.target.value)}
          style={selectStyle}
        >
          {outputFormatOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {outputFormatOptions.find(o => o.value === data.outputFormat)?.description || outputFormatOptions[0].description}
        </div>
      </div>

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
          placeholder='30000'
        />
      </div>

      {/* Requires Approval */}
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
            checked={data.requiresApproval ?? false}
            onChange={(e) => onChange('requiresApproval', e.target.checked)}
          />
          Require approval before execution
        </label>
      </div>

      {data.requiresApproval && (
        <div>
          <label style={labelStyle}>Approval Message</label>
          <input
            type="text"
            value={data.approvalMessage || ''}
            onChange={(e) => onChange('approvalMessage', e.target.value)}
            style={inputStyle}
            placeholder='This command will modify files...'
          />
        </div>
      )}
    </>
  )
}

/**
 * CodeNodeProperties - Properties for code snippet execution
 */
function CodeNodeProperties({ data, onChange }: PropertyEditorProps<CodeNodeData>) {
  const theme = useUIStore(state => state.theme)
  const [showCodeEditor, setShowCodeEditor] = useState(false)

  // Check if code contains {{ }} variables (for template-style code)
  const codeHasVariables = hasVariables(data.code || '')

  const languageOptions = [
    { value: 'typescript', label: 'TypeScript', description: 'Executes via Node.js vm or temp file' },
    { value: 'javascript', label: 'JavaScript', description: 'Executes via Node.js vm or temp file' },
    { value: 'python', label: 'Python', description: 'Executes via python -c or temp file' },
    { value: 'csharp', label: 'C#', description: 'Executes via dotnet-script' },
  ]

  const executionContextOptions = [
    { value: 'isolated', label: 'Isolated (VM)', description: 'Runs in sandboxed context for security' },
    { value: 'main', label: 'Main Process', description: 'Runs with full access (use with caution)' },
  ]

  // Get placeholder code based on language
  const getCodePlaceholder = (): string => {
    switch (data.language || 'typescript') {
      case 'typescript':
      case 'javascript':
        return `// Transform the input data
const result = input.map(item => ({
  ...item,
  processed: true
}));
return result;`
      case 'python':
        return `# Transform the input data
result = [
    {**item, 'processed': True}
    for item in input
]
return result`
      case 'csharp':
        return `// Transform the input data
var result = input.Select(item => new {
    item,
    processed = true
});
return result;`
      default:
        return '// Enter your code here'
    }
  }

  // Get Monaco language for editor
  const getMonacoLanguage = (): string => {
    switch (data.language || 'typescript') {
      case 'typescript':
        return 'typescript'
      case 'javascript':
        return 'javascript'
      case 'python':
        return 'python'
      case 'csharp':
        return 'csharp'
      default:
        return 'typescript'
    }
  }

  return (
    <>
      {/* Language */}
      <div>
        <label style={labelStyle}>Language</label>
        <select
          value={data.language || 'typescript'}
          onChange={(e) => onChange('language', e.target.value)}
          style={selectStyle}
        >
          {languageOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {languageOptions.find(o => o.value === (data.language || 'typescript'))?.description}
        </div>
      </div>

      {/* Input Variable Name */}
      <div>
        <label style={labelStyle}>Input Variable Name</label>
        <input
          type="text"
          value={data.inputVariable || 'input'}
          onChange={(e) => onChange('inputVariable', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          placeholder='input'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Name of the variable that receives the previous node's output
        </div>
      </div>

      {/* Execution Context (TS/JS only) */}
      {(data.language === 'typescript' || data.language === 'javascript' || !data.language) && (
        <div>
          <label style={labelStyle}>Execution Context</label>
          <select
            value={data.executionContext || 'isolated'}
            onChange={(e) => onChange('executionContext', e.target.value)}
            style={selectStyle}
          >
            {executionContextOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {executionContextOptions.find(o => o.value === (data.executionContext || 'isolated'))?.description}
          </div>
        </div>
      )}

      {/* Code Editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Code</label>
          <button
            onClick={() => setShowCodeEditor(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              borderRadius: '5px',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: '11px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            title="Open full-screen editor (Ctrl+E)"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 25%, transparent)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)'
            }}
          >
            <Maximize2 style={{ width: 12, height: 12 }} />
            Open Full Editor
          </button>
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
            value={data.code || ''}
            onChange={(val) => onChange('code', val || '')}
            language={getMonacoLanguage()}
            theme={getMonacoTheme(theme === 'dark')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              fontSize: 12,
              padding: { top: 8 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Variable Preview - shows pills for {{ }} syntax in code */}
        {codeHasVariables && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: 'var(--panel-2)',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', marginBottom: '4px' }}>
              <Braces style={{ width: 10, height: 10 }} />
              Variables used:
            </div>
            <VariablePreview text={data.code || ''} size="sm" />
          </div>
        )}

        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {getCodePlaceholder().split('\n')[0]}
        </div>
      </div>

      {/* Full-screen Code Editor Modal */}
      {showCodeEditor && (
        <MonacoEditorModal
          value={data.code || ''}
          onChange={(val) => onChange('code', val)}
          onClose={() => setShowCodeEditor(false)}
          language={getMonacoLanguage()}
          title={`Code Editor - ${languageOptions.find(o => o.value === (data.language || 'typescript'))?.label || 'TypeScript'}`}
          icon={Code}
          helpText={`Input variable: ${data.inputVariable || 'input'} | Return your result to pass to next node`}
        />
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
          placeholder='30000'
        />
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          style={inputStyle}
          placeholder='What this code does...'
        />
      </div>
    </>
  )
}

/**
 * TransformerNodeProperties - Properties for data transformation node
 */
function TransformerNodeProperties({ data, onChange }: PropertyEditorProps<TransformerNodeData>) {
  const theme = useUIStore(state => state.theme)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)

  const modeOptions = [
    { value: 'template', label: 'Template', description: 'JSON with {{ variable }} interpolation' },
    { value: 'expression', label: 'Expression', description: 'JavaScript expression (sandboxed)' },
    { value: 'jq', label: 'JQ Query', description: 'JQ-style query (coming soon)', disabled: true },
  ]

  const mode = data.mode || 'template'

  // Get the content for current mode
  const getContent = (): string => {
    switch (mode) {
      case 'template':
        return data.template || data.transform || ''
      case 'expression':
        return data.expression || ''
      case 'jq':
        return data.jqExpression || ''
      default:
        return ''
    }
  }

  const setContent = (value: string) => {
    switch (mode) {
      case 'template':
        onChange('template', value)
        break
      case 'expression':
        onChange('expression', value)
        break
      case 'jq':
        onChange('jqExpression', value)
        break
    }
  }

  const content = getContent()
  const hasVars = mode === 'template' && hasVariables(content)

  // Get Monaco language for mode
  const getMonacoLanguage = (): string => {
    switch (mode) {
      case 'template':
        return 'json'
      case 'expression':
        return 'javascript'
      case 'jq':
        return 'plaintext'
      default:
        return 'json'
    }
  }

  // Placeholder based on mode
  const getPlaceholder = (): string => {
    switch (mode) {
      case 'template':
        return `{
  "name": "{{ previous_output.name }}",
  "items": "{{ previous_output.data.items }}",
  "timestamp": "{{ workflow.timestamp }}"
}`
      case 'expression':
        return `// input contains the previous node's output
input.data.map(item => ({
  ...item,
  processed: true
}))`
      case 'jq':
        return '.data | map({name: .name, value: .value})'
      default:
        return ''
    }
  }

  return (
    <>
      {/* Transform Mode */}
      <div>
        <label style={labelStyle}>Transform Mode</label>
        <select
          value={mode}
          onChange={(e) => onChange('mode', e.target.value)}
          style={selectStyle}
        >
          {modeOptions.map(opt => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}{opt.disabled ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {modeOptions.find(o => o.value === mode)?.description}
        </div>
      </div>

      {/* Input Variable Name */}
      <div>
        <label style={labelStyle}>Input Variable Name</label>
        <input
          type="text"
          value={data.inputVariable || 'input'}
          onChange={(e) => onChange('inputVariable', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          placeholder='input'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Name of the variable that receives the previous node's output
        </div>
      </div>

      {/* Template/Expression Editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>
            {mode === 'template' ? 'Template' : mode === 'expression' ? 'Expression' : 'Query'}
          </label>
          <button
            onClick={() => setShowTemplateEditor(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              borderRadius: '5px',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: '11px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            title="Open full-screen editor"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 25%, transparent)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)'
            }}
          >
            <Maximize2 style={{ width: 12, height: 12 }} />
            Open Full Editor
          </button>
        </div>
        <div
          style={{
            border: '1px solid var(--input-border)',
            borderRadius: '6px',
            overflow: 'hidden',
            height: '180px',
          }}
        >
          <Editor
            value={content}
            onChange={(val) => setContent(val || '')}
            language={getMonacoLanguage()}
            theme={getMonacoTheme(theme === 'dark')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              fontSize: 12,
              padding: { top: 8 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Variable Preview for template mode */}
        {hasVars && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: 'var(--panel-2)',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', marginBottom: '4px' }}>
              <Braces style={{ width: 10, height: 10 }} />
              Variables used:
            </div>
            <VariablePreview text={content} size="sm" />
          </div>
        )}

        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--muted)' }}>
          {getPlaceholder().split('\n')[0]}
        </div>
      </div>

      {/* Passthrough on Error */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          id="passthroughOnError"
          checked={data.passthroughOnError || false}
          onChange={(e) => onChange('passthroughOnError', e.target.checked)}
          style={{ width: '16px', height: '16px' }}
        />
        <label htmlFor="passthroughOnError" style={{ fontSize: '12px', color: 'var(--text)' }}>
          Pass through unchanged if transform fails
        </label>
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          style={inputStyle}
          placeholder='What this transform does...'
        />
      </div>

      {/* Full-screen Template Editor Modal */}
      {showTemplateEditor && (
        <MonacoEditorModal
          value={content}
          onChange={(val) => setContent(val)}
          onClose={() => setShowTemplateEditor(false)}
          language={getMonacoLanguage()}
          title={`Transform Editor - ${modeOptions.find(o => o.value === mode)?.label || 'Template'}`}
          icon={Wand2}
          helpText={mode === 'template'
            ? 'Use {{ variable }} for data interpolation. Access previous_output, workflow params, and node outputs.'
            : 'Return the transformed value. Input is available as "input" variable.'
          }
        />
      )}
    </>
  )
}

/**
 * ClaudeCodeNodeProperties - Properties for Claude Code agent execution
 */
function ClaudeCodeNodeProperties({ data, onChange }: PropertyEditorProps<ClaudeCodeNodeData>) {
  const connections = useWorkflowStore(state => state.connections)
  const sshConnections = connections.filter(c => c.type === 'ssh')

  const connectionType = data.connection?.type || 'local'

  const handleConnectionTypeChange = (type: 'local' | 'ssh') => {
    onChange('connection', {
      ...data.connection,
      type,
    })
  }

  const handleTaskChange = (field: string, value: unknown) => {
    onChange('task', {
      ...data.task,
      [field]: value,
    })
  }

  const handleConstraintsChange = (field: string, value: unknown) => {
    onChange('constraints', {
      ...data.constraints,
      [field]: value,
    })
  }

  const handleOutputChange = (field: string, value: unknown) => {
    onChange('output', {
      ...data.output,
      [field]: value,
    })
  }

  return (
    <>
      {/* Connection Type */}
      <div>
        <label style={labelStyle}>Connection Type</label>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
        }}>
          <button
            onClick={() => handleConnectionTypeChange('local')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: connectionType === 'local' ? 'var(--accent)' : 'transparent',
              color: connectionType === 'local' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Local
          </button>
          <button
            onClick={() => handleConnectionTypeChange('ssh')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: connectionType === 'ssh' ? 'var(--accent)' : 'transparent',
              color: connectionType === 'ssh' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            SSH
          </button>
        </div>
      </div>

      {/* SSH Connection Selector */}
      {connectionType === 'ssh' && (
        <div>
          <label style={labelStyle}>SSH Connection</label>
          <select
            value={data.connection?.ssh?.connectionId || ''}
            onChange={(e) => onChange('connection', {
              ...data.connection,
              ssh: { ...data.connection?.ssh, connectionId: e.target.value || undefined },
            })}
            style={selectStyle}
          >
            <option value="">Select connection...</option>
            {sshConnections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name}
              </option>
            ))}
          </select>
          {sshConnections.length === 0 && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--warning)' }}>
              No SSH connections configured. Add one in Connections panel.
            </div>
          )}
        </div>
      )}

      {/* Task Prompt */}
      <div>
        <label style={labelStyle}>Task Prompt</label>
        <textarea
          value={data.task?.prompt || ''}
          onChange={(e) => handleTaskChange('prompt', e.target.value)}
          style={{ ...inputStyle, minHeight: '100px' }}
          placeholder='Describe what Claude Code should do...'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Supports {'{{ }}'} expressions for dynamic values
        </div>
      </div>

      {/* Working Directory */}
      <div>
        <label style={labelStyle}>Working Directory</label>
        <input
          type="text"
          value={data.task?.workingDirectory || ''}
          onChange={(e) => handleTaskChange('workingDirectory', e.target.value)}
          style={inputStyle}
          placeholder='/path/to/project'
        />
      </div>

      {/* Max Turns */}
      <div>
        <label style={labelStyle}>Max Turns</label>
        <input
          type="number"
          min={1}
          max={200}
          value={data.constraints?.maxTurns ?? 50}
          onChange={(e) => handleConstraintsChange('maxTurns', parseInt(e.target.value) || 50)}
          style={inputStyle}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Maximum agent iterations before forcing completion
        </div>
      </div>

      {/* Output Format */}
      <div>
        <label style={labelStyle}>Output Format</label>
        <select
          value={data.output?.format || 'final-response'}
          onChange={(e) => handleOutputChange('format', e.target.value)}
          style={selectStyle}
        >
          <option value="final-response">Final Response</option>
          <option value="full-conversation">Full Conversation</option>
          <option value="files-changed">Files Changed</option>
          <option value="structured">Structured (JSON Schema)</option>
        </select>
      </div>

      {/* Require Approval for Writes */}
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
            checked={data.constraints?.requireApprovalForWrites ?? false}
            onChange={(e) => handleConstraintsChange('requireApprovalForWrites', e.target.checked)}
          />
          Require approval for file writes
        </label>
      </div>
    </>
  )
}

/**
 * WorkflowNodeProperties - Properties for sub-workflow invocation
 */
function WorkflowNodeProperties({ data, onChange }: PropertyEditorProps<WorkflowNodeData>) {
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

/**
 * McpToolNodeProperties - Properties for external MCP server tools
 */
function McpToolNodeProperties({ data, onChange }: PropertyEditorProps<McpToolNodeData>) {
  const connections = useWorkflowStore(state => state.connections)
  const mcpConnections = connections.filter(c => c.type === 'mcp-server')

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

      {/* Tool Name */}
      <div>
        <label style={labelStyle}>Tool Name</label>
        <input
          type="text"
          value={data.toolName || ''}
          onChange={(e) => onChange('toolName', e.target.value)}
          style={inputStyle}
          placeholder='search_web'
        />
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
          value={typeof data.timeoutMs === 'number' ? data.timeoutMs : 30000}
          onChange={(e) => onChange('timeoutMs', parseInt(e.target.value) || 30000)}
          style={inputStyle}
        />
      </div>
    </>
  )
}

/**
 * MemoryNodeProperties - Properties for memory storage node
 */
function MemoryNodeProperties({ data, onChange }: PropertyEditorProps<MemoryNodeData>) {
  const modeOptions = [
    { value: 'kv', label: 'Key-Value', description: 'Dictionary storage for passing state between nodes' },
    { value: 'conversation', label: 'Conversation', description: 'Message history with sliding window for chat context' },
    { value: 'cache', label: 'Cache', description: 'TTL-based storage for caching expensive operations' },
  ]

  const operationOptions: Record<string, { value: string; label: string; description: string }[]> = {
    kv: [
      { value: 'get', label: 'Get', description: 'Retrieve a value by key' },
      { value: 'set', label: 'Set', description: 'Store a value with a key' },
      { value: 'delete', label: 'Delete', description: 'Remove a key-value pair' },
      { value: 'list', label: 'List Keys', description: 'Get all stored keys' },
      { value: 'clear', label: 'Clear', description: 'Remove all stored data' },
    ],
    conversation: [
      { value: 'get', label: 'Get', description: 'Retrieve conversation history' },
      { value: 'append', label: 'Append', description: 'Add a message to conversation' },
      { value: 'clear', label: 'Clear', description: 'Clear conversation history' },
    ],
    cache: [
      { value: 'get', label: 'Get', description: 'Retrieve cached value' },
      { value: 'set', label: 'Set', description: 'Cache a value with TTL' },
      { value: 'delete', label: 'Delete', description: 'Invalidate cached entry' },
      { value: 'clear', label: 'Clear', description: 'Clear entire cache' },
    ],
  }

  const scopeOptions = [
    { value: 'execution', label: 'Execution', description: 'Cleared when workflow execution completes' },
    { value: 'workflow', label: 'Workflow', description: 'Persists across executions of this workflow' },
    { value: 'global', label: 'Global', description: 'Shared across all workflows (use with caution)' },
  ]

  const outputModeOptions = [
    { value: 'value', label: 'Value', description: 'Output the retrieved/stored value' },
    { value: 'success', label: 'Success', description: 'Output boolean success indicator' },
    { value: 'metadata', label: 'Metadata', description: 'Output object with value, timestamp, ttl info' },
    { value: 'passthrough', label: 'Passthrough', description: 'Pass input through unchanged' },
  ]

  const roleOptions = [
    { value: 'user', label: 'User' },
    { value: 'assistant', label: 'Assistant' },
    { value: 'system', label: 'System' },
  ]

  const mode = data.mode || 'kv'
  // Support both old 'operation' (single) and new 'operations' (array)
  const operations: string[] = data.operations || ((data as { operation?: string }).operation ? [(data as { operation?: string }).operation!] : ['get'])
  const ops = operationOptions[mode] || operationOptions.kv

  // Toggle an operation on/off
  const toggleOperation = (opValue: string) => {
    const current = operations || []
    const isActive = current.includes(opValue)
    let updated: string[]

    if (isActive) {
      // Remove operation (but keep at least one)
      updated = current.filter(o => o !== opValue)
      if (updated.length === 0) {
        updated = [opValue] // Keep at least one operation
        return
      }
    } else {
      // Add operation
      updated = [...current, opValue]
    }

    onChange('operations', updated)
  }

  return (
    <>
      {/* Mode Selection */}
      <div>
        <label style={labelStyle}>Memory Mode</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {modeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                onChange('mode', opt.value)
                // Reset operations when mode changes to first operation of new mode
                const firstOp = operationOptions[opt.value]?.[0]?.value || 'get'
                onChange('operations', [firstOp])
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: mode === opt.value ? 'var(--accent)' : 'var(--input-bg)',
                color: mode === opt.value ? 'white' : 'var(--text)',
                border: '1px solid var(--input-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {modeOptions.find(o => o.value === mode)?.description}
        </div>
      </div>

      {/* Operations Selection - Multi-select toggles */}
      <div>
        <label style={labelStyle}>Operations</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {ops.map(opt => {
            const isActive = operations.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleOperation(opt.value)}
                title={opt.description}
                style={{
                  padding: '6px 12px',
                  background: isActive ? 'var(--accent)' : 'var(--input-bg)',
                  color: isActive ? 'white' : 'var(--text)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--input-border)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {operations.length === 1
            ? ops.find(o => o.value === operations[0])?.description || 'Select operations this node can perform'
            : `${operations.length} operations enabled - input data determines which to execute`}
        </div>
      </div>

      {/* Key-Value Mode Fields */}
      {mode === 'kv' && (operations.includes('get') || operations.includes('set') || operations.includes('delete')) && (
        <div>
          <label style={labelStyle}>
            <Key style={{ width: 12, height: 12, display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Key
          </label>
          <input
            type="text"
            value={data.key || ''}
            onChange={(e) => onChange('key', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="my_key or {{ node_id.field }}"
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Supports {'{{ }}'} template expressions
          </div>
        </div>
      )}

      {mode === 'kv' && operations.includes('set') && (
        <div>
          <label style={labelStyle}>Value</label>
          <input
            type="text"
            value={data.value || ''}
            onChange={(e) => onChange('value', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Leave empty to use input data"
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            If empty, stores the input data from the previous node
          </div>
        </div>
      )}

      {mode === 'kv' && operations.includes('get') && (
        <div>
          <label style={labelStyle}>Default Value</label>
          <input
            type="text"
            value={data.defaultValue || ''}
            onChange={(e) => onChange('defaultValue', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Value if key not found"
          />
        </div>
      )}

      {/* Conversation Mode Fields */}
      {mode === 'conversation' && (
        <>
          <div>
            <label style={labelStyle}>Conversation ID</label>
            <input
              type="text"
              value={data.conversationId || ''}
              onChange={(e) => onChange('conversationId', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="default or {{ user_id }}"
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Identifier for separate conversation threads
            </div>
          </div>

          {operations.includes('append') && (
            <div>
              <label style={labelStyle}>Message Role</label>
              <select
                value={data.messageRole || 'user'}
                onChange={(e) => onChange('messageRole', e.target.value)}
                style={selectStyle}
              >
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Max Messages (Sliding Window)</label>
            <input
              type="number"
              value={data.maxMessages ?? ''}
              onChange={(e) => onChange('maxMessages', e.target.value ? parseInt(e.target.value) : undefined)}
              style={inputStyle}
              placeholder="0 = unlimited"
              min={0}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Older messages removed when limit exceeded. 0 or empty = unlimited.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="includeSystemInWindow"
              checked={data.includeSystemInWindow ?? true}
              onChange={(e) => onChange('includeSystemInWindow', e.target.checked)}
            />
            <label htmlFor="includeSystemInWindow" style={{ fontSize: '12px' }}>
              Include system messages in window count
            </label>
          </div>
        </>
      )}

      {/* Cache Mode Fields */}
      {mode === 'cache' && (operations.includes('get') || operations.includes('set') || operations.includes('delete')) && (
        <div>
          <label style={labelStyle}>
            <Key style={{ width: 12, height: 12, display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Cache Key
          </label>
          <input
            type="text"
            value={data.key || ''}
            onChange={(e) => onChange('key', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="cache_key or {{ node_id.field }}"
          />
        </div>
      )}

      {mode === 'cache' && operations.includes('set') && (
        <>
          <div>
            <label style={labelStyle}>Value</label>
            <input
              type="text"
              value={data.value || ''}
              onChange={(e) => onChange('value', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="Leave empty to cache input data"
            />
          </div>

          <div>
            <label style={labelStyle}>TTL (seconds)</label>
            <input
              type="number"
              value={data.ttlSeconds ?? ''}
              onChange={(e) => onChange('ttlSeconds', e.target.value ? parseInt(e.target.value) : undefined)}
              style={inputStyle}
              placeholder="0 = no expiration"
              min={0}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Time-to-live in seconds. 0 or empty = never expires.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="refreshOnRead"
              checked={data.refreshOnRead ?? false}
              onChange={(e) => onChange('refreshOnRead', e.target.checked)}
            />
            <label htmlFor="refreshOnRead" style={{ fontSize: '12px' }}>
              Refresh TTL on read (sliding expiration)
            </label>
          </div>
        </>
      )}

      {mode === 'cache' && operations.includes('get') && (
        <div>
          <label style={labelStyle}>Default Value</label>
          <input
            type="text"
            value={data.defaultValue || ''}
            onChange={(e) => onChange('defaultValue', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Value if cache miss or expired"
          />
        </div>
      )}

      {/* Scope & Namespace (all modes) */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <label style={{ ...labelStyle, fontSize: '13px', marginBottom: '12px' }}>Storage Scope</label>

        <div>
          <label style={labelStyle}>Scope</label>
          <select
            value={data.scope || 'execution'}
            onChange={(e) => onChange('scope', e.target.value)}
            style={selectStyle}
          >
            {scopeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {scopeOptions.find(o => o.value === (data.scope || 'execution'))?.description}
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={labelStyle}>Namespace</label>
          <input
            type="text"
            value={data.namespace || ''}
            onChange={(e) => onChange('namespace', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Optional namespace for isolation"
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Prevents key collisions, especially in global scope
          </div>
        </div>
      </div>

      {/* Output Mode */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <label style={labelStyle}>Output Mode</label>
        <select
          value={data.outputMode || 'value'}
          onChange={(e) => onChange('outputMode', e.target.value)}
          style={selectStyle}
        >
          {outputModeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {outputModeOptions.find(o => o.value === (data.outputMode || 'value'))?.description}
        </div>
      </div>
    </>
  )
}

/**
 * TriggerNodeProperties - Properties for workflow trigger/entry point
 */
function TriggerNodeProperties({ data, onChange }: PropertyEditorProps<TriggerNodeData>) {
  const [showSecret, setShowSecret] = useState(false)
  const [newWatchPath, setNewWatchPath] = useState('')
  const [showCronEditor, setShowCronEditor] = useState(false)

  const triggerType = data.triggerType || 'manual'

  // Cron presets
  const cronPresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 min', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Daily 9am', value: '0 9 * * *' },
    { label: 'Weekly Mon', value: '0 9 * * 1' },
  ]

  // Interval presets
  const intervalPresets = [
    { label: '1 min', value: 60000 },
    { label: '5 min', value: 300000 },
    { label: '15 min', value: 900000 },
    { label: '1 hour', value: 3600000 },
    { label: '24 hours', value: 86400000 },
  ]

  const generateSecret = () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    onChange('webhookSecret', Array.from(array, (b) => b.toString(16).padStart(2, '0')).join(''))
  }

  const addWatchPath = () => {
    if (newWatchPath && !(data.fileWatchPaths || []).includes(newWatchPath)) {
      onChange('fileWatchPaths', [...(data.fileWatchPaths || []), newWatchPath])
      setNewWatchPath('')
    }
  }

  const removeWatchPath = (path: string) => {
    onChange('fileWatchPaths', (data.fileWatchPaths || []).filter((p) => p !== path))
  }

  const toggleMethod = (method: 'GET' | 'POST' | 'PUT') => {
    const methods = data.webhookMethods || ['POST']
    if (methods.includes(method)) {
      onChange('webhookMethods', methods.filter((m) => m !== method))
    } else {
      onChange('webhookMethods', [...methods, method])
    }
  }

  const toggleFileEvent = (event: 'create' | 'modify' | 'delete') => {
    const events = data.fileWatchEvents || ['create', 'modify', 'delete']
    if (events.includes(event)) {
      onChange('fileWatchEvents', events.filter((e) => e !== event))
    } else {
      onChange('fileWatchEvents', [...events, event])
    }
  }

  return (
    <>
      {/* Trigger Type Selection */}
      <div>
        <label style={labelStyle}>Trigger Type</label>
        <select
          value={triggerType}
          onChange={(e) => onChange('triggerType', e.target.value)}
          style={selectStyle}
        >
          <option value="manual">Manual (Run button)</option>
          <option value="schedule">Schedule (Cron/Interval)</option>
          <option value="webhook">Webhook (HTTP endpoint)</option>
          <option value="file-watch">File Watch (Electron only)</option>
          <option value="event">Event (Internal trigger)</option>
        </select>
      </div>

      {/* Manual Trigger - No additional configuration needed */}
      {triggerType === 'manual' && (
        <div style={{
          padding: '12px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Play style={{ width: 16, height: 16, color: 'var(--node-green)' }} />
            <strong style={{ color: 'var(--text)' }}>Manual Trigger</strong>
          </div>
          <p style={{ margin: 0 }}>
            This workflow starts when you click the Run button. No additional configuration needed.
          </p>
        </div>
      )}

      {/* Schedule Trigger Configuration */}
      {triggerType === 'schedule' && (
        <>
          <div>
            <label style={labelStyle}>Schedule Type</label>
            <select
              value={data.scheduleType || 'cron'}
              onChange={(e) => onChange('scheduleType', e.target.value)}
              style={selectStyle}
            >
              <option value="cron">Cron Expression</option>
              <option value="interval">Fixed Interval</option>
            </select>
          </div>

          {data.scheduleType === 'cron' || !data.scheduleType ? (
            <div>
              <label style={labelStyle}>Cron Expression</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                }}
              >
                <span style={{ flex: 1, color: 'var(--text)' }}>
                  {data.scheduleCron || '0 * * * *'}
                </span>
                <button
                  onClick={() => setShowCronEditor(true)}
                  style={{
                    padding: '4px 10px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Edit style={{ width: 12, height: 12 }} />
                  Change
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', marginRight: '4px', alignSelf: 'center' }}>
                  Quick:
                </span>
                {cronPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => onChange('scheduleCron', preset.value)}
                    style={{
                      padding: '4px 8px',
                      background: data.scheduleCron === preset.value ? 'var(--accent)' : 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '10px',
                      color: data.scheduleCron === preset.value ? 'white' : 'var(--text)',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Cron Editor Dialog */}
              {showCronEditor && (
                <CronEditorDialog
                  value={data.scheduleCron || '0 * * * *'}
                  onSave={(value) => onChange('scheduleCron', value)}
                  onClose={() => setShowCronEditor(false)}
                />
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Interval</label>
              <select
                value={data.scheduleIntervalMs || 3600000}
                onChange={(e) => onChange('scheduleIntervalMs', parseInt(e.target.value, 10))}
                style={selectStyle}
              >
                {intervalPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Timezone</label>
            <input
              type="text"
              value={data.scheduleTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={(e) => onChange('scheduleTimezone', e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="scheduleEnabled"
              checked={data.scheduleEnabled !== false}
              onChange={(e) => onChange('scheduleEnabled', e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="scheduleEnabled" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Enable schedule
            </label>
          </div>
        </>
      )}

      {/* Webhook Trigger Configuration */}
      {triggerType === 'webhook' && (
        <>
          <div>
            <label style={labelStyle}>Webhook Path</label>
            <input
              type="text"
              value={data.webhookPath || '/my-workflow'}
              onChange={(e) => onChange('webhookPath', e.target.value)}
              placeholder="/my-workflow"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Full URL: POST http://localhost:9876{data.webhookPath || '/my-workflow'}
            </p>
          </div>

          <div>
            <label style={labelStyle}>HTTP Methods</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['GET', 'POST', 'PUT'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => toggleMethod(method)}
                  style={{
                    padding: '6px 12px',
                    background: (data.webhookMethods || ['POST']).includes(method) ? 'var(--accent)' : 'var(--input-bg)',
                    border: `1px solid ${(data.webhookMethods || ['POST']).includes(method) ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: (data.webhookMethods || ['POST']).includes(method) ? 'white' : 'var(--text)',
                  }}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>HMAC Secret (Optional)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={data.webhookSecret || ''}
                  onChange={(e) => onChange('webhookSecret', e.target.value)}
                  placeholder="Leave empty to disable validation"
                  style={{ ...inputStyle, paddingRight: '36px', fontFamily: 'monospace', fontSize: '11px' }}
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px',
                  }}
                >
                  {showSecret ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                </button>
              </div>
              <button
                onClick={generateSecret}
                style={{
                  padding: '8px 12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: 'var(--text)',
                }}
              >
                Generate
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="webhookRequireAuth"
              checked={data.webhookRequireAuth || false}
              onChange={(e) => onChange('webhookRequireAuth', e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="webhookRequireAuth" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Require authentication
            </label>
          </div>
        </>
      )}

      {/* File Watch Trigger Configuration */}
      {triggerType === 'file-watch' && (
        <>
          <div>
            <label style={labelStyle}>Watch Paths (glob patterns supported)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={newWatchPath}
                onChange={(e) => setNewWatchPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addWatchPath()}
                placeholder="/path/to/watch or **/*.json"
                style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
              />
              <button
                onClick={addWatchPath}
                style={{
                  padding: '8px 12px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'white',
                }}
              >
                <Plus style={{ width: 16, height: 16 }} />
              </button>
            </div>
            {(data.fileWatchPaths || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                {(data.fileWatchPaths || []).map((path, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: 'var(--input-bg)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</span>
                    <button
                      onClick={() => removeWatchPath(path)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: '2px' }}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '11px', margin: '8px 0' }}>No paths added</p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Events to Watch</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['create', 'modify', 'delete'] as const).map((event) => (
                <button
                  key={event}
                  onClick={() => toggleFileEvent(event)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: (data.fileWatchEvents || ['create', 'modify', 'delete']).includes(event) ? 'var(--accent)' : 'var(--input-bg)',
                    border: `1px solid ${(data.fileWatchEvents || ['create', 'modify', 'delete']).includes(event) ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: (data.fileWatchEvents || ['create', 'modify', 'delete']).includes(event) ? 'white' : 'var(--text)',
                    textTransform: 'capitalize',
                  }}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Debounce (ms)</label>
            <input
              type="number"
              value={data.fileWatchDebounceMs || 500}
              onChange={(e) => onChange('fileWatchDebounceMs', parseInt(e.target.value, 10) || 500)}
              min={100}
              max={10000}
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Wait time before triggering after file changes
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="fileWatchRecursive"
              checked={data.fileWatchRecursive !== false}
              onChange={(e) => onChange('fileWatchRecursive', e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="fileWatchRecursive" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Watch subdirectories recursively
            </label>
          </div>

          <div style={{
            padding: '10px',
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            fontSize: '11px',
            color: 'var(--warning)',
          }}>
            File watch triggers require Electron desktop app
          </div>
        </>
      )}

      {/* Event Trigger Configuration */}
      {triggerType === 'event' && (
        <>
          <div>
            <label style={labelStyle}>Event Name</label>
            <input
              type="text"
              value={data.eventName || ''}
              onChange={(e) => onChange('eventName', e.target.value)}
              placeholder="my-custom-event"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The event name to listen for from other workflows or external sources
            </p>
          </div>

          <div>
            <label style={labelStyle}>Event Filter (Optional)</label>
            <input
              type="text"
              value={data.eventFilter || ''}
              onChange={(e) => onChange('eventFilter', e.target.value)}
              placeholder="{{ event.type == 'important' }}"
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Only trigger when this expression evaluates to true
            </p>
          </div>

          <div style={{
            padding: '12px',
            background: 'var(--panel-2)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--text)' }}>Event triggers</strong> are activated by:
            <ul style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
              <li>Other workflows emitting events</li>
              <li>API calls to the event endpoint</li>
              <li>Internal application events</li>
            </ul>
          </div>
        </>
      )}

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="When/how this workflow runs"
          style={inputStyle}
        />
      </div>
    </>
  )
}

/**
 * GuardrailNodeProperties - Configure standalone guardrail validation
 */
function GuardrailNodeProperties({ data, onChange }: PropertyEditorProps<GuardrailNodeData>) {
  return (
    <>
      {/* System Prompt */}
      <div>
        <label style={labelStyle}>Validation System Prompt</label>
        <textarea
          value={data.systemPrompt || ''}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
          placeholder="Define validation criteria..."
          rows={6}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: '120px',
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
          marginBottom: '12px',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
        }}>
          <Cpu style={{ width: 12, height: 12 }} />
          LLM Provider
        </div>
        <LLMProviderConfig
          providerNodeId={data.providerNodeId}
          provider={data.provider}
          model={data.model}
          onProviderNodeChange={(nodeId) => onChange('providerNodeId', nodeId)}
          onProviderChange={(providerId) => onChange('provider', providerId)}
          onModelChange={(model) => onChange('model', model)}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
          Tip: Use a fast, cheap model for guardrails (e.g., gpt-4o-mini, claude-3-haiku).
        </p>
      </div>

      {/* Temperature */}
      <div>
        <label style={labelStyle}>Temperature</label>
        <input
          type="number"
          value={data.temperature ?? 0}
          onChange={(e) => onChange('temperature', parseFloat(e.target.value) || 0)}
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
          value={data.passExpression ? 'expression' : 'threshold'}
          onChange={(e) => {
            if (e.target.value === 'expression' && !data.passExpression) {
              onChange('passExpression', '{{ input.valid == true }}')
            } else if (e.target.value === 'threshold') {
              onChange('passExpression', '')
            }
          }}
          style={inputStyle}
        >
          <option value="expression">Pass Expression</option>
          <option value="threshold">Score Threshold</option>
        </select>

        {/* Conditional input based on selection */}
        <div style={{ marginTop: '8px' }}>
          {data.passExpression ? (
            <>
              <input
                type="text"
                value={data.passExpression}
                onChange={(e) => onChange('passExpression', e.target.value)}
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
                value={data.scoreThreshold ?? 0.8}
                onChange={(e) => onChange('scoreThreshold', parseFloat(e.target.value) || 0.8)}
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
  )
}
