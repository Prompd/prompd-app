import React, { useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Code,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  UnfoldVertical,
  FoldVertical,
  Copy,
  AlertCircle
} from 'lucide-react'

/**
 * XmlDesignView - Visual tree editor for XML content in .prmd files
 *
 * Displays XML as an interactive tree with:
 * - Collapsible nodes for elements
 * - Inline editing for attributes and text content
 * - Add/remove elements and attributes
 * - Visual nesting with indent guides
 */

interface XmlNode {
  type: 'element' | 'text' | 'comment'
  name?: string
  attributes?: Record<string, string>
  children?: XmlNode[]
  content?: string
  // Internal tracking
  _id: string
  _depth: number
}

interface XmlDesignViewProps {
  /** Raw XML content (body only, not frontmatter) */
  xmlContent: string
  /** Callback when XML content changes */
  onChange: (newXml: string) => void
  /** Theme for styling */
  theme: 'light' | 'dark'
  /** Whether editing is disabled */
  readOnly?: boolean
}

/** Ref handle for XmlDesignView to allow external control */
export interface XmlDesignViewHandle {
  /** Expand all ancestor nodes to make a node at the given index visible */
  expandToNodeIndex: (index: number) => void
  /** Get the node ID at the given index */
  getNodeIdAtIndex: (index: number) => string | null
}

// Generate unique IDs for nodes - use path-based for stability during re-parses
let nodeIdCounter = 0
const generateNodeId = () => `node-${++nodeIdCounter}`
// Generate a path-based stable ID for a node
const generateStableId = (path: string, index: number) => `${path}/${index}`

/**
 * Simple XML parser that converts XML string to node tree
 * Handles elements, attributes, text content, and comments
 */
function parseXml(xml: string, depth = 0): XmlNode[] {
  const nodes: XmlNode[] = []
  let remaining = xml.trim()

  while (remaining.length > 0) {
    // Check for comment
    if (remaining.startsWith('<!--')) {
      const endIdx = remaining.indexOf('-->')
      if (endIdx !== -1) {
        nodes.push({
          type: 'comment',
          content: remaining.substring(4, endIdx).trim(),
          _id: generateNodeId(),
          _depth: depth
        })
        remaining = remaining.substring(endIdx + 3).trim()
        continue
      }
    }

    // Check for element
    if (remaining.startsWith('<') && !remaining.startsWith('</')) {
      const tagMatch = remaining.match(/^<([a-zA-Z_][\w.-]*)((?:\s+[^>]*?)?)(\/?)\s*>/)
      if (tagMatch) {
        const [fullMatch, tagName, attrString, selfClosing] = tagMatch
        const attributes: Record<string, string> = {}

        // Parse attributes
        const attrRegex = /([a-zA-Z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
        let attrMatch
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
          attributes[attrMatch[1]] = attrMatch[2] ?? attrMatch[3] ?? ''
        }

        remaining = remaining.substring(fullMatch.length)

        if (selfClosing) {
          // Self-closing tag
          nodes.push({
            type: 'element',
            name: tagName,
            attributes,
            children: [],
            _id: generateNodeId(),
            _depth: depth
          })
        } else {
          // Find closing tag
          const closingTag = `</${tagName}>`
          let nestLevel = 1
          let searchIdx = 0
          let contentEnd = -1

          while (nestLevel > 0 && searchIdx < remaining.length) {
            const nextOpen = remaining.indexOf(`<${tagName}`, searchIdx)
            const nextClose = remaining.indexOf(closingTag, searchIdx)

            if (nextClose === -1) break

            if (nextOpen !== -1 && nextOpen < nextClose) {
              // Check if it's actually an opening tag (not just substring)
              const afterOpen = remaining[nextOpen + tagName.length + 1]
              if (afterOpen === '>' || afterOpen === ' ' || afterOpen === '/') {
                nestLevel++
              }
              searchIdx = nextOpen + 1
            } else {
              nestLevel--
              if (nestLevel === 0) {
                contentEnd = nextClose
              }
              searchIdx = nextClose + 1
            }
          }

          if (contentEnd !== -1) {
            const innerContent = remaining.substring(0, contentEnd)
            remaining = remaining.substring(contentEnd + closingTag.length).trim()

            // Parse children recursively
            const children = parseXml(innerContent, depth + 1)

            nodes.push({
              type: 'element',
              name: tagName,
              attributes,
              children,
              _id: generateNodeId(),
              _depth: depth
            })
          }
        }
        continue
      }
    }

    // Check for closing tag (shouldn't happen at top level, skip)
    if (remaining.startsWith('</')) {
      const endIdx = remaining.indexOf('>')
      if (endIdx !== -1) {
        remaining = remaining.substring(endIdx + 1).trim()
        continue
      }
    }

    // Text content
    const nextTag = remaining.indexOf('<')
    if (nextTag === -1) {
      // Rest is text
      const text = remaining.trim()
      if (text) {
        nodes.push({
          type: 'text',
          content: text,
          _id: generateNodeId(),
          _depth: depth
        })
      }
      break
    } else if (nextTag > 0) {
      const text = remaining.substring(0, nextTag).trim()
      if (text) {
        nodes.push({
          type: 'text',
          content: text,
          _id: generateNodeId(),
          _depth: depth
        })
      }
      remaining = remaining.substring(nextTag)
    } else {
      // Malformed, skip character
      remaining = remaining.substring(1)
    }
  }

  return nodes
}

/**
 * Serialize node tree back to XML string
 */
function serializeXml(nodes: XmlNode[], indent = 0): string {
  const indentStr = '  '.repeat(indent)
  let result = ''

  for (const node of nodes) {
    if (node.type === 'comment') {
      result += `${indentStr}<!-- ${node.content} -->\n`
    } else if (node.type === 'text') {
      result += `${indentStr}${node.content}\n`
    } else if (node.type === 'element') {
      const attrs = Object.entries(node.attributes || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      const attrStr = attrs ? ` ${attrs}` : ''

      if (!node.children || node.children.length === 0) {
        result += `${indentStr}<${node.name}${attrStr}/>\n`
      } else if (node.children.length === 1 && node.children[0].type === 'text') {
        // Single text child - inline
        result += `${indentStr}<${node.name}${attrStr}>${node.children[0].content}</${node.name}>\n`
      } else {
        result += `${indentStr}<${node.name}${attrStr}>\n`
        result += serializeXml(node.children, indent + 1)
        result += `${indentStr}</${node.name}>\n`
      }
    }
  }

  return result
}

/**
 * Single XML node component (recursive)
 */
interface XmlNodeViewProps {
  node: XmlNode
  onUpdate: (nodeId: string, updates: Partial<XmlNode>) => void
  onDelete: (nodeId: string) => void
  onAddChild: (parentId: string, nodeType: 'element' | 'text') => void
  onAddAttribute: (nodeId: string, name: string, value: string) => void
  onDeleteAttribute: (nodeId: string, attrName: string) => void
  theme: 'light' | 'dark'
  colors: ReturnType<typeof getColors>
  readOnly: boolean
  expandedNodes: Set<string>
  toggleExpanded: (nodeId: string) => void
}

function XmlNodeView({
  node,
  onUpdate,
  onDelete,
  onAddChild,
  onAddAttribute,
  onDeleteAttribute,
  theme,
  colors,
  readOnly,
  expandedNodes,
  toggleExpanded
}: XmlNodeViewProps) {
  const [editingAttr, setEditingAttr] = useState<string | null>(null)
  const [editingAttrValue, setEditingAttrValue] = useState('')
  const [editingText, setEditingText] = useState(false)
  const [editTextValue, setEditTextValue] = useState('')
  const [addingAttr, setAddingAttr] = useState(false)
  const [newAttrName, setNewAttrName] = useState('')
  const [newAttrValue, setNewAttrValue] = useState('')
  const [editingTagName, setEditingTagName] = useState(false)
  const [editTagNameValue, setEditTagNameValue] = useState('')

  const isExpanded = expandedNodes.has(node._id)
  const hasChildren = node.children && node.children.length > 0
  const indent = node._depth * 16

  // Start editing attribute
  const startEditAttr = (attrName: string, attrValue: string) => {
    if (readOnly) return
    setEditingAttr(attrName)
    setEditingAttrValue(attrValue)
  }

  // Save attribute edit
  const saveAttrEdit = () => {
    if (editingAttr && node.attributes) {
      const newAttrs = { ...node.attributes }
      newAttrs[editingAttr] = editingAttrValue
      onUpdate(node._id, { attributes: newAttrs })
    }
    setEditingAttr(null)
  }

  // Start editing text content
  const startEditText = () => {
    if (readOnly) return
    setEditingText(true)
    setEditTextValue(node.content || '')
  }

  // Save text edit
  const saveTextEdit = () => {
    onUpdate(node._id, { content: editTextValue })
    setEditingText(false)
  }

  // Add new attribute
  const handleAddAttr = () => {
    if (newAttrName.trim()) {
      onAddAttribute(node._id, newAttrName.trim(), newAttrValue)
      setNewAttrName('')
      setNewAttrValue('')
      setAddingAttr(false)
    }
  }

  // Start editing tag name
  const startEditTagName = () => {
    if (readOnly) return
    setEditingTagName(true)
    setEditTagNameValue(node.name || '')
  }

  // Save tag name edit
  const saveTagNameEdit = () => {
    if (editTagNameValue.trim() && /^[a-zA-Z_][\w.-]*$/.test(editTagNameValue.trim())) {
      onUpdate(node._id, { name: editTagNameValue.trim() })
    }
    setEditingTagName(false)
  }

  // Render comment node
  if (node.type === 'comment') {
    return (
      <div style={{ marginLeft: indent, marginBottom: '8px' }} data-node-id={node._id}>
        <span style={{ color: colors.textMuted, fontStyle: 'italic', fontSize: '12px' }}>
          {'<!-- '}{node.content}{' -->'}
        </span>
      </div>
    )
  }

  // Render text node
  if (node.type === 'text') {
    return (
      <div style={{ marginLeft: indent, marginBottom: '8px' }} data-node-id={node._id}>
        {editingText ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea
              value={editTextValue}
              onChange={(e) => setEditTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingText(false)
                // Ctrl/Cmd + Enter to save
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  saveTextEdit()
                }
              }}
              autoFocus
              rows={Math.max(3, editTextValue.split('\n').length)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                background: colors.inputBg,
                border: `1px solid ${colors.inputBorder}`,
                borderRadius: '6px',
                color: colors.text,
                outline: 'none',
                resize: 'vertical',
                minHeight: '60px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}
              placeholder="Enter text content (supports multiple lines)"
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '11px', color: colors.textMuted, alignSelf: 'center', marginRight: 'auto' }}>
                Ctrl+Enter to save
              </span>
              <button onClick={() => setEditingText(false)} style={iconButtonStyle(colors)}>
                <X size={14} />
                <span style={{ marginLeft: '4px' }}>Cancel</span>
              </button>
              <button
                onClick={saveTextEdit}
                style={{
                  ...iconButtonStyle(colors),
                  background: 'rgba(59, 130, 246, 0.15)',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  color: colors.primary
                }}
              >
                <Check size={14} />
                <span style={{ marginLeft: '4px' }}>Save</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '8px 12px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: readOnly ? 'default' : 'pointer'
            }}
            onClick={startEditText}
          >
            <pre style={{
              margin: 0,
              flex: 1,
              color: colors.textContent,
              fontSize: '13px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5
            }}>
              {node.content}
            </pre>
            {!readOnly && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node._id) }}
                style={iconButtonStyle(colors)}
                title="Delete text"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Render element node
  return (
    <div style={{ marginLeft: indent, marginBottom: '8px' }} data-node-id={node._id}>
      {/* Element header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 12px',
          background: 'var(--panel)',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          transition: 'all 0.15s ease',
          cursor: hasChildren ? 'pointer' : 'default'
        }}
        onClick={(e) => {
          // Toggle expansion when clicking the row (but not on buttons/inputs)
          if (hasChildren && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {
            toggleExpanded(node._id)
          }
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={() => toggleExpanded(node._id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: colors.textSecondary,
              display: 'flex'
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span style={{ width: '18px' }} />
        )}

        {/* Tag name */}
        {editingTagName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: colors.tagBracket }}>&lt;</span>
            <input
              type="text"
              value={editTagNameValue}
              onChange={(e) => setEditTagNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTagNameEdit()
                if (e.key === 'Escape') setEditingTagName(false)
              }}
              autoFocus
              style={{
                padding: '2px 6px',
                fontSize: '13px',
                fontWeight: 600,
                background: colors.inputBg,
                border: `1px solid ${colors.inputBorder}`,
                borderRadius: '3px',
                color: colors.tagName,
                outline: 'none',
                width: '120px'
              }}
            />
            <span style={{ color: colors.tagBracket }}>&gt;</span>
            <button onClick={saveTagNameEdit} style={iconButtonStyle(colors)}>
              <Check size={12} />
            </button>
            <button onClick={() => setEditingTagName(false)} style={iconButtonStyle(colors)}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <span
            style={{ cursor: readOnly ? 'default' : 'pointer' }}
            onClick={startEditTagName}
            title={readOnly ? undefined : 'Click to edit tag name'}
          >
            <span style={{ color: colors.tagBracket }}>&lt;</span>
            <span style={{ color: colors.tagName, fontWeight: 600, fontSize: '13px' }}>
              {node.name}
            </span>
            <span style={{ color: colors.tagBracket }}>&gt;</span>
          </span>
        )}

        {/* Attributes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px', flexWrap: 'wrap' }}>
          {Object.entries(node.attributes || {}).map(([attrName, attrValue]) => (
            <div
              key={attrName}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                background: colors.attrBg,
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              <span style={{ color: colors.attrName }}>{attrName}</span>
              <span style={{ color: colors.textMuted }}>=</span>
              {editingAttr === attrName ? (
                <>
                  <input
                    type="text"
                    value={editingAttrValue}
                    onChange={(e) => setEditingAttrValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveAttrEdit()
                      if (e.key === 'Escape') setEditingAttr(null)
                    }}
                    autoFocus
                    style={{
                      padding: '1px 4px',
                      fontSize: '12px',
                      background: colors.inputBg,
                      border: `1px solid ${colors.inputBorder}`,
                      borderRadius: '2px',
                      color: colors.attrValue,
                      outline: 'none',
                      width: '80px'
                    }}
                  />
                  <button onClick={saveAttrEdit} style={iconButtonStyle(colors, true)}>
                    <Check size={10} />
                  </button>
                </>
              ) : (
                <>
                  <span
                    style={{ color: colors.attrValue, cursor: readOnly ? 'default' : 'pointer' }}
                    onClick={() => startEditAttr(attrName, attrValue)}
                    title={readOnly ? undefined : 'Click to edit'}
                  >
                    "{attrValue}"
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => onDeleteAttribute(node._id, attrName)}
                      style={{ ...iconButtonStyle(colors, true), marginLeft: '2px' }}
                      title="Remove attribute"
                    >
                      <X size={10} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Add attribute button/form */}
          {!readOnly && (
            addingAttr ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="name"
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddAttr()
                    if (e.key === 'Escape') setAddingAttr(false)
                  }}
                  autoFocus
                  style={{
                    padding: '2px 4px',
                    fontSize: '11px',
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    borderRadius: '3px',
                    color: colors.text,
                    width: '60px',
                    outline: 'none'
                  }}
                />
                <span style={{ color: colors.textMuted }}>=</span>
                <input
                  type="text"
                  placeholder="value"
                  value={newAttrValue}
                  onChange={(e) => setNewAttrValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddAttr()
                    if (e.key === 'Escape') setAddingAttr(false)
                  }}
                  style={{
                    padding: '2px 4px',
                    fontSize: '11px',
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    borderRadius: '3px',
                    color: colors.text,
                    width: '60px',
                    outline: 'none'
                  }}
                />
                <button onClick={handleAddAttr} style={iconButtonStyle(colors, true)}>
                  <Check size={10} />
                </button>
                <button onClick={() => setAddingAttr(false)} style={iconButtonStyle(colors, true)}>
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingAttr(true)}
                style={{
                  ...iconButtonStyle(colors, true),
                  fontSize: '10px',
                  padding: '2px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
                title="Add attribute"
              >
                <Plus size={10} />
                <span>attr</span>
              </button>
            )
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Actions */}
        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => onAddChild(node._id, 'element')}
              style={iconButtonStyle(colors)}
              onMouseOver={(e) => {
                e.currentTarget.style.background = colors.buttonHoverBg
                e.currentTarget.style.borderColor = colors.primary
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = colors.buttonBg
                e.currentTarget.style.borderColor = colors.buttonBorder
              }}
              title="Add child element"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => onAddChild(node._id, 'text')}
              style={{ ...iconButtonStyle(colors), fontSize: '10px' }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = colors.buttonHoverBg
                e.currentTarget.style.borderColor = colors.primary
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = colors.buttonBg
                e.currentTarget.style.borderColor = colors.buttonBorder
              }}
              title="Add text content"
            >
              Txt
            </button>
            <button
              onClick={() => onDelete(node._id)}
              style={iconButtonStyle(colors)}
              onMouseOver={(e) => {
                e.currentTarget.style.background = colors.buttonHoverBg
                e.currentTarget.style.borderColor = colors.primary
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = colors.buttonBg
                e.currentTarget.style.borderColor = colors.buttonBorder
              }}
              title="Delete element"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div style={{ borderLeft: '2px solid var(--border)', marginLeft: '12px', paddingLeft: '12px', marginTop: '8px' }}>
          {node.children!.map((child) => (
            <XmlNodeView
              key={child._id}
              node={child}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onAddAttribute={onAddAttribute}
              onDeleteAttribute={onDeleteAttribute}
              theme={theme}
              colors={colors}
              readOnly={readOnly}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Color scheme helper
function getColors(theme: 'light' | 'dark') {
  const isDark = theme === 'dark'
  return {
    bg: isDark ? '#1e293b' : '#ffffff',
    bgSecondary: isDark ? '#0f172a' : '#f8fafc',
    border: isDark ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: isDark ? '#ffffff' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    textContent: isDark ? '#e2e8f0' : '#334155',
    primary: '#3b82f6',
    // Button colors (matching Explorer header .btn class)
    buttonBg: isDark ? '#334155' : '#f1f5f9',
    buttonBorder: isDark ? '#475569' : '#cbd5e1',
    buttonHoverBg: isDark ? '#475569' : '#e2e8f0',
    // Node specific
    nodeBg: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.8)',
    nodeBorder: isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(226, 232, 240, 0.8)',
    nodeHoverBg: isDark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(241, 245, 249, 0.9)',
    nodeHoverBorder: isDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(203, 213, 225, 0.9)',
    // Tag colors
    tagBracket: isDark ? '#89ddff' : '#005cc5',
    tagName: isDark ? '#b392f0' : '#8250df',
    // Attribute colors
    attrBg: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.08)',
    attrName: isDark ? '#ffcb6b' : '#6f42c1',
    attrValue: isDark ? '#89ddff' : '#005cc5',
    // Input
    inputBg: isDark ? '#0f172a' : '#ffffff',
    inputBorder: isDark ? 'rgba(71, 85, 105, 0.5)' : '#cbd5e1',
    // Guide
    indentGuide: isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)',
    // Error
    error: isDark ? '#f87171' : '#dc2626'
  }
}

// Icon button style helper - matches Explorer header .btn class
function iconButtonStyle(colors: ReturnType<typeof getColors>, small = false) {
  return {
    background: colors.buttonBg,
    border: `1px solid ${colors.buttonBorder}`,
    padding: small ? '2px 4px' : '4px 8px',
    cursor: 'pointer',
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    borderRadius: '6px',
    transition: 'all 0.15s ease',
    fontSize: small ? '11px' : '12px',
    fontWeight: 500
  } as React.CSSProperties
}

/**
 * Main XmlDesignView component
 */
const XmlDesignView = forwardRef<XmlDesignViewHandle, XmlDesignViewProps>(function XmlDesignView({
  xmlContent,
  onChange,
  theme,
  readOnly = false
}, ref) {
  const colors = useMemo(() => getColors(theme), [theme])

  // Parse XML content into node tree
  const [parseError, setParseError] = useState<string | null>(null)
  const nodes = useMemo(() => {
    try {
      nodeIdCounter = 0 // Reset counter for consistent IDs
      const parsed = parseXml(xmlContent)
      setParseError(null)
      return parsed
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse XML')
      return []
    }
  }, [xmlContent])

  // Track expanded nodes - use a ref to preserve state across re-parses
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const pendingExpandRef = useRef<Set<string>>(new Set())
  // Initialize expanded state on first parse, and preserve pending expands
  useEffect(() => {
    if (!initializedRef.current && nodes.length > 0) {
      // Expand first two levels by default on initial load
      const initial = new Set<string>()
      const addExpanded = (nodeList: XmlNode[], maxDepth: number) => {
        for (const node of nodeList) {
          if (node._depth < maxDepth) {
            initial.add(node._id)
            if (node.children) {
              addExpanded(node.children, maxDepth)
            }
          }
        }
      }
      addExpanded(nodes, 2)
      setExpandedNodes(initial)
      initializedRef.current = true
    } else if (pendingExpandRef.current.size > 0) {
      // Apply any pending expands (from adding children)
      setExpandedNodes(prev => {
        const next = new Set(prev)
        // Find nodes by their position/depth pattern
        const findNodeByOldId = (nodeList: XmlNode[], oldId: string): string | null => {
          // Since IDs are deterministic (node-1, node-2, etc.), and we add children
          // at the end, parent IDs stay the same after re-parse
          for (const node of nodeList) {
            if (node._id === oldId) return node._id
            if (node.children) {
              const found = findNodeByOldId(node.children, oldId)
              if (found) return found
            }
          }
          return null
        }
        for (const oldId of pendingExpandRef.current) {
          const newId = findNodeByOldId(nodes, oldId)
          if (newId) next.add(newId)
        }
        pendingExpandRef.current.clear()
        return next
      })
    }
  }, [nodes])

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  // Helper to get all ancestor IDs for a node
  const getAncestorIds = useCallback((nodeList: XmlNode[], targetId: string, ancestors: string[] = []): string[] | null => {
    for (const node of nodeList) {
      if (node._id === targetId) {
        return ancestors
      }
      if (node.children) {
        const found = getAncestorIds(node.children, targetId, [...ancestors, node._id])
        if (found) return found
      }
    }
    return null
  }, [])

  // Helper to flatten ALL nodes regardless of expansion state (for index lookup)
  const flattenAllNodes = useCallback((nodeList: XmlNode[]): XmlNode[] => {
    const result: XmlNode[] = []
    for (const node of nodeList) {
      if (node.type === 'element') {
        result.push(node)
        if (node.children) {
          result.push(...flattenAllNodes(node.children))
        }
      }
    }
    return result
  }, [])

  // Expose imperative handle for external control
  useImperativeHandle(ref, () => ({
    expandToNodeIndex: (index: number) => {
      const allFlat = flattenAllNodes(nodes)
      if (index >= 0 && index < allFlat.length) {
        const targetNode = allFlat[index]
        const ancestorIds = getAncestorIds(nodes, targetNode._id)
        if (ancestorIds && ancestorIds.length > 0) {
          setExpandedNodes(prev => {
            const next = new Set(prev)
            for (const id of ancestorIds) {
              next.add(id)
            }
            return next
          })
        }
      }
    },
    getNodeIdAtIndex: (index: number) => {
      const allFlat = flattenAllNodes(nodes)
      if (index >= 0 && index < allFlat.length) {
        return allFlat[index]._id
      }
      return null
    }
  }), [nodes, flattenAllNodes, getAncestorIds])

  // Helper to find and update a node in the tree
  const updateNodeInTree = useCallback((
    nodes: XmlNode[],
    nodeId: string,
    updater: (node: XmlNode) => XmlNode | null
  ): XmlNode[] => {
    return nodes.flatMap((node) => {
      if (node._id === nodeId) {
        const updated = updater(node)
        return updated ? [updated] : []
      }
      if (node.children) {
        return [{
          ...node,
          children: updateNodeInTree(node.children, nodeId, updater)
        }]
      }
      return [node]
    })
  }, [])

  // Update node properties
  const handleUpdate = useCallback((nodeId: string, updates: Partial<XmlNode>) => {
    const newNodes = updateNodeInTree(nodes, nodeId, (node) => ({ ...node, ...updates }))
    onChange(serializeXml(newNodes))
  }, [nodes, onChange, updateNodeInTree])

  // Delete a node
  const handleDelete = useCallback((nodeId: string) => {
    const newNodes = updateNodeInTree(nodes, nodeId, () => null)
    onChange(serializeXml(newNodes))
  }, [nodes, onChange, updateNodeInTree])

  // Add child element
  const handleAddChild = useCallback((parentId: string, nodeType: 'element' | 'text') => {
    const newNodes = updateNodeInTree(nodes, parentId, (node) => {
      const newChild: XmlNode = nodeType === 'element'
        ? {
            type: 'element',
            name: 'element',
            attributes: {},
            children: [],
            _id: generateNodeId(),
            _depth: node._depth + 1
          }
        : {
            type: 'text',
            content: 'text content',
            _id: generateNodeId(),
            _depth: node._depth + 1
          }
      return {
        ...node,
        children: [...(node.children || []), newChild]
      }
    })
    // Mark parent for expansion after re-parse (IDs stay the same since counter resets to 0)
    pendingExpandRef.current.add(parentId)
    // Also keep all currently expanded nodes
    for (const id of expandedNodes) {
      pendingExpandRef.current.add(id)
    }
    onChange(serializeXml(newNodes))
  }, [nodes, onChange, updateNodeInTree, expandedNodes])

  // Add attribute to a node
  const handleAddAttribute = useCallback((nodeId: string, name: string, value: string) => {
    const newNodes = updateNodeInTree(nodes, nodeId, (node) => ({
      ...node,
      attributes: { ...(node.attributes || {}), [name]: value }
    }))
    onChange(serializeXml(newNodes))
  }, [nodes, onChange, updateNodeInTree])

  // Delete attribute from a node
  const handleDeleteAttribute = useCallback((nodeId: string, attrName: string) => {
    const newNodes = updateNodeInTree(nodes, nodeId, (node) => {
      const newAttrs = { ...(node.attributes || {}) }
      delete newAttrs[attrName]
      return { ...node, attributes: newAttrs }
    })
    onChange(serializeXml(newNodes))
  }, [nodes, onChange, updateNodeInTree])

  // Add root element
  const handleAddRootElement = useCallback(() => {
    const newNode: XmlNode = {
      type: 'element',
      name: 'element',
      attributes: {},
      children: [],
      _id: generateNodeId(),
      _depth: 0
    }
    onChange(serializeXml([...nodes, newNode]))
  }, [nodes, onChange])

  // Expand/collapse all
  const expandAll = useCallback(() => {
    const allIds = new Set<string>()
    const collectIds = (nodes: XmlNode[]) => {
      for (const node of nodes) {
        if (node.type === 'element') {
          allIds.add(node._id)
          if (node.children) collectIds(node.children)
        }
      }
    }
    collectIds(nodes)
    setExpandedNodes(allIds)
  }, [nodes])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  return (
    <div
      style={{
        background: 'var(--bg)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        marginBottom: '24px',
        overflow: 'hidden'
      }}
    >
      {/* Header - matches Content Sections styling */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
          <Code size={16} style={{ color: 'var(--accent)' }} />
          XML Content
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Structured XML body content for this prompt
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={expandAll}
            style={{
              ...iconButtonStyle(colors),
              fontSize: '11px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = colors.buttonHoverBg
              e.currentTarget.style.borderColor = colors.primary
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = colors.buttonBg
              e.currentTarget.style.borderColor = colors.buttonBorder
            }}
            title="Expand all nodes"
          >
            <UnfoldVertical size={14} />
            <span className="hide-narrow">Expand</span>
          </button>
          <button
            onClick={collapseAll}
            style={{
              ...iconButtonStyle(colors),
              fontSize: '11px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = colors.buttonHoverBg
              e.currentTarget.style.borderColor = colors.primary
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = colors.buttonBg
              e.currentTarget.style.borderColor = colors.buttonBorder
            }}
            title="Collapse all nodes"
          >
            <FoldVertical size={14} />
            <span className="hide-narrow">Collapse</span>
          </button>
          {!readOnly && (
            <button
              onClick={handleAddRootElement}
              style={{
                ...iconButtonStyle(colors),
                fontSize: '11px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(59, 130, 246, 0.15)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                color: colors.primary
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'
                e.currentTarget.style.borderColor = colors.primary
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'
              }}
              title="Add root element"
            >
              <Plus size={12} />
              Add Element
            </button>
          )}
        </div>
      </div>

      {/* Responsive CSS for narrow widths */}
      <style>{`
        @media (max-width: 500px) {
          .hide-narrow { display: none !important; }
        }
      `}</style>

      {/* Content area - expands with content, parent handles scroll */}
      <div style={{ minHeight: '200px' }}>
        <div
          style={{
            padding: '20px'
          }}
        >
          {parseError ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '6px',
                color: colors.error
              }}
            >
              <AlertCircle size={16} />
              <span style={{ fontSize: '13px' }}>Parse error: {parseError}</span>
            </div>
          ) : nodes.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                color: colors.textMuted
              }}
            >
              <Code size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '14px' }}>No XML content</p>
              {!readOnly && (
                <button
                  onClick={handleAddRootElement}
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    background: colors.primary,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={14} />
                  Add Root Element
                </button>
              )}
            </div>
          ) : (
            nodes.map((node) => (
              <XmlNodeView
                key={node._id}
                node={node}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
                onAddAttribute={handleAddAttribute}
                onDeleteAttribute={handleDeleteAttribute}
                theme={theme}
                colors={colors}
                readOnly={readOnly}
                expandedNodes={expandedNodes}
                toggleExpanded={toggleExpanded}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
})

export default XmlDesignView
