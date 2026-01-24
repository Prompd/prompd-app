import { useState, useMemo } from 'react'
import { MessageSquare, Pin, MoreVertical, Trash2, Edit2, Download, Clock } from 'lucide-react'
import type { ConversationMeta } from '../services/conversationStorage'
import { useConfirmDialog } from './ConfirmDialog'

interface ConversationSidebarProps {
  conversations: ConversationMeta[]
  currentConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  onRenameConversation: (id: string, newTitle: string) => void
  onPinConversation: (id: string, isPinned: boolean) => void
  onExportConversation: (id: string, format: 'json' | 'markdown') => void
  isOpen: boolean
  onClose: () => void
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  onExportConversation,
  isOpen,
  onClose
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Use custom confirm dialog instead of native confirm()
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const query = searchQuery.toLowerCase()
    return conversations.filter(conv =>
      conv.title.toLowerCase().includes(query)
    )
  }, [conversations, searchQuery])

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)

    const groups: Record<string, ConversationMeta[]> = {
      Today: [],
      Yesterday: [],
      'Last 7 Days': [],
      Older: []
    }

    filteredConversations.forEach(conv => {
      const convDate = new Date(conv.updatedAt)
      const convDay = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate())

      if (convDay.getTime() === today.getTime()) {
        groups.Today.push(conv)
      } else if (convDay.getTime() === yesterday.getTime()) {
        groups.Yesterday.push(conv)
      } else if (convDay >= lastWeek) {
        groups['Last 7 Days'].push(conv)
      } else {
        groups.Older.push(conv)
      }
    })

    return groups
  }, [filteredConversations])

  const handleRename = (id: string, currentTitle: string) => {
    setRenamingId(id)
    setRenameValue(currentTitle)
    setContextMenuId(null)
  }

  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      onRenameConversation(id, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const modeIcons: Record<string, string> = {
    generate: '🎯',
    edit: '🔧',
    discuss: '💬',
    explore: '📦'
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 200
        }}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '320px',
          backgroundColor: 'var(--panel-2, var(--background, #ffffff))',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 201,
          boxShadow: '4px 0 12px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--foreground)' }}>
              Chat History
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* New Conversation Button */}
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => {
              onNewConversation()
              onClose()
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <MessageSquare size={16} />
            New Conversation
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 12px 16px' }}>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--foreground)'
            }}
          />
        </div>

        {/* Conversation List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 12px'
        }}>
          {Object.entries(groupedConversations).map(([groupName, convs]) => {
            if (convs.length === 0) return null

            return (
              <div key={groupName} style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '8px 4px 4px 4px',
                  marginBottom: '4px'
                }}>
                  {groupName}
                </div>

                {convs.map((conv) => {
                  const isActive = conv.id === currentConversationId
                  const isRenaming = conv.id === renamingId

                  return (
                    <div
                      key={conv.id}
                      style={{
                        position: 'relative',
                        marginBottom: '4px'
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          onSelectConversation(conv.id)
                          onClose()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onSelectConversation(conv.id)
                            onClose()
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: isActive ? 'var(--panel-2)' : 'transparent',
                          border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                          borderRadius: '8px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'var(--hover)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent'
                          }
                        }}
                      >
                        {/* Mode Icon */}
                        <span style={{ fontSize: '16px', flexShrink: 0 }}>
                          {modeIcons[conv.mode] || '💬'}
                        </span>

                        {/* Title */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isRenaming ? (
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => handleRenameSubmit(conv.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit(conv.id)
                                if (e.key === 'Escape') {
                                  setRenamingId(null)
                                  setRenameValue('')
                                }
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '100%',
                                padding: '2px 4px',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--accent)',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: 'var(--foreground)'
                              }}
                            />
                          ) : (
                            <>
                              <div style={{
                                fontSize: '13px',
                                fontWeight: 500,
                                color: 'var(--foreground)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {conv.isPinned && (
                                  <Pin size={12} style={{ color: 'var(--accent)' }} />
                                )}
                                {conv.title}
                              </div>
                              <div style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginTop: '2px'
                              }}>
                                {conv.messageCount} messages
                              </div>
                            </>
                          )}
                        </div>

                        {/* Context Menu Button */}
                        {!isRenaming && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setContextMenuId(contextMenuId === conv.id ? null : conv.id)
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '4px',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              flexShrink: 0
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                        )}
                      </div>

                      {/* Context Menu */}
                      {contextMenuId === conv.id && (
                        <div
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '40px',
                            background: 'var(--panel-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                            zIndex: 1000,
                            minWidth: '160px',
                            overflow: 'hidden'
                          }}
                        >
                          <button
                            onClick={() => {
                              onPinConversation(conv.id, !conv.isPinned)
                              setContextMenuId(null)
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--foreground)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--hover)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'none'
                            }}
                          >
                            <Pin size={14} />
                            {conv.isPinned ? 'Unpin' : 'Pin'}
                          </button>

                          <button
                            onClick={() => handleRename(conv.id, conv.title)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--foreground)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--hover)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'none'
                            }}
                          >
                            <Edit2 size={14} />
                            Rename
                          </button>

                          <button
                            onClick={() => {
                              onExportConversation(conv.id, 'markdown')
                              setContextMenuId(null)
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--foreground)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--hover)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'none'
                            }}
                          >
                            <Download size={14} />
                            Export
                          </button>

                          <div style={{
                            height: '1px',
                            background: 'var(--border)',
                            margin: '4px 0'
                          }} />

                          <button
                            onClick={async () => {
                              const confirmed = await showConfirm({
                                title: 'Delete Conversation',
                                message: 'Delete this conversation? This cannot be undone.',
                                confirmLabel: 'Delete',
                                cancelLabel: 'Cancel',
                                confirmVariant: 'danger'
                              })
                              if (confirmed) {
                                onDeleteConversation(conv.id)
                              }
                              setContextMenuId(null)
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: 'var(--error)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--hover)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'none'
                            }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {filteredConversations.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-muted)'
            }}>
              <Clock size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px', margin: 0 }}>
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
              </p>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  )
}
