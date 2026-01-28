import { useMemo, useEffect, useRef } from 'react'
import { Check, X, ChevronUp, ChevronDown } from 'lucide-react'
import { DiffEditor } from '@monaco-editor/react'

interface DiffViewProps {
  originalText: string
  proposedText: string
  lineNumbers?: [number, number]  // [startLine, endLine] - 1-indexed
  language?: string
  onAccept: () => void
  onDecline: () => void
  theme?: 'light' | 'dark'
}

/**
 * Inline Diff Peek Widget - VS Code style diff view
 * Shows proposed changes inline in the editor with accept/decline actions
 */
export function InlineDiffPeek({
  originalText,
  proposedText,
  lineNumbers,
  language = 'yaml',
  onAccept,
  onDecline,
  theme = 'dark'
}: DiffViewProps) {
  const diffEditorRef = useRef<any>(null)

  // Extract only the relevant portion of original text based on lineNumbers
  const { originalSection, lineInfo } = useMemo(() => {
    if (!lineNumbers || lineNumbers.length < 2) {
      return { originalSection: originalText, lineInfo: 'Full file' }
    }

    const [startLine, endLine] = lineNumbers
    const lines = originalText.split('\n')
    const contextBefore = 2
    const contextAfter = 2

    const actualStart = Math.max(0, startLine - 1 - contextBefore)
    const actualEnd = Math.min(lines.length, endLine + contextAfter)

    // Get the lines that will be replaced (without context)
    const replacedLines = lines.slice(startLine - 1, endLine).join('\n')

    return {
      originalSection: replacedLines,
      lineInfo: `Lines ${startLine}-${endLine}`
    }
  }, [originalText, lineNumbers])

  const colors = theme === 'dark' ? {
    bg: '#0f172a',
    headerBg: '#1e293b',
    border: 'rgba(71, 85, 105, 0.5)',
    text: '#e2e8f0',
    mutedText: '#94a3b8',
    addedCount: '#4ade80',
    removedCount: '#f87171'
  } : {
    bg: '#ffffff',
    headerBg: '#f8fafc',
    border: '#e2e8f0',
    text: '#0f172a',
    mutedText: '#64748b',
    addedCount: '#16a34a',
    removedCount: '#dc2626'
  }

  // Count changes
  const addedLines = proposedText.split('\n').length
  const removedLines = originalSection.split('\n').length

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
      background: colors.bg,
      boxShadow: theme === 'dark'
        ? '0 4px 20px rgba(0, 0, 0, 0.4)'
        : '0 4px 20px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header with actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: colors.headerBg,
        borderBottom: `1px solid ${colors.border}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px'
        }}>
          <span style={{ fontWeight: 600, color: colors.text }}>
            Proposed Changes
          </span>
          <span style={{ color: colors.mutedText }}>
            {lineInfo}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: colors.addedCount, display: 'flex', alignItems: 'center', gap: '2px' }}>
              <ChevronUp size={12} /> {addedLines}
            </span>
            <span style={{ color: colors.removedCount, display: 'flex', alignItems: 'center', gap: '2px' }}>
              <ChevronDown size={12} /> {removedLines}
            </span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onDecline}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              color: colors.text,
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2'
              e.currentTarget.style.borderColor = colors.removedCount
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = colors.border
            }}
          >
            <X size={14} />
            Decline
          </button>
          <button
            onClick={onAccept}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              background: '#22c55e',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#16a34a'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#22c55e'
            }}
          >
            <Check size={14} />
            Accept
          </button>
        </div>
      </div>

      {/* Monaco Diff Editor */}
      <div style={{ height: '250px' }}>
        <DiffEditor
          original={originalSection}
          modified={proposedText}
          language={language === 'prmd' || language === 'prompd' ? 'yaml' : language}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          onMount={(editor) => {
            diffEditorRef.current = editor
          }}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
            folding: false,
            renderOverviewRuler: false,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            },
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false
          }}
        />
      </div>
    </div>
  )
}

interface SimpleDiffLine {
  type: 'unchanged' | 'removed' | 'added' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

/**
 * Compute a simple line-based diff between original and proposed content
 */
function computeLineDiff(
  originalText: string,
  proposedText: string,
  lineRange?: [number, number]
): SimpleDiffLine[] {
  const originalLines = originalText.split('\n')
  const proposedLines = proposedText.split('\n')
  const diffLines: SimpleDiffLine[] = []

  // If we have a specific line range, show context around the change
  if (lineRange) {
    const [startLine, endLine] = lineRange
    const contextSize = 3 // Show 3 lines before and after

    // Lines before the change (context)
    const contextStart = Math.max(0, startLine - 1 - contextSize)
    for (let i = contextStart; i < startLine - 1; i++) {
      if (originalLines[i] !== undefined) {
        diffLines.push({
          type: 'context',
          content: originalLines[i],
          oldLineNumber: i + 1,
          newLineNumber: i + 1
        })
      }
    }

    // Removed lines (from original)
    for (let i = startLine - 1; i <= endLine - 1 && i < originalLines.length; i++) {
      diffLines.push({
        type: 'removed',
        content: originalLines[i],
        oldLineNumber: i + 1
      })
    }

    // Added lines (from proposed - the new content)
    proposedLines.forEach((line, idx) => {
      diffLines.push({
        type: 'added',
        content: line,
        newLineNumber: startLine + idx
      })
    })

    // Lines after the change (context)
    const contextEnd = Math.min(originalLines.length, endLine + contextSize)
    for (let i = endLine; i < contextEnd; i++) {
      if (originalLines[i] !== undefined) {
        // Calculate the new line number accounting for the difference in line count
        const lineCountDiff = proposedLines.length - (endLine - startLine + 1)
        diffLines.push({
          type: 'context',
          content: originalLines[i],
          oldLineNumber: i + 1,
          newLineNumber: i + 1 + lineCountDiff
        })
      }
    }
  } else {
    // Full file diff - simple line-by-line comparison using LCS approach
    // For now, use a simpler approach: show all original as removed, all proposed as added
    // This works well for append operations

    // Find common prefix
    let commonPrefixLength = 0
    const minLength = Math.min(originalLines.length, proposedLines.length)
    while (commonPrefixLength < minLength && originalLines[commonPrefixLength] === proposedLines[commonPrefixLength]) {
      commonPrefixLength++
    }

    // Find common suffix (from the end)
    let commonSuffixLength = 0
    while (
      commonSuffixLength < minLength - commonPrefixLength &&
      originalLines[originalLines.length - 1 - commonSuffixLength] === proposedLines[proposedLines.length - 1 - commonSuffixLength]
    ) {
      commonSuffixLength++
    }

    // Context before changes
    const contextStart = Math.max(0, commonPrefixLength - 3)
    for (let i = contextStart; i < commonPrefixLength; i++) {
      diffLines.push({
        type: 'context',
        content: originalLines[i],
        oldLineNumber: i + 1,
        newLineNumber: i + 1
      })
    }

    // Removed lines (middle section of original that differs)
    const removedEnd = originalLines.length - commonSuffixLength
    for (let i = commonPrefixLength; i < removedEnd; i++) {
      diffLines.push({
        type: 'removed',
        content: originalLines[i],
        oldLineNumber: i + 1
      })
    }

    // Added lines (middle section of proposed that differs)
    const addedEnd = proposedLines.length - commonSuffixLength
    for (let i = commonPrefixLength; i < addedEnd; i++) {
      diffLines.push({
        type: 'added',
        content: proposedLines[i],
        newLineNumber: i + 1
      })
    }

    // Context after changes
    const contextEndStart = proposedLines.length - commonSuffixLength
    const contextEndLimit = Math.min(proposedLines.length, contextEndStart + 3)
    for (let i = contextEndStart; i < contextEndLimit; i++) {
      diffLines.push({
        type: 'context',
        content: proposedLines[i],
        oldLineNumber: originalLines.length - commonSuffixLength + (i - contextEndStart) + 1,
        newLineNumber: i + 1
      })
    }
  }

  return diffLines
}

export default function DiffView({
  originalText,
  proposedText,
  lineNumbers,
  language,
  onAccept,
  onDecline,
  theme = 'dark'
}: DiffViewProps) {
  const diffLines = useMemo(() => {
    return computeLineDiff(originalText, proposedText, lineNumbers)
  }, [originalText, proposedText, lineNumbers])

  const addedCount = diffLines.filter(l => l.type === 'added').length
  const removedCount = diffLines.filter(l => l.type === 'removed').length

  const colors = {
    light: {
      bg: '#ffffff',
      border: '#e2e8f0',
      headerBg: '#f8fafc',
      addedBg: '#dcfce7',
      addedText: '#166534',
      addedGutter: '#bbf7d0',
      removedBg: '#fee2e2',
      removedText: '#991b1b',
      removedGutter: '#fecaca',
      contextBg: 'transparent',
      contextText: '#64748b',
      lineNumber: '#94a3b8',
      text: '#0f172a'
    },
    dark: {
      bg: '#0f172a',
      border: 'rgba(71, 85, 105, 0.3)',
      headerBg: '#1e293b',
      addedBg: 'rgba(34, 197, 94, 0.15)',
      addedText: '#4ade80',
      addedGutter: 'rgba(34, 197, 94, 0.3)',
      removedBg: 'rgba(239, 68, 68, 0.15)',
      removedText: '#f87171',
      removedGutter: 'rgba(239, 68, 68, 0.3)',
      contextBg: 'transparent',
      contextText: '#64748b',
      lineNumber: '#475569',
      text: '#e2e8f0'
    }
  }

  const c = colors[theme]

  return (
    <div style={{
      border: `1px solid ${c.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
      fontSize: '13px',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
      background: c.bg,
      marginTop: '12px',
      marginBottom: '12px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: c.headerBg,
        borderBottom: `1px solid ${c.border}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px'
        }}>
          <span style={{ fontWeight: 600, color: c.text }}>
            Proposed Changes
          </span>
          {lineNumbers && (
            <span style={{ color: c.lineNumber }}>
              Lines {lineNumbers[0]}-{lineNumbers[1]}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {addedCount > 0 && (
              <span style={{ color: c.addedText, display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ChevronUp size={12} /> {addedCount}
              </span>
            )}
            {removedCount > 0 && (
              <span style={{ color: c.removedText, display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ChevronDown size={12} /> {removedCount}
              </span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onDecline}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              background: 'transparent',
              border: `1px solid ${c.border}`,
              borderRadius: '6px',
              color: c.text,
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = c.removedBg
              e.currentTarget.style.borderColor = c.removedText
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = c.border
            }}
          >
            <X size={14} />
            Decline
          </button>
          <button
            onClick={onAccept}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              background: '#22c55e',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#16a34a'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#22c55e'
            }}
          >
            <Check size={14} />
            Accept
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div style={{
        maxHeight: '400px',
        overflow: 'auto'
      }}>
        {diffLines.length === 0 ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: c.contextText
          }}>
            No changes detected
          </div>
        ) : (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed'
          }}>
            <tbody>
              {diffLines.map((line, idx) => {
                let bgColor = c.contextBg
                let textColor = c.text
                let gutterBg = 'transparent'
                let prefix = ' '

                if (line.type === 'added') {
                  bgColor = c.addedBg
                  textColor = c.addedText
                  gutterBg = c.addedGutter
                  prefix = '+'
                } else if (line.type === 'removed') {
                  bgColor = c.removedBg
                  textColor = c.removedText
                  gutterBg = c.removedGutter
                  prefix = '-'
                } else if (line.type === 'context') {
                  textColor = c.contextText
                }

                return (
                  <tr key={idx} style={{ background: bgColor }}>
                    {/* Old line number */}
                    <td style={{
                      width: '40px',
                      padding: '2px 8px',
                      textAlign: 'right',
                      color: c.lineNumber,
                      background: gutterBg,
                      userSelect: 'none',
                      borderRight: `1px solid ${c.border}`,
                      fontSize: '11px'
                    }}>
                      {line.type !== 'added' ? line.oldLineNumber : ''}
                    </td>
                    {/* New line number */}
                    <td style={{
                      width: '40px',
                      padding: '2px 8px',
                      textAlign: 'right',
                      color: c.lineNumber,
                      background: gutterBg,
                      userSelect: 'none',
                      borderRight: `1px solid ${c.border}`,
                      fontSize: '11px'
                    }}>
                      {line.type !== 'removed' ? line.newLineNumber : ''}
                    </td>
                    {/* Prefix */}
                    <td style={{
                      width: '20px',
                      padding: '2px 4px',
                      textAlign: 'center',
                      color: textColor,
                      fontWeight: 600,
                      userSelect: 'none'
                    }}>
                      {prefix}
                    </td>
                    {/* Content */}
                    <td style={{
                      padding: '2px 8px',
                      color: textColor,
                      whiteSpace: 'pre',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {line.content || ' '}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Language hint */}
      {language && (
        <div style={{
          padding: '6px 12px',
          borderTop: `1px solid ${c.border}`,
          background: c.headerBg,
          fontSize: '11px',
          color: c.lineNumber
        }}>
          {language}
        </div>
      )}
    </div>
  )
}
