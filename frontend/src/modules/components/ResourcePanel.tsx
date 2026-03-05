import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Trash2, Copy, ChevronDown, ChevronRight, ChevronLeft, X, FolderOpen, CheckSquare, Square, Check } from 'lucide-react'
import { SidebarPanelHeader } from './SidebarPanelHeader'
import type { GeneratedResource } from '../../electron'

interface ResourcePanelProps {
  onCollapse: () => void
}

type FilterType = 'all' | string

const PAGE_SIZE = 30

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(type: string): boolean {
  return type === 'images'
}

export function ResourcePanel({ onCollapse }: ResourcePanelProps) {
  const [resources, setResources] = useState<GeneratedResource[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [lightboxResource, setLightboxResource] = useState<GeneratedResource | null>(null)
  const [expandedText, setExpandedText] = useState<string | null>(null)
  const [textPreviews, setTextPreviews] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [deleting, setDeleting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const loadResources = useCallback(async () => {
    const api = (window as Window & { electronAPI?: { generated?: { list: () => Promise<{ success: boolean; resources?: GeneratedResource[] }> } } }).electronAPI
    if (!api?.generated?.list) return
    setLoading(true)
    try {
      const result = await api.generated.list()
      if (result.success && result.resources) {
        // Sort newest first
        setResources(result.resources.sort((a, b) => b.modified - a.modified))
      }
    } catch (err) {
      console.error('[ResourcePanel] Failed to load resources:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadResources()
  }, [loadResources])

  // Reset pagination when filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filter])

  const handleDelete = useCallback(async (relativePath: string) => {
    const api = (window as Window & { electronAPI?: { generated?: { delete: (p: string) => Promise<{ success: boolean }> } } }).electronAPI
    if (!api?.generated?.delete) return
    try {
      const result = await api.generated.delete(relativePath)
      if (result.success) {
        setResources(prev => prev.filter(r => r.relativePath !== relativePath))
        setSelected(prev => {
          const next = new Set(prev)
          next.delete(relativePath)
          return next
        })
        if (lightboxResource?.relativePath === relativePath) setLightboxResource(null)
        if (expandedText === relativePath) setExpandedText(null)
      }
    } catch (err) {
      console.error('[ResourcePanel] Failed to delete resource:', err)
    }
  }, [lightboxResource, expandedText])

  const handleDeleteSelected = useCallback(async () => {
    if (selected.size === 0) return
    const api = (window as Window & { electronAPI?: { generated?: { delete: (p: string) => Promise<{ success: boolean }> } } }).electronAPI
    if (!api?.generated?.delete) return

    setDeleting(true)
    const paths = Array.from(selected)
    const deleted: string[] = []
    for (const path of paths) {
      try {
        const result = await api.generated.delete(path)
        if (result.success) deleted.push(path)
      } catch {
        // Continue with remaining
      }
    }
    if (deleted.length > 0) {
      const deletedSet = new Set(deleted)
      setResources(prev => prev.filter(r => !deletedSet.has(r.relativePath)))
      setSelected(new Set())
      if (lightboxResource && deletedSet.has(lightboxResource.relativePath)) {
        setLightboxResource(null)
      }
    }
    setDeleting(false)
  }, [selected, lightboxResource])

  const handleCopy = useCallback(async (resource: GeneratedResource) => {
    const snippet = isImageType(resource.type)
      ? `![generated](${resource.protocolUrl})`
      : resource.protocolUrl
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      // Fallback - ignore
    }
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, resource: GeneratedResource) => {
    const markdown = isImageType(resource.type)
      ? `![generated](${resource.protocolUrl})`
      : resource.protocolUrl

    e.dataTransfer.setData('application/x-prompd-resource', JSON.stringify({
      type: resource.type,
      protocolUrl: resource.protocolUrl,
      fileName: resource.fileName,
      markdown
    }))
    e.dataTransfer.setData('text/plain', markdown)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleOpenFolder = useCallback(async () => {
    const electronAPI = (window as Window & { electronAPI?: { getHomePath: () => Promise<string>; openPath: (p: string) => Promise<{ success: boolean }> } }).electronAPI
    if (!electronAPI?.openPath || !electronAPI?.getHomePath) return
    try {
      const homePath = await electronAPI.getHomePath()
      await electronAPI.openPath(`${homePath}/.prompd/generated`)
    } catch (err) {
      console.error('[ResourcePanel] Failed to open folder:', err)
    }
  }, [])

  const loadTextPreview = useCallback(async (resource: GeneratedResource) => {
    if (textPreviews[resource.relativePath]) return
    const api = (window as Window & { electronAPI?: { readFile: (p: string) => Promise<{ success: boolean; content?: string }> } }).electronAPI
    if (!api?.readFile) return
    try {
      const homePath = await (window as Window & { electronAPI?: { getHomePath: () => Promise<string> } }).electronAPI?.getHomePath?.()
      if (!homePath) return
      const filePath = `${homePath}/.prompd/generated/${resource.relativePath}`
      const result = await api.readFile(filePath)
      if (result.success && result.content) {
        setTextPreviews(prev => ({ ...prev, [resource.relativePath]: result.content!.substring(0, 200) }))
      }
    } catch {
      // Ignore preview load failures
    }
  }, [textPreviews])

  const toggleSelect = useCallback((relativePath: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(relativePath)) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
      }
      return next
    })
  }, [])

  // Derive available types from resources
  const types = Array.from(new Set(resources.map(r => r.type)))
  const filtered = filter === 'all' ? resources : resources.filter(r => r.type === filter)

  // Pagination
  const paginatedImages = useMemo(() => {
    const images = filtered.filter(r => isImageType(r.type))
    return images.slice(0, visibleCount)
  }, [filtered, visibleCount])

  const paginatedText = useMemo(() => {
    const texts = filtered.filter(r => !isImageType(r.type))
    return texts.slice(0, visibleCount)
  }, [filtered, visibleCount])

  const allImages = useMemo(() => filtered.filter(r => isImageType(r.type)), [filtered])
  const totalImages = allImages.length
  const totalText = filtered.filter(r => !isImageType(r.type)).length
  const hasMore = visibleCount < totalImages || visibleCount < totalText

  const allFilteredPaths = useMemo(() => filtered.map(r => r.relativePath), [filtered])
  const allSelected = filtered.length > 0 && allFilteredPaths.every(p => selected.has(p))
  const someSelected = selected.size > 0

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(allFilteredPaths))
  }, [allFilteredPaths])

  const handleSelectNone = useCallback(() => {
    setSelected(new Set())
  }, [])

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      setVisibleCount(prev => prev + PAGE_SIZE)
    }
  }, [hasMore])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SidebarPanelHeader title="Resources" onCollapse={onCollapse}>
        <button
          onClick={handleOpenFolder}
          title="Open resources folder"
          style={{
            background: 'none',
            border: 'none',
            borderRadius: '4px',
            padding: '4px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)'; e.currentTarget.style.color = 'var(--foreground)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <FolderOpen size={14} />
        </button>
        <button
          onClick={loadResources}
          title="Refresh"
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            borderRadius: '4px',
            padding: '4px',
            cursor: loading ? 'default' : 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            opacity: loading ? 0.5 : 1
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--panel-2)'; e.currentTarget.style.color = 'var(--foreground)' } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </SidebarPanelHeader>

      {/* Filter tabs */}
      {types.length > 1 && (
        <div style={{
          display: 'flex',
          gap: '2px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap'
        }}>
          <FilterTab label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={resources.length} />
          {types.map(t => (
            <FilterTab
              key={t}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              active={filter === t}
              onClick={() => setFilter(t)}
              count={resources.filter(r => r.type === t).length}
            />
          ))}
        </div>
      )}

      {/* Selection toolbar - shows when resources exist */}
      {filtered.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}>
          <button
            onClick={allSelected ? handleSelectNone : handleSelectAll}
            title={allSelected ? 'Deselect all' : 'Select all'}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: someSelected ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
          </button>
          {someSelected ? (
            <>
              <span>{selected.size} selected</span>
              <span style={{ color: 'var(--border)' }}>|</span>
              <button
                onClick={handleSelectAll}
                style={linkButtonStyle}
              >
                All
              </button>
              <button
                onClick={handleSelectNone}
                style={linkButtonStyle}
              >
                None
              </button>
              <span style={{ flex: 1 }} />
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                title={`Delete ${selected.size} selected`}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px 4px',
                  cursor: deleting ? 'default' : 'pointer',
                  color: 'var(--error, #e55)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11px',
                  opacity: deleting ? 0.5 : 1
                }}
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          ) : (
            <span>{filtered.length} {filtered.length === 1 ? 'resource' : 'resources'}</span>
          )}
        </div>
      )}

      {/* Resource list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto', padding: '4px' }}
      >
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: '12px',
            textAlign: 'center',
            padding: '20px'
          }}>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>No generated resources yet</div>
            <div>Resources created by LLM responses (images, text) will appear here. Drag them into your editor to use.</div>
          </div>
        ) : (
          <>
            {/* Image grid */}
            {paginatedImages.length > 0 && (
              <ResourceSection title="Images" count={totalImages} defaultOpen>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '4px'
                }}>
                  {paginatedImages.map(resource => (
                    <ImageResource
                      key={resource.relativePath}
                      resource={resource}
                      isSelected={selected.has(resource.relativePath)}
                      onToggleSelect={() => toggleSelect(resource.relativePath)}
                      onOpenLightbox={() => setLightboxResource(resource)}
                      onDelete={() => handleDelete(resource.relativePath)}
                      onCopy={() => handleCopy(resource)}
                      onDragStart={(e) => handleDragStart(e, resource)}
                    />
                  ))}
                </div>
              </ResourceSection>
            )}

            {/* Text/other resources list */}
            {paginatedText.length > 0 && (
              <ResourceSection title="Text" count={totalText} defaultOpen>
                {paginatedText.map(resource => (
                  <TextResource
                    key={resource.relativePath}
                    resource={resource}
                    isSelected={selected.has(resource.relativePath)}
                    onToggleSelect={() => toggleSelect(resource.relativePath)}
                    expanded={expandedText === resource.relativePath}
                    preview={textPreviews[resource.relativePath]}
                    onToggleExpand={() => {
                      const next = expandedText === resource.relativePath ? null : resource.relativePath
                      setExpandedText(next)
                      if (next) loadTextPreview(resource)
                    }}
                    onDelete={() => handleDelete(resource.relativePath)}
                    onCopy={() => handleCopy(resource)}
                    onDragStart={(e) => handleDragStart(e, resource)}
                  />
                ))}
              </ResourceSection>
            )}

            {/* Load more indicator */}
            {hasMore && (
              <div style={{
                textAlign: 'center',
                padding: '8px',
                fontSize: '11px',
                color: 'var(--text-muted)'
              }}>
                Scroll for more...
              </div>
            )}
          </>
        )}
      </div>

      {/* Image lightbox */}
      {lightboxResource && createPortal(
        <ImageLightbox
          resource={lightboxResource}
          allImages={allImages}
          onNavigate={setLightboxResource}
          onClose={() => setLightboxResource(null)}
          onCopy={() => handleCopy(lightboxResource)}
          onDelete={() => {
            handleDelete(lightboxResource.relativePath)
            setLightboxResource(null)
          }}
        />,
        document.body
      )}
    </div>
  )
}

// --- Shared styles ---

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 2px',
  cursor: 'pointer',
  color: 'var(--accent)',
  fontSize: '11px',
  textDecoration: 'underline'
}

// --- Sub-components ---

function FilterTab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : 'none',
        color: active ? '#fff' : 'var(--text-muted)',
        border: 'none',
        borderRadius: '3px',
        padding: '2px 8px',
        fontSize: '11px',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>({count})</span>
    </button>
  )
}

function ResourceSection({ title, count, defaultOpen, children }: { title: string; count: number; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: '8px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          color: 'var(--foreground)',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          padding: '4px 4px',
          width: '100%',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none' }}>({count})</span>
      </button>
      {open && children}
    </div>
  )
}

function ImageResource({
  resource,
  isSelected,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onCopy,
  onDragStart
}: {
  resource: GeneratedResource
  isSelected: boolean
  onToggleSelect: () => void
  onOpenLightbox: () => void
  onDelete: () => void
  onCopy: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart(e)
    if (imgRef.current) {
      e.dataTransfer.setDragImage(imgRef.current, 20, 20)
    }
  }

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={onOpenLightbox}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          borderRadius: '4px',
          overflow: 'hidden',
          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer',
          aspectRatio: '1',
          background: 'var(--panel-2)'
        }}
      >
        <img
          ref={imgRef}
          src={resource.protocolUrl}
          alt={resource.fileName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
        {/* Selection checkbox - always visible when selected, on hover otherwise */}
        {(hovered || isSelected) && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
            style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              background: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '3px',
              padding: '1px',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {isSelected ? <Check size={10} /> : <Square size={10} style={{ opacity: 0.7 }} />}
          </button>
        )}
        {hovered && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            display: 'flex',
            gap: '2px',
            padding: '2px',
            background: 'rgba(0,0,0,0.6)',
            borderBottomLeftRadius: '4px'
          }}>
            <IconButton icon={<Copy size={12} />} title="Copy markdown" onClick={(e) => { e.stopPropagation(); onCopy() }} />
            <IconButton icon={<Trash2 size={12} />} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete() }} />
          </div>
        )}
        {hovered && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '2px 4px',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: '9px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {formatBytes(resource.size)}
          </div>
        )}
      </div>
    </div>
  )
}

function ImageLightbox({
  resource,
  allImages,
  onNavigate,
  onClose,
  onCopy,
  onDelete
}: {
  resource: GeneratedResource
  allImages: GeneratedResource[]
  onNavigate: (resource: GeneratedResource) => void
  onClose: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const currentIndex = allImages.findIndex(r => r.relativePath === resource.relativePath)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < allImages.length - 1

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(allImages[currentIndex - 1])
  }, [hasPrev, currentIndex, allImages, onNavigate])

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(allImages[currentIndex + 1])
  }, [hasNext, currentIndex, allImages, onNavigate])

  // Keyboard: Escape to close, Arrow keys to navigate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goPrev, goNext])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out'
      }}
    >
      {/* Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '52px',
          right: '16px',
          display: 'flex',
          gap: '8px',
          zIndex: 1
        }}
      >
        <LightboxButton icon={<Copy size={16} />} title="Copy markdown" onClick={onCopy} />
        <LightboxButton icon={<Trash2 size={16} />} title="Delete" onClick={onDelete} />
        <LightboxButton icon={<X size={16} />} title="Close (Esc)" onClick={onClose} />
      </div>

      {/* Prev button */}
      {hasPrev && (
        <LightboxNavButton
          side="left"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
        />
      )}

      {/* Next button */}
      {hasNext && (
        <LightboxNavButton
          side="right"
          onClick={(e) => { e.stopPropagation(); goNext() }}
        />
      )}

      {/* File info */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '13px',
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        {resource.fileName} &middot; {formatBytes(resource.size)}
        {allImages.length > 1 && (
          <span style={{ marginLeft: '8px' }}>
            ({currentIndex + 1} / {allImages.length})
          </span>
        )}
      </div>

      {/* Image */}
      <img
        onClick={(e) => e.stopPropagation()}
        src={resource.protocolUrl}
        alt={resource.fileName}
        style={{
          maxWidth: '90vw',
          maxHeight: '85vh',
          objectFit: 'contain',
          borderRadius: '4px',
          cursor: 'default',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
      />
    </div>
  )
}

function LightboxNavButton({
  side,
  onClick
}: {
  side: 'left' | 'right'
  onClick: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  const isLeft = side === 'left'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isLeft ? 'Previous' : 'Next'}
      style={{
        position: 'absolute',
        [side]: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '40px',
        height: '64px',
        background: hovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
        border: `1px solid rgba(255, 255, 255, ${hovered ? 0.3 : 0.2})`,
        borderRadius: '8px',
        cursor: 'pointer',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: hovered ? 1 : 0.3,
        transition: 'opacity 0.2s, background 0.15s, border-color 0.15s',
        zIndex: 2
      }}
    >
      {isLeft ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  )
}

function LightboxButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '6px',
        padding: '8px',
        cursor: 'pointer',
        color: 'rgba(255, 255, 255, 0.8)',
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.15s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
        e.currentTarget.style.color = '#fff'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
      }}
    >
      {icon}
    </button>
  )
}

function TextResource({
  resource,
  isSelected,
  onToggleSelect,
  expanded,
  preview,
  onToggleExpand,
  onDelete,
  onCopy,
  onDragStart
}: {
  resource: GeneratedResource
  isSelected: boolean
  onToggleSelect: () => void
  expanded: boolean
  preview?: string
  onToggleExpand: () => void
  onDelete: () => void
  onCopy: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 8px',
        borderRadius: '4px',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        marginBottom: '4px',
        cursor: 'grab',
        background: hovered ? 'var(--panel-2)' : 'transparent'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
            style={{
              background: 'none',
              border: 'none',
              padding: '1px',
              cursor: 'pointer',
              color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0
            }}
          >
            {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
          </button>
          <div
            onClick={onToggleExpand}
            style={{
              flex: 1,
              minWidth: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span style={{
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--foreground)'
            }}>
              {resource.fileName}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
              {formatBytes(resource.size)}
            </span>
          </div>
        </div>
        {hovered && (
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <IconButton icon={<Copy size={12} />} title="Copy path" onClick={(e) => { e.stopPropagation(); onCopy() }} />
            <IconButton icon={<Trash2 size={12} />} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete() }} />
          </div>
        )}
      </div>
      {expanded && preview && (
        <div style={{
          marginTop: '4px',
          padding: '4px 6px',
          background: 'var(--panel-1)',
          borderRadius: '3px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '120px',
          overflow: 'auto'
        }}>
          {preview}
        </div>
      )}
    </div>
  )
}

function IconButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        padding: '2px',
        cursor: 'pointer',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        borderRadius: '2px'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
    </button>
  )
}
