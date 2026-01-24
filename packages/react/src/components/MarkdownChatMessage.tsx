/**
 * MarkdownChatMessage - Renders markdown content in chat messages
 *
 * Provides rich markdown rendering for assistant messages including:
 * - Headings (h1-h6)
 * - Lists (ordered/unordered)
 * - Code blocks with syntax highlighting
 * - Inline code
 * - Links
 * - Blockquotes
 * - Tables (GFM)
 * - Bold, italic, strikethrough
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownChatMessageProps {
  content: string
  isUser?: boolean
  className?: string
}

export function MarkdownChatMessage({ content, isUser = false, className }: MarkdownChatMessageProps) {
  // For user messages, use simple text rendering (no markdown)
  if (isUser) {
    return (
      <span
        className={className}
        style={{
          color: 'white',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {content}
      </span>
    )
  }

  const components: Components = {
    // Headings - scaled down for chat context
    h1: ({ children }) => (
      <h1 style={{
        marginTop: '16px',
        marginBottom: '8px',
        fontSize: '18px',
        fontWeight: 700,
        color: 'var(--prompd-text)',
        lineHeight: 1.3
      }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 style={{
        marginTop: '14px',
        marginBottom: '6px',
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--prompd-text)',
        lineHeight: 1.3
      }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 style={{
        marginTop: '12px',
        marginBottom: '4px',
        fontSize: '15px',
        fontWeight: 600,
        color: 'var(--prompd-text)',
        lineHeight: 1.3
      }}>
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 style={{
        marginTop: '10px',
        marginBottom: '4px',
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--prompd-text)',
        lineHeight: 1.3
      }}>
        {children}
      </h4>
    ),

    // Paragraphs
    p: ({ children }) => (
      <p style={{
        marginBottom: '8px',
        lineHeight: 1.6,
        color: 'var(--prompd-text)'
      }}>
        {children}
      </p>
    ),

    // Lists
    ul: ({ children }) => (
      <ul style={{
        marginBottom: '8px',
        paddingLeft: '20px',
        color: 'var(--prompd-text)',
        listStyleType: 'disc'
      }}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol style={{
        marginBottom: '8px',
        paddingLeft: '20px',
        color: 'var(--prompd-text)',
        listStyleType: 'decimal'
      }}>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li style={{
        marginBottom: '2px',
        lineHeight: 1.5
      }}>
        {children}
      </li>
    ),

    // Code - inline and block
    code: ({ className, children, ...props }) => {
      // Check if this is a code block (has language class) or inline code
      const isCodeBlock = className?.startsWith('language-')

      if (isCodeBlock) {
        return (
          <code
            className={className}
            style={{
              display: 'block',
              background: 'var(--prompd-panel-2)',
              padding: '10px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              overflowX: 'auto',
              whiteSpace: 'pre',
              color: 'var(--prompd-text)'
            }}
            {...props}
          >
            {children}
          </code>
        )
      }

      // Inline code
      return (
        <code
          style={{
            background: 'var(--prompd-panel-2)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: 'var(--prompd-accent)'
          }}
          {...props}
        >
          {children}
        </code>
      )
    },

    // Pre wrapper for code blocks
    pre: ({ children }) => (
      <pre style={{
        margin: '8px 0',
        padding: 0,
        background: 'transparent',
        overflow: 'visible'
      }}>
        {children}
      </pre>
    ),

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote style={{
        borderLeft: '3px solid var(--prompd-accent)',
        paddingLeft: '12px',
        marginLeft: 0,
        marginRight: 0,
        marginBottom: '8px',
        color: 'var(--prompd-muted)',
        fontStyle: 'italic'
      }}>
        {children}
      </blockquote>
    ),

    // Links
    a: ({ children, href }) => (
      <a
        href={href}
        style={{
          color: 'var(--prompd-accent)',
          textDecoration: 'underline',
          textUnderlineOffset: '2px'
        }}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),

    // Tables (GFM)
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px'
        }}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead style={{ background: 'var(--prompd-panel-2)' }}>
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th style={{
        border: '1px solid var(--prompd-border)',
        padding: '6px 10px',
        fontWeight: 600,
        textAlign: 'left',
        color: 'var(--prompd-text)'
      }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{
        border: '1px solid var(--prompd-border)',
        padding: '6px 10px',
        color: 'var(--prompd-text)'
      }}>
        {children}
      </td>
    ),

    // Strong and emphasis
    strong: ({ children }) => (
      <strong style={{ fontWeight: 600, color: 'var(--prompd-text)' }}>
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em style={{ fontStyle: 'italic' }}>
        {children}
      </em>
    ),

    // Strikethrough (GFM)
    del: ({ children }) => (
      <del style={{ textDecoration: 'line-through', color: 'var(--prompd-muted)' }}>
        {children}
      </del>
    ),

    // Horizontal rule
    hr: () => (
      <hr style={{
        border: 'none',
        borderTop: '1px solid var(--prompd-border)',
        margin: '12px 0'
      }} />
    )
  }

  return (
    <div
      className={className}
      style={{
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'var(--prompd-text)'
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
