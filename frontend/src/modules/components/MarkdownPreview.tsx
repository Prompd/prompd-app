import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { Check, Copy, ExternalLink } from 'lucide-react'

// Import highlight.js styles - using a dark theme that works well
import 'highlight.js/styles/github-dark.css'

interface MarkdownPreviewProps {
  content: string
  height?: string
  theme?: 'light' | 'dark'
}

export default function MarkdownPreview({ content, height = '300px', theme = 'dark' }: MarkdownPreviewProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }, [])

  // Generate a slug from heading text for anchor IDs
  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  // Theme-aware colors
  const colors = {
    text: theme === 'dark' ? 'var(--text)' : '#1f2937',
    textSecondary: theme === 'dark' ? 'var(--text-secondary)' : '#6b7280',
    accent: theme === 'dark' ? 'var(--accent)' : '#3b82f6',
    border: theme === 'dark' ? 'var(--border)' : '#e5e7eb',
    codeBg: theme === 'dark' ? 'var(--panel-2)' : '#f3f4f6',
    blockquoteBorder: theme === 'dark' ? 'var(--accent)' : '#3b82f6',
    hrColor: theme === 'dark' ? 'var(--border)' : '#d1d5db',
    linkHover: theme === 'dark' ? '#60a5fa' : '#2563eb'
  }

  return (
    <div
      style={{
        height,
        overflow: 'auto',
        padding: '20px 24px',
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        background: theme === 'dark' ? 'var(--panel)' : '#ffffff',
        color: colors.text,
        lineHeight: 1.7,
        fontSize: '15px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}
      className="markdown-preview"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          // Headings with anchor IDs
          h1: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return (
              <h1
                id={id}
                style={{
                  marginTop: '32px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  fontSize: '2em',
                  fontWeight: 700,
                  color: colors.text,
                  borderBottom: `1px solid ${colors.border}`,
                  lineHeight: 1.3
                }}
              >
                <a href={`#${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {children}
                </a>
              </h1>
            )
          },
          h2: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return (
              <h2
                id={id}
                style={{
                  marginTop: '28px',
                  marginBottom: '14px',
                  paddingBottom: '6px',
                  fontSize: '1.5em',
                  fontWeight: 600,
                  color: colors.text,
                  borderBottom: `1px solid ${colors.border}`,
                  lineHeight: 1.35
                }}
              >
                <a href={`#${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {children}
                </a>
              </h2>
            )
          },
          h3: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return (
              <h3
                id={id}
                style={{
                  marginTop: '24px',
                  marginBottom: '12px',
                  fontSize: '1.25em',
                  fontWeight: 600,
                  color: colors.text,
                  lineHeight: 1.4
                }}
              >
                <a href={`#${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {children}
                </a>
              </h3>
            )
          },
          h4: ({ children }) => {
            const text = String(children)
            const id = generateSlug(text)
            return (
              <h4
                id={id}
                style={{
                  marginTop: '20px',
                  marginBottom: '10px',
                  fontSize: '1.1em',
                  fontWeight: 600,
                  color: colors.text,
                  lineHeight: 1.4
                }}
              >
                <a href={`#${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {children}
                </a>
              </h4>
            )
          },
          h5: ({ children }) => (
            <h5 style={{
              marginTop: '16px',
              marginBottom: '8px',
              fontSize: '1em',
              fontWeight: 600,
              color: colors.text
            }}>
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 style={{
              marginTop: '16px',
              marginBottom: '8px',
              fontSize: '0.9em',
              fontWeight: 600,
              color: colors.textSecondary
            }}>
              {children}
            </h6>
          ),

          // Paragraphs with better spacing
          p: ({ children }) => (
            <p style={{
              marginTop: 0,
              marginBottom: '16px',
              lineHeight: 1.7,
              color: colors.text
            }}>
              {children}
            </p>
          ),

          // Lists with better styling - explicit list-style to ensure markers show
          ul: ({ children, className }) => {
            // Check if this is a task list (contains checkboxes)
            const isTaskList = className?.includes('contains-task-list')
            return (
              <ul style={{
                marginTop: 0,
                marginBottom: '16px',
                paddingLeft: isTaskList ? '24px' : '28px',
                color: colors.text,
                lineHeight: 1.7,
                listStyleType: isTaskList ? 'none' : 'disc',
                listStylePosition: 'outside'
              }}>
                {children}
              </ul>
            )
          },
          ol: ({ children, start }) => (
            <ol
              start={start}
              style={{
                marginTop: 0,
                marginBottom: '16px',
                paddingLeft: '28px',
                color: colors.text,
                lineHeight: 1.7,
                listStyleType: 'decimal',
                listStylePosition: 'outside'
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children, className, ...props }) => {
            // Check if this is a task list item
            const isTaskItem = className?.includes('task-list-item')
            return (
              <li style={{
                marginBottom: '8px',
                lineHeight: 1.6,
                paddingLeft: isTaskItem ? '4px' : '4px',
                display: isTaskItem ? 'flex' : 'list-item',
                alignItems: isTaskItem ? 'flex-start' : undefined,
                gap: isTaskItem ? '8px' : undefined
              }}>
                {children}
              </li>
            )
          },

          // Task list checkboxes
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled
                  style={{
                    marginRight: '8px',
                    width: '16px',
                    height: '16px',
                    accentColor: colors.accent,
                    cursor: 'default'
                  }}
                  {...props}
                />
              )
            }
            return <input type={type} {...props} />
          },

          // Code blocks with language label and copy button
          pre: ({ children }) => {
            return (
              <pre style={{
                margin: '0 0 16px 0',
                padding: 0,
                background: 'transparent'
              }}>
                {children}
              </pre>
            )
          },
          code: ({ inline, className, children, ...props }: any) => {
            // Extract language from className (format: language-xxx)
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : null
            const codeString = String(children).replace(/\n$/, '')

            if (inline) {
              return (
                <code
                  style={{
                    display: 'inline-block',
                    background: theme === 'dark'
                      ? 'rgba(110, 118, 129, 0.25)'
                      : 'rgba(175, 184, 193, 0.3)',
                    padding: '2px 6px',
                    margin: '0 1px',
                    borderRadius: '6px',
                    fontSize: '0.85em',
                    fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
                    color: theme === 'dark' ? '#e6edf3' : '#24292f',
                    border: theme === 'dark'
                      ? '1px solid rgba(110, 118, 129, 0.3)'
                      : '1px solid rgba(175, 184, 193, 0.4)',
                    wordBreak: 'break-word',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'baseline',
                    lineHeight: 1.4
                  }}
                  {...props}
                >
                  {children}
                </code>
              )
            }

            // Code block with syntax highlighting
            return (
              <div style={{
                position: 'relative',
                marginBottom: '16px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: `1px solid ${colors.border}`
              }}>
                {/* Language label and copy button header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: theme === 'dark' ? '#1e293b' : '#e5e7eb',
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: '12px'
                }}>
                  <span style={{
                    color: colors.textSecondary,
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    letterSpacing: '0.5px'
                  }}>
                    {language || 'code'}
                  </span>
                  <button
                    onClick={() => handleCopyCode(codeString)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: 'transparent',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: copiedCode === codeString ? '#22c55e' : colors.textSecondary,
                      fontSize: '11px',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (copiedCode !== codeString) {
                        e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {copiedCode === codeString ? (
                      <>
                        <Check size={12} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                {/* Code content */}
                <code
                  className={className}
                  style={{
                    display: 'block',
                    padding: '16px',
                    fontSize: '13px',
                    fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
                    overflowX: 'auto',
                    background: theme === 'dark' ? '#0d1117' : '#f6f8fa',
                    // Explicit color for plaintext/unstyled code blocks
                    color: theme === 'dark' ? '#e6edf3' : '#24292f',
                    lineHeight: 1.5,
                    tabSize: 2
                  }}
                  {...props}
                >
                  {children}
                </code>
              </div>
            )
          },

          // Blockquotes with accent border
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: `4px solid ${colors.blockquoteBorder}`,
              paddingLeft: '20px',
              marginLeft: 0,
              marginRight: 0,
              marginTop: 0,
              marginBottom: '16px',
              color: colors.textSecondary,
              fontStyle: 'italic',
              background: theme === 'dark' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.05)',
              padding: '12px 20px',
              borderRadius: '0 8px 8px 0'
            }}>
              {children}
            </blockquote>
          ),

          // Links with external indicator
          a: ({ children, href }) => {
            const isExternal = href?.startsWith('http') || href?.startsWith('//')
            return (
              <a
                href={href}
                style={{
                  color: colors.accent,
                  textDecoration: 'none',
                  borderBottom: `1px solid transparent`,
                  transition: 'border-color 0.15s'
                }}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderBottomColor = colors.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderBottomColor = 'transparent'
                }}
              >
                {children}
                {isExternal && (
                  <ExternalLink
                    size={12}
                    style={{
                      marginLeft: '4px',
                      verticalAlign: 'middle',
                      opacity: 0.7
                    }}
                  />
                )}
              </a>
            )
          },

          // Horizontal rule with better styling
          hr: () => (
            <hr style={{
              height: '1px',
              border: 'none',
              background: `linear-gradient(to right, transparent, ${colors.hrColor}, transparent)`,
              margin: '32px 0'
            }} />
          ),

          // Images with max width and loading
          img: ({ src, alt }) => (
            <span style={{ display: 'block', margin: '16px 0', textAlign: 'center' }}>
              <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  boxShadow: theme === 'dark'
                    ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                    : '0 4px 12px rgba(0, 0, 0, 0.1)'
                }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
              {alt && (
                <span style={{
                  display: 'block',
                  marginTop: '8px',
                  fontSize: '13px',
                  color: colors.textSecondary,
                  fontStyle: 'italic'
                }}>
                  {alt}
                </span>
              )}
            </span>
          ),

          // Tables with better styling
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{
              background: theme === 'dark' ? 'var(--panel-2)' : '#f3f4f6'
            }}>
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th style={{
              padding: '12px 16px',
              fontWeight: 600,
              textAlign: 'left',
              borderBottom: `2px solid ${colors.border}`,
              color: colors.text
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.border}`,
              color: colors.text
            }}>
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr style={{
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme === 'dark'
                ? 'rgba(255, 255, 255, 0.02)'
                : 'rgba(0, 0, 0, 0.02)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
            >
              {children}
            </tr>
          ),

          // Strong/Bold
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: colors.text }}>
              {children}
            </strong>
          ),

          // Emphasis/Italic
          em: ({ children }) => (
            <em style={{ fontStyle: 'italic' }}>
              {children}
            </em>
          ),

          // Keyboard keys
          kbd: ({ children }) => (
            <kbd style={{
              display: 'inline-block',
              padding: '2px 6px',
              fontSize: '0.85em',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              lineHeight: 1.4,
              color: colors.text,
              backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
              border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'}`,
              borderRadius: '4px',
              boxShadow: theme === 'dark'
                ? 'inset 0 -1px 0 rgba(0, 0, 0, 0.3)'
                : 'inset 0 -1px 0 rgba(0, 0, 0, 0.1)',
              verticalAlign: 'middle'
            }}>
              {children}
            </kbd>
          ),

          // Strikethrough
          del: ({ children }) => (
            <del style={{ textDecoration: 'line-through', opacity: 0.7 }}>
              {children}
            </del>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
