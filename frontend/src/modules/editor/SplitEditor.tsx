/**
 * SplitEditor - Horizontal split view with code editor and compiled preview
 *
 * Provides a resizable split pane with the Monaco editor on the left
 * and the compiled markdown preview on the right.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import PrompdEditor, { PendingEdit } from './PrompdEditor'
import { CompiledPreview } from './CompiledPreview'
import type { GenerationMode } from '../components/GenerationControls'
import { GripVertical } from 'lucide-react'

interface SplitEditorProps {
  /** The .prmd file content */
  value: string
  /** Callback when content changes */
  onChange: (v: string) => void
  /** Jump to specific line/column */
  jumpTo?: { line: number; column?: number }
  /** Theme for styling */
  theme: 'light' | 'dark'
  /** Cursor position callback */
  onCursorChange?: (pos: { line: number; column: number }) => void
  /** Monaco language ID */
  language?: string
  /** Read-only mode */
  readOnly?: boolean
  /** Current file path for IntelliSense */
  currentFilePath?: string
  /** Workspace root for .editorconfig */
  workspacePath?: string | null
  /** Tab ID for undo/redo history */
  tabId?: string
  /** Inline diff view props */
  pendingEdit?: PendingEdit | null
  onAcceptEdit?: () => void
  onDeclineEdit?: () => void
  /** Whether to show the preview panel */
  showPreview: boolean
  /** Callback to close preview */
  onClosePreview: () => void
  /** Parameters for template substitution in preview */
  parameters?: Record<string, unknown>
  /** Callback when preview parameters change */
  onParametersChange?: (params: Record<string, unknown>) => void
  /** Whether to show context sections in preview */
  showContextSections?: boolean
  /** Has folder open (for file browser) */
  hasFolderOpen?: boolean
  /** File upload handler for context sections */
  onFileUpload?: (sectionName: string, files: File[]) => Promise<string[]>
  /** Select from browser handler */
  onSelectFromBrowser?: (sectionName: string) => Promise<string | null>
  /** Show execution controls in preview */
  showExecution?: boolean
  /** Execute handler */
  onExecute?: () => void
  /** Is executing */
  isExecuting?: boolean
  /** Can execute (all params valid) */
  canExecute?: boolean
  /** Execution disabled reason */
  executionDisabledReason?: string
  /** Execution provider */
  executionProvider?: string
  /** Execution model */
  executionModel?: string
  /** Available providers */
  executionProviders?: Array<{ id: string, name: string, models: Array<{ id: string, name: string }> }>
  /** Provider change handler */
  onExecutionProviderChange?: (provider: string) => void
  /** Model change handler */
  onExecutionModelChange?: (model: string) => void
  /** Max tokens */
  executionMaxTokens?: number
  /** Temperature */
  executionTemperature?: number
  /** Generation mode */
  executionMode?: GenerationMode
  /** Max tokens change handler */
  onExecutionMaxTokensChange?: (value: number) => void
  /** Temperature change handler */
  onExecutionTemperatureChange?: (value: number) => void
  /** Mode change handler */
  onExecutionModeChange?: (mode: GenerationMode) => void
}

export function SplitEditor({
  value,
  onChange,
  jumpTo,
  theme,
  onCursorChange,
  language = 'prompd',
  readOnly = false,
  currentFilePath,
  workspacePath,
  tabId,
  pendingEdit,
  onAcceptEdit,
  onDeclineEdit,
  showPreview,
  onClosePreview,
  parameters = {},
  onParametersChange,
  showContextSections = true,
  hasFolderOpen = false,
  onFileUpload,
  onSelectFromBrowser,
  showExecution = false,
  onExecute,
  isExecuting = false,
  canExecute = true,
  executionDisabledReason,
  executionProvider,
  executionModel,
  executionProviders = [],
  onExecutionProviderChange,
  onExecutionModelChange,
  executionMaxTokens = 4096,
  executionTemperature = 0.7,
  executionMode = 'default',
  onExecutionMaxTokensChange,
  onExecutionTemperatureChange,
  onExecutionModeChange
}: SplitEditorProps) {
  // Split position as percentage (0-100)
  const [splitPosition, setSplitPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = (x / rect.width) * 100

    // Clamp between 20% and 80%
    setSplitPosition(Math.max(20, Math.min(80, percentage)))
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Attach/detach global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Calculate widths
  const editorWidth = showPreview
    ? (isPreviewMaximized ? 0 : splitPosition)
    : 100
  const previewWidth = showPreview
    ? (isPreviewMaximized ? 100 : 100 - splitPosition)
    : 0

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Editor pane */}
      {(!showPreview || !isPreviewMaximized) && (
        <div
          style={{
            width: `${editorWidth}%`,
            height: '100%',
            overflow: 'hidden',
            flexShrink: 0,
            transition: isDragging ? 'none' : 'width 0.15s ease'
          }}
        >
          <PrompdEditor
            value={value}
            onChange={onChange}
            jumpTo={jumpTo}
            theme={theme}
            onCursorChange={onCursorChange}
            language={language}
            readOnly={readOnly}
            currentFilePath={currentFilePath}
            workspacePath={workspacePath}
            tabId={tabId}
            pendingEdit={pendingEdit}
            onAcceptEdit={onAcceptEdit}
            onDeclineEdit={onDeclineEdit}
          />
        </div>
      )}

      {/* Resize handle */}
      {showPreview && !isPreviewMaximized && (
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: '6px',
            height: '100%',
            background: theme === 'dark' ? 'var(--border)' : '#e2e8f0',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
            position: 'relative',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme === 'dark' ? 'var(--accent)' : '#3b82f6'
          }}
          onMouseLeave={(e) => {
            if (!isDragging) {
              e.currentTarget.style.background = theme === 'dark' ? 'var(--border)' : '#e2e8f0'
            }
          }}
        >
          <GripVertical
            size={12}
            style={{
              color: theme === 'dark' ? 'var(--text-muted)' : '#94a3b8',
              opacity: 0.6
            }}
          />
        </div>
      )}

      {/* Preview pane */}
      {showPreview && (
        <div
          style={{
            width: `${previewWidth}%`,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            transition: isDragging ? 'none' : 'width 0.15s ease',
            borderLeft: isPreviewMaximized ? 'none' : undefined
          }}
        >
          <CompiledPreview
            content={value}
            parameters={parameters}
            onParametersChange={onParametersChange}
            theme={theme}
            height="100%"
            showMeta={true}
            debounceMs={500}
            filePath={currentFilePath}
            workspacePath={workspacePath}
            isMaximized={isPreviewMaximized}
            onToggleMaximize={() => setIsPreviewMaximized(!isPreviewMaximized)}
            onClose={onClosePreview}
            showContextSections={showContextSections}
            onContextSectionsChange={onChange}
            onFileUpload={onFileUpload}
            onSelectFromBrowser={onSelectFromBrowser}
            hasFolderOpen={hasFolderOpen}
            showExecution={showExecution}
            onExecute={onExecute}
            isExecuting={isExecuting}
            canExecute={canExecute}
            executionDisabledReason={executionDisabledReason}
            executionProvider={executionProvider}
            executionModel={executionModel}
            executionProviders={executionProviders}
            onExecutionProviderChange={onExecutionProviderChange}
            onExecutionModelChange={onExecutionModelChange}
            executionMaxTokens={executionMaxTokens}
            executionTemperature={executionTemperature}
            executionMode={executionMode}
            onExecutionMaxTokensChange={onExecutionMaxTokensChange}
            onExecutionTemperatureChange={onExecutionTemperatureChange}
            onExecutionModeChange={onExecutionModeChange}
          />
        </div>
      )}
    </div>
  )
}

export default SplitEditor
