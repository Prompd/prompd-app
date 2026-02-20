/**
 * WorkflowPropertiesPanel - Side panel for editing selected node properties
 *
 * Simplified routing component that delegates to co-located property editors.
 * Each node type has its own properties file in the nodes/ directory.
 */

import { useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  X,
  MessageSquare,
  GitBranch,
  Repeat,
  GitFork,
  Flag,
  Radio,
  Combine,
  UserCircle,
  Wrench,
  ScanSearch,
  Bot,
  AlertTriangle,
  Terminal,
  Workflow,
  Plug,
  FileCode,
  Wand2,
  MessagesSquare,
  Settings,
  Database,
  TableProperties,
  Play,
  Cpu,
  ShieldCheck,
  Route,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import { useEditorStore } from '../../../stores/editorStore'
import { PrompdViewerModal } from './PrompdViewerModal'
import { FileEditorModal } from './FileEditorModal'
import PackageDetailsModal from '../../editor/PackageDetailsModal'
import { registryApi, type RegistryPackage } from '../../services/registryApi'
import { ErrorHandlerSelector } from './shared/property-components/ErrorHandlerSelector'
import { ConnectionSelector } from './shared/property-components/ConnectionSelector'
import { labelStyle, inputStyle } from './shared/styles/propertyStyles'
import type {
  BaseNodeData,
  PromptNodeData,
  ProviderNodeData,
  ConditionNodeData,
  LoopNodeData,
  ParallelNodeData,
  MergeNodeData,
  OutputNodeData,
  CallbackNodeData,
  UserInputNodeData,
  ToolNodeData,
  ToolCallParserNodeData,
  ToolCallRouterNodeData,
  AgentNodeData,
  ErrorHandlerNodeData,
  CommandNodeData,
  ClaudeCodeNodeData,
  WorkflowNodeData,
  McpToolNodeData,
  CodeNodeData,
  TransformerNodeData,
  TriggerNodeData,
  ChatAgentNodeData,
  MemoryNodeData,
  GuardrailNodeData,
  WebSearchNodeData,
  DatabaseQueryNodeData,
} from '../../services/workflowTypes'

// Import all property editors from node files
import { PromptNodeProperties } from './nodes/PromptNode'
import { ProviderNodeProperties } from './nodes/ProviderNode'
import { ConditionNodeProperties } from './nodes/ConditionNode'
import { LoopNodeProperties } from './nodes/LoopNode'
import { ParallelNodeProperties } from './nodes/ParallelNode'
import { MergeNodeProperties } from './nodes/MergeNode'
import { OutputNodeProperties } from './nodes/OutputNode'
import { CallbackNodeProperties } from './nodes/CallbackNode'
import { UserInputNodeProperties } from './nodes/UserInputNode'
import { ToolNodeProperties } from './nodes/ToolNode'
import { ToolCallParserNodeProperties } from './nodes/ToolCallParserNode'
import { ToolCallRouterNodeProperties } from './nodes/ToolCallRouterNode'
import { AgentNodeProperties } from './nodes/AgentNode'
import { ErrorHandlerNodeProperties } from './nodes/ErrorHandlerNode'
import { CommandNodeProperties } from './nodes/CommandNode'
import { ClaudeCodeNodeProperties } from './nodes/ClaudeCodeNode'
import { WorkflowNodeProperties } from './nodes/WorkflowNode'
import { McpToolNodeProperties } from './nodes/McpToolNode'
import { CodeNodeProperties } from './nodes/CodeNode'
import { TransformerNodeProperties } from './nodes/TransformNode'
import { TriggerNodeProperties } from './nodes/TriggerNode'
import { ChatAgentNodeProperties } from './nodes/ChatAgentNode'
import { MemoryNodeProperties } from './nodes/MemoryNode'
import { GuardrailNodeProperties } from './nodes/GuardrailNode'
import { WebSearchNodeProperties } from './nodes/WebSearchNode'
import { DatabaseQueryNodeProperties } from './nodes/DatabaseQueryNode'
// --- Add new node property imports here ---

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

  // For resolving relative .prmd paths to absolute paths
  const tabs = useEditorStore(state => state.tabs)
  const activeTabId = useEditorStore(state => state.activeTabId)
  const workspacePath = useEditorStore(state => state.explorerDirPath)

  // Prompd viewer modal state (local files)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerSource, setViewerSource] = useState('')
  const [viewerResolvedPath, setViewerResolvedPath] = useState<string | undefined>(undefined)

  // File editor modal state (content mode for expand-to-editor)
  const [fileEditorOpen, setFileEditorOpen] = useState(false)
  const [fileEditorContent, setFileEditorContent] = useState('')
  const [fileEditorLanguage, setFileEditorLanguage] = useState('plaintext')
  const [fileEditorLabel, setFileEditorLabel] = useState('')
  const [fileEditorField, setFileEditorField] = useState('')

  // Package details modal state (registry packages)
  const [selectedRegistryPackage, setSelectedRegistryPackage] = useState<RegistryPackage | null>(null)
  const [packageInitialFile, setPackageInitialFile] = useState<string | undefined>(undefined)

  const handleOpenPrompd = useCallback(async () => {
    if (!selectedNode) return
    const promptData = selectedNode.data as PromptNodeData
    if (!promptData.source) return

    const source = promptData.source

    // Local file — open in read-only Monaco viewer
    if (source.startsWith('.') || source.startsWith('/') || /^[a-zA-Z]:/.test(source)) {
      const activeTab = tabs.find(t => t.id === activeTabId)
      const workflowFilePath = activeTab?.filePath || null

      if (workflowFilePath) {
        const lastSlash = Math.max(workflowFilePath.lastIndexOf('/'), workflowFilePath.lastIndexOf('\\'))
        const workflowDir = lastSlash > 0 ? workflowFilePath.substring(0, lastSlash) : workflowFilePath
        const resolved = workflowDir.replace(/\\/g, '/') + '/' + source.replace(/\\/g, '/')
        setViewerResolvedPath(resolved)
      } else if (workspacePath) {
        const resolved = workspacePath.replace(/\\/g, '/') + '/' + source.replace(/\\/g, '/')
        setViewerResolvedPath(resolved)
      } else {
        setViewerResolvedPath(undefined)
      }

      setViewerSource(source)
      setViewerOpen(true)
      return
    }

    // Registry package — parse name from source and open PackageDetailsModal
    // Source format: @scope/pkg@version/file.prmd or @scope/pkg@version
    const atIdx = source.lastIndexOf('@')
    if (atIdx > 0) {
      const afterAt = source.substring(atIdx + 1) // "version/path/to/file.prmd" or "version"
      const packageName = source.substring(0, atIdx)
      const slashIdx = afterAt.indexOf('/')
      const filePath = slashIdx >= 0 ? afterAt.substring(slashIdx + 1) : undefined

      try {
        const packageInfo = await registryApi.getPackageInfo(packageName)
        if (packageInfo) {
          setPackageInitialFile(filePath)
          setSelectedRegistryPackage(packageInfo)
        }
      } catch (err) {
        console.error('Failed to load package info:', err)
      }
    }
  }, [selectedNode, tabs, activeTabId, workspacePath])

  // Open inline content in expanded editor modal
  const handleExpandEditor = useCallback((content: string, language: string, label: string, field: string) => {
    setFileEditorContent(content)
    setFileEditorLanguage(language)
    setFileEditorLabel(label)
    setFileEditorField(field)
    setFileEditorOpen(true)
  }, [])

  // Save content back from expanded editor to the node data field
  const handleEditorSaveContent = useCallback((content: string) => {
    if (selectedNode && fileEditorField) {
      updateNodeData(selectedNode.id, { [fileEditorField]: content })
    }
  }, [selectedNode, fileEditorField, updateNodeData])

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
      case 'web-search':
        return <Search style={{ ...iconStyle, color: 'var(--node-sky)' }} />
      case 'code':
        return <FileCode style={{ ...iconStyle, color: 'var(--node-blue)' }} />
      case 'claude-code':
        return <Settings style={{ ...iconStyle, color: 'var(--node-violet)' }} />
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
      case 'database-query':
        return <TableProperties style={{ ...iconStyle, color: 'var(--node-teal)' }} />
      // --- Add new node icon cases here ---
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

        {/* Node-specific properties */}
        {selectedNode.type === 'prompt' && (
          <PromptNodeProperties
            data={selectedNode.data as PromptNodeData}
            onChange={handleDataChange}
            onOpenPrompd={handleOpenPrompd}
            onExpandEditor={handleExpandEditor}
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
            onExpandEditor={handleExpandEditor}
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
            onExpandEditor={handleExpandEditor}
          />
        )}

        {selectedNode.type === 'chat-agent' && (
          <ChatAgentNodeProperties
            data={selectedNode.data as ChatAgentNodeData}
            onChange={handleDataChange}
            onExpandEditor={handleExpandEditor}
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

        {selectedNode.type === 'web-search' && (
          <WebSearchNodeProperties
            data={selectedNode.data as WebSearchNodeData}
            onChange={handleDataChange}
            nodeId={selectedNode.id}
          />
        )}

        {selectedNode.type === 'code' && (
          <CodeNodeProperties
            data={selectedNode.data as CodeNodeData}
            onChange={handleDataChange}
            onExpandEditor={handleExpandEditor}
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
            onExpandEditor={handleExpandEditor}
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
            onExpandEditor={handleExpandEditor}
          />
        )}

        {selectedNode.type === 'trigger' && (
          <TriggerNodeProperties
            data={selectedNode.data as TriggerNodeData}
            onChange={handleDataChange}
          />
        )}

        {selectedNode.type === 'database-query' && (
          <DatabaseQueryNodeProperties
            data={selectedNode.data as DatabaseQueryNodeData}
            onChange={handleDataChange}
            nodeId={selectedNode.id}
            onExpandEditor={handleExpandEditor}
          />
        )}
        {/* --- Add new node property dispatchers here --- */}

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
              display: 'block',
              wordBreak: 'break-all',
            }}
          >
            {selectedNode.id}
          </code>
        </div>
      </div>

      {/* Local file viewer modal (read-only Monaco) */}
      <PrompdViewerModal
        isOpen={viewerOpen}
        source={viewerSource}
        resolvedPath={viewerResolvedPath}
        onClose={() => setViewerOpen(false)}
      />

      {/* Expanded content editor modal (for code/template/snippet fields) */}
      <FileEditorModal
        isOpen={fileEditorOpen}
        source={fileEditorLabel}
        initialContent={fileEditorContent}
        language={fileEditorLanguage}
        onSaveContent={handleEditorSaveContent}
        onClose={() => setFileEditorOpen(false)}
      />

      {/* Registry package viewer modal */}
      {selectedRegistryPackage && (
        <PackageDetailsModal
          package={selectedRegistryPackage}
          initialFile={packageInitialFile}
          onClose={() => {
            setSelectedRegistryPackage(null)
            setPackageInitialFile(undefined)
          }}
        />
      )}
    </div>
  )
}
