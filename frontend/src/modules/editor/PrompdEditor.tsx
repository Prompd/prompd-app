import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { OnChange, BeforeMount, OnMount } from '@monaco-editor/react'
import type * as monacoEditor from 'monaco-editor'
import { setupPrompdLanguage } from '../lib/textmate'
import { parsePrompd } from '../lib/prompdParser'
import { triggerValidation, setCurrentFilePath, setModelFilePath, setWorkspacePath } from '../lib/intellisense'
import { editorConfigManager, type MonacoEditorOptions } from '../lib/editorconfig'
import { hotkeyManager } from '../services/hotkeyManager'
// DISABLED: monacoDiff breaks Code Actions - see issue investigation
// import { enableChangeTracking } from '../lib/monacoDiff'

// Monaco command disposables - stored globally to allow re-registration
let monacoCommandDisposables: { dispose: () => void }[] = []

/**
 * Register Monaco keybindings from HotkeyManager
 * This function maps hotkey actions to their corresponding events
 * Uses addAction() to properly override Monaco's built-in keybindings
 */
function registerMonacoHotkeys(editor: any, monaco: any): void {
  // Clear previous keybindings
  monacoCommandDisposables.forEach(d => {
    try { d.dispose() } catch {}
  })
  monacoCommandDisposables = []

  // Map of hotkey action IDs to their metadata and event dispatchers
  const actionConfigs: Record<string, { label: string; handler: () => void }> = {
    save: { label: 'Prompd: Save File', handler: () => window.dispatchEvent(new CustomEvent('prompd-save')) },
    newFile: { label: 'Prompd: New File', handler: () => window.dispatchEvent(new CustomEvent('prompd-new-file')) },
    closeTab: { label: 'Prompd: Close Tab', handler: () => window.dispatchEvent(new CustomEvent('prompd-close-tab')) },
    find: { label: 'Prompd: Find', handler: () => editor.trigger('keyboard', 'actions.find', null) },
    wizardView: { label: 'Prompd: Wizard View', handler: () => window.dispatchEvent(new CustomEvent('set-view-mode', { detail: 'wizard' })) },
    designView: { label: 'Prompd: Design View', handler: () => window.dispatchEvent(new CustomEvent('set-view-mode', { detail: 'design' })) },
    codeView: { label: 'Prompd: Code View', handler: () => window.dispatchEvent(new CustomEvent('set-view-mode', { detail: 'code' })) },
    toggleExplorer: { label: 'Prompd: Toggle File Explorer', handler: () => window.dispatchEvent(new CustomEvent('toggle-sidebar', { detail: 'explorer' })) },
    toggleAiChat: { label: 'Prompd: Toggle AI Chat', handler: () => window.dispatchEvent(new CustomEvent('toggle-sidebar', { detail: 'ai' })) },
    toggleGitPanel: { label: 'Prompd: Toggle Git Panel', handler: () => window.dispatchEvent(new CustomEvent('toggle-sidebar', { detail: 'git' })) },
    toggleOutputPanel: { label: 'Prompd: Toggle Output Panel', handler: () => window.dispatchEvent(new CustomEvent('toggle-output-panel')) },
    commandPalette: { label: 'Prompd: Command Palette', handler: () => window.dispatchEvent(new CustomEvent('toggle-command-palette')) },
    compile: { label: 'Prompd: Build Package', handler: () => window.dispatchEvent(new CustomEvent('prompd-build-package')) },
    toggleBlockComment: { label: 'Prompd: Toggle Block Comment', handler: () => editor.trigger('keyboard', 'editor.action.blockComment', null) },
    openChat: { label: 'Prompd: Open Chat', handler: () => window.dispatchEvent(new CustomEvent('prompd-open-chat')) },
  }

  // Get current hotkey bindings from the manager
  const bindings = hotkeyManager.getMonacoBindings(monaco)

  // Intercept specific keybindings at the DOM level BEFORE Monaco processes them
  // This is necessary because Monaco's built-in Command Palette (Ctrl+Shift+P) takes priority
  const editorDom = editor.getDomNode()
  if (editorDom) {
    // Remove any previous listener
    const existingHandler = (editorDom as any).__prompdKeyHandler
    if (existingHandler) {
      editorDom.removeEventListener('keydown', existingHandler, true)
    }

    // Create new handler that intercepts our hotkeys
    const keyHandler = (e: KeyboardEvent) => {
      // Skip if no modifier keys are pressed (allow normal typing with Shift for capitals)
      // Only intercept when Ctrl, Meta, or Alt is pressed
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        return
      }

      // Don't intercept if Monaco's find widget is open
      // The find widget adds .find-widget class to its container
      const editorDom = editor.getDomNode()
      const findWidget = editorDom?.querySelector('.find-widget')
      if (findWidget && !findWidget.classList.contains('hiddenEditor')) {
        // Find widget is visible - let Monaco handle keyboard events
        return
      }

      const hotkeys = hotkeyManager.getHotkeys()
      for (const [actionId, action] of Object.entries(hotkeys)) {
        const config = action.config
        const ctrlMatch = config.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
        const shiftMatch = config.shift ? e.shiftKey : !e.shiftKey
        const altMatch = config.alt ? e.altKey : !e.altKey
        const keyMatch = e.key.toLowerCase() === config.key.toLowerCase()

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          const handler = actionConfigs[actionId]
          if (handler) {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            console.log(`[PrompdEditor] Intercepted ${actionId} via DOM handler`)
            handler.handler()
            return
          }
        }
      }
    }

    // Store reference for cleanup
    ;(editorDom as any).__prompdKeyHandler = keyHandler

    // Use capture phase to intercept before Monaco
    editorDom.addEventListener('keydown', keyHandler, true)

    // Store disposable for cleanup
    monacoCommandDisposables.push({
      dispose: () => {
        editorDom.removeEventListener('keydown', keyHandler, true)
        delete (editorDom as any).__prompdKeyHandler
      }
    })

    console.log('[PrompdEditor] Installed DOM-level keydown interceptor')
  }

  // Also register via addAction for actions that don't conflict with Monaco built-ins
  // (This provides command palette integration and context menu entries)
  for (const [actionId, keybinding] of Object.entries(bindings)) {
    const config = actionConfigs[actionId]
    if (config && keybinding) {
      try {
        const disposable = editor.addAction({
          id: `prompd.${actionId}`,
          label: config.label,
          // Don't register keybinding here - we handle it via DOM interceptor
          // keybindings: [keybinding],
          contextMenuGroupId: 'prompd',
          run: config.handler
        })
        if (disposable) {
          monacoCommandDisposables.push(disposable)
        }
      } catch (err) {
        console.warn(`[PrompdEditor] Failed to register action for ${actionId}:`, err)
      }
    }
  }

  // Register context-menu-only actions (no hotkey binding required)
  const contextMenuOnlyActions = ['openChat'] as const
  for (const actionId of contextMenuOnlyActions) {
    const config = actionConfigs[actionId]
    if (config) {
      try {
        const disposable = editor.addAction({
          id: `prompd.${actionId}`,
          label: config.label,
          contextMenuGroupId: 'prompd',
          run: config.handler
        })
        if (disposable) {
          monacoCommandDisposables.push(disposable)
        }
      } catch (err) {
        console.warn(`[PrompdEditor] Failed to register context menu action for ${actionId}:`, err)
      }
    }
  }

  // Log registered hotkeys for debugging
  const hotkeys = hotkeyManager.getHotkeys()
  for (const [actionId] of Object.entries(bindings)) {
    if (actionConfigs[actionId]) {
      const config = hotkeys[actionId]?.config
      const keyStr = config ? `${config.ctrl ? 'Ctrl+' : ''}${config.shift ? 'Shift+' : ''}${config.alt ? 'Alt+' : ''}${config.key.toUpperCase()}` : 'unknown'
      console.log(`[PrompdEditor] Hotkey ${actionId}: ${keyStr}`)
    }
  }
  console.log('[PrompdEditor] Registered', Object.keys(bindings).length, 'hotkeys via DOM interceptor')
}

// Pending edit for inline diff view
export interface PendingEdit {
  content: string           // The proposed new content
  lineNumbers: [number, number]  // [startLine, endLine] - 1-indexed
  language?: string
}

type Props = {
  value: string
  onChange: (v: string) => void
  jumpTo?: { line: number; column?: number }
  theme: 'light' | 'dark'
  onCursorChange?: (pos: { line: number; column: number }) => void
  language?: string  // Monaco language ID (prompd, json, yaml, javascript, etc.)
  readOnly?: boolean
  currentFilePath?: string
  workspacePath?: string | null  // Workspace root for .editorconfig resolution
  tabId?: string  // Unique identifier for preserving undo/redo history across tab switches
  // Inline diff view props
  pendingEdit?: PendingEdit | null
  onAcceptEdit?: () => void
  onDeclineEdit?: () => void
}

// Global model cache to preserve undo/redo history across tab switches
const modelCache = new Map<string, any>()

export default function PrompdEditor({ value, onChange, jumpTo, theme, onCursorChange, language = 'prompd', readOnly = false, currentFilePath, workspacePath, tabId, pendingEdit, onAcceptEdit, onDeclineEdit }: Props) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setDragOver] = useState(false)
  const modelRef = useRef<any>(null)
  const valueRef = useRef(value)
  valueRef.current = value  // Keep ref in sync with prop

  // EditorConfig settings
  const [editorConfigOptions, setEditorConfigOptions] = useState<MonacoEditorOptions>({})

  // DISABLED: Change tracking for unsaved edits - breaks Code Actions
  // const changeTrackerRef = useRef<ReturnType<typeof enableChangeTracking> | null>(null)


  // Update the IntelliSense current file path for compiler diagnostics
  // This enables proper inherits validation when file is from disk
  useEffect(() => {
    setCurrentFilePath(currentFilePath || null)
    // Also register the model URI → file path mapping for multi-tab support
    const editor = editorRef.current
    const model = editor?.getModel()
    if (model) {
      setModelFilePath(model.uri.toString(), currentFilePath || null)
    }
  }, [currentFilePath])

  // Update the IntelliSense workspace path for package cache resolution
  useEffect(() => {
    setWorkspacePath(workspacePath || null)
  }, [workspacePath])

  // Load .editorconfig settings when file or workspace changes
  useEffect(() => {
    if (!currentFilePath || !workspacePath) {
      setEditorConfigOptions({})
      return
    }

    // Set workspace path for editorconfig resolution
    editorConfigManager.setWorkspacePath(workspacePath)

    // Create a file reader function for Electron
    const readFile = async (path: string): Promise<string | null> => {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI?.readFile) return null
      try {
        const result = await electronAPI.readFile(path)
        return result.success ? result.content : null
      } catch {
        return null
      }
    }

    // Load editorconfig asynchronously
    editorConfigManager.getMonacoOptionsForFile(currentFilePath, readFile)
      .then(options => {
        if (Object.keys(options).length > 0) {
          console.log('[PrompdEditor] EditorConfig options for', currentFilePath, ':', options)
          setEditorConfigOptions(options)
          // Apply options to existing editor instance
          if (editorRef.current) {
            editorRef.current.updateOptions(options)
          }
        }
      })
      .catch(err => {
        console.warn('[PrompdEditor] Failed to load .editorconfig:', err)
      })
  }, [currentFilePath, workspacePath])

  // Update editor options when readOnly changes
  useEffect(() => {
    if (editorRef.current) {
      console.log('[PrompdEditor] Updating readOnly option:', readOnly)
      editorRef.current.updateOptions({ readOnly })
    }
  }, [readOnly])
  const [validationDecorations, setValidationDecorations] = useState<string[]>([])

  const handleChange: OnChange = (val) => onChange(val ?? '')

  // Memoized validation to avoid excessive re-parsing
  const validation = useMemo(() => {
    if (language !== 'prompd') return { issues: [] }
    try {
      return parsePrompd(value)
    } catch (error) {
      return { 
        issues: [{ 
          type: 'error', 
          message: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error' as const,
          line: 1,
          column: 1
        }]
      }
    }
  }, [value, language])

  // Update validation decorations
  // Note: This provides visual decorations (glyph margin, minimap) separate from Monaco markers (squiggly lines)
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || language !== 'prompd') return

    const model = editor.getModel()
    if (!model) return

    // Create new decorations from validation issues
    // Note: We only add visual enhancements (glyph margin, minimap) here
    // Hover messages and squiggly lines come from Monaco markers (set by IntelliSense)
    const newDecorations = validation.issues.map(issue => ({
      range: new (window as any).monaco.Range(
        issue.line || 1,
        issue.column || 1,
        issue.line || 1,
        issue.column ? issue.column + 10 : 100
      ),
      options: {
        className: `prompd-validation-${issue.severity}`,
        // No hoverMessage - let Monaco markers handle hover tooltips for consistency
        minimap: {
          color: issue.severity === 'error' ? '#f44747' : issue.severity === 'warning' ? '#ffcc02' : '#3794ff',
          position: 2 // monaco.editor.MinimapPosition.Inline
        },
        overviewRuler: {
          color: issue.severity === 'error' ? '#f44747' : issue.severity === 'warning' ? '#ffcc02' : '#3794ff',
          position: 2 // monaco.editor.OverviewRulerLane.Right
        },
        glyphMargin: {
          className: `prompd-glyph-${issue.severity}`
        },
        stickiness: 1 // monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }))

    // Use deltaDecorations to atomically replace old decorations with new ones
    // This properly clears old decorations when issues are resolved
    const newIds = editor.deltaDecorations(validationDecorations, newDecorations)
    setValidationDecorations(newIds)
  }, [validation, language])  // FIXED: Removed unstable editorRef.current dependency

  // Handle editor mount
  const onMount: OnMount = useCallback((editor, monaco) => {
    console.log('[PrompdEditor] onMount called, language prop:', language)
    editorRef.current = editor
    monacoRef.current = monaco

    // Register model URI → file path for multi-tab intellisense support
    const model = editor.getModel()
    if (model && currentFilePath) {
      setModelFilePath(model.uri.toString(), currentFilePath)
    }

    // Sync value prop to model on mount
    // This handles the case where keepCurrentModel={true} reuses a cached model
    // but the value prop has changed (e.g., from DesignView edits)
    if (model) {
      const modelValue = model.getValue()
      const currentValue = valueRef.current
      if (currentValue !== modelValue) {
        model.pushEditOperations(
          [],
          [{
            range: model.getFullModelRange(),
            text: currentValue
          }],
          () => null
        )
      }
    }

    // Add CSS for validation decorations (only once)
    const styleId = 'prompd-validation-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .prompd-validation-error {
          border-bottom: 2px solid #f44747 !important;
          background-color: rgba(244, 71, 71, 0.1) !important;
        }
        .prompd-validation-warning {
          border-bottom: 2px solid #ffcc02 !important;
          background-color: rgba(255, 204, 2, 0.1) !important;
        }
        .prompd-validation-info {
          border-bottom: 2px solid #3794ff !important;
          background-color: rgba(55, 148, 255, 0.1) !important;
        }
        .prompd-glyph-error::before {
          content: "●";
          color: #f44747;
          font-weight: bold;
          font-size: 14px;
          line-height: 18px;
        }
        .prompd-glyph-warning::before {
          content: "▲";
          color: #ffcc02;
          font-weight: bold;
          font-size: 12px;
          line-height: 18px;
        }
        .prompd-glyph-info::before {
          content: "ℹ";
          color: #3794ff;
          font-weight: bold;
          font-size: 14px;
          line-height: 18px;
        }
      `
      document.head.appendChild(style)
    }

    // Set up cursor position tracking
    if (onCursorChange) {
      editor.onDidChangeCursorPosition((e: any) => {
        onCursorChange({ line: e.position.lineNumber, column: e.position.column })
      })
    }

    // Trigger validation for prompd files
    // This ensures validation runs even if the model was created before IntelliSense registered
    // We use force=true because Monaco may create the model with 'markdown' language initially
    if (language === 'prompd') {
      const model = editor.getModel()
      if (model) {
        console.log('[PrompdEditor] onMount: triggering validation for model', model.uri.toString(), 'modelLang:', model.getLanguageId())
        // Small delay to ensure IntelliSense is fully set up
        setTimeout(() => {
          // Force validation since we know this is a .prmd file (language prop is 'prompd')
          // even if Monaco internally set language to 'markdown'
          triggerValidation(model, true)
        }, 100)
      }
    }

    // Register Monaco keybindings from HotkeyManager
    // These are dynamically updated when settings change
    registerMonacoHotkeys(editor, monaco)

    // DISABLED: Enable change tracking for unsaved edits (gutter markers) - breaks Code Actions
    // const editorModel = editor.getModel()
    // if (editorModel) {
    //   const initialText = editorModel.getValue()
    //   console.log('[PrompdEditor] Enabling change tracking with initial text:', initialText.substring(0, 100) + '...')
    //   changeTrackerRef.current = enableChangeTracking(editor, monaco, initialText)
    //   console.log('[PrompdEditor] Change tracker created:', changeTrackerRef.current)
    //
    //   // Listen for content changes and update gutter markers
    //   editor.onDidChangeModelContent(() => {
    //     console.log('[PrompdEditor] Content changed, checking for changes...')
    //     if (changeTrackerRef.current) {
    //       const hasChanges = changeTrackerRef.current.hasChanges()
    //       console.log('[PrompdEditor] hasChanges:', hasChanges)
    //       if (hasChanges) {
    //         console.log('[PrompdEditor] Applying gutter markers...')
    //         changeTrackerRef.current.applyGutterMarkers()
    //       } else {
    //         console.log('[PrompdEditor] No changes, clearing gutter markers...')
    //         changeTrackerRef.current.clearGutterMarkers()
    //       }
    //     }
    //   })
    // }

    // Auto-collapse build panel when editor gains focus (if not pinned)
    // We collapse the panel content (minimize) but keep it visible via a custom event
    editor.onDidFocusEditorWidget(() => {
      window.dispatchEvent(new CustomEvent('editor-focused'))
    })

    // Fix Monaco find widget tooltip grey line issue
    // Only target hover tooltips, NOT code action widgets
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Only hide border on hover tooltips (they have .workbench-hover-container child)
            // Do NOT touch code action widgets (they have .action-widget or .actionList)
            if (node.classList.contains('context-view') &&
                node.classList.contains('left') &&
                node.querySelector('.workbench-hover-container')) {
              node.style.borderRight = 'none'
            }
          }
        })
      })
    })

    // Observe the editor DOM and body for tooltip additions
    const editorDom = editor.getDomNode()
    if (editorDom) {
      observer.observe(editorDom, { childList: true, subtree: true })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    // Clean up observer on dispose
    editor.onDidDispose(() => observer.disconnect())

    // Minimap: keep slider visible and enable click-to-scroll
    try {
      const root = editor.getDomNode()
      const minimap = root?.querySelector('.minimap') as HTMLElement | null
      if (minimap) {
        const handler = (ev: MouseEvent) => {
          const rect = minimap.getBoundingClientRect()
          const y = ev.clientY - rect.top
          const ratio = Math.min(1, Math.max(0, y / rect.height))
          const layout = editor.getLayoutInfo()
          const total = editor.getScrollHeight()
          const view = layout.height
          const maxTop = Math.max(0, total - view)
          editor.setScrollTop(ratio * maxTop)
        }
        minimap.addEventListener('mousedown', handler)
        editor.onDidDispose(() => minimap.removeEventListener('mousedown', handler))
      }
    } catch {}

    // XML auto-close tag functionality for prompd files with content-type: xml
    // This provides auto-insertion of closing tags when user types ">"
    if (language === 'prompd') {
      editor.onDidChangeModelContent((e: any) => {
        // Only process single character insertions
        if (e.changes.length !== 1) return
        const change = e.changes[0]
        if (change.text !== '>') return

        const model = editor.getModel()
        if (!model) return

        // Check if this file has content-type: xml in frontmatter
        const content = model.getValue()
        const hasXmlContentType = /^---[\s\S]*?content-type:\s*xml[\s\S]*?---/m.test(content)
        if (!hasXmlContentType) return

        const position = editor.getPosition()
        if (!position) return

        // Get the full line content and text up to cursor (including the ">")
        const lineContent = model.getLineContent(position.lineNumber)
        // position.column is 1-indexed and cursor is AFTER the ">", so substring(0, column-1) gives text up to cursor
        // But we need the ">" which was just typed - it's at position.column - 1 (0-indexed: column - 2)
        const textUpToCursor = lineContent.substring(0, position.column - 1)

        // The ">" should be at the end of textUpToCursor now
        if (!textUpToCursor.endsWith('>')) return

        // Check if we just closed an opening tag (not a self-closing tag or closing tag)
        // Pattern: <tagname> or <tagname attr="value"> but NOT </tagname> or <tagname/>
        // Match opening tag that ends with > (not /> or closing tag)
        const openingTagMatch = textUpToCursor.match(/<([a-zA-Z_][\w.-]*)(?:\s+[^>]*[^/])?>$|<([a-zA-Z_][\w.-]*)>$/)
        if (!openingTagMatch) return

        // Check it's not a self-closing tag (ends with />)
        if (textUpToCursor.endsWith('/>')) return

        // Also check it's not a closing tag (</tagname>)
        if (/<\/[^>]+>$/.test(textUpToCursor)) return

        const tagName = openingTagMatch[1] || openingTagMatch[2]
        if (!tagName) return

        // Don't auto-close void/self-closing HTML elements
        const voidElements = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']
        if (voidElements.includes(tagName.toLowerCase())) return

        // Insert the closing tag
        const closingTag = `</${tagName}>`

        // Use executeEdits to insert at cursor position
        editor.executeEdits('xml-auto-close', [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: closingTag,
          forceMoveMarkers: false
        }])

        // Move cursor back between the tags (cursor is already at right position after >)
        editor.setPosition({ lineNumber: position.lineNumber, column: position.column })
      })

      // Register completion provider for closing tags when user types "</"
      const disposable = monaco.languages.registerCompletionItemProvider('prompd', {
        triggerCharacters: ['/'],
        provideCompletionItems: (model: any, position: any) => {
          // Check if this file has content-type: xml
          const content = model.getValue()
          const hasXmlContentType = /^---[\s\S]*?content-type:\s*xml[\s\S]*?---/m.test(content)
          if (!hasXmlContentType) return { suggestions: [] }

          // Check if we're typing "</" - need to detect the pattern before cursor
          const lineContent = model.getLineContent(position.lineNumber)
          // Get text including current position (cursor is after the "/")
          const textIncludingCursor = lineContent.substring(0, position.column - 1)

          // Look for "<" or "</" at end - "/" trigger means we just typed it
          // textIncludingCursor might be "...<" (cursor right after /) or "...</"
          const endsWithOpenBracket = textIncludingCursor.endsWith('<')
          const endsWithOpenSlash = textIncludingCursor.endsWith('</')

          if (!endsWithOpenBracket && !endsWithOpenSlash) return { suggestions: [] }

          // Find all unclosed tags in the document up to cursor position
          const textUpToCursor = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          })

          // Parse opening and closing tags
          const openingTags: string[] = []
          const tagRegex = /<\/?([a-zA-Z_][\w.-]*)[^>]*>/g
          let match
          while ((match = tagRegex.exec(textUpToCursor)) !== null) {
            const fullMatch = match[0]
            const tagName = match[1]

            // Skip self-closing tags
            if (fullMatch.endsWith('/>')) continue

            if (fullMatch.startsWith('</')) {
              // Closing tag - pop from stack if matches
              const lastIndex = openingTags.lastIndexOf(tagName)
              if (lastIndex !== -1) {
                openingTags.splice(lastIndex, 1)
              }
            } else {
              // Opening tag - push to stack
              openingTags.push(tagName)
            }
          }

          // Determine start column for replacement
          // If we have "</", start from the "/" position; if just "<", also from current position
          const startCol = endsWithOpenSlash ? position.column - 1 : position.column

          // Create suggestions for unclosed tags (in reverse order - innermost first)
          const suggestions = openingTags.reverse().map((tagName, index) => ({
            label: `</${tagName}>`,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: endsWithOpenSlash ? `${tagName}>` : `/${tagName}>`,
            detail: `Close <${tagName}> tag`,
            sortText: String(index).padStart(3, '0'), // Maintain order
            range: {
              startLineNumber: position.lineNumber,
              startColumn: startCol,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            }
          }))

          return { suggestions }
        }
      })

      editor.onDidDispose(() => disposable.dispose())
    }
  }, [onCursorChange, language])

  // DISABLED: Listen for file save event and reset change tracking baseline - breaks Code Actions
  // useEffect(() => {
  //   const handleFileSaved = () => {
  //     if (changeTrackerRef.current) {
  //       console.log('[PrompdEditor] File saved, resetting change tracker baseline')
  //       changeTrackerRef.current.reset()
  //     }
  //   }
  //
  //   window.addEventListener('prompd-file-saved', handleFileSaved)
  //   return () => window.removeEventListener('prompd-file-saved', handleFileSaved)
  // }, [])

  // Subscribe to hotkey changes and re-register Monaco keybindings
  useEffect(() => {
    if (!editorRef.current) return

    const unsubscribe = hotkeyManager.subscribe(() => {
      // Re-register keybindings when hotkeys change
      const monaco = (window as any).monaco
      if (editorRef.current && monaco) {
        console.log('[PrompdEditor] Hotkeys changed, re-registering keybindings')
        registerMonacoHotkeys(editorRef.current, monaco)
      }
    })

    return unsubscribe
  }, []) // Empty deps - we only set up subscription once, it tracks editorRef internally

  const beforeMount: BeforeMount = async (monaco) => {
    // Enhanced dark theme with semantic colors for Prompd
    monaco.editor.defineTheme('prompd-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // YAML frontmatter - Enhanced with state-aware Monarch tokenizer support
        // Keys (multiple token name formats for compatibility)
        { token: 'keyword.yaml', foreground: '#82aaff', fontStyle: 'bold' },
        { token: 'keyword', foreground: '#82aaff', fontStyle: 'bold' },
        { token: 'key.yaml', foreground: '#82aaff', fontStyle: 'bold' },
        { token: 'entity.name.tag.yaml', foreground: '#82aaff', fontStyle: 'bold' },

        // Punctuation
        { token: 'punctuation.separator.key-value.yaml', foreground: '#89ddff' },
        { token: 'punctuation.definition.list.yaml', foreground: '#89ddff' },
        { token: 'punctuation.bracket.yaml', foreground: '#89ddff' },
        { token: 'punctuation.separator.yaml', foreground: '#89ddff' },
        { token: 'punctuation.definition.frontmatter', foreground: '#89ddff', fontStyle: 'bold' },

        // Strings (YAML)
        { token: 'string.quoted.double.yaml', foreground: '#c3e88d' },
        { token: 'string.quoted.single.yaml', foreground: '#c3e88d' },
        { token: 'string.unquoted.yaml', foreground: '#c3e88d' },
        { token: 'string.yaml', foreground: '#c3e88d' },
        { token: 'string.quoted.double', foreground: '#c3e88d' },
        { token: 'string.quoted.single', foreground: '#c3e88d' },

        // Numbers and constants (YAML)
        { token: 'constant.numeric.yaml', foreground: '#f78c6c' },
        { token: 'constant.numeric.integer.yaml', foreground: '#f78c6c' },
        { token: 'constant.numeric.float.yaml', foreground: '#f78c6c' },
        { token: 'constant.numeric.version.yaml', foreground: '#f78c6c' },
        { token: 'constant.language.boolean.yaml', foreground: '#f78c6c' },
        { token: 'constant.language.null.yaml', foreground: '#f78c6c' },
        { token: 'constant.character.escape.yaml', foreground: '#f78c6c' },
        { token: 'number.float.yaml', foreground: '#f78c6c' },
        { token: 'number.yaml', foreground: '#f78c6c' },

        // Comments (YAML only - in frontmatter)
        { token: 'comment.yaml', foreground: '#546e7a', fontStyle: 'italic' },
        { token: 'comment', foreground: '#546e7a', fontStyle: 'italic' },

        // Generic delimiters
        { token: 'delimiter', foreground: '#89ddff' },
        { token: 'operator', foreground: '#89ddff' },

        // Section headers (# System, # User, etc.) - State-aware markdown tokens
        { token: 'type.identifier', foreground: '#ffcb6b', fontStyle: 'bold' },
        { token: 'type', foreground: '#ffcb6b', fontStyle: 'bold' },
        { token: 'entity.name.section.prompd', foreground: '#ffcb6b', fontStyle: 'bold' },
        { token: 'entity.name.heading.prompd', foreground: '#82aaff', fontStyle: 'bold' },
        { token: 'punctuation.definition.heading.prompd', foreground: '#546e7a' },

        // Markdown heading tokens from new tokenizer
        { token: 'punctuation.definition.heading.markdown', foreground: '#546e7a' },
        { token: 'markup.heading.markdown', foreground: '#82aaff', fontStyle: 'bold' },

        // Package references (@namespace/package)
        { token: 'variable.other.package', foreground: '#c792ea', fontStyle: 'italic' },
        { token: 'support.class.package', foreground: '#c792ea', fontStyle: 'italic' },

        // Parameter references ({param}, {{param}})
        { token: 'variable.parameter', foreground: '#ff9800', fontStyle: 'bold' },
        { token: 'variable.handlebars', foreground: '#ff9800', fontStyle: 'bold' },
        { token: 'variable', foreground: '#ff9800' },
        { token: 'variable.name.prompd', foreground: '#ff9800' },
        { token: 'variable.other.template.prompd', foreground: '#ff9800' },
        { token: 'variable.other.simple.prompd', foreground: '#ff9800' },

        // Markdown formatting
        { token: 'strong', foreground: '#ffffff', fontStyle: 'bold' },
        { token: 'markup.bold.prompd', foreground: '#ffffff', fontStyle: 'bold' },
        { token: 'markup.bold.markdown', foreground: '#ffffff', fontStyle: 'bold' },
        { token: 'emphasis', foreground: '#82aaff', fontStyle: 'italic' },
        { token: 'markup.italic.prompd', foreground: '#82aaff', fontStyle: 'italic' },
        { token: 'markup.italic.markdown', foreground: '#82aaff', fontStyle: 'italic' },
        { token: 'markup.strikethrough.markdown', foreground: '#546e7a', fontStyle: 'strikethrough' },

        // Inline code and code blocks
        { token: 'string.quoted', foreground: '#c3e88d' },
        { token: 'string', foreground: '#c3e88d' },
        { token: 'markup.inline.raw.prompd', foreground: '#c3e88d' },
        { token: 'markup.inline.raw.markdown', foreground: '#c3e88d' },
        { token: 'markup.fenced_code.block.prompd', foreground: '#e0e0e0' },
        { token: 'markup.raw.block.markdown', foreground: '#e0e0e0' },
        { token: 'punctuation.definition.code.fenced', foreground: '#546e7a' },
        { token: 'fenced_code.block.language.prompd', foreground: '#82aaff', fontStyle: 'italic' },

        // Lists
        { token: 'markup.list.unnumbered.prompd', foreground: '#89ddff' },
        { token: 'markup.list.numbered.prompd', foreground: '#89ddff' },
        { token: 'punctuation.definition.list_item.prompd', foreground: '#89ddff', fontStyle: 'bold' },
        { token: 'punctuation.definition.list.markdown', foreground: '#89ddff' },

        // Links
        { token: 'string.link', foreground: '#82aaff', fontStyle: 'underline' },
        { token: 'string.reference', foreground: '#c792ea' },
        { token: 'markup.underline.link.markdown', foreground: '#82aaff', fontStyle: 'underline' },
        { token: 'markup.underline.link.image.markdown', foreground: '#82aaff' },

        // Blockquotes and horizontal rules
        { token: 'punctuation.definition.quote.markdown', foreground: '#546e7a' },
        { token: 'punctuation.definition.hr.markdown', foreground: '#546e7a' },

        // Jinja/template control structures
        { token: 'keyword.control.jinja.prompd', foreground: '#ff5370', fontStyle: 'bold' },
        { token: 'meta.embedded.jinja.prompd', foreground: '#ff5370' },
        { token: 'comment.block.jinja.prompd', foreground: '#546e7a', fontStyle: 'italic' },

        // Jinja2 - Monarch tokenizer tokens
        { token: 'punctuation.definition.tag.jinja', foreground: '#ff5370', fontStyle: 'bold' },
        { token: 'punctuation.definition.expression.jinja', foreground: '#ffcb6b', fontStyle: 'bold' },
        { token: 'keyword.control.jinja', foreground: '#c792ea', fontStyle: 'bold' },
        { token: 'keyword.operator.jinja', foreground: '#89ddff' },
        { token: 'comment.block.jinja', foreground: '#546e7a', fontStyle: 'italic' },
        { token: 'string.quoted.double.jinja', foreground: '#c3e88d' },
        { token: 'string.quoted.single.jinja', foreground: '#c3e88d' },
        { token: 'constant.numeric.jinja', foreground: '#f78c6c' },
        { token: 'variable.other.jinja', foreground: '#f07178' },
        { token: 'support.variable.jinja', foreground: '#f07178', fontStyle: 'italic' },
        { token: 'punctuation.bracket.jinja', foreground: '#89ddff' },
        { token: 'punctuation.separator.jinja', foreground: '#89ddff' },

        // XML/HTML tokens (for content-type: xml files)
        { token: 'tag.xml', foreground: '#b392f0' },
        { token: 'attribute.name.xml', foreground: '#ffcb6b' },
        { token: 'attribute.xml', foreground: '#c792ea' },
        { token: 'string.xml', foreground: '#89ddff' },
        { token: 'comment.block.xml', foreground: '#546e7a', fontStyle: 'italic' },
        { token: 'punctuation.xml', foreground: '#89ddff' },

        // Errors and warnings
        { token: 'invalid', foreground: '#ff5370', fontStyle: 'bold underline' },
        { token: 'comment.warning', foreground: '#ffcb6b' },

        // Special Prompd keywords
        { token: 'keyword.control.prompd', foreground: '#c792ea', fontStyle: 'bold' },

        // Frontmatter delimiters (legacy tokens)
        { token: 'punctuation.definition.frontmatter.begin.prompd', foreground: '#89ddff', fontStyle: 'bold' },
        { token: 'punctuation.definition.frontmatter.end.prompd', foreground: '#89ddff', fontStyle: 'bold' },
        { token: 'meta.frontmatter.prompd', background: '#1a1f2e' },
      ],
      colors: {
        // Editor background - use darkest bg (#0b1220) to match var(--bg) in dark mode
        'editor.background': '#0b1220',
        'editor.foreground': '#e0e0e0',

        // Line numbers gutter - darker with subtle border
        'editorLineNumber.foreground': '#3b4252',
        'editorLineNumber.activeForeground': '#64748b',
        'editorGutter.background': '#0b1220',
        'editorGutter.modifiedBackground': '#3b82f6',
        'editorGutter.addedBackground': '#10b981',
        'editorGutter.deletedBackground': '#ef4444',

        // Line highlighting - subtle
        'editor.lineHighlightBackground': '#1a1f2e',
        'editor.lineHighlightBorder': '#00000000',

        // Selection colors - more visible
        'editor.selectionBackground': '#2c4f76',
        'editor.selectionHighlightBackground': '#2c4f7640',
        'editor.inactiveSelectionBackground': '#2c4f7630',

        // Find/replace highlights
        'editor.findMatchBackground': '#515c6a80',
        'editor.findMatchHighlightBackground': '#515c6a40',

        // IntelliSense popup
        'editorSuggestWidget.background': '#1a1f2e',
        'editorSuggestWidget.border': '#2c3e50',
        'editorSuggestWidget.selectedBackground': '#2c4f76',
        'editorSuggestWidget.foreground': '#e0e0e0',
        'editorSuggestWidget.highlightForeground': '#82aaff',

        // Hover widget
        'editorHoverWidget.background': '#1a1f2e',
        'editorHoverWidget.border': '#2c3e50',
        'editorHoverWidget.foreground': '#e0e0e0',

        // Error/warning decorations
        'editorError.foreground': '#ff5370',
        'editorWarning.foreground': '#ffcb6b',
        'editorInfo.foreground': '#82aaff',

        // Cursor and highlights
        'editorCursor.foreground': '#ffcb6b',
        'editorWhitespace.foreground': '#3b4048',

        // Minimap - slightly lighter for contrast
        'minimap.background': '#0f172a',
        'minimapSlider.background': '#2c3e5033',
        'minimapSlider.hoverBackground': '#2c3e5055',
        'minimapSlider.activeBackground': '#82aaff55',

        // Scrollbar to match app theme
        'scrollbarSlider.background': '#2c3e5099',
        'scrollbarSlider.hoverBackground': '#82aaffaa',
        'scrollbarSlider.activeBackground': '#82aaff',

        // Bracket matching
        'editorBracketMatch.background': '#2c4f7640',
        'editorBracketMatch.border': '#82aaff',

        // Find widget
        'editorWidget.background': '#1a1f2e',
        'editorWidget.border': '#2c3e50',
        'editorWidget.foreground': '#e0e0e0',
        'input.background': '#0b1220',
        'input.border': '#2c3e50',
        'input.foreground': '#e0e0e0',
        'input.placeholderForeground': '#6b7280',
        'inputOption.activeBackground': '#2c4f76',
        'inputOption.activeForeground': '#e0e0e0',
        'inputOption.activeBorder': '#82aaff',
      }
    })
    
    // Enhanced light theme
    monaco.editor.defineTheme('prompd-light', {
      base: 'vs',
      inherit: true,
      rules: [
        // YAML frontmatter - Enhanced with state-aware Monarch tokenizer support
        // Keys (multiple token name formats for compatibility)
        { token: 'keyword.yaml', foreground: '#0071bc', fontStyle: 'bold' },
        { token: 'keyword', foreground: '#0071bc', fontStyle: 'bold' },
        { token: 'key.yaml', foreground: '#0071bc', fontStyle: 'bold' },
        { token: 'entity.name.tag.yaml', foreground: '#0071bc', fontStyle: 'bold' },

        // Punctuation
        { token: 'punctuation.separator.key-value.yaml', foreground: '#005cc5' },
        { token: 'punctuation.definition.list.yaml', foreground: '#005cc5' },
        { token: 'punctuation.bracket.yaml', foreground: '#005cc5' },
        { token: 'punctuation.separator.yaml', foreground: '#005cc5' },
        { token: 'punctuation.definition.frontmatter', foreground: '#005cc5', fontStyle: 'bold' },

        // Strings (YAML)
        { token: 'string.quoted.double.yaml', foreground: '#22863a' },
        { token: 'string.quoted.single.yaml', foreground: '#22863a' },
        { token: 'string.unquoted.yaml', foreground: '#22863a' },
        { token: 'string.yaml', foreground: '#22863a' },
        { token: 'string.quoted.double', foreground: '#22863a' },
        { token: 'string.quoted.single', foreground: '#22863a' },

        // Numbers and constants (YAML)
        { token: 'constant.numeric.yaml', foreground: '#d73a49' },
        { token: 'constant.numeric.integer.yaml', foreground: '#d73a49' },
        { token: 'constant.numeric.float.yaml', foreground: '#d73a49' },
        { token: 'constant.numeric.version.yaml', foreground: '#d73a49' },
        { token: 'constant.language.boolean.yaml', foreground: '#d73a49' },
        { token: 'constant.language.null.yaml', foreground: '#d73a49' },
        { token: 'constant.character.escape.yaml', foreground: '#d73a49' },
        { token: 'number.float.yaml', foreground: '#d73a49' },
        { token: 'number.yaml', foreground: '#d73a49' },

        // Comments (YAML only - in frontmatter)
        { token: 'comment.yaml', foreground: '#6a737d', fontStyle: 'italic' },
        { token: 'comment', foreground: '#6a737d', fontStyle: 'italic' },

        // Generic delimiters
        { token: 'delimiter', foreground: '#005cc5' },
        { token: 'operator', foreground: '#005cc5' },

        // Section headers (# System, # User, etc.) - State-aware markdown tokens
        { token: 'type.identifier', foreground: '#b08800', fontStyle: 'bold' },
        { token: 'type', foreground: '#b08800', fontStyle: 'bold' },
        { token: 'entity.name.section.prompd', foreground: '#b08800', fontStyle: 'bold' },
        { token: 'entity.name.heading.prompd', foreground: '#0071bc', fontStyle: 'bold' },
        { token: 'punctuation.definition.heading.prompd', foreground: '#6a737d' },

        // Markdown heading tokens from new tokenizer
        { token: 'punctuation.definition.heading.markdown', foreground: '#6a737d' },
        { token: 'markup.heading.markdown', foreground: '#0071bc', fontStyle: 'bold' },

        // Package references (@namespace/package)
        { token: 'variable.other.package', foreground: '#6f42c1', fontStyle: 'italic' },
        { token: 'support.class.package', foreground: '#6f42c1', fontStyle: 'italic' },

        // Parameter references ({param}, {{param}})
        { token: 'variable.parameter', foreground: '#e36209', fontStyle: 'bold' },
        { token: 'variable.handlebars', foreground: '#e36209', fontStyle: 'bold' },
        { token: 'variable', foreground: '#e36209' },
        { token: 'variable.name.prompd', foreground: '#e36209' },
        { token: 'variable.other.template.prompd', foreground: '#e36209' },
        { token: 'variable.other.simple.prompd', foreground: '#e36209' },

        // Markdown formatting
        { token: 'strong', foreground: '#24292e', fontStyle: 'bold' },
        { token: 'markup.bold.prompd', foreground: '#24292e', fontStyle: 'bold' },
        { token: 'markup.bold.markdown', foreground: '#24292e', fontStyle: 'bold' },
        { token: 'emphasis', foreground: '#0071bc', fontStyle: 'italic' },
        { token: 'markup.italic.prompd', foreground: '#0071bc', fontStyle: 'italic' },
        { token: 'markup.italic.markdown', foreground: '#0071bc', fontStyle: 'italic' },
        { token: 'markup.strikethrough.markdown', foreground: '#6a737d', fontStyle: 'strikethrough' },

        // Inline code and code blocks
        { token: 'string.quoted', foreground: '#22863a' },
        { token: 'string', foreground: '#22863a' },
        { token: 'markup.inline.raw.prompd', foreground: '#032f62', background: '#f6f8fa' },
        { token: 'markup.inline.raw.markdown', foreground: '#032f62', background: '#f6f8fa' },
        { token: 'markup.fenced_code.block.prompd', foreground: '#24292e' },
        { token: 'markup.raw.block.markdown', foreground: '#24292e' },
        { token: 'punctuation.definition.code.fenced', foreground: '#6a737d' },
        { token: 'fenced_code.block.language.prompd', foreground: '#0071bc', fontStyle: 'italic' },

        // Lists
        { token: 'markup.list.unnumbered.prompd', foreground: '#005cc5' },
        { token: 'markup.list.numbered.prompd', foreground: '#005cc5' },
        { token: 'punctuation.definition.list_item.prompd', foreground: '#005cc5', fontStyle: 'bold' },
        { token: 'punctuation.definition.list.markdown', foreground: '#005cc5' },

        // Links
        { token: 'string.link', foreground: '#0366d6', fontStyle: 'underline' },
        { token: 'string.reference', foreground: '#6f42c1' },
        { token: 'markup.underline.link.markdown', foreground: '#0366d6', fontStyle: 'underline' },
        { token: 'markup.underline.link.image.markdown', foreground: '#0366d6' },

        // Blockquotes and horizontal rules
        { token: 'punctuation.definition.quote.markdown', foreground: '#6a737d' },
        { token: 'punctuation.definition.hr.markdown', foreground: '#6a737d' },

        // Jinja/template control structures
        { token: 'keyword.control.jinja.prompd', foreground: '#d73a49', fontStyle: 'bold' },
        { token: 'meta.embedded.jinja.prompd', foreground: '#d73a49' },
        { token: 'comment.block.jinja.prompd', foreground: '#6a737d', fontStyle: 'italic' },

        // Jinja2 - Monarch tokenizer tokens
        { token: 'punctuation.definition.tag.jinja', foreground: '#d73a49', fontStyle: 'bold' },
        { token: 'punctuation.definition.expression.jinja', foreground: '#b08800', fontStyle: 'bold' },
        { token: 'keyword.control.jinja', foreground: '#6f42c1', fontStyle: 'bold' },
        { token: 'keyword.operator.jinja', foreground: '#005cc5' },
        { token: 'comment.block.jinja', foreground: '#6a737d', fontStyle: 'italic' },
        { token: 'string.quoted.double.jinja', foreground: '#22863a' },
        { token: 'string.quoted.single.jinja', foreground: '#22863a' },
        { token: 'constant.numeric.jinja', foreground: '#d73a49' },
        { token: 'variable.other.jinja', foreground: '#cf222e' },
        { token: 'support.variable.jinja', foreground: '#cf222e', fontStyle: 'italic' },
        { token: 'punctuation.bracket.jinja', foreground: '#005cc5' },
        { token: 'punctuation.separator.jinja', foreground: '#005cc5' },

        // XML/HTML tokens (for content-type: xml files)
        { token: 'tag.xml', foreground: '#8250df' },
        { token: 'attribute.name.xml', foreground: '#6f42c1' },
        { token: 'attribute.xml', foreground: '#6f42c1' },
        { token: 'string.xml', foreground: '#005cc5' },
        { token: 'comment.block.xml', foreground: '#6a737d', fontStyle: 'italic' },
        { token: 'punctuation.xml', foreground: '#005cc5' },

        // Errors and warnings
        { token: 'invalid', foreground: '#b31d28', fontStyle: 'bold underline' },
        { token: 'comment.warning', foreground: '#b08800' },

        // Special Prompd keywords
        { token: 'keyword.control.prompd', foreground: '#6f42c1', fontStyle: 'bold' },

        // Frontmatter delimiters (legacy tokens)
        { token: 'punctuation.definition.frontmatter.begin.prompd', foreground: '#005cc5', fontStyle: 'bold' },
        { token: 'punctuation.definition.frontmatter.end.prompd', foreground: '#005cc5', fontStyle: 'bold' },
        { token: 'meta.frontmatter.prompd', background: '#f6f8fa' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#24292e',

        // Line highlighting - subtle
        'editor.lineHighlightBackground': '#f6f8fa',
        'editor.lineHighlightBorder': '#00000000',

        // Selection colors - visible
        'editor.selectionBackground': '#c8e1ff',
        'editor.selectionHighlightBackground': '#c8e1ff60',
        'editor.inactiveSelectionBackground': '#c8e1ff40',

        // Find/replace highlights
        'editor.findMatchBackground': '#ffdf5d80',
        'editor.findMatchHighlightBackground': '#ffdf5d40',

        // IntelliSense popup
        'editorSuggestWidget.background': '#f6f8fa',
        'editorSuggestWidget.border': '#d1d5da',
        'editorSuggestWidget.selectedBackground': '#c8e1ff',
        'editorSuggestWidget.foreground': '#24292e',
        'editorSuggestWidget.highlightForeground': '#0071bc',

        // Hover widget
        'editorHoverWidget.background': '#f6f8fa',
        'editorHoverWidget.border': '#d1d5da',
        'editorHoverWidget.foreground': '#24292e',

        // Error/warning decorations
        'editorError.foreground': '#d73a49',
        'editorWarning.foreground': '#b08800',
        'editorInfo.foreground': '#0071bc',

        // Cursor and highlights
        'editorCursor.foreground': '#044289',
        'editorWhitespace.foreground': '#d1d5da',

        // Minimap
        'minimap.background': '#ffffff',
        'minimapSlider.background': '#d1d5da33',
        'minimapSlider.hoverBackground': '#d1d5da55',
        'minimapSlider.activeBackground': '#0071bc55',

        // Scrollbar
        'scrollbarSlider.background': '#d1d5da99',
        'scrollbarSlider.hoverBackground': '#959da5aa',
        'scrollbarSlider.activeBackground': '#6a737d',

        // Bracket matching
        'editorBracketMatch.background': '#c8e1ff40',
        'editorBracketMatch.border': '#0071bc',

        // Find widget
        'editorWidget.background': '#f6f8fa',
        'editorWidget.border': '#d1d5da',
        'editorWidget.foreground': '#24292e',
        'input.background': '#ffffff',
        'input.border': '#d1d5da',
        'input.foreground': '#24292e',
        'input.placeholderForeground': '#6a737d',
        'inputOption.activeBackground': '#c8e1ff',
        'inputOption.activeForeground': '#24292e',
        'inputOption.activeBorder': '#0071bc',
      }
    })
    
    await setupPrompdLanguage(monaco as any)
  }

  // Calculate relative path from current file to target file
  const getRelativePath = useCallback((fromPath: string, toPath: string): string => {
    const from = fromPath.split('/').slice(0, -1) // Remove filename, keep directory
    const to = toPath.split('/')

    // Find common base
    let i = 0
    while (i < from.length && i < to.length && from[i] === to[i]) {
      i++
    }

    // Build relative path
    const upLevels = from.length - i
    const downPath = to.slice(i)

    const relativeParts = [...Array(upLevels).fill('..'), ...downPath]
    return relativeParts.length > 0 ? relativeParts.join('/') : './'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    // Check if it's a context file from the file explorer
    const contextFileData = e.dataTransfer.getData('application/x-prompd-context-file')
    if (contextFileData) {
      try {
        const { path } = JSON.parse(contextFileData)

        // Calculate relative path if we have current file path
        let pathToInsert = path
        if (currentFilePath) {
          pathToInsert = getRelativePath(currentFilePath, path)
        }

        // Parse current document to find context section
        const lines = value.split('\n')
        let inFrontmatter = false
        let frontmatterEnd = -1
        let contextLineIndex = -1

        // Find frontmatter boundaries and context line (support both 'context:' and 'contexts:')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === '---') {
            if (!inFrontmatter) {
              inFrontmatter = true
            } else {
              frontmatterEnd = i
              break
            }
          } else if (inFrontmatter && (lines[i].trim().startsWith('context:') || lines[i].trim().startsWith('contexts:'))) {
            contextLineIndex = i
          }
        }

        if (frontmatterEnd === -1) {
          // No valid frontmatter, can't add context
          console.warn('No valid YAML frontmatter found')
          return
        }

        let newValue: string
        if (contextLineIndex >= 0) {
          // Context section exists, add to it
          let insertIndex = contextLineIndex + 1
          // Skip existing context entries to add at the end
          while (insertIndex < frontmatterEnd && lines[insertIndex].trim().startsWith('-')) {
            insertIndex++
          }
          lines.splice(insertIndex, 0, `  - "${pathToInsert}"`)
          newValue = lines.join('\n')
        } else {
          // No context section, create it after frontmatter start
          lines.splice(frontmatterEnd, 0, `context:\n  - "${pathToInsert}"`)
          newValue = lines.join('\n')
        }

        onChange(newValue)
        console.log('✓ Added context file:', pathToInsert, '(from:', path, ')')
      } catch (err) {
        console.error('❌ Failed to add context file:', err)
      }
      return
    }

    // Check if it's a resource from the ResourcePanel
    const resourceData = e.dataTransfer.getData('application/x-prompd-resource')
    if (resourceData) {
      try {
        const resource = JSON.parse(resourceData)
        // Insert markdown at cursor or append to body
        const markdown = resource.markdown || resource.protocolUrl
        // Append to end of document body
        onChange(value + '\n' + markdown)
      } catch (err) {
        console.error('Failed to handle resource drop:', err)
      }
      return
    }

    // Otherwise, handle as file upload
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const txt = await file.text()
      onChange(txt)
    }
  }, [onChange, value, currentFilePath, getRelativePath])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragOver(true)
    if (e.type === 'dragleave') setDragOver(false)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('dragover', (e) => e.preventDefault())
  }, [])

  // Ensure layout updates when container resizes (avoids zero-height glitches)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const RO: any = (window as any).ResizeObserver
    if (!RO) return
    const ro = new RO(() => {
      try { editorRef.current?.layout?.() } catch {}
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Jump to a specific line when requested
  useEffect(() => {
    if (!jumpTo || !editorRef.current) return
    const { line, column } = jumpTo
    const pos = { lineNumber: Math.max(1, line), column: Math.max(1, column || 1) }
    try {
      editorRef.current.revealPositionInCenter(pos)
      editorRef.current.setPosition(pos)
      editorRef.current.focus()
    } catch {}
  }, [jumpTo])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          // Clear all markers BEFORE disposal to prevent hover/marker rendering
          // on a disposed InstantiationService
          const model = editorRef.current.getModel()
          if (model && monacoRef.current) {
            monacoRef.current.editor.setModelMarkers(model, 'prompd', [])
            monacoRef.current.editor.setModelMarkers(model, 'prompd-compiler', [])
          }
          // Clear decorations
          if (validationDecorations.length > 0) {
            editorRef.current.deltaDecorations(validationDecorations, [])
          }
        } catch {}
        try {
          editorRef.current.dispose()
        } catch {}
      }
      editorRef.current = null
      monacoRef.current = null
    }
  }, [])

  // Inline diff view zone - shows diff peek at edit location
  const viewZoneIdRef = useRef<string | null>(null)
  const diffDecorationsRef = useRef<string[]>([])

  useEffect(() => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const monaco = (window as any).monaco

    // Clean up previous view zone and decorations
    const cleanup = () => {
      if (viewZoneIdRef.current) {
        editor.changeViewZones((accessor: any) => {
          accessor.removeZone(viewZoneIdRef.current)
        })
        viewZoneIdRef.current = null
      }
      if (diffDecorationsRef.current.length > 0) {
        editor.deltaDecorations(diffDecorationsRef.current, [])
        diffDecorationsRef.current = []
      }
    }

    if (!pendingEdit || !monaco) {
      cleanup()
      return
    }

    const [startLine, endLine] = pendingEdit.lineNumbers

    // Create decorations to highlight the affected lines
    const newDecorations = editor.deltaDecorations(diffDecorationsRef.current, [
      {
        range: new monaco.Range(startLine, 1, endLine, 1000),
        options: {
          isWholeLine: true,
          className: 'prompd-diff-highlight',
          glyphMarginClassName: 'prompd-diff-glyph'
        }
      }
    ])
    diffDecorationsRef.current = newDecorations

    // Create a view zone that inserts the diff view below the affected lines
    editor.changeViewZones((accessor: any) => {
      // Remove previous zone if exists
      if (viewZoneIdRef.current) {
        accessor.removeZone(viewZoneIdRef.current)
      }

      // Get the editor layout to calculate proper width (accounting for minimap)
      const layoutInfo = editor.getLayoutInfo()
      const minimapWidth = layoutInfo.minimap?.minimapWidth || 0
      const verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth || 0
      const contentWidth = layoutInfo.contentWidth || layoutInfo.width
      const rightReserve = minimapWidth + verticalScrollbarWidth // 16px extra margin

      // Calculate the actual width we want (content area minus reserved space)
      const targetWidth = contentWidth// - rightReserve

      // Create DOM element for the diff view zone
      // Monaco sets width inline, so we use a wrapper approach
      const domNode = document.createElement('div')
      domNode.className = 'prompd-inline-diff-zone'
      // Monaco will set width on this, but we constrain the inner content
      domNode.style.cssText = `
        margin: -4px 0 4px 0;
        overflow: visible;
        position: relative;
        pointer-events: auto;
      `

      // Inner container with the actual styling and constrained width
      const innerContainer = document.createElement('div')
      innerContainer.style.cssText = `
        background: ${theme === 'dark' ? '#1e293b' : '#f8fafc'};
        border: 1px solid ${theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'};
        border-radius: 6px;
        overflow: visible;
        box-shadow: ${theme === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)'};
        position: relative;
        z-index: 100;
        pointer-events: auto;
        box-sizing: border-box;
        width: ${targetWidth}px;
        max-width: calc(100% - ${rightReserve}px);
      `

      // Header
      const header = document.createElement('div')
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: ${theme === 'dark' ? '#0f172a' : '#f1f5f9'};
        border-bottom: 1px solid ${theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'};
        font-size: 12px;
        font-family: system-ui, -apple-system, sans-serif;
        flex-wrap: wrap;
        gap: 8px;
        position: relative;
        z-index: 101;
        pointer-events: auto;
      `

      const titleSpan = document.createElement('span')
      titleSpan.style.cssText = `font-weight: 600; color: ${theme === 'dark' ? '#e2e8f0' : '#0f172a'}; white-space: nowrap;`
      titleSpan.textContent = `Proposed Changes (Lines ${startLine}-${endLine})`
      header.appendChild(titleSpan)

      const buttonContainer = document.createElement('div')
      buttonContainer.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0; pointer-events: auto; position: relative; z-index: 102;'

      // Decline button
      const declineBtn = document.createElement('button')
      declineBtn.style.cssText = `
        display: flex; align-items: center; gap: 4px;
        padding: 4px 10px; font-size: 12px; font-weight: 500;
        background: transparent;
        border: 1px solid ${theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'};
        border-radius: 4px;
        color: ${theme === 'dark' ? '#e2e8f0' : '#0f172a'};
        cursor: pointer;
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: auto;
        position: relative;
        z-index: 103;
      `
      declineBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg> Decline'
      declineBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      declineBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        cleanup()
        onDeclineEdit?.()
      })
      declineBtn.onmouseenter = () => {
        declineBtn.style.background = theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'
        declineBtn.style.borderColor = '#f87171'
      }
      declineBtn.onmouseleave = () => {
        declineBtn.style.background = 'transparent'
        declineBtn.style.borderColor = theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'
      }
      buttonContainer.appendChild(declineBtn)

      // Accept button
      const acceptBtn = document.createElement('button')
      acceptBtn.style.cssText = `
        display: flex; align-items: center; gap: 4px;
        padding: 4px 10px; font-size: 12px; font-weight: 500;
        background: #22c55e; border: none; border-radius: 4px;
        color: white; cursor: pointer;
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: auto;
        position: relative;
        z-index: 103;
      `
      acceptBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Accept'
      acceptBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      acceptBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // Apply the edit using Monaco's executeEdits for proper undo/redo support
        const model = editor.getModel()
        if (model && pendingEdit) {
          const [editStartLine, editEndLine] = pendingEdit.lineNumbers
          const lineCount = model.getLineCount()

          console.log('[PrompdEditor] Applying edit:', {
            editStartLine,
            editEndLine,
            lineCount,
            contentPreview: pendingEdit.content.substring(0, 50) + '...'
          })

          let range: any
          let textToInsert = pendingEdit.content

          // Handle case where edit targets lines beyond file end (appending content)
          if (editStartLine > lineCount) {
            // Append new lines at end of file
            // Insert at the end of the last line, prepending newlines to create the new line(s)
            const lastLineMaxCol = model.getLineMaxColumn(lineCount)
            range = new monaco.Range(lineCount, lastLineMaxCol, lineCount, lastLineMaxCol)
            // Prepend newline(s) to create the new lines
            const linesToAdd = editStartLine - lineCount
            textToInsert = '\n'.repeat(linesToAdd) + pendingEdit.content
            console.log('[PrompdEditor] Appending after line', lineCount, 'with', linesToAdd, 'newlines')
          } else if (editEndLine > lineCount) {
            // Start line exists but end line is beyond file - replace from start to end of file
            range = new monaco.Range(
              editStartLine,
              1,
              lineCount,
              model.getLineMaxColumn(lineCount)
            )
            console.log('[PrompdEditor] Replacing from line', editStartLine, 'to end of file')
          } else {
            // Normal case - both lines exist within file bounds
            range = new monaco.Range(
              editStartLine,
              1,
              editEndLine,
              model.getLineMaxColumn(editEndLine)
            )
            console.log('[PrompdEditor] Replacing lines', editStartLine, 'to', editEndLine)
          }

          // Push an undo stop before the edit so it can be undone as a single operation
          editor.pushUndoStop()

          // Execute the edit
          const success = editor.executeEdits('ai-edit', [{
            range,
            text: textToInsert,
            forceMoveMarkers: true
          }])

          console.log('[PrompdEditor] executeEdits result:', success)

          // Push another undo stop after the edit
          editor.pushUndoStop()
        }

        cleanup()
        onAcceptEdit?.()
      })
      acceptBtn.onmouseenter = () => { acceptBtn.style.background = '#16a34a' }
      acceptBtn.onmouseleave = () => { acceptBtn.style.background = '#22c55e' }
      buttonContainer.appendChild(acceptBtn)

      header.appendChild(buttonContainer)
      innerContainer.appendChild(header)

      // Diff content - show original vs new
      const diffContent = document.createElement('div')
      diffContent.style.cssText = `
        display: flex;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.5;
        max-height: 200px;
        overflow: auto;
      `

      // Get original lines
      const allLines = value.split('\n')
      const originalLines = allLines.slice(startLine - 1, endLine)
      const proposedLines = pendingEdit.content.split('\n')

      // Original side (removed)
      const originalSide = document.createElement('div')
      originalSide.style.cssText = `
        flex: 1;
        background: ${theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2'};
        border-right: 1px solid ${theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0'};
        padding: 8px;
        white-space: pre;
        overflow-x: auto;
      `
      originalLines.forEach((line, i) => {
        const lineEl = document.createElement('div')
        lineEl.style.cssText = `
          color: ${theme === 'dark' ? '#fca5a5' : '#dc2626'};
          padding: 1px 4px;
        `
        lineEl.innerHTML = `<span style="color: ${theme === 'dark' ? '#64748b' : '#94a3b8'}; margin-right: 8px; user-select: none;">-</span>${escapeHtml(line) || ' '}`
        originalSide.appendChild(lineEl)
      })
      diffContent.appendChild(originalSide)

      // Proposed side (added)
      const proposedSide = document.createElement('div')
      proposedSide.style.cssText = `
        flex: 1;
        background: ${theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4'};
        padding: 8px;
        white-space: pre;
        overflow-x: auto;
      `
      proposedLines.forEach((line, i) => {
        const lineEl = document.createElement('div')
        lineEl.style.cssText = `
          color: ${theme === 'dark' ? '#86efac' : '#16a34a'};
          padding: 1px 4px;
        `
        lineEl.innerHTML = `<span style="color: ${theme === 'dark' ? '#64748b' : '#94a3b8'}; margin-right: 8px; user-select: none;">+</span>${escapeHtml(line) || ' '}`
        proposedSide.appendChild(lineEl)
      })
      diffContent.appendChild(proposedSide)

      innerContainer.appendChild(diffContent)
      domNode.appendChild(innerContainer)

      // Calculate zone height based on content
      const lineCount = Math.max(originalLines.length, proposedLines.length)
      const headerHeight = 40
      const lineHeight = 20
      const padding = 24
      const zoneHeight = Math.min(headerHeight + lineCount * lineHeight + padding, 280)

      const zoneId = accessor.addZone({
        afterLineNumber: endLine,
        heightInPx: zoneHeight,
        domNode,
        suppressMouseDown: false
      })

      viewZoneIdRef.current = zoneId

      // Scroll to show the diff view
      setTimeout(() => {
        editor.revealLineInCenter(endLine)
      }, 50)
    })

    return cleanup
  }, [pendingEdit, theme, value, onAcceptEdit, onDeclineEdit])

  // Track previous pendingEdit state to detect when edit is accepted/declined
  const prevPendingEditRef = useRef<PendingEdit | null | undefined>(pendingEdit)
  useEffect(() => {
    // If pendingEdit went from non-null to null, an edit was just accepted/declined
    // Force Monaco to re-tokenize the entire document WITHOUT clearing undo stack
    if (prevPendingEditRef.current && !pendingEdit && editorRef.current) {
      const editor = editorRef.current
      const monaco = (window as any).monaco
      const model = editor.getModel()

      if (model && monaco) {
        console.log('[PrompdEditor] Edit completed, forcing re-tokenization (preserving undo)')

        const currentLang = model.getLanguageId()

        // Force re-tokenization by switching language and back
        // This does NOT use setValue() which would clear the undo stack
        monaco.editor.setModelLanguage(model, 'plaintext')

        requestAnimationFrame(() => {
          // Switch back to original language - this triggers re-tokenization
          monaco.editor.setModelLanguage(model, currentLang)

          // Trigger validation after tokenization completes
          setTimeout(() => {
            triggerValidation(model, true)
          }, 50)
        })
      }
    }
    prevPendingEditRef.current = pendingEdit
  }, [pendingEdit, language])

  // Helper function to escape HTML
  function escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  const overlay = useMemo(() => (
    <div style={{ position: 'absolute', inset: 0, border: '2px dashed #39435e', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a2a8b7', background: 'rgba(21,25,38,0.6)' }}>
      Drop a .prmd or text file
    </div>
  ), [])

  return (
    <div ref={containerRef} className="panel" style={{ position: 'relative', height: '100%' }}
         onDrop={handleDrop}
         onDragEnter={handleDrag}
         onDragOver={handleDrag}
         onDragLeave={handleDrag}>
      {isDragOver ? overlay : null}
      <Editor
        value={value}
        onChange={handleChange}
        height="100%"
        language={language}
        beforeMount={beforeMount}
        theme={theme === 'dark' ? 'prompd-dark' : 'prompd-light'}
        onMount={onMount}
        path={tabId || currentFilePath || undefined}
        keepCurrentModel={true}
        options={{
          fontSize: 14,
          minimap: { enabled: true, side: 'right', renderCharacters: false, size: 'fit' as any, showSlider: 'always' },
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: readOnly,
          quickSuggestions: { other: true, comments: true, strings: true },
          suggestOnTriggerCharacters: true,
          wordBasedSuggestions: 'off', // Disable word-based suggestions to prioritize custom IntelliSense
          tabSize: 2,
          bracketPairColorization: { enabled: true },
          renderWhitespace: 'selection',
          // Enable glyph margin for change tracking markers
          glyphMargin: true,
          // Show lightbulb for code actions (on = show on all lines, onCode = only code lines)
          lightbulb: { enabled: 'on' as monacoEditor.editor.ShowLightbulbIconMode },
          // EditorConfig overrides (tabSize, insertSpaces, wordWrap, etc.)
          ...editorConfigOptions,
        }}
      />
    </div>
  )
}
