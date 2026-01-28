/**
 * Monaco Diff Utilities
 *
 * Provides three diff capabilities:
 * 1. Inline diff preview (find/replace, pending changes)
 * 2. Side-by-side diff editor (compare file versions)
 * 3. Change tracking (unsaved edits with gutter markers)
 */

import type * as monaco from 'monaco-editor'
import { diffLines } from 'diff'

// ============================================================================
// 1. INLINE DIFF PREVIEW (Find/Replace, Pending Changes)
// ============================================================================

export interface DiffChange {
  type: 'insert' | 'delete' | 'modify'
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  text?: string
}

/**
 * Simple line-based diff comparison
 */
function computeLineDiff(originalLines: string[], modifiedLines: string[]): DiffChange[] {
  const changes: DiffChange[] = []
  const maxLen = Math.max(originalLines.length, modifiedLines.length)

  for (let i = 0; i < maxLen; i++) {
    const originalLine = originalLines[i]
    const modifiedLine = modifiedLines[i]

    if (originalLine === undefined) {
      // Line added
      changes.push({
        type: 'insert',
        startLine: i + 1,
        endLine: i + 1,
        startColumn: 1,
        endColumn: modifiedLine.length + 1,
        text: modifiedLine
      })
    } else if (modifiedLine === undefined) {
      // Line deleted
      changes.push({
        type: 'delete',
        startLine: i + 1,
        endLine: i + 1,
        startColumn: 1,
        endColumn: originalLine.length + 1,
        text: ''
      })
    } else if (originalLine !== modifiedLine) {
      // Line modified
      changes.push({
        type: 'modify',
        startLine: i + 1,
        endLine: i + 1,
        startColumn: 1,
        endColumn: Math.max(originalLine.length, modifiedLine.length) + 1,
        text: modifiedLine
      })
    }
  }

  return changes
}

/**
 * Compute diff changes between two strings
 * Returns decorations for highlighting differences inline
 */
export function computeInlineDiff(
  monaco: typeof import('monaco-editor'),
  originalText: string,
  modifiedText: string,
  language: string = 'plaintext'
): DiffChange[] {
  console.log('[computeInlineDiff] Original text:', originalText)
  console.log('[computeInlineDiff] Modified text:', modifiedText)

  // Split into lines for comparison
  const originalLines = originalText.split('\n')
  const modifiedLines = modifiedText.split('\n')

  console.log('[computeInlineDiff] Original lines:', originalLines)
  console.log('[computeInlineDiff] Modified lines:', modifiedLines)

  // Compute line-based diff
  const changes = computeLineDiff(originalLines, modifiedLines)
  console.log('[computeInlineDiff] Computed changes:', changes)

  return changes
}

/**
 * Apply diff decorations to an editor to show pending changes
 * Returns decoration IDs that can be cleared later
 */
export function applyDiffDecorations(
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  changes: DiffChange[]
): string[] {
  console.log('[applyDiffDecorations] Applying decorations for', changes.length, 'changes')

  const decorations: monaco.editor.IModelDeltaDecoration[] = []

  for (const change of changes) {
    console.log('[applyDiffDecorations] Processing change:', change)

    const range = new monaco.Range(
      change.startLine,
      change.startColumn,
      change.endLine,
      change.endColumn
    )

    console.log('[applyDiffDecorations] Range:', range)

    if (change.type === 'insert') {
      decorations.push({
        range,
        options: {
          isWholeLine: false,
          inlineClassName: 'diff-insert-inline',
          glyphMarginClassName: 'diff-insert-glyph',
          minimap: {
            color: '#10b98180',
            position: monaco.editor.MinimapPosition.Inline
          },
          overviewRuler: {
            color: '#10b981',
            position: monaco.editor.OverviewRulerLane.Left
          }
        }
      })
    } else if (change.type === 'delete') {
      decorations.push({
        range,
        options: {
          isWholeLine: change.startColumn === 1,
          inlineClassName: 'diff-delete-inline',
          glyphMarginClassName: 'diff-delete-glyph',
          minimap: {
            color: '#ef444480',
            position: monaco.editor.MinimapPosition.Inline
          },
          overviewRuler: {
            color: '#ef4444',
            position: monaco.editor.OverviewRulerLane.Left
          }
        }
      })
    } else { // modify
      decorations.push({
        range,
        options: {
          isWholeLine: false,
          inlineClassName: 'diff-modify-inline',
          glyphMarginClassName: 'diff-modify-glyph',
          minimap: {
            color: '#3b82f680',
            position: monaco.editor.MinimapPosition.Inline
          },
          overviewRuler: {
            color: '#3b82f6',
            position: monaco.editor.OverviewRulerLane.Left
          }
        }
      })
    }
  }

  console.log('[applyDiffDecorations] Total decorations created:', decorations.length)
  console.log('[applyDiffDecorations] Decorations:', decorations)

  const decorationIds = editor.deltaDecorations([], decorations)
  console.log('[applyDiffDecorations] Decoration IDs returned:', decorationIds)

  return decorationIds
}

/**
 * Preview find/replace changes before applying
 * Shows what will change with highlighted decorations
 */
export function previewFindReplace(
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  findText: string,
  replaceText: string,
  options?: {
    matchCase?: boolean
    matchWholeWord?: boolean
    useRegex?: boolean
  }
): { changes: DiffChange[]; decorations: string[] } {
  const model = editor.getModel()
  if (!model) return { changes: [], decorations: [] }

  const currentText = model.getValue()

  // Perform replacement (don't apply yet)
  let newText = currentText
  if (options?.useRegex) {
    const flags = options.matchCase ? 'g' : 'gi'
    newText = currentText.replace(new RegExp(findText, flags), replaceText)
  } else {
    const searchStr = options?.matchCase ? findText : findText.toLowerCase()
    const targetStr = options?.matchCase ? currentText : currentText.toLowerCase()

    let startIndex = 0
    while (true) {
      const index = targetStr.indexOf(searchStr, startIndex)
      if (index === -1) break

      // Check whole word boundary if needed
      if (options?.matchWholeWord) {
        const before = index > 0 ? targetStr[index - 1] : ' '
        const after = index + searchStr.length < targetStr.length
          ? targetStr[index + searchStr.length]
          : ' '
        if (/\w/.test(before) || /\w/.test(after)) {
          startIndex = index + 1
          continue
        }
      }

      newText = newText.substring(0, index) + replaceText + newText.substring(index + findText.length)
      startIndex = index + replaceText.length
    }
  }

  const changes = computeInlineDiff(monaco, currentText, newText, model.getLanguageId())
  const decorations = applyDiffDecorations(editor, monaco, changes)

  return { changes, decorations }
}

// ============================================================================
// 2. SIDE-BY-SIDE DIFF EDITOR (Compare File Versions)
// ============================================================================

export interface DiffEditorOptions {
  originalTitle?: string
  modifiedTitle?: string
  readOnly?: boolean
  renderSideBySide?: boolean
  ignoreTrimWhitespace?: boolean
  theme?: string
}

/**
 * Create a side-by-side diff editor in a container
 * Useful for comparing two file versions
 */
export function createDiffEditor(
  container: HTMLElement,
  monaco: typeof import('monaco-editor'),
  originalText: string,
  modifiedText: string,
  language: string,
  options?: DiffEditorOptions
): monaco.editor.IStandaloneDiffEditor {
  console.log('[createDiffEditor] Creating diff editor with language:', language)
  console.log('[createDiffEditor] Container:', container, 'Size:', container.offsetWidth, 'x', container.offsetHeight)

  const diffEditor = monaco.editor.createDiffEditor(container, {
    renderSideBySide: options?.renderSideBySide ?? true,
    readOnly: options?.readOnly ?? false,
    ignoreTrimWhitespace: options?.ignoreTrimWhitespace ?? true,
    enableSplitViewResizing: true,
    renderIndicators: true,
    renderMarginRevertIcon: true,
    theme: 'vs-dark',
    fontSize: 13,
    fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    // Force diff colors to be more visible
    diffWordWrap: 'on',
    renderOverviewRuler: true,
    // Explicitly show whitespace to make all changes visible
    renderWhitespace: 'all',
    // Make sure diff decorations are rendered
    diffCodeLens: true,
    originalEditable: false,
    // Ensure the diff algorithm shows all changes
    maxComputationTime: 5000,
    // Make gutter indicators more visible
    glyphMargin: true,
    lineNumbersMinChars: 3
  })

  console.log('[createDiffEditor] Diff editor created:', diffEditor)

  // Create unique URIs for the models - Monaco needs these to track and diff properly
  // Use different timestamps and paths to ensure URIs are unique
  const timestamp = Date.now()
  const originalUri = monaco.Uri.parse(`inmemory://diff-original-${timestamp}.${language}`)
  const modifiedUri = monaco.Uri.parse(`inmemory://diff-modified-${timestamp + 1}.${language}`)

  console.log('[createDiffEditor] Creating models with URIs:')
  console.log('[createDiffEditor]   Original URI:', originalUri.toString())
  console.log('[createDiffEditor]   Modified URI:', modifiedUri.toString())

  const originalModel = monaco.editor.createModel(originalText, language, originalUri)
  const modifiedModel = monaco.editor.createModel(modifiedText, language, modifiedUri)

  console.log('[createDiffEditor] Models created')
  console.log('[createDiffEditor]   Original: Lines:', originalModel.getLineCount(), 'Length:', originalText.length)
  console.log('[createDiffEditor]   Modified: Lines:', modifiedModel.getLineCount(), 'Length:', modifiedText.length)

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  })

  console.log('[createDiffEditor] Model set complete')

  // Check diff editor's own DOM node
  const diffEditorDom = diffEditor.getDomNode()
  console.log('[createDiffEditor] Diff editor DOM node:', diffEditorDom)
  console.log('[createDiffEditor] Diff editor DOM size:', diffEditorDom?.offsetWidth, 'x', diffEditorDom?.offsetHeight)

  // Check if Monaco created the split view container
  if (diffEditorDom) {
    const splitView = diffEditorDom.querySelector('.monaco-split-view2')
    console.log('[createDiffEditor] Split view container found:', !!splitView)
    if (splitView) {
      console.log('[createDiffEditor] Split view size:', (splitView as HTMLElement).offsetWidth, 'x', (splitView as HTMLElement).offsetHeight)
    }
  }

  // Listen for when Monaco finishes computing the diff
  const disposable = diffEditor.onDidUpdateDiff(() => {
    console.log('[createDiffEditor] onDidUpdateDiff event fired')
    const width = container.offsetWidth
    const height = container.offsetHeight
    diffEditor.layout({ width, height })
    console.log('[createDiffEditor] Layout triggered from diff update')

    // Check sizes after diff update
    const original = diffEditor.getOriginalEditor()
    const modified = diffEditor.getModifiedEditor()
    if (original && modified) {
      const origDom = original.getDomNode()
      const modDom = modified.getDomNode()
      console.log('[createDiffEditor] After diff update - Original DOM:', origDom?.offsetWidth, 'x', origDom?.offsetHeight)
      console.log('[createDiffEditor] After diff update - Modified DOM:', modDom?.offsetWidth, 'x', modDom?.offsetHeight)
    }

    // Only run once
    disposable.dispose()
  })

  // Force initial layout with explicit dimensions - use longer timeout
  setTimeout(() => {
    const width = container.offsetWidth
    const height = container.offsetHeight
    console.log('[createDiffEditor] Container dimensions:', { width, height })

    // Explicitly set layout dimensions
    diffEditor.layout({ width, height })
    console.log('[createDiffEditor] Initial layout with explicit dimensions')

    // Get both editors to verify initialization
    const original = diffEditor.getOriginalEditor()
    const modified = diffEditor.getModifiedEditor()
    console.log('[createDiffEditor] Original editor:', original ? 'initialized' : 'null')
    console.log('[createDiffEditor] Modified editor:', modified ? 'initialized' : 'null')

    if (original && modified) {
      const origDom = original.getDomNode()
      const modDom = modified.getDomNode()
      console.log('[createDiffEditor] Original DOM size:', origDom?.offsetWidth, 'x', origDom?.offsetHeight)
      console.log('[createDiffEditor] Modified DOM size:', modDom?.offsetWidth, 'x', modDom?.offsetHeight)

      // If individual editors have no height, force individual layouts
      if (!origDom?.offsetHeight || !modDom?.offsetHeight) {
        console.log('[createDiffEditor] Editors have no height, forcing individual layouts')
        const halfWidth = Math.floor(width / 2)
        original.layout({ width: halfWidth, height })
        modified.layout({ width: halfWidth, height })
        console.log('[createDiffEditor] Forced individual layouts with dimensions:', halfWidth, 'x', height)

        // Check again after individual layouts
        setTimeout(() => {
          console.log('[createDiffEditor] After individual layouts:')
          console.log('[createDiffEditor]   Original DOM size:', origDom?.offsetWidth, 'x', origDom?.offsetHeight)
          console.log('[createDiffEditor]   Modified DOM size:', modDom?.offsetWidth, 'x', modDom?.offsetHeight)

          // Force one more global layout
          diffEditor.layout({ width, height })
        }, 100)
      }
    }

    // Additional layout after longer delay
    setTimeout(() => {
      diffEditor.layout({ width, height })
      console.log('[createDiffEditor] Final layout triggered')
    }, 200)
  }, 300)

  return diffEditor
}

/**
 * Get diff statistics from a diff editor
 */
export function getDiffStats(
  diffEditor: monaco.editor.IStandaloneDiffEditor
): {
  additions: number
  deletions: number
  modifications: number
} {
  const lineChanges = diffEditor.getLineChanges() || []
  console.log('[getDiffStats] Line changes:', lineChanges, 'Count:', lineChanges.length)

  let additions = 0
  let deletions = 0
  let modifications = 0

  for (const change of lineChanges) {
    console.log('[getDiffStats] Processing change:', change)
    const originalLength = change.originalEndLineNumber - change.originalStartLineNumber + 1
    const modifiedLength = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1

    if (originalLength === 0) {
      // Pure addition
      additions += modifiedLength
    } else if (modifiedLength === 0) {
      // Pure deletion
      deletions += originalLength
    } else {
      // Modification
      modifications += Math.max(originalLength, modifiedLength)
    }
  }

  return { additions, deletions, modifications }
}

// ============================================================================
// 3. CHANGE TRACKING (Unsaved Edits with Gutter Markers)
// ============================================================================

/**
 * Enable change tracking for an editor with manual diff computation
 * Returns a tracker object with methods to check for changes and apply gutter markers
 */
export function enableChangeTracking(
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  originalText: string
): {
  getChanges: () => { modified: number[]; added: number[]; deleted: number[] }
  hasChanges: () => boolean
  applyGutterMarkers: () => string[]
  clearGutterMarkers: () => void
  reset: () => void
  getBaseline: () => string
  revertToBaseline: () => void
} {
  console.log('[monacoDiff] enableChangeTracking called with originalText:', originalText.substring(0, 100) + '...')

  const model = editor.getModel()
  if (!model) {
    console.log('[monacoDiff] No model found, returning empty tracker')
    return {
      getChanges: () => ({ modified: [], added: [], deleted: [] }),
      hasChanges: () => false,
      applyGutterMarkers: () => [],
      clearGutterMarkers: () => {},
      reset: () => {},
      getBaseline: () => '',
      revertToBaseline: () => {}
    }
  }

  console.log('[monacoDiff] Model found, initializing change tracking')
  let baseline = originalText
  let gutterDecorations: string[] = []

  const getChanges = () => {
    const currentText = model.getValue()

    console.log('[monacoDiff] getChanges called')
    console.log('[monacoDiff] Baseline text:', baseline.substring(0, 100) + '...')
    console.log('[monacoDiff] Current text:', currentText.substring(0, 100) + '...')

    const modified: number[] = []
    const added: number[] = []
    const deleted: number[] = []

    // Use diff library for reliable line-based diffing
    const changes = diffLines(baseline, currentText)

    // Track deletions by position so we can detect modifications
    interface DeletionInfo {
      position: number
      count: number
    }
    const deletions: DeletionInfo[] = []
    const additions: Array<{ start: number; count: number }> = []

    let lineNumber = 1 // Current line number in the modified file

    // First pass: collect all changes with their positions
    for (const change of changes) {
      const lineCount = change.count || 0

      if (change.added) {
        // Track addition position
        additions.push({ start: lineNumber, count: lineCount })
        lineNumber += lineCount
      } else if (change.removed) {
        // Track deletion position (where it appears in modified file)
        deletions.push({ position: lineNumber, count: lineCount })
        // Don't increment lineNumber for deletions
      } else {
        // Lines are unchanged - just advance lineNumber
        lineNumber += lineCount
      }
    }

    console.log('[monacoDiff] Raw deletions:', deletions)
    console.log('[monacoDiff] Raw additions:', additions)

    // Second pass: detect modifications (delete + add at same position)
    const processedAdditions = new Set<number>()
    const processedDeletions = new Set<number>()

    // Look for deletions followed by additions at the same position
    for (let i = 0; i < deletions.length; i++) {
      const deletion = deletions[i]

      // Find matching addition at same position
      const matchingAddition = additions.find((add, idx) =>
        !processedAdditions.has(idx) && add.start === deletion.position
      )

      if (matchingAddition) {
        // This is a modification, not separate delete + add
        const modificationCount = Math.max(deletion.count, matchingAddition.count)

        // Mark all affected lines as modified
        for (let j = 0; j < modificationCount; j++) {
          const modifiedLine = matchingAddition.start + j
          if (modifiedLine <= model.getLineCount()) {
            modified.push(modifiedLine)
          }
        }

        // Mark these as processed
        processedDeletions.add(i)
        const addIdx = additions.indexOf(matchingAddition)
        if (addIdx >= 0) processedAdditions.add(addIdx)

        console.log('[monacoDiff] Detected modification at line', matchingAddition.start, 'count:', modificationCount)
      }
    }

    // Add remaining additions (not part of modifications)
    additions.forEach((addition, idx) => {
      if (!processedAdditions.has(idx)) {
        for (let i = 0; i < addition.count; i++) {
          added.push(addition.start + i)
        }
      }
    })

    // Add remaining deletions (not part of modifications)
    deletions.forEach((deletion, idx) => {
      if (!processedDeletions.has(idx)) {
        // Show deletion marker at the position where the deletion occurred
        const markerLine = deletion.position > 1 ? deletion.position - 1 : 1
        if (!deleted.includes(markerLine)) {
          deleted.push(markerLine)
        }
      }
    })

    console.log('[monacoDiff] Computed changes:', { modified, added, deleted })
    return { modified, added, deleted }
  }

  const hasChanges = () => {
    const changes = getChanges()
    const result = changes.modified.length > 0 || changes.added.length > 0 || changes.deleted.length > 0
    console.log('[monacoDiff] hasChanges called, result:', result, 'changes:', changes)
    return result
  }

  const applyGutterMarkers = () => {
    console.log('[monacoDiff] applyGutterMarkers called')
    const changes = getChanges()
    const decorations: monaco.editor.IModelDeltaDecoration[] = []

    // Check if glyph margin is enabled
    const editorOptions = editor.getOptions()
    const glyphMarginEnabled = editorOptions.get(monaco.editor.EditorOption.glyphMargin)
    console.log('[monacoDiff] Glyph margin enabled:', glyphMarginEnabled)

    // Apply green bars for added lines (use linesDecorationsClassName instead)
    for (const lineNumber of changes.added) {
      const maxColumn = model.getLineMaxColumn(lineNumber)
      decorations.push({
        range: new monaco.Range(lineNumber, 1, lineNumber, maxColumn),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'change-tracking-added-line',
          glyphMarginHoverMessage: { value: `Added line ${lineNumber}` }
        }
      })
    }

    // Apply blue bars for modified lines
    for (const lineNumber of changes.modified) {
      const maxColumn = model.getLineMaxColumn(lineNumber)
      decorations.push({
        range: new monaco.Range(lineNumber, 1, lineNumber, maxColumn),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'change-tracking-modified-line',
          glyphMarginHoverMessage: { value: `Modified line ${lineNumber}` }
        }
      })
    }

    // Apply red indicators for deleted lines
    for (const lineNumber of changes.deleted) {
      const maxColumn = model.getLineMaxColumn(lineNumber)
      decorations.push({
        range: new monaco.Range(lineNumber, 1, lineNumber, maxColumn),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'change-tracking-deleted-line',
          glyphMarginHoverMessage: { value: `Deleted line ${lineNumber}` }
        }
      })
    }

    console.log('[monacoDiff] Created decorations:', decorations.length, 'decorations')
    console.log('[monacoDiff] Decoration details:', decorations)

    // Clear old decorations and apply new ones
    gutterDecorations = editor.deltaDecorations(gutterDecorations, decorations)
    console.log('[monacoDiff] Applied decorations, IDs:', gutterDecorations)

    // Check if decorations actually exist in the model
    const allDecorations = model.getAllDecorations()
    console.log('[monacoDiff] All model decorations count:', allDecorations.length)
    const ourDecorations = allDecorations.filter(d => gutterDecorations.includes(d.id))
    console.log('[monacoDiff] Our decorations in model:', ourDecorations)

    // Check DOM for glyph margin elements
    setTimeout(() => {
      const editorDom = editor.getDomNode()
      const glyphMarginDom = editorDom?.querySelector('.margin-view-overlays')
      console.log('[monacoDiff] Glyph margin DOM element:', glyphMarginDom)
      console.log('[monacoDiff] Glyph margin innerHTML:', glyphMarginDom?.innerHTML.substring(0, 500))
    }, 100)

    return gutterDecorations
  }

  const clearGutterMarkers = () => {
    editor.deltaDecorations(gutterDecorations, [])
    gutterDecorations = []
  }

  const reset = () => {
    baseline = model.getValue()
    clearGutterMarkers()
  }

  const getBaseline = () => {
    return baseline
  }

  const revertToBaseline = () => {
    model.setValue(baseline)
    clearGutterMarkers()
  }

  return {
    getChanges,
    hasChanges,
    applyGutterMarkers,
    clearGutterMarkers,
    reset,
    getBaseline,
    revertToBaseline
  }
}

/**
 * Get current change markers (DEPRECATED - use enableChangeTracking tracker object instead)
 * Returns ranges of modified/added/deleted lines
 */
export function getChangeMarkers(
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor')
): {
  modified: monaco.Range[]
  added: monaco.Range[]
  deleted: monaco.Range[]
} {
  console.warn('[getChangeMarkers] DEPRECATED: Use enableChangeTracking().getChanges() instead')
  return { modified: [], added: [], deleted: [] }
}

/**
 * Reset change tracking (clear all gutter markers)
 */
export function resetChangeTracking(
  editor: monaco.editor.IStandaloneCodeEditor
): void {
  const model = editor.getModel()
  if (!model) return

  // Set current text as new baseline
  const currentText = model.getValue()
  model.setValue(currentText)

  // All gutter markers will be cleared
}

// ============================================================================
// DIFF PREVIEW COMPONENT HELPERS
// ============================================================================

/**
 * Create inline diff preview overlay
 * Shows changes without modifying the editor
 */
export function showDiffPreview(
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  previewText: string
): {
  decorations: string[]
  dispose: () => void
} {
  const model = editor.getModel()
  if (!model) return { decorations: [], dispose: () => {} }

  // Save original text to restore later
  const originalText = model.getValue()

  console.log('[showDiffPreview] Original text:', originalText)
  console.log('[showDiffPreview] Preview text:', previewText)

  // Update editor to show the preview text
  model.setValue(previewText)

  // Compute diff between original and preview
  const changes = computeInlineDiff(monaco, originalText, previewText, model.getLanguageId())
  const decorations = applyDiffDecorations(editor, monaco, changes)

  return {
    decorations,
    dispose: () => {
      // Clear decorations
      editor.deltaDecorations(decorations, [])
      // Restore original text
      model.setValue(originalText)
      console.log('[showDiffPreview] Restored original text')
    }
  }
}

/**
 * Apply diff changes (replace editor content)
 */
export function applyDiff(
  editor: monaco.editor.IStandaloneCodeEditor,
  newText: string
): void {
  const model = editor.getModel()
  if (!model) return

  model.pushEditOperations(
    [],
    [{
      range: model.getFullModelRange(),
      text: newText
    }],
    () => null
  )
}
