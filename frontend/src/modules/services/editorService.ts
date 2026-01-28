/**
 * Editor Service - Handles LLM suggestion types for the AI Chat Panel
 *
 * This service provides clean handlers for applying different types of
 * suggestions from the LLM to the editor content.
 */

export interface Suggestion {
  type: 'new-file' | 'edit-existing' | 'search-keywords' | 'none'
  content?: string
  language?: string
  filename?: string
  lineNumbers?: number[]  // [startLine, endLine] - 1-indexed
  keywords?: string[]
}

export interface EditResult {
  success: boolean
  newText?: string
  message: string
  linesAffected?: { start: number; end: number }
}

export interface NewFileResult {
  success: boolean
  content: string
  filename: string
  message: string
}

/**
 * Apply a line-based edit to text content
 *
 * @param currentText - The current text content
 * @param suggestion - The suggestion containing content and line numbers
 * @returns EditResult with the new text or error message
 */
export function applyEdit(currentText: string, suggestion: Suggestion): EditResult {
  if (!suggestion.content) {
    return {
      success: false,
      message: 'No content provided in suggestion'
    }
  }

  const lines = currentText.split('\n')

  // Check if lineNumbers are provided for targeted replacement
  if (suggestion.lineNumbers && Array.isArray(suggestion.lineNumbers) && suggestion.lineNumbers.length >= 2) {
    let [startLine, endLine] = suggestion.lineNumbers

    // Handle line 0 as line 1 (beginning of file)
    // The AI sometimes returns 0 for new/empty files
    if (startLine === 0) {
      startLine = 1
    }
    if (endLine === 0) {
      endLine = 1
    }

    // Validate line numbers
    if (startLine < 1) {
      return {
        success: false,
        message: `Invalid start line: ${startLine}. Line numbers must be 1 or greater.`
      }
    }

    // lineNumbers are 1-indexed from the LLM, convert to 0-indexed
    const startIdx = Math.max(0, startLine - 1)
    const endIdx = Math.min(lines.length - 1, endLine - 1)

    // Handle case where startLine is beyond current content (append)
    if (startIdx >= lines.length) {
      const newContentLines = suggestion.content.split('\n')
      const newText = [...lines, ...newContentLines].join('\n')
      return {
        success: true,
        newText,
        message: `Content appended after line ${lines.length}`,
        linesAffected: { start: lines.length + 1, end: lines.length + newContentLines.length }
      }
    }

    // Split the new content into lines
    const newContentLines = suggestion.content.split('\n')

    // Replace the specified range with new content
    const beforeLines = lines.slice(0, startIdx)
    const afterLines = lines.slice(endIdx + 1)
    const newText = [...beforeLines, ...newContentLines, ...afterLines].join('\n')

    return {
      success: true,
      newText,
      message: `Lines ${startLine}-${endLine} replaced`,
      linesAffected: { start: startLine, end: startLine + newContentLines.length - 1 }
    }
  }

  // Fallback: append if no line numbers provided
  const newText = currentText + '\n' + suggestion.content
  const newContentLines = suggestion.content.split('\n')

  return {
    success: true,
    newText,
    message: 'Content appended to end of file (no line numbers specified)',
    linesAffected: { start: lines.length + 1, end: lines.length + newContentLines.length }
  }
}

/**
 * Validate and prepare a new file suggestion
 *
 * @param suggestion - The suggestion containing content and filename
 * @returns NewFileResult with validated content or error message
 */
export function prepareNewFile(suggestion: Suggestion): NewFileResult {
  if (!suggestion.content) {
    return {
      success: false,
      content: '',
      filename: '',
      message: 'No content provided for new file'
    }
  }

  if (!suggestion.filename) {
    return {
      success: false,
      content: '',
      filename: '',
      message: 'No filename provided for new file'
    }
  }

  // Ensure filename has .prmd extension
  let filename = suggestion.filename
  if (!filename.endsWith('.prmd')) {
    filename = filename + '.prmd'
  }

  // Sanitize filename (remove invalid characters)
  filename = filename.replace(/[<>:"/\\|?*]/g, '-')

  return {
    success: true,
    content: suggestion.content,
    filename,
    message: `New file ready: ${filename}`
  }
}

/**
 * Extract and validate search keywords from a suggestion
 *
 * @param suggestion - The suggestion containing keywords
 * @returns Array of validated keywords or empty array
 */
export function extractSearchKeywords(suggestion: Suggestion): string[] {
  if (!suggestion.keywords || !Array.isArray(suggestion.keywords)) {
    return []
  }

  // Filter out empty strings and trim whitespace
  return suggestion.keywords
    .map(kw => kw.trim())
    .filter(kw => kw.length > 0)
    .slice(0, 10) // Limit to 10 keywords max
}

/**
 * Determine if a suggestion requires user action
 *
 * @param suggestion - The suggestion to check
 * @returns Whether the suggestion needs user confirmation
 */
export function requiresUserAction(suggestion: Suggestion): boolean {
  switch (suggestion.type) {
    case 'new-file':
      return true // User should confirm new file creation
    case 'edit-existing':
      return true // User should review edits before applying
    case 'search-keywords':
      return false // Auto-search can happen automatically
    case 'none':
      return false // No action needed
    default:
      return false
  }
}

/**
 * Format a suggestion for display in the UI
 *
 * @param suggestion - The suggestion to format
 * @returns Human-readable description of the suggestion
 */
export function formatSuggestionDescription(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case 'new-file':
      return `Create new file: ${suggestion.filename || 'untitled.prmd'}`
    case 'edit-existing':
      if (suggestion.lineNumbers && suggestion.lineNumbers.length >= 2) {
        return `Edit lines ${suggestion.lineNumbers[0]}-${suggestion.lineNumbers[1]}`
      }
      return 'Append content to file'
    case 'search-keywords':
      const keywords = suggestion.keywords?.slice(0, 3).join(', ') || ''
      return `Search registry for: ${keywords}${(suggestion.keywords?.length || 0) > 3 ? '...' : ''}`
    case 'none':
      return 'No changes suggested'
    default:
      return 'Unknown suggestion type'
  }
}
